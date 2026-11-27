/**
 * «PLANTILLA A MEDIDA» — el último paso de la cascada de «Ajustar páginas» (DA-A1).
 *
 * Cuando ni el autofit con los recortes propuestos ni otra plantilla del catálogo
 * dejan el CV en las páginas pedidas, el MOTOR (no la IA) arma una plantilla propia
 * del usuario: parte de una plantilla del catálogo de UNA columna y aprieta, en este
 * orden y siempre dentro de los límites ATS, márgenes, interlineado, espacios, escala
 * de títulos y cuerpo. Nada de esto inventa texto: el documento es el mismo, solo
 * cambia la caja donde cae.
 *
 * ★ BÚSQUEDA DETERMINISTA. Todos los parámetros se mueven juntos con UN solo grado
 * de compresión `t` (0 = la plantilla base tal cual, 1 = todo en su límite) sobre una
 * rejilla fija de 9 escalones. Cada parámetro es monótono en `t`, así que «cabe» es
 * monótono y basta una binaria: se elige el escalón MENOS apretado que cabe. Mismos
 * datos → misma plantilla, siempre.
 *
 * ★ LOS LÍMITES (los mismos del núcleo ATS; ninguno se negocia):
 *   · cuerpo ≥ 10 pt (CUERPO_MIN_PT) · interlineado ≥ 1,15 · márgenes ≥ 12 mm;
 *   · la MEDIDA DE LÍNEA no pasa del máximo: la caja se ensancha con `t` desde la
 *     medida de la base hasta un objetivo de p90 ≤ 86 caracteres (calibrado con un
 *     render de la base), y además se comprueba en el PDF: p90 ≤ 90;
 *   · solo familias y paletas registradas; siempre a una columna, sin foto;
 *   · títulos nunca por debajo del cuerpo (la jerarquía no se aplasta).
 * Y se ACEPTA solo si el PDF resultante pasa el round-trip ATS (el texto plano sale
 * del PDF, en orden), la medida y el contraste AA de la paleta.
 */

import { extractText, getDocumentProxy } from "unpdf";
import { renderResumeToBuffer, type RenderOpts } from "./ResumePDF";
import { lineasDe, medirPdf, lineasQueSobranReales, type MedidaPdf } from "./medir";
import { toPlainText, type ResumeData } from "./resume";
import { AA_NORMAL, contrastRatio } from "./contrast";
import {
  CUERPO_MIN_PT,
  FACTOR_ESPACIO_COMPACTO,
  MODOS_DENSIDAD,
  PREFIJO_PLANTILLA_USUARIO,
  aplicarModos,
  normalizarModos,
  plantillaDeEspec,
  getPalette,
  getTemplate,
  getTypography,
  listTemplates,
  paperOf,
  registrarPlantillaUsuario,
  resolveMetrics,
  type CvTemplate,
  type ModoDensidad,
  type ResolvedMetrics,
  type TemplateMetrics,
} from "./templates";

// ── Límites ──────────────────────────────────────────────────────────────────
export const LIMITES_MEDIDA = {
  cuerpoMin: CUERPO_MIN_PT,
  interlineadoMin: 1.15,
  margenMinMm: 12,
  /** el aire entre bloques no baja de la mitad del de la plantilla */
  espacioMin: 0.5,
  /** los títulos encogen como mucho un 15 % por encima de lo que encoja el cuerpo */
  titulosMin: 0.85,
  /** medida de línea: percentil 90 de caracteres por línea de cuerpo */
  p90Max: 90,
  /** una línea de menos de 30 caracteres no es cuerpo (rótulo, fecha, contacto) */
  lineaCuerpoMin: 30,
  /** la medida a la que se ensancha la caja en el límite (holgura bajo p90Max) */
  p90Objetivo: 86,
} as const;

/** Escalones de la rejilla de compresión: t = 0, 1/8, …, 1. */
export const ESCALONES = 8;

const ANCHO_LETTER_PT = 612;
const mmAPt = (mm: number) => (mm * 72) / 25.4;
const ptAMm = (pt: number) => (pt * 25.4) / 72;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Los parámetros de una plantilla a medida: lo que se guarda en `plantillas_usuario.params`. */
export interface ParamsMedida {
  v: 1;
  /** plantilla del catálogo de la que parte (una columna, sin foto) */
  base: string;
  /** grado de compresión elegido por la búsqueda (0…1), para poder auditarlo */
  t: number;
  cuerpo: number;
  interlineado: number;
  margenVmm: number;
  margenHmm: number;
  /** factor sobre el aire entre secciones, entradas y viñetas */
  espacio: number;
  /** factor sobre la escala de títulos (además de la proporción del cuerpo) */
  titulos: number;
  paletteId: string;
  typographyId: string;
  /**
   * Modos de densidad encendidos (EspecPlantilla). Opcional: las filas guardadas
   * antes de que existieran no lo traen y salen como entonces (sin modos).
   */
  modos?: ModoDensidad[];
}

