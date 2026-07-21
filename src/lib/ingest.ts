import type { StagedItem } from "@/lib/cv/serialize";

/**
 * "Pega lo que tengas" → master. Detecta URLs, trae dato duro de GitHub (API, sin
 * IA) y de tu portfolio (Jina), construye el raw_text, extrae con Gemini pidiendo
 * el fragmento LITERAL de cada dato, y VERIFICA esa evidencia contra el raw_text.
 * Nada se inventa: si el snippet no aparece en la fuente, se marca sin evidencia.
 */

const uid = (p: string) => `${p}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9á-ú%.,/+()–-]/gi, "").trim();

// ── 1 · Detección + clasificación de URLs ────────────────────────────────────
interface DetectedUrl { url: string; kind: "github-user" | "github-repo" | "linkedin" | "other" }

export function detectUrls(text: string): DetectedUrl[] {
  const re = /\bhttps?:\/\/[^\s)]+|\b(?:github\.com|linkedin\.com)\/[^\s)]+/gi;
  const found = new Map<string, DetectedUrl>();
  for (const raw of text.match(re) ?? []) {
    let u = raw.replace(/[.,;]+$/, "");
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    let host: string, path: string;
    try { const p = new URL(u); host = p.host.replace(/^www\./, ""); path = p.pathname.replace(/\/$/, ""); }
    catch { continue; }
    let kind: DetectedUrl["kind"] = "other";
    if (host === "github.com") {
      const seg = path.split("/").filter(Boolean);
      kind = seg.length >= 2 ? "github-repo" : "github-user";
    } else if (host === "linkedin.com") kind = "linkedin";
    found.set(u, { url: u, kind });
  }
  return [...found.values()];
}

// ── 2 · Fetchers de dato duro ────────────────────────────────────────────────
interface GithubRepo { name: string; language: string | null; description: string | null; stargazers_count: number; fork: boolean; html_url: string }

async function fetchGithubUser(user: string): Promise<{ text: string; staged: StagedItem[] }> {
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=pushed`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "corpus-cv" },
  });
  if (!res.ok) return { text: `\n[GitHub @${user}: no se pudo leer (${res.status})]`, staged: [] };
  const repos = (await res.json()) as GithubRepo[];
  const real = repos.filter((r) => !r.fork && r.description); // no forks, con descripción
  const langs = [...new Set(real.map((r) => r.language).filter(Boolean))] as string[];
  const staged: StagedItem[] = [];
  // skills = lenguajes (dato duro de la API)
  if (langs.length) {
    staged.push({
      id: uid("st"), section: "skills", label: `Lenguajes (${langs.length})`,
      preview: langs.join(", "),
      origin: `GitHub · @${user} · API`, originKind: "api", evidenceLevel: "api",
      evidence: `Lenguajes detectados en repos no-fork de @${user}: ${langs.join(", ")}. Dato duro de la API.`,
      payload: { category: "Lenguajes", items: langs },
    });
  }
  // proyectos = repos destacados (con estrellas o descripción), no fork
  for (const r of real.sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 5)) {
    staged.push({
      id: uid("st"), section: "projects", label: r.name,
      preview: `${r.description}${r.stargazers_count ? ` · ${r.stargazers_count}★` : ""}${r.language ? ` · ${r.language}` : ""}`,
      origin: `GitHub · @${user} · API`, originKind: "api", evidenceLevel: "api",
      evidence: `Repo ${r.name}: ${r.stargazers_count} estrellas, ${r.language ?? "—"}. Dato de la API.`,
      payload: { name: r.name, url: r.html_url.replace(/^https?:\/\//, ""), start: "", end: null, bullets: r.description ? [{ text: r.description }] : [] },
    });
  }
  const text = `\n[GitHub @${user} — API]\n` + real.map((r) => `${r.name} (${r.language ?? "—"}, ${r.stargazers_count}★): ${r.description}`).join("\n");
  return { text, staged };
}

async function fetchViaJina(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { headers: { "User-Agent": "corpus-cv" } });
    if (!res.ok) return `\n[${url}: no se pudo leer (${res.status})]`;
    const md = await res.text();
    return `\n[${url} — contenido]\n${md.slice(0, 8000)}`;
  } catch {
    return `\n[${url}: no se pudo leer]`;
  }
}

// ── 3 · Extracción con Gemini (REST, structured output) ──────────────────────
// ⚠ Este módulo es un camino ANTIGUO que hoy nadie importa (grep de "@/lib/ingest"
//   → cero). Se versiona el modelo igual que el registro para que no quede ni un
//   alias flotante en el repo; si se resucita, debería pasar por src/lib/ai/modelos.
const GEMINI_MODEL = "gemini-2.5-flash";

