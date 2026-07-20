import type { SupabaseClient } from "@supabase/supabase-js";
import type { StagedRow } from "@/lib/extract/types";
import type { SuspicionLevel, DuplicateSignal } from "@/lib/extract/dedup";

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
export type FileKind = "pdf" | "docx" | "image" | "text";

/**
 * El filtro del selector nativo, en UN solo sitio: lo que la interfaz OFRECE y lo
 * que `fileKindFromName` ACEPTA tienen que ser la misma lista. Se declaran las
 * extensiones Y los MIME porque muchos navegadores mandan MIME vacío para .md.
 */
export const FILE_ACCEPT =
  ".pdf,.docx,.md,.markdown,.txt,.png,.jpg,.jpeg,.webp," +
  "application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "text/plain,text/markdown," +
  "image/*";

/** Las extensiones de texto plano que leemos tal cual (el contenido ES el raw_text). */
const TEXT_EXT = ["md", "markdown", "txt", "text"];
/** MIME de texto plano. Ojo: para .md muchos navegadores mandan "" → manda la extensión. */
const TEXT_MIME = ["text/plain", "text/markdown", "text/x-markdown"];

/* ============================================================================
   HELPERS PUROS — sin Supabase, testeables en aislamiento.
   ============================================================================ */

/**
 * Extensión (o MIME) → tipo de archivo soportado. `null` = no soportado (se avisa,
 * no se sube). Solo .docx OOXML (mammoth no lee el .doc binario), como extract/files.
 *
 * El texto plano (.md/.markdown/.txt) se decide por EXTENSIÓN antes que por MIME:
 * muchos navegadores mandan MIME vacío para .md, y el cuestionario respondido —
 * que la propia zona de arrastre lleva anunciando como fuente de primera — es
 * justamente un .md.
 */
export function fileKindFromName(name: string, mime?: string): FileKind | null {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (TEXT_EXT.includes(ext) || (mime ? TEXT_MIME.includes(mime) : false)) return "text";
  if ((mime && mime.startsWith("image/")) || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
  return null;
}

/**
 * El `kind` con el que se PERSISTE en ingestion_sources. El enum de la BD
 * (`paste|pdf|docx|image|url|github|manual`) no tiene valor para "archivo de
 * texto", y añadirlo exigiría una migración en Supabase. Un .md/.txt es
 * exactamente texto plano que llegó como archivo → se guarda 'paste', y el
 * archivo real sigue identificado por original_name + storage_path. Cero
 * migración, cero pérdida de procedencia.
 */
export function sourceKindFor(kind: FileKind): string {
  return kind === "text" ? "paste" : kind;
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

/* ============================================================================
   LA SOSPECHA DE DUPLICADO, PERSISTIDA (§A2)
   ============================================================================
   El detector (extract/dedup.ts) ya emparejaba bien, pero su veredicto moría en
   memoria: ningún writer lo escribía. Vive en `staged_items.merge_proposal`
   (jsonb), que el esquema 0001 ya reservaba con el comentario «la decide el
   USUARIO».

   ⚠ NO en `duplicate_of`: esa columna referencia profile_items(id) y el par que
     detectamos es entre dos STAGED. La FK no encaja, y forzarla obligaría a
     promover uno de los dos al master ANTES de que el usuario decidiera — que es
     exactamente lo que la doctrina prohíbe.                                     */

/** Los tres niveles, para validar lo que vuelve de la base sin confiar en ello. */
const NIVELES: SuspicionLevel[] = ["baja", "media", "alta"];

/**
 * La sospecha tal cual se PERSISTE. `v` versiona la forma: hay staged_items en
 * producción escritos antes de esto (merge_proposal null o con otra forma), y la
 * cola tiene que sobrevivirlos — de eso se encarga `readMergeProposal`.
 *
 * `duplicateOf` es el id REAL del otro staged, no la clave local: las claves del
 * detector solo existen durante la ingesta. Puede ser null cuando la pareja no se
 * pudo resolver; la marca sigue valiendo porque el `reason` la explica sola.
 */
export interface MergeProposal {
  v: 1;
  duplicateOf: string | null;
  level: SuspicionLevel;
  signals: DuplicateSignal[];
  reason: string;
}

/**
 * Lee merge_proposal DEFENSIVAMENTE. Cualquier cosa que no traiga un nivel válido
 * se trata como «no hay sospecha» en vez de reventar la cola: una fila vieja no
 * puede tumbar la pantalla de otro usuario.
 */
export function readMergeProposal(raw: unknown): MergeProposal | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const level = NIVELES.find((l) => l === o.level);
  if (!level) return null; // forma vieja o ajena: se ignora, no se adivina
  const signals = Array.isArray(o.signals)
    ? o.signals.filter((s): s is DuplicateSignal => typeof s === "string")
    : [];
  return {
    v: 1,
    duplicateOf: typeof o.duplicateOf === "string" && o.duplicateOf ? o.duplicateOf : null,
    level,
    signals,
    reason: typeof o.reason === "string" ? o.reason : "",
  };
}

/**
 * La sospecha de una fila, con la pareja ya resuelta a id real. `null` cuando no
 * hay sospecha: se escribe null explícito para que un «releer» limpie la marca
 * anterior en vez de dejarla rancia.
 */
export function mergeProposalFor(r: StagedRow, keyToId: Map<string, string>): MergeProposal | null {
  const d = r.duplicate;
  if (!d) return null;
  return {
    v: 1,
    duplicateOf: keyToId.get(d.otherKey) ?? null,
    level: d.level,
    signals: d.signals,
    reason: d.reason,
  };
}

/* ── Ids generados en el CLIENTE ──────────────────────────────────────────────
   La correlación clave-local → id real se hacía por ÍNDICE sobre lo que devolvía
   el insert (`data.forEach((row,i) => …)`), asumiendo que Supabase devuelve las
   filas en el mismo orden del array. Eso NO está en ningún contrato, y aquí no es
   cosmético: si el orden bailara, las viñetas colgarían del rol equivocado y la
   sospecha de duplicado apuntaría a otro item — dos mentiras con procedencia.

   Generando el uuid antes de insertar, la correlación deja de ser una suposición
   y pasa a ser un dato: se conoce ANTES de hablar con la base, lo que además
   permite resolver `duplicateOf` en el mismo insert, sin un UPDATE posterior.   */

/** uuid v4 con la criptografía de la plataforma. Falla RUIDOSO antes que colisionar. */
function nuevoId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6]! & 0x0f) | 0x40;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  throw new Error("Sin criptografía para generar ids de staging.");
}

