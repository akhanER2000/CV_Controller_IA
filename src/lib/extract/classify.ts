/**
 * Clasificación DETERMINISTA de una línea antes de stagearla (§C1). El problema
 * real: LinkedIn lista ETIQUETAS DE HABILIDAD («Unity 3D», «C#», «Gestión ágil de
 * proyectos») que el extractor aplana como si fueran viñetas de logro bajo un rol.
 * Aquí se separan, con reglas testeables SIN LLM:
 *
 *   · 'bullet' — VIÑETA DE LOGRO: empieza por un verbo de acción conjugado
 *     (reduje/diseñé/lideré · reduced/designed/led) o describe un resultado con
 *     cifra. Es una frase, no una etiqueta.
 *   · 'skill'  — HABILIDAD: corta (≤ ~6 palabras), sin verbo conjugado, con patrón
 *     de etiqueta (nombre técnico, «X & Y», paréntesis de stack, capitalización de
 *     producto, sustantivo de competencia).
 *   · 'doubt'  — SEÑALES QUE CHOCAN: se stagea como viñeta PERO con la duda visible.
 *     No se adivina en silencio.
 *
 * Regla de oro de Corpus: NADA se inventa. La clasificación no cambia el texto ni
 * su evidencia; solo decide en qué cajón entra y, si duda, lo dice.
 */

export type BulletKind = "bullet" | "skill" | "doubt";

export interface BulletClassification {
  kind: BulletKind;
  /** por qué, en español legible (viaja al staging cuando hay duda). */
  reason: string;
}

// ── Normalización local (no depende de verify.ts) ────────────────────────────
const stripAccents = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** minúsculas + sin acentos + solo letras/dígitos: para comparar tokens. */
const tok = (s: string): string => stripAccents(s).toLowerCase().replace(/[^a-z0-9+]/g, "");
/** clave de línea completa (sin acento, espacios colapsados): para casar líneas
 *  de «Aptitudes» del origen contra supuestas viñetas, exactamente igual. */
export const normalizeLine = (s: string): string =>
  stripAccents(s).toLowerCase().replace(/\s+/g, " ").trim();

// Verbos de acción CONJUGADOS (1ª persona pretérito/presente y equivalentes EN),
// guardados SIN acento. Deliberadamente NO incluye «diseño»/«desarrollo» (chocan
// con el sustantivo) ni presentes EN ambiguos («lead»/«design»/«build», que son
// también títulos/etiquetas): esos caen a habilidad o duda, nunca a viñeta falsa.
const VERBS = new Set<string>([
  // ES · pretérito 1ª persona
  "reduje", "disene", "implemente", "lidere", "migre", "automatice", "desarrolle",
  "construi", "mantuve", "documente", "mentore", "escribi", "atendi", "optimice",
  "aumente", "disminui", "cree", "coordine", "gestione", "dirigi", "lance",
  "entregue", "mejore", "integre", "refactorice", "defini", "estableci",
  "prototipe", "colabore", "participe", "planifique", "ejecute", "resolvi",
  "analice", "investigue", "supervise", "capacite", "forme", "negocie",
  "presente", "publique", "implante", "desplegue", "configure", "administre",
  "programe", "funde", "cofunde", "reduje", "logre", "consegui", "aporte",
  "modele", "disee", "rediseñe", "redisene", "amplie", "acelere", "escale",
  // ES · presente 1ª persona (terminación -o/-go inequívoca de verbo)
  "mantengo", "lidero", "gestiono", "coordino", "dirijo", "administro",
  "superviso", "construyo", "implemento", "optimizo", "automatizo", "resuelvo",
  "analizo", "programo", "escribo", "mantengo", "desarrollo",
  // EN · pasado (inequívoco)
  "reduced", "designed", "led", "built", "implemented", "migrated", "automated",
  "developed", "maintained", "wrote", "optimized", "increased", "decreased",
  "created", "managed", "coordinated", "delivered", "launched", "improved",
  "integrated", "refactored", "defined", "established", "prototyped",
  "collaborated", "drove", "spearheaded", "owned", "shipped", "deployed",
  "configured", "administered", "programmed", "analyzed", "researched",
  "supervised", "mentored", "trained", "negotiated", "presented", "published",
  "architected", "scaled", "founded", "cofounded", "oversaw", "headed", "grew",
]);

