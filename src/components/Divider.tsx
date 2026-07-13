"use client";

import { useEffect, useRef } from "react";

/**
 * El hairline dorado que se DIBUJA de izquierda a derecha bajo un encabezado
 * (la firma de motion del diseño, `dividerDraw` / `.c-divider` de canon-motion.css).
 * Se cablea en React porque el JS de carga (canon-motion.js) escanea el DOM una
 * sola vez al inicio y no ve el contenido montado tras navegar (SPA).
 */
export function Divider() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = requestAnimationFrame(() => el.classList.add("is-drawn"));
    return () => cancelAnimationFrame(id);
  }, []);
  return <div ref={ref} className="c-divider" aria-hidden="true" />;
}
