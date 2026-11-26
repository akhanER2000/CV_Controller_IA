import "server-only";
import { createHash } from "node:crypto";
import { APICallError, LoadAPIKeyError, generateText, wrapLanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REGISTRO ÚNICO DE MODELOS — una tarea, un modelo, un sitio.
 *
 * EL PROBLEMA: el literal "gemini-flash-latest" estaba COPIADO en cinco ficheros.
 * Cambiar de modelo obligaba a encontrarlos todos, y el panel de salud podía acabar
 * reportando un modelo distinto del que la extracción usa de verdad.
 *
 * LA FORMA: un mapa TAREA → modelo. Las tareas son las que el código ya hace hoy.
 *
 * ★ ANTHROPIC (Claude) ES EL PROVEEDOR PRINCIPAL DE TODAS LAS TAREAS; GEMINI EL
 *   SECUNDARIO. Orden de clave, igual en todas:
 *     1. la clave BYOK de Anthropic del usuario (user_settings.llm_api_key_3),
 *     2. ANTHROPIC_API_KEY del servidor,
 *     3. Gemini (BYOK del usuario o GEMINI_API_KEY del servidor).
 *   Groq (2ª clave BYOK) queda OPCIONAL y solo para `clasificacion-barata`: atiende
 *   cuando no hay ninguna clave de Anthropic, antes de caer a Gemini.
 *
 * ★ FALLBACK REAL, NUNCA EN SILENCIO. Si Claude falla en tiempo de ejecución (401,
 *   403, 404 de modelo, 429, 5xx o la red), la MISMA llamada —mismos parámetros— se
 *   repite con Gemini (`conFallback`). Se avisa por consola y la caída queda anotada:
 *   `rutaDe` marca la tarea `degradado` durante `TTL_CAIDA_MS`, así el panel de salud
 *   enseña quién atiende de verdad. Sin clave de Anthropic, la tarea va directa a
 *   Gemini y también sale `degradado`.
 *
 *   ⚠ Esto NO apila modelos para «más fiabilidad» del contenido: la fiabilidad sigue
 *     viniendo de la verificación DETERMINISTA (evidencia literal, preservesFacts,
 *     round-trip ATS). El fallback solo evita que un proveedor caído tumbe la app.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Los proveedores del router. anthropic = principal · google = secundario · groq = barato opcional. */
export type Proveedor = "google" | "groq" | "anthropic";

/** El proveedor PRINCIPAL de todas las tareas. */
export const PROVEEDOR_PRINCIPAL: Proveedor = "anthropic";
/** El proveedor SECUNDARIO: atiende sin clave de Anthropic o cuando Claude falla. */
export const PROVEEDOR_SECUNDARIO: Proveedor = "google";
/** El proveedor BARATO opcional (solo clasificación, solo con 2ª clave). */
export const PROVEEDOR_BARATO: Proveedor = "groq";

/** Base URL OpenAI-compatible de Groq. */
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** Las tareas REALES del repo, cada una con el sitio que la ejecuta. */
export type Tarea =
  /** Transcripción verbatim de imagen / PDF escaneado (llm.ts · visión). */
  | "transcripcion-vision"
  /** Extracción estructurada con evidencia: los cinco schemas (llm.ts). */
  | "extraccion-estructurada"
  /** Redacción que NO puede inventar hechos: variantes y «Ajustar» (§preservesFacts). */
  | "redaccion-preserva-hechos"
  /** Clasificación barata / decisiones de una palabra · desempate de duplicados. */
  | "clasificacion-barata"
  /** Ping de salud: ¿responde el proveedor? (health/ai · health/status). */
  | "ping-salud";

/** Todas las tareas, en orden, para recorrer el registro (p. ej. el panel de salud). */
export const TAREAS: readonly Tarea[] = [
  "transcripcion-vision",
  "extraccion-estructurada",
  "redaccion-preserva-hechos",
  "clasificacion-barata",
  "ping-salud",
] as const;

export interface Definicion {
  /** El proveedor PREFERENTE de la tarea: Anthropic en todas. */
  proveedor: Proveedor;
  /** El modelo del proveedor preferente (Claude, ID versionado). */
  modelo: string;
  /** El modelo de Gemini al que la tarea CAE (sin clave de Anthropic o si Claude falla). */
  modeloFallback: string;
  /** SOLO en clasificación: el modelo de Groq, si hay 2ª clave y ninguna de Anthropic. */
  modeloBarato?: string;
  /** Por qué ESTE modelo para ESTA tarea. Sin esto el registro es una tabla muda. */
  motivo: string;
}

/** Claude Sonnet: visión, extracción y redacción. ID versionado, comprobado con llamada real. */
export const MODELO_SONNET = "claude-sonnet-5-5";
/** Claude Haiku: clasificación y ping. ID versionado, comprobado con llamada real. */
export const MODELO_HAIKU = "claude-haiku-5-5";
/** El Gemini secundario: el que ganó el A/B de extracción de Gemini (abajo). */
export const MODELO_GEMINI = "gemini-3.6-flash";
/** El Groq opcional de clasificación (soporta salida estructurada). */
export const MODELO_GROQ = "llama-3.3-70b-versatile";

/**
 * El único sitio del repo donde se nombra un modelo.
 *
 * ★ NUNCA UN ALIAS FLOTANTE (`-latest`) EN PRODUCCIÓN. Un alias flotante es dejar
 *   que tu proveedor te elija la factura: `gemini-flash-latest` se fue al escalón más
 *   caro sin que nadie lo eligiera. Un ID versionado solo cambia cuando lo cambiamos
 *   aquí. `tests/modelos-registro.test.ts` falla si reaparece un `-latest`.
 *
 * ⚠⚠ EL LISTADO DE MODELOS MIENTE. `GET /v1beta/models` devolvió 20 modelos de
 *   Gemini con `generateContent`; al hacerles un ping REAL solo 11 respondieron.
 *   Listado ≠ utilizable: los IDs de Claude de aquí salen de `GET /v1/models` Y de
 *   una llamada real a cada uno (tests/manual/ab-modelos.ts).
 *
 * ★ GEMINI (secundario): `gemini-3.6-flash`, por el A/B MEDIDO sobre el dossier real
 *   con el CANARIO de evidencia literal (`normalize(raw).includes(normalize(ev))`):
 *
 *     gemini-3.6-flash        46 items · 87 % verificado ·  6 parciales   ← elegido
 *     gemini-3.5-flash        35 items · 86 % verificado ·  5 parciales
 *     gemini-3.5-flash-lite   40 items · 30 % verificado · 28 parciales   ✗
 *     gemini-3.1-flash-lite   35 items · 35 % verificado · 22 parciales   ✗
 *
 *   ★ CLAUDE (principal), MISMO A/B, 25-nov-2026 (9 llamadas, prompts de producción):
 *
 *     claude-sonnet-5-5       45 items · 98 % verificado ·  1 parcial    ← principal
 *     gemini-3.6-flash        47 items · 52 % verificado · 23 parciales  (misma tanda)
 *
 *   Sonnet gasta ~1,9× tokens de entrada (97 k vs 52 k: otro tokenizador) y ~0,6× de
 *   salida. El 52 % de Gemini es una sola tanda; la del jul. dio 87 %: varía.
 *
 *   ★ LOS LITE NO SIRVEN PARA ESTO: un modelo débil no falla inventando, falla
 *   PARAFRASEANDO, y el includes() da false. Por eso la extracción va en Sonnet y no
 *   en Haiku: Haiku solo atiende decisiones de una palabra y el ping.
 *
 *   Reproducir (Claude y Gemini): `tests/manual/ab-modelos.ts` (fuera de CI; gasta tokens).
 */
export const REGISTRO: Readonly<Record<Tarea, Definicion>> = {
  "transcripcion-vision": {
    proveedor: "anthropic",
    modelo: MODELO_SONNET,
    modeloFallback: MODELO_GEMINI,
    motivo:
      "de su fidelidad LITERAL depende el detector de alucinación: un modelo pleno (Sonnet), " +
      "nunca un pequeño. Cae a Gemini flash si Claude no está o falla.",
  },
  "extraccion-estructurada": {
    proveedor: "anthropic",
    modelo: MODELO_SONNET,
    modeloFallback: MODELO_GEMINI,
    motivo:
      "structured outputs con los cinco schemas. Es el 80% de los tokens, y aun así no se baja " +
      "a un modelo pequeño: el canario de evidencia mide que los débiles parafrasean en vez de citar.",
  },
  "redaccion-preserva-hechos": {
    proveedor: "anthropic",
    modelo: MODELO_SONNET,
    modeloFallback: MODELO_GEMINI,
    motivo:
      "aquí se juega la promesa del producto: preservesFacts impide la invención igual, pero un " +
      "modelo débil redacta peor. Es el sitio donde pagar bien vale.",
  },
  "clasificacion-barata": {
    proveedor: "anthropic",
    modelo: MODELO_HAIKU,
    modeloFallback: MODELO_GEMINI,
    modeloBarato: MODELO_GROQ,
    motivo:
      "decisiones de una palabra y desempate de duplicados: Haiku basta y es el más barato de " +
      "Claude. Sin Anthropic, Groq (2ª clave) si la hay; si no, Gemini.",
  },
  "ping-salud": {
    proveedor: "anthropic",
    modelo: MODELO_HAIKU,
    modeloFallback: MODELO_GEMINI,
    motivo: "¿responde el proveedor principal? Una palabra: Haiku, la llamada más barata de Claude.",
  },
};

/** El nombre del modelo PREFERENTE de una tarea. Para reportarlo sin llamar a nada. */
export const modeloDe = (tarea: Tarea): string => REGISTRO[tarea].modelo;

/** ¿De qué proveedor es un id de modelo? Claude → anthropic; el resto (gemini-…) → google. */
export function proveedorDeModelo(id: string): Proveedor {
  return /^claude-/i.test(id) ? "anthropic" : "google";
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ★ LA ELECCIÓN DEL USUARIO (selector de modelos probados) — y su ESPEJO.
 *
 * El usuario puede elegir, entre los modelos que su clave admite DE VERDAD (los que
 * respondieron a una llamada real; ver catalogo.ts), cuál atiende la extracción. Su
 * elección SOMBREA el registro en estas dos tareas y solo en estas:
 *   · `extraccion-estructurada` — es lo que el selector dice que elige.
 *   · `ping-salud` — ESPEJA a la extracción cuando hay elección: si el usuario mueve
 *     la extracción y el chequeo sigue probando otro modelo, el panel mentiría.
 * Puede ser un Claude (va a Anthropic, con Gemini de fallback) o un Gemini (el usuario
 * eligió Gemini a propósito: va directo a Gemini).
 * ════════════════════════════════════════════════════════════════════════════
 */
export const TAREAS_ELEGIBLES: readonly Tarea[] = ["extraccion-estructurada", "ping-salud"] as const;

/** La elección válida para esta tarea, o null (vacía o tarea no elegible). */
function eleccionDe(tarea: Tarea, elegido?: string | null): string | null {
  const e = typeof elegido === "string" ? elegido.trim() : "";
  return e && TAREAS_ELEGIBLES.includes(tarea) ? e : null;
}

/**
 * El modelo PREFERENTE de una tarea con la elección del usuario aplicada.
 * `elegido` vacío/nulo ⇒ el del registro.
 */
export function modeloEfectivo(tarea: Tarea, elegido?: string | null): string {
  return eleccionDe(tarea, elegido) ?? REGISTRO[tarea].modelo;
}

/** La clave de Gemini del SERVIDOR. Se acepta cualquiera de las dos variables de entorno. */
export function claveGemini(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || undefined;
}

/** La clave de Anthropic del SERVIDOR (ANTHROPIC_API_KEY). */
export function claveAnthropic(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || undefined;
}

/** El NOMBRE de la variable de Gemini que se está usando de verdad (para el panel de salud). */
export function nombreVarClave(): string | null {
  if (process.env.GEMINI_API_KEY) return "GEMINI_API_KEY";
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "GOOGLE_GENERATIVE_AI_API_KEY";
  return null;
}

/**
 * ¿Hay AL MENOS una clave con la que atender una tarea de IA? Las claves BYOK que el
 * llamador ya tenga (Gemini, Anthropic) más las del servidor. Es la condición del 503
 * de las rutas de IA: sin NINGUNA clave no hay a quién llamar; con una basta.
 */
export function hayClaveIA(...byok: (string | null | undefined)[]): boolean {
  return byok.some((k) => !!k) || !!claveAnthropic() || !!claveGemini();
}

/* ══════════════════════════════════════════════════════════════════════════
   CAÍDAS EN TIEMPO DE EJECUCIÓN — lo que `rutaDe` necesita para no mentir.
   ══════════════════════════════════════════════════════════════════════════ */

/** Cuánto tiempo una caída de Claude marca la tarea como degradada en el panel. */
export const TTL_CAIDA_MS = 5 * 60_000;

export interface Caida {
  /** el modelo de Claude que falló */
  modelo: string;
  /** el motivo real (HTTP 429: …, HTTP 404: …) */
  motivo: string;
  /** epoch ms */
  en: number;
}

/** La clave NUNCA se guarda: se indexa por su huella, que no permite recuperarla. */
const huella = (k: string) => createHash("sha256").update(k).digest("hex").slice(0, 16);

const caidas = new Map<string, Caida>();
const idCaida = (tarea: Tarea, claveA: string) => `${tarea}:${huella(claveA)}`;

/** La última caída de Claude en esta tarea con esta clave (la del servidor si no se pasa), si es reciente. */
export function caidaReciente(tarea: Tarea, claveA?: string): Caida | null {
  const k = claveA || claveAnthropic();
  if (!k) return null;
  const c = caidas.get(idCaida(tarea, k));
  return c && Date.now() - c.en < TTL_CAIDA_MS ? c : null;
}

/** Solo para los tests: olvida las caídas anotadas. */
export function _resetCaidas(): void {
  caidas.clear();
}

/**
 * ¿Este fallo de Claude justifica repetir la llamada con Gemini? Sin clave, 401, 403,
 * 404 (modelo), 408, 409, 429, 5xx y errores de red. NO: una cancelación del usuario
 * (AbortError), que tiene que cortar, no rebotar a otro proveedor.
 */
export function debeCaer(e: unknown): boolean {
  if (e && typeof e === "object" && (e as { name?: string }).name === "AbortError") return false;
  if (LoadAPIKeyError.isInstance(e)) return true;
  if (APICallError.isInstance(e)) {
    const s = e.statusCode;
    if (s === undefined) return true; // sin respuesta HTTP: red
    return s === 401 || s === 403 || s === 404 || s === 408 || s === 409 || s === 429 || s >= 500;
  }
  // fetch caído (TypeError: fetch failed, ECONNRESET…): el proveedor no respondió.
  return e instanceof TypeError || /ECONN|ETIMEDOUT|ENOTFOUND|fetch failed|socket/i.test(String(e));
}

function motivoCorto(e: unknown): string {
  if (APICallError.isInstance(e)) return `HTTP ${e.statusCode ?? "—"}: ${e.message}`.replace(/\s+/g, " ").slice(0, 200);
  return (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 200);
}

type Modelo = ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;
type ModeloLM = Modelo | ReturnType<ReturnType<typeof createAnthropic>>;

/**
 * ★ EL FALLBACK REAL. Envuelve el modelo de Claude: si su llamada falla con un error
 * de `debeCaer`, se anota la caída, se avisa por consola y se repite la MISMA llamada
 * (mismos `params`) con Gemini. Lo que no es caída (400 de petición mala, cancelación)
 * se relanza tal cual: no se tapa un error con otro proveedor.
 */
function conFallback(tarea: Tarea, claveA: string, primario: ModeloLM, secundario: Modelo) {
  const caer = (e: unknown) => {
    if (!debeCaer(e)) return false;
    const motivo = motivoCorto(e);
    caidas.set(idCaida(tarea, claveA), { modelo: primario.modelId, motivo, en: Date.now() });
    console.warn(`[ia] ${tarea}: ${primario.modelId} falló (${motivo}); se repite con ${secundario.modelId}.`);
    return true;
  };
  return wrapLanguageModel({
    model: primario,
    middleware: {
      specificationVersion: "v4",
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          return await doGenerate();
        } catch (e) {
          if (!caer(e)) throw e;
          return secundario.doGenerate(params);
        }
      },
      wrapStream: async ({ doStream, params }) => {
        try {
          return await doStream();
        } catch (e) {
          if (!caer(e)) throw e;
          return secundario.doStream(params);
        }
      },
    },
  });
}

