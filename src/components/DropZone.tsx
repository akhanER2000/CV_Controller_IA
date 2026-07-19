"use client";

import { useRef, useState, type ReactNode } from "react";
import "./DropZone.css";

/* ============================================================================
   DropZone — EL gesto de subir archivos, uno solo para todo el producto.

   Nace de la zona de arrastre del volcado (importar.html: borde punteado +
   superficie translúcida + reacción al hover). Se extrae aquí para que Fuentes
   y el volcado usen LA MISMA, en vez de dos CSS que se parecen.

   A11y: es un <button> de verdad, no un div con role. Teclado gratis (Enter y
   Espacio abren el selector), foco visible por :focus-visible del sistema,
   estado deshabilitado real. Arrastrar es un ATAJO, nunca el único camino.

   Sin @keyframes ni transform: solo transiciones de color/borde, las mismas que
   ya tenía .imp-drop. Nada que revisar bajo prefers-reduced-motion.
   ============================================================================ */

export interface DropZoneProps {
  /** Se llama con los archivos elegidos (arrastrados o por el selector). */
  onFiles: (files: File[]) => void;
  /** El texto de la zona, YA traducido por la pantalla. */
  label: ReactNode;
  /** Filtro del selector nativo (mismo valor que usaría el <input type=file>). */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Clases de COLOCACIÓN de la pantalla (márgenes), nunca de aspecto. */
  className?: string;
  id?: string;
}

export function DropZone({
  onFiles,
  label,
  accept,
  multiple = false,
  disabled = false,
  className,
  id,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Contador de profundidad: los hijos también emiten dragenter/dragleave y sin
  // esto la zona parpadea al pasar por encima del texto.
  const depth = useRef(0);
  const [drag, setDrag] = useState(false);

  function clear() {
    depth.current = 0;
    setDrag(false);
  }

  function take(list: FileList | null) {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  }

  return (
    <>
      <button
        type="button"
        id={id}
        className={`dz${drag ? " is-drag" : ""}${className ? ` ${className}` : ""}`}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          if (disabled) return;
          e.preventDefault();
          depth.current += 1;
          setDrag(true);
        }}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (disabled) return;
          e.preventDefault();
          depth.current -= 1;
          if (depth.current <= 0) clear();
        }}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          clear();
          take(e.dataTransfer?.files ?? null);
        }}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}
