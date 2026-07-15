"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT, useLang } from "@/lib/i18n";
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

   ★ CREACIÓN DE VARIANTES (esta fase). Dos caminos, ambos parten del master real,
   nunca de demo:
     - Manual: POST /api/variants { mode:'manual', name? } → editor de la variante.
     - Con IA (un clic): una caja en lenguaje natural → POST { mode:'ai', prompt }
       → la variante queda ARMADA como punto de partida; se muestran las `notes`
       (la IA es honesta si el master es flaco) y el usuario la abre para revisar.
       Nada se aplica en silencio.

   Cada variante es una VISTA del master, no una copia. Las desactualizadas se
   marcan con c-pulse-dot (master_seen_at < master.updated_at) y dejan decidir:
   actualizar (adoptar el master) o mantener tu override.
   ============================================================================ */

type Variant = {
  id?: string;
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

// Ruta del editor cuando no hay id real (modo local / fallback).
const EDITOR_FALLBACK = "/app/variantes/editor";
const editorHref = (v: Variant) => (v.id ? `/app/variantes/${v.id}` : EDITOR_FALLBACK);

/* Tiempo relativo honesto (fuente: el reloj del sistema). Usa las claves
   compartidas `dashboard.rel.*` del diccionario plano fusionado —son genéricas y
   ya vienen pluralizadas en ES/EN—, así el idioma se refleja de verdad en vez de
   quedar cableado en español. */
type T = (key: string) => string;
function rel(iso: string, t: T): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const d = Math.max(0, Date.now() - then);
  const day = 86_400_000;
  const plur = (base: string, n: number) =>
    t(n === 1 ? `${base}.one` : `${base}.other`).replace("{n}", String(n));
  if (d < 3_600_000) return t("dashboard.rel.now");
  if (d < day) return t("dashboard.rel.hour").replace("{n}", String(Math.round(d / 3_600_000)));
  if (d < 7 * day) return plur("dashboard.rel.day", Math.round(d / day));
  if (d < 30 * day) return t("dashboard.rel.week").replace("{n}", String(Math.round(d / (7 * day))));
  if (d < 365 * day) return plur("dashboard.rel.month", Math.round(d / (30 * day)));
  return plur("dashboard.rel.year", Math.round(d / (365 * day)));
}

