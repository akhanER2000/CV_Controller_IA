import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDocumentProxy, extractText } from "unpdf";
import {
  referenceLine,
  referencesOptIn,
  mergePresentationOverride,
  selectContent,
  documentSections,
  metricsOf,
  toPlainText,
  REFERENCES_OPT_IN_FIELD,
  type ResumeData,
} from "../src/lib/cv/resume";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import {
  DEFAULT_SECTION_ORDER,
  listTemplates,
  resolveMetrics,
  type SectionId,
} from "../src/lib/cv/templates";
import {
  invalidReferenceData,
  parseLinks,
  suggestReferences,
  faltaMigracion,
  REFERENCE_FIELDS,
  type ReferenceView,
} from "../src/lib/db/references";

/* ============================================================================
   BLOQUE B · REFERENCIAS

   Lo que se prueba aquí no es «la función devuelve algo»: es que las TRES reglas
   duras del bloque no se puedan romper sin que un test caiga.

     1. El CRITERIO DE ÉXITO literal del usuario: añadir a su jefe de Tesseract y
        al profesor del laboratorio VR, cada uno vinculado a SU proyecto, y decidir
        POR VARIANTE si aparecen.
     2. APAGADAS POR DEFECTO. Un documento sin opt-in explícito no imprime ni una
        línea de una tercera persona — ni la sección, ni el rótulo, ni un
        «disponibles a solicitud».
     3. LOS SEIS ÓRDENES DEL CATÁLOGO. `sectionOrder` es readonly SectionId[] y NO
        exige exhaustividad: olvidar "references" en uno de los seis arrays apaga la
        sección en 15 plantillas SIN error de compilación. Ese es el fallo silencioso
        más caro del bloque y aquí tiene su candado.

   Cada bloque incluye MUTANTES: se rompe a propósito la regla y se comprueba que
   el resultado cambia. Un test que pasa igual con el código roto no prueba nada.
   ============================================================================ */

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, "../src/lib/cv/fixtures");
const base = JSON.parse(readFileSync(path.join(fx, "datos-ejemplo.json"), "utf8")) as ResumeData;
const golden = readFileSync(path.join(fx, "cv-texto-plano.txt"), "utf8");

/** El rótulo de referencias que usan las tres capas que arman un ResumeData. */
const H_REF = { es: "Referencias", en: "References" };

/** Un ResumeData con referencias YA encendidas (lista no vacía). */
function conReferencias(lineas: string[], extra: Partial<ResumeData> = {}): ResumeData {
  return {
    ...base,
    headings: { ...base.headings, references: H_REF },
    references: lineas.map((l) => ({ p1: true, es: l, en: l })),
    ...extra,
  };
}

/* ══ 1 · LA LÍNEA QUE SE IMPRIME ═══════════════════════════════════════════ */
describe("referenceLine · la persona, compuesta en una línea", () => {
  const jefe = {
    name: "Rodrigo Peña",
    role: "CTO",
    org: "Tesseract",
    relation: "jefe directo",
    email: "rodrigo@tesseract.cl",
    phone: "+56 9 1111 2222",
  };

  it("nombre — cargo, y el resto separado por el conector de siempre", () => {
    expect(referenceLine(jefe)).toBe(
      "Rodrigo Peña — CTO · Tesseract · jefe directo · rodrigo@tesseract.cl · +56 9 1111 2222",
    );
  });

  it("se salta lo que no está, sin dejar separadores huérfanos", () => {
    expect(referenceLine({ name: "Ana Soto" })).toBe("Ana Soto");
    expect(referenceLine({ name: "Ana Soto", org: "UNAB" })).toBe("Ana Soto · UNAB");
    // Sin nombre pero con cargo: no se emite el " — " suelto delante.
    expect(referenceLine({ role: "Profesora" })).toBe("Profesora");
    expect(referenceLine({})).toBe("");
  });

  it("recorta los blancos: un campo con espacios no cuenta como dato", () => {
    expect(referenceLine({ name: "  Ana Soto  ", org: "   " })).toBe("Ana Soto");
  });

  it("MUTANTE · si la composición cambiara de conector, la línea sería otra", () => {
    // Este test existe para que nadie «mejore» los separadores sin darse cuenta de
    // que toPlainText y el PDF imprimen EXACTAMENTE esta cadena.
    const linea = referenceLine(jefe);
    expect(linea).toContain(" — ");
    expect(linea).toContain(" · ");
    expect(linea.split(" · ")).toHaveLength(5);
  });
});

