import type { ReactNode } from "react";
import "./cuenta.css";

/* Cabecera de pantalla de cuenta: rótulo opcional, título en la voz display y
   una línea de contexto en sans (no en mono: se lee, no se audita). */

export function CabezaPantalla({
  titulo,
  sub,
  rotulo,
  acciones,
}: {
  titulo: ReactNode;
  sub?: ReactNode;
  rotulo?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <header className="cu-cabeza">
      {rotulo ? <span className="cu-rotulo">{rotulo}</span> : null}
      <h1 className="cu-cabeza-t">{titulo}</h1>
      {sub ? <p className="cu-cabeza-sub">{sub}</p> : null}
      {acciones ? <div className="cu-linea">{acciones}</div> : null}
    </header>
  );
}
