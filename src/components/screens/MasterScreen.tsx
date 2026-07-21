"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { supabaseEnabled } from "@/lib/supabase/config";
import { normalizeDateRange, type DateRange } from "@/lib/extract/dates";
import { AuroraTune, AURORA_HOJEO, AURORA_TRABAJO } from "@/components/Aurora";
import { useUndoToast } from "@/components/UndoToast";
import {
  looksLikeSkillTag,
  splitChipInput,
  normalizeSkillName,
  chipsFromCsv,
  chipsToCsv,
  mergeChips,
} from "@/lib/db/master";
import type { ItemUsage } from "@/lib/db/master";
// SOLO TIPOS: duplicados.ts arrastra el detector entero (dedup → similar → verify
// → el diccionario TECH). El `import type` se borra al compilar, así que la
// pantalla no se lleva nada de eso al bundle del navegador. Los datos que necesita
// —campos comparables, viñetas, motivo— vienen ya calculados en el JSON del GET.
import type { ClusterDuplicado, MiembroDuplicado } from "@/lib/db/duplicados";
// SOLO TIPOS también aquí: barrido.ts arrastra el detector entero (dedup → similar
// → verify) además de resolverDuplicado. El `import type` se borra al compilar, así
// que la pantalla recibe los hallazgos YA calculados por el GET y no se lleva ni una
// línea del analizador al bundle del navegador.
import type {
  ResultadoBarrido,
  Hallazgo,
  HallazgoDuplicado,
  HallazgoMalClasificado,
  HallazgoFecha,
  HallazgoVineta,
  HallazgoAptitud,
} from "@/lib/master/barrido";
import "./master.css";

/* ============================================================================
   Master — porte de corpus-design/04-pantallas/master.html
   (ver docs/spec/pantallas/master.md).
   Es el registro canónico completo — un editor, no un formulario. Se edita
   inline (contenteditable) y cada item recuerda su origen (fragmento expandible).

   ★ CABLEADO A DATOS REALES. En modo Supabase los grupos salen de /api/master
   (profile_items del usuario, RLS por auth.uid()); cada item muestra su origen y
   su fragmento de evidencia REAL. Una cuenta nueva ⇒ estado vacío. La maqueta
   (persona Diego Gatica) SOLO se usa como fallback del modo local sin Supabase.

   Atmósfera (doctrina vigente — ver src/components/Aurora.tsx):
   La aurora la monta el shell (app/app/layout), no esta pantalla. Aquí solo se
   DECLARA la intensidad: 0.22 con el registro poblado (es la pantalla más densa
   del producto después del editor; el humo se intuye por los márgenes y entre
   tarjetas, nunca compite con una viñeta) y 0.55 con el registro vacío, que es
   una sala de puertas y no trabajo. Lo que protege la lectura no es apagar el
   fondo, es la superficie: .c-wall pone UN vidrio para toda la pantalla y las
   tarjetas (.c-card) son translúcidas SIN filtro propio, así que cientos de
   items siguen costando una sola capa de composición.
   Antes esto era un MURO opaco que ni montaba la aurora — regla heredada de una
   landing con scroll, sin sentido en una app de pestañas.

   Decisiones de fidelidad conservadas:
   - Los conteos NO se hardcodean: `total` y `sourceCount` se DERIVAN de los datos.
   - Interacciones REALES con estado React: buscar, filtrar, plegar grupos,
     expandir origen, edición inline → "editado por ti".
   - El estado vacío deriva de los datos (total === 0) y conserva su markup.
   ============================================================================ */

type FilterKey = "all" | "sin-cifra" | "sin-evidencia" | "sin-fechas" | "posibles-duplicados";

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
/* Los campos del rol van SEPARADOS, cada uno con su clave real en `data`. Antes
   company+location viajaban fusionados en un `org` de solo lectura: la cabecera no
   se podía editar y el único camino para corregir una empresa era recrear el rol. */
interface VRole {
  id: string | null;
  data: Record<string, unknown>;
  tt: string;
  company: string;
  location: string;
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
/* Una fila densa (proyecto, educación, certificación). Guarda su `data` cruda: los
   campos que se pintan y se editan salen de ROW_FIELDS, NO de un string fusionado.
   El `tx` de antes era "cabeza — cola" y al guardar se volvía a partir por el primer
   " — ": un nombre que contuviera ese separador repartía los campos mal y perdía
   texto. `m` es solo la meta de la derecha (procedencia), nunca dato editable. */
interface VRow {
  id: string | null;
  kind: RowKind;
  data: Record<string, unknown>;
  m: string;
  warn?: string;
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
/* ⚠⚠ UNA REFERENCIA SON DATOS DE OTRA PERSONA. No es un item más del registro: el
   nombre, el correo y el teléfono que hay aquí dentro pertenecen a alguien que no
   es el usuario y que no ha consentido nada de este sistema. De ahí tres cosas que
   se ven en el render y no en un comentario: el aviso de pedir permiso está donde
   se añade, la sección dice que en el CV van APAGADAS, y `links` no es decoración
   —es lo único que convierte «un señor con un teléfono» en «mi jefe en Tesseract».
   `links` NO viene de /api/master (esa ruta solo trae profile_items): lo trae
   /api/references y vive en su propio estado, ver `refLinks`. */
interface VReference {
  id: string | null;
  data: Record<string, unknown>;
  origin: string;
}
interface MasterView {
  basics: VBasics | null;
  summary: VSummary | null;
  roles: VRole[];
  skills: VSkill[];
  projects: VRow[];
  education: VRow[];
  references: VReference[];
  /* Las certificaciones tienen kind propio en el enum y NADIE las pintaba: entraban
     al master (alta manual) y desaparecían de la pantalla. Se listan junto a
     educación, que es donde el usuario las busca ("Educación y certificaciones"). */
  certifications: VRow[];
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

/* ============================================================================
   F · CAMPOS DE VERDAD (no strings fusionados) + FECHAS ACCIONABLES

   Todo lo de aquí abajo es PURO y está exportado a propósito: es la lógica que
   decide qué se guarda, y guardar mal en el master es pérdida de dato silenciosa.
   ⚠ patchMasterItem (lib/db/variants.ts) hace .update({ data }): REEMPLAZA la
   columna entera. Mandar «solo la fecha» borraría title, company y location del
   rol sin un error. Por eso NADA construye un `data` desde cero: todo parte del
   spread de la data previa, y eso se prueba en tests/master-inline.test.ts.
   ============================================================================ */

/** Filas densas con campos propios. El kind es el de profile_items. */
export type RowKind = "project" | "education" | "certification";

/** Campos editables de cada fila densa. `key` es la clave REAL en data. */
export const ROW_FIELDS: Record<RowKind, { key: string; ph: string }[]> = {
  project: [
    { key: "name", ph: "master.draft.projectName" },
    { key: "description", ph: "master.draft.projectDesc" },
    { key: "url", ph: "master.field.url" },
  ],
  education: [
    { key: "degree", ph: "master.draft.degree" },
    { key: "institution", ph: "master.draft.institution" },
  ],
  certification: [
    { key: "name", ph: "master.draft.certName" },
    { key: "issuer", ph: "master.draft.issuer" },
  ],
};

/* Qué filas llevan fecha (y por tanto editor de fechas y aviso «falta fecha»).
   Los proyectos NO: en este modelo un proyecto se imprime como «nombre —
   descripción» (queries.ts · buildResumeData), así que un editor de fechas ahí
   editaría un campo que nunca llega al PDF. El preview ES el PDF. */
export const ROW_HAS_DATES: Record<RowKind, boolean> = {
  project: false,
  education: true,
  certification: true,
};

/** Lo que se puede borrar del master (kind del profile_item). `reference` está aquí
 *  porque si no, el borrado de una referencia se saldría por el `else` (que asume
 *  «es una viñeta, quítala de su rol»): la tarjeta no desaparecería, el aviso de
 *  «lo usan N variantes» no se pintaría, y el DELETE chocaría con el RESTRICT
 *  devolviendo un error crudo de Postgres. */
type DelKind = "work" | "bullet" | "skill" | "reference" | RowKind;

/** En qué lista de la vista vive cada kind de fila. */
type RowSec = "projects" | "education" | "certifications";
const ROW_SECTION: Record<RowKind, RowSec> = {
  project: "projects",
  education: "education",
  certification: "certifications",
};

/** ¿Falta la fecha de esta fila? Sentinela en ES; `tWarn` lo traduce al pintar. */
export function rowWarn(kind: RowKind, data: Record<string, unknown>): string | undefined {
  if (!ROW_HAS_DATES[kind]) return undefined;
  return str(data, "dates").trim() ? undefined : "falta fecha";
}

/** work.data → los campos que pinta la tarjeta. Es la ÚNICA derivación: la usan la
    carga, el alta manual y cada edición, así que el aviso de fecha no puede quedar
    desfasado del dato (antes había un gemelo en createdToRole que se olvidaba). */
export function roleFieldsFromData(data: Record<string, unknown>): {
  tt: string;
  company: string;
  location: string;
  dates: string;
  warn?: string;
} {
  const dates = str(data, "dates");
  return {
    tt: str(data, "title"),
    company: str(data, "company"),
    location: str(data, "location"),
    dates,
    warn: dates.trim() ? undefined : "falta fecha",
  };
}

/**
 * Fusiona UN campo sobre la data existente y devuelve la data COMPLETA.
 * Vacío borra la clave (no se guarda "" fingiendo que hay dato), pero todo lo
 * demás viaja intacto — que es justo lo que el PATCH necesita para no vaciar el item.
 */
export function mergeField(
  data: Record<string, unknown>,
  field: string,
  value: string,
): Record<string, unknown> {
  const next = { ...data };
  const clean = value.trim();
  if (clean) next[field] = clean;
  else delete next[field];
  return next;
}

/* Claves de procedencia de la fecha. Se recalculan ENTERAS en cada guardado: si no,
   un `dateInvalid` viejo se quedaría contradiciendo la fecha nueva. */
const DATE_META = ["dateStart", "dateEnd", "dateCurrent", "dateMissing", "dateInvalid", "dateByHuman"];

export type DateSave =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: "invalid" | "unreadable" };

/**
 * data + la fecha que escribió el humano. Espeja PATCH /api/staging (§C2): se
 * NORMALIZA con normalizeDateRange y, si el rango es imposible o no se entiende,
 * NO se guarda — se devuelve el motivo para decirlo en pantalla. Nunca se guarda
 * fingiendo que está bien. Vacío = quitar la fecha (queda `dateMissing`, honesto).
 */
export function mergeDates(data: Record<string, unknown>, raw: string): DateSave {
  const text = (raw ?? "").trim();
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!DATE_META.includes(k)) next[k] = v;

