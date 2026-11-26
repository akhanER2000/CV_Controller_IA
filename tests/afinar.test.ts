import { describe, it, expect } from "vitest";
import { itemDeAjuste, calcularFaltas } from "../src/lib/cv/ajuste";
import {
  alcanceDe,
  construirAfinado,
  enAlcance,
  itemDeAfinar,
  planRevertir,
  resolverSinRespaldo,
  verificarAfinado,
  type AfinarItem,
  type AfinarLLM,
  type AfinarPlan,
  type AplicadoAfinar,
  type MaestroRef,
} from "../src/lib/cv/afinar";

/* ============================================================================
   «AFINAR CON IA» — las maneras concretas en que este botón arruinaría un CV:
     1. metiendo una cifra o un nombre que no están en el master ni en la evidencia;
     2. bloqueando lo legítimo: una tecnología de la evidencia verificada SÍ vale;
     3. no pudiendo volver: revertir tiene que dejar el texto del master;
     4. «resolviendo» una aptitud sin respaldo redactando una viñeta nueva.
   El LLM se inyecta y devuelve basura a propósito.
   ============================================================================ */

const master: MaestroRef[] = [
  { id: "m-sum", kind: "summary", parentId: null, sortOrder: 0, data: { text: "Ingeniero backend con foco en pagos." } },
  { id: "m-work", kind: "work", parentId: null, sortOrder: 1, data: { title: "Backend Developer", company: "Altiplano", dates: "2021 — 2024" } },
  {
    id: "m-b1", kind: "bullet", parentId: "m-work", sortOrder: 2,
    data: { text: "Me encargué de reducir la latencia p99 del checkout de 850 ms a 180 ms." },
    evidenceSnippet: "migramos la cola de eventos a Kafka y la latencia p99 bajó de 850 ms a 180 ms",
    evidenceVerified: true,
  },
  {
    id: "m-b2", kind: "bullet", parentId: "m-work", sortOrder: 3,
    data: { text: "Fui responsable de la conciliación diaria con Redis como caché." },
    evidenceSnippet: "usamos Terraform para todo", evidenceVerified: false, // NO verificada: no cuenta
  },
  { id: "m-b3", kind: "bullet", parentId: "m-work", sortOrder: 4, data: { text: "Automaticé despliegues con Docker." } },
  { id: "m-b4", kind: "bullet", parentId: "m-work", sortOrder: 5, data: { text: "Diseñé contratos OpenAPI para socios." } },
  { id: "m-sk", kind: "skill", parentId: null, sortOrder: 6, data: { group: "Backend", items: "Redis, Docker, OpenAPI, Rust" } },
];

const filas = [
  { id: "v-sum", item_id: "m-sum", kind: "summary", visible: true, sort_order: 0, parent_id: null, data: master[0]!.data },
  { id: "v-work", item_id: "m-work", kind: "work", visible: true, sort_order: 1, parent_id: null, data: master[1]!.data },
  { id: "v-b1", item_id: "m-b1", kind: "bullet", visible: true, sort_order: 2, parent_id: "m-work", data: master[2]!.data },
  { id: "v-b2", item_id: "m-b2", kind: "bullet", visible: true, sort_order: 3, parent_id: "m-work", data: master[3]!.data },
  // m-b3 (Docker) está en la variante pero OCULTA; m-b4 (OpenAPI) no está.
  { id: "v-b3", item_id: "m-b3", kind: "bullet", visible: false, sort_order: 4, parent_id: "m-work", data: master[4]!.data },
  { id: "v-sk", item_id: "m-sk", kind: "skill", visible: true, sort_order: 5, parent_id: null, data: master[6]!.data },
];

const porId = new Map(master.map((m) => [m.id, m]));
const items: AfinarItem[] = filas.map((f) => itemDeAfinar(itemDeAjuste(f), porId.get(f.item_id)));
const llmQueDevuelve = (plan: AfinarPlan): AfinarLLM => async () => plan;

