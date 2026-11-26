// Sin "use client": solo lo importa la barra del editor (ya cliente).
import { useEffect, useRef, useState } from "react";
import type { AplicadoAfinar } from "@/lib/cv/afinar";
import { AnchoFijo } from "@/components/ui/Progreso";
import { Desplegable } from "./Desplegable";
import type { AlcanceUI, useAfinar } from "./useAfinar";
import type { Editor } from "./useEditorVariante";
import "./afinar.css";

/* ============================================================================
   «AFINAR CON IA» en la barra, junto a «Ajustar páginas» (el hueco reservado).
   En la barra hay UN botón de ancho fijo y nada más: la barra no se mueve
   (ni de ancho ni de orden) al afinar. Todo lo demás vive en el panel anclado
   bajo el botón, con su propio espacio:
     · la confirmación de «sin respaldo» (añade N, oculta M, puede sumar
       páginas) antes de aplicar — DA-M5;
     · el resumen (afinados · resueltos · descartados), su detalle y «Revertir»;
     · el selector «Texto: del master / afinado»;
     · el alcance: todo el CV o una sección.
   El panel se abre solo cuando llega algo que decidir o un resultado; un punto
   en el botón (hueco reservado) avisa si queda algo pendiente con el panel
   cerrado. El progreso lo pinta la barra (ui/Progreso), no este botón.
   ============================================================================ */

const ALCANCES: AlcanceUI[] = ["todo", "summary", "work", "projects", "skills"];

type Af = ReturnType<typeof useAfinar>;

export function AfinarIA({ ed, af }: { ed: Editor; af: Af }) {
  const { t } = ed;
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState(false);
  const u = af.ultimo;
  const nTexto = u ? u.aplicado.filter((a) => a.tipo === "texto").length : 0;
  const afinando = af.busy !== null && af.busy !== "modo" && af.busy !== "revertir" && af.busy !== "respaldo";

  // Llega algo que decidir (sin respaldo) o un resultado: el panel se abre solo.
  // Cada llegada abre UNA vez (lo ya visto no reabre: cancelar y cerrar se respeta).
  const visto = useRef(new WeakSet<object>());
  useEffect(() => {
    let nueva = false;
    for (const x of [af.respaldo, af.ultimo]) {
      if (x && !visto.current.has(x)) {
        visto.current.add(x);
        nueva = true;
      }
    }
    if (nueva) setAbierto(true);
  }, [af.respaldo, af.ultimo]);

  const pendiente = Boolean(af.respaldo) || Boolean(u);

  return (
    <span className="ed-af" data-screen-label="editor-afinar">
      <Desplegable
        abierto={abierto}
        onCambiar={setAbierto}
        ancho={380}
        botonId="edAfinar"
        botonClase="c-btn c-btn--quiet ed-af-btn"
        botonEtiqueta={afinando ? `${t("editor.afAria")} · ${t("editor.afBusy")}` : t("editor.afAria")}
        boton={
          <>
            <AnchoFijo ocupado={afinando} reposo={t("editor.afBtn")} carga={t("editor.afBusy")} />
            <span className="ed-af-punto" data-on={pendiente && !abierto ? "" : undefined} aria-hidden="true" />
            <span aria-hidden="true">▾</span>
          </>
        }
      >
        <div className="ed-af-panel" id="edAfinarPanel" aria-busy={af.busy !== null}>
          {af.respaldo && (
            <div className="ed-af-conf" role="group" aria-live="polite" id="edAfinarRespaldo">
              <p className="txt">
                {t("editor.afRespPregunta")
                  .replace("{n}", String(af.respaldo.anadir))
                  .replace("{m}", String(af.respaldo.ocultar))}
              </p>
              <div className="acts">
                <button
                  type="button"
                  className="c-btn c-btn--quiet ed-af-rev"
                  id="edAfinarRespCancelar"
                  disabled={af.busy !== null}
                  onClick={() => {
                    af.cancelarRespaldo();
                    setAbierto(false);
                  }}
                >
                  {t("editor.afRespCancelar")}
                </button>
                <button
                  type="button"
                  className="c-btn c-btn--patina ed-af-rev"
                  id="edAfinarRespAplicar"
                  disabled={af.busy !== null}
                  onClick={af.aplicarRespaldo}
                >
                  {t("editor.afRespAplicar")}
                </button>
              </div>
            </div>
          )}

          {u && (
            <div className="ed-af-res" role="status">
              <div className="fila">
                <button
                  type="button"
                  className="ed-af-chip"
                  id="edAfinarRes"
                  aria-expanded={detalle}
                  aria-controls="edAfinarDetalle"
                  title={t("editor.afDetalle")}
                  onClick={() => setDetalle((v) => !v)}
                >
                  {t("editor.afResumen")
                    .replace("{a}", String(nTexto))
                    .replace("{r}", String(u.aplicado.length - nTexto))
                    .replace("{d}", String(u.descartado.length))}{" "}
                  <span aria-hidden="true">{detalle ? "▴" : "▾"}</span>
                </button>
                {u.aplicado.length > 0 && (
                  <button
                    type="button"
                    className="c-btn c-btn--quiet ed-af-rev"
                    id="edAfinarRevertir"
                    disabled={af.busy !== null}
                    onClick={af.revertir}
                  >
                    {t("editor.afRevertir")}
                  </button>
                )}
              </div>
              {detalle && <Detalle ed={ed} aplicado={u.aplicado} descartado={u.descartado} notas={u.notas} uso={u.uso} />}
            </div>
          )}

          {af.textos.length > 0 && (
            <div className="ed-obj ed-af-modo" role="group" aria-label={t("editor.afModoAria")} id="edAfinarModo">
              <span className="lbl" aria-hidden="true">
                {t("editor.afTexto")}
              </span>
              {(["master", "afinado"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={af.modo === m}
                  disabled={af.busy !== null}
                  onClick={() => af.cambiarModo(m)}
                >
                  {m === "master" ? t("editor.afModoMaster") : t("editor.afModoAfinado")}
                </button>
              ))}
            </div>
          )}

          <div className="ed-menu">
            {(af.respaldo || u || af.textos.length > 0) && <span className="ed-menu-sep" aria-hidden="true" />}
            <p className="ed-af-nota">{t("editor.afNota")}</p>
            {af.conAviso && (
              <p className="ed-af-nota" id="edAfinarAviso">
                {t("editor.afAviso")}
              </p>
            )}
            {ALCANCES.map((a) => (
              <button
                key={a}
                type="button"
                data-alcance={a}
                disabled={af.busy !== null}
                onClick={() => {
                  setAbierto(false);
                  af.afinar(a);
                }}
              >
                {a === "todo" ? t("editor.afTodo") : t(`editor.afSec_${a}`)}
              </button>
            ))}
            {af.err && <p className="ed-af-err">{af.err}</p>}
          </div>
        </div>
      </Desplegable>
    </span>
  );
}

