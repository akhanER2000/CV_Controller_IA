import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getVariant,
  updateVariant,
  setVariantPresentation,
  archiveVariant,
  variantCounts,
  guardarPaginasObjetivo,
  paginasValidas,
} from "@/lib/db/variants";
import type { PresentationPatch } from "@/lib/cv/resume";

export const runtime = "nodejs";

/**
 * Detalle y cabecera de una variante (RLS por auth.uid()).
 *   GET    /api/variants/[id]          → { variant, items (data efectiva), master }
 *   GET    /api/variants/[id]?counts=1 → { itemCount, overrideCount } (ligero)
 *   PATCH  /api/variants/[id]  body:
 *     { name?, target_title? }               → cabecera → { ok:true }
 *     { presentation: PresentationPatch }    → foto/QR/contacto opt-in por variante
 *                                              → { ok:true, presentation }
 *     { paginas_objetivo: 1|2|3 }            → páginas objetivo (0009)
 *                                              → { ok:true, paginas_objetivo, persistido }
 *        persistido:false ⇒ la columna aún no existe; el editor sigue con su valor.
 *   DELETE /api/variants/[id]          → borrado SUAVE (archived=true) → { ok:true }
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    // Modo ligero para la lista: solo conteos (para el chip «borrador» y el aviso de
    // "se pierden N ajustes propios" al eliminar).
    if (new URL(req.url).searchParams.get("counts")) {
      const counts = await variantCounts(sb, user.id, id);
      return NextResponse.json(counts);
    }
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
    presentation?: PresentationPatch;
    paginas_objetivo?: unknown;
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
    if (body.paginas_objetivo !== undefined) {
      if (!paginasValidas(body.paginas_objetivo)) {
        return NextResponse.json({ error: "paginas_objetivo debe ser 1, 2 o 3." }, { status: 400 });
      }
      const { persistido } = await guardarPaginasObjetivo(sb, user.id, id, body.paginas_objetivo);
      return NextResponse.json({ ok: true, paginas_objetivo: body.paginas_objetivo, persistido });
    }
    await updateVariant(sb, user.id, id, { name: body.name, target_title: body.target_title });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    // Borrado SUAVE: se archiva. La UI ejecuta esto DIFERIDO (tras la ventana de
    // «deshacer»), así deshacer es perfecto (no hay que recrear nada).
    await archiveVariant(sb, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
