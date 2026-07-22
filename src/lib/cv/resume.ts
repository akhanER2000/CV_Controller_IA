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
  ALL_SECTION_IDS,
  DEFAULT_SECTION_ORDER,
  PINNED_LAST_SECTION,
  type ResolvedMetrics,
  type SectionId,
  type TemplateSelection,
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
 * Una CERTIFICACIÓN. Misma forma que ResumeEducation y por la misma razón: el
 * documento la lee como una ENTRADA (título, emisor, fechas), así que reusa
 * `entryLines` y sale colocada igual en los cinco ejes de fechas —incluida la
 * columna colgante— sin escribir un segundo maquetador que un día discreparía.
 * `org` es el emisor y NO es i18n: «Amazon Web Services» no se traduce.
 */
export interface ResumeCertification {
  title: I18n;
  org: string; // el emisor (nombre propio)
  dates: I18n;
  p1: boolean;
}

/**
 * Un IDIOMA y una PUBLICACIÓN, ya compuestos en UNA línea (como los proyectos y las
 * referencias). Llegan aquí montados por `languageLine` / `publicationLine`, que son
 * puras y las comparten las TRES capas que arman un ResumeData: si cada una montara
 * la línea por su cuenta, el PDF del master, el de la variante y el preview del
 * editor dirían cosas distintas del mismo dato.
 */
export interface ResumeLanguage {
  p1: boolean;
  es: string;
  en: string;
}
export interface ResumePublication {
  p1: boolean;
  es: string;
  en: string;
}

/** Los campos crudos de un idioma, tal y como viven en profile_items.data. */
export interface LanguageFields {
  language?: string;
  level?: string;
}
/** Los campos crudos de una publicación (mismo vocabulario que un proyecto). */
export interface PublicationFields {
  name?: string;
  description?: string;
}
/** Los campos crudos de una certificación. */
export interface CertificationFields {
  name?: string;
  issuer?: string;
  dates?: string;
}

/**
 * Una REFERENCIA ya compuesta en una línea. Misma forma que ResumeProject y por la
 * misma razón: el documento imprime UNA línea por referencia, sin fechas ni
 * entrada, así que aquí solo llega el texto ya montado (lo monta `referenceLine`,
 * que es puro y lo comparten las tres capas que construyen el ResumeData).
 *
 * ⚠ DATOS DE TERCEROS. Que exista este campo NO significa que se imprima: es
 * OPT-IN POR VARIANTE y nace apagado (ver `ResumeData.references`).
 */
export interface ResumeReference {
  p1: boolean;
  es: string;
  en: string;
}

/** Los campos crudos de una referencia, tal y como viven en profile_items.data. */
export interface ReferenceFields {
  /** nombre de la persona */
  name?: string;
  /** su cargo */
  role?: string;
  /** su organización */
  org?: string;
  /** cómo se conocieron: jefe, cliente, profesor, stakeholder (texto libre) */
  relation?: string;
  email?: string;
  phone?: string;
}

/**
 * La línea que se IMPRIME de una referencia. PURA y compartida por los tres sitios
 * que arman un ResumeData (queries.ts, variants.ts y el espejo del editor): si cada
 * uno la compusiera por su cuenta, el PDF del servidor y el preview del editor
 * dirían cosas distintas del mismo dato.
 *
 * Forma: «Nombre — Cargo · Organización · relación · email · teléfono», saltándose
 * lo que no esté. Se usan los conectores de siempre (CX) porque el texto plano
 * («cómo lo lee el ATS») emite EXACTAMENTE esta misma cadena.
 */
export function referenceLine(r: ReferenceFields): string {
  const limpio = (v: string | undefined) => (v ?? "").trim();
  const nombre = limpio(r.name);
  const cargo = limpio(r.role);
  const cabeza = nombre && cargo ? `${nombre}${CX.titleCompany}${cargo}` : nombre || cargo;
  const cola = [r.org, r.relation, r.email, r.phone].map(limpio).filter(Boolean);
  return [cabeza, ...cola].filter(Boolean).join(CX.mid);
}

/**
 * La línea que se IMPRIME de un IDIOMA: «Inglés — profesional (B2)». Usa el conector
 * de siempre (CX.titleCompany) en vez de inventar paréntesis: el vocabulario de
 * puntuación del documento está cerrado, y cada signo nuevo tendría que emitirlo
 * también el texto plano. Sin nivel, solo el idioma (nunca un guion huérfano).
 */