// Arranques de RESPONSABILIDAD → es una viñeta (aunque débil), no una etiqueta.
const RESP_STARTS = new Set<string>([
  "responsable", "encargado", "encargada", "responsible", "accountable",
]);
const RESP_PHRASES = /^(a\s+cargo\s+de|responsible\s+for|in\s+charge\s+of|part\s+of)/i;

// Sustantivos de COMPETENCIA (arranque típico de etiqueta), SIN acento.
const COMPETENCY = new Set<string>([
  "gestion", "liderazgo", "desarrollo", "diseno", "analisis", "arquitectura",
  "administracion", "programacion", "comunicacion", "resolucion", "metodologias",
  "aprendizaje", "trabajo", "conocimiento", "manejo", "dominio", "planificacion",
  "coordinacion", "optimizacion", "integracion", "automatizacion", "mantenimiento",
  "soporte", "testing", "pruebas", "modelado", "prototipado", "investigacion",
  "docencia", "mentoria", "negociacion", "gestion", "control", "seguridad",
  // EN
  "management", "leadership", "development", "design", "analysis", "architecture",
  "communication", "teamwork", "knowledge", "methodologies", "mentoring",
  "research", "problem", "testing", "modeling",
]);

// Diccionario de tecnologías / metodologías: una palabra basta para oler etiqueta.
// Se EXPORTA porque similar.ts lo necesita para pesar entidades: duplicarlo allí
// garantizaría que los dos diccionarios se separen a la primera incorporación.
export const TECH = new Set<string>([
  "agile", "agil", "scrum", "kanban", "unity", "unreal", "quest", "vr", "ar",
  "xr", "python", "java", "javascript", "typescript", "react", "angular", "vue",
  "node", "nodejs", "docker", "kubernetes", "k8s", "aws", "gcp", "azure", "sql",
  "nosql", "postgresql", "mysql", "mongodb", "redis", "kafka", "graphql", "rest",
  "git", "github", "gitlab", "jira", "figma", "blender", "csharp", "cpp",
  "golang", "go", "rust", "php", "ruby", "swift", "kotlin", "flutter",
  "tensorflow", "pytorch", "oculus", "hololens", "arduino", "raspberry",
  "photoshop", "illustrator", "premiere", "aftereffects", "maya", "3dsmax",
  "solidworks", "autocad", "excel", "powerbi", "tableau", "spark", "hadoop",
]);

// Resultado con CIFRA: dígito + unidad/porcentaje inequívocos. NO matchea «3D»,
// «C#», «Unity 3D» ni versiones («3.11»): esas no son métricas de logro.
const METRIC_RE =
  /\d[\d.,]*\s*(%|×|x\b|ms\b|µs\b|seg\b|min\b|hrs?\b|rps\b|qps\b|reqs?\b|fps\b|[kmgt]b\b|€|\$|usd\b|clp\b|mm\b)/i;

function labelSignal(core: string): boolean {
  const low = core.toLowerCase();
  // símbolos técnicos: C#, C++, .js/.ts/.py, 3D/2D, VR/AR/XR
  if (/#|c\+\+|\+\+|\.(js|ts|py|rs|go)\b/i.test(core)) return true;
  if (/\b[23]d\b|\b(vr|ar|xr)\b/i.test(low)) return true;
  if (/&/.test(core)) return true; // «Liderazgo Técnico (Unity & VR)»
  if (/[a-z]\/[a-z]/i.test(core)) return true; // CI/CD, TCP/IP
  if (/\([^)]+\)/.test(core)) return true; // paréntesis de stack
  const tokens = core.split(/\s+/).filter(Boolean);
  // acrónimo en mayúsculas (SQL, AWS, CI/CD)
  if (tokens.some((t) => /^[A-Z]{2,6}(\/[A-Z]{2,6})?$/.test(t.replace(/[.,;:]+$/, "")))) return true;
  // arranque con sustantivo de competencia
  if (COMPETENCY.has(tok(tokens[0] ?? ""))) return true;
  // alguna palabra del diccionario técnico
  if (tokens.some((t) => TECH.has(tok(t)))) return true;
  // capitalización de producto: ≥2 tokens que arrancan en mayúscula o dígito, y corto
  const capish = tokens.filter((t) => /^[A-ZÀ-Ú]/.test(t) || /^\d/.test(t)).length;
  if (capish >= 2 && tokens.length <= 4) return true;
  return false;
}

/**
 * Clasifica una línea suelta. Determinista, sin LLM. El orden importa: primero las
 * señales FUERTES de viñeta (verbo inicial, responsabilidad, cifra), luego el
 * patrón de etiqueta; lo ambiguo cae a 'doubt' (nunca se fuerza a viñeta o skill).
 */
