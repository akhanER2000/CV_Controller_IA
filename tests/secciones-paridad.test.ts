import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDocumentProxy, extractText } from "unpdf";
import {
  DOCUMENT_HEADINGS,
  certificationEntry,
  documentSections,
  languageLine,
  metricsOf,
  publicationLine,
  selectContent,
  toPlainText,
  type ResumeData,
} from "../src/lib/cv/resume";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import {
  ALL_SECTION_IDS,
  DEFAULT_SECTION_ORDER,
  listTemplates,
  resolveMetrics,
  type SectionId,
} from "../src/lib/cv/templates";
import { ORDEN } from "../src/lib/cv/catalog";
import { buildEditorResumeData, libSectionOfKind } from "../src/components/screens/EditorVarianteScreen";

/* ============================================================================
   BLOQUE B · PARIDAD DE SECCIONES

   EL FALLO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR. El master acepta `certification`,
   `language` y `publication` desde el esquema 0001 —el enum los lista, la pantalla
   del master deja crearlos y el corpus.md los importa— y el DOCUMENTO no sabía
   pintarlos: no existían como SectionId. Un usuario podía tener tres certificados
   guardados, verlos en su master, y no encontrarlos en NINGÚN CV, sin un aviso.
   Eso es el fallo capital del producto: descartar en silencio.

   Aquí no se comprueba que las secciones «estén definidas». Se comprueba que
   LLEGAN AL PDF: se renderiza un documento con las nueve llenas, se re-parsea con
   unpdf y se exige que cada rótulo y cada dato estén, en orden de lectura, y que el
   rayos-X (toPlainText) diga exactamente lo mismo. Una definición que no imprime no
   vale nada.

   Y el CANDADO DEL ORDEN: `sectionOrder` es `readonly SectionId[]` y NO exige
   exhaustividad, así que olvidar una sección en uno de los seis arrays del catálogo
   compila perfectamente y apaga la sección solo en las plantillas que usan ese
   orden. Cada bloque lleva su MUTANTE: se rompe la regla a propósito y se comprueba
   que la salida cambia. Un test que pasa igual con el código roto no prueba nada.
   ============================================================================ */

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, "../src/lib/cv/fixtures");
const base = JSON.parse(readFileSync(path.join(fx, "datos-ejemplo.json"), "utf8")) as ResumeData;

const norm = (x: string) => x.replace(/\s+/g, " ").trim();
const dosLenguas = (s: string) => ({ es: s, en: s });

/** El documento del golden CON las tres secciones nuevas llenas. Los datos son los
 *  que un usuario real tendría: un certificado con emisor y fecha, dos idiomas con
 *  nivel y una publicación con su contexto. */
function conTodo(extra: Partial<ResumeData> = {}): ResumeData {
  return {
    ...base,
    headings: DOCUMENT_HEADINGS,
    certifications: [
      { title: dosLenguas("AWS Certified Solutions Architect – Associate"), org: "Amazon Web Services", dates: dosLenguas("jun 2024"), p1: true },
      { title: dosLenguas("Professional Scrum Master I"), org: "Scrum.org", dates: dosLenguas("2021"), p1: true },
    ],
    languages: [
      { p1: true, ...dosLenguas("Español — nativo") },
      { p1: true, ...dosLenguas("Inglés — profesional (B2)") },
    ],
    publications: [
      { p1: true, ...dosLenguas("Conciliación a escala — charla en la PyCon Chile 2023") },
    ],
    references: [{ p1: true, ...dosLenguas("Rodrigo Peña — CTO · Tesseract") }],
    ...extra,
  };
}

