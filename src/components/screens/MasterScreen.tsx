"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { supabaseEnabled } from "@/lib/supabase/config";
import { useUndoToast } from "@/components/UndoToast";
import {
  looksLikeSkillTag,
  splitChipInput,
  normalizeSkillName,
  chipsFromCsv,
  chipsToCsv,
} from "@/lib/db/master";
import type { ItemUsage } from "@/lib/db/master";
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
/* Un grupo de habilidades = UN profile_item skill { group, items:CSV }. Los chips
   son una capa de UI sobre ese CSV; por eso la procedencia/evidencia es POR GRUPO,
   no por chip individual (el render del PDF consume el CSV tal cual). */
interface VSkill {
  id: string | null;
  data: Record<string, unknown>;
  group: string;
  chips: string[];
  origin: string;
  evidence: string | null;
  verified: boolean;
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

/* Demo agrupada: cada grupo es un item skill {group, items:CSV}, igual que el
   modelo real. Los chips salen del CSV. La procedencia es POR GRUPO. */
const DEMO_SK_GROUPS: { group: string; items: string; src: SrcKey; ev: string | null }[] = [
  {
    group: "Lenguajes", items: "Go, Python, SQL, TypeScript", src: "gh",
    ev: "Go: 412 KB · 3 repos, citado en 2 viñetas. Python: scripts de migración (práctica UNAB).",
  },
  {
    group: "Backend e infraestructura", items: "PostgreSQL, Node.js, Docker", src: "cv",
    ev: "PostgreSQL: APIs del checkout (Rayén). Docker: Dockerfile en 5 repos.",
  },
  {
    group: "Declaradas — por verificar", items: "Kubernetes, Kafka, AWS", src: "man",
    ev: null,
  },
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
    // Ids sintéticos "demo-*": el prefijo local hace que borrar/reclasificar
    // operen SOBRE LA VISTA sin llamar a la API (modo local sin Supabase).
    roles: DEMO_EXP.map((e, ei) => ({
      id: `demo-work-${ei}`, data: {},
      tt: e.tt, org: e.org, dates: e.dates, origin: SRC[e.src], evidence: e.ev, warn: e.warn,
      bullets: e.bullets.map((b, bi) => ({ id: `demo-b-${ei}-${bi}`, data: { text: b.tx }, tx: b.tx, num: b.num, origin: SRC[b.src], evidence: null, nudge: b.nudge })),
    })),
    skills: DEMO_SK_GROUPS.map((g, gi) => ({
      id: `demo-sk-${gi}`, data: {}, group: g.group, chips: chipsFromCsv(g.items),
      origin: SRC[g.src], evidence: g.ev, verified: !!g.ev,
    })),
    projects: DEMO_PJ.map((p, i) => ({ ...p, id: `demo-pj-${i}` })),
    education: DEMO_ED.map((d, i) => ({ ...d, id: `demo-ed-${i}` })),
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

  const skills: VSkill[] = by("skill").map((s) => ({
    id: s.id,
    data: s.data,
    group: str(s.data, "group") || "Habilidades",
    chips: chipsFromCsv(str(s.data, "items")),
    origin: originLabel(s.origin),
    evidence: s.evidenceSnippet,
    verified: s.evidenceVerified,
  }));

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

/* ── Alta manual: filas nuevas editables por sección (A1) ─────────────────────
   Cada sección tiene su forma; el kind del profile_item y los campos van aquí.
   La primera clave es la OBLIGATORIA (título/texto/nombre/carrera): sin ella no
   se guarda. Enter guarda y abre otra fila; Esc cancela; Tab pasa de campo. */
type DraftSection = "work" | "bullet" | "project" | "education";
interface DraftField {
  key: string;
  ph: string; // clave i18n del placeholder
}
const DRAFT_FIELDS: Record<DraftSection, DraftField[]> = {
  work: [
    { key: "title", ph: "master.draft.title" },
    { key: "company", ph: "master.draft.company" },
    { key: "dates", ph: "master.draft.dates" },
  ],
  bullet: [{ key: "text", ph: "master.draft.bullet" }],
  project: [
    { key: "name", ph: "master.draft.projectName" },
    { key: "description", ph: "master.draft.projectDesc" },
  ],
  education: [
    { key: "degree", ph: "master.draft.degree" },
    { key: "institution", ph: "master.draft.institution" },
    { key: "dates", ph: "master.draft.dates" },
  ],
};
const DRAFT_KIND: Record<DraftSection, string> = {
  work: "work",
  bullet: "bullet",
  project: "project",
  education: "education",
};
interface Draft {
  tempId: string;
  section: DraftSection;
  parentId: string | null;
  values: Record<string, string>;
}
// Ids "locales" (demo o alta en modo sin Supabase): las operaciones actúan sobre
// la vista, sin llamar a la API. Los ids reales son UUID de profile_items.
const isLocalId = (id: string | null | undefined): boolean =>
  !id || id.startsWith("local-") || id.startsWith("demo-");

let draftSeq = 0;
const newDraft = (section: DraftSection, parentId: string | null): Draft => ({
  tempId: `draft-${section}-${++draftSeq}`,
  section,
  parentId,
  values: Object.fromEntries(DRAFT_FIELDS[section].map((f) => [f.key, ""])),
});

/* Item creado por la API (createItem) → objetos de la vista. Todo origin manual. */
interface CreatedItem {
  id: string;
  data: Record<string, unknown>;
  origin?: string;
  evidenceSnippet?: string | null;
}
function createdToBullet(it: CreatedItem): VBullet {
  const tx = String(it.data.text ?? "");
  return { id: it.id, data: it.data, tx, num: hasDigit(tx), origin: MANUAL_LABEL, evidence: it.evidenceSnippet ?? null };
}
function createdToRole(it: CreatedItem): VRole {
  const dates = String(it.data.dates ?? "");
  return {
    id: it.id, data: it.data,
    tt: String(it.data.title ?? "") || "(rol sin título)",
    org: [String(it.data.company ?? ""), String(it.data.location ?? "")].filter(Boolean).join(" · "),
    dates, origin: MANUAL_LABEL, evidence: it.evidenceSnippet ?? null,
    warn: dates.trim() ? undefined : "falta fecha", bullets: [],
  };
}
function createdToProject(it: CreatedItem): VRow {
  return {
    id: it.id, kind: "project", data: it.data,
    tx: [String(it.data.name ?? ""), String(it.data.description ?? "")].filter(Boolean).join(" — "),
    m: MANUAL_LABEL,
  };
}
function createdToEducation(it: CreatedItem): VRow {
  return {
    id: it.id, kind: "education", data: it.data,
    tx: [String(it.data.degree ?? ""), String(it.data.institution ?? "")].filter(Boolean).join(" — "),
    m: String(it.data.dates ?? "") || MANUAL_LABEL,
  };
}
function createdToSkill(it: CreatedItem): VSkill {
  return {
    id: it.id, data: it.data,
    group: String(it.data.group ?? "") || "Habilidades",
    chips: chipsFromCsv(String(it.data.items ?? "")),
    origin: MANUAL_LABEL, evidence: it.evidenceSnippet ?? null, verified: false,
  };
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

  // Alta manual (A1): filas en edición por sección.
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // «¿dónde se usa?» (carga perezosa al expandir la procedencia). itemId → uso.
  const [usage, setUsage] = useState<Record<string, ItemUsage | "loading">>({});
  // Aviso inline del borrado/reclasificación bloqueado por el RESTRICT de variantes.
  const [blocked, setBlocked] = useState<Record<string, ItemUsage>>({});
  // Menú de alta global.
  const [addMenu, setAddMenu] = useState(false);

  // A3 · estado de los chips de habilidades.
  const [chipInputs, setChipInputs] = useState<Record<string, string>>({});
  const [mergeOffer, setMergeOffer] = useState<{ groupKey: string; chip: string; existingGroup: string } | null>(null);
  const [moveMenu, setMoveMenu] = useState<string | null>(null); // chipKey del menú «mover a…»
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const undo = useUndoToast();
  const focusFirstDraft = useRef<string | null>(null); // tempId cuyo 1er campo enfocar

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

  /* ── A1 · alta manual (filas nuevas editables) ──────────────────────────────
     openDraft abre una fila vacía en su sección con el foco; Enter la guarda
     (POST /api/master → createItem, origin manual) y abre OTRA debajo; Esc la
     cancela; Tab pasa de campo. En modo local (sin Supabase) la fila se añade a la
     vista sin persistir (no inventa un guardado). */
  const openDraft = useCallback((section: DraftSection, parentId: string | null) => {
    const d = newDraft(section, parentId);
    focusFirstDraft.current = d.tempId;
    // Un solo draft por (sección+padre) para no llenar la pantalla de filas vacías.
    setDrafts((prev) => [...prev.filter((x) => !(x.section === section && x.parentId === parentId)), d]);
    setAddMenu(false);
  }, []);

  const cancelDraft = useCallback((tempId: string) => {
    setDrafts((prev) => prev.filter((d) => d.tempId !== tempId));
  }, []);

  const setDraftField = useCallback((tempId: string, key: string, value: string) => {
    setDrafts((prev) => prev.map((d) => (d.tempId === tempId ? { ...d, values: { ...d.values, [key]: value } } : d)));
  }, []);

  // Inserta el item creado en la vista, en su sección (append al final).
  const appendCreated = useCallback((section: DraftSection, parentId: string | null, it: CreatedItem) => {
    setView((prev) => {
      if (!prev) return prev;
      if (section === "work") return { ...prev, roles: [...prev.roles, createdToRole(it)] };
      if (section === "project") return { ...prev, projects: [...prev.projects, createdToProject(it)] };
      if (section === "education") return { ...prev, education: [...prev.education, createdToEducation(it)] };
      // bullet: cuelga de su rol
      return {
        ...prev,
        roles: prev.roles.map((r) => (r.id === parentId ? { ...r, bullets: [...r.bullets, createdToBullet(it)] } : r)),
      };
    });
  }, []);

  // Guarda un draft: valida el campo obligatorio, persiste y reabre otro debajo.
  const saveDraft = useCallback(
    (d: Draft) => {
      const fields = DRAFT_FIELDS[d.section];
      const required = fields[0]!.key;
      const value0 = (d.values[required] ?? "").trim();
      if (!value0) {
        cancelDraft(d.tempId);
        return;
      }
      const data: Record<string, unknown> = {};
      for (const f of fields) {
        const val = (d.values[f.key] ?? "").trim();
        if (val) data[f.key] = val;
      }
      const kind = DRAFT_KIND[d.section];

      const reopen = () => {
        const next = newDraft(d.section, d.parentId);
        focusFirstDraft.current = next.tempId;
        setDrafts((prev) => prev.map((x) => (x.tempId === d.tempId ? next : x)));
      };

      if (!supabaseEnabled) {
        // Modo local: sin id real (no persiste, no borra). Es solo visual.
        appendCreated(d.section, d.parentId, { id: `local-${d.tempId}`, data });
        noteSaved(t("master.saved.localAdd"));
        reopen();
        return;
      }
      void (async () => {
        try {
          const res = await fetch("/api/master", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, data, parentId: d.parentId }),
          });
          if (!res.ok) throw new Error();
          const { item } = (await res.json()) as { item: CreatedItem };
          appendCreated(d.section, d.parentId, item);
          noteSaved(t("common.saved"));
          reopen();
        } catch {
          noteSaved(t("master.saved.fail"));
        }
      })();
    },
    [appendCreated, cancelDraft, noteSaved, t],
  );

  // Enter guarda; Esc cancela. Enter en cualquier campo del draft dispara guardar.
  const draftKeyDown = useCallback(
    (d: Draft) => (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveDraft(d);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelDraft(d.tempId);
      }
    },
    [saveDraft, cancelDraft],
  );

  /* ── «¿dónde se usa esto?» (carga perezosa al expandir la procedencia) ─────── */
  const loadUsage = useCallback(
    (dbId: string) => {
      if (!supabaseEnabled || isLocalId(dbId) || usage[dbId]) return;
      setUsage((p) => ({ ...p, [dbId]: "loading" }));
      void (async () => {
        try {
          const res = await fetch(`/api/master/${dbId}?usage=1`);
          const j = (await res.json()) as { usage?: ItemUsage };
          if (j.usage) setUsage((p) => ({ ...p, [dbId]: j.usage! }));
        } catch {
          setUsage((p) => {
            const { [dbId]: _drop, ...rest } = p;
            return rest;
          });
        }
      })();
    },
    [usage],
  );

  /* ── A2 · borrar de verdad (con deshacer diferido y aviso del RESTRICT) ────── */
  // Quita el item de la vista (optimista) y devuelve el snapshot previo para deshacer.
  const removeFromView = useCallback(
    (kind: "work" | "bullet" | "project" | "education" | "skill", id: string, parentId?: string | null) => {
      setView((prev) => {
        if (!prev) return prev;
        if (kind === "work") return { ...prev, roles: prev.roles.filter((r) => r.id !== id) };
        if (kind === "project") return { ...prev, projects: prev.projects.filter((p) => p.id !== id) };
        if (kind === "education") return { ...prev, education: prev.education.filter((e) => e.id !== id) };
        if (kind === "skill") return { ...prev, skills: prev.skills.filter((s) => s.id !== id) };
        return {
          ...prev,
          roles: prev.roles.map((r) => (r.id === parentId ? { ...r, bullets: r.bullets.filter((b) => b.id !== id) } : r)),
        };
      });
    },
    [],
  );

  // Ejecuta el DELETE real (onCommit del toast). force = el usuario aceptó pese al RESTRICT.
  const realDelete = useCallback(
    (id: string, force: boolean) => {
      if (!supabaseEnabled || isLocalId(id)) return;
      void fetch(`/api/master/${id}${force ? "?force=1" : ""}`, { method: "DELETE" }).catch(() => {});
    },
    [],
  );

  // Borra con toast de deshacer. `label` para el mensaje; `children` viñetas arrastradas.
  const deleteWithUndo = useCallback(
    (
      kind: "work" | "bullet" | "project" | "education" | "skill",
      id: string,
      label: string,
      children: number,
      force: boolean,
      parentId?: string | null,
    ) => {
      const snapshot = view;
      removeFromView(kind, id, parentId);
      setBlocked((prev) => {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      });
      const msg = children > 0
        ? t("master.deleted.withChildren").replace("{label}", label).replace("{n}", String(children))
        : t("master.deleted").replace("{label}", label);
      undo.show({
        message: msg,
        onUndo: () => setView(snapshot),
        onCommit: () => realDelete(id, force),
      });
    },
    [view, removeFromView, undo, t, realDelete],
  );

  // Punto de entrada del borrado: consulta uso; si nadie lo referencia, borra con
  // deshacer; si una variante lo usa, muestra el aviso inline (no modal de sistema).
  const requestDelete = useCallback(
    (kind: "work" | "bullet" | "project" | "education" | "skill", id: string, label: string, parentId?: string | null) => {
      if (isLocalId(id) || !supabaseEnabled) {
        removeFromView(kind, id, parentId);
        return;
      }
      void (async () => {
        try {
          const res = await fetch(`/api/master/${id}?dryRun=1`, { method: "DELETE" });
          const j = (await res.json()) as { usage?: ItemUsage };
          const u = j.usage ?? { variantsCount: 0, overridesCount: 0, childrenCount: 0 };
          if (u.variantsCount > 0) {
            setBlocked((prev) => ({ ...prev, [id]: u }));
          } else {
            deleteWithUndo(kind, id, label, u.childrenCount, false, parentId);
          }
        } catch {
          noteSaved(t("master.saved.fail"));
        }
      })();
    },
    [deleteWithUndo, removeFromView, noteSaved, t],
  );

  const dismissBlocked = useCallback((id: string) => {
    setBlocked((prev) => {
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  /* ── A3 · habilidades como chips ────────────────────────────────────────────
     Persiste el grupo (PATCH data {group, items:CSV}); si queda sin chips, lo borra
     con deshacer. La procedencia/evidencia es POR GRUPO (limitación honesta del
     modelo: los chips son una capa de UI sobre el CSV). */
  const persistSkillGroup = useCallback(
    (s: VSkill, chips: string[]) => {
      if (chips.length === 0 && s.id) {
        // grupo vacío → borrarlo (con deshacer). Snapshot para restaurar.
        const snapshot = view;
        setView((prev) => (prev ? { ...prev, skills: prev.skills.filter((g) => g.id !== s.id) } : prev));
        undo.show({
          message: t("master.skill.groupRemoved").replace("{label}", s.group),
          onUndo: () => setView(snapshot),
          onCommit: () => realDelete(s.id!, false),
        });
        return;
      }
      setView((prev) =>
        prev ? { ...prev, skills: prev.skills.map((g) => (g.id === s.id && g.group === s.group ? { ...g, chips } : g)) } : prev,
      );
      saveEdit(s.id, { ...s.data, group: s.group, items: chipsToCsv(chips) });
    },
    [view, saveEdit, undo, t, realDelete],
  );

  // Renombrar un grupo (persiste manteniendo los chips).
  const renameSkillGroup = useCallback(
    (s: VSkill, name: string) => {
      const clean = name.trim();
      if (!clean || clean === s.group) return;
      setView((prev) =>
        prev ? { ...prev, skills: prev.skills.map((g) => (g.id === s.id ? { ...g, group: clean } : g)) } : prev,
      );
      saveEdit(s.id, { ...s.data, group: clean, items: chipsToCsv(s.chips) });
    },
    [saveEdit],
  );

  // Mover un chip entre grupos (persiste ambos). Se calcula sobre el view actual;
  // los efectos (saveEdit) van FUERA del updater de estado.
  const moveChip = useCallback(
    (fromId: string | null, fromGroup: string, toId: string | null, toGroup: string, chip: string) => {
      const skills = view?.skills ?? [];
      const from = skills.find((g) => g.id === fromId && g.group === fromGroup);
      const to = skills.find((g) => g.id === toId && g.group === toGroup);
      if (!from || !to) return;
      const fromChips = from.chips.filter((c) => normalizeSkillName(c) !== normalizeSkillName(chip));
      const exists = to.chips.some((c) => normalizeSkillName(c) === normalizeSkillName(chip));
      const toChips = exists ? to.chips : [...to.chips, chip];
      setView((prev) =>
        prev
          ? {
              ...prev,
              skills: prev.skills.map((g) => {
                if (g.id === fromId && g.group === fromGroup) return { ...g, chips: fromChips };
                if (g.id === toId && g.group === toGroup) return { ...g, chips: toChips };
                return g;
              }),
            }
          : prev,
      );
      saveEdit(from.id, { ...from.data, group: from.group, items: chipsToCsv(fromChips) });
      saveEdit(to.id, { ...to.data, group: to.group, items: chipsToCsv(toChips) });
    },
    [view, saveEdit],
  );

  // Crear un grupo de skills nuevo (POST kind skill).
  const createSkillGroup = useCallback(
    (name: string, firstChips: string[]) => {
      const group = name.trim();
      if (!group) return;
      const items = chipsToCsv(firstChips);
      if (!supabaseEnabled) {
        setView((prev) =>
          prev ? { ...prev, skills: [...prev.skills, createdToSkill({ id: `local-sk-${Date.now()}`, data: { group, items } })] } : prev,
        );
        noteSaved(t("master.saved.localAdd"));
        return;
      }
      void (async () => {
        try {
          const res = await fetch("/api/master", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "skill", data: { group, items } }),
          });
          if (!res.ok) throw new Error();
          const { item } = (await res.json()) as { item: CreatedItem };
          setView((prev) => (prev ? { ...prev, skills: [...prev.skills, createdToSkill(item)] } : prev));
          noteSaved(t("common.saved"));
        } catch {
          noteSaved(t("master.saved.fail"));
        }
      })();
    },
    [noteSaved, t],
  );

  // Quitar un chip del grupo (persiste; si queda vacío, persistSkillGroup lo borra).
  const removeChip = useCallback(
    (s: VSkill, chip: string) => {
      const next = s.chips.filter((c) => normalizeSkillName(c) !== normalizeSkillName(chip));
      persistSkillGroup(s, next);
    },
    [persistSkillGroup],
  );

  // Añadir chip(s) desde el input o un pegado. Detecta duplicados NORMALIZADOS en
  // CUALQUIER grupo (postgres≈postgresql): no los duplica y ofrece «¿fusionar?».
  const commitChip = useCallback(
    (s: VSkill, groupKey: string, raw: string) => {
      setChipInputs((p) => ({ ...p, [groupKey]: "" }));
      const parts = splitChipInput(raw);
      if (parts.length === 0) return;
      const index = new Map<string, string>();
      (view?.skills ?? []).forEach((g) => g.chips.forEach((c) => index.set(normalizeSkillName(c), g.group)));
      const toAdd: string[] = [];
      let firstDup: { chip: string; group: string } | null = null;
      for (const p of parts) {
        const key = normalizeSkillName(p);
        const existingGroup = index.get(key);
        if (existingGroup) {
          if (!firstDup) firstDup = { chip: p, group: existingGroup };
          continue;
        }
        index.set(key, s.group);
        toAdd.push(p);
      }
      if (toAdd.length) persistSkillGroup(s, [...s.chips, ...toAdd]);
      setMergeOffer(firstDup && toAdd.length === 0 ? { groupKey, chip: firstDup.chip, existingGroup: firstDup.group } : null);
    },
    [view, persistSkillGroup],
  );

  /* ── A4 · reclasificar viñeta(s) a habilidades ──────────────────────────────
     Mueve el texto de las viñetas al grupo elegido y las borra. Si alguna está
     referenciada por variantes (RESTRICT), el aviso sale igual que en el borrado. */
  const reclassify = useCallback(
    (ids: string[], group: string, force: boolean) => {
      if (!supabaseEnabled || ids.some(isLocalId)) {
        // Modo local: mover en la vista sin persistir.
        setView((prev) => {
          if (!prev) return prev;
          const moved: string[] = [];
          const roles = prev.roles.map((r) => {
            const keep = r.bullets.filter((b) => {
              if (b.id && ids.includes(b.id)) { moved.push(b.tx); return false; }
              return true;
            });
            return { ...r, bullets: keep };
          });
          let skills = prev.skills;
          const gi = skills.findIndex((s) => normalizeSkillName(s.group) === normalizeSkillName(group));
          if (gi >= 0) {
            skills = skills.map((s, i) => (i === gi ? { ...s, chips: [...s.chips, ...moved] } : s));
          } else {
            skills = [...skills, { id: `local-sk-${Date.now()}`, data: {}, group, chips: moved, origin: MANUAL_LABEL, evidence: null, verified: false }];
          }
          return { ...prev, roles, skills };
        });
        noteSaved(t("master.saved.localAdd"));
        return;
      }
      void (async () => {
        try {
          const res = await fetch("/api/master", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reclassify: { ids, group, force } }),
          });
          if (res.status === 409) {
            const j = (await res.json()) as { usage?: ItemUsage };
            if (j.usage && ids[0]) setBlocked((prev) => ({ ...prev, [ids[0]!]: j.usage! }));
            return;
          }
          if (!res.ok) throw new Error();
          // Optimista: quita las viñetas y refresca vía recarga ligera del grupo.
          setView((prev) => {
            if (!prev) return prev;
            const moved: string[] = [];
            const roles = prev.roles.map((r) => {
              const keep = r.bullets.filter((b) => {
                if (b.id && ids.includes(b.id)) { moved.push(b.tx); return false; }
                return true;
              });
              return { ...r, bullets: keep };
            });
            let skills = prev.skills;
            const gi = skills.findIndex((s) => normalizeSkillName(s.group) === normalizeSkillName(group));
            if (gi >= 0) {
              skills = skills.map((s, i) => (i === gi ? { ...s, chips: [...s.chips, ...moved] } : s));
            }
            return { ...prev, roles, skills };
          });
          noteSaved(t("master.reclassified").replace("{n}", String(ids.length)).replace("{group}", group));
          if (ids[0]) dismissBlocked(ids[0]);
        } catch {
          noteSaved(t("master.saved.fail"));
        }
      })();
    },
    [noteSaved, t, dismissBlocked],
  );

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

  // Con una fila en alta (draft) abierta, NO mostramos el estado vacío: hay que
  // renderizar las secciones para alojar la fila editable.
  const isEmpty = !loading && total === 0 && drafts.length === 0;
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

  // Foco al primer campo de una fila nueva (A1): «cinco seguidas sin ratón».
  useEffect(() => {
    const id = focusFirstDraft.current;
    if (!id) return;
    focusFirstDraft.current = null;
    const el = document.querySelector<HTMLInputElement>(`[data-draft-focus="${id}"]`);
    el?.focus();
  }, [drafts]);

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

  // Alta manual global: abre un menú inline (sin modal) con las secciones. Cada
  // opción abre una fila nueva editable en su sitio (A1).
  const handleAdd = () => setAddMenu((o) => !o);

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

  // Botón de origen expandible (foco de teclado + aria-expanded). Al abrirlo carga
  // «¿dónde se usa?» de forma perezosa (dbId real).
  const srcButton = (id: string, label: string, dbId?: string | null): ReactNode => {
    const isTouched = touched.has(id);
    return (
      <button
        type="button"
        className="ms-src"
        aria-expanded={openFrags.has(id)}
        aria-controls={`${id}-frag`}
        style={isTouched ? { opacity: 1, color: "var(--accent-text)" } : undefined}
        onClick={() => {
          if (!openFrags.has(id) && dbId && !isLocalId(dbId)) loadUsage(dbId);
          toggleFrag(id);
        }}
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

  // «lo usan N variantes» dentro del fragmento de procedencia (carga perezosa).
  const usageLine = (dbId: string | null): ReactNode => {
    if (!dbId || isLocalId(dbId)) return null;
    const u = usage[dbId];
    if (!u) return null;
    if (u === "loading") return <div className="ms-usage">{t("master.usage.loading")}</div>;
    const parts: string[] = [
      u.variantsCount === 0
        ? t("master.usage.none")
        : (u.variantsCount === 1 ? t("master.usage.one") : t("master.usage.many")).replace("{n}", String(u.variantsCount)),
    ];
    if (u.overridesCount > 0) parts.push(t("master.usage.overrides").replace("{n}", String(u.overridesCount)));
    return <div className="ms-usage">{parts.join(" · ")}</div>;
  };

  const fragBody = (id: string, dbId: string | null, origin: string, evidence: string | null): ReactNode => (
    <div className={fragClass(id)} id={`${id}-frag`} data-frag={id}>
      {fragmentText(origin, evidence)}
      {usageLine(dbId)}
    </div>
  );

  // Botón eliminar (✕) — arranca el flujo A2 (consulta uso → deshacer o aviso inline).
  const delButton = (
    kind: "work" | "bullet" | "project" | "education" | "skill",
    id: string | null,
    label: string,
    parentId?: string | null,
  ): ReactNode => {
    if (!id) return null;
    return (
      <button
        type="button"
        className="ms-del"
        aria-label={`${t("master.aria.delete")}${label}`}
        title={t("master.aria.delete") + label}
        onClick={() => requestDelete(kind, id, label, parentId)}
      >
        ✕
      </button>
    );
  };

  // Aviso INLINE cuando el borrado/reclasificación choca con el RESTRICT de
  // variantes (no es un modal de sistema). Muestra el dato real y «eliminar igualmente».
  const blockedWarning = (
    id: string | null,
    kind: "work" | "bullet" | "project" | "education" | "skill",
    label: string,
    parentId?: string | null,
  ): ReactNode => {
    if (!id) return null;
    const u = blocked[id];
    if (!u) return null;
    const usedMsg =
      (u.variantsCount === 1 ? t("master.blocked.one") : t("master.blocked.many")).replace("{n}", String(u.variantsCount)) +
      (u.overridesCount > 0 ? " · " + t("master.blocked.overrides").replace("{n}", String(u.overridesCount)) : "");
    return (
      <div className="ms-blocked" role="alert">
        <span>{usedMsg}</span>
        <span className="ms-blocked__act">
          <button type="button" className="ms-blocked__go" onClick={() => deleteWithUndo(kind, id, label, u.childrenCount, true, parentId)}>
            {t("master.blocked.forceDelete")}
          </button>
          <button type="button" className="ms-blocked__no" onClick={() => dismissBlocked(id)}>
            {t("common.cancel")}
          </button>
        </span>
      </div>
    );
  };

  // A4: la viñeta sin cifra que PARECE una etiqueta ⇒ sugerencia «esto parece una
  // habilidad» con acción de un clic; si no, el nudge «sin cifra» de siempre.
  const nudge = (b: VBullet): ReactNode => {
    if (b.num) return null;
    if (b.id && looksLikeSkillTag(b.tx)) {
      return (
        <button
          type="button"
          className="ms-tag-nudge"
          title={t("master.skillTag.hint")}
          onClick={() => reclassify([b.id!], t("master.skillTag.defaultGroup"), false)}
        >
          {t("master.skillTag.move")}
        </button>
      );
    }
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

  // ── Fila de alta (A1): inputs por sección; Enter guarda, Esc cancela, Tab pasa ─
  const draftsFor = (section: DraftSection, parentId: string | null) =>
    drafts.filter((d) => d.section === section && d.parentId === parentId);

  const draftRow = (d: Draft): ReactNode => {
    const fields = DRAFT_FIELDS[d.section];
    return (
      <div className="ms-draft" key={d.tempId}>
        {fields.map((f, idx) => (
          <input
            key={f.key}
            className="c-input ms-draft__in"
            data-draft-focus={idx === 0 ? d.tempId : undefined}
            placeholder={t(f.ph)}
            aria-label={t(f.ph)}
            value={d.values[f.key] ?? ""}
            onChange={(ev) => setDraftField(d.tempId, f.key, ev.target.value)}
            onKeyDown={draftKeyDown(d)}
          />
        ))}
        <button type="button" className="ms-draft__save" onClick={() => saveDraft(d)}>
          {t("master.draft.save")}
        </button>
        <button
          type="button"
          className="ms-draft__cancel"
          aria-label={t("common.cancel")}
          onClick={() => cancelDraft(d.tempId)}
        >
          ✕
        </button>
      </div>
    );
  };

  const roleCard = (e: VRole, i: number): ReactNode => {
    const headerId = `it-exp-${i}`;
    // A4: viñetas sin cifra que parecen etiqueta (para el «mover las N sugeridas»).
    const suggested = e.bullets.filter((b) => b.id && !b.num && looksLikeSkillTag(b.tx));
    return (
      <article className="c-card ms-card" data-item key={e.id ?? headerId}>
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
          <span className="meta">
            {srcButton(headerId, e.origin, e.id)}
            {delButton("work", e.id, e.tt)}
          </span>
        </div>
        {fragBody(headerId, e.id, e.origin, e.evidence)}
        {blockedWarning(e.id, "work", e.tt)}
        {e.bullets.map((b, j) => {
          const bid = `it-exp-${i}-b-${j}`;
          return (
            <Fragment key={b.id ?? bid}>
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
                {srcButton(bid, b.origin, b.id)}
                {delButton("bullet", b.id, b.tx, e.id)}
              </div>
              {fragBody(bid, b.id, b.origin, b.evidence)}
              {blockedWarning(b.id, "bullet", b.tx, e.id)}
            </Fragment>
          );
        })}
        {suggested.length > 1 ? (
          <div className="ms-b ms-suggest-batch">
            <button
              type="button"
              className="ms-tag-nudge"
              onClick={() => reclassify(suggested.map((b) => b.id!), t("master.skillTag.defaultGroup"), false)}
            >
              {t("master.skillTag.moveBatch").replace("{n}", String(suggested.length))}
            </button>
          </div>
        ) : null}
        {draftsFor("bullet", e.id).map((d) => draftRow(d))}
        {e.id ? (
          <button type="button" className="ms-addbullet" onClick={() => openDraft("bullet", e.id)}>
            {t("master.addBullet")}
          </button>
        ) : null}
      </article>
    );
  };

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
    const kind = r.kind === "project" ? "project" : "education";
    return (
      <Fragment key={key}>
        <div className="ms-row" data-item>
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
          {delButton(kind, r.id, r.tx)}
        </div>
        {blockedWarning(r.id, kind, r.tx)}
      </Fragment>
    );
  };

  // ── A3 · un grupo de habilidades como chips ────────────────────────────────
  // El title/hover de cada chip muestra la procedencia del GRUPO (no por chip: el
  // modelo guarda un CSV por grupo, los chips son una capa de UI sobre ese CSV).
  const skillGroupCard = (s: VSkill, gi: number): ReactNode => {
    const groupKey = `sk-${gi}`;
    const others = (v?.skills ?? []).filter((g, idx) => idx !== gi);
    const chipTitle = `${t("master.originPrefix")}${tOrigin(s.origin)}${s.evidence ? " — " + s.evidence : ""}`;
    return (
      <div
        className="ms-skgroup"
        data-item
        data-ver={s.verified ? "ok" : "none"}
        key={s.id ?? groupKey}
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => {
          ev.preventDefault();
          const chip = ev.dataTransfer.getData("text/chip");
          const from = ev.dataTransfer.getData("text/from");
          if (!chip || from === groupKey) return;
          const srcGi = Number(from.split("-")[1]);
          const src = v?.skills[srcGi];
          if (src) moveChip(src.id, src.group, s.id, s.group, chip);
        }}
      >
        <div className="ms-skgroup__h">
          <span
            className="ms-skgroup__nm"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            role="textbox"
            aria-label={`${t("master.aria.editPrefix")}${s.group}`}
            onKeyDown={editKeyDown}
            onBlur={(ev) => renameSkillGroup(s, (ev.currentTarget.textContent ?? "").trim())}
          >
            {s.group}
          </span>
          <span className={`c-ver c-ver--${s.verified ? "ok" : "none"}`}>
            {s.verified ? t("master.ver.ok") : t("master.ver.none")}
          </span>
          <span className="meta">
            {srcButton(groupKey, s.origin, s.id)}
            {delButton("skill", s.id, s.group)}
          </span>
        </div>
        {fragBody(groupKey, s.id, s.origin, s.evidence)}
        {blockedWarning(s.id, "skill", s.group)}
        <div className="ms-chips">
          {s.chips.map((c, ci) => {
            const chipKey = `${groupKey}-c-${ci}`;
            return (
              <span
                key={chipKey}
                className="ms-chip"
                tabIndex={0}
                draggable
                title={chipTitle}
                onDragStart={(ev) => {
                  ev.dataTransfer.setData("text/chip", c);
                  ev.dataTransfer.setData("text/from", groupKey);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Backspace" || ev.key === "Delete") {
                    ev.preventDefault();
                    removeChip(s, c);
                  } else if (ev.key.toLowerCase() === "m") {
                    ev.preventDefault();
                    setMoveMenu((cur) => (cur === chipKey ? null : chipKey));
                  }
                }}
              >
                <span className="ms-chip__tx">{c}</span>
                <button
                  type="button"
                  className="ms-chip__mv"
                  aria-label={`${t("master.chip.move")}${c}`}
                  aria-haspopup="menu"
                  aria-expanded={moveMenu === chipKey}
                  onClick={() => setMoveMenu((cur) => (cur === chipKey ? null : chipKey))}
                >
                  ⇄
                </button>
                <button
                  type="button"
                  className="ms-chip__x"
                  aria-label={`${t("master.chip.remove")}${c}`}
                  onClick={() => removeChip(s, c)}
                >
                  ×
                </button>
                {moveMenu === chipKey ? (
                  <span className="ms-chip__menu" role="menu">
                    {others.length === 0 ? (
                      <span className="ms-chip__none">{t("master.chip.noTargets")}</span>
                    ) : (
                      others.map((o, oi) => (
                        <button
                          key={oi}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            moveChip(s.id, s.group, o.id, o.group, c);
                            setMoveMenu(null);
                          }}
                        >
                          {o.group}
                        </button>
                      ))
                    )}
                  </span>
                ) : null}
              </span>
            );
          })}
          <input
            className="c-input ms-chip-in"
            placeholder={t("master.chip.add")}
            aria-label={`${t("master.chip.addTo")}${s.group}`}
            value={chipInputs[groupKey] ?? ""}
            onChange={(ev) => setChipInputs((p) => ({ ...p, [groupKey]: ev.target.value }))}
            onPaste={(ev) => {
              const txt = ev.clipboardData.getData("text");
              if (/[,;\n·•|]/.test(txt)) {
                ev.preventDefault();
                commitChip(s, groupKey, txt);
              }
            }}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                commitChip(s, groupKey, chipInputs[groupKey] ?? "");
              }
            }}
          />
        </div>
        {mergeOffer && mergeOffer.groupKey === groupKey ? (
          <div className="ms-merge" role="status">
            <span>
              {t("master.chip.dupExists")
                .replace("{chip}", mergeOffer.chip)
                .replace("{group}", mergeOffer.existingGroup)}
            </span>
            <button type="button" onClick={() => setMergeOffer(null)}>
              {t("master.chip.merge")}
            </button>
          </div>
        ) : null}
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
            <div className="ms-addwrap">
              <button
                type="button"
                className="c-btn"
                id="btnAdd"
                aria-haspopup="menu"
                aria-expanded={addMenu}
                onClick={handleAdd}
              >
                {t("master.addManual")}
              </button>
              {addMenu ? (
                <div className="ms-addmenu" role="menu">
                  <button type="button" role="menuitem" onClick={() => openDraft("work", null)}>
                    {t("master.add.role")}
                  </button>
                  <button type="button" role="menuitem" onClick={() => openDraft("project", null)}>
                    {t("master.add.project")}
                  </button>
                  <button type="button" role="menuitem" onClick={() => openDraft("education", null)}>
                    {t("master.add.education")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setNewGroupOpen(true);
                      setAddMenu(false);
                    }}
                  >
                    {t("master.add.skillGroup")}
                  </button>
                </div>
              ) : null}
            </div>
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
                          {srcButton("it-resumen", v.summary.origin, v.summary.id)}
                        </div>
                        {fragBody("it-resumen", v.summary.id, v.summary.origin, v.summary.evidence)}
                      </div>,
                    )
                  : null}

                {(v.roles.length > 0 || draftsFor("work", null).length > 0) &&
                  groupSection(
                    "experiencia",
                    t("master.group.experience"),
                    `${v.roles.length} ${v.roles.length === 1 ? t("master.role") : t("master.roles")} · ${totalBullets} ${totalBullets === 1 ? t("master.bullet") : t("master.bullets")}`,
                    <>
                      {v.roles.map((e, i) => roleCard(e, i))}
                      {draftsFor("work", null).map((d) => draftRow(d))}
                      <button type="button" className="ms-add" onClick={() => openDraft("work", null)}>
                        {t("master.addRole")}
                      </button>
                    </>,
                  )}

                {(v.skills.length > 0 || newGroupOpen) &&
                  groupSection(
                    "skills",
                    t("master.group.skills"),
                    `${v.skills.length} ${v.skills.length === 1 ? t("master.group.one") : t("master.group.many")}`,
                    <>
                      <div className="ms-skgroups">{v.skills.map((s, i) => skillGroupCard(s, i))}</div>
                      {newGroupOpen ? (
                        <div className="ms-draft ms-newgroup">
                          <input
                            className="c-input ms-draft__in"
                            autoFocus
                            placeholder={t("master.skill.newGroupPlaceholder")}
                            aria-label={t("master.skill.newGroup")}
                            value={newGroupName}
                            onChange={(ev) => setNewGroupName(ev.target.value)}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter") {
                                ev.preventDefault();
                                if (newGroupName.trim()) createSkillGroup(newGroupName, []);
                                setNewGroupName("");
                                setNewGroupOpen(false);
                              } else if (ev.key === "Escape") {
                                ev.preventDefault();
                                setNewGroupName("");
                                setNewGroupOpen(false);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="ms-draft__save"
                            onClick={() => {
                              if (newGroupName.trim()) createSkillGroup(newGroupName, []);
                              setNewGroupName("");
                              setNewGroupOpen(false);
                            }}
                          >
                            {t("master.draft.save")}
                          </button>
                          <button
                            type="button"
                            className="ms-draft__cancel"
                            aria-label={t("common.cancel")}
                            onClick={() => {
                              setNewGroupName("");
                              setNewGroupOpen(false);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="ms-add" onClick={() => setNewGroupOpen(true)}>
                          {t("master.addSkillGroup")}
                        </button>
                      )}
                    </>,
                  )}

                {(v.projects.length > 0 || draftsFor("project", null).length > 0) &&
                  groupSection(
                    "proyectos",
                    t("master.group.projects"),
                    `${v.projects.length} ${t("master.items")} — ${t("master.eachVariantPicks")}`,
                    <>
                      <div className="ms-rows">{v.projects.map((p, i) => denseRow(p, `pj-${i}`))}</div>
                      {draftsFor("project", null).map((d) => draftRow(d))}
                      <button type="button" className="ms-add" onClick={() => openDraft("project", null)}>
                        {t("master.addProject")}
                      </button>
                    </>,
                  )}

                {(v.education.length > 0 || draftsFor("education", null).length > 0) &&
                  groupSection(
                    "educacion",
                    t("master.group.education"),
                    `${v.education.length} ${t("master.items")}`,
                    <>
                      <div className="ms-rows">{v.education.map((d, i) => denseRow(d, `ed-${i}`))}</div>
                      {draftsFor("education", null).map((d) => draftRow(d))}
                      <button type="button" className="ms-add" onClick={() => openDraft("education", null)}>
                        {t("master.addEducation")}
                      </button>
                    </>,
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
      {undo.node}
    </div>
  );
}
