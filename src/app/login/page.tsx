"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuroraCanvas } from "@/components/AuroraCanvas";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password: pw });
    if (error) {
      setBusy(false);
      const m = error.message.toLowerCase();
      if (m.includes("not confirmed") || m.includes("confirm")) {
        setErr("Tu correo aún no está confirmado. Revisa tu bandeja, o desactiva la confirmación en Supabase (Authentication → Sign In → Confirm email = OFF).");
      } else if (m.includes("invalid") || m.includes("credentials")) {
        setErr("Email o contraseña incorrectos. ¿Es tu primera vez? Crea tu cuenta con “Crear cuenta”.");
      } else {
        setErr(error.message);
      }
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <main className="auth c-window">
      <AuroraCanvas />
      <ThemeToggle />
      <form className="auth__card c-panel c-panel-in" onSubmit={submit}>
        <p className="auth__brand">Corpus</p>
        <div className="auth__fields" style={{ gap: "var(--space-2)" }}>
          <h1 className="auth__title">Tu carrera, en un solo registro.</h1>
          <p className="auth__sub">Entra para retomar tu master y tus variantes.</p>
        </div>
        <div className="auth__fields">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="pw">Contraseña</label>
            <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
          </div>
          {err ? <p className="auth__error">{err}</p> : null}
          <button className="btn btn--gold" type="submit" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        </div>
        <div className="auth__row">
          <Link href="/">← Volver</Link>
          <Link href="/signup">Crear cuenta</Link>
        </div>
        <p className="auth__legal">La descarga de tu PDF es siempre gratis.</p>
      </form>
    </main>
  );
}
