import type { SupabaseClient } from "@supabase/supabase-js";
import { getMasterItems, type MasterItem } from "@/lib/db/queries";
import { deleteItem, usageForItems } from "@/lib/db/master";
import {
  detectDuplicates,
  type DedupItem,
  type DetectOptions,
  type DuplicateSuspicion,
  type SuspicionLevel,
} from "@/lib/extract/dedup";

/**
 * LIMPIEZA RETROACTIVA DEL MASTER (§A4). El detector de tres niveles ya evita que
 * entre el PRÓXIMO duplicado; esto arregla los que YA entraron: 10 roles donde hay
 * 5, 33 grupos de aptitudes donde hay ~10. Al usuario no le sirve de nada blindar
 * la puerta si su registro ya está lleno.
 *
 * ⚠ REGLA INVIOLABLE: aquí no se fusiona ni se descarta NADA por cuenta propia.
 *   `clustersDeDuplicados` solo PREGUNTA (con su motivo legible delante) y
 *   `resolverDuplicado` ejecuta una decisión que el usuario ya tomó, item a item.
 *
 * POR QUÉ NO SE PERSISTE LA SOSPECHA (decisión cerrada, docs/spec/duplicados.md):
 * resolver un par MUTA el master — un item desaparece y otro cambia de campos—, y
 * cualquier marca guardada quedaría rancia en ese mismo instante. Se calcula al
 * vuelo en cada GET. Cuesta O(n²) comparaciones sobre ~150 items: microsegundos.
 */

type SB = SupabaseClient;

const COLS = "id,kind,parent_id,data,origin,evidence_snippet,evidence_verified,sort_order";

const str = (o: Record<string, unknown>, k: string): string => String(o[k] ?? "").trim();

/* ============================================================================
   QUÉ SE COMPARA Y CON QUÉ CAMPOS
   ============================================================================ */

/**
 * Kinds del master que el detector puede marcar. Las VIÑETAS no están: no se
 * comparan sueltas, se funden en el texto de su rol (es ahí donde vive la
 * identidad del hecho cuando el título y la empresa no coinciden — el mismo
 * criterio que usa la ingesta en extract/pipeline.ts).
 */
export const KINDS_DUPLICABLES = ["work", "project", "skill", "education", "certification"] as const;
const DUPLICABLE = new Set<string>(KINDS_DUPLICABLES);

export const esDuplicable = (kind: string): boolean => DUPLICABLE.has(kind);

/** Un campo comparable lado a lado. `ph` es la clave i18n de su etiqueta. */
export interface CampoDuplicado {
  clave: string;
  ph: string;
}

/**
 * Los campos que se enseñan CAMPO POR CAMPO al resolver. Una sola definición para
 * las dos puntas: la pantalla los pinta y la API valida contra ellos qué claves
 * puede tocar una fusión. Si divergieran, la fusión escribiría campos que el
 * usuario nunca vio.
 */
export const CAMPOS_POR_KIND: Record<string, CampoDuplicado[]> = {
  work: [
    { clave: "title", ph: "master.draft.title" },
    { clave: "company", ph: "master.field.company" },
    { clave: "location", ph: "master.field.location" },
    { clave: "dates", ph: "master.draft.dates" },
  ],
  project: [
    { clave: "name", ph: "master.draft.projectName" },
    { clave: "description", ph: "master.draft.projectDesc" },
    { clave: "url", ph: "master.field.url" },
  ],
  skill: [
    { clave: "group", ph: "master.skill.newGroup" },
    { clave: "items", ph: "master.dup.f.items" },
  ],
  education: [
    { clave: "degree", ph: "master.draft.degree" },
    { clave: "institution", ph: "master.draft.institution" },
    { clave: "dates", ph: "master.draft.dates" },
  ],
  certification: [
    { clave: "name", ph: "master.draft.certName" },
    { clave: "issuer", ph: "master.draft.issuer" },
    { clave: "dates", ph: "master.draft.dates" },
  ],
};

/** Qué campo hace de título en la tarjeta (el primero de la lista). */
const claveTitulo = (kind: string): string => CAMPOS_POR_KIND[kind]?.[0]?.clave ?? "title";

/* ============================================================================
   ADAPTACIÓN master → detector
   ============================================================================ */

