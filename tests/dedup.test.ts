import { describe, it, expect } from "vitest";
import { runImport } from "../src/lib/extract/pipeline";
import type { Extractor } from "../src/lib/extract/llm";
import {
  detectDuplicates,
  clusterKeys,
  clusterDuplicates,
  looksLikeDuplicate,
  titlesClearlyDifferent,
  parseRange,
  type DedupItem,
} from "../src/lib/extract/dedup";

/**
 * §A1 · el fixture REAL. El usuario volcó un dossier que describe cada trabajo
 * desde tres fuentes distintas y salieron DIEZ roles donde hay CINCO. Estos son
 * esos diez, con la forma exacta que tenían: uno con fecha y empresa, otro sin
 * fecha y con la empresa mal («Químico farmacéutico» es la profesión del cliente,
 * no una empresa), otro con la empresa vacía.
 *
 * El test mide lo único que importa: cuántos HECHOS distintos propone el detector.
 * Y mide también lo contrario, que es donde un dedup se vuelve peligroso: dos
 * roles distintos de la MISMA empresa tienen que seguir siendo dos.
 *
 * ⚠ Agrupar aquí no fusiona nada. Un clúster es una pregunta al usuario.
 */

const w = (
  key: string, title: string, company: string, dates: string, text: string,
): DedupItem => ({ key, kind: "work", title, company, dates, text });

// ── Los diez roles del volcado ───────────────────────────────────────────────
const ROLES: DedupItem[] = [
  // ① PharmIQ, contado dos veces
  w("r1", "Founder & AI Engineer", "PharmIQ", "abr 2026 – actualidad",
    "Fundé PharmIQ, una plataforma de consultas clínicas con RAG y LLM para un químico farmacéutico. " +
    "Arquitectura de recuperación aumentada, embeddings y agentes."),
  w("r2", "Desarrollador de software", "Químico farmacéutico", "",
    "Desarrollo una plataforma de consultas clínicas para un químico farmacéutico, con RAG, embeddings y LLM. " +
    "El producto se llama PharmIQ."),

  // ② El laboratorio VR de la UNAB, contado dos veces
  w("r3", "Scrum Master & Technical Team Lead", "Proyecto VR (3DLAB-ENVI) — UNAB", "mar 2025 – dic 2025",
    "Lideré el equipo del laboratorio de química en realidad virtual 3DLab, en Unity y C#, con ceremonias Scrum."),
  w("r4", "Scrum Master", "Universidad Andrés Bello", "",
    "Scrum Master del laboratorio de química en realidad virtual 3DLab, hecho en Unity y C# con el equipo de la UNAB."),

  // ③ Tesseract, CUATRO redacciones de UN solo trabajo
  w("r5", "Software Engineering Intern", "Tesseract Softwares", "jul 2025 – ago 2025",
    "Práctica profesional de desarrollo backend en Tesseract Softwares, con Node y Docker."),
  w("r6", "Práctica profesional número uno", "Tesseract", "2 meses",
    "Primera práctica profesional, dos meses de desarrollo backend en Tesseract con Node y Docker."),
  w("r7", "becario", "TesseractSoftwares", "por lo menos dos o tres meses",
    "Becario de desarrollo backend en TesseractSoftwares, dos o tres meses trabajando con Node y Docker."),
  w("r8", "Práctica número uno", "",
    "", "Primera práctica profesional, dos meses de desarrollo backend con Node y Docker."),

  // ④ Otro trabajo en la MISMA universidad: NO es el mismo hecho
  w("r9", "Ayudante de cátedra", "Universidad Andrés Bello", "mar 2024 – dic 2024",
    "Ayudantía del curso de programación: corrección de tareas y atención de dudas de los alumnos."),

  // ⑤ Un trabajo sin relación con ninguno
  w("r10", "Desarrollador freelance", "Rayén Retail SpA", "2023",
    "Tienda en línea con pasarela de pagos y facturación electrónica para retail."),
];

const clusterDe = (grupos: string[][], key: string): string[] =>
  grupos.find((g) => g.includes(key)) ?? [];

