/**
 * EL CATÁLOGO. Aquí vive el DISEÑO (paletas, parejas tipográficas, métricas y las
 * plantillas que las combinan); en templates.ts vive el CONTRATO y el registro.
 * Este archivo solo importa TIPOS de templates.ts (`import type`, se borra al
 * compilar), así que no hay ciclo en tiempo de ejecución.
 *
 * DOS GAMAS, y las dos dicen la verdad:
 *
 *  · Gama ATS (por defecto) — UNA columna, sin foto, sin barras de nivel, sin
 *    iconos. Es la lista literal de causas de fallo de parseo que documentan los
 *    propios ATS. La variedad NO sale del layout: sale de la tipografía, del ritmo
 *    vertical, del peso, del filete y del acento. Que sea de una columna no la
 *    condena a ser fea — ahí está el oficio.
 *
 *  · Gama Visual (opt-in) — dos columnas, barra lateral, foto. Se ve mejor y
 *    parsea peor. Lleva `warning` OBLIGATORIO, porque el usuario elige informado.
 *
 * Lo que NO hacemos: clonar píxel a píxel las plantillas comerciales de siempre.
 * Sus patrones de layout son genéricos y se pueden usar; su "aprobado por ATS" es
 * marketing (ningún proveedor de ATS certifica plantillas de terceros) y su
 * composición típica —dos columnas, foto, barras, iconos— es justo lo que rompe el
 * parseo. Copiamos el oficio, no el producto ajeno.
 *
 * MATERIAL DISPONIBLE (src/lib/fonts/, no se añaden .ttf nuevos):
 *   Geist 400/500/600/700 · Geist Mono 400/500 · Playfair Display 500/600/Italic500
 */

import type { CvTemplate, TemplateMetrics, TemplatePalette, TemplateTypography } from "./templates";

// ── PALETAS ───────────────────────────────────────────────────────────────────
/**
 * Base del sistema: Grafito (tinta) · Pátina (acento) · Porcelana (papel). Las
 * variantes cambian SOLO el acento — un documento tiene un acento y nada más.
 *
 * Ninguna entra aquí "porque se ve bien": el ratio acento↔papel está calculado con
 * contrast.ts y tests/templates.test.ts lo recorre entero. Los valores medidos
 * contra papel #FFFFFF (todos pasan AA de texto normal, 4.5:1):
 *   pátina #1F6E5A → 6.11:1 · cobre #8C4A1E → 6.75:1
 *   acero  #2A5570 → 7.98:1 · tinta #1F2528 → 15.52:1
 * Y las tintas: grafito #14181A → 17.87:1 · apagado #454B49 → 8.91:1.
 */
const GRAFITO = "#14181A"; // tinta principal
const APAGADO = "#454B49"; // texto secundario (fechas, ubicación)
const FILETE = "#D8DAD6"; // filete de sección
const PORCELANA = "#FFFFFF"; // papel del documento (el PDF no pinta fondo: es blanco)

export const PALETTES: TemplatePalette[] = [
  {
    id: "patina",
    name: "Pátina",
    accent: "#1F6E5A",
    ink: GRAFITO,
    muted: APAGADO,
    hair: FILETE,
    paper: PORCELANA,
  },
  {
    id: "cobre",
    name: "Cobre",
    accent: "#8C4A1E",
    ink: GRAFITO,
    muted: APAGADO,
    hair: FILETE,
    paper: PORCELANA,
  },
  {
    id: "acero",
    name: "Acero",
    accent: "#2A5570",
    ink: GRAFITO,
    muted: APAGADO,
    hair: FILETE,
    paper: PORCELANA,
  },
  {
    // Sin color: el "acento" es tinta densa. Para quien no quiere color ninguno y
    // para fotocopias. El filete sube un punto porque aquí no hay color que ayude.
    id: "tinta",
    name: "Tinta neutra",
    accent: "#1F2528",
    ink: GRAFITO,
    muted: "#4A5250",
    hair: "#C9CCC7",
    paper: PORCELANA,
  },
];

