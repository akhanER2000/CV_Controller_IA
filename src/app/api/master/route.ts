import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMasterItems, dashboardSummary } from "@/lib/db/queries";

export const runtime = "nodejs";

/**
 * Lee los items del master del usuario autenticado (RLS por auth.uid()).
 *   GET /api/master            → { items }
 *   GET /api/master?summary=1  → { items, summary }  (para el panel)
 * Una cuenta nueva devuelve items: [] — nunca la demo.
 */
export async function GET(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    const wantsSummary = new URL(req.url).searchParams.get("summary") === "1";
    const items = await getMasterItems(sb, user.id);
    if (wantsSummary) {
      const summary = await dashboardSummary(sb, user.id);
      return NextResponse.json({ items, summary });
    }
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