/**
 * Un profile_item no tiene la forma de un StagedRow: los campos viven dentro de
 * `data` con nombres distintos por kind, y las viñetas son FILAS APARTE colgadas
 * por parent_id. Aquí se traduce al contrato del detector.
 *
 * `vinetas` es el texto de los hijos ya concatenado. Va dentro de `text` a
 * propósito: dos redacciones del mismo trabajo casi nunca comparten el título
 * («Software Engineering Intern» vs «becario»), y lo que sí comparten —Node,
 * Docker, «dos meses»— está en las viñetas.
 *
 * `sourceId` (n3) se queda VACÍO: MasterItem solo guarda `origin` («extracted»,
 * «manual»), que no identifica un documento. Rellenarlo con el origen subiría la
 * sospecha de TODOS los pares importados a la vez — inflarla a ciegas, que es
 * justo lo que la ingesta ya se cuida de no hacer con una sola fuente.
 */
function aDedupItem(it: MasterItem, vinetas: string): DedupItem {
  const d = it.data ?? {};
  const base = { key: it.id, kind: it.kind };
  const ev = it.evidenceSnippet ?? "";
  switch (it.kind) {
    case "work":
      return {
        ...base,
        title: str(d, "title"),
        company: str(d, "company"),
        dates: str(d, "dates"),
        text: [ev, vinetas].filter(Boolean).join(" · "),
      };
    case "project":
      return {
        ...base,
        title: str(d, "name"),
        dates: str(d, "dates"),
        text: [str(d, "description"), ev, vinetas].filter(Boolean).join(" · "),
      };
    case "skill":
      return { ...base, title: str(d, "group"), text: [str(d, "items"), ev].filter(Boolean).join(" · ") };
    case "education":
      return {
        ...base,
        title: str(d, "degree"),
        company: str(d, "institution"),
        dates: str(d, "dates"),
        text: [ev, vinetas].filter(Boolean).join(" · "),
      };
    default:
      return {
        ...base,
        title: str(d, "name"),
        company: str(d, "issuer"),
        dates: str(d, "dates"),
        text: [ev, vinetas].filter(Boolean).join(" · "),
      };
  }
}

/* ============================================================================
   CLÚSTERES
   ============================================================================ */

export interface MiembroDuplicado {
  id: string;
  kind: string;
  /** cómo se llama el item en la tarjeta (puede venir vacío: el master lo admite) */
  titulo: string;
  /** empresa · fechas, para reconocerlo de un vistazo */
  subtitulo: string;
  /** el valor de cada campo comparable, en el orden en que se pinta */
  campos: { clave: string; ph: string; valor: string }[];
  /** las viñetas que cuelgan de él (se REENGANCHAN si se descarta) */
  vinetas: { id: string; texto: string }[];
  origen: string;
  evidencia: string | null;
}

export interface ClusterDuplicado {
  /** id del miembro canónico (el primero en orden de lectura del master) */
  id: string;
  kind: string;
  /** la sospecha más fuerte del clúster */
  level: SuspicionLevel;
  /** motivo en español del par que más pesa, para pintarlo en la tarjeta */
  reason: string;
  /** unión de las señales de todos los pares del clúster */
  signals: string[];
  miembros: MiembroDuplicado[];
  pares: DuplicateSuspicion[];
}

const ORDEN: SuspicionLevel[] = ["baja", "media", "alta"];
const rango = (l: SuspicionLevel): number => ORDEN.indexOf(l);

/**
 * Los clústeres de posibles duplicados del master. Un clúster es UNA PREGUNTA:
 * «estos N items parecen el mismo hecho, ¿qué hago con ellos?». Los items que no
 * tienen sospecha no salen — no hay nada que preguntar sobre ellos.
 *
 * PURA: no toca la base. Así se puede probar con el volcado real del usuario.
 */
