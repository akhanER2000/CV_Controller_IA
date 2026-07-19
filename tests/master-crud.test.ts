/* ============================================================================
   Master CRUD — helpers PUROS de src/lib/db/master.ts.

   Solo se testea la lógica sin I/O (la parte con Supabase se ejerce a mano en la
   app; ver el informe). Cubre lo que el encargo pide explícitamente:
     · looksLikeSkillTag  — la heurística viñeta-vs-etiqueta (A4)
     · splitChipInput     — el split del pegado múltiple (A3)
     · normalizeSkillName — la normalización de duplicados, postgres≈postgresql (A3)
     · mergeChips         — la fusión sin duplicar
   ============================================================================ */
import { describe, it, expect } from "vitest";
import {
  looksLikeSkillTag,
  splitChipInput,
  normalizeSkillName,
  mergeChips,
  chipsFromCsv,
  chipsToCsv,
} from "../src/lib/db/master";

describe("looksLikeSkillTag · viñeta de logro vs. etiqueta de habilidad (A4)", () => {
  it("SÍ es etiqueta: los ejemplos del encargo", () => {
    expect(looksLikeSkillTag("Unity 3D")).toBe(true);
    expect(looksLikeSkillTag("C#")).toBe(true);
    expect(looksLikeSkillTag("Liderazgo Técnico (Unity & VR)")).toBe(true);
    expect(looksLikeSkillTag("Gestión ágil de proyectos")).toBe(true);
  });

  it("SÍ es etiqueta: otras etiquetas cortas típicas", () => {
    expect(looksLikeSkillTag("PostgreSQL")).toBe(true);
    expect(looksLikeSkillTag("Kubernetes")).toBe(true);
    expect(looksLikeSkillTag("Diseño UX")).toBe(true); // "Diseño" sustantivo, no verbo
  });

  it("NO es etiqueta: viñetas de logro reales (los negativos del encargo)", () => {
    expect(looksLikeSkillTag("Reduje la latencia p99 de 850 ms a 180 ms")).toBe(false);
    expect(looksLikeSkillTag("Escribí la librería interna de idempotencia")).toBe(false);
  });

  it("NO es etiqueta: verbo conjugado al inicio aunque sea corta", () => {
    expect(looksLikeSkillTag("Lideré el equipo de datos")).toBe(false);
    expect(looksLikeSkillTag("Mantengo los pipelines de CI/CD")).toBe(false);
    expect(looksLikeSkillTag("Documenté la API pública")).toBe(false);
  });

  it("NO es etiqueta: trae una métrica de logro", () => {
    expect(looksLikeSkillTag("40.000 transacciones diarias")).toBe(false);
    expect(looksLikeSkillTag("2 desarrolladores junior")).toBe(false);
  });

  it("NO es etiqueta: termina en punto (es una frase) o está vacía", () => {
    expect(looksLikeSkillTag("Trabajo en equipo.")).toBe(false);
    expect(looksLikeSkillTag("   ")).toBe(false);
  });
});

describe("splitChipInput · pegado múltiple (A3)", () => {
  it("separa por comas, punto y coma y saltos de línea", () => {
    expect(splitChipInput("Go, Python; SQL\nRust")).toEqual(["Go", "Python", "SQL", "Rust"]);
  });

  it("separa por bullets de lista (· • |) y descarta vacíos", () => {
    expect(splitChipInput("React · Vue • Angular")).toEqual(["React", "Vue", "Angular"]);
    expect(splitChipInput("Go,,  ,Python,")).toEqual(["Go", "Python"]);
  });

  it("NO parte tokens con punto interno (Node.js, 3.11)", () => {
    expect(splitChipInput("Node.js, Python 3.11")).toEqual(["Node.js", "Python 3.11"]);
  });

  it("un solo valor devuelve un chip", () => {
    expect(splitChipInput("TypeScript")).toEqual(["TypeScript"]);
  });
});

describe("normalizeSkillName · normalización para fusionar duplicados (A3)", () => {
  it("postgres ≈ postgresql (alias)", () => {
    expect(normalizeSkillName("PostgreSQL")).toBe("postgresql");
    expect(normalizeSkillName("postgres")).toBe("postgresql");
    expect(normalizeSkillName("Postgre")).toBe("postgresql");
  });

  it("alias comunes: js/ts/k8s/golang/node", () => {
    expect(normalizeSkillName("JS")).toBe("javascript");
    expect(normalizeSkillName("TS")).toBe("typescript");
    expect(normalizeSkillName("k8s")).toBe("kubernetes");
    expect(normalizeSkillName("Golang")).toBe("go");
    expect(normalizeSkillName("NodeJS")).toBe("node.js");
  });

  it("quita tildes y mayúsculas, colapsa espacios", () => {
    expect(normalizeSkillName("  Diseño  UX ")).toBe("diseno ux");
    expect(normalizeSkillName("Kubernetes")).toBe("kubernetes");
  });

  it("términos sin alias se conservan (minúsculas, sin tildes)", () => {
    expect(normalizeSkillName("Rust")).toBe("rust");
    expect(normalizeSkillName("C#")).toBe("c#");
  });
});

describe("mergeChips · fusión sin duplicar (comparación normalizada)", () => {
  it("no duplica postgres si ya está PostgreSQL; sí añade lo nuevo", () => {
    const r = mergeChips(["PostgreSQL"], ["postgres", "Redis"]);
    expect(r.chips).toEqual(["PostgreSQL", "Redis"]);
    expect(r.added).toEqual(["Redis"]);
    expect(r.duplicates).toEqual(["postgres"]);
  });

  it("no duplica dentro del mismo lote entrante", () => {
    const r = mergeChips([], ["Go", "go", "GO"]);
    expect(r.chips).toEqual(["Go"]);
    expect(r.added).toEqual(["Go"]);
    expect(r.duplicates).toEqual(["go", "GO"]);
  });
});

describe("chipsFromCsv / chipsToCsv · ida y vuelta con el CSV guardado", () => {
  it("lee el CSV en chips y lo vuelve a serializar canónico", () => {
    expect(chipsFromCsv("Go, Python, SQL")).toEqual(["Go", "Python", "SQL"]);
    expect(chipsToCsv(["Go", "Python", "SQL"])).toBe("Go, Python, SQL");
    expect(chipsToCsv(chipsFromCsv("Go,Python ; SQL"))).toBe("Go, Python, SQL");
  });
});
