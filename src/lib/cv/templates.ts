/**
 * CONTRATO del catálogo de plantillas. Este archivo define los TIPOS y el registro;
 * el diseño concreto (paletas, parejas tipográficas, ritmo vertical) lo llena el
 * catálogo (catalog.ts). Lo consumen dos lados que no deben pisarse:
 *   · el render (ResumePDF) → traduce la plantilla a estilos del documento;
 *   · el editor            → pinta el selector con listTemplates().
 *
 * REGLA DURA (§C4): una plantilla de gama 'ats' solo entra al catálogo si pasa el
 * round-trip (nombre, email, teléfono, cargos, fechas y ORDEN de lectura). Las de
 * gama 'visual' están exentas del test pero DEBEN llevar `warning` — se muestra en
 * la UI, porque el usuario elige informado, no a ciegas.
 *
 * Todos los campos añadidos al contrato original son OPCIONALES y su valor por
 * defecto reproduce el documento de siempre: una plantilla que solo declare lo
 * mínimo sale exactamente como salía el CV antes de que existieran las plantillas.
 */

import { PALETTES, TEMPLATES, TYPOGRAPHIES } from "./catalog";

/** Gama ATS: una columna, sin foto, sin barras, sin iconos. Visual: opt-in. */
export type TemplateGama = "ats" | "visual";

/** Paleta de un documento. Un solo acento por documento (el sistema lo exige). */
export interface TemplatePalette {
  id: string;
  name: string;
  /** Acento único: encabezados y nombre. */
  accent: string;
  /** Tinta principal del cuerpo. */
  ink: string;
  /** Texto secundario (fechas, ubicación). */
  muted: string;
  /** Filete de las secciones. */
  hair: string;
  /**
   * Papel del documento. El render NO pinta fondo (el PDF sale blanco), así que
   * hoy esto es siempre #FFFFFF; existe para que el cálculo de contraste no
   * dependa de una constante escondida en el test. Por defecto: #FFFFFF.
   */
  paper?: string;
}

/** Pareja tipográfica YA emparejada y probada en el round-trip. Solo familias
 *  registradas en ResumePDF: si una fuente rompe la extracción, no entra. */
export interface TemplateTypography {
  id: string;
  name: string;
  /** Familia del nombre y los encabezados. */
  display: string;
  /** Familia del cuerpo. */
  body: string;
  /** Familia de cifras/fechas (mono) — opcional. */
  mono?: string;
  /** Peso del nombre. Por defecto 600 (el de siempre). */
  displayWeight?: number;
  /** Qué familia rotula las secciones. Por defecto 'body' (el de siempre). */
  headingFamily?: "display" | "body";
  /** Fechas y cifras en la familia mono (exige `mono`). Por defecto false. */
  monoFigures?: boolean;
  /** El subtítulo (label) en cursiva de la familia display. Por defecto false. */
  labelItalic?: boolean;
}

/**
 * Métrica del documento: de aquí sale la variedad real dentro de una columna.
 * Solo los seis primeros campos son obligatorios; el resto son afinaciones cuyo
 * defecto es el documento clásico, para que añadir una plantilla sea barato.
 */
export interface TemplateMetrics {
  /** Tamaño del nombre (pt). */
  nameSize: number;
  /** Tamaño base del cuerpo (pt). */
  bodySize: number;
  /** Interlineado del cuerpo. */
  bodyLeading: number;
  /** Aire antes de cada encabezado de sección (pt). */
  sectionGap: number;
  /** Encabezados en MAYÚSCULAS. */
  upperHeadings: boolean;
  /** Filete bajo el encabezado de sección. */
  headingRule: boolean;

