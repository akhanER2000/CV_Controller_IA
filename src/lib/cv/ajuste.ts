import { z } from "zod";
// Import RELATIVO a propósito (igual que variant-ai.ts): este módulo lo carga
// Vitest directamente y no debe arrastrar `server-only` ni el alias "@/". Todo lo
// que hay aquí es PURO: entra un plan, sale una propuesta. El I/O vive en la ruta.
import {
  extractNumbers,
  normalize,
  preservesFacts,
  preservesFactsWhenShortening,
} from "../verify";

/**
 * «AJUSTAR A DOS PÁGINAS» — el motor de la PROPUESTA. Es la operación de más
 * riesgo del producto, así que conviene decir primero lo que NO es:
 *
 *  · NO aplica nada. Devuelve una propuesta revisable. Quitar, reordenar y acortar
 *    los ejecuta el usuario uno a uno, y cada uno viaja por su propio endpoint.
 *  · NO puntúa. No existe «85 % de ajuste»: existe «sobran 14 líneas», que sale de
 *    MEDIR el PDF (medir.ts) y que el usuario puede ir a comprobar contando.
 *  · NO inventa. Selecciona, ordena y acorta. Todo texto que se enseña sale del
 *    item real; del modelo solo se acepta un ID, un ORDEN y un texto acortado que
 *    haya pasado el candado.
 *
 * ★ EL ESCEPTICISMO ES EL DISEÑO. La salida del LLM se trata como entrada hostil,
 * exactamente igual que en variant-ai.ts: ids que no existen se caen, kinds que no
 * se pueden tocar se caen, órdenes imposibles se caen y —lo que de verdad importa—
 * un acortado que no preserva los hechos NO SE OFRECE. Ni con un aviso, ni con un
 * chip rojo: no se ofrece. Y se apunta en `descartados` con el motivo exacto, para
 * que el fallo se pueda depurar en vez de intuir.
 *
 * ★ «QUÉ FALTA» NO LO DECIDE LA IA. Una viñeta sin cifra, un rol sin fecha y una
 * aptitud que ninguna viñeta respalda son hechos COMPROBABLES sobre el documento.
 * Preguntárselos a un modelo sería cambiar una verdad por una opinión que además
 * podría inventarse el detalle. Se calculan aquí, en código, y se pueden auditar.
 */

// ── El item de la variante, tal y como lo ve el motor ────────────────────────
export interface AjusteItem {
  /** id del variant_item: es sobre ESTE id sobre el que actúa el usuario */
  id: string;
  /** id del profile_item (master) del que deriva */
  itemId: string;
  kind: string;
  visible: boolean;
  sortOrder: number;
  /** el rol (master) al que pertenece la viñeta; null en lo demás */
  parentId: string | null;
  /** la data EFECTIVA (master + override). «Qué falta» lee CAMPOS, no el texto
   *  compuesto: un rol sin fechas solo se detecta mirando `dates`, y buscar un
   *  hueco dentro de "Título · Empresa · " sería adivinar dónde estaba. */
  datos: Record<string, unknown>;
  /** texto legible del item entero (se enseña y se le enseña al modelo) */
  texto: string;
  /** campo editable de este kind ("text" | "description") o null si no lo hay */
  campo: string | null;
  /** valor ACTUAL de ese campo — el original contra el que se mide un acortado */
  original: string;
  /** procedencia del override: 'manual' | 'ai_rephrased' | null (heredado) */
  origen: string | null;
  verificado: boolean;
}

/**
 * El campo de texto editable por kind. Es el MISMO mapa que usa el editor
 * (EDIT_FIELD en EditorVarianteScreen): acortar escribe donde el usuario escribe,
 * o el override iría a un campo que el editor no sabe enseñar ni revertir.
 */
export const CAMPO_EDITABLE: Record<string, string> = {
  summary: "text",
  bullet: "text",
  project: "description",
};
export const campoDe = (kind: string): string | null => CAMPO_EDITABLE[kind] ?? null;

