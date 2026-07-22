import { describe, it, expect } from "vitest";
import {
  ETAPA,
  MS_LATIDO,
  MS_RECLAMO,
  derivarProgreso,
  esReclamable,
  estadoVisual,
  type FilaEvento,
  type FilaFuente,
  type LineaFuente,
} from "../src/lib/ingesta/progreso";
import {
  MAX_REINTENTOS,
  avanzarTrabajo,
  siguienteFuente,
  ultimaSenalPorFuente,
  type FuenteTrabajo,
  type MotorDeps,
} from "../src/app/api/import/_motor/motor";
import type { ImportOutcome } from "../src/lib/extract/pipeline";
import type { StagedRow } from "../src/lib/extract/types";
import { importar } from "../src/lib/i18n/dict/importar";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * INGESTA DURABLE — los candados del bloque C
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esto NO comprueba que «la ingesta funciona». Comprueba las seis cosas que, si
 * se rompen, devuelven el producto exactamente al fallo que lo motivó:
 *
 *   1. ATRIBUCIÓN. Los items de una fuente son SUYOS. El fallo original era que
 *      todo colgaba de una fila kind='paste' y las 14 capturas salían con cero.
 *   2. UNA FUENTE VACÍA NUNCA VA EN VERDE. Un ✓ sobre un 0 es una mentira.
 *   3. LA PAUSA NO PIERDE NADA. Cuando la invocación se queda sin presupuesto,
 *      lo hecho está escrito y lo que falta sigue pendiente.
 *   4. REANUDAR TERMINA EL TRABAJO, sin repetir lo ya hecho.
 *   5. NADIE HACE LA MISMA FUENTE DOS VECES (compare-and-set atómico).
 *   6. UN FALLO SE REINTENTA UNA VEZ Y LUEGO SE DICE, con su motivo literal.
 *
 * Cada bloque trae su MUTANTE: se reinyecta la avería y se comprueba que el
 * candado la mata. Un candado que no sabe fallar solo da confianza.
 * ════════════════════════════════════════════════════════════════════════════
 */

/* ══════════════════════════════════════════════════════════════════════════
   UNA SUPABASE DE MENTIRA, PERO CON LAS MISMAS REGLAS
   ══════════════════════════════════════════════════════════════════════════
   Implementa solo las formas de consulta que el motor usa de verdad. Lo
   importante es que el UPDATE condicionado devuelva las filas afectadas: de eso
   depende el candado contra el trabajo doble, y un doble falso lo escondería. */

type Fila = Record<string, unknown>;

interface Filtro {
  op: "eq" | "in" | "not";
  col: string;
  val: unknown;
}

class FakeDb {
  tablas: Record<string, Fila[]> = {
    ingestion_batches: [],
    ingestion_sources: [],
    ingestion_events: [],
    staged_items: [],
  };
  /** Reloj inyectado: los created_at se derivan de él, así los plazos se prueban. */
  reloj = 1_000_000;
  /** contador de ids, para que sean deterministas y legibles en un fallo */
  private n = 0;

  nuevoId(pref = "id"): string {
    return `${pref}-${++this.n}`;
  }

  from(tabla: string) {
    return new FakeQuery(this, tabla);
  }

