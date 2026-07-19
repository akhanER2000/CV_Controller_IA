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

import type { CvTemplate, SectionId, TemplateMetrics, TemplatePalette, TemplateTypography } from "./templates";

// ── PALETAS ───────────────────────────────────────────────────────────────────
/**
 * Base del sistema: Grafito (tinta) · Pátina (acento) · Porcelana (papel). Las
 * variantes cambian SOLO el acento — un documento tiene un acento y nada más.
 *
 * Ninguna entra aquí "porque se ve bien": el ratio acento↔papel está calculado con
 * contrast.ts y tests/templates.test.ts lo recorre entero. Los valores medidos
 * contra papel #FFFFFF (todos pasan AA de texto normal, 4.5:1):
 *   pátina  #1F6E5A →  6.11:1 · cobre   #8C4A1E →  6.75:1
 *   acero   #2A5570 →  7.98:1 · tinta   #1F2528 → 15.52:1
 *   oliva   #4C5320 →  8.19:1 · ciruela #563377 →  9.83:1
 *   pizarra #3A4750 →  9.56:1 · granate #7A1F35 → 10.12:1
 *   marino  #1B3A6B → 11.27:1
 * Y las tintas: grafito #14181A → 17.87:1 · apagado #454B49 → 8.91:1.
 *
 * Las cinco últimas son de esta tanda. Ninguna es un tono "de moda": son las
 * familias cromáticas que faltaban para que treinta plantillas no acabaran repitiendo
 * verde, naranja y azul. Todas superan AA con holgura (la más justa, oliva, va a
 * 8,19 — casi el doble del mínimo) porque un acento de CV se imprime, se fotocopia y
 * se mira en pantallas malas.
 */
const GRAFITO = "#14181A"; // tinta principal
const APAGADO = "#454B49"; // texto secundario (fechas, ubicación)
const FILETE = "#D8DAD6"; // filete de sección
const PORCELANA = "#FFFFFF"; // papel del documento (el PDF no pinta fondo: es blanco)

/** Una paleta del sistema: solo cambia el acento; el resto de tintas son las neutras. */
const paleta = (id: string, name: string, accent: string): TemplatePalette => ({
  id,
  name,
  accent,
  ink: GRAFITO,
  muted: APAGADO,
  hair: FILETE,
  paper: PORCELANA,
});

