/**
 * «Sin respaldo» con UNA confirmación (DA-M5). Reescribir texto no cambia la forma
 * del CV y se aplica de un clic; añadir u ocultar SÍ (puede sumar páginas), así que
 * primero se enseña el resumen y se aplica solo con «Aplicar».
 *
 * Puro y compartido: la ruta cuenta lo pendiente con esto y, al confirmar, vuelve a
 * calcularlo sobre la base; si ya no coincide con lo que el usuario vio, no aplica.
 */

export interface ResumenRespaldo {
  /** Viñetas que aparecen en el CV (se muestran o se añaden desde el master). */
  anadir: number;
  /** Aptitudes o grupos de aptitudes que se ocultan por no tener respaldo. */
  ocultar: number;
}

export function resumenRespaldo(acciones: readonly { tipo: string }[]): ResumenRespaldo {
  let anadir = 0;
  let ocultar = 0;
  for (const a of acciones) {
    if (a.tipo === "mostrar" || a.tipo === "anadir") anadir += 1;
    else if (a.tipo === "ocultar-aptitud" || a.tipo === "ocultar-grupo") ocultar += 1;
  }
  return { anadir, ocultar };
}

/** ¿Lo que se va a aplicar es lo mismo que el usuario confirmó? */
export function mismoResumen(a: ResumenRespaldo, b: unknown): boolean {
  if (!b || typeof b !== "object") return false;
  const o = b as Partial<ResumenRespaldo>;
  return o.anadir === a.anadir && o.ocultar === a.ocultar;
}
