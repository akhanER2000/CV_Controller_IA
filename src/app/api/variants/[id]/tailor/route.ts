import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { createClient } from "@/lib/supabase/server";
import { getVariant, getVariantItem, setAiOverride } from "@/lib/db/variants";
import { geminiApiKey } from "@/lib/extract/llm";
import { modeloPara } from "@/lib/ai/modelos";
import { getUserLlmKey } from "@/lib/account/byok";
import { fetchViaJina } from "@/lib/extract/web";
import { extractFile, extractDepsFor, type FileKind } from "@/lib/extract/files";
import { campoDe } from "@/lib/cv/ajuste";
import {
  construirTailor,
  itemTailorDe,
  lineasDelPrompt,
  parseJobPostingJsonLd,
  verificarReformulacion,
  OfertaPlanSchema,
  type OfertaLLM,
  type ItemTailor,
} from "@/lib/cv/tailor";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * «ADAPTAR ESTA VARIANTE A UN AVISO» (bloque C · dentro del editor de una variante).
 * Dos acciones, las dos MANUALES y una a una:
 *
 *   POST { accion:'analizar', offerText|url|files } → una PROPUESTA revisable con los
 *         TRES GRUPOS: lo que ya está en la variante, lo que tienes en el master y no
 *         en ella (un clic para añadir), y lo que no cubre nada (se enseña, sin botón).
 *   POST { accion:'reformular', id, propuesto }     → aplica UNA reformulación aceptada.
 *
 * No hay «aplicar todo», y no es un olvido: es la regla. Añadir un item del master
 * viaja por el contrato que ya existe (POST /api/variants/[id]/items); reordenar y
 * ocultar, por PATCH. Lo único que necesita ruta propia es la reformulación, porque
 * tiene que volver a pasar el candado de preservesFacts en el servidor.
 *
 * ★ EL AVISO NO ES FUENTE DE HECHOS. Al reformular, el candado compara contra el texto
 *   ORIGINAL del item, nunca contra el aviso: que la oferta pida Kafka no autoriza a
 *   meter Kafka en una viñeta que no lo tenía.
 */

const fallo = (msg: string, status: number) => NextResponse.json({ error: msg }, { status });
const motivo = (e: unknown) => (e instanceof Error ? e.message : "Error");

/** El LLM real (Gemini) como función inyectable de construirTailor. */
function geminiOfertaLLM(apiKey?: string): OfertaLLM {
  const SYS =
    "Eres un asistente que ADAPTA un CV a una OFERTA de empleo. Te doy el TEXTO DEL AVISO y los items del " +
    "candidato (id, tipo, texto, y si ya están en la variante o solo en el master). Tu tarea, y NINGUNA parte " +
    "es escribir un CV nuevo ni puntuar el encaje:\n" +
    "(1) REQUISITOS: los que pide el aviso, cada uno con `termino` (la palabra esencial, con las PALABRAS DEL " +
    "AVISO) y `evidencia` (fragmento LITERAL del aviso). Copia exacta.\n" +
    "(2) SELECCION: ids relevantes en orden (solo de la lista dada).\n" +
    "(3) RESUMEN: 2-3 frases desde hechos del master, orientadas al aviso. No inventes.\n" +
    "(4) REFORMULACIONES: reescrituras alineadas al aviso de items QUE YA ESTÉN EN LA VARIANTE, SIN meter " +
    "ninguna cifra, sigla ni tecnología que no esté YA en el texto del item. El aviso NO autoriza hechos nuevos.\n" +
    "NUNCA inventes ids, cifras ni tecnologías. NUNCA des un porcentaje ni un score de encaje.";
  return async ({ offerText, items }) => {
    const { object } = await generateObject({
      model: modeloPara("redaccion-preserva-hechos", apiKey),
      schema: OfertaPlanSchema,
      prompt: `${SYS}\n\nAVISO:\n${offerText.slice(0, 16000)}\n\nITEMS:\n${lineasDelPrompt(items)}`,
      temperature: 0.2,
    });
    return object;
  };
}

// ── Resolver el AVISO desde texto / URL / archivo ────────────────────────────
// ⚠ DUPLICADO a propósito con /api/tailor/analizar (ver el comentario allí): mismo
// aviso, fronteras distintas, sin módulo server-only compartido. La parte PURA
// (parseJobPostingJsonLd) sí vive en lib/cv/tailor.ts.
const FILE_KINDS: readonly string[] = ["pdf", "docx", "image", "text"];
const asKind = (k: unknown): FileKind | null =>
  typeof k === "string" && FILE_KINDS.includes(k) ? (k as FileKind) : null;

interface FileRef { path?: string; name?: string; kind?: string }

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

