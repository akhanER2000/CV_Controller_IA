/**
 * EL CATÁLOGO. Aquí vive el DISEÑO (paletas, parejas tipográficas, métricas y las
 * plantillas que las combinan); en templates.ts vive el CONTRATO y el registro.
 * Este archivo solo importa TIPOS de templates.ts (`import type`, se borra al
 * compilar), así que no hay ciclo en tiempo de ejecución.
 *
 * DOS GAMAS, y las dos dicen la verdad:
 *
 *  · Gama ATS (por defecto) — UNA columna, sin barras de nivel, sin iconos junto a
 *    los rótulos. Es la lista literal de causas de fallo de parseo que documentan
 *    los propios ATS. La variedad NO sale del layout: sale del ESQUELETO, de la
 *    tipografía, del ritmo vertical, del peso, del filete y del acento.
 *
 *  · Gama Visual (opt-in) — dos columnas, barra lateral, foto como eje. Se ve mejor
 *    y parsea peor. Lleva `warning` OBLIGATORIO: el usuario elige informado.
 *
 * ── EL NÚCLEO NO NEGOCIABLE DE LA GAMA ATS ───────────────────────────────────
 * Se cumple en el 100 % de la gama y lo verifica un test (tests/templates.test.ts,
 * bloque «núcleo de legibilidad»), no la buena voluntad de quien añade plantillas:
 *
 *   · una columna · contacto en el CUERPO · rótulos estándar, nunca renombrados
 *   · MEDIDA ≤ 90 caracteres por línea (objetivo 65-85), MEDIDA de verdad: la
 *     mide tests/medida-linea.test.ts reconstruyendo las líneas del PDF
 *   · márgenes ≥ 20 mm · cuerpo 10-11 pt · interlineado 1,15-1,3
 *   · 12-16 pt de aire entre secciones · máximo DOS familias tipográficas
 *   · UN acento, y solo en rótulos y filetes — el documento funciona en gris
 *   · sin barras de nivel · sin emojis · sin QR por defecto
 *
 * ── POR QUÉ CAMBIÓ LA MEDIDA (el defecto invisible) ──────────────────────────
 * Medidos los caracteres por línea REALES de las treinta plantillas anteriores
 * (agrupando los items de texto del PDF por coordenada Y), la mediana salía en
 * 57-68 —que engaña, porque promedia las líneas finales de párrafo— pero el p90
 * estaba en 94-99 y el máximo entre 111 y 126. Entre un cuarto y un tercio de las
 * líneas de cuerpo pasaban de 80, el techo accesible, contra un óptimo de
 * legibilidad de 45-75. No se veía a ojo y afectaba a las treinta por igual,
 * porque todas compartían los mismos márgenes.
 *
 * Se corrige por dos caminos, y cada plantilla toma el que le sienta:
 *   · COLUMNA COLGANTE (`skeleton: "hanging"`) — fechas y organización a la
 *     izquierda, contenido en el ~72 % restante. Deja el p90 en 68-77 caracteres,
 *     el centro del óptimo, y es el camino más barato en papel.
 *   · MÁRGENES ANCHOS — sin columna, subiendo el margen horizontal hasta donde la
 *     medida cae sola. Deja el p90 en 81-86. Ojo a la aritmética, que es
 *     contraintuitiva: la medida se cuenta en CARACTERES, así que cuanto MENOR es
 *     el cuerpo MÁS margen hace falta (en 425 pt caben más letras de 10 pt que de
 *     11). Por eso el margen plano va de 35 mm en el ritmo compacto a 29 mm en el
 *     aireado, y no al revés, que es lo que parecería.
 *
 * La constante que sale de medir, por si alguien tiene que recalcularlo: en este
 * texto en español, Geist llena la línea a razón de ~0,445 em por carácter. El
 * máximo de caracteres de una línea es W / (0,445 × cuerpo) y el p90 anda un 7 %
 * por debajo. No se usa para decidir nada — se decide midiendo — pero orienta.
 *
 * ── LO QUE SE QUITÓ, Y POR QUÉ ───────────────────────────────────────────────
 *   · MONOESPACIADA en la gama técnica — fuera, ni de titular ni en las cifras.
 *     Sigue existiendo como pareja del catálogo (`terminal`), que es donde debe
 *     estar una opción minoritaria: al alcance de quien la quiera a propósito.
 *   · NUMERACIÓN de secciones («01 · RESUMEN») — no hay evidencia a favor y añade
 *     ruido al parser. Queda en dos plantillas, nunca como eje protagonista.
 *   · ICONOS junto a los rótulos de sección — no los había y no los va a haber:
 *     confunden al parser sobre dónde empieza la sección. Glifos, si acaso, solo
 *     en el bloque de contacto y siempre con la etiqueta en texto al lado.
 *
 * Lo que NO hacemos: clonar píxel a píxel las plantillas comerciales de siempre.
 * Sus patrones de layout son genéricos y se pueden usar; su "aprobado por ATS" es
 * marketing (ningún proveedor de ATS certifica plantillas de terceros) y su
 * composición típica —dos columnas, barras, iconos— es justo lo que rompe el
 * parseo. Copiamos el oficio, no el producto ajeno.
 *
 * MATERIAL DISPONIBLE (src/lib/fonts/, no se añaden .ttf nuevos):
 *   Geist 400/500/600/700 · Geist Mono 400/500 · Playfair Display 500/600/Italic500
 */

import type { CvTemplate, SectionId, TemplateMetrics, TemplatePalette, TemplateTypography } from "./templates";

// ── PALETAS ───────────────────────────────────────────────────────────────────
/**
 * Base del sistema: Grafito (tinta) · Pátina (acento) · Porcelana (papel). Las
 * variantes cambian SOLO el acento — un documento tiene un acento y nada más, y en
 * la gama ATS ese acento vive únicamente en los rótulos y los filetes.
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
 */
