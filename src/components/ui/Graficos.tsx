"use client";

import { useId } from "react";

/* ============================================================================
   Gráficos en SVG puro (sin dependencias): Barras, Area, Anillo.

   Reglas comunes:
   · El dato llega de fuera. Estos componentes dibujan; no inventan ni rellenan.
     Sin datos, no pintan ejes vacíos: devuelven null y la pantalla muestra su
     <EmptyState>.
   · Accesibles: role="img" + <title> con el resumen, y la tabla de datos
     oculta para lectores de pantalla (el dibujo no es la única vía al número).
   · Color por token: brasa sobre grafito; sobre crema el anillo usa la brasa
     templada (--accent-on-crema) porque brasa-500 sobre papel no contrasta.
   ============================================================================ */

export interface Dato {
  etiqueta: string;
  valor: number;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function TablaOculta({ titulo, datos }: { titulo: string; datos: Dato[] }) {
  return (
    <table className="u-sr">
      <caption>{titulo}</caption>
      <tbody>
        {datos.map((d) => (
          <tr key={d.etiqueta}>
            <th scope="row">{d.etiqueta}</th>
            <td>{fmt(d.valor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Barras ─────────────────────────────────────────────────────────────────
   horizontal (por defecto): una fila por dato, etiqueta y cifra encima de la
   pista. vertical: columnas con la etiqueta debajo. */
export interface BarrasProps {
  datos: Dato[];
  titulo: string;
  orientacion?: "horizontal" | "vertical";
  /** Tope de la escala. Por defecto, el mayor valor. */
  max?: number;
  alto?: number;
  className?: string;
}

export function Barras({ datos, titulo, orientacion = "horizontal", max, alto = 180, className }: BarrasProps) {
  const gid = useId().replace(/:/g, "");
  if (datos.length === 0) return null;
  const tope = Math.max(max ?? 0, ...datos.map((d) => d.valor), 1e-9);

  if (orientacion === "horizontal") {
    return (
      <div className={className ? `u-barras ${className}` : "u-barras"}>
        <ul className="u-barras-h" aria-hidden="true">
          {datos.map((d) => (
            <li key={d.etiqueta}>
              <span className="u-barras-e">{d.etiqueta}</span>
              <span className="u-barras-v">{fmt(d.valor)}</span>
              <svg className="u-barras-pista" viewBox="0 0 100 10" preserveAspectRatio="none" role="presentation">
                <rect x="0" y="0" width="100" height="10" rx="5" className="u-g-track" />
                <rect x="0" y="0" width={Math.max(2, (d.valor / tope) * 100)} height="10" rx="5" className="u-g-brasa" />
              </svg>
            </li>
          ))}
        </ul>
        <TablaOculta titulo={titulo} datos={datos} />
      </div>
    );
  }

  const W = 100 * datos.length;
  const H = alto;
  const base = H - 4;
  const ancho = 34;
  return (
    <div className={className ? `u-barras ${className}` : "u-barras"}>
      <svg viewBox={`0 0 ${W} ${H}`} className="u-g-svg" role="img" aria-label={titulo}>
        <title>{titulo}</title>
        <defs>
          <linearGradient id={`b${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="u-g-stop-a" />
            <stop offset="1" className="u-g-stop-b" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2={W} y1={base - f * (base - 12)} y2={base - f * (base - 12)} className="u-g-grid" />
        ))}
        {datos.map((d, i) => {
          const h = (d.valor / tope) * (base - 12);
          const x = i * 100 + (100 - ancho) / 2;
          return (
            <g key={d.etiqueta}>
              <rect x={x} y={base - h} width={ancho} height={Math.max(h, 2)} rx="8" fill={`url(#b${gid})`} />
            </g>
          );
        })}
      </svg>
      {/* Rótulos en HTML, no en el SVG: el SVG escala y el texto se volvería ilegible. */}
      <div className="u-barras-ejes" aria-hidden="true">
        {datos.map((d) => (
          <span key={d.etiqueta}>{d.etiqueta}</span>
        ))}
      </div>
      <TablaOculta titulo={titulo} datos={datos} />
    </div>
  );
}

/* ── Area ──────────────────────────────────────────────────────────────────
   Serie temporal suave (Catmull-Rom → Bézier), relleno degradado de brasa. */
export interface AreaProps {
  datos: Dato[];
  titulo: string;
  alto?: number;
  className?: string;
}

function curva(p: [number, number][]): string {
  if (p.length === 1) return `M${p[0]![0]} ${p[0]![1]}`;
  let d = `M${p[0]![0]} ${p[0]![1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function Area({ datos, titulo, alto = 200, className }: AreaProps) {
  const gid = useId().replace(/:/g, "");
  if (datos.length === 0) return null;
  const W = 600;
  const H = alto;
  const pie = H - 24;
  const techo = 10;
  const tope = Math.max(...datos.map((d) => d.valor), 1e-9);
  const paso = datos.length > 1 ? W / (datos.length - 1) : 0;
  const pts: [number, number][] = datos.map((d, i) => [i * paso, pie - (d.valor / tope) * (pie - techo)]);
  const linea = curva(pts);
  return (
    <div className={className ? `u-area ${className}` : "u-area"}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="u-g-svg" role="img" aria-label={titulo}>
        <title>{titulo}</title>
        <defs>
          <linearGradient id={`a${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="u-g-area-a" />
            <stop offset="1" className="u-g-area-b" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((k) => (
          <line key={k} x1="0" x2={W} y1={techo + (k * (pie - techo)) / 3} y2={techo + (k * (pie - techo)) / 3} className="u-g-grid" />
        ))}
        <path d={`${linea} L${W} ${pie} L0 ${pie} Z`} fill={`url(#a${gid})`} />
        <path d={linea} className="u-g-linea" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="u-area-ejes" aria-hidden="true">
        {datos.map((d) => (
          <span key={d.etiqueta}>{d.etiqueta}</span>
        ))}
      </div>
      <TablaOculta titulo={titulo} datos={datos} />
    </div>
  );
}

/* ── Anillo ────────────────────────────────────────────────────────────────
   Una proporción: valor sobre total. La cifra central es la que se pasa (no se
   redondea a escondidas) y el subtítulo dice "55 de 70". */
export interface AnilloProps {
  valor: number;
  total: number;
  titulo: string;
  /** Texto central. Por defecto, el porcentaje. */
  centro?: string;
  /** Texto bajo la cifra central. Por defecto "valor de total". */
  sub?: string;
  tamano?: number;
  grosor?: number;
  /** "crema" cuando el anillo vive sobre una tarjeta crema. */
  sobre?: "grafito" | "crema";
  className?: string;
}

export function Anillo({ valor, total, titulo, centro, sub, tamano = 160, grosor = 14, sobre = "grafito", className }: AnilloProps) {
  if (!(total > 0)) return null;
  const f = Math.min(Math.max(valor / total, 0), 1);
  const r = (tamano - grosor) / 2;
  const c = tamano / 2;
  const pct = Math.round(f * 100);
  return (
    <figure className={`u-anillo u-anillo--${sobre}${className ? ` ${className}` : ""}`} style={{ width: tamano }}>
      <svg viewBox={`0 0 ${tamano} ${tamano}`} width={tamano} height={tamano} role="img" aria-label={`${titulo}: ${fmt(valor)} de ${fmt(total)}`}>
        <title>{`${titulo}: ${fmt(valor)} de ${fmt(total)}`}</title>
        <circle cx={c} cy={c} r={r} className="u-anillo-pista" strokeWidth={grosor} fill="none" />
        <circle
          cx={c}
          cy={c}
          r={r}
          className="u-anillo-arco"
          strokeWidth={grosor}
          fill="none"
          pathLength={100}
          strokeDasharray={`${f * 100} 100`}
          strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <figcaption className="u-anillo-centro" aria-hidden="true">
        <b>{centro ?? `${pct} %`}</b>
        <span>{sub ?? `${fmt(valor)} de ${fmt(total)}`}</span>
      </figcaption>
    </figure>
  );
}
