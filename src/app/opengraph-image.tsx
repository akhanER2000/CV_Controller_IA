import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/* ============================================================================
   Tarjeta social · convención `src/app/opengraph-image.tsx` (1200×630).

   Sin esto, pegar el enlace en WhatsApp o LinkedIn pinta un rectángulo gris.
   La tarjeta lleva EL WORDMARK REAL —«Corpus» + el cuadrado de pátina, la misma
   marca de `.c-logo`— y una línea de producto honesta: la misma promesa que ya
   declara `metadata.description` en layout.tsx. Cero cifras: no hay usuarios que
   presumir ni «10.000 CV generados» que inventar.

   Colores literales de tokens (globals.css):
     --bg #0A0C0B · --surface #121615 · --text #F2F4F2 · --text-muted #AFB6B3
     --text-subtle #7E8784 · --patina-500 #43B3A0 · --border-patina rgba(95,198,169,.55)

   TIPOGRAFÍA. El wordmark es Playfair Display (--font-display) y el cuerpo es
   Geist (--font-sans); ambos .ttf viven en src/lib/fonts/ y son los MISMOS que
   registra el renderer del PDF. Se leen del disco en tiempo de render. Si la
   lectura falla —el bundle serverless solo traza esas .ttf para /api/cv, ver
   `outputFileTracingIncludes` en next.config.mjs— se cae a la fuente por defecto
   de ImageResponse en vez de reventar la ruta: una tarjeta con otra tipografía
   sigue siendo mejor que un rectángulo gris. Para que producción use la
   tipografía de marca hay que añadir esta ruta a esa lista de tracing, y
   next.config.mjs queda fuera de esta frontera.
   ============================================================================ */

export const runtime = "nodejs";
export const alt = "Corpus — el sistema de registro de tu carrera";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GRAFITO = "#0A0C0B";
const SURFACE = "#121615";
const TEXT = "#F2F4F2";
const TEXT_MUTED = "#AFB6B3";
const TEXT_SUBTLE = "#7E8784";
const PATINA = "#43B3A0";
const HAIRLINE = "rgba(95, 198, 169, 0.55)"; // --border-patina

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600; style: "normal" };

/** Lee una .ttf de src/lib/fonts. Devuelve null si no está (bundle sin tracing). */
async function font(file: string, name: string, weight: 400 | 500 | 600): Promise<Font | null> {
  try {
    const buf = await readFile(join(process.cwd(), "src", "lib", "fonts", file));
    return { name, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: "normal" };
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const fonts = (
    await Promise.all([
      font("PlayfairDisplay-500.ttf", "Playfair Display", 500),
      font("Geist-Regular.ttf", "Geist", 400),
      font("Geist-Medium.ttf", "Geist", 500),
      font("GeistMono-Regular.ttf", "Geist Mono", 400),
    ])
  ).filter((f): f is Font => f !== null);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          backgroundColor: GRAFITO,
          backgroundImage: `linear-gradient(135deg, ${GRAFITO} 0%, ${SURFACE} 100%)`,
          fontFamily: "Geist",
        }}
      >
        {/* Wordmark: «Corpus» + el cuadrado de acento, como en el header. */}
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Playfair Display",
              fontWeight: 500,
              fontSize: 112,
              lineHeight: 1,
              letterSpacing: "0.005em",
              color: TEXT,
            }}
          >
            Corpus
          </div>
          <div style={{ width: 26, height: 26, marginLeft: 16, marginTop: 6, background: PATINA, borderRadius: 5.2 }} />
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 34,
            fontSize: 44,
            fontWeight: 500,
            lineHeight: 1.25,
            color: TEXT,
          }}
        >
          El sistema de registro de tu carrera
        </div>

        <div style={{ display: "flex", marginTop: 20, fontSize: 30, lineHeight: 1.4, color: TEXT_MUTED, maxWidth: 860 }}>
          Un master profile canónico del que se derivan tus variantes de CV.
        </div>

        {/* Hairline de pátina: el mismo recurso que usa la UI para marcar estado. */}
        <div style={{ display: "flex", width: 180, height: 1, marginTop: 52, background: HAIRLINE }} />

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontFamily: "Geist Mono",
            fontSize: 22,
            letterSpacing: "0.02em",
            color: TEXT_SUBTLE,
          }}
        >
          La IA nunca inventa · cada dato tiene procedencia · el PDF lo lee el ATS
        </div>
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
