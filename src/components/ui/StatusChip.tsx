import type { ReactNode } from "react";

/* StatusChip — EL chip de estado (DA-V5): ok · aviso · error · neutro.
   El color nunca va solo: punto (lleno, hueco) + texto que dice lo mismo.
     ok      en línea, al día, leída
     aviso   pide acción: desactualizada, a medias
     error   caída, falló
     neutro  sin juicio: pendiente, borrador
   Para rótulos que NO son estado (tipo, recuento, «ejemplo») sigue <Chip>. */

export type EstadoChip = "ok" | "aviso" | "error" | "neutro";

export function StatusChip({
  estado,
  children,
  title,
  className,
  pulso,
}: {
  estado: EstadoChip;
  children: ReactNode;
  title?: string;
  className?: string;
  /** El punto late (c-pulse-dot): un aviso que sigue vivo, p. ej. «desactualizada». */
  pulso?: boolean;
}) {
  return (
    <span className={className ? `u-status u-status--${estado} ${className}` : `u-status u-status--${estado}`} title={title}>
      <span className={pulso ? "u-status-p c-pulse-dot" : "u-status-p"} aria-hidden="true" />
      {children}
    </span>
  );
}
