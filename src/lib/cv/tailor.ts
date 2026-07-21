import { z } from "zod";
// Import RELATIVO a propósito (igual que ajuste.ts y variant-ai.ts): este módulo lo
// carga Vitest directamente, sin el alias "@/" de Next y sin "server-only". Todo lo
// que hay aquí es PURO: entra un aviso (raw_text) + los items reales + el plan del
// modelo, y sale una propuesta revisable. El I/O (leer la URL, descargar la captura,
// llamar al LLM) vive en las rutas, nunca aquí.
import {
  normalize,
  preservesFacts,
  verifyEvidence,
  type PreserveResult,
} from "../verify";
// El mapa kind→campo editable y el texto legible por kind son EL MISMO que usa el
// editor y «Ajustar a dos páginas». Se importan en vez de recopiarse: si divergen,
// una reformulación escribiría en un campo que el editor no sabe enseñar ni revertir.
import { campoDe, textoDeItem } from "./ajuste";

/**
 * «ADAPTAR EL CV A UNA OFERTA» — el motor de la PROPUESTA. Punto 3 del contrato.
 *
 * Lo que este motor NO hace, dicho primero porque es lo que lo separa de un
 * generador de CV cualquiera:
 *
 *  · NUNCA INVENTA. Selecciona, reordena y reformula. Todo texto que se ofrece sale
 *    de un item REAL del usuario; del modelo solo se acepta una selección de ids, un
 *    orden, y un texto reformulado que haya pasado preservesFacts (verify.ts). El
 *    aviso NO es fuente de hechos: alinea el fraseo, no autoriza a meter en el CV una
 *    tecnología solo porque la oferta la pida. Ese es el vector de alucinación más
 *    goloso de todo el producto y aquí se cierra a cal y canto.
 *
 *  · NUNCA PUNTÚA. No hay «85 % de encaje». El copy ya publicado (tailor.voidBody, ES
 *    y EN) promete «nunca un score ni un porcentaje de match», así que un número de
 *    ajuste contradiría algo que la app ya dice por escrito. Lo que hay son HECHOS
 *    comprobables: este requisito lo cubre esta viñeta; este otro no lo cubre nada.
 *
 *  · LOS TRES GRUPOS, con un candado ético distinto cada uno:
 *      1. HAVE  — items que YA están en la variante y cubren un requisito del aviso.
 *      2. ADD   — items del master que NO están en la variante y sí lo cubren: un
 *                 clic para añadirlos (siguen siendo tuyos, solo estaban fuera).
 *      3. GAP   — requisitos del aviso que NO cubre NADA de tu master. Se ENSEÑAN
 *                 (es información útil: te falta ese requisito) pero NO tienen botón
 *                 de añadir, porque añadir algo que no tienes sería mentir en un CV.
 *
 * ★ QUÉ REQUISITOS PIDE EL AVISO no se lo inventa el modelo: cada requisito viaja con
 *   su EVIDENCIA (fragmento literal del aviso) y se verifica que aparezca de verdad
 *   (verifyEvidence). Un requisito cuya cita no está en el aviso se descarta — sin él,
 *   el grupo GAP le diría al usuario «la oferta pide X» cuando la oferta no pide X.
 *
 * ★ QUÉ ITEM CUBRE QUÉ REQUISITO se decide en CÓDIGO (terminoCubierto), no
 *   preguntándoselo al modelo: es un hecho comprobable leyendo el propio CV, y
 *   cambiarlo por una opinión abriría la puerta a un «sí, lo tienes» inventado.
 */

// ── Lo que le pedimos al modelo ──────────────────────────────────────────────
/**
 * Deliberadamente SIN un `score`, un `porcentaje` ni un `lineas`: si el esquema
 * tuviera un número, el modelo lo rellenaría con una cifra plausible y sin fuente,
 * que es justo lo que el producto —y su propio copy ya publicado— prohíben.
 */