const str = (o: Record<string, unknown> | null | undefined, k: string): string => {
  const v = o?.[k];
  return v == null ? "" : String(v);
};

/**
 * Texto legible de un item por su kind. Espeja el mapeo de buildVariantResumeData:
 * lo que se le enseña al modelo y al usuario tiene que ser lo que sale en el PDF,
 * no una segunda lectura de la misma fila que con el tiempo se separe.
 */
export function textoDeItem(kind: string, data: Record<string, unknown>): string {
  switch (kind) {
    case "basics":
      return [str(data, "name"), str(data, "label")].filter(Boolean).join(" · ");
    case "summary":
      return str(data, "text");
    case "work":
      return [str(data, "title"), str(data, "company"), str(data, "dates")].filter(Boolean).join(" · ");
    case "bullet":
      return str(data, "text");
    case "skill":
      return [str(data, "group"), str(data, "items")].filter(Boolean).join(": ");
    case "project":
      return [str(data, "name"), str(data, "description")].filter(Boolean).join(" — ");
    case "education":
      return [str(data, "degree"), str(data, "institution"), str(data, "dates")].filter(Boolean).join(" · ");
    default:
      return Object.values(data)
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .join(" · ");
  }
}

// ── Lo que le pedimos al modelo ──────────────────────────────────────────────
/**
 * Deliberadamente NO se le pide «qué falta» (se calcula) ni ningún número: si el
 * esquema tuviera un `score` o un `lineas_ahorradas`, el modelo lo rellenaría con
 * una cifra plausible y sin fuente, que es justo lo que el producto prohíbe.
 */
export const AjustePlanSchema = z.object({
  quitar: z
    .array(
      z.object({
        id: z.string().describe("id EXACTO de la lista dada. No inventes ids."),
        motivo: z
          .string()
          .describe(
            "Por qué este item es de los MENOS relevantes para el rol objetivo. Una frase. " +
              "Sin cifras ni tecnologías que no estén en el propio item.",
          ),
      }),
    )
    .describe("Los items MENOS relevantes para el rol objetivo, los que sobrarían primero."),
  orden: z
    .array(z.string())
    .describe(
      "Ids EN EL ORDEN propuesto (lo más fuerte para el rol, primero). Solo ids de la lista dada.",
    ),
  acortar: z
    .array(
      z.object({
        id: z.string().describe("id EXACTO de la lista dada."),
        propuesto: z
          .string()
          .describe(
            "El MISMO texto, más corto. ★ REGLA DURA: conserva TODAS las cifras con su unidad " +
              "(850 ms sigue siendo 850 ms) y TODOS los nombres propios, siglas y tecnologías. " +
              "Se recorta el relleno, jamás el hecho. Si no puedes acortarlo sin perder un dato, " +
              "NO lo incluyas en esta lista.",
          ),
        motivo: z.string().describe("Qué relleno se quita. Una frase corta."),
      }),
    )
    .describe("Viñetas/resumen/proyectos que se pueden acortar SIN perder ningún dato."),
  notas: z
    .string()
    .describe("Notas honestas para el usuario. Si el CV no puede caber sin perder algo bueno, dilo."),
});
export type AjustePlan = z.infer<typeof AjustePlanSchema>;

/** La función inyectable que llama al modelo (el LLM real se arma en la ruta). */
export type AjusteLLM = (input: {
  items: AjusteItem[];
  targetTitle: string;
  sobran: number;
  paginasObjetivo: number;
}) => Promise<AjustePlan>;

// ── La propuesta ─────────────────────────────────────────────────────────────
export interface PropuestaQuitar {
  id: string;
  kind: string;
  /** el texto REAL del item; nunca lo que escribiera el modelo */
  texto: string;
  motivo: string;
}

export interface PropuestaReordenar {
  id: string;
  kind: string;
  texto: string;
  /** el rol (master) dentro del que se mueve la viñeta */
  parentId: string;
  /** posiciones 0-based dentro del grupo de hermanos VISIBLES */
  desde: number;
  hasta: number;
}

