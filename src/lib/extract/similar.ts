/**
 * Similitud SEMÁNTICA barata entre dos items del staging (§A1 · nivel n2).
 *
 * POR QUÉ EXISTE. La dedup determinista de dedup.ts casa «empresa normalizada +
 * solape de fechas». Eso sirve para CV-contra-LinkedIn: dos fuentes estructuradas,
 * ambas con empresa y con fecha. No sirve para un dossier narrativo, que es el
 * caso que rompió de verdad: el mismo trabajo contado tres veces, una con fecha y
 * empresa, otra sin fecha, otra con la empresa mal («Químico farmacéutico» no es
 * una empresa: es la profesión del cliente) o directamente vacía. Las DOS patas de
 * la clave están rotas a la vez, así que hay que decidir por el CONTENIDO.
 *
 * Sin LLM, a propósito: esto tiene que ser determinista (testeable), gratis y
 * ejecutable sobre todos los pares de un import. Un embedding sería más fino y
 * mucho peor producto: no se puede explicar en la tarjeta ni reproducir en un test.
 *
 * QUÉ COMPARA. No metadatos: señales de contenido, con pesos distintos porque no
 * todas valen lo mismo.
 *   · cifras     (peso 4) — «~300 personas», «80 scripts». Casi identifican el hecho.
 *   · entidades  (peso 3) — siglas (UNAB, VR, RAG), nombres propios (Tesseract,
 *                Thrustmaster, PharmIQ, 3DLab) y tecnologías del diccionario.
 *   · años       (peso 2) — coinciden por casualidad más a menudo que una cifra.
 *   · palabras   (peso 1) — el resto del vocabulario significativo.
 *
 * Se reutiliza lo que ya existe en vez de reinventarlo: `extractNumbers` y
 * `extractEntities` de verify.ts (canonicalización de cifras y siglas/tecnologías)
 * y el diccionario TECH de classify.ts. verify.ts NO se toca: solo se importa.
 *
 * ⚠ Esto NO fusiona ni descarta nada. Devuelve un número y las señales que lo
 *   sostienen, para que dedup.ts explique la sospecha y el usuario decida.
 */

import { extractEntities, extractNumbers } from "../verify";
import { TECH } from "./classify";

const stripAccents = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const low = (s: string): string => stripAccents(s).toLowerCase();

/** Pesos por tipo de señal. Una cifra compartida vale cuatro palabras compartidas. */
export const WEIGHTS = { number: 4, entity: 3, year: 2, word: 1 } as const;

/**
 * Vacío léxico: ni identifica ni distingue. Incluye los conectores y los verbos
 * de estar/ser, que aparecen en TODO texto de CV y solo inflarían el parecido.
 */
const STOP = new Set<string>([
  // ES
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "a",
  "en", "y", "e", "o", "u", "que", "con", "por", "para", "como", "mas", "pero",
  "su", "sus", "se", "lo", "le", "les", "es", "son", "fue", "era", "ser", "estar",
  "esta", "este", "esto", "estos", "estas", "ese", "esa", "eso", "sobre", "entre",
  "desde", "hasta", "donde", "cuando", "todo", "toda", "todos", "todas", "otro",
  "otra", "muy", "ya", "tambien", "menos", "cada", "sin", "tras", "ante", "bajo",
  "yo", "mi", "me", "nos", "hay", "han", "he", "ha", "habia", "sido", "durante",
  // EN
  "the", "of", "and", "or", "in", "on", "at", "to", "for", "with", "as", "by",
  "an", "is", "are", "was", "were", "be", "been", "from", "that", "this", "these",
  "those", "it", "its", "my", "we", "our", "their", "into", "over", "than",
]);

/**
 * Palabras que aparecen capitalizadas en cualquier CV y NO son nombre propio:
 * «Desarrollador», «Software», «Práctica». Se degradan a palabra normal (peso 1).
 * Si contaran como entidad, dos trabajos que no tienen nada que ver compartirían
 * «dos entidades» solo por llamarse ambos «Desarrollador de Software».
 */
