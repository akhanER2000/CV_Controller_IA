"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Aurora, useAuroraTune, AURORA_HOJEO } from "@/components/Aurora";
import { useT } from "@/lib/i18n";
import { useBoot } from "@/lib/corpus/runtime";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";
import "./auth.css";

/* ============================================================================
   Auth — porte de corpus-design/04-pantallas/auth.html (docs/spec/pantallas/auth.md)
   con autenticación real de Supabase. Una pantalla, dos modos (login · signup).
   El estado `error` = login + el bloque de error.

   ★ ES LA ÚNICA PANTALLA QUE SIGUE MONTANDO <Aurora> además del shell, porque
   /auth, /login y /signup viven FUERA de src/app/app/layout.tsx. Dentro de /app
   nadie la monta: la monta el layout una sola vez y cada pantalla declara su
   intensidad. Entrar es ceremonia, no trabajo: humo entero (0.55).

   La spec autoriza convertir el CTA en un <form> real conservando las clases
   c-btn c-btn--forge c-btn--lg y el wrapper span.c-forge — es lo que se hace aquí.
   Sin claves de Supabase (modo local) el CTA solo navega (maqueta).
   ============================================================================ */

type Mode = "login" | "signup";

export function AuthScreen({ initial = "login" }: { initial?: Mode }) {
  const t = useT();
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
      setErr(t("auth.err.pwMismatch"));
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
          setInfo(t("auth.info.accountCreated"));
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
        setErr(t("auth.err.credentials"));
      } else if (msg.includes("already") || msg.includes("registered")) {
        setErr(t("auth.err.alreadyRegistered"));
      } else if (msg.includes("confirm")) {
        setErr(t("auth.err.unconfirmed"));
      } else {
        setErr(e instanceof Error ? e.message : t("auth.err.generic"));
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

  // Fuera del shell /app: aquí sí se MONTA, y se declara el dial de reposo.
  useAuroraTune(AURORA_HOJEO);

  return (
    <div className="c-page">
      <Aurora state="calm" />
      <main className="au-main c-window" data-screen-label="auth" ref={bootRef}>
        <div className="au-brand" data-reveal>
          Corpus
        </div>
        <p className="au-claim" data-reveal style={{ "--d": "120ms" } as React.CSSProperties}>
          {t("auth.claim")}
        </p>

        <form
          className="c-panel au-panel"
          data-reveal
          style={{ "--d": "260ms" } as React.CSSProperties}
          onSubmit={submit}
        >
          <h2 id="auTitle">{signup ? t("auth.title.signup") : t("auth.title.login")}</h2>

          <div className={`au-err${err ? " show" : ""}`} id="auErr" role="alert">
            {err}{" "}
            <a href="#" style={{ whiteSpace: "nowrap" }}>
              {t("auth.recoverAccess")}
            </a>
          </div>

          {info ? (
            <div className="au-err show" role="status" style={{ borderColor: "var(--border-patina)", background: "transparent" }}>
              {info}
            </div>
          ) : null}

          <div className="au-f">
            <label className="c-label" htmlFor="em">
              {t("auth.email.label")}
            </label>
            <input
              className="c-input"
              id="em"
              type="email"
              autoComplete="email"
              placeholder={t("auth.email.placeholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="au-f">
            <label className="c-label" htmlFor="pw">
              {t("auth.password.label")}
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
              {t("auth.password2.label")}
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
                {busy ? "…" : signup ? t("auth.cta.signup") : t("auth.cta.login")}
              </button>
            </span>
          </div>

          <div className="au-alt">
            <button type="button" className="c-btn" onClick={() => oauth("google")}>
              {t("auth.oauth.google")}
            </button>
            <button type="button" className="c-btn" onClick={() => oauth("github")}>
              {t("auth.oauth.github")}
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
              {signup ? t("auth.swap.toLogin") : t("auth.swap.toSignup")}
            </a>
            <a href="#">{t("auth.forgot")}</a>
          </div>
        </form>

        <p className="au-fine" data-reveal style={{ "--d": "380ms" } as React.CSSProperties}>
          {t("auth.fine")}
        </p>
      </main>
    </div>
  );
}
