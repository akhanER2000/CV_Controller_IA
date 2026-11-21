/* ============================================================================
   PING REAL DE ANTHROPIC · caché compartida por proveedor + huella de clave.

   `generateText` se sustituye por un espía: no hay clave real ni red. Lo que se
   comprueba es QUÉ modelo recibe la llamada (Claude, no Gemini) y que la ventana
   compartida no mezcla proveedores ni claves.
   ============================================================================ */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  llamadas: [] as { provider: string; modelId: string }[],
  fallar: false,
}));

vi.mock("ai", async (importOriginal) => {
  const real = await importOriginal<typeof import("ai")>();
  return {
    ...real,
    generateText: async (opts: { model: { provider: unknown; modelId: string } }) => {
      h.llamadas.push({ provider: String(opts.model.provider), modelId: opts.model.modelId });
      if (h.fallar) throw new Error("401 invalid x-api-key");
      return { text: "OK" };
    },
  };
});

import { pingProveedorAnthropic, pingProveedorBarato, _resetPing } from "../src/lib/ai/modelos";

beforeEach(() => {
  h.llamadas = [];
  h.fallar = false;
  _resetPing();
});

describe("pingProveedorAnthropic", () => {
  it("★ llama DE VERDAD a Anthropic con el modelo de redacción del registro", async () => {
    const r = await pingProveedorAnthropic("akey-1", true);
    expect(h.llamadas).toHaveLength(1);
    expect(h.llamadas[0]!.provider).toMatch(/^anthropic/);
    expect(h.llamadas[0]!.modelId).toBe("claude-sonnet-5-5");
    expect(r).toMatchObject({ ok: true, modelo: "claude-sonnet-5-5", reutilizado: false });
  });

  it("la ventana compartida reutiliza la llamada para la MISMA clave (no paga dos veces)", async () => {
    await pingProveedorAnthropic("akey-1");
    const r2 = await pingProveedorAnthropic("akey-1");
    expect(h.llamadas).toHaveLength(1);
    expect(r2.reutilizado).toBe(true);
  });

  it("otra clave u otro proveedor NO reutilizan el resultado (indexada por proveedor + huella)", async () => {
    await pingProveedorAnthropic("akey-1");
    await pingProveedorAnthropic("akey-2"); // otra clave ⇒ llamada nueva
    await pingProveedorBarato("akey-1"); // misma cadena de clave, OTRO proveedor ⇒ llamada nueva
    expect(h.llamadas).toHaveLength(3);
    expect(h.llamadas.map((l) => l.provider.split(".")[0])).toEqual(["anthropic", "anthropic", "groq"]);
  });

  it("un fallo se informa con su motivo y no finge ✓", async () => {
    h.fallar = true;
    const r = await pingProveedorAnthropic("akey-mala", true);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/401/);
  });
});
