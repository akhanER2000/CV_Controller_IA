"use client";

import { useEffect } from "react";

/**
 * Monta la aurora WebGL DE VERDAD (no la deja como CSS muerto — ese fue el
 * pecado de V3, ver AUDITORIA-V3.md). Renderiza el host `.c-aurora-gl` y llama
 * a `window.CANON.aurora.mount()` en cuanto el runtime está disponible.
 *
 * - `active`: átalo al estado real (p. ej. una ingesta corriendo) para que el
 *   humo se agite. En pantallas de trabajo (editor) usa `pause()` al escribir.
 * - Degradación: sin WebGL2 o con `prefers-reduced-motion`, el propio script
 *   pinta el degradado estático de `canon-aurora.css` (misma paleta metálica).
 */
declare global {
  interface Window {
    CANON?: {
      aurora?: {
        mount: (root?: Document | HTMLElement) => void;
        setActive: (on: boolean) => void;
        pause: () => void;
        resume: () => void;
      };
    };
  }
}

export function AuroraCanvas({ active = false }: { active?: boolean }) {
  useEffect(() => {
    let tries = 0;
    const id = window.setInterval(() => {
      const aurora = window.CANON?.aurora;
      if (aurora) {
        aurora.mount();
        aurora.setActive(active);
        window.clearInterval(id);
      } else if (++tries > 60) {
        window.clearInterval(id);
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [active]);

  return <div className="c-aurora-gl" aria-hidden="true" />;
}
