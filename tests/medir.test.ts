import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDocumentProxy } from "unpdf";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import {
  ALTO_LETTER_PT,
  altoCaja,
  enPuntos,
  lineasDe,
  lineasPorPagina,
  lineasQueCaben,
  lineasQueSobran,
  medirPdf,
} from "../src/lib/cv/medir";
import { getTemplate, resolveMetrics } from "../src/lib/cv/templates";
import type { ResumeData } from "../src/lib/cv/resume";

/**
 * EL MEDIDOR, AUDITADO. Este archivo no comprueba que medir.ts "funcione": comprueba
 * las cuatro maneras concretas en que una utilidad de medida miente sin enterarse.
 *
 *   1. Convertir mal una unidad y devolver un número plausible (un margen en mm
 *      tratado como puntos son 20 pt donde había 56,7: el error no se ve, solo
 *      desplaza todas las cuentas un 65 %).
 *   2. Reconstruir líneas PERDIENDO texto — agrupar por Y y quedarse con un run.
 *   3. Reconstruir líneas SIN ORDEN — el content stream de un PDF no está en orden
 *      de lectura, y una fila con las fechas a la derecha lo demuestra.
 *   4. Destruir lo que mide (pdf.js transfiere el buffer al worker).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, "../src/lib/cv/fixtures");
const data = JSON.parse(readFileSync(path.join(fx, "datos-ejemplo.json"), "utf8")) as ResumeData;

const CLASICA = resolveMetrics(getTemplate("ats-clasica").metrics);
const COMPACTA = resolveMetrics(getTemplate("ats-compacta").metrics);

describe("medir · unidades de página (el error que no se ve)", () => {
  it("1 · convierte las unidades que entiende @react-pdf, y con el factor correcto", () => {
    expect(enPuntos("20mm")).toBeCloseTo(56.6929, 3); // 20 × 72 / 25.4
    expect(enPuntos("32mm")).toBeCloseTo(90.7087, 3);
    expect(enPuntos("2.54cm")).toBeCloseTo(72, 6);
    expect(enPuntos("1in")).toBe(72);
    expect(enPuntos("18pt")).toBe(18);
    expect(enPuntos("18px")).toBe(18); // @react-pdf trabaja a 72 dpi
    expect(enPuntos("18")).toBe(18); // sin unidad = puntos
    expect(enPuntos(18)).toBe(18);
    expect(enPuntos("-4mm")).toBeCloseTo(-11.3386, 3);
  });

  it("2 · una unidad que NO sabe convertir da NaN, nunca cero ni el número pelado", () => {
    // Devolver 0 sería lo cómodo y lo peligroso: un margen de "20em" pasaría por un
    // documento a sangre y el cálculo saldría bonito y falso.
    for (const raro of ["20em", "20%", "20rem", "veinte", "", "mm", "20 30mm", "1e3mm"]) {
      expect(enPuntos(raro), `"${raro}" debería ser incalculable`).toBeNaN();
    }
  });

  it("3 · el alto de caja de la clásica es el 678,6 pt del contrato (LETTER − 2×20 mm)", () => {
    expect(altoCaja(CLASICA)).toBeCloseTo(678.614, 2);
    expect(ALTO_LETTER_PT - 2 * enPuntos("20mm")).toBeCloseTo(altoCaja(CLASICA), 6);
  });

  it("4 · un margen incalculable CONTAMINA el resultado en vez de disimularlo", () => {
    const roto = { ...CLASICA, pageMarginV: "20em" };
    expect(altoCaja(roto)).toBeNaN();
    expect(lineasQueCaben(roto)).toBeNaN();
  });
});

describe("medir · cuántas líneas caben", () => {
  it("1 · la cuenta es caja de texto ÷ alto de línea del cuerpo, hacia abajo", () => {
    // Clásica: 678,614 / (10,5 × 1,25 = 13,125) = 51,7 → 51.
    expect(lineasQueCaben(CLASICA)).toBe(51);
    // Compacta aprieta la línea a 11,5 pt: 678,614 / 11,5 = 59,0 → 59.
    expect(lineasQueCaben(COMPACTA)).toBe(59);
    expect(lineasQueCaben(CLASICA)).toBeLessThan(lineasQueCaben(COMPACTA));
  });

  it("2 · redondea SIEMPRE hacia abajo (media línea no es una línea)", () => {
    const m = { ...CLASICA, bodySize: 10, bodyLeading: 1.2 }; // 12 pt exactos
    expect(lineasQueCaben(m)).toBe(Math.floor(678.614 / 12)); // 56
    expect(lineasQueCaben({ ...m, bodyLeading: 1.199 })).toBeGreaterThanOrEqual(56);
  });

  it("3 · un cuerpo de cero no devuelve infinitas líneas", () => {
    // Un dato corrupto (una métrica a medio construir) no puede producir "te caben
    // Infinity líneas", que es la clase de número que se cuela hasta la pantalla.
    for (const roto of [0, -3, NaN]) {
      const n = lineasQueCaben({ ...CLASICA, bodySize: roto });
      expect(Number.isFinite(n), `bodySize ${roto} → ${n}`).toBe(true);
      expect(n).toBe(0);
    }
  });

  it("4 · A4 da más líneas que LETTER con la misma métrica (el alto es un argumento)", () => {
    expect(lineasQueCaben(CLASICA, 841.89)).toBeGreaterThan(lineasQueCaben(CLASICA, ALTO_LETTER_PT));
  });
});

describe("medir · reconstrucción de líneas sobre un PDF de verdad", () => {
  let pdfBuf: Uint8Array;
  let paginas: string[][];

  beforeAll(async () => {
    pdfBuf = new Uint8Array(await renderResumeToBuffer(data, { locale: "es", onePage: false }));
    paginas = await lineasPorPagina(pdfBuf);
  }, 120000);

  it("1 · una página por página, y coinciden con las que dice el propio PDF", async () => {
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuf));
    expect(paginas.length).toBe(pdf.numPages);
    expect(paginas.length).toBe(2); // el golden son dos páginas
    for (const p of paginas) expect(p.length).toBeGreaterThan(5);
  });

  it("2 · NO destruye el buffer que mide (pdf.js lo transfiere al worker)", async () => {
    // Este test nació de un DataCloneError real: medir dos veces el mismo PDF fallaba
    // porque el primer getDocumentProxy dejaba el buffer con largo 0. Sin la copia
    // interna, la segunda llamada revienta o devuelve vacío.
    expect(pdfBuf.length).toBeGreaterThan(0);
    const otra = await lineasPorPagina(pdfBuf);
    expect(otra).toEqual(paginas);
    expect(pdfBuf.length).toBeGreaterThan(0);
  }, 120000);

  it("3 · la versión plana es exactamente la concatenación de las páginas", async () => {
    expect(await lineasDe(pdfBuf)).toEqual(paginas.flat());
  }, 120000);

  it("4 · ninguna línea sale vacía, con blancos dobles ni con bordes en blanco", () => {
    for (const l of paginas.flat()) {
      expect(l.length, "línea vacía colada en el resultado").toBeGreaterThan(0);
      expect(l, `blancos sin normalizar: ${JSON.stringify(l)}`).not.toMatch(/\s\s|^\s|\s$/);
    }
  });

  it("5 · AGRUPA por coordenada Y: dos runs a la misma altura son UNA línea", () => {
    // La línea de habilidades son dos runs distintos —el rótulo del grupo en negrita
    // y sus items— a la misma Y y a X distintas (90,7 y 148,5 en la clásica). Si el
    // reconstructor no agrupara por Y saldrían como dos líneas de 10 y 27 caracteres,
    // ninguna llegaría al mínimo de 30 y la medida de caracteres por línea estaría
    // subestimada justo donde más importa.
    const hab = paginas.flat().find((l) => l.includes("Go, Python, SQL, TypeScript"));
    expect(hab, "no se encontró la línea de lenguajes").toBeDefined();
    expect(hab, "el rótulo del grupo se quedó fuera de su línea").toContain("Lenguajes:");
  });

  it("6 · ORDENA por coordenada X, no por orden de emisión del content stream", () => {
    // El orden del content stream de un PDF no tiene por qué ser el de lectura. Si el
    // reconstructor respetara el stream en vez de la X, esto se caería el día que
    // @react-pdf cambie el orden en que emite los runs de un párrafo.
    const hab = paginas.flat().find((l) => l.includes("Go, Python, SQL, TypeScript"))!;
    expect(hab.indexOf("Lenguajes:")).toBe(0);
    expect(hab.indexOf("Lenguajes:")).toBeLessThan(hab.indexOf("Go, Python"));
  });

  /**
   * ⚠ LO QUE ESTE TEST DOCUMENTA Y NO ARREGLA. Se intentó anclar el caso 5 en la fila
   * del cargo y sus fechas (`erow`, que declara `alignItems: "baseline"`) y NO
   * agrupan: salen en líneas distintas. La causa está medida —yoga no conoce la línea
   * base de un nodo de texto de @react-pdf y alinea por la caja— y es la misma por la
   * que la cabecera en línea acabó siendo un run anidado y no una fila flex. No se
   * toca `erow` aquí: mover un solo punto de esa fila cambiaría los bytes del PDF por
   * defecto, que está atado al golden. Queda escrito para que el próximo no lo
   * descubra desde cero.
   */
  it("7 · las fechas de `erow` NO comparten línea con su cargo (defecto conocido)", () => {
    const soloFechas = paginas.flat().find((l) => l === "mar 2022 – hoy");
    expect(soloFechas, "si esto cambia, `erow` empezó a alinear líneas base de verdad").toBeDefined();
  });

  it("8 · NO PIERDE texto: cada dato del master aparece dentro de alguna línea", () => {
    // El fallo silencioso de un agrupador por Y es quedarse con un run y tirar los
    // demás. Se comprueba contra los datos, no contra un total de caracteres.
    const intocables = [
      data.basics.name,
      data.basics.email,
      data.basics.phone,
      ...data.basics.links.map((l) => (typeof l === "string" ? l : l.url)),
      ...data.work.map((w) => w.company),
      ...data.work.flatMap((w) => w.bullets.map((b) => b.es)),
      ...data.education.map((e) => e.org),
      ...data.skills.map((s) => s.items.es),
    ];
    const todas = paginas.flat();
    for (const dato of intocables) {
      const esperado = dato.replace(/\s+/g, " ").trim();
      // Puede estar partido entre dos líneas por el ajuste de párrafo: se acepta si
      // alguna línea lo contiene entero o si la unión del documento lo contiene.
      const suelto = todas.some((l) => l.includes(esperado));
      const unido = todas.join(" ").includes(esperado);
      expect(suelto || unido, `el medidor pierde: "${esperado}"`).toBe(true);
    }
  });
});

