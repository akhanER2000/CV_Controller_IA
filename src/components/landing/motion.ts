"use client";

import { useEffect, useRef } from "react";

/* ============================================================================
   LANDING · el cableado con el runtime de movimiento del sistema.

   Dos utilidades distintas de window.CorpusMotion, para dos momentos distintos:
     · boot(scope)  → revela YA lo que está en el primer pantallazo (el hero).
     · io(scope)    → IntersectionObserver sobre los [data-io]: revela cada
                      sección al entrar en pantalla.
   El sistema autoriza el scroll-reveal en "documentos de lectura" (motion.js lo
   dice literalmente), y una landing lo es: se lee una vez, de arriba abajo.

   Los ámbitos son DISJUNTOS a propósito: el hero usa [data-reveal] y lo dispara
   boot(); las secciones usan [data-io] y las dispara io(). Así ninguna de las dos
   pisa a la otra, sin importar cuál llegue antes.

   prefers-reduced-motion no se comprueba aquí: io() ya muestra todo de golpe
   cuando está activo, y el CSS del sistema deja los estados finales fuera del
   @media. Se pierde el movimiento, nunca la información.
   ============================================================================ */

/** Espera a que el runtime vanilla exista (lo carga <CorpusRuntime/> con next/script). */
function whenReady(fn: () => void): () => void {
  if (window.CorpusMotion) {
    fn();
    return () => {};
  }
  let tries = 0;
  const id = window.setInterval(() => {
    if (window.CorpusMotion) {
      window.clearInterval(id);
      fn();
    } else if (++tries > 100) {
      window.clearInterval(id);
    }
  }, 30);
  return () => window.clearInterval(id);
}

/**
 * Devuelve la ref del hero. Al montar: revela el hero de inmediato y engancha el
 * observador de scroll sobre el resto de la página.
 */
export function useLandingMotion<T extends HTMLElement = HTMLElement>() {
  const heroRef = useRef<T>(null);
  useEffect(() => {
    return whenReady(() => {
      const m = window.CorpusMotion!;
      if (heroRef.current) m.boot(heroRef.current);
      m.io(document);
    });
  }, []);
  return heroRef;
}

/** Dispara EL shimmer del sistema (uno por carga) sobre un elemento. */
export function playShimmer(el: Element | null): void {
  if (!el) return;
  window.CorpusMotion?.shimmer(el);
}
