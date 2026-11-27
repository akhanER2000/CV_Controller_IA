/**
 * MOTOR DE PÁGINAS (DA-A6) — N páginas pedidas = N páginas, SIEMPRE, con todas las
 * reglas. Reemplaza la cascada que se rendía («ni con 25 recortes cabe») y ocultaba
 * que la plantilla a medida había fallado.
 *
 * Un solver con presupuesto de líneas MEDIDO en el PDF real (render + medir.ts, a
 * 10 pt, el suelo ATS). Tres palancas, en orden de menor pérdida, combinables e
 * iteradas hasta caber:
 *
 *   L1 · DISPOSICIÓN — la plantilla del catálogo (o personalizada) más parecida que
 *        cabe tal cual; si ninguna, la plantilla a medida (plantilla-medida.ts). Si
 *        tampoco, la de MÁS capacidad medida es la caja donde trabajan L2 y L3.
 *   L2 · REESCRITURA PARA CABER — reparte las líneas que faltan entre los textos de
 *        menos prioridad para el título objetivo y pide al modelo condensar cada uno
 *        a su presupuesto. Candado «condensar» (ajuste.ts): nada nuevo, más corto,
 *        ningún término excluido; se puede omitir.
 *   L3 · SELECCIÓN — deja fuera lo de menor prioridad (viñetas débiles, grupos de
 *        habilidades sin respaldo, proyectos de menos peso…). NUNCA un item de
 *        «incluir siempre» (ni el rol de una viñeta protegida, ni el contacto).
 *
 * Cuánto de L2 y de L3 se usa lo decide una BINARIA sobre listas ordenadas por
 * prioridad (lo menos importante primero): el prefijo más corto que cabe, medido.
 * Termina SIEMPRE: o cabe, o dice qué regla choca con cuál, con la medida.
 *
 * Nada aquí escribe en la base: entra el documento (ya con las reglas aplicadas) y
 * sus items, sale un PLAN (disposición + reescrituras + ocultos) que la ruta aplica
 * de forma atómica con instantánea.
 */

import { renderResumeToBuffer, type RenderOpts } from "./ResumePDF";
import type { I18n, ResumeData } from "./resume";
import { autofit, plantillaDe, type ResultadoAutofit } from "./autofit";
import { lineasQueSobranReales, medirPdf, type MedidaPdf } from "./medir";
import { buscarPlantillaMedida, type MedidaDeps, type ParamsMedida } from "./plantilla-medida";
import {
  CUERPO_MIN_PT,
  escalarMetricas,
  esPlantillaUsuario,
  getTemplate,
  listTemplates,
  resolveMetrics,
  type CvTemplate,
  type ResolvedMetrics,
} from "./templates";
import {
  CORTE_CAPACIDAD,
  HOLGURA_NECESARIA,
  capacidad,
  docCon,
  parecido,
  simularRecortes,
  type OpcionPlantilla,
  type ProgresoAjuste,
} from "./cascada";
import { calcularFaltas, verificarCondensado, type AjusteItem, type CondensarLLM, type Descartado } from "./ajuste";
import {
  aplicarReglasAlDocumento,
  cumpleReglas,
  normalizarTexto,
  reglasParaPrompt,
  terminoExcluidoEn,
  type Incumplimiento,
  type Reglas,
} from "./reglas";
import { extractNumbers } from "../verify";

// ── El plan (lo que la ruta aplica) ─────────────────────────────────────────
export type Palanca = "disposicion" | "reescritura" | "seleccion";
export type TipoDisposicion = "actual" | "plantilla" | "medida";

export interface Disposicion {
  tipo: TipoDisposicion;
  /** plantilla del documento; para «medida», el id del borrador (u:borrador-…) */
  templateId: string;
  nombre: string;
  /** plantilla personalizada del usuario (u:…): lleva su paleta y su pareja dentro */
  propia: boolean;
  /** solo «medida»: lo que se guarda en Personalizadas */
  params?: ParamsMedida;
}
export interface Reescritura {
  /** id del variant_item */
  id: string;
  kind: string;
  campo: string;
  /** el texto de AHORA (contra el que se corre el candado y al que se revierte) */
  original: string;
  propuesto: string;
}
/** Por qué un item queda fuera (la UI lo traduce). */
export type MotivoFuera = "debil" | "sin-respaldo" | "peso" | "antiguo" | "prioridad";
export interface Ocultado {
  id: string;
  kind: string;
  texto: string;
  motivo: MotivoFuera;
}
export interface PlanMotor {
  disposicion: Disposicion;
  reescribir: Reescritura[];
  ocultar: Ocultado[];
}

/** Una disposición medida (las tarjetas A y B de «Elegir cómo ajustar»). */
export interface DisposicionMedida {
  disposicion: Disposicion;
  cabe: boolean;
  paginas: number;
  cuerpo: number;
  /** miniatura: el MISMO render que se midió */
  pdf?: string;
  razon?: string | null;
}

