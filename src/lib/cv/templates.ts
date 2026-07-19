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

// ── EJES DE COMPOSICIÓN ───────────────────────────────────────────────────────
/**
 * Las secciones del documento, por su id. El ORDEN en que se listan es el orden de
 * lectura: el del PDF y el del texto plano, que son el mismo (eso es el candado).
 */
export type SectionId = "summary" | "skills" | "work" | "projects" | "education";

/** El orden de siempre. Sin declarar `sectionOrder`, el documento sale por aquí. */
export const DEFAULT_SECTION_ORDER: readonly SectionId[] = [
  "summary", "skills", "work", "projects", "education",
] as const;

/** Caja del nombre. Las versalitas de imprenta no existen en las .ttf del repo: lo
 *  que se puede hacer honestamente es mayúsculas (a un cuerpo menor, si se quiere). */
export type TextCase = "normal" | "upper";

/** Alineación de un bloque. La gama ATS admite centrado: sigue siendo una columna. */
export type BlockAlign = "left" | "center";

/** Tratamiento del filete de sección cuando `headingRule` está puesto. */
export type RuleStyle = "full" | "partial" | "double";
export type RulePosition = "below" | "above";

/** Cómo se reparte el contacto en líneas. */
export type ContactStyle = "inline" | "split" | "stacked";

/**
 * ⚠ POR QUÉ NO HAY EJE DE «GLIFOS EN EL CONTACTO». Estaba previsto un eje que
 * pusiera un glifo Unicode discreto delante de cada dato (✉ para el email, ☎ para
 * el teléfono), siempre con la etiqueta en texto al lado. No existe porque no se
 * PUEDE: las tres familias del repo (Geist, Geist Mono, Playfair Display) no traen
 * esos glifos — comprobado con fontkit, `glyphsForString("✉")` devuelve el glifo 0,
 * el .notdef. En @react-pdf un carácter sin glifo no falla: se dibuja vacío. El PDF
 * saldría con un hueco donde debería ir el icono y el texto plano escribiría el
 * carácter igualmente, así que documento y rayos-X dejarían de coincidir y el
 * round-trip caería. Y añadir un .ttf nuevo no está sobre la mesa. El único glifo
 * de esa familia que sí existe en Geist es ↗ (U+2197), que no es un icono de
 * contacto sino una flecha: no compensa montar un eje entero por ella.
 */

/**
 * Alineación del bloque de contacto. "inherit" = la de la cabecera (nameAlign),
 * que es lo de siempre. "right" da el patrón «nombre a la izquierda, contacto a la
 * derecha» SIN partir el documento en dos columnas: es el MISMO flujo, con los
 * párrafos del contacto alineados al otro lado. El parser lee exactamente igual.
 */
export type ContactAlign = "inherit" | "left" | "center" | "right";

/**
 * Dónde caen las fechas de una entrada.
 *  · right    — a la derecha del cargo, en la misma fila (flex, sin tablas).
 *  · inline   — pegadas al cargo, dentro del mismo párrafo.
 *  · own-line — en una línea propia bajo el cargo.
 *  · hanging  — en la COLUMNA COLGANTE de la izquierda. No se declara a mano: lo
 *               impone `skeleton: "hanging"` (resolveMetrics lo normaliza), porque
 *               la columna colgante ES el sitio de las fechas en ese esqueleto.
 */
export type DateStyle = "right" | "inline" | "own-line" | "hanging";

