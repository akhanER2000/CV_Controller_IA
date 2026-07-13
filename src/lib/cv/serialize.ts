/**
 * Serializador de CV: modelo interno (datos-ejemplo.json) + una variante →
 * un ResumeModel plano y ordenado, del que salen tanto el PDF (ResumePDF.tsx)
 * como el texto plano ("cómo lo lee el ATS"). El orden del modelo = el orden de
 * lectura del documento = el content stream del PDF (una sola columna semántica).
 *
 * Contrato golden (ESPECIFICACION.md §7): resumeToPlainText(serializeResume(
 * datos-ejemplo.json, 'var-backend-2p-es')) debe ser IGUAL a cv-texto-plano.txt.
 */

// ── Modelo interno (subset consumido; el JSON es un superset) ────────────────
export interface Contact { type: string; label: string; value: string; visible: boolean }
export interface Summary { id: string; text: string }
export interface Bullet { id: string; text: string }
export interface Work {
  id: string; title: string; orgLegal: string; location: string;
  start: string; end: string | null; current: boolean; bullets: Bullet[];
}
export interface SkillCat { id: string; category: string; items: { name: string }[] }
export interface EduNote { id: string; text: string }
export interface Education {
  id: string; degree: string; institution: string; location: string;
  start: string; end: string; notes?: EduNote[];
}
export interface Project {
  id: string; name: string; url: string | null; start: string; end: string | null;
  org?: string; bullets: Bullet[];
}
export interface Cert { id: string; name: string; year: string }
export interface Language { id: string; language: string; level: string }
export interface VariantSection { type: string; order: string[] }
export interface Override { text: string; reason?: string }
export interface Variant {
  id: string; language: string; targetTitle: string; summaryRef?: string;
  sections?: VariantSection[]; hidden?: string[]; overrides?: Record<string, Override>;
  isGoldenSource?: boolean;
}
export interface Profile {
  basics: { name: string; targetTitleDefault?: string; photo?: string; contacts: Contact[]; summaries: Summary[] };
  work: Work[]; skills: SkillCat[]; education: Education[];
  projects: Project[]; certifications: Cert[]; languages: Language[];
  variants: Variant[];
}

// ── Modelo de salida ─────────────────────────────────────────────────────────
export type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "skill"; label: string; value: string }
  | { kind: "line"; text: string }
  | { kind: "entry"; title: string; dates: string | null; meta: string[]; bullets: string[] };
export interface Section { header: string; type: string; blocks: Block[] }
export interface ResumeModel {
  name: string; targetTitle: string; contact: string; lang: string; sections: Section[];
  /** data-URL de la foto. Opcional; solo la versión "para persona" (no ATS). */
  photo?: string;
}

// ── i18n mínimo del documento ────────────────────────────────────────────────
const MONTHS: Record<string, string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const PRESENT: Record<string, string> = { es: "Presente", en: "Present" };
const HEADERS: Record<string, Record<string, string>> = {
  es: { summary: "RESUMEN", skills: "APTITUDES TÉCNICAS", work: "EXPERIENCIA", education: "EDUCACIÓN", projects: "PROYECTOS", certifications: "CERTIFICACIONES", languages: "IDIOMAS" },
  en: { summary: "SUMMARY", skills: "TECHNICAL SKILLS", work: "EXPERIENCE", education: "EDUCATION", projects: "PROJECTS", certifications: "CERTIFICATIONS", languages: "LANGUAGES" },
};

const EN_DASH = "–"; // – (separador de rangos, con espacios)
const MIDDOT = "·";  // · (separador de contacto / inline)

function fmtDate(d: string, lang: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(d);
  if (m) {
    const months = MONTHS[lang] ?? MONTHS.es!;
    return `${months[Number(m[2]) - 1]} ${m[1]}`;
  }
  return d; // año suelto ("2016")
}

function range(start: string, end: string | null, current: boolean, lang: string): string {
  const s = fmtDate(start, lang);
  const e = end ? fmtDate(end, lang) : (PRESENT[lang] ?? PRESENT.es!);
  if (end && !current && fmtDate(end, lang) === s) return s; // start === end → un solo año
  return `${s} ${EN_DASH} ${e}`;
}

export function serializeResume(profile: Profile, variantId: string): ResumeModel {
  const variant = profile.variants.find((v) => v.id === variantId);
  if (!variant) throw new Error(`variante no encontrada: ${variantId}`);
  return serializeWithVariant(profile, variant);
}

