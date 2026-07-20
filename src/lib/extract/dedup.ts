/**
 * Detección de duplicados en TRES NIVELES (§4.5 · §A1). Si el usuario aporta CV +
 * LinkedIn, o vuelca un dossier que cuenta cada trabajo desde tres ángulos, el
 * mismo hecho aparece varias veces redactado distinto. Aquí se DETECTA y se
 * EXPLICA. Nada más.
 *
 * ⚠ REGLA INVIOLABLE: nada se fusiona ni se descarta en este módulo. El duplicado
 *   lo resuelve SIEMPRE el usuario. La salida es una sospecha con sus señales y un
 *   motivo legible para pintar en la tarjeta.
 *
 * POR QUÉ TRES NIVELES. La regla de siempre («empresa normalizada + solape de
 * fechas») está pensada para dos fuentes ESTRUCTURADAS. Falla entera cuando la
 * segunda versión del mismo trabajo viene de un cuestionario narrativo: no trae
 * fecha (la pata del solape no se puede evaluar) y trae la empresa malformada
 * («Químico farmacéutico» es la profesión del cliente) o vacía. Con las dos patas
 * rotas hace falta decidir por el CONTENIDO — y decirlo.
 *
 *   n1 · DETERMINISTA — empresa normalizada + solape de fechas DE VERDAD.
 *   n2 · SEMÁNTICO   — cuando no hay fecha ni empresa fiable, decide similar.ts.
 *   n3 · ORIGEN      — mismo documento ⇒ la sospecha SUBE un nivel (un dossier que
 *        menciona el mismo hecho dos veces, no dos hechos). Nunca dispara solo:
 *        si n1 y n2 callan, no hay par que subir.
 *
 * ⚠ Se normaliza SOLO para COMPARAR. La forma con identificador legal se PERSISTE
 *   tal cual — Greenhouse la necesita y el chequeo de salud la exige.
 */

import { normalize } from "../verify";
import { normalizeDateRange } from "./dates";
import { signalsOf, compareSignals, similarityVerdict, type SignalBag } from "./similar";

// sufijos de forma legal (Chile + comunes). Se quitan solo para comparar.
const LEGAL_SUFFIXES =
  /\b(s\.?a\.?|spa|s\.?p\.?a\.?|ltda\.?|limitada|e\.?i\.?r\.?l\.?|inc\.?|llc|corp\.?|co\.?|gmbh|s\.?l\.?|s\.?a\.?s\.?)\b/gi;

