import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { createClient } from "@/lib/supabase/server";
import { getMasterItems, type MasterItem } from "@/lib/db/queries";
import { geminiApiKey } from "@/lib/extract/llm";
import { modeloPara } from "@/lib/ai/modelos";
import { getUserLlmKey } from "@/lib/account/byok";
import { fetchViaJina } from "@/lib/extract/web";
import { extractFile, extractDepsFor, type FileKind } from "@/lib/extract/files";
import {
  construirTailor,
  itemTailorDe,
  lineasDelPrompt,
  parseJobPostingJsonLd,
  OfertaPlanSchema,
  type OfertaLLM,
  type ItemTailor,
} from "@/lib/cv/tailor";

export const runtime = "nodejs";
// El I/O del LLM (y leer una URL / transcribir una captura) no cuenta como Active CPU
// en Fluid Compute → timeout generoso barato (02 §1). Igual que /api/import/context.
export const maxDuration = 300;

/**
 * «LEER UN AVISO SIN VARIANTE» (bloque C · FALTA B, la tercera puerta de Variantes).
 *
 *   POST { offerText }            → analiza el aviso pegado contra tu MASTER
 *   POST { url }                  → lee el aviso de una URL (JobPosting JSON-LD primero)
 *   POST { files:[{path,kind}] }  → transcribe VERBATIM una captura/PDF ya subido
 *
 * No crea NADA: devuelve el análisis (título objetivo, selección propuesta, y los
 * grupos —aquí «ADD» son los items del master relevantes, «GAP» lo que no cubre nada).
 * El usuario lo REVISA y, si quiere, crea la variante con POST /api/variants
 * { mode:'tailor', ... }. Nada entra al master ni se aplica en silencio.
 *
 * ★ Igual disciplina que la ingesta: si el aviso llega como imagen o PDF escaneado, se
 *   TRANSCRIBE LITERAL primero (extractFile) y el análisis corre sobre esa
 *   transcripción — sin raw_text no hay verificación de evidencia posible.
 */

const fallo = (msg: string, status: number) => NextResponse.json({ error: msg }, { status });
const motivo = (e: unknown) => (e instanceof Error ? e.message : "Error");

/** El LLM real (Gemini) como función inyectable de construirTailor. */
function geminiOfertaLLM(apiKey?: string): OfertaLLM {
  const SYS =
    "Eres un asistente que ADAPTA un CV a una OFERTA de empleo. Te doy el TEXTO DEL AVISO y los items " +
    "del master del candidato (cada uno con su id, tipo y texto). Tu tarea, y NINGUNA parte es escribir " +
    "un CV nuevo ni puntuar el encaje:\n" +
    "(1) REQUISITOS: extrae del aviso los requisitos, habilidades y tecnologías que pide. Para cada uno da " +
    "un `termino` (la palabra esencial: la tecnología/herramienta, con las PALABRAS DEL AVISO) y una " +
    "`evidencia` (el fragmento LITERAL del aviso donde aparece). Copia exacta, no parafrasees.\n" +
    "(2) SELECCION: los ids del master relevantes para este aviso, EN ORDEN de relevancia. Solo ids de la lista.\n" +
    "(3) RESUMEN: 2-3 frases a partir SOLO de hechos del master, orientadas al aviso. No inventes.\n" +
    "(4) REFORMULACIONES: reescrituras más alineadas con el aviso, SIN meter ninguna cifra, sigla ni " +
    "tecnología que no esté YA en el texto del item. El aviso NO autoriza a añadir hechos al CV.\n" +
    "NUNCA inventes ids, cifras ni tecnologías. NUNCA des un porcentaje ni un score de encaje.";
  return async ({ offerText, items }) => {
    const { object } = await generateObject({
      model: modeloPara("redaccion-preserva-hechos", apiKey),
      schema: OfertaPlanSchema,
      // El aviso se recorta para el prompt; la VERIFICACIÓN corre sobre el texto entero
      // (lo que el modelo cite saldrá de lo que vio, que es ⊆ del total).
      prompt: `${SYS}\n\nAVISO:\n${offerText.slice(0, 16000)}\n\nITEMS DEL MASTER:\n${lineasDelPrompt(items)}`,
      temperature: 0.2,
    });
    return object;
  };
}

/** Texto legible de un item del master (para armar el ItemTailor). */
function masterData(m: MasterItem): Record<string, unknown> {
  return m.data ?? {};
}

// ── Resolver el AVISO desde texto / URL / archivo ────────────────────────────
// ⚠ DUPLICADO a propósito en /api/variants/[id]/tailor: las dos rutas resuelven el
// mismo aviso pero viven en fronteras de trabajo distintas y no hay módulo compartido
// server-only donde ponerlo sin salir de la frontera. La parte PURA (parseJobPostingJsonLd)
// sí está factorizada en lib/cv/tailor.ts; esto de aquí es solo el I/O.
const FILE_KINDS: readonly string[] = ["pdf", "docx", "image", "text"];
const asKind = (k: unknown): FileKind | null =>
  typeof k === "string" && FILE_KINDS.includes(k) ? (k as FileKind) : null;

