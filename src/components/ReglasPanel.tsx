"use client";
/* ============================================================================
   REGLAS DE LA VARIANTE (DA-R1) — el bloque que fija lo que nada rompe.
   Lo usan las tres puertas de Variantes (plegable, antes de crear) y la pestaña
   «Reglas» del editor (con el estado de cada una). Chips rápidos: máximo de
   páginas, sin foto, «No mencionar…», «Ocultar sección…», «Incluir siempre…»
   con buscador del master, y una nota libre. Cada grupo puede ser obligatorio
   o preferido. El modelo y su saneado viven en src/lib/cv/reglas.ts.
   ============================================================================ */
import { useId, useMemo, useState } from "react";
import {
  hayReglas,
  MAX_TERMINO_LEN,
  MAX_NOTAS_LEN,
  type ClaveRegla,
  type EstadoRegla,
  type Reglas,
} from "@/lib/cv/reglas";
import { ALL_SECTION_IDS, type SectionId } from "@/lib/cv/templates";
import "./ReglasPanel.css";

export interface ItemParaReglas {
  id: string;
  kind: string;
  texto: string;
}

interface Props {
  reglas: Reglas;
  onCambio: (r: Reglas) => void;
  /** items del master para «Incluir siempre» (el buscador). */
  master: ItemParaReglas[];
  t: (k: string) => string;
  /** plegable (Variantes) o abierto (pestaña del editor). */
  plegable?: boolean;
  /** el estado de cada regla (solo el editor). */
  estado?: EstadoRegla[];
  deshabilitado?: boolean;
  /** se llama al abrir el plegable (para cargar el master solo cuando hace falta). */
  alAbrir?: () => void;
}

const PAGINAS = [1, 2, 3] as const;