/** La ruta EFECTIVA de una tarea: qué proveedor y modelo la atienden de verdad. */
export interface RutaTarea {
  tarea: Tarea;
  /** proveedor que la atiende con las claves disponibles */
  proveedor: Proveedor;
  /** modelo que la atiende de verdad (el fallback de google si degradó) */
  modelo: string;
  /** true si la tarea no la atiende el proveedor principal (Anthropic): sin su clave o por una caída reciente */
  degradado: boolean;
  /** solo si degradó por una caída en ejecución: el motivo real */
  motivo?: string;
}

/**
 * Resuelve QUIÉN atiende una tarea. Es la verdad que el panel de salud enseña.
 *   · `anthropicDisponible` — hay clave de Anthropic (BYOK o servidor). Si se omite,
 *     se mira ANTHROPIC_API_KEY del servidor.
 *   · `groqDisponible` — hay 2ª clave (solo cuenta en clasificación y sin Anthropic).
 *   · `claveAnthropic` — la clave concreta, para mirar SUS caídas (por defecto, la del servidor).
 * Con Anthropic disponible pero una caída reciente (`TTL_CAIDA_MS`), la tarea se
 * marca degradada a Gemini con el motivo: es lo que ha pasado de verdad.
 */
export function rutaDe(
  tarea: Tarea,
  opts: { groqDisponible?: boolean; anthropicDisponible?: boolean; claveAnthropic?: string } = {},
): RutaTarea {
  const def = REGISTRO[tarea];
  const anthropic = opts.anthropicDisponible ?? !!claveAnthropic();
  if (anthropic) {
    const caida = caidaReciente(tarea, opts.claveAnthropic);
    if (caida) return { tarea, proveedor: "google", modelo: def.modeloFallback, degradado: true, motivo: caida.motivo };
    return { tarea, proveedor: "anthropic", modelo: def.modelo, degradado: false };
  }
  if (def.modeloBarato && opts.groqDisponible) {
    return { tarea, proveedor: "groq", modelo: def.modeloBarato, degradado: true };
  }
  return { tarea, proveedor: "google", modelo: def.modeloFallback, degradado: true };
}

