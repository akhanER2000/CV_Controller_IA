import { describe, it, expect } from "vitest";
import { consolidarEnOrigen, candidatosDedup, runImport, type OrigenFusionado, type ImportDeps } from "../src/lib/extract/pipeline";
import type { Extractor } from "../src/lib/extract/llm";
import type { Fuente } from "../src/lib/extract/segmentar";
import type { StagedRow } from "../src/lib/extract/types";

/* ============================================================================
   CONSOLIDACIÓN EN ORIGEN · el mismo hecho, contado tres veces, en UNA tarjeta.

   EL CASO REAL, y está en el documento A PROPÓSITO. El dossier describe cada
   trabajo desde tres ángulos marcados: [LI] lo que dice LinkedIn, [PF] lo que
   dice el portfolio, [CU] lo que contestó el usuario. El extractor lee por
   ventanas y sin memoria, así que devuelve TRES cargos. El staging enseñaba tres
   tarjetas —la primera limpia y dos marcadas «posible duplicado»— y el usuario
   tenía que comparar tres textos a mano para concluir lo que el detector ya
   sabía.

   ESTE FICHERO EXISTE PARA ROMPER LA FUSIÓN. Fusionar de más es peor que no
   fusionar: mete dos empleos distintos en una tarjeta. Por eso media docena de
   pruebas de aquí son casos que NO se pueden tocar — una promoción interna, dos
   cargos iguales en empresas distintas, una sospecha que solo llega a «media», y
   dos cargos cuyos títulos se contradicen.

   ⚠ LA REGLA QUE NO SE NEGOCIA: nada se descarta. Cada versión absorbida deja su
     cargo, su empresa, sus fechas, su cita y su fuente en `data._origenes`, y la
     tarjeta queda MARCADA como posible duplicado. Es una propuesta, no un
     veredicto: el usuario sigue decidiendo.
   ============================================================================ */

let n = 0;
const k = (p: string) => `${p}-${++n}`;

/* Dos redacciones del MISMO hecho. Comparten entidades (PharmIQ, GCP) y cifras
   (38%, p95): es lo que el detector semántico usa para decir «esto es lo mismo».
   Sin contenido compartido no hay «alta», y sin «alta» no hay fusión. */
const TXT_LI = "Diseñé el servicio de inferencia de PharmIQ en GCP y bajé la latencia p95 un 38% con caché semántica y batching.";
const TXT_PF = "En PharmIQ diseñé el servicio de inferencia sobre GCP; la latencia p95 bajó un 38% gracias a caché semántica y batching.";
const TXT_CU = "PharmIQ: servicio de inferencia en GCP, latencia p95 un 38% menor con caché semántica y batching.";

function work(
  title: string,
  company: string,
  dates: string,
  evidencia: string,
  extra: { fuente?: string; key?: string } = {},
): StagedRow {
  return {
    key: extra.key ?? k("work"),
    kind: "work",
    data: { title, company, location: "", dates },
    lang: "es",
    origin: "extracted",
    sourceLabel: extra.fuente ?? "texto pegado",
    evidenceSnippet: evidencia,
    evidenceLevel: "verified",
    evidenceVerified: true,
  };
}

function bullet(parentKey: string, text: string): StagedRow {
  return {
    key: k("bullet"), parentKey, kind: "bullet",
    data: { text }, lang: "es", origin: "extracted", sourceLabel: "texto pegado",
    evidenceSnippet: text, evidenceLevel: "verified", evidenceVerified: true,
  };
}

function proyecto(name: string, description: string): StagedRow {
  return {
    key: k("proj"), kind: "project",
    data: { name, url: "", description, dates: "" },
    lang: "es", origin: "extracted", sourceLabel: "texto pegado",
    evidenceSnippet: description, evidenceLevel: "verified", evidenceVerified: true,
  };
}

