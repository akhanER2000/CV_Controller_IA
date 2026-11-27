import { normalize } from "@/lib/verify";
import { matchStagedAgainstMaster, type MasterItemLite } from "@/lib/db/sources";
import { DEFAULT_SECTION_ORDER, type SectionId } from "@/lib/cv/templates";
import type { StagedRow } from "@/lib/extract/types";

/* ============================================================================
   «PARTIR DE MI CV ANTERIOR» (DA-V7) — la parte PURA del plan.
   ============================================================================
   La extracción es la de siempre (runImport). Aquí solo se decide, sin red ni
   base, lo que esta puerta añade encima:

     · ORDEN DEL DOCUMENTO. El extractor trocea por secciones; el CV tenía las
       suyas en SU orden. Cada item cita un fragmento LITERAL (la evidencia), y
       la posición de ese fragmento en el texto leído ES su lugar en el CV. No se
       adivina: se busca.
     · PÁGINA. En un PDF el fragmento se busca página a página: «de: CV anterior,
       página N». Un DOCX no tiene páginas fiables (las decide quien lo abre), así
       que ahí no se inventa ninguna.
     · QUÉ YA ESTÁ EN EL MASTER. El matcher fuerte de siempre (work/project/skill,
       nivel 'alta') + igualdad EXACTA de contenido para el resto + el basics, que
       es la identidad y hay uno. Conservador a propósito: ante la duda, el item
       entra como nuevo (re-proponer es el lado seguro; marcar como «ya está» algo
       nuevo perdería un dato real).
   ============================================================================ */

/** Metadatos de staging que esta puerta añade (se limpian al promover: empiezan por `_`). */
export const CAMPO_ORDEN = "_orden";
export const CAMPO_PAGINA = "_pagina";

/** El tramo de evidencia que se busca si la cita entera no aparece (cortes de línea, guiones). */
const PREFIJO = 40;

function buscar(hay: string, ev: string): number {
  if (!ev) return -1;
  const i = hay.indexOf(ev);
  if (i >= 0) return i;
  return ev.length > PREFIJO ? hay.indexOf(ev.slice(0, PREFIJO)) : -1;
}

export interface FilaOrdenada {
  fila: StagedRow;
  /** 0..n-1, el orden del documento */
  orden: number;
  /** 1-based; null si no hay páginas (DOCX) o la cita no se encontró */
  pagina: number | null;
}

/**
 * Ordena las filas como estaban en el CV. `paginas` = el texto de cada página
 * (PDF); sin él, ninguna fila lleva página. PURO y estable.
 *
 * · Sin evidencia localizable, una fila hereda la posición de la anterior: queda
 *   donde el extractor la dejó, junto a sus vecinas.
 * · El basics (cabecera) va primero si no se localizó.
 * · Una viñeta nunca queda antes que su rol.
 */
export function ordenarComoElCv(filas: StagedRow[], texto: string, paginas?: string[]): FilaOrdenada[] {
  const hay = normalize(texto);
  const pags = (paginas ?? []).map(normalize);
  const posDe = new Map<string, number>();
  let ultima = -1;
  const conPos = filas.map((fila, i) => {
    const ev = normalize(fila.evidenceSnippet ?? "");
    let pos = buscar(hay, ev);
    if (pos < 0) pos = fila.kind === "basics" ? -1 : ultima;
    if (fila.kind === "bullet" && fila.parentKey) {
      const padre = posDe.get(fila.parentKey);
      if (padre !== undefined && pos < padre) pos = padre;
    }
    ultima = Math.max(ultima, pos);
    posDe.set(fila.key, pos);
    let pagina: number | null = null;
    if (pags.length && ev) {
      const k = pags.findIndex((p) => buscar(p, ev) >= 0);
      if (k >= 0) pagina = k + 1;
    }
    return { fila, pos, i, pagina };
  });
  // Viñetas cuyo rol aparece DESPUÉS en el arreglo: se recolocan a la posición del rol.
  for (const c of conPos) {
    if (c.fila.kind !== "bullet" || !c.fila.parentKey) continue;
    const padre = posDe.get(c.fila.parentKey);
    if (padre !== undefined && c.pos < padre) c.pos = padre;
  }
  // Desempate en la misma posición: una viñeta va pegada DETRÁS de su rol.
  const indiceDe = new Map(conPos.map((c) => [c.fila.key, c.i]));
  const ancla = (c: (typeof conPos)[number]) =>
    c.fila.kind === "bullet" && c.fila.parentKey ? indiceDe.get(c.fila.parentKey) ?? c.i : c.i;
  const esVineta = (c: (typeof conPos)[number]) => (c.fila.kind === "bullet" ? 1 : 0);
  conPos.sort((a, b) => a.pos - b.pos || ancla(a) - ancla(b) || esVineta(a) - esVineta(b) || a.i - b.i);
  // Una viñeta sin página hereda la de su rol (está escrita debajo).
  const paginaDe = new Map(conPos.map((c) => [c.fila.key, c.pagina]));
  return conPos.map((c, orden) => ({
    fila: c.fila,
    orden,
    pagina: c.pagina ?? (c.fila.parentKey ? paginaDe.get(c.fila.parentKey) ?? null : null),
  }));
}

/** item_kind → la sección del documento donde se pinta. basics/bullet/link no son sección. */
export const SECCION_DE: Record<string, SectionId | undefined> = {
  summary: "summary",
  skill: "skills",
  work: "work",
  project: "projects",
  education: "education",
  certification: "certifications",
  language: "languages",
  publication: "publications",
  reference: "references",
};

