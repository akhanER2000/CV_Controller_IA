import { describe, it, expect } from "vitest";
import { looksLikeSkillGroup, classifyProjectShape } from "../src/lib/extract/classify";
import { looksLikeSkillTag } from "../src/lib/db/master";

/**
 * §A1 · GRUPO DE APTITUDES vs PROYECTO. En el volcado real, DOCE grupos de
 * habilidades se colaron como `project`. Estos son los doce casos, literales, y
 * enfrente los proyectos REALES del mismo usuario que NO se pueden marcar: si el
 * detector se lleva por delante «3DLab-Environment-2025», el arreglo es peor que
 * el fallo, porque le borra al usuario un proyecto de verdad de la pantalla.
 */

// Los doce, tal cual salieron del extractor.
const GRUPOS: [string, string][] = [
  ["Desarrollo 3D y Videojuegos", "Unity 6"],
  ["Computación Cuántica", "computación cuántica"],
  ["DevOps y Despliegue", "contenedores y despliegue reproducible"],
  ["Inteligencia Artificial y Machine Learning", "RAG, Machine Learning, Redes Neuronales, Agentes"],
  ["Desarrollo Web y Backend", "Next.js, React, TypeScript, Node.js"],
  ["Lenguajes", "C#, Python, TypeScript, SQL"],
  ["Infraestructura y datos", "Docker, PostgreSQL, Redis"],
  ["Contenedores", "Docker, Kubernetes"],
  ["Ciencia de Datos", "Pandas, NumPy, Jupyter"],
  ["Datos y ML", "TensorFlow, PyTorch, Spark"],
  ["Arquitecturas de IA", "RAG, agentes, embeddings"],
  ["Realidad Virtual", "Unity, Meta Quest, XR"],
];

// Proyectos REALES del mismo volcado. Ninguno puede marcarse como grupo.
const PROYECTOS: [string, string][] = [
  ["3DLab-Environment-2025", "3DLAB: Desarrollo de laboratorio de química en realidad virtual para la UNAB"],
  ["Laboratorio de química en VR (3DLab)", "Laboratorio virtual en Unity con unos ~80 scripts en C#"],
  ["Script de calibración de timón", "Herramienta de calibración usada por ~300 personas de simulación aérea"],
  ["Scripts de calibración para simulación aérea", "Scripts para timones Thrustmaster en simuladores de vuelo"],
  ["PharmIQ", "Plataforma de consultas con RAG y LLM para un químico farmacéutico"],
  ["idempotency-go", "https://github.com/dgatica/idempotency-go"],
];

describe("★ looksLikeSkillGroup · los DOCE grupos reales se marcan", () => {
  for (const [name, desc] of GRUPOS) {
    it(`«${name}: ${desc}» → grupo de aptitudes`, () => {
      const r = classifyProjectShape(name, desc);
      expect(r.kind, r.reason).toBe("skill-group");
      expect(r.reason.length).toBeGreaterThan(10); // el motivo se pinta en la tarjeta
    });
  }
});

describe("★ looksLikeSkillGroup · los proyectos REALES no se tocan", () => {
  for (const [name, desc] of PROYECTOS) {
    it(`«${name}» sigue siendo proyecto`, () => {
      const r = classifyProjectShape(name, desc);
      expect(r.kind, r.reason).toBe("project");
    });
  }
});

describe("intentos de romper la distinción", () => {
  it("una descripción con comas pero con preposiciones NO es una lista de skills", () => {
    expect(looksLikeSkillGroup("Plataforma de cobros", "Plataforma de pagos, con webhooks, para Chile")).toBe(false);
  });

  it("un proyecto con nombre de categoría pero cifra real sigue siendo proyecto", () => {
    expect(looksLikeSkillGroup("Desarrollo Web y Backend", "Migración de 12 servicios a Next.js")).toBe(false);
  });

  it("una versión NO cuenta como cifra de proyecto («Python 3.11» sigue siendo skill)", () => {
    expect(looksLikeSkillGroup("Lenguajes", "Python 3.11, C#, TypeScript")).toBe(true);
  });

  it("un enlace convierte cualquier cosa en proyecto, aunque el nombre sea categoría", () => {
    expect(looksLikeSkillGroup("Contenedores", "https://github.com/x/y")).toBe(false);
  });

  it("sin nombre no hay grupo que valga (no se inventa una etiqueta)", () => {
    expect(looksLikeSkillGroup("", "Docker, Kubernetes")).toBe(false);
  });

  it("descripción vacía y nombre de categoría → grupo; descripción vacía y nombre propio → proyecto", () => {
    expect(looksLikeSkillGroup("Desarrollo Web y Backend", "")).toBe(true);
    expect(looksLikeSkillGroup("3DLab-Environment-2025", "")).toBe(false);
  });
});

/**
 * ★ La prueba de que NO se podía reutilizar `looksLikeSkillTag` (master.ts). Juzga
 * un chip suelto y su sesgo es otro: da por etiqueta el nombre de un proyecto real
 * del usuario. Si alguien «simplifica» fusionando las dos funciones, este test cae.
 */
describe("★ por qué hace falta una función distinta de looksLikeSkillTag", () => {
  it("looksLikeSkillTag daría por etiqueta un proyecto REAL; looksLikeSkillGroup no", () => {
    const nombre = "Script de calibración de timón";
    expect(looksLikeSkillTag(nombre)).toBe(true); // el falso positivo que hay que evitar
    expect(looksLikeSkillGroup(nombre, PROYECTOS[2]![1])).toBe(false);
  });
});
