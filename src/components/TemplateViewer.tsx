"use client";

/* ============================================================================
   VISOR DE PLANTILLA — la hoja a tamaño de lectura, sin salir de la galería.

   ★ POR QUÉ EXISTE. La miniatura sirve para descartar (¿cabe mi volumen?, ¿qué
   forma tiene?), pero no para leer. Hasta ahora el único acercamiento era
   Ctrl+rueda sobre un PNG de 420px: se veía más grande y peor. Aquí se lee el
   cuerpo del CV.

   ★ LA REGLA QUE NO SE NEGOCIA, otra vez: esto NO es un segundo renderizador.
   El visor no sabe qué es /api/cv ni qué es pdf.js. Recibe `renderPages` como
   prop y pinta lo que le den. Quien lo implementa es la galería, con EXACTAMENTE
   el mismo pipeline de la miniatura (POST /api/cv → bytes → pdf.js), solo que
   rasterizando TODAS las páginas y a más resolución. Un solo motor de documento.

   ★ POR QUÉ RASTERIZAR Y NO EMBEBER EL PDF. Un <iframe> con el PDF nativo sería
   menos código, pero: cada navegador trae su propia barra (y su propio idioma),
   se traga el teclado —Esc, ← y → dejarían de ser nuestros—, no se puede
   maquetar y no comparte la cola ni la caché que ya existen. Rasterizar con el
   pdf.js que YA está cargado da control total del teclado y del zoom, y el
   píxel sigue saliendo del mismo PDF que se descarga.

   ★ ZOOM SIN VOLVER A RENDERIZAR. La página se rasteriza UNA vez a ~1100px CSS
   (por el DPR de la pantalla) y el zoom solo cambia el ancho en CSS. Acercar es
   instantáneo y no cuesta ni una petición. El precio: pasado ×2 el papel se
   ablanda un poco. Es el intercambio correcto — a ×2 ya se lee la letra pequeña.

   ★ ACCESIBILIDAD. role=dialog + aria-modal, foco atrapado dentro, el foco
   vuelve al botón que abrió el visor, y todo el movimiento vive bajo
   prefers-reduced-motion (aquí, además, el desplazamiento entre páginas deja de
   ser suave si el sistema lo pide).
   ============================================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import type { CvTemplate } from "@/lib/cv/templates";
import "./TemplateViewer.css";

/** Ancho de la hoja a zoom 1, en px CSS. ~860px deja el cuerpo de 10pt en unos
 *  14px de pantalla: se lee sentado, sin acercar la cara. */
const BASE_W = 860;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.2;

/** El motivo REAL de un fallo, en texto. Nunca "algo salió mal". */
const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * ¿Es un aborto (se cerró la galería o cambió el documento)? Se duplican estas
 * dos líneas a propósito: importarlas de TemplateGallery crearía un ciclo entre
 * los dos módulos, y este visor tiene que poder existir sin saber nada de ella.
 */
function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

/** ¿El sistema pide no mover nada? */
function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const FOCUSABLE = 'button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

export interface TemplateViewerProps {
  /** Las plantillas hojeables, EN EL MISMO ORDEN que la rejilla de la galería. */
  templates: CvTemplate[];
  /** Cuál se está mirando (índice en `templates`). */
  index: number;
  /** Cambiar de plantilla sin salir del visor (← →). */
  onIndex: (index: number) => void;
  onClose: () => void;
  /** Aplicar la plantilla que se está mirando. */
  onUse: (templateId: string) => void;
  /** La que ya está puesta en el documento: el botón lo dice en vez de mentir. */
  activeTemplateId: string;
  /**
   * TODAS las páginas del PDF de esa plantilla, como data-URL, en orden. La
   * implementa la galería con el mismo pipeline de la miniatura.
   */
  renderPages: (templateId: string) => Promise<string[]>;
}