export interface PropuestaAcortar {
  id: string;
  kind: string;
  /** el campo del override donde va a escribirse ("text" | "description") */
  campo: string;
  /** el texto de AHORA, para enseñarlo al lado y para poder revertir */
  original: string;
  propuesto: string;
  motivo: string;
  /** cuántos caracteres se ahorran (contado, no estimado) */
  ahorro: number;
}

export type TipoFalta = "sin-cifra" | "sin-fecha" | "sin-respaldo";

export interface Falta {
  id: string;
  kind: string;
  texto: string;
  tipo: TipoFalta;
  /** el detalle comprobable (p. ej. QUÉ aptitudes no aparecen respaldadas) */
  detalle: string;
}

/**
 * Lo que el modelo propuso y NO se ofrece. Existe para que un acortado rechazado
 * sea DEPURABLE: sin este registro, «la IA no propuso nada» y «la IA propuso una
 * mentira y la paramos» se ven exactamente igual desde fuera.
 */
export interface Descartado {
  tipo: "quitar" | "reordenar" | "acortar" | "motivo";
  id: string;
  /** el texto que se descartó (no se ofrece: se guarda para poder mirarlo) */
  propuesto: string;
  /** por qué no se ofrece, en español */
  razon: string;
  /** el veredicto crudo del candado, cuando lo hubo */
  perdidas?: { cifras: string[]; entidades: string[] };
  nuevas?: { cifras: string[]; entidades: string[] };
}

export interface AjusteResult {
  /** páginas REALES del PDF medido */
  paginas: number;
  paginasObjetivo: number;
  /** líneas que sobran, MEDIDAS. Negativo = sobra sitio. Nunca una estimación. */
  sobran: number;
  quitar: PropuestaQuitar[];
  reordenar: PropuestaReordenar[];
  acortar: PropuestaAcortar[];
  falta: Falta[];
  descartados: Descartado[];
  notas: string;
}

export interface AjusteInput {
  targetTitle: string;
  items: AjusteItem[];
  paginas: number;
  paginasObjetivo: number;
  sobran: number;
}

// ── Utilidades de comprobación ───────────────────────────────────────────────
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** ¿aparece `term` como token completo? (misma frontera que verify.ts) */
const tieneToken = (texto: string, term: string) =>
  new RegExp(`(^|[^a-z0-9])${escapeRe(term)}($|[^a-z0-9])`, "i").test(texto);

/**
 * Un motivo es COPY que el usuario va a leer como si fuera cierto. Si el modelo
 * mete ahí una cifra o una tecnología que no está en el item, es una invención con
 * traje de explicación. Se comprueba con el mismo control que el resto (§6.2) y, si
 * no pasa, el motivo se cae — la propuesta sobrevive, porque el ID sí era válido.
 */
function sanearMotivo(motivo: string, fuente: string, id: string, descartados: Descartado[]): string {
  const m = (motivo ?? "").trim();
  if (!m) return "";
  const check = preservesFacts(fuente, m);
  if (check.ok) return m;
  descartados.push({
    tipo: "motivo",
    id,
    propuesto: m,
    razon: "el motivo mencionaba datos que no están en el item",
    nuevas: { cifras: check.newNumbers, entidades: check.newEntities },
  });
  return "";
}

// ── QUÉ FALTA — comprobado sobre el documento, no preguntado al modelo ───────
/**
 * Tres huecos, los tres verificables leyendo la propia variante:
 *
 *  · sin-cifra   — una viñeta sin ningún número. No es un pecado, es un aviso: la
 *                  viñeta que convence lleva magnitud.
 *  · sin-fecha   — un rol sin fechas. Un CV sin fechas levanta la sospecha de que
 *                  se están escondiendo.
 *  · sin-respaldo— una aptitud declarada que NO aparece en ninguna viñeta, proyecto
 *                  ni resumen VISIBLE de esta variante. Es el criterio honesto que
 *                  se puede calcular aquí: la marca de evidencia del import vive en
 *                  staging y esta capa no la ve, así que se comprueba lo que sí se
 *                  puede leer y el detalle NOMBRA la aptitud, para que el usuario
 *                  juzgue en vez de creerse una etiqueta.
 */
