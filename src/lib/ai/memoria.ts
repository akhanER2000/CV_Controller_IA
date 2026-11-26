import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelMessage, SystemModelMessage } from "ai";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MEMORIA DEL PERFIL (DA-M2) — que la IA no relea todo el perfil en cada llamada.
 *
 * LA FORMA: una serialización CANÓNICA del master, construida SIN IA. Mismo master
 * ⇒ mismos bytes ⇒ misma huella. Esa estabilidad byte a byte es lo que permite el
 * prompt caching de Anthropic: la memoria va como PRIMER bloque del system con
 * `cache_control`, y las llamadas siguientes la leen de caché (~0,05× el precio de
 * entrada en Sonnet 5.5) en vez de pagarla entera.
 *
 * ★ NADA DE RESUMEN ESCRITO POR IA. Un resumen generado podría parafrasear y el
 *   candado de hechos (verify.ts) compara contra el master, no contra la memoria.
 *   Aquí solo hay campos del master, ordenados siempre igual.
 *
 * ★ NADA VOLÁTIL EN EL CONTENIDO (ni fechas de construcción, ni contadores de uso):
 *   un byte que cambie invalida la caché entera.
 *
 * `construirMemoria` es pura (tests/memoria-ia.test.ts). `obtenerMemoria` lee la
 * fila guardada, compara la huella con la del master actual y SOLO reescribe si
 * cambió. Sin la 0010 aplicada, degrada: devuelve la memoria construida al vuelo
 * (persistida:false) y la llamada sigue funcionando.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Lo mínimo de un item del master que la memoria necesita (compatible con MasterItem). */
export interface ItemMemoria {
  id: string;
  kind: string;
  parentId: string | null;
  data: Record<string, unknown>;
  evidenceSnippet: string | null;
  evidenceVerified: boolean;
  sortOrder: number;
}

export interface Memoria {
  contenido: string;
  huella: string;
  items: number;
  tokensAprox: number;
}

/** Sube si cambia el FORMATO: así una memoria vieja no se reutiliza con otro formato. */
export const VERSION_MEMORIA = "m1";

/** Recortes: la memoria es contexto, no un volcado. */
const MAX_VALOR = 400;
const MAX_EVIDENCIA = 160;

/** Orden de secciones (lo que no esté aquí va detrás, alfabético). */
const ORDEN_KIND = [
  "basics", "summary", "work", "project", "education", "skill", "certification",
  "language", "publication", "award", "volunteer", "reference",
];

/** Campos que van primero dentro de un item, en este orden; el resto, alfabético. */
const ORDEN_CAMPO = [
  "name", "title", "role", "position", "company", "organization", "institution", "school",
  "degree", "area", "field", "label", "text", "summary", "description", "location",
  "start", "startDate", "end", "endDate", "date", "level", "keywords", "url",
];

/** Campos que no aportan hechos (imágenes, estilos, QR…). */
const CAMPO_IGNORADO = /photo|foto|avatar|image|imagen|qr|color|style|estilo|icon/i;

const limpio = (s: string) => s.replace(/\s+/g, " ").trim();
const recorta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Un valor del master como texto canónico, o null si no aporta. */
function valorCanonico(v: unknown): string | null {
  if (typeof v === "string") {
    const t = limpio(v);
    return t ? recorta(t, MAX_VALOR) : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) {
    const partes = v.map(valorCanonico).filter((x): x is string => !!x);
    return partes.length ? recorta(partes.join(", "), MAX_VALOR) : null;
  }
  if (v && typeof v === "object") {
    // Objetos anidados (p. ej. un enlace {label,url}): sus valores, claves ordenadas.
    const o = v as Record<string, unknown>;
    const partes = Object.keys(o).sort().map((k) => valorCanonico(o[k])).filter((x): x is string => !!x);
    return partes.length ? recorta(partes.join(" "), MAX_VALOR) : null;
  }
  return null;
}

const rangoCampo = (k: string) => {
  const i = ORDEN_CAMPO.indexOf(k);
  return i === -1 ? ORDEN_CAMPO.length : i;
};
const rangoKind = (k: string) => {
  const i = ORDEN_KIND.indexOf(k);
  return i === -1 ? ORDEN_KIND.length : i;
};
const cmpTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Los campos de un item, en orden canónico: «clave: valor · clave: valor». */
function camposCanonicos(data: Record<string, unknown>): string {
  return Object.keys(data ?? {})
    .filter((k) => !CAMPO_IGNORADO.test(k))
    .sort((a, b) => rangoCampo(a) - rangoCampo(b) || cmpTexto(a, b))
    .map((k) => {
      const v = valorCanonico(data[k]);
      return v ? `${k}: ${v}` : null;
    })
    .filter((x): x is string => !!x)
    .join(" · ");
}