describe("medir · la medida completa y lo que sobra", () => {
  it("1 · medirPdf cuadra consigo mismo (total, reparto y capacidad)", async () => {
    const buf = new Uint8Array(await renderResumeToBuffer(data, { locale: "es", onePage: false }));
    const med = await medirPdf(buf, CLASICA);
    expect(med.porPagina).toEqual(med.paginas.map((p) => p.length));
    expect(med.total).toBe(med.porPagina.reduce((a, b) => a + b, 0));
    expect(med.caben).toBe(lineasQueCaben(CLASICA));
    expect(med.capacidad).toBe(med.caben * med.paginas.length);
    expect(med.paginas.length).toBe(2);
  }, 120000);

  it("2 · lineasQueSobran dice CUÁNTAS sobran, y en negativo cuánto sitio queda", async () => {
    const buf = new Uint8Array(await renderResumeToBuffer(data, { locale: "es", onePage: false }));
    const med = await medirPdf(buf, CLASICA);
    // Contra una sola página sobran líneas; contra las dos que ocupa, no.
    expect(lineasQueSobran(med, 1)).toBe(med.total - med.caben);
    expect(lineasQueSobran(med, 1)).toBeGreaterThan(0);
    expect(lineasQueSobran(med, 2)).toBeLessThan(0);
    // Y NO se redondea a cero: "te caben N líneas más" es un consejo distinto de
    // "justo, justo", y el signo es la única manera de distinguirlos.
    expect(lineasQueSobran(med, 5)).toBe(med.total - 5 * med.caben);
  }, 120000);

  it("3 · un PDF de una sola página se mide como una sola página", async () => {
    const buf = new Uint8Array(await renderResumeToBuffer(data, { locale: "es", onePage: true }));
    const med = await medirPdf(buf, CLASICA);
    expect(med.paginas.length).toBe(1);
    expect(med.capacidad).toBe(med.caben);
    expect(lineasQueSobran(med, 1)).toBeLessThanOrEqual(0); // cabe: no sobra nada
  }, 120000);
});
