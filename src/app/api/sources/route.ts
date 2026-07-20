import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listSources } from "@/lib/db/queries";
import { runImport } from "@/lib/extract/pipeline";
import { makeGeminiExtractor, geminiApiKey } from "@/lib/extract/llm";
import { fetchGithubUser } from "@/lib/extract/github";
import { fetchViaJina } from "@/lib/extract/web";
import { extractFile, extractDepsFor, type FileKind } from "@/lib/extract/files";
import { getUserLlmKey } from "@/lib/account/byok";
import {
  persistSource,
  fileKindFromName,
  isOwnedPath,
  parseGithubHandle,
  githubSourceUrl,
  sourceKindFor,
} from "@/lib/db/sources";

// Esperar el I/O del LLM no cuenta como Active CPU en Fluid Compute → timeout
// generoso barato (Hobby permite 300 s). Igual que /api/import/context.
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Lista las fuentes de ingesta del usuario autenticado (RLS por auth.uid()).
 *   GET /api/sources → { sources }
 * Una cuenta nueva devuelve sources: [] — nunca los repos/portfolio de la demo.
 */
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    return NextResponse.json({ sources: await listSources(sb, user.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/* ─────────────────────────── POST · alta de fuentes ─────────────────────────
 * Cada tarjeta de Fuentes ES la acción (agente B). Un único endpoint, según kind:
 *   { kind:'paste',  text, name? }            → extrae de texto pegado
 *   { kind:'url',    url }                     → lee portfolio/blog/repo (o GitHub)
 *   { kind:'github', handle }                 → API pública, SIN IA (dato duro)
 *   { kind:'pdf'|'docx'|'image', files:[…] }  → descarga de Storage + extrae
 * Los archivos NUNCA pasan por el body (los sube el navegador a Storage y aquí se
 * descargan por `path`, límite 4,5 MB de Vercel). NADA entra al master (§4.1).
 * ──────────────────────────────────────────────────────────────────────────── */

interface FileRef {
  path?: string;
  name?: string;
  kind?: string;
}
interface PostBody {
  kind?: string;
  text?: string;
  name?: string;
  url?: string;
  handle?: string;
  files?: FileRef[];
}

type Counts = { verified: number; partial: number; none: number; api: number; total: number };
const zero = (): Counts => ({ verified: 0, partial: 0, none: 0, api: 0, total: 0 });
const addCounts = (a: Counts, b: Counts): Counts => ({
  verified: a.verified + b.verified,
  partial: a.partial + b.partial,
  none: a.none + b.none,
  api: a.api + b.api,
  total: a.total + b.total,
});
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function POST(req: Request) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  // BYOK: clave del usuario (descifrada, solo servidor) o la del servidor.
  const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
  const hasLlm = !!(byok || geminiApiKey());
  const noKey = () =>
    NextResponse.json(
      { error: "Falta configurar la clave de IA (BYOK o GEMINI_API_KEY del servidor)." },
      { status: 503 },
    );
  const deps = { extract: makeGeminiExtractor(byok), fetchGithubUser, fetchWeb: fetchViaJina };

  const kind = typeof body.kind === "string" ? body.kind : "";
  const files = Array.isArray(body.files) ? body.files : [];

  // ── GitHub como DATO DURO (sin IA). También lo usa una URL de github.com. ──
  async function runGithub(handle: string) {
    const { text, staged: rows } = await fetchGithubUser(handle);
    if (!rows.length) {
      const notFound = /no se pudo leer/.test(text);
      return NextResponse.json(
        {
          sourceId: null,
          sourceIds: [],
          staged: 0,
          counts: zero(),
          warnings: [
            notFound
              ? `No pudimos leer github.com/${handle} — ¿el usuario existe y es público?`
              : `Leímos @${handle} pero no había repos públicos con descripción que aportar (los forks y los repos sin descripción se omiten).`,
          ],
        },
        { status: notFound ? 422 : 200 },
      );
    }
    const { sourceId, staged } = await persistSource(
      sb,
      user!.id,
      { kind: "github", originalName: `GitHub · @${handle}`, sourceUrl: githubSourceUrl(handle), rawText: text, status: "extracted" },
      rows,
    );
    const repos = rows.filter((r) => r.kind === "project").map((r) => String(r.data.name ?? "")).filter(Boolean);
    const languages = rows.filter((r) => r.kind === "skill").map((r) => String(r.data.items ?? "")).filter(Boolean);
    return NextResponse.json({
      sourceId,
      sourceIds: [sourceId],
      staged,
      counts: { verified: 0, partial: 0, none: 0, api: staged, total: staged },
      github: { handle, repos, languages },
      warnings: [],
    });
  }

  try {
    // ── ARCHIVOS (PDF / DOCX / imagen) ────────────────────────────────────────
    if (files.length) {
      if (!hasLlm) return noKey();
      const sourceIds: string[] = [];
      let staged = 0;
      let counts = zero();
      const warnings: string[] = [];

      for (const ref of files) {
        const path = typeof ref.path === "string" ? ref.path : "";
        const name = (typeof ref.name === "string" && ref.name) || (path.split("/").pop() ?? "archivo");
        const fk = fileKindFromName(name) ?? ((["pdf", "docx", "image", "text"] as const).includes(ref.kind as FileKind) ? (ref.kind as FileKind) : null);
        if (!fk || !path) {
          warnings.push(`«${name}»: referencia de archivo inválida (tipo o ruta).`);
          continue;
        }
        if (!isOwnedPath(path, user.id)) {
          warnings.push(`«${name}»: ruta no autorizada.`);
          continue;
        }
        try {
          const { data: blob, error: dlErr } = await sb.storage.from("sources").download(path);
          if (dlErr || !blob) throw new Error(dlErr?.message ?? "no se pudo descargar de Storage");
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const ex = await extractFile({ kind: fk, bytes, mime: blob.type || undefined, name }, extractDepsFor(byok));
          if (ex.warning) warnings.push(`«${name}»: ${ex.warning}`);

          if (!ex.text.trim()) {
            // Fuente registrada como procedencia (falló la lectura), sin staged.
            const { sourceId } = await persistSource(
              sb,
              user.id,
              { kind: sourceKindFor(fk), originalName: name, storagePath: path, pageCount: ex.pageCount ?? null, rawText: null, rawTextIsTranscription: ex.isTranscription, status: "failed", error: ex.warning ?? "sin texto legible" },
              [],
            );
            sourceIds.push(sourceId);
            continue;
          }

          const result = await runImport({ pastedText: "", files: [{ label: name, text: ex.text }] }, deps);
          // 'text' no existe en el enum de la BD: se persiste como 'paste' (que es
          // lo que es) conservando original_name y storage_path.
          const { sourceId, staged: n } = await persistSource(
            sb,
            user.id,
            { kind: sourceKindFor(fk), originalName: name, storagePath: path, pageCount: ex.pageCount ?? null, rawText: result.rawText, rawTextIsTranscription: ex.isTranscription, status: "extracted" },
            result.staged,
          );
          sourceIds.push(sourceId);
          staged += n;
          counts = addCounts(counts, result.counts);
          warnings.push(...result.warnings);
        } catch (e) {
          warnings.push(`«${name}»: no se pudo procesar (${msg(e)}).`);
        }
      }

      if (!sourceIds.length) {
        return NextResponse.json(
          { error: "No pudimos leer ningún archivo." + (warnings.length ? " " + warnings.join(" ") : "") },
          { status: 422 },
        );
      }
      return NextResponse.json({ sourceId: sourceIds[0], sourceIds, staged, counts, warnings });
    }

    // ── GITHUB (usuario) ──────────────────────────────────────────────────────
    if (kind === "github" || (typeof body.handle === "string" && body.handle.trim())) {
      const handle = parseGithubHandle(body.handle);
      if (!handle) return NextResponse.json({ error: "Escribe tu usuario de GitHub (o el enlace a tu perfil)." }, { status: 400 });
      return await runGithub(handle);
    }

    // ── URL (portfolio / blog / repo). Un github.com/… se desvía a la ruta dura.
    if (kind === "url" || (typeof body.url === "string" && body.url.trim())) {
      const url = (body.url ?? "").trim();
      if (url.length < 4 || !/\.[a-z]{2,}/i.test(url)) {
        return NextResponse.json({ error: "Escribe una dirección válida (https://…)." }, { status: 400 });
      }
      const ghHandle = /(^|\/\/|\.)github\.com\//i.test(url) ? parseGithubHandle(url) : null;
      if (ghHandle) return await runGithub(ghHandle);

      if (!hasLlm) return noKey();
      const result = await runImport({ pastedText: url }, deps);
      if (!result.staged.length) {
        const isLi = result.linkedin.length > 0;
        return NextResponse.json(
          {
            sourceId: null,
            sourceIds: [],
            staged: 0,
            counts: result.counts,
            linkedin: result.linkedin,
            warnings: [
              isLi
                ? "LinkedIn no se puede leer desde fuera. Pega el texto o sube el PDF/capturas en la tarjeta de LinkedIn."
                : "No pudimos leer contenido útil de ese enlace.",
            ],
          },
          { status: 200 },
        );
      }
      const { sourceId, staged } = await persistSource(
        sb,
        user.id,
        { kind: "url", sourceUrl: url, rawText: result.rawText, status: "extracted" },
        result.staged,
      );
      return NextResponse.json({ sourceId, sourceIds: [sourceId], staged, counts: result.counts, sources: result.sources, warnings: result.warnings });
    }

    // ── TEXTO PEGADO ──────────────────────────────────────────────────────────
    if (kind === "paste" || (typeof body.text === "string" && body.text.trim())) {
      const text = (body.text ?? "").trim();
      if (text.length < 20) {
        return NextResponse.json({ error: "Pega un poco más de texto (al menos un par de frases)." }, { status: 400 });
      }
      if (!hasLlm) return noKey();
      const result = await runImport({ pastedText: text }, deps);
      const { sourceId, staged } = await persistSource(
        sb,
        user.id,
        { kind: "paste", originalName: (typeof body.name === "string" && body.name.trim()) || null, rawText: result.rawText, status: "extracted" },
        result.staged,
      );
      return NextResponse.json({
        sourceId,
        sourceIds: [sourceId],
        staged,
        counts: result.counts,
        sources: result.sources,
        linkedin: result.linkedin,
        warnings: result.warnings,
      });
    }

    return NextResponse.json({ error: "Nada que ingerir: falta texto, enlace, usuario de GitHub o archivos." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: msg(e) || "Error al ingerir la fuente." }, { status: 500 });
  }
}
