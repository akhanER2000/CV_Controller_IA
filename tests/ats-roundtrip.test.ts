import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { toPlainText, type ResumeData } from "../src/lib/cv/resume";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";

/**
 * EL TEST QUE NADIE HACE (documento-cv.md §6). Renderiza el PDF desde el golden
 * JSON, lo re-parsea con unpdf, normaliza y lo compara contra cv-texto-plano.txt.
 * Si no coincide, FALLA EL BUILD. Es el test de CI y, a la vez, el feature más
 * vendible ("cómo lo lee el ATS": el texto plano real que extrae el parser).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, "../src/lib/cv/fixtures");
const data = JSON.parse(readFileSync(path.join(fx, "datos-ejemplo.json"), "utf8")) as ResumeData;
const golden = readFileSync(path.join(fx, "cv-texto-plano.txt"), "utf8");

const norm = (x: string) => x.replace(/\s+/g, " ").trim();

describe("CV round-trip ATS · golden (Diego Gatica, 2 páginas, es)", () => {
  let extracted = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(data, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extracted = norm(text);
  });

  it("1 · el generador de texto plano reproduce cv-texto-plano.txt EXACTO", () => {
    expect(toPlainText(data, { locale: "es", onePage: false })).toBe(golden);
  });

  it("2 · el PDF re-parseado contiene cada línea del golden, EN ORDEN DE LECTURA", () => {
    let cursor = 0;
    for (const line of golden.split("\n").map(norm).filter(Boolean)) {
      const idx = extracted.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
  });

  it("3 · contacto y datos sobreviven al parseo (runs no se pegan ni separan)", () => {
    for (const needle of [
      "Diego Gatica Morales",
      "diego.gatica@ejemplo.cl",
      "+56 9 6123 4567",
      "github.com/dgatica",
      "40.000",
      "Altiplano Pagos SpA",
      "mar 2022 – hoy",
      "Go, Python, SQL, TypeScript",
    ]) {
      expect(extracted, `dato perdido: "${needle}"`).toContain(needle);
    }
  });

  it("4 · < 2,5 MB (umbral Greenhouse) y con texto real seleccionable", async () => {
    const buf = await renderResumeToBuffer(data, { locale: "es", onePage: false });
    expect(buf.length).toBeLessThan(2.5 * 1024 * 1024);
    expect(extracted.length).toBeGreaterThan(500);
  });

  it("5 · sin basura de embedding (letras espaciadas / mojibake)", () => {
    expect(extracted).not.toMatch(/D i e g o|E x p e r i e n c i a/);
  });

  it("6 · la versión de 1 página aplica el filtro p1 (freelance y práctica fuera, sin Proyectos)", () => {
    const one = toPlainText(data, { locale: "es", onePage: true });
    expect(one).not.toContain("Desarrollador freelance");
    expect(one).not.toContain("Práctica profesional");
    expect(one).not.toContain("Proyectos");
    expect(one).toContain("Backend Developer — Altiplano Pagos SpA");
    // Altiplano queda en 4 viñetas (fuera "Documenté la API…" y "Turno de soporte…")
    expect(one).not.toContain("Documenté la API pública");
    expect(one).not.toContain("Turno de soporte");
  });
});

/**
 * QR opt-in y HONESTO. Con qr puesto se dibuja un QR al pie, pero la URL SIEMPRE
 * va también como TEXTO al lado (el ATS no lee el QR). El round-trip debe SEGUIR
 * pasando: la URL se extrae y el orden de lectura del documento no se rompe.
 */
describe("CV round-trip ATS · QR opt-in (la URL en texto, orden intacto)", () => {
  const QR_URL = "dgatica.cl/portafolio";
  const withQr: ResumeData = { ...data, qr: { url: QR_URL } };
  let extractedQr = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(withQr, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extractedQr = norm(text);
  });

  it("1 · la URL del QR aparece como TEXTO seleccionable (la máquina la lee)", () => {
    expect(extractedQr).toContain(QR_URL);
  });

  it("2 · las líneas del golden siguen EN ORDEN — el QR al pie no rompe la lectura", () => {
    let cursor = 0;
    for (const line of golden.split("\n").map(norm).filter(Boolean)) {
      const idx = extractedQr.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente con QR: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
  });

  it("3 · la URL del QR va DESPUÉS de todo el contenido del golden (pie de página)", () => {
    const lastGolden = golden.split("\n").map(norm).filter(Boolean).pop()!;
    expect(extractedQr.indexOf(QR_URL)).toBeGreaterThan(extractedQr.indexOf(lastGolden));
  });
});