export function classifyBulletText(raw: string): BulletClassification {
  const text = (raw ?? "").trim();
  if (!text) return { kind: "doubt", reason: "línea vacía" };

  // quita marcadores de lista y numeración inicial
  const core = text.replace(/^[\s\-–—•·▪◦*·]+/, "").replace(/^\d+[.)]\s+/, "").trim();
  if (!core) return { kind: "doubt", reason: "solo un marcador de lista" };

  const tokens = core.split(/\s+/).filter(Boolean);
  const first = tok(tokens[0] ?? "");
  const n = tokens.length;
  const metric = METRIC_RE.test(core);
  const short = n <= 6 && core.length <= 52;

  const verbHere = tokens.slice(0, 3).some((t) => VERBS.has(tok(t)));

  // 1 · responsabilidad explícita → viñeta
  if (RESP_STARTS.has(first) || RESP_PHRASES.test(core)) {
    return { kind: "bullet", reason: "arranca describiendo una responsabilidad" };
  }
  // 2 · verbo de acción al inicio → viñeta
  if (VERBS.has(first)) {
    return { kind: "bullet", reason: `arranca con verbo de acción («${tokens[0]}»)` };
  }
  // 3 · resultado con cifra en una frase → viñeta
  if (metric && n >= 4) {
    return { kind: "bullet", reason: "describe un resultado con cifra" };
  }
  // 4 · verbo de acción más adelante + frase larga → viñeta
  if (verbHere && n > 6) {
    return { kind: "bullet", reason: "frase con verbo de acción" };
  }
  // 5 · etiqueta corta, sin verbo, con patrón de habilidad → skill
  if (short && !verbHere && !metric && labelSignal(core)) {
    return { kind: "skill", reason: "etiqueta de habilidad (corta, sin verbo, patrón de skill)" };
  }
  // 6 · corta, sin verbo, pero sin patrón claro → duda (se marca, no se adivina)
  if (short && !verbHere) {
    return { kind: "doubt", reason: "corta y sin verbo, pero sin patrón claro de habilidad" };
  }
  // 7 · larga, sin verbo ni cifra → duda
  return { kind: "doubt", reason: "sin señal clara de viñeta ni de habilidad" };
}

/* ============================================================================
   §A1 · GRUPO DE HABILIDADES disfrazado de PROYECTO
   ============================================================================
   El caso REAL: en un volcado narrativo, doce grupos de aptitudes salieron del
   extractor como `project`. La forma delatora siempre es la misma —

       «Etiqueta: item, item, item»

   — una lista de tecnologías separada por comas, SIN VERBO, SIN RESULTADO y SIN
   NOMBRE PROPIO. Un proyecto de verdad tiene nombre propio y casi siempre repo,
   demo, fecha o una cifra. Ese es el eje entero de la distinción.

   ⚠ POR QUÉ NO SE REUTILIZA `looksLikeSkillTag` (src/lib/db/master.ts). Aquella
   juzga UN chip suelto ya escrito por el usuario, para ofrecerle mover una viñeta
   a aptitudes; su entrada es un texto y su sesgo es no molestar. Aquí la entrada
   son DOS campos (nombre + descripción) y el fallo a evitar es el contrario. De
   hecho aplicarla sin más rompería: «Script de calibración de timón» son cinco
   palabras, sin verbo conjugado y sin métrica fuerte, así que `looksLikeSkillTag`
   lo daría por etiqueta — y es un proyecto real del usuario. Hay un test que fija
   esa diferencia para que nadie las fusione «simplificando».                     */

// Preposiciones: un item de aptitud no las lleva («Machine Learning» sí,
// «Plataforma de pagos» no). Es lo que separa una lista de skills de una frase
// troceada por comas.
const PREPS = new Set<string>([
  "de", "del", "para", "con", "en", "por", "sobre", "entre", "desde", "hasta",
  "al", "a", "of", "for", "with", "in", "on", "to", "from", "at", "into",
]);

// Sustantivos que TAMBIÉN son forma verbal («desarrollo», «diseño»). En una
// descripción de aptitudes leen como sustantivo, así que no cuentan como «aquí se
// cuenta algo que se hizo». Los demás verbos de VERBS sí.
const AMBIGUOUS_NOUN_VERBS = new Set<string>([
  "desarrollo", "diseno", "presente", "cree", "forme", "modele", "programa",
]);

