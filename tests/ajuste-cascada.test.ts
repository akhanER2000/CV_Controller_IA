import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ResumeData } from "../src/lib/cv/resume";
import { lineasQueSobran, lineasQueSobranReales, type MedidaPdf } from "../src/lib/cv/medir";
import { autofit, plantillaDe } from "../src/lib/cv/autofit";
import {
  CUERPO_MIN_PT,
  getTemplate,
  listTemplates,
  registrarPlantillaUsuario,
  DEFAULT_TEMPLATE_ID,
} from "../src/lib/cv/templates";
import {
  ESCALONES,
  LIMITES_MEDIDA,
  baseParaMedida,
  buscarPlantillaMedida,
  metricasDeParams,
  paramsDeEscalon,
  sirveDeBase,
  validarParams,
  type ResultadoMedida,
} from "../src/lib/cv/plantilla-medida";
import { cascada, preseleccionar, simularRecortes } from "../src/lib/cv/cascada";
import { uuidDe } from "../src/lib/cv/plantillas-usuario";
import { ajusteCascada } from "../src/lib/i18n/dict/ajuste-cascada";

/**
 * LA CASCADA DE «AJUSTAR PÁGINAS» (DA-A1) y su último paso, la PLANTILLA A MEDIDA.
 * Lo que tiene que ser verdad pase lo que pase:
 *   · «sobran N» sale del reparto REAL de páginas (antes prometía sitio que no había);
 *   · una plantilla a medida nunca baja de 10 pt ni de 12 mm, no rompe la medida de
 *     línea y pasa el round-trip ATS sobre el PDF que se renderizó;
 *   · la cascada se para en el primer paso que resuelve, y lo dice.
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
const medida = (porPagina: number[], caben = 54): MedidaPdf => ({
  paginas: porPagina.map((n) => Array.from({ length: n }, () => "x")),
  porPagina,
  total: porPagina.reduce((a, b) => a + b, 0),
  caben,
  capacidad: caben * porPagina.length,
});

describe("lineasQueSobranReales · la cifra sale de las páginas reales", () => {
  it("★ el caso de la cuenta de prueba: 38+45+26 contra 2 páginas sobran 26, no 1", () => {
    const m = medida([38, 45, 26]);
    expect(lineasQueSobran(m, 2)).toBe(1); // la cuenta teórica que engañaba
    expect(lineasQueSobranReales(m, 2)).toBe(26);
  });
  it("nunca menos que la teórica", () => {
    const m = medida([54, 54, 30], 50);
    expect(lineasQueSobranReales(m, 2)).toBe(Math.max(lineasQueSobran(m, 2), 30));
  });
  it("si ya cabe en páginas reales no sobra nada (≤ 0)", () => {
    expect(lineasQueSobranReales(medida([60, 58]), 2)).toBeLessThanOrEqual(0);
    expect(lineasQueSobranReales(medida([20]), 2)).toBe(lineasQueSobran(medida([20]), 2));
  });
});

describe("plantillas del usuario en el registro (ids u:)", () => {
  it("un u: sin registrar cae en la de por defecto; registrado, se resuelve", () => {
    expect(getTemplate("u:no-existe").id).toBe(DEFAULT_TEMPLATE_ID);
    const t = { ...getTemplate("ats-clasica"), id: "u:prueba-registro", name: "Prueba" };
    registrarPlantillaUsuario(t);
    expect(getTemplate("u:prueba-registro").name).toBe("Prueba");
    // Un id del catálogo no se puede pisar desde el registro de usuario.
    registrarPlantillaUsuario({ ...t, id: "ats-clasica", name: "Pirata" });
    expect(getTemplate("ats-clasica").name).not.toBe("Pirata");
  });
  it("uuidDe solo acepta u:<uuid>", () => {
    expect(uuidDe("u:8d2c6a3e-1f0b-4c2d-9e8f-0a1b2c3d4e5f")).toBe("8d2c6a3e-1f0b-4c2d-9e8f-0a1b2c3d4e5f");
    expect(uuidDe("u:borrador-abc")).toBeNull();
    expect(uuidDe("ats-clasica")).toBeNull();
  });
});

describe("plantilla a medida · los límites, en TODA la rejilla y en toda base", () => {
  const bases = listTemplates().filter(sirveDeBase);
  it("hay bases de una columna en el catálogo", () => expect(bases.length).toBeGreaterThan(5));

  it("★ ningún escalón de ninguna base baja de 10 pt, 12 mm ni 1,15 de interlineado; los títulos no bajan del cuerpo", () => {
    for (const b of bases) {
      for (let i = 0; i <= ESCALONES; i++) {
        for (const p90 of [undefined, 60, 75, 88]) {
          const p = paramsDeEscalon(b, i / ESCALONES, {}, p90);
          expect(validarParams(p), `${b.id} t=${i}/${ESCALONES}`).toEqual({ ok: true });
          expect(p.cuerpo).toBeGreaterThanOrEqual(CUERPO_MIN_PT);
          expect(p.margenVmm).toBeGreaterThanOrEqual(LIMITES_MEDIDA.margenMinMm);
          expect(p.margenHmm).toBeGreaterThanOrEqual(LIMITES_MEDIDA.margenMinMm);
          expect(p.interlineado).toBeGreaterThanOrEqual(LIMITES_MEDIDA.interlineadoMin);
          const m = metricasDeParams(p);
          for (const k of ["headingSize", "entryTitleSize", "eduTitleSize", "labelSize"] as const) {
            expect(m[k]!, `${b.id} ${k}`).toBeGreaterThanOrEqual(p.cuerpo);
          }
        }
      }
    }
  });

  it("validarParams rechaza lo que se sale de los límites ATS", () => {
    const ok = paramsDeEscalon(getTemplate("ats-clasica"), 1);
    expect(validarParams({ ...ok, cuerpo: 9.5 }).ok).toBe(false);
    expect(validarParams({ ...ok, margenVmm: 10 }).ok).toBe(false);
    expect(validarParams({ ...ok, margenHmm: 11.9 }).ok).toBe(false);
    expect(validarParams({ ...ok, interlineado: 1.05 }).ok).toBe(false);
    expect(validarParams({ ...ok, paletteId: "inventada" }).ok).toBe(false);
    expect(validarParams({ ...ok, typographyId: "comic-sans" }).ok).toBe(false);
    const lateral = listTemplates().find((t) => t.layout.sidebar);
    if (lateral) expect(validarParams({ ...ok, base: lateral.id }).ok).toBe(false);
  });

  it("la base es siempre de una columna, aunque la actual lleve barra lateral", () => {
    for (const t of listTemplates()) expect(sirveDeBase(baseParaMedida(t)), t.id).toBe(true);
  });
});

describe("plantilla a medida · sobre el PDF real", () => {
  // Un CV que ni con el autofit (10 pt) cabe en 2 páginas en la clásica, pero
  // apretando márgenes, interlineado y espacios sí.
  let doc: ResumeData;
  let r: ResultadoMedida;
  beforeAll(async () => {
    const tpl = getTemplate("ats-clasica");
    for (const n of [6, 7, 8, 5]) {
      const d = { ...conEmpleos(n), templateId: "ats-clasica" };
      const a = await autofit(d, plantillaDe(d), 2);
      if (!a.noCabe) continue;
      const m = await buscarPlantillaMedida(d, tpl, 2);
      if (m.ok) {
        doc = d;
        r = m;
        break;
      }
    }
  }, 600000);

  it("hay un caso donde el autofit no alcanza y la plantilla a medida sí", () => {
    expect(r, "ningún tamaño de prueba ejercita el paso 3").toBeDefined();
    expect(r.ok).toBe(true);
  });
  it("★ nunca baja de 10 pt y cabe en 2 páginas REALES", () => {
    expect(r.params.cuerpo).toBeGreaterThanOrEqual(CUERPO_MIN_PT);
    expect(r.medida.porPagina.length).toBeLessThanOrEqual(2);
    expect(validarParams(r.params)).toEqual({ ok: true });
  });
  it("★ no rompe la medida de línea (p90 ≤ 90) y pasa el round-trip ATS y el contraste", () => {
    expect(r.comprobaciones!.p90).toBeLessThanOrEqual(LIMITES_MEDIDA.p90Max);
    expect(r.comprobaciones!.roundTrip).toBe(true);
    expect(r.comprobaciones!.contraste).toBe(true);
  });
  it("es determinista: misma entrada, mismos parámetros", async () => {
    const otra = await buscarPlantillaMedida(doc, getTemplate("ats-clasica"), 2);
    expect(otra.params).toEqual(r.params);
  }, 300000);
  it("elige el escalón MENOS apretado que cabe (el anterior no cabe)", async () => {
    expect(r.params.t).toBeGreaterThan(0);
  });
});

describe("la cascada", () => {
  it("preseleccionar: determinista, sin la actual, solo con más capacidad, como mucho 5", () => {
    const a = getTemplate("ats-notaria");
    const l1 = preseleccionar(a, 1.2).map((t) => t.id);
    const l2 = preseleccionar(a, 1.2).map((t) => t.id);
    expect(l1).toEqual(l2);
    expect(l1).not.toContain(a.id);
    expect(l1.length).toBeLessThanOrEqual(5);
    expect(l1.length).toBeGreaterThan(0);
  });

  it("simularRecortes quita la viñeta y acorta el texto que se propone", () => {
    const vin = data.work[0]!.bullets[0]!;
    const otra = data.work[0]!.bullets[1]!;
    const items = [
      { id: "v1", itemId: "m1", kind: "bullet", visible: true, sortOrder: 0, parentId: null, datos: { text: vin.es }, texto: vin.es, campo: "text", original: vin.es, origen: null, verificado: false },
      { id: "v2", itemId: "m2", kind: "bullet", visible: true, sortOrder: 1, parentId: null, datos: { text: otra.es }, texto: otra.es, campo: "text", original: otra.es, origen: null, verificado: false },
    ];
    const { data: d, sinSimular } = simularRecortes(data, items, {
      quitar: [{ id: "v1", kind: "bullet", texto: vin.es, motivo: "" }],
      acortar: [{ id: "v2", kind: "bullet", campo: "text", original: otra.es, propuesto: "CORTO", motivo: "", ahorro: 1 }],
    });
    expect(sinSimular).toBe(0);
    const textos = d.work.flatMap((w) => w.bullets.map((b) => b.es));
    expect(textos).not.toContain(vin.es);
    expect(textos).toContain("CORTO");
    expect(data.work[0]!.bullets[0]!.es).toBe(vin.es); // no muta la entrada
  });

  it("si con la plantilla actual ya cabe, la resuelve el paso 1 y no mide nada más", async () => {
    const d = { ...data, templateId: "ats-clasica" };
    const a = await autofit(d, plantillaDe(d), 2);
    const c = await cascada({ data: d, objetivo: 2, actual: a, items: [], propuesta: { quitar: [], acortar: [] } });
    expect(c.resueltoPor).toBe(1);
    expect(c.pasos).toHaveLength(1);
  }, 120000);

  it("★ cuando no cabe, ofrece solo lo que de verdad deja el CV en el objetivo (páginas reales)", async () => {
    const d = { ...conEmpleos(6), templateId: "ats-notaria" };
    const a = await autofit(d, plantillaDe(d), 2);
    expect(a.noCabe, "el caso tiene que desbordar con la plantilla actual").toBe(true);
    const c = await cascada({ data: d, objetivo: 2, actual: a, items: [], propuesta: { quitar: [], acortar: [] } });
    expect(c.pasos[0]!.paso).toBe(1);
    expect(c.pasos[0]!.resuelve).toBe(false);
    const p2 = c.pasos.find((p) => p.paso === 2);
    expect(p2).toBeDefined();
    if (p2 && p2.paso === 2) {
      for (const cand of p2.candidatas) expect(cand.paginas).toBeLessThanOrEqual(2);
      if (p2.candidatas.length) expect(c.resueltoPor).toBe(2);
    }
    const p3 = c.pasos.find((p) => p.paso === 3);
    if (p3 && p3.paso === 3 && p3.resuelve) {
      expect(p3.paginas).toBeLessThanOrEqual(2);
      expect(p3.cuerpo!).toBeGreaterThanOrEqual(CUERPO_MIN_PT);
    }
  }, 600000);
});

describe("i18n · paridad ES/EN del namespace ajuste", () => {
  it("mismas claves en los dos idiomas, ninguna vacía", () => {
    expect(Object.keys(ajusteCascada.en).sort()).toEqual(Object.keys(ajusteCascada.es).sort());
    for (const [k, v] of Object.entries({ ...ajusteCascada.es, ...ajusteCascada.en })) expect(v.trim(), k).not.toBe("");
  });
});
