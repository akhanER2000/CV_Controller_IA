import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDocumentProxy, extractText } from "unpdf";
import {
  DOCUMENT_HEADINGS,
  SECTION_ORDER_FIELD,
  documentSections,
  mergePresentationOverride,
  metricsOf,
  normalizeSectionOrder,
  toPlainText,
  type ResumeData,
} from "../src/lib/cv/resume";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import {
  ALL_SECTION_IDS,
  DEFAULT_SECTION_ORDER,
  PINNED_LAST_SECTION,
  SECTION_ORDER_PRESETS,
  getTemplate,
  resolveMetrics,
  type SectionId,
} from "../src/lib/cv/templates";
import { ORDEN } from "../src/lib/cv/catalog";
import { buildEditorResumeData } from "../src/components/screens/EditorVarianteScreen";

/* ============================================================================
   BLOQUE B · ORDEN DE SECCIONES POR VARIANTE

   Lo que se prueba: que «Backend» pueda llevar habilidades arriba e
   «Investigación» publicaciones arriba CON LA MISMA PLANTILLA, que cada una
   recuerde el suyo, y que los tres candados no se puedan saltar:

     1. EL PREVIEW ES EL PDF. El orden tiene que reordenar los DOS renderizadores.
        Antes de este bloque, ResumePDF resolvía su métrica por su cuenta
        (`resolveMetrics(tpl.metrics)`) y toPlainText por otra (`metricsOf`): un
        orden por variante habría reordenado el rayos-X y no el documento.
     2. LAS REFERENCIAS, AL FINAL SIEMPRE. Una referencia no abre un CV.
     3. LA CABECERA NO SE REORDENA: nombre y contacto van arriba, fijos. Solo se
        reordena el CUERPO.

   Y una regla que parece un detalle y es el fallo capital disfrazado: un orden
   guardado NO PUEDE PERDER una sección. Si mañana nace una sección, las variantes
   que ya guardaron su orden tienen que imprimirla igual (al final, pero imprimirla).
   ============================================================================ */

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, "../src/lib/cv/fixtures");
const base = JSON.parse(readFileSync(path.join(fx, "datos-ejemplo.json"), "utf8")) as ResumeData;

const norm = (x: string) => x.replace(/\s+/g, " ").trim();
const dosLenguas = (s: string) => ({ es: s, en: s });

/** El golden con las nueve secciones con contenido: para que reordenar se NOTE. */
function documento(extra: Partial<ResumeData> = {}): ResumeData {
  return {
    ...base,
    headings: DOCUMENT_HEADINGS,
    certifications: [
      { title: dosLenguas("AWS Certified Solutions Architect"), org: "Amazon Web Services", dates: dosLenguas("jun 2024"), p1: true },
    ],
    languages: [{ p1: true, ...dosLenguas("Inglés — profesional (B2)") }],
    publications: [{ p1: true, ...dosLenguas("Conciliación a escala — PyCon Chile 2023") }],
    references: [{ p1: true, ...dosLenguas("Rodrigo Peña — CTO · Tesseract") }],
    ...extra,
  };
}

/** Los rótulos, en el orden en que aparecen en el texto plano. */
function rotulos(data: ResumeData): string[] {
  const nombres = new Set(
    Object.values(DOCUMENT_HEADINGS).map((h) => h.es.toUpperCase()),
  );
  return toPlainText(data, { locale: "es" })
    .split("\n")
    .filter((l) => nombres.has(l));
}

