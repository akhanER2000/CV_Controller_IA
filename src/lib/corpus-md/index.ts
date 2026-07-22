/**
 * corpus/1 — la vía DETERMINISTA de entrada y salida del master.
 *
 * Un formato `.md` que un humano escribe sin manual, que cualquier LLM produce
 * de forma fiable, y que se parsea SIN llamar a ningún modelo. No es la versión
 * pobre de la ingesta con IA: en integridad del dato es la superior, porque un
 * item escrito a mano tiene la procedencia más verificable que existe —lo
 * escribió el humano— y no hay nada que alucinar ni que verificar contra un
 * `raw_text`.
 *
 * Las dos vías no compiten, resuelven situaciones distintas: un archivo bien
 * formado se parsea perfecto y gratis; un volcado desordenado, un PDF escaneado
 * o una captura necesitan el modelo, cuestan dinero y hay que revisarlos. Un
 * parser determinista no puede imponer estructura sobre un texto que no la
 * tiene — eso es exactamente lo que se paga cuando se paga.
 *
 * ⚠ CERO IA. Ni un import de `ai`, `@ai-sdk/*`, `@/lib/extract/llm` o
 *   `@/lib/ai/modelos` en este módulo. No es una convención: hay un test que lee
 *   el fuente y falla si aparece alguno, porque «¿el parser llama a un modelo?»
 *   tiene que responderlo el build y no una persona.
 */

export {
  FORMATO_ID,
  type AvisoParseo,
  type ItemParseado,
  type ResultadoParseo,
  type ItemParaExportar,
  SECCIONES,
  CAMPOS_POR_KIND,
  CLAVE_CABECERA,
  CLAVES_DATA,
} from "./formato";

export { parsearCorpusMd, pareceCorpusMd } from "./parser";
export { exportarCorpusMd, plantillaVacia } from "./exportar";

/**
 * La segunda plantilla: la misma estructura RELLENA con un perfil inventado.
 * Vive en su propio módulo porque son datos, no gramática — y porque así el
 * test de paridad puede compararla item por item con lo que devuelve el parser.
 */
export { plantillaEjemplo, PERFIL_EJEMPLO } from "./ejemplo";