const gemini = (modelo: string, apiKey: string) => createGoogleGenerativeAI({ apiKey })(modelo);
const claude = (modelo: string, apiKey: string) => createAnthropic({ apiKey })(modelo);
const groq = (modelo: string, apiKey: string) =>
  createOpenAICompatible({ name: "groq", baseURL: GROQ_BASE_URL, apiKey })(modelo);

/**
 * El modelo instanciado para una tarea. ÚNICO punto de ramificación por proveedor.
 *
 *   · `apiKey`  — la clave de Gemini (BYOK del usuario; si falta, la del servidor).
 *   · `apiKey2` — la 2ª clave BYOK (Groq): solo clasificación, solo sin Anthropic.
 *   · `elegido` — el modelo que el usuario eligió en Ajustes (ya probado de verdad).
 *     Solo sombrea a las TAREAS_ELEGIBLES. Un Gemini elegido va directo a Gemini.
 *   · `apiKey3` — la 3ª clave BYOK (Anthropic). Si falta, ANTHROPIC_API_KEY del servidor.
 *
 * Con Claude y con Gemini disponibles, devuelve Claude ENVUELTO en `conFallback`:
 * si Claude cae, la misma llamada se repite con Gemini. Sin ninguna clave, lanza.
 */
export function modeloPara(
  tarea: Tarea,
  apiKey?: string,
  apiKey2?: string,
  elegido?: string | null,
  apiKey3?: string,
) {
  const def = REGISTRO[tarea];
  const kG = apiKey || claveGemini();
  const kA = apiKey3 || claveAnthropic();
  const e = eleccionDe(tarea, elegido);

  // El usuario eligió un Gemini a propósito: se respeta, sin pasar por Claude.
  if (e && proveedorDeModelo(e) === "google") {
    if (!kG) throw new Error("Falta clave de IA: el modelo elegido es de Gemini y no hay GEMINI_API_KEY");
    return gemini(e, kG);
  }

  const secundario = kG ? gemini(def.modeloFallback, kG) : null;

  if (kA) {
    const primario = claude(e ?? def.modelo, kA);
    return secundario ? conFallback(tarea, kA, primario, secundario) : primario;
  }
  // Sin Anthropic: la clasificación puede ir a Groq (2ª clave), opcional.
  if (def.modeloBarato && apiKey2) return groq(def.modeloBarato, apiKey2);
  if (secundario) return secundario;
  throw new Error("Falta clave de IA: ni ANTHROPIC_API_KEY ni GEMINI_API_KEY (ni BYOK)");
}

