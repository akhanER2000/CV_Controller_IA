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
 * ENLACES CON HIPERVÍNCULO REAL. Cada URL de la línea de contacto se envuelve en un
 * <Link> de @react-pdf; el TEXTO visible sigue siendo la URL tal cual, así que el
 * round-trip no lo nota. Este bloque fija ese candado: los enlaces del golden se
 * extraen EN ORDEN aunque ahora sean hipervínculos.
 */
describe("CV round-trip ATS · enlaces como hipervínculo (el texto no cambia)", () => {
  let extractedLinks = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(data, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extractedLinks = norm(text);
  });

  it("1 · cada URL de contacto sigue como TEXTO seleccionable, en orden", () => {
    let cursor = extractedLinks.indexOf("github.com/dgatica");
    for (const url of ["github.com/dgatica", "dgatica.cl", "linkedin.com/in/diego-gatica"]) {
      const idx = extractedLinks.indexOf(url, cursor);
      expect(idx, `enlace fuera de orden o ausente: "${url}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + url.length;
    }
  });

  it("2 · el golden completo sigue EN ORDEN con los enlaces envueltos en <Link>", () => {
    let cursor = 0;
    for (const line of golden.split("\n").map(norm).filter(Boolean)) {
      const idx = extractedLinks.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
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

/**
 * FOTO opt-in (versión "visual"). Con foto puesta se dibuja una imagen arriba,
 * pero es INVISIBLE para el parser: no inyecta texto ni basura, y el contacto en
 * texto sobrevive igual. Es la garantía de que enviar un CV con foto a un ATS no
 * rompe la lectura del texto (aunque el estándar sea sin foto).
 */
describe("CV round-trip ATS · foto opt-in (imagen invisible al parser)", () => {
  // PNG 1×1 transparente — data-URL mínima, como la que sube el usuario reducida.
  const PHOTO =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const withPhoto: ResumeData = { ...data, photo: PHOTO };
  let extractedPhoto = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(withPhoto, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extractedPhoto = norm(text);
  });

  it("1 · el contacto en texto sobrevive con la foto puesta", () => {
    for (const needle of ["Diego Gatica Morales", "diego.gatica@ejemplo.cl", "+56 9 6123 4567"]) {
      expect(extractedPhoto, `dato perdido con foto: "${needle}"`).toContain(needle);
    }
  });

  it("2 · las líneas del golden siguen EN ORDEN — la foto no inyecta texto", () => {
    let cursor = 0;
    for (const line of golden.split("\n").map(norm).filter(Boolean)) {
      const idx = extractedPhoto.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente con foto: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
  });

  it("3 · sin basura de embedding (la imagen no ensucia el texto)", () => {
    expect(extractedPhoto).not.toMatch(/D i e g o|E x p e r i e n c i a/);
  });
});

/**
 * QR con URL SOBRE la capacidad del código (~2.3 KB): QRCode.toDataURL lanzaría, así
 * que el render degrada a SOLO-TEXTO (sin glifo) en vez de reventar el PDF. El candado
 * "la URL va como texto" se mantiene; el documento nunca falla por una URL larga.
 */
describe("CV round-trip ATS · QR con URL larga degrada a solo-texto (no revienta)", () => {
  const LONG = "https://ejemplo.cl/" + "a".repeat(2600); // supera la capacidad del QR
  const withLong: ResumeData = { ...data, qr: { url: LONG } };

  it("1 · renderResumeToBuffer NO lanza y produce un PDF", async () => {
    const buf = await renderResumeToBuffer(withLong, { locale: "es", onePage: false });
    expect(buf.length).toBeGreaterThan(0);
  });

  it("2 · la URL sigue apareciendo como TEXTO aunque no haya glifo QR", async () => {
    const buf = await renderResumeToBuffer(withLong, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    // El prefijo estable de la URL debe estar en el texto extraído.
    expect(norm(text)).toContain("https://ejemplo.cl/aaaaaaaa");
  });
});

/**
 * QR modo 'vcard'. El QR codifica una vCard de los basics; el contacto YA está como
 * texto en el CUERPO (el candado ATS se cumple ahí), así que al pie NO se emite URL
 * extra, solo una leyenda honesta. El round-trip del golden debe seguir intacto y el
 * PDF no puede reventar. La vCard en sí NO debe aparecer como texto (vive en la imagen).
 */
describe("CV round-trip ATS · QR modo vcard (contacto en el cuerpo, orden intacto)", () => {
  const withVcard: ResumeData = { ...data, qr: { mode: "vcard" } };
  let extractedVc = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(withVcard, { locale: "es", onePage: false });
    expect(buf.length).toBeGreaterThan(0);
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extractedVc = norm(text);
  });

  it("1 · el golden sigue EN ORDEN — el QR vcard no altera la lectura", () => {
    let cursor = 0;
    for (const line of golden.split("\n").map(norm).filter(Boolean)) {
      const idx = extractedVc.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente con QR vcard: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
  });

  it("2 · la vCard NO se filtra como texto (vive dentro del glifo, no en el stream)", () => {
    expect(extractedVc).not.toContain("BEGIN:VCARD");
    expect(extractedVc).not.toContain("VERSION:3.0");
  });

  it("3 · el contacto en texto (nombre/email/tel) sobrevive igual", () => {
    for (const needle of ["Diego Gatica Morales", "diego.gatica@ejemplo.cl", "+56 9 6123 4567"]) {
      expect(extractedVc, `dato perdido con QR vcard: "${needle}"`).toContain(needle);
    }
  });
});