/** El choque, con la medida: qué regla no deja cumplir a cuál. */
export interface Choque {
  regla: "paginasMax";
  /** «incluirSiempre» si lo protegido no cabe; «contacto» si ni sin nada cabe */
  con: "incluirSiempre" | "contacto";
  objetivo: number;
  /** items que no se pueden quitar (obligatorios + contacto) */
  fijos: number;
  paginas: number;
  lineas: number;
  /** líneas de cuerpo que caben en UNA página de esa disposición */
  caben: number;
  disposicion: string;
}

export interface PasoMotor {
  palanca: Palanca;
  /** qué se probó, corto */
  que: string;
  paginas: number;
  cabe: boolean;
}

export type ResueltoPorMotor = "ya-cabe" | "plantilla" | "medida" | "motor";

export interface ResultadoMotor {
  objetivo: number;
  cabe: boolean;
  resueltoPor: ResueltoPorMotor | null;
  palancas: Palanca[];
  plan: PlanMotor;
  /** páginas reales del resultado y cuerpo elegido (≥ 10 pt) */
  paginas: number;
  cuerpo: number;
  pdf?: string;
  antes: { templateId: string; nombre: string; paginas: number; cuerpo: number };
  /** L1, medidas: la mejor del catálogo (A) y la plantilla a medida (B) */
  mejorPlantilla: DisposicionMedida | null;
  medida: DisposicionMedida | null;
  /** otras plantillas donde cabe tal cual (con miniatura) */
  alternativas: OpcionPlantilla[];
  medicion: { consideradas: number; medidas: number; caben: number; renders: number; tope: boolean; ms: number };
  reescritura: { pedidas: number; aceptadas: number; usadas: number; descartados: Descartado[]; caracteresAntes: number; caracteresDespues: number } | null;
  seleccion: { candidatos: number; fuera: number } | null;
  /** TODAS las reescrituras que pasaron el candado (la tarjeta C las reusa) */
  reescriturasValidas: Reescritura[];
  choque: Choque | null;
  /** reglas que el resultado incumple (tras el último paso; vacío = cumple) */
  incumplidas: Incumplimiento[];
  pasos: PasoMotor[];
  razon: string | null;
}

// ── Entrada ─────────────────────────────────────────────────────────────────
export interface MotorInput {
  /** el documento tal como se pinta (reglas aplicadas, plantilla resuelta) */
  data: ResumeData;
  objetivo: number;
  /** el autofit ya hecho sobre la plantilla actual */
  actual: ResultadoAutofit;
  /** TODOS los items de la variante (visibles y ocultos) */
  items: AjusteItem[];
  reglas: Reglas;
  targetTitle: string;
  propias?: readonly CvTemplate[];
  opts?: RenderOpts;
  /** L2; sin él no hay reescritura (sin clave de IA) */
  condensar?: CondensarLLM;
  /** reescrituras ya validadas (la tarjeta C reusa las de D: una llamada menos) */
  reescriturasPrevias?: Reescritura[];
  /** solo la plantilla actual como disposición (tarjeta C) */
  soloActual?: boolean;
  /** el documento no puede llevar foto (regla sinFoto obligatoria) */
  sinFoto?: boolean;
  topeMs?: number;
  onProgreso?: (p: ProgresoAjuste) => void;
}

export interface MotorDeps {
  render: (data: ResumeData, opts: RenderOpts) => Promise<Uint8Array>;
  medir: (buf: Uint8Array, m: ResolvedMetrics) => Promise<MedidaPdf>;
  medida?: MedidaDeps;
  ahora?: () => number;
}
const DEPS: MotorDeps = {
  render: async (data, opts) => new Uint8Array(await renderResumeToBuffer(data, opts)),
  medir: (buf, m) => medirPdf(buf, m),
};

export const TOPE_MS = 45_000;
const b64 = (buf: Uint8Array) => Buffer.from(buf).toString("base64");
const n = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const igual = (a: I18n, t: string) => !!t && (n(a.es) === t || n(a.en) === t);

// ── Qué se imprime de cada item ─────────────────────────────────────────────
/**
 * El texto IMPRESO de un item de texto (viñeta, resumen, proyecto) en el idioma
 * del documento, o null si no se imprime (término excluido, sección oculta…).
 */
export function textoImpreso(data: ResumeData, it: AjusteItem, locale: "es" | "en" = "es"): string | null {
  const t = n(it.original);
  if (!t) return null;
  if (it.kind === "bullet") {
    for (const w of data.work) for (const b of w.bullets) if (igual(b, t)) return n(b[locale]);
    return null;
  }
  if (it.kind === "summary") return igual(data.basics.summary, t) ? n(data.basics.summary[locale]) : null;
  if (it.kind === "project") {
    const p = data.projects.find((x) => n(x.es).includes(t) || n(x.en).includes(t));
    return p ? n(p[locale]) : null;
  }
  return null;
}