// ── PAREJAS TIPOGRÁFICAS ──────────────────────────────────────────────────────
/**
 * Cuatro parejas YA emparejadas, no un selector de 200 fuentes. Con tres familias
 * el juego está en QUÉ PAPEL cumple cada una: quién pone el nombre, quién los
 * encabezados, quién las cifras.
 */
export const TYPOGRAPHIES: TemplateTypography[] = [
  {
    id: "clasica",
    name: "Playfair + Geist",
    display: "Playfair Display",
    body: "Geist",
    displayWeight: 600,
    headingFamily: "body", // encabezados en grotesca: sobrios, no compiten con el nombre
  },
  {
    id: "editorial",
    name: "Playfair de titular y encabezado",
    display: "Playfair Display",
    body: "Geist",
    displayWeight: 500, // titular más ligero: el aire hace el peso
    headingFamily: "display", // los encabezados TAMBIÉN en serif: aire de paper
    labelItalic: true, // el subtítulo en cursiva serif — la firma de la gama
  },
  {
    id: "instrumento",
    name: "Geist + Geist Mono",
    display: "Geist",
    body: "Geist",
    mono: "Geist Mono",
    displayWeight: 700,
    headingFamily: "body",
    monoFigures: true, // fechas y cifras en mono: tabulan y se leen como datos
  },
  {
    id: "compacta",
    name: "Geist",
    display: "Geist",
    body: "Geist",
    displayWeight: 700,
    headingFamily: "body",
  },
];

// ── MÉTRICAS ──────────────────────────────────────────────────────────────────
/**
 * MÉTRICA CLÁSICA — el estado del arte de hoy, número a número. Es el ancla de la
 * retrocompatibilidad: sin `templateId` el documento sale por aquí y debe ser
 * IDÉNTICO al de antes del sistema de plantillas (el golden es la prueba).
 */
const CLASICA: TemplateMetrics = {
  nameSize: 22,
  bodySize: 10,
  bodyLeading: 1.45,
  sectionGap: 13,
  upperHeadings: true,
  headingRule: true,
  pageMarginV: "18mm",
  pageMarginH: "20mm",
  nameLeading: 1.15,
  labelSize: 11,
  contactSize: 9.5,
  headingSize: 10.5,
  headingWeight: 700,
  headingRuleWidth: 1,
  headingRuleGap: 3,
  entryTitleSize: 11,
  eduTitleSize: 10.5,
  dateSize: 9.5,
  dateGap: 12,
  entryGap: 8,
  summaryGap: 3,
  bulletGap: 3,
  bulletIndent: 11,
  bulletHang: 7.5,
  skillGap: 1.5,
  skillLeading: 1.5,
  accentName: true,
  accentHeadings: true,
};

/** EDITORIAL — mucho aire, titular serif grande, encabezados serif. Aire de paper. */
const EDITORIAL: TemplateMetrics = {
  ...CLASICA,
  nameSize: 26,
  nameLeading: 1.1,
  labelSize: 11.5,
  bodyLeading: 1.6,
  sectionGap: 18, // el aire de la gama: la sección se anuncia con silencio
  headingSize: 11,
  headingWeight: 600, // Playfair 600 (no hay 700 serif, y no hace falta)
  headingRuleGap: 4,
  entryGap: 11,
  summaryGap: 4,
  bulletGap: 4,
  skillGap: 2.5,
  skillLeading: 1.55,
  // El aire va DENTRO del texto (interlineado y silencios), no en los márgenes:
  // subir el margen vertical a 22mm se veía igual de bien y hacía que la versión de
  // una página se desbordara a dos — un CV "de una página" que sale en dos es un
  // fallo, no un estilo. Y el margen horizontal se queda en 20mm para que ningún
  // cargo largo se parta en dos líneas.
  pageMarginV: "20mm",
  pageMarginH: "20mm",
};