  if (!text) {
    delete next.dates;
    next.dateMissing = true;
    return { ok: true, data: next };
  }
  const dr = normalizeDateRange(text);
  if (dr.invalid) return { ok: false, reason: "invalid" };
  if (!dr.start && !dr.end && !dr.current) return { ok: false, reason: "unreadable" };

  next.dates = text;
  next.dateByHuman = true; // la fecha la puso una persona, no la IA
  if (dr.start) next.dateStart = dr.start;
  if (dr.end) next.dateEnd = dr.end;
  if (dr.current) next.dateCurrent = true;
  return { ok: true, data: next };
}

export type DateHint =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "unreadable" }
  | { kind: "ok"; range: DateRange };

/** Qué se ENTIENDE de lo que se está escribiendo. Se pinta bajo el input mientras
    se teclea: nadie debe guardar una fecha creyendo que dice otra cosa. */
export function describeDate(raw: string): DateHint {
  const text = (raw ?? "").trim();
  if (!text) return { kind: "empty" };
  const dr = normalizeDateRange(text);
  if (dr.invalid) return { kind: "invalid" };
  if (!dr.start && !dr.end && !dr.current) return { kind: "unreadable" };
  return { kind: "ok", range: dr };
}

/** «sigue abierto»: conserva el inicio y marca el término como actualidad. Solo
    parte por un guion CON espacios alrededor, para no destrozar «03-2022». */
export function withPresent(raw: string, presentWord: string): string {
  const start = (raw ?? "").trim().replace(/\s+[–—-]\s+.*$/, "").trim();
  return start ? `${start} – ${presentWord}` : "";
}

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
// company y location van por separado, igual que en la DB: la maqueta no puede
// enseñar una forma de dato que la pantalla real no sepa editar.
interface DemoRole { tt: string; co: string; loc: string; dates: string; src: SrcKey; warn?: string; ev: string; bullets: DemoBullet[] }

