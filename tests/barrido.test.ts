/* ============================================================================
   §B · BARRIDO DEL MASTER CON IA — «Revisar mi master con IA».

   El criterio literal del usuario: «corro el barrido sobre los 105 items reales y
   bajo a ~5 roles y ~10 grupos de skills SIN PERDER UNA SOLA VIÑETA CON CONTENIDO
   PROPIO». Esa última frase es una promesa de producto, no una aspiración, y este
   test la mide sin ninguna comodidad:

     (a) ANALIZAR es PURO: propone, no toca nada. Se prueba con el volcado real.
     (b) La FUSIÓN elige la versión con FECHAS como base y rellena sus huecos con
         las otras — descartar la versión narrativa perdería detalle real.
     (c) ★ APLICAR TODAS las fusiones no borra ni una viñeta con texto propio:
         se compara el conjunto de viñetas antes/después y se exige inclusión total.
     (d) las tres detecciones que leen el raw_text (fecha, cifra, aptitud) hallan
         EVIDENCIA LITERAL, y no la inventan cuando no está.

   ⚠ Ni un solo caso aplica nada por su cuenta: `analizarMaster` es una lista de
     preguntas y `aplicarBarrido` ejecuta un lote que el usuario ya seleccionó.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MasterItem } from "../src/lib/db/queries";
import {
  analizarMaster,
  aplicarBarrido,
  elegirBase,
  planFusion,
  esAplicable,
  type Correccion,
  type HallazgoDuplicado,
  type HallazgoMalClasificado,
  type HallazgoFecha,
  type HallazgoVineta,
  type HallazgoAptitud,
  type FuenteBarrido,
} from "../src/lib/master/barrido";
import { clustersDeDuplicados } from "../src/lib/db/duplicados";

/* ── Supabase de mentira, en memoria (gemelo del de duplicados-master.test.ts) ─
   Lo que este bloque puede romper —reenganchar viñetas, cambiar un kind, rellenar
   una fecha— es I/O, y probarlo "a mano en la app" es como se pierde el dato la
   primera vez. NO simula el CASCADE de parent_id: eso se comprueba a mano. */
type Row = Record<string, unknown>;

