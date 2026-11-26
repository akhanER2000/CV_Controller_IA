import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { eliminarPlantillaUsuario, renombrarPlantillaUsuario } from "@/lib/cv/plantillas-usuario";

export const runtime = "nodejs";

/**
 * PATCH  /api/plantillas/u:<uuid> { nombre } → renombra una plantilla a medida.
 * DELETE /api/plantillas/u:<uuid>            → la elimina. Las variantes que la usaban
 * no se rompen: un id "u:…" que ya no existe cae en la plantilla por defecto.
 * Solo las del propio usuario (RLS + filtro por user_id).
 */
async function sesion() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return { sb, user };
}
const fallo = (msg: string, status: number) => NextResponse.json({ error: msg }, { status });
const motivo = (e: unknown) => (e instanceof Error ? e.message : "Error");

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const { sb, user } = await sesion();
  if (!user) return fallo("Sesión requerida.", 401);
  let body: { nombre?: string } = {};
  try {
    body = await req.json();
  } catch {
    return fallo("cuerpo inválido", 400);
  }
  if (!String(body.nombre ?? "").trim()) return fallo("El nombre está vacío.", 400);
  try {
    const ok = await renombrarPlantillaUsuario(sb, user.id, id, String(body.nombre));
    return ok ? NextResponse.json({ ok: true }) : fallo("Esa plantilla no existe.", 404);
  } catch (e) {
    return fallo(motivo(e), 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const { sb, user } = await sesion();
  if (!user) return fallo("Sesión requerida.", 401);
  try {
    const ok = await eliminarPlantillaUsuario(sb, user.id, id);
    return ok ? NextResponse.json({ ok: true }) : fallo("Esa plantilla no existe.", 404);
  } catch (e) {
    return fallo(motivo(e), 500);
  }
}