/* ══ 2 · EL INTERRUPTOR (opt-in por variante) ══════════════════════════════ */
describe("referencesOptIn · apagado salvo `true` literal", () => {
  it("solo el booleano true enciende", () => {
    expect(referencesOptIn({ [REFERENCES_OPT_IN_FIELD]: true })).toBe(true);
  });

  it("MUTANTE · ningún valor «casi verdadero» enciende", () => {
    // Con datos de terceros, "no sé" tiene que significar "no". Si alguien
    // relajara esto a un truthy, "false" (string) o 1 encenderían la sección.
    for (const casi of ["true", "1", 1, "yes", {}, [], "false", 0, "", null, undefined]) {
      expect(
        referencesOptIn({ [REFERENCES_OPT_IN_FIELD]: casi as unknown }),
        `«${String(casi)}» no debería encender nada`,
      ).toBe(false);
    }
    expect(referencesOptIn({})).toBe(false);
    expect(referencesOptIn(null)).toBe(false);
    expect(referencesOptIn(undefined)).toBe(false);
  });

  it("mergePresentationOverride guarda `true` y BORRA la clave al apagar", () => {
    const on = mergePresentationOverride({}, { showReferences: true });
    expect(on[REFERENCES_OPT_IN_FIELD]).toBe(true);
    expect(referencesOptIn(on)).toBe(true);

    const off = mergePresentationOverride(on, { showReferences: false });
    // Apagado y "nunca encendido" son el MISMO objeto: no hay dos formas de estar
    // apagado que puedan divergir más adelante.
    expect(REFERENCES_OPT_IN_FIELD in off).toBe(false);
    expect(referencesOptIn(off)).toBe(false);
  });

  it("undefined NO toca el interruptor (subir una foto no apaga las referencias)", () => {
    const on = mergePresentationOverride({}, { showReferences: true });
    const trasFoto = mergePresentationOverride(on, { photo: "data:image/png;base64,AAA=" });
    expect(referencesOptIn(trasFoto)).toBe(true);
  });
});

/* ══ 3 · APAGADAS POR DEFECTO EN EL DOCUMENTO ══════════════════════════════ */
describe("el documento · sin opt-in no sale NI UNA línea de terceros", () => {
  it("el fixture golden no trae referencias y su texto plano no se mueve", () => {
    expect(base.references).toBeUndefined();
    expect(toPlainText(base, { locale: "es", onePage: false })).toBe(golden);
  });

  it("documentSections descarta la sección con la lista vacía o ausente", () => {
    const m = metricsOf(base);
    expect(documentSections(base, false, m)).not.toContain("references");
    const vacia = conReferencias([]);
    expect(documentSections(vacia, false, metricsOf(vacia))).not.toContain("references");
  });

  it("NO se imprime «referencias disponibles a solicitud» en ningún caso", () => {
    // La convención dice que esa línea ocupa espacio y no aporta. Que no exista es
    // una decisión, así que se vigila: si alguien la añadiera «por amabilidad»,
    // este test lo caza en las dos lenguas.
    for (const loc of ["es", "en"] as const) {
      const txt = toPlainText(conReferencias([]), { locale: loc, onePage: false }).toLowerCase();
      expect(txt).not.toContain("a solicitud");
      expect(txt).not.toContain("upon request");
      expect(txt).not.toContain("referencias");
      expect(txt).not.toContain("references");
    }
  });

  it("MUTANTE · con la lista LLENA la sección sí aparece (si no, el test de arriba sería trampa)", () => {
    const data = conReferencias(["Rodrigo Peña — CTO · Tesseract · jefe directo"]);
    const secciones = documentSections(data, false, metricsOf(data));
    expect(secciones).toContain("references");
    const txt = toPlainText(data, { locale: "es", onePage: false });
    expect(txt).toContain("REFERENCIAS");
    expect(txt).toContain("• Rodrigo Peña — CTO · Tesseract · jefe directo");
  });

  it("selectContent respeta el filtro p1 también en las referencias", () => {
    const data = conReferencias([]);
    data.references = [
      { p1: true, es: "Sí en una página", en: "Yes on one page" },
      { p1: false, es: "Solo en dos páginas", en: "Two pages only" },
    ];
    expect(selectContent(data, true).references).toHaveLength(1);
    expect(selectContent(data, false).references).toHaveLength(2);
  });
});

