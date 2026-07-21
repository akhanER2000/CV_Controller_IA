import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { idModeloValido, probarModelo, type OpcionesCatalogo } from "@/lib/ai/catalogo";
import { modeloEfectivo } from "@/lib/ai/modelos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PREFERENCIAS DE MODELO — dónde vive «el modelo que YO elegí».
 *
 * Sitio: `user_settings.llm_model`. Es la tabla natural (ya guarda idioma, tema,
 * el interruptor de IA y las dos claves BYOK) y viene con RLS por auth.uid().
 *
 * ⚠ SU VOCABULARIO ES CERRADO: la columna `llm_model` NO existe hasta que se
 *   aplique el SQL de `SQL_COLUMNA_MODELO` a mano en Supabase. Por eso aquí se
 *   repite —a conciencia— el patrón de la 2ª clave BYOK (byok.ts §H):
 *
 *     · la consulta va SIEMPRE SOLA, nunca junto a los demás ajustes. Si la
 *       columna falta, PostgREST devuelve error y ese error tumbaría la lectura de
 *       TODOS los ajustes si compartieran el `select`.
 *     · el error NO se traga: se distingue «no hay elección» de «no hay columna»
 *       (`columnaAusente`) para poder DECIRLO en pantalla.
 *     · sin columna, se degrada al modelo del registro. La app no se rompe, y no
 *       finge que guardó algo que no guardó.
 *
 * ⚠ Y NO se guarda un modelo que no se haya probado: la validación de que el id
 *   RESPONDE de verdad la hace la ruta antes de llamar aquí (ver
 *   app/api/ai/modelos/route.ts). Aquí solo se valida la FORMA del id, que es lo
 *   que protege a la base de datos de un valor arbitrario.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** El SQL exacto que falta por aplicar. Se enseña tal cual cuando la columna no está. */
export const SQL_COLUMNA_MODELO =
  "alter table user_settings add column if not exists llm_model text;";

export interface ModeloElegido {
  /** el id elegido por el usuario, o null si usa el del registro */
  modelo: string | null;
  /** la columna llm_model no existe todavía (migración sin aplicar) */
  columnaAusente: boolean;
  /** el motivo REAL si falló por otra cosa (RLS, red…): no se confunde con «sin columna» */
  error?: string;
}

/**
 * ¿El error de PostgREST es «esa columna no existe» o es OTRA cosa? Confundirlos
 * haría que un fallo de RLS se mostrara como «aplica la migración», que es un
 * diagnóstico falso — y mandar al usuario a ejecutar SQL que no arregla nada es
 * peor que decirle «no sé». Se mira el código PGRST204 (columna desconocida) y,
 * como red de seguridad, que el mensaje nombre la columna.
 */
function esColumnaAusente(err: { code?: string; message?: string }): boolean {
  if (err.code === "PGRST204" || err.code === "42703") return true;
  return /llm_model/i.test(err.message ?? "") && /column|columna|schema cache/i.test(err.message ?? "");
}

/** Lee la elección del usuario. Nunca lanza: sin columna ⇒ «sin elección», y se dice. */
export async function leerModeloElegido(sb: SupabaseClient, userId: string): Promise<ModeloElegido> {
  const { data, error } = await sb
    .from("user_settings")
    .select("llm_model")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    const falta = esColumnaAusente(error);
    return { modelo: null, columnaAusente: falta, error: falta ? undefined : error.message };
  }

  const v = (data as { llm_model?: string | null } | null)?.llm_model ?? null;
  // Un valor con forma rara en la base (migración a mano, edición manual) NO se
  // devuelve como si fuera bueno: se ignora y se cae al registro.
  return { modelo: idModeloValido(v) ? v : null, columnaAusente: false };
}

export interface ResultadoGuardar {
  /** true solo si la fila quedó escrita de verdad */
  guardado: boolean;
  /** la columna no existe: no se guardó nada y hay que aplicar SQL_COLUMNA_MODELO */
  columnaAusente: boolean;
  /** lo que quedó vigente tras el intento (null = el del registro) */
  modelo: string | null;
  /** el motivo REAL de un fallo que NO es «falta la columna» */
  error?: string;
}

/**
 * Guarda (o limpia con `null`) la elección. Escritura AISLADA, por lo mismo que la
 * lectura: si la columna no existe, este upsert falla y no debe arrastrar a nadie.
 */
