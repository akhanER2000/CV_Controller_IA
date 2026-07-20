import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Capa de datos de las REFERENCIAS (migraciones 0004 y 0005).
 *
 * Una referencia es un profile_item de kind 'reference' — no una tabla aparte:
 * lleva procedencia, cuelga del master, y hereda la misma RLS que todo lo demás.
 * Lo que SÍ tiene tabla propia es el VÍNCULO (`reference_links`), porque una
 * referencia no vale por sí sola: vale por el rol o el proyecto en el que
 * trabajasteis juntos, y puede ser más de uno.
 *
 * ⚠⚠ DATOS DE TERCEROS. Las filas de kind 'reference' contienen datos de PERSONAS
 * QUE NO SON EL USUARIO y que no han consentido nada de este sistema. Las reglas
 * que este módulo hace cumplir:
 *   · el VÍNCULO no puede apuntar al item de otra persona (lo garantiza el trigger
 *     anti-IDOR de 0005; aquí además se filtra por user_id en cada consulta);
 *   · una referencia no se enlaza con otra referencia (también el trigger);
 *   · nada de esto entra en un CV salvo que el usuario lo encienda EN UNA VARIANTE.
 *
 * ⚠ LAS MIGRACIONES SE APLICAN A MANO. 0004 y 0005 se ejecutan en el editor SQL de
 * Supabase, así que este código tiene que funcionar en una base donde TODAVÍA no
 * existen: `faltaMigracion()` reconoce los dos errores de Postgres que eso produce
 * y las funciones devuelven un aviso legible en vez de reventar con un mensaje
 * críptico. Degradar está bien; callar por qué, no.
 */

type SB = SupabaseClient;

/** El kind del enum item_kind que 0004 añade. Una sola fuente de verdad. */
export const REFERENCE_KIND = "reference";

/** El mensaje ÚNICO que se muestra cuando faltan las migraciones. Es el texto real
 *  (qué falta y qué hacer), no un «error inesperado». */
export const MIGRACION_PENDIENTE =
  "Las referencias necesitan las migraciones 0004 y 0005 aplicadas en Supabase " +
  "(supabase/migrations/0004_item_kind_reference.sql y 0005_reference_links.sql). " +
  "Ejecútalas en el editor SQL, primero la 0004 y después la 0005.";

/**
 * ¿Este error de Postgres es «la migración no está aplicada»? Dos casos y ni uno
 * más — cualquier otro error se propaga tal cual, porque tragárselo sería mentir
 * sobre lo que pasó:
 *   · 42P01 undefined_table      → falta reference_links (0005).
 *   · 22P02 invalid_text_repr    → 'reference' no existe en el enum item_kind (0004).
 *     Postgres lo reporta como «invalid input value for enum item_kind».
 * Se comprueba por CÓDIGO y, en su defecto, por el texto: supabase-js no siempre
 * propaga el código en errores de PostgREST.
 */
export function faltaMigracion(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  if (code === "42P01" || code === "22P02") return true;
  const msg = (typeof e.message === "string" ? e.message : "").toLowerCase();
  return (
    msg.includes("reference_links") ||
    (msg.includes("item_kind") && msg.includes("invalid input value"))
  );
}

/** Traduce un error de Supabase a algo que el usuario pueda leer y accionar. */
function alzar(error: unknown, contexto: string): never {
  if (faltaMigracion(error)) throw new Error(MIGRACION_PENDIENTE);
  const msg =
    error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "error desconocido";
  throw new Error(`${contexto}: ${msg}`);
}

// ── Tipos del contrato ───────────────────────────────────────────────────────
/** Un vínculo: con QUÉ item del master se relaciona esta referencia. */
export interface ReferenceLink {
  /** id del profile_item (rol o proyecto) al que se ancla */
  itemId: string;
  /** cómo se conocieron, en palabras del usuario. Texto libre, puede faltar. */
  relation: string | null;
}

/** Una referencia del master, con sus vínculos ya resueltos. */
export interface ReferenceView {
  id: string;
  /** los campos crudos: name, role, org, relation, email, phone */
  data: Record<string, unknown>;
  origin: string;
  sortOrder: number;
  links: ReferenceLink[];
}

/** Lo que se puede escribir en una referencia. Vocabulario CERRADO a propósito:
 *  una clave desconocida se RECHAZA, no se descarta en silencio (descartarla sería
 *  guardar algo distinto de lo que pidió el cliente y decirle que salió bien). */
export const REFERENCE_FIELDS = ["name", "role", "org", "relation", "email", "phone"] as const;
export type ReferenceField = (typeof REFERENCE_FIELDS)[number];

const MAX_FIELD = 400;