/* ══ 1 · normalizeSectionOrder · lo que llega de fuera no manda tal cual ═══ */
describe("normalizeSectionOrder · un jsonb del usuario no puede dejar a nadie sin secciones", () => {
  it("respeta el orden pedido y completa lo que falte al final", () => {
    const r = normalizeSectionOrder(["work", "summary"])!;
    expect(r.slice(0, 2)).toEqual(["work", "summary"]);
    // ⚠ LA REGLA QUE IMPIDE EL FALLO CAPITAL: lo que falta SE AÑADE. Un orden
    // guardado cuando aún no existían certificaciones tiene que seguir
    // imprimiéndolas — al final, pero imprimiéndolas.
    for (const id of ALL_SECTION_IDS) expect(r, `perdió «${id}»`).toContain(id);
    expect(r).toHaveLength(ALL_SECTION_IDS.length);
  });

  it("descarta ids desconocidos y duplicados", () => {
    const r = normalizeSectionOrder(["skills", "skills", "inventada", 7, null, "work"])!;
    expect(r.slice(0, 2)).toEqual(["skills", "work"]);
    expect(new Set(r).size).toBe(r.length);
    expect(r).not.toContain("inventada" as SectionId);
  });

  it("las REFERENCIAS acaban al final aunque las pidan primeras", () => {
    const r = normalizeSectionOrder(["references", "work", "summary"])!;
    expect(r[r.length - 1]).toBe(PINNED_LAST_SECTION);
    expect(r.indexOf("references")).toBe(r.length - 1);
  });

  it("lo que no es una lista aprovechable devuelve null (manda la plantilla)", () => {
    for (const basura of [null, undefined, "work", 7, {}, [], ["nada", "de", "esto"]]) {
      expect(normalizeSectionOrder(basura), `«${JSON.stringify(basura)}» debería no valer`).toBeNull();
    }
  });

  it("completa siguiendo la BASE que se le pase (el orden de la plantilla)", () => {
    // Si la variante solo dijo «resumen primero», el resto lo decide la plantilla
    // elegida, no una lista global: cambiar de plantilla sigue significando algo.
    const r = normalizeSectionOrder(["summary"], ORDEN.formacion)!;
    expect(r[0]).toBe("summary");
    expect(r[1]).toBe("education"); // lo que va segundo en el orden «formación»
  });

  it("MUTANTE · sin la regla de completar, un orden viejo perdería secciones", () => {
    // Se simula un orden guardado ANTES de que existieran las tres secciones
    // nuevas: seis ids, los de la versión anterior del producto.
    const viejo = ["summary", "skills", "work", "projects", "education", "references"];
    const r = normalizeSectionOrder(viejo)!;
    expect(r).toContain("certifications");
    expect(r).toContain("languages");
    expect(r).toContain("publications");
    // Y las nuevas van DETRÁS de lo que el usuario había ordenado (no le cambian
    // el CV por sorpresa), pero por delante de las referencias.
    expect(r.indexOf("certifications")).toBeGreaterThan(r.indexOf("education"));
    expect(r.indexOf("certifications")).toBeLessThan(r.indexOf("references"));
  });
});

/* ══ 2 · DÓNDE SE GUARDA (el override de basics, sin migración) ════════════ */
describe("mergePresentationOverride · el orden vive donde la plantilla y la foto", () => {
  it("guarda el orden YA NORMALIZADO, no lo que llegó", () => {
    const ov = mergePresentationOverride({}, { sectionOrder: ["work", "work", "loquesea"] as SectionId[] });
    const guardado = ov[SECTION_ORDER_FIELD] as SectionId[];
    expect(guardado[0]).toBe("work");
    expect(guardado).toHaveLength(ALL_SECTION_IDS.length);
    expect(guardado[guardado.length - 1]).toBe("references");
  });

  it("null BORRA la clave (volver al orden de la plantilla, no congelar el actual)", () => {
    const con = mergePresentationOverride({}, { sectionOrder: ["work"] as SectionId[] });
    expect(SECTION_ORDER_FIELD in con).toBe(true);
    const sin = mergePresentationOverride(con, { sectionOrder: null });
    // Apagado y «nunca tocado» son el MISMO objeto: no hay dos formas de estar sin
    // orden propio que puedan divergir más adelante.
    expect(SECTION_ORDER_FIELD in sin).toBe(false);
  });

  it("undefined NO toca el orden (subir una foto no te reordena el CV)", () => {
    const con = mergePresentationOverride({}, { sectionOrder: ["projects"] as SectionId[] });
    const tras = mergePresentationOverride(con, { photo: "data:image/png;base64,AAA=" });
    expect((tras[SECTION_ORDER_FIELD] as SectionId[])[0]).toBe("projects");
  });

  it("una lista de basura entera se trata como null (no guarda un orden vacío)", () => {
    const con = mergePresentationOverride({}, { sectionOrder: ["work"] as SectionId[] });
    const tras = mergePresentationOverride(con, { sectionOrder: ["ninguna"] as unknown as SectionId[] });
    expect(SECTION_ORDER_FIELD in tras).toBe(false);
  });
});

