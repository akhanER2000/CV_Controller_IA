import { describe, it, expect } from "vitest";
import {
  signalsOf,
  compareSignals,
  compareTexts,
  similarityVerdict,
  WEIGHTS,
  SIMILAR_STRONG,
  SIMILAR_WEAK,
  MIN_SHARED_WEIGHT,
} from "../src/lib/extract/similar";

/**
 * §A1 · n2 · similitud SEMÁNTICA sin LLM. Estos tests INTENTAN ROMPERLA: no basta
 * con que agrupe lo que debe agrupar, tiene que NO agrupar lo que comparte solo el
 * vocabulario de oficio (Unity, C#, VR aparecen en toda la carrera del usuario).
 */

const v = (a: string, b: string) => similarityVerdict(compareTexts(a, b));

describe("signalsOf · qué reconoce como señal", () => {
  it("separa cifra de año: 300 personas pesa más que el año 2025", () => {
    const bag = signalsOf("Usado por ~300 personas durante 2025");
    expect(bag.weights.get("#n:300|")).toBe(WEIGHTS.number);
    expect(bag.weights.get("#y:2025")).toBe(WEIGHTS.year);
    expect(bag.numbers.has("300")).toBe(true);
  });

  it("★ un número pegado a letras NO es una cifra: «3DLab» no aporta un «3»", () => {
    const bag = signalsOf("3DLab y p99");
    expect([...bag.weights.keys()].some((k) => k.startsWith("#n:"))).toBe(false);
    expect(bag.entities.has("3dlab")).toBe(true);
  });

  it("parte camelCase pero NO parte «3DLab» en «3» + «DLab»", () => {
    const bag = signalsOf("TesseractSoftwares y 3DLab");
    expect(bag.entities.has("tesseract")).toBe(true);
    expect(bag.entities.has("3dlab")).toBe(true);
    expect(bag.weights.has("dlab")).toBe(false);
  });

  it("★ el camelCase no esconde el nombre: «TesseractSoftwares» contiene «Tesseract»", () => {
    const r = compareTexts("Becario en TesseractSoftwares", "Práctica en Tesseract Softwares");
    expect(r.sharedEntities).toContain("tesseract");
  });

  it("★ la raíz une singular y plural en los dos sentidos", () => {
    const bag = signalsOf("Softwares");
    expect(bag.weights.has([...signalsOf("Software").weights.keys()][0]!)).toBe(true);
  });

  it("★ una palabra genérica capitalizada NO es entidad («Desarrollador», «Software»)", () => {
    const bag = signalsOf("Desarrollador de Software");
    expect(bag.entities.has("desarrollador")).toBe(false);
    expect(bag.entities.has("software")).toBe(false);
    expect(bag.weights.get("desarrollador")).toBe(WEIGHTS.word);
  });

  it("siglas y nombres propios sí lo son", () => {
    const bag = signalsOf("Scrum Master en la UNAB con VR y Unity");
    for (const e of ["unab", "unity"]) expect(bag.entities.has(e), e).toBe(true);
  });

  it("plural y singular casan: «timones» ≡ «timón», «scripts» ≡ «script»", () => {
    const a = signalsOf("timones y scripts");
    const b = signalsOf("timón y script");
    expect(compareSignals(a, b).score).toBe(1);
  });

  it("texto vacío no revienta y no se parece a nada", () => {
    expect(compareTexts("", "").score).toBe(0);
    expect(compareTexts("", "Unity").score).toBe(0);
    expect(signalsOf(null, undefined).total).toBe(0);
  });
});

describe("★ los pares REALES del volcado se reconocen por contenido", () => {
  it("PharmIQ contado dos veces (una sin fecha y con la empresa mal)", () => {
    const a =
      "Founder & AI Engineer — PharmIQ. Plataforma con RAG y LLM para consultas de un químico farmacéutico.";
    const b =
      "Desarrollador de software — Químico farmacéutico. Construyo PharmIQ, una plataforma de consultas con RAG y LLM.";
    expect(v(a, b)).not.toBe("no");
  });

  it("Tesseract, las cuatro redacciones, casan entre sí", () => {
    const versiones = [
      "Software Engineering Intern — Tesseract Softwares. Práctica de desarrollo backend.",
      "Práctica profesional número uno — Tesseract · 2 meses de desarrollo backend.",
      "Becario — TesseractSoftwares, por lo menos dos o tres meses en desarrollo backend.",
    ];
    for (let i = 0; i < versiones.length; i++) {
      for (let j = i + 1; j < versiones.length; j++) {
        expect(v(versiones[i]!, versiones[j]!), `${i}↔${j}`).not.toBe("no");
      }
    }
  });

  it("los dos proyectos del laboratorio VR son el mismo", () => {
    const a = "3DLab-Environment-2025 — 3DLAB: laboratorio de química en realidad virtual para la UNAB, en Unity.";
    const b = "Laboratorio de química en VR (3DLab) — unos 80 scripts en C# sobre Unity para la UNAB.";
    expect(v(a, b)).not.toBe("no");
  });

  it("los dos scripts de calibración de timón son el mismo", () => {
    const a = "Script de calibración de timón — herramienta usada por ~300 personas de simulación aérea.";
    const b = "Scripts de calibración para simulación aérea — timones Thrustmaster.";
    expect(v(a, b)).not.toBe("no");
  });
});

describe("★ lo que NO debe parecerse (intentos de romperlo)", () => {
  it("dos trabajos distintos que comparten el oficio no se confunden", () => {
    const a = "Scrum Master & Technical Team Lead — Proyecto VR (3DLAB-ENVI) — UNAB. Unity, C#, gestión del equipo.";
    const b = "Software Engineering Intern — Tesseract Softwares. Backend en Node y despliegue con Docker.";
    expect(v(a, b)).toBe("no");
  });

  it("una promoción interna NO es contenido idéntico", () => {
    const a = "Backend Developer — Altiplano Pagos SpA. Servicios de cobro en Go.";
    const b = "Tech Lead — Altiplano Pagos SpA. Dirijo el equipo de plataforma y defino la arquitectura.";
    expect(compareTexts(a, b).score).toBeLessThan(SIMILAR_STRONG);
  });

  it("★ compartir UNA sola tecnología no basta, aunque el PORCENTAJE engañe", () => {
    const a = "Videojuego de plataformas hecho en Unity para un curso.";
    const b = "Simulador de vuelo para aerolíneas escrito en Unity.";
    const r = compareTexts(a, b);
    // el porcentaje sube por falta de denominador (dos textos cortos)…
    expect(r.score).toBeGreaterThan(SIMILAR_WEAK);
    // …y es justo el suelo ABSOLUTO el que impide que eso se convierta en sospecha
    expect(r.sharedWeight).toBeLessThan(MIN_SHARED_WEIGHT);
    expect(similarityVerdict(r)).toBe("no");
  });

  it("dos textos sin nada en común dan cero", () => {
    expect(compareTexts("Kubernetes y Terraform en AWS", "Ilustración editorial en acuarela").score).toBe(0);
  });

  it("la comparación es simétrica", () => {
    const a = "Práctica profesional en Tesseract, dos meses de backend";
    const b = "Becario en TesseractSoftwares durante dos meses";
    expect(compareTexts(a, b).score).toBeCloseTo(compareTexts(b, a).score, 10);
  });

  it("★ el containment no dispara solo: un texto corto contenido pero sin entidades", () => {
    const r = compareTexts("procesos internos varios", "procesos internos varios de la empresa, revisados y documentados por el equipo");
    expect(r.containment).toBeGreaterThan(0.5);
    expect(r.sharedEntities.length).toBeLessThan(2);
  });
});
