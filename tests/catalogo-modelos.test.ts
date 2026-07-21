/* ============================================================================
   ★ SELECTOR DE MODELOS PROBADOS · EL LISTADO MIENTE.

   EL HECHO QUE ESTE TEST DEFIENDE (medido contra la clave real del usuario):
   `GET /v1beta/models` devolvió VEINTE modelos con `generateContent`; al llamarlos
   de verdad solo respondieron ONCE. Ocho contestan 404 «no longer available» y uno
   400. Un modelo que FIGURA en el listado y se cae al llamarlo es PEOR que uno
   ausente: el usuario lo elige, se guarda, y la app revienta DESPUÉS, en mitad de
   una extracción de verdad.

   Los mutantes que estos casos matan, uno por uno:
     (1) poblar `elegibles` del LISTADO en vez de de `responde` → muere en «404 no
         entra en elegibles».
     (2) tragarse el motivo real y devolver «error» → muere en «conserva el 404».
     (3) sondear familias que no pueden atender la tarea (imagen/tts/embeddings…)
         o saltarse el tope → muere en los casos de coste.
     (4) romper la CACHÉ (sondear en cada carga) → muere en «una sola tanda».
     (5) romper el ESPEJO ping-salud ↔ extracción → muere en «el espejo».
     (6) guardar un modelo sin probarlo → muere en el caso del POST.
     (7) proponer un recambio sin haberlo llamado → muere en «sin evidencia, sin
         sugerencia».

   NADA de esto hace red: la sonda se inyecta y el listado se stubbea. El barrido
   REAL contra la clave del usuario está al final, apagado salvo CATALOGO_REAL=1
   (gasta tokens de verdad).
   ============================================================================ */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  CONCURRENCIA,
  MAX_CANDIDATOS,
  _resetCatalogo,
  avisoDe,
  candidatosDe,
  catalogoCacheado,
  idModeloValido,
  listarModelos,
  probarModelo,
  validarModeloEfectivo,
  type Sonda,
} from "@/lib/ai/catalogo";
import {
  REGISTRO,
  TAREAS_ELEGIBLES,
  _resetPing,
  modeloDe,
  modeloEfectivo,
  modeloPara,
  pingProveedor,
} from "@/lib/ai/modelos";
import { elegirModelo, leerModeloElegido } from "@/lib/account/preferencias";

/**
 * El ping de salud hace `generateText`. Se sustituye SOLO esa función (el resto
 * del SDK sigue siendo el real) para poder comprobar sin red QUÉ MODELO se llama:
 * el espejo se demuestra mirando el modelo que recibe la llamada, no la firma.
 */
const pingueados = vi.hoisted(() => [] as string[]);
vi.mock("ai", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    generateText: async ({ model }: { model: { modelId: string } }) => {
      pingueados.push(model.modelId);
      return { text: "OK" };
    },
  };
});

/* ── Utillería: un listado falso con la forma EXACTA de la API de Google ────── */

interface ModeloListado {
  id: string;
  metodos?: string[];
}

function stubListado(modelos: ModeloListado[]) {
  const cuerpo = {
    models: modelos.map((m) => ({
      name: `models/${m.id}`,
      displayName: m.id,
      supportedGenerationMethods: m.metodos ?? ["generateContent"],
    })),
  };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(cuerpo), { status: 200 })));
}

/** Sonda falsa: responden los ids que se le digan; el resto lanza con su motivo. */
function sondaFalsa(respondientes: string[], errores: Record<string, string> = {}) {
  const llamados: string[] = [];
  const sonda: Sonda = async (id) => {
    llamados.push(id);
    if (respondientes.includes(id)) return "OK";
    const e = new Error(errores[id] ?? "not found") as Error & { statusCode?: number };
    e.statusCode = errores[id] ? 400 : 404;
    throw e;
  };
  return { sonda, llamados };
}

const CLAVE = "clave-de-prueba";

