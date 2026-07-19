import { ImageResponse } from "next/og";

/* ============================================================================
   Icono de pantalla de inicio de iOS · convención `src/app/apple-icon.tsx`.

   Mismo signo que el favicon (el cuadrado de acento del wordmark, §icon.tsx) a
   180×180, la medida que pide Apple. Dos diferencias deliberadas:

   · SIN esquinas redondeadas propias. iOS aplica su propia máscara; redondear
     aquí deja un halo de esquina. La tesela va a sangre.
   · El cuadrado baja al 49% (88 de 180) porque la máscara de iOS come esquina y
     porque a este tamaño ya no hay riesgo de que la forma se pierda: aquí el
     problema es el contrario, llenar demasiado.

   Radio del cuadrado: 20% del lado, la proporción del wordmark (17.6 de 88).
   Colores: --bg #0A0C0B (grafito) y --patina-500 #43B3A0, literales de tokens.
   ============================================================================ */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const GRAFITO = "#0A0C0B"; // --bg (dark)
const PATINA = "#43B3A0"; // --patina-500

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: GRAFITO,
        }}
      >
        <div style={{ width: 88, height: 88, background: PATINA, borderRadius: 17.6 }} />
      </div>
    ),
    { ...size },
  );
}
