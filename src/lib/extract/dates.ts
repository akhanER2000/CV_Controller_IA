/**
 * Normalización de rangos de fecha ES/EN (§C2). Detecta la fecha o admite que
 * falta: NUNCA rellena lo que no está. Un año sin mes se queda como «AAAA» (no se
 * inventa el mes). Un rango imposible (fin < inicio) se marca `invalid` con el
 * texto original — no se corrige solo.
 *
 * Ejemplos que cubre:
 *   «mar 2022 – hoy»              → { start: "03/2022", current: true }
 *   «enero de 2020 - marzo 2021»  → { start: "01/2020", end: "03/2021" }
 *   «Jan 2020 – Present»          → { start: "01/2020", current: true }
 *   «2019 – 2020»                 → { start: "2019", end: "2020" }   (año honesto)
 *   «03/2021 - 09/2023»           → { start: "03/2021", end: "09/2023" }
 *   «2023 - 2021»                 → { invalid: "2023 - 2021" }        (fin < inicio)
 */

export interface DateRange {
  /** «MM/AAAA» si hay mes; «AAAA» si solo hay año; ausente si no se detecta. */
  start?: string;
  end?: string;
  /** el rango sigue abierto («hoy» / «Present»). */
  current?: boolean;
  /** rango imposible: el texto ORIGINAL, para que lo arregle un humano. */
  invalid?: string;
}

const stripAccents = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Nombres y abreviaturas de mes → número. Se consultan por token normalizado.
const MONTHS: Record<string, number> = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4,
  mayo: 5, may: 5, junio: 6, jun: 6, julio: 7, jul: 7, agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, set: 9, sept: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
  january: 1, jan: 1, february: 2, march: 3, april: 4, apr: 4, june: 6,
  july: 7, august: 8, aug: 8, september: 9, october: 10, november: 11,
  december: 12, dec: 12,
};

// Marcas de «sigue abierto» (ES/EN), normalizadas sin acento.
const PRESENT = ["hoy", "actual", "actualidad", "presente", "present", "current", "now", "ongoing", "en curso", "a la fecha", "to date", "til date", "till date"];

function monthFromToken(t: string): number | undefined {
  const letters = stripAccents(t).toLowerCase().replace(/[^a-z]/g, "");
  if (!letters) return undefined;
  if (MONTHS[letters] != null) return MONTHS[letters];
  if (letters.length >= 3 && MONTHS[letters.slice(0, 3)] != null) return MONTHS[letters.slice(0, 3)];
  return undefined;
}

function isPresent(part: string): boolean {
  const s = stripAccents(part).toLowerCase();
  return PRESENT.some((p) => s.includes(p));
}

interface ParsedPart {
  month?: number;
  year?: number;
  /** hubo algún dato de fecha reconocible en esta parte. */
  ok: boolean;
}

/** Parsea «marzo de 2021» / «03/2021» / «2021» / «2021-03» → {month?, year?}. */
function parsePart(part: string): ParsedPart {
  const s = stripAccents(part).toLowerCase().replace(/\b(de|del|of)\b/g, " ").trim();
  if (!s) return { ok: false };

  // MM/AAAA (o MM-AAAA, MM.AAAA)
  let m = s.match(/\b(\d{1,2})[/\-.](\d{4})\b/);
  if (m) {
    const mo = Number(m[1]), yr = Number(m[2]);
    return mo >= 1 && mo <= 12 ? { month: mo, year: yr, ok: true } : { year: yr, ok: true };
  }
  // AAAA/MM (o AAAA-MM)
  m = s.match(/\b(\d{4})[/\-.](\d{1,2})\b/);
  if (m) {
    const yr = Number(m[1]), mo = Number(m[2]);
    return mo >= 1 && mo <= 12 ? { month: mo, year: yr, ok: true } : { year: yr, ok: true };
  }

  const yearMatch = s.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : undefined;

  let month: number | undefined;
  for (const t of s.split(/\s+/)) {
    const mm = monthFromToken(t);
    if (mm != null) { month = mm; break; }
  }

  if (year == null && month == null) return { ok: false };
  return { month, year, ok: true };
}

/** «MM/AAAA» si hay mes; «AAAA» si solo año; undefined si no hay año. */
function fmt(p: ParsedPart): string | undefined {
  if (p.year == null) return undefined;
  if (p.month == null) return String(p.year);
  return `${String(p.month).padStart(2, "0")}/${p.year}`;
}

/** clave comparable a granularidad de mes (mes 1 por defecto). */
const monthKey = (p: ParsedPart): number => (p.year ?? 0) * 12 + (p.month ?? 1);

/** Divide en [inicio, fin] por el separador de rango. Devuelve [raw] si no hay. */
function splitRange(raw: string): string[] {
  // guiones (–—-) o palabras de rango; se evita partir dentro de «MM-AAAA» /
  // «AAAA-MM» exigiendo espacio alrededor del guion.
  const parts = raw.split(/\s+[–—-]\s+|\s+(?:to|hasta|al)\s+/i);
  if (parts.length >= 2) return [parts[0]!, parts.slice(1).join(" ")];
  // guion pegado entre dos bloques con año a cada lado (p. ej. «2019-2020»)
  const tight = raw.match(/^(.*\b(?:19|20)\d{2})\s*[–—-]\s*((?:19|20)\d{2}.*)$/);
  if (tight) return [tight[1]!, tight[2]!];
  return [raw];
}

export function normalizeDateRange(raw: string): DateRange {
  const text = (raw ?? "").trim();
  if (!text) return {};

  const [startPart, endPartRaw = ""] = splitRange(text);
  const start = parsePart(startPart);
  const endIsPresent = endPartRaw ? isPresent(endPartRaw) : false;
  const end = endPartRaw && !endIsPresent ? parsePart(endPartRaw) : { ok: false as boolean };

  // nada reconocible → sin fechas (el pipeline marcará dateMissing)
  if (!start.ok && !endIsPresent && !end.ok) return {};

  const out: DateRange = {};
  const startStr = fmt(start);
  const endStr = fmt(end as ParsedPart);
  if (startStr) out.start = startStr;
  if (endIsPresent) out.current = true;
  else if (endStr) out.end = endStr;

  // rango imposible: fin < inicio a la granularidad disponible
  if (start.ok && (end as ParsedPart).ok && start.year != null && (end as ParsedPart).year != null) {
    const e = end as ParsedPart;
    const bothMonths = start.month != null && e.month != null;
    const impossible = bothMonths
      ? monthKey(e) < monthKey(start)
      : (e.year as number) < (start.year as number);
    if (impossible) return { invalid: text };
  }

  return out;
}
