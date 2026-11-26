import type { ReactNode } from "react";

/* Chip — rótulo corto. El tono nunca va solo: el texto dice lo mismo que el color.
     neutro · brasa (estado que pide acción) · oro (sello: verificado, con fuente)
     peligro · ejemplo (dato de prueba: SIEMPRE rotulado, en mono) */

export type Tono = "neutro" | "brasa" | "oro" | "peligro" | "ejemplo";

export function Chip({ tono = "neutro", children, className }: { tono?: Tono; children: ReactNode; className?: string }) {
  return <span className={className ? `u-chip u-chip--${tono} ${className}` : `u-chip u-chip--${tono}`}>{children}</span>;
}
