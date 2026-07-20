"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuroraTune, AURORA_HOJEO } from "@/components/Aurora";
import { useT } from "@/lib/i18n";
import "./onboarding.css";

/* ============================================================================
   Onboarding — porte de corpus-design/04-pantallas/onboarding.html
   (ver docs/spec/pantallas/onboarding.md). Sala de puertas: el humo entero
   (0.55). La aurora la monta el shell (app/app/layout); aquí solo se declara la
   intensidad. Las dos puertas al mismo master; ninguna de segunda.

   Fidelidad:
   - overline con charReveal, h1 con wordReveal (una sola vez, tras el runtime).
   - Puerta A abre in-situ la parrilla de plantillas (toggle .open).
   - Puerta A es un <button> (no un <div onclick>) para cerrar el hueco de
     teclado documentado en la spec §8, conservando clases c-card c-lift ob-door.
   - El panel .demo NO se porta (convención de entrega, no producto).
   ============================================================================ */

export function OnboardingScreen() {
  const t = useT();
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
      <AuroraTune strength={AURORA_HOJEO} />

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
            {t("onboarding.header")}
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
          {t("onboarding.overline")}
        </span>

        <h1 className="ob-h1" id="h1" ref={h1Ref} style={{ marginTop: "20px" }}>
          {t("onboarding.h1.pre")}
          <em>{t("onboarding.h1.em")}</em>
        </h1>

        <p className="ob-sub" data-reveal style={{ "--d": "480ms" } as React.CSSProperties}>
          {t("onboarding.sub")}
        </p>

        <div className="ob-doors">
          <button
            type="button"
            className="c-panel c-lift ob-door"
            id="doorA"
            data-reveal
            style={{ "--d": "600ms" } as React.CSSProperties}
            data-screen-label="onboarding-puerta-manual"
            aria-expanded={open}
            aria-controls="tpl"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="t-overline">{t("onboarding.doorA.overline")}</span>
            <h3>{t("onboarding.doorA.title")}</h3>
            <p>
              {t("onboarding.doorA.body.pre")}
              <b style={{ color: "var(--text)", fontWeight: 500 }}>
                {t("onboarding.doorA.body.bold")}
              </b>
              {t("onboarding.doorA.body.post")}
            </p>
            <p className="fine">{t("onboarding.doorA.fine")}</p>
            <span className="go" id="goA">
              {t("onboarding.doorA.cta")}
              {open ? " ▴" : " ▾"}
            </span>
          </button>

          <Link
            className="c-panel c-lift ob-door"
            href="/app/importar"
            data-reveal
            style={{ "--d": "680ms" } as React.CSSProperties}
            data-screen-label="onboarding-puerta-ia"
          >
            <span className="t-overline">{t("onboarding.doorB.overline")}</span>
            <h3>{t("onboarding.doorB.title")}</h3>
            <p>
              {t("onboarding.doorB.body.pre")}
              <b style={{ color: "var(--text)", fontWeight: 500 }}>
                {t("onboarding.doorB.body.bold")}
              </b>
              {t("onboarding.doorB.body.post")}
            </p>
            <p className="fine">{t("onboarding.doorB.fine")}</p>
            <span className="go">{t("onboarding.doorB.cta")}</span>
          </Link>
        </div>

        <div
          className={`ob-tpl${open ? " open" : ""}`}
          id="tpl"
          ref={tplRef}
          data-screen-label="onboarding-plantillas"
        >
          <div className="gh">
            <span className="t-overline">{t("onboarding.tpl.overline")}</span>
          </div>
          <hr className="c-divider" />
          <div className="rows" style={{ marginTop: "12px" }}>
            <Link href="/app/master">
              <b>{t("onboarding.tpl.backend.title")}</b>
              <span>{t("onboarding.tpl.backend.desc")}</span>
            </Link>
            <Link href="/app/master">
              <b>{t("onboarding.tpl.data.title")}</b>
              <span>{t("onboarding.tpl.data.desc")}</span>
            </Link>
            <Link href="/app/master">
              <b>{t("onboarding.tpl.design.title")}</b>
              <span>{t("onboarding.tpl.design.desc")}</span>
            </Link>
            <Link href="/app/master">
              <b>{t("onboarding.tpl.product.title")}</b>
              <span>{t("onboarding.tpl.product.desc")}</span>
            </Link>
            <Link href="/app/master">
              <b>{t("onboarding.tpl.blank.title")}</b>
              <span>{t("onboarding.tpl.blank.desc")}</span>
            </Link>
            <Link href="/app/importar">
              <b>{t("onboarding.tpl.dump.title")}</b>
              <span>{t("onboarding.tpl.dump.desc")}</span>
            </Link>
          </div>
        </div>

        <p className="ob-note" data-reveal style={{ "--d": "760ms" } as React.CSSProperties}>
          {t("onboarding.note")}
        </p>
      </main>
    </div>
  );
}
