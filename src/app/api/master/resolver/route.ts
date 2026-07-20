import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolverDuplicado, type DestinoVinetas } from "@/lib/db/duplicados";

export const runtime = "nodejs";

/**
 * Aplica LA DECISIÓN DEL USUARIO sobre un clúster de duplicados del master (§A4).
 *
 *   POST /api/master/resolver
 *     body { keepId, dropIds[], data?, vinetas?, force?, dryRun? }
 *
 * Las tres acciones de la pantalla son la misma llamada:
 *   · «quedarme con esta»  → { keepId: A, dropIds: [B] }
 *   · «quedarme con la otra» → { keepId: B, dropIds: [A] }
 *   · «fusionar»           → { keepId: A, dropIds: [B], data: {campos elegidos} }
 *
 * NUNCA decide nada por su cuenta: sin keepId y dropIds explícitos no hace nada, y
 * `data` solo admite campos que el usuario tuvo delante (CAMPOS_POR_KIND).
 *
 * ⚠ 409 «referenced» cuando lo que se descarta lo usa alguna variante
 *   (variant_items.item_id es ON DELETE RESTRICT). Devuelve el uso REAL para que
 *   la pantalla diga en cuántas variantes se usa y ofrezca seguir con force=1.
 *   Nunca un 500 crudo de Postgres.
 * ⚠ Las viñetas del descartado se REENGANCHAN por defecto (`vinetas` omitido). Es
 *   deliberado: parent_id es CASCADE, y descartarlas en silencio sería el peor
 *   fallo posible de esta pantalla. «descartar» tiene que pedirse a propósito.
 */
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: {
    keepId?: unknown;
    dropIds?: unknown;
    data?: unknown;
    vinetas?: unknown;
    force?: unknown;
    dryRun?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const keepId = typeof body.keepId === "string" ? body.keepId.trim() : "";
  if (!keepId) return NextResponse.json({ error: "Falta keepId." }, { status: 400 });
  const dropIds = Array.isArray(body.dropIds)
    ? body.dropIds.filter((x): x is string => typeof x === "string" && !!x.trim())
    : [];
  if (dropIds.length === 0) return NextResponse.json({ error: "Falta dropIds." }, { status: 400 });
  if (body.vinetas !== undefined && body.vinetas !== "reenganchar" && body.vinetas !== "descartar") {
    return NextResponse.json({ error: "vinetas debe ser «reenganchar» o «descartar»." }, { status: 400 });
  }

  try {
    const r = await resolverDuplicado(sb, user.id, {
      keepId,
      dropIds,
      data: body.data as Record<string, unknown> | undefined,
      vinetas: body.vinetas as DestinoVinetas | undefined,
      force: body.force === true,
      dryRun: body.dryRun === true,
    });
    if (r.bloqueado) {
      return NextResponse.json({ error: "referenced", ...r }, { status: 409 });
    }
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
