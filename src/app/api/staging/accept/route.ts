import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { promoteStaged, getStaging } from "@/lib/db/queries";

export const runtime = "nodejs";

/**
 * Acepta staged_items → master (§4.1). Body: { stagedId } para uno, o
 * { verifiedOnly: true } para el lote (los lotes SOLO tocan lo verificado — el
 * resto pasa por los ojos del usuario, uno a uno). Devuelve cuántos se promovieron.
 */
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { stagedId?: string; verifiedOnly?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  try {
    if (body.stagedId) {
      const id = await promoteStaged(sb, user.id, body.stagedId);
      return NextResponse.json({ promoted: 1, itemId: id });
    }
    if (body.verifiedOnly) {
      const pending = await getStaging(sb, user.id);
      // los lotes solo tocan lo verificado; promover roles antes que sus viñetas
      const verified = pending.filter((r) => r.evidence_verified);
      verified.sort((a, b) => (a.kind === "bullet" ? 1 : 0) - (b.kind === "bullet" ? 1 : 0));
      let n = 0;
      for (const r of verified) {
        await promoteStaged(sb, user.id, r.id);
        n++;
      }
      return NextResponse.json({ promoted: n });
    }
    return NextResponse.json({ error: "Falta stagedId o verifiedOnly." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
