import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geminiApiKey } from "@/lib/extract/llm";
import { ensureMaster } from "@/lib/db/queries";
import { sourceKindFor, fileKindFromName, isOwnedPath } from "@/lib/db/sources";
import { getUserLlmKey } from "@/lib/account/byok";
import { crearClienteDeTrabajo } from "../_motor/cliente";
import { avanzarTrabajo, depsReales } from "../_motor/motor";

// Fluid Compute: esperar el I/O del modelo no cuenta como Active CPU, así que un
// maxDuration generoso sale barato. 300 s es el TOPE en Hobby (comprobado en las
// docs de Vercel, no supuesto), y es también el techo de lo que `after()` puede
// seguir trabajando tras responder. Ver la cabecera de _motor/motor.ts.
export const runtime = "nodejs";
export const maxDuration = 300;

/** Referencia a un archivo YA subido a Storage por el navegador (bucket 'sources'). */
interface FileRef {
  path?: string;
  name?: string;
  kind?: string;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * POST /api/import/job — CREA EL TRABAJO Y DEVUELVE SU ID ENSEGUIDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Lo que hace esta ruta ANTES de responder es solo escribir filas: un lote y una
 * fila por fuente, todas en 'pending'. Eso son milisegundos. El trabajo de
 * verdad —descargar, transcribir, extraer— arranca en `after()`, o sea DESPUÉS
 * de que la respuesta se haya ido, y sigue mientras quede presupuesto de
 * invocación.
 *
 * ★ EL ESTADO NO VIVE EN LA PESTAÑA. Vive en `ingestion_sources.status` y en
 *   `ingestion_events`. Por eso cerrar la pestaña, cambiar de pantalla o volver
 *   mañana no cancela ni reinicia nada: el cliente OBSERVA lo que ya está
 *   escrito y, si ve el trabajo en pausa, pide `avanzar`.
 *
 * ★ UNA FILA POR FUENTE, DESDE EL MINUTO CERO. Es lo que arregla el «extraída ·
 *   0 items» de las capturas: los items de una fuente se escriben contra ESA
 *   fuente porque cada una se extrae por separado. Antes se concatenaba todo,
 *   se colgaban los items de una única fila kind='paste' y las fuentes de
 *   archivo se registraban después, vacías.
 * ════════════════════════════════════════════════════════════════════════════
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
    return NextResponse.json(
      { error: "Pega un poco más de texto (al menos un par de frases)." },
      { status: 400 },
    );
  }

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  // BYOK: la clave del usuario (descifrada, solo servidor) o la del servidor.
  const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
  if (!byok && !geminiApiKey()) {
    return NextResponse.json(
      { error: "Falta configurar la clave de IA (BYOK o GEMINI_API_KEY del servidor)." },
      { status: 503 },
    );
  }

  // El token con el que trabajará el motor DESPUÉS de responder. Se coge aquí,
  // dentro del ámbito de la petición: en `after()` las cookies ya no se pueden
  // tocar (ver _motor/cliente.ts).
  const {
    data: { session },
  } = await sb.auth.getSession();
  const accessToken = session?.access_token;

  const warnings: string[] = [];

  /* ── 1 · el lote ES el trabajo ─────────────────────────────────────────── */
  await ensureMaster(sb, user.id);
  const { data: lote, error: loteErr } = await sb
    .from("ingestion_batches")
    .insert({ user_id: user.id })
    .select("id")
    .single();
  if (loteErr || !lote) {
    return NextResponse.json({ error: `No se pudo crear el trabajo: ${loteErr?.message ?? "sin id"}` }, { status: 500 });
  }
  const jobId = lote.id as string;

  /* ── 2 · una fila por fuente, todas 'pending' ──────────────────────────── */
  const filas: Record<string, unknown>[] = [];

  if (text.length >= 20) {
    filas.push({
      user_id: user.id,
      batch_id: jobId,
      kind: "paste",
      // ⚠ SIN NOMBRE A PROPÓSITO. Poner aquí «Texto pegado» sería meter copy en
      // español dentro de la base: un usuario en inglés vería su log en dos
      // idiomas. La etiqueta la pone la interfaz, traducida, cuando ve que la
      // fuente no trae nombre propio (`LineaFuente.nombrado`).
      original_name: null,
      status: "pending",
      // El texto pegado ya ES su raw_text: no hay nada que descargar después.
      raw_text: text,
      raw_text_is_transcription: false,
    });
  }

  for (const ref of fileRefs) {
    const path = typeof ref.path === "string" ? ref.path : "";
    const name = (typeof ref.name === "string" && ref.name) || (path.split("/").pop() ?? "archivo");
    // El tipo se decide por el NOMBRE (misma lista que la interfaz ofrece), no
    // por lo que diga el cliente: un `kind` de fuera no puede elegir el lector.
    const kind = fileKindFromName(name, undefined);

    if (!kind || !path) {
      warnings.push(`«${name}»: referencia de archivo inválida (tipo o ruta).`);
      continue;
    }
    // Defensa en profundidad: la RLS del bucket ya lo exige.
    if (!isOwnedPath(path, user.id)) {
      warnings.push(`«${name}»: ruta no autorizada.`);
      continue;
    }

    filas.push({
      user_id: user.id,
      batch_id: jobId,
      kind: sourceKindFor(kind),
      original_name: name,
      storage_path: path,
      status: "pending",
      raw_text_is_transcription: kind === "image",
    });
  }

  if (!filas.length) {
    return NextResponse.json(
      { error: "No hay ninguna fuente legible en lo que enviaste." + (warnings.length ? " " + warnings.join(" ") : "") },
      { status: 422 },
    );
  }

  // Se insertan de una vez PERO conservando el orden: `created_at` tiene default
  // now() y un insert masivo puede dar el mismo instante a todas, así que el
  // desempate del orden lo hace `derivarProgreso` por id. El «3 de 16» no baila.
  const { error: srcErr } = await sb.from("ingestion_sources").insert(filas);
  if (srcErr) {
    return NextResponse.json({ error: `No se pudieron registrar las fuentes: ${srcErr.message}` }, { status: 500 });
  }

  /* ── 3 · el trabajo arranca DESPUÉS de responder ───────────────────────── */
  if (accessToken) {
    after(async () => {
      try {
        const bg = crearClienteDeTrabajo(accessToken);
        await avanzarTrabajo(bg, user.id, jobId, depsReales(bg, byok));
      } catch {
        // El motor ya escribe el fallo de cada fuente en su fila y en sus
        // eventos. Lo que se pierda aquí lo recoge el siguiente `avanzar`: el
        // trabajo queda en pausa, nunca en un estado que mienta.
      }
    });
  } else {
    // Sin token no se puede trabajar en segundo plano con la RLS puesta. El
    // trabajo queda creado y en pausa: el observador lo empujará con `avanzar`,
    // que sí trae sesión. Se dice, no se calla.
    warnings.push("La sesión no permitió arrancar en segundo plano: el trabajo empezará al observarlo.");
  }

  return NextResponse.json({
    jobId,
    fuentes: filas.length,
    warnings,
  });
}
