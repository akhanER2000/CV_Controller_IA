// Sin "use client": solo lo importa la pantalla del editor (ya cliente).
import { useMemo, useState } from "react";
import { referenceLine, type ReferenceFields } from "@/lib/cv/resume";
import { PINNED_LAST_SECTION, SECTION_ORDER_PRESETS } from "@/lib/cv/templates";
import { TemplateGallery, TemplateThumb } from "@/components/TemplateGallery";
import { Tabs } from "@/components/ui/Tabs";
import { EncuadreFoto } from "./EncuadreFoto";
import { ReglasPanel } from "@/components/ReglasPanel";
import { textoDeItem } from "@/lib/cv/ajuste";
import { LIB_TITLE_KEY, PALETTES, S, TEMPLATES, TYPOGRAPHIES, isPhotoDataUrl } from "./modelo";
import type { Editor } from "./useEditorVariante";

/* ============================================================================
   DOCUMENTO — la configuración, debajo de lo que se decide, en cuatro pestañas
   claras: Contacto · Diseño · Orden · Presentación. Mismos guardados de
   siempre (savePresentation → PATCH /api/variants/[id] { presentation }). El
   selector de plantilla abre la galería (TemplateGallery) tal cual.
   ============================================================================ */

type DocTab = "contacto" | "diseno" | "orden" | "presentacion" | "reglas";

/** La pestaña «Reglas»: el mismo bloque que en Variantes, con el estado de cada una. */
function ReglasTab({ ed }: { ed: Editor }) {
  const master = useMemo(
    () =>
      ed.master
        .map((m) => ({ id: m.id, kind: m.kind, texto: textoDeItem(m.kind, m.data ?? {}) }))
        .filter((m) => m.texto.trim() !== ""),
    [ed.master],
  );
  return (
    <ReglasPanel reglas={ed.reglas} onCambio={ed.guardarReglas} master={master} t={ed.t} estado={ed.estadoReglas} />
  );
}