/** Nombre de empresa canónico para COMPARAR (nunca para persistir ni mostrar). */
export function normalizeCompany(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DateRange {
  /** "YYYY", "YYYY-MM", "mar 2022", "2019"… se parsea a año de inicio/fin */
  start: string;
  /** null / "hoy" / "present" ⇒ en curso */
  end: string | null;
}

/** Extrae el primer año (4 dígitos) de una cadena de fecha. */
function year(s: string | null, fallback: number): number {
  if (!s) return fallback;
  if (/\b(hoy|present|actual|now)\b/i.test(s)) return fallback;
  const m = /\b(19|20)\d{2}\b/.exec(s);
  return m ? Number(m[0]) : fallback;
}

/** ¿Se solapan dos rangos de fechas (por año)? En curso ⇒ hasta el año actual+. */
export function datesOverlap(a: DateRange, b: DateRange, currentYear = 9999): boolean {
  const aS = year(a.start, 0);
  const aE = year(a.end, currentYear);
  const bS = year(b.start, 0);
  const bE = year(b.end, currentYear);
  return aS <= bE && bS <= aE;
}

export interface WorkLike {
  company: string;
  start: string;
  end: string | null;
  /** opcional: si los dos cargos son claramente distintos, la misma empresa NO
   *  basta (una promoción interna no es un duplicado). */
  title?: string;
}

/* ── Fechas de VERDAD ─────────────────────────────────────────────────────────
   El fallo verificado: pipeline.ts llamaba con `end: null` SIEMPRE, así que
   `datesOverlap` devolvía true casi siempre y el match degeneraba a «misma
   empresa». Aquí el rango se saca con `normalizeDateRange`, que entiende «mar
   2025 – dic 2025», «abr 2026 – actualidad» y «2019 – 2020», y que además admite
   cuando NO hay fecha en vez de inventarla.                                     */

interface Rango {
  /** hay al menos un año reconocible */
  ok: boolean;
  start: string;
  end: string | null;
}

/** Convierte el texto crudo de fechas en un rango comparable, o admite que no hay. */
export function parseRange(raw: string | null | undefined): Rango {
  const dr = normalizeDateRange(raw ?? "");
  if (dr.invalid) return { ok: false, start: "", end: null };
  const start = dr.start ?? "";
  const end = dr.current ? "hoy" : (dr.end ?? null);
  return { ok: Boolean(dr.start || dr.end || dr.current), start, end };
}

/** Tokens significativos de un cargo, para ver si dos títulos hablan de lo mismo. */
function titleTokens(t: string): Set<string> {
  return new Set(
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((w) => w.length >= 3 && !["and", "the", "for", "con", "del", "los", "las"].includes(w)),
  );
}

/**
 * ¿Dos cargos son CLARAMENTE distintos? Se usa para no marcar como duplicado una
 * PROMOCIÓN INTERNA: «Backend Developer» y «Tech Lead» en la misma empresa, con
 * años que se tocan, son dos entradas legítimas del CV — fusionarlas le borraría
 * al usuario media carrera. En cambio «Scrum Master» y «Scrum Master & Technical
 * Team Lead» comparten el núcleo del cargo y no se consideran distintos.
 */
export function titlesClearlyDifferent(a?: string, b?: string): boolean {
  const ta = titleTokens(a ?? "");
  const tb = titleTokens(b ?? "");
  if (!ta.size || !tb.size) return false; // sin título no se puede afirmar nada
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union > 0 && inter / union < 0.34;
}

/**
 * n1 · ¿Dos experiencias son el MISMO trabajo? Match determinista: empresa
 * normalizada igual + fechas que se solapan DE VERDAD. Barato y sin LLM.
 * Devuelve true solo cuando es claro; lo demás lo decide el nivel semántico.
 */
export function looksLikeDuplicate(a: WorkLike, b: WorkLike, currentYear = new Date().getFullYear()): boolean {
  const asItem = (w: WorkLike, key: string): DedupItem => ({
    key, kind: "work", company: w.company, title: w.title,
    dates: `${w.start}${w.end ? ` – ${w.end}` : ""}`,
  });
  // score 1: sin contenido que evaluar se concede el máximo parecido, para que la
  // decisión recaiga entera en empresa + fechas (que es lo que esta función es).
  return level1(asItem(a, "a"), asItem(b, "b"), currentYear, 1) !== null;
}

/* ============================================================================
   El detector de tres niveles
   ============================================================================ */

export type SuspicionLevel = "baja" | "media" | "alta";
export type DuplicateSignal =
  | "misma-empresa"
  | "fechas-solapan"
  | "sin-fecha"
  | "contenido"
  | "misma-fuente"
  | "mismo-nombre";

const ORDER: SuspicionLevel[] = ["baja", "media", "alta"];
const rank = (l: SuspicionLevel): number => ORDER.indexOf(l);
const maxLevel = (a: SuspicionLevel, b: SuspicionLevel): SuspicionLevel => (rank(a) >= rank(b) ? a : b);
const bump = (l: SuspicionLevel): SuspicionLevel => ORDER[Math.min(ORDER.length - 1, rank(l) + 1)]!;

/** Un item candidato a duplicado. Sirve para work, project y skill por igual. */
export interface DedupItem {
  key: string;
  /** 'work' | 'project' | 'skill' — solo se comparan items del mismo tipo. */
  kind?: string;
  /** cargo · nombre de proyecto · nombre de grupo de aptitudes */
  title?: string;
  /** empresa (solo work); vacío o basura es normal y está contemplado */
  company?: string;
  /** el texto crudo de fechas, tal cual vino */
  dates?: string;
  /** TODO el contenido del item: descripción, viñetas, evidencia, aptitudes… */
  text?: string;
  /** de qué documento salió. Mismo documento ⇒ la sospecha sube (n3). */
  sourceId?: string;
}

export interface DuplicateSuspicion {
  /** el item que aparece ANTES en el staging (el candidato a canónico) */
  aKey: string;
  /** el item que se sospecha que lo repite */
  bKey: string;
  level: SuspicionLevel;
  signals: DuplicateSignal[];
  /** motivo en español legible, para pintar en la tarjeta */
  reason: string;
  /** similitud de contenido 0..1 (para ordenar las sospechas) */
  score: number;
}

interface Parcial {
  level: SuspicionLevel;
  signals: DuplicateSignal[];
  reasons: string[];
}

/**
 * n1 · DETERMINISTA. Requiere empresa a ambos lados. Dos caminos:
 *   · las dos traen fecha → hace falta solape REAL, y si además los cargos son
 *     claramente distintos NO se marca (promoción interna).
 *   · a alguna le falta la fecha → no se puede comprobar el solape: se marca solo
 *     «media», y únicamente si el cargo coincide o el contenido acompaña. La
 *     empresa por sí sola nunca basta.
 */
function level1(a: DedupItem, b: DedupItem, currentYear: number, score: number): Parcial | null {
  const ca = normalizeCompany(a.company ?? "");
  const cb = normalizeCompany(b.company ?? "");
  if (!ca || !cb) return null;
  const contenida = ca.length >= 4 && cb.length >= 4 && (ca.includes(cb) || cb.includes(ca));
  if (ca !== cb && !contenida) return null;

  const ra = parseRange(a.dates);
  const rb = parseRange(b.dates);
  const distintos = titlesClearlyDifferent(a.title, b.title);

  if (ra.ok && rb.ok) {
    if (!datesOverlap({ start: ra.start, end: ra.end }, { start: rb.start, end: rb.end }, currentYear)) return null;
    if (distintos) return null; // misma empresa, fechas que se tocan, cargos distintos ⇒ promoción
    return {
      level: "alta",
      signals: ["misma-empresa", "fechas-solapan"],
      reasons: ["es la misma empresa y las fechas se solapan"],
    };
  }

  // sin fecha a un lado: la empresa sola no basta
  if (distintos && score < 0.18) return null;
  return {
    level: "media",
    signals: ["misma-empresa", "sin-fecha"],
    reasons: ["es la misma empresa, pero a una de las dos le falta la fecha: no se puede comprobar el solape"],
  };
}

/**
 * n1-bis · IDENTIDAD POR NOMBRE, para los kinds donde el nombre ES la identidad.
 *
 * Encontrado usando la app, no escribiendo tests: en un master real había DOS
 * grupos llamados «Lenguajes» —uno traía Dockerfile de GitHub, el otro Go, Python
 * y SQL del texto pegado— y NINGUNO se marcaba. n1 no podía verlos porque exige
 * empresa a los dos lados y un grupo de aptitudes no tiene empresa; y n2 tampoco,
 * porque sus contenidos NO se parecen: son justamente las dos mitades del mismo
 * grupo. Cuanto mejor se reparte un duplicado, más invisible se volvía.
 *
 * Y sin embargo un CV no puede tener dos secciones tituladas «Lenguajes». Para un
 * grupo de aptitudes y para un proyecto, el nombre es el identificador: repetirlo
 * es el duplicado, con independencia de lo que haya dentro.
 *
 * ⚠ Para 'work' NO se aplica, y la diferencia es real: «Ingeniero de software» en
 * dos empresas distintas son dos trabajos distintos. Ahí la identidad es
 * cargo+empresa, y de eso ya se ocupa n1.
 */
const IDENTIDAD_POR_NOMBRE = new Set(["skill", "project"]);

function level1bis(a: DedupItem, b: DedupItem): Parcial | null {
  if (!IDENTIDAD_POR_NOMBRE.has(a.kind ?? "")) return null;
  const na = normalize(a.title ?? "");
  const nb = normalize(b.title ?? "");
  // Un nombre vacío no identifica nada: dos items sin título no son «el mismo».
  if (!na || !nb || na !== nb) return null;
  return {
    level: "alta",
    signals: ["mismo-nombre"],
    reasons: [`se llaman igual («${a.title}»), y ese nombre no puede aparecer dos veces`],
  };
}

/** n2 · SEMÁNTICO. Decide por contenido cuando la empresa o la fecha no sirven. */
function level2(sa: SignalBag, sb: SignalBag): { parcial: Parcial | null; score: number } {
  const r = compareSignals(sa, sb);
  const v = similarityVerdict(r);
  if (v === "no") return { parcial: null, score: r.score };

  const pistas = [...r.sharedEntities.slice(0, 4), ...r.sharedNumbers.slice(0, 2)];
  const detalle = pistas.length ? ` (${pistas.join(", ")})` : "";
  const level: SuspicionLevel = v === "fuerte" ? "alta" : v === "probable" ? "media" : "baja";
  return {
    parcial: {
      level,
      signals: ["contenido"],
      reasons: [`describen el mismo contenido${detalle}`],
    },
    score: r.score,
  };
}

export interface DetectOptions {
  currentYear?: number;
  /** nivel mínimo para que un par se reporte. Por defecto 'media'. */
  minLevel?: SuspicionLevel;
}

/**
 * Todos los pares sospechosos de una lista, del más barato al más caro. Compara
 * solo items del MISMO kind (un proyecto nunca duplica a un rol) y devuelve la
 * lista ordenada por sospecha descendente.
 */
export function detectDuplicates(items: DedupItem[], opts: DetectOptions = {}): DuplicateSuspicion[] {
  const currentYear = opts.currentYear ?? new Date().getFullYear();
  const min = opts.minLevel ?? "media";
  // Las señales se calculan UNA vez por item: es O(n²) en comparaciones, no en
  // tokenización — con 150 items del staging la diferencia no es cosmética.
  //
  // ⚠ La EMPRESA se queda fuera a propósito. Es metadato, y es la pata de n1: si
  //   entrara aquí, dos cargos distintos de la misma universidad compartirían tres
  //   entidades («Universidad Andrés Bello») y n2 confirmaría a n1 con el mismo
  //   dato que n1 ya usó. Sería una sospecha doble sostenida por una sola prueba.
  //   Lo que decide n2 es el CONTENIDO; si la empresa importa, ya la cuenta n1.
  const bags = items.map((it) => signalsOf(it.title, it.text));
  const out: DuplicateSuspicion[] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!, b = items[j]!;
      if ((a.kind ?? "") !== (b.kind ?? "")) continue;

      const { parcial: p2, score } = level2(bags[i]!, bags[j]!);
      const p1 = level1(a, b, currentYear, score);
      const p1b = level1bis(a, b);
      if (!p1 && !p1b && !p2) continue;

      const partes = [p1, p1b, p2].filter((p): p is Parcial => !!p);
      let level = partes.map((p) => p.level).reduce(maxLevel);
      const signals = partes.flatMap((p) => p.signals);
      const reasons = partes.flatMap((p) => p.reasons);

      // n3 · misma fuente. Nunca dispara solo: aquí ya hay sospecha de n1 o n2.
      if (a.sourceId && b.sourceId && a.sourceId === b.sourceId) {
        level = bump(level);
        signals.push("misma-fuente");
        reasons.push("los dos salieron del mismo documento");
      }

      if (rank(level) < rank(min)) continue;
      out.push({
        aKey: a.key, bKey: b.key, level, signals, score,
        reason: `Puede ser el mismo item: ${reasons.join("; ")}.`,
      });
    }
  }

  return out.sort((x, y) => rank(y.level) - rank(x.level) || y.score - x.score);
}

