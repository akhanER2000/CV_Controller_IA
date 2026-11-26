/* ============================================================================
   DA-PD9 · Importar → .md y «Aceptar todo lo verificado» dejaba las viñetas con
   parent_id NULO: el Master (que cuelga cada viñeta de su rol) contaba 42 y el
   Panel (que cuenta filas) 71.

   El test recorre el camino ENTERO con el parser real: .md → parsearCorpusMd →
   analizarCorpusMd → persistSource → getStaging → batchPlan → promoteStaged, y
   exige que cada viñeta del master apunte al rol bajo el que estaba escrita.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { parsearCorpusMd } from "../src/lib/corpus-md";
import { analizarCorpusMd } from "../src/lib/corpus-md-staging";
import { persistSource } from "../src/lib/db/sources";
import { getStaging, batchPlan, promoteStaged } from "../src/lib/db/queries";

type Fila = Record<string, unknown>;

/** Doble de Supabase en memoria con insert, select y UPDATE reales (filtros eq). */
class FakeDb {
  tablas = new Map<string, Fila[]>();
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

type Op = "select" | "insert" | "update";

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filtros: [string, unknown][] = [];
  private modo: "many" | "single" | "maybe" = "many";
  constructor(private db: FakeDb, private t: string, private op: Op, private payload?: unknown) {}
  eq(col: string, val: unknown) { this.filtros.push([col, val]); return this; }
  select(_c?: string) { return this; }
  order(_c: string, _o?: unknown) { return this; }
  single() { this.modo = "single"; return this; }
  maybeSingle() { this.modo = "maybe"; return this; }
  private ejecutar(): Fila[] {
    const filas = this.db.tabla(this.t);
    if (this.op === "insert") {
      const entrada = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Fila[];
      const nuevas = entrada.map((f) => ({ ...f, id: (f.id as string) ?? this.db.nextId() }));
      filas.push(...nuevas);
      return nuevas;
    }
    const casan = filas.filter((f) => this.filtros.every(([c, v]) => f[c] === v));
    if (this.op === "update") for (const f of casan) Object.assign(f, this.payload as Fila);
    return casan;
  }
  then<R1 = { data: unknown; error: null }, R2 = never>(
    ok?: ((v: { data: unknown; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    bad?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const filas = this.ejecutar();
    const data = this.modo === "many" ? filas : (filas[0] ?? null);
    const res = this.modo === "single" && !filas.length ? { data: null, error: { message: "no rows" } } : { data, error: null };
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
      };
    },
  } as unknown as SupabaseClient;
}

const UID = "user-dapd9";
const MD =
  "# CORPUS · Perfil profesional\nformato: corpus/1\n\n## EXPERIENCIA\n" +
  "### Backend Developer\nempresa: Altiplano\nfechas: 2020 - 2024\n" +
  "- Reduje el TTFB un 40%.\n- Migré la cola de trabajos a Postgres.\n\n" +
  "### Ingeniero de datos\nempresa: Puna Labs\nfechas: 2017 - 2020\n" +
  "- Monté el lago de datos en S3.\n- Bajé el coste de ETL a la mitad.\n- Formé a cuatro analistas en SQL.\n";

async function importar(db: FakeDb) {
  const sb = fakeSb(db);
  const { rows } = analizarCorpusMd(parsearCorpusMd(MD), { etiqueta: "carrera.md" });
  await persistSource(sb, UID, { kind: "paste", originalName: "carrera.md", rawText: MD, status: "extracted" }, rows);
  return sb;
}

/** viñeta del master → título del rol del que cuelga (o null si quedó huérfana). */
function arbol(db: FakeDb): Map<string, string | null> {
  const items = db.tabla("profile_items");
  const out = new Map<string, string | null>();
  for (const b of items.filter((i) => i.kind === "bullet")) {
    const rol = items.find((i) => i.id === b.parent_id && i.kind === "work");
    out.set(String((b.data as Fila).text), rol ? String((rol.data as Fila).title) : null);
  }
  return out;
}

const ESPERADO = new Map<string, string>([
  ["Reduje el TTFB un 40%.", "Backend Developer"],
  ["Migré la cola de trabajos a Postgres.", "Backend Developer"],
  ["Monté el lago de datos en S3.", "Ingeniero de datos"],
  ["Bajé el coste de ETL a la mitad.", "Ingeniero de datos"],
  ["Formé a cuatro analistas en SQL.", "Ingeniero de datos"],
]);

describe("★ DA-PD9 · las viñetas de un .md conservan su rol al aceptarlas", () => {
  it("en staging, cada viñeta ya apunta a su rol (parent_staged_id)", async () => {
    const db = new FakeDb();
    await importar(db);
    const staged = db.tabla("staged_items");
    const vinetas = staged.filter((s) => s.kind === "bullet");
    expect(vinetas).toHaveLength(5);
    for (const v of vinetas) {
      const rol = staged.find((s) => s.id === v.parent_staged_id);
      expect(rol?.kind, `viñeta «${(v.data as Fila).text}» sin rol en staging`).toBe("work");
    }
  });

  it("«Aceptar todo lo verificado»: cada viñeta del master cuelga de SU rol", async () => {
    const db = new FakeDb();
    const sb = await importar(db);
    const plan = batchPlan(await getStaging(sb, UID));
    expect(plan.eligible).toHaveLength(7);
    for (const r of plan.eligible) await promoteStaged(sb, UID, r.id);

    expect(arbol(db)).toEqual(ESPERADO);
    // Master (árbol) y Panel (filas) cuentan lo mismo: no hay viñeta huérfana.
    expect(db.tabla("profile_items")).toHaveLength(7);
    expect(db.tabla("profile_items").filter((i) => i.kind === "work")).toHaveLength(2);
  });

  it("aceptar de a uno sigue igual: la viñeta arrastra a su rol y se enlaza", async () => {
    const db = new FakeDb();
    const sb = await importar(db);
    const vin = db.tabla("staged_items").find((s) => (s.data as Fila).text === "Monté el lago de datos en S3.")!;
    await promoteStaged(sb, UID, vin.id as string);

    const items = db.tabla("profile_items");
    expect(items).toHaveLength(2);
    expect(arbol(db).get("Monté el lago de datos en S3.")).toBe("Ingeniero de datos");
  });
});
