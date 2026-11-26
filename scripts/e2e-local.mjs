#!/usr/bin/env node
// npm run test:e2e:local [-- <specs y flags de playwright>] — corre Playwright contra
// el dev:local que ya está en el 3000 (no levanta ni reinicia nada). Las claves del
// Supabase LOCAL salen de `supabase status -o env` y viajan SOLO en el entorno del
// proceso hijo: no se escriben en ningún archivo ni se imprimen. Mandan sobre .env.local.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const win = process.platform === "win32";

function sal(msg) {
  console.error(`\n[e2e:local] ${msg}\n`);
  process.exit(1);
}

function localizaSupabase() {
  const prueba = spawnSync("supabase", ["--version"], { encoding: "utf8" });
  if (prueba.status === 0) return "supabase";
  const conocido = "J:\\DevToolsApps\\Supabase\\supabase.exe";
  if (existsSync(conocido)) return conocido;
  return null;
}

const sb = localizaSupabase();
if (!sb) sal("No encuentro la CLI de Supabase (ni en el PATH ni en J:\\DevToolsApps\\Supabase\\supabase.exe).");

const estado = spawnSync(sb, ["status", "-o", "env"], { cwd: raiz, encoding: "utf8" });
if (estado.status !== 0) sal("supabase status falló: ¿está levantado el Supabase local (npm run dev:local)?");
const env = {};
for (const linea of estado.stdout.split(/\r?\n/)) {
  const m = linea.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m) env[m[1]] = m[2];
}
if (!env.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
  sal("No pude leer API_URL / ANON_KEY / SERVICE_ROLE_KEY de supabase status.");
}
console.log(`[e2e:local] Supabase local en ${env.API_URL}; servidor ${process.env.E2E_BASE_URL || "http://localhost:3000"}`);

const hijo = spawn("npx", ["playwright", "test", ...process.argv.slice(2)], {
  cwd: raiz,
  shell: win,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: env.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
  },
});
hijo.on("exit", (code) => process.exit(code ?? 1));
