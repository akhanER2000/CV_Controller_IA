import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMasterItems, dashboardSummary } from "@/lib/db/queries";
import { createItem, reclassifyToSkill, usageForItems } from "@/lib/db/master";

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
 *   POST /api/master  body { kind, data, parentId? } → { item }
 * origin='manual' (lo pone la capa de datos) y sort_order al final. parentId cuelga
 * una viñeta de su rol (bullet → work). Se usa para "añadir a mano" cada sección.
 */
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { kind?: string; data?: Record<string, unknown>; parentId?: string | null };
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
  const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
  try {
    const item = await createItem(sb, user.id, { kind: body.kind, data: body.data, parentId });
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * Reclasifica viñetas a HABILIDADES (mover viñeta → chip del grupo elegido).
 *   PATCH /api/master  body { reclassify: { ids, group, force? } }
 *     → { moved, group, skillId }
 * Si alguna viñeta está referenciada por una variante (item_id RESTRICT) y no se
 * pasa force, responde 409 con el uso real para que el cliente avise igual que en
 * el borrado. force=true = aceptación explícita (quita esas referencias primero).
 */
export async function PATCH(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { reclassify?: { ids?: unknown; group?: unknown; force?: unknown } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const r = body.reclassify;
  if (!r || !Array.isArray(r.ids) || r.ids.length === 0 || typeof r.group !== "string" || !r.group.trim()) {
    return NextResponse.json({ error: "reclassify inválido." }, { status: 400 });
  }
  const ids = r.ids.filter((x): x is string => typeof x === "string" && !!x);
  const force = r.force === true;

  try {
    if (!force) {
      const usage = await usageForItems(sb, user.id, ids);
      if (usage.referencedIds.length > 0) {
        return NextResponse.json(
          { error: "referenced", usage },
          { status: 409 },
        );
      }
    }
    const result = await reclassifyToSkill(sb, user.id, ids, r.group, { force });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
