// Sin "use client": lógica pura + dos ayudantes de navegador (canvas), sin JSX.
import { PHOTO_RATIO } from "@/lib/cv/templates";

/* ============================================================================
   ENCUADRE DE LA FOTO — la cuenta, sin UI (EncuadreFoto.tsx la pinta).
   El marco tiene la proporción de la foto del CV (PHOTO_RATIO = alto/ancho,
   3,5 × 4,5 cm). Con zoom 1 el recorte es el rectángulo MÁS GRANDE de esa
   proporción que cabe en la imagen; con zoom z, ese rectángulo / z. El centro
   (cx, cy) va en fracción de la imagen (0–1) y siempre se limita para que el
   recorte no se salga: nunca hay bandas vacías en el PDF.
   Lo que se guarda: la imagen recortada (la que lee el PDF) y, aparte, el
   ORIGINAL con estos parámetros, para volver a encuadrar sin perder nada.
   ============================================================================ */

export interface Encuadre {
  zoom: number;
  cx: number;
  cy: number;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
/** Paso del teclado: +/− cambian el zoom en esto; las flechas mueven esta fracción del recorte. */
export const PASO_ZOOM = 0.1;
export const PASO_MOVER = 0.02;
export const PASO_MOVER_GRANDE = 0.1;

/** Píxeles de la foto recortada que se guarda: 12 px/mm sobre 35 × 45 mm. */
export const SALIDA_ANCHO = 420;
export const SALIDA_ALTO = Math.round(SALIDA_ANCHO * PHOTO_RATIO);

export const ENCUADRE_INICIAL: Encuadre = { zoom: 1, cx: 0.5, cy: 0.5 };

const limite = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** El recorte a zoom 1 (en px de la imagen): el mayor rectángulo de la proporción del CV. */
function recorteBase(w: number, h: number): { cw: number; ch: number } {
  const aspecto = 1 / PHOTO_RATIO; // ancho / alto del marco
  return w / h > aspecto ? { cw: h * aspecto, ch: h } : { cw: w, ch: w / aspecto };
}

/** El encuadre válido más cercano: zoom en [1, 4] y el recorte dentro de la imagen. */
export function limitar(w: number, h: number, e: Encuadre): Encuadre {
  const zoom = limite(Number.isFinite(e.zoom) ? e.zoom : 1, ZOOM_MIN, ZOOM_MAX);
  const { cw, ch } = recorteBase(w, h);
  const mx = cw / zoom / 2 / w;
  const my = ch / zoom / 2 / h;
  return {
    zoom: Math.round(zoom * 1000) / 1000,
    cx: limite(Number.isFinite(e.cx) ? e.cx : 0.5, mx, 1 - mx),
    cy: limite(Number.isFinite(e.cy) ? e.cy : 0.5, my, 1 - my),
  };
}

/** El rectángulo de la imagen (px) que sale en la foto. */
export function recorte(w: number, h: number, e: Encuadre): { sx: number; sy: number; sw: number; sh: number } {
  const v = limitar(w, h, e);
  const { cw, ch } = recorteBase(w, h);
  const sw = cw / v.zoom;
  const sh = ch / v.zoom;
  return { sx: v.cx * w - sw / 2, sy: v.cy * h - sh / 2, sw, sh };
}

/** Mover el recorte: dx, dy en fracción del RECORTE (0.02 = un 2 % de lo que se ve). */
export function mover(w: number, h: number, e: Encuadre, dx: number, dy: number): Encuadre {
  const { sw, sh } = recorte(w, h, e);
  return limitar(w, h, { ...e, cx: e.cx + (dx * sw) / w, cy: e.cy + (dy * sh) / h });
}

/** Cambiar el zoom manteniendo el centro. */
export function zoomA(w: number, h: number, e: Encuadre, zoom: number): Encuadre {
  return limitar(w, h, { ...e, zoom });
}

/** Lo que llega de la base: un encuadre utilizable o null (nunca lanza). */
export function leerEncuadre(raw: unknown): { src: string; encuadre: Encuadre } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const src = typeof r.src === "string" ? r.src : "";
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(src)) return null;
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return { src, encuadre: { zoom: n(r.zoom, 1), cx: n(r.cx, 0.5), cy: n(r.cy, 0.5) } };
}

/** Validación del servidor (misma regla que la foto: data-URL de imagen y tope de tamaño). */
export function encuadreValido(raw: unknown): string | null {
  const v = leerEncuadre(raw);
  if (!v) return "El original de la foto debe ser una imagen (PNG, JPG o WEBP).";
  if (!/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/]+=*$/i.test(v.src)) return "El original de la foto no es una imagen válida.";
  if (v.src.length > 900_000) return "El original de la foto es demasiado pesado.";
  const { zoom, cx, cy } = v.encuadre;
  if (zoom < ZOOM_MIN || zoom > ZOOM_MAX || cx < 0 || cx > 1 || cy < 0 || cy > 1) return "Parámetros de encuadre fuera de rango.";
  return null;
}

// ── Navegador ────────────────────────────────────────────────────────────────

export function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("el navegador no pudo decodificar la imagen"));
    im.src = src;
  });
}

/**
 * El ORIGINAL que se guarda para volver a encuadrar: reducido a 1280 px de lado
 * (suficiente para hacer zoom ×4 sobre una foto de 35 mm) y bajo el tope del
 * servidor; si pesa más, se baja la calidad y luego el tamaño.
 */
export async function archivoAOriginal(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error(`no se pudo leer el archivo "${file.name}"`));
    r.readAsDataURL(file);
  });
  const img = await cargarImagen(dataUrl).catch(() => {
    throw new Error(`el navegador no pudo decodificar la imagen (${file.type || "tipo desconocido"})`);
  });
  for (const [lado, q] of [[1280, 0.88], [1280, 0.75], [960, 0.75], [720, 0.7]] as const) {
    const s = Math.min(1, lado / Math.max(img.width || 1, img.height || 1));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round((img.width || 1) * s));
    c.height = Math.max(1, Math.round((img.height || 1) * s));
    const ctx = c.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/jpeg", q);
    if (out.length <= 880_000) return out;
  }
  throw new Error("la imagen es demasiado pesada incluso reducida");
}

/** La foto RECORTADA (la que lee el PDF), con la proporción exacta del CV. */
export function recortarFoto(img: HTMLImageElement, e: Encuadre): string {
  const { sx, sy, sw, sh } = recorte(img.naturalWidth, img.naturalHeight, e);
  const c = document.createElement("canvas");
  c.width = SALIDA_ANCHO;
  c.height = SALIDA_ALTO;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("el navegador no tiene canvas 2D");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SALIDA_ANCHO, SALIDA_ALTO);
  return c.toDataURL("image/jpeg", 0.9);
}