/* ══════════════════════════════════════════════════════════════════════════
   PING DE SALUD COMPARTIDO — el panel no paga dos veces.

   /api/health/ai y /api/health/status comparten una caché muy corta: la primera
   ruta paga una llamada REAL, la segunda reutiliza ese resultado durante
   `TTL_PING_MS` y dice cuántos ms hace (`edadMs`). Nada se finge. La caché se
   indexa por proveedor + huella de clave + modelo. Cada ping llama a SU proveedor
   directamente, SIN fallback: un ping que cae a otro proveedor no prueba nada.
   ══════════════════════════════════════════════════════════════════════════ */

/** Ventana de reutilización. Corta a propósito: es un chequeo, no un dato. */
export const TTL_PING_MS = 60_000;

export interface ResultadoPing {
  ok: boolean;
  modelo: string;
  latenciaMs: number;
  /** lo que respondió el modelo (recortado). Prueba de que la llamada ocurrió. */
  muestra: string;
  /** motivo del fallo, si falló */
  error?: string;
  /** cuándo se hizo la llamada REAL (epoch ms) */
  medidoEn: number;
  /** ms transcurridos desde la llamada real. 0 = recién hecha, >0 = reutilizada. */
  edadMs: number;
  /** true si esta respuesta viene de la ventana compartida y no de una llamada nueva */
  reutilizado: boolean;
}

