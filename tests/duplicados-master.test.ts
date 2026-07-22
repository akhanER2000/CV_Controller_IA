/* ============================================================================
   §A4 · LIMPIEZA RETROACTIVA DEL MASTER.

   «Necesito arreglar el que ya tengo, no solo evitar el próximo.» El registro
   real del usuario tiene 105 items: DIEZ roles donde hay cinco y TREINTA Y TRES
   grupos de aptitudes donde hay ~diez. Ya entraron. Blindar la ingesta no le
   quita ni uno de encima.

   Este test mide exactamente eso y nada más cómodo:
     (a) cuántos hechos distintos propone el detector sobre el master REAL;
     (b) que resolver un clúster REENGANCHA las viñetas del descartado — perderlas
         por el CASCADE de parent_id es el peor fallo posible de este bloque;
     (c) que un item usado por una variante NO se borra a la brava (RESTRICT).

   ⚠ Ni un solo caso de aquí fusiona nada por su cuenta: un clúster es una
     pregunta, y `resolverDuplicado` solo ejecuta un keepId/dropIds explícitos.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MasterItem } from "../src/lib/db/queries";
import {
  clustersDeDuplicados,
  duplicadosDelMaster,
  resolverDuplicado,
  invalidMergeData,
  CAMPOS_POR_KIND,
  esDuplicable,
  type ClusterDuplicado,
} from "../src/lib/db/duplicados";

/* ── Supabase de mentira, en memoria ──────────────────────────────────────────
   Solo la cadena que usan duplicados.ts y las funciones de master.ts que llama
   (usageForItems, deleteItem). Hace falta de verdad: lo que este bloque puede
   romper —reenganchar viñetas, respetar el RESTRICT— es I/O, y probarlo "a mano
   en la app" es exactamente como se perdió el dato la primera vez.
   Ojo: NO simula el CASCADE de parent_id. Se comprueba a mano en el caso que
   toca, para que el test no dependa de una simulación amable.                   */
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
      // se aplican en orden inverso para que el primer .order() mande
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
      // `neq` lo usa getMasterItems para dejar fuera las filas ESPEJO del CV
      // bilingüe (origin='ai_translated'). Sin él, el doble revienta con «neq is
      // not a function» — y eso es exactamente lo que este doble tiene que
      // reproducir: si el filtro existe en producción, existe aquí.
      neq: (k: string, v: unknown) => { preds.push((r) => r[k] !== v); return q; },
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
const fila = (
  id: string,
  kind: string,
  data: Row,
  extra: Row = {},
): Row => ({
  id,
  user_id: U,
  kind,
  parent_id: null,
  data,
  origin: "extracted",
  evidence_snippet: null,
  evidence_verified: false,
  sort_order: seq++,
  ...extra,
});

/* ============================================================================
   EL VOLCADO REAL — diez roles donde hay cinco
   ============================================================================ */

const rol = (id: string, title: string, company: string, dates: string, ev: string): Row =>
  fila(id, "work", { title, company, dates, location: "" }, { evidence_snippet: ev });
const vineta = (id: string, padre: string, text: string): Row =>
  fila(id, "bullet", { text }, { parent_id: padre });

