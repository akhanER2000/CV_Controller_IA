/**
 * LA CASCADA DE «AJUSTAR PÁGINAS» (DA-A1). Tres pasos, en orden, y se para en el
 * primero que deja el CV en las páginas pedidas — medidas en el PDF real:
 *
 *   1 · La plantilla ACTUAL: autofit (cuerpo hasta 10 pt) y los recortes que se
 *       proponen (quitar / acortar, manuales y con candado). Se SIMULA aplicar todos
 *       los recortes y se mide: así se sabe, antes de aceptar nada, si alcanzan.
 *   2 · Otras plantillas del CATÁLOGO donde el MISMO contenido (sin recortar) cabe,
 *       de estilo parecido. Se preseleccionan por capacidad (lineasQueCaben × medida)
 *       y solo las mejores 3-5 se renderizan y miden.
 *   3 · «Plantilla a medida»: la arma el motor (plantilla-medida.ts) dentro de los
 *       límites ATS. Se guarda como plantilla del usuario solo si él la usa.
 *
 * Nada aquí escribe en la base ni llama a un modelo: entra el documento, sale el
 * informe. La ruta (api/variants/[id]/ajustar) hace el I/O.
 */

import type { RenderOpts } from "./ResumePDF";
import type { ResumeData } from "./resume";
import { autofit, type ResultadoAutofit } from "./autofit";
import { lineasQueCaben } from "./medir";
import { buscarPlantillaMedida, type ParamsMedida } from "./plantilla-medida";
import {
  CUERPO_MIN_PT,
  escalarMetricas,
  listTemplates,
  resolveMetrics,
  resolveTemplate,
  tagsOf,
  type CvTemplate,
} from "./templates";
import type { AjusteItem, AjusteResult } from "./ajuste";

// ── El informe (lo consume el panel de ajuste: tipos sin dependencias) ───────
export interface PasoActual {
  paso: 1;
  /** cuerpo con el que queda tras el autofit, y el de la plantilla */
  cuerpo: number;
  base: number;
  /** páginas reales tras el autofit, sin recortar nada */
  paginas: number;
  sobran: number;
  /** recortes propuestos (quitar + acortar) */
  propuestas: number;
  /** páginas reales si se aceptan TODOS los recortes; null si no hay recortes */
  paginasConRecortes: number | null;
  /** recortes que no se pudieron reproducir en la simulación (la cifra es una cota) */
  sinSimular: number;
  resuelve: boolean;
}
export interface CandidataCatalogo {
  templateId: string;
  nombre: string;
  gama: string;
  paginas: number;
  cuerpo: number;
  /** PDF (base64) con el que se pinta la miniatura: el mismo render que se midió */
  pdf: string;
}
export interface PasoCatalogo {
  paso: 2;
  /** cuántas se renderizaron y midieron (de las preseleccionadas por capacidad) */
  medidas: number;
  candidatas: CandidataCatalogo[];
  resuelve: boolean;
}
export interface PasoMedida {
  paso: 3;
  resuelve: boolean;
  paginas: number;
  params: ParamsMedida | null;
  cuerpo: number | null;
  pdf: string | null;
  razon: string | null;
}
export interface Cascada {
  objetivo: number;
  /** el paso que deja el CV en las páginas pedidas; null si ninguno lo consigue */
  resueltoPor: 1 | 2 | 3 | null;
  /** la variante analizada (la pone la ruta: el panel guarda y aplica sobre ella) */
  variantId?: string;
  pasos: Array<PasoActual | PasoCatalogo | PasoMedida>;
}

// ── Paso 1: simular los recortes propuestos ─────────────────────────────────
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

// ── Paso 2: preselección por capacidad ───────────────────────────────────────
/**
 * La capacidad de una plantilla a 10 pt, en «caracteres por página»: líneas de
 * cuerpo que caben × caracteres que lleva cada línea. Es una cota para ORDENAR, no
 * una promesa: las que pasan el corte se renderizan y se miden de verdad.
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
 * Las `max` candidatas que se van a medir. Entran las que caben más que la actual;
 * primero las que, por capacidad, deberían bastar (`necesaria`), y entre ellas las
 * más parecidas. Determinista: mismo catálogo y misma plantilla → misma lista.
 */
