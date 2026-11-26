import type { ReactNode } from "react";

/* PanelHeader — el encabezado de una tarjeta o de una sección de pantalla.
   Título en la voz display (criterio), subtítulo en sans, acciones a la derecha. */

export interface PanelHeaderProps {
  titulo: ReactNode;
  sub?: ReactNode;
  acciones?: ReactNode;
  /** h2 para secciones de pantalla, h3 (por defecto) dentro de una tarjeta. */
  nivel?: 2 | 3;
  /** Rótulo corto a la derecha del título (un recuento con su unidad: "5 roles"). */
  meta?: ReactNode;
  className?: string;
  id?: string;
}

export function PanelHeader({ titulo, sub, acciones, nivel = 3, meta, className, id }: PanelHeaderProps) {
  const H = nivel === 2 ? "h2" : "h3";
  return (
    <header className={className ? `u-ph u-ph--h${nivel} ${className}` : `u-ph u-ph--h${nivel}`}>
      <div className="u-ph-txt">
        <H className="u-ph-t" id={id}>
          {titulo}
          {meta ? <span className="u-ph-meta">{meta}</span> : null}
        </H>
        {sub ? <p className="u-ph-sub">{sub}</p> : null}
      </div>
      {acciones ? <div className="u-ph-acc">{acciones}</div> : null}
    </header>
  );
}
