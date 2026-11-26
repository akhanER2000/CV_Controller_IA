/* ============================================================================
   Fechas y orden de las tarjetas de Variantes (lote ajuste-y-experiencia).

   Antes la tarjeta decía «tocada recién» / «hace 5 días»: no se sabía cuál CV
   era nuevo y cuál viejo, ni cuándo se creó. Ahora cada tarjeta lleva las dos
   fechas REALES que guarda cv_variants (created_at y updated_at), en formato
   local: «Creada 26 nov 2026 · Editada hoy 15:40». La hora exacta completa va
   en el title (al pasar el ratón). Sin fecha legible no se pinta nada: nunca se
   inventa una.

   Funciones puras (reciben `ahora` y el idioma) para poder probarlas sin reloj.
   ============================================================================ */

export type Idioma = "es" | "en";

/** Locale de formato: el mismo par que ya usa la app para números (es-CL / en-US). */
export function localeDe(lang: string): string {
  return lang === "en" ? "en-US" : "es-CL";
}

function aFecha(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Días de calendario LOCAL entre `d` y `ahora` (0 = hoy, 1 = ayer). */
function diasDeCalendario(d: Date, ahora: Date): number {
  const a = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

function hora(d: Date, lang: string): string {
  // ES: 24 h («15:40»), como en el resto de la app; EN: el reloj de en-US.
  return new Intl.DateTimeFormat(localeDe(lang), {
    hour: "2-digit",
    minute: "2-digit",
    ...(lang === "en" ? {} : { hourCycle: "h23" as const }),
  }).format(d);
}

/** «26 nov 2026» / «Nov 26, 2026». */
export function fechaCorta(iso: string | null | undefined, lang: string): string {
  const d = aFecha(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat(localeDe(lang), { day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** Textos que vienen del diccionario (para no cablear «hoy»/«ayer»). */
export interface TextosDia {
  hoy: string; // "hoy {h}"
  ayer: string; // "ayer {h}"
}

/** Fecha de EDICIÓN: «hoy 15:40», «ayer 09:12» o, si es más vieja, «3 nov 2026». */
export function fechaRelativaDia(
  iso: string | null | undefined,
  lang: string,
  textos: TextosDia,
  ahora: Date = new Date(),
): string {
  const d = aFecha(iso);
  if (!d) return "";
  const dias = diasDeCalendario(d, ahora);
  if (dias === 0) return textos.hoy.replace("{h}", hora(d, lang));
  if (dias === 1) return textos.ayer.replace("{h}", hora(d, lang));
  return fechaCorta(iso, lang);
}

/** Fecha y hora completas para el title: «jueves, 26 de noviembre de 2026, 15:40». */
export function fechaCompleta(iso: string | null | undefined, lang: string): string {
  const d = aFecha(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat(localeDe(lang), {
    dateStyle: "full",
    timeStyle: "short",
    ...(lang === "en" ? {} : { hourCycle: "h23" as const }),
  }).format(d);
}

/* ── Orden ──────────────────────────────────────────────────────────────────
   «editadas» es el orden que ya traía el servidor (updated_at desc): es el
   valor por defecto para que nadie note un cambio que no pidió. */
export type OrdenVariantes = "recientes" | "antiguas" | "editadas" | "nombre";
export const ORDENES: readonly OrdenVariantes[] = ["recientes", "antiguas", "editadas", "nombre"];
export const ORDEN_POR_DEFECTO: OrdenVariantes = "editadas";
export const CLAVE_ORDEN = "corpus.variantes.orden";

export function esOrden(x: unknown): x is OrdenVariantes {
  return typeof x === "string" && (ORDENES as readonly string[]).includes(x);
}

interface Ordenable {
  nm: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const ms = (iso: string | null | undefined) => aFecha(iso)?.getTime() ?? null;

/** Índices de `lista` en el orden pedido. Devuelve ÍNDICES (no copias) porque las
 *  acciones de fila de la pantalla trabajan con el índice original. Las filas sin
 *  fecha (la maqueta local) quedan al final y en su orden de llegada. */
export function ordenarIndices(lista: readonly Ordenable[], orden: OrdenVariantes, lang: string): number[] {
  const idx = lista.map((_, i) => i);
  const porFecha = (campo: "createdAt" | "updatedAt", desc: boolean) => (a: number, b: number) => {
    const x = ms(lista[a]![campo]);
    const y = ms(lista[b]![campo]);
    if (x === null && y === null) return a - b;
    if (x === null) return 1;
    if (y === null) return -1;
    return (desc ? y - x : x - y) || a - b;
  };
  if (orden === "recientes") return idx.sort(porFecha("createdAt", true));
  if (orden === "antiguas") return idx.sort(porFecha("createdAt", false));
  if (orden === "editadas") return idx.sort(porFecha("updatedAt", true));
  const col = new Intl.Collator(localeDe(lang), { sensitivity: "base", numeric: true });
  return idx.sort((a, b) => col.compare(lista[a]!.nm, lista[b]!.nm) || a - b);
}
