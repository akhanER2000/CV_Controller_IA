"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Aurora } from "@/components/Aurora";
import { useT, useLang } from "@/lib/i18n";
import { useBoot } from "@/lib/corpus/runtime";
import { supabaseEnabled } from "@/lib/supabase/config";
import "./dashboard.css";

type T = (key: string) => string;

/* ============================================================================
   Dashboard — porte de corpus-design/04-pantallas/dashboard.html
   (ver docs/spec/pantallas/dashboard.md). "El estado de tu carrera, no un
   saludo": parrilla de variantes + salud del master + staging + fuentes.

   ★ CABLEADO A DATOS REALES. En modo Supabase los conteos y listas salen de
   /api/master?summary=1, /api/variants y /api/sources (RLS por auth.uid()); una
   cuenta nueva (todo 0) cae al estado día-1. La maqueta (persona Diego Gatica)
   solo se usa como FALLBACK del modo local sin Supabase.

   Gramática ventana/muro (spec §2):
   - Registro CON items → estado DENSO = MURO. NO monta Aurora ("donde hay
     trabajo, el trabajo gana": el bento tapa la aurora, sería gastar GPU).
   - Registro VACÍO (día 1, 0 items) → VENTANA: monta <Aurora state="calm"/>
     y las dos puertas respiran sobre el fondo. Es la ÚNICA excepción del
     dashboard a la regla "los muros no montan aurora".
   El estado se DERIVA de los datos (masterItems === 0 && sin variantes), no de
   un toggle. La "salud del master" ya no cita hallazgos ficticios: se derivan de
   tus propios items (viñetas sin cifra, roles sin fechas, skills sin evidencia).

   A11y (spec §8): la fila de variante desanida el <button class="pdf"> del enlace.
   Clases db-vrow/nm/obj/st/pdf intactas.
   ============================================================================ */

type VariantView = { nm: string; obj: string; touch: string; outdated: boolean };
type SourceView = { nm: string; factsLines: string[]; newText?: string; quietText?: string };
type Finding = { k: string; text: string; anchor: string };

interface DashData {
  masterItems: number;
  variants: VariantView[];
  outdated: number;
  sources: SourceView[];
  findings: Finding[];
  pendingStaging: number;
}

/* ── Maqueta del MODO LOCAL (persona Diego Gatica). Nunca se usa con Supabase. ─ */
const DEMO: DashData = {
  masterItems: 52,
  outdated: 2,
  pendingStaging: 2,
  variants: [
    { nm: "Backend — Fintech", obj: "Backend Engineer", touch: "tocada hace 2 días · 2 págs", outdated: true },
    { nm: "Backend — General", obj: "Backend Developer", touch: "hace 5 días · 2 págs", outdated: true },
    { nm: "Data Engineering", obj: "Data Engineer", touch: "hace 1 semana · 2 págs", outdated: false },
    { nm: "Plataforma / DevOps", obj: "Platform Engineer", touch: "hace 2 semanas · 2 págs", outdated: false },
    { nm: "Full-stack — startup temprana", obj: "Software Engineer", touch: "hace 3 semanas · 1 pág", outdated: false },
    { nm: "Backend — EN · remoto", obj: "Backend Engineer (EN)", touch: "hace 1 mes · 2 págs", outdated: false },
    { nm: "Académica — ayudantías", obj: "Ingeniero de Software", touch: "hace 2 meses · 1 pág", outdated: false },
  ],
  findings: [
    { k: "3", text: "viñetas sin ninguna cifra — ¿cuánto? ¿cuántos? ¿en cuánto tiempo?", anchor: "sin-cifra" },
    { k: "1", text: "rol sin fechas: Freelance (2019 – …)", anchor: "sin-fechas" },
    { k: "2", text: "skills siguen sin evidencia: Kafka, AWS", anchor: "sin-evidencia" },
  ],
  sources: [
    { nm: "github.com/dgatica", factsLines: ["12 repos · 5 seleccionados · aportó 14 items", "último push: hace 3 días"], newText: "2 repos con actividad nueva — leer" },
    { nm: "dgatica.cl", factsLines: ["6 proyectos · aportó 12 items", "leída: hace 12 días"], quietText: "sin cambios detectados" },
    { nm: "CV_2023.pdf", factsLines: ["2 páginas · aportó 15 items"], quietText: "archivo estático — no cambia solo" },
    { nm: "cuestionario-identidad.md", factsLines: ["16 bloques · aportó 6 items"], quietText: "fuente de primera — escrita por ti" },
  ],
};

