import type { SupabaseClient } from "@supabase/supabase-js";

/* ============================================================================
   Recuentos reales del staging.

   EL PROBLEMA QUE RESUELVE. StagingScreen contaba aceptados y descartados en
   estado de React. Al desmontar la pantalla (irse al master y volver) esos
   contadores volvían a 0 y la barra de progreso se pintaba vacía AUNQUE los
   items ya estuvieran promovidos en la base. El trabajo nunca se perdió —vive
   en `staged_items.status`— pero la UI lo leía mal, que para quien mira es lo
   mismo que perderlo.

   LA FUENTE DE VERDAD ES EL SERVIDOR. `staged_items.status` ya distingue
   'pending' | 'accepted' | 'rejected' (lo escriben promoteStaged y el POST de
   /api/staging/accept). Aquí solo se CUENTA lo que ya hay; no se deriva, no se
   estima, no se rellena con ceros de cortesía: si la consulta falla, revienta.

   Vive fuera de queries.ts a propósito: ese archivo es compartido y esto es
   material nuevo.
   ============================================================================ */

type SB = SupabaseClient;

export interface StagingCounts {
  /** staged_items con status='accepted' — ya están en el master. */
  accepted: number;
  /** staged_items con status='rejected' — revisados y descartados. */
  rejected: number;
}

/** Estado inicial y de reinicio. Congelado: se comparte por referencia. */
export const ZERO_COUNTS: StagingCounts = Object.freeze({ accepted: 0, rejected: 0 });

/**
 * Cuenta los staged_items YA RESUELTOS del usuario, por estado. RLS por
 * auth.uid() más el filtro explícito de user_id, igual que getStaging.
 * Usa `head:true` con `count:'exact'`: no baja ni una fila, solo el número.
 */
export async function getStagingCounts(sb: SB, userId: string): Promise<StagingCounts> {
  const q = (status: string) =>
    sb.from("staged_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", status);

  const [accepted, rejected] = await Promise.all([q("accepted"), q("rejected")]);
  if (accepted.error) throw new Error(accepted.error.message);
  if (rejected.error) throw new Error(rejected.error.message);

  return { accepted: accepted.count ?? 0, rejected: rejected.count ?? 0 };
}

export interface StagingProgress extends StagingCounts {
  /** Items que siguen en la cola (los que la pantalla tiene en pantalla). */
  pending: number;
  /** pending + accepted + rejected: todo lo que pasó por el staging. */
  total: number;
  /** Anchuras de la barra, ya en porcentaje [0..100]. */
  acceptedPct: number;
  rejectedPct: number;
}

/**
 * Combina lo que dijo el servidor con lo hecho en ESTA sesión desde la última
 * lectura, y saca las anchuras de la barra.
 *
 * `base` es la foto del servidor en el último GET; `session` es el delta de
 * clics posteriores (aceptar/descartar ya escribieron en la base, pero esa foto
 * es de antes). Sumarlos es exacto mientras el delta se reinicie en cada
 * recarga — que es lo que hace load() en StagingScreen.
 *
 * Se blinda contra negativos y contra total=0 (barra a 0%, no NaN).
 */
export function stagingProgress(base: StagingCounts, session: StagingCounts, pendingNow: number): StagingProgress {
  const nn = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  const accepted = nn(base.accepted) + nn(session.accepted);
  const rejected = nn(base.rejected) + nn(session.rejected);
  const pending = nn(pendingNow);
  const total = accepted + rejected + pending;
  return {
    accepted,
    rejected,
    pending,
    total,
    acceptedPct: total ? (accepted / total) * 100 : 0,
    rejectedPct: total ? (rejected / total) * 100 : 0,
  };
}
