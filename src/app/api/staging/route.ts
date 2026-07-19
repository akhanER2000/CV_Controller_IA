import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStaging } from "@/lib/db/queries";
import { getStagingCounts } from "@/lib/db/staging-counts";
import { normalizeDateRange } from "@/lib/extract/dates";

export const runtime = "nodejs";

/**
 * Lee el staging pendiente del usuario autenticado. `?doubts=1` filtra solo los
 * items con una clasificación en duda (§C1): viñetas que quizá sean habilidades.
 *
 * Devuelve `{ items, counts: { accepted, rejected } }`:
 *  · `items`  — la cola PENDIENTE (afectada por ?doubts=1).
 *  · `counts` — cuántos staged_items del usuario están ya resueltos, por estado.
 *    NO lo toca el filtro: es el histórico completo, no la vista. Existe porque
 *    el progreso no puede vivir en estado de React — al remontar la pantalla los
 *    contadores de sesión vuelven a 0 y la barra miente sobre trabajo que sí se
 *    hizo. La barra se pinta con esto más el delta de la sesión en curso.
 */
export async function GET(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    const [items, counts] = await Promise.all([getStaging(sb, user.id), getStagingCounts(sb, user.id)]);
    const doubtsOnly = new URL(req.url).searchParams.get("doubts") === "1";
    const out = doubtsOnly ? items.filter((it) => (it.data as Record<string, unknown>)?._classDoubt) : items;
    return NextResponse.json({ items: out, counts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * Reclasifica un staged_item pendiente (§C1). Dos acciones, ambas RLS por user_id
 * y solo sobre `status='pending'`:
 *
 *  · { id, kind:'skill', group? } — «es habilidad»: transforma la viñeta al shape
 *    de habilidad { group, items:texto }, conserva la evidencia (columnas
 *    evidence_*) y su procedencia (_origin/_level/_source), limpia el parent y la
 *    duda, y guarda sourceContext (de qué rol salió, honesto).
 *  · { id, clearDoubt:true } — «es viñeta»: solo borra la marca de duda; sigue
 *    siendo viñeta.
 *
 * Nada se inventa: el texto y la evidencia no se tocan, solo el cajón.
 */
export async function PATCH(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { id?: string; kind?: string; group?: string; clearDoubt?: boolean; dates?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });

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
      const text = String(data.text ?? data.items ?? "").trim();
      const group = (typeof body.group === "string" && body.group.trim()) || "Herramientas";

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

      const newData: Record<string, unknown> = { group, items: text, _classFrom: "bullet" };
      for (const k of ["_origin", "_level", "_source"]) if (data[k] != null) newData[k] = data[k];
      if (sourceContext) newData.sourceContext = sourceContext;

      const { error: uErr } = await sb
        .from("staged_items")
        .update({ kind: "skill", data: newData, parent_staged_id: null })
        .eq("id", id)
        .eq("user_id", user.id);
      if (uErr) throw new Error(uErr.message);
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
