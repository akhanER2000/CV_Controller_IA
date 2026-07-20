"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useBoot } from "@/lib/corpus/runtime";
import { AuroraTune, AURORA_TRABAJO } from "@/components/Aurora";
import { Breadcrumb } from "@/components/Breadcrumb";
import "./tailor.css";

/* ============================================================================
   Adaptar a un aviso — ESTADO VACÍO HONESTO.

   QUÉ HABÍA AQUÍ Y POR QUÉ SE FUE
   Esta pantalla era una MAQUETA presentada como producto: el aviso (JD), los
   tres grupos (HAVE/ADD/GAP) y las tres reformulaciones (PROPS) eran constantes
   escritas a mano sobre una persona inventada —«Altiplano Pagos», «~40.000 tx
   diarias», «Rayén»— y el [id] de la ruta se ignoraba. Un usuario real llegaba
   desde la barra de SU editor y veía el análisis de otro, con cifras que nadie
   midió, rotulado como suyo. Eso viola de frente las dos reglas que sostienen el
   producto: la IA nunca inventa, y ningún número sin fuente.

   Peor aún desde que existe «Ajustar a dos páginas»: en la barra del editor
   convivían dos botones adyacentes, uno cableado al PDF real y otro a una
   ficción. Un usuario no tiene forma de distinguirlos, así que la ficción
   contamina la confianza en el que sí funciona.

   POR QUÉ (a) —ESTADO VACÍO— Y NO (b) —QUITAR EL ENLACE
   Quien pulsa «Adaptar a un aviso» quiere algo real, y HAY algo real que
   ofrecerle a un clic: el ajuste a dos páginas, que mide el PDF de verdad. Dejar
   la ruta muerta lo mandaría a un 404 y perdería esa derivación. Así que la
   pantalla se queda, dice con claridad que el análisis todavía no está
   construido, promete en futuro (no en pasado, no como si ya hubiera analizado
   nada) y enlaza a lo que sí funciona.

   POR QUÉ NO SE CONSERVA NI COMO «EJEMPLO»
   Se valoró dejar la maqueta rotulada como demostración. Se descartó: los
   botones («añadir a la variante», «aceptar») no harían nada, y un ejemplo
   interactivo que no hace nada es otra mentira, solo que más barata de defender.
   Cuando el análisis exista, el diseño de los tres grupos vuelve entero — vive
   en docs/spec/pantallas/tailor.md, no se ha perdido.

   ESTA PANTALLA NO LEE NINGÚN DATO DEL USUARIO. Es deliberado: lo que no se lee
   no se puede pintar mal. La única entrada es el [id] de la ruta, y solo para
   saber a qué variante volver.
   ============================================================================ */

/** Salida de último recurso cuando la ruta no trae un [id] utilizable. */
const FALLBACK = "/app/variantes";

/**
 * Ruta de la variante abierta a partir del [id] crudo del route, o null si no
 * hay un id con el que construir una ruta honesta.
 *
 * Rechaza lo que no sea un segmento simple: undefined (ruta sin id), string
 * vacío o en blanco, el array de una ruta catch-all, y cualquier cosa con "/"
 * o ".." que convertiría un id en una navegación a otro sitio. Nunca inventa un
 * id de maqueta: antes de adivinar una variante, se vuelve al listado.
 *
 * ⚠ Está DUPLICADA a propósito en SaludScreen (mismas 6 líneas). Un módulo
 * compartido sería lo natural, pero las dos pantallas viven en fronteras de
 * trabajo distintas; tests/costuras.test.ts pasa la MISMA batería a las dos
 * copias, así que divergir en silencio no es posible.
 */
export function rutaDeLaVariante(routeId: unknown): string | null {
  if (typeof routeId !== "string") return null;
  const id = routeId.trim();
  if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) return null;
  return `/app/variantes/${encodeURIComponent(id)}`;
}

export function TailorScreen() {
  const bootRef = useBoot<HTMLDivElement>();
  const t = useT();
  // La variante real de la ruta; si no hay [id] usable, al listado.
  const variante = rutaDeLaVariante(useParams()?.id);
  const volverA = variante ?? FALLBACK;

  return (
    <div className="c-page" ref={bootRef}>
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
                persona inventada, pintadas como si fueran las del usuario. El
                UserMenu real (montado por el layout) oculta .hd-av por CSS, así
                que era markup muerto — pero markup muerto que afirmaba una
                identidad. Fuera. El avatar de verdad lo pinta UserMenu. */}
          </div>
        </div>
      </header>

      <div className="tl-bar" data-screen-label="tailor-toolbar">
        <div className="c-container">
          {/* La salida: a la variante que ibas a adaptar (o al ?from que te trajo).
              Sin `fallbackLabel`: el nombre de la variante no se sabe sin leerla,
              y «Backend — Fintech» era el de la persona inventada. El Breadcrumb
              rotula por ruta («La variante»), que es cierto sin leer nada. */}
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
            {t("common.tailor").toUpperCase()}
          </span>
          <span
            style={{
              marginLeft: "auto",
              font: "400 var(--fs-micro)/1 var(--font-mono)",
              color: "var(--text-subtle)",
            }}
          >
            {t("tailor.toolbarNote")}
          </span>
        </div>
      </div>

      <main className="tl-main c-wall" data-screen-label="tailor">
        <div className="c-container tl-void">
          <span className="t-overline">{t("tailor.voidOverline")}</span>
          <h2 style={{ marginTop: "14px" }}>{t("tailor.voidTitle")}</h2>
          <p className="tl-void-body">{t("tailor.voidBody")}</p>
          {/* La línea que justifica el hueco. No es una disculpa: es la regla. */}
          <p className="tl-void-ethic">{t("tailor.voidEthic")}</p>

          <hr className="c-divider" style={{ marginTop: "30px" }} />

          <span className="t-overline" style={{ display: "block", marginTop: "26px" }}>
            {t("tailor.voidNextOverline")}
          </span>

          <div className="tl-outs">
            {/* Lo que SÍ está cableado a datos reales: el ajuste a dos páginas
                mide el PDF de esta variante. Vive dentro del editor (al lado del
                documento que lo motiva), así que el enlace lleva allí y el rótulo
                usa la MISMA clave que el botón real —si alguien lo renombra, esta
                indicación se renombra con él y no queda apuntando a un fantasma. */}
            <div className="c-card tl-out">
              <Link className="c-btn c-btn--patina" href={volverA}>
                {t("editor.fitOpen")} →
              </Link>
              <span className="note">{t("tailor.voidFitNote")}</span>
            </div>

            <div className="c-card tl-out">
              <Link className="c-btn" href="/app/master">
                {t("tailor.voidMasterCta")}
              </Link>
              <span className="note">{t("tailor.voidMasterNote")}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