/** Corre la consolidación como lo hace `runImport`: con los MISMOS candidatos. */
function consolidar(filas: StagedRow[], multiFuente = false) {
  return consolidarEnOrigen(filas, candidatosDedup(filas, multiFuente), 2026);
}

const origenes = (r: StagedRow) => (r.data._origenes as OrigenFusionado[] | undefined) ?? [];

/**
 * Las tres versiones del mismo empleo, como las devuelve el extractor sobre el
 * dossier: las tres salen del MISMO documento (el dossier cuenta cada trabajo
 * desde [LI], [PF] y [CU] a propósito), y por eso las tres comparten etiqueta de
 * fuente. Es el caso que la consolidación existe para resolver.
 */
const tresVersiones = () => [
  work("Founder & AI Engineer", "PharmIQ SpA", "abr 2024 – actualidad", TXT_LI, { key: "LI" }),
  work("Founder y AI Engineer", "PharmIQ", "2024 – hoy", TXT_PF, { key: "PF" }),
  work("Founder AI Engineer", "PharmIQ", "abr 2024", TXT_CU, { key: "CU" }),
];

// ════════════════════════════════════════════════════════════════════════════
// LO QUE SÍ SE FUSIONA
// ════════════════════════════════════════════════════════════════════════════
describe("★ misma empresa + fechas que se solapan ⇒ UNA tarjeta con sus orígenes", () => {
  it("★★ tres versiones del mismo empleo salen como UN item, no como tres", () => {
    const { filas: out, fusionadas } = consolidar(tresVersiones(), true);
    expect(fusionadas).toBe(2);
    expect(out.filter((r) => r.kind === "work")).toHaveLength(1);
    expect(origenes(out[0]!)).toHaveLength(3);
  });

  it("★★ LOS TRES ORÍGENES se conservan con su redacción, su empresa y su cita", () => {
    const { filas: out } = consolidar(tresVersiones(), true);
    const o = origenes(out[0]!);
    expect(o.map((x) => x.titulo)).toEqual(["Founder & AI Engineer", "Founder y AI Engineer", "Founder AI Engineer"]);
    expect(o.map((x) => x.empresa)).toEqual(["PharmIQ SpA", "PharmIQ", "PharmIQ"]);
    expect(o.map((x) => x.fechas)).toEqual(["abr 2024 – actualidad", "2024 – hoy", "abr 2024"]);
    expect(o.map((x) => x.evidencia)).toEqual([TXT_LI, TXT_PF, TXT_CU]);
    expect(o.map((x) => x.fuente)).toEqual(["texto pegado", "texto pegado", "texto pegado"]);
  });

  it("★★ la tarjeta queda MARCADA como posible duplicado, con motivo legible", () => {
    const { filas: out } = consolidar(tresVersiones(), true);
    const d = out[0]!.duplicate;
    expect(d, "una fusión sin marca sería una decisión tomada a espaldas del usuario").toBeTruthy();
    expect(d!.level).toBe("alta");
    expect(d!.signals.length).toBeGreaterThan(0);
    expect(d!.reason).toContain("ya fusionados");
    expect(d!.reason).toContain("No se descartó nada");
    expect(d!.reason).toContain("Decide tú");
    // y nombra las tres redacciones: el usuario tiene que poder compararlas
    for (const t of ["Founder & AI Engineer", "Founder y AI Engineer", "Founder AI Engineer"]) {
      expect(d!.reason).toContain(t);
    }
  });

  it("★★ el campo que le falta a una versión lo aporta la otra", () => {
    const sinFecha = work("Founder & AI Engineer", "PharmIQ SpA", "", TXT_LI);
    const conFecha = work("Founder & AI Engineer", "PharmIQ", "abr 2024 – actualidad", TXT_PF);
    const { filas: out, fusionadas } = consolidar([sinFecha, conFecha]);
    expect(fusionadas).toBe(1);
    expect(out).toHaveLength(1);
    expect(out[0]!.data.dates).toBe("abr 2024 – actualidad");
    expect(out[0]!.data.title).toBe("Founder & AI Engineer");
  });

  it("☠★ las FECHAS DERIVADAS se recalculan: `dateMissing` no sobrevive a la fusión", () => {
    // Si no se recalculara, la tarjeta diría «sin fecha» teniendo una. Sería una
    // mentira NACIDA de fusionar, que es peor que no fusionar.
    const a = work("Founder & AI Engineer", "PharmIQ SpA", "", TXT_LI);
    a.data.dateMissing = true;
    const b = work("Founder & AI Engineer", "PharmIQ", "abr 2024 – actualidad", TXT_PF);
    const { filas: out } = consolidar([a, b]);
    expect(out[0]!.data.dateMissing).toBeUndefined();
    expect(out[0]!.data.dateStart).toBeTruthy();
    expect(out[0]!.data.dateCurrent).toBe(true);
  });

  it("★★ las VIÑETAS de las versiones absorbidas se reparentan, no se pierden", () => {
    const filas = [
      ...tresVersiones(),
      bullet("LI", "Reduje la latencia p95 un 38%."),
      bullet("PF", "Diseñé el servicio de inferencia en GCP."),
      bullet("CU", "Vendí el primer piloto a una farmacia."),
    ];
    const { filas: out } = consolidar(filas, true);
    const vinetas = out.filter((r) => r.kind === "bullet");
    expect(vinetas, "no puede desaparecer ni una viñeta").toHaveLength(3);
    for (const v of vinetas) expect(v.parentKey).toBe("LI");
  });

  it("★ una viñeta IDÉNTICA no se repite bajo la misma tarjeta, pero SE CUENTA", () => {
    // La diferencia entre «no se repitió» y «se tiró» es este contador.
    const filas = [
      ...tresVersiones().slice(0, 2),
      bullet("LI", "Reduje la latencia p95 un 38%."),
      bullet("PF", "Reduje la latencia p95 un 38%."),
    ];
    const { filas: out } = consolidar(filas, true);
    expect(out.filter((r) => r.kind === "bullet")).toHaveLength(1);
    expect(origenes(out[0]!)[1]!.vinetasRepetidas).toBe(1);
  });

  it("★ dos PROYECTOS con el mismo nombre también se presentan fusionados", () => {
    const filas = [
      proyecto("AeroFit", "Simulador de entrenamiento aeróbico con modelos de difusión."),
      proyecto("AeroFit", "Proyecto de título: predicción de rendimiento aeróbico."),
    ];
    const { filas: out, fusionadas } = consolidar(filas);
    expect(fusionadas).toBe(1);
    expect(out).toHaveLength(1);
    expect(origenes(out[0]!)).toHaveLength(2);
    expect(out[0]!.duplicate!.signals).toContain("mismo-nombre");
  });

  it("★ `_consolidado` dice cuántas versiones hay detrás de la tarjeta", () => {
    const { filas: out } = consolidar(tresVersiones(), true);
    expect(out[0]!.data._consolidado).toBe(3);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LO QUE NO SE PUEDE FUSIONAR (la mitad importante del fichero)
// ════════════════════════════════════════════════════════════════════════════
describe("☠☠ lo que NO se toca: fusionar de más borra media carrera", () => {
  it("☠☠ una PROMOCIÓN INTERNA no es un duplicado", () => {
    // Misma empresa, cargos claramente distintos. Fusionarlos le borraría al
    // usuario un ascenso — y el ascenso es justo lo que quiere contar.
    const filas = [
      work("Backend Developer", "Altiplano Pagos SpA", "mar 2020 – dic 2021", "Servicio de conciliación en Go."),
      work("Tech Lead", "Altiplano Pagos SpA", "ene 2022 – hoy", "Lidero un equipo de seis personas."),
    ];
    const { filas: out, fusionadas } = consolidar(filas);
    expect(fusionadas).toBe(0);
    expect(out).toHaveLength(2);
  });

  it("☠☠ CANDADO 3 · contenido casi idéntico pero TÍTULOS que se contradicen: se marca, no se fusiona", () => {
    // «Software Engineering Intern» y «Práctica profesional» describen lo mismo,
    // y el detector los da por «alta» por contenido. Aun así NO se fusionan: si
    // los cargos se contradicen, presentarlos como uno esconde la discrepancia
    // que el usuario tiene que resolver. Es el mismo guardarraíl que usa la
    // fusión entre ventanas de llm.ts.
    const filas = [
      work("Software Engineering Intern", "Tesseract Softwares SpA", "ene 2021 – may 2021", "Automaticé el pipeline de QA en Python y Django."),
      work("Práctica profesional", "Tesseract Softwares", "2021", "Automaticé el pipeline de QA con Python y Django."),
    ];
    const { filas: out, fusionadas } = consolidar(filas);
    expect(fusionadas, "títulos claramente distintos no se fusionan").toBe(0);
    expect(out).toHaveLength(2);
  });

  it("☠☠ el MISMO cargo en DOS empresas distintas son dos trabajos", () => {
    const filas = [
      work("Ingeniero de software", "Altiplano Pagos SpA", "2020 – 2021", "Conciliación de pagos en Go."),
      work("Ingeniero de software", "Tesseract Softwares", "2022 – 2023", "Pipeline de QA en Python."),
    ];
    const { filas: out, fusionadas } = consolidar(filas);
    expect(fusionadas).toBe(0);
    expect(out).toHaveLength(2);
  });

  it("☠☠ misma empresa pero fechas que NO se solapan: no se fusiona", () => {
    // Volver a la misma empresa años después son dos entradas del CV.
    const filas = [
      work("Desarrollador", "Tesseract Softwares", "2015 – 2016", "Mantención del ERP interno."),
      work("Desarrollador", "Tesseract Softwares", "2023 – 2024", "Migración del ERP a la nube."),
    ];
    const { filas: out, fusionadas } = consolidar(filas);
    expect(fusionadas).toBe(0);
    expect(out).toHaveLength(2);
  });

  it("☠☠ CANDADO 2 · venir del mismo documento (n3) NO basta para fusionar", () => {
    // «Misma empresa, a una le falta la fecha» es sospecha MEDIA. El nivel n3
    // (mismo origen) la subiría a «alta» y, en una ingesta multi-fuente donde
    // todos los items comparten etiqueta, eso fusionaría por haber llegado
    // juntos, no por ser lo mismo. Para MARCAR es legítimo; para FUSIONAR no.
    const filas = [
      work("Analista", "Consultora Andina", "", "Informes mensuales de gestión para el directorio.", { fuente: "dossier.md" }),
      work("Analista de datos", "Consultora Andina", "", "Modelos predictivos de rotación de clientes.", { fuente: "dossier.md" }),
    ];
    const { filas: out, fusionadas } = consolidar(filas, true);
    expect(fusionadas, "n3 no puede disparar una fusión él solo").toBe(0);
    expect(out).toHaveLength(2);
  });

  it("☠☠ CANDADO 4 · dos DOCUMENTOS distintos NO se fusionan entre sí (una fuente se quedaría a cero)", () => {
    // Si el rol de la captura 3 se absorbiera dentro del de la captura 1, la
    // captura 3 pasaría a tener CERO items y la ficha de fuentes la pintaría como
    // leída y vacía. Esa es LA mentira que este producto no puede contar. Entre
    // documentos se MARCA, no se fusiona.
    const filas = [
      work("Founder & AI Engineer", "PharmIQ SpA", "abr 2024 – actualidad", TXT_LI, { fuente: "captura-1.png" }),
      work("Founder & AI Engineer", "PharmIQ", "abr 2024 – actualidad", TXT_PF, { fuente: "captura-3.png" }),
    ];
    const { filas: out, fusionadas } = consolidar(filas, true);
    expect(fusionadas, "entre documentos no se fusiona").toBe(0);
    expect(out).toHaveLength(2);
    // y cada fuente conserva su item: el recuento por etiqueta no se vacía
    expect(new Set(out.map((r) => r.sourceLabel))).toEqual(new Set(["captura-1.png", "captura-3.png"]));
  });

  it("☠ el candado 4 aguanta en CADENA: A y C del mismo documento, B de otro", () => {
    // La igualdad de etiqueta es transitiva, así que un grupo no puede colarse
    // por el medio: B nunca entra, y A+C se fusionan entre ellos.
    const filas = [
      work("Founder & AI Engineer", "PharmIQ SpA", "abr 2024 – actualidad", TXT_LI, { fuente: "dossier.md", key: "A" }),
      work("Founder & AI Engineer", "PharmIQ", "abr 2024 – actualidad", TXT_PF, { fuente: "captura.png", key: "B" }),
      work("Founder AI Engineer", "PharmIQ", "abr 2024", TXT_CU, { fuente: "dossier.md", key: "C" }),
    ];
    const { filas: out, fusionadas } = consolidar(filas, true);
    expect(fusionadas).toBe(1);
    expect(out.map((r) => r.key)).toEqual(["A", "B"]);
    expect(origenes(out[0]!)).toHaveLength(2);
    expect(out[1]!.data._origenes, "el de la otra fuente sigue entero y solo").toBeUndefined();
  });

  it("☠ dos GRUPOS DE APTITUDES con el mismo nombre se dejan como están (no es esta operación)", () => {
    // Fusionar aquí exige UNIR listas; con «gana el primer valor no vacío» se
    // perdería media lista. Es otra operación, con otro riesgo, y no está hecha.
    const skill = (group: string, items: string): StagedRow => ({
      key: k("skill"), kind: "skill", data: { group, items },
      lang: "es", origin: "extracted", sourceLabel: "texto pegado",
      evidenceSnippet: items, evidenceLevel: "verified", evidenceVerified: true,
    });
    const filas = [skill("Lenguajes", "Go, Python, SQL"), skill("Lenguajes", "Dockerfile")];
    const { filas: out, fusionadas } = consolidar(filas);
    expect(fusionadas).toBe(0);
    expect(out).toHaveLength(2);
  });

  it("☠ sin duplicados, la lista sale INTACTA: misma referencia, mismo orden", () => {
    const filas = [
      work("Backend Developer", "Altiplano Pagos", "2020 – 2021", "Conciliación en Go."),
      work("Data Engineer", "Tesseract Softwares", "2022 – 2023", "Pipeline de datos en Airflow."),
      proyecto("Corpus", "Sistema de registro de carrera."),
    ];
    const r = consolidar(filas);
    expect(r.fusionadas).toBe(0);
    expect(r.filas).toBe(filas); // sin copias inútiles: no pasó nada
  });

  it("☠ una lista vacía o sin items consolidables no revienta", () => {
    expect(consolidar([]).filas).toEqual([]);
    const soloBasics: StagedRow[] = [{
      key: k("basics"), kind: "basics", data: { name: "Diego" },
      lang: "es", origin: "extracted", sourceLabel: "texto pegado",
      evidenceSnippet: null, evidenceLevel: "none", evidenceVerified: false,
    }];
    expect(consolidar(soloBasics).filas).toHaveLength(1);
  });

  it("☠ un rol y un proyecto NUNCA se fusionan entre sí, por parecidos que sean", () => {
    const filas = [
      work("AeroFit", "Universidad Andrés Bello", "2023", "Simulador de entrenamiento aeróbico con modelos de difusión."),
      proyecto("AeroFit", "Simulador de entrenamiento aeróbico con modelos de difusión."),
    ];
    const { filas: out, fusionadas } = consolidar(filas);
    expect(fusionadas).toBe(0);
    expect(out).toHaveLength(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// NADA SE DESCARTA · la invariante del producto, comprobada sobre la fusión
// ════════════════════════════════════════════════════════════════════════════
describe("★★ nada se descarta: todo lo absorbido sigue siendo recuperable", () => {
  it("★★ ninguna redacción, fecha ni cita desaparece del staging", () => {
    const filas = tresVersiones();
    const antes = filas.map((f) => ({ t: f.data.title, c: f.data.company, d: f.data.dates, e: f.evidenceSnippet }));
    const { filas: out } = consolidar(filas, true);

    const o = origenes(out[0]!);
    for (const v of antes) {
      const hay = o.find((x) => x.titulo === v.t && x.empresa === v.c && x.fechas === v.d && x.evidencia === v.e);
      expect(hay, `se perdió la versión «${String(v.t)}»`).toBeTruthy();
    }
  });

  it("★★ el recuento de items BAJA exactamente lo fusionado, ni uno más", () => {
    const filas = [
      ...tresVersiones(),
      bullet("LI", "Vendí el primer piloto a una farmacia."),
      bullet("PF", "Levanté la infraestructura en GCP."),
    ];
    const { filas: out, fusionadas } = consolidar(filas, true);
    expect(fusionadas).toBe(2);
    expect(out).toHaveLength(filas.length - 2); // se van DOS filas: los roles absorbidos
  });

  it("★★ la tarjeta fusionada nunca se queda sin cita si alguna versión la tenía", () => {
    const sinCita = work("Founder & AI Engineer", "PharmIQ SpA", "abr 2024 – actualidad", "");
    sinCita.evidenceSnippet = null;
    sinCita.evidenceLevel = "none";
    sinCita.evidenceVerified = false;
    // la primera no tiene cita, así que la identidad la sostienen empresa+fechas (n1)
    const conCita = work("Founder & AI Engineer", "PharmIQ", "abr 2024 – actualidad", TXT_PF);
    const { filas: out, fusionadas } = consolidar([sinCita, conCita]);
    expect(fusionadas).toBe(1);
    expect(out[0]!.evidenceSnippet).toBe(TXT_PF);
    expect(out[0]!.evidenceVerified).toBe(true);
  });

  it("★ es DETERMINISTA: consolidar dos veces la misma entrada da lo mismo", () => {
    const a = consolidar(tresVersiones(), true);
    const b = consolidar(tresVersiones(), true);
    expect(JSON.stringify(a.filas.map((r) => r.data))).toBe(JSON.stringify(b.filas.map((r) => r.data)));
    expect(a.fusionadas).toBe(b.fusionadas);
  });

  it("★ la tarjeta superviviente es la PRIMERA del staging (el candidato a canónico)", () => {
    const { filas: out } = consolidar(tresVersiones(), true);
    expect(out[0]!.key).toBe("LI");
    expect(out[0]!.data.title).toBe("Founder & AI Engineer");
  });

  it("★★ los metadatos de la fusión empiezan por `_`: no viajan al master", () => {
    // `persistImport` limpia las claves con `_` al promover. Si `_origenes` no lo
    // llevara, la procedencia de staging acabaría dentro del CV del usuario.
    const { filas: out } = consolidar(tresVersiones(), true);
    for (const clave of Object.keys(out[0]!.data)) {
      if (["_origenes", "_consolidado"].includes(clave)) expect(clave.startsWith("_")).toBe(true);
    }
    expect(out[0]!.data._origenes).toBeTruthy();
    expect(out[0]!.data._consolidado).toBe(3);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL CABLEADO · que la consolidación esté ENCHUFADA a la ingesta de verdad
// ════════════════════════════════════════════════════════════════════════════
describe("★★ runImport consolida ANTES de escribir en staging", () => {
  /* El dossier cuenta el mismo empleo tres veces, con sus marcas [LI]/[PF]/[CU].
     El extractor falso devuelve lo que devolvería el real: tres roles. */
  const DOSSIER =
    "# 4 · EXPERIENCIA PROFESIONAL\n\n" +
    "## 4.1 Founder & AI Engineer — PharmIQ\n" +
    `[LI] ${TXT_LI}\n[PF] ${TXT_PF}\n[CU] ${TXT_CU}\n`;

  const tresRoles: Extractor = async () => ({
    basics: { name: "", label: "", email: "", phone: "", location: "", links: [], summary: "", summaryEvidence: "" },
    work: [
      { title: "Founder & AI Engineer", company: "PharmIQ SpA", location: "", dates: "abr 2024 – actualidad", evidence: TXT_LI, bullets: [{ text: "Bajé la latencia p95 un 38%.", evidence: TXT_LI }] },
      { title: "Founder y AI Engineer", company: "PharmIQ", location: "", dates: "2024 – hoy", evidence: TXT_PF, bullets: [{ text: "Diseñé el servicio de inferencia en GCP.", evidence: TXT_PF }] },
      { title: "Founder AI Engineer", company: "PharmIQ", location: "", dates: "abr 2024", evidence: TXT_CU, bullets: [] },
    ],
    education: [], skills: [], projects: [],
  });

  const deps: ImportDeps = { extract: tresRoles };

  it("★★ los tres roles llegan al staging como UNO, con sus tres orígenes", async () => {
    const r = await runImport({ pastedText: DOSSIER }, deps);
    const roles = r.staged.filter((s) => s.kind === "work");
    expect(roles, "el dossier cuenta un empleo, no tres").toHaveLength(1);
    expect((roles[0]!.data._origenes as OrigenFusionado[])).toHaveLength(3);
    expect(roles[0]!.duplicate!.reason).toContain("ya fusionados");
  });

  it("★★ las viñetas de los tres cuelgan del rol superviviente", async () => {
    const r = await runImport({ pastedText: DOSSIER }, deps);
    const rol = r.staged.find((s) => s.kind === "work")!;
    const vinetas = r.staged.filter((s) => s.kind === "bullet");
    expect(vinetas).toHaveLength(2);
    for (const v of vinetas) expect(v.parentKey).toBe(rol.key);
  });

  it("★★ `counts.total` cuadra con las filas que de verdad salen", async () => {
    // Un recuento que no cuadra con lo insertado es un número sin fuente.
    const r = await runImport({ pastedText: DOSSIER }, deps);
    expect(r.counts.total).toBe(r.staged.length);
  });

  it("★ y los TRAMOS de cada documento viajan al extractor", async () => {
    // Sin esto, el reparto por fuente no se aplicaría nunca en producción por
    // mucho que `repartirPorFuente` exista.
    let vistos: readonly Fuente[] | undefined;
    const espia: Extractor = async (_raw, fuentes) => {
      vistos = fuentes;
      return { basics: { name: "", label: "", email: "", phone: "", location: "", links: [], summary: "", summaryEvidence: "" }, work: [], education: [], skills: [], projects: [] };
    };
    const r = await runImport(
      { pastedText: "Texto pegado del usuario, suficientemente largo.", files: [{ label: "captura.png", text: "Experiencia\nBackend Developer" }] },
      { extract: espia },
    );
    expect(vistos, "el pipeline tiene que pasar los tramos").toBeTruthy();
    expect(vistos!.map((f) => f.etiqueta)).toEqual(["texto pegado", "captura.png"]);
    // y TESELAN el raw_text: primer tramo en 0, último acabando en el final
    expect(vistos![0]!.inicio).toBe(0);
    expect(vistos!.at(-1)!.fin).toBe(r.rawText.length);
    for (let i = 1; i < vistos!.length; i++) expect(vistos![i]!.inicio).toBe(vistos![i - 1]!.fin);
  });
});
