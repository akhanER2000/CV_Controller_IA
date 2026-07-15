"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./salud.css";

/* ============================================================================
   Salud de la variante — porte de corpus-design/04-pantallas/salud.html
   (ver docs/spec/pantallas/salud.md). MURO: NO monta la aurora
   ("donde hay trabajo que leer, hay muro"). Sin score, sin barras, sin
   umbrales, sin porcentajes. Solo lo que PUEDE fallar; cada hallazgo con su
   fuente ([fuente] = evidencia citada · [criterio] = decisión de diseño).
   "Todo en orden" = silencio (se deriva de los datos, no es un toggle de UI).

   Fidelidad / decisiones:
   - Los nombres de clase (sl-*, c-*, hd-*, t-*) son el contrato; no cambian.
   - El conteo de #slN se DERIVA del mock (findings.length + los bloqueantes),
     no se hardcodea suelto. Con 4 hallazgos y 0 marcados como bloqueantes da
     exactamente el literal del HTML: "4 hallazgos · 0 bloqueantes".
   - Interacciones reales de producto con estado React: cada cita abre/cierra
     de forma independiente (no acordeón); el bloque "garantizado" se pliega.
   - El panel .demo del HTML NO se porta (convención de entrega, no producto):
     "con hallazgos" vs "todo en orden" es estado de DATOS, no un botón.
   - a11y: se cierran huecos documentados en la spec §8 SIN tocar clases —
     aria-expanded/aria-controls en los disclosure, aria-hidden en decorativos.
   ============================================================================ */

/* Ruta de producto de la variante abierta. En la maqueta el [id] del route se
   ignora (spec §12); editor-variante.html → /app/variantes/[id],
   tailor.html → /app/variantes/[id]/tailor. */
const VARIANT_ID = "backend-fintech";
const EDITOR_HREF = `/app/variantes/${VARIANT_ID}`;
const TAILOR_HREF = `/app/variantes/${VARIANT_ID}/tailor`;

interface Finding {
  id: string; // c1..c4 — cableado a la cita
  title: string; // .tt
  detail: string; // .sl-d
  fixLabel: string; // texto del enlace .fix (la → es parte del texto)
  fixHref: string;
  blocking: boolean; // deriva el conteo de "bloqueantes"; ninguno lo es hoy
  cite: React.ReactNode; // .sl-cite (con <b> en fuente/criterio)
}

const FINDINGS: Finding[] = [
  {
    id: "c1",
    title: "2 viñetas de la página 1 no llevan ninguna cifra",
    detail:
      "«Implementé el flujo de cupones…» y «Desarrollé y mantuve APIs…». ¿Cuánto movían? ¿Cuántos usuarios? ¿En cuánto tiempo? Una por una — tú decides cuáles lo ameritan.",
    fixLabel: "verlas en el editor →",
    fixHref: EDITOR_HREF,
    blocking: false,
    cite: (
      <>
        <b>[fuente — Jobscan 2025, n=384]</b> el 58,2% de reclutadores dice que lo que más destaca es
        un logro cuantificado. <b>No existe</b> un umbral de «% de viñetas con cifra» en ningún
        estudio — por eso te las señalamos una a una y no te damos un porcentaje.
      </>
    ),
  },
  {
    id: "c2",
    title: "Una viñeta ocupa 4 líneas",
    detail:
      "La del servicio de conciliación. En el escaneo de 7 segundos, las frases largas pierden: parte en dos o deja solo el resultado.",
    fixLabel: "recortarla →",
    fixHref: EDITOR_HREF,
    blocking: false,
    cite: (
      <>
        <b>[fuente — Ladders 2018, eye-tracking]</b> screening inicial promedio de 7,4 s; los CVs
        peor evaluados comparten «frases largas, clutter, poco espacio en blanco». n=30, estudio de
        vendor: dirección, no ley.
      </>
    ),
  },
  {
    id: "c3",
    title: "El título no coincide con el último aviso que adaptaste",
    detail:
      "El aviso pedía «Backend Engineer»; la variante dice «Backend Developer». Honesto y efectivo: «Backend Engineer (Ingeniero de Software III)».",
    fixLabel: "alinearlo →",
    fixHref: TAILOR_HREF,
    blocking: false,
    cite: (
      <>
        <b>[fuente — Jobscan, 2,5M postulaciones]</b> título del CV = título del aviso → 10,6× más
        entrevistas. Datos internos del vendor: úsalo para priorizar, no como promesa.
      </>
    ),
  },
  {
    id: "c4",
    title: "La sección «Proyectos» queda huérfana al final de la página 2",
    detail:
      "El encabezado entra pero solo cabe una línea de contenido. Sube un proyecto a la página 1 u oculta uno: un final limpio se lee mejor.",
    fixLabel: "reordenar →",
    fixHref: EDITOR_HREF,
    blocking: false,
    cite: (
      <>
        <b>[criterio]</b> decisión tipográfica nuestra, sin estudio detrás — y lo decimos. Disfrazar
        criterio de evidencia es exactamente lo que este producto no hace.
      </>
    ),
  },
];

/* Lo garantizado por construcción — educación plegada, no teatro. */
const GUARANTEED: React.ReactNode[] = [
  <>
    <b>Una sola columna</b> — el parser lee de izquierda a derecha atravesando columnas [Greenhouse]
  </>,
  <>
    <b>Cero tablas, headers o footers</b> — Workday los ignora: contacto siempre en el cuerpo
    [Greenhouse · Workday]
  </>,
  <>
    <b>Cero iconos ni fotos</b> — «Email:» con letras; glifos no textuales se parsean como basura
    [Greenhouse · Robert Walters Chile]
  </>,
  <>
    <b>Texto seleccionable</b> — «si no puedes seleccionar el texto, el documento no es parseable»
    [Lever, literal]
  </>,
  <>
    <b>&lt; 2,5 MB</b> — sobre eso Greenhouse no parsea el archivo [Greenhouse]
  </>,
];