/** Medida de un margen de la plantilla en mm (acepta mm, pt, cm, in). */
function margenMm(v: string): number {
  const x = /^\s*(\d+(?:\.\d+)?)\s*(mm|pt|cm|in)?\s*$/i.exec(v);
  if (!x) return NaN;
  const n = parseFloat(x[1]!);
  const u = (x[2] ?? "pt").toLowerCase();
  return u === "mm" ? n : u === "cm" ? n * 10 : u === "in" ? n * 25.4 : ptAMm(n);
}

/** ¿Puede esta plantilla del catálogo servir de base? Una columna, sin foto, gama ATS. */
export function sirveDeBase(t: CvTemplate): boolean {
  return t.gama === "ats" && !t.layout.sidebar && !t.layout.photo && t.layout.columns === 1;
}

/**
 * La base de la plantilla a medida: la actual si ya es de una columna; si no, la
 * de una columna del catálogo que más se le parece (misma tipografía, luego misma
 * paleta), y en último caso la de por defecto.
 */
export function baseParaMedida(actual: CvTemplate): CvTemplate {
  if (sirveDeBase(actual) && !actual.id.startsWith(PREFIJO_PLANTILLA_USUARIO)) return actual;
  const bases = listTemplates().filter(sirveDeBase);
  return (
    bases.find((t) => t.typography.id === actual.typography.id) ??
    bases.find((t) => t.palette.id === actual.palette.id) ??
    getTemplate(null)
  );
}

/** Los parámetros del escalón `t` sobre una base (y la paleta/pareja que pida el documento). */
export function paramsDeEscalon(
  base: CvTemplate,
  t: number,
  sel: { paletteId?: string | null; typographyId?: string | null } = {},
  /** p90 medido con la base tal cual; sin él, la medida se conserva (no se ensancha) */
  p90Base?: number,
  /** modos de densidad encendidos en este escalón */
  modos: readonly ModoDensidad[] = [],
): ParamsMedida {
  const r = resolveMetrics(base.metrics);
  const L = LIMITES_MEDIDA;
  const k = Math.min(1, Math.max(0, t));
  // Rejilla de 0,25 pt (la del autofit), sin pasar nunca del cuerpo de la base.
  const crudo = r.bodySize - k * (r.bodySize - L.cuerpoMin);
  const cuerpo = k === 0 ? r.bodySize : Math.max(L.cuerpoMin, Math.min(r.bodySize, Math.round(crudo * 4) / 4));
  const leadMin = Math.min(r.bodyLeading, L.interlineadoMin);
  const interlineado = r2(r.bodyLeading - k * (r.bodyLeading - leadMin));
  const mV0 = margenMm(r.pageMarginV);
  const margenVmm = r2(Math.max(L.margenMinMm, mV0 - k * (mV0 - L.margenMinMm)));
  // La MEDIDA: con el cuerpo la caja se estrecha (igual que escalarMetricas) y con
  // `t` se ensancha hasta la medida objetivo — nunca más allá de ella.
  const caja0 = ANCHO_LETTER_PT - 2 * mmAPt(margenMm(r.pageMarginH));
  const holgura = p90Base && p90Base > 0 ? Math.max(1, L.p90Objetivo / p90Base) : 1;
  const caja = caja0 * (cuerpo / r.bodySize) * (1 + k * (holgura - 1));
  const margenHmm = r2(Math.max(L.margenMinMm, ptAMm((ANCHO_LETTER_PT - caja) / 2)));
  return {
    v: 1,
    base: base.id,
    t: r2(k),
    cuerpo,
    interlineado,
    margenVmm,
    margenHmm,
    espacio: r2(1 - k * (1 - L.espacioMin)),
    titulos: r2(1 - k * (1 - L.titulosMin)),
    paletteId: (sel.paletteId && getPalette(sel.paletteId)?.id) || base.palette.id,
    typographyId: (sel.typographyId && getTypography(sel.typographyId)?.id) || base.typography.id,
    ...(modos.length ? { modos: normalizarModos(modos) } : null),
  };
}

/**
 * Los modos que de verdad cambian algo sobre esta base, en el orden canónico. Un
 * modo que la base ya cumple (cabecera ya en línea, fechas ya en la columna
 * colgante…) no gasta un escalón de la búsqueda ni se anuncia en la galería.
 */
