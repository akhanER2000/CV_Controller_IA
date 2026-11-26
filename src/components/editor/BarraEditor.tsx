// Sin "use client": solo lo importa la pantalla del editor (ya cliente).
import Link from "next/link";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { GuiaAjuste, PanelAjuste } from "@/components/FlujoCv";
import { Progreso, type ProgresoProps } from "@/components/ui/Progreso";
import { AfinarIA } from "./AfinarIA";
import { useAfinar } from "./useAfinar";
import { useAjusteUnClic, type AjusteUnClic } from "./useAjusteUnClic";
import { Desplegable, Kbd } from "./Desplegable";
import { ATAJOS, TECLA } from "./atajos";
import { alternarOculto } from "./vista-previa";
import { IconoEd } from "./iconos";
import { OBJETIVOS } from "./modelo";
import type { Editor } from "./useEditorVariante";

/* ============================================================================
   BARRA DEL EDITOR — dos filas que envuelven sin cortar.
     1 · qué variante es: volver, el nombre (editable en línea), el guardado y
         las acciones principales (Adaptar · Descargar PDF); lo secundario
         (Salud, eliminar, atajos) va en «Más».
     2 · el documento: páginas objetivo, UN chip de estado con su detalle
         desplegable, «Ajustar páginas», el hueco reservado para las acciones de
         IA (lo llena el lote siguiente) y las vistas (biblioteca · vista previa).
   Los avisos de páginas viven en el detalle del chip, no sobre la vista previa.

   LA BARRA NO SE MUEVE: lo que cambia de texto mientras algo carga (el chip de
   estado) nunca encoge (useSinEncoger), «Ajustar páginas» va en AnchoFijo, «Afinar con IA» es un
   botón de ancho fijo con su panel anclado, y el progreso va en UN indicador
   flotante (ui/Progreso) que no ocupa sitio en la barra.
   ============================================================================ */