export function VariantesScreen() {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const [variants, setVariants] = useState<Variant[]>(supabaseEnabled ? [] : DEMO_VARIANTS);
  const [masterItems, setMasterItems] = useState<number>(supabaseEnabled ? 0 : DEMO_MASTER_ITEMS);
  const [loading, setLoading] = useState(supabaseEnabled);
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());
  const [gen, setGen] = useState(0);
  const [announce, setAnnounce] = useState("");

  // Creación de variantes.
  const [newName, setNewName] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [creating, setCreating] = useState<"manual" | "ai" | null>(null);
  const [createErr, setCreateErr] = useState("");
  const [aiResult, setAiResult] = useState<{ id: string; name: string; notes: string | null } | null>(null);

  const mainRef = useRef<HTMLElement>(null);

  const empty = !loading && variants.length === 0;
  const canCreate = masterItems > 0; // sin master, no hay de dónde elegir

  // Carga real (modo Supabase).
  useEffect(() => {
    if (!supabaseEnabled) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/variants");
        const data = await res.json();
        if (!active) return;
        const list = ((data.variants ?? []) as { id: string; name: string; targetTitle: string | null; updatedAt: string; outdated: boolean }[]).map((x) => ({
          id: x.id,
          nm: x.name,
          obj: x.targetTitle || t("variantes.noObjective"),
          pg: "",
          touch: t("dashboard.variant.touched").replace("{rel}", rel(x.updatedAt, t)),
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
    // Recarga al cambiar de idioma: `obj` (sin objetivo) y `touch` (tocada {rel})
    // se formatean con el `t` del closure, así que hay que rehacerlos con el
    // idioma nuevo. `t` cambia de identidad junto con `lang`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

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
  // local (aún no hay endpoint de escritura de estas señales en esta fase).
  function updateVariant(i: number) {
    setVariants((prev) => prev.map((v, k) => (k === i ? { ...v, old: false } : v)));
    setOpenRows(new Set());
    setGen((g) => g + 1);
    setAnnounce(t("variantes.announceUpdated").replace("{nm}", variants[i].nm));
  }
  function keepVariant(i: number) {
    setVariants((prev) => prev.map((v, k) => (k === i ? { ...v, old: false, kept: true } : v)));
    setOpenRows(new Set());
    setGen((g) => g + 1);
    setAnnounce(t("variantes.announceKept").replace("{nm}", variants[i].nm));
  }

  // ── Creación ──────────────────────────────────────────────────────────────
  async function createManual() {
    if (creating) return;
    setCreateErr("");
    if (!supabaseEnabled) {
      router.push(EDITOR_FALLBACK);
      return;
    }
    setCreating("manual");
    try {
      const res = await fetch("/api/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "manual", name: newName.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      const { variant } = (await res.json()) as { variant: { id: string } };
      router.push(`/app/variantes/${variant.id}`);
    } catch {
      setCreating(null);
      setCreateErr(t("variantes.errManual"));
    }
  }

  async function createAI() {
    const prompt = aiPrompt.trim();
    if (creating || !prompt) return;
    setCreateErr("");
    setAiResult(null);
    if (!supabaseEnabled) {
      setAiResult({
        id: "editor",
        name: prompt.slice(0, 40),
        notes: t("variantes.aiLocalNote"),
      });
      return;
    }
    setCreating("ai");
    try {
      const res = await fetch("/api/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ai", prompt }),
      });
      if (!res.ok) throw new Error();
      const { variant, notes } = (await res.json()) as { variant: { id: string; name: string }; notes?: string };
      setAiResult({ id: variant.id, name: variant.name, notes: notes ?? null });
      setAnnounce(t("variantes.announceAiCreated").replace("{nm}", variant.name));
    } catch {
      setCreateErr(t("variantes.errAi"));
    } finally {
      setCreating(null);
    }
  }

  // Panel de creación (se muestra en el lead y, con master, también en el vacío).
  const createPanel = (
    <div className="vr-create">
      <div
        className="c-card"
        style={{ padding: "18px 20px", display: "grid", gap: "16px", textAlign: "left", maxWidth: "760px", margin: "0 auto" }}
      >
        <div>
          <label htmlFor="aiPrompt" className="t-overline" style={{ display: "block", marginBottom: "8px" }}>
            {t("variantes.aiLabel")}
          </label>
          <textarea
            id="aiPrompt"
            className="c-input"
            rows={2}
            placeholder={t("variantes.aiPlaceholder")}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            style={{ resize: "vertical", minHeight: "54px", width: "100%", lineHeight: 1.5 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="c-btn c-btn--patina"
              disabled={creating !== null || !aiPrompt.trim()}
              onClick={() => void createAI()}
            >
              {creating === "ai" ? t("variantes.aiCreating") : t("variantes.aiCreate")}
            </button>
            <span style={{ font: "400 var(--fs-micro)/1.5 var(--font-mono)", color: "var(--text-subtle)", maxWidth: "52ch" }}>
              {t("variantes.aiHint")}
            </span>
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: "14px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <input
            className="c-input"
            aria-label={t("variantes.nameAria")}
            placeholder={t("variantes.namePlaceholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ maxWidth: "280px" }}
          />
          <button type="button" className="c-btn" disabled={creating !== null} onClick={() => void createManual()}>
            {creating === "manual" ? t("variantes.manualCreating") : t("variantes.manualCreate")}
          </button>
          <span style={{ font: "400 var(--fs-micro)/1.5 var(--font-mono)", color: "var(--text-subtle)" }}>
            {t("variantes.manualHint")}
          </span>
        </div>

        {createErr ? (
          <p style={{ font: "400 var(--fs-micro)/1.6 var(--font-mono)", color: "var(--danger)", margin: 0 }} role="alert">
            {createErr}
          </p>
        ) : null}
      </div>

      {aiResult ? (
        <div
          className="c-card"
          style={{
            padding: "18px 20px",
            marginTop: "14px",
            maxWidth: "760px",
            marginInline: "auto",
            textAlign: "left",
            borderColor: "var(--border-patina)",
          }}
        >
          <span className="t-overline">{t("variantes.aiResultOverline")}</span>
          <p style={{ marginTop: "10px", color: "var(--text-muted)", lineHeight: 1.6 }}>
            «{aiResult.name}» {t("variantes.aiResultBody1")}
            <b style={{ color: "var(--text)" }}>{t("variantes.aiResultBodyBold")}</b>
            {t("variantes.aiResultBody2")}
          </p>
          {aiResult.notes ? (
            <p
              style={{
                marginTop: "8px",
                font: "400 var(--fs-micro)/1.7 var(--font-mono)",
                color: "var(--text-subtle)",
              }}
            >
              {t("variantes.aiResultNotePrefix")}{aiResult.notes}
            </p>
          ) : null}
          <div style={{ marginTop: "14px" }}>
            <Link className="c-btn c-btn--patina" href={`/app/variantes/${aiResult.id}`}>
              {t("variantes.aiResultOpen")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="c-page">
      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/app">
            Corpus
          </Link>
          <nav className="hd-nav">
            <Link href="/app">{t("nav.panel")}</Link>
            <Link href="/app/master">{t("nav.master")}</Link>
            <Link href="/app/variantes" aria-current="page">
              {t("nav.variantes")}
            </Link>
            <Link href="/app/fuentes">{t("nav.fuentes")}</Link>
          </nav>
          <div className="hd-right">
            <nav className="hd-nav" style={{ display: "flex" }}>
              <Link href="/app/ajustes">{t("nav.ajustes")}</Link>
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
              {t("variantes.loading")}
            </p>
          ) : null}

          {!empty && !loading && (
            <div className="vr-lead">
              <p>
                <b>
                  {t("variantes.leadCount")
                    .replace("{n}", String(variants.length))
                    .replace("{s}", variants.length === 1 ? "" : "s")}
                </b>{" "}
                {t("variantes.leadBody")}
              </p>
            </div>
          )}

          {!empty && !loading && createPanel}

          {!empty && !loading && <hr className="c-divider" />}

          {!empty && !loading && (
            <div className="vr-list" id="list">
              {variants.map((v, i) => {
                const open = openRows.has(i);
                const diffId = `vr-diff-${i}`;
                const href = editorHref(v);
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
                        {v.old && <span className="c-pulse-dot" title={t("variantes.dotTitle")} aria-hidden="true" />}
                        {v.nm}
                      </span>
                      <button type="button" className="pdf" title={t("variantes.pdfTitle")} onClick={(e) => e.stopPropagation()}>
                        {t("variantes.pdfBtn")}
                      </button>
                      <span className="meta">
                        {v.old ? <span className="old">{t("variantes.metaOutdated")}</span> : t("variantes.metaUpToDate")}
                        <br />
                        {v.touch}
                        {v.pg ? ` · ${v.pg}` : ""}
                      </span>
                      <Link className="open" href={href}>
                        {t("variantes.openLink")}
                      </Link>
                      <span className="obj">{t("variantes.objectivePrefix")}{v.obj}</span>
                    </div>

                    {v.old && (
                      <div className="vr-diff" id={diffId}>
                        <span className="t-overline">{t("variantes.diffOverline")}</span>
                        <div className="vr-dline">
                          <span style={{ color: "var(--text-subtle)" }}>
                            {t("variantes.diffBody")}
                          </span>
                        </div>
                        <div className="vr-dacts">
                          <button type="button" className="prim" onClick={() => updateVariant(i)}>
                            {t("variantes.diffUpdate")}
                          </button>
                          <button type="button" onClick={() => keepVariant(i)}>
                            {t("variantes.diffKeep")}
                          </button>
                          <Link className="c-btn c-btn--quiet" style={{ height: "30px", fontSize: "10px" }} href={href}>
                            {t("variantes.diffOpenEditor")}
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
              <span className="t-overline">{t("variantes.emptyOverline")}</span>
              <h2 style={{ marginTop: "16px" }}>
                {canCreate ? (
                  <>
                    {t("variantes.emptyHasMasterLine1")
                      .replace("{n}", String(masterItems))
                      .replace("{s}", masterItems === 1 ? "" : "s")}
                    <br />
                    {t("variantes.emptyHasMasterLine2")}
                  </>
                ) : (
                  <>
                    {t("variantes.emptyNoMasterLine1")}
                    <br />
                    {t("variantes.emptyNoMasterLine2")}
                  </>
                )}
              </h2>
              <p>
                {canCreate ? t("variantes.emptyHasMasterBody") : t("variantes.emptyNoMasterBody")}
              </p>
              {canCreate ? (
                <div style={{ marginTop: "26px" }}>{createPanel}</div>
              ) : (
                <div style={{ marginTop: "26px" }}>
                  <span className="c-forge">
                    <Link className="c-btn c-btn--forge c-btn--lg" href="/app/importar">
                      {t("variantes.emptyDumpCta")}
                    </Link>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
