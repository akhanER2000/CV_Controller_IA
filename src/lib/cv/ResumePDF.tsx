import { Document, Page, View, Text, Image, Link, Font, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { Fragment } from "react";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";
import * as QRCode from "qrcode";
import { selectContent, linkUrl, buildVCard, type ResumeData, type Locale } from "./resume";
import { resolveMetrics, resolveTemplate, resolveTypography, type CvTemplate } from "./templates";

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
 * Reglas ATS materializadas (spec §8): UNA columna · cero tablas (fechas a la
 * derecha por flex) · contacto en el cuerpo con prefijos de texto "Email:"/"Tel:"
 * · cero iconos · cero fotos · texto seleccionable · viñeta "• " (U+2022, glifo de
 * texto que parsea limpio) · cargo en negrita · un solo acento #1F6E5A.
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
    },
    label: ty.labelItalic
      ? {
          fontFamily: ty.display, fontStyle: "italic", fontWeight: 500,
          fontSize: m.labelSize, lineHeight: 1.3, marginTop: 2,
        }
      : { fontWeight: 600, fontSize: m.labelSize, lineHeight: 1.3, marginTop: 2 },
    contact: { fontSize: m.contactSize, lineHeight: 1.5, color: p.muted, marginTop: 5 },
    contact2: { fontSize: m.contactSize, lineHeight: 1.5, color: p.muted, marginTop: 1 },
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
      color: headColor,
      marginTop: m.sectionGap,
      marginBottom: ruleGap,
      ...(m.headingRule
        ? { paddingBottom: ruleGap, borderBottomWidth: m.headingRuleWidth, borderBottomColor: p.hair }
        : null),
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
    org: { fontSize: m.dateSize, lineHeight: 1.35, color: p.muted, marginTop: 1 },
    b: {
      fontSize: body, lineHeight: m.bodyLeading, marginTop: m.bulletGap,
      paddingLeft: m.bulletIndent, textIndent: -m.bulletHang,
    },
    // Foto — OPT-IN (versión "visual"). Nunca en el render por defecto (golden).
    photo: { width: 84, height: 84, borderRadius: 4, marginBottom: 8, objectFit: "cover" },
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

  // Los bloques se declaran una vez y las dos composiciones (una columna / barra
  // lateral) los ORDENAN distinto. El contenido y su texto son idénticos: lo único
  // que cambia entre gamas es el orden en que caen en el content stream — que es,
  // exactamente, lo que un parser de ATS lee bien o mal.

  /* Foto — solo si el usuario la puso explícitamente. NUNCA es el avatar. Es un
     opt-in suyo y se respeta en cualquier plantilla (retrocompatible); la gama ATS
     simplemente no reserva hueco para ella en su composición. */
  const photoBlock = data.photo ? <Image src={data.photo} style={s.photo} /> : null;

  /* Cabecera — contacto EN EL CUERPO (no header/footer), con prefijos de texto */
  const nameBlock = (
    <>
      <Text style={s.name}>{b.name}</Text>
      <Text style={s.label}>{tt(b.label)}</Text>
    </>
  );

  const contactBlock = (
    <>
      <Text style={s.contact}>
        Email: {b.email} · Tel: {b.phone} · {tt(b.location)}
      </Text>
      {/* Cada URL es TEXTO seleccionable Y, ademÁs, un hipervínculo real (<Link>).
          El texto visible no cambia (la URL tal cual) — el href sí lleva https://. */}
      <Text style={s.contact2}>
        {b.links.map((l, i) => {
          const url = linkUrl(l);
          return (
            <Fragment key={i}>
              {i > 0 ? " · " : ""}
              <Link src={hrefOf(url)} style={s.linkContact}>
                {url}
              </Link>
            </Fragment>
          );
        })}
      </Text>
    </>
  );

  const summaryBlock = (
    <>
      <Text style={s.h}>{tt(data.headings.summary)}</Text>
      <Text style={s.sum}>{tt(b.summary)}</Text>
    </>
  );

  const skillsBlock = (
    <>
      <Text style={s.h}>{tt(data.headings.skills)}</Text>
      {data.skills.map((sk, i) => (
        <Text key={i} style={s.skline}>
          <Text style={s.skLabel}>{tt(sk.group)}:</Text> {tt(sk.items)}
        </Text>
      ))}
    </>
  );

  const workBlock = work.length > 0 && (
    <>
      <Text style={s.h}>{tt(data.headings.work)}</Text>
      {work.map((w, i) => (
        <View key={i} wrap={false}>
          <View style={s.erow}>
            <Text style={s.t}>
              {tt(w.title)} — {w.company}
            </Text>
            <Text style={s.d}>{tt(w.dates)}</Text>
          </View>
          <Text style={s.org}>{tt(w.location)}</Text>
          {w.bullets.map((bl, j) => (
            <Text key={j} style={s.b}>
              • {tt(bl)}
            </Text>
          ))}
        </View>
      ))}
    </>
  );

  // Proyectos — cada proyecto es una viñeta, sin erow/org
  const projectsBlock = projects.length > 0 && (
    <>
      <Text style={s.h}>{tt(data.headings.projects)}</Text>
      {projects.map((p, i) => (
        <Text key={i} style={s.b}>
          • {tt(p)}
        </Text>
      ))}
    </>
  );

  const educationBlock = education.length > 0 && (
    <>
      <Text style={s.h}>{tt(data.headings.education)}</Text>
      {education.map((e, i) => (
        <View key={i} wrap={false}>
          <View style={s.erow}>
            <Text style={s.tEdu}>{tt(e.title)}</Text>
            <Text style={s.d}>{tt(e.dates)}</Text>
          </View>
          <Text style={s.org}>{e.org}</Text>
        </View>
      ))}
    </>
  );

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
          /* GAMA ATS — UNA columna, en el orden exacto del texto plano. */
          <>
            {photoBlock}
            {nameBlock}
            {contactBlock}
            {summaryBlock}
            {skillsBlock}
            {workBlock}
            {projectsBlock}
            {educationBlock}
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
