import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  autofit,
  objetivoDe,
  plantillaDe,
  rejillaDeCuerpos,
  type AutofitDeps,
} from "../src/lib/cv/autofit";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import { medirPdf } from "../src/lib/cv/medir";
import {
  CUERPO_MIN_PT,
  escalarMetricas,
  getTemplate,
  resolveMetrics,
} from "../src/lib/cv/templates";
import type { ResumeData } from "../src/lib/cv/resume";

/**
 * EL AUTOFIT — 1, 2 o 3 páginas, y el cuerpo que se adapta sin bajar de 10 pt.
 *
 * Los casos «reales» renderizan y miden el PDF de verdad (el mismo motor que el
 * preview). El contenido largo se fabrica clonando un empleo del ejemplo: medido
 * sobre ats-clasica, +4 empleos dan 3 páginas a 10,5 pt y 2 a 10 pt; +10 dan 3
 * páginas; +30 no caben en 2 ni a 10 pt.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(path.join(here, "../src/lib/cv/fixtures/datos-ejemplo.json"), "utf8"),
) as ResumeData;

const conEmpleos = (n: number): ResumeData => {
  const d = structuredClone(data);
  for (let i = 0; i < n; i++) {
    const w = structuredClone(data.work[1]!);
    w.company = `Empresa Extra ${i + 1}`;
    d.work.push(w);
  }
  return d;
};

describe("objetivoDe · 1, 2 o 3 páginas; lo demás es 2", () => {
  it("acepta 1, 2 y 3", () => {
    expect(objetivoDe(1)).toBe(1);
    expect(objetivoDe(2)).toBe(2);
    expect(objetivoDe(3)).toBe(3);
    expect(objetivoDe("3")).toBe(3);
  });
  it("cualquier otro valor cae en 2", () => {
    expect(objetivoDe(99)).toBe(2);
    expect(objetivoDe(0)).toBe(2);
    expect(objetivoDe(4)).toBe(2);
    expect(objetivoDe("x")).toBe(2);
    expect(objetivoDe(undefined)).toBe(2);
  });
});

describe("escalarMetricas · el cuerpo baja y los títulos lo acompañan", () => {
  const m = getTemplate("ats-clasica").metrics;

  it("nunca sube por encima de la plantilla ni baja de 10 pt", () => {
    expect(escalarMetricas(m, 14)).toBe(m);
    expect(escalarMetricas(m, 6).bodySize).toBe(CUERPO_MIN_PT);
  });

  it("los títulos escalan en proporción; contacto y fechas no encogen", () => {
    const base = resolveMetrics(m);
    const e = resolveMetrics(escalarMetricas(m, 10));
    const k = 10 / base.bodySize;
    expect(e.nameSize).toBeCloseTo(base.nameSize * k, 1);
    expect(e.headingSize).toBeCloseTo(base.headingSize * k, 1);
    expect(e.entryTitleSize).toBeCloseTo(base.entryTitleSize * k, 1);
    expect(e.bodyLeading).toBe(base.bodyLeading); // factor: la altura de línea escala sola
    expect(e.dateSize).toBe(base.dateSize);
    expect(e.contactSize).toBe(base.contactSize);
  });
});

describe("autofit · la búsqueda (render inyectado)", () => {
  /** Un render falso: «cabe» si el cuerpo es ≤ `limite`. Registra los cuerpos probados. */
  const falso = (limite: number, probados: number[]): AutofitDeps => ({
    render: async (_d, o) => {
      probados.push(o.bodySize ?? Infinity);
      return new Uint8Array([(o.bodySize ?? 99) <= limite ? 1 : 2]);
    },
    medir: async (buf) => ({
      paginas: buf[0] === 1 ? [["x"]] : [["x"], ["y"], ["z"], ["w"]],
      porPagina: buf[0] === 1 ? [1] : [1, 1, 1, 1],
      total: buf[0] === 1 ? 1 : 4,
      caben: 50,
      capacidad: 50,
    }),
  });
  const tpl = getTemplate("ats-toga"); // cuerpo 10,8

  it("la rejilla va de 10 a la base, en pasos de 0,25, sin bajar de 10", () => {
    expect(rejillaDeCuerpos(10.8)).toEqual([10, 10.25, 10.5, 10.75, 10.8]);
    expect(rejillaDeCuerpos(10)).toEqual([10]);
    expect(Math.min(...rejillaDeCuerpos(11))).toBe(10);
  });

  it("si ya cabe, un solo render con el cuerpo de la plantilla", async () => {
    const probados: number[] = [];
    const r = await autofit(data, tpl, 2, {}, falso(99, probados));
    expect(r.noCabe).toBe(false);
    expect(r.bodySize).toBe(10.8);
    expect(probados).toHaveLength(1);
  });

  it("elige el MAYOR cuerpo que cabe", async () => {
    const probados: number[] = [];
    const r = await autofit(data, tpl, 2, {}, falso(10.6, probados));
    expect(r.noCabe).toBe(false);
    expect(r.bodySize).toBe(10.5);
  });

  it("nunca prueba ni devuelve un cuerpo bajo 10 pt; si no cabe, noCabe a 10", async () => {
    const probados: number[] = [];
    const r = await autofit(data, tpl, 2, {}, falso(5, probados));
    expect(r).toMatchObject({ noCabe: true, bodySize: 10 });
    expect(Math.min(...probados)).toBeGreaterThanOrEqual(CUERPO_MIN_PT);
  });
});

