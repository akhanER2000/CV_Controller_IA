"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import "./Breadcrumb.css";

/* ============================================================================
   Breadcrumb — la salida de toda pantalla interior de /app.

   EL PROBLEMA QUE RESUELVE
   Fuentes → "+ Volcar más material" llevaba a /app/importar, y esa pantalla solo
   tenía el logo de Corpus como salida: un callejón sin salida. Mandar "al Panel
   por defecto" tampoco vale — no es donde estabas.

   LA SEMÁNTICA: VOLVER LITERAL
   Al navegar a una pantalla interior se declara el origen en la URL:
       /app/importar?from=/app/fuentes
   El botón volver usa ESE origen. Si no hay `from`, o si no es una ruta interna
   válida, usa el `fallback` que declara la pantalla (siempre una salida real).
   Nunca se manda al Panel "porque sí": el Panel solo aparece si es el fallback
   declarado o el origen real.

   DECISIÓN — NAVEGACIÓN EXPLÍCITA, NO history.back()
   El botón es un <Link href={destino}> de verdad: ancla real, clic-medio abre en
   pestaña, funciona sin JS y el destino es VISIBLE en la barra de estado del
   navegador. history.back() se descartó porque el historial puede contener pasos
   de la propia pantalla (filtros, modales, redirecciones) y "atrás" acabaría
   siendo una ruleta; además no se puede verificar que el referrer sea interno sin
   leer document.referrer, que se pierde con navegación cliente.

   DECISIÓN — useSearchParams + <Suspense> INTERNO
   useSearchParams() obliga a un límite de Suspense cuando la ruta se prerenderiza
   estáticamente (Next 15). En vez de exigirle un <Suspense> a cada pantalla, el
   límite vive AQUÍ: durante el prerender se pinta la variante con el `fallback`
   —que ya es una salida válida— y al hidratar se corrige al origen real. La
   pantalla nunca queda sin botón volver, ni siquiera un instante.

   Clases: las del sistema (c-*) donde aplica; las nuevas con prefijo bc-.
   ============================================================================ */

/** Nombre del parámetro de URL que transporta el origen. */
export const ORIGIN_PARAM = "from";

/** Tope defensivo: un `from` más largo que esto es basura, no una ruta. */
const MAX_PATH_LEN = 512;

/* ── Helpers PUROS (testeados en tests/nav-origin.test.ts) ─────────────────── */

/**
 * ¿Es `value` una ruta RELATIVA e INTERNA del área /app?
 *
 * Acepta: "/app", "/app/fuentes", "/app/variantes/abc/salud", con query y hash.
 * Rechaza (defensa contra open-redirect e inyección):
 *   - lo que no sea string, vacío o con espacios al borde
 *   - URLs absolutas ("https://evil.com/app") y esquemas ("javascript:...")
 *   - protocol-relative ("//evil.com") y su variante backslash ("/\evil.com")
 *   - travesía de directorios ("..", y sus formas percent-encoded)
 *   - caracteres de control, backslashes
 *   - rutas fuera de /app ("/login") y falsos amigos ("/appearance")
 */
export function isInternalAppPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value || value.length > MAX_PATH_LEN) return false;
  if (value.trim() !== value) return false;
  // Una sola barra inicial: descarta "//host" y "/\host".
  if (value[0] !== "/" || value[1] === "/" || value[1] === "\\") return false;
  if (value.includes("\\")) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  if (value.includes("..")) return false;
  // Percent-encoding de "." "/" "\" — nadie legítimo lo manda en un `from`.
  if (/%2e|%2f|%5c/i.test(value)) return false;
  if (value === "/app") return true;
  return value.startsWith("/app/") || value.startsWith("/app?") || value.startsWith("/app#");
}

/**
 * A dónde vuelve el botón: al origen declarado si es válido; si no, al fallback
 * de la pantalla. NUNCA inventa un destino.
 */
export function backTarget(from: string | null | undefined, fallback: string): string {
  return isInternalAppPath(from) ? from : fallback;
}

/**
 * Lee el origen de una query string cruda (p. ej. `window.location.search`).
 * Para los sitios donde hace falta el origen fuera del árbol de <Breadcrumb>.
 */
