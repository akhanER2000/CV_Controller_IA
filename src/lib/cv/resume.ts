/**
 * Modelo del documento CV — consume DIRECTAMENTE el shape de datos-ejemplo.json
 * (ver docs/spec/documento-cv.md §5). De aquí salen tanto el PDF (ResumePDF.tsx)
 * como el texto plano del golden ("cómo lo lee el ATS").
 *
 * Contrato golden (documento-cv.md §6): toPlainText(datos, {locale:'es'}) debe
 * ser IGUAL byte-a-byte a cv-texto-plano.txt (versión de 2 páginas). El orden del
 * modelo = orden de lectura del documento = content stream de un PDF de 1 columna.
 */

import {
  bulletMark,
  headingLabelText,
  nameText,
  resolveMetrics,
  resolveTemplate,
  type ResolvedMetrics,
  type SectionId,
} from "./templates";

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

/**
 * Un enlace del CV. La `url` es LO QUE IMPORTA (el ATS lee la URL como texto);
 * `label` es solo para el humano y nunca reemplaza a la URL en el documento.
 * Retrocompatible: un string suelto = una URL sin etiqueta (el fixture golden).
 */
export interface ResumeLink {
  label?: string;
  url: string;
}
export type ResumeLinkInput = string | ResumeLink;

