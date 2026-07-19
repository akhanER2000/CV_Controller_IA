"use client";

import { useEffect } from "react";
import { useAurora, type AuroraState } from "@/lib/corpus/runtime";

/**
 * El fondo vivo. Solo lo montan las pantallas VENTANA (auth, onboarding,
 * importar, ingesta, fuentes, dashboard vacío). El propio `aurora.js` crea el
 * host `.c-aurora` y lo prepende al body; este componente solo dispara el mount
 * y fija el estado. Con `prefers-reduced-motion` o sin WebGL2 cae al fallback
 * estático de globals.css (§3 aurora.css) — misma atmósfera, cero movimiento.
 *
 * ── EL FRENO DE LA FRONTERA ────────────────────────────────────────────────
 * `aurora.js` monta UNA vez y no se desmonta nunca (`if(S.el)return api`). Sin
 * esto, al navegar de una ventana a un MURO el shader seguía corriendo detrás
 * del fondo opaco: invisible, pero quemando GPU en la pantalla donde justamente
 * habíamos decidido que el trabajo gana. Este efecto ata el humo a la vida del
 * componente: quien lo monta lo enciende, y al salir lo apaga.
 *
 * Usa el mismo `pause/resume` con razón nombrada que ya usan el foco de un
 * campo ('focus') y la pestaña oculta ('hidden'): son un Set, así que las tres
 * razones conviven sin pisarse (salir de la pantalla con un input enfocado no
 * "des-pausa" nada).
 */
export function Aurora({ state = "calm" }: { state?: AuroraState }) {
  useAurora(state);

  useEffect(() => {
    // Razón propia: la pantalla que monta el humo lo enciende.
    window.CorpusAurora?.resume("screen");
    // ── Y el enclavamiento ajeno ──────────────────────────────────────────
    // `pause`/`resume` llevan un Set de razones: la aurora corre solo si el Set
    // está VACÍO. Quien pausa con una razón y no la levanta, la deja enclavada.
    // TemplateGallery (Atmosphere) pausa con 'corpus-hojeo' al cerrarse y nadie
    // la vuelve a levantar salvo la propia galería: bastaba con abrir y cerrar
    // el hojeador UNA vez para dejar el fondo congelado el resto de la sesión,
    // también en login, onboarding, volcado y Fuentes.
    // Aquí se levanta porque este componente es el que DECIDE que esta pantalla
    // es una ventana. Lo correcto a medio plazo es que la galería monte <Aurora>
    // en vez de llevar su propio latch (su archivo es de otro agente ahora).
    window.CorpusAurora?.resume("corpus-hojeo");
    // Se lee del window EN LA LIMPIEZA, no en una variable capturada arriba: si
    // el runtime vanilla aún no había cargado al montar, capturarlo dejaría un
    // `undefined` y la aurora seguiría corriendo tras salir de la pantalla.
    return () => {
      window.CorpusAurora?.pause("screen");
    };
  }, []);

  return null;
}
