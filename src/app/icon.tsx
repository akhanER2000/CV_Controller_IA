import { ImageResponse } from "next/og";

/* ============================================================================
   Favicon · convención de archivo de App Router (`src/app/icon.tsx`).

   NO se inventa un isotipo: la marca ya existe. El wordmark es «Corpus» seguido
   de un cuadrado de acento — `.c-logo::after` en globals.css: 5×5 px, radio 1px,
   `background: var(--brasa-500)` (Forja v2). El icono ES ESE CUADRADO, aislado, sobre el
   grafito de la app.

   Colores literales de los tokens (globals.css §paleta), no aproximados:
     · grafito  --bg (tema oscuro) ......... #0E0C0B
     · brasa    --brasa-fill-a → -fill-b ... #F58C4A → #EA6D2C (la brasa rellena
                de Forja v2; --brasa-500 #F2782F da 6.97:1 sobre grafito)

   DISEÑADO A 16 px, escalado a 32. El error clásico del favicon es dibujar a
   512 y encoger: el cuadrado queda con tanto margen que en la pestaña
   desaparece. Aquí el cuadrado ocupa el 56% del lienzo (18 de 32 → 9 de 16
   reales), que es el mínimo para que se lea como una forma y no como un punto.
   El radio conserva la proporción del wordmark: 20% del lado (1/5 en el
   original) → 3.6 de 18.

   TEMA CLARO/OSCURO: la convención de archivos de Next NO emite `media` en el
   <link rel="icon">, así que el navegador no puede elegir entre dos variantes
   por `prefers-color-scheme` (sí lo permitiría un <link> a mano, que es
   precisamente lo que esta convención sustituye). Por eso el icono no es un
   glifo transparente que dependa del fondo: es una TESELA OPACA de grafito con
   el cuadrado dentro. Se lee igual sobre la barra clara de Safari que sobre la
   oscura de Chrome, sin variantes que mantener.
   ============================================================================ */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const GRAFITO = "#0E0C0B"; // --bg (dark)
const BRASA_A = "#F58C4A"; // --brasa-fill-a
const BRASA_B = "#EA6D2C"; // --brasa-fill-b

export default function Icon() {
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
          borderRadius: 7,
        }}
      >
        <div style={{ width: 18, height: 18, backgroundImage: `linear-gradient(135deg, ${BRASA_A}, ${BRASA_B})`, borderRadius: 3.6 }} />
      </div>
    ),
    { ...size },
  );
}
