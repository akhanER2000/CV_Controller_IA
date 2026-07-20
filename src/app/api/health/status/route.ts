import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getUserLlmKey } from "@/lib/account/byok";
import { claveGemini, nombreVarClave, modeloDe, pingProveedor } from "@/lib/ai/modelos";
import { encryptionAvailable } from "@/lib/crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Estado de conexiones — la VERDAD, con el motivo real. GET /api/health/status.
 * Cada check LLAMA de verdad (nada de ✓ optimista) y devuelve el porqué. Cada
 * servicio está AISLADO (Promise.all + timeout propio): uno caído no tumba a los
 * demás. Requiere sesión: gemini/supabase/storage se comprueban con TU sesión.
 *
 * Tres estados por servicio:
 *   ok   — responde y hace lo que dice.
 *   warn — responde pero con una salvedad honesta (p. ej. BYOK aparcada, o una
 *          integración configurada que todavía no usa ningún código).
 *   fail — no responde / error real (con el mensaje).
 * `ok` (boolean) = "usable" (true para ok y warn); `status` da el color exacto.
 */

type Status = "ok" | "warn" | "fail";
interface Service {
  id: string;
  ok: boolean;
  status: Status;
  detail: string;
  meta?: Record<string, unknown>;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`tiempo agotado (>${ms} ms)`)), ms),
    ),
  ]);
}

/** Ejecuta un check aislado: nunca lanza; un fallo/timeout ⇒ estado `fail`. */
async function run(id: string, ms: number, fn: () => Promise<Service>): Promise<Service> {
  try {
    return await withTimeout(fn(), ms);
  } catch (e) {
    return { id, ok: false, status: "fail", detail: e instanceof Error ? e.message.slice(0, 200) : "error" };
  }
}

/** Gemini: llamada real. Reporta el modelo, la envVar efectiva y si la clave que
 *  se USARÍA es la BYOK del usuario o la del servidor. NUNCA devuelve la clave. */
async function checkGemini(sb: SupabaseClient, uid: string): Promise<Service> {
  const serverKey = claveGemini();
  const envVar = nombreVarClave();
  const modelo = modeloDe("ping-salud");

  // ¿Hay una BYOK guardada (cifrada) para este usuario? Se detecta la PRESENCIA
  // del blob "v1:…" sin devolverlo. getUserLlmKey la descifra (null si no puede).
  const { data: row } = await sb.from("user_settings").select("llm_api_key").eq("user_id", uid).maybeSingle();
  const blob = (row?.llm_api_key as string | null | undefined) ?? null;
  const hasStoredKey = !!blob && blob.startsWith("v1:");
  const byok = await getUserLlmKey(sb, uid);
  const parked = hasStoredKey && !encryptionAvailable(); // guardada pero indescifrable

  const effective = byok ?? serverKey;
  const keySource: "byok" | "servidor" | "ninguna" = byok ? "byok" : serverKey ? "servidor" : "ninguna";

  if (!effective) {
    return {
      id: "gemini",
      ok: false,
      status: "fail",
      detail: "Sin clave efectiva: define GEMINI_API_KEY en el servidor o guarda tu propia clave (BYOK).",
      meta: { model: modelo, envVar, keySource, parked },
    };
  }

  // ★ El MISMO chequeo real que /api/health/ai, compartido desde el registro de
  //   modelos. Antes cada ruta llamaba por su cuenta con el mismo prompt: una
  //   visita al panel de salud pagaba DOS veces. Sigue siendo una llamada real;
  //   `cached`/`checkedAgoMs` dicen si esta respuesta se hizo ahora o hace unos
  //   segundos. Un check optimista sería peor que ninguno.
  const ping = await pingProveedor(effective);
  const meta = {
    model: ping.modelo,
    envVar,
    keySource,
    parked,
    latencyMs: ping.latenciaMs,
    sample: ping.muestra,
    cached: ping.reutilizado,
    checkedAgoMs: ping.edadMs,
  };

  if (!ping.ok) {
    return {
      id: "gemini", ok: false, status: "fail",
      detail: ping.error ?? "El proveedor no respondió.",
      meta,
    };
  }

  if (parked) {
    return {
      id: "gemini",
      ok: true,
      status: "warn",
      detail: "Responde con la clave del servidor, pero tu clave BYOK está APARCADA: falta CORPUS_ENCRYPTION_KEY para descifrarla.",
      meta,
    };
  }
  return {
    id: "gemini",
    ok: true,
    status: "ok",
    detail: byok ? "Responde. Usa tu propia clave (BYOK)." : "Responde. Usa la clave incluida del servidor.",
    meta,
  };
}

