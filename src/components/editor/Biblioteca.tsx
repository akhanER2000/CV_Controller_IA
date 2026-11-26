// Sin "use client": solo lo importa la pantalla del editor (ya cliente).
import { TECLA } from "./atajos";
import { IconoEd } from "./iconos";
import { LIB_TITLE_KEY, tarjetaTextos, type LibSectionId, type FiltroLib, type FilaLib, type TarjetaLib } from "./modelo";
import type { Editor } from "./useEditorVariante";

/* ============================================================================
   BIBLIOTECA DEL MASTER — cajón NO modal a la izquierda (cerrado por defecto).
   Pestañas por tipo (ícono, acento y contador de lo que se ve), un buscador que
   mira en todos los tipos, un filtro por estado (en la variante / fuera) y
   tarjetas con título, subtítulo útil, estado y su botón Añadir o Quitar a la
   vista. Las viñetas van plegadas bajo su rol. Añadir y quitar usan el MISMO
   manejador de siempre (toggleFromLib → POST/DELETE …/items).
   ============================================================================ */

/** Rótulo de la pestaña: el de la sección, salvo Experiencia (las viñetas van dentro del rol). */
const rotulo = (id: LibSectionId) => (id === "work" ? "editor.groupExperience" : LIB_TITLE_KEY[id]);

const FILTROS: readonly FiltroLib[] = ["todo", "dentro", "fuera"];
const FILTRO_KEY: Record<FiltroLib, string> = {
  todo: "editor.libFiltroTodo",
  dentro: "editor.libFiltroDentro",
  fuera: "editor.libFiltroFuera",
};

export function Biblioteca({ ed }: { ed: Editor }) {
  const { t, libPestanas, libTab, libQ } = ed;
  const total = libPestanas.reduce((n, p) => n + p.n, 0);
  // Una pestaña que ya no existe (se quitó el último item de ese tipo) vuelve a «Todo».
  const activa = libTab !== "todo" && libPestanas.some((p) => p.id === libTab) ? libTab : "todo";
  const visibles = activa === "todo" ? libPestanas.filter((p) => p.tarjetas.length > 0) : libPestanas.filter((p) => p.id === activa);
  const vacio = visibles.every((p) => p.tarjetas.length === 0);

  return (
    <aside className="ed-col ed-col--lib" id="edLib" data-screen-label="editor-master" aria-label={t("editor.edBiblioteca")}>
      <div className="ed-colh lib-h">
        <div className="lib-h-a">
          <IconoEd nombre="biblioteca" />
          <span className="lib-h-t">{t("editor.libOverline")}</span>
          <span className="n">{t("editor.libCount").replace("{n}", String(ed.libCount))}</span>
          <button
            type="button"
            className="ed-lib-x"
            aria-label={t("editor.edCerrar")}
            title={`${t("editor.edCerrar")} (${TECLA.biblioteca})`}
            onClick={() => ed.setLibAbierta(false)}
          >
            <IconoEd nombre="ocultar" tamano={13} />
          </button>
        </div>
        <div className="lib-search">
          <input
            ref={ed.libQRef}
            className="c-input"
            id="libQ"
            type="search"
            placeholder={t("editor.libSearchPlaceholder")}
            aria-label={t("editor.libSearchAria")}
            value={libQ}
            onChange={(e) => ed.setLibQ(e.target.value)}
          />
        </div>
        <div className="lib-filtro" role="group" aria-label={t("editor.libFiltroAria")}>
          {FILTROS.map((f) => (
            <button key={f} type="button" aria-pressed={ed.libFiltro === f} data-filtro={f} onClick={() => ed.setLibFiltro(f)}>
              {t(FILTRO_KEY[f])}
            </button>
          ))}
        </div>
        <div className="lib-tabs" role="tablist" aria-label={t("editor.libTabsAria")}>
          <button
            type="button"
            role="tab"
            aria-selected={activa === "todo"}
            className="lib-tab"
            data-tab="todo"
            onClick={() => ed.setLibTab("todo")}
          >
            <IconoEd nombre="todo" tamano={14} />
            <span className="lib-tab-t">{t("editor.libTabTodo")}</span>
            <span className="lib-tab-n">{total}</span>
          </button>
          {libPestanas.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activa === p.id}
              className={"lib-tab" + (ed.editingSection === p.id ? " lib-editing" : "")}
              data-tab={p.id}
              data-vacia={p.n === 0 ? "" : undefined}
              onClick={() => ed.setLibTab(p.id)}
            >
              <IconoEd nombre={p.id} tamano={14} />
              <span className="lib-tab-t">{t(rotulo(p.id))}</span>
              <span className="lib-tab-n">{p.n}</span>
            </button>
          ))}
        </div>
      </div>

      <div id="lib" role="tabpanel">
        {visibles.map((p) =>
          p.tarjetas.length === 0 ? null : (
            <section className="lib-g" key={p.id} data-lib-section={p.id}>
              {activa === "todo" && (
                <h3 className="lib-gt">
                  <IconoEd nombre={p.id} tamano={13} /> {t(rotulo(p.id))} <span className="n">{p.n}</span>
                </h3>
              )}
              {/* Referencias: añadirlas a la variante NO las imprime; hace falta además
                  el interruptor de Presentación. Se dice aquí, que es cuando importa. */}
              {p.id === "references" && <p className="lib-note">{t("editor.refsWhenOn")}</p>}
              <div className="lib-cards">
                {p.tarjetas.map((c) => (
                  <Tarjeta key={c.row.id} c={c} ed={ed} />
                ))}
              </div>
            </section>
          ),
        )}
        {vacio && (
          <p className="lib-empty">{libQ.trim() ? t("editor.libNoMatches") : t("editor.libNadaFiltro")}</p>
        )}
        <p className="lib-foot">
          {t("editor.libFootA")} <b>{t("editor.libFootRef")}</b> {t("editor.libFootB")}
        </p>
      </div>
    </aside>
  );
}