const GENERIC = new Set<string>([
  "desarrollo", "desarrollador", "desarrolladora", "software", "hardware",
  "ingeniero", "ingeniera", "ingenieria", "proyecto", "practica", "profesional",
  "empresa", "trabajo", "experiencia", "sistema", "equipo", "aplicacion",
  "plataforma", "tecnologia", "programa", "gestion", "area", "cargo", "rol",
  "cliente", "servicio", "numero", "uno", "dos", "tres", "mes", "ano", "actual",
  "actualidad", "engineer", "engineering", "developer", "development", "intern",
  "internship", "company", "project", "team", "work", "role", "current",
]);

/**
 * Raíz de comparación: quita la «s» del plural y después la «e» final. Los dos
 * pasos hacen falta juntos porque en español el plural es «-s» tras vocal y
 * «-es» tras consonante, y sin diccionario no se sabe cuál toca: «timones» →
 * «timone» → «timon» casa con «timón», y «softwares» → «software» → «softwar»
 * casa con «software». Recorta de más a veces («base» → «bas»), y da igual: es
 * una CLAVE de comparación, se aplica a los dos lados por igual y nunca se
 * muestra ni se persiste.
 */
function singular(w: string): string {
  let s = w;
  if (s.length > 4 && s.endsWith("s")) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

// Los diccionarios se consultan SIEMPRE con la raíz, así que se guardan ya
// recortados: si no, «Software» (raíz «softwar») escaparía de GENERIC y pasaría
// por nombre propio.
const STOP_ROOT = new Set([...STOP].map(singular));
const GENERIC_ROOT = new Set([...GENERIC].map(singular));

/** Corta camelCase/PascalCase: «TesseractSoftwares» → «Tesseract Softwares».
 *  Solo en la frontera minúscula→MAYÚSCULA: así «3DLab» NO se parte en «3 DLab». */
const splitCamel = (s: string): string => s.replace(/([\p{Ll}])([\p{Lu}])/gu, "$1 $2");

/** Tokens crudos, conservando la caja original (hace falta para oler nombre propio). */
function rawTokens(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}#+.]+/u)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
}

const isAcronym = (t: string): boolean => {
  const core = t.replace(/[^\p{L}\p{N}]/gu, "");
  return core.length >= 2 && core.length <= 8 && /^[\p{Lu}\p{N}]+$/u.test(core) && /\p{Lu}/u.test(core);
};
/** MAYÚSCULA interior: «PharmIQ», «3DLab», «TesseractSoftwares». */
const hasInnerCaps = (t: string): boolean => /[\p{Ll}\p{N}][\p{Lu}]/u.test(t);
const isCapitalized = (t: string): boolean => /^[\p{Lu}][\p{Ll}]/u.test(t);

export interface SignalBag {
  /** token → peso. Un token que es entidad Y palabra pesa como entidad (max). */
  weights: Map<string, number>;
  entities: Set<string>;
  numbers: Set<string>;
  /** suma de todos los pesos: el «tamaño» del item para el denominador. */
  total: number;
}

function add(bag: SignalBag, token: string, weight: number): void {
  if (!token) return;
  const prev = bag.weights.get(token) ?? 0;
  if (weight > prev) bag.weights.set(token, weight);
}

/**
 * Bolsa de señales de un item. Se le pasan TODOS sus textos (título, empresa,
 * descripción, viñetas, evidencia): la identidad del hecho está repartida entre
 * ellos, y en el caso roto el título es justo el campo que no coincide.
 */
