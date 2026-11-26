// Sin "use client": solo lo importa la pantalla del editor (ya cliente).
import { Fragment, type ReactNode } from "react";
import { referenceLine, type ReferenceFields } from "@/lib/cv/resume";
import { Huecos, HuecosSeccion, PropuestaEnLinea, SelloVerificado } from "@/components/FlujoCv";
import { NavSecciones } from "./NavSecciones";
import { IconoEd, type IconoEdNombre } from "./iconos";
import { S, editableField, libTextOf, type VItem } from "./modelo";
import type { Editor } from "./useEditorVariante";

/* ============================================================================
   LA COMPOSICIÓN — lo que se decide, en tarjetas, con navegación fija arriba.
   Cada sección es una tarjeta con su cabecera (ícono, título, cuántos items) y
   sus filas editables EN LÍNEA (clic en el texto = afinar; Intro o salir del
   campo guarda; si vuelve a igualar al master, el override se revierte). Bajo
   cada item, sus huecos, su sello y las decisiones abiertas de «Ajustar».
   ============================================================================ */

export function Secciones({ ed, documento }: { ed: Editor; documento: ReactNode }) {
  const { t } = ed;
  return (
    <section className="ed-col ed-col--mid" data-screen-label="editor-composicion" ref={ed.midRef}>
      <div className="ed-navwrap" id="edNav">
        <NavSecciones secciones={ed.secciones} raiz={ed.midRef} etiqueta={t("editor.edNavAria")} />
      </div>

      <div className="ed-mid-in">
        <div className="var-card var-obj" data-sec="titulo">
          <div className="var-objh">
            <label htmlFor="objInput">
              {t("editor.objLabel")} <span className="var-objh-h">{t("editor.objLabelHint")}</span>
            </label>
            <span className="n" id="midN">
              {ed.loading ? t("editor.reading") : ed.midN}
            </span>
          </div>
          <input
            className="c-input"
            id="objInput"
            value={ed.targetTitle}
            spellCheck={false}
            placeholder={t("editor.objPlaceholder")}
            onChange={(e) => ed.setTargetTitle(e.target.value)}
            onBlur={ed.onObjBlur}
          />
          <p className="hint">
            {t("editor.objHintA")} <b>{t("editor.objHintBold")}</b> {t("editor.objHintB")}
          </p>
        </div>

        {!ed.isEmpty && <Contenido ed={ed} />}

        <div className="var-empty" id="midEmpty" hidden={!ed.isEmpty}>
          <span className="t-overline">{t("editor.emptyOverline")}</span>
          {t("editor.emptyLine1")}
          <br />
          {t("editor.emptyLine2A")} <b>+</b> {t("editor.emptyLine2B")}
        </div>

        {documento}
      </div>
    </section>
  );
}

/** La cabecera de una tarjeta de sección. */
function Cabeza({ icono, titulo, n, nota }: { icono: IconoEdNombre; titulo: string; n?: number; nota?: ReactNode }) {
  return (
    <div className="gh">
      <IconoEd nombre={icono} />
      <h3 className="gh-t">{titulo}</h3>
      {n != null && <span className="gh-n">{n}</span>}
      {nota && <span className="n">{nota}</span>}
    </div>
  );
}