export function BarraEditor({ ed }: { ed: Editor }) {
  const { t, meta, variantId, objetivo, pageCount } = ed;
  const af = useAfinar(ed);
  const aj = useAjusteUnClic(ed);
  const barra = useRef<HTMLDivElement>(null);
  // «.flu-ajustar» ya no hace falta: su etiqueta va en <AnchoFijo> (DA-EE3, DA-AC4).
  // «#edState» tampoco encoge: un aviso largo que caduca («presentación guardada…»)
  // dejaba la fila 1 más baja en móvil y corría la barra entera.
  useSinEncoger(barra, ["#edEstado", "#edState"], t);
  const progreso = useProgresoBarra(ed, af, aj);
  // Lo que antes se pintaba en rojo sobre el PDF: aquí, dentro del detalle.
  const avisos: string[] = [];
  if (pageCount >= 3 && objetivo < 3) avisos.push(t("editor.pagesWarn").replace("{n}", String(pageCount)));
  if (objetivo === 3) avisos.push(t("editor.obj3Note"));

  return (
    <div className="ed-bar" data-screen-label="editor-toolbar" ref={barra}>
      <div className="ed-bar-a">
        <Link className="bk" href="/app/variantes">
          {t("editor.backToVariants")}
        </Link>
        <span
          key={meta?.id ?? "nm"}
          className="nm"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          aria-label={t("editor.nameAria")}
          title={t("editor.edNombreHint")}
          onBlur={ed.onNameBlur}
        >
          {meta?.name ?? t("editor.defaultVariantName")}
        </span>
        <span className="st" id="edState" role="status" data-flash={ed.stAccent ? "" : undefined}>
          {ed.stMsg || t("editor.stIdle")}
        </span>
        <span className="acts">
          <AyudaAtajos ed={ed} />
          <Link className="c-btn c-btn--quiet" href={`/app/variantes/${variantId}/tailor`}>
            {t("common.tailor")}
          </Link>
          <button
            type="button"
            className="c-btn c-btn--patina"
            id="btnPdf"
            disabled={ed.pdfBusy}
            aria-busy={ed.pdfBusy}
            onClick={() => void ed.downloadPdf()}
          >
            <IconoEd nombre="descargar" /> {t("common.downloadPdf")}
          </button>
          <Desplegable
            abierto={ed.masAbierto}
            onCambiar={(v) => {
              ed.setMasAbierto(v);
              if (!v) ed.setConfirmDelete(false);
            }}
            lado="der"
            ancho={300}
            botonId="edMas"
            botonClase="c-btn c-btn--quiet ed-mas"
            botonEtiqueta={t("editor.edMasAria")}
            boton={
              <>
                {t("editor.edMas")} <span aria-hidden="true">▾</span>
              </>
            }
          >
            <div className="ed-menu">
              <Link href={`/app/variantes/${variantId}/salud`}>{t("common.health")}</Link>
              <span className="ed-menu-sep" aria-hidden="true" />
              {ed.confirmDelete ? (
                <span className="ed-delconfirm" role="group" aria-label={t("editor.deleteConfirm")}>
                  <span className="q">{t("editor.deleteConfirm")}</span>
                  <button type="button" className="c-btn c-btn--quiet" onClick={() => ed.setConfirmDelete(false)}>
                    {t("editor.deleteCancel")}
                  </button>
                  <button type="button" className="c-btn ed-del-yes" onClick={() => void ed.doDeleteVariant()}>
                    {t("editor.deleteYes")}
                  </button>
                </span>
              ) : (
                <button type="button" className="ed-del-btn" onClick={() => ed.setConfirmDelete(true)}>
                  {t("editor.deleteVariant")}
                </button>
              )}
            </div>
          </Desplegable>
        </span>
      </div>

      <div className="ed-bar-b">
        {/* Páginas objetivo. El documento se autoajusta (cuerpo ≥ 10 pt) a ESTE
            número; si no cabe ni así, el chip lo dice y «Ajustar páginas» propone. */}
        <div className="ed-obj" role="group" aria-label={t("editor.objAria")} id="pvObjetivo">
          <span className="lbl" aria-hidden="true">
            {t("editor.edPaginas")}
          </span>
          {OBJETIVOS.map((n) => (
            <button key={n} type="button" aria-pressed={objetivo === n} onClick={() => ed.elegirObjetivo(n)}>
              {n === 1 ? t("editor.edSeg1") : t("editor.edSegN").replace("{n}", String(n))}
            </button>
          ))}
        </div>
        <GuiaAjuste
          estado={ed.estado}
          paginas={pageCount}
          objetivo={objetivo}
          autofit={ed.autofitInfo}
          paginasTxt={ed.paginasTxt}
          huecos={ed.faltas.length}
          huecosTipo={ed.huecosTipo}
          pendientes={ed.pendientes}
          fit={ed.fit}
          busy={ed.fitBusy || aj.busy}
          err={ed.fitErr}
          notasIA={ed.notasIA}
          avisos={avisos}
          // UN CLIC (DA-A4): el servidor prueba todas las plantillas, la plantilla a
          // medida y por último los recortes, y APLICA la primera que cabe.
          onProponer={aj.ajustar}
          onSiguiente={ed.irASiguiente}
          ia={<AfinarIA ed={ed} af={af} />}
          panel={
            <PanelAjuste
              aj={aj}
              objetivo={objetivo}
              paginasTxt={ed.paginasTxt}
              onRevisar={() => {
                // «Revisar uno por uno»: la propuesta item a item de siempre (una
                // llamada al modelo); las decisiones aparecen bajo cada item.
                aj.cerrar();
                ed.setView("mid");
                ed.runFit();
              }}
            />
          }
        />
        <span className="ed-bar-sp" />
        <button
          type="button"
          className="ed-tog"
          aria-pressed={ed.libAbierta}
          aria-controls="edLib"
          title={t("editor.edBibliotecaAria")}
          onClick={() => ed.setLibAbierta((v) => !v)}
        >
          <IconoEd nombre="biblioteca" /> {t("editor.edBiblioteca")} <span className="n">{ed.libCount}</span>{" "}
          <Kbd>{TECLA.biblioteca}</Kbd>
        </button>
        <button
          type="button"
          className="ed-tog ed-tog--pv"
          aria-pressed={ed.pvModo !== "oculto"}
          title={ed.pvModo === "oculto" ? t("editor.edPvMostrar") : t("editor.edPvOcultar")}
          onClick={() => ed.pvCambiar(alternarOculto(ed.pvModo))}
        >
          <IconoEd nombre="documento" /> {t("editor.edPv")} <Kbd>{TECLA.preview}</Kbd>
        </button>
      </div>
      <Progreso id="edProgreso" {...progreso} />
    </div>
  );
}

