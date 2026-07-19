import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSource, deleteSource } from "@/lib/db/sources";

export const runtime = "nodejs";

/**
 * Quita una fuente del usuario (RLS por auth.uid()).
 *   DELETE /api/sources/[id] → { ok: true }
 *
 * Por el esquema, borrar la fuente:
 *   · staged_items.source_id  → ON DELETE CASCADE   → se van sus propuestas PENDIENTES.
 *   · profile_items.source_id → ON DELETE SET NULL  → lo YA ACEPTADO en el master QUEDA
 *                                                     (solo pierde la referencia a la fuente).
 * Además se hace un best-effort de quitar el archivo original de Storage (si lo hubo).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  try {
    const source = await getSource(sb, user.id, id);
    if (!source) return NextResponse.json({ error: "Fuente no encontrada." }, { status: 404 });

    // Best-effort: si tenía archivo en Storage, lo quitamos (no bloquea el borrado).
    if (source.storagePath) {
      try {
        await sb.storage.from("sources").remove([source.storagePath]);
      } catch {
        /* el archivo huérfano no debe impedir borrar la fuente */
      }
    }

    await deleteSource(sb, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
