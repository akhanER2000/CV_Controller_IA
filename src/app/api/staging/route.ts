import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaging } from "@/lib/db/queries";

export const runtime = "nodejs";

/** Lee el staging pendiente del usuario autenticado. */
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    return NextResponse.json({ items: await getStaging(sb, user.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
