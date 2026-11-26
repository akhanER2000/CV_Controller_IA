/**
 * AUDITORÍA DEL CATÁLOGO DE PLANTILLAS (plantillas-catalogo).
 *
 *   npx vitest run --config scripts/plantillas/vitest.config.ts
 *   AUDIT_ONLY=ats-clasica,ats-oro-viejo npx vitest run --config …   (solo esas)
 *
 * Renderiza CADA plantilla con dos perfiles (corto y largo) y a 1, 2 y 3 páginas
 * con el autofit de producción (autofit.ts, el mismo de /api/cv), y comprueba:
 *   · round-trip ATS — cada línea del texto plano, EN ORDEN, en el PDF re-parseado
 *     (la gama visual está exenta por contrato: se anota, no se exige);
 *   · medida de línea — p90 ≤ 90, mediana ≤ 75, máx ≤ 110 (los de medida-linea);
 *   · contraste AA — acento, tinta y apagado sobre el papel;
 *   · autofit ≥ 10 pt — el cuerpo elegido nunca baja del suelo;
 *   · nada se sale — ningún item de texto fuera de la página, y TODAS las viñetas
 *     del perfil largo (incluido un rol más largo que una página, que va en un
 *     bloque wrap={false}) aparecen en el PDF.
 * Escribe la tabla con miniaturas en prompts/lotes-fable5/_diseno/plantillas/.
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import { autofit } from "../../src/lib/cv/autofit";
import { lineasDe } from "../../src/lib/cv/medir";
import { contrastRatio } from "../../src/lib/cv/contrast";
import { toPlainText, type ResumeData } from "../../src/lib/cv/resume";
import { CUERPO_MIN_PT, getTemplate, listTemplates, paperOf, type CvTemplate } from "../../src/lib/cv/templates";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "prompts/lotes-fable5/_diseno/plantillas");
const THUMBS = path.join(OUT, "miniaturas");
const base = JSON.parse(
  readFileSync(path.join(ROOT, "src/lib/cv/fixtures/datos-ejemplo.json"), "utf8"),
) as ResumeData;

const norm = (x: string) => x.replace(/\s+/g, " ").trim();
const pct = (arr: number[], p: number) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]!;
};

// ── Perfiles ──────────────────────────────────────────────────────────────────
const clon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function perfilCorto(): ResumeData {
  const d = clon(base);
  d.work = d.work.slice(0, 2).map((w) => ({ ...w, bullets: w.bullets.slice(0, 2) }));
  d.projects = [];
  return d;
}

function perfilLargo(): ResumeData {
  const d = clon(base);
  const extra = [1].flatMap((n) =>
    base.work.map((w) => ({
      ...clon(w),
      company: `${w.company} (etapa ${n})`,
      bullets: w.bullets.map((b) => ({ ...b, es: `${b.es} Etapa ${n}.`, en: `${b.en} Stage ${n}.` })),
    })),
  );
  // El rol más largo que una página: 56 viñetas de una línea en UNA entrada
  // (wrap={false}) — ~56 × 13 pt > los ~680 pt de caja útil de una LETTER.
  const monstruo = {
    ...clon(base.work[0]!),
    company: "Corporación Rol Extenso SpA",
    title: { es: "Jefe de Plataforma de Pagos", en: "Head of Payments Platform" },
    bullets: Array.from({ length: 56 }, (_, i) => ({
      p1: true,
      es: `Hito ${String(i + 1).padStart(2, "0")}: migré el módulo ${i + 1} sin cortes de servicio.`,
      en: `Milestone ${i + 1}: led the migration of module ${i + 1} with load tests and zero downtime.`,
    })),
  };
  d.work = [monstruo, ...d.work, ...extra];
  return d;
}

/** Entre medias: el fixture entero más una etapa repetida (~2,5 páginas). Es el
 *  que obliga al autofit a ENCOGER el cuerpo para caber en 2 o 3 páginas. */
function perfilMedio(): ResumeData {
  const d = clon(base);
  d.work = [...d.work, ...base.work.slice(0, 2).map((w) => ({ ...clon(w), company: `${w.company} (etapa previa)` }))];
  return d;
}

const PERFILES = { corto: perfilCorto(), medio: perfilMedio(), largo: perfilLargo() } as const;
type PerfilId = keyof typeof PERFILES;

