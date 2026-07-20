"use client";

import { useEffect, useRef } from "react";

/* ============================================================================
   Tipos y hooks sobre el runtime vanilla de Corpus (public/corpus/*.js).
   El contrato con el diseño son las APIs window.CorpusAurora / window.CorpusMotion;
   estos tipos las describen para TypeScript, sin re-implementarlas.
   ============================================================================ */

export type AuroraState = "calm" | "active";

export interface CorpusAuroraApi {
  mount: (opts?: { state?: AuroraState }) => CorpusAuroraApi;
  setState: (name: AuroraState) => void;
  pause: (reason?: string) => void;
  resume: (reason?: string) => void;
  setStrength: (v: number) => void;
  readonly running: boolean;
}

export interface CorpusMotionApi {
  rm: () => boolean;
  show: (el: Element) => void;
  reveal: (el: Element, delay?: number) => void;
  stagger: (
    el: Element,
    o?: { step?: number; cap?: number; base?: number; items?: Iterable<Element> },
  ) => void;
  io: (scope?: Document | Element) => void;
  words: (el: Element) => void;
  chars: (el: Element) => void;
  counter: (
    el: Element,
    to: number,
    o?: { from?: number; dur?: number; fmt?: (n: number) => string },
  ) => void;
  shimmer: (el: Element) => boolean;
  xray: (root: HTMLElement, mode?: "doc" | "raw") => string;
  enter: (el: HTMLElement) => void;
  boot: (scope?: Document | Element) => void;
}

declare global {
  interface Window {
    CorpusAurora?: CorpusAuroraApi;
    CorpusMotion?: CorpusMotionApi;
  }
}

/** Espera a que el runtime vanilla esté cargado y ejecuta `fn`. */
export function whenReady(pick: () => unknown, fn: () => void): () => void {
  if (pick()) {
    fn();
    return () => {};
  }
  let tries = 0;
  const id = window.setInterval(() => {
    if (pick()) {
      window.clearInterval(id);
      fn();
    } else if (++tries > 100) {
      window.clearInterval(id);
    }
  }, 30);
  return () => window.clearInterval(id);
}

/**
 * Monta la aurora. La atmósfera es CONSTANTE y el montaje es UNO SOLO por
 * shell: /app lo hace en su layout y AuthScreen para las rutas de entrada, que
 * quedan fuera de ese layout. Ninguna pantalla vuelve a montarla — cada una
 * declara su INTENSIDAD con <AuroraTune> (ver src/components/Aurora.tsx).
 * (Deroga la regla vieja «solo las ventanas la montan; los muros no».)
 * `state='active'` solo durante la ingesta: es el pulso de la máquina pensando.
 */
export function useAurora(state: AuroraState = "calm") {
  useEffect(() => {
    return whenReady(
      () => window.CorpusAurora,
      () => {
        const a = window.CorpusAurora!;
        a.mount({ state });
        a.setState(state);
      },
    );
  }, [state]);
}

/**
 * Dibuja los hairlines/reveals estáticos de un scope al montar (CorpusMotion.boot).
 * Devuelve una ref para acotar el scope; sin ref, opera sobre todo el documento.
 */
export function useBoot<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    return whenReady(
      () => window.CorpusMotion,
      () => window.CorpusMotion!.boot(ref.current ?? document),
    );
  }, []);
  return ref;
}
