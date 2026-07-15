import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Global-setup del e2e: crea un usuario CONFIRMADO y único por corrida con el
 * service_role de Supabase (salta la confirmación por correo). Escribe las
 * credenciales en un archivo del temp del SO (fuera del repo) que el spec lee.
 *
 * La persona es INVENTADA (Valentina Rojas Fuentes) — nunca Diego ni Matías.
 */

export const CREDS_PATH = path.join(os.tmpdir(), "corpus-e2e-user.json");

export interface E2ECreds {
  email: string;
  password: string;
}

/** Carga mínima de .env.local (sin dependencias): el proceso de Playwright no lo
 *  hace solo, y global-setup necesita las claves del servidor. */
function loadEnvLocal(): void {
  const p = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export default async function globalSetup(): Promise<void> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "e2e: faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (ponlos en .env.local o en el entorno).",
    );
  }

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now();
  const email = `valentina.e2e+${stamp}@ejemplo.cl`;
  const password = `Vr-${Math.random().toString(36).slice(2, 12)}-2026!`;

  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`e2e: no se pudo crear el usuario de prueba: ${error.message}`);

  const creds: E2ECreds = { email, password };
  writeFileSync(CREDS_PATH, JSON.stringify(creds), "utf8");
  // eslint-disable-next-line no-console
  console.log(`[e2e] usuario de prueba creado: ${email}`);
}
