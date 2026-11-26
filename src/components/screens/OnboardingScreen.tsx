"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuroraTune, AURORA_HOJEO } from "@/components/Aurora";
import { useT } from "@/lib/i18n";
import { Chip, Icono, PageHeader, PanelHeader } from "@/components/ui";
import { Pasos } from "@/components/cuenta/Pasos";
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

      <main className="cu-pagina ob-main" data-screen-label="onboarding">
        <Pasos
          etiqueta={t("onboarding.pasos.aria")}
          actual={0}
          pasos={[
            { id: "puerta", titulo: t("onboarding.pasos.1") },
            { id: "master", titulo: t("onboarding.pasos.2") },
            { id: "variantes", titulo: t("onboarding.pasos.3") },
          ]}
        />

        <PageHeader
          className="ob-cabeza"
          id="h1"
          tituloRef={h1Ref}
          rotulo={
            <span id="ov" ref={ovRef}>
              {t("onboarding.overline")}
            </span>
          }
          titulo={
            <>
              {t("onboarding.h1.pre")}
              <em>{t("onboarding.h1.em")}</em>
            </>
          }
          sub={
            <span data-reveal style={{ "--d": "480ms" } as React.CSSProperties}>
              {t("onboarding.sub")}
            </span>
          }
        />

        <div className="ob-doors">
          <button
            type="button"
            className="u-card u-card--grafito u-card--grande ob-door"
            id="doorA"
            data-reveal
            style={{ "--d": "600ms" } as React.CSSProperties}
            data-screen-label="onboarding-puerta-manual"
            aria-expanded={open}
            aria-controls="tpl"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="ob-door-cab">
              <span className="ob-ico" aria-hidden="true">
                <Icono nombre="master" />
              </span>
              <Chip>{t("onboarding.doorA.overline")}</Chip>
            </span>
            <span className="ob-door-t">{t("onboarding.doorA.title")}</span>
            <span className="ob-door-b">
              {t("onboarding.doorA.body.pre")}
              <b>{t("onboarding.doorA.body.bold")}</b>
              {t("onboarding.doorA.body.post")}
            </span>
            <span className="ob-door-fine">{t("onboarding.doorA.fine")}</span>
            <span className="u-btn u-btn--grafito ob-go" id="goA">
              {t("onboarding.doorA.cta")}
              {open ? " ▴" : " ▾"}
            </span>
          </button>

          <Link
            className="u-card u-card--grafito u-card--grande ob-door"
            href="/app/importar"
            data-reveal
            style={{ "--d": "680ms" } as React.CSSProperties}
            data-screen-label="onboarding-puerta-ia"
          >
            <span className="ob-door-cab">
              <span className="ob-ico" aria-hidden="true">
                <Icono nombre="fuentes" />
              </span>
              <Chip>{t("onboarding.doorB.overline")}</Chip>
            </span>
            <span className="ob-door-t">{t("onboarding.doorB.title")}</span>
            <span className="ob-door-b">
              {t("onboarding.doorB.body.pre")}
              <b>{t("onboarding.doorB.body.bold")}</b>
              {t("onboarding.doorB.body.post")}
            </span>
            <span className="ob-door-fine">{t("onboarding.doorB.fine")}</span>
            <span className="u-btn u-btn--brasa ob-go">
              {t("onboarding.doorB.cta")}
            </span>
          </Link>
        </div>

        <div
          className={`ob-tpl${open ? " open" : ""}`}
          id="tpl"
          ref={tplRef}
          data-screen-label="onboarding-plantillas"
        >
          <PanelHeader titulo={t("onboarding.tpl.overline")} />
          <div className="ob-tpl-rejilla">
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

        <p className="cu-aviso ob-note" data-reveal style={{ "--d": "760ms" } as React.CSSProperties}>
          {t("onboarding.note")}
        </p>
      </main>
    </div>
  );
}
