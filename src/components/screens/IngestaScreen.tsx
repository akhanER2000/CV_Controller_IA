"use client";

import { useEffect, useRef, useState } from "react";
import { AuroraTune, AURORA_HOJEO } from "@/components/Aurora";
import { Button, Chip } from "@/components/ui";
import { CabezaPantalla } from "@/components/cuenta/CabezaPantalla";
import { Pasos } from "@/components/cuenta/Pasos";
import "./ingesta.css";

/* ============================================================================
   Ingesta — porte de corpus-design/04-pantallas/ingesta.html
   (ver docs/spec/pantallas/ingesta.md). Se espera, no se trabaja: el humo va
   entero (0.55) y además ACTIVO — es la única pantalla del producto donde la
   máquina "piensa" (setState('active') mientras corre, 'calm' al terminar) y la
   única que dispara EL shimmer (CorpusMotion.shimmer, uno por sesión).
   La aurora la monta el shell (app/app/layout); aquí solo se declara la
   intensidad y se conmuta el estado. Ver src/components/Aurora.tsx.

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

   ★ FORJA v2. Misma corrida, otra piel: .cu-pagina estrecha, pasos 1·2·3
   arriba (leer → revisar → confirmar), el contador y el log dentro de una
   tarjeta grafito y una barra de avance. La barra cuenta PASOS TERMINADOS de
   la lista de lectura (STEPS) — no es un porcentaje de tiempo estimado — y,
   como el contador, se escribe por ref desde la corrida imperativa. El
   <header class="c-header"> se quitó: su rótulo #hdStep y el enlace «seguir
   usando Corpus» viven ahora en la cabecera de la página. Todas las cifras son
   de la maqueta y la pantalla lo dice con el chip «ejemplo».
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

/* El recorrido que esta pantalla abre: 1 leer (aquí) → 2 revisar (staging) →
   3 confirmar (master). */
const PASOS = [
  { id: "leer", titulo: "Leer tus fuentes" },
  { id: "revisar", titulo: "Revisar en staging" },
  { id: "confirmar", titulo: "Confirmar en tu master" },
];

export function IngestaScreen() {
  const [phase, setPhase] = useState<Phase>("run");
  const [hdStep, setHdStep] = useState("INGESTA · LEYENDO FUENTES");

  const runRef = useRef<HTMLDivElement>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const finPanelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const genRef = useRef(0);
  const itemsRef = useRef(0);
  const doneRef = useRef(0);

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

    // Barra de avance: pasos de STEPS ya terminados / total. Por ref, como el
    // contador (la corrida es imperativa y no pasa por estado React).
    function paintBar() {
      const b = barRef.current;
      if (!b) return;
      b.setAttribute("aria-valuenow", String(doneRef.current));
      const fill = b.firstElementChild as HTMLElement | null;
      if (fill) fill.style.width = `${(doneRef.current / STEPS.length) * 100}%`;
    }

    function bump(n: number) {
      itemsRef.current += n;
      doneRef.current += 1; // cada paso de STEPS llama a bump exactamente una vez
      paintBar();
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
      doneRef.current = 0;
      paintBar();
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
      <AuroraTune strength={AURORA_HOJEO} />

      <main className="cu-pagina cu-pagina--estrecha in-main c-window" data-screen-label="ingesta">
        <CabezaPantalla
          rotulo={<span id="hdStep">{hdStep}</span>}
          titulo={phase === "fin" ? "Listo. Ahora, tu turno." : "Leyendo tus fuentes"}
          sub={
            <>
              <Chip tono="ejemplo">ejemplo</Chip>{" "}
              Maqueta de la espera: las fuentes y las cifras son de prueba.
            </>
          }
          acciones={
            <Button variante="fantasma" icono="flecha" href="/app">
              Seguir usando Corpus — esto avisa al terminar
            </Button>
          }
        />

        <Pasos pasos={PASOS} actual={phase === "fin" ? 1 : 0} etiqueta="Pasos de la ingesta" />

        <div
          className="in-col"
          id="run"
          ref={runRef}
          style={phase === "fin" ? { display: "none" } : undefined}
        >
          <section className="u-card u-card--grafito u-card--grande in-tarjeta" aria-labelledby="in-run-t">
            <div className="in-cab">
              <h2 className="in-t" id="in-run-t">
                Fuente por fuente
              </h2>
              <div className="in-cifra">
                <div className="in-count" id="count" ref={countRef}>
                  0
                </div>
                <div className="in-cap">items encontrados hasta ahora</div>
              </div>
            </div>
            <div
              className="cu-barra in-barra"
              ref={barRef}
              role="progressbar"
              aria-label="Fuentes leídas"
              aria-valuemin={0}
              aria-valuemax={STEPS.length}
              aria-valuenow={0}
            >
              <span style={{ width: "0%" }} />
            </div>
            <div
              className="in-log"
              id="log"
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-label="Progreso de la lectura de tus fuentes"
            ></div>
          </section>
          <p className="in-hint">
            Puede tardar de unos segundos a varios minutos, según cuántas fuentes haya. Sin porcentajes inventados: te decimos qué estamos haciendo.
          </p>
        </div>

        <div
          className={`in-fin${phase === "fin" ? " show" : ""}`}
          id="fin"
          ref={finRef}
          data-screen-label="ingesta-fin"
        >
          <div className="u-card u-card--grafito u-card--grande fin-panel" id="finPanel" ref={finPanelRef}>
            <span className="cu-rotulo">Extracción completa</span>
            <div className="fin-head">
              <span className="n">{TOTAL_ITEMS}</span>
              <span className="l">items esperan tu revisión</span>
            </div>
            <div className="fin-noev">
              <Chip tono="peligro">{`${SIN_EVIDENCIA} sin evidencia`}</Chip>
              <span>marcados — la revisión te los pondrá delante, no debajo.</span>
            </div>
            <div className="fin-acc">
              <Button variante="brasa" tamano="lg" icono="flecha" href="/app/staging">
                Revisar en staging
              </Button>
              <span className="fin-nota">Nada entra al master sin tu confirmación.</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
