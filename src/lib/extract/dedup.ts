/**
 * Deduplicación determinista (prompt §4.5). Si el usuario aporta CV + LinkedIn,
 * el mismo trabajo aparece dos veces, redactado distinto. El match barato primero:
 * empresa normalizada + solapamiento de fechas. El LLM solo para los ambiguos, y
 * solo para PROPONER. La fusión la decide SIEMPRE el usuario.
 *
 * ⚠ Se normaliza SOLO para COMPARAR. La forma con identificador legal se PERSISTE
 *   tal cual — Greenhouse la necesita y el chequeo de salud la exige. Sería
 *   absurdo que el producto se marcara a sí mismo en falta.
 */

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
}

/**
 * ¿Dos experiencias son el MISMO trabajo redactado distinto? Match determinista:
 * empresa normalizada igual + fechas que se solapan. Barato y sin LLM.
 * Devuelve true solo cuando es claro; los ambiguos los decide otra capa.
 */
export function looksLikeDuplicate(a: WorkLike, b: WorkLike, currentYear = new Date().getFullYear()): boolean {
  const ca = normalizeCompany(a.company);
  const cb = normalizeCompany(b.company);
  if (!ca || !cb) return false;
  const sameCompany = ca === cb || ca.includes(cb) || cb.includes(ca);
  return sameCompany && datesOverlap(a, b, currentYear);
}

/** Agrupa una lista de experiencias en clústeres de posibles duplicados. */
export function clusterDuplicates<T extends WorkLike>(items: T[], currentYear?: number): T[][] {
  const clusters: T[][] = [];
  for (const item of items) {
    const hit = clusters.find((c) => c.some((x) => looksLikeDuplicate(x, item, currentYear)));
    if (hit) hit.push(item);
    else clusters.push([item]);
  }
  return clusters;
}
