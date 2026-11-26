/* ============================================================================
   Remate datos-y-paginas:
     · Salud prueba también el modelo de extracción y redacción (Sonnet), no solo
       el ping (Haiku), y dice cuál responde.
     · Las páginas objetivo viven en cv_variants.paginas_objetivo; sin la columna
       (0009 sin aplicar) se cae a 2 sin romper.
   ============================================================================ */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";

const h = vi.hoisted(() => ({
  llamadas: [] as string[],
  caidos: new Set<string>(),
}));

vi.mock("ai", async (importOriginal) => {
  const real = await importOriginal<typeof import("ai")>();
  return {
    ...real,
    generateText: async (opts: { model: { modelId: string } }) => {
      h.llamadas.push(opts.model.modelId);
      if (h.caidos.has(opts.model.modelId)) throw new Error("529 overloaded");
      return { text: "OK" };
    },
  };
});

import { modelosDeTrabajo, pingModelosDeTrabajo, MODELO_SONNET, _resetPing } from "../src/lib/ai/modelos";
import { leerPaginasObjetivo, guardarPaginasObjetivo, paginasValidas } from "../src/lib/db/variants";

beforeEach(() => {
  h.llamadas = [];
  h.caidos.clear();
  _resetPing();
});

describe("Salud · el modelo que trabaja, no solo el del ping", () => {
  it("extracción y redacción comparten Sonnet → UN solo ping que nombra las dos tareas", () => {
    expect(modelosDeTrabajo()).toEqual([
      { modelo: MODELO_SONNET, tareas: ["extraccion-estructurada", "redaccion-preserva-hechos"] },
    ]);
  });

  it("con un Claude elegido para la extracción, se prueban los dos modelos", () => {
    const m = modelosDeTrabajo("claude-opus-5-5");
    expect(m).toEqual([
      { modelo: "claude-opus-5-5", tareas: ["extraccion-estructurada"] },
      { modelo: MODELO_SONNET, tareas: ["redaccion-preserva-hechos"] },
    ]);
    // un Gemini elegido no es de Anthropic: Sonnet sigue siendo el de las dos
    expect(modelosDeTrabajo("gemini-3.6-flash")).toHaveLength(1);
  });

  it("★ llama DE VERDAD a Sonnet y dice si responde", async () => {
    const [r] = await pingModelosDeTrabajo("akey-1", true);
    expect(h.llamadas).toEqual([MODELO_SONNET]);
    expect(r).toMatchObject({ ok: true, modelo: MODELO_SONNET });
  });

  it("★ Sonnet caído se nota aunque Haiku respondiera", async () => {
    h.caidos.add(MODELO_SONNET);
    const [r] = await pingModelosDeTrabajo("akey-1", true);
    expect(r!.ok).toBe(false);
    expect(r!.error).toMatch(/529/);
  });

  it("las dos rutas de Salud usan el ping de trabajo", () => {
    const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    for (const r of ["src/app/api/health/ai/route.ts", "src/app/api/health/status/route.ts"]) {
      expect(readFileSync(path.join(raiz, r), "utf8")).toMatch(/pingModelosDeTrabajo\(/);
    }
  });
});

/* ── páginas objetivo ─────────────────────────────────────────────────────── */

type Respuesta = { data: unknown; error: { code?: string; message: string } | null };

/** Cliente mínimo: cv_variants con una fila, o con la columna ausente. */
function sbPaginas(fila: { paginas_objetivo?: number } | null, columnaAusente = false) {
  const escrito: Record<string, unknown>[] = [];
  const falta = { code: "42703", message: "column cv_variants.paginas_objetivo does not exist" };
  const cadena = (res: () => Respuesta) => {
    const q: Record<string, unknown> = {};
    q.eq = () => q;
    q.maybeSingle = () => q;
    q.then = (ok: (v: Respuesta) => unknown) => Promise.resolve(res()).then(ok);
    return q;
  };
  const sb = {
    from: () => ({
      select: () => cadena(() => (columnaAusente ? { data: null, error: falta } : { data: fila, error: null })),
      update: (p: Record<string, unknown>) =>
        cadena(() => {
          if (columnaAusente) return { data: null, error: falta };
          escrito.push(p);
          return { data: null, error: null };
        }),
    }),
  } as unknown as SupabaseClient;
  return { sb, escrito };
}

describe("Páginas objetivo en la base (0009)", () => {
  it("lee lo guardado", async () => {
    const { sb } = sbPaginas({ paginas_objetivo: 3 });
    expect(await leerPaginasObjetivo(sb, "u", "v")).toBe(3);
  });

  it("★ sin la columna cae a 2 sin romper (lectura y escritura)", async () => {
    const { sb } = sbPaginas(null, true);
    expect(await leerPaginasObjetivo(sb, "u", "v")).toBe(2);
    expect(await guardarPaginasObjetivo(sb, "u", "v", 3)).toEqual({ persistido: false });
  });

  it("escribe paginas_objetivo y solo admite 1, 2 o 3", async () => {
    const { sb, escrito } = sbPaginas({ paginas_objetivo: 2 });
    expect(await guardarPaginasObjetivo(sb, "u", "v", 3)).toEqual({ persistido: true });
    expect(escrito).toEqual([{ paginas_objetivo: 3 }]);
    expect([1, 2, 3].every(paginasValidas)).toBe(true);
    expect([0, 4, "2", null].some(paginasValidas)).toBe(false);
  });

  it("el editor ya no guarda el objetivo en localStorage", () => {
    const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    const src = readFileSync(path.join(raiz, "src/components/screens/EditorVarianteScreen.tsx"), "utf8");
    expect(src).not.toMatch(/corpus\.paginas\./);
    expect(src).toMatch(/paginas_objetivo: n/);
  });
});
