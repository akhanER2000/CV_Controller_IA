"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import "./Progreso.css";

/* ============================================================================
   Progreso — EL indicador de progreso de Corpus (Forja v2). Uno solo en todo.
     · NO desplaza nada: «flotante» va en posición fija (una píldora abajo, al
       centro, sin capturar clics); «en-sitio» reserva su hueco siempre, activo
       o no (visibility, nunca display).
     · Por PASOS REALES: «Midiendo · 1 de 3». El paso lo dice quien sabe en qué
       paso está; aquí no se inventa ninguno.
     · Porcentaje SOLO si hay uno real (bytes leídos, items hechos…) — DA-A2.
       Sin él, el anillo gira (indeterminado) y no se pinta ningún número.
     · Con prefers-reduced-motion el anillo no gira: queda el arco fijo y el
       texto dice lo mismo.
   Uso:
     <Progreso activo={busy} pasos={["Midiendo", "Redactando", "Guardando"]} paso={1} />
     <Progreso activo={busy} etiqueta="Generando el PDF" />
     <AnchoFijo ocupado={busy} reposo="Descargar PDF" carga="Generando…" />
   ============================================================================ */

export interface ProgresoProps {
  activo: boolean;
  /** los nombres de los pasos reales, en orden */
  pasos?: readonly string[];
  /** índice (desde 0) del paso en curso dentro de `pasos` */
  paso?: number;
  /** cuando no hay pasos: qué se está haciendo («Generando el PDF») */
  etiqueta?: string;
  /** 0–100, SOLO si es una medida real; si no, se omite */
  porcentaje?: number | null;
  /** «flotante» (fijo en la ventana) o «en-sitio» (reserva su hueco) */
  colocacion?: "flotante" | "en-sitio";
  /** id para pruebas o aria-describedby */
  id?: string;
}

const R = 7;
const C = 2 * Math.PI * R;

/** El texto que se lee: «Paso · i de n · p %» con lo que sea real. Exportado para tests. */
export function textoProgreso(
  p: Pick<ProgresoProps, "pasos" | "paso" | "etiqueta" | "porcentaje">,
  de: string,
): string {
  const partes: string[] = [];
  const n = p.pasos?.length ?? 0;
  const i = n ? Math.min(Math.max(p.paso ?? 0, 0), n - 1) : -1;
  if (n && i >= 0) {
    partes.push(p.pasos![i]!);
    if (n > 1) partes.push(de.replace("{i}", String(i + 1)).replace("{n}", String(n)));
  } else if (p.etiqueta) {
    partes.push(p.etiqueta);
  }
  const pc = porcentajeReal(p.porcentaje);
  if (pc != null) partes.push(`${pc} %`);
  return partes.join(" · ");
}

function porcentajeReal(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(Math.max(v, 0), 100)) : null;
}

export function Progreso({ activo, pasos, paso, etiqueta, porcentaje, colocacion = "flotante", id }: ProgresoProps) {
  const t = useT();
  const pc = porcentajeReal(porcentaje);
  const n = pasos?.length ?? 0;
  const i = n ? Math.min(Math.max(paso ?? 0, 0), n - 1) : 0;
  const texto = activo ? textoProgreso({ pasos, paso, etiqueta, porcentaje }, t("common.progresoDe")) : "";

  return (
    <div
      className="u-prog"
      id={id}
      data-colocacion={colocacion}
      data-activo={activo ? "" : undefined}
      role="status"
      aria-live="polite"
      aria-busy={activo}
    >
      {activo && (
        <>
          <svg className="u-prog-anillo" data-modo={pc == null ? "indet" : "det"} width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <circle className="pista" cx="9" cy="9" r={R} />
            <circle
              className="arco"
              cx="9"
              cy="9"
              r={R}
              strokeDasharray={C}
              strokeDashoffset={pc == null ? C * 0.72 : C * (1 - pc / 100)}
            />
          </svg>
          <span className="u-prog-txt">{texto}</span>
          {n > 1 && (
            <span className="u-prog-pasos" aria-hidden="true">
              {pasos!.map((p, k) => (
                <span key={`${k}:${p}`} data-estado={k < i ? "hecho" : k === i ? "ahora" : "luego"} />
              ))}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Un botón que no cambia de ancho al cargar: las dos etiquetas ocupan la misma
 * celda y el ancho es el de la mayor; se ve una sola.
 */
export function AnchoFijo({ ocupado, reposo, carga }: { ocupado: boolean; reposo: ReactNode; carga: ReactNode }) {
  return (
    <span className="u-fijo">
      <span aria-hidden={ocupado || undefined} data-visible={!ocupado ? "" : undefined}>
        {reposo}
      </span>
      <span aria-hidden={!ocupado || undefined} data-visible={ocupado ? "" : undefined}>
        {carga}
      </span>
    </span>
  );
}
