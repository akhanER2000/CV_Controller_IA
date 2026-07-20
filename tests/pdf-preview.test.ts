import { describe, it, expect } from "vitest";
import { extractText, getDocumentProxy, getResolvedPDFJS } from "unpdf";
import * as QRCode from "qrcode";
import { buildVCard, type ResumeData } from "../src/lib/cv/resume";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import { buildEditorResumeData } from "../src/components/screens/EditorVarianteScreen";

/* ============================================================================
   EL PREVIEW ES EL PDF — el test de la promesa del pie del editor.

   El editor ya NO dibuja el documento: traduce su estado a ResumeData
   (buildEditorResumeData) y pide el PDF a /api/cv. Aquí se prueba ESA traducción
   contra el PDF REAL: se renderiza y se re-parsea con unpdf, igual que hace la
   ruta para el rayos-X. Si el editor volviera a tener su propio renderizador,
   estos asserts dejarían de significar nada — por eso se prueba el PDF, no el HTML.

   Y el QR: que se genere DE VERDAD (glifo embebido en el PDF), que su payload sea
   el esperado, y que viva AL PIE (última página, nunca compitiendo con el nombre).
   ============================================================================ */

// ── Utilidades ──────────────────────────────────────────────────────────────
const norm = (x: string) => x.replace(/\s+/g, " ").trim();

async function textOf(buf: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return norm(text);
}

/**
 * Nombres de los XObject de imagen que pdf.js encuentra en una página (los llama
 * `img_pN_M`). Es la prueba OBJETIVA de que el glifo del QR entró en el PDF: no
 * mide bytes ni confía en el código que lo generó, lee el content stream.
 */
async function imagesOnPage(buf: Buffer, pageNo: number): Promise<string[]> {
  const { OPS } = await getResolvedPDFJS();
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const page = await pdf.getPage(pageNo);
  const ops = await page.getOperatorList();
  // ★ CANDADO DEL LECTOR. getOperatorList() se traga sus propias excepciones
  // (ignoreErrors) y devuelve la lista TRUNCADA. Cuando pdf.js reventaba
  // compilando la info de fuente —Node 20 no tiene
  // ArrayBuffer.prototype.transferToFixedLength, que unpdf da por hecha— la lista
  // se cortaba ANTES del paintImageXObject del QR y esto devolvía []. Que es
  // exactamente lo mismo que devuelve un PDF sin imagen: un lector ciego se
  // disfrazaba de fallo del producto, y así estuvo la CI cuatro commits en rojo
  // mientras el glifo SÍ viajaba en el PDF (idéntico byte a byte en 20 y en 24).
  // Toda página de un CV lleva texto: si no hay ni una operación de texto, el
  // que falló es el lector. Que lo diga en vez de fingir un array vacío.
  const fns = Array.from(ops.fnArray as ArrayLike<number>);
  if (!fns.includes(OPS.showText) && !fns.includes(OPS.showSpacedText)) {
    throw new Error(
      `Lector ciego en la página ${pageNo}: getOperatorList() devolvió ${fns.length} operaciones ` +
        `y ninguna dibuja texto, así que pdf.js abortó la lista y se lo calló. ` +
        `El PDF no tiene la culpa — revisa que el runtime traiga las APIs que unpdf necesita (Node ≥22).`,
    );
  }
  const names = (ops.argsArray as unknown[])
    .flat()
    .filter((a): a is string => typeof a === "string" && a.startsWith("img_"));
  return [...new Set(names)];
}

async function pageCount(buf: Buffer): Promise<number> {
  return (await getDocumentProxy(new Uint8Array(buf))).numPages;
}