export function signalsOf(...texts: (string | null | undefined)[]): SignalBag {
  const bag: SignalBag = { weights: new Map(), entities: new Set(), numbers: new Set(), total: 0 };
  const text = texts.filter(Boolean).join(" · ").trim();
  if (!text) return bag;

  // ── cifras y años ──────────────────────────────────────────────────────────
  // Se borran antes los tokens que mezclan letra y dígito («3DLab», «p99»): ahí el
  // número es parte de un nombre, no una magnitud, y contarlo con peso 4 sería
  // hacer pasar una coincidencia de nombre por una coincidencia de hecho.
  const numericSource = text.replace(
    /[\p{L}\p{N}]*\p{N}[\p{L}\p{N}]*/gu,
    (m) => (/\p{L}/u.test(m) ? " " : m),
  );
  for (const n of extractNumbers(numericSource)) {
    const isYear = n.unit === "" && Number.isInteger(n.value) && n.value >= 1900 && n.value <= 2099;
    if (isYear) {
      add(bag, `#y:${n.value}`, WEIGHTS.year);
    } else {
      const key = `#n:${n.value}|${n.unit}`;
      bag.numbers.add(`${n.value}${n.unit}`);
      add(bag, key, WEIGHTS.number);
    }
  }

  // ── entidades que ya sabe reconocer verify.ts (siglas + diccionario TECH) ──
  for (const e of extractEntities(text)) {
    const k = singular(low(e));
    bag.entities.add(k);
    add(bag, k, WEIGHTS.entity);
  }

  // ── tokens: entidad o palabra ─────────────────────────────────────────────
  // Se recorre POR FRASE porque la mayúscula solo delata nombre propio cuando no
  // es el arranque de la frase. Es la misma cautela que ya documenta verify.ts:
  // contar «Responsable…» o «Videojuego…» como entidad convertiría el inicio de
  // cualquier frase en un falso nombre propio, y con peso triple.
  for (const frase of text.split(/[.!?]+(?=\s|$)|\n+/)) {
    const tokens = rawTokens(frase);
    for (let i = 0; i < tokens.length; i++) {
      const raw = tokens[i]!;
      // Un token camelCase o una sigla es un nombre propio POR SU FORMA: da igual
      // que abra la frase, y sus partes heredan esa condición («TesseractSoftwares»
      // al principio de una línea sigue conteniendo «Tesseract»).
      const nombrePropio = hasInnerCaps(raw) || isAcronym(raw);
      const inicioDeFrase = i === 0 && !nombrePropio;
      const pieces = splitCamel(raw).split(" ").filter(Boolean);
      // el token entero cuenta además de sus partes: «TesseractSoftwares» debe
      // casar tanto con «TesseractSoftwares» como con «Tesseract Softwares».
      const all = pieces.length > 1 ? [raw, ...pieces] : pieces;
      for (const piece of all) {
        const k = singular(low(piece));
        if (k.length < 3 || STOP_ROOT.has(k)) continue;
        // el diccionario TECH está indexado sin puntuación («nodejs», no «node.js»)
        const techKey = low(piece).replace(/[^a-z0-9+]/g, "");
        const entity =
          isAcronym(piece) ||
          hasInnerCaps(piece) ||
          TECH.has(techKey) ||
          TECH.has(singular(techKey)) ||
          (isCapitalized(piece) && piece.length >= 4 && !GENERIC_ROOT.has(k) && !inicioDeFrase);
        if (entity) {
          bag.entities.add(k);
          add(bag, k, WEIGHTS.entity);
        } else {
          add(bag, k, WEIGHTS.word);
        }
      }
    }
  }

  for (const w of bag.weights.values()) bag.total += w;
  return bag;
}

export interface SimilarityResult {
  /** Jaccard PONDERADO: peso compartido / peso total de la unión. Simétrico. */
  score: number;
  /** peso compartido / peso del item MÁS PEQUEÑO. Alto cuando el corto está
   *  contenido en el largo — el caso «una línea narrativa contra un rol entero». */
  containment: number;
  /** peso ABSOLUTO compartido. Los porcentajes mienten con textos muy cortos. */
  sharedWeight: number;
  sharedEntities: string[];
  sharedNumbers: string[];
}

