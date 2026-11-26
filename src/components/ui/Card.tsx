import type { HTMLAttributes, ReactNode } from "react";

/* ============================================================================
   Card — los cuatro materiales de Forja v2 (tokens en globals.css §1b).

     grafito  superficie de trabajo; sigue al tema. El material por defecto.
     brasa    RELLENO naranja: la pieza que manda en la vista. Úsalo una vez.
     crema    el folio: lectura y contraste dentro del grafito.
     vidrio   capas que flotan sobre la atmósfera (lateral, barra, cajón).

   Sobre brasa y crema el texto es SIEMPRE su tinta (la tarjeta la fija sola:
   los hijos heredan `color`). No pintes texto del tema encima.
   ============================================================================ */

export type Material = "grafito" | "brasa" | "crema" | "vidrio";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  material?: Material;
  /** Etiqueta del contenedor. `section` si la tarjeta lleva encabezado propio. */
  as?: "div" | "section" | "article" | "aside";
  /** Radio y aire de tarjeta grande (22px / 28px) en vez de la compacta. */
  grande?: boolean;
  children?: ReactNode;
}

export function Card({ material = "grafito", as = "div", grande, className, children, ...resto }: CardProps) {
  const Tag = as;
  const clases = ["u-card", `u-card--${material}`, grande ? "u-card--grande" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={clases} data-material={material} {...resto}>
      {children}
    </Tag>
  );
}