/** El orden de secciones del CV: la primera aparición de cada una. null si no hay ninguna. */
export function seccionesEnOrden(kinds: string[]): SectionId[] | null {
  const out: SectionId[] = [];
  for (const k of kinds) {
    const s = SECCION_DE[k];
    if (s && !out.includes(s)) out.push(s);
  }
  return out.length ? out : null;
}

/** ¿El orden del CV difiere del de por defecto? (si no, no se guarda: hereda la plantilla). */
export function ordenPropio(orden: SectionId[] | null): boolean {
  if (!orden) return false;
  const base = DEFAULT_SECTION_ORDER.filter((s) => orden.includes(s));
  return orden.some((s, i) => s !== base[i]);
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** El título que tenía el CV (basics.label), o "". */
export function tituloDelCv(filas: StagedRow[]): string {
  return str(filas.find((f) => f.kind === "basics")?.data.label).trim();
}

/** Nombre de archivo sin extensión ni ruido: «cv_valentina-2024.pdf» → «cv valentina-2024». */
export function nombreSinExtension(nombre: string): string {
  return nombre.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_+/g, " ").trim();
}

/** Campos que no son contenido: metadatos de staging y fechas DERIVADAS de `dates`. */
const RUIDO = /^(_|date(Start|End|Current|Missing|Invalid)$)/;

/** La huella de contenido de un item: todo su texto, normalizado y en orden de clave. */
export function huella(data: Record<string, unknown>): string {
  return Object.keys(data)
    .filter((k) => !RUIDO.test(k))
    .sort()
    .map((k) => {
      const v = data[k];
      if (typeof v === "string") return normalize(v);
      if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? normalize(x) : "")).join(",");
      return "";
    })
    .filter(Boolean)
    .join("|");
}

/** Un item del master tal como lo necesita el casado (con su padre, para las viñetas). */
export interface ItemMaster extends MasterItemLite {
  parentId: string | null;
}

/**
 * Casa las filas del CV contra el master: clave local → id del profile_item que
 * YA contiene ese hecho. Lo que no casa es nuevo. PURO.
 *
 *   1. work/project/skill: el matcher fuerte de siempre (matchStagedAgainstMaster).
 *   2. basics: el del master, si existe (la identidad es una).
 *   3. el resto (summary, education, certification…): misma huella de contenido
 *      y mismo kind. Education también por título + institución.
 *   4. viñetas: solo bajo un rol ya casado, con el mismo texto que una viñeta
 *      de ese rol en el master.
 *
 * Cada item del master se usa como mucho una vez (dos filas del CV no pueden ser
 * el mismo hecho del master: la segunda entra como nueva).
 */
export function casarConMaster(master: ItemMaster[], filas: StagedRow[]): Map<string, string> {
  const out = new Map<string, string>();
  const usados = new Set<string>();
  const fijar = (k: string, id: string) => {
    if (out.has(k) || usados.has(id)) return;
    out.set(k, id);
    usados.add(id);
  };

  const padres = master.filter((m) => m.kind !== "bullet");
  for (const [k, id] of matchStagedAgainstMaster(padres, filas)) fijar(k, id);

  const basics = padres.find((m) => m.kind === "basics");
  const filaBasics = filas.find((f) => f.kind === "basics");
  if (basics && filaBasics) fijar(filaBasics.key, basics.id);

  const eduId = (d: Record<string, unknown>) => {
    const deg = normalize(str(d.degree));
    const inst = normalize(str(d.institution));
    return deg && inst ? `${deg}@${inst}` : "";
  };
  for (const f of filas) {
    if (out.has(f.key) || f.kind === "bullet" || f.kind === "basics") continue;
    const h = huella(f.data);
    let m = h ? padres.find((p) => p.kind === f.kind && !usados.has(p.id) && huella(p.data) === h) : undefined;
    if (!m && f.kind === "education" && eduId(f.data)) {
      m = padres.find((p) => p.kind === "education" && !usados.has(p.id) && eduId(p.data) === eduId(f.data));
    }
    if (m) fijar(f.key, m.id);
  }

  for (const f of filas) {
    if (f.kind !== "bullet" || !f.parentKey || out.has(f.key)) continue;
    const rol = out.get(f.parentKey);
    if (!rol) continue;
    const t = normalize(str(f.data.text));
    const m = master.find((b) => b.kind === "bullet" && b.parentId === rol && !usados.has(b.id) && normalize(str(b.data.text)) === t);
    if (m) fijar(f.key, m.id);
  }
  return out;
}

/** El texto corto de una fila para la revisión («Analista de Datos · Banco Austral»). */
export function textoCorto(kind: string, data: Record<string, unknown>): string {
  const d = (k: string) => str(data[k]).trim();
  const partes: Record<string, string[]> = {
    basics: [d("name"), d("label")],
    summary: [d("text")],
    work: [d("title"), d("company")],
    bullet: [d("text")],
    education: [d("degree"), d("institution")],
    skill: [d("group"), d("items")],
    project: [d("name")],
  };
  const p = (partes[kind] ?? [d("name"), d("title"), d("language"), d("text")]).filter(Boolean);
  const t = p.join(" · ") || Object.values(data).filter((v): v is string => typeof v === "string" && !!v.trim())[0] || "";
  return t.length > 140 ? t.slice(0, 139) + "…" : t;
}
