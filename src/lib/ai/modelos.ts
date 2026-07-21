import "server-only";
import { createHash } from "node:crypto";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

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
 * ★ BLOQUE H · SEGUNDO PROVEEDOR (router de dos niveles POR COSTE).
 *   Ya no es solo estructura preparada: entra un segundo proveedor compatible con
 *   OpenAI (Groq por defecto) que atiende SOLO las tareas baratas —clasificar y
 *   desempatar duplicados—. `modeloPara` es el ÚNICO punto de ramificación.
 *
 *   ⚠ Esto NO apila modelos para «más fiabilidad»: apilar solo añade modos de
 *     fallo. Es un router POR COSTE, para abaratar lo barato. La fiabilidad sigue
 *     viniendo de la verificación DETERMINISTA (evidencia literal, preservesFacts,
 *     round-trip ATS), no de tener dos modelos. Por eso un modelo barato solo entra
 *     al router si soporta SALIDA ESTRUCTURADA (llama-3.3-70b-versatile la soporta):
 *     si no la soportara, no podría atender una tarea con schema y quedaría fuera.
 *
 *   ⚠ DEGRADAR CON HONESTIDAD: sin 2ª clave configurada, la tarea barata CAE al
 *     proveedor por defecto (Gemini) — no rompe, no calla. `rutaDe` lo dice con el
 *     flag `degradado` para que el panel de salud no mienta sobre quién atiende qué.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Los proveedores del router. "google" = Gemini (por defecto); el barato es Groq. */
export type Proveedor = "google" | "groq";

/** El proveedor BARATO del router de dos niveles. Un solo sitio lo nombra. */
export const PROVEEDOR_BARATO: Proveedor = "groq";

/** Base URL OpenAI-compatible de Groq. El SDK de @ai-sdk/openai-compatible la usa. */
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
  /** El proveedor PREFERENTE de la tarea. "groq" solo en las tareas baratas. */
  proveedor: Proveedor;
  /** El modelo del proveedor preferente. */
  modelo: string;
  /**
   * SOLO en tareas cuyo `proveedor` NO es "google": el modelo de Gemini al que la
   * tarea CAE cuando no hay 2ª clave configurada. Sin este campo, degradar dejaría
   * a `modeloPara` sin un modelo de google válido que instanciar.
   */
  modeloFallback?: string;
  /** Por qué ESTE modelo para ESTA tarea. Sin esto el registro es una tabla muda. */
  motivo: string;
}

/**
 * El único sitio del repo donde se nombra un modelo.
 *
 * ★ NUNCA UN ALIAS FLOTANTE (`-latest`) EN PRODUCCIÓN. `gemini-flash-latest`
 *   resuelve a «lo que Google promocione como Flash más reciente», y esa promoción
 *   la decide GOOGLE, no nosotros: el consumo real de la cuenta se fue a Gemini 3.5
 *   Flash —el escalón más caro— sin que nadie lo eligiera, solo porque el alias fue
 *   detrás de la promoción. Un alias flotante es dejar que tu proveedor te elija la
 *   factura, y la próxima promoción te la vuelve a cambiar sin que toques una línea.
 *   Un ID versionado, en cambio, solo cambia cuando lo cambiamos aquí. `tests/
 *   modelos-registro.test.ts` falla si reaparece un `-latest`.
 *
 * ⚠⚠ EL LISTADO DE MODELOS MIENTE. ESTE ES EL HECHO QUE MANDA AQUÍ.
 *   `GET /v1beta/models` devolvió 20 modelos con `generateContent` para la clave del
 *   usuario. Al hacerles un ping REAL, solo 11 respondieron: `gemini-2.5-flash`,
 *   `2.5-pro`, `2.5-flash-lite`, `2.0-flash`, `2.0-flash-lite` y `3-pro-preview` dan
 *   404 «no longer available to new users». Listado ≠ utilizable.
 *   Por eso el selector de modelos NO puede poblarse solo con el listado: hay que
 *   PROBAR cada uno. Es el mismo principio que el resto del producto — el chequeo
 *   llama de verdad, nunca un ✓ optimista.
 *
 * ⚠ Y ANTES DE ESO YO ME EQUIVOQUÉ, que conviene dejarlo escrito: fijé
 *   `gemini-2.5-flash` afirmando que el comentario original («la clave NO habilita
 *   2.5/2.0-flash») estaba obsoleto. No lo estaba. Leí una leyenda de familias de
 *   modelos como si fuera la lista de lo que la clave puede llamar, y contradije un
 *   comentario que tenía razón. Resultado: la app entera con un modelo inexistente y
 *   el panel de salud en rojo. La regla que lo evita ya estaba escrita —«comprueba
 *   cuáles acepta de verdad la clave, no adivines el string»— y no la seguí.
 *
 * ★ ELECCIÓN ACTUAL: `gemini-3.6-flash` en todo lo de Gemini, y no por intuición.
 *   A/B MEDIDO sobre el dossier real (mismos prompts de producción, solo cambia el
 *   modelo), con el CANARIO: la extracción pide copiar el `evidence_snippet` LITERAL
 *   y el servidor comprueba `normalize(raw).includes(normalize(evidence))`.
 *
 *     gemini-3.6-flash        46 items · 87 % verificado ·  6 parciales   ← elegido
 *     gemini-3.5-flash        35 items · 86 % verificado ·  5 parciales
 *     gemini-3.5-flash-lite   40 items · 30 % verificado · 28 parciales   ✗
 *     gemini-3.1-flash-lite   35 items · 35 % verificado · 22 parciales   ✗
 *
 *   ★ LOS LITE NO SIRVEN PARA ESTO, y el porqué importa más que el número: un modelo
 *   débil NO falla inventando, falla PARAFRASEANDO. Resume la cita con sus palabras,
 *   el includes() da false, y la evidencia se cae del 87 % al 30 %. Mírense los
 *   parciales: 28 y 22 contra 5 y 6. La hipótesis de que «extraer contra un schema es
 *   reconocimiento de patrones y aguanta un Lite» era MÍA y el canario la desmintió.
 *   Bajar la extracción a Lite habría ahorrado tokens destruyendo lo único que hace
 *   confiable este producto.
 *
 *   Reproducir: `tests/manual/ab-modelos.ts` (fuera de CI; gasta tokens reales).
 */