const cachePing = new Map<string, ResultadoPing>();
const PROMPT_PING = "Responde exactamente con la palabra: OK";

/** El núcleo compartido de los pings: mira la ventana y, si toca, llama UNA vez y cachea (éxito o fallo). */
async function ejecutarPing(
  cacheId: string,
  modelo: string,
  llamada: () => Promise<string>,
  forzar: boolean,
): Promise<ResultadoPing> {
  const previo = cachePing.get(cacheId);
  if (!forzar && previo) {
    const edadMs = Date.now() - previo.medidoEn;
    if (edadMs < TTL_PING_MS) return { ...previo, edadMs, reutilizado: true };
  }
  const t0 = Date.now();
  try {
    const text = await llamada();
    const r: ResultadoPing = {
      ok: true, modelo, latenciaMs: Date.now() - t0, muestra: text.trim().slice(0, 24),
      medidoEn: Date.now(), edadMs: 0, reutilizado: false,
    };
    cachePing.set(cacheId, r);
    return r;
  } catch (e) {
    const r: ResultadoPing = {
      ok: false, modelo, latenciaMs: Date.now() - t0, muestra: "",
      error: e instanceof Error ? e.message.slice(0, 200) : "error",
      medidoEn: Date.now(), edadMs: 0, reutilizado: false,
    };
    cachePing.set(cacheId, r);
    return r;
  }
}

