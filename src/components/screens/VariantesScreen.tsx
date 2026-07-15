"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./variantes.css";

/* ============================================================================
   Variantes — porte de corpus-design/04-pantallas/variantes.html
   (ver docs/spec/pantallas/variantes.md). MURO: NO monta la aurora
   («donde hay trabajo que leer, hay muro»). Fondo var(--bg) sólido.

   Cada variante es una VISTA del master, no una copia. Las desactualizadas
   se marcan con c-pulse-dot y dejan decidir item por item: actualizar o
   mantener el override tuyo.

   Fidelidad al contrato diseño↔código:
   - El «N variantes» del lead se DERIVA de los datos (variants.length), no se
     hardcodea: un texto que dijera 7 con 3 variantes es justo el pecado que el
     producto persigue.
   - Orden DOM de .vr-top intacto (nm → pdf → meta → open → obj): la rejilla
     depende de él (spec §3).
   - Movimiento del sistema: los .vr-row entran escalonados (data-reveal="soft"
     + --d) y el c-divider se dibuja con CorpusMotion.boot(). El re-stagger tras
     «Actualizar»/«Mantener» se replica remontando las filas (key con `gen`),
     igual que el innerHTML de la referencia re-pintaba y volvía a escalonar.
   - El panel .demo NO se porta (convención de entrega). El eje con-variantes /
     vacío es DATO: el vacío se muestra cuando variants.length === 0.

   Cierres de a11y (spec §8), sin tocar clases del contrato:
   - La cabecera de fila desactualizada (.vr-top[data-toggle]) pasa a ser
     operable por teclado: role="button", tabIndex, aria-expanded, aria-controls
     y Enter/Espacio. En el HTML era un <div> con sólo onclick.
   - Live region que anuncia el cambio de estado al actualizar/mantener.
   ============================================================================ */

type Variant = {
  nm: string;
  obj: string;
  pg: string;
  touch: string;
  old: boolean;
  kept?: boolean;
};

// Datos del mock (persona Diego Gatica). Verbatim del array V del HTML.
const INITIAL: Variant[] = [
  { nm: "Backend — Fintech", obj: "Backend Engineer", pg: "2 págs", touch: "tocada hace 2 días", old: true },
  { nm: "Backend — General", obj: "Backend Developer", pg: "2 págs", touch: "hace 5 días", old: true },
  { nm: "Data Engineering", obj: "Data Engineer", pg: "2 págs", touch: "hace 1 semana", old: false },
  { nm: "Plataforma / DevOps", obj: "Platform Engineer", pg: "2 págs", touch: "hace 2 semanas", old: false },
  { nm: "Full-stack — startup temprana", obj: "Software Engineer", pg: "1 pág", touch: "hace 3 semanas", old: false },
  { nm: "Backend — EN · remoto", obj: "Backend Engineer (EN)", pg: "2 págs", touch: "hace 1 mes", old: false },
  { nm: "Académica — ayudantías", obj: "Ingeniero de Software", pg: "1 pág", touch: "hace 2 meses", old: false },
];

// Cuenta real de items del master (coherente con staging: «52 items entraron
// a tu master»). Alimenta el estado vacío. No es una métrica inventada.
const MASTER_ITEMS = 52;

// Ruta de producto del editor de variante (editor-variante.html en el diseño).
const EDITOR = "/app/variantes/editor";

