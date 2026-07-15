import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { toPlainText, type ResumeData } from "../src/lib/cv/resume";

/**
 * Mitad 1 del contrato golden (documento-cv.md §6): el texto plano generado desde
 * datos-ejemplo.json (locale es, 2 páginas) debe ser IGUAL byte-a-byte a
 * cv-texto-plano.txt. Puro (sin PDF). La mitad 2 (round-trip por el PDF real) vive
 * en ats-roundtrip.test.ts.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, "../src/lib/cv/fixtures");
const data = JSON.parse(readFileSync(path.join(fx, "datos-ejemplo.json"), "utf8")) as ResumeData;
const golden = readFileSync(path.join(fx, "cv-texto-plano.txt"), "utf8");

describe("golden · texto plano desde datos-ejemplo.json", () => {
  it("toPlainText(es, 2 páginas) === cv-texto-plano.txt (byte a byte)", () => {
    expect(toPlainText(data, { locale: "es", onePage: false })).toBe(golden);
  });
});
