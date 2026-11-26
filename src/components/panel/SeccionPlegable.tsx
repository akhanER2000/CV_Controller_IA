"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui";

/* ============================================================================
   SeccionPlegable — una sección del Master o de la Revisión como tarjeta grafito
   con cabecera (título en la voz display + recuento) y un botón que la pliega.
   Pieza de panel-datos: ui/ no tenía una tarjeta plegable y no es de este lote
   tocarla. El estado lo guarda el padre (mismo `folded` que ya existía).

   El botón conserva `className="fold"` y `data-fold`: son los asideros que ya
   usaban la pantalla y sus pruebas.
   ============================================================================ */

export interface SeccionPlegableProps {
  id?: string;
  titulo: ReactNode;
  /** Recuento con su unidad ("5 roles · 18 viñetas"). */
  meta?: ReactNode;
  /** Acciones extra en la cabecera (a la izquierda del botón de plegar). */
  acciones?: ReactNode;
  plegada?: boolean;
  /** Sin onPlegar la sección no se puede plegar (no se pinta el botón). */
  onPlegar?: () => void;
  etiquetaPlegar?: string;
  etiquetaDesplegar?: string;
  className?: string;
  /** Atributos data-* que la pantalla ya usaba (data-g, …). */
  dataG?: string;
  /** Clase extra del cuerpo (la pantalla conserva la suya: ms-body, …). */
  claseCuerpo?: string;
  children?: ReactNode;
}

export function SeccionPlegable({
  id,
  titulo,
  meta,
  acciones,
  plegada = false,
  onPlegar,
  etiquetaPlegar = "Plegar",
  etiquetaDesplegar = "Desplegar",
  className,
  dataG,
  claseCuerpo,
  children,
}: SeccionPlegableProps) {
  const cuerpo = id ? `${id}-cuerpo` : undefined;
  return (
    <Card
      as="section"
      grande
      id={id}
      data-g={dataG}
      className={["pn-sec", plegada ? "folded" : "", className ?? ""].filter(Boolean).join(" ")}
    >
      <header className="pn-sec-h">
        <h2 className="pn-sec-t">{titulo}</h2>
        {meta ? <span className="pn-sec-meta cnt">{meta}</span> : null}
        <span className="pn-sec-acc">
          {acciones}
          {onPlegar ? (
            <button
              type="button"
              className="fold pn-sec-fold"
              data-fold
              aria-expanded={!plegada}
              aria-controls={cuerpo}
              onClick={onPlegar}
            >
              {plegada ? etiquetaDesplegar : etiquetaPlegar}
            </button>
          ) : null}
        </span>
      </header>
      <div className={claseCuerpo ? `pn-sec-b ${claseCuerpo}` : "pn-sec-b"} id={cuerpo} hidden={plegada}>
        {children}
      </div>
    </Card>
  );
}