/**
 * Valida el `data` de una referencia. Devuelve el motivo del rechazo o null.
 * PURA y exportada: la usan la ruta y los tests, y es el único sitio donde se
 * decide qué es una referencia bien formada.
 *
 * El NOMBRE es obligatorio: una referencia sin nombre no es una persona, es una
 * fila vacía con el email de alguien dentro — el peor dato de terceros posible.
 */
export function invalidReferenceData(data: unknown): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return "data debe ser un objeto (ni lista ni nulo).";
  }
  const o = data as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (!(REFERENCE_FIELDS as readonly string[]).includes(k)) {
      return `Clave no permitida en una referencia: «${k}».`;
    }
    if (v === null || v === undefined) continue;
    if (typeof v !== "string") return `El valor de «${k}» debe ser texto.`;
    if (v.length > MAX_FIELD) return `«${k}» es demasiado largo (máx. ${MAX_FIELD}).`;
  }
  if (!String(o.name ?? "").trim()) return "Una referencia necesita al menos el nombre de la persona.";
  return null;
}

/**
 * Los vínculos tal y como llegan en el cuerpo de una petición, validados. Vive
 * aquí y no en la ruta porque LAS DOS rutas (POST /api/references y PATCH
 * /api/references/[id]) tienen que aceptar exactamente lo mismo: si cada una
 * validara por su cuenta, un día una aceptaría lo que la otra rechaza.
 */
export function parseLinks(raw: unknown): { error: string } | { links: ReferenceLink[] } {
  if (raw === undefined || raw === null) return { links: [] };
  if (!Array.isArray(raw)) return { error: "links debe ser una lista." };
  if (raw.length > 20) return { error: "Demasiados vínculos (máx. 20)." };
  const links: ReferenceLink[] = [];
  for (const l of raw) {
    if (typeof l !== "object" || l === null || Array.isArray(l)) {
      return { error: "Cada vínculo es { itemId, relation? }." };
    }
    const o = l as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (k !== "itemId" && k !== "relation") return { error: `Clave de vínculo no permitida: «${k}».` };
    }
    const itemId = typeof o.itemId === "string" ? o.itemId.trim() : "";
    if (!itemId) return { error: "Un vínculo necesita itemId." };
    const relation = o.relation == null ? null : String(o.relation).trim() || null;
    if (relation && relation.length > 120) return { error: "La relación es demasiado larga (máx. 120)." };
    links.push({ itemId, relation });
  }
  return { links };
}

/** Deja solo las claves válidas, recortadas, y sin las vacías. */
function limpiarData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of REFERENCE_FIELDS) {
    const v = String(data[k] ?? "").trim();
    if (v) out[k] = v;
  }
  return out;
}

// ── Lectura ──────────────────────────────────────────────────────────────────
/**
 * Todas las referencias del usuario con sus vínculos. Dos consultas y no un join:
 * PostgREST embebería reference_links dentro de profile_items solo si hay una FK
 * declarada de una a otra en el sentido que espera, y aquí hay DOS FKs a la misma
 * tabla (reference_id e item_id) — el embebido se vuelve ambiguo y frágil. Dos
 * consultas planas, filtradas por user_id las dos, no se pueden confundir.
 *
 * Si faltan las migraciones devuelve `{ references: [], migracionPendiente: true }`
 * en vez de lanzar: la pantalla tiene que poder pintar el aviso y seguir viva.
 */
export async function listReferences(
  sb: SB,
  userId: string,
): Promise<{ references: ReferenceView[]; migracionPendiente: boolean }> {
  const { data: rows, error } = await sb
    .from("profile_items")
    .select("id,data,origin,sort_order")
    .eq("user_id", userId)
    .eq("kind", REFERENCE_KIND)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    if (faltaMigracion(error)) return { references: [], migracionPendiente: true };
    alzar(error, "Leer referencias");
  }

  const refs = (rows ?? []).map((r) => ({
    id: r.id as string,
    data: (r.data as Record<string, unknown>) ?? {},
    origin: (r.origin as string) ?? "manual",
    sortOrder: (r.sort_order as number) ?? 0,
    links: [] as ReferenceLink[],
  }));
  if (refs.length === 0) return { references: refs, migracionPendiente: false };

  const { data: links, error: lErr } = await sb
    .from("reference_links")
    .select("reference_id,item_id,relation")
    .eq("user_id", userId);
  if (lErr) {
    // La tabla de vínculos puede faltar aunque el enum ya exista (0004 sin 0005).
    // Se devuelven las referencias que SÍ se pudieron leer y se dice que falta.
    if (faltaMigracion(lErr)) return { references: refs, migracionPendiente: true };
    alzar(lErr, "Leer vínculos de referencias");
  }

  const porRef = new Map<string, ReferenceLink[]>();
  for (const l of links ?? []) {
    const key = l.reference_id as string;
    const lista = porRef.get(key) ?? [];
    lista.push({ itemId: l.item_id as string, relation: (l.relation as string | null) ?? null });
    porRef.set(key, lista);
  }
  for (const r of refs) r.links = porRef.get(r.id) ?? [];
  return { references: refs, migracionPendiente: false };
}

