"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icono } from "./Icono";

/* ============================================================================
   Drawer — el cajón lateral (abajo en móvil). Para editar o ver detalle SIN
   salir de la pantalla: menos clics, el contexto sigue detrás.

   Diálogo modal de verdad: role=dialog + aria-modal, Esc cierra, clic en el
   velo cierra, el foco entra al abrir, queda atrapado dentro con Tab y vuelve
   al elemento que lo abrió al cerrar. Se monta en <body> (portal) para no
   heredar overflow ni z-index de la tarjeta que lo dispara.
   ============================================================================ */

export interface DrawerProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
  /** Pie fijo (acciones). */
  pie?: ReactNode;
  /** Texto del botón cerrar (accesible). */
  cerrarEtiqueta?: string;
}

const ENFOCABLES =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Drawer({ abierto, onCerrar, titulo, children, pie, cerrarEtiqueta = "Cerrar" }: DrawerProps) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const previo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    previo.current = document.activeElement as HTMLElement | null;
    const primero = panel.current?.querySelector<HTMLElement>(ENFOCABLES);
    (primero ?? panel.current)?.focus();
    const bloqueo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bloqueo;
      previo.current?.focus?.();
    };
  }, [abierto]);

  if (!abierto || typeof document === "undefined") return null;

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCerrar();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const nodos = [...panel.current.querySelectorAll<HTMLElement>(ENFOCABLES)];
    if (nodos.length === 0) return;
    const a = nodos[0]!;
    const z = nodos[nodos.length - 1]!;
    if (e.shiftKey && document.activeElement === a) {
      e.preventDefault();
      z.focus();
    } else if (!e.shiftKey && document.activeElement === z) {
      e.preventDefault();
      a.focus();
    }
  }

  return createPortal(
    <div className="u-drawer-raiz" onKeyDown={teclado}>
      <div className="u-drawer-velo" onClick={onCerrar} aria-hidden="true" />
      <div
        ref={panel}
        className="u-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        tabIndex={-1}
      >
        <header className="u-drawer-cab">
          <h2 className="u-drawer-t" id={`${id}-t`}>
            {titulo}
          </h2>
          <button type="button" className="u-btn u-btn--fantasma u-btn--ico" onClick={onCerrar} aria-label={cerrarEtiqueta} title={cerrarEtiqueta}>
            <Icono nombre="cerrar" />
          </button>
        </header>
        <div className="u-drawer-cuerpo">{children}</div>
        {pie ? <footer className="u-drawer-pie">{pie}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