export function preseleccionar(actual: CvTemplate, necesaria: number, max = 5): CvTemplate[] {
  const c0 = capacidad(actual);
  const filas = listTemplates()
    .filter((t) => t.id !== actual.id && !t.layout.photo)
    .map((t) => ({ t, r: capacidad(t) / c0, s: parecido(actual, t) }))
    .filter((x) => x.r > 1.02);
  const basta = (x: { r: number }) => (x.r >= necesaria ? 1 : 0);
  filas.sort((a, b) => basta(b) - basta(a) || b.s - a.s || b.r - a.r || a.t.id.localeCompare(b.t.id));
  return filas.slice(0, max).map((x) => x.t);
}

// ── La cascada entera ────────────────────────────────────────────────────────
export interface CascadaInput {
  data: ResumeData;
  objetivo: number;
  /** el autofit ya hecho sobre la plantilla actual (la ruta lo necesita igual) */
  actual: ResultadoAutofit;
  items: AjusteItem[];
  propuesta: Pick<AjusteResult, "quitar" | "acortar">;
  opts?: RenderOpts;
  /** cuántas candidatas del catálogo se renderizan como mucho */
  maxCandidatas?: number;
}

const b64 = (buf: Uint8Array) => Buffer.from(buf).toString("base64");

export async function cascada(input: CascadaInput): Promise<Cascada> {
  const { data, objetivo, actual, items, propuesta, opts = {} } = input;
  const plantilla = resolveTemplate({ templateId: data.templateId, paletteId: data.paletteId, typographyId: data.typographyId });
  const pasos: Cascada["pasos"] = [];

  // 1 · La plantilla actual.
  const nRecortes = propuesta.quitar.length + propuesta.acortar.length;
  let paginasConRecortes: number | null = null;
  let sinSimular = 0;
  if (actual.noCabe && nRecortes > 0) {
    const sim = simularRecortes(data, items, propuesta);
    sinSimular = sim.sinSimular;
    const r = await autofit(sim.data, plantilla, objetivo, opts);
    paginasConRecortes = r.medida.porPagina.length;
  }
  const paso1: PasoActual = {
    paso: 1,
    cuerpo: actual.bodySize,
    base: actual.base,
    paginas: actual.medida.porPagina.length,
    sobran: actual.sobran,
    propuestas: nRecortes,
    paginasConRecortes,
    sinSimular,
    resuelve: !actual.noCabe || (paginasConRecortes != null && paginasConRecortes <= objetivo),
  };
  pasos.push(paso1);
  if (paso1.resuelve) return { objetivo, resueltoPor: 1, pasos };

  // 2 · El catálogo, con el MISMO contenido.
  const total = actual.medida.total;
  const llenas = actual.medida.porPagina.slice(0, -1);
  const porPagina = llenas.length ? Math.max(...llenas) : actual.medida.caben;
  const necesaria = total / Math.max(1, objetivo * porPagina);
  const elegidas = preseleccionar(plantilla, necesaria, input.maxCandidatas ?? 5);
  const candidatas: CandidataCatalogo[] = [];
  for (const t of elegidas) {
    const doc: ResumeData = { ...data, templateId: t.id };
    const r = await autofit(doc, resolveTemplate({ templateId: t.id, paletteId: data.paletteId, typographyId: data.typographyId }), objetivo, opts);
    if (!r.noCabe) {
      candidatas.push({ templateId: t.id, nombre: t.name, gama: t.gama, paginas: r.medida.porPagina.length, cuerpo: r.bodySize, pdf: b64(r.buf) });
    }
  }
  pasos.push({ paso: 2, medidas: elegidas.length, candidatas, resuelve: candidatas.length > 0 });
  if (candidatas.length) return { objetivo, resueltoPor: 2, pasos };

  // 3 · La plantilla a medida.
  const m = await buscarPlantillaMedida(data, plantilla, objetivo, opts);
  pasos.push({
    paso: 3,
    resuelve: m.ok,
    paginas: m.paginas,
    params: m.ok ? m.params : null,
    cuerpo: m.ok ? m.params.cuerpo : null,
    pdf: m.ok ? b64(m.buf) : null,
    razon: m.ok ? null : (m.razon ?? null),
  });
  return { objetivo, resueltoPor: m.ok ? 3 : null, pasos };
}
