import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureMaster, type MasterItem } from "@/lib/db/queries";

/**
 * Capa de datos del MASTER — el CRUD que queries.ts (congelado) no cubre:
 * crear con padre y sort_order al final, borrar (con el aviso del RESTRICT de
 * variantes), consultar dónde se usa un item, y reclasificar viñetas a skills.
 *
 * Igual que queries.ts: recibe el cliente de Supabase por parámetro → se usa
 * desde Route Handlers con la sesión del usuario (RLS por auth.uid()). NADA entra
 * al master sin acción humana: aquí todo lo que crea usa origin='manual' (el
 * origen más verificable — lo escribió el humano).
 *
 * ⚠ Este módulo es ISOMÓRFICO a propósito: sus únicos imports en runtime son
 * queries.ts (que a su vez es puro: no toca next/headers ni 'server-only'). Así
 * los HELPERS PUROS de abajo (looksLikeSkillTag, splitChipInput, normalizeSkillName)
 * también se importan desde el cliente (MasterScreen) sin arrastrar el servidor.
 */

type SB = SupabaseClient;

const str = (o: Record<string, unknown>, k: string) => String(o[k] ?? "");

const map = (row: Record<string, unknown>): MasterItem => ({
  id: row.id as string,
  kind: row.kind as string,
  parentId: (row.parent_id as string | null) ?? null,
  data: (row.data as Record<string, unknown>) ?? {},
  origin: (row.origin as string) ?? "manual",
  evidenceSnippet: (row.evidence_snippet as string | null) ?? null,
  evidenceVerified: Boolean(row.evidence_verified),
  sortOrder: (row.sort_order as number) ?? 0,
});

const COLS = "id,kind,parent_id,data,origin,evidence_snippet,evidence_verified,sort_order";

/* ============================================================================
   HELPERS PUROS (sin I/O). Testeables en node y reutilizados por el cliente.
   ============================================================================ */

/** Alias comunes → forma canónica, para fusionar duplicados escritos distinto. */
export const SKILL_ALIASES: Record<string, string> = {
  postgres: "postgresql",
  postgre: "postgresql",
  js: "javascript",
  ts: "typescript",
  k8s: "kubernetes",
  golang: "go",
  py: "python",
  node: "node.js",
  nodejs: "node.js",
  "c sharp": "c#",
  gh: "github",
};

const stripDiacritics = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Normaliza el nombre de una skill para COMPARAR (no para mostrar): minúsculas,
 * sin tildes, sin espacios extremos y aplicando alias. Así "PostgreSQL" y
 * "postgres" colapsan a "postgresql" y no se duplican.
 */
export function normalizeSkillName(text: string): string {
  const base = stripDiacritics(text).trim().toLowerCase().replace(/\s+/g, " ");
  return SKILL_ALIASES[base] ?? base;
}

/**
 * Separa un pegado (o un CSV guardado) en chips: por comas, punto y coma, saltos
 * de línea y los bullets típicos de listas de skills (· • |). Descarta vacíos.
 */
