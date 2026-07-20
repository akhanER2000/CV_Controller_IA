import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TELEMETRÍA DE INGESTA — el consumo, que es un hecho, deja de ser invisible.
 *
 * EL PROBLEMA: el AI SDK devuelve `usage` (inputTokens / outputTokens) en CADA
 * generateObject y generateText. En las 7 llamadas del repo, NINGUNA lo leía. No
 * había contador de nada: ni llamadas, ni tokens, ni caracteres. Se podía
 * multiplicar el gasto por cinco —y estaba multiplicado por cinco— sin que
 * apareciera en ninguna pantalla.
 *
 * LA TABLA: `ingestion_events` (0001_schema.sql:54-61) EXISTE desde el primer
 * día, tiene RLS «own rows» aplicada, y NADIE LA HA ESCRITO NUNCA. Es el sitio
 * natural: es literalmente la tabla de eventos de una ingesta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ★ EL ORDEN: por qué se acumula en memoria y se escribe AL FINAL.
 *
 * `source_id` es NOT NULL con FK a `ingestion_sources`, y la fuente se crea al
 * FINAL, en `persistSource` / `persistImport`. Había dos salidas:
 *   (a) crear la fuente ANTES y escribir eventos según ocurren, o
 *   (b) acumular en memoria y volcar cuando la fuente ya existe.
 * Se elige (b), por tres razones:
 *   1. La FK sigue siendo verdad siempre: un evento jamás apunta a una fuente
 *      que no existe, ni hay que inventar una fuente «provisional» que quede
 *      huérfana si la extracción falla.
 *   2. No toca el esquema. Ninguna migración, y `supabase/` está fuera de esta
 *      frontera.
 *   3. La telemetría es un SUBPRODUCTO: no puede tumbar una ingesta buena.
 *      Escribiéndola la última, eso es cierto por construcción.
 * Lo que se pierde: si el proceso muere a mitad, no hay telemetría. Tampoco hay
 * ingesta a la que atribuírsela, así que no se pierde información real.
 *
 * `message` está comentada en el esquema como CLAVE DE i18n, no texto. Se
 * respeta: las claves viven en `i18n/dict/importar.ts` (ES y EN), aquí solo van
 * códigos y números.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Regla de conversión declarada UNA vez y usada igual antes y después de medir.
 *  No es exacta (el tokenizador real no es público); es una REGLA, y su valor
 *  está en aplicarse idéntica a los dos lados de la comparación. */
export const CARACTERES_POR_TOKEN = 4;

/** Lo que el AI SDK devuelve en `usage`. Ambos campos pueden venir undefined. */
export interface UsoLlamada {
  inputTokens?: number;
  outputTokens?: number;
}

/** El acumulador de una ingesta completa. Se pasa de mano en mano y se suma. */
export interface ConsumoIA {
  /** llamadas REALES al modelo (las servidas por caché no cuentan aquí) */
  llamadas: number;
  /** suma de inputTokens reportados por el proveedor */
  tokensEntrada: number;
  /** suma de outputTokens reportados por el proveedor */
  tokensSalida: number;
  /** caracteres de prompt que se mandaron (lo medimos nosotros, siempre exacto) */
  caracteresPrompt: number;
  /** caracteres del documento leído (sin duplicar por ventanas ni por extractor) */
  caracteresDocumento: number;
  /** ★ llamadas en las que el proveedor NO devolvió usage. Si es >0, los tokens
   *  son un SUELO, no un total — y la UI tiene que decirlo con un «≥», no fingir
   *  exactitud. Un número sin fuente no se muestra en este producto. */
  llamadasSinUso: number;
  /** true si la extracción entera salió de la caché por hash (coste cero) */
  desdeCache: boolean;
}

export const consumoCero = (): ConsumoIA => ({
  llamadas: 0,
  tokensEntrada: 0,
  tokensSalida: 0,
  caracteresPrompt: 0,
  caracteresDocumento: 0,
  llamadasSinUso: 0,
  desdeCache: false,
});

