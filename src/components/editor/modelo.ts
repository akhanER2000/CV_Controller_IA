/* ============================================================================
   Editor de variante · MODELO PURO (sin React). Tipos del contrato de API, el
   puente estado → ResumeData, el plan de la biblioteca y utilidades. Separado
   de la pantalla para poder probarlo en Node (los tests no tienen DOM).
   ============================================================================ */
import {
  normalizeLinks,
  linkUrl,
  linkLabel,
  mergePresentationOverride,
  normalizeSectionOrder,
  documentSections,
  metricsOf,
  referenceLine,
  referencesOptIn,
  certificationEntry,
  languageLine,
  publicationLine,
  DOCUMENT_HEADINGS,
  SECTION_ORDER_FIELD,
  type PresentationPatch,
  type ResumeData,
  type ReferenceFields,
  type CertificationFields,
  type LanguageFields,
  type PublicationFields,
  type I18n,
} from "@/lib/cv/resume";
// El catálogo se auto-registra al importarse y no toca APIs de servidor: el selector
// del editor lee las MISMAS plantillas que usa el render, no una copia.
import {
  listTemplates,
  listPalettes,
  listTypographies,
  getTemplate,
  resolveMetrics,
  PINNED_LAST_SECTION,
  SECTION_ORDER_PRESETS,
  type SectionId,
} from "@/lib/cv/templates";

// Listas estables (el catálogo no cambia en runtime): fuera de cualquier componente.
export const TEMPLATES = listTemplates();
export const PALETTES = listPalettes();
export const TYPOGRAPHIES = listTypographies();

export const JSON_HEADERS = { "Content-Type": "application/json" } as const;

