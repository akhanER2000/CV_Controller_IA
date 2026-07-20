import { describe, it, expect } from "vitest";
import {
  construirAjuste,
  calcularFaltas,
  itemDeAjuste,
  textoDeItem,
  verificarAcortado,
  razonDelCandado,
  type AjusteItem,
  type AjustePlan,
  type AjusteLLM,
} from "../src/lib/cv/ajuste";
import { extractNumbers } from "../src/lib/verify";

/* ============================================================================
   «AJUSTAR A DOS PÁGINAS» — el bloque de más riesgo, auditado.

   Estos tests no comprueban que el motor "funcione". Comprueban las maneras
   concretas en que un botón como este arruina el CV de alguien:

     1. Acortando una viñeta hasta borrarle la cifra que la hacía valer.
     2. Cambiando 850 por 85 — que no es perder un dato, es mentir.
     3. Obedeciendo al modelo cuando inventa un id, o cuando manda quitar los
        datos de contacto.
     4. Colando una invención dentro del MOTIVO, que el usuario lee como si
        fuera un hecho comprobado.
     5. Aplicando algo. El motor NO aplica: propone.

   El LLM se inyecta (AjusteLLM), así que aquí no hay red ni clave: se le hace
   devolver basura A PROPÓSITO y se exige que el servidor no se la crea.
   ============================================================================ */

// ── Una variante real, con viñetas que llevan cifras ────────────────────────
const filas = [
  { id: "v-basics", item_id: "m-basics", kind: "basics", visible: true, sort_order: 0, parent_id: null,
    data: { name: "Diego Gatica", label: "Backend Developer" } },
  { id: "v-sum", item_id: "m-sum", kind: "summary", visible: true, sort_order: 1, parent_id: null,
    data: { text: "Ingeniero backend con foco en pagos, conciliación y confiabilidad del checkout." } },
  { id: "v-work", item_id: "m-work", kind: "work", visible: true, sort_order: 2, parent_id: null,
    data: { title: "Backend Developer", company: "Altiplano Pagos", dates: "2021 — 2024" } },
  // ★ Las tres viñetas con cifras: son las que el test persigue una por una.
  { id: "v-b1", item_id: "m-b1", kind: "bullet", visible: true, sort_order: 3, parent_id: "m-work",
    data: { text: "Reduje la latencia p99 de 850 ms a 180 ms migrando el pipeline a Kafka" } },
  { id: "v-b2", item_id: "m-b2", kind: "bullet", visible: true, sort_order: 4, parent_id: "m-work",
    data: { text: "Concilié 40.000 transacciones diarias con una tasa de error del 0,3 %" } },
  { id: "v-b3", item_id: "m-b3", kind: "bullet", visible: true, sort_order: 5, parent_id: "m-work",
    data: { text: "Fui responsable de la coordinación diaria del equipo y de sus rituales" } },
  { id: "v-work2", item_id: "m-work2", kind: "work", visible: true, sort_order: 6, parent_id: null,
    data: { title: "Practicante", company: "Tesseract", dates: "" } },
  { id: "v-sk", item_id: "m-sk", kind: "skill", visible: true, sort_order: 7, parent_id: null,
    data: { group: "Lenguajes", items: "Go, Kafka, Cobol" } },
  // Un item que NO es viñeta pero cuelga del mismo rol. El esquema lo permite
  // (parent_id es genérico) y es la trampa exacta del reordenado: si el motor
  // agrupara «todo lo que tiene padre», este proyecto entraría en la permutación
  // de las viñetas y el editor no sabría moverlo.
  { id: "v-pr", item_id: "m-pr", kind: "project", visible: true, sort_order: 8, parent_id: "m-work",
    data: { name: "Conciliador", description: "Servicio de conciliación diaria escrito en Go" } },
];

const items: AjusteItem[] = filas.map(itemDeAjuste);
const porId = (id: string) => items.find((i) => i.id === id)!;

/** Un llm falso: devuelve el plan dado, ignorando la entrada. */
const fakeLLM = (plan: Partial<AjustePlan>): AjusteLLM => async () => ({
  quitar: [], orden: [], acortar: [], notas: "", ...plan,
} as AjustePlan);

const base = { targetTitle: "Backend Engineer", items, paginas: 3, paginasObjetivo: 2, sobran: 14 };

/** Todas las cifras (valor+unidad) de un texto, como claves comparables. */
const cifras = (s: string) => extractNumbers(s).map((n) => `${n.value}${n.unit}`).sort();

