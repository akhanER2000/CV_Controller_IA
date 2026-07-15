import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listSources } from "@/lib/db/queries";

export const runtime = "nodejs";

/**
 * Lista las fuentes de ingesta del usuario autenticado (RLS por auth.uid()).
 *   GET /api/sources → { sources }
 * Una cuenta nueva devuelve sources: [] — nunca los repos/portfolio de la demo.
 */
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    return NextResponse.json({ sources: await listSources(sb, user.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
