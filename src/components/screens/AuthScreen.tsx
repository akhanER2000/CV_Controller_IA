"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Aurora } from "@/components/Aurora";
import { useBoot } from "@/lib/corpus/runtime";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";
import "./auth.css";

/* ============================================================================
   Auth — porte de corpus-design/04-pantallas/auth.html (docs/spec/pantallas/auth.md)
   con autenticación real de Supabase. Una pantalla, dos modos (login · signup).
   VENTANA con aurora en calma. El estado `error` = login + el bloque de error.

   La spec autoriza convertir el CTA en un <form> real conservando las clases
   c-btn c-btn--forge c-btn--lg y el wrapper span.c-forge — es lo que se hace aquí.
   Sin claves de Supabase (modo local) el CTA solo navega (maqueta).
   ============================================================================ */

type Mode = "login" | "signup";

export function AuthScreen({ initial = "login" }: { initial?: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  const bootRef = useBoot<HTMLElement>();

  function swap() {
    setMode(signup ? "login" : "signup");
    setErr(null);
    setInfo(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);

    if (!supabaseEnabled) {
      router.push(signup ? "/app/onboarding" : "/app"); // modo local: maqueta
      return;
    }
    if (signup && pw !== pw2) {
      setErr("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    const sb = createClient();
    try {
      if (signup) {
        const { data, error } = await sb.auth.signUp({
          email,
          password: pw,
          options: { emailRedirectTo: `${location.origin}/app` },
        });
        if (error) throw error;
        if (data.session) {
          router.push("/app/onboarding");
          router.refresh();
        } else {
          setInfo("Cuenta creada. Revisa tu correo para confirmarla y luego entra. (Puedes desactivar la confirmación en Supabase → Authentication → Sign In.)");
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        router.push("/app");
        router.refresh();
      }
    } catch (e) {
      const msg = (e instanceof Error ? e.message : "").toLowerCase();
      if (msg.includes("invalid") || msg.includes("credentials")) {
        setErr("Ese correo y esa contraseña no calzan. No sabemos cuál de los dos falla — así funciona la seguridad.");
      } else if (msg.includes("already") || msg.includes("registered")) {
        setErr("Ese correo ya tiene cuenta. Entra desde “Ya tengo cuenta”.");
      } else if (msg.includes("confirm")) {
        setErr("Tu correo aún no está confirmado. Revisa tu bandeja, o desactiva la confirmación en Supabase.");
      } else {
        setErr(e instanceof Error ? e.message : "No se pudo completar. Reintenta.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "github") {
    if (!supabaseEnabled) return;
    setErr(null);
    await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/app` },
    });
  }

  return (
    <div className="c-page">
      <Aurora state="calm" />
      <main className="au-main c-window" data-screen-label="auth" ref={bootRef}>
        <div className="au-brand" data-reveal>
          Corpus
        </div>
        <p className="au-claim" data-reveal style={{ "--d": "120ms" } as React.CSSProperties}>
          Un registro canónico de tu carrera. Cada CV, una vista de él — no una copia.
        </p>

        <form
          className="c-panel au-panel"
          data-reveal
          style={{ "--d": "260ms" } as React.CSSProperties}
          onSubmit={submit}
        >
          <h2 id="auTitle">{signup ? "Crear cuenta" : "Entrar"}</h2>

          <div className={`au-err${err ? " show" : ""}`} id="auErr" role="alert">
            {err}{" "}
            <a href="#" style={{ whiteSpace: "nowrap" }}>
              Recuperar acceso →
            </a>
          </div>

          {info ? (
            <div className="au-err show" role="status" style={{ borderColor: "var(--border-patina)", background: "transparent" }}>
              {info}
            </div>
          ) : null}

          <div className="au-f">
            <label className="c-label" htmlFor="em">
              Email
            </label>
            <input
              className="c-input"
              id="em"
              type="email"
              autoComplete="email"
              placeholder="tu@correo.cl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="au-f">
            <label className="c-label" htmlFor="pw">
              Contraseña
            </label>
            <input
              className="c-input"
              id="pw"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder="••••••••••"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
          </div>

          <div className="au-f" id="pw2wrap" hidden={!signup}>
            <label className="c-label" htmlFor="pw2">
              Repite la contraseña
            </label>
            <input
              className="c-input"
              id="pw2"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••••"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </div>

          <div className="au-cta">
            <span className="c-forge" style={{ width: "100%" }}>
              <button
                type="submit"
                className="c-btn c-btn--forge c-btn--lg"
                id="auGo"
                style={{ width: "100%" }}
                disabled={busy}
              >
                {busy ? "…" : signup ? "Crear mi registro" : "Entrar"}
              </button>
            </span>
          </div>

          <div className="au-alt">
            <button type="button" className="c-btn" onClick={() => oauth("google")}>
              Continuar con Google
            </button>
            <button type="button" className="c-btn" onClick={() => oauth("github")}>
              Continuar con GitHub
            </button>
          </div>

          <div className="au-links">
            <a
              href="#"
              id="auSwap"
              onClick={(e) => {
                e.preventDefault();
                swap();
              }}
            >
              {signup ? "Ya tengo cuenta" : "Crear cuenta"}
            </a>
            <a href="#">Olvidé mi contraseña</a>
          </div>
        </form>

        <p className="au-fine" data-reveal style={{ "--d": "380ms" } as React.CSSProperties}>
          Tus datos son tuyos: exportas todo o borras todo desde Ajustes, sin pedir permiso. La
          descarga de tu CV nunca queda detrás de un pago.
        </p>
      </main>
    </div>
  );
}