interface FileRef { path?: string; name?: string; kind?: string }

/** fetch de HTML con timeout duro (para el JobPosting JSON-LD). "" ante cualquier fallo. */
async function fetchHtml(url: string): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 6000);
  try {
    const res = await fetch(url.startsWith("http") ? url : `https://${url}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      signal: ac.signal,
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

interface OfertaResuelta {
  text: string;
  warnings: string[];
}

async function resolverOferta(
  sb: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: { offerText?: string; text?: string; url?: string; files?: FileRef[] },
  byok?: string,
): Promise<OfertaResuelta | { error: string; status: number }> {
  const warnings: string[] = [];
  const pasted = (body.offerText ?? body.text ?? "").trim();
  if (pasted.length >= 20) return { text: pasted, warnings };

  // URL: JobPosting JSON-LD PRIMERO (gratis y exacto), luego el texto legible (Jina).
  const url = (body.url ?? "").trim();
  if (url) {
    if (url.length < 4 || !/\.[a-z]{2,}/i.test(url)) return { error: "Escribe una dirección válida (https://…).", status: 400 };
    const html = await fetchHtml(url);
    const jp = parseJobPostingJsonLd(html);
    const jina = jp ? "" : await fetchViaJina(url);
    const text = [jp, jina].filter((x) => x.trim()).join("\n\n").trim();
    if (text.length >= 20) return { text, warnings };
    return { error: "No pudimos leer el aviso desde ese enlace. Pega el texto o sube una captura.", status: 422 };
  }

  // Archivos ya subidos a Storage (captura / PDF): transcripción verbatim.
  const files = Array.isArray(body.files) ? body.files : [];
  for (const ref of files) {
    const kind = asKind(ref.kind);
    const path = typeof ref.path === "string" ? ref.path : "";
    const name = (typeof ref.name === "string" && ref.name) || (path.split("/").pop() ?? "archivo");
    if (!kind || !path) { warnings.push(`«${name}»: referencia de archivo inválida.`); continue; }
    if (!path.startsWith(`${userId}/`)) { warnings.push(`«${name}»: ruta no autorizada.`); continue; }
    try {
      const { data: blob, error: dlErr } = await sb.storage.from("sources").download(path);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "no se pudo descargar de Storage");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const ex = await extractFile({ kind, bytes, mime: blob.type || undefined, name }, extractDepsFor(byok));
      if (ex.warning) warnings.push(`«${name}»: ${ex.warning}`);
      if (ex.text.trim().length >= 20) return { text: ex.text.trim(), warnings };
    } catch (e) {
      warnings.push(`«${name}»: no se pudo procesar (${motivo(e)}).`);
    }
  }

  return { error: "Pega el aviso, sube una captura o pega su enlace — necesitamos algo de texto.", status: 400 };
}

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fallo("Sesión requerida.", 401);

  let body: { offerText?: string; text?: string; url?: string; files?: FileRef[] };
  try {
    body = await req.json();
  } catch {
    return fallo("cuerpo inválido", 400);
  }

  const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
  if (!byok && !geminiApiKey()) {
    return fallo("Falta configurar la clave de IA (BYOK o GEMINI_API_KEY del servidor).", 503);
  }

  try {
    const master = await getMasterItems(sb, user.id);
    if (master.length === 0) {
      return fallo("Tu master está vacío: importa o agrega items antes de adaptar un CV a un aviso.", 422);
    }

    const oferta = await resolverOferta(sb, user.id, body, byok);
    if ("error" in oferta) return fallo(oferta.error, oferta.status);

    // Sin variante: todos los items son «del master», así que ADD serán los relevantes
    // y GAP lo que no cubre nada. La selección (con basics+summary) alimenta el crear.
    const items: ItemTailor[] = master.map((m) =>
      itemTailorDe({ id: m.id, item_id: m.id, kind: m.kind, data: masterData(m), enVariante: false }),
    );

    const analisis = await construirTailor({ offerText: oferta.text, items }, { llm: geminiOfertaLLM(byok) });

    // Los descartes de reformulación se registran en el servidor: si el modelo empieza
    // a inventar en masa, tiene que verse en los logs, no solo en la pantalla de quien lo sufre.
    for (const d of analisis.descartados) {
      if (d.tipo === "reformular" || d.tipo === "resumen") {
        console.warn("[api/tailor/analizar] propuesta RECHAZADA por el candado", { tipo: d.tipo, id: d.id, razon: d.razon });
      }
    }

    return NextResponse.json({ analisis, offerChars: oferta.text.length, warnings: oferta.warnings });
  } catch (e) {
    console.error("[api/tailor/analizar] no se pudo analizar el aviso", e);
    return fallo(motivo(e), 500);
  }
}
