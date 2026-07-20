import { claveGemini, nombreVarClave, modeloDe, pingProveedor } from "@/lib/ai/modelos";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * ¿La IA está activa? Confirma (1) que la clave está cargada y con qué NOMBRE de
 * variable, y (2) que una llamada REAL a Gemini devuelve. GET /api/health/ai.
 * No requiere sesión: es un chequeo de infraestructura.
 *
 * ★ El chequeo real vive en `lib/ai/modelos.ts` y lo COMPARTE con
 *   /api/health/status. Antes cada ruta hacía su propia llamada con el mismo
 *   prompt trivial, así que abrir el panel de salud costaba DOS llamadas
 *   facturadas por visita. Ahora la primera paga y la segunda reutiliza durante
 *   60 s — sin dejar de ser una llamada que ocurrió de verdad: la respuesta
 *   incluye `edadMs` y `reutilizado` para que se vea si es fresca o reciclada.
 *   Un ✓ optimista habría sido peor que no tener chequeo.
 */
export async function GET() {
  const key = claveGemini();
  const envVar = nombreVarClave();

  if (!key) {
    return Response.json(
      { ok: false, keyLoaded: false, reason: "No hay clave: define GEMINI_API_KEY en el entorno." },
      { status: 503 },
    );
  }

  const ping = await pingProveedor(key);
  if (!ping.ok) {
    return Response.json(
      { ok: false, keyLoaded: true, envVar, reason: ping.error ?? "error", model: ping.modelo },
      { status: 502 },
    );
  }

  return Response.json({
    ok: true,
    keyLoaded: true,
    envVar, // el NOMBRE real que se está usando
    provider: "google (@ai-sdk/google)",
    model: ping.modelo,
    latencyMs: ping.latenciaMs,
    sample: ping.muestra,
    // Honestidad sobre el dato que se enseña: si `cached` es true, la llamada
    // ocurrió hace `checkedAgoMs` milisegundos, no ahora mismo.
    cached: ping.reutilizado,
    checkedAgoMs: ping.edadMs,
    anthropicKeyLoaded: !!process.env.ANTHROPIC_API_KEY, // solo para tailoring (Fase 6)
    tailoringModel: modeloDe("redaccion-preserva-hechos"),
  });
}