const SCHEMA = {
  type: "object",
  properties: {
    basics: {
      type: "object",
      properties: {
        name: { type: "string" }, targetTitle: { type: "string" }, summary: { type: "string" }, summaryEvidence: { type: "string" },
        contacts: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"] } },
      },
      required: ["name", "targetTitle", "summary", "summaryEvidence", "contacts"],
    },
    work: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" }, org: { type: "string" }, location: { type: "string" }, start: { type: "string" }, end: { type: "string" }, evidence: { type: "string" },
          bullets: { type: "array", items: { type: "object", properties: { text: { type: "string" }, evidence: { type: "string" } }, required: ["text", "evidence"] } },
        },
        required: ["title", "org", "location", "start", "end", "evidence", "bullets"],
      },
    },
    education: { type: "array", items: { type: "object", properties: { degree: { type: "string" }, institution: { type: "string" }, location: { type: "string" }, start: { type: "string" }, end: { type: "string" }, evidence: { type: "string" } }, required: ["degree", "institution", "location", "start", "end", "evidence"] } },
    skills: { type: "array", items: { type: "object", properties: { category: { type: "string" }, items: { type: "array", items: { type: "string" } } }, required: ["category", "items"] } },
    projects: { type: "array", items: { type: "object", properties: { name: { type: "string" }, url: { type: "string" }, start: { type: "string" }, end: { type: "string" }, evidence: { type: "string" }, bullets: { type: "array", items: { type: "string" } } }, required: ["name", "url", "start", "end", "evidence", "bullets"] } },
  },
  required: ["basics", "work", "education", "skills", "projects"],
};

const PROMPT = `Eres un extractor de datos de CV. Del TEXTO de abajo, extrae SOLO lo que aparece literalmente. NO inventes nada: si un dato no está, deja el campo como cadena vacía "".
Para cada experiencia, viñeta, formación y proyecto incluye "evidence": el fragmento LITERAL del texto de donde lo sacaste (copia exacta, sin parafrasear). Fechas como "AAAA-MM" o "AAAA" o "".
Responde SOLO el JSON del esquema. TEXTO:\n\n`;

interface Extraction {
  basics: { name: string; targetTitle: string; summary: string; summaryEvidence: string; contacts: { label: string; value: string }[] };
  work: { title: string; org: string; location: string; start: string; end: string; evidence: string; bullets: { text: string; evidence: string }[] }[];
  education: { degree: string; institution: string; location: string; start: string; end: string; evidence: string }[];
  skills: { category: string; items: string[] }[];
  projects: { name: string; url: string; start: string; end: string; evidence: string; bullets: string[] }[];
}

async function geminiExtract(rawText: string): Promise<Extraction> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT + rawText.slice(0, 30000) }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.1 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!txt) throw new Error("Gemini no devolvió contenido");
  return JSON.parse(txt) as Extraction;
}

// ── 4 · Verificación de evidencia + construcción de staged ───────────────────
function level(evidence: string, rawNorm: string): StagedItem["evidenceLevel"] {
  const e = norm(evidence);
  if (!e || e.length < 6) return "unverified";
  if (rawNorm.includes(e)) return "verified";
  // coincidencia parcial: la mitad de las palabras (>3 letras) aparecen
  const words = e.split(" ").filter((w) => w.length > 3);
  const hit = words.filter((w) => rawNorm.includes(w)).length;
  return words.length && hit / words.length >= 0.5 ? "partial" : "unverified";
}