const BUILT_LABEL =
  "Lo que no revisamos porque el motor lo garantiza por construcción — listarlo como logro sería teatro de tranquilidad";

export function SaludScreen() {
  const findings = FINDINGS;
  const hasFindings = findings.length > 0;
  const blockingCount = findings.filter((f) => f.blocking).length;
  // #slN: conteo derivado de los datos. "Todo en orden" pierde "· bloqueantes".
  const findingsLabel = hasFindings
    ? `${findings.length} hallazgos · ${blockingCount} bloqueantes`
    : "0 hallazgos";

  const [openCites, setOpenCites] = useState<Set<string>>(() => new Set());
  const [builtOpen, setBuiltOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Movimiento del sistema: escalonar los .sl-item (step:60, cap:24 — literal del
  // HTML) y dibujar el hairline (c-divider) vía boot(), una sola vez cuando el
  // runtime vanilla exista. Con prefers-reduced-motion ambos degradan al estado
  // final visible (motion.js lo maneja internamente).
  useEffect(() => {
    let tries = 0;
    const id = window.setInterval(() => {
      const M = window.CorpusMotion;
      if (!M) {
        if (++tries > 100) window.clearInterval(id);
        return;
      }
      window.clearInterval(id);
      if (!started.current) {
        started.current = true;
        if (listRef.current) M.stagger(listRef.current, { step: 60, cap: 24 });
      }
      M.boot();
    }, 30);
    return () => window.clearInterval(id);
  }, []);

  const toggleCite = (cid: string) =>
    setOpenCites((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });

  return (
    <div className="c-page">
      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/app">
            Corpus
          </Link>
          <nav className="hd-nav">
            <Link href="/app">Panel</Link>
            <Link href="/app/master">Master</Link>
            <Link href="/app/variantes" aria-current="page">
              Variantes
            </Link>
            <Link href="/app/fuentes">Fuentes</Link>
          </nav>
          <div className="hd-right">
            <nav className="hd-nav" style={{ display: "flex" }}>
              <Link href="/app/ajustes">Ajustes</Link>
            </nav>
            <div className="hd-lang">
              <span data-on>ES</span>
              <span>EN</span>
            </div>
            <div className="hd-av">DG</div>
          </div>
        </div>
      </header>

      <div className="sl-bar" data-screen-label="salud-toolbar">
        <div className="c-container">
          <Link
            style={{ font: "500 var(--fs-ui)/1 var(--font-sans)", color: "var(--text-muted)" }}
            href={EDITOR_HREF}
          >
            ← Backend — Fintech
          </Link>
          <span
            style={{ width: "1px", height: "16px", background: "var(--border-strong)" }}
            aria-hidden="true"
          />
          <span
            style={{
              font: "500 var(--fs-micro)/1 var(--font-mono)",
              letterSpacing: ".14em",
              color: "var(--text-muted)",
            }}
          >
            SALUD DE LA VARIANTE
          </span>
          <span
            id="slN"
            style={{
              marginLeft: "auto",
              font: "400 var(--fs-micro)/1 var(--font-mono)",
              color: "var(--text-subtle)",
            }}
          >
            {findingsLabel}
          </span>
        </div>
      </div>

      <main className="sl-main c-wall" data-screen-label="salud">
        <div className="c-container sl-col">
          <span className="t-overline">Sin score, sin umbrales</span>
          <h2 style={{ marginTop: "12px" }}>Solo lo que puede fallar.</h2>
          <p className="sl-lead">
            Cada hallazgo trae su fuente — <b>[fuente]</b> es evidencia citada, <b>[criterio]</b> es
            una decisión de diseño nuestra, dicha como tal. Lo que está bien no aparece: el silencio
            es la señal.
          </p>
          <hr className="c-divider" style={{ marginTop: "18px" }} />

          {hasFindings ? (
            <div className="sl-list" id="list" ref={listRef}>
              {findings.map((f) => {
                const open = openCites.has(f.id);
                return (
                  <article className="c-card sl-item" key={f.id}>
                    <div className="sl-h">
                      <span className="mark">⚠</span>
                      <span className="tt">{f.title}</span>
                      <button
                        type="button"
                        className="src"
                        aria-expanded={open}
                        aria-controls={f.id}
                        onClick={() => toggleCite(f.id)}
                      >
                        {open ? "fuente ▴" : "fuente ▾"}
                      </button>
                      <Link className="fix c-btn c-btn--quiet" href={f.fixHref}>
                        {f.fixLabel}
                      </Link>
                    </div>
                    <div className="sl-d">{f.detail}</div>
                    <div className={`sl-cite${open ? " open" : ""}`} id={f.id}>
                      {f.cite}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="sl-ok show" id="ok">
              <div className="mark" aria-hidden="true">
                —
              </div>
              <p>
                Nada que señalar en esta variante.
                <br />
                No hay medalla: el silencio es la señal.
              </p>
            </div>
          )}

          <div
            className={`sl-built${builtOpen ? " open" : ""}`}
            id="built"
            data-screen-label="salud-garantizado"
          >
            <button
              type="button"
              id="builtBtn"
              aria-expanded={builtOpen}
              aria-controls="builtRows"
              onClick={() => setBuiltOpen((v) => !v)}
            >
              {`${builtOpen ? "▾" : "▸"}  ${BUILT_LABEL}`}
            </button>
            <div className="rows" id="builtRows">
              {GUARANTEED.map((row, i) => (
                <div className="sl-brow" key={i}>
                  {row}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
