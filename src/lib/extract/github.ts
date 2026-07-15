import type { StagedRow } from "./types";

/**
 * GitHub como DATO DURO: API oficial, SIN LLM (prompt §3). Lenguajes con bytes
 * reales, descripción, estrellas. Entra como origin 'api'. Aun así pasa por
 * staging: la decisión de si va en tu CV es del humano (§4.1).
 *
 * El texto NO se añade a raw_text de la IA: si no, el LLM re-extrae los mismos
 * repos y salen duplicados.
 */

interface GithubRepo {
  name: string;
  language: string | null;
  description: string | null;
  stargazers_count: number;
  fork: boolean;
  html_url: string;
  pushed_at: string;
}

let counter = 0;
const key = () => `gh-${++counter}-${Math.random().toString(36).slice(2, 8)}`;

export type GithubFetcher = (user: string) => Promise<{ text: string; staged: StagedRow[] }>;

export const fetchGithubUser: GithubFetcher = async (user) => {
  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=pushed`,
    { headers: { Accept: "application/vnd.github+json", "User-Agent": "corpus-cv" } },
  );
  if (!res.ok) return { text: `\n[GitHub @${user}: no se pudo leer (${res.status})]`, staged: [] };
  const repos = (await res.json()) as GithubRepo[];
  return buildFromRepos(user, repos);
};

/** Puro: repos → staged rows. Separado para poder probarlo sin red. */
export function buildFromRepos(user: string, repos: GithubRepo[]): { text: string; staged: StagedRow[] } {
  const real = repos.filter((r) => !r.fork && r.description);
  const langs = [...new Set(real.map((r) => r.language).filter(Boolean))] as string[];
  const src = `GitHub · @${user} · API`;
  const staged: StagedRow[] = [];

  if (langs.length) {
    staged.push({
      key: key(), kind: "skill",
      data: { group: "Lenguajes", items: langs.join(", ") },
      lang: "es", origin: "api", sourceLabel: src,
      evidenceSnippet: `Lenguajes en repos no-fork de @${user}: ${langs.join(", ")} (bytes reales de la API).`,
      evidenceLevel: "api", evidenceVerified: true,
    });
  }
  for (const r of [...real].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 5)) {
    staged.push({
      key: key(), kind: "project",
      data: {
        name: r.name,
        url: r.html_url.replace(/^https?:\/\//, ""),
        description: r.description ?? "",
      },
      lang: "es", origin: "api", sourceLabel: src,
      evidenceSnippet: `Repo ${r.name}: ${r.stargazers_count}★, ${r.language ?? "—"} (API de GitHub).`,
      evidenceLevel: "api", evidenceVerified: true,
    });
  }
  const text =
    `\n[GitHub @${user} — API]\n` +
    real.map((r) => `${r.name} (${r.language ?? "—"}, ${r.stargazers_count}★): ${r.description}`).join("\n");
  return { text, staged };
}
