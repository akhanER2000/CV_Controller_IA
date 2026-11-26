// Capturas de validación de Forja v2 (shell + muestrario, escritorio y móvil).
// Uso: node prompts/lotes-fable5/_diseno/forja-v2/capturas.mjs [baseURL]
// Requiere un `next dev` en modo local (sin claves de Supabase → sin login).
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3107";
const OUT = path.dirname(fileURLToPath(import.meta.url));

const VISTAS = [
  { nombre: "shell-panel", ruta: "/app" },
  { nombre: "shell-variantes", ruta: "/app/variantes" },
  { nombre: "muestrario", ruta: "/app/muestrario", completa: true },
];
const TAMANOS = [
  { sufijo: "escritorio", viewport: { width: 1440, height: 900 } },
  { sufijo: "carril", viewport: { width: 1024, height: 768 } },
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
  for (const v of VISTAS) {
    if (t.sufijo === "carril" && v.nombre !== "shell-panel") continue;
    await pag.goto("about:blank");
    const r = await pag.goto(BASE + v.ruta, { waitUntil: "networkidle", timeout: 120_000 });
    if (!r || r.status() >= 400) errores.push(`${v.ruta} → HTTP ${r?.status()}`);
    await pag.waitForTimeout(800);
    await pag.screenshot({ path: path.join(OUT, `app-${v.nombre}-${t.sufijo}.png`), fullPage: !!v.completa });
  }
  // El cajón abierto y la búsqueda, en escritorio
  if (t.sufijo === "escritorio") {
    await pag.goto("about:blank");
    await pag.goto(BASE + "/app/muestrario", { waitUntil: "networkidle" });
    await pag.getByRole("button", { name: "Abrir cajón" }).click();
    await pag.waitForTimeout(300);
    await pag.screenshot({ path: path.join(OUT, "app-muestrario-cajon-escritorio.png") });
    // La búsqueda (Ctrl+K) la cubre sonda-busqueda.mjs.
  }
  await ctx.close();
}
await navegador.close();
console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "capturas ok, sin errores de página");
