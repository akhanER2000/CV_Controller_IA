/**
 * EL AUTOFIT — el cuerpo más grande con el que el documento cabe en N páginas.
 *
 * El usuario elige 1, 2 o 3 páginas. Antes de proponer recortar nada, el documento
 * prueba a caber BAJANDO EL CUERPO, desde el de la plantilla (el techo: nunca se
 * sube) hasta 10 pt (el suelo: por debajo se lee peor de lo que se gana). Si ni a
 * 10 pt cabe, no se sigue encogiendo: se devuelve `noCabe` y la decisión pasa al
 * flujo de recorte que ya existe (ajuste.ts), que es manual y con candado.
 *
 * ★ SE MIDE RENDERIZANDO, no estimando. Cada candidato es un PDF real del mismo
 * motor que el preview y la descarga, y «cabe» se decide sobre ese PDF:
 *   · sus páginas REALES (numPages) ≤ objetivo — el salto de página lo decide el
 *     motor de maquetación y solo se sabe renderizando (medir.ts lo advierte);
 *   · y, en una columna, `lineasQueSobran ≤ 0` — la misma cuenta que enseña el
 *     panel de recorte, para que «cabe» y «sobran N líneas» no se contradigan.
 *     En la gama de barra lateral esa cuenta suma dos columnas que comparten
 *     página y no significa nada; ahí manda solo el número de páginas.
 *
 * Búsqueda binaria sobre la rejilla de 0,25 pt entre 10 y el cuerpo de la
 * plantilla (más el propio cuerpo base, que puede no caer en la rejilla). El caso
 * común —ya cabe— cuesta UN render; el peor, cuatro.
 *
 * Pura en el sentido que importa: sin red ni base de datos. El render y la medida
 * se inyectan (`deps`) para poder probar la búsqueda sin fontkit.
 */

import { renderResumeToBuffer, type RenderOpts } from "./ResumePDF";
import { medirPdf, lineasQueSobran, type MedidaPdf } from "./medir";
import {
  CUERPO_MIN_PT,
  escalarMetricas,
  resolveMetrics,
  resolveTemplate,
  type CvTemplate,
  type ResolvedMetrics,
} from "./templates";
import type { ResumeData } from "./resume";

/** Paso de la rejilla de cuerpos, en pt. */
export const PASO_PT = 0.25;

/** Páginas que el usuario puede pedir. Cualquier otra cosa cae en 2. */
export const PAGINAS_VALIDAS = [1, 2, 3] as const;
export type PaginasObjetivo = (typeof PAGINAS_VALIDAS)[number];

/** El objetivo de páginas normalizado: 1, 2 o 3; el resto (99, "x", nada) = 2. */
export function objetivoDe(v: unknown): PaginasObjetivo {
  const n = Number(v);
  return n === 1 || n === 3 ? n : 2;
}

export interface ResultadoAutofit {
  /** El cuerpo elegido (pt). Con `noCabe`, 10. */
  bodySize: number;
  /** El cuerpo de la plantilla (el techo). */
  base: number;
  /** Ni a 10 pt cabe en el objetivo: toca recortar. */
  noCabe: boolean;
  objetivo: PaginasObjetivo;
  /** El PDF del cuerpo elegido: quien llama no tiene que volver a renderizar. */
  buf: Uint8Array;
  /** Su medida, con la métrica de ESE cuerpo. */
  medida: MedidaPdf;
  /** lineasQueSobran(medida, objetivo). */
  sobran: number;
}

export interface AutofitDeps {
  render: (data: ResumeData, opts: RenderOpts) => Promise<Uint8Array>;
  medir: (buf: Uint8Array, m: ResolvedMetrics) => Promise<MedidaPdf>;
}

const DEPS: AutofitDeps = {
  render: async (data, opts) => new Uint8Array(await renderResumeToBuffer(data, opts)),
  medir: (buf, m) => medirPdf(buf, m),
};

/** La plantilla efectiva de un documento, con los mismos overrides que el render. */
export function plantillaDe(data: ResumeData, opts: RenderOpts = {}): CvTemplate {
  return resolveTemplate({
    templateId: opts.templateId ?? data.templateId,
    paletteId: opts.paletteId ?? data.paletteId,
    typographyId: opts.typographyId ?? data.typographyId,
  });
}

/** Los cuerpos candidatos, de menor a mayor: 10, 10,25, … y el de la plantilla. */
export function rejillaDeCuerpos(base: number): number[] {
  if (!(base > CUERPO_MIN_PT)) return [CUERPO_MIN_PT];
  const r: number[] = [];
  for (let v = CUERPO_MIN_PT; v < base - 1e-9; v += PASO_PT) r.push(Math.round(v * 100) / 100);
  r.push(base);
  return r;
}

export async function autofit(
  resume: ResumeData,
  plantilla: CvTemplate,
  objetivoPedido: number,
  opts: RenderOpts = {},
  deps: AutofitDeps = DEPS,
): Promise<ResultadoAutofit> {
  const objetivo = objetivoDe(objetivoPedido);
  const base = plantilla.metrics.bodySize;
  const unaColumna = !plantilla.layout.sidebar;
  const cache = new Map<number, ResultadoAutofit>();

  const probar = async (size: number): Promise<ResultadoAutofit> => {
    const hit = cache.get(size);
    if (hit) return hit;
    const buf = await deps.render(resume, { ...opts, bodySize: size < base ? size : undefined });
    const metrica = resolveMetrics(escalarMetricas(plantilla.metrics, size));
    const medida = await deps.medir(buf, metrica);
    const sobran = lineasQueSobran(medida, objetivo);
    const cabe = medida.porPagina.length <= objetivo && (!unaColumna || sobran <= 0);
    const r: ResultadoAutofit = { bodySize: size, base, noCabe: !cabe, objetivo, buf, medida, sobran };
    cache.set(size, r);
    return r;
  };

  const grid = rejillaDeCuerpos(base);
  // 1 · El caso común: con el cuerpo de la plantilla ya cabe.
  const techo = await probar(grid[grid.length - 1]!);
  if (!techo.noCabe || grid.length === 1) return techo;

  // 2 · El suelo: si a 10 pt tampoco cabe, no se encoge más — se recorta.
  const suelo = await probar(grid[0]!);
  if (suelo.noCabe) return suelo;

  // 3 · Binaria: grid[lo] cabe, grid[hi] no. Se busca el mayor que cabe.
  let lo = 0;
  let hi = grid.length - 1;
  let mejor = suelo;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const r = await probar(grid[mid]!);
    if (r.noCabe) hi = mid;
    else {
      lo = mid;
      mejor = r;
    }
  }
  return mejor;
}
