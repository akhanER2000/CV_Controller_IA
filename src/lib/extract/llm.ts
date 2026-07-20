import "server-only";
import { createHash } from "node:crypto";
import { generateObject, generateText } from "ai";
import { normalize } from "../verify";
import { claveGemini, modeloPara } from "../ai/modelos";
import {
  anotarLlamada, consumoCero, type ConsumoIA, type SeccionContexto,
} from "../db/telemetria";
import { signalsOf, compareSignals, similarityVerdict, type SignalBag } from "./similar";
import { titlesClearlyDifferent } from "./dedup";
import {
  repartir, textoPara, conserva, EXTRACTORES_5,
  type Extractor5, type Reparto,
} from "./segmentar";
import {
  BasicsSchema, WorkSchema, EducationSchema, SkillsSchema, ProjectsSchema,
  type Extraction,
} from "./schema";

/**
 * La capa LLM. Gemini Flash para extracción y transcripción (258 tok/pág, y no
 * cobra los tokens del texto nativo extraído). Se expone como un `Extractor`
 * inyectable → el pipeline se prueba con un extractor falso, sin LLM en vivo.
 *
 * El nombre del modelo ya NO vive aquí: está en el registro único
 * (`lib/ai/modelos.ts`), porque estaba copiado en seis ficheros.
 * Clave: GEMINI_API_KEY (el provider por defecto busca GOOGLE_GENERATIVE_AI_API_KEY,
 * por eso se pasa explícita).
 */

/** Lo que la ingesta puede contar sobre CÓMO se leyó el documento. */
export interface ResumenLectura {
  /** caracteres del documento */
  longitud: number;
  /** caracteres por cubo: dirigido + difuso + contexto === longitud */
  totales: { dirigido: number; difuso: number; contexto: number };
  /** las secciones NO mandadas al modelo, CON NOMBRE (regla del producto) */
  contexto: SeccionContexto[];
  /** true si se pidió releer entero (los cinco extractores sobre todo el texto) */
  forzado: boolean;
  /** secciones totales en que se cortó */
  secciones: number;
}

/** Lo que devuelve un extractor: la extracción + avisos honestos sobre la LECTURA. */
export type ExtractionResult = Extraction & {
  warnings?: string[];
  /** consumo real de IA (tokens leídos de `usage`), si el extractor lo mide */
  consumo?: ConsumoIA;
  /** cómo se repartió el documento, para que la UI lo pueda enseñar */
  lectura?: ResumenLectura;
};
export type Extractor = (rawText: string) => Promise<ExtractionResult>;

/** La clave que se usa DE VERDAD. Delega en el registro único: aquí se conserva
 *  el nombre por compatibilidad con las rutas que ya la importaban. */
export function geminiApiKey(): string | undefined {
  return claveGemini();
}

/** El modelo de extracción con la clave EFECTIVA: la BYOK del usuario (ya
 *  descifrada, se pasa explícita) o, si no hay, la del servidor. */
function googleModel(apiKey?: string) {
  return modeloPara("extraccion-estructurada", apiKey);
}

const BASE =
  "Eres un extractor de datos de CV. Extrae SOLO lo que aparece literalmente en el TEXTO. " +
  "NO inventes: si un dato no está, deja el campo como \"\". Para cada item incluye `evidence`: " +
  "el fragmento LITERAL del texto de donde lo sacaste (copia exacta, sin parafrasear). " +
  "Fechas tal cual aparecen. Responde solo la estructura pedida.\n\nTEXTO:\n";