export const PALETTES: TemplatePalette[] = [
  paleta("patina", "Pátina", "#1F6E5A"),
  paleta("cobre", "Cobre", "#8C4A1E"),
  paleta("acero", "Acero", "#2A5570"),
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
  paleta("granate", "Granate", "#7A1F35"),
  paleta("ciruela", "Ciruela", "#563377"),
  paleta("oliva", "Oliva", "#4C5320"),
  paleta("marino", "Marino", "#1B3A6B"),
  {
    // Pizarra: color que casi no lo es (croma 0.086). Para quien quiere que se note
    // que hay una decisión de color, pero no que hay color.
    id: "pizarra",
    name: "Pizarra",
    accent: "#3A4750",
    ink: GRAFITO,
    muted: APAGADO,
    hair: "#CFD3CE",
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
  {
    // La serif pone el nombre y la cursiva el subtítulo, pero las CIFRAS van en mono:
    // un documento con voz de redacción y datos que tabulan. Ni la clásica (serif sin
    // mono) ni instrumento (mono sin serif) hacen esto.
    id: "cronica",
    name: "Playfair + Geist + cifras mono",
    display: "Playfair Display",
    body: "Geist",
    mono: "Geist Mono",
    displayWeight: 600,
    headingFamily: "body",
    monoFigures: true,
    labelItalic: true,
  },
  {
    // La monoespaciada TITULA y rotula. Es la única pareja donde el nombre no está en
    // una proporcional, y se nota a un metro de distancia.
    // ⚠ Geist Mono solo existe en 400 y 500: quien use esta pareja no puede pedir
    // encabezados en 600/700 (lo fija un test — un peso que no existe se sustituye en
    // silencio y el documento sale distinto del que se diseñó).
    id: "terminal",
    name: "Geist Mono de titular",
    display: "Geist Mono",
    body: "Geist",
    mono: "Geist Mono",
    displayWeight: 500,
    headingFamily: "display",
    monoFigures: true,
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

// ── RITMOS ────────────────────────────────────────────────────────────────────
/**
 * Cinco RITMOS VERTICALES: el mismo contenido respirando de cinco maneras. Es el eje
 * que más cambia la sensación de un CV de una columna —más que la fuente y muchísimo
 * más que el color— y el que decide si el documento cabe en una página.
 *
 * Los extremos están RESERVADOS y no por gusto: "Compacta" (9 × 1,28, aire 8) y
 * "Editorial" (aire 18) son plantillas cuyo nombre es una promesa, y hay un test que
 * exige que sigan siendo la más densa y la más aireada del catálogo. Por eso el ritmo
 * `compacto` de aquí es un punto menos apretado que Compacta y `aireado` un punto
 * menos suelto que Editorial: ninguna plantilla nueva puede desbancarlas por accidente.
 */
const RITMO = {
  compacto: {
    nameSize: 17, labelSize: 10, contactSize: 8.8, bodySize: 9.2, bodyLeading: 1.32,
    sectionGap: 9.5, headingSize: 9.6, entryTitleSize: 10, eduTitleSize: 9.6,
    dateSize: 8.8, dateGap: 10, entryGap: 5.5, summaryGap: 2, bulletGap: 2,
    bulletIndent: 10, bulletHang: 7, skillGap: 1, skillLeading: 1.35,
    pageMarginV: "14mm", pageMarginH: "16mm",
  },
  denso: {
    nameSize: 19, labelSize: 10.5, contactSize: 9, bodySize: 9.6, bodyLeading: 1.4,
    sectionGap: 12, headingSize: 9.8, entryTitleSize: 10.5, eduTitleSize: 10,
    dateSize: 9, dateGap: 11, entryGap: 7, bulletGap: 2.5, bulletIndent: 10.5,
    bulletHang: 7, skillGap: 1.4, skillLeading: 1.45,
    pageMarginV: "17mm", pageMarginH: "18mm",
  },
  normal: {},
  amplio: {
    nameSize: 23, bodyLeading: 1.55, sectionGap: 16, headingSize: 10.8,
    entryGap: 10, summaryGap: 4, bulletGap: 3.5, skillGap: 2, skillLeading: 1.5,
    pageMarginV: "19mm", pageMarginH: "20mm",
  },
  aireado: {
    nameSize: 25, labelSize: 11.5, bodyLeading: 1.6, sectionGap: 17, headingSize: 11,
    entryGap: 11, summaryGap: 4, bulletGap: 4, skillGap: 2.5, skillLeading: 1.55,
    pageMarginV: "20mm", pageMarginH: "20mm",
  },
} satisfies Record<string, Partial<TemplateMetrics>>;

/** Una métrica = un ritmo + las decisiones de composición propias de la plantilla. */
const M = (ritmo: keyof typeof RITMO, extra: Partial<TemplateMetrics> = {}): TemplateMetrics => ({
  ...CLASICA,
  ...RITMO[ritmo],
  ...extra,
});

// ── ÓRDENES DE SECCIÓN ────────────────────────────────────────────────────────
/**
 * Qué se lee primero. No es decoración: un ATS y un humano puntúan lo que aparece
 * arriba, así que el orden es la decisión más estratégica del documento. Cinco
 * respuestas a "¿qué te vende a ti?".
 */
const ORDEN = {
  /** El de siempre: te vende lo que sabes hacer. */
  habilidades: ["summary", "skills", "work", "projects", "education"],
  /** Te vende dónde has estado: perfiles con recorrido. */
  experiencia: ["summary", "work", "projects", "skills", "education"],
  /** Te vende lo que has construido: portafolio por delante del cargo. */
  proyectos: ["summary", "projects", "work", "skills", "education"],
  /** Te vende el título: academia y primer empleo. */
  formacion: ["summary", "education", "skills", "work", "projects"],
  /** Cambio de carrera: lo que has hecho POR TU CUENTA antes que el empleo previo. */
  transicion: ["summary", "skills", "projects", "work", "education"],
} satisfies Record<string, readonly SectionId[]>;

// ── PLANTILLAS ────────────────────────────────────────────────────────────────
const P = (id: string): TemplatePalette => PALETTES.find((p) => p.id === id)!;
const T = (id: string): TemplateTypography => TYPOGRAPHIES.find((t) => t.id === id)!;

/** Atajo: toda la gama ATS comparte layout (una columna, sin foto, sin lateral). */
const UNA_COLUMNA = { columns: 1, photo: false, sidebar: false } as const;

/**
 * Una plantilla de gama ATS. El `layout` no se pide porque en esta gama no hay
 * decisión que tomar: si tuviera dos columnas, no sería de esta gama.
 */
const ats = (
  id: string,
  name: string,
  description: string,
  palette: string,
  typography: string,
  metrics: TemplateMetrics,
  tags: CvTemplate["tags"],
): CvTemplate => ({
  id, name, gama: "ats", description,
  layout: UNA_COLUMNA,
  palette: P(palette), typography: T(typography), metrics, tags,
});

export const TEMPLATES: CvTemplate[] = [
  // ── SOBRIAS ────────────────────────────────────────────────────────────────
  // El documento de toda la vida y sus variaciones de filete, numeración y ritmo.
  ats(
    "ats-clasica", "Clásica",
    "La conservadora: banca, sector público y perfiles senior. Es la de por defecto.",
    "patina", "clasica", CLASICA,
    ["clasica", "2paginas", "general"],
  ),
  ats(
    "ats-toga", "Toga",
    "Filete doble bajo cada sección y contacto en dos líneas. Formal sin ser rancia: derecho, banca, consultoría.",
    "marino", "clasica",
    M("amplio", { headingRuleStyle: "double", contactStyle: "split", headingTracking: 0.5 }),
    ["clasica", "2paginas", "general"],
  ),
  ats(
    "ats-expediente", "Expediente",
    "Secciones numeradas y sin filete, fechas en línea propia. Lee como un informe: ordenado y sin adornos.",
    "pizarra", "compacta",
    M("normal", {
      headingNumbered: true, headingRule: false, dateStyle: "own-line", bulletMarker: "dash",
    }),
    ["clasica", "2paginas", "general"],
  ),
  ats(
    "ats-memorando", "Memorando",
    "Filete ENCIMA del rótulo, contacto sin etiquetas y cero color: blanco y negro puro, para fotocopiar.",
    "tinta", "compacta",
    M("denso", {
      headingRulePosition: "above", contactLabels: false, skillStyle: "inline",
      accentName: false, accentHeadings: false,
    }),
    ["minimal", "1pagina", "general"],
  ),
  ats(
    "ats-registro", "Registro",
    "Fechas pegadas al cargo, viñeta de guion y habilidades a dos líneas. Densa y sin una sola línea decorativa.",
    "granate", "instrumento",
    M("denso", {
      dateStyle: "inline", bulletMarker: "dash", headingRule: false, skillStyle: "paired",
    }),
    ["tecnica", "1pagina", "ingenieria"],
  ),

  // ── EDITORIALES ────────────────────────────────────────────────────────────
  // Serif, aire y cursiva. El CV que se lee como una página de revista.
  ats(
    "ats-editorial", "Editorial",
    "Serif en el nombre y en los encabezados, mucho aire. Para perfiles de producto, diseño y academia.",
    "cobre", "editorial", EDITORIAL,
    ["editorial", "2paginas", "general"],
  ),
  ats(
    "ats-cronica", "Crónica",
    "Serif de titular, subtítulo en cursiva y cifras en monoespaciada. Filete corto: se insinúa, no subraya.",
    "granate", "cronica",
    // Las fechas en línea propia cuestan una línea por entrada, y el contacto en dos
    // líneas otra más: con el aire del ritmo `amplio` a pelo, la versión "de una
    // página" salía en dos. Una plantilla que promete una página y entrega dos no es
    // un estilo, es una promesa rota — así que aquí el aire se recorta hasta donde
    // la promesa se cumple, y no al revés.
    M("amplio", {
      headingRuleStyle: "partial", dateStyle: "own-line", contactStyle: "split",
      sectionGap: 13.5, entryGap: 8, bulletGap: 3, pageMarginV: "17mm",
    }),
    ["editorial", "2paginas", "general"],
  ),
  ats(
    "ats-ensayo", "Ensayo",
    "Encabezados en caja mixta y sin filete, viñeta de raya. El CV más silencioso del catálogo.",
    "ciruela", "editorial",
    M("aireado", {
      upperHeadings: false, headingRule: false, headingWeight: 600,
      bulletMarker: "emdash", skillStyle: "inline",
    }),
    ["editorial", "2paginas", "academia"],
  ),
  ats(
    "ats-portada", "Portada",
    "Nombre y contacto centrados bajo un filete, cuerpo alineado a la izquierda. Cabecera de libro.",
    "cobre", "editorial",
    M("amplio", {
      nameAlign: "center", nameRule: true, headingRuleStyle: "partial",
      contactStyle: "split", headingWeight: 600,
    }),
    ["editorial", "2paginas", "general"],
  ),
  ats(
    "ats-columna", "Columna",
    "Proyectos por delante del empleo, fechas en línea y raya de guion largo. Para quien se vende por lo que construye.",
    "oliva", "cronica",
    M("amplio", {
      sectionOrder: ORDEN.proyectos, dateStyle: "inline", bulletMarker: "emdash",
      headingRuleStyle: "partial",
    }),
    ["editorial", "2paginas", "datos-ia"],
  ),

  // ── TÉCNICAS ───────────────────────────────────────────────────────────────
  // Grotesca y monoespaciada. Densidad alta y cifras que tabulan.
  ats(
    "ats-instrumento", "Instrumento",
    "Grotesca en todo, densa y técnica, con las fechas en monoespaciada. Para ingeniería y datos.",
    "acero", "instrumento", INSTRUMENTO,
    ["tecnica", "1pagina", "ingenieria"],
  ),
  ats(
    "ats-terminal", "Terminal",
    "El nombre y los rótulos en monoespaciada, contacto sin etiquetas. Se reconoce a un metro de distancia.",
    "tinta", "terminal",
    M("denso", {
      headingWeight: 500, bulletMarker: "dash", dateStyle: "inline",
      contactLabels: false, skillStyle: "paired",
    }),
    ["tecnica", "1pagina", "ingenieria"],
  ),
  ats(
    "ats-consola", "Consola",
    "Secciones numeradas, sin filete y sin marcador de viñeta: solo sangría. Máxima densidad legible.",
    "acero", "terminal",
    M("compacto", {
      headingWeight: 500, headingNumbered: true, headingRule: false,
      skillStyle: "inline", bulletMarker: "none",
    }),
    ["tecnica", "1pagina", "ingenieria"],
  ),
  ats(
    "ats-esquema", "Esquema",
    "Experiencia por delante de habilidades, filete encima del rótulo y fechas en su propia línea.",
    "pizarra", "instrumento",
    M("normal", {
      headingRulePosition: "above", dateStyle: "own-line", sectionOrder: ORDEN.experiencia,
    }),
    ["tecnica", "2paginas", "ingenieria"],
  ),
  ats(
    "ats-telemetria", "Telemetría",
    "Filete doble, habilidades en una sola línea corrida y viñeta de guion. Para perfiles de datos.",
    "marino", "instrumento",
    M("denso", { headingRuleStyle: "double", skillStyle: "inline", bulletMarker: "dash" }),
    ["tecnica", "1pagina", "datos-ia"],
  ),

  // ── MÍNIMAS ────────────────────────────────────────────────────────────────
  // Quitar hasta que solo quede el contenido. Cada una quita una cosa distinta.
  ats(
    "ats-compacta", "Compacta",
    "Mete dos páginas de contenido en una sin ahogarse. Sin color: solo tinta, peso y filete.",
    "tinta", "compacta", COMPACTA,
    ["minimal", "1pagina", "general"],
  ),
  ats(
    "ats-minima", "Mínima",
    "Sin color, sin filetes, sin marcadores y sin etiquetas de contacto. Solo jerarquía tipográfica.",
    "tinta", "compacta",
    M("normal", {
      accentName: false, accentHeadings: false, headingRule: false, bulletMarker: "none",
      contactStyle: "split", contactLabels: false, skillStyle: "inline",
    }),
    ["minimal", "1pagina", "general"],
  ),
  ats(
    "ats-hoja", "Hoja",
    "Nombre en tinta y acento solo en los rótulos, con filete corto. El color aparece una vez por sección.",
    "oliva", "clasica",
    M("amplio", { accentName: false, headingRuleStyle: "partial", bulletMarker: "dash" }),
    ["minimal", "2paginas", "general"],
  ),
  ats(
    "ats-margen", "Margen",
    "Márgenes anchos, columna de texto estrecha y fechas en línea propia. Se lee sin cansarse.",
    "oliva", "compacta",
    M("normal", { pageMarginH: "26mm", dateStyle: "own-line", skillStyle: "paired" }),
    ["minimal", "2paginas", "general"],
  ),
  ats(
    "ats-silencio", "Silencio",
    "Ni filetes ni viñetas, contacto apilado línea a línea. Las secciones se anuncian solo con aire.",
    "pizarra", "clasica",
    M("amplio", { headingRule: false, bulletMarker: "none", contactStyle: "stacked" }),
    ["minimal", "2paginas", "general"],
  ),

  // ── MODERNAS ───────────────────────────────────────────────────────────────
  // Composición contemporánea: cabeceras centradas, numeración, nombre en caja alta.
  ats(
    "ats-titular", "Titular",
    "Nombre en mayúsculas con tracking bajo un filete, fechas pegadas al cargo. Empieza fuerte.",
    "granate", "compacta",
    M("normal", {
      nameSize: 19, nameCase: "upper", nameTracking: 1.1, nameRule: true,
      dateStyle: "inline", bulletMarker: "dash",
    }),
    ["moderna", "1pagina", "general"],
  ),
  ats(
    "ats-bandera", "Bandera",
    "Cabecera centrada con el contacto apilado y filete doble en las secciones. La de currículum americano.",
    "cobre", "clasica",
    M("normal", {
      nameAlign: "center", nameRule: true, contactStyle: "stacked", headingRuleStyle: "double",
    }),
    ["moderna", "2paginas", "general"],
  ),
  ats(
    "ats-pauta", "Pauta",
    "Secciones numeradas con filete corto y habilidades a dos líneas. Estructura visible sin ruido.",
    "ciruela", "compacta",
    M("normal", { headingNumbered: true, headingRuleStyle: "partial", skillStyle: "paired" }),
    ["moderna", "1pagina", "general"],
  ),
  ats(
    "ats-indice", "Índice",
    "Numeradas, con el filete encima del rótulo y la experiencia primero. Se navega como un índice.",
    "acero", "clasica",
    M("amplio", {
      headingNumbered: true, headingRulePosition: "above", sectionOrder: ORDEN.experiencia,
      bulletMarker: "emdash",
    }),
    ["moderna", "2paginas", "general"],
  ),
  ats(
    "ats-perfil", "Perfil",
    "Contacto apilado, fechas en línea propia y filete corto. Aire de ficha de perfil, en una columna.",
    "patina", "cronica",
    // Contacto apilado (tres líneas en vez de una) + fechas en línea propia: los dos
    // ejes que más alto añaden, juntos. El ritmo se aprieta para que quepa de verdad.
    M("normal", {
      contactStyle: "stacked", dateStyle: "own-line", headingRuleStyle: "partial",
      sectionGap: 11, entryGap: 6.5, pageMarginV: "16mm",
    }),
    ["moderna", "2paginas", "general"],
  ),

  // ── POR AFINIDAD ───────────────────────────────────────────────────────────
  // Lo que cambia no es el adorno: es QUÉ SE LEE PRIMERO.
  ats(
    "ats-academica", "Académica",
    "Formación por delante de todo y fechas en su propia línea. Para tesis, docencia e investigación.",
    "marino", "cronica",
    M("amplio", { sectionOrder: ORDEN.formacion, dateStyle: "own-line" }),
    ["editorial", "2paginas", "academia"],
  ),
  ats(
    "ats-primer-empleo", "Primer empleo",
    "El título primero y la experiencia al final, con filete corto. Cuando lo más fuerte que tienes es la carrera.",
    "oliva", "clasica",
    M("normal", {
      sectionOrder: ORDEN.formacion, contactStyle: "split", bulletMarker: "dash",
      headingRuleStyle: "partial",
    }),
    ["clasica", "1pagina", "primer-empleo"],
  ),
  ats(
    "ats-portafolio", "Portafolio",
    "Proyectos arriba del todo y habilidades en línea corrida. Para quien enseña obra, no cargos.",
    "ciruela", "editorial",
    M("amplio", {
      sectionOrder: ORDEN.proyectos, bulletMarker: "dash", contactStyle: "split",
      skillStyle: "inline", headingWeight: 600,
    }),
    ["editorial", "2paginas", "datos-ia"],
  ),
  ats(
    "ats-veterana", "Veterana",
    "Experiencia primero y todo comprimido: mucha trayectoria sin irse a tres páginas.",
    "marino", "compacta",
    M("compacto", {
      sectionOrder: ORDEN.experiencia, skillStyle: "inline", dateStyle: "inline",
      contactStyle: "split", bulletMarker: "dash",
    }),
    ["clasica", "1pagina", "general"],
  ),
  ats(
    "ats-transicion", "Transición",
    "Habilidades y proyectos antes del empleo anterior. Para cambiar de sector sin que el cargo viejo mande.",
    "granate", "clasica",
    M("normal", {
      sectionOrder: ORDEN.transicion, headingRuleStyle: "partial", contactStyle: "split",
      skillStyle: "paired",
    }),
    ["moderna", "2paginas", "primer-empleo"],
  ),

  // ── GAMA VISUAL ────────────────────────────────────────────────────────────
  // Se ven mejor y parsean peor. Cada una dice POR QUÉ en su `warning`.
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
    tags: ["clasica", "2paginas", "general"],
  },
  {
    id: "visual-dossier",
    name: "Dossier (con foto)",
    gama: "visual",
    description: "Lateral estrecha y cuerpo serif con mucho aire. Para dossieres, becas y candidaturas que se leen a mano.",
    warning:
      "No apta para portales con ATS: la barra lateral parte el documento en dos columnas y el parser mezcla el orden; además el aire extra empuja el contenido a más páginas de las que un filtro automático suele leer.",
    layout: { columns: 2, photo: true, sidebar: true },
    palette: P("ciruela"),
    typography: T("editorial"),
    metrics: M("amplio", { sidebarWidth: "30%", sidebarGap: 16, headingWeight: 600, headingRuleStyle: "partial" }),
    tags: ["editorial", "2paginas", "academia"],
  },
  {
    id: "visual-ficha",
    name: "Ficha (con foto)",
    gama: "visual",
    description: "Todo en una página: lateral compacta con contacto y habilidades, cuerpo denso con la experiencia.",
    warning:
      "No apta para portales con ATS: la barra lateral hace que el parser lea las habilidades y el contacto intercalados con la experiencia, y la densidad alta agrava los errores de columna.",
    layout: { columns: 2, photo: true, sidebar: true },
    palette: P("granate"),
    typography: T("compacta"),
    // Habilidades AGRUPADAS y no en línea corrida: en una lateral del 34 % una línea
    // que junta los cuatro grupos se parte donde puede, y el parser llega a recortar
    // palabras. La barra lateral ya penaliza bastante el parseo sin ayudarla.
    metrics: M("denso", { sidebarWidth: "34%", sidebarGap: 12, dateStyle: "inline" }),
    tags: ["moderna", "1pagina", "general"],
  },
  {
    id: "visual-cartel",
    name: "Cartel (sin rótulos)",
    gama: "visual",
    description: "Una columna sin rótulos de sección: los bloques se separan solo con aire. Para web, PDF de mano y portafolio.",
    warning:
      "No apta para portales con ATS: al quitar los rótulos de sección el parser se queda sin la señal que usa para saber dónde empieza la experiencia y dónde la formación, y suele meterlo todo en un mismo campo.",
    layout: { columns: 1, photo: false, sidebar: false },
    palette: P("oliva"),
    typography: T("clasica"),
    metrics: M("aireado", { headingLabel: false, bulletMarker: "none", contactStyle: "split" }),
    tags: ["minimal", "2paginas", "general"],
  },
];
