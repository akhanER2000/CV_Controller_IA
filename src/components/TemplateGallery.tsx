"use client";

/* ============================================================================
   GALERÍA DE PLANTILLAS — el selector cómodo. Miniaturas que SON el PDF.

   ★ LA REGLA QUE NO SE NEGOCIA. Aquí NO hay un segundo renderizador. La
   miniatura es la PÁGINA 1 DEL PDF REAL, rasterizada. El pipeline entero es:

       POST /api/cv { data }  →  bytes del PDF (el MISMO motor y el MISMO
                                 contrato que usa el preview y la descarga)
       pdf.js en el navegador →  página 1 a un <canvas> → data-URL

   No hay HTML paralelo, no hay "aproximación", no hay un dibujo del documento.
   Si la miniatura miente, el PDF miente — y entonces el bug está en el motor, no
   aquí. Esa es exactamente la propiedad que costó recuperar cuando existían dos
   motores y salía "[object Object]".

   ★ Y SE RENDERIZA CON TUS DATOS. Nada de lorem ipsum: treinta miniaturas de
   relleno son treinta miniaturas indistinguibles. Con tu contenido real, la
   miniatura te dice de un vistazo cuál aguanta TU volumen — que es la decisión
   de verdad, no el color del filete.

   ★ RENDIMIENTO (el riesgo real: 30 renders de PDF en el servidor).
     · BAJO DEMANDA — solo se pide lo que entra en pantalla (IntersectionObserver
       con 240px de margen), con esqueleto (.c-skel del sistema) mientras llega.
     · CACHÉ en memoria con clave (templateId · paletteId · typographyId · hash
       del documento). El hash NO incluye los campos de diseño, así que cambiar de
       plantilla no invalida nada; cambiar tus datos invalida todo, solo.
     · COLA con concurrencia 3: el servidor renderiza de tres en tres, no de
       treinta en treinta.
     · CANCELACIÓN — un AbortController por "generación" (apertura × documento).
       Al cerrar la galería o al cambiar el documento se aborta lo que vuela y se
       ignora lo que llegue tarde. Ninguna respuesta obsoleta pinta nada.
     · PRE-RENDER de las recomendadas (las que ya se ven primero).
   ============================================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { useAurora } from "@/lib/corpus/runtime";
import type { ResumeData } from "@/lib/cv/resume";
import {
  TEMPLATE_TAGS,
  tagsOf,
  templatesByTags,
  type CvTemplate,
  type TemplateTag,
} from "@/lib/cv/templates";
import { reasonById, type Recommendation, type RecommendReason } from "@/lib/cv/recommend";
import { TemplateViewer } from "./TemplateViewer";
import "./TemplateGallery.css";

// ── Motor de la miniatura ────────────────────────────────────────────────────

/** Ancho de rasterizado en px CSS. La rejilla la muestra a ~200px y la barra de
 *  comparación a este tamaño: un solo raster sirve a los dos. */
const THUMB_W = 420;
/** Tope de densidad: por encima de 1.5 el PNG pesa el doble y no se nota. */
const DPR_MAX = 1.5;
/** Ancho de rasterizado del VISOR, en px CSS. La hoja se muestra a ~860px y el
 *  zoom llega a ×2: con 1100px (por el DPR, hasta ×2) la letra aguanta el
 *  acercamiento sin volver a pedir nada al servidor. */
const VIEW_W = 1100;
const VIEW_DPR_MAX = 2;
/** Cuántos PDF se piden a la vez. El cuello de botella es el render del servidor. */
const MAX_PARALLEL = 3;
/** Cuántas miniaturas se guardan (LRU). ~40 páginas rasterizadas es memoria sana. */
const CACHE_MAX = 40;
/** Cuántos documentos completos se guardan. Son PNG grandes: seis, no cuarenta. */
const PAGES_MAX = 6;

/** clave → data-URL de la página 1. Vive fuera de React: sobrevive a cerrar la galería. */
const CACHE = new Map<string, string>();
/** clave → TODAS las páginas, a tamaño de lectura (el visor). Caché aparte: la
 *  miniatura y el documento entero no pesan ni se desalojan igual. */
const PAGES = new Map<string, string[]>();
/** clave → motivo del fallo. Un fallo cacheado evita el bucle de reintentos; el
 *  botón "reintentar" lo borra. Los abortos NUNCA entran aquí. */
const FAILED = new Map<string, string>();
/** clave → petición en vuelo. Dos tarjetas con la misma clave comparten UNA petición. */
const INFLIGHT = new Map<string, Promise<string>>();
const PAGES_INFLIGHT = new Map<string, Promise<string[]>>();

