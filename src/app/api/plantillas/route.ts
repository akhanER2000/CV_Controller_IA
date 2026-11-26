import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listarPlantillasUsuario } from "@/lib/cv/plantillas-usuario";

export const runtime = "nodejs";

/**
 * GET /api/plantillas → las plantillas a medida del usuario (0011), las más nuevas
 * primero: { plantillas: [{ id:"u:<uuid>", nombre, base, params, creada }] }.
 * Las crea el paso 3 de «Ajustar páginas» (accion:'guardar-medida'); la galería las
 * lista en «Personalizadas». Sin la 0011, lista vacía (no un error).
 */
export async function GET() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const plantillas = await listarPlantillasUsuario(sb, user.id);
  return NextResponse.json({ plantillas }, { headers: { "Cache-Control": "no-store" } });
}
