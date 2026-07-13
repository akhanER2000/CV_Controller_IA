import { AuroraCanvas } from "@/components/AuroraCanvas";
import { ThemeToggle } from "@/components/ThemeToggle";

// Copy literal de 06-handoff/copy.md · sección 1 (auth). No improvisar.
// Fase 0: UI atmosférica con la aurora VIVA. La autenticación real (Supabase)
// se cablea cuando existan las credenciales del proyecto.
export default function AuthPage() {
  return (
    <main className="auth c-window">
      <AuroraCanvas />
      <ThemeToggle />

      <div className="auth__card c-panel">
        <p className="auth__brand">Corpus</p>

        <div className="auth__fields" style={{ gap: "var(--space-2)" }}>
          <h1 className="auth__title">Tu carrera, en un solo registro.</h1>
          <p className="auth__sub">Entra para retomar tu master y tus variantes.</p>
        </div>

        <form className="auth__fields" action="#">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" placeholder="tu@email.com" />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" />
          </div>
          <button className="btn btn--gold" type="submit">Entrar</button>
        </form>

        <div className="auth__row">
          <a href="#">¿Olvidaste tu contraseña?</a>
          <a href="#">¿Primera vez? Crea tu registro.</a>
        </div>

        <div className="auth__sep">o</div>

        <div className="auth__oauth">
          <button className="btn btn--ghost" type="button">Continuar con Google</button>
          <button className="btn btn--ghost" type="button">Continuar con GitHub</button>
          <p className="auth__hint">GitHub también conecta tus repos como evidencia.</p>
        </div>

        <p className="auth__legal">La descarga de tu PDF es siempre gratis. Cancelas en un clic.</p>
      </div>
    </main>
  );
}