// ── Shapes del contrato de API ──────────────────────────────────────────────
export interface MasterRow {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  parent_id: string | null;
  sort_order: number;
}
export interface VItem {
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
export interface VMeta {
  id: string;
  name: string;
  target_title: string | null;
  lang: string;
  updated_at?: string;
  master_updated_at?: string;
  /** páginas objetivo guardadas en la base (0009); sin la columna llega 2. */
  paginas_objetivo?: number;
}

/* El contrato de /ajustar, el del autofit y el reparto de la propuesta sobre los
   items viven en src/components/flujo-cv.ts (puro, probado en flujo-cv.test.ts). */

/** Páginas que el usuario puede pedir (el servidor normaliza igual: autofit.objetivoDe). */
export type Objetivo = 1 | 2 | 3;
export const OBJETIVOS: readonly Objetivo[] = [1, 2, 3];
/** Las dos funciones de ajuste.ts que el cliente usa para «qué falta». */
export type MotorFaltas = Pick<typeof import("@/lib/cv/ajuste"), "calcularFaltas" | "itemDeAjuste">;

// Campo de texto editable por kind (override "por campo").
export const EDIT_FIELD: Record<string, string> = { summary: "text", bullet: "text", project: "description" };
export const editableField = (kind: string): string | null => EDIT_FIELD[kind] ?? null;

export const S = (o: Record<string, unknown> | null | undefined, k: string): string => {
  const v = o?.[k];
  return v == null ? "" : String(v);
};
export const bySort = (a: VItem, b: VItem) => a.sort_order - b.sort_order;

/** El motivo REAL de un fallo, en texto. Es lo que ve el usuario: nunca "algo falló". */
export const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Motivo legible de una respuesta HTTP fallida. /api/cv y /api/variants devuelven
 * { error } con el mensaje real; si el cuerpo no es JSON se usa el texto crudo, y
 * si no hay cuerpo, el código. Nunca devuelve "" (un error mudo no es un error).
 */
export async function readApiError(res: Response): Promise<string> {
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
export const isPhotoDataUrl = (s: string): boolean => /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/]+=*$/i.test(s);

/** Blob de PDF a partir del base64 que devuelve /api/cv (`as:'preview'`). */
export function pdfBlobFromBase64(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}

// Reduce la imagen elegida a una data-URL liviana (máx 512 px, JPEG q.85): una foto
// de CV no necesita más y así el override de basics no se infla. NUNCA es el avatar.
export async function fileToPhotoDataUrl(file: File): Promise<string> {
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
export function pickDefaultQrLink(links: { url: string; label: string }[]): string {
  if (!links.length) return "";
  const host = (u: string) => u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase();
  const web = links.find((l) => {
    const h = host(l.url);
    return !h.startsWith("github.com") && !h.startsWith("linkedin.com");
  });
  return (web ?? links[0]!).url;
}

export function normalizeIncoming(raw: unknown): VItem {
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
export const i18nBoth = (v: string): I18n => ({ es: v, en: v });

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
    // ORDEN DE SECCIONES de esta variante. Viaja DENTRO del documento (no por una
    // ruta aparte), así que el preview embebido —que es el PDF— se reordena en vivo
    // con el mismo `data` que descarga el botón Descargar.
    sectionOrder: normalizeSectionOrder(basicsData[SECTION_ORDER_FIELD]) ?? undefined,
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
    // CERTIFICACIONES · IDIOMAS · PUBLICACIONES — sin interruptor: son datos del
    // propio usuario. Mismos helpers puros que buildVariantResumeData, para que el
    // preview y el PDF del servidor no puedan discrepar.
    certifications: by("certification").map((c) => {
      const e = certificationEntry(c.data as CertificationFields);
      return { title: i18nBoth(e.title), org: e.org, dates: i18nBoth(e.dates), p1: true };
    }).filter((c) => c.title.es.trim() !== "" || c.org.trim() !== ""),
    languages: by("language").map((l) => {
      const linea = languageLine(l.data as LanguageFields);
      return { p1: true, es: linea, en: linea };
    }).filter((l) => l.es.trim() !== ""),
    publications: by("publication").map((p) => {
      const linea = publicationLine(p.data as PublicationFields);
      return { p1: true, es: linea, en: linea };
    }).filter((p) => p.es.trim() !== ""),
    // Los rótulos salen de la ÚNICA fuente (resume.ts), no de una copia local: eran
    // tres listas de literales iguales en tres capas, y ampliar dos de las tres es
    // exactamente cómo se pierde una sección en una sola de ellas.
    headings: DOCUMENT_HEADINGS,
  };
}

// ── Fallback del MODO LOCAL (persona Diego Gatica) — jamás con Supabase ──────
export function buildFallback(variantId: string): { master: MasterRow[]; items: VItem[]; meta: VMeta } {
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

export type Mode = "doc" | "raw";
export type View = "master" | "mid" | "preview";

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

/**
 * Las secciones de la biblioteca, EN ORDEN de pintado.
 *
 * ⚠ AQUÍ ESTABA EL AGUJERO. Este comentario decía que no se inventaban
 * «Certificaciones» ni «Idiomas» porque «el modelo de datos no los agrupa así» — y
 * era FALSO: el enum item_kind acepta certification, language y publication desde el
 * esquema 0001, la pantalla del master deja crearlos y el corpus.md los importa. Lo
 * que pasaba es que el DOCUMENTO no sabía pintarlos, así que la biblioteca los
 * escondía y el usuario tenía tres certificados guardados que no podía meter en
 * ningún CV, sin un solo aviso. Ahora que el documento tiene esas secciones, la
 * biblioteca las ofrece como cualquier otra: un grupo sin filas no se pinta (present
 * = false), así que quien no tenga certificados no ve nada nuevo.
 */
export type LibSectionId =
  | "summary"
  | "work"
  | "skills"
  | "projects"
  | "education"
  | "certifications"
  | "languages"
  | "publications"
  | "references";
export const LIB_SECTIONS: readonly LibSectionId[] = [
  "summary",
  "work",
  "skills",
  "projects",
  "education",
  "certifications",
  "languages",
  "publications",
  "references",
] as const;

/** El kind del master → su sección de biblioteca. 'bullet' cae en 'work' porque
 *  una viñeta se lee bajo su rol. Un kind sin sección en el DOCUMENTO (link,
 *  basics) devuelve null: `link` y `basics` son contacto, y el contacto va en la
 *  cabecera, que no se compone ni se reordena desde aquí. */
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
    case "certification":
      return "certifications";
    case "language":
      return "languages";
    case "publication":
      return "publications";
    case "reference":
      return "references";
    default:
      return null;
  }
}