function Detalle({
  ed,
  aplicado,
  descartado,
  notas,
  uso,
}: {
  ed: Editor;
  aplicado: AplicadoAfinar[];
  descartado: { id: string; propuesto: string; razon: string }[];
  notas: string;
  uso: { entrada: number | null; salida: number | null; cacheados: number } | null;
}) {
  const { t } = ed;
  const linea = (a: AplicadoAfinar) => {
    const apt = "aptitudes" in a ? a.aptitudes.join(", ") : "";
    switch (a.tipo) {
      case "texto":
        return a.propuesto;
      case "mostrar":
        return `${a.texto} — ${t("editor.afMostrar").replace("{a}", apt)}`;
      case "anadir":
        return `${a.texto} — ${t("editor.afAnadir").replace("{a}", apt)}`;
      case "ocultar-aptitud":
        return t("editor.afOcultarApt").replace("{a}", apt);
      case "ocultar-grupo":
        return t("editor.afOcultarGrupo").replace("{a}", apt);
    }
  };
  return (
    <div className="ed-af-det" id="edAfinarDetalle">
      {notas && <p className="ed-af-nota">{notas}</p>}
      {aplicado.length > 0 && (
        <>
          <span className="t-overline">{t("editor.afAplicados")}</span>
          <ul>
            {aplicado.map((a, i) => (
              <li key={`${a.tipo}:${a.id}:${i}`} data-tipo={a.tipo}>
                {linea(a)}
                {a.tipo === "texto" && a.motivo && <span className="mot">{a.motivo}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {descartado.length > 0 && (
        <>
          <span className="t-overline">{t("editor.afDescartados")}</span>
          <ul>
            {descartado.map((d, i) => (
              <li key={`${d.id}:${i}`} className="desc">
                {d.propuesto && <span className="prop">{d.propuesto}</span>}
                <span className="mot">{d.razon}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {uso && (
        <p className="ed-af-uso">
          {t("editor.afTokens")
            .replace("{e}", String(uso.entrada ?? "?"))
            .replace("{c}", String(uso.cacheados))
            .replace("{s}", String(uso.salida ?? "?"))}
        </p>
      )}
    </div>
  );
}
