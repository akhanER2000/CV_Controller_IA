/* ============================================================================
   ADAPTAR EL CV A UNA OFERTA (bloque C) · el motor puro, atacado por sus candados.

   Igual disciplina que ajuste.test.ts / verify.test.ts: se inyecta un LLM FALSO que
   devuelve planes —incluidos planes HOSTILES— y se comprueba que:

     · un requisito sin cita real en el aviso NO llega a los grupos (GAP inventado),
     · la cobertura HAVE/ADD/GAP es la que dicta el CÓDIGO, no el modelo,
     · una reformulación que mete una cifra o una tecnología nueva NO se ofrece,
     · el resumen que inventa se descarta,
     · la selección solo contiene ids que existen de verdad.

   El método es matar MUTANTES: cada test inyecta la mentira que un modelo real haría
   y comprueba que muere en el candado, con su motivo en `descartados` (depurable).
   Entorno node, sin React, sin red: todo es puro.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import {
  construirTailor,
  itemTailorDe,
  terminoCubierto,
  verificarReformulacion,
  parseJobPostingJsonLd,
  type ItemTailor,
  type OfertaPlan,
  type OfertaLLM,
} from "../src/lib/cv/tailor";

// ── Utilidades para armar el escenario ───────────────────────────────────────
const item = (
  id: string,
  kind: string,
  text: string,
  enVariante: boolean,
): ItemTailor =>
  itemTailorDe({ id, item_id: enVariante ? `m-${id}` : id, kind, data: { text }, enVariante });

/** LLM falso: devuelve el plan que le pasemos, con huecos por defecto. */
const fakeLLM =
  (plan: Partial<OfertaPlan>): OfertaLLM =>
  async () => ({
    titulo_objetivo: "",
    requisitos: [],
    seleccion: [],
    resumen: "",
    reformulaciones: [],
    notas: "",
    ...plan,
  });

const OFERTA =
  "Buscamos Backend Engineer con experiencia con Kubernetes, Python y GraphQL. " +
  "Se valorará Terraform. Imprescindible trabajo en equipo.";

describe("tailor · terminoCubierto (cobertura determinista)", () => {
  it("cubre por frase y por token completo", () => {
    expect(terminoCubierto("Kubernetes", "Orquesté servicios en Kubernetes")).toBe(true);
    expect(terminoCubierto("REST API", "Diseñé una REST API para pagos")).toBe(true);
  });

  it("NO confunde un token con una subcadena (java ≠ javascript)", () => {
    // El fallo silencioso más probable: usar includes() de subcadena. «java» quedaría
    // «cubierto» por cualquier viñeta con «javascript», y el usuario creería tenerlo.
    expect(terminoCubierto("Java", "Front en JavaScript y React")).toBe(false);
    expect(terminoCubierto("Java", "Servicios en Java 17")).toBe(true);
  });

  it("aguanta el plural (apis ~ api) por los dos lados", () => {
    expect(terminoCubierto("APIs", "Mantuve la API de pagos")).toBe(true);
    expect(terminoCubierto("API", "Integré varias APIs externas")).toBe(true);
  });

  it("un término de puro relleno (años, experiencia) no cubre por sí solo", () => {
    // «3 años de experiencia» no debe darse por cubierto porque una viñeta diga «años».
    expect(terminoCubierto("experiencia", "Tres años en el equipo")).toBe(false);
    expect(terminoCubierto("años", "Mantuve el sistema tres años")).toBe(false);
  });

  it("exige TODOS los tokens significativos (no basta uno)", () => {
    // «Apache Kafka» no lo cubre una viñeta que solo diga «Apache».
    expect(terminoCubierto("Apache Kafka", "Configuré un servidor Apache")).toBe(false);
    expect(terminoCubierto("Apache Kafka", "Event streaming con Apache Kafka")).toBe(true);
  });
});