export const REGISTRO: Readonly<Record<Tarea, Definicion>> = {
  "transcripcion-vision": {
    proveedor: "google",
    modelo: "gemini-3.6-flash",
    motivo:
      "de su fidelidad LITERAL depende el detector de alucinación; se queda en un flash pleno " +
      "(no lite) hasta medir la transcripción aparte. Bajarla ciega se lleva el candado de evidencia.",
  },
  "extraccion-estructurada": {
    proveedor: "google",
    modelo: "gemini-3.6-flash",
    motivo:
      "structured outputs con los cinco schemas troceados (límite de 24 opcionales). Es el 80% de " +
      "los tokens, así que era LA candidata a bajar a un Lite — y el A/B lo desmintió: 87% de " +
      "evidencia verificada aquí contra 30% en 3.5-flash-lite, que parafrasea en vez de citar.",
  },
  "redaccion-preserva-hechos": {
    proveedor: "google",
    modelo: "gemini-3.6-flash",
    motivo:
      "aquí se juega la promesa del producto: NO se baja a lite. preservesFacts corre después e " +
      "impide la invención igual, pero un modelo débil redacta peor. Es el sitio donde pagar bien vale.",
  },
  "clasificacion-barata": {
    proveedor: "groq",
    modelo: "llama-3.3-70b-versatile",
    modeloFallback: "gemini-3.6-flash",
    motivo:
      "decisiones de una palabra y desempate de duplicados: barato y con salida estructurada. " +
      "Sin 2ª clave cae a Gemini 2.5-flash (degrada, no rompe).",
  },
  "ping-salud": {
    proveedor: "google",
    modelo: "gemini-3.6-flash",
    motivo: "espeja a extraccion-estructurada: si el chequeo usa OTRO modelo, no prueba nada útil.",
  },
};

/** El nombre del modelo PREFERENTE de una tarea. Para reportarlo sin llamar a nada. */
export const modeloDe = (tarea: Tarea): string => REGISTRO[tarea].modelo;

/**
 * La clave EFECTIVA de Gemini: la BYOK del usuario (ya descifrada) o la del servidor.
 * Se acepta cualquiera de las dos variables de entorno; el provider de Google solo
 * mira GOOGLE_GENERATIVE_AI_API_KEY por su cuenta, así que se pasa explícita.
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

/** La ruta EFECTIVA de una tarea: qué proveedor y modelo la atienden de verdad. */
export interface RutaTarea {
  tarea: Tarea;
  /** proveedor que la atiende con las claves disponibles */
  proveedor: Proveedor;
  /** modelo que la atiende de verdad (el fallback de google si degradó) */
  modelo: string;
  /** true si la tarea PREFERÍA el barato pero cayó a Gemini por falta de 2ª clave */
  degradado: boolean;
}