/* ============================================================================
   ★ SEGMENTACIÓN — el fin del truncado silencioso.

   Antes: `rawText.slice(0, 30000)`. Un dossier de 104 KB (~106.000 caracteres)
   se extraía del primer 28% y el 72% restante se descartaba SIN AVISAR. El
   usuario veía aparecer items y jamás sabía que dos tercios de su carrera no se
   habían leído. Eso es pérdida silenciosa de datos, justo lo contrario de la
   promesa del producto.

   Ahora el texto se recorre en VENTANAS con SOLAPE (un item no puede quedar
   partido entre dos ventanas sin aparecer entero al menos en una), se extrae por
   ventana y se FUSIONA deduplicando. Y si el documento supera el tope de
   ventanas, se dice en voz alta cuántas partes se leyeron de cuántas: nunca en
   silencio.

   Tamaños: gemini-flash admite un contexto enorme de ENTRADA, pero la SALIDA
   está acotada (~8k tokens), y es la salida la que se llena de items. Por eso la
   ventana se mantiene en el orden de magnitud del corte anterior (30k caracteres
   ≈ 8k tokens de entrada): así cada llamada devuelve su sección COMPLETA en vez
   de una lista recortada. El arreglo no es "mandar más de una vez", es "leerlo
   todo, y que cada trozo quepa en la respuesta".
   ============================================================================ */

/** Caracteres de texto por ventana de extracción. */
export const WINDOW_CHARS = 30_000;
/** Solape entre ventanas contiguas: margen para que un item no se parta a la mitad. */
export const WINDOW_OVERLAP = 3_000;
/** Tope de ventanas por documento (≈ 219k caracteres). Superarlo se AVISA. */
export const MAX_WINDOWS = 8;

export interface Segmentation {
  /** los trozos de texto que se van a extraer, en orden */
  windows: string[];
  /** cuántas ventanas harían falta para cubrir el documento ENTERO */
  total: number;
  /** true si se aplicó el tope y quedó documento sin leer */
  truncated: boolean;
  /** caracteres realmente cubiertos por `windows` */
  covered: number;
  /** caracteres del documento completo */
  length: number;
}

export interface SegmentOptions {
  size?: number;
  overlap?: number;
  maxWindows?: number;
}

/**
 * Parte el texto en ventanas solapadas. Determinista y PURO (se prueba sin LLM).
 *
 * Garantía que sostiene todo lo demás: mientras no se aplique el tope, la UNIÓN
 * de las ventanas es el documento entero — carácter por carácter, sin huecos.
 * El paso entre ventanas es `size - overlap`, así que cada corte queda cubierto
 * por `overlap` caracteres de la ventana siguiente.
 */
export function segmentText(text: string, opts: SegmentOptions = {}): Segmentation {
  const size = Math.max(1, opts.size ?? WINDOW_CHARS);
  const overlap = Math.min(Math.max(0, opts.overlap ?? WINDOW_OVERLAP), size - 1);
  const maxWindows = Math.max(1, opts.maxWindows ?? MAX_WINDOWS);
  const stride = size - overlap;
  const length = text.length;

  if (length === 0) return { windows: [], total: 0, truncated: false, covered: 0, length: 0 };
  if (length <= size) return { windows: [text], total: 1, truncated: false, covered: length, length };

  const total = Math.ceil((length - overlap) / stride);
  const take = Math.min(total, maxWindows);
  const windows: string[] = [];
  for (let i = 0; i < take; i++) windows.push(text.slice(i * stride, Math.min(length, i * stride + size)));

  const covered = Math.min(length, (take - 1) * stride + size);
  return { windows, total, truncated: take < total, covered, length };
}

/* ── Fusión y deduplicación entre ventanas ────────────────────────────────────
   Con solape, el MISMO rol o la MISMA viñeta puede salir en dos ventanas. Si se
   concatenara sin más, el staging mostraría el trabajo del usuario por duplicado
   y le haría descartarlo a mano. Se fusiona por clave de identidad (normalizada:
   sin acentos, sin mayúsculas, sin espacios de más) y se completan los huecos:
   gana el primer valor NO VACÍO, así una ventana que vio la fecha completa la
   aporta aunque otra la haya visto cortada.                                    */

const norm = (s: string) => normalize(s ?? "");
const firstNonEmpty = (a: string, b: string) => (a && a.trim() ? a : b);

/** Clave de identidad; si todos los campos vienen vacíos, cae a la evidencia. */
function idKey(parts: string[], fallback: string): string {
  const k = parts.map(norm).filter(Boolean).join("|");
  return k || `~${norm(fallback)}`;
}