/** El modelo de Gemini que el ping de Gemini prueba: el elegido si es Gemini, si no el secundario de la extracción. */
export function modeloGeminiDePing(elegido?: string | null): string {
  const e = eleccionDe("ping-salud", elegido);
  return e && proveedorDeModelo(e) === "google" ? e : REGISTRO["extraccion-estructurada"].modeloFallback;
}

/**
 * Comprueba de verdad que GEMINI (secundario) responde. `elegido`: si el usuario
 * eligió un Gemini para la extracción, se prueba ESE (el espejo).
 */
export async function pingProveedor(
  apiKey?: string,
  forzar = false,
  elegido?: string | null,
): Promise<ResultadoPing> {
  const key = apiKey || claveGemini();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  const modelo = modeloGeminiDePing(elegido);
  return ejecutarPing(
    `google:${huella(key)}:${modelo}`,
    modelo,
    async () => (await generateText({ model: gemini(modelo, key), prompt: PROMPT_PING, maxRetries: 0 })).text,
    forzar,
  );
}

/** Comprueba de verdad que GROQ (2ª clave) responde. Sin 2ª clave el panel no llega aquí. */
export async function pingProveedorBarato(apiKey2: string, forzar = false): Promise<ResultadoPing> {
  const modelo = MODELO_GROQ;
  return ejecutarPing(
    `groq:${huella(apiKey2)}`,
    modelo,
    async () => (await generateText({ model: groq(modelo, apiKey2), prompt: PROMPT_PING, maxRetries: 0 })).text,
    forzar,
  );
}

/**
 * Comprueba de verdad que ANTHROPIC (principal) responde. `apiKey`: la BYOK del
 * usuario o, si falta, ANTHROPIC_API_KEY del servidor. `modelo`: por defecto el del
 * ping (Haiku); con elección del usuario de un Claude, ese (el espejo).
 */
export async function pingProveedorAnthropic(
  apiKey?: string,
  forzar = false,
  modelo: string = REGISTRO["ping-salud"].modelo,
): Promise<ResultadoPing> {
  const key = apiKey || claveAnthropic();
  if (!key) throw new Error("Falta ANTHROPIC_API_KEY");
  return ejecutarPing(
    `anthropic:${huella(key)}:${modelo}`,
    modelo,
    async () => (await generateText({ model: claude(modelo, key), prompt: PROMPT_PING, maxRetries: 0 })).text,
    forzar,
  );
}

/** Solo para los tests: deja la ventana limpia entre casos. */
export function _resetPing(): void {
  cachePing.clear();
}