// ============================================================================
describe("ajuste · CADA CIFRA del resultado sigue siendo la del original", () => {
  it("★ el test que pidió el usuario: se acortan tres viñetas con cifras y ninguna cifra cambia", async () => {
    // Acortados HONESTOS: se va el relleno, se quedan los hechos.
    const r = await construirAjuste(base, {
      llm: fakeLLM({
        acortar: [
          { id: "v-b1", propuesto: "Latencia p99: de 850 ms a 180 ms migrando el pipeline a Kafka", motivo: "sobra el verbo" },
          { id: "v-b2", propuesto: "40.000 transacciones diarias conciliadas, 0,3 % de error", motivo: "sobra el rodeo" },
          { id: "v-b3", propuesto: "Coordiné al equipo y sus rituales", motivo: "sobra «fui responsable de»" },
        ],
      }),
    });

    expect(r.acortar).toHaveLength(3);

    for (const p of r.acortar) {
      const original = porId(p.id).original;
      // ★ EL NÚCLEO: el conjunto de cifras del propuesto es EXACTAMENTE el del
      //   original. Ni una perdida, ni una nueva, ni una con otra unidad.
      expect(cifras(p.propuesto), `cifras alteradas en ${p.id}`).toEqual(cifras(original));
      // Y el original viaja en la propuesta, para poder revertir.
      expect(p.original).toBe(original);
      expect(p.propuesto.length).toBeLessThan(original.length);
      expect(p.ahorro).toBe(original.length - p.propuesto.length);
    }

    // Las cifras concretas, nombradas, por si alguien "optimiza" el helper.
    const b1 = r.acortar.find((p) => p.id === "v-b1")!;
    expect(b1.propuesto).toContain("850");
    expect(b1.propuesto).toContain("180");
    expect(b1.propuesto.toLowerCase()).toContain("kafka");
    const b2 = r.acortar.find((p) => p.id === "v-b2")!;
    expect(b2.propuesto).toContain("40.000");
    expect(b2.propuesto).toContain("0,3");

    // Nada se descartó: los tres eran honestos.
    expect(r.descartados.filter((d) => d.tipo === "acortar")).toEqual([]);
  });
});

// ============================================================================
describe("ajuste · el candado del acortado: la propuesta envenenada NO SE OFRECE", () => {
  it("★ 1 · un acortado que BORRA una cifra no se ofrece, y queda registrado por qué", async () => {
    const r = await construirAjuste(base, {
      llm: fakeLLM({
        // Impecable para preservesFacts (no inventa nada) y se come 850, 180 y Kafka.
        acortar: [{ id: "v-b1", propuesto: "Optimicé la latencia", motivo: "más breve" }],
      }),
    });

    // NO SE OFRECE. Ni con aviso, ni con chip: no está.
    expect(r.acortar).toEqual([]);

    // Y SÍ se registra, con el detalle para poder depurarlo.
    const d = r.descartados.find((x) => x.tipo === "acortar" && x.id === "v-b1");
    expect(d, "un descarte silencioso es indepurable").toBeTruthy();
    expect(d!.propuesto).toBe("Optimicé la latencia");
    expect(d!.perdidas!.cifras).toEqual(expect.arrayContaining(["850", "180"]));
    expect(d!.perdidas!.entidades).toContain("kafka");
    expect(d!.razon).toContain("se pierden cifras");
  });

  it("★ 2 · cambiar 850 por 85 es MENTIR, y se caza por los dos lados", async () => {
    const r = await construirAjuste(base, {
      llm: fakeLLM({
        acortar: [{ id: "v-b1", propuesto: "Latencia p99: de 85 ms a 18 ms con Kafka", motivo: "más breve" }],
      }),
    });

    expect(r.acortar).toEqual([]);
    const d = r.descartados.find((x) => x.tipo === "acortar" && x.id === "v-b1")!;
    expect(d.perdidas!.cifras).toEqual(expect.arrayContaining(["850", "180"])); // desaparecieron
    expect(d.nuevas!.cifras).toEqual(expect.arrayContaining(["85", "18"])); // salieron de la nada
    expect(d.razon).toContain("aparecen cifras que no estaban");
  });

  it("3 · cambiar la UNIDAD conservando el número tampoco pasa (0,3 % ≠ 0,3 x)", async () => {
    const r = await construirAjuste(base, {
      llm: fakeLLM({
        acortar: [{ id: "v-b2", propuesto: "40.000 transacciones diarias, 0,3x de error", motivo: "" }],
      }),
    });
    expect(r.acortar).toEqual([]);
    expect(r.descartados.some((d) => d.id === "v-b2" && d.tipo === "acortar")).toBe(true);
  });

  it("4 · una propuesta MÁS LARGA no entra por la puerta del acortado", async () => {
    const original = porId("v-b3").original;
    const r = await construirAjuste(base, {
      llm: fakeLLM({ acortar: [{ id: "v-b3", propuesto: `${original} y además documenté todo`, motivo: "" }] }),
    });
    expect(r.acortar).toEqual([]);
    expect(r.descartados.find((d) => d.id === "v-b3")!.razon).toContain("no es más corta");
  });

  it("5 · una propuesta buena y una envenenada en el MISMO plan: entra la buena, se cae la mala", async () => {
    // El fallo cómodo sería tratarlas en bloque (todo o nada). Se decide UNA A UNA.
    const r = await construirAjuste(base, {
      llm: fakeLLM({
        acortar: [
          { id: "v-b1", propuesto: "Optimicé la latencia", motivo: "" }, // envenenada
          { id: "v-b3", propuesto: "Coordiné al equipo y sus rituales", motivo: "" }, // honesta
        ],
      }),
    });
    expect(r.acortar.map((p) => p.id)).toEqual(["v-b3"]);
    expect(r.descartados.map((d) => d.id)).toContain("v-b1");
  });

  it("6 · el candado vuelve a correr al ACEPTAR, no solo al proponer", () => {
    // Entre la propuesta y el clic el texto pasa por el cliente. Un cliente es
    // cualquiera: el servidor no puede fiarse del texto que le devuelven.
    const original = porId("v-b1").original;
    expect(verificarAcortado(original, "Latencia p99: de 850 ms a 180 ms con Kafka").ok).toBe(true);
    const malo = verificarAcortado(original, "Optimicé la latencia");
    expect(malo.ok).toBe(false);
    expect(malo.ok === false && malo.razon).toContain("se pierden cifras");
    // El caso que un atacante probaría: mandar cualquier cosa corta.
    expect(verificarAcortado(original, "").ok).toBe(false);
    expect(verificarAcortado(original, "Migré a Kubernetes").ok).toBe(false);
  });
});

