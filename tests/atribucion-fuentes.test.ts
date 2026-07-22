/* ============================================================================
   BLOQUE A · CADA ÍTEM A SU FUENTE, NINGUNA FUENTE VACÍA EN VERDE, Y EL BUG DE
   «EL FICHERO ESTÁ VACÍO».

   EL HECHO QUE MOTIVA TODO ESTO, medido en la base real: 14 capturas de LinkedIn
   con su transcripción guardada (3.479, 2.711, 2.314… caracteres) y las 14
   diciendo «extraída · 0 ítems», mientras UNA fila de texto pegado de 137.973
   caracteres se llevaba los 83 ítems. La visión funcionó y transcribió. Lo que
   falló fue la ATRIBUCIÓN: el pipeline concatenaba todo, persistImport colgaba
   todos los ítems de una fila kind='paste', y los archivos se insertaban DESPUÉS
   —cuando ya no quedaba nada que colgarles—.

   Estos tests están escritos para ROMPER el arreglo, no para acompañarlo:

     1. El atribuidor es PURO y se ataca con mutantes: una cita que solo está en
        la captura 7 NO puede acabar en «texto pegado», una que está en dos
        fuentes tiene que declarar las dos, y una que no está en ninguna tiene
        que ADMITIRLO en vez de inventarse una procedencia.
     2. El viaje entero por un doble de Supabase en memoria (el patrón de
        tests/duplicados-staging.test.ts): la fila de cada captura tiene SUS
        ítems, con su source_id real, y el enlace viñeta→rol sobrevive aunque
        crucen la frontera entre dos fuentes.
     3. La ruta completa, con dobles: el caso del encargo (dossier pegado + 4
        capturas) reproducido de punta a punta.
     4. CERO ÍTEMS NUNCA EN VERDE: se enumeran TODAS las combinaciones posibles
        y se comprueba que ninguna deja una fuente sin motivo.
     5. Candados estructurales contra la reincidencia: el orden de la ruta (las
        fuentes ANTES que los ítems) y la pantalla pintando el motivo.
     6. El bug de «el fichero está vacío»: los tres desenlaces daban el mismo
        mensaje y acusaban al usuario. Ahora cada uno dice lo suyo — y el camino
        por defecto es el cuerpo del POST, sin rodeo por Storage.
   ============================================================================ */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  construirAtribuidor,
  itemsPorEtiqueta,
  runImport,
  type ImportDeps,
} from "../src/lib/extract/pipeline";
import { persistImport } from "../src/lib/db/queries";
import { causaSinItems, itemsPorFuente, stagedRowsFor } from "../src/lib/db/sources";
import type { ImportResult, StagedRow } from "../src/lib/extract/types";
import type { Extractor } from "../src/lib/extract/llm";
import { fuentes as dictFuentes } from "../src/lib/i18n/dict/fuentes";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = (p: string) => path.join(here, "..", p);
const leer = (p: string) => readFileSync(raiz(p), "utf8");

const RUTA_CONTEXT = "src/app/api/import/context/route.ts";
const RUTA_CORPUS_MD = "src/app/api/import/corpus-md/route.ts";
const PANTALLA_FUENTES = "src/components/screens/FuentesScreen.tsx";

/* ============================================================================
   MATERIAL DE TRABAJO — el caso del encargo, en pequeño
   ============================================================================
   Un dossier pegado + capturas de LinkedIn. Cada texto dice cosas que NO dicen
   los otros: si la atribución se equivocara, no habría forma de que estos tests
   pasaran por casualidad.                                                      */

const DOSSIER =
  "Soy Ana Rivas, ana@ejemplo.cl, vivo en Santiago. " +
  "En el cuestionario conté que reduje el tiempo de cierre contable de nueve a tres días.";

const CAPTURA_1 =
  "Product Manager en Cooperativa Andina · ene 2021 - dic 2023. " +
  "Lideré el rediseño del portal de socios.";

const CAPTURA_2 =
  "Ingeniera de Datos en Minera Atacama · 2018 - 2020. " +
  "Construí el pipeline de telemetría de flota.";

/** Una captura que SÍ se transcribió y de la que no sale ningún ítem. */
const CAPTURA_3 = "Recomendaciones · 4 personas han recomendado a Ana. Ver todas.";

/* ============================================================================
   1 · EL ATRIBUIDOR — puro, determinista, y con mutantes
   ============================================================================ */