  // — Afinaciones opcionales (defecto = documento clásico) —
  /** Márgenes de página, con unidad ("18mm"). */
  pageMarginV?: string;
  pageMarginH?: string;
  /** Interlineado del nombre. Defecto 1.15. */
  nameLeading?: number;
  /** Subtítulo bajo el nombre. Defecto 11pt. */
  labelSize?: number;
  /** Líneas de contacto y enlaces. Defecto 9.5pt. */
  contactSize?: number;
  /** Encabezado de sección. Defecto 10.5pt / peso 700. */
  headingSize?: number;
  headingWeight?: number;
  /** Grosor del filete y aire entre texto y filete. Defecto 1 y 3pt. */
  headingRuleWidth?: number;
  headingRuleGap?: number;
  /** Cargo de experiencia y título de formación. Defecto 11pt y 10.5pt. */
  entryTitleSize?: number;
  eduTitleSize?: number;
  /** Fechas: tamaño y separación mínima respecto del cargo. Defecto 9.5pt y 12pt. */
  dateSize?: number;
  dateGap?: number;
  /** Aire sobre cada entrada de experiencia/formación. Defecto 8pt. */
  entryGap?: number;
  /** Aire sobre el resumen. Defecto 3pt. */
  summaryGap?: number;
  /** Aire sobre cada viñeta y su sangría francesa. Defecto 3 / 11 / 7.5pt. */
  bulletGap?: number;
  bulletIndent?: number;
  bulletHang?: number;
  /** Aire e interlineado de las líneas de habilidades. Defecto 1.5pt y 1.5. */
  skillGap?: number;
  skillLeading?: number;
  /** ¿El nombre va en el acento? Defecto true. */
  accentName?: boolean;
  /** ¿Los encabezados van en el acento? Defecto true. */
  accentHeadings?: boolean;
  /** Solo gama visual: ancho de la barra lateral y separación con el cuerpo. */
  sidebarWidth?: string;
  sidebarGap?: number;
}

export interface CvTemplate {
  id: string;
  /** Nombre visible en el selector. */
  name: string;
  gama: TemplateGama;
  /** Una línea: para qué sirve. */
  description: string;
  /** Solo gama 'visual': por qué no es apta para portales con ATS. */
  warning?: string;
  /**
   * Layout. La gama ATS es SIEMPRE una columna y sin foto.
   * `photo` describe si la COMPOSICIÓN reserva un hueco para la foto; la foto que
   * el usuario sube (data.photo) es un opt-in suyo y se respeta en cualquier
   * plantilla — eso ya funcionaba así y no se rompe.
   */
  layout: { columns: 1 | 2; photo: boolean; sidebar: boolean };
  palette: TemplatePalette;
  typography: TemplateTypography;
  metrics: TemplateMetrics;
  /**
   * ETIQUETAS para el selector. Una plantilla lleva varias; no son categorías
   * cerradas. Con treinta opciones el problema deja de ser la variedad y pasa a ser
   * la parálisis de elección, así que esto es curación, no taxonomía.
   * Vocabulario (usa SOLO estos ids; el selector los traduce):
   *   tono      → clasica · editorial · tecnica · minimal · moderna
   *   densidad  → 1pagina · 2paginas
   *   afinidad  → ingenieria · datos-ia · academia · general · primer-empleo
   * La gama (ats|visual) NO va aquí: ya es un campo propio.
   */
  tags?: TemplateTag[];
}

/** Vocabulario cerrado de etiquetas: si no está aquí, no es una etiqueta válida. */
export type TemplateTag =
  | "clasica" | "editorial" | "tecnica" | "minimal" | "moderna"
  | "1pagina" | "2paginas"
  | "ingenieria" | "datos-ia" | "academia" | "general" | "primer-empleo";

export const TEMPLATE_TAGS: readonly TemplateTag[] = [
  "clasica", "editorial", "tecnica", "minimal", "moderna",
  "1pagina", "2paginas",
  "ingenieria", "datos-ia", "academia", "general", "primer-empleo",
] as const;

/** Las etiquetas de una plantilla, siempre como array (nunca undefined). */
export function tagsOf(t: CvTemplate): TemplateTag[] {
  return t.tags ?? [];
}

