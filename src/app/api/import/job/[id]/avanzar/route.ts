import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserLlmKey } from "@/lib/account/byok";
import { geminiApiKey } from "@/lib/extract/llm";
import { crearClienteDeTrabajo } from "../../../_motor/cliente";
import { avanzarTrabajo, depsReales, leerEventos, leerFuentes } from "../../../_motor/motor";
import { derivarProgreso } from "@/lib/ingesta/progreso";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * POST /api/import/job/[id]/avanzar — RETOMAR UN TRABAJO EN PAUSA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta ruta es la que hace que el patrón sobreviva en Vercel. Cuando a una
 * invocación se le acaba el presupuesto (300 s como TOPE en Hobby, y `after()`
 * no regala ni un segundo más: sus promesas se cancelan con la función), el
 * trabajo queda EN PAUSA con todo lo hecho escrito. Esta llamada abre una
 * invocación NUEVA que sigue por donde iba.
 *
 * ★ ES SEGURA DE LLAMAR SIEMPRE, y eso es deliberado. Si el trabajo ya terminó,
 *   responde «terminado» sin tocar nada. Si otro trabajador está vivo, el
 *   compare-and-set sobre `status` impide que dos hagan la misma fuente y esta
 *   invocación se retira con «ocupado». Que sea inocua es lo que permite que el
 *   observador la dispare sin miedo desde cualquier pantalla.
 *
 * ★ RESPONDE YA Y SIGUE TRABAJANDO. Igual que la creación: el bucle va en
 *   `after()`. El cliente no espera a que termine — sondea la base, que es donde
 *   está la verdad.
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await ctx.params;
  if (!jobId) return NextResponse.json({ error: "Falta el id del trabajo." }, { status: 400 });

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  // El trabajo tiene que ser SUYO. La RLS ya lo garantiza (own rows), pero un
  // 404 explícito es mejor que un «terminado» de un trabajo vacío que no existe.
  const { data: lote, error: loteErr } = await sb
    .from("ingestion_batches")
    .select("id")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (loteErr) return NextResponse.json({ error: loteErr.message }, { status: 500 });
  if (!lote) return NextResponse.json({ error: "Ese trabajo no existe." }, { status: 404 });

  const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
  if (!byok && !geminiApiKey()) {
    return NextResponse.json(
      { error: "Falta configurar la clave de IA (BYOK o GEMINI_API_KEY del servidor)." },
      { status: 503 },
    );
  }

  // Estado ANTES de empujar: es lo que se le devuelve al cliente para que no
  // tenga que esperar un sondeo entero para saber si valía la pena llamar.
  const fuentes = await leerFuentes(sb, user.id, jobId);
  const eventos = await leerEventos(
    sb,
    user.id,
    fuentes.map((f) => f.id),
  );
  const progreso = derivarProgreso(jobId, fuentes, eventos, Date.now());

  if (progreso.terminado) {
    return NextResponse.json({ jobId, estado: "terminado", progreso });
  }

  const {
    data: { session },
  } = await sb.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    return NextResponse.json({ error: "La sesión no permite retomar el trabajo." }, { status: 401 });
  }

  after(async () => {
    try {
      const bg = crearClienteDeTrabajo(accessToken);
      await avanzarTrabajo(bg, user.id, jobId, depsReales(bg, byok));
    } catch {
      // Cada fuente escribe su propio fallo. Lo que muera aquí lo retoma la
      // siguiente llamada: el trabajo queda en pausa, jamás en un estado falso.
    }
  });

  return NextResponse.json({ jobId, estado: "retomando", progreso });
}
