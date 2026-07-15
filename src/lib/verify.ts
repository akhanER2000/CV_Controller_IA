/**
 * El núcleo ético de Corpus, en código. Dos garantías, ambas DERIVADAS DE HECHOS
 * (nunca del auto-reporte de un LLM):
 *
 *  1. verifyEvidence — ¿el fragmento citado aparece de verdad en la fuente?
 *     Binario y gratis (normalize + includes). Tres niveles derivados de hechos,
 *     no un "confidence" numérico inventado (prompt §4.4).
 *
 *  2. preservesFacts — ¿una reformulación introduce cifras o entidades que NO
 *     estaban en el original ni en la evidencia? Es el agujero por donde se cuela
 *     la alucinación; cerrarlo es la promesa entera (prompt §6.2, criterio #7).
 *
 * Comprobar que la propuesta trae un item_id válido NO basta: verifica la
 * procedencia del hueco, no la del contenido. Aquí se verifica el contenido.
 */

// ── Normalización compartida ─────────────────────────────────────────────────
/** minúsculas, sin acentos, espacios colapsados. Para comparaciones robustas. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ── Evidencia ────────────────────────────────────────────────────────────────
export type EvidenceLevel = "verified" | "partial" | "none";

/**
 * ¿La evidencia citada está en el texto crudo de la fuente?
 *  · verified: coincidencia literal (normalizada).
 *  · partial : coincidencia difusa (≥70% de los tokens de la evidencia están en la fuente).
 *  · none    : ni eso → borde punteado + glifo + palabra en la UI, nunca solo color.
 */
export function verifyEvidence(rawText: string, evidence: string): EvidenceLevel {
  const src = normalize(rawText);
  const ev = normalize(evidence);
  if (!ev) return "none";
  if (src.includes(ev)) return "verified";

  // tokeniza por frontera no-alfanumérica: la puntuación pegada ("idempotencia.")
  // no debe romper la coincidencia de tokens.
  const evTokens = ev.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (evTokens.length === 0) return "none";
  const srcTokens = new Set(src.split(/[^a-z0-9]+/));
  const hits = evTokens.filter((t) => srcTokens.has(t)).length;
  return hits / evTokens.length >= 0.7 ? "partial" : "none";
}

// ── Números (con formato chileno: 40.000 miles, 0,94 decimal) ─────────────────
export interface NumberToken {
  raw: string;
  /** valor canónico (40.000 → 40000, 0,94 → 0.94) */
  value: number;
  /** unidad adosada: "%", "x", "m", "k"… o "" */
  unit: string;
}

/** Canonicaliza el número de una parte "40.000" / "0,94" / "1.234,56". */
function toValue(numeric: string): number {
  let t = numeric.trim();
  const hasDot = t.includes(".");
  const hasComma = t.includes(",");
  if (hasDot && hasComma) {
    // el último separador es el decimal; el otro son miles
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
  } else if (hasComma) {
    t = t.replace(",", "."); // coma decimal
  } else if (hasDot) {
    // "40.000" (miles) vs "3.1" (decimal). Miles = grupos de exactamente 3 dígitos.
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  }
  return parseFloat(t);
}

/** Extrae todos los números visibles, con su unidad. */
export function extractNumbers(s: string): NumberToken[] {
  const out: NumberToken[] = [];
  // dígitos con separadores . , seguidos opcionalmente de %, x, ×, o sufijo de magnitud
  const re = /(\d[\d.,]*)\s*(%|×|x\b|k\b|m\b|mm\b|hrs?\b|h\b|min\b|d\b)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const value = toValue(m[1]!);
    if (Number.isNaN(value)) continue;
    out.push({ raw: m[0].trim(), value, unit: (m[2] ?? "").toLowerCase().replace("×", "x").trim() });
  }
  return out;
}

