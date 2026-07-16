import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createElement as h } from "react";
import { Document, Page, Image, renderToBuffer } from "@react-pdf/renderer";
import { extractFile, type ExtractDeps } from "../src/lib/extract/files";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import type { ResumeData } from "../src/lib/cv/resume";

/**
 * extractFile: la ruta de PDF ESCANEADO (sin capa de texto) debe TRANSCRIBIRSE
 * verbatim con el modelo de visión (isTranscription=true), no devolver "sube una
 * captura". Aquí el modelo se INYECTA (ExtractDeps), así el branch se prueba sin
 * LLM en vivo. Se genera un PDF de SOLO IMAGEN (sin Text) para que unpdf no
 * encuentre capa de texto y dispare la transcripción.
 */
const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, "../src/lib/cv/fixtures");
const golden = JSON.parse(readFileSync(path.join(fx, "datos-ejemplo.json"), "utf8")) as ResumeData;

const fakeDeps = (over: Partial<ExtractDeps> = {}): ExtractDeps => ({
  transcribeImage: async () => "TEXTO DE IMAGEN",
  transcribePdf: async () => "TEXTO DEL ESCANEO",
  hasAiKey: () => true,
  ...over,
});

describe("extractFile · PDF escaneado (solo imagen) → transcripción verbatim", () => {
  // Se guardan en base64: pdf.js DESPRENDE el buffer del Uint8Array que recibe, así
  // que cada extractFile necesita bytes FRESCOS (en producción cada archivo baja de
  // Storage por separado, así que esto es un detalle solo del test).
  let scannedB64 = "";
  let textPdfB64 = "";
  const bytesOf = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));

  beforeAll(async () => {
    // PDF de SOLO IMAGEN: una página con una imagen, sin ningún <Text> → sin capa
    // de texto → unpdf extrae "" → es el caso "escaneado".
    const el = h(Document, null, h(Page, { size: "LETTER" }, h(Image, { src: PNG_1x1, style: { width: 80, height: 80 } })));
    scannedB64 = Buffer.from(await renderToBuffer(el)).toString("base64");
    // PDF CON capa de texto (el golden) → NO se transcribe.
    textPdfB64 = Buffer.from(await renderResumeToBuffer(golden, { locale: "es", onePage: false })).toString("base64");
  });

  it("escaneado + IA disponible → transcribe verbatim (isTranscription=true)", async () => {
    const ex = await extractFile({ kind: "pdf", bytes: bytesOf(scannedB64) }, fakeDeps());
    expect(ex.text).toBe("TEXTO DEL ESCANEO");
    expect(ex.isTranscription).toBe(true);
    expect(ex.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("escaneado + SIN IA → aviso honesto, no transcribe, no inventa", async () => {
    const ex = await extractFile({ kind: "pdf", bytes: bytesOf(scannedB64) }, fakeDeps({ hasAiKey: () => false }));
    expect(ex.text).toBe("");
    expect(ex.isTranscription).toBe(false);
    expect(ex.warning).toMatch(/escaneado|captura/i);
  });

  it("escaneado + transcripción vacía (ilegible) → aviso honesto, no inventa", async () => {
    const ex = await extractFile({ kind: "pdf", bytes: bytesOf(scannedB64) }, fakeDeps({ transcribePdf: async () => "   " }));
    expect(ex.text).toBe("");
    expect(ex.isTranscription).toBe(true);
    expect(ex.warning).toMatch(/ilegible|no se pudo transcribir/i);
  });

  it("PDF CON capa de texto → NO llama al transcriptor (regresión)", async () => {
    let called = 0;
    const ex = await extractFile(
      { kind: "pdf", bytes: bytesOf(textPdfB64) },
      fakeDeps({ transcribePdf: async () => { called++; return "NO DEBERÍA"; } }),
    );
    expect(called).toBe(0);
    expect(ex.isTranscription).toBe(false);
    expect(ex.text).toContain("Diego Gatica Morales");
  });

  it("imagen → usa transcribeImage (isTranscription=true)", async () => {
    const bytes = new Uint8Array(Buffer.from(PNG_1x1.split(",")[1]!, "base64"));
    const ex = await extractFile({ kind: "image", bytes, mime: "image/png" }, fakeDeps());
    expect(ex.text).toBe("TEXTO DE IMAGEN");
    expect(ex.isTranscription).toBe(true);
  });
});