beforeEach(() => {
  _resetCatalogo();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/* ── 1 · COSTE: qué se sondea y qué NO ──────────────────────────────────────── */

describe("candidatosDe · el coste es N llamadas reales, así que se filtra y se topa", () => {
  it("no sondea familias de otra modalidad (imagen, tts, embeddings, vídeo, robótica, computer-use)", () => {
    const { candidatos, descartados } = candidatosDe([
      "gemini-3.6-flash",
      "text-embedding-004",
      "imagen-3.0-generate-002",
      "gemini-2.5-flash-preview-tts",
      "veo-3.0-generate-001",
      "gemini-robotics-er-1.5-preview",
      "gemini-2.5-computer-use-preview-10-2025",
    ]);
    expect(candidatos).toEqual(["gemini-3.6-flash"]);
    expect(descartados).toHaveLength(6);
    // Y cada descarte lleva su MOTIVO: una lista de exclusiones muda no se puede auditar.
    for (const d of descartados) expect(d.motivo.trim()).not.toBe("");
  });

  it("★ respeta el tope: un listado enorme NO son N llamadas facturadas", () => {
    // El listado REAL de esta clave devuelve 41 modelos con generateContent, así que
    // esto no es un caso de laboratorio: sin tope, un barrido factura decenas.
    const total = MAX_CANDIDATOS + 11;
    const ids = Array.from({ length: total }, (_, i) => `gemini-x${i}-flash`);
    const { candidatos, descartados } = candidatosDe(ids);
    expect(candidatos).toHaveLength(MAX_CANDIDATOS);
    expect(descartados).toHaveLength(total - MAX_CANDIDATOS);
    expect(descartados[0]!.motivo).toMatch(/tope/i);
  });

  it("un id con forma imposible no llega a la URL del proveedor", () => {
    const { candidatos, descartados } = candidatosDe(["../../etc/passwd", "gemini 3", "gemini-3.6-flash"]);
    expect(candidatos).toEqual(["gemini-3.6-flash"]);
    expect(descartados).toHaveLength(2);
  });
});

describe("idModeloValido · lo que puede entrar en una URL y en la base de datos", () => {
  it("acepta ids reales y rechaza lo demás", () => {
    for (const bueno of ["gemini-3.6-flash", "gemini-3.1-pro-preview-customtools", "llama-3.3-70b-versatile"]) {
      expect(idModeloValido(bueno), bueno).toBe(true);
    }
    for (const malo of ["", "  ", "gemini 3", "../secreto", "models/gemini-3.6-flash", "a".repeat(65), null, 7]) {
      expect(idModeloValido(malo as unknown), String(malo)).toBe(false);
    }
  });
});

/* ── 2 · EL CORAZÓN: listado ≠ utilizable ───────────────────────────────────── */

describe("listarModelos · solo entra al selector lo que RESPONDE", () => {
  it("★★ un modelo LISTADO que da 404 no es elegible — pero se enseña con su motivo real", async () => {
    stubListado([{ id: "gemini-3.6-flash" }, { id: "gemini-2.5-flash" }]);
    const { sonda } = sondaFalsa(["gemini-3.6-flash"], {});
    const cat = await listarModelos(CLAVE, { sonda });

    // El mutante clásico: poblar el desplegable con lo listado. Aquí muere.
    expect(cat.listados).toBe(2);
    expect(cat.elegibles).toEqual(["gemini-3.6-flash"]);
    expect(cat.elegibles).not.toContain("gemini-2.5-flash");

    const caido = cat.modelos.find((m) => m.id === "gemini-2.5-flash")!;
    expect(caido.listado).toBe(true); // sí estaba en el listado…
    expect(caido.responde).toBe(false); // …y no responde: las dos verdades a la vez
    expect(caido.error).toMatch(/404/); // el motivo REAL, no un genérico
  });

  it("solo se prueban los que declaran generateContent", async () => {
    stubListado([
      { id: "gemini-3.6-flash" },
      { id: "gemini-solo-embed", metodos: ["embedContent"] },
    ]);
    const { sonda, llamados } = sondaFalsa(["gemini-3.6-flash"]);
    const cat = await listarModelos(CLAVE, { sonda });
    expect(llamados).toEqual(["gemini-3.6-flash"]);
    expect(cat.listados).toBe(1);
  });

  it("ordena por UTILIDAD: primero lo que responde; los avisados, después; los caídos, al final", async () => {
    stubListado([
      { id: "gemini-3.5-flash-lite" },
      { id: "gemini-2.0-flash" },
      { id: "gemini-3.6-flash" },
    ]);
    const { sonda } = sondaFalsa(["gemini-3.5-flash-lite", "gemini-3.6-flash"]);
    const cat = await listarModelos(CLAVE, { sonda });
    expect(cat.modelos.map((m) => m.id)).toEqual([
      "gemini-3.6-flash", // responde y sin aviso
      "gemini-3.5-flash-lite", // responde, pero avisado (parafrasea)
      "gemini-2.0-flash", // no responde
    ]);
  });

  it("el aviso de los lite es un CÓDIGO (el texto es de i18n, ES y EN)", () => {
    expect(avisoDe("gemini-3.5-flash-lite")).toBe("lite");
    expect(avisoDe("gemini-3-flash-preview")).toBe("preview");
    expect(avisoDe("gemini-3.6-flash")).toBeUndefined();
  });

  it("★ el paralelismo tiene tope: nunca hay más de CONCURRENCIA sondas a la vez", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `gemini-p${i}-flash`);
    stubListado(ids.map((id) => ({ id })));
    let vivas = 0;
    let pico = 0;
    const sonda: Sonda = async () => {
      vivas++;
      pico = Math.max(pico, vivas);
      await new Promise((r) => setTimeout(r, 5));
      vivas--;
      return "OK";
    };
    await listarModelos(CLAVE, { sonda });
    expect(pico).toBeLessThanOrEqual(CONCURRENCIA);
    expect(pico).toBeGreaterThan(1); // y sí es paralelo: 12 sondas en serie serían un minuto
  });

  it("★ el barrido se CACHEA: abrir la pantalla dos veces no factura dos barridos", async () => {
    stubListado([{ id: "gemini-3.6-flash" }, { id: "gemini-flash-latest" }]);
    const { sonda, llamados } = sondaFalsa(["gemini-3.6-flash", "gemini-flash-latest"]);

    const a = await listarModelos(CLAVE, { sonda });
    expect(llamados).toHaveLength(2);
    expect(a.reutilizado).toBe(false);

    const b = await listarModelos(CLAVE, { sonda });
    expect(llamados).toHaveLength(2); // ni una llamada más
    expect(b.reutilizado).toBe(true);
    expect(b.probados).toBe(0); // y se dice: 0 sondas nuevas
    expect(b.elegibles).toEqual(a.elegibles);

    const c = await listarModelos(CLAVE, { sonda, forzar: true });
    expect(llamados).toHaveLength(4); // forzar SÍ vuelve a llamar de verdad
    expect(c.reutilizado).toBe(false);
  });

  it("★★ el modelo EN USO se prueba siempre, aunque el tope corte el resto (bug real: el tope dejó fuera el del registro)", async () => {
    // 41 modelos listados y un tope: sin prioritarios, el que la app USA se quedaba
    // sin sondear y el catálogo no podía decir si funciona — su único trabajo.
    const relleno = Array.from({ length: 40 }, (_, i) => ({ id: `gemini-r${i}-flash` }));
    stubListado([...relleno, { id: "gemini-3.6-flash" }]);
    const { sonda, llamados } = sondaFalsa(["gemini-3.6-flash"]);
    const cat = await listarModelos(CLAVE, { sonda, tope: 5, prioritarios: ["gemini-3.6-flash"] });
    expect(llamados[0]).toBe("gemini-3.6-flash"); // el primero, no el 41.º
    expect(llamados).toHaveLength(5); // y el tope se sigue respetando
    expect(cat.elegibles).toEqual(["gemini-3.6-flash"]);
  });

  it("un prioritario que NO está en el listado se prueba igual, y se dice que no estaba listado", async () => {
    stubListado([{ id: "gemini-3.6-flash" }]);
    const { sonda } = sondaFalsa(["gemini-3.6-flash", "modelo-privado-01"]);
    const cat = await listarModelos(CLAVE, { sonda, prioritarios: ["modelo-privado-01"] });
    const m = cat.modelos.find((x) => x.id === "modelo-privado-01")!;
    expect(m.responde).toBe(true);
    expect(m.listado).toBe(false); // en uso y funcionando, pero fuera del listado
    expect(cat.modelos.find((x) => x.id === "gemini-3.6-flash")!.listado).toBe(true);
  });

  it("si el LISTADO falla, se dice el motivo real y no se lanza (ni se finge una lista vacía sana)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("API key not valid", { status: 400 })),
    );
    const { sonda, llamados } = sondaFalsa([]);
    const cat = await listarModelos(CLAVE, { sonda });
    expect(cat.errorListado).toMatch(/400/);
    expect(cat.errorListado).toMatch(/API key not valid/);
    expect(cat.elegibles).toEqual([]);
    expect(llamados).toEqual([]); // sin listado no se sondea a ciegas
  });

  it("catalogoCacheado no gasta nada y devuelve null si no hay barrido previo", async () => {
    expect(catalogoCacheado(CLAVE)).toBeNull();
    stubListado([{ id: "gemini-3.6-flash" }]);
    const { sonda } = sondaFalsa(["gemini-3.6-flash"]);
    await listarModelos(CLAVE, { sonda });
    expect(catalogoCacheado(CLAVE)?.elegibles).toEqual(["gemini-3.6-flash"]);
    // La caché es POR CLAVE: la de otro usuario no se ve.
    expect(catalogoCacheado("otra-clave")).toBeNull();
  });
});

