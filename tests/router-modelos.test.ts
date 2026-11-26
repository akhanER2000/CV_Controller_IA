/* ============================================================================
   ROUTER DE MODELOS · Anthropic PRINCIPAL, Gemini SECUNDARIO, Groq opcional.

   Lo que este test PROTEGE, con mutantes que deben morir:

     (1) Orden de clave en TODAS las tareas: BYOK de Anthropic → ANTHROPIC_API_KEY
         del servidor → Gemini. Groq solo en clasificación y solo sin Anthropic.
     (2) FALLBACK REAL: si Claude responde 5xx/404/429/401, la MISMA llamada se repite
         con Gemini y `rutaDe` marca la tarea `degradado` con el motivo. Un 400 (petición
         mala) NO rebota: se relanza.
     (3) DA-C1a: con UNA sola clave (cualquiera) no hay 503.
     (4) Ningún modelo del registro es un alias `-latest`.

   No hay clave real: `fetch` se sustituye por un doble que imita a cada proveedor.
   ============================================================================ */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { generateText } from "ai";
import {
  REGISTRO,
  TAREAS,
  PROVEEDOR_PRINCIPAL,
  PROVEEDOR_SECUNDARIO,
  MODELO_GEMINI,
  MODELO_GROQ,
  MODELO_HAIKU,
  MODELO_SONNET,
  _resetCaidas,
  caidaReciente,
  debeCaer,
  hayClaveIA,
  modeloDe,
  modeloPara,
  rutaDe,
  type Tarea,
} from "../src/lib/ai/modelos";

