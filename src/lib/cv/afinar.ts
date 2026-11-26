import { z } from "zod";
// Import RELATIVO a propósito (igual que ajuste.ts): Vitest carga este módulo
// directamente y no debe arrastrar `server-only` ni el alias "@/". Todo lo que hay
// aquí es PURO: entran los items, el objetivo y la evidencia; salen propuestas. El
// I/O (modelo, base de datos) vive en la ruta /api/variants/[id]/afinar.
import { normalize, preservesFacts } from "../verify";
import { calcularFaltas, campoDe, textoDeItem, type AjusteItem } from "./ajuste";
// Las REGLAS de la variante (DA-R1): se suman al candado, verify.ts no se toca.
import { esObligatorio, reglasParaPrompt, terminoExcluidoEn, type Reglas } from "./reglas";

/**
 * «AFINAR CON IA» — el motor. La variante puede quedarse con el texto del master
 * (como siempre) o AFINADA: la IA reescribe resumen, viñetas y proyectos más
 * directos hacia el rol objetivo. Lo que NO hace, dicho primero:
 *
 *  · NO inventa. Cada reescritura pasa el candado (preservesFacts) contra una base
 *    de hechos ESTRECHA: el texto del MASTER de ese item + su evidencia VERIFICADA.
 *    Una tecnología que está en la evidencia del item, sí; una que no está en
 *    ninguno de los dos, nunca. El aviso y el título objetivo ORIENTAN, no
 *    autorizan: que la oferta pida Kafka no pone Kafka en una viñeta.
 *  · NO recorta hechos. Una reescritura que se come una cifra o un nombre propio
 *    del original tampoco se aplica: «más directo» es quitar relleno, no datos.
 *  · NO pisa al usuario. Un item editado a mano en esta variante no se toca.
 *  · «SIN RESPALDO» NO PASA POR LA IA (DA-M3). Si una aptitud declarada aparece
 *    literal en otro item del master, se hace visible ESE item; si no aparece en
 *    ninguno, se oculta la aptitud en esta variante. Nunca se escribe una viñeta.
 *
 * Lo que no pasa no se ofrece «con un aviso»: se descarta y se dice por qué.
 */

// ── El item tal y como lo ve el afinado ──────────────────────────────────────
export interface AfinarItem extends AjusteItem {
  /** el texto del MASTER en el campo editable: base de hechos y lo que deja Revertir */
  maestro: string;
  /** evidencia VERIFICADA del item del master ("" si no hay o no está verificada) */
  evidencia: string;
}

/** Un item del master, con lo justo para buscar respaldo y su evidencia. */
export interface MaestroRef {
  id: string;
  kind: string;
  parentId: string | null;
  data: Record<string, unknown>;
  sortOrder: number;
  evidenceSnippet?: string | null;
  evidenceVerified?: boolean;
}

export type SeccionAfinar = "summary" | "work" | "projects" | "skills";
export const SECCIONES_AFINAR: readonly SeccionAfinar[] = ["summary", "work", "projects", "skills"];
export type AlcanceAfinar = "todo" | SeccionAfinar | { itemId: string };

/** La sección del editor en la que vive un kind afinable. */
export function seccionDeKind(kind: string): SeccionAfinar | null {
  if (kind === "summary") return "summary";
  if (kind === "bullet") return "work";
  if (kind === "project") return "projects";
  if (kind === "skill") return "skills";
  return null;
}

/** Normaliza lo que llega en el cuerpo de la petición. Basura → null. */
export function alcanceDe(v: unknown): AlcanceAfinar | null {
  if (v === undefined || v === null || v === "todo") return "todo";
  if (typeof v === "string" && (SECCIONES_AFINAR as readonly string[]).includes(v)) return v as SeccionAfinar;
  if (typeof v === "object" && v && typeof (v as { itemId?: unknown }).itemId === "string") {
    const itemId = (v as { itemId: string }).itemId.trim();
    return itemId ? { itemId } : null;
  }
  return null;
}

const str = (o: Record<string, unknown> | null | undefined, k: string): string => {
  const v = o?.[k];
  return v == null ? "" : String(v);
};

/** El item de ajuste + el texto del master y su evidencia verificada. */
export function itemDeAfinar(base: AjusteItem, maestro: MaestroRef | undefined): AfinarItem {
  const campo = base.campo ?? campoDe(base.kind);
  return {
    ...base,
    maestro: campo ? str(maestro?.data, campo) : "",
    evidencia: maestro?.evidenceVerified ? (maestro.evidenceSnippet ?? "").trim() : "",
  };
}