describe("construirAtribuidor · una cita es un hecho, y dice de qué documento salió", () => {
  const atr = () =>
    construirAtribuidor([
      { etiqueta: "texto pegado", texto: DOSSIER },
      { etiqueta: "captura-1.png", texto: CAPTURA_1 },
      { etiqueta: "captura-2.png", texto: CAPTURA_2 },
    ]);

  it("★ una cita que SOLO está en la captura 2 se atribuye a la captura 2", () => {
    const a = atr().de("Construí el pipeline de telemetría de flota");
    expect(a.etiqueta).toBe("captura-2.png");
    expect(a.como).toBe("evidencia");
    // El mutante que este assert mata: volver a cablear "texto pegado".
    expect(a.etiqueta).not.toBe("texto pegado");
  });

  it("y la del dossier se queda en el dossier (no se va a la primera captura)", () => {
    const a = atr().de("reduje el tiempo de cierre contable de nueve a tres días");
    expect(a.etiqueta).toBe("texto pegado");
    expect(a.como).toBe("evidencia");
  });

  it("la normalización es la MISMA que la de la evidencia: acentos y espacios dan igual", () => {
    const a = atr().de("LIDERÉ   EL  REDISEÑO DEL PORTAL DE SOCIOS");
    expect(a.etiqueta).toBe("captura-1.png");
    expect(a.como).toBe("evidencia");
  });

  it("★ un texto que está en DOS fuentes las declara las dos: la primera manda, la otra se nombra", () => {
    // El mismo hecho contado por LinkedIn y por el cuestionario es EXACTAMENTE
    // lo que dispara la sospecha de duplicado. Esconderlo sería taparla.
    const a = construirAtribuidor([
      { etiqueta: "cuestionario.md", texto: "Product Manager en Cooperativa Andina, tres años." },
      { etiqueta: "captura-1.png", texto: CAPTURA_1 },
    ]).de("Product Manager en Cooperativa Andina");
    expect(a.etiqueta).toBe("cuestionario.md");
    expect(a.tambien).toEqual(["captura-1.png"]);
  });

  it("★ una cita que no está en NINGUNA fuente lo admite: 'sin-resolver', no una procedencia inventada", () => {
    const a = atr().de("Directora de Ingeniería en una empresa que no aparece en ningún sitio");
    expect(a.como).toBe("sin-resolver");
    expect(a.etiqueta).toBe("texto pegado"); // la fila principal, la que guarda el texto combinado
    expect(a.tambien).toEqual([]);
  });

  it("cae al SIGUIENTE candidato cuando el primero no aparece (la cita falla, el título salva)", () => {
    const a = atr().de("cita que el modelo copió mal", "Minera Atacama");
    expect(a.etiqueta).toBe("captura-2.png");
    expect(a.como).toBe("evidencia");
  });

  it("coincidencia DIFUSA cuando el modelo cita casi bien (mismo umbral que verifyEvidence)", () => {
    // Ni una sola subcadena literal coincide, pero los tokens sí: se atribuye y
    // se DICE que fue difusa, para que la procedencia de la procedencia se vea.
    const a = atr().de("telemetría, pipeline construí de flota el");
    expect(a.etiqueta).toBe("captura-2.png");
    expect(a.como).toBe("difusa");
  });

  it("un texto ridículamente corto no atribuye nada (aparece en cualquier documento)", () => {
    const a = atr().de("de", "en");
    expect(a.como).toBe("sin-resolver");
  });

  it("con UNA sola fuente no se finge una verificación: 'unica'", () => {
    const a = construirAtribuidor([{ etiqueta: "cv.pdf", texto: DOSSIER }]).de("cualquier cosa");
    expect(a).toEqual({ etiqueta: "cv.pdf", como: "unica", tambien: [] });
  });

  it("una fuente sin texto no entra al reparto (no puede aportar nada)", () => {
    const a = construirAtribuidor([
      { etiqueta: "texto pegado", texto: DOSSIER },
      { etiqueta: "vacia.png", texto: "   " },
    ]);
    expect(a.etiquetas).toEqual(["texto pegado"]);
  });
});

/* ============================================================================
   2 · runImport — el pipeline entero, sin LLM ni red
   ============================================================================ */

/** Extractor falso: devuelve ítems cuya evidencia sale de UNA fuente concreta. */
const extractorFalso: Extractor = async () => ({
  basics: {
    name: "Ana Rivas", label: "PM", email: "ana@ejemplo.cl", phone: "", location: "Santiago", links: [],
    summary: "", summaryEvidence: "",
  },
  work: [
    {
      title: "Product Manager", company: "Cooperativa Andina", location: "", dates: "ene 2021 - dic 2023",
      evidence: "Product Manager en Cooperativa Andina",
      bullets: [
        { text: "Lideré el rediseño del portal de socios.", evidence: "Lideré el rediseño del portal de socios" },
        // ⚠ Esta viñeta viene del DOSSIER, no de la captura de la que sale su rol.
        //   Es el caso de uso real (LinkedIn da el puesto, el cuestionario el detalle)
        //   y el que rompe cualquier atribución hecha "por el padre".
        {
          text: "Reduje el cierre contable de nueve a tres días.",
          evidence: "reduje el tiempo de cierre contable de nueve a tres días",
        },
      ],
    },
    {
      title: "Ingeniera de Datos", company: "Minera Atacama", location: "", dates: "2018 - 2020",
      evidence: "Ingeniera de Datos en Minera Atacama",
      bullets: [
        { text: "Construí el pipeline de telemetría de flota.", evidence: "Construí el pipeline de telemetría de flota" },
      ],
    },
  ],
  education: [],
  skills: [{ group: "Ofimática", items: "Trello, Miro", evidence: "no aparece en ningún documento" }],
  projects: [],
});

const deps: ImportDeps = { extract: extractorFalso };

const entrada = {
  pastedText: DOSSIER,
  files: [
    { label: "captura-1.png", text: CAPTURA_1 },
    { label: "captura-2.png", text: CAPTURA_2 },
    { label: "captura-3.png", text: CAPTURA_3 },
  ],
};