describe("el candado del afinado", () => {
  it("una propuesta con una CIFRA nueva no se aplica", async () => {
    const r = await construirAfinado(
      { items, alcance: "todo", targetTitle: "SRE" },
      {
        llm: llmQueDevuelve({
          propuestas: [{ id: "v-b1", propuesto: "Reduje la latencia p99 de 850 ms a 180 ms para 2 millones de usuarios.", motivo: "" }],
          notas: "",
        }),
      },
    );
    expect(r.propuestas).toHaveLength(0);
    expect(r.descartados.find((d) => d.id === "v-b1")?.nuevas?.cifras).toContain("2");
  });

  it("una propuesta con un NOMBRE nuevo (que no está ni en el item ni en su evidencia) no se aplica", async () => {
    const r = await construirAfinado(
      { items, alcance: "work", targetTitle: "SRE" },
      {
        llm: llmQueDevuelve({
          // Terraform está en la evidencia de m-b2, pero NO verificada: no autoriza.
          propuestas: [{ id: "v-b2", propuesto: "Concilié a diario con Redis y Terraform.", motivo: "" }],
          notas: "",
        }),
      },
    );
    expect(r.propuestas).toHaveLength(0);
    expect(r.descartados[0]?.nuevas?.entidades).toContain("terraform");
  });

  it("una tecnología de la evidencia VERIFICADA sí pasa", async () => {
    const r = await construirAfinado(
      { items, alcance: "work", targetTitle: "SRE" },
      {
        llm: llmQueDevuelve({
          propuestas: [{ id: "v-b1", propuesto: "Bajé la latencia p99 del checkout de 850 ms a 180 ms migrando a Kafka.", motivo: "más directo" }],
          notas: "",
        }),
      },
    );
    expect(r.propuestas).toHaveLength(1);
    expect(r.propuestas[0]).toMatchObject({ id: "v-b1", campo: "text", original: master[2]!.data.text });
  });

  it("perder una cifra del original tampoco se aplica", () => {
    const v = verificarAfinado(String(master[2]!.data.text), "", "Reduje mucho la latencia p99 del checkout.");
    expect(v.ok).toBe(false);
    expect(v.perdidas.cifras.length).toBeGreaterThan(0);
  });

  it("un id inventado, un item editado a mano y un texto idéntico se descartan con motivo", async () => {
    const conManual = items.map((i) => (i.id === "v-sum" ? { ...i, origen: "manual" } : i));
    const r = await construirAfinado(
      { items: conManual, alcance: "todo", targetTitle: "SRE" },
      {
        llm: llmQueDevuelve({
          propuestas: [
            { id: "v-no-existe", propuesto: "x", motivo: "" },
            { id: "v-b2", propuesto: String(master[3]!.data.text), motivo: "" },
          ],
          notas: "",
        }),
      },
    );
    expect(r.propuestas).toHaveLength(0);
    const razones = r.descartados.map((d) => d.razon).join(" | ");
    expect(razones).toMatch(/a mano/);
    expect(razones).toMatch(/no está en lo que se pidió/);
    expect(razones).toMatch(/igual al original/);
  });

  it("el alcance filtra: una sección o un item; lo oculto nunca", () => {
    expect(alcanceDe("work")).toBe("work");
    expect(alcanceDe("cualquiera")).toBeNull();
    expect(alcanceDe({ itemId: "v-b1" })).toEqual({ itemId: "v-b1" });
    expect(items.filter((i) => enAlcance(i, "work")).map((i) => i.id)).toEqual(["v-b1", "v-b2"]);
    expect(items.filter((i) => enAlcance(i, { itemId: "m-b1" })).map((i) => i.id)).toEqual(["v-b1"]);
    expect(items.filter((i) => enAlcance(i, "todo")).some((i) => i.id === "v-b3")).toBe(false);
  });
});

