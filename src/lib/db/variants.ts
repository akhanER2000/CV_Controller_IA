import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLinks, type ResumeData } from "@/lib/cv/resume";
import { ensureMaster, getMasterItems, type MasterItem } from "@/lib/db/queries";

/**
 * Capa de datos de las VARIANTES (contra el esquema 0001). Igual que queries.ts:
 * recibe el cliente de Supabase por parámetro → se usa desde Route Handlers con la
 * sesión del usuario (RLS por auth.uid()).
 *
 * La tesis del esquema: variant_items REFERENCIA items del master (item_id) y solo
 * los sobreescribe campo por campo (override_data). NO copia. Por eso editar el
 * master se refleja solo en la variante — la sincronización es inherente.
 *
 * ⚠ Trigger anti-IDOR en variant_items: item_id (y override_source_item) DEBEN
 * pertenecer al mismo user_id. Por eso SIEMPRE se inserta con user_id = el del
 * usuario y con item_id de SU master.
 */

type SB = SupabaseClient;

const i18n = (s: string) => ({ es: s, en: s });
const str = (o: Record<string, unknown>, key: string) => String(o[key] ?? "");

// ── Tipos del contrato ───────────────────────────────────────────────────────
export interface VariantRow {
  id: string;
  name: string;
  target_title: string | null;
  lang: string;
}

export interface VariantItemView {
  id: string;
  item_id: string;
  kind: string;
  visible: boolean;
  sort_order: number;
  override_data: Record<string, unknown> | null;
  /** data EFECTIVA = master + override */
  data: Record<string, unknown>;
  parent_id: string | null;
}

export interface MasterItemView {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  parent_id: string | null;
  sort_order: number;
}

export interface VariantDetail {
  variant: {
    id: string;
    name: string;
    target_title: string | null;
    lang: string;
    updated_at: string;
    master_updated_at: string | null;
  };
  items: VariantItemView[];
  master: MasterItemView[];
}

