import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { patchMasterItem } from "@/lib/db/variants";

export const runtime = "nodejs";

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
