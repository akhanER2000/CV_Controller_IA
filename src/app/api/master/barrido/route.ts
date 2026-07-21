import { NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { createClient } from "@/lib/supabase/server";
import { barrerMaster, aplicarBarrido, type Correccion, type JuezDuplicados } from "@/lib/master/barrido";
import type { DestinoVinetas } from "@/lib/db/duplicados";
import { getUserLlmKey, getUserLlmKey2 } from "@/lib/account/byok";
import { claveGemini, modeloPara } from "@/lib/ai/modelos";

export const runtime = "nodejs";
// El I/O del juez (una llamada por par candidato) no cuenta como Active CPU (02 §1).
export const maxDuration = 300;

/**
 * ★ §H · EL JUEZ DE DESEMPATE, armado con el modelo BARATO del router. Recibe DOS
 * textos de experiencia y decide IDENTIDAD (¿el mismo trabajo?), nunca redacta. Se
 * inyecta en `barrerMaster` (como variant-ai.ts recibe su LLM) para poder testear el
 * desempate con un doble. La ruta del modelo la elige `modeloPara`:
 *   · con 2ª clave (Groq) → el barato;
 *   · sin 2ª clave pero con Gemini → cae a Gemini (degrada, no rompe);
 *   · sin NINGUNA clave → no hay juez: el barrido se queda en determinista y lo dice.
 */
const JuezSchema = z.object({
  mismo_trabajo: z
    .boolean()
    .describe("true SOLO si los dos textos describen la MISMA etapa laboral (mismo trabajo real contado dos veces)."),
  porque: z.string().describe("Una frase: qué te hace pensar que son el mismo trabajo, o dos distintos."),
});

const JUEZ_SYS =
  "Eres un desempatador de DUPLICADOS en un CV. Te doy DOS descripciones de experiencia laboral del " +
  "MISMO candidato. Decide si son EL MISMO trabajo contado dos veces (misma etapa/rol real, aunque el " +
  "título, la empresa o las fechas estén escritos distinto o falten) o dos trabajos DISTINTOS.\n" +
  "★ Solo juzgas IDENTIDAD. NO redactes, NO inventes, NO fusiones: la fusión la hace otro paso y la " +
  "confirma la persona. En la duda, di que NO son el mismo (es peor fusionar dos trabajos reales que " +
  "dejar un duplicado que la persona verá igualmente).";

/** Construye el juez si hay alguna clave; si no, devuelve undefined (barrido determinista). */
async function construirJuez(sb: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<JuezDuplicados | undefined> {
  const byok = await getUserLlmKey(sb, userId);
  const key2 = (await getUserLlmKey2(sb, userId)) ?? undefined;
  const googleKey = byok ?? claveGemini();
  if (!key2 && !googleKey) return undefined; // ni 2ª clave ni Gemini → sin juez

  return async ({ aTexto, bTexto }) => {
    // La tarea barata: con key2 va a Groq; sin key2 cae a Gemini (googleKey).
    const model = modeloPara("clasificacion-barata", googleKey, key2);
    const { object } = await generateObject({
      model,
      schema: JuezSchema,
      prompt: `${JUEZ_SYS}\n\n[A]\n${aTexto}\n\n[B]\n${bTexto}`,
      temperature: 0,
    });
    return { mismoTrabajo: object.mismo_trabajo === true, porque: (object.porque ?? "").trim() };
  };
}

/**
 * BARRIDO DEL MASTER CON IA (§B). Dos verbos, dos pasos:
 *
 *   GET  /api/master/barrido → PASO 1 · ANALIZAR. Cruza el master contra las
 *        fuentes (ingestion_sources.raw_text) y devuelve { hallazgos, recorrido,
 *        resumen }. Es de SOLO LECTURA: nada se muta. El «progreso honesto» va en
 *        `recorrido`, con cifras reales de lo que se examinó (ver barrido.ts para
 *        por qué NO se sondea ingestion_events).
 *
 *   POST /api/master/barrido → PASO 2 · APLICAR. body { correcciones: Correccion[] }.
 *        Ejecuta SOLO lo que el usuario seleccionó y ajustó. La reversibilidad del
 *        lote la da la pantalla (UndoToast lo difiere): esto no corre hasta que la
 *        ventana de gracia expira, así que «deshacer» = nunca se llamó.
 *
 * ⚠ Una fusión cuyo descarte usa una variante (item_id RESTRICT) NO se aplica: sale
 *   en `bloqueadas` con el uso real. La pantalla ofrece reintentar con force. Nunca
 *   un 500 crudo, nunca un borrado a la brava.
 */
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    // El juez es opcional: si no hay clave, `construirJuez` devuelve undefined y el
    // barrido corre en DETERMINISTA (y la respuesta lo dice en `desempate`).
    const juez = await construirJuez(sb, user.id);
    const r = await barrerMaster(sb, user.id, {}, { juez });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/** Valida y normaliza UNA corrección del cliente. Devuelve null si no es válida:
 *  una corrección malformada se descarta (nunca se aplica algo que no se entiende),
 *  y el recuento de descartadas viaja en la respuesta para que no sea silencioso. */
function parseCorreccion(raw: unknown): Correccion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.tipo === "duplicado") {
    const keepId = typeof o.keepId === "string" ? o.keepId.trim() : "";
    const dropIds = Array.isArray(o.dropIds)
      ? o.dropIds.filter((x): x is string => typeof x === "string" && !!x.trim())
      : [];
    if (!keepId || dropIds.length === 0) return null;
    const vinetas: DestinoVinetas | undefined =
      o.vinetas === "reenganchar" || o.vinetas === "descartar" ? o.vinetas : undefined;
    const data =
      o.data && typeof o.data === "object" && !Array.isArray(o.data)
        ? (o.data as Record<string, string>)
        : undefined;
    return { tipo: "duplicado", keepId, dropIds, data, vinetas, force: o.force === true };
  }
  if (o.tipo === "fecha") {
    const itemId = typeof o.itemId === "string" ? o.itemId.trim() : "";
    const dates = typeof o.dates === "string" ? o.dates.trim() : "";
    if (!itemId || !dates) return null;
    const sourceId = typeof o.sourceId === "string" && o.sourceId ? o.sourceId : undefined;
    return { tipo: "fecha", itemId, dates, sourceId };
  }
  if (o.tipo === "reclasificar") {
    const itemId = typeof o.itemId === "string" ? o.itemId.trim() : "";
    const group = typeof o.group === "string" ? o.group.trim() : "";
    const items = typeof o.items === "string" ? o.items : "";
    if (!itemId || !group) return null;
    return { tipo: "reclasificar", itemId, group, items };
  }
  return null;
}

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { correcciones?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  if (!Array.isArray(body.correcciones)) {
    return NextResponse.json({ error: "Falta correcciones[]." }, { status: 400 });
  }

  const recibidas = body.correcciones.length;
  const correcciones = body.correcciones
    .map(parseCorreccion)
    .filter((c): c is Correccion => c !== null);
  if (correcciones.length === 0) {
    return NextResponse.json({ error: "Ninguna corrección válida." }, { status: 400 });
  }

  try {
    const r = await aplicarBarrido(sb, user.id, correcciones);
    // `descartadas` NO se calla: si el cliente mandó algo que no se entendió, se dice.
    return NextResponse.json({ ...r, descartadas: recibidas - correcciones.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
