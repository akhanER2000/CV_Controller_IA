"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Aurora } from "@/components/Aurora";
import "./ingesta.css";

/* ============================================================================
   Ingesta — porte de corpus-design/04-pantallas/ingesta.html
   (ver docs/spec/pantallas/ingesta.md). VENTANA con aurora ACTIVA: la única
   pantalla del producto donde la máquina "piensa" y la única que dispara EL
   shimmer (CorpusMotion.shimmer, autolimitado a uno por sesión).

   La espera es una ruta propia: se leen las fuentes línea a línea, con la
   fuente concreta y lo hallado en ella, sin porcentaje inventado, y se entrega
   al staging con un recuento REAL de items.

   Fidelidad al literal:
   - La secuencia (row/set/bump/run/finish) es un porte imperativo del <script>
     de pantalla: reveal/counter/shimmer/enter son APIs imperativas del runtime
     (escriben textContent / data-attrs directamente), así que las filas del log
     se inyectan sobre un ref, no como estado React que las pelearía.
   - `phase` ("run" | "fin") y `hdStep` SÍ son estado React: son el cambio de
     modo de la pantalla (equivalente a #run/#fin y al span #hdStep del HTML).
   - Token de generación (genRef) = el `tok` del HTML: cancela la corrida en
     vuelo (StrictMode / desmontaje) para que dos corridas no escriban el mismo
     log. El contador y el shimmer se piden hacia números REALES.
   - El panel .demo NO se porta (convención de entrega, no producto). La corrida
     de producto es la ruta feliz `run(false)` al montar; la rama de error
     (fail) queda implementada con sus <button> reales y su bloqueo en Promise,
     pero sin backend que señale una fuente fallida no se dispara en la maqueta.
   ============================================================================ */

type Phase = "run" | "fin";
type St = "run" | "ok" | "err";

/* [fuente, texto-mientras-corre, ms de espera, detalle-al-terminar, items que suma].
   Copia verbatim de las 5 líneas del <script> de pantalla. */
const STEPS: ReadonlyArray<readonly [string, string, number, string, number]> = [
  ["Texto pegado", "leyendo…", 1300, "2.147 palabras · 3 experiencias, 12 skills", 19],
  ["github.com/dgatica", "consultando la API…", 1700, "12 repos públicos · 3 con actividad sostenida", 9],
  ["dgatica.cl", "leyendo el portfolio…", 1500, "6 proyectos, 2 con métricas", 12],
  ["CV_2023.pdf", "extrayendo texto…", 1400, "2 páginas de texto · 15 items", 15],
  ["Comparando versiones", "buscando duplicados…", 1200, "3 posibles duplicados — los resolverás tú", 6],
];

/* Conteos derivados de los datos del mock (persona canónica Diego Gatica).
   El total es la SUMA de lo extraído, no una constante suelta (spec §10). */
const TOTAL_ITEMS = STEPS.reduce((a, s) => a + s[4], 0); // 61
const SIN_EVIDENCIA = 9; // canónico del paquete (staging: ⚠ sin evidencia 9)

