import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createReference, listReferences, invalidReferenceData, parseLinks } from "@/lib/db/references";

export const runtime = "nodejs";

/**
 * REFERENCIAS del master (kind 'reference' + reference_links).
 *
 *   GET  /api/references → { references, migracionPendiente }
 *   POST /api/references  body { data, links? } → { reference }
 *
 * ⚠⚠ DATOS DE TERCEROS. Estas filas contienen datos de personas que NO son el
 * usuario. Por eso esta ruta EXIGE sesión igual que las demás (RLS por auth.uid())
 * y no existe ninguna variante pública de ella: no hay GET sin sesión, no hay id
 * compartible, y el CV solo las imprime si el usuario lo enciende por variante.
 *
 * Tiene ruta propia y no pasa por /api/master a propósito: el `data` de una
 * referencia tiene su propio vocabulario cerrado (name, role, org, relation,
 * email, phone) y sus vínculos se guardan en el mismo gesto — un POST que crea la
 * persona y la deja suelta, sin decir con qué proyecto se relaciona, es medio dato.
 *
 * Si las migraciones 0004/0005 no están aplicadas (se corren A MANO en el editor
 * SQL de Supabase), el GET responde 200 con `migracionPendiente: true` y lista
 * vacía —la pantalla puede pintar el aviso real— y el POST responde 503 con el
 * texto que dice exactamente qué falta y qué hacer.
 */

/** ¿El fallo es «falta la migración»? Se responde 503 (el servicio no está listo
 *  todavía), no 500: no es un error del cliente ni un bug, es una migración por
 *  aplicar, y el mensaje ya lo explica. */
const esMigracion = (e: unknown) =>
  e instanceof Error && e.message.startsWith("Las referencias necesitan las migraciones");

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    const out = await listReferences(sb, user.id);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { data?: unknown; links?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const bad = invalidReferenceData(body.data);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const parsed = parseLinks(body.links);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const reference = await createReference(
      sb,
      user.id,
      body.data as Record<string, unknown>,
      parsed.links,
    );
    return NextResponse.json({ reference });
  } catch (e) {
    const status = esMigracion(e) ? 503 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status });
  }
}