/** ¿Este item entra en el alcance pedido? Solo los que tienen texto reescribible. */
export function enAlcance(it: AjusteItem, alcance: AlcanceAfinar): boolean {
  if (!it.campo || !it.visible) return false;
  if (alcance === "todo") return true;
  if (typeof alcance === "object") return it.id === alcance.itemId || it.itemId === alcance.itemId;
  return seccionDeKind(it.kind) === alcance;
}

/** ¿El alcance incluye resolver las aptitudes «sin respaldo»? */
export function incluyeAptitudes(alcance: AlcanceAfinar): boolean {
  return alcance === "todo" || alcance === "skills";
}

// ── Lo que le pedimos al modelo ──────────────────────────────────────────────
/** Sin puntuaciones ni números propios: el modelo rellenaría una cifra sin fuente. */
export const AfinarPlanSchema = z.object({
  propuestas: z
    .array(
      z.object({
        id: z.string().describe("id EXACTO de la lista dada. No inventes ids."),
        propuesto: z
          .string()
          .describe(
            "El texto reescrito, más directo hacia el rol objetivo. ★ REGLA DURA: usa SOLO hechos del " +
              "texto del item y de su EVIDENCIA. Conserva TODAS las cifras con su unidad y TODOS los " +
              "nombres propios, siglas y tecnologías del original. No añadas ninguna cifra, sigla ni " +
              "tecnología que no esté en el item o en su evidencia. Si no puedes mejorarlo así, NO lo incluyas.",
          ),
        motivo: z.string().describe("Qué cambia y por qué acerca el item al rol. Una frase, sin datos nuevos."),
      }),
    )
    .describe("Una reescritura por item que de verdad mejore. Los que ya están bien, fuera."),
  notas: z.string().describe("Notas honestas para el usuario (una o dos frases)."),
});
export type AfinarPlan = z.infer<typeof AfinarPlanSchema>;

/** La función inyectable que llama al modelo (el LLM real se arma en la ruta). */
export type AfinarLLM = (input: {
  items: AfinarItem[];
  targetTitle: string;
  aviso: string;
  /** las reglas de la variante como texto de prompt (vacío si no hay). */
  reglas?: string;
}) => Promise<AfinarPlan>;

/** Razón de descarte si el texto nombra un término que las reglas excluyen; null si no. */
export function razonPorReglas(texto: string, reglas: Reglas | undefined): string | null {
  const t = reglas ? terminoExcluidoEn(texto, reglas) : null;
  return t ? `nombra «${t}», que las reglas de la variante excluyen` : null;
}

/**
 * Las acciones «sin respaldo» que las reglas permiten: un item OBLIGATORIO nunca se
 * oculta, y no se muestra ni añade un item que nombra un término excluido.
 */
export function respaldoSegunReglas(acciones: AccionRespaldo[], reglas: Reglas | undefined): AccionRespaldo[] {
  if (!reglas) return acciones;
  return acciones.filter((a) => {
    if (a.tipo === "ocultar-grupo") return !esObligatorio(reglas, a.itemId);
    if (a.tipo === "mostrar" || a.tipo === "anadir") return !terminoExcluidoEn(a.texto, reglas);
    return true;
  });
}

// ── La salida ────────────────────────────────────────────────────────────────
export interface PropuestaAfinar {
  /** id del variant_item */
  id: string;
  /** id del profile_item (master) — el source_item del override */
  itemId: string;
  kind: string;
  campo: string;
  /** el texto del MASTER (lo que deja Revertir) */
  original: string;
  propuesto: string;
  motivo: string;
}

/**
 * Lo que se aplicó, de forma que se pueda DESHACER sin adivinar. `antes` es el
 * override_data que había: Revertir no puede inventarse el estado anterior.
 */
export type AplicadoAfinar =
  | ({ tipo: "texto"; antes: Record<string, unknown> | null } & PropuestaAfinar)
  | { tipo: "mostrar"; id: string; itemId: string; kind: string; aptitudes: string[]; texto: string }
  | { tipo: "anadir"; id: string; itemId: string; kind: string; aptitudes: string[]; texto: string }
  | {
      tipo: "ocultar-aptitud";
      id: string;
      itemId: string;
      kind: "skill";
      aptitudes: string[];
      original: string;
      propuesto: string;
      antes: Record<string, unknown> | null;
    }
  | { tipo: "ocultar-grupo"; id: string; itemId: string; kind: "skill"; aptitudes: string[]; texto: string };

