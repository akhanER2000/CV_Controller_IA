"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { supabaseEnabled } from "@/lib/supabase/config";
import "./master.css";

/* ============================================================================
   Master — porte de corpus-design/04-pantallas/master.html
   (ver docs/spec/pantallas/master.md). MURO: NO monta la aurora.
   Es el registro canónico completo — un editor, no un formulario. Se edita
   inline (contenteditable) y cada item recuerda su origen (fragmento expandible).

   ★ CABLEADO A DATOS REALES. En modo Supabase los grupos salen de /api/master
   (profile_items del usuario, RLS por auth.uid()); cada item muestra su origen y
   su fragmento de evidencia REAL. Una cuenta nueva ⇒ estado vacío. La maqueta
   (persona Diego Gatica) SOLO se usa como fallback del modo local sin Supabase.

   Decisiones de fidelidad conservadas:
   - Muro ⇒ sin <Aurora>. El fondo es var(--bg) opaco (.c-wall).
   - Los conteos NO se hardcodean: `total` y `sourceCount` se DERIVAN de los datos.
   - Interacciones REALES con estado React: buscar, filtrar, plegar grupos,
     expandir origen, edición inline → "editado por ti".
   - El estado vacío deriva de los datos (total === 0) y conserva su markup.
   ============================================================================ */

type Ver = "ok" | "partial" | "none";
type FilterKey = "all" | "sin-cifra" | "sin-evidencia" | "sin-fechas";

/* ── Vista unificada: la pintan los mismos helpers, venga de la demo o de la DB ─ */
interface VBullet {
  tx: string;
  num: boolean;
  origin: string;
  evidence: string | null;
  nudge?: string;
}
interface VRole {
  tt: string;
  org: string;
  dates: string;
  origin: string;
  evidence: string | null;
  warn?: string;
  bullets: VBullet[];
}
interface VSkill {
  n: string;
  ver: Ver;
  ev: ReactNode;
  ask?: string;
}
interface VRow {
  tx: string;
  m: string;
}
interface VSummary {
  text: string;
  origin: string;
  evidence: string | null;
}
interface MasterView {
  summary: VSummary | null;
  roles: VRole[];
  skills: VSkill[];
  projects: VRow[];
  education: VRow[];
}

const MANUAL_LABEL = "escrito por ti";

function originLabel(origin: string): string {
  switch (origin) {
    case "manual":
      return MANUAL_LABEL;
    case "api":
      return "github";
    case "ai_rephrased":
      return "reformulado por IA";
    case "ai_translated":
      return "traducido por IA";
    case "extracted":
    default:
      return "texto pegado";
  }
}

const hasDigit = (s: string) => /\d/.test(s);
const str = (o: Record<string, unknown>, k: string) => String(o[k] ?? "");

/* ── Datos del MODO LOCAL (persona Diego Gatica). Nunca se usan con Supabase. ── */
type SrcKey = "tx" | "gh" | "web" | "cv" | "q" | "man";
const SRC: Record<SrcKey, string> = {
  tx: "texto pegado",
  gh: "github",
  web: "dgatica.cl",
  cv: "CV_2023.pdf",
  q: "cuestionario",
  man: MANUAL_LABEL,
};
interface DemoBullet { tx: string; src: SrcKey; num: boolean; nudge?: string }
interface DemoRole { tt: string; org: string; dates: string; src: SrcKey; warn?: string; ev: string; bullets: DemoBullet[] }

