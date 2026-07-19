import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * «Borrar todos mis datos» ≠ «Borrar mi cuenta» (esta ruta es lo primero).
 *
 *   GET    → EXPORTA todo el contenido del usuario como JSON descargable
 *            (Content-Disposition attachment). user_settings va SIN la clave BYOK:
 *            el secreto NUNCA sale del servidor — ni siquiera se selecciona.
 *   DELETE → borra el CONTENIDO del usuario (no la cuenta). Body { confirm } con la
 *            palabra exacta, verificada EN el servidor. Conserva cuenta, sesión y
 *            user_settings (tema · idioma · BYOK). Devuelve conteos reales.
 *
 * Todo con la sesión del usuario (RLS por auth.uid()): jamás toca datos de otro.
 */

const CONFIRM_WORD = "BORRAR MIS DATOS";

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const uid = user.id;

  // Cada tabla del usuario con su procedencia íntegra. user_settings selecciona
  // columnas explícitas: llm_api_key NO está en la lista → imposible filtrarla.
  const [master, profileItems, variants, variantItems, sources, staged, jobs, settings] =
    await Promise.all([
      sb.from("master_profiles").select("*").eq("user_id", uid).maybeSingle(),
      sb.from("profile_items").select("*").eq("user_id", uid)
        .order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      sb.from("cv_variants").select("*").eq("user_id", uid).order("created_at", { ascending: true }),
      sb.from("variant_items").select("*").eq("user_id", uid).order("sort_order", { ascending: true }),
      sb.from("ingestion_sources").select("*").eq("user_id", uid).order("created_at", { ascending: true }),
      sb.from("staged_items").select("*").eq("user_id", uid).eq("status", "pending")
        .order("created_at", { ascending: true }),
      sb.from("job_descriptions").select("*").eq("user_id", uid).order("created_at", { ascending: true }),
      sb.from("user_settings")
        .select("ui_lang,theme,ai_enabled,display_name,created_at,updated_at")
        .eq("user_id", uid).maybeSingle(),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1 as const,
    master: master.data ?? null,
    profileItems: profileItems.data ?? [],
    variants: variants.data ?? [],
    variantItems: variantItems.data ?? [],
    sources: sources.data ?? [],
    staged: staged.data ?? [],
    jobs: jobs.data ?? [],
    settings: settings.data ?? null, // sin llm_api_key
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="corpus-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

// Orden de borrado respetando las FKs. La clave: variant_items.item_id →
// profile_items es ON DELETE RESTRICT, así que los overrides van ANTES que los
// items del master. master_profiles al final (profile_items/cv_variants ya no lo
// referencian). user_settings NO se toca.
type WipeTable =
  | "variant_items"
  | "cv_variants"
  | "profile_items"
  | "staged_items"
  | "ingestion_sources"
  | "ingestion_batches"
  | "job_descriptions"
  | "master_profiles";

export async function DELETE(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const uid = user.id;

  let body: { confirm?: unknown };
  try {
    body = (await req.json()) as { confirm?: unknown };
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  if (body.confirm !== CONFIRM_WORD) {
    return NextResponse.json(
      { error: `Confirmación incorrecta. Escribe exactamente «${CONFIRM_WORD}».` },
      { status: 400 },
    );
  }

  // Borra y cuenta DE VERDAD (RLS por auth.uid()). .select("id") ⇒ length real.
  async function wipe(table: WipeTable): Promise<number> {
    const { data, error } = await sb.from(table).delete().eq("user_id", uid).select("id");
    if (error) throw new Error(`${table}: ${error.message}`);
    return data?.length ?? 0;
  }

  // Archivos de Storage del usuario: se enumeran RECURSIVAMENTE bajo `${uid}/`
  // (paths {uid}/{source_id}/{archivo}) y se borran por lotes. NO se sube nada.
  async function wipeFiles(): Promise<number> {
    const bucket = sb.storage.from("sources");
    const files: string[] = [];
    const dirs: string[] = [uid];
    while (dirs.length) {
      const dir = dirs.pop()!;
      let offset = 0;
      for (;;) {
        const { data, error } = await bucket.list(dir, {
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        for (const entry of data) {
          const full = `${dir}/${entry.name}`;
          if (entry.id === null) dirs.push(full); // carpeta (placeholder sin id)
          else files.push(full); // archivo
        }
        if (data.length < 100) break;
        offset += 100;
      }
    }
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await bucket.remove(files.slice(i, i + 100));
      if (error) throw new Error(error.message);
    }
    return files.length;
  }

  try {
    const overrides = await wipe("variant_items");
    const variants = await wipe("cv_variants");
    const items = await wipe("profile_items");
    const staged = await wipe("staged_items");
    const sources = await wipe("ingestion_sources");
    const batches = await wipe("ingestion_batches");
    const jobs = await wipe("job_descriptions");

    // Storage es best-effort: la base ya está limpia; si un archivo se resiste,
    // se informa como warning en vez de mentir con un 500.
    const warnings: string[] = [];
    let files = 0;
    try {
      files = await wipeFiles();
    } catch (e) {
      warnings.push(`storage: ${e instanceof Error ? e.message : "no se pudieron borrar archivos"}`);
    }

    await wipe("master_profiles");

    return NextResponse.json({
      deleted: { items, variants, overrides, sources, staged, jobs, batches, files },
      ...(warnings.length ? { warnings } : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al borrar." },
      { status: 500 },
    );
  }
}