describe("runImport · cada ítem vuelve con la fuente de la que salió", () => {
  it("★ el rol de la captura 1 y su viñeta se atribuyen a la captura 1", async () => {
    const r = await runImport(entrada, deps);
    const rol = r.staged.find((s) => s.data.company === "Cooperativa Andina")!;
    expect(rol.sourceLabel).toBe("captura-1.png");
    const vin = r.staged.find((s) => String(s.data.text ?? "").includes("rediseño del portal"))!;
    expect(vin.sourceLabel).toBe("captura-1.png");
  });

  it("★ el rol de la captura 2 y su viñeta, a la captura 2", async () => {
    const r = await runImport(entrada, deps);
    const rol = r.staged.find((s) => s.data.company === "Minera Atacama")!;
    expect(rol.sourceLabel).toBe("captura-2.png");
    const vin = r.staged.find((s) => String(s.data.text ?? "").includes("telemetría de flota"))!;
    expect(vin.sourceLabel).toBe("captura-2.png");
  });

  it("★ una viñeta del DOSSIER no se contagia de la fuente de su rol", async () => {
    const r = await runImport(entrada, deps);
    const rol = r.staged.find((s) => s.data.company === "Cooperativa Andina")!;
    const vin = r.staged.find((s) => String(s.data.text ?? "").includes("cierre contable"))!;
    expect(vin.parentKey).toBe(rol.key); // sigue siendo SU viñeta…
    expect(vin.sourceLabel).toBe("texto pegado"); // …pero salió de otro documento
  });

  it("los datos de contacto van al documento donde está el correo", async () => {
    const r = await runImport(entrada, deps);
    expect(r.staged.find((s) => s.kind === "basics")!.sourceLabel).toBe("texto pegado");
  });

  it("★ NINGÚN ítem se queda con la etiqueta cableada de antes", async () => {
    // El fallo original en una línea: todos los sourceLabel eran "texto pegado".
    const r = await runImport(entrada, deps);
    const etiquetas = new Set(r.staged.map((s) => s.sourceLabel));
    expect(etiquetas.size).toBeGreaterThan(1);
    expect(etiquetas).toContain("captura-1.png");
    expect(etiquetas).toContain("captura-2.png");
  });

  it("lo que no se pudo atribuir cae en la principal Y LO DECLARA (_sourceComo)", async () => {
    const r = await runImport(entrada, deps);
    const skill = r.staged.find((s) => s.kind === "skill" && s.data.group === "Ofimática")!;
    expect(skill.sourceLabel).toBe("texto pegado");
    expect(skill.data._sourceComo).toBe("sin-resolver");
  });

  it("la captura que no aportó nada NO aparece en el reparto: cero es cero", async () => {
    const r = await runImport(entrada, deps);
    const porEtiqueta = itemsPorEtiqueta(r.staged);
    expect(porEtiqueta["captura-3.png"]).toBeUndefined();
    expect(porEtiqueta["captura-1.png"]).toBeGreaterThan(0);
    expect(porEtiqueta["captura-2.png"]).toBeGreaterThan(0);
  });

  it("con UNA sola fuente el staging no se ensucia con metadatos de atribución", async () => {
    const r = await runImport({ pastedText: DOSSIER }, deps);
    expect(r.staged.every((s) => s.sourceLabel === "texto pegado")).toBe(true);
    expect(r.staged.some((s) => "_sourceComo" in s.data)).toBe(false);
  });

  it("el recuento por etiqueta suma exactamente los ítems extraídos", async () => {
    const r = await runImport(entrada, deps);
    const total = Object.values(itemsPorEtiqueta(r.staged)).reduce((a, b) => a + b, 0);
    expect(total).toBe(r.staged.length);
  });
});

/* ============================================================================
   3 · EL DOBLE DE SUPABASE — el viaje a la base
   ============================================================================
   Mínimo a propósito (mismo patrón que tests/duplicados-staging.test.ts): si el
   código real empieza a usar algo que el doble no tiene, revienta aquí.        */

type Fila = Record<string, unknown>;

class FakeDb {
  tablas = new Map<string, Fila[]>();
  /** ruta de Storage → lo que devuelve download(). Ver `descarga`. */
  storage = new Map<string, { data: unknown; error: { message: string } | null }>();
  private n = 0;
  tabla(t: string): Fila[] {
    let r = this.tablas.get(t);
    if (!r) this.tablas.set(t, (r = []));
    return r;
  }
  nextId(): string {
    return `gen-${++this.n}`;
  }
}

type Op = "select" | "insert" | "update" | "delete";

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filtros: [string, unknown][] = [];
  private modo: "many" | "single" | "maybe" = "many";
  private devolver = false;

  constructor(private db: FakeDb, private t: string, private op: Op, private payload?: unknown) {
    if (op === "insert") this.devolver = true;
  }

  eq(col: string, val: unknown) {
    this.filtros.push([col, val]);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filtros.push([`in:${col}`, vals]);
    return this;
  }
  /* getMasterItems EXCLUYE las traducciones con .neq("origin", …) para que no
     reaparezcan como items duplicados en el otro idioma. El doble tiene que
     conocer lo que el código usa de verdad: si le falta un método, el test se
     cae por un hueco del PROPIO doble y parece una regresión del producto. */
  neq(col: string, val: unknown) {
    this.filtros.push([`neq:${col}`, val]);
    return this;
  }
  select(_cols?: string) {
    this.devolver = true;
    return this;
  }
  order(_col: string, _o?: unknown) {
    return this;
  }
  single() {
    this.modo = "single";
    return this;
  }
  maybeSingle() {
    this.modo = "maybe";
    return this;
  }

  private casan(f: Fila): boolean {
    return this.filtros.every(([c, v]) => {
      if (c.startsWith("in:")) return (v as unknown[]).includes(f[c.slice(3)]);
      if (c.startsWith("neq:")) return f[c.slice(4)] !== v;
      return f[c] === v;
    });
  }

  private ejecutar(): unknown {
    const filas = this.db.tabla(this.t);
    if (this.op === "insert") {
      const entrada = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Fila[];
      const nuevas = entrada.map((f) => ({ ...f, id: (f.id as string) ?? this.db.nextId() }));
      filas.push(...nuevas);
      return nuevas;
    }
    if (this.op === "update") {
      const tocadas = filas.filter((f) => this.casan(f));
      for (const f of tocadas) Object.assign(f, this.payload as Fila);
      return tocadas;
    }
    if (this.op === "delete") {
      this.db.tablas.set(this.t, filas.filter((f) => !this.casan(f)));
      return filas.filter((f) => this.casan(f));
    }
    return filas.filter((f) => this.casan(f));
  }

  then<R1 = { data: unknown; error: null }, R2 = never>(
    ok?: ((v: { data: unknown; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    bad?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    let res: { data: unknown; error: { message: string } | null };
    try {
      const filas = this.ejecutar() as Fila[];
      const data = this.modo === "many" ? (this.devolver ? filas : null) : (filas[0] ?? null);
      if (this.modo === "single" && !filas.length) res = { data: null, error: { message: "no rows" } };
      else res = { data, error: null };
    } catch (e) {
      res = { data: null, error: { message: e instanceof Error ? e.message : "err" } };
    }
    return Promise.resolve(res).then(ok ?? undefined, bad ?? undefined);
  }
}

function fakeSb(db: FakeDb): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: { id: UID } } }) },
    storage: {
      from: () => ({
        download: async (p: string) =>
          db.storage.get(p) ?? { data: null, error: { message: `sin objeto en ${p}` } },
      }),
    },
    from(t: string) {
      return {
        select: (c?: string) => new FakeQuery(db, t, "select").select(c),
        insert: (p: unknown) => new FakeQuery(db, t, "insert", p),
        update: (p: unknown) => new FakeQuery(db, t, "update", p),
        delete: () => new FakeQuery(db, t, "delete"),
      };
    },
  } as unknown as SupabaseClient;
}