/** clave local → id real, decidido AQUÍ. `gen` se inyecta en los tests. */
export function assignIds(rows: StagedRow[], gen: () => string = nuevoId): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) if (!m.has(r.key)) m.set(r.key, gen());
  return m;
}

/** Procedencia que viaja en data._* (staged_items no tiene columnas origin/level/source). */
const META = (r: StagedRow) => ({ _origin: r.origin, _level: r.evidenceLevel, _source: r.sourceLabel });

/** Lo que el writer decide por fuera de la fila: su id y su sospecha ya resuelta. */
export interface RowExtra {
  id?: string;
  mergeProposal?: MergeProposal | null;
}

/** Fila de staged_items para un item PADRE (todo lo que no es viñeta). */
export function parentRow(userId: string, sourceId: string, r: StagedRow, extra: RowExtra = {}) {
  return {
    ...(extra.id ? { id: extra.id } : {}),
    user_id: userId,
    source_id: sourceId,
    kind: r.kind,
    data: { ...r.data, ...META(r) },
    lang: r.lang,
    evidence_snippet: r.evidenceSnippet,
    evidence_verified: r.evidenceVerified,
    status: "pending" as const,
    merge_proposal: extra.mergeProposal ?? null,
  };
}

/** Fila de staged_items para una VIÑETA, apuntando a su rol ya insertado. */
export function bulletRow(
  userId: string,
  sourceId: string,
  r: StagedRow,
  parentStagedId: string | null,
  extra: RowExtra = {},
) {
  return { ...parentRow(userId, sourceId, r, extra), parent_staged_id: parentStagedId };
}

/**
 * Las filas de UNA ingesta, en dos fases y con la sospecha ya resuelta a ids
 * reales. PURO: es el armado que comparten los dos writers (persistImport de
 * queries.ts y persistSource/restageSource de aquí). Tenerlo en un solo sitio es
 * lo que impide que el camino de Fuentes se quede sin la marca — que es
 * exactamente lo que pasaba cuando cada writer construía su fila a mano.
 */
export function stagedRowsFor(
  userId: string,
  sourceId: string,
  rows: StagedRow[],
  gen?: () => string,
): { keyToId: Map<string, string>; parents: ReturnType<typeof parentRow>[]; bullets: ReturnType<typeof bulletRow>[] } {
  const { parents, bullets } = splitStaged(rows);
  const keyToId = assignIds(rows, gen);
  const extraDe = (r: StagedRow): RowExtra => ({
    id: keyToId.get(r.key),
    mergeProposal: mergeProposalFor(r, keyToId),
  });
  return {
    keyToId,
    parents: parents.map((r) => parentRow(userId, sourceId, r, extraDe(r))),
    bullets: bullets.map((r) =>
      bulletRow(userId, sourceId, r, r.parentKey ? keyToId.get(r.parentKey) ?? null : null, extraDe(r)),
    ),
  };
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
export async function insertStagedTwoPhase(sb: SB, userId: string, sourceId: string, rows: StagedRow[]): Promise<number> {
  const { parents, bullets } = stagedRowsFor(userId, sourceId, rows);

  // Siguen siendo DOS fases aunque los ids ya se conozcan: la FK
  // parent_staged_id → staged_items(id) se comprueba fila a fila, así que el rol
  // tiene que estar escrito antes que su viñeta.
  if (parents.length) {
    const { error } = await sb.from("staged_items").insert(parents);
    if (error) throw new Error(`Staged: ${error.message}`);
  }
  if (bullets.length) {
    const { error } = await sb.from("staged_items").insert(bullets);
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
