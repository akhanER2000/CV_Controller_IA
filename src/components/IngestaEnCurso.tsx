"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useIngesta } from "@/lib/ingesta/useIngesta";
import "./IngestaEnCurso.css";

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
 * FORJA v2: tarjeta de vidrio abajo a la derecha (abajo a la izquierda tapaba
 * el pie del lateral; en móvil sube por encima de la barra inferior) con una
 * barra de avance. La barra es `listas / total` — fuentes YA terminadas sobre
 * las que hay, ambas leídas de la base —, no un porcentaje de tiempo. Sus
 * estilos van en IngestaEnCurso.css (prefijo ie-), solo con tokens.
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

  // Fracción de fuentes terminadas (dato de la base, no una estimación).
  const avance = Math.min(100, Math.max(0, (progreso.listas / progreso.total) * 100));

  return (
    <Link
      href="/app/importar"
      className="ie-pill"
      aria-label={t("ingesta.shell.aria")}
      role="status"
      aria-live="polite"
      data-screen-label="ingesta-en-curso"
    >
      <span className="ie-fila">
        <span className="c-spin ie-spin" aria-hidden="true">
          ⟳
        </span>
        <span className="ie-txt">
          <b className="ie-t">{progreso.pausado ? t("ingesta.shell.pausada") : t("ingesta.shell.enCurso")}</b>
          <span className="ie-det">{detalle}</span>
        </span>
        <span className="ie-ver" aria-hidden="true">
          {t("ingesta.shell.ver")} →
        </span>
      </span>
      <span className="ie-barra" aria-hidden="true">
        <span style={{ width: `${avance}%` }} />
      </span>
    </Link>
  );
}
