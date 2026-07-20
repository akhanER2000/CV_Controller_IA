import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listSources } from "@/lib/db/queries";
import { runImport } from "@/lib/extract/pipeline";
import { makeGeminiExtractor, geminiApiKey } from "@/lib/extract/llm";
import { fetchGithubUser } from "@/lib/extract/github";
import { fetchViaJina } from "@/lib/extract/web";
import { extractFile, extractDepsFor, type FileKind } from "@/lib/extract/files";
import { getUserLlmKey } from "@/lib/account/byok";
import { registrarIngesta, consumoCero, sumarConsumo, type ConsumoIA } from "@/lib/db/telemetria";
import type { ResumenLectura } from "@/lib/extract/llm";
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
  /** ★ La vía de escape del reparto por secciones: manda TODO el documento a los
   *  cinco extractores. Existe porque una optimización que no se puede desactivar
   *  es una decisión que se le impone al usuario sobre SUS datos. */
  completo?: boolean;
}

/**
 * Las secciones que la ingesta trató como CONTEXTO, dichas por su nombre.
 * Esta ruta no tiene un hueco estructurado en la UI como sí lo tiene el volcado,
 * así que van por `warnings`, que la pantalla de fuentes ya muestra. Es la regla
 * capital del producto: una sección que no se mandó al modelo se NOMBRA, no se
 * omite. Nunca devuelve un aviso vacío si no hubo secciones de contexto.
 */
function avisoContexto(lectura: ResumenLectura | undefined, etiqueta: string): string[] {
  const secciones = lectura?.contexto ?? [];
  if (!secciones.length) return [];
  const kb = Math.round(secciones.reduce((n, s) => n + s.caracteres, 0) / 1024);
  const nombres = secciones.map((s) => `«${s.titulo}»`).join(", ");
  return [
    `«${etiqueta}»: ${secciones.length} ${secciones.length === 1 ? "sección se leyó" : "secciones se leyeron"} como contexto ` +
    `(${kb} KB) y no se mandaron a extraer porque no producen items de CV: ${nombres}. ` +
    `Si crees que ahí hay datos tuyos, vuelve a subirla con «leer entero» o pulsa «Releer».`,
  ];
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
  // `completo` desactiva el reparto por secciones para esta ingesta concreta.
  const completo = body.completo === true;
  const deps = {
    extract: makeGeminiExtractor(byok, { forzarCompleto: completo }),
    fetchGithubUser,
    fetchWeb: fetchViaJina,
  };

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
      // El consumo de VARIOS archivos se acumula y se devuelve sumado; cada
      // fuente registra además el suyo propio en ingestion_events.
      let consumo: ConsumoIA = consumoCero();

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
          warnings.push(...avisoContexto(result.lectura, name));
          if (result.consumo) {
            consumo = sumarConsumo(consumo, result.consumo);
            const err = await registrarIngesta(sb, user.id, sourceId, {
              consumo: result.consumo,
              contexto: result.lectura?.contexto ?? [],
            });
            if (err) warnings.push(err);
          }
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
      return NextResponse.json({ sourceId: sourceIds[0], sourceIds, staged, counts, warnings, consumo });
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
      const avisos = [...result.warnings, ...avisoContexto(result.lectura, url)];
      if (result.consumo) {
        const err = await registrarIngesta(sb, user.id, sourceId, {
          consumo: result.consumo, contexto: result.lectura?.contexto ?? [],
        });
        if (err) avisos.push(err);
      }
      return NextResponse.json({ sourceId, sourceIds: [sourceId], staged, counts: result.counts, sources: result.sources, warnings: avisos, consumo: result.consumo ?? null });
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
      const etiqueta = (typeof body.name === "string" && body.name.trim()) || "texto pegado";
      const avisos = [...result.warnings, ...avisoContexto(result.lectura, etiqueta)];
      if (result.consumo) {
        const err = await registrarIngesta(sb, user.id, sourceId, {
          consumo: result.consumo, contexto: result.lectura?.contexto ?? [],
        });
        if (err) avisos.push(err);
      }
      return NextResponse.json({
        sourceId,
        sourceIds: [sourceId],
        staged,
        counts: result.counts,
        sources: result.sources,
        linkedin: result.linkedin,
        warnings: avisos,
        consumo: result.consumo ?? null,
      });
    }

    return NextResponse.json({ error: "Nada que ingerir: falta texto, enlace, usuario de GitHub o archivos." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: msg(e) || "Error al ingerir la fuente." }, { status: 500 });
  }
}
