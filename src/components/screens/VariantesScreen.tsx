"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseEnabled } from "@/lib/supabase/config";
import "./variantes.css";

/* ============================================================================
   Variantes — porte de corpus-design/04-pantallas/variantes.html
   (ver docs/spec/pantallas/variantes.md). MURO: NO monta la aurora. Fondo
   var(--bg) sólido.

   ★ CABLEADO A DATOS REALES. En modo Supabase la lista sale de /api/variants
   (cv_variants del usuario, RLS por auth.uid()) y el «N variantes» se DERIVA del
   count real; el copy del estado vacío usa el nº real de items del master. La
   maqueta (persona Diego Gatica) SOLO se usa como fallback del modo local.

   Cada variante es una VISTA del master, no una copia. Las desactualizadas se
   marcan con c-pulse-dot (master_seen_at < master.updated_at) y dejan decidir:
   actualizar (adoptar el master) o mantener tu override.
   ============================================================================ */

type Variant = {
  nm: string;
  obj: string;
  pg: string;
  touch: string;
  old: boolean;
  kept?: boolean;
};

// Maqueta del MODO LOCAL (persona Diego Gatica). Nunca se usa con Supabase.
const DEMO_VARIANTS: Variant[] = [
  { nm: "Backend — Fintech", obj: "Backend Engineer", pg: "2 págs", touch: "tocada hace 2 días", old: true },
  { nm: "Backend — General", obj: "Backend Developer", pg: "2 págs", touch: "hace 5 días", old: true },
  { nm: "Data Engineering", obj: "Data Engineer", pg: "2 págs", touch: "hace 1 semana", old: false },
  { nm: "Plataforma / DevOps", obj: "Platform Engineer", pg: "2 págs", touch: "hace 2 semanas", old: false },
  { nm: "Full-stack — startup temprana", obj: "Software Engineer", pg: "1 pág", touch: "hace 3 semanas", old: false },
  { nm: "Backend — EN · remoto", obj: "Backend Engineer (EN)", pg: "2 págs", touch: "hace 1 mes", old: false },
  { nm: "Académica — ayudantías", obj: "Ingeniero de Software", pg: "1 pág", touch: "hace 2 meses", old: false },
];
const DEMO_MASTER_ITEMS = 52;

// Ruta de producto del editor de variante.
const EDITOR = "/app/variantes/editor";

function rel(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const d = Math.max(0, Date.now() - then);
  const day = 86_400_000;
  if (d < 3_600_000) return "recién";
  if (d < day) return `hace ${Math.round(d / 3_600_000)} h`;
  if (d < 7 * day) return `hace ${Math.round(d / day)} día${Math.round(d / day) === 1 ? "" : "s"}`;
  if (d < 30 * day) return `hace ${Math.round(d / (7 * day))} sem`;
  if (d < 365 * day) return `hace ${Math.round(d / (30 * day))} mes${Math.round(d / (30 * day)) === 1 ? "" : "es"}`;
  return `hace ${Math.round(d / (365 * day))} año${Math.round(d / (365 * day)) === 1 ? "" : "s"}`;
}

