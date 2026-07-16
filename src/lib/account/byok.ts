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