export function ReglasPanel({ reglas, onCambio, master, t, plegable, estado, deshabilitado, alAbrir }: Props) {
  const base = useId();
  const [termino, setTermino] = useState("");
  const [busca, setBusca] = useState("");
  const porId = useMemo(() => new Map(master.map((m) => [m.id, m])), [master]);
  const set = (patch: Partial<Reglas>) => onCambio({ ...reglas, ...patch });

  const anadirTermino = () => {
    const x = termino.trim().slice(0, MAX_TERMINO_LEN);
    if (!x) return;
    if (!reglas.excluirTerminos.some((y) => y.toLowerCase() === x.toLowerCase()))
      set({ excluirTerminos: [...reglas.excluirTerminos, x] });
    setTermino("");
  };
  const alternarSeccion = (id: SectionId) =>
    set({
      ocultarSecciones: reglas.ocultarSecciones.includes(id)
        ? reglas.ocultarSecciones.filter((s) => s !== id)
        : [...reglas.ocultarSecciones, id],
    });
  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q.length < 2) return [];
    return master
      .filter((m) => !reglas.incluirSiempre.includes(m.id) && m.texto.toLowerCase().includes(q))
      .slice(0, 8);
  }, [busca, master, reglas.incluirSiempre]);

  /** El interruptor obligatoria/preferida de un grupo. */
  const Fuerza = ({ k }: { k: ClaveRegla }) => (
    <button
      type="button"
      className={`rg-fuerza${reglas.fuerza[k] === "preferida" ? " rg-fuerza--pref" : ""}`}
      aria-label={t("reglas.fuerzaAria")}
      title={t("reglas.fuerzaHint")}
      disabled={deshabilitado}
      onClick={() =>
        set({ fuerza: { ...reglas.fuerza, [k]: reglas.fuerza[k] === "obligatoria" ? "preferida" : "obligatoria" } })
      }
    >
      {reglas.fuerza[k] === "obligatoria" ? t("reglas.obligatoria") : t("reglas.preferida")}
    </button>
  );

  const cuerpo = (
    <div className="rg-cuerpo" data-screen-label="reglas-variante">
      {/* Páginas y foto: chips de un toque. */}
      <div className="rg-fila">
        <span className="rg-et">{t("reglas.rapidas")}</span>
        <div className="rg-chips" role="group" aria-label={t("reglas.paginasAria")}>
          {PAGINAS.map((n) => (
            <button
              key={n}
              type="button"
              className="rg-chip"
              aria-pressed={reglas.paginasMax === n}
              disabled={deshabilitado}
              onClick={() => set({ paginasMax: reglas.paginasMax === n ? null : n })}
            >
              {t(n === 1 ? "reglas.max1" : "reglas.maxN").replace("{n}", String(n))}
            </button>
          ))}
          <button
            type="button"
            className="rg-chip"
            aria-pressed={reglas.sinFoto}
            disabled={deshabilitado}
            onClick={() => set({ sinFoto: !reglas.sinFoto })}
          >
            {t("reglas.sinFoto")}
          </button>
          {reglas.paginasMax !== null && <Fuerza k="paginasMax" />}
        </div>
      </div>

      {/* No mencionar… */}
      <div className="rg-fila">
        <label className="rg-et" htmlFor={`${base}-t`}>
          {t("reglas.noMencionar")}
        </label>
        <div className="rg-chips">
          {reglas.excluirTerminos.map((x) => (
            <span className="rg-chip rg-chip--on" key={x}>
              {x}
              <button
                type="button"
                className="rg-x"
                aria-label={t("reglas.quitar").replace("{x}", x)}
                disabled={deshabilitado}
                onClick={() => set({ excluirTerminos: reglas.excluirTerminos.filter((y) => y !== x) })}
              >
                ×
              </button>
            </span>
          ))}
          <input
            id={`${base}-t`}
            className="c-input rg-input"
            placeholder={t("reglas.noMencionarPh")}
            value={termino}
            maxLength={MAX_TERMINO_LEN}
            disabled={deshabilitado}
            onChange={(e) => setTermino(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                anadirTermino();
              }
            }}
            onBlur={anadirTermino}
          />
          {reglas.excluirTerminos.length > 0 && <Fuerza k="excluirTerminos" />}
        </div>
      </div>

      {/* Ocultar sección… */}
      <div className="rg-fila">
        <span className="rg-et">{t("reglas.ocultarSeccion")}</span>
        <div className="rg-chips" role="group" aria-label={t("reglas.ocultarSeccion")}>
          {ALL_SECTION_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className="rg-chip"
              aria-pressed={reglas.ocultarSecciones.includes(id)}
              disabled={deshabilitado}
              onClick={() => alternarSeccion(id)}
            >
              {t(`reglas.sec.${id}`)}
            </button>
          ))}
          {reglas.ocultarSecciones.length > 0 && <Fuerza k="ocultarSecciones" />}
        </div>
      </div>

      {/* Incluir siempre… con buscador del master. */}
      <div className="rg-fila">
        <label className="rg-et" htmlFor={`${base}-b`}>
          {t("reglas.incluirSiempre")}
        </label>
        <div className="rg-chips">
          {reglas.incluirSiempre.map((id) => (
            <span className="rg-chip rg-chip--on" key={id}>
              <span className="rg-trunc">{porId.get(id)?.texto ?? t("reglas.itemDesconocido")}</span>
              <button
                type="button"
                className="rg-x"
                aria-label={t("reglas.quitar").replace("{x}", porId.get(id)?.texto ?? id)}
                disabled={deshabilitado}
                onClick={() => set({ incluirSiempre: reglas.incluirSiempre.filter((y) => y !== id) })}
              >
                ×
              </button>
            </span>
          ))}
          {reglas.incluirSiempre.length > 0 && <Fuerza k="incluirSiempre" />}
        </div>
        <input
          id={`${base}-b`}
          className="c-input rg-input rg-input--ancho"
          placeholder={t("reglas.buscarPh")}
          value={busca}
          disabled={deshabilitado}
          onChange={(e) => setBusca(e.target.value)}
        />
        {resultados.length > 0 && (
          <ul className="rg-res" aria-label={t("reglas.resultados")}>
            {resultados.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={deshabilitado}
                  onClick={() => {
                    set({ incluirSiempre: [...reglas.incluirSiempre, m.id] });
                    setBusca("");
                  }}
                >
                  <span className="rg-kind">{m.kind}</span> <span className="rg-trunc">{m.texto}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {busca.trim().length >= 2 && resultados.length === 0 && (
          <p className="rg-nota">{master.length ? t("reglas.sinResultados") : t("reglas.cargandoMaster")}</p>
        )}
      </div>

      {/* Nota libre: viaja en el prompt de la IA, no se comprueba. */}
      <div className="rg-fila">
        <label className="rg-et" htmlFor={`${base}-n`}>
          {t("reglas.nota")}
        </label>
        <textarea
          id={`${base}-n`}
          className="c-input rg-notas"
          rows={2}
          maxLength={MAX_NOTAS_LEN}
          placeholder={t("reglas.notaPh")}
          value={reglas.notas}
          disabled={deshabilitado}
          onChange={(e) => set({ notas: e.target.value })}
        />
      </div>

      {estado && (
        <div className="rg-estado" data-screen-label="reglas-estado">
          <span className="t-overline">{t("reglas.estadoT")}</span>
          {estado.length === 0 ? (
            <p className="rg-nota">{t("reglas.sinReglas")}</p>
          ) : (
            <ul>
              {estado.map((e, i) => (
                <li
                  key={i}
                  className={e.cumple === null ? "rg-pend" : e.cumple ? "rg-ok" : "rg-no"}
                  data-regla={e.regla}
                  data-cumple={e.cumple === null ? "?" : e.cumple ? "1" : "0"}
                >
                  <span className="rg-marca" aria-hidden>{e.cumple === null ? "◐" : e.cumple ? "●" : "⚠"}</span>
                  <b>{e.cumple === null ? t("reglas.pendiente") : e.cumple ? t("reglas.cumple") : t("reglas.noCumple")}</b>
                  <span className="rg-chip-f">{e.fuerza === "obligatoria" ? t("reglas.obligatoria") : t("reglas.preferida")}</span>
                  <span className="rg-motivo">{e.motivo}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  if (!plegable) return <div className="rg">{cuerpo}</div>;
  const n =
    (reglas.paginasMax ? 1 : 0) + (reglas.sinFoto ? 1 : 0) + reglas.excluirTerminos.length +
    reglas.ocultarSecciones.length + reglas.incluirSiempre.length + (reglas.notas ? 1 : 0);
  return (
    <details
      className="rg rg--plegable"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) alAbrir?.();
      }}
    >
      <summary>
        <span className="t-overline">{t("reglas.titulo")}</span>
        <span className="rg-resumen">
          {hayReglas(reglas) ? t("reglas.activas").replace("{n}", String(n)) : t("reglas.hint")}
        </span>
      </summary>
      {cuerpo}
    </details>
  );
}