const DEMO_EXP: DemoRole[] = [
  {
    tt: "Backend Developer", org: "Altiplano Pagos SpA · Santiago", dates: "mar 2022 – hoy", src: "tx",
    ev: "«Los últimos tres años trabajé en Altiplano Pagos como backend developer…»",
    bullets: [
      { tx: "A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias).", src: "tx", num: true },
      { tx: "Escribí la librería interna de idempotencia (Go), adoptada por otros equipos.", src: "gh", num: false, nudge: "¿cuántos equipos?" },
      { tx: "Mantengo los pipelines de CI/CD del equipo (GitHub Actions).", src: "gh", num: false, nudge: "¿cuántos deploys/semana?" },
      { tx: "Documenté la API pública de conciliación (OpenAPI 3.1).", src: "gh", num: false },
      { tx: "Mentoreo a 2 desarrolladores junior del equipo de pagos.", src: "q", num: true },
      { tx: "Turno de soporte (on-call) una semana al mes.", src: "q", num: true },
    ],
  },
  {
    tt: "Backend Developer — equipo Checkout", org: "Rayén Retail S.A. · Santiago", dates: "ene 2020 – feb 2022", src: "cv",
    ev: "Fusionado por ti desde CV_2023.pdf y texto pegado (staging, 12 jul).",
    bullets: [
      { tx: "Desarrollé y mantuve APIs del checkout (Node.js, PostgreSQL).", src: "cv", num: false, nudge: "¿qué volumen movían?" },
      { tx: "Implementé el flujo de cupones y descuentos del checkout.", src: "cv", num: false },
      { tx: "Atendí incidentes de producción durante cyber days.", src: "q", num: false, nudge: "¿cuántos peaks? ¿qué tráfico?" },
      { tx: "Automaticé reportes de ventas diarios para operaciones.", src: "cv", num: false },
    ],
  },
  {
    tt: "Desarrollador freelance", org: "Independiente · Santiago", dates: "2019 – …", warn: "falta fecha de término", src: "q",
    ev: "«Antes de Rayén trabajé por mi cuenta un año…» — el año de término no quedó registrado.",
    bullets: [
      { tx: "Construí sitios y APIs para 4 pymes chilenas.", src: "q", num: true },
      { tx: "Sistema de reservas para un centro deportivo (Django), en producción desde 2020.", src: "web", num: true },
      { tx: "Administré hosting y dominios de clientes.", src: "cv", num: false },
    ],
  },
  {
    tt: "Práctica profesional — Área TI", org: "Universidad Andrés Bello · Santiago", dates: "2018 – 2019", src: "cv",
    ev: "«Práctica profesional, Dirección de TI UNAB, soporte a sistemas académicos.»",
    bullets: [
      { tx: "Soporte a la plataforma de matrícula en periodos peak.", src: "cv", num: false },
      { tx: "Scripts de migración de datos de alumnos (Python).", src: "cv", num: false },
      { tx: "Documenté procesos del área para nuevos practicantes.", src: "cv", num: false },
    ],
  },
];

const DEMO_SK: VSkill[] = [
  { n: "Go", ver: "ok", ev: "412 KB · 3 repos · citada en 2 viñetas de experiencia" },
  { n: "Python", ver: "ok", ev: "188 KB · 2 repos · scripts de migración (práctica UNAB)" },
  { n: "PostgreSQL", ver: "ok", ev: "APIs del checkout (Rayén) · docker-compose en 2 repos" },
  { n: "Node.js", ver: "ok", ev: "CV_2023 · checkout de Rayén, 2 años" },
  { n: "SQL", ver: "ok", ev: "texto pegado · consultas en 3 repos" },
  { n: "TypeScript", ver: "ok", ev: "96 KB · 2 repos (front del portfolio)" },
  { n: "Docker", ver: "ok", ev: "Dockerfile en 5 repos" },
  { n: "Kubernetes", ver: "partial", ev: "tu texto: «lo usamos pero no lo administraba yo» — nivel declarado: usuario" },
  { n: "Kafka", ver: "none", ev: "No aparece en ninguna viñeta, ni en tus repos, ni en tu portfolio.", ask: "¿Dónde lo usaste?" },
  { n: "AWS", ver: "none", ev: "Un README la menciona; ninguna viñeta ni proyecto la usa.", ask: "¿Dónde la usaste?" },
];

const DEMO_PJ: VRow[] = [
  { tx: "idempotency-go — librería open source de idempotencia en Go", m: "github · 214 KB · 41 commits" },
  { tx: "reservas-club — sistema de reservas en Django", m: "dgatica.cl · en producción" },
  { tx: "scraper-sii — CLI de series de tipo de cambio", m: "github · Python · 67 KB" },
  { tx: "dgatica.cl — portfolio con 6 casos documentados", m: "Next.js" },
];

const DEMO_ED: VRow[] = [
  { tx: "Ingeniería Civil en Computación e Informática — Universidad Andrés Bello", m: "2014 – 2019" },
  { tx: "Diplomado en Ingeniería de Datos — Pontificia Universidad Católica", m: "2022" },
  { tx: "Inglés B2 — autoevaluación", m: "sin certificado" },
];

