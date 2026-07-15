"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
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

/* ── Vista unificada: la pintan los mismos helpers, venga de la demo o de la DB ─
   `id`/`data` cargan el profile_item REAL (null en la demo local) para que la
   edición inline pueda persistir con PATCH /api/master/[id] { data }. */
interface VBullet {
  id: string | null;
  data: Record<string, unknown>;
  tx: string;
  num: boolean;
  origin: string;
  evidence: string | null;
  nudge?: string;
}
interface VRole {
  id: string | null;
  data: Record<string, unknown>;
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
  id: string | null;
  kind: string;
  data: Record<string, unknown>;
  tx: string;
  m: string;
}
interface VSummary {
  id: string | null;
  data: Record<string, unknown>;
  text: string;
  origin: string;
  evidence: string | null;
}
/* Un enlace editable: la etiqueta es para el humano, la URL es lo que lee el ATS. */
interface VLink {
  label: string;
  url: string;
}
/* Bloque de contacto (basics) editable. Se imprime en el CUERPO del PDF. */
interface VBasics {
  id: string | null;
  data: Record<string, unknown>;
  name: string;
  label: string;
  email: string;
  phone: string;
  location: string;
  links: VLink[];
}
interface MasterView {
  basics: VBasics | null;
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

/* Links crudos de la DB (string[] | {label,url}[]) → lista editable de VLink. */
function toVLinks(raw: unknown): VLink[] {
  if (!Array.isArray(raw)) return [];
  const out: VLink[] = [];
  for (const l of raw) {
    if (typeof l === "string") {
      const url = l.trim();
      if (url) out.push({ label: "", url });
    } else if (l && typeof l === "object") {
      const o = l as Record<string, unknown>;
      const url = String(o.url ?? "").trim();
      if (url) out.push({ label: String(o.label ?? "").trim(), url });
    }
  }
  return out;
}

/* VLink[] → forma compacta para persistir: string si no hay etiqueta, si no {label,url}.
   Descarta enlaces sin URL. Es lo que normalizeLinks (resume.ts) espera. */
function linksToData(links: VLink[]): (string | { label: string; url: string })[] {
  return links
    .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
    .filter((l) => l.url)
    .map((l) => (l.label ? l : l.url));
}

/* VBasics → data del profile_item basics (conserva campos ajenos en .data). */
function buildBasicsData(b: VBasics): Record<string, unknown> {
  return {
    ...b.data,
    name: b.name.trim(),
    label: b.label.trim(),
    email: b.email.trim(),
    phone: b.phone.trim(),
    location: b.location.trim(),
    links: linksToData(b.links),
  };
}

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
  { id: null, kind: "project", data: {}, tx: "idempotency-go — librería open source de idempotencia en Go", m: "github · 214 KB · 41 commits" },
  { id: null, kind: "project", data: {}, tx: "reservas-club — sistema de reservas en Django", m: "dgatica.cl · en producción" },
  { id: null, kind: "project", data: {}, tx: "scraper-sii — CLI de series de tipo de cambio", m: "github · Python · 67 KB" },
  { id: null, kind: "project", data: {}, tx: "dgatica.cl — portfolio con 6 casos documentados", m: "Next.js" },
];

const DEMO_ED: VRow[] = [
  { id: null, kind: "education", data: {}, tx: "Ingeniería Civil en Computación e Informática — Universidad Andrés Bello", m: "2014 – 2019" },
  { id: null, kind: "education", data: {}, tx: "Diplomado en Ingeniería de Datos — Pontificia Universidad Católica", m: "2022" },
  { id: null, kind: "education", data: {}, tx: "Inglés B2 — autoevaluación", m: "sin certificado" },
];