// ============================================================================
describe("ajuste · no se confía en el modelo (ids, kinds, motivos)", () => {
  it("un id que no existe en la variante se cae — de quitar, de acortar y del orden", async () => {
    const r = await construirAjuste(base, {
      llm: fakeLLM({
        quitar: [{ id: "fantasma", motivo: "no sirve" }],
        orden: ["fantasma", "v-b2"],
        acortar: [{ id: "fantasma", propuesto: "corto", motivo: "" }],
      }),
    });
    expect(r.quitar).toEqual([]);
    expect(r.acortar).toEqual([]);
    expect(r.reordenar.every((p) => p.id !== "fantasma")).toBe(true);
    expect(r.descartados.filter((d) => d.id === "fantasma").length).toBeGreaterThanOrEqual(3);
  });

  it("★ quitar los datos de contacto se rechaza: un CV sin nombre no es un CV corto, es uno roto", async () => {
    const r = await construirAjuste(base, {
      llm: fakeLLM({ quitar: [{ id: "v-basics", motivo: "ocupa espacio" }] }),
    });
    expect(r.quitar).toEqual([]);
    expect(r.descartados.find((d) => d.id === "v-basics")!.razon).toContain("contacto");
  });

  it("el texto que se enseña sale del ITEM REAL, nunca del modelo", async () => {
    const r = await construirAjuste(base, {
      llm: fakeLLM({ quitar: [{ id: "v-b3", motivo: "poco relevante para el rol" }] }),
    });
    expect(r.quitar[0]!.texto).toBe(porId("v-b3").texto);
    expect(r.quitar[0]!.motivo).toBe("poco relevante para el rol");
  });

  it("★ un MOTIVO con una cifra inventada se cae: el usuario lo lee como si fuera un hecho", async () => {
    const r = await construirAjuste(base, {
      llm: fakeLLM({ quitar: [{ id: "v-b3", motivo: "solo aporta un 12 % de relevancia para el rol" }] }),
    });
    // La propuesta sobrevive (el id era válido); el motivo inventado, no.
    expect(r.quitar).toHaveLength(1);
    expect(r.quitar[0]!.motivo).toBe("");
    expect(r.descartados.some((d) => d.tipo === "motivo" && d.nuevas!.cifras.includes("12 %"))).toBe(true);
  });

  it("un acortado sobre un item SIN campo de texto (un rol, una aptitud) se descarta", async () => {
    const r = await construirAjuste(base, {
      llm: fakeLLM({ acortar: [{ id: "v-work", propuesto: "Backend Dev", motivo: "" }] }),
    });
    expect(r.acortar).toEqual([]);
    expect(r.descartados.find((d) => d.id === "v-work")!.razon).toContain("acortable");
  });

  it("ids repetidos no duplican la propuesta", async () => {
    const r = await construirAjuste(base, {
      llm: fakeLLM({
        quitar: [{ id: "v-b3", motivo: "" }, { id: "v-b3", motivo: "" }],
        acortar: [
          { id: "v-b3", propuesto: "Coordiné al equipo y sus rituales", motivo: "" },
          { id: "v-b3", propuesto: "Coordiné al equipo", motivo: "" },
        ],
      }),
    });
    expect(r.quitar).toHaveLength(1);
    expect(r.acortar).toHaveLength(1);
  });
});

