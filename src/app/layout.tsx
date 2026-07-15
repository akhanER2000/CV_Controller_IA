import type { Metadata } from "next";
import { CorpusRuntime } from "@/components/CorpusRuntime";
import "./globals.css";

/*
 * Las fuentes (Geist, Geist Mono, Playfair Display) se auto-hospedan vía
 * @font-face en globals.css (§0), con los MISMOS .ttf que registra el renderer
 * del PDF (src/lib/fonts/). Se referencian por nombre de familia — exactamente
 * como las nombra tokens.css — así que no hay wiring de next/font aquí.
 */

export const metadata: Metadata = {
  title: "Corpus — El sistema de registro de tu carrera",
  description:
    "Un master profile canónico del que se derivan tus variantes de CV. La IA nunca inventa; cada dato tiene procedencia; el PDF lo lee el ATS exactamente como lo ves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Anti-flash: fija el tema persistido ANTES del primer paint (evita el
            parpadeo oscuro para quien usa porcelana). Lee la misma clave que
            escribe UserMenu. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('corpus-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}",
          }}
        />
      </head>
      <body>
        {children}
        <CorpusRuntime />
      </body>
    </html>
  );
}
