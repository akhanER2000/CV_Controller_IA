/**
 * Detección y clasificación de URLs en el texto pegado (prompt §3.1).
 * Clasificar bien es lo que decide la ruta de lectura:
 *  · github perfil/repo → API oficial de GitHub. SIN LLM. Dato duro.
 *  · linkedin           → ⚠ NO se puede leer desde el servidor. Se es HONESTO.
 *  · cualquier otra      → JSON-LD primero (gratis y exacto); si no, Jina Reader.
 */

export type UrlKind = "github-profile" | "github-repo" | "linkedin" | "web";

export interface DetectedUrl {
  url: string;
  kind: UrlKind;
  /** github: el usuario · linkedin: el slug · web: el hostname */
  handle?: string;
  /** github-repo: el nombre del repo */
  repo?: string;
}

// URLs con o sin protocolo. Captura dominios comunes de CV (github, linkedin, portfolios).
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/[^\s)]*)?/gi;

/** Extrae todas las URLs del texto, sin duplicados, en orden de aparición. */
export function detectUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const host = m[1]!.toLowerCase();
    // exige un TLD plausible para no capturar "node.js", "3.1", "Django.settings"
    if (!/\.[a-z]{2,}$/.test(host.split("/")[0]!)) continue;
    if (!isKnownTldOrPath(m[0])) continue;
    const raw = m[0].replace(/[.,;)]+$/, "");
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

// Evita falsos positivos como "node.js" o "v1.2": aceptamos si hay ruta, o si el
// TLD es uno real de dos+ letras que no sea una extensión de archivo/versión común.
const FILE_ISH = new Set(["js", "ts", "py", "md", "css", "json", "html", "sh", "go", "rs"]);
function isKnownTldOrPath(match: string): boolean {
  const hasProtocol = /^https?:\/\//i.test(match);
  const hasPath = /\/[^\s]/.test(match.replace(/^https?:\/\//i, ""));
  const tld = match.replace(/^https?:\/\//i, "").split("/")[0]!.split(".").pop()!.toLowerCase();
  if (hasProtocol) return true;
  if (FILE_ISH.has(tld) && !hasPath) return false; // "node.js" sin ruta → no es URL
  return true;
}

/** Clasifica una URL en su ruta de lectura. */
export function classifyUrl(url: string): DetectedUrl {
  const clean = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  const [host, ...segs] = clean.split("/");
  const h = host!.toLowerCase();

  if (h === "github.com" || h.endsWith(".github.com")) {
    const user = segs[0];
    const repo = segs[1];
    if (user && repo) return { url, kind: "github-repo", handle: user, repo };
    if (user) return { url, kind: "github-profile", handle: user };
  }
  if (h === "linkedin.com" || h.endsWith(".linkedin.com")) {
    const slug = segs[0] === "in" ? segs[1] : segs[0];
    return { url, kind: "linkedin", handle: slug };
  }
  return { url, kind: "web", handle: h };
}

/** Detecta y clasifica en un solo paso. */
export function detectAndClassify(text: string): DetectedUrl[] {
  return detectUrls(text).map(classifyUrl);
}

/**
 * El copy honesto para una URL de LinkedIn (prompt §3.1, copy.md). Una URL de
 * perfil NO se puede leer desde el servidor (login + bloqueo de bots): en vez de
 * fallar en silencio o devolver basura, se ofrecen las vías que SÍ funcionan.
 */
export const LINKEDIN_ALTERNATIVES = {
  titulo: "LinkedIn no permite que un servicio lea tu perfil desde fuera.",
  cuerpo:
    "Está detrás de tu sesión y bloquea lectores automáticos — a nosotros y a cualquiera que diga lo contrario. Tres vías que sí funcionan:",
  vias: [
    "01 Copia el texto de tu perfil — Ctrl+A y Ctrl+C, y pégalo aquí encima. Es la vía más completa.",
    "02 Sube el PDF que exporta LinkedIn — Más… → Guardar como PDF. Arrástralo a esta caja.",
    "03 Capturas de pantalla — Las transcribimos literal, sin interpretar. Lo que no se lea, no se inventa.",
  ],
} as const;
