import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * EL AVISO DE UNA VARIANTE (DA-AV3). Si la variante nació de «Adaptar a un aviso»,
 * el texto del aviso queda en `job_descriptions` y la variante lo enlaza por
 * `cv_variants.job_id` — las dos cosas existen desde 0001, así que no hace falta
 * migración. «Afinar con IA» lo lee para orientar el énfasis (nunca autoriza hechos).
 *
 * Ambas funciones son de mejor esfuerzo: si guardar o leer falla, la variante sigue
 * funcionando y afinar va sin aviso (se registra, no se rompe el flujo).
 */

export const MAX_AVISO_GUARDADO = 20_000;

export async function guardarAvisoDeVariante(
  sb: SupabaseClient,
  userId: string,
  variantId: string,
  texto: string,
  titulo?: string | null,
): Promise<boolean> {
  const raw = texto.trim().slice(0, MAX_AVISO_GUARDADO);
  if (raw.length < 4) return false;
  try {
    // Re-adaptar la misma variante reescribe SU aviso; no se acumulan filas huérfanas.
    const { data: v } = await sb.from("cv_variants").select("job_id").eq("id", variantId).eq("user_id", userId).maybeSingle();
    const previo = (v?.job_id as string | null | undefined) ?? null;
    if (previo) {
      const { data: upd, error: eu } = await sb
        .from("job_descriptions")
        .update({ title: (titulo ?? "").trim() || null, raw_text: raw })
        .eq("id", previo)
        .eq("user_id", userId)
        .select("id");
      if (eu) throw new Error(eu.message);
      if (upd && upd.length) return true;
    }
    const { data, error } = await sb
      .from("job_descriptions")
      .insert({ user_id: userId, title: (titulo ?? "").trim() || null, raw_text: raw })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "sin fila");
    const { error: e2 } = await sb
      .from("cv_variants")
      .update({ job_id: data.id })
      .eq("id", variantId)
      .eq("user_id", userId);
    if (e2) throw new Error(e2.message);
    return true;
  } catch (e) {
    console.error("[db/aviso] no se pudo guardar el aviso de la variante", variantId, e);
    return false;
  }
}

export async function leerAvisoDeVariante(sb: SupabaseClient, userId: string, variantId: string): Promise<string | null> {
  try {
    const { data: v, error } = await sb
      .from("cv_variants")
      .select("job_id")
      .eq("id", variantId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const jobId = (v?.job_id as string | null | undefined) ?? null;
    if (!jobId) return null;
    const { data: j, error: e2 } = await sb
      .from("job_descriptions")
      .select("raw_text")
      .eq("id", jobId)
      .eq("user_id", userId)
      .maybeSingle();
    if (e2) throw new Error(e2.message);
    const raw = String(j?.raw_text ?? "").trim();
    return raw || null;
  } catch (e) {
    console.error("[db/aviso] no se pudo leer el aviso de la variante", variantId, e);
    return null;
  }
}
