// Sin "use client": solo lo importa el editor (ya cliente); así las props pueden ser funciones.
import { useEffect, useId, useRef, type ReactNode } from "react";

/* ============================================================================
   Desplegable — un botón que abre un panel flotante NO modal (detalle del
   estado, menú «Más», ayuda de atajos). Esc o un clic fuera lo cierran y el
   foco vuelve al botón. El estado abierto lo lleva quien lo usa, para que un
   atajo de teclado pueda abrirlo o cerrarlo también.
   ============================================================================ */

export function Desplegable({
  abierto,
  onCambiar,
  boton,
  botonClase,
  botonEtiqueta,
  botonTitulo,
  botonId,
  lado = "izq",
  ancho,
  children,
}: {
  abierto: boolean;
  onCambiar: (v: boolean) => void;
  boton: ReactNode;
  botonClase?: string;
  /** aria-label cuando el contenido del botón no basta */
  botonEtiqueta?: string;
  botonTitulo?: string;
  botonId?: string;
  /** a qué borde del botón se alinea el panel */
  lado?: "izq" | "der";
  ancho?: number;
  children: ReactNode;
}) {
  const id = useId();
  const raiz = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) onCambiar(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCambiar(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [abierto, onCambiar]);

  return (
    <span className="edx-desp" ref={raiz}>
      <button
        ref={btn}
        type="button"
        id={botonId}
        className={botonClase}
        aria-expanded={abierto}
        aria-controls={`${id}-p`}
        aria-label={botonEtiqueta}
        title={botonTitulo}
        onClick={() => onCambiar(!abierto)}
      >
        {boton}
      </button>
      {abierto && (
        <div className="edx-desp-panel" id={`${id}-p`} data-lado={lado} style={ancho ? { width: ancho } : undefined}>
          {children}
        </div>
      )}
    </span>
  );
}

/** Una tecla, pintada como tecla. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="edx-kbd">{children}</kbd>;
}