const UID = "user-1";
const fuentesDe = (db: FakeDb) => db.tabla("ingestion_sources");
const stagedDe = (db: FakeDb) => db.tabla("staged_items");
const fuentePorNombre = (db: FakeDb, nombre: string) =>
  fuentesDe(db).find((f) => f.original_name === nombre);

/* ── persistImport con reparto ─────────────────────────────────────────────── */

function fila(key: string, kind: StagedRow["kind"], data: Fila, etiqueta: string, parentKey?: string): StagedRow {
  return {
    key,
    ...(parentKey ? { parentKey } : {}),
    kind,
    data,
    lang: "es",
    origin: "extracted",
    sourceLabel: etiqueta,
    evidenceSnippet: "cita",
    evidenceLevel: "verified",
    evidenceVerified: true,
  };
}

const resultado = (staged: StagedRow[]): ImportResult => ({
  rawText: "el texto combinado entero",
  sources: ["texto pegado", "captura-1.png"],
  staged,
  linkedin: [],
  counts: { verified: staged.length, partial: 0, none: 0, api: 0, total: staged.length },
});

describe("persistImport · cada ítem cuelga de la FILA de su documento", () => {
  it("★ los ítems de la captura van a la fila de la captura, no a la de texto pegado", async () => {
    const db = new FakeDb();
    const sb = fakeSb(db);
    const mapa = new Map([["captura-1.png", "src-captura-1"]]);
    // la fila de la captura ya existe (la ruta la crea ANTES)
    fuentesDe(db).push({ id: "src-captura-1", user_id: UID, kind: "image", original_name: "captura-1.png" });

    const r = await persistImport(
      sb,
      UID,
      resultado([
        fila("w1", "work", { title: "Product Manager" }, "captura-1.png"),
        fila("s1", "skill", { group: "Ofimática" }, "texto pegado"),
      ]),
      { fuentesPorEtiqueta: mapa },
    );

    const porTitulo = stagedDe(db).find((f) => (f.data as Fila).title === "Product Manager")!;
    expect(porTitulo.source_id).toBe("src-captura-1");
    const skill = stagedDe(db).find((f) => f.kind === "skill")!;
    expect(skill.source_id).toBe(r.sourceId);
    expect(r.sourceId).not.toBe("src-captura-1");
    expect(r.itemsPorFuente).toEqual({ "src-captura-1": 1, [r.sourceId]: 1 });
  });

  it("★ el enlace viñeta→rol sobrevive aunque crucen la frontera entre dos fuentes", async () => {
    const db = new FakeDb();
    const mapa = new Map([["captura-1.png", "src-cap"]]);
    await persistImport(
      fakeSb(db),
      UID,
      resultado([
        fila("w1", "work", { title: "Product Manager" }, "captura-1.png"),
        fila("b1", "bullet", { text: "detalle del cuestionario" }, "texto pegado", "w1"),
      ]),
      { fuentesPorEtiqueta: mapa },
    );

    const rol = stagedDe(db).find((f) => f.kind === "work")!;
    const vin = stagedDe(db).find((f) => f.kind === "bullet")!;
    expect(rol.source_id).toBe("src-cap");
    expect(vin.source_id).not.toBe("src-cap"); // su fuente es la principal…
    expect(vin.parent_staged_id).toBe(rol.id); // …y aun así cuelga de su rol
  });

  it("la fila kind='paste' SIGUE existiendo cuando hubo texto pegado", async () => {
    const db = new FakeDb();
    const r = await persistImport(fakeSb(db), UID, resultado([fila("w1", "work", {}, "texto pegado")]));
    const principal = fuentesDe(db).find((f) => f.id === r.sourceId)!;
    expect(principal.kind).toBe("paste");
    expect(principal.raw_text).toBe("el texto combinado entero");
  });

  it("con `sourceIdPrincipal` NO se crea una fila de texto pegado vacía", async () => {
    // Un volcado que era solo archivos no tiene texto pegado: inventarle una
    // fila sería pintar en Fuentes una tarjeta que no corresponde a nada.
    const db = new FakeDb();
    fuentesDe(db).push({ id: "src-cap", user_id: UID, kind: "image", original_name: "captura-1.png" });
    const r = await persistImport(
      fakeSb(db),
      UID,
      resultado([fila("w1", "work", {}, "captura-1.png")]),
      { fuentesPorEtiqueta: new Map([["captura-1.png", "src-cap"]]), sourceIdPrincipal: "src-cap" },
    );
    expect(r.sourceId).toBe("src-cap");
    expect(fuentesDe(db)).toHaveLength(1);
    expect(fuentesDe(db)[0]!.kind).toBe("image");
  });

  it("SIN opciones se comporta exactamente como siempre (una fuente, todo colgando)", async () => {
    const db = new FakeDb();
    const r = await persistImport(
      fakeSb(db),
      UID,
      resultado([fila("w1", "work", {}, "captura-1.png"), fila("w2", "work", {}, "texto pegado")]),
    );
    expect(fuentesDe(db)).toHaveLength(1);
    expect(stagedDe(db).every((f) => f.source_id === r.sourceId)).toBe(true);
    expect(r.itemsPorFuente).toEqual({ [r.sourceId]: 2 });
  });

  it("una etiqueta sin fila propia (un portfolio) cae en la principal, no se pierde", async () => {
    const db = new FakeDb();
    const r = await persistImport(
      fakeSb(db),
      UID,
      resultado([fila("p1", "project", { name: "sitio" }, "miportfolio.cl")]),
      { fuentesPorEtiqueta: new Map([["captura-1.png", "src-cap"]]) },
    );
    expect(stagedDe(db)[0]!.source_id).toBe(r.sourceId);
    expect(r.staged).toBe(1);
  });
});

