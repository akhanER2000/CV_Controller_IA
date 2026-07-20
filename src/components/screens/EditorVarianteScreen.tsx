"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBoot } from "@/lib/corpus/runtime";
import { useT } from "@/lib/i18n";
import { supabaseEnabled } from "@/lib/supabase/config";
import {
  normalizeLinks,
  linkUrl,
  linkLabel,
  mergePresentationOverride,
  type PresentationPatch,
  type ResumeData,
  type I18n,
} from "@/lib/cv/resume";
// El catálogo se auto-registra al importarse y no toca APIs de servidor: el selector
// del editor lee las MISMAS plantillas que usa el render, no una copia.
import { listTemplates, listPalettes, listTypographies, getTemplate } from "@/lib/cv/templates";
import { recommendTemplates, type MasterSummary } from "@/lib/cv/recommend";
import { TemplateGallery, TemplateThumb, docHashFromSig } from "@/components/TemplateGallery";
import { AuroraTune, AURORA_TRABAJO } from "@/components/Aurora";
import "./editor-variante.css";

// Listas estables (el catálogo no cambia en runtime): fuera del componente.
const TEMPLATES = listTemplates();
const PALETTES = listPalettes();
const TYPOGRAPHIES = listTypographies();

/* ============================================================================
   Editor de variante — porte de corpus-design/04-pantallas/editor-variante.html
   (ver docs/spec/pantallas/editor-variante.md). LA PANTALLA MÁS IMPORTANTE.

   ★ CABLEADO A DATOS REALES. En modo Supabase la variante sale de
   GET /api/variants/[id] (el master del usuario + sus variant_items con `data`
   EFECTIVA = master + override). Cada acción PERSISTE contra el contrato:
     - añadir del master     → POST   /api/variants/[id]/items { item_id }
     - quitar de la variante → DELETE /api/variants/[id]/items?id=<variant_item>
     - ocultar               → PATCH  /api/variants/[id]/items { id, visible }
     - reordenar (drag/tecla)→ PATCH  /api/variants/[id]/items { id, sort_order }
     - override por campo     → PATCH  /api/variants/[id]/items { id, override_data }
                                (override_data:null = revertir al master)
     - título objetivo/nombre → PATCH  /api/variants/[id] { target_title, name }
     - Preview (doc + ATS)    → POST   /api/cv { data, as:'preview' } → {pdf,text,pages}
     - Descargar PDF          → POST   /api/cv { data, download:true } (blob)
   Preview y descarga mandan EL MISMO `data` (el estado que ves): no pueden derivar.
   La maqueta (persona Diego Gatica) SOLO se usa como fallback del modo local sin
   Supabase; en modo Supabase NO hay ni un dato de demo.

   ★ EL PREVIEW ES EL PDF, LITERALMENTE. Esta pantalla NO dibuja el documento: pide
   el PDF a POST /api/cv (`as:'preview'`) y lo embebe en un <iframe>. El rayos-X
   («Cómo lo lee el ATS») es el texto que unpdf extrae de ESE MISMO buffer, y el
   contador de páginas es su numPages. No hay ningún segundo renderizador ni ningún
   segundo generador de texto en el cliente: la promesa del pie («si el preview
   miente, el producto miente») dejó de depender de que dos códigos coincidan.
   El botón Descargar manda EL MISMO body → mismo artefacto, byte a byte.

   Atmósfera: la pantalla más densa del producto. NO monta la aurora porque la
   monta el shell UNA sola vez (app/app/layout) para las diez pantallas; aquí solo
   se declara la intensidad más baja (0.22 · AURORA_TRABAJO): presente,
   perceptible al pasar, jamás protagonista. La regla vieja —era un MURO y ni la
   montaba— venía de una landing con scroll y en una app de pestañas solo produce
   inconsistencia; ver la doctrina en src/components/Aurora.tsx. Y el freno que
   sigue mandando aquí: al enfocar CUALQUIER campo la aurora se pausa ('focus',
   lo cablea motion.js). Mientras se escribe no se mueve nada.

   Tres columnas: biblioteca del master · composición
   de la variante · preview que ES el PDF (el PDF real, embebido)
   con su rayos-X. El override gana siempre; si el texto vuelve a igualar al master,
   el override se revierte. Añadir una viñeta arrastra su experiencia padre. El
   reordenamiento (drag y su alternativa de teclado) solo mueve dentro de la misma
   experiencia. .var-orig es el hermano ADYACENTE de .var-b (.var-b.ovr + .var-orig).
   ============================================================================ */

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

// ── Shapes del contrato de API ──────────────────────────────────────────────
interface MasterRow {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  parent_id: string | null;
  sort_order: number;
}
interface VItem {
  id: string; // id del variant_item
  item_id: string; // id del profile_item (master) al que referencia
  kind: string;
  visible: boolean;
  sort_order: number;
  override_data: Record<string, unknown> | null;
  data: Record<string, unknown>; // EFECTIVA (master + override)
  parent_id: string | null;
}
interface VMeta {
  id: string;
  name: string;
  target_title: string | null;
  lang: string;
  updated_at?: string;
  master_updated_at?: string;
}

// Campo de texto editable por kind (override "por campo").
const EDIT_FIELD: Record<string, string> = { summary: "text", bullet: "text", project: "description" };
const editableField = (kind: string): string | null => EDIT_FIELD[kind] ?? null;

const S = (o: Record<string, unknown> | null | undefined, k: string): string => {
  const v = o?.[k];
  return v == null ? "" : String(v);
};
const bySort = (a: VItem, b: VItem) => a.sort_order - b.sort_order;

/** El motivo REAL de un fallo, en texto. Es lo que ve el usuario: nunca "algo falló". */
const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Motivo legible de una respuesta HTTP fallida. /api/cv y /api/variants devuelven
 * { error } con el mensaje real; si el cuerpo no es JSON se usa el texto crudo, y
 * si no hay cuerpo, el código. Nunca devuelve "" (un error mudo no es un error).
 */
async function readApiError(res: Response): Promise<string> {
  let raw = "";
  try {
    raw = await res.text();
  } catch (e) {
    console.error("[editor] no se pudo leer el cuerpo del error", e);
  }
  if (raw) {
    try {
      const j = JSON.parse(raw) as { error?: unknown };
      if (typeof j?.error === "string" && j.error.trim()) return j.error.trim();
    } catch {
      /* no era JSON: el texto crudo ya es el motivo */
    }
    return raw.slice(0, 300);
  }
  return `HTTP ${res.status}`;
}

// Solo dejamos entrar data-URLs de imagen a la miniatura del panel: el cuerpo
// COMPLETO debe ser base64 (ancla $), así ninguna comilla ni "<" puede romper el
// src="…". El DOCUMENTO ya no se dibuja aquí (lo dibuja el PDF), pero la foto sí
// se previsualiza en la tarjeta de Presentación.
const isPhotoDataUrl = (s: string): boolean => /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/]+=*$/i.test(s);

/** Blob de PDF a partir del base64 que devuelve /api/cv (`as:'preview'`). */
function pdfBlobFromBase64(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}