const DEMO_EXP: DemoRole[] = [
  {
    tt: "Backend Developer", co: "Altiplano Pagos SpA", loc: "Santiago", dates: "mar 2022 – hoy", src: "tx",
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
    tt: "Backend Developer — equipo Checkout", co: "Rayén Retail S.A.", loc: "Santiago", dates: "ene 2020 – feb 2022", src: "cv",
    ev: "Fusionado por ti desde CV_2023.pdf y texto pegado (staging, 12 jul).",
    bullets: [
      { tx: "Desarrollé y mantuve APIs del checkout (Node.js, PostgreSQL).", src: "cv", num: false, nudge: "¿qué volumen movían?" },
      { tx: "Implementé el flujo de cupones y descuentos del checkout.", src: "cv", num: false },
      { tx: "Atendí incidentes de producción durante cyber days.", src: "q", num: false, nudge: "¿cuántos peaks? ¿qué tráfico?" },
      { tx: "Automaticé reportes de ventas diarios para operaciones.", src: "cv", num: false },
    ],
  },
  {
    tt: "Desarrollador freelance", co: "Independiente", loc: "Santiago", dates: "2019 – …", warn: "falta fecha de término", src: "q",
    ev: "«Antes de Rayén trabajé por mi cuenta un año…» — el año de término no quedó registrado.",
    bullets: [
      { tx: "Construí sitios y APIs para 4 pymes chilenas.", src: "q", num: true },
      { tx: "Sistema de reservas para un centro deportivo (Django), en producción desde 2020.", src: "web", num: true },
      { tx: "Administré hosting y dominios de clientes.", src: "cv", num: false },
    ],
  },
  {
    tt: "Práctica profesional — Área TI", co: "Universidad Andrés Bello", loc: "Santiago", dates: "2018 – 2019", src: "cv",
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

// La maqueta guarda CAMPOS, igual que la DB. Antes era un `tx` fusionado y por eso
// la edición tenía que volver a partirlo por " — " (y lo repartía mal).
const DEMO_PJ: { data: Record<string, unknown>; m: string }[] = [
  { data: { name: "idempotency-go", description: "librería open source de idempotencia en Go", url: "github.com/dgatica/idempotency-go" }, m: "github · 214 KB · 41 commits" },
  { data: { name: "reservas-club", description: "sistema de reservas en Django" }, m: "dgatica.cl · en producción" },
  { data: { name: "scraper-sii", description: "CLI de series de tipo de cambio" }, m: "github · Python · 67 KB" },
  { data: { name: "dgatica.cl", description: "portfolio con 6 casos documentados" }, m: "Next.js" },
];

const DEMO_ED: { data: Record<string, unknown>; m: string }[] = [
  { data: { degree: "Ingeniería Civil en Computación e Informática", institution: "Universidad Andrés Bello", dates: "2014 – 2019" }, m: "CV_2023.pdf" },
  { data: { degree: "Diplomado en Ingeniería de Datos", institution: "Pontificia Universidad Católica", dates: "2022" }, m: "CV_2023.pdf" },
  // Sin fecha a propósito: es el caso que el filtro «sin fechas» tiene que pescar.
  { data: { degree: "Inglés B2", institution: "autoevaluación" }, m: "cuestionario" },
];

const DEMO_CE: { data: Record<string, unknown>; m: string }[] = [
  { data: { name: "AWS Certified Solutions Architect — Associate", issuer: "Amazon Web Services", dates: "2023" }, m: "CV_2023.pdf" },
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
    roles: DEMO_EXP.map((e, ei) => {
      const data = { title: e.tt, company: e.co, location: e.loc, dates: e.dates };
      return {
        id: `demo-work-${ei}`, data,
        ...roleFieldsFromData(data),
        // El aviso explícito de la maqueta manda sobre el derivado (hay un rol CON
        // fecha de inicio al que le falta el TÉRMINO: eso no lo ve `dates.trim()`).
        warn: e.warn ?? roleFieldsFromData(data).warn,
        origin: SRC[e.src], evidence: e.ev,
        bullets: e.bullets.map((b, bi) => ({ id: `demo-b-${ei}-${bi}`, data: { text: b.tx }, tx: b.tx, num: b.num, origin: SRC[b.src], evidence: null, nudge: b.nudge })),
      };
    }),
    skills: DEMO_SK_GROUPS.map((g, gi) => ({
      id: `demo-sk-${gi}`, data: {}, group: g.group, chips: chipsFromCsv(g.items),
      origin: SRC[g.src], evidence: g.ev, verified: !!g.ev,
    })),
    projects: DEMO_PJ.map((p, i) => ({ id: `demo-pj-${i}`, kind: "project" as RowKind, data: p.data, m: p.m, warn: rowWarn("project", p.data) })),
    education: DEMO_ED.map((d, i) => ({ id: `demo-ed-${i}`, kind: "education" as RowKind, data: d.data, m: d.m, warn: rowWarn("education", d.data) })),
    certifications: DEMO_CE.map((c, i) => ({ id: `demo-ce-${i}`, kind: "certification" as RowKind, data: c.data, m: c.m, warn: rowWarn("certification", c.data) })),
    // La maqueta NO trae referencias, y es una decisión: inventar un «jefe de
    // Diego» con su correo sería enseñar datos de una persona ficticia como si
    // fueran los contactos reales de alguien. La sección se abre vacía y con su
    // aviso, que es exactamente lo que verá una cuenta nueva.
    references: [],
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
    return {
      id: w.id,
      data: w.data,
      ...roleFieldsFromData(w.data),
      origin: originLabel(w.origin),
      evidence: w.evidenceSnippet,
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

  // La meta de la derecha es SOLO procedencia. Antes arrastraba dato editable
  // (la url del proyecto, las fechas de educación) a un sitio de solo lectura.
  const row = (kind: RowKind) => (r: ApiItem): VRow => ({
    id: r.id,
    kind,
    data: r.data,
    m: originLabel(r.origin),
    warn: rowWarn(kind, r.data),
  });

  return {
    basics,
    summary,
    roles,
    skills,
    projects: by("project").map(row("project")),
    education: by("education").map(row("education")),
    certifications: by("certification").map(row("certification")),
    // Sin esta línea las referencias entrarían al master y NO SE PINTARÍAN: este
    // `by(kind)` es una lista explícita, y un kind que no se nombre desaparece de
    // la pantalla sin error. Con datos de terceros, «guardado pero invisible» es el
    // peor estado posible — el usuario no puede ni revisarlo ni borrarlo.
    references: by("reference").map((r) => ({ id: r.id, data: r.data, origin: originLabel(r.origin) })),
  };
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "todo" },
  { key: "sin-cifra", label: "sin cifra" },
  { key: "sin-evidencia", label: "⚠ sin evidencia" },
  { key: "sin-fechas", label: "sin fechas" },
  { key: "posibles-duplicados", label: "posibles duplicados" },
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
type DraftSection = "work" | "bullet" | "project" | "education" | "certification";
interface DraftField {
  key: string;
  ph: string; // clave i18n del placeholder
}
const DATES_FIELD: DraftField = { key: "dates", ph: "master.draft.dates" };
const DRAFT_FIELDS: Record<DraftSection, DraftField[]> = {
  work: [
    { key: "title", ph: "master.draft.title" },
    { key: "company", ph: "master.field.company" },
    { key: "location", ph: "master.field.location" },
    DATES_FIELD,
  ],
  bullet: [{ key: "text", ph: "master.draft.bullet" }],
  // Las filas densas usan LOS MISMOS campos que luego se editan en su sitio: dar
  // de alta y corregir escriben exactamente las mismas claves.
  project: ROW_FIELDS.project,
  education: [...ROW_FIELDS.education, DATES_FIELD],
  certification: [...ROW_FIELDS.certification, DATES_FIELD],
};
const DRAFT_KIND: Record<DraftSection, string> = {
  work: "work",
  bullet: "bullet",
  project: "project",
  education: "education",
  certification: "certification",
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
  // Misma derivación que la carga (roleFieldsFromData): no hay gemelo que se olvide.
  return {
    id: it.id, data: it.data,
    ...roleFieldsFromData(it.data),
    origin: MANUAL_LABEL, evidence: it.evidenceSnippet ?? null, bullets: [],
  };
}
function createdToRow(kind: RowKind, it: CreatedItem): VRow {
  return { id: it.id, kind, data: it.data, m: MANUAL_LABEL, warn: rowWarn(kind, it.data) };
}
function createdToSkill(it: CreatedItem): VSkill {
  return {
    id: it.id, data: it.data,
    group: String(it.data.group ?? "") || "Habilidades",
    chips: chipsFromCsv(String(it.data.items ?? "")),
    origin: MANUAL_LABEL, evidence: it.evidenceSnippet ?? null, verified: false,
  };
}

/* ── Un campo editable EN SU SITIO ───────────────────────────────────────────
   contenteditable como el resto de la pantalla, pero con placeholder pintado por
   CSS (:empty::before con data-ph): un campo vacío tiene que VERSE y poder
   pincharse, si no un rol sin empresa deja un hueco de 0 px imposible de enfocar.
   `onCommit` recibe el texto ya recortado; comparar con el valor previo es cosa
   del llamante (el blur salta también cuando no se tocó nada). */
export function EditableField({
  value,
  ph,
  aria,
  className,
  onCommit,
}: {
  value: string;
  ph: string;
  aria: string;
  className?: string;
  onCommit: (text: string) => void;
}) {
  return (
    <span
      className={`ms-ed${className ? ` ${className}` : ""}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label={aria}
      data-ph={ph}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => onCommit((e.currentTarget.textContent ?? "").trim())}
    >
      {value}
    </span>
  );
}

/* ── La fecha, accionable ────────────────────────────────────────────────────
   Cerrada: el valor (o el aviso «⚠ falta fecha», que es un BOTÓN, no un cartel).
   Abierta: un input que se valida con normalizeDateRange ANTES de guardar y que
   dice en voz alta qué entendió.

   ⚠ data-warn="fechas" vive en el envoltorio, no en el aviso: así el atributo
   sigue presente mientras el editor está abierto y el filtro «sin fechas» no
   pierde el item a media edición. Es lo que lee el useLayoutEffect del filtro. */
export function DateCell({
  dates,
  warn,
  warnLabel,
  label,
  open,
  draft,
  error,
  t,
  onOpen,
  onDraft,
  onSave,
  onCancel,
}: {
  dates: string;
  warn?: string;
  warnLabel: string;
  label: string;
  open: boolean;
  draft: string;
  error?: "invalid" | "unreadable" | null;
  t: (k: string) => string;
  onOpen: () => void;
  onDraft: (v: string) => void;
  onSave: (raw: string) => void;
  onCancel: () => void;
}) {
  const hasDate = !!dates.trim();
  const warnAttr = warn ? { "data-warn": "fechas" } : {};

  if (!open) {
    return (
      <span className="ms-date" {...warnAttr}>
        <button
          type="button"
          className={`ms-date__btn${warn ? " ms-date__btn--warn" : ""}`}
          aria-label={`${t("master.date.ariaEdit")}${label}`}
          onClick={onOpen}
        >
          {hasDate ? <span className="ms-date__val">{dates}</span> : null}
          {warn ? (
            <span className="warn">
              ⚠ {warnLabel} · {hasDate ? t("master.date.fix") : t("master.date.add")}
            </span>
          ) : null}
          {!hasDate && !warn ? <span className="ms-date__addtx">{t("master.date.add")}</span> : null}
        </button>
      </span>
    );
  }

  const hint = describeDate(draft);
  const shown = error ?? (hint.kind === "invalid" || hint.kind === "unreadable" ? hint.kind : null);
  // Vacío solo se puede guardar si HABÍA fecha: es «quitarla», una acción explícita.
  const canSave = hint.kind === "ok" || (hint.kind === "empty" && hasDate);
  let hintText = "";
  if (shown === "invalid") hintText = t("master.date.invalid");
  else if (shown === "unreadable") hintText = t("master.date.unreadable");
  else if (hint.kind === "ok") {
    const a = hint.range.start ?? "?";
    const b = hint.range.current ? t("master.date.currentLabel") : hint.range.end;
    hintText = t("master.date.understood").replace("{range}", b ? `${a} – ${b}` : a);
  }

  return (
    <span className="ms-date ms-date--open" {...warnAttr}>
      <input
        className="c-input ms-date__in"
        autoFocus
        value={draft}
        placeholder={t("master.date.placeholder")}
        aria-label={`${t("master.date.ariaInput")} — ${label}`}
        aria-invalid={shown ? true : undefined}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (canSave) onSave(draft);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <button
        type="button"
        className="ms-date__now"
        title={t("master.date.currentHint")}
        onClick={() => onDraft(withPresent(draft, t("master.date.presentWord")))}
      >
        {t("master.date.current")}
      </button>
      <button type="button" className="ms-date__save" disabled={!canSave} onClick={() => onSave(draft)}>
        {hint.kind === "empty" && hasDate ? t("master.date.clear") : t("master.date.save")}
      </button>
      <button type="button" className="ms-date__cancel" aria-label={t("common.cancel")} onClick={onCancel}>
        ✕
      </button>
      {hintText ? (
        <span className="ms-date__hint" data-bad={shown ? "1" : undefined} role="status">
          {hintText}
        </span>
      ) : null}
    </span>
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

  // Alta manual (A1): filas en edición por sección.
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // «¿dónde se usa?» (carga perezosa al expandir la procedencia). itemId → uso.
  const [usage, setUsage] = useState<Record<string, ItemUsage | "loading">>({});
  // Aviso inline del borrado/reclasificación bloqueado por el RESTRICT de variantes.
  const [blocked, setBlocked] = useState<Record<string, ItemUsage>>({});
  // Menú de alta global.
  const [addMenu, setAddMenu] = useState(false);

  // F · edición de fechas en su sitio. Clave = el displayId del item (sirve igual
  // para los ids de la maqueta). El error es el que devolvió mergeDates al intentar
  // guardar: se queda visible hasta que el texto cambia.
  const [openDate, setOpenDate] = useState<ReadonlySet<string>>(new Set());
  const [dateDraft, setDateDraft] = useState<Record<string, string>>({});
  const [dateError, setDateError] = useState<Record<string, "invalid" | "unreadable">>({});

  /* A4 · limpieza retroactiva de duplicados. La sospecha NO se persiste: se pide
     al servidor, que la calcula al vuelo sobre el master de ahora mismo. Resolver
     un clúster muta el master, así que después de cada resolución se vuelve a
     pedir todo — una marca cacheada quedaría rancia en ese mismo instante. */
  const [dups, setDups] = useState<ClusterDuplicado[]>([]);
  // id del item cuya tarjeta tiene el comparador abierto (no el del clúster: el
  // panel se pinta bajo la tarjeta que el usuario pinchó, que es la que mira).
  const [openDup, setOpenDup] = useState<string | null>(null);
  // «${clusterId}:${campo}» → id del miembro elegido, o "ambas" en las listas.
  const [dupPick, setDupPick] = useState<Record<string, string>>({});
  const [dupVinetas, setDupVinetas] = useState<"reenganchar" | "descartar">("reenganchar");
  const [dupBusy, setDupBusy] = useState(false);
  // El RESTRICT de variantes. Guarda los argumentos EXACTOS de la llamada que se
  // bloqueó: reintentar con force tiene que repetir la decisión del usuario, no
  // una reconstruida (que podría no ser la que él vio).
  const [dupBlocked, setDupBlocked] = useState<
    {
      variantsCount: number;
      overridesCount: number;
      args: { keepId: string; dropIds: string[]; data: Record<string, string> | null };
    } | null
  >(null);

  /* ── B · BARRIDO DEL MASTER CON IA ──────────────────────────────────────────
     Revisar los 105 items DE UNA, en dos pasos. `barResult` es lo que devuelve
     ANALIZAR (una lista de propuestas, nada aplicado). `barSel` son las
     correcciones aplicables que el usuario deja marcadas: por defecto TODAS, pero
     cada una se puede desmarcar (ajuste individual antes de aplicar el lote). El
     APLICAR se DIFIERE por el UndoToast, así que el lote entero es reversible con
     un solo deshacer: hasta que la ventana expira, no se ha tocado nada. */
  const [barOpen, setBarOpen] = useState(false);
  const [barBusy, setBarBusy] = useState(false);
  const [barResult, setBarResult] = useState<ResultadoBarrido | null>(null);
  const [barError, setBarError] = useState("");
  const [barSel, setBarSel] = useState<ReadonlySet<string>>(new Set());

  /* ── B · REFERENCIAS ────────────────────────────────────────────────────────
     Los ITEMS viven en `view.references` (salen de /api/master como cualquier otro
     profile_item). Los VÍNCULOS no: son una tabla aparte y los trae /api/references,
     así que van en su propio estado indexado por id de referencia. Dos fetches y no
     uno porque son dos consultas que fallan por motivos distintos — y la de los
     vínculos puede fallar SOLA si el usuario aplicó la 0004 y todavía no la 0005.

     `refsMigration` es esa honestidad: en vez de una sección muda o un error crudo
     de Postgres, la pantalla dice qué migración falta y qué hacer. */
  const [refLinks, setRefLinks] = useState<Record<string, { itemId: string; relation: string | null }[]>>({});
  const [refsMigration, setRefsMigration] = useState(false);
  // Borrador del alta: no reutiliza `Draft` porque una referencia tiene seis campos,
  // el aviso de permiso encima y un selector de vínculos — no es una fila más.
  const [refDraft, setRefDraft] = useState<Record<string, string> | null>(null);
  const [refError, setRefError] = useState<string>("");

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
  // Misma razón para el resto de la vista: dos ediciones seguidas del MISMO item
  // (empresa y acto seguido la fecha) tienen que fusionar sobre el último dato, no
  // sobre el del render — o el segundo PATCH pisa al primero.
  const viewRef = useRef<MasterView | null>(view);

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

  // viewRef al día con CUALQUIER setView (carga, borrado, chips, alta…).
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  /* Escribe sobre la vista partiendo del ÚLTIMO estado (viewRef), no del render. */
  const mutateView = useCallback((fn: (v: MasterView) => MasterView) => {
    const cur = viewRef.current;
    if (!cur) return;
    const next = fn(cur);
    viewRef.current = next;
    setView(next);
  }, []);

  /* ── F · guardar UN campo de un item ────────────────────────────────────────
     ⚠⚠ patchMasterItem (lib/db/variants.ts) hace .update({ data }): REEMPLAZA la
     columna entera. Por eso `nextData` sale SIEMPRE de mergeField/mergeDates sobre
     la data previa y se manda completa. Mandar {dates} a secas borraría title,
     company y location del rol sin un solo error. */
  const saveRoleData = useCallback(
    (i: number, displayId: string, nextData: Record<string, unknown>) => {
      const role = viewRef.current?.roles[i];
      if (!role) return;
      mutateView((v) => ({
        ...v,
        roles: v.roles.map((r, idx) => {
          if (idx !== i) return r;
          const f = roleFieldsFromData(nextData);
          // Mientras el texto de la fecha no cambie, se respeta el aviso que ya
          // tuviera (p. ej. «falta fecha de término», que `dates.trim()` no ve).
          return { ...r, data: nextData, ...f, warn: f.dates === r.dates ? r.warn : f.warn };
        }),
      }));
      setTouched((prev) => (prev.has(displayId) ? prev : new Set(prev).add(displayId)));
      saveEdit(role.id, nextData);
    },
    [mutateView, saveEdit],
  );

  const saveRowData = useCallback(
    (sec: RowSec, i: number, displayId: string, nextData: Record<string, unknown>) => {
      const cur = viewRef.current?.[sec][i];
      if (!cur) return;
      mutateView((v) => ({
        ...v,
        [sec]: v[sec].map((r, idx) => (idx === i ? { ...r, data: nextData, warn: rowWarn(r.kind, nextData) } : r)),
      }));
      setTouched((prev) => (prev.has(displayId) ? prev : new Set(prev).add(displayId)));
      saveEdit(cur.id, nextData);
    },
    [mutateView, saveEdit],
  );

  /* ── F · el editor de fechas en su sitio ────────────────────────────────────
     El aviso «⚠ falta fecha» abre ESTO, no un modal. Guardar pasa por mergeDates:
     si el rango es imposible o no se entiende, NO se guarda y se dice por qué. */
  const openDateEditor = useCallback((displayId: string, current: string) => {
    setDateDraft((p) => ({ ...p, [displayId]: current }));
    setDateError((p) => {
      const { [displayId]: _drop, ...rest } = p;
      return rest;
    });
    setOpenDate((p) => new Set(p).add(displayId));
  }, []);

  const closeDateEditor = useCallback((displayId: string) => {
    setOpenDate((p) => {
      const n = new Set(p);
      n.delete(displayId);
      return n;
    });
    setDateError((p) => {
      const { [displayId]: _drop, ...rest } = p;
      return rest;
    });
  }, []);

  // Al teclear se retira el error del intento anterior: ya no habla de este texto.
  const setDateDraftFor = useCallback((displayId: string, value: string) => {
    setDateDraft((p) => ({ ...p, [displayId]: value }));
    setDateError((p) => {
      if (!p[displayId]) return p;
      const { [displayId]: _drop, ...rest } = p;
      return rest;
    });
  }, []);

  const saveRoleDate = useCallback(
    (i: number, displayId: string, raw: string) => {
      const role = viewRef.current?.roles[i];
      if (!role) return;
      const res = mergeDates(role.data, raw);
      if (!res.ok) {
        setDateError((p) => ({ ...p, [displayId]: res.reason }));
        return;
      }
      saveRoleData(i, displayId, res.data);
      closeDateEditor(displayId);
    },
    [saveRoleData, closeDateEditor],
  );

  const saveRowDate = useCallback(
    (sec: RowSec, i: number, displayId: string, raw: string) => {
      const row = viewRef.current?.[sec][i];
      if (!row) return;
      const res = mergeDates(row.data, raw);
      if (!res.ok) {
        setDateError((p) => ({ ...p, [displayId]: res.reason }));
        return;
      }
      saveRowData(sec, i, displayId, res.data);
      closeDateEditor(displayId);
    },
    [saveRowData, closeDateEditor],
  );

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
      if (section === "project" || section === "education" || section === "certification") {
        const sec = ROW_SECTION[section];
        return { ...prev, [sec]: [...prev[sec], createdToRow(section, it)] };
      }
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
    (kind: DelKind, id: string, parentId?: string | null) => {
      setView((prev) => {
        if (!prev) return prev;
        if (kind === "work") return { ...prev, roles: prev.roles.filter((r) => r.id !== id) };
        if (kind === "skill") return { ...prev, skills: prev.skills.filter((s) => s.id !== id) };
        if (kind === "reference") return { ...prev, references: prev.references.filter((r) => r.id !== id) };
        if (kind === "project" || kind === "education" || kind === "certification") {
          const sec = ROW_SECTION[kind];
          return { ...prev, [sec]: prev[sec].filter((r) => r.id !== id) };
        }
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
      kind: DelKind,
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
    (kind: DelKind, id: string, label: string, parentId?: string | null) => {
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

  /* A4 · los posibles duplicados que YA están en el master. Se piden aparte del
     registro porque su coste es otro (O(n²) comparaciones) y porque hay que
     volver a pedirlos cada vez que el master cambia. Un fallo aquí NO puede
     tumbar la pantalla: sin sospechas se sigue editando igual. */
  const loadDups = useCallback(() => {
    if (!supabaseEnabled) return;
    void (async () => {
      try {
        const res = await fetch("/api/master/duplicados");
        if (!res.ok) return;
        const j = (await res.json()) as { clusters?: ClusterDuplicado[] };
        setDups(j.clusters ?? []);
      } catch {
        setDups([]);
      }
    })();
  }, []);

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
        if (active) setView({ basics: null, summary: null, roles: [], skills: [], projects: [], education: [], certifications: [], references: [] });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /* Los VÍNCULOS de las referencias (tabla reference_links). Va aparte de la carga
     del master a propósito: si las migraciones 0004/0005 no están aplicadas, esto
     falla y el resto del registro tiene que seguir cargando igual. El aviso que se
     pinta entonces dice qué falta, no «error». */
  const loadRefLinks = useCallback(() => {
    if (!supabaseEnabled) return;
    void (async () => {
      try {
        const res = await fetch("/api/references");
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as {
          references?: { id: string; links?: { itemId: string; relation: string | null }[] }[];
          migracionPendiente?: boolean;
        };
        const mapa: Record<string, { itemId: string; relation: string | null }[]> = {};
        for (const r of j.references ?? []) mapa[r.id] = r.links ?? [];
        setRefLinks(mapa);
        setRefsMigration(Boolean(j.migracionPendiente));
      } catch {
        // No se sabe si es la migración o la red: no se afirma ninguna de las dos.
        // Los items siguen visibles; lo que se pierde es el detalle del vínculo.
        setRefLinks({});
      }
    })();
  }, []);
  useEffect(() => loadRefLinks(), [loadRefLinks]);

  useEffect(() => loadDups(), [loadDups]);

  // item → clúster, para que la tarjeta sepa en O(1) si está sospechada (el
  // registro roto trae 105 items: recorrer la lista por tarjeta sería cuadrático).
  const dupIndex = useMemo(() => {
    const m = new Map<string, ClusterDuplicado>();
    for (const c of dups) for (const mi of c.miembros) m.set(mi.id, c);
    return m;
  }, [dups]);

  /* Resolver MUTA el master (un item deja de existir y otro cambia de campos), así
     que hay que releer las dos cosas: el registro y las sospechas. Recalcular las
     sospechas sobre el master viejo dejaría marcas apuntando a items borrados. */
  const refrescarMaster = useCallback(() => {
    void (async () => {
      try {
        const res = await fetch("/api/master");
        const data = await res.json();
        setView(buildRealView((data.items ?? []) as ApiItem[]));
      } catch {
        /* si falla la relectura, la vista de antes sigue siendo la última buena */
      }
      loadDups();
    })();
  }, [loadDups]);

  /* ── A4 · las TRES ACCIONES, que son una sola llamada ───────────────────────
     «quedarme con esta» y «quedarme con la otra» son la misma con los papeles
     cambiados; «fusionar» añade los campos elegidos. NUNCA se llama sin que el
     usuario haya pulsado: no hay resolución automática ni en lote. */
  const resolverDup = useCallback(
    (keepId: string, dropIds: string[], data: Record<string, string> | null, force: boolean) => {
      if (!supabaseEnabled || !keepId || dropIds.length === 0) return;
      setDupBusy(true);
      setDupBlocked(null);
      void (async () => {
        try {
          const res = await fetch("/api/master/resolver", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keepId, dropIds, data: data ?? undefined, vinetas: dupVinetas, force }),
          });
          if (res.status === 409) {
            // Lo que se descarta lo usa alguna variante. Se AVISA con el dato real
            // y se deja el panel abierto: el usuario decide si sigue.
            const j = (await res.json()) as { usage?: { variantsCount: number; overridesCount: number } };
            const u = j.usage ?? { variantsCount: 0, overridesCount: 0 };
            setDupBlocked({
              variantsCount: u.variantsCount,
              overridesCount: u.overridesCount,
              args: { keepId, dropIds, data },
            });
            return;
          }
          if (!res.ok) throw new Error();
          const j = (await res.json()) as { descartados?: string[] };
          noteSaved(t("master.dup.done").replace("{n}", String(j.descartados?.length ?? 0)));
          setOpenDup(null);
          refrescarMaster();
        } catch {
          noteSaved(t("master.dup.fail"));
        } finally {
          setDupBusy(false);
        }
      })();
    },
    [dupVinetas, noteSaved, refrescarMaster, t],
  );

  // Un panel abierto sobre una tarjeta que el filtro acaba de ocultar quedaría
  // huérfano (el filtro trabaja sobre [data-item], y el panel vive dentro).
  useEffect(() => {
    setOpenDup(null);
    setDupBlocked(null);
  }, [filter, query]);

  /* ── B · las dos llamadas del barrido ───────────────────────────────────────
     ANALIZAR (GET) es de solo lectura: trae la lista de propuestas. APLICAR (POST)
     ejecuta el lote — y se DIFIERE por el UndoToast, no se llama aquí de inmediato. */

  /** Clave estable de un hallazgo aplicable (para marcar/desmarcar). */
  const barKey = useCallback((h: Hallazgo): string => {
    if (h.tipo === "duplicado") return `dup:${h.fusion.keepId}`;
    if (h.tipo === "mal-clasificado") return `bad:${h.itemId}`;
    if (h.tipo === "fecha-ausente") return `date:${h.itemId}`;
    return `x:${(h as { itemId?: string }).itemId ?? ""}`; // consultivos: no se seleccionan
  }, []);

  /** ¿este hallazgo entra en el lote de «Aplicar»? (gemelo de esAplicable en barrido.ts). */
  const barAplicable = useCallback(
    (h: Hallazgo): boolean =>
      h.tipo === "duplicado" || h.tipo === "mal-clasificado" || h.tipo === "fecha-ausente",
    [],
  );

  const runBarrido = useCallback(() => {
    if (!supabaseEnabled) {
      setBarOpen(true);
      setBarError(t("master.barrido.localOff"));
      setBarResult(null);
      return;
    }
    setBarOpen(true);
    setBarBusy(true);
    setBarError("");
    void (async () => {
      try {
        const res = await fetch("/api/master/barrido");
        if (!res.ok) throw new Error();
        const j = (await res.json()) as ResultadoBarrido;
        setBarResult(j);
        // Por defecto, TODO lo aplicable queda marcado: el usuario desmarca lo que
        // no quiera. (Lo consultivo no se marca: no entra al lote.)
        const sel = new Set<string>();
        for (const h of j.hallazgos) if (barAplicable(h)) sel.add(barKey(h));
        setBarSel(sel);
      } catch {
        setBarError(t("master.barrido.fail"));
        setBarResult(null);
      } finally {
        setBarBusy(false);
      }
    })();
  }, [t, barAplicable, barKey]);

  const toggleBarSel = useCallback((key: string) => {
    setBarSel((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  /** Hallazgo aplicable → la corrección que se manda al POST. */
  const barCorreccion = useCallback((h: Hallazgo): Record<string, unknown> | null => {
    if (h.tipo === "duplicado") {
      return { tipo: "duplicado", keepId: h.fusion.keepId, dropIds: h.fusion.dropIds, data: h.fusion.data, vinetas: h.fusion.vinetas };
    }
    if (h.tipo === "mal-clasificado") {
      return { tipo: "reclasificar", itemId: h.itemId, group: h.group, items: h.items };
    }
    if (h.tipo === "fecha-ausente") {
      return { tipo: "fecha", itemId: h.itemId, dates: h.dates, sourceId: h.sourceId };
    }
    return null;
  }, []);

  /* APLICAR el lote. Se DIFIERE con el UndoToast: hasta que la ventana de gracia
     expira NO se ha tocado nada, así que un solo «deshacer» cancela el lote entero
     (la regla del encargo). Al confirmar, un único POST aplica todas las
     correcciones seleccionadas; las fusiones que tocan una variante vuelven en
     `bloqueadas` y se cuentan aparte (nunca un borrado a la brava). */
  const applyBarrido = useCallback(() => {
    if (!supabaseEnabled || !barResult) return;
    const correcciones = barResult.hallazgos
      .filter((h) => barAplicable(h) && barSel.has(barKey(h)))
      .map(barCorreccion)
      .filter((c): c is Record<string, unknown> => c !== null);
    if (correcciones.length === 0) return;

    setBarOpen(false);
    undo.show({
      message: t("master.barrido.undoBatch").replace("{n}", String(correcciones.length)),
      onUndo: () => setBarOpen(true), // nada se aplicó: se reabre el panel intacto
      onCommit: async () => {
        try {
          const res = await fetch("/api/master/barrido", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ correcciones }),
          });
          if (!res.ok) throw new Error();
          const j = (await res.json()) as { aplicadas?: number; bloqueadas?: unknown[] };
          const bloqueadas = j.bloqueadas?.length ?? 0;
          let msg = t("master.barrido.applied").replace("{n}", String(j.aplicadas ?? 0));
          if (bloqueadas > 0) msg += " · " + t("master.barrido.blocked").replace("{n}", String(bloqueadas));
          noteSaved(msg);
          setBarResult(null);
          refrescarMaster();
        } catch {
          noteSaved(t("master.barrido.fail"));
          setBarOpen(true); // volvió a fallar: el panel sigue disponible para reintentar
        }
      },
    });
  }, [barResult, barSel, barAplicable, barKey, barCorreccion, undo, t, noteSaved, refrescarMaster]);

  /* ── B · las tres escrituras de una referencia ──────────────────────────────
     Todas pasan por /api/references, NUNCA por /api/master/[id]: esa ruta valida
     el `data` contra un vocabulario cerrado que no conoce `role`, `org` ni
     `relation`, y rechazaría la edición con un mensaje que no explica nada.       */

  /** Los items del master a los que se puede anclar una referencia: roles y
   *  proyectos. Ni viñetas ni skills — el vínculo es «el trabajo que compartimos». */
  const linkables = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    for (const r of view?.roles ?? []) {
      if (!r.id || isLocalId(r.id)) continue;
      out.push({ id: r.id, label: [r.tt, r.company].filter(Boolean).join(" · ") || t("master.role.untitled") });
    }
    for (const p of view?.projects ?? []) {
      if (!p.id || isLocalId(p.id)) continue;
      out.push({ id: p.id, label: str(p.data, "name") || t("master.role.untitled") });
    }
    return out;
  }, [view, t]);

  /** Crea la referencia (POST /api/references) con sus vínculos en el MISMO gesto:
   *  una referencia guardada sin vínculo es medio dato y nadie vuelve a por él. */
  const createReference = useCallback(
    (values: Record<string, string>, links: { itemId: string; relation: string | null }[]) => {
      const data: Record<string, string> = {};
      for (const [k, val] of Object.entries(values)) {
        const clean = (val ?? "").trim();
        if (clean) data[k] = clean;
      }
      if (!data.name) {
        setRefError(t("master.ref.needName"));
        return;
      }
      if (!supabaseEnabled) {
        // Sin Supabase no se persiste nada, y no se finge que sí.
        noteSaved(t("master.saved.localAdd"));
        setRefDraft(null);
        setRefError("");
        return;
      }
      void (async () => {
        try {
          const res = await fetch("/api/references", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data, links }),
          });
          const j = (await res.json()) as { reference?: { id: string; data: Record<string, unknown> }; error?: string };
          if (!res.ok || !j.reference) throw new Error(j.error ?? `HTTP ${res.status}`);
          const nueva = j.reference;
          setView((prev) =>
            prev ? { ...prev, references: [...prev.references, { id: nueva.id, data: nueva.data, origin: MANUAL_LABEL }] } : prev,
          );
          setRefLinks((prev) => ({ ...prev, [nueva.id]: links }));
          setRefDraft(null);
          setRefError("");
          noteSaved(t("common.saved"));
        } catch (e) {
          setRefError(t("master.ref.saveFail").replace("{r}", e instanceof Error ? e.message : "error"));
        }
      })();
    },
    [noteSaved, t],
  );

  /** Edición en su sitio de un campo. `data` viaja COMPLETO (la ruta reemplaza la
   *  columna, igual que el resto del master): se parte del spread de la previa. */
  const saveReferenceField = useCallback(
    (ref: VReference, field: string, value: string) => {
      const nextData = mergeField(ref.data, field, value);
      setView((prev) =>
        prev ? { ...prev, references: prev.references.map((r) => (r.id === ref.id ? { ...r, data: nextData } : r)) } : prev,
      );
      if (!supabaseEnabled || !ref.id || isLocalId(ref.id)) {
        noteSaved(t("master.saved.localEdit"));
        return;
      }
      void (async () => {
        try {
          const res = await fetch(`/api/references/${ref.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: nextData }),
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

  /** Enciende o apaga UN vínculo. El cuerpo manda el conjunto DESEADO completo (la
   *  capa de datos hace la diferencia), no «añade este»: así dos clics seguidos no
   *  se pisan dejando un vínculo fantasma. */
  const toggleReferenceLink = useCallback(
    (refId: string | null, itemId: string) => {
      if (!refId) return;
      const actuales = refLinks[refId] ?? [];
      const dentro = actuales.some((l) => l.itemId === itemId);
      const next = dentro ? actuales.filter((l) => l.itemId !== itemId) : [...actuales, { itemId, relation: null }];
      setRefLinks((prev) => ({ ...prev, [refId]: next }));
      if (!supabaseEnabled || isLocalId(refId)) return;
      void (async () => {
        try {
          const res = await fetch(`/api/references/${refId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ links: next }),
          });
          if (!res.ok) throw new Error();
          noteSaved(t("common.saved"));
        } catch {
          // Se devuelve el estado anterior: dejar el chip encendido sería decir que
          // el vínculo existe cuando la base dice que no.
          setRefLinks((prev) => ({ ...prev, [refId]: actuales }));
          noteSaved(t("master.saved.fail"));
        }
      })();
    },
    [refLinks, noteSaved, t],
  );

  const v = view;
  const totalBullets = v ? v.roles.reduce((a, e) => a + e.bullets.length, 0) : 0;
  const total = v
    ? (v.basics ? 1 : 0) + (v.summary ? 1 : 0) + v.roles.length + totalBullets + v.skills.length +
      v.projects.length + v.education.length + v.certifications.length + v.references.length
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
      /* A4 · «posibles duplicados». Dos diferencias deliberadas con los filtros de
         arriba, que arrastran un defecto conocido:
         · data-dup lo emiten TODOS los tipos que el detector puede marcar (rol,
           grupo de habilidades y fila densa), no uno solo. data-num solo lo ponen
           las viñetas y data-ver solo los grupos, así que esos filtros esconden
           por omisión items que jamás podrían cumplir el criterio.
         · el `closest` mantiene visibles las VIÑETAS de un rol sospechado: están
           anidadas dentro de la tarjeta, y ocultarlas dejaría el rol sin el
           contenido que hay que comparar justo cuando se va a comparar. */
      if (ok && filter === "posibles-duplicados") {
        ok = it.dataset.dup === "1" || !!it.closest('[data-dup="1"]');
      }
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
      case "posibles-duplicados":
        return t("master.filter.dups");
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
    kind: DelKind,
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
    kind: DelKind,
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

  /* ══ A4 · LIMPIEZA RETROACTIVA DE DUPLICADOS ════════════════════════════════
     La marca en la tarjeta y, al abrirla, LAS DOS VERSIONES LADO A LADO CAMPO POR
     CAMPO con las tres acciones. Mismo vocabulario que la pantalla de staging
     (docs/spec/duplicados.md): se aprende a resolver un duplicado UNA vez.       */

  /** ¿Esta tarjeta está en algún clúster? Es lo que emite el atributo del filtro. */
  const dupAttr = (id: string | null): string => (id && dupIndex.has(id) ? "1" : "0");

  const tSignal = (s: string): string => {
    switch (s) {
      case "misma-empresa":
        return t("master.dup.sig.company");
      case "fechas-solapan":
        return t("master.dup.sig.dates");
      case "sin-fecha":
        return t("master.dup.sig.noDate");
      case "contenido":
        return t("master.dup.sig.content");
      case "misma-fuente":
        return t("master.dup.sig.source");
      default:
        return s;
    }
  };

  const dupNombre = (m: MiembroDuplicado): string => m.titulo.trim() || t("master.role.untitled");

  /* Preselección de la fusión. NO es una decisión del sistema: no se escribe nada
     hasta que el usuario pulsa «fusionar» con las dos versiones delante. Solo
     evita arrancar con el campo VACÍO ganando, que es el caso típico («la fecha de
     LinkedIn con el detalle narrativo del cuestionario»). */
  const dupPickFor = (c: ClusterDuplicado, clave: string): string => {
    const elegido = dupPick[`${c.id}:${clave}`];
    if (elegido) return elegido;
    if (c.kind === "skill" && clave === "items") return "ambas";
    const conValor = c.miembros.find((m) => (m.campos.find((f) => f.clave === clave)?.valor ?? "").trim());
    return (conValor ?? c.miembros[0]!).id;
  };

  /* Para un grupo de habilidades, quedarse con UNA de las dos listas pierde los
     chips de la otra en silencio — «Lenguajes» duplicado tiene TypeScript en una y
     JavaScript en la otra. Por eso la lista ofrece «las dos», y el usuario ve la
     unión ya calculada antes de confirmarla. */
  const dupUnion = (c: ClusterDuplicado, clave: string): string => {
    let chips: string[] = [];
    for (const m of c.miembros) {
      chips = mergeChips(chips, chipsFromCsv(m.campos.find((f) => f.clave === clave)?.valor ?? "")).chips;
    }
    return chipsToCsv(chips);
  };

  const dupValor = (c: ClusterDuplicado, clave: string): string => {
    const sel = dupPickFor(c, clave);
    if (sel === "ambas") return dupUnion(c, clave);
    return c.miembros.find((m) => m.id === sel)?.campos.find((f) => f.clave === clave)?.valor ?? "";
  };

  const dupDataFusion = (c: ClusterDuplicado): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const campo of c.miembros[0]?.campos ?? []) out[campo.clave] = dupValor(c, campo.clave);
    return out;
  };

  const setPick = (c: ClusterDuplicado, clave: string, valor: string) =>
    setDupPick((p) => ({ ...p, [`${c.id}:${clave}`]: valor }));

  /** «⚠ posible duplicado de: …» en la tarjeta. Abre el comparador. */
  const dupMark = (id: string | null): ReactNode => {
    const c = id ? dupIndex.get(id) : undefined;
    if (!id || !c) return null;
    const otros = c.miembros
      .filter((m) => m.id !== id)
      .map(dupNombre)
      .join(", ");
    return (
      <button
        type="button"
        className="ms-dup__mark"
        aria-expanded={openDup === id}
        aria-label={t("master.dup.markAria")}
        title={c.reason}
        onClick={() => setOpenDup((p) => (p === id ? null : id))}
      >
        {t("master.dup.mark").replace("{item}", otros)}
      </button>
    );
  };

  /** El aviso del RESTRICT dentro del comparador (nunca un 500 crudo). */
  const dupBlockedWarning = (): ReactNode => {
    if (!dupBlocked) return null;
    const msg =
      (dupBlocked.variantsCount === 1 ? t("master.blocked.one") : t("master.blocked.many")).replace(
        "{n}",
        String(dupBlocked.variantsCount),
      ) +
      (dupBlocked.overridesCount > 0
        ? " · " + t("master.blocked.overrides").replace("{n}", String(dupBlocked.overridesCount))
        : "");
    const a = dupBlocked.args;
    return (
      <div className="ms-blocked" role="alert">
        <span>{msg}</span>
        <span className="ms-blocked__act">
          <button type="button" className="ms-blocked__go" onClick={() => resolverDup(a.keepId, a.dropIds, a.data, true)}>
            {t("master.dup.forceGo")}
          </button>
          <button type="button" className="ms-blocked__no" onClick={() => setDupBlocked(null)}>
            {t("common.cancel")}
          </button>
        </span>
      </div>
    );
  };

  /** Las dos versiones, campo por campo, con las tres acciones. */
  const dupPanel = (id: string | null): ReactNode => {
    if (!id || openDup !== id) return null;
    const c = dupIndex.get(id);
    if (!c) return null;
    const campos = c.miembros[0]?.campos ?? [];
    const hayVinetas = c.miembros.some((m) => m.vinetas.length > 0);
    const otrosDe = (keepId: string) => c.miembros.filter((m) => m.id !== keepId).map((m) => m.id);
    return (
      <div className="ms-dup" role="group" aria-label={t("master.dup.title")}>
        <div className="ms-dup__h">
          <span className="t-overline">{t("master.dup.title")}</span>
          <span className={`ms-dup__lvl ms-dup__lvl--${c.level}`}>{t(`master.dup.level.${c.level}`)}</span>
          <button type="button" className="ms-dup__x" onClick={() => setOpenDup(null)}>
            {t("master.dup.close")}
          </button>
        </div>
        {/* El motivo viene del detector, con sus señales traducidas: el usuario
            tiene que poder discrepar, y para eso hay que decirle POR QUÉ. */}
        <p className="ms-dup__why">{c.signals.map(tSignal).join(" · ")}</p>
        <p className="ms-dup__never">{t("master.dup.never")}</p>

        <div
          className="ms-dup__grid"
          style={{ gridTemplateColumns: `minmax(8ch, 13ch) repeat(${c.miembros.length}, minmax(0, 1fr))` }}
        >
          <span />
          {c.miembros.map((m) => (
            <span key={m.id} className="ms-dup__hd">
              {dupNombre(m)}
              {m.subtitulo ? <em>{m.subtitulo}</em> : null}
            </span>
          ))}

          {campos.map((campo) => {
            const sel = dupPickFor(c, campo.clave);
            const conUnion = c.kind === "skill" && campo.clave === "items";
            return (
              <Fragment key={campo.clave}>
                <span className="ms-dup__lb">{t(campo.ph)}</span>
                {c.miembros.map((m) => {
                  const valor = m.campos.find((f) => f.clave === campo.clave)?.valor ?? "";
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="ms-dup__cell"
                      aria-pressed={sel === m.id}
                      aria-label={t("master.dup.pickAria").replace("{campo}", t(campo.ph))}
                      onClick={() => setPick(c, campo.clave, m.id)}
                    >
                      {valor || <i>{t("master.dup.empty")}</i>}
                    </button>
                  );
                })}
                {conUnion ? (
                  <>
                    <span className="ms-dup__lb" />
                    <button
                      type="button"
                      className="ms-dup__cell ms-dup__cell--both"
                      style={{ gridColumn: `span ${c.miembros.length}` }}
                      aria-pressed={sel === "ambas"}
                      aria-label={t("master.dup.bothAria")}
                      onClick={() => setPick(c, campo.clave, "ambas")}
                    >
                      <b>{t("master.dup.both")}</b> {dupUnion(c, campo.clave)}
                    </button>
                  </>
                ) : null}
              </Fragment>
            );
          })}

          {hayVinetas ? (
            <>
              <span className="ms-dup__lb">{t("master.dup.bulletsRow")}</span>
              {c.miembros.map((m) => (
                <span key={m.id} className="ms-dup__bl">
                  {m.vinetas.length === 0 ? (
                    <i>{t("master.dup.empty")}</i>
                  ) : (
                    m.vinetas.map((b) => <span key={b.id}>· {b.texto}</span>)
                  )}
                </span>
              ))}
            </>
          ) : null}
        </div>

        {hayVinetas ? (
          <div className="ms-dup__vin">
            <span>{t("master.dup.bulletsKeep")}</span>
            <label>
              <input
                type="checkbox"
                checked={dupVinetas === "descartar"}
                onChange={(e) => setDupVinetas(e.target.checked ? "descartar" : "reenganchar")}
              />
              {t("master.dup.bulletsDrop")}
            </label>
          </div>
        ) : null}

        <div className="ms-dup__acts">
          {c.miembros.map((m) => (
            <button
              key={m.id}
              type="button"
              className="ms-dup__keep"
              disabled={dupBusy}
              aria-label={t("master.dup.keepAria").replace("{item}", dupNombre(m))}
              onClick={() => resolverDup(m.id, otrosDe(m.id), null, false)}
            >
              {t("master.dup.keep")} <em>{dupNombre(m)}</em>
            </button>
          ))}
          <button
            type="button"
            className="ms-dup__merge"
            disabled={dupBusy}
            title={t("master.dup.mergeHint")}
            onClick={() => resolverDup(id, otrosDe(id), dupDataFusion(c), false)}
          >
            {t("master.dup.merge")}
          </button>
          {dupBusy ? <span className="ms-dup__busy">{t("master.dup.busy")}</span> : null}
        </div>
        {dupBlockedWarning()}
      </div>
    );
  };

  /* ── B · el panel del BARRIDO ───────────────────────────────────────────────
     Dos zonas: las correcciones que el sistema PUEDE aplicar (con casilla, para
     ajustar el lote una a una) y las CONSULTIVAS, que solo se muestran porque
     aplicarlas —editar tu prosa, borrar un dato— es siempre tu decisión. Y el
     recorrido honesto: qué se examinó, con cifras reales. */
  const interp = (clave: string, datos: Record<string, number>): string => {
    let s = t(clave);
    for (const [k, v] of Object.entries(datos)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };

  const barNombreBase = (h: HallazgoDuplicado): string => {
    const m = h.cluster.miembros.find((x) => x.id === h.fusion.keepId);
    return m?.titulo?.trim() || t("master.role.untitled");
  };

  /** El texto de la propuesta de un hallazgo, ya traducido. */
  const barPropuesta = (h: Hallazgo): string => {
    switch (h.tipo) {
      case "duplicado":
        return t("master.barrido.h.dupProp")
          .replace("{keep}", barNombreBase(h))
          .replace("{n}", String(h.cluster.miembros.length));
      case "mal-clasificado":
        return t("master.barrido.h.badclassProp").replace("{name}", (h as HallazgoMalClasificado).nombre);
      case "fecha-ausente":
        return t("master.barrido.h.dateProp")
          .replace("{dates}", (h as HallazgoFecha).dates)
          .replace("{item}", (h as HallazgoFecha).etiqueta);
      case "vineta-sin-cifra":
        return t("master.barrido.h.figureProp").replace("{num}", (h as HallazgoVineta).numeros.join(", "));
      default:
        return t("master.barrido.h.skillProp").replace("{chips}", (h as HallazgoAptitud).sinEvidencia.join(", "));
    }
  };

  const barTipoLabel = (h: Hallazgo): string =>
    t(
      h.tipo === "duplicado" ? "master.barrido.h.dup"
      : h.tipo === "mal-clasificado" ? "master.barrido.h.badclass"
      : h.tipo === "fecha-ausente" ? "master.barrido.h.date"
      : h.tipo === "vineta-sin-cifra" ? "master.barrido.h.figure"
      : "master.barrido.h.skill",
    );

  /** La evidencia LITERAL del origen, cuando el hallazgo la trae. */
  const barEvidencia = (h: Hallazgo): string | null => {
    if (h.tipo === "fecha-ausente") return (h as HallazgoFecha).evidencia;
    if (h.tipo === "vineta-sin-cifra") return (h as HallazgoVineta).evidencia;
    return null;
  };

  /** La razón/el detalle del hallazgo (la viñeta o el motivo del detector). */
  const barDetalle = (h: Hallazgo): string | null => {
    if (h.tipo === "duplicado") return h.cluster.reason;
    if (h.tipo === "mal-clasificado") return (h as HallazgoMalClasificado).razon;
    if (h.tipo === "vineta-sin-cifra") return (h as HallazgoVineta).texto;
    return null;
  };

  const barFilaAplicable = (h: Hallazgo, i: number): ReactNode => {
    const key = barKey(h);
    const ev = barEvidencia(h);
    const det = barDetalle(h);
    return (
      <label className="ms-bar__row" key={`ap-${i}-${key}`}>
        <input type="checkbox" checked={barSel.has(key)} onChange={() => toggleBarSel(key)} aria-label={t("master.barrido.include")} />
        <span className="ms-bar__body">
          <span className="ms-bar__tipo">{barTipoLabel(h)}</span>
          <span className="ms-bar__prop">{barPropuesta(h)}</span>
          {det ? <span className="ms-bar__det">{det}</span> : null}
          {ev ? (
            <span className="ms-bar__ev">
              <em>{t("master.barrido.evidence")}</em> {ev}
            </span>
          ) : null}
        </span>
      </label>
    );
  };

  const barFilaConsultiva = (h: Hallazgo, i: number): ReactNode => {
    const ev = barEvidencia(h);
    const det = barDetalle(h);
    return (
      <div className="ms-bar__row ms-bar__row--adv" key={`cs-${i}`}>
        <span className="ms-bar__body">
          <span className="ms-bar__tipo">{barTipoLabel(h)}</span>
          <span className="ms-bar__prop">{barPropuesta(h)}</span>
          {det ? <span className="ms-bar__det">{det}</span> : null}
          {ev ? (
            <span className="ms-bar__ev">
              <em>{t("master.barrido.evidence")}</em> {ev}
            </span>
          ) : null}
        </span>
      </div>
    );
  };

  const barridoPanel = (): ReactNode => {
    if (!barOpen) return null;
    const r = barResult;
    const aplicables = r ? r.hallazgos.filter(barAplicable) : [];
    const consultivas = r ? r.hallazgos.filter((h) => !barAplicable(h)) : [];
    const nSel = aplicables.filter((h) => barSel.has(barKey(h))).length;
    const applyLabel =
      nSel === 0 ? t("master.barrido.applyNone")
      : nSel === 1 ? t("master.barrido.applyOne")
      : t("master.barrido.apply").replace("{n}", String(nSel));

    return (
      <div className="ms-bar" role="group" aria-label={t("master.barrido.title")}>
        <div className="ms-bar__h">
          <span className="t-overline">{t("master.barrido.title")}</span>
          {r && !barBusy ? (
            <button type="button" className="ms-bar__rerun" onClick={runBarrido}>
              {t("master.barrido.rerun")}
            </button>
          ) : null}
          <button type="button" className="ms-bar__x" onClick={() => setBarOpen(false)}>
            {t("master.barrido.close")}
          </button>
        </div>
        <p className="ms-bar__intro">{t("master.barrido.intro")}</p>

        {barBusy ? <p className="ms-bar__busy" role="status">{t("master.barrido.ctaBusy")}</p> : null}
        {barError ? <p className="ms-bar__err" role="alert">{barError}</p> : null}

        {r && !barBusy ? (
          <>
            {/* Progreso honesto: qué se examinó, con cifras reales. */}
            <ul className="ms-bar__walk">
              {r.recorrido.map((p) => (
                <li key={p.clave}>{interp(p.clave, p.datos)}</li>
              ))}
            </ul>

            {r.hallazgos.length === 0 ? (
              <p className="ms-bar__empty">{t("master.barrido.empty")}</p>
            ) : null}

            {aplicables.length > 0 ? (
              <div className="ms-bar__sec">
                <span className="t-overline">{t("master.barrido.sec.aplicables")}</span>
                <div className="ms-bar__list">{aplicables.map((h, i) => barFilaAplicable(h, i))}</div>
                <div className="ms-bar__acts">
                  <button type="button" className="ms-bar__apply" disabled={nSel === 0} onClick={applyBarrido}>
                    {applyLabel}
                  </button>
                  <span className="ms-bar__never">{t("master.dup.never")}</span>
                </div>
              </div>
            ) : null}

            {consultivas.length > 0 ? (
              <div className="ms-bar__sec ms-bar__sec--adv">
                <span className="t-overline">{t("master.barrido.sec.consultivas")}</span>
                <p className="ms-bar__advhint">{t("master.barrido.consultivasHint")}</p>
                <div className="ms-bar__list">{consultivas.map((h, i) => barFilaConsultiva(h, i))}</div>
              </div>
            ) : null}
          </>
        ) : null}
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
    // El rol puede no tener título todavía (se edita en su sitio); para las
    // etiquetas accesibles hace falta un nombre, no una cadena vacía.
    const label = e.tt.trim() || t("master.role.untitled");
    // A4: viñetas sin cifra que parecen etiqueta (para el «mover las N sugeridas»).
    const suggested = e.bullets.filter((b) => b.id && !b.num && looksLikeSkillTag(b.tx));
    return (
      <article className="c-card ms-card" data-item data-dup={dupAttr(e.id)} key={e.id ?? headerId}>
        {/* Toda la cabecera es editable en su sitio: cargo, empresa, ubicación y
            fecha. Antes solo lo era el título y los demás campos iban fusionados
            en un `org` de solo lectura — se recreaba el rol para cambiar una ciudad. */}
        <div className="ms-eh">
          <EditableField
            className="tt"
            value={e.tt}
            ph={t("master.draft.title")}
            aria={`${t("master.aria.editRoleTitle")}${label}`}
            onCommit={(text) => {
              if (text === e.tt.trim()) return;
              saveRoleData(i, headerId, mergeField(e.data, "title", text));
            }}
          />
          <span className="org">
            <EditableField
              value={e.company}
              ph={t("master.field.company")}
              aria={`${t("master.aria.editPrefix")}${t("master.field.company")}`}
              onCommit={(text) => {
                if (text === e.company.trim()) return;
                saveRoleData(i, headerId, mergeField(e.data, "company", text));
              }}
            />
            <span className="ms-sep"> · </span>
            <EditableField
              value={e.location}
              ph={t("master.field.location")}
              aria={`${t("master.aria.editPrefix")}${t("master.field.location")}`}
              onCommit={(text) => {
                if (text === e.location.trim()) return;
                saveRoleData(i, headerId, mergeField(e.data, "location", text));
              }}
            />
          </span>
          <DateCell
            dates={e.dates}
            warn={e.warn}
            warnLabel={e.warn ? tWarn(e.warn) : ""}
            label={label}
            t={t}
            open={openDate.has(headerId)}
            draft={dateDraft[headerId] ?? ""}
            error={dateError[headerId] ?? null}
            onOpen={() => openDateEditor(headerId, e.dates)}
            onDraft={(val) => setDateDraftFor(headerId, val)}
            onSave={(raw) => saveRoleDate(i, headerId, raw)}
            onCancel={() => closeDateEditor(headerId)}
          />
          <span className="meta">
            {srcButton(headerId, e.origin, e.id)}
            {delButton("work", e.id, label)}
          </span>
        </div>
        {fragBody(headerId, e.id, e.origin, e.evidence)}
        {dupMark(e.id)}
        {dupPanel(e.id)}
        {blockedWarning(e.id, "work", label)}
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

  /* Una fila densa (proyecto, educación, certificación) con sus campos SEPARADOS.
     Antes era un solo texto "cabeza — cola" que al guardar se volvía a partir por
     el primer " — ": «Ingeniería Civil — mención Software — UNAB» se guardaba con
     el título recortado y la institución equivocada, sin aviso. Ahora cada campo
     se edita y se guarda por su clave real. */
  const denseRow = (r: VRow, i: number, key: string): ReactNode => {
    const sec = ROW_SECTION[r.kind];
    const fields = ROW_FIELDS[r.kind];
    const label = str(r.data, fields[0]!.key).trim() || t("master.role.untitled");
    return (
      <Fragment key={key}>
        <div className="ms-row" data-item data-dup={dupAttr(r.id)}>
          <span className="ms-row__fields">
            {fields.map((f, fi) => {
              const value = str(r.data, f.key);
              return (
                <Fragment key={f.key}>
                  {fi > 0 ? <span className="ms-sep">·</span> : null}
                  <EditableField
                    value={value}
                    ph={t(f.ph)}
                    aria={`${t("master.aria.editPrefix")}${t(f.ph)}`}
                    onCommit={(text) => {
                      if (text === value.trim()) return;
                      saveRowData(sec, i, key, mergeField(r.data, f.key, text));
                    }}
                  />
                </Fragment>
              );
            })}
            {ROW_HAS_DATES[r.kind] ? (
              <DateCell
                dates={str(r.data, "dates")}
                warn={r.warn}
                warnLabel={r.warn ? tWarn(r.warn) : ""}
                label={label}
                t={t}
                open={openDate.has(key)}
                draft={dateDraft[key] ?? ""}
                error={dateError[key] ?? null}
                onOpen={() => openDateEditor(key, str(r.data, "dates"))}
                onDraft={(val) => setDateDraftFor(key, val)}
                onSave={(raw) => saveRowDate(sec, i, key, raw)}
                onCancel={() => closeDateEditor(key)}
              />
            ) : null}
          </span>
          <span className="m">{tOrigin(r.m)}</span>
          {/* La marca va DENTRO de la fila: el filtro oculta el nodo [data-item],
              y fuera se quedaría flotando sin su item. */}
          {dupMark(r.id)}
          {delButton(r.kind, r.id, label)}
        </div>
        {dupPanel(r.id)}
        {blockedWarning(r.id, r.kind, label)}
      </Fragment>
    );
  };

  /* ── B · UNA REFERENCIA ─────────────────────────────────────────────────────
     Seis campos editables en su sitio (mismo gesto que el resto de la pantalla) y,
     debajo, LOS VÍNCULOS: con qué rol o proyecto se relaciona esta persona. El
     vínculo se pinta como una lista de conmutadores y no como un desplegable
     porque una referencia puede anclarse a VARIAS cosas —el jefe que además fue
     stakeholder del proyecto— y un select de uno solo lo escondería. */
  const REF_FIELDS: { key: string; ph: string }[] = [
    { key: "name", ph: "master.ref.field.name" },
    { key: "role", ph: "master.ref.field.role" },
    { key: "org", ph: "master.ref.field.org" },
    { key: "relation", ph: "master.ref.field.relation" },
    { key: "email", ph: "master.ref.field.email" },
    { key: "phone", ph: "master.ref.field.phone" },
  ];

  const referenceLinkPicker = (refId: string | null, refLabel: string): ReactNode => {
    const puestos = new Set((refId ? refLinks[refId] ?? [] : []).map((l) => l.itemId));
    if (linkables.length === 0) return <p className="ms-ref__note">{t("master.ref.linkEmpty")}</p>;
    return (
      <div className="ms-ref__links">
        <span className="ms-ref__linksh">{puestos.size ? t("master.ref.linkedTo") : t("master.ref.linkNone")}</span>
        {linkables.map((li) => {
          const on = puestos.has(li.id);
          return (
            <button
              key={li.id}
              type="button"
              className={`ms-ref__link${on ? " on" : ""}`}
              aria-pressed={on}
              aria-label={t("master.ref.linkAria").replace("{ref}", refLabel).replace("{item}", li.label)}
              onClick={() => toggleReferenceLink(refId, li.id)}
            >
              {li.label}
            </button>
          );
        })}
      </div>
    );
  };

  const referenceCard = (r: VReference, i: number): ReactNode => {
    const key = `ref-${i}`;
    const label = str(r.data, "name").trim() || t("master.role.untitled");
    return (
      <Fragment key={r.id ?? key}>
        <div className="c-card ms-card ms-ref" data-item>
          <div className="ms-ref__fields">
            {REF_FIELDS.map((f) => {
              const value = str(r.data, f.key);
              return (
                <EditableField
                  key={f.key}
                  className={f.key === "name" ? "ms-ref__name" : undefined}
                  value={value}
                  ph={t(f.ph)}
                  aria={`${t("master.aria.editPrefix")}${t(f.ph)}`}
                  onCommit={(text) => {
                    if (text === value.trim()) return;
                    saveReferenceField(r, f.key, text);
                  }}
                />
              );
            })}
            <span className="meta">
              <span className="m">{tOrigin(r.origin)}</span>
              {delButton("reference", r.id, label)}
            </span>
          </div>
          {referenceLinkPicker(r.id, label)}
        </div>
        {blockedWarning(r.id, "reference", label)}
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
        data-dup={dupAttr(s.id)}
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
        {dupMark(s.id)}
        {dupPanel(s.id)}
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
      {/* El registro poblado es trabajo denso; vacío es una sala de puertas. */}
      <AuroraTune strength={isEmpty ? AURORA_HOJEO : AURORA_TRABAJO} />

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
            <div className="ms-actions">
              {/* B · «Revisar mi master con IA»: el barrido en dos pasos. Solo con
                  registro poblado (vacío no hay nada que barrer). */}
              {!loading && !isEmpty ? (
                <button
                  type="button"
                  className="c-btn c-btn--patina ms-barrido-cta"
                  aria-expanded={barOpen}
                  disabled={barBusy}
                  onClick={runBarrido}
                >
                  {barBusy ? t("master.barrido.ctaBusy") : t("master.barrido.cta")}
                </button>
              ) : null}
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
                  <button type="button" role="menuitem" onClick={() => openDraft("certification", null)}>
                    {t("master.add.certification")}
                  </button>
                  {/* Referencia: no pasa por openDraft (no es una fila de un campo,
                      es un formulario con su aviso de permiso). */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setRefDraft({});
                      setRefError("");
                      setAddMenu(false);
                    }}
                  >
                    {t("master.add.reference")}
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
          </div>

          {barridoPanel()}

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
                      <div className="ms-rows">{v.projects.map((p, i) => denseRow(p, i, `pj-${i}`))}</div>
                      {draftsFor("project", null).map((d) => draftRow(d))}
                      <button type="button" className="ms-add" onClick={() => openDraft("project", null)}>
                        {t("master.addProject")}
                      </button>
                    </>,
                  )}

                {/* Educación y certificaciones comparten sección (es donde el usuario
                    las busca) pero NO tipo: cada fila guarda con su kind y sus claves. */}
                {(v.education.length > 0 ||
                  v.certifications.length > 0 ||
                  draftsFor("education", null).length > 0 ||
                  draftsFor("certification", null).length > 0) &&
                  groupSection(
                    "educacion",
                    t("master.group.education"),
                    `${v.education.length + v.certifications.length} ${t("master.items")}`,
                    <>
                      <div className="ms-rows">
                        {v.education.map((d, i) => denseRow(d, i, `ed-${i}`))}
                        {v.certifications.map((c, i) => denseRow(c, i, `ce-${i}`))}
                      </div>
                      {draftsFor("education", null).map((d) => draftRow(d))}
                      {draftsFor("certification", null).map((d) => draftRow(d))}
                      <button type="button" className="ms-add" onClick={() => openDraft("education", null)}>
                        {t("master.addEducation")}
                      </button>
                      <button type="button" className="ms-add" onClick={() => openDraft("certification", null)}>
                        {t("master.addCertification")}
                      </button>
                    </>,
                  )}

                {/* ⚠⚠ REFERENCIAS — datos de TERCEROS. Dos avisos y los dos VISIBLES,
                    no en un tooltip: (1) hay que pedirle permiso a la persona antes
                    de guardar sus datos, (2) en el CV no se imprimen salvo que la
                    variante lo pida. Se pintan arriba de la lista y otra vez en el
                    formulario de alta, que es donde se toma la decisión. */}
                {(v.references.length > 0 || refDraft) &&
                  groupSection(
                    "referencias",
                    t("master.group.references"),
                    t("master.ref.count").replace("{n}", String(v.references.length)),
                    <>
                      <p className="ms-ref__consent">{t("master.ref.consent")}</p>
                      <p className="ms-ref__note">{t("master.ref.convention")}</p>
                      <p className="ms-ref__note">{t("master.ref.linkHint")}</p>
                      {refsMigration ? (
                        <p className="ms-ref__consent" role="alert">
                          {t("master.ref.migration")}
                        </p>
                      ) : null}
                      {v.references.map((r, i) => referenceCard(r, i))}
                      {refDraft ? (
                        <div className="c-card ms-card ms-ref ms-ref--draft">
                          <p className="ms-ref__consent">{t("master.ref.consent")}</p>
                          <div className="ms-ref__fields">
                            {REF_FIELDS.map((f, idx) => (
                              <input
                                key={f.key}
                                className="c-input ms-draft__in"
                                autoFocus={idx === 0}
                                placeholder={t(f.ph)}
                                aria-label={t(f.ph)}
                                value={refDraft[f.key] ?? ""}
                                onChange={(ev) =>
                                  setRefDraft((p) => ({ ...(p ?? {}), [f.key]: ev.target.value }))
                                }
                                onKeyDown={(ev) => {
                                  if (ev.key === "Enter") {
                                    ev.preventDefault();
                                    createReference(refDraft, []);
                                  } else if (ev.key === "Escape") {
                                    ev.preventDefault();
                                    setRefDraft(null);
                                    setRefError("");
                                  }
                                }}
                              />
                            ))}
                          </div>
                          {/* El vínculo se elige DESPUÉS de guardar: hasta que la
                              persona no existe no hay a qué anclar nada, y pedirlo
                              antes obligaría a mantener un id fantasma. */}
                          <p className="ms-ref__note">{t("master.ref.linkHint")}</p>
                          {refError ? (
                            <p className="ms-ref__consent" role="alert">
                              {refError}
                            </p>
                          ) : null}
                          <div className="ms-draft">
                            <button
                              type="button"
                              className="ms-draft__save"
                              onClick={() => createReference(refDraft, [])}
                            >
                              {t("master.draft.save")}
                            </button>
                            <button
                              type="button"
                              className="ms-draft__cancel"
                              aria-label={t("common.cancel")}
                              onClick={() => {
                                setRefDraft(null);
                                setRefError("");
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="ms-add" onClick={() => setRefDraft({})}>
                          {t("master.ref.add")}
                        </button>
                      )}
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
