"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
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

const VER: Record<Ver, string> = {
  ok: "c-ver--ok",
  partial: "c-ver--partial",
  none: "c-ver--none",
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
const sourceOf = (it: Item) => s(it.data, "_source");

// §C1/§C2/§C3 — señales que la UI hace visibles (nunca se adivina en silencio).
const doubtOf = (it: Item) => s(it.data, "_classDoubt");
const ctxOf = (it: Item) => s(it.data, "sourceContext");
const dateInvalidOf = (it: Item) => s(it.data, "dateInvalid");
const dateMissingOf = (it: Item) => Boolean(it.data.dateMissing);
const isDated = (it: Item) => it.kind === "work" || it.kind === "project";
const withoutDoubt = (d: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (k !== "_classDoubt" && k !== "_classReason") out[k] = v;
  return out;
};

export function StagingScreen() {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [openFrag, setOpenFrag] = useState<Set<string>>(new Set());
  const [openDate, setOpenDate] = useState<Set<string>>(new Set());
  const [dateDraft, setDateDraft] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | Ver>("all");
  const [acc, setAcc] = useState(0);
  const [dis, setDis] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/staging");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("staging.errRead"));
      setItems(data.items as Item[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("staging.errGeneric"));
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
      if (!res.ok) throw new Error(data.error || t("staging.errAccept"));
      remove(id);
      reject ? setDis((n) => n + 1) : setAcc((n) => n + (data.promoted ?? 1));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("staging.errGeneric"));
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
      if (!res.ok) throw new Error(data.error || t("staging.errAccept"));
      setAcc((n) => n + (data.promoted ?? 0));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("staging.errGeneric"));
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

  // ── Reclasificación y fechas (PATCH /api/staging) ──────────────────────────
  async function patch(id: string, extra: Record<string, unknown>) {
    setBusy((p) => new Set(p).add(id));
    try {
      const res = await fetch("/api/staging", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("staging.errGeneric"));
      return data as Record<string, unknown>;
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("staging.errGeneric"));
      return null;
    } finally {
      setBusy((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    }
  }

  // «es habilidad»: la viñeta pasa a la sección de habilidades (kind skill).
  async function reclassSkill(it: Item) {
    const ok = await patch(it.id, { kind: "skill", group: "Herramientas" });
    if (!ok) return;
    const parent = items.find((x) => x.id === it.parent_staged_id);
    const ctx = ctxOf(it) || (parent ? s(parent.data, "title") || s(parent.data, "company") : "");
    setItems((p) =>
      p.map((x) =>
        x.id === it.id
          ? {
              ...x,
              kind: "skill",
              parent_staged_id: null,
              data: { ...withoutDoubt(x.data), group: "Herramientas", items: s(x.data, "text") || s(x.data, "items"), sourceContext: ctx },
            }
          : x,
      ),
    );
  }

  // «es viñeta»: solo se limpia la duda; sigue siendo viñeta.
  async function clearDoubt(it: Item) {
    const ok = await patch(it.id, { clearDoubt: true });
    if (!ok) return;
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, data: withoutDoubt(x.data) } : x)));
  }

  // «falta fecha» → el humano la escribe; el origen de la fecha es el humano.
  async function saveDate(it: Item, value: string) {
    const raw = value.trim();
    if (!raw) return;
    const ok = await patch(it.id, { dates: raw });
    if (!ok) return;
    setItems((p) =>
      p.map((x) => {
        if (x.id !== it.id) return x;
        const d: Record<string, unknown> = { ...x.data, dates: raw, dateByHuman: true };
        delete d.dateMissing;
        delete d.dateInvalid;
        return { ...x, data: d };
      }),
    );
    setOpenDate((p) => {
      const n = new Set(p);
      n.delete(it.id);
      return n;
    });
  }

  const shown = (it: Item) => filter === "all" || verOf(it) === filter;

  const parents = items.filter((it) => it.kind !== "bullet");
  const group = (kind: string) => parents.filter((it) => it.kind === kind);
  const bulletsOf = (workId: string) => items.filter((it) => it.kind === "bullet" && it.parent_staged_id === workId);

  function Acts({ id }: { id: string }) {
    const b = busy.has(id);
    return (
      <span className="stg-acts">
        <button className="ok" onClick={() => act(id)} disabled={b}>
          {t("staging.accept")}
        </button>
        <button className="no" onClick={() => act(id, true)} disabled={b}>
          {t("staging.discard")}
        </button>
      </span>
    );
  }

  function DateFix({ it }: { it: Item }) {
    const b = busy.has(it.id);
    if (!openDate.has(it.id)) {
      return (
        <button className="stg-dateadd" onClick={() => setOpenDate((p) => new Set(p).add(it.id))}>
          {t("staging.dateAdd")}
        </button>
      );
    }
    const val = dateDraft[it.id] ?? "";
    return (
      <span className="stg-dateinput">
        <input
          value={val}
          placeholder={t("staging.datePlaceholder")}
          onChange={(e) => setDateDraft((p) => ({ ...p, [it.id]: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && saveDate(it, val)}
        />
        <button disabled={b || !val.trim()} onClick={() => saveDate(it, val)}>
          {b ? t("staging.dateSaving") : t("staging.dateSave")}
        </button>
      </span>
    );
  }

  function Unit({ it, cls }: { it: Item; cls: string }) {
    if (!shown(it)) return null;
    const v = verOf(it);
    const doubt = doubtOf(it);
    const badDate = dateInvalidOf(it);
    const noDate = isDated(it) && !badDate && dateMissingOf(it);
    const ctx = it.kind === "skill" ? ctxOf(it) : "";
    return (
      <>
        <div className={`${cls} stg-unit`} data-id={it.id} data-ver={v}>
          <span className="tx">{textOf(it)}</span>
          <span className={"c-ver " + VER[v]}>{t(`staging.ver_${v}`)}</span>
          <button className="stg-orig" onClick={() => toggleFrag(it.id)}>
            {openFrag.has(it.id) ? `${t("staging.source")} ▴` : `${t("staging.source")} ▾`}
          </button>
          <Acts id={it.id} />
        </div>
        <div className={"stg-frag" + (v === "none" ? " miss" : "") + (openFrag.has(it.id) ? " open" : "")}>
          <span className="from">{sourceOf(it) || t("staging.sourceFallback")}</span>
          {it.evidence_snippet ?? t("staging.noFragment")}
        </div>

        {ctx && (
          <div className="stg-ctx">
            {t("staging.skillFrom")} {ctx}
          </div>
        )}

        {doubt && (
          <div className="stg-classq">
            <span className="q">{t("staging.doubtChip")}</span>
            <span className="why">{s(it.data, "_classReason") || t("staging.doubtWhy")}</span>
            <span className="acts">
              <button className="ok" disabled={busy.has(it.id)} onClick={() => reclassSkill(it)}>
                {t("staging.doubtIsSkill")}
              </button>
              <button disabled={busy.has(it.id)} onClick={() => clearDoubt(it)}>
                {t("staging.doubtIsBullet")}
              </button>
            </span>
          </div>
        )}

        {badDate && (
          <div className="stg-datefix bad">
            <span className="lbl">⚠ {t("staging.dateInvalid")}</span>
            <span className="orig">{badDate}</span>
            <span className="why">{t("staging.dateInvalidHint")}</span>
            <DateFix it={it} />
          </div>
        )}

        {noDate && (
          <div className="stg-datefix">
            <span className="lbl">{t("staging.dateMissing")}</span>
            <DateFix it={it} />
          </div>
        )}
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
              {t("staging.microStep")}
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
          <span className="stg-title">{t("staging.title")}</span>
          <div className="stg-nums">
            <span>
              <b>{pend}</b> {t("staging.pending")}
            </span>
            <span className="stg-bar" aria-hidden="true">
              <span className="ok" style={{ width: total ? (acc / total) * 100 + "%" : "0%" }} />
              <span className="out" style={{ width: total ? (dis / total) * 100 + "%" : "0%" }} />
            </span>
            <span>
              <b className="t-accent">{acc}</b> {t("staging.toMaster")}
            </span>
            <span>
              <b>{dis}</b> {t("staging.discarded")}
            </span>
          </div>
          <div className="stg-filter" role="group" aria-label={t("staging.filterAria")}>
            <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              {t("staging.filterAll")}
            </button>
            <button aria-pressed={filter === "ok"} onClick={() => setFilter("ok")}>
              ● {t("staging.filterVerified")} <span>{counts.ok}</span>
            </button>
            <button aria-pressed={filter === "partial"} onClick={() => setFilter("partial")}>
              ◐ {t("staging.filterPartial")} <span>{counts.partial}</span>
            </button>
            <button aria-pressed={filter === "none"} onClick={() => setFilter("none")}>
              ⚠ {t("staging.filterNone")} <span>{counts.none}</span>
            </button>
          </div>
        </div>
      </div>

      <main className="stg-main c-wall" data-screen-label="staging">
        <div className="c-container">
          {loading ? (
            <p className="stg-lead">{t("staging.loading")}</p>
          ) : err ? (
            <p className="stg-lead" role="alert" style={{ color: "var(--danger)" }}>
              {err}
            </p>
          ) : null}

          <div className="stg-lead" hidden={showEmpty || loading}>
            <p>
              {t("staging.lead1")}<b>{t("staging.leadOpen")}</b>{t("staging.lead2")}<b>{t("staging.leadVerified")}</b>
              {t("staging.lead3")}
            </p>
            <button className="c-btn c-btn--patina" onClick={acceptVerified} disabled={busy.has("__batch__") || !counts.ok}>
              {busy.has("__batch__")
                ? t("staging.batchAccepting")
                : t("staging.batchAccept").replace("{n}", String(counts.ok))}
            </button>
          </div>

          <div hidden={showEmpty || loading}>
            {group("basics").length + group("summary").length > 0 && (
              <section className="stg-g">
                <div className="stg-gh">
                  <span className="t-overline">{t("staging.groupProfile")}</span>
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
                  <span className="t-overline">{t("staging.groupExperience")}</span>
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
                  <span className="t-overline">{t("staging.groupSkills")}</span>
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
                  <span className="t-overline">{t("staging.groupProjects")}</span>
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
                  <span className="t-overline">{t("staging.groupEducation")}</span>
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
            <h2>{t("staging.emptyTitle")}</h2>
            <p>
              <span className="t-num">{acc}</span> {t("staging.emptyBody")}
            </p>
            <span className="c-forge">
              <Link className="c-btn c-btn--forge c-btn--lg" href="/app/master">
                {t("staging.emptyCta")}
              </Link>
            </span>
            <p className="fine">{t("staging.emptyFine")}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
