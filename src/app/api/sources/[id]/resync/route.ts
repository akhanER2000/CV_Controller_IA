import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runImport } from "@/lib/extract/pipeline";
import { makeGeminiExtractor, geminiApiKey } from "@/lib/extract/llm";
import { fetchGithubUser } from "@/lib/extract/github";
import { fetchViaJina } from "@/lib/extract/web";
import { extractFile, extractDepsFor } from "@/lib/extract/files";
import { getUserLlmKey } from "@/lib/account/byok";
import { getSource, restageSource, parseGithubHandle, fileKindFromName, type FileKind } from "@/lib/db/sources";

// Llama al LLM (salvo GitHub) → timeout generoso barato, igual que /api/sources.
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * "Releer" una fuente ya ingerida (RLS por auth.uid()).
 *   POST /api/sources/[id]/resync → { sourceId, staged, counts, warnings }
 *
 * Refetchea desde el ORIGEN de la fuente y reemplaza SUS propuestas pendientes por
 * la lectura nueva (lo ya aceptado en el master no se toca):
 *   · url        → vuelve a leer el sitio (Jina).
 *   · github     → vuelve a consultar la API pública (sin IA).
 *   · pdf/docx/image → re-extrae desde storage_path.
 *   · paste/manual   → NO aplica (no hay origen externo): 400 con motivo.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const source = await getSource(sb, user.id, id);
  if (!source) return NextResponse.json({ error: "Fuente no encontrada." }, { status: 404 });

  const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
  const hasLlm = !!(byok || geminiApiKey());
  const noKey = () =>
    NextResponse.json(
      { error: "Falta configurar la clave de IA (BYOK o GEMINI_API_KEY del servidor)." },
      { status: 503 },
    );
  const deps = { extract: makeGeminiExtractor(byok), fetchGithubUser, fetchWeb: fetchViaJina };

  try {
    switch (source.kind) {
      case "paste":
      case "manual":
        // Un .md/.txt se guarda como 'paste' (el enum de la BD no tiene valor para
        // texto), pero SÍ tiene archivo en Storage: es releíble como cualquier otro
        // archivo. Solo el texto pegado a mano —que no tiene storage_path— carece
        // de origen externo. Distinguirlos por el archivo, no por el kind.
        if (!source.storagePath) {
          return NextResponse.json(
            { error: "El texto pegado no tiene un origen externo que releer. Si cambió, pégalo de nuevo como una fuente nueva." },
            { status: 400 },
          );
        }
      // eslint-disable-next-line no-fallthrough
      case "pdf":
      case "docx":
      case "image": {
        if (!source.storagePath) {
          return NextResponse.json({ error: "No guardamos el archivo original de esta fuente; vuelve a subirlo como fuente nueva." }, { status: 422 });
        }
        if (!hasLlm) return noKey();
        const name = source.originalName || source.storagePath.split("/").pop() || "archivo";
        const { data: blob, error: dlErr } = await sb.storage.from("sources").download(source.storagePath);
        if (dlErr || !blob) return NextResponse.json({ error: `No se pudo descargar el archivo de Storage: ${dlErr?.message ?? "desconocido"}` }, { status: 422 });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        // El kind de la BD no distingue texto: se re-deduce del nombre real, que es
        // justo lo que conserva original_name para no haber necesitado migración.
        const kind = (fileKindFromName(name) ?? (source.kind as FileKind)) as FileKind;
        const ex = await extractFile({ kind, bytes, mime: blob.type || undefined, name }, extractDepsFor(byok));
        if (!ex.text.trim()) {
          await restageSource(sb, user.id, id, [], { status: "failed", error: ex.warning ?? "sin texto legible", raw_text: null });
          return NextResponse.json({ sourceId: id, staged: 0, counts: { verified: 0, partial: 0, none: 0, api: 0, total: 0 }, warnings: [ex.warning ?? "No se pudo leer texto del archivo."] }, { status: 200 });
        }
        const result = await runImport({ pastedText: "", files: [{ label: name, text: ex.text }] }, deps);
        const n = await restageSource(sb, user.id, id, result.staged, {
          raw_text: result.rawText,
          page_count: ex.pageCount ?? null,
          raw_text_is_transcription: ex.isTranscription,
          status: "extracted",
          error: null,
        });
        return NextResponse.json({ sourceId: id, staged: n, counts: result.counts, warnings: result.warnings });
      }

      case "github": {
        const handle = parseGithubHandle(source.sourceUrl ?? source.originalName ?? "");
        if (!handle) return NextResponse.json({ error: "No pudimos recuperar el usuario de GitHub de esta fuente." }, { status: 422 });
        const { text, staged: rows } = await fetchGithubUser(handle);
        if (!rows.length) {
          const notFound = /no se pudo leer/.test(text);
          return NextResponse.json(
            {
              sourceId: id,
              staged: 0,
              counts: { verified: 0, partial: 0, none: 0, api: 0, total: 0 },
              warnings: [notFound ? `No pudimos releer github.com/${handle} — ¿sigue existiendo y público?` : `Sin repos públicos con descripción nuevos que aportar para @${handle}.`],
            },
            { status: 200 },
          );
        }
        const n = await restageSource(sb, user.id, id, rows, { raw_text: text, status: "extracted", error: null });
        return NextResponse.json({ sourceId: id, staged: n, counts: { verified: 0, partial: 0, none: 0, api: n, total: n }, warnings: [] });
      }

      case "url": {
        if (!source.sourceUrl) return NextResponse.json({ error: "Esta fuente no guardó una URL que releer." }, { status: 422 });
        if (!hasLlm) return noKey();
        const result = await runImport({ pastedText: source.sourceUrl }, deps);
        const n = await restageSource(sb, user.id, id, result.staged, { raw_text: result.rawText, status: "extracted", error: null });
        return NextResponse.json({
          sourceId: id,
          staged: n,
          counts: result.counts,
          warnings: n ? [] : ["No pudimos leer contenido nuevo de ese enlace."],
        });
      }

      default:
        return NextResponse.json({ error: "Esta fuente no se puede releer." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al releer la fuente." }, { status: 500 });
  }
}