export function calcularFaltas(items: AjusteItem[]): Falta[] {
  const visibles = items.filter((i) => i.visible);
  const out: Falta[] = [];

  // El cuerpo REDACTADO de la variante: contra esto se comprueba una aptitud. Se
  // excluyen los propios items 'skill' a propósito — que una aptitud aparezca en la
  // lista de aptitudes no la respalda: eso es repetirse, no demostrarla.
  const cuerpo = normalize(
    visibles
      .filter((i) => i.kind === "bullet" || i.kind === "project" || i.kind === "summary" || i.kind === "work")
      .map((i) => i.texto)
      .join(" \n "),
  );

  for (const it of visibles) {
    if (it.kind === "bullet") {
      if (it.original.trim() && extractNumbers(it.original).length === 0) {
        out.push({ id: it.id, kind: it.kind, texto: it.texto, tipo: "sin-cifra", detalle: "ninguna cifra en esta viñeta" });
      }
      continue;
    }

    if (it.kind === "work") {
      if (!str(it.datos, "dates").trim()) {
        out.push({ id: it.id, kind: it.kind, texto: it.texto, tipo: "sin-fecha", detalle: "este rol no lleva fechas" });
      }
      continue;
    }

    if (it.kind === "skill") {
      const sueltas = str(it.datos, "items")
        .split(/[,;·]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2 && !tieneToken(cuerpo, normalize(s)));
      if (sueltas.length) {
        out.push({
          id: it.id,
          kind: it.kind,
          texto: it.texto,
          tipo: "sin-respaldo",
          // El detalle NOMBRA las aptitudes: así el usuario juzga el hecho, no se
          // cree una etiqueta. «X, Y y Z no aparecen» es comprobable leyendo el CV.
          detalle: sueltas.join(", "),
        });
      }
    }
  }

  return out;
}

/**
 * Traduce una fila del contrato de la variante (getVariant → VariantItemView) al
 * item que entiende el motor. Vive aquí y no en la ruta porque el mapeo kind→campo
 * es la parte que hay que poder probar sin base de datos.
 */
export function itemDeAjuste(v: {
  id: string;
  item_id: string;
  kind: string;
  visible: boolean;
  sort_order: number;
  parent_id: string | null;
  data: Record<string, unknown>;
  override_origin?: string | null;
  override_verified?: boolean;
}): AjusteItem {
  const campo = campoDe(v.kind);
  return {
    id: v.id,
    itemId: v.item_id,
    kind: v.kind,
    visible: Boolean(v.visible),
    sortOrder: Number(v.sort_order ?? 0),
    parentId: v.parent_id ?? null,
    datos: v.data ?? {},
    texto: textoDeItem(v.kind, v.data ?? {}),
    campo,
    original: campo ? str(v.data, campo) : "",
    origen: v.override_origin ?? null,
    verificado: Boolean(v.override_verified),
  };
}

// ── El constructor de la propuesta ───────────────────────────────────────────
/**
 * Toma el plan del modelo y devuelve una propuesta que el usuario puede revisar
 * entera sin fiarse de nadie. Cada rama valida contra `items` REALES.
 */