// ── Helpers internos ─────────────────────────────────────────────────────────
/** Momento de última modificación del master (para "variante desactualizada"). */
async function masterUpdatedAt(sb: SB, userId: string): Promise<string | null> {
  const { data } = await sb
    .from("master_profiles")
    .select("updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.updated_at as string | undefined) ?? null;
}

/** Confirma que la variante existe y es del usuario (RLS + defensa explícita). */
async function ownedVariant(
  sb: SB,
  userId: string,
  variantId: string,
): Promise<{ id: string; target_title: string | null; name: string } | null> {
  const { data, error } = await sb
    .from("cv_variants")
    .select("id,name,target_title")
    .eq("id", variantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as string,
    name: (data.name as string) ?? "Variante",
    target_title: (data.target_title as string | null) ?? null,
  };
}

/** override_data (parcial) sobre la data del master. null ⇒ hereda del master. */
function effectiveData(
  base: Record<string, unknown>,
  override: Record<string, unknown> | null,
): Record<string, unknown> {
  return override ? { ...base, ...override } : base;
}

// ── CRUD de variantes ────────────────────────────────────────────────────────
/** Crea una cv_variant VACÍA (sin variant_items), atada al master del usuario. */
export async function createVariant(sb: SB, userId: string, name?: string): Promise<VariantRow> {
  const profileId = await ensureMaster(sb, userId);
  const { data, error } = await sb
    .from("cv_variants")
    .insert({ user_id: userId, profile_id: profileId, name: (name ?? "").trim() || "Nueva variante" })
    .select("id,name,target_title,lang")
    .single();
  if (error) throw new Error(`No se pudo crear la variante: ${error.message}`);
  return {
    id: data.id as string,
    name: data.name as string,
    target_title: (data.target_title as string | null) ?? null,
    lang: (data.lang as string) ?? "es",
  };
}

/** PATCH de la cabecera de la variante (name / target_title). */
export async function updateVariant(
  sb: SB,
  userId: string,
  variantId: string,
  patch: { name?: string; target_title?: string | null },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.target_title !== undefined) update.target_title = patch.target_title;
  if (Object.keys(update).length === 0) return;
  const { error } = await sb
    .from("cv_variants")
    .update(update)
    .eq("id", variantId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Presentación OPT-IN de una variante: FOTO y CÓDIGO QR. Se guardan como override
 * del variant_item de `basics` (el render lee foto/QR de la data EFECTIVA de
 * basics), así son POR VARIANTE: una "versión visual" para enviar a una persona no
 * contamina las demás variantes ni el master.
 *
 * ⚠ Candados del producto:
 *  - La URL del QR va SIEMPRE también como TEXTO en el documento (el ATS no lee el
 *    QR). Eso lo garantiza el render (ResumePDF/toPlainText); aquí solo se guarda
 *    la url elegida.
 *  - La foto NUNCA es el avatar de la UI (user_settings.avatar_url): es una imagen
 *    que el usuario sube aparte para ESTE CV. Llega ya reducida como data-URL.
 *
 * patch.photo / patch.qrUrl === undefined ⇒ ese campo no se toca. "" ⇒ se apaga
 * EXPLÍCITAMENTE (fuerza OFF aunque el master tuviera algo). Crea el variant_item
 * de basics si no existía (así una variante manual también puede presentar). Devuelve
 * el estado efectivo resultante.
 */
export async function setVariantPresentation(
  sb: SB,
  userId: string,
  variantId: string,
  patch: { photo?: string; qrUrl?: string },
): Promise<{ photo: string; qrUrl: string }> {
  const owned = await ownedVariant(sb, userId, variantId);
  if (!owned) throw new Error("Variante no encontrada.");

  // El item basics del master: el variant_item lo referencia para heredar
  // nombre/email/etc. Sin basics no hay identidad que presentar.
  const master = await getMasterItems(sb, userId);
  const basicsMaster = master.find((m) => m.kind === "basics");
  if (!basicsMaster) {
    throw new Error("Tu master aún no tiene bloque de contacto. Agrega tu identidad antes de la foto o el QR.");
  }

  // Candados de la foto (el cliente ya reduce y valida; esto es la defensa server):
  // solo data-URLs de imagen con cuerpo base64 (nada de HTML/URLs externas), y con
  // un tope de tamaño. "" pasa (es apagar la foto).
  if (patch.photo) {
    if (!/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/]+=*$/i.test(patch.photo)) {
      throw new Error("La foto debe ser una imagen (PNG, JPG o WEBP).");
    }
    if (patch.photo.length > 900_000) {
      throw new Error("La foto es demasiado pesada. Sube una imagen más pequeña.");
    }
  }
  // Candado del QR (simétrico con la foto): una URL sobre la capacidad del código
  // (~2.3 KB en modo M) haría fallar QRCode.toDataURL. El render ya degrada a
  // solo-texto, pero aquí se rechaza de entrada — una URL de portafolio no llega
  // ni de lejos a 1.5 KB. "" pasa (es apagar el QR).
  if (patch.qrUrl && patch.qrUrl.length > 1500) {
    throw new Error("La URL del QR es demasiado larga para caber en un código QR.");
  }

  // find-or-create del variant_item de basics (unique (variant_id, item_id)).
  const { data: existing, error: selErr } = await sb
    .from("variant_items")
    .select("id,override_data")
    .eq("variant_id", variantId)
    .eq("user_id", userId)
    .eq("item_id", basicsMaster.id)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);

  let vitemId: string;
  let current: Record<string, unknown>;
  if (existing) {
    vitemId = existing.id as string;
    current = (existing.override_data as Record<string, unknown> | null) ?? {};
  } else {
    const row = await addItem(sb, userId, variantId, basicsMaster.id);
    vitemId = row.id as string;
    current = (row.override_data as Record<string, unknown> | null) ?? {};
  }

  const next: Record<string, unknown> = { ...current };
  if (patch.photo !== undefined) next.photo = patch.photo; // "" = apagar la foto
  if (patch.qrUrl !== undefined) next.qr = { url: patch.qrUrl }; // {url:""} = apagar el QR

  const { error } = await sb
    .from("variant_items")
    .update({ override_data: next, override_origin: "manual", override_verified: false })
    .eq("id", vitemId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  return {
    photo: String(next.photo ?? ""),
    qrUrl: String((next.qr as Record<string, unknown> | undefined)?.url ?? ""),
  };
}

/**
 * Arma el objeto del contrato GET /api/variants/[id]:
 *   { variant, items (con data EFECTIVA), master (biblioteca completa) }.
 * Devuelve null si la variante no existe / no es del usuario.
 */
export async function getVariant(
  sb: SB,
  userId: string,
  variantId: string,
): Promise<VariantDetail | null> {
  const { data: v, error: vErr } = await sb
    .from("cv_variants")
    .select("id,name,target_title,lang,updated_at")
    .eq("id", variantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (vErr) throw new Error(vErr.message);
  if (!v) return null;

  const [master, mUpdated, vitemsRes] = await Promise.all([
    getMasterItems(sb, userId),
    masterUpdatedAt(sb, userId),
    sb
      .from("variant_items")
      .select("id,item_id,visible,sort_order,override_data")
      .eq("variant_id", variantId)
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
  ]);
  if (vitemsRes.error) throw new Error(vitemsRes.error.message);

  const masterById = new Map<string, MasterItem>(master.map((m) => [m.id, m]));

  const items: VariantItemView[] = (vitemsRes.data ?? []).map((vi) => {
    const m = masterById.get(vi.item_id as string);
    const override = (vi.override_data as Record<string, unknown> | null) ?? null;
    const base = m?.data ?? {};
    return {
      id: vi.id as string,
      item_id: vi.item_id as string,
      kind: m?.kind ?? "",
      visible: Boolean(vi.visible),
      sort_order: (vi.sort_order as number) ?? 0,
      override_data: override,
      data: effectiveData(base, override),
      parent_id: m?.parentId ?? null,
    };
  });

  const masterView: MasterItemView[] = master.map((m) => ({
    id: m.id,
    kind: m.kind,
    data: m.data,
    parent_id: m.parentId,
    sort_order: m.sortOrder,
  }));

  return {
    variant: {
      id: v.id as string,
      name: (v.name as string) ?? "Variante",
      target_title: (v.target_title as string | null) ?? null,
      lang: (v.lang as string) ?? "es",
      updated_at: v.updated_at as string,
      master_updated_at: mUpdated,
    },
    items,
    master: masterView,
  };
}

// ── variant_items ────────────────────────────────────────────────────────────
/** Añade un item del master a la variante (visible=true, sort_order=al final). */
export async function addItem(
  sb: SB,
  userId: string,
  variantId: string,
  itemId: string,
): Promise<Record<string, unknown>> {
  const owned = await ownedVariant(sb, userId, variantId);
  if (!owned) throw new Error("Variante no encontrada.");

  const { data: last } = await sb
    .from("variant_items")
    .select("sort_order")
    .eq("variant_id", variantId)
    .eq("user_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.sort_order as number | undefined) ?? -1) + 1;

  // user_id = el del usuario + item_id de SU master ⇒ el trigger anti-IDOR pasa.
  const { data, error } = await sb
    .from("variant_items")
    .insert({ variant_id: variantId, user_id: userId, item_id: itemId, visible: true, sort_order: nextOrder })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

/**
 * PATCH de un variant_item (contrato): visible / sort_order / override_data.
 * override_data:null ⇒ revierte al master (limpia también la procedencia).
 * Una edición manual marca override_origin='manual', sin verificar.
 */
export async function updateItem(
  sb: SB,
  userId: string,
  variantItemId: string,
  patch: { visible?: boolean; sort_order?: number; override_data?: Record<string, unknown> | null },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.visible !== undefined) update.visible = patch.visible;
  if (patch.sort_order !== undefined) update.sort_order = patch.sort_order;
  if ("override_data" in patch) {
    if (patch.override_data == null) {
      // revertir al master
      update.override_data = null;
      update.override_origin = null;
      update.override_verified = false;
      update.override_source_item = null;
      update.override_reason = null;
    } else {
      update.override_data = patch.override_data;
      update.override_origin = "manual";
      update.override_verified = false;
      update.override_source_item = null;
    }
  }
  if (Object.keys(update).length === 0) return;
  const { error } = await sb
    .from("variant_items")
    .update(update)
    .eq("id", variantItemId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Fija un override redactado por IA en un variant_item. La procedencia es lo que
 * se IMPRIME en el PDF: origin='ai_rephrased', verificado (preservesFacts pasó),
 * y source_item = el item del master del que deriva (debe ser del usuario).
 */
export async function setAiOverride(
  sb: SB,
  userId: string,
  variantItemId: string,
  args: { data: Record<string, unknown>; sourceItem: string; reason?: string },
): Promise<void> {
  const { error } = await sb
    .from("variant_items")
    .update({
      override_data: args.data,
      override_origin: "ai_rephrased",
      override_verified: true,
      override_source_item: args.sourceItem,
      override_reason: args.reason ?? "Redactado por IA a partir del master; hechos preservados.",
    })
    .eq("id", variantItemId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Quita un item de la variante (no toca el master). */
export async function removeItem(sb: SB, userId: string, variantItemId: string): Promise<void> {
  const { error } = await sb
    .from("variant_items")
    .delete()
    .eq("id", variantItemId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// ── Edición inline del master ────────────────────────────────────────────────
/**
 * PATCH /api/master/[id]: actualiza profile_items.data. El trigger toca updated_at
 * del item y del master → toda variante que lo referencia queda "desactualizada"
 * sola (y su render se actualiza porque variant_items REFERENCIA, no copia).
 */
export async function patchMasterItem(
  sb: SB,
  userId: string,
  itemId: string,
  data: Record<string, unknown>,
): Promise<MasterItemView> {
  const { data: row, error } = await sb
    .from("profile_items")
    .update({ data })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("id,kind,parent_id,data,sort_order")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: row.id as string,
    kind: row.kind as string,
    data: (row.data as Record<string, unknown>) ?? {},
    parent_id: (row.parent_id as string | null) ?? null,
    sort_order: (row.sort_order as number) ?? 0,
  };
}

// ── Render → ResumeData ──────────────────────────────────────────────────────
/**
 * ResumeData de la variante: renderiza SOLO los variant_items VISIBLES, en
 * sort_order, aplicando override_data sobre la data del master (leída vía item_id,
 * por eso editar el master se refleja solo). target_title → basics.label.
 * Espeja el mapeo de buildResumeData (queries.ts). Lanza si la variante no existe.
 */
export async function buildVariantResumeData(
  sb: SB,
  userId: string,
  variantId: string,
): Promise<ResumeData> {
  const owned = await ownedVariant(sb, userId, variantId);
  if (!owned) throw new Error("Variante no encontrada.");

  const [master, vitemsRes] = await Promise.all([
    getMasterItems(sb, userId),
    sb
      .from("variant_items")
      .select("item_id,visible,sort_order,override_data")
      .eq("variant_id", variantId)
      .eq("user_id", userId)
      .eq("visible", true)
      .order("sort_order", { ascending: true }),
  ]);
  if (vitemsRes.error) throw new Error(vitemsRes.error.message);

  const masterById = new Map<string, MasterItem>(master.map((m) => [m.id, m]));

  interface EffItem {
    itemId: string;
    kind: string;
    data: Record<string, unknown>;
    parentId: string | null;
  }
  const eff: EffItem[] = [];
  for (const vi of vitemsRes.data ?? []) {
    const m = masterById.get(vi.item_id as string);
    if (!m) continue; // ON DELETE RESTRICT lo hace casi imposible; defensa igual.
    eff.push({
      itemId: m.id,
      kind: m.kind,
      data: effectiveData(m.data, (vi.override_data as Record<string, unknown> | null) ?? null),
      parentId: m.parentId,
    });
  }

  const by = (k: string) => eff.filter((e) => e.kind === k);
  // Si la variante no tiene variant_item de basics (p. ej. una variante MANUAL,
  // que arranca vacía y no lo trae de la biblioteca), hereda el basics del master:
  // así el PDF nunca sale sin nombre/contacto. La foto/QR opt-in viven en el
  // override de ESE variant_item cuando existe (setVariantPresentation).
  const masterBasics = master.find((m) => m.kind === "basics")?.data ?? {};
  const basicsItem = by("basics")[0]?.data ?? masterBasics;
  const summaryItem = by("summary")[0]?.data ?? {};

  const work = by("work").map((w) => ({
    company: str(w.data, "company"),
    location: i18n(str(w.data, "location")),
    title: i18n(str(w.data, "title")),
    dates: i18n(str(w.data, "dates")),
    p1: true,
    bullets: eff
      .filter((b) => b.kind === "bullet" && b.parentId === w.itemId)
      .map((b) => ({ p1: true, es: str(b.data, "text"), en: str(b.data, "text") })),
  }));

  // El target_title de la variante manda como label; si no hay, cae al del master.
  const label = (owned.target_title ?? "").trim() || str(basicsItem, "label");

  // Foto y QR OPT-IN (guardados en la data de basics). photo NUNCA es el avatar.
  const photo = str(basicsItem, "photo").trim() || undefined;
  const qrUrl = str((basicsItem.qr as Record<string, unknown>) ?? {}, "url").trim();

  return {
    meta: { variant: owned.name },
    basics: {
      name: str(basicsItem, "name"),
      label: i18n(label),
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
      summary: i18n("Resumen"),
      skills: i18n("Habilidades"),
      work: i18n("Experiencia"),
      projects: i18n("Proyectos"),
      education: i18n("Educación"),
    },
  };
}