/** LRU genérico: recordar mueve la clave al final y desaloja por el principio. */
function remembering<T>(store: Map<string, T>, max: number) {
  return (key: string, value: T): void => {
    store.delete(key);
    store.set(key, value);
    while (store.size > max) {
      const oldest = store.keys().next();
      if (oldest.done) break;
      store.delete(oldest.value);
    }
  };
}

const remember = remembering(CACHE, CACHE_MAX);
const rememberPages = remembering(PAGES, PAGES_MAX);

// Cola de concurrencia. Sin librería: es una lista de "te toca".
let running = 0;
const waiting: (() => void)[] = [];
function acquire(): Promise<void> {
  if (running < MAX_PARALLEL) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiting.push(resolve));
}
function release(): void {
  const next = waiting.shift();
  if (next) next();
  else running = Math.max(0, running - 1);
}

type PdfjsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfjsModule> | null = null;

/**
 * pdf.js, cargado UNA vez y en el navegador. Import dinámico a propósito: pesa, y
 * quien nunca abre la galería no debería pagarlo en el bundle inicial. Una sola
 * instancia (y un solo worker) sirve a las treinta miniaturas.
 */
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist")
      .then((lib) => {
        // El worker se resuelve por el bundler (`new URL(..., import.meta.url)`),
        // que es la forma soportada en Next/webpack. Sin esto, pdf.js intenta
        // levantar un "fake worker" y falla en un bundle.
        lib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        return lib;
      })
      .catch((e: unknown) => {
        // Si la carga falla, no dejamos la promesa rota cacheada para siempre:
        // el siguiente intento vuelve a probar.
        pdfjsPromise = null;
        throw e;
      });
  }
  return pdfjsPromise;
}

