// Sin "use client": solo lo importa la pantalla del editor (ya cliente).
import { Kbd } from "./Desplegable";
import { TECLA } from "./atajos";
import { IconoEd } from "./iconos";
import { PV_ANCHO_DEF, PV_ANCHO_MIN, alternarCompleto, limitarAncho } from "./vista-previa";
import type { Editor } from "./useEditorVariante";

/* ============================================================================
   VISTA PREVIA — el preview ES el PDF: los bytes de POST /api/cv embebidos en
   un <iframe>, y «Cómo lo lee el ATS» es el texto que unpdf sacó de ESE buffer.
   Dos pestañas que se reemplazan (nunca se superponen), ancho ajustable con el
   divisor (ratón o flechas), ocultar (P) y pantalla completa (F / Esc). El
   estado de páginas aquí es neutro: los avisos viven en el chip de la barra.
   ============================================================================ */

export function Divisor({ ed }: { ed: Editor }) {
  if (ed.pvModo !== "lado") return null;
  return (
    <div
      className="ed-split"
      role="separator"
      aria-orientation="vertical"
      aria-label={ed.t("editor.edPvAncho")}
      aria-controls="edPv"
      aria-valuenow={ed.pvAncho}
      aria-valuemin={PV_ANCHO_MIN}
      tabIndex={0}
      onPointerDown={ed.arrastrarDivisor}
      onKeyDown={ed.teclaDivisor}
      onDoubleClick={() => ed.pvFijar(limitarAncho(PV_ANCHO_DEF, ed.disponiblePv()), true)}
    />
  );
}

export function VistaPrevia({ ed }: { ed: Editor }) {
  const { t, mode, pvModo, pageCount, pvBusy, pvError, pdfUrl } = ed;
  const completa = pvModo === "completo";
  const paginas = pvBusy ? (
    <span className="pv-busy">{t("editor.pvUpdating")}</span>
  ) : pvError ? (
    t("editor.pvFailedShort")
  ) : pageCount === 0 ? (
    t("editor.pvNoPages")
  ) : (
    t("editor.pvPaginasN").replace("{n}", String(pageCount))
  );

  return (
    <section className="ed-col pv-col" id="edPv" data-screen-label="editor-preview" aria-label={t("editor.edPv")}>
      <div className="pv-tools">
        <div className="pv-seg" role="tablist" aria-label={t("editor.segAria")}>
          <button
            type="button"
            role="tab"
            id="segDoc"
            aria-selected={mode === "doc"}
            aria-pressed={mode === "doc"}
            aria-controls="pvDoc"
            onClick={() => ed.setMode("doc")}
          >
            {t("editor.viewDoc")}
          </button>
          <button
            type="button"
            role="tab"
            id="segRaw"
            aria-selected={mode === "raw"}
            aria-pressed={mode === "raw"}
            aria-controls="pvRaw"
            onClick={() => ed.setMode("raw")}
          >
            {t("editor.viewRaw")}
          </button>
        </div>
        {/* Páginas REALES (numPages del PDF que se ve), sin juicio: el juicio va en la barra. */}
        <span className="pv-pages" id="pvPages">
          {paginas}
        </span>
        <span className="pv-acts">
          <button
            type="button"
            className="ed-tog ed-tog--ico"
            id="pvCompleta"
            aria-pressed={completa}
            aria-label={completa ? t("editor.edPvSalir") : t("editor.edPvCompleta")}
            title={`${completa ? t("editor.edPvSalir") : t("editor.edPvCompleta")} (${TECLA.completa})`}
            onClick={() => ed.pvCambiar(alternarCompleto(pvModo))}
          >
            <IconoEd nombre={completa ? "salir" : "completa"} /> <Kbd>{TECLA.completa}</Kbd>
          </button>
          {!completa && (
            <button
              type="button"
              className="ed-tog ed-tog--ico"
              id="pvOcultar"
              aria-label={t("editor.edPvOcultar")}
              title={`${t("editor.edPvOcultar")} (${TECLA.preview})`}
              onClick={() => ed.pvCambiar("oculto")}
            >
              <IconoEd nombre="ocultar" tamano={13} />
            </button>
          )}
        </span>
      </div>
      <div className="pv-scroll" ref={ed.pvScrollRef}>
        <div className="pv-doc" id="pvDoc" role="tabpanel" aria-labelledby="segDoc" hidden={mode !== "doc"}>
          {pvError ? (
            <div className="pv-fail" role="alert">
              <span className="t-overline">{t("editor.pvErrTitle")}</span>
              <p className="why">{pvError}</p>
              <button type="button" className="c-btn c-btn--quiet" onClick={() => ed.setPvRetry((n) => n + 1)}>
                {t("editor.pvRetry")}
              </button>
            </div>
          ) : pdfUrl ? (
            // EL PDF REAL: los bytes que devuelve /api/cv, los mismos que baja Descargar.
            <iframe className="pv-frame" src={pdfUrl} title={t("editor.pvFrameTitle")} />
          ) : (
            <div className="pv-fail" aria-live="polite">
              <span className="t-overline">{t("editor.pvBuilding")}</span>
            </div>
          )}
        </div>
        {/* Rayos-X: el texto que unpdf extrajo de ESE PDF. Si el parser no lo lee, aquí no aparece. */}
        <div className="pv-raw" id="pvRaw" role="tabpanel" aria-labelledby="segRaw" hidden={mode !== "raw"}>
          <span className="cap">{t("editor.xrayLegend")}</span>
          {pvError ? pvError : ed.xrayText}
        </div>
      </div>
      <div className="pv-foot">{t("editor.previewFoot")}</div>
    </section>
  );
}