export interface DescartadoAfinar {
  id: string;
  propuesto: string;
  razon: string;
  nuevas?: { cifras: string[]; entidades: string[] };
  perdidas?: { cifras: string[]; entidades: string[] };
}

export interface AfinadoResult {
  propuestas: PropuestaAfinar[];
  descartados: DescartadoAfinar[];
  notas: string;
}

// ── ★ EL CANDADO DEL AFINADO ─────────────────────────────────────────────────
export interface VeredictoAfinado {
  ok: boolean;
  razon: string;
  nuevas: { cifras: string[]; entidades: string[] };
  perdidas: { cifras: string[]; entidades: string[] };
}

/**
 * Dos direcciones, las dos con preservesFacts (verify.ts, que no se toca):
 *  1. Nada nuevo: cifras y entidades del propuesto ⊂ maestro + evidencia verificada.
 *  2. Nada perdido: cifras y entidades del maestro ⊂ propuesto. Se mide con el
 *     mismo control invertido — lo que el MAESTRO trae y el propuesto no.
 * Y además: no vacío, y distinto del original (un «afinado» idéntico no es nada).
 */
export function verificarAfinado(maestro: string, evidencia: string, propuesto: string): VeredictoAfinado {
  const p = (propuesto ?? "").trim();
  const vacio = { cifras: [] as string[], entidades: [] as string[] };
  if (!p) return { ok: false, razon: "la propuesta está vacía", nuevas: vacio, perdidas: vacio };
  if (!maestro.trim()) return { ok: false, razon: "el item no tiene texto en el master", nuevas: vacio, perdidas: vacio };
  if (normalize(p) === normalize(maestro)) {
    return { ok: false, razon: "la propuesta es igual al original", nuevas: vacio, perdidas: vacio };
  }

  const ida = preservesFacts(maestro, p, evidencia);
  const vuelta = preservesFacts(p, maestro);
  const nuevas = { cifras: ida.newNumbers, entidades: ida.newEntities };
  const perdidas = { cifras: vuelta.newNumbers, entidades: vuelta.newEntities };

  const partes: string[] = [];
  if (nuevas.cifras.length) partes.push(`aparecen cifras que no estaban (${nuevas.cifras.join(", ")})`);
  if (nuevas.entidades.length) partes.push(`aparecen nombres que no estaban (${nuevas.entidades.join(", ")})`);
  if (perdidas.cifras.length) partes.push(`se pierden cifras del original (${perdidas.cifras.join(", ")})`);
  if (perdidas.entidades.length) partes.push(`se pierden nombres del original (${perdidas.entidades.join(", ")})`);
  return { ok: partes.length === 0, razon: partes.join("; "), nuevas, perdidas };
}

/** Un motivo que mete datos que no están en el item se cae (la propuesta sigue). */
function sanearMotivo(motivo: string, fuente: string): string {
  const m = (motivo ?? "").trim();
  if (!m) return "";
  return preservesFacts(fuente, m).ok ? m : "";
}

/** Por qué un item ni siquiera se le enseña al modelo. null = se enseña. */
export function razonParaNoAfinar(it: AfinarItem): string | null {
  if (it.origen === "manual") return "editado a mano en esta variante: no se pisa";
  if (!it.maestro.trim()) return "el item no tiene texto en el master";
  return null;
}

/** Las líneas del prompt: id, tipo, texto del master y la evidencia si la hay. */
export function lineasDelPromptAfinar(items: AfinarItem[]): string {
  return items
    .map(
      (i) =>
        `- [${i.id}] (${i.kind}) ${i.maestro}` + (i.evidencia ? `\n  EVIDENCIA VERIFICADA: «${i.evidencia}»` : ""),
    )
    .join("\n");
}

/**
 * Pide las reescrituras y devuelve SOLO las que pasan el candado. El resto, a
 * `descartados` con el motivo exacto: «la IA no propuso nada» y «la IA propuso una
 * invención y la paramos» no pueden verse igual desde fuera.
 */
