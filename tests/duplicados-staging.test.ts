/* ============================================================================
   §A2 · QUE LA SOSPECHA DE DUPLICADO LLEGUE A LA BASE Y A LA PANTALLA.

   El detector (extract/dedup.ts) ya emparejaba bien, pero su veredicto MORÍA EN
   MEMORIA: ningún writer lo escribía, la cola no lo pintaba y el lote no lo
   respetaba. Estos tests atacan justo ese viaje, y están escritos para ROMPERLO:

     · la marca sobrevive la ingesta en LOS DOS writers (el de Importar y el de
       Fuentes), con el id REAL del otro staged, no con la clave local;
     · la correlación clave→id no depende del orden en que la base devuelva las
       filas insertadas (el test invierte ese orden a propósito);
     · el lote respeta los DOS ejes y cuenta de verdad lo que deja fuera;
     · la fusión ELIGE y no redacta: un valor que no venga de ninguna de las dos
       versiones se rechaza;
     · una merge_proposal vieja, vacía o con otra forma NO revienta la cola.

   El doble de Supabase es mínimo a propósito: una tabla en memoria con el
   subconjunto del builder que estos caminos usan (insert/select/update/delete +
   eq/order/single/maybeSingle). Si el código real empieza a usar algo que el
   doble no tiene, revienta aquí — que es donde queremos enterarnos.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  persistImport,
  getStaging,
  batchPlan,
  resolveDuplicate,
  suspicionOf,
  type StagedItemRow,
} from "../src/lib/db/queries";
import {
  persistSource,
  readMergeProposal,
  mergeProposalFor,
  assignIds,
  stagedRowsFor,
  parentRow,
} from "../src/lib/db/sources";
import type { ImportResult, StagedRow } from "../src/lib/extract/types";

/* ── El doble de Supabase ─────────────────────────────────────────────────── */

type Fila = Record<string, unknown>;

interface Opciones {
  /** devuelve las filas insertadas EN ORDEN INVERSO (nada garantiza el orden) */
  insertReversed?: boolean;
}

