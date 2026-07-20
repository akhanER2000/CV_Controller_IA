import "server-only";
import { createHash } from "node:crypto";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REGISTRO ÚNICO DE MODELOS — una tarea, un modelo, un sitio.
 *
 * EL PROBLEMA: el literal "gemini-flash-latest" estaba COPIADO en cinco ficheros
 * (llm.ts, variants/route.ts, ajustar/route.ts, health/ai/route.ts,
 * health/status/route.ts) más ingest.ts. Cambiar de modelo —o cambiar de modelo
 * SOLO para una tarea, que es lo que se quiere cuando algo sale caro— obligaba a
 * encontrar los seis. Y el panel de salud podía acabar reportando un modelo
 * distinto del que la extracción usa de verdad: un chequeo que miente.
 *
 * LA FORMA: un mapa TAREA → modelo. Las tareas son las que el código ya hace hoy,
 * identificadas una a una; no hay tareas inventadas «por si acaso».
 *
 * ★ Esto NO añade un segundo proveedor (eso es el bloque H). Solo deja la
 *   estructura preparada: `Definicion` lleva `proveedor`, y `modeloPara` es el
 *   único punto donde habría que ramificar. Hoy solo existe "google".
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Las tareas REALES del repo, cada una con el sitio que la ejecuta. */
export type Tarea =
  /** Transcripción verbatim de imagen / PDF escaneado (llm.ts · visión). */
  | "transcripcion-vision"
  /** Extracción estructurada con evidencia: los cinco schemas (llm.ts). */
  | "extraccion-estructurada"
  /** Redacción que NO puede inventar hechos: variantes y «Ajustar» (§preservesFacts). */
  | "redaccion-preserva-hechos"
  /** Clasificación barata / decisiones de una palabra. */
  | "clasificacion-barata"
  /** Ping de salud: ¿responde el proveedor? (health/ai · health/status). */
  | "ping-salud";

export interface Definicion {
  /** Hoy solo "google". El campo existe para que el bloque H no tenga que refactorizar. */
  proveedor: "google";
  modelo: string;
  /** Por qué ESTE modelo para ESTA tarea. Sin esto el registro es una tabla muda. */
  motivo: string;
}

/**
 * El único sitio del repo donde se nombra un modelo.
 *
 * Todas apuntan hoy a `gemini-flash-latest` por una razón concreta y verificada:
 * la clave del usuario NO habilita 2.5/2.0-flash (está en la memoria del
 * proyecto). Que hoy coincidan no las hace la misma entrada: separadas, mover
 * solo la extracción a un modelo más barato es cambiar UNA línea.
 */
export const REGISTRO: Readonly<Record<Tarea, Definicion>> = {
  "transcripcion-vision": {
    proveedor: "google",
    modelo: "gemini-flash-latest",
    motivo: "258 tok/página y no cobra el texto nativo ya extraído; es la tarea que más páginas mueve.",
  },
  "extraccion-estructurada": {
    proveedor: "google",
    modelo: "gemini-flash-latest",
    motivo: "structured outputs con los cinco schemas troceados (límite de 24 opcionales).",
  },
  "redaccion-preserva-hechos": {
    proveedor: "google",
    modelo: "gemini-flash-latest",
    motivo: "redacta variantes sin inventar cifras; la verificación de evidencia corre después igual.",
  },
  "clasificacion-barata": {
    proveedor: "google",
    modelo: "gemini-flash-latest",
    motivo: "decisiones de una palabra. Antes de usarla: ¿de verdad no se resuelve en código?",
  },
  "ping-salud": {
    proveedor: "google",
    modelo: "gemini-flash-latest",
    motivo: "tiene que ser el MISMO modelo que la extracción, o el chequeo no prueba nada útil.",
  },
};

/** El nombre del modelo de una tarea. Para reportarlo en salud sin llamar a nada. */
export const modeloDe = (tarea: Tarea): string => REGISTRO[tarea].modelo;