describe("stagedRowsFor / itemsPorFuente · el resolutor por fila es puro", () => {
  const filas = [
    fila("w1", "work", { title: "A" }, "captura-1.png"),
    fila("b1", "bullet", { text: "x" }, "texto pegado", "w1"),
  ];
  const resolver = (r: StagedRow) => (r.sourceLabel === "captura-1.png" ? "src-cap" : "src-paste");

  it("cada fila armada lleva el source_id que le toca", () => {
    let n = 0;
    const { parents, bullets } = stagedRowsFor(UID, resolver, filas, () => `id${++n}`);
    expect(parents[0]!.source_id).toBe("src-cap");
    expect(bullets[0]!.source_id).toBe("src-paste");
    expect(bullets[0]!.parent_staged_id).toBe(parents[0]!.id);
  });

  it("un string sigue valiendo: el contrato viejo no se rompe", () => {
    const { parents, bullets } = stagedRowsFor(UID, "src-unico", filas);
    expect(parents[0]!.source_id).toBe("src-unico");
    expect(bullets[0]!.source_id).toBe("src-unico");
  });

  it("itemsPorFuente cuenta de verdad (12 son 12, no un número redondo)", () => {
    const muchas = Array.from({ length: 20 }, (_, i) =>
      fila(`k${i}`, "work", {}, i < 12 ? "captura-1.png" : "texto pegado"),
    );
    expect(itemsPorFuente(muchas, resolver)).toEqual({ "src-cap": 12, "src-paste": 8 });
  });
});

/* ============================================================================
   4 · CERO ÍTEMS NUNCA EN VERDE
   ============================================================================ */

describe("causaSinItems · una fuente vacía SIEMPRE dice por qué", () => {
  it("la lectura reventó → 'no-se-pudo-leer', y no se culpa al archivo del usuario", () => {
    const v = causaSinItems({ items: 0, caracteres: 0, fallo: "fetch failed" })!;
    expect(v.causa).toBe("no-se-pudo-leer");
    expect(v.status).toBe("failed");
    expect(v.motivo).toContain("fetch failed");
    expect(v.motivo).toMatch(/no es un problema de tu archivo/i);
  });

  it("sin texto legible → 'sin-texto', con el aviso de quien lo sabe POR DELANTE", () => {
    const v = causaSinItems({ items: 0, caracteres: 0, aviso: "Imagen ilegible: no se pudo transcribir texto." })!;
    expect(v.causa).toBe("sin-texto");
    expect(v.motivo.startsWith("Imagen ilegible: no se pudo transcribir texto.")).toBe(true);
    // …y nunca SOLO el aviso: un motivo de dos palabras no explica nada.
    expect(v.motivo).toMatch(/no había nada que extraer/i);
    expect(v.status).toBe("failed");
  });

  it("el modelo no respondió y sin texto legible NO son el mismo mensaje", () => {
    // Es la distinción que pedía el encargo: se conserva porque el motivo lo
    // firma extract/files, que es quien sabe cuál de las dos cosas pasó.
    const a = causaSinItems({ items: 0, caracteres: 0, aviso: "Imagen ilegible: no se pudo transcribir texto." })!;
    const b = causaSinItems({ items: 0, caracteres: 0, aviso: "No se pudo transcribir la imagen: 429 quota" })!;
    expect(a.motivo).not.toBe(b.motivo);
    expect(b.motivo).toContain("429");
  });

  it("se leyó y no había nada extraíble → 'sin-items', con la cifra delante y estado 'extracted'", () => {
    const v = causaSinItems({ items: 0, caracteres: 3479 })!;
    expect(v.causa).toBe("sin-items");
    expect(v.status).toBe("extracted"); // extraerse se extrajo: lo que no hubo fue qué proponer
    expect(v.motivo).toContain("3.479");
    expect(v.motivo).toMatch(/no encontró ningún dato de CV/i);
  });

  it("★ NINGUNA combinación con 0 ítems se queda sin motivo (barrido exhaustivo)", () => {
    // Este es el candado de la regla: el mutante «devolver null cuando hay texto»
    // muere aquí, no en producción tres semanas después.
    for (const caracteres of [0, 1, 12, 3479, 137973]) {
      for (const aviso of [null, "", "  ", "un aviso"]) {
        for (const fallo of [null, "", "reventó"]) {
          const v = causaSinItems({ items: 0, caracteres, aviso, fallo });
          expect(v, `sin motivo con ${caracteres}/${aviso}/${fallo}`).not.toBeNull();
          expect(v!.motivo.trim().length, "motivo vacío").toBeGreaterThan(10);
        }
      }
    }
  });

  it("con ítems no hay nada que explicar… salvo que la lectura fallara", () => {
    expect(causaSinItems({ items: 3, caracteres: 100 })).toBeNull();
    // Un fallo se cuenta aunque por otro camino entraran ítems: si reventó,
    // reventó, y el usuario tiene que poder reintentar esa fuente.
    expect(causaSinItems({ items: 3, caracteres: 100, fallo: "timeout" })?.causa).toBe("no-se-pudo-leer");
  });
});

/* ============================================================================
   5 · LA RUTA ENTERA — POST /api/import/context con dobles
   ============================================================================
   Reproduce el caso del encargo: un dossier pegado + capturas. El pipeline y la
   persistencia son los REALES; solo se doblan Supabase, el modelo y la lectura
   de archivos. Si la atribución se rompiera, esto cae.                         */

const h = vi.hoisted(() => ({
  /** nombre de archivo → lo que devuelve extractFile */
  archivos: new Map<string, { text: string; isTranscription: boolean; warning?: string; lanza?: string }>(),
  db: null as unknown,
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.db }));
vi.mock("@/lib/account/byok", () => ({ getUserLlmKey: async () => "clave-del-usuario" }));
vi.mock("@/lib/extract/llm", () => ({
  geminiApiKey: () => "clave-del-servidor",
  makeGeminiExtractor: () => extractorFalso,
}));
vi.mock("@/lib/extract/github", () => ({ fetchGithubUser: async () => ({ staged: [] }) }));
vi.mock("@/lib/extract/web", () => ({ fetchViaJina: async () => "" }));
vi.mock("@/lib/extract/files", () => ({
  extractDepsFor: () => ({}),
  extractFile: async ({ name }: { name: string }) => {
    const f = h.archivos.get(name);
    if (!f) throw new Error(`archivo no preparado: ${name}`);
    if (f.lanza) throw new Error(f.lanza);
    return { text: f.text, isTranscription: f.isTranscription, warning: f.warning };
  },
}));

