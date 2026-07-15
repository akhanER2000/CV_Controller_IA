"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./staging.css";

/* ============================================================================
   Staging — porte de corpus-design/04-pantallas/staging.html, ahora CABLEADO a
   los staged_items reales (GET /api/staging · POST /api/staging/accept). MURO:
   aquí se trabaja, no monta aurora. Nada entra al master sin confirmación; los
   lotes SOLO tocan lo verificado (§4.1).

   Se conservan las clases del sistema (contrato diseño↔código) y el CSS de
   pantalla. Las piezas de maqueta que aún no mapean a datos reales (la fusión de
   duplicados campo por campo, el teclado j/k/a/d/o) se reintroducirán cuando el
   backend las alimente; el flujo prioritario —revisar y aceptar con procedencia—
   es real.
   ============================================================================ */

type Level = "verified" | "partial" | "none" | "api";
type Ver = "ok" | "partial" | "none";

interface Item {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  evidence_snippet: string | null;
  evidence_verified: boolean;
  parent_staged_id: string | null;
}

const VER: Record<Ver, [string, string]> = {
  ok: ["c-ver--ok", "verificado"],
  partial: ["c-ver--partial", "parcial"],
  none: ["c-ver--none", "sin evidencia"],
};

const s = (o: Record<string, unknown>, k: string) => String(o[k] ?? "");

function levelOf(it: Item): Level {
  const l = it.data._level as Level | undefined;
  if (l) return l;
  return it.evidence_verified ? "verified" : "none";
}
const verOf = (it: Item): Ver => {
  const l = levelOf(it);
  return l === "verified" || l === "api" ? "ok" : l === "partial" ? "partial" : "none";
};

function textOf(it: Item): string {
  const d = it.data;
  switch (it.kind) {
    case "basics": return [s(d, "name"), s(d, "email")].filter(Boolean).join(" · ");
    case "summary": return s(d, "text");
    case "work": return `${s(d, "title")} — ${s(d, "company")}${d.dates ? ` · ${s(d, "dates")}` : ""}`;
    case "bullet": return s(d, "text");
    case "education": return `${s(d, "degree")} — ${s(d, "institution")}`;
    case "skill": return `${s(d, "group")}: ${s(d, "items")}`;
    case "project": return [s(d, "name"), s(d, "description")].filter(Boolean).join(" — ");
    default: return JSON.stringify(d);
  }
}
const sourceOf = (it: Item) => s(it.data, "_source") || "texto pegado";

