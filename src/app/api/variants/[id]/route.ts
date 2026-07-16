import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVariant, updateVariant, setVariantPresentation } from "@/lib/db/variants";

export const runtime = "nodejs";

/**
 * Detalle y cabecera de una variante (RLS por auth.uid()).
 *   GET   /api/variants/[id] → { variant, items (data efectiva), master }
 *   PATCH /api/variants/[id]  body:
 *     { name?, target_title? }                 → cabecera → { ok:true }
 *     { presentation: { photo?, qrUrl? } }     → foto/QR opt-in por variante
 *                                                → { ok:true, presentation }
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    const detail = await getVariant(sb, user.id, id);
    if (!detail) return NextResponse.json({ error: "Variante no encontrada." }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: {
    name?: string;
    target_title?: string | null;
    presentation?: { photo?: string; qrUrl?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  try {
    if (body.presentation) {
      const presentation = await setVariantPresentation(sb, user.id, id, body.presentation);
      return NextResponse.json({ ok: true, presentation });
    }
    await updateVariant(sb, user.id, id, { name: body.name, target_title: body.target_title });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