/** Fusiona por clave conservando el ORDEN de primera aparición. */
function mergeBy<T>(items: T[], keyOf: (x: T) => string, combine: (a: T, b: T) => T): T[] {
  const out = new Map<string, T>();
  for (const it of items) {
    const k = keyOf(it);
    const prev = out.get(k);
    out.set(k, prev ? combine(prev, it) : it);
  }
  return [...out.values()];
}

/* ── La clave exacta no basta (§A1) ───────────────────────────────────────────
   `idKey` casa normalize(title)|normalize(company). Con ventanas de 30k que se
   solapan y un dossier que cuenta el mismo trabajo tres veces, el modelo redacta
   el MISMO cargo distinto en dos ventanas («Software Engineering Intern ·
   Tesseract Softwares» y «Becario · TesseractSoftwares») y salen DOS roles de UN
   solo import, antes incluso de llegar al staging. Esta es la primera línea de
   defensa y no existía.

   ⚠ Aquí SÍ se fusiona, y eso solo es legítimo bajo dos condiciones estrictas,
     porque `combine` se queda con el primer valor no vacío de cada campo:
       1. el contenido tiene que ser casi idéntico (veredicto "fuerte"), no
          «parecido»; y
       2. los títulos no pueden ser claramente distintos, que es justo cuando
          `firstNonEmpty` perdería la otra redacción.
     Todo lo que no cumpla las dos cosas NO se toca aquí: sigue como dos items y
     llega al staging con su sospecha de duplicado, para que decida el usuario.
     La regla del producto —ninguna fusión automática— se respeta porque esto no
     resuelve un duplicado entre fuentes, sino el artefacto de haber leído dos
     veces el mismo trozo de UN documento.                                       */

/** Como `mergeBy`, pero además une los que el detector da por casi idénticos. */
function mergeBySimilar<T>(
  items: T[],
  keyOf: (x: T) => string,
  contentOf: (x: T) => string[],
  titleOf: (x: T) => string,
  combine: (a: T, b: T) => T,
): T[] {
  const buckets: { key: string; bag: SignalBag; title: string; value: T }[] = [];
  for (const it of items) {
    const k = keyOf(it);
    const exact = buckets.find((b) => b.key === k);
    if (exact) { exact.value = combine(exact.value, it); continue; }

    const bag = signalsOf(...contentOf(it));
    const title = titleOf(it);
    const fuzzy = buckets.find(
      (b) =>
        similarityVerdict(compareSignals(b.bag, bag)) === "fuerte" &&
        !titlesClearlyDifferent(b.title, title),
    );
    if (fuzzy) { fuzzy.value = combine(fuzzy.value, it); continue; }

    buckets.push({ key: k, bag, title, value: it });
  }
  return buckets.map((b) => b.value);
}

/**
 * Fusiona las extracciones de todas las ventanas en UNA sola, sin duplicados.
 * Puro y determinista (se prueba sin LLM). Un item que aparece en dos ventanas
 * sale UNA vez del staging.
 */
