import { verifyEvidence, normalize } from "../verify";
import { detectAndClassify } from "./urls";
import { detectDuplicates, type DedupItem } from "./dedup";
import { classifyBulletText, classifyProjectShape, linkedInSkillLines, normalizeLine } from "./classify";
import { normalizeDateRange } from "./dates";
import type { Extractor, ResumenLectura } from "./llm";
import type { ConsumoIA } from "../db/telemetria";
import type { GithubFetcher } from "./github";
import type { StagedRow, ImportResult, EvidenceLevel } from "./types";

/**
 * El orquestador de "pega lo que tengas" (prompt §3). Todo lo externo es
 * INYECTABLE (extract, fetchGithub, fetchWeb) → el pipeline se prueba entero,
 * de forma determinista, sin LLM ni red.
 *
 * Flujo: detectar URLs → GitHub (dato duro, sin IA) · web (Jina) · LinkedIn
 * (honesto, no legible) → armar raw_text → extraer troceado → VERIFICAR la
 * evidencia de cada item contra raw_text → staged. Nada entra al master aquí:
 * esto solo puebla el staging (§4.1).
 */

export interface ImportInput {
  pastedText: string;
  /** archivos ya convertidos a texto (raw_text por fuente), con su etiqueta */
  files?: { label: string; text: string }[];
}

export interface ImportDeps {
  extract: Extractor;
  fetchGithubUser?: GithubFetcher;
  /** web → markdown (Jina). Devuelve "" si no se pudo leer. */
  fetchWeb?: (url: string) => Promise<string>;
}

/**
 * ImportResult + los avisos honestos de la LECTURA (p. ej. "el documento era tan
 * largo que se leyeron 8 de 12 partes"). Van aquí, y no dentro de ImportResult,
 * para no tocar el contrato compartido de types.ts; las rutas los reenvían a la
 * UI junto a los avisos por archivo. Un aviso que no llega al usuario es lo
 * mismo que no avisar.
 */
export interface ImportOutcome extends ImportResult {
  warnings: string[];
  /**
   * Consumo real de IA de esta ingesta (tokens leídos de `usage`), si el
   * extractor lo mide. Un extractor falso (los tests) no mide y esto es
   * undefined: opcional para no romper el contrato inyectable, que es lo que
   * permite probar el pipeline entero sin LLM.
   */
  consumo?: ConsumoIA;
  /** Cómo se repartió el documento, incluidas las secciones tratadas como
   *  contexto CON SU NOMBRE. La ruta las sube a la UI: nada se calla. */
  lectura?: ResumenLectura;
}

let seq = 0;
const key = (p: string) => `${p}-${++seq}`;

const verified = (level: EvidenceLevel) => level === "verified" || level === "api";

/**
 * Anota las fechas normalizadas en `data`, o admite honestamente que faltan (§C2).
 * Estas señales van SIN prefijo `_` a propósito: deben SOBREVIVIR al master
 * (dateMissing/dateInvalid son honestidad hacia el usuario, no metadato interno;
 * persistImport solo limpia las claves con `_`). Nunca se inventa lo ausente.
 */
function applyDates(data: Record<string, unknown>, rawDates: string): void {
  const dr = normalizeDateRange(rawDates);
  if (dr.invalid) {
    data.dateInvalid = dr.invalid; // el texto ORIGINAL; lo arregla un humano
    return;
  }
  if (dr.start || dr.end || dr.current) {
    if (dr.start) data.dateStart = dr.start;
    if (dr.end) data.dateEnd = dr.end;
    if (dr.current) data.dateCurrent = true;
    return;
  }
  data.dateMissing = true;
}