export const OfertaPlanSchema = z.object({
  titulo_objetivo: z
    .string()
    .describe("El título del puesto tal como aparece en el aviso (p. ej. 'Backend Engineer'). Sin comillas."),
  requisitos: z
    .array(
      z.object({
        termino: z
          .string()
          .describe(
            "La palabra o par de palabras ESENCIALES del requisito: la tecnología, la herramienta o la " +
              "habilidad concreta (p. ej. 'Kubernetes', 'REST', 'Python'), NO la frase entera. Usa las " +
              "PALABRAS DEL PROPIO AVISO.",
          ),
        evidencia: z
          .string()
          .describe(
            "El fragmento LITERAL del aviso donde aparece este requisito (copia exacta, sin parafrasear). " +
              "Es la prueba de que el aviso lo pide de verdad.",
          ),
      }),
    )
    .describe("Los requisitos, habilidades y tecnologías que pide el aviso, cada uno con su cita literal."),
  seleccion: z
    .array(z.string())
    .describe(
      "Ids de items del master relevantes para este aviso, EN ORDEN de relevancia (lo más fuerte primero). " +
        "USA SOLO ids de la lista dada; no inventes ids.",
    ),
  resumen: z
    .string()
    .describe(
      "Resumen profesional de 2-3 frases redactado SOLO a partir de hechos que aparecen en el master, " +
        "orientado a este aviso. NO inventes cifras, tecnologías, empresas ni logros. En la duda, understate.",
    ),
  reformulaciones: z
    .array(
      z.object({
        id: z.string().describe("id EXACTO de un item de la lista dada. No inventes ids."),
        propuesto: z
          .string()
          .describe(
            "El MISMO contenido del item, reescrito para alinearse con el lenguaje del aviso. ★ REGLA DURA: " +
              "no añadas NINGUNA cifra, sigla, tecnología ni nombre propio que no esté YA en el texto original " +
              "del item. Alinea el fraseo, jamás los hechos. Si no puedes reformularlo sin meter algo nuevo, " +
              "NO lo incluyas.",
          ),
        motivo: z.string().describe("Qué se alinea con el aviso. Una frase corta."),
      }),
    )
    .describe("Reescrituras opcionales, alineadas al aviso, SIN inventar hechos."),
  notas: z
    .string()
    .describe("Notas honestas para el usuario. Si al master le faltan requisitos del aviso, dilo aquí."),
});
export type OfertaPlan = z.infer<typeof OfertaPlanSchema>;

/** La función inyectable que llama al modelo (el LLM real se arma en la ruta). */
export type OfertaLLM = (input: { offerText: string; items: ItemTailor[] }) => Promise<OfertaPlan>;

// ── El item, tal y como lo ve el motor ───────────────────────────────────────
export interface ItemTailor {
  /** id sobre el que actúa el usuario: variant_item id si está en la variante,
   *  profile_item (master) id si es un item del master que aún no está en ella. */
  id: string;
  /** id del profile_item (master) del que deriva. */
  itemId: string;
  kind: string;
  /** ¿ya está dentro de la variante? Decide HAVE (true) vs ADD (false). */
  enVariante: boolean;
  /** texto legible del item (contra esto se comprueba la cobertura de un requisito). */
  texto: string;
  /** campo editable de este kind ("text" | "description") o null si no lo hay. */
  campo: string | null;
  /** valor ACTUAL de ese campo — el original contra el que se mide una reformulación. */
  original: string;
  origen: string | null;
  verificado: boolean;
}

/**
 * Traduce una fila del contrato (VariantItemView o MasterItem) al item del motor.
 * Vive aquí y no en la ruta porque el mapeo kind→campo y kind→texto es la parte que
 * hay que poder probar sin base de datos.
 */