export function mergeExtractions(parts: Extraction[]): Extraction {
  if (parts.length === 0) {
    return {
      basics: { name: "", label: "", email: "", phone: "", location: "", links: [], summary: "", summaryEvidence: "" },
      work: [], education: [], skills: [], projects: [],
    };
  }
  if (parts.length === 1) return parts[0]!;

  // basics: gana el primer valor no vacío campo a campo (el resumen viaja con SU
  // evidencia: separarlos convertiría una cita válida en una cita de otro texto).
  const basics = parts
    .map((p) => p.basics)
    .reduce((acc, b) => ({
      name: firstNonEmpty(acc.name, b.name),
      label: firstNonEmpty(acc.label, b.label),
      email: firstNonEmpty(acc.email, b.email),
      phone: firstNonEmpty(acc.phone, b.phone),
      location: firstNonEmpty(acc.location, b.location),
      links: [...acc.links, ...b.links],
      summary: acc.summary?.trim() ? acc.summary : b.summary,
      summaryEvidence: acc.summary?.trim() ? acc.summaryEvidence : b.summaryEvidence,
    }));
  basics.links = [...new Map(basics.links.filter(Boolean).map((l) => [norm(l), l])).values()];

  const work = mergeBySimilar(
    parts.flatMap((p) => p.work),
    (w) => idKey([w.title, w.company], w.evidence),
    // sin la empresa, igual que en dedup.ts: aquí se compara CONTENIDO
    (w) => [w.title, w.evidence, w.bullets.map((x) => x.text).join(" · ")],
    (w) => w.title,
    (a, b) => ({
      title: firstNonEmpty(a.title, b.title),
      company: firstNonEmpty(a.company, b.company),
      location: firstNonEmpty(a.location, b.location),
      dates: firstNonEmpty(a.dates, b.dates),
      evidence: firstNonEmpty(a.evidence, b.evidence),
      // las viñetas también se deduplican: es donde más duele repetir
      bullets: mergeBy([...a.bullets, ...b.bullets], (x) => idKey([x.text], x.evidence), (x, y) => ({
        text: firstNonEmpty(x.text, y.text),
        evidence: firstNonEmpty(x.evidence, y.evidence),
      })),
    }),
  );

  const education = mergeBy(
    parts.flatMap((p) => p.education),
    (e) => idKey([e.degree, e.institution], e.evidence),
    (a, b) => ({
      degree: firstNonEmpty(a.degree, b.degree),
      institution: firstNonEmpty(a.institution, b.institution),
      location: firstNonEmpty(a.location, b.location),
      dates: firstNonEmpty(a.dates, b.dates),
      evidence: firstNonEmpty(a.evidence, b.evidence),
    }),
  );

  // skills: se fusiona POR GRUPO y se unen sus listas sin repetir aptitudes.
  const skills = mergeBy(
    parts.flatMap((p) => p.skills),
    (s) => idKey([s.group], s.items),
    (a, b) => {
      const seen = new Map<string, string>();
      for (const raw of `${a.items},${b.items}`.split(",")) {
        const item = raw.trim();
        if (item && !seen.has(norm(item))) seen.set(norm(item), item);
      }
      return { group: a.group || b.group, items: [...seen.values()].join(", "), evidence: firstNonEmpty(a.evidence, b.evidence) };
    },
  );

  const projects = mergeBySimilar(
    parts.flatMap((p) => p.projects),
    (p) => idKey([p.name, p.url], p.evidence),
    (p) => [p.name, p.description, p.evidence],
    (p) => p.name,
    (a, b) => ({
      name: firstNonEmpty(a.name, b.name),
      url: firstNonEmpty(a.url, b.url),
      description: firstNonEmpty(a.description, b.description),
      dates: firstNonEmpty(a.dates, b.dates),
      evidence: firstNonEmpty(a.evidence, b.evidence),
    }),
  );

  return { basics, work, education, skills, projects };
}

/** El aviso que llega a la UI cuando el documento no cupo entero. Nunca en silencio. */
export function truncationWarning(seg: Segmentation): string | null {
  if (!seg.truncated) return null;
  const pct = Math.round((seg.covered / seg.length) * 100);
  return (
    `Documento muy largo (${seg.length.toLocaleString("es-CL")} caracteres): se leyeron ` +
    `${seg.windows.length} de ${seg.total} partes (${pct}% del texto). ` +
    `Lo que quedó fuera NO se extrajo — súbelo dividido en archivos más pequeños para que entre completo.`
  );
}

/* ============================================================================
   ★ EL GASTO MULTIPLICADO POR CINCO — qué era y qué es ahora.

   ANTES (medido sobre el dossier real, 103.744 caracteres):
     `extractWindow` interpolaba el texto COMPLETO de la ventana en las CINCO
     llamadas. Lo único distinto entre ellas eran ~30 caracteres de sufijo y el
     schema. 4 ventanas × 5 = 20 llamadas y 563.720 caracteres de prompt. A la
     sección «EDUCACIÓN» se le pasaba entera al extractor de proyectos, que no
     puede sacar nada de ahí. Pagado, y a cero de rendimiento.

   AHORA:
     `repartir` (segmentar.ts) decide, por el TÍTULO de cada sección, qué
     extractores tienen algo que hacer con ella. Cada extractor recibe SOLO su
     corpus, ventaneado aparte. Un extractor cuyo corpus queda vacío NO SE LLAMA:
     cero llamadas, decidido en código, sin preguntarle al modelo.

   Lo que NO cambia, y es deliberado:
     · Los cinco schemas siguen ahí. Existen por el límite de 24 parámetros
       opcionales de los structured outputs, y ese motivo sigue en pie.
     · `segmentText` sigue ventaneando: una sección grande puede pasarse de 30k
       (la mayor del dossier real son 14.327 caracteres, pero eso no se asume).
     · `mergeExtractions` sigue fusionando y deduplicando, ahora entre ventanas
       Y entre extractores.
   ============================================================================ */