describe("tailor · los tres grupos salen de la cobertura, no del modelo", () => {
  const items = [
    item("v1", "bullet", "Orquesté microservicios en Kubernetes", true),
    item("m2", "bullet", "Desarrollé scripts de datos en Python", false),
  ];
  const llm = fakeLLM({
    titulo_objetivo: "Backend Engineer",
    requisitos: [
      { termino: "Kubernetes", evidencia: "experiencia con Kubernetes" },
      { termino: "Python", evidencia: "Python" },
      { termino: "GraphQL", evidencia: "GraphQL" },
    ],
  });

  it("HAVE / ADD / GAP se reparten por lo que cubre cada item", async () => {
    const r = await construirTailor({ offerText: OFERTA, items }, { llm });
    expect(r.yaEnVariante.map((x) => x.id)).toEqual(["v1"]);
    expect(r.yaEnVariante[0]!.cubre).toEqual(["Kubernetes"]);
    expect(r.enMasterNoEnVariante.map((x) => x.id)).toEqual(["m2"]);
    expect(r.enMasterNoEnVariante[0]!.cubre).toEqual(["Python"]);
    expect(r.faltan.map((x) => x.termino)).toEqual(["GraphQL"]);
  });

  it("el GAP conserva la CITA del aviso (procedencia de por qué falta)", async () => {
    const r = await construirTailor({ offerText: OFERTA, items }, { llm });
    expect(r.faltan[0]!.evidencia).toBe("GraphQL");
  });

  it("si el mismo requisito lo cubre la variante Y el master, gana HAVE (no se ofrece añadir)", async () => {
    const items2 = [
      item("v1", "bullet", "Orquesté servicios en Kubernetes", true),
      item("m2", "bullet", "También toqué Kubernetes en otro rol", false),
    ];
    const llm2 = fakeLLM({ requisitos: [{ termino: "Kubernetes", evidencia: "experiencia con Kubernetes" }] });
    const r = await construirTailor({ offerText: OFERTA, items: items2 }, { llm: llm2 });
    expect(r.yaEnVariante.map((x) => x.id)).toEqual(["v1"]);
    expect(r.enMasterNoEnVariante).toEqual([]);
  });
});

describe("tailor · un requisito sin cita real en el aviso no puede inventar un GAP", () => {
  const items = [item("v1", "bullet", "Backend en Go", true)];

  it("evidencia que NO está en el aviso → descartado, no llega a faltan", async () => {
    const llm = fakeLLM({
      requisitos: [{ termino: "Rust", evidencia: "imprescindible Rust en producción" }],
    });
    const r = await construirTailor({ offerText: OFERTA, items }, { llm });
    expect(r.faltan).toEqual([]);
    expect(r.descartados.some((d) => d.tipo === "requisito" && d.id === "Rust")).toBe(true);
  });

  it("término que no aparece en el aviso (aunque la cita sí) → descartado", async () => {
    // La cita existe en el aviso, pero el término no: el modelo lo sacó del aire.
    const llm = fakeLLM({
      requisitos: [{ termino: "Cobol", evidencia: "trabajo en equipo" }],
    });
    const r = await construirTailor({ offerText: OFERTA, items }, { llm });
    expect(r.faltan).toEqual([]);
    expect(r.descartados.some((d) => d.tipo === "requisito" && d.id === "Cobol")).toBe(true);
  });
});

describe("tailor · el candado de la reformulación (verify.ts)", () => {
  const original = "Fui responsable de mantener el pipeline de datos en Python";
  const items = [itemTailorDe({ id: "v1", item_id: "m1", kind: "bullet", data: { text: original }, enVariante: true })];

  it("una reformulación que preserva los hechos SÍ se ofrece", async () => {
    const llm = fakeLLM({
      reformulaciones: [{ id: "v1", propuesto: "Mantuve el pipeline de datos en Python", motivo: "más directo" }],
    });
    const r = await construirTailor({ offerText: OFERTA, items }, { llm });
    expect(r.reformulaciones.map((x) => x.id)).toEqual(["v1"]);
    expect(r.reformulaciones[0]!.propuesto).toBe("Mantuve el pipeline de datos en Python");
  });

  it("una reformulación que MENTE una cifra o una tecnología nueva NO se ofrece", async () => {
    // El mutante: alinear con la oferta metiendo Kubernetes y un 40% que no estaban.
    const llm = fakeLLM({
      reformulaciones: [
        { id: "v1", propuesto: "Mantuve el pipeline en Python y Kubernetes, mejorando un 40%", motivo: "alinea con la oferta" },
      ],
    });
    const r = await construirTailor({ offerText: OFERTA, items }, { llm });
    expect(r.reformulaciones).toEqual([]);
    const d = r.descartados.find((x) => x.tipo === "reformular");
    expect(d).toBeTruthy();
    expect(d!.nuevas!.entidades).toContain("kubernetes");
    expect(d!.nuevas!.cifras).toContain("40%");
  });

  it("el aviso NO autoriza hechos nuevos aunque los pida (Kubernetes está en la oferta)", async () => {
    // Kubernetes aparece en OFERTA, pero eso NO lo hace verdadero en ESTA viñeta.
    const llm = fakeLLM({
      reformulaciones: [{ id: "v1", propuesto: "Mantuve el pipeline en Python sobre Kubernetes", motivo: "x" }],
    });
    const r = await construirTailor({ offerText: OFERTA, items }, { llm });
    expect(r.reformulaciones).toEqual([]);
  });

  it("reformular un item que aún NO está en la variante se descarta con motivo", async () => {
    const soloMaster = [itemTailorDe({ id: "m9", item_id: "m9", kind: "bullet", data: { text: "algo en Go" }, enVariante: false })];
    const llm = fakeLLM({ reformulaciones: [{ id: "m9", propuesto: "Go, más corto", motivo: "x" }] });
    const r = await construirTailor({ offerText: OFERTA, items: soloMaster }, { llm });
    expect(r.reformulaciones).toEqual([]);
    expect(r.descartados.some((d) => d.tipo === "reformular" && /aún no está en la variante/.test(d.razon))).toBe(true);
  });

  it("una propuesta idéntica al original no es una reformulación", async () => {
    const llm = fakeLLM({ reformulaciones: [{ id: "v1", propuesto: original, motivo: "x" }] });
    const r = await construirTailor({ offerText: OFERTA, items }, { llm });
    expect(r.reformulaciones).toEqual([]);
  });
});

