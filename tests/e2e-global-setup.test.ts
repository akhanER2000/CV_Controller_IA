import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* DA-M6 · el global-setup de las e2e ABORTA si el Supabase no es local, ANTES de
   crear ningún usuario. createClient se espía: si se llamara, el setup ya estaría
   hablando con el remoto. */
const h = vi.hoisted(() => ({ createUser: vi.fn(), createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...a: unknown[]) => {
    h.createClient(...a);
    return { auth: { admin: { createUser: h.createUser } } };
  },
}));

// Sin efectos fuera del test: no se pisa el archivo de credenciales del temp.
vi.mock("node:fs", async (orig) => ({ ...(await orig<typeof import("node:fs")>()), writeFileSync: vi.fn() }));

import globalSetup, { esSupabaseLocal } from "./e2e/global-setup";

const guardado = { ...process.env };
beforeEach(() => {
  h.createUser.mockReset().mockResolvedValue({ error: null });
  h.createClient.mockReset();
});
afterEach(() => {
  process.env = { ...guardado };
});

describe("e2e · global-setup solo contra el Supabase local", () => {
  it("esSupabaseLocal: 127.0.0.1 y localhost sí; el remoto, vacío o basura no", () => {
    expect(esSupabaseLocal("http://127.0.0.1:55321")).toBe(true);
    expect(esSupabaseLocal("http://localhost:54321")).toBe(true);
    expect(esSupabaseLocal("https://abcdefgh.supabase.co")).toBe(false);
    expect(esSupabaseLocal("https://127.0.0.1.evil.example")).toBe(false);
    expect(esSupabaseLocal("http://localhost.supabase.co")).toBe(false);
    expect(esSupabaseLocal("")).toBe(false);
    expect(esSupabaseLocal(undefined)).toBe(false);
    expect(esSupabaseLocal("no es una url")).toBe(false);
  });

  it("rechaza una URL remota sin crear el cliente ni el usuario", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-mentira";
    await expect(globalSetup()).rejects.toThrow(/e2e solo contra el Supabase local/);
    expect(h.createClient).not.toHaveBeenCalled();
    expect(h.createUser).not.toHaveBeenCalled();
  });

  it("con el Supabase local sí crea el usuario de prueba", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-mentira";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await globalSetup();
    log.mockRestore();
    expect(h.createClient).toHaveBeenCalledWith("http://127.0.0.1:55321", "clave-de-mentira", expect.anything());
    expect(h.createUser).toHaveBeenCalledTimes(1);
  });
});
