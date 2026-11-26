/**
 * «AJUSTAR PÁGINAS» DE UN CLIC (DA-A4, reemplaza la cascada de DA-A1). Conservar el
 * contenido va ANTES que recortarlo. Tres pasos, en orden, y se queda con el
 * primero que deja el CV en las páginas pedidas — medidas en el PDF real:
 *
 *   1 · TODAS las plantillas (las 65 del catálogo y las personalizadas del usuario)
 *       con el contenido TAL CUAL. Prefiltro por capacidad (lineasQueCaben × medida
 *       de línea a 10 pt), luego render y medida real a 10 pt de las que pasan, por
 *       orden de parecido con la actual y con tope de tiempo. La primera que cabe es
 *       la que se aplica; las demás que caben son «otras opciones».
 *   2 · Si ninguna cabe: la PLANTILLA A MEDIDA (plantilla-medida.ts), que la ruta
 *       guarda en Personalizadas antes de aplicarla.
 *   3 · Solo si tampoco cabe sobre el suelo de 10 pt: los RECORTES propuestos,
 *       todos de una vez, sin tocar nunca un item de «incluir siempre» (DA-R1).
 *
 * Nada aquí escribe en la base ni llama a un modelo: entra el documento (y una
 * función que trae los recortes, que solo se llama si hace falta), sale el
 * resultado. La ruta (api/variants/[id]/ajustar) aplica, guarda la instantánea y
 * deshace.
 */

import { renderResumeToBuffer, type RenderOpts } from "./ResumePDF";
import type { ResumeData } from "./resume";
import { autofit, plantillaDe, type AutofitDeps, type ResultadoAutofit } from "./autofit";
import { lineasQueCaben, medirPdf, type MedidaPdf } from "./medir";
import { buscarPlantillaMedida, type MedidaDeps, type ParamsMedida } from "./plantilla-medida";
import {
  CUERPO_MIN_PT,
  escalarMetricas,
  esPlantillaUsuario,
  listTemplates,
  resolveMetrics,
  tagsOf,
  type CvTemplate,
  type ResolvedMetrics,
} from "./templates";
import type { AjusteItem, AjusteResult, PropuestaAcortar, PropuestaQuitar } from "./ajuste";

// ── El resultado (lo consume el panel de ajuste: tipos sin dependencias) ─────
export interface OpcionPlantilla {
  templateId: string;
  nombre: string;
  gama: string;
  /** plantilla personalizada del usuario (u:…) */
  propia: boolean;
  /** páginas reales con el cuerpo que elige el autofit */
  paginas: number;
  cuerpo: number;
  /** PDF (base64) de la miniatura: el mismo render que se midió */
  pdf?: string;
}
export interface MedidaAplicable {
  params: ParamsMedida;
  paginas: number;
  cuerpo: number;
  pdf: string;
}
export interface RecortesAplicables {
  quitar: PropuestaQuitar[];
  acortar: PropuestaAcortar[];
  /** recortes propuestos que NO se aplican porque tocan un item de «incluir siempre» */
  protegidos: number;
  /** páginas reales con todos los recortes aplicados */
  paginas: number;
  cuerpo: number;
  /** recortes que no se pudieron reproducir en la simulación (la cifra es una cota) */
  sinSimular: number;
}
export type ResueltoPor = "ya-cabe" | "plantilla" | "medida" | "recortes";
export interface Medicion {
  /** plantillas que se consideraron (catálogo + personalizadas, sin la actual) */
  consideradas: number;
  propias: number;
  /** las que el prefiltro de capacidad dejó fuera sin renderizar */
  porCapacidad: number;
  /** las de foto, fuera porque el documento no lleva foto */
  porFoto: number;
  /** las que se renderizaron y midieron de verdad */
  medidas: number;
  caben: number;
  /** el tope de tiempo cortó la búsqueda antes de medirlas todas */
  tope: boolean;
  ms: number;
}
export interface ResultadoAjuste {
  objetivo: number;
  resueltoPor: ResueltoPor | null;
  /** cómo estaba: plantilla, páginas reales y cuerpo tras el autofit */
  antes: { templateId: string; nombre: string; paginas: number; cuerpo: number };
  plantilla: OpcionPlantilla | null;
  medida: MedidaAplicable | null;
  recortes: RecortesAplicables | null;
  /** las demás plantillas donde el contenido cabe tal cual (con miniatura) */
  alternativas: OpcionPlantilla[];
  medicion: Medicion;
  /** por qué no se resolvió (o por qué un paso no sirvió) */
  razon: string | null;
}
/** Paso en curso: 0 midiendo el documento · 1 plantillas · 2 a medida · 3 recortes. */
export interface ProgresoAjuste {
  paso: 0 | 1 | 2 | 3;
  hechas?: number;
  total?: number;
}