function lineaDe(it: ItemMemoria, sangria: string): string {
  const campos = camposCanonicos(it.data);
  let linea = `${sangria}[${it.id}] ${it.kind}${campos ? ` · ${campos}` : ""}`;
  // Solo la evidencia VERIFICADA: la no verificada no es un hecho, es una pista.
  const ev = it.evidenceVerified && it.evidenceSnippet ? limpio(it.evidenceSnippet) : "";
  if (ev) linea += ` · evidencia✓ «${recorta(ev, MAX_EVIDENCIA)}»`;
  return linea;
}

/** Aproximación barata (sin tokenizador): ~3,6 caracteres por token en ES/EN. */
export const tokensAproxDe = (texto: string) => Math.ceil(texto.length / 3.6);

/** sha256 del contenido + versión del formato, 16 hex. */
export const huellaDe = (contenido: string) =>
  createHash("sha256").update(`${VERSION_MEMORIA}\n${contenido}`).digest("hex").slice(0, 16);

/**
 * La memoria del perfil a partir de los items del master. PURA y DETERMINISTA:
 * no depende del orden de entrada (se ordena por sección, sort_order e id), así que
 * la misma entrada —en cualquier orden— da los mismos bytes y la misma huella.
 */
export function construirMemoria(items: readonly ItemMemoria[]): Memoria {
  const ids = new Set(items.map((i) => i.id));
  const hijos = new Map<string, ItemMemoria[]>();
  const raiz: ItemMemoria[] = [];
  for (const it of items) {
    if (it.parentId && ids.has(it.parentId)) {
      hijos.set(it.parentId, [...(hijos.get(it.parentId) ?? []), it]);
    } else {
      raiz.push(it);
    }
  }
  const porOrden = (a: ItemMemoria, b: ItemMemoria) => a.sortOrder - b.sortOrder || cmpTexto(a.id, b.id);
  raiz.sort((a, b) => rangoKind(a.kind) - rangoKind(b.kind) || cmpTexto(a.kind, b.kind) || porOrden(a, b));

  const lineas: string[] = [];
  const pinta = (it: ItemMemoria, nivel: number) => {
    lineas.push(lineaDe(it, "  ".repeat(nivel)));
    for (const h of [...(hijos.get(it.id) ?? [])].sort(porOrden)) pinta(h, nivel + 1);
  };
  for (const it of raiz) pinta(it, 0);

  const contenido =
    "MEMORIA DEL PERFIL — el master canónico del candidato. Es la ÚNICA fuente de hechos sobre él: " +
    "no inventes cifras, empresas, fechas ni tecnologías que no estén aquí.\n" +
    "Formato: [id] tipo · campo: valor · … Los items con sangría cuelgan del de encima. " +
    "«evidencia✓» es un fragmento literal verificado de la fuente original.\n" +
    `ITEMS (${items.length}):\n` +
    lineas.join("\n");

  return { contenido, huella: huellaDe(contenido), items: items.length, tokensAprox: tokensAproxDe(contenido) };
}

/* ══════════════════════════════════════════════════════════════════════════
   PERSISTENCIA — leer, comparar la huella y reconstruir solo si cambió.
   ══════════════════════════════════════════════════════════════════════════ */

export interface EstadoMemoria extends Memoria {
  /** cuándo se escribió la memoria vigente (ISO), o null si no se pudo guardar */
  actualizadaEn: string | null;
  /** true si en ESTA llamada se reescribió la fila (el master cambió, o se forzó) */
  reconstruida: boolean;
  /** false si la tabla no existe / no se pudo escribir: la memoria vale para esta llamada */
  persistida: boolean;
  /** la última llamada registrada (tokens), si la hay */
  ultimaLlamada: UsoLlamada | null;
}

export interface DepsMemoria {
  /** Lee el master del usuario. Por defecto, getMasterItems (el embudo del registro). */
  leerMaster?: (sb: SupabaseClient, userId: string) => Promise<ItemMemoria[]>;
  /** Reloj inyectable (tests). */
  ahora?: () => Date;
}

