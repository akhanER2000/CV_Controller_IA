"use client";

import { useAurora, type AuroraState } from "@/lib/corpus/runtime";

/**
 * El fondo vivo. Solo lo montan las pantallas VENTANA (auth, onboarding,
 * importar, ingesta, dashboard vacío). El propio `aurora.js` crea el host
 * `.c-aurora` y lo prepende al body; este componente solo dispara el mount y
 * fija el estado. Con `prefers-reduced-motion` o sin WebGL2 cae al fallback
 * estático de globals.css (§3 aurora.css) — misma atmósfera, cero movimiento.
 */
export function Aurora({ state = "calm" }: { state?: AuroraState }) {
  useAurora(state);
  return null;
}