// ── Recortes: simular la propuesta ──────────────────────────────────────────
const n = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const igual = (a: { es: string; en: string }, t: string) => n(a.es) === t || n(a.en) === t;

/**
 * El documento con TODOS los recortes de la propuesta aplicados. Se casa cada item
 * con su entrada del ResumeData por su texto efectivo (el mismo que lo construyó).
 * Lo que no se encuentra se cuenta en `sinSimular`: la medida queda como cota.
 */
export function simularRecortes(
  data: ResumeData,
  items: AjusteItem[],
  propuesta: Pick<AjusteResult, "quitar" | "acortar">,
): { data: ResumeData; sinSimular: number } {
  const d = structuredClone(data);
  const porId = new Map(items.map((i) => [i.id, i]));
  const quitados = new Set(propuesta.quitar.map((q) => q.id));
  let sinSimular = 0;
  /** Quita la PRIMERA entrada que case (dos items con el mismo texto son dos entradas). */
  const quitaUna = <T,>(lista: T[] | undefined, casa: (e: T) => boolean): boolean => {
    const i = lista ? lista.findIndex(casa) : -1;
    if (i < 0) return false;
    lista!.splice(i, 1);
    return true;
  };

  // Lo que el documento NO imprime (viñetas de proyecto, enlaces de la variante,
  // referencias apagadas…) no ocupa líneas: quitarlo no cambia nada y no es un fallo.
  const impreso = JSON.stringify(data);
  const noSeImprime = (x: Record<string, unknown>) => {
    const h = n(x.text ?? x.url ?? x.name ?? "").replace(/["\\]/g, "").slice(0, 40);
    return !!h && !impreso.includes(h);
  };

  for (const q of propuesta.quitar) {
    const it = porId.get(q.id);
    const x = it?.datos ?? {};
    let hecho = !!it && noSeImprime(x);
    if (!hecho) switch (it?.kind) {
      case "bullet": {
        const t = n(x.text);
        for (const w of d.work) if (!hecho) hecho = quitaUna(w.bullets, (b) => igual(b, t));
        // Viñeta de PROYECTO: va compuesta dentro de la línea del proyecto.
        for (const p of d.projects) {
          if (hecho || !t) break;
          for (const k of ["es", "en"] as const) {
            if (n(p[k]).includes(t)) {
              p[k] = n(p[k]).replace(t, "");
              hecho = true;
            }
          }
        }
        break;
      }
      case "link": {
        const url = n(x.url);
        const links = d.basics.links as unknown[];
        hecho = !!url && quitaUna(links, (l) => n(typeof l === "string" ? l : (l as { url?: string }).url) === url);
        break;
      }
      case "reference":
        hecho = quitaUna(d.references, (r) => !!n(x.name) && (n(r.es).includes(n(x.name)) || n(r.en).includes(n(x.name))));
        break;
      case "language":
        hecho = quitaUna(d.languages, (l) => !!n(x.language) && (n(l.es).includes(n(x.language)) || n(l.en).includes(n(x.language))));
        break;
      case "certification":
        hecho = quitaUna(d.certifications, (c) => igual(c.title, n(x.name)));
        break;
      case "publication":
        hecho = quitaUna(d.publications, (p) => !!n(x.name) && (n(p.es).includes(n(x.name)) || n(p.en).includes(n(x.name))));
        break;
      case "work": {
        const antes = d.work.length;
        d.work = d.work.filter((w) => !(n(w.company) === n(x.company) && igual(w.title, n(x.title))));
        hecho = d.work.length < antes;
        break;
      }
      case "skill": {
        const antes = d.skills.length;
        d.skills = d.skills.filter((s) => !igual(s.group, n(x.group)));
        hecho = d.skills.length < antes;
        break;
      }
      case "project": {
        const nombre = n(x.name);
        const antes = d.projects.length;
        if (nombre) d.projects = d.projects.filter((p) => !(n(p.es).includes(nombre) || n(p.en).includes(nombre)));
        hecho = d.projects.length < antes;
        break;
      }
      case "education": {
        const antes = d.education.length;
        d.education = d.education.filter((e) => !(igual(e.title, n(x.degree)) && n(e.org) === n(x.institution)));
        hecho = d.education.length < antes;
        break;
      }
      case "summary": {
        // El documento imprime UN resumen: el primero visible. Quitar uno que no es el
        // impreso no ahorra nada; quitar el impreso deja paso al siguiente que quede.
        if (!igual(d.basics.summary, n(x.text))) {
          hecho = true;
          break;
        }
        const siguiente = items
          .filter((i) => i.kind === "summary" && i.visible && i.id !== q.id && !quitados.has(i.id))
          .sort((a, b) => a.sortOrder - b.sortOrder)[0];
        const txt = siguiente ? String(siguiente.datos.text ?? "") : "";
        d.basics.summary = { es: txt, en: txt };
        hecho = true;
        break;
      }
    }
    if (!hecho) sinSimular += 1;
  }

  for (const a of propuesta.acortar) {
    const o = n(a.original);
    let hecho = noSeImprime({ text: a.original });
    const cambia = (v: { es: string; en: string }) => {
      for (const k of ["es", "en"] as const) {
        if (n(v[k]) === o) {
          v[k] = a.propuesto;
          hecho = true;
        } else if (o && n(v[k]).includes(o)) {
          v[k] = n(v[k]).replace(o, a.propuesto);
          hecho = true;
        }
      }
    };
    if (a.kind === "bullet") {
      for (const w of d.work) w.bullets.forEach(cambia);
      if (!hecho) d.projects.forEach(cambia); // viñeta de proyecto
    }
    else if (a.kind === "summary") cambia(d.basics.summary);
    else if (a.kind === "project") d.projects.forEach(cambia);
    if (!hecho) sinSimular += 1;
  }
  return { data: d, sinSimular };
}

/**
 * Los recortes SIN los que tocan un item de «incluir siempre» (ids del master).
 * Un rol tampoco se quita si una de sus viñetas está protegida: quitarlo la
 * quitaría con él.
 */
export function sinProtegidos(
  items: AjusteItem[],
  propuesta: Pick<AjusteResult, "quitar" | "acortar">,
  protegidos: ReadonlySet<string>,
): { quitar: PropuestaQuitar[]; acortar: PropuestaAcortar[]; protegidos: number } {
  if (!protegidos.size) return { quitar: [...propuesta.quitar], acortar: [...propuesta.acortar], protegidos: 0 };
  const porId = new Map(items.map((i) => [i.id, i]));
  const tocaProtegido = (id: string) => {
    const it = porId.get(id);
    if (!it) return false;
    if (protegidos.has(it.itemId)) return true;
    return items.some((h) => h.parentId === it.itemId && protegidos.has(h.itemId));
  };
  const quitar = propuesta.quitar.filter((q) => !tocaProtegido(q.id));
  return { quitar, acortar: [...propuesta.acortar], protegidos: propuesta.quitar.length - quitar.length };
}

// ── Paso 1: capacidad y parecido ─────────────────────────────────────────────
/**
 * La capacidad de una plantilla a 10 pt, en «caracteres por página»: líneas de
 * cuerpo que caben × caracteres que lleva cada línea. Es una cota para FILTRAR y
 * ORDENAR, no una promesa: las que pasan se renderizan y se miden de verdad.
 */
export function capacidad(t: CvTemplate): number {
  const m = resolveMetrics(escalarMetricas(t.metrics, CUERPO_MIN_PT));
  const margen = /^\s*(\d+(?:\.\d+)?)\s*mm\s*$/i.exec(m.pageMarginH);
  const caja = 612 - 2 * (margen ? (parseFloat(margen[1]!) * 72) / 25.4 : 60);
  const ancho = t.layout.sidebar ? caja * 0.62 : caja;
  return lineasQueCaben(m) * (ancho / m.bodySize);
}

/** Parecido de estilo: misma gama, misma pareja, misma paleta, etiquetas comunes. */
export function parecido(a: CvTemplate, b: CvTemplate): number {
  const tags = new Set(tagsOf(a));
  return (
    (a.gama === b.gama ? 4 : 0) +
    (a.layout.sidebar === b.layout.sidebar ? 2 : 0) +
    (a.typography.id === b.typography.id ? 2 : 0) +
    (a.palette.id === b.palette.id ? 1 : 0) +
    tagsOf(b).filter((x) => tags.has(x)).length * 0.5
  );
}

/**
 * Corte del prefiltro: una plantilla con menos del 90 % de la capacidad de la
 * actual (que NO cabe) no se renderiza. Es holgado a propósito: la capacidad
 * estimada se equivoca (medido en las 65: la que más cabe no es la de más
 * capacidad), así que solo descarta lo que claramente tiene menos sitio.
 */
export const CORTE_CAPACIDAD = 0.9;
/**
 * Y un corte ABSOLUTO: si el documento necesita ×N la capacidad de la actual para
 * caber, una plantilla con menos del 75 % de ese ×N no se renderiza. Un CV de 8
 * páginas contra 2 necesita ×4 y ninguna del catálogo llega a ×1,5: se va directo a
 * la plantilla a medida en vez de gastar 60 renders en saber lo que ya se sabe.
 */
export const HOLGURA_NECESARIA = 0.75;

export interface Candidatas {
  /** en el orden en que se miden: más parecidas primero */
  lista: CvTemplate[];
  consideradas: number;
  propias: number;
  porCapacidad: number;
  porFoto: number;
}

/**
 * Las plantillas que se van a medir, en orden. Entran todas (catálogo + propias)
 * menos la actual; fuera las de foto si el documento no lleva foto, y las que el
 * prefiltro de capacidad descarta (relativo a la actual y a lo que el documento
 * necesita). Determinista: mismo catálogo, mismo orden.
 */
export function candidatas(
  actual: CvTemplate,
  propias: readonly CvTemplate[],
  conFoto: boolean,
  /** capacidad que el documento necesita, relativa a la actual (1 = la actual) */
  necesaria = 0,
): Candidatas {
  const corte = Math.max(CORTE_CAPACIDAD, necesaria * HOLGURA_NECESARIA);
  const c0 = Math.max(1, capacidad(actual));
  const vistas = new Set<string>([actual.id]);
  const todas: CvTemplate[] = [];
  for (const t of [...listTemplates(), ...propias]) {
    if (vistas.has(t.id)) continue;
    vistas.add(t.id);
    todas.push(t);
  }
  let porFoto = 0;
  let porCapacidad = 0;
  const filas: { t: CvTemplate; r: number; s: number }[] = [];
  for (const t of todas) {
    if (t.layout.photo && !conFoto) {
      porFoto += 1;
      continue;
    }
    const r = capacidad(t) / c0;
    if (r < corte) {
      porCapacidad += 1;
      continue;
    }
    filas.push({ t, r, s: parecido(actual, t) });
  }
  filas.sort((a, b) => b.s - a.s || b.r - a.r || a.t.id.localeCompare(b.t.id));
  return {
    lista: filas.map((x) => x.t),
    consideradas: todas.length,
    propias: propias.filter((p) => p.id !== actual.id).length,
    porCapacidad,
    porFoto,
  };
}

/** El documento tal como se mide con la plantilla `t`. Una propia lleva su paleta y su pareja dentro. */
export function docCon(data: ResumeData, t: CvTemplate): ResumeData {
  return esPlantillaUsuario(t.id)
    ? { ...data, templateId: t.id, paletteId: undefined, typographyId: undefined }
    : { ...data, templateId: t.id };
}

// ── Todo junto ───────────────────────────────────────────────────────────────
export interface MotorAjuste {
  render: (data: ResumeData, opts: RenderOpts) => Promise<Uint8Array>;
  medir: (buf: Uint8Array, m: ResolvedMetrics) => Promise<MedidaPdf>;
  medida?: MedidaDeps;
  ahora?: () => number;
}
const MOTOR: MotorAjuste = {
  render: async (data, opts) => new Uint8Array(await renderResumeToBuffer(data, opts)),
  medir: (buf, m) => medirPdf(buf, m),
};

export interface AjusteInput {
  data: ResumeData;
  objetivo: number;
  /** el autofit ya hecho sobre la plantilla actual */
  actual: ResultadoAutofit;
  /** plantillas personalizadas del usuario, ya registradas */
  propias?: readonly CvTemplate[];
  /** trae la propuesta de recortes; solo se llama si los pasos 1 y 2 no alcanzan */
  recortes?: () => Promise<{ items: AjusteItem[]; propuesta: Pick<AjusteResult, "quitar" | "acortar"> }>;
  /** ids del MASTER que un recorte nunca quita (reglas · incluirSiempre) */
  protegidos?: ReadonlySet<string>;
  /** el documento no puede llevar foto (regla sinFoto): fuera las plantillas de foto */
  sinFoto?: boolean;
  opts?: RenderOpts;
  /** tope de tiempo para medir plantillas (ms) */
  topeMs?: number;
  /** cuántas «otras opciones» se devuelven con miniatura */
  maxAlternativas?: number;
  onProgreso?: (p: ProgresoAjuste) => void;
  /** solo buscar plantillas: no pasa a la plantilla a medida ni a los recortes (acción «opciones») */
  soloPlantillas?: boolean;
}

export const TOPE_MS = 45_000;
const b64 = (buf: Uint8Array) => Buffer.from(buf).toString("base64");

export async function resolverAjuste(input: AjusteInput, motor: MotorAjuste = MOTOR): Promise<ResultadoAjuste> {
  const ahora = motor.ahora ?? Date.now;
  const t0 = ahora();
  const { data, objetivo, actual, opts = {} } = input;
  const plantilla = plantillaDe(data);
  const tope = input.topeMs ?? TOPE_MS;
  const maxAlt = input.maxAlternativas ?? 4;
  const progreso = input.onProgreso ?? (() => {});
  const conFoto = !!data.photo && !input.sinFoto;
  const deps: AutofitDeps = { render: motor.render, medir: motor.medir };

  const res: ResultadoAjuste = {
    objetivo,
    resueltoPor: null,
    antes: { templateId: plantilla.id, nombre: plantilla.name, paginas: actual.medida.porPagina.length, cuerpo: actual.bodySize },
    plantilla: null,
    medida: null,
    recortes: null,
    alternativas: [],
    medicion: { consideradas: 0, propias: 0, porCapacidad: 0, porFoto: 0, medidas: 0, caben: 0, tope: false, ms: 0 },
    razon: null,
  };
  const fin = () => {
    res.medicion.ms = ahora() - t0;
    return res;
  };
  if (!actual.noCabe && !input.soloPlantillas) {
    res.resueltoPor = "ya-cabe";
    return fin();
  }

  // 1 · Todas las plantillas, con el contenido TAL CUAL. Render a 10 pt (el suelo):
  //     si ahí no cabe, en esa plantilla no cabe; si cabe, el autofit elige después
  //     el cuerpo más grande que cabe (solo para la aplicada y las alternativas).
  // Cuánto más sitio hace falta: líneas medidas / (objetivo × líneas de una página llena).
  const llenas = actual.medida.porPagina.slice(0, -1);
  const porPagina = llenas.length ? Math.max(...llenas) : actual.medida.caben;
  const necesaria = actual.medida.total / Math.max(1, objetivo * porPagina);
  const cands = candidatas(plantilla, input.propias ?? [], conFoto, necesaria);
  Object.assign(res.medicion, {
    consideradas: cands.consideradas,
    propias: cands.propias,
    porCapacidad: cands.porCapacidad,
    porFoto: cands.porFoto,
  });
  const caben: { t: CvTemplate; doc: ResumeData; suelo: Uint8Array }[] = [];
  const total = cands.lista.length;
  progreso({ paso: 1, hechas: 0, total });
  for (const t of cands.lista) {
    if (ahora() - t0 > tope) {
      res.medicion.tope = true;
      break;
    }
    const doc = docCon(data, t);
    const pt = plantillaDe(doc);
    const base = pt.metrics.bodySize;
    const suelo = await motor.render(doc, { ...opts, bodySize: base > CUERPO_MIN_PT ? CUERPO_MIN_PT : undefined });
    const m = await motor.medir(suelo, resolveMetrics(escalarMetricas(pt.metrics, Math.min(base, CUERPO_MIN_PT))));
    res.medicion.medidas += 1;
    if (m.porPagina.length <= objetivo) caben.push({ t, doc, suelo });
    progreso({ paso: 1, hechas: res.medicion.medidas, total });
  }
  res.medicion.caben = caben.length;

  // La aplicada (la primera que cabe) y las alternativas: autofit real, reusando el
  // render del suelo que ya se hizo.
  const opcion = async (c: (typeof caben)[number]): Promise<OpcionPlantilla> => {
    const pt = plantillaDe(c.doc);
    const conSuelo: AutofitDeps = {
      render: (d, o) => (o.bodySize === CUERPO_MIN_PT ? Promise.resolve(c.suelo) : deps.render(d, o)),
      medir: deps.medir,
    };
    const r = await autofit(c.doc, pt, objetivo, opts, conSuelo);
    return {
      templateId: c.t.id,
      nombre: c.t.name,
      gama: c.t.gama,
      propia: esPlantillaUsuario(c.t.id),
      paginas: r.medida.porPagina.length,
      cuerpo: r.bodySize,
      pdf: b64(r.buf),
    };
  };
  const elegidas = await Promise.all(caben.slice(0, 1 + maxAlt).map(opcion));
  if (input.soloPlantillas) {
    res.alternativas = elegidas;
    return fin();
  }
  if (elegidas.length) {
    res.plantilla = elegidas[0]!;
    res.alternativas = elegidas.slice(1);
    res.resueltoPor = "plantilla";
    return fin();
  }

  // 2 · La plantilla a medida.
  progreso({ paso: 2 });
  const m = await buscarPlantillaMedida(data, plantilla, objetivo, opts, motor.medida);
  if (m.ok) {
    res.medida = { params: m.params, paginas: m.paginas, cuerpo: m.params.cuerpo, pdf: b64(m.buf) };
    res.resueltoPor = "medida";
    return fin();
  }
  const razonMedida = m.razon ?? `la plantilla a medida queda en ${m.paginas} páginas`;

  // 3 · Los recortes, todos de una vez, sobre la plantilla actual.
  progreso({ paso: 3 });
  if (!input.recortes) {
    res.razon = razonMedida;
    return fin();
  }
  let plan: Awaited<ReturnType<NonNullable<AjusteInput["recortes"]>>>;
  try {
    plan = await input.recortes();
  } catch (e) {
    res.razon = e instanceof Error ? e.message : String(e);
    return fin();
  }
  const filtrada = sinProtegidos(plan.items, plan.propuesta, input.protegidos ?? new Set());
  if (!filtrada.quitar.length && !filtrada.acortar.length) {
    res.razon = filtrada.protegidos
      ? "los únicos recortes propuestos tocan items de «incluir siempre»"
      : "no hay recortes propuestos";
    return fin();
  }
  const sim = simularRecortes(data, plan.items, filtrada);
  const r = await autofit(sim.data, plantilla, objetivo, opts, deps);
  res.recortes = {
    quitar: filtrada.quitar,
    acortar: filtrada.acortar,
    protegidos: filtrada.protegidos,
    paginas: r.medida.porPagina.length,
    cuerpo: r.bodySize,
    sinSimular: sim.sinSimular,
  };
  if (!r.noCabe) res.resueltoPor = "recortes";
  else res.razon = `ni con los ${filtrada.quitar.length + filtrada.acortar.length} recortes cabe: quedan ${r.medida.porPagina.length} páginas`;
  return fin();
}
