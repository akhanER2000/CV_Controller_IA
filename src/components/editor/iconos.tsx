/* ============================================================================
   Íconos del editor — misma rejilla y trazo que el set de Forja v2
   (src/components/ui/Icono.tsx: 20×20, trazo 1.5, currentColor). Viven aquí
   porque solo los usa el editor (biblioteca por tipo, barra y vista previa) y
   ui/ no se toca desde este lote.
   ============================================================================ */

const TRAZOS = {
  todo: "M3 4h14 M3 8h14 M3 12h14 M3 16h9",
  summary: "M4 4h12 M4 8h12 M4 12h8 M14 14l2 2 3-4",
  work: "M3 7h14v10H3z M7 7V4h6v3 M3 11h14",
  skills: "M10 2l2.4 5 5.6.6-4.2 3.8 1.2 5.6L10 14.3 5 17l1.2-5.6L2 7.6 7.6 7z",
  projects: "M3 5h5l2 2h7v9H3z M7 11h6",
  education: "M10 3l8 4-8 4-8-4z M5 9v4c0 1.5 2.5 3 5 3s5-1.5 5-3V9",
  certifications: "M10 2a5 5 0 1 0 0 10a5 5 0 1 0 0-10z M7 11l-2 7 5-2 5 2-2-7",
  languages: "M3 4h9 M7.5 2v2 M5 4c0 4 3 7 6 8 M10 4c0 3-3 6-6 8 M11 18l4-9 4 9 M12.5 15h5",
  publications: "M4 3h9l3 3v11H4z M7 8h6 M7 11h6 M7 14h4",
  references: "M7 7a3 3 0 1 0 0.01 0z M2 17c0-3 2.5-5 5-5s5 2 5 5 M14 6a2.5 2.5 0 1 0 0.01 0z M13 12c2.5 0 5 1.5 5 4",
  biblioteca: "M3 3h4v14H3z M8 3h4v14H8z M13 4l3.5-1 2.5 13-3.5 1z",
  documento: "M5 2h7l3 3v13H5z M8 9h4 M8 12h4",
  descargar: "M10 3v10 M6 9l4 4 4-4 M4 17h12",
  completa: "M3 8V3h5 M12 3h5v5 M17 12v5h-5 M8 17H3v-5",
  salir: "M8 3v5H3 M17 8h-5V3 M12 17v-5h5 M3 12h5v5",
  ocultar: "M5 5l10 10 M15 5L5 15",
  plegar: "M6 8l4 4 4-4",
} as const;

export type IconoEdNombre = keyof typeof TRAZOS;

export function IconoEd({ nombre, tamano = 15 }: { nombre: IconoEdNombre; tamano?: number }) {
  return (
    <svg className="edx-ico" width={tamano} height={tamano} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d={TRAZOS[nombre]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
