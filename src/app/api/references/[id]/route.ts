import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  deleteReference,
  invalidReferenceData,
  parseLinks,
  setReferenceLinks,
  updateReference,
} from "@/lib/db/references";

export const runtime = "nodejs";

/**
 * UNA referencia del master.
 *
 *   PATCH  /api/references/[id]  body { data?, links? } → { data?, links? }
 *   DELETE /api/references/[id][?force=1]               → { deleted, variantsCount }
 *
 * Los campos y los vínculos se pueden mandar por separado: cambiar el teléfono de
 * la persona no obliga a reenviar con qué proyectos se relaciona, y viceversa.
 * `data` viaja COMPLETO (reemplaza la columna, como todo el master); `links` es el
 * conjunto DESEADO —se borra lo que ya no está y se añade lo nuevo.
 *
 * El borrado espeja el del master: si una variante la usa (variant_items.item_id es
 * ON DELETE RESTRICT), responde 409 con el conteo real para que la pantalla ofrezca
 * «eliminar igualmente» en vez de tragarse un error crudo de Postgres.
 *
 * ⚠ Esta ruta existe además por una razón concreta: PATCH /api/master/[id] valida
 * el `data` contra un vocabulario cerrado (DATA_KEYS) que NO incluye `role`, `org`
 * ni `relation`, así que una referencia editada por ahí sería rechazada. Aquí la
 * validación es la de una referencia (invalidReferenceData).
 */

const esMigracion = (e: unknown) =>
  e instanceof Error && e.message.startsWith("Las referencias necesitan las migraciones");

const noEncontrada = (e: unknown) =>
  e instanceof Error && e.message === "Referencia no encontrada.";

function fallo(e: unknown) {
  const status = esMigracion(e) ? 503 : noEncontrada(e) ? 404 : 500;
  return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { data?: unknown; links?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  if (body.data === undefined && body.links === undefined) {
    return NextResponse.json({ error: "Nada que guardar: manda data, links o los dos." }, { status: 400 });
  }
  if (body.data !== undefined) {
    const bad = invalidReferenceData(body.data);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  }
  const parsed = body.links === undefined ? null : parseLinks(body.links);
  if (parsed && "error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const out: { data?: Record<string, unknown>; links?: unknown } = {};
    if (body.data !== undefined) {
      out.data = await updateReference(sb, user.id, id, body.data as Record<string, unknown>);
    }
    if (parsed) out.links = await setReferenceLinks(sb, user.id, id, parsed.links);
    return NextResponse.json(out);
  } catch (e) {
    return fallo(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    const res = await deleteReference(sb, user.id, id, { force });
    // No borrada porque la usan variantes: 409 + el dato real, igual que el master.
    if (!res.deleted) return NextResponse.json({ error: "referenced", ...res }, { status: 409 });
    return NextResponse.json(res);
  } catch (e) {
    return fallo(e);
  }
}
