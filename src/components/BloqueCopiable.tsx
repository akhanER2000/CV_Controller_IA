"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import "./BloqueCopiable.css";

/* ============================================================================
   BloqueCopiable — un texto que el usuario se lleva ENTERO a otra parte.

   Nace de la tercera vía del volcado (la plantilla estructurada): el usuario
   tiene que pegar unas instrucciones EXACTAS en su propia suscripción de
   ChatGPT/Claude. Si se le pide que "escriba algo parecido", la vía sin IA
   nuestra se convierte en una vía CON invención ajena — que es justo lo que la
   tercera puerta viene a evitar. Por eso el bloque existe: el texto que se copia
   es palabra por palabra el que se ve.

   ★ WYSIWYC (what you see is what you copy). Se renderiza `texto` y se copia
   `texto`, la MISMA variable. No hay una versión "bonita" en pantalla y otra
   en el portapapeles: si divergen, el usuario pega instrucciones distintas de
   las que leyó y no se entera nunca.

   ★ EL FALLO SE DICE. navigator.clipboard no existe en contexto inseguro (http)
   y puede ser denegado por permisos. En los dos casos writeText no está o
   revienta — y entonces NO se pinta "Copiado". Se dice que no se pudo y se
   SELECCIONA el texto, que es el remedio real: el usuario pulsa Ctrl+C y ya
   está. Fingir el éxito aquí sería peor que no tener botón: el usuario se va al
   chat, pega lo anterior que llevara en el portapapeles y no entiende nada.

   No se usa document.execCommand('copy') como red: está obsoleto y devuelve
   `true` en escenarios en los que no ha copiado nada. Una red que miente es
   exactamente el problema que este componente evita.
   ============================================================================ */

type Estado = "reposo" | "ok" | "fallo";

export interface BloqueCopiableProps {
  /** El texto EXACTO: se muestra y se copia. Una sola fuente de verdad. */
  texto: string;
  /** Rótulo de encima (ya traducido por la pantalla). */
  label?: ReactNode;
  /** Etiqueta del botón en reposo. */
  copiar: string;
  /** Acuse de éxito (se borra solo a los 2,4 s). */
  copiado: string;
  /** Qué hacer cuando el navegador no deja copiar. Se dice, no se esconde. */
  fallo: string;
  /** Nombre accesible del bloque de texto (region). */
  aria: string;
  id?: string;
  /** Clases de COLOCACIÓN de la pantalla (márgenes), nunca de aspecto. */
  className?: string;
}

export function BloqueCopiable({
  texto,
  label,
  copiar,
  copiado,
  fallo,
  aria,
  id,
  className,
}: BloqueCopiableProps) {
  const [estado, setEstado] = useState<Estado>("reposo");
  const preRef = useRef<HTMLPreElement>(null);
  const timer = useRef<number | null>(null);

  // El acuse de éxito caduca; el aviso de fallo NO. El fallo es una instrucción
  // ("cópialo a mano"), y una instrucción que desaparece sola no sirve de nada.
  useEffect(() => {
    if (estado !== "ok") return;
    timer.current = window.setTimeout(() => setEstado("reposo"), 2400);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [estado]);

  /** Deja el texto seleccionado para que Ctrl+C funcione sin tocar el ratón. */
  function seleccionar() {
    const nodo = preRef.current;
    if (!nodo) return;
    const sel = window.getSelection?.();
    if (!sel) return;
    const rango = document.createRange();
    rango.selectNodeContents(nodo);
    sel.removeAllRanges();
    sel.addRange(rango);
  }

  async function copiarAlPortapapeles() {
    try {
      // Sin API no hay copia. Se lanza a propósito para caer en el mismo camino
      // que un rechazo de permisos: un solo sitio donde se dice la verdad.
      if (!navigator.clipboard?.writeText) throw new Error("sin portapapeles");
      await navigator.clipboard.writeText(texto);
      setEstado("ok");
    } catch {
      setEstado("fallo");
      seleccionar();
    }
  }

  return (
    <div className={`bcp${className ? ` ${className}` : ""}`} id={id}>
      <div className="bcp-head">
        {label ? <span className="bcp-label">{label}</span> : <span />}
        <button type="button" className="bcp-copy" onClick={() => void copiarAlPortapapeles()}>
          {estado === "ok" ? `✓ ${copiado}` : copiar}
        </button>
      </div>
      {/* tabIndex=0: un <pre> con scroll tiene que ser alcanzable por teclado o
          su contenido queda fuera del alcance de quien no usa ratón. */}
      <pre className="bcp-pre" ref={preRef} tabIndex={0} role="region" aria-label={aria}>
        {texto}
      </pre>
      {/* Live region SIEMPRE presente: si el <p> se monta con el mensaje dentro,
          algunos lectores no lo anuncian. Vacío en reposo, con texto al actuar. */}
      <p className={`bcp-status${estado === "fallo" ? " is-fallo" : ""}`} role="status" aria-live="polite">
        {estado === "fallo" ? fallo : ""}
      </p>
    </div>
  );
}
