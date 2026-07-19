import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDocumentProxy } from "unpdf";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import { listTemplates, resolveMetrics } from "../src/lib/cv/templates";
import type { ResumeData } from "../src/lib/cv/resume";

/**
 * LA MEDIDA DE LÍNEA, MEDIDA — y convertida en candado de CI.
 *
 * Este archivo empezó siendo una medición temporal y se queda como test: la medida
 * de línea es el defecto de composición que NO se ve a ojo. Un CV con la línea a 96
 * caracteres se ve perfectamente bien en pantalla; simplemente se lee peor, y nadie
 * lo detecta revisando el PDF. Si no falla el build, vuelve.
 *
 * CÓMO SE MIDE (y por qué no se estima). No se calcula con anchos de fuente ni con
 * una regla de tres sobre los márgenes: se RECONSTRUYEN las líneas que de verdad
 * salieron del render, agrupando los items de texto del PDF por su coordenada Y y
 * ordenándolos por X. Es la misma técnica con la que se descubrió el problema, y
 * mide lo único que importa: lo que el ojo recorre de margen a margen.
 *
 * QUÉ CUENTA COMO "LÍNEA DE CUERPO". Las de 30 caracteres o más. Por debajo están
 * los rótulos, las fechas sueltas, la ubicación y los nombres de empresa: texto que
 * no se lee de corrido y que, promediado, ENGAÑA — es justo lo que hacía que la
 * mediana saliera en 57-68 y pareciera que no pasaba nada, con el p90 en 96.
 *
 * EL UMBRAL. p90 ≤ 90 caracteres. 80 es el techo de legibilidad accesible y 45-75
 * el óptimo; el candado se pone en 90 y no en 80 porque el percentil 90 de un texto
 * real con palabras largas (URLs, "Pontificia Universidad Católica de Chile") no
 * puede clavarse al óptimo sin partir palabras, y el guionado está desactivado a
 * propósito. Lo que este número impide es lo que pasaba antes: que TODA la gama
 * viviera un 20 % por encima del máximo sin que nadie se enterara.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, "../src/lib/cv/fixtures");
const data = JSON.parse(readFileSync(path.join(fx, "datos-ejemplo.json"), "utf8")) as ResumeData;

/** El candado: percentil 90 de caracteres por línea de cuerpo. */
const P90_MAX = 90;
/** Lo que se considera línea de lectura (por debajo son rótulos y fechas). */
const MIN_CUERPO = 30;

const ATS = listTemplates().filter((t) => t.gama === "ats");

interface Medida {
  n: number;
  mediana: number;
  p90: number;
  max: number;
  sobre90: number;
  sobre80: number;
}

/** Las líneas REALES de un PDF: items de texto agrupados por coordenada Y. */
async function lineasDe(buf: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(buf);
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const porY = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5]! * 2) / 2; // media unidad de tolerancia
      const x = it.transform[4]!;
      if (!porY.has(y)) porY.set(y, []);
      porY.get(y)!.push({ x, s: it.str });
    }
    for (const [, items] of porY) {
      items.sort((a, b) => a.x - b.x);
      const texto = items.map((i) => i.s).join("").replace(/\s+/g, " ").trim();
      if (texto) out.push(texto);
    }
  }
  return out;
}

const pct = (arr: number[], p: number) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]!;
};

describe("medida de línea · el candado que no se ve a ojo", () => {
  const medidas = new Map<string, Medida>();

  beforeAll(async () => {
    for (const tpl of ATS) {
      const buf = new Uint8Array(
        await renderResumeToBuffer({ ...data, templateId: tpl.id }, { locale: "es", onePage: false }),
      );
      const largos = (await lineasDe(buf)).map((l) => l.length).filter((n) => n >= MIN_CUERPO);
      medidas.set(tpl.id, {
        n: largos.length,
        mediana: pct(largos, 0.5),
        p90: pct(largos, 0.9),
        max: Math.max(0, ...largos),
        sobre90: largos.filter((n) => n > 90).length,
        sobre80: largos.filter((n) => n > 80).length,
      });
    }
    // La tabla completa, para que el número se pueda auditar sin volver a medir.
    const filas = [...medidas].map(([id, m]) =>
      [id.padEnd(24), String(m.n).padStart(3), String(m.mediana).padStart(4), String(m.p90).padStart(4),
        String(m.max).padStart(4), String(m.sobre90).padStart(4), String(m.sobre80).padStart(4)].join(" "),
    );
    console.log(
      ["", "plantilla                  n  med   p90   max  >90  >80", ...filas, ""].join("\n"),
    );
  }, 900000);

  it("0 · se ha medido TODA la gama ATS (el candado no puede quedarse a medias)", () => {
    expect(medidas.size).toBe(ATS.length);
    for (const [id, m] of medidas) expect(m.n, `${id}: no se midió ni una línea de cuerpo`).toBeGreaterThan(10);
  });

  for (const tpl of ATS) {
    it(`${tpl.id} · p90 de caracteres por línea ≤ ${P90_MAX}`, () => {
      const m = medidas.get(tpl.id)!;
      expect(
        m.p90,
        `${tpl.id}: p90 = ${m.p90} caracteres (mediana ${m.mediana}, máx ${m.max}, ${m.sobre80} líneas sobre 80). ` +
          "Baja la medida: o esqueleto de columna colgante (skeleton: 'hanging'), o más margen horizontal. " +
          "Ojo: con cuerpo pequeño hace falta MÁS margen, porque la medida se cuenta en caracteres.",
      ).toBeLessThanOrEqual(P90_MAX);
    });
  }

  it("1 · la MEDIANA cae dentro del óptimo de lectura en toda la gama", () => {
    // El óptimo tipográfico es 45-75 caracteres. La mediana es la línea típica: si
    // esa se sale, no hay excusa de "palabra larga que no se puede partir".
    for (const [id, m] of medidas) {
      expect(m.mediana, `${id}: mediana de ${m.mediana} caracteres`).toBeLessThanOrEqual(75);
      expect(m.mediana, `${id}: mediana de ${m.mediana} caracteres — la línea se queda corta`).toBeGreaterThanOrEqual(30);
    }
  });

  it("2 · las plantillas de COLUMNA COLGANTE bajan de verdad, no de nombre", () => {
    // La columna colgante existe para una cosa. Si una plantilla la declara y su
    // medida no baja, el esqueleto se está dibujando pero no está funcionando.
    const colgantes = ATS.filter((t) => resolveMetrics(t.metrics).skeleton === "hanging");
    expect(colgantes.length, "nadie usa el esqueleto de columna colgante").toBeGreaterThanOrEqual(10);
    for (const tpl of colgantes) {
      const m = medidas.get(tpl.id)!;
      expect(m.p90, `${tpl.id}: cuelga la columna y sigue en ${m.p90} caracteres`).toBeLessThanOrEqual(80);
    }
  });

  it("3 · ninguna plantilla tiene una línea SUELTA absurdamente larga", () => {
    // El p90 puede estar bien y esconder un desbordamiento puntual (una URL larga en
    // una columna estrecha, un cargo que no cabe). El máximo lo caza.
    for (const [id, m] of medidas) {
      expect(m.max, `${id}: línea máxima de ${m.max} caracteres`).toBeLessThanOrEqual(110);
    }
  });
});
