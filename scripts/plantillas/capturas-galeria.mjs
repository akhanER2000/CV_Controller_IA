/**
 * Capturas de la galería de plantillas contra el dev:local de AKHAN (puerto 3000),
 * con la cuenta sintética de supabase/cuenta-prueba.json. NUNCA contra el remoto.
 *
 *   node scripts/plantillas/capturas-galeria.mjs
 *
 * Antes: .hnaivo.lock con tu ID (regla del lote); al terminar, "libre".
 * Deja en prompts/lotes-fable5/_diseno/plantillas/:
 *   galeria-01-todas.png      — la galería abierta, filtros a la vista
 *   galeria-02-oro.png        — filtrada por color «Oro viejo»
 *   galeria-03-spectral.png   — filtrada por tipografía «Spectral»
 *   galeria-04-plex.png       — filtrada por «IBM Plex Serif»
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "prompts/lotes-fable5/_diseno/plantillas");
const BASE = process.env.BASE ?? "http://localhost:3000";
const cuenta = JSON.parse(readFileSync(path.join(ROOT, "supabase/cuenta-prueba.json"), "utf8"));

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const pag = await ctx.newPage();
const errores = [];
pag.on("pageerror", (e) => errores.push(e.message.slice(0, 200)));

await pag.goto(BASE + "/login", { waitUntil: "load", timeout: 240_000 });
await pag.waitForTimeout(3000);
await pag.locator("#em").fill(cuenta.email);
await pag.locator("#pw").fill(cuenta.password);
await pag.locator("#auGo").click();
await pag.waitForURL(/\/app/, { timeout: 240_000 });

const { variants = [] } = await (await pag.request.get(BASE + "/api/variants")).json();
if (!variants.length) throw new Error("la cuenta de prueba no tiene variantes");
await pag.goto(`${BASE}/app/variantes/${variants[0].id}`, { waitUntil: "load", timeout: 180_000 });
await pag.waitForTimeout(5000);

// La galería se abre desde la pestaña «Diseño» del panel Documento.
await pag.locator(".doc-tabs [role=tab]").filter({ hasText: /Diseño|Design/ }).first().click();
await pag.locator("button.tplopen").first().click();
const dialogo = pag.locator('[data-screen-label="galeria-plantillas"]');
await dialogo.waitFor({ timeout: 30_000 });

/** Espera a que las miniaturas visibles hayan llegado (o fallado), con tope. */
async function quietas() {
  await pag
    .waitForFunction(
      () => {
        const cards = [...document.querySelectorAll(".tg-card")].slice(0, 8);
        return cards.length > 0 && cards.every((c) => c.querySelector("img.tg-sheet") || c.querySelector(".tg-sheet--fail"));
      },
      null,
      { timeout: 120_000 },
    )
    .catch(() => errores.push("miniaturas sin llegar a tiempo"));
  await pag.waitForTimeout(800);
}

await quietas();
await pag.screenshot({ path: path.join(OUT, "galeria-01-todas.png") });

const [selFont, selColor] = [dialogo.locator(".tg-pickf select").nth(0), dialogo.locator(".tg-pickf select").nth(1)];
await selColor.selectOption("oro");
await quietas();
await pag.screenshot({ path: path.join(OUT, "galeria-02-oro.png") });

await selColor.selectOption("");
await selFont.selectOption("Spectral");
await quietas();
await pag.screenshot({ path: path.join(OUT, "galeria-03-spectral.png") });

await selFont.selectOption("IBM Plex Serif");
await quietas();
const n = await dialogo.locator(".tg-card").count();
await pag.screenshot({ path: path.join(OUT, "galeria-04-plex.png") });

console.log(JSON.stringify({ tarjetasPlex: n, errores }, null, 1));
await nav.close();