export function clustersDeDuplicados(items: MasterItem[], opts: DetectOptions = {}): ClusterDuplicado[] {
  // Las viñetas se indexan por padre UNA vez (barrer `items` por cada rol sería
  // cuadrático justo en el registro de 105 items que motivó todo esto).
  const hijosDe = new Map<string, MasterItem[]>();
  for (const it of items) {
    if (!it.parentId) continue;
    const l = hijosDe.get(it.parentId);
    if (l) l.push(it);
    else hijosDe.set(it.parentId, [it]);
  }
  const textoHijos = (id: string): string =>
    (hijosDe.get(id) ?? [])
      .map((h) => str(h.data ?? {}, "text"))
      .filter(Boolean)
      .join(" · ");

  const candidatos = items.filter((it) => DUPLICABLE.has(it.kind) && !it.parentId);
  const pares = detectDuplicates(
    candidatos.map((it) => aDedupItem(it, textoHijos(it.id))),
    opts,
  );
  if (pares.length === 0) return [];

  // union-find sobre los pares detectados: el clúster es la clausura transitiva
  // («A repite a B» + «B repite a C» ⇒ los tres son el mismo hecho).
  const padre = new Map<string, string>();
  for (const it of candidatos) padre.set(it.id, it.id);
  const find = (k: string): string => {
    let r = k;
    while (padre.get(r) !== r) r = padre.get(r)!;
    while (padre.get(k) !== r) {
      const n = padre.get(k)!;
      padre.set(k, r);
      k = n;
    }
    return r;
  };
  for (const p of pares) {
    const ra = find(p.aKey);
    const rb = find(p.bKey);
    if (ra !== rb) padre.set(rb, ra);
  }

  // Los miembros se recogen en el orden de lectura del master (`items` ya viene
  // por sort_order): el primero es el candidato a canónico, y es el que la
  // pantalla propone conservar por defecto.
  const grupos = new Map<string, MasterItem[]>();
  for (const it of candidatos) {
    const r = find(it.id);
    const g = grupos.get(r);
    if (g) g.push(it);
    else grupos.set(r, [it]);
  }

  const paresDe = new Map<string, DuplicateSuspicion[]>();
  for (const p of pares) {
    const r = find(p.aKey);
    const l = paresDe.get(r);
    if (l) l.push(p);
    else paresDe.set(r, [p]);
  }

  const out: ClusterDuplicado[] = [];
  for (const [raiz, miembrosItems] of grupos) {
    if (miembrosItems.length < 2) continue; // sin par no hay pregunta
    const ps = paresDe.get(raiz) ?? [];
    // `pares` viene ordenado por sospecha descendente: el primero manda.
    const fuerte = ps[0];
    const signals = [...new Set(ps.flatMap((p) => p.signals))];
    out.push({
      id: miembrosItems[0]!.id,
      kind: miembrosItems[0]!.kind,
      level: fuerte?.level ?? "media",
      reason: fuerte?.reason ?? "",
      signals,
      pares: ps,
      miembros: miembrosItems.map((it) => {
        const d = it.data ?? {};
        const campos = (CAMPOS_POR_KIND[it.kind] ?? []).map((c) => ({
          clave: c.clave,
          ph: c.ph,
          valor: str(d, c.clave),
        }));
        const empresa = str(d, "company") || str(d, "institution") || str(d, "issuer");
        const fechas = str(d, "dates");
        return {
          id: it.id,
          kind: it.kind,
          titulo: str(d, claveTitulo(it.kind)),
          subtitulo: [empresa, fechas].filter(Boolean).join(" · "),
          campos,
          vinetas: (hijosDe.get(it.id) ?? []).map((h) => ({ id: h.id, texto: str(h.data ?? {}, "text") })),
          origen: it.origin,
          evidencia: it.evidenceSnippet,
        };
      }),
    });
  }

  // Lo más sospechoso arriba; a igualdad, el clúster más gordo (es el que más
  // items le quita de encima al usuario en una sola decisión).
  return out.sort(
    (a, b) => rango(b.level) - rango(a.level) || b.miembros.length - a.miembros.length,
  );
}

/** Los clústeres del master del usuario (RLS por auth.uid()). */
export async function duplicadosDelMaster(
  sb: SB,
  userId: string,
  opts: DetectOptions = {},
): Promise<{ clusters: ClusterDuplicado[]; itemsRepetidos: number }> {
  const items = await getMasterItems(sb, userId);
  const clusters = clustersDeDuplicados(items, opts);
  // «cuántos items sobran SI el usuario confirma todo»: nunca es una promesa de
  // borrado, es la magnitud del trabajo pendiente. Sale de datos reales.
  const itemsRepetidos = clusters.reduce((n, c) => n + c.miembros.length - 1, 0);
  return { clusters, itemsRepetidos };
}

/* ============================================================================
   RESOLUCIÓN — la ejecuta el usuario, nunca el sistema
   ============================================================================ */

export type DestinoVinetas = "reenganchar" | "descartar";

