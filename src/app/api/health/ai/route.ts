import {
  claveAnthropic,
  claveGemini,
  nombreVarClave,
  pingProveedor,
  pingProveedorAnthropic,
  pingModelosDeTrabajo,
  rutaDe,
  type PingDeTrabajo,
  type ResultadoPing,
} from "@/lib/ai/modelos";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * ¿La IA está activa? GET /api/health/ai. No requiere sesión: es un chequeo de
 * infraestructura con las claves DEL SERVIDOR.
 *
 * ★ Anthropic es el proveedor PRINCIPAL: se hace un ping REAL con ANTHROPIC_API_KEY.
 *   Gemini es el SECUNDARIO: también se le hace ping real con su clave. `ok` es true
 *   si responde AL MENOS uno (la app atiende con cualquiera); `degradado` dice que
 *   el principal no está. 503 solo sin NINGUNA clave; 502 si ninguno responde.
 *
 * El ping vive en `lib/ai/modelos.ts` y lo COMPARTE con /api/health/status (60 s de
 * ventana, con `edadMs`/`reutilizado` para que se vea si es fresco o reciclado).
 */
function resumen(p: ResultadoPing | null) {
  if (!p) return { keyLoaded: false as const };
  return {
    keyLoaded: true as const,
    ok: p.ok,
    model: p.modelo,
    latencyMs: p.latenciaMs,
    sample: p.muestra,
    reason: p.error,
    cached: p.reutilizado,
    checkedAgoMs: p.edadMs,
  };
}

export async function GET() {
  const keyA = claveAnthropic();
  const keyG = claveGemini();

  if (!keyA && !keyG) {
    return Response.json(
      {
        ok: false,
        keyLoaded: false,
        reason: "No hay clave: define ANTHROPIC_API_KEY (principal) o GEMINI_API_KEY (secundario) en el entorno.",
      },
      { status: 503 },
    );
  }

  const [pa, pg, trabajo] = await Promise.all([
    keyA ? pingProveedorAnthropic(keyA) : Promise.resolve(null),
    keyG ? pingProveedor(keyG) : Promise.resolve(null),
    // El ping es Haiku; extracción y redacción van en Sonnet: se prueba también.
    keyA ? pingModelosDeTrabajo(keyA) : Promise.resolve([] as PingDeTrabajo[]),
  ]);
  const principalOk = !!pa?.ok;
  const ok = principalOk || !!pg?.ok;
  const quien = principalOk ? pa! : pg?.ok ? pg : (pa ?? pg)!;

  return Response.json(
    {
      ok,
      keyLoaded: true,
      // El proveedor que atiende AHORA (el principal si responde).
      provider: principalOk ? "anthropic (@ai-sdk/anthropic)" : "google (@ai-sdk/google)",
      degradado: !principalOk,
      model: quien.modelo,
      latencyMs: quien.latenciaMs,
      sample: quien.muestra,
      reason: ok ? undefined : quien.error ?? "error",
      cached: quien.reutilizado,
      checkedAgoMs: quien.edadMs,
      envVar: nombreVarClave(), // el NOMBRE real de la variable de Gemini
      anthropicKeyLoaded: !!keyA,
      principal: { proveedor: "anthropic", envVar: keyA ? "ANTHROPIC_API_KEY" : null, ...resumen(pa) },
      // Los modelos de extracción y redacción, cada uno con si responde o no.
      modelosDeTrabajo: trabajo.map((w) => ({ tasks: w.tareas, ...resumen(w) })),
      secundario: { proveedor: "google", envVar: nombreVarClave(), ...resumen(pg) },
      // Quién redacta con las claves del servidor (sin BYOK: no hay sesión).
      tailoringModel: rutaDe("redaccion-preserva-hechos", { anthropicDisponible: principalOk }).modelo,
    },
    { status: ok ? 200 : 502 },
  );
}