export async function guardarModeloElegido(
  sb: SupabaseClient,
  userId: string,
  modelo: string | null,
): Promise<ResultadoGuardar> {
  if (modelo !== null && !idModeloValido(modelo)) {
    // Nunca llega aquí desde la ruta (valida antes), pero un módulo no confía en
    // que su llamador validara: el que escribe en la base es este.
    return { guardado: false, columnaAusente: false, modelo: null };
  }
  const { error } = await sb
    .from("user_settings")
    .upsert({ user_id: userId, llm_model: modelo }, { onConflict: "user_id" });
  if (error) {
    const falta = esColumnaAusente(error);
    return { guardado: false, columnaAusente: falta, modelo: null, error: falta ? undefined : error.message };
  }
  return { guardado: true, columnaAusente: false, modelo };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ★ ELEGIR UN MODELO — validar, PROBAR y solo entonces guardar.
 *
 * Vive aquí y no en la ruta a propósito: en cuanto algo hay que importarlo desde
 * otro sitio (un test, otra ruta), ya no pertenece a la frontera HTTP. La ruta se
 * queda con lo suyo —leer el cuerpo, poner el código de estado— y la DECISIÓN, que
 * es lo que hay que poder romper con un test, vive en src/lib.
 *
 * EL ORDEN IMPORTA Y ES EL PRODUCTO:
 *   1. forma del id      → barato, protege la URL del proveedor y la base de datos.
 *   2. LLAMADA REAL      → un id que no responde NO se guarda. Guardarlo sin probar
 *                          reproduce el fallo que este bloque arregla: el listado
 *                          ofrece un modelo muerto, se guarda, y la app se cae
 *                          DESPUÉS, lejos de aquí, en mitad de una extracción.
 *   3. escritura         → y si la columna no existe, se dice; no se finge.
 * ════════════════════════════════════════════════════════════════════════════
 */
export type MotivoRechazo = "id-invalido" | "sin-clave" | "no-responde";

export interface ResultadoEleccion {
  ok: boolean;
  /** por qué NO se guardó (código, no prosa: el texto es de i18n) */
  motivo?: MotivoRechazo;
  /** el motivo REAL del proveedor cuando el modelo no responde (404, 400, cuota…) */
  error?: string;
  guardado: boolean;
  columnaAusente: boolean;
  sqlPendiente?: string;
  /** lo elegido tras la operación (null = el del registro) */
  modelo: string | null;
  /** lo que atenderá la extracción de verdad */
  modeloEfectivo: string;
  /** …y lo que probará el chequeo de salud: tienen que ser el MISMO */
  espejoPingSalud: string;
}

export async function elegirModelo(
  sb: SupabaseClient,
  userId: string,
  crudo: unknown,
  apiKey: string | null,
  opts: OpcionesCatalogo = {},
): Promise<ResultadoEleccion> {
  const conModelo = (modelo: string | null, extra: Partial<ResultadoEleccion>): ResultadoEleccion => ({
    ok: false,
    guardado: false,
    columnaAusente: false,
    modelo,
    modeloEfectivo: modeloEfectivo("extraccion-estructurada", modelo),
    espejoPingSalud: modeloEfectivo("ping-salud", modelo),
    ...extra,
  });

  // null / "" ⇒ volver al del registro. Elección legítima, explícita y gratis.
  const quiereRegistro = crudo == null || (typeof crudo === "string" && crudo.trim() === "");
  const candidato = quiereRegistro ? null : typeof crudo === "string" ? crudo.trim() : null;

  if (!quiereRegistro && !idModeloValido(candidato)) {
    return conModelo(null, { motivo: "id-invalido" });
  }

  if (candidato) {
    if (!apiKey) return conModelo(null, { motivo: "sin-clave" });
    const prueba = await probarModelo(apiKey, candidato, opts);
    if (!prueba.responde) {
      return conModelo(null, { motivo: "no-responde", error: prueba.error });
    }
  }

  const res = await guardarModeloElegido(sb, userId, candidato);
  return conModelo(res.modelo, {
    ok: res.guardado,
    guardado: res.guardado,
    columnaAusente: res.columnaAusente,
    sqlPendiente: res.columnaAusente ? SQL_COLUMNA_MODELO : undefined,
    error: res.error,
  });
}
