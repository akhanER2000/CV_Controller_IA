import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Playfair_Display } from "next/font/google";
import { CanonRuntime } from "@/components/CanonRuntime";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Corpus — El sistema de registro de tu carrera",
  description:
    "Un master profile canónico del que se derivan tus variantes de CV. La IA nunca inventa; cada dato tiene procedencia; el PDF lo lee el ATS exactamente como lo ves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${GeistSans.variable} ${GeistMono.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <body>
        {children}
        <CanonRuntime />
      </body>
    </html>
  );
}
