import type { Metadata } from "next";
import { CorpusRuntime } from "@/components/CorpusRuntime";
import { LangProvider } from "@/lib/i18n";
import "./globals.css";

/*
 * Las fuentes (Geist, Geist Mono, Playfair Display) se auto-hospedan vía
 * @font-face en globals.css (§0), con los MISMOS .ttf que registra el renderer
 * del PDF (src/lib/fonts/). Se referencian por nombre de familia — exactamente
 * como las nombra tokens.css — así que no hay wiring de next/font aquí.
 */

const TITLE = "Corpus — El sistema de registro de tu carrera";
const DESCRIPTION =
  "Un master profile canónico del que se derivan tus variantes de CV. La IA nunca inventa; cada dato tiene procedencia; el PDF lo lee el ATS exactamente como lo ves.";

/*
 * Los iconos (icon.tsx, apple-icon.tsx) y las tarjetas sociales
 * (opengraph-image.tsx, twitter-image.tsx) los descubre Next POR CONVENCIÓN DE
 * ARCHIVO en src/app/: no se declaran aquí, y declararlos a mano los duplicaría.
 * Lo que sí hace falta declarar es el texto de la tarjeta: sin un bloque
 * `openGraph`, Next no emite og:title ni og:description, así que WhatsApp y
 * LinkedIn pintarían la imagen sin titular. `metadataBase` es la base para
 * resolver la URL absoluta de esa imagen (la misma variable que documenta
 * DEPLOY.md).
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Corpus",
    locale: "es_ES",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
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
        {/* LangProvider envuelve TODA la app (no solo /app): auth, onboarding y
            login también usan useT(). El idioma inicial sale de localStorage y se
            reconcilia con user_settings al montar. */}
        <LangProvider>{children}</LangProvider>
        <CorpusRuntime />
      </body>
    </html>
  );
}