class FakeDb {
  tablas = new Map<string, Fila[]>();
  private n = 0;
  constructor(readonly opts: Opciones = {}) {}
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
    return this.filtros.every(([c, v]) => f[c] === v);
  }

  private ejecutar(): unknown {
    const filas = this.db.tabla(this.t);
    if (this.op === "insert") {
      const entrada = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Fila[];
      const nuevas = entrada.map((f) => ({ ...f, id: (f.id as string) ?? this.db.nextId() }));
      filas.push(...nuevas);
      return this.db.opts.insertReversed ? [...nuevas].reverse() : nuevas;
    }
    if (this.op === "update") {
      const tocadas = filas.filter((f) => this.casan(f));
      for (const f of tocadas) Object.assign(f, this.payload as Fila);
      return tocadas;
    }
    if (this.op === "delete") {
      const quedan = filas.filter((f) => !this.casan(f));
      const fuera = filas.filter((f) => this.casan(f));
      this.db.tablas.set(this.t, quedan);
      return fuera;
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
      const data =
        this.modo === "many" ? (this.devolver ? filas : null) : (filas[0] ?? null);
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

/* ── Material de trabajo ──────────────────────────────────────────────────── */

const UID = "user-1";

function work(key: string, title: string, company: string, dup?: StagedRow["duplicate"]): StagedRow {
  return {
    key,
    kind: "work",
    data: { title, company, dates: "2022 – 2023" },
    lang: "es",
    origin: "extracted",
    sourceLabel: "texto pegado",
    evidenceSnippet: `${title} en ${company}`,
    evidenceLevel: "verified",
    evidenceVerified: true,
    ...(dup ? { duplicate: dup } : {}),
  };
}

function bullet(key: string, parentKey: string, text: string): StagedRow {
  return {
    key,
    parentKey,
    kind: "bullet",
    data: { text },
    lang: "es",
    origin: "extracted",
    sourceLabel: "texto pegado",
    evidenceSnippet: text,
    evidenceLevel: "verified",
    evidenceVerified: true,
  };
}

const SOSPECHA: NonNullable<StagedRow["duplicate"]> = {
  otherKey: "w1",
  level: "alta",
  signals: ["misma-empresa", "fechas-solapan"],
  reason: "Puede ser el mismo item: es la misma empresa y las fechas se solapan.",
};

function importResult(staged: StagedRow[]): ImportResult {
  return {
    rawText: "texto crudo",
    sources: ["texto pegado"],
    staged,
    linkedin: [],
    counts: { verified: staged.length, partial: 0, none: 0, api: 0, total: staged.length },
  };
}

const staged = (db: FakeDb) => db.tabla("staged_items");
const porTitulo = (db: FakeDb, titulo: string) =>
  staged(db).find((f) => (f.data as Fila)?.title === titulo)!;

/* ============================================================================
   1 · LA MARCA SOBREVIVE EL VIAJE — en los DOS writers
   ============================================================================ */

describe("persistencia · la sospecha llega a staged_items.merge_proposal", () => {
  it("persistImport escribe la marca con el id REAL del otro staged", async () => {
    const db = new FakeDb();
    await persistImport(fakeSb(db), UID, importResult([
      work("w1", "Scrum Master", "Tesseract"),
      work("w2", "Scrum Master & Tech Lead", "Tesseract", SOSPECHA),
    ]));

    const canonico = porTitulo(db, "Scrum Master");
    const sospechoso = porTitulo(db, "Scrum Master & Tech Lead");

    // el canónico no lleva marca; el que repite, sí — y apunta al canónico
    expect(canonico.merge_proposal).toBeNull();
    const m = readMergeProposal(sospechoso.merge_proposal);
    expect(m).not.toBeNull();
    expect(m!.duplicateOf).toBe(canonico.id);
    expect(m!.level).toBe("alta");
    expect(m!.signals).toEqual(["misma-empresa", "fechas-solapan"]);
    expect(m!.reason).toContain("la misma empresa");
  });

  it("persistSource (el camino de FUENTES) escribe exactamente la misma marca", async () => {
    // El espejo: si el alta desde Fuentes se quedara sin la marca, media ingesta
    // entraría sin el segundo eje y nadie se enteraría hasta ver el CV.
    const db = new FakeDb();
    await persistSource(fakeSb(db), UID, { kind: "pdf", originalName: "CV.pdf" }, [
      work("w1", "Scrum Master", "Tesseract"),
      work("w2", "Scrum Master & Tech Lead", "Tesseract", SOSPECHA),
    ]);

    const m = readMergeProposal(porTitulo(db, "Scrum Master & Tech Lead").merge_proposal);
    expect(m?.duplicateOf).toBe(porTitulo(db, "Scrum Master").id);
    expect(m?.level).toBe("alta");
  });

  it("un import SIN sospechas deja merge_proposal en null explícito (un releer limpia)", async () => {
    const db = new FakeDb();
    await persistImport(fakeSb(db), UID, importResult([work("w1", "Backend Dev", "Altiplano")]));
    expect(staged(db)[0]!.merge_proposal).toBeNull();
  });

  it("la marca sobrevive AUNQUE la base devuelva las filas insertadas en otro orden", async () => {
    /* El fallo que este test persigue: la correlación clave→id se hacía por
       ÍNDICE sobre lo que devolvía el insert, asumiendo un orden que Supabase no
       promete en ningún sitio. Con el orden invertido, la vieja implementación
       colgaba las viñetas del rol equivocado y la sospecha apuntaba a otro item.
       Ahora los uuid se generan antes de insertar, así que el orden da igual. */
    const db = new FakeDb({ insertReversed: true });
    await persistImport(fakeSb(db), UID, importResult([
      work("w1", "Scrum Master", "Tesseract"),
      work("w2", "Scrum Master & Tech Lead", "Tesseract", SOSPECHA),
      bullet("b1", "w1", "Lideré las ceremonias del equipo."),
    ]));

    const canonico = porTitulo(db, "Scrum Master");
    const sospechoso = porTitulo(db, "Scrum Master & Tech Lead");
    const vinneta = staged(db).find((f) => f.kind === "bullet")!;

    expect(readMergeProposal(sospechoso.merge_proposal)?.duplicateOf).toBe(canonico.id);
    expect(vinneta.parent_staged_id).toBe(canonico.id);
  });

  it("getStaging baja merge_proposal Y source_id (sin ellos no hay marca ni filtro)", async () => {
    const db = new FakeDb();
    await persistImport(fakeSb(db), UID, importResult([
      work("w1", "Scrum Master", "Tesseract"),
      work("w2", "Scrum Master & Tech Lead", "Tesseract", SOSPECHA),
    ]));
    // el doble ignora la lista de columnas, así que se comprueba el CONTRATO de
    // la función: lo que devuelve trae las dos piezas pobladas.
    const filas = await getStaging(fakeSb(db), UID);
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => typeof f.source_id === "string" && f.source_id)).toBe(true);
    expect(filas.filter((f) => suspicionOf(f) !== null)).toHaveLength(1);
  });

  it("getStaging con fuente filtra por source_id", async () => {
    const db = new FakeDb();
    const sb = fakeSb(db);
    const a = await persistImport(sb, UID, importResult([work("w1", "Uno", "A")]));
    await persistImport(sb, UID, importResult([work("w2", "Dos", "B")]));
    const soloA = await getStaging(sb, UID, a.sourceId);
    expect(soloA.map((f) => (f.data as Fila).title)).toEqual(["Uno"]);
  });
});