/* ══ 1 · EL CANDADO DEL ORDEN (donde una sección desaparece sin compilar) ═══ */
describe("catálogo · ninguna sección puede caerse de un orden en silencio", () => {
  it("DEFAULT_SECTION_ORDER contiene TODAS las secciones, sin repetir", () => {
    for (const id of ALL_SECTION_IDS) {
      expect(DEFAULT_SECTION_ORDER, `falta «${id}» en el orden por defecto`).toContain(id);
    }
    expect(new Set(DEFAULT_SECTION_ORDER).size).toBe(DEFAULT_SECTION_ORDER.length);
  });

  it("las nueve secciones del documento son exactamente las del orden por defecto", () => {
    // Si alguien añade un SectionId y no lo mete en DEFAULT_SECTION_ORDER, ALL_
    // SECTION_IDS deja de cubrirlo y el resto de este archivo dejaría de vigilarlo.
    // Aquí se ancla que las dos listas son LA MISMA.
    expect([...ALL_SECTION_IDS].sort()).toEqual([...DEFAULT_SECTION_ORDER].sort());
    expect(ALL_SECTION_IDS).toContain("certifications");
    expect(ALL_SECTION_IDS).toContain("languages");
    expect(ALL_SECTION_IDS).toContain("publications");
  });

  it("CADA UNO de los órdenes del catálogo lista las nueve (aunque nadie lo use)", () => {
    // Se recorren los arrays ORDEN directamente, y no solo los que alguna plantilla
    // usa: un orden sin plantilla hoy la tendrá mañana, y entonces el olvido ya
    // estaría dentro del producto.
    const fallos: string[] = [];
    for (const [nombre, orden] of Object.entries(ORDEN)) {
      for (const id of ALL_SECTION_IDS) {
        if (!orden.includes(id)) fallos.push(`${nombre} pierde «${id}»`);
      }
      if (new Set(orden).size !== orden.length) fallos.push(`${nombre} repite una sección`);
      if (orden[orden.length - 1] !== "references") fallos.push(`${nombre} no cierra con references`);
    }
    expect(fallos, fallos.join(" · ")).toEqual([]);
  });

  it("CADA PLANTILLA del catálogo lee las nueve secciones, sin perder ni duplicar", () => {
    const esperado = [...ALL_SECTION_IDS].sort().join(",");
    for (const tpl of listTemplates()) {
      const m = resolveMetrics(tpl.metrics);
      expect([...m.sectionOrder].sort().join(","), `${tpl.id} no lista las mismas secciones`).toBe(esperado);
      expect(new Set(m.sectionOrder).size, `${tpl.id} repite una sección`).toBe(m.sectionOrder.length);
      expect(m.sectionOrder[m.sectionOrder.length - 1], `${tpl.id} no cierra con references`).toBe("references");
    }
  });

  it("MUTANTE · un orden de PLANTILLA al que le falta una sección deja de imprimirla", () => {
    // Se simula el olvido exacto que el candado vigila: mismo documento, mismo
    // contenido, un sectionOrder sin «certifications». Si esto no cambiara la
    // salida, los cuatro tests de arriba estarían vigilando algo que no importa.
    //
    // ⚠ SE MUTA LA MÉTRICA, NO EL DOCUMENTO, y la diferencia importa: el orden que
    // llega POR VARIANTE pasa por normalizeSectionOrder, que COMPLETA lo que falte
    // (una variante no puede perder una sección por haber guardado su orden antes de
    // que existiera). El agujero real está en el catálogo, donde el array se escribe
    // a mano y nadie lo completa — que es justo el que se muta aquí.
    const data = conTodo();
    const m = metricsOf(data);
    expect(documentSections(data, false, m)).toContain("certifications");

    const roto = { ...m, sectionOrder: m.sectionOrder.filter((s) => s !== "certifications") };
    const secciones = documentSections(data, false, roto);
    expect(secciones).not.toContain("certifications");
    // Y el resto del documento sigue entero: se pierde LA sección, no el CV.
    expect(secciones).toContain("languages");
    expect(secciones).toContain("work");
  });
});

/* ══ 2 · SECCIÓN VACÍA = SECCIÓN INEXISTENTE (el golden no se mueve) ═══════ */
describe("una sección sin contenido no existe en el documento", () => {
  it("el fixture golden no trae las tres nuevas y no aparecen por ningún lado", () => {
    expect(base.certifications).toBeUndefined();
    expect(base.languages).toBeUndefined();
    expect(base.publications).toBeUndefined();
    const m = metricsOf(base);
    for (const id of ["certifications", "languages", "publications"] as SectionId[]) {
      expect(documentSections(base, false, m)).not.toContain(id);
    }
    // ⚠ SE COMPARA LÍNEA COMPLETA, no `toContain`. El golden ya tiene un grupo de
    // habilidades llamado literalmente «Idiomas: Español nativo, Inglés B2» —el
    // apaño con el que se vivía sin sección de idiomas—, así que buscar la subcadena
    // «IDIOMAS» daría un falso positivo. El rótulo de sección es una línea entera.
    const lineas = toPlainText(base, { locale: "es" }).split("\n");
    for (const rotulo of ["CERTIFICACIONES", "IDIOMAS", "PUBLICACIONES"]) {
      expect(lineas, `el golden no debería rotular «${rotulo}»`).not.toContain(rotulo);
    }
  });

  it("lista VACÍA se comporta igual que ausente (no hay dos formas de estar vacío)", () => {
    const vacias = conTodo({ certifications: [], languages: [], publications: [] });
    expect(toPlainText(vacias, { locale: "es" })).toBe(
      toPlainText({ ...base, headings: DOCUMENT_HEADINGS, references: vacias.references }, { locale: "es" }),
    );
  });

  it("selectContent aplica el filtro p1 a las tres nuevas", () => {
    const data = conTodo({
      certifications: [
        { title: dosLenguas("Sí en una página"), org: "X", dates: dosLenguas("2024"), p1: true },
        { title: dosLenguas("Solo en dos"), org: "Y", dates: dosLenguas("2023"), p1: false },
      ],
      languages: [
        { p1: true, ...dosLenguas("Español — nativo") },
        { p1: false, ...dosLenguas("Portugués — básico") },
      ],
      publications: [{ p1: false, ...dosLenguas("Un paper largo") }],
    });
    const una = selectContent(data, true);
    expect(una.certifications).toHaveLength(1);
    expect(una.languages).toHaveLength(1);
    expect(una.publications).toHaveLength(0);
    const dos = selectContent(data, false);
    expect(dos.certifications).toHaveLength(2);
    expect(dos.languages).toHaveLength(2);
    expect(dos.publications).toHaveLength(1);
    // Con publicaciones fuera por p1, la SECCIÓN tampoco existe en una página.
    expect(documentSections(data, true, metricsOf(data))).not.toContain("publications");
  });
});

