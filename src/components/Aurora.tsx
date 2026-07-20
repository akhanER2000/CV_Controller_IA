"use client";

import { useEffect } from "react";
import { useAurora, whenReady, type AuroraState } from "@/lib/corpus/runtime";

/* ============================================================================
   El fondo vivo.

   ── LA DOCTRINA ────────────────────────────────────────────────────────────
   La aurora está SIEMPRE presente — es la atmósfera del producto, no una
   decoración por pantalla. Lo que protege la lectura no es su ausencia, sino la
   SUPERFICIE sobre la que vive el contenido (ver §3 de globals.css).

   Esto DEROGA la gramática vieja «ventana / muro», donde las pantallas densas ni
   montaban el humo. Aquella regla salió de una landing: allí las secciones se
   alternan al hacer scroll y la alternancia se experimenta en secuencia, así que
   produce ritmo. Corpus es una app de PESTAÑAS: nunca ves la alternancia, solo
   el resultado — Master sin humo, Fuentes con humo. Eso no es ritmo, es
   inconsistencia.

   De ahí el reparto de responsabilidades de este archivo:

     <Aurora>      MONTA el runtime. Se usa UNA SOLA VEZ por shell:
                   src/app/app/layout.tsx para toda el área /app, y AuthScreen
                   porque login/signup/auth viven FUERA de ese layout.
                   Montar una vez (y no diez) es lo que evita el baile de
                   pause/resume que ya costó un bug real: una razón pausada y
                   nunca levantada dejaba el fondo congelado el resto de la
                   sesión.

     <AuroraTune>  NO monta nada. Es la pantalla DECLARANDO su intensidad
                   mientras está en pantalla. Se apilan (una galería abierta
                   sobre el editor sube el dial y al cerrarse lo devuelve al del
                   editor, no al de reposo).
   ============================================================================ */

/** Hojear o esperar: Panel vacío, Importar, Ingesta, galería, Fuentes, login. */
export const AURORA_HOJEO = 0.55;
/** Trabajo denso: Master poblado, editor, staging, tailoring, salud, Panel poblado. */
export const AURORA_TRABAJO = 0.22;

/* ── El dial, con transición ────────────────────────────────────────────────
   La pila de declaraciones vivas. El valor efectivo es el ÚLTIMO que se apiló;
   con la pila vacía se vuelve al reposo. Vive a nivel de módulo (no en estado
   React) porque el consumidor real es el runtime vanilla, que es un singleton. */
const stack: { v: number }[] = [];
let tweenRaf = 0;

function currentStrength(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--aurora-strength");
  const n = parseFloat(raw);
  return Number.isNaN(n) ? AURORA_HOJEO : n;
}

/**
 * Lleva el dial hasta `target` sin salto. Cambiar de pestaña no debe dar un
 * escalón: el humo sube o baja en ~520ms con la curva de la casa.
 *
 * Al desmontar una pantalla y montar la siguiente, React ejecuta la limpieza de
 * la vieja y el efecto de la nueva en el MISMO flush síncrono: la primera
 * llamada programa un rAF que la segunda cancela antes de que llegue a pintar,
 * así que el rebote intermedio (bajar a reposo para volver a subir) nunca se ve.
 */
function tween(target: number) {
  const A = window.CorpusAurora;
  if (!A) return;
  cancelAnimationFrame(tweenRaf);
  const from = currentStrength();
  // Con reduced-motion no se interpola nada: el dial salta y ya (y el fallback
  // estático de aurora.css tampoco lleva transición bajo esa preferencia).
  if (from === target || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    A.setStrength(target);
    return;
  }
  const t0 = performance.now();
  const DUR = 520;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / DUR);
    const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
    A.setStrength(Math.round((from + (target - from) * e) * 1e4) / 1e4);
    if (k < 1) tweenRaf = requestAnimationFrame(step);
  };
  tweenRaf = requestAnimationFrame(step);
}

function applyTop() {
  tween(stack.length ? stack[stack.length - 1].v : AURORA_HOJEO);
}

/**
 * Declara la intensidad de la aurora mientras el componente esté montado.
 * No monta el runtime ni toca pause/resume: solo mueve el dial.
 */
export function useAuroraTune(strength: number) {
  useEffect(() => {
    const entry = { v: strength };
    stack.push(entry);
    // El runtime vanilla se carga con `afterInteractive`: puede no estar aún.
    const stop = whenReady(() => window.CorpusAurora, applyTop);
    return () => {
      stop();
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (window.CorpusAurora) applyTop();
    };
  }, [strength]);
}

/** Forma declarativa de {@link useAuroraTune}, para usar dentro del JSX. */
export function AuroraTune({ strength }: { strength: number }) {
  useAuroraTune(strength);
  return null;
}

/* ── El contador de montajes ────────────────────────────────────────────────
   La razón 'screen' la comparte cualquier <Aurora> que haya vivo, y con un Set
   de razones "el último que se va apaga la luz" NO es gratis: si dos instancias
   se solapan (el shell de /app + una pantalla que todavía monta la suya, hoy
   Importar) la que se desmonta primero pausaría el fondo dejando a la otra a
   oscuras el resto de la sesión — el mismo bug que ya nos costó una vez, por
   otra puerta. Contando montajes, 'screen' solo se pausa cuando NO queda
   ninguna: salir de /app a la landing apaga; ir de Importar a Master, no. */
let mounts = 0;

/**
 * MONTA el fondo vivo. Solo el shell: src/app/app/layout.tsx (toda el área /app)
 * y AuthScreen (login/signup/auth quedan fuera de ese layout). Ninguna pantalla
 * de dentro vuelve a montarlo — declaran su intensidad con <AuroraTune>.
 *
 * `aurora.js` crea el host `.c-aurora` y lo prepende al body; monta UNA vez y no
 * se desmonta nunca (`if(S.el)return api`). Con `prefers-reduced-motion` o sin
 * WebGL2 cae al fallback estático de globals.css (§3) — misma atmósfera, cero
 * movimiento.
 *
 * El pause/resume con razón 'screen' sigue aquí y sigue siendo necesario: hay
 * rutas que NO montan <Aurora>, así que al salir de un shell el shader debe
 * dejar de quemar GPU detrás de una página que no lo quiere.
 * Las razones son un Set y la aurora corre solo si está VACÍO, así que 'screen'
 * convive con 'focus' (campo enfocado) y 'hidden' (pestaña oculta) sin pisarlas.
 */
export function Aurora({ state = "calm" }: { state?: AuroraState }) {
  useAurora(state);

  useEffect(() => {
    mounts += 1;
    window.CorpusAurora?.resume("screen");
    // Se lee del window EN LA LIMPIEZA, no en una variable capturada arriba: si
    // el runtime vanilla aún no había cargado al montar, capturarlo dejaría un
    // `undefined` y la aurora seguiría corriendo tras salir del shell.
    return () => {
      mounts -= 1;
      if (mounts <= 0) window.CorpusAurora?.pause("screen");
    };
  }, []);

  return null;
}
