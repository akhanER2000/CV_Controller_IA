import { describe, it, expect } from "vitest";
import {
  casarConMaster, huella, nombreSinExtension, ordenPropio, ordenarComoElCv, seccionesEnOrden,
  textoCorto, tituloDelCv, type ItemMaster,
} from "../src/app/api/variants/desde-cv/plan";
import type { StagedRow } from "../src/lib/extract/types";

/* DA-V7 · «Partir de mi CV anterior»: orden del documento, página, casado con el
   master. Persona y CV INVENTADOS. */

const fila = (key: string, kind: StagedRow["kind"], data: Record<string, unknown>, ev: string | null, parentKey?: string): StagedRow => ({
  key, kind, data, parentKey, lang: "es", origin: "extracted", sourceLabel: "cv",
  evidenceSnippet: ev, evidenceLevel: "verified", evidenceVerified: true,
});

const PAG1 = `Valentina Rossi Analista de Datos
Experiencia
Analista de Datos — Banco Austral (2021 – hoy)
Automaticé el cierre mensual con Python.`;
const PAG2 = `Formación
Ingeniería Civil Industrial — Universidad del Sur (2014 – 2019)
Aptitudes
Lenguajes: Python, SQL`;
const TEXTO = PAG1 + "\n" + PAG2;

// El extractor trocea POR SECCIÓN: devuelve formación antes que experiencia.
const FILAS: StagedRow[] = [
  fila("b", "basics", { name: "Valentina Rossi", label: "Analista de Datos" }, "Valentina Rossi · v@ejemplo.cl"),
  fila("s", "skill", { group: "Lenguajes", items: "Python, SQL" }, "Lenguajes: Python, SQL"),
  fila("e", "education", { degree: "Ingeniería Civil Industrial", institution: "Universidad del Sur" }, "Ingeniería Civil Industrial — Universidad del Sur"),
  fila("v1", "bullet", { text: "Automaticé el cierre mensual con Python." }, "Automaticé el cierre mensual con Python.", "w"),
  fila("w", "work", { title: "Analista de Datos", company: "Banco Austral", dates: "2021 – hoy" }, "Analista de Datos — Banco Austral (2021 – hoy)"),
];

describe("ordenarComoElCv", () => {
  it("devuelve el orden del DOCUMENTO, no el del extractor, con su página", () => {
    const o = ordenarComoElCv(FILAS, TEXTO, [PAG1, PAG2]);
    expect(o.map((x) => x.fila.key)).toEqual(["b", "w", "v1", "e", "s"]);
    expect(o.map((x) => x.orden)).toEqual([0, 1, 2, 3, 4]);
    expect(Object.fromEntries(o.map((x) => [x.fila.key, x.pagina]))).toEqual({ b: null, w: 1, v1: 1, e: 2, s: 2 });
  });

  it("sin páginas (DOCX) no inventa ninguna", () => {
    expect(ordenarComoElCv(FILAS, TEXTO).every((x) => x.pagina === null)).toBe(true);
  });

  it("una viñeta nunca queda antes que su rol, y una fila sin cita se queda junto a su vecina", () => {
    const filas = [
      fila("w", "work", { title: "X", company: "Y" }, "Formación"),
      fila("v", "bullet", { text: "Hola" }, "Valentina Rossi", "w"),
      fila("z", "certification", { name: "Z" }, "no aparece en el texto"),
    ];
    const o = ordenarComoElCv(filas, TEXTO).map((x) => x.fila.key);
    expect(o.indexOf("v")).toBeGreaterThan(o.indexOf("w"));
    expect(o).toEqual(["w", "v", "z"]);
  });

  it("una viñeta hereda la página de su rol si su cita no se localiza", () => {
    const filas = [fila("w", "work", { title: "A" }, "Banco Austral"), fila("v", "bullet", { text: "?" }, "texto que no está", "w")];
    expect(ordenarComoElCv(filas, TEXTO, [PAG1, PAG2]).map((x) => x.pagina)).toEqual([1, 1]);
  });
});

describe("secciones y título", () => {
  it("el orden de secciones es el de la primera aparición; basics y viñetas no son sección", () => {
    const o = ordenarComoElCv(FILAS, TEXTO).map((x) => x.fila.kind);
    expect(seccionesEnOrden(o)).toEqual(["work", "education", "skills"]);
    expect(seccionesEnOrden(["basics", "bullet"])).toBeNull();
  });
  it("ordenPropio solo es true si difiere del orden por defecto", () => {
    expect(ordenPropio(["work", "education", "skills"])).toBe(true);
    expect(ordenPropio(["summary", "skills", "work"])).toBe(false);
    expect(ordenPropio(null)).toBe(false);
  });
  it("título = basics.label; nombre de archivo sin extensión", () => {
    expect(tituloDelCv(FILAS)).toBe("Analista de Datos");
    expect(tituloDelCv([])).toBe("");
    expect(nombreSinExtension("cv_valentina_2024.docx")).toBe("cv valentina 2024");
  });
  it("textoCorto resume cada kind", () => {
    expect(textoCorto("work", { title: "Analista", company: "Banco" })).toBe("Analista · Banco");
    expect(textoCorto("certification", { name: "AWS" })).toBe("AWS");
  });
});

describe("casarConMaster", () => {
  const master: ItemMaster[] = [
    { id: "mb", kind: "basics", parentId: null, data: { name: "Valentina Rossi" } },
    { id: "mw", kind: "work", parentId: null, data: { title: "Analista de Datos", company: "Banco Austral", dates: "2021 – hoy" } },
    { id: "mv", kind: "bullet", parentId: "mw", data: { text: "automaticé el cierre  mensual con Python." } },
    { id: "me", kind: "education", parentId: null, data: { degree: "Ingeniería Civil Industrial", institution: "Universidad del Sur", dates: "2014" } },
  ];

  it("reconoce rol, viñeta, formación y cabecera; lo demás es nuevo", () => {
    const m = casarConMaster(master, FILAS);
    expect(Object.fromEntries(m)).toEqual({ w: "mw", v1: "mv", e: "me", b: "mb" });
    expect(m.has("s")).toBe(false); // la aptitud no está en el master: nueva
  });

  it("una viñeta de un rol NUEVO nunca se da por repetida", () => {
    const m = casarConMaster([{ id: "mv", kind: "bullet", parentId: "otro", data: { text: "Automaticé el cierre mensual con Python." } }], FILAS);
    expect(m.has("v1")).toBe(false);
  });

  it("cada item del master se usa una sola vez", () => {
    const dos = [
      fila("x1", "certification", { name: "AWS Cloud Practitioner" }, null),
      fila("x2", "certification", { name: "AWS Cloud Practitioner" }, null),
    ];
    const m = casarConMaster([{ id: "mc", kind: "certification", parentId: null, data: { name: "aws  cloud practitioner" } }], dos);
    expect([...m.entries()]).toEqual([["x1", "mc"]]);
  });

  it("master vacío: todo es nuevo", () => {
    expect(casarConMaster([], FILAS).size).toBe(0);
  });

  it("la huella ignora metadatos y fechas derivadas", () => {
    expect(huella({ text: "Hola  Mundo", _orden: 3, dateStart: "2020-01" })).toBe(huella({ text: "hola mundo" }));
  });
});
