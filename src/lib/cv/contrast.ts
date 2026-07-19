/**
 * Contraste WCAG 2.x — la matemática, sin adornos.
 *
 * Existe por una razón concreta: ninguna paleta entra al catálogo de plantillas
 * "porque se ve bien". Entra porque su acento sobre el papel del documento pasa
 * AA, y eso lo comprueba un test recorriendo TODAS las paletas registradas
 * (tests/templates.test.ts). Un CV se imprime, se fotocopia y se lee en pantallas
 * malas: el contraste no es decoración, es legibilidad.
 *
 * Fórmula: WCAG 2.1 §1.4.3 (contraste mínimo) + la definición de luminancia
 * relativa de la misma norma. Sin dependencias.
 */

/** Componentes 0–255 de un color. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parsea `#RGB` o `#RRGGBB` (con o sin `#`). Lanza si no es un hex válido: un
 * color mal escrito en el catálogo es un bug de diseño, no un caso a tolerar en
 * silencio — mejor que reviente el test que que se publique gris sobre gris.
 */
export function parseHex(hex: string): Rgb {
  const h = (hex ?? "").trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`hex inválido: "${hex}"`);
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Linealiza un canal sRGB 0–255 → 0–1 (WCAG: umbral 0.03928, gamma 2.4). */
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa (0 = negro, 1 = blanco). WCAG 2.1, definición normativa. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Ratio de contraste entre dos colores: (L_claro + 0.05) / (L_oscuro + 0.05).
 * Es simétrico (el orden de los argumentos da igual) y va de 1 a 21.
 * Referencia dura: negro contra blanco = 21.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const a = relativeLuminance(hex1);
  const b = relativeLuminance(hex2);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Umbrales AA de WCAG 2.1 §1.4.3. `large` = ≥18pt, o ≥14pt en negrita. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

/** ¿El ratio pasa AA? Texto normal 4.5:1; texto grande 3:1. */
export function meetsAA(ratio: number, opts: { large?: boolean } = {}): boolean {
  return ratio >= (opts.large ? AA_LARGE : AA_NORMAL);
}

/** Umbrales AAA (§1.4.6), por si alguna paleta quiere presumir de verdad. */
export function meetsAAA(ratio: number, opts: { large?: boolean } = {}): boolean {
  return ratio >= (opts.large ? 4.5 : 7);
}

/** Redondeo a 2 decimales, para informes y mensajes de test legibles. */
export function ratioText(ratio: number): string {
  return `${Math.round(ratio * 100) / 100}:1`;
}
