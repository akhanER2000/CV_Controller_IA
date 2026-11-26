import type { ReactNode } from "react";
import { Card } from "./Card";
import { Icono, type IconoNombre } from "./Icono";

/* ============================================================================
   KpiCard — una cifra con su origen.

   REGLA DEL PRODUCTO: ningún número en la UI sin fuente real. Por eso `fuente`
   es OBLIGATORIA en el tipo: un <KpiCard> sin ella no compila (lo prueba
   tests/kpi-fuente.test.ts con el compilador de TypeScript). Y como el tipo no
   puede impedir un string vacío, el componente lo rechaza en ejecución: una
   fuente en blanco es lo mismo que no tenerla.

   La fuente se PINTA bajo la cifra ("fuente: master"), no va escondida en un
   title: quien lee el número ve de dónde sale.
   ============================================================================ */

export interface KpiCardProps {
  /** Qué se cuenta: "Ítems en el master". */
  etiqueta: string;
  /** La cifra. Llega ya calculada de datos reales; aquí no se inventa nada. */
  valor: ReactNode;
  /** De dónde sale la cifra: "master", "variante activa", "motor de ajuste".
   *  Obligatoria. Sin fuente, no hay KPI. */
  fuente: string;
  /** Unidad pequeña tras la cifra ("%", "pág"). */
  unidad?: string;
  /** Línea de contexto opcional bajo la etiqueta. */
  nota?: string;
  icono?: IconoNombre;
  /** grafito (por defecto) · brasa (la cifra que manda) · crema. */
  material?: "grafito" | "brasa" | "crema";
  className?: string;
}

export function KpiCard({ etiqueta, valor, fuente, unidad, nota, icono, material = "grafito", className }: KpiCardProps) {
  if (typeof fuente !== "string" || fuente.trim() === "") {
    throw new Error(`KpiCard «${etiqueta}»: falta la fuente. Ningún número sale sin origen.`);
  }
  return (
    <Card material={material} className={className ? `u-kpi ${className}` : "u-kpi"}>
      <div className="u-kpi-cab">
        <p className="u-kpi-etq">{etiqueta}</p>
        {icono ? (
          <span className="u-kpi-ico" aria-hidden="true">
            <Icono nombre={icono} />
          </span>
        ) : null}
      </div>
      <p className="u-kpi-valor">
        {valor}
        {unidad ? <span className="u-kpi-unidad">{unidad}</span> : null}
      </p>
      {nota ? <p className="u-kpi-nota">{nota}</p> : null}
      <p className="u-kpi-fuente">
        <span className="u-sr">Fuente: </span>
        <span aria-hidden="true">fuente: </span>
        {fuente}
      </p>
    </Card>
  );
}
