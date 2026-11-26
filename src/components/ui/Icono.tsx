/* ============================================================================
   Icono — el set propio de Corpus (Forja v2).
   Rejilla de 20, trazo 1.5, currentColor: afinado al peso de Geist 500 a 13px,
   no un set genérico. Los mismos trazos que ya usaba el lateral, más los que
   piden la barra superior, los KPI y los cajones.
   ============================================================================ */

export const ICONOS = {
  panel: "M2 2h6v6H2z M12 2h6v6h-6z M2 12h6v6H2z M12 12h6v6h-6z",
  master: "M4 2h8l4 4v12H4z M7 9h6 M7 12h6 M7 15h4",
  variantes: "M10 2l8 4-8 4-8-4z M2 10l8 4 8-4 M2 14l8 4 8-4",
  fuentes: "M2 5h6l2 2h8v10H2z",
  ajustes: "M2 5h16 M2 10h16 M2 15h16 M6 3v4 M13 8v4 M8 13v4",
  mas: "M10 4v12 M4 10h12",
  buscar: "M8.5 3a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11z M13 13l4.5 4.5",
  revision: "M3 10.5l4.5 4.5L17 5",
  doc: "M5 2h7l3 3v13H5z M8 9h4 M8 12h4",
  cerrar: "M5 5l10 10 M15 5L5 15",
  flecha: "M4 10h12 M11 5l5 5-5 5",
  pulso: "M2 10h4l2-5 4 10 2-5h4",
} as const;

export type IconoNombre = keyof typeof ICONOS;

export function Icono({
  nombre,
  tamano = 18,
  className,
}: {
  nombre: IconoNombre;
  tamano?: number;
  className?: string;
}) {
  return (
    <svg
      className={className ? `u-ico ${className}` : "u-ico"}
      width={tamano}
      height={tamano}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={ICONOS[nombre]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
