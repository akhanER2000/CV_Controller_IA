"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuroraTune, AURORA_HOJEO, AURORA_TRABAJO } from "@/components/Aurora";
import { useT, useLang } from "@/lib/i18n";
import { useBoot } from "@/lib/corpus/runtime";
import { supabaseEnabled } from "@/lib/supabase/config";
import { Anillo, Area, Barras, Button, Card, Chip, EmptyState, Icono, KpiCard, PanelHeader, type Dato } from "@/components/ui";
import { itemsPorTipo, ultimaActualizacion, variantesPorMes, verificacion, type ItemLite } from "@/components/panel/datos";
import "@/components/panel/panel.css";
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

   Atmósfera (doctrina vigente — ver src/components/Aurora.tsx):
   La aurora NO se monta aquí; la monta una sola vez el shell (app/app/layout).
   Esta pantalla solo declara su INTENSIDAD, y la declara en sus DOS estados:
   - Registro VACÍO (día 1, 0 items) → 0.55. Sala de puertas: el humo entero
     detrás de las dos tarjetas de vidrio (.c-panel).
   - Registro CON items → 0.22. El bento sigue viéndose, la atmósfera se intuye
     entre las celdas y por los márgenes. Antes esta rama era un MURO opaco que
     ni montaba la aurora; eso venía de una landing con scroll y en una app de
     pestañas no se lee como ritmo, se lee como inconsistencia.
   El estado se DERIVA de los datos (masterItems === 0 && sin variantes), no de
   un toggle. La "salud del master" ya no cita hallazgos ficticios: se derivan de
   tus propios items (viñetas sin cifra, roles sin fechas, skills sin evidencia).

   A11y (spec §8): la fila de variante desanida el <button class="pdf"> del enlace.
   Clases db-vrow/nm/obj/st/pdf intactas.
   ============================================================================ */

type VariantView = { id?: string; nm: string; obj: string; touch: string; outdated: boolean; updatedAt?: string };
type SourceView = { nm: string; factsLines: string[]; newText?: string; quietText?: string; createdAt?: string };
type Finding = { k: string; text: string; anchor: string };

interface DashData {
  /** false = maqueta del modo local (sus cifras se rotulan «ejemplo»). */
  real: boolean;
  masterItems: number;
  sourcesCount: number;
  items: ItemLite[];
  variants: VariantView[];
  outdated: number;
  sources: SourceView[];
  findings: Finding[];
  pendingStaging: number;
}

