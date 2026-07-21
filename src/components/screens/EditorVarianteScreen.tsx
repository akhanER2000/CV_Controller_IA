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
  referenceLine,
  referencesOptIn,
  type PresentationPatch,
  type ResumeData,
  type ReferenceFields,
  type I18n,
} from "@/lib/cv/resume";
// El catálogo se auto-registra al importarse y no toca APIs de servidor: el selector
// del editor lee las MISMAS plantillas que usa el render, no una copia.
import { listTemplates, listPalettes, listTypographies, getTemplate } from "@/lib/cv/templates";
// Solo la función PURA de sugerencia y su tipo. db/references.ts importa
// SupabaseClient con `import type`, así que esto no arrastra nada de servidor al
// bundle del navegador — y la regla de qué se sugiere queda escrita UNA vez.
import { suggestReferences, type ReferenceView } from "@/lib/db/references";
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
  /** quién escribió este texto: 'manual' | 'ai_rephrased' | null (hereda del master) */
  override_origin: string | null;
  /** ¿el override pasó el control de hechos? (solo lo pone un override de IA) */
  override_verified: boolean;
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

/* ── Contrato de POST /api/variants/[id]/ajustar (src/lib/cv/ajuste.ts) ──────
   Se redeclara aquí, como el resto de shapes de esta pantalla, para no arrastrar
   zod ni verify.ts al bundle del cliente por un puñado de campos. Ojo: NO hay
   ningún `score` ni ningún porcentaje, y no es un olvido — el único número del
   panel es `sobran`, que sale de MEDIR el PDF. */
interface FitQuitar { id: string; kind: string; texto: string; motivo: string }
interface FitReordenar { id: string; kind: string; texto: string; parentId: string; desde: number; hasta: number }
interface FitAcortar {
  id: string; kind: string; campo: string;
  original: string; propuesto: string; motivo: string; ahorro: number;
}
type FitTipoFalta = "sin-cifra" | "sin-fecha" | "sin-respaldo";
interface FitFalta { id: string; kind: string; texto: string; tipo: FitTipoFalta; detalle: string }
interface FitDescartado { tipo: string; id: string; propuesto: string; razon: string }
interface Fit {
  paginas: number;
  paginasObjetivo: number;
  /** líneas que sobran, MEDIDAS sobre el PDF. Negativo = sobra sitio. */
  sobran: number;
  quitar: FitQuitar[];
  reordenar: FitReordenar[];
  acortar: FitAcortar[];
  falta: FitFalta[];
  descartados: FitDescartado[];
  notas: string;
}
/** decisión del usuario sobre UNA propuesta. No existe "todas". */
type FitMark = "ok" | "no" | "undo";