export function modosUtiles(base: CvTemplate): ModoDensidad[] {
  const antes = JSON.stringify(resolveMetrics(base.metrics));
  return MODOS_DENSIDAD.filter((m) => JSON.stringify(resolveMetrics(aplicarModos(base.metrics, [m]))) !== antes);
}

/** Los límites, comprobados sobre los parámetros (lo que llega de la base también pasa por aquí). */
export function validarParams(p: ParamsMedida): { ok: true } | { ok: false; razon: string } {
  const L = LIMITES_MEDIDA;
  const base = getTemplate(p.base);
  if (base.id !== p.base || !sirveDeBase(base)) return { ok: false, razon: "la base no es una plantilla ATS de una columna" };
  if (!(p.cuerpo >= L.cuerpoMin)) return { ok: false, razon: `cuerpo bajo ${L.cuerpoMin} pt` };
  if (p.cuerpo > base.metrics.bodySize + 1e-9) return { ok: false, razon: "cuerpo por encima del de la base" };
  if (!(p.interlineado >= L.interlineadoMin - 1e-9)) return { ok: false, razon: "interlineado bajo el mínimo" };
  if (!(p.margenVmm >= L.margenMinMm) || !(p.margenHmm >= L.margenMinMm)) return { ok: false, razon: `márgenes bajo ${L.margenMinMm} mm` };
  if (!(p.espacio >= L.espacioMin && p.espacio <= 1)) return { ok: false, razon: "espacios fuera de rango" };
  if (!(p.titulos >= L.titulosMin && p.titulos <= 1)) return { ok: false, razon: "escala de títulos fuera de rango" };
  if (!getPalette(p.paletteId)) return { ok: false, razon: "paleta no registrada" };
  if (!getTypography(p.typographyId)) return { ok: false, razon: "tipografía no registrada" };
  if (p.modos !== undefined && (!Array.isArray(p.modos) || normalizarModos(p.modos).length !== p.modos.length))
    return { ok: false, razon: "modo de densidad desconocido" };
  return { ok: true };
}

/**
 * La métrica de la plantilla a medida, SIN los modos (los pone plantillaDeEspec
 * encima). Los títulos nunca bajan del cuerpo. Con `espacioCompacto` el aire entre
 * secciones y roles ya sale × 0,7 del modo: aquí se frena para que, sumados, no
 * bajen de la mitad del de la base (el mismo suelo de siempre).
 */
export function metricasDeParams(p: ParamsMedida): TemplateMetrics {
  const base = getTemplate(p.base);
  const r = resolveMetrics(base.metrics);
  const k = (p.cuerpo / r.bodySize) * p.titulos;
  const tit = (v: number, piso: number) => r2(Math.max(piso, v * k));
  const esp = (v: number) => r2(v * p.espacio);
  const compacto = normalizarModos(p.modos).includes("espacioCompacto");
  const espBloque = (v: number) =>
    compacto ? r2(v * Math.max(p.espacio, LIMITES_MEDIDA.espacioMin / FACTOR_ESPACIO_COMPACTO)) : esp(v);
  return {
    ...base.metrics,
    bodySize: p.cuerpo,
    bodyLeading: p.interlineado,
    pageMarginV: `${p.margenVmm}mm`,
    pageMarginH: `${p.margenHmm}mm`,
    sectionGap: espBloque(r.sectionGap),
    entryGap: espBloque(r.entryGap),
    summaryGap: esp(r.summaryGap),
    bulletGap: esp(r.bulletGap),
    skillGap: esp(r.skillGap),
    nameSize: tit(r.nameSize, p.cuerpo * 1.5),
    labelSize: tit(r.labelSize, p.cuerpo),
    headingSize: tit(r.headingSize, p.cuerpo),
    entryTitleSize: tit(r.entryTitleSize, p.cuerpo),
    eduTitleSize: tit(r.eduTitleSize, p.cuerpo),
  };
}

