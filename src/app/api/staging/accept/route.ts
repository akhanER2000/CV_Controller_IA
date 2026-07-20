import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { promoteStaged, getStaging, batchPlan } from "@/lib/db/queries";

export const runtime = "nodejs";

/**
 * Acepta staged_items → master (§4.1). Body: { stagedId } para uno, o
 * { verifiedOnly: true } para el lote.
 *
 * EL LOTE RESPETA DOS EJES, no uno (docs/spec/duplicados.md). «Verificado» detecta
 * INVENCIÓN, no REPETICIÓN: un duplicado está perfectamente verificado porque su
 * evidencia aparece literal en el raw_text — dos veces. Así que el lote deja
 * fuera los sospechosos de duplicado y los que tienen duda de clasificación, y
 * DEVUELVE cuántos deja fuera por cada motivo. La pantalla no los recuenta: los
 * pinta. Un número calculado dos veces son dos números que se separan.
 */
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { stagedId?: string; verifiedOnly?: boolean; reject?: boolean; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  try {
    if (body.stagedId && body.reject) {
      // Descartar: no se borra, se marca. (La papelera de 30 días es una mejora.)
      const { error } = await sb
        .from("staged_items")
        .update({ status: "rejected" })
        .eq("id", body.stagedId)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ rejected: 1 });
    }
    if (body.stagedId) {
      const id = await promoteStaged(sb, user.id, body.stagedId);
      return NextResponse.json({ promoted: 1, itemId: id });
    }
    if (body.verifiedOnly) {
      // El lote opera sobre LO QUE EL USUARIO TIENE DELANTE. Si llegó con
      // ?source=, la cola está filtrada y el botón cuenta esa fuente: promover
      // aquí todo lo verificado de todas las fuentes aceptaría en su nombre
      // items que no ha visto.
      const source = typeof body.source === "string" && body.source ? body.source : undefined;
      const pending = await getStaging(sb, user.id, source);
      const plan = batchPlan(pending);
      const excluded = { duplicates: plan.excludedDuplicates, doubts: plan.excludedDoubts };

      // ⚠ EN SERIE Y SIN TRANSACCIÓN: promoteStaged son varias escrituras por item
      // (insert en profile_items + update del staged) y supabase-js no expone
      // transacciones sin un RPC en la base. Si falla a mitad, lo que ya entró en
      // el master ENTRÓ. Antes esto devolvía 500 a secas y el usuario se quedaba
      // sin saber cuántos: se recargaba la cola, faltaban items y parecía pérdida
      // de datos. Ahora se devuelve el PARCIAL con su motivo — 200, porque los
      // promovidos son verdad y la cola tiene que reflejarlos.
      let promoted = 0;
      for (const r of plan.eligible) {
        try {
          await promoteStaged(sb, user.id, r.id);
          promoted++;
        } catch (e) {
          return NextResponse.json({
            promoted,
            excluded,
            partial: true,
            failedAt: r.id,
            remaining: plan.eligible.length - promoted,
            error: e instanceof Error ? e.message : "Error al promover",
          });
        }
      }
      return NextResponse.json({ promoted, excluded, partial: false });
    }
    return NextResponse.json({ error: "Falta stagedId o verifiedOnly." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
