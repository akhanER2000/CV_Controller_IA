import type { ReactNode } from "react";
import { Icono, type IconoNombre } from "./Icono";

/* EmptyState — lo que se ve cuando aún no hay datos. Dice qué falta y qué hacer,
   en vez de pintar ceros o cifras de relleno (regla: ningún número sin fuente). */

export interface EmptyStateProps {
  titulo: string;
  texto?: ReactNode;
  accion?: ReactNode;
  icono?: IconoNombre;
  className?: string;
}

export function EmptyState({ titulo, texto, accion, icono = "mas", className }: EmptyStateProps) {
  return (
    <div className={className ? `u-empty ${className}` : "u-empty"}>
      <span className="u-empty-ico" aria-hidden="true">
        <Icono nombre={icono} tamano={22} />
      </span>
      <p className="u-empty-t">{titulo}</p>
      {texto ? <p className="u-empty-b">{texto}</p> : null}
      {accion ? <div className="u-empty-acc">{accion}</div> : null}
    </div>
  );
}
