import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { patchMasterItem } from "@/lib/db/variants";
import { deleteItem, itemUsage } from "@/lib/db/master";

export const runtime = "nodejs";

/**
 * GET /api/master/[id]?usage=1 → { usage: { variantsCount, overridesCount, childrenCount } }
 * «¿dónde se usa esto?»: lo consume el panel de procedencia (carga perezosa al
 * expandir) y también el pre-chequeo del borrado/reclasificación.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const wantsUsage = new URL(req.url).searchParams.get("usage") === "1";
  if (!wantsUsage) return NextResponse.json({ error: "usa ?usage=1" }, { status: 400 });
  try {
    const usage = await itemUsage(sb, user.id, id);
    return NextResponse.json({ usage });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * Edición inline de un item del master (profile_items).
 *   PATCH /api/master/[id]  body { data } → { item }
 * Editar el master se refleja solo en las variantes que lo referencian y las marca
 * "desactualizadas" (trigger t_master_from_item).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "Falta data." }, { status: 400 });
  }
  try {
    const item = await patchMasterItem(sb, user.id, id, body.data);
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * Borra un item del master.
 *   DELETE /api/master/[id]            → borra si NO está referenciado.
 *   DELETE /api/master/[id]?dryRun=1   → NO borra; devuelve { usage } (pre-chequeo).
 *   DELETE /api/master/[id]?force=1    → borra AUNQUE lo usen variantes (quita esas
 *                                        referencias primero — RESTRICT explícito).
 * Si está referenciado y no hay force, responde 409 con { error, usage } para que el
 * cliente muestre el aviso inline «lo usan N variantes» y ofrezca «eliminar igualmente».
 * Éxito → { deleted, childrenDeleted } para el mensaje del toast de deshacer.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";

  try {
    const usage = await itemUsage(sb, user.id, id);
    if (dryRun) return NextResponse.json({ usage });
    if (usage.variantsCount > 0 && !force) {
      return NextResponse.json({ error: "referenced", usage }, { status: 409 });
    }
    const result = await deleteItem(sb, user.id, id, { force });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
