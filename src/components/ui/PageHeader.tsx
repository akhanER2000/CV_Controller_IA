import type { ReactNode, Ref } from "react";

/* PageHeader — LA cabecera de pantalla (DA-V5): rótulo opcional, título (h1) en
   la voz display, subtítulo opcional en sans y acciones a la derecha. Una sola
   para las doce pantallas del área /app; ocupa el ancho completo del shell.
   Con PageHeader en la página, la barra superior deja solo las migas (el nombre
   grande ya lo dice este h1: ver ui.css). */

export interface PageHeaderProps {
  titulo: ReactNode;
  sub?: ReactNode;
  acciones?: ReactNode;
  /** Rótulo corto encima del título (mono, mayúsculas). */
  rotulo?: ReactNode;
  id?: string;
  /** Para mover el foco al título (pantallas con pasos). */
  tituloRef?: Ref<HTMLHeadingElement>;
  className?: string;
}

export function PageHeader({ titulo, sub, acciones, rotulo, id, tituloRef, className }: PageHeaderProps) {
  return (
    <header className={className ? `u-page-h ${className}` : "u-page-h"}>
      <div className="u-page-h-txt">
        {rotulo ? <p className="u-page-h-rot">{rotulo}</p> : null}
        <h1 className="u-page-h-t" id={id} ref={tituloRef} tabIndex={tituloRef ? -1 : undefined}>
          {titulo}
        </h1>
        {sub ? <p className="u-page-h-sub">{sub}</p> : null}
      </div>
      {acciones ? <div className="u-page-h-acc">{acciones}</div> : null}
    </header>
  );
}