const hasUrl = (s: string): boolean =>
  /https?:\/\/|www\.|github\.com|gitlab\.com|\b[\w-]+\.(com|cl|io|dev|app|org|net)\b/i.test(s);

/**
 * ¿Hay una CIFRA de proyecto? Un número de ≥2 dígitos que no sea una versión
 * («Python 3.11», «Unity 2022.3») ni parte de un identificador («3DLab», «p99»).
 * Cubre a la vez la cifra de impacto («~300 personas», «~80 scripts») y el año
 * («…-2025»): las dos son evidencia de proyecto y ninguna aparece en una lista
 * de aptitudes.
 */
function hasProjectFigure(s: string): boolean {
  const sinVersiones = s.replace(/\b\d+(?:\.\d+)+\b/g, " ");
  return /(?<![\p{L}\p{N}.])\d{2,}(?![\p{L}])/u.test(sinVersiones);
}

/** ¿Este segmento parece un ITEM de aptitud? Corto, sin preposición y sin verbo. */
function isSkillItem(seg: string): boolean {
  const words = seg.trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return false;
  return !words.some((w) => PREPS.has(tok(w)) || VERBS.has(tok(w)));
}

/** ¿El nombre es una CATEGORÍA («Desarrollo Web y Backend») y no un nombre propio? */
function looksLikeCategoryName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  if (hasProjectFigure(t) || hasUrl(t)) return false;
  if (/[-_/]/.test(t)) return false; // «3DLab-Environment-2025» es un identificador
  if (words.some((w) => VERBS.has(tok(w)) && !AMBIGUOUS_NOUN_VERBS.has(tok(w)))) return false;
  if (COMPETENCY.has(tok(words[0] ?? ""))) return true; // «Desarrollo …», «Gestión …»
  if (/\s(y|e|&|and)\s/i.test(t)) return true; // «DevOps y Despliegue»
  return words.every((w) => TECH.has(tok(w)) || COMPETENCY.has(tok(w)) || PREPS.has(tok(w)));
}

export interface ProjectShape {
  kind: "project" | "skill-group";
  /** por qué, en español legible: viaja al staging como duda visible. */
  reason: string;
}

/**
 * ¿Este `project` es en realidad un grupo de aptitudes? Determinista, sin LLM.
 * El orden importa: primero las señales DURAS de proyecto (enlace, cifra, verbo
 * de acción), que ganan siempre; después las tres formas del grupo de aptitudes.
 *
 * ⚠ Esto NO reclasifica nada. Solo lo dice, para que el pipeline lo marque como
 *   duda y lo resuelva el usuario.
 */
export function classifyProjectShape(name: string, description = ""): ProjectShape {
  const n = (name ?? "").trim();
  const d = (description ?? "").trim();
  if (!n) return { kind: "project", reason: "sin nombre: no hay etiqueta de grupo que valga" };

  // R0 · señales DURAS de proyecto. Ninguna aparece en una lista de aptitudes.
  if (hasUrl(n) || hasUrl(d)) return { kind: "project", reason: "trae un enlace (repo o demo)" };
  if (hasProjectFigure(n) || hasProjectFigure(d)) {
    return { kind: "project", reason: "trae una cifra o un año concretos" };
  }
  const dWords = d.split(/\s+/).filter(Boolean);
  const verb = dWords.find((w) => VERBS.has(tok(w)) && !AMBIGUOUS_NOUN_VERBS.has(tok(w)));
  if (verb) return { kind: "project", reason: `la descripción cuenta algo que se hizo («${verb}»)` };

  const categoria = looksLikeCategoryName(n);

  // R1 · la forma delatora: «Etiqueta: item, item, item»
  const segs = d.split(/[,;·•]/).map((s) => s.trim()).filter(Boolean);
  if (segs.length >= 2) {
    const items = segs.filter(isSkillItem).length;
    if (items >= 2 && items / segs.length >= 0.7) {
      return { kind: "skill-group", reason: "la descripción es una lista de tecnologías separadas por comas, sin verbo ni resultado" };
    }
  }

  // R2 · tautología: la descripción REPITE el nombre y no describe nada
  const nk = normalizeLine(n), dk = normalizeLine(d);
  if (dk && (dk === nk || nk.includes(dk) || dk.includes(nk))) {
    return { kind: "skill-group", reason: "la descripción solo repite el nombre: es una etiqueta, no un proyecto" };
  }

  // R3 · nombre de categoría + descripción corta sin verbo ni resultado
  if (categoria) {
    if (!dk) return { kind: "skill-group", reason: "nombre de categoría y ninguna descripción que la respalde" };
    if (dWords.length <= 8) {
      return { kind: "skill-group", reason: "nombre de categoría y una descripción sin verbo ni resultado" };
    }
  }

  return { kind: "project", reason: "tiene forma de proyecto (nombre propio o descripción con contenido)" };
}

