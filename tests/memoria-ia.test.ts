import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  construirMemoria,
  esAnthropic,
  mensajesConMemoria,
  obtenerMemoria,
  usoDe,
  type ItemMemoria,
} from "../src/lib/ai/memoria";

/* Memoria del perfil (DA-M2): determinista, con huella, reutilizada si no cambia,
   y con cache_control SOLO cuando el modelo es de Anthropic. */

const item = (over: Partial<ItemMemoria> & { id: string; kind: string }): ItemMemoria => ({
  parentId: null,
  data: {},
  evidenceSnippet: null,
  evidenceVerified: false,
  sortOrder: 0,
  ...over,
});

const MASTER: ItemMemoria[] = [
  item({ id: "b1", kind: "basics", data: { name: "Ana Pérez", photo: "data:image/png;base64,AAA", email: "ana@x.io" } }),
  item({ id: "w1", kind: "work", sortOrder: 1, data: { company: "Acme", title: "Backend", start: "2021-03", end: "2024-01" } }),
  item({
    id: "u1",
    kind: "bullet",
    parentId: "w1",
    sortOrder: 0,
    data: { text: "Bajé la latencia p99 de 850 ms a 120 ms con Kafka" },
    evidenceSnippet: "latencia p99 de 850 ms a 120 ms",
    evidenceVerified: true,
  }),
  item({
    id: "u2",
    kind: "bullet",
    parentId: "w1",
    sortOrder: 1,
    data: { text: "Lideré un equipo de 6" },
    evidenceSnippet: "texto no verificado",
    evidenceVerified: false,
  }),
  item({ id: "s1", kind: "summary", data: { text: "Ingeniera backend." } }),
];

describe("construirMemoria", () => {
  it("misma entrada ⇒ misma huella (y mismos bytes), en cualquier orden", () => {
    const a = construirMemoria(MASTER);
    const b = construirMemoria([...MASTER].reverse());
    const c = construirMemoria(MASTER.map((m) => ({ ...m, data: Object.fromEntries(Object.entries(m.data).reverse()) })));
    expect(b.huella).toBe(a.huella);
    expect(b.contenido).toBe(a.contenido);
    expect(c.huella).toBe(a.huella);
    expect(a.items).toBe(5);
    expect(a.tokensAprox).toBeGreaterThan(0);
  });

  it("cambiar un item cambia la huella", () => {
    const a = construirMemoria(MASTER);
    const cambiado = MASTER.map((m) => (m.id === "u1" ? { ...m, data: { text: "Bajé la latencia p99 de 850 ms a 110 ms con Kafka" } } : m));
    expect(construirMemoria(cambiado).huella).not.toBe(a.huella);
    // y quitar uno, también
    expect(construirMemoria(MASTER.slice(1)).huella).not.toBe(a.huella);
  });

  it("serializa canónico: hijos bajo su padre, evidencia SOLO verificada, sin imágenes", () => {
    const { contenido } = construirMemoria(MASTER);
    const lineas = contenido.split("\n");
    const iw = lineas.findIndex((l) => l.startsWith("[w1] work"));
    expect(lineas[iw + 1]).toMatch(/^ {2}\[u1\] bullet · text: Bajé/);
    expect(lineas[iw + 2]).toMatch(/^ {2}\[u2\] bullet/);
    expect(contenido).toContain("evidencia✓ «latencia p99 de 850 ms a 120 ms»");
    expect(contenido).not.toContain("texto no verificado");
    expect(contenido).not.toContain("base64");
    // basics y summary antes que work
    expect(contenido.indexOf("[b1]")).toBeLessThan(contenido.indexOf("[s1]"));
    expect(contenido.indexOf("[s1]")).toBeLessThan(contenido.indexOf("[w1]"));
    // los campos clave en orden: company antes que start
    expect(lineas[iw]).toMatch(/title: Backend · company: Acme · start: 2021-03 · end: 2024-01/);
  });

  it("nada volátil en el contenido: dos construcciones en momentos distintos dan los mismos bytes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01"));
    const a = construirMemoria(MASTER).contenido;
    vi.setSystemTime(new Date("2027-06-01"));
    const b = construirMemoria(MASTER).contenido;
    vi.useRealTimers();
    expect(b).toBe(a);
  });
});

/** Un Supabase de mentira para ai_memoria: registra cada upsert. */
function sbFalso(fila: Record<string, unknown> | null, opts: { errorLectura?: boolean } = {}) {
  const upserts: Record<string, unknown>[] = [];
  const sb = {
    from(tabla: string) {
      expect(tabla).toBe("ai_memoria");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              opts.errorLectura ? { data: null, error: { message: "relation ai_memoria does not exist" } } : { data: fila, error: null },
          }),
        }),
        upsert: async (row: Record<string, unknown>) => {
          upserts.push(row);
          return { error: null };
        },
      };
    },
  };
  return { sb: sb as never, upserts };
}

