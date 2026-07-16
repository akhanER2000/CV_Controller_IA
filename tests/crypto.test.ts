import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encryptSecret, decryptSecret, encryptionAvailable } from "../src/lib/crypto";

/**
 * Cifrado en reposo del secreto BYOK. crypto lee CORPUS_ENCRYPTION_KEY de forma
 * perezosa (en cada llamada), así que basta fijarla en beforeAll.
 */
describe("crypto · cifrado en reposo (AES-256-GCM)", () => {
  const KEY = Buffer.alloc(32, 7).toString("base64");
  let prev: string | undefined;
  beforeAll(() => {
    prev = process.env.CORPUS_ENCRYPTION_KEY;
    process.env.CORPUS_ENCRYPTION_KEY = KEY;
  });
  afterAll(() => {
    if (prev === undefined) delete process.env.CORPUS_ENCRYPTION_KEY;
    else process.env.CORPUS_ENCRYPTION_KEY = prev;
  });

  it("round-trip: descifra exactamente lo que cifra, y el blob no lleva el texto plano", () => {
    expect(encryptionAvailable()).toBe(true);
    const blob = encryptSecret("sk-secreto-123");
    expect(blob.startsWith("v1:")).toBe(true);
    expect(blob).not.toContain("sk-secreto-123");
    expect(decryptSecret(blob)).toBe("sk-secreto-123");
  });

  it("dos cifrados del mismo texto difieren (IV aleatorio por cifrado)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("formato desconocido lanza (no descifra basura)", () => {
    expect(() => decryptSecret("no-es-un-blob")).toThrow();
  });

  it("ciphertext manipulado → el tag GCM no cuadra y lanza (integridad)", () => {
    const parts = encryptSecret("hola").split(":");
    parts[3] = Buffer.from("otra-cosa").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("sin CORPUS_ENCRYPTION_KEY: no se puede cifrar (encryptionAvailable=false)", () => {
    const saved = process.env.CORPUS_ENCRYPTION_KEY;
    delete process.env.CORPUS_ENCRYPTION_KEY;
    try {
      expect(encryptionAvailable()).toBe(false);
      expect(() => encryptSecret("x")).toThrow();
    } finally {
      process.env.CORPUS_ENCRYPTION_KEY = saved;
    }
  });
});