export interface ResolverArgs {
  /** el item que se queda */
  keepId: string;
  /** los que se descartan (uno, o varios si el clúster tiene más de dos) */
  dropIds: string[];
  /**
   * Solo en «fusionar»: el valor ELEGIDO por el usuario para cada campo. Las
   * claves tienen que estar en CAMPOS_POR_KIND del kind — es decir, campos que
   * el usuario tuvo delante. Se fusiona sobre la data previa del que se queda.
   */
  data?: Record<string, unknown>;
  /** por defecto REENGANCHAR: perder viñetas en silencio es el peor fallo posible */
  vinetas?: DestinoVinetas;
  /** el usuario aceptó seguir aunque alguna variante use lo que se descarta */
  force?: boolean;
  /** no toca nada: solo informa de a qué se expone (pre-chequeo del borde) */
  dryRun?: boolean;
}

export interface ResolverResultado {
  keepId: string;
  descartados: string[];
  vinetasReenganchadas: number;
  vinetasDescartadas: number;
  /** dónde se usa lo que se va a borrar (variantes / overrides) */
  usage: { variantsCount: number; overridesCount: number; referencedIds: string[] };
  /**
   * true ⇒ NO se hizo nada porque hace falta la confirmación explícita del
   * usuario (lo que se descarta lo usa alguna variante, ON DELETE RESTRICT).
   */
  bloqueado: boolean;
}

const MAX_DATA_BYTES = 64 * 1024;

/** Motivo del rechazo de la data de una fusión, o null si se puede escribir. */
export function invalidMergeData(kind: string, data: unknown): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return "La fusión debe ser un objeto de campos.";
  }
  const permitidas = new Set((CAMPOS_POR_KIND[kind] ?? []).map((c) => c.clave));
  if (permitidas.size === 0) return `No se puede fusionar un item de tipo «${kind}».`;
  let bytes = 0;
  try {
    bytes = JSON.stringify(data).length;
  } catch {
    return "La fusión no es serializable.";
  }
  if (bytes > MAX_DATA_BYTES) return "La fusión es demasiado grande.";
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    // Se RECHAZA la clave desconocida en vez de descartarla en silencio: descartar
    // sería guardar algo distinto de lo que el usuario eligió y decirle que salió
    // bien. Además impide que por aquí se cuele un campo que no estaba en pantalla.
    if (!permitidas.has(k)) return `Campo no comparable en «${kind}»: «${k}».`;
    if (v === null) continue;
    const ty = typeof v;
    if (ty !== "string" && ty !== "number" && ty !== "boolean") {
      return `El valor de «${k}» debe ser texto, número o booleano.`;
    }
  }
  return null;
}

/**
 * Aplica LA DECISIÓN DEL USUARIO sobre un clúster. Las tres acciones de la
 * pantalla («quedarme con esta» · «quedarme con la otra» · «fusionar») son la
 * MISMA operación con distintos argumentos: se conserva un item —con los campos
 * que el usuario eligió, si fusionó— y se descartan los demás.
 *
 * ⚠ DOS TRAMPAS DEL ESQUEMA, las dos contempladas aquí:
 *
 *   1. `variant_items.item_id` es ON DELETE RESTRICT a propósito: borrar del
 *      master no puede destruir en silencio un override de una variante. Sin
 *      pre-chequeo, Postgres devuelve un error crudo y el usuario ve un 500. Aquí
 *      se mira ANTES (usageForItems) y se devuelve `bloqueado` con el dato real
 *      para que el borde diga en cuántas variantes se usa y ofrezca seguir.
 *
 *   2. `profile_items.parent_id` es ON DELETE CASCADE: descartar un rol se lleva
 *      sus viñetas por delante. Por eso las viñetas del descartado se REENGANCHAN
 *      al que se queda ANTES de borrar. Perderlas sería pérdida de dato
 *      silenciosa — el fallo más grave que puede tener esta pantalla.
 */