export function languageLine(l: LanguageFields): string {
  const idioma = (l.language ?? "").trim();
  const nivel = (l.level ?? "").trim();
  if (!idioma) return nivel; // un nivel sin idioma es raro, pero no se descarta
  return nivel ? `${idioma}${CX.titleCompany}${nivel}` : idioma;
}

/**
 * La línea que se IMPRIME de una PUBLICACIÓN: «Título — descripción». Es EXACTAMENTE
 * la misma composición que un proyecto, porque en el documento son lo mismo: una
 * línea con nombre y contexto. Aquí vive una sola vez para las tres capas.
 */
export function publicationLine(p: PublicationFields): string {
  return [(p.name ?? "").trim(), (p.description ?? "").trim()].filter(Boolean).join(CX.titleCompany);
}

/**
 * Una CERTIFICACIÓN como ENTRADA del documento (título / emisor / fechas). Pura y
 * compartida, igual que las dos de arriba: el emisor va donde en un empleo va la
 * ubicación y en formación el centro, así que la certificación hereda gratis los
 * cinco ejes de fechas del catálogo.
 */
export function certificationEntry(c: CertificationFields): { title: string; org: string; dates: string } {
  return {
    title: (c.name ?? "").trim(),
    org: (c.issuer ?? "").trim(),
    dates: (c.dates ?? "").trim(),
  };
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
  /**
   * REFERENCIAS — OPT-IN POR VARIANTE, APAGADAS POR DEFECTO. Opcional a propósito:
   * `undefined` (o lista vacía) ⇒ la sección no existe en el documento, que es el
   * caso normal y el que mantiene el golden intacto.
   *
   * ⚠⚠ POR QUÉ NACE APAGADA Y NO ES UN DESCUIDO. Son datos de PERSONAS QUE NO SON
   * EL USUARIO y que no han consentido nada de esto. Además, la convención
   * internacional es no imprimir referencias en el CV ni gastar una línea en
   * «disponibles a solicitud»: ocupa espacio y no aporta. Quien construye el
   * ResumeData solo rellena esta lista si el usuario lo pidió EN ESA VARIANTE.
   */
  references?: ResumeReference[];
  /**
   * CERTIFICACIONES, IDIOMAS y PUBLICACIONES — datos PROPIOS del usuario, así que no
   * llevan opt-in ninguno: si están, se imprimen. Son opcionales por otra razón, la
   * de siempre en este modelo: un CV sin certificados es el caso normal y `undefined`
   * tiene que comportarse EXACTAMENTE como lista vacía (sección inexistente, golden
   * intacto). Nunca se descartan en silencio: el editor las ofrece en la biblioteca
   * como cualquier otro item del master.
   */
  certifications?: ResumeCertification[];
  languages?: ResumeLanguage[];
  publications?: ResumePublication[];
  headings: {
    summary: I18n;
    skills: I18n;
    work: I18n;
    projects: I18n;
    education: I18n;
    /** Rótulo de la sección de referencias. Obligatorio aunque la sección casi
     *  nunca se imprima: si fuera opcional, el día que alguien la encienda el
     *  documento saldría con un rótulo vacío y nadie se enteraría hasta verlo. */
    references: I18n;
    /** Los tres rótulos nuevos, TAMBIÉN obligatorios y por el mismo motivo: que
     *  romper a compilar sea el aviso. Un rótulo opcional habría dejado el
     *  documento imprimiendo una sección sin nombre el día que alguien guardara su
     *  primer certificado, y eso no se ve hasta que ya está enviado. */
    certifications: I18n;
    languages: I18n;
    publications: I18n;
  };
  /**
   * ORDEN DE LAS SECCIONES DE ESTE DOCUMENTO — opcional. Sin él manda el de la
   * plantilla (que es lo que había, y lo que mantiene el golden byte a byte). Con él,
   * la VARIANTE pisa a la plantilla: «Backend» puede llevar habilidades arriba e
   * «Investigación» publicaciones arriba usando la misma plantilla.
   *
   * Llega SIN VALIDAR (viene de un jsonb del usuario), así que nadie lo consume tal
   * cual: `metricsOf` lo pasa por `normalizeSectionOrder`, que descarta ids
   * desconocidos, quita duplicados, completa lo que falte y deja las referencias al
   * final. Un dato viejo o corrupto no puede dejar a nadie sin secciones.
   */
  sectionOrder?: readonly SectionId[];
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

/**
 * LOS RÓTULOS DEL DOCUMENTO, en un solo sitio. Los construían A MANO las TRES capas
 * que arman un ResumeData (queries.ts, variants.ts y el espejo del editor), y las
 * tres escribían la misma lista de literales: al crear las secciones nuevas eso eran
 * tres oportunidades de que a una se le olvidara un rótulo y saliera un encabezado
 * vacío en el PDF de esa capa y solo de esa.
 *
 * ⚠ SON RÓTULOS ESTÁNDAR Y NO SE RENOMBRAN. Un ATS segmenta el CV por estas
 * palabras: «Experiencia» no puede convertirse en «Mi trayectoria» porque quede
 * bonito (el catálogo ya prohíbe que una plantilla los cambie; ver templates.test).
 * Lo que sí hacen ahora es existir en los DOS idiomas, que es lo que el modelo
 * bilingüe (I18n) prometía desde el principio.
 */
export const DOCUMENT_HEADINGS: ResumeData["headings"] = {
  summary: { es: "Resumen", en: "Summary" },
  skills: { es: "Habilidades", en: "Skills" },
  work: { es: "Experiencia", en: "Experience" },
  projects: { es: "Proyectos", en: "Projects" },
  education: { es: "Educación", en: "Education" },
  certifications: { es: "Certificaciones", en: "Certifications" },
  languages: { es: "Idiomas", en: "Languages" },
  publications: { es: "Publicaciones", en: "Publications" },
  references: { es: "Referencias", en: "References" },
};

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
  /**
   * ¿Esta variante IMPRIME sus referencias? `undefined` no toca, `false`/`null`
   * apagan. Es booleano y no texto porque el valor por defecto (apagado) tiene que
   * seguir siéndolo aunque el dato venga de un JSON viejo o a medio migrar.
   */
  showReferences?: boolean | null;
  /**
   * ORDEN DE SECCIONES DE ESTA VARIANTE. `undefined` no toca; `null` (o una lista
   * inservible) borra el override y devuelve el mando a la plantilla; una lista se
   * guarda YA NORMALIZADA (ids válidos, sin repetir, completa y con las referencias
   * al final), porque lo que se persiste es lo que otro día se leerá sin mirar.
   */
  sectionOrder?: readonly SectionId[] | null;
}