function buildDemoView(): MasterView {
  return {
    summary: {
      text: "Backend developer con 6 años construyendo servicios de pago y e-commerce en Go y Node.js. A cargo del servicio de conciliación de Altiplano Pagos (~40.000 transacciones diarias).",
      origin: MANUAL_LABEL,
      evidence: "escrito por ti (onboarding) — el origen manual es el más verificable de todos.",
    },
    roles: DEMO_EXP.map((e) => ({
      tt: e.tt, org: e.org, dates: e.dates, origin: SRC[e.src], evidence: e.ev, warn: e.warn,
      bullets: e.bullets.map((b) => ({ tx: b.tx, num: b.num, origin: SRC[b.src], evidence: null, nudge: b.nudge })),
    })),
    skills: DEMO_SK,
    projects: DEMO_PJ,
    education: DEMO_ED,
  };
}

/* ── Vista REAL: profile_items → MasterView. ─────────────────────────────────── */
interface ApiItem {
  id: string;
  kind: string;
  parentId: string | null;
  data: Record<string, unknown>;
  origin: string;
  evidenceSnippet: string | null;
  evidenceVerified: boolean;
}

function buildRealView(items: ApiItem[]): MasterView {
  const by = (k: string) => items.filter((i) => i.kind === k);
  const summaryItem = by("summary")[0];
  const summary: VSummary | null = summaryItem
    ? { text: str(summaryItem.data, "text"), origin: originLabel(summaryItem.origin), evidence: summaryItem.evidenceSnippet }
    : null;

  const roles: VRole[] = by("work").map((w) => {
    const dates = str(w.data, "dates");
    return {
      tt: str(w.data, "title") || "(rol sin título)",
      org: [str(w.data, "company"), str(w.data, "location")].filter(Boolean).join(" · "),
      dates,
      origin: originLabel(w.origin),
      evidence: w.evidenceSnippet,
      warn: dates.trim() ? undefined : "falta fecha",
      bullets: items
        .filter((b) => b.kind === "bullet" && b.parentId === w.id)
        .map((b) => {
          const tx = str(b.data, "text");
          return { tx, num: hasDigit(tx), origin: originLabel(b.origin), evidence: b.evidenceSnippet };
        }),
    };
  });

  const skills: VSkill[] = by("skill").map((s) => {
    const group = str(s.data, "group");
    const list = str(s.data, "items");
    return {
      n: group || list.split(",")[0]?.trim() || "Skill",
      ver: s.evidenceVerified ? "ok" : "none",
      ev: s.evidenceSnippet || list || "sin evidencia registrada",
      ask: s.evidenceVerified ? undefined : "¿Dónde lo usaste?",
    };
  });

  const projects: VRow[] = by("project").map((p) => ({
    tx: [str(p.data, "name"), str(p.data, "description")].filter(Boolean).join(" — "),
    m: [originLabel(p.origin), str(p.data, "url")].filter(Boolean).join(" · "),
  }));

  const education: VRow[] = by("education").map((e) => ({
    tx: [str(e.data, "degree"), str(e.data, "institution")].filter(Boolean).join(" — "),
    m: str(e.data, "dates") || originLabel(e.origin),
  }));

  return { summary, roles, skills, projects, education };
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "todo" },
  { key: "sin-cifra", label: "sin cifra" },
  { key: "sin-evidencia", label: "⚠ sin evidencia" },
  { key: "sin-fechas", label: "sin fechas" },
];

