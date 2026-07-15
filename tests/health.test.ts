import { describe, it, expect } from "vitest";
import { checkHealth, type HealthInput } from "../src/lib/health";

/**
 * Salud SIN score (prompt §7): solo lo que PUEDE fallar, cada regla con su fuente,
 * "todo en orden" = silencio. No hay ✓ de garantías por construcción.
 */

const sano: HealthInput = {
  targetTitle: "Backend Engineer",
  jobTitle: "Backend Engineer",
  work: [
    {
      company: "Altiplano Pagos SpA",
      title: "Backend Developer",
      bullets: [
        { text: "Reduje la latencia p95 un 38%." },
        { text: "Mantengo 4 pipelines de CI/CD." },
      ],
    },
  ],
  skills: [{ name: "Go", hasEvidence: true }],
  contact: { name: "Diego Gatica", email: "d@x.cl", phone: "+56 9 1234 5678" },
  pageCount: 2,
};

describe("checkHealth · el silencio es la señal", () => {
  it("una variante sana no genera ningún hallazgo", () => {
    expect(checkHealth(sano)).toEqual([]);
  });

  it("viñeta sin ninguna cifra → se lista, con su fuente (58,2%)", () => {
    const v = { ...sano, work: [{ ...sano.work[0]!, bullets: [{ text: "Diseñé la librería de idempotencia." }] }] };
    const found = checkHealth(v).filter((x) => x.rule === "bullet-sin-cifra");
    expect(found).toHaveLength(1);
    expect(found[0]!.source).toMatch(/58,2%/);
  });

  it("sin título objetivo → 10,6× citado", () => {
    const found = checkHealth({ ...sano, targetTitle: "" }).find((x) => x.rule === "sin-titulo-objetivo");
    expect(found?.message).toMatch(/10,6×/);
  });

  it("título objetivo distinto del aviso → señalado", () => {
    const found = checkHealth({ ...sano, jobTitle: "Staff Engineer" }).find(
      (x) => x.rule === "titulo-distinto-del-aviso",
    );
    expect(found).toBeTruthy();
  });

  it("empresa sin identificador legal → Greenhouse", () => {
    const v = { ...sano, work: [{ ...sano.work[0]!, company: "Acme" }] };
    const found = checkHealth(v).find((x) => x.rule === "empresa-sin-forma-legal");
    expect(found?.source).toBe("Greenhouse");
  });

  it("cargo abreviado (Sr. Eng.) → señalado", () => {
    const v = { ...sano, work: [{ ...sano.work[0]!, title: "Sr. Eng." }] };
    expect(checkHealth(v).some((x) => x.rule === "cargo-abreviado")).toBe(true);
  });

  it("viñeta que empieza con 'Responsable de' → [criterio] Fórmula XYZ", () => {
    const v = { ...sano, work: [{ ...sano.work[0]!, bullets: [{ text: "Responsable de 3 servidores." }] }] };
    const found = checkHealth(v).find((x) => x.rule === "responsable-de");
    expect(found?.sourceKind).toBe("criterio");
  });

  it("3+ páginas → Ladders", () => {
    const found = checkHealth({ ...sano, pageCount: 3 }).find((x) => x.rule === "tres-o-mas-paginas");
    expect(found?.source).toBe("Ladders");
  });

  it("skill sin evidencia → 32%", () => {
    const v = { ...sano, skills: [{ name: "Kafka", hasEvidence: false }] };
    const found = checkHealth(v).find((x) => x.rule === "skill-sin-evidencia");
    expect(found?.message).toMatch(/Kafka/);
  });

  it("contacto incompleto → el riesgo real de ser inalcanzable", () => {
    const v = { ...sano, contact: { name: "Diego", email: "d@x.cl" } };
    const found = checkHealth(v).find((x) => x.rule === "contacto-incompleto");
    expect(found?.message).toMatch(/teléfono/);
  });
});
