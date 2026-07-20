import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { patchMasterItem } from "@/lib/db/variants";
import { deleteItem, itemUsage } from "@/lib/db/master";

export const runtime = "nodejs";

/* ── Validación del `data` que entra por PATCH ────────────────────────────────
   patchMasterItem hace .update({ data }): REEMPLAZA la columna entera, no fusiona.
   Un PATCH mal formado no corrompe un campo — borra el item entero por dentro. Por
   eso aquí no vale "es un objeto": se comprueba forma, claves y valores.

   DATA_KEYS es la unión REAL de lo que escriben la ingesta (extract/pipeline.ts,
   extract/github.ts), el staging (§C2, las claves date*) y esta pantalla. No es un
   catálogo aspiracional: si mañana el pipeline guarda una clave nueva, hay que
   añadirla aquí a mano. Se RECHAZA la clave desconocida en vez de descartarla en
   silencio — descartar sería guardar algo distinto de lo que el cliente pidió y
   decirle que salió bien. */
const DATA_KEYS = new Set([
  // basics (contacto)
  "name", "label", "email", "phone", "location", "links", "photo", "qr",
  // summary y viñeta
  "text",
  // work
  "title", "company", "dates",
  // education
  "degree", "institution",
  // project
  "description", "url",
  // certification / language (el kind existe en el enum; el pipeline aún no los crea)
  "issuer", "language", "level",
  // skill — un grupo es {group, items:CSV}; sourceContext dice de qué rol salió
  "group", "items", "sourceContext",
  // procedencia de la fecha (§C2): quién la puso y qué se entendió de ella
  "dateStart", "dateEnd", "dateCurrent", "dateMissing", "dateInvalid", "dateByHuman",
]);

/** Tope del payload. No hay CV cuyo item legítimo pese 64 KB; más es un cliente roto. */
const MAX_DATA_BYTES = 64 * 1024;
const MAX_LINKS = 40;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Los enlaces del contacto: "url" suelta u {label,url}. Nada más. */
function invalidLinks(v: unknown): string | null {
  if (!Array.isArray(v)) return "links debe ser una lista.";
  if (v.length > MAX_LINKS) return `Demasiados enlaces (máx. ${MAX_LINKS}).`;
  for (const l of v) {
    if (typeof l === "string") continue;
    if (!isPlainObject(l)) return "Cada enlace es una url o {label,url}.";
    for (const [k, val] of Object.entries(l)) {
      if (k !== "label" && k !== "url") return `Clave de enlace no permitida: «${k}».`;
      if (typeof val !== "string") return "label y url de un enlace son texto.";
    }
  }
  return null;
}

/**
 * Devuelve el motivo del rechazo, o null si el `data` puede guardarse. Escalares
 * solamente (texto/número/booleano/null); las dos únicas estructuras que el modelo
 * usa de verdad son `links` (lista) y `qr` (objeto plano de textos).
 */
export function invalidItemData(data: unknown): string | null {
  if (!isPlainObject(data)) return "data debe ser un objeto (ni lista ni nulo).";
  let bytes = 0;
  try {
    bytes = JSON.stringify(data).length;
  } catch {
    return "data no es serializable.";
  }
  if (bytes > MAX_DATA_BYTES) return "data demasiado grande.";

  for (const [k, v] of Object.entries(data)) {
    if (!DATA_KEYS.has(k)) return `Clave no permitida en data: «${k}».`;
    if (k === "links") {
      const bad = invalidLinks(v);
      if (bad) return bad;
      continue;
    }
    if (k === "qr") {
      if (!isPlainObject(v)) return "qr debe ser un objeto.";
      for (const qv of Object.values(v)) {
        if (typeof qv !== "string" && typeof qv !== "boolean") return "qr solo admite texto o booleanos.";
      }
      continue;
    }
    if (v === null) continue;
    const ty = typeof v;
    if (ty !== "string" && ty !== "number" && ty !== "boolean") {
      return `El valor de «${k}» debe ser texto, número o booleano.`;
    }
  }
  return null;
}

/**
 * GET /api/master/[id]?usage=1 → { usage: { variantsCount, overridesCount, childrenCount } }
 * «¿dónde se usa esto?»: lo consume el panel de procedencia (carga perezosa al
 * expandir) y también el pre-chequeo del borrado/reclasificación.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const wantsUsage = new URL(req.url).searchParams.get("usage") === "1";
  if (!wantsUsage) return NextResponse.json({ error: "usa ?usage=1" }, { status: 400 });
  try {
    const usage = await itemUsage(sb, user.id, id);
    return NextResponse.json({ usage });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * Edición inline de un item del master (profile_items).
 *   PATCH /api/master/[id]  body { data } → { item }
 * Editar el master se refleja solo en las variantes que lo referencian y las marca
 * "desactualizadas" (trigger t_master_from_item).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  if (body.data === undefined) {
    return NextResponse.json({ error: "Falta data." }, { status: 400 });
  }
  // El cuerpo entra COMPLETO: el llamante manda el spread de la data previa, no el
  // campo suelto (si no, el .update({data}) de patchMasterItem borra lo demás).
  const bad = invalidItemData(body.data);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  try {
    const item = await patchMasterItem(sb, user.id, id, body.data as Record<string, unknown>);
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * Borra un item del master.
 *   DELETE /api/master/[id]            → borra si NO está referenciado.
 *   DELETE /api/master/[id]?dryRun=1   → NO borra; devuelve { usage } (pre-chequeo).
 *   DELETE /api/master/[id]?force=1    → borra AUNQUE lo usen variantes (quita esas
 *                                        referencias primero — RESTRICT explícito).
 * Si está referenciado y no hay force, responde 409 con { error, usage } para que el
 * cliente muestre el aviso inline «lo usan N variantes» y ofrezca «eliminar igualmente».
 * Éxito → { deleted, childrenDeleted } para el mensaje del toast de deshacer.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";

  try {
    const usage = await itemUsage(sb, user.id, id);
    if (dryRun) return NextResponse.json({ usage });
    if (usage.variantsCount > 0 && !force) {
      return NextResponse.json({ error: "referenced", usage }, { status: 409 });
    }
    const result = await deleteItem(sb, user.id, id, { force });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