// ── Comprobaciones sobre un PDF ───────────────────────────────────────────────
interface Fuera {
  items: number;
  maxDerecha: number;
  /** Pares de items de la MISMA línea que se pisan (> 2 pt): texto encima de texto. */
  solapes: number;
  /** Los primeros casos, para poder arreglarlos sin volver a medir. */
  muestra: string[];
}
async function fueraDePagina(buf: Uint8Array): Promise<Fuera> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  let items = 0;
  let maxDerecha = 0;
  let solapes = 0;
  const muestra: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const [, , W, H] = page.view as [number, number, number, number];
    const tc = await page.getTextContent();
    const vivos = (tc.items as Array<{ str: string; transform: number[]; width: number }>).filter((i) => i.str?.trim());
    for (let a = 0; a < vivos.length; a++) {
      for (let b = a + 1; b < vivos.length; b++) {
        const [A, B] = [vivos[a]!, vivos[b]!];
        if (Math.abs(A.transform[5]! - B.transform[5]!) > 3) continue;
        const ini = Math.max(A.transform[4]!, B.transform[4]!);
        const fin = Math.min(A.transform[4]! + A.width, B.transform[4]! + B.width);
        if (fin - ini > 2) {
          solapes++;
          if (muestra.length < 4) muestra.push(`p${p} solape «${A.str.slice(0, 40)}» × «${B.str.slice(0, 40)}» (${(fin - ini).toFixed(1)} pt)`);
        }
      }
    }
    for (const it of tc.items as Array<{ str: string; transform: number[]; width: number }>) {
      if (!it.str?.trim()) continue;
      const x = it.transform[4]!;
      const y = it.transform[5]!;
      const der = x + it.width;
      maxDerecha = Math.max(maxDerecha, der / W);
      // Fuera = el texto pisa el canto (menos de ~5 mm) o cae fuera de la hoja.
      if (x < 14 || der > W - 14 || y < 14 || y > H - 8) {
        items++;
        if (muestra.length < 4) muestra.push(`p${p} canto «${it.str.slice(0, 40)}» x=${x.toFixed(0)} der=${der.toFixed(0)} y=${y.toFixed(0)}`);
      }
    }
  }
  return { items, maxDerecha, solapes, muestra };
}

async function texto(buf: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return norm(text);
}

function enOrden(txt: string, rayosX: string): string | null {
  let cursor = 0;
  for (const line of rayosX.split("\n").map(norm).filter(Boolean)) {
    const idx = txt.indexOf(line, cursor);
    if (idx < 0) return `${line}  ⟵ tras: «${txt.slice(Math.max(0, cursor - 60), cursor)}» ⟶ «${txt.slice(cursor, cursor + 200)}»`;
    cursor = idx + line.length;
  }
  return null;
}

async function miniatura(buf: Uint8Array, file: string): Promise<void> {
  // El pdf.js de unpdf (el mismo que mide): uno solo por proceso, o el worker y la
  // API de dos versiones distintas chocan.
  const png = await renderPageAsImage(new Uint8Array(buf), 1, {
    canvasImport: () => import("@napi-rs/canvas"),
    scale: 0.42,
  });
  writeFileSync(file, Buffer.from(png));
}

// ── Lo que la primera pasada encontró y se arregló (plantillas-catalogo) ──────
const NOTAS = [
  "## Qué falló en la primera pasada y cómo se arregló",
  "",
  "Primera pasada: 37 de 65 pasaban. Los fallos eran del MOTOR, no de las plantillas (salvo una):",
  "",
  "1. **Rol más largo que una página (27 plantillas).** Una entrada en `wrap={false}` más alta que la página hacía que @react-pdf encogiera toda la página 1: cabecera, habilidades y viñetas montadas unas sobre otras. Arreglo en `ResumePDF.entrada()`: si la entrada no cabe en el 75 % de la caja (estimación a la baja), se deja partir por las viñetas y su encabezado pide ~3 líneas detrás (`minPresenceAhead`) para no quedar huérfano. Las entradas normales siguen sin partirse.",
  "2. **El CV de uno rompía el del siguiente.** fontkit cachea la «O» sin carácter al subsetear la «Ó» (componente de un glifo compuesto); el siguiente PDF del proceso escribía «PROYECTOS» con ToUnicode vacío y el parser leía «PR3YECT3S». En /api/cv con la lambda caliente pasa entre usuarios. Arreglo: `calentarFuentes()` precarga cada glifo con su carácter antes del primer render (sin las ligaduras de compatibilidad, que partían «C|atólica»). Test: `tests/plantillas-catalogo.test.ts`.",
  "3. **Cargo largo con fechas a la derecha.** El cargo se medía a su ancho natural y se montaba 10 pt sobre la fecha («(etapa 1)ene 2020» al re-parsear). Arreglo: cargo con `flexBasis: 0` y fecha sin encoger (+ espacio duro delante de la fecha).",
  "4. **Registro** (la única de plantilla): mediana de 76 caracteres con un perfil corto. Margen horizontal 34 → 38 mm; mediana 74.",
  "",
  "Fuentes nuevas (OFL, google/fonts, .ttf estáticos): IBM Plex Serif 400/500/600/700/500i, Spectral 500/600/500i, Crimson Text 600/700 = 1,9 MB; `src/lib/fonts/` pasa de 1,1 a 3,0 MB.",
];

