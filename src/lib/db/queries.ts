import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportResult, StagedRow } from "@/lib/extract/types";
import { normalizeLinks, type ResumeData } from "@/lib/cv/resume";

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

const META = (r: StagedRow) => ({ _origin: r.origin, _level: r.evidenceLevel, _source: r.sourceLabel });

/**
 * Persiste el resultado de la ingesta: una fuente + los staged_items. Dos fases
 * para enlazar las viñetas a su rol (parent_staged_id). Devuelve el nº insertado.
 */
export async function persistImport(sb: SB, userId: string, result: ImportResult): Promise<{ sourceId: string; staged: number }> {
  const { data: source, error: srcErr } = await sb
    .from("ingestion_sources")
    .insert({ user_id: userId, kind: "paste", status: "extracted", raw_text: result.rawText })
    .select("id")
    .single();
  if (srcErr) throw new Error(`Fuente: ${srcErr.message}`);
  const sourceId = source.id as string;

  const rows = result.staged;
  const parents = rows.filter((r) => r.kind !== "bullet");
  const bullets = rows.filter((r) => r.kind === "bullet");

  // Fase 1 — items padre. Mapear key local → id de staged.
  const keyToId = new Map<string, string>();
  if (parents.length) {
    const { data, error } = await sb
      .from("staged_items")
      .insert(
        parents.map((r) => ({
          user_id: userId, source_id: sourceId, kind: r.kind,
          data: { ...r.data, ...META(r) }, lang: r.lang,
          evidence_snippet: r.evidenceSnippet, evidence_verified: r.evidenceVerified, status: "pending",
        })),
      )
      .select("id");
    if (error) throw new Error(`Staged: ${error.message}`);
    data.forEach((row, i) => keyToId.set(parents[i]!.key, row.id as string));
  }

  // Fase 2 — viñetas, apuntando a su rol.
  if (bullets.length) {
    const { error } = await sb.from("staged_items").insert(
      bullets.map((r) => ({
        user_id: userId, source_id: sourceId, kind: r.kind,
        data: { ...r.data, ...META(r) }, lang: r.lang,
        evidence_snippet: r.evidenceSnippet, evidence_verified: r.evidenceVerified, status: "pending",
        parent_staged_id: r.parentKey ? keyToId.get(r.parentKey) ?? null : null,
      })),
    );
    if (error) throw new Error(`Viñetas: ${error.message}`);
  }

  return { sourceId, staged: rows.length };
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
}

/** Lee el staging pendiente del usuario. */
export async function getStaging(sb: SB, userId: string): Promise<StagedItemRow[]> {
  const { data, error } = await sb
    .from("staged_items")
    .select("id,kind,data,lang,evidence_snippet,evidence_verified,status,parent_staged_id,promoted_to")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as StagedItemRow[];
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

  await sb.from("staged_items").update({ status: "accepted", promoted_to: item.id }).eq("id", stagedId);
  return item.id as string;
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

/** Una fuente de ingesta, tal como la lista FuentesScreen/Dashboard. */
export interface SourceSummary {
  id: string;
  kind: string;
  originalName: string | null;
  sourceUrl: string | null;
  status: string;
  pageCount: number | null;
  rawTextLength: number;
  createdAt: string;
}

/** ingestion_sources del usuario (más recientes primero). */
export async function listSources(sb: SB, userId: string): Promise<SourceSummary[]> {
  const { data, error } = await sb
    .from("ingestion_sources")
    .select("id,kind,original_name,source_url,status,page_count,raw_text,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: (r.kind as string) ?? "paste",
    originalName: (r.original_name as string | null) ?? null,
    sourceUrl: (r.source_url as string | null) ?? null,
    status: (r.status as string) ?? "pending",
    pageCount: (r.page_count as number | null) ?? null,
    rawTextLength: typeof r.raw_text === "string" ? (r.raw_text as string).length : 0,
    createdAt: r.created_at as string,
  }));
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
    headings: {
      summary: i18n("Resumen"), skills: i18n("Habilidades"), work: i18n("Experiencia"),
      projects: i18n("Proyectos"), education: i18n("Educación"),
    },
  };
}
