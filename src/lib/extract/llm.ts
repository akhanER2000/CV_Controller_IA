import "server-only";
import { generateObject, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { normalize } from "../verify";
import { signalsOf, compareSignals, similarityVerdict, type SignalBag } from "./similar";
import { titlesClearlyDifferent } from "./dedup";
import {
  BasicsSchema, WorkSchema, EducationSchema, SkillsSchema, ProjectsSchema,
  type Extraction,
} from "./schema";

/**
 * La capa LLM. Gemini Flash para extracción y transcripción (258 tok/pág, y no
 * cobra los tokens del texto nativo extraído). Se expone como un `Extractor`
 * inyectable → el pipeline se prueba con un extractor falso, sin LLM en vivo.
 *
 * Modelo: gemini-flash-latest (la key del usuario no habilita 2.5/2.0-flash).
 * Clave: GEMINI_API_KEY (el provider por defecto busca GOOGLE_GENERATIVE_AI_API_KEY,
 * por eso se pasa explícita).
 */

/** Lo que devuelve un extractor: la extracción + avisos honestos sobre la LECTURA. */
export type ExtractionResult = Extraction & { warnings?: string[] };
export type Extractor = (rawText: string) => Promise<ExtractionResult>;

const MODEL = "gemini-flash-latest";

/** La clave que se usa DE VERDAD. Se pasa explícita al provider (si no, el
 *  provider de Google leería GOOGLE_GENERATIVE_AI_API_KEY por defecto y la
 *  GEMINI_API_KEY quedaría sin usar). Se acepta cualquiera de las dos. */
export function geminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/**
 * El modelo Gemini con la clave EFECTIVA: la BYOK del usuario (ya descifrada, se
 * pasa explícita) o, si no hay, la del servidor (GEMINI_API_KEY). La clave BYOK se
 * descifra solo en el servidor (getUserLlmKey) y nunca se guarda en claro.
 */
function googleModel(apiKey?: string) {
  const key = apiKey || geminiApiKey();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  return createGoogleGenerativeAI({ apiKey: key })(MODEL);
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

/** Las 5 llamadas troceadas (§4.3) sobre UNA ventana, en paralelo. */
async function extractWindow(model: ReturnType<typeof googleModel>, text: string): Promise<Extraction> {
  const p = (focus: string) => `${BASE}${text}\n\n(Extrae: ${focus})`;
  const [basics, work, education, skills, projects] = await Promise.all([
    generateObject({ model, schema: BasicsSchema, prompt: p("datos básicos, contacto y resumen"), temperature: 0.1 }),
    generateObject({ model, schema: WorkSchema, prompt: p("experiencia laboral, con viñetas"), temperature: 0.1 }),
    generateObject({ model, schema: EducationSchema, prompt: p("formación académica"), temperature: 0.1 }),
    generateObject({ model, schema: SkillsSchema, prompt: p("aptitudes técnicas agrupadas"), temperature: 0.1 }),
    generateObject({ model, schema: ProjectsSchema, prompt: p("proyectos personales/open source"), temperature: 0.1 }),
  ]);
  return {
    basics: basics.object,
    work: work.object.items,
    education: education.object.items,
    skills: skills.object.items,
    projects: projects.object.items,
  };
}

/**
 * El extractor real: el texto ENTERO en ventanas solapadas, 5 llamadas troceadas
 * por ventana (§4.3), y fusión con deduplicación. La clave se inyecta (BYOK del
 * usuario o, si no, la del servidor). `geminiExtractor` es el atajo con la clave
 * del servidor (compat con el pipeline y sus tests).
 *
 * Las ventanas van EN SERIE a propósito: dentro de cada una ya hay 5 llamadas en
 * paralelo, y disparar 5×N de golpe es la forma más rápida de comerse el límite
 * de peticiones del proveedor y perder el documento entero por un 429.
 */
export function makeGeminiExtractor(apiKey?: string): Extractor {
  return async (rawText) => {
    const seg = segmentText(rawText);
    const model = googleModel(apiKey);

    const parts: Extraction[] = [];
    for (const w of seg.windows) parts.push(await extractWindow(model, w));

    const warn = truncationWarning(seg);
    return { ...mergeExtractions(parts), warnings: warn ? [warn] : [] };
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
    model: googleModel(apiKey),
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
    model: googleModel(apiKey),
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
