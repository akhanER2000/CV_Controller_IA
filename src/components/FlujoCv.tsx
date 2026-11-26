// Sin "use client": solo lo importa el editor (que ya es cliente), y así sus
// props pueden ser funciones sin el aviso de props serializables.
import { useState, type ReactNode } from "react";
import { StatusChip, type EstadoChip } from "@/components/ui/StatusChip";
import { useT } from "@/lib/i18n";
import type { AutofitInfo, EstadoDoc, Fit, FitFalta, FitTipoFalta, PropEnLinea } from "@/components/flujo-cv";
import { Desplegable, Kbd } from "@/components/editor/Desplegable";
import { TECLA } from "@/components/editor/atajos";
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
/**
 * La guía COMPACTA de la barra superior: UN indicador de estado (que abre el
 * detalle con las medidas), «Ajustar páginas» (pedir la propuesta: una llamada al
 * modelo, siempre a mano) y, si hay propuestas abiertas, cuántas quedan y
 * «Siguiente». Las decisiones no viven aquí: viven bajo cada item.
 */
export function GuiaAjuste(props: {
  estado: EstadoDoc;
  paginas: number;
  objetivo: number;
  autofit: AutofitInfo | null;
  paginasTxt: (n: number) => string;
  huecos: number;
  huecosTipo: Readonly<Record<FitTipoFalta, number>>;
  pendientes: number;
  fit: Fit | null;
  busy: boolean;
  err: string;
  notasIA: string | null;
  /** avisos de páginas que antes iban en rojo sobre la vista previa: viven en el detalle */
  avisos?: readonly string[];
  onProponer: () => void;
  onSiguiente: () => void;
  /** lo que va en el hueco «acciones de IA» (Afinar con IA) */
  ia?: ReactNode;
}) {
  const t = useT();
  const [abierto, setAbierto] = useState(false);
  const { estado, paginas, objetivo, autofit, paginasTxt, huecos, huecosTipo, pendientes, fit, busy, err, notasIA } = props;
  const encogido = autofit && autofit.bodySize < autofit.base;
  const coma = (n: number) => String(n).replace(".", ",");

  // La frase LARGA (va en el detalle): la de siempre.
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
  // La CORTA (el indicador): cabe / no cabe, y los huecos.
  const corto =
    estado === "midiendo"
      ? t("editor.edMidiendo")
      : estado === "error"
        ? t("editor.edError")
        : estado === "vacio"
          ? t("editor.edVacio")
          : estado === "cabe"
            ? t("editor.edCabe").replace("{p}", paginasTxt(paginas))
            : estado === "excede"
              ? t("editor.fluExcede").replace("{n}", String(paginas)).replace("{o}", String(objetivo))
              : t("editor.edNoCabe").replace("{p}", paginasTxt(objetivo));
  const huecosTxt =
    huecos > 0 ? t(huecos === 1 ? "editor.fluHuecos1" : "editor.fluHuecosN").replace("{n}", String(huecos)) : "";

  const descartados = fit ? fit.descartados.filter((d) => d.tipo === "acortar") : [];
  const urgente = estado === "no-cabe" || estado === "excede";
  const avisos = props.avisos ?? [];
  // UN chip de estado (DA-V5): el color nunca va solo, el texto dice lo mismo.
  const chip: EstadoChip =
    estado === "cabe" ? "ok" : estado === "error" ? "error" : urgente || avisos.length ? "aviso" : "neutro";

  return (
    <div className="flu-guia" id="edGuia" role="group" aria-label={t("editor.fluAria")}>
      <Desplegable
        abierto={abierto}
        onCambiar={setAbierto}
        botonId="edEstado"
        botonClase="flu-estado"
        botonEtiqueta={t("editor.edEstadoAria").replace("{e}", huecosTxt ? `${corto} · ${huecosTxt}` : corto)}
        ancho={380}
        boton={
          <>
            <span className="flu-doc" data-estado={estado} role="status">
              <StatusChip estado={chip}>{corto}</StatusChip>
            </span>
            {huecosTxt && <span className="flu-cuenta">· {huecosTxt}</span>}
            <span className="chev" aria-hidden="true">
              ▾
            </span>
          </>
        }
      >
        <div className="flu-det" id="edGuiaDet">
          <p className="flu-det-t" data-estado={estado}>
            {doc}
            {estado === "cabe" && encogido && <> · {t("editor.autofitSize").replace("{s}", coma(autofit!.bodySize))}</>}
          </p>
          {avisos.map((a) => (
            <p className="flu-det-aviso" key={a}>
              {a}
            </p>
          ))}
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
          {/* Los huecos, por tipo: calcularFaltas, la misma función del servidor. */}
          {huecos > 0 && (
            <p className="flu-det-huecos">
              {(["sin-cifra", "sin-fecha", "sin-respaldo"] as const)
                .filter((k) => huecosTipo[k] > 0)
                .map((k) => `${huecosTipo[k]} · ${t(HUECO_KEY[k])}`)
                .join("   ")}
            </p>
          )}
          {fit && (
            <p>
              {pendientes > 0
                ? t(pendientes === 1 ? "editor.fluPend1" : "editor.fluPendN").replace("{n}", String(pendientes))
                : t("editor.fluNadaPend")}
            </p>
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
      </Desplegable>
      <button
        type="button"
        className={"c-btn flu-ajustar " + (urgente && !fit ? "c-btn--patina" : "c-btn--quiet")}
        disabled={busy}
        onClick={props.onProponer}
      >
        {busy ? t("editor.edAjustando") : t("editor.fitOpen")}
      </button>
      {/* HUECO RESERVADO para las acciones de IA (lo llena el lote siguiente).
          Sin lógica: vacío no ocupa sitio (:empty en FlujoCv.css). */}
      <span className="flu-ia" id="edAccionesIA" data-ranura="acciones-ia" aria-label={t("editor.edAccionesIA")}>
        {props.ia}
      </span>
      {fit && (
        <span className="flu-pend">
          {pendientes > 0 ? (
            <>
              <b>{t(pendientes === 1 ? "editor.fluPend1" : "editor.fluPendN").replace("{n}", String(pendientes))}</b>
              <button type="button" className="c-btn flu-sig" onClick={props.onSiguiente}>
                {t("editor.edSiguiente")} <Kbd>{TECLA.siguiente}</Kbd>
              </button>
            </>
          ) : (
            t("editor.fluNadaPend")
          )}
        </span>
      )}
      {err && (
        <span className="flu-err" role="status">
          {err}
        </span>
      )}
    </div>
  );
}

// ── «Sin respaldo», contado por sección ─────────────────────────────────────
/**
 * Los avisos «sin respaldo» de una sección, en UN contador que se despliega (no
 * un chip por grupo). Plegado, dice cuántos; desplegado, NOMBRA lo que no está
 * respaldado, grupo a grupo, para que se juzgue el hecho.
 */
export function HuecosSeccion({ faltas, grupo }: { faltas: readonly FitFalta[]; grupo: (id: string) => string }) {
  const t = useT();
  const [abierto, setAbierto] = useState(false);
  const sin = faltas.filter((f) => f.tipo === "sin-respaldo");
  if (!sin.length) return null;
  const id = `flu-sr-${sin[0]!.id}`;
  return (
    <div className="flu-sr">
      <button
        type="button"
        className="flu-sr-b"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="chev" aria-hidden="true">
          {abierto ? "▾" : "▸"}
        </span>
        <span className="flu-hueco-n">{sin.length}</span>
        <span>
          {t(sin.length === 1 ? "editor.edSinRespaldo1" : "editor.edSinRespaldoN").replace("{n}", String(sin.length))}
        </span>
      </button>
      {abierto && (
        <div className="flu-sr-l" id={id}>
          <p className="hint">{t("editor.edSinRespaldoHint")}</p>
          <ul>
            {sin.map((f) => (
              <li key={f.id}>
                <b>{grupo(f.id)}:</b> {f.detalle}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── «Qué falta», sobre el item ──────────────────────────────────────────────
/** Las etiquetas de hueco de UN item (viñeta o rol). El detalle va en el title. */
export function Huecos({ faltas }: { faltas: readonly FitFalta[] | undefined }) {
  const t = useT();
  // «sin respaldo» no se pinta item a item: va contado en su sección (HuecosSeccion).
  const propias = faltas?.filter((f) => f.tipo !== "sin-respaldo") ?? [];
  if (!propias.length) return null;
  return (
    <span className="flu-huecos">
      {propias.map((f) => (
        <span className="flu-hueco" key={f.tipo} title={f.detalle}>
          {t(HUECO_KEY[f.tipo])}
        </span>
      ))}
    </span>
  );
}

// ── Una propuesta, bajo su item ─────────────────────────────────────────────
export function PropuestaEnLinea({
  prop,
  revertida,
  actual = false,
  onAceptar,
  onRechazar,
}: {
  prop: PropEnLinea;
  /** la decisión marcada (la trajo «Siguiente» o tiene el foco): la que acepta A */
  actual?: boolean;
  /** el usuario aceptó y luego revirtió este acortado */
  revertida: boolean;
  onAceptar: () => void;
  onRechazar: () => void;
}) {
  const t = useT();
  const { tipo, p } = prop;
  return (
    <div
      className="flu-prop"
      data-prop={tipo}
      data-pendiente=""
      data-for={p.id}
      data-clave={prop.clave}
      data-actual={actual ? "" : undefined}
    >
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
          {actual && <Kbd>{TECLA.aceptar}</Kbd>}
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
