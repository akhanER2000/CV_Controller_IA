/* ============================================================================
   ATAJOS DEL EDITOR — lógica pura (sin React) para poder probarla.

   Una tecla sola, sin modificadores, y NUNCA mientras se escribe: en un input,
   un textarea, un select o un texto en edición (contentEditable) la tecla es
   del texto. Aceptar (A) solo actúa sobre la decisión MARCADA (la que trajo J o
   la que tiene el foco): nunca sobre una que el usuario no ha visto, y nunca más
   de una por pulsación. No existe «aceptar todo».
   ============================================================================ */

export type AccionAtajo = "siguiente" | "aceptar" | "preview" | "completa" | "biblioteca" | "buscar" | "ayuda" | "escape";

/** Tecla visible → acción. El orden es el de la ayuda. */
export const ATAJOS: readonly { tecla: string; accion: AccionAtajo; clave: string }[] = [
  { tecla: "J", accion: "siguiente", clave: "editor.edAtajoSiguiente" },
  { tecla: "A", accion: "aceptar", clave: "editor.edAtajoAceptar" },
  { tecla: "P", accion: "preview", clave: "editor.edAtajoPv" },
  { tecla: "F", accion: "completa", clave: "editor.edAtajoCompleta" },
  { tecla: "B", accion: "biblioteca", clave: "editor.edAtajoLib" },
  { tecla: "/", accion: "buscar", clave: "editor.edAtajoBuscar" },
  { tecla: "Esc", accion: "escape", clave: "editor.edAtajoEsc" },
];

/** La letra que se pinta junto a cada control. */
export const TECLA: Record<Exclude<AccionAtajo, "ayuda">, string> = {
  siguiente: "J",
  aceptar: "A",
  preview: "P",
  completa: "F",
  biblioteca: "B",
  buscar: "/",
  escape: "Esc",
};

interface ObjetivoTecla {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
}

/** ¿El foco está en algo donde la tecla escribe? */
export function escribeTexto(el: ObjetivoTecla | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  // Un checkbox o un botón no escriben: ahí los atajos siguen vivos.
  const t = (el.type ?? "text").toLowerCase();
  return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(t);
}

export interface EventoTecla {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: ObjetivoTecla | null;
}

/** Evento de teclado → acción (o null si la tecla no es un atajo o es del texto). */
export function accionDeTecla(e: EventoTecla): AccionAtajo | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "Escape") return "escape"; // Esc sirve también dentro de un campo
  if (escribeTexto(e.target)) return null;
  switch (e.key) {
    case "j":
    case "J":
      return "siguiente";
    case "a":
    case "A":
      return "aceptar";
    case "p":
    case "P":
      return "preview";
    case "f":
    case "F":
      return "completa";
    case "b":
    case "B":
      return "biblioteca";
    case "/":
      return "buscar";
    case "?":
      return "ayuda";
    default:
      return null;
  }
}