/**
 * Lo que está cargando AHORA en el editor, en pasos reales (DA-A2). Uno a la vez,
 * por prioridad: descarga del PDF · afinar (llamada → la vista previa mide el
 * resultado) · ajustar páginas · plantilla/paleta (la vista previa se rehace).
 * El único porcentaje es el de «Probando las plantillas» del ajuste: plantillas
 * medidas / plantillas a medir, que el servidor cuenta de verdad.
 */
function useProgresoBarra(ed: Editor, af: ReturnType<typeof useAfinar>, aj: AjusteUnClic): ProgresoProps {
  const { t } = ed;
  // El primer paso de afinar se recuerda para el segundo (la vista previa midiendo).
  const paso1 = useRef("");
  if (af.busy === "skills") paso1.current = t("editor.progRespaldo");
  else if (af.busy === "respaldo" || af.busy === "revertir" || af.busy === "modo") paso1.current = t("editor.progAplicar");
  else if (af.busy) paso1.current = t("editor.progAfinar");
  const medir = t("editor.progMedir");

  if (ed.pdfBusy) return { activo: true, etiqueta: t("editor.progPdf") };
  if (af.busy) return { activo: true, pasos: [paso1.current, medir], paso: 0 };
  if (ed.pvSigue?.motivo === "afinar") return { activo: true, pasos: [paso1.current || t("editor.progAfinar"), medir], paso: 1 };
  if (aj.busy) {
    const p = aj.progreso ?? { paso: 0 };
    const pasos = [t("ajuste.progMedir"), t("ajuste.progPlantillas"), t("ajuste.progMedida"), t("ajuste.progRecortes")];
    const pc = p.paso === 1 && p.total ? Math.round(((p.hechas ?? 0) / p.total) * 100) : null;
    return { activo: true, pasos, paso: p.paso, porcentaje: pc };
  }
  if (ed.fitBusy) return { activo: true, etiqueta: t("editor.progAjustar") };
  if (ed.pvSigue?.motivo === "diseno") return { activo: true, etiqueta: t("editor.progDiseno") };
  return { activo: false };
}

/**
 * Lo que cambia de texto mientras algo carga NO encoge: cada elemento recuerda su
 * ancho mayor y lo fija como min-width, así lo que va detrás no se corre. Se
 * reinicia al cambiar el idioma (otro texto, otro ancho).
 */
function useSinEncoger(raiz: RefObject<HTMLElement | null>, selectores: readonly string[], reinicio: unknown) {
  const sel = selectores.join(",");
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const objetivos = Array.from(el.querySelectorAll<HTMLElement>(sel));
    const max = new Map<HTMLElement, number>();
    for (const o of objetivos) o.style.minWidth = "";
    const ro = new ResizeObserver((entradas) => {
      for (const e of entradas) {
        const o = e.target as HTMLElement;
        const w = o.getBoundingClientRect().width;
        if (w > (max.get(o) ?? 0) + 0.5) {
          max.set(o, w);
          o.style.minWidth = `${Math.ceil(w)}px`;
        }
      }
    });
    for (const o of objetivos) ro.observe(o);
    return () => ro.disconnect();
  }, [raiz, sel, reinicio]);
}

/** La ayuda de atajos: «?» la abre (también la tecla ?), Esc la cierra. */
function AyudaAtajos({ ed }: { ed: Editor }) {
  const { t } = ed;
  return (
    <Desplegable
      abierto={ed.atajosAbierto}
      onCambiar={ed.setAtajosAbierto}
      lado="der"
      ancho={300}
      botonId="edAyuda"
      botonClase="ed-tog ed-tog--ico"
      botonEtiqueta={t("editor.edAtajosAria")}
      botonTitulo={t("editor.edAtajosAria")}
      boton={<Kbd>?</Kbd>}
    >
      <div className="ed-atajos" id="edAtajos">
        <span className="t-overline">{t("editor.edAtajosAria")}</span>
        <dl>
          {ATAJOS.map((a) => (
            <div key={a.accion}>
              <dt>
                <Kbd>{a.tecla}</Kbd>
              </dt>
              <dd>{t(a.clave)}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">{t("editor.edAtajosNota")}</p>
      </div>
    </Desplegable>
  );
}