/* ── Maqueta del MODO LOCAL (persona Diego Gatica). Nunca se usa con Supabase. ─ */
const DEMO: DashData = {
  real: false,
  masterItems: 52,
  sourcesCount: 4,
  items: [],
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

/* Fila de una variante reciente. Enlaza directo a su editor (menos clics). */
function FilaVariante({ v }: { v: VariantView }) {
  const t = useT();
  return (
    <li>
      <Link
        className="pn-fila-item"
        href={v.id ? `/app/variantes/${v.id}` : "/app/variantes"}
        aria-label={t("dashboard.variant.aria").replace("{nm}", v.nm).replace("{obj}", v.obj)}
      >
        <span className="pn-fila-ico" aria-hidden="true">
          <Icono nombre="variantes" />
        </span>
        <span className="pn-fila-txt">
          <span className="pn-fila-nm">{v.nm}</span>
          <span className="pn-fila-sub">
            {t("dashboard.variant.target")}
            {v.obj} · {v.touch}
          </span>
        </span>
        {v.outdated ? (
          <Chip tono="brasa">{t("dashboard.variant.outdatedDot")}</Chip>
        ) : (
          <Chip>{t("dashboard.variant.upToDate")}</Chip>
        )}
      </Link>
    </li>
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
        const rawVariants = (v.variants ?? []) as { id: string; name: string; targetTitle: string | null; updatedAt: string; outdated: boolean }[];
        const variants = rawVariants.map((x) => ({
          id: x.id,
          nm: x.name,
          obj: x.targetTitle || t("dashboard.variant.noTarget"),
          touch: t("dashboard.variant.touched").replace("{rel}", rel(x.updatedAt, t)),
          outdated: x.outdated,
          updatedAt: x.updatedAt,
        }));
        const numLocale = lang === "en" ? "en-US" : "es-CL";
        const rawSources = (s.sources ?? []) as { kind: string; originalName: string | null; sourceUrl: string | null; status: string; charsRead: number | null; createdAt: string }[];
        const sources = rawSources.map((x) => ({
          nm: x.originalName || x.sourceUrl || kindLabel(x.kind, t),
          factsLines: [
            // Caracteres leídos solo si la telemetría los midió (charsRead); sin
            // dato no se pinta «0 caracteres», que sería una cifra falsa.
            x.charsRead != null
              ? `${kindLabel(x.kind, t)} · ${x.charsRead.toLocaleString(numLocale)} ${t("dashboard.source.chars")}`
              : kindLabel(x.kind, t),
            t("dashboard.source.read").replace("{rel}", rel(x.createdAt, t)),
          ],
          quietText: x.status === "extracted" ? t("dashboard.source.extracted") : t("dashboard.source.static"),
          createdAt: x.createdAt,
        }));
        setData({
          real: true,
          masterItems: summary.masterItems ?? items.length,
          sourcesCount: summary.sources ?? sources.length,
          items: items.map((i) => ({ kind: i.kind, evidenceVerified: Boolean(i.evidenceVerified) })),
          variants,
          outdated: summary.outdatedVariants ?? variants.filter((x) => x.outdated).length,
          sources,
          findings: deriveFindings(items, t),
          pendingStaging: summary.pendingStaging ?? 0,
        });
      } catch {
        if (active)
          setData({ real: true, masterItems: 0, sourcesCount: 0, items: [], variants: [], outdated: 0, sources: [], findings: [], pendingStaging: 0 });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // Recarga al cambiar de idioma: los strings DERIVADOS del servidor (tocada
    // {rel}, "leída {rel}", nº de caracteres con locale) se formatean con el `t`
    // del closure. `t` cambia de identidad junto con `lang`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const isEmpty = !!data && data.masterItems === 0 && data.variants.length === 0;
  const bootRef = useBoot<HTMLElement>();
  const emptyRef = useRef<HTMLElement>(null);

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

  // Mientras carga: superficie neutra, sin declarar intensidad (no mover el dial
  // dos veces antes de saber en qué estado estamos).
  if (loading || !data) {
    return (
      <main className="pn-pagina" data-screen-label="dashboard-cargando">
        <p className="t-overline" role="status">
          {t("dashboard.loading")}
        </p>
      </main>
    );
  }

  if (isEmpty) {
    /* ═══ VACÍO: día 1. Sin superficie: la aurora respira entera. ═══ */
    return (
      <>
        <AuroraTune strength={AURORA_HOJEO} />
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
      </>
    );
  }

  /* ═══ DENSO: Forja v2. Cada número de esta rama sale de una consulta real
     (ver src/components/panel/datos.ts); en el modo local sin Supabase la
     maqueta va rotulada «ejemplo» en la fuente de cada cifra. ═══ */
  const fu = (k: string) => (data.real ? t(`dashboard.v2.fuente.${k}`) : t("dashboard.v2.fuente.demo"));
  const verif = verificacion(data.items);
  const tipos: Dato[] = itemsPorTipo(data.items).map((x) => {
    const key = `dashboard.v2.tipo.${x.kind}`;
    const etq = t(key);
    return { etiqueta: etq === key ? x.kind : etq, valor: x.n };
  });
  const numLocale = lang === "en" ? "en-US" : "es-CL";
  const conFecha = data.variants.flatMap((x) => (x.updatedAt ? [{ updatedAt: x.updatedAt }] : []));
  const serie: Dato[] = variantesPorMes(conFecha).map((x) => {
    const [y, mo] = x.mes.split("-").map(Number);
    const etiqueta = new Date(Date.UTC(y!, mo! - 1, 15)).toLocaleDateString(numLocale, {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
    return { etiqueta, valor: x.n };
  });
  const ultima = ultimaActualizacion([...data.variants.map((x) => x.updatedAt), ...data.sources.map((x) => x.createdAt)]);
  const pref = t("dashboard.v2.fuentePrefix");

  return (
    <>
      <AuroraTune strength={AURORA_TRABAJO} />
      <main className="pn-pagina db-v2" data-screen-label="dashboard-denso" ref={bootRef}>
        <section className="pn-kpis" aria-label={t("nav.panel")}>
          <KpiCard etiqueta={t("dashboard.v2.kpi.items")} valor={data.masterItems} fuente={fu("master")} icono="master" />
          <KpiCard etiqueta={t("dashboard.v2.kpi.variants")} valor={data.variants.length} fuente={fu("variants")} icono="variantes" />
          {verif ? (
            <KpiCard
              etiqueta={t("dashboard.v2.kpi.verified")}
              valor={verif.pct}
              unidad="%"
              nota={t("dashboard.v2.kpi.verifiedNote").replace("{v}", String(verif.verificados)).replace("{n}", String(verif.total))}
              fuente={fu("evidence")}
              icono="revision"
            />
          ) : null}
          <KpiCard etiqueta={t("dashboard.v2.kpi.sources")} valor={data.sourcesCount} fuente={fu("sources")} icono="fuentes" />
          {ultima ? (
            <KpiCard etiqueta={t("dashboard.v2.kpi.updated")} valor={rel(ultima, t)} fuente={fu("updated")} icono="pulso" />
          ) : null}
        </section>

        <div className="pn-rejilla">
          <Card material="brasa" grande as="section" className="pn-hero pn-c7" aria-labelledby="db-hero-t">
            <p className="pn-over">{t("dashboard.v2.hero.over")}</p>
            <h2 className="pn-big" id="db-hero-t">
              {t("dashboard.v2.hero.title")}
            </h2>
            <p className="pn-sub">{t("dashboard.v2.hero.sub")}</p>
            <div className="pn-fila">
              <Button variante="tinta" icono="mas" href="/app/variantes">
                {t("dashboard.v2.hero.new")}
              </Button>
              <Button variante="tinta" icono="fuentes" href="/app/importar">
                {t("dashboard.v2.hero.import")}
              </Button>
              <Button variante="tinta" icono="revision" href="/app/staging">
                {data.pendingStaging > 0
                  ? t("dashboard.v2.hero.reviewN").replace("{n}", String(data.pendingStaging))
                  : t("dashboard.v2.hero.review")}
              </Button>
            </div>
          </Card>

          <Card material="crema" grande as="section" className="pn-tarjeta pn-c5">
            <PanelHeader titulo={t("dashboard.v2.verif.title")} sub={t("dashboard.v2.verif.sub")} />
            {verif ? (
              <>
                <div className="pn-centro">
                  <Anillo
                    valor={verif.verificados}
                    total={verif.total}
                    titulo={t("dashboard.v2.verif.title")}
                    sub={t("dashboard.v2.verif.center").replace("{v}", String(verif.verificados)).replace("{n}", String(verif.total))}
                    sobre="crema"
                  />
                </div>
                <p className="pn-fuente">
                  {pref}
                  {fu("evidence")}
                </p>
              </>
            ) : (
              <EmptyState titulo={t("dashboard.v2.verif.emptyT")} icono="revision" />
            )}
          </Card>

          <Card grande as="section" className="pn-tarjeta pn-c5">
            <PanelHeader titulo={t("dashboard.v2.tipos.title")} sub={t("dashboard.v2.tipos.sub")} />
            {tipos.length ? (
              <>
                <Barras datos={tipos} titulo={t("dashboard.v2.tipos.chart")} />
                <p className="pn-fuente">
                  {pref}
                  {fu("master")}
                </p>
              </>
            ) : (
              <EmptyState
                titulo={t("dashboard.v2.tipos.emptyT")}
                icono="master"
                accion={
                  <Button variante="grafito" icono="fuentes" href="/app/importar">
                    {t("dashboard.v2.hero.import")}
                  </Button>
                }
              />
            )}
          </Card>

          <Card grande as="section" className="pn-tarjeta pn-c7">
            <PanelHeader
              titulo={t("dashboard.v2.recent.title")}
              meta={String(data.variants.length)}
              acciones={
                <Button variante="fantasma" icono="flecha" href="/app/variantes">
                  {t("dashboard.v2.recent.seeAll")}
                </Button>
              }
            />
            {data.variants.length ? (
              <ul className="pn-lista">
                {data.variants.slice(0, 4).map((v) => (
                  <FilaVariante key={v.id ?? v.nm} v={v} />
                ))}
              </ul>
            ) : (
              <div className="db-fine">
                {t("dashboard.variants.emptyRow")}
                <Link href="/app/variantes">{t("dashboard.variants.createFirst")}</Link>
              </div>
            )}
          </Card>

          <Card grande as="section" className="pn-tarjeta pn-c7">
            <PanelHeader titulo={t("dashboard.v2.serie.title")} sub={t("dashboard.v2.serie.sub")} />
            {serie.length >= 2 ? (
              <>
                <Area datos={serie} titulo={t("dashboard.v2.serie.chart")} />
                <p className="pn-fuente">
                  {pref}
                  {fu("variants")}
                </p>
              </>
            ) : (
              <EmptyState titulo={t("dashboard.v2.serie.emptyT")} texto={t("dashboard.v2.serie.emptyB")} icono="pulso" />
            )}
          </Card>

          <Card grande as="section" className="pn-tarjeta pn-c5">
            <PanelHeader titulo={t("dashboard.health.overline")} sub={t("dashboard.health.n")} />
            {data.findings.length ? (
              <ul className="pn-lista">
                {data.findings.map((h) => (
                  <li key={h.anchor}>
                    <Link className="pn-fila-item" href={`/app/master#${h.anchor}`}>
                      <span className="pn-fila-k">{h.k}</span>
                      <span className="pn-fila-txt">
                        <span className="pn-fila-sub">{h.text}</span>
                      </span>
                      <Icono nombre="flecha" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pn-fuente">{t("dashboard.health.clear")}</p>
            )}
            <p className="pn-fuente">{t("dashboard.health.fine")}</p>
          </Card>

          <Card grande as="section" className="pn-tarjeta pn-c12">
            <PanelHeader
              titulo={t("dashboard.v2.sources.title")}
              meta={String(data.sourcesCount)}
              acciones={
                <Button variante="fantasma" icono="flecha" href="/app/fuentes">
                  {t("dashboard.v2.sources.seeAll")}
                </Button>
              }
            />
            {data.sources.length ? (
              <ul className="pn-lista pn-lista--rejilla">
                {data.sources.slice(0, 6).map((s) => (
                  <li key={s.nm + (s.createdAt ?? "")} className="pn-fila-item">
                    <span className="pn-fila-ico" aria-hidden="true">
                      <Icono nombre="fuentes" />
                    </span>
                    <span className="pn-fila-txt">
                      <span className="pn-fila-nm">{s.nm}</span>
                      {s.factsLines.map((line) => (
                        <span className="pn-fila-sub" key={line}>
                          {line}
                        </span>
                      ))}
                      {s.quietText ? <span className="pn-fila-sub">{s.quietText}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                titulo={t("dashboard.sources.emptyName")}
                texto={t("dashboard.sources.emptyFacts")}
                icono="fuentes"
                accion={
                  <Button variante="brasa" icono="fuentes" href="/app/importar">
                    {t("dashboard.sources.emptyCta")}
                  </Button>
                }
              />
            )}
          </Card>
        </div>
      </main>
    </>
  );
}