export function itemTailorDe(v: {
  id: string;
  item_id: string;
  kind: string;
  data: Record<string, unknown>;
  enVariante: boolean;
  override_origin?: string | null;
  override_verified?: boolean;
}): ItemTailor {
  const campo = campoDe(v.kind);
  const datos = v.data ?? {};
  return {
    id: v.id,
    itemId: v.item_id,
    kind: v.kind,
    enVariante: Boolean(v.enVariante),
    texto: textoDeItem(v.kind, datos),
    campo,
    original: campo ? str(datos, campo) : "",
    origen: v.override_origin ?? null,
    verificado: Boolean(v.override_verified),
  };
}

// ── La propuesta ─────────────────────────────────────────────────────────────
/** Un item relevante para el aviso, con LOS REQUISITOS que cubre (su «por qué»). */
export interface ItemRelevante {
  /** id sobre el que actúa el usuario (variant_item en HAVE, master item en ADD). */
  id: string;
  itemId: string;
  kind: string;
  texto: string;
  /** los términos del aviso que este item cubre; es información, no una etiqueta. */
  cubre: string[];
}

/** Un requisito del aviso que no cubre NADA. Se enseña, no se ofrece añadir. */
export interface RequisitoFalta {
  termino: string;
  /** la cita literal del aviso: la procedencia de por qué decimos que lo pide. */
  evidencia: string;
}

/** Una reescritura que YA pasó preservesFacts. Se acepta una a una, nunca en bloque. */
export interface PropuestaReformular {
  /** variant_item id (solo items de la variante se pueden reformular). */
  id: string;
  kind: string;
  /** el campo del override donde se escribirá ("text" | "description"). */
  campo: string;
  /** el texto de AHORA, para enseñarlo al lado y para poder revertir. */
  original: string;
  propuesto: string;
  motivo: string;
}

/**
 * Lo que el modelo propuso y NO se ofrece. Existe para que un rechazo sea DEPURABLE:
 * sin este registro, «la IA no propuso nada» y «la IA propuso una mentira y la
 * paramos» se ven exactamente igual desde fuera.
 */
export interface DescartadoTailor {
  tipo: "requisito" | "reformular" | "seleccion" | "resumen" | "motivo";
  /** el término o el id que se descartó. */
  id: string;
  propuesto: string;
  razon: string;
  nuevas?: { cifras: string[]; entidades: string[] };
}

export interface TailorResult {
  tituloObjetivo: string;
  /** GRUPO 1 — ya en la variante. */
  yaEnVariante: ItemRelevante[];
  /** GRUPO 2 — en el master, no en la variante (un clic para añadir). */
  enMasterNoEnVariante: ItemRelevante[];
  /** GRUPO 3 — el aviso lo pide y no lo cubre nada. Sin botón de añadir. */
  faltan: RequisitoFalta[];
  /** reformulaciones que pasaron el candado, una a una. */
  reformulaciones: PropuestaReformular[];
  /** ids del master en orden, para la PUERTA de crear una variante desde cero.
   *  Solo tiene sentido en el flujo sin variante (analizar); en el flujo de una
   *  variante existente se ignora y los grupos mandan. */
  seleccion: string[];
  /** resumen validado (preserva hechos) o null si el modelo inventó. */
  resumen: string | null;
  descartados: DescartadoTailor[];
  notas: string;
}

const str = (o: Record<string, unknown> | null | undefined, k: string): string => {
  const v = o?.[k];
  return v == null ? "" : String(v);
};

// ── Cobertura de un requisito por un texto — el corazón determinista ──────────
/**
 * Vocabulario que ni identifica ni distingue un requisito: artículos, preposiciones
 * y los envoltorios típicos de una oferta («experiencia en», «conocimiento de», «N
 * años de»). Si contaran, «años» o «experiencia» harían pasar cualquier requisito
 * por cubierto en cuanto la palabra apareciera en cualquier viñeta.
 */