describe("★ CRITERIO MEDIBLE · de 10 roles, ¿cuántos hechos distintos?", () => {
  const grupos = clusterKeys(ROLES, { currentYear: 2026 });

  it("propone 5 clústeres (los 5 trabajos que hay de verdad)", () => {
    expect(grupos.length).toBe(5);
  });

  it("PharmIQ: la versión con empresa y la que trae la PROFESIÓN del cliente van juntas", () => {
    expect(clusterDe(grupos, "r1")).toEqual(expect.arrayContaining(["r1", "r2"]));
  });

  it("el laboratorio VR: con fecha y sin fecha, y con la empresa escrita de dos formas", () => {
    expect(clusterDe(grupos, "r3")).toEqual(expect.arrayContaining(["r3", "r4"]));
  });

  it("★ Tesseract aparece CUATRO veces y es UN solo trabajo (una con la empresa vacía)", () => {
    const c = clusterDe(grupos, "r5");
    expect(c.sort()).toEqual(["r5", "r6", "r7", "r8"]);
  });

  it("★ el otro cargo en la MISMA universidad sigue siendo un trabajo aparte", () => {
    expect(clusterDe(grupos, "r9")).toEqual(["r9"]);
  });

  it("el trabajo sin relación se queda solo", () => {
    expect(clusterDe(grupos, "r10")).toEqual(["r10"]);
  });
});

describe("cada sospecha viaja con su motivo (la tarjeta tiene que poder explicarlo)", () => {
  const pares = detectDuplicates(ROLES, { currentYear: 2026 });

  it("no hay sospecha muda: todas traen nivel, señales y motivo en español", () => {
    expect(pares.length).toBeGreaterThan(0);
    for (const p of pares) {
      expect(["baja", "media", "alta"]).toContain(p.level);
      expect(p.signals.length).toBeGreaterThan(0);
      expect(p.reason).toMatch(/^Puede ser el mismo item: .+\.$/);
    }
  });

  it("★ el par sin fecha ni empresa fiable se sostiene SOLO en el contenido", () => {
    const p = pares.find((x) => x.aKey === "r1" && x.bKey === "r2")!;
    expect(p.signals).toContain("contenido");
    expect(p.signals).not.toContain("misma-empresa");
    expect(p.reason).toMatch(/pharmiq|rag|llm/i);
  });

  it("★ NUNCA se emite un par entre los dos cargos distintos de la misma universidad", () => {
    expect(pares.some((p) => [p.aKey, p.bKey].includes("r9"))).toBe(false);
  });

  it("van ordenadas por sospecha: lo más fuerte primero", () => {
    const niveles = pares.map((p) => ["baja", "media", "alta"].indexOf(p.level));
    expect([...niveles].sort((a, b) => b - a)).toEqual(niveles);
  });
});

// ── n1 · lo determinista, con las dos correcciones exigidas ──────────────────
describe("n1 · fechas DE VERDAD y la promoción interna", () => {
  it("★ la promoción interna NO es un duplicado (misma empresa, cargos distintos)", () => {
    const a = { company: "Altiplano Pagos SpA", start: "2020", end: "2022", title: "Backend Developer" };
    const b = { company: "Altiplano Pagos", start: "2022", end: "2024", title: "Tech Lead" };
    // las fechas SÍ se tocan en 2022: sin el guardia de títulos esto se marcaría
    expect(looksLikeDuplicate(a, b, 2026)).toBe(false);
  });

  it("★ el containment mutuo de la empresa tampoco basta con cargos distintos", () => {
    const a = { company: "Tesseract", start: "2025", end: "2025", title: "Contador general" };
    const b = { company: "Tesseract Softwares", start: "2025", end: "2025", title: "Diseñador gráfico" };
    expect(looksLikeDuplicate(a, b, 2026)).toBe(false);
  });

  it("el mismo cargo ampliado NO cuenta como cargo distinto", () => {
    expect(titlesClearlyDifferent("Scrum Master", "Scrum Master & Technical Team Lead")).toBe(false);
    expect(titlesClearlyDifferent("Backend Developer", "Tech Lead")).toBe(true);
    expect(titlesClearlyDifferent("", "Tech Lead")).toBe(false); // sin título no se afirma nada
  });

  it("★ las fechas se sacan con normalizeDateRange, no con end:null a ciegas", () => {
    expect(parseRange("mar 2025 – dic 2025")).toEqual({ ok: true, start: "03/2025", end: "12/2025" });
    expect(parseRange("abr 2026 – actualidad")).toEqual({ ok: true, start: "04/2026", end: "hoy" });
    expect(parseRange("2 meses").ok).toBe(false); // «2 meses» NO es una fecha
    expect(parseRange("").ok).toBe(false);
  });

  it("★ mismo cargo y misma empresa pero años que NO se tocan → dos trabajos", () => {
    const a = { company: "Rayén Retail S.A.", start: "2015", end: "2017", title: "Backend Developer" };
    const b = { company: "Rayén Retail", start: "2020", end: "2022", title: "Backend Developer" };
    expect(looksLikeDuplicate(a, b, 2026)).toBe(false);
  });

  it("clusterDuplicates sigue vivo y usa el MISMO motor", () => {
    const grupos = clusterDuplicates(
      [
        { company: "Altiplano Pagos SpA", start: "mar 2022", end: null },
        { company: "Altiplano Pagos", start: "2022", end: "hoy" },
        { company: "Rayén Retail S.A.", start: "2020", end: "2022" },
      ],
      2026,
    );
    expect(grupos).toHaveLength(2);
  });
});