describe("probarModelo · el fallo también se cachea", () => {
  it("un 404 no se re-pregunta en cada carga (cuesta tiempo y dinero para saber lo mismo)", async () => {
    const { sonda, llamados } = sondaFalsa([]);
    const a = await probarModelo(CLAVE, "gemini-2.0-flash", { sonda });
    const b = await probarModelo(CLAVE, "gemini-2.0-flash", { sonda });
    expect(a.responde).toBe(false);
    expect(b.responde).toBe(false);
    expect(llamados).toEqual(["gemini-2.0-flash"]); // UNA sola llamada
  });
});

/* ── 3 · VALIDACIÓN DEL MODELO ACTIVO + PROPUESTA CON EVIDENCIA ─────────────── */

describe("validarModeloEfectivo · si el guardado se cayó, el motivo REAL y un recambio PROBADO", () => {
  it("★ modelo caído + catálogo ya barrido → propone uno que respondió, y prefiere el que no lleva aviso", async () => {
    stubListado([
      { id: "gemini-3.6-flash" },
      { id: "gemini-3.5-flash-lite" },
      { id: "gemini-2.0-flash" },
    ]);
    const { sonda } = sondaFalsa(["gemini-3.6-flash", "gemini-3.5-flash-lite"]);
    await listarModelos(CLAVE, { sonda });

    const v = await validarModeloEfectivo(CLAVE, "gemini-2.0-flash", { sonda });
    expect(v.responde).toBe(false);
    expect(v.error).toMatch(/404/);
    expect(v.sugerencia).toBe("gemini-3.6-flash"); // no el lite: parafrasea (medido)
  });

  it("modelo caído SIN catálogo → prueba el del registro y solo lo propone si RESPONDE", async () => {
    const registro = modeloDe("extraccion-estructurada");
    const { sonda, llamados } = sondaFalsa([registro]);
    const v = await validarModeloEfectivo(CLAVE, "gemini-2.0-flash", { sonda });
    expect(v.sugerencia).toBe(registro);
    // La propuesta salió de una llamada REAL al recambio, no de una tabla.
    expect(llamados).toContain(registro);
  });

  it("★★ sin evidencia, SIN sugerencia: nunca se propone un modelo que no se ha llamado", async () => {
    const { sonda } = sondaFalsa([]); // no responde NADIE, ni el del registro
    const v = await validarModeloEfectivo(CLAVE, "gemini-2.0-flash", { sonda });
    expect(v.responde).toBe(false);
    expect(v.sugerencia).toBeUndefined();
  });

  it("modelo que responde → sin sugerencia y con latencia (el dato de que la llamada ocurrió)", async () => {
    const { sonda } = sondaFalsa(["gemini-3.6-flash"]);
    const v = await validarModeloEfectivo(CLAVE, "gemini-3.6-flash", { sonda });
    expect(v.responde).toBe(true);
    expect(v.sugerencia).toBeUndefined();
    expect(typeof v.latenciaMs).toBe("number");
  });
});