/* Los dos Route Handlers se importan DESPUÉS de declarar los vi.mock (que vitest
   iza): al cargarse ya reciben el Supabase falso y no tocan next/headers. */
const { POST } = await import("../src/app/api/import/context/route");
const { POST: POST_MD } = await import("../src/app/api/import/corpus-md/route");

async function importar(body: Record<string, unknown>) {
  const req = new Request("http://localhost/api/import/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("POST /api/import/context · el caso del encargo, de punta a punta", () => {
  let db: FakeDb;

  /** La captura ya subida a Storage. Lo que devuelva extractFile lo decide el
   *  doble de arriba: aquí solo tiene que existir el objeto. */
  const enStorage = (p: string) =>
    db.storage.set(p, { data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), error: null });

  beforeEach(() => {
    db = new FakeDb();
    h.db = fakeSb(db);
    for (const i of [1, 2, 3, 4]) enStorage(`${UID}/captura-${i}.png`);
    enStorage(`${UID}/a/captura.png`);
    enStorage(`${UID}/b/captura.png`);
    h.archivos.clear();
    h.archivos.set("captura-1.png", { text: CAPTURA_1, isTranscription: true });
    h.archivos.set("captura-2.png", { text: CAPTURA_2, isTranscription: true });
    h.archivos.set("captura-3.png", { text: CAPTURA_3, isTranscription: true });
    h.archivos.set("captura-4.png", {
      text: "",
      isTranscription: true,
      warning: "Imagen ilegible: no se pudo transcribir texto. No inventamos lo que no se lee.",
    });
  });

  const capturas = [1, 2, 3, 4].map((i) => ({
    path: `${UID}/captura-${i}.png`,
    name: `captura-${i}.png`,
    kind: "image",
  }));

  it("★ cada captura acaba con SUS ítems, no con cero", async () => {
    const { status } = await importar({ text: DOSSIER, files: capturas });
    expect(status).toBe(200);

    const c1 = fuentePorNombre(db, "captura-1.png")!;
    const c2 = fuentePorNombre(db, "captura-2.png")!;
    const items = (id: unknown) => stagedDe(db).filter((f) => f.source_id === id).length;

    expect(items(c1.id)).toBeGreaterThan(0);
    expect(items(c2.id)).toBeGreaterThan(0);
    // Y son ítems DISTINTOS: la captura 1 no se lleva lo de la 2.
    const titulos = (id: unknown) =>
      stagedDe(db).filter((f) => f.source_id === id).map((f) => (f.data as Fila).title);
    expect(titulos(c1.id)).toContain("Product Manager");
    expect(titulos(c2.id)).toContain("Ingeniera de Datos");
    expect(titulos(c1.id)).not.toContain("Ingeniera de Datos");
  });

  it("★ las FILAS de archivo existen ANTES que los ítems: ninguno queda huérfano", async () => {
    await importar({ text: DOSSIER, files: capturas });
    const ids = new Set(fuentesDe(db).map((f) => f.id));
    expect(stagedDe(db).length).toBeGreaterThan(0);
    for (const s of stagedDe(db)) expect(ids.has(s.source_id)).toBe(true);
  });

  it("★ la captura que se leyó y no aportó nada NO queda «extraída» a secas", async () => {
    await importar({ text: DOSSIER, files: capturas });
    const c3 = fuentePorNombre(db, "captura-3.png")!;
    expect(stagedDe(db).filter((f) => f.source_id === c3.id)).toHaveLength(0);
    expect(c3.error).toBeTruthy();
    expect(String(c3.error)).toMatch(/no encontró ningún dato de CV/i);
    // el raw_text SÍ se guardó: el texto del usuario no se pierde por no dar ítems
    expect(c3.raw_text).toBe(CAPTURA_3);
  });

  it("★ la captura ilegible dice que es ilegible, no «extraída · 0 ítems»", async () => {
    await importar({ text: DOSSIER, files: capturas });
    const c4 = fuentePorNombre(db, "captura-4.png")!;
    expect(c4.status).toBe("failed");
    expect(String(c4.error)).toMatch(/ilegible/i);
  });

  it("★ NINGUNA fuente de la ingesta queda con 0 ítems y sin motivo — la regla capital", async () => {
    const { json } = await importar({ text: DOSSIER, files: capturas });
    expect(json.staged).toBeTruthy();
    for (const f of fuentesDe(db)) {
      const n = stagedDe(db).filter((s) => s.source_id === f.id).length;
      if (n === 0) {
        expect(f.error, `fuente ${String(f.original_name)} en verde con 0 ítems`).toBeTruthy();
      }
    }
  });

  it("la respuesta trae el reparto real, fuente por fuente", async () => {
    const { json } = await importar({ text: DOSSIER, files: capturas });
    const fuentes = json.fuentes as { nombre: string; items: number }[];
    const de = (n: string) => fuentes.find((f) => f.nombre === n)!;
    expect(de("captura-1.png").items).toBeGreaterThan(0);
    expect(de("captura-3.png").items).toBe(0);
    expect(de("texto pegado").items).toBeGreaterThan(0);
    // y el total del reparto cuadra con lo que se dice haber stageado
    expect(fuentes.reduce((a, f) => a + f.items, 0)).toBe(json.staged);
  });

  it("dos archivos con el MISMO nombre no se pisan: cada uno conserva sus ítems", async () => {
    h.archivos.set("captura.png", { text: CAPTURA_1, isTranscription: true });
    // extractFile se llama por `name`, así que el segundo devuelve lo mismo…
    // pero cada uno tiene su fila, y la etiqueta única impide que se solapen.
    await importar({
      text: DOSSIER,
      files: [
        { path: `${UID}/a/captura.png`, name: "captura.png", kind: "image" },
        { path: `${UID}/b/captura.png`, name: "captura.png", kind: "image" },
      ],
    });
    const iguales = fuentesDe(db).filter((f) => f.original_name === "captura.png");
    expect(iguales).toHaveLength(2);
    // la segunda no produce ítems propios (su texto ya está atribuido a la primera)
    // pero NINGUNA de las dos se queda en verde sin motivo.
    for (const f of iguales) {
      const n = stagedDe(db).filter((s) => s.source_id === f.id).length;
      if (n === 0) expect(f.error).toBeTruthy();
    }
  });

  it("un volcado SIN texto pegado no inventa una fila de «texto pegado»", async () => {
    await importar({ files: capturas });
    expect(fuentesDe(db).some((f) => f.kind === "paste" && !f.original_name)).toBe(false);
    expect(fuentesDe(db)).toHaveLength(4);
  });

  it("un archivo que revienta al leerse queda 'failed' con el porqué, y el resto entra igual", async () => {
    h.archivos.set("captura-2.png", { text: "", isTranscription: true, lanza: "Storage 503" });
    await importar({ text: DOSSIER, files: capturas });
    const c2 = fuentePorNombre(db, "captura-2.png")!;
    expect(c2.status).toBe("failed");
    expect(String(c2.error)).toContain("Storage 503");
    // y la captura 1 siguió su curso
    const c1 = fuentePorNombre(db, "captura-1.png")!;
    expect(stagedDe(db).filter((f) => f.source_id === c1.id).length).toBeGreaterThan(0);
  });
});

