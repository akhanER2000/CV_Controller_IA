import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listVariants, countMasterItems } from "@/lib/db/queries";

export const runtime = "nodejs";

/**
 * Lista las variantes del usuario autenticado (RLS por auth.uid()).
 *   GET /api/variants → { variants, masterItems }
 * masterItems alimenta el copy del estado vacío ("Tu master tiene N items").
 * Una cuenta nueva devuelve variants: [] — nunca las 7 de la demo.
 */
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    const [variants, masterItems] = await Promise.all([
      listVariants(sb, user.id),
      countMasterItems(sb, user.id),
    ]);
    return NextResponse.json({ variants, masterItems });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
