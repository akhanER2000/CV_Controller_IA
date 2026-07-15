import { describe, it, expect } from "vitest";
import { runImport, type ImportDeps } from "../src/lib/extract/pipeline";
import { buildFromRepos } from "../src/lib/extract/github";
import type { Extractor } from "../src/lib/extract/llm";

/**
 * Test de integración de "pega lo que tengas" (prompt §3, criterio #1), SIN LLM
 * ni red: se inyecta un extractor y un fetcher de GitHub falsos, y se verifica
 * que el pipeline arma raw_text, clasifica las URLs, corre la verificación de
 * evidencia REAL (verify.ts) y produce el staging con la procedencia correcta.
 */

const PEGADO =
  "Soy Diego Gatica, diego@x.cl, en Santiago. Trabajé como Backend Developer en Altiplano Pagos. " +
  "reduje la latencia un 38%. Uso Go y Python. " +
  "Mi github es github.com/dgatica y mi linkedin linkedin.com/in/diego-gatica.";

// Extractor falso: devuelve una extracción canónica. Algunas evidencias SÍ están
// en el texto pegado (→ verified) y una NO (el resumen → none, honesto).
const fakeExtract: Extractor = async () => ({
  basics: {
    name: "Diego Gatica", label: "Backend Engineer", email: "diego@x.cl",
    phone: "", location: "Santiago", links: [],
    summary: "Backend engineer con seis años en pagos.",
    summaryEvidence: "seis años construyendo servicios de pago", // NO está en el pegado → none
  },
  work: [
    {
      title: "Backend Developer", company: "Altiplano Pagos SpA", location: "Santiago",
      dates: "mar 2022 – hoy", evidence: "Backend Developer en Altiplano Pagos",
      bullets: [{ text: "Reduje la latencia un 38%.", evidence: "reduje la latencia un 38%" }],
    },
  ],
  education: [],
  skills: [{ group: "Lenguajes", items: "Go, Python", evidence: "Uso Go y Python" }],
  projects: [],
});

const fakeGithub = async (user: string) =>
  buildFromRepos(user, [
    { name: "idempotency-go", language: "Go", description: "librería de idempotencia", stargazers_count: 42, fork: false, html_url: "https://github.com/dgatica/idempotency-go", pushed_at: "2026-01-01" },
  ]);

const deps: ImportDeps = { extract: fakeExtract, fetchGithubUser: fakeGithub };

describe("runImport · pega lo que tengas → staging (con procedencia)", () => {
  it("detecta el link de LinkedIn y NO lo lee (ofrece alternativas)", async () => {
    const r = await runImport({ pastedText: PEGADO }, deps);
    expect(r.linkedin).toHaveLength(1);
    expect(r.linkedin[0]!.slug).toBe("diego-gatica");
  });

  it("trae GitHub como dato duro (origin api) y lo cuenta como fuente", async () => {
    const r = await runImport({ pastedText: PEGADO }, deps);
    expect(r.sources).toContain("texto pegado");
    expect(r.sources).toContain("GitHub · @dgatica");
    const api = r.staged.filter((s) => s.origin === "api");
    expect(api.length).toBeGreaterThan(0);
    expect(api.every((s) => s.evidenceLevel === "api" && s.evidenceVerified)).toBe(true);
  });

  it("★ verifica la evidencia de cada item contra raw_text (criterio #6)", async () => {
    const r = await runImport({ pastedText: PEGADO }, deps);
    const work = r.staged.find((s) => s.kind === "work")!;
    expect(work.evidenceLevel).toBe("verified");
    const bullet = r.staged.find((s) => s.kind === "bullet")!;
    expect(bullet.evidenceVerified).toBe(true);
    // el resumen cita un fragmento que NO está en el texto → sin evidencia, honesto
    const summary = r.staged.find((s) => s.kind === "summary")!;
    expect(summary.evidenceLevel).toBe("none");
    expect(summary.evidenceVerified).toBe(false);
  });

  it("las viñetas cuelgan de su rol (parentKey)", async () => {
    const r = await runImport({ pastedText: PEGADO }, deps);
    const work = r.staged.find((s) => s.kind === "work")!;
    const bullet = r.staged.find((s) => s.kind === "bullet")!;
    expect(bullet.parentKey).toBe(work.key);
  });

  it("basics se verifica si nombre + contacto aparecen literal", async () => {
    const r = await runImport({ pastedText: PEGADO }, deps);
    const basics = r.staged.find((s) => s.kind === "basics")!;
    expect(basics.evidenceLevel).toBe("verified");
  });

  it("los conteos cuadran y hay al menos un item sin evidencia (el resumen)", async () => {
    const r = await runImport({ pastedText: PEGADO }, deps);
    expect(r.counts.total).toBe(r.staged.length);
    expect(r.counts.none).toBeGreaterThanOrEqual(1);
    expect(r.counts.verified).toBeGreaterThan(0);
  });

  it("un texto sin URLs no rompe nada y no inventa fuentes", async () => {
    const r = await runImport({ pastedText: "Soy Diego, diego@x.cl. Uso Go y Python." }, deps);
    expect(r.linkedin).toHaveLength(0);
    expect(r.sources).toEqual(["texto pegado"]);
  });
});
