import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserLlmKey } from "../src/lib/account/byok";
import { encryptSecret } from "../src/lib/crypto";

// Fake Supabase: solo la cadena .from().select().eq().maybeSingle() que usa byok.
function fakeSb(row: unknown): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("byok · getUserLlmKey (descifra solo en servidor, con candado)", () => {
  const KEY = Buffer.alloc(32, 9).toString("base64");
  let prev: string | undefined;
  beforeAll(() => {
    prev = process.env.CORPUS_ENCRYPTION_KEY;
    process.env.CORPUS_ENCRYPTION_KEY = KEY;
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.CORPUS_ENCRYPTION_KEY;
    else process.env.CORPUS_ENCRYPTION_KEY = prev;
  });

  it("clave guardada cifrada → la descifra", async () => {
    const blob = encryptSecret("sk-user-abc");
    expect(await getUserLlmKey(fakeSb({ llm_api_key: blob }), "u1")).toBe("sk-user-abc");
  });

  it("sin fila o sin clave → null (cae a la del servidor)", async () => {
    expect(await getUserLlmKey(fakeSb(null), "u1")).toBeNull();
    expect(await getUserLlmKey(fakeSb({ llm_api_key: null }), "u1")).toBeNull();
  });

  it("valor NO cifrado (sin prefijo v1:) → null: nunca se usa en claro", async () => {
    expect(await getUserLlmKey(fakeSb({ llm_api_key: "sk-plano-en-claro" }), "u1")).toBeNull();
  });

  it("sin CORPUS_ENCRYPTION_KEY → null (no descifra nada, aunque haya blob)", async () => {
    const blob = encryptSecret("sk-user-abc");
    const saved = process.env.CORPUS_ENCRYPTION_KEY;
    delete process.env.CORPUS_ENCRYPTION_KEY;
    try {
      expect(await getUserLlmKey(fakeSb({ llm_api_key: blob }), "u1")).toBeNull();
    } finally {
      process.env.CORPUS_ENCRYPTION_KEY = saved;
    }
  });
});