/* ============================================================================
   2 · LECTURA DEFENSIVA — la cola no revienta con lo que ya hay en la base
   ============================================================================ */

describe("readMergeProposal · formas viejas, vacías o ajenas", () => {
  it("null, undefined y tipos que no son objeto → sin sospecha", () => {
    for (const raw of [null, undefined, "", "algo", 7, true, []]) {
      expect(readMergeProposal(raw)).toBeNull();
    }
  });

  it("un objeto sin nivel válido → sin sospecha (no se adivina)", () => {
    expect(readMergeProposal({})).toBeNull();
    expect(readMergeProposal({ fields: { title: "x" } })).toBeNull();
    expect(readMergeProposal({ level: "altísima", reason: "x" })).toBeNull();
    expect(readMergeProposal({ duplicateOf: "abc" })).toBeNull();
  });

  it("con nivel válido lee lo que hay y rellena lo que falta sin inventar", () => {
    const m = readMergeProposal({ level: "media" });
    expect(m).toEqual({ v: 1, duplicateOf: null, level: "media", signals: [], reason: "" });
  });

  it("descarta señales que no son texto y una pareja vacía", () => {
    const m = readMergeProposal({ level: "baja", duplicateOf: "", signals: ["contenido", 3, null] });
    expect(m!.duplicateOf).toBeNull();
    expect(m!.signals).toEqual(["contenido"]);
  });

  it("mergeProposalFor deja duplicateOf en null si la pareja no se pudo resolver", () => {
    // la marca sigue valiendo: el motivo la explica sola.
    const r = work("w2", "X", "Y", SOSPECHA);
    const m = mergeProposalFor(r, new Map());
    expect(m!.duplicateOf).toBeNull();
    expect(m!.reason).toBe(SOSPECHA.reason);
  });
});

/* ============================================================================
   3 · EL LOTE RESPETA LOS DOS EJES
   ============================================================================ */

function fila(over: Partial<StagedItemRow> & { id: string }): StagedItemRow {
  return {
    kind: "work",
    data: {},
    lang: "es",
    evidence_snippet: null,
    evidence_verified: true,
    status: "pending",
    parent_staged_id: null,
    promoted_to: null,
    source_id: "s1",
    merge_proposal: null,
    ...over,
  };
}

const marca = { v: 1, level: "alta", signals: [], reason: "r", duplicateOf: "otro" };

