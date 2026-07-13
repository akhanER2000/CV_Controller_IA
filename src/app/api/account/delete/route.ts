import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Borra la cuenta del usuario AUTENTICADO (y en cascada su user_state).
 * Verifica la sesión con el cliente de servidor (cookies) y solo entonces usa
 * el service_role para borrar ese mismo usuario. Nunca borra a otro.
 */
export async function POST() {
  const supa = await createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return new Response("No autenticado", { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return new Response(error.message, { status: 500 });

  return new Response(null, { status: 204 });
}