/* ── 4 · EL ESPEJO: ping-salud DEBE probar lo mismo que la extracción ───────── */

describe("★ el espejo · un chequeo que prueba OTRO modelo no prueba nada", () => {
  it("ping-salud y extracción resuelven SIEMPRE al mismo modelo, elija el usuario lo que elija", () => {
    for (const elegido of [null, undefined, "", "  ", "gemini-3.5-flash", "gemini-flash-latest"]) {
      expect(
        modeloEfectivo("ping-salud", elegido),
        `el espejo se rompió con elegido=${JSON.stringify(elegido)}`,
      ).toBe(modeloEfectivo("extraccion-estructurada", elegido));
    }
  });

  it("sin elección, el modelo es el del registro (el que ganó el A/B)", () => {
    expect(modeloEfectivo("extraccion-estructurada", null)).toBe(REGISTRO["extraccion-estructurada"].modelo);
    expect(modeloEfectivo("extraccion-estructurada", "   ")).toBe(REGISTRO["extraccion-estructurada"].modelo);
  });

  it("★ la elección NO se cuela en visión, redacción ni clasificación barata", () => {
    const elegido = "gemini-3.5-flash";
    expect(modeloEfectivo("transcripcion-vision", elegido)).toBe(REGISTRO["transcripcion-vision"].modelo);
    expect(modeloEfectivo("redaccion-preserva-hechos", elegido)).toBe(REGISTRO["redaccion-preserva-hechos"].modelo);
    expect(modeloEfectivo("clasificacion-barata", elegido)).toBe(REGISTRO["clasificacion-barata"].modelo);
    // Y las tareas redirigibles son exactamente esas dos, ni una más.
    expect([...TAREAS_ELEGIBLES].sort()).toEqual(["extraccion-estructurada", "ping-salud"]);
  });

  it("★★ el ping de salud PRUEBA el modelo elegido, no el del registro", async () => {
    // Sin esto el espejo es imposible de cablear: el panel diría «en línea» probando
    // el modelo del registro mientras la extracción se cae con 404 en otro.
    pingueados.length = 0;
    _resetPing();
    const p = await pingProveedor("clave-espejo", false, "gemini-3.5-flash");
    expect(p.ok).toBe(true);
    expect(p.modelo).toBe("gemini-3.5-flash");
    expect(pingueados).toEqual(["gemini-3.5-flash"]); // llamó a ESE, no al del registro
  });

  it("★ la ventana del ping se indexa por MODELO: el «sí responde» de uno no se reutiliza para otro", async () => {
    pingueados.length = 0;
    _resetPing();
    await pingProveedor("clave-espejo", false, "gemini-3.5-flash");
    await pingProveedor("clave-espejo", false, "gemini-3.6-flash");
    await pingProveedor("clave-espejo", false, "gemini-3.5-flash"); // este sí se reutiliza
    expect(pingueados).toEqual(["gemini-3.5-flash", "gemini-3.6-flash"]);
  });

  it("modeloPara instancia el modelo ELEGIDO en extracción y en el ping, y el del registro en visión", () => {
    const elegido = "gemini-3.5-flash";
    expect(modeloPara("extraccion-estructurada", "k", undefined, elegido).modelId).toBe(elegido);
    expect(modeloPara("ping-salud", "k", undefined, elegido).modelId).toBe(elegido);
    expect(modeloPara("transcripcion-vision", "k", undefined, elegido).modelId).toBe(
      REGISTRO["transcripcion-vision"].modelo,
    );
    // Sin elección, todo sigue exactamente igual que antes de este bloque.
    expect(modeloPara("extraccion-estructurada", "k").modelId).toBe(REGISTRO["extraccion-estructurada"].modelo);
  });
});