describe("tailor · verificarReformulacion (el mismo candado en el servidor)", () => {
  const original = "Reduje la latencia p99 a 180 ms en el servicio de pagos";
  it("acepta lo que preserva los hechos", () => {
    expect(verificarReformulacion(original, "Bajé la latencia p99 a 180 ms en pagos")).toEqual({ ok: true });
  });
  it("rechaza lo que inventa (y da el motivo)", () => {
    const v = verificarReformulacion(original, "Bajé la latencia p99 a 90 ms con Redis");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.razon).toMatch(/cifras|nombres|tecnolog/);
  });
  it("rechaza la vacía y la idéntica", () => {
    expect(verificarReformulacion(original, "  ").ok).toBe(false);
    expect(verificarReformulacion(original, original).ok).toBe(false);
  });
});

describe("tailor · el resumen pasa por preservesFacts", () => {
  const items = [item("v1", "bullet", "Backend en Python durante 2 años", true)];
  it("un resumen sin invención se conserva", async () => {
    const llm = fakeLLM({ resumen: "Backend en Python." });
    const r = await construirTailor({ offerText: OFERTA, items }, { llm });
    expect(r.resumen).toBe("Backend en Python.");
  });
  it("un resumen que inventa una cifra se descarta (queda null)", async () => {
    const llm = fakeLLM({ resumen: "Backend en Python con 10 años y AWS." });
    const r = await construirTailor({ offerText: OFERTA, items }, { llm });
    expect(r.resumen).toBeNull();
    expect(r.descartados.some((d) => d.tipo === "resumen")).toBe(true);
  });
});

describe("tailor · la selección para crear una variante nunca inventa ids", () => {
  const items = [
    itemTailorDe({ id: "b1", item_id: "b1", kind: "basics", data: { name: "Ana" }, enVariante: false }),
    itemTailorDe({ id: "s1", item_id: "s1", kind: "summary", data: { text: "Resumen" }, enVariante: false }),
    item("m2", "bullet", "Kubernetes", false),
    item("m3", "bullet", "Python", false),
  ];
  it("basics y summary van primero; los ids inexistentes se caen", async () => {
    const llm = fakeLLM({ seleccion: ["m3", "NO-EXISTE", "m2"] });
    const r = await construirTailor({ offerText: OFERTA, items }, { llm });
    expect(r.seleccion).toEqual(["b1", "s1", "m3", "m2"]);
    expect(r.descartados.some((d) => d.tipo === "seleccion" && d.id === "NO-EXISTE")).toBe(true);
  });
});

describe("tailor · parseJobPostingJsonLd (JSON-LD del aviso, PRIMERO)", () => {
  const html = `
    <html><head>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"JobPosting","title":"Backend Engineer",
       "hiringOrganization":{"@type":"Organization","name":"Altiplano"},
       "employmentType":"FULL_TIME",
       "skills":["Kubernetes","Python"],
       "description":"<p>Buscamos alguien con <b>experiencia</b> en Go.</p><ul><li>REST</li></ul>"}
    </script>
    <script type="application/ld+json">
      {"@type":"WebSite","name":"portal"}
    </script>
    </head><body>ruido</body></html>`;

  it("extrae puesto, empresa, skills y descripción sin el HTML embebido", () => {
    const out = parseJobPostingJsonLd(html);
    expect(out).toContain("Puesto: Backend Engineer");
    expect(out).toContain("Empresa: Altiplano");
    expect(out).toContain("Kubernetes, Python");
    expect(out).toContain("experiencia");
    expect(out).not.toContain("<p>");
    expect(out).not.toContain("<b>");
  });

  it("ignora los nodos que no son JobPosting", () => {
    expect(parseJobPostingJsonLd(html)).not.toContain("portal");
  });

  it("lee dentro de @graph y no explota con JSON-LD malformado", () => {
    const graph = `<script type="application/ld+json">{"@graph":[{"@type":"JobPosting","title":"Data Eng"}]}</script>`;
    expect(parseJobPostingJsonLd(graph)).toContain("Puesto: Data Eng");
    const roto = `<script type="application/ld+json">{ esto no es json }</script>`;
    expect(parseJobPostingJsonLd(roto)).toBe("");
    expect(parseJobPostingJsonLd("")).toBe("");
  });
});
