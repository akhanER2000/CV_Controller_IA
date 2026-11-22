// Sin "use client": solo lo importa el editor (que ya es cliente), y así sus
// props pueden ser funciones sin el aviso de props serializables.
import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { AutofitInfo, EstadoDoc, Fit, FitFalta, FitTipoFalta, PropEnLinea } from "@/components/flujo-cv";
import "./FlujoCv.css";

/* ============================================================================
   FLUJO DEL CV — la guía de la columna que compone y las marcas que se pintan
   SOBRE cada item. Reemplaza al panel «Ajustar páginas» de cuatro listas
   (apartado en _to_delete/flujo-cv/). Ver prompts/lotes-fable5/_diseno/flujo-cv.md.

   Estos componentes no deciden nada: reciben la propuesta ya repartida
   (flujo-cv.ts) y devuelven el clic al editor, que ejecuta con los MISMOS
   manejadores de siempre (removeItem · reorder · POST /ajustar acortar).
   ============================================================================ */

/** Etiqueta de cada hueco. El texto lo pone i18n; aquí solo el mapa. */
export const HUECO_KEY: Record<FitTipoFalta, string> = {
  "sin-cifra": "editor.fitGapNumber",
  "sin-fecha": "editor.fitGapDate",
  "sin-respaldo": "editor.fitGapEvidence",
};

