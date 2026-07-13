"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuroraCanvas } from "@/components/AuroraCanvas";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    if (pw.length < 6) {
      setBusy(false);
      setErr("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    const { data, error } = await createClient().auth.signUp({
      email,
      password: pw,
      options: { data: { name } },
    });
    setBusy(false);
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("already") || m.includes("registered")) {
        setErr("Ese correo ya tiene cuenta. Entra desde “Ya tengo cuenta”.");
      } else {
        setErr(error.message);
      }
      return;
    }
    if (data.session) {
      router.push("/app");
      router.refresh();
    } else {
      setMsg("Cuenta creada. Revisa tu correo para confirmarla y luego entra.");
    }
  }

  return (
    <main className="auth c-window">
      <AuroraCanvas />
      <ThemeToggle />
      <form className="auth__card c-panel" onSubmit={submit}>
        <p className="auth__brand">Corpus</p>
        <div className="auth__fields" style={{ gap: "var(--space-2)" }}>
          <h1 className="auth__title">Crea tu registro.</h1>
          <p className="auth__sub">Tu carrera, en un solo lugar.</p>
        </div>
        <div className="auth__fields">
          <div className="field">
            <label htmlFor="name">Nombre</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="pw">Contraseña</label>
            <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required minLength={6} />
          </div>
          {err ? <p className="auth__error">{err}</p> : null}
          {msg ? <p className="auth__ok">{msg}</p> : null}
          <button className="btn btn--gold" type="submit" disabled={busy}>{busy ? "Creando…" : "Crear cuenta"}</button>
        </div>
        <div className="auth__row">
          <Link href="/">← Volver</Link>
          <Link href="/login">Ya tengo cuenta</Link>
        </div>
        <p className="auth__legal">La descarga de tu PDF es siempre gratis.</p>
      </form>
    </main>
  );
}