/** Predicado corto sobre `classifyProjectShape`. */
export function looksLikeSkillGroup(name: string, description = ""): boolean {
  return classifyProjectShape(name, description).kind === "skill-group";
}

// ── Segmentación de capturas de LinkedIn (§C5) ───────────────────────────────

export type LinkedInSectionKind =
  | "about" | "experience" | "education" | "skills" | "certifications"
  | "projects" | "languages" | "awards" | "volunteering" | "recommendations" | "other";

export interface LinkedInSegment {
  section: LinkedInSectionKind;
  /** el encabezado LITERAL tal cual se transcribió, o null para el bloque previo. */
  header: string | null;
  lines: string[];
}

// Encabezados de sección de LinkedIn (ES/EN), normalizados sin acento. La captura
// los transcribe LITERAL (ver el prompt de files.ts) → aquí segmentamos por ellos.
const SECTION_HEADERS: { kind: LinkedInSectionKind; names: string[] }[] = [
  { kind: "about", names: ["acerca de", "extracto", "info", "about", "summary"] },
  { kind: "experience", names: ["experiencia", "experiencia laboral", "experience", "work experience"] },
  { kind: "education", names: ["educacion", "formacion", "formacion academica", "education"] },
  {
    kind: "skills",
    names: [
      "aptitudes", "aptitudes principales", "conocimientos y aptitudes",
      "habilidades", "competencias", "skills", "top skills", "skills & endorsements",
    ],
  },
  {
    kind: "certifications",
    names: [
      "licencias y certificaciones", "certificaciones", "licenses & certifications",
      "licenses and certifications", "certifications",
    ],
  },
  { kind: "projects", names: ["proyectos", "projects"] },
  { kind: "languages", names: ["idiomas", "languages"] },
  {
    kind: "awards",
    names: ["reconocimientos", "reconocimientos y premios", "premios", "honors & awards", "honors and awards", "awards"],
  },
  {
    kind: "volunteering",
    names: ["voluntariado", "experiencia de voluntariado", "volunteering", "volunteer experience"],
  },
  { kind: "recommendations", names: ["recomendaciones", "recommendations"] },
];

const HEADER_LOOKUP = new Map<string, LinkedInSectionKind>();
for (const { kind, names } of SECTION_HEADERS) for (const n of names) HEADER_LOOKUP.set(n, kind);

/** ¿esta línea (sola, corta) es un encabezado de sección de LinkedIn? */
function headerKindOf(line: string): LinkedInSectionKind | null {
  const norm = stripAccents(line).toLowerCase().replace(/[·:•\-–—]/g, " ").replace(/\s+/g, " ").trim();
  if (!norm || norm.split(" ").length > 4) return null;
  return HEADER_LOOKUP.get(norm) ?? null;
}

/**
 * Segmenta el texto transcrito de una captura de LinkedIn por sus encabezados de
 * sección. Lo que caiga bajo Aptitudes/Skills es habilidad, NUNCA viñeta: el
 * pipeline usa esto como red de seguridad además del clasificador léxico.
 */
export function detectLinkedInSection(lines: string[]): LinkedInSegment[] {
  const out: LinkedInSegment[] = [];
  let cur: LinkedInSegment = { section: "other", header: null, lines: [] };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const kind = headerKindOf(line);
    if (kind) {
      if (cur.lines.length || cur.header) out.push(cur);
      cur = { section: kind, header: line, lines: [] };
    } else {
      cur.lines.push(line);
    }
  }
  if (cur.lines.length || cur.header) out.push(cur);
  return out;
}

/**
 * Conjunto de líneas (normalizadas) que aparecen bajo una sección de Aptitudes/
 * Skills en el texto crudo. El pipeline lo consulta: si una supuesta viñeta coincide
 * con una de estas líneas, es una habilidad transcrita, no un logro.
 */
export function linkedInSkillLines(rawText: string): Set<string> {
  const set = new Set<string>();
  const segs = detectLinkedInSection(rawText.split(/\r?\n/));
  for (const seg of segs) {
    if (seg.section !== "skills") continue;
    for (const l of seg.lines) {
      const key = normalizeLine(l);
      if (key) set.add(key);
    }
  }
  return set;
}