/**
 * La clave del orden de secciones dentro del override de basics. Vive con la foto,
 * el QR, la plantilla y el interruptor de referencias porque es lo mismo: una
 * decisión de PRESENTACIÓN de esta variante, no un dato del master. Por eso no hace
 * falta ninguna migración: el jsonb `override_data` ya está ahí.
 */
export const SECTION_ORDER_FIELD = "sectionOrder";

/**
 * Deja utilizable CUALQUIER orden que llegue de fuera (un jsonb del usuario, un
 * cuerpo HTTP, un dato de hace tres versiones). Devuelve `null` cuando no hay nada
 * aprovechable, para que quien llame caiga en el orden de la plantilla.
 *
 * Cuatro reglas, y las cuatro existen porque su ausencia PIERDE SECCIONES:
 *  1. lo que no es una SectionId conocida se descarta (un id inventado no se pinta);
 *  2. los repetidos se quitan (una sección dos veces imprimiría el bloque dos veces);
 *  3. lo que falte SE AÑADE al final, en el orden de `base` — que por defecto es el
 *     de la plantilla. Esta es la regla que impide el fallo capital: guardar un orden
 *     hoy y estrenar una sección mañana no puede dejarla fuera del documento;
 *  4. las REFERENCIAS van al final SIEMPRE (una referencia no abre un CV).
 */
export function normalizeSectionOrder(
  raw: unknown,
  base: readonly SectionId[] = DEFAULT_SECTION_ORDER,
): SectionId[] | null {
  if (!Array.isArray(raw)) return null;
  const conocidas = new Set<string>(ALL_SECTION_IDS);
  const out: SectionId[] = [];
  const vistas = new Set<SectionId>();
  for (const v of raw) {
    if (typeof v !== "string" || !conocidas.has(v)) continue;
    const id = v as SectionId;
    if (vistas.has(id)) continue;
    vistas.add(id);
    out.push(id);
  }
  if (out.length === 0) return null; // basura entera: que mande la plantilla
  const anadir = (id: SectionId) => {
    if (vistas.has(id)) return;
    vistas.add(id);
    out.push(id);
  };
  // Lo que falte, al final y en el orden de la base (la plantilla). Sin esto, una
  // sección nueva no aparecería NUNCA en las variantes que ya guardaron su orden.
  for (const id of base) anadir(id);
  // Y por si la base tampoco la tuviera (una plantilla con un orden incompleto).
  for (const id of ALL_SECTION_IDS) anadir(id);
  // Candado: las referencias, las últimas.
  const sinRefs = out.filter((id) => id !== PINNED_LAST_SECTION);
  return [...sinRefs, PINNED_LAST_SECTION];
}