// ── La guía ──────────────────────────────────────────────────────────────────
export function GuiaAjuste(props: {
  estado: EstadoDoc;
  paginas: number;
  objetivo: number;
  autofit: AutofitInfo | null;
  paginasTxt: (n: number) => string;
  huecos: number;
  pendientes: number;
  fit: Fit | null;
  busy: boolean;
  err: string;
  notasIA: string | null;
  onProponer: () => void;
  onSiguiente: () => void;
}) {
  const t = useT();
  const [abierto, setAbierto] = useState(false);
  const { estado, paginas, objetivo, autofit, paginasTxt, huecos, pendientes, fit, busy, err, notasIA } = props;
  const encogido = autofit && autofit.bodySize < autofit.base;
  const coma = (n: number) => String(n).replace(".", ",");

  const doc =
    estado === "midiendo"
      ? t("editor.fluMidiendo")
      : estado === "error"
        ? t("editor.fluError")
        : estado === "vacio"
          ? t("editor.fluVacio")
          : estado === "no-cabe"
            ? t("editor.fluNoCabe").replace("{p}", paginasTxt(objetivo))
            : estado === "excede"
              ? t("editor.fluExcede").replace("{n}", String(paginas)).replace("{o}", String(objetivo))
              : t("editor.fluCabe").replace("{p}", paginasTxt(paginas));

  const descartados = fit ? fit.descartados.filter((d) => d.tipo === "acortar") : [];
  const urgente = estado === "no-cabe" || estado === "excede";

  return (
    <section className="flu-guia" id="edGuia" aria-label={t("editor.fluAria")}>
      <div className="fl-fila">
        <span className="flu-doc" data-estado={estado} role="status">
          {doc}
          {estado === "cabe" && encogido && (
            <span className="sub"> · {t("editor.autofitSize").replace("{s}", coma(autofit!.bodySize))}</span>
          )}
        </span>
        <span className="flu-cuenta">
          {huecos > 0 && (
            <>
              <b>{t(huecos === 1 ? "editor.fluHuecos1" : "editor.fluHuecosN").replace("{n}", String(huecos))}</b>
              {fit ? " · " : ""}
            </>
          )}
          {fit &&
            (pendientes > 0 ? (
              <b>{t(pendientes === 1 ? "editor.fluPend1" : "editor.fluPendN").replace("{n}", String(pendientes))}</b>
            ) : (
              t("editor.fluNadaPend")
            ))}
        </span>
        <span className="flu-acts">
          {pendientes > 0 && (
            <button type="button" className="c-btn" onClick={props.onSiguiente}>
              {t("editor.fluSiguiente")}
            </button>
          )}
          <button
            type="button"
            className={"c-btn " + (urgente && !fit ? "c-btn--patina" : "c-btn--quiet")}
            disabled={busy}
            onClick={props.onProponer}
          >
            {busy ? t("editor.fluProponiendo") : fit ? t("editor.fluReproponer") : t("editor.fluProponer")}
          </button>
          <button
            type="button"
            className="c-btn c-btn--quiet flu-det-btn"
            aria-expanded={abierto}
            aria-controls="edGuiaDet"
            onClick={() => setAbierto((v) => !v)}
          >
            {t("editor.fluDetalle")} {abierto ? "▴" : "▾"}
          </button>
        </span>
      </div>
      {err && (
        <p className="flu-err" role="status">
          {err}
        </p>
      )}
      {abierto && (
        <div className="flu-det" id="edGuiaDet">
          {/* LAS MEDIDAS. Todo sale del PDF real o del autofit de ese PDF. */}
          {paginas > 0 && (
            <p>
              {t("editor.fluDetPaginas").replace("{p}", paginasTxt(paginas)).replace("{o}", paginasTxt(objetivo))}
            </p>
          )}
          {autofit && (
            <p>
              {encogido
                ? t("editor.fluDetCuerpo").replace("{s}", coma(autofit.bodySize)).replace("{b}", coma(autofit.base))
                : t("editor.fluDetCuerpoBase").replace("{b}", coma(autofit.base))}
            </p>
          )}
          {fit ? (
            <p>
              {fit.sobran > 0
                ? t("editor.fluDetSobran").replace("{n}", String(fit.sobran))
                : t("editor.fluDetLibres").replace("{n}", String(-fit.sobran))}
            </p>
          ) : (
            <p>{t("editor.fluDetSinAnalisis")}</p>
          )}
          <p>{t("editor.fitManual")}</p>
          {descartados.length > 0 && (
            <>
              <p>{t("editor.fitDropped").replace("{n}", String(descartados.length))}</p>
              <p>{t("editor.fitDroppedHint")}</p>
              <ul>
                {descartados.map((d, i) => (
                  <li key={`${d.id}:${i}`}>{d.razon}</li>
                ))}
              </ul>
            </>
          )}
          {fit?.notas && (
            <>
              <span className="t-overline">{t("editor.fitNotes")}</span>
              <p className="flu-notas">{fit.notas}</p>
            </>
          )}
          {notasIA && (
            <>
              <span className="t-overline">{t("editor.fluNotasIA")}</span>
              <p className="flu-notas">{notasIA}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ── «Qué falta», sobre el item ──────────────────────────────────────────────
/** Las etiquetas de hueco de UN item (viñeta o rol). El detalle va en el title. */
export function Huecos({ faltas }: { faltas: readonly FitFalta[] | undefined }) {
  const t = useT();
  if (!faltas?.length) return null;
  return (
    <span className="flu-huecos">
      {faltas.map((f) => (
        <span className="flu-hueco" key={f.tipo} title={f.detalle}>
          {t(HUECO_KEY[f.tipo])}
        </span>
      ))}
    </span>
  );
}

/** El hueco de una aptitud NOMBRA lo que no está respaldado: se juzga el hecho. */
export function HuecosAptitud({ faltas, grupo }: { faltas: readonly FitFalta[]; grupo: (id: string) => string }) {
  const t = useT();
  const sin = faltas.filter((f) => f.tipo === "sin-respaldo");
  if (!sin.length) return null;
  return (
    <>
      {sin.map((f) => (
        <p className="flu-hueco-linea" key={f.id}>
          <span className="flu-hueco">{t("editor.fitGapEvidence")}</span>
          <span>
            {grupo(f.id)}: {f.detalle}
          </span>
        </p>
      ))}
    </>
  );
}

// ── Una propuesta, bajo su item ─────────────────────────────────────────────
export function PropuestaEnLinea({
  prop,
  revertida,
  onAceptar,
  onRechazar,
}: {
  prop: PropEnLinea;
  /** el usuario aceptó y luego revirtió este acortado */
  revertida: boolean;
  onAceptar: () => void;
  onRechazar: () => void;
}) {
  const t = useT();
  const { tipo, p } = prop;
  return (
    <div className="flu-prop" data-prop={tipo} data-pendiente="" data-for={p.id}>
      {tipo === "q" && (
        <>
          <span className="lbl">{t("editor.fluPropQuitar")}</span>
          {prop.p.motivo && <span className="why">{prop.p.motivo}</span>}
        </>
      )}
      {tipo === "r" && (
        <span className="lbl">
          {t(prop.p.hasta < prop.p.desde ? "editor.fitMoveUp" : "editor.fitMoveDown")
            .replace("{a}", String(prop.p.desde + 1))
            .replace("{b}", String(prop.p.hasta + 1))}
        </span>
      )}
      {tipo === "a" && (
        <>
          <span className="lbl">{t("editor.fluPropAcortar").replace("{n}", String(prop.p.ahorro))}</span>
          <span className="nuevo">{prop.p.propuesto}</span>
          {prop.p.motivo && <span className="why">{prop.p.motivo}</span>}
        </>
      )}
      <span className="fl-acts">
        {revertida && <span className="fl-nota">{t("editor.fitReverted")}</span>}
        <button type="button" className="c-btn c-btn--quiet" onClick={onRechazar}>
          {tipo === "q" ? t("editor.fluMantener") : t("editor.fluNo")}
        </button>
        <button type="button" className="c-btn" onClick={onAceptar}>
          {tipo === "q" ? t("editor.fluQuitar") : tipo === "r" ? t("editor.fluMover") : t("editor.fluUsar")}
        </button>
      </span>
    </div>
  );
}

// ── Lo verificado ───────────────────────────────────────────────────────────
/** Sello de oro: este texto pasó el candado en el servidor. Deshacer solo si se aceptó en esta sesión. */
export function SelloVerificado({ onDeshacer }: { onDeshacer?: () => void }) {
  const t = useT();
  return (
    <span className="flu-sello" title={t("editor.fluSelloTitle")}>
      ✓ {t("editor.fluSello")}
      {onDeshacer && (
        <button type="button" onClick={onDeshacer}>
          {t("editor.fluDeshacer")}
        </button>
      )}
    </span>
  );
}