/** Plantillas que llevan TODAS las etiquetas pedidas (filtro del selector). */
export function templatesByTags(tags: TemplateTag[]): CvTemplate[] {
  if (!tags.length) return listTemplates();
  return listTemplates().filter((t) => {
    const own = tagsOf(t);
    return tags.every((tag) => own.includes(tag));
  });
}

// ── Valores por defecto ───────────────────────────────────────────────────────
/**
 * La métrica CON los defaults aplicados. Vive aquí, y no dentro del render, por una
 * razón concreta: el test que comprueba que la jerarquía no depende del color mide
 * tamaños y pesos, y si los defaults estuvieran duplicados en ResumePDF y en el
 * test, un día dejarían de coincidir y el test estaría comprobando otro documento.
 * Los números son los del documento clásico: no declarar nada = el CV de siempre.
 */
export function resolveMetrics(m: TemplateMetrics): Required<TemplateMetrics> {
  return {
    nameSize: m.nameSize,
    bodySize: m.bodySize,
    bodyLeading: m.bodyLeading,
    sectionGap: m.sectionGap,
    upperHeadings: m.upperHeadings,
    headingRule: m.headingRule,
    pageMarginV: m.pageMarginV ?? "18mm",
    pageMarginH: m.pageMarginH ?? "20mm",
    nameLeading: m.nameLeading ?? 1.15,
    labelSize: m.labelSize ?? 11,
    contactSize: m.contactSize ?? 9.5,
    headingSize: m.headingSize ?? 10.5,
    headingWeight: m.headingWeight ?? 700,
    headingRuleWidth: m.headingRuleWidth ?? 1,
    headingRuleGap: m.headingRuleGap ?? 3,
    entryTitleSize: m.entryTitleSize ?? 11,
    eduTitleSize: m.eduTitleSize ?? 10.5,
    dateSize: m.dateSize ?? 9.5,
    dateGap: m.dateGap ?? 12,
    entryGap: m.entryGap ?? 8,
    summaryGap: m.summaryGap ?? 3,
    bulletGap: m.bulletGap ?? 3,
    bulletIndent: m.bulletIndent ?? 11,
    bulletHang: m.bulletHang ?? 7.5,
    skillGap: m.skillGap ?? 1.5,
    skillLeading: m.skillLeading ?? 1.5,
    accentName: m.accentName ?? true,
    accentHeadings: m.accentHeadings ?? true,
    sidebarWidth: m.sidebarWidth ?? "33%",
    sidebarGap: m.sidebarGap ?? 14,
  };
}

/** El peso del cuerpo del documento: fijo, y la referencia contra la que se mide
 *  que un encabezado o un cargo destaquen POR PESO y no solo por color. */
export const BODY_WEIGHT = 400;

/** La pareja tipográfica con sus defaults y los papeles ya repartidos. */
export function resolveTypography(ty: TemplateTypography) {
  const headingFamily = ty.headingFamily ?? "body";
  return {
    ...ty,
    displayWeight: ty.displayWeight ?? 600,
    headingFamily,
    monoFigures: ty.monoFigures ?? false,
    labelItalic: ty.labelItalic ?? false,
    /** Familia que rotula las secciones. */
    headingFace: headingFamily === "display" ? ty.display : ty.body,
    /** Familia de fechas y cifras (mono solo si la pareja la declara). */
    figuresFace: ty.monoFigures && ty.mono ? ty.mono : ty.body,
  };
}

/** El fondo real del documento cuando la paleta no lo declara (el PDF sale blanco). */
export const DEFAULT_PAPER = "#FFFFFF";

/** El papel contra el que se miden los contrastes de una paleta. */
export function paperOf(p: TemplatePalette): string {
  return p.paper ?? DEFAULT_PAPER;
}

/** El registro lo llena el catálogo; aquí solo vive el contrato de acceso. */
const REGISTRY = new Map<string, CvTemplate>();
const PALETTE_REGISTRY = new Map<string, TemplatePalette>();
const TYPOGRAPHY_REGISTRY = new Map<string, TemplateTypography>();

