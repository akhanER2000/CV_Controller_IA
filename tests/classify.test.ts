import { describe, it, expect } from "vitest";
import {
  classifyBulletText,
  detectLinkedInSection,
  linkedInSkillLines,
} from "../src/lib/extract/classify";

/**
 * §C1 · el caso REAL del usuario: bajo «Scrum Master & Technical Team Lead»
 * aparecieron como viñetas las ETIQUETAS de LinkedIn. El clasificador determinista
 * (sin LLM) debe separar habilidad de logro. Regla dura: nada se inventa; lo
 * ambiguo se marca como duda, no se fuerza.
 */

describe("classifyBulletText · habilidad ≠ viñeta (criterio 6)", () => {
  const etiquetas = [
    "Gestión ágil de proyectos",
    "Liderazgo Técnico (Unity & VR)",
    "Unity 3D",
    "Meta Quest",
    "C#",
  ];

  it("★ las etiquetas de LinkedIn NO acaban como viñetas", () => {
    for (const e of etiquetas) {
      const c = classifyBulletText(e);
      expect(c.kind, `${e} → ${c.kind} (${c.reason})`).not.toBe("bullet");
    }
  });

  it("★ las etiquetas claras se clasifican como habilidad", () => {
    for (const e of etiquetas) {
      expect(classifyBulletText(e).kind, e).toBe("skill");
    }
  });

  it("★ un logro real con verbo y cifra ES una viñeta", () => {
    expect(classifyBulletText("Reduje la latencia p99 de 850 ms a 180 ms").kind).toBe("bullet");
  });

  it("viñetas con verbo de acción (ES y EN) → bullet", () => {
    const logros = [
      "Diseñé la librería de idempotencia para pagos",
      "Lideré un equipo de 5 ingenieros",
      "Migré la plataforma a Kubernetes sin downtime",
      "Reduced infrastructure cost by 30%",
      "Built the CI/CD pipeline from scratch",
      "Mantengo 4 pipelines de integración continua",
    ];
    for (const l of logros) expect(classifyBulletText(l).kind, l).toBe("bullet");
  });

  it("una responsabilidad («Responsable de…») es viñeta, no habilidad", () => {
    expect(classifyBulletText("Responsable de 3 servidores de producción").kind).toBe("bullet");
  });

  it("etiquetas técnicas variadas → skill", () => {
    const skills = ["TypeScript", "PostgreSQL", "CI/CD", "React Native", "AWS Lambda"];
    for (const s of skills) expect(classifyBulletText(s).kind, s).toBe("skill");
  });

  it("una frase corta sin verbo ni patrón claro cae a duda (no se adivina)", () => {
    const c = classifyBulletText("procesos internos varios");
    expect(c.kind).toBe("doubt");
  });

  it("línea vacía o solo marcador → duda, sin reventar", () => {
    expect(classifyBulletText("").kind).toBe("doubt");
    expect(classifyBulletText("•").kind).toBe("doubt");
  });
});

describe("detectLinkedInSection · segmenta por encabezados (§C5)", () => {
  const captura = [
    "Diego Gatica",
    "Scrum Master & Technical Team Lead",
    "Experiencia",
    "Scrum Master · Altiplano",
    "Reduje la latencia un 38%",
    "Aptitudes",
    "Gestión ágil de proyectos",
    "Unity 3D",
    "C#",
    "Educación",
    "Ingeniería Civil Informática",
  ];

  it("reconoce Experiencia / Aptitudes / Educación como secciones", () => {
    const segs = detectLinkedInSection(captura);
    const kinds = segs.map((s) => s.section);
    expect(kinds).toContain("experience");
    expect(kinds).toContain("skills");
    expect(kinds).toContain("education");
  });

  it("★ lo que cuelga de Aptitudes son habilidades, no viñetas", () => {
    const skillLines = linkedInSkillLines(captura.join("\n"));
    expect(skillLines.has("unity 3d")).toBe(true);
    expect(skillLines.has("gestion agil de proyectos")).toBe(true);
    // el logro bajo Experiencia NO está en el set de habilidades
    expect(skillLines.has("reduje la latencia un 38%")).toBe(false);
  });

  it("texto sin encabezados → todo cae en un único bloque 'other'", () => {
    const segs = detectLinkedInSection(["hola", "mundo"]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.section).toBe("other");
  });
});