async function resolverOferta(
  sb: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: { offerText?: string; text?: string; url?: string; files?: FileRef[] },
  byok?: string,
): Promise<{ text: string; warnings: string[] } | { error: string; status: number }> {
  const warnings: string[] = [];
  const pasted = (body.offerText ?? body.text ?? "").trim();
  if (pasted.length >= 20) return { text: pasted, warnings };

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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: variantId } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fallo("Sesión requerida.", 401);

  let body: { accion?: string; id?: string; propuesto?: string; offerText?: string; text?: string; url?: string; files?: FileRef[] };
  try {
    body = await req.json();
  } catch {
    return fallo("cuerpo inválido", 400);
  }

  // ── APLICAR UNA REFORMULACIÓN ──────────────────────────────────────────────
  // El texto que llega del cliente NO se cree: el original se lee de la base y el
  // candado vuelve a correr aquí. Entre la propuesta y el clic hay una red y un
  // navegador, y ninguno de los dos es de fiar.
  if (body.accion === "reformular") {
    const vitemId = (body.id ?? "").trim();
    const propuesto = (body.propuesto ?? "").trim();
    if (!vitemId) return fallo("Falta el id del item.", 400);
    if (!propuesto) return fallo("La propuesta está vacía.", 400);
    try {
      const it = await getVariantItem(sb, user.id, variantId, vitemId);
      if (!it) return fallo("Ese item no está en esta variante.", 404);
      const campo = campoDe(it.kind);
      if (!campo) return fallo("Este tipo de item no tiene texto reformulable.", 422);
      const original = String(it.data[campo] ?? "");
      if (!original.trim()) return fallo("El item no tiene texto que reformular.", 422);

      const veredicto = verificarReformulacion(original, propuesto);
      if (!veredicto.ok) {
        // 422 y el motivo REAL: un rechazo mudo aquí sería indistinguible de un fallo
        // de red, y esto no es un fallo: es el producto negándose a escribir una mentira.
        return fallo(`No se aplicó: ${veredicto.razon}`, 422);
      }

      // El override se MEZCLA con el que hubiera (foto, QR y demás viven ahí):
      // escribir solo el campo reformulado borraría lo que no se está tocando.
      await setAiOverride(sb, user.id, vitemId, {
        data: { ...(it.overrideData ?? {}), [campo]: propuesto },
        sourceItem: it.itemId,
        reason: "Reformulado por IA para un aviso; cifras y entidades del original preservadas (verify.ts).",
      });
      return NextResponse.json({ ok: true, id: vitemId, campo, original, propuesto });
    } catch (e) {
      console.error("[api/variants/tailor] no se pudo aplicar la reformulación", vitemId, e);
      return fallo(motivo(e), 500);
    }
  }

  // ── ANALIZAR ───────────────────────────────────────────────────────────────
  const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
  if (!byok && !geminiApiKey()) {
    return fallo("Falta configurar la clave de IA (BYOK o GEMINI_API_KEY del servidor).", 503);
  }

  try {
    const detalle = await getVariant(sb, user.id, variantId);
    if (!detalle) return fallo("Variante no encontrada.", 404);

    const oferta = await resolverOferta(sb, user.id, body, byok);
    if ("error" in oferta) return fallo(oferta.error, oferta.status);

    // Los tres grupos necesitan ver LO DE DENTRO y LO DE FUERA de la variante:
    //  · items de la variante → enVariante:true (candidatos a HAVE / a reformular).
    //  · items del master que NO están en la variante → enVariante:false (candidatos a ADD).
    const enVariante: ItemTailor[] = detalle.items.map((vi) =>
      itemTailorDe({
        id: vi.id,
        item_id: vi.item_id,
        kind: vi.kind,
        data: vi.data,
        enVariante: true,
        override_origin: vi.override_origin,
        override_verified: vi.override_verified,
      }),
    );
    const dentro = new Set(detalle.items.map((vi) => vi.item_id));
    const soloMaster: ItemTailor[] = detalle.master
      .filter((m) => !dentro.has(m.id))
      .map((m) => itemTailorDe({ id: m.id, item_id: m.id, kind: m.kind, data: m.data, enVariante: false }));

    const items = [...enVariante, ...soloMaster];
    const analisis = await construirTailor({ offerText: oferta.text, items }, { llm: geminiOfertaLLM(byok) });

    for (const d of analisis.descartados) {
      if (d.tipo === "reformular" || d.tipo === "resumen") {
        console.warn("[api/variants/tailor] propuesta RECHAZADA por el candado", { variantId, tipo: d.tipo, id: d.id, razon: d.razon });
      }
    }

    return NextResponse.json({ analisis, offerChars: oferta.text.length, warnings: oferta.warnings });
  } catch (e) {
    console.error("[api/variants/tailor] no se pudo analizar el aviso", variantId, e);
    return fallo(motivo(e), 500);
  }
}
