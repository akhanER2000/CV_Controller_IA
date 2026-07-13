import Link from "next/link";
import { AuroraCanvas } from "@/components/AuroraCanvas";
import { ThemeToggle } from "@/components/ThemeToggle";

// Landing pública (capa atmosférica). Sin registro: un botón entra directo al panel.
export default function Landing() {
  return (
    <main className="landing c-window">
      <AuroraCanvas active />
      <ThemeToggle />
      <div className="landing__inner">
        <p className="landing__eyebrow">Corpus</p>
        <h1 className="landing__title">
          Tu carrera, en <em>un solo registro</em>.
        </h1>
        <p className="landing__lede">
          Escribe tu experiencia una vez. Cada CV es una vista de ese registro, listo para el ATS,
          exportable en PDF cuando lo necesites.
        </p>
        <Link href="/app" className="landing__cta">
          Entrar al panel →
        </Link>
        <p className="landing__note">
          Sin registro. Tus datos viven en este navegador. La descarga del PDF es siempre gratis.
        </p>
      </div>
    </main>
  );
}
