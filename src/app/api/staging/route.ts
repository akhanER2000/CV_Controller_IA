import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaging, batchPlan, resolveDuplicate, type DuplicateAction } from "@/lib/db/queries";
import { getStagingCounts } from "@/lib/db/staging-counts";
import { normalizeDateRange } from "@/lib/extract/dates";

export const runtime = "nodejs";

/**
 * Lee el staging pendiente del usuario autenticado.
 *  · `?doubts=1`   — solo los items con clasificación en duda (§C1).
 *  · `?source=<id>` — solo los de esa fuente. Existía en la URL desde que Fuentes
 *    empezó a mandar «revisar esta fuente», pero NADIE lo obedecía: la pantalla
 *    enseñaba la cola entera y solo podía disculparse por escrito. Ahora filtra
 *    de verdad, que era lo que el enlace prometía desde el principio.
 *
 * Devuelve `{ items, counts, batch }`:
 *  · `items`  — la cola PENDIENTE (afectada por los filtros).
 *  · `counts` — cuántos staged_items del usuario están ya resueltos, por estado.
 *    NO lo toca el filtro: es el histórico completo, no la vista. Existe porque
 *    el progreso no puede vivir en estado de React — al remontar la pantalla los
 *    contadores de sesión vuelven a 0 y la barra miente sobre trabajo que sí se
 *    hizo. La barra se pinta con esto más el delta de la sesión en curso.
 *  · `batch`  — qué haría «aceptar todo lo verificado» AHORA: cuántos entran y
 *    cuántos quedan fuera por cada motivo. Se calcula aquí, con la misma función
 *    que ejecuta el lote (batchPlan), para que el aviso previo y el resultado no
 *    puedan discrepar.
 */