/**
 * Resuelve QUIÉN atiende una tarea según haya o no 2ª clave (Groq). Es la verdad
 * que el panel de salud enseña: sin 2ª clave, la tarea barata CAE a Gemini y se
 * marca `degradado` para no fingir que Groq atiende algo que no atiende.
 */
export function rutaDe(tarea: Tarea, opts: { groqDisponible: boolean }): RutaTarea {
  const def = REGISTRO[tarea];
  if (def.proveedor === PROVEEDOR_BARATO && !opts.groqDisponible) {
    // Degrada al modelo de Gemini declarado como fallback (o al preferente si, por
    // un error de registro, faltara: nunca se deja a `modeloPara` sin modelo).
    return { tarea, proveedor: "google", modelo: def.modeloFallback ?? def.modelo, degradado: true };
  }
  return { tarea, proveedor: def.proveedor, modelo: def.modelo, degradado: false };
}

/** Instancia el modelo BARATO (Groq) con la 2ª clave del usuario. */
function modeloBarato(modelo: string, apiKey2: string) {
  const groq = createOpenAICompatible({ name: "groq", baseURL: GROQ_BASE_URL, apiKey: apiKey2 });
  return groq(modelo);
}

/**
 * El modelo instanciado para una tarea. ÚNICO punto de ramificación por proveedor.
 *
 *   · `apiKey`  — la clave de Gemini (BYOK del usuario o del servidor).
 *   · `apiKey2` — la 2ª clave BYOK (Groq). Si la tarea es del proveedor barato Y
 *     hay 2ª clave → se instancia Groq. Si no, CAE a Gemini con su modelo fallback.
 *
 * Los llamadores existentes (extracción, visión, redacción, ping) pasan solo
 * `apiKey`: son tareas de Gemini y siguen yendo a Gemini sin cambio alguno.
 */
export function modeloPara(tarea: Tarea, apiKey?: string, apiKey2?: string) {
  const def = REGISTRO[tarea];

  // Tarea barata + 2ª clave presente ⇒ proveedor barato (Groq).
  if (def.proveedor === PROVEEDOR_BARATO && apiKey2) {
    return modeloBarato(def.modelo, apiKey2);
  }

  // Todo lo demás va a Gemini: las tareas de google, y las baratas SIN 2ª clave
  // (degradan al modelo fallback declarado en el registro). Degrada, no rompe.
  const key = apiKey || claveGemini();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  const modelo = def.proveedor === "google" ? def.modelo : (def.modeloFallback ?? def.modelo);
  return createGoogleGenerativeAI({ apiKey: key })(modelo);
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

   ★ Bloque H: la MISMA maquinaria sirve para el 2º proveedor (Groq). La caché se
     indexa por proveedor+huella de clave, así un proveedor no pisa al otro.
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
 * El núcleo compartido de los dos pings (Gemini y Groq): mira la ventana, y si
 * toca llamar, ejecuta `llamada` UNA vez y cachea el resultado (éxito O fallo: un
 * proveedor caído no debe hacer que las dos rutas insistan en pagar el timeout).
 */
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

/**
 * Comprueba de verdad que GEMINI responde. Compartido por las dos rutas de salud.
 * `forzar: true` salta la ventana y llama sí o sí.
 */
export async function pingProveedor(apiKey?: string, forzar = false): Promise<ResultadoPing> {
  const key = apiKey || claveGemini();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  const modelo = modeloDe("ping-salud");
  return ejecutarPing(
    `google:${huella(key)}`,
    modelo,
    async () => {
      const { text } = await generateText({
        model: modeloPara("ping-salud", key),
        prompt: "Responde exactamente con la palabra: OK",
      });
      return text;
    },
    forzar,
  );
}

/**
 * Comprueba de verdad que el 2º PROVEEDOR (Groq) responde. Reutiliza la misma
 * ventana compartida. Solo tiene sentido con 2ª clave: el llamador ya la exige, y
 * si no la hay el panel dice «no configurado» SIN llegar aquí.
 */
export async function pingProveedorBarato(apiKey2: string, forzar = false): Promise<ResultadoPing> {
  const modelo = REGISTRO["clasificacion-barata"].modelo; // el modelo Groq del registro
  return ejecutarPing(
    `groq:${huella(apiKey2)}`,
    modelo,
    async () => {
      const { text } = await generateText({
        // La tarea barata + 2ª clave ⇒ modeloPara devuelve el modelo de Groq.
        model: modeloPara("clasificacion-barata", undefined, apiKey2),
        prompt: "Responde exactamente con la palabra: OK",
      });
      return text;
    },
    forzar,
  );
}

/** Solo para los tests: deja la ventana limpia entre casos. */
export function _resetPing(): void {
  cachePing.clear();
}
