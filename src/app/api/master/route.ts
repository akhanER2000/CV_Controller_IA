import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMasterItems, dashboardSummary, createMasterItem } from "@/lib/db/queries";

export const runtime = "nodejs";

// Kinds válidos (enum item_kind del esquema 0001). El POST manual solo acepta estos.
const ITEM_KINDS = new Set([
  "basics", "summary", "work", "education", "project", "skill",
  "certification", "language", "publication", "link", "bullet",
]);

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

/**
 * Crea un profile_item MANUAL en el master del usuario autenticado.
 *   POST /api/master  body { kind, data } → { item }
 * origin='manual' (lo pone la capa de datos). Se usa, entre otros, para "Añadir
 * datos de contacto" cuando la cuenta aún no tiene un item basics.
 */
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { kind?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  if (!body.kind || !ITEM_KINDS.has(body.kind)) {
    return NextResponse.json({ error: "kind inválido." }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return NextResponse.json({ error: "Falta data." }, { status: 400 });
  }
  try {
    const item = await createMasterItem(sb, user.id, body.kind, body.data);
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