/* ══ 4 · LOS SEIS ÓRDENES DEL CATÁLOGO (el fallo silencioso) ═══════════════ */
describe("catálogo · ninguna plantilla puede perder la sección en silencio", () => {
  it("DEFAULT_SECTION_ORDER incluye references y la deja la última", () => {
    expect(DEFAULT_SECTION_ORDER).toContain("references");
    expect(DEFAULT_SECTION_ORDER[DEFAULT_SECTION_ORDER.length - 1]).toBe("references");
  });

  it("TODA plantilla del catálogo lista references en su sectionOrder", () => {
    // ⚠ ESTE ES EL CANDADO DEL BLOQUE. `sectionOrder` es readonly SectionId[]: TS
    // no exige exhaustividad, así que un array al que le falte "references" compila
    // perfectamente y apaga la sección solo en las plantillas que lo usan. Aquí se
    // comprueba plantilla por plantilla, no orden por orden: así también cubre las
    // que declaren su orden a mano en el futuro.
    const sinReferencias: string[] = [];
    for (const tpl of listTemplates()) {
      const m = resolveMetrics(tpl.metrics);
      if (!m.sectionOrder.includes("references")) sinReferencias.push(tpl.id);
    }
    expect(
      sinReferencias,
      `plantillas que perderían las referencias en silencio: ${sinReferencias.join(", ")}`,
    ).toEqual([]);
  });

  it("ningún sectionOrder pierde ni duplica secciones respecto del por defecto", () => {
    const esperado = [...DEFAULT_SECTION_ORDER].sort().join(",");
    for (const tpl of listTemplates()) {
      const m = resolveMetrics(tpl.metrics);
      const suyo = [...m.sectionOrder].sort().join(",");
      expect(suyo, `${tpl.id} no lista las mismas secciones`).toBe(esperado);
      expect(new Set(m.sectionOrder).size, `${tpl.id} repite una sección`).toBe(m.sectionOrder.length);
    }
  });

  it("MUTANTE · un orden al que se le quita references deja de imprimirla", () => {
    // Se simula el olvido: mismo documento, mismo contenido, un sectionOrder al que
    // le falta la sección. Si esto no cambiara la salida, el candado de arriba
    // estaría vigilando algo que no importa.
    const data = conReferencias(["Rodrigo Peña — CTO · Tesseract"]);
    const conLa = toPlainText(data, { locale: "es", onePage: false });
    const mutante: readonly SectionId[] = DEFAULT_SECTION_ORDER.filter((s) => s !== "references");
    const secciones = mutante.filter((id) =>
      documentSections(data, false, metricsOf(data)).includes(id),
    );
    expect(secciones).not.toContain("references");
    expect(conLa).toContain("REFERENCIAS");
  });
});