// ── Proyectos y aptitudes: los mismos duplicados, el mismo motor ─────────────
describe("★ el detector también sirve para proyectos y aptitudes", () => {
  it("los dos pares de proyectos del volcado se agrupan (4 → 2)", () => {
    const proyectos: DedupItem[] = [
      { key: "p1", kind: "project", title: "3DLab-Environment-2025",
        text: "3DLAB: laboratorio de química en realidad virtual para la UNAB, hecho en Unity y C#" },
      { key: "p2", kind: "project", title: "Laboratorio de química en VR (3DLab)",
        text: "Laboratorio virtual de química en Unity con unos ~80 scripts en C# para la UNAB" },
      { key: "p3", kind: "project", title: "Script de calibración de timón",
        text: "Script de calibración usado por ~300 personas de simulación aérea" },
      { key: "p4", kind: "project", title: "Scripts de calibración para simulación aérea",
        text: "Scripts de calibración para timones Thrustmaster en simulación aérea" },
    ];
    const grupos = clusterKeys(proyectos);
    expect(grupos).toHaveLength(2);
    expect(clusterDe(grupos, "p1").sort()).toEqual(["p1", "p2"]);
    expect(clusterDe(grupos, "p3").sort()).toEqual(["p3", "p4"]);
  });

  it("los grupos de aptitudes solapados se agrupan (33 grupos donde hay ~10)", () => {
    const skills: DedupItem[] = [
      { key: "s1", kind: "skill", title: "Lenguajes", text: "C#, Python, TypeScript, SQL" },
      { key: "s2", kind: "skill", title: "Lenguajes", text: "Python, SQL, C#, JavaScript" },
      { key: "s3", kind: "skill", title: "IA y LLMs", text: "RAG, LLM, embeddings, agentes" },
      { key: "s4", kind: "skill", title: "Inteligencia Artificial", text: "RAG, LLM, embeddings, Machine Learning" },
      { key: "s5", kind: "skill", title: "Arquitecturas de IA", text: "RAG, agentes, embeddings, LLM" },
      { key: "s6", kind: "skill", title: "Infraestructura y datos", text: "Docker, Kubernetes, PostgreSQL, despliegue reproducible" },
      { key: "s7", kind: "skill", title: "Contenedores", text: "Docker, Kubernetes, despliegue reproducible" },
    ];
    const grupos = clusterKeys(skills);
    expect(clusterDe(grupos, "s1").sort()).toEqual(["s1", "s2"]);
    expect(clusterDe(grupos, "s3").sort()).toEqual(["s3", "s4", "s5"]);
    expect(clusterDe(grupos, "s6").sort()).toEqual(["s6", "s7"]);
    expect(grupos).toHaveLength(3);
  });

  it("★ un proyecto NUNCA se compara con un rol, aunque hablen de lo mismo", () => {
    const mixto: DedupItem[] = [
      { key: "x1", kind: "work", title: "Scrum Master", company: "UNAB", text: "laboratorio de química en realidad virtual 3DLab en Unity y C#" },
      { key: "x2", kind: "project", title: "3DLab", text: "laboratorio de química en realidad virtual 3DLab en Unity y C#" },
    ];
    expect(detectDuplicates(mixto)).toHaveLength(0);
  });

  it("una lista vacía o de un solo item no revienta", () => {
    expect(detectDuplicates([])).toEqual([]);
    expect(clusterKeys([{ key: "solo", kind: "work" }])).toEqual([["solo"]]);
  });
});