/** Suma UNA llamada al acumulador, leyendo el `usage` del AI SDK. Muta a propósito:
 *  es un contador que viaja por un bucle, no un objeto de dominio. */
export function anotarLlamada(c: ConsumoIA, caracteresPrompt: number, uso?: UsoLlamada): void {
  c.llamadas += 1;
  c.caracteresPrompt += caracteresPrompt;
  const ent = uso?.inputTokens;
  const sal = uso?.outputTokens;
  if (typeof ent === "number" && Number.isFinite(ent)) c.tokensEntrada += ent;
  else c.llamadasSinUso += 1;
  if (typeof sal === "number" && Number.isFinite(sal)) c.tokensSalida += sal;
}

export const sumarConsumo = (a: ConsumoIA, b: ConsumoIA): ConsumoIA => ({
  llamadas: a.llamadas + b.llamadas,
  tokensEntrada: a.tokensEntrada + b.tokensEntrada,
  tokensSalida: a.tokensSalida + b.tokensSalida,
  caracteresPrompt: a.caracteresPrompt + b.caracteresPrompt,
  caracteresDocumento: a.caracteresDocumento + b.caracteresDocumento,
  llamadasSinUso: a.llamadasSinUso + b.llamadasSinUso,
  desdeCache: a.desdeCache && b.desdeCache,
});

/** Las secciones que la ingesta trató como CONTEXTO, con su nombre. Se guardan
 *  para que el usuario pueda verlas después, no solo en el instante del volcado. */
export interface SeccionContexto {
  titulo: string;
  caracteres: number;
}

/** Claves de i18n que van en `message`. Enum cerrado: la BD no guarda copy. */
export const EVENTO = {
  consumo: "ingesta.evento.consumo",
  contexto: "ingesta.evento.contexto",
} as const;

export interface RegistroIngesta {
  consumo: ConsumoIA;
  /** secciones no mandadas al modelo. Se registran SIEMPRE, aunque estén vacías. */
  contexto?: SeccionContexto[];
}

/**
 * Vuelca la telemetría acumulada en `ingestion_events`. Se llama DESPUÉS de que
 * la fuente exista (ver la nota del orden, arriba).
 *
 * Devuelve un aviso si no pudo escribir, y NUNCA lanza: una ingesta correcta no
 * puede fallar porque su contabilidad no se guardó. El aviso sube a la UI en vez
 * de desaparecer — que es la regla de la casa.
 */
export async function registrarIngesta(
  sb: SupabaseClient,
  userId: string,
  sourceId: string,
  reg: RegistroIngesta,
): Promise<string | null> {
  const filas: { source_id: string; user_id: string; message: string; payload: unknown }[] = [
    {
      source_id: sourceId,
      user_id: userId,
      message: EVENTO.consumo,
      payload: {
        llamadas: reg.consumo.llamadas,
        tokensEntrada: reg.consumo.tokensEntrada,
        tokensSalida: reg.consumo.tokensSalida,
        caracteresPrompt: reg.consumo.caracteresPrompt,
        caracteresDocumento: reg.consumo.caracteresDocumento,
        llamadasSinUso: reg.consumo.llamadasSinUso,
        desdeCache: reg.consumo.desdeCache,
      },
    },
  ];

  // El evento de contexto se escribe aunque la lista esté VACÍA: «cero secciones
  // tratadas como contexto» es un dato que el usuario puede querer comprobar, y
  // su ausencia sería indistinguible de «no se registró».
  if (reg.contexto) {
    filas.push({
      source_id: sourceId,
      user_id: userId,
      message: EVENTO.contexto,
      payload: {
        total: reg.contexto.length,
        caracteres: reg.contexto.reduce((n, s) => n + s.caracteres, 0),
        secciones: reg.contexto,
      },
    });
  }

  try {
    const { error } = await sb.from("ingestion_events").insert(filas);
    return error ? `No se pudo registrar el consumo de la ingesta: ${error.message}` : null;
  } catch (e) {
    return `No se pudo registrar el consumo de la ingesta: ${e instanceof Error ? e.message : "error"}`;
  }
}