/* ── Tiempo relativo honesto (un dato con fuente: el reloj del sistema). ─────── */
function rel(iso: string, t: T): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const d = Math.max(0, Date.now() - then);
  const day = 86_400_000;
  const plur = (base: string, n: number) =>
    t(n === 1 ? `${base}.one` : `${base}.other`).replace("{n}", String(n));
  if (d < 60_000) return t("dashboard.rel.now");
  if (d < 3_600_000) return t("dashboard.rel.min").replace("{n}", String(Math.round(d / 60_000)));
  if (d < day) return t("dashboard.rel.hour").replace("{n}", String(Math.round(d / 3_600_000)));
  if (d < 7 * day) return plur("dashboard.rel.day", Math.round(d / day));
  if (d < 30 * day) return t("dashboard.rel.week").replace("{n}", String(Math.round(d / (7 * day))));
  if (d < 365 * day) return plur("dashboard.rel.month", Math.round(d / (30 * day)));
  return plur("dashboard.rel.year", Math.round(d / (365 * day)));
}

const kindLabel = (kind: string, t: T): string => {
  const key = `dashboard.kind.${kind}`;
  const label = t(key);
  return label === key ? kind : label; // clave desconocida → cae al kind crudo
};

interface MasterItemLite {
  kind: string;
  data: Record<string, unknown>;
  evidenceVerified: boolean;
}

/** Hallazgos de salud DERIVADOS de tus propios items — nada inventado. */
function deriveFindings(items: MasterItemLite[], t: T): Finding[] {
  const str = (o: Record<string, unknown>, k: string) => String(o[k] ?? "");
  const noNum = items.filter((i) => i.kind === "bullet" && !/\d/.test(str(i.data, "text"))).length;
  const noDates = items.filter((i) => i.kind === "work" && !str(i.data, "dates").trim()).length;
  const noEv = items.filter((i) => i.kind === "skill" && !i.evidenceVerified).length;
  const pick = (base: string, n: number) => t(n === 1 ? `${base}.one` : `${base}.other`);
  const out: Finding[] = [];
  if (noNum) out.push({ k: String(noNum), text: pick("dashboard.findings.noNum", noNum), anchor: "sin-cifra" });
  if (noDates) out.push({ k: String(noDates), text: pick("dashboard.findings.noDates", noDates), anchor: "sin-fechas" });
  if (noEv) out.push({ k: String(noEv), text: pick("dashboard.findings.noEv", noEv), anchor: "sin-evidencia" });
  return out;
}

/* Fila de una variante. Enlace estirado (navega a variantes) + botón PDF hermano
   por encima (descarga sin entrar). Auto-placement del grid: nm→pdf→st→obj. */
function VariantRow({ v }: { v: VariantView }) {
  const t = useT();
  return (
    <div className="db-vrow" style={{ position: "relative" }}>
      <Link
        href="/app/variantes"
        aria-label={t("dashboard.variant.aria").replace("{nm}", v.nm).replace("{obj}", v.obj)}
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      />
      <span className="nm">
        {v.outdated ? <span className="c-pulse-dot" title={t("dashboard.variant.outdatedDot")} /> : null}
        {v.nm}
      </span>
      <button
        type="button"
        className="pdf"
        title={t("dashboard.variant.pdfTitle")}
        style={{ position: "relative", zIndex: 1 }}
        onClick={() => {
          /* PDF de la variante: pendiente del render por-variante. */
        }}
      >
        {t("dashboard.variant.pdf")}
      </button>
      <span className="st">
        {v.outdated ? <span className="old">{t("dashboard.variant.outdated")}</span> : t("dashboard.variant.upToDate")}
        <br />
        {v.touch}
      </span>
      <span className="obj">
        {t("dashboard.variant.target")}
        {v.obj}
      </span>
    </div>
  );
}