export interface ResumeData {
  meta?: { variant?: string; pageSize?: string; generatedFrom?: string };
  basics: {
    name: string;
    label: I18n;
    email: string;
    phone: string;
    location: I18n;
    links: ResumeLinkInput[];
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
  /**
   * Foto — OPT-IN explícito (versión "visual"). El CV estándar (y el golden) va
   * SIN foto. NUNCA es el avatar de la UI: es una imagen (data-URL) que el usuario
   * sube aparte para el CV. Solo se renderiza si está puesta.
   */
  photo?: string;
  /**
   * QR honesto — OPT-IN, con DOS modos (retrocompatible: `{ url }` sin `mode` = 'url').
   *  - 'url'   : el QR codifica una URL; esa URL va SIEMPRE también como TEXTO al lado
   *              (el ATS no lee el QR; la URL en texto es la máquina).
   *  - 'vcard' : el QR codifica una vCard 3.0 de los basics EFECTIVOS (buildVCard).
   *              El contacto YA está como texto en el CUERPO, así que el candado ATS
   *              se cumple igual; no se emite URL extra al pie.
   */
  qr?: { mode?: "url" | "vcard"; url?: string };
  /**
   * Plantilla del documento — OPCIONAL y RETROCOMPATIBLE. Sin `templateId` se usa
   * la de por defecto ("ats-clasica"), que reproduce exactamente el documento de
   * siempre. `paletteId`/`typographyId` cambian solo la paleta o la pareja
   * tipográfica sobre la plantilla elegida; ids desconocidos se ignoran.
   *
   * SÍ afecta a toPlainText, y tiene que afectarle: hay plantillas que cambian el
   * ORDEN de las secciones, el marcador de viñeta, el reparto del contacto o la
   * caja del nombre. El texto plano es "cómo lo lee el ATS" de ESTE documento, así
   * que si el PDF reordena y el rayos-X no, el rayos-X estaría mintiendo. Lo que no
   * cambia es el documento por defecto: sin `templateId` (o con "ats-clasica") el
   * texto plano sigue siendo byte-a-byte el golden.
   */
  templateId?: string;
  paletteId?: string;
  typographyId?: string;
}

// ── Presentación / contacto por variante (merge PURO, testeable) ──────────────
/**
 * Patch de presentación: foto, QR (url + modo) y contacto (identidad). Reglas de
 * merge por campo (mergePresentationOverride): `undefined` = no tocar; `null` =
 * quitar el override de ese campo (revertir al master); string (incluida `""`) =
 * fijar override. `links` se normaliza al shape del modelo.
 */
export interface PresentationPatch {
  photo?: string;
  qrUrl?: string;
  qrMode?: "url" | "vcard";
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  links?: ResumeLinkInput[] | null;
  /** Diseño del documento, por variante. null ⇒ vuelve a la plantilla por defecto. */
  templateId?: string | null;
  paletteId?: string | null;
  typographyId?: string | null;
}

/** Campos de contacto (identidad) que la variante puede sobrescribir en su basics. */
export const CONTACT_OVERRIDE_FIELDS = ["name", "email", "phone", "location"] as const;

/** Campos de DISEÑO que la variante guarda junto a su basics (misma regla de merge
 *  que el contacto: undefined no toca, null revierte al valor por defecto). */
export const DESIGN_OVERRIDE_FIELDS = ["templateId", "paletteId", "typographyId"] as const;

/**
 * Merge PURO de un patch de presentación/contacto sobre el `override_data` actual
 * del variant_item de basics. No muta `current`. photo/qr/qrMode y los campos de
 * contacto siguen las reglas de PresentationPatch. `qr` se mantiene como un objeto
 * único `{ url, mode }` para que url y modo no se pisen al editarse por separado.
 */
export function mergePresentationOverride(
  current: Record<string, unknown>,
  patch: PresentationPatch,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  if (patch.photo !== undefined) next.photo = patch.photo; // "" = apagar la foto
  if (patch.qrUrl !== undefined || patch.qrMode !== undefined) {
    const curQr = (next.qr as { url?: string; mode?: string } | undefined) ?? {};
    const nextQr: { url?: string; mode?: string } = { ...curQr };
    if (patch.qrUrl !== undefined) nextQr.url = patch.qrUrl;
    if (patch.qrMode !== undefined) nextQr.mode = patch.qrMode;
    next.qr = nextQr;
  }
  for (const f of CONTACT_OVERRIDE_FIELDS) {
    const v = patch[f];
    if (v === undefined) continue;
    if (v === null) delete next[f];
    else next[f] = v;
  }
  if (patch.links !== undefined) {
    if (patch.links === null) delete next.links;
    else next.links = normalizeLinks(patch.links);
  }
  for (const f of DESIGN_OVERRIDE_FIELDS) {
    const v = patch[f];
    if (v === undefined) continue;
    if (v === null || v === "") delete next[f]; // volver a la plantilla por defecto
    else next[f] = v;
  }
  return next;
}

// ── vCard 3.0 (RFC 2426) — lo que codifica el QR en modo 'vcard' ──────────────
/** Escapa un valor de texto de vCard 3.0 (RFC 2426 §5): `\` `,` `;` y saltos de línea. */
function vcardEscape(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * vCard 3.0 de los basics EFECTIVOS (para el QR en modo 'vcard'). PURO y
 * determinista (testeable). El nombre se parte en given (primer token) / family
 * (el resto) para el campo estructurado N; los `;` de N son separadores, los `;`/`,`
 * DENTRO de cada componente se escapan. Líneas separadas por CRLF (spec).
 */
export function buildVCard(basics: ResumeData["basics"], locale: Locale = "es"): string {
  const name = (basics.name ?? "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const given = parts.length ? parts[0]! : "";
  const family = parts.length > 1 ? parts.slice(1).join(" ") : "";
  const label = t(basics.label, locale).trim();
  const location = t(basics.location, locale).trim();
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push(`N:${vcardEscape(family)};${vcardEscape(given)};;;`);
  if (name) lines.push(`FN:${vcardEscape(name)}`);
  if (label) lines.push(`TITLE:${vcardEscape(label)}`);
  if (basics.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET:${vcardEscape(basics.email.trim())}`);
  if (basics.phone?.trim()) lines.push(`TEL;TYPE=CELL:${vcardEscape(basics.phone.trim())}`);
  if (location) lines.push(`ADR;TYPE=HOME:;;${vcardEscape(location)};;;;`);
  for (const l of basics.links ?? []) {
    const url = linkUrl(l).trim();
    if (url) lines.push(`URL:${vcardEscape(url)}`);
  }
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

// ── Enlaces: URL (lo que lee el ATS) y etiqueta (solo para el humano) ─────────
/** La URL de un enlace (string suelto o {label,url}). Es lo que va al documento. */
export function linkUrl(l: ResumeLinkInput): string {
  return typeof l === "string" ? l : l.url;
}
/** La etiqueta humana opcional (vacía para un string suelto). */
export function linkLabel(l: ResumeLinkInput): string {
  return typeof l === "string" ? "" : (l.label ?? "");
}
/**
 * Normaliza `links` crudos (jsonb de la DB, texto pegado) al shape del modelo,
 * tolerante: strings o {label,url}; descarta lo que no tiene URL. Compacta a
 * string cuando no hay etiqueta (así el fixture golden sigue siendo string[]).
 */
export function normalizeLinks(raw: unknown): ResumeLinkInput[] {
  if (!Array.isArray(raw)) return [];
  const out: ResumeLinkInput[] = [];
  for (const l of raw) {
    if (typeof l === "string") {
      const s = l.trim();
      if (s) out.push(s);
    } else if (l && typeof l === "object") {
      const o = l as Record<string, unknown>;
      const url = String(o.url ?? "").trim();
      if (!url) continue;
      const label = String(o.label ?? "").trim();
      out.push(label ? { label, url } : url);
    }
  }
  return out;
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

// ── Composición: lo que comparten el PDF y el texto plano ────────────────────
/**
 * Las tres funciones siguientes deciden QUÉ LÍNEAS tiene el documento y en qué
 * orden, a partir de los ejes de la plantilla. Las usan LOS DOS renderizadores.
 * No es factorización por elegancia: es el único modo de que "cómo lo lee el ATS"
 * describa el PDF que el usuario acaba de descargar y no a un primo suyo.
 */

/** La métrica efectiva de un documento (respeta templateId/paletteId/typographyId). */
export function metricsOf(data: ResumeData): ResolvedMetrics {
  return resolveMetrics(
    resolveTemplate({
      templateId: data.templateId,
      paletteId: data.paletteId,
      typographyId: data.typographyId,
    }).metrics,
  );
}

/**
 * Las secciones VISIBLES, en el orden que pide la plantilla. Una sección entra si
 * conserva contenido tras el filtro p1 — con la excepción histórica de resumen y
 * habilidades, que se rotulan siempre (así era antes de las plantillas y así se
 * queda: cambiarlo movería el golden).
 */
export function documentSections(data: ResumeData, onePage: boolean, m: ResolvedMetrics): SectionId[] {
  const { work, projects, education } = selectContent(data, onePage);
  const hay: Record<SectionId, boolean> = {
    summary: true,
    skills: true,
    work: work.length > 0,
    projects: projects.length > 0,
    education: education.length > 0,
  };
  return m.sectionOrder.filter((id) => hay[id]);
}

/**
 * El contacto repartido en líneas. Cada línea es la SECUENCIA DE TROZOS que caen en
 * el párrafo, ya con sus separadores dentro: el texto plano los concatena y el PDF
 * los emite como hijos del <Text>.
 *
 * Que sean trozos y no una cadena ya montada no es capricho: @react-pdf escribe un
 * operador de texto por cada hijo, así que el reparto en trozos ES parte del PDF
 * resultante. Devolviéndolos desde aquí, el documento por defecto conserva
 * exactamente los mismos trozos que tenía escritos a mano en el JSX — y sale byte a
 * byte igual que antes de que existieran estos ejes.
 *
 * `links` va aparte porque en el PDF cada URL es además un hipervínculo.
 */
export interface ContactLayout {
  info: string[][];
  links: string[][];
}

export function contactLayout(
  b: ResumeData["basics"],
  loc: Locale,
  m: ResolvedMetrics,
): ContactLayout {
  const eti = m.contactLabels;
  const donde = t(b.location, loc);
  const urls = (b.links ?? []).map(linkUrl);
  switch (m.contactStyle) {
    case "stacked":
      return {
        info: [eti ? [CX.email, b.email] : [b.email], eti ? [CX.tel, b.phone] : [b.phone], [donde]],
        links: urls.map((u) => [u]),
      };
    case "split":
      return {
        info: [
          eti ? [CX.email, b.email, `${CX.mid}${CX.tel}`, b.phone] : [b.email, CX.mid, b.phone],
          [donde],
        ],
        links: [urls],
      };
    default:
      return {
        info: [
          eti
            ? [CX.email, b.email, `${CX.mid}${CX.tel}`, b.phone, CX.mid, donde]
            : [b.email, CX.mid, b.phone, CX.mid, donde],
        ],
        links: [urls],
      };
  }
}

/** Las habilidades repartidas en líneas: una por grupo, todas en una, o a dos. */
export function skillLines(skills: ResumeSkill[], m: ResolvedMetrics): ResumeSkill[][] {
  if (!skills.length) return [];
  switch (m.skillStyle) {
    case "inline":
      return [skills];
    case "paired": {
      const corte = Math.ceil(skills.length / 2);
      const lineas = [skills.slice(0, corte), skills.slice(corte)];
      return lineas.filter((l) => l.length > 0);
    }
    default:
      return skills.map((s) => [s]);
  }
}

/** Las líneas de una entrada de experiencia/formación según el eje de fechas. */
export function entryLines(titulo: string, fechas: string, pie: string, m: ResolvedMetrics): string[] {
  switch (m.dateStyle) {
    case "inline":
      return [`${titulo}${CX.mid}${fechas}`, pie];
    case "own-line":
      return [titulo, fechas, pie];
    default:
      return [`${titulo}${CX.space}${fechas}`, pie];
  }
}

export interface PlainTextOpts {
  locale?: Locale;
  onePage?: boolean;
}

/**
 * El texto en orden de lectura. Con la plantilla por defecto debe igualar
 * cv-texto-plano.txt (locale es, onePage false) BYTE A BYTE. Línea en blanco antes
 * de cada encabezado de sección; la sección se dibuja solo si conserva ≥1 hijo
 * visible.
 *
 * Con otra plantilla, el texto sigue los ejes de esa plantilla (orden de secciones,
 * caja del nombre, marcador de viñeta, reparto del contacto, numeración de
 * rótulos…) porque es el rayos-X de ESE documento, no de uno genérico.
 */
export function toPlainText(data: ResumeData, opts: PlainTextOpts = {}): string {
  const loc: Locale = opts.locale ?? "es";
  const onePage = opts.onePage ?? false;
  const { work, projects, education } = selectContent(data, onePage);
  const b = data.basics;
  const m = metricsOf(data);
  const secciones = documentSections(data, onePage, m);
  const vineta = bulletMark(m);

  // Los encabezados de sección se imprimen en MAYÚSCULAS cuando la plantilla lo
  // pide (el .h del diseño es text-transform:uppercase). El ATS extrae lo que ve,
  // así que el texto plano "cómo lo lee el ATS" aplica la MISMA caja que el PDF —
  // ahí está la coherencia entre documento y rayos-X (documento-cv.md §2/§6).
  const H = (id: SectionId): string | null => {
    const rotulo = headingLabelText(t(data.headings[id], loc), secciones.indexOf(id), m);
    if (rotulo === null) return null;
    return m.upperHeadings ? rotulo.toUpperCase() : rotulo;
  };

  const contacto = contactLayout(b, loc, m);
  const lines: string[] = [nameText(b.name, m), t(b.label, loc)];
  // Los trozos de `info` ya traen sus separadores dentro; los enlaces no (en el PDF
  // cada URL es un <Link> aparte, así que el separador va entre ellos).
  for (const l of contacto.info) lines.push(l.join(""));
  for (const l of contacto.links) lines.push(l.join(CX.mid));

  /** Abre una sección: línea en blanco + rótulo (si la plantilla rotula). */
  const abrir = (id: SectionId) => {
    const h = H(id);
    if (h === null) lines.push("");
    else lines.push("", h);
  };

  const bloque: Record<SectionId, () => void> = {
    summary: () => {
      abrir("summary");
      lines.push(t(b.summary, loc));
    },
    skills: () => {
      abrir("skills");
      for (const linea of skillLines(data.skills, m)) {
        lines.push(linea.map((s) => `${t(s.group, loc)}${CX.skillSep}${t(s.items, loc)}`).join(CX.mid));
      }
    },
    work: () => {
      abrir("work");
      for (const w of work) {
        const titulo = `${t(w.title, loc)}${CX.titleCompany}${w.company}`;
        lines.push(...entryLines(titulo, t(w.dates, loc), t(w.location, loc), m));
        for (const bl of w.bullets) lines.push(`${vineta}${t(bl, loc)}`);
      }
    },
    // Proyectos — cada proyecto es una viñeta, sin entrada ni fechas.
    projects: () => {
      abrir("projects");
      for (const p of projects) lines.push(`${vineta}${t(p, loc)}`);
    },
    education: () => {
      abrir("education");
      for (const e of education) lines.push(...entryLines(t(e.title, loc), t(e.dates, loc), e.org, m));
    },
  };

  for (const id of secciones) bloque[id]!();

  // QR (opt-in): en modo 'url' la URL va SIEMPRE también como texto, al pie (orden
  // de lectura). En modo 'vcard' NO se emite nada extra: el contacto ya está como
  // texto en el CUERPO, así que la vCard del QR es un ademÁs, no una línea de texto.
  // El fixture golden no lleva qr → esta línea no existe ahí (byte-a-byte intacto).
  const qr = data.qr;
  if (qr && (qr.mode ?? "url") === "url" && qr.url) lines.push("", qr.url);

  return lines.join("\n") + "\n";
}
