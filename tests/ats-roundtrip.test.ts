import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { serializeResume, resumeToPlainText, type Profile } from "../src/lib/cv/serialize";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";

/**
 * EL TEST QUE NADIE HACE (ESPECIFICACION.md §7). Renderiza el PDF desde el golden
 * JSON, lo re-parsea, y lo diffea contra cv-texto-plano.txt. Si no coincide, falla
 * el build. Es el test de CI y, a la vez, el feature más vendible ("cómo lo lee el ATS").
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, "../src/lib/cv/fixtures");
const profile = JSON.parse(readFileSync(path.join(fx, "datos-ejemplo.json"), "utf8")) as Profile;
const golden = readFileSync(path.join(fx, "cv-texto-plano.txt"), "utf8");

const GOLDEN_VARIANT = "var-backend-2p-es";
const norm = (x: string) => x.replace(/\s+/g, " ").trim();

describe("CV round-trip ATS · golden var-backend-2p-es", () => {
  const model = serializeResume(profile, GOLDEN_VARIANT);
  let extracted = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(model);
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extracted = norm(text);
  });

  it("1 · el serializador reproduce cv-texto-plano.txt EXACTO", () => {
    expect(resumeToPlainText(model).trimEnd()).toBe(golden.trimEnd());
  });

  it("2 · el PDF re-parseado contiene cada línea del golden, EN ORDEN DE LECTURA", () => {
    let cursor = 0;
    for (const line of golden.split("\n").map(norm).filter(Boolean)) {
      const idx = extracted.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
  });

  it("3 · contacto y métricas sobreviven al parseo (runs no se pegan ni separan)", () => {
    for (const needle of [
      "Matías Fuentes Aguilar",
      "matias.fuentes@correo-ejemplo.cl",
      "+56 9 6123 4567",
      "850 ms", "180 ms", "99,95%", "CLP 12.000M", "40.000", "45 min", "6 min", "AUC 0,94", "320",
    ]) {
      expect(extracted, `dato/métrica perdido: "${needle}"`).toContain(needle);
    }
  });

  it("4 · < 2,5 MB (umbral Greenhouse) y con texto real seleccionable", async () => {
    const buf = await renderResumeToBuffer(model);
    expect(buf.length).toBeLessThan(2.5 * 1024 * 1024);
    expect(extracted.length).toBeGreaterThan(500);
  });

  it("5 · sin basura de embedding (letras espaciadas / mojibake)", () => {
    expect(extracted).not.toMatch(/M a n a g e m e n t|N b o b h f n f o u/);
    // el nombre no debe salir con letras separadas
    expect(extracted).not.toMatch(/M a t í a s/);
  });
});
