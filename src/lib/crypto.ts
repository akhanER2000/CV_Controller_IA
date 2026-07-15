import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado en reposo para secretos del usuario (la clave BYOK). AES-256-GCM con
 * una clave de 32 bytes en CORPUS_ENCRYPTION_KEY (base64). Un secreto sin cifrar
 * en la base es justo lo que este producto no puede permitirse: si la clave de
 * cifrado NO está configurada, el llamador NO debe persistir el secreto (aparca).
 *
 * Solo servidor (node:crypto). El texto plano nunca vuelve al cliente.
 */

const ALG = "aes-256-gcm";

function masterKey(): Buffer | null {
  const b64 = process.env.CORPUS_ENCRYPTION_KEY;
  if (!b64) return null;
  try {
    const buf = Buffer.from(b64, "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

/** ¿Se puede cifrar? (¿hay una CORPUS_ENCRYPTION_KEY válida de 32 bytes?) */
export function encryptionAvailable(): boolean {
  return masterKey() !== null;
}

/** Cifra un secreto → "v1:iv:tag:ciphertext" (todo base64). Lanza si no hay clave. */
export function encryptSecret(plain: string): string {
  const key = masterKey();
  if (!key) throw new Error("CORPUS_ENCRYPTION_KEY no configurada");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/** Descifra un blob "v1:iv:tag:ciphertext". Lanza si no hay clave o el formato es inválido. */
export function decryptSecret(blob: string): string {
  const key = masterKey();
  if (!key) throw new Error("CORPUS_ENCRYPTION_KEY no configurada");
  const [v, ivB, tagB, encB] = blob.split(":");
  if (v !== "v1" || !ivB || !tagB || !encB) throw new Error("formato de secreto desconocido");
  const decipher = createDecipheriv(ALG, key, Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}
