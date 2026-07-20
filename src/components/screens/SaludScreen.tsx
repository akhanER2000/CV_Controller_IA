"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { AuroraTune, AURORA_TRABAJO } from "@/components/Aurora";
import { Breadcrumb } from "@/components/Breadcrumb";
import "./salud.css";

/* ============================================================================
   Salud de la variante — ESTADO VACÍO HONESTO.

   QUÉ HABÍA AQUÍ Y POR QUÉ SE FUE
   Cuatro hallazgos escritos a mano —«2 viñetas de la página 1 no llevan ninguna
   cifra», «una viñeta ocupa 4 líneas», «el título no coincide con el último
   aviso que adaptaste», «Proyectos queda huérfana al final de la página 2»—
   presentados como el diagnóstico del CV del usuario. Nadie contó esas viñetas,
   nadie midió esas líneas y nadie sabía qué aviso adaptó. Encima el [id] de la
   ruta se ignoraba: daba igual qué variante abrieras, salían los mismos cuatro.
   Un hallazgo falso sobre el CV de alguien es peor que ningún hallazgo: le hace
   cambiar algo que estaba bien.

   TAMBIÉN SE FUE EL BLOQUE «LO GARANTIZADO POR CONSTRUCCIÓN», Y ESTO IMPORTA
   Prometía que el motor garantiza «una sola columna», «cero iconos ni fotos»,
   «cero tablas, headers o footers». Hoy es FALSO: src/lib/cv/catalog.ts define
   plantillas con `layout: { columns: 2, photo: true, sidebar: true }`, y la foto
   es además opt-in por variante (PresentationPatch en src/lib/cv/resume.ts). Era
   una garantía citada con fuentes (Greenhouse, Workday, Lever) que el propio
   producto había dejado de cumplir — exactamente la clase de afirmación que este
   producto no se permite. Se retira hasta que se pueda decir POR PLANTILLA cuál
   de esas garantías se cumple, que es la forma verdadera de decirlo.

   POR QUÉ (a) —ESTADO VACÍO— Y NO (b) —RUTA INACCESIBLE
   Igual que en Tailor: hay algo real que ofrecer a un clic (el master trae
   filtros de calidad de verdad, y el editor enseña cada viñeta con su origen),
   así que la pantalla se queda como derivación honesta en vez de morir en un 404.

   EL MOTOR YA EXISTE, Y NO ESTÁ CABLEADO
   src/lib/health.ts exporta checkHealth(): ocho reglas puras, cada una con su
   fuente y su [criterio], probadas en tests/health.test.ts. No lo usa NADIE.
   Cablearlo pide dos piezas que no están: el nº de páginas real (solo lo sabe el
   render del PDF) y la evidencia de cada skill (hay que cruzar viñetas, repos y
   fuentes). Hacerlo a medias habría vuelto a producir hallazgos que no se
   sostienen, que es el bug que esta pantalla acaba de dejar de tener.

   ESTA PANTALLA NO LEE NINGÚN DATO DEL USUARIO, a propósito: lo que no se lee no
   se puede pintar mal. La única entrada es el [id] de la ruta, para saber a qué
   variante volver.
   ============================================================================ */

/** Salida de último recurso cuando la ruta no trae un [id] utilizable. */
const FALLBACK = "/app/variantes";

/**
 * Ruta de la variante abierta a partir del [id] crudo del route, o null si no
 * hay un id con el que construir una ruta honesta.
 *
 * ⚠ COPIA LITERAL de la de TailorScreen. Un módulo compartido sería lo natural,
 * pero las dos pantallas viven en fronteras de trabajo distintas y un fichero
 * nuevo colisiona; tests/costuras.test.ts pasa la MISMA batería a las dos copias
 * (importándolas por separado), así que divergir en silencio no es posible.
 */
export function rutaDeLaVariante(routeId: unknown): string | null {
  if (typeof routeId !== "string") return null;
  const id = routeId.trim();
  if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) return null;
  return `/app/variantes/${encodeURIComponent(id)}`;
}

