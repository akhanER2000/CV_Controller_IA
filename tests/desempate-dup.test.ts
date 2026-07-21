/* ============================================================================
   §H · DESEMPATE DE DUPLICADOS CON LLM BARATO — la pieza de más valor.

   EL HALLAZGO REAL (medido en vivo sobre el master de 105 items): el barrido
   DETERMINISTA baja 10 roles a 9, no a los ~5 que hay, porque los duplicados que
   quedan NO comparten texto. La criba amplia + un juez barato SUBEN EL RECALL; la
   confirmación humana MANTIENE LA PRECISIÓN. Esa división es el diseño.

   ⚠ NO hay clave de IA en el entorno: el juez es INYECTABLE y aquí se prueba con un
     DOBLE (veredictos fijos). Se mide:
       (a) que los candidatos se generan aunque NO compartan texto (PharmIQ, Tesseract);
       (b) que SIN juez / con bordes vacíos el barrido da EXACTAMENTE lo determinista;
       (c) que un veredicto SÍ produce un hallazgo y un NO no;
       (d) que la FUSIÓN sigue siendo la determinista (el juez juzga identidad, no
           redacta) y que aplicarla NO pierde una sola viñeta con contenido propio.
   El efecto real «10→5» NO se puede medir aquí (depende del juez real): ver noHecho.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MasterItem } from "../src/lib/db/queries";
import {
  generarCandidatosDesempate,
  juzgarCandidatos,
  duplicadosConDesempate,
  aplicarBarrido,
  type JuezDuplicados,
  type Correccion,
} from "../src/lib/master/barrido";
import { clustersDeDuplicados } from "../src/lib/db/duplicados";

/* ── Supabase de mentira en memoria (gemelo del de barrido.test.ts) ──────────── */
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
      if (modo === "update") { for (const r of sel) Object.assign(r, patch); return { data: null, error: null, count: sel.length }; }
      if (modo === "delete") {
        const arr = filas();
        for (const r of sel) { const i = arr.indexOf(r); if (i >= 0) arr.splice(i, 1); }
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
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const U = "user-1";
let seq = 0;
const fila = (id: string, kind: string, data: Row, extra: Row = {}): Row => ({
  id, user_id: U, kind, parent_id: null, data,
  origin: "extracted", evidence_snippet: null, evidence_verified: false, sort_order: seq++, ...extra,
});
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

const rol = (id: string, title: string, company: string, dates: string, ev = ""): Row =>
  fila(id, "work", { title, company, dates, location: "" }, { evidence_snippet: ev || null });
const vineta = (id: string, padre: string, text: string): Row =>
  fila(id, "bullet", { text }, { parent_id: padre });

/* ── El volcado: duplicados reales que NO comparten texto ni empresa ──────────
   Construido para que el DETERMINISTA NO los agrupe (son singletons), y así el
   valor del juez sea visible: sin él, se quedan separados. */
function volcado(): Row[] {
  seq = 0;
  return [
    // ① PharmIQ contado dos veces: la 2ª empresa es la PROFESIÓN del cliente (cero
    //    solape de empresa). Comparten UNA entidad («RAG») y nada más textual, así
    //    que el determinista se queda por debajo del umbral: no los agrupa.
    rol("r1", "Founder & AI Engineer", "PharmIQ", "abr 2026 – actualidad", "Founder en PharmIQ"),
    vineta("r1b1", "r1", "Motor de recuperación aumentada con RAG."),
    rol("r2", "Desarrollador de software", "Químico farmacéutico", ""),
    vineta("r2b1", "r2", "Asistente de consultas clínicas con RAG."),

    // ② Tesseract, tres redacciones con empresa VACÍA y títulos distintos. Cada
    //    viñeta comparte SOLO la entidad «Tesseract» (lo demás es vocabulario propio):
    //    el determinista no llega al umbral, pero el juez sí puede juzgarlas iguales.
    rol("t1", "Software Engineering Intern", "", "jul 2025 – ago 2025"),
    vineta("t1b1", "t1", "Endpoints REST para Tesseract."),
    rol("t2", "becario", "", ""),
    vineta("t2b1", "t2", "Contenedores y despliegue en Tesseract."),
    rol("t3", "Práctica número uno", "", ""),
    vineta("t3b1", "t3", "Automatización de reportes en Tesseract."),

    // ③ Un trabajo SIN relación con ninguno: no debe entrar como candidato de nadie.
    rol("r9", "Desarrollador freelance", "Rayén Retail SpA", "2023"),
    vineta("r9b1", "r9", "Tienda en línea con pasarela de pagos y facturación."),
  ];
}

/** Juez doble: dice SÍ a los pares cuya clave esté en el set, NO al resto. */
const clave = (a: string, b: string) => [a, b].sort().join("|");
const juezSi = (siPares: string[]): JuezDuplicados => {
  const set = new Set(siPares);
  return async ({ aId, bId }) => ({
    mismoTrabajo: set.has(clave(aId, bId)),
    porque: set.has(clave(aId, bId)) ? "misma etapa, mismo trabajo" : "trabajos distintos",
  });
};
const juezSiATodo: JuezDuplicados = async () => ({ mismoTrabajo: true, porque: "sí" });
const juezNoATodo: JuezDuplicados = async () => ({ mismoTrabajo: false, porque: "no" });

const parEntre = (cands: { aId: string; bId: string }[], a: string, b: string): boolean =>
  cands.some((c) => clave(c.aId, c.bId) === clave(a, b));

/* ============================================================================
   (a) LOS CANDIDATOS se generan aunque NO compartan texto
   ============================================================================ */
describe("★ generar candidatos · criba amplia, precisión baja a propósito", () => {
  const items = aMaster(volcado());

  it("el DETERMINISTA no ve estos duplicados (por eso hace falta el juez)", () => {
    const workClusters = clustersDeDuplicados(items).filter((c) => c.kind === "work");
    expect(workClusters).toHaveLength(0); // cero: son singletons para el algoritmo
  });

  it("★ PharmIQ entra como candidato aunque la empresa NO coincida (comparten la entidad)", () => {
    const cands = generarCandidatosDesempate(items);
    expect(parEntre(cands, "r1", "r2")).toBe(true);
  });

  it("★ los tres Tesseract entran emparejados (empresa vacía, títulos distintos)", () => {
    const cands = generarCandidatosDesempate(items);
    expect(parEntre(cands, "t1", "t2")).toBe(true);
    expect(parEntre(cands, "t1", "t3")).toBe(true);
    expect(parEntre(cands, "t2", "t3")).toBe(true);
  });

  it("★ un rol sin relación NO se empareja con nadie (la criba es amplia, no absurda)", () => {
    const cands = generarCandidatosDesempate(items);
    expect(cands.some((c) => c.aId === "r9" || c.bId === "r9")).toBe(false);
  });

  it("★ el candidato lleva los DOS textos completos que verá el juez (con sus viñetas)", () => {
    const cands = generarCandidatosDesempate(items);
    const c = cands.find((x) => clave(x.aId, x.bId) === clave("r1", "r2"))!;
    // El juez recibe título+empresa+viñetas de cada lado, no un resumen.
    expect(`${c.aTexto} ${c.bTexto}`).toContain("PharmIQ");
    expect(`${c.aTexto} ${c.bTexto}`).toContain("Químico farmacéutico");
  });

  it("★ un par que YA agrupa el determinista NO se ofrece al juez (no se pregunta lo resuelto)", () => {
    // Dos roles idénticos (misma empresa normalizada + fechas que solapan): el
    // determinista los agrupa, así que el juez no debe recibirlos.
    const clustered = aMaster([
      rol("c1", "Backend Developer", "Acme SpA", "2020 – 2021"),
      rol("c2", "Backend Developer", "Acme", "2020 – 2021"),
      rol("s1", "Data Engineer", "OtraCorp", "2019"),
    ]);
    expect(clustersDeDuplicados(clustered).some((c) => c.kind === "work")).toBe(true);
    const cands = generarCandidatosDesempate(clustered);
    expect(parEntre(cands, "c1", "c2")).toBe(false); // ya resuelto: no se re-pregunta
  });
});

/* ============================================================================
   (b) SIN juez / bordes vacíos → EXACTAMENTE el determinista de hoy
   ============================================================================ */
describe("★ sin juez, el barrido no cambia", () => {
  it("★ juzgarCandidatos con un juez que dice NO a todo → cero bordes", async () => {
    const items = aMaster(volcado());
    const cands = generarCandidatosDesempate(items);
    expect(cands.length).toBeGreaterThan(0); // había candidatos…
    const bordes = await juzgarCandidatos(cands, juezNoATodo);
    expect(bordes).toEqual([]); // …y ninguno se confirmó
  });

  it("★★ duplicadosConDesempate con bordes vacíos == duplicados deterministas", () => {
    const items = aMaster(volcado());
    const det = clustersDeDuplicados(items).length;
    const sinJuez = duplicadosConDesempate(items, {}, []);
    expect(sinJuez).toHaveLength(det); // aquí, 0: no inventa hallazgos sin confirmación
  });
});

/* ============================================================================
   (c) UN SÍ produce hallazgo; un NO no
   ============================================================================ */
describe("★ un veredicto SÍ produce un hallazgo de duplicado", () => {
  it("★ SÍ en (r1,r2) → un hallazgo con los dos, base la versión con FECHA (r1)", async () => {
    const items = aMaster(volcado());
    const cands = generarCandidatosDesempate(items);
    const bordes = await juzgarCandidatos(cands, juezSi([clave("r1", "r2")]));
    expect(bordes.map((b) => clave(b.aId, b.bId))).toContain(clave("r1", "r2"));

    const hallazgos = duplicadosConDesempate(items, {}, bordes);
    const h = hallazgos.find((x) => x.cluster.miembros.some((m) => m.id === "r1"));
    expect(h).toBeDefined();
    expect(h!.cluster.miembros.map((m) => m.id).sort()).toEqual(["r1", "r2"]);
    // ★ EL JUEZ NO REDACTA: la fusión es la determinista (base con fecha + reenganchar).
    expect(h!.fusion.keepId).toBe("r1"); // r1 tiene la fecha real; r2 no
    expect(h!.fusion.dropIds).toEqual(["r2"]);
    expect(h!.fusion.vinetas).toBe("reenganchar");
  });

  it("★ tres SÍ entre los Tesseract → UN hallazgo con los tres (unión transitiva)", async () => {
    const items = aMaster(volcado());
    const cands = generarCandidatosDesempate(items);
    const bordes = await juzgarCandidatos(
      cands,
      juezSi([clave("t1", "t2"), clave("t2", "t3"), clave("t1", "t3")]),
    );
    const hallazgos = duplicadosConDesempate(items, {}, bordes);
    const h = hallazgos.find((x) => x.cluster.miembros.some((m) => m.id === "t1"))!;
    expect(h.cluster.miembros.map((m) => m.id).sort()).toEqual(["t1", "t2", "t3"]);
    expect(h.fusion.keepId).toBe("t1"); // única con rango real de fechas
  });

  it("★ un NO en un par NO genera hallazgo para ese par", async () => {
    const items = aMaster(volcado());
    const cands = generarCandidatosDesempate(items);
    // Solo se confirma PharmIQ; los Tesseract se dicen NO.
    const bordes = await juzgarCandidatos(cands, juezSi([clave("r1", "r2")]));
    const hallazgos = duplicadosConDesempate(items, {}, bordes);
    expect(hallazgos.some((x) => x.cluster.miembros.some((m) => m.id === "t1"))).toBe(false);
    expect(hallazgos.filter((x) => x.tipo === "duplicado")).toHaveLength(1);
  });
});

/* ============================================================================
   (d) ★★ APLICAR un hallazgo del juez NO pierde una sola viñeta
   ============================================================================ */
describe("★★ aplicar un duplicado confirmado por el juez · ni una viñeta se pierde", () => {
  it("★ fusiona los tres Tesseract y reengancha TODAS sus viñetas al que se queda", async () => {
    const profile_items = volcado();
    const items = aMaster(profile_items);
    const cands = generarCandidatosDesempate(items);
    const bordes = await juzgarCandidatos(cands, juezSiATodo);
    const hallazgos = duplicadosConDesempate(items, {}, bordes);

    const antes = new Set(
      profile_items.filter((r) => r.kind === "bullet").map((r) => String((r.data as Row).text ?? "")).filter(Boolean),
    );

    const sb = fakeSb({ profile_items, variant_items: [] });
    const correcciones: Correccion[] = hallazgos.map((h) => ({ tipo: "duplicado", ...h.fusion }));
    const r = await aplicarBarrido(sb, U, correcciones);

    expect(r.bloqueadas).toHaveLength(0);
    expect(r.errores).toHaveLength(0);

    // ── LA PROMESA ── ninguna viñeta con contenido propio se quedó por el camino.
    const despues = new Set(
      profile_items.filter((r) => r.kind === "bullet").map((r) => String((r.data as Row).text ?? "")).filter(Boolean),
    );
    expect([...antes].filter((t) => !despues.has(t))).toEqual([]);
    expect(despues.size).toBe(antes.size);

    // Y toda viñeta cuelga de un rol que EXISTE (ninguna huérfana tras el CASCADE evitado).
    const rolesVivos = new Set(profile_items.filter((r) => r.kind === "work").map((r) => r.id));
    for (const b of profile_items.filter((r) => r.kind === "bullet")) {
      expect(rolesVivos.has(b.parent_id as string)).toBe(true);
    }
  });
});
