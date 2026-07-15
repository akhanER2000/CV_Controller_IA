"use client";

import { useState } from "react";
import Link from "next/link";
import { Aurora } from "@/components/Aurora";
import { useBoot } from "@/lib/corpus/runtime";
import "./auth.css";

/* ============================================================================
   Auth — porte de corpus-design/04-pantallas/auth.html (ver docs/spec/pantallas/auth.md)
   Una sola pantalla, dos modos (login · signup). VENTANA con aurora en calma.
   El estado `error` = login + el bloque de error visible (no un tercer layout).

   El panel `.demo` del HTML NO se porta: es convención de entrega, no producto.
   Los CTA son navegación de maqueta (a /app y /app/onboarding) hasta que se
   cablee Supabase en la fase de auth real; entonces esto pasa a <form> real
   conservando las clases c-btn c-btn--forge c-btn--lg y el wrapper span.c-forge.
   ============================================================================ */

type Mode = "login" | "signup";

export function AuthScreen({ initial = "login" }: { initial?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const signup = mode === "signup";

  // CorpusMotion.boot() — obligatorio: los [data-reveal] arrancan en opacity:0.
  // useBoot() sondea hasta que el runtime vanilla exista y entonces dibuja los
  // reveals del scope. Sin esto la pantalla se ve en blanco (fallo nº1 de los
  // ports anteriores: boot() disparado antes de que el script cargue).
  const bootRef = useBoot<HTMLElement>();

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

        <div
          className="c-panel au-panel"
          data-reveal
          style={{ "--d": "260ms" } as React.CSSProperties}
        >
          <h2 id="auTitle">{signup ? "Crear cuenta" : "Entrar"}</h2>

          {/* error = login + este bloque visible. Nodo siempre presente; alterna .show */}
          <div className="au-err" id="auErr" role="alert">
            Ese correo y esa contraseña no calzan. No sabemos cuál de los dos falla — así funciona la
            seguridad.{" "}
            <a href="#" style={{ whiteSpace: "nowrap" }}>
              Recuperar acceso →
            </a>
          </div>

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
            />
          </div>

          <div className="au-cta">
            <span className="c-forge" style={{ width: "100%" }}>
              <Link
                className="c-btn c-btn--forge c-btn--lg"
                id="auGo"
                href={signup ? "/app/onboarding" : "/app"}
                style={{ width: "100%" }}
              >
                {signup ? "Crear mi registro" : "Entrar"}
              </Link>
            </span>
          </div>

          <div className="au-alt">
            <button type="button" className="c-btn">
              Continuar con Google
            </button>
            <button type="button" className="c-btn">
              Continuar con GitHub
            </button>
          </div>

          <div className="au-links">
            <a
              href="#"
              id="auSwap"
              onClick={(e) => {
                e.preventDefault();
                setMode(signup ? "login" : "signup");
              }}
            >
              {signup ? "Ya tengo cuenta" : "Crear cuenta"}
            </a>
            <a href="#">Olvidé mi contraseña</a>
          </div>
        </div>

        <p className="au-fine" data-reveal style={{ "--d": "380ms" } as React.CSSProperties}>
          Tus datos son tuyos: exportas todo o borras todo desde Ajustes, sin pedir permiso. La
          descarga de tu CV nunca queda detrás de un pago.
        </p>
      </main>
    </div>
  );
}