export async function resolverDuplicado(
  sb: SB,
  userId: string,
  args: ResolverArgs,
): Promise<ResolverResultado> {
  const keepId = args.keepId;
  const dropIds = [...new Set(args.dropIds.filter(Boolean))];
  const destino: DestinoVinetas = args.vinetas ?? "reenganchar";

  if (!keepId) throw new Error("Falta el item que se queda.");
  if (dropIds.length === 0) throw new Error("Falta el item que se descarta.");
  if (dropIds.includes(keepId)) throw new Error("El item que se queda no puede descartarse a la vez.");

  // Todos tienen que existir, ser del usuario y ser del MISMO tipo: fusionar un
  // rol con un grupo de habilidades no es una decisión, es un error de cliente.
  const { data: filas, error: fErr } = await sb
    .from("profile_items")
    .select(COLS)
    .eq("user_id", userId)
    .in("id", [keepId, ...dropIds]);
  if (fErr) throw new Error(fErr.message);
  const porId = new Map((filas ?? []).map((r) => [r.id as string, r as Record<string, unknown>]));
  const keep = porId.get(keepId);
  if (!keep) throw new Error("El item que se queda no existe o no es tuyo.");
  for (const id of dropIds) {
    if (!porId.get(id)) throw new Error("Uno de los items a descartar no existe o no es tuyo.");
  }
  const kind = String(keep.kind ?? "");
  for (const id of dropIds) {
    if (String(porId.get(id)!.kind ?? "") !== kind) {
      throw new Error("No se pueden resolver juntos items de tipos distintos.");
    }
  }

  // Las viñetas del descartado. Se listan SIEMPRE, aunque se vayan a reenganchar:
  // hacen falta para contar y para saber si el borrado las arrastraría.
  const { data: hijos, error: hErr } = await sb
    .from("profile_items")
    .select("id,sort_order")
    .eq("user_id", userId)
    .in("parent_id", dropIds);
  if (hErr) throw new Error(hErr.message);
  const hijosIds = (hijos ?? []).map((h) => h.id as string).filter((id) => id !== keepId);

  // Lo que de verdad se va a BORRAR. Si las viñetas se reenganchan, sobreviven, y
  // por tanto las referencias de las variantes a ESAS viñetas siguen siendo
  // válidas: no deben bloquear nada. Solo entran en la cuenta si se descartan.
  const idsABorrar = destino === "descartar" ? [...dropIds, ...hijosIds] : [...dropIds];
  const usage = await usageForItems(sb, userId, idsABorrar);
  const bloqueado = usage.referencedIds.length > 0 && args.force !== true;

  if (args.dryRun || bloqueado) {
    return {
      keepId,
      descartados: [],
      vinetasReenganchadas: 0,
      vinetasDescartadas: 0,
      usage,
      bloqueado,
    };
  }

  // ── 1 · la fusión campo a campo ────────────────────────────────────────────
  // patchMasterItem y el resto del código REEMPLAZAN la columna `data` entera,
  // así que se manda el spread de la previa: mandar solo los campos elegidos
  // borraría los que el usuario no tocó (location, sourceContext, dateStart…).
  if (args.data && Object.keys(args.data).length > 0) {
    const bad = invalidMergeData(kind, args.data);
    if (bad) throw new Error(bad);
    const previa = (keep.data as Record<string, unknown>) ?? {};
    const { error: uErr } = await sb
      .from("profile_items")
      .update({ data: { ...previa, ...args.data } })
      .eq("id", keepId)
      .eq("user_id", userId);
    if (uErr) throw new Error(uErr.message);
  }

  // ── 2 · las viñetas, ANTES de borrar (si no, se las lleva el CASCADE) ───────
  let reenganchadas = 0;
  if (destino === "reenganchar" && hijosIds.length > 0) {
    // Van DETRÁS de las que ya tiene el que se queda: el orden de lectura de un
    // rol es su argumento, y meterlas intercaladas lo rompe sin avisar.
    const { data: ultimo } = await sb
      .from("profile_items")
      .select("sort_order")
      .eq("user_id", userId)
      .eq("parent_id", keepId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    let orden = ((ultimo?.sort_order as number | undefined) ?? (keep.sort_order as number | undefined) ?? 0) + 1;
    for (const id of hijosIds) {
      const { error } = await sb
        .from("profile_items")
        .update({ parent_id: keepId, sort_order: orden })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      orden++;
      reenganchadas++;
    }
  }

  // ── 3 · descartar. force = la aceptación explícita del usuario ─────────────
  const descartados: string[] = [];
  let descartadasVinetas = 0;
  for (const id of dropIds) {
    const r = await deleteItem(sb, userId, id, { force: args.force === true });
    descartados.push(r.deleted);
    descartadasVinetas += r.childrenDeleted;
  }

  return {
    keepId,
    descartados,
    vinetasReenganchadas: reenganchadas,
    vinetasDescartadas: descartadasVinetas,
    usage,
    bloqueado: false,
  };
}