export function DashboardScreen() {
  const t = useT();
  const { lang } = useLang();
  const [data, setData] = useState<DashData | null>(supabaseEnabled ? null : DEMO);
  const [loading, setLoading] = useState(supabaseEnabled);

  // Carga real (modo Supabase): panel + variantes + fuentes en paralelo.
  useEffect(() => {
    if (!supabaseEnabled) return;
    let active = true;
    (async () => {
      try {
        const [mRes, vRes, sRes] = await Promise.all([
          fetch("/api/master?summary=1"),
          fetch("/api/variants"),
          fetch("/api/sources"),
        ]);
        const [m, v, s] = await Promise.all([mRes.json(), vRes.json(), sRes.json()]);
        if (!active) return;
        const items = (m.items ?? []) as MasterItemLite[];
        const summary = m.summary ?? { masterItems: items.length, outdatedVariants: 0, pendingStaging: 0 };
        const variants = ((v.variants ?? []) as { name: string; targetTitle: string | null; updatedAt: string; outdated: boolean }[]).map((x) => ({
          nm: x.name,
          obj: x.targetTitle || t("dashboard.variant.noTarget"),
          touch: t("dashboard.variant.touched").replace("{rel}", rel(x.updatedAt, t)),
          outdated: x.outdated,
        }));
        const numLocale = lang === "en" ? "en-US" : "es-CL";
        const sources = ((s.sources ?? []) as { kind: string; originalName: string | null; sourceUrl: string | null; status: string; rawTextLength: number; createdAt: string }[]).map((x) => ({
          nm: x.originalName || x.sourceUrl || kindLabel(x.kind, t),
          factsLines: [
            `${kindLabel(x.kind, t)} · ${x.rawTextLength.toLocaleString(numLocale)} ${t("dashboard.source.chars")}`,
            t("dashboard.source.read").replace("{rel}", rel(x.createdAt, t)),
          ],
          quietText: x.status === "extracted" ? t("dashboard.source.extracted") : t("dashboard.source.static"),
        }));
        setData({
          masterItems: summary.masterItems ?? items.length,
          variants,
          outdated: summary.outdatedVariants ?? variants.filter((x) => x.outdated).length,
          sources,
          findings: deriveFindings(items, t),
          pendingStaging: summary.pendingStaging ?? 0,
        });
      } catch {
        if (active) setData({ masterItems: 0, variants: [], outdated: 0, sources: [], findings: [], pendingStaging: 0 });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // Recarga al cambiar de idioma: los strings DERIVADOS del servidor (tocada
    // {rel}, "leída {rel}", nº de caracteres con locale) se formatean con el `t`
    // del closure, así que hay que reconstruirlos con el idioma nuevo. Los demás
    // textos ya son reactivos porque salen de `t(...)` en el render. El resto de
    // dependencias (`t`) cambia de identidad junto con `lang`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const isEmpty = !!data && data.masterItems === 0 && data.variants.length === 0;

  const suffix = data
    ? t("dashboard.strip.suffix").replace("{n}", String(data.masterItems)).replace("{m}", String(data.sources.length))
    : "";
  // SSR y primer render: fallback fijo. En cliente lo reescribe con la fecha real.
  const [dateStr, setDateStr] = useState(t("nav.panel"));

  const bootRef = useBoot<HTMLElement>();
  const emptyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!data) return;
    try {
      const d = new Date();
      const f = d.toLocaleDateString(lang === "en" ? "en-US" : "es-CL", { weekday: "long", day: "numeric", month: "long" });
      setDateStr(f.charAt(0).toUpperCase() + f.slice(1) + suffix);
    } catch {
      setDateStr(`${t("nav.panel")}${suffix}`);
    }
  }, [suffix, data, lang, t]);

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

  const header = (
    <header className="c-header">
      <div className="c-container">
        <Link className="c-logo" href="/app">
          Corpus
        </Link>
        <nav className="hd-nav">
          <Link href="/app" aria-current="page">
            {t("nav.panel")}
          </Link>
          <Link href="/app/master">{t("nav.master")}</Link>
          <Link href="/app/variantes">{t("nav.variantes")}</Link>
          <Link href="/app/fuentes">{t("nav.fuentes")}</Link>
        </nav>
        <div className="hd-right">
          <Link href="/app/ajustes" className="hd-nav" style={{ display: "inline-flex" }}>
            <span style={{ font: "500 var(--fs-ui)/1 var(--font-sans)", color: "var(--text-muted)", padding: "9px 12px" }}>
              {t("nav.ajustes")}
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
  );

  // Mientras carga (modo Supabase): muro neutro, sin aurora, para no parpadear.
  if (loading || !data) {
    return (
      <div className="c-page">
        {header}
        <main className="db-main c-wall" data-screen-label="dashboard-cargando">
          <div className="c-container">
            <div className="db-strip">
              <span className="t-overline">{t("dashboard.loading")}</span>
            </div>
            <hr className="c-divider" style={{ marginBottom: "2px" }} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="c-page">
      {isEmpty ? <Aurora state="calm" /> : null}

      {header}

      {isEmpty ? (
        /* ═══ VACÍO: día 1. Ventana: la aurora respira en calma. ═══ */
        <main className="db-empty c-window show" data-screen-label="dashboard-vacio" ref={emptyRef}>
          <span className="t-overline">{t("dashboard.empty.overline")}</span>
          <h1 style={{ marginTop: "20px" }}>
            {t("dashboard.empty.h1.pre")}
            <em>{t("dashboard.empty.h1.em")}</em>
          </h1>
          <p className="sub">{t("dashboard.empty.sub")}</p>
          <div className="db-doors">
            <Link className="c-panel c-lift db-door" href="/app/importar">
              <span className="t-overline">{t("dashboard.empty.doorA.overline")}</span>
              <h3>{t("dashboard.empty.doorA.title")}</h3>
              <p>{t("dashboard.empty.doorA.body")}</p>
              <span className="go">{t("dashboard.empty.doorA.cta")}</span>
            </Link>
            <Link className="c-panel c-lift db-door" href="/app/onboarding">
              <span className="t-overline">{t("dashboard.empty.doorB.overline")}</span>
              <h3>{t("dashboard.empty.doorB.title")}</h3>
              <p>{t("dashboard.empty.doorB.body")}</p>
              <span className="go">{t("dashboard.empty.doorB.cta")}</span>
            </Link>
          </div>
          <p className="fine">{t("dashboard.empty.fine")}</p>
        </main>
      ) : (
        /* ═══ DENSO: muro. El estado, no un saludo. ═══ */
        <main className="db-main c-wall" data-screen-label="dashboard-denso" ref={bootRef}>
          <div className="c-container">
            <div className="db-strip">
              <span className="t-overline">{dateStr}</span>
              <span className="acts">
                <Link className="c-btn c-btn--quiet" href="/app/variantes">
                  {t("common.tailor")}
                </Link>
                <Link className="c-btn c-btn--patina" href="/app/variantes">
                  {t("dashboard.strip.newVariant")}
                </Link>
              </span>
            </div>
            <hr className="c-divider" style={{ marginBottom: "2px" }} />
            <div className="db-bento">
              <section className="db-cell db-v" data-screen-label="dashboard-variantes">
                <div className="db-ch">
                  <span className="t-overline">{t("nav.variantes")}</span>
                  <span className="n">
                    {data.variants.length} · {data.outdated}{" "}
                    {t(data.outdated === 1 ? "dashboard.variants.outdated.one" : "dashboard.variants.outdated.other")}
                  </span>
                  <Link href="/app/variantes">{t("dashboard.variants.seeAll")}</Link>
                </div>
                <div>
                  {data.variants.length ? (
                    data.variants.map((v) => <VariantRow key={v.nm} v={v} />)
                  ) : (
                    <div className="db-fine" style={{ padding: "12px 0" }}>
                      {t("dashboard.variants.emptyRow")}
                      <Link href="/app/variantes">{t("dashboard.variants.createFirst")}</Link>
                    </div>
                  )}
                </div>
              </section>

              <div className="db-side">
                <section className="db-cell db-s" data-screen-label="dashboard-salud">
                  <div className="db-ch">
                    <span className="t-overline">{t("dashboard.health.overline")}</span>
                    <span className="n">{t("dashboard.health.n")}</span>
                  </div>
                  {data.findings.length ? (
                    data.findings.map((h) => (
                      <Link key={h.anchor} className="db-srow" href={`/app/master#${h.anchor}`}>
                        <span className="k">{h.k}</span>
                        {h.text}
                        <span className="go">→</span>
                      </Link>
                    ))
                  ) : (
                    <div className="db-fine">{t("dashboard.health.clear")}</div>
                  )}
                  <div className="db-fine">{t("dashboard.health.fine")}</div>
                </section>

                {data.pendingStaging > 0 ? (
                  <section className="db-cell db-s" data-screen-label="dashboard-staging">
                    <Link className="db-stg" href="/app/staging">
                      <span className="k t-accent">{data.pendingStaging}</span>
                      <span className="tx">{t("dashboard.staging.pending")}</span>
                      <span className="go">{t("dashboard.staging.review")}</span>
                    </Link>
                  </section>
                ) : null}
              </div>

              <section className="db-cell db-f" data-screen-label="dashboard-fuentes">
                {data.sources.length ? (
                  data.sources.map((s) => (
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
                  ))
                ) : (
                  <div className="db-fcell">
                    <span className="nm">{t("dashboard.sources.emptyName")}</span>
                    <div className="facts">{t("dashboard.sources.emptyFacts")}</div>
                    <Link className="new" href="/app/importar">
                      {t("dashboard.sources.emptyCta")}
                    </Link>
                  </div>
                )}
              </section>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
