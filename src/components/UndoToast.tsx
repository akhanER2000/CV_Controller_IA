"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import "./UndoToast.css";

/*
 * Toast de DESHACER — el patrón de borrado del producto (PROMPT 03 §A2):
 * borrar NO abre un diálogo de confirmación; el borrado se ejecuta DIFERIDO.
 *
 * Contrato:
 *  - El llamador quita el elemento de su estado de forma OPTIMISTA y llama
 *    show({ message, onUndo, onCommit }).
 *  - «Deshacer» (≈8 s) → onUndo(): restaura el estado. NO hubo side-effect aún.
 *  - Expira / llega otro borrado / se desmonta la pantalla → onCommit(): recién
 *    ahí se ejecuta el DELETE real. Así deshacer es perfecto (mismos ids) y no
 *    hay que "recrear" nada.
 *  - Solo hay UN deshacer pendiente: un borrado nuevo confirma el anterior.
 *
 * La confirmación dura (teclear la frase) queda reservada para lo irreversible
 * de verdad: borrar todos los datos o borrar la cuenta.
 */

export interface UndoEntry {
  /** Mensaje ya traducido, p. ej. «Eliminado: “Backend Developer” · 3 viñetas». */
  message: string;
  /** Revierte el estado optimista (aún no hubo side-effect). */
  onUndo: () => void;
  /** Ejecuta el side-effect real (el DELETE) al expirar o al forzar. */
  onCommit: () => void | Promise<void>;
  /** Ventana de gracia en ms (por defecto 8000). */
  ms?: number;
}

export function useUndoToast() {
  const t = useT();
  const [entry, setEntry] = useState<UndoEntry | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entryRef = useRef<UndoEntry | null>(null);
  entryRef.current = entry;

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  /** Confirma el pendiente YA (ejecuta el DELETE real) y cierra el toast. */
  const commit = useCallback(() => {
    const e = entryRef.current;
    if (!e) return;
    clearTimer();
    setEntry(null);
    void e.onCommit();
  }, []);

  const show = useCallback((next: UndoEntry) => {
    // Un borrado nuevo confirma el anterior: solo hay un deshacer pendiente.
    const prev = entryRef.current;
    clearTimer();
    if (prev) void prev.onCommit();
    setEntry(next);
    timer.current = setTimeout(() => {
      const e = entryRef.current;
      if (!e) return;
      timer.current = null;
      setEntry(null);
      void e.onCommit();
    }, next.ms ?? 8000);
  }, []);

  const undo = useCallback(() => {
    const e = entryRef.current;
    if (!e) return;
    clearTimer();
    setEntry(null);
    e.onUndo();
  }, []);

  // Salir de la pantalla con un borrado pendiente lo CONFIRMA (no se pierde).
  useEffect(
    () => () => {
      const e = entryRef.current;
      if (timer.current) clearTimeout(timer.current);
      if (e) void e.onCommit();
    },
    [],
  );

  const node = entry ? (
    <div className="c-undo" role="status">
      <span className="c-undo__msg">{entry.message}</span>
      <button type="button" className="c-undo__btn" onClick={undo}>
        {t("common.undo")}
      </button>
    </div>
  ) : null;

  return { show, undo, commit, pending: entry !== null, node };
}