/* ══ 5 · EL PDF Y SU RAYOS-X (el preview ES el PDF) ════════════════════════ */
describe("PDF · lo que se imprime y lo que el ATS lee dicen lo mismo", () => {
  const data = conReferencias([
    "Rodrigo Peña — CTO · Tesseract · jefe directo · rodrigo@tesseract.cl",
    "Marta Ibáñez — Profesora · Laboratorio VR UNAB · profesora guía · marta@unab.cl",
  ]);

  it("con el opt-in ENCENDIDO, las dos personas están en el PDF re-parseado", async () => {
    const buf = await renderResumeToBuffer(data, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const out = (Array.isArray(text) ? text.join(" ") : text).replace(/\s+/g, " ");
    for (const dato of ["Rodrigo Peña", "Tesseract", "rodrigo@tesseract.cl", "Marta Ibáñez", "Laboratorio VR UNAB"]) {
      expect(out, `el PDF pierde «${dato}»`).toContain(dato);
    }
    expect(out).toContain("REFERENCIAS");
  }, 60000);

  it("con el opt-in APAGADO, ni el nombre ni el correo de terceros llegan al PDF", async () => {
    // La prueba que de verdad importa: los mismos datos existen en el master, pero
    // esta variante no los pidió. El PDF no puede llevarlos.
    const apagado: ResumeData = { ...data, references: [] };
    const buf = await renderResumeToBuffer(apagado, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const out = (Array.isArray(text) ? text.join(" ") : text).replace(/\s+/g, " ");
    for (const dato of ["Rodrigo", "Tesseract", "rodrigo@tesseract.cl", "Marta", "marta@unab.cl"]) {
      expect(out, `dato de terceros filtrado al PDF: «${dato}»`).not.toContain(dato);
    }
    expect(out).not.toContain("REFERENCIAS");
  }, 60000);

  it("el texto plano emite CADA línea del PDF, en orden de lectura", () => {
    const txt = toPlainText(data, { locale: "es", onePage: false });
    const i1 = txt.indexOf("Rodrigo Peña");
    const i2 = txt.indexOf("Marta Ibáñez");
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1); // el mismo orden que la lista
    // La sección va DESPUÉS de educación (es la última del orden por defecto).
    expect(txt.indexOf("REFERENCIAS")).toBeGreaterThan(txt.indexOf("EDUCACIÓN"));
  });
});

/* ══ 6 · VALIDACIÓN DE LA CAPA DE DATOS ═══════════════════════════════════ */
describe("invalidReferenceData · vocabulario cerrado y nombre obligatorio", () => {
  it("acepta los seis campos del contrato", () => {
    const completa = Object.fromEntries(REFERENCE_FIELDS.map((f) => [f, "x"]));
    completa.name = "Rodrigo Peña";
    expect(invalidReferenceData(completa)).toBeNull();
  });

  it("rechaza una clave desconocida en vez de descartarla en silencio", () => {
    // Descartarla sería guardar algo distinto de lo que pidió el cliente y decirle
    // que salió bien — el fallo más caro de todos porque no deja rastro.
    expect(invalidReferenceData({ name: "Ana", notas: "x" })).toContain("notas");
  });

  it("exige el nombre: sin él es una fila vacía con el teléfono de alguien dentro", () => {
    expect(invalidReferenceData({ email: "ana@ejemplo.cl" })).toBeTruthy();
    expect(invalidReferenceData({ name: "   ", email: "ana@ejemplo.cl" })).toBeTruthy();
  });

  it("rechaza lo que no es texto, las listas y el nulo", () => {
    expect(invalidReferenceData(null)).toBeTruthy();
    expect(invalidReferenceData([{ name: "Ana" }])).toBeTruthy();
    expect(invalidReferenceData({ name: "Ana", phone: 56911112222 })).toBeTruthy();
    expect(invalidReferenceData({ name: "A".repeat(401) })).toBeTruthy();
  });
});

describe("parseLinks · el vínculo entra validado o no entra", () => {
  it("normaliza itemId y deja relation en null cuando viene vacía", () => {
    const r = parseLinks([{ itemId: " abc ", relation: "  " }]);
    expect(r).toEqual({ links: [{ itemId: "abc", relation: null }] });
  });

  it("sin links es una lista vacía, no un error", () => {
    expect(parseLinks(undefined)).toEqual({ links: [] });
    expect(parseLinks(null)).toEqual({ links: [] });
  });

  it("rechaza formas inválidas con el motivo real", () => {
    expect(parseLinks("abc")).toHaveProperty("error");
    expect(parseLinks([{ relation: "jefe" }])).toHaveProperty("error");
    expect(parseLinks([{ itemId: "a", otra: 1 }])).toHaveProperty("error");
    expect(parseLinks([{ itemId: "a", relation: "x".repeat(121) }])).toHaveProperty("error");
    expect(parseLinks(Array.from({ length: 21 }, (_, i) => ({ itemId: `i${i}` })))).toHaveProperty("error");
  });
});

describe("faltaMigracion · degradar con honestidad, no reventar", () => {
  it("reconoce la tabla ausente (0005) y el valor de enum ausente (0004)", () => {
    expect(faltaMigracion({ code: "42P01", message: 'relation "reference_links" does not exist' })).toBe(true);
    expect(faltaMigracion({ code: "22P02", message: 'invalid input value for enum item_kind: "reference"' })).toBe(true);
    // Sin código (PostgREST no siempre lo propaga): se reconoce por el texto.
    expect(faltaMigracion({ message: 'relation "reference_links" does not exist' })).toBe(true);
  });

  it("MUTANTE · NO se traga cualquier error (eso escondería bugs de verdad)", () => {
    expect(faltaMigracion({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(faltaMigracion({ message: "network error" })).toBe(false);
    expect(faltaMigracion(null)).toBe(false);
    expect(faltaMigracion("boom")).toBe(false);
  });
});

/* ══ 7 · LA SUGERENCIA (sugerir ≠ añadir) ═════════════════════════════════ */
describe("suggestReferences · propone por el VÍNCULO, nunca añade", () => {
  const jefe: ReferenceView = {
    id: "ref-jefe",
    data: { name: "Rodrigo Peña", org: "Tesseract" },
    origin: "manual",
    sortOrder: 0,
    links: [{ itemId: "proj-tesseract", relation: "jefe directo" }],
  };
  const profe: ReferenceView = {
    id: "ref-profe",
    data: { name: "Marta Ibáñez", org: "UNAB" },
    origin: "manual",
    sortOrder: 1,
    links: [{ itemId: "proj-vr", relation: "profesora guía" }],
  };
  const refs = [jefe, profe];

  it("sugiere SOLO la referencia del proyecto que está en la variante", () => {
    const s = suggestReferences(refs, ["proj-tesseract"], []);
    expect(s).toEqual([{ referenceId: "ref-jefe", becauseOf: ["proj-tesseract"] }]);
  });

  it("no sugiere la que ya está incluida (repetir la propuesta es ruido)", () => {
    expect(suggestReferences(refs, ["proj-tesseract"], ["ref-jefe"])).toEqual([]);
  });

  it("una referencia anclada a VARIAS cosas explica todas las que aplican", () => {
    const doble: ReferenceView = {
      ...jefe,
      links: [
        { itemId: "proj-tesseract", relation: "jefe directo" },
        { itemId: "work-tesseract", relation: "stakeholder" },
      ],
    };
    const s = suggestReferences([doble], ["proj-tesseract", "work-tesseract"], []);
    expect(s[0]!.becauseOf).toEqual(["proj-tesseract", "work-tesseract"]);
  });

  it("MUTANTE · sin vínculo NO hay sugerencia (el vínculo es lo importante)", () => {
    const suelta: ReferenceView = { ...jefe, links: [] };
    expect(suggestReferences([suelta], ["proj-tesseract"], [])).toEqual([]);
    // Y con vínculo a algo que la variante NO incluye, tampoco.
    expect(suggestReferences(refs, ["proj-otro"], [])).toEqual([]);
  });
});

/* ══ 8 · EL CRITERIO DE ÉXITO, LITERAL ════════════════════════════════════
   «puedo añadir a mi jefe de Tesseract y al profesor del laboratorio VR, cada uno
   vinculado a su proyecto, y decidir por variante si aparecen.»
   Se ejerce el recorrido entero con las piezas puras: master → vínculos →
   sugerencia → composición de la variante → documento, encendido y apagado.      */
describe("criterio de éxito · el jefe de Tesseract y el profesor del laboratorio VR", () => {
  // El master: dos proyectos y las dos personas, cada una anclada al suyo.
  const PROY_TESSERACT = "item-proyecto-tesseract";
  const PROY_VR = "item-proyecto-vr";
  const jefe = {
    id: "ref-jefe",
    data: { name: "Rodrigo Peña", role: "CTO", org: "Tesseract", relation: "jefe directo", email: "rodrigo@tesseract.cl" },
    origin: "manual",
    sortOrder: 0,
    links: [{ itemId: PROY_TESSERACT, relation: "jefe directo" }],
  } satisfies ReferenceView;
  const profe = {
    id: "ref-profe",
    data: { name: "Marta Ibáñez", role: "Profesora", org: "Laboratorio VR UNAB", relation: "profesora guía", email: "marta@unab.cl" },
    origin: "manual",
    sortOrder: 1,
    links: [{ itemId: PROY_VR, relation: "profesora guía" }],
  } satisfies ReferenceView;
  const master: ReferenceView[] = [jefe, profe];

  /** Espeja buildVariantResumeData/buildEditorResumeData: el opt-in decide, y solo
   *  entran las referencias que la variante compuso. */
  const documentoDe = (basicsOverride: Record<string, unknown>, refsEnVariante: ReferenceView[]): ResumeData => ({
    ...base,
    headings: { ...base.headings, references: H_REF },
    references: referencesOptIn(basicsOverride)
      ? refsEnVariante.map((r) => {
          const linea = referenceLine(r.data);
          return { p1: true, es: linea, en: linea };
        })
      : [],
  });

  it("1 · cada uno queda vinculado a SU proyecto, no al del otro", () => {
    expect(suggestReferences(master, [PROY_TESSERACT], [])).toEqual([
      { referenceId: "ref-jefe", becauseOf: [PROY_TESSERACT] },
    ]);
    expect(suggestReferences(master, [PROY_VR], [])).toEqual([
      { referenceId: "ref-profe", becauseOf: [PROY_VR] },
    ]);
  });

  it("2 · variante A (proyecto Tesseract, referencias ENCENDIDAS): sale el jefe y solo el jefe", () => {
    const varianteA = mergePresentationOverride({}, { showReferences: true });
    const doc = documentoDe(varianteA, [jefe]);
    const txt = toPlainText(doc, { locale: "es", onePage: false });
    expect(txt).toContain("REFERENCIAS");
    expect(txt).toContain("Rodrigo Peña — CTO · Tesseract · jefe directo · rodrigo@tesseract.cl");
    expect(txt).not.toContain("Marta Ibáñez");
  });

  it("3 · variante B (mismo master, referencias APAGADAS): no sale ninguna", () => {
    const varianteB = {}; // nunca se tocó el interruptor: apagado
    const doc = documentoDe(varianteB, [jefe, profe]);
    expect(documentSections(doc, false, metricsOf(doc))).not.toContain("references");
    const txt = toPlainText(doc, { locale: "es", onePage: false });
    expect(txt).not.toContain("Rodrigo Peña");
    expect(txt).not.toContain("Marta Ibáñez");
    expect(txt).not.toContain("rodrigo@tesseract.cl");
  });

  it("4 · variante C (el profesor, encendidas): la decisión es POR VARIANTE", () => {
    const varianteC = mergePresentationOverride({}, { showReferences: true });
    const txt = toPlainText(documentoDe(varianteC, [profe]), { locale: "es", onePage: false });
    expect(txt).toContain("Marta Ibáñez — Profesora · Laboratorio VR UNAB · profesora guía · marta@unab.cl");
    expect(txt).not.toContain("Rodrigo Peña");
  });

  it("5 · apagar una variante ya encendida vuelve a sacar los datos del documento", () => {
    const encendida = mergePresentationOverride({}, { showReferences: true });
    expect(toPlainText(documentoDe(encendida, [jefe]), { locale: "es" })).toContain("Rodrigo Peña");
    const apagada = mergePresentationOverride(encendida, { showReferences: false });
    expect(toPlainText(documentoDe(apagada, [jefe]), { locale: "es" })).not.toContain("Rodrigo Peña");
  });
});