function buildDemoView(): MasterView {
  return {
    basics: {
      id: null,
      data: {},
      name: "Diego Gatica Morales",
      label: "Backend Engineer",
      email: "diego.gatica@ejemplo.cl",
      phone: "+56 9 6123 4567",
      location: "Santiago, Chile (RM)",
      links: [
        { label: "GitHub", url: "github.com/dgatica" },
        { label: "Portfolio", url: "dgatica.cl" },
        { label: "LinkedIn", url: "linkedin.com/in/diego-gatica" },
      ],
    },
    summary: {
      id: null,
      data: {},
      text: "Backend developer con 6 años construyendo servicios de pago y e-commerce en Go y Node.js. A cargo del servicio de conciliación de Altiplano Pagos (~40.000 transacciones diarias).",
      origin: MANUAL_LABEL,
      evidence: "escrito por ti (onboarding) — el origen manual es el más verificable de todos.",
    },
    roles: DEMO_EXP.map((e) => ({
      id: null, data: {},
      tt: e.tt, org: e.org, dates: e.dates, origin: SRC[e.src], evidence: e.ev, warn: e.warn,
      bullets: e.bullets.map((b) => ({ id: null, data: {}, tx: b.tx, num: b.num, origin: SRC[b.src], evidence: null, nudge: b.nudge })),
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

  const basicsItem = by("basics")[0];
  const basics: VBasics | null = basicsItem
    ? {
        id: basicsItem.id,
        data: basicsItem.data,
        name: str(basicsItem.data, "name"),
        label: str(basicsItem.data, "label"),
        email: str(basicsItem.data, "email"),
        phone: str(basicsItem.data, "phone"),
        location: str(basicsItem.data, "location"),
        links: toVLinks(basicsItem.data.links),
      }
    : null;

  const summaryItem = by("summary")[0];
  const summary: VSummary | null = summaryItem
    ? { id: summaryItem.id, data: summaryItem.data, text: str(summaryItem.data, "text"), origin: originLabel(summaryItem.origin), evidence: summaryItem.evidenceSnippet }
    : null;

  const roles: VRole[] = by("work").map((w) => {
    const dates = str(w.data, "dates");
    return {
      id: w.id,
      data: w.data,
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
          return { id: b.id, data: b.data, tx, num: hasDigit(tx), origin: originLabel(b.origin), evidence: b.evidenceSnippet };
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
    id: p.id,
    kind: "project",
    data: p.data,
    tx: [str(p.data, "name"), str(p.data, "description")].filter(Boolean).join(" — "),
    m: [originLabel(p.origin), str(p.data, "url")].filter(Boolean).join(" · "),
  }));

  const education: VRow[] = by("education").map((e) => ({
    id: e.id,
    kind: "education",
    data: e.data,
    tx: [str(e.data, "degree"), str(e.data, "institution")].filter(Boolean).join(" — "),
    m: str(e.data, "dates") || originLabel(e.origin),
  }));

  return { basics, summary, roles, skills, projects, education };
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
  const t = useT();
  const [view, setView] = useState<MasterView | null>(supabaseEnabled ? null : buildDemoView());
  const [loading, setLoading] = useState(supabaseEnabled);

  // Estado real de producto.
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openFrags, setOpenFrags] = useState<ReadonlySet<string>>(new Set());
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [savedNote, setSavedNote] = useState("");

  const mainRef = useRef<HTMLElement>(null);
  const groupsRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLSpanElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fuente de verdad SÍNCRONA de basics (contacto): basics es UN item con varios
  // campos, así que cada edición debe fusionar sobre el último estado, no sobre el
  // del render (o un PATCH pisaría al anterior). El ref siempre trae lo más nuevo.
  const basicsRef = useRef<VBasics | null>(null);

  const noteSaved = useCallback((msg: string) => {
    setSavedNote(msg);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSavedNote(""), 2400);
  }, []);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // Persiste una edición inline: PATCH /api/master/[id] { data }. En modo local
  // (sin Supabase, o item de demo) es solo visual — nunca inventa un guardado.
  const saveEdit = useCallback(
    (id: string | null, data: Record<string, unknown>) => {
      if (!supabaseEnabled) {
        noteSaved(t("master.saved.localEdit"));
        return;
      }
      if (!id) return;
      void (async () => {
        try {
          const res = await fetch(`/api/master/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data }),
          });
          if (!res.ok) throw new Error();
          noteSaved(t("common.saved"));
        } catch {
          noteSaved(t("master.saved.fail"));
        }
      })();
    },
    [noteSaved, t],
  );

  // onBlur/Enter genérico para un texto editable: si cambió, marca origen "editado
  // por ti" y persiste. `build` arma el `data` completo del item desde el texto.
  const commitEdit = useCallback(
    (
      displayId: string,
      dbId: string | null,
      original: string,
      build: (text: string) => Record<string, unknown>,
    ) =>
      (e: React.FocusEvent<HTMLSpanElement>) => {
        const text = (e.currentTarget.textContent ?? "").trim();
        if (!text || text === original.trim()) return;
        setTouched((prev) => (prev.has(displayId) ? prev : new Set(prev).add(displayId)));
        saveEdit(dbId, build(text));
      },
    [saveEdit],
  );

  const editKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }, []);

  // ── Contacto (basics) editable ─────────────────────────────────────────────
  // Persiste el bloque completo (basics es un solo profile_item). En modo local /
  // demo (id null) saveEdit lo deja en "editado (modo local)" sin inventar guardado.
  const persistBasics = useCallback(
    (b: VBasics) => saveEdit(b.id, buildBasicsData(b)),
    [saveEdit],
  );

  // Muta basics sobre el ÚLTIMO estado (basicsRef), refresca la vista y —si se pide—
  // persiste. Devuelve el nuevo basics para encadenar.
  const mutateBasics = useCallback(
    (fn: (b: VBasics) => VBasics, persist: boolean) => {
      const cur = basicsRef.current;
      if (!cur) return;
      const next = fn(cur);
      basicsRef.current = next;
      setView((prev) => (prev && prev.basics ? { ...prev, basics: next } : prev));
      if (persist) persistBasics(next);
    },
    [persistBasics],
  );

  // onBlur de un campo escalar del contacto (nombre, título, email, tel, ciudad).
  const commitBasicsField = useCallback(
    (field: "name" | "label" | "email" | "phone" | "location") =>
      (e: React.FocusEvent<HTMLSpanElement>) => {
        const text = (e.currentTarget.textContent ?? "").trim();
        const cur = basicsRef.current;
        if (!cur || (cur[field] ?? "") === text) return;
        mutateBasics((b) => ({ ...b, [field]: text }), true);
        const tid = `basics-${field}`;
        setTouched((prev) => (prev.has(tid) ? prev : new Set(prev).add(tid)));
      },
    [mutateBasics],
  );

  // Enlaces: editar (sin persistir hasta blur), añadir (fila vacía), quitar (persiste).
  const setLinkField = useCallback(
    (i: number, field: "label" | "url", value: string) =>
      mutateBasics((b) => ({ ...b, links: b.links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)) }), false),
    [mutateBasics],
  );
  const addLink = useCallback(() => mutateBasics((b) => ({ ...b, links: [...b.links, { label: "", url: "" }] }), false), [mutateBasics]);
  const removeLink = useCallback((i: number) => mutateBasics((b) => ({ ...b, links: b.links.filter((_, idx) => idx !== i) }), true), [mutateBasics]);
  const persistBasicsNow = useCallback(() => {
    const b = basicsRef.current;
    if (b) persistBasics(b);
  }, [persistBasics]);

  // "Añadir datos de contacto" cuando la cuenta no tiene item basics: POST /api/master.
  const addBasics = useCallback(() => {
    const empty: VBasics = { id: null, data: {}, name: "", label: "", email: "", phone: "", location: "", links: [] };
    if (!supabaseEnabled) {
      basicsRef.current = empty;
      setView((prev) => (prev ? { ...prev, basics: empty } : prev));
      noteSaved(t("master.saved.contactAddedLocal"));
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/master", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "basics", data: buildBasicsData(empty) }),
        });
        if (!res.ok) throw new Error();
        const { item } = (await res.json()) as { item: { id: string; data: Record<string, unknown> } };
        const d = item.data ?? {};
        const created: VBasics = {
          id: item.id, data: d,
          name: str(d, "name"), label: str(d, "label"), email: str(d, "email"),
          phone: str(d, "phone"), location: str(d, "location"), links: toVLinks(d.links),
        };
        basicsRef.current = created;
        setView((prev) => (prev ? { ...prev, basics: created } : prev));
        noteSaved(t("master.saved.contactAdded"));
      } catch {
        noteSaved(t("master.saved.contactAddFail"));
      }
    })();
  }, [noteSaved, t]);

  // Mantén basicsRef sincronizado cuando la vista se (re)carga.
  useEffect(() => {
    basicsRef.current = view?.basics ?? null;
  }, [view?.basics]);

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
        if (active) setView({ basics: null, summary: null, roles: [], skills: [], projects: [], education: [] });
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
    ? (v.basics ? 1 : 0) + (v.summary ? 1 : 0) + v.roles.length + totalBullets + v.skills.length + v.projects.length + v.education.length
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
  const msNText = loading
    ? t("master.reading")
    : isEmpty
      ? `0 ${t("master.items")}`
      : `${total} ${t("master.items")} · ${sourceCount} ${sourceCount === 1 ? t("master.source") : t("master.sources")}`;

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
      liveRef.current.textContent =
        query || filter !== "all" ? t("master.itemsMatch").replace("{n}", String(n)) : "";
    }
  }, [query, filter, v, t]);

  const handleAdd = () => window.alert(t("master.addManualMock"));

  // Traducción en el punto de PINTADO de valores que se componen a nivel de módulo
  // (orígenes, avisos, prompts, filtros). El valor interno sigue en ES y actúa de
  // sentinela para la lógica; aquí solo se traduce lo que ve el usuario. Los valores
  // de la maqueta que son DATO (dominios, nombres de archivo) caen al default y pasan.
  const tOrigin = (o: string): string => {
    switch (o) {
      case MANUAL_LABEL:
        return t("master.origin.manual");
      case "github":
        return t("master.origin.github");
      case "reformulado por IA":
        return t("master.origin.aiRephrased");
      case "traducido por IA":
        return t("master.origin.aiTranslated");
      case "texto pegado":
        return t("master.origin.extracted");
      case "cuestionario":
        return t("master.origin.questionnaire");
      default:
        return o;
    }
  };
  const tWarn = (w: string): string => {
    switch (w) {
      case "falta fecha":
        return t("master.warn.missingDate");
      case "falta fecha de término":
        return t("master.warn.missingEndDate");
      default:
        return w;
    }
  };
  const tAsk = (a: string): string =>
    a === "¿Dónde lo usaste?" || a === "¿Dónde la usaste?" ? t("master.whereUsed") : a;
  const filterLabel = (k: FilterKey): string => {
    switch (k) {
      case "sin-cifra":
        return t("master.noNumber");
      case "sin-evidencia":
        return t("master.filter.noEvidence");
      case "sin-fechas":
        return t("master.filter.noDates");
      case "all":
      default:
        return t("master.filter.all");
    }
  };

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
        {isTouched ? t("master.srcEdited") : `${t("master.originPrefix")}${tOrigin(label)} ▾`}
      </button>
    );
  };

  const fragClass = (id: string) => `ms-frag${openFrags.has(id) ? " open" : ""}`;
  const fragmentText = (origin: string, evidence: string | null): ReactNode => {
    if (evidence) return evidence;
    if (origin === MANUAL_LABEL) return t("master.frag.manual");
    return t("master.frag.none");
  };

  const nudge = (b: VBullet): ReactNode => {
    if (b.num) return null;
    return (
      <span className={`ms-nudge${b.nudge ? " push" : ""}`}>
        {b.nudge ? `${t("master.noNumber")} — ${b.nudge}` : t("master.noNumber")}
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
            {isFolded ? t("master.fold.expand") : t("master.fold.collapse")}
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
            aria-label={`${t("master.aria.editRoleTitle")}${e.tt}`}
            onKeyDown={editKeyDown}
            onBlur={commitEdit(headerId, e.id, e.tt, (text) => ({ ...e.data, title: text }))}
          >
            {e.tt}
          </span>
          <span className="org">
            {e.org}
            {e.dates ? ` · ${e.dates}` : ""}
          </span>
          {e.warn ? (
            <span className="warn" data-warn="fechas">
              ⚠ {tWarn(e.warn)}
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
                  aria-label={t("master.aria.editBullet")}
                  onKeyDown={editKeyDown}
                  onBlur={commitEdit(bid, b.id, b.tx, (text) => ({ ...b.data, text }))}
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
          {s.ver === "ok" ? t("master.ver.ok") : s.ver === "partial" ? t("master.ver.partial") : t("master.ver.none")}
        </span>
      </div>
      <div className="ev">{s.ev}</div>
      {s.ask ? (
        <>
          <hr />
          <div className="ask">
            {tAsk(s.ask)} <button type="button">{t("master.skillAnswer")}</button>
          </div>
        </>
      ) : null}
    </div>
  );

  const denseRow = (r: VRow, key: string): ReactNode => {
    // El texto denso es "cabeza — cola" (name — description / degree — institution).
    // Se reparte por el PRIMER " — " (el mismo separador con que se compuso).
    const build = (text: string): Record<string, unknown> => {
      const idx = text.indexOf(" — ");
      const head = (idx >= 0 ? text.slice(0, idx) : text).trim();
      const tail = idx >= 0 ? text.slice(idx + 3).trim() : "";
      return r.kind === "project"
        ? { ...r.data, name: head, description: tail }
        : { ...r.data, degree: head, institution: tail };
    };
    return (
      <div className="ms-row" data-item key={key}>
        <span
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          role="textbox"
          aria-label={t("master.aria.editItem")}
          onKeyDown={editKeyDown}
          onBlur={commitEdit(key, r.id, r.tx, build)}
        >
          {r.tx}
        </span>
        <span className="m">{r.m}</span>
      </div>
    );
  };

  // ── Bloque de contacto (basics) — se imprime EN EL CUERPO del CV ─────────────
  const cFieldLabel: React.CSSProperties = {
    flex: "none", width: 78, color: "var(--text-subtle)",
    font: "400 var(--fs-micro)/1.6 var(--font-mono)",
  };
  const cMiss: React.CSSProperties = {
    flex: "none", font: "400 10px/1.4 var(--font-mono)", color: "var(--text-muted)",
  };
  const contactField = (
    b: VBasics,
    field: "label" | "email" | "phone" | "location",
    fieldLabel: string,
    miss: string,
  ): ReactNode => {
    const value = b[field];
    return (
      <div className="ms-b" data-basics-field={field}>
        <span style={cFieldLabel}>{fieldLabel}</span>
        <span
          className="tx"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          role="textbox"
          aria-label={`${t("master.aria.editPrefix")}${fieldLabel}`}
          onKeyDown={editKeyDown}
          onBlur={commitBasicsField(field)}
        >
          {value}
        </span>
        {value.trim() ? null : <span style={cMiss}>{miss}</span>}
      </div>
    );
  };

  const linkEditor = (l: VLink, i: number): ReactNode => (
    <div key={`lk-${i}`} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <input
        className="c-input"
        style={{ width: "140px", height: "32px", fontSize: "var(--fs-micro)" }}
        value={l.label}
        placeholder={t("master.link.labelPlaceholder")}
        aria-label={t("master.aria.linkLabel")}
        onChange={(e) => setLinkField(i, "label", e.target.value)}
        onBlur={persistBasicsNow}
      />
      <input
        className="c-input"
        style={{ flex: 1, minWidth: 0, height: "32px", fontSize: "var(--fs-data)" }}
        value={l.url}
        placeholder={t("master.link.urlPlaceholder")}
        aria-label={t("master.aria.linkUrl")}
        onChange={(e) => setLinkField(i, "url", e.target.value)}
        onBlur={persistBasicsNow}
      />
      <button
        type="button"
        aria-label={t("master.aria.removeLink")}
        onClick={() => removeLink(i)}
        style={{ flex: "none", font: "400 13px/1 var(--font-mono)", color: "var(--text-subtle)", padding: "0 6px" }}
      >
        ✕
      </button>
    </div>
  );

  const contactCard = (b: VBasics): ReactNode => (
    <div className="c-card ms-card">
      <div className="ms-eh">
        <span
          className="tt"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          role="textbox"
          aria-label={t("master.aria.editName")}
          style={b.name.trim() ? undefined : { minWidth: "140px", display: "inline-block" }}
          onKeyDown={editKeyDown}
          onBlur={commitBasicsField("name")}
        >
          {b.name}
        </span>
        {b.name.trim() ? null : <span className="warn">⚠ {t("master.warn.missingName")}</span>}
        <span className="meta">
          <span className="ms-src" style={{ opacity: 1 }}>
            {t("master.originPrefix")}
            {t("master.origin.manual")}
          </span>
        </span>
      </div>
      {contactField(b, "label", t("master.contact.label"), t("master.contact.labelMiss"))}
      {contactField(b, "email", t("master.contact.email"), t("master.contact.miss"))}
      {contactField(b, "phone", t("master.contact.phone"), t("master.contact.miss"))}
      {contactField(b, "location", t("master.contact.location"), t("master.contact.locationMiss"))}
      <div className="ms-b" style={{ alignItems: "flex-start" }}>
        <span style={{ ...cFieldLabel, marginTop: "8px" }}>{t("master.contact.links")}</span>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
          {b.links.length === 0 ? (
            <span style={{ ...cMiss, padding: "6px 0" }}>{t("master.contact.linksEmpty")}</span>
          ) : (
            b.links.map((l, i) => linkEditor(l, i))
          )}
          <button
            type="button"
            className="ms-add"
            style={{ marginTop: "2px", padding: "9px" }}
            onClick={addLink}
          >
            {t("master.contact.addLink")}
          </button>
        </div>
      </div>
    </div>
  );

  const contactBlock = (): ReactNode => (
    <section id="contacto" key="contacto">
      <div className="ms-gh">
        <span className="t-overline">{t("master.contact.overline")}</span>
        <span className="cnt">{t("master.contact.cnt")}</span>
      </div>
      <hr className="c-divider" />
      <div className="ms-body">
        {v && v.basics ? (
          contactCard(v.basics)
        ) : (
          <button type="button" className="ms-add" onClick={addBasics}>
            {t("master.contact.add")}
          </button>
        )}
      </div>
    </section>
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
            <Link href="/app/master" aria-current="page">
              {t("nav.master")}
            </Link>
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

      <div className="ms-sub" data-screen-label="master-toolbar">
        <div className="c-container">
          <input
            className="c-input"
            id="q"
            aria-label={t("master.searchAria")}
            placeholder={t("master.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="ms-f" role="group" aria-label={t("master.filtersAria")}>
            {FILTERS.map((f) => (
              <button key={f.key} type="button" data-f={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {filterLabel(f.key)}
              </button>
            ))}
          </div>
          <span className="n" id="msN" aria-live="polite">
            {msNText}
          </span>
          {savedNote ? (
            <span
              className="n"
              id="msSaved"
              role="status"
              aria-live="polite"
              style={{ color: "var(--accent-text)" }}
            >
              {savedNote}
            </span>
          ) : null}
        </div>
      </div>

      <main className="ms-main c-wall" data-screen-label="master" ref={mainRef}>
        <div className="c-container" id="body">
          <div
            style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}
          >
            <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-ui)", maxWidth: "64ch" }}>
              {t("master.intro.a")}{" "}
              <b style={{ color: "var(--text)", fontWeight: 500 }}>{t("master.intro.b")}</b>
              {t("master.intro.c")}
            </p>
            <button type="button" className="c-btn" id="btnAdd" onClick={handleAdd}>
              {t("master.addManual")}
            </button>
          </div>

          <div id="groups" ref={groupsRef}>
            {loading || !v || isEmpty ? null : (
              <>
                {contactBlock()}

                {v.summary
                  ? groupSection(
                      "resumen",
                      t("master.group.summary"),
                      `1 ${t("master.item")}`,
                      <div className="c-card ms-card">
                        <div className="ms-b" data-item>
                          <span
                            className="tx"
                            contentEditable
                            suppressContentEditableWarning
                            spellCheck={false}
                            role="textbox"
                            aria-label={t("master.aria.editSummary")}
                            onKeyDown={editKeyDown}
                            onBlur={commitEdit("it-resumen", v.summary.id, v.summary.text, (text) => ({
                              ...v.summary!.data,
                              text,
                            }))}
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
                    t("master.group.experience"),
                    `${v.roles.length} ${v.roles.length === 1 ? t("master.role") : t("master.roles")} · ${totalBullets} ${totalBullets === 1 ? t("master.bullet") : t("master.bullets")}`,
                    <>
                      {v.roles.map((e, i) => roleCard(e, i))}
                      <button type="button" className="ms-add">
                        {t("master.addRole")}
                      </button>
                    </>,
                  )}

                {v.skills.length > 0 &&
                  groupSection(
                    "skills",
                    t("master.group.skills"),
                    `${v.skills.length} ${t("master.items")}`,
                    <>
                      <div className="ms-skills">{v.skills.map((s, i) => skillCard(s, i))}</div>
                      <button type="button" className="ms-add">
                        {t("master.addSkill")}
                      </button>
                    </>,
                  )}

                {v.projects.length > 0 &&
                  groupSection(
                    "proyectos",
                    t("master.group.projects"),
                    `${v.projects.length} ${t("master.items")} — ${t("master.eachVariantPicks")}`,
                    <div className="ms-rows">{v.projects.map((p, i) => denseRow(p, `pj-${i}`))}</div>,
                  )}

                {v.education.length > 0 &&
                  groupSection(
                    "educacion",
                    t("master.group.education"),
                    `${v.education.length} ${t("master.items")}`,
                    <div className="ms-rows">{v.education.map((d, i) => denseRow(d, `ed-${i}`))}</div>,
                  )}
              </>
            )}
          </div>

          {loading ? (
            <p className="t-overline" style={{ color: "var(--text-muted)", marginTop: "24px" }}>
              {t("master.loadingRecord")}
            </p>
          ) : null}

          <span ref={liveRef} className="ms-sr" aria-live="polite" />

          <div className="ms-empty" id="msEmpty" hidden={!isEmpty}>
            <span className="t-overline">{t("master.empty.overline")}</span>
            <h2 style={{ marginTop: "14px" }}>{t("master.empty.title")}</h2>
            <p>{t("master.empty.body")}</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "24px" }}>
              <Link className="c-btn c-btn--patina" href="/app/importar">
                {t("master.empty.dump")}
              </Link>
              <Link className="c-btn" href="/app/onboarding">
                {t("master.empty.scratch")}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