/**
 * La clave EFECTIVA: la BYOK del usuario (ya descifrada) o la del servidor.
 * Se acepta cualquiera de las dos variables de entorno; el provider de Google
 * solo mira GOOGLE_GENERATIVE_AI_API_KEY por su cuenta, así que se pasa explícita.
 */
export function claveGemini(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/** El NOMBRE de la variable que se está usando de verdad (para el panel de salud). */
export function nombreVarClave(): string | null {
  if (process.env.GEMINI_API_KEY) return "GEMINI_API_KEY";
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "GOOGLE_GENERATIVE_AI_API_KEY";
  return null;
}

/** El modelo instanciado para una tarea, con la clave efectiva. */
export function modeloPara(tarea: Tarea, apiKey?: string) {
  const def = REGISTRO[tarea];
  const key = apiKey || claveGemini();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  // Único punto de ramificación cuando entre un segundo proveedor (bloque H).
  return createGoogleGenerativeAI({ apiKey: key })(def.modelo);
}

/* ══════════════════════════════════════════════════════════════════════════
   PING DE SALUD COMPARTIDO — el panel dejaba de pagar dos veces.

   /api/health/ai y /api/health/status hacían CADA UNO su propia llamada real
   con el mismo prompt trivial. Abrir el panel de salud una vez costaba DOS
   llamadas facturadas, y el número crece con cada refresco.

   La solución NO es un check optimista (un ✓ que no llama a nada es peor que no
   tener check: miente justo cuando importa). Es una caché muy corta: la primera
   ruta paga una llamada REAL, la segunda reutiliza ese resultado durante
   `TTL_PING_MS`. Dentro de esa ventana el estado del proveedor no ha cambiado, y
   el resultado que se muestra sigue siendo el de una llamada que ocurrió de
   verdad — se dice cuántos ms hace (`edadMs`), así que el usuario ve si es
   fresco o reciclado. Nada se finge.
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

/** La clave NUNCA se guarda: se indexa por su huella, que no permite recuperarla. */
const huella = (k: string) => createHash("sha256").update(k).digest("hex").slice(0, 16);

const cachePing = new Map<string, ResultadoPing>();

/**
 * Comprueba de verdad que el proveedor responde. Compartido por las dos rutas de
 * salud. `forzar: true` salta la ventana y llama sí o sí.
 */
export async function pingProveedor(apiKey?: string, forzar = false): Promise<ResultadoPing> {
  const key = apiKey || claveGemini();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  const id = huella(key);

  const previo = cachePing.get(id);
  if (!forzar && previo) {
    const edadMs = Date.now() - previo.medidoEn;
    if (edadMs < TTL_PING_MS) return { ...previo, edadMs, reutilizado: true };
  }

  const modelo = modeloDe("ping-salud");
  const t0 = Date.now();
  try {
    const { text } = await generateText({
      model: modeloPara("ping-salud", key),
      prompt: "Responde exactamente con la palabra: OK",
    });
    const r: ResultadoPing = {
      ok: true, modelo, latenciaMs: Date.now() - t0, muestra: text.trim().slice(0, 24),
      medidoEn: Date.now(), edadMs: 0, reutilizado: false,
    };
    cachePing.set(id, r);
    return r;
  } catch (e) {
    const r: ResultadoPing = {
      ok: false, modelo, latenciaMs: Date.now() - t0, muestra: "",
      error: e instanceof Error ? e.message.slice(0, 200) : "error",
      medidoEn: Date.now(), edadMs: 0, reutilizado: false,
    };
    // Un FALLO también se cachea, y por el mismo motivo: si el proveedor está
    // caído, las dos rutas del panel no deben insistir en pagar el timeout.
    cachePing.set(id, r);
    return r;
  }
}

/** Solo para los tests: deja la ventana limpia entre casos. */
export function _resetPing(): void {
  cachePing.clear();
}