export async function construirAjuste(
  input: AjusteInput,
  { llm }: { llm: AjusteLLM },
): Promise<AjusteResult> {
  const { items, targetTitle, paginas, paginasObjetivo, sobran } = input;
  const plan = await llm({ items, targetTitle, sobran, paginasObjetivo });

  const porId = new Map(items.map((i) => [i.id, i]));
  const descartados: Descartado[] = [];

  // ── 1 · QUITAR ─────────────────────────────────────────────────────────────
  // `basics` NUNCA se propone: un CV sin nombre ni contacto no es un CV corto, es
  // un CV roto. El resto (incluido el resumen) sí se puede proponer: es una
  // decisión legítima del usuario, y la toma él.
  const quitar: PropuestaQuitar[] = [];
  const yaQuitar = new Set<string>();
  for (const q of Array.isArray(plan.quitar) ? plan.quitar : []) {
    const it = porId.get(q?.id ?? "");
    if (!it) {
      descartados.push({ tipo: "quitar", id: String(q?.id ?? ""), propuesto: "", razon: "ese item no existe en esta variante" });
      continue;
    }
    if (yaQuitar.has(it.id)) continue;
    if (it.kind === "basics") {
      descartados.push({ tipo: "quitar", id: it.id, propuesto: "", razon: "los datos de contacto no se quitan" });
      continue;
    }
    if (!it.visible) {
      descartados.push({ tipo: "quitar", id: it.id, propuesto: "", razon: "ese item ya está oculto" });
      continue;
    }
    yaQuitar.add(it.id);
    quitar.push({
      id: it.id,
      kind: it.kind,
      texto: it.texto,
      motivo: sanearMotivo(q.motivo ?? "", `${it.texto} ${targetTitle}`, it.id, descartados),
    });
  }

  // ── 2 · REORDENAR ──────────────────────────────────────────────────────────
  // Solo VIÑETAS y solo DENTRO de su rol: es el único movimiento que el editor
  // sabe ejecutar (computeReorder permuta los sort_order del grupo). Proponer
  // mover un rol entero sería ofrecer un botón que no puede hacer nada, así que
  // se descarta y se dice por qué.
  const reordenar: PropuestaReordenar[] = [];
  const ordenPropuesto = (Array.isArray(plan.orden) ? plan.orden : []).filter(
    (id, i, a) => typeof id === "string" && a.indexOf(id) === i,
  );

  // grupos de hermanos visibles: viñetas de un mismo rol, en su orden de AHORA
  const grupos = new Map<string, AjusteItem[]>();
  for (const it of items) {
    if (it.kind !== "bullet" || !it.visible || !it.parentId) continue;
    if (!grupos.has(it.parentId)) grupos.set(it.parentId, []);
    grupos.get(it.parentId)!.push(it);
  }
  for (const g of grupos.values()) g.sort((a, b) => a.sortOrder - b.sortOrder);

  const rankPropuesto = new Map(ordenPropuesto.map((id, i) => [id, i]));
  for (const id of ordenPropuesto) {
    const it = porId.get(id);
    if (!it) {
      descartados.push({ tipo: "reordenar", id, propuesto: "", razon: "ese item no existe en esta variante" });
      continue;
    }
    if (it.kind !== "bullet" || !it.parentId || !it.visible) {
      descartados.push({
        tipo: "reordenar",
        id: it.id,
        propuesto: "",
        razon: "aquí solo se reordenan viñetas dentro de su experiencia",
      });
    }
  }

  for (const [parentId, grupo] of grupos) {
    // Los mencionados por el modelo suben en SU orden; los no mencionados
    // conservan el orden actual detrás. Un orden parcial no puede barrer lo que el
    // modelo simplemente no nombró.
    const nuevo = grupo
      .slice()
      .sort((a, b) => {
        const ra = rankPropuesto.has(a.id) ? rankPropuesto.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const rb = rankPropuesto.has(b.id) ? rankPropuesto.get(b.id)! : Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return a.sortOrder - b.sortOrder;
      });
    nuevo.forEach((it, hasta) => {
      const desde = grupo.findIndex((g) => g.id === it.id);
      if (desde !== hasta) {
        reordenar.push({ id: it.id, kind: it.kind, texto: it.texto, parentId, desde, hasta });
      }
    });
  }

  // ── 3 · ACORTAR — ★ EL CANDADO ─────────────────────────────────────────────
  const acortar: PropuestaAcortar[] = [];
  const yaAcortar = new Set<string>();
  for (const a of Array.isArray(plan.acortar) ? plan.acortar : []) {
    const id = String(a?.id ?? "");
    const propuesto = (a?.propuesto ?? "").trim();
    const it = porId.get(id);
    if (!it) {
      descartados.push({ tipo: "acortar", id, propuesto, razon: "ese item no existe en esta variante" });
      continue;
    }
    if (yaAcortar.has(it.id)) continue;
    if (!it.campo) {
      descartados.push({ tipo: "acortar", id: it.id, propuesto, razon: "este tipo de item no tiene texto acortable" });
      continue;
    }
    if (!it.original.trim()) {
      descartados.push({ tipo: "acortar", id: it.id, propuesto, razon: "el item no tiene texto" });
      continue;
    }

    // ★ Aquí y solo aquí se decide. preservesFactsWhenShortening mira las DOS
    // direcciones (nada nuevo, nada perdido) y además exige que de verdad sea más
    // corto. Si no pasa, NO se ofrece — no se ofrece con un aviso: no se ofrece.
    const veredicto = preservesFactsWhenShortening(it.original, propuesto);
    if (!veredicto.ok) {
      descartados.push({
        tipo: "acortar",
        id: it.id,
        propuesto,
        razon: razonDelCandado(veredicto),
        perdidas: { cifras: veredicto.lostNumbers, entidades: veredicto.lostEntities },
        nuevas: { cifras: veredicto.newNumbers, entidades: veredicto.newEntities },
      });
      continue;
    }

    yaAcortar.add(it.id);
    acortar.push({
      id: it.id,
      kind: it.kind,
      campo: it.campo,
      original: it.original,
      propuesto,
      motivo: sanearMotivo(a.motivo ?? "", it.original, it.id, descartados),
      ahorro: it.original.length - propuesto.length,
    });
  }

  return {
    paginas,
    paginasObjetivo,
    sobran,
    quitar,
    reordenar,
    acortar,
    falta: calcularFaltas(items),
    descartados,
    notas: (plan.notas ?? "").trim(),
  };
}