export function TemplateViewer({
  templates,
  index,
  onIndex,
  onClose,
  onUse,
  activeTemplateId,
  renderPages,
}: TemplateViewerProps) {
  const t = useT();
  const tpl: CvTemplate | undefined = templates[index];
  const id = tpl?.id ?? "";

  const [pages, setPages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Quién abrió el visor. Al cerrar, el foco vuelve ahí y no al principio del documento. */
  const openerRef = useRef<HTMLElement | null>(null);

  // ── Foco: se recuerda al montar y se devuelve al desmontar ──
  useEffect(() => {
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const box = scrollRef.current;
    const raf = requestAnimationFrame(() => box?.focus());
    return () => {
      cancelAnimationFrame(raf);
      // `isConnected`: si la tarjeta que lo abrió ya no existe (cambió el filtro),
      // no se fuerza el foco a un nodo muerto.
      const back = openerRef.current;
      if (back && back.isConnected) back.focus();
    };
  }, []);

  // ── Las páginas de ESTA plantilla ──
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setBusy(true);
    setError("");
    setPages([]);
    setPage(0);
    void renderPages(id).then(
      (urls) => {
        if (!alive) return;
        setPages(urls);
        setBusy(false);
      },
      (e: unknown) => {
        if (!alive) return;
        // Un aborto no es un fallo: la galería se cerró o cambiaron tus datos.
        if (isAbortError(e)) return;
        console.error("[visor] no se pudieron rasterizar las páginas", id, e);
        setError(reason(e));
        setBusy(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [id, retry, renderPages]);

  // Al cambiar de plantilla el scroll vuelve arriba: si no, la plantilla nueva
  // aparecería empezada por la mitad y parecería otra cosa.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [id]);

  const go = useCallback(
    (delta: number) => {
      if (templates.length < 2) return;
      // Circular: comparar la última con la primera no debería obligar a salir.
      const next = (index + delta + templates.length) % templates.length;
      onIndex(next);
    },
    [index, templates.length, onIndex],
  );

  const bump = useCallback((delta: number) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100)));
  }, []);

  /** Lleva la vista a una página. Sin `smooth` si el sistema pide no mover nada. */
  const goPage = useCallback((n: number) => {
    const box = scrollRef.current;
    if (!box) return;
    const el = box.querySelector<HTMLElement>(`[data-page="${n}"]`);
    if (!el) return;
    box.scrollTo({ top: el.offsetTop, behavior: reducedMotion() ? "auto" : "smooth" });
    setPage(n);
  }, []);

  /** El contador de páginas no adivina: sale de dónde está el scroll de verdad. */
  const onScroll = useCallback(() => {
    const box = scrollRef.current;
    if (!box) return;
    const kids = box.querySelectorAll<HTMLElement>("[data-page]");
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    kids.forEach((el, i) => {
      const d = Math.abs(el.offsetTop - box.scrollTop);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setPage((p) => (p === best ? p : best));
  }, []);

  // ── Teclado. En CAPTURA para que la galería que hay debajo no vea el Escape
  //    y se cierren las dos de un golpe. ──
  useEffect(() => {
    const trap = (e: KeyboardEvent) => {
      const root = dialogRef.current;
      if (!root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      // Fuera del diálogo (o en el borde): el foco vuelve dentro. Eso es la trampa.
      if (!active || !root.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return; // Ctrl +/− es el zoom del navegador
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onClose();
          return;
        case "ArrowRight":
          e.preventDefault();
          e.stopPropagation();
          go(1);
          return;
        case "ArrowLeft":
          e.preventDefault();
          e.stopPropagation();
          go(-1);
          return;
        case "+":
        case "=":
          e.preventDefault();
          bump(ZOOM_STEP);
          return;
        case "-":
        case "_":
          e.preventDefault();
          bump(-ZOOM_STEP);
          return;
        case "0":
          e.preventDefault();
          setZoom(1);
          return;
        case "Tab":
          trap(e);
          return;
        default:
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [go, bump, onClose]);

  const active = !!tpl && tpl.id === activeTemplateId;
  const total = pages.length;
  const style = useMemo(
    () => ({ "--tv-zoom": String(zoom), "--tv-base": `${BASE_W}px` }) as React.CSSProperties,
    [zoom],
  );

  if (!tpl) return null;

  return (
    <div
      className="tv-veil"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={style}
    >
      <div
        className="tv-panel c-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("editor.tv_title").replace("{name}", tpl.name)}
        data-screen-label="visor-plantilla"
        ref={dialogRef}
      >
        <header className="tv-head">
          <span className="tv-name">
            {tpl.name}
            <span className={"tv-gama" + (tpl.gama === "visual" ? " is-visual" : "")}>
              {t(`editor.gal_gama_${tpl.gama}`)}
            </span>
          </span>
          <span className="tv-desc">{tpl.description}</span>
          <span className="tv-pos">
            {t("editor.tv_pos").replace("{n}", String(index + 1)).replace("{m}", String(templates.length))}
          </span>
          <button type="button" className="c-btn c-btn--quiet tv-close" onClick={onClose}>
            {t("editor.tv_close")}
          </button>
        </header>

        {/* El aviso de la gama visual también se LEE aquí: si se elige desde el
            visor, se elige con la misma información que en la tarjeta. */}
        {tpl.warning && (
          <p className="tv-warn" role="note">
            ⚠ {tpl.warning}
          </p>
        )}

        {/* Las hojas. Con tabIndex el contenedor recibe el foco al abrir, así las
            flechas ↑ ↓ y la rueda desplazan el documento desde el primer segundo
            (← → son de la plantilla: no se pisan). */}
        <div
          className="tv-pages"
          ref={scrollRef}
          onScroll={onScroll}
          tabIndex={0}
          role="group"
          aria-label={t("editor.tv_pagesRegion")}
        >
          {pages.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${id}-${i}`}
              className="tv-sheet"
              data-page={i}
              src={url}
              draggable={false}
              alt={t("editor.tv_pageAlt")
                .replace("{n}", String(i + 1))
                .replace("{name}", tpl.name)}
            />
          ))}
          {busy && (
            // El rótulo va FUERA del esqueleto: .c-skel pinta el texto en
            // transparente (es su forma de simular contenido), y aquí el rótulo
            // es lo único que hay que leer mientras se espera.
            <div className="tv-wait" aria-live="polite">
              <span className="tv-sheet tv-sheet--wait c-skel" aria-hidden="true" />
              <span className="tv-waitt">{t("editor.tv_building")}</span>
            </div>
          )}
          {error && (
            <div className="tv-fail" role="alert">
              <span className="tv-failt">{t("editor.tv_failed")}</span>
              <span className="tv-failw">{error}</span>
              <button type="button" className="c-btn" onClick={() => setRetry((n) => n + 1)}>
                {t("editor.tv_retry")}
              </button>
            </div>
          )}
          {!busy && !error && total === 0 && <p className="tv-none">{t("editor.tv_noPages")}</p>}
        </div>

        <footer className="tv-bar">
          <div className="tv-grp">
            <button
              type="button"
              className="tv-nav"
              onClick={() => go(-1)}
              aria-label={t("editor.tv_prev")}
              title={t("editor.tv_prev")}
              disabled={templates.length < 2}
            >
              ‹
            </button>
            <button
              type="button"
              className="tv-nav"
              onClick={() => go(1)}
              aria-label={t("editor.tv_next")}
              title={t("editor.tv_next")}
              disabled={templates.length < 2}
            >
              ›
            </button>
          </div>

          <div className="tv-grp" aria-live="polite">
            <button
              type="button"
              className="tv-nav"
              onClick={() => goPage(Math.max(0, page - 1))}
              aria-label={t("editor.tv_pagePrev")}
              title={t("editor.tv_pagePrev")}
              disabled={page <= 0}
            >
              ↑
            </button>
            <span className="tv-pager">
              {t("editor.tv_page")
                .replace("{a}", String(total ? page + 1 : 0))
                .replace("{b}", String(total))}
            </span>
            <button
              type="button"
              className="tv-nav"
              onClick={() => goPage(Math.min(total - 1, page + 1))}
              aria-label={t("editor.tv_pageNext")}
              title={t("editor.tv_pageNext")}
              disabled={page >= total - 1}
            >
              ↓
            </button>
          </div>

          <div className="tv-grp">
            <button
              type="button"
              className="tv-nav"
              onClick={() => bump(-ZOOM_STEP)}
              aria-label={t("editor.tv_zoomOut")}
              title={t("editor.tv_zoomOut")}
              disabled={zoom <= ZOOM_MIN}
            >
              −
            </button>
            <button
              type="button"
              className="tv-zoomv"
              onClick={() => setZoom(1)}
              aria-label={t("editor.tv_zoomReset")}
              title={t("editor.tv_zoomReset")}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="tv-nav"
              onClick={() => bump(ZOOM_STEP)}
              aria-label={t("editor.tv_zoomIn")}
              title={t("editor.tv_zoomIn")}
              disabled={zoom >= ZOOM_MAX}
            >
              +
            </button>
          </div>

          <p className="tv-keys">{t("editor.tv_keys")}</p>

          <button
            type="button"
            className="c-btn c-btn--forge tv-use"
            onClick={() => onUse(tpl.id)}
            aria-pressed={active}
          >
            {active ? t("editor.tv_inUse") : t("editor.tv_use")}
          </button>
        </footer>
      </div>
    </div>
  );
}
