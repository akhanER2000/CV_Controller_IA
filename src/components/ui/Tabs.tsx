"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

/* ============================================================================
   Tabs — pestañas en píldora. Patrón ARIA completo: tablist / tab / tabpanel,
   foco itinerante (solo la activa entra en el Tab), flechas, Inicio y Fin.
   Activación automática: mover el foco cambia la pestaña (menos clics).
   Controlado: el padre guarda `valor`.
   ============================================================================ */

export interface TabItem {
  id: string;
  etiqueta: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  valor: string;
  onCambio: (id: string) => void;
  /** Nombre accesible del grupo de pestañas. */
  etiqueta: string;
  /** Contenido del panel de la pestaña activa. */
  children?: ReactNode;
  className?: string;
}

export function Tabs({ items, valor, onCambio, etiqueta, children, className }: TabsProps) {
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function mover(e: KeyboardEvent, i: number) {
    let j = -1;
    if (e.key === "ArrowRight") j = (i + 1) % items.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = items.length - 1;
    if (j < 0) return;
    e.preventDefault();
    onCambio(items[j]!.id);
    refs.current[j]?.focus();
  }

  return (
    <div className={className ? `u-tabs ${className}` : "u-tabs"}>
      <div role="tablist" aria-label={etiqueta} className="u-tabs-lista">
        {items.map((it, i) => {
          const on = it.id === valor;
          return (
            <button
              key={it.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-t-${it.id}`}
              aria-selected={on}
              aria-controls={`${base}-p`}
              tabIndex={on ? 0 : -1}
              className="u-tab"
              onClick={() => onCambio(it.id)}
              onKeyDown={(e) => mover(e, i)}
            >
              {it.etiqueta}
            </button>
          );
        })}
      </div>
      {children !== undefined ? (
        <div role="tabpanel" id={`${base}-p`} aria-labelledby={`${base}-t-${valor}`} className="u-tabs-panel" tabIndex={0}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