// Reduce la imagen elegida a una data-URL liviana (máx 512 px, JPEG q.85): una foto
// de CV no necesita más y así el override de basics no se infla. NUNCA es el avatar.
async function fileToPhotoDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    // El motivo viaja hasta la barra de estado: tiene que decir algo.
    r.onerror = () => rej(new Error(`no se pudo leer el archivo "${file.name}"`));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`el navegador no pudo decodificar la imagen (${file.type || "tipo desconocido"})`));
    im.src = dataUrl;
  });
  const MAX = 512;
  const scale = Math.min(1, MAX / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(1, Math.round((img.width || 1) * scale));
  const h = Math.max(1, Math.round((img.height || 1) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

// Enlace por defecto del QR: prefiere un portafolio/web (ni github ni linkedin).
function pickDefaultQrLink(links: { url: string; label: string }[]): string {
  if (!links.length) return "";
  const host = (u: string) => u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase();
  const web = links.find((l) => {
    const h = host(l.url);
    return !h.startsWith("github.com") && !h.startsWith("linkedin.com");
  });
  return (web ?? links[0]!).url;
}

function normalizeIncoming(raw: unknown): VItem {
  const r = raw as Partial<VItem> & Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    item_id: String(r.item_id ?? ""),
    kind: String(r.kind ?? ""),
    visible: r.visible !== false,
    sort_order: Number(r.sort_order ?? 0),
    override_data: (r.override_data as Record<string, unknown> | null) ?? null,
    data: (r.data as Record<string, unknown>) ?? {},
    parent_id: (r.parent_id as string | null) ?? null,
  };
}

// ── El estado del editor → ResumeData ────────────────────────────────────────
/**
 * Traduce lo que el usuario compuso al ÚNICO modelo del documento (ResumeData, el
 * que consume ResumePDF). Es un espejo EXACTO de buildVariantResumeData
 * (src/lib/db/variants.ts): mismo filtro (solo visibles), mismo orden (sort_order),
 * mismas reglas de label/foto/QR. Por eso el PDF que ve el editor y el que arma el
 * servidor desde la variante guardada son el MISMO documento.
 *
 * Es PURO y exportado a propósito: es lo único testeable de esta pantalla
 * (tests/pdf-preview.test.ts lo renderiza de verdad y re-parsea el PDF).
 */
const i18nBoth = (v: string): I18n => ({ es: v, en: v });

export interface EditorDocInput {
  items: VItem[];
  basicsData: Record<string, unknown>;
  masterById: Map<string, MasterRow>;
  targetTitle: string;
  variantName?: string;
}

export function buildEditorResumeData({
  items,
  basicsData,
  masterById,
  targetTitle,
  variantName,
}: EditorDocInput): ResumeData {
  const vis = items.filter((i) => i.visible);
  const by = (kind: string) => vis.filter((i) => i.kind === kind).sort(bySort);
  // La viñeta cuelga del rol por el parent_id del MASTER (o, en optimista, por el
  // del propio variant_item). Misma regla que `belongsTo` de la composición.
  const belongs = (b: VItem, w: VItem) =>
    (masterById.get(b.item_id)?.parent_id ?? b.parent_id) === w.item_id || b.parent_id === w.id;

  const summary = by("summary")[0];
  // El título objetivo manda como label; si no hay, cae al label del basics.
  const label = (targetTitle || S(basicsData, "label")).trim();

  const qrObj = (basicsData.qr as Record<string, unknown> | undefined) ?? {};
  const qrMode: "url" | "vcard" = qrObj.mode === "vcard" ? "vcard" : "url";
  const qrU = S(qrObj, "url").trim();
  // ON si hay URL (modo 'url') o si el modo es 'vcard' (el glifo sale del contacto).
  const qrOn = qrMode === "vcard" || qrU !== "";

  return {
    meta: variantName ? { variant: variantName } : undefined,
    basics: {
      name: S(basicsData, "name"),
      label: i18nBoth(label),
      email: S(basicsData, "email"),
      phone: S(basicsData, "phone"),
      location: i18nBoth(S(basicsData, "location")),
      // Los enlaces pueden venir como string suelto o como {label,url} (contacto
      // por variante). normalizeLinks los deja en el shape del modelo; ResumePDF
      // imprime la URL (lo único que lee el ATS), nunca el objeto.
      links: normalizeLinks(basicsData.links),
      summary: i18nBoth(summary ? S(summary.data, "text") : ""),
    },
    photo: S(basicsData, "photo").trim() || undefined,
    qr: qrOn ? { mode: qrMode, url: qrU || undefined } : undefined,
    // Diseño de ESTA variante. Va en el mismo viaje que el resto del documento, así
    // que el preview embebido ya refleja el cambio de plantilla sin ruta aparte.
    templateId: S(basicsData, "templateId").trim() || undefined,
    paletteId: S(basicsData, "paletteId").trim() || undefined,
    typographyId: S(basicsData, "typographyId").trim() || undefined,
    skills: by("skill").map((s) => ({ group: i18nBoth(S(s.data, "group")), items: i18nBoth(S(s.data, "items")) })),
    work: by("work").map((w) => ({
      company: S(w.data, "company"),
      location: i18nBoth(S(w.data, "location")),
      title: i18nBoth(S(w.data, "title")),
      dates: i18nBoth(S(w.data, "dates")),
      p1: true,
      bullets: vis
        .filter((b) => b.kind === "bullet" && belongs(b, w))
        .sort(bySort)
        .map((b) => ({ p1: true, es: S(b.data, "text"), en: S(b.data, "text") })),
    })),
    projects: by("project").map((p) => {
      const line = [S(p.data, "name"), S(p.data, "description")].filter(Boolean).join(" — ");
      return { p1: true, es: line, en: line };
    }),
    education: by("education").map((e) => ({
      title: i18nBoth(S(e.data, "degree")),
      org: S(e.data, "institution"),
      dates: i18nBoth(S(e.data, "dates")),
      p1: true,
    })),
    headings: {
      summary: i18nBoth("Resumen"),
      skills: i18nBoth("Habilidades"),
      work: i18nBoth("Experiencia"),
      projects: i18nBoth("Proyectos"),
      education: i18nBoth("Educación"),
    },
  };
}

// ── Fallback del MODO LOCAL (persona Diego Gatica) — jamás con Supabase ──────
function buildFallback(variantId: string): { master: MasterRow[]; items: VItem[]; meta: VMeta } {
  const master: MasterRow[] = [];
  let so = 0;
  const push = (id: string, kind: string, data: Record<string, unknown>, parent_id: string | null = null) =>
    master.push({ id, kind, data, parent_id, sort_order: so++ });

  push("basics", "basics", {
    name: "Diego Gatica Morales",
    label: "",
    email: "diego.gatica@ejemplo.cl",
    phone: "+56 9 6123 4567",
    location: "Santiago, Chile",
    links: ["github.com/dgatica", "dgatica.cl"],
  });
  push("sum", "summary", {
    text:
      "Backend developer con 6 años construyendo servicios de pago y e-commerce en Go y Node.js. A cargo del servicio de conciliación de Altiplano Pagos (~40.000 transacciones diarias). Busco problemas de plataforma con datos de verdad.",
  });
  const exp: [string, string, string, string, string, [string, string][]][] = [
    ["e1", "Backend Developer", "Altiplano Pagos SpA", "Santiago, Chile", "mar 2022 – hoy", [
      ["b1", "A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias)."],
      ["b4", "Escribí la librería interna de idempotencia (Go) adoptada por otros equipos de la empresa."],
      ["b5", "Mantengo los pipelines de CI/CD del equipo (GitHub Actions)."],
      ["b8", "Mentoreo a 2 desarrolladores junior del equipo de pagos."],
      ["b6", "Turno de soporte (on-call) una semana al mes."],
      ["b7", "Documenté la API pública de conciliación (OpenAPI 3.1)."],
    ]],
    ["e2", "Backend Developer — equipo Checkout", "Rayén Retail S.A.", "Santiago, Chile", "ene 2020 – feb 2022", [
      ["b9", "Desarrollé y mantuve APIs del checkout (Node.js, PostgreSQL)."],
      ["b13", "Implementé el flujo de cupones y descuentos del checkout."],
      ["b12", "Atendí incidentes de producción durante cyber days."],
      ["b14", "Automaticé reportes de ventas diarios para operaciones."],
    ]],
    ["e3", "Desarrollador freelance", "Independiente", "Santiago, Chile", "2019 – 2020", [
      ["b16", "Construí sitios y APIs para 4 pymes chilenas."],
      ["b17", "Sistema de reservas para un centro deportivo (Django)."],
    ]],
    ["e4", "Práctica profesional — Área TI", "Universidad Andrés Bello", "Santiago, Chile", "2018 – 2019", [
      ["b21", "Soporte a la plataforma de matrícula en periodos peak."],
      ["b22", "Scripts de migración de datos de alumnos (Python)."],
    ]],
  ];
  exp.forEach(([id, title, company, location, dates, bullets]) => {
    push(id, "work", { title, company, location, dates });
    bullets.forEach(([bid, text]) => push(bid, "bullet", { text }, id));
  });
  ([
    ["s1", "Lenguajes", "Go, Python, SQL, TypeScript"],
    ["s2", "Backend", "PostgreSQL, Redis, gRPC, OpenAPI, Node.js, Django"],
    ["s3", "Plataforma", "Docker, GitHub Actions, Linux, Bash"],
    ["s4", "Idiomas", "Español nativo, Inglés B2"],
  ] as [string, string, string][]).forEach(([id, group, items]) => push(id, "skill", { group, items }));
  ([
    ["p1", "idempotency-go", "librería open source de idempotencia en Go (github.com/dgatica)."],
    ["p2", "reservas-club", "sistema de reservas en Django, en producción desde 2020 (dgatica.cl)."],
    ["p3", "scraper-sii", "CLI en Python para series de tipo de cambio del SII."],
  ] as [string, string, string][]).forEach(([id, name, description]) => push(id, "project", { name, description }));
  ([
    ["ed1", "Ingeniería Civil en Computación e Informática", "Universidad Andrés Bello", "2014 – 2019"],
    ["ed2", "Diplomado en Ingeniería de Datos", "Pontificia Universidad Católica de Chile", "2022"],
  ] as [string, string, string, string][]).forEach(([id, degree, institution, dates]) =>
    push(id, "education", { degree, institution, dates }),
  );

  const included = new Set([
    "sum", "e1", "b1", "b4", "b5", "b8", "b6", "b7", "e2", "b9", "b13", "b12", "b14",
    "e3", "b16", "b17", "e4", "b21", "b22", "s1", "s2", "s3", "s4", "p1", "p2", "p3", "ed1", "ed2",
  ]);
  const items: VItem[] = master
    .filter((m) => included.has(m.id))
    .map((m, i) => ({
      id: "v-" + m.id,
      item_id: m.id,
      kind: m.kind,
      visible: true,
      sort_order: i,
      override_data: null,
      data: m.data,
      parent_id: m.parent_id,
    }));

  return {
    master,
    items,
    meta: { id: variantId, name: "Backend — Fintech", target_title: "Backend Engineer", lang: "es" },
  };
}

type Mode = "doc" | "raw";
type View = "master" | "mid" | "preview";

export function EditorVarianteScreen({ variantId = "editor" }: { variantId?: string } = {}) {
  const t = useT();
  const router = useRouter();
  const [fb] = useState(() => (supabaseEnabled ? null : buildFallback(variantId)));
  const [master, setMaster] = useState<MasterRow[]>(() => fb?.master ?? []);
  const [items, setItems] = useState<VItem[]>(() => fb?.items ?? []);
  const [meta, setMeta] = useState<VMeta | null>(() => fb?.meta ?? null);
  const [targetTitle, setTargetTitle] = useState<string>(() => fb?.meta.target_title ?? "");
  const [loading, setLoading] = useState<boolean>(supabaseEnabled);

  const [libQ, setLibQ] = useState("");
  const [mode, setMode] = useState<Mode>("doc");
  const [view, setView] = useState<View>("mid");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Presentación opt-in (foto/QR). qrCustom = el usuario eligió "otra URL".
  const [qrCustom, setQrCustom] = useState(false);
  // Galería de plantillas (el selector con miniaturas reales). Cerrarla no pierde
  // nada: cada elección se persiste en el momento, como cualquier otro ajuste.
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Eliminar variante: confirmación INLINE (no window.confirm) porque tras archivar se
  // navega a /app/variantes; el toast diferido de deshacer no encaja al desmontar aquí.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Borrador local de los enlaces del contacto (se confirma al desenfocar / quitar).
  const [linkRows, setLinkRows] = useState<{ label: string; url: string }[]>([]);
  const linksSigRef = useRef<string>("");
  // Serializa los guardados de presentación: setVariantPresentation hace un
  // read-modify-write de override_data; sin esto, dos ediciones seguidas (subir
  // foto + activar QR) se pisarían campo a campo. La cadena garantiza que el 2º
  // PATCH lea lo que el 1º ya escribió.
  const presSaveChain = useRef<Promise<void>>(Promise.resolve());

  // Barra de estado (#edState): live region, con flash reentrante a 2600 ms.
  // "" = reposo → se pinta t("editor.stIdle") en vivo (reactivo al idioma).
  const [stMsg, setStMsg] = useState("");
  const [stAccent, setStAccent] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pvScrollRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLSpanElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const sortSnap = useRef<Map<string, number> | null>(null);
  const bootRef = useBoot<HTMLDivElement>(); // no-op defensivo: no hay reveals aquí

  const flash = useCallback((msg: string) => {
    setStMsg(msg);
    setStAccent(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setStMsg("");
      setStAccent(false);
    }, 2600);
  }, []);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // `t` cambia de identidad al cambiar de idioma; guardarlo en un ref deja que los
  // efectos de datos dependan SOLO de sus datos (cambiar de idioma no recarga nada).
  const tRef = useRef(t);
  tRef.current = t;

  /**
   * DESTAPAR EL ERROR. Todo fallo pasa por aquí: al log con contexto (para quien
   * depura) y a la barra de estado con el MOTIVO REAL interpolado en {r} (para
   * quien usa). Ningún catch de esta pantalla se queda callado.
   */
  const fail = useCallback(
    (context: string, e: unknown, key: string) => {
      console.error(`[editor] ${context}`, e);
      flash(tRef.current(key).replace("{r}", reason(e)));
    },
    [flash],
  );

  // ── Carga real (modo Supabase) ──
  useEffect(() => {
    if (!supabaseEnabled) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/variants/${variantId}`);
        if (!res.ok) throw new Error(await readApiError(res));
        const data = await res.json();
        if (!active) return;
        setMaster((data.master ?? []) as MasterRow[]);
        setItems(((data.items ?? []) as unknown[]).map(normalizeIncoming));
        const m = data.variant as VMeta | undefined;
        setMeta(m ?? null);
        setTargetTitle(m?.target_title ?? "");
      } catch (e) {
        if (active) {
          setMaster([]);
          setItems([]);
          setMeta(null);
          fail(`carga de la variante ${variantId}`, e, "editor.stLoadErr");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [variantId, fail]);

  // ── Índices derivados ──
  const masterById = useMemo(() => {
    const m = new Map<string, MasterRow>();
    master.forEach((r) => m.set(r.id, r));
    return m;
  }, [master]);

  const vItemByMaster = useMemo(() => {
    const m = new Map<string, VItem>();
    items.forEach((it) => m.set(it.item_id, it));
    return m;
  }, [items]);

  // ¿La viñeta `bullet` pertenece al `work` (variant_item)?
  const belongsTo = useCallback(
    (bullet: VItem, work: VItem): boolean => {
      const mParent = masterById.get(bullet.item_id)?.parent_id ?? bullet.parent_id;
      return mParent === work.item_id || bullet.parent_id === work.id;
    },
    [masterById],
  );

  const bulletsForWork = useCallback(
    (work: VItem): VItem[] => items.filter((b) => b.kind === "bullet" && belongsTo(b, work)).sort(bySort),
    [items, belongsTo],
  );

  // basics: preferir el variant_item si existe; si no, el master. Siempre se pinta.
  const basicsData = useMemo(() => {
    const vi = items.find((i) => i.kind === "basics");
    if (vi) return vi.data;
    return master.find((m) => m.kind === "basics")?.data ?? {};
  }, [items, master]);

  // ── Presentación opt-in (foto / QR) — override del basics de ESTA variante ──
  const hasBasics = useMemo(() => master.some((m) => m.kind === "basics") || items.some((i) => i.kind === "basics"), [master, items]);
  // Enlaces del contacto para el QR, SIN duplicados por url (normalizeLinks no
  // deduplica): dos links iguales darían dos <option> con la misma key en React.
  const linkOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { url: string; label: string }[] = [];
    for (const l of normalizeLinks(basicsData.links)) {
      const url = linkUrl(l);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, label: linkLabel(l) });
    }
    return out;
  }, [basicsData.links]);
  // override_data del variant_item de basics: qué campos de contacto están tuneados
  // SOLO en esta variante (marca visual + revertir). masterBasics = la identidad
  // canónica de la que hereda cada campo.
  const basicsOverride = useMemo(() => {
    const vi = items.find((i) => i.kind === "basics");
    return (vi?.override_data as Record<string, unknown> | null) ?? {};
  }, [items]);
  const masterBasics = useMemo(() => master.find((m) => m.kind === "basics")?.data ?? {}, [master]);

  const photoUrl = S(basicsData, "photo").trim();
  const qrObj = (basicsData.qr as Record<string, unknown> | undefined) ?? {};
  const qrUrl = S(qrObj, "url").trim();
  const qrMode: "url" | "vcard" = qrObj.mode === "vcard" ? "vcard" : "url";
  const photoOn = !!photoUrl;
  const qrOn = qrMode === "vcard" || !!qrUrl;
  const qrChecked = qrOn || qrCustom;
  const qrCustomMode = qrMode === "url" && (qrCustom || (!!qrUrl && !linkOptions.some((l) => l.url === qrUrl)));

  // Diseño elegido para esta variante. Vacío ⇒ la plantilla por defecto (getTemplate
  // resuelve el id desconocido sin lanzar: un id roto no puede dejarte sin CV).
  const designTemplateId = S(basicsData, "templateId").trim() || getTemplate(null).id;
  const designPaletteId = S(basicsData, "paletteId").trim();
  const designTypographyId = S(basicsData, "typographyId").trim();
  const activeTemplate = getTemplate(designTemplateId);

  // Reconcilia el estado del cliente con la VERDAD del servidor tras guardar la
  // presentación: fija el id real del variant_item de basics, su override_data
  // efectivo (limpia marcas de override que en realidad quedaron canónicas), y —si
  // la primera guardada SEMBRÓ el basics del master— añade/actualiza esa fila.
  const applyPresentationTruth = useCallback(
    (p: {
      basicsItemId?: string;
      override?: Record<string, unknown> | null;
      masterBasicsId?: string;
      masterBasics?: Record<string, unknown>;
    }) => {
      if (p.masterBasicsId) {
        const mid = p.masterBasicsId;
        const mdata = p.masterBasics ?? {};
        setMaster((prev) =>
          prev.some((m) => m.id === mid)
            ? prev.map((m) => (m.id === mid ? { ...m, data: mdata } : m))
            : [...prev, { id: mid, kind: "basics", data: mdata, parent_id: null, sort_order: -1 }],
        );
      }
      setItems((prev) => {
        const ov = (p.override ?? null) as Record<string, unknown> | null;
        const base = p.masterBasics ?? prev.find((i) => i.kind === "basics")?.data ?? {};
        const data = { ...base, ...(ov ?? {}) };
        const existing = prev.find((i) => i.kind === "basics");
        if (existing) {
          return prev.map((i) =>
            i.id === existing.id
              ? { ...i, id: p.basicsItemId ?? i.id, item_id: p.masterBasicsId ?? i.item_id, override_data: ov, data }
              : i,
          );
        }
        if (!p.basicsItemId) return prev;
        return [
          ...prev,
          { id: p.basicsItemId, item_id: p.masterBasicsId ?? "", kind: "basics", visible: true, sort_order: -1, override_data: ov, data, parent_id: null },
        ];
      });
    },
    [],
  );

  // Persiste foto/QR/contacto: optimista en items (para que el preview cambie ya) +
  // PATCH. El merge optimista usa el MISMO helper puro que el servidor.
  const savePresentation = useCallback(
    (patch: PresentationPatch) => {
      setItems((prev) => {
        const basicsMaster = master.find((m) => m.kind === "basics");
        const existing = prev.find((i) => i.kind === "basics");
        const base = basicsMaster?.data ?? existing?.data ?? {};
        const curOv = (existing?.override_data as Record<string, unknown> | null) ?? {};
        const nextOv = mergePresentationOverride(curOv, patch);
        const nextData = { ...base, ...nextOv };
        if (existing) return prev.map((i) => (i.id === existing.id ? { ...i, override_data: nextOv, data: nextData } : i));
        const tmp: VItem = {
          id: "tmp-basics", item_id: basicsMaster?.id ?? "tmp-basics-master", kind: "basics", visible: true,
          sort_order: -1, override_data: nextOv, data: nextData, parent_id: null,
        };
        return [...prev, tmp];
      });
      if (!supabaseEnabled) {
        flash(t("editor.stPresSaved"));
        return;
      }
      // Encolar tras el guardado anterior: los PATCH se aplican EN ORDEN, así el
      // read-modify-write del servidor nunca pierde un campo por una carrera.
      presSaveChain.current = presSaveChain.current.then(async () => {
        try {
          const res = await fetch(`/api/variants/${variantId}`, {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: JSON.stringify({ presentation: patch }),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          const json = (await res.json().catch((e: unknown) => {
            // Guardó bien (2xx) pero el cuerpo no se pudo leer: no se reconcilia,
            // el optimista se queda. Se registra para no perder la pista.
            console.error("[editor] respuesta de presentación ilegible", e);
            return null;
          })) as {
            presentation?: {
              basicsItemId?: string;
              override?: Record<string, unknown> | null;
              masterBasicsId?: string;
              masterBasics?: Record<string, unknown>;
            };
          } | null;
          if (json?.presentation) applyPresentationTruth(json.presentation);
          flash(t("editor.stPresSaved"));
        } catch (e) {
          fail("guardado de presentación/contacto", e, "editor.stPresErr");
        }
      });
    },
    [master, variantId, flash, t, fail, applyPresentationTruth],
  );

  const onPhotoFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setBusyPhoto(true);
      try {
        const dataUrl = await fileToPhotoDataUrl(file);
        if (dataUrl.length > 900_000) {
          flash(t("editor.stPhotoBig"));
          return;
        }
        savePresentation({ photo: dataUrl });
      } catch (e) {
        // Archivo corrupto, formato que el navegador no decodifica, canvas sin
        // contexto… el motivo va a la barra: el usuario sabe qué reintentar.
        fail(`lectura de la foto "${file.name}"`, e, "editor.stPhotoErr");
      } finally {
        setBusyPhoto(false);
        if (photoInputRef.current) photoInputRef.current.value = "";
      }
    },
    [savePresentation, flash, t, fail],
  );

  // Foto ON abre el selector (el guardado ocurre al elegir archivo); OFF la quita.
  const togglePhoto = useCallback(
    (on: boolean) => {
      if (on) photoInputRef.current?.click();
      else savePresentation({ photo: "" });
    },
    [savePresentation],
  );

  const toggleQr = useCallback(
    (on: boolean) => {
      if (on) {
        const def = pickDefaultQrLink(linkOptions);
        setQrCustom(false);
        // Con enlace → modo 'url' con ese enlace. Sin enlaces → modo 'vcard' (no
        // necesita URL: el glifo sale del contacto), así el QR queda ON de una.
        if (def) savePresentation({ qrUrl: def, qrMode: "url" });
        else savePresentation({ qrUrl: "", qrMode: "vcard" });
      } else {
        setQrCustom(false);
        savePresentation({ qrUrl: "", qrMode: "url" });
      }
    },
    [linkOptions, savePresentation],
  );

  const changeQrMode = useCallback(
    (m: "url" | "vcard") => {
      if (m === "vcard") {
        savePresentation({ qrMode: "vcard" });
      } else {
        // Volver a 'url' necesita una URL para quedar ON; si no hay, toma el default.
        const url = qrUrl || pickDefaultQrLink(linkOptions);
        setQrCustom(!url);
        savePresentation({ qrMode: "url", qrUrl: url });
      }
    },
    [qrUrl, linkOptions, savePresentation],
  );

  const onQrSelect = useCallback(
    (val: string) => {
      if (val === "__custom__") {
        setQrCustom(true);
        return;
      }
      setQrCustom(false);
      savePresentation({ qrUrl: val, qrMode: "url" });
    },
    [savePresentation],
  );

  const onQrCustomInput = useCallback((val: string) => savePresentation({ qrUrl: val.trim(), qrMode: "url" }), [savePresentation]);

  // ── Contacto por variante: cada campo hereda del master; al editarlo se vuelve
  //    override SOLO de esta variante. Si el valor vuelve a igualar al master, se
  //    revierte (se quita el override). ──
  const onContactBlur = useCallback(
    (field: "name" | "email" | "phone" | "location", raw: string) => {
      const v = raw.trim();
      const masterVal = S(masterBasics, field).trim();
      const overridden = field in basicsOverride;
      if (v === masterVal) {
        if (overridden) savePresentation({ [field]: null } as PresentationPatch);
      } else {
        savePresentation({ [field]: v } as PresentationPatch);
      }
    },
    [masterBasics, basicsOverride, savePresentation],
  );

  const revertContact = useCallback(
    (field: "name" | "email" | "phone" | "location" | "links") =>
      savePresentation({ [field]: null } as PresentationPatch),
    [savePresentation],
  );

  // Enlaces efectivos (para sembrar el borrador editable) y su firma para resincronizar
  // el borrador cuando cambian por fuera (carga, revert, reconciliación).
  const effectiveLinks = useMemo(
    () => normalizeLinks(basicsData.links).map((l) => ({ label: linkLabel(l), url: linkUrl(l) })),
    [basicsData.links],
  );
  useEffect(() => {
    const sig = JSON.stringify(effectiveLinks);
    if (linksSigRef.current !== sig) {
      linksSigRef.current = sig;
      setLinkRows(effectiveLinks);
    }
  }, [effectiveLinks]);

  // Confirma los enlaces: limpia filas sin URL, compara con el master y decide entre
  // override (distinto del master) o revertir (igual al master).
  const commitLinks = useCallback(
    (rows: { label: string; url: string }[]) => {
      const cleaned = rows.map((r) => ({ label: r.label.trim(), url: r.url.trim() })).filter((r) => r.url);
      const asInput = cleaned.map((r) => (r.label ? { label: r.label, url: r.url } : r.url));
      const sameAsMaster =
        JSON.stringify(normalizeLinks(asInput)) === JSON.stringify(normalizeLinks(masterBasics.links));
      if (sameAsMaster) {
        if ("links" in basicsOverride) savePresentation({ links: null });
      } else {
        savePresentation({ links: asInput });
      }
    },
    [masterBasics.links, basicsOverride, savePresentation],
  );

  const updateLinkRow = useCallback((i: number, key: "label" | "url", val: string) => {
    setLinkRows((prev) => prev.map((r, k) => (k === i ? { ...r, [key]: val } : r)));
  }, []);
  const addLinkRow = useCallback(() => setLinkRows((prev) => [...prev, { label: "", url: "" }]), []);
  const removeLinkRow = useCallback(
    (i: number) => {
      setLinkRows((prev) => {
        const next = prev.filter((_, k) => k !== i);
        commitLinks(next);
        return next;
      });
    },
    [commitLinks],
  );

  // ── Eliminar variante (archiva) → navega a la lista. Confirmación inline. ──
  const doDeleteVariant = useCallback(async () => {
    if (!supabaseEnabled) {
      flash(t("editor.stDeleteLocal"));
      setConfirmDelete(false);
      return;
    }
    try {
      const res = await fetch(`/api/variants/${variantId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res));
      router.push("/app/variantes");
    } catch (e) {
      fail(`eliminación de la variante ${variantId}`, e, "editor.stDeleteErr");
      setConfirmDelete(false);
    }
  }, [variantId, router, flash, t, fail]);

  // ── EL DOCUMENTO: un solo modelo (ResumeData) para el preview y la descarga ──
  const resumeData = useMemo(
    () => buildEditorResumeData({ items, basicsData, masterById, targetTitle, variantName: meta?.name }),
    [items, basicsData, masterById, targetTitle, meta?.name],
  );
  // Ref para que el efecto del preview y la descarga usen SIEMPRE el último
  // documento sin volverse a crear en cada render.
  const resumeRef = useRef(resumeData);
  resumeRef.current = resumeData;
  // Firma del documento: si no cambia, no se vuelve a pedir un PDF. Es también el
  // disparador del debounce (escribir no dispara nada hasta que paras).
  const docSig = useMemo(() => JSON.stringify(resumeData), [resumeData]);

  // ── El preview ES el PDF: bytes reales de /api/cv, embebidos en un <iframe> ──
  const [pdfUrl, setPdfUrl] = useState("");
  const [xrayText, setXrayText] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [pvBusy, setPvBusy] = useState(true);
  const [pvError, setPvError] = useState("");
  const [pvRetry, setPvRetry] = useState(0);
  const pdfUrlRef = useRef("");

  // Un object URL vivo por PDF: se revoca el anterior al llegar el nuevo y el
  // último al desmontar (si no, cada tecleo filtraría un blob).
  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (loading) return; // aún no sabemos qué documento es
    let cancelled = false;
    setPvBusy(true);
    // DEBOUNCE: no se pide un PDF por tecla. Se regenera ~600 ms después de la
    // última edición (y al desenfocar, porque el commit cambia `docSig`).
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/cv", {
            method: "POST",
            headers: JSON_HEADERS,
            // El MISMO body que la descarga: mismo artefacto, sin excepciones.
            // `data` (y no `variantId`) para que el preview refleje lo que ves
            // AHORA, incluso antes de que el guardado optimista llegue al servidor,
            // y para que funcione igual sin Supabase (modo local).
            body: JSON.stringify({ data: resumeRef.current, as: "preview" }),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          const json = (await res.json()) as { pdf?: string; text?: string; pages?: number };
          if (cancelled) return;
          if (!json.pdf) throw new Error("La respuesta no trae el PDF.");
          const url = URL.createObjectURL(pdfBlobFromBase64(json.pdf));
          if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
          pdfUrlRef.current = url;
          setPdfUrl(url);
          // El rayos-X NO se genera aquí: es el texto que unpdf extrajo de ESTE
          // mismo PDF en el servidor. Y las páginas son su numPages real.
          setXrayText(json.text ?? "");
          setPageCount(Number(json.pages ?? 0));
          setPvError("");
        } catch (e) {
          if (cancelled) return;
          // Nunca un panel en blanco y mudo: el motivo real se pinta en el panel
          // y en la barra de estado.
          console.error("[editor] preview: no se pudo generar el PDF", e);
          setPvError(reason(e));
          flash(tRef.current("editor.stPdfErr").replace("{r}", reason(e)));
        } finally {
          if (!cancelled) setPvBusy(false);
        }
      })();
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [docSig, loading, pvRetry, flash]);

  // ── El master, CONTADO — la entrada de la recomendación ────────────────────
  /**
   * Números que el usuario puede ir a verificar él mismo en su biblioteca; ni uno
   * estimado. `pages` es el numPages REAL del PDF que está viendo (0 mientras no
   * se sepa, y entonces la regla del volumen no dispara).
   *
   * `skillsWithEvidence` NO se manda: la API de la variante no devuelve la marca
   * de evidencia del master, y afirmar "con evidencia" sin tenerla sería
   * exactamente el tipo de número inventado que este producto no se permite. Se
   * cuenta lo que sí se sabe (las habilidades listadas) y la razón lo dice así.
   */
  const masterSummary = useMemo<MasterSummary>(() => {
    const of = (kind: string) => master.filter((m) => m.kind === kind);
    const skills = of("skill");
    const skillItems = skills.reduce(
      (n, s) => n + S(s.data, "items").split(",").map((x) => x.trim()).filter(Boolean).length,
      0,
    );
    return {
      roles: of("work").length,
      bullets: of("bullet").length,
      skillGroups: skills.length,
      skillItems,
      projects: of("project").length,
      education: of("education").length,
      hasSummary: of("summary").length > 0,
      pages: pageCount,
    };
  }, [master, pageCount]);

  const recommendations = useMemo(
    () => recommendTemplates(masterSummary, { limit: 8, templates: TEMPLATES }),
    [masterSummary],
  );

  // El hash del documento para las miniaturas: el MISMO que usa la galería, para
  // que la miniatura de la tarjeta y la de la rejilla compartan caché.
  const thumbDocHash = useMemo(() => docHashFromSig(docSig), [docSig]);

  // ── Persistencia (contra el contrato; en modo local es no-op) ──
  const patchItem = useCallback(
    (vitemId: string, patch: Record<string, unknown>) => {
      if (!supabaseEnabled || vitemId.startsWith("tmp-")) return;
      void (async () => {
        try {
          const res = await fetch(`/api/variants/${variantId}/items`, {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: JSON.stringify({ id: vitemId, ...patch }),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          flash(t("editor.stSavedItem"));
        } catch (e) {
          // El estado local ya cambió (optimista): si el servidor lo rechazó, el
          // usuario tiene que enterarse, o creerá que guardó.
          fail(`PATCH del item ${vitemId} · ${Object.keys(patch).join(",")}`, e, "editor.stSaveItemErr");
        }
      })();
    },
    [variantId, flash, t, fail],
  );

  const patchVariant = useCallback(
    (patch: Record<string, unknown>) => {
      if (!supabaseEnabled) return;
      void (async () => {
        try {
          const res = await fetch(`/api/variants/${variantId}`, {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: JSON.stringify(patch),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          flash(t("editor.stSaved"));
        } catch (e) {
          fail(`PATCH de la variante · ${Object.keys(patch).join(",")}`, e, "editor.stSaveErr");
        }
      })();
    },
    [variantId, flash, t, fail],
  );

  const nextSortOrder = useCallback(
    (kind: string) => {
      const same = items.filter((i) => i.kind === kind);
      return same.length ? Math.max(...same.map((i) => i.sort_order)) + 1 : items.length + 1;
    },
    [items],
  );

  // POST un item del master a la variante (optimista con id temporal + reconcilia).
  const postItem = useCallback(
    async (masterId: string) => {
      const m = masterById.get(masterId);
      if (!m || items.some((i) => i.item_id === masterId)) return;
      const tmpId = "tmp-" + Math.random().toString(36).slice(2);
      const optimistic: VItem = {
        id: tmpId,
        item_id: m.id,
        kind: m.kind,
        visible: true,
        sort_order: nextSortOrder(m.kind),
        override_data: null,
        data: m.data,
        parent_id: m.parent_id,
      };
      setItems((prev) => [...prev, optimistic]);
      if (!supabaseEnabled) return;
      try {
        const res = await fetch(`/api/variants/${variantId}/items`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ item_id: masterId }),
        });
        if (!res.ok) throw new Error(await readApiError(res));
        const { item } = (await res.json()) as { item?: unknown };
        if (item) {
          const norm = normalizeIncoming(item);
          if (!norm.data || Object.keys(norm.data).length === 0) norm.data = m.data;
          setItems((prev) => prev.map((i) => (i.id === tmpId ? norm : i)));
        }
      } catch (e) {
        setItems((prev) => prev.filter((i) => i.id !== tmpId));
        fail(`POST del item ${masterId} a la variante`, e, "editor.stAddErr");
      }
    },
    [masterById, items, nextSortOrder, variantId, flash, t, fail],
  );

  const removeItem = useCallback(
    (vitemId: string) => {
      const it = items.find((i) => i.id === vitemId);
      if (!it) return;
      // Quitar un rol arrastra sus viñetas (no dejar variant_items huérfanos).
      const childIds =
        it.kind === "work" ? items.filter((b) => b.kind === "bullet" && belongsTo(b, it)).map((b) => b.id) : [];
      const allIds = new Set([vitemId, ...childIds]);
      setItems((prev) => prev.filter((i) => !allIds.has(i.id)));
      flash(t("editor.stRemoved"));
      if (!supabaseEnabled) return;
      allIds.forEach((id) => {
        if (id.startsWith("tmp-")) return;
        void (async () => {
          try {
            const res = await fetch(`/api/variants/${variantId}/items?id=${encodeURIComponent(id)}`, {
              method: "DELETE",
            });
            if (!res.ok) throw new Error(await readApiError(res));
          } catch (e) {
            // Ya desapareció de la pantalla: si el servidor no lo borró, volverá al
            // recargar. Decirlo es la diferencia entre un bug y una sorpresa.
            fail(`DELETE del item ${id} de la variante`, e, "editor.stRemoveErr");
          }
        })();
      });
    },
    [items, belongsTo, variantId, flash, t, fail],
  );

  // Biblioteca: clic en una fila = alternar (añadir/quitar). Añadir una viñeta
  // arrastra su rol padre.
  const toggleFromLib = useCallback(
    async (masterId: string) => {
      const existing = items.find((i) => i.item_id === masterId);
      if (existing) {
        removeItem(existing.id);
        return;
      }
      const m = masterById.get(masterId);
      if (m?.kind === "bullet" && m.parent_id && !items.some((i) => i.item_id === m.parent_id)) {
        await postItem(m.parent_id);
      }
      await postItem(masterId);
      flash(t("editor.stAdded"));
    },
    [items, masterById, removeItem, postItem, flash, t],
  );

  const toggleHide = useCallback(
    (vitemId: string) => {
      const it = items.find((i) => i.id === vitemId);
      if (!it) return;
      const nextVisible = !it.visible;
      setItems((prev) => prev.map((i) => (i.id === vitemId ? { ...i, visible: nextVisible } : i)));
      flash(nextVisible ? t("editor.stShown") : t("editor.stHidden"));
      patchItem(vitemId, { visible: nextVisible });
    },
    [items, flash, patchItem, t],
  );

  const revert = useCallback(
    (vitemId: string) => {
      const it = items.find((i) => i.id === vitemId);
      if (!it) return;
      const field = editableField(it.kind) ?? "text";
      const masterVal = S(masterById.get(it.item_id)?.data, field);
      setItems((prev) =>
        prev.map((i) => (i.id === vitemId ? { ...i, override_data: null, data: { ...i.data, [field]: masterVal } } : i)),
      );
      flash(t("editor.stReverted"));
      patchItem(vitemId, { override_data: null });
    },
    [items, masterById, flash, patchItem, t],
  );

  const startEdit = useCallback((id: string) => setEditingId(id), []);

  // Al entrar en edición: enfocar y colapsar al final.
  useEffect(() => {
    if (!editingId) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (sel) {
      sel.selectAllChildren(el);
      sel.collapseToEnd();
    }
  }, [editingId]);

  const finishEdit = useCallback(() => {
    const id = editingId;
    const el = editRef.current;
    if (!id || !el) {
      setEditingId(null);
      return;
    }
    const it = items.find((i) => i.id === id);
    const field = it ? editableField(it.kind) ?? "text" : "text";
    const v = (el.textContent ?? "").trim();
    const masterVal = S(masterById.get(it?.item_id ?? "")?.data, field);
    if (v && v !== masterVal) {
      const override = { [field]: v };
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, override_data: override, data: { ...i.data, [field]: v } } : i)),
      );
      flash(t("editor.stOvrSaved"));
      patchItem(id, { override_data: override });
    } else if (v === masterVal && it?.override_data) {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, override_data: null, data: { ...i.data, [field]: masterVal } } : i)),
      );
      patchItem(id, { override_data: null });
    }
    setEditingId(null);
  }, [editingId, items, masterById, flash, patchItem, t]);

  const onEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }, []);

  // ── Reordenar (solo viñetas, dentro de su rol). Permuta los sort_order del grupo. ──
  const computeReorder = useCallback(
    (list: VItem[], work: VItem, dragId: string, toIndex: number): { id: string; sort_order: number }[] | null => {
      const group = list.filter((b) => b.kind === "bullet" && belongsTo(b, work)).sort(bySort);
      const ids = group.map((g) => g.id);
      const fromIndex = ids.indexOf(dragId);
      if (fromIndex < 0) return null;
      const clampTo = Math.max(0, Math.min(group.length - 1, toIndex));
      if (clampTo === fromIndex) return null;
      const sortVals = group.map((g) => g.sort_order).slice().sort((a, b) => a - b);
      const newOrder = group.slice();
      const [moved] = newOrder.splice(fromIndex, 1);
      newOrder.splice(clampTo, 0, moved);
      const changed: { id: string; sort_order: number }[] = [];
      newOrder.forEach((g, i) => {
        if (g.sort_order !== sortVals[i]) changed.push({ id: g.id, sort_order: sortVals[i] });
      });
      return changed.length ? changed : null;
    },
    [belongsTo],
  );

  const reorder = useCallback(
    (work: VItem, dragId: string, toIndex: number, persist: boolean) => {
      setItems((prev) => {
        const changed = computeReorder(prev, work, dragId, toIndex);
        if (!changed) return prev;
        const map = new Map(changed.map((c) => [c.id, c.sort_order]));
        if (persist) changed.forEach((c) => patchItem(c.id, { sort_order: c.sort_order }));
        return prev.map((i) => (map.has(i.id) ? { ...i, sort_order: map.get(i.id)! } : i));
      });
    },
    [computeReorder, patchItem],
  );

  const onGripKey = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, bullet: VItem, work: VItem) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const group = bulletsForWork(work);
      const idx = group.findIndex((g) => g.id === bullet.id);
      const to = e.key === "ArrowUp" ? idx - 1 : idx + 1;
      if (to < 0 || to >= group.length) return;
      reorder(work, bullet.id, to, true);
      flash(t("editor.stReordered"));
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-grip="${bullet.id}"]`)?.focus());
    },
    [bulletsForWork, reorder, flash, t],
  );

  const onDragStart = useCallback(
    (id: string) => {
      dragIdRef.current = id;
      setDraggingId(id);
      sortSnap.current = new Map(items.map((i) => [i.id, i.sort_order]));
    },
    [items],
  );
  const onDragEnd = useCallback(() => {
    dragIdRef.current = null;
    setDraggingId(null);
    const snap = sortSnap.current;
    sortSnap.current = null;
    if (!snap) return;
    items.forEach((i) => {
      const before = snap.get(i.id);
      if (before !== undefined && before !== i.sort_order) patchItem(i.id, { sort_order: i.sort_order });
    });
  }, [items, patchItem]);
  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, overB: VItem, work: VItem) => {
      const dragId = dragIdRef.current;
      if (!dragId || overB.id === dragId) return;
      const drag = items.find((i) => i.id === dragId);
      if (!drag || drag.kind !== "bullet" || !belongsTo(drag, work)) return;
      e.preventDefault();
      const group = bulletsForWork(work);
      const overIndex = group.findIndex((g) => g.id === overB.id);
      const fromIndex = group.findIndex((g) => g.id === dragId);
      const r = e.currentTarget.getBoundingClientRect();
      let to = e.clientY < r.top + r.height / 2 ? overIndex : overIndex + 1;
      if (fromIndex < to) to -= 1;
      reorder(work, dragId, to, false); // se persiste en onDragEnd
    },
    [items, belongsTo, bulletsForWork, reorder],
  );

  // ── Descargar PDF ─────────────────────────────────────────────────────────
  // MISMO endpoint y MISMO body que el preview (solo cambia `download`): el PDF
  // que se descarga es, byte a byte, el que estás viendo. Funciona igual sin
  // Supabase, porque el documento viaja en `data`, no en un id de la base.
  const downloadPdf = useCallback(async () => {
    flash(t("editor.stPdfGen"));
    try {
      const res = await fetch("/api/cv", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ data: resumeRef.current, download: true }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (resumeRef.current.basics.name || "corpus").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
      a.download = `CV-${safe}.pdf`;
      a.click();
      // Revocar en el mismo tick corta la descarga en algunos navegadores.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      flash(t("editor.stPdfDone"));
    } catch (e) {
      fail("descarga del PDF", e, "editor.stPdfErr");
    }
  }, [flash, t, fail]);

  // ── Nombre / título objetivo ──
  const onNameBlur = useCallback(
    (e: React.FocusEvent<HTMLSpanElement>) => {
      const name = (e.currentTarget.textContent ?? "").trim();
      if (!name || name === meta?.name) return;
      setMeta((prev) => (prev ? { ...prev, name } : prev));
      patchVariant({ name });
    },
    [meta?.name, patchVariant],
  );
  const onObjBlur = useCallback(() => {
    const t = targetTitle.trim();
    if (t === (meta?.target_title ?? "").trim()) return;
    setMeta((prev) => (prev ? { ...prev, target_title: t } : prev));
    patchVariant({ target_title: t });
  }, [targetTitle, meta?.target_title, patchVariant]);

  // ── Render de una viñeta / item de texto (.var-b + su .var-orig adyacente) ──
  const renderBullet = (b: VItem, work?: VItem) => {
    const ov = b.override_data != null;
    const hidden = !b.visible;
    const editing = editingId === b.id;
    const field = editableField(b.kind);
    const text = field ? S(b.data, field) : "";
    const masterText = field ? S(masterById.get(b.item_id)?.data, field) : "";
    const canDrag = b.kind === "bullet" && !!work;
    return (
      <Fragment key={b.id}>
        <div
          className={"var-b" + (ov ? " ovr" : "") + (hidden ? " hid" : "") + (draggingId === b.id ? " dragging" : "")}
          data-b={b.id}
          draggable={canDrag && !editing}
          onDragStart={canDrag ? () => onDragStart(b.id) : undefined}
          onDragEnd={canDrag ? onDragEnd : undefined}
          onDragOver={canDrag && work ? (e) => onDragOver(e, b, work) : undefined}
        >
          {canDrag && work ? (
            <button
              type="button"
              className="grip"
              data-grip={b.id}
              title={t("editor.gripTitle")}
              aria-label={t("editor.gripAria")}
              onKeyDown={(e) => onGripKey(e, b, work)}
            >
              ⠿
            </button>
          ) : (
            <span className="grip" aria-hidden="true">
              ⠿
            </span>
          )}
          <span
            className="tx"
            data-edit=""
            contentEditable={editing}
            suppressContentEditableWarning
            ref={editing ? editRef : undefined}
            onBlur={editing ? finishEdit : undefined}
            onKeyDown={editing ? onEditKeyDown : undefined}
          >
            {text}
          </span>
          <span className="bacts">
            <button type="button" data-a="hide" title={t("editor.hideTitle")} onClick={() => toggleHide(b.id)}>
              {hidden ? t("editor.show") : t("editor.hide")}
            </button>
            {field ? (
              <button type="button" data-a="edit" title={t("editor.tuneTitle")} onClick={() => startEdit(b.id)}>
                {t("editor.tune")}
              </button>
            ) : null}
            <button type="button" data-a="out" title={t("editor.removeFromVariant")} onClick={() => removeItem(b.id)}>
              ×
            </button>
          </span>
        </div>
        {ov && (
          <div className="var-orig">
            <span>
              {t("editor.original")} {masterText}
            </span>
            <button type="button" className="rv" data-rv={b.id} onClick={() => revert(b.id)}>
              {t("editor.revert")}
            </button>
          </div>
        )}
      </Fragment>
    );
  };

  // ── Biblioteca (master): filas filtradas por substring del texto visible ──
  const q = libQ.trim().toLowerCase();
  const libText = (m: MasterRow): string => {
    switch (m.kind) {
      case "summary":
        return S(m.data, "text");
      case "work":
        return [S(m.data, "title"), S(m.data, "company")].filter(Boolean).join(" · ");
      case "bullet":
        return S(m.data, "text");
      case "skill":
        return [S(m.data, "group"), S(m.data, "items")].filter(Boolean).join(": ");
      case "project":
        return [S(m.data, "name"), S(m.data, "description")].filter(Boolean).join(" — ");
      case "education":
        return [S(m.data, "degree"), S(m.data, "institution")].filter(Boolean).join(" · ");
      default:
        return "";
    }
  };
  const libRow = (m: MasterRow, node?: React.ReactNode) => {
    const text = libText(m);
    if (q && !text.toLowerCase().includes(q)) return null;
    const inV = vItemByMaster.has(m.id);
    return (
      <div className={"lib-row" + (inV ? " in" : "")} data-lib={m.id} key={m.id}>
        <span className="tx">{node ?? text}</span>
        <button
          type="button"
          className="add"
          title={inV ? t("editor.removeFromVariant") : t("editor.addToVariant")}
          aria-pressed={inV}
          onClick={() => void toggleFromLib(m.id)}
        >
          {inV ? "✓" : "+"}
        </button>
      </div>
    );
  };

  // ── Grupos del master para la biblioteca ──
  const mSummary = master.filter((m) => m.kind === "summary");
  const mWorks = master.filter((m) => m.kind === "work").sort((a, b) => a.sort_order - b.sort_order);
  const mBulletsOf = (workId: string) =>
    master.filter((m) => m.kind === "bullet" && m.parent_id === workId).sort((a, b) => a.sort_order - b.sort_order);
  const mSkills = master.filter((m) => m.kind === "skill");
  const mProjects = master.filter((m) => m.kind === "project");
  const mEducation = master.filter((m) => m.kind === "education");
  const libCount =
    mSummary.length +
    mWorks.reduce((n, w) => n + 1 + mBulletsOf(w.id).length, 0) +
    mSkills.length +
    mProjects.length +
    mEducation.length;

  // ── Grupos de la variante (centro) ──
  const summaryItems = items.filter((i) => i.kind === "summary");
  const workItems = items.filter((i) => i.kind === "work").sort(bySort);
  const skillItems = items.filter((i) => i.kind === "skill").sort(bySort);
  const projectItems = items.filter((i) => i.kind === "project").sort(bySort);
  const eduItems = items.filter((i) => i.kind === "education").sort(bySort);
  // basics es IDENTIDAD (portador de foto/QR), no una referencia que el usuario
  // compuso: se excluye de los conteos y del "¿variante vacía?".
  const contentItems = items.filter((i) => i.kind !== "basics");
  const overrideCount = contentItems.filter((i) => i.override_data != null).length;
  const midN = t("editor.midN")
    .replace("{n}", String(contentItems.length))
    .replace("{m}", String(overrideCount));
  const isEmpty = !loading && contentItems.length === 0;

  const setTab = (v: View) => setView(v);

  return (
    <div className="c-page">
      {/* La pantalla más densa del producto: el humo al mínimo perceptible. */}
      <AuroraTune strength={AURORA_TRABAJO} />
      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/app">
            Corpus
          </Link>
          <nav className="hd-nav">
            <Link href="/app">{t("nav.panel")}</Link>
            <Link href="/app/master">{t("nav.master")}</Link>
            <Link href="/app/variantes" aria-current="page">
              {t("nav.variantes")}
            </Link>
            <Link href="/app/fuentes">{t("nav.fuentes")}</Link>
          </nav>
          <div className="hd-right">
            <Link href="/app/ajustes" className="hd-nav" style={{ display: "inline-flex" }}>
              <span
                style={{ font: "500 var(--fs-ui)/1 var(--font-sans)", color: "var(--text-muted)", padding: "9px 12px" }}
              >
                {t("nav.ajustes")}
              </span>
            </Link>
            <div className="hd-lang">
              <span data-on>ES</span>
              <span>EN</span>
            </div>
            <div className="hd-av">DG</div>
          </div>
        </div>
      </header>

      <div className="ed-bar" data-screen-label="editor-toolbar">
        <div className="c-container">
          <Link className="bk" href="/app/variantes">
            {t("editor.backToVariants")}
          </Link>
          <span style={{ width: "1px", height: "16px", background: "var(--border-strong)" }} />
          <span
            key={meta?.id ?? "nm"}
            className="nm"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            aria-label={t("editor.nameAria")}
            onBlur={onNameBlur}
          >
            {meta?.name ?? t("editor.defaultVariantName")}
          </span>
          <span
            className="st"
            id="edState"
            role="status"
            style={stAccent ? { color: "var(--accent-text)" } : undefined}
          >
            {stMsg || t("editor.stIdle")}
          </span>
          <span className="acts">
            {confirmDelete ? (
              <span className="ed-delconfirm" role="group" aria-label={t("editor.deleteConfirm")}>
                <span className="q">{t("editor.deleteConfirm")}</span>
                <button type="button" className="c-btn c-btn--quiet" onClick={() => setConfirmDelete(false)}>
                  {t("editor.deleteCancel")}
                </button>
                <button type="button" className="c-btn ed-del-yes" onClick={() => void doDeleteVariant()}>
                  {t("editor.deleteYes")}
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="c-btn c-btn--quiet ed-del-btn"
                onClick={() => setConfirmDelete(true)}
              >
                {t("editor.deleteVariant")}
              </button>
            )}
            <Link className="c-btn c-btn--quiet" href={`/app/variantes/${variantId}/tailor`}>
              {t("common.tailor")}
            </Link>
            <Link className="c-btn c-btn--quiet" href={`/app/variantes/${variantId}/salud`}>
              {t("common.health")}
            </Link>
            <button type="button" className="c-btn c-btn--patina" id="btnPdf" onClick={() => void downloadPdf()}>
              {t("common.downloadPdf")}
            </button>
          </span>
        </div>
      </div>

      <div className="ed-tabs" role="group" aria-label={t("editor.tabsAria")}>
        <button type="button" data-view="master" aria-pressed={view === "master"} onClick={() => setTab("master")}>
          {t("editor.tabMaster")}
        </button>
        <button type="button" data-view="mid" aria-pressed={view === "mid"} onClick={() => setTab("mid")}>
          {t("editor.tabThis")}
        </button>
        <button type="button" data-view="preview" aria-pressed={view === "preview"} onClick={() => setTab("preview")}>
          {t("editor.tabPreview")}
        </button>
      </div>

      <div className="ed-grid c-wall" id="edGrid" data-view={view} data-screen-label="editor-3-paneles" ref={bootRef}>
        {/* ── MASTER (biblioteca) ── */}
        <aside className="ed-col ed-col--lib" data-screen-label="editor-master">
          <div className="ed-colh">
            <span className="t-overline">{t("editor.libOverline")}</span>
            <span className="n">{t("editor.libCount").replace("{n}", String(libCount))}</span>
          </div>
          <div className="lib-search">
            <input
              className="c-input"
              id="libQ"
              placeholder={t("editor.libSearchPlaceholder")}
              aria-label={t("editor.libSearchAria")}
              value={libQ}
              onChange={(e) => setLibQ(e.target.value)}
            />
          </div>
          <div id="lib">
            {mSummary.length > 0 && (
              <div className="lib-g">
                <span className="t-overline">{t("editor.groupSummary")}</span>
                {mSummary.map((m) => libRow(m, S(m.data, "text").slice(0, 80) + (S(m.data, "text").length > 80 ? "…" : "")))}
              </div>
            )}
            {mWorks.length > 0 && (
              <div className="lib-g">
                <span className="t-overline">{t("editor.groupWorkBullets")}</span>
                {mWorks.map((w) => (
                  <Fragment key={w.id}>
                    {libRow(w, (
                      <>
                        <b style={{ color: "var(--text)" }}>{S(w.data, "title")}</b>
                        {S(w.data, "company") ? " · " + S(w.data, "company") : ""}
                      </>
                    ))}
                    {mBulletsOf(w.id).map((b) => libRow(b))}
                  </Fragment>
                ))}
              </div>
            )}
            {mSkills.length > 0 && (
              <div className="lib-g">
                <span className="t-overline">{t("editor.groupSkills")}</span>
                {mSkills.map((s) =>
                  libRow(s, (
                    <>
                      <b style={{ color: "var(--text)" }}>{S(s.data, "group")}:</b> {S(s.data, "items")}
                    </>
                  )),
                )}
              </div>
            )}
            {mProjects.length > 0 && (
              <div className="lib-g">
                <span className="t-overline">{t("editor.groupProjects")}</span>
                {mProjects.map((p) => libRow(p))}
              </div>
            )}
            {mEducation.length > 0 && (
              <div className="lib-g">
                <span className="t-overline">{t("editor.groupEducation")}</span>
                {mEducation.map((d) => libRow(d))}
              </div>
            )}
          </div>
          <p style={{ margin: "20px 18px 30px", font: "400 10px/1.7 var(--font-mono)", color: "var(--text-subtle)" }}>
            {t("editor.libFootA")} <b style={{ color: "var(--text-muted)" }}>{t("editor.libFootRef")}</b>{" "}
            {t("editor.libFootB")}
          </p>
        </aside>

        {/* ── ESTA VARIANTE (composición) ── */}
        <section className="ed-col ed-col--mid" data-screen-label="editor-composicion">
          <div className="ed-colh">
            <span className="t-overline">{t("editor.midOverline")}</span>
            <span className="n" id="midN">
              {loading ? t("editor.reading") : midN}
            </span>
          </div>
          <div className="c-card var-obj">
            <label htmlFor="objInput">
              {t("editor.objLabel")}{" "}
              <span style={{ letterSpacing: 0, textTransform: "none", color: "var(--text-subtle)" }}>
                {t("editor.objLabelHint")}
              </span>
            </label>
            <input
              className="c-input"
              id="objInput"
              value={targetTitle}
              spellCheck={false}
              placeholder={t("editor.objPlaceholder")}
              onChange={(e) => setTargetTitle(e.target.value)}
              onBlur={onObjBlur}
            />
            <p className="hint">
              {t("editor.objHintA")} <b>{t("editor.objHintBold")}</b> {t("editor.objHintB")}
            </p>
          </div>

          {/* ── Contacto por variante — se imprime en el CUERPO; hereda del master ── */}
          <div className="c-card var-contact" data-screen-label="editor-contacto">
            <div className="presh">
              <span className="t-overline">{t("editor.contactOverline")}</span>
              <span className="n">{t("editor.contactHint")}</span>
            </div>
            {(["name", "email", "phone", "location"] as const).map((field) => {
              const eff = S(basicsData, field);
              const overridden = field in basicsOverride;
              return (
                <div className="cfield" key={field}>
                  <label className="f" htmlFor={`c-${field}`}>
                    {t(`editor.contact_${field}`)}
                    {overridden && (
                      <button type="button" className="crev" onClick={() => revertContact(field)}>
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
                    onBlur={(e) => onContactBlur(field, e.target.value)}
                  />
                </div>
              );
            })}

            <div className="cfield">
              <label className="f">
                {t("editor.contactLinks")}
                {"links" in basicsOverride && (
                  <button type="button" className="crev" onClick={() => revertContact("links")}>
                    {t("editor.contactRevert")}
                  </button>
                )}
              </label>
              <div className="clinks">
                {linkRows.map((r, i) => (
                  <div className="clink" key={i}>
                    <input
                      className="c-input lbl"
                      value={r.label}
                      placeholder={t("editor.contactLinkLabel")}
                      aria-label={t("editor.contactLinkLabel")}
                      onChange={(e) => updateLinkRow(i, "label", e.target.value)}
                      onBlur={() => commitLinks(linkRows)}
                    />
                    <input
                      className="c-input url"
                      value={r.url}
                      type="url"
                      inputMode="url"
                      placeholder={t("editor.contactLinkUrl")}
                      aria-label={t("editor.contactLinkUrl")}
                      onChange={(e) => updateLinkRow(i, "url", e.target.value)}
                      onBlur={() => commitLinks(linkRows)}
                    />
                    <button
                      type="button"
                      className="clink-rm"
                      title={t("editor.contactRemoveLink")}
                      aria-label={t("editor.contactRemoveLink")}
                      onClick={() => removeLinkRow(i)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" className="caddlink" onClick={addLinkRow}>
                  + {t("editor.contactAddLink")}
                </button>
              </div>
            </div>
            <p className="note">{t("editor.contactSeedHint")}</p>
          </div>

          {/* ── Diseño del documento: plantilla · paleta · tipografía ──
              YA NO SON TRES DESPLEGABLES. Con treinta plantillas un <select> es
              inservible: aquí va la plantilla activa CON SU MINIATURA (la página 1
              del PDF real, con tus datos) y un botón que abre la galería. La paleta
              y la pareja tipográfica son chips —la paleta muestra su acento—, no
              listas donde el nombre no dice nada.
              La gama visual sigue llevando su aviso a la vista: se elige informado. */}
          <div className="c-card var-design" data-screen-label="editor-diseno">
            <div className="presh">
              <span className="t-overline">{t("editor.designOverline")}</span>
              <span className="n">{t("editor.designHint")}</span>
            </div>

            <div className="cfield">
              <label className="f">{t("editor.designTemplate")}</label>
              <div className="tplrow">
                <TemplateThumb
                  data={resumeData}
                  docHash={thumbDocHash}
                  templateId={designTemplateId}
                  paletteId={designPaletteId}
                  typographyId={designTypographyId}
                  alt={t("editor.gal_thumbAlt").replace("{name}", activeTemplate.name)}
                />
                <div className="tplinfo">
                  <span className="tplname">{activeTemplate.name}</span>
                  <span className="tpldesc">{activeTemplate.description}</span>
                  <button
                    type="button"
                    className="c-btn c-btn--quiet tplopen"
                    aria-haspopup="dialog"
                    onClick={() => setGalleryOpen(true)}
                  >
                    {t("editor.designBrowse").replace("{n}", String(TEMPLATES.length))}
                  </button>
                </div>
              </div>
              {activeTemplate.warning ? (
                <p className="note warn">⚠ {activeTemplate.warning}</p>
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
                  aria-pressed={designPaletteId === ""}
                  onClick={() => savePresentation({ paletteId: null })}
                >
                  {t("editor.designFromTemplate")}
                </button>
                {PALETTES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="dchip"
                    aria-pressed={designPaletteId === p.id}
                    onClick={() => savePresentation({ paletteId: p.id })}
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
                  aria-pressed={designTypographyId === ""}
                  onClick={() => savePresentation({ typographyId: null })}
                >
                  {t("editor.designFromTemplate")}
                </button>
                {TYPOGRAPHIES.map((ty) => (
                  <button
                    key={ty.id}
                    type="button"
                    className="dchip"
                    aria-pressed={designTypographyId === ty.id}
                    onClick={() => savePresentation({ typographyId: ty.id })}
                  >
                    {ty.name}
                  </button>
                ))}
              </div>
              <p className="note">{t("editor.designNote")}</p>
            </div>
          </div>

          {hasBasics && (
            <div className="c-card var-pres" data-screen-label="editor-presentacion">
              <div className="presh">
                <span className="t-overline">{t("editor.presOverline")}</span>
                <span className="n">{t("editor.presHint")}</span>
              </div>

              {/* Foto — opt-in, versión visual. NUNCA el avatar de la cuenta. */}
              <div className="prow">
                <label className="ptog">
                  <input
                    type="checkbox"
                    checked={photoOn}
                    aria-label={t("editor.photoOnAria")}
                    onChange={(e) => togglePhoto(e.target.checked)}
                  />
                  {t("editor.photoLabel")}
                </label>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => void onPhotoFile(e.target.files?.[0] ?? null)}
                />
                {photoOn && (
                  <div className="pbody">
                    <div className="photo-row">
                      {isPhotoDataUrl(photoUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="photo-thumb" alt={t("editor.photoAlt")} src={photoUrl} />
                      ) : null}
                      <div className="photo-acts">
                        <button
                          type="button"
                          className="c-btn c-btn--quiet"
                          aria-busy={busyPhoto}
                          onClick={() => photoInputRef.current?.click()}
                        >
                          {t("editor.photoChange")}
                        </button>
                        <button type="button" className="c-btn c-btn--quiet" onClick={() => togglePhoto(false)}>
                          {t("editor.photoRemove")}
                        </button>
                      </div>
                    </div>
                  </div>
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
                    checked={qrChecked}
                    aria-label={t("editor.qrOnAria")}
                    onChange={(e) => toggleQr(e.target.checked)}
                  />
                  {t("editor.qrLabel")}
                </label>
                {qrChecked && (
                  <div className="pbody">
                    <label className="f" htmlFor="qrMode">
                      {t("editor.qrModeLabel")}
                    </label>
                    <select
                      id="qrMode"
                      className="c-input"
                      value={qrMode}
                      onChange={(e) => changeQrMode(e.target.value as "url" | "vcard")}
                    >
                      <option value="url">{t("editor.qrModeUrl")}</option>
                      <option value="vcard">{t("editor.qrModeVcard")}</option>
                    </select>

                    {qrMode === "vcard" ? (
                      <p className="note">{t("editor.qrVcardNote")}</p>
                    ) : (
                      <>
                        <label className="f" htmlFor="qrLink">
                          {t("editor.qrLinkLabel")}
                        </label>
                        {linkOptions.length > 0 && (
                          <select
                            id="qrLink"
                            className="c-input"
                            value={qrCustomMode ? "__custom__" : qrUrl}
                            onChange={(e) => onQrSelect(e.target.value)}
                          >
                            {linkOptions.map((l) => (
                              <option key={l.url} value={l.url}>
                                {l.label ? `${l.label} — ${l.url}` : l.url}
                              </option>
                            ))}
                            <option value="__custom__">{t("editor.qrCustom")}</option>
                          </select>
                        )}
                        {(qrCustomMode || linkOptions.length === 0) && (
                          <input
                            className="c-input"
                            type="url"
                            inputMode="url"
                            placeholder={t("editor.qrCustomPlaceholder")}
                            defaultValue={qrUrl}
                            onBlur={(e) => onQrCustomInput(e.target.value)}
                          />
                        )}
                        {linkOptions.length === 0 && <p className="note">{t("editor.qrNoLinks")}</p>}
                      </>
                    )}
                  </div>
                )}
                <p className="note warn">{t("editor.qrNote")}</p>
                {/* Y cuándo NO sirve. El QR no se vende como ventaja: se dice en
                    qué caso ayuda —el papel en la mano— y en cuál estorba. */}
                <p className="note">{t("editor.qrHonest")}</p>
              </div>
            </div>
          )}

          {!isEmpty && (
            <div id="mid">
              {summaryItems.length > 0 && (
                <div className="var-g">
                  <div className="gh">
                    <span className="t-overline">{t("editor.groupSummary")}</span>
                  </div>
                  <div className="var-exp">{summaryItems.map((s) => renderBullet(s))}</div>
                </div>
              )}

              {workItems.length > 0 && (
                <div className="var-g">
                  <div className="gh">
                    <span className="t-overline">{t("editor.groupExperience")}</span>
                    <span className="n">{t("editor.datesFromMaster")}</span>
                  </div>
                  {workItems.map((w) => (
                    <div className="var-exp" data-exp={w.item_id} key={w.id}>
                      <div className="var-eh">
                        <span className="tt">{S(w.data, "title")}</span>
                        <span className="org">
                          {[S(w.data, "company"), S(w.data, "dates")].filter(Boolean).join(" · ")}
                        </span>
                        <span className="bacts" style={{ marginLeft: "auto", display: "flex", gap: "1px" }}>
                          <button
                            type="button"
                            data-a="out"
                            title={t("editor.removeRoleTitle")}
                            onClick={() => removeItem(w.id)}
                            style={{ font: "400 11px/1 var(--font-mono)", color: "var(--text-subtle)", padding: "4px 6px" }}
                          >
                            ×
                          </button>
                        </span>
                      </div>
                      {bulletsForWork(w).map((b) => renderBullet(b, w))}
                    </div>
                  ))}
                </div>
              )}

              {skillItems.length > 0 && (
                <div className="var-g">
                  <div className="gh">
                    <span className="t-overline">{t("editor.groupSkillsFull")}</span>
                  </div>
                  <div className="var-chips">
                    {skillItems.map((s) => (
                      <span className="c-chip" key={s.id}>
                        <b>{S(s.data, "group")}</b>{" "}
                        {t("editor.skillItemsCount").replace(
                          "{n}",
                          String(S(s.data, "items").split(",").filter(Boolean).length),
                        )}
                        <button type="button" data-out={s.item_id} title={t("editor.removeTitle")} onClick={() => removeItem(s.id)}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {projectItems.length > 0 && (
                <div className="var-g">
                  <div className="gh">
                    <span className="t-overline">{t("editor.groupProjects")}</span>
                  </div>
                  <div className="var-exp">{projectItems.map((p) => renderBullet(p))}</div>
                </div>
              )}

              {eduItems.length > 0 && (
                <div className="var-g">
                  <div className="gh">
                    <span className="t-overline">{t("editor.groupEducation")}</span>
                  </div>
                  <div className="var-exp">
                    {eduItems.map((d) => (
                      <div className="var-b" data-b={d.id} key={d.id}>
                        <span className="grip" aria-hidden="true">
                          ⠿
                        </span>
                        <span className="tx">
                          {[S(d.data, "degree"), S(d.data, "institution"), S(d.data, "dates")]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="bacts">
                          <button
                            type="button"
                            data-a="out"
                            title={t("editor.removeFromVariant")}
                            onClick={() => removeItem(d.id)}
                          >
                            ×
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="var-empty" id="midEmpty" hidden={!isEmpty}>
            <span className="t-overline">{t("editor.emptyOverline")}</span>
            {t("editor.emptyLine1")}
            <br />
            {t("editor.emptyLine2A")} <b>+</b> {t("editor.emptyLine2B")}
          </div>
          <div style={{ height: "40px" }} />
        </section>

        {/* ── PREVIEW: el preview ES el PDF ── */}
        <section className="ed-col pv-col" data-screen-label="editor-preview">
          <div className="pv-tools">
            <div className="pv-seg" role="group" aria-label={t("editor.segAria")}>
              <button type="button" id="segDoc" aria-pressed={mode === "doc"} onClick={() => setMode("doc")}>
                {t("editor.viewDoc")}
              </button>
              <button type="button" id="segRaw" aria-pressed={mode === "raw"} onClick={() => setMode("raw")}>
                {t("editor.viewRaw")}
              </button>
            </div>
            {/* Estado HONESTO del preview: actualizando · error · páginas reales
                (numPages del PDF que estás viendo, no una estimación del DOM). */}
            <span className="pv-pages" id="pvPages">
              {pvBusy ? (
                <span className="pv-busy">{t("editor.pvUpdating")}</span>
              ) : pvError ? (
                <span className="warn">{t("editor.pvFailedShort")}</span>
              ) : pageCount === 0 ? (
                t("editor.pvNoPages")
              ) : pageCount <= 2 ? (
                t("editor.pageLabel")
                  .replace("{a}", String(Math.min(pageCount, 1)))
                  .replace("{b}", String(pageCount))
              ) : (
                <span className="warn">{t("editor.pagesWarn").replace("{n}", String(pageCount))}</span>
              )}
            </span>
          </div>
          <div className="pv-scroll" ref={pvScrollRef}>
            <div className="pv-fit c-xray" id="xray" data-mode={mode}>
              <div className="c-xray__doc pv-doc" id="pvDoc">
                {pvError ? (
                  <div className="pv-fail" role="alert">
                    <span className="t-overline">{t("editor.pvErrTitle")}</span>
                    <p className="why">{pvError}</p>
                    <button
                      type="button"
                      className="c-btn c-btn--quiet"
                      onClick={() => setPvRetry((n) => n + 1)}
                    >
                      {t("editor.pvRetry")}
                    </button>
                  </div>
                ) : pdfUrl ? (
                  // EL PDF REAL. No es una maqueta del PDF: son los bytes que
                  // devuelve /api/cv, los mismos que baja el botón Descargar.
                  <iframe className="pv-frame" src={pdfUrl} title={t("editor.pvFrameTitle")} />
                ) : (
                  <div className="pv-fail" aria-live="polite">
                    <span className="t-overline">{t("editor.pvBuilding")}</span>
                  </div>
                )}
              </div>
              <div className="c-xray__raw" id="pvRawWrap" style={{ width: "100%" }}>
                {/* Rayos-X: el texto que unpdf extrajo de ESE PDF. Cero generadores
                    paralelos — si el parser no lo lee, aquí no aparece. */}
                <div className="pv-raw" id="pvRaw">
                  <span className="cap">{t("editor.xrayLegend")}</span>
                  {pvError ? pvError : xrayText}
                </div>
              </div>
            </div>
          </div>
          <div className="pv-foot">{t("editor.previewFoot")}</div>
        </section>
      </div>

      {/* La galería. Las miniaturas son la página 1 del PDF REAL renderizado con
          ESTE mismo `resumeData` — el que ya viaja al preview grande y a la
          descarga. Cerrarla no pierde nada: cada elección se guardó al hacerla. */}
      <TemplateGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        templates={TEMPLATES}
        activeTemplateId={designTemplateId}
        paletteId={designPaletteId}
        typographyId={designTypographyId}
        palettes={PALETTES}
        typographies={TYPOGRAPHIES}
        data={resumeData}
        docSig={docSig}
        recommendations={recommendations}
        onPickTemplate={(id) => savePresentation({ templateId: id })}
        onPickPalette={(id) => savePresentation({ paletteId: id || null })}
        onPickTypography={(id) => savePresentation({ typographyId: id || null })}
      />
    </div>
  );
}