const ENV = ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "ANTHROPIC_API_KEY"] as const;
let guardado: Record<string, string | undefined> = {};
beforeEach(() => {
  guardado = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  _resetCaidas();
});
afterEach(() => {
  for (const k of ENV) {
    if (guardado[k] === undefined) delete process.env[k];
    else process.env[k] = guardado[k];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ── El registro ─────────────────────────────────────────────────────────────── */
describe("registro · Anthropic principal en todas las tareas", () => {
  it("TAREAS coincide EXACTAMENTE con las claves del registro", () => {
    expect([...TAREAS].sort()).toEqual(Object.keys(REGISTRO).sort());
  });

  it("★ todas las tareas son de Anthropic con un fallback de Gemini", () => {
    expect(PROVEEDOR_PRINCIPAL).toBe("anthropic");
    expect(PROVEEDOR_SECUNDARIO).toBe("google");
    for (const t of TAREAS) {
      expect(REGISTRO[t].proveedor, t).toBe("anthropic");
      expect(REGISTRO[t].modelo, t).toMatch(/^claude-/);
      expect(REGISTRO[t].modeloFallback, t).toBe(MODELO_GEMINI);
    }
  });

  it("Sonnet para visión, extracción y redacción; Haiku para clasificación y ping", () => {
    for (const t of ["transcripcion-vision", "extraccion-estructurada", "redaccion-preserva-hechos"] as Tarea[]) {
      expect(modeloDe(t)).toBe(MODELO_SONNET);
    }
    expect(modeloDe("clasificacion-barata")).toBe(MODELO_HAIKU);
    expect(modeloDe("ping-salud")).toBe(MODELO_HAIKU);
    expect(MODELO_SONNET).toMatch(/sonnet/);
    expect(MODELO_HAIKU).toMatch(/haiku/);
  });

  it("★ ningún modelo (preferente, fallback ni barato) es un alias -latest", () => {
    for (const t of TAREAS) {
      const d = REGISTRO[t];
      for (const m of [d.modelo, d.modeloFallback, d.modeloBarato].filter(Boolean)) {
        expect(m, `${t}: ${m}`).not.toMatch(/latest/i);
      }
    }
  });

  it("Groq solo existe en la clasificación", () => {
    expect(REGISTRO["clasificacion-barata"].modeloBarato).toBe(MODELO_GROQ);
    for (const t of TAREAS.filter((x) => x !== "clasificacion-barata")) expect(REGISTRO[t].modeloBarato).toBeUndefined();
  });
});

/* ── Orden de clave · modeloPara (sin red) ───────────────────────────────────── */
describe("★ orden Anthropic → Gemini · modeloPara", () => {
  it("BYOK de Anthropic → instancia Claude (envuelto con fallback si hay Gemini)", () => {
    for (const t of TAREAS) {
      const m = modeloPara(t, "gkey", undefined, undefined, "akey");
      expect(String(m.provider), t).toMatch(/^anthropic/);
      expect(m.modelId, t).toBe(REGISTRO[t].modelo);
    }
  });

  it("sin BYOK de Anthropic → ANTHROPIC_API_KEY del servidor", () => {
    process.env.ANTHROPIC_API_KEY = "akey-servidor";
    const m = modeloPara("extraccion-estructurada", "gkey");
    expect(String(m.provider)).toMatch(/^anthropic/);
    expect(m.modelId).toBe(MODELO_SONNET);
  });

  it("sin ninguna clave de Anthropic → Gemini con el fallback", () => {
    for (const t of TAREAS) {
      const m = modeloPara(t, "gkey");
      expect(String(m.provider), t).toMatch(/^google/);
      expect(m.modelId, t).toBe(MODELO_GEMINI);
    }
  });

  it("solo clave de Anthropic (ni Gemini) → Claude sin envoltorio, no lanza", () => {
    const m = modeloPara("transcripcion-vision", undefined, undefined, undefined, "akey");
    expect(String(m.provider)).toMatch(/^anthropic/);
  });

  it("Groq: solo clasificación, solo con 2ª clave y SIN Anthropic", () => {
    expect(String(modeloPara("clasificacion-barata", "gkey", "qkey").provider)).toMatch(/^groq/);
    expect(modeloPara("clasificacion-barata", undefined, "qkey").modelId).toBe(MODELO_GROQ);
    // Con Anthropic, Claude manda.
    expect(String(modeloPara("clasificacion-barata", "gkey", "qkey", undefined, "akey").provider)).toMatch(/^anthropic/);
    // El resto de tareas ignoran la 2ª clave.
    expect(String(modeloPara("extraccion-estructurada", "gkey", "qkey").provider)).toMatch(/^google/);
  });

  it("un modelo elegido de Gemini va directo a Gemini; uno de Claude, a Claude", () => {
    const g = modeloPara("extraccion-estructurada", "gkey", undefined, "gemini-3.5-flash", "akey");
    expect(String(g.provider)).toMatch(/^google/);
    expect(g.modelId).toBe("gemini-3.5-flash");
    const c = modeloPara("extraccion-estructurada", "gkey", undefined, "claude-haiku-5-5", "akey");
    expect(String(c.provider)).toMatch(/^anthropic/);
    expect(c.modelId).toBe("claude-haiku-5-5");
  });

  it("sin NINGUNA clave → lanza nombrando las dos variables", () => {
    expect(() => modeloPara("extraccion-estructurada")).toThrow(/ANTHROPIC_API_KEY.*GEMINI_API_KEY/);
  });
});

/* ── rutaDe · la verdad del panel ────────────────────────────────────────────── */
describe("rutaDe · quién atiende de verdad", () => {
  it("★ con Anthropic disponible → anthropic, sin degradar", () => {
    expect(rutaDe("extraccion-estructurada", { anthropicDisponible: true })).toEqual({
      tarea: "extraccion-estructurada",
      proveedor: "anthropic",
      modelo: MODELO_SONNET,
      degradado: false,
    });
  });

  it("el flag omitido mira ANTHROPIC_API_KEY del servidor", () => {
    expect(rutaDe("redaccion-preserva-hechos").proveedor).toBe("google");
    process.env.ANTHROPIC_API_KEY = "akey-servidor";
    expect(rutaDe("redaccion-preserva-hechos").proveedor).toBe("anthropic");
  });

  it("★★ sin Anthropic → Gemini, degradado", () => {
    expect(rutaDe("redaccion-preserva-hechos", { anthropicDisponible: false })).toEqual({
      tarea: "redaccion-preserva-hechos",
      proveedor: "google",
      modelo: MODELO_GEMINI,
      degradado: true,
    });
  });

  it("clasificación sin Anthropic y con Groq → groq (degradado: no es el principal)", () => {
    expect(rutaDe("clasificacion-barata", { groqDisponible: true, anthropicDisponible: false })).toMatchObject({
      proveedor: "groq",
      modelo: MODELO_GROQ,
      degradado: true,
    });
    // Groq no mueve otras tareas.
    expect(rutaDe("extraccion-estructurada", { groqDisponible: true, anthropicDisponible: false }).proveedor).toBe("google");
  });
});

/* ── FALLBACK REAL ante 5xx / 404 / 429 simulados ────────────────────────────── */

const RESPUESTA_GEMINI = {
  candidates: [{ content: { role: "model", parts: [{ text: "desde gemini" }] }, finishReason: "STOP", index: 0 }],
  usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 },
};

/** Doble de `fetch`: Anthropic responde `status`; Gemini responde bien. Registra a quién se llamó. */
function stubProveedores(statusAnthropic: number) {
  const llamados: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.anthropic.com")) {
        llamados.push("anthropic");
        return new Response(
          JSON.stringify({ type: "error", error: { type: "api_error", message: `simulado ${statusAnthropic}` } }),
          { status: statusAnthropic, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        llamados.push("google");
        return new Response(JSON.stringify(RESPUESTA_GEMINI), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`url inesperada en el test: ${url}`);
    }),
  );
  return llamados;
}

describe("★ fallback real · si Claude cae, la MISMA llamada se repite con Gemini", () => {
  for (const status of [500, 503, 529, 404, 429, 401]) {
    it(`Anthropic ${status} → responde Gemini y la tarea queda degradada con el motivo`, async () => {
      const llamados = stubProveedores(status);
      const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
      const model = modeloPara("redaccion-preserva-hechos", "gkey", undefined, undefined, "akey");
      const { text } = await generateText({ model, prompt: "hola", maxRetries: 0 });

      expect(text).toBe("desde gemini");
      expect(llamados).toEqual(["anthropic", "google"]); // primero Claude, después Gemini
      // Nunca en silencio: consola + caída anotada que el panel enseña.
      expect(aviso).toHaveBeenCalledTimes(1);
      expect(caidaReciente("redaccion-preserva-hechos", "akey")?.motivo).toMatch(new RegExp(String(status)));
      const r = rutaDe("redaccion-preserva-hechos", { anthropicDisponible: true, claveAnthropic: "akey" });
      expect(r).toMatchObject({ proveedor: "google", modelo: MODELO_GEMINI, degradado: true });
      expect(r.motivo).toMatch(new RegExp(String(status)));
      // La caída es de ESA clave y ESA tarea: otra clave no sale degradada.
      expect(rutaDe("redaccion-preserva-hechos", { anthropicDisponible: true, claveAnthropic: "otra" }).degradado).toBe(false);
      expect(rutaDe("extraccion-estructurada", { anthropicDisponible: true, claveAnthropic: "akey" }).degradado).toBe(false);
    });
  }

  it("un 400 (petición mala) NO rebota a Gemini: se relanza", async () => {
    const llamados = stubProveedores(400);
    const model = modeloPara("redaccion-preserva-hechos", "gkey", undefined, undefined, "akey");
    await expect(generateText({ model, prompt: "hola", maxRetries: 0 })).rejects.toThrow();
    expect(llamados).toEqual(["anthropic"]);
    expect(caidaReciente("redaccion-preserva-hechos", "akey")).toBeNull();
  });

  it("sin clave de Gemini no hay recambio: el error de Claude sale tal cual", async () => {
    const llamados = stubProveedores(503);
    const model = modeloPara("redaccion-preserva-hechos", undefined, undefined, undefined, "akey");
    await expect(generateText({ model, prompt: "hola", maxRetries: 0 })).rejects.toThrow();
    expect(llamados).toEqual(["anthropic"]);
  });

  it("debeCaer: cancelación del usuario NO cae; red caída SÍ", () => {
    expect(debeCaer(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(false);
    expect(debeCaer(new TypeError("fetch failed"))).toBe(true);
  });
});

/* ── DA-C1a · sin 503 con una sola clave ─────────────────────────────────────── */
describe("★ DA-C1a · con UNA clave basta (no hay 503)", () => {
  it("hayClaveIA: cualquier clave sola habilita la IA; ninguna, no", () => {
    expect(hayClaveIA()).toBe(false);
    expect(hayClaveIA(undefined, null)).toBe(false);
    expect(hayClaveIA("byok-gemini")).toBe(true);
    expect(hayClaveIA(undefined, "byok-anthropic")).toBe(true);
    process.env.ANTHROPIC_API_KEY = "solo-anthropic";
    expect(hayClaveIA()).toBe(true);
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GEMINI_API_KEY = "solo-gemini";
    expect(hayClaveIA()).toBe(true);
  });

  it("ninguna ruta de IA decide el 503 mirando solo la clave de Gemini", () => {
    const rutas = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? rutas(p) : n === "route.ts" ? [p] : [];
      });
    const api = join(__dirname, "..", "src", "app", "api");
    const conIA = rutas(api).filter((p) => /modeloPara\(|makeGeminiExtractor\(|extractDepsFor\(|depsReales\(/.test(readFileSync(p, "utf8")));
    expect(conIA.length).toBeGreaterThan(5);
    for (const p of conIA) {
      const src = readFileSync(p, "utf8");
      expect(src, p).not.toMatch(/!\s*geminiApiKey\(\)|byok \|\| geminiApiKey\(\)/);
    }
  });
});