/* ══ 3 · EL PDF Y SU RAYOS-X (la única prueba que vale: llega al papel) ════ */
describe("PDF · las tres secciones nuevas se IMPRIMEN y el rayos-X las describe", () => {
  const data = conTodo();
  let extraido = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(data, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extraido = norm(Array.isArray(text) ? text.join(" ") : text);
  }, 60000);

  it("1 · cada rótulo y cada dato están en el PDF re-parseado", () => {
    for (const dato of [
      "CERTIFICACIONES",
      "AWS Certified Solutions Architect – Associate",
      "Amazon Web Services",
      "jun 2024",
      "IDIOMAS",
      "Español — nativo",
      "Inglés — profesional (B2)",
      "PUBLICACIONES",
      "Conciliación a escala — charla en la PyCon Chile 2023",
    ]) {
      expect(extraido, `el PDF pierde «${dato}»`).toContain(dato);
    }
  });

  it("2 · el texto plano es línea a línea el del PDF, EN ORDEN DE LECTURA", () => {
    // El mismo candado que el round-trip del golden, pero sobre el documento con las
    // nueve secciones: si el JSX y toPlainText emitieran las líneas nuevas en orden
    // distinto (p. ej. una certificación con emisor antes que título), esto cae.
    let cursor = 0;
    for (const linea of toPlainText(data, { locale: "es" }).split("\n").map(norm).filter(Boolean)) {
      const i = extraido.indexOf(linea, cursor);
      expect(i, `fuera de orden o ausente: "${linea}"`).toBeGreaterThanOrEqual(0);
      cursor = i + linea.length;
    }
  });

  it("3 · el orden de los rótulos en el PDF es el de la plantilla", () => {
    const pos = (r: string) => extraido.indexOf(r);
    expect(pos("EDUCACIÓN")).toBeGreaterThan(pos("EXPERIENCIA"));
    expect(pos("CERTIFICACIONES")).toBeGreaterThan(pos("EDUCACIÓN"));
    expect(pos("IDIOMAS")).toBeGreaterThan(pos("CERTIFICACIONES"));
    expect(pos("PUBLICACIONES")).toBeGreaterThan(pos("IDIOMAS"));
    expect(pos("REFERENCIAS")).toBeGreaterThan(pos("PUBLICACIONES"));
  });
});

