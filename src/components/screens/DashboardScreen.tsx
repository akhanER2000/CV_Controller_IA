"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Aurora } from "@/components/Aurora";
import { useBoot } from "@/lib/corpus/runtime";
import "./dashboard.css";

/* ============================================================================
   Dashboard — porte de corpus-design/04-pantallas/dashboard.html
   (ver docs/spec/pantallas/dashboard.md). "El estado de tu carrera, no un
   saludo": parrilla de variantes + salud del master + staging + fuentes.

   Gramática ventana/muro (spec §2):
   - Registro CON items → estado DENSO = MURO. NO monta Aurora ("donde hay
     trabajo, el trabajo gana": el bento tapa la aurora, sería gastar GPU).
   - Registro VACÍO (día 1, 0 items) → VENTANA: monta <Aurora state="calm"/>
     y las dos puertas respiran sobre el fondo. Es la ÚNICA excepción del
     dashboard a la regla "los muros no montan aurora".
   El estado se DERIVA de los datos (masterItems === 0), no de un toggle: el
   panel .demo del HTML es convención de entrega, no producto — no se porta.

   Fidelidad de movimiento (spec §6): esta pantalla solo usa boot() (dibuja el
   hairline bajo la tira) y enter() (entrada del estado vacío). NO usa
   stagger/reveal/io/counter/shimmer/words/chars/xray: el shimmer del producto
   vive en la ingesta, no aquí.

   A11y (spec §8): la fila de variante desanida el <button class="pdf"> del
   enlace (en el HTML es un botón DENTRO de un <a> — interactivo dentro de
   interactivo). Aquí la fila es un <div> con un enlace estirado (hit-area) y
   el botón como hermano por encima. Clases db-vrow/nm/obj/st/pdf intactas.
   ============================================================================ */

type Variant = {
  nm: string;
  obj: string;
  touch: string;
  old?: string;
};

type Source = {
  nm: string;
  factsLines: string[];
  newText?: string;
  quietText?: string;
};

type Finding = { k: string; text: string; anchor: string };

/* Maqueta estática coherente con las cifras canónicas (persona Diego Gatica).
   Los conteos de la UI se DERIVAN de estas estructuras, no se hardcodean sueltos. */
const VARIANTS: Variant[] = [
  { nm: "Backend — Fintech", obj: "Backend Engineer", touch: "tocada hace 2 días · 2 págs", old: "cambió: cargo en Altiplano Pagos" },
  { nm: "Backend — General", obj: "Backend Developer", touch: "hace 5 días · 2 págs", old: "cambió: cargo en Altiplano Pagos" },
  { nm: "Data Engineering", obj: "Data Engineer", touch: "hace 1 semana · 2 págs" },
  { nm: "Plataforma / DevOps", obj: "Platform Engineer", touch: "hace 2 semanas · 2 págs" },
  { nm: "Full-stack — startup temprana", obj: "Software Engineer", touch: "hace 3 semanas · 1 pág" },
  { nm: "Backend — EN · remoto", obj: "Backend Engineer (EN)", touch: "hace 1 mes · 2 págs" },
  { nm: "Académica — ayudantías", obj: "Ingeniero de Software", touch: "hace 2 meses · 1 pág" },
];

const HEALTH: Finding[] = [
  { k: "3", text: "viñetas sin ninguna cifra — ¿cuánto? ¿cuántos? ¿en cuánto tiempo?", anchor: "sin-cifra" },
  { k: "1", text: "rol sin fechas: Freelance (2019 – …)", anchor: "sin-fechas" },
  { k: "2", text: "skills siguen sin evidencia: Kafka, AWS", anchor: "sin-evidencia" },
];

const SOURCES: Source[] = [
  {
    nm: "github.com/dgatica",
    factsLines: ["12 repos · 5 seleccionados · aportó 14 items", "último push: hace 3 días"],
    newText: "2 repos con actividad nueva — leer",
  },
  {
    nm: "dgatica.cl",
    factsLines: ["6 proyectos · aportó 12 items", "leída: hace 12 días"],
    quietText: "sin cambios detectados",
  },
  {
    nm: "CV_2023.pdf",
    factsLines: ["2 páginas · aportó 15 items"],
    quietText: "archivo estático — no cambia solo",
  },
  {
    nm: "cuestionario-identidad.md",
    factsLines: ["16 bloques · aportó 6 items"],
    quietText: "fuente de primera — escrita por ti",
  },
];

