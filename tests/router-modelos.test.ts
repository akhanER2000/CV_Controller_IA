/* ============================================================================
   §H · ROUTER POR TAREA + SEGUNDO PROVEEDOR (registro de modelos).

   Lo que este test PROTEGE, con mutantes que deben morir:

     (1) El router es POR COSTE, no redundancia. Solo la tarea BARATA prefiere el 2º
         proveedor (Groq); visión, extracción, redacción y ping siguen en Gemini.
     (2) DEGRADAR CON HONESTIDAD: sin 2ª clave, la tarea barata CAE a Gemini y `rutaDe`
         lo marca `degradado:true`. Si alguien borra esa rama, el panel de salud
         mentiría diciendo «groq» donde de verdad atiende Gemini — y este test lo caza.
     (3) `modeloPara` instancia el proveedor CORRECTO. Se comprueba SIN red, mirando el
         `provider`/`modelId` del objeto modelo (no se llama a ninguna API).
     (4) La ruta barata con 2ª clave NO necesita clave de Gemini (son proveedores
         independientes); las tareas de Gemini SÍ la exigen y, sin ella, lanzan.

   No hay clave real en el entorno: NADA aquí hace una llamada. Construir un modelo del
   SDK es perezoso; el objeto solo declara qué proveedor/modelo usaría.
   ============================================================================ */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  REGISTRO,
  TAREAS,
  PROVEEDOR_BARATO,
  modeloDe,
  modeloPara,
  rutaDe,
  type Tarea,
} from "../src/lib/ai/modelos";

const MODELO_GROQ = "llama-3.3-70b-versatile";
// El modelo de Gemini fijado en el registro (versionado, NUNCA un alias -latest).
// Si el A/B lo cambia, se actualiza aquí; que no compile con -latest lo garantiza
// tests/modelos-registro.test.ts, no este.
const MODELO_GEMINI = "gemini-2.5-flash";

/* ── El registro es la única fuente de verdad tarea→proveedor→modelo ─────────── */
describe("registro · una tarea, un proveedor, un modelo", () => {
  it("TAREAS coincide EXACTAMENTE con las claves del registro (ni una de más ni de menos)", () => {
    expect([...TAREAS].sort()).toEqual(Object.keys(REGISTRO).sort());
  });

  it("SOLO la tarea barata es del 2º proveedor; el resto siguen en Gemini", () => {
    expect(PROVEEDOR_BARATO).toBe("groq");
    expect(REGISTRO["clasificacion-barata"].proveedor).toBe("groq");
    for (const t of ["transcripcion-vision", "extraccion-estructurada", "redaccion-preserva-hechos", "ping-salud"] as Tarea[]) {
      expect(REGISTRO[t].proveedor).toBe("google");
    }
  });

  it("la tarea barata declara su modelo Groq CON salida estructurada y su fallback de Gemini", () => {
    const def = REGISTRO["clasificacion-barata"];
    expect(def.modelo).toBe(MODELO_GROQ); // llama-3.3-70b-versatile soporta structured output
    expect(def.modeloFallback).toBe(MODELO_GEMINI); // sin 2ª clave, cae a Gemini
  });

  it("modeloDe reporta el modelo PREFERENTE de cada tarea sin llamar a nada", () => {
    expect(modeloDe("extraccion-estructurada")).toBe(MODELO_GEMINI);
    expect(modeloDe("clasificacion-barata")).toBe(MODELO_GROQ);
  });
});

/* ── rutaDe · la VERDAD que el panel de salud enseña ─────────────────────────── */
describe("rutaDe · quién atiende de verdad cada tarea", () => {
  it("★ barata + 2ª clave (Groq disponible) → Groq, sin degradar", () => {
    expect(rutaDe("clasificacion-barata", { groqDisponible: true })).toEqual({
      tarea: "clasificacion-barata",
      proveedor: "groq",
      modelo: MODELO_GROQ,
      degradado: false,
    });
  });

  it("★★ barata SIN 2ª clave → CAE a Gemini y se marca degradado (mutante: si se borra la rama, muere aquí)", () => {
    expect(rutaDe("clasificacion-barata", { groqDisponible: false })).toEqual({
      tarea: "clasificacion-barata",
      proveedor: "google",
      modelo: MODELO_GEMINI, // el fallback declarado, no el modelo de Groq
      degradado: true,
    });
  });

  it("una tarea de Gemini NO se mueve a Groq aunque haya 2ª clave (el router es por coste, no por redundancia)", () => {
    expect(rutaDe("extraccion-estructurada", { groqDisponible: true })).toEqual({
      tarea: "extraccion-estructurada",
      proveedor: "google",
      modelo: MODELO_GEMINI,
      degradado: false,
    });
    expect(rutaDe("ping-salud", { groqDisponible: false }).degradado).toBe(false);
  });
});

/* ── modeloPara · instancia el proveedor correcto (sin red) ──────────────────── */
describe("modeloPara · ramifica al proveedor correcto", () => {
  it("★ barata + 2ª clave → instancia el modelo de GROQ", () => {
    const m = modeloPara("clasificacion-barata", "gkey", "qkey");
    expect(String(m.provider)).toMatch(/^groq/);
    expect(m.modelId).toBe(MODELO_GROQ);
  });

  it("★★ barata SIN 2ª clave → instancia GEMINI (el fallback), no Groq", () => {
    const m = modeloPara("clasificacion-barata", "gkey");
    expect(String(m.provider)).toMatch(/^google/);
    expect(m.modelId).toBe(MODELO_GEMINI);
  });

  it("★ barata + 2ª clave NO necesita clave de Gemini (proveedores independientes)", () => {
    // Sin apiKey de Google, pero con 2ª clave: la ruta barata va a Groq y no lanza.
    const m = modeloPara("clasificacion-barata", undefined, "qkey");
    expect(String(m.provider)).toMatch(/^groq/);
    expect(m.modelId).toBe(MODELO_GROQ);
  });

  it("una tarea de Gemini IGNORA la 2ª clave y sigue en Gemini", () => {
    const m = modeloPara("extraccion-estructurada", "gkey", "qkey");
    expect(String(m.provider)).toMatch(/^google/);
    expect(m.modelId).toBe(MODELO_GEMINI);
  });

  it("ping-salud siempre en Gemini", () => {
    const m = modeloPara("ping-salud", "gkey");
    expect(m.modelId).toBe(MODELO_GEMINI);
  });
});

/* ── modeloPara · sin clave de Gemini, las tareas de Gemini LANZAN ───────────── */
describe("modeloPara · sin clave de Gemini y sin 2ª clave, la ruta a Gemini lanza", () => {
  let g: string | undefined;
  let gg: string | undefined;
  beforeEach(() => {
    g = process.env.GEMINI_API_KEY;
    gg = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });
  afterEach(() => {
    if (g === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = g;
    if (gg === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY; else process.env.GOOGLE_GENERATIVE_AI_API_KEY = gg;
  });

  it("extracción sin clave alguna → Falta GEMINI_API_KEY", () => {
    expect(() => modeloPara("extraccion-estructurada")).toThrow(/GEMINI_API_KEY/);
  });

  it("★ barata SIN 2ª clave y SIN Gemini → también lanza (degrada a una ruta que exige Gemini)", () => {
    expect(() => modeloPara("clasificacion-barata")).toThrow(/GEMINI_API_KEY/);
  });
});