export async function construirAfinado(
  input: { items: AfinarItem[]; alcance: AlcanceAfinar; targetTitle: string; aviso?: string; reglas?: Reglas },
  { llm }: { llm: AfinarLLM },
): Promise<AfinadoResult> {
  const descartados: DescartadoAfinar[] = [];
  const candidatos: AfinarItem[] = [];
  for (const it of input.items) {
    if (!enAlcance(it, input.alcance)) continue;
    const no = razonParaNoAfinar(it);
    if (no) descartados.push({ id: it.id, propuesto: "", razon: no });
    else candidatos.push(it);
  }
  if (!candidatos.length) return { propuestas: [], descartados, notas: "" };

  const textoReglas = input.reglas ? reglasParaPrompt(input.reglas) : "";
  const plan = await llm({
    items: candidatos,
    targetTitle: input.targetTitle,
    aviso: (input.aviso ?? "").trim(),
    ...(textoReglas ? { reglas: textoReglas } : {}),
  });
  const porId = new Map(candidatos.map((i) => [i.id, i]));
  const propuestas: PropuestaAfinar[] = [];
  const ya = new Set<string>();

  for (const p of Array.isArray(plan?.propuestas) ? plan.propuestas : []) {
    const id = String(p?.id ?? "");
    const propuesto = String(p?.propuesto ?? "").trim();
    const it = porId.get(id);
    if (!it) {
      descartados.push({ id, propuesto, razon: "ese item no está en lo que se pidió afinar" });
      continue;
    }
    if (ya.has(it.id)) continue;
    const v = verificarAfinado(it.maestro, it.evidencia, propuesto);
    if (!v.ok) {
      descartados.push({ id: it.id, propuesto, razon: v.razon, nuevas: v.nuevas, perdidas: v.perdidas });
      continue;
    }
    const rr = razonPorReglas(propuesto, input.reglas);
    if (rr) {
      descartados.push({ id: it.id, propuesto, razon: rr });
      continue;
    }
    ya.add(it.id);
    propuestas.push({
      id: it.id,
      itemId: it.itemId,
      kind: it.kind,
      campo: it.campo!,
      original: it.maestro,
      propuesto,
      motivo: sanearMotivo(p?.motivo ?? "", `${it.maestro} ${it.evidencia} ${input.targetTitle}`),
    });
  }

  return { propuestas, descartados, notas: String(plan?.notas ?? "").trim() };
}

// ── «SIN RESPALDO», sin IA ───────────────────────────────────────────────────
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tieneToken = (texto: string, term: string) =>
  new RegExp(`(^|[^a-z0-9])${escapeRe(term)}($|[^a-z0-9])`, "i").test(texto);

/** Lo que hay que hacer con las aptitudes sin respaldo. Ninguna acción escribe texto nuevo. */
export type AccionRespaldo =
  /** un item de la variante, oculto, que respalda la aptitud: se hace visible */
  | { tipo: "mostrar"; id: string; itemId: string; kind: string; aptitudes: string[]; texto: string }
  /** un item del master que NO está en la variante: se añade (cuelga de un rol visible) */
  | { tipo: "anadir"; itemId: string; kind: string; aptitudes: string[]; texto: string }
  /** ninguna fuente: la aptitud se quita de la lista del grupo en ESTA variante */
  | { tipo: "ocultar-aptitud"; id: string; itemId: string; aptitudes: string[]; original: string; propuesto: string }
  /** el grupo se queda sin ninguna aptitud respaldada: se oculta entero */
  | { tipo: "ocultar-grupo"; id: string; itemId: string; aptitudes: string[]; texto: string };

const KINDS_RESPALDO = new Set(["bullet", "project"]);

/**
 * Resuelve las «sin respaldo» que calcula calcularFaltas (la misma función que el
 * editor y Ajustar). Para cada aptitud suelta:
 *  1. busca un item del master (viñeta o proyecto) donde aparezca LITERAL y que se
 *     pueda enseñar en esta variante: o ya está en la variante oculto, o es una
 *     viñeta de un rol visible / un proyecto;
 *  2. si lo hay, ese item se hace visible (o se añade) — el respaldo es REAL;
 *  3. si no, la aptitud se oculta en esta variante. Nunca se redacta nada.
 */