/** Un id estable para un borrador (mismos parámetros → mismo id). */
export function idBorrador(p: ParamsMedida): string {
  const s = JSON.stringify(p);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${PREFIJO_PLANTILLA_USUARIO}borrador-${(h >>> 0).toString(36)}`;
}

/** La plantilla completa (y registrada, para que getTemplate la resuelva) de unos parámetros. */
export function plantillaDeParams(p: ParamsMedida, id = idBorrador(p), nombre = "A medida"): CvTemplate {
  const base = getTemplate(p.base);
  // La plantilla a medida ES una EspecPlantilla: base + métricas + modos. El motor
  // de siempre la renderiza; la paleta y la pareja de la variante la sobreescriben
  // como a cualquier otra (resolveTemplate).
  const t = plantillaDeEspec(
    { base: base.id, metricas: metricasDeParams(p), modos: p.modos, paletteId: p.paletteId, typographyId: p.typographyId },
    id,
    nombre,
    `A medida, a partir de «${base.name}»: ${p.cuerpo} pt, márgenes ${p.margenVmm}/${p.margenHmm} mm.`,
  );
  registrarPlantillaUsuario(t);
  return t;
}

// ── Las comprobaciones (las del catálogo, sobre ESTE documento) ──────────────
export interface Comprobaciones {
  roundTrip: boolean;
  /** p90 de caracteres por línea de cuerpo, medido en el PDF */
  p90: number;
  medida: boolean;
  contraste: boolean;
  /** el primer fallo, legible */
  razon?: string;
}

const norm = (x: string) => x.replace(/\s+/g, " ").trim();

/** El round-trip ATS: cada línea del texto plano sale del PDF, EN ORDEN de lectura. */
export async function pasaRoundTrip(data: ResumeData, buf: Uint8Array, locale: RenderOpts["locale"] = "es"): Promise<string | null> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  const extraido = norm(text);
  let cursor = 0;
  for (const linea of toPlainText(data, { locale, onePage: false }).split("\n").map(norm).filter(Boolean)) {
    const i = extraido.indexOf(linea, cursor);
    if (i < 0) return `round-trip ATS: falta o sale fuera de orden «${linea.slice(0, 60)}»`;
    cursor = i + linea.length;
  }
  return null;
}

/** Percentil 90 de caracteres por línea de cuerpo del PDF. */
export async function p90DeLinea(buf: Uint8Array): Promise<number> {
  const largos = (await lineasDe(buf)).map((l) => l.length).filter((n) => n >= LIMITES_MEDIDA.lineaCuerpoMin);
  if (!largos.length) return 0;
  const s = [...largos].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(0.9 * (s.length - 1)))]!;
}

/** Tinta, apagado y acento con AA de texto normal sobre el papel. */
export function pasaContraste(t: CvTemplate): boolean {
  const papel = paperOf(t.palette);
  return [t.palette.ink, t.palette.muted, t.palette.accent].every((c) => contrastRatio(c, papel) >= AA_NORMAL);
}

export async function comprobar(data: ResumeData, t: CvTemplate, buf: Uint8Array, locale: RenderOpts["locale"] = "es"): Promise<Comprobaciones> {
  const fallo = await pasaRoundTrip({ ...data, templateId: t.id }, buf, locale);
  const p90 = await p90DeLinea(buf);
  const medida = p90 <= LIMITES_MEDIDA.p90Max;
  const contraste = pasaContraste(t);
  const razon =
    fallo ?? (!medida ? `medida de línea: p90 ${p90} > ${LIMITES_MEDIDA.p90Max}` : !contraste ? "contraste bajo AA" : undefined);
  return { roundTrip: !fallo, p90, medida, contraste, razon };
}

// ── La búsqueda ──────────────────────────────────────────────────────────────
export interface ResultadoMedida {
  /** cabe en el objetivo Y pasa las tres comprobaciones */
  ok: boolean;
  params: ParamsMedida;
  plantilla: CvTemplate;
  buf: Uint8Array;
  medida: MedidaPdf;
  paginas: number;
  sobran: number;
  comprobaciones: Comprobaciones | null;
  /** renders hechos (el coste de la búsqueda) */
  renders: number;
  razon?: string;
}

export interface MedidaDeps {
  render: (data: ResumeData, opts: RenderOpts) => Promise<Uint8Array>;
  medir: (buf: Uint8Array, m: ResolvedMetrics) => Promise<MedidaPdf>;
  comprobar: typeof comprobar;
}

const DEPS: MedidaDeps = {
  render: async (data, opts) => new Uint8Array(await renderResumeToBuffer(data, opts)),
  medir: (buf, m) => medirPdf(buf, m),
  comprobar,
};

/**
 * Busca la plantilla a medida MENOS apretada con la que `data` cabe en `objetivo`
 * páginas reales. Devuelve el escalón más apretado (y `ok:false`) si ni así cabe.
 *
 * ★ PRIMERO LA DENSIDAD, DESPUÉS LAS MÉTRICAS (DA-A7). La escalera tiene dos
 * tramos: los modos de densidad útiles para esta base, encendidos de uno en uno y
 * acumulados (no cambian la lectura: cuerpo, interlineado y márgenes intactos), y
 * después, con todos ellos puestos, los 8 escalones de métricas de siempre. Cada
 * peldaño aprieta más que el anterior, así que «cabe» sigue siendo monótono y la
 * búsqueda sigue siendo binaria y determinista.
 */
export async function buscarPlantillaMedida(
  data: ResumeData,
  actual: CvTemplate,
  objetivo: number,
  opts: RenderOpts = {},
  deps: MedidaDeps = DEPS,
): Promise<ResultadoMedida> {
  const base = baseParaMedida(actual);
  const sel = { paletteId: opts.paletteId ?? data.paletteId, typographyId: opts.typographyId ?? data.typographyId };
  const modos = modosUtiles(base);
  const M = modos.length;
  let renders = 0;
  const cache = new Map<number, Omit<ResultadoMedida, "ok" | "comprobaciones" | "renders">>();
  let p90Base: number | undefined;

  // Peldaño → parámetros: 0…M = los M primeros modos sin tocar métricas;
  // M+1…M+ESCALONES = todos los modos y el escalón de métricas correspondiente.
  const probar = async (paso: number) => {
    const hit = cache.get(paso);
    if (hit) return hit;
    const params =
      paso <= M
        ? paramsDeEscalon(base, 0, sel, undefined, modos.slice(0, paso))
        : paramsDeEscalon(base, (paso - M) / ESCALONES, sel, p90Base, modos);
    const plantilla = plantillaDeParams(params);
    // El documento se renderiza CON la plantilla a medida y sin overrides de paleta
    // ni pareja (ya van dentro): lo mismo que verá el usuario al elegirla.
    const doc: ResumeData = { ...data, templateId: plantilla.id, paletteId: undefined, typographyId: undefined };
    const buf = await deps.render(doc, { locale: opts.locale });
    renders += 1;
    const medida = await deps.medir(buf, resolveMetrics(plantilla.metrics));
    const r = { params, plantilla, buf, medida, paginas: medida.porPagina.length, sobran: lineasQueSobranReales(medida, objetivo) };
    cache.set(paso, r);
    return r;
  };
  const doc: ResumeData = { ...data, paletteId: undefined, typographyId: undefined };
  const cerrar = async (r: Awaited<ReturnType<typeof probar>>): Promise<ResultadoMedida> => {
    const val = validarParams(r.params);
    const comprobaciones = await deps.comprobar(doc, r.plantilla, r.buf, opts.locale);
    const razon = !val.ok ? val.razon : comprobaciones.razon;
    return { ...r, ok: val.ok && !razon, comprobaciones, renders, razon };
  };
  /** El menor peldaño de (lo, hi] que cabe, sabiendo que `lo` no cabe y `hi` sí. */
  const binaria = async (lo: number, hi: number, mejor: Awaited<ReturnType<typeof probar>>) => {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      const r = await probar(mid);
      if (r.paginas <= objetivo) {
        hi = mid;
        mejor = r;
      } else lo = mid;
    }
    return mejor;
  };

  const cero = await probar(0);
  if (cero.paginas <= objetivo) return cerrar(cero);
  // Tramo de densidad: con todos los modos y las métricas de la base.
  const densa = M > 0 ? await probar(M) : cero;
  if (densa.paginas <= objetivo) return cerrar(await binaria(0, M, densa));
  // Tramo de métricas. Calibración: la medida de ESTE contenido con los modos ya
  // puestos (el peldaño M no ensancha la caja): la caja se ensancha desde ahí.
  p90Base = await p90DeLinea(densa.buf);
  const tope = await probar(M + ESCALONES);
  if (tope.paginas > objetivo) {
    return { ...tope, ok: false, comprobaciones: null, renders, razon: "ni con todo en su límite cabe" };
  }
  return cerrar(await binaria(M, M + ESCALONES, tope));
}

/**
 * La plantilla a medida EN SU LÍMITE (todo al máximo que permiten los límites ATS)
 * para una base: la que usa el último peldaño de la búsqueda. `conModos: false` da
 * el límite de antes de los modos de densidad (para medir cuánto ganan).
 */
export async function plantillaEnElLimite(
  data: ResumeData,
  actual: CvTemplate,
  conModos = true,
  render: MedidaDeps["render"] = DEPS.render,
): Promise<CvTemplate> {
  const base = baseParaMedida(actual);
  const modos = conModos ? modosUtiles(base) : [];
  const cal = plantillaDeParams(paramsDeEscalon(base, 0, {}, undefined, modos));
  const buf = await render({ ...data, templateId: cal.id, paletteId: undefined, typographyId: undefined }, {});
  return plantillaDeParams(paramsDeEscalon(base, 1, {}, await p90DeLinea(buf), modos));
}