/* ============================================================================
   6 · CANDADOS ESTRUCTURALES — contra la reincidencia exacta
   ============================================================================ */

describe("la ruta crea las fuentes ANTES de persistir los ítems", () => {
  /** El orden, medido sobre un texto cualquiera. Se comparte con el control
   *  positivo de abajo: un candado que no puede fallar no es un candado. */
  const fuentesAntesDeItems = (src: string): boolean => {
    const iFuentes = src.indexOf('sb.from("ingestion_sources").insert(');
    const iPersist = src.indexOf("await persistImport(");
    return iFuentes > -1 && iPersist > -1 && iPersist > iFuentes;
  };

  it("el detector FUNCIONA: con el orden invertido (el bug original) dice que no", () => {
    const bug = 'const r = await persistImport(sb, u, res);\nsb.from("ingestion_sources").insert(filas);';
    expect(fuentesAntesDeItems(bug)).toBe(false);
  });

  it("★ el insert de ingestion_sources va por delante de persistImport", () => {
    // El bug original en una línea de código: persistImport primero, archivos
    // después. Este candado lo impide aunque alguien reordene «por limpieza».
    const src = leer(RUTA_CONTEXT);
    const iFuentes = src.indexOf('sb.from("ingestion_sources").insert(');
    const iPersist = src.indexOf("await persistImport(");
    expect(iFuentes, "no se encontró el insert de fuentes").toBeGreaterThan(0);
    expect(iPersist, "no se encontró la llamada a persistImport").toBeGreaterThan(0);
    expect(iPersist, "los ítems se persisten antes de existir sus fuentes").toBeGreaterThan(iFuentes);
  });

  it("la ruta pregunta por el motivo de toda fuente vacía", () => {
    expect(leer(RUTA_CONTEXT)).toContain("causaSinItems(");
  });

  it("los ids de las fuentes se deciden en el servidor, no se leen del insert", () => {
    // Correlacionar por el orden de vuelta de un insert múltiple es la misma
    // suposición sin contrato que ya costó viñetas colgadas del rol equivocado.
    const src = leer(RUTA_CONTEXT);
    expect(src).toContain("nuevoId()");
  });
});

describe("la pantalla de Fuentes no puede pintar un cero en verde", () => {
  const tsx = leer(PANTALLA_FUENTES);

  it("★ hay una rama para itemsExtracted === 0 que enseña el motivo", () => {
    expect(tsx).toContain("s.itemsExtracted === 0");
    expect(tsx).toContain("fuentes.report.empty");
    expect(tsx).toContain("fuentes.report.emptyUnknown");
  });

  it("el chip de ítems se tiñe cuando es cero", () => {
    expect(tsx).toMatch(/itemsK[^\n]*warn=\{s\.itemsExtracted === 0\}|warn=\{s\.itemsExtracted === 0\}/);
  });

  it("los textos nuevos están en ES y en EN (el producto lo exige)", () => {
    for (const k of ["fuentes.report.empty", "fuentes.report.emptyUnknown"]) {
      expect(dictFuentes.es[k], `${k} sin ES`).toBeTruthy();
      expect(dictFuentes.en[k], `${k} sin EN`).toBeTruthy();
      expect(dictFuentes.es[k]).not.toBe(dictFuentes.en[k]);
    }
    expect(dictFuentes.es["fuentes.report.empty"]).toContain("{msg}");
    expect(dictFuentes.en["fuentes.report.empty"]).toContain("{msg}");
  });
});

/* ============================================================================
   7 · EL BUG DE «EL FICHERO ESTÁ VACÍO» (import/corpus-md)
   ============================================================================
   Tres desenlaces distintos daban el MISMO mensaje, y ese mensaje acusaba al
   usuario de subir un archivo vacío cuando casi siempre el problema era otro.  */