async function leerMasterPorDefecto(sb: SupabaseClient, userId: string): Promise<ItemMemoria[]> {
  // Import perezoso: memoria.ts sigue siendo importable (y testeable) sin queries.ts.
  const { getMasterItems } = await import("@/lib/db/queries");
  return getMasterItems(sb, userId);
}

/**
 * La memoria vigente del usuario. Siempre se construye a partir del master ACTUAL
 * (es barato: no hay IA). Si su huella coincide con la guardada, se devuelve la fila
 * sin tocarla; si no —o con `forzar`— se reescribe. Nunca lanza por la tabla: si la
 * 0010 no está aplicada, devuelve la memoria al vuelo con persistida:false.
 */
export async function obtenerMemoria(
  sb: SupabaseClient,
  userId: string,
  opts: { forzar?: boolean } = {},
  deps: DepsMemoria = {},
): Promise<EstadoMemoria> {
  const leer = deps.leerMaster ?? leerMasterPorDefecto;
  const ahora = deps.ahora ?? (() => new Date());
  const actual = construirMemoria(await leer(sb, userId));

  const { data: fila, error: errLectura } = await sb
    .from("ai_memoria")
    .select("huella,actualizada_en,ultima_llamada")
    .eq("user_id", userId)
    .maybeSingle();

  if (errLectura) {
    // Tabla ausente (0010 sin aplicar) u otro fallo: degradar, no romper la llamada.
    return { ...actual, actualizadaEn: null, reconstruida: false, persistida: false, ultimaLlamada: null };
  }

  const ultimaLlamada = (fila?.ultima_llamada as UsoLlamada | null | undefined) ?? null;
  if (fila && fila.huella === actual.huella && !opts.forzar) {
    return {
      ...actual,
      actualizadaEn: (fila.actualizada_en as string | null) ?? null,
      reconstruida: false,
      persistida: true,
      ultimaLlamada,
    };
  }

  const actualizadaEn = ahora().toISOString();
  const { error: errEscritura } = await sb.from("ai_memoria").upsert(
    {
      user_id: userId,
      contenido: actual.contenido,
      huella: actual.huella,
      items: actual.items,
      tokens_aprox: actual.tokensAprox,
      actualizada_en: actualizadaEn,
    },
    { onConflict: "user_id" },
  );
  if (errEscritura) {
    return { ...actual, actualizadaEn: null, reconstruida: false, persistida: false, ultimaLlamada };
  }
  return { ...actual, actualizadaEn, reconstruida: true, persistida: true, ultimaLlamada };
}

/* ══════════════════════════════════════════════════════════════════════════
   EL BLOQUE EN LA LLAMADA — un helper único para todas las redacciones.
   ══════════════════════════════════════════════════════════════════════════ */

/** ¿El modelo instanciado es de Anthropic? (el envuelto con fallback conserva el provider de Claude). */
export function esAnthropic(modelo: { provider?: string } | string): boolean {
  const p = typeof modelo === "string" ? modelo : (modelo.provider ?? "");
  return /anthropic/i.test(p);
}

/**
 * Los mensajes de una llamada de redacción con la memoria como PRIMER bloque del
 * system. Con Anthropic, ese bloque lleva `cache_control: ephemeral` (prompt
 * caching): el prefijo [tools + memoria] se cachea y las llamadas siguientes con el
 * mismo master lo leen de caché. Con cualquier otro proveedor (Gemini), la memoria
 * viaja como texto normal, sin marca. Si la llamada cae de Claude a Gemini en
 * ejecución (conFallback), Gemini ignora `providerOptions.anthropic`: texto normal.
 *
 * ★ El orden importa: memoria (estable) → instrucciones de la tarea → lo variable
 *   (aviso, rol, items de la variante) en el mensaje de usuario. Lo volátil SIEMPRE
 *   después del punto de caché.
 */
export function mensajesConMemoria(args: {
  memoria: string | null | undefined;
  modelo: { provider?: string } | string;
  sistema: string;
  usuario: string;
}): { instructions: SystemModelMessage[]; messages: ModelMessage[] } {
  // ⚠ AI SDK 7 RECHAZA `role:"system"` dentro de `messages` (AI_InvalidPromptError):
  //   el system va por `instructions`. Por eso el helper devuelve las DOS piezas y
  //   la llamada las esparce: generateObject({ model, schema, ...mensajesConMemoria(…) }).
  const instructions: SystemModelMessage[] = [];
  const mem = (args.memoria ?? "").trim();
  if (mem) {
    instructions.push(
      esAnthropic(args.modelo)
        ? {
            role: "system",
            content: mem,
            providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
          }
        : { role: "system", content: mem },
    );
  }
  // Sin instrucciones propias (p. ej. traducir: van dentro del mensaje), no hay 2º bloque.
  if (args.sistema.trim()) instructions.push({ role: "system", content: args.sistema });
  return { instructions, messages: [{ role: "user", content: args.usuario }] };
}