// ── Entidades nombradas candidatas (en la PROPUESTA) ─────────────────────────
// Diccionario mínimo de tecnologías que suelen inventarse en un CV "tuneado".
const TECH = [
  "kafka", "kubernetes", "docker", "postgresql", "redis", "grpc", "openapi",
  "node.js", "django", "python", "golang", "go", "typescript", "graphql",
  "terraform", "aws", "gcp", "azure", "spark", "hadoop", "tensorflow", "pytorch",
  "event-driven", "microservices", "microservicios",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** ¿aparece `term` como token completo en `low` (bordes no alfanuméricos)? */
const hasToken = (low: string, term: string) =>
  new RegExp(`(^|[^a-z0-9])${escapeRe(term)}($|[^a-z0-9])`, "i").test(low);

/**
 * Candidatas a entidad nombrada: acrónimos en mayúsculas (API, AWS, CI/CD) y
 * términos técnicos del diccionario, ambos con frontera de token. Se extraen de
 * la PROPUESTA; luego se comprueba que existan en el origen.
 *
 * Deliberadamente NO se extraen palabras Capitalizadas sueltas: el inicio de
 * frase ("Responsable…", "Mantengo…") las volvería falsos positivos que
 * rechazarían reformulaciones legítimas. El vector real de invención en un CV
 * "tuneado" son tecnologías (Kafka) y siglas — que sí se cazan.
 */
export function extractEntities(s: string): string[] {
  const set = new Set<string>();
  for (const m of s.matchAll(/\b[A-Z][A-Z0-9]{1,}(?:\/[A-Z0-9]+)*\b/g)) set.add(normalize(m[0]));
  const low = normalize(s);
  for (const t of TECH) if (hasToken(low, t)) set.add(t);
  return [...set];
}

// ── preservesFacts — el control que de verdad importa ────────────────────────
export interface PreserveResult {
  ok: boolean;
  /** cifras en la propuesta que no están en original ni evidencia */
  newNumbers: string[];
  /** entidades en la propuesta que no están en original ni evidencia */
  newEntities: string[];
}

/**
 * ¿La reformulación PRESERVA los hechos del original/evidencia?
 *  1. Todo NÚMERO de `proposed` debe existir en `original` o `evidence` (mismo
 *     valor y unidad). Cifras nuevas = invención. Sin excepciones.
 *  2. Toda ENTIDAD nombrada de `proposed` debe existir en el origen.
 *  3. Las unidades no pueden cambiar (25% ≠ 25x ≠ 250): se compara value+unit.
 * Si no preserva → no se ofrece como sugerencia aceptable; override_verified=false.
 */
export function preservesFacts(original: string, proposed: string, evidence = ""): PreserveResult {
  const source = `${original} ${evidence}`;
  const srcNumbers = extractNumbers(source);
  const srcHas = (n: NumberToken) =>
    srcNumbers.some((x) => x.value === n.value && x.unit === n.unit);

  const newNumbers = extractNumbers(proposed)
    .filter((n) => !srcHas(n))
    .map((n) => n.raw);

  const srcText = normalize(source);
  const srcEntities = new Set(extractEntities(source));
  const newEntities = extractEntities(proposed).filter(
    (e) => !srcEntities.has(e) && !hasToken(srcText, e),
  );

  return { ok: newNumbers.length === 0 && newEntities.length === 0, newNumbers, newEntities };
}

// ── Filtro anti-"suena a IA" (prompt §6.1) ───────────────────────────────────
const AI_TELLS_ES = ["potenciar sinergias", "impulsar la excelencia", "gestión integral", "gestion integral"];
const AI_TELLS_EN = ["delve", "leverage", "spearheaded", "robust", "seamless"];

/** Detecta el vocabulario delator de IA. No bloquea por sí solo, señala. */
export function soundsLikeAI(text: string): { flagged: boolean; terms: string[] } {
  const t = normalize(text);
  const terms = [...AI_TELLS_ES, ...AI_TELLS_EN].filter((w) => t.includes(normalize(w)));
  return { flagged: terms.length > 0, terms };
}
