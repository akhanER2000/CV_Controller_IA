import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runImport } from "@/lib/extract/pipeline";
import { geminiExtractor } from "@/lib/extract/llm";
import { fetchGithubUser } from "@/lib/extract/github";
import { fetchViaJina } from "@/lib/extract/web";
import { geminiApiKey } from "@/lib/extract/llm";
import { ensureMaster, persistImport } from "@/lib/db/queries";

// Esperar el I/O del LLM no cuenta como Active CPU en Fluid Compute → timeout
// generoso barato. Hobby permite 300 s (02 §1).
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * "Pega lo que tengas" (§3). Autentica → corre el pipeline (Gemini + GitHub API +
 * Jina) → persiste en staged_items. NADA entra al master aquí (§4.1): esto puebla
 * el staging; el usuario acepta después.
 */
export async function POST(req: Request) {
  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (text.length < 20) {
    return NextResponse.json({ error: "Pega un poco más de texto (al menos un par de frases)." }, { status: 400 });
  }
  if (!geminiApiKey()) {
    return NextResponse.json({ error: "Falta configurar GEMINI_API_KEY en el servidor." }, { status: 503 });
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  try {
    const result = await runImport(
      { pastedText: text },
      { extract: geminiExtractor, fetchGithubUser, fetchWeb: fetchViaJina },
    );
    await ensureMaster(sb, user.id);
    const { sourceId, staged } = await persistImport(sb, user.id, result);
    return NextResponse.json({
      sourceId,
      staged,
      counts: result.counts,
      sources: result.sources,
      linkedin: result.linkedin,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al importar" }, { status: 500 });
  }
}
