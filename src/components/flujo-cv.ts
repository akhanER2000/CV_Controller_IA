/* ============================================================================
   FLUJO DEL CV — la lógica PURA de «las decisiones viven en el documento».

   El panel anterior enseñaba la propuesta de /ajustar como cuatro listas aparte
   (quitar · reordenar · acortar · qué falta). Aquí se reparte esa MISMA propuesta
   sobre los items de la variante: cada decisión aparece bajo el item al que
   afecta y desaparece al tomarla. Nada de esto decide por el usuario ni toca el
   motor (src/lib/cv/ajuste.ts): solo dice QUÉ enseñar y DÓNDE.

   Reglas que viven aquí, y se prueban en tests/flujo-cv.test.ts:
     · una propuesta decidida (aceptada o rechazada) ya no se enseña;
     · una propuesta sobre un item que ya no está en la variante, tampoco;
     · lo ya verificado no exige revisión: un item cuyo texto pasó el candado no
       recibe otra propuesta de acortado;
     · un reordenado que el orden actual ya cumple no pide decisión (aceptarlo
       sería un no-op: computeReorder devuelve null).
   ============================================================================ */

// ── Contrato de POST /api/variants/[id]/ajustar (src/lib/cv/ajuste.ts) ───────
// Se redeclara en el cliente para no arrastrar zod ni verify.ts al bundle por un
// puñado de campos. NO hay `score` ni porcentaje: el único número es `sobran`,
// que sale de MEDIR el PDF.
export interface FitQuitar { id: string; kind: string; texto: string; motivo: string }
export interface FitReordenar { id: string; kind: string; texto: string; parentId: string; desde: number; hasta: number }
export interface FitAcortar {
  id: string; kind: string; campo: string;
  original: string; propuesto: string; motivo: string; ahorro: number;
}
export type FitTipoFalta = "sin-cifra" | "sin-fecha" | "sin-respaldo";
export interface FitFalta { id: string; kind: string; texto: string; tipo: FitTipoFalta; detalle: string }
export interface FitDescartado { tipo: string; id: string; propuesto: string; razon: string }
export interface Fit {
  paginas: number;
  paginasObjetivo: number;
  /** líneas que sobran, MEDIDAS sobre el PDF. Negativo = sobra sitio. */
  sobran: number;
  quitar: FitQuitar[];
  reordenar: FitReordenar[];
  acortar: FitAcortar[];
  falta: FitFalta[];
  descartados: FitDescartado[];
  notas: string;
}
/** decisión del usuario sobre UNA propuesta. No existe "todas". */
export type FitMark = "ok" | "no" | "undo";

/** Lo que /api/cv dice del autofit del PDF que devuelve (autofit.ts). */
export interface AutofitInfo {
  bodySize: number;
  base: number;
  noCabe: boolean;
  objetivo: number;
  sobran: number;
}

/** Una propuesta, ya colocada sobre su item. `clave` = la de fitDone ("q:id"…). */
export type PropEnLinea =
  | { tipo: "q"; clave: string; p: FitQuitar }
  | { tipo: "r"; clave: string; p: FitReordenar }
  | { tipo: "a"; clave: string; p: FitAcortar };

/** Lo mínimo del item de la variante que necesita el reparto. */
export interface ItemFlujo {
  id: string;
  override_verified: boolean;
}

/** ¿El usuario ya decidió esta propuesta? «undo» (acortado revertido) vuelve a estar abierta. */
const decidida = (m: FitMark | undefined) => m === "ok" || m === "no";

/**
 * Reparte la propuesta sobre los items. Devuelve, por id de variant_item, las
 * propuestas ABIERTAS en el orden en que se leen: quitar, mover, acortar.
 *
 * `posicion` = índice actual de cada viñeta entre sus hermanas visibles (la misma
 * base que usa ajuste.ts para desde/hasta). Si falta, el reordenado se enseña.
 */
export function propuestasEnLinea(
  fit: Fit | null,
  items: readonly ItemFlujo[],
  hechas: Readonly<Record<string, FitMark>>,
  posicion?: ReadonlyMap<string, number>,
): Map<string, PropEnLinea[]> {
  const out = new Map<string, PropEnLinea[]>();
  if (!fit) return out;
  const porId = new Map(items.map((i) => [i.id, i]));
  const poner = (id: string, p: PropEnLinea) => {
    if (!porId.has(id) || decidida(hechas[p.clave])) return;
    const l = out.get(id);
    if (l) l.push(p);
    else out.set(id, [p]);
  };
  for (const p of fit.quitar) poner(p.id, { tipo: "q", clave: `q:${p.id}`, p });
  for (const p of fit.reordenar) {
    if (posicion?.get(p.id) === p.hasta) continue; // ya está donde se propone
    poner(p.id, { tipo: "r", clave: `r:${p.id}`, p });
  }
  for (const p of fit.acortar) {
    // Lo verificado no exige revisión. La excepción es un acortado que el propio
    // usuario acaba de revertir («undo»): vuelve a ser suyo para decidir.
    if (porId.get(p.id)?.override_verified && hechas[`a:${p.id}`] !== "undo") continue;
    poner(p.id, { tipo: "a", clave: `a:${p.id}`, p });
  }
  return out;
}

/** Cuántas decisiones quedan abiertas en el documento. */
export function contarPendientes(enLinea: ReadonlyMap<string, PropEnLinea[]>): number {
  let n = 0;
  for (const l of enLinea.values()) n += l.length;
  return n;
}

/** «Qué falta» agrupado por item: se pinta sobre la viñeta, el rol o la aptitud. */
export function huecosPorItem(faltas: readonly FitFalta[]): Map<string, FitFalta[]> {
  const out = new Map<string, FitFalta[]>();
  for (const f of faltas) {
    const l = out.get(f.id);
    if (l) l.push(f);
    else out.set(f.id, [f]);
  }
  return out;
}

export type EstadoDoc = "midiendo" | "error" | "vacio" | "cabe" | "no-cabe" | "excede";

/**
 * El estado del documento que encabeza la guía. Sale del PDF REAL (numPages) y
 * de lo que el autofit dice de ese mismo PDF; nunca de una estimación del DOM.
 */
export function estadoDoc(s: {
  busy: boolean;
  error: string;
  paginas: number;
  objetivo: number;
  autofit: AutofitInfo | null;
}): EstadoDoc {
  if (s.error) return "error";
  if (s.busy && s.paginas === 0) return "midiendo";
  if (s.paginas === 0) return "vacio";
  if (s.autofit?.noCabe) return "no-cabe";
  return s.paginas <= s.objetivo ? "cabe" : "excede";
}

/**
 * La siguiente decisión del documento, en orden de lectura. `tops` son las
 * posiciones verticales (en px, relativas al scroll) de cada marca pendiente;
 * `desde` es la posición de lectura actual. Si no queda ninguna por debajo,
 * vuelve a la primera. -1 si no hay ninguna.
 */
export function siguienteIndice(tops: readonly number[], desde: number): number {
  if (tops.length === 0) return -1;
  const i = tops.findIndex((t) => t > desde + 1);
  return i >= 0 ? i : 0;
}