/* ══ 3 · EL DOCUMENTO SE REORDENA (y los dos renderizadores a la vez) ══════ */
describe("el orden de la variante pisa al de la plantilla", () => {
  it("metricsOf aplica el orden del documento sobre el de la plantilla", () => {
    const conOrden = documento({ sectionOrder: ["publications", "summary"] as SectionId[] });
    const m = metricsOf(conOrden);
    expect(m.sectionOrder[0]).toBe("publications");
    // Sin orden propio, el de la plantilla, intacto.
    expect(metricsOf(documento()).sectionOrder).toEqual(DEFAULT_SECTION_ORDER);
  });

  it("el texto plano cambia de orden y NO cambia de contenido", () => {
    const normal = documento();
    const investigacion = documento({
      sectionOrder: ["summary", "publications", "education", "work"] as SectionId[],
    });
    expect(rotulos(normal)[1]).toBe("HABILIDADES");
    expect(rotulos(investigacion)[1]).toBe("PUBLICACIONES");
    // Mismo documento, otro orden: ninguna línea de contenido se pierde.
    const cuenta = (t: string) => t.split("\n").filter(Boolean).sort().join("\n");
    expect(cuenta(toPlainText(investigacion, { locale: "es" }))).toBe(
      cuenta(toPlainText(normal, { locale: "es" })),
    );
  });

  it("★ EL PDF SE REORDENA IGUAL QUE SU RAYOS-X (el preview ES el PDF)", async () => {
    // El candado del bloque. Se renderiza el PDF REAL con un orden de variante y se
    // exige que sus líneas salgan en el mismo orden que las del texto plano. Con la
    // métrica resuelta por separado en cada renderizador, esto cae.
    const data = documento({
      sectionOrder: ["summary", "publications", "certifications", "skills", "work"] as SectionId[],
    });
    const buf = await renderResumeToBuffer(data, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const extraido = norm(Array.isArray(text) ? text.join(" ") : text);

    let cursor = 0;
    for (const linea of toPlainText(data, { locale: "es" }).split("\n").map(norm).filter(Boolean)) {
      const i = extraido.indexOf(linea, cursor);
      expect(i, `fuera de orden o ausente en el PDF: "${linea}"`).toBeGreaterThanOrEqual(0);
      cursor = i + linea.length;
    }
    // Y el orden pedido es el que se ve: publicaciones antes que habilidades.
    expect(extraido.indexOf("PUBLICACIONES")).toBeLessThan(extraido.indexOf("HABILIDADES"));
  }, 60000);

  it("CANDADO · las referencias siguen al final aunque se pidan arriba", () => {
    const data = documento({ sectionOrder: ["references", "summary", "work"] as SectionId[] });
    const rs = rotulos(data);
    expect(rs[rs.length - 1]).toBe("REFERENCIAS");
  });

  it("CANDADO · la CABECERA no se reordena: nombre y contacto siguen arriba", () => {
    // Solo se reordena el cuerpo. El nombre, el título objetivo y el contacto son la
    // cabecera del documento y no entran en `sectionOrder` — que un orden raro
    // pudiera empujar el nombre a la mitad del CV sería un bug de otra categoría.
    const data = documento({ sectionOrder: ["publications", "work"] as SectionId[] });
    const lineas = toPlainText(data, { locale: "es" }).split("\n");
    expect(lineas[0]).toBe(base.basics.name);
    expect(lineas[1]).toBe(base.basics.label.es);
    expect(lineas[2]).toContain(base.basics.email);
  });

  it("cada VARIANTE recuerda el suyo: dos overrides, dos documentos", () => {
    // «Backend» con habilidades arriba y «Investigación» con publicaciones arriba,
    // MISMA plantilla y mismo master. Es el criterio de éxito del punto, ejercido
    // con las piezas puras (el override de basics de cada variante).
    const backend = mergePresentationOverride({}, { sectionOrder: ORDEN.habilidades });
    const investigacion = mergePresentationOverride({}, {
      sectionOrder: ["summary", "publications", "education", "work"] as SectionId[],
    });
    const docDe = (ov: Record<string, unknown>) =>
      documento({ sectionOrder: normalizeSectionOrder(ov[SECTION_ORDER_FIELD]) ?? undefined });
    expect(rotulos(docDe(backend))[1]).toBe("HABILIDADES");
    expect(rotulos(docDe(investigacion))[1]).toBe("PUBLICACIONES");
    // Y ninguno de los dos contamina al otro.
    expect(rotulos(docDe(backend))).not.toEqual(rotulos(docDe(investigacion)));
  });

  it("una sección VACÍA no aparece aunque se ponga la primera", () => {
    // Reordenar no imprime lo que no existe: el orden decide dónde, no si.
    const sinPubs = documento({ publications: [], sectionOrder: ["publications", "summary"] as SectionId[] });
    expect(documentSections(sinPubs, false, metricsOf(sinPubs))).not.toContain("publications");
    expect(rotulos(sinPubs)[0]).toBe("RESUMEN");
  });
});

/* ══ 4 · EL ESPEJO DEL EDITOR (lo que ve el usuario es lo que se descarga) ═ */
describe("buildEditorResumeData · el preview lee el orden del mismo sitio que el servidor", () => {
  it("toma el sectionOrder del basics EFECTIVO de la variante", () => {
    const doc = buildEditorResumeData({
      items: [],
      basicsData: {
        name: "Diego Gatica",
        [SECTION_ORDER_FIELD]: ["work", "summary"],
      },
      masterById: new Map(),
      targetTitle: "Backend",
    });
    expect(doc.sectionOrder?.[0]).toBe("work");
    expect(doc.sectionOrder).toHaveLength(ALL_SECTION_IDS.length);
  });

  it("un orden corrupto en la base no deja al editor sin secciones", () => {
    const doc = buildEditorResumeData({
      items: [],
      basicsData: { name: "Diego", [SECTION_ORDER_FIELD]: "esto no es una lista" },
      masterById: new Map(),
      targetTitle: "",
    });
    expect(doc.sectionOrder).toBeUndefined(); // ⇒ manda la plantilla
    expect(metricsOf(doc).sectionOrder).toEqual(DEFAULT_SECTION_ORDER);
  });
});

/* ══ 5 · LOS PRESETS (reusados del catálogo, sin prometer nada) ════════════ */
describe("presets de orden · son los del catálogo y describen para quién son", () => {
  it("los tres presets SON los arrays del catálogo (no una copia paralela)", () => {
    // Identidad de referencia a propósito: si alguien redefiniera los presets, esta
    // igualdad estricta cae. Dos listas iguales mantenidas a mano divergen.
    const porId = new Map(SECTION_ORDER_PRESETS.map((p) => [p.id, p.order]));
    expect(porId.get("tecnico")).toBe(ORDEN.habilidades);
    expect(porId.get("clasico")).toBe(ORDEN.experiencia);
    expect(porId.get("junior")).toBe(ORDEN.formacion);
  });

  it("cada preset lista las nueve secciones y cierra con referencias", () => {
    for (const p of SECTION_ORDER_PRESETS) {
      expect([...p.order].sort(), `${p.id} no lista las mismas secciones`).toEqual([...ALL_SECTION_IDS].sort());
      expect(p.order[p.order.length - 1], `${p.id} no cierra con references`).toBe("references");
    }
  });

  it("cada preset hace lo que su nombre dice (y son distintos entre sí)", () => {
    const pos = (o: readonly SectionId[], id: SectionId) => o.indexOf(id);
    const tecnico = SECTION_ORDER_PRESETS.find((p) => p.id === "tecnico")!.order;
    const clasico = SECTION_ORDER_PRESETS.find((p) => p.id === "clasico")!.order;
    const junior = SECTION_ORDER_PRESETS.find((p) => p.id === "junior")!.order;
    expect(pos(tecnico, "skills")).toBeLessThan(pos(tecnico, "work"));
    expect(pos(clasico, "work")).toBeLessThan(pos(clasico, "skills"));
    expect(pos(junior, "education")).toBeLessThan(pos(junior, "work"));
    // Un preset que ordenara igual que otro sería un botón que no hace nada.
    const firmas = new Set([tecnico.join(">"), clasico.join(">"), junior.join(">")]);
    expect(firmas.size).toBe(3);
  });

  it("aplicar un preset reordena el documento de verdad", () => {
    const junior = SECTION_ORDER_PRESETS.find((p) => p.id === "junior")!;
    const data = documento({ sectionOrder: junior.order });
    expect(rotulos(data)[1]).toBe("EDUCACIÓN");
  });
});

/* ══ 6 · NO SE ROMPE LO QUE HABÍA ═════════════════════════════════════════ */
describe("sin orden propio, todo sigue exactamente igual", () => {
  it("un documento sin sectionOrder usa el de SU plantilla, plantilla a plantilla", () => {
    for (const id of ["ats-clasica", "ats-veterana", "ats-academica", "ats-portafolio"]) {
      const tpl = getTemplate(id);
      const data = documento({ templateId: id });
      expect(metricsOf(data).sectionOrder, `${id} dejó de mandar en su propio orden`).toEqual(
        resolveMetrics(tpl.metrics).sectionOrder,
      );
    }
  });

  it("el orden por variante NO cambia el documento por defecto (golden intacto)", () => {
    const golden = readFileSync(path.join(fx, "cv-texto-plano.txt"), "utf8");
    expect(toPlainText(base, { locale: "es", onePage: false })).toBe(golden);
  });
});
