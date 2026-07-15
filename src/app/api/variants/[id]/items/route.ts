import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addItem, updateItem, removeItem } from "@/lib/db/variants";

export const runtime = "nodejs";

/**
 * Items de una variante (variant_items). RLS por auth.uid(); el trigger anti-IDOR
 * exige que item_id sea del propio master.
 *   POST   /api/variants/[id]/items  body { item_id } → { item }
 *   PATCH  /api/variants/[id]/items  body { id, visible?, sort_order?, override_data? } → { ok:true }
 *   DELETE /api/variants/[id]/items?id=<variant_item_id> → { ok:true }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { item_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  if (!body.item_id) {
    return NextResponse.json({ error: "Falta item_id." }, { status: 400 });
  }
  try {
    const item = await addItem(sb, user.id, id, body.item_id);
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, _ctx: { params: Promise<{ id: string }> }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: {
    id?: string;
    visible?: boolean;
    sort_order?: number;
    override_data?: Record<string, unknown> | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "Falta id del variant_item." }, { status: 400 });
  }
  try {
    // Solo se pasan las claves presentes ("override_data" incluye el caso null = revertir).
    const patch: { visible?: boolean; sort_order?: number; override_data?: Record<string, unknown> | null } = {};
    if (body.visible !== undefined) patch.visible = body.visible;
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
    if ("override_data" in body) patch.override_data = body.override_data ?? null;
    await updateItem(sb, user.id, body.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, _ctx: { params: Promise<{ id: string }> }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const variantItemId = new URL(req.url).searchParams.get("id");
  if (!variantItemId) {
    return NextResponse.json({ error: "Falta id del variant_item." }, { status: 400 });
  }
  try {
    await removeItem(sb, user.id, variantItemId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