const STOP_REQ = new Set<string>([
  // ES
  "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "con", "para", "por",
  "del", "al", "y", "o", "u", "en", "que", "como", "mas", "muy", "experiencia",
  "conocimiento", "conocimientos", "anos", "ano", "nivel", "manejo", "uso", "dominio",
  "solidos", "solida", "solido", "avanzado", "basico", "capacidad", "habilidad",
  // EN
  "and", "or", "with", "for", "the", "of", "to", "in", "on", "as", "a", "an",
  "experience", "knowledge", "years", "year", "strong", "solid", "proficiency",
  "proficient", "skills", "skill", "ability", "using", "use", "hands", "level",
]);

/** Quita el plural más común («apis»→«api», «apps»→«app»); se aplica a los dos lados. */
const fold = (t: string): string => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);

/** Tokens de comparación de un texto: limpios, plegados, sin vacíos. */
function tokensDe(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^[.#]+|[.#]+$/g, ""))
    .filter(Boolean)
    .map(fold);
}

/** Los tokens SIGNIFICATIVOS de un requisito: con letra, no vacíos de contenido. */
function tokensSignificativos(termino: string): string[] {
  return normalize(termino)
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^[.#]+|[.#]+$/g, ""))
    .filter((t) => t.length >= 2 && /[a-z]/.test(t) && !STOP_REQ.has(t))
    .map(fold);
}

/**
 * ¿El `cuerpo` (una viñeta, un proyecto, el resumen…) cubre el `termino` del aviso?
 *
 * TODOS los tokens significativos del término tienen que aparecer como TOKEN COMPLETO
 * en el cuerpo. Deliberadamente por token y NUNCA por subcadena: «java» no cubre
 * «javascript» (son tokens distintos), y una comparación con includes() —el fallo más
 * fácil de cometer— daría ese falso positivo justo en el lado que más importa, el GAP.
 *
 * Se exige que estén TODOS a propósito: si con un token bastara, «REST API» quedaría
 * «cubierto» por cualquier viñeta que dijera «API», y el usuario creería tener algo que
 * no tiene. Como el modelo destila el término a sus palabras esenciales (la tecnología,
 * la herramienta), «todos los tokens» suele ser una o dos palabras. Un término que se
 * queda sin tokens significativos (puro relleno: «años», «experiencia») no cubre nada:
 * no es un requisito comprobable, y darlo por cubierto sería inventar.
 */
export function terminoCubierto(termino: string, cuerpo: string): boolean {
  const toks = tokensSignificativos(termino);
  if (toks.length === 0) return false;
  const cuerpoToks = new Set(tokensDe(cuerpo));
  return toks.every((t) => cuerpoToks.has(t));
}

// ── Por qué se cae una reformulación / resumen, en una frase legible en un log ──
export function razonInvento(v: PreserveResult): string {
  const partes: string[] = [];
  if (v.newNumbers.length) partes.push(`aparecen cifras que no están en el item (${v.newNumbers.join(", ")})`);
  if (v.newEntities.length) partes.push(`aparecen nombres/tecnologías que no están en el item (${v.newEntities.join(", ")})`);
  return partes.join("; ") || "la propuesta no preserva los hechos del original";
}

/**
 * Un motivo es COPY que el usuario lee como si fuera cierto. Si el modelo mete ahí
 * una cifra o una tecnología que no está ni en el item ni en el aviso, es una
 * invención con traje de explicación. Contra el aviso SÍ se permite (el motivo puede
 * decir «alinea con lo que pide la oferta»), pero contra nada nuevo del aire. Si no
 * pasa, el motivo se cae; la propuesta sobrevive, porque el texto propuesto ya pasó
 * su propio candado.
 */
function sanearMotivo(motivo: string, fuente: string, id: string, descartados: DescartadoTailor[]): string {
  const m = (motivo ?? "").trim();
  if (!m) return "";
  const check = preservesFacts(fuente, m);
  if (check.ok) return m;
  descartados.push({
    tipo: "motivo",
    id,
    propuesto: m,
    razon: "el motivo mencionaba datos que no están ni en el item ni en el aviso",
    nuevas: { cifras: check.newNumbers, entidades: check.newEntities },
  });
  return "";
}

// ── El constructor de la propuesta ───────────────────────────────────────────
/**
 * Toma el aviso, los items REALES y el plan del modelo, y devuelve una propuesta que
 * el usuario puede revisar entera sin fiarse de nadie. Cada rama valida contra datos
 * reales; el escepticismo es el diseño (igual que ajuste.ts y variant-ai.ts).
 */
export async function construirTailor(
  { offerText, items }: { offerText: string; items: ItemTailor[] },
  { llm }: { llm: OfertaLLM },
): Promise<TailorResult> {
  const plan = await llm({ offerText, items });
  const descartados: DescartadoTailor[] = [];
  const porId = new Map(items.map((i) => [i.id, i]));

  // ── 1 · REQUISITOS: cada uno anclado en el aviso (evidencia + término reales) ─
  const requisitos: { termino: string; evidencia: string }[] = [];
  const vistos = new Set<string>();
  for (const r of Array.isArray(plan.requisitos) ? plan.requisitos : []) {
    const termino = (r?.termino ?? "").trim();
    const evidencia = (r?.evidencia ?? "").trim();
    const clave = normalize(termino);
    if (!clave || vistos.has(clave)) continue;
    // La cita tiene que estar de verdad en el aviso: sin esto, un requisito
    // alucinado le diría al usuario que la oferta pide algo que no pide.
    if (verifyEvidence(offerText, evidencia) === "none") {
      descartados.push({ tipo: "requisito", id: termino, propuesto: evidencia, razon: "la cita no aparece en el aviso" });
      continue;
    }
    // Y el propio término tiene que estar en el aviso (no inventado aparte de su cita).
    if (!terminoCubierto(termino, offerText)) {
      descartados.push({ tipo: "requisito", id: termino, propuesto: evidencia, razon: "el término no aparece en el aviso" });
      continue;
    }
    vistos.add(clave);
    requisitos.push({ termino, evidencia });
  }

  // ── 2 · COBERTURA: qué item cubre qué requisito (determinista, auditable) ─────
  const enVariante = items.filter((i) => i.enVariante);
  const soloMaster = items.filter((i) => !i.enVariante);

  const have = new Map<string, ItemRelevante>();
  const add = new Map<string, ItemRelevante>();
  const faltan: RequisitoFalta[] = [];

  const anota = (mapa: Map<string, ItemRelevante>, it: ItemTailor, termino: string) => {
    const prev = mapa.get(it.id);
    if (prev) {
      if (!prev.cubre.includes(termino)) prev.cubre.push(termino);
      return;
    }
    mapa.set(it.id, { id: it.id, itemId: it.itemId, kind: it.kind, texto: it.texto, cubre: [termino] });
  };

  for (const req of requisitos) {
    const cubreV = enVariante.filter((i) => terminoCubierto(req.termino, i.texto));
    const cubreM = soloMaster.filter((i) => terminoCubierto(req.termino, i.texto));
    if (cubreV.length) {
      // Ya lo tienes en la variante: HAVE. No hace falta ofrecer añadir nada.
      for (const it of cubreV) anota(have, it, req.termino);
    } else if (cubreM.length) {
      // Lo tienes en el master pero fuera de la variante: ADD (un clic para meterlo).
      for (const it of cubreM) anota(add, it, req.termino);
    } else {
      // No lo cubre nada tuyo: GAP. Se enseña, NUNCA se ofrece añadir.
      faltan.push({ termino: req.termino, evidencia: req.evidencia });
    }
  }

  // ── 3 · SELECCIÓN para la puerta de crear variante (basics + summary + relevantes) ─
  const validIds = new Set(items.map((i) => i.id));
  const seleccion: string[] = [];
  const seen = new Set<string>();
  // basics y summary primero si existen: un CV sin nombre ni resumen no arranca bien.
  for (const kind of ["basics", "summary"]) {
    const it = items.find((i) => i.kind === kind);
    if (it && !seen.has(it.id)) {
      seen.add(it.id);
      seleccion.push(it.id);
    }
  }
  for (const id of Array.isArray(plan.seleccion) ? plan.seleccion : []) {
    if (typeof id !== "string") continue;
    if (!validIds.has(id)) {
      descartados.push({ tipo: "seleccion", id, propuesto: "", razon: "ese item no existe en tu master" });
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    seleccion.push(id);
  }

  // ── 4 · REFORMULACIONES — ★ EL CANDADO ───────────────────────────────────────
  // Solo items de la VARIANTE (los únicos con un variant_item donde escribir un
  // override) y solo si PRESERVAN los hechos. El aviso NO se pasa como evidencia: su
  // stack no autoriza a meter una tecnología en el CV.
  const reformulaciones: PropuestaReformular[] = [];
  const yaRef = new Set<string>();
  for (const rf of Array.isArray(plan.reformulaciones) ? plan.reformulaciones : []) {
    const id = (rf?.id ?? "").trim();
    const propuesto = (rf?.propuesto ?? "").trim();
    const it = porId.get(id);
    if (!it) {
      descartados.push({ tipo: "reformular", id, propuesto, razon: "ese item no existe en el análisis" });
      continue;
    }
    if (yaRef.has(it.id)) continue;
    if (!it.enVariante) {
      descartados.push({ tipo: "reformular", id: it.id, propuesto, razon: "ese item aún no está en la variante" });
      continue;
    }
    if (!it.campo) {
      descartados.push({ tipo: "reformular", id: it.id, propuesto, razon: "este tipo de item no tiene texto reformulable" });
      continue;
    }
    if (!it.original.trim()) {
      descartados.push({ tipo: "reformular", id: it.id, propuesto, razon: "el item no tiene texto" });
      continue;
    }
    if (!propuesto || normalize(propuesto) === normalize(it.original)) {
      descartados.push({ tipo: "reformular", id: it.id, propuesto, razon: "la propuesta es igual al original" });
      continue;
    }
    // ★ Aquí y solo aquí se decide. preservesFacts caza cifras/entidades que aparecen
    // de la nada. Si no pasa, NO se ofrece — no con un aviso: no se ofrece.
    const check = preservesFacts(it.original, propuesto);
    if (!check.ok) {
      descartados.push({
        tipo: "reformular",
        id: it.id,
        propuesto,
        razon: razonInvento(check),
        nuevas: { cifras: check.newNumbers, entidades: check.newEntities },
      });
      continue;
    }
    yaRef.add(it.id);
    reformulaciones.push({
      id: it.id,
      kind: it.kind,
      campo: it.campo,
      original: it.original,
      propuesto,
      motivo: sanearMotivo(rf.motivo ?? "", `${it.texto} ${offerText}`, it.id, descartados),
    });
  }

  // ── 5 · RESUMEN — debe preservar los hechos del master ────────────────────────
  const masterBody = items.map((i) => i.texto).join(" \n ");
  const proposedSummary = (plan.resumen ?? "").trim();
  let resumen: string | null = null;
  if (proposedSummary) {
    const check = preservesFacts(masterBody, proposedSummary);
    if (check.ok) resumen = proposedSummary;
    else
      descartados.push({
        tipo: "resumen",
        id: "",
        propuesto: proposedSummary,
        razon: razonInvento(check),
        nuevas: { cifras: check.newNumbers, entidades: check.newEntities },
      });
  }

  return {
    tituloObjetivo: (plan.titulo_objetivo ?? "").trim(),
    yaEnVariante: [...have.values()],
    enMasterNoEnVariante: [...add.values()],
    faltan,
    reformulaciones,
    seleccion,
    resumen,
    descartados,
    notas: (plan.notas ?? "").trim(),
  };
}

/**
 * Re-verifica UNA reformulación en el servidor antes de escribirla. Se llama al
 * ACEPTAR, no solo al proponer: entre la propuesta y el clic, el texto viaja por el
 * cliente, y un cliente es cualquiera. El candado tiene que estar donde se escribe.
 */
export function verificarReformulacion(
  original: string,
  propuesto: string,
): { ok: true } | { ok: false; razon: string } {
  const p = (propuesto ?? "").trim();
  if (!p) return { ok: false, razon: "la propuesta está vacía" };
  if (normalize(p) === normalize(original)) return { ok: false, razon: "la propuesta es igual al original" };
  const v = preservesFacts(original, p);
  return v.ok ? { ok: true } : { ok: false, razon: razonInvento(v) };
}

/** Las líneas del prompt: un id por línea con su tipo, su texto y si ya está dentro. */
export function lineasDelPrompt(items: ItemTailor[]): string {
  return items
    .map((i) => `- [${i.id}] (${i.kind}${i.enVariante ? ", en la variante" : ", en el master"}) ${i.texto}`)
    .join("\n");
}

/* ============================================================================
   ★ LEER UN AVISO DESDE UNA URL — JobPosting JSON-LD PRIMERO.

   Muchos portales de empleo emiten el aviso como datos estructurados
   <script type="application/ld+json"> con @type "JobPosting". Es gratis y exacto:
   el título, la descripción, los requisitos y las responsabilidades ya vienen
   separados, sin el ruido de la maquetación. Se intenta ANTES que el lector de
   texto (Jina), igual que la ingesta hace con Person/CreativeWork en extract/web.ts.

   Esta función es PURA (recibe el HTML ya bajado; el fetch vive en la ruta): así se
   prueba con un HTML fijo, sin red. Si no hay JobPosting aprovechable devuelve "" y
   la ruta cae al texto legible de la página.
   ============================================================================ */
const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Aplana JSON-LD (objeto suelto, array o @graph) en una lista de nodos con @type. */
function colecta(parsed: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(parsed)) {
    for (const el of parsed) colecta(el, out);
    return;
  }
  const rec = asRecord(parsed);
  if (!rec) return;
  if (Array.isArray(rec["@graph"])) colecta(rec["@graph"], out);
  if (rec["@type"]) out.push(rec);
}

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
function unir(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => txt(x) || txt(asRecord(x)?.name)).filter(Boolean).join(", ");
  return txt(v) || txt(asRecord(v)?.name);
}
const tipoDe = (rec: Record<string, unknown>): string => {
  const t = rec["@type"];
  return (Array.isArray(t) ? t.map(txt).join(" ") : txt(t)).toLowerCase();
};

/** Descripciones de JobPosting suelen venir con HTML embebido; lo quitamos honestamente. */
function quitarHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseJobPostingJsonLd(html: string): string {
  if (!html) return "";
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const nodes: Record<string, unknown>[] = [];
  for (const m of html.matchAll(re)) {
    try {
      colecta(JSON.parse((m[1] ?? "").trim()), nodes);
    } catch {
      /* JSON-LD malformado: se ignora, no se adivina. */
    }
  }
  const lines: string[] = [];
  for (const n of nodes) {
    if (!tipoDe(n).includes("jobposting")) continue;
    const title = txt(n.title);
    const org = txt(asRecord(n.hiringOrganization)?.name);
    const empType = unir(n.employmentType);
    const skills = quitarHtml(unir(n.skills));
    const qual = quitarHtml(unir(n.qualifications) || unir(n.experienceRequirements));
    const resp = quitarHtml(unir(n.responsibilities));
    const desc = quitarHtml(txt(n.description));
    if (title) lines.push(`Puesto: ${title}`);
    if (org) lines.push(`Empresa: ${org}`);
    if (empType) lines.push(`Tipo: ${empType}`);
    if (skills) lines.push(`Requisitos: ${skills}`);
    if (qual) lines.push(`Cualificaciones: ${qual}`);
    if (resp) lines.push(`Responsabilidades: ${resp}`);
    if (desc) lines.push(`Descripción: ${desc}`);
  }
  return lines.length ? `[JobPosting JSON-LD]\n${lines.join("\n")}` : "";
}
