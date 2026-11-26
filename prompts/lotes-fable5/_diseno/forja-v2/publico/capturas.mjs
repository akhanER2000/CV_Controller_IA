// Capturas del lote pantallas-forja-v2 · publico (landing y acceso, escritorio y móvil).
// Uso: node prompts/lotes-fable5/_diseno/forja-v2/publico/capturas.mjs [baseURL]
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = path.dirname(fileURLToPath(import.meta.url));
const VISTAS = [
  { nombre: "landing", ruta: "/" },
  { nombre: "landing-completa", ruta: "/", completa: true },
  { nombre: "acceso", ruta: "/login" },
  { nombre: "alta", ruta: "/signup" },
];
const TAMANOS = [
  { sufijo: "escritorio", viewport: { width: 1440, height: 900 } },
  { sufijo: "movil", viewport: { width: 390, height: 844 }, movil: true },
];
const nav = await chromium.launch();
const errores = [];
for (const t of TAMANOS) {
  const ctx = await nav.newContext({ viewport: t.viewport, deviceScaleFactor: t.movil ? 2 : 1, isMobile: !!t.movil, hasTouch: !!t.movil, reducedMotion: "reduce" });
  const pag = await ctx.newPage();
  pag.on("pageerror", (e) => errores.push(`${t.sufijo} ${pag.url()}: ${e.message}`));
  for (const v of VISTAS) {
    const r = await pag.goto(BASE + v.ruta, { waitUntil: "networkidle", timeout: 120_000 });
    if (!r || r.status() >= 400) errores.push(`${v.ruta} → HTTP ${r?.status()}`);
    if (v.completa) {
      // Recorre la página para que se disparen los reveal por IntersectionObserver.
      await pag.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((ok) => setTimeout(ok, 60)); } window.scrollTo(0, 0); });
    }
    await pag.waitForTimeout(900);
    await pag.screenshot({ path: path.join(OUT, `${v.nombre}-${t.sufijo}.png`), fullPage: !!v.completa });
  }
  await ctx.close();
}
await nav.close();
console.log(errores.length ? errores.join("\n") : "sin errores de página");
