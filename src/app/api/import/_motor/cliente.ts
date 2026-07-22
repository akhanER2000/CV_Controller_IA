import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL CLIENTE DEL TRABAJO DE FONDO — por qué NO vale el de `supabase/server.ts`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `lib/supabase/server.ts` construye el cliente sobre `cookies()` de Next, que
 * es una API ATADA A LA PETICIÓN. El motor de ingesta corre dentro de `after()`,
 * o sea DESPUÉS de que la respuesta se haya ido: en ese punto el almacén de
 * cookies ya no se puede escribir (el `setAll` de ese fichero se lo traga en un
 * try/catch, que es correcto para su caso y silencioso para el nuestro). Si la
 * sesión necesitara refrescarse a mitad de un trabajo largo, el refresco se
 * perdería y las siguientes consultas empezarían a fallar por RLS — sin un error
 * claro, que es la peor forma de fallar.
 *
 * Aquí se construye un cliente PLANO con la anon key y el access token del
 * usuario puesto a mano en la cabecera. Consecuencias, todas buscadas:
 *
 *   · LA RLS SIGUE PUESTA. Es el token del usuario: `auth.uid()` es él, y las
 *     policies «own rows» de 0001 aplican igual que desde el navegador. NO se
 *     usa la service_role: un trabajo de fondo que salta la RLS es una puerta
 *     trasera esperando un bug de atribución.
 *   · NO refresca solos. Un access token de Supabase dura una hora por defecto;
 *     el presupuesto de una invocación en Vercel Hobby son 300 s. No hay margen
 *     de que caduque a mitad, y si el trabajo se reanuda más tarde, la petición
 *     de reanudar trae un token FRESCO.
 *   · No toca `lib/supabase/*`, que es de otra frontera.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function crearClienteDeTrabajo(accessToken: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