describe("batchPlan · «aceptar todo lo verificado» ya no es la puerta de los duplicados", () => {
  it("un duplicado VERIFICADO queda fuera, y se cuenta", () => {
    const plan = batchPlan([
      fila({ id: "a" }),
      fila({ id: "b", merge_proposal: marca }),
    ]);
    expect(plan.eligible.map((r) => r.id)).toEqual(["a"]);
    expect(plan.excludedDuplicates).toBe(1);
    expect(plan.excludedDoubts).toBe(0);
  });

  it("una duda de clasificación VERIFICADA queda fuera, con su propio conteo", () => {
    const plan = batchPlan([
      fila({ id: "a" }),
      fila({ id: "b", data: { _classDoubt: "skill" } }),
    ]);
    expect(plan.eligible.map((r) => r.id)).toEqual(["a"]);
    expect(plan.excludedDoubts).toBe(1);
    expect(plan.excludedDuplicates).toBe(0);
  });

  it("los dos motivos a la vez se cuentan en los dos: cada frase nombra un motivo real", () => {
    const plan = batchPlan([fila({ id: "a", merge_proposal: marca, data: { _classDoubt: "skill" } })]);
    expect(plan.eligible).toHaveLength(0);
    expect(plan.excludedDuplicates).toBe(1);
    expect(plan.excludedDoubts).toBe(1);
  });

  it("lo NO verificado nunca entra, y no se cuenta como excluido por duplicado", () => {
    const plan = batchPlan([fila({ id: "a", evidence_verified: false, merge_proposal: marca })]);
    expect(plan.eligible).toHaveLength(0);
    expect(plan.excludedDuplicates).toBe(0);
  });

  it("los roles se promueven ANTES que sus viñetas", () => {
    const plan = batchPlan([
      fila({ id: "b1", kind: "bullet" }),
      fila({ id: "w1", kind: "work" }),
      fila({ id: "b2", kind: "bullet" }),
    ]);
    expect(plan.eligible[0]!.kind).toBe("work");
  });

  it("una merge_proposal con forma vieja NO excluye (ni revienta)", () => {
    const plan = batchPlan([fila({ id: "a", merge_proposal: { fields: { title: "x" } } })]);
    expect(plan.eligible.map((r) => r.id)).toEqual(["a"]);
    expect(plan.excludedDuplicates).toBe(0);
  });

  it("los conteos son REALES: 12 marcados dan 12, no un número redondo", () => {
    const filas = Array.from({ length: 20 }, (_, i) =>
      fila({ id: `i${i}`, ...(i < 12 ? { merge_proposal: marca } : {}) }),
    );
    const plan = batchPlan(filas);
    expect(plan.excludedDuplicates).toBe(12);
    expect(plan.eligible).toHaveLength(8);
  });
});

/* ============================================================================
   4 · LA RESOLUCIÓN — la decide el usuario, y la fusión ELIGE
   ============================================================================ */

async function parDuplicado(db = new FakeDb()) {
  const sb = fakeSb(db);
  await persistImport(sb, UID, importResult([
    work("w1", "Scrum Master", "Tesseract"),
    work("w2", "Scrum Master & Tech Lead", "Tesseract", SOSPECHA),
    bullet("b1", "w1", "Lideré las ceremonias del equipo."),
  ]));
  const canonico = porTitulo(db, "Scrum Master");
  const sospechoso = porTitulo(db, "Scrum Master & Tech Lead");
  return { db, sb, canonico, sospechoso };
}

