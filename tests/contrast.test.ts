import { describe, it, expect } from "vitest";
import {
  AA_LARGE,
  AA_NORMAL,
  contrastRatio,
  meetsAA,
  meetsAAA,
  parseHex,
  ratioText,
  relativeLuminance,
} from "../src/lib/cv/contrast";

/**
 * La matemática de contraste, contra valores CONOCIDOS. No es un test de adorno:
 * de esta función depende que una paleta entre o no al catálogo de plantillas, así
 * que si la fórmula deriva, el producto empieza a publicar CVs ilegibles con un
 * sello de "verificado" encima.
 *
 * Anclas: negro/blanco = 21:1 exacto (el máximo posible), y los grises frontera
 * que usa la propia documentación de WCAG — #767676 pasa AA sobre blanco por los
 * pelos (4.54) y #777777, un punto más claro, ya no (4.48).
 */
describe("contraste WCAG · luminancia relativa", () => {
  it("1 · negro = 0 y blanco = 1 (los extremos de la escala)", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBe(1);
  });

  it("2 · el gris medio #808080 NO es 0,5: la curva sRGB no es lineal", () => {
    expect(relativeLuminance("#808080")).toBeCloseTo(0.2159, 4);
  });

  it("3 · la luminancia crece con el claro (monótona)", () => {
    const escala = ["#000000", "#333333", "#767676", "#CCCCCC", "#FFFFFF"];
    const ls = escala.map(relativeLuminance);
    for (let i = 1; i < ls.length; i++) expect(ls[i]!).toBeGreaterThan(ls[i - 1]!);
  });
});

describe("contraste WCAG · ratio", () => {
  it("1 · negro contra blanco = 21:1 EXACTO", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 10);
  });

  it("2 · un color contra sí mismo = 1:1", () => {
    for (const c of ["#000000", "#FFFFFF", "#1F6E5A", "#8C4A1E"]) {
      expect(contrastRatio(c, c)).toBeCloseTo(1, 10);
    }
  });

  it("3 · es simétrico: el orden de los argumentos da igual", () => {
    expect(contrastRatio("#1F6E5A", "#FFFFFF")).toBe(contrastRatio("#FFFFFF", "#1F6E5A"));
  });

  it("4 · grises frontera de la norma: #767676 pasa (4,54) y #777777 no (4,48)", () => {
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(meetsAA(contrastRatio("#767676", "#FFFFFF"))).toBe(true);
    expect(meetsAA(contrastRatio("#777777", "#FFFFFF"))).toBe(false);
  });

  it("5 · #949494 sobre blanco (3,03) solo sirve para texto GRANDE", () => {
    const r = contrastRatio("#949494", "#FFFFFF");
    expect(r).toBeCloseTo(3.03, 2);
    expect(meetsAA(r)).toBe(false);
    expect(meetsAA(r, { large: true })).toBe(true);
  });

  it("6 · #595959 sobre blanco llega a AAA (7,00)", () => {
    const r = contrastRatio("#595959", "#FFFFFF");
    expect(r).toBeCloseTo(7.0, 2);
    expect(meetsAAA(r)).toBe(true);
    expect(meetsAAA(contrastRatio("#767676", "#FFFFFF"))).toBe(false);
  });
});

/**
 * LOS ACENTOS DEL CATÁLOGO, con su ratio clavado al decimal.
 *
 * catalog.ts documenta estos números en un comentario, y un comentario con números
 * es una mentira esperando a que alguien retoque un hex. Aquí se fijan contra la
 * fórmula: si alguien aclara un acento, este test cae y le dice el valor nuevo.
 *
 * (Que TODAS las paletas registradas pasen AA se comprueba en templates.test.ts,
 * recorriendo el registro. Esto de aquí es el ancla numérica de cada una.)
 */
describe("contraste WCAG · los acentos del catálogo, medidos", () => {
  const ACENTOS: [string, string, number][] = [
    ["patina", "#1F6E5A", 6.11],
    ["cobre", "#8C4A1E", 6.75],
    ["acero", "#2A5570", 7.98],
    ["tinta", "#1F2528", 15.52],
    ["granate", "#7A1F35", 10.12],
    ["ciruela", "#563377", 9.83],
    ["oliva", "#4C5320", 8.19],
    ["marino", "#1B3A6B", 11.27],
    ["pizarra", "#3A4750", 9.56],
  ];

  it("1 · cada acento da EXACTAMENTE el ratio que el catálogo dice que da", () => {
    for (const [id, hex, esperado] of ACENTOS) {
      const r = contrastRatio(hex, "#FFFFFF");
      expect(r, `paleta ${id}: ${hex} mide ${ratioText(r)}, no ${esperado}:1`).toBeCloseTo(esperado, 2);
    }
  });

  it("2 · todos pasan AA de texto normal, y con holgura (el más justo va a 6:1)", () => {
    for (const [id, hex] of ACENTOS) {
      const r = contrastRatio(hex, "#FFFFFF");
      expect(meetsAA(r), `paleta ${id} en ${ratioText(r)}`).toBe(true);
      // Un CV se fotocopia, se imprime en láser barata y se lee en pantallas malas:
      // el mínimo legal (4,5) es suelo, no objetivo.
      expect(r, `paleta ${id}: ${ratioText(r)} es pasar por los pelos`).toBeGreaterThan(6);
    }
  });

  it("3 · las tintas neutras del sistema llegan a AAA sobre el papel", () => {
    expect(contrastRatio("#14181A", "#FFFFFF")).toBeCloseTo(17.87, 2); // grafito (cuerpo)
    expect(meetsAAA(contrastRatio("#454B49", "#FFFFFF"))).toBe(true); // apagado (fechas)
  });
});

describe("contraste WCAG · umbrales y parseo", () => {
  it("1 · los umbrales AA son 4,5 (normal) y 3 (grande), y el límite pasa", () => {
    expect(AA_NORMAL).toBe(4.5);
    expect(AA_LARGE).toBe(3);
    expect(meetsAA(4.5)).toBe(true);
    expect(meetsAA(4.49)).toBe(false);
    expect(meetsAA(3, { large: true })).toBe(true);
    expect(meetsAA(2.99, { large: true })).toBe(false);
  });

  it("2 · acepta #RGB, #RRGGBB y sin almohadilla (mismo resultado)", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("#1F6E5A")).toEqual({ r: 0x1f, g: 0x6e, b: 0x5a });
    expect(relativeLuminance("#f00")).toBeCloseTo(relativeLuminance("#FF0000"), 10);
  });

  it("3 · un hex inválido LANZA (un color mal escrito es un bug, no un caso a tolerar)", () => {
    for (const malo of ["", "#12", "#12345", "rojo", "#GGGGGG", "#1F6E5AA"]) {
      expect(() => parseHex(malo), `debería lanzar: "${malo}"`).toThrow();
    }
  });

  it("4 · ratioText redondea a dos decimales para los informes", () => {
    expect(ratioText(6.10559)).toBe("6.11:1");
    expect(ratioText(21)).toBe("21:1");
  });
});
