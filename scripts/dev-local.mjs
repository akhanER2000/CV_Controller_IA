#!/usr/bin/env node
// npm run dev:local — levanta un Supabase local (Docker) con las migraciones y una
// cuenta de prueba sintética, y arranca `next dev` apuntando a él. No escribe claves
// en ningún archivo: salen de `supabase status -o env` y viajan solo en el entorno
// del proceso hijo (que manda sobre .env.local). `npm run dev` sigue siendo el remoto.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const win = process.platform === "win32";

// supabase en el PATH o en la ruta conocida de este equipo.
function localizaSupabase() {
  const prueba = spawnSync("supabase", ["--version"], { encoding: "utf8" });
  if (prueba.status === 0) return "supabase";
  const conocido = "J:\\DevToolsApps\\Supabase\\supabase.exe";
  if (existsSync(conocido)) return conocido;
  return null;
}

function sal(msg) {
  console.error(`\n[dev:local] ${msg}\n`);
  process.exit(1);
}

const docker = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
if (docker.status !== 0) {
  sal("Docker no responde. Abre Docker Desktop, espera a que diga «running» y repite npm run dev:local.");
}

const sb = localizaSupabase();
if (!sb) sal("No encuentro la CLI de Supabase (ni en el PATH ni en J:\\DevToolsApps\\Supabase\\supabase.exe).");

function corre(args, opts = {}) {
  return spawnSync(sb, args, { cwd: raiz, shell: false, encoding: "utf8", ...opts });
}

console.log("[dev:local] supabase start (la primera vez descarga imágenes y aplica 0001 a 0007)…");
// stdout (un JSON con claves) se descarta; el progreso va por stderr.
const inicio = corre(["start"], { stdio: ["ignore", "ignore", "inherit"] });
if (inicio.status !== 0) sal("supabase start falló. Revisa el mensaje de arriba (¿puertos 553xx ocupados?).");

const estado = corre(["status", "-o", "env"]);
if (estado.status !== 0) sal("supabase status falló.");
const env = {};
for (const linea of estado.stdout.split(/\r?\n/)) {
  const m = linea.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m) env[m[1]] = m[2];
}
const url = env.API_URL;
const anon = env.ANON_KEY;
const service = env.SERVICE_ROLE_KEY;
if (!url || !anon || !service) sal("No pude leer API_URL / ANON_KEY / SERVICE_ROLE_KEY de supabase status.");

// Cuenta de prueba (API admin; correo ya confirmado). Idempotente.
const cuenta = JSON.parse(readFileSync(join(raiz, "supabase", "cuenta-prueba.json"), "utf8"));
const cab = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
const lista = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers: cab });
if (!lista.ok) sal(`No pude consultar usuarios (${lista.status}).`);
const { users = [] } = await lista.json();
const existente = users.find((u) => u.email === cuenta.email);
if (existente) {
  // Deja la contraseña y la confirmación como dice el archivo, por si cambió.
  await fetch(`${url}/auth/v1/admin/users/${existente.id}`, {
    method: "PUT",
    headers: cab,
    body: JSON.stringify({ password: cuenta.password, email_confirm: true }),
  });
  console.log(`[dev:local] cuenta de prueba ya existía: ${cuenta.email}`);
} else {
  const alta = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: cab,
    body: JSON.stringify({ email: cuenta.email, password: cuenta.password, email_confirm: true }),
  });
  if (!alta.ok) sal(`No pude crear la cuenta de prueba (${alta.status}): ${await alta.text()}`);
  console.log(`[dev:local] cuenta de prueba creada: ${cuenta.email}`);
}

console.log("\n[dev:local] Entra con la cuenta de supabase/cuenta-prueba.json");
console.log("[dev:local] Corpus en http://localhost:3000 (Supabase local en " + url + ")\n");

const next = spawn("npx next dev", {
  cwd: raiz,
  shell: win,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  },
});
next.on("exit", (code) => process.exit(code ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => next.kill(s));
