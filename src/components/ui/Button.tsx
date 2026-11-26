import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Icono, type IconoNombre } from "./Icono";

/* ============================================================================
   Button — cuatro variantes, todas en AA:
     brasa     relleno naranja + tinta (la acción principal de la vista)
     tinta     relleno tinta + brasa clara (la acción DENTRO de una tarjeta brasa
               o crema: sobre naranja, un botón naranja desaparece)
     grafito   superficie elevada + texto del tema (secundaria)
     fantasma  sin fondo (terciaria)
   Con `href` es un <Link> real (clic medio, barra de estado); sin él, <button>.
   ============================================================================ */

export type Variante = "brasa" | "tinta" | "grafito" | "fantasma";

type Comun = {
  variante?: Variante;
  tamano?: "md" | "lg";
  icono?: IconoNombre;
  /** Solo icono: la etiqueta pasa a aria-label y title. */
  soloIcono?: boolean;
  children?: ReactNode;
  className?: string;
};

export type ButtonProps =
  | (Comun & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined })
  | (Comun & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string });

export function Button(props: ButtonProps) {
  const { variante = "grafito", tamano = "md", icono, soloIcono, children, className, ...resto } = props;
  const clases = [
    "u-btn",
    `u-btn--${variante}`,
    tamano === "lg" ? "u-btn--lg" : "",
    soloIcono ? "u-btn--ico" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const etiqueta = typeof children === "string" ? children : undefined;
  const dentro = (
    <>
      {icono ? <Icono nombre={icono} /> : null}
      {soloIcono ? <span className="u-sr">{children}</span> : children}
    </>
  );
  const a11y = soloIcono && etiqueta ? { "aria-label": etiqueta, title: etiqueta } : {};

  if (typeof resto.href === "string") {
    const { href, ...a } = resto as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
    return (
      <Link href={href} className={clases} {...a11y} {...a}>
        {dentro}
      </Link>
    );
  }
  const b = resto as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={b.type ?? "button"} className={clases} {...a11y} {...b}>
      {dentro}
    </button>
  );
}
