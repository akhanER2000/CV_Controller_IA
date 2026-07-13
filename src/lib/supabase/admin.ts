import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con service_role. SOLO servidor (Route Handlers en runtime nodejs).
 * Salta RLS: úsalo únicamente para operaciones administrativas verificadas
 * (p. ej. borrar la propia cuenta del usuario autenticado). Nunca en el cliente.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_URL");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