// ── El recorrido ──────────────────────────────────────────────────────────────
interface Caso {
  perfil: PerfilId;
  objetivo: 1 | 2 | 3;
  cuerpo: number;
  noCabe: boolean;
  paginas: number;
  roundTrip: string | null; // null = pasa; si no, la primera línea que falta
  p90: number;
  mediana: number;
  max: number;
  fuera: number;
  fueraMuestra: string[];
  faltanVinetas: number;
}
interface Fila {
  tpl: CvTemplate;
  casos: Caso[];
  contraste: { acento: number; tinta: number; apagado: number };
  fallos: string[];
}

const SOLO = (process.env.AUDIT_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const PLANTILLAS = listTemplates().filter((t) => !SOLO.length || SOLO.includes(t.id));

describe("auditoría del catálogo de plantillas", () => {
  it("renderiza, mide y escribe auditoria.md", async () => {
    mkdirSync(THUMBS, { recursive: true });
    const filas: Fila[] = [];
    const t0 = Date.now();
    for (const tpl of PLANTILLAS) {
      const casos: Caso[] = [];
      const fallos: string[] = [];
      const pal = tpl.palette;
      const contraste = {
        acento: contrastRatio(pal.accent, paperOf(pal)),
        tinta: contrastRatio(pal.ink, paperOf(pal)),
        apagado: contrastRatio(pal.muted, paperOf(pal)),
      };
      if (contraste.acento < 4.5 || contraste.tinta < 7 || contraste.apagado < 4.5) fallos.push("contraste");

      const soloPerfil = process.env.AUDIT_PERFIL;
      for (const perfil of (Object.keys(PERFILES) as PerfilId[]).filter((p) => !soloPerfil || p === soloPerfil)) {
        const data = { ...PERFILES[perfil], templateId: tpl.id };
        const rayosX = toPlainText(data, { locale: "es", onePage: false });
        const vinetas = data.work.flatMap((w) => w.bullets.map((b) => norm(b.es)));
        const objs = (process.env.AUDIT_OBJ ?? "1,2,3").split(",").map(Number) as Array<1 | 2 | 3>;
        for (const objetivo of objs) {
          const r = await autofit(data, getTemplate(tpl.id), objetivo, { locale: "es", onePage: false });
          const txt = await texto(r.buf);
          const largos = (await lineasDe(r.buf)).map((l) => l.length).filter((n) => n >= 30);
          const fuera = await fueraDePagina(r.buf);
          const caso: Caso = {
            perfil,
            objetivo,
            cuerpo: r.bodySize,
            noCabe: r.noCabe,
            paginas: r.medida.porPagina.length,
            roundTrip: enOrden(txt, rayosX),
            p90: pct(largos, 0.9),
            mediana: pct(largos, 0.5),
            max: Math.max(0, ...largos),
            fuera: fuera.items + fuera.solapes,
            fueraMuestra: fuera.muestra,
            faltanVinetas: vinetas.filter((v) => !txt.includes(v)).length,
          };
          casos.push(caso);
          if (process.env.AUDIT_PDF && (caso.roundTrip || caso.fuera)) {
            mkdirSync(process.env.AUDIT_PDF, { recursive: true });
            writeFileSync(path.join(process.env.AUDIT_PDF, `${tpl.id}-${perfil}-${objetivo}.pdf`), r.buf);
          }
          const tag = `${perfil}/${objetivo}p`;
          if (tpl.gama === "ats" && caso.roundTrip) fallos.push(`round-trip ${tag}`);
          // p90 y mediana se exigen sobre el perfil CORTO (texto real, como el del
          // test medida-linea); el largo es texto sintético de párrafo lleno, donde
          // el p90 coincide con la medida máxima — ahí solo se exige el máximo.
          const medidaMal = caso.max > 110 || (perfil === "corto" && (caso.p90 > 90 || caso.mediana > 75));
          if (tpl.gama === "ats" && medidaMal) fallos.push(`medida ${tag}`);
          if (caso.cuerpo < CUERPO_MIN_PT) fallos.push(`cuerpo<10 ${tag}`);
          if (caso.fuera > 0) fallos.push(`fuera ${tag}`);
          if (caso.faltanVinetas > 0) fallos.push(`viñetas ${tag}`);
          if (!process.env.NO_THUMBS && perfil === "corto" && objetivo === 2) await miniatura(r.buf, path.join(THUMBS, `${tpl.id}.png`));
        }
      }
      filas.push({ tpl, casos, contraste, fallos: [...new Set(fallos)] });
      console.log(`${tpl.id.padEnd(26)} ${fallos.length ? "FALLA " + [...new Set(fallos)].join(", ") : "pasa"}`);
    }

    // ── El informe ──
    const json = filas.map((f) => ({ id: f.tpl.id, gama: f.tpl.gama, fallos: f.fallos, contraste: f.contraste, casos: f.casos }));
    writeFileSync(path.join(OUT, "auditoria.json"), JSON.stringify(json, null, 1));
    const fx = (n: number) => n.toFixed(2);
    const caso = (f: Fila, p: PerfilId, o: number) => f.casos.find((c) => c.perfil === p && c.objetivo === o)!;
    const celda = (c: Caso) => `${c.paginas}p·${c.cuerpo}${c.noCabe ? "✂" : ""}`;
    const lineas = [
      "# Auditoría del catálogo de plantillas",
      "",
      `Generado por \`scripts/plantillas/auditoria.audit.ts\` (${new Date().toISOString().slice(0, 10)}, ${Math.round((Date.now() - t0) / 1000)} s). ` +
        `${filas.length} plantillas × 3 perfiles × 1/2/3 páginas con el autofit de producción.`,
      "",
      "Columnas por objetivo: `páginas reales · cuerpo elegido` (✂ = ni a 10 pt cabe: pasa al recorte manual, que es el comportamiento previsto, no un fallo). " +
        "Medida = p90/mediana/máx de caracteres por línea de cuerpo (perfil corto, 2 páginas; umbrales 90/75/110, y máx ≤ 110 también en el largo). Contraste = acento/tinta/apagado sobre el papel. " +
        "«Fuera» = items de texto a menos de 5 mm del canto o pisando otro texto de su misma línea. El perfil largo incluye un rol de 56 viñetas (más largo que una página) en un bloque `wrap={false}`.",
      "",
      `**Resultado: ${filas.filter((f) => !f.fallos.length).length} de ${filas.length} pasan; retiradas: ninguna (no hizo falta alias).**`,
      "",
      ...NOTAS,
      "",
      "| | Plantilla | Gama | Estado | Corto 1/2/3 | Medio 1/2/3 | Largo 1/2/3 | Medida | Contraste |",
      "|---|---|---|---|---|---|---|---|---|",
      ...filas.map((f) => {
        const m = caso(f, "corto", 2);
        const estado = f.fallos.length ? `**falla**: ${f.fallos.join(", ")}` : "pasa";
        return `| ![](miniaturas/${f.tpl.id}.png) | **${f.tpl.name}**<br>\`${f.tpl.id}\`<br>${f.tpl.typography.name} · ${f.tpl.palette.name} | ${f.tpl.gama}${f.tpl.gama === "visual" ? " (round-trip exento)" : ""} | ${estado} | ${[1, 2, 3].map((o) => celda(caso(f, "corto", o))).join(" / ")} | ${[1, 2, 3].map((o) => celda(caso(f, "medio", o))).join(" / ")} | ${[1, 2, 3].map((o) => celda(caso(f, "largo", o))).join(" / ")} | ${m.p90}/${m.mediana}/${m.max} | ${fx(f.contraste.acento)}/${fx(f.contraste.tinta)}/${fx(f.contraste.apagado)} |`;
      }),
      "",
    ];
    writeFileSync(path.join(OUT, "auditoria.md"), lineas.join("\n"));
    expect(filas.length).toBeGreaterThan(0);
  });
});