export function compareSignals(a: SignalBag, b: SignalBag): SimilarityResult {
  if (!a.total || !b.total) {
    return { score: 0, containment: 0, sharedWeight: 0, sharedEntities: [], sharedNumbers: [] };
  }
  let inter = 0;
  const sharedEntities: string[] = [];
  const sharedNumbers: string[] = [];
  for (const [tok, wa] of a.weights) {
    const wb = b.weights.get(tok);
    if (wb === undefined) continue;
    const w = Math.max(wa, wb);
    inter += w;
    if (tok.startsWith("#n:")) sharedNumbers.push(tok.slice(3).replace("|", ""));
    else if (a.entities.has(tok) || b.entities.has(tok)) sharedEntities.push(tok);
  }
  const union = a.total + b.total - inter;
  return {
    score: union > 0 ? inter / union : 0,
    containment: inter / Math.min(a.total, b.total),
    sharedWeight: inter,
    sharedEntities,
    sharedNumbers,
  };
}

/* ── Umbrales ──────────────────────────────────────────────────────────────────
   Calibrados contra el volcado REAL (ver tests/similar.test.ts y el fixture de
   tests/dedup.test.ts), no elegidos a ojo. La referencia es esta: dos redacciones
   del MISMO trabajo desde ángulos distintos comparten en torno a un tercio de su
   peso —cada versión aporta detalles que la otra no tiene, así que el parecido
   nunca sube al 80%—, mientras que dos trabajos DISTINTOS de la misma carrera
   comparten el vocabulario de oficio (Unity, C#, VR) y se quedan por debajo del
   15%. La franja intermedia es real y por eso hay tres niveles en vez de un
   sí/no: lo que cae ahí se marca como sospecha débil y lo resuelve el usuario.  */

/** Contenido casi idéntico: es el mismo hecho contado dos veces. */
export const SIMILAR_STRONG = 0.42;
/** Mismo hecho, redactado desde otro ángulo. */
export const SIMILAR_LIKELY = 0.28;
/** Roza: se marca, pero no basta por sí solo. */
export const SIMILAR_WEAK = 0.18;
/** Un item corto casi contenido en uno largo: hace falta este solape… */
export const CONTAINMENT_HIGH = 0.55;
/**
 * Suelo ABSOLUTO de peso compartido. Sin él, dos textos cortos que solo comparten
 * «Unity» dan un porcentaje alto por pura falta de denominador — y toda la
 * carrera del usuario menciona Unity. Cinco puntos obligan a tres señales
 * (3 palabras), o a una entidad más dos palabras: ya no es una coincidencia.
 */
export const MIN_SHARED_WEIGHT = 5;
/** …Y al menos estas entidades compartidas. Con una sola («Unity») cualquier par
 *  de la misma carrera pasaría; dos nombres propios ya no son coincidencia. */
export const SHARED_ENTITIES_MIN = 2;

export type SimilarityVerdict = "fuerte" | "probable" | "debil" | "no";

/**
 * Veredicto de contenido. La regla de containment existe para el caso asimétrico
 * (una frase suelta del cuestionario contra un rol con seis viñetas): ahí el
 * Jaccard castiga por tamaño aunque TODO lo que dice el corto esté en el largo.
 */
export function similarityVerdict(r: SimilarityResult): SimilarityVerdict {
  if (r.sharedWeight < MIN_SHARED_WEIGHT) return "no";
  if (r.score >= SIMILAR_STRONG) return "fuerte";
  if (r.score >= SIMILAR_LIKELY) return "probable";
  if (r.containment >= CONTAINMENT_HIGH && r.sharedEntities.length >= SHARED_ENTITIES_MIN) return "probable";
  if (r.score >= SIMILAR_WEAK) return "debil";
  return "no";
}

/** Atajo para comparar textos sueltos (lo usan los tests y llm.ts). */
export function compareTexts(a: string, b: string): SimilarityResult {
  return compareSignals(signalsOf(a), signalsOf(b));
}