export function splitChipInput(text: string): string[] {
  return text
    .split(/[,;\n\r·•|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** chips desde el CSV guardado en data.items. */
export const chipsFromCsv = (csv: string): string[] => splitChipInput(csv);

/** CSV canónico para persistir en data.items (lo que consume el render del PDF). */
export const chipsToCsv = (chips: string[]): string => chips.join(", ");

/**
 * Añade chips a una lista SIN duplicar (comparación normalizada). Devuelve la
 * lista nueva y los que ya existían (para poder ofrecer «ya existe … ¿fusionar?»).
 */
export function mergeChips(
  existing: string[],
  incoming: string[],
): { chips: string[]; added: string[]; duplicates: string[] } {
  const seen = new Set(existing.map(normalizeSkillName));
  const chips = [...existing];
  const added: string[] = [];
  const duplicates: string[] = [];
  for (const raw of incoming) {
    const c = raw.trim();
    if (!c) continue;
    const key = normalizeSkillName(c);
    if (seen.has(key)) {
      duplicates.push(c);
      continue;
    }
    seen.add(key);
    chips.push(c);
    added.push(c);
  }
  return { chips, added, duplicates };
}

// Verbos de acción de CV (presente yo + pretéritos irregulares) que NO llevan
// tilde final, así que la regla de "tilde final = verbo" no los pilla. Sin las
// formas ambiguas con sustantivo (diseño/desarrollo/documento) para no suprimir
// etiquetas legítimas como "Diseño UX".
const LEADING_VERBS = new Set([
  "mantengo", "mentoreo", "lidero", "gestiono", "administro", "coordino",
  "superviso", "optimizo", "automatizo", "migro", "atiendo", "soporto",
  "dirijo", "construyo", "implemento", "reduje", "dije", "hice", "produje",
  "conduje", "traduje", "tuve", "estuve", "puse", "quise", "vine", "escribo",
]);

// Sustantivos con tilde final que NO son verbos (evitan el falso positivo de la
// regla "termina en é/í/ó ⇒ pretérito yo").
const ACCENT_NOUN_EXCEPTIONS = new Set(["cafe", "te", "menu", "colibri", "bebe"]);

const hasStrongMetric = (t: string): boolean => {
  // número con unidad / porcentaje, o un número "grande" suelto: la firma de una
  // viñeta de logro ("850 ms", "40.000 transacciones", "3 equipos").
  if (
    /\d[\d.,]*\s?(%|ms|s|kb|mb|gb|tb|hrs?|min|d[ií]as?|semanas?|meses?|a[ñn]os?|transacciones|usuarios?|equipos?|personas?|clientes?|pymes?|repos?|deploys?)\b/i.test(
      t,
    )
  )
    return true;
  return /(^|\s)\d{2,}([.,]\d+)*(\s|$)/.test(t); // 850, 40.000, 12…
};

const startsWithVerb = (first: string): boolean => {
  const w = first.toLowerCase();
  if (/[éíó]$/.test(w) && !ACCENT_NOUN_EXCEPTIONS.has(stripDiacritics(w))) return true;
  return LEADING_VERBS.has(stripDiacritics(w));
};

/**
 * Heurística LOCAL: ¿este texto parece una ETIQUETA de habilidad y no una viñeta
 * de logro? Una etiqueta es corta, no arranca con verbo conjugado, no termina en
 * punto y no trae una métrica. Ej. sí: "Unity 3D", "C#", "Gestión ágil de
 * proyectos". Ej. no: "Reduje la latencia p99 de 850 ms a 180 ms".
 *
 * Conservadora a propósito: preferimos NO sugerir mover (perder una sugerencia)
 * antes que clasificar un logro real como skill (sugerencia molesta). Ambas son
 * reversibles, pero el falso positivo es el que estorba.
 */
export function looksLikeSkillTag(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const words = t.split(/\s+/);
  if (words.length > 5) return false; // una etiqueta es corta
  if (/[.!?…]$/.test(t)) return false; // termina en punto ⇒ frase
  if (/^\d[\d.,]*$/.test(words[0]!)) return false; // arranca con una cifra suelta ⇒ métrica
  if (startsWithVerb(words[0]!)) return false;
  if (hasStrongMetric(t)) return false;
  return true;
}

/* ============================================================================
   FUNCIONES DE DATOS (I/O). Todas con la sesión del usuario (RLS).
   ============================================================================ */

/**
 * Crea un profile_item MANUAL (origin='manual') con sort_order AL FINAL del
 * master y, opcionalmente, colgando de un padre (una viñeta bajo su rol). Es la
 * acción explícita de "añadir a mano". Verifica que el padre sea del usuario
 * (defensa además de RLS) antes de enlazar.
 */
export async function createItem(
  sb: SB,
  userId: string,
  args: { kind: string; data: Record<string, unknown>; parentId?: string | null },
): Promise<MasterItem> {
  const profileId = await ensureMaster(sb, userId);

  if (args.parentId) {
    const { data: parent, error: pErr } = await sb
      .from("profile_items")
      .select("id")
      .eq("id", args.parentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!parent) throw new Error("El elemento padre no existe o no es tuyo.");
  }

  // sort_order al final: max(sort_order)+1 del master del usuario.
  const { data: last } = await sb
    .from("profile_items")
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.sort_order as number | undefined) ?? -1) + 1;

  const insert: Record<string, unknown> = {
    profile_id: profileId,
    user_id: userId,
    kind: args.kind,
    data: args.data,
    origin: "manual",
    sort_order: nextOrder,
  };
  if (args.parentId) insert.parent_id = args.parentId;

  const { data: row, error } = await sb
    .from("profile_items")
    .insert(insert)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return map(row);
}

export interface ItemUsage {
  /** nº de variantes distintas que referencian el item (o sus viñetas). */
  variantsCount: number;
  /** nº de esas referencias con override (donde el usuario lo REESCRIBIÓ). */
  overridesCount: number;
  /** nº de viñetas colgando del item (CASCADE las arrastra al borrar). */
  childrenCount: number;
}

/**
 * ¿Dónde se usa este item? Cuenta variantes que lo referencian y overrides.
 * Incluye las referencias a sus HIJOS (viñetas): como parent_id es ON DELETE
 * CASCADE, borrar un rol arrastra sus viñetas, y si alguna está referenciada por
 * una variante (item_id es ON DELETE RESTRICT) el borrado del rol también se
 * bloquea. Por eso el usage del padre mira item + hijos.
 */
export async function itemUsage(sb: SB, userId: string, itemId: string): Promise<ItemUsage> {
  const { data: children, error: cErr } = await sb
    .from("profile_items")
    .select("id")
    .eq("user_id", userId)
    .eq("parent_id", itemId);
  if (cErr) throw new Error(cErr.message);
  const childIds = (children ?? []).map((c) => c.id as string);
  const ids = [itemId, ...childIds];

  const { data: refs, error: rErr } = await sb
    .from("variant_items")
    .select("variant_id,override_data")
    .eq("user_id", userId)
    .in("item_id", ids);
  if (rErr) throw new Error(rErr.message);

  const variants = new Set<string>();
  let overridesCount = 0;
  for (const r of refs ?? []) {
    variants.add(r.variant_id as string);
    const ov = r.override_data as Record<string, unknown> | null;
    if (ov && Object.keys(ov).length > 0) overridesCount++;
  }
  return { variantsCount: variants.size, overridesCount, childrenCount: childIds.length };
}

/**
 * Uso agregado de VARIOS items a la vez (para la reclasificación en lote). No mira
 * hijos (las viñetas son hojas): devuelve qué ids están referenciados por alguna
 * variante y el recuento de variantes/overrides implicados.
 */
export async function usageForItems(
  sb: SB,
  userId: string,
  itemIds: string[],
): Promise<{ variantsCount: number; overridesCount: number; referencedIds: string[] }> {
  const ids = itemIds.filter(Boolean);
  if (ids.length === 0) return { variantsCount: 0, overridesCount: 0, referencedIds: [] };
  const { data: refs, error } = await sb
    .from("variant_items")
    .select("variant_id,item_id,override_data")
    .eq("user_id", userId)
    .in("item_id", ids);
  if (error) throw new Error(error.message);

  const variants = new Set<string>();
  const referenced = new Set<string>();
  let overridesCount = 0;
  for (const r of refs ?? []) {
    variants.add(r.variant_id as string);
    referenced.add(r.item_id as string);
    const ov = r.override_data as Record<string, unknown> | null;
    if (ov && Object.keys(ov).length > 0) overridesCount++;
  }
  return { variantsCount: variants.size, overridesCount, referencedIds: [...referenced] };
}

/**
 * Borra un item del master. `force` es la aceptación EXPLÍCITA del usuario: quita
 * primero las filas de variant_items que lo referencian (a él y a sus viñetas),
 * respetando el RESTRICT del esquema, y luego borra el item (parent_id CASCADE se
 * lleva las viñetas). Sin force, si el item está referenciado el DELETE del DB
 * lanza — el borde debe consultar itemUsage antes y avisar.
 * Devuelve { deleted, childrenDeleted } para el mensaje del toast.
 */
export async function deleteItem(
  sb: SB,
  userId: string,
  itemId: string,
  opts: { force?: boolean } = {},
): Promise<{ deleted: string; childrenDeleted: number }> {
  const { data: children, error: cErr } = await sb
    .from("profile_items")
    .select("id")
    .eq("user_id", userId)
    .eq("parent_id", itemId);
  if (cErr) throw new Error(cErr.message);
  const childIds = (children ?? []).map((c) => c.id as string);

  if (opts.force) {
    const ids = [itemId, ...childIds];
    const { error: vErr } = await sb
      .from("variant_items")
      .delete()
      .eq("user_id", userId)
      .in("item_id", ids);
    if (vErr) throw new Error(vErr.message);
  }

  const { error, count } = await sb
    .from("profile_items")
    .delete({ count: "exact" })
    .eq("id", itemId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("Item no encontrado.");
  return { deleted: itemId, childrenDeleted: childIds.length };
}

/**
 * find-or-create del item skill de un grupo y fusión de chips (sin duplicar).
 * Devuelve el item resultante. Crea el grupo (origin manual) si no existía.
 */
async function upsertSkillGroup(
  sb: SB,
  userId: string,
  group: string,
  incoming: string[],
): Promise<MasterItem> {
  const wanted = normalizeSkillName(group);
  const { data: skills, error } = await sb
    .from("profile_items")
    .select(COLS)
    .eq("user_id", userId)
    .eq("kind", "skill");
  if (error) throw new Error(error.message);

  const existing = (skills ?? []).find(
    (s) => normalizeSkillName(str((s.data as Record<string, unknown>) ?? {}, "group")) === wanted,
  );

  if (existing) {
    const cur = chipsFromCsv(str((existing.data as Record<string, unknown>) ?? {}, "items"));
    const { chips } = mergeChips(cur, incoming);
    const nextData = { ...(existing.data as Record<string, unknown>), group, items: chipsToCsv(chips) };
    const { data: row, error: uErr } = await sb
      .from("profile_items")
      .update({ data: nextData })
      .eq("id", existing.id as string)
      .eq("user_id", userId)
      .select(COLS)
      .single();
    if (uErr) throw new Error(uErr.message);
    return map(row);
  }

  const { chips } = mergeChips([], incoming);
  return createItem(sb, userId, { kind: "skill", data: { group, items: chipsToCsv(chips) } });
}

/**
 * Reclasifica viñetas (u otros items con .text) a HABILIDADES: añade sus textos
 * como chips al grupo elegido (find-or-create) y luego BORRA las viñetas. Mover
 * es reversible (se vuelve a mover), así que aquí no hace falta deshacer.
 *
 * ⚠ Si alguna viñeta está referenciada por una variante (item_id RESTRICT), el
 * DELETE lanza — el borde debe consultar itemUsage y avisar igual que en el
 * borrado. Devuelve cuántas se movieron y el id del grupo destino.
 */
export async function reclassifyToSkill(
  sb: SB,
  userId: string,
  itemIds: string[],
  group: string,
  opts: { force?: boolean } = {},
): Promise<{ moved: number; group: string; skillId: string }> {
  const ids = itemIds.filter(Boolean);
  if (ids.length === 0) throw new Error("Sin items para reclasificar.");
  if (!group.trim()) throw new Error("Falta el grupo destino.");

  const { data: rows, error } = await sb
    .from("profile_items")
    .select("id,data")
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw new Error(error.message);

  const texts = (rows ?? [])
    .map((r) => str((r.data as Record<string, unknown>) ?? {}, "text").trim())
    .filter(Boolean);
  if (texts.length === 0) throw new Error("Las viñetas no tienen texto que mover.");

  const skill = await upsertSkillGroup(sb, userId, group.trim(), texts);

  // force = aceptación explícita del usuario: quita antes las referencias en
  // variantes (RESTRICT) para poder mover la viñeta.
  if (opts.force) {
    const { error: vErr } = await sb
      .from("variant_items")
      .delete()
      .eq("user_id", userId)
      .in("item_id", ids);
    if (vErr) throw new Error(vErr.message);
  }

  const { error: delErr } = await sb
    .from("profile_items")
    .delete()
    .eq("user_id", userId)
    .in("id", ids);
  if (delErr) throw new Error(delErr.message);

  return { moved: texts.length, group: group.trim(), skillId: skill.id };
}
