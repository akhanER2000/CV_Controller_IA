// Sin "use client": solo lo importa el editor (ya cliente).
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { PHOTO_RATIO } from "@/lib/cv/templates";
import type { TKey } from "@/lib/i18n";
import {
  ENCUADRE_INICIAL,
  PASO_MOVER,
  PASO_MOVER_GRANDE,
  PASO_ZOOM,
  ZOOM_MAX,
  ZOOM_MIN,
  cargarImagen,
  limitar,
  mover,
  recortarFoto,
  recorte,
  zoomA,
  type Encuadre,
} from "./encuadre";
import "./encuadre.css";

/* ============================================================================
   ENCUADRAR LA FOTO — un <dialog> modal (foco atrapado y Esc los da el
   navegador). El marco tiene la proporción del CV; dentro, la imagen se
   arrastra y se acerca. Teclado: flechas mueven (Mayús = más), + y − acercan y
   alejan, 0 vuelve al encuadre inicial. «Guardar» entrega la foto recortada y
   los parámetros; el original no se toca.
   ============================================================================ */

const MARCO_ANCHO = 240;
const MARCO_ALTO = Math.round(MARCO_ANCHO * PHOTO_RATIO);

export function EncuadreFoto({
  src,
  inicial,
  t,
  onGuardar,
  onCancelar,
}: {
  src: string;
  inicial: Encuadre | null;
  t: (k: TKey) => string;
  onGuardar: (foto: string, encuadre: Encuadre) => void;
  onCancelar: () => void;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [err, setErr] = useState("");
  const [enc, setEnc] = useState<Encuadre>(inicial ?? ENCUADRE_INICIAL);
  const arrastre = useRef<{ x: number; y: number; e: Encuadre } | null>(null);

  useEffect(() => {
    const d = dlg.current;
    if (d && !d.open) d.showModal();
    let vivo = true;
    cargarImagen(src)
      .then((im) => {
        if (!vivo) return;
        setImg(im);
        setEnc((e) => limitar(im.naturalWidth, im.naturalHeight, e));
        marco.current?.focus();
      })
      .catch((e: unknown) => vivo && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [src]);

  const w = img?.naturalWidth ?? 1;
  const h = img?.naturalHeight ?? 1;
  const r = recorte(w, h, enc);
  const escala = MARCO_ANCHO / r.sw;

  const onTecla = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!img) return;
      const paso = e.shiftKey ? PASO_MOVER_GRANDE : PASO_MOVER;
      let next: Encuadre | null = null;
      // Flecha a la derecha = ver más de la derecha (el recorte va hacia allá).
      if (e.key === "ArrowLeft") next = mover(w, h, enc, -paso, 0);
      else if (e.key === "ArrowRight") next = mover(w, h, enc, paso, 0);
      else if (e.key === "ArrowUp") next = mover(w, h, enc, 0, -paso);
      else if (e.key === "ArrowDown") next = mover(w, h, enc, 0, paso);
      else if (e.key === "+" || e.key === "=") next = zoomA(w, h, enc, enc.zoom + PASO_ZOOM);
      else if (e.key === "-" || e.key === "_") next = zoomA(w, h, enc, enc.zoom - PASO_ZOOM);
      else if (e.key === "0") next = limitar(w, h, ENCUADRE_INICIAL);
      if (next) {
        e.preventDefault();
        setEnc(next);
      }
    },
    [img, w, h, enc],
  );

  const onBajar = (e: PointerEvent<HTMLDivElement>) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { x: e.clientX, y: e.clientY, e: enc };
  };
  const onMover = (e: PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a || !img) return;
    // El marco ES el recorte: un desplazamiento de su ancho = un recorte entero.
    // Arrastrar la imagen a la derecha muestra lo que está a su izquierda.
    setEnc(mover(w, h, a.e, -(e.clientX - a.x) / MARCO_ANCHO, -(e.clientY - a.y) / MARCO_ALTO));
  };
  const onSoltar = () => {
    arrastre.current = null;
  };

  const guardar = () => {
    if (!img) return;
    try {
      onGuardar(recortarFoto(img, enc), limitar(w, h, enc));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const pct = Math.round(enc.zoom * 100);

  return (
    <dialog
      ref={dlg}
      className="edx-enc"
      aria-labelledby="edEncT"
      aria-describedby="edEncAyuda"
      onCancel={(e) => {
        e.preventDefault();
        onCancelar();
      }}
    >
      <h2 className="edx-enc-t" id="edEncT">
        {t("editor.encTitulo")}
      </h2>
      <p className="edx-enc-ayuda" id="edEncAyuda">
        {t("editor.encAyuda")}
      </p>
      <div
        ref={marco}
        className="edx-enc-marco"
        id="edEncMarco"
        role="application"
        aria-roledescription={t("editor.encMarcoRol")}
        aria-label={t("editor.encMarcoAria").replace("{z}", String(pct))}
        tabIndex={0}
        style={{ width: MARCO_ANCHO, height: MARCO_ALTO }}
        data-zoom={enc.zoom}
        data-cx={Math.round(enc.cx * 1000) / 1000}
        data-cy={Math.round(enc.cy * 1000) / 1000}
        onKeyDown={onTecla}
        onPointerDown={onBajar}
        onPointerMove={onMover}
        onPointerUp={onSoltar}
        onPointerCancel={onSoltar}
      >
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            draggable={false}
            style={{ width: w * escala, height: h * escala, left: -r.sx * escala, top: -r.sy * escala }}
          />
        )}
        {!img && !err && <span className="edx-enc-carga">{t("editor.encCargando")}</span>}
      </div>
      <label className="edx-enc-zoom">
        <span>{t("editor.encZoom")}</span>
        <input
          type="range"
          id="edEncZoom"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={PASO_ZOOM}
          value={enc.zoom}
          disabled={!img}
          aria-valuetext={`${pct} %`}
          onChange={(e) => setEnc(zoomA(w, h, enc, Number(e.target.value)))}
        />
        <span className="v" aria-hidden="true">
          {pct} %
        </span>
      </label>
      {err && (
        <p className="edx-enc-err" role="alert">
          {err}
        </p>
      )}
      <div className="edx-enc-acts">
        <button type="button" className="c-btn c-btn--quiet" disabled={!img} onClick={() => setEnc(limitar(w, h, ENCUADRE_INICIAL))}>
          {t("editor.encReset")}
        </button>
        <span className="sp" />
        <button type="button" className="c-btn c-btn--quiet" id="edEncCancelar" onClick={onCancelar}>
          {t("editor.encCancelar")}
        </button>
        <button type="button" className="c-btn c-btn--patina" id="edEncGuardar" disabled={!img} onClick={guardar}>
          {t("editor.encGuardar")}
        </button>
      </div>
    </dialog>
  );
}