/**
 * Agrupa los items en clústeres de posibles duplicados (unión de los pares
 * detectados). Devuelve los KEYS por clúster, en orden de aparición.
 *
 * Sirve para medir: «de 10 roles, ¿cuántos hechos distintos hay?». No fusiona
 * nada: un clúster es una pregunta al usuario, no una decisión tomada.
 */
export function clusterKeys(items: DedupItem[], opts: DetectOptions = {}): string[][] {
  const parent = new Map<string, string>();
  for (const it of items) parent.set(it.key, it.key);
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(k) !== r) { const n = parent.get(k)!; parent.set(k, r); k = n; }
    return r;
  };
  for (const s of detectDuplicates(items, opts)) {
    const ra = find(s.aKey), rb = find(s.bKey);
    if (ra !== rb) parent.set(rb, ra);
  }
  const groups = new Map<string, string[]>();
  for (const it of items) {
    const r = find(it.key);
    const g = groups.get(r);
    if (g) g.push(it.key);
    else groups.set(r, [it.key]);
  }
  return [...groups.values()];
}

/**
 * Clústeres de experiencias, compatible con el uso histórico (`WorkLike[]`).
 * Se apoya en el mismo motor que todo lo demás: una sola definición de «esto
 * puede ser lo mismo», no dos que se separan con el tiempo.
 */
export function clusterDuplicates<T extends WorkLike>(items: T[], currentYear?: number): T[][] {
  const byKey = new Map<string, T>();
  const dedupItems: DedupItem[] = items.map((it, i) => {
    const key = `w${i}`;
    byKey.set(key, it);
    return {
      key,
      kind: "work",
      title: it.title,
      company: it.company,
      dates: `${it.start}${it.end ? ` – ${it.end}` : ""}`,
    };
  });
  return clusterKeys(dedupItems, { currentYear }).map((g) => g.map((k) => byKey.get(k)!));
}