/* ── 5 · LA DECISIÓN: no se guarda un modelo sin haberlo probado ─────────────
   Se testea `elegirModelo` (src/lib), NO el fichero de ruta: en este repo una
   ruta es una frontera HTTP y ningún test importa de ella —es justo lo que
   empuja a exportar de más— (tests/rutas-exports.test.ts). La ruta se queda con
   leer el cuerpo y poner el código de estado.

   El cliente de Supabase es un doble mínimo: así se ejerce el código REAL de
   preferencias.ts (incluida la detección de «falta la columna»), no un mock suyo.
   ─────────────────────────────────────────────────────────────────────────── */

function sbFalso(opts: { columnaAusente?: boolean } = {}) {
  const upserts: Record<string, unknown>[] = [];
  const errorColumna = {
    code: "PGRST204",
    message: "Could not find the 'llm_model' column of 'user_settings' in the schema cache",
  };
  const sb = {
    from: () => ({
      upsert: async (row: Record<string, unknown>) => {
        upserts.push(row);
        return { error: opts.columnaAusente ? errorColumna : null };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            opts.columnaAusente
              ? { data: null, error: errorColumna }
              : { data: { llm_model: null }, error: null },
        }),
      }),
    }),
  };
  return { sb: sb as unknown as Parameters<typeof elegirModelo>[0], upserts };
}