/** Anthropic: sin red. La verdad verificada por grep — ninguna ruta la usa hoy.
 *  Presente o no, hoy no aporta nada: estado `warn` (informativo, no roto). */
function checkAnthropic(): Service {
  const present = !!process.env.ANTHROPIC_API_KEY;
  const detail = present
    ? "Clave presente, pero ningún código la usa todavía — prevista para «Adaptar a un aviso»."
    : "No configurada · opcional. Prevista para «Adaptar a un aviso»; sin uso en el código todavía.";
  return { id: "anthropic", ok: true, status: "warn", detail, meta: { present, usedInCode: false } };
}

/** GitHub: rate_limit público (sin OAuth). ok si responde; reporta el cupo. */
async function checkGithub(): Promise<Service> {
  const r = await fetch("https://api.github.com/rate_limit", {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "corpus-health" },
    cache: "no-store",
  });
  if (!r.ok) {
    return { id: "github", ok: false, status: "fail", detail: `La API respondió HTTP ${r.status}.` };
  }
  const j = (await r.json()) as { resources?: { core?: { remaining?: number; limit?: number } } };
  const core = j.resources?.core;
  return {
    id: "github",
    ok: true,
    status: "ok",
    detail: "API accesible (lectura pública sin OAuth).",
    meta: { remaining: core?.remaining ?? null, limit: core?.limit ?? null, note: "lectura pública sin OAuth" },
  };
}

/** Supabase: count head barato sobre 3 tablas clave CON tu sesión (RLS). Si una
 *  no responde, ESE es el motivo (p. ej. migración sin aplicar). */
async function checkSupabase(sb: SupabaseClient, uid: string): Promise<Service> {
  const tables = ["profile_items", "cv_variants", "ingestion_sources"] as const;
  const results = await Promise.all(
    tables.map(async (t) => {
      const { error, count } = await sb.from(t).select("id", { count: "exact", head: true }).eq("user_id", uid);
      return { table: t, ok: !error, count: count ?? null, error: error?.message ?? null };
    }),
  );
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    return {
      id: "supabase",
      ok: false,
      status: "fail",
      detail: `No respondieron: ${failed.map((f) => `${f.table} (${f.error})`).join("; ")}. ¿Migración sin aplicar?`,
      meta: { tables: results },
    };
  }
  return {
    id: "supabase",
    ok: true,
    status: "ok",
    detail: `RLS responde con tu sesión en ${tables.length} tablas clave.`,
    meta: { tables: results },
  };
}

/** Storage: list de `${uid}/` en 'sources' (limit 1). ok si el bucket responde.
 *  NO sube nada: la subida real se prueba al usar Importar. */
async function checkStorage(sb: SupabaseClient, uid: string): Promise<Service> {
  const { error } = await sb.storage.from("sources").list(uid, { limit: 1 });
  if (error) {
    return { id: "storage", ok: false, status: "fail", detail: `El bucket no respondió: ${error.message}` };
  }
  return {
    id: "storage",
    ok: true,
    status: "ok",
    detail: "Bucket accesible; la subida se prueba al usar Importar.",
  };
}

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: "Sesión requerida." }, { status: 401 });
  const uid = user.id;

  const services = await Promise.all([
    run("gemini", 15000, () => checkGemini(sb, uid)),
    run("anthropic", 2000, async () => checkAnthropic()),
    run("github", 8000, () => checkGithub()),
    run("supabase", 8000, () => checkSupabase(sb, uid)),
    run("storage", 8000, () => checkStorage(sb, uid)),
  ]);

  return Response.json({ checkedAt: new Date().toISOString(), services });
}
