import { createClient } from "@/lib/supabase/server";
import { obtenerMemoria } from "@/lib/ai/memoria";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Estado de la MEMORIA DEL PERFIL (DA-M2). Sin IA y sin coste: la memoria es una
 * serialización determinista del master.
 *
 *   GET  /api/health/memoria → el estado (reconstruye SOLO si el master cambió).
 *   POST /api/health/memoria → fuerza la reconstrucción («Reconstruir memoria»).
 *
 * Nunca devuelve el contenido: solo cuántos items, cuántos tokens y cuándo, más los
 * tokens de la última llamada de redacción (entrada, salida, cacheados).
 */
async function estado(forzar: boolean) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return Response.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    const m = await obtenerMemoria(sb, user.id, { forzar });
    return Response.json({
      items: m.items,
      tokensAprox: m.tokensAprox,
      huella: m.huella,
      actualizadaEn: m.actualizadaEn,
      reconstruida: m.reconstruida,
      persistida: m.persistida,
      ultimaLlamada: m.ultimaLlamada,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function GET() {
  return estado(false);
}

export async function POST() {
  return estado(true);
}
