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
   Colores (Forja v2): --bg #0E0C0B (grafito) y la brasa rellena --brasa-fill-a
   #F58C4A → --brasa-fill-b #EA6D2C, literales de tokens.
   ============================================================================ */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const GRAFITO = "#0E0C0B"; // --bg (dark)
const BRASA_A = "#F58C4A"; // --brasa-fill-a
const BRASA_B = "#EA6D2C"; // --brasa-fill-b

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
        <div style={{ width: 88, height: 88, backgroundImage: `linear-gradient(135deg, ${BRASA_A}, ${BRASA_B})`, borderRadius: 17.6 }} />
      </div>
    ),
    { ...size },
  );
}