/** Qué se le pide a cada extractor. El sufijo es lo único que cambiaba antes. */
const FOCO: Record<Extractor5, string> = {
  basics: "datos básicos, contacto y resumen",
  work: "experiencia laboral, con viñetas",
  education: "formación académica",
  skills: "aptitudes técnicas agrupadas",
  projects: "proyectos personales/open source",
};

const SCHEMA_DE = {
  basics: BasicsSchema,
  work: WorkSchema,
  education: EducationSchema,
  skills: SkillsSchema,
  projects: ProjectsSchema,
} as const;

/** Una extracción vacía, para que cada llamada aporte solo SU parte a la fusión. */
const extraccionVacia = (): Extraction => ({
  basics: { name: "", label: "", email: "", phone: "", location: "", links: [], summary: "", summaryEvidence: "" },
  work: [], education: [], skills: [], projects: [],
});

/** El prompt exacto que se manda. Aislado para poder MEDIRLO sin llamar a nadie. */
export function promptDeExtraccion(extractor: Extractor5, texto: string): string {
  return `${BASE}${texto}\n\n(Extrae: ${FOCO[extractor]})`;
}

/* ── CACHÉ POR CONTENIDO ──────────────────────────────────────────────────────
   No había NINGUNA caché en el repo. Volcar dos veces el mismo archivo —que es
   lo que hace cualquiera que se equivoca de botón o recarga la página— costaba
   dos veces.

   La clave es hash(raw_text) + versión de los schemas + modo de reparto. El
   contenido manda: da igual el nombre del archivo, la fuente o el usuario; si el
   texto es idéntico, la extracción es idéntica (temperature 0.1 y prompts
   deterministas).

   DÓNDE VIVE: en memoria del proceso. Es honesto decir lo que eso significa en
   serverless: sirve mientras la lambda esté caliente, y un despliegue nuevo la
   vacía. Cubre el caso que motiva la caché (reintentos y dobles clics en
   minutos) sin inventarse una tabla ni una migración —`supabase/` está fuera de
   esta frontera— y sin guardar en disco el CV de nadie.

   CÓMO SE FUERZA: `ignorarCache: true`. «Releer» una fuente lo pasa siempre —
   pedir releer es literalmente pedir que no se reutilice lo anterior—, y
   `forzarCompleto` genera otra clave, así que tampoco puede devolver lo cacheado
   de un reparto distinto. */

/** Súbelo a mano si cambian los schemas o los prompts: invalida todo lo cacheado. */
export const VERSION_EXTRACCION = "v1";
const TTL_CACHE_MS = 30 * 60_000;
const MAX_CACHE = 20;

interface EntradaCache { valor: ExtractionResult; en: number }
const cacheExtraccion = new Map<string, EntradaCache>();

function claveCache(rawText: string, forzado: boolean): string {
  const h = createHash("sha256").update(rawText).digest("hex");
  return `${VERSION_EXTRACCION}:${forzado ? "full" : "seg"}:${h}`;
}

function leerCache(k: string): ExtractionResult | null {
  const e = cacheExtraccion.get(k);
  if (!e) return null;
  if (Date.now() - e.en > TTL_CACHE_MS) { cacheExtraccion.delete(k); return null; }
  return e.valor;
}

function guardarCache(k: string, valor: ExtractionResult): void {
  // LRU pobre pero suficiente: se tira la entrada más vieja por inserción.
  if (cacheExtraccion.size >= MAX_CACHE) {
    const primera = cacheExtraccion.keys().next();
    if (!primera.done) cacheExtraccion.delete(primera.value);
  }
  cacheExtraccion.set(k, { valor, en: Date.now() });
}