/* ══════════════════════════════════════════════════════════════════════════
   TOKENS DE CADA LLAMADA — entrada, salida y cacheados, de verdad.
   ══════════════════════════════════════════════════════════════════════════ */

export interface UsoLlamada {
  /** qué llamada fue (variantes, adaptar-aviso, ajustar, traducir, afinar…) */
  tarea: string;
  /** tokens de entrada TOTALES reportados (incluye los cacheados), o null si no vino usage */
  entrada: number | null;
  salida: number | null;
  /** tokens leídos de la caché (cache_read_input_tokens) */
  cacheados: number;
  /** tokens escritos a la caché en esta llamada (cache_creation_input_tokens) */
  escritosCache: number;
  /** epoch ISO */
  en: string;
}

type UsoCrudo = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number; noCacheTokens?: number };
};

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Lee el uso de un resultado del AI SDK (generateObject/generateText). Tolerante con
 * la forma: `inputTokenDetails.cacheReadTokens` (SDK actual), `cachedInputTokens`
 * (anterior) y, si faltan, los metadatos crudos de Anthropic.
 */
export function usoDe(
  tarea: string,
  r: { usage?: unknown; providerMetadata?: unknown },
  ahora: () => Date = () => new Date(),
): UsoLlamada {
  const u = (r.usage ?? {}) as UsoCrudo;
  const meta = ((r.providerMetadata ?? {}) as { anthropic?: Record<string, unknown> }).anthropic ?? {};
  const metaUso = (meta.usage ?? {}) as Record<string, unknown>;
  const cacheados =
    num(u.inputTokenDetails?.cacheReadTokens) ??
    num(u.cachedInputTokens) ??
    num(metaUso.cache_read_input_tokens) ??
    0;
  const escritos =
    num(u.inputTokenDetails?.cacheWriteTokens) ??
    num(meta.cacheCreationInputTokens) ??
    num(metaUso.cache_creation_input_tokens) ??
    0;
  return {
    tarea,
    entrada: num(u.inputTokens) ?? null,
    salida: num(u.outputTokens) ?? null,
    cacheados,
    escritosCache: escritos,
    en: ahora().toISOString(),
  };
}

/**
 * Registra el uso de una llamada: consola (siempre) y `ai_memoria.ultima_llamada`
 * (si la fila existe). Nunca lanza: medir no puede tumbar la redacción.
 */
export async function registrarLlamada(sb: SupabaseClient, userId: string, uso: UsoLlamada): Promise<void> {
  console.info(
    `[ia] ${uso.tarea}: entrada ${uso.entrada ?? "?"} · salida ${uso.salida ?? "?"} · ` +
      `cacheados ${uso.cacheados} · escritos a caché ${uso.escritosCache}`,
  );
  try {
    await sb.from("ai_memoria").update({ ultima_llamada: uso }).eq("user_id", userId);
  } catch {
    /* sin la 0010, no hay dónde guardarlo: la consola basta */
  }
}

/**
 * Lo que una función LLM inyectable necesita para usar la memoria: el texto y a
 * quién avisar del uso. Los llamadores (rutas) lo arman con `contextoMemoria`.
 */
export interface ContextoMemoria {
  memoria: string | null;
  alUsar: (r: { usage?: unknown; providerMetadata?: unknown }) => Promise<void>;
}

/** Arma el contexto de memoria de una ruta: obtiene la memoria y deja listo el registro de uso. */
export async function contextoMemoria(
  sb: SupabaseClient,
  userId: string,
  tarea: string,
  deps: DepsMemoria = {},
): Promise<ContextoMemoria> {
  let memoria: string | null = null;
  try {
    memoria = (await obtenerMemoria(sb, userId, {}, deps)).contenido;
  } catch (e) {
    // Sin memoria la llamada sigue: solo pierde la caché.
    console.warn(`[ia] ${tarea}: no se pudo obtener la memoria (${e instanceof Error ? e.message : e}); va sin ella.`);
  }
  return {
    memoria,
    alUsar: (r) => registrarLlamada(sb, userId, usoDe(tarea, r)),
  };
}
