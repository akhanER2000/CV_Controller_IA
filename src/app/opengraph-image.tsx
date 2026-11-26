import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/* ============================================================================
   Tarjeta social · convención `src/app/opengraph-image.tsx` (1200×630).

   Sin esto, pegar el enlace en WhatsApp o LinkedIn pinta un rectángulo gris.
   La tarjeta lleva EL WORDMARK REAL —«Corpus» + el cuadrado de brasa, la misma
   marca de `.c-logo`— y una línea de producto honesta: la misma promesa que ya
   declara `metadata.description` en layout.tsx. Cero cifras: no hay usuarios que
   presumir ni «10.000 CV generados» que inventar.

   Colores literales de tokens (globals.css, Forja v2, tema oscuro):
     --bg #0E0C0B · --surface #171412 · --text #F5F1EB · --text-muted #BDB4AA
     --text-subtle #8F857C · --brasa-fill-a #F58C4A · --brasa-fill-b #EA6D2C
     · --border-brasa rgba(255,154,85,.55). El resplandor cálido es --brasa-500
     #F2782F al 22%, el mismo de la atmósfera de la landing.

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

const GRAFITO = "#0E0C0B"; // --bg
const SURFACE = "#171412"; // --surface
const TEXT = "#F5F1EB"; // --text
const TEXT_MUTED = "#BDB4AA"; // --text-muted
const TEXT_SUBTLE = "#8F857C"; // --text-subtle
const BRASA_A = "#F58C4A"; // --brasa-fill-a
const BRASA_B = "#EA6D2C"; // --brasa-fill-b
const GLOW = "rgba(242, 120, 47, 0.22)"; // --brasa-500 al 22%
const HAIRLINE = "rgba(255, 154, 85, 0.55)"; // --border-brasa

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
          backgroundImage: `radial-gradient(900px 520px at 88% -10%, ${GLOW}, transparent 70%), linear-gradient(135deg, ${GRAFITO} 0%, ${SURFACE} 100%)`,
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
          <div style={{ width: 26, height: 26, marginLeft: 16, marginTop: 6, backgroundImage: `linear-gradient(135deg, ${BRASA_A}, ${BRASA_B})`, borderRadius: 5.2 }} />
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

        {/* Barra de brasa rellena + hairline: el material de Forja v2. */}
        <div style={{ display: "flex", alignItems: "center", marginTop: 52 }}>
          <div style={{ display: "flex", width: 72, height: 6, borderRadius: 3, backgroundImage: `linear-gradient(90deg, ${BRASA_A}, ${BRASA_B})` }} />
          <div style={{ display: "flex", width: 140, height: 1, marginLeft: 12, background: HAIRLINE }} />
        </div>

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
