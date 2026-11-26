"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/* Transicion — entrada de cada página del área /app.
   La clave es la RUTA: al cambiar de pantalla el contenedor se vuelve a montar y
   su animación CSS (.u-pagina, ui.css) corre una vez. Cambiar solo la query
   (?from=, filtros) NO la dispara: no es otra página. Con
   prefers-reduced-motion la animación no existe. */
export function Transicion({ children }: { children: ReactNode }) {
  const ruta = usePathname() || "/app";
  return (
    <div key={ruta} className="u-pagina">
      {children}
    </div>
  );
}