/** Solo para los tests. */
export function _resetCacheExtraccion(): void {
  cacheExtraccion.clear();
}

export interface OpcionesExtractor {
  /** Manda TODO el documento a los cinco extractores (la vía de escape del reparto). */
  forzarCompleto?: boolean;
  /** Salta la caché por contenido: la usa «releer», que es una petición explícita. */
  ignorarCache?: boolean;
}

/* ── EL PLAN, SEPARADO DE LA EJECUCIÓN ────────────────────────────────────────
   Decidir QUÉ llamadas se harían es puro y no cuesta nada; hacerlas cuesta
   dinero. Al separarlos, `tests/coste.test.ts` mide EL PLAN REAL —el mismo que
   ejecuta `makeGeminiExtractor`— en vez de una copia del bucle que podría
   quedarse desfasada y hacer que la medición dijera un número bonito mientras
   el código gasta otro. La medición que se puede desincronizar de lo medido no
   es una medición. */

export interface LlamadaPlanificada {
  extractor: Extractor5;
  /** el prompt EXACTO que se mandaría (BASE + texto + foco) */
  prompt: string;
}

export interface PlanExtraccion {
  llamadas: LlamadaPlanificada[];
  reparto: Reparto;
  warnings: string[];
}

/**
 * Qué llamadas haría una extracción, sin hacer ninguna. PURO: sin red, sin LLM.
 */
export function planificarExtraccion(rawText: string, opts: OpcionesExtractor = {}): PlanExtraccion {
  let reparto = repartir(rawText, { forzarCompleto: opts.forzarCompleto });
  const warnings: string[] = [];

  /* ── La invariante, comprobada en RUNTIME y no solo en el test ──────────────
     Si el reparto no conserva el documento carácter por carácter, hay texto
     evaporándose. No se sigue adelante «a ver si cuela»: se cae al reparto
     completo (los cinco sobre todo el texto, el comportamiento de antes) y se
     AVISA. Perder dinero es recuperable; perder la carrera de alguien no.     */
  if (!conserva(rawText, reparto)) {
    reparto = repartir(rawText, { forzarCompleto: true });
    warnings.push(
      "El reparto por secciones no cuadraba con el documento, así que se leyó ENTERO con los cinco extractores. " +
      "No se perdió nada; solo costó más.",
    );
  }

  const llamadas: LlamadaPlanificada[] = [];
  for (const extractor of EXTRACTORES_5) {
    const texto = textoPara(rawText, reparto, extractor);
    // Corpus vacío (o solo espacios) ⇒ CERO llamadas. Determinista, sin
    // preguntarle al modelo si hay algo que extraer de un texto que no existe.
    if (!texto.trim()) continue;

    const seg = segmentText(texto);
    if (seg.truncated) {
      warnings.push(
        `La parte del documento que alimenta «${FOCO[extractor]}» era muy larga: se leyeron ` +
        `${seg.windows.length} de ${seg.total} partes. Lo que quedó fuera NO se extrajo.`,
      );
    }
    for (const ventana of seg.windows) {
      llamadas.push({ extractor, prompt: promptDeExtraccion(extractor, ventana) });
    }
  }

  return { llamadas, reparto, warnings };
}

const resumenDe = (r: Reparto): ResumenLectura => ({
  longitud: r.longitud,
  totales: r.totales,
  contexto: r.contexto,
  forzado: r.forzado,
  secciones: r.secciones.length,
});

/**
 * El extractor real. La clave se inyecta (BYOK del usuario o, si no, la del
 * servidor). `geminiExtractor` es el atajo con la clave del servidor (compat con
 * el pipeline y sus tests).
 *
 * Las llamadas van EN SERIE a propósito: disparar todas de golpe es la forma más
 * rápida de comerse el límite de peticiones del proveedor y perder el documento
 * entero por un 429.
 */
