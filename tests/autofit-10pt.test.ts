import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { toPlainText, type ResumeData } from "../src/lib/cv/resume";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import { lineasDe } from "../src/lib/cv/medir";
import { CUERPO_MIN_PT, listTemplates } from "../src/lib/cv/templates";

/**
 * EL SUELO DEL AUTOFIT, VIGILADO. El autofit puede bajar cualquier plantilla hasta
 * 10 pt, así que los dos candados del documento —round-trip ATS (ats-roundtrip) y
 * medida de línea (medida-linea)— tienen que aguantar TAMBIÉN ahí, no solo en el
 * cuerpo de la plantilla (que ya vigilan esos dos archivos, sin cambios). Mismos
 * umbrales, mismo método: a 10 pt caben más caracteres por línea, y si alguna
 * plantilla se pasara de medida, este es el test que lo dice.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(path.join(here, "../src/lib/cv/fixtures/datos-ejemplo.json"), "utf8"),
) as ResumeData;
const ATS = listTemplates().filter((t) => t.gama === "ats");
const norm = (x: string) => x.replace(/\s+/g, " ").trim();
const pct = (arr: number[], p: number) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]!;
};

describe(`autofit a ${CUERPO_MIN_PT} pt · round-trip y medida de línea en toda la gama ATS`, () => {
  const medidas = new Map<string, { p90: number; mediana: number; max: number; texto: string }>();

  beforeAll(async () => {
    for (const tpl of ATS) {
      const buf = new Uint8Array(
        await renderResumeToBuffer(
          { ...data, templateId: tpl.id },
          { locale: "es", onePage: false, bodySize: CUERPO_MIN_PT },
        ),
      );
      const largos = (await lineasDe(buf)).map((l) => l.length).filter((n) => n >= 30);
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      medidas.set(tpl.id, {
        p90: pct(largos, 0.9),
        mediana: pct(largos, 0.5),
        max: Math.max(0, ...largos),
        texto: norm(text),
      });
    }
  }, 900000);

  for (const tpl of ATS) {
    it(`${tpl.id} · el texto plano sale EN ORDEN y la medida aguanta (p90 ≤ 90)`, () => {
      const m = medidas.get(tpl.id)!;
      const rayosX = toPlainText({ ...data, templateId: tpl.id }, { locale: "es", onePage: false });
      let cursor = 0;
      for (const line of rayosX.split("\n").map(norm).filter(Boolean)) {
        const idx = m.texto.indexOf(line, cursor);
        expect(idx, `${tpl.id} a 10 pt · fuera de orden o ausente: "${line}"`).toBeGreaterThanOrEqual(0);
        cursor = idx + line.length;
      }
      expect(m.p90, `${tpl.id} a 10 pt · p90 = ${m.p90}`).toBeLessThanOrEqual(90);
      expect(m.mediana, `${tpl.id} a 10 pt · mediana = ${m.mediana}`).toBeLessThanOrEqual(75);
      expect(m.max, `${tpl.id} a 10 pt · máx = ${m.max}`).toBeLessThanOrEqual(110);
    });
  }
});
