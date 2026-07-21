import type { SupabaseClient } from "@supabase/supabase-js";
import { readMergeProposal } from "@/lib/db/sources";

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

/* ============================================================================
   RECUENTO POR FUENTE — el eje que le faltaba a este archivo (bloque D · §4).

   La pantalla de Fuentes tiene que poder decir, por CADA tarjeta, qué produjo esa
   fuente en el staging y qué de ello quedó dudoso, SIN abrir el master. Eso pide
   dos ejes que `getStagingCounts` no tiene: el `source_id` (agrupar por fuente) y
   el estado `pending` (lo que sigue por revisar).

   ★ POR QUÉ AQUÍ NO SIRVE `count:'exact', head:true`. Ese patrón devuelve UN
   número por consulta; para un desglose por fuente haría falta una consulta por
   fuente y por eje (fuentes × 4), o un `group by` que PostgREST no expone. En su
   lugar se baja UNA vez el conjunto de columnas MINÚSCULAS que gobiernan el
   recuento —source_id, status, evidence_verified, merge_proposal— y se agrupa en
   memoria. Esto NO es el bug de rendimiento que se arregla en paralelo: aquel
   bajaba `raw_text` (cientos de KB por fuente) para medir un `.length`; esto baja
   metadatos acotados por el nº de items del staging (~cientos de filas de pocos
   bytes), nunca el corpus. La parte que decide (agrupar/contar) es PURA y se
   prueba en aislamiento; la consulta se verifica en la app.

   ★ QUÉ SE CUENTA Y POR QUÉ CON ESE ESTADO:
     · items  → TODAS las filas de la fuente (cualquier estado). Es «lo que la
       extracción PRODUJO»: un item rechazado también se extrajo. No encoge cuando
       el usuario acepta, así la cifra es estable y auditable.
     · pending / duplicates / withoutEvidence → SOLO sobre 'pending'. Un duplicado
       resuelto pierde su `merge_proposal` (doctrina §A2) y un item aceptado ya no
       es una duda abierta: contar esas dos sobre lo pendiente responde a «qué
       queda dudoso AHORA», que es la pregunta de la tarjeta.

   ★ QUÉ ES «posible duplicado»: NO «merge_proposal no es null» a secas. Una fila
   vieja puede traer un jsonb con otra forma; `readMergeProposal` (db/sources) es
   quien decide si hay sospecha LEGIBLE, igual que la cola. Contar por presencia
   cruda inflaría la cifra con basura que la cola ni pinta.
   ============================================================================ */

/** El recuento del staging de UNA fuente. Todos los números salen del servidor. */
export interface SourceStagedTally {
  /** filas de staged_items de la fuente, en cualquier estado: lo que produjo. */
  items: number;
  /** las que siguen en la cola por revisar. */
  pending: number;
  /** pendientes con una sospecha de duplicado LEGIBLE (readMergeProposal ≠ null). */
  duplicates: number;
  /** pendientes cuya evidencia NO aparece literal en el raw_text. */
  withoutEvidence: number;
}

/** El recuento a cero. Congelado: se comparte por referencia para fuentes sin staging. */
export const ZERO_TALLY: SourceStagedTally = Object.freeze({
  items: 0,
  pending: 0,
  duplicates: 0,
  withoutEvidence: 0,
});

/** Una fila de staged_items reducida a lo que el recuento necesita, ya normalizada. */
export interface StagedTallyRow {
  /** de qué fuente salió. `null` no debería pasar (source_id es NOT NULL), pero se
   *  tolera: una fila sin fuente no se atribuye a ninguna, no revienta el conteo. */
  sourceId: string | null;
  /** true ⟺ status === 'pending' (lo único que la tarjeta cuenta como «abierto»). */
  pending: boolean;
  /** true ⟺ hay evidencia verificada (evidence_verified). */
  verified: boolean;
  /** true ⟺ trae una sospecha de duplicado LEGIBLE (ya pasada por readMergeProposal). */
  suspect: boolean;
}

/**
 * Agrupa las filas por fuente y las cuenta según su estado. PURO y determinista:
 * es la aritmética que se prueba con mutantes, sin Supabase de por medio.
 */
export function bucketStagedBySource(rows: StagedTallyRow[]): Record<string, SourceStagedTally> {
  const out: Record<string, SourceStagedTally> = {};
  for (const r of rows) {
    if (!r.sourceId) continue; // sin fuente no se atribuye a ninguna tarjeta
    const t = (out[r.sourceId] ??= { items: 0, pending: 0, duplicates: 0, withoutEvidence: 0 });
    t.items += 1;
    if (!r.pending) continue; // duplicado/sin-evidencia solo cuentan sobre lo pendiente
    t.pending += 1;
    if (r.suspect) t.duplicates += 1;
    if (!r.verified) t.withoutEvidence += 1;
  }
  return out;
}

/**
 * Recuento por fuente del staging del usuario (RLS por auth.uid() + filtro
 * explícito de user_id, igual que getStaging). Baja columnas minúsculas y agrupa
 * en memoria. `merge_proposal` se pasa por readMergeProposal para que «posible
 * duplicado» signifique lo mismo aquí que en la cola.
 */
export async function sourceStagedCounts(sb: SB, userId: string): Promise<Record<string, SourceStagedTally>> {
  const { data, error } = await sb
    .from("staged_items")
    .select("source_id,status,evidence_verified,merge_proposal")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const rows: StagedTallyRow[] = (data ?? []).map((r) => ({
    sourceId: (r.source_id as string | null) ?? null,
    pending: r.status === "pending",
    verified: Boolean(r.evidence_verified),
    suspect: readMergeProposal(r.merge_proposal) !== null,
  }));
  return bucketStagedBySource(rows);
}
