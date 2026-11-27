import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guardarPlantillaUsuario, listarPlantillasUsuario } from "@/lib/cv/plantillas-usuario";

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

/**
 * POST /api/plantillas { desde:"u:<uuid>", nombre? } → DUPLICA una plantilla propia:
 * la misma espec (base, métricas y modos de densidad) con otro id y otro nombre, para
 * poder afinar una copia sin tocar la que usan otras variantes. Solo las del propio
 * usuario: la de origen se busca entre las suyas (RLS + filtro por user_id).
 * Responde { plantilla } (201).
 */
export async function POST(req: Request) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  let body: { desde?: string; nombre?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const origen = (await listarPlantillasUsuario(sb, user.id)).find((p) => p.id === body.desde);
  if (!origen) return NextResponse.json({ error: "Esa plantilla no existe." }, { status: 404 });
  try {
    const plantilla = await guardarPlantillaUsuario(sb, user.id, origen.params, String(body.nombre ?? "").trim() || `${origen.nombre} (copia)`);
    return NextResponse.json({ plantilla }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