/* ============================================================================
   El cableado real: runImport marca la sospecha ANTES de escribir en staging,
   y NO fusiona ni descarta nada. Es la regla inviolable del producto: el
   duplicado lo resuelve el usuario, así que después de detectar tiene que
   seguir habiendo exactamente los mismos items que antes.
   ============================================================================ */

const PEGADO = [
  "Founder & AI Engineer en PharmIQ, desde abr 2026.",
  "Construí una plataforma de consultas clínicas con RAG y LLM para un químico farmacéutico.",
  "Desarrollador de software para un químico farmacéutico.",
  "Desarrollo la plataforma PharmIQ de consultas clínicas con RAG, embeddings y LLM.",
  "Desarrollo Web y Backend: Next.js, React, TypeScript, Node.js.",
  "3DLab-Environment-2025: laboratorio de química en realidad virtual para la UNAB.",
].join("\n");

const extractorFalso: Extractor = async () => ({
  basics: {
    name: "", label: "", email: "", phone: "", location: "", links: [],
    summary: "", summaryEvidence: "",
  },
  work: [
    {
      title: "Founder & AI Engineer", company: "PharmIQ", location: "",
      dates: "abr 2026 – actualidad", evidence: "Founder & AI Engineer en PharmIQ",
      bullets: [{
        text: "Construí una plataforma de consultas clínicas con RAG y LLM para un químico farmacéutico.",
        evidence: "plataforma de consultas clínicas con RAG y LLM",
      }],
    },
    {
      // la MISMA experiencia contada por el cuestionario: sin fecha y con la
      // profesión del cliente en el campo empresa
      title: "Desarrollador de software", company: "Químico farmacéutico", location: "",
      dates: "", evidence: "Desarrollador de software para un químico farmacéutico",
      bullets: [{
        text: "Desarrollo la plataforma PharmIQ de consultas clínicas con RAG, embeddings y LLM.",
        evidence: "la plataforma PharmIQ de consultas clínicas",
      }],
    },
  ],
  education: [],
  skills: [],
  projects: [
    { name: "Desarrollo Web y Backend", url: "", description: "Next.js, React, TypeScript, Node.js", dates: "", evidence: "Desarrollo Web y Backend" },
    { name: "3DLab-Environment-2025", url: "", description: "laboratorio de química en realidad virtual para la UNAB", dates: "", evidence: "3DLab-Environment-2025" },
  ],
});

describe("★ runImport · la sospecha llega al staging y NADA se fusiona", () => {
  it("★ los dos roles siguen siendo DOS filas: detectar no es fusionar", async () => {
    const r = await runImport({ pastedText: PEGADO }, { extract: extractorFalso });
    expect(r.staged.filter((s) => s.kind === "work")).toHaveLength(2);
    expect(r.staged.filter((s) => s.kind === "bullet")).toHaveLength(2);
    expect(r.staged.filter((s) => s.kind === "project")).toHaveLength(2);
  });

  it("★ el segundo rol viaja con nivel, señales y motivo apuntando al primero", async () => {
    const r = await runImport({ pastedText: PEGADO }, { extract: extractorFalso });
    const works = r.staged.filter((s) => s.kind === "work");
    const [primero, segundo] = works;
    expect(primero!.duplicate).toBeUndefined(); // el primero es el candidato a canónico
    expect(segundo!.duplicate).toBeDefined();
    expect(segundo!.duplicate!.otherKey).toBe(primero!.key);
    expect(segundo!.duplicate!.signals).toContain("contenido");
    expect(segundo!.duplicate!.reason).toMatch(/mismo item/i);
    expect(["media", "alta"]).toContain(segundo!.duplicate!.level);
  });

  it("★ el grupo de aptitudes disfrazado de proyecto queda MARCADO, no reclasificado", async () => {
    const r = await runImport({ pastedText: PEGADO }, { extract: extractorFalso });
    const proyectos = r.staged.filter((s) => s.kind === "project");
    const falso = proyectos.find((p) => p.data.name === "Desarrollo Web y Backend")!;
    const real = proyectos.find((p) => p.data.name === "3DLab-Environment-2025")!;
    // sigue siendo kind 'project': el sistema NO reclasifica solo
    expect(falso.kind).toBe("project");
    expect(falso.data._classDoubt).toBe("skill");
    expect(String(falso.data._classReason)).toMatch(/lista de tecnolog/i);
    // y el proyecto de verdad no se toca
    expect(real.data._classDoubt).toBeUndefined();
  });
});