// ============================================================================
describe("ajuste · reordenar solo lo que el editor sabe mover", () => {
  it("sube una viñeta dentro de su rol y dice desde dónde y hasta dónde", async () => {
    // Orden actual: v-b1, v-b2, v-b3. Propuesto: v-b3 primero.
    const r = await construirAjuste(base, { llm: fakeLLM({ orden: ["v-b3"] }) });
    const b3 = r.reordenar.find((p) => p.id === "v-b3")!;
    expect(b3.desde).toBe(2);
    expect(b3.hasta).toBe(0);
    expect(b3.parentId).toBe("m-work");
    // Los no mencionados no se barren: bajan un puesto y conservan su orden relativo.
    expect(r.reordenar.find((p) => p.id === "v-b1")!.hasta).toBe(1);
    expect(r.reordenar.find((p) => p.id === "v-b2")!.hasta).toBe(2);
  });

  it("si el orden propuesto es el que ya hay, no se propone ningún movimiento", async () => {
    const r = await construirAjuste(base, { llm: fakeLLM({ orden: ["v-b1", "v-b2", "v-b3"] }) });
    expect(r.reordenar).toEqual([]);
  });

  it("★ un item que cuelga del rol pero NO es viñeta no entra en la permutación", async () => {
    // Agrupar por «tiene padre» en vez de por «es viñeta» metería este proyecto
    // entre las viñetas: le cambiaría el sort_order a un item que el editor solo
    // sabe mover como viñeta, y el orden del documento se movería solo.
    const r = await construirAjuste(base, { llm: fakeLLM({ orden: ["v-pr", "v-b3"] }) });
    expect(r.reordenar.map((p) => p.id)).not.toContain("v-pr");
    expect(r.reordenar.every((p) => p.kind === "bullet")).toBe(true);
    // Y las viñetas de ese rol siguen siendo tres, no cuatro.
    expect(r.reordenar.filter((p) => p.parentId === "m-work").length).toBeLessThanOrEqual(3);
    expect(r.descartados.some((d) => d.tipo === "reordenar" && d.id === "v-pr")).toBe(true);
  });

  it("★ mover un ROL entero no se ofrece: el editor no sabe hacerlo y un botón muerto es una mentira", async () => {
    const r = await construirAjuste(base, { llm: fakeLLM({ orden: ["v-work2", "v-work"] }) });
    expect(r.reordenar.every((p) => p.kind === "bullet")).toBe(true);
    expect(r.descartados.find((d) => d.tipo === "reordenar" && d.id === "v-work2")!.razon).toContain("viñetas");
  });
});

// ============================================================================
describe("ajuste · «qué falta» se COMPRUEBA, no se le pregunta al modelo", () => {
  it("caza la viñeta sin cifra, el rol sin fecha y la aptitud que nada respalda", () => {
    const f = calcularFaltas(items);
    const de = (tipo: string) => f.filter((x) => x.tipo === tipo).map((x) => x.id);

    expect(de("sin-cifra")).toEqual(["v-b3"]); // b1 y b2 sí llevan cifras
    expect(de("sin-fecha")).toEqual(["v-work2"]); // v-work sí trae 2021 — 2024
    expect(de("sin-respaldo")).toEqual(["v-sk"]);

    // Y NOMBRA lo que no está respaldado: Cobol no aparece en ninguna viñeta;
    // Kafka y Go, en cambio, sí (Go dentro de "Altiplano Pagos"… no: como token).
    const sk = f.find((x) => x.tipo === "sin-respaldo")!;
    expect(sk.detalle).toContain("Cobol");
    expect(sk.detalle).not.toContain("Kafka");
  });

  it("un item OCULTO no genera falta: no sale en el documento", () => {
    const ocultos = items.map((i) => (i.id === "v-b3" ? { ...i, visible: false } : i));
    expect(calcularFaltas(ocultos).some((x) => x.id === "v-b3")).toBe(false);
  });

  it("no se inventa ningún número: la falta describe el hecho, no lo puntúa", () => {
    for (const f of calcularFaltas(items)) {
      expect(f.detalle).not.toMatch(/\b\d+\s*%/); // ni un "85 % de completitud"
    }
  });
});

