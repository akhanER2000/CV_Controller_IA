"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { bi, demoItems, demoPaste } from "./demo-data";
import { playShimmer } from "./motion";

/* ============================================================================
   EL MOMENTO MÁGICO · pegar un texto con enlaces dentro → el perfil se puebla.

   PREGRABADA, y dicho en la propia página. Una demo pública que invoca un LLM en
   cada visita es una factura abierta y un imán de bots; además, una extracción
   en vivo puede fallar justo cuando alguien mira. Aquí no hay red: hay una
   línea de tiempo con setTimeout sobre datos de ejemplo declarados como tales.

   El movimiento es del sistema: entrada escalonada con --d (80ms por paso, como
   .c-stagger-css) y EL shimmer del final de ingesta, que el runtime autolimita a
   uno por carga. Con prefers-reduced-motion no hay línea de tiempo: el resultado
   aparece entero de una vez. Se pierde el movimiento, nunca la información.
   ============================================================================ */

type Phase = "idle" | "run" | "done";

export function DemoIngesta() {
  const t = useT();
  const { lang } = useLang();
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const timers = useRef<number[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  const run = useCallback(() => {
    clear();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setStep(3);
      setPhase("done");
      return;
    }
    setPhase("run");
    setStep(0);
    timers.current.push(window.setTimeout(() => setStep(1), 560));
    timers.current.push(window.setTimeout(() => setStep(2), 1120));
    timers.current.push(
      window.setTimeout(() => {
        setStep(3);
        setPhase("done");
        playShimmer(resultRef.current);
      }, 1760),
    );
  }, []);

  // Arranca sola la primera vez que el bloque entra en pantalla: el momento
  // mágico tiene que ocurrir mientras miras, no después de buscar un botón.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !started.current) {
            started.current = true;
            run();
            ob.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [run]);

  useEffect(() => clear, []);

  const logs = [t("landing.demo.log1"), t("landing.demo.log2"), t("landing.demo.log3")];
  const done = phase === "done";

  return (
    <div className="ls-demo" ref={rootRef}>
      {/* ── Lo que pegas ─────────────────────────────────────────────────── */}
      <div className="ls-demo__in">
        <div className="ls-demo__cap">
          <span className="t-overline">{t("landing.demo.pasteLabel")}</span>
          <button
            type="button"
            className={`c-btn${done ? " c-btn--quiet" : ""}`}
            onClick={run}
            disabled={phase === "run"}
          >
            {done ? t("landing.demo.replay") : t("landing.demo.run")}
          </button>
        </div>
        {/* No es un <textarea>: nadie va a escribir aquí, y un campo real
            pausaría la aurora al recibir el foco (motion.js). Es la misma
            superficie del sistema, en modo lectura. */}
        <pre className="c-textarea ls-paste">{bi(demoPaste, lang)}</pre>
      </div>

      {/* ── Lo que sale ──────────────────────────────────────────────────── */}
      <div className="ls-demo__out" ref={resultRef}>
        <div className="ls-demo__cap">
          <span className="t-overline">{t("landing.demo.resultTitle")}</span>
          <span className="c-chip c-chip--ok">
            <span className="dot" />
            <b>{done ? demoItems.length : phase === "run" ? "…" : ""}</b>
          </span>
        </div>

        <ol className="ls-log" aria-live="polite">
          {logs.map((line, i) => (
            <li key={i} className="ls-log__li" hidden={phase === "idle" || step < i}>
              <span className="ls-log__mark">
                {step > i ? "✓" : <span className="c-spin">⟳</span>}
              </span>
              {line}
            </li>
          ))}
        </ol>

        <ul className="ls-items">
          {demoItems.map((it, i) => (
            <li
              key={i}
              className={`ls-item c-card${done ? " is-in" : ""}${it.ver === "partial" ? " is-partial" : ""}`}
              style={{ "--d": `${i * 80}ms` } as React.CSSProperties}
            >
              <div className="ls-item__head">
                <span className="t-overline">{t(`landing.demo.kind.${it.kind}`)}</span>
                <span className={`c-ver c-ver--${it.ver === "ok" ? "ok" : "partial"}`}>
                  {it.ver === "ok" ? t("landing.demo.verOk") : t("landing.demo.verPartial")}
                </span>
              </div>

              {it.chips ? (
                <div className="ls-item__chips">
                  {it.chips.map((c) => (
                    <span className="c-chip" key={c}>
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="ls-item__txt">{it.text ? bi(it.text, lang) : ""}</p>
              )}

              {it.note ? <p className="ls-item__note">{bi(it.note, lang)}</p> : null}

              <p className="ls-item__src">
                {t("landing.demo.origin").replace("{n}", String(it.line))}
              </p>
            </li>
          ))}
        </ul>

        <p className="ls-demo__pending">{t("landing.demo.pending")}</p>
      </div>
    </div>
  );
}
