import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { duplicadosDelMaster } from "@/lib/db/duplicados";

export const runtime = "nodejs";

/**
 * Los posibles duplicados que YA están en el master del usuario (§A4).
 *   GET /api/master/duplicados → { clusters, itemsRepetidos }
 *
 * Se calcula AL VUELO en cada llamada, nunca se persiste: resolver un par muta el
 * master y una marca guardada quedaría rancia en ese mismo instante (decisión
 * cerrada, docs/spec/duplicados.md). Devuelve PREGUNTAS, no acciones tomadas: el
 * duplicado lo resuelve siempre el usuario en /api/master/resolver.
 *
 * `itemsRepetidos` es cuántos items sobrarían SI el usuario confirmara todo. Sale
 * de los clústeres reales; nunca es una promesa de borrado.
 */
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    const r = await duplicadosDelMaster(sb, user.id);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
