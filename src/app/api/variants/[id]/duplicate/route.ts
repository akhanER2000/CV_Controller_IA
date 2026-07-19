import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { duplicateVariant } from "@/lib/db/variants";

export const runtime = "nodejs";

/**
 * Duplica una variante (RLS por auth.uid()).
 *   POST /api/variants/[id]/duplicate → { variant }
 * Copia la fila cv_variants (name + « (copia)») y TODOS sus variant_items tal cual
 * (visible, sort_order, override_* completos). El trigger anti-IDOR pasa porque el
 * item_id y override_source_item ya pertenecen al master del usuario.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    const variant = await duplicateVariant(sb, user.id, id);
    return NextResponse.json({ variant });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