const STAGING_COUNT = 2;
/* Conteo de items del master (en producción: count(master.items)). Se mantiene
   en 52 — la cifra canónica del paquete — pese a que las fuentes suman 47:
   los 5 restantes son de origen manual / ya promovidos desde staging. */
const MASTER_ITEMS: number = 52;

/* Fila de una variante. Enlace estirado (navega al editor) + botón PDF hermano
   por encima (descarga sin entrar). Auto-placement del grid: nm→pdf→st→obj. */
function VariantRow({ v }: { v: Variant }) {
  return (
    <div className="db-vrow" style={{ position: "relative" }}>
      <Link
        href="/app/cv"
        aria-label={`${v.nm} — objetivo: ${v.obj}`}
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      />
      <span className="nm">
        {v.old ? <span className="c-pulse-dot" title="desactualizada" /> : null}
        {v.nm}
      </span>
      <button
        type="button"
        className="pdf"
        title="Descargar el PDF sin entrar"
        style={{ position: "relative", zIndex: 1 }}
        onClick={() => {
          /* Maqueta: descarga directa del PDF de la variante. Pendiente de
             backend (renderer + blob). No navega al editor. */
        }}
      >
        PDF ↓
      </button>
      <span className="st">
        {v.old ? <span className="old">desactualizada · {v.old}</span> : "al día"}
        <br />
        {v.touch}
      </span>
      <span className="obj">objetivo: {v.obj}</span>
    </div>
  );
}

