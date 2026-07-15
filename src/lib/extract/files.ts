import "server-only";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { transcribeImage } from "./llm";

/**
 * Extracción de texto por tipo de archivo (prompt 02 §3.1, §4.2). Convierte los
 * bytes de una fuente ya descargada de Storage en `raw_text` para el pipeline.
 * NUNCA inventa: si un PDF no trae capa de texto o una imagen es ilegible,
 * devuelve texto vacío + un aviso honesto (no un relleno plausible).
 *
 *  · PDF con capa de texto  → unpdf (extractText) → raw_text.
 *  · PDF ESCANEADO (sin capa)→ aviso honesto: "sube una captura" (no se rasteriza
 *                              en el servidor; ver limitación en el reporte).
 *  · DOCX                    → mammoth (extractRawText) → raw_text.
 *  · Imagen (png/jpg/webp)   → ⚠️ TRANSCRIPCIÓN VERBATIM con transcribeImage ANTES
 *                              de extraer nada (marca isTranscription=true), para
 *                              que la verificación de evidencia (§4.4) corra sobre
 *                              la transcripción y no sobre una alucinación.
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

export async function extractFile(input: ExtractInput): Promise<ExtractedFile> {
  if (input.kind === "docx") return extractDocx(input.bytes);
  if (input.kind === "pdf") return extractPdf(input.bytes);
  return extractImage(input.bytes, imageMime(input.name, input.mime));
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

async function extractPdf(bytes: Uint8Array): Promise<ExtractedFile> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const pageCount = (pdf as { numPages?: number }).numPages;
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = (Array.isArray(text) ? text.join("\n") : text).trim();

    if (clean.replace(/\s+/g, "").length < MIN_PDF_TEXT) {
      // Sin capa de texto: es un escaneo. No lo rasterizamos en el servidor —
      // pedimos una captura, que sí transcribimos literal (imagen). Honesto.
      return {
        text: "",
        isTranscription: false,
        pageCount,
        warning:
          "PDF sin capa de texto (parece escaneado): no se pudo extraer nada. " +
          "Sube una captura de pantalla y la transcribimos literal.",
      };
    }
    return { text: clean, isTranscription: false, pageCount };
  } catch (e) {
    return { text: "", isTranscription: false, warning: `No se pudo leer el PDF: ${msg(e)}` };
  }
}

async function extractImage(bytes: Uint8Array, mime: string): Promise<ExtractedFile> {
  try {
    // ⚠️ Transcripción VERBATIM primero (prompt §4.2): la verificación de
    // evidencia corre sobre ESTO, no sobre lo que la extracción interprete.
    const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    const transcript = (await transcribeImage(dataUrl)).trim();
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