/** ¿Se imprime este item? Lo que no se imprime no ocupa líneas: ni se condensa ni se quita. */
export function seImprime(data: ResumeData, it: AjusteItem): boolean {
  const d = it.datos;
  switch (it.kind) {
    case "basics":
      return true;
    case "bullet":
    case "summary":
    case "project":
      return textoImpreso(data, it) !== null;
    case "work":
      return data.work.some((w) => n(w.company) === n(d.company) && igual(w.title, n(d.title)));
    case "skill":
      return data.skills.some((s) => igual(s.group, n(d.group)));
    case "education":
      return data.education.some((e) => igual(e.title, n(d.degree)) && n(e.org) === n(d.institution));
    default: {
      const h = n(d.name ?? d.language ?? d.text ?? d.title ?? "").slice(0, 40);
      return !!h && JSON.stringify(data).includes(h.replace(/["\\]/g, ""));
    }
  }
}

// ── Prioridad para el título objetivo ───────────────────────────────────────
const VACIAS = new Set(
  "de del la las el los y e o u en a al con para por sin of the and or in on at to for with from an".split(" "),
);
/** Los términos del título objetivo (sin tildes ni mayúsculas, sin palabras vacías). */
export function terminosDe(titulo: string): string[] {
  return [...new Set(normalizarTexto(titulo).split(/[^\p{L}\p{N}+#]+/u).filter((x) => x.length >= 2 && !VACIAS.has(x)))];
}
function relevancia(texto: string, terminos: readonly string[]): number {
  if (!terminos.length) return 0;
  const t = ` ${normalizarTexto(texto).replace(/[^\p{L}\p{N}+#]+/gu, " ")} `;
  return terminos.filter((x) => t.includes(` ${x} `)).length / terminos.length;
}

const PESO: Record<string, number> = {
  summary: 6,
  work: 5,
  education: 4.5,
  skill: 3.5,
  language: 3,
  bullet: 3,
  project: 2.5,
  certification: 2,
  publication: 1,
  reference: 0.5,
};

export interface Prioridad {
  id: string;
  valor: number;
  /** nunca se quita (incluir siempre, el contacto, el rol de una viñeta protegida…) */
  fijo: boolean;
  motivo: MotivoFuera;
}

/**
 * La prioridad de cada item VISIBLE para el título objetivo. Determinista y
 * auditable: peso de la sección + parecido con el título + cifras + lo reciente.
 * «incluir siempre» (ids del MASTER) es fijo; también el rol de una viñeta fija y
 * la primera viñeta de un rol fijo (un rol obligatorio no se vacía).
 */
export function prioridades(items: AjusteItem[], targetTitle: string, protegidos: ReadonlySet<string>): Map<string, Prioridad> {
  const vis = items.filter((i) => i.visible);
  const terminos = terminosDe(targetTitle);
  const roles = vis.filter((i) => i.kind === "work").sort((a, b) => a.sortOrder - b.sortOrder);
  const rangoRol = new Map(roles.map((r, k) => [r.itemId, k]));
  const rolDe = new Map(roles.map((r) => [r.itemId, r]));
  const vinetas = new Map<string, AjusteItem[]>();
  for (const b of vis.filter((i) => i.kind === "bullet" && i.parentId)) {
    if (!vinetas.has(b.parentId!)) vinetas.set(b.parentId!, []);
    vinetas.get(b.parentId!)!.push(b);
  }
  for (const l of vinetas.values()) l.sort((a, b) => a.sortOrder - b.sortOrder);
  const sinRespaldo = new Map<string, number>();
  for (const f of calcularFaltas(items)) {
    if (f.tipo !== "sin-respaldo") continue;
    const it = vis.find((i) => i.id === f.id);
    const total = String(it?.datos.items ?? "").split(/[,;·]/).filter((s) => s.trim().length >= 2).length || 1;
    sinRespaldo.set(f.id, f.detalle.split(",").length / total);
  }
  const reciente = (rolItemId: string | null) => {
    const k = rolItemId != null ? rangoRol.get(rolItemId) : undefined;
    return k == null ? 0 : Math.max(0, 1.5 - 0.3 * k);
  };

  const out = new Map<string, Prioridad>();
  for (const it of vis) {
    let fijo = it.kind === "basics" || protegidos.has(it.itemId);
    let motivo: MotivoFuera = "prioridad";
    let v = PESO[it.kind] ?? 1;
    const rel = relevancia(it.texto, terminos);
    if (it.kind === "bullet") {
      const rol = it.parentId ? rolDe.get(it.parentId) : undefined;
      const hermanas = it.parentId ? (vinetas.get(it.parentId) ?? []) : [];
      const pos = Math.max(0, hermanas.findIndex((h) => h.id === it.id));
      const cifra = extractNumbers(it.original).length > 0;
      v += rel * 3 + (cifra ? 1.5 : 0) + reciente(it.parentId) - 0.25 * pos + (rol ? relevancia(rol.texto, terminos) * 0.5 : 0);
      if (it.parentId && protegidos.has(it.parentId)) {
        v += 4;
        if (pos === 0) fijo = true;
      }
      motivo = !cifra && rel === 0 ? "debil" : "prioridad";
    } else if (it.kind === "work") {
      v += rel * 3 + reciente(it.itemId);
      // Un rol con una viñeta protegida no se quita: se la llevaría con él.
      if ((vinetas.get(it.itemId) ?? []).some((b) => protegidos.has(b.itemId))) fijo = true;
      motivo = (rangoRol.get(it.itemId) ?? 0) >= 2 ? "antiguo" : "prioridad";
    } else if (it.kind === "skill") {
      const sr = sinRespaldo.get(it.id) ?? 0;
      v += rel * 2 - 2.5 * sr;
      motivo = sr > 0 ? "sin-respaldo" : "prioridad";
    } else if (it.kind === "project") {
      v += rel * 3 + (extractNumbers(it.texto).length ? 0.5 : 0) + Math.min(1, it.texto.length / 240);
      motivo = "peso";
    } else {
      v += rel * 2;
    }
    out.set(it.id, { id: it.id, valor: fijo ? Number.POSITIVE_INFINITY : v, fijo, motivo });
  }
  return out;
}

// ── Simular el plan sobre el documento ──────────────────────────────────────
/**
 * El documento con el plan aplicado (sin la disposición): fuera lo oculto y con los
 * textos condensados. El override gana en los DOS idiomas (como en
 * buildVariantResumeData), así que la reescritura cambia los dos lados. Después se
 * vuelven a aplicar las reglas: el resultado siempre las cumple.
 */
export function simularPlan(data: ResumeData, items: AjusteItem[], plan: Pick<PlanMotor, "reescribir" | "ocultar">, reglas: Reglas): ResumeData {
  const quitar = plan.ocultar.map((o) => ({ id: o.id, kind: o.kind, texto: o.texto, motivo: "" }));
  const d = simularRecortes(data, items, { quitar, acortar: [] }).data;
  for (const r of plan.reescribir) {
    const o = n(r.original);
    if (!o) continue;
    if (r.kind === "bullet") {
      for (const w of d.work)
        w.bullets = w.bullets.map((b) => (igual(b, o) ? { ...b, es: r.propuesto, en: r.propuesto } : b));
    } else if (r.kind === "summary") {
      if (igual(d.basics.summary, o)) d.basics.summary = { es: r.propuesto, en: r.propuesto };
    } else if (r.kind === "project") {
      d.projects = d.projects.map((p) => {
        if (!(n(p.es).includes(o) || n(p.en).includes(o))) return p;
        const lado = (s: string) => {
          const x = n(s);
          if (x.includes(o)) return x.replace(o, r.propuesto);
          const i = x.indexOf(" — ");
          return i >= 0 ? `${x.slice(0, i)} — ${r.propuesto}` : r.propuesto;
        };
        return { ...p, es: lado(p.es), en: lado(p.en) };
      });
    }
  }
  return aplicarReglasAlDocumento(d, reglas);
}

// ── Las disposiciones ───────────────────────────────────────────────────────
interface Caja {
  d: Disposicion;
  /** la plantilla registrada con la que se renderiza */
  t: CvTemplate;
  /** el documento puesto en esta caja */
  en: (doc: ResumeData) => ResumeData;
  /** opciones de render a 10 pt */
  opts: RenderOpts;
  metrica: ResolvedMetrics;
}

function cajaDe(d: Disposicion, t: CvTemplate, data: ResumeData, opts: RenderOpts): Caja {
  if (d.tipo === "medida") {
    return {
      d,
      t,
      en: (doc) => ({ ...doc, templateId: t.id, paletteId: undefined, typographyId: undefined }),
      opts: { locale: opts.locale },
      metrica: resolveMetrics(t.metrics),
    };
  }
  const en = d.tipo === "actual" ? (doc: ResumeData) => doc : (doc: ResumeData) => docCon(doc, t);
  const pt = plantillaDe(en(data), opts);
  const base = pt.metrics.bodySize;
  return {
    d,
    t: pt,
    en,
    opts: { ...opts, bodySize: base > CUERPO_MIN_PT ? CUERPO_MIN_PT : undefined },
    metrica: resolveMetrics(escalarMetricas(pt.metrics, Math.min(base, CUERPO_MIN_PT))),
  };
}

interface Medicion {
  buf: Uint8Array;
  medida: MedidaPdf;
  paginas: number;
  sobran: number;
  cabe: boolean;
}

/** Caracteres de una línea de cuerpo, medidos (p75 de las líneas de ≥ 30). */
function cplDe(m: MedidaPdf): number {
  const l = m.paginas.flat().map((x) => x.length).filter((x) => x >= 30).sort((a, b) => a - b);
  return l.length ? l[Math.floor(0.75 * (l.length - 1))]! : 80;
}

/** Líneas que ocupa un item impreso (estimadas con la medida de línea real). */
function lineasDe(data: ResumeData, it: AjusteItem, cpl: number, todos: AjusteItem[]): number {
  const l = (s: string) => Math.max(1, Math.ceil(n(s).length / Math.max(20, cpl - 4)));
  switch (it.kind) {
    case "bullet":
    case "summary":
    case "project":
      return l(textoImpreso(data, it) ?? it.texto);
    case "work":
      return 2 + todos.filter((b) => b.kind === "bullet" && b.visible && b.parentId === it.itemId && seImprime(data, b)).reduce((a, b) => a + l(b.texto), 0);
    case "education":
      return 2;
    default:
      return l(it.texto);
  }
}

// ── El solver ───────────────────────────────────────────────────────────────
export async function resolverPaginas(input: MotorInput, deps: MotorDeps = DEPS): Promise<ResultadoMotor> {
  const ahora = deps.ahora ?? Date.now;
  const t0 = ahora();
  const { data, objetivo, actual, reglas, items, opts = {} } = input;
  const locale = opts.locale === "en" ? "en" : "es";
  const progreso = input.onProgreso ?? (() => {});
  const tope = input.topeMs ?? TOPE_MS;
  const plantilla = plantillaDe(data, opts);
  const protegidos = new Set(reglas.incluirSiempre);
  const conFoto = !!data.photo && !input.sinFoto;
  let renders = 0;

  const dispActual: Disposicion = { tipo: "actual", templateId: plantilla.id, nombre: plantilla.name, propia: esPlantillaUsuario(plantilla.id) };
  const res: ResultadoMotor = {
    objetivo,
    cabe: false,
    resueltoPor: null,
    palancas: [],
    plan: { disposicion: dispActual, reescribir: [], ocultar: [] },
    paginas: actual.medida.porPagina.length,
    cuerpo: actual.bodySize,
    antes: { templateId: plantilla.id, nombre: plantilla.name, paginas: actual.medida.porPagina.length, cuerpo: actual.bodySize },
    mejorPlantilla: null,
    medida: null,
    alternativas: [],
    medicion: { consideradas: 0, medidas: 0, caben: 0, renders: 0, tope: false, ms: 0 },
    reescritura: null,
    seleccion: null,
    reescriturasValidas: [],
    choque: null,
    incumplidas: [],
    pasos: [],
    razon: null,
  };
  const idsVisibles = (plan: Pick<PlanMotor, "ocultar">) => {
    const fuera = new Set(plan.ocultar.map((o) => o.id));
    return new Set(items.filter((i) => i.visible && !fuera.has(i.id)).map((i) => i.itemId));
  };
  const fin = (doc: ResumeData) => {
    res.incumplidas = cumpleReglas(doc, reglas, {
      paginas: res.paginas,
      idsVisibles: idsVisibles(res.plan),
      idioma: reglas.idioma ? locale : undefined,
    });
    res.medicion.renders = renders;
    res.medicion.ms = ahora() - t0;
    return res;
  };

  const medirEn = async (caja: Caja, doc: ResumeData): Promise<Medicion> => {
    const buf = await deps.render(caja.en(doc), caja.opts);
    renders += 1;
    const medida = await deps.medir(buf, caja.metrica);
    const paginas = medida.porPagina.length;
    return { buf, medida, paginas, sobran: lineasQueSobranReales(medida, objetivo), cabe: paginas <= objetivo };
  };

  if (!actual.noCabe) {
    res.cabe = true;
    res.resueltoPor = "ya-cabe";
    res.pdf = b64(actual.buf);
    return fin(data);
  }
  const cajaActual = cajaDe(dispActual, plantilla, data, opts);
  const mActual: Medicion = { buf: actual.buf, medida: actual.medida, paginas: actual.medida.porPagina.length, sobran: actual.sobran, cabe: false };
  /** las cajas donde se puede trabajar, con su medida a 10 pt del contenido tal cual */
  const cajas: { caja: Caja; m: Medicion }[] = [{ caja: cajaActual, m: mActual }];

  // ── L1 · Disposición ──────────────────────────────────────────────────────
  if (!input.soloActual) {
    // 1a · Catálogo + personalizadas, por parecido; prefiltro por capacidad.
    const llenas = actual.medida.porPagina.slice(0, -1);
    const porPagina = llenas.length ? Math.max(...llenas) : actual.medida.caben;
    const necesaria = actual.medida.total / Math.max(1, objetivo * porPagina);
    const corte = Math.max(CORTE_CAPACIDAD, necesaria * HOLGURA_NECESARIA);
    const c0 = Math.max(1, capacidad(plantilla));
    const vistas = new Set([plantilla.id]);
    const filas: { t: CvTemplate; r: number; s: number }[] = [];
    for (const t of [...listTemplates(), ...(input.propias ?? [])]) {
      if (vistas.has(t.id)) continue;
      vistas.add(t.id);
      res.medicion.consideradas += 1;
      if (t.layout.photo && !conFoto) continue;
      filas.push({ t, r: capacidad(t) / c0, s: parecido(plantilla, t) });
    }
    let lista = filas.filter((f) => f.r >= corte);
    // Ninguna pasa el corte: se miden igual las 3 de más capacidad (la tarjeta A
    // enseña SIEMPRE la mejor del catálogo, medida, aunque no quepa).
    if (!lista.length) lista = [...filas].sort((a, b) => b.r - a.r).slice(0, 3);
    lista.sort((a, b) => b.s - a.s || b.r - a.r || a.t.id.localeCompare(b.t.id));
    progreso({ paso: 1, hechas: 0, total: lista.length });
    let mejor: { caja: Caja; m: Medicion } | null = null;
    for (const f of lista) {
      if (ahora() - t0 > tope) {
        res.medicion.tope = true;
        break;
      }
      const d: Disposicion = { tipo: "plantilla", templateId: f.t.id, nombre: f.t.name, propia: esPlantillaUsuario(f.t.id) };
      const caja = cajaDe(d, f.t, data, opts);
      const m = await medirEn(caja, data);
      res.medicion.medidas += 1;
      progreso({ paso: 1, hechas: res.medicion.medidas, total: lista.length });
      if (!mejor || m.sobran < mejor.m.sobran) mejor = { caja, m };
      if (m.cabe) {
        res.medicion.caben += 1;
        mejor = { caja, m };
        break;
      }
    }
    if (mejor) {
      res.mejorPlantilla = { disposicion: mejor.caja.d, cabe: mejor.m.cabe, paginas: mejor.m.paginas, cuerpo: CUERPO_MIN_PT, pdf: b64(mejor.m.buf) };
      res.pasos.push({ palanca: "disposicion", que: `plantilla ${mejor.caja.d.nombre}`, paginas: mejor.m.paginas, cabe: mejor.m.cabe });
      if (mejor.m.cabe) {
        // El cuerpo más grande que cabe (≥ 10 pt), reusando el render del suelo.
        const conSuelo = {
          render: (doc: ResumeData, o: RenderOpts) => (o.bodySize === CUERPO_MIN_PT ? Promise.resolve(mejor!.m.buf) : deps.render(doc, o)),
          medir: deps.medir,
        };
        const docT = mejor.caja.en(data);
        const r = await autofit(docT, plantillaDe(docT, opts), objetivo, opts, conSuelo);
        const op: OpcionPlantilla = {
          templateId: mejor.caja.d.templateId,
          nombre: mejor.caja.d.nombre,
          gama: mejor.caja.t.gama,
          propia: mejor.caja.d.propia,
          paginas: r.medida.porPagina.length,
          cuerpo: r.bodySize,
          pdf: b64(r.buf),
        };
        res.mejorPlantilla = { ...res.mejorPlantilla, paginas: op.paginas, cuerpo: op.cuerpo, pdf: op.pdf };
        res.alternativas = [];
        res.plan = { disposicion: mejor.caja.d, reescribir: [], ocultar: [] };
        Object.assign(res, { cabe: true, resueltoPor: "plantilla", palancas: ["disposicion"], paginas: op.paginas, cuerpo: op.cuerpo, pdf: op.pdf });
        return fin(docT);
      }
      cajas.push(mejor);
    }

    // 1b · La plantilla a medida.
    progreso({ paso: 2 });
    const m = await buscarPlantillaMedida(data, plantilla, objetivo, opts, deps.medida);
    renders += m.renders;
    const dMedida: Disposicion = { tipo: "medida", templateId: m.plantilla.id, nombre: m.plantilla.name, propia: true, params: m.params };
    res.medida = { disposicion: dMedida, cabe: m.ok, paginas: m.paginas, cuerpo: m.params.cuerpo, pdf: b64(m.buf), razon: m.ok ? null : (m.razon ?? null) };
    res.pasos.push({ palanca: "disposicion", que: "plantilla a medida", paginas: m.paginas, cabe: m.ok });
    if (m.ok) {
      res.plan = { disposicion: dMedida, reescribir: [], ocultar: [] };
      Object.assign(res, { cabe: true, resueltoPor: "medida", palancas: ["disposicion"], paginas: m.paginas, cuerpo: m.params.cuerpo, pdf: b64(m.buf) });
      return fin({ ...data, templateId: m.plantilla.id });
    }
    // No cabe (o no pasa las comprobaciones): su escalón más apretado es la caja de
    // más capacidad para L2 y L3 — solo si es porque no cabe, no si falla el ATS.
    if (m.paginas > objetivo) {
      cajas.push({
        caja: cajaDe(dMedida, m.plantilla, data, opts),
        m: { buf: m.buf, medida: m.medida, paginas: m.paginas, sobran: m.sobran, cabe: false },
      });
    }
  }

  // ── L2 + L3 sobre la caja de más capacidad (y, si no sirve, la siguiente) ────
  progreso({ paso: 3 });
  cajas.sort((a, b) => a.m.sobran - b.m.sobran);
  const prio = prioridades(items, input.targetTitle, protegidos);
  const visibles = items.filter((i) => i.visible && seImprime(data, i));
  const val = (id: string) => prio.get(id)?.valor ?? 0;

  // L2 · las reescrituras (una llamada, con los presupuestos de la caja mejor).
  let reescrituras: Reescritura[] = input.reescriturasPrevias ? [...input.reescriturasPrevias] : [];
  const descartados: Descartado[] = [];
  let pedidas = 0;
  if (!input.reescriturasPrevias && input.condensar) {
    const { m } = cajas[0]!;
    const cpl = cplDe(m.medida);
    const falta = Math.ceil(m.sobran * 1.2) + 2;
    const cands = visibles
      .filter((i) => (i.kind === "bullet" || i.kind === "summary" || i.kind === "project") && i.campo && i.original.trim())
      // Si el documento sale en el OTRO idioma (traducción del master), condensar el
      // campo del master no cambia lo impreso como se espera: fuera de L2.
      .filter((i) => {
        const p = n(textoImpreso(data, i, locale));
        const o = n(i.original);
        return i.kind === "project" ? p.includes(o) : p === o;
      })
      .map((i) => ({ i, lineas: lineasDe(data, i, cpl, items) }))
      .filter((c) => c.lineas >= 2)
      .sort((a, b) => val(a.i.id) - val(b.i.id));
    let suma = 0;
    const pedido: { it: AjusteItem; max: number }[] = [];
    for (const c of cands) {
      if (suma >= falta) break;
      const corte = c.i.kind === "summary" ? Math.max(1, c.lineas - 2) : Math.max(1, Math.floor(c.lineas / 2));
      suma += corte;
      pedido.push({ it: c.i, max: Math.max(40, Math.floor((c.lineas - corte) * (cpl - 4) * 0.95)) });
    }
    if (pedido.length) {
      pedidas = pedido.length;
      const evidencia = (it: AjusteItem) => {
        const rol = it.parentId ? items.find((x) => x.itemId === it.parentId) : undefined;
        return rol ? rol.texto : "";
      };
      try {
        const r = await input.condensar({
          targetTitle: input.targetTitle,
          items: pedido.map((p) => ({ id: p.it.id, kind: p.it.kind, texto: p.it.original, max: p.max, evidencia: evidencia(p.it) })),
          reglas: reglasParaPrompt(reglas),
        });
        const porId = new Map(pedido.map((p) => [p.it.id, p.it]));
        const vistos = new Set<string>();
        for (const x of Array.isArray(r?.items) ? r.items : []) {
          const it = porId.get(String(x?.id ?? ""));
          const propuesto = n(x?.texto);
          if (!it || vistos.has(it.id)) {
            descartados.push({ tipo: "acortar", id: String(x?.id ?? ""), propuesto, razon: "ese item no se pidió" });
            continue;
          }
          vistos.add(it.id);
          const v = verificarCondensado(it.original, propuesto, evidencia(it), (s) => terminoExcluidoEn(s, reglas));
          if (!v.ok) {
            descartados.push({ tipo: "acortar", id: it.id, propuesto, razon: v.razon, nuevas: v.nuevas });
            continue;
          }
          reescrituras.push({ id: it.id, kind: it.kind, campo: it.campo!, original: it.original, propuesto });
        }
      } catch (e) {
        res.razon = `la IA no condensó (${e instanceof Error ? e.message : String(e)}); se sigue sin reescritura`;
      }
    }
  }
  // Lo menos importante primero (la binaria usa el prefijo más corto que cabe).
  reescrituras = reescrituras
    .filter((r) => items.some((i) => i.id === r.id && i.visible))
    .sort((a, b) => val(a.id) - val(b.id));
  res.reescriturasValidas = reescrituras;
  if (pedidas && !res.reescritura)
    res.reescritura = { pedidas, aceptadas: reescrituras.length, usadas: 0, descartados, caracteresAntes: 0, caracteresDespues: 0 };

  // L3 · la lista de lo que se puede dejar fuera, lo menos importante primero.
  const removibles = visibles
    .filter((i) => i.kind !== "basics" && !prio.get(i.id)?.fijo)
    .sort((a, b) => val(a.id) - val(b.id) || a.sortOrder - b.sortOrder);
  const ocultadoDe = (it: AjusteItem): Ocultado => ({ id: it.id, kind: it.kind, texto: it.texto, motivo: prio.get(it.id)?.motivo ?? "prioridad" });

  const planDe = (caja: Caja, kr: number, kq: number): PlanMotor => {
    const ocultar = removibles.slice(0, kq).map(ocultadoDe);
    const fuera = new Set(ocultar.map((o) => o.id));
    // Lo que se deja fuera no se reescribe: un cambio por item.
    return { disposicion: caja.d, reescribir: reescrituras.slice(0, kr).filter((x) => !fuera.has(x.id)), ocultar };
  };
  /** El prefijo más corto de [1..hi] con el que cabe (hi cabe). */
  const minimo = async (hi: number, cabe: (k: number) => Promise<boolean>) => {
    let lo = 0;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (await cabe(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  };

  let ultimo: { caja: Caja; m: Medicion; kq: number } | null = null;
  for (const { caja, m: m0 } of cajas) {
    const cache = new Map<string, Medicion>();
    const medirPlan = async (kr: number, kq: number) => {
      const k = `${kr}|${kq}`;
      const hit = cache.get(k);
      if (hit) return hit;
      const plan = planDe(caja, kr, kq);
      const doc = simularPlan(data, items, plan, reglas);
      const r = kr === 0 && kq === 0 ? m0 : await medirEn(caja, doc);
      cache.set(k, r);
      res.pasos.push({
        palanca: kq ? "seleccion" : kr ? "reescritura" : "disposicion",
        que: `${caja.d.nombre}: ${kr} reescritos, ${kq} fuera`,
        paginas: r.paginas,
        cabe: r.cabe,
      });
      return r;
    };
    const R = reescrituras.length;
    let kr = 0;
    let kq = 0;
    if (R && (await medirPlan(R, 0)).cabe) {
      kr = await minimo(R, async (k) => (await medirPlan(k, 0)).cabe);
    } else {
      kr = R;
      const Q = removibles.length;
      const todo = await medirPlan(R, Q);
      ultimo = { caja, m: todo, kq: Q };
      if (!todo.cabe) continue;
      kq = await minimo(Q, async (k) => (await medirPlan(R, k)).cabe);
    }

    // Cabe: el plan, y la caja MENOS apretada (o el cuerpo más grande) que cabe.
    const plan = planDe(caja, kr, kq);
    const doc = simularPlan(data, items, plan, reglas);
    let final: { d: Disposicion; paginas: number; cuerpo: number; buf: Uint8Array; doc: ResumeData } | null = null;
    if (caja.d.tipo === "medida") {
      const mm = await buscarPlantillaMedida(doc, plantilla, objetivo, opts, deps.medida);
      renders += mm.renders;
      if (mm.ok) {
        final = {
          d: { tipo: "medida", templateId: mm.plantilla.id, nombre: mm.plantilla.name, propia: true, params: mm.params },
          paginas: mm.paginas,
          cuerpo: mm.params.cuerpo,
          buf: mm.buf,
          doc: { ...doc, templateId: mm.plantilla.id },
        };
      } else {
        res.pasos.push({ palanca: "disposicion", que: `a medida no pasa: ${mm.razon ?? "?"}`, paginas: mm.paginas, cabe: false });
      }
    } else {
      const docT = caja.en(doc);
      const r = await autofit(docT, plantillaDe(docT, opts), objetivo, opts, { render: deps.render, medir: deps.medir });
      renders += 1;
      if (!r.noCabe) final = { d: caja.d, paginas: r.medida.porPagina.length, cuerpo: r.bodySize, buf: r.buf, doc: docT };
    }
    if (!final) continue;

    res.plan = { ...plan, disposicion: final.d };
    const palancas: Palanca[] = [];
    if (final.d.tipo !== "actual") palancas.push("disposicion");
    if (plan.reescribir.length) palancas.push("reescritura");
    if (plan.ocultar.length) palancas.push("seleccion");
    const usadas = plan.reescribir;
    res.reescritura =
      pedidas || reescrituras.length || descartados.length
        ? {
            pedidas,
            aceptadas: reescrituras.length,
            usadas: usadas.length,
            descartados,
            caracteresAntes: usadas.reduce((a, r) => a + r.original.length, 0),
            caracteresDespues: usadas.reduce((a, r) => a + r.propuesto.length, 0),
          }
        : null;
    res.seleccion = { candidatos: removibles.length, fuera: kq };
    Object.assign(res, { cabe: true, resueltoPor: "motor", palancas, paginas: final.paginas, cuerpo: final.cuerpo, pdf: b64(final.buf) });
    return fin(final.doc);
  }

  // ── No cabe ni con lo mínimo: el choque, con la medida ──────────────────────
  const peor = ultimo ?? { caja: cajas[0]!.caja, m: cajas[0]!.m, kq: 0 };
  const fijos = visibles.filter((i) => prio.get(i.id)?.fijo).length;
  const protegidosVisibles = visibles.filter((i) => protegidos.has(i.itemId)).length;
  res.choque = {
    regla: "paginasMax",
    con: protegidosVisibles ? "incluirSiempre" : "contacto",
    objetivo,
    fijos,
    paginas: peor.m.paginas,
    lineas: peor.m.medida.total,
    caben: peor.m.medida.caben,
    disposicion: peor.caja.d.nombre,
  };
  res.plan = planDe(peor.caja, reescrituras.length, peor.kq);
  res.paginas = peor.m.paginas;
  res.cuerpo = CUERPO_MIN_PT;
  res.pdf = b64(peor.m.buf);
  res.razon = textoChoque(res.choque);
  return fin(simularPlan(data, items, res.plan, reglas));
}

/** El choque en una frase (para logs y para el servidor; la UI lo compone con i18n). */
export function textoChoque(c: Choque): string {
  const quien = c.con === "incluirSiempre" ? "«Incluir siempre»" : "el contacto";
  return (
    `«Máximo ${c.objetivo} página${c.objetivo === 1 ? "" : "s"}» choca con ${quien}: lo que no se puede quitar ` +
    `(${c.fijos} items) mide ${c.paginas} páginas (${c.lineas} líneas; caben ${c.caben} por página) a 10 pt ` +
    `en «${c.disposicion}», la disposición más compacta.`
  );
}

/** Para la UI y los tests: la plantilla de una disposición (registrada). */
export function plantillaDeDisposicion(d: Disposicion): CvTemplate {
  return getTemplate(d.templateId);
}