describe("obtenerMemoria", () => {
  const leerMaster = async () => MASTER;

  it("sin cambios NO se reconstruye (no hay upsert)", async () => {
    const huella = construirMemoria(MASTER).huella;
    const { sb, upserts } = sbFalso({ huella, actualizada_en: "2026-11-01T00:00:00.000Z", ultima_llamada: null });
    const m = await obtenerMemoria(sb, "u", {}, { leerMaster });
    expect(m.reconstruida).toBe(false);
    expect(m.persistida).toBe(true);
    expect(m.actualizadaEn).toBe("2026-11-01T00:00:00.000Z");
    expect(upserts).toHaveLength(0);
  });

  it("si la huella cambió, se reescribe una vez", async () => {
    const { sb, upserts } = sbFalso({ huella: "otra", actualizada_en: "2026-11-01T00:00:00.000Z" });
    const m = await obtenerMemoria(sb, "u", {}, { leerMaster, ahora: () => new Date("2026-11-26T10:00:00Z") });
    expect(m.reconstruida).toBe(true);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ user_id: "u", huella: m.huella, items: 5, actualizada_en: "2026-11-26T10:00:00.000Z" });
  });

  it("«Reconstruir memoria» (forzar) reescribe aunque la huella coincida", async () => {
    const huella = construirMemoria(MASTER).huella;
    const { sb, upserts } = sbFalso({ huella, actualizada_en: "2026-11-01T00:00:00.000Z" });
    const m = await obtenerMemoria(sb, "u", { forzar: true }, { leerMaster });
    expect(m.reconstruida).toBe(true);
    expect(upserts).toHaveLength(1);
  });

  it("sin la 0010 degrada: memoria al vuelo, persistida:false, sin lanzar", async () => {
    const { sb, upserts } = sbFalso(null, { errorLectura: true });
    const m = await obtenerMemoria(sb, "u", {}, { leerMaster });
    expect(m.persistida).toBe(false);
    expect(m.contenido).toContain("[w1]");
    expect(upserts).toHaveLength(0);
  });
});

describe("mensajesConMemoria", () => {
  const args = { memoria: "MEMORIA", sistema: "INSTRUCCIONES", usuario: "AVISO" };

  it("con Anthropic, la memoria es el PRIMER bloque del system y lleva cache_control", () => {
    const { instructions, messages } = mensajesConMemoria({ ...args, modelo: { provider: "anthropic.messages" } });
    expect(instructions.map((x) => x.content)).toEqual(["MEMORIA", "INSTRUCCIONES"]);
    expect(instructions[0]!.providerOptions).toEqual({ anthropic: { cacheControl: { type: "ephemeral" } } });
    // solo la memoria: ni instrucciones ni lo variable llevan la marca
    expect(instructions[1]!.providerOptions).toBeUndefined();
    expect(messages).toEqual([{ role: "user", content: "AVISO" }]);
  });

  it("AI SDK 7: ningún system dentro de `messages` (va por `instructions`)", () => {
    const { messages } = mensajesConMemoria({ ...args, modelo: "anthropic" });
    expect(messages.some((x) => x.role === "system")).toBe(false);
  });

  it("con Gemini, la memoria va como texto normal, sin cache_control", () => {
    const r = mensajesConMemoria({ ...args, modelo: { provider: "google.generative-ai" } });
    expect(r.instructions[0]).toEqual({ role: "system", content: "MEMORIA" });
    expect(JSON.stringify(r)).not.toMatch(/cacheControl|cache_control/);
  });

  it("sin memoria no hay bloque vacío; sin instrucciones no hay 2º system", () => {
    expect(mensajesConMemoria({ ...args, memoria: null, modelo: "anthropic" }).instructions.map((x) => x.content)).toEqual(["INSTRUCCIONES"]);
    expect(mensajesConMemoria({ ...args, sistema: "", modelo: "anthropic" }).instructions.map((x) => x.content)).toEqual(["MEMORIA"]);
  });

  it("esAnthropic reconoce el provider de Claude (también envuelto con fallback)", () => {
    expect(esAnthropic({ provider: "anthropic.messages" })).toBe(true);
    expect(esAnthropic({ provider: "google.generative-ai" })).toBe(false);
    expect(esAnthropic({})).toBe(false);
  });
});

describe("usoDe: tokens de entrada, salida y cacheados", () => {
  const ahora = () => new Date("2026-11-26T00:00:00Z");

  it("lee la forma actual del SDK (inputTokenDetails)", () => {
    const u = usoDe(
      "adaptar-aviso",
      { usage: { inputTokens: 3000, outputTokens: 400, inputTokenDetails: { cacheReadTokens: 2500, cacheWriteTokens: 0 } } },
      ahora,
    );
    expect(u).toEqual({ tarea: "adaptar-aviso", entrada: 3000, salida: 400, cacheados: 2500, escritosCache: 0, en: "2026-11-26T00:00:00.000Z" });
  });

  it("acepta la forma anterior (cachedInputTokens) y los metadatos de Anthropic", () => {
    const u = usoDe("x", { usage: { inputTokens: 10, outputTokens: 2, cachedInputTokens: 7 }, providerMetadata: { anthropic: { cacheCreationInputTokens: 3 } } }, ahora);
    expect(u.cacheados).toBe(7);
    expect(u.escritosCache).toBe(3);
  });

  it("sin usage: nulos honestos, cacheados 0", () => {
    const u = usoDe("x", {}, ahora);
    expect(u.entrada).toBeNull();
    expect(u.salida).toBeNull();
    expect(u.cacheados).toBe(0);
  });
});

describe("las llamadas de redacción usan el helper único", () => {
  const rutas = [
    "src/app/api/variants/route.ts",
    "src/app/api/tailor/analizar/route.ts",
    "src/app/api/variants/[id]/tailor/route.ts",
    "src/app/api/variants/[id]/ajustar/route.ts",
    "src/app/api/master/traducir/route.ts",
  ];
  for (const r of rutas) {
    it(`${r} manda la memoria por mensajesConMemoria y registra el uso`, () => {
      const src = readFileSync(r, "utf8");
      expect(src).toContain("...mensajesConMemoria(");
      expect(src).toContain("contextoMemoria(sb, user.id,");
      expect(src).toContain("mem?.alUsar(r)");
      // ya no hay un `prompt:` suelto en la llamada de redacción
      expect(src).not.toMatch(/generateObject\(\{[^}]*\bprompt:/);
    });
  }
});