// ── Un master + una variante mínimos, como los tiene el editor en memoria ─────
type Row = { id: string; kind: string; data: Record<string, unknown>; parent_id: string | null; sort_order: number };
type VIt = {
  id: string;
  item_id: string;
  kind: string;
  visible: boolean;
  sort_order: number;
  override_data: Record<string, unknown> | null;
  data: Record<string, unknown>;
  parent_id: string | null;
  // Procedencia del override: quién escribió ESE texto y si pasó la verificación
  // de hechos. El editor era ciego a esto hasta que el ajuste a dos páginas lo
  // necesitó — un texto reescrito por la IA y uno tecleado por el usuario no
  // pueden parecer lo mismo. Aquí van en el fixture porque buildEditorResumeData
  // recibe el item entero, aunque el documento no los imprima.
  override_origin: string | null;
  // `not null default false` en el esquema (0001:160): un override o pasó la
  // verificación o no; no hay tercer estado. El fixture respeta eso.
  override_verified: boolean;
};

const master: Row[] = [
  { id: "basics", kind: "basics", data: {}, parent_id: null, sort_order: 0 },
  { id: "sum", kind: "summary", data: {}, parent_id: null, sort_order: 1 },
  { id: "e1", kind: "work", data: {}, parent_id: null, sort_order: 2 },
  { id: "b1", kind: "bullet", data: {}, parent_id: "e1", sort_order: 3 },
  { id: "b2", kind: "bullet", data: {}, parent_id: "e1", sort_order: 4 },
  { id: "b3", kind: "bullet", data: {}, parent_id: "e1", sort_order: 5 },
  { id: "s1", kind: "skill", data: {}, parent_id: null, sort_order: 6 },
  { id: "p1", kind: "project", data: {}, parent_id: null, sort_order: 7 },
  { id: "ed1", kind: "education", data: {}, parent_id: null, sort_order: 8 },
];
const masterById = new Map(master.map((m) => [m.id, m]));

const BASICS: Record<string, unknown> = {
  name: "Akhan Castro",
  label: "Ingeniero",
  email: "akhan@ejemplo.cl",
  phone: "+56 9 1234 5678",
  location: "Santiago, Chile",
  links: [{ label: "Portafolio", url: "akhan.cl" }, "github.com/akhan"],
};

const vi = (o: Partial<VIt> & Pick<VIt, "id" | "item_id" | "kind" | "sort_order" | "data">): VIt => ({
  visible: true,
  override_data: null,
  override_origin: null,
  override_verified: false,
  parent_id: masterById.get(o.item_id)?.parent_id ?? null,
  ...o,
});

const ITEMS: VIt[] = [
  vi({ id: "v-sum", item_id: "sum", kind: "summary", sort_order: 1, data: { text: "Resumen de prueba, honesto." } }),
  vi({
    id: "v-e1",
    item_id: "e1",
    kind: "work",
    sort_order: 2,
    data: { title: "Backend Developer", company: "Altiplano Pagos SpA", location: "Santiago, Chile", dates: "2022 – hoy" },
  }),
  // sort_order desordenado a propósito: el documento debe salir 1 · 2, no 2 · 1.
  vi({ id: "v-b2", item_id: "b2", kind: "bullet", sort_order: 20, data: { text: "Segunda viñeta del rol." } }),
  vi({ id: "v-b1", item_id: "b1", kind: "bullet", sort_order: 10, data: { text: "Primera viñeta del rol." } }),
  // Oculta: NO puede aparecer en el PDF ni en el texto extraído.
  vi({ id: "v-b3", item_id: "b3", kind: "bullet", sort_order: 30, visible: false, data: { text: "VINETA OCULTA CANARIO." } }),
  vi({ id: "v-s1", item_id: "s1", kind: "skill", sort_order: 6, data: { group: "Lenguajes", items: "Go, TypeScript" } }),
  vi({ id: "v-p1", item_id: "p1", kind: "project", sort_order: 7, data: { name: "idempotency-go", description: "librería de idempotencia." } }),
  vi({
    id: "v-ed1",
    item_id: "ed1",
    kind: "education",
    sort_order: 8,
    data: { degree: "Ingeniería Civil en Computación", institution: "Universidad Andrés Bello", dates: "2014 – 2019" },
  }),
];

