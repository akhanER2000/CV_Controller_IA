// Sin "use client": solo lo importa el editor (ya cliente); así las props pueden ser funciones.
import { useEffect, useState, type RefObject } from "react";

/* ============================================================================
   Navegación fija por sección — la fila de pestañas pegada arriba de la columna
   central. Saltar es desplazar la columna hasta la tarjeta (no se filtra nada:
   el documento entero sigue ahí). La sección activa la decide lo que está a la
   vista (IntersectionObserver sobre la propia columna).
   ============================================================================ */

export interface SeccionNav {
  id: string;
  titulo: string;
  /** cuántos items lleva (se omite si no aplica) */
  n?: number;
  /** huecos en la sección: un punto brasa con la cifra */
  huecos?: number;
  /** la misma cifra dicha en palabras (title y lector de pantalla) */
  huecosTexto?: string;
}

export function NavSecciones({
  secciones,
  raiz,
  etiqueta,
}: {
  secciones: readonly SeccionNav[];
  /** la columna que hace scroll */
  raiz: RefObject<HTMLElement | null>;
  etiqueta: string;
}) {
  const [activa, setActiva] = useState<string>(secciones[0]?.id ?? "");
  const firma = secciones.map((s) => s.id).join("|");

  useEffect(() => {
    const root = raiz.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const vistos = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) vistos.set((e.target as HTMLElement).dataset.sec ?? "", e.isIntersecting ? e.boundingClientRect.top : Infinity);
        // La primera (más arriba) de las que se ven.
        let mejor = "";
        let top = Infinity;
        for (const [id, t] of vistos) if (t < top) [mejor, top] = [id, t];
        if (mejor) setActiva(mejor);
      },
      { root, rootMargin: "-56px 0px -55% 0px", threshold: 0 },
    );
    for (const el of root.querySelectorAll<HTMLElement>("[data-sec]")) obs.observe(el);
    return () => obs.disconnect();
  }, [raiz, firma]);

  const ir = (id: string) => {
    const el = raiz.current?.querySelector<HTMLElement>(`[data-sec="${id}"]`);
    if (!el) return;
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: suave ? "smooth" : "auto" });
    setActiva(id);
  };

  return (
    <nav className="edx-nav" aria-label={etiqueta}>
      {secciones.map((s) => (
        <button
          key={s.id}
          type="button"
          className="edx-nav-b"
          aria-current={activa === s.id ? "true" : undefined}
          onClick={() => ir(s.id)}
        >
          {s.titulo}
          {s.n != null && <span className="n">{s.n}</span>}
          {s.huecos ? (
            <span className="h" title={s.huecosTexto}>
              {s.huecos}
              {s.huecosTexto && <span className="edx-sr"> {s.huecosTexto}</span>}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
