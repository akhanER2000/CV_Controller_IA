import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { geminiApiKey } from "@/lib/extract/llm";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * ¿La IA está activa? Confirma (1) que la clave está cargada y con qué NOMBRE de
 * variable, y (2) que una llamada REAL a Gemini devuelve. GET /api/health/ai.
 * No requiere sesión: es un chequeo de infraestructura.
 */
export async function GET() {
  const key = geminiApiKey();
  const envVar = process.env.GEMINI_API_KEY
    ? "GEMINI_API_KEY"
    : process.env.GOOGLE_GENERATIVE_AI_API_KEY
      ? "GOOGLE_GENERATIVE_AI_API_KEY"
      : null;

  if (!key) {
    return Response.json(
      { ok: false, keyLoaded: false, reason: "No hay clave: define GEMINI_API_KEY en el entorno." },
      { status: 503 },
    );
  }

  try {
    const t0 = Date.now();
    const { text } = await generateText({
      model: createGoogleGenerativeAI({ apiKey: key })("gemini-flash-latest"),
      prompt: "Responde exactamente con la palabra: OK",
    });
    return Response.json({
      ok: true,
      keyLoaded: true,
      envVar, // el NOMBRE real que se está usando
      provider: "google (@ai-sdk/google)",
      model: "gemini-flash-latest",
      latencyMs: Date.now() - t0,
      sample: text.trim().slice(0, 24),
      anthropicKeyLoaded: !!process.env.ANTHROPIC_API_KEY, // solo para tailoring (Fase 6)
    });
  } catch (e) {
    return Response.json(
      { ok: false, keyLoaded: true, envVar, reason: e instanceof Error ? e.message.slice(0, 200) : "error" },
      { status: 502 },
    );
  }
}
