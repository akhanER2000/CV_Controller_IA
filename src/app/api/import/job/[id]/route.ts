import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EVENTO_CONSUMO, EVENTO_CONTEXTO } from "@/lib/db/queries";
import { leerEventos, leerFuentes } from "../../_motor/motor";
import { ETAPA, derivarProgreso } from "@/lib/ingesta/progreso";

export const runtime = "nodejs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * GET /api/import/job/[id] — EL CIERRE DEL TRABAJO, CON NÚMEROS CON FUENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠ ESTO NO ES EL SONDEO. El sondeo lo hace el navegador contra Supabase
 *   directamente (`ingestion_sources` e `ingestion_events` tienen RLS «own
 *   rows»): así ver el progreso no cuesta una invocación por segundo. Esta ruta
 *   se llama UNA vez, al terminar, para el panel final — que necesita agregar
 *   `staged_items` y la telemetría, y eso sí conviene hacerlo en el servidor.
 *
 * Todos los números vienen de filas reales:
 *   · counts       → el nivel de evidencia que cada staged guardó en `data._level`.
 *   · consumo      → la SUMA de los eventos de consumo de cada fuente del lote.
 *   · contexto     → las secciones que no se mandaron al modelo, con su nombre.
 *   · avisos       → lo que cada fuente registró al cerrar, más los fallos.
 * Ninguno se estima. Lo que no hay, no se pinta.
 * ════════════════════════════════════════════════════════════════════════════
 */

const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const texto = (v: unknown): string => (typeof v === "string" ? v : "");

/** Los cuatro niveles que el pipeline guarda en `data._level` (extract/types). */
type Nivel = "verified" | "partial" | "none" | "api";
const NIVELES: readonly string[] = ["verified", "partial", "none", "api"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await ctx.params;
  if (!jobId) return NextResponse.json({ error: "Falta el id del trabajo." }, { status: 400 });

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const fuentes = await leerFuentes(sb, user.id, jobId);
  if (!fuentes.length) return NextResponse.json({ error: "Ese trabajo no existe." }, { status: 404 });
  const ids = fuentes.map((f) => f.id);
  const eventos = await leerEventos(sb, user.id, ids);
  const progreso = derivarProgreso(jobId, fuentes, eventos, Date.now());

  /* ── conteos por nivel de evidencia, leídos del staging REAL ───────────── */
  const { data: staged, error: stErr } = await sb
    .from("staged_items")
    .select("data")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .in("source_id", ids);
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });

  const counts = { verified: 0, partial: 0, none: 0, api: 0, total: 0 };
  for (const row of staged ?? []) {
    const d = row.data;
    counts.total += 1;
    const lvl = esObj(d) ? texto(d._level) : "";
    // Un nivel que no reconocemos NO se cuenta como verificado. El lado seguro
    // del error es «no puedo afirmar que tenga evidencia».
    if (NIVELES.includes(lvl)) counts[lvl as Nivel] += 1;
    else counts.none += 1;
  }

  /* ── consumo: la SUMA de lo que gastó cada fuente del lote ─────────────── */
  let hayConsumo = false;
  const consumo = {
    llamadas: 0,
    tokensEntrada: 0,
    tokensSalida: 0,
    caracteresPrompt: 0,
    caracteresDocumento: 0,
    llamadasSinUso: 0,
    // `desdeCache` solo es cierto si TODAS lo fueron: basta una llamada real
    // para que decir «coste cero» sea mentira.
    desdeCache: true,
  };
  const contexto: { titulo: string; caracteres: number }[] = [];
  const avisos: string[] = [];

  for (const e of eventos) {
    if (e.message === EVENTO_CONSUMO && esObj(e.payload)) {
      hayConsumo = true;
      const p = e.payload;
      consumo.llamadas += num(p.llamadas);
      consumo.tokensEntrada += num(p.tokensEntrada);
      consumo.tokensSalida += num(p.tokensSalida);
      consumo.caracteresPrompt += num(p.caracteresPrompt);
      consumo.caracteresDocumento += num(p.caracteresDocumento);
      consumo.llamadasSinUso += num(p.llamadasSinUso);
      consumo.desdeCache = consumo.desdeCache && p.desdeCache === true;
    } else if (e.message === EVENTO_CONTEXTO && esObj(e.payload)) {
      const secs = e.payload.secciones;
      if (Array.isArray(secs)) {
        for (const s of secs) {
          if (esObj(s) && texto(s.titulo)) contexto.push({ titulo: texto(s.titulo), caracteres: num(s.caracteres) });
        }
      }
    } else if (e.message === ETAPA.lista && esObj(e.payload)) {
      const lista = e.payload.avisos;
      const nombre = texto(e.payload.nombre);
      if (Array.isArray(lista)) {
        for (const a of lista) if (texto(a)) avisos.push(nombre ? `«${nombre}»: ${texto(a)}` : texto(a));
      }
    }
  }

  // Los fallos se leen de la FILA (que es la verdad persistente), no del evento:
  // una fuente puede haber fallado sin que su evento llegara a escribirse.
  for (const f of fuentes) {
    if (f.status === "failed") {
      avisos.push(`«${(f.original_name ?? "").trim() || f.kind}»: ${f.error ?? "no se pudo leer"}`);
    }
  }

  return NextResponse.json({
    jobId,
    progreso,
    counts,
    consumo: hayConsumo ? consumo : null,
    contexto,
    avisos,
  });
}
