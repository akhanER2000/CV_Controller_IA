import "./cuenta.css";

/* Estado — en línea · a medias · caído. El color nunca va solo: punto (lleno o
   hueco) + etiqueta. El motivo real lo pinta quien lo usa, al lado. */

export type EstadoValor = "ok" | "warn" | "fail";

export function Estado({ valor, children }: { valor: EstadoValor; children: string }) {
  return (
    <span className={`cu-estado cu-estado--${valor}`}>
      <span className="cu-estado-p" aria-hidden="true" />
      {children}
    </span>
  );
}