/** INSTRUMENTO — grotesca en todo, denso, técnico, cifras en mono, sin filete. */
const INSTRUMENTO: TemplateMetrics = {
  ...CLASICA,
  nameSize: 19,
  labelSize: 10.5,
  contactSize: 9,
  bodySize: 9.6,
  bodyLeading: 1.4,
  sectionGap: 12,
  headingSize: 9.5,
  headingWeight: 700,
  headingRule: false, // la jerarquía la sostienen MAYÚSCULAS + peso 700, no una línea
  entryTitleSize: 10.5,
  eduTitleSize: 10,
  dateSize: 9,
  entryGap: 7,
  bulletGap: 2.5,
  bulletIndent: 10.5,
  bulletHang: 7,
  skillGap: 1.5,
  skillLeading: 1.45,
  accentName: false, // el nombre en tinta: aquí el acento es para los encabezados
  pageMarginV: "17mm",
  pageMarginH: "18mm",
};

/** COMPACTA — dos páginas de contenido en una, sin ahogarse. Métrica apretada. */
const COMPACTA: TemplateMetrics = {
  ...CLASICA,
  nameSize: 16,
  nameLeading: 1.1,
  labelSize: 10,
  contactSize: 8.5,
  bodySize: 9,
  bodyLeading: 1.28,
  sectionGap: 8,
  headingSize: 9.5,
  headingWeight: 700,
  headingRuleGap: 2,
  entryTitleSize: 9.8,
  eduTitleSize: 9.5,
  dateSize: 8.5,
  dateGap: 10,
  entryGap: 4.5,
  summaryGap: 2,
  bulletGap: 1.5,
  bulletIndent: 10,
  bulletHang: 7,
  skillGap: 1,
  skillLeading: 1.3,
  pageMarginV: "13mm",
  pageMarginH: "15mm",
};

/** LATERAL — gama visual. Métrica de la clásica, composición de dos columnas. */
const LATERAL: TemplateMetrics = {
  ...CLASICA,
  nameSize: 21,
  sectionGap: 12,
  headingSize: 10,
  sidebarWidth: "33%",
  sidebarGap: 14,
};

// ── PLANTILLAS ────────────────────────────────────────────────────────────────
const P = (id: string): TemplatePalette => PALETTES.find((p) => p.id === id)!;
const T = (id: string): TemplateTypography => TYPOGRAPHIES.find((t) => t.id === id)!;

export const TEMPLATES: CvTemplate[] = [
  {
    id: "ats-clasica",
    name: "Clásica",
    gama: "ats",
    description: "La conservadora: banca, sector público y perfiles senior. Es la de por defecto.",
    layout: { columns: 1, photo: false, sidebar: false },
    palette: P("patina"),
    typography: T("clasica"),
    metrics: CLASICA,
  },
  {
    id: "ats-editorial",
    name: "Editorial",
    gama: "ats",
    description: "Serif en el nombre y en los encabezados, mucho aire. Para perfiles de producto, diseño y academia.",
    layout: { columns: 1, photo: false, sidebar: false },
    palette: P("cobre"),
    typography: T("editorial"),
    metrics: EDITORIAL,
  },
  {
    id: "ats-instrumento",
    name: "Instrumento",
    gama: "ats",
    description: "Grotesca en todo, densa y técnica, con las fechas en monoespaciada. Para ingeniería y datos.",
    layout: { columns: 1, photo: false, sidebar: false },
    palette: P("acero"),
    typography: T("instrumento"),
    metrics: INSTRUMENTO,
  },
  {
    id: "ats-compacta",
    name: "Compacta",
    gama: "ats",
    description: "Mete dos páginas de contenido en una sin ahogarse. Sin color: solo tinta, peso y filete.",
    layout: { columns: 1, photo: false, sidebar: false },
    palette: P("tinta"),
    typography: T("compacta"),
    metrics: COMPACTA,
  },
  {
    id: "visual-lateral",
    name: "Lateral (con foto)",
    gama: "visual",
    description: "Barra lateral con contacto, habilidades y formación; foto opcional. Para enviar por correo o a mano.",
    warning:
      "No apta para portales con ATS: la barra lateral crea dos columnas y muchos parsers leen el documento en el orden equivocado — el contacto y las habilidades se intercalan con la experiencia.",
    layout: { columns: 2, photo: true, sidebar: true },
    palette: P("patina"),
    typography: T("clasica"),
    metrics: LATERAL,
  },
];
