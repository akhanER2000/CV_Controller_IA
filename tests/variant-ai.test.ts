import { describe, it, expect } from "vitest";
import {
  buildAiVariant,
  type AiMasterItem,
  type VariantLLM,
  type VariantPlan,
} from "../src/lib/extract/variant-ai";

/**
 * "La IA nunca inventa", en código. Sin LLM real: se inyecta un master falso y un
 * `llm` falso que devuelve BASURA a propósito — un id inexistente y un summary con
 * una cifra que NO está en el master. buildAiVariant debe:
 *   · descartar el id inválido y conservar los válidos EN ORDEN;
 *   · rechazar el summary inventado (preservesFacts) → summary=null (sin override);
 *   · aceptar un summary honesto que solo reusa hechos del master.
 */

const master: AiMasterItem[] = [
  { id: "b1", kind: "basics", text: "basics: Diego Gatica · Backend Developer · diego@x.cl" },
  { id: "s1", kind: "summary", text: "summary: Ingeniero backend con foco en pagos y confiabilidad." },
  { id: "w1", kind: "work", text: "work: Backend Developer · Altiplano Pagos · concilié ~40.000 transacciones diarias en Go" },
  { id: "sk1", kind: "skill", text: "skill: Lenguajes · Go, Python, TypeScript" },
];

/** Fabrica un llm falso que devuelve el plan dado, ignorando la entrada. */
const fakeLLM = (plan: VariantPlan): VariantLLM => async () => plan;

describe("buildAiVariant · la IA nunca inventa (validación dura en el servidor)", () => {
  it("★ descarta ids inexistentes, conserva los válidos EN ORDEN, y rechaza un summary inventado", async () => {
    const llm = fakeLLM({
      target_title: "Backend Engineer",
      // 'w1' antes que 's1' (orden intencional) + 'ghost' que NO existe en el master.
      include: ["w1", "ghost-id-que-no-existe", "s1"],
      // 25% NO aparece en ningún item del master → invención → debe rechazarse.
      summary: "Ingeniero backend que mejoró el rendimiento del checkout un 25%.",
      notes: "Master razonable para el rol.",
    });

    const out = await buildAiVariant({ master, prompt: "Backend Engineer" }, { llm });

    // el id inválido se cae; los válidos quedan, en el orden propuesto
    expect(out.includeIds).toEqual(["w1", "s1"]);
    expect(out.includeIds).not.toContain("ghost-id-que-no-existe");

    // el summary inventado se rechaza → null → no habrá override
    expect(out.summary).toBeNull();

    expect(out.targetTitle).toBe("Backend Engineer");
    expect(out.notes).toBe("Master razonable para el rol.");
  });

  it("acepta un summary que solo reusa hechos del master (misma cifra, sin entidades nuevas)", async () => {
    const llm = fakeLLM({
      target_title: "Backend Engineer",
      include: ["s1", "w1"],
      // 40.000 y Go SÍ están en el master → preserva hechos → se conserva.
      summary: "Backend developer que concilió unas 40.000 transacciones diarias en Go.",
      notes: "",
    });

    const out = await buildAiVariant({ master, prompt: "Backend" }, { llm });
    expect(out.summary).toBe("Backend developer que concilió unas 40.000 transacciones diarias en Go.");
    expect(out.includeIds).toEqual(["s1", "w1"]);
  });

  it("deduplica ids repetidos conservando la primera aparición", async () => {
    const llm = fakeLLM({
      target_title: "X",
      include: ["w1", "w1", "s1", "w1"],
      summary: "",
      notes: "",
    });
    const out = await buildAiVariant({ master, prompt: "X" }, { llm });
    expect(out.includeIds).toEqual(["w1", "s1"]);
    // summary vacío → null (nada que validar / overridear)
    expect(out.summary).toBeNull();
  });

  it("rechaza una entidad/tecnología inventada aunque las cifras cuadren (Kafka no está en el master)", async () => {
    const llm = fakeLLM({
      target_title: "Platform Engineer",
      include: ["w1"],
      summary: "Diseñé una arquitectura event-driven sobre Kafka.",
      notes: "",
    });
    const out = await buildAiVariant({ master, prompt: "Platform" }, { llm });
    expect(out.summary).toBeNull();
  });
});