export function registerTemplate(t: CvTemplate): void {
  REGISTRY.set(t.id, t);
}

/** Paletas y parejas sueltas: se ofrecen aunque ninguna plantilla las use todavía. */
export function registerPalette(p: TemplatePalette): void {
  PALETTE_REGISTRY.set(p.id, p);
}
export function registerTypography(t: TemplateTypography): void {
  TYPOGRAPHY_REGISTRY.set(t.id, t);
}

/** Todas las plantillas, ATS primero (es la gama por defecto del producto). */
export function listTemplates(): CvTemplate[] {
  return [...REGISTRY.values()].sort((a, b) => (a.gama === b.gama ? 0 : a.gama === "ats" ? -1 : 1));
}

/** Todas las paletas del catálogo (las registradas + las que usa alguna plantilla). */
export function listPalettes(): TemplatePalette[] {
  const seen = new Map<string, TemplatePalette>(PALETTE_REGISTRY);
  for (const t of REGISTRY.values()) if (!seen.has(t.palette.id)) seen.set(t.palette.id, t.palette);
  return [...seen.values()];
}

export function listTypographies(): TemplateTypography[] {
  const seen = new Map<string, TemplateTypography>(TYPOGRAPHY_REGISTRY);
  for (const t of REGISTRY.values()) if (!seen.has(t.typography.id)) seen.set(t.typography.id, t.typography);
  return [...seen.values()];
}

/** Id de la plantilla por defecto: la gama ATS manda. */
export const DEFAULT_TEMPLATE_ID = "ats-clasica";

/**
 * La plantilla efectiva. Si el id no existe (o no se pidió ninguna), cae a la de
 * por defecto — nunca lanza: un id desconocido no puede dejar al usuario sin CV.
 */
export function getTemplate(id?: string | null): CvTemplate {
  if (id) {
    const t = REGISTRY.get(id);
    if (t) return t;
  }
  return REGISTRY.get(DEFAULT_TEMPLATE_ID) ?? [...REGISTRY.values()][0]!;
}

export function getPalette(id?: string | null): TemplatePalette | undefined {
  return id ? listPalettes().find((p) => p.id === id) : undefined;
}
export function getTypography(id?: string | null): TemplateTypography | undefined {
  return id ? listTypographies().find((t) => t.id === id) : undefined;
}

/** Lo que el documento pide: una plantilla y, si quiere, otra paleta u otra pareja. */
export interface TemplateSelection {
  templateId?: string | null;
  paletteId?: string | null;
  typographyId?: string | null;
}

/**
 * La plantilla efectiva CON los intercambios aplicados: el usuario elige plantilla
 * y, encima, puede cambiarle la paleta o la pareja tipográfica sin salirse del
 * catálogo. Ids desconocidos se ignoran (se conserva lo de la plantilla): un dato
 * viejo o corrupto no puede dejar a nadie sin CV.
 */
export function resolveTemplate(sel: TemplateSelection = {}): CvTemplate {
  const base = getTemplate(sel.templateId);
  const palette = getPalette(sel.paletteId);
  const typography = getTypography(sel.typographyId);
  if (!palette && !typography) return base;
  return { ...base, palette: palette ?? base.palette, typography: typography ?? base.typography };
}

/** ¿Hay catálogo cargado? (para que el render falle claro si nadie lo llenó). */
export function templateCount(): number {
  return REGISTRY.size;
}

// ── Carga del catálogo ────────────────────────────────────────────────────────
// Al importar este módulo el catálogo YA está registrado: quien consuma
// getTemplate()/listTemplates() no tiene que acordarse de importar nada más (un
// import de efecto secundario olvidado = selector vacío en producción).
for (const p of PALETTES) registerPalette(p);
for (const t of TYPOGRAPHIES) registerTypography(t);
for (const t of TEMPLATES) registerTemplate(t);