/* ============================================================================
   n1-bis · IDENTIDAD POR NOMBRE.

   Este bloque no salió de pensar casos: salió de ABRIR LA APP. En un master real
   había dos grupos llamados «Lenguajes» —uno con Dockerfile leído de GitHub, otro
   con Go, Python y SQL del texto pegado— y ninguno de los dos estaba marcado,
   mientras que dos proyectos del mismo master sí lo estaban.

   El motivo es incómodo y por eso vale la pena escribirlo: cuanto MEJOR repartido
   está un duplicado, más invisible se volvía. n1 no podía verlos (exige empresa a
   los dos lados, y un grupo de aptitudes no tiene empresa) y n2 tampoco, porque
   sus contenidos no se parecen — son las dos mitades del mismo grupo.
   ============================================================================ */
describe("n1-bis · dos cosas que se llaman igual", () => {
  const skill = (key: string, title: string, text: string): DedupItem => ({ key, kind: "skill", title, text });

  it("★ el caso REAL: dos «Lenguajes» sin un solo item en común se marcan igual", () => {
    const pares = detectDuplicates([
      skill("s1", "Lenguajes", "Dockerfile"),
      skill("s2", "Lenguajes", "Go, Python, SQL"),
    ]);
    expect(pares).toHaveLength(1);
    expect(pares[0]!.level).toBe("alta");
    expect(pares[0]!.signals).toContain("mismo-nombre");
    // Y NO por contenido: no comparten ni una tecnología. Si algún día esto
    // trajera «contenido», sería que el comparador está viendo humo.
    expect(pares[0]!.signals).not.toContain("contenido");
  });

  it("dos grupos con nombres DISTINTOS siguen decidiéndose por contenido, no por el nombre", () => {
    const pares = detectDuplicates([
      skill("s1", "Lenguajes", "Go, Python"),
      skill("s2", "Plataformas", "Kubernetes"),
    ]);
    expect(pares).toHaveLength(0);
  });

  it("también vale para proyectos: el nombre de un proyecto es su identificador", () => {
    const pares = detectDuplicates([
      { key: "p1", kind: "project", title: "Portfolio", text: "Mi portfolio" },
      { key: "p2", kind: "project", title: "portfolio", text: "sitio personal en Astro" },
    ]);
    expect(pares[0]?.signals).toContain("mismo-nombre");
  });

  it("★ pero NO para roles: el mismo cargo en dos empresas son dos trabajos", () => {
    // Es la diferencia que justifica que la regla sea por kind y no global. Si se
    // aplicara a 'work', una carrera normal —el mismo cargo al cambiar de empresa—
    // se marcaría entera como duplicada.
    const pares = detectDuplicates([
      { key: "w1", kind: "work", title: "Ingeniero de software", company: "Altiplano Pagos", dates: "2019 – 2021", text: "pagos" },
      { key: "w2", kind: "work", title: "Ingeniero de software", company: "Rayén Retail", dates: "2022 – 2024", text: "checkout" },
    ]);
    expect(pares).toHaveLength(0);
  });

  it("un título vacío no identifica nada: dos items sin nombre no son «el mismo»", () => {
    const pares = detectDuplicates([skill("s1", "", "Go"), skill("s2", "  ", "Rust")]);
    expect(pares).toHaveLength(0);
  });
});
