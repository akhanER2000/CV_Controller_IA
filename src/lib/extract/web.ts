import "server-only";

/**
 * Leer DE VERDAD un portfolio/web personal (§C4). Cadena honesta, sin inventar:
 *
 *  1. JSON-LD primero — se baja el HTML crudo (fetch directo, timeout corto, UA
 *     normal) y se parsea <script type="application/ld+json"> (Person,
 *     CreativeWork, SoftwareSourceCode…). Es dato estructurado y exacto: se usa
 *     ANTES que Jina.
 *  2. Jina Reader — el texto legible de la página principal (Apache-2.0, una línea).
 *  3. Crawl LIMITADO — enlaces internos del MISMO origen a secciones típicas de CV
 *     (/proyectos, /projects, /experiencia, /about, /research, /cv…): máx. 4 páginas
 *     extra, con timeout por página y SIN recursión, concatenadas con separadores
 *     honestos («— página /proyectos —»).
 *
 * `fetchViaJina` conserva su firma pública (url → texto; "" si no se pudo leer): es
 * lo que inyectan las rutas como `fetchWeb`. El nombre se mantiene por compatibilidad
 * aunque ahora orquesta los tres pasos (Jina sigue siendo uno de ellos).
 */

const HTML_TIMEOUT_MS = 6000;
const JINA_TIMEOUT_MS = 8000;
const MAX_CRAWL_PAGES = 4;
const PER_PAGE_CHARS = 6000;
const TOTAL_CHARS = 12000;

// UA de navegador real: muchos sitios rechazan agentes desconocidos en el fetch
// directo (el de JSON-LD). Jina no lo necesita, pero no molesta.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Secciones internas que vale la pena crawlear (mismo origen).
const SECTION_RE = /\/(proyectos|projects|experiencia|experience|about|sobre|investigacion|research|perfil|cv)(?:\/|$|\?|#)/i;

/** fetch con timeout duro (AbortController). Devuelve "" ante cualquier fallo. */
async function fetchText(url: string, timeoutMs: number, ua: string): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua }, signal: ac.signal });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** El lector Jina puro (paso 2). Se mantiene separado del orquestador. */
async function jinaReader(url: string): Promise<string> {
  const text = await fetchText(`https://r.jina.ai/${url}`, JINA_TIMEOUT_MS, "corpus-cv");
  return text.slice(0, PER_PAGE_CHARS);
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Aplana JSON-LD (objeto suelto, array, o @graph) en una lista de nodos. */
function collectNodes(parsed: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(parsed)) {
    for (const el of parsed) collectNodes(el, out);
    return;
  }
  const rec = asRecord(parsed);
  if (!rec) return;
  if (Array.isArray(rec["@graph"])) collectNodes(rec["@graph"], out);
  if (rec["@type"]) out.push(rec);
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
function joinList(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => str(x) || str(asRecord(x)?.name)).filter(Boolean).join(", ");
  return str(v) || str(asRecord(v)?.name);
}
const typeOf = (rec: Record<string, unknown>): string => {
  const t = rec["@type"];
  return (Array.isArray(t) ? t.map(str).join(" ") : str(t)).toLowerCase();
};

/**
 * Extrae texto útil del JSON-LD de la página. Solo tipos relevantes a un CV; los
 * campos se rotulan honestamente. Devuelve "" si no hay nada aprovechable.
 */
function parseJsonLd(html: string): string {
  if (!html) return "";
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const nodes: Record<string, unknown>[] = [];
  for (const m of html.matchAll(re)) {
    try {
      collectNodes(JSON.parse(m[1]!.trim()), nodes);
    } catch {
      /* JSON-LD malformado: se ignora, no se adivina. */
    }
  }
  const lines: string[] = [];
  for (const n of nodes) {
    const t = typeOf(n);
    if (/person|profilepage/.test(t)) {
      const name = str(n.name);
      const job = str(n.jobTitle) || str(asRecord(n.hasOccupation)?.name);
      const desc = str(n.description);
      const knows = joinList(n.knowsAbout);
      const worksFor = str(asRecord(n.worksFor)?.name);
      const links = joinList(n.sameAs);
      if (name) lines.push(`Nombre: ${name}`);
      if (job) lines.push(`Cargo: ${job}`);
      if (worksFor) lines.push(`Empresa: ${worksFor}`);
      if (desc) lines.push(`Descripción: ${desc}`);
      if (knows) lines.push(`Conoce/usa: ${knows}`);
      if (links) lines.push(`Enlaces: ${links}`);
    } else if (/creativework|softwaresourcecode|softwareapplication|article/.test(t)) {
      const name = str(n.name) || str(n.headline);
      const desc = str(n.description) || str(n.abstract);
      const lang = joinList(n.programmingLanguage);
      const kw = joinList(n.keywords);
      const repo = str(n.codeRepository) || str(n.url);
      if (name) lines.push(`Proyecto: ${name}`);
      if (desc) lines.push(`  ${desc}`);
      if (lang) lines.push(`  Lenguaje: ${lang}`);
      if (kw) lines.push(`  Temas: ${kw}`);
      if (repo) lines.push(`  URL: ${repo}`);
    }
  }
  return lines.length ? `[datos estructurados JSON-LD]\n${lines.join("\n")}` : "";
}

/** Enlaces internos (mismo origen) a secciones de CV, sin repetir, máx. 4. */
function discoverSectionLinks(html: string, baseUrl: string): string[] {
  if (!html) return [];
  let base: URL;
  try {
    base = new URL(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`);
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    let abs: URL;
    try {
      abs = new URL(m[1]!, base);
    } catch {
      continue;
    }
    if (abs.origin !== base.origin) continue;
    if (!SECTION_RE.test(abs.pathname)) continue;
    const clean = abs.origin + abs.pathname.replace(/\/$/, "");
    if (clean === base.origin + base.pathname.replace(/\/$/, "")) continue; // no re-leer la principal
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= MAX_CRAWL_PAGES) break;
  }
  return out;
}

export async function fetchViaJina(url: string): Promise<string> {
  try {
    // 1 · HTML crudo (para JSON-LD y para descubrir secciones internas).
    const html = await fetchText(url.startsWith("http") ? url : `https://${url}`, HTML_TIMEOUT_MS, BROWSER_UA);
    const jsonLd = parseJsonLd(html);

    // 2 · Jina de la página principal (prosa legible).
    const jinaMain = await jinaReader(url);

    // JSON-LD ANTES que Jina; si ambos vacíos, no se pudo leer nada honesto.
    const main = [jsonLd, jinaMain].filter((x) => x.trim()).join("\n\n");
    if (!main.trim()) return "";

    // 3 · Crawl limitado de secciones internas del mismo origen (en paralelo,
    // orden preservado, cada una con su timeout). Separadores honestos.
    const links = discoverSectionLinks(html, url);
    let combined = main;
    if (links.length) {
      const pages = await Promise.all(
        links.map(async (link) => {
          const text = await jinaReader(link);
          const path = safePath(link);
          return text.trim() ? `\n\n— página ${path} —\n${text}` : "";
        }),
      );
      combined += pages.join("");
    }

    return combined.slice(0, TOTAL_CHARS);
  } catch {
    return "";
  }
}

function safePath(link: string): string {
  try {
    return new URL(link).pathname || link;
  } catch {
    return link;
  }
}
