"use client";

import { useEffect } from "react";

/**
 * Carga el kit de movimiento vivo (vanilla) que porta el diseño de VFinal.
 * Ambos archivos se copian TAL CUAL desde 02-sistema/ y el contrato (handoff.md)
 * exige que la API `window.CANON` y los nombres de clase NO cambien.
 *
 * ⚠️ ORDEN DETERMINISTA (no negociable): `canon-motion.js` hace
 *   `window.CANON = { stagger, ... }`  (REEMPLAZA el objeto)
 * y `canon-aurora.js` hace
 *   `window.CANON = Object.assign(window.CANON || {}, { aurora })`  (FUSIONA).
 * Si aurora carga primero, motion lo pisa y se pierde `CANON.aurora`
 * (setActive/pause) — verificado en el navegador. Por eso se cargan en
 * secuencia estricta: PRIMERO motion, DESPUÉS aurora. Sin modificar los
 * archivos vanilla (respeta el contrato).
 */
export function CanonRuntime() {
  useEffect(() => {
    const w = window as unknown as { __canonLoaded?: boolean };
    if (w.__canonLoaded) return;
    w.__canonLoaded = true;

    const load = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = false; // ejecución en orden de inserción
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
        document.body.appendChild(s);
      });

    load("/canon/canon-motion.js")
      .then(() => load("/canon/canon-aurora.js"))
      .catch((e) => console.error("[CANON runtime]", e));
  }, []);

  return null;
}