/**
 * ESQUELETO del documento — el eje que corrige la MEDIDA DE LÍNEA.
 *
 *  · "flat"    — todo a ancho completo. Es el de siempre y el valor por defecto.
 *  · "hanging" — COLUMNA COLGANTE: las fechas y la organización (la ubicación en
 *                experiencia, el centro en formación) caen en una columna estrecha
 *                a la izquierda, y el contenido —cargo, viñetas, resumen,
 *                habilidades— vive en el bloque restante. Los rótulos de sección
 *                se quedan a ras del margen, dentro de esa misma columna.
 *
 * POR QUÉ EXISTE. La medida efectiva de las plantillas planas es de ~96 caracteres
 * por línea (medido, no estimado: tests/medida-linea.test.ts reconstruye las líneas
 * del PDF agrupando los items de texto por coordenada Y). El óptimo de legibilidad
 * está en 45-75 y el techo accesible en 80. Un bloque al 72 % del ancho deja la
 * medida en ~69 caracteres, que es justo el centro del óptimo.
 *
 * ⚠ SE LEE COMO DOS COLUMNAS Y ES UN FLUJO ÚNICO. No hay tablas ni hay una barra
 * lateral: cada ENTRADA es una fila flex que se cierra en sí misma (wrap={false},
 * así que ninguna fila se parte entre páginas) y el resto de bloques son sangría.
 * El content stream sale en el orden: fechas → organización → cargo → viñetas, y
 * `entryLines` (resume.ts) emite EXACTAMENTE ese mismo orden en el texto plano.
 * Que el round-trip siga pasando es la prueba de que el orden de lectura aguanta.
 */
export type Skeleton = "flat" | "hanging";

/** Dónde se reserva hueco para la foto. "none" = sin hueco (el de siempre). */
export type PhotoSlot = "none" | "header-right";

/** Tratamiento del recorte de la foto. La circular NO es un eje de la gama ATS. */
export type PhotoShape = "square" | "rounded" | "circle";

/** Marcador de viñeta. `none` = solo sangría (el texto empieza sin glifo). */
export type BulletMarker = "dot" | "dash" | "emdash" | "none";

/** Cómo se agrupan las habilidades en líneas. */
export type SkillStyle = "grouped" | "inline" | "paired";

/**
 * El glifo de cada marcador. Vive AQUÍ y no en los dos renderizadores porque el
 * documento y su texto plano tienen que escribir exactamente el mismo carácter: si
 * el PDF pone "–" y el rayos-X pone "•", el round-trip deja de significar nada.
 */