export function IngestaScreen() {
  const [phase, setPhase] = useState<Phase>("run");
  const [hdStep, setHdStep] = useState("INGESTA · LEYENDO FUENTES");

  const runRef = useRef<HTMLDivElement>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const finPanelRef = useRef<HTMLDivElement>(null);
  const genRef = useRef(0);
  const itemsRef = useRef(0);

  // La corrida de la ingesta (ruta feliz). Imperativa a propósito: reveal /
  // counter escriben DOM directamente. Espera a que exista el runtime vanilla.
  useEffect(() => {
    let cancelled = false;

    const wait = (ms: number) =>
      new Promise<void>((r) =>
        window.setTimeout(r, window.CorpusMotion?.rm() ? Math.min(ms, 120) : ms),
      );

    function set(r: HTMLDivElement, st: St, det: string | null) {
      r.className = "in-row is-" + st;
      const stEl = r.querySelector<HTMLElement>(".st")!;
      stEl.innerHTML = st === "run" ? '<span class="c-spin">⟳</span>' : st === "ok" ? "✓" : "✕";
      stEl.setAttribute("aria-hidden", "true"); // a11y §8.3: el glifo no se lee literal
      if (det != null) r.querySelector<HTMLElement>(".det")!.textContent = det;
    }

    function row(src: string, det: string, st: St) {
      const M = window.CorpusMotion!;
      const r = document.createElement("div");
      r.className = "in-row is-" + st;
      r.innerHTML = '<span class="st"></span><span class="src"></span><span class="det"></span>';
      set(r, st, det);
      r.querySelector<HTMLElement>(".src")!.textContent = src;
      logRef.current!.appendChild(r);
      M.reveal(r);
      return r;
    }

    function bump(n: number) {
      itemsRef.current += n;
      if (countRef.current) window.CorpusMotion!.counter(countRef.current, itemsRef.current, { dur: 700 });
    }

    function finish() {
      // El cambio de modo es estado React; aurora/enter/shimmer los aplica el
      // efecto de fase (necesitan el DOM de #fin ya committeado).
      setPhase("fin");
      setHdStep("INGESTA · COMPLETA");
    }

    async function run(fail: boolean) {
      const my = ++genRef.current;
      itemsRef.current = 0;
      if (countRef.current) countRef.current.textContent = "0";
      if (logRef.current) logRef.current.innerHTML = "";
      setPhase("run");
      setHdStep("INGESTA · LEYENDO FUENTES");
      window.CorpusAurora?.setState("active");

      for (const [src, doing, ms, done, n] of STEPS) {
        if (my !== genRef.current || cancelled) return;
        const r = row(src, doing, "run");
        await wait(ms);
        if (my !== genRef.current || cancelled) return;

        if (fail && src === "CV_2023.pdf") {
          // Rama de error: el fallo NO se auto-resuelve — bloquea hasta que el
          // usuario elija. Botones reales (foco + Enter/Espacio gratis).
          set(r, "err", "la página 2 es una imagen escaneada: no hay texto que leer");
          const acts = document.createElement("div");
          acts.className = "in-acts";
          const b1 = document.createElement("button");
          b1.type = "button";
          b1.textContent = "Continuar sin la página 2";
          const b2 = document.createElement("button");
          b2.type = "button";
          b2.textContent = "Reintentar";
          acts.append(b1, b2);
          r.appendChild(acts);
          await new Promise<void>((res) => {
            b1.onclick = () => {
              acts.remove();
              set(r, "ok", "solo página 1 · 6 items");
              res();
            };
            b2.onclick = async () => {
              b2.innerHTML = '<span class="c-spin">⟳</span> reintentando…';
              await wait(1300);
              acts.remove();
              set(r, "err", "sigue sin texto — continuando con la página 1");
              res();
            };
          });
          if (my !== genRef.current || cancelled) return;
          bump(6);
        } else {
          set(r, "ok", done);
          bump(n);
        }
      }

      if (my !== genRef.current || cancelled) return;
      // Cierre del contador hacia el total REAL (= suma de lo extraído).
      if (countRef.current) window.CorpusMotion!.counter(countRef.current, TOTAL_ITEMS, { dur: 500 });
      await wait(900);
      if (my !== genRef.current || cancelled) return;
      finish();
    }

    // Arranca cuando el runtime vanilla (public/corpus/*.js) esté cargado.
    let tries = 0;
    const start = () => {
      window.CorpusMotion!.boot();
      void run(false);
    };
    if (window.CorpusMotion && window.CorpusAurora) {
      start();
    } else {
      const id = window.setInterval(() => {
        if (window.CorpusMotion && window.CorpusAurora) {
          window.clearInterval(id);
          if (!cancelled) start();
        } else if (++tries > 100) {
          window.clearInterval(id);
        }
      }, 30);
      return () => {
        cancelled = true;
        genRef.current++;
        window.clearInterval(id);
      };
    }
    return () => {
      cancelled = true;
      genRef.current++;
    };
  }, []);

  // Fin de la ingesta: aurora a calma, entrada C2 del panel final y EL shimmer.
  useEffect(() => {
    if (phase !== "fin") return;
    const A = window.CorpusAurora;
    const M = window.CorpusMotion;
    A?.setState("calm");
    if (M && finRef.current) M.enter(finRef.current);
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (M && finPanelRef.current) M.shimmer(finPanelRef.current);
      }),
    );
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  return (
    <div className="c-page">
      <Aurora state="active" />

      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/app">
            Corpus
          </Link>
          <span
            id="hdStep"
            style={{
              marginLeft: "14px",
              font: "500 var(--fs-micro)/1 var(--font-mono)",
              letterSpacing: ".14em",
              color: "var(--text-muted)",
            }}
          >
            {hdStep}
          </span>
          <div className="hd-right">
            <Link className="c-btn c-btn--quiet" href="/app">
              Seguir usando Corpus — esto avisa al terminar
            </Link>
          </div>
        </div>
      </header>

      <main className="in-main c-window" data-screen-label="ingesta">
        <div
          className="in-col"
          id="run"
          ref={runRef}
          style={phase === "fin" ? { display: "none" } : undefined}
        >
          <span className="t-overline">Leyendo tus fuentes</span>
          <div className="in-count" id="count" ref={countRef}>
            0
          </div>
          <div className="in-cap">items encontrados hasta ahora</div>
          <div
            className="c-panel in-log"
            id="log"
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Progreso de la lectura de tus fuentes"
          ></div>
          <p className="in-hint">
            Entre 5 y 40 segundos según las fuentes.
            <br />
            Sin porcentajes inventados: te decimos qué estamos haciendo.
          </p>
        </div>

        <div
          className={`in-fin${phase === "fin" ? " show" : ""}`}
          id="fin"
          ref={finRef}
          data-screen-label="ingesta-fin"
        >
          <span className="t-overline">Extracción completa</span>
          <h2 style={{ marginTop: "18px" }}>Listo. Ahora, tu turno.</h2>
          <div className="c-panel fin-panel" id="finPanel" ref={finPanelRef}>
            <div className="fin-head">
              <span className="n">{TOTAL_ITEMS}</span>
              <span className="l">items esperan tu revisión</span>
            </div>
            <div className="fin-noev">
              <span className="c-ver c-ver--none">{SIN_EVIDENCIA} sin evidencia</span>
              <span>marcados — la revisión te los pondrá delante, no debajo.</span>
            </div>
          </div>
          <div
            style={{
              marginTop: "34px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <span className="c-forge">
              <Link className="c-btn c-btn--forge c-btn--hero" href="/app/staging">
                Revisar en staging →
              </Link>
            </span>
            <span
              style={{
                font: "400 var(--fs-data)/1.6 var(--font-mono)",
                color: "var(--text-subtle)",
              }}
            >
              Nada entra al master sin tu confirmación.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
