import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runImport } from "@/lib/extract/pipeline";
import { makeGeminiExtractor, geminiApiKey } from "@/lib/extract/llm";
import { fetchGithubUser } from "@/lib/extract/github";
import { fetchViaJina } from "@/lib/extract/web";
import { ensureMaster, persistImport } from "@/lib/db/queries";
import { extractFile, extractDepsFor, type FileKind } from "@/lib/extract/files";
import { getUserLlmKey } from "@/lib/account/byok";

// Esperar el I/O del LLM no cuenta como Active CPU en Fluid Compute → timeout
// generoso barato. Hobby permite 300 s (02 §1).
export const runtime = "nodejs";
export const maxDuration = 300;

/** Referencia a un archivo YA subido a Storage por el navegador (bucket 'sources'). */
interface FileRef {
  path?: string;
  name?: string;
  kind?: string;
}

const FILE_KINDS: readonly string[] = ["pdf", "docx", "image"];
const asKind = (k: unknown): FileKind | null =>
  typeof k === "string" && FILE_KINDS.includes(k) ? (k as FileKind) : null;

/**
 * "Pega lo que tengas" (§3). Autentica → descarga y extrae los archivos de
 * Storage (los archivos NUNCA pasan por el body: límite 4,5 MB de Vercel) →
 * corre el pipeline (Gemini + GitHub API + Jina) sobre texto + archivos →
 * persiste en staged_items y registra cada archivo como su propia
 * ingestion_source (procedencia). NADA entra al master aquí (§4.1).
 */
export async function POST(req: Request) {
  let body: { text?: string; files?: FileRef[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const fileRefs = Array.isArray(body.files) ? body.files : [];

  if (text.length < 20 && fileRefs.length === 0) {
    return NextResponse.json({ error: "Pega un poco más de texto (al menos un par de frases)." }, { status: 400 });
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  // BYOK: la clave del usuario (descifrada, solo servidor) o la del servidor.
  const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
  if (!byok && !geminiApiKey()) {
    return NextResponse.json({ error: "Falta configurar la clave de IA (BYOK o GEMINI_API_KEY del servidor)." }, { status: 503 });
  }

  // ── 1 · Descargar de Storage + extraer texto por archivo ────────────────────
  const forPipeline: { label: string; text: string }[] = [];
  const fileSources: {
    kind: FileKind;
    name: string;
    path: string;
    rawText: string;
    isTranscription: boolean;
    pageCount?: number;
    status: "extracted" | "failed";
    error?: string;
  }[] = [];
  const warnings: string[] = [];

  for (const ref of fileRefs) {
    const kind = asKind(ref.kind);
    const path = typeof ref.path === "string" ? ref.path : "";
    const name = (typeof ref.name === "string" && ref.name) || (path.split("/").pop() ?? "archivo");

    if (!kind || !path) {
      warnings.push(`«${name}»: referencia de archivo inválida (tipo o ruta).`);
      continue;
    }
    // Defensa en profundidad: el path debe ser del usuario (la RLS ya lo exige).
    if (!path.startsWith(`${user.id}/`)) {
      warnings.push(`«${name}»: ruta no autorizada.`);
      continue;
    }

    try {
      const { data: blob, error: dlErr } = await sb.storage.from("sources").download(path);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "no se pudo descargar de Storage");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mime = blob.type || undefined;

      const ex = await extractFile({ kind, bytes, mime, name }, extractDepsFor(byok));
      if (ex.text.trim()) forPipeline.push({ label: name, text: ex.text });
      if (ex.warning) warnings.push(`«${name}»: ${ex.warning}`);

      fileSources.push({
        kind,
        name,
        path,
        rawText: ex.text,
        isTranscription: ex.isTranscription,
        pageCount: ex.pageCount,
        status: ex.text.trim() ? "extracted" : "failed",
        error: ex.warning,
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : "error";
      warnings.push(`«${name}»: no se pudo procesar (${m}).`);
      fileSources.push({
        kind,
        name,
        path,
        rawText: "",
        isTranscription: kind === "image",
        status: "failed",
        error: m,
      });
    }
  }

  // Sin NADA legible (ni texto suficiente ni archivos con contenido): honestidad.
  const hasContent = text.length >= 20 || forPipeline.some((f) => f.text.trim());
  if (!hasContent) {
    const detail = warnings.length ? " " + warnings.join(" ") : "";
    return NextResponse.json(
      { error: "No pudimos leer texto de lo que subiste." + detail },
      { status: 422 },
    );
  }

  // ── 2 · Pipeline: verifica la evidencia sobre texto + transcripciones ───────
  try {
    const result = await runImport(
      { pastedText: text, files: forPipeline },
      { extract: makeGeminiExtractor(byok), fetchGithubUser, fetchWeb: fetchViaJina },
    );
    await ensureMaster(sb, user.id);
    const { sourceId, staged } = await persistImport(sb, user.id, result);

    // ── 3 · Cada archivo, como su propia ingestion_source (procedencia) ───────
    // kind pdf/docx/image, raw_text y raw_text_is_transcription (imagen/escaneado).
    if (fileSources.length) {
      const { error: fsErr } = await sb.from("ingestion_sources").insert(
        fileSources.map((f) => ({
          user_id: user.id,
          kind: f.kind,
          original_name: f.name,
          storage_path: f.path,
          status: f.status,
          page_count: f.pageCount ?? null,
          raw_text: f.rawText || null,
          raw_text_is_transcription: f.isTranscription,
          error: f.error ?? null,
        })),
      );
      if (fsErr) warnings.push(`No se pudieron registrar las fuentes de archivo: ${fsErr.message}`);
    }

    return NextResponse.json({
      sourceId,
      staged,
      counts: result.counts,
      sources: result.sources,
      linkedin: result.linkedin,
      warnings,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al importar" }, { status: 500 });
  }
}
