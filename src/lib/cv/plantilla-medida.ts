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
  PREFIJO_PLANTILLA_USUARIO,
  getPalette,
  getTemplate,
  getTypography,
  listTemplates,
  paperOf,
  registrarPlantillaUsuario,
  resolveMetrics,
  type CvTemplate,
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
  };
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
  return { ok: true };
}

/** La métrica de la plantilla a medida. Los títulos nunca bajan del cuerpo. */
export function metricasDeParams(p: ParamsMedida): TemplateMetrics {
  const base = getTemplate(p.base);
  const r = resolveMetrics(base.metrics);
  const k = (p.cuerpo / r.bodySize) * p.titulos;
  const tit = (v: number, piso: number) => r2(Math.max(piso, v * k));
  const esp = (v: number) => r2(v * p.espacio);
  return {
    ...base.metrics,
    bodySize: p.cuerpo,
    bodyLeading: p.interlineado,
    pageMarginV: `${p.margenVmm}mm`,
    pageMarginH: `${p.margenHmm}mm`,
    sectionGap: esp(r.sectionGap),
    entryGap: esp(r.entryGap),
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
  const t: CvTemplate = {
    ...base,
    id,
    name: nombre,
    gama: "ats",
    description: `A medida, a partir de «${base.name}»: ${p.cuerpo} pt, márgenes ${p.margenVmm}/${p.margenHmm} mm.`,
    warning: undefined,
    layout: { columns: 1, photo: false, sidebar: false },
    palette: getPalette(p.paletteId) ?? base.palette,
    typography: getTypography(p.typographyId) ?? base.typography,
    metrics: { ...metricasDeParams(p), photoSlot: "none" },
  };
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
  let renders = 0;
  const cache = new Map<number, Omit<ResultadoMedida, "ok" | "comprobaciones" | "renders">>();
  let p90Base: number | undefined;

  const probar = async (paso: number) => {
    const hit = cache.get(paso);
    if (hit) return hit;
    const params = paramsDeEscalon(base, paso / ESCALONES, sel, p90Base);
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

  // Calibración: la medida de la base con ESTE contenido (el escalón 0 no ensancha).
  const cero = await probar(0);
  p90Base = await p90DeLinea(cero.buf);
  if (cero.paginas <= objetivo) {
    const doc0: ResumeData = { ...data, paletteId: undefined, typographyId: undefined };
    const c0 = await deps.comprobar(doc0, cero.plantilla, cero.buf, opts.locale);
    return { ...cero, ok: !c0.razon, comprobaciones: c0, renders, razon: c0.razon };
  }
  const tope = await probar(ESCALONES);
  if (tope.paginas > objetivo) {
    return { ...tope, ok: false, comprobaciones: null, renders, razon: "ni con todo en su límite cabe" };
  }
  // Binaria: `hi` cabe y `lo` (el 0) no; se busca el menor escalón que cabe.
  let lo = 0;
  let hi = ESCALONES;
  let mejor = tope;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const r = await probar(mid);
    if (r.paginas <= objetivo) {
      hi = mid;
      mejor = r;
    } else lo = mid;
  }
  const doc: ResumeData = { ...data, paletteId: undefined, typographyId: undefined };
  const val = validarParams(mejor.params);
  const comprobaciones = await deps.comprobar(doc, mejor.plantilla, mejor.buf, opts.locale);
  const razon = !val.ok ? val.razon : comprobaciones.razon;
  return { ...mejor, ok: val.ok && !razon, comprobaciones, renders, razon };
}