export function SaludScreen() {
  const t = useT();
  /* La salud SIEMPRE es la salud DE una variante: su salida natural es esa
     variante, tomada del [id] real de la ruta (antes se usaba un id de maqueta
     fijo, "backend-fintech", que mandaba a la variante de otro). */
  const variante = rutaDeLaVariante(useParams()?.id);
  const volverA = variante ?? FALLBACK;

  return (
    <div className="c-page">
      {/* Leer una pantalla que confiesa un hueco es trabajo denso: el humo baja. */}
      <AuroraTune strength={AURORA_TRABAJO} />
      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/app">
            Corpus
          </Link>
          <nav className="hd-nav">
            <Link href="/app">{t("nav.panel")}</Link>
            <Link href="/app/master">{t("nav.master")}</Link>
            <Link href="/app/variantes" aria-current="page">
              {t("nav.variantes")}
            </Link>
            <Link href="/app/fuentes">{t("nav.fuentes")}</Link>
          </nav>
          <div className="hd-right">
            <nav className="hd-nav" style={{ display: "flex" }}>
              <Link href="/app/ajustes">{t("nav.ajustes")}</Link>
            </nav>
            <div className="hd-lang">
              <span data-on>ES</span>
              <span>EN</span>
            </div>
            {/* Aquí iba <div className="hd-av">DG</div>: las iniciales de la
                persona inventada. Ocultas por UserMenu.css, pero afirmaban una
                identidad que no es la del usuario. El avatar real lo pinta
                UserMenu, montado por el layout de /app. */}
          </div>
        </div>
      </header>

      <div className="sl-bar" data-screen-label="salud-toolbar">
        <div className="c-container">
          {/* La salida: a la variante de la que cuelga esta salud, o a donde dijo
              el ?from. Sin `fallbackLabel`: el nombre de la variante no se sabe
              sin leerla, y «Backend — Fintech» era el de la persona inventada. */}
          <Breadcrumb fallback={volverA} />
          <span
            style={{ width: "1px", height: "16px", background: "var(--border-strong)" }}
            aria-hidden="true"
          />
          <span
            style={{
              font: "500 var(--fs-micro)/1 var(--font-mono)",
              letterSpacing: ".14em",
              color: "var(--text-muted)",
            }}
          >
            {t("salud.sectionLabel")}
          </span>
          {/* Donde antes iba «4 hallazgos · 0 bloqueantes» —un conteo derivado de
              datos inventados— ahora va la verdad: no hay análisis todavía. */}
          <span
            id="slN"
            style={{
              marginLeft: "auto",
              font: "400 var(--fs-micro)/1 var(--font-mono)",
              color: "var(--text-subtle)",
            }}
          >
            {t("salud.barPending")}
          </span>
        </div>
      </div>

      <main className="sl-main c-wall" data-screen-label="salud">
        <div className="c-container sl-col">
          <span className="t-overline">{t("salud.voidOverline")}</span>
          <h2 style={{ marginTop: "14px" }}>{t("salud.voidTitle")}</h2>
          <p className="sl-lead">
            {t("salud.voidBody.pre")}
            <b>{t("salud.tag.source")}</b>
            {t("salud.voidBody.mid")}
            <b>{t("salud.tag.criterion")}</b>
            {t("salud.voidBody.post")}
          </p>
          {/* La línea que justifica el hueco. No es una disculpa: es la regla. */}
          <p className="sl-void-ethic">{t("salud.voidEthic")}</p>

          <hr className="c-divider" style={{ marginTop: "30px" }} />

          <span className="t-overline" style={{ display: "block", marginTop: "26px" }}>
            {t("salud.voidNextOverline")}
          </span>

          <div className="sl-outs">
            <div className="c-card sl-out">
              <Link className="c-btn c-btn--patina" href="/app/master">
                {t("salud.voidMasterCta")}
              </Link>
              {/* Nombra filtros que EXISTEN (master.filter.noEvidence / noDates /
                  dups en MasterScreen). Si alguien los quita, este texto miente:
                  tests/costuras.test.ts vigila que las tres claves sigan vivas. */}
              <span className="note">{t("salud.voidMasterNote")}</span>
            </div>

            <div className="c-card sl-out">
              <Link className="c-btn" href={volverA}>
                {t("salud.voidVariantCta")}
              </Link>
              <span className="note">{t("salud.voidVariantNote")}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