export function StagingScreen() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [openFrag, setOpenFrag] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | Ver>("all");
  const [acc, setAcc] = useState(0);
  const [dis, setDis] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/staging");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo leer el staging.");
      setItems(data.items as Item[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => window.CorpusMotion?.boot(), 0);
    return () => window.clearTimeout(t);
  }, [items]);

  const pend = items.length;
  const total = pend + acc + dis;
  const showEmpty = !loading && pend === 0;

  const counts = useMemo(() => {
    const c = { ok: 0, partial: 0, none: 0 };
    for (const it of items) c[verOf(it)]++;
    return c;
  }, [items]);

  const remove = (id: string) => setItems((p) => p.filter((x) => x.id !== id && x.parent_staged_id !== id));

  async function act(id: string, reject = false) {
    setBusy((p) => new Set(p).add(id));
    try {
      const res = await fetch("/api/staging/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stagedId: id, reject }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo.");
      remove(id);
      reject ? setDis((n) => n + 1) : setAcc((n) => n + (data.promoted ?? 1));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    }
  }

  async function acceptVerified() {
    setBusy((p) => new Set(p).add("__batch__"));
    try {
      const res = await fetch("/api/staging/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifiedOnly: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo.");
      setAcc((n) => n + (data.promoted ?? 0));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy((p) => {
        const n = new Set(p);
        n.delete("__batch__");
        return n;
      });
    }
  }

  const toggleFrag = (id: string) =>
    setOpenFrag((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const shown = (it: Item) => filter === "all" || verOf(it) === filter;

  const parents = items.filter((it) => it.kind !== "bullet");
  const group = (kind: string) => parents.filter((it) => it.kind === kind);
  const bulletsOf = (workId: string) => items.filter((it) => it.kind === "bullet" && it.parent_staged_id === workId);

  function Acts({ id }: { id: string }) {
    const b = busy.has(id);
    return (
      <span className="stg-acts">
        <button className="ok" onClick={() => act(id)} disabled={b}>
          ✓ aceptar
        </button>
        <button className="no" onClick={() => act(id, true)} disabled={b}>
          × descartar
        </button>
      </span>
    );
  }

  function Unit({ it, cls }: { it: Item; cls: string }) {
    if (!shown(it)) return null;
    const v = verOf(it);
    return (
      <>
        <div className={`${cls} stg-unit`} data-id={it.id} data-ver={v}>
          <span className="tx">{textOf(it)}</span>
          <span className={"c-ver " + VER[v][0]}>{VER[v][1]}</span>
          <button className="stg-orig" onClick={() => toggleFrag(it.id)}>
            {openFrag.has(it.id) ? "origen ▴" : "origen ▾"}
          </button>
          <Acts id={it.id} />
        </div>
        <div className={"stg-frag" + (v === "none" ? " miss" : "") + (openFrag.has(it.id) ? " open" : "")}>
          <span className="from">{sourceOf(it)}</span>
          {it.evidence_snippet ?? "Sin fragmento de origen — revísalo antes de aceptar."}
        </div>
      </>
    );
  }

  return (
    <div className="c-page">
      <header className="c-header">
        <div className="c-container">
          <div className="hd-crumb" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <Link className="c-logo" href="/app">
              Corpus
            </Link>
            <span style={{ width: "1px", height: "18px", background: "var(--border-strong)" }} />
            <span style={{ font: "500 var(--fs-micro)/1 var(--font-mono)", letterSpacing: ".14em", color: "var(--text-muted)" }}>
              INGESTA · PASO 2 DE 2 — REVISIÓN
            </span>
          </div>
          <div className="hd-right">
            <div className="hd-lang">
              <span data-on>ES</span>
              <span>EN</span>
            </div>
            <div className="hd-av">DG</div>
          </div>
        </div>
      </header>

      <div className="stg-sub" data-screen-label="staging-cabecera">
        <div className="c-container">
          <span className="stg-title">Staging</span>
          <div className="stg-nums">
            <span>
              <b>{pend}</b> pendientes
            </span>
            <span className="stg-bar" aria-hidden="true">
              <span className="ok" style={{ width: total ? (acc / total) * 100 + "%" : "0%" }} />
              <span className="out" style={{ width: total ? (dis / total) * 100 + "%" : "0%" }} />
            </span>
            <span>
              <b className="t-accent">{acc}</b> al master
            </span>
            <span>
              <b>{dis}</b> descartados
            </span>
          </div>
          <div className="stg-filter" role="group" aria-label="Filtrar por verificación">
            <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              todos
            </button>
            <button aria-pressed={filter === "ok"} onClick={() => setFilter("ok")}>
              ● verificado <span>{counts.ok}</span>
            </button>
            <button aria-pressed={filter === "partial"} onClick={() => setFilter("partial")}>
              ◐ parcial <span>{counts.partial}</span>
            </button>
            <button aria-pressed={filter === "none"} onClick={() => setFilter("none")}>
              ⚠ sin evidencia <span>{counts.none}</span>
            </button>
          </div>
        </div>
      </div>

      <main className="stg-main c-wall" data-screen-label="staging">
        <div className="c-container">
          {loading ? (
            <p className="stg-lead">Leyendo tu staging…</p>
          ) : err ? (
            <p className="stg-lead" role="alert" style={{ color: "var(--danger)" }}>
              {err}
            </p>
          ) : null}

          <div className="stg-lead" hidden={showEmpty || loading}>
            <p>
              Nada de esto está en tu master todavía. Cada item cita su origen — <b>ábrelo</b> antes de aceptar lo que
              no te suene. Los lotes solo tocan lo <b>verificado</b>: lo demás pasa por tus ojos, uno a uno.
            </p>
            <button className="c-btn c-btn--patina" onClick={acceptVerified} disabled={busy.has("__batch__") || !counts.ok}>
              {busy.has("__batch__") ? "Aceptando…" : `Aceptar todo lo verificado (${counts.ok})`}
            </button>
          </div>

          <div hidden={showEmpty || loading}>
            {group("basics").length + group("summary").length > 0 && (
              <section className="stg-g">
                <div className="stg-gh">
                  <span className="t-overline">Perfil</span>
                </div>
                <hr className="c-divider" />
                {group("basics").map((it) => (
                  <Unit key={it.id} it={it} cls="stg-b" />
                ))}
                {group("summary").map((it) => (
                  <Unit key={it.id} it={it} cls="stg-b" />
                ))}
              </section>
            )}

            {group("work").length > 0 && (
              <section className="stg-g" data-g="exp">
                <div className="stg-gh">
                  <span className="t-overline">Experiencia</span>
                </div>
                <hr className="c-divider" />
                {group("work").map((w) => (
                  <div className="c-card stg-card" key={w.id}>
                    <Unit it={w} cls="stg-chead" />
                    {bulletsOf(w.id).map((b) => (
                      <Unit key={b.id} it={b} cls="stg-b" />
                    ))}
                  </div>
                ))}
              </section>
            )}

            {group("skill").length > 0 && (
              <section className="stg-g" data-g="sk">
                <div className="stg-gh">
                  <span className="t-overline">Skills</span>
                </div>
                <hr className="c-divider" />
                {group("skill").map((it) => (
                  <Unit key={it.id} it={it} cls="stg-b" />
                ))}
              </section>
            )}

            {group("project").length > 0 && (
              <section className="stg-g" data-g="pj">
                <div className="stg-gh">
                  <span className="t-overline">Proyectos — un CV no es un volcado de GitHub: elige</span>
                </div>
                <hr className="c-divider" />
                {group("project").map((it) => (
                  <Unit key={it.id} it={it} cls="stg-b" />
                ))}
              </section>
            )}

            {group("education").length > 0 && (
              <section className="stg-g" data-g="ct">
                <div className="stg-gh">
                  <span className="t-overline">Educación</span>
                </div>
                <hr className="c-divider" />
                {group("education").map((it) => (
                  <Unit key={it.id} it={it} cls="stg-b" />
                ))}
              </section>
            )}
          </div>

          <div className={"stg-empty" + (showEmpty ? " show" : "")}>
            <div className="mark">✓</div>
            <h2>Staging limpio.</h2>
            <p>
              <span className="t-num">{acc}</span> items entraron a tu master, cada uno con su origen. Lo descartado no
              se borra: queda en la papelera de la ingesta.
            </p>
            <span className="c-forge">
              <Link className="c-btn c-btn--forge c-btn--lg" href="/app/master">
                Ver el master →
              </Link>
            </span>
            <p className="fine">Siguiente paso razonable: crear tu primera variante para un aviso concreto.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