const editorDoc = (basics: Record<string, unknown> = BASICS, targetTitle = "Backend Engineer"): ResumeData =>
  buildEditorResumeData({ items: ITEMS, basicsData: basics, masterById, targetTitle, variantName: "Backend — Fintech" });

// ── 1 · La traducción del editor sobrevive el viaje de ida y vuelta por el PDF ─
describe("preview · el estado del editor → PDF → texto re-parseado", () => {
  it("1 · lo compuesto sale EN ORDEN DE LECTURA del PDF real", async () => {
    const buf = await renderResumeToBuffer(editorDoc(), { locale: "es" });
    const out = await textOf(buf);
    let cursor = 0;
    for (const line of [
      "Akhan Castro",
      "Backend Engineer",
      "akhan@ejemplo.cl",
      "Resumen de prueba, honesto.",
      "Lenguajes: Go, TypeScript",
      "Backend Developer — Altiplano Pagos SpA",
      "Primera viñeta del rol.",
      "Segunda viñeta del rol.",
      "idempotency-go — librería de idempotencia.",
      "Ingeniería Civil en Computación",
    ]) {
      const idx = out.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
  });

  it("2 · lo OCULTO no llega al PDF (el preview no puede prometer lo que el PDF no lleva)", async () => {
    const buf = await renderResumeToBuffer(editorDoc(), { locale: "es" });
    expect(await textOf(buf)).not.toContain("VINETA OCULTA CANARIO");
  });

  it("3 · el título objetivo manda como cargo, por encima del label del master", () => {
    expect(editorDoc().basics.label.es).toBe("Backend Engineer");
    expect(editorDoc(BASICS, "").basics.label.es).toBe("Ingeniero");
  });

  it("4 · los enlaces ETIQUETADOS imprimen la URL, nunca [object Object]", async () => {
    const buf = await renderResumeToBuffer(editorDoc(), { locale: "es" });
    const out = await textOf(buf);
    expect(out).toContain("akhan.cl");
    expect(out).toContain("github.com/akhan");
    expect(out).not.toContain("[object Object]");
    expect(out).not.toContain("Portafolio"); // la etiqueta es solo para la UI
  });
});

// ── 2 · QR: que se genere DE VERDAD, con el payload correcto, y AL PIE ────────
describe("QR · el glifo existe, codifica lo que dice, y vive al pie", () => {
  const withUrlQr = () => editorDoc({ ...BASICS, qr: { mode: "url", url: "akhan.cl" } });
  const withVcardQr = () => editorDoc({ ...BASICS, qr: { mode: "vcard" } });

  it("1 · modo 'url': el payload que se codifica es la URL, y `qrcode` la codifica sin quejarse", async () => {
    const doc = withUrlQr();
    expect(doc.qr).toEqual({ mode: "url", url: "akhan.cl" });
    // Si `qrcode` no pudiera con este payload, esto lanzaría — que es justo lo que
    // debe pasar: el motivo sube, no se traga en silencio.
    const png = await QRCode.toDataURL(doc.qr!.url!, { margin: 1, width: 240, errorCorrectionLevel: "M" });
    expect(png.startsWith("data:image/png;base64,")).toBe(true);
    expect(png.length).toBeGreaterThan(500);
  });

  it("2 · modo 'url': el glifo ENTRA en el PDF (XObject de imagen en el content stream)", async () => {
    const conQr = await renderResumeToBuffer(withUrlQr(), { locale: "es" });
    const sinQr = await renderResumeToBuffer(editorDoc(), { locale: "es" });
    const last = await pageCount(conQr);
    expect(await imagesOnPage(conQr, last), "el PDF con QR no trae ninguna imagen").not.toEqual([]);
    expect(await imagesOnPage(sinQr, await pageCount(sinQr)), "el PDF SIN QR trae una imagen").toEqual([]);
    // Un QR de 240 px pesa: si el glifo no se hubiera embebido, no habría delta.
    expect(conQr.length).toBeGreaterThan(sinQr.length + 500);
  });

  it("3 · el QR va AL PIE: en un CV de 2 páginas está en la última, no arriba", async () => {
    // Documento largo a propósito: si el QR estuviera en la cabecera (compitiendo
    // con nombre y cargo en el barrido en F del reclutador), aparecería en la
    // página 1. Debe estar SOLO en la última.
    const relleno = Array.from({ length: 46 }, (_, k) =>
      vi({
        id: `v-f${k}`,
        item_id: "b1",
        kind: "bullet",
        sort_order: 100 + k,
        data: { text: `Viñeta de relleno número ${k} para estirar el documento a dos páginas.` },
      }),
    );
    const largo = buildEditorResumeData({
      items: [...ITEMS, ...relleno],
      basicsData: { ...BASICS, qr: { mode: "url", url: "akhan.cl" } },
      masterById,
      targetTitle: "Backend Engineer",
    });
    const buf = await renderResumeToBuffer(largo, { locale: "es" });
    const last = await pageCount(buf);
    expect(last, "el documento de prueba no llegó a 2 páginas").toBeGreaterThan(1);
    expect(await imagesOnPage(buf, 1), "hay una imagen en la página 1: el QR no está al pie").toEqual([]);
    expect(await imagesOnPage(buf, last), "la última página no lleva el glifo del QR").not.toEqual([]);
  });

  it("4 · la URL va SIEMPRE también como TEXTO, y DESPUÉS de todo el contenido", async () => {
    const out = await textOf(await renderResumeToBuffer(withUrlQr(), { locale: "es" }));
    expect(out).toContain("akhan.cl");
    // Al pie: por detrás de la última línea del cuerpo (la educación).
    expect(out.lastIndexOf("akhan.cl")).toBeGreaterThan(out.indexOf("Universidad Andrés Bello"));
  });

  it("5 · sin QR, la URL sigue como texto (el candado ATS no depende del glifo)", async () => {
    const out = await textOf(await renderResumeToBuffer(editorDoc(), { locale: "es" }));
    expect(out).toContain("akhan.cl");
  });

  it("6 · modo 'vcard': el payload es una vCard REAL — BEGIN:VCARD y el email dentro", async () => {
    const doc = withVcardQr();
    expect(doc.qr).toEqual({ mode: "vcard", url: undefined });
    // Es EXACTAMENTE el payload que renderResumeToBuffer codifica en modo 'vcard'.
    const payload = buildVCard(doc.basics, "es");
    expect(payload.startsWith("BEGIN:VCARD")).toBe(true);
    expect(payload).toContain("VERSION:3.0");
    expect(payload).toContain("akhan@ejemplo.cl");
    expect(payload).toContain("Akhan Castro");
    expect(payload).toContain("akhan.cl");
    expect(payload.trimEnd().endsWith("END:VCARD")).toBe(true);
    const png = await QRCode.toDataURL(payload, { margin: 1, width: 240, errorCorrectionLevel: "M" });
    expect(png.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("7 · modo 'vcard': el glifo entra al pie y la vCard NO se filtra como texto", async () => {
    const buf = await renderResumeToBuffer(withVcardQr(), { locale: "es" });
    expect(await imagesOnPage(buf, await pageCount(buf))).not.toEqual([]);
    const out = await textOf(buf);
    expect(out).not.toContain("BEGIN:VCARD");
    expect(out).not.toContain("VERSION:3.0");
    // El contacto YA está como texto en el cuerpo: el candado ATS se cumple ahí.
    expect(out).toContain("akhan@ejemplo.cl");
  });

  it("8 · QR apagado = sin `qr` en el modelo (no se genera nada por accidente)", () => {
    expect(editorDoc().qr).toBeUndefined();
    expect(editorDoc({ ...BASICS, qr: { mode: "url", url: "" } }).qr).toBeUndefined();
  });
});