describe("elegirModelo · probar ANTES de guardar", () => {
  it("★★ un modelo que NO responde no se guarda, y se devuelve el motivo REAL del proveedor", async () => {
    const { sb, upserts } = sbFalso();
    const { sonda } = sondaFalsa([]); // no responde nadie: 404
    const r = await elegirModelo(sb, "u-1", "gemini-2.5-flash", CLAVE, { sonda });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("no-responde");
    expect(r.error).toMatch(/404/); // el porqué, no un «no válido» genérico
    expect(upserts).toEqual([]); // ★ NO tocó la base de datos
  });

  it("un modelo que responde sí se guarda, y su espejo apunta al mismo sitio", async () => {
    const { sb, upserts } = sbFalso();
    const { sonda, llamados } = sondaFalsa(["gemini-3.5-flash"]);
    const r = await elegirModelo(sb, "u-1", "gemini-3.5-flash", CLAVE, { sonda });
    expect(llamados).toEqual(["gemini-3.5-flash"]); // se PROBÓ antes de escribir
    expect(r.ok).toBe(true);
    expect(upserts).toEqual([{ user_id: "u-1", llm_model: "gemini-3.5-flash" }]);
    expect(r.modeloEfectivo).toBe("gemini-3.5-flash");
    expect(r.espejoPingSalud).toBe("gemini-3.5-flash"); // el chequeo prueba lo mismo
  });

  it("un id con forma inválida se rechaza SIN gastar una llamada", async () => {
    const { sb, upserts } = sbFalso();
    const { sonda, llamados } = sondaFalsa(["../../secreto"]);
    const r = await elegirModelo(sb, "u-1", "../../secreto", CLAVE, { sonda });
    expect(r.motivo).toBe("id-invalido");
    expect(llamados).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it("sin clave efectiva no se guarda a ciegas: no hay con qué probar", async () => {
    const { sb, upserts } = sbFalso();
    const { sonda } = sondaFalsa(["gemini-3.5-flash"]);
    const r = await elegirModelo(sb, "u-1", "gemini-3.5-flash", null, { sonda });
    expect(r.motivo).toBe("sin-clave");
    expect(upserts).toEqual([]);
  });

  it("volver al del registro (null) no sondea nada: es una elección legítima y gratis", async () => {
    const { sb, upserts } = sbFalso();
    const { sonda, llamados } = sondaFalsa([]);
    const r = await elegirModelo(sb, "u-1", null, CLAVE, { sonda });
    expect(r.ok).toBe(true);
    expect(llamados).toEqual([]);
    expect(upserts).toEqual([{ user_id: "u-1", llm_model: null }]);
    expect(r.modeloEfectivo).toBe(modeloDe("extraccion-estructurada"));
  });

  it("★ sin la columna llm_model NO se finge un guardado: se dice, y con el SQL exacto", async () => {
    const { sb } = sbFalso({ columnaAusente: true });
    const { sonda } = sondaFalsa(["gemini-3.5-flash"]);
    const r = await elegirModelo(sb, "u-1", "gemini-3.5-flash", CLAVE, { sonda });
    expect(r.ok).toBe(false);
    expect(r.guardado).toBe(false);
    expect(r.columnaAusente).toBe(true);
    expect(r.sqlPendiente).toMatch(/alter table user_settings add column if not exists llm_model/);
    // Y NO es un rechazo de la petición: el cliente hizo lo correcto (por eso la
    // ruta lo manda con 200 y no con 400). Falta SQL en el servidor.
    expect(r.motivo).toBeUndefined();
  });

  it("leerModeloElegido degrada sin lanzar cuando la columna no existe", async () => {
    const { sb } = sbFalso({ columnaAusente: true });
    expect(await leerModeloElegido(sb, "u-1")).toEqual({
      modelo: null,
      columnaAusente: true,
      error: undefined,
    });
  });

  it("un valor con forma rara en la BASE no se devuelve como bueno (se cae al registro)", async () => {
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { llm_model: "../malo" }, error: null }) }),
        }),
      }),
    } as unknown as Parameters<typeof elegirModelo>[0];
    expect((await leerModeloElegido(sb, "u-1")).modelo).toBeNull();
  });
});