export async function runImport(input: ImportInput, deps: ImportDeps): Promise<ImportOutcome> {
  const detected = detectAndClassify(input.pastedText);
  const sources: string[] = [];
  const staged: StagedRow[] = [];
  const linkedin: { url: string; slug?: string }[] = [];

  let raw = input.pastedText.trim();
  if (raw) sources.push("texto pegado");

  // archivos (PDF/DOCX/transcripción de imagen) → al raw_text, etiquetados
  for (const f of input.files ?? []) {
    if (!f.text.trim()) continue;
    raw += `\n\n[${f.label}]\n${f.text}`;
    sources.push(f.label);
  }

  // URLs, cada una por su ruta
  for (const u of detected) {
    if (u.kind === "github-profile" || u.kind === "github-repo") {
      if (!deps.fetchGithubUser || !u.handle) continue;
      const { staged: gh } = await deps.fetchGithubUser(u.handle);
      staged.push(...gh); // dato duro; su texto NO va al raw_text (evita re-extracción)
      sources.push(`GitHub · @${u.handle}`);
    } else if (u.kind === "linkedin") {
      linkedin.push({ url: u.url, slug: u.handle }); // no legible desde el servidor
    } else if (u.kind === "web" && deps.fetchWeb) {
      const md = await deps.fetchWeb(u.url);
      if (md.trim()) {
        // hasta 12k: da aire al JSON-LD + crawl de secciones internas (§C4).
        raw += `\n\n[${u.handle} — portfolio]\n${md.slice(0, 12000)}`;
        sources.push(u.handle ?? u.url);
      }
    }
  }

  // Extracción troceada (inyectada). Nada de esto es dato duro: se verifica.
  const ex = await deps.extract(raw);
  const check = (evidence: string): EvidenceLevel => verifyEvidence(raw, evidence);
  // El raw_text normalizado UNA vez: lo comparten basics y las aptitudes. Con un
  // dossier grande, normalizarlo por item era rehacer el mismo trabajo 150 veces.
  const rawNorm = normalize(raw);

  // basics — verificado si el nombre y algún contacto aparecen literal en la fuente
  const b = ex.basics;
  if (b.name || b.email || b.phone) {
    const nameIn = b.name ? rawNorm.includes(normalize(b.name)) : false;
    const contactIn = [b.email, b.phone].some((c) => c && rawNorm.includes(normalize(c)));
    const level: EvidenceLevel = nameIn && contactIn ? "verified" : nameIn || contactIn ? "partial" : "none";
    staged.push({
      key: key("basics"), kind: "basics",
      data: { name: b.name, label: b.label, email: b.email, phone: b.phone, location: b.location, links: b.links },
      lang: "es", origin: "extracted", sourceLabel: "texto pegado",
      evidenceSnippet: [b.name, b.email, b.phone].filter(Boolean).join(" · ") || null,
      evidenceLevel: level, evidenceVerified: verified(level),
    });
  }

  if (b.summary) {
    const level = check(b.summaryEvidence);
    staged.push({
      key: key("summary"), kind: "summary",
      data: { text: b.summary }, lang: "es", origin: "extracted", sourceLabel: "texto pegado",
      evidenceSnippet: b.summaryEvidence || null, evidenceLevel: level, evidenceVerified: verified(level),
    });
  }

  // Red de seguridad §C5: líneas que en el origen cuelgan de «Aptitudes/Skills»
  // (típico de capturas de LinkedIn) son habilidades, jamás viñetas de logro.
  const skillLines = linkedInSkillLines(raw);

  for (const w of ex.work) {
    const wk = key("work");
    const level = check(w.evidence);
    const workData: Record<string, unknown> = { title: w.title, company: w.company, location: w.location, dates: w.dates };
    applyDates(workData, w.dates);
    staged.push({
      key: wk, kind: "work", data: workData,
      lang: "es", origin: "extracted", sourceLabel: "texto pegado",
      evidenceSnippet: w.evidence || null, evidenceLevel: level, evidenceVerified: verified(level),
    });

    const roleLabel = w.title || w.company || "";
    for (const bl of w.bullets) {
      const bLevel = check(bl.evidence);
      // §C1 · clasificar ANTES de stagear: ¿viñeta, habilidad o duda?
      let cls = classifyBulletText(bl.text);
      if (cls.kind !== "skill" && skillLines.has(normalizeLine(bl.text))) {
        cls = { kind: "skill", reason: "aparece bajo «Aptitudes/Skills» en el origen" };
      }

      if (cls.kind === "skill") {
        // se convierte en habilidad stageada, con su MISMA evidencia y sourceLabel.
        // sourceContext (§C3) conserva de qué rol salió — honesto, sobrevive al master.
        staged.push({
          key: key("skill"), kind: "skill",
          data: { group: "Herramientas", items: bl.text, sourceContext: roleLabel, _classFrom: "bullet" },
          lang: "es", origin: "extracted", sourceLabel: "texto pegado",
          evidenceSnippet: bl.evidence || null, evidenceLevel: bLevel, evidenceVerified: verified(bLevel),
        });
        continue;
      }

      const bData: Record<string, unknown> = { text: bl.text };
      if (cls.kind === "doubt") {
        // se stagea COMO VIÑETA pero con la duda VISIBLE — no se adivina en silencio.
        // `_` = metadato de staging: se resuelve antes de promover, no viaja al master.
        bData._classDoubt = "skill";
        bData._classReason = cls.reason;
      }
      staged.push({
        key: key("bullet"), parentKey: wk, kind: "bullet",
        data: bData, lang: "es", origin: "extracted", sourceLabel: "texto pegado",
        evidenceSnippet: bl.evidence || null, evidenceLevel: bLevel, evidenceVerified: verified(bLevel),
      });
    }
  }

  for (const e of ex.education) {
    const level = check(e.evidence);
    staged.push({
      key: key("edu"), kind: "education",
      data: { degree: e.degree, institution: e.institution, location: e.location, dates: e.dates },
      lang: "es", origin: "extracted", sourceLabel: "texto pegado",
      evidenceSnippet: e.evidence || null, evidenceLevel: level, evidenceVerified: verified(level),
    });
  }

  // skills — verificación POR ITEM: una aptitud está respaldada si aparece literal.
  for (const s of ex.skills) {
    const items = s.items.split(",").map((x) => x.trim()).filter(Boolean);
    if (!items.length) continue;
    const present = items.filter((i) => rawNorm.includes(normalize(i)));
    const level: EvidenceLevel =
      present.length === items.length ? "verified" : present.length >= Math.ceil(items.length / 2) ? "partial" : "none";
    staged.push({
      key: key("skill"), kind: "skill",
      data: { group: s.group, items: s.items }, lang: "es", origin: "extracted", sourceLabel: "texto pegado",
      evidenceSnippet: present.length ? `En la fuente: ${present.join(", ")}` : null,
      evidenceLevel: level, evidenceVerified: verified(level),
    });
  }

  // projects — los que ya vinieron por la API de GitHub no se repiten
  const apiProjects = new Set(
    staged.filter((r) => r.kind === "project" && r.origin === "api").map((r) => normalize(String(r.data.name ?? ""))),
  );
  for (const p of ex.projects) {
    if (p.name && apiProjects.has(normalize(p.name))) continue;
    const level = check(p.evidence);
    const projData: Record<string, unknown> = { name: p.name, url: p.url, description: p.description, dates: p.dates };
    applyDates(projData, p.dates);
    // §A1 · doce GRUPOS DE APTITUDES se colaron como proyectos en el volcado real
    // («Desarrollo Web y Backend: Next.js, React, …»). Se marca la duda y punto:
    // MISMO patrón que `_classDoubt` de las viñetas — el sistema no reclasifica
    // solo, lo resuelve el usuario. `_` = metadato de staging, no viaja al master.
    const forma = classifyProjectShape(p.name, p.description);
    if (forma.kind === "skill-group") {
      projData._classDoubt = "skill";
      projData._classReason = forma.reason;
    }
    staged.push({
      key: key("proj"), kind: "project", data: projData,
      lang: "es", origin: "extracted", sourceLabel: "texto pegado",
      evidenceSnippet: p.evidence || null, evidenceLevel: level, evidenceVerified: verified(level),
    });
  }

  /* ── Sospecha de duplicado (§4.5 · §A1) ─────────────────────────────────────
     Se PROPONE, jamás se fusiona: el segundo item queda marcado apuntando al
     primero, con nivel, señales y motivo, y decide el usuario.

     Se compara work, project Y skill: los tres tenían duplicados reales en el
     volcado. El texto que se le pasa al detector es TODO el contenido del item
     (incluidas las viñetas de un rol): es ahí donde vive la identidad del hecho
     cuando el título y la empresa no coinciden.

     `sourceId` (n3) solo se rellena si el import trae MÁS DE UNA fuente. Con una
     sola, «vienen del mismo documento» es cierto para todos los pares y por tanto
     no distingue nada: subir la sospecha con eso sería inflarla a ciegas.        */
  const multiFuente = new Set(sources).size > 1;
  // las viñetas se indexan por rol UNA vez: un dossier de 104 KB trae 150 items y
  // volver a barrer `staged` por cada rol es trabajo cuadrático justo en el caso
  // que motivó todo esto.
  const bulletsPorRol = new Map<string, string[]>();
  for (const r of staged) {
    if (r.kind !== "bullet" || !r.parentKey) continue;
    const lista = bulletsPorRol.get(r.parentKey);
    const texto = String(r.data.text ?? "");
    if (lista) lista.push(texto);
    else bulletsPorRol.set(r.parentKey, [texto]);
  }
  const bulletsDe = (parentKey: string) => (bulletsPorRol.get(parentKey) ?? []).join(" · ");

  const candidatos: DedupItem[] = staged
    .filter((r) => r.kind === "work" || r.kind === "project" || r.kind === "skill")
    .map((r) => {
      const d = r.data;
      const base = { key: r.key, kind: r.kind, sourceId: multiFuente ? r.sourceLabel : undefined };
      if (r.kind === "work") {
        return {
          ...base,
          title: String(d.title ?? ""),
          company: String(d.company ?? ""),
          dates: String(d.dates ?? ""),
          text: [r.evidenceSnippet ?? "", bulletsDe(r.key)].filter(Boolean).join(" · "),
        };
      }
      if (r.kind === "project") {
        return {
          ...base,
          title: String(d.name ?? ""),
          dates: String(d.dates ?? ""),
          text: [String(d.description ?? ""), r.evidenceSnippet ?? ""].filter(Boolean).join(" · "),
        };
      }
      return { ...base, title: String(d.group ?? ""), text: String(d.items ?? "") };
    });

  const porKey = new Map(staged.map((r) => [r.key, r] as const));
  for (const s of detectDuplicates(candidatos)) {
    const row = porKey.get(s.bKey);
    if (!row || row.duplicate) continue; // ya tiene una sospecha más fuerte (van ordenadas)
    row.duplicate = { otherKey: s.aKey, level: s.level, signals: s.signals, reason: s.reason };
  }

  const counts = {
    verified: staged.filter((r) => r.evidenceLevel === "verified").length,
    partial: staged.filter((r) => r.evidenceLevel === "partial").length,
    none: staged.filter((r) => r.evidenceLevel === "none").length,
    api: staged.filter((r) => r.evidenceLevel === "api").length,
    total: staged.length,
  };

  return {
    rawText: raw, sources, staged, linkedin, counts,
    warnings: ex.warnings ?? [],
    consumo: ex.consumo,
    lectura: ex.lectura,
  };
}
