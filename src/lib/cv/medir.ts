/**
 * EL MEDIDOR DEL DOCUMENTO — reconstruir las líneas que de verdad salieron del PDF.
 *
 * POR QUÉ EXISTE, y por qué es código de producción y no un ayudante de test. Todo
 * lo que el producto dice sobre el tamaño de un CV ("sobran catorce líneas", "esto
 * no cabe en una página", "la línea se te va a 96 caracteres") es una afirmación
 * sobre el documento RENDERIZADO. Estimarla con anchos de fuente y una regla de tres
 * sobre los márgenes es exactamente el modo de acabar enseñando un número que nadie
 * ha comprobado — y la regla del producto es que ningún número sale sin fuente. La
 * fuente de estos números es el PDF: se abre, se sacan sus items de texto y se
 * reconstruyen las líneas que el ojo recorre.
 *
 * Vivía dentro de tests/medida-linea.test.ts, que fue donde se descubrió que TODA la
 * gama vivía un 20 % por encima del máximo accesible. Se mueve aquí porque hay más
 * de un consumidor (el candado de CI y el aviso de "cuánto sobra" que ve el usuario)
 * y dos copias de esta función serían dos documentos distintos midiéndose el mismo
 * día: el test seguiría verde mientras la app miente.
 *
 * CÓMO SE RECONSTRUYE UNA LÍNEA. Un PDF no guarda líneas: guarda trozos de texto con
 * su matriz de transformación. Los que comparten coordenada Y (transform[5]) están en
 * la misma línea visual, y su orden de lectura es el de la X (transform[4]) — que NO
 * tiene por qué ser el orden en que el generador los escribió. Se agrupa con media
 * unidad de tolerancia porque dos runs de la misma línea con cuerpos distintos (un
 * cargo en negrita y sus fechas más pequeñas al lado) pueden diferir en décimas.
 */

import { getDocumentProxy } from "unpdf";
import type { ResolvedMetrics } from "./templates";

/** Alto de página en puntos. El documento se emite en LETTER (ResumePDF, `size`). */
export const ALTO_LETTER_PT = 792;
export const ALTO_A4_PT = 841.89;

/**
 * Las líneas REALES de un PDF, página a página y en orden de lectura.
 *
 * Devolverlas AGRUPADAS por página, y no en una lista plana, es el punto entero de
 * esta función: "cuántas líneas sobran" solo significa algo si se sabe en qué página
 * cae cada una. La versión plana (`lineasDe`) se queda como atajo para quien mide
 * caracteres por línea, donde la página da igual.
 *
 * ⚠ SE MIDE SOBRE UNA COPIA, y no por prudencia: pdf.js TRANSFIERE el ArrayBuffer a
 * su worker, así que el buffer que le pasas queda DETACHED (largo 0) al volver. Sin
 * la copia, medir un PDF y luego volver a mirarlo —o medirlo dos veces— revienta con
 * un DataCloneError que no menciona en ningún sitio la palabra "buffer". Una función
 * de medida no puede destruir lo que mide.
 */
export async function lineasPorPagina(buf: Uint8Array): Promise<string[][]> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const paginas: string[][] = [];
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
    const lineas: string[] = [];
    for (const [, items] of porY) {
      items.sort((a, b) => a.x - b.x);
      const texto = items.map((i) => i.s).join("").replace(/\s+/g, " ").trim();
      if (texto) lineas.push(texto);
    }
    paginas.push(lineas);
  }
  return paginas;
}

/** Las líneas de todo el documento, sin distinguir página. */
export async function lineasDe(buf: Uint8Array): Promise<string[]> {
  return (await lineasPorPagina(buf)).flat();
}

/**
 * Una medida de página ("20mm", "32mm", "18pt") en puntos PostScript.
 *
 * El contrato de la gama ATS obliga a expresar los márgenes en mm —y un test lo
 * comprueba— pero esta función acepta las unidades que entiende @react-pdf porque
 * la gama visual no tiene esa obligación y un número sin unidad allí son puntos.
 * Si la unidad es desconocida devuelve NaN a propósito: un margen que no se sabe
 * convertir tiene que romper el cálculo, no colarse valiendo cero.
 */
export function enPuntos(medida: string | number): number {
  if (typeof medida === "number") return medida;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*([a-z%]*)\s*$/i.exec(medida);
  if (!m) return NaN;
  const v = parseFloat(m[1]!);
  switch (m[2]!.toLowerCase()) {
    case "":
    case "pt":
    case "px": // @react-pdf trabaja a 72 dpi: un px es un punto
      return v;
    case "mm":
      return (v * 72) / 25.4;
    case "cm":
      return (v * 72) / 2.54;
    case "in":
      return v * 72;
    default:
      return NaN; // %, em, vh… no tienen sentido como margen de página
  }
}

/** El alto de la CAJA DE TEXTO: la página menos sus dos márgenes verticales. */
export function altoCaja(m: ResolvedMetrics, altoPagina = ALTO_LETTER_PT): number {
  return altoPagina - 2 * enPuntos(m.pageMarginV);
}

/**
 * Cuántas líneas de CUERPO caben en una página con esta métrica.
 *
 * Es una cota superior honesta, no una promesa: cuenta la caja de texto en alturas
 * de línea del cuerpo (`bodySize × bodyLeading`) e ignora a propósito el aire de
 * sección, la cabecera y las entradas que no se parten entre páginas. Sirve para lo
 * que sirve — decirle a alguien "sobran ~14 líneas" — y no para prometer un salto de
 * página, que lo decide el motor de maquetación y solo se sabe renderizando.
 */
export function lineasQueCaben(m: ResolvedMetrics, altoPagina = ALTO_LETTER_PT): number {
  const alto = m.bodySize * m.bodyLeading;
  if (!(alto > 0)) return 0;
  return Math.floor(altoCaja(m, altoPagina) / alto);
}

export interface MedidaPdf {
  /** Las líneas reales, página a página y en orden de lectura. */
  paginas: string[][];
  /** Cuántas líneas trae cada página (el reparto real que hizo el motor). */
  porPagina: number[];
  /** Total de líneas del documento. */
  total: number;
  /** Cuántas líneas de cuerpo caben en UNA página con esta métrica. */
  caben: number;
  /** Capacidad del documento tal y como salió: `caben` × páginas emitidas. */
  capacidad: number;
}

/**
 * La medida completa de un PDF: lo que trae y lo que le cabe. Las dos mitades juntas
 * porque separadas invitan al error de medir un PDF con la métrica de otra plantilla.
 */
export async function medirPdf(
  buf: Uint8Array,
  m: ResolvedMetrics,
  altoPagina = ALTO_LETTER_PT,
): Promise<MedidaPdf> {
  const paginas = await lineasPorPagina(buf);
  const porPagina = paginas.map((p) => p.length);
  const caben = lineasQueCaben(m, altoPagina);
  return {
    paginas,
    porPagina,
    total: porPagina.reduce((a, b) => a + b, 0),
    caben,
    capacidad: caben * paginas.length,
  };
}

/**
 * Cuántas líneas SOBRAN para que el documento quepa en `paginasObjetivo`. Negativo
 * significa que sobra sitio, y se devuelve tal cual: redondear a cero convertiría
 * "te caben nueve líneas más" en "justo, justo", que es un consejo distinto.
 */
export function lineasQueSobran(medida: MedidaPdf, paginasObjetivo: number): number {
  return medida.total - medida.caben * paginasObjetivo;
}