// ── Escritura ────────────────────────────────────────────────────────────────
/** El master del usuario (o lo crea). Copiado de ensureMaster para no importar
 *  queries.ts entero desde aquí; es la misma consulta de dos líneas. */
async function masterIdOf(sb: SB, userId: string): Promise<string> {
  const { data: existing } = await sb
    .from("master_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await sb
    .from("master_profiles")
    .insert({ user_id: userId, name: "Mi carrera" })
    .select("id")
    .single();
  if (error) alzar(error, "Crear el master");
  return data!.id as string;
}

/**
 * Crea una referencia en el master (origin 'manual': la escribió el humano, que es
 * el origen más verificable) y, si se piden, sus vínculos.
 *
 * NO acepta origin externo ni evidencia: una referencia no se extrae de un CV
 * pegado — la escribe el usuario, que es quien conoce a la persona y quien tiene
 * que haberle pedido permiso.
 */
export async function createReference(
  sb: SB,
  userId: string,
  data: Record<string, unknown>,
  links: ReferenceLink[] = [],
): Promise<ReferenceView> {
  const bad = invalidReferenceData(data);
  if (bad) throw new Error(bad);
  const profileId = await masterIdOf(sb, userId);

  const { data: row, error } = await sb
    .from("profile_items")
    .insert({
      profile_id: profileId,
      user_id: userId,
      kind: REFERENCE_KIND,
      data: limpiarData(data),
      origin: "manual",
    })
    .select("id,data,origin,sort_order")
    .single();
  if (error) alzar(error, "Crear la referencia");

  const id = row!.id as string;
  const guardados = links.length ? await setReferenceLinks(sb, userId, id, links) : [];
  return {
    id,
    data: (row!.data as Record<string, unknown>) ?? {},
    origin: (row!.origin as string) ?? "manual",
    sortOrder: (row!.sort_order as number) ?? 0,
    links: guardados,
  };
}

/** Actualiza los campos de una referencia. REEMPLAZA `data` entera (como el resto
 *  del master), así que el llamante manda el objeto completo, no el campo suelto. */
export async function updateReference(
  sb: SB,
  userId: string,
  referenceId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const bad = invalidReferenceData(data);
  if (bad) throw new Error(bad);
  const { data: row, error } = await sb
    .from("profile_items")
    .update({ data: limpiarData(data) })
    .eq("id", referenceId)
    .eq("user_id", userId)
    .eq("kind", REFERENCE_KIND) // no se edita un rol por esta puerta
    .select("data")
    .maybeSingle();
  if (error) alzar(error, "Guardar la referencia");
  if (!row) throw new Error("Referencia no encontrada.");
  return (row.data as Record<string, unknown>) ?? {};
}

/**
 * Fija los vínculos de una referencia: BORRA los que ya no están y añade los
 * nuevos. Se hace por diferencia y no con un «delete all + insert»: la tabla lleva
 * created_at y unique(reference_id, item_id), y rehacer las filas idénticas
 * perdería la fecha en que se estableció el vínculo sin que nadie lo pidiera.
 *
 * El trigger de 0005 es quien de verdad impide enlazar el item de otro usuario o
 * encadenar referencias entre sí; aquí se filtra por user_id además, para que el
 * caso normal ni llegue a tocarlo.
 */
export async function setReferenceLinks(
  sb: SB,
  userId: string,
  referenceId: string,
  links: ReferenceLink[],
): Promise<ReferenceLink[]> {
  // La referencia tiene que ser del usuario Y ser una referencia. Sin esto, un id
  // de un rol propio colaría y el trigger devolvería un error crudo de Postgres.
  const { data: ref, error: refErr } = await sb
    .from("profile_items")
    .select("id")
    .eq("id", referenceId)
    .eq("user_id", userId)
    .eq("kind", REFERENCE_KIND)
    .maybeSingle();
  if (refErr) alzar(refErr, "Comprobar la referencia");
  if (!ref) throw new Error("Referencia no encontrada.");

  // Deduplica por itemId conservando el ÚLTIMO (el unique de la tabla rechazaría
  // el par repetido y el usuario vería un error de base de datos por escribir dos
  // veces el mismo proyecto en el formulario).
  const deseados = new Map<string, string | null>();
  for (const l of links) {
    const itemId = (l.itemId ?? "").trim();
    if (!itemId) continue;
    if (itemId === referenceId) throw new Error("Una referencia no se enlaza consigo misma.");
    const rel = (l.relation ?? "").trim();
    deseados.set(itemId, rel || null);
  }

  const { data: actuales, error: aErr } = await sb
    .from("reference_links")
    .select("id,item_id,relation")
    .eq("user_id", userId)
    .eq("reference_id", referenceId);
  if (aErr) alzar(aErr, "Leer los vínculos");

  const previos = new Map<string, { id: string; relation: string | null }>();
  for (const a of actuales ?? []) {
    previos.set(a.item_id as string, { id: a.id as string, relation: (a.relation as string | null) ?? null });
  }

  const sobran = [...previos.entries()].filter(([itemId]) => !deseados.has(itemId)).map(([, v]) => v.id);
  if (sobran.length) {
    const { error } = await sb.from("reference_links").delete().in("id", sobran).eq("user_id", userId);
    if (error) alzar(error, "Quitar vínculos");
  }

  const nuevos = [...deseados.entries()]
    .filter(([itemId]) => !previos.has(itemId))
    .map(([itemId, relation]) => ({
      user_id: userId,
      reference_id: referenceId,
      item_id: itemId,
      relation,
    }));
  if (nuevos.length) {
    const { error } = await sb.from("reference_links").insert(nuevos);
    if (error) alzar(error, "Vincular la referencia");
  }

  // Los que ya existían pero cambiaron de relación: se actualiza solo eso.
  for (const [itemId, relation] of deseados) {
    const prev = previos.get(itemId);
    if (!prev || prev.relation === relation) continue;
    const { error } = await sb
      .from("reference_links")
      .update({ relation })
      .eq("id", prev.id)
      .eq("user_id", userId);
    if (error) alzar(error, "Actualizar el vínculo");
  }

  return [...deseados.entries()].map(([itemId, relation]) => ({ itemId, relation }));
}

/**
 * Borra una referencia del master. Los vínculos caen solos (reference_links.
 * reference_id es ON DELETE CASCADE). Lo que NO cae solo es un variant_item que la
 * referencie: esa FK es ON DELETE RESTRICT y Postgres devolvería un error crudo,
 * así que se comprueba antes y se dice cuántas variantes la usan.
 */
export async function deleteReference(
  sb: SB,
  userId: string,
  referenceId: string,
  opts: { force?: boolean } = {},
): Promise<{ deleted: boolean; variantsCount: number }> {
  const { data: usados, error: uErr } = await sb
    .from("variant_items")
    .select("id")
    .eq("user_id", userId)
    .eq("item_id", referenceId);
  if (uErr) alzar(uErr, "Comprobar el uso de la referencia");
  const variantsCount = (usados ?? []).length;

  if (variantsCount > 0) {
    if (!opts.force) return { deleted: false, variantsCount };
    const { error } = await sb
      .from("variant_items")
      .delete()
      .eq("user_id", userId)
      .eq("item_id", referenceId);
    if (error) alzar(error, "Quitar la referencia de las variantes");
  }

  const { error } = await sb
    .from("profile_items")
    .delete()
    .eq("id", referenceId)
    .eq("user_id", userId)
    .eq("kind", REFERENCE_KIND);
  if (error) alzar(error, "Borrar la referencia");
  return { deleted: true, variantsCount };
}

/* ============================================================================
   LA SUGERENCIA — «incluiste este proyecto; su referencia está ahí»
   ============================================================================
   PURA a propósito: es la única lógica del bloque que decide qué se le PROPONE al
   usuario, y proponer no es añadir. Devuelve las referencias cuyo vínculo apunta a
   algo que ya está en la variante y que TODAVÍA no están incluidas. El editor las
   pinta como sugerencia con un botón; nada entra solo.                         */

export interface ReferenceSuggestion {
  referenceId: string;
  /** los items de la variante que la traen a cuento (para explicar el porqué) */
  becauseOf: string[];
}

/**
 * @param references  las referencias del master con sus vínculos
 * @param itemsEnVariante ids de profile_item que la variante YA incluye
 * @param yaIncluidas ids de profile_item de referencia que la variante YA incluye
 */
export function suggestReferences(
  references: ReferenceView[],
  itemsEnVariante: Iterable<string>,
  yaIncluidas: Iterable<string>,
): ReferenceSuggestion[] {
  const dentro = new Set(itemsEnVariante);
  const puestas = new Set(yaIncluidas);
  const out: ReferenceSuggestion[] = [];
  for (const r of references) {
    if (puestas.has(r.id)) continue; // ya está: sugerirla otra vez es ruido
    const becauseOf = r.links.map((l) => l.itemId).filter((id) => dentro.has(id));
    if (becauseOf.length) out.push({ referenceId: r.id, becauseOf });
  }
  return out;
}
