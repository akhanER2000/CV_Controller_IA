import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptionAvailable } from "@/lib/crypto";

/**
 * BYOK — "bring your own key". La clave LLM del usuario se guarda SIEMPRE cifrada
 * en user_settings.llm_api_key (la ruta de ajustes la cifra o la aparca; nunca en
 * texto plano). Aquí se DESCIFRA solo en el servidor para usarla en la extracción,
 * y nunca vuelve al cliente.
 *
 * Candado: si no hay CORPUS_ENCRYPTION_KEY, o el valor guardado no tiene el formato
 * cifrado conocido ("v1:…"), o el descifrado falla → devuelve null (se usa la clave
 * del servidor). NUNCA se trata un valor arbitrario como clave en claro: al proveedor
 * solo llega algo que salió de encryptSecret.
 */
export async function getUserLlmKey(sb: SupabaseClient, userId: string): Promise<string | null> {
  if (!encryptionAvailable()) return null; // sin cifrado no debería existir clave guardada
  const { data } = await sb
    .from("user_settings")
    .select("llm_api_key")
    .eq("user_id", userId)
    .maybeSingle();
  const blob = data?.llm_api_key as string | null | undefined;
  if (!blob || !blob.startsWith("v1:")) return null;
  try {
    const key = decryptSecret(blob).trim();
    return key || null;
  } catch {
    return null; // clave corrupta o master key distinta: cae a la del servidor
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SEGUNDA CLAVE BYOK (§H) — la del proveedor BARATO (Groq) del router por coste.
 *
 * Mismo candado que la primera, columna distinta (user_settings.llm_api_key_2,
 * migración 0006). Y una degradación MÁS: la columna puede NO existir todavía si la
 * migración no se ha aplicado a mano. Por eso el `select` de la 2ª clave va SIEMPRE
 * SOLO (su propia consulta) y se traga su error: si la columna falta, esto devuelve
 * «no hay 2ª clave» y el router entero cae a Gemini — degrada, no rompe. Meterla en
 * el mismo `select` que los demás ajustes tumbaría la lectura de TODOS ellos.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Estado de la 2ª clave, sin devolverla nunca. Lo usa el panel de salud y GET ajustes. */
export interface EstadoClave2 {
  /** hay un blob "v1:…" guardado en la columna */
  almacenada: boolean;
  /** guardada pero indescifrable (falta CORPUS_ENCRYPTION_KEY) */
  aparcada: boolean;
  /** la columna no existe: la migración 0006 no está aplicada */
  columnaAusente: boolean;
  /** la clave DESCIFRADA, solo en servidor, o null. NUNCA viaja al cliente. */
  clave: string | null;
}

/** Lee el estado de la 2ª clave con TODAS las degradaciones (columna, cifrado, blob). */
export async function estadoLlmKey2(sb: SupabaseClient, userId: string): Promise<EstadoClave2> {
  const vacio: EstadoClave2 = { almacenada: false, aparcada: false, columnaAusente: false, clave: null };
  // ⚠ Consulta AISLADA: si la columna no existe, PostgREST devuelve error y NO se
  //   contamina la lectura del resto de ajustes. Se distingue «sin columna» de
  //   «sin clave» para poder decirlo con honestidad en el panel.
  const { data, error } = await sb
    .from("user_settings")
    .select("llm_api_key_2")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ...vacio, columnaAusente: true };

  const blob = (data as { llm_api_key_2?: string | null } | null)?.llm_api_key_2 ?? null;
  if (!blob || !blob.startsWith("v1:")) return vacio;

  // Hay blob guardado. Si no se puede descifrar (sin master key), está APARCADA:
  // presente pero inservible, y el panel lo dice en vez de fingir que funciona.
  if (!encryptionAvailable()) return { almacenada: true, aparcada: true, columnaAusente: false, clave: null };
  try {
    const key = decryptSecret(blob).trim();
    return { almacenada: true, aparcada: false, columnaAusente: false, clave: key || null };
  } catch {
    // Blob corrupto o master key distinta: guardado, pero no se usa en claro jamás.
    return { almacenada: true, aparcada: true, columnaAusente: false, clave: null };
  }
}

/** La 2ª clave DESCIFRADA (Groq), o null si no hay / no se puede. Atajo de estadoLlmKey2. */
export async function getUserLlmKey2(sb: SupabaseClient, userId: string): Promise<string | null> {
  if (!encryptionAvailable()) return null; // sin cifrado no hay clave usable
  return (await estadoLlmKey2(sb, userId)).clave;
}
