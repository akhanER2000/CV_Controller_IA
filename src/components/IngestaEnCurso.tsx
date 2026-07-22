"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useIngesta } from "@/lib/ingesta/useIngesta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «INGESTA EN CURSO» — el trabajo visible desde CUALQUIER pantalla
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Va montado en el shell de /app, así que existe en las diez pantallas. Su
 * trabajo es doble y las dos mitades importan igual:
 *
 *   1. DECIR LA VERDAD DE DÓNDE VA. «7 de 16 fuentes · 83 items», leído de la
 *      base. Sin porcentaje: no sabemos cuánto tarda la que viene.
 *   2. EMPUJAR. `useIngesta` pide `avanzar` cuando ve el trabajo en pausa. Por
 *      eso cambiar de pantalla no solo NO cancela nada: además mantiene la
 *      ingesta viva, porque el observador viaja con el usuario.
 *
 * No se pinta nada cuando no hay trabajo o cuando ya terminó. Un indicador que
 * sigue ahí cuando no hay nada que indicar es ruido, y este producto no puede
 * permitirse enseñar estados que no son ciertos.
 *
 * Estilos EN LÍNEA a propósito: son ocho reglas para un solo nodo y todas usan
 * tokens que ya existen en globals.css. Un .css nuevo entraría en el barrido de
 * `tests/pulido-visual.test.ts` sin aportar nada que compartir.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function IngestaEnCurso() {
  const t = useT();
  // `null` = búscalo tú: el shell no sabe qué trabajo hay, lo descubre por
  // cualquier fuente sin terminar (y la RLS garantiza que solo ve las suyas).
  const { jobId, progreso } = useIngesta(null, true);

  if (!jobId || !progreso || progreso.terminado || progreso.total === 0) return null;

  const detalle = t("ingesta.shell.detalle")
    .replace("{listas}", String(progreso.listas))
    .replace("{total}", String(progreso.total))
    .replace("{items}", String(progreso.items));

  return (
    <Link
      href="/app/importar"
      aria-label={t("ingesta.shell.aria")}
      role="status"
      aria-live="polite"
      data-screen-label="ingesta-en-curso"
      style={{
        position: "fixed",
        left: "14px",
        bottom: "14px",
        zIndex: "var(--z-overlay)" as unknown as number,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        maxWidth: "min(92vw, 380px)",
        padding: "10px 14px",
        borderRadius: "var(--radius-xs)",
        border: "1px solid var(--border)",
        background: "var(--surface-elevated)",
        boxShadow: "var(--shadow-2)",
        textDecoration: "none",
        color: "var(--text)",
        font: "400 var(--fs-ui)/1.3 var(--font-sans)",
      }}
    >
      <span className="c-spin" aria-hidden="true" style={{ color: "var(--patina-500)" }}>
        ⟳
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
        <b style={{ font: "500 var(--fs-ui)/1.2 var(--font-sans)" }}>
          {progreso.pausado ? t("ingesta.shell.pausada") : t("ingesta.shell.enCurso")}
        </b>
        <span
          style={{
            font: "400 var(--fs-micro)/1.3 var(--font-mono)",
            color: "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {detalle}
        </span>
      </span>
      <span
        aria-hidden="true"
        style={{ marginLeft: "auto", font: "400 var(--fs-micro)/1 var(--font-mono)", color: "var(--link)" }}
      >
        {t("ingesta.shell.ver")} →
      </span>
    </Link>
  );
}