/* ══ 4 · LA GAMA VISUAL (la rama que NO usa sectionOrder) ══════════════════ */
describe("gama visual · la rama de dos columnas tampoco pierde una sección", () => {
  it("con barra lateral, certificaciones, idiomas y publicaciones siguen en el PDF", async () => {
    // Esta rama del JSX coloca los bloques A MANO (no recorre `sectionOrder`), así
    // que una sección que nadie escriba en una de las dos columnas desaparece sin
    // que falle nada. Por eso se comprueba renderizando, no leyendo el código.
    const visual = listTemplates().find((t) => t.gama === "visual")!;
    const data = conTodo({ templateId: visual.id });
    const buf = await renderResumeToBuffer(data, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const out = norm(Array.isArray(text) ? text.join(" ") : text);
    for (const dato of [
      "CERTIFICACIONES", "AWS Certified Solutions Architect – Associate",
      "IDIOMAS", "Español — nativo",
      "PUBLICACIONES", "Conciliación a escala",
      "REFERENCIAS", "Rodrigo Peña",
    ]) {
      expect(out, `la gama visual pierde «${dato}»`).toContain(dato);
    }
  }, 60000);
});

/* ══ 5 · PARIDAD KIND ↔ SECCIÓN (del master al documento, sin escalones) ═══ */
describe("cada kind del master llega al documento por el camino del editor", () => {
  /** Espeja lo que hace la pantalla: un item del master + su variant_item visible. */
  const vi = (id: string, kind: string, data: Record<string, unknown>) => ({
    id: `v-${id}`,
    item_id: id,
    kind,
    visible: true,
    sort_order: 0,
    override_data: null,
    override_origin: null,
    override_verified: false,
    data,
    parent_id: null,
  });

  it("certification, language y publication tienen sección en la biblioteca", () => {
    // Antes devolvían null: existían en el master y no había forma de añadirlos.
    expect(libSectionOfKind("certification")).toBe("certifications");
    expect(libSectionOfKind("language")).toBe("languages");
    expect(libSectionOfKind("publication")).toBe("publications");
  });

  it("el espejo del editor los compone con los MISMOS helpers que el servidor", () => {
    const items = [
      vi("c1", "certification", { name: "AWS SAA", issuer: "Amazon Web Services", dates: "jun 2024" }),
      vi("l1", "language", { language: "Inglés", level: "B2" }),
      vi("p1", "publication", { name: "Conciliación a escala", description: "PyCon Chile 2023" }),
    ];
    const doc = buildEditorResumeData({
      items,
      basicsData: { name: "Diego Gatica", email: "d@e.cl", phone: "+56", location: "Santiago" },
      masterById: new Map(),
      targetTitle: "Backend",
    });
    // La línea del documento es EXACTAMENTE la que devuelve el helper puro. Si el
    // editor la compusiera por su cuenta, el preview y el PDF del servidor podrían
    // decir cosas distintas del mismo certificado.
    expect(doc.certifications?.[0]).toEqual({
      title: dosLenguas(certificationEntry({ name: "AWS SAA" }).title),
      org: "Amazon Web Services",
      dates: dosLenguas("jun 2024"),
      p1: true,
    });
    expect(doc.languages?.[0]!.es).toBe(languageLine({ language: "Inglés", level: "B2" }));
    expect(doc.publications?.[0]!.es).toBe(
      publicationLine({ name: "Conciliación a escala", description: "PyCon Chile 2023" }),
    );
    // Y llegan al documento: las tres secciones existen.
    const secciones = documentSections(doc, false, metricsOf(doc));
    expect(secciones).toContain("certifications");
    expect(secciones).toContain("languages");
    expect(secciones).toContain("publications");
  });

  it("MUTANTE · un item sin datos NO crea una sección con una línea vacía", () => {
    // Un certificado sin nombre ni emisor no es una sección: es una fila en blanco
    // en mitad del CV. Se descarta al componer (no en silencio: no había dato).
    const doc = buildEditorResumeData({
      items: [
        vi("c1", "certification", { name: "  ", issuer: "" }),
        vi("l1", "language", {}),
        vi("p1", "publication", { name: "" }),
      ],
      basicsData: { name: "Diego" },
      masterById: new Map(),
      targetTitle: "",
    });
    expect(doc.certifications).toHaveLength(0);
    expect(doc.languages).toHaveLength(0);
    expect(doc.publications).toHaveLength(0);
    expect(documentSections(doc, false, metricsOf(doc))).not.toContain("certifications");
  });
});

/* ══ 6 · LOS COMPOSITORES PUROS (una sola forma de escribir cada línea) ════ */
describe("los helpers que componen la línea impresa", () => {
  it("languageLine usa el conector del documento y se salta lo que no está", () => {
    expect(languageLine({ language: "Inglés", level: "profesional (B2)" })).toBe("Inglés — profesional (B2)");
    expect(languageLine({ language: "Español" })).toBe("Español");
    expect(languageLine({ language: "  Español  ", level: "  " })).toBe("Español");
    expect(languageLine({})).toBe("");
    // MUTANTE: si alguien "mejorara" el separador a paréntesis, el texto plano y el
    // PDF tendrían que cambiar a la vez — este test lo ancla en un solo sitio.
    expect(languageLine({ language: "Inglés", level: "B2" })).toContain(" — ");
  });

  it("publicationLine se compone como un proyecto (nombre — descripción)", () => {
    expect(publicationLine({ name: "Paper", description: "en la revista X" })).toBe("Paper — en la revista X");
    expect(publicationLine({ name: "Paper" })).toBe("Paper");
    expect(publicationLine({ description: "solo contexto" })).toBe("solo contexto");
    expect(publicationLine({})).toBe("");
  });

  it("certificationEntry deja la certificación con forma de ENTRADA", () => {
    expect(certificationEntry({ name: " AWS SAA ", issuer: " AWS ", dates: " 2024 " })).toEqual({
      title: "AWS SAA",
      org: "AWS",
      dates: "2024",
    });
    expect(certificationEntry({})).toEqual({ title: "", org: "", dates: "" });
  });
});
