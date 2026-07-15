"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Aurora } from "@/components/Aurora";
import { useBoot } from "@/lib/corpus/runtime";
import { supabaseEnabled } from "@/lib/supabase/config";
import "./dashboard.css";

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
function rel(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const d = Math.max(0, Date.now() - then);
  const day = 86_400_000;
  if (d < 60_000) return "recién";
  if (d < 3_600_000) return `hace ${Math.round(d / 60_000)} min`;
  if (d < day) return `hace ${Math.round(d / 3_600_000)} h`;
  if (d < 7 * day) return `hace ${Math.round(d / day)} día${Math.round(d / day) === 1 ? "" : "s"}`;
  if (d < 30 * day) return `hace ${Math.round(d / (7 * day))} sem`;
  if (d < 365 * day) return `hace ${Math.round(d / (30 * day))} mes${Math.round(d / (30 * day)) === 1 ? "" : "es"}`;
  return `hace ${Math.round(d / (365 * day))} año${Math.round(d / (365 * day)) === 1 ? "" : "s"}`;
}

const kindLabel = (kind: string): string =>
  ({ paste: "texto pegado", pdf: "PDF", docx: "DOCX", image: "captura", url: "portfolio", github: "GitHub", manual: "manual" } as Record<string, string>)[kind] ?? kind;

interface MasterItemLite {
  kind: string;
  data: Record<string, unknown>;
  evidenceVerified: boolean;
}

/** Hallazgos de salud DERIVADOS de tus propios items — nada inventado. */
function deriveFindings(items: MasterItemLite[]): Finding[] {
  const str = (o: Record<string, unknown>, k: string) => String(o[k] ?? "");
  const noNum = items.filter((i) => i.kind === "bullet" && !/\d/.test(str(i.data, "text"))).length;
  const noDates = items.filter((i) => i.kind === "work" && !str(i.data, "dates").trim()).length;
  const noEv = items.filter((i) => i.kind === "skill" && !i.evidenceVerified).length;
  const out: Finding[] = [];
  if (noNum) out.push({ k: String(noNum), text: `viñeta${noNum === 1 ? "" : "s"} sin ninguna cifra — ¿cuánto? ¿cuántos? ¿en cuánto tiempo?`, anchor: "sin-cifra" });
  if (noDates) out.push({ k: String(noDates), text: `rol${noDates === 1 ? "" : "es"} sin fechas — un vacío que el reclutador nota`, anchor: "sin-fechas" });
  if (noEv) out.push({ k: String(noEv), text: `skill${noEv === 1 ? "" : "s"} sin evidencia — respáldala o quítala`, anchor: "sin-evidencia" });
  return out;
}

/* Fila de una variante. Enlace estirado (navega a variantes) + botón PDF hermano
   por encima (descarga sin entrar). Auto-placement del grid: nm→pdf→st→obj. */
function VariantRow({ v }: { v: VariantView }) {
  return (
    <div className="db-vrow" style={{ position: "relative" }}>
      <Link
        href="/app/variantes"
        aria-label={`${v.nm} — objetivo: ${v.obj}`}
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      />
      <span className="nm">
        {v.outdated ? <span className="c-pulse-dot" title="desactualizada" /> : null}
        {v.nm}
      </span>
      <button
        type="button"
        className="pdf"
        title="Descargar el PDF sin entrar"
        style={{ position: "relative", zIndex: 1 }}
        onClick={() => {
          /* PDF de la variante: pendiente del render por-variante. */
        }}
      >
        PDF ↓
      </button>
      <span className="st">
        {v.outdated ? <span className="old">desactualizada · el master cambió</span> : "al día"}
        <br />
        {v.touch}
      </span>
      <span className="obj">objetivo: {v.obj}</span>
    </div>
  );
}