export function DocumentoPanel({ ed }: { ed: Editor }) {
  const { t } = ed;
  const [tab, setTab] = useState<DocTab>("contacto");
  const items: { id: DocTab; etiqueta: string }[] = [
    { id: "contacto", etiqueta: t("editor.docTabContacto") },
    { id: "diseno", etiqueta: t("editor.docTabDiseno") },
    { id: "orden", etiqueta: t("editor.docTabOrden") },
    ...(ed.hasBasics ? [{ id: "presentacion" as const, etiqueta: t("editor.docTabPres") }] : []),
    // Las reglas de la variante (DA-R1): verlas, editarlas y su estado.
    { id: "reglas", etiqueta: t("reglas.docTab") },
  ];
  const activa = items.some((i) => i.id === tab) ? tab : "contacto";
  return (
    <>
      <div className="var-card var-doc" data-sec="doc" data-screen-label="editor-documento">
        <div className="gh">
          <h3 className="gh-t">{t("editor.edSecDocumento")}</h3>
          <span className="n">{t("editor.edSecDocumentoHint")}</span>
        </div>
        <Tabs
          items={items}
          valor={activa}
          onCambio={(id) => setTab(id as DocTab)}
          etiqueta={t("editor.docTabsAria")}
          className="doc-tabs"
        >
          {activa === "contacto" && <Contacto ed={ed} />}
          {activa === "diseno" && <Diseno ed={ed} />}
          {activa === "orden" && <Orden ed={ed} />}
          {activa === "presentacion" && <Presentacion ed={ed} />}
          {activa === "reglas" && <ReglasTab ed={ed} />}
        </Tabs>
      </div>

      {/* La SUGERENCIA de referencias vive fuera de las pestañas: no es un ajuste,
          es una propuesta sobre el contenido, con su motivo y un botón. */}
      {ed.refsSugeridas.length > 0 && (
        <div className="c-card var-refsug" data-screen-label="editor-refs-sugeridas">
          <span className="t-overline">{t("editor.refsSuggestTitle")}</span>
          {ed.refsSugeridas.map((s) => {
            const ref = ed.refs.find((r) => r.id === s.referenceId);
            if (!ref) return null;
            return (
              <div className="refsug-row" key={s.referenceId}>
                <span className="tx">
                  <b>{referenceLine(ref.data as ReferenceFields)}</b>
                  <em>
                    {t("editor.refsSuggestBody").replace(
                      "{items}",
                      s.becauseOf.map(ed.masterLabel).join(" · "),
                    )}
                  </em>
                </span>
                <button type="button" className="c-btn c-btn--quiet" onClick={() => void ed.toggleFromLib(s.referenceId)}>
                  {t("editor.refsSuggestAdd")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* La galería: las miniaturas son la página 1 del PDF REAL con ESTE resumeData. */}
      <TemplateGallery
        open={ed.galleryOpen}
        onClose={() => ed.setGalleryOpen(false)}
        templates={TEMPLATES}
        activeTemplateId={ed.designTemplateId}
        paletteId={ed.designPaletteId}
        typographyId={ed.designTypographyId}
        palettes={PALETTES}
        typographies={TYPOGRAPHIES}
        data={ed.resumeData}
        docSig={ed.docSig}
        recommendations={ed.recommendations}
        onPickTemplate={(id) => ed.savePresentation({ templateId: id })}
        onPickPalette={(id) => ed.savePresentation({ paletteId: id || null })}
        onPickTypography={(id) => ed.savePresentation({ typographyId: id || null })}
      />
    </>
  );
}

/** Contacto por variante: se imprime en el CUERPO y hereda del master campo a campo. */
function Contacto({ ed }: { ed: Editor }) {
  const { t } = ed;
  return (
    <div className="var-contact" data-screen-label="editor-contacto">
      <p className="doc-hint">{t("editor.contactHint")}</p>
      {(["name", "email", "phone", "location"] as const).map((field) => {
        const eff = S(ed.basicsData, field);
        const overridden = field in ed.basicsOverride;
        return (
          <div className="cfield" key={field}>
            <label className="f" htmlFor={`c-${field}`}>
              {t(`editor.contact_${field}`)}
              {overridden && (
                <button type="button" className="crev" onClick={() => ed.revertContact(field)}>
                  {t("editor.contactRevert")}
                </button>
              )}
            </label>
            <input
              id={`c-${field}`}
              key={`c-${field}-${eff}`}
              className={"c-input" + (overridden ? " ovr" : "")}
              type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
              defaultValue={eff}
              spellCheck={false}
              placeholder={t(`editor.contact_${field}_ph`)}
              onBlur={(e) => ed.onContactBlur(field, e.target.value)}
            />
          </div>
        );
      })}

      <div className="cfield">
        <label className="f">
          {t("editor.contactLinks")}
          {"links" in ed.basicsOverride && (
            <button type="button" className="crev" onClick={() => ed.revertContact("links")}>
              {t("editor.contactRevert")}
            </button>
          )}
        </label>
        <div className="clinks">
          {ed.linkRows.map((r, i) => (
            <div className="clink" key={i}>
              <input
                className="c-input lbl"
                value={r.label}
                placeholder={t("editor.contactLinkLabel")}
                aria-label={t("editor.contactLinkLabel")}
                onChange={(e) => ed.updateLinkRow(i, "label", e.target.value)}
                onBlur={() => ed.commitLinks(ed.linkRows)}
              />
              <input
                className="c-input url"
                value={r.url}
                type="url"
                inputMode="url"
                placeholder={t("editor.contactLinkUrl")}
                aria-label={t("editor.contactLinkUrl")}
                onChange={(e) => ed.updateLinkRow(i, "url", e.target.value)}
                onBlur={() => ed.commitLinks(ed.linkRows)}
              />
              <button
                type="button"
                className="clink-rm"
                title={t("editor.contactRemoveLink")}
                aria-label={t("editor.contactRemoveLink")}
                onClick={() => ed.removeLinkRow(i)}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="caddlink" onClick={ed.addLinkRow}>
            + {t("editor.contactAddLink")}
          </button>
        </div>
      </div>
      <p className="note">{t("editor.contactSeedHint")}</p>
    </div>
  );
}

/** Diseño: plantilla (con su miniatura real y la galería) · paleta · tipografía. */
function Diseno({ ed }: { ed: Editor }) {
  const { t } = ed;
  return (
    <div className="var-design" data-screen-label="editor-diseno">
      <p className="doc-hint">{t("editor.designHint")}</p>
      <div className="cfield">
        <label className="f">{t("editor.designTemplate")}</label>
        <div className="tplrow">
          <TemplateThumb
            data={ed.resumeData}
            docHash={ed.thumbDocHash}
            templateId={ed.designTemplateId}
            paletteId={ed.designPaletteId}
            typographyId={ed.designTypographyId}
            alt={t("editor.gal_thumbAlt").replace("{name}", ed.activeTemplate.name)}
          />
          <div className="tplinfo">
            <span className="tplname">{ed.activeTemplate.name}</span>
            <span className="tpldesc">{ed.activeTemplate.description}</span>
            <button
              type="button"
              className="c-btn c-btn--quiet tplopen"
              aria-haspopup="dialog"
              onClick={() => ed.setGalleryOpen(true)}
            >
              {t("editor.designBrowse").replace("{n}", String(TEMPLATES.length))}
            </button>
          </div>
        </div>
        {ed.activeTemplate.warning ? (
          <p className="note warn">⚠ {ed.activeTemplate.warning}</p>
        ) : (
          <p className="note">{t("editor.designAtsNote")}</p>
        )}
      </div>

      <div className="cfield">
        <label className="f">{t("editor.designPalette")}</label>
        <div className="dchips">
          <button
            type="button"
            className="dchip"
            aria-pressed={ed.designPaletteId === ""}
            onClick={() => ed.savePresentation({ paletteId: null })}
          >
            {t("editor.designFromTemplate")}
          </button>
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              className="dchip"
              aria-pressed={ed.designPaletteId === p.id}
              onClick={() => ed.savePresentation({ paletteId: p.id })}
            >
              <span className="ddot" style={{ background: p.accent }} aria-hidden="true" />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="cfield">
        <label className="f">{t("editor.designTypography")}</label>
        <div className="dchips">
          <button
            type="button"
            className="dchip"
            aria-pressed={ed.designTypographyId === ""}
            onClick={() => ed.savePresentation({ typographyId: null })}
          >
            {t("editor.designFromTemplate")}
          </button>
          {TYPOGRAPHIES.map((ty) => (
            <button
              key={ty.id}
              type="button"
              className="dchip"
              aria-pressed={ed.designTypographyId === ty.id}
              onClick={() => ed.savePresentation({ typographyId: ty.id })}
            >
              {ty.name}
            </button>
          ))}
        </div>
        <p className="note">{t("editor.designNote")}</p>
      </div>
    </div>
  );
}

/** Orden de las secciones de ESTA variante (el preview, que ES el PDF, lo sigue). */
function Orden({ ed }: { ed: Editor }) {
  const { t } = ed;
  return (
    <div className="var-order" data-screen-label="editor-orden">
      <p className="doc-hint">{t("editor.orderHint")}</p>
      {/* Presets: los MISMOS órdenes que ya usan las plantillas del catálogo. */}
      <div className="cfield">
        <label className="f">{t("editor.orderPresets")}</label>
        <div className="dchips">
          {SECTION_ORDER_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="dchip"
              title={t(`editor.orderPreset_${p.id}_who`)}
              onClick={() => ed.applyOrderPreset(p.order)}
            >
              {t(`editor.orderPreset_${p.id}`)}
            </button>
          ))}
          {ed.orderIsCustom && (
            <button type="button" className="dchip" onClick={ed.resetOrder}>
              {t("editor.orderReset")}
            </button>
          )}
        </div>
        <p className="note">{t("editor.orderPresetsNote")}</p>
      </div>

      {/* La lista. `key={id}` no es decorativo: conserva el foco al mover.
          El tope de «subir» es la primera fila; el de «bajar», la última que
          NO está anclada — nadie puede empujar a las referencias del final. */}
      <ol className="ordlist" aria-label={t("editor.orderListAria")}>
        {ed.effectiveOrder.map((id, i, orden) => {
          const anclada = id === PINNED_LAST_SECTION;
          const nombre = t(LIB_TITLE_KEY[id]);
          const ultimaLibre = orden.length - (orden.includes(PINNED_LAST_SECTION) ? 2 : 1);
          return (
            <li className={"ordrow" + (anclada ? " pinned" : "")} key={id}>
              <span className="num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="tx">
                {nombre}
                {!ed.printedSections.has(id) && (
                  <em className="ordempty">{t("editor.orderEmpty")}</em>
                )}
                {anclada && <em className="ordpin">{t("editor.orderPinned")}</em>}
              </span>
              <span className="ordacts">
                <button
                  type="button"
                  aria-label={t("editor.orderUpAria").replace("{s}", nombre)}
                  disabled={anclada || i === 0}
                  onClick={() => ed.moveSection(id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={t("editor.orderDownAria").replace("{s}", nombre)}
                  disabled={anclada || i >= ultimaLibre}
                  onClick={() => ed.moveSection(id, 1)}
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="note">{t("editor.orderHeaderNote")}</p>
    </div>
  );
}

/** Presentación: foto · QR · referencias, todo opt-in por variante. */
function Presentacion({ ed }: { ed: Editor }) {
  const { t } = ed;
  return (
    <div className="var-pres" data-screen-label="editor-presentacion">
      <p className="doc-hint">{t("editor.presHint")}</p>
      {/* Foto — opt-in, versión visual. NUNCA el avatar de la cuenta. */}
      <div className="prow">
        <label className="ptog">
          <input
            type="checkbox"
            checked={ed.photoOn}
            aria-label={t("editor.photoOnAria")}
            onChange={(e) => ed.togglePhoto(e.target.checked)}
          />
          {t("editor.photoLabel")}
        </label>
        <input
          ref={ed.photoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => void ed.onPhotoFile(e.target.files?.[0] ?? null)}
        />
        {ed.photoOn && (
          <div className="pbody">
            <div className="photo-row">
              {isPhotoDataUrl(ed.photoUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="photo-thumb" alt={t("editor.photoAlt")} src={ed.photoUrl} />
              ) : null}
              <div className="photo-acts">
                <button type="button" className="c-btn c-btn--quiet" id="edFotoEncuadrar" onClick={ed.abrirEncuadre}>
                  {t("editor.encAbrir")}
                </button>
                <button
                  type="button"
                  className="c-btn c-btn--quiet"
                  aria-busy={ed.busyPhoto}
                  onClick={() => ed.photoInputRef.current?.click()}
                >
                  {t("editor.photoChange")}
                </button>
                <button type="button" className="c-btn c-btn--quiet" onClick={() => ed.togglePhoto(false)}>
                  {t("editor.photoRemove")}
                </button>
              </div>
            </div>
          </div>
        )}
        {ed.fotoEncuadre && (
          <EncuadreFoto
            key={ed.fotoEncuadre.src.length + ":" + ed.fotoEncuadre.src.slice(-24)}
            src={ed.fotoEncuadre.src}
            inicial={ed.fotoEncuadre.encuadre}
            t={t}
            onGuardar={ed.guardarEncuadre}
            onCancelar={() => ed.setFotoEncuadre(null)}
          />
        )}
        <p className="note">{t("editor.photoNote")}</p>
        {/* Lo que se sabe y lo que dice la ley chilena, separado y sin
            adornos: el empleador no puede EXIGIRLA, tú sí puedes ponerla. */}
        <p className="note">{t("editor.photoEvidence")}</p>
        <p className="note">{t("editor.photoLegalCl")}</p>
        <p className="note">{t("editor.photoAvatarNote")}</p>
      </div>

      {/* QR — opt-in. La URL va SIEMPRE también como texto (candado ATS). */}
      <div className="prow">
        <label className="ptog">
          <input
            type="checkbox"
            checked={ed.qrChecked}
            aria-label={t("editor.qrOnAria")}
            onChange={(e) => ed.toggleQr(e.target.checked)}
          />
          {t("editor.qrLabel")}
        </label>
        {ed.qrChecked && (
          <div className="pbody">
            <label className="f" htmlFor="qrMode">
              {t("editor.qrModeLabel")}
            </label>
            <select
              id="qrMode"
              className="c-input"
              value={ed.qrMode}
              onChange={(e) => ed.changeQrMode(e.target.value as "url" | "vcard")}
            >
              <option value="url">{t("editor.qrModeUrl")}</option>
              <option value="vcard">{t("editor.qrModeVcard")}</option>
            </select>

            {ed.qrMode === "vcard" ? (
              <p className="note">{t("editor.qrVcardNote")}</p>
            ) : (
              <>
                <label className="f" htmlFor="qrLink">
                  {t("editor.qrLinkLabel")}
                </label>
                {ed.linkOptions.length > 0 && (
                  <select
                    id="qrLink"
                    className="c-input"
                    value={ed.qrCustomMode ? "__custom__" : ed.qrUrl}
                    onChange={(e) => ed.onQrSelect(e.target.value)}
                  >
                    {ed.linkOptions.map((l) => (
                      <option key={l.url} value={l.url}>
                        {l.label ? `${l.label} — ${l.url}` : l.url}
                      </option>
                    ))}
                    <option value="__custom__">{t("editor.qrCustom")}</option>
                  </select>
                )}
                {(ed.qrCustomMode || ed.linkOptions.length === 0) && (
                  <input
                    className="c-input"
                    type="url"
                    inputMode="url"
                    placeholder={t("editor.qrCustomPlaceholder")}
                    defaultValue={ed.qrUrl}
                    onBlur={(e) => ed.onQrCustomInput(e.target.value)}
                  />
                )}
                {ed.linkOptions.length === 0 && <p className="note">{t("editor.qrNoLinks")}</p>}
              </>
            )}
          </div>
        )}
        <p className="note warn">{t("editor.qrNote")}</p>
        {/* Y cuándo NO sirve. El QR no se vende como ventaja: se dice en
            qué caso ayuda —el papel en la mano— y en cuál estorba. */}
        <p className="note">{t("editor.qrHonest")}</p>
      </div>

      {/* ⚠⚠ REFERENCIAS EN EL DOCUMENTO — opt-in POR VARIANTE, apagado por
          defecto y CONTRA LA COSTUMBRE LOCAL. Los dos motivos van a la
          vista, no en un tooltip: la convención internacional (no se
          imprimen, y tampoco se gasta una línea en «disponibles a
          solicitud») y el permiso de la persona, porque encenderlo saca su
          nombre, su correo y su teléfono impresos en el PDF. */}
      <div className="prow">
        <label className="ptog">
          <input
            type="checkbox"
            checked={ed.refsOn}
            aria-label={t("editor.refsOnAria")}
            onChange={(e) => ed.savePresentation({ showReferences: e.target.checked })}
          />
          {t("editor.refsLabel")}
        </label>
        <p className="note">{t("editor.refsWhyOff")}</p>
        <p className="note warn">{t("editor.refsConsent")}</p>
        {ed.refsOn && (
          <div className="pbody var-refbody">
            <p className="note">{t("editor.refsWhenOn")}</p>

            {/* HUECO ARREGLADO: si faltan las migraciones (o la lectura
                falló), se DICE — antes se tragaba con setRefs([]) y el
                usuario veía una biblioteca vacía sin ninguna pista. */}
            {(ed.refsMigracion || ed.refsError) && (
              <p className="note warn">{ed.refsMigracion ? t("editor.refsMigracion") : ed.refsError}</p>
            )}

            {!ed.refsMigracion && (
              <>
                {/* CUÁLES IMPRIME ESTA VARIANTE. La lista de referencias del
                    master con un toggle por fila: la variante decide cuáles
                    se imprimen, no cuáles existen. */}
                {ed.mReferences.length > 0 && (
                  <div className="refchooser">
                    <span className="t-overline">{t("editor.refChooserTitle")}</span>
                    {ed.mReferences.map((r) => {
                      const inV = ed.vItemByMaster.has(r.id);
                      return (
                        <div className={"refchoice" + (inV ? " in" : "")} key={r.id}>
                          <span className="tx">{referenceLine(r.data as ReferenceFields)}</span>
                          <button
                            type="button"
                            className="c-btn c-btn--quiet"
                            aria-pressed={inV}
                            onClick={() => void ed.toggleFromLib(r.id)}
                          >
                            {inV ? t("editor.removeFromVariant") : t("editor.addToVariant")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* EL FORMULARIO. Sin salir del editor, aunque el master no
                    tenga ninguna: si está vacío se muestra directo (en vez de
                    un vacío); si ya hay, un botón lo despliega para añadir
                    otra. Lo que crea ENTRA AL MASTER y a esta variante —el
                    master es la fuente, la variante no inventa datos sueltos. */}
                {ed.refFormOpen || ed.mReferences.length === 0 ? (
                  <div className="refform" data-screen-label="editor-ref-form">
                    <span className="t-overline">{t("editor.refFormTitle")}</span>
                    <p className="note">{t("editor.refFormHint")}</p>
                    {/* Datos de TERCEROS: el permiso, también aquí, no solo
                        bajo el interruptor. */}
                    <p className="note warn">{t("editor.refsConsent")}</p>

                    <label className="f" htmlFor="refFName">{t("editor.refFieldName")}</label>
                    <input
                      id="refFName"
                      className="c-input"
                      value={ed.refDraft.name ?? ""}
                      placeholder={t("editor.refFieldNamePh")}
                      onChange={(e) => ed.setRefDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                    <label className="f" htmlFor="refFRole">{t("editor.refFieldRole")}</label>
                    <input
                      id="refFRole"
                      className="c-input"
                      value={ed.refDraft.role ?? ""}
                      placeholder={t("editor.refFieldRolePh")}
                      onChange={(e) => ed.setRefDraft((d) => ({ ...d, role: e.target.value }))}
                    />
                    <label className="f" htmlFor="refFOrg">{t("editor.refFieldOrg")}</label>
                    <input
                      id="refFOrg"
                      className="c-input"
                      value={ed.refDraft.org ?? ""}
                      placeholder={t("editor.refFieldOrgPh")}
                      onChange={(e) => ed.setRefDraft((d) => ({ ...d, org: e.target.value }))}
                    />
                    <label className="f" htmlFor="refFRel">{t("editor.refFieldRelation")}</label>
                    <input
                      id="refFRel"
                      className="c-input"
                      value={ed.refDraft.relation ?? ""}
                      placeholder={t("editor.refFieldRelationPh")}
                      onChange={(e) => ed.setRefDraft((d) => ({ ...d, relation: e.target.value }))}
                    />
                    <label className="f" htmlFor="refFEmail">{t("editor.refFieldEmail")}</label>
                    <input
                      id="refFEmail"
                      className="c-input"
                      type="email"
                      inputMode="email"
                      value={ed.refDraft.email ?? ""}
                      placeholder={t("editor.refFieldEmailPh")}
                      onChange={(e) => ed.setRefDraft((d) => ({ ...d, email: e.target.value }))}
                    />
                    <label className="f" htmlFor="refFPhone">{t("editor.refFieldPhone")}</label>
                    <input
                      id="refFPhone"
                      className="c-input"
                      type="tel"
                      inputMode="tel"
                      value={ed.refDraft.phone ?? ""}
                      placeholder={t("editor.refFieldPhonePh")}
                      onChange={(e) => ed.setRefDraft((d) => ({ ...d, phone: e.target.value }))}
                    />

                    {ed.refFormErr && <p className="note warn refferr">{ed.refFormErr}</p>}
                    <div className="reffacts">
                      {ed.mReferences.length > 0 && (
                        <button
                          type="button"
                          className="c-btn c-btn--quiet"
                          onClick={() => {
                            ed.setRefFormOpen(false);
                            ed.setRefFormErr("");
                            ed.setRefDraft({});
                          }}
                        >
                          {t("editor.refFormCancel")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="c-btn c-btn--patina"
                        disabled={ed.refSaving}
                        onClick={() => void ed.createReferenceFromEditor()}
                      >
                        {t("editor.refFormSubmit")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="c-btn c-btn--quiet refform-open"
                    onClick={() => {
                      ed.setRefFormOpen(true);
                      ed.setRefFormErr("");
                    }}
                  >
                    {t("editor.refFormOpen")}
                  </button>
                )}
              </>
            )}

            {/* Encendido y sin ninguna referencia añadida: el documento no
                imprimirá la sección. Decirlo es la diferencia entre un
                interruptor honesto y uno que parece roto. */}
            {ed.refItems.length === 0 && !ed.refsMigracion && (
              <p className="note warn">{t("editor.refsNoneInVariant")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