// ============================================================================
describe("ajuste · la medida y la forma del resultado", () => {
  it("★ las líneas que sobran son las MEDIDAS: pasan tal cual, sin score ni redondeo", async () => {
    const r = await construirAjuste({ ...base, sobran: 14, paginas: 3 }, { llm: fakeLLM({}) });
    expect(r.sobran).toBe(14);
    expect(r.paginas).toBe(3);
    expect(r.paginasObjetivo).toBe(2);
    // Y no existe ninguna puntuación: si alguien añade un `score`, esto se rompe.
    expect(Object.keys(r)).not.toContain("score");
    expect(Object.keys(r)).not.toContain("ajuste");
  });

  it("un negativo (sobra sitio) se conserva: «te caben 9 líneas más» es otro consejo", async () => {
    const r = await construirAjuste({ ...base, sobran: -9, paginas: 2 }, { llm: fakeLLM({}) });
    expect(r.sobran).toBe(-9);
  });

  it("el motor NO aplica nada: los items de entrada salen intactos", async () => {
    const antes = JSON.stringify(items);
    await construirAjuste(base, {
      llm: fakeLLM({
        quitar: [{ id: "v-b3", motivo: "" }],
        orden: ["v-b3", "v-b1"],
        acortar: [{ id: "v-b3", propuesto: "Coordiné al equipo y sus rituales", motivo: "" }],
      }),
    });
    expect(JSON.stringify(items), "una propuesta que muta la variante ya la aplicó").toBe(antes);
  });

  it("un plan vacío da una propuesta vacía, no una excepción", async () => {
    const r = await construirAjuste(base, { llm: fakeLLM({}) });
    expect(r.quitar).toEqual([]);
    expect(r.acortar).toEqual([]);
    expect(r.reordenar).toEqual([]);
    expect(r.falta.length).toBeGreaterThan(0); // «qué falta» no depende del modelo
  });

  it("un plan con campos ausentes/nulos (modelo mal portado) no revienta", async () => {
    const llm: AjusteLLM = async () => ({} as AjustePlan);
    const r = await construirAjuste(base, { llm });
    expect(r.quitar).toEqual([]);
    expect(r.acortar).toEqual([]);
    expect(r.notas).toBe("");
  });
});

// ============================================================================
describe("ajuste · piezas sueltas", () => {
  it("textoDeItem espeja lo que sale en el PDF", () => {
    expect(textoDeItem("work", { title: "Backend Developer", company: "Altiplano Pagos", dates: "2021 — 2024" }))
      .toBe("Backend Developer · Altiplano Pagos · 2021 — 2024");
    expect(textoDeItem("skill", { group: "Lenguajes", items: "Go, Kafka" })).toBe("Lenguajes: Go, Kafka");
    expect(textoDeItem("bullet", { text: "x" })).toBe("x");
  });

  it("itemDeAjuste lee la procedencia del override (el editor era ciego a esto)", () => {
    const it = itemDeAjuste({
      id: "v1", item_id: "m1", kind: "bullet", visible: true, sort_order: 0, parent_id: "m-work",
      data: { text: "hola" }, override_origin: "ai_rephrased", override_verified: true,
    });
    expect(it.origen).toBe("ai_rephrased");
    expect(it.verificado).toBe(true);
    expect(it.campo).toBe("text");
    expect(it.original).toBe("hola");
  });

  it("razonDelCandado nombra el fallo peor (inventar) antes que el fallo malo (perder)", () => {
    const r = razonDelCandado({
      lostNumbers: ["850"], lostEntities: [], newNumbers: ["85"], newEntities: [], shorter: true,
    });
    expect(r.indexOf("aparecen cifras")).toBeLessThan(r.indexOf("se pierden cifras"));
  });
});