export function DashboardScreen() {
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
          obj: x.targetTitle || "sin objetivo definido",
          touch: `tocada ${rel(x.updatedAt)}`,
          outdated: x.outdated,
        }));
        const sources = ((s.sources ?? []) as { kind: string; originalName: string | null; sourceUrl: string | null; status: string; rawTextLength: number; createdAt: string }[]).map((x) => ({
          nm: x.originalName || x.sourceUrl || kindLabel(x.kind),
          factsLines: [`${kindLabel(x.kind)} · ${x.rawTextLength.toLocaleString("es-CL")} caracteres`, `leída ${rel(x.createdAt)}`],
          quietText: x.status === "extracted" ? "extraída — revisa el staging" : "fuente estática",
        }));
        setData({
          masterItems: summary.masterItems ?? items.length,
          variants,
          outdated: summary.outdatedVariants ?? variants.filter((x) => x.outdated).length,
          sources,
          findings: deriveFindings(items),
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
  }, []);

  const isEmpty = !!data && data.masterItems === 0 && data.variants.length === 0;

  const suffix = data ? ` · master: ${data.masterItems} items · ${data.sources.length} fuentes` : "";
  // SSR y primer render: fallback fijo. En cliente lo reescribe con la fecha real.
  const [dateStr, setDateStr] = useState("Panel");

  const bootRef = useBoot<HTMLElement>();
  const emptyRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!data) return;
    try {
      const d = new Date();
      const f = d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
      setDateStr(f.charAt(0).toUpperCase() + f.slice(1) + suffix);
    } catch {
      setDateStr(`Panel${suffix}`);
    }
  }, [suffix, data]);

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
            Panel
          </Link>
          <Link href="/app/master">Master</Link>
          <Link href="/app/variantes">Variantes</Link>
          <Link href="/app/fuentes">Fuentes</Link>
        </nav>
        <div className="hd-right">
          <Link href="/app/ajustes" className="hd-nav" style={{ display: "inline-flex" }}>
            <span style={{ font: "500 var(--fs-ui)/1 var(--font-sans)", color: "var(--text-muted)", padding: "9px 12px" }}>
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
  );

  // Mientras carga (modo Supabase): muro neutro, sin aurora, para no parpadear.
  if (loading || !data) {
    return (
      <div className="c-page">
        {header}
        <main className="db-main c-wall" data-screen-label="dashboard-cargando">
          <div className="c-container">
            <div className="db-strip">
              <span className="t-overline">Leyendo tu registro…</span>
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
                <Link className="c-btn c-btn--quiet" href="/app/variantes">
                  Adaptar a un aviso
                </Link>
                <Link className="c-btn c-btn--patina" href="/app/variantes">
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
                    {data.variants.length} · {data.outdated} desactualizada{data.outdated === 1 ? "" : "s"}
                  </span>
                  <Link href="/app/variantes">ver todas →</Link>
                </div>
                <div>
                  {data.variants.length ? (
                    data.variants.map((v) => <VariantRow key={v.nm} v={v} />)
                  ) : (
                    <div className="db-fine" style={{ padding: "12px 0" }}>
                      Aún no hay variantes. <Link href="/app/variantes">Crea la primera →</Link>
                    </div>
                  )}
                </div>
              </section>

              <div className="db-side">
                <section className="db-cell db-s" data-screen-label="dashboard-salud">
                  <div className="db-ch">
                    <span className="t-overline">Salud del master</span>
                    <span className="n">sin score — cosas concretas</span>
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
                    <div className="db-fine">Nada que señalar. El silencio es la señal.</div>
                  )}
                  <div className="db-fine">Lo que está bien no aparece aquí. Silencio = en orden.</div>
                </section>

                {data.pendingStaging > 0 ? (
                  <section className="db-cell db-s" data-screen-label="dashboard-staging">
                    <Link className="db-stg" href="/app/staging">
                      <span className="k t-accent">{data.pendingStaging}</span>
                      <span className="tx">items de la ingesta esperan tu decisión</span>
                      <span className="go">revisar →</span>
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
                    <span className="nm">Sin fuentes conectadas</span>
                    <div className="facts">
                      Vuelca material en Importar y quedará registrado aquí, con lo que aportó cada uno.
                    </div>
                    <Link className="new" href="/app/importar">
                      Volcar lo que tengo →
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