function volcadoReal(): Row[] {
  seq = 0;
  return [
    // ① PharmIQ, contado dos veces
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

/* Los 33 grupos de aptitudes: diez familias reales escritas de tres o cuatro
   maneras distintas, que es exactamente lo que hizo el dossier del usuario. */
const GRUPOS: [string, string, string][] = [
  // ① lenguajes ×3
  ["k1", "Lenguajes", "C#, Python, TypeScript, SQL"],
  ["k2", "Lenguajes de programación", "Python, SQL, C#, JavaScript"],
  ["k3", "Programación", "C#, Python, TypeScript, JavaScript, SQL"],
  // ② IA ×4 (la tríada del volcado, y una cuarta)
  ["k4", "IA y LLMs", "RAG, LLM, embeddings, agentes"],
  ["k5", "Inteligencia Artificial", "RAG, LLM, embeddings, Machine Learning"],
  ["k6", "Arquitecturas de IA", "RAG, agentes, embeddings, LLM"],
  ["k7", "IA generativa", "LLM, RAG, embeddings, agentes"],
  // ③ contenedores ×3
  ["k8", "Infraestructura", "Docker, Kubernetes, Terraform, despliegue reproducible"],
  ["k9", "Contenedores", "Docker, Kubernetes, Terraform, despliegue reproducible"],
  ["k10", "DevOps y Despliegue", "Docker, Kubernetes, despliegue reproducible, Terraform"],
  // ④ web ×4
  ["k11", "Desarrollo Web", "Next.js, React, TypeScript, Node.js"],
  ["k12", "Frontend", "React, Next.js, Node.js, TypeScript"],
  ["k13", "Desarrollo Web y Backend", "Next.js, React, Node.js, TypeScript"],
  ["k14", "Web", "React, Next.js, Node.js, TypeScript"],
  // ⑤ bases de datos ×3
  ["k15", "Bases de datos", "PostgreSQL, MySQL, Redis, MongoDB"],
  ["k16", "Persistencia", "PostgreSQL, MySQL, MongoDB, Redis"],
  ["k17", "Almacenamiento", "PostgreSQL, Redis, MongoDB, MySQL"],
  // ⑥ nube ×3
  ["k18", "Cloud", "AWS, Azure, Vercel, Supabase"],
  ["k19", "Nube", "AWS, Azure, Vercel, Supabase"],
  ["k20", "Servicios en la nube", "AWS, Vercel, Supabase, Azure"],
  // ⑦ testing ×3
  ["k21", "Testing", "Vitest, Playwright, Jest, pruebas unitarias"],
  ["k22", "Pruebas", "Vitest, Jest, Playwright, pruebas unitarias"],
  ["k23", "Calidad", "Vitest, Playwright, Jest, pruebas unitarias"],
  // ⑧ versiones ×3
  ["k24", "Control de versiones", "Git, GitHub, GitLab, pull requests"],
  ["k25", "Versionado", "Git, GitHub, GitLab, pull requests"],
  ["k26", "Git", "Git, GitHub, GitLab, pull requests"],
  // ⑨ metodologías ×3
  ["k27", "Metodologías ágiles", "Scrum, Kanban, ceremonias, retrospectivas"],
  ["k28", "Ágil", "Scrum, Kanban, retrospectivas, ceremonias"],
  ["k29", "Gestión de proyectos", "Scrum, Kanban, ceremonias, retrospectivas"],
  // ⑩ 3D ×4
  ["k30", "Desarrollo 3D y Videojuegos", "Unity, Blender, realidad virtual, shaders"],
  ["k31", "Videojuegos", "Unity, Blender, realidad virtual, shaders"],
  ["k32", "3D y VR", "Unity, Blender, realidad virtual, shaders"],
  ["k33", "Realidad virtual", "Unity, Blender, realidad virtual, shaders"],
];

function aptitudes(): Row[] {
  return GRUPOS.map(([id, group, items]) => fila(id, "skill", { group, items }));
}

/** profile_items (filas de DB) → MasterItem, igual que getMasterItems. */
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

const clusterDe = (cs: ClusterDuplicado[], id: string): ClusterDuplicado | undefined =>
  cs.find((c) => c.miembros.some((m) => m.id === id));
const idsDe = (c?: ClusterDuplicado): string[] => (c?.miembros ?? []).map((m) => m.id).sort();

/* ============================================================================
   (a) EL CRITERIO DEL USUARIO, MEDIDO
   ============================================================================ */

describe("★ el criterio literal del usuario · ~5 roles y ~10 grupos", () => {
  const items = aMaster([...volcadoReal(), ...aptitudes()]);
  const clusters = clustersDeDuplicados(items, { currentYear: 2026 });

  it("el master de partida es el roto: 10 roles y 33 grupos de aptitudes", () => {
    expect(items.filter((i) => i.kind === "work")).toHaveLength(10);
    expect(items.filter((i) => i.kind === "skill")).toHaveLength(33);
  });

  it("★ tras resolver los clústeres de rol quedan 5 roles, no 10", () => {
    const deRol = clusters.filter((c) => c.kind === "work");
    const sobran = deRol.reduce((n, c) => n + c.miembros.length - 1, 0);
    expect(10 - sobran).toBe(5);
  });

  it("★ tras resolver los clústeres de aptitudes quedan ~10 grupos, no 33", () => {
    const deSkill = clusters.filter((c) => c.kind === "skill");
    const sobran = deSkill.reduce((n, c) => n + c.miembros.length - 1, 0);
    const quedan = 33 - sobran;
    // «~10» es el criterio del usuario, no un número mágico: se admite la franja
    // que sigue siendo un registro legible, y se rechaza tanto no limpiar nada
    // como colapsarlo todo en cuatro cajones.
    expect(quedan).toBeGreaterThanOrEqual(9);
    expect(quedan).toBeLessThanOrEqual(12);
  });

  it("Tesseract: las cuatro redacciones son UN solo clúster", () => {
    expect(idsDe(clusterDe(clusters, "r5"))).toEqual(["r5", "r6", "r7", "r8"]);
  });

  it("PharmIQ (dos) y el laboratorio VR (dos) también", () => {
    expect(idsDe(clusterDe(clusters, "r1"))).toEqual(["r1", "r2"]);
    expect(idsDe(clusterDe(clusters, "r3"))).toEqual(["r3", "r4"]);
  });

  it("★ el otro cargo de la MISMA universidad NO entra en ningún clúster", () => {
    expect(clusterDe(clusters, "r9")).toBeUndefined();
    expect(clusterDe(clusters, "r10")).toBeUndefined();
  });

  it("«Lenguajes» duplicado y la tríada de IA caen cada uno en su clúster", () => {
    expect(idsDe(clusterDe(clusters, "k1"))).toEqual(expect.arrayContaining(["k1", "k2"]));
    expect(idsDe(clusterDe(clusters, "k4"))).toEqual(expect.arrayContaining(["k4", "k5", "k6"]));
  });

  it("★ familias distintas NO se mezclan (testing ≠ ágil, datos ≠ nube)", () => {
    const testing = idsDe(clusterDe(clusters, "k21"));
    expect(testing).not.toContain("k27");
    const datos = idsDe(clusterDe(clusters, "k15"));
    expect(datos).not.toContain("k18");
  });

  it("★ el falso positivo que SÍ ocurre, escrito para que nadie lo descubra en producción", () => {
    // «Lenguajes» y «Desarrollo Web» acaban en el MISMO clúster porque TypeScript
    // está listado en los dos, y el detector cuenta sus piezas (type/script) como
    // entidades compartidas. Es un solapamiento real del registro del usuario, no
    // un fallo del fixture, y por eso el número final es 9 y no 10.
    //
    // Se documenta en vez de taparse porque es exactamente el caso que justifica
    // la regla del producto: el sistema PREGUNTA y el usuario dice que no. Si
    // esto fusionara solo, le habría borrado un grupo legítimo del CV.
    const c = idsDe(clusterDe(clusters, "k1"));
    expect(c).toContain("k11");
    // el umbral vive en extract/similar.ts (fuera de este bloque): si algún día se
    // afina y los separa, este test cae y hay que celebrarlo, no silenciarlo.
  });

  it("★ un rol NUNCA se agrupa con un grupo de aptitudes", () => {
    for (const c of clusters) {
      expect(new Set(c.miembros.map((m) => m.kind)).size).toBe(1);
    }
  });
});

describe("cada clúster llega con lo que hace falta para PREGUNTAR", () => {
  const items = aMaster([...volcadoReal(), ...aptitudes()]);
  const clusters = clustersDeDuplicados(items, { currentYear: 2026 });

  it("ninguno es mudo: nivel, señales y motivo en español", () => {
    expect(clusters.length).toBeGreaterThan(0);
    for (const c of clusters) {
      expect(["baja", "media", "alta"]).toContain(c.level);
      expect(c.signals.length).toBeGreaterThan(0);
      expect(c.reason).toMatch(/^Puede ser el mismo item: .+\.$/);
    }
  });

  it("★ trae los campos CAMPO POR CAMPO, los mismos que pinta la pantalla", () => {
    const c = clusterDe(clusters, "r1")!;
    const claves = c.miembros[0]!.campos.map((f) => f.clave);
    expect(claves).toEqual(CAMPOS_POR_KIND.work!.map((f) => f.clave));
    // el caso que motivó la fusión: uno tiene fecha y el otro no
    const conFecha = c.miembros.find((m) => m.id === "r1")!;
    const sinFecha = c.miembros.find((m) => m.id === "r2")!;
    expect(conFecha.campos.find((f) => f.clave === "dates")!.valor).toBe("abr 2026 – actualidad");
    expect(sinFecha.campos.find((f) => f.clave === "dates")!.valor).toBe("");
  });

  it("★ trae las viñetas de cada miembro (son lo que se puede perder al descartar)", () => {
    const c = clusterDe(clusters, "r5")!;
    const r6 = c.miembros.find((m) => m.id === "r6")!;
    expect(r6.vinetas.map((b) => b.id)).toEqual(["r6b1", "r6b2"]);
  });

  it("los clústeres van ordenados: lo más sospechoso primero", () => {
    const n = clusters.map((c) => ["baja", "media", "alta"].indexOf(c.level));
    expect([...n].sort((a, b) => b - a)).toEqual(n);
  });

  it("un master sin duplicados no propone nada (y no revienta vacío)", () => {
    expect(clustersDeDuplicados([])).toEqual([]);
    const limpio = aMaster([rol("x1", "Backend Developer", "Rayén Retail", "2020 – 2022", "")]);
    expect(clustersDeDuplicados(limpio)).toEqual([]);
  });

  it("las viñetas nunca son candidatas por su cuenta", () => {
    expect(esDuplicable("bullet")).toBe(false);
    expect(esDuplicable("work")).toBe(true);
    expect(esDuplicable("skill")).toBe(true);
  });
});

describe("duplicadosDelMaster · lo mismo, leyendo de la base", () => {
  it("devuelve los clústeres y cuántos items sobrarían si se confirma todo", async () => {
    const profile_items = [...volcadoReal(), ...aptitudes()];
    const sb = fakeSb({ profile_items, variant_items: [] });
    const { clusters, itemsRepetidos } = await duplicadosDelMaster(sb, U, { currentYear: 2026 });
    expect(clusters.length).toBeGreaterThan(0);
    // la cifra sale de los clústeres reales, no de un cartel
    expect(itemsRepetidos).toBe(clusters.reduce((n, c) => n + c.miembros.length - 1, 0));
  });
});

/* ============================================================================
   (b) REENGANCHAR LAS VIÑETAS — el fallo más grave posible
   ============================================================================ */

describe("★ resolver un clúster REENGANCHA las viñetas del descartado", () => {
  const montar = () => {
    const profile_items = volcadoReal();
    const variant_items: Row[] = [];
    return { profile_items, variant_items, sb: fakeSb({ profile_items, variant_items }) };
  };

  it("★ las cuatro redacciones de Tesseract se resuelven SIN perder una sola viñeta", async () => {
    const { profile_items, sb } = montar();
    const antes = profile_items.filter((r) => r.kind === "bullet").length;

    const r = await resolverDuplicado(sb, U, { keepId: "r5", dropIds: ["r6", "r7", "r8"] });

    expect(r.descartados.sort()).toEqual(["r6", "r7", "r8"]);
    expect(r.vinetasReenganchadas).toBe(4); // r6b1, r6b2, r7b1, r8b1
    expect(r.vinetasDescartadas).toBe(0);

    // ninguna viñeta desapareció del master
    expect(profile_items.filter((r) => r.kind === "bullet")).toHaveLength(antes);
    // y todas cuelgan ahora del rol que se queda
    const deR5 = profile_items.filter((x) => x.parent_id === "r5").map((x) => x.id);
    expect(deR5.sort()).toEqual(["r5b1", "r6b1", "r6b2", "r7b1", "r8b1"]);
    // los roles descartados ya no están
    expect(profile_items.filter((x) => ["r6", "r7", "r8"].includes(x.id as string))).toHaveLength(0);
  });

  it("★ las reenganchadas van DETRÁS de las que ya tenía el rol, no intercaladas", async () => {
    const { profile_items, sb } = montar();
    await resolverDuplicado(sb, U, { keepId: "r5", dropIds: ["r6", "r7", "r8"] });
    const orden = profile_items
      .filter((x) => x.parent_id === "r5")
      .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
      .map((x) => x.id);
    expect(orden).toEqual(["r5b1", "r6b1", "r6b2", "r7b1", "r8b1"]);
  });

  it("descartar las viñetas es POSIBLE, pero hay que pedirlo a propósito", async () => {
    const { profile_items, sb } = montar();
    const r = await resolverDuplicado(sb, U, { keepId: "r1", dropIds: ["r2"], vinetas: "descartar" });
    expect(r.vinetasReenganchadas).toBe(0);
    expect(r.vinetasDescartadas).toBe(2); // las de r2, que el CASCADE se lleva
    expect(profile_items.filter((x) => x.parent_id === "r1").map((x) => x.id)).toEqual(["r1b1", "r1b2"]);
  });

  it("★ «quedarme con la otra» es la misma llamada con los papeles al revés", async () => {
    const { profile_items, sb } = montar();
    await resolverDuplicado(sb, U, { keepId: "r2", dropIds: ["r1"] });
    expect(profile_items.some((x) => x.id === "r1")).toBe(false);
    expect(profile_items.some((x) => x.id === "r2")).toBe(true);
    expect(profile_items.filter((x) => x.parent_id === "r2").map((x) => x.id).sort()).toEqual([
      "r1b1", "r1b2", "r2b1", "r2b2",
    ]);
  });
});

/* ============================================================================
   FUSIONAR CAMPO A CAMPO
   ============================================================================ */

describe("fusionar · la fecha de uno con el detalle del otro", () => {
  it("★ escribe SOLO los campos elegidos y conserva los que el usuario no tocó", async () => {
    const profile_items = volcadoReal();
    // el rol que se queda tiene una ciudad que NO está en la pantalla de fusión
    const r2 = profile_items.find((x) => x.id === "r2")!;
    (r2.data as Row).location = "Santiago";
    const sb = fakeSb({ profile_items, variant_items: [] });

    await resolverDuplicado(sb, U, {
      keepId: "r2",
      dropIds: ["r1"],
      data: { dates: "abr 2026 – actualidad", title: "Founder & AI Engineer" },
    });

    const d = (profile_items.find((x) => x.id === "r2")!.data as Row);
    expect(d.dates).toBe("abr 2026 – actualidad");
    expect(d.title).toBe("Founder & AI Engineer");
    expect(d.company).toBe("Químico farmacéutico"); // no se eligió: se queda como estaba
    expect(d.location).toBe("Santiago"); // ⚠ el update REEMPLAZA data: esto se perdería sin el spread
  });

  it("★ rechaza un campo que el usuario nunca tuvo delante", async () => {
    expect(invalidMergeData("work", { title: "x" })).toBeNull();
    expect(invalidMergeData("work", { evidence_snippet: "inventado" })).toMatch(/no comparable/i);
    expect(invalidMergeData("skill", { items: "Go, Rust" })).toBeNull();
    expect(invalidMergeData("skill", { company: "x" })).toMatch(/no comparable/i);
    expect(invalidMergeData("bullet", { text: "x" })).toMatch(/no se puede fusionar/i);
    expect(invalidMergeData("work", ["title"])).toMatch(/objeto/i);

    const profile_items = volcadoReal();
    const sb = fakeSb({ profile_items, variant_items: [] });
    await expect(
      resolverDuplicado(sb, U, { keepId: "r1", dropIds: ["r2"], data: { origin: "manual" } }),
    ).rejects.toThrow(/no comparable/i);
    // y NO se descartó nada por el camino
    expect(profile_items.some((x) => x.id === "r2")).toBe(true);
  });

  it("★ la unión de chips de dos grupos de aptitudes se guarda tal cual llega", async () => {
    const profile_items = aptitudes();
    const sb = fakeSb({ profile_items, variant_items: [] });
    // la pantalla ofrece «las dos» y manda la unión ya calculada: aquí se comprueba
    // que ni se recorta ni se reordena por el camino.
    await resolverDuplicado(sb, U, {
      keepId: "k1",
      dropIds: ["k2"],
      data: { group: "Lenguajes", items: "C#, Python, TypeScript, SQL, JavaScript" },
    });
    const d = profile_items.find((x) => x.id === "k1")!.data as Row;
    expect(d.items).toBe("C#, Python, TypeScript, SQL, JavaScript");
    expect(profile_items.some((x) => x.id === "k2")).toBe(false);
  });
});

/* ============================================================================
   (c) EL RESTRICT DE LAS VARIANTES — nunca un 500 crudo
   ============================================================================ */

describe("★ un item usado por una variante NO se borra a la brava", () => {
  const conVariante = (itemId: string, override: Row | null = null) => {
    const profile_items = volcadoReal();
    const variant_items: Row[] = [
      { user_id: U, variant_id: "v1", item_id: itemId, override_data: override },
    ];
    return { profile_items, variant_items, sb: fakeSb({ profile_items, variant_items }) };
  };

  it("★ sin force devuelve BLOQUEADO con el uso real, y no toca nada", async () => {
    const { profile_items, sb } = conVariante("r6", { text: "reescrito por el usuario" });
    const r = await resolverDuplicado(sb, U, { keepId: "r5", dropIds: ["r6", "r7", "r8"] });

    expect(r.bloqueado).toBe(true);
    expect(r.usage.variantsCount).toBe(1);
    expect(r.usage.overridesCount).toBe(1);
    expect(r.usage.referencedIds).toEqual(["r6"]);
    // NADA se movió ni se borró: el aviso va ANTES del daño
    expect(r.descartados).toEqual([]);
    expect(r.vinetasReenganchadas).toBe(0);
    expect(profile_items.some((x) => x.id === "r6")).toBe(true);
    expect(profile_items.find((x) => x.id === "r6b1")!.parent_id).toBe("r6");
  });

  it("★ con force (el usuario aceptó) se resuelve y se reengancha igual", async () => {
    const { profile_items, variant_items, sb } = conVariante("r6");
    const r = await resolverDuplicado(sb, U, { keepId: "r5", dropIds: ["r6", "r7", "r8"], force: true });

    expect(r.bloqueado).toBe(false);
    expect(r.vinetasReenganchadas).toBe(4);
    expect(profile_items.some((x) => x.id === "r6")).toBe(false);
    expect(variant_items).toHaveLength(0); // la referencia se quitó a propósito, no por sorpresa
  });

  it("dryRun informa del riesgo sin tocar el master", async () => {
    const { profile_items, sb } = conVariante("r6");
    const r = await resolverDuplicado(sb, U, { keepId: "r5", dropIds: ["r6"], dryRun: true });
    expect(r.usage.variantsCount).toBe(1);
    expect(r.descartados).toEqual([]);
    expect(profile_items.some((x) => x.id === "r6")).toBe(true);
  });

  it("★ una variante que usa una VIÑETA del descartado no bloquea: la viñeta sobrevive", async () => {
    // Es la consecuencia de reenganchar: la referencia sigue siendo válida, así
    // que exigir confirmación ahí sería asustar al usuario por nada.
    const { profile_items, variant_items, sb } = conVariante("r6b1");
    const r = await resolverDuplicado(sb, U, { keepId: "r5", dropIds: ["r6"] });
    expect(r.bloqueado).toBe(false);
    expect(profile_items.find((x) => x.id === "r6b1")!.parent_id).toBe("r5");
    expect(variant_items).toHaveLength(1); // la variante conserva su override
  });

  it("★ …pero SÍ bloquea si el usuario pide descartar esas viñetas", async () => {
    const { profile_items, sb } = conVariante("r6b1");
    const r = await resolverDuplicado(sb, U, { keepId: "r5", dropIds: ["r6"], vinetas: "descartar" });
    expect(r.bloqueado).toBe(true);
    expect(r.usage.referencedIds).toEqual(["r6b1"]);
    expect(profile_items.some((x) => x.id === "r6b1")).toBe(true);
  });
});

/* ============================================================================
   Lo que el resolver NO acepta. Cada uno de estos, sin guardia, es pérdida de
   datos o una fusión que el usuario no pidió.
   ============================================================================ */

describe("guardias del resolver · nunca decide por su cuenta", () => {
  const sbDe = (filas = volcadoReal()) => ({ filas, sb: fakeSb({ profile_items: filas, variant_items: [] }) });

  it("sin dropIds no hace nada (una llamada a medias no puede borrar el master)", async () => {
    const { sb } = sbDe();
    await expect(resolverDuplicado(sb, U, { keepId: "r1", dropIds: [] })).rejects.toThrow(/descarta/i);
  });

  it("★ el que se queda no puede estar también en los descartados", async () => {
    const { filas, sb } = sbDe();
    await expect(resolverDuplicado(sb, U, { keepId: "r1", dropIds: ["r1", "r2"] })).rejects.toThrow();
    expect(filas.some((x) => x.id === "r1")).toBe(true);
  });

  it("★ no mezcla tipos: un rol no se resuelve contra un grupo de aptitudes", async () => {
    const filas = [...volcadoReal(), ...aptitudes()];
    const sb = fakeSb({ profile_items: filas, variant_items: [] });
    await expect(resolverDuplicado(sb, U, { keepId: "r1", dropIds: ["k1"] })).rejects.toThrow(/tipos distintos/i);
    expect(filas.some((x) => x.id === "k1")).toBe(true);
  });

  it("★ un item de otra cuenta no existe para esta sesión", async () => {
    const filas = volcadoReal();
    filas.push({ ...fila("ajeno", "work", { title: "De otro" }), user_id: "user-2" });
    const sb = fakeSb({ profile_items: filas, variant_items: [] });
    await expect(resolverDuplicado(sb, U, { keepId: "r1", dropIds: ["ajeno"] })).rejects.toThrow(/no existe o no es tuyo/i);
    await expect(resolverDuplicado(sb, U, { keepId: "ajeno", dropIds: ["r1"] })).rejects.toThrow(/no existe o no es tuyo/i);
    expect(filas.some((x) => x.id === "ajeno")).toBe(true);
    expect(filas.some((x) => x.id === "r1")).toBe(true);
  });
});