export const BULLET_MARK: Record<BulletMarker, string> = {
  dot: "• ", // U+2022 — el de siempre
  dash: "- ", // guion normal: el que menos ensucia el parseo
  emdash: "— ", // U+2014
  none: "",
};

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

  // ── EJES DE COMPOSICIÓN (defecto = documento clásico) ──────────────────────
  // Aquí es donde dieciséis combinaciones de fuente y color dejan de ser dieciséis
  // formas de pintar el mismo CV y empiezan a ser documentos distintos. TODOS son
  // opcionales y su valor por defecto reproduce la clásica, así que ninguno de
  // estos campos cambia lo que ya existía.

  /** Caja del nombre. Defecto "normal" (tal cual lo escribió el usuario). */
  nameCase?: TextCase;
  /** Alineación de la CABECERA (nombre, subtítulo y contacto). Defecto "left". */
  nameAlign?: BlockAlign;
  /** Tracking del nombre en pt. Defecto 0 — ver la nota de `letterSpacing` en
   *  ResumePDF: pasado cierto punto el parser lee "D I E G O". */
  nameTracking?: number;
  /** Filete bajo el bloque de cabecera. Defecto false. */
  nameRule?: boolean;

  /** Tracking del encabezado de sección en pt. Defecto 0 (misma advertencia). */
  headingTracking?: number;
  /** Alineación del encabezado de sección. Defecto "left". */
  headingAlign?: BlockAlign;
  /** Lado del filete respecto del rótulo. Defecto "below". */
  headingRulePosition?: RulePosition;
  /** Tratamiento del filete (solo aplica si `headingRule`). Defecto "full". */
  headingRuleStyle?: RuleStyle;
  /** Ancho en pt del filete "partial". Defecto 34. */
  headingRuleInset?: number;
  /** Numerar las secciones ("01 · RESUMEN"). Defecto false. */
  headingNumbered?: boolean;
  /**
   * ¿Se rotula la sección? Defecto true. En false la sección se anuncia SOLO con
   * aire. Es un eje real de composición, pero un ATS clasifica por el rótulo:
   * quitarlo no es un estilo, es perder la señal. Por eso el catálogo lo usa
   * únicamente en la gama visual (lo fija un test).
   */
  headingLabel?: boolean;

  /** Reparto del contacto en líneas. Defecto "inline". */
  contactStyle?: ContactStyle;
  /** Prefijos "Email:" y "Tel:". Defecto true. */
  contactLabels?: boolean;

  /** Dónde caen las fechas de cada entrada. Defecto "right" (flex, sin tablas).
   *  Con `skeleton: "hanging"` este eje lo decide el esqueleto y se normaliza a
   *  "hanging": declarar otra cosa no lo cambia (una sola fuente de verdad). */
  dateStyle?: DateStyle;

  /** Esqueleto del documento. Defecto "flat" (ancho completo, el de siempre). */
  skeleton?: Skeleton;
  /** Ancho de la columna colgante, en % del ancho de texto. Defecto "28%".
   *  El contenido arranca EXACTAMENTE en este porcentaje, así que este número es
   *  la medida de línea: 28 % de columna deja el cuerpo al 72 %. */
  hangingWidth?: string;
  /** Aire entre la columna colgante y el contenido (pt). Va DENTRO de la columna
   *  (padding a su derecha) para que el contenido siga arrancando en `hangingWidth`
   *  y las sangrías de los bloques planos casen con él al milímetro. Defecto 10. */
  hangingGap?: number;

  /** Hueco reservado para la foto. Defecto "none". La foto que el usuario sube
   *  (data.photo) se respeta en cualquier plantilla; esto decide si la MAQUETA le
   *  hace sitio y dónde. Solo hay una posición: la esquina superior derecha, junto
   *  al bloque de nombre y contacto (nunca centrada arriba ni en banda). */
  photoSlot?: PhotoSlot;
  /** Recorte de la foto. Defecto "square". */
  photoShape?: PhotoShape;
  /** Ancho de la foto en pt; el alto sale de la proporción 35:45 (3,5×4,5 cm).
   *  Defecto 92 (≈3,25 cm de ancho, ≈4,2 cm de alto). */
  photoSize?: number;
  /** Filete fino alrededor de la foto. Defecto false. */
  photoBorder?: boolean;

  /** Alineación del bloque de contacto. Defecto "inherit" (sigue a nameAlign). */
  contactAlign?: ContactAlign;

  /** Rótulo de sección sobre un bloque de fondo tintado. Defecto false.
   *  Es un <Text> con fondo, NO una tabla ni una celda: no añade nodos al flujo. */
  headingBand?: boolean;

  /** Marcador de viñeta. Defecto "dot" (• U+2022). */
  bulletMarker?: BulletMarker;

  /** Reparto de las habilidades en líneas. Defecto "grouped" (una por grupo). */
  skillStyle?: SkillStyle;

  /** Orden de las secciones. Defecto DEFAULT_SECTION_ORDER. */
  sectionOrder?: readonly SectionId[];
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
export type ResolvedMetrics = Required<TemplateMetrics>;

