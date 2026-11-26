"use client";

import { AuroraTune, AURORA_TRABAJO } from "@/components/Aurora";
import { BarraEditor } from "@/components/editor/BarraEditor";
import { Biblioteca } from "@/components/editor/Biblioteca";
import { DocumentoPanel } from "@/components/editor/DocumentoPanel";
import { Secciones } from "@/components/editor/Secciones";
import { Divisor, VistaPrevia } from "@/components/editor/VistaPrevia";
import { useEditorVariante } from "@/components/editor/useEditorVariante";
import "./editor-variante.css";
import "@/components/editor/editor.css";

/* ============================================================================
   Editor de variante — LA PANTALLA MÁS IMPORTANTE (Forja v2 · editor-integral).

   Esta pantalla SOLO COMPONE. El estado y cada manejador viven en
   useEditorVariante (src/components/editor/), el modelo puro en editor/modelo.ts
   y cada zona es su componente:

     BarraEditor    nombre · guardado · Adaptar · Descargar PDF · Más
                    páginas objetivo · UN chip de estado con detalle · Ajustar
                    páginas · hueco «acciones de IA» · vistas
     Biblioteca     el master en pestañas por tipo, buscador y filtro (cajón)
     Secciones      la variante en tarjetas, edición en línea, navegación fija
     DocumentoPanel contacto · diseño · orden · presentación (pestañas) + galería
     VistaPrevia    el PDF real y «Cómo lo lee el ATS»; ancho, ocultar, completa

   ★ EL PREVIEW ES EL PDF: POST /api/cv (`as:'preview'`) → <iframe>; Descargar
   manda EL MISMO body. Cada acción persiste contra el contrato de siempre
   (POST/DELETE/PATCH /api/variants/[id]/items, PATCH /api/variants/[id],
   POST …/ajustar). En modo local sin Supabase, la maqueta (Diego Gatica).
   ============================================================================ */

// Lo puro sigue exportándose desde aquí: los tests lo importan de la pantalla.
export {
  buildEditorResumeData,
  computeLibPlan,
  forcedOpenSections,
  libSectionOfKind,
  libSectionOpen,
  libTextOf,
  loadFoldedFrom,
  saveFoldedTo,
  LIB_FOLD_KEY,
  LIB_SECTIONS,
  type EditorDocInput,
  type LibGroupPlan,
  type LibRowPlan,
  type LibSectionId,
} from "@/components/editor/modelo";

export function EditorVarianteScreen({
  variantId = "editor",
}: { variantId?: string } = {}) {
  const ed = useEditorVariante(variantId);
  const { t, view, setView } = ed;
  return (
    <div className="c-page ed-page" ref={ed.pageRef}>
      {/* La pantalla más densa del producto: el humo al mínimo perceptible. */}
      <AuroraTune strength={AURORA_TRABAJO} />
      <BarraEditor ed={ed} />

      {/* Estrecho (≤1024 px): una columna; estas pestañas eligen qué se ve (la biblioteca, en el flujo, reemplaza a las otras dos). */}
      <div className="ed-tabs" role="group" aria-label={t("editor.tabsAria")}>
        <button
          type="button"
          data-view="master"
          aria-pressed={ed.libAbierta}
          onClick={() => ed.setLibAbierta((v) => !v)}
        >
          {t("editor.tabMaster")}
        </button>
        <button
          type="button"
          data-view="mid"
          aria-pressed={!ed.libAbierta && view === "mid"}
          onClick={() => {
            ed.setLibAbierta(false);
            setView("mid");
          }}
        >
          {t("editor.tabThis")}
        </button>
        <button
          type="button"
          data-view="preview"
          aria-pressed={!ed.libAbierta && view === "preview"}
          onClick={() => {
            ed.setLibAbierta(false);
            setView("preview");
          }}
        >
          {t("editor.tabPreview")}
        </button>
      </div>

      <div
        className="ed-grid c-wall"
        id="edGrid"
        data-view={view}
        data-lib={ed.libAbierta ? "abierta" : "cerrada"}
        data-pv={ed.pvModo}
        data-screen-label="editor-paneles"
        ref={ed.bootRef}
        style={{ ["--pv-w" as string]: `${ed.pvAncho}px` }}
      >
        {ed.libAbierta && <Biblioteca ed={ed} />}
        <Secciones ed={ed} documento={<DocumentoPanel ed={ed} />} />
        <Divisor ed={ed} />
        <VistaPrevia ed={ed} />
      </div>
    </div>
  );
}