/** Etiqueta de cada hueco. El texto lo pone i18n; aquí solo el mapa. */
const FIT_GAP_KEY: Record<FitTipoFalta, string> = {
  "sin-cifra": "editor.fitGapNumber",
  "sin-fecha": "editor.fitGapDate",
  "sin-respaldo": "editor.fitGapEvidence",
};

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
    override_origin: (r.override_origin as string | null) ?? null,
    override_verified: Boolean(r.override_verified),
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
    // ⚠⚠ REFERENCIAS — el MISMO interruptor y la MISMA composición que el servidor
    // (referencesOptIn + referenceLine, los dos de resume.ts). Es lo que impide que
    // el preview y el PDF descargado discrepen justo en los datos de terceros: si
    // aquí se decidiera «encendido» por otro criterio, el usuario vería en pantalla
    // un CV con el teléfono de su jefe que el PDF real no lleva, o al revés.
    references: referencesOptIn(basicsData)
      ? by("reference")
          .map((r) => {
            const linea = referenceLine(r.data as ReferenceFields);
            return { p1: true, es: linea, en: linea };
          })
          .filter((r) => r.es.trim() !== "")
      : [],
    headings: {
      summary: i18nBoth("Resumen"),
      skills: i18nBoth("Habilidades"),
      work: i18nBoth("Experiencia"),
      projects: i18nBoth("Proyectos"),
      education: i18nBoth("Educación"),
      references: i18nBoth("Referencias"),
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
      override_origin: null,
      override_verified: false,
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

/* ============================================================================
   PUNTO 5 · ACORDEÓN DE LA BIBLIOTECA — lógica PURA y testeable
   ----------------------------------------------------------------------------
   La columna izquierda pintaba el master DE CORRIDO; con 105 items no se navega.
   Estas funciones deciden, SIN tocar el DOM, qué grupos existen, qué filas
   sobreviven al buscador y qué cuenta va en cada cabecera. Se extraen del
   componente por la MISMA razón que buildEditorResumeData: en este repo los
   tests corren en Node (sin DOM), así que lo único demostrable de una pantalla
   es su lógica pura.

   ⚠ Y aquí hay una TRAMPA real que probar. El filtrado de búsqueda ocurría
   DENTRO de la fila (libRow devolvía null si no casaba), no antes: la cabecera y
   su contador salían del master SIN filtrar. Consecuencia: al buscar, un grupo
   podía pintar cabecera y CERO filas, y un contador basado en esa longitud diría
   «12» con nada a la vista. Por eso el plan se calcula ANTES de pintar: el
   contador cuenta lo que DE VERDAD se pinta, y saber qué grupos tienen resultados
   es lo que permite auto-desplegar solo esos. */

/** Las secciones de la biblioteca, EN ORDEN de pintado. Son EXACTAMENTE los
 *  grupos que ya existían. No se inventan «Certificaciones» ni «Idiomas» como
 *  sección propia: el modelo de datos no los agrupa así (los idiomas viven como
 *  un grupo de skills, p. ej. «Idiomas: Español nativo, Inglés B2»), y pintar una
 *  sección que jamás tendrá filas sería ruido, no una ayuda. */
export type LibSectionId = "summary" | "work" | "skills" | "projects" | "education" | "references";
export const LIB_SECTIONS: readonly LibSectionId[] = [
  "summary",
  "work",
  "skills",
  "projects",
  "education",
  "references",
] as const;

/** El kind del master → su sección de biblioteca. 'bullet' cae en 'work' porque
 *  una viñeta se lee bajo su rol. Un kind sin grupo propio (certification,
 *  language, publication, link, basics) devuelve null: no tiene columna. */
export function libSectionOfKind(kind: string): LibSectionId | null {
  switch (kind) {
    case "summary":
      return "summary";
    case "work":
    case "bullet":
      return "work";
    case "skill":
      return "skills";
    case "project":
      return "projects";
    case "education":
      return "education";
    case "reference":
      return "references";
    default:
      return null;
  }
}

/** Texto buscable de un item del master. Módulo-scope y puro: es el MISMO texto
 *  que se pinta, para que «buscar lo que veo» encuentre «lo que hay». Espeja el
 *  libText que usaba el componente; la referencia usa referenceLine (idéntico a
 *  lo que saldría impreso), no una versión resumida que engañe. */
export function libTextOf(kind: string, data: Record<string, unknown>): string {
  switch (kind) {
    case "summary":
      return S(data, "text");
    case "work":
      return [S(data, "title"), S(data, "company")].filter(Boolean).join(" · ");
    case "bullet":
      return S(data, "text");
    case "skill":
      return [S(data, "group"), S(data, "items")].filter(Boolean).join(": ");
    case "project":
      return [S(data, "name"), S(data, "description")].filter(Boolean).join(" — ");
    case "education":
      return [S(data, "degree"), S(data, "institution")].filter(Boolean).join(" · ");
    case "reference":
      return referenceLine(data as ReferenceFields);
    default:
      return "";
  }
}

/** ¿el item casa con la consulta (ya recortada y en minúsculas)? Consulta vacía
 *  = todo casa. */
function libMatch(m: MasterRow, q: string): boolean {
  return q === "" || libTextOf(m.kind, m.data).toLowerCase().includes(q);
}

/** Una fila del plan: la fila del master y si es viñeta (para sangrarla y no
 *  contarla como rol). */
export interface LibRowPlan {
  row: MasterRow;
  isBullet: boolean;
}

/** El plan de un grupo YA filtrado: las filas a pintar en orden, si el grupo
 *  existe en el master, si algo sobrevivió al filtro, y los conteos de lo que se
 *  pinta (roles/viñetas para work; total para el resto). */
export interface LibGroupPlan {
  id: LibSectionId;
  rows: LibRowPlan[];
  /** ¿el master tiene datos de este grupo (SIN filtrar)? decide si hay cabecera */
  present: boolean;
  /** ¿queda ≥1 fila tras el filtro? decide auto-desplegado y ocultar-al-buscar */
  hasMatches: boolean;
  roles: number;
  bullets: number;
  /** total de filas pintadas (roles + viñetas en work) */
  count: number;
}

/**
 * El plan COMPLETO de la biblioteca a partir del master y la consulta. Filtra
 * ANTES de pintar (ese es el arreglo del bug del contador) y arma el grupo de
 * experiencia como lo que es: roles con sus viñetas intercaladas.
 *
 * Regla de la búsqueda en experiencia, pensada para que sirva para AÑADIR:
 *   · sin consulta            → el rol y TODAS sus viñetas.
 *   · el rol casa             → el rol y TODAS sus viñetas (contexto completo).
 *   · solo casan viñetas      → la cabecera del rol + esas viñetas (para no
 *                               dejarlas huérfanas, como pasaba antes).
 *   · no casa nada del rol    → el rol entero desaparece.
 */
export function computeLibPlan(master: MasterRow[], query: string): LibGroupPlan[] {
  const q = query.trim().toLowerCase();
  const bySo = (a: MasterRow, b: MasterRow) => a.sort_order - b.sort_order;
  const of = (k: string) => master.filter((m) => m.kind === k).sort(bySo);
  const bulletsOf = (id: string) =>
    master.filter((m) => m.kind === "bullet" && m.parent_id === id).sort(bySo);

  const plain = (id: LibSectionId, all: MasterRow[]): LibGroupPlan => {
    const shown = all.filter((m) => libMatch(m, q));
    return {
      id,
      rows: shown.map((row) => ({ row, isBullet: false })),
      present: all.length > 0,
      hasMatches: shown.length > 0,
      roles: 0,
      bullets: 0,
      count: shown.length,
    };
  };

  // Experiencia: lista plana en el DOM (roles y viñetas hermanos), pero el plan
  // los agrupa para poder contarlos por separado y filtrar por rol.
  const works = of("work");
  const workRows: LibRowPlan[] = [];
  let roles = 0;
  let bullets = 0;
  for (const w of works) {
    const bs = bulletsOf(w.id);
    const roleHit = libMatch(w, q);
    const bulletHits = q === "" ? bs : bs.filter((b) => libMatch(b, q));
    let show: MasterRow[] | null = null;
    if (q === "" || roleHit) show = bs;
    else if (bulletHits.length) show = bulletHits;
    else show = null;
    if (show === null) continue;
    workRows.push({ row: w, isBullet: false });
    roles += 1;
    for (const b of show) {
      workRows.push({ row: b, isBullet: true });
      bullets += 1;
    }
  }
  const workGroup: LibGroupPlan = {
    id: "work",
    rows: workRows,
    present: works.length > 0,
    hasMatches: workRows.length > 0,
    roles,
    bullets,
    count: roles + bullets,
  };

  const byId: Record<LibSectionId, LibGroupPlan> = {
    summary: plain("summary", of("summary")),
    work: workGroup,
    skills: plain("skills", of("skill")),
    projects: plain("projects", of("project")),
    education: plain("education", of("education")),
    references: plain("references", of("reference")),
  };
  return LIB_SECTIONS.map((id) => byId[id]);
}

/**
 * Qué secciones se abren SOLAS: al buscar, las que TIENEN resultados; y siempre
 * la sección del item que se edita en el centro (para verlo en su contexto). Es
 * una capa que se SUPERPONE al plegado manual: no lo borra. Al limpiar el
 * buscador, cada sección vuelve al estado que el usuario recordaba.
 */
export function forcedOpenSections(
  plan: LibGroupPlan[],
  query: string,
  editingSection: LibSectionId | null,
): Set<LibSectionId> {
  const out = new Set<LibSectionId>();
  if (query.trim()) for (const g of plan) if (g.hasMatches) out.add(g.id);
  if (editingSection) out.add(editingSection);
  return out;
}

/** ¿esta sección está desplegada? Una forzada-abierta gana; si no, está abierta
 *  salvo que el usuario la haya plegado a mano. */
export function libSectionOpen(
  id: LibSectionId,
  folded: ReadonlySet<string>,
  forced: ReadonlySet<LibSectionId>,
): boolean {
  if (forced.has(id)) return true;
  return !folded.has(id);
}

/* ── Persistencia del plegado ────────────────────────────────────────────────
   El estado de plegado es PREFERENCIA DE UI, no un dato del usuario: no pasa por
   user_settings (vocabulario cerrado) ni por el servidor. localStorage es lo
   razonable —vive en el navegador, sobrevive a la sesión y su pérdida no rompe
   nada (todo vuelve desplegado). Puro y exportado para poder probarlo con un
   stub de localStorage. */
export const LIB_FOLD_KEY = "corpus.editor.libFolded";

export function loadFoldedFrom(store: Pick<Storage, "getItem"> | null | undefined): Set<string> {
  if (!store) return new Set();
  try {
    const raw = store.getItem(LIB_FOLD_KEY);
    if (!raw) return new Set();
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    // localStorage puede lanzar (modo privado, cuota, JSON corrupto): degradar a
    // «nada plegado» es correcto, callar el motivo no.
    return new Set();
  }
}

export function saveFoldedTo(
  store: Pick<Storage, "setItem"> | null | undefined,
  folded: ReadonlySet<string>,
): void {
  if (!store) return;
  try {
    store.setItem(LIB_FOLD_KEY, JSON.stringify([...folded]));
  } catch {
    /* sin persistencia hoy; la UI sigue funcionando en memoria */
  }
}

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
  /* Las REFERENCIAS del master con sus VÍNCULOS. Se piden aparte de la variante
     porque los vínculos viven en su propia tabla (reference_links) y GET
     /api/variants/[id] no los trae. Solo sirven para SUGERIR: nada se añade solo. */
  const [refs, setRefs] = useState<ReferenceView[]>([]);
  /* HUECO ARREGLADO: GET /api/references devuelve migracionPendiente cuando faltan
     las migraciones 0004/0005, y antes el editor lo tiraba con setRefs([]) EN
     SILENCIO. El usuario veía una biblioteca sin referencias y ni una pista. Ahora
     el motivo (migración pendiente o error real) se guarda y se pinta donde el
     usuario iría a crearlas. */
  const [refsMigracion, setRefsMigracion] = useState(false);
  const [refsError, setRefsError] = useState("");
  /* PUNTO 5 · plegado del acordeón de la biblioteca. Set de LibSectionId plegadas.
     Preferencia de UI que SOBREVIVE a la sesión (localStorage). Nace vacío y se
     hidrata en un efecto de montaje, NO en el inicializador: leer localStorage en
     el primer render rompería la hidratación de Next (el HTML del servidor no
     tiene localStorage, así que pintaría todo desplegado y el cliente discreparía).
     El ref marca que ya se hidrató, para que el efecto de guardado no escriba el
     Set vacío inicial encima de lo que había guardado. */
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const foldedHydrated = useRef(false);
  /* PUNTO 6 · formulario de alta de referencia DESDE el editor. Nace cerrado; se
     abre solo cuando el master no tiene ninguna (ver más abajo). El borrador es
     local hasta pulsar «Añadir»: nada entra al master a medio escribir. */
  const [refFormOpen, setRefFormOpen] = useState(false);
  const [refDraft, setRefDraft] = useState<ReferenceFields>({});
  const [refSaving, setRefSaving] = useState(false);
  const [refFormErr, setRefFormErr] = useState("");
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

  /* Los VÍNCULOS de las referencias. Efecto aparte del de la variante: si las
     migraciones 0004/0005 aún no están aplicadas, esto devuelve lista vacía y el
     editor sigue funcionando entero — lo único que se pierde es la SUGERENCIA, que
     es una ayuda, no un dato del documento. */
  useEffect(() => {
    if (!supabaseEnabled) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/references");
        if (!res.ok) throw new Error(await readApiError(res));
        const j = (await res.json()) as { references?: ReferenceView[]; migracionPendiente?: boolean };
        if (!active) return;
        setRefs(j.references ?? []);
        // NO se descarta en silencio: si faltan las migraciones, se recuerda para
        // pintar el aviso real donde el usuario querría crear una referencia, en
        // vez de mostrarle una biblioteca vacía sin explicación.
        setRefsMigracion(j.migracionPendiente === true);
        setRefsError("");
      } catch (e) {
        // No se calla: sin esto, «¿por qué no me sugiere a mi jefe?» no se depura.
        console.error("[editor] no se pudieron leer las referencias", e);
        if (active) {
          setRefs([]);
          setRefsError(reason(e));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
          { id: p.basicsItemId, item_id: p.masterBasicsId ?? "", kind: "basics", visible: true, sort_order: -1,
            override_data: ov, override_origin: ov ? "manual" : null, override_verified: false, data, parent_id: null },
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
          sort_order: -1, override_data: nextOv, override_origin: "manual", override_verified: false,
          data: nextData, parent_id: null,
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
  // rowHint: la fila del master cuando TODAVÍA no está en masterById — es el caso
  // de una referencia recién creada desde el editor, cuyo setMaster aún no se ha
  // reflejado en este render. Sin él, postItem saldría en vacío y la referencia
  // nueva no se añadiría a la variante.
  const postItem = useCallback(
    async (masterId: string, rowHint?: MasterRow) => {
      const m = masterById.get(masterId) ?? rowHint;
      if (!m || items.some((i) => i.item_id === masterId)) return;
      const tmpId = "tmp-" + Math.random().toString(36).slice(2);
      const optimistic: VItem = {
        id: tmpId,
        item_id: m.id,
        kind: m.kind,
        visible: true,
        sort_order: nextSortOrder(m.kind),
        override_data: null,
        override_origin: null,
        override_verified: false,
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

  /* ── PUNTO 6 · crear una referencia DESDE el editor ───────────────────────────
     LA REGLA DEL PRODUCTO, INTACTA: una referencia creada desde la variante TAMBIÉN
     ENTRA AL MASTER. El master es la fuente de verdad; no se crean datos huérfanos
     dentro de una variante. La variante decide cuáles se IMPRIMEN, no cuáles
     existen. Por eso el gesto son dos pasos encadenados y verificables:
       1) POST /api/references  → nace en el master (origin 'manual').
       2) postItem(ref.id, hint)→ se añade a ESTA variante.
     El `hint` es imprescindible: setMaster no se ve en este mismo render, así que
     postItem no encontraría la fila por masterById sin él. */
  const createReferenceFromEditor = useCallback(async () => {
    const nombre = String(refDraft.name ?? "").trim();
    if (!nombre) {
      // El servidor también lo exige (invalidReferenceData), pero decirlo aquí
      // ahorra un viaje y no deja el foco perdido.
      setRefFormErr(tRef.current("editor.refFormNameReq"));
      return;
    }
    if (!supabaseEnabled) {
      // Sin backend no hay dónde crearla; se dice, no se finge que se guardó.
      setRefFormErr(tRef.current("editor.fitLocal"));
      return;
    }
    setRefSaving(true);
    setRefFormErr("");
    try {
      const res = await fetch("/api/references", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ data: refDraft }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const { reference } = (await res.json()) as { reference?: ReferenceView };
      if (!reference) throw new Error("La respuesta no trae la referencia creada.");
      // 1) que la biblioteca y las sugerencias la vean YA.
      setRefs((prev) => [...prev, reference]);
      const fila: MasterRow = {
        id: reference.id,
        kind: "reference",
        data: reference.data,
        parent_id: null,
        sort_order: reference.sortOrder,
      };
      setMaster((prev) => (prev.some((m) => m.id === fila.id) ? prev : [...prev, fila]));
      // 2) añadirla a esta variante (con hint, porque el master aún no se refleja).
      await postItem(reference.id, fila);
      setRefDraft({});
      setRefFormOpen(false);
      flash(tRef.current("editor.refFormSaved"));
    } catch (e) {
      // Se destapa el motivo real (403 sin sesión, 503 migración pendiente, 400 de
      // validación…): un formulario que falla en mudo es peor que no tenerlo.
      console.error("[editor] no se pudo crear la referencia", e);
      setRefFormErr(tRef.current("editor.refFormErr").replace("{r}", reason(e)));
    } finally {
      setRefSaving(false);
    }
  }, [refDraft, postItem, flash]);

  // ── PUNTO 5 · plegar/desplegar y persistir ──
  const toggleFold = useCallback((id: string) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const foldAll = useCallback(() => setFolded(new Set(LIB_SECTIONS)), []);
  const expandAll = useCallback(() => setFolded(new Set<string>()), []);
  // Hidratar desde localStorage UNA vez, ya montado en el cliente (evita el desajuste
  // de hidratación de leerlo en el primer render).
  useEffect(() => {
    setFolded(loadFoldedFrom(typeof window === "undefined" ? null : window.localStorage));
    foldedHydrated.current = true;
  }, []);
  // El plegado se persiste cuando cambia. Efecto aparte (no en el handler) para que
  // foldAll/expand/toggle escriban por el mismo sitio. NO escribe hasta hidratar:
  // así el Set vacío inicial no pisa lo guardado antes de leerlo.
  useEffect(() => {
    if (!foldedHydrated.current) return;
    saveFoldedTo(typeof window === "undefined" ? null : window.localStorage, folded);
  }, [folded]);

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

  /* ── «Ajustar a dos páginas» — una PROPUESTA, nunca una aplicación ─────────
     MANUAL, SIEMPRE. El servidor mide el PDF real y devuelve qué quitar, qué
     reordenar, qué acortar y qué falta. Aquí no se aplica NADA hasta que el
     usuario pulsa Aceptar en UNA fila concreta. No hay «aceptar todo» y no es un
     hueco del diseño: un CV que se reordena solo es un CV en el que se deja de
     confiar.

     Cada acción reutiliza el camino que ya existía y que ya estaba probado:
     quitar → removeItem, reordenar → reorder (el mismo que el arrastre y las
     flechas), acortar → la ruta, que VUELVE a pasar el candado antes de escribir.

     Por qué vive DENTRO del editor y no en una pantalla propia: la propuesta solo
     significa algo al lado del documento que la motiva. El número que la encabeza
     («sobran ~14 líneas») sale de medir el PDF que está en la tercera columna, y
     el efecto de aceptar se ve ahí mismo, en el preview, sin cambiar de pantalla y
     sin volver a cargar nada. Una ruta aparte habría convertido una revisión en un
     viaje de ida y vuelta — que es exactamente lo que le pasa a /tailor. */
  const [fitOpen, setFitOpen] = useState(false);
  const [fitBusy, setFitBusy] = useState(false);
  const [fitErr, setFitErr] = useState("");
  const [fit, setFit] = useState<Fit | null>(null);
  /** decisión del usuario por propuesta ("q:id" | "r:id" | "a:id") */
  const [fitDone, setFitDone] = useState<Record<string, FitMark>>({});
  /** el override que había ANTES de aceptar un acortado — sin esto, Revertir miente */
  const fitPrev = useRef<Record<string, Record<string, unknown> | null>>({});

  const mark = useCallback((k: string, v: FitMark) => setFitDone((p) => ({ ...p, [k]: v })), []);

  const runFit = useCallback(() => {
    if (!supabaseEnabled) {
      setFitErr(t("editor.fitLocal"));
      return;
    }
    setFitBusy(true);
    setFitErr("");
    void (async () => {
      try {
        const res = await fetch(`/api/variants/${variantId}/ajustar`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ accion: "analizar", paginas: 2 }),
        });
        if (!res.ok) throw new Error(await readApiError(res));
        const { ajuste } = (await res.json()) as { ajuste?: Fit };
        if (!ajuste) throw new Error("La respuesta no trae la propuesta.");
        setFit(ajuste);
        setFitDone({});
        fitPrev.current = {};
      } catch (e) {
        console.error("[editor] no se pudo armar la propuesta de ajuste", e);
        setFitErr(reason(e));
        flash(t("editor.fitErr").replace("{r}", reason(e)));
      } finally {
        setFitBusy(false);
      }
    })();
  }, [variantId, t, flash]);

  const fitAcceptDrop = useCallback(
    (p: FitQuitar) => {
      removeItem(p.id);
      mark(`q:${p.id}`, "ok");
    },
    [removeItem, mark],
  );

  const fitAcceptMove = useCallback(
    (p: FitReordenar) => {
      // parentId es el id del MASTER del rol; el reorder trabaja con el variant_item.
      const work = items.find((i) => i.kind === "work" && i.item_id === p.parentId);
      if (!work) return;
      reorder(work, p.id, p.hasta, true);
      mark(`r:${p.id}`, "ok");
      flash(t("editor.stReordered"));
    },
    [items, reorder, mark, flash, t],
  );

  /**
   * Aceptar UN acortado. El texto NO se escribe aquí y se avisa al servidor: se
   * escribe EN el servidor, que vuelve a pasar el candado antes de guardar. Si lo
   * rechaza, el motivo real sube a la barra de estado y el documento no se toca —
   * el optimismo se aplica DESPUÉS de que el servidor diga que sí, precisamente
   * porque este es el único cambio del editor que puede perder un hecho.
   */
  const fitAcceptShorten = useCallback(
    (p: FitAcortar) => {
      void (async () => {
        try {
          const res = await fetch(`/api/variants/${variantId}/ajustar`, {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({ accion: "acortar", id: p.id, propuesto: p.propuesto }),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          fitPrev.current[p.id] = items.find((i) => i.id === p.id)?.override_data ?? null;
          setItems((prev) =>
            prev.map((i) =>
              i.id === p.id
                ? {
                    ...i,
                    override_data: { ...(i.override_data ?? {}), [p.campo]: p.propuesto },
                    override_origin: "ai_rephrased",
                    override_verified: true,
                    data: { ...i.data, [p.campo]: p.propuesto },
                  }
                : i,
            ),
          );
          mark(`a:${p.id}`, "ok");
          flash(t("editor.stOvrSaved"));
        } catch (e) {
          fail(`acortado del item ${p.id}`, e, "editor.fitErr");
        }
      })();
    },
    [variantId, items, mark, flash, t, fail],
  );

  /** Revertir: vuelve al override que HABÍA (o al master si no había ninguno). */
  const fitRevertShorten = useCallback(
    (p: FitAcortar) => {
      const antes = fitPrev.current[p.id] ?? null;
      patchItem(p.id, { override_data: antes });
      setItems((prev) =>
        prev.map((i) =>
          i.id === p.id
            ? {
                ...i,
                override_data: antes,
                override_origin: antes ? "manual" : null,
                override_verified: false,
                data: { ...i.data, [p.campo]: p.original },
              }
            : i,
        ),
      );
      mark(`a:${p.id}`, "undo");
      flash(t("editor.fitReverted"));
    },
    [patchItem, mark, flash, t],
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

  // ── Biblioteca (master): el PLAN de grupos, ya filtrado ANTES de pintar ──
  // (ver computeLibPlan y la nota del bug del contador arriba). El texto buscable
  // es la función pura libTextOf, compartida con el plan: buscar «lo que veo».
  const q = libQ.trim().toLowerCase();
  const libText = (m: MasterRow): string => libTextOf(m.kind, m.data);

  // El plan y los conteos estructurales se MEMOIZAN: antes los seis filtros y
  // mBulletsOf recorrían el master entero en cada render (y con contadores por
  // grupo eso solo crece). Ahora se recalculan solo si cambia el master o la
  // consulta.
  const libPlan = useMemo(() => computeLibPlan(master, libQ), [master, libQ]);
  const mReferences = useMemo(() => master.filter((m) => m.kind === "reference"), [master]);
  // El total de la cabecera de columna es ESTRUCTURAL (toda la biblioteca), no el
  // filtrado: dice cuánto hay, no cuánto se ve ahora mismo.
  const libCount = useMemo(
    () =>
      master.reduce(
        (n, m) => (libSectionOfKind(m.kind) ? n + 1 : n),
        0,
      ),
    [master],
  );

  // La sección del item que se edita en el centro: se auto-despliega y se resalta.
  const editingSection = useMemo<LibSectionId | null>(() => {
    if (!editingId) return null;
    const it = items.find((i) => i.id === editingId);
    return it ? libSectionOfKind(it.kind) : null;
  }, [editingId, items]);
  // Qué secciones se abren solas (búsqueda con resultados + la que se edita).
  const forcedOpen = useMemo(
    () => forcedOpenSections(libPlan, libQ, editingSection),
    [libPlan, libQ, editingSection],
  );
  // Los grupos que SE PINTAN: presentes y —al buscar— solo los que tienen filas.
  const visibleGroups = libPlan.filter((g) => g.present && (q === "" || g.hasMatches));
  const anyMatches = libPlan.some((g) => g.hasMatches);
  // El control «plegar/desplegar todo» es UN botón que refleja el estado: si todo
  // lo presente está plegado, ofrece desplegar; si no, plegar.
  const presentIds = libPlan.filter((g) => g.present).map((g) => g.id);
  const allFolded = presentIds.length > 0 && presentIds.every((id) => folded.has(id));

  // Etiqueta con singular/plural honesto por sección.
  const plural = (n: number, kOne: string, kMany: string) =>
    t(n === 1 ? kOne : kMany).replace("{n}", String(n));
  const groupTitle = (id: LibSectionId): string =>
    t(
      id === "summary"
        ? "editor.groupSummary"
        : id === "work"
          ? "editor.groupWorkBullets"
          : id === "skills"
            ? "editor.groupSkills"
            : id === "projects"
              ? "editor.groupProjects"
              : id === "education"
                ? "editor.groupEducation"
                : "editor.groupReferences",
    );
  const groupCountLabel = (g: LibGroupPlan): string =>
    g.id === "work"
      ? `${plural(g.roles, "editor.libNRole", "editor.libNRoles")} · ${plural(g.bullets, "editor.libNBullet", "editor.libNBullets")}`
      : plural(g.count, "editor.libNItem", "editor.libNItems");

  // El nodo interior de una fila del master (título en negrita para rol/skill,
  // resumen recortado); el resto es su texto plano.
  const libRowNode = (m: MasterRow): React.ReactNode => {
    switch (m.kind) {
      case "summary": {
        const txt = S(m.data, "text");
        return txt.slice(0, 80) + (txt.length > 80 ? "…" : "");
      }
      case "work":
        return (
          <>
            <b style={{ color: "var(--text)" }}>{S(m.data, "title")}</b>
            {S(m.data, "company") ? " · " + S(m.data, "company") : ""}
          </>
        );
      case "skill":
        return (
          <>
            <b style={{ color: "var(--text)" }}>{S(m.data, "group")}:</b> {S(m.data, "items")}
          </>
        );
      default:
        return libTextOf(m.kind, m.data);
    }
  };
  // Una fila del plan. Ya viene filtrada, así que NO vuelve a decidir visibilidad.
  const libRow = (m: MasterRow, isBullet: boolean) => {
    const inV = vItemByMaster.has(m.id);
    return (
      <div
        className={"lib-row" + (inV ? " in" : "") + (isBullet ? " lib-bullet" : "")}
        data-lib={m.id}
        key={m.id}
      >
        <span className="tx">{libRowNode(m)}</span>
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

  // ── Grupos de la variante (centro) ──
  const summaryItems = items.filter((i) => i.kind === "summary");
  const workItems = items.filter((i) => i.kind === "work").sort(bySort);
  const skillItems = items.filter((i) => i.kind === "skill").sort(bySort);
  const projectItems = items.filter((i) => i.kind === "project").sort(bySort);
  const eduItems = items.filter((i) => i.kind === "education").sort(bySort);
  const refItems = items.filter((i) => i.kind === "reference").sort(bySort);

  /* ── B · EL INTERRUPTOR Y LA SUGERENCIA ─────────────────────────────────────
     `refsOn` sale del MISMO helper que usa el servidor (referencesOptIn): si aquí
     se leyera el flag "a mano", el preview podría decir que sí y el PDF que no.

     La sugerencia es literalmente eso: aparece cuando una referencia está anclada a
     algo que YA está en la variante y ella todavía no. Se PROPONE con su motivo
     («trabajasteis juntos en X») y un botón. Nada se añade solo — meter datos de
     una tercera persona en un CV sin que nadie lo pulse sería exactamente lo que
     este producto promete no hacer. */
  const refsOn = referencesOptIn(basicsData);
  const itemIdsEnVariante = items.filter((i) => i.visible).map((i) => i.item_id);
  const refsSugeridas = suggestReferences(
    refs,
    itemIdsEnVariante,
    refItems.map((r) => r.item_id),
  );
  const masterLabel = (id: string): string => {
    const m = masterById.get(id);
    return m ? libText(m) : id;
  };

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
            <button
              type="button"
              className="c-btn c-btn--quiet ed-fit-open"
              aria-expanded={fitOpen}
              aria-controls="edFit"
              onClick={() => {
                const abrir = !fitOpen;
                setFitOpen(abrir);
                // Abrir NO analiza: analizar cuesta un render de PDF y una llamada al
                // modelo, y nadie pidió nada todavía. Se analiza al pulsar Analizar.
                if (abrir) setTab("mid");
              }}
            >
              {t("editor.fitOpen")}
            </button>
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
            {/* Plegar / desplegar todo: UN control que refleja el estado. Al buscar
                el plegado se ignora (mandan las secciones con resultados), pero el
                botón sigue vivo porque decide cómo quedará al limpiar el buscador. */}
            {presentIds.length > 0 && (
              <button
                type="button"
                className="lib-foldall"
                onClick={allFolded ? expandAll : foldAll}
              >
                {allFolded ? t("editor.libExpandAll") : t("editor.libFoldAll")}
              </button>
            )}
          </div>
          <div id="lib">
            {/* ACORDEÓN: una sección por grupo, con su contador (que cuenta lo que
                SE PINTA, no el master sin filtrar), su plegado recordado entre
                sesiones y auto-desplegado al buscar / al editar su item. */}
            {visibleGroups.map((g) => {
              const open = libSectionOpen(g.id, folded, forcedOpen);
              const highlighted = editingSection === g.id;
              const bodyId = `lib-body-${g.id}`;
              return (
                <section
                  className={"lib-g" + (open ? "" : " folded") + (highlighted ? " lib-editing" : "")}
                  key={g.id}
                  data-lib-section={g.id}
                >
                  <button
                    type="button"
                    className="lib-gh"
                    aria-expanded={open}
                    aria-controls={bodyId}
                    onClick={() => toggleFold(g.id)}
                  >
                    <span className="chev" aria-hidden="true">
                      {open ? "▾" : "▸"}
                    </span>
                    <span className="t-overline">{groupTitle(g.id)}</span>
                    <span className="cnt">{groupCountLabel(g)}</span>
                  </button>
                  {open && (
                    <div className="lib-body" id={bodyId}>
                      {/* Referencias: añadirlas a la variante NO las imprime. Para
                          eso hace falta además el interruptor de la tarjeta de
                          presentación, y el aviso lo dice aquí, que es cuando
                          importa, para que nadie lo descubra al abrir el PDF. */}
                      {g.id === "references" && <p className="lib-note">{t("editor.refsWhenOn")}</p>}
                      {g.rows.map((r) => libRow(r.row, r.isBullet))}
                    </div>
                  )}
                </section>
              );
            })}
            {/* Búsqueda sin ninguna coincidencia: se dice, no se deja la columna en
                blanco como si el master estuviera vacío. */}
            {q !== "" && !anyMatches && <p className="lib-empty">{t("editor.libNoMatches")}</p>}
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

          {/* ── Propuesta de ajuste. Cada fila se acepta o se rechaza SOLA. ── */}
          {fitOpen && (
            <section className="c-card fit" id="edFit" aria-label={t("editor.fitAria")}>
              <div className="fith">
                <span className="t-overline">{t("editor.fitTitle").replace("{p}", "2")}</span>
                <button type="button" className="c-btn c-btn--quiet fitx" onClick={() => setFitOpen(false)}>
                  {t("editor.fitClose")}
                </button>
              </div>

              {/* EL NÚMERO. Sale de contar las líneas del PDF real, y lo dice. */}
              {fit && (
                <div className="fitn">
                  {fit.sobran > 0 ? (
                    <>
                      <b className="big">{t("editor.fitOver").replace("{n}", String(fit.sobran))}</b>
                      <span className="sub">
                        {t("editor.fitOverSub")
                          .replace("{p}", String(fit.paginas))
                          .replace("{o}", String(fit.paginasObjetivo))}
                      </span>
                    </>
                  ) : (
                    <>
                      <b className="big ok">{t("editor.fitFits").replace("{o}", String(fit.paginasObjetivo))}</b>
                      <span className="sub">{t("editor.fitFitsSub").replace("{n}", String(-fit.sobran))}</span>
                    </>
                  )}
                </div>
              )}

              <div className="fitrun">
                <button type="button" className="c-btn c-btn--patina" disabled={fitBusy} onClick={runFit}>
                  {fitBusy ? t("editor.fitBusy") : fit ? t("editor.fitRerun") : t("editor.fitRun")}
                </button>
                {fit && <span className="fitmanual">{t("editor.fitManual")}</span>}
              </div>

              {fitErr && <p className="fiterr" role="status">{fitErr}</p>}

              {fit && (
                <>
                  {/* 1 · QUÉ QUITAR */}
                  <div className="fitsec">
                    <div className="fitsech">
                      <span className="t-overline">{t("editor.fitSecRemove")}</span>
                      <span className="sub">
                        {t("editor.fitSecRemoveSub").replace("{t}", targetTitle || t("editor.objPlaceholder"))}
                      </span>
                    </div>
                    {fit.quitar.length === 0 && <p className="fitempty">{t("editor.fitEmpty")}</p>}
                    {fit.quitar.map((p) => (
                      <div className="fitrow" key={`q:${p.id}`}>
                        <p className="txt">{p.texto}</p>
                        {p.motivo && <p className="why">{p.motivo}</p>}
                        {fitDone[`q:${p.id}`] === "ok" ? (
                          <span className="fitok">{t("editor.fitAccepted")}</span>
                        ) : fitDone[`q:${p.id}`] === "no" ? (
                          <span className="fitno">{t("editor.fitRejected")}</span>
                        ) : (
                          <span className="fitacts">
                            <button type="button" className="c-btn c-btn--quiet" onClick={() => mark(`q:${p.id}`, "no")}>
                              {t("editor.fitReject")}
                            </button>
                            <button type="button" className="c-btn" onClick={() => fitAcceptDrop(p)}>
                              {t("editor.fitAccept")}
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 2 · QUÉ REORDENAR */}
                  <div className="fitsec">
                    <div className="fitsech">
                      <span className="t-overline">{t("editor.fitSecReorder")}</span>
                      <span className="sub">{t("editor.fitSecReorderSub")}</span>
                    </div>
                    {fit.reordenar.length === 0 && <p className="fitempty">{t("editor.fitEmpty")}</p>}
                    {fit.reordenar.map((p) => (
                      <div className="fitrow" key={`r:${p.id}`}>
                        <p className="txt">{p.texto}</p>
                        <p className="why">
                          {t(p.hasta < p.desde ? "editor.fitMoveUp" : "editor.fitMoveDown")
                            .replace("{a}", String(p.desde + 1))
                            .replace("{b}", String(p.hasta + 1))}
                        </p>
                        {fitDone[`r:${p.id}`] === "ok" ? (
                          <span className="fitok">{t("editor.fitAccepted")}</span>
                        ) : fitDone[`r:${p.id}`] === "no" ? (
                          <span className="fitno">{t("editor.fitRejected")}</span>
                        ) : (
                          <span className="fitacts">
                            <button type="button" className="c-btn c-btn--quiet" onClick={() => mark(`r:${p.id}`, "no")}>
                              {t("editor.fitReject")}
                            </button>
                            <button type="button" className="c-btn" onClick={() => fitAcceptMove(p)}>
                              {t("editor.fitAccept")}
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 3 · QUÉ ACORTAR — con el ORIGINAL al lado y REVERTIR.
                      Todo lo que llega hasta aquí ya pasó el candado en el servidor:
                      lo que no lo pasó no está en esta lista, está en el registro
                      de descartados del final. */}
                  <div className="fitsec">
                    <div className="fitsech">
                      <span className="t-overline">{t("editor.fitSecShorten")}</span>
                      <span className="sub">{t("editor.fitSecShortenSub")}</span>
                    </div>
                    {fit.acortar.length === 0 && <p className="fitempty">{t("editor.fitEmpty")}</p>}
                    {fit.acortar.map((p) => (
                      <div className="fitrow fitcut" key={`a:${p.id}`}>
                        <p className="lbl">{t("editor.fitOrigin")}</p>
                        <p className="txt old">{p.original}</p>
                        <p className="lbl">{t("editor.fitProposed")}</p>
                        <p className="txt new">{p.propuesto}</p>
                        <p className="why">
                          {t("editor.fitSaved").replace("{n}", String(p.ahorro))}
                          {p.motivo ? ` · ${p.motivo}` : ""}
                        </p>
                        {fitDone[`a:${p.id}`] === "ok" ? (
                          <span className="fitacts">
                            <span className="fitok">{t("editor.fitAccepted")}</span>
                            <button type="button" className="c-btn c-btn--quiet" onClick={() => fitRevertShorten(p)}>
                              {t("editor.fitRevert")}
                            </button>
                          </span>
                        ) : fitDone[`a:${p.id}`] === "no" ? (
                          <span className="fitno">{t("editor.fitRejected")}</span>
                        ) : (
                          <span className="fitacts">
                            {fitDone[`a:${p.id}`] === "undo" && (
                              <span className="fitno">{t("editor.fitReverted")}</span>
                            )}
                            <button type="button" className="c-btn c-btn--quiet" onClick={() => mark(`a:${p.id}`, "no")}>
                              {t("editor.fitReject")}
                            </button>
                            <button type="button" className="c-btn" onClick={() => fitAcceptShorten(p)}>
                              {t("editor.fitAccept")}
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 4 · QUÉ FALTA — sin botones: esto no lo arregla la IA. */}
                  <div className="fitsec">
                    <div className="fitsech">
                      <span className="t-overline">{t("editor.fitSecGaps")}</span>
                      <span className="sub">{t("editor.fitSecGapsSub")}</span>
                    </div>
                    {fit.falta.length === 0 && <p className="fitempty">{t("editor.fitEmpty")}</p>}
                    {fit.falta.map((p) => (
                      <div className="fitrow fitgap" key={`g:${p.id}:${p.tipo}`}>
                        <span className="gaptag">{t(FIT_GAP_KEY[p.tipo])}</span>
                        <p className="txt">{p.texto}</p>
                        <p className="why">{p.detalle}</p>
                      </div>
                    ))}
                    {fit.falta.length > 0 && <p className="fitempty">{t("editor.fitGapHint")}</p>}
                  </div>

                  {/* El registro de lo que NO se ofrece. Un descarte silencioso y
                      «no había nada que proponer» se ven igual desde fuera. */}
                  {fit.descartados.filter((d) => d.tipo === "acortar").length > 0 && (
                    <div className="fitsec fitdrop">
                      <p className="txt">
                        {t("editor.fitDropped").replace(
                          "{n}",
                          String(fit.descartados.filter((d) => d.tipo === "acortar").length),
                        )}
                      </p>
                      <p className="why">{t("editor.fitDroppedHint")}</p>
                      <ul>
                        {fit.descartados
                          .filter((d) => d.tipo === "acortar")
                          .map((d, i) => (
                            <li key={`${d.id}:${i}`}>{d.razon}</li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {fit.notas && (
                    <div className="fitsec">
                      <div className="fitsech">
                        <span className="t-overline">{t("editor.fitNotes")}</span>
                      </div>
                      <p className="why">{fit.notas}</p>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
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
                    checked={refsOn}
                    aria-label={t("editor.refsOnAria")}
                    onChange={(e) => savePresentation({ showReferences: e.target.checked })}
                  />
                  {t("editor.refsLabel")}
                </label>
                <p className="note">{t("editor.refsWhyOff")}</p>
                <p className="note warn">{t("editor.refsConsent")}</p>
                {refsOn && (
                  <div className="pbody var-refbody">
                    <p className="note">{t("editor.refsWhenOn")}</p>

                    {/* HUECO ARREGLADO: si faltan las migraciones (o la lectura
                        falló), se DICE — antes se tragaba con setRefs([]) y el
                        usuario veía una biblioteca vacía sin ninguna pista. */}
                    {(refsMigracion || refsError) && (
                      <p className="note warn">{refsMigracion ? t("editor.refsMigracion") : refsError}</p>
                    )}

                    {!refsMigracion && (
                      <>
                        {/* CUÁLES IMPRIME ESTA VARIANTE. La lista de referencias del
                            master con un toggle por fila: la variante decide cuáles
                            se imprimen, no cuáles existen. */}
                        {mReferences.length > 0 && (
                          <div className="refchooser">
                            <span className="t-overline">{t("editor.refChooserTitle")}</span>
                            {mReferences.map((r) => {
                              const inV = vItemByMaster.has(r.id);
                              return (
                                <div className={"refchoice" + (inV ? " in" : "")} key={r.id}>
                                  <span className="tx">{referenceLine(r.data as ReferenceFields)}</span>
                                  <button
                                    type="button"
                                    className="c-btn c-btn--quiet"
                                    aria-pressed={inV}
                                    onClick={() => void toggleFromLib(r.id)}
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
                        {refFormOpen || mReferences.length === 0 ? (
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
                              value={refDraft.name ?? ""}
                              placeholder={t("editor.refFieldNamePh")}
                              onChange={(e) => setRefDraft((d) => ({ ...d, name: e.target.value }))}
                            />
                            <label className="f" htmlFor="refFRole">{t("editor.refFieldRole")}</label>
                            <input
                              id="refFRole"
                              className="c-input"
                              value={refDraft.role ?? ""}
                              placeholder={t("editor.refFieldRolePh")}
                              onChange={(e) => setRefDraft((d) => ({ ...d, role: e.target.value }))}
                            />
                            <label className="f" htmlFor="refFOrg">{t("editor.refFieldOrg")}</label>
                            <input
                              id="refFOrg"
                              className="c-input"
                              value={refDraft.org ?? ""}
                              placeholder={t("editor.refFieldOrgPh")}
                              onChange={(e) => setRefDraft((d) => ({ ...d, org: e.target.value }))}
                            />
                            <label className="f" htmlFor="refFRel">{t("editor.refFieldRelation")}</label>
                            <input
                              id="refFRel"
                              className="c-input"
                              value={refDraft.relation ?? ""}
                              placeholder={t("editor.refFieldRelationPh")}
                              onChange={(e) => setRefDraft((d) => ({ ...d, relation: e.target.value }))}
                            />
                            <label className="f" htmlFor="refFEmail">{t("editor.refFieldEmail")}</label>
                            <input
                              id="refFEmail"
                              className="c-input"
                              type="email"
                              inputMode="email"
                              value={refDraft.email ?? ""}
                              placeholder={t("editor.refFieldEmailPh")}
                              onChange={(e) => setRefDraft((d) => ({ ...d, email: e.target.value }))}
                            />
                            <label className="f" htmlFor="refFPhone">{t("editor.refFieldPhone")}</label>
                            <input
                              id="refFPhone"
                              className="c-input"
                              type="tel"
                              inputMode="tel"
                              value={refDraft.phone ?? ""}
                              placeholder={t("editor.refFieldPhonePh")}
                              onChange={(e) => setRefDraft((d) => ({ ...d, phone: e.target.value }))}
                            />

                            {refFormErr && <p className="note warn refferr">{refFormErr}</p>}
                            <div className="reffacts">
                              {mReferences.length > 0 && (
                                <button
                                  type="button"
                                  className="c-btn c-btn--quiet"
                                  onClick={() => {
                                    setRefFormOpen(false);
                                    setRefFormErr("");
                                    setRefDraft({});
                                  }}
                                >
                                  {t("editor.refFormCancel")}
                                </button>
                              )}
                              <button
                                type="button"
                                className="c-btn c-btn--patina"
                                disabled={refSaving}
                                onClick={() => void createReferenceFromEditor()}
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
                              setRefFormOpen(true);
                              setRefFormErr("");
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
                    {refItems.length === 0 && !refsMigracion && (
                      <p className="note warn">{t("editor.refsNoneInVariant")}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* La SUGERENCIA vive fuera de la tarjeta de presentación porque no es un
              ajuste: es una propuesta sobre el contenido. Aparece esté el
              interruptor como esté — tener la referencia a mano en el master es
              útil aunque esta candidatura no la imprima. */}
          {refsSugeridas.length > 0 && (
            <div className="c-card var-refsug" data-screen-label="editor-refs-sugeridas">
              <span className="t-overline">{t("editor.refsSuggestTitle")}</span>
              {refsSugeridas.map((s) => {
                const ref = refs.find((r) => r.id === s.referenceId);
                if (!ref) return null;
                return (
                  <div className="refsug-row" key={s.referenceId}>
                    <span className="tx">
                      <b>{referenceLine(ref.data as ReferenceFields)}</b>
                      <em>
                        {t("editor.refsSuggestBody").replace(
                          "{items}",
                          s.becauseOf.map(masterLabel).join(" · "),
                        )}
                      </em>
                    </span>
                    <button type="button" className="c-btn c-btn--quiet" onClick={() => void toggleFromLib(s.referenceId)}>
                      {t("editor.refsSuggestAdd")}
                    </button>
                  </div>
                );
              })}
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

              {/* Referencias AÑADIDAS a esta variante. Estar aquí no basta para que
                  se impriman: el interruptor de la tarjeta de presentación manda, y
                  si está apagado se dice aquí mismo en vez de dejar al usuario
                  creyendo que el PDF las lleva. */}
              {refItems.length > 0 && (
                <div className="var-g">
                  <div className="gh">
                    <span className="t-overline">{t("editor.groupReferences")}</span>
                    <span className="n">{refsOn ? t("editor.refsWhenOn") : t("editor.refsWhyOff")}</span>
                  </div>
                  <div className="var-exp">
                    {refItems.map((r) => (
                      <div className="var-b" data-b={r.id} key={r.id}>
                        <span className="grip" aria-hidden="true">
                          ⠿
                        </span>
                        <span className="tx">{referenceLine(r.data as ReferenceFields)}</span>
                        <span className="bacts">
                          <button
                            type="button"
                            data-a="out"
                            title={t("editor.removeFromVariant")}
                            onClick={() => removeItem(r.id)}
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
