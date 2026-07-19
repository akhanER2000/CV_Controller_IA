/**
 * CONTRATO del catálogo de plantillas. Este archivo define los TIPOS y el registro;
 * el diseño concreto (paletas, parejas tipográficas, ritmo vertical) lo llena el
 * catálogo. Lo consumen dos lados que no deben pisarse:
 *   · el render (ResumePDF) → traduce la plantilla a estilos del documento;
 *   · el editor            → pinta el selector con listTemplates().
 *
 * REGLA DURA (§C4): una plantilla de gama 'ats' solo entra al catálogo si pasa el
 * round-trip (nombre, email, teléfono, cargos, fechas y ORDEN de lectura). Las de
 * gama 'visual' están exentas del test pero DEBEN llevar `warning` — se muestra en
 * la UI, porque el usuario elige informado, no a ciegas.
 */

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
}

/** Métrica del documento: de aquí sale la variedad real dentro de una columna. */
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
  /** Layout. La gama ATS es SIEMPRE una columna y sin foto. */
  layout: { columns: 1 | 2; photo: boolean; sidebar: boolean };
  palette: TemplatePalette;
  typography: TemplateTypography;
  metrics: TemplateMetrics;
}

/** El registro lo llena el catálogo; aquí solo vive el contrato de acceso. */
const REGISTRY = new Map<string, CvTemplate>();

export function registerTemplate(t: CvTemplate): void {
  REGISTRY.set(t.id, t);
}

/** Todas las plantillas, ATS primero (es la gama por defecto del producto). */
export function listTemplates(): CvTemplate[] {
  return [...REGISTRY.values()].sort((a, b) => (a.gama === b.gama ? 0 : a.gama === "ats" ? -1 : 1));
}

export function listPalettes(): TemplatePalette[] {
  const seen = new Map<string, TemplatePalette>();
  for (const t of REGISTRY.values()) if (!seen.has(t.palette.id)) seen.set(t.palette.id, t.palette);
  return [...seen.values()];
}

export function listTypographies(): TemplateTypography[] {
  const seen = new Map<string, TemplateTypography>();
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

/** ¿Hay catálogo cargado? (para que el render falle claro si nadie lo llenó). */
export function templateCount(): number {
  return REGISTRY.size;
}