/** Igual que serializeResume pero con el objeto variante directo (variantes generadas). */
export function serializeWithVariant(
  profile: Profile,
  variant: Variant,
  opts?: { includePhoto?: boolean },
): ResumeModel {
  const lang = variant.language || "es";
  const H = HEADERS[lang] ?? HEADERS.es!;
  const hidden = new Set(variant.hidden ?? []);
  const overrides = variant.overrides ?? {};
  const bulletText = (b: Bullet) => overrides[b.id]?.text ?? b.text;

  const contact = profile.basics.contacts
    .filter((c) => c.visible)
    .map((c) => `${c.label}: ${c.value}`)
    .join(` ${MIDDOT} `);

  const sections: Section[] = [];

  if (variant.summaryRef) {
    const sum = profile.basics.summaries.find((x) => x.id === variant.summaryRef);
    if (sum) sections.push({ header: H.summary!, type: "summary", blocks: [{ kind: "paragraph", text: sum.text }] });
  }

  for (const sec of variant.sections ?? []) {
    switch (sec.type) {
      case "skills": {
        const blocks: Block[] = sec.order.map((id) => {
          const cat = profile.skills.find((x) => x.id === id)!;
          return { kind: "skill", label: cat.category, value: cat.items.map((i) => i.name).join(", ") };
        });
        sections.push({ header: H.skills!, type: sec.type, blocks });
        break;
      }
      case "work": {
        const blocks: Block[] = sec.order.map((id) => {
          const w = profile.work.find((x) => x.id === id)!;
          return {
            kind: "entry", title: w.title, dates: range(w.start, w.end, w.current, lang),
            meta: [`${w.orgLegal} ${MIDDOT} ${w.location}`],
            bullets: w.bullets.filter((b) => !hidden.has(b.id)).map(bulletText),
          };
        });
        sections.push({ header: H.work!, type: sec.type, blocks });
        break;
      }
      case "education": {
        const blocks: Block[] = sec.order.map((id) => {
          const e = profile.education.find((x) => x.id === id)!;
          return {
            kind: "entry", title: e.degree, dates: range(e.start, e.end, false, lang),
            meta: [`${e.institution} ${MIDDOT} ${e.location}`],
            bullets: (e.notes ?? []).filter((n) => !hidden.has(n.id)).map((n) => n.text),
          };
        });
        sections.push({ header: H.education!, type: sec.type, blocks });
        break;
      }
      case "projects": {
        const blocks: Block[] = sec.order.map((id) => {
          const p = profile.projects.find((x) => x.id === id)!;
          const meta: string[] = [];
          if (p.url) meta.push(p.url);
          if (p.org) meta.push(p.org);
          return {
            kind: "entry", title: p.name, dates: range(p.start, p.end, false, lang), meta,
            bullets: (p.bullets ?? []).filter((b) => !hidden.has(b.id)).map(bulletText),
          };
        });
        sections.push({ header: H.projects!, type: sec.type, blocks });
        break;
      }
      case "certifications": {
        const blocks: Block[] = sec.order.map((id) => {
          const c = profile.certifications.find((x) => x.id === id)!;
          return { kind: "line", text: `${c.name} (${c.year})` };
        });
        sections.push({ header: H.certifications!, type: sec.type, blocks });
        break;
      }
      case "languages": {
        const text = sec.order
          .map((id) => { const l = profile.languages.find((x) => x.id === id)!; return `${l.language} (${l.level})`; })
          .join(` ${MIDDOT} `);
        sections.push({ header: H.languages!, type: sec.type, blocks: [{ kind: "line", text }] });
        break;
      }
    }
  }

  return {
    name: profile.basics.name,
    targetTitle: variant.targetTitle,
    contact,
    lang,
    sections,
    photo: opts?.includePhoto ? profile.basics.photo : undefined,
  };
}

/** El texto en orden de lectura. Debe igualar cv-texto-plano.txt para el golden. */
export function resumeToPlainText(m: ResumeModel): string {
  const lines: string[] = [m.name, m.targetTitle, m.contact];
  for (const sec of m.sections) {
    lines.push("", sec.header); // línea en blanco antes de cada encabezado
    for (const b of sec.blocks) {
      if (b.kind === "paragraph") lines.push(b.text);
      else if (b.kind === "skill") lines.push(`${b.label}: ${b.value}`);
      else if (b.kind === "line") lines.push(b.text);
      else {
        lines.push(b.dates ? `${b.title} ${b.dates}` : b.title);
        for (const meta of b.meta) lines.push(meta);
        for (const bl of b.bullets) lines.push(bl);
      }
    }
  }
  return lines.join("\n");
}

/** Variante por defecto: todas las secciones con contenido, orden estándar, todo incluido. */
export function buildDefaultVariant(data: Profile, lang = "es"): Variant {
  const sections: VariantSection[] = [];
  if (data.skills.length) sections.push({ type: "skills", order: data.skills.map((s) => s.id) });
  if (data.work.length) sections.push({ type: "work", order: data.work.map((w) => w.id) });
  if (data.education.length) sections.push({ type: "education", order: data.education.map((e) => e.id) });
  if (data.projects.length) sections.push({ type: "projects", order: data.projects.map((p) => p.id) });
  if (data.certifications.length) sections.push({ type: "certifications", order: data.certifications.map((c) => c.id) });
  if (data.languages.length) sections.push({ type: "languages", order: data.languages.map((l) => l.id) });
  return {
    id: "default",
    language: lang,
    targetTitle: data.basics.targetTitleDefault ?? "",
    summaryRef: data.basics.summaries[0]?.id,
    sections,
  };
}

/** Un master vacío para un perfil nuevo. */
export function emptyProfile(name = ""): Profile {
  return {
    basics: { name, targetTitleDefault: "", contacts: [], summaries: [] },
    work: [], skills: [], education: [], projects: [],
    certifications: [], languages: [], variants: [],
  };
}
