import type { SupabaseClient } from "@supabase/supabase-js";
import type { StagedRow } from "@/lib/extract/types";

/**
 * Capa de datos de FUENTES (agente B). Espejo de persistImport (queries.ts) pero
 * PARAMETRIZANDO la procedencia: kind / original_name / source_url / storage_path /
 * page_count / raw_text / raw_text_is_transcription. persistImport fija kind='paste';
 * aquí cada tarjeta de Fuentes registra su fuente con su tipo real.
 *
 * NADA entra al master aquí (§4.1): solo se puebla staged_items (status 'pending').
 * La promoción sigue siendo la aceptación explícita del usuario (promoteStaged).
 *
 * IMPORTANTE: este módulo es PURO en runtime (no importa `server-only` ni ningún
 * módulo del servidor). Recibe el cliente Supabase por parámetro. Así los helpers
 * puros (detección de tipo, saneo de nombre, armado de filas de dos fases) se
 * prueban sin Supabase vivo y pueden reutilizarse desde el cliente (FuentesScreen).
 */

type SB = SupabaseClient;

/** Tipos de archivo que sabemos extraer (idéntico a extract/files FileKind). */
export type FileKind = "pdf" | "docx" | "image";

/* ============================================================================
   HELPERS PUROS — sin Supabase, testeables en aislamiento.
   ============================================================================ */

/**
 * Extensión (o MIME) → tipo de archivo soportado. `null` = no soportado (se avisa,
 * no se sube). Solo .docx OOXML (mammoth no lee el .doc binario), como extract/files.
 */
export function fileKindFromName(name: string, mime?: string): FileKind | null {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if ((mime && mime.startsWith("image/")) || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
  return null;
}

/** Clave de Storage segura: conserva la extensión, sanea el resto (como ImportarScreen). */
export function safeStorageName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "archivo";
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^a-zA-Z0-9]+/g, "").toLowerCase() : "";
  return ext ? `${base}.${ext}` : base;
}

/**
 * ¿La ruta de Storage pertenece al usuario? La RLS del bucket ya lo exige (primer
 * segmento = auth.uid()); esto es defensa en profundidad en el servidor.
 */
export function isOwnedPath(path: string, userId: string): boolean {
  return typeof path === "string" && path.startsWith(`${userId}/`);
}

/**
 * Normaliza cualquier forma de "usuario de GitHub" a un handle limpio:
 *   "dgatica" · "@dgatica" · "github.com/dgatica" · "https://github.com/dgatica/repo"
 * Devuelve `null` si no parece un usuario válido (letras/dígitos/guiones, 1–39).
 */