export function DashboardScreen() {
  const outdated = VARIANTS.filter((v) => v.old).length;
  const isEmpty = MASTER_ITEMS === 0 && VARIANTS.length === 0;

  const dateSuffix = ` · master: ${MASTER_ITEMS} items · ${SOURCES.length} fuentes`;
  // SSR y primer render: fallback fijo (= HTML). En cliente lo reescribe con la
  // fecha real del sistema — un dato con fuente. Sin desajuste de hidratación.
  const [dateStr, setDateStr] = useState(`Martes 14 de julio${dateSuffix}`);

  // boot(): revela el hairline (.c-divider) de la tira. Ref al <main> denso.
  const bootRef = useBoot<HTMLElement>();
  const emptyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const d = new Date();
      const f = d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
      setDateStr(f.charAt(0).toUpperCase() + f.slice(1) + dateSuffix);
    } catch {
      /* si Intl falla, se queda el fallback */
    }
  }, [dateSuffix]);

  // Estado vacío: entrada C2 (enter) + boot del scope, cuando exista el runtime.
  useEffect(() => {
    if (!isEmpty) return;
    let tries = 0;
    const id = window.setInterval(() => {
      const M = window.CorpusMotion;
      if (!M) {
        if (++tries > 100) window.clearInterval(id);
        return;
      }
      window.clearInterval(id);
      if (emptyRef.current) {
        M.enter(emptyRef.current);
        M.boot(emptyRef.current);
      }
    }, 30);
    return () => window.clearInterval(id);
  }, [isEmpty]);

  return (
    <div className="c-page">
      {isEmpty ? <Aurora state="calm" /> : null}

      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/app">
            Corpus
          </Link>
          <nav className="hd-nav">
            <Link href="/app" aria-current="page">
              Panel
            </Link>
            <Link href="/app/master">Master</Link>
            <Link href="/app/variantes">Variantes</Link>
            <Link href="/app/fuentes">Fuentes</Link>
          </nav>
          <div className="hd-right">
            <Link href="/app/cuenta" className="hd-nav" style={{ display: "inline-flex" }}>
              <span
                style={{
                  font: "500 var(--fs-ui)/1 var(--font-sans)",
                  color: "var(--text-muted)",
                  padding: "9px 12px",
                }}
              >
                Ajustes
              </span>
            </Link>
            <div className="hd-lang">
              <span data-on>ES</span>
              <span>EN</span>
            </div>
            <div className="hd-av">DG</div>
          </div>
        </div>
      </header>

      {isEmpty ? (
        /* ═══ VACÍO: día 1. Ventana: la aurora respira en calma. ═══ */
        <main className="db-empty c-window show" data-screen-label="dashboard-vacio" ref={emptyRef}>
          <span className="t-overline">Día 1 · master: 0 items</span>
          <h1 style={{ marginTop: "20px" }}>
            Tu registro está vacío. Bien: <em>partamos de verdad.</em>
          </h1>
          <p className="sub">
            Corpus guarda tu carrera una sola vez, con la evidencia de cada dato. Las variantes de tu
            CV salen de ahí — no al revés.
          </p>
          <div className="db-doors">
            <Link className="c-card c-lift db-door" href="/app/importar">
              <span className="t-overline">Con IA · 5 minutos</span>
              <h3>Vuelca lo que tengas</h3>
              <p>
                Texto suelto, tu CV viejo, tu GitHub, tu portfolio. La IA extrae; tú confirmas item
                por item. Nada entra sin tu ojo.
              </p>
              <span className="go">Pegar y extraer →</span>
            </Link>
            <Link className="c-card c-lift db-door" href="/app/onboarding">
              <span className="t-overline">Sin IA · a tu ritmo</span>
              <h3>Escríbelo de cero</h3>
              <p>
                Desde una plantilla de rol o en blanco, con la IA apagada. El origen manual es el más
                verificable de todos: lo escribiste tú.
              </p>
              <span className="go">Empezar a escribir →</span>
            </Link>
          </div>
          <p className="fine">Ninguna puerta es de segunda. Puedes cambiar de vía cuando quieras.</p>
        </main>
      ) : (
        /* ═══ DENSO: muro. El estado, no un saludo. ═══ */
        <main className="db-main c-wall" data-screen-label="dashboard-denso" ref={bootRef}>
          <div className="c-container">
            <div className="db-strip">
              <span className="t-overline">{dateStr}</span>
              <span className="acts">
                <Link className="c-btn c-btn--quiet" href="/app/tailor">
                  Adaptar a un aviso
                </Link>
                <Link className="c-btn c-btn--patina" href="/app/cv">
                  Nueva variante
                </Link>
              </span>
            </div>
            <hr className="c-divider" style={{ marginBottom: "2px" }} />
            <div className="db-bento">
              <section className="db-cell db-v" data-screen-label="dashboard-variantes">
                <div className="db-ch">
                  <span className="t-overline">Variantes</span>
                  <span className="n">
                    {VARIANTS.length} · {outdated} desactualizadas
                  </span>
                  <Link href="/app/variantes">ver todas →</Link>
                </div>
                <div>
                  {VARIANTS.map((v) => (
                    <VariantRow key={v.nm} v={v} />
                  ))}
                </div>
              </section>

              <div className="db-side">
                <section className="db-cell db-s" data-screen-label="dashboard-salud">
                  <div className="db-ch">
                    <span className="t-overline">Salud del master</span>
                    <span className="n">sin score — cosas concretas</span>
                  </div>
                  {HEALTH.map((h) => (
                    <Link key={h.anchor} className="db-srow" href={`/app/master#${h.anchor}`}>
                      <span className="k">{h.k}</span>
                      {h.text}
                      <span className="go">→</span>
                    </Link>
                  ))}
                  <div className="db-fine">
                    Lo que está bien no aparece aquí. Silencio = en orden.
                  </div>
                </section>

                <section className="db-cell db-s" data-screen-label="dashboard-staging">
                  <Link className="db-stg" href="/app/staging">
                    <span className="k t-accent">{STAGING_COUNT}</span>
                    <span className="tx">
                      items de la última lectura de GitHub esperan tu decisión
                    </span>
                    <span className="go">revisar →</span>
                  </Link>
                </section>
              </div>

              <section className="db-cell db-f" data-screen-label="dashboard-fuentes">
                {SOURCES.map((s) => (
                  <div className="db-fcell" key={s.nm}>
                    <span className="nm">{s.nm}</span>
                    <div className="facts">
                      {s.factsLines.map((line, j) => (
                        <Fragment key={line}>
                          {j > 0 ? <br /> : null}
                          {line}
                        </Fragment>
                      ))}
                    </div>
                    {s.newText ? (
                      <Link className="new" href="/app/fuentes">
                        <span className="c-pulse-dot" />
                        {s.newText}
                      </Link>
                    ) : null}
                    {s.quietText ? <div className="quiet">{s.quietText}</div> : null}
                  </div>
                ))}
              </section>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
