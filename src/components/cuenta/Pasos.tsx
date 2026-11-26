import type { ReactNode } from "react";
import "./cuenta.css";

/* Pasos — el recorrido 1 · 2 · 3 de una pantalla, visible arriba.
   `actual` es el índice (0-based) del paso en curso; los anteriores salen como
   hechos. Con `onIr`, cada paso es un botón (para volver atrás); sin él, rótulo. */

export interface Paso {
  id: string;
  titulo: ReactNode;
}

export function Pasos({
  pasos,
  actual,
  etiqueta,
  onIr,
  className,
}: {
  pasos: Paso[];
  actual: number;
  /** Nombre accesible de la lista ("Pasos para volcar material"). */
  etiqueta: string;
  onIr?: (indice: number) => void;
  className?: string;
}) {
  return (
    <ol className={className ? `cu-pasos ${className}` : "cu-pasos"} aria-label={etiqueta}>
      {pasos.map((p, i) => {
        const estado = i < actual ? "hecho" : i === actual ? "actual" : "pendiente";
        const comun = {
          className: "cu-paso",
          "data-estado": estado,
          "aria-current": i === actual ? ("step" as const) : undefined,
        };
        const dentro = (
          <>
            <span className="cu-paso-n" aria-hidden="true">
              {i + 1}
            </span>
            {p.titulo}
          </>
        );
        return (
          <li key={p.id} style={{ display: "contents" }}>
            {onIr ? (
              <button type="button" {...comun} onClick={() => onIr(i)}>
                {dentro}
              </button>
            ) : (
              <span {...comun}>{dentro}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
