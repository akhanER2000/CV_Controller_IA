import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leerAvisoDeVariante } from "@/lib/db/aviso";
import {
  getVariant,
  updateVariant,
  setVariantPresentation,
  archiveVariant,
  variantCounts,
  guardarPaginasObjetivo,
  paginasValidas,
  guardarReglas,
  addItem,
  updateItem,
} from "@/lib/db/variants";
import { getMasterItems } from "@/lib/db/queries";
import { validarReglas } from "@/lib/cv/reglas";
import type { PresentationPatch } from "@/lib/cv/resume";
import { encuadreValido, leerEncuadre } from "@/components/editor/encuadre";

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
 *     { reglas: Reglas }                     → reglas de la variante (0012, DA-R1)
 *                                              → { ok:true, reglas, persistido, items }
 *        Los items de «Incluir siempre» que falten entran (o se vuelven visibles).
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
    // El aviso con el que nació (o se adaptó) la variante, para «Afinar con IA» (DA-AV3).
    return NextResponse.json({ ...detail, aviso: await leerAvisoDeVariante(sb, user.id, id) });
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
    /** + photoEncuadre: el ORIGINAL de la foto y sus parámetros, para volver a encuadrar. */
    presentation?: PresentationPatch & { photoEncuadre?: unknown };
    paginas_objetivo?: unknown;
    reglas?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  try {
    if (body.presentation) {
      const { photoEncuadre, ...patch } = body.presentation;
      if (photoEncuadre != null) {
        const motivo = encuadreValido(photoEncuadre);
        if (motivo) return NextResponse.json({ error: motivo }, { status: 400 });
      }
      const presentation = await setVariantPresentation(sb, user.id, id, patch);
      // El encuadre vive junto a la foto en el override de basics (la foto recortada
      // es la que lee el PDF; esto solo permite re-encuadrar). Quitar la foto lo quita.
      const ov = { ...presentation.override };
      let cambia = false;
      if (patch.photo === "" || photoEncuadre === null) {
        cambia = "photoEncuadre" in ov;
        delete ov.photoEncuadre;
      } else if (photoEncuadre !== undefined) {
        const e = leerEncuadre(photoEncuadre)!;
        ov.photoEncuadre = { src: e.src, zoom: e.encuadre.zoom, cx: e.encuadre.cx, cy: e.encuadre.cy };
        cambia = true;
      }
      if (cambia) {
        const { error } = await sb
          .from("variant_items")
          .update({ override_data: ov })
          .eq("id", presentation.basicsItemId)
          .eq("user_id", user.id);
        if (error) throw new Error(error.message);
        presentation.override = ov;
      }
      return NextResponse.json({ ok: true, presentation });
    }
    if (body.paginas_objetivo !== undefined) {
      if (!paginasValidas(body.paginas_objetivo)) {
        return NextResponse.json({ error: "paginas_objetivo debe ser 1, 2 o 3." }, { status: 400 });
      }
      const { persistido } = await guardarPaginasObjetivo(sb, user.id, id, body.paginas_objetivo);
      return NextResponse.json({ ok: true, paginas_objetivo: body.paginas_objetivo, persistido });
    }
    if (body.reglas !== undefined) {
      const master = await getMasterItems(sb, user.id);
      const vr = validarReglas(body.reglas, { masterIds: new Set(master.map((m) => m.id)) });
      if (!vr.ok) return NextResponse.json({ error: vr.errores.join(" ") }, { status: 400 });
      const detalle = await getVariant(sb, user.id, id);
      if (!detalle) return NextResponse.json({ error: "Variante no encontrada." }, { status: 404 });
      const { persistido } = await guardarReglas(sb, user.id, id, vr.reglas);
      // Un objetivo de páginas por encima del nuevo máximo baja al máximo.
      const max = vr.reglas.paginasMax;
      if (max && detalle.variant.paginas_objetivo > max) await guardarPaginasObjetivo(sb, user.id, id, max);
      // Los OBLIGATORIOS se cumplen al guardarlos: el que falte entra, el oculto se ve.
      const porMaster = new Map(detalle.items.map((v) => [v.item_id, v]));
      let cambio = false;
      for (const mid of vr.reglas.incluirSiempre) {
        const v = porMaster.get(mid);
        if (!v) await addItem(sb, user.id, id, mid);
        else if (!v.visible) await updateItem(sb, user.id, v.id, { visible: true });
        else continue;
        cambio = true;
      }
      const items = cambio ? (await getVariant(sb, user.id, id))?.items ?? detalle.items : detalle.items;
      return NextResponse.json({ ok: true, reglas: vr.reglas, persistido, items });
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
