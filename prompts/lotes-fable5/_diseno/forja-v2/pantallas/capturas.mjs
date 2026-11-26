// Capturas de panel-datos (Forja v2): Panel, Master, Revisión y Variantes en
// escritorio y móvil, con la cuenta de prueba LOCAL (supabase/cuenta-prueba.json).
// Uso: node prompts/lotes-fable5/_diseno/forja-v2/pantallas/capturas.mjs [baseURL]
// Requiere `npm run dev:local` corriendo (DA-V3: nunca contra el Supabase remoto).
// Si la cuenta está vacía, la llena SIN IA: Importar → .md con
// material-perfil/corpus-plantilla-AKHAN-v2.md, acepta lo verificado y crea una
// variante manual; así las cuatro pantallas se ven con datos reales.
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

async function sembrar(pag) {
  const leer = async (ruta) => (await pag.request.get(BASE + ruta)).json();
  const { summary } = await leer("/api/master?summary=1");
  if (summary.masterItems === 0) {
    if (summary.pendingStaging === 0) {
    await pag.goto(BASE + "/app/importar", { waitUntil: "networkidle", timeout: 120_000 });
    await pag
      .locator('input[type="file"][accept=".md,.markdown,text/markdown"]')
      .setInputFiles("material-perfil/corpus-plantilla-AKHAN-v2.md");
    await pag.locator("#plConfirm").click({ timeout: 60_000 });
    await pag.waitForURL(/\/app\/staging/, { timeout: 120_000 });
    } else {
      await pag.goto(BASE + "/app/staging", { waitUntil: "networkidle", timeout: 120_000 });
    }
    await pag.waitForLoadState("networkidle");
    await pag.getByRole("button", { name: /Aceptar todo lo verificado/ }).click({ timeout: 60_000 });
    await pag.waitForTimeout(4000);
    console.log("cuenta sembrada con la plantilla .md (sin IA)");
  }
  const { variants = [] } = await leer("/api/variants");
  if (variants.length === 0) {
    const r = await pag.request.post(BASE + "/api/variants", { data: { mode: "manual", name: "AI/ML Engineer" } });
    console.log(`variante manual: HTTP ${r.status()}`);
  }
}

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
  pag.on("pageerror", (e) =>
    errores.push(`${t.sufijo} ${pag.url()}: ${e.message} · ${(e.stack ?? "").split("\n").slice(0, 3).join(" | ")}`),
  );
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
  if (t.sufijo === "escritorio") await sembrar(pag);
  for (const v of VISTAS) {
    // El servidor de desarrollo es COMPARTIDO y otros trabajadores recompilan a la
    // vez: un chunk servido a medio escribir da «Invalid or unexpected token». Se
    // reintenta la carga (hasta 3) y se anota cada intento fallido.
    for (let intento = 1; intento <= 3; intento++) {
      let fallo = false;
      const alFallar = () => (fallo = true);
      pag.on("pageerror", alFallar);
      const r = await pag.goto(BASE + v.ruta, { waitUntil: "networkidle", timeout: 120_000 });
      if (!r || r.status() >= 400) errores.push(`${v.ruta} → HTTP ${r?.status()}`);
      // Espera a que la pantalla termine de leer sus datos (sin «Leyendo…»/«Cargando…»).
      const cargo = await pag
        .waitForFunction(() => !/Leyendo|Cargando|Reading|Loading/i.test(document.querySelector("main")?.innerText ?? ""), null, {
          timeout: 30_000,
        })
        .then(() => true)
        .catch(() => false);
      pag.off("pageerror", alFallar);
      if (cargo && !fallo) break;
      errores.push(`${t.sufijo} ${v.ruta}: intento ${intento} ${fallo ? "con error de página" : "sin terminar de cargar"}`);
    }
    await pag.waitForTimeout(1500);
    await pag.screenshot({ path: path.join(OUT, `${v.nombre}-${t.sufijo}.png`), fullPage: true });
  }
  await ctx.close();
}
await navegador.close();
console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "capturas ok, sin errores de página");