/* ── 6 · EL BARRIDO REAL (apagado por defecto: gasta tokens de verdad) ───────
   Criterio de aceptación del bloque. Se enciende así, desde la raíz del repo:

     CATALOGO_REAL=1 npx vitest run tests/catalogo-modelos.test.ts

   La clave sale del entorno o, si no está, de .env.local (GEMINI_API_KEY).
   ─────────────────────────────────────────────────────────────────────────── */

function claveDelEntorno(): string | undefined {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "clave-servidor-de-prueba") {
    return process.env.GEMINI_API_KEY;
  }
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const env = readFileSync(path.join(here, "../.env.local"), "utf8");
    return /^GEMINI_API_KEY=(.+)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

describe.skipIf(process.env.CATALOGO_REAL !== "1")("barrido REAL contra la clave del usuario", () => {
  it("lista y PRUEBA: la tabla de verdad, listado vs. lo que responde", async () => {
    vi.unstubAllGlobals();
    _resetCatalogo();
    const key = claveDelEntorno();
    expect(key, "no hay GEMINI_API_KEY ni en el entorno ni en .env.local").toBeTruthy();

    // Los mismos prioritarios que manda la ruta: el modelo EN USO se prueba sí o sí.
    const cat = await listarModelos(key!, {
      forzar: true,
      prioritarios: [modeloDe("extraccion-estructurada")],
    });
    const tabla = cat.modelos.map(
      (m) =>
        `${m.responde ? "✔" : "✘"} ${m.id.padEnd(40)} ${
          m.responde ? `${m.latenciaMs} ms${m.aviso ? ` · ${m.aviso}` : ""}` : m.error
        }`,
    );
    console.log(
      [
        `listados: ${cat.listados} · sondeados: ${cat.probados} · RESPONDEN: ${cat.elegibles.length}`,
        ...tabla,
        `descartados sin probar: ${cat.descartados.map((d) => `${d.id} (${d.motivo})`).join(", ")}`,
      ].join("\n"),
    );

    expect(cat.errorListado).toBeUndefined();
    expect(cat.elegibles.length).toBeGreaterThan(0);
    // ★ El modelo del registro tiene que estar entre los que responden: si no, la
    //   app entera está apuntando a un modelo muerto.
    expect(cat.elegibles, "el modelo del registro NO responde").toContain(modeloDe("extraccion-estructurada"));
  }, 180_000);

  it("un modelo REALMENTE muerto se valida como muerto, con su 404 literal y un recambio probado", async () => {
    vi.unstubAllGlobals();
    const key = claveDelEntorno()!;
    // gemini-2.5-flash figura en el listado de Google y devuelve 404 «no longer
    // available to new users» a esta clave: el caso exacto que motiva el bloque.
    const v = await validarModeloEfectivo(key, "gemini-2.5-flash", { forzar: true });
    console.log(`validación de gemini-2.5-flash → responde=${v.responde} · ${v.error} · sugerencia=${v.sugerencia}`);
    expect(v.responde).toBe(false);
    expect(v.error).toMatch(/404/);
    expect(v.sugerencia, "sin recambio probado no hay nada que proponer").toBeTruthy();
  }, 120_000);
});
