// Volcar material → .md (sin IA) de punta a punta, contra dev:local.
// Uso: node prompts/lotes-fable5/_diseno/forja-v2/pantallas/volcado-md.mjs [baseURL]
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(OUT, "../../../../..");
const cuenta = JSON.parse(readFileSync(path.join(RAIZ, "supabase", "cuenta-prueba.json"), "utf8"));
const MD = path.join(RAIZ, "material-perfil", "corpus-plantilla-AKHAN-v2.md");

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1440, height: 900 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(e.message));

await pag.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 120_000 });
await pag.locator('input[type="email"]').fill(cuenta.email);
await pag.locator('input[type="password"]').first().fill(cuenta.password);
await pag.locator("#auGo").click();
await pag.waitForURL(/\/app/, { timeout: 30_000 });

await pag.goto(BASE + "/app/importar", { waitUntil: "networkidle", timeout: 120_000 });
await pag.locator('input[type="file"][accept=".md,.markdown,text/markdown"]').setInputFiles(MD);
const confirmar = pag.locator("#plConfirm");
await confirmar.waitFor({ state: "visible", timeout: 60_000 });
await pag.screenshot({ path: path.join(OUT, "importar-md-informe-escritorio.png"), fullPage: true });
await confirmar.click();
await pag.waitForURL(/\/app\/staging/, { timeout: 120_000 });
await pag.waitForLoadState("networkidle");
await pag.waitForTimeout(1500);
await pag.screenshot({ path: path.join(OUT, "importar-md-staging-escritorio.png") });
const r = await pag.request.get(BASE + "/api/staging");
const cuerpo = r.ok() ? await r.json().catch(() => null) : null;
const n = Array.isArray(cuerpo) ? cuerpo.length : Array.isArray(cuerpo?.items) ? cuerpo.items.length : "?";
console.log(`staging: HTTP ${r.status()} · ítems en staging: ${n}`);
await nav.close();
console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "volcado .md ok, sin errores de página");