describe("revertir", () => {
  it("deja el texto del master: el campo afinado sale del override", () => {
    const aplicados: AplicadoAfinar[] = [
      { tipo: "texto", id: "v-b1", itemId: "m-b1", kind: "bullet", campo: "text", original: "o", propuesto: "p", motivo: "", antes: null },
      { tipo: "texto", id: "v-b2", itemId: "m-b2", kind: "bullet", campo: "text", original: "o", propuesto: "p", motivo: "", antes: { text: "de tailor" } },
    ];
    const ops = planRevertir(aplicados);
    expect(ops).toContainEqual({ op: "override", id: "v-b1", override_data: null });
    // aunque antes hubiera otro override de texto, el master manda
    expect(ops).toContainEqual({ op: "override", id: "v-b2", override_data: null });
  });

  it("deshace lo mostrado, lo añadido y la lista de aptitudes", () => {
    const ops = planRevertir([
      { tipo: "mostrar", id: "v-b3", itemId: "m-b3", kind: "bullet", aptitudes: ["Docker"], texto: "" },
      { tipo: "anadir", id: "v-nuevo", itemId: "m-b4", kind: "bullet", aptitudes: ["OpenAPI"], texto: "" },
      { tipo: "ocultar-aptitud", id: "v-sk", itemId: "m-sk", kind: "skill", aptitudes: ["Rust"], original: "a", propuesto: "b", antes: null },
    ]);
    expect(ops).toEqual([
      { op: "override", id: "v-sk", override_data: null },
      { op: "quitar", id: "v-nuevo" },
      { op: "visible", id: "v-b3", visible: false },
    ]);
  });
});

describe("«sin respaldo», sin IA", () => {
  const acciones = resolverSinRespaldo(items, master);

  it("si la aptitud está literal en otro item del master, se hace visible ESE item", () => {
    expect(acciones).toContainEqual(expect.objectContaining({ tipo: "mostrar", id: "v-b3", aptitudes: ["Docker"] }));
    expect(acciones).toContainEqual(expect.objectContaining({ tipo: "anadir", itemId: "m-b4", aptitudes: ["OpenAPI"] }));
  });

  it("si no aparece en ninguno, se oculta en esta variante", () => {
    const o = acciones.find((a) => a.tipo === "ocultar-aptitud");
    expect(o).toMatchObject({ id: "v-sk", aptitudes: ["Rust"], propuesto: "Redis, Docker, OpenAPI" });
  });

  it("nunca inventa una viñeta: todo texto mostrado es texto del master, y lo nuevo es un subconjunto", () => {
    const textosMaster = new Set(master.map((m) => String(m.data.text ?? "")));
    for (const a of acciones) {
      if (a.tipo === "mostrar" || a.tipo === "anadir") expect(textosMaster.has(a.texto)).toBe(true);
      if (a.tipo === "ocultar-aptitud") {
        const orig = a.original.split(",").map((s) => s.trim());
        for (const s of a.propuesto.split(",").map((x) => x.trim())) expect(orig).toContain(s);
      }
    }
    // Y ninguna acción crea un item que no exista en el master.
    const ids = new Set(master.map((m) => m.id));
    for (const a of acciones) expect(ids.has(a.itemId)).toBe(true);
  });

  it("aplicadas las acciones, ya no quedan aptitudes sin respaldo", () => {
    const despues = items.map((i) => {
      if (i.id === "v-b3") return { ...i, visible: true };
      if (i.id === "v-sk") return { ...i, datos: { ...i.datos, items: "Redis, Docker, OpenAPI" } };
      return i;
    });
    const b4 = itemDeAfinar(
      itemDeAjuste({ id: "v-b4", item_id: "m-b4", kind: "bullet", visible: true, sort_order: 6, parent_id: "m-work", data: master[5]!.data }),
      master[5],
    );
    expect(calcularFaltas([...despues, b4]).filter((f) => f.tipo === "sin-respaldo")).toHaveLength(0);
  });

  it("un grupo sin ninguna aptitud respaldada se oculta entero", () => {
    const solo = [
      ...items.filter((i) => i.kind !== "skill"),
      itemDeAfinar(
        itemDeAjuste({ id: "v-sk2", item_id: "m-sk2", kind: "skill", visible: true, sort_order: 9, parent_id: null, data: { group: "Otros", items: "Rust, Elixir" } }),
        undefined,
      ),
    ];
    expect(resolverSinRespaldo(solo, master)).toContainEqual(
      expect.objectContaining({ tipo: "ocultar-grupo", id: "v-sk2", aptitudes: ["Rust", "Elixir"] }),
    );
  });
});