const GRAFITO = "#14181A"; // tinta principal
const APAGADO = "#454B49"; // texto secundario (fechas, ubicación)
const FILETE = "#D8DAD6"; // filete de sección (y fondo de la banda de rótulo)
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
 * Seis parejas YA emparejadas, no un selector de 200 fuentes. Con tres familias el
 * juego está en QUÉ PAPEL cumple cada una: quién pone el nombre, quién los
 * encabezados, quién las cifras.
 *
 * ⚠ NINGUNA PAREJA DE LA GAMA ATS LLEVA MONOESPACIADA. Ni de titular ni en las
 * cifras ni, por supuesto, en el cuerpo. El motivo no es una certeza —la encuesta
 * que sitúa las monoespaciadas al fondo del ranking la pagó un marketplace de
 * tipografías y mide preferencia declarada, no conducta— pero el coste de
 * equivocarse es asimétrico: si acierta, la mono penaliza; si falla, no haber
 * usado mono no cuesta nada. Por eso `terminal` sigue en el catálogo (quien la
 * quiera la elige) y ninguna plantilla técnica la trae puesta.
 *
 * Y ninguna pareja de la gama ATS usa más de DOS familias: `cronica` cambió sus
 * cifras mono por la cursiva del subtítulo justo por eso.
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
    // Grotesca en todo, en DOS pesos: el nombre y los rótulos en 600, el cuerpo en
    // 400. Era la pareja de las cifras mono; ahora la tensión la hace el peso, que
    // es lo que aguanta una fotocopia y no despista a un parser.
    id: "instrumento",
    name: "Geist en dos pesos",
    display: "Geist",
    body: "Geist",
    displayWeight: 600,
    headingFamily: "display",
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
    // La serif pone el nombre y la cursiva el subtítulo; los rótulos vuelven a la
    // grotesca. Voz de redacción, dos familias, cero mono.
    id: "cronica",
    name: "Playfair con subtítulo en cursiva",
    display: "Playfair Display",
    body: "Geist",
    displayWeight: 600,
    headingFamily: "body",
    labelItalic: true,
  },
  {
    // LA OPCIÓN MONO, y es minoritaria a propósito: ninguna plantilla de la gama
    // ATS la trae puesta. Está aquí para quien la elija a sabiendas desde el
    // selector de parejas, y la usa una plantilla de gama visual.
    // ⚠ Geist Mono solo existe en 400 y 500: quien use esta pareja no puede pedir
    // encabezados en 600/700 (lo fija un test — un peso que no existe se sustituye
    // en silencio y el documento sale distinto del que se diseñó).
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

// ── MÉTRICA BASE ──────────────────────────────────────────────────────────────
/**
 * LA BASE — los seis números obligatorios del contrato, ya dentro del núcleo:
 * cuerpo 10,5 pt, interlineado 1,25, 14 pt entre secciones. Todo lo demás lo pone
 * resolveMetrics() con sus valores por defecto, que también son los del núcleo
 * (márgenes 20/22 mm, acento fuera del nombre). Consecuencia buscada: una plantilla
 * que solo declare la base nace ya conforme, en vez de nacer fuera y tener que
 * acordarse de arreglarlo.
 */
const BASE: TemplateMetrics = {
  nameSize: 21,
  bodySize: 10.5,
  bodyLeading: 1.25,
  sectionGap: 14,
  upperHeadings: true,
  headingRule: true,
};

/**
 * CLÁSICA — la base y UNA sola decisión más: el margen horizontal que le baja la
 * medida de 96 caracteres a 83. Es la plantilla que menos decisiones toma de todo el
 * catálogo, y un test la fija exactamente así: "los defaults del contrato, con el
 * margen que su cuerpo necesita".
 *
 * ⚠ POR QUÉ LA CLÁSICA NO CUELGA LA COLUMNA, siendo el esqueleto que mejor arregla
 * la medida. Porque es la plantilla POR DEFECTO, y el documento por defecto está
 * atado byte a byte al golden (src/lib/cv/fixtures/cv-texto-plano.txt): ese fichero
 * dice «Backend Developer — Altiplano Pagos SpA mar 2022 – hoy», con las fechas
 * pegadas al cargo. La columna colgante emite fechas, organización y cargo en tres
 * líneas y en otro orden —tiene que hacerlo, porque es el orden en que el parser las
 * lee— así que adoptarla en la clásica habría obligado a regenerar el golden, y el
 * golden es justo la prueba de que meter un sistema de plantillas no le cambió el CV
 * a nadie. La medida se le arregla por el otro camino, que para eso hay dos.
 */
const CLASICA: TemplateMetrics = { ...BASE, pageMarginH: "32mm" };

// ── RITMOS ────────────────────────────────────────────────────────────────────
/**
 * Cinco RITMOS VERTICALES dentro del núcleo (cuerpo 10-11, interlineado 1,15-1,3,
 * aire 12-16). Es el eje que más cambia la sensación de un CV de una columna —más
 * que la fuente y muchísimo más que el color— y el que decide cuánto cabe.
 *
 * Cada ritmo trae SU margen horizontal para el esqueleto plano, y ese número no es
 * decorativo: es el que deja la medida en ~84 caracteres. La aritmética sorprende
 * —el cuerpo pequeño necesita MÁS margen, porque en 470 pt caben más letras de
 * 10 pt que de 11— y por eso el margen baja de 31 mm a 24 mm según el ritmo sube.
 * Los esqueletos colgantes pisan ese margen: allí la medida la fija la columna.
 *
 * Los extremos están RESERVADOS: "Compacta" (10 × 1,15, aire 12) y "Editorial"
 * (aire 16) son plantillas cuyo nombre es una promesa, y hay un test que exige que
 * sigan siendo la más densa y la más aireada. Ninguna otra puede empatar con ellas.
 */
const RITMO = {
  compacto: {
    nameSize: 16, labelSize: 10, contactSize: 8.8, bodySize: 10, bodyLeading: 1.15,
    sectionGap: 12, headingSize: 10, headingRuleGap: 2, entryTitleSize: 10.4,
    eduTitleSize: 10, dateSize: 9, dateGap: 10, entryGap: 5, summaryGap: 2,
    bulletGap: 1.5, bulletIndent: 10, bulletHang: 7, skillGap: 1, skillLeading: 1.3,
    pageMarginV: "20mm", pageMarginH: "35mm",
  },
  denso: {
    nameSize: 18, labelSize: 10.5, contactSize: 9, bodySize: 10.2, bodyLeading: 1.2,
    sectionGap: 13, headingSize: 10.2, entryTitleSize: 10.8, eduTitleSize: 10.4,
    dateSize: 9.2, dateGap: 11, entryGap: 6.5, summaryGap: 2.5, bulletGap: 2.5,
    bulletIndent: 10.5, bulletHang: 7, skillGap: 1.2, skillLeading: 1.4,
    pageMarginV: "20mm", pageMarginH: "34mm",
  },
  normal: { pageMarginH: "32mm" },
  amplio: {
    nameSize: 23, labelSize: 11.2, bodySize: 10.8, bodyLeading: 1.28, sectionGap: 15,
    headingSize: 10.8, entryGap: 9.5, summaryGap: 4, bulletGap: 3.5, skillGap: 2,
    skillLeading: 1.5, pageMarginV: "21mm", pageMarginH: "30mm",
  },
  aireado: {
    nameSize: 25, labelSize: 11.5, bodySize: 11, bodyLeading: 1.3, sectionGap: 15.5,
    headingSize: 11, entryGap: 11, summaryGap: 4, bulletGap: 4, skillGap: 2.5,
    skillLeading: 1.55, pageMarginV: "21mm", pageMarginH: "29mm",
  },
} satisfies Record<string, Partial<TemplateMetrics>>;

// ── ESQUELETOS ────────────────────────────────────────────────────────────────
/**
 * DIECIOCHO ESQUELETOS, no cincuenta diseños sueltos. Un esqueleto es una decisión
 * de ARMAZÓN —dónde cae la identidad, dónde caen las fechas, cómo se anuncia la
 * sección, cuánto mide la línea— y las cincuenta plantillas son ese armazón
 * combinado con un ritmo, una paleta, una pareja y un orden de secciones.
 *
 * Los colgantes se distinguen entre sí por el ancho de la columna, que es lo mismo
 * que decir: por la medida de línea que dejan (24 % → ~67 car., 28 % → ~64,
 * 32 % → ~62). No es un adorno: es el número que se estaba corrigiendo.
 */
const ESQ = {
  /** Plano de toda la vida: filete completo bajo el rótulo, fechas a la derecha. */
  plana: {},
  /** Columna colgante estándar. El esqueleto de la plantilla por defecto. */
  colgante: { skeleton: "hanging", hangingWidth: "28%", pageMarginH: "22mm" },
  /** Colgante ancha: casi un tercio de columna; la línea más corta del catálogo. */
  colganteAncha: { skeleton: "hanging", hangingWidth: "32%", pageMarginH: "21mm" },
  /** Colgante fina: la columna insinúa la rejilla y el contenido gana aire. */
  colganteFina: { skeleton: "hanging", hangingWidth: "24%", pageMarginH: "23mm" },
  /** Rótulo sobre bloque tintado (fondo, no tabla) y sin filete: el rótulo ES el filete. */
  banda: { headingBand: true, headingRule: false },
  /** Cabecera de libro: nombre y contacto centrados bajo un filete. */
  portada: { nameAlign: "center", nameRule: true, headingRuleStyle: "partial", contactStyle: "split" },
  /** Nombre en caja alta con tracking bajo un filete: empieza fuerte. */
  titular: { nameCase: "upper", nameTracking: 1.1, nameRule: true },
  /** Informe: secciones numeradas, sin filete, fechas en línea propia. */
  expediente: { headingNumbered: true, headingRule: false, dateStyle: "own-line" },
  /** Las fechas en su propia línea bajo el cargo y un filete corto por rótulo. */
  lineaPropia: { dateStyle: "own-line", headingRuleStyle: "partial" },
  /** Las fechas pegadas al cargo, dentro del mismo párrafo, y cero filetes. */
  enLinea: { dateStyle: "inline", headingRule: false },
  /** Ni filetes ni marcadores: las secciones se anuncian solo con aire y márgenes. */
  silencio: { headingRule: false, bulletMarker: "none", pageMarginH: "33mm" },
  /** Currículum americano: cabecera centrada, contacto apilado, filete doble. */
  bandera: { nameAlign: "center", contactStyle: "stacked", headingRuleStyle: "double" },
  /** Cornisa: el filete ENCIMA del rótulo, como el titulillo de una página impresa. */
  cornisa: { headingRulePosition: "above" },
  /** Márgenes de libro de bolsillo: la medida más corta que se puede tener sin columna. */
  margen: { pageMarginH: "36mm", skillStyle: "paired" },
  /** Contacto alineado a la derecha frente al nombre. Mismo flujo, no dos columnas. */
  credencial: { contactAlign: "right", contactStyle: "split" },
  /** Hueco de foto en la esquina superior derecha, junto al nombre y el contacto. */
  retrato: { photoSlot: "header-right", contactStyle: "stacked" },
  /** Hueco de foto sobre columna colgante: la rejilla sostiene la imagen. */
  retratoColgante: { skeleton: "hanging", hangingWidth: "26%", pageMarginH: "22mm", photoSlot: "header-right" },
  /** Sin ornamento ninguno: ni filete, ni marcador de viñeta, ni etiquetas. */
  taller: { headingRule: false, contactLabels: false, skillStyle: "inline" },
  /**
   * CABECERA CORRIDA. El nombre y el título objetivo comparten línea y el contacto
   * va debajo: donde la clásica gasta CUATRO líneas, esta gasta TRES. La ganancia
   * sale de la COMPOSICIÓN, no de apretar el cuerpo — el ritmo se queda dentro del
   * núcleo y `ats-compacta` sigue siendo estrictamente la más densa del catálogo.
   *
   * No son dos líneas, que es lo que se pedía, porque la tercera no depende de la
   * composición sino de los datos: el contacto entero (email, teléfono, ciudad y
   * enlaces) son ~140 caracteres, y el techo de la gama son 110 por línea. Se queda
   * en dos líneas de contacto, que es el mínimo que permite la medida de línea.
   *
   * Los tres números de cabecera (nombre 17, título 10,5, contacto 9) bajan porque
   * un nombre de 21 pt al lado de un título de 11 pt es una fila desequilibrada:
   * en vertical el nombre grande se sostenía solo, en horizontal compite. El
   * `headingSize` se deja en el 10,5 por defecto a propósito, para que el ahorro
   * medido sea atribuible a la cabecera y no a un rótulo más pequeño.
   */
  dosLineas: {
    headerInline: true,
    nameSize: 17,
    nameLeading: 1.1,
    labelSize: 10.5,
    contactSize: 9,
    contactStyle: "inline",
    headingSize: 10.5,
  },
} satisfies Record<string, Partial<TemplateMetrics>>;

/** Una métrica = base + ritmo + esqueleto + las decisiones propias de la plantilla. */
const M = (
  ritmo: keyof typeof RITMO,
  esqueleto: keyof typeof ESQ,
  extra: Partial<TemplateMetrics> = {},
): TemplateMetrics => ({
  ...BASE,
  ...RITMO[ritmo],
  ...ESQ[esqueleto],
  ...extra,
});

// ── ÓRDENES DE SECCIÓN ────────────────────────────────────────────────────────
/**
 * Qué se lee primero. No es decoración: un ATS y un humano puntúan lo que aparece
 * arriba, así que el orden es la decisión más estratégica del documento. Y es un
 * eje INDEPENDIENTE del esqueleto: cambiar «educación ↔ experiencia» no obliga a
 * rehacer la maqueta, que es justo lo que piden las guías chilenas —ponen la
 * formación delante incluso para perfiles con trayectoria— y lo que hace la
 * plantilla oficial de Harvard para egresados.
 *
 * ⚠ «references» VA AL FINAL, SIEMPRE. `sectionOrder` es `readonly SectionId[]`: NO
 * exige exhaustividad, así que una sección que falte en uno de estos arrays
 * desaparece del documento SIN ERROR DE COMPILACIÓN — solo en las plantillas que
 * usan ese orden. Con 15 plantillas repartidas entre los seis, olvidarse de uno
 * significa que un usuario que activó sus referencias no las ve y no hay nada que se
 * lo diga. Lo vigila tests/secciones-paridad.test.ts, que recorre TODAS las
 * SectionId contra TODOS estos arrays (y no solo los que alguna plantilla usa).
 *
 * ⚠⚠ EL CANDADO YA MORDIÓ UNA SEGUNDA VEZ. Al crear CERTIFICACIONES, IDIOMAS y
 * PUBLICACIONES hubo que tocar los seis arrays a mano, uno por uno, porque el tipo
 * no obliga: exactamente el fallo que este comentario avisaba. Cada orden coloca las
 * tres donde le toca por su tesis (las certificaciones pegadas a la formación en los
 * órdenes académicos, las publicaciones arriba en ninguno por defecto), pero LAS
 * NUEVE están en LOS SEIS: perder una es perder datos del usuario en silencio.
 */
export const ORDEN = {
  /** El de siempre: te vende lo que sabes hacer. */
  habilidades: ["summary", "skills", "work", "projects", "education", "certifications", "languages", "publications", "references"],
  /** Te vende dónde has estado: perfiles con recorrido. */
  experiencia: ["summary", "work", "projects", "skills", "education", "certifications", "languages", "publications", "references"],
  /** Te vende lo que has construido: portafolio por delante del cargo. */
  proyectos: ["summary", "projects", "work", "skills", "education", "certifications", "languages", "publications", "references"],
  /** Te vende el título: academia, egresados y primer empleo. Las certificaciones
   *  van pegadas a la formación (son lo mismo a ojos de quien lee: papel acreditado)
   *  y las publicaciones suben por delante del empleo, que es lo que pesa en una
   *  candidatura académica. */
  formacion: ["summary", "education", "certifications", "publications", "skills", "work", "projects", "languages", "references"],
  /** Formación delante, experiencia detrás y habilidades al final: la costumbre chilena. */
  chile: ["summary", "education", "certifications", "work", "skills", "projects", "languages", "publications", "references"],
  /**
   * Cambio de carrera: el resumen hace de PUENTE y detrás van las habilidades y lo
   * que has construido por tu cuenta, antes del empleo previo. Nunca un funcional
   * puro (sin fechas ni empleador): los reclutadores lo leen como ocultamiento.
   * Las certificaciones suben con las habilidades: en una transición son la prueba
   * de la formación NUEVA, no un apéndice de la carrera vieja.
   */
  transicion: ["summary", "skills", "certifications", "projects", "work", "education", "languages", "publications", "references"],
} satisfies Record<string, readonly SectionId[]>;

// ── PLANTILLAS ────────────────────────────────────────────────────────────────
const P = (id: string): TemplatePalette => PALETTES.find((p) => p.id === id)!;
const T = (id: string): TemplateTypography => TYPOGRAPHIES.find((t) => t.id === id)!;

/**
 * Una plantilla de gama ATS. El `layout` no se pide entero porque en esta gama solo
 * hay una decisión: si la maqueta reserva hueco de foto. Ni dos columnas ni barra
 * lateral — eso es, literalmente, la otra gama.
 *
 * ★ PARES GEMELOS. Toda plantilla con hueco de foto (`-foto`) existe TAMBIÉN sin
 * él, y la versión sin foto no deja el hueco vacío: compensa. Donde la de foto pone
 * la imagen a la derecha y apila el contacto bajo el nombre, la gemela reparte el
 * contacto a lo ancho, lo alinea al otro lado y cierra la cabecera con un filete.
 * Un test comprueba que el par existe en las dos direcciones.
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
  id,
  name,
  gama: "ats",
  description,
  layout: { columns: 1, photo: metrics.photoSlot === "header-right", sidebar: false },
  palette: P(palette),
  typography: T(typography),
  metrics,
  tags,
});

export const TEMPLATES: CvTemplate[] = [
  // ── SOBRIAS ────────────────────────────────────────────────────────────────
  // El documento de toda la vida y sus variaciones de filete, numeración y ritmo.
  ats(
    "ats-clasica", "Clásica",
    "La conservadora: banca, sector público y perfiles senior. Es la de por defecto, y la única decisión que toma es un margen ancho para que la línea no pase de los 85 caracteres.",
    "patina", "clasica", CLASICA,
    ["clasica", "2paginas", "general"],
  ),
  ats(
    "ats-toga", "Toga",
    "Filete doble bajo cada sección y contacto en dos líneas, con márgenes anchos. Formal sin ser rancia: derecho, banca, consultoría.",
    "marino", "clasica",
    M("amplio", "plana", { headingRuleStyle: "double", contactStyle: "split", headingTracking: 0.5 }),
    ["clasica", "2paginas", "general"],
  ),
  ats(
    "ats-expediente", "Expediente",
    "Secciones numeradas y sin filete, fechas en línea propia. Lee como un informe: ordenado y sin adornos.",
    "pizarra", "compacta",
    M("normal", "expediente", { bulletMarker: "dash" }),
    ["clasica", "2paginas", "general"],
  ),
  ats(
    "ats-memorando", "Memorando",
    "Filete ENCIMA del rótulo, fechas en línea propia, contacto sin etiquetas y cero color: blanco y negro puro, para fotocopiar.",
    "tinta", "compacta",
    M("denso", "cornisa", {
      dateStyle: "own-line", contactLabels: false, skillStyle: "inline", accentHeadings: false,
    }),
    ["minimal", "1pagina", "general"],
  ),
  ats(
    "ats-registro", "Registro",
    "Fechas pegadas al cargo, viñeta de guion y habilidades a dos líneas. Densa y sin una sola línea decorativa.",
    "granate", "instrumento",
    M("denso", "enLinea", { bulletMarker: "dash", skillStyle: "paired" }),
    ["tecnica", "1pagina", "ingenieria"],
  ),
  ats(
    "ats-veterana", "Veterana",
    "Experiencia primero y columna colgante ancha: mucha trayectoria comprimida sin que la línea se alargue.",
    "marino", "compacta",
    M("denso", "colganteAncha", {
      sectionOrder: ORDEN.experiencia, skillStyle: "inline", contactStyle: "split", bulletMarker: "dash",
    }),
    ["clasica", "1pagina", "general"],
  ),

  // ── EDITORIALES ────────────────────────────────────────────────────────────
  // Serif, aire y cursiva. El CV que se lee como una página de revista.
  ats(
    "ats-editorial", "Editorial",
    "Serif en el nombre y en los encabezados, el máximo de aire que permite el núcleo. Para perfiles de producto, diseño y academia.",
    "cobre", "editorial",
    M("aireado", "plana", { sectionGap: 16, headingWeight: 600 }),
    ["editorial", "2paginas", "general"],
  ),
  ats(
    "ats-cronica", "Crónica",
    "Serif de titular, subtítulo en cursiva y fechas colgadas a la izquierda. Filete corto: se insinúa, no subraya.",
    "granate", "cronica",
    M("amplio", "colgante", { headingRuleStyle: "partial", contactStyle: "split" }),
    ["editorial", "2paginas", "general"],
  ),
  ats(
    "ats-ensayo", "Ensayo",
    "Encabezados en caja mixta y sin filete, viñeta de raya. El CV más silencioso del catálogo.",
    "ciruela", "editorial",
    M("aireado", "plana", {
      upperHeadings: false, headingRule: false, headingWeight: 600,
      bulletMarker: "emdash", skillStyle: "inline",
    }),
    ["editorial", "2paginas", "academia"],
  ),
  ats(
    "ats-portada", "Portada",
    "Nombre y contacto centrados bajo un filete, cuerpo alineado a la izquierda. Cabecera de libro.",
    "cobre", "editorial",
    M("amplio", "portada", { headingWeight: 600 }),
    ["editorial", "2paginas", "general"],
  ),
  ats(
    "ats-columna", "Columna",
    "Proyectos por delante del empleo sobre la columna colgante más ancha del catálogo. Para quien se vende por lo que construye.",
    "oliva", "cronica",
    M("amplio", "colganteAncha", { sectionOrder: ORDEN.proyectos, bulletMarker: "emdash" }),
    ["editorial", "2paginas", "datos-ia"],
  ),
  ats(
    "ats-postulacion", "Postulación",
    "Formación delante, columna colgante y aire de dossier. Para becas, magísteres y candidaturas que se leen enteras.",
    "ciruela", "editorial",
    M("amplio", "colganteFina", { sectionOrder: ORDEN.formacion, headingWeight: 600, headingRuleStyle: "partial" }),
    ["editorial", "2paginas", "academia"],
  ),

  // ── TÉCNICAS ───────────────────────────────────────────────────────────────
  // Grotesca en dos pesos, densidad alta y CERO ornamento. Sin monoespaciada: la
  // gama técnica se reconoce por la estructura, no por la fuente de una terminal.
  ats(
    "ats-instrumento", "Instrumento",
    "Grotesca en dos pesos, densa y técnica, con las habilidades agrupadas arriba. Para ingeniería y datos.",
    "acero", "instrumento",
    M("denso", "plana", { headingRule: false, headingWeight: 600 }),
    ["tecnica", "1pagina", "ingenieria"],
  ),
  ats(
    "ats-terminal", "Bitácora",
    "Fechas colgadas a la izquierda, contacto sin etiquetas y habilidades a dos líneas. Se lee como un registro de trabajo.",
    "tinta", "compacta",
    M("denso", "colganteFina", { bulletMarker: "dash", contactLabels: false, skillStyle: "paired" }),
    ["tecnica", "1pagina", "ingenieria"],
  ),
  ats(
    "ats-consola", "Tablero",
    "Sin filete y sin marcador de viñeta: solo sangría, sobre columna colgante ancha. Máxima densidad legible.",
    "acero", "instrumento",
    M("denso", "colganteAncha", {
      headingRule: false, headingWeight: 600, skillStyle: "inline", bulletMarker: "none",
    }),
    ["tecnica", "1pagina", "ingenieria"],
  ),
  ats(
    "ats-esquema", "Esquema",
    "Experiencia por delante de habilidades, filete encima del rótulo y fechas en su propia línea.",
    "pizarra", "instrumento",
    M("normal", "cornisa", { dateStyle: "own-line", sectionOrder: ORDEN.experiencia, headingWeight: 600 }),
    ["tecnica", "2paginas", "ingenieria"],
  ),
  ats(
    "ats-telemetria", "Telemetría",
    "Filete doble, habilidades en una sola línea corrida y viñeta de guion. Para perfiles de datos.",
    "marino", "instrumento",
    M("denso", "plana", { headingRuleStyle: "double", skillStyle: "inline", bulletMarker: "dash", headingWeight: 600 }),
    ["tecnica", "1pagina", "datos-ia"],
  ),
  ats(
    "ats-taller", "Taller",
    "Cero ornamento: ni filete, ni etiquetas de contacto, ni adornos. Habilidades arriba y en línea corrida, todo en grotesca.",
    "pizarra", "compacta",
    M("normal", "taller", { sectionOrder: ORDEN.habilidades, bulletMarker: "dash" }),
    ["tecnica", "1pagina", "ingenieria"],
  ),
  ats(
    "ats-banco", "Banco de pruebas",
    "Rótulo sobre bloque tintado y columna colgante: la estructura se ve de un vistazo sin una sola línea de más.",
    "acero", "compacta",
    M("denso", "colgante", { headingBand: true, headingRule: false, bulletMarker: "dash" }),
    ["tecnica", "2paginas", "datos-ia"],
  ),

  // ── MÍNIMAS ────────────────────────────────────────────────────────────────
  // Quitar hasta que solo quede el contenido. Cada una quita una cosa distinta.
  ats(
    "ats-compacta", "Compacta",
    "La métrica más apretada que permite el núcleo de legibilidad: cuerpo de 10 pt, interlineado de 1,15 y márgenes anchos para que la línea siga siendo corta.",
    "tinta", "compacta", M("compacto", "plana"),
    ["minimal", "1pagina", "general"],
  ),
  /**
   * COMPACTA MÁXIMA — la que gana sitio por arriba, no por dentro.
   *
   * `ats-compacta` aprieta el CUERPO hasta el límite del núcleo y ahí se acaba el
   * camino: por debajo de 10 pt de cuerpo o de 20 mm de margen ya no es un estilo,
   * es publicar un documento que se lee peor. Esta ataca lo otro, que nadie miraba:
   * la CABECERA. La clásica gasta 74,95 pt —un 11 % de la primera página— en cuatro
   * líneas apiladas; esta las compone en tres (nombre y título objetivo en la misma
   * línea, contacto debajo) y las deja en 51,70 pt. Son 23,25 pt devueltos al
   * contenido, un 31,0 % de la cabecera, con el cuerpo INTACTO dentro del núcleo.
   * Los dos números están medidos sobre el PDF renderizado y cruzados contra la
   * aritmética de la métrica en tests/cabecera-compacta.test.ts — no son estimación.
   *
   * ⚠ El margen superior NO se toca: 20 mm es el suelo del núcleo de legibilidad y
   * ese suelo no se baja para que quepa una línea más.
   */
  ats(
    "ats-compacta-maxima", "Compacta máxima",
    "Nombre y título objetivo en la misma línea y contacto corrido debajo: la cabecera ocupa un tercio menos sin apretar el cuerpo. Para cuando el contenido no cabe y comprimir el texto no es una opción.",
    "granate", "compacta",
    M("denso", "dosLineas", {
      sectionGap: 12.5, headingRuleStyle: "partial", bulletMarker: "dash", skillStyle: "paired",
    }),
    ["minimal", "1pagina", "general"],
  ),
  ats(
    "ats-minima", "Mínima",
    "Sin color, sin filetes, sin marcadores y sin etiquetas de contacto. Solo jerarquía tipográfica.",
    "tinta", "compacta",
    M("denso", "plana", {
      accentHeadings: false, headingRule: false, bulletMarker: "none",
      contactStyle: "split", contactLabels: false, skillStyle: "inline",
    }),
    ["minimal", "1pagina", "general"],
  ),
  ats(
    "ats-hoja", "Hoja",
    "Columna colgante fina y filete corto por sección. El color aparece una vez por sección y nada más.",
    "oliva", "clasica",
    M("amplio", "colganteFina", { headingRuleStyle: "partial", bulletMarker: "dash" }),
    ["minimal", "2paginas", "general"],
  ),
  ats(
    "ats-margen", "Margen",
    "Márgenes de libro de bolsillo, columna de texto corta y fechas en línea propia. Se lee sin cansarse.",
    "oliva", "compacta",
    M("normal", "margen", { dateStyle: "own-line" }),
    ["minimal", "2paginas", "general"],
  ),
  ats(
    "ats-silencio", "Silencio",
    "Ni filetes ni viñetas, contacto apilado línea a línea. Las secciones se anuncian solo con aire.",
    "pizarra", "clasica",
    M("normal", "silencio", { contactStyle: "stacked" }),
    ["minimal", "2paginas", "general"],
  ),
  // ── MODERNAS ───────────────────────────────────────────────────────────────
  // Composición contemporánea: cabeceras centradas, banda tintada, caja alta.
  ats(
    "ats-titular", "Titular",
    "Nombre en mayúsculas con tracking bajo un filete, fechas pegadas al cargo. Empieza fuerte.",
    "granate", "compacta",
    M("normal", "titular", { dateStyle: "inline", bulletMarker: "dash" }),
    ["moderna", "1pagina", "general"],
  ),
  ats(
    "ats-bandera", "Bandera",
    "Cabecera centrada con el contacto apilado y filete doble en las secciones. La de currículum americano.",
    "cobre", "clasica",
    M("normal", "bandera", { nameRule: true }),
    ["moderna", "2paginas", "general"],
  ),
  ats(
    "ats-pauta", "Pauta",
    "Secciones numeradas con filete corto y habilidades a dos líneas. Estructura visible sin ruido.",
    "ciruela", "compacta",
    M("denso", "plana", { headingNumbered: true, headingRuleStyle: "partial", skillStyle: "paired" }),
    ["moderna", "1pagina", "general"],
  ),
  ats(
    "ats-indice", "Cornisa",
    "Filete encima del rótulo, como el titulillo de una página impresa, y la experiencia primero.",
    "acero", "clasica",
    M("amplio", "cornisa", { sectionOrder: ORDEN.experiencia, bulletMarker: "emdash" }),
    ["moderna", "2paginas", "general"],
  ),
  ats(
    "ats-perfil", "Perfil",
    "Contacto apilado, fechas en línea propia y filete corto. Aire de ficha de perfil, en una columna.",
    "patina", "cronica",
    M("denso", "lineaPropia", { contactStyle: "stacked" }),
    ["moderna", "2paginas", "general"],
  ),
  ats(
    "ats-banda", "Banda",
    "El rótulo de sección va sobre un bloque tintado en gris: la sección se anuncia con un fondo, no con una raya.",
    "ciruela", "compacta",
    M("normal", "banda", { bulletMarker: "dash", contactStyle: "split" }),
    ["moderna", "2paginas", "general"],
  ),
  ats(
    "ats-banda-foto", "Banda con foto",
    "La misma banda tintada, con la foto en la esquina superior derecha y el contacto apilado bajo el nombre.",
    "ciruela", "compacta",
    M("normal", "banda", {
      photoSlot: "header-right", contactStyle: "stacked", photoShape: "rounded", photoSize: 86,
      nameRule: true, skillStyle: "paired",
    }),
    ["moderna", "2paginas", "general"],
  ),

  // ── CON FOTO Y SIN FOTO (pares gemelos) ────────────────────────────────────
  // Cada par comparte esqueleto y ritmo; lo que cambia es qué hace la cabecera con
  // el hueco. La versión sin foto NO deja un vacío: reparte el contacto a lo ancho,
  // lo alinea al otro lado o cierra la cabecera con un filete.
  ats(
    "ats-credencial", "Credencial",
    "Nombre a la izquierda y contacto alineado a la derecha, en el mismo flujo. La cabecera se cierra sola, sin foto ni hueco.",
    "acero", "compacta",
    M("normal", "credencial", { nameRule: true, bulletMarker: "dash" }),
    ["moderna", "1pagina", "general"],
  ),
  ats(
    "ats-credencial-foto", "Credencial con foto",
    "La gemela con foto: la imagen ocupa la esquina superior derecha y el contacto vuelve bajo el nombre, apilado.",
    "acero", "compacta",
    M("normal", "retrato", { photoShape: "square", photoBorder: true, bulletMarker: "dash", photoSize: 82 }),
    ["moderna", "1pagina", "general"],
  ),
  ats(
    "ats-retrato", "Retrato",
    "Columna colgante y contacto repartido a lo ancho de la cabecera, que es lo que ocupa el sitio de la foto.",
    "patina", "clasica",
    M("denso", "colgante", { contactStyle: "split", contactAlign: "right", nameRule: true }),
    ["clasica", "2paginas", "general"],
  ),
  ats(
    "ats-retrato-foto", "Retrato con foto",
    "La gemela con foto sobre la columna colgante: la rejilla sostiene la imagen y el contacto se apila bajo el nombre.",
    "patina", "clasica",
    M("denso", "retratoColgante", { contactStyle: "stacked", photoShape: "rounded", photoSize: 84 }),
    ["clasica", "2paginas", "general"],
  ),
  ats(
    "ats-dossier", "Dossier",
    "Aire de dossier sobre columna colgante fina, con el contacto centrado bajo el nombre. La cabecera está equilibrada sin necesitar imagen.",
    "cobre", "cronica",
    M("normal", "colganteFina", { contactAlign: "center", contactStyle: "split", headingRuleStyle: "partial" }),
    ["editorial", "2paginas", "general"],
  ),
  ats(
    "ats-dossier-foto", "Dossier con foto",
    "La gemela con foto: retrato de 3,5 × 4,5 cm con filete fino a la derecha del nombre, sobre la misma columna colgante.",
    "cobre", "cronica",
    M("normal", "retratoColgante", {
      hangingWidth: "24%", photoBorder: true, photoSize: 78, headingRuleStyle: "partial", contactStyle: "stacked",
    }),
    ["editorial", "2paginas", "general"],
  ),
  ats(
    "ats-consultora", "Consultora",
    "Columna colgante ancha, contacto en dos líneas alineado a la derecha y viñeta de guion. Para propuestas y perfiles de consultoría.",
    "marino", "instrumento",
    M("normal", "colganteAncha", {
      contactStyle: "split", contactAlign: "right", bulletMarker: "dash", headingWeight: 600,
    }),
    ["clasica", "2paginas", "general"],
  ),
  ats(
    "ats-consultora-foto", "Consultora con foto",
    "La gemela con foto: la imagen cierra la cabecera por la derecha y el contacto pasa a apilarse bajo el nombre.",
    "marino", "instrumento",
    M("normal", "retratoColgante", {
      hangingWidth: "30%", contactStyle: "stacked", photoSize: 84, bulletMarker: "dash", headingWeight: 600,
    }),
    ["clasica", "2paginas", "general"],
  ),
  ats(
    "ats-cabecera", "Cabecera",
    "Nombre en caja alta con tracking y contacto a la derecha, sin filete de cabecera. La línea de contacto hace de contrapeso.",
    "granate", "instrumento",
    M("denso", "titular", {
      nameRule: false, contactAlign: "right", contactStyle: "split", headingWeight: 600, bulletMarker: "dash",
    }),
    ["moderna", "1pagina", "general"],
  ),
  ats(
    "ats-cabecera-foto", "Cabecera con foto",
    "La gemela con foto: el nombre en caja alta a la izquierda y el retrato a la derecha, con el contacto apilado debajo.",
    "granate", "instrumento",
    M("denso", "retrato", {
      nameCase: "upper", nameTracking: 1.1, photoSize: 84, photoShape: "square", headingWeight: 600,
    }),
    ["moderna", "1pagina", "general"],
  ),
  ats(
    "ats-ficha", "Ficha",
    "Denso, con el contacto en dos líneas centrado y filete corto. Cabecera compacta y equilibrada, sin imagen.",
    "oliva", "compacta",
    M("denso", "plana", {
      contactStyle: "split", contactAlign: "center", headingRuleStyle: "partial", skillStyle: "paired",
    }),
    ["minimal", "1pagina", "general"],
  ),
  ats(
    "ats-ficha-foto", "Ficha con foto",
    "La gemela con foto: retrato pequeño de esquina y contacto apilado, en la misma métrica densa de una página.",
    "oliva", "compacta",
    M("denso", "retrato", { photoSize: 80, headingRuleStyle: "partial", skillStyle: "paired", bulletMarker: "dash" }),
    ["minimal", "1pagina", "general"],
  ),

  // ── POR AFINIDAD ───────────────────────────────────────────────────────────
  // Lo que cambia no es el adorno: es QUÉ SE LEE PRIMERO.
  ats(
    "ats-academica", "Académica",
    "Formación por delante de todo, columna colgante fina y fechas a la izquierda. Para tesis, docencia e investigación.",
    "marino", "cronica",
    M("amplio", "colgante", { sectionOrder: ORDEN.formacion, headingRuleStyle: "partial", bulletMarker: "emdash" }),
    ["editorial", "2paginas", "academia"],
  ),
  ats(
    "ats-primer-empleo", "Primer empleo",
    "El título primero y la experiencia al final, con filete corto. Cuando lo más fuerte que tienes es la carrera.",
    "oliva", "clasica",
    M("normal", "plana", {
      sectionOrder: ORDEN.formacion, contactStyle: "split", bulletMarker: "dash", headingRuleStyle: "partial",
    }),
    ["clasica", "1pagina", "primer-empleo"],
  ),
  ats(
    "ats-egresado", "Egresado",
    "Educación antes que experiencia, como la plantilla oficial de Harvard para recién titulados, sobre columna colgante y en una página.",
    "patina", "compacta",
    M("denso", "colgante", { sectionOrder: ORDEN.formacion, contactStyle: "split", skillStyle: "inline" }),
    ["clasica", "1pagina", "primer-empleo"],
  ),
  ats(
    "ats-chile", "Chilena",
    "Formación delante y experiencia detrás, que es como lo piden las guías locales incluso con trayectoria. El orden se cambia sin tocar la maqueta.",
    "cobre", "clasica",
    M("normal", "colgante", { sectionOrder: ORDEN.chile, bulletMarker: "dash", contactStyle: "split" }),
    ["clasica", "2paginas", "general"],
  ),
  ats(
    "ats-portafolio", "Portafolio",
    "Proyectos arriba del todo y habilidades en línea corrida. Para quien enseña obra, no cargos.",
    "ciruela", "editorial",
    M("amplio", "plana", {
      sectionOrder: ORDEN.proyectos, bulletMarker: "dash", contactStyle: "split",
      skillStyle: "inline", headingWeight: 600,
    }),
    ["editorial", "2paginas", "datos-ia"],
  ),
  ats(
    "ats-transicion", "Transición",
    "Resumen-puente arriba, y detrás las habilidades y los proyectos propios antes del empleo anterior. Para cambiar de sector sin que el cargo viejo mande.",
    "granate", "clasica",
    M("normal", "lineaPropia", {
      sectionOrder: ORDEN.transicion, contactStyle: "split", skillStyle: "paired",
    }),
    ["moderna", "2paginas", "primer-empleo"],
  ),
  ats(
    "ats-puente", "Puente",
    "La otra transición: mismo orden con resumen-puente, pero sobre columna colgante y con las secciones sin filete. Nunca un CV funcional puro.",
    "cobre", "compacta",
    M("normal", "colganteFina", {
      sectionOrder: ORDEN.transicion, headingRule: false, bulletMarker: "emdash", contactStyle: "stacked",
    }),
    ["moderna", "2paginas", "primer-empleo"],
  ),
  ats(
    "ats-trayectoria", "Trayectoria",
    "Senior de dos páginas: experiencia primero, columna colgante y ritmo amplio para que quince años no se lean apretados.",
    "pizarra", "clasica",
    M("amplio", "colgante", { sectionOrder: ORDEN.experiencia, bulletMarker: "dash", contactStyle: "split" }),
    ["clasica", "2paginas", "general"],
  ),
  ats(
    "ats-laboratorio", "Laboratorio",
    "Proyectos delante del empleo, columna colgante fina y habilidades a dos líneas. Para investigación aplicada y datos.",
    "oliva", "instrumento",
    M("denso", "colgante", {
      sectionOrder: ORDEN.proyectos, hangingWidth: "26%", skillStyle: "paired",
      headingRule: false, headingWeight: 600,
    }),
    ["tecnica", "2paginas", "datos-ia"],
  ),

  // ── GAMA VISUAL ────────────────────────────────────────────────────────────
  // Se ven mejor y parsean peor. Cada una dice POR QUÉ en su `warning`. Aquí sí
  // caben la barra lateral, la foto circular y la monoespaciada: es la gama donde
  // el usuario ya ha leído el aviso.
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
    metrics: M("normal", "plana", { nameSize: 21, pageMarginH: "18mm", sidebarWidth: "33%", sidebarGap: 14, accentName: true }),
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
    metrics: M("amplio", "plana", {
      pageMarginH: "18mm", sidebarWidth: "30%", sidebarGap: 16, headingWeight: 600, headingRuleStyle: "partial", accentName: true,
    }),
    tags: ["editorial", "2paginas", "academia"],
  },
  {
    id: "visual-ficha",
    name: "Ficha (con foto)",
    gama: "visual",
    description: "Todo en una página: lateral compacta con contacto y habilidades, cuerpo denso con la experiencia y cifras en monoespaciada.",
    warning:
      "No apta para portales con ATS: la barra lateral hace que el parser lea las habilidades y el contacto intercalados con la experiencia, la densidad alta agrava los errores de columna y la monoespaciada es justo la familia que peor puntúan los reclutadores.",
    layout: { columns: 2, photo: true, sidebar: true },
    palette: P("granate"),
    typography: T("terminal"),
    // Habilidades AGRUPADAS y no en línea corrida: en una lateral del 34 % una línea
    // que junta los cuatro grupos se parte donde puede, y el parser llega a recortar
    // palabras. La barra lateral ya penaliza bastante el parseo sin ayudarla.
    // headingWeight 500: Geist Mono no existe en 600/700 y un peso que no existe se
    // sustituye en silencio (lo fija un test).
    metrics: M("denso", "plana", {
      pageMarginH: "17mm", sidebarWidth: "34%", sidebarGap: 12, dateStyle: "inline", headingWeight: 500, accentName: true,
    }),
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
    metrics: M("aireado", "plana", { headingLabel: false, bulletMarker: "none", contactStyle: "split" }),
    tags: ["minimal", "2paginas", "general"],
  },
];
