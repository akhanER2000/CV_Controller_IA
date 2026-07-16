import { Document, Page, View, Text, Image, Font, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as QRCode from "qrcode";
import { selectContent, linkUrl, type ResumeData, type Locale } from "./resume";

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

// src/lib/cv → ../fonts = src/lib/fonts
const FONTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fonts");
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
Font.register({ family: "Playfair Display", fonts: [{ src: f("PlayfairDisplay-600.ttf"), fontWeight: 600 }] });
Font.register({ family: "Geist Mono", fonts: [{ src: f("GeistMono-Regular.ttf"), fontWeight: 400 }] });

// El guionado automático parte palabras (URLs, nombres) y ensucia el parseo ATS.
Font.registerHyphenationCallback((word) => [word]);

const C = { acc: "#1F6E5A", ink: "#14181A", mut: "#454B49", hair: "#D8DAD6" };

const s = StyleSheet.create({
  page: { paddingVertical: "18mm", paddingHorizontal: "20mm", fontFamily: "Geist", fontSize: 10, color: C.ink },
  name: { fontFamily: "Playfair Display", fontWeight: 600, fontSize: 22, lineHeight: 1.15, color: C.acc },
  label: { fontWeight: 600, fontSize: 11, lineHeight: 1.3, marginTop: 2 },
  contact: { fontSize: 9.5, lineHeight: 1.5, color: C.mut, marginTop: 5 },
  contact2: { fontSize: 9.5, lineHeight: 1.5, color: C.mut, marginTop: 1 },
  // ⚠ SIN letterSpacing: el tracking de imprenta (.h del diseño usa .1em) hace
  // que pdf.js extraiga el encabezado como letras separadas ("R E S U M E N") —
  // el patrón anti-ATS que el documento prohíbe (ESPECIFICACION §8). En el
  // documento gana el ATS siempre; el peso 700 + las mayúsculas hacen el trabajo
  // (ESPECIFICACION §4). El tracking se queda solo en la app, no en el PDF.
  h: {
    fontWeight: 700, fontSize: 10.5, lineHeight: 1.1,
    textTransform: "uppercase", color: C.acc,
    marginTop: 13, marginBottom: 3, paddingBottom: 3,
    borderBottomWidth: 1, borderBottomColor: C.hair,
  },
  sum: { fontSize: 10, lineHeight: 1.45, marginTop: 3 },
  skline: { fontSize: 10, lineHeight: 1.5, marginTop: 1.5 },
  skLabel: { fontWeight: 600 },
  erow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 },
  t: { fontWeight: 700, fontSize: 11, lineHeight: 1.3, flexShrink: 1 },
  tEdu: { fontWeight: 700, fontSize: 10.5, lineHeight: 1.3, flexShrink: 1 },
  d: { fontWeight: 400, fontSize: 9.5, lineHeight: 1.3, color: C.mut, paddingLeft: 12 },
  org: { fontSize: 9.5, lineHeight: 1.35, color: C.mut, marginTop: 1 },
  b: { fontSize: 10, lineHeight: 1.45, marginTop: 3, paddingLeft: 11, textIndent: -7.5 },
  // Foto — OPT-IN (versión "visual"). Nunca en el render por defecto (golden).
  photo: { width: 84, height: 84, borderRadius: 4, marginBottom: 8, objectFit: "cover" },
  // QR honesto al pie: el glifo + la URL SIEMPRE como texto (una columna).
  qrRow: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  qrImg: { width: 56, height: 56, marginRight: 10 },
  qrCap: { fontSize: 8.5, lineHeight: 1.4, color: C.mut },
  qrUrl: { fontSize: 9.5, lineHeight: 1.4, color: C.ink },
});

export interface RenderOpts {
  locale?: Locale;
  onePage?: boolean;
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

  return (
    <Document title={`CV — ${b.name}`} author={b.name}>
      <Page size="LETTER" style={s.page}>
        {/* Foto — solo si el usuario la puso explícitamente. NUNCA es el avatar. */}
        {data.photo ? <Image src={data.photo} style={s.photo} /> : null}

        {/* Cabecera — contacto EN EL CUERPO (no header/footer), con prefijos de texto */}
        <Text style={s.name}>{b.name}</Text>
        <Text style={s.label}>{tt(b.label)}</Text>
        <Text style={s.contact}>
          Email: {b.email} · Tel: {b.phone} · {tt(b.location)}
        </Text>
        <Text style={s.contact2}>{b.links.map(linkUrl).join(" · ")}</Text>

        {/* Resumen */}
        <Text style={s.h}>{tt(data.headings.summary)}</Text>
        <Text style={s.sum}>{tt(b.summary)}</Text>

        {/* Habilidades */}
        <Text style={s.h}>{tt(data.headings.skills)}</Text>
        {data.skills.map((sk, i) => (
          <Text key={i} style={s.skline}>
            <Text style={s.skLabel}>{tt(sk.group)}:</Text> {tt(sk.items)}
          </Text>
        ))}

        {/* Experiencia */}
        {work.length > 0 && (
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
        )}

        {/* Proyectos — cada proyecto es una viñeta, sin erow/org */}
        {projects.length > 0 && (
          <>
            <Text style={s.h}>{tt(data.headings.projects)}</Text>
            {projects.map((p, i) => (
              <Text key={i} style={s.b}>
                • {tt(p)}
              </Text>
            ))}
          </>
        )}

        {/* Educación */}
        {education.length > 0 && (
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
        )}

        {/* QR AL PIE — opt-in. El glifo no lo lee el ATS; la URL de al lado, sí.
            Va al final del todo para no alterar el orden de lectura del documento.
            La URL en TEXTO se dibuja SIEMPRE que haya qr.url: si el glifo no se pudo
            generar (p. ej. URL muy larga), cae a solo-texto — el candado "la URL va
            como texto" no depende de que el QR exista. */}
        {data.qr?.url ? (
          <View style={s.qrRow} wrap={false}>
            {qrImage ? <Image src={qrImage} style={s.qrImg} /> : null}
            <View>
              <Text style={s.qrCap}>Escanea o visita:</Text>
              <Text style={s.qrUrl}>{data.qr.url}</Text>
            </View>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderResumeToBuffer(data: ResumeData, opts: RenderOpts = {}): Promise<Buffer> {
  // El QR se genera aquí (async) para que ResumePDF siga siendo síncrono: recibe
  // la data-URL ya lista. Sin data.qr no se genera nada (OFF por defecto).
  let qrImage: string | undefined;
  if (data.qr?.url) {
    try {
      qrImage = await QRCode.toDataURL(data.qr.url, { margin: 1, width: 240, errorCorrectionLevel: "M" });
    } catch {
      // URL sobre la capacidad del QR (u otro fallo): no se genera el glifo, pero
      // la URL igual va como TEXTO (ResumePDF la dibuja aunque falte qrImage). Así
      // el documento nunca revienta por una URL demasiado larga.
      qrImage = undefined;
    }
  }
  return renderToBuffer(<ResumePDF data={data} opts={opts} qrImage={qrImage} />);
}