export function parseGithubHandle(input: string | null | undefined): string | null {
  let s = (input ?? "").trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (/^github\.com\//i.test(s)) s = s.slice("github.com/".length);
  s = (s.split(/[/?#]/)[0] ?? "").replace(/^@/, "").trim();
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(s)) return null;
  if (s.startsWith("-") || s.endsWith("-")) return null;
  return s;
}

/** source_url canónico para una fuente GitHub (sirve para releer). */
export function githubSourceUrl(handle: string): string {
  return `github.com/${handle}`;
}

/** Metadatos de procedencia con los que se crea una ingestion_source. */
export interface SourceMeta {
  kind: string; // 'paste' | 'pdf' | 'docx' | 'image' | 'url' | 'github' | 'manual'
  originalName?: string | null;
  sourceUrl?: string | null;
  storagePath?: string | null;
  pageCount?: number | null;
  rawText?: string | null;
  rawTextIsTranscription?: boolean;
  status?: string; // por defecto 'extracted'
  error?: string | null;
}

/** Fila lista para insertar en ingestion_sources (pura → testeable). */
export function sourceInsert(userId: string, meta: SourceMeta) {
  return {
    user_id: userId,
    kind: meta.kind,
    original_name: meta.originalName ?? null,
    source_url: meta.sourceUrl ?? null,
    storage_path: meta.storagePath ?? null,
    status: meta.status ?? "extracted",
    page_count: meta.pageCount ?? null,
    raw_text: meta.rawText ?? null,
    raw_text_is_transcription: meta.rawTextIsTranscription ?? false,
    error: meta.error ?? null,
  };
}

/** Procedencia que viaja en data._* (staged_items no tiene columnas origin/level/source). */
const META = (r: StagedRow) => ({ _origin: r.origin, _level: r.evidenceLevel, _source: r.sourceLabel });

/** Fila de staged_items para un item PADRE (todo lo que no es viñeta). */
export function parentRow(userId: string, sourceId: string, r: StagedRow) {
  return {
    user_id: userId,
    source_id: sourceId,
    kind: r.kind,
    data: { ...r.data, ...META(r) },
    lang: r.lang,
    evidence_snippet: r.evidenceSnippet,
    evidence_verified: r.evidenceVerified,
    status: "pending" as const,
  };
}

/** Fila de staged_items para una VIÑETA, apuntando a su rol ya insertado. */
export function bulletRow(userId: string, sourceId: string, r: StagedRow, parentStagedId: string | null) {
  return { ...parentRow(userId, sourceId, r), parent_staged_id: parentStagedId };
}

/** Separa los padres de las viñetas conservando el orden (patrón de dos fases). */
export function splitStaged(rows: StagedRow[]): { parents: StagedRow[]; bullets: StagedRow[] } {
  return {
    parents: rows.filter((r) => r.kind !== "bullet"),
    bullets: rows.filter((r) => r.kind === "bullet"),
  };
}

/* ============================================================================
   ESCRITURA — recibe el cliente Supabase (RLS por auth.uid()).
   ============================================================================ */

/**
 * Inserta los staged_items de una fuente en DOS FASES: primero los padres (para
 * mapear su clave local → id real), luego las viñetas con parent_staged_id. Es el
 * mismo patrón de persistImport, extraído para compartirlo entre alta y releer.
 * Devuelve cuántas filas se insertaron.
 */
async function insertStagedTwoPhase(sb: SB, userId: string, sourceId: string, rows: StagedRow[]): Promise<number> {
  const { parents, bullets } = splitStaged(rows);
  const keyToId = new Map<string, string>();

  if (parents.length) {
    const { data, error } = await sb
      .from("staged_items")
      .insert(parents.map((r) => parentRow(userId, sourceId, r)))
      .select("id");
    if (error) throw new Error(`Staged: ${error.message}`);
    (data ?? []).forEach((row, i) => keyToId.set(parents[i]!.key, row.id as string));
  }

  if (bullets.length) {
    const { error } = await sb.from("staged_items").insert(
      bullets.map((r) => bulletRow(userId, sourceId, r, r.parentKey ? keyToId.get(r.parentKey) ?? null : null)),
    );
    if (error) throw new Error(`Viñetas: ${error.message}`);
  }

  return rows.length;
}

/**
 * Crea UNA fuente (parametrizada) + sus staged_items (dos fases). Devuelve el id de
 * la fuente y cuántos items quedaron en staging.
 */
export async function persistSource(
  sb: SB,
  userId: string,
  meta: SourceMeta,
  rows: StagedRow[],
): Promise<{ sourceId: string; staged: number }> {
  const { data: source, error } = await sb
    .from("ingestion_sources")
    .insert(sourceInsert(userId, meta))
    .select("id")
    .single();
  if (error) throw new Error(`Fuente: ${error.message}`);
  const sourceId = source.id as string;
  const staged = await insertStagedTwoPhase(sb, userId, sourceId, rows);
  return { sourceId, staged };
}

/** La fuente tal como la necesita "releer" (kind + de dónde volver a leer). */
export interface SourceRecord {
  id: string;
  kind: string;
  originalName: string | null;
  sourceUrl: string | null;
  storagePath: string | null;
  status: string;
  pageCount: number | null;
  rawTextIsTranscription: boolean;
}

/** Lee una fuente del usuario (RLS). `null` si no existe o no es suya. */
export async function getSource(sb: SB, userId: string, id: string): Promise<SourceRecord | null> {
  const { data, error } = await sb
    .from("ingestion_sources")
    .select("id,kind,original_name,source_url,storage_path,status,page_count,raw_text_is_transcription")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as string,
    kind: (data.kind as string) ?? "paste",
    originalName: (data.original_name as string | null) ?? null,
    sourceUrl: (data.source_url as string | null) ?? null,
    storagePath: (data.storage_path as string | null) ?? null,
    status: (data.status as string) ?? "pending",
    pageCount: (data.page_count as number | null) ?? null,
    rawTextIsTranscription: Boolean(data.raw_text_is_transcription),
  };
}

/**
 * Borra una fuente del usuario. Por el esquema: staged_items.source_id CASCADE
 * (se van sus propuestas pendientes) y profile_items.source_id SET NULL (lo ya
 * aceptado en el master QUEDA, solo pierde la referencia a la fuente).
 */
export async function deleteSource(sb: SB, userId: string, id: string): Promise<void> {
  const { error } = await sb.from("ingestion_sources").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Quita las propuestas PENDIENTES de una fuente (no toca lo ya aceptado/rechazado). */
async function clearPendingStaged(sb: SB, userId: string, sourceId: string): Promise<void> {
  const { error } = await sb
    .from("staged_items")
    .delete()
    .eq("source_id", sourceId)
    .eq("user_id", userId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}

/**
 * "Releer": reemplaza el staging PENDIENTE de una fuente por la lectura nueva y
 * actualiza sus metadatos (raw_text, page_count, status…). Lo ya aceptado en el
 * master no se toca. Devuelve cuántos items nuevos quedaron en staging.
 */
export async function restageSource(
  sb: SB,
  userId: string,
  sourceId: string,
  rows: StagedRow[],
  patch?: Partial<ReturnType<typeof sourceInsert>>,
): Promise<number> {
  await clearPendingStaged(sb, userId, sourceId);
  const n = await insertStagedTwoPhase(sb, userId, sourceId, rows);
  if (patch) {
    const { error } = await sb.from("ingestion_sources").update(patch).eq("id", sourceId).eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
  return n;
}