/**
 * El rótulo de cada sección, en un mapa EXHAUSTIVO por SectionId. Si nace una
 * sección y nadie le pone rótulo, TS lo dice aquí en vez de pintar una cabecera
 * vacía. Lo usan los dos sitios que nombran secciones: la biblioteca (izquierda) y
 * el reordenador (panel de diseño) — y que sea el mismo mapa no es ahorro, es que
 * «Certificaciones» tiene que llamarse igual en los dos o el usuario cree que son
 * dos cosas distintas.
 *
 * `LibSectionId` y `SectionId` son EL MISMO vocabulario a propósito: una sección de
 * la biblioteca es una sección del documento. Cuando dejaron de serlo (el documento
 * no tenía certificaciones y la biblioteca las escondía) el resultado fue un dato
 * del usuario que no podía llegar a ningún CV.
 */
export const LIB_TITLE_KEY: Record<SectionId, string> = {
  summary: "editor.groupSummary",
  work: "editor.groupWorkBullets",
  skills: "editor.groupSkills",
  projects: "editor.groupProjects",
  education: "editor.groupEducation",
  certifications: "editor.groupCertifications",
  languages: "editor.groupLanguages",
  publications: "editor.groupPublications",
  references: "editor.groupReferences",
};

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
    // Los tres nuevos se buscan por LO QUE SE IMPRIMIRÁ, con los mismos helpers
    // puros del documento: buscar «AWS» encuentra el certificado que va a salir en
    // el PDF, no una versión resumida distinta que engañe.
    case "certification": {
      const e = certificationEntry(data as CertificationFields);
      return [e.title, e.org].filter(Boolean).join(" · ");
    }
    case "language":
      return languageLine(data as LanguageFields);
    case "publication":
      return publicationLine(data as PublicationFields);
    default:
      return "";
  }
}

/** ¿el item casa con la consulta (ya recortada y en minúsculas)? Consulta vacía
 *  = todo casa. */
