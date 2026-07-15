"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Aurora } from "@/components/Aurora";
import "./onboarding.css";

/* ============================================================================
   Onboarding — porte de corpus-design/04-pantallas/onboarding.html
   (ver docs/spec/pantallas/onboarding.md). VENTANA con aurora en calma.
   Las dos puertas al mismo master; ninguna de segunda.

   Fidelidad:
   - overline con charReveal, h1 con wordReveal (una sola vez, tras el runtime).
   - Puerta A abre in-situ la parrilla de plantillas (toggle .open).
   - Puerta A es un <button> (no un <div onclick>) para cerrar el hueco de
     teclado documentado en la spec §8, conservando clases c-card c-lift ob-door.
   - El panel .demo NO se porta (convención de entrega, no producto).
   ============================================================================ */

export function OnboardingScreen() {
  const [open, setOpen] = useState(false);
  const ovRef = useRef<HTMLSpanElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const tplRef = useRef<HTMLDivElement>(null);
  const splitDone = useRef(false);

  // charReveal + wordReveal + boot — una sola vez, cuando el runtime exista.
  useEffect(() => {
    let tries = 0;
    const id = window.setInterval(() => {
      const M = window.CorpusMotion;
      if (!M) {
        if (++tries > 100) window.clearInterval(id);
        return;
      }
      window.clearInterval(id);
      if (!splitDone.current) {
        splitDone.current = true;
        if (ovRef.current) M.chars(ovRef.current);
        if (h1Ref.current) M.words(h1Ref.current);
      }
      M.boot();
    }, 30);
    return () => window.clearInterval(id);
  }, []);

  // Al abrir la parrilla: entrada C2 + dibujar el hairline interno.
  useEffect(() => {
    if (!open || !tplRef.current) return;
    const M = window.CorpusMotion;
    if (!M) return;
    M.enter(tplRef.current);
    M.boot(tplRef.current);
  }, [open]);

  return (
    <div className="c-page">
      <Aurora state="calm" />

      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/app">
            Corpus
          </Link>
          <span
            style={{
              marginLeft: "14px",
              font: "500 var(--fs-micro)/1 var(--font-mono)",
              letterSpacing: ".14em",
              color: "var(--text-muted)",
            }}
          >
            EMPEZAR
          </span>
          <div className="hd-right">
            <div className="hd-lang">
              <span data-on>ES</span>
              <span>EN</span>
            </div>
            <div className="hd-av">DG</div>
          </div>
        </div>
      </header>

      <main className="ob-main c-window" data-screen-label="onboarding">
        <span className="t-overline" id="ov" ref={ovRef}>
          Un master, N variantes — partamos por el master
        </span>

        <h1 className="ob-h1" id="h1" ref={h1Ref} style={{ marginTop: "20px" }}>
          ¿Cómo prefieres <em>empezar?</em>
        </h1>

        <p className="ob-sub" data-reveal style={{ "--d": "480ms" } as React.CSSProperties}>
          Dos puertas al mismo lugar. Puedes cruzar la otra cuando quieras — el registro es uno solo.
        </p>

        <div className="ob-doors">
          <button
            type="button"
            className="c-card c-lift ob-door"
            id="doorA"
            data-reveal
            style={{ "--d": "600ms" } as React.CSSProperties}
            data-screen-label="onboarding-puerta-manual"
            aria-expanded={open}
            aria-controls="tpl"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="t-overline">Puerta A · sin IA</span>
            <h3>Escribirlo tú</h3>
            <p>
              Desde una plantilla de rol o en blanco, con la IA apagada. Escribes, Corpus estructura.
              Cada item queda con <b style={{ color: "var(--text)", fontWeight: 500 }}>origen: tú</b> —
              el más verificable de todos: no hay nada que rastrear, lo afirmaste tú.
            </p>
            <p className="fine">bien para: perfeccionistas, perfiles simples, desconfiados con razón</p>
            <span className="go" id="goA">
              {open ? "Elegir plantilla ▴" : "Elegir plantilla ▾"}
            </span>
          </button>

          <Link
            className="c-card c-lift ob-door"
            href="/app/importar"
            data-reveal
            style={{ "--d": "680ms" } as React.CSSProperties}
            data-screen-label="onboarding-puerta-ia"
          >
            <span className="t-overline">Puerta B · con IA</span>
            <h3>Volcarlo</h3>
            <p>
              Pega texto suelto, tu CV viejo, links a tu GitHub y portfolio. La IA extrae y cita el
              fragmento de origen de cada dato;{" "}
              <b style={{ color: "var(--text)", fontWeight: 500 }}>tú confirmas item por item</b> antes
              de que nada entre al master.
            </p>
            <p className="fine">bien para: 10 años de historia desordenada, poco tiempo, arranque rápido</p>
            <span className="go">Ir al volcado →</span>
          </Link>
        </div>

        <div
          className={`ob-tpl${open ? " open" : ""}`}
          id="tpl"
          ref={tplRef}
          data-screen-label="onboarding-plantillas"
        >
          <div className="gh">
            <span className="t-overline">
              Plantillas de perfil — estructura vacía, cero texto inventado
            </span>
          </div>
          <hr className="c-divider" />
          <div className="rows" style={{ marginTop: "12px" }}>
            <Link href="/app/master">
              <b>Backend / plataforma</b>
              <span>roles · viñetas XYZ · skills por grupo · proyectos</span>
            </Link>
            <Link href="/app/master">
              <b>Data / IA</b>
              <span>igual + secciones de investigación y datasets</span>
            </Link>
            <Link href="/app/master">
              <b>Diseño</b>
              <span>igual + casos con problema → decisión → resultado</span>
            </Link>
            <Link href="/app/master">
              <b>Producto</b>
              <span>igual + métricas de negocio por rol</span>
            </Link>
            <Link href="/app/master">
              <b>En blanco</b>
              <span>solo la estructura del registro</span>
            </Link>
            <Link href="/app/importar">
              <b>Mejor, vuélcalo →</b>
              <span>cambiar a la puerta B</span>
            </Link>
          </div>
        </div>

        <p className="ob-note" data-reveal style={{ "--d": "760ms" } as React.CSSProperties}>
          La puerta A no es la puerta «difícil» ni la B la «tramposa»: las dos terminan en el mismo
          staging, con la misma revisión, y el mismo master.
        </p>
      </main>
    </div>
  );
}