/** El motivo REAL de un fallo, en texto. Nunca "algo salió mal". */
const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** ¿Es un aborto nuestro (cerrar la galería / cambiar el documento)? */
function isAbort(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

/** Motivo legible de una respuesta HTTP fallida: /api/cv devuelve { error }. */
async function readApiError(res: Response): Promise<string> {
  let raw = "";
  try {
    raw = await res.text();
  } catch (e) {
    console.error("[galería] no se pudo leer el cuerpo del error", e);
  }
  if (raw) {
    try {
      const j = JSON.parse(raw) as { error?: unknown };
      if (typeof j?.error === "string" && j.error.trim()) return j.error.trim();
    } catch {
      /* no era JSON: el texto crudo ya es el motivo */
    }
    return raw.slice(0, 240);
  }
  return `HTTP ${res.status}`;
}

/**
 * Hash 32-bit (FNV-1a) del documento. Es la parte de la clave de caché que hace
 * que la miniatura CADUQUE SOLA cuando cambian tus datos: no hay que acordarse de
 * invalidar nada en ningún sitio.
 */
export function hashDoc(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** La clave: diseño + documento. Cambia cualquiera de los cuatro y la miniatura se rehace. */
function thumbKey(templateId: string, paletteId: string, typographyId: string, docHash: string): string {
  return `${templateId}|${paletteId}|${typographyId}|${docHash}`;
}

/**
 * El hash del documento a partir de su firma, SIN los campos de diseño. Que la
 * plantilla elegida quedara dentro haría que cada clic invalidara las otras 29
 * miniaturas — treinta PDF por clic. Vive aquí, exportado, para que el editor y la
 * galería usen exactamente el mismo hash (dos hashes distintos = dos cachés).
 */
export function docHashFromSig(docSig: string): string {
  try {
    const parsed = JSON.parse(docSig) as Record<string, unknown>;
    delete parsed.templateId;
    delete parsed.paletteId;
    delete parsed.typographyId;
    return hashDoc(JSON.stringify(parsed));
  } catch (e) {
    // Firma ilegible: se hashea tal cual. Peor caché, misma verdad.
    console.error("[galería] firma del documento ilegible", e);
    return hashDoc(docSig);
  }
}

/**
 * Los BYTES del PDF de ESTE documento. Mismo endpoint, mismo motor y mismo
 * contrato que el preview grande y que la descarga: aquí no hay un segundo
 * renderizador ni una "aproximación".
 */
async function fetchPdf(body: unknown, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) throw new DOMException("cancelado", "AbortError");
  const res = await fetch("/api/cv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Los BYTES del PDF (as por defecto): ni la miniatura ni el visor necesitan
    // el rayos-X, y así el servidor no re-parsea 30 documentos.
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Rasteriza páginas de un PDF a data-URL PNG, en orden. `count` = 0 → todas.
 * Una sola función para la miniatura y para el visor: si la hoja del visor y la
 * de la rejilla salieran de dos rasterizadores distintos, un día dejarían de ser
 * la misma hoja.
 */
async function rasterize(
  bytes: Uint8Array,
  cssWidth: number,
  dprMax: number,
  count: number,
): Promise<string[]> {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: bytes }).promise;
  try {
    const total = count > 0 ? Math.min(count, doc.numPages) : doc.numPages;
    const dpr = Math.min(dprMax, globalThis.devicePixelRatio || 1);
    const out: string[] = [];
    for (let n = 1; n <= total; n += 1) {
      const page = await doc.getPage(n);
      const unit = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (cssWidth * dpr) / unit.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      // pdf.js pinta el fondo blanco del papel por sí mismo (background por
      // defecto #ffffff): el canvas queda idéntico a la hoja.
      await page.render({ canvas, viewport }).promise;
      out.push(canvas.toDataURL("image/png"));
      // Soltar el bitmap: a 2200px una página son ~27MB en memoria de vídeo, y
      // el data-URL ya está fuera. Sin esto, hojear diez plantillas se nota.
      canvas.width = 0;
      canvas.height = 0;
    }
    return out;
  } finally {
    void doc.destroy();
  }
}

/**
 * Pide el PDF de ESTA plantilla con ESTOS datos y devuelve la página 1 como
 * data-URL.
 */
async function renderThumb(
  key: string,
  body: unknown,
  signal: AbortSignal,
): Promise<string> {
  const hit = CACHE.get(key);
  if (hit) return hit;
  const flying = INFLIGHT.get(key);
  if (flying) return flying;

  const job = (async () => {
    await acquire();
    try {
      const bytes = await fetchPdf(body, signal);
      const [url] = await rasterize(bytes, THUMB_W, DPR_MAX, 1);
      if (!url) throw new Error("el PDF salió sin páginas");
      remember(key, url);
      return url;
    } finally {
      release();
      INFLIGHT.delete(key);
    }
  })();

  INFLIGHT.set(key, job);
  return job;
}

/**
 * TODAS las páginas del documento, a tamaño de lectura. Es lo que consume el
 * visor: el MISMO pipeline de la miniatura (misma cola, misma dedupe, mismo
 * endpoint), solo que sin cortar en la página 1 y a más resolución.
 */
async function renderDocPages(
  key: string,
  body: unknown,
  signal: AbortSignal,
): Promise<string[]> {
  const hit = PAGES.get(key);
  if (hit) return hit;
  const flying = PAGES_INFLIGHT.get(key);
  if (flying) return flying;

  const job = (async () => {
    await acquire();
    try {
      const bytes = await fetchPdf(body, signal);
      const urls = await rasterize(bytes, VIEW_W, VIEW_DPR_MAX, 0);
      if (urls.length) rememberPages(key, urls);
      return urls;
    } finally {
      release();
      PAGES_INFLIGHT.delete(key);
    }
  })();

  PAGES_INFLIGHT.set(key, job);
  return job;
}

// ── Hook de una miniatura ────────────────────────────────────────────────────

interface ThumbState {
  url: string;
  error: string;
  busy: boolean;
}

/**
 * Una miniatura. `enabled` es la puerta perezosa: mientras la tarjeta no se ve, no
 * se pide nada. La caché se consulta de forma SÍNCRONA en el primer render, así
 * volver a abrir la galería no parpadea con esqueletos que ya estaban listos.
 */
function useThumb(key: string, body: unknown, enabled: boolean, signal: AbortSignal | null) {
  const [state, setState] = useState<ThumbState>(() => ({
    url: CACHE.get(key) ?? "",
    error: FAILED.get(key) ?? "",
    busy: false,
  }));
  const [retry, setRetry] = useState(0);
  // El cuerpo cambia de identidad en cada render (es un objeto literal); la clave
  // no. Un ref deja que el efecto dependa SOLO de la clave.
  const bodyRef = useRef(body);
  bodyRef.current = body;

  // Al cambiar la clave (otra paleta, otros datos) el estado se ajusta EN EL
  // RENDER, no en el efecto: si se dejara al efecto habría un fotograma con la
  // miniatura anterior bajo el rótulo nuevo — una hoja que ya no es esa hoja.
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setState({ url: CACHE.get(key) ?? "", error: FAILED.get(key) ?? "", busy: false });
  }

  useEffect(() => {
    const cached = CACHE.get(key);
    if (cached) {
      setState((s) => (s.url === cached && !s.busy ? s : { url: cached, error: "", busy: false }));
      return;
    }
    const failed = FAILED.get(key);
    if (failed) {
      setState((s) => (s.error === failed && !s.busy ? s : { url: "", error: failed, busy: false }));
      return;
    }
    if (!enabled || !signal) {
      setState((s) => (!s.url && !s.error && !s.busy ? s : { url: "", error: "", busy: false }));
      return;
    }
    let alive = true;
    setState({ url: "", error: "", busy: true });
    void (async () => {
      try {
        const url = await renderThumb(key, bodyRef.current, signal);
        // GUARDA DE CARRERA: si el componente se fue o la generación se abortó,
        // el resultado se descarta (ya está en la caché para la próxima vez).
        if (!alive || signal.aborted) return;
        setState({ url, error: "", busy: false });
      } catch (e) {
        if (isAbort(e) || signal.aborted) return; // cancelado: no es un fallo
        const why = reason(e);
        FAILED.set(key, why);
        console.error("[galería] no se pudo rasterizar la miniatura", key, e);
        if (alive) setState({ url: "", error: why, busy: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, [key, enabled, signal, retry]);

  const again = useCallback(() => {
    FAILED.delete(key);
    setRetry((n) => n + 1);
  }, [key]);

  return { ...state, again };
}

/** ¿Está a la vista? Se queda en `true` para siempre: una vez pedida, no se vuelve atrás. */
function useSeen<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true); // sin observador, mejor pedirlo que dejar un hueco gris
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

// ── Piezas de presentación ───────────────────────────────────────────────────

/** El cuerpo que se le manda a /api/cv para UNA plantilla. */
function bodyFor(
  data: ResumeData,
  templateId: string,
  paletteId: string,
  typographyId: string,
): { data: ResumeData } {
  return {
    data: {
      ...data,
      templateId,
      // "" = la de la plantilla → undefined, que es lo que resolveTemplate espera.
      paletteId: paletteId || undefined,
      typographyId: typographyId || undefined,
    },
  };
}

interface ShotProps {
  thumbKey: string;
  body: unknown;
  enabled: boolean;
  signal: AbortSignal | null;
  alt: string;
  labels: { building: string; failed: string; retry: string };
}

/** La hoja: el PNG de la página 1, o el esqueleto, o el motivo del fallo. Nunca un hueco mudo. */
function Shot({ thumbKey: key, body, enabled, signal, alt, labels }: ShotProps) {
  const { url, error, busy, again } = useThumb(key, body, enabled, signal);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="tg-sheet" src={url} alt={alt} draggable={false} />;
  }
  if (error) {
    return (
      <span className="tg-sheet tg-sheet--fail" role="note">
        <span className="tg-failt">{labels.failed}</span>
        <span className="tg-failw">{error}</span>
        <button
          type="button"
          className="tg-failr"
          onClick={(e) => {
            e.stopPropagation();
            again();
          }}
        >
          {labels.retry}
        </button>
      </span>
    );
  }
  return (
    <span className={"tg-sheet tg-sheet--wait" + (busy || enabled ? " c-skel" : "")} aria-hidden="true">
      <span className="tg-waitt">{busy ? labels.building : ""}</span>
    </span>
  );
}

/**
 * La miniatura suelta, para la tarjeta «Diseño» del editor: la misma clave y la
 * misma caché que la galería, así abrirla ya encuentra hecha la de la activa.
 */
export function TemplateThumb({
  data,
  docHash,
  templateId,
  paletteId,
  typographyId,
  alt,
}: {
  data: ResumeData;
  docHash: string;
  templateId: string;
  paletteId: string;
  typographyId: string;
  alt: string;
}) {
  const t = useT();
  const [ref, seen] = useSeen<HTMLSpanElement>();
  // Vive fuera de una "generación": esta miniatura no se cancela al cerrar nada.
  const controller = useRef<AbortController | null>(null);
  if (!controller.current) controller.current = new AbortController();
  const key = thumbKey(templateId, paletteId, typographyId, docHash);
  const body = bodyFor(data, templateId, paletteId, typographyId);
  return (
    <span className="tg-mini" ref={ref}>
      <Shot
        thumbKey={key}
        body={body}
        enabled={seen}
        signal={controller.current.signal}
        alt={alt}
        labels={{
          building: t("editor.gal_building"),
          failed: t("editor.gal_thumbFailed"),
          retry: t("editor.gal_retry"),
        }}
      />
    </span>
  );
}

// ── Atmósfera ────────────────────────────────────────────────────────────────

/**
 * La aurora, SOLO mientras se hojea. El editor es un MURO y no la monta: ahí se
 * trabaja. La galería y el visor son otra cosa —se pasan páginas, se mira— y ahí
 * la atmósfera es información: dice «esto no es la mesa de trabajo».
 *
 * Al cerrar se DUERME el shader (`pause`), no se desmonta: el runtime vanilla no
 * sabe desmontar, y dejar un WebGL corriendo detrás de un muro opaco sería pagar
 * una animación que nadie ve. Con prefers-reduced-motion el runtime ya cae al
 * fallback estático y pause/resume no hacen nada: misma atmósfera, cero movimiento.
 *
 * (El componente se monta y desmonta con el diálogo, por eso los hooks pueden
 * vivir dentro sin condicionales.)
 */
function Atmosphere() {
  useAurora("calm");
  useEffect(() => {
    window.CorpusAurora?.resume("corpus-hojeo");
    return () => window.CorpusAurora?.pause("corpus-hojeo");
  }, []);
  return null;
}

// ── La galería ───────────────────────────────────────────────────────────────

export interface TemplateGalleryProps {
  open: boolean;
  onClose: () => void;
  /** El catálogo (listTemplates()). Nunca ids fijos: hoy 5, mañana 35. */
  templates: CvTemplate[];
  activeTemplateId: string;
  /** "" = la paleta / la pareja de la plantilla. */
  paletteId: string;
  typographyId: string;
  /** Paletas y parejas del catálogo, para cambiarlas SIN salir de la galería. */
  palettes: { id: string; name: string; accent: string }[];
  typographies: { id: string; name: string }[];
  /** El documento REAL del usuario: el mismo que se manda al preview grande. */
  data: ResumeData;
  /** Firma del documento (JSON del ResumeData). De aquí sale el hash de la clave. */
  docSig: string;
  recommendations: Recommendation[];
  onPickTemplate: (templateId: string) => void;
  onPickPalette: (paletteId: string) => void;
  onPickTypography: (typographyId: string) => void;
}

type GamaFilter = "all" | "ats" | "visual";

export function TemplateGallery({
  open,
  onClose,
  templates,
  activeTemplateId,
  paletteId,
  typographyId,
  palettes,
  typographies,
  data,
  docSig,
  recommendations,
  onPickTemplate,
  onPickPalette,
  onPickTypography,
}: TemplateGalleryProps) {
  const t = useT();
  const [tags, setTags] = useState<TemplateTag[]>([]);
  const [gama, setGama] = useState<GamaFilter>("all");
  const [onlyRecommended, setOnlyRecommended] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  /** Qué plantilla está AMPLIADA (null = ninguna). Se guarda el id y no el índice:
   *  el índice caduca en cuanto cambia un filtro; el id no. */
  const [zoomed, setZoomed] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // ── Generación: una por (apertura × documento). Al cerrar o al cambiar los
  //    datos se aborta lo que vuela; lo que llegue tarde se ignora. ──
  const [generation, setGeneration] = useState<AbortController | null>(null);
  useEffect(() => {
    if (!open) {
      setGeneration(null);
      return;
    }
    const ctrl = new AbortController();
    setGeneration(ctrl);
    return () => ctrl.abort();
  }, [open, docSig]);

  const docHash = useMemo(() => docHashFromSig(docSig), [docSig]);

  // Cerrar con Escape y llevar el foco al botón de cerrar al abrir.
  // Con el visor abierto, el Escape es SUYO: si no, una tecla cerraría las dos
  // cosas de golpe y se perdería la galería entera por querer salir de una hoja.
  // (El visor además escucha en captura y detiene la propagación; esta guarda es
  // la que hace que eso no dependa del orden en que se registraron los oyentes.)
  const zoomOpen = zoomed !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (zoomOpen) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, zoomOpen]);

  // El foco entra al abrir, y SOLO al abrir: si esto dependiera del visor, abrir
  // una hoja ampliada le robaría el foco a su propio diálogo.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => closeRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Al cerrar, la comparación y la ampliación se limpian: son estado de sesión,
  // no preferencias.
  useEffect(() => {
    if (!open) {
      setCompare([]);
      setZoomed(null);
    }
  }, [open]);

  const whyById = useMemo(() => reasonById(recommendations), [recommendations]);
  const recOrder = useMemo(
    () => new Map(recommendations.map((r, i) => [r.templateId, i])),
    [recommendations],
  );

  // Etiquetas que EXISTEN en el catálogo, en el orden del vocabulario cerrado. Un
  // filtro por una etiqueta que nadie lleva es un filtro que solo sabe vaciar.
  const availableTags = useMemo(() => {
    const present = new Set<TemplateTag>();
    for (const tpl of templates) for (const tag of tagsOf(tpl)) present.add(tag);
    return TEMPLATE_TAGS.filter((tag) => present.has(tag));
  }, [templates]);

  const visible = useMemo(() => {
    // templatesByTags aplica la semántica Y (todas las etiquetas pedidas) sobre el
    // catálogo vivo — el mismo del que sale la prop `templates`.
    let list = tags.length ? templatesByTags(tags) : templates;
    if (gama !== "all") list = list.filter((tpl) => tpl.gama === gama);
    if (onlyRecommended) list = list.filter((tpl) => recOrder.has(tpl.id));
    // Las recomendadas primero y en su orden; el resto, en el orden del catálogo.
    const rank = (tpl: CvTemplate) => recOrder.get(tpl.id) ?? Number.MAX_SAFE_INTEGER;
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [templates, tags, gama, onlyRecommended, recOrder]);

  // PRE-RENDER de las recomendadas: se piden al abrir aunque aún no se hayan
  // cruzado con el observador. Son 6-8, no 30.
  useEffect(() => {
    if (!open || !generation) return;
    const signal = generation.signal;
    for (const rec of recommendations.slice(0, 8)) {
      const key = thumbKey(rec.templateId, paletteId, typographyId, docHash);
      if (CACHE.has(key) || FAILED.has(key) || INFLIGHT.has(key)) continue;
      void renderThumb(key, bodyFor(data, rec.templateId, paletteId, typographyId), signal).catch(
        (e: unknown) => {
          if (!isAbort(e) && !signal.aborted) {
            console.error("[galería] pre-render de una recomendada falló", rec.templateId, e);
          }
        },
      );
    }
    // `data` cambia de identidad con cada render del editor; docHash es su firma
    // estable, y es lo que de verdad decide si hay que rehacer algo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, generation, recommendations, paletteId, typographyId, docHash]);

  // El documento cambia de IDENTIDAD en cada render del editor pero no de
  // contenido (docHash es su firma estable). Con un ref, `renderPages` solo se
  // rehace cuando de verdad cambia algo, y el visor no recarga la hoja por un
  // render de más.
  const dataRef = useRef(data);
  dataRef.current = data;

  /**
   * El puente galería → visor. El visor NO sabe qué es /api/cv ni qué es pdf.js:
   * pide "las páginas de esta plantilla" y aquí se le dan, con el mismo pipeline
   * (misma cola, misma dedupe, misma clave) que la miniatura. Un solo motor.
   */
  const renderPages = useCallback(
    (templateId: string): Promise<string[]> => {
      const signal = generation?.signal;
      if (!signal) return Promise.reject(new DOMException("cancelado", "AbortError"));
      return renderDocPages(
        thumbKey(templateId, paletteId, typographyId, docHash),
        bodyFor(dataRef.current, templateId, paletteId, typographyId),
        signal,
      );
    },
    [generation, paletteId, typographyId, docHash],
  );

  const toggleTag = useCallback((tag: TemplateTag) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }, []);

  const toggleCompare = useCallback((id: string) => {
    setCompare((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Dos a la vez: comparar tres es no comparar.
      return [...prev, id].slice(-2);
    });
  }, []);

  /** La razón, redactada. El módulo puro devuelve datos; el diccionario los dice. */
  const sayReason = useCallback(
    (why: RecommendReason): string =>
      t(`editor.gal_why_${why.code}`)
        .replace("{n}", String(why.n))
        .replace("{m}", String(why.m ?? 0)),
    [t],
  );

  if (!open) return null;

  const comparing = compare
    .map((id) => templates.find((tpl) => tpl.id === id))
    .filter((tpl): tpl is CvTemplate => !!tpl);

  // El visor hojea LA MISMA lista que se está viendo (filtros y orden incluidos):
  // las flechas recorren lo que hay en pantalla, no un catálogo paralelo. Si la
  // ampliada ya no está en la lista, el visor simplemente no se monta.
  const zoomAt = zoomed ? visible.findIndex((tpl) => tpl.id === zoomed) : -1;

  const ui = (
    <div className="tg-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Atmosphere />
      <div
        className="tg-panel c-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("editor.gal_title")}
        data-screen-label="galeria-plantillas"
        // Con el visor delante, la galería queda INERTE: fuera del recorrido del
        // tabulador y fuera del árbol de accesibilidad. Es lo que evita que un
        // lector de pantalla siga leyendo treinta tarjetas por detrás de la hoja
        // que se está mirando.
        inert={zoomOpen}
      >
        <header className="tg-head">
          <span className="t-overline">{t("editor.gal_title")}</span>
          <span className="tg-count">
            {t("editor.gal_count").replace("{n}", String(visible.length)).replace("{m}", String(templates.length))}
          </span>
          <button type="button" className="c-btn c-btn--quiet tg-close" ref={closeRef} onClick={onClose}>
            {t("editor.gal_done")}
          </button>
        </header>

        {/* Filtros. La gama es un campo propio (no una etiqueta); las etiquetas son
            el vocabulario CERRADO de templates.ts, traducido, nunca inventado. */}
        <div className="tg-filters">
          <div className="tg-seg" role="group" aria-label={t("editor.gal_gamaAria")}>
            {(["all", "ats", "visual"] as const).map((g) => (
              <button key={g} type="button" aria-pressed={gama === g} onClick={() => setGama(g)}>
                {t(`editor.gal_gama_${g}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="tg-chip tg-chip--rec"
            aria-pressed={onlyRecommended}
            onClick={() => setOnlyRecommended((v) => !v)}
          >
            ★ {t("editor.gal_onlyRecommended")}
          </button>
          {availableTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="tg-chip"
              aria-pressed={tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {t(`editor.gal_tag_${tag}`)}
            </button>
          ))}
          {(tags.length > 0 || gama !== "all" || onlyRecommended) && (
            <button
              type="button"
              className="tg-clear"
              onClick={() => {
                setTags([]);
                setGama("all");
                setOnlyRecommended(false);
              }}
            >
              {t("editor.gal_clearFilters")}
            </button>
          )}
        </div>

        {/* Paleta y pareja tipográfica AQUÍ dentro: se cambian y las 30 miniaturas
            se rehacen con el cambio puesto. Es la única forma de decidir mirando. */}
        <div className="tg-design">
          <span className="tg-dlabel">{t("editor.gal_palette")}</span>
          <div className="tg-swatches">
            <button
              type="button"
              className="tg-sw"
              aria-pressed={paletteId === ""}
              onClick={() => onPickPalette("")}
            >
              {t("editor.gal_fromTemplate")}
            </button>
            {palettes.map((p) => (
              <button
                key={p.id}
                type="button"
                className="tg-sw"
                aria-pressed={paletteId === p.id}
                onClick={() => onPickPalette(p.id)}
              >
                <span className="tg-dot" style={{ background: p.accent }} aria-hidden="true" />
                {p.name}
              </button>
            ))}
          </div>
          <span className="tg-dlabel">{t("editor.gal_typography")}</span>
          <div className="tg-swatches">
            <button
              type="button"
              className="tg-sw"
              aria-pressed={typographyId === ""}
              onClick={() => onPickTypography("")}
            >
              {t("editor.gal_fromTemplate")}
            </button>
            {typographies.map((ty) => (
              <button
                key={ty.id}
                type="button"
                className="tg-sw"
                aria-pressed={typographyId === ty.id}
                onClick={() => onPickTypography(ty.id)}
              >
                {ty.name}
              </button>
            ))}
          </div>
        </div>

        {/* Comparación: hasta dos, grandes y lado a lado, sin salir de la galería. */}
        {comparing.length > 0 && (
          <div className="tg-compare" aria-label={t("editor.gal_compareAria")}>
            {comparing.map((tpl) => (
              <figure className="tg-cmpitem" key={tpl.id}>
                <Shot
                  thumbKey={thumbKey(tpl.id, paletteId, typographyId, docHash)}
                  body={bodyFor(data, tpl.id, paletteId, typographyId)}
                  enabled
                  signal={generation?.signal ?? null}
                  alt={t("editor.gal_thumbAlt").replace("{name}", tpl.name)}
                  labels={{
                    building: t("editor.gal_building"),
                    failed: t("editor.gal_thumbFailed"),
                    retry: t("editor.gal_retry"),
                  }}
                />
                <figcaption>
                  <b>{tpl.name}</b>
                  <button type="button" onClick={() => toggleCompare(tpl.id)}>
                    {t("editor.gal_compareOut")}
                  </button>
                </figcaption>
              </figure>
            ))}
            {comparing.length === 1 && (
              <p className="tg-cmphint">{t("editor.gal_compareHint")}</p>
            )}
          </div>
        )}

        <div className="tg-body">
          {visible.length === 0 ? (
            <p className="tg-none">{t("editor.gal_noneMatch")}</p>
          ) : (
            <div className="tg-grid c-hairgrid">
              {visible.map((tpl) => {
                const active = tpl.id === activeTemplateId;
                const why = whyById.get(tpl.id);
                const own = tagsOf(tpl);
                return (
                  <article
                    className={"tg-card" + (active ? " is-active" : "")}
                    key={tpl.id}
                    data-tpl={tpl.id}
                  >
                    <TplCard
                      tpl={tpl}
                      active={active}
                      docHash={docHash}
                      data={data}
                      paletteId={paletteId}
                      typographyId={typographyId}
                      signal={generation?.signal ?? null}
                      onPick={onPickTemplate}
                      onZoom={setZoomed}
                    />
                    <div className="tg-meta">
                      {why && <p className="tg-why">★ {sayReason(why)}</p>}
                      {tpl.warning && (
                        // El aviso de la gama visual se LEE en la tarjeta. Nunca en
                        // un tooltip: se elige informado o no se elige.
                        <p className="tg-warn" role="note">
                          ⚠ {tpl.warning}
                        </p>
                      )}
                      {own.length > 0 && (
                        <p className="tg-tags">
                          {own.map((tag) => (
                            <span className="tg-tag" key={tag}>
                              {t(`editor.gal_tag_${tag}`)}
                            </span>
                          ))}
                        </p>
                      )}
                      <button
                        type="button"
                        className="tg-cmp"
                        aria-pressed={compare.includes(tpl.id)}
                        onClick={() => toggleCompare(tpl.id)}
                      >
                        {compare.includes(tpl.id) ? t("editor.gal_compareOut") : t("editor.gal_compareIn")}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="tg-foot">{t("editor.gal_foot")}</footer>
      </div>

      {/* El visor: la misma hoja, a tamaño de lectura. Va DENTRO del velo de la
          galería (que ya es una capa de superposición), así se apila encima sin
          pelearse por el z-index con nada del resto de la aplicación. */}
      {zoomAt >= 0 && (
        <TemplateViewer
          templates={visible}
          index={zoomAt}
          onIndex={(i) => setZoomed(visible[i]?.id ?? null)}
          onClose={() => setZoomed(null)}
          onUse={(id) => {
            onPickTemplate(id);
            // Se aplica y se vuelve a la rejilla: la galería sigue abierta por si
            // la decisión no era la definitiva.
            setZoomed(null);
          }}
          activeTemplateId={activeTemplateId}
          renderPages={renderPages}
        />
      )}
    </div>
  );

  // Al BODY. La galería vivía dentro de la pantalla del editor, que es un muro
  // opaco con su propio contexto de apilamiento: desde ahí, la aurora (que el
  // runtime cuelga del body) no podía verse nunca por detrás del velo. Sacado al
  // body, el orden es el que dice el sistema: aurora · página · velo.
  return typeof document === "undefined" ? ui : createPortal(ui, document.body);
}

/**
 * La hoja + el nombre. Elegir aplica ya (el preview grande se rehace).
 *
 * La hoja va FUERA del botón a propósito: cuando la miniatura falla trae su propio
 * botón de "reintentar", y un botón dentro de otro botón es HTML inválido (y React
 * lo canta en hidratación). Toda la tarjeta sigue siendo clicable porque el botón
 * estira un ::after sobre ella; los controles de la meta se ponen por encima con
 * z-index. Un solo control accesible, toda la superficie viva.
 */
function TplCard({
  tpl,
  active,
  docHash,
  data,
  paletteId,
  typographyId,
  signal,
  onPick,
  onZoom,
}: {
  tpl: CvTemplate;
  active: boolean;
  docHash: string;
  data: ResumeData;
  paletteId: string;
  typographyId: string;
  signal: AbortSignal | null;
  onPick: (id: string) => void;
  onZoom: (id: string) => void;
}) {
  const t = useT();
  const [ref, seen] = useSeen<HTMLDivElement>();
  return (
    <>
      <div className="tg-shot" ref={ref}>
        <Shot
          thumbKey={thumbKey(tpl.id, paletteId, typographyId, docHash)}
          body={bodyFor(data, tpl.id, paletteId, typographyId)}
          enabled={seen}
          signal={signal}
          alt={t("editor.gal_thumbAlt").replace("{name}", tpl.name)}
          labels={{
            building: t("editor.gal_building"),
            failed: t("editor.gal_thumbFailed"),
            retry: t("editor.gal_retry"),
          }}
        />
        {active && <span className="tg-badge">{t("editor.gal_active")}</span>}
        {/* AMPLIAR. Antes esto era Ctrl+rueda sobre un PNG de 420px: se veía más
            grande y peor. Va por encima del ::after que hace clicable la tarjeta
            (z-index), porque su trabajo NO es elegir la plantilla: es leerla. */}
        <button
          type="button"
          className="tg-zoom"
          aria-haspopup="dialog"
          aria-label={t("editor.gal_zoomAria").replace("{name}", tpl.name)}
          title={t("editor.gal_zoom")}
          onClick={(e) => {
            e.stopPropagation();
            onZoom(tpl.id);
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <circle cx="7" cy="7" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.4 10.4 13.9 13.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M5.1 7h3.8M7 5.1v3.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <button type="button" className="tg-pick" aria-pressed={active} onClick={() => onPick(tpl.id)}>
        <span className="tg-name">
          {tpl.name}
          <span className={"tg-gama" + (tpl.gama === "visual" ? " is-visual" : "")}>
            {t(`editor.gal_gama_${tpl.gama}`)}
          </span>
        </span>
        <span className="tg-desc">{tpl.description}</span>
      </button>
    </>
  );
}