export function libMatch(m: MasterRow, q: string): boolean {
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

  // Exhaustivo por tipo: una sección nueva de biblioteca no compila hasta que
  // alguien diga QUÉ kind del master la llena. Es el mismo candado que el
  // Record<SectionId, …> del documento, y por el mismo motivo.
  const byId: Record<LibSectionId, LibGroupPlan> = {
    summary: plain("summary", of("summary")),
    work: workGroup,
    skills: plain("skills", of("skill")),
    projects: plain("projects", of("project")),
    education: plain("education", of("education")),
    certifications: plain("certifications", of("certification")),
    languages: plain("languages", of("language")),
    publications: plain("publications", of("publication")),
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

/* ============================================================================
   BIBLIOTECA EN PESTAÑAS (editor-integral) — lógica PURA.
   La biblioteca deja de ser un acordeón de corrido: una pestaña por tipo (solo
   los que el master tiene), un buscador, un filtro «en la variante / fuera» y
   TARJETAS con título, subtítulo útil, estado y su botón Añadir/Quitar. Las
   viñetas van plegadas bajo su rol. Se apoya en computeLibPlan (el buscador ya
   filtra ANTES de pintar) y solo añade el filtro por estado y la agrupación.
   ============================================================================ */

export type FiltroLib = "todo" | "dentro" | "fuera";

export interface FilaLib {
  row: MasterRow;
  enVariante: boolean;
}
export interface TarjetaLib extends FilaLib {
  /** viñetas del rol que sobreviven a búsqueda y filtro (vacío fuera de work) */
  vinetas: FilaLib[];
  /** todas las viñetas del rol en el master y cuántas están en la variante */
  vinetasTotal: number;
  vinetasDentro: number;
  /** la búsqueda casó con alguna viñeta: el rol se abre solo */
  abrir: boolean;
}
export interface PestanaLib {
  id: LibSectionId;
  /** tarjetas tras búsqueda y filtro (roles en work) */
  tarjetas: TarjetaLib[];
  /** lo que cuenta la pestaña: tarjetas visibles (+ viñetas en work) */
  n: number;
}

const pasaFiltro = (dentro: boolean, f: FiltroLib) => f === "todo" || (f === "dentro" ? dentro : !dentro);

/** Las pestañas de la biblioteca, en orden, solo de los tipos que el master tiene. */
export function planBiblioteca(
  master: MasterRow[],
  query: string,
  enVariante: ReadonlySet<string>,
  filtro: FiltroLib,
): PestanaLib[] {
  const q = query.trim();
  const todas = master.filter((m) => m.kind === "bullet");
  const out: PestanaLib[] = [];
  for (const g of computeLibPlan(master, query)) {
    if (!g.present) continue;
    const tarjetas: TarjetaLib[] = [];
    let actual: TarjetaLib | null = null;
    const cerrar = () => {
      if (!actual) return;
      const viv = actual.vinetas.filter((v) => pasaFiltro(v.enVariante, filtro));
      if (pasaFiltro(actual.enVariante, filtro) || viv.length > 0) tarjetas.push({ ...actual, vinetas: viv });
      actual = null;
    };
    for (const r of g.rows) {
      const dentro = enVariante.has(r.row.id);
      if (r.isBullet && actual) {
        actual.vinetas.push({ row: r.row, enVariante: dentro });
        continue;
      }
      cerrar();
      const hijas = r.row.kind === "work" ? todas.filter((b) => b.parent_id === r.row.id) : [];
      actual = {
        row: r.row,
        enVariante: dentro,
        vinetas: [],
        vinetasTotal: hijas.length,
        vinetasDentro: hijas.filter((b) => enVariante.has(b.id)).length,
        abrir: false,
      };
    }
    cerrar();
    for (const t of tarjetas) {
      // Abre solo si la búsqueda casó con viñetas y NO con el rol (si el rol casa, se
      // ven todas, pero plegadas: el rol ya dice lo que buscabas).
      t.abrir = q !== "" && t.vinetas.length > 0 && !libMatch(t.row, q.toLowerCase());
    }
    const n = tarjetas.reduce((s, t) => s + 1 + t.vinetas.length, 0);
    out.push({ id: g.id, tarjetas, n });
  }
  return out;
}

/** Título y subtítulo de una tarjeta: lo que se imprime, partido para leerse rápido. */
export function tarjetaTextos(kind: string, data: Record<string, unknown>): { titulo: string; sub: string } {
  const recorta = (s: string, n = 110) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);
  const une = (...xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).join(" · ");
  switch (kind) {
    case "work":
      return { titulo: S(data, "title"), sub: une(S(data, "company"), S(data, "dates")) };
    case "skill": {
      const n = S(data, "items").split(",").map((x) => x.trim()).filter(Boolean);
      return { titulo: S(data, "group"), sub: recorta(n.join(", ")) };
    }
    case "project":
      return { titulo: S(data, "name"), sub: recorta(S(data, "description")) };
    case "education":
      return { titulo: S(data, "degree"), sub: une(S(data, "institution"), S(data, "dates")) };
    case "certification": {
      const e = certificationEntry(data as CertificationFields);
      return { titulo: e.title, sub: une(e.org, e.dates) };
    }
    case "language":
      return { titulo: S(data, "language"), sub: S(data, "level") };
    case "publication":
      return { titulo: S(data, "name"), sub: recorta(S(data, "description")) };
    case "reference": {
      const r = data as ReferenceFields;
      return { titulo: (r.name ?? "").trim(), sub: une(r.role ?? "", r.org ?? "", r.relation ?? "") };
    }
    default:
      return { titulo: recorta(libTextOf(kind, data), 160), sub: "" };
  }
}
