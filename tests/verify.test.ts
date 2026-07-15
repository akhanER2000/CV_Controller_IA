import { describe, it, expect } from "vitest";
import {
  normalize,
  verifyEvidence,
  extractNumbers,
  preservesFacts,
  soundsLikeAI,
} from "../src/lib/verify";

/**
 * El núcleo ético del producto, probado. Criterios #6 y #7 del prompt:
 *  #6 · un evidence_snippet que no aparece literal en raw_text → no verificado.
 *  #7 · una reformulación con una cifra que no está en el original ni en la
 *       evidencia es RECHAZADA. ← el test más importante del producto.
 */

describe("verifyEvidence · la evidencia se deriva de hechos, no del LLM", () => {
  const raw =
    "A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias). " +
    "Diseñé la librería interna de idempotencia.";

  it("coincidencia literal → verified", () => {
    expect(verifyEvidence(raw, "librería interna de idempotencia")).toBe("verified");
  });

  it("coincidencia con acentos/mayúsculas distintas → verified (normalizado)", () => {
    expect(verifyEvidence(raw, "LIBRERIA INTERNA DE IDEMPOTENCIA")).toBe("verified");
  });

  it("solaparse parcialmente (≥70% tokens) → partial", () => {
    expect(verifyEvidence(raw, "conciliación de pagos idempotencia")).toBe("partial");
  });

  it("algo que no está en la fuente → none (criterio #6)", () => {
    expect(verifyEvidence(raw, "lideré un equipo de 12 personas en Kafka")).toBe("none");
  });

  it("evidencia vacía → none", () => {
    expect(verifyEvidence(raw, "")).toBe("none");
  });
});

describe("extractNumbers · formato chileno (miles con punto, decimal con coma)", () => {
  it("40.000 → 40000 (miles)", () => {
    expect(extractNumbers("~40.000 transacciones")[0]).toMatchObject({ value: 40000, unit: "" });
  });
  it("0,94 → 0.94 (decimal)", () => {
    expect(extractNumbers("AUC 0,94")[0]).toMatchObject({ value: 0.94 });
  });
  it("25% conserva la unidad", () => {
    expect(extractNumbers("subió 25%")[0]).toMatchObject({ value: 25, unit: "%" });
  });
  it("25x ≠ 25%", () => {
    expect(extractNumbers("25x")[0]).toMatchObject({ value: 25, unit: "x" });
  });
});

describe("preservesFacts · el control que de verdad importa (criterio #7)", () => {
  it("★ RECHAZA una cifra nueva que no está en el original ni la evidencia", () => {
    const original = "Mejoré el rendimiento del checkout.";
    const proposed = "Mejoré el rendimiento del checkout, aumentándolo un 25%.";
    const r = preservesFacts(original, proposed, "");
    expect(r.ok).toBe(false);
    expect(r.newNumbers).toContain("25%");
  });

  it("ACEPTA una reformulación que conserva la cifra del original", () => {
    const original = "A cargo de la conciliación de ~40.000 transacciones diarias.";
    const proposed = "Responsable de conciliar unas 40.000 transacciones al día.";
    expect(preservesFacts(original, proposed, "").ok).toBe(true);
  });

  it("ACEPTA una cifra que sí está en la EVIDENCIA aunque no en el original", () => {
    const original = "Reduje la latencia del checkout.";
    const evidence = "bajé la latencia p95 de 850 ms a 180 ms";
    const proposed = "Reduje la latencia p95 de 850 ms a 180 ms.";
    expect(preservesFacts(original, proposed, evidence).ok).toBe(true);
  });

  it("RECHAZA cambiar la unidad (25% → 25x es invención)", () => {
    const original = "Crecí las ventas un 25%.";
    const proposed = "Multipliqué las ventas 25x.";
    const r = preservesFacts(original, proposed, "");
    expect(r.ok).toBe(false);
    expect(r.newNumbers).toContain("25x");
  });

  it("★ RECHAZA una entidad/tecnología inventada (Kafka no está en el origen)", () => {
    const original = "Construí APIs de pago en Go y PostgreSQL.";
    const proposed = "Construí una arquitectura event-driven sobre Kafka.";
    const r = preservesFacts(original, proposed, "");
    expect(r.ok).toBe(false);
    expect(r.newEntities.map((e) => e.toLowerCase())).toContain("kafka");
  });

  it("ACEPTA reescritura de estilo sin cifras ni entidades nuevas", () => {
    const original = "Responsable de mantener los pipelines de CI/CD del equipo.";
    const proposed = "Mantengo los pipelines de CI/CD del equipo.";
    expect(preservesFacts(original, proposed, "").ok).toBe(true);
  });
});

describe("soundsLikeAI · el vocabulario delator", () => {
  it("caza los tics en español", () => {
    expect(soundsLikeAI("Busco potenciar sinergias y la gestión integral").flagged).toBe(true);
  });
  it("caza los tics en inglés", () => {
    expect(soundsLikeAI("I spearheaded a robust, seamless platform").terms).toEqual(
      expect.arrayContaining(["spearheaded", "robust", "seamless"]),
    );
  });
  it("no marca texto honesto", () => {
    expect(soundsLikeAI("Mantengo los pipelines de CI/CD del equipo.").flagged).toBe(false);
  });
});

describe("normalize", () => {
  it("quita acentos, baja mayúsculas y colapsa espacios", () => {
    expect(normalize("  Conciliación   de   PAGOS ")).toBe("conciliacion de pagos");
  });
});