/* Envuelve cada cifra visible en la voz mono `t-num`. */
function wrapNums(text: string): ReactNode[] {
  return text.split(/(\d[\d.,%~]*)/g).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="t-num">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function MasterScreen() {
  const [view, setView] = useState<MasterView | null>(supabaseEnabled ? null : buildDemoView());
  const [loading, setLoading] = useState(supabaseEnabled);

  // Estado real de producto.
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openFrags, setOpenFrags] = useState<ReadonlySet<string>>(new Set());
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());

  const mainRef = useRef<HTMLElement>(null);
  const groupsRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLSpanElement>(null);

  // Carga real (modo Supabase).
  useEffect(() => {
    if (!supabaseEnabled) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/master");
        const data = await res.json();
        if (!active) return;
        setView(buildRealView((data.items ?? []) as ApiItem[]));
      } catch {
        if (active) setView({ summary: null, roles: [], skills: [], projects: [], education: [] });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const v = view;
  const totalBullets = v ? v.roles.reduce((a, e) => a + e.bullets.length, 0) : 0;
  const total = v
    ? (v.summary ? 1 : 0) + v.roles.length + totalBullets + v.skills.length + v.projects.length + v.education.length
    : 0;

  // «fuentes» = orígenes externos distintos (el manual no cuenta: es la ausencia
  // de fuente, "el más verificable de todos").
  const sourceCount = useMemo(() => {
    if (!v) return 0;
    const s = new Set<string>();
    const add = (o: string) => {
      if (o && o !== MANUAL_LABEL) s.add(o);
    };
    if (v.summary) add(v.summary.origin);
    v.roles.forEach((e) => {
      add(e.origin);
      e.bullets.forEach((b) => add(b.origin));
    });
    return s.size;
  }, [v]);

  const isEmpty = !loading && total === 0;
  const msNText = loading ? "leyendo…" : isEmpty ? "0 items" : `${total} items · ${sourceCount} fuente${sourceCount === 1 ? "" : "s"}`;

  const toggleIn = (
    setter: (fn: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void,
    id: string,
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleFrag = (id: string) => toggleIn(setOpenFrags, id);
  const toggleFold = (id: string) => toggleIn(setFolded, id);
  const markTouched = (id: string) =>
    setTouched((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  // Movimiento del sistema: escalonado + dibujo de hairlines, cuando el runtime
  // vanilla exista Y haya datos montados (se re-ejecuta al llegar la vista).
  useEffect(() => {
    if (!v || total === 0) return;
    let tries = 0;
    const id = window.setInterval(() => {
      const M = window.CorpusMotion;
      if (!M) {
        if (++tries > 100) window.clearInterval(id);
        return;
      }
      window.clearInterval(id);
      const groups = groupsRef.current;
      if (groups) {
        M.stagger(groups, {
          step: 40,
          cap: 24,
          items: groups.querySelectorAll(".ms-card,.ms-sk,.ms-row"),
        });
      }
      M.boot(mainRef.current ?? document);
    }, 30);
    return () => window.clearInterval(id);
  }, [v, total]);

  // Deep-link por hash: /app/master#sin-cifra activa el filtro a los 60 ms.
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (FILTERS.some((f) => f.key === h)) {
      const t = window.setTimeout(() => setFilter(h as FilterKey), 60);
      return () => window.clearTimeout(t);
    }
  }, []);

  // Búsqueda + filtros: réplica del applyFilter() del HTML. Se re-aplica cuando
  // cambian query/filtro O cuando llegan los datos (v).
  useLayoutEffect(() => {
    const groups = groupsRef.current;
    if (!groups) return;
    const q = query.toLowerCase();
    groups.querySelectorAll<HTMLElement>("[data-item]").forEach((it) => {
      let ok = true;
      if (q) ok = (it.textContent || "").toLowerCase().includes(q);
      if (ok && filter === "sin-cifra") ok = it.dataset.num === "false";
      if (ok && filter === "sin-evidencia") ok = it.dataset.ver === "none";
      if (ok && filter === "sin-fechas") ok = !!it.querySelector('[data-warn="fechas"]');
      it.style.display = ok ? "" : "none";
    });
    groups.querySelectorAll<HTMLElement>(".ms-g").forEach((g) => {
      const any = [...g.querySelectorAll<HTMLElement>("[data-item]")].some(
        (i) => i.style.display !== "none",
      );
      g.style.display = any ? "" : "none";
    });
    if (liveRef.current) {
      const n = [...groups.querySelectorAll<HTMLElement>("[data-item]")].filter(
        (i) => i.style.display !== "none",
      ).length;
      liveRef.current.textContent = query || filter !== "all" ? `${n} items coinciden` : "";
    }
  }, [query, filter, v]);

  const handleAdd = () =>
    window.alert("En producto: fila nueva editable al foco, origen: manual. (Mock)");

  // Botón de origen expandible (foco de teclado + aria-expanded).
  const srcButton = (id: string, label: string): ReactNode => {
    const isTouched = touched.has(id);
    return (
      <button
        type="button"
        className="ms-src"
        aria-expanded={openFrags.has(id)}
        aria-controls={`${id}-frag`}
        style={isTouched ? { opacity: 1, color: "var(--accent-text)" } : undefined}
        onClick={() => toggleFrag(id)}
      >
        {isTouched ? "origen: editado por ti · ahora ▾" : `origen: ${label} ▾`}
      </button>
    );
  };

  const fragClass = (id: string) => `ms-frag${openFrags.has(id) ? " open" : ""}`;
  const fragmentText = (origin: string, evidence: string | null): ReactNode => {
    if (evidence) return evidence;
    if (origin === MANUAL_LABEL) return "escrito por ti — el origen manual es el más verificable de todos.";
    return "Sin fragmento de origen registrado — revísalo.";
  };

  const nudge = (b: VBullet): ReactNode => {
    if (b.num) return null;
    return (
      <span className={`ms-nudge${b.nudge ? " push" : ""}`}>
        {b.nudge ? `sin cifra — ${b.nudge}` : "sin cifra"}
      </span>
    );
  };

  const groupSection = (id: string, title: string, cnt: string, body: ReactNode): ReactNode => {
    const isFolded = folded.has(id);
    return (
      <section className={`ms-g${isFolded ? " folded" : ""}`} id={id} key={id}>
        <div className="ms-gh">
          <span className="t-overline">{title}</span>
          <span className="cnt">{cnt}</span>
          <button type="button" className="fold" data-fold aria-expanded={!isFolded} onClick={() => toggleFold(id)}>
            {isFolded ? "desplegar" : "plegar"}
          </button>
        </div>
        <hr className="c-divider" />
        <div className="ms-body">{body}</div>
      </section>
    );
  };

  const roleCard = (e: VRole, i: number): ReactNode => {
    const headerId = `it-exp-${i}`;
    return (
      <article className="c-card ms-card" data-item key={headerId}>
        <div className="ms-eh">
          <span
            className="tt"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            role="textbox"
            aria-label={`Editar título del rol: ${e.tt}`}
            onBlur={() => markTouched(headerId)}
          >
            {e.tt}
          </span>
          <span className="org">
            {e.org}
            {e.dates ? ` · ${e.dates}` : ""}
          </span>
          {e.warn ? (
            <span className="warn" data-warn="fechas">
              ⚠ {e.warn}
            </span>
          ) : null}
          <span className="meta">{srcButton(headerId, e.origin)}</span>
        </div>
        <div className={fragClass(headerId)} id={`${headerId}-frag`} data-frag={headerId}>
          {fragmentText(e.origin, e.evidence)}
        </div>
        {e.bullets.map((b, j) => {
          const bid = `it-exp-${i}-b-${j}`;
          return (
            <Fragment key={bid}>
              <div className="ms-b" data-item data-num={String(b.num)}>
                <span
                  className="tx"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  role="textbox"
                  aria-label="Editar viñeta"
                  onBlur={() => markTouched(bid)}
                >
                  {wrapNums(b.tx)}
                </span>
                {nudge(b)}
                {srcButton(bid, b.origin)}
              </div>
              <div className={fragClass(bid)} id={`${bid}-frag`} data-frag={bid}>
                {fragmentText(b.origin, b.evidence)}
              </div>
            </Fragment>
          );
        })}
      </article>
    );
  };

  const skillCard = (s: VSkill, i: number): ReactNode => (
    <div className="ms-sk" data-item data-ver={s.ver} key={`sk-${i}`}>
      <div className="top">
        <span className="nm">{s.n}</span>
        <span className={`c-ver c-ver--${s.ver}`}>
          {s.ver === "ok" ? "verificado" : s.ver === "partial" ? "parcial" : "sin evidencia"}
        </span>
      </div>
      <div className="ev">{s.ev}</div>
      {s.ask ? (
        <>
          <hr />
          <div className="ask">
            {s.ask} <button type="button">responder — quedará como origen: tú</button>
          </div>
        </>
      ) : null}
    </div>
  );

  const denseRow = (r: VRow, key: string): ReactNode => (
    <div className="ms-row" data-item key={key}>
      <span contentEditable suppressContentEditableWarning spellCheck={false} role="textbox" aria-label="Editar elemento">
        {r.tx}
      </span>
      <span className="m">{r.m}</span>
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
            <Link href="/app">Panel</Link>
            <Link href="/app/master" aria-current="page">
              Master
            </Link>
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

      <div className="ms-sub" data-screen-label="master-toolbar">
        <div className="c-container">
          <input
            className="c-input"
            id="q"
            aria-label="Buscar en tu registro"
            placeholder="Buscar en tu registro… (título, viñeta, skill)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="ms-f" role="group" aria-label="Filtros">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" data-f={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <span className="n" id="msN" aria-live="polite">
            {msNText}
          </span>
        </div>
      </div>

      <main className="ms-main c-wall" data-screen-label="master" ref={mainRef}>
        <div className="c-container" id="body">
          <div
            style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}
          >
            <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-ui)", maxWidth: "64ch" }}>
              Tu archivo completo — aquí cabe todo tu historial aunque cada variante muestre una parte.{" "}
              <b style={{ color: "var(--text)", fontWeight: 500 }}>Haz clic en cualquier texto y edítalo ahí mismo</b>; cada item
              recuerda de dónde salió.
            </p>
            <button type="button" className="c-btn" id="btnAdd" onClick={handleAdd}>
              + Añadir item manual
            </button>
          </div>

          <div id="groups" ref={groupsRef}>
            {loading || !v || isEmpty ? null : (
              <>
                {v.summary
                  ? groupSection(
                      "resumen",
                      "Resumen",
                      "1 item",
                      <div className="c-card ms-card">
                        <div className="ms-b" data-item>
                          <span
                            className="tx"
                            contentEditable
                            suppressContentEditableWarning
                            spellCheck={false}
                            role="textbox"
                            aria-label="Editar resumen"
                            onBlur={() => markTouched("it-resumen")}
                          >
                            {wrapNums(v.summary.text)}
                          </span>
                          {srcButton("it-resumen", v.summary.origin)}
                        </div>
                        <div className={fragClass("it-resumen")} id="it-resumen-frag" data-frag="it-resumen">
                          {fragmentText(v.summary.origin, v.summary.evidence)}
                        </div>
                      </div>,
                    )
                  : null}

                {v.roles.length > 0 &&
                  groupSection(
                    "experiencia",
                    "Experiencia",
                    `${v.roles.length} rol${v.roles.length === 1 ? "" : "es"} · ${totalBullets} viñeta${totalBullets === 1 ? "" : "s"}`,
                    <>
                      {v.roles.map((e, i) => roleCard(e, i))}
                      <button type="button" className="ms-add">
                        + añadir rol
                      </button>
                    </>,
                  )}

                {v.skills.length > 0 &&
                  groupSection(
                    "skills",
                    "Skills — con su evidencia",
                    `${v.skills.length} items`,
                    <>
                      <div className="ms-skills">{v.skills.map((s, i) => skillCard(s, i))}</div>
                      <button type="button" className="ms-add">
                        + añadir skill (quedará como origen: tú)
                      </button>
                    </>,
                  )}

                {v.projects.length > 0 &&
                  groupSection(
                    "proyectos",
                    "Proyectos",
                    `${v.projects.length} items — cada variante elige los suyos`,
                    <div className="ms-rows">{v.projects.map((p, i) => denseRow(p, `pj-${i}`))}</div>,
                  )}

                {v.education.length > 0 &&
                  groupSection(
                    "educacion",
                    "Educación y certificaciones",
                    `${v.education.length} items`,
                    <div className="ms-rows">{v.education.map((d, i) => denseRow(d, `ed-${i}`))}</div>,
                  )}
              </>
            )}
          </div>

          {loading ? (
            <p className="t-overline" style={{ color: "var(--text-muted)", marginTop: "24px" }}>
              Leyendo tu registro…
            </p>
          ) : null}

          <span ref={liveRef} className="ms-sr" aria-live="polite" />

          <div className="ms-empty" id="msEmpty" hidden={!isEmpty}>
            <span className="t-overline">Master vacío</span>
            <h2 style={{ marginTop: "14px" }}>Aún no hay registro.</h2>
            <p>Vuélcalo con IA en 5 minutos, o escríbelo de cero con la IA apagada.</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "24px" }}>
              <Link className="c-btn c-btn--patina" href="/app/importar">
                Volcar lo que tengo
              </Link>
              <Link className="c-btn" href="/app/onboarding">
                Escribir de cero
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
