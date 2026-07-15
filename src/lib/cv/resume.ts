/**
 * Modelo del documento CV — consume DIRECTAMENTE el shape de datos-ejemplo.json
 * (ver docs/spec/documento-cv.md §5). De aquí salen tanto el PDF (ResumePDF.tsx)
 * como el texto plano del golden ("cómo lo lee el ATS").
 *
 * Contrato golden (documento-cv.md §6): toPlainText(datos, {locale:'es'}) debe
 * ser IGUAL byte-a-byte a cv-texto-plano.txt (versión de 2 páginas). El orden del
 * modelo = orden de lectura del documento = content stream de un PDF de 1 columna.
 */

// ── Shape de datos-ejemplo.json ──────────────────────────────────────────────
export type Locale = "es" | "en";
export type I18n = { es: string; en: string };

export interface ResumeBullet {
  p1: boolean;
  es: string;
  en: string;
}
export interface ResumeWork {
  company: string; // no i18n (nombre propio con identificador legal)
  location: I18n;
  title: I18n;
  dates: I18n;
  p1: boolean;
  bullets: ResumeBullet[];
}
export interface ResumeSkill {
  group: I18n;
  items: I18n;
}
export interface ResumeProject {
  p1: boolean;
  es: string;
  en: string;
}
export interface ResumeEducation {
  title: I18n;
  org: string; // no i18n
  dates: I18n;
  p1: boolean;
}
export interface ResumeData {
  meta?: { variant?: string; pageSize?: string; generatedFrom?: string };
  basics: {
    name: string;
    label: I18n;
    email: string;
    phone: string;
    location: I18n;
    links: string[];
    summary: I18n;
  };
  skills: ResumeSkill[];
  work: ResumeWork[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  headings: {
    summary: I18n;
    skills: I18n;
    work: I18n;
    projects: I18n;
    education: I18n;
  };
}

// ── Conectores fijos (documento-cv.md §6) — NO vienen del JSON ────────────────
export const CX = {
  email: "Email: ",
  tel: "Tel: ",
  mid: " · ", // contacto y links
  titleCompany: " — ", // cargo — empresa (U+2014)
  skillSep: ": ", // grupo: items
  bullet: "• ", // viñeta (U+2022)
  space: " ", // cargo/título ↔ fechas
} as const;

const t = (v: I18n, loc: Locale) => v[loc];

/**
 * Aplica el filtro p1 (documento-cv.md §5). onePage=false ⇒ todo (2 páginas,
 * el golden). onePage=true ⇒ solo lo marcado p1, con encabezado condicional.
 */
export function selectContent(data: ResumeData, onePage: boolean) {
  const work = data.work
    .filter((w) => !onePage || w.p1)
    .map((w) => ({
      ...w,
      bullets: w.bullets.filter((b) => !onePage || b.p1),
    }));
  const projects = data.projects.filter((p) => !onePage || p.p1);
  const education = data.education.filter((e) => !onePage || e.p1);
  return { work, projects, education };
}

export interface PlainTextOpts {
  locale?: Locale;
  onePage?: boolean;
}

/**
 * El texto en orden de lectura. Debe igualar cv-texto-plano.txt (locale es,
 * onePage false). Línea en blanco antes de cada encabezado de sección; la
 * sección se dibuja solo si conserva ≥1 hijo visible.
 */
export function toPlainText(data: ResumeData, opts: PlainTextOpts = {}): string {
  const loc: Locale = opts.locale ?? "es";
  const onePage = opts.onePage ?? false;
  const { work, projects, education } = selectContent(data, onePage);
  const b = data.basics;
  // Los encabezados de sección se imprimen en MAYÚSCULAS (el .h del diseño es
  // text-transform:uppercase). El ATS extrae mayúsculas, así que el texto plano
  // "cómo lo lee el ATS" también (documento-cv.md §2/§6).
  const H = (v: I18n) => t(v, loc).toUpperCase();

  const lines: string[] = [
    b.name,
    t(b.label, loc),
    `${CX.email}${b.email}${CX.mid}${CX.tel}${b.phone}${CX.mid}${t(b.location, loc)}`,
    b.links.join(CX.mid),
  ];

  // Resumen
  lines.push("", H(data.headings.summary), t(b.summary, loc));

  // Habilidades
  lines.push("", H(data.headings.skills));
  for (const s of data.skills) lines.push(`${t(s.group, loc)}${CX.skillSep}${t(s.items, loc)}`);

  // Experiencia
  if (work.length) {
    lines.push("", H(data.headings.work));
    for (const w of work) {
      lines.push(`${t(w.title, loc)}${CX.titleCompany}${w.company}${CX.space}${t(w.dates, loc)}`);
      lines.push(t(w.location, loc));
      for (const bl of w.bullets) lines.push(`${CX.bullet}${t(bl, loc)}`);
    }
  }

  // Proyectos (cada proyecto es una viñeta; sin encabezado si queda vacío)
  if (projects.length) {
    lines.push("", H(data.headings.projects));
    for (const p of projects) lines.push(`${CX.bullet}${t(p, loc)}`);
  }

  // Educación
  if (education.length) {
    lines.push("", H(data.headings.education));
    for (const e of education) {
      lines.push(`${t(e.title, loc)}${CX.space}${t(e.dates, loc)}`);
      lines.push(e.org);
    }
  }

  return lines.join("\n") + "\n";
}