/**
 * La clave del interruptor de referencias dentro del override de basics. Vive con
 * la foto, el QR y la plantilla porque es lo mismo: una decisión de PRESENTACIÓN
 * de esta variante, no un dato del master.
 */
export const REFERENCES_OPT_IN_FIELD = "showReferences";

/**
 * ¿Esta variante enciende las referencias? PURA y compartida por el servidor
 * (buildVariantResumeData) y el cliente (el espejo del editor), que es la única
 * forma de que el preview y el PDF descargado tomen la MISMA decisión.
 *
 * Exige `=== true`: cualquier otra cosa deja la sección apagada. Con datos de
 * terceros, «no sé» tiene que significar «no».
 */
export function referencesOptIn(basics: Record<string, unknown> | null | undefined): boolean {
  return basics?.[REFERENCES_OPT_IN_FIELD] === true;
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
  // Referencias: apagar BORRA la clave en vez de guardar `false`. Así el estado por
  // defecto y el estado «apagado a mano» son el mismo objeto, y no hay dos formas
  // de estar apagado que puedan divergir. Encender guarda `true` literal, que es lo
  // único que referencesOptIn acepta.
  if (patch.showReferences !== undefined) {
    if (patch.showReferences === true) next[REFERENCES_OPT_IN_FIELD] = true;
    else delete next[REFERENCES_OPT_IN_FIELD];
  }
  // ORDEN DE SECCIONES. Se guarda NORMALIZADO (no crudo): lo que entra por HTTP no
  // manda en lo que se persiste. `null` —o una lista que no deja ni una sección en
  // pie— BORRA la clave, que es lo mismo que «vuelve al orden de la plantilla»: así
  // el estado por defecto y el reseteado a mano son el MISMO objeto.
  if (patch.sectionOrder !== undefined) {
    const orden = patch.sectionOrder === null ? null : normalizeSectionOrder(patch.sectionOrder);
    if (orden) next[SECTION_ORDER_FIELD] = orden;
    else delete next[SECTION_ORDER_FIELD];
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
  // `references` puede no venir (el caso normal: apagadas). `?? []` y no un
  // `data.references!`: un documento sin referencias no es un error, es lo esperado.
  const references = (data.references ?? []).filter((r) => !onePage || r.p1);
  // Las tres nuevas siguen la MISMA regla y el MISMO filtro p1: ausentes = vacías.
  const certifications = (data.certifications ?? []).filter((c) => !onePage || c.p1);
  const languages = (data.languages ?? []).filter((l) => !onePage || l.p1);
  const publications = (data.publications ?? []).filter((p) => !onePage || p.p1);
  return { work, projects, education, references, certifications, languages, publications };
}

// ── Composición: lo que comparten el PDF y el texto plano ────────────────────
/**
 * Las tres funciones siguientes deciden QUÉ LÍNEAS tiene el documento y en qué
 * orden, a partir de los ejes de la plantilla. Las usan LOS DOS renderizadores.
 * No es factorización por elegancia: es el único modo de que "cómo lo lee el ATS"
 * describa el PDF que el usuario acaba de descargar y no a un primo suyo.
 */

/**
 * La métrica efectiva de un documento (respeta templateId/paletteId/typographyId) Y
 * el ORDEN DE SECCIONES de la variante, que pisa al de la plantilla.
 *
 * ⚠ LA LLAMAN LOS DOS RENDERIZADORES, y eso es el candado del bloque. ResumePDF
 * resolvía su métrica por su cuenta (`resolveMetrics(tpl.metrics)`), así que un orden
 * por variante habría reordenado el texto plano y NO el PDF: el rayos-X describiendo
 * un documento que no existe, que es justo lo que este producto promete no hacer.
 * `sel` está para que el render pueda pasar sus overrides de plantilla sin duplicar
 * la resolución.
 */
export function metricsOf(data: ResumeData, sel: TemplateSelection = {}): ResolvedMetrics {
  const m = resolveMetrics(
    resolveTemplate({
      templateId: sel.templateId ?? data.templateId,
      paletteId: sel.paletteId ?? data.paletteId,
      typographyId: sel.typographyId ?? data.typographyId,
    }).metrics,
  );
  // El orden de la variante se normaliza CONTRA el de la plantilla: lo que la
  // variante no diga, se completa con el criterio de la plantilla elegida.
  const propio = normalizeSectionOrder(data.sectionOrder, m.sectionOrder);
  return propio ? { ...m, sectionOrder: propio } : m;
}

/**
 * Las secciones VISIBLES, en el orden que pide la plantilla. Una sección entra si
 * conserva contenido tras el filtro p1 — con la excepción histórica de resumen y
 * habilidades, que se rotulan siempre (así era antes de las plantillas y así se
 * queda: cambiarlo movería el golden).
 */
export function documentSections(data: ResumeData, onePage: boolean, m: ResolvedMetrics): SectionId[] {
  const { work, projects, education, references, certifications, languages, publications } =
    selectContent(data, onePage);
  // ⚠ EXHAUSTIVO A PROPÓSITO: `Record<SectionId, boolean>` obliga a que una sección
  // nueva pase por aquí o el build cae. Es el único punto del recorrido donde TS
  // puede exigirlo (sectionOrder es un array y no exige exhaustividad).
  const hay: Record<SectionId, boolean> = {
    summary: true,
    skills: true,
    work: work.length > 0,
    projects: projects.length > 0,
    education: education.length > 0,
    // Datos propios: se imprimen si existen. Vacías, la sección NO existe — ni
    // rótulo ni línea en blanco (por eso el golden no se mueve ni un byte).
    certifications: certifications.length > 0,
    languages: languages.length > 0,
    publications: publications.length > 0,
    // Referencias: NUNCA por excepción histórica. Solo si el usuario las encendió
    // en esta variante Y hay al menos una. Sin lista, la sección no existe: no se
    // rotula, no gasta una línea, no queda un «disponibles a solicitud» flotando.
    references: references.length > 0,
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

/**
 * Las líneas de una entrada de experiencia/formación según el eje de fechas.
 *
 * El caso "hanging" (columna colgante) es el único que ADELANTA algo: las fechas y
 * la organización van en la columna de la izquierda, así que el PDF las emite antes
 * que el cargo. Aquí se escribe ese mismo orden a propósito — el texto plano es el
 * rayos-X de ESTE documento, y si el PDF leyera "mar 2022 – hoy / Santiago, Chile /
 * Backend Developer" y el rayos-X dijera otra cosa, la pantalla "cómo lo lee el ATS"
 * estaría enseñando un documento que no existe.
 */
export function entryLines(titulo: string, fechas: string, pie: string, m: ResolvedMetrics): string[] {
  switch (m.dateStyle) {
    case "inline":
      return [`${titulo}${CX.mid}${fechas}`, pie];
    case "own-line":
      return [titulo, fechas, pie];
    case "hanging":
      return [fechas, pie, titulo];
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
  const { work, projects, education, references, certifications, languages, publications } =
    selectContent(data, onePage);
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
    // Referencias — cada una es UNA viñeta, como los proyectos: sin entrada y sin
    // fechas. El ResumePDF emite exactamente estas mismas líneas con el mismo
    // marcador; por eso el round-trip sigue significando algo cuando alguien las
    // enciende. Con la lista vacía este bloque no se llama (documentSections).
    references: () => {
      abrir("references");
      for (const r of references) lines.push(`${vineta}${t(r, loc)}`);
    },
    // CERTIFICACIONES — ENTRADAS, como la formación: `entryLines` decide el orden de
    // título, emisor y fechas según el eje de la plantilla, y ResumePDF llama a esa
    // MISMA función. Si aquí se escribieran las tres líneas a mano, la columna
    // colgante (que emite fechas → emisor → título) rompería el round-trip.
    certifications: () => {
      abrir("certifications");
      for (const c of certifications) lines.push(...entryLines(t(c.title, loc), t(c.dates, loc), c.org, m));
    },
    // IDIOMAS y PUBLICACIONES — una VIÑETA cada uno, igual que proyectos y
    // referencias, y con el mismo marcador de la plantilla. La línea ya viene
    // compuesta desde languageLine/publicationLine: aquí no se decide nada.
    languages: () => {
      abrir("languages");
      for (const l of languages) lines.push(`${vineta}${t(l, loc)}`);
    },
    publications: () => {
      abrir("publications");
      for (const p of publications) lines.push(`${vineta}${t(p, loc)}`);
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