describe("autofit · sobre el PDF real", () => {
  const tpl = plantillaDe(data); // ats-clasica, 10,5 pt

  it("nunca baja de 10 pt (ni con un documento enorme)", async () => {
    const r = await autofit(conEmpleos(30), tpl, 2);
    expect(r.bodySize).toBeGreaterThanOrEqual(CUERPO_MIN_PT);
  }, 120000);

  it("un CV largo que a su cuerpo no cabe en 2, cabe tras el autofit", async () => {
    const largo = conEmpleos(4);
    const antes = await medirPdf(
      new Uint8Array(await renderResumeToBuffer(largo, {})),
      resolveMetrics(tpl.metrics),
    );
    expect(antes.porPagina.length, "el caso tiene que desbordar a su cuerpo").toBeGreaterThan(2);

    const r = await autofit(largo, tpl, 2);
    expect(r.noCabe).toBe(false);
    expect(r.bodySize).toBeLessThan(tpl.metrics.bodySize);
    expect(r.bodySize).toBeGreaterThanOrEqual(CUERPO_MIN_PT);
    expect(r.medida.porPagina.length).toBeLessThanOrEqual(2);
    expect(r.sobran).toBeLessThanOrEqual(0);

    // El buffer devuelto ES el render con ese cuerpo (lo que verán preview y descarga).
    const otraVez = await medirPdf(
      new Uint8Array(await renderResumeToBuffer(largo, { bodySize: r.bodySize })),
      resolveMetrics(escalarMetricas(tpl.metrics, r.bodySize)),
    );
    expect(otraVez.porPagina).toEqual(r.medida.porPagina);
  }, 120000);

  it("uno imposible da noCabe con cuerpo 10", async () => {
    const r = await autofit(conEmpleos(30), tpl, 2);
    expect(r).toMatchObject({ noCabe: true, bodySize: 10 });
    expect(r.medida.porPagina.length).toBeGreaterThan(2);
    expect(r.sobran).toBeGreaterThan(0);
  }, 120000);

  it("con objetivo 3 y contenido suficiente, medirPdf cuenta 3 páginas REALES", async () => {
    const r = await autofit(conEmpleos(10), tpl, 3);
    expect(r.noCabe).toBe(false);
    expect(r.objetivo).toBe(3);
    const medida = await medirPdf(r.buf, resolveMetrics(escalarMetricas(tpl.metrics, r.bodySize)));
    expect(medida.porPagina.length).toBe(3);
    expect(medida.porPagina.every((n) => n > 0)).toBe(true);
  }, 120000);
});
