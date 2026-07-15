import "server-only";

/**
 * Web → markdown. Primero intenta el JSON-LD del sitio (gratis y exacto); si no,
 * Jina Reader (Apache-2.0, una línea). Devuelve "" si no se pudo leer (el
 * pipeline sigue sin esa fuente).
 */
export async function fetchViaJina(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers: { "User-Agent": "corpus-cv" } });
    if (!res.ok) return "";
    return (await res.text()).slice(0, 8000);
  } catch {
    return "";
  }
}