function Contenido({ ed }: { ed: Editor }) {
  const { t, items, huecos } = ed;

  /** Las propuestas abiertas de un item, bajo él. */
  const propsDe = (id: string) =>
    (ed.enLinea.get(id) ?? []).map((pr) => (
      <PropuestaEnLinea
        key={pr.clave}
        prop={pr}
        actual={pr.clave === ed.actual}
        revertida={ed.fitDone[pr.clave] === "undo"}
        onAceptar={() => ed.aceptarProp(pr)}
        onRechazar={() => ed.mark(pr.clave, "no")}
      />
    ));

  /** El sello de lo verificado. «deshacer» solo si se aceptó en esta sesión. */
  const selloDe = (it: VItem) => {
    if (!it.override_verified || it.override_data == null) return null;
    const p = ed.fitDone[`a:${it.id}`] === "ok" ? ed.fit?.acortar.find((a) => a.id === it.id) : undefined;
    return <SelloVerificado onDeshacer={p ? () => ed.fitRevertShorten(p) : undefined} />;
  };

  const quitar = (id: string, titulo = t("editor.removeFromVariant")) => (
    <button type="button" data-a="out" title={titulo} aria-label={titulo} onClick={() => ed.removeItem(id)}>
      ×
    </button>
  );

  // ── Una viñeta / item de texto (.var-b + su .var-orig adyacente) ──
  const vineta = (b: VItem, work?: VItem) => {
    const ov = b.override_data != null;
    const hidden = !b.visible;
    const editing = ed.editingId === b.id;
    const field = editableField(b.kind);
    const text = field ? S(b.data, field) : "";
    const masterText = field ? S(ed.masterById.get(b.item_id)?.data, field) : "";
    const canDrag = b.kind === "bullet" && !!work;
    return (
      <Fragment key={b.id}>
        <div
          className={
            "var-b" +
            (ov ? " ovr" : "") +
            (ov && b.override_verified ? " flu-ok" : "") +
            (hidden ? " hid" : "") +
            (ed.draggingId === b.id ? " dragging" : "")
          }
          data-b={b.id}
          draggable={canDrag && !editing}
          onDragStart={canDrag ? () => ed.onDragStart(b.id) : undefined}
          onDragEnd={canDrag ? ed.onDragEnd : undefined}
          onDragOver={canDrag && work ? (e) => ed.onDragOver(e, b, work) : undefined}
        >
          {canDrag && work ? (
            <button
              type="button"
              className="grip"
              data-grip={b.id}
              title={t("editor.gripTitle")}
              aria-label={t("editor.gripAria")}
              onKeyDown={(e) => ed.onGripKey(e, b, work)}
            >
              ⠿
            </button>
          ) : (
            <span className="grip" aria-hidden="true">
              ·
            </span>
          )}
          <span
            className="tx"
            data-edit=""
            data-editable={field && !editing ? "" : undefined}
            title={field && !editing ? t("editor.edEditarHint") : undefined}
            onClick={field && !editing ? () => ed.startEdit(b.id) : undefined}
            contentEditable={editing}
            suppressContentEditableWarning
            ref={editing ? ed.editRef : undefined}
            onBlur={editing ? ed.finishEdit : undefined}
            onKeyDown={editing ? ed.onEditKeyDown : undefined}
          >
            {text}
          </span>
          <Huecos faltas={huecos.get(b.id)} />
          {selloDe(b)}
          <span className="bacts">
            <button type="button" data-a="hide" title={t("editor.hideTitle")} onClick={() => ed.toggleHide(b.id)}>
              {hidden ? t("editor.show") : t("editor.hide")}
            </button>
            {field ? (
              <button type="button" data-a="edit" title={t("editor.tuneTitle")} onClick={() => ed.startEdit(b.id)}>
                {t("editor.tune")}
              </button>
            ) : null}
            {quitar(b.id)}
          </span>
        </div>
        {ov && (
          <div className="var-orig">
            <span>
              {t("editor.original")} {masterText}
            </span>
            <button type="button" className="rv" data-rv={b.id} onClick={() => ed.revert(b.id)}>
              {t("editor.revert")}
            </button>
          </div>
        )}
        {propsDe(b.id)}
      </Fragment>
    );
  };

  /** Una fila de texto compuesto (el que se imprimirá) con su botón de quitar. */
  const fila = (it: VItem, texto: string) => [
    <div className="var-b var-b--fija" data-b={it.id} key={it.id}>
      <span className="grip" aria-hidden="true">
        ·
      </span>
      <span className="tx">{texto}</span>
      <span className="bacts">{quitar(it.id)}</span>
    </div>,
    ...propsDe(it.id),
  ];

  /** Un grupo simple: certificaciones · idiomas · publicaciones. */
  const simple = (icono: IconoEdNombre, titleKey: string, list: VItem[], sec: string) =>
    list.length > 0 ? (
      <div className="var-card var-g" key={sec} data-sec={sec}>
        <Cabeza icono={icono} titulo={t(titleKey)} n={list.length} />
        <div className="var-exp">{list.flatMap((it) => fila(it, libTextOf(it.kind, it.data)))}</div>
      </div>
    ) : null;

  return (
    <div id="mid">
      {ed.summaryItems.length > 0 && (
        <div className="var-card var-g" data-sec="summary">
          <Cabeza icono="summary" titulo={t("editor.groupSummary")} />
          <div className="var-exp">{ed.summaryItems.map((s) => vineta(s))}</div>
        </div>
      )}

      {ed.workItems.length > 0 && (
        <div className="var-card var-g" data-sec="work">
          <Cabeza icono="work" titulo={t("editor.groupExperience")} n={ed.workItems.length} nota={t("editor.datesFromMaster")} />
          {ed.workItems.map((w) => (
            <div className="var-exp" data-exp={w.item_id} key={w.id}>
              <div className="var-eh">
                <span className="tt">{S(w.data, "title")}</span>
                <span className="org">{[S(w.data, "company"), S(w.data, "dates")].filter(Boolean).join(" · ")}</span>
                <Huecos faltas={huecos.get(w.id)} />
                <span className="bacts bacts--rol">{quitar(w.id, t("editor.removeRoleTitle"))}</span>
              </div>
              {propsDe(w.id)}
              {ed.bulletsForWork(w).map((b) => vineta(b, w))}
            </div>
          ))}
        </div>
      )}

      {ed.skillItems.length > 0 && (
        <div className="var-card var-g" data-sec="skills">
          <Cabeza icono="skills" titulo={t("editor.groupSkillsFull")} n={ed.skillItems.length} />
          <div className="var-chips">
            {ed.skillItems.map((s) => (
              <span className="var-chip" key={s.id}>
                <b>{S(s.data, "group")}</b>{" "}
                {t("editor.skillItemsCount").replace("{n}", String(S(s.data, "items").split(",").filter(Boolean).length))}
                <button
                  type="button"
                  data-out={s.item_id}
                  title={t("editor.removeTitle")}
                  aria-label={t("editor.removeTitle")}
                  onClick={() => ed.removeItem(s.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <HuecosSeccion
            faltas={ed.skillItems.flatMap((s) => huecos.get(s.id) ?? [])}
            grupo={(id) => S(items.find((i) => i.id === id)?.data, "group")}
          />
          {ed.skillItems.map((s) => propsDe(s.id))}
        </div>
      )}

      {ed.projectItems.length > 0 && (
        <div className="var-card var-g" data-sec="projects">
          <Cabeza icono="projects" titulo={t("editor.groupProjects")} n={ed.projectItems.length} />
          <div className="var-exp">{ed.projectItems.map((p) => vineta(p))}</div>
        </div>
      )}

      {ed.eduItems.length > 0 && (
        <div className="var-card var-g" data-sec="education">
          <Cabeza icono="education" titulo={t("editor.groupEducation")} n={ed.eduItems.length} />
          <div className="var-exp">
            {ed.eduItems.flatMap((d) =>
              fila(d, [S(d.data, "degree"), S(d.data, "institution"), S(d.data, "dates")].filter(Boolean).join(" · ")),
            )}
          </div>
        </div>
      )}

      {simple("certifications", "editor.groupCertifications", ed.certItems, "certifications")}
      {simple("languages", "editor.groupLanguages", ed.langItems, "languages")}
      {simple("publications", "editor.groupPublications", ed.pubItems, "publications")}

      {/* Referencias AÑADIDAS. Estar aquí no basta para que se impriman: manda el
          interruptor de Presentación, y si está apagado se dice aquí mismo. */}
      {ed.refItems.length > 0 && (
        <div className="var-card var-g" data-sec="references">
          <Cabeza
            icono="references"
            titulo={t("editor.groupReferences")}
            n={ed.refItems.length}
            nota={ed.refsOn ? t("editor.refsWhenOn") : t("editor.refsWhyOff")}
          />
          <div className="var-exp">{ed.refItems.flatMap((r) => fila(r, referenceLine(r.data as ReferenceFields)))}</div>
        </div>
      )}
    </div>
  );
}