export function readOrigin(search: string, fallback: string): string {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return fallback;
  }
  return backTarget(params.get(ORIGIN_PARAM), fallback);
}

/**
 * Decora un enlace con el origen: withOrigin("/app/staging", "/app/fuentes")
 * → "/app/staging?from=%2Fapp%2Ffuentes". Si el origen no es válido, devuelve
 * el href tal cual (no se ensucia la URL con basura).
 */
export function withOrigin(href: string, origin: string): string {
  if (!isInternalAppPath(origin)) return href;
  const hashAt = href.indexOf("#");
  const base = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${ORIGIN_PARAM}=${encodeURIComponent(origin)}${hash}`;
}

/** Ruta → clave i18n de su nombre. El orden importa: lo específico primero. */
const LABEL_ROUTES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/app(?:[?#].*)?$/, "nav.panel"],
  [/^\/app\/master(?:[/?#].*)?$/, "nav.master"],
  [/^\/app\/variantes\/[^/?#]+(?:[/?#].*)?$/, "nav.variante"],
  [/^\/app\/variantes(?:[?#].*)?$/, "nav.variantes"],
  [/^\/app\/fuentes(?:[/?#].*)?$/, "nav.fuentes"],
  [/^\/app\/importar(?:[/?#].*)?$/, "nav.importar"],
  [/^\/app\/staging(?:[/?#].*)?$/, "nav.staging"],
  [/^\/app\/ajustes(?:[/?#].*)?$/, "nav.ajustes"],
  [/^\/app\/cuenta(?:[/?#].*)?$/, "nav.cuenta"],
];

/**
 * Clave i18n con la que nombrar el destino del botón volver. Para rutas que no
 * están en el mapa cae en "nav.back" ("Volver"), nunca en un nombre inventado.
 */
export function backLabelKey(target: string): string {
  for (const [re, key] of LABEL_ROUTES) if (re.test(target)) return key;
  return "nav.back";
}

/* ── Componente ────────────────────────────────────────────────────────────── */

export interface BreadcrumbProps {
  /** Salida declarada por la pantalla cuando no hay `?from` válido. Obligatoria:
   *  una pantalla sin fallback es una pantalla sin salida. */
  fallback: string;
  /** Nombre literal del fallback cuando la ruta no está en el mapa (p. ej. el
   *  título de una variante concreta). Solo se usa si se vuelve al fallback. */
  fallbackLabel?: string;
  /** Miga de la pantalla actual, YA traducida. Si se omite, solo botón volver
   *  (para barras que ya rotulan la sección por su cuenta). */
  current?: string;
  /** Clase extra para encajar en la barra de cada pantalla. */
  className?: string;
}

function Migas({
  target,
  fallback,
  fallbackLabel,
  current,
  className,
}: BreadcrumbProps & { target: string }) {
  const t = useT();
  const label = target === fallback && fallbackLabel ? fallbackLabel : t(backLabelKey(target));

  return (
    <nav className={className ? `bc ${className}` : "bc"} aria-label={t("nav.breadcrumbAria")}>
      <Link
        className="bc-back"
        href={target}
        aria-label={t("nav.backTo").replace("{destino}", label)}
      >
        <span className="bc-arrow" aria-hidden="true">
          ←
        </span>
        <span className="bc-label">{label}</span>
      </Link>
      {current ? (
        <>
          <span className="bc-sep" aria-hidden="true">
            /
          </span>
          <span className="bc-current" aria-current="page">
            {current}
          </span>
        </>
      ) : null}
    </nav>
  );
}

function MigasConOrigen(props: BreadcrumbProps) {
  const params = useSearchParams();
  return <Migas {...props} target={backTarget(params.get(ORIGIN_PARAM), props.fallback)} />;
}

/**
 * Migas + botón volver. El destino sale de `?from=` si es una ruta interna de
 * /app; si no, del `fallback` que declara la pantalla.
 */
export function Breadcrumb(props: BreadcrumbProps) {
  return (
    <Suspense fallback={<Migas {...props} target={props.fallback} />}>
      <MigasConOrigen {...props} />
    </Suspense>
  );
}