function fakeSb(tablas: Record<string, Row[]>): SupabaseClient {
  const from = (tabla: string) => {
    const filas = () => (tablas[tabla] ??= []);
    let modo: "select" | "update" | "delete" = "select";
    let patch: Row = {};
    const preds: ((r: Row) => boolean)[] = [];
    const orders: { k: string; asc: boolean }[] = [];
    let lim: number | null = null;
    let uno: "one" | "maybe" | null = null;

    const run = () => {
      let sel = filas().filter((r) => preds.every((p) => p(r)));
      for (const o of [...orders].reverse()) {
        sel = [...sel].sort((a, b) => {
          const av = a[o.k] as number | string | undefined;
          const bv = b[o.k] as number | string | undefined;
          if (av === bv) return 0;
          if (av === undefined) return 1;
          if (bv === undefined) return -1;
          return (av < bv ? -1 : 1) * (o.asc ? 1 : -1);
        });
      }
      if (lim !== null) sel = sel.slice(0, lim);
      if (modo === "update") {
        for (const r of sel) Object.assign(r, patch);
        return { data: null, error: null, count: sel.length };
      }
      if (modo === "delete") {
        const arr = filas();
        for (const r of sel) {
          const i = arr.indexOf(r);
          if (i >= 0) arr.splice(i, 1);
        }
        return { data: null, error: null, count: sel.length };
      }
      if (uno) {
        const first = sel[0] ? { ...sel[0] } : null;
        if (!first && uno === "one") return { data: null, error: { message: "no rows" }, count: 0 };
        return { data: first, error: null, count: first ? 1 : 0 };
      }
      return { data: sel.map((r) => ({ ...r })), error: null, count: sel.length };
    };

    const q = {
      select: () => q,
      update: (p: Row) => { modo = "update"; patch = p; return q; },
      delete: () => { modo = "delete"; return q; },
      eq: (k: string, v: unknown) => { preds.push((r) => r[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { preds.push((r) => vs.includes(r[k])); return q; },
      order: (k: string, o?: { ascending?: boolean }) => { orders.push({ k, asc: o?.ascending !== false }); return q; },
      limit: (n: number) => { lim = n; return q; },
      maybeSingle: () => { uno = "maybe"; return q; },
      single: () => { uno = "one"; return q; },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const U = "user-1";
let seq = 0;
const fila = (id: string, kind: string, data: Row, extra: Row = {}): Row => ({
  id, user_id: U, kind, parent_id: null, data, origin: "extracted",
  evidence_snippet: null, evidence_verified: false, sort_order: seq++, ...extra,
});

/* profile_items (filas de DB) → MasterItem, igual que getMasterItems. */
const aMaster = (filas: Row[]): MasterItem[] =>
  filas.map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    parentId: (r.parent_id as string | null) ?? null,
    data: (r.data as Record<string, unknown>) ?? {},
    origin: (r.origin as string) ?? "manual",
    evidenceSnippet: (r.evidence_snippet as string | null) ?? null,
    evidenceVerified: Boolean(r.evidence_verified),
    sortOrder: (r.sort_order as number) ?? 0,
  }));

/* ============================================================================
   EL VOLCADO REAL — diez roles donde hay cinco, 33 grupos donde hay ~diez.
   Es el mismo escenario que motivó el bloque (idéntico al de duplicados-master).
   ============================================================================ */
const rol = (id: string, title: string, company: string, dates: string, ev: string): Row =>
  fila(id, "work", { title, company, dates, location: "" }, { evidence_snippet: ev });
const vineta = (id: string, padre: string, text: string): Row =>
  fila(id, "bullet", { text }, { parent_id: padre });

function volcadoReal(): Row[] {
  seq = 0;
  return [
    // ① PharmIQ, contado dos veces (uno con fecha, otro sin)
    rol("r1", "Founder & AI Engineer", "PharmIQ", "abr 2026 – actualidad", "Founder & AI Engineer en PharmIQ"),
    vineta("r1b1", "r1", "Fundé PharmIQ, una plataforma de consultas clínicas con RAG y LLM para un químico farmacéutico."),
    vineta("r1b2", "r1", "Arquitectura de recuperación aumentada, embeddings y agentes."),
    rol("r2", "Desarrollador de software", "Químico farmacéutico", "", "Desarrollador de software"),
    vineta("r2b1", "r2", "Desarrollo una plataforma de consultas clínicas para un químico farmacéutico, con RAG, embeddings y LLM."),
    vineta("r2b2", "r2", "El producto se llama PharmIQ."),

    // ② El laboratorio VR de la UNAB, contado dos veces
    rol("r3", "Scrum Master & Technical Team Lead", "Proyecto VR (3DLAB-ENVI) — UNAB", "mar 2025 – dic 2025", ""),
    vineta("r3b1", "r3", "Lideré el equipo del laboratorio de química en realidad virtual 3DLab, en Unity y C#, con ceremonias Scrum."),
    rol("r4", "Scrum Master", "Universidad Andrés Bello", "", ""),
    vineta("r4b1", "r4", "Scrum Master del laboratorio de química en realidad virtual 3DLab, hecho en Unity y C# con el equipo de la UNAB."),

    // ③ Tesseract, CUATRO redacciones de UN solo trabajo
    rol("r5", "Software Engineering Intern", "Tesseract Softwares", "jul 2025 – ago 2025", ""),
    vineta("r5b1", "r5", "Práctica profesional de desarrollo backend en Tesseract Softwares, con Node y Docker."),
    rol("r6", "Práctica profesional número uno", "Tesseract", "2 meses", ""),
    vineta("r6b1", "r6", "Primera práctica profesional, dos meses de desarrollo backend en Tesseract con Node y Docker."),
    vineta("r6b2", "r6", "Endpoints REST y contenedores para el equipo de backend."),
    rol("r7", "becario", "TesseractSoftwares", "por lo menos dos o tres meses", ""),
    vineta("r7b1", "r7", "Becario de desarrollo backend en TesseractSoftwares, dos o tres meses trabajando con Node y Docker."),
    rol("r8", "Práctica número uno", "", "", ""),
    vineta("r8b1", "r8", "Primera práctica profesional, dos meses de desarrollo backend con Node y Docker."),

    // ④ Otro cargo en la MISMA universidad: NO es el mismo hecho
    rol("r9", "Ayudante de cátedra", "Universidad Andrés Bello", "mar 2024 – dic 2024", ""),
    vineta("r9b1", "r9", "Ayudantía del curso de programación: corrección de tareas y atención de dudas de los alumnos."),

    // ⑤ Un trabajo sin relación con ninguno
    rol("r10", "Desarrollador freelance", "Rayén Retail SpA", "2023", ""),
    vineta("r10b1", "r10", "Tienda en línea con pasarela de pagos y facturación electrónica para retail."),
  ];
}

const GRUPOS: [string, string, string][] = [
  ["k1", "Lenguajes", "C#, Python, TypeScript, SQL"],
  ["k2", "Lenguajes de programación", "Python, SQL, C#, JavaScript"],
  ["k3", "Programación", "C#, Python, TypeScript, JavaScript, SQL"],
  ["k4", "IA y LLMs", "RAG, LLM, embeddings, agentes"],
  ["k5", "Inteligencia Artificial", "RAG, LLM, embeddings, Machine Learning"],
  ["k6", "Arquitecturas de IA", "RAG, agentes, embeddings, LLM"],
  ["k7", "IA generativa", "LLM, RAG, embeddings, agentes"],
  ["k8", "Infraestructura", "Docker, Kubernetes, Terraform, despliegue reproducible"],
  ["k9", "Contenedores", "Docker, Kubernetes, Terraform, despliegue reproducible"],
  ["k10", "DevOps y Despliegue", "Docker, Kubernetes, despliegue reproducible, Terraform"],
  ["k11", "Desarrollo Web", "Next.js, React, TypeScript, Node.js"],
  ["k12", "Frontend", "React, Next.js, Node.js, TypeScript"],
  ["k13", "Desarrollo Web y Backend", "Next.js, React, Node.js, TypeScript"],
  ["k14", "Web", "React, Next.js, Node.js, TypeScript"],
  ["k15", "Bases de datos", "PostgreSQL, MySQL, Redis, MongoDB"],
  ["k16", "Persistencia", "PostgreSQL, MySQL, MongoDB, Redis"],
  ["k17", "Almacenamiento", "PostgreSQL, Redis, MongoDB, MySQL"],
  ["k18", "Cloud", "AWS, Azure, Vercel, Supabase"],
  ["k19", "Nube", "AWS, Azure, Vercel, Supabase"],
  ["k20", "Servicios en la nube", "AWS, Vercel, Supabase, Azure"],
  ["k21", "Testing", "Vitest, Playwright, Jest, pruebas unitarias"],
  ["k22", "Pruebas", "Vitest, Jest, Playwright, pruebas unitarias"],
  ["k23", "Calidad", "Vitest, Playwright, Jest, pruebas unitarias"],
  ["k24", "Control de versiones", "Git, GitHub, GitLab, pull requests"],
  ["k25", "Versionado", "Git, GitHub, GitLab, pull requests"],
  ["k26", "Git", "Git, GitHub, GitLab, pull requests"],
  ["k27", "Metodologías ágiles", "Scrum, Kanban, ceremonias, retrospectivas"],
  ["k28", "Ágil", "Scrum, Kanban, retrospectivas, ceremonias"],
  ["k29", "Gestión de proyectos", "Scrum, Kanban, ceremonias, retrospectivas"],
  ["k30", "Desarrollo 3D y Videojuegos", "Unity, Blender, realidad virtual, shaders"],
  ["k31", "Videojuegos", "Unity, Blender, realidad virtual, shaders"],
  ["k32", "3D y VR", "Unity, Blender, realidad virtual, shaders"],
  ["k33", "Realidad virtual", "Unity, Blender, realidad virtual, shaders"],
];
const aptitudes = (): Row[] => GRUPOS.map(([id, group, items]) => fila(id, "skill", { group, items }));

const dupHallazgos = (h: { tipo: string }[]): HallazgoDuplicado[] =>
  h.filter((x): x is HallazgoDuplicado => x.tipo === "duplicado");

/* ============================================================================
   (a) ANALIZAR es PURO y encuentra los mismos hechos que el detector
   ============================================================================ */
describe("★ analizar · propone, no toca nada", () => {
  const items = aMaster([...volcadoReal(), ...aptitudes()]);
  const { hallazgos, resumen, recorrido } = analizarMaster(items, [], { currentYear: 2026 });

  it("el master de partida es el roto: 10 roles y 33 grupos", () => {
    expect(items.filter((i) => i.kind === "work")).toHaveLength(10);
    expect(items.filter((i) => i.kind === "skill")).toHaveLength(33);
  });

  it("los clústeres de duplicados salen del detector, no de una reimplementación", () => {
    const delDetector = clustersDeDuplicados(items, { currentYear: 2026 }).length;
    expect(dupHallazgos(hallazgos)).toHaveLength(delDetector);
    expect(resumen.duplicados).toBe(delDetector);
  });

  it("el recorrido cuenta lo REAL, no un porcentaje inventado", () => {
    const comparar = recorrido.find((p) => p.clave === "barrido.paso.comparar")!;
    expect(comparar.datos.items).toBe(items.length);
    expect(comparar.datos.fuentes).toBe(0);
    const exp = recorrido.find((p) => p.clave === "barrido.paso.experiencia")!;
    expect(exp.datos.n).toBe(10);
  });

  it("★ sin fuentes NO se inventan hallazgos de fecha/cifra/aptitud (exigen raw_text)", () => {
    expect(resumen.fechasAusentes).toBe(0);
    expect(resumen.vinetasSinCifra).toBe(0);
    expect(resumen.aptitudesSinEvidencia).toBe(0);
  });
});

/* ============================================================================
   (b) LA FUSIÓN — base con fechas, y nada del otro se pierde
   ============================================================================ */
describe("★ planFusion · la versión con fechas manda, pero no descarta al otro", () => {
  const items = aMaster(volcadoReal());
  const clusters = clustersDeDuplicados(items, { currentYear: 2026 });
  const cPharm = clusters.find((c) => c.miembros.some((m) => m.id === "r1"))!;

  it("★ elige como BASE la versión con fecha real (r1), no la vaga sin fecha (r2)", () => {
    expect(elegirBase(cPharm).id).toBe("r1");
    const f = planFusion(cPharm);
    expect(f.keepId).toBe("r1");
    expect(f.dropIds).toEqual(["r2"]);
  });

  it("★ rellena los HUECOS de la base con lo que aporta el otro (no pierde su empresa)", () => {
    // Base r1 sin ciudad; el otro (r2) trae una: el hueco se rellena, no se ignora.
    const items2 = aMaster(volcadoReal().map((r) =>
      r.id === "r1" ? { ...r, data: { ...(r.data as Row), location: "" } }
      : r.id === "r2" ? { ...r, data: { ...(r.data as Row), location: "Santiago" } } : r,
    ));
    const c = clustersDeDuplicados(items2, { currentYear: 2026 }).find((x) => x.miembros.some((m) => m.id === "r1"))!;
    const f = planFusion(c);
    expect(f.data.location).toBe("Santiago"); // del otro, porque la base lo tenía vacío
    expect(f.data.title).toBe("Founder & AI Engineer"); // de la base, que sí lo tiene
    expect(f.vinetas).toBe("reenganchar"); // NUNCA se descartan viñetas por defecto
  });

  it("★ Tesseract: base r5 (única con rango real) y se descartan las otras tres", () => {
    const c = clusters.find((x) => x.miembros.some((m) => m.id === "r5"))!;
    const f = planFusion(c);
    expect(f.keepId).toBe("r5");
    expect(f.dropIds.sort()).toEqual(["r6", "r7", "r8"]);
  });

  it("★ dos grupos de aptitudes se funden en la UNIÓN de sus chips, sin duplicar", () => {
    const sk = aMaster(aptitudes());
    const cLeng = clustersDeDuplicados(sk).find((c) => c.miembros.some((m) => m.id === "k1"))!;
    const f = planFusion(cLeng);
    const chips = f.data.items.split(", ");
    // C#, Python, TypeScript, SQL, JavaScript… — cada lenguaje UNA vez
    for (const t of ["C#", "Python", "TypeScript", "SQL", "JavaScript"]) expect(chips).toContain(t);
    expect(new Set(chips).size).toBe(chips.length); // sin repetidos
  });
});

/* ============================================================================
   (c) ★★ EL CRITERIO CAPITAL — aplicar todas las fusiones sin perder una viñeta
   ============================================================================ */
describe("★★ aplicar el lote · ni una viñeta con texto propio desaparece", () => {
  const montar = () => {
    const profile_items = [...volcadoReal(), ...aptitudes()];
    return { profile_items, sb: fakeSb({ profile_items, variant_items: [] }) };
  };
  const textosViñeta = (filas: Row[]): Set<string> =>
    new Set(
      filas.filter((r) => r.kind === "bullet").map((r) => String((r.data as Row).text ?? "")).filter(Boolean),
    );

  it("★ de 105 items se baja a 5 roles y ~10 grupos SIN perder viñetas", async () => {
    const { profile_items, sb } = montar();
    const items = aMaster(profile_items);
    const { hallazgos } = analizarMaster(items, [], { currentYear: 2026 });

    const antes = textosViñeta(profile_items);
    expect(antes.size).toBe(profile_items.filter((r) => r.kind === "bullet").length);

    // Aplica TODAS las fusiones propuestas (el lote que el usuario confirmaría).
    const correcciones: Correccion[] = dupHallazgos(hallazgos).map((h) => ({ tipo: "duplicado", ...h.fusion }));
    const r = await aplicarBarrido(sb, U, correcciones);

    expect(r.bloqueadas).toHaveLength(0);
    expect(r.errores).toHaveLength(0);

    // ── LA PROMESA ── ninguna viñeta con contenido propio se quedó por el camino.
    const despues = textosViñeta(profile_items);
    const perdidas = [...antes].filter((t) => !despues.has(t));
    expect(perdidas).toEqual([]);
    expect(despues.size).toBe(antes.size); // ni una menos, ni un fantasma nuevo

    // ── EL NÚMERO ── 10 roles → 5; 33 grupos → la franja legible ~10.
    expect(profile_items.filter((r) => r.kind === "work")).toHaveLength(5);
    const skills = profile_items.filter((r) => r.kind === "skill").length;
    expect(skills).toBeGreaterThanOrEqual(9);
    expect(skills).toBeLessThanOrEqual(12);
  });

  it("★ tras aplicar, todas las viñetas cuelgan de un rol que EXISTE (ninguna huérfana)", async () => {
    const { profile_items, sb } = montar();
    const items = aMaster(profile_items);
    const { hallazgos } = analizarMaster(items, [], { currentYear: 2026 });
    await aplicarBarrido(sb, U, dupHallazgos(hallazgos).map((h) => ({ tipo: "duplicado", ...h.fusion }) as Correccion));

    const rolesVivos = new Set(profile_items.filter((r) => r.kind === "work").map((r) => r.id));
    for (const b of profile_items.filter((r) => r.kind === "bullet")) {
      expect(rolesVivos.has(b.parent_id as string)).toBe(true);
    }
  });
});

/* ============================================================================
   Reversibilidad del lote: la difiere la pantalla (UndoToast). Aquí se comprueba
   la otra mitad: si NO se llama, el master queda intacto — «deshacer» = nada pasó.
   ============================================================================ */
describe("★ nada se aplica sin selección", () => {
  it("aplicar una lista vacía no toca el master", async () => {
    const profile_items = volcadoReal();
    const antes = profile_items.length;
    const sb = fakeSb({ profile_items, variant_items: [] });
    const r = await aplicarBarrido(sb, U, []);
    expect(r.aplicadas).toBe(0);
    expect(profile_items).toHaveLength(antes);
  });

  it("esAplicable separa el lote (fusión/reclasificar/fecha) de lo consultivo", () => {
    expect(esAplicable({ tipo: "duplicado" } as HallazgoDuplicado)).toBe(true);
    expect(esAplicable({ tipo: "mal-clasificado" } as HallazgoMalClasificado)).toBe(true);
    expect(esAplicable({ tipo: "fecha-ausente" } as HallazgoFecha)).toBe(true);
    expect(esAplicable({ tipo: "vineta-sin-cifra" } as HallazgoVineta)).toBe(false);
    expect(esAplicable({ tipo: "aptitud-sin-evidencia" } as HallazgoAptitud)).toBe(false);
  });
});

/* ============================================================================
   (d) LEER EL RAW_TEXT — evidencia literal, nunca invención
   ============================================================================ */
describe("★ fecha ausente que SÍ está en la fuente", () => {
  const items = aMaster([
    fila("w1", "work", { title: "Backend Developer", company: "Altiplano Pagos SpA", dates: "", location: "" }),
  ]);
  const fuente: FuenteBarrido = {
    id: "src-1",
    rawText: "Experiencia\nBackend Developer\nAltiplano Pagos SpA\nmar 2022 – hoy\nA cargo de la conciliación.",
  };

  it("★ halla la fecha literal y la ata al item por su título/empresa", () => {
    const { hallazgos } = analizarMaster(items, [fuente]);
    const h = hallazgos.find((x): x is HallazgoFecha => x.tipo === "fecha-ausente");
    expect(h).toBeDefined();
    expect(h!.itemId).toBe("w1");
    expect(h!.dates).toBe("mar 2022 – hoy");
    expect(h!.sourceId).toBe("src-1");
    expect(h!.evidencia).toContain("mar 2022"); // se muestra la línea real, no un resumen
  });

  it("★ si el item YA tiene fecha, no hay hallazgo (no se pisa lo que hay)", () => {
    const conFecha = aMaster([
      fila("w2", "work", { title: "Backend Developer", company: "Altiplano Pagos SpA", dates: "2020 – 2021", location: "" }),
    ]);
    const { hallazgos } = analizarMaster(conFecha, [fuente]);
    expect(hallazgos.some((x) => x.tipo === "fecha-ausente")).toBe(false);
  });

  it("★ una cifra de logro embebida en prosa NO se confunde con una fecha", () => {
    const soloCifra: FuenteBarrido = { id: "s", rawText: "Backend Developer\nReduje la latencia a 850 ms en 2024 sin más contexto." };
    const { hallazgos } = analizarMaster(items, [soloCifra]);
    // «en 2024» es un año suelto embebido: no cuenta como fecha de empleo.
    expect(hallazgos.some((x) => x.tipo === "fecha-ausente")).toBe(false);
  });

  it("★ un rango de AÑOS a secas SÍ se reconoce (típico de educación)", () => {
    const edu = aMaster([
      fila("e1", "education", { degree: "Ingeniería Civil en Computación", institution: "Universidad Andrés Bello", dates: "" }),
    ]);
    const fuenteEdu: FuenteBarrido = {
      id: "src-2",
      rawText: "Educación\nIngeniería Civil en Computación\nUniversidad Andrés Bello\n2014 – 2019",
    };
    const { hallazgos } = analizarMaster(edu, [fuenteEdu]);
    const h = hallazgos.find((x): x is HallazgoFecha => x.tipo === "fecha-ausente");
    expect(h).toBeDefined();
    expect(h!.dates).toBe("2014 – 2019");
  });

  it("aplicar la fecha la escribe con procedencia de FUENTE (ni humano ni IA)", async () => {
    const profile_items = [fila("w1", "work", { title: "Backend Developer", company: "Altiplano Pagos SpA", dates: "", location: "" })];
    const sb = fakeSb({ profile_items });
    const r = await aplicarBarrido(sb, U, [{ tipo: "fecha", itemId: "w1", dates: "mar 2022 – hoy", sourceId: "src-1" }]);
    expect(r.fechas).toBe(1);
    const d = profile_items[0]!.data as Row;
    expect(d.dates).toBe("mar 2022 – hoy");
    expect(d.dateStart).toBe("03/2022");
    expect(d.dateCurrent).toBe(true);
    expect(d.dateBySource).toBe("src-1"); // se sabe DE DÓNDE salió la fecha
  });
});

describe("★ viñeta sin cifra cuya cifra SÍ está en el origen", () => {
  const items = aMaster([
    fila("b1", "bullet", { text: "Mantengo los pipelines de despliegue del equipo" }, { parent_id: "w1" }),
  ]);
  const fuente: FuenteBarrido = {
    id: "src-1",
    rawText: "Mantengo los pipelines de despliegue del equipo, unos 12 por semana.",
  };

  it("★ propone la cifra hallada, con la línea de la fuente como evidencia", () => {
    const { hallazgos } = analizarMaster(items, [fuente]);
    const h = hallazgos.find((x): x is HallazgoVineta => x.tipo === "vineta-sin-cifra");
    expect(h).toBeDefined();
    expect(h!.numeros).toContain("12");
    expect(h!.evidencia).toContain("12");
  });

  it("★ es consultivo: NO entra al lote (editar tu prosa es tu decisión, no del sistema)", () => {
    const { hallazgos } = analizarMaster(items, [fuente]);
    const h = hallazgos.find((x) => x.tipo === "vineta-sin-cifra")!;
    expect(esAplicable(h)).toBe(false);
  });

  it("una viñeta que YA trae cifra no genera hallazgo", () => {
    const conCifra = aMaster([fila("b2", "bullet", { text: "Mantengo 12 pipelines de despliegue" }, { parent_id: "w1" })]);
    const { hallazgos } = analizarMaster(conCifra, [fuente]);
    expect(hallazgos.some((x) => x.tipo === "vineta-sin-cifra")).toBe(false);
  });
});

describe("★ aptitud sin evidencia en ninguna fuente", () => {
  const fuente: FuenteBarrido = { id: "s", rawText: "Usé Docker y Python en varios repos. Nada de lo demás aparece." };

  it("★ lista los chips que no aparecen en ninguna fuente", () => {
    const items = aMaster([fila("k", "skill", { group: "Herramientas", items: "Docker, Python, Kafka, Hadoop" })]);
    const { hallazgos } = analizarMaster(items, [fuente]);
    const h = hallazgos.find((x): x is HallazgoAptitud => x.tipo === "aptitud-sin-evidencia");
    expect(h).toBeDefined();
    expect(h!.sinEvidencia.sort()).toEqual(["Hadoop", "Kafka"]); // Docker y Python sí están
  });

  it("★ un grupo MANUAL no se marca: el origen manual es el más verificable", () => {
    const items = aMaster([fila("k", "skill", { group: "Declaradas", items: "Kafka, Hadoop" }, { origin: "manual" })]);
    const { hallazgos } = analizarMaster(items, [fuente]);
    expect(hallazgos.some((x) => x.tipo === "aptitud-sin-evidencia")).toBe(false);
  });
});

/* ============================================================================
   MAL CLASIFICADO — un grupo de aptitudes que entró como proyecto
   ============================================================================ */
describe("★ proyecto que en realidad es un grupo de aptitudes", () => {
  it("★ lo detecta y propone convertirlo (nombre → grupo, descripción → chips)", async () => {
    const profile_items = [
      fila("p1", "project", { name: "Desarrollo Web", description: "Next.js, React, TypeScript, Node.js" }, { origin: "extracted" }),
    ];
    const items = aMaster(profile_items);
    const { hallazgos } = analizarMaster(items, []);
    const h = hallazgos.find((x): x is HallazgoMalClasificado => x.tipo === "mal-clasificado");
    expect(h).toBeDefined();
    expect(h!.group).toBe("Desarrollo Web");
    expect(h!.items).toBe("Next.js, React, TypeScript, Node.js");

    // Aplicar: cambia el KIND en su sitio, conservando id y procedencia.
    const sb = fakeSb({ profile_items });
    const r = await aplicarBarrido(sb, U, [{ tipo: "reclasificar", itemId: "p1", group: h!.group, items: h!.items }]);
    expect(r.reclasificadas).toBe(1);
    const fila1 = profile_items[0]!;
    expect(fila1.kind).toBe("skill");
    expect((fila1.data as Row).group).toBe("Desarrollo Web");
    expect((fila1.data as Row).items).toBe("Next.js, React, TypeScript, Node.js");
    expect((fila1.data as Row).name).toBeUndefined(); // reformado, sin dejar basura
    expect(fila1.origin).toBe("extracted"); // ⚠ la procedencia NO se pierde al reclasificar
  });

  it("★ un proyecto DE VERDAD (con cifra/enlace) no se toca", () => {
    const items = aMaster([
      fila("p2", "project", { name: "idempotency-go", description: "librería de idempotencia, github.com/x/y, 214 commits" }),
    ]);
    const { hallazgos } = analizarMaster(items, []);
    expect(hallazgos.some((x) => x.tipo === "mal-clasificado")).toBe(false);
  });
});
