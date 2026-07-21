import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportResult } from "@/lib/extract/types";
import { normalizeLinks, type ResumeData } from "@/lib/cv/resume";
import { insertStagedTwoPhase, readMergeProposal, type MergeProposal } from "@/lib/db/sources";
import { sourceStagedCounts, ZERO_TALLY } from "@/lib/db/staging-counts";

/**
 * Capa de datos del servidor (contra el esquema 0001). Recibe el cliente de
 * Supabase por parámetro → se usa desde Route Handlers con la sesión del usuario
 * (RLS por auth.uid()). NADA entra al master sin una acción explícita del usuario
 * (§4.1): la ingesta solo puebla staged_items; promoteStaged es la aceptación.
 *
 * staged_items no tiene columnas origin/level/source (el esquema del prompt), así
 * que esos metadatos de procedencia viajan en data._origin/_level/_source y se
 * limpian al promover.
 */

type SB = SupabaseClient;

/** Garantiza el master del usuario (robusto si el trigger de alta no corrió). */
export async function ensureMaster(sb: SB, userId: string): Promise<string> {
  const { data: existing } = await sb.from("master_profiles").select("id").eq("user_id", userId).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await sb
    .from("master_profiles")
    .insert({ user_id: userId, name: "Mi carrera" })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo crear el master: ${error.message}`);
  return data.id as string;
}

/**
 * Persiste el resultado de la ingesta: una fuente + los staged_items. El armado
 * de las filas (dos fases, ids propios y la sospecha de duplicado resuelta a ids
 * reales) vive en db/sources.ts y es EL MISMO que usa el alta desde Fuentes.
 *
 * Antes cada writer construía su fila a mano, idénticas pero separadas: por eso
 * todo lo que se añadía en un camino se olvidaba en el otro. Ahora hay una sola
 * definición de «cómo es una fila de staging».
 */
export async function persistImport(sb: SB, userId: string, result: ImportResult): Promise<{ sourceId: string; staged: number }> {
  const { data: source, error: srcErr } = await sb
    .from("ingestion_sources")
    .insert({ user_id: userId, kind: "paste", status: "extracted", raw_text: result.rawText })
    .select("id")
    .single();
  if (srcErr) throw new Error(`Fuente: ${srcErr.message}`);
  const sourceId = source.id as string;

  const staged = await insertStagedTwoPhase(sb, userId, sourceId, result.staged);
  return { sourceId, staged };
}

export interface StagedItemRow {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  lang: string;
  evidence_snippet: string | null;
  evidence_verified: boolean;
  status: string;
  parent_staged_id: string | null;
  promoted_to: string | null;
  /** de qué documento salió. Lo necesita el n3 del detector y el filtro ?source=. */
  source_id: string | null;
  /** la sospecha de duplicado, cruda. Se lee con readMergeProposal (defensivo). */
  merge_proposal: unknown;
}

/**
 * Lee el staging pendiente del usuario. Baja merge_proposal y source_id: sin el
 * primero la cola no puede pintar la marca de duplicado (que es todo el punto de
 * persistirla) y sin el segundo ni el filtro por fuente ni el n3 del detector
 * tienen con qué trabajar.
 */
export async function getStaging(sb: SB, userId: string, sourceId?: string): Promise<StagedItemRow[]> {
  let q = sb
    .from("staged_items")
    .select("id,kind,data,lang,evidence_snippet,evidence_verified,status,parent_staged_id,promoted_to,source_id,merge_proposal")
    .eq("user_id", userId)
    .eq("status", "pending");
  if (sourceId) q = q.eq("source_id", sourceId);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as StagedItemRow[];
}

/* ============================================================================
   EL LOTE, CON SUS DOS EJES (§A2 · doctrina de duplicados)
   ============================================================================
   «Aceptar todo lo verificado» era el camino por el que pasaban TODOS los
   duplicados: un duplicado está perfectamente verificado — su evidencia aparece
   literal en el raw_text, aparece dos veces. Verificado y único son propiedades
   INDEPENDIENTES, y el lote tiene que respetar las dos.

   Lo mismo con la duda de clasificación: aceptar en lote una viñeta que en
   realidad es una aptitud es el mismo fallo con otro disfraz.

   PURA a propósito: los conteos que la pantalla enseña ANTES de pulsar y los que
   devuelve el endpoint DESPUÉS salen de esta misma función. Si la UI los
   calculara por su cuenta, serían dos verdades que se separan.                 */

export interface BatchPlan {
  /** los que el lote SÍ promueve, roles antes que sus viñetas */
  eligible: StagedItemRow[];
  /** verificados que se quedan fuera por sospecha de duplicado */
  excludedDuplicates: number;
  /** verificados que se quedan fuera por duda de clasificación (_classDoubt) */
  excludedDoubts: number;
}

/** ¿Este item pendiente trae una sospecha de duplicado legible? */
export function suspicionOf(row: StagedItemRow): MergeProposal | null {
  return readMergeProposal(row.merge_proposal);
}

export function batchPlan(pending: StagedItemRow[]): BatchPlan {
  const verified = pending.filter((r) => r.evidence_verified);
  let excludedDuplicates = 0;
  let excludedDoubts = 0;
  const eligible: StagedItemRow[] = [];
  for (const r of verified) {
    // Los dos ejes se cuentan por separado aunque un item caiga en los dos: cada
    // frase de la pantalla nombra un motivo real y el usuario revisa por motivo.
    const dup = suspicionOf(r) !== null;
    const doubt = Boolean((r.data as Record<string, unknown>)?._classDoubt);
    if (dup) excludedDuplicates++;
    if (doubt) excludedDoubts++;
    if (!dup && !doubt) eligible.push(r);
  }
  // promover roles antes que sus viñetas (la viñeta necesita el parent promovido)
  eligible.sort((a, b) => (a.kind === "bullet" ? 1 : 0) - (b.kind === "bullet" ? 1 : 0));
  return { eligible, excludedDuplicates, excludedDoubts };
}

function clean(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

/**
 * Promueve un staged_item al master (profile_items), conservando la procedencia.
 * Si es una viñeta, promueve antes su rol para enlazar parent_id. Marca el staged
 * como aceptado y guarda promoted_to. Es LA acción de aceptación del usuario.
 */
export async function promoteStaged(sb: SB, userId: string, stagedId: string): Promise<string> {
  const profileId = await ensureMaster(sb, userId);
  const { data: st, error } = await sb.from("staged_items").select("*").eq("id", stagedId).eq("user_id", userId).single();
  if (error) throw new Error(error.message);
  if (st.promoted_to) return st.promoted_to as string;

  let parentId: string | null = null;
  if (st.kind === "bullet" && st.parent_staged_id) {
    const { data: parent } = await sb.from("staged_items").select("promoted_to").eq("id", st.parent_staged_id).single();
    parentId = (parent?.promoted_to as string) ?? (await promoteStaged(sb, userId, st.parent_staged_id as string));
  }

  const meta = st.data as Record<string, unknown>;
  const { data: item, error: insErr } = await sb
    .from("profile_items")
    .insert({
      profile_id: profileId, user_id: userId, kind: st.kind, parent_id: parentId,
      data: clean(meta), lang: st.lang,
      origin: (meta._origin as string) ?? "extracted",
      source_id: st.source_id,
      evidence_snippet: st.evidence_snippet, evidence_verified: st.evidence_verified,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`Promover: ${insErr.message}`);

  // ⚠ merge_proposal NO viaja al master. Al aceptar, el usuario ya decidió; una
  // marca guardada en profile_items quedaría rancia al instante (y el master
  // calcula sus duplicados al vuelo, ver docs/spec/duplicados.md).
  await sb.from("staged_items").update({ status: "accepted", promoted_to: item.id }).eq("id", stagedId);
  return item.id as string;
}

/* ============================================================================
   RESOLVER UN DUPLICADO — las tres acciones del usuario (§A2)
   ============================================================================
   NINGUNA fusión ni descarte automático: esta función solo EJECUTA lo que el
   usuario acaba de pulsar con las dos versiones delante.

     · 'quedarme-con-esta'  → la otra se descarta; esta pierde la marca.
     · 'quedarme-con-la-otra' → esta se descarta; la otra pierde la marca.
     · 'fusionar'           → esta se queda con los campos ELEGIDOS uno a uno, se
       queda además con las viñetas de la otra (la fecha de LinkedIn con el
       detalle narrativo del cuestionario es literalmente el caso de uso), y la
       otra se descarta.

   ⚠ EL CANDADO: en 'fusionar', cada valor tiene que venir de UNA DE LAS DOS
     versiones. No es paranoia de tipos — es la regla de producto: la fusión
     ELIGE, no redacta. Un campo que no case con ninguno de los dos lados es
     texto inventado entrando al master por la puerta de atrás, y aquí se para.  */

export type DuplicateAction = "keep-this" | "keep-other" | "merge";

export interface ResolveResult {
  action: DuplicateAction;
  /** el staged que sobrevive en la cola */
  kept: string;
  /** el staged que queda descartado (status 'rejected'), o null si no había pareja */
  rejected: string | null;
  /** viñetas reparentadas al superviviente (solo en 'fusionar') */
  movedBullets: number;
}

/** La otra versión del par, tal como se lee para comparar y resolver. */
interface OtraVersion {
  id: string;
  data: Record<string, unknown>;
  merge_proposal: unknown;
}

const mismo = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Descarta un staged pendiente y arrastra sus viñetas (una viñeta huérfana no se acepta sola). */
async function rejectWithBullets(sb: SB, userId: string, id: string): Promise<void> {
  const base = () => sb.from("staged_items").update({ status: "rejected" }).eq("user_id", userId).eq("status", "pending");
  const { error } = await base().eq("id", id);
  if (error) throw new Error(error.message);
  const { error: bErr } = await base().eq("parent_staged_id", id);
  if (bErr) throw new Error(bErr.message);
}

export async function resolveDuplicate(
  sb: SB,
  userId: string,
  stagedId: string,
  action: DuplicateAction,
  fields?: Record<string, unknown>,
): Promise<ResolveResult> {
  const { data: esta, error } = await sb
    .from("staged_items")
    .select("id,kind,data,merge_proposal,status")
    .eq("id", stagedId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!esta) throw new Error("Item no encontrado o ya procesado.");

  const sospecha = readMergeProposal(esta.merge_proposal);
  const otroId = sospecha?.duplicateOf ?? null;

  let otra: OtraVersion | null = null;
  if (otroId) {
    const { data } = await sb
      .from("staged_items")
      .select("id,data,merge_proposal")
      .eq("id", otroId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    otra = (data as OtraVersion | null) ?? null;
  }

  const datosEsta = (esta.data as Record<string, unknown>) ?? {};
  const datosOtra = otra?.data ?? {};

  // Quitar la marca es parte de resolver: si se quedara, la cola seguiría
  // avisando de un duplicado que el usuario ya zanjó.
  const limpiaEsta = () =>
    sb.from("staged_items").update({ merge_proposal: null }).eq("id", stagedId).eq("user_id", userId);
  /** solo se limpia la marca de la otra si apuntaba A ESTA (podría apuntar a una tercera). */
  const limpiaOtra = async () => {
    if (!otra) return;
    if (readMergeProposal(otra.merge_proposal)?.duplicateOf !== stagedId) return;
    await sb.from("staged_items").update({ merge_proposal: null }).eq("id", otra.id).eq("user_id", userId);
  };

  if (action === "keep-other") {
    if (!otra) throw new Error("La otra versión ya no está en la cola.");
    await limpiaOtra();
    await rejectWithBullets(sb, userId, stagedId);
    return { action, kept: otra.id, rejected: stagedId, movedBullets: 0 };
  }

  if (action === "keep-this") {
    const { error: uErr } = await limpiaEsta();
    if (uErr) throw new Error(uErr.message);
    if (otra) await rejectWithBullets(sb, userId, otra.id);
    return { action, kept: stagedId, rejected: otra?.id ?? null, movedBullets: 0 };
  }

  // fusionar
  if (!otra) throw new Error("La otra versión ya no está en la cola.");
  const elegidos = fields ?? {};
  const fusion: Record<string, unknown> = { ...datosEsta };
  for (const [k, v] of Object.entries(elegidos)) {
    if (k.startsWith("_")) continue; // la procedencia no se elige: se conserva
    if (!mismo(v, datosEsta[k]) && !mismo(v, datosOtra[k])) {
      throw new Error(`El campo «${k}» no coincide con ninguna de las dos versiones: la fusión elige, no redacta.`);
    }
    fusion[k] = v;
  }

  const { error: fErr } = await sb
    .from("staged_items")
    .update({ data: fusion, merge_proposal: null })
    .eq("id", stagedId)
    .eq("user_id", userId);
  if (fErr) throw new Error(fErr.message);

  // Las viñetas de la descartada pasan al superviviente ANTES de descartarla:
  // fusionar es quedarse con lo de las dos, y el detalle narrativo vive ahí.
  const { data: hijas } = await sb
    .from("staged_items")
    .select("id")
    .eq("parent_staged_id", otra.id)
    .eq("user_id", userId)
    .eq("status", "pending");
  const movedBullets = (hijas ?? []).length;
  if (movedBullets) {
    const { error: mErr } = await sb
      .from("staged_items")
      .update({ parent_staged_id: stagedId })
      .eq("parent_staged_id", otra.id)
      .eq("user_id", userId)
      .eq("status", "pending");
    if (mErr) throw new Error(mErr.message);
  }
  await rejectWithBullets(sb, userId, otra.id);
  return { action, kept: stagedId, rejected: otra.id, movedBullets };
}

interface ProfileItemRow {
  id: string;
  kind: string;
  parent_id: string | null;
  data: Record<string, unknown>;
  sort_order: number;
}

const i18n = (s: string) => ({ es: s, en: s });

/**
 * Arma el ResumeData (para el PDF) a partir de los profile_items del master.
 * Todo en español; en = es (paridad se genera con traducción, aún no cableada).
 * variantId se ignora por ahora → renderiza el master completo.
 */
/* ============================================================================
   LECTURA — las 4 pantallas (Dashboard/Master/Variantes/Fuentes) leen de aquí.
   Todo con la sesión del usuario (RLS por auth.uid()): una cuenta nueva devuelve
   listas vacías, nunca la demo. La demo (Diego Gatica) SOLO existe en modo local
   sin Supabase (src/lib/store/seed.ts), jamás en estas consultas.
   ============================================================================ */

/** Un item del master, tal como lo pinta MasterScreen (con su procedencia). */
export interface MasterItem {
  id: string;
  kind: string;
  parentId: string | null;
  data: Record<string, unknown>;
  origin: string;
  evidenceSnippet: string | null;
  evidenceVerified: boolean;
  sortOrder: number;
}

/** profile_items del usuario, en orden de lectura (sort_order → created_at). */
export async function getMasterItems(sb: SB, userId: string): Promise<MasterItem[]> {
  const { data, error } = await sb
    .from("profile_items")
    .select("id,kind,parent_id,data,origin,evidence_snippet,evidence_verified,sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    parentId: (r.parent_id as string | null) ?? null,
    data: (r.data as Record<string, unknown>) ?? {},
    origin: (r.origin as string) ?? "manual",
    evidenceSnippet: (r.evidence_snippet as string | null) ?? null,
    evidenceVerified: Boolean(r.evidence_verified),
    sortOrder: (r.sort_order as number) ?? 0,
  }));
}

/**
 * Crea un profile_item MANUAL (origin='manual') en el master del usuario. Es la
 * acción explícita de "añadir a mano" (p. ej. el bloque de contacto/basics cuando
 * la cuenta no tiene uno). NADA de procedencia externa: el origen manual es el más
 * verificable. Devuelve el item recién creado en el shape de MasterItem.
 */
export async function createMasterItem(
  sb: SB,
  userId: string,
  kind: string,
  data: Record<string, unknown>,
): Promise<MasterItem> {
  const profileId = await ensureMaster(sb, userId);
  const { data: row, error } = await sb
    .from("profile_items")
    .insert({ profile_id: profileId, user_id: userId, kind, data, origin: "manual" })
    .select("id,kind,parent_id,data,origin,evidence_snippet,evidence_verified,sort_order")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: row.id as string,
    kind: row.kind as string,
    parentId: (row.parent_id as string | null) ?? null,
    data: (row.data as Record<string, unknown>) ?? {},
    origin: (row.origin as string) ?? "manual",
    evidenceSnippet: (row.evidence_snippet as string | null) ?? null,
    evidenceVerified: Boolean(row.evidence_verified),
    sortOrder: (row.sort_order as number) ?? 0,
  };
}

/** Momento de última modificación del master (para "variante desactualizada"). */
async function masterUpdatedAt(sb: SB, userId: string): Promise<string | null> {
  const { data } = await sb
    .from("master_profiles")
    .select("updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.updated_at as string | undefined) ?? null;
}

/** Una variante, tal como la lista VariantesScreen/Dashboard. */
export interface VariantSummary {
  id: string;
  name: string;
  targetTitle: string | null;
  lang: string;
  updatedAt: string;
  masterSeenAt: string;
  /** el master cambió después de la última vez que esta variante lo "vio" */
  outdated: boolean;
}

/** cv_variants no archivadas del usuario, con la señal de desactualización. */
export async function listVariants(sb: SB, userId: string): Promise<VariantSummary[]> {
  const [{ data, error }, mUpdated] = await Promise.all([
    sb
      .from("cv_variants")
      .select("id,name,target_title,lang,updated_at,master_seen_at")
      .eq("user_id", userId)
      .eq("archived", false)
      .order("updated_at", { ascending: false }),
    masterUpdatedAt(sb, userId),
  ]);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const masterSeenAt = (r.master_seen_at as string) ?? (r.updated_at as string);
    const outdated = mUpdated ? new Date(masterSeenAt).getTime() < new Date(mUpdated).getTime() : false;
    return {
      id: r.id as string,
      name: (r.name as string) ?? "Variante",
      targetTitle: (r.target_title as string | null) ?? null,
      lang: (r.lang as string) ?? "es",
      updatedAt: r.updated_at as string,
      masterSeenAt,
      outdated,
    };
  });
}

/* ============================================================================
   INFORME POR FUENTE (bloque D · §1·§2) — que el usuario CONFÍE en que una fuente
   entró completa sin auditar el master a mano.

   La tarjeta de una fuente tiene que decir, con NÚMEROS REALES del servidor:
   cuánto se leyó, cuántas llamadas al modelo costó, cuántos items produjo y
   cuántos de ellos quedaron dudosos (posible duplicado / sin evidencia). Cada
   cifra tiene su procedencia; la que no se pueda leer de datos reales NO se pinta
   (mejor tres ciertas que cinco con una inventada).

   De dónde sale cada número:
     · llamadas / tokens / caracteres leídos → `ingestion_events` (telemetría por
       ingesta que escribe db/telemetria.ts). Ver `resumirEventos`.
     · items / posibles duplicados / sin evidencia → recuento por fuente del
       staging (db/staging-counts.ts · sourceStagedCounts).
     · estado / fallo / transcripción / páginas → columnas de la propia fuente.
   ============================================================================ */

/* Claves de i18n con que db/telemetria.ts (EVENTO.*) escribe en `ingestion_events`.
   Se REPLICAN aquí como constantes de LECTURA en vez de importar telemetria: ese
   módulo es `server-only` y este lector se prueba en aislamiento. Si allá cambian,
   `tests/informe-fuente.test.ts` —que ancla estos strings contra EVENTO— lo grita. */
export const EVENTO_CONSUMO = "ingesta.evento.consumo";
export const EVENTO_CONTEXTO = "ingesta.evento.contexto";

/** Lo que la telemetría sabe de CÓMO se leyó una fuente. `null` donde no hay dato:
 *  GitHub no llama al modelo (no hay consumo), una fuente vieja no tiene eventos. */
export interface SourceTelemetry {
  /** caracteres del documento leído (consumo.caracteresDocumento). null si no hay evento. */
  charsRead: number | null;
  /** llamadas REALES al modelo. null si la fuente no pasó por IA (p. ej. GitHub). */
  aiCalls: number | null;
  /** tokens entrada+salida. null si no hay telemetría de consumo. */
  tokens: number | null;
  /** true si alguna llamada no reportó `usage`: los tokens son un SUELO, van con «≥». */
  tokensAreFloor: boolean;
  /** la extracción salió entera de la caché por hash (coste cero). */
  fromCache: boolean;
  /** secciones que se leyeron como CONTEXTO y NO se mandaron a extraer, con nombre.
   *  Es «qué quedó fuera», persistido: la regla capital hecha durable, no un aviso
   *  que se ve una vez y se pierde. */
  contextSections: { titulo: string; caracteres: number }[];
}

/** Telemetría en blanco: una fuente sin eventos no inventa números, los deja en null. */
const TELEMETRIA_VACIA: SourceTelemetry = Object.freeze({
  charsRead: null,
  aiCalls: null,
  tokens: null,
  tokensAreFloor: false,
  fromCache: false,
  contextSections: [],
});

const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Una fila cruda de ingestion_events, tal como se baja para el informe. */
export interface EventoRow {
  /** bigserial: mayor id ⟺ evento más reciente (para quedarnos con la última ingesta). */
  id: number;
  sourceId: string;
  message: string;
  payload: unknown;
}

/**
 * Resume los eventos de ingesta por fuente. PURO y determinista (se prueba sin
 * Supabase). De cada fuente se queda con el consumo y el contexto MÁS RECIENTES
 * (mayor id): un «releer» añade eventos nuevos, y lo que la tarjeta debe reflejar
 * es la última lectura —la que produjo el staging actual—, no la suma de todas.
 * Parseo DEFENSIVO: un payload con otra forma degrada a null/vacío, no revienta.
 */
export function resumirEventos(rows: EventoRow[]): Record<string, SourceTelemetry> {
  // último consumo y último contexto por fuente (mayor id gana).
  const consumo = new Map<string, { id: number; p: Record<string, unknown> }>();
  const contexto = new Map<string, { id: number; p: Record<string, unknown> }>();
  for (const r of rows) {
    if (!r.sourceId || !esObj(r.payload)) continue;
    const bucket = r.message === EVENTO_CONSUMO ? consumo : r.message === EVENTO_CONTEXTO ? contexto : null;
    if (!bucket) continue;
    const prev = bucket.get(r.sourceId);
    if (!prev || r.id > prev.id) bucket.set(r.sourceId, { id: r.id, p: r.payload });
  }

  const out: Record<string, SourceTelemetry> = {};
  const ids = new Set<string>([...consumo.keys(), ...contexto.keys()]);
  for (const id of ids) {
    const c = consumo.get(id)?.p;
    const x = contexto.get(id)?.p;

    const tokensEntrada = c ? num(c.tokensEntrada) : null;
    const tokensSalida = c ? num(c.tokensSalida) : null;
    const tokens =
      tokensEntrada === null && tokensSalida === null ? null : (tokensEntrada ?? 0) + (tokensSalida ?? 0);

    const secciones = Array.isArray(x?.secciones) ? x!.secciones : [];
    const contextSections = secciones
      .filter(esObj)
      .map((s) => ({ titulo: typeof s.titulo === "string" ? s.titulo : "", caracteres: num(s.caracteres) ?? 0 }));

    out[id] = {
      charsRead: c ? num(c.caracteresDocumento) : null,
      aiCalls: c ? num(c.llamadas) : null,
      tokens,
      tokensAreFloor: c ? (num(c.llamadasSinUso) ?? 0) > 0 : false,
      fromCache: c ? c.desdeCache === true : false,
      contextSections,
    };
  }
  return out;
}

/** Baja los eventos de ingesta del usuario y los resume por fuente (RLS own rows). */
async function readIngestaEventos(sb: SB, userId: string): Promise<Record<string, SourceTelemetry>> {
  const { data, error } = await sb
    .from("ingestion_events")
    .select("id,source_id,message,payload")
    .eq("user_id", userId)
    .in("message", [EVENTO_CONSUMO, EVENTO_CONTEXTO]);
  if (error) throw new Error(error.message);
  const rows: EventoRow[] = (data ?? []).map((r) => ({
    id: Number(r.id),
    sourceId: (r.source_id as string) ?? "",
    message: (r.message as string) ?? "",
    payload: r.payload,
  }));
  return resumirEventos(rows);
}

/** Una fuente de ingesta CON SU INFORME, tal como la lista FuentesScreen/Dashboard. */
export interface SourceSummary {
  id: string;
  kind: string;
  originalName: string | null;
  sourceUrl: string | null;
  status: string;
  pageCount: number | null;
  createdAt: string;
  /** motivo del fallo (columna `error`). Se rellena de verdad y hasta hoy NO se
   *  enseñaba: una fuente que dice «falló» tenía el porqué a un select de distancia. */
  error: string | null;
  /** raw_text es una TRANSCRIPCIÓN del LLM (captura/escaneo), no texto extraído.
   *  Distingue «7.200 caracteres de un PDF» de «7.200 transcritos de una imagen». */
  isTranscription: boolean;
  /** caracteres del documento, como número plano. Se CONSERVA en el contrato porque
   *  el Panel (DashboardScreen, fuera de esta frontera) lo lee para su tarjeta de
   *  fuentes. Ahora sale de la telemetría (charsRead), NO de bajar raw_text: 0 si no
   *  hay telemetría (p. ej. GitHub). El informe de Fuentes usa `charsRead` (que
   *  distingue «0 real» de «sin dato»); este campo es solo para el consumidor viejo. */
  rawTextLength: number;
  // ── Informe (telemetría). null ⟺ no hay dato real; la tarjeta no lo pinta. ──
  charsRead: number | null;
  aiCalls: number | null;
  tokens: number | null;
  tokensAreFloor: boolean;
  fromCache: boolean;
  contextSections: { titulo: string; caracteres: number }[];
  // ── Informe (staging). Siempre conocidos (0 incluido). ──
  itemsExtracted: number;
  pending: number;
  possibleDuplicates: number;
  withoutEvidence: number;
}

/**
 * ingestion_sources del usuario (más recientes primero), CON su informe.
 *
 * ★ ARREGLO DE RENDIMIENTO. Antes esta consulta hacía `select(...,raw_text,...)`
 *   solo para calcular `raw_text.length` en memoria: bajaba el CORPUS ENTERO del
 *   usuario —cientos de KB por fuente— en cada carga de Fuentes, para mostrar un
 *   número. Ahora `raw_text` NO se baja: los «caracteres leídos» salen de la
 *   telemetría (consumo.caracteresDocumento, que ES raw_text.length medido en la
 *   ingesta), y el resto del informe de dos consultas de columnas minúsculas. La
 *   pantalla deja de arrastrar el CV de nadie para pintar una cifra.
 */
export async function listSources(sb: SB, userId: string): Promise<SourceSummary[]> {
  const [srcRes, telemetria, tally] = await Promise.all([
    sb
      .from("ingestion_sources")
      .select("id,kind,original_name,source_url,status,page_count,raw_text_is_transcription,error,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    readIngestaEventos(sb, userId),
    sourceStagedCounts(sb, userId),
  ]);
  if (srcRes.error) throw new Error(srcRes.error.message);
  return (srcRes.data ?? []).map((r) => {
    const id = r.id as string;
    const tel = telemetria[id] ?? TELEMETRIA_VACIA;
    const t = tally[id] ?? ZERO_TALLY;
    return {
      id,
      kind: (r.kind as string) ?? "paste",
      originalName: (r.original_name as string | null) ?? null,
      sourceUrl: (r.source_url as string | null) ?? null,
      status: (r.status as string) ?? "pending",
      pageCount: (r.page_count as number | null) ?? null,
      createdAt: r.created_at as string,
      error: (r.error as string | null) ?? null,
      isTranscription: Boolean(r.raw_text_is_transcription),
      rawTextLength: tel.charsRead ?? 0,
      charsRead: tel.charsRead,
      aiCalls: tel.aiCalls,
      tokens: tel.tokens,
      tokensAreFloor: tel.tokensAreFloor,
      fromCache: tel.fromCache,
      contextSections: tel.contextSections,
      itemsExtracted: t.items,
      pending: t.pending,
      possibleDuplicates: t.duplicates,
      withoutEvidence: t.withoutEvidence,
    };
  });
}

/** Recuento simple de profile_items del usuario (para copys de estado vacío). */
export async function countMasterItems(sb: SB, userId: string): Promise<number> {
  const { count } = await sb
    .from("profile_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

/** Resumen del panel: los conteos reales que gobiernan denso vs. día-1 vacío. */
export interface DashboardSummary {
  masterItems: number;
  variants: number;
  sources: number;
  outdatedVariants: number;
  pendingStaging: number;
}

export async function dashboardSummary(sb: SB, userId: string): Promise<DashboardSummary> {
  const [masterItems, variants, sourcesCount, pendingStaging] = await Promise.all([
    countMasterItems(sb, userId),
    sb.from("cv_variants").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("archived", false),
    sb.from("ingestion_sources").select("id", { count: "exact", head: true }).eq("user_id", userId),
    sb.from("staged_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending"),
    // outdated se calcula sobre la lista (necesita comparar contra el master).
  ]);
  const variantList = await listVariants(sb, userId);
  return {
    masterItems,
    variants: variants.count ?? 0,
    sources: sourcesCount.count ?? 0,
    outdatedVariants: variantList.filter((v) => v.outdated).length,
    pendingStaging: pendingStaging.count ?? 0,
  };
}

export async function buildResumeData(sb: SB, userId: string): Promise<ResumeData> {
  const { data, error } = await sb
    .from("profile_items")
    .select("id,kind,parent_id,data,sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  const items = (data ?? []) as ProfileItemRow[];
  const by = (k: string) => items.filter((i) => i.kind === k);
  const str = (o: Record<string, unknown>, key: string) => String(o[key] ?? "");

  const basicsItem = by("basics")[0]?.data ?? {};
  const summaryItem = by("summary")[0]?.data ?? {};

  const work = by("work").map((w) => ({
    company: str(w.data, "company"),
    location: i18n(str(w.data, "location")),
    title: i18n(str(w.data, "title")),
    dates: i18n(str(w.data, "dates")),
    p1: true,
    bullets: items
      .filter((b) => b.kind === "bullet" && b.parent_id === w.id)
      .map((b) => ({ p1: true, es: str(b.data, "text"), en: str(b.data, "text") })),
  }));

  // Foto y QR son OPT-IN, guardados en la data de basics. photo NUNCA es el avatar
  // de la UI (user_settings.avatar_url); es una imagen aparte que el usuario sube
  // para el CV. Aquí solo se leen si el usuario los puso explícitamente.
  const photo = str(basicsItem, "photo").trim() || undefined;
  const qrUrl = str((basicsItem.qr as Record<string, unknown>) ?? {}, "url").trim();

  return {
    basics: {
      name: str(basicsItem, "name"),
      label: i18n(str(basicsItem, "label")),
      email: str(basicsItem, "email"),
      phone: str(basicsItem, "phone"),
      location: i18n(str(basicsItem, "location")),
      links: normalizeLinks(basicsItem.links),
      summary: i18n(str(summaryItem, "text")),
    },
    photo,
    qr: qrUrl ? { url: qrUrl } : undefined,
    skills: by("skill").map((s) => ({ group: i18n(str(s.data, "group")), items: i18n(str(s.data, "items")) })),
    work,
    projects: by("project").map((p) => ({
      p1: true,
      es: [str(p.data, "name"), str(p.data, "description")].filter(Boolean).join(" — "),
      en: [str(p.data, "name"), str(p.data, "description")].filter(Boolean).join(" — "),
    })),
    education: by("education").map((e) => ({
      title: i18n(str(e.data, "degree")),
      org: str(e.data, "institution"),
      dates: i18n(str(e.data, "dates")),
      p1: true,
    })),
    // ⚠⚠ REFERENCIAS: NUNCA en el render del MASTER, y no es un olvido.
    // El opt-in de referencias es POR VARIANTE (es ahí donde el usuario decide, con
    // el aviso delante, si esta candidatura concreta las lleva). El master no es una
    // variante: no tiene dónde guardar esa decisión, así que la respuesta honesta es
    // que no las imprime. Y así, además, unos datos de terceros no pueden acabar en
    // un PDF por el camino que nadie miró. Se deja explícito —y no omitido— para que
    // se lea como una decisión y no como un hueco: buildVariantResumeData sí las trae.
    references: [],
    headings: {
      summary: i18n("Resumen"), skills: i18n("Habilidades"), work: i18n("Experiencia"),
      projects: i18n("Proyectos"), education: i18n("Educación"),
      references: i18n("Referencias"),
    },
  };
}
