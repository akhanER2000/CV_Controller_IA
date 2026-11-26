// Capturas de panel-datos (Forja v2): Panel, Master, Revisión y Variantes en
// escritorio y móvil, con la cuenta de prueba LOCAL (supabase/cuenta-prueba.json).
// Uso: node prompts/lotes-fable5/_diseno/forja-v2/pantallas/capturas.mjs [baseURL]
// Requiere `npm run dev:local` corriendo.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = path.dirname(fileURLToPath(import.meta.url));
const cuenta = JSON.parse(readFileSync("supabase/cuenta-prueba.json", "utf8"));

const VISTAS = [
  { nombre: "panel", ruta: "/app" },
  { nombre: "master", ruta: "/app/master" },
  { nombre: "revision", ruta: "/app/staging" },
  { nombre: "variantes", ruta: "/app/variantes" },
];
const TAMANOS = [
  { sufijo: "escritorio", viewport: { width: 1440, height: 900 } },
  { sufijo: "movil", viewport: { width: 390, height: 844 }, movil: true },
];

const navegador = await chromium.launch();
const errores = [];
for (const t of TAMANOS) {
  const ctx = await navegador.newContext({
    viewport: t.viewport,
    deviceScaleFactor: t.movil ? 2 : 1,
    isMobile: !!t.movil,
    hasTouch: !!t.movil,
    reducedMotion: "reduce",
  });
  const pag = await ctx.newPage();
  pag.on("pageerror", (e) => errores.push(`${t.sufijo} ${pag.url()}: ${e.message}`));
  pag.on("console", (m) => {
    if (m.type() === "error") errores.push(`${t.sufijo} consola ${pag.url()}: ${m.text().slice(0, 200)}`);
  });
  await pag.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 120_000 });
  await pag.waitForTimeout(1500); // hidratación del formulario
  await pag.locator("#em").fill(cuenta.email);
  await pag.locator("#pw").fill(cuenta.password);
  await pag.locator("#auGo").click();
  try {
    await pag.waitForURL(/\/app/, { timeout: 60_000 });
  } catch (e) {
    console.log("login falló:", (await pag.locator("body").innerText()).slice(0, 500));
    throw e;
  }
  for (const v of VISTAS) {
    const r = await pag.goto(BASE + v.ruta, { waitUntil: "networkidle", timeout: 120_000 });
    if (!r || r.status() >= 400) errores.push(`${v.ruta} → HTTP ${r?.status()}`);
    await pag.waitForTimeout(1500);
    await pag.screenshot({ path: path.join(OUT, `${v.nombre}-${t.sufijo}.png`), fullPage: true });
  }
  await ctx.close();
}
await navegador.close();
console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "capturas ok, sin errores de página");