describe("resolveDuplicate · las tres acciones, ninguna automática", () => {
  it("«quedarme con esta» descarta la otra y borra la marca", async () => {
    const { db, sb, canonico, sospechoso } = await parDuplicado();
    const r = await resolveDuplicate(sb, UID, sospechoso.id as string, "keep-this");

    expect(r.kept).toBe(sospechoso.id);
    expect(r.rejected).toBe(canonico.id);
    expect(sospechoso.merge_proposal).toBeNull();
    expect(sospechoso.status).toBe("pending");
    expect(canonico.status).toBe("rejected");
    // la viñeta del descartado se va con él: una viñeta huérfana no se acepta sola
    expect(staged(db).find((f) => f.kind === "bullet")!.status).toBe("rejected");
  });

  it("«quedarme con la otra» descarta ESTA y deja viva la otra", async () => {
    const { sb, canonico, sospechoso } = await parDuplicado();
    const r = await resolveDuplicate(sb, UID, sospechoso.id as string, "keep-other");

    expect(r.kept).toBe(canonico.id);
    expect(sospechoso.status).toBe("rejected");
    expect(canonico.status).toBe("pending");
  });

  it("«fusionar» se queda con lo elegido campo a campo y hereda las viñetas de la otra", async () => {
    // El caso de uso literal de la doctrina: la fecha de una versión con el
    // detalle narrativo de la otra.
    const { db, sb, canonico, sospechoso } = await parDuplicado();
    (canonico.data as Fila).dates = "mar 2022 – dic 2023";

    const r = await resolveDuplicate(sb, UID, sospechoso.id as string, "merge", {
      title: "Scrum Master & Tech Lead", // de ESTA
      company: "Tesseract",
      dates: "mar 2022 – dic 2023", // de LA OTRA
    });

    const d = sospechoso.data as Fila;
    expect(d.title).toBe("Scrum Master & Tech Lead");
    expect(d.dates).toBe("mar 2022 – dic 2023");
    expect(sospechoso.merge_proposal).toBeNull();
    expect(canonico.status).toBe("rejected");
    expect(r.movedBullets).toBe(1);
    // la viñeta pasó al superviviente y NO se descartó con su antiguo rol
    const v = staged(db).find((f) => f.kind === "bullet")!;
    expect(v.parent_staged_id).toBe(sospechoso.id);
    expect(v.status).toBe("pending");
  });

  it("⚠ EL CANDADO: un campo que no viene de NINGUNA de las dos versiones se rechaza", async () => {
    const { sb, sospechoso, canonico } = await parDuplicado();
    await expect(
      resolveDuplicate(sb, UID, sospechoso.id as string, "merge", {
        title: "Director de Ingeniería", // no está en ninguna de las dos
      }),
    ).rejects.toThrow(/no coincide/);
    // y NADA se movió: ni el dato, ni el estado de la otra
    expect((sospechoso.data as Fila).title).toBe("Scrum Master & Tech Lead");
    expect(canonico.status).toBe("pending");
  });

  it("la procedencia (_origin/_level/_source) no se elige: se conserva", async () => {
    const { sb, sospechoso } = await parDuplicado();
    await resolveDuplicate(sb, UID, sospechoso.id as string, "merge", {
      _source: "inventado",
      title: "Scrum Master", // de la otra, legítimo
    });
    expect((sospechoso.data as Fila)._source).toBe("texto pegado");
    expect((sospechoso.data as Fila).title).toBe("Scrum Master");
  });

  it("sin la otra versión en la cola, fusionar y «quedarme con la otra» fallan claro", async () => {
    const { sb, canonico, sospechoso } = await parDuplicado();
    canonico.status = "accepted"; // ya no está pendiente
    await expect(resolveDuplicate(sb, UID, sospechoso.id as string, "merge")).rejects.toThrow(/ya no está/);
    await expect(resolveDuplicate(sb, UID, sospechoso.id as string, "keep-other")).rejects.toThrow(/ya no está/);
  });

  it("«quedarme con esta» SÍ funciona sin pareja: la marca se limpia igual", async () => {
    const { sb, canonico, sospechoso } = await parDuplicado();
    canonico.status = "accepted";
    const r = await resolveDuplicate(sb, UID, sospechoso.id as string, "keep-this");
    expect(r.rejected).toBeNull();
    expect(sospechoso.merge_proposal).toBeNull();
  });

  it("un item ya resuelto no se vuelve a resolver", async () => {
    const { sb, sospechoso } = await parDuplicado();
    sospechoso.status = "accepted";
    await expect(resolveDuplicate(sb, UID, sospechoso.id as string, "keep-this")).rejects.toThrow(
      /no encontrado/,
    );
  });
});

/* ============================================================================
   5 · LOS ARMADORES PUROS
   ============================================================================ */

describe("armado de filas · ids propios y marca resuelta", () => {
  it("assignIds da un id por clave, y el mismo para la misma clave", () => {
    let n = 0;
    const ids = assignIds([work("w1", "A", "X"), work("w1", "A", "X"), work("w2", "B", "Y")], () => `id${++n}`);
    expect(ids.size).toBe(2);
    expect(ids.get("w1")).toBe("id1");
    expect(ids.get("w2")).toBe("id2");
  });

  it("stagedRowsFor resuelve parent_staged_id y duplicateOf con los mismos ids", () => {
    let n = 0;
    const { parents, bullets, keyToId } = stagedRowsFor(
      UID,
      "src1",
      [work("w1", "A", "X"), work("w2", "B", "X", SOSPECHA), bullet("b1", "w1", "hice algo")],
      () => `id${++n}`,
    );
    expect(parents.map((r) => r.id)).toEqual([keyToId.get("w1"), keyToId.get("w2")]);
    expect(bullets[0]!.parent_staged_id).toBe(keyToId.get("w1"));
    expect((parents[1]!.merge_proposal as { duplicateOf: string }).duplicateOf).toBe(keyToId.get("w1"));
    expect(parents[0]!.merge_proposal).toBeNull();
  });

  it("parentRow sin extra sigue siendo la fila de siempre (sin id, con marca nula)", () => {
    const row = parentRow(UID, "src1", work("w1", "A", "X"));
    expect("id" in row).toBe(false);
    expect(row.merge_proposal).toBeNull();
    expect(row.status).toBe("pending");
  });
});