export async function GET(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    const params = new URL(req.url).searchParams;
    const source = params.get("source") ?? undefined;
    const [items, counts] = await Promise.all([
      getStaging(sb, user.id, source),
      getStagingCounts(sb, user.id),
    ]);
    const doubtsOnly = params.get("doubts") === "1";
    const out = doubtsOnly ? items.filter((it) => (it.data as Record<string, unknown>)?._classDoubt) : items;
    const plan = batchPlan(out);
    return NextResponse.json({
      items: out,
      counts,
      batch: {
        eligible: plan.eligible.length,
        excluded: { duplicates: plan.excludedDuplicates, doubts: plan.excludedDoubts },
      },
      ...(source ? { source } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/** Las tres acciones de resolución, validadas contra lo que llega del cliente. */
const ACCIONES: DuplicateAction[] = ["keep-this", "keep-other", "merge"];

/**
 * «Esto es una habilidad» sobre UN item pendiente. Sirve para dos cajones de
 * origen y por eso está extraída: la viñeta de LinkedIn que era una aptitud
 * (§C1) y el `project` que era un grupo de habilidades (§A1). Es el mismo fallo
 * en dos direcciones y merece un solo camino de salida.
 *
 * Un `project` guarda su contenido en { name, description }, no en { text }: sin
 * este reparto, mover un proyecto a Skills producía una habilidad VACÍA — se
 * perdía el dato en silencio, que es peor que no ofrecer el botón.
 */
async function reclassToSkill(
  sb: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  id: string,
  group?: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: row, error } = await sb
    .from("staged_items")
    .select("id,kind,data,parent_staged_id")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!row) return { ok: false, status: 404, error: "Item no encontrado o ya procesado." };

  const data = (row.data as Record<string, unknown>) ?? {};
  const esProyecto = row.kind === "project";
  const text = String((esProyecto ? data.description : data.text) ?? data.items ?? "").trim();
  const propuesto = (typeof group === "string" && group.trim()) || "";
  const delProyecto = esProyecto ? String(data.name ?? "").trim() : "";
  const grupo = propuesto || delProyecto || "Herramientas";

  let sourceContext = String(data.sourceContext ?? "");
  if (!sourceContext && row.parent_staged_id) {
    const { data: parent } = await sb
      .from("staged_items")
      .select("data")
      .eq("id", row.parent_staged_id as string)
      .maybeSingle();
    const pd = (parent?.data as Record<string, unknown>) ?? {};
    sourceContext = String(pd.title ?? pd.company ?? "");
  }

  const newData: Record<string, unknown> = { group: grupo, items: text, _classFrom: row.kind };
  for (const k of ["_origin", "_level", "_source"]) if (data[k] != null) newData[k] = data[k];
  if (sourceContext) newData.sourceContext = sourceContext;

  const { error: uErr } = await sb
    .from("staged_items")
    .update({ kind: "skill", data: newData, parent_staged_id: null })
    .eq("id", id)
    .eq("user_id", userId);
  if (uErr) return { ok: false, status: 500, error: uErr.message };
  return { ok: true };
}

/**
 * Reclasifica o resuelve un staged_item pendiente. Todo con RLS por user_id y
 * solo sobre `status='pending'`:
 *
 *  · { id, kind:'skill', group? } — «es habilidad»: transforma la viñeta (o el
 *    proyecto que era un grupo de aptitudes) al shape { group, items }, conserva
 *    la evidencia (columnas evidence_*) y su procedencia (_origin/_level/_source),
 *    limpia el parent y la duda, y guarda sourceContext (de qué rol salió).
 *  · { ids:[…], kind:'skill' } — lo mismo EN LOTE. Doce grupos de habilidades
 *    disfrazados de proyecto no se arreglan a doce clics.
 *  · { id, clearDoubt:true } — «es viñeta»: solo borra la marca de duda.
 *  · { id, dates } — el humano escribe la fecha que faltaba (§C2).
 *  · { id, duplicate:{ action, fields? } } — resuelve la sospecha de duplicado.
 *    Las tres acciones las decide el USUARIO con las dos versiones delante; aquí
 *    solo se ejecuta lo que pulsó.
 *
 * Nada se inventa: el texto y la evidencia no se tocan, solo el cajón.
 */
export async function PATCH(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: {
    id?: string; ids?: unknown; kind?: string; group?: string; clearDoubt?: boolean; dates?: string;
    duplicate?: { action?: string; fields?: Record<string, unknown> };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  // ── Lote: «mover todos a Skills» ──────────────────────────────────────────
  if (Array.isArray(body.ids)) {
    const ids = body.ids.filter((x): x is string => typeof x === "string" && Boolean(x));
    if (!ids.length) return NextResponse.json({ error: "Falta ids." }, { status: 400 });
    if (body.kind !== "skill") {
      return NextResponse.json({ error: "El lote solo entiende kind:'skill'." }, { status: 400 });
    }
    let updated = 0;
    const failed: string[] = [];
    for (const one of ids) {
      const r = await reclassToSkill(sb, user.id, one, body.group);
      if (r.ok) updated++;
      else failed.push(one);
    }
    // Sin transacción: se dice cuántos entraron de verdad y cuáles no.
    return NextResponse.json({ updated, kind: "skill", ...(failed.length ? { failed } : {}) });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });

  // ── Resolver un duplicado ─────────────────────────────────────────────────
  if (body.duplicate) {
    const action = ACCIONES.find((a) => a === body.duplicate?.action);
    if (!action) {
      return NextResponse.json({ error: "Acción inválida (keep-this · keep-other · merge)." }, { status: 400 });
    }
    try {
      const r = await resolveDuplicate(sb, user.id, id, action, body.duplicate.fields);
      return NextResponse.json(r);
    } catch (e) {
      // Un campo fusionado que no venía de ninguna de las dos versiones es una
      // petición mal formada, no un fallo del servidor: 400, y con el motivo.
      const msg = e instanceof Error ? e.message : "Error";
      const cliente = /no coincide|no encontrado|ya no está/.test(msg);
      return NextResponse.json({ error: msg }, { status: cliente ? 400 : 500 });
    }
  }

  try {
    // solo el pending del usuario (RLS + filtro explícito de estado)
    const { data: row, error } = await sb
      .from("staged_items")
      .select("id,kind,data,parent_staged_id,status")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return NextResponse.json({ error: "Item no encontrado o ya procesado." }, { status: 404 });

    const data = (row.data as Record<string, unknown>) ?? {};

    // «es viñeta» → solo limpia la duda
    if (body.clearDoubt) {
      const rest: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) if (k !== "_classDoubt" && k !== "_classReason") rest[k] = v;
      const { error: uErr } = await sb.from("staged_items").update({ data: rest }).eq("id", id).eq("user_id", user.id);
      if (uErr) throw new Error(uErr.message);
      return NextResponse.json({ updated: 1, cleared: true });
    }

    // «es habilidad» → transforma a skill, conservando evidencia y procedencia
    if (body.kind === "skill") {
      const r = await reclassToSkill(sb, user.id, id, body.group);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ updated: 1, kind: "skill" });
    }

    // «falta fecha» → el humano la escribe (§C2). El origen de la fecha es el
    // humano (dateByHuman), no la IA. Se normaliza y se limpian señales previas.
    if (typeof body.dates === "string") {
      const rawDates = body.dates.trim();
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (["dateMissing", "dateInvalid", "dateStart", "dateEnd", "dateCurrent", "dateByHuman"].includes(k)) continue;
        next[k] = v;
      }
      if (rawDates) {
        next.dates = rawDates;
        next.dateByHuman = true;
        const dr = normalizeDateRange(rawDates);
        if (dr.invalid) {
          next.dateInvalid = dr.invalid;
        } else if (dr.start || dr.end || dr.current) {
          if (dr.start) next.dateStart = dr.start;
          if (dr.end) next.dateEnd = dr.end;
          if (dr.current) next.dateCurrent = true;
        } else {
          next.dateMissing = true; // texto ilegible: sigue faltando, honesto
        }
      } else {
        next.dateMissing = true;
      }
      const { error: uErr } = await sb.from("staged_items").update({ data: next }).eq("id", id).eq("user_id", user.id);
      if (uErr) throw new Error(uErr.message);
      return NextResponse.json({ updated: 1, dates: rawDates });
    }

    return NextResponse.json({ error: "Nada que actualizar (usa kind:'skill', dates o clearDoubt)." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