/**
 * Por qué se cayó un acortado, en una frase que se pueda leer en un log y entender
 * sin abrir el código. El orden importa: PERDER un dato y CAMBIARLO son fallos
 * distintos y el segundo es peor, así que se nombra antes.
 */
export function razonDelCandado(v: {
  lostNumbers: string[];
  lostEntities: string[];
  newNumbers: string[];
  newEntities: string[];
  shorter: boolean;
}): string {
  const partes: string[] = [];
  if (v.newNumbers.length) partes.push(`aparecen cifras que no estaban (${v.newNumbers.join(", ")})`);
  if (v.newEntities.length) partes.push(`aparecen nombres que no estaban (${v.newEntities.join(", ")})`);
  if (v.lostNumbers.length) partes.push(`se pierden cifras del original (${v.lostNumbers.join(", ")})`);
  if (v.lostEntities.length) partes.push(`se pierden nombres del original (${v.lostEntities.join(", ")})`);
  if (!v.shorter && !partes.length) partes.push("la propuesta no es más corta que el original");
  else if (!v.shorter) partes.push("y además no es más corta");
  return partes.join("; ") || "no pasó el candado del acortado";
}

/**
 * Re-verifica UN acortado en el servidor antes de escribirlo. Se llama al ACEPTAR,
 * no solo al proponer: entre la propuesta y el clic, el texto viaja por el cliente,
 * y un cliente es cualquiera. El candado tiene que estar en el sitio donde se
 * escribe, no en el sitio donde se sugiere.
 */
export function verificarAcortado(
  original: string,
  propuesto: string,
): { ok: true } | { ok: false; razon: string } {
  const v = preservesFactsWhenShortening(original, (propuesto ?? "").trim());
  return v.ok ? { ok: true } : { ok: false, razon: razonDelCandado(v) };
}

/** Las líneas del prompt: un id por línea con su tipo y su texto. */
export function lineasDelPrompt(items: AjusteItem[]): string {
  return items
    .filter((i) => i.visible)
    .map((i) => `- [${i.id}] (${i.kind}) ${i.texto}`)
    .join("\n");
}