export function makeGeminiExtractor(apiKey?: string, opts: OpcionesExtractor = {}): Extractor {
  return async (rawText) => {
    const clave = claveCache(rawText, !!opts.forzarCompleto);
    if (!opts.ignorarCache) {
      const previo = leerCache(clave);
      // Se devuelve el MISMO contenido, pero con el consumo a cero y marcado como
      // servido por caché: cobrarle al usuario unos tokens que no se gastaron
      // sería un número sin fuente, y aquí no se muestran números sin fuente.
      if (previo) return { ...previo, consumo: { ...consumoCero(), caracteresDocumento: rawText.length, desdeCache: true } };
    }

    const plan = planificarExtraccion(rawText, opts);
    const model = googleModel(apiKey);
    const consumo = consumoCero();
    consumo.caracteresDocumento = rawText.length;
    const partes: Extraction[] = [];

    for (const ll of plan.llamadas) {
      const r = await generateObject({
        model,
        schema: SCHEMA_DE[ll.extractor],
        prompt: ll.prompt,
        temperature: 0.1,
      });
      anotarLlamada(consumo, ll.prompt.length, r.usage);

      const parte = extraccionVacia();
      if (ll.extractor === "basics") parte.basics = r.object as Extraction["basics"];
      else parte[ll.extractor] = (r.object as { items: unknown[] }).items as never;
      partes.push(parte);
    }

    const resultado: ExtractionResult = {
      ...mergeExtractions(partes),
      warnings: plan.warnings,
      consumo,
      lectura: resumenDe(plan.reparto),
    };
    guardarCache(clave, resultado);
    return resultado;
  };
}
export const geminiExtractor: Extractor = makeGeminiExtractor();

/**
 * ★ Transcripción VERBATIM de una imagen / PDF escaneado (prompt §4.2). Dos
 * pasos: primero se transcribe TODO el texto visible, después se extrae SOBRE
 * esa transcripción. Sin este raw_text, la verificación de evidencia (§4.4)
 * quedaría desactivada justo en las fuentes con mayor riesgo de alucinación.
 */
export async function transcribeImage(dataUrl: string, apiKey?: string): Promise<string> {
  const { text } = await generateText({
    model: modeloPara("transcripcion-vision", apiKey),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Transcribe LITERALMENTE todo el texto visible en esta imagen, en orden de lectura. " +
              "No interpretes, no resumas, no completes lo que no se lee. " +
              "Es CLAVE para capturas de LinkedIn: transcribe los ENCABEZADOS DE SECCIÓN tal cual, " +
              "cada uno en su propia línea y en su lugar (Experiencia/Experience, Aptitudes/Skills, " +
              "Educación/Education, Acerca de/About, Licencias y certificaciones/Licenses & certifications, " +
              "Proyectos/Projects, Idiomas/Languages). Así se sabe qué es habilidad y qué es logro. " +
              "Devuelve solo el texto transcrito.",
          },
          { type: "image", image: new URL(dataUrl) },
        ],
      },
    ],
  });
  return text;
}

/**
 * ★ Transcripción VERBATIM de un PDF ESCANEADO / de solo imagen (sin capa de
 * texto). Se manda el PDF al modelo de visión como DOCUMENTO (Gemini rasteriza
 * las páginas internamente — no hace falta canvas en el servidor) y se transcribe
 * literal, página por página. Igual disciplina que transcribeImage: es la fuente
 * sobre la que corre la verificación de evidencia (§4.4), así que NADA se inventa.
 */
export async function transcribePdf(bytes: Uint8Array, apiKey?: string): Promise<string> {
  const { text } = await generateText({
    model: modeloPara("transcripcion-vision", apiKey),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Este PDF es un ESCANEO (páginas como imagen, sin capa de texto). " +
              "Transcribe LITERALMENTE todo el texto visible, página por página, en orden de lectura. " +
              "No interpretes, no resumas, no reordenes ni completes lo que no se lee. " +
              "Transcribe los ENCABEZADOS DE SECCIÓN tal cual y en su propia línea (Experiencia/Experience, " +
              "Aptitudes/Skills, Educación/Education, Acerca de/About, Licencias y certificaciones/Licenses & " +
              "certifications, Proyectos/Projects, Idiomas/Languages): sirven para no confundir habilidades con logros. " +
              "Si una página es ilegible, omítela. Devuelve solo el texto transcrito.",
          },
          { type: "file", data: bytes, mediaType: "application/pdf" },
        ],
      },
    ],
  });
  return text;
}