export function VariantesScreen() {
  const [variants, setVariants] = useState<Variant[]>(supabaseEnabled ? [] : DEMO_VARIANTS);
  const [masterItems, setMasterItems] = useState<number>(supabaseEnabled ? 0 : DEMO_MASTER_ITEMS);
  const [loading, setLoading] = useState(supabaseEnabled);
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());
  const [gen, setGen] = useState(0);
  const [announce, setAnnounce] = useState("");

  const mainRef = useRef<HTMLElement>(null);

  const empty = !loading && variants.length === 0;

  // Carga real (modo Supabase).
  useEffect(() => {
    if (!supabaseEnabled) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/variants");
        const data = await res.json();
        if (!active) return;
        const list = ((data.variants ?? []) as { name: string; targetTitle: string | null; updatedAt: string; outdated: boolean }[]).map((x) => ({
          nm: x.name,
          obj: x.targetTitle || "sin objetivo definido",
          pg: "",
          touch: `tocada ${rel(x.updatedAt)}`,
          old: x.outdated,
        }));
        setVariants(list);
        setMasterItems((data.masterItems as number) ?? 0);
      } catch {
        if (active) setVariants([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Movimiento del sistema: dibuja el c-divider y revela filas. Se re-ejecuta con
  // `gen` (re-stagger tras actualizar/mantener) y cuando llegan los datos.
  useEffect(() => {
    if (empty || loading) return;
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
  }, [gen, empty, loading, variants.length]);

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

  // «Actualizar» / «Mantener»: la fila deja de estar desactualizada. Optimista y
  // local (aún no hay endpoint de escritura de variantes en esta fase).
  function updateVariant(i: number) {
    setVariants((prev) => prev.map((v, k) => (k === i ? { ...v, old: false } : v)));
    setOpenRows(new Set());
    setGen((g) => g + 1);
    setAnnounce(`Variante «${variants[i].nm}» actualizada con el master. Ahora está al día.`);
  }
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
          <div
            aria-live="polite"
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}
          >
            {announce}
          </div>

          {loading ? (
            <p className="t-overline" style={{ color: "var(--text-muted)" }}>
              Leyendo tus variantes…
            </p>
          ) : null}

          {!empty && !loading && (
            <div className="vr-lead">
              <p>
                <b>
                  {variants.length} variante{variants.length === 1 ? "" : "s"}, un solo master.
                </b>{" "}
                Cada una referencia tus datos — no los copia. Cuando el master cambia, las variantes lo saben; los
                overrides tuyos siempre ganan.
              </p>
              <Link className="c-btn c-btn--patina" href={EDITOR}>
                Nueva variante
              </Link>
            </div>
          )}

          {!empty && !loading && <hr className="c-divider" />}

          {!empty && !loading && (
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
                              if ((e.target as HTMLElement).closest(".pdf, a")) return;
                              toggleRow(i);
                            },
                            onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
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
                        {v.old && <span className="c-pulse-dot" title="desactualizada" aria-hidden="true" />}
                        {v.nm}
                      </span>
                      <button type="button" className="pdf" title="El PDF sale del mismo estado que el preview" onClick={(e) => e.stopPropagation()}>
                        PDF ↓
                      </button>
                      <span className="meta">
                        {v.old ? <span className="old">desactualizada — el master cambió</span> : "al día"}
                        <br />
                        {v.touch}
                        {v.pg ? ` · ${v.pg}` : ""}
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
                          <span style={{ color: "var(--text-subtle)" }}>
                            El master cambió después de la última vez que abriste esta variante. Revisa qué adoptar y qué
                            mantener como override.
                          </span>
                        </div>
                        <div className="vr-dacts">
                          <button type="button" className="prim" onClick={() => updateVariant(i)}>
                            Actualizar esta variante
                          </button>
                          <button type="button" onClick={() => keepVariant(i)}>
                            Mantener como está (override)
                          </button>
                          <Link className="c-btn c-btn--quiet" style={{ height: "30px", fontSize: "10px" }} href={EDITOR}>
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
                {masterItems > 0 ? (
                  <>
                    Tu master tiene {masterItems} item{masterItems === 1 ? "" : "s"}.
                    <br />
                    Una variante es la vista de 2 páginas para un rol.
                  </>
                ) : (
                  <>
                    Aún no hay master del que salgan variantes.
                    <br />
                    Vuelca tu carrera primero; la variante es una vista de ella.
                  </>
                )}
              </h2>
              <p>
                {masterItems > 0
                  ? "Elige qué cuenta, ajusta el título al aviso, y el PDF sale igual al preview. Empieza por el rol al que más postulas."
                  : "Una variante referencia tu master — no lo copia. Sin master, no hay de dónde elegir."}
              </p>
              <div style={{ marginTop: "26px" }}>
                <span className="c-forge">
                  <Link className="c-btn c-btn--forge c-btn--lg" href={masterItems > 0 ? EDITOR : "/app/importar"}>
                    {masterItems > 0 ? "Crear la primera →" : "Volcar lo que tengo →"}
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
