import { Document, Page, View, Text, Image, Link, Font, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { Fragment, type ReactNode } from "react";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";
import * as QRCode from "qrcode";
import {
  selectContent,
  buildVCard,
  contactLayout,
  documentSections,
  skillLines,
  type ResumeData,
  type Locale,
} from "./resume";
import {
  bulletMark,
  headingLabelText,
  nameText,
  photoHeight,
  resolveMetrics,
  resolveTemplate,
  resolveTypography,
  type CvTemplate,
  type SectionId,
} from "./templates";

/**
 * href navegable de una URL de texto: añade https:// si no trae esquema. Se aplica
 * SOLO al `src` del <Link>; el TEXTO visible sigue siendo la URL tal cual (el
 * round-trip ATS verifica el texto, no el destino del hipervínculo).
 */
function hrefOf(url: string): string {
  const u = (url ?? "").trim();
  if (!u) return u;
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : "https://" + u;
}

/**
 * El documento CV en @react-pdf/renderer v4, según docs/spec/documento-cv.md.
 * Consume directamente el shape de datos-ejemplo.json.
 *
 * Reglas ATS materializadas (spec §8): UNA columna · cero tablas · contacto en el
 * cuerpo con prefijos de texto "Email:"/"Tel:" · cero iconos junto a los rótulos ·
 * texto seleccionable · viñeta "• " (U+2022, glifo de texto que parsea limpio) ·
 * cargo en negrita · un solo acento, en rótulos y filetes.
 *
 * DOS COSAS QUE PARECEN DOS COLUMNAS Y NO LO SON, y por qué se pueden hacer:
 *   · la COLUMNA COLGANTE (`skeleton: "hanging"`) — cada ENTRADA es una fila flex
 *     con las fechas y la organización a la izquierda; la fila lleva wrap={false},
 *     así que nunca se parte entre páginas, y el content stream sale en el mismo
 *     orden que escribe entryLines() para el texto plano;
 *   · la CABECERA CON FOTO (`photoSlot: "header-right"`) — el bloque de nombre y
 *     contacto va primero y la imagen después, y una imagen no aporta texto.
 * Las dos están cubiertas por el round-trip, que es lo único que las autoriza: si
 * el PDF re-parseado dejara de coincidir con su rayos-X, no serían un estilo, serían
 * una barra lateral disfrazada.
 *
 * TRAMPA 1 — Font.register a NIVEL DE MÓDULO (fuera del componente), una vez.
 * TRAMPA 2 — .ttf, NO .woff2. Se registran las MISMAS .ttf que usa la app
 *            (src/lib/fonts/), así el preview en pantalla y el PDF no derivan.
 */

/**
 * TRAMPA 3 (la que rompía la descarga en producción) — la carpeta de fuentes NO
 * puede salir de `import.meta.url`: webpack lo INLINEA con la ruta absoluta de la
 * máquina de build. Verificado en el artefacto:
 *   path.dirname(fileURLToPath("file:///J:/Code/.../src/lib/cv/ResumePDF.tsx"))
 * En Vercel esa carpeta no existe → Font.register apunta a archivos fantasma → el
 * render lanza y /api/cv devuelve 500 ("no se pudo generar el PDF"). En local
 * funciona porque la ruta sí existe, así que el bug solo aparece desplegado.
 *
 * Se resuelve desde process.cwd() (raíz del proyecto = raíz de la lambda, que es
 * donde `outputFileTracingIncludes` deja las .ttf), con respaldo a la ruta del
 * módulo por si algún entorno no corre desde la raíz. Se elige comprobando que el
 * archivo EXISTE, no por convención.
 */
function resolveFontsDir(): string {
  const candidates = [
    path.join(process.cwd(), "src", "lib", "fonts"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../fonts"),
  ];
  for (const dir of candidates) {
    try {
      if (existsSync(path.join(dir, "Geist-Regular.ttf"))) return dir;
    } catch {
      /* candidato inválido: se prueba el siguiente */
    }
  }
  return candidates[0]!;
}
const FONTS = resolveFontsDir();
const f = (name: string) => path.join(FONTS, name);

Font.register({
  family: "Geist",
  fonts: [
    { src: f("Geist-Regular.ttf"), fontWeight: 400 },
    { src: f("Geist-Medium.ttf"), fontWeight: 500 },
    { src: f("Geist-SemiBold.ttf"), fontWeight: 600 },
    { src: f("Geist-Bold.ttf"), fontWeight: 700 },
  ],
});
// Se registran TODOS los pesos disponibles en src/lib/fonts/ (no se añaden .ttf
// nuevos): el catálogo de plantillas los necesita. Añadir pesos no cambia lo que
// resuelve una petición existente — @react-pdf busca primero la coincidencia
// EXACTA de peso y estilo, así que "Playfair 600" sigue siendo el mismo archivo.
Font.register({
  family: "Playfair Display",
  fonts: [
    { src: f("PlayfairDisplay-500.ttf"), fontWeight: 500 },
    { src: f("PlayfairDisplay-600.ttf"), fontWeight: 600 },
    { src: f("PlayfairDisplay-Italic500.ttf"), fontWeight: 500, fontStyle: "italic" },
  ],
});
Font.register({
  family: "Geist Mono",
  fonts: [
    { src: f("GeistMono-Regular.ttf"), fontWeight: 400 },
    { src: f("GeistMono-Medium.ttf"), fontWeight: 500 },
  ],
});

// El guionado automático parte palabras (URLs, nombres) y ensucia el parseo ATS.
Font.registerHyphenationCallback((word) => [word]);

/**
 * La hoja de estilos DEL DOCUMENTO, derivada de la plantilla. Los valores por
 * defecto NO están aquí: los pone resolveMetrics/resolveTypography (templates.ts),
 * y son los del documento clásico. Consecuencia buscada: una plantilla que declare
 * solo lo mínimo sale como salía el CV de siempre, y "ats-clasica" —que declara
 * esos mismos números uno a uno— reproduce el documento anterior al sistema de
 * plantillas. Eso lo comprueba el golden, y además un test compara el PDF sin
 * templateId contra el PDF con "ats-clasica": mismo tamaño y mismo texto extraído.
 */
function stylesFor(tpl: CvTemplate) {
  const p = tpl.palette;
  const ty = resolveTypography(tpl.typography);
  const m = resolveMetrics(tpl.metrics);
  const body = m.bodySize;
  const ruleGap = m.headingRuleGap;
  const nameColor = m.accentName ? p.accent : p.ink;
  const headColor = m.accentHeadings ? p.accent : p.ink;
  // El documento NO pinta fondo: el papel del PDF es blanco. Por eso una paleta
  // solo puede declarar `paper: "#FFFFFF"` — si algún día se pinta un fondo, habrá
  // que pintarlo AQUÍ; mientras tanto un `paper` de color sería mentira y hay un
  // test que lo impide (los contrastes se miden contra el papel que se imprime).

  // Los ejes de composición se traducen a estilo AQUÍ, y siempre por AÑADIDO: si el
  // eje está en su valor por defecto no se emite la propiedad, de modo que la hoja
  // de la clásica sale con exactamente las mismas claves que antes de que estos ejes
  // existieran. Un `textAlign: "left"` de más sería inocuo en pantalla y suficiente
  // para mover los bytes del PDF por defecto, que es justo lo que no puede pasar.
  const centrarCabecera = m.nameAlign === "center" ? ({ textAlign: "center" } as const) : null;
  const centrarRotulo = m.headingAlign === "center" ? ({ textAlign: "center" } as const) : null;
  // El contacto puede alinearse por su cuenta: «nombre a la izquierda, contacto a la
  // derecha» es un patrón de cabecera muy común y NO es una segunda columna — son los
  // mismos párrafos, en el mismo flujo, alineados al otro lado. Por defecto ("inherit")
  // sigue a la cabecera, que es lo que hacía antes de que este eje existiera.
  const alinearContacto =
    m.contactAlign === "inherit"
      ? centrarCabecera
      : m.contactAlign === "center"
        ? ({ textAlign: "center" } as const)
        : m.contactAlign === "right"
          ? ({ textAlign: "right" } as const)
          : null;
  // Rótulo sobre bloque tintado. El fondo es el gris del FILETE (neutro), no el
  // acento: sobre el acento el propio rótulo bajaría de AA. Y por eso mismo el
  // rótulo con banda va en tinta, no en acento — lo comprueba un test de contraste.
  const banda = m.headingBand
    ? ({ backgroundColor: p.hair, paddingHorizontal: 5, paddingVertical: 2.5 } as const)
    : null;
  // El filete completo se dibuja como borde del propio rótulo (así era y así sigue).
  // "partial" y "double" necesitan un elemento aparte: se dibujan como <View>, que no
  // aporta texto y por tanto no toca el orden de lectura.
  const fileteEnBorde = m.headingRule && (m.headingRuleStyle === "full" || m.headingRuleStyle === "double");
  const filete = fileteEnBorde
    ? m.headingRulePosition === "above"
      ? { paddingTop: ruleGap, borderTopWidth: m.headingRuleWidth, borderTopColor: p.hair }
      : { paddingBottom: ruleGap, borderBottomWidth: m.headingRuleWidth, borderBottomColor: p.hair }
    : null;

  return StyleSheet.create({
    page: {
      paddingVertical: m.pageMarginV,
      paddingHorizontal: m.pageMarginH,
      fontFamily: ty.body,
      fontSize: body,
      color: p.ink,
    },
    name: {
      fontFamily: ty.display,
      fontWeight: ty.displayWeight,
      fontSize: m.nameSize,
      lineHeight: m.nameLeading,
      color: nameColor,
      ...(m.nameCase === "upper" ? ({ textTransform: "uppercase" } as const) : null),
      ...(m.nameTracking ? { letterSpacing: m.nameTracking } : null),
      ...centrarCabecera,
    },
    label: ty.labelItalic
      ? {
          fontFamily: ty.display, fontStyle: "italic", fontWeight: 500,
          fontSize: m.labelSize, lineHeight: 1.3, marginTop: 2, ...centrarCabecera,
        }
      : { fontWeight: 600, fontSize: m.labelSize, lineHeight: 1.3, marginTop: 2, ...centrarCabecera },
    contact: { fontSize: m.contactSize, lineHeight: 1.5, color: p.muted, marginTop: 5, ...alinearContacto },
    contact2: { fontSize: m.contactSize, lineHeight: 1.5, color: p.muted, marginTop: 1, ...alinearContacto },
    /** Filete bajo TODA la cabecera (opt-in): separa identidad de contenido. */
    headRule: { paddingBottom: 7, borderBottomWidth: m.headingRuleWidth, borderBottomColor: p.hair },
    // ⚠ SIN letterSpacing: el tracking de imprenta (.h del diseño usa .1em) hace
    // que pdf.js extraiga el encabezado como letras separadas ("R E S U M E N") —
    // el patrón anti-ATS que el documento prohíbe (ESPECIFICACION §8). En el
    // documento gana el ATS siempre; el peso 700 + las mayúsculas hacen el trabajo
    // (ESPECIFICACION §4). El tracking se queda solo en la app, no en el PDF.
    //
    // Las MAYÚSCULAS no son un capricho de estilo: el texto plano (el "rayos-X",
    // toPlainText) imprime los encabezados en mayúsculas, así que una plantilla que
    // los rotule en caja mixta haría que documento y rayos-X dejaran de coincidir.
    // Por eso toda la gama ATS lleva upperHeadings: true (lo fija un test).
    h: {
      fontFamily: ty.headingFace,
      fontWeight: m.headingWeight,
      fontSize: m.headingSize,
      lineHeight: 1.1,
      textTransform: m.upperHeadings ? "uppercase" : "none",
      color: banda ? p.ink : headColor,
      marginTop: m.sectionGap,
      marginBottom: ruleGap,
      ...filete,
      ...(m.headingTracking ? { letterSpacing: m.headingTracking } : null),
      ...centrarRotulo,
      ...banda,
    },
    /** Filete PARCIAL: un trazo corto bajo el rótulo, no una raya de lado a lado. */
    rulePartial: {
      width: m.headingRuleInset,
      height: m.headingRuleWidth,
      backgroundColor: p.hair,
      marginBottom: ruleGap,
      ...(m.headingAlign === "center" ? ({ alignSelf: "center" } as const) : null),
    },
    /** Segundo trazo del filete DOBLE (el primero es el borde del rótulo). */
    ruleDouble: {
      height: m.headingRuleWidth,
      backgroundColor: p.hair,
      marginTop: Math.max(1.2 - ruleGap, -ruleGap),
    },
    sum: { fontSize: body, lineHeight: m.bodyLeading, marginTop: m.summaryGap },
    skline: { fontSize: body, lineHeight: m.skillLeading, marginTop: m.skillGap },
    skLabel: { fontWeight: 600 },
    erow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: m.entryGap },
    t: { fontWeight: 700, fontSize: m.entryTitleSize, lineHeight: 1.3, flexShrink: 1 },
    tEdu: { fontWeight: 700, fontSize: m.eduTitleSize, lineHeight: 1.3, flexShrink: 1 },
    d: {
      fontFamily: ty.figuresFace, fontWeight: 400, fontSize: m.dateSize,
      lineHeight: 1.3, color: p.muted, paddingLeft: m.dateGap,
    },
    /** Fechas cuando NO van a la derecha: el cargo abre su propio bloque. */
    tSolo: { fontWeight: 700, fontSize: m.entryTitleSize, lineHeight: 1.3, marginTop: m.entryGap },
    tEduSolo: { fontWeight: 700, fontSize: m.eduTitleSize, lineHeight: 1.3, marginTop: m.entryGap },
    /** Fechas EN LÍNEA, dentro del propio cargo (Text anidado: mismo párrafo). */
    dInline: { fontFamily: ty.figuresFace, fontWeight: 400, fontSize: m.dateSize, color: p.muted },
    /** Fechas en LÍNEA PROPIA, bajo el cargo. */
    dOwn: {
      fontFamily: ty.figuresFace, fontWeight: 400, fontSize: m.dateSize,
      lineHeight: 1.35, color: p.muted, marginTop: 1,
    },
    org: { fontSize: m.dateSize, lineHeight: 1.35, color: p.muted, marginTop: 1 },
    b: {
      fontSize: body, lineHeight: m.bodyLeading, marginTop: m.bulletGap,
      paddingLeft: m.bulletIndent, textIndent: -m.bulletHang,
    },
    /** Viñeta SIN marcador: la sangría francesa sobra (no hay glifo que colgar). */
    bPlain: {
      fontSize: body, lineHeight: m.bodyLeading, marginTop: m.bulletGap,
      paddingLeft: m.bulletIndent,
    },
    // ── COLUMNA COLGANTE ─────────────────────────────────────────────────────
    // Tres estilos y nada más. `hangRow` es la fila de UNA ENTRADA (nunca la de una
    // sección entera): con wrap={false} la fila se cierra en sí misma, así que no
    // hay ninguna fila flex que pueda partirse entre páginas — que es el único modo
    // en que un esqueleto de dos bloques se estropea de verdad.
    hangRow: { flexDirection: "row", marginTop: m.entryGap },
    // El aire va DENTRO de la columna (padding a su derecha): así el contenido
    // arranca EXACTAMENTE en `hangingWidth` y la sangría de los bloques planos
    // —resumen, habilidades, proyectos— cae en la misma vertical al milímetro.
    hangGutter: { width: m.hangingWidth, paddingRight: m.hangingGap },
    // flexBasis 0: sin él la base de la columna es el ancho intrínseco de su texto
    // y yoga la encoge; las URLs (que no se parten: el guionado está desactivado)
    // se recortarían a media palabra. Es el mismo bug que costó la barra lateral.
    hangBody: { flexGrow: 1, flexBasis: 0 },
    /** Sangría de los bloques que NO son entradas, para que casen con la columna. */
    hangIndent: { paddingLeft: m.hangingWidth },
    /** Fechas y organización dentro de la columna colgante. */
    dHang: { fontFamily: ty.figuresFace, fontWeight: 400, fontSize: m.dateSize, lineHeight: 1.3, color: p.muted },
    orgHang: { fontSize: m.dateSize, lineHeight: 1.3, color: p.muted, marginTop: 1 },
    /** Cargo/título dentro del bloque de contenido (el aire ya lo pone la fila). */
    tHang: { fontWeight: 700, fontSize: m.entryTitleSize, lineHeight: 1.3 },
    tEduHang: { fontWeight: 700, fontSize: m.eduTitleSize, lineHeight: 1.3 },

    // ── CABECERA CON FOTO ────────────────────────────────────────────────────
    // Fila: el bloque de nombre y contacto PRIMERO, la imagen después. El orden del
    // content stream es ese, y una imagen no aporta texto: el parser lee el contacto
    // seguido, sin fragmentarlo. La foto solo puede ir aquí — esquina superior
    // derecha—, nunca centrada arriba ni en una banda a ancho completo.
    headRow: { flexDirection: "row", alignItems: "flex-start" },
    headMain: { flexGrow: 1, flexBasis: 0 },
    // Foto — OPT-IN (versión "visual"). Nunca en el render por defecto (golden).
    photo: { width: 84, height: 84, borderRadius: 4, marginBottom: 8, objectFit: "cover" },
    /** Foto en el hueco de la maqueta: proporción 35:45 y recorte según el eje. */
    photoSlot: {
      width: m.photoSize,
      height: photoHeight(m),
      marginLeft: 16,
      objectFit: "cover",
      borderRadius:
        m.photoShape === "circle" ? m.photoSize / 2 : m.photoShape === "rounded" ? 6 : 0,
      ...(m.photoBorder ? { borderWidth: 0.75, borderColor: p.hair } : null),
    },
    // QR honesto al pie: el glifo + la URL SIEMPRE como texto (una columna).
    qrRow: { flexDirection: "row", alignItems: "center", marginTop: 18 },
    qrImg: { width: 56, height: 56, marginRight: 10 },
    qrCap: { fontSize: 8.5, lineHeight: 1.4, color: p.muted },
    qrUrl: { fontSize: 9.5, lineHeight: 1.4, color: p.ink },
    // Los hipervínculos NO cambian el aspecto: mismo color, sin subrayado. El glifo
    // del enlace es un ADEMÁS invisible al parser; el texto sigue siendo la URL.
    linkContact: { color: p.muted, textDecoration: "none" },
    linkUrl: { color: p.ink, textDecoration: "none" },
    // Solo gama VISUAL: dos columnas con barra lateral. Es exactamente lo que
    // rompe el orden de lectura de los parsers — por eso la plantilla obliga a
    // llevar `warning` y queda fuera del round-trip.
    cols: { flexDirection: "row" },
    side: {
      width: m.sidebarWidth,
      paddingRight: m.sidebarGap,
      borderRightWidth: 1,
      borderRightColor: p.hair,
    },
    // flexBasis: 0 NO es decorativo. Sin él, la base de la columna es el ancho
    // intrínseco de su texto y yoga la ENCOGE: las palabras que no se pueden partir
    // (las URLs — el guionado está desactivado a propósito) desbordan y se cortan a
    // media palabra. Con base 0 la columna toma el hueco que queda y el texto cabe.
    main: { flexGrow: 1, flexBasis: 0, paddingLeft: m.sidebarGap },
  });
}

/** Una hoja por combinación plantilla+paleta+pareja (el render se repite mucho). */
const SHEETS = new Map<string, ReturnType<typeof stylesFor>>();
function sheetFor(tpl: CvTemplate) {
  const key = `${tpl.id}|${tpl.palette.id}|${tpl.typography.id}`;
  let sheet = SHEETS.get(key);
  if (!sheet) {
    sheet = stylesFor(tpl);
    SHEETS.set(key, sheet);
  }
  return sheet;
}

export interface RenderOpts {
  locale?: Locale;
  onePage?: boolean;
  /** Overrides de plantilla (ganan sobre los del propio documento). Opcionales. */
  templateId?: string;
  paletteId?: string;
  typographyId?: string;
}

export function ResumePDF({
  data,
  opts = {},
  qrImage,
}: {
  data: ResumeData;
  opts?: RenderOpts;
  /** data-URL del QR ya generado (renderResumeToBuffer lo produce desde data.qr). */
  qrImage?: string;
}) {
  const loc: Locale = opts.locale ?? "es";
  const onePage = opts.onePage ?? false;
  const tt = <T extends { es: string; en: string }>(v: T) => v[loc];
  const { work, projects, education } = selectContent(data, onePage);
  const b = data.basics;

  // La plantilla EFECTIVA: lo que pida el render gana sobre lo que traiga el
  // documento, y un id desconocido cae en la de por defecto (nunca lanza).
  const tpl = resolveTemplate({
    templateId: opts.templateId ?? data.templateId,
    paletteId: opts.paletteId ?? data.paletteId,
    typographyId: opts.typographyId ?? data.typographyId,
  });
  const s = sheetFor(tpl);
  const m = resolveMetrics(tpl.metrics);

  // Los ejes que cambian el TEXTO se resuelven con las MISMAS funciones que usa
  // toPlainText (templates.ts/resume.ts). Es deliberado: el round-trip compara el
  // PDF contra ese texto plano, así que si aquí se recalculara "a mano" el rótulo
  // numerado o el marcador de viñeta, el test compararía dos documentos distintos.
  const secciones = documentSections(data, onePage, m);
  const vineta = bulletMark(m);
  const contacto = contactLayout(b, loc, m);

  // Los bloques se declaran una vez y las dos composiciones (una columna / barra
  // lateral) los ORDENAN distinto. El contenido y su texto son idénticos: lo único
  // que cambia entre gamas es el orden en que caen en el content stream — que es,
  // exactamente, lo que un parser de ATS lee bien o mal.

  /* Foto — solo si el usuario la puso explícitamente. NUNCA es el avatar. Es un
     opt-in suyo y se respeta en cualquier plantilla (retrocompatible).
     Dos sitios posibles y ni uno más:
       · la plantilla RESERVA hueco (photoSlot: "header-right") → va dentro de la
         cabecera, a la derecha del nombre y el contacto, en su proporción de foto
         de documento (35:45);
       · la plantilla no reserva hueco → se dibuja arriba del todo, como siempre.
     En los dos casos la imagen va DESPUÉS del texto que la acompaña en el content
     stream, así que no puede fragmentar el bloque de contacto. */
  const conHueco = m.photoSlot === "header-right";
  const photoSlotBlock = data.photo && conHueco ? <Image src={data.photo} style={s.photoSlot} /> : null;
  const photoBlock = data.photo && !conHueco ? <Image src={data.photo} style={s.photo} /> : null;

  /**
   * La sangría de los bloques que NO son entradas cuando el esqueleto es colgante.
   * Con el esqueleto plano devuelve el nodo tal cual —sin envoltorio— para que el
   * documento por defecto salga con exactamente el mismo árbol que antes.
   */
  const sangrar = (nodo: ReactNode) =>
    m.skeleton === "hanging" ? <View style={s.hangIndent}>{nodo}</View> : nodo;

  /* Cabecera — contacto EN EL CUERPO (no header/footer), con prefijos de texto */
  const nameBlock = (
    <>
      <Text style={s.name}>{nameText(b.name, m)}</Text>
      <Text style={s.label}>{tt(b.label)}</Text>
    </>
  );

  const contactBlock = (
    <>
      {/* Un hijo por TROZO (los separadores ya vienen dentro): @react-pdf emite un
          operador de texto por hijo, así que este reparto es parte del PDF. */}
      {contacto.info.map((linea, i) => (
        <Text key={i} style={i === 0 ? s.contact : s.contact2}>
          {linea.map((trozo, k) => (
            <Fragment key={k}>{trozo}</Fragment>
          ))}
        </Text>
      ))}
      {/* Cada URL es TEXTO seleccionable Y, ademÁs, un hipervínculo real (<Link>).
          El texto visible no cambia (la URL tal cual) — el href sí lleva https://. */}
      {contacto.links.map((linea, i) => (
        <Text key={`l${i}`} style={s.contact2}>
          {linea.map((url, j) => (
            <Fragment key={j}>
              {j > 0 ? " · " : ""}
              <Link src={hrefOf(url)} style={s.linkContact}>
                {url}
              </Link>
            </Fragment>
          ))}
        </Text>
      ))}
    </>
  );

  // El nombre y el contacto son UN bloque: el filete de cabecera (opt-in) los separa
  // del contenido. Sin él no hay envoltorio ninguno — el documento clásico intacto.
  // Con hueco de foto, ese bloque se convierte en la mitad izquierda de una fila y la
  // imagen ocupa la derecha; el texto sale antes que la imagen, y por eso el contacto
  // sigue leyéndose de corrido (lo verifica el round-trip con foto puesta).
  const identidad = photoSlotBlock ? (
    <View style={s.headRow}>
      <View style={s.headMain}>
        {nameBlock}
        {contactBlock}
      </View>
      {photoSlotBlock}
    </View>
  ) : (
    <>
      {nameBlock}
      {contactBlock}
    </>
  );
  const headerBlock = m.nameRule ? <View style={s.headRule}>{identidad}</View> : identidad;

  /**
   * El rótulo de una sección. La numeración sale de headingLabelText (la misma que
   * usa el texto plano) y la CAJA la sigue poniendo textTransform en la hoja: pasar
   * el rótulo ya en mayúsculas cambiaría el string del documento por defecto.
   * Devuelve también el filete cuando no es un borde del propio rótulo.
   */
  const heading = (id: SectionId) => {
    const rotulo = headingLabelText(tt(data.headings[id]), secciones.indexOf(id), m);
    if (rotulo === null) return null;
    return (
      <>
        <Text style={s.h}>{rotulo}</Text>
        {m.headingRule && m.headingRuleStyle === "partial" ? <View style={s.rulePartial} /> : null}
        {m.headingRule && m.headingRuleStyle === "double" ? <View style={s.ruleDouble} /> : null}
      </>
    );
  };

  /** Una viñeta, con el marcador que pida la plantilla (o sin ninguno). */
  const bullet = (texto: string, key: number) => (
    <Text key={key} style={vineta ? s.b : s.bPlain}>
      {vineta}
      {texto}
    </Text>
  );

  /**
   * Una entrada (empleo o formación) con sus fechas donde toque. Las tres variantes
   * emiten el MISMO texto y en el mismo orden que entryLines() del texto plano —
   * cambia dónde cae, no qué dice.
   */
  const entrada = (
    titulo: ReactNode,
    fechas: string,
    pie: string,
    edu: boolean,
    key: number,
    hijos?: ReactNode,
  ) => {
    // COLUMNA COLGANTE. La entrada entera es UNA fila: a la izquierda las fechas y
    // la organización, a la derecha el cargo y sus viñetas. El content stream sale
    // en ese mismo orden (fechas → organización → cargo → viñetas) y entryLines()
    // escribe esas tres líneas en ese mismo orden en el texto plano: por eso el
    // round-trip —que compara el PDF re-parseado con su propio rayos-X, en orden de
    // lectura— sigue pasando. No es una tabla y no es una barra lateral: es una fila
    // que se cierra en sí misma, dentro del flujo único del documento.
    if (m.dateStyle === "hanging") {
      return (
        <View key={key} style={s.hangRow} wrap={false}>
          <View style={s.hangGutter}>
            <Text style={s.dHang}>{fechas}</Text>
            <Text style={s.orgHang}>{pie}</Text>
          </View>
          <View style={s.hangBody}>
            <Text style={edu ? s.tEduHang : s.tHang}>{titulo}</Text>
            {hijos}
          </View>
        </View>
      );
    }
    const cuerpo =
      m.dateStyle === "right" ? (
        <View style={s.erow}>
          <Text style={edu ? s.tEdu : s.t}>{titulo}</Text>
          <Text style={s.d}>{fechas}</Text>
        </View>
      ) : m.dateStyle === "inline" ? (
        <Text style={edu ? s.tEduSolo : s.tSolo}>
          {titulo}
          <Text style={s.dInline}> · {fechas}</Text>
        </Text>
      ) : (
        <>
          <Text style={edu ? s.tEduSolo : s.tSolo}>{titulo}</Text>
          <Text style={s.dOwn}>{fechas}</Text>
        </>
      );
    // wrap={false}: la entrada ENTERA (cargo, fechas, ubicación y viñetas) no se
    // parte entre páginas. Un empleo cuyo encabezado queda huérfano al pie de la
    // página 1 no solo se ve mal: descoloca al parser que empareja cargo y fechas.
    return (
      <View key={key} wrap={false}>
        {cuerpo}
        <Text style={s.org}>{pie}</Text>
        {hijos}
      </View>
    );
  };

  const summaryBlock = (
    <>
      {heading("summary")}
      {sangrar(<Text style={s.sum}>{tt(b.summary)}</Text>)}
    </>
  );

  const skillsBlock = (
    <>
      {heading("skills")}
      {sangrar(
        skillLines(data.skills, m).map((linea, i) => (
          <Text key={i} style={s.skline}>
            {linea.map((sk, j) => (
              <Fragment key={j}>
                {j > 0 ? " · " : null}
                <Text style={s.skLabel}>{tt(sk.group)}:</Text> {tt(sk.items)}
              </Fragment>
            ))}
          </Text>
        )),
      )}
    </>
  );

  const workBlock = work.length > 0 && (
    <>
      {heading("work")}
      {work.map((w, i) =>
        entrada(
          <>
            {tt(w.title)} — {w.company}
          </>,
          tt(w.dates),
          tt(w.location),
          false,
          i,
          w.bullets.map((bl, j) => bullet(tt(bl), j)),
        ),
      )}
    </>
  );

  // Proyectos — cada proyecto es una viñeta, sin entrada ni fechas
  const projectsBlock = projects.length > 0 && (
    <>
      {heading("projects")}
      {sangrar(projects.map((p, i) => bullet(tt(p), i)))}
    </>
  );

  const educationBlock = education.length > 0 && (
    <>
      {heading("education")}
      {education.map((e, i) => entrada(tt(e.title), tt(e.dates), e.org, true, i))}
    </>
  );

  /** Los bloques por id, para que el ORDEN lo decida la plantilla y no el JSX. */
  const bloques: Record<SectionId, ReactNode> = {
    summary: summaryBlock,
    skills: skillsBlock,
    work: workBlock,
    projects: projectsBlock,
    education: educationBlock,
  };
  const cuerpoOrdenado = secciones.map((id) => <Fragment key={id}>{bloques[id]}</Fragment>);

  /* QR AL PIE — opt-in, dos modos. El glifo no lo lee el ATS.
     - 'url'  : la URL va SIEMPRE como TEXTO al lado (y como hipervínculo). Si
                el glifo no se pudo generar (URL muy larga), cae a solo-texto —
                el candado "la URL va como texto" no depende del QR.
     - 'vcard': codifica la vCard de los basics; el contacto YA está como texto
                en el cuerpo, así que aquí solo va el glifo + una leyenda honesta
                (sin URL extra al pie).
     Va al final del todo para no alterar el orden de lectura del documento. */
  const qrBlock = data.qr ? (
    (data.qr.mode ?? "url") === "vcard" ? (
      <View style={s.qrRow} wrap={false}>
        {qrImage ? <Image src={qrImage} style={s.qrImg} /> : null}
        <View>
          <Text style={s.qrCap}>Escanea para guardar el contacto</Text>
        </View>
      </View>
    ) : data.qr.url ? (
      <View style={s.qrRow} wrap={false}>
        {qrImage ? <Image src={qrImage} style={s.qrImg} /> : null}
        <View>
          <Text style={s.qrCap}>Escanea o visita:</Text>
          <Text style={s.qrUrl}>
            <Link src={hrefOf(data.qr.url)} style={s.linkUrl}>
              {data.qr.url}
            </Link>
          </Text>
        </View>
      </View>
    ) : null
  ) : null;

  return (
    <Document title={`CV — ${b.name}`} author={b.name}>
      <Page size="LETTER" style={s.page}>
        {tpl.layout.sidebar ? (
          /* GAMA VISUAL — barra lateral. Se ve mejor y parsea peor: el contacto y
             las habilidades quedan en una columna aparte, así que el orden del
             content stream ya no es el orden de lectura humano. Por eso esta gama
             lleva `warning` obligatorio y está fuera del round-trip. */
          <View style={s.cols}>
            <View style={s.side}>
              {photoBlock}
              {contactBlock}
              {skillsBlock}
              {educationBlock}
            </View>
            <View style={s.main}>
              {nameBlock}
              {summaryBlock}
              {workBlock}
              {projectsBlock}
              {qrBlock}
            </View>
          </View>
        ) : (
          /* GAMA ATS — UNA columna, en el orden exacto del texto plano. El orden de
             las secciones lo dicta la plantilla (`sectionOrder`), y toPlainText lo
             calcula con la MISMA función: por eso siguen siendo el mismo orden. */
          <>
            {photoBlock}
            {headerBlock}
            {cuerpoOrdenado}
            {qrBlock}
          </>
        )}
      </Page>
    </Document>
  );
}

export async function renderResumeToBuffer(data: ResumeData, opts: RenderOpts = {}): Promise<Buffer> {
  // El QR se genera aquí (async) para que ResumePDF siga siendo síncrono: recibe
  // la data-URL ya lista. Sin data.qr no se genera nada (OFF por defecto). El
  // PAYLOAD depende del modo: 'url' codifica la URL; 'vcard' codifica la vCard de
  // los basics EFECTIVOS.
  let qrImage: string | undefined;
  if (data.qr) {
    const mode = data.qr.mode ?? "url";
    const payload = mode === "vcard" ? buildVCard(data.basics, opts.locale ?? "es") : data.qr.url;
    if (payload) {
      try {
        qrImage = await QRCode.toDataURL(payload, { margin: 1, width: 240, errorCorrectionLevel: "M" });
      } catch (e) {
        // Contenido sobre la capacidad del QR (u otro fallo): no se genera el glifo,
        // pero el documento no revienta. En modo 'url' la URL igual va como TEXTO
        // (ResumePDF la dibuja aunque falte qrImage). Degradar está bien; callar por
        // qué, no: sin este log, un QR que nunca aparece es indepurable.
        console.error(`[cv] QR no generado (modo ${mode}, ${payload.length} chars):`, e);
        qrImage = undefined;
      }
    }
  }
  return renderToBuffer(<ResumePDF data={data} opts={opts} qrImage={qrImage} />);
}