describe("POST /api/import/corpus-md · el texto va en el CUERPO y cada fallo dice lo suyo", () => {
  const src = leer(RUTA_CORPUS_MD);

  it("★ acepta el contrato que la pantalla usa DE VERDAD (texto/nombre/confirmar)", () => {
    // ImportarScreen manda {nombre, texto, confirmar} desde el día uno; la ruta
    // leía {name, text, analizar}. `texto` llegaba como undefined → cadena vacía
    // → «el fichero está vacío». El fichero nunca estuvo vacío.
    expect(src).toContain("body.texto");
    expect(src).toContain("body.nombre");
    expect(src).toContain("body.confirmar");
    // Y el candado de verdad: lo que la pantalla MANDA tiene que estar entre lo
    // que la ruta LEE. Si mañana cambian el nombre de un campo en un lado, esto
    // cae aquí y no en una pantalla que dice «el fichero está vacío».
    const pantalla = leer("src/components/screens/ImportarScreen.tsx");
    const cuerpo = pantalla.slice(pantalla.indexOf('fetch("/api/import/corpus-md"'));
    const camposEnviados = [...cuerpo.matchAll(/^\s*(nombre|texto|name|text|confirmar|analizar|path)\s*[,:]/gm)]
      .map((m) => m[1]!);
    expect(camposEnviados.length, "no se detectó ningún campo enviado").toBeGreaterThan(2);
    for (const campo of new Set(camposEnviados)) {
      expect(src, `la ruta no lee «${campo}», que la pantalla sí manda`).toContain(`body.${campo}`);
    }
  });

  it("★ los tres desenlaces son TRES mensajes distintos", () => {
    const mensajes = [
      /No se pudo leer el archivo del almacenamiento/,
      /bajó sin texto legible desde el almacenamiento/,
      /El fichero está vacío\. Descarga la plantilla/,
    ];
    for (const m of mensajes) expect(src, `falta el mensaje ${m}`).toMatch(m);
  });

  it("el fallo de Storage registra la RUTA y el TAMAÑO esperado", () => {
    expect(src).toContain("blob.size");
    expect(src).toMatch(/ruta «\$\{path\}»/);
  });

  it("un fallo de infraestructura no se devuelve como culpa del usuario (4xx de cliente)", () => {
    // 502: el problema está aguas arriba. Un 400 diría «lo hiciste mal tú».
    expect(src).toMatch(/status:\s*502/);
  });

  it("y la puerta determinista sigue sin pedir clave de IA (no se coló un 503)", () => {
    expect(src).not.toMatch(/status:\s*503/);
    expect(src).not.toMatch(/Falta configurar la clave/);
  });

  it("no se coló ninguna dependencia nueva en la lista cerrada de la puerta", () => {
    const imports = [...src.matchAll(/from\s+["'](@\/[^"']+)["']/g)].map((m) => m[1]!);
    const permitidos = new Set([
      "@/lib/supabase/server",
      "@/lib/db/queries",
      "@/lib/db/sources",
      "@/lib/corpus-md-staging",
      "@/lib/corpus-md",
    ]);
    expect(imports.filter((i) => !permitidos.has(i))).toEqual([]);
  });
});

const CORPUS_MD = [
  "# CORPUS · Perfil profesional",
  "formato: corpus/1",
  "",
  "## EXPERIENCIA",
  "### Product Manager",
  "empresa: Cooperativa Andina",
  "fechas: 2021 - 2023",
  "- Lideré el rediseño del portal de socios.",
  "",
].join("\n");

describe("POST /api/import/corpus-md · funcionando de verdad contra el doble", () => {
  let db: FakeDb;

  const pedir = async (body: Record<string, unknown>) => {
    const req = new Request("http://localhost/api/import/corpus-md", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await POST_MD(req);
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };

  beforeEach(() => {
    db = new FakeDb();
    h.db = fakeSb(db);
  });

  it("★ el .md llega por el CUERPO con los nombres de la pantalla y se analiza sin escribir nada", async () => {
    const { status, json } = await pedir({ nombre: "mi-carrera.md", texto: CORPUS_MD, confirmar: false });
    expect(status).toBe(200);
    expect(json.analizado).toBe(true);
    expect((json.informe as { total: number }).total).toBeGreaterThan(0);
    // «solo analizar» quiere decir SOLO analizar
    expect(fuentesDe(db)).toHaveLength(0);
    expect(stagedDe(db)).toHaveLength(0);
  });

  it("y con confirmar:true entra a staging (nunca al master)", async () => {
    const { json } = await pedir({ nombre: "mi-carrera.md", texto: CORPUS_MD, confirmar: true });
    expect(json.staged).toBeGreaterThan(0);
    expect(fuentesDe(db)).toHaveLength(1);
    expect(db.tabla("profile_items")).toHaveLength(0);
  });

  it("★ un fallo de Storage NO dice «el fichero está vacío»", async () => {
    const { status, json } = await pedir({ path: `${UID}/corpus.md` });
    expect(status).toBe(502);
    expect(String(json.error)).toMatch(/No se pudo leer el archivo del almacenamiento/);
    expect(String(json.error)).not.toMatch(/El fichero está vacío/);
  });

  it("★ un blob que baja sin texto pero pesa bytes acusa a la RUTA, no al archivo", async () => {
    db.storage.set(`${UID}/corpus.md`, {
      data: { size: 4096, text: async () => "" },
      error: null,
    });
    const { status, json } = await pedir({ path: `${UID}/corpus.md` });
    expect(status).toBe(502);
    expect(String(json.error)).toContain("4096 bytes");
    expect(String(json.error)).toContain(`${UID}/corpus.md`);
    expect(String(json.error)).not.toMatch(/El fichero está vacío/);
  });

  it("una subida de 0 bytes lo dice con esas palabras", async () => {
    db.storage.set(`${UID}/corpus.md`, { data: { size: 0, text: async () => "" }, error: null });
    const { json } = await pedir({ path: `${UID}/corpus.md` });
    expect(String(json.error)).toMatch(/0 bytes/);
    expect(String(json.error)).toMatch(/no llegó a completarse/);
  });

  it("y el fichero de verdad vacío SÍ recibe el mensaje de siempre", async () => {
    const { status, json } = await pedir({ texto: "   ", nombre: "vacio.md" });
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/El fichero está vacío/);
  });

  it("la ruta de otro usuario se rechaza antes de tocar Storage", async () => {
    const { status } = await pedir({ path: "otro-usuario/corpus.md" });
    expect(status).toBe(403);
  });
});