export function VariantesScreen() {
  const [variants, setVariants] = useState<Variant[]>(INITIAL);
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());
  const [gen, setGen] = useState(0);
  const [announce, setAnnounce] = useState("");

  const mainRef = useRef<HTMLElement>(null);

  const empty = variants.length === 0;

  // Movimiento del sistema (CorpusMotion.boot): dibuja el c-divider y revela los
  // [data-reveal] pendientes del scope. Se re-ejecuta con `gen` para re-escalonar
  // las filas tras actualizar/mantener (que las remonta). Sondea hasta que el
  // runtime vanilla exista (mismo patrón que AuthScreen/OnboardingScreen).
  useEffect(() => {
    if (empty) return;
    let tries = 0;
    const id = window.setInterval(() => {
      const M = window.CorpusMotion;
      if (!M) {
        if (++tries > 100) window.clearInterval(id);
        return;
      }
      window.clearInterval(id);
      M.boot(mainRef.current ?? document);
    }, 30);
    return () => window.clearInterval(id);
  }, [gen, empty]);

  // Estado vacío: entrada C2 (c-enter) cuando aparece.
  useEffect(() => {
    if (!empty || !mainRef.current) return;
    const M = window.CorpusMotion;
    const el = mainRef.current.querySelector<HTMLElement>(".vr-empty");
    if (M && el) M.enter(el);
  }, [empty]);

  function toggleRow(i: number) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // «Actualizar esta variante» → la fila adopta el master: pierde el dot, el diff
  // y el toggle; pasa a «al día». Como en la referencia, se re-escalona la lista
  // y cualquier otra fila abierta se cierra.
  function updateVariant(i: number) {
    setVariants((prev) => prev.map((v, k) => (k === i ? { ...v, old: false } : v)));
    setOpenRows(new Set());
    setGen((g) => g + 1);
    setAnnounce(`Variante «${variants[i].nm}» actualizada con el master. Ahora está al día.`);
  }

  // «Mantener como está (override)» → el override tuyo gana; también deja de
  // estar desactualizada. Visualmente idéntico a actualizar (la referencia no
  // pinta marcador de override en esta pantalla); `kept` se guarda pero no se
  // lee al renderizar la fila.
  function keepVariant(i: number) {
    setVariants((prev) => prev.map((v, k) => (k === i ? { ...v, old: false, kept: true } : v)));
    setOpenRows(new Set());
    setGen((g) => g + 1);
    setAnnounce(`Variante «${variants[i].nm}»: override mantenido. Ahora está al día.`);
  }

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

      <main className="vr-main c-wall" data-screen-label="variantes" ref={mainRef}>
        <div className="c-container">
          {/* Live region: la referencia no anunciaba el cambio de estado (spec §8). */}
          <div
            aria-live="polite"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            {announce}
          </div>

          {!empty && (
            <div className="vr-lead">
              <p>
                <b>{variants.length} variantes, un solo master.</b> Cada una referencia tus datos — no
                los copia. Cuando el master cambia, las variantes lo saben; los overrides tuyos siempre
                ganan.
              </p>
              <Link className="c-btn c-btn--patina" href={EDITOR}>
                Nueva variante
              </Link>
            </div>
          )}

          <hr className="c-divider" />

          {!empty && (
            <div className="vr-list" id="list">
              {variants.map((v, i) => {
                const open = openRows.has(i);
                const diffId = `vr-diff-${i}`;
                return (
                  <div
                    className={`vr-row${open ? " open" : ""}`}
                    data-i={i}
                    key={`${gen}-${i}`}
                    data-reveal="soft"
                    style={{ "--d": `${Math.min(i, 24) * 40}ms` } as React.CSSProperties}
                  >
                    <div
                      className="vr-top"
                      {...(v.old
                        ? {
                            "data-toggle": true,
                            role: "button",
                            tabIndex: 0,
                            "aria-expanded": open,
                            "aria-controls": diffId,
                            onClick: (e: React.MouseEvent<HTMLDivElement>) => {
                              // El PDF no despliega; los enlaces navegan (spec §6).
                              if ((e.target as HTMLElement).closest(".pdf, a")) return;
                              toggleRow(i);
                            },
                            onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                              // Solo cuando el foco está en la cabecera, no en sus
                              // controles hijos (PDF / abrir →).
                              if (e.target !== e.currentTarget) return;
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleRow(i);
                              }
                            },
                          }
                        : {})}
                    >
                      <span className="nm">
                        {v.old && (
                          <span className="c-pulse-dot" title="desactualizada" aria-hidden="true" />
                        )}
                        {v.nm}
                      </span>
                      <button
                        type="button"
                        className="pdf"
                        title="El PDF sale del mismo estado que el preview"
                        onClick={(e) => e.stopPropagation()}
                      >
                        PDF ↓
                      </button>
                      <span className="meta">
                        {v.old ? (
                          <span className="old">desactualizada — cambió: cargo en Altiplano Pagos</span>
                        ) : (
                          "al día"
                        )}
                        <br />
                        {v.touch} · {v.pg}
                      </span>
                      <Link className="open" href={EDITOR}>
                        abrir →
                      </Link>
                      <span className="obj">objetivo: {v.obj}</span>
                    </div>

                    {v.old && (
                      <div className="vr-diff" id={diffId}>
                        <span className="t-overline">Qué cambió en el master</span>
                        <div className="vr-dline">
                          <span className="was">Backend Developer</span>
                          <span>→</span>
                          <span className="now">Senior Backend Developer</span>
                          <span style={{ color: "var(--text-subtle)" }}>
                            · cargo en Altiplano Pagos SpA · editado por ti, ayer
                          </span>
                        </div>
                        <div className="vr-dacts">
                          <button type="button" className="prim" onClick={() => updateVariant(i)}>
                            Actualizar esta variante
                          </button>
                          <button type="button" onClick={() => keepVariant(i)}>
                            Mantener como está (override)
                          </button>
                          <Link
                            className="c-btn c-btn--quiet"
                            style={{ height: "30px", fontSize: "10px" }}
                            href={EDITOR}
                          >
                            ver en el editor
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {empty && (
            <div className="vr-empty show" id="empty">
              <span className="t-overline">Sin variantes todavía</span>
              <h2 style={{ marginTop: "16px" }}>
                Tu master tiene {MASTER_ITEMS} items.
                <br />
                Una variante es la vista de 2 páginas para un rol.
              </h2>
              <p>
                Elige qué cuenta, ajusta el título al aviso, y el PDF sale igual al preview. Empieza por
                el rol al que más postulas.
              </p>
              <div style={{ marginTop: "26px" }}>
                <span className="c-forge">
                  <Link className="c-btn c-btn--forge c-btn--lg" href={EDITOR}>
                    Crear la primera →
                  </Link>
                </span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
