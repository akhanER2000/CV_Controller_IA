// Sin "use client": solo lo importa el editor (ya cliente); así las props pueden ser funciones.
import { useCallback, useEffect, useRef, useState } from "react";

/* ============================================================================
   VISTA PREVIA — modo (al lado · oculta · pantalla completa) y ancho ajustable.
   Es preferencia de UI del usuario: vive en localStorage, se hidrata ya montado
   (leerlo en el primer render rompería la hidratación) y, si no hay almacén
   (modo privado), simplemente no sobrevive a la sesión. No toca el PDF: el
   iframe sigue mostrando los mismos bytes de /api/cv.
   ============================================================================ */

export type ModoPreview = "lado" | "oculto" | "completo";

export const PV_ANCHO_MIN = 340;
export const PV_ANCHO_DEF = 500;
/** El centro nunca baja de esto: es donde se decide. */
export const CENTRO_MIN = 420;
const CLAVE_ANCHO = "corpus.editor.pvAncho";
const CLAVE_MODO = "corpus.editor.pvModo";

/** Ancho permitido dado el espacio de la rejilla (sin el centro mínimo). */
export function limitarAncho(ancho: number, disponible: number): number {
  const max = Math.max(PV_ANCHO_MIN, disponible - CENTRO_MIN);
  return Math.round(Math.min(Math.max(ancho, PV_ANCHO_MIN), max));
}

/** Ciclo de la tecla P: al lado ↔ oculta (desde pantalla completa, vuelve al lado). */
export function alternarOculto(m: ModoPreview): ModoPreview {
  return m === "lado" ? "oculto" : "lado";
}

/** Ciclo de la tecla F: pantalla completa ↔ al lado. */
export function alternarCompleto(m: ModoPreview): ModoPreview {
  return m === "completo" ? "lado" : "completo";
}

export function useVistaPrevia() {
  const [modo, setModo] = useState<ModoPreview>("lado");
  const [ancho, setAncho] = useState(PV_ANCHO_DEF);
  const anchoRef = useRef(ancho);
  anchoRef.current = ancho;

  useEffect(() => {
    try {
      const a = Number(window.localStorage.getItem(CLAVE_ANCHO));
      if (Number.isFinite(a) && a >= PV_ANCHO_MIN) setAncho(a);
      const m = window.localStorage.getItem(CLAVE_MODO);
      // Pantalla completa no se recuerda: abrir el editor tapado confundiría.
      if (m === "oculto") setModo("oculto");
    } catch {
      /* sin almacén: valores por defecto */
    }
  }, []);

  const guardar = useCallback((k: string, v: string) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* la preferencia no sobrevive a la sesión */
    }
  }, []);

  const cambiarModo = useCallback(
    (m: ModoPreview) => {
      setModo(m);
      if (m !== "completo") guardar(CLAVE_MODO, m);
    },
    [guardar],
  );

  /** Fija el ancho (ya limitado por quien conoce la rejilla) y lo recuerda. */
  const fijarAncho = useCallback(
    (a: number, persistir: boolean) => {
      setAncho(a);
      if (persistir) guardar(CLAVE_ANCHO, String(a));
    },
    [guardar],
  );

  return { modo, ancho, anchoRef, cambiarModo, fijarAncho };
}
