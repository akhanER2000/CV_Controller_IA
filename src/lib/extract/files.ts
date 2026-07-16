import "server-only";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { transcribeImage, transcribePdf, geminiApiKey } from "./llm";

/**
 * Extracción de texto por tipo de archivo (prompt 02 §3.1, §4.2). Convierte los
 * bytes de una fuente ya descargada de Storage en `raw_text` para el pipeline.
 * NUNCA inventa: si un PDF no trae capa de texto o una imagen es ilegible,
 * devuelve texto vacío + un aviso honesto (no un relleno plausible).
 *
 *  · PDF con capa de texto  → unpdf (extractText) → raw_text.
 *  · PDF ESCANEADO (sin capa)→ ⚠️ TRANSCRIPCIÓN VERBATIM: se manda el PDF al modelo
 *                              de visión como documento (Gemini rasteriza las
 *                              páginas — sin canvas en el servidor) y se transcribe
 *                              literal (isTranscription=true). Sin IA o si es muy
 *                              grande, cae al aviso honesto de "sube una captura".
 *  · DOCX                    → mammoth (extractRawText) → raw_text.
 *  · Imagen (png/jpg/webp)   → ⚠️ TRANSCRIPCIÓN VERBATIM con transcribeImage ANTES
 *                              de extraer nada (marca isTranscription=true), para
 *                              que la verificación de evidencia (§4.4) corra sobre
 *                              la transcripción y no sobre una alucinación.
 *
 * Las llamadas al modelo se inyectan (ExtractDeps) → los branches de transcripción
 * se prueban sin LLM en vivo.
 */

export type FileKind = "pdf" | "docx" | "image";

export interface ExtractInput {
  kind: FileKind;
  bytes: Uint8Array;
  /** MIME real (de Storage) — sirve para armar el data-URL de la imagen. */
  mime?: string;
  /** nombre original — para inferir el MIME de imagen si falta. */
  name?: string;
}

export interface ExtractedFile {
  /** texto listo para el pipeline; "" si no se pudo leer nada legible. */
  text: string;
  /** true para imagen y PDF escaneado: el texto (si lo hay) es transcripción verbatim. */
  isTranscription: boolean;
  /** nº de páginas del PDF, si se conoce. */
  pageCount?: number;
  /** aviso honesto cuando no hay texto legible. Nunca se rellena con invención. */
  warning?: string;
}

/** Menos de esto (tras quitar espacios) ⇒ el PDF no tiene capa de texto real. */
const MIN_PDF_TEXT = 12;
/** Tope para transcribir un PDF escaneado con el modelo (payload inline de Gemini). */
const MAX_PDF_TRANSCRIBE_BYTES = 15_000_000;

/**
 * Llamadas al modelo, inyectables para test. Por defecto usa las reales (Gemini).
 */
export interface ExtractDeps {
  transcribeImage: (dataUrl: string) => Promise<string>;
  transcribePdf: (bytes: Uint8Array) => Promise<string>;
  hasAiKey: () => boolean;
}
/**
 * Deps reales con la clave EFECTIVA: la BYOK del usuario (ya descifrada) o, si no,
 * la del servidor. `realDeps()` es el atajo con la del servidor.
 */
export function extractDepsFor(apiKey?: string): ExtractDeps {
  return {
    transcribeImage: (u) => transcribeImage(u, apiKey),
    transcribePdf: (b) => transcribePdf(b, apiKey),
    hasAiKey: () => !!(apiKey || geminiApiKey()),
  };
}
const realDeps = (): ExtractDeps => extractDepsFor();

const IMG_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function imageMime(name?: string, mime?: string): string {
  if (mime && mime.startsWith("image/")) return mime;
  const ext = (name?.split(".").pop() ?? "").toLowerCase();
  return IMG_MIME[ext] ?? "image/png";
}

export async function extractFile(input: ExtractInput, deps: ExtractDeps = realDeps()): Promise<ExtractedFile> {
  if (input.kind === "docx") return extractDocx(input.bytes);
  if (input.kind === "pdf") return extractPdf(input.bytes, deps);
  return extractImage(input.bytes, imageMime(input.name, input.mime), deps);
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractedFile> {
  try {
    // mammoth (Node): acepta un Buffer. Solo .docx (OOXML), no el .doc binario.
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = value.trim();
    if (!text) {
      return { text: "", isTranscription: false, warning: "El DOCX no contenía texto legible." };
    }
    return { text, isTranscription: false };
  } catch (e) {
    return { text: "", isTranscription: false, warning: `No se pudo leer el DOCX: ${msg(e)}` };
  }
}

async function extractPdf(bytes: Uint8Array, deps: ExtractDeps): Promise<ExtractedFile> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const pageCount = (pdf as { numPages?: number }).numPages;
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = (Array.isArray(text) ? text.join("\n") : text).trim();

    if (clean.replace(/\s+/g, "").length >= MIN_PDF_TEXT) {
      return { text: clean, isTranscription: false, pageCount };
    }

    // Sin capa de texto: es un escaneo (páginas como imagen). Se transcribe
    // VERBATIM con el modelo de visión (Gemini rasteriza las páginas). El texto
    // resultante es transcripción → la verificación de evidencia corre sobre ella.
    if (!deps.hasAiKey()) {
      return {
        text: "",
        isTranscription: false,
        pageCount,
        warning:
          "PDF sin capa de texto (parece escaneado) y la IA no está configurada: no se pudo transcribir. " +
          "Sube una captura de pantalla y la transcribimos literal.",
      };
    }
    if (bytes.length > MAX_PDF_TRANSCRIBE_BYTES) {
      return {
        text: "",
        isTranscription: false,
        pageCount,
        warning:
          "PDF escaneado demasiado grande para transcribir. Sube páginas sueltas o una captura de pantalla.",
      };
    }
    const transcript = (await deps.transcribePdf(bytes)).trim();
    if (!transcript) {
      return {
        text: "",
        isTranscription: true,
        pageCount,
        warning: "PDF escaneado ilegible: no se pudo transcribir texto. No inventamos lo que no se lee.",
      };
    }
    return { text: transcript, isTranscription: true, pageCount };
  } catch (e) {
    return { text: "", isTranscription: false, warning: `No se pudo leer el PDF: ${msg(e)}` };
  }
}

async function extractImage(bytes: Uint8Array, mime: string, deps: ExtractDeps): Promise<ExtractedFile> {
  try {
    // ⚠️ Transcripción VERBATIM primero (prompt §4.2): la verificación de
    // evidencia corre sobre ESTO, no sobre lo que la extracción interprete.
    const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    const transcript = (await deps.transcribeImage(dataUrl)).trim();
    if (!transcript) {
      return {
        text: "",
        isTranscription: true,
        warning: "Imagen ilegible: no se pudo transcribir texto. No inventamos lo que no se lee.",
      };
    }
    return { text: transcript, isTranscription: true };
  } catch (e) {
    return { text: "", isTranscription: true, warning: `No se pudo transcribir la imagen: ${msg(e)}` };
  }
}
