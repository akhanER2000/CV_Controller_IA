// Sin "use client": solo lo importa la barra del editor (ya cliente).
import { useState } from "react";
import type { AplicadoAfinar } from "@/lib/cv/afinar";
import { Desplegable } from "./Desplegable";
import { useAfinar, type AlcanceUI } from "./useAfinar";
import type { Editor } from "./useEditorVariante";
import "./afinar.css";

/* ============================================================================
   «AFINAR CON IA» en la barra, junto a «Ajustar páginas» (el hueco reservado).
     · el botón abre el alcance: todo el CV o una sección;
     · al terminar, el resumen (afinados · resueltos · descartados), su detalle y
       «Revertir afinado»;
     · el selector «Texto: del master / afinado» alterna la versión de verdad.
   Cada item afinado lleva en la composición el sello de verificado y su
   «Original … Revertir» (Secciones), que deja el texto del master.
   ============================================================================ */

const ALCANCES: AlcanceUI[] = ["todo", "summary", "work", "projects", "skills"];

export function AfinarIA({ ed }: { ed: Editor }) {
  const { t } = ed;
  const af = useAfinar(ed);
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState(false);
  const u = af.ultimo;
  const nTexto = u ? u.aplicado.filter((a) => a.tipo === "texto").length : 0;

  return (
    <span className="ed-af" data-screen-label="editor-afinar">
      <Desplegable
        abierto={abierto}
        onCambiar={setAbierto}
        ancho={300}
        botonId="edAfinar"
        botonClase="c-btn c-btn--quiet ed-af-btn"
        botonEtiqueta={t("editor.afAria")}
        boton={
          <>
            {af.busy && af.busy !== "modo" && af.busy !== "revertir" ? t("editor.afBusy") : t("editor.afBtn")}{" "}
            <span aria-hidden="true">▾</span>
          </>
        }
      >
        <div className="ed-menu">
          <p className="ed-af-nota">{t("editor.afNota")}</p>
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
      </Desplegable>

      {u && (
        <span className="ed-af-res" role="status">
          <Desplegable
            abierto={detalle}
            onCambiar={setDetalle}
            ancho={380}
            botonId="edAfinarRes"
            botonClase="ed-af-chip"
            botonTitulo={t("editor.afDetalle")}
            boton={t("editor.afResumen")
              .replace("{a}", String(nTexto))
              .replace("{r}", String(u.aplicado.length - nTexto))
              .replace("{d}", String(u.descartado.length))}
          >
            <Detalle ed={ed} aplicado={u.aplicado} descartado={u.descartado} notas={u.notas} uso={u.uso} />
          </Desplegable>
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
        </span>
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
