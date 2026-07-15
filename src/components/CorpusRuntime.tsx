"use client";

import Script from "next/script";

/**
 * Carga el kit de movimiento vivo (vanilla) del sistema Corpus.
 *
 * Los dos archivos son el PORTE LITERAL de corpus-design/02-sistema/{aurora,motion}.js
 * (contrato handoff.md: "un solo bundle compartido" en producción; la copia
 * íntegra es para que la entrega funcione con doble clic). Exponen dos APIs
 * globales INDEPENDIENTES — `window.CorpusAurora` y `window.CorpusMotion` — sin
 * pisarse la una a la otra (a diferencia del runtime viejo), así que el orden
 * de carga es indiferente. `motion.js` cablea listeners globales inocuos:
 * pausa la aurora al enfocar cualquier campo (el editor es sagrado) y el
 * spotlight de tarjetas.
 */
export function CorpusRuntime() {
  return (
    <>
      <Script src="/corpus/aurora.js" strategy="afterInteractive" />
      <Script src="/corpus/motion.js" strategy="afterInteractive" />
    </>
  );
}