export function resolverSinRespaldo(items: AjusteItem[], master: MaestroRef[]): AccionRespaldo[] {
  const faltas = calcularFaltas(items).filter((f) => f.tipo === "sin-respaldo");
  if (!faltas.length) return [];

  const porMaster = new Map(items.map((i) => [i.itemId, i]));
  const rolVisible = (parentId: string | null) =>
    !!parentId && items.some((i) => i.kind === "work" && i.itemId === parentId && i.visible);

  // Candidatos en orden de lectura del master; cada uno con su texto normalizado.
  const candidatos = master
    .filter((m) => KINDS_RESPALDO.has(m.kind))
    .filter((m) => {
      const enVar = porMaster.get(m.id);
      if (enVar?.visible) return false; // ya visible: si respaldara, no habría falta
      return m.kind === "project" || rolVisible(m.parentId);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => {
      const enVar = porMaster.get(m.id);
      const texto = enVar ? enVar.texto : textoDeItem(m.kind, m.data);
      return { m, enVar, texto, norm: normalize(texto) };
    });

  const acciones: AccionRespaldo[] = [];
  const usados = new Map<string, AccionRespaldo & { aptitudes: string[] }>();

  for (const f of faltas) {
    const skill = items.find((i) => i.id === f.id);
    if (!skill) continue;
    const sueltas = f.detalle.split(",").map((s) => s.trim()).filter(Boolean);
    const sinFuente: string[] = [];

    for (const apt of sueltas) {
      const c = candidatos.find((x) => tieneToken(x.norm, normalize(apt)));
      if (!c) {
        sinFuente.push(apt);
        continue;
      }
      const ya = usados.get(c.m.id);
      if (ya) {
        if (!ya.aptitudes.includes(apt)) ya.aptitudes.push(apt);
        continue;
      }
      const accion: AccionRespaldo = c.enVar
        ? { tipo: "mostrar", id: c.enVar.id, itemId: c.m.id, kind: c.m.kind, aptitudes: [apt], texto: c.texto }
        : { tipo: "anadir", itemId: c.m.id, kind: c.m.kind, aptitudes: [apt], texto: c.texto };
      usados.set(c.m.id, accion);
      acciones.push(accion);
    }

    if (!sinFuente.length) continue;
    const quitar = new Set(sinFuente.map((s) => normalize(s)));
    const original = str(skill.datos, "items");
    const quedan = original
      .split(/[,;·]/)
      .map((s) => s.trim())
      .filter((s) => s && !quitar.has(normalize(s)));
    if (quedan.length) {
      acciones.push({
        tipo: "ocultar-aptitud",
        id: skill.id,
        itemId: skill.itemId,
        aptitudes: sinFuente,
        original,
        propuesto: quedan.join(", "),
      });
    } else {
      acciones.push({ tipo: "ocultar-grupo", id: skill.id, itemId: skill.itemId, aptitudes: sinFuente, texto: skill.texto });
    }
  }
  return acciones;
}

// ── Revertir ─────────────────────────────────────────────────────────────────
/** Una operación de deshacer, en términos del contrato de variant_items. */
export type OpRevertir =
  | { op: "override"; id: string; override_data: Record<string, unknown> | null }
  | { op: "visible"; id: string; visible: boolean }
  | { op: "quitar"; id: string };

/**
 * El plan para deshacer un afinado. Texto → el master (se quita el campo afinado
 * del override; si no queda nada, override null = hereda del master). Lo mostrado
 * se vuelve a ocultar, lo añadido se quita y la lista de aptitudes vuelve a la que
 * había. Deshacer en orden inverso: lo último aplicado, lo primero revertido.
 */
export function planRevertir(aplicados: readonly AplicadoAfinar[]): OpRevertir[] {
  const ops: OpRevertir[] = [];
  for (const a of [...aplicados].reverse()) {
    switch (a.tipo) {
      case "texto": {
        const resto = { ...(a.antes ?? {}) };
        delete resto[a.campo];
        ops.push({ op: "override", id: a.id, override_data: Object.keys(resto).length ? resto : null });
        break;
      }
      case "mostrar":
      case "ocultar-grupo":
        ops.push({ op: "visible", id: a.id, visible: a.tipo === "ocultar-grupo" });
        break;
      case "anadir":
        ops.push({ op: "quitar", id: a.id });
        break;
      case "ocultar-aptitud":
        ops.push({ op: "override", id: a.id, override_data: a.antes });
        break;
    }
  }
  return ops;
}

/** Cuenta para el resumen: afinados (texto) y resueltos (sin respaldo). */
export function resumenAfinado(aplicados: readonly AplicadoAfinar[], descartados: readonly DescartadoAfinar[]) {
  const afinados = aplicados.filter((a) => a.tipo === "texto").length;
  return { afinados, respaldo: aplicados.length - afinados, descartados: descartados.length };
}