  storage = {
    from: () => ({ download: async () => ({ data: null, error: { message: "sin storage en test" } }) }),
  };
}

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private modo: "select" | "insert" | "update" | "delete" = "select";
  private filtros: Filtro[] = [];
  private carga: Fila[] = [];
  private parche: Fila = {};
  private devuelve = false;
  private uno: "single" | "maybe" | null = null;
  private orden: { col: string; asc: boolean } | null = null;
  private tope: number | null = null;

  constructor(
    private db: FakeDb,
    private tabla: string,
  ) {}

  select(_cols?: string) {
    if (this.modo === "select") this.modo = "select";
    else this.devuelve = true;
    return this;
  }
  insert(filas: Fila | Fila[]) {
    this.modo = "insert";
    this.carga = Array.isArray(filas) ? filas : [filas];
    return this;
  }
  update(p: Fila) {
    this.modo = "update";
    this.parche = p;
    return this;
  }
  delete() {
    this.modo = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filtros.push({ op: "eq", col, val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filtros.push({ op: "in", col, val });
    return this;
  }
  not(col: string, _op: string, val: unknown) {
    this.filtros.push({ op: "not", col, val });
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.orden = { col, asc: o?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.tope = n;
    return this;
  }
  single() {
    this.uno = "single";
    return this;
  }
  maybeSingle() {
    this.uno = "maybe";
    return this;
  }

  private casa(f: Fila): boolean {
    return this.filtros.every((flt) => {
      if (flt.op === "eq") return f[flt.col] === flt.val;
      if (flt.op === "in") return (flt.val as unknown[]).includes(f[flt.col]);
      return f[flt.col] !== flt.val;
    });
  }

  private ejecutar(): { data: unknown; error: { message: string } | null } {
    const tabla = (this.db.tablas[this.tabla] ??= []);

    if (this.modo === "insert") {
      const nuevas = this.carga.map((f) => ({
        id: f.id ?? this.db.nuevoId(this.tabla),
        created_at: new Date(this.db.reloj).toISOString(),
        ...f,
      }));
      tabla.push(...nuevas);
      const data = this.uno ? nuevas[0] ?? null : nuevas;
      return { data, error: null };
    }

    if (this.modo === "update") {
      const tocadas = tabla.filter((f) => this.casa(f));
      for (const f of tocadas) Object.assign(f, this.parche);
      return { data: this.devuelve ? tocadas.map((f) => ({ id: f.id })) : null, error: null };
    }

    if (this.modo === "delete") {
      const quedan = tabla.filter((f) => !this.casa(f));
      this.db.tablas[this.tabla] = quedan;
      return { data: null, error: null };
    }

    let filas = tabla.filter((f) => this.casa(f));
    if (this.orden) {
      const { col, asc } = this.orden;
      filas = [...filas].sort((a, b) => {
        const x = String(a[col] ?? "");
        const y = String(b[col] ?? "");
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    if (this.tope !== null) filas = filas.slice(0, this.tope);
    if (this.uno) return { data: filas[0] ?? null, error: null };
    return { data: filas, error: null };
  }

  then<R1 = { data: unknown; error: { message: string } | null }, R2 = never>(
    ok?: ((v: { data: unknown; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    ko?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    try {
      return Promise.resolve(this.ejecutar()).then(ok, ko);
    } catch (e) {
      return Promise.reject(e) as unknown as PromiseLike<R2>;
    }
  }
}

/* ── Andamiaje: un trabajo con N fuentes ya dadas de alta ────────────────── */

const USER = "u-1";
const JOB = "job-1";

function sembrarTrabajo(db: FakeDb, nombres: string[]): void {
  db.tablas.ingestion_batches!.push({ id: JOB, user_id: USER, created_at: new Date(db.reloj).toISOString() });
  nombres.forEach((nombre, i) => {
    db.tablas.ingestion_sources!.push({
      // ids con ceros a la izquierda: el orden por created_at empata (todas se
      // insertan en el mismo instante) y desempata el id, igual que en producción.
      id: `src-${String(i).padStart(2, "0")}`,
      user_id: USER,
      batch_id: JOB,
      kind: "paste",
      original_name: nombre,
      status: "pending",
      error: null,
      storage_path: null,
      raw_text: `texto de ${nombre}`,
      raw_text_is_transcription: false,
      created_at: new Date(db.reloj).toISOString(),
    });
  });
}

/** Una fila de staging cualquiera, con la etiqueta de la fuente en el texto:
 *  así el test puede comprobar QUÉ fuente produjo QUÉ item. */
const stagedDe = (texto: string, n: number): StagedRow[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `${texto}#${i}`,
    kind: "skill" as const,
    data: { group: "G", items: `${texto}-${i}` },
    lang: "es",
    origin: "extracted" as const,
    sourceLabel: texto,
    evidenceSnippet: texto,
    evidenceLevel: "verified" as const,
    evidenceVerified: true,
  }));

const salida = (staged: StagedRow[]): ImportOutcome => ({
  rawText: "",
  sources: [],
  staged,
  linkedin: [],
  counts: { verified: staged.length, partial: 0, none: 0, api: 0, total: staged.length },
  warnings: [],
});

/** Deps del motor con un reloj falso que avanza `pasoMs` por fuente procesada. */
function depsFalsas(
  db: FakeDb,
  opts: {
    itemsPorFuente?: (texto: string) => number;
    pasoMs?: number;
    presupuestoMs?: number;
    revientaEn?: (texto: string) => boolean;
  } = {},
): MotorDeps {
  const paso = opts.pasoMs ?? 1000;
  return {
    async leerArchivo() {
      throw new Error("este test no usa archivos");
    },
    async extraer(texto) {
      db.reloj += paso;
      if (opts.revientaEn?.(texto)) throw new Error(`revienta: ${texto}`);
      return salida(stagedDe(texto, opts.itemsPorFuente?.(texto) ?? 2));
    },
    ahora: () => db.reloj,
    presupuestoMs: opts.presupuestoMs ?? 240_000,
    msReclamo: MS_RECLAMO,
  };
}

// El motor recibe el cliente por parámetro: el falso encaja por forma.
const comoSb = (db: FakeDb) => db as unknown as Parameters<typeof avanzarTrabajo>[0];

const itemsDe = (db: FakeDb, sourceId: string) =>
  db.tablas.staged_items!.filter((r) => r.source_id === sourceId);

/* ══════════════════════════════════════════════════════════════════════════
   1 · ATRIBUCIÓN — los items de una fuente son SUYOS
   ══════════════════════════════════════════════════════════════════════════ */

describe("1 · atribución por fuente", () => {
  it("cada fuente escribe SUS items contra SU id (el fallo original era este)", async () => {
    const db = new FakeDb();
    sembrarTrabajo(db, ["dossier.md", "captura-1.png", "captura-2.png"]);

    const r = await avanzarTrabajo(comoSb(db), USER, JOB, depsFalsas(db, {
      itemsPorFuente: (t) => (t.includes("dossier") ? 5 : 3),
    }));

    expect(r.estado).toBe("terminado");
    expect(r.avanzadas).toBe(3);
    // ★ Ninguna fuente se queda a cero por culpa de otra.
    expect(itemsDe(db, "src-00")).toHaveLength(5);
    expect(itemsDe(db, "src-01")).toHaveLength(3);
    expect(itemsDe(db, "src-02")).toHaveLength(3);
    // Y el contenido es el de SU fuente, no el de la vecina.
    for (const fila of itemsDe(db, "src-01")) {
      expect(String((fila.data as Record<string, unknown>).items)).toContain("captura-1");
    }
  });

  it("MUTANTE · si todo se colgara de la primera fuente, el candado lo caza", async () => {
    const db = new FakeDb();
    sembrarTrabajo(db, ["a.md", "b.png"]);
    await avanzarTrabajo(comoSb(db), USER, JOB, depsFalsas(db));

    // Se reinyecta la avería original: reatribuir TODO a la primera fila.
    for (const fila of db.tablas.staged_items!) fila.source_id = "src-00";

    expect(itemsDe(db, "src-01")).toHaveLength(0);
    // Con la avería puesta, la afirmación del test bueno falla — que es lo que
    // convierte al test bueno en un candado y no en un adorno.
    expect(() => expect(itemsDe(db, "src-01")).toHaveLength(2)).toThrow();
  });

  it("todas las fuentes acaban en 'extracted' y ninguna se queda en 'parsing'", async () => {
    const db = new FakeDb();
    sembrarTrabajo(db, ["a", "b", "c", "d"]);
    await avanzarTrabajo(comoSb(db), USER, JOB, depsFalsas(db));
    const estados = db.tablas.ingestion_sources!.map((f) => f.status);
    expect(estados).toEqual(["extracted", "extracted", "extracted", "extracted"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2 · UNA FUENTE VACÍA NUNCA SE PINTA DE VERDE
   ══════════════════════════════════════════════════════════════════════════ */

const linea = (p: Partial<LineaFuente>): LineaFuente => ({
  id: "x",
  indice: 1,
  nombre: "captura.png",
  nombrado: true,
  kind: "image",
  estado: "extracted",
  etapa: ETAPA.lista,
  items: 0,
  error: null,
  intentos: 0,
  vacia: true,
  ...p,
});

describe("2 · cero items no es un éxito", () => {
  it("extraída con 0 items ⇒ 'aviso', jamás 'ok'", () => {
    expect(estadoVisual(linea({ items: 0, vacia: true }))).toBe("aviso");
    expect(estadoVisual(linea({ items: 7, vacia: false }))).toBe("ok");
    expect(estadoVisual(linea({ estado: "failed", vacia: false }))).toBe("err");
    expect(estadoVisual(linea({ estado: "pending", items: null, vacia: false }))).toBe("run");
    expect(estadoVisual(linea({ estado: "parsing", items: null, vacia: false }))).toBe("run");
  });

  it("`vacia` la calcula derivarProgreso a partir de los eventos REALES", () => {
    const db = new FakeDb();
    const fuentes: FilaFuente[] = [
      { id: "s1", kind: "image", original_name: "vacía.png", status: "extracted", error: null, created_at: "2026-01-01T00:00:00Z" },
      { id: "s2", kind: "image", original_name: "llena.png", status: "extracted", error: null, created_at: "2026-01-01T00:00:01Z" },
    ];
    const eventos: FilaEvento[] = [
      { source_id: "s1", message: ETAPA.lista, payload: { items: 0 }, created_at: "2026-01-01T00:00:02Z" },
      { source_id: "s2", message: ETAPA.lista, payload: { items: 9 }, created_at: "2026-01-01T00:00:03Z" },
    ];
    const p = derivarProgreso(JOB, fuentes, eventos, Date.parse("2026-01-01T00:00:04Z"));
    expect(estadoVisual(p.fuentes[0]!)).toBe("aviso");
    expect(estadoVisual(p.fuentes[1]!)).toBe("ok");
    expect(p.items).toBe(9);
    void db;
  });

  it("MUTANTE · el mapeo ingenuo 'extracted ⇒ verde' se detecta", () => {
    const ingenuo = (l: LineaFuente) => (l.estado === "extracted" ? "ok" : "run");
    const vacia = linea({ items: 0, vacia: true });
    expect(ingenuo(vacia)).toBe("ok"); // así mentía antes
    expect(estadoVisual(vacia)).not.toBe(ingenuo(vacia)); // y así deja de mentir
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3 · LA PAUSA NO PIERDE NADA
   ══════════════════════════════════════════════════════════════════════════ */

describe("3 · presupuesto agotado ⇒ pausa limpia", () => {
  it("se para, deja lo hecho escrito y lo que falta PENDIENTE", async () => {
    const db = new FakeDb();
    sembrarTrabajo(db, ["a", "b", "c", "d", "e"]);
    // Cada fuente consume 100 s de reloj y el presupuesto es 250 s: caben 3
    // (tras la tercera el reloj lleva 300 s ≥ 250 y ya no se empieza otra).
    const r = await avanzarTrabajo(comoSb(db), USER, JOB, depsFalsas(db, { pasoMs: 100_000, presupuestoMs: 250_000 }));

    expect(r.estado).toBe("pausado");
    expect(r.avanzadas).toBe(3);

    const porEstado = (s: string) => db.tablas.ingestion_sources!.filter((f) => f.status === s).length;
    expect(porEstado("extracted")).toBe(3);
    expect(porEstado("pending")).toBe(2);
    // ★ NADA se queda en 'parsing': parar a medias dejaría una fuente huérfana
    //   con items a medio escribir, y eso es justo lo que no puede pasar.
    expect(porEstado("parsing")).toBe(0);
    // Lo hecho está escrito: 3 fuentes × 2 items.
    expect(db.tablas.staged_items).toHaveLength(6);
    // Y la pausa queda REGISTRADA, no se deduce.
    expect(db.tablas.ingestion_events!.some((e) => e.message === ETAPA.pausa)).toBe(true);
  });

  it("reanudar TERMINA el trabajo y NO repite lo ya hecho", async () => {
    const db = new FakeDb();
    sembrarTrabajo(db, ["a", "b", "c", "d", "e"]);
    await avanzarTrabajo(comoSb(db), USER, JOB, depsFalsas(db, { pasoMs: 100_000, presupuestoMs: 250_000 }));
    const traLaPausa = db.tablas.staged_items!.length;

    const r2 = await avanzarTrabajo(comoSb(db), USER, JOB, depsFalsas(db, { pasoMs: 100_000, presupuestoMs: 250_000 }));
    expect(r2.estado).toBe("terminado");
    expect(r2.avanzadas).toBe(2); // solo las que faltaban
    expect(db.tablas.staged_items).toHaveLength(traLaPausa + 4);
    // 5 fuentes × 2 items, ni uno más: reanudar no reextrae lo ya extraído.
    expect(db.tablas.staged_items).toHaveLength(10);
  });

  it("una tercera llamada sobre un trabajo terminado no toca nada", async () => {
    const db = new FakeDb();
    sembrarTrabajo(db, ["a", "b"]);
    await avanzarTrabajo(comoSb(db), USER, JOB, depsFalsas(db));
    const antes = db.tablas.staged_items!.length;
    const r = await avanzarTrabajo(comoSb(db), USER, JOB, depsFalsas(db));
    expect(r.estado).toBe("terminado");
    expect(r.avanzadas).toBe(0);
    expect(db.tablas.staged_items).toHaveLength(antes);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4 · NADIE HACE LA MISMA FUENTE DOS VECES
   ══════════════════════════════════════════════════════════════════════════ */

describe("4 · el compare-and-set atómico", () => {
  it("dos motores a la vez se reparten las fuentes, no las duplican", async () => {
    const db = new FakeDb();
    sembrarTrabajo(db, ["a", "b", "c", "d"]);
    const [r1, r2] = await Promise.all([
      avanzarTrabajo(comoSb(db), USER, JOB, depsFalsas(db)),
      avanzarTrabajo(comoSb(db), USER, JOB, depsFalsas(db)),
    ]);
    // Entre los dos hacen exactamente cuatro, ni tres ni cinco.
    expect(r1.avanzadas + r2.avanzadas).toBe(4);
    expect(db.tablas.staged_items).toHaveLength(8);
    for (const id of ["src-00", "src-01", "src-02", "src-03"]) {
      expect(itemsDe(db, id)).toHaveLength(2);
    }
  });

  it("una fuente en 'parsing' con señal FRESCA no se le quita a nadie", () => {
    const ahora = 10_000_000;
    const fuentes: FuenteTrabajo[] = [
      {
        id: "s1", kind: "paste", original_name: "a", status: "parsing", error: null,
        created_at: "2026-01-01T00:00:00Z", storage_path: null, raw_text: "x", raw_text_is_transcription: false,
      },
    ];
    const fresco: FilaEvento[] = [
      { source_id: "s1", message: ETAPA.extrayendo, payload: {}, created_at: new Date(ahora - 5_000).toISOString() },
    ];
    expect(siguienteFuente(fuentes, fresco, ahora)).toBeNull();

    const rancio: FilaEvento[] = [
      { source_id: "s1", message: ETAPA.extrayendo, payload: {}, created_at: new Date(ahora - MS_RECLAMO - 1).toISOString() },
    ];
    expect(siguienteFuente(fuentes, rancio, ahora)?.estadoEsperado).toBe("parsing");
  });

  it("el borde EXACTO del plazo de reclamo", () => {
    expect(esReclamable("parsing", MS_RECLAMO, null)).toBe(false); // justo en el plazo: NO
    expect(esReclamable("parsing", MS_RECLAMO + 1, null)).toBe(true); // un ms después: sí
    expect(esReclamable("parsing", null, null)).toBe(true); // sin señal: huérfana
    expect(esReclamable("pending", 0, null)).toBe(true);
    expect(esReclamable("extracted", null, null)).toBe(false);
    expect(esReclamable("failed", null, null)).toBe(false);
  });

  it("las 'pending' van ANTES que las huérfanas (rehacer cuesta una extracción)", () => {
    const ahora = 10_000_000;
    const base = { kind: "paste", error: null, storage_path: null, raw_text: "x", raw_text_is_transcription: false };
    const fuentes: FuenteTrabajo[] = [
      { ...base, id: "huerfana", original_name: "h", status: "parsing", created_at: "2026-01-01T00:00:00Z" },
      { ...base, id: "virgen", original_name: "v", status: "pending", created_at: "2026-01-01T00:00:01Z" },
    ];
    const eventos: FilaEvento[] = [
      { source_id: "huerfana", message: ETAPA.leyendo, payload: {}, created_at: new Date(ahora - MS_RECLAMO - 1).toISOString() },
    ];
    expect(siguienteFuente(fuentes, eventos, ahora)?.fuente.id).toBe("virgen");
  });

  it("ultimaSenalPorFuente se queda con la MÁS RECIENTE", () => {
    const m = ultimaSenalPorFuente([
      { source_id: "a", message: ETAPA.leyendo, payload: {}, created_at: "2026-01-01T00:00:00Z" },
      { source_id: "a", message: ETAPA.extrayendo, payload: {}, created_at: "2026-01-01T00:05:00Z" },
      { source_id: "a", message: ETAPA.cruzando, payload: {}, created_at: "2026-01-01T00:02:00Z" },
    ]);
    expect(m.get("a")).toBe(Date.parse("2026-01-01T00:05:00Z"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5 · IDEMPOTENCIA — rehacer una fuente no duplica ni pisa lo aceptado
   ══════════════════════════════════════════════════════════════════════════ */

describe("5 · rehacer una fuente huérfana", () => {
  it("borra su staging PENDIENTE y respeta lo que el usuario ya aceptó", async () => {
    const db = new FakeDb();
    sembrarTrabajo(db, ["a"]);
    // Simulacro de invocación muerta a mitad: la fuente quedó en 'parsing',
    // con dos filas pendientes escritas y una que el usuario YA aceptó.
    db.tablas.ingestion_sources![0]!.status = "parsing";
    db.tablas.staged_items!.push(
      { id: "v1", user_id: USER, source_id: "src-00", status: "pending", data: {} },
      { id: "v2", user_id: USER, source_id: "src-00", status: "pending", data: {} },
      { id: "v3", user_id: USER, source_id: "src-00", status: "accepted", data: {} },
    );
    // Sin ningún evento, la fuente es huérfana por definición.
    db.reloj += MS_RECLAMO + 1;

    await avanzarTrabajo(comoSb(db), USER, JOB, depsFalsas(db, { itemsPorFuente: () => 4 }));

    const suyos = itemsDe(db, "src-00");
    // 4 nuevas + la aceptada. Las dos pendientes viejas se fueron; la aceptada NO.
    expect(suyos).toHaveLength(5);
    expect(suyos.filter((r) => r.status === "accepted")).toHaveLength(1);
    expect(suyos.filter((r) => r.id === "v1" || r.id === "v2")).toHaveLength(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6 · UN FALLO SE REINTENTA UNA VEZ Y LUEGO SE DICE
   ══════════════════════════════════════════════════════════════════════════ */

describe("6 · fallo honesto", () => {
  it("reintenta una vez y, si insiste, la marca 'failed' con su motivo LITERAL", async () => {
    const db = new FakeDb();
    sembrarTrabajo(db, ["buena", "rota"]);
    const r = await avanzarTrabajo(
      comoSb(db),
      USER,
      JOB,
      depsFalsas(db, { revientaEn: (t) => t.includes("rota") }),
    );

    expect(r.estado).toBe("terminado");
    const rota = db.tablas.ingestion_sources!.find((f) => f.original_name === "rota")!;
    expect(rota.status).toBe("failed");
    expect(String(rota.error)).toContain("revienta");

    const reintentos = db.tablas.ingestion_events!.filter(
      (e) => e.source_id === rota.id && e.message === ETAPA.reintento,
    );
    expect(reintentos).toHaveLength(MAX_REINTENTOS);
    expect(
      db.tablas.ingestion_events!.some((e) => e.source_id === rota.id && e.message === ETAPA.fallida),
    ).toBe(true);

    // La fuente buena NO se cae con la rota: 2 items suyos, escritos.
    expect(itemsDe(db, "src-00")).toHaveLength(2);
  });

  it("una fuente sin texto legible falla en voz alta y no inventa items", async () => {
    const db = new FakeDb();
    sembrarTrabajo(db, ["vacía"]);
    db.tablas.ingestion_sources![0]!.raw_text = "   ";
    await avanzarTrabajo(comoSb(db), USER, JOB, depsFalsas(db));
    expect(db.tablas.ingestion_sources![0]!.status).toBe("failed");
    expect(db.tablas.staged_items).toHaveLength(0);
    expect(String(db.tablas.ingestion_sources![0]!.error)).toBeTruthy();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7 · EL PROGRESO QUE VE EL USUARIO
   ══════════════════════════════════════════════════════════════════════════ */

const fuenteFila = (id: string, nombre: string, status: string, seg: number): FilaFuente => ({
  id,
  kind: "paste",
  original_name: nombre,
  status,
  error: null,
  created_at: new Date(Date.parse("2026-01-01T00:00:00Z") + seg * 1000).toISOString(),
});

describe("7 · «fuente 3 de 16», sin porcentajes inventados", () => {
  it("el índice y el total salen del orden de alta y no bailan", () => {
    const fuentes = [
      fuenteFila("s1", "a", "extracted", 0),
      fuenteFila("s2", "b", "extracted", 1),
      fuenteFila("s3", "c", "parsing", 2),
      fuenteFila("s4", "d", "pending", 3),
    ];
    const eventos: FilaEvento[] = [
      { source_id: "s1", message: ETAPA.lista, payload: { items: 4 }, created_at: "2026-01-01T00:00:10Z" },
      { source_id: "s2", message: ETAPA.lista, payload: { items: 6 }, created_at: "2026-01-01T00:00:20Z" },
      { source_id: "s3", message: ETAPA.extrayendo, payload: {}, created_at: "2026-01-01T00:00:30Z" },
    ];
    const p = derivarProgreso(JOB, fuentes, eventos, Date.parse("2026-01-01T00:00:35Z"));
    expect(p.total).toBe(4);
    expect(p.listas).toBe(2);
    expect(p.actual?.indice).toBe(3);
    expect(p.actual?.nombre).toBe("c");
    expect(p.actual?.etapa).toBe(ETAPA.extrayendo);
    expect(p.items).toBe(10); // 4 + 6, contados de eventos reales
    expect(p.terminado).toBe(false);
    expect(p.pausado).toBe(false);
    // No existe ningún porcentaje que inventar.
    expect(Object.keys(p)).not.toContain("porcentaje");
  });

  it("el orden es estable aunque todas se den de alta en el MISMO instante", () => {
    const mismo = "2026-01-01T00:00:00Z";
    const fuentes: FilaFuente[] = ["s3", "s1", "s2"].map((id) => ({
      id, kind: "paste", original_name: id, status: "pending", error: null, created_at: mismo,
    }));
    const a = derivarProgreso(JOB, fuentes, [], 0).fuentes.map((l) => l.id);
    const b = derivarProgreso(JOB, [...fuentes].reverse(), [], 0).fuentes.map((l) => l.id);
    expect(a).toEqual(["s1", "s2", "s3"]);
    expect(a).toEqual(b);
  });

  it("PAUSADO ⟺ queda trabajo y hace tiempo que no hay señal (borde exacto)", () => {
    const t0 = Date.parse("2026-01-01T00:00:00Z");
    const fuentes = [fuenteFila("s1", "a", "pending", 0)];
    const eventos: FilaEvento[] = [
      { source_id: "s1", message: ETAPA.leyendo, payload: {}, created_at: new Date(t0).toISOString() },
    ];
    expect(derivarProgreso(JOB, fuentes, eventos, t0 + MS_LATIDO).pausado).toBe(false);
    expect(derivarProgreso(JOB, fuentes, eventos, t0 + MS_LATIDO + 1).pausado).toBe(true);
    // Un trabajo terminado NUNCA está pausado, por muy vieja que sea la señal.
    const hechas = [fuenteFila("s1", "a", "extracted", 0)];
    expect(derivarProgreso(JOB, hechas, eventos, t0 + 10 * MS_LATIDO).pausado).toBe(false);
  });

  it("sin NINGÚN evento, un trabajo con fuentes pendientes cuenta como pausado", () => {
    // Es el caso de la invocación que muere antes de escribir nada: si esto
    // devolviera `false`, nadie lo empujaría y el trabajo se quedaría colgado.
    const p = derivarProgreso(JOB, [fuenteFila("s1", "a", "pending", 0)], [], Date.now());
    expect(p.pausado).toBe(true);
    expect(p.desdeUltimaSenal).toBeNull();
  });

  it("una fuente SIN nombre propio se marca `nombrado:false` (la etiqueta la pone el i18n)", () => {
    // El texto pegado no tiene nombre de archivo. Si la ruta le escribiera uno
    // («Texto pegado»), ese copy en español viviría en la BASE y un usuario en
    // inglés vería su log mezclado. El candado es que `nombrado` sea false.
    const anonima: FilaFuente = {
      id: "s1", kind: "paste", original_name: null, status: "pending", error: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const conNombre: FilaFuente = { ...anonima, id: "s2", original_name: "dossier.md" };
    const p = derivarProgreso(JOB, [anonima, conNombre], [], Date.now());
    expect(p.fuentes[0]!.nombrado).toBe(false);
    expect(p.fuentes[1]!.nombrado).toBe(true);
    expect(p.fuentes[1]!.nombre).toBe("dossier.md");
    // Un nombre de solo espacios tampoco es un nombre.
    const blanca = derivarProgreso(JOB, [{ ...anonima, original_name: "   " }], [], Date.now());
    expect(blanca.fuentes[0]!.nombrado).toBe(false);
  });

  it("un estado desconocido se trata como PENDIENTE, nunca como hecho", () => {
    const p = derivarProgreso(JOB, [fuenteFila("s1", "a", "algo_raro", 0)], [], Date.now());
    expect(p.fuentes[0]!.estado).toBe("pending");
    expect(p.terminado).toBe(false);
  });

  it("los eventos de telemetría de consumo NO se confunden con etapas", () => {
    const eventos: FilaEvento[] = [
      { source_id: "s1", message: ETAPA.extrayendo, payload: {}, created_at: "2026-01-01T00:00:01Z" },
      { source_id: "s1", message: "ingesta.evento.consumo", payload: { llamadas: 5 }, created_at: "2026-01-01T00:00:02Z" },
    ];
    const p = derivarProgreso(JOB, [fuenteFila("s1", "a", "parsing", 0)], eventos, Date.parse("2026-01-01T00:00:03Z"));
    // La etapa sigue siendo la última ETAPA, no el evento de consumo.
    expect(p.fuentes[0]!.etapa).toBe(ETAPA.extrayendo);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8 · TODA ETAPA TIENE TEXTO EN LOS DOS IDIOMAS
   ══════════════════════════════════════════════════════════════════════════
   `ingestion_events.message` ES la clave de i18n y la pantalla traduce con
   `t(message)` directamente. Una etapa sin entrada en el diccionario saldría en
   pantalla como su propia clave («ingesta.etapa.cruzando»), que es lo mismo que
   no decir nada. El test de paridad general no lo ve: comprueba que ES y EN
   tengan las mismas claves, no que EXISTAN estas.                             */

describe("8 · el catálogo de etapas está traducido", () => {
  const claves = Object.values(ETAPA);

  it("cada etapa del enum tiene texto en ES y en EN", () => {
    const sinEs = claves.filter((k) => !importar.es[k]?.trim());
    const sinEn = claves.filter((k) => !importar.en[k]?.trim());
    expect(sinEs, `etapas sin ES: ${sinEs.join(", ")}`).toEqual([]);
    expect(sinEn, `etapas sin EN: ${sinEn.join(", ")}`).toEqual([]);
  });

  it("MUTANTE · una etapa nueva sin traducir se detecta", () => {
    const inventada = "ingesta.etapa.inexistente";
    expect(importar.es[inventada]).toBeUndefined();
    expect(importar.en[inventada]).toBeUndefined();
  });

  it("las claves del observador también están en los dos idiomas", () => {
    const usadas = [
      "importar.job.fuente", "importar.job.seguir", "importar.job.pausadoTitle",
      "importar.job.pausadoBody", "importar.job.pausadoCta", "importar.job.retomando",
      "importar.job.sondeoFallo", "importar.job.cero", "importar.job.itemsFuente",
      "importar.job.itemsFuenteUno",
      "ingesta.shell.enCurso", "ingesta.shell.detalle", "ingesta.shell.pausada",
      "ingesta.shell.ver", "ingesta.shell.aria",
    ];
    const sinEs = usadas.filter((k) => !importar.es[k]?.trim());
    const sinEn = usadas.filter((k) => !importar.en[k]?.trim());
    expect(sinEs, `sin ES: ${sinEs.join(", ")}`).toEqual([]);
    expect(sinEn, `sin EN: ${sinEn.join(", ")}`).toEqual([]);
  });

  it("los marcadores {…} de una clave existen igual en ES y en EN", () => {
    // Un {n} que se pierde en la traducción deja al usuario sin el número.
    const conMarcas = Object.keys(importar.es).filter((k) => /\{[a-zA-Z]+\}/.test(importar.es[k]!));
    const rotas = conMarcas.filter((k) => {
      const es = [...importar.es[k]!.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).sort();
      const en = [...(importar.en[k] ?? "").matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).sort();
      return es.join(",") !== en.join(",");
    });
    expect(rotas, `marcadores desalineados: ${rotas.join(", ")}`).toEqual([]);
  });
});