export function resolveMetrics(m: TemplateMetrics): ResolvedMetrics {
  // El esqueleto DECIDE dónde caen las fechas: en la columna colgante no hay otro
  // sitio posible. Se normaliza aquí, y no en cada renderizador, porque el PDF y el
  // texto plano tienen que estar de acuerdo en el orden en que se emiten fechas,
  // organización y cargo — si cada uno lo dedujera por su cuenta, el round-trip
  // compararía dos documentos distintos.
  const skeleton = m.skeleton ?? "flat";
  return {
    nameSize: m.nameSize,
    bodySize: m.bodySize,
    bodyLeading: m.bodyLeading,
    sectionGap: m.sectionGap,
    upperHeadings: m.upperHeadings,
    headingRule: m.headingRule,
    // Márgenes: el mínimo del núcleo de legibilidad (≥20mm). Antes eran 18/20mm;
    // subirlos como DEFECTO significa que una plantilla que no declare nada nace
    // ya dentro del núcleo, en vez de nacer fuera y tener que acordarse.
    pageMarginV: m.pageMarginV ?? "20mm",
    pageMarginH: m.pageMarginH ?? "22mm",
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
    // El núcleo de la gama ATS dice: UN acento, y solo en rótulos y filetes. El
    // nombre se sostiene por tamaño y peso, que es lo que sobrevive a una fotocopia.
    accentName: m.accentName ?? false,
    accentHeadings: m.accentHeadings ?? true,
    sidebarWidth: m.sidebarWidth ?? "33%",
    sidebarGap: m.sidebarGap ?? 14,
    // Ejes de composición: todos caen en el documento clásico.
    nameCase: m.nameCase ?? "normal",
    nameAlign: m.nameAlign ?? "left",
    nameTracking: m.nameTracking ?? 0,
    nameRule: m.nameRule ?? false,
    headingTracking: m.headingTracking ?? 0,
    headingAlign: m.headingAlign ?? "left",
    headingRulePosition: m.headingRulePosition ?? "below",
    headingRuleStyle: m.headingRuleStyle ?? "full",
    headingRuleInset: m.headingRuleInset ?? 34,
    headingNumbered: m.headingNumbered ?? false,
    headingLabel: m.headingLabel ?? true,
    contactStyle: m.contactStyle ?? "inline",
    contactLabels: m.contactLabels ?? true,
    contactAlign: m.contactAlign ?? "inherit",
    dateStyle: skeleton === "hanging" ? "hanging" : (m.dateStyle ?? "right"),
    bulletMarker: m.bulletMarker ?? "dot",
    skillStyle: m.skillStyle ?? "grouped",
    sectionOrder: m.sectionOrder ?? DEFAULT_SECTION_ORDER,
    skeleton,
    hangingWidth: m.hangingWidth ?? "28%",
    hangingGap: m.hangingGap ?? 10,
    photoSlot: m.photoSlot ?? "none",
    photoShape: m.photoShape ?? "square",
    photoSize: m.photoSize ?? 92,
    photoBorder: m.photoBorder ?? false,
    headingBand: m.headingBand ?? false,
  };
}

/** Proporción de la foto de CV: 3,5 × 4,5 cm (el estándar de foto de documento). */
export const PHOTO_RATIO = 45 / 35;

/** El alto de la foto que corresponde a su ancho. */
export function photoHeight(m: ResolvedMetrics): number {
  return Math.round(m.photoSize * PHOTO_RATIO * 10) / 10;
}

// ── Traducción de los ejes a texto ────────────────────────────────────────────
/**
 * Estas tres funciones son la ÚNICA fuente de verdad de los ejes que cambian el
 * TEXTO del documento. Las llaman los dos renderizadores —el PDF y el texto plano
 * ("cómo lo lee el ATS")— precisamente para que no puedan discrepar: si el rótulo
 * numerado, la caja del nombre o el marcador de viñeta se calcularan dos veces, un
 * día dejarían de coincidir y el round-trip estaría comparando dos documentos
 * distintos sin enterarse.
 */

/** El nombre tal y como se IMPRIME (la caja es un eje de la plantilla). */
export function nameText(name: string, m: ResolvedMetrics): string {
  return m.nameCase === "upper" ? name.toUpperCase() : name;
}

/**
 * El rótulo de una sección tal y como se IMPRIME, con su numeral si lo lleva.
 * `index` es la posición de la sección ENTRE LAS VISIBLES (por eso hay que pasarla:
 * si una sección se queda vacía, la numeración se corre y las dos salidas tienen
 * que correrse igual). Devuelve null si la plantilla no rotula.
 *
 * Ojo: la caja NO se aplica aquí. En el PDF la ponen las mayúsculas de CSS
 * (textTransform) y en el texto plano un toUpperCase(); aplicarla en el string
 * cambiaría el documento por defecto, y ese tiene que salir idéntico al de siempre.
 */
export function headingLabelText(raw: string, index: number, m: ResolvedMetrics): string | null {
  if (!m.headingLabel) return null;
  return m.headingNumbered ? `${String(index + 1).padStart(2, "0")} · ${raw}` : raw;
}

/** El marcador de viñeta que escriben los dos renderizadores. */
export function bulletMark(m: ResolvedMetrics): string {
  return BULLET_MARK[m.bulletMarker];
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