function BotonEstado({ fila, ed, chico }: { fila: FilaLib; ed: Editor; chico?: boolean }) {
  const { t } = ed;
  return (
    <button
      type="button"
      className={"lib-add" + (chico ? " lib-add--s" : "")}
      aria-pressed={fila.enVariante}
      data-add={fila.row.id}
      onClick={() => void ed.toggleFromLib(fila.row.id)}
    >
      {fila.enVariante ? t("editor.libQuitar") : t("editor.libAnadir")}
    </button>
  );
}

function Tarjeta({ c, ed }: { c: TarjetaLib; ed: Editor }) {
  const { t } = ed;
  const { titulo, sub } = tarjetaTextos(c.row.kind, c.row.data);
  const esRol = c.row.kind === "work";
  const abierta = esRol && (c.abrir || ed.rolesAbiertos.has(c.row.id));
  const idViñetas = `lib-v-${c.row.id}`;
  return (
    <article className={"lib-card" + (c.enVariante ? " in" : "")} data-lib={c.row.id} data-kind={c.row.kind}>
      <div className="lib-card-a">
        <div className="lib-card-tx">
          <span className="lib-card-t">{titulo || "—"}</span>
          {sub && <span className="lib-card-s">{sub}</span>}
        </div>
        <BotonEstado fila={c} ed={ed} />
      </div>
      <div className="lib-card-b">
        <span className="lib-estado" data-dentro={c.enVariante ? "" : undefined}>
          {c.enVariante ? t("editor.libEstadoDentro") : t("editor.libEstadoFuera")}
        </span>
        {esRol && c.vinetasTotal > 0 && (
          <button
            type="button"
            className="lib-vin-b"
            aria-expanded={abierta}
            aria-controls={idViñetas}
            onClick={() => ed.alternarRol(c.row.id)}
          >
            <span className="chev" aria-hidden="true">
              {abierta ? "▾" : "▸"}
            </span>
            {t("editor.libVinetas")
              .replace("{n}", String(c.vinetasDentro))
              .replace("{m}", String(c.vinetasTotal))}
          </button>
        )}
      </div>
      {abierta && (
        <ul className="lib-vin" id={idViñetas}>
          {c.vinetas.map((v) => (
            <li className={"lib-vin-r" + (v.enVariante ? " in" : "")} key={v.row.id} data-lib={v.row.id}>
              <span className="tx">{tarjetaTextos(v.row.kind, v.row.data).titulo}</span>
              <BotonEstado fila={v} ed={ed} chico />
            </li>
          ))}
          {c.vinetas.length === 0 && <li className="lib-vin-vacio">{t("editor.libNadaFiltro")}</li>}
        </ul>
      )}
    </article>
  );
}