// ── Orquestador ──────────────────────────────────────────────────────────────
export async function importContext(text: string): Promise<{ staged: StagedItem[]; sources: string[]; rawTextLength: number; linkedinWarning: boolean }> {
  const urls = detectUrls(text);
  const sources = ["texto pegado"];
  let raw = text;
  const apiStaged: StagedItem[] = [];
  let linkedinWarning = false;

  for (const u of urls) {
    if (u.kind === "github-user" || u.kind === "github-repo") {
      const user = new URL(u.url).pathname.split("/").filter(Boolean)[0]!;
      // GitHub entra como dato duro (apiStaged), NO al texto de la IA: si no,
      // Gemini re-extrae los mismos repos y salen duplicados.
      const { staged } = await fetchGithubUser(user);
      apiStaged.push(...staged); sources.push(`GitHub · @${user}`);
    } else if (u.kind === "linkedin") {
      linkedinWarning = true; // no se puede leer desde el servidor
    } else {
      raw += await fetchViaJina(u.url); sources.push(u.url);
    }
  }

  const rawNorm = norm(raw);
  const staged: StagedItem[] = [...apiStaged];

  let ex: Extraction | null = null;
  try { ex = await geminiExtract(raw); } catch (e) { throw new Error(`Extracción: ${e instanceof Error ? e.message : e}`); }

  // basics
  if (ex.basics.name || ex.basics.contacts.length) {
    staged.push({
      id: uid("st"), section: "basics", label: "Datos básicos",
      preview: [ex.basics.name, ex.basics.targetTitle, ...ex.basics.contacts.map((c) => `${c.label}: ${c.value}`)].filter(Boolean).join(" · "),
      origin: "texto pegado", originKind: "manual", evidenceLevel: ex.basics.name && rawNorm.includes(norm(ex.basics.name)) ? "verified" : "partial",
      evidence: `Nombre y contacto detectados en tu texto.`,
      payload: { name: ex.basics.name, targetTitleDefault: ex.basics.targetTitle, contacts: ex.basics.contacts.map((c) => ({ type: "manual", label: c.label, value: c.value, visible: true })) },
    });
  }
  if (ex.basics.summary) {
    staged.push({
      id: uid("st"), section: "summary", label: "Resumen", preview: ex.basics.summary,
      origin: "texto pegado → IA", originKind: "ai", evidenceLevel: level(ex.basics.summaryEvidence, rawNorm),
      evidence: ex.basics.summaryEvidence || "La IA redactó esto; revisa que sea fiel.",
      payload: { text: ex.basics.summary },
    });
  }
  for (const w of ex.work) {
    staged.push({
      id: uid("st"), section: "work", label: `${w.title || "Rol"} · ${w.org || ""}`.trim(),
      preview: [w.title, w.org, [w.start, w.end].filter(Boolean).join("–")].filter(Boolean).join(" · ") + (w.bullets[0] ? ` — ${w.bullets[0].text}` : ""),
      origin: "texto pegado → IA", originKind: "ai", evidenceLevel: level(w.evidence, rawNorm),
      evidence: w.evidence,
      payload: { title: w.title, orgLegal: w.org, location: w.location, start: w.start, end: w.end || null, current: !w.end, bullets: w.bullets.map((b) => ({ text: b.text })) },
    });
  }
  for (const e of ex.education) {
    staged.push({
      id: uid("st"), section: "education", label: `${e.degree || "Formación"} · ${e.institution || ""}`.trim(),
      preview: [e.degree, e.institution, [e.start, e.end].filter(Boolean).join("–")].filter(Boolean).join(" · "),
      origin: "texto pegado → IA", originKind: "ai", evidenceLevel: level(e.evidence, rawNorm), evidence: e.evidence,
      payload: { degree: e.degree, institution: e.institution, location: e.location, start: e.start, end: e.end },
    });
  }
  for (const s of ex.skills) {
    if (!s.items.length) continue;
    // verificación por-item: una aptitud está respaldada si aparece literal en la fuente
    const present = s.items.filter((i) => rawNorm.includes(norm(i)));
    const lvl: StagedItem["evidenceLevel"] =
      present.length === s.items.length ? "verified" : present.length >= Math.ceil(s.items.length / 2) ? "partial" : "unverified";
    staged.push({
      id: uid("st"), section: "skills", label: s.category || "Aptitudes", preview: s.items.join(", "),
      origin: "texto pegado → IA", originKind: "ai", evidenceLevel: lvl,
      evidence: present.length ? `En la fuente: ${present.join(", ")}` : "Ninguna de estas aparece literal en tu texto.",
      payload: { category: s.category || "Aptitudes", items: s.items },
    });
  }
  const apiProjectNames = new Set(apiStaged.filter((s) => s.section === "projects").map((s) => norm(s.label)));
  for (const p of ex.projects) {
    if (p.name && apiProjectNames.has(norm(p.name))) continue; // ya vino como dato duro de la API
    staged.push({
      id: uid("st"), section: "projects", label: p.name || "Proyecto",
      preview: [p.name, p.bullets[0]].filter(Boolean).join(" — "),
      origin: "texto pegado → IA", originKind: "ai", evidenceLevel: level(p.evidence, rawNorm), evidence: p.evidence,
      payload: { name: p.name, url: p.url || null, start: p.start, end: p.end || null, bullets: p.bullets.map((t) => ({ text: t })) },
    });
  }

  return { staged, sources, rawTextLength: raw.length, linkedinWarning };
}
