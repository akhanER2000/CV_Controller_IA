// Consola de las pantallas con la cuenta de prueba LOCAL (DA-V3): imprime avisos
// y errores (hidratación incluida) de cada carga completa.
// Uso (Git Bash: MSYS_NO_PATHCONV=1): node .../consola.mjs [--movil] [ruta ...]
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const args = process.argv.slice(2);
const movil = args.includes("--movil");
const rutas = args.filter((a) => a.startsWith("/"));
if (!rutas.length) rutas.push("/app");
const cuenta = JSON.parse(readFileSync("supabase/cuenta-prueba.json", "utf8"));
const nav = await chromium.launch();
const ctx = await nav.newContext(movil ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const pag = await ctx.newPage();
const msgs = [];
pag.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) msgs.push(`[${m.type()}] ${m.text().slice(0, 600)}`);
});
pag.on("pageerror", (e) => msgs.push(`[pageerror] ${e.message.slice(0, 600)}`));
const volcar = (r) => {
  console.log(`== ${r}: ${msgs.length} mensajes`);
  for (const m of msgs) console.log(m);
  msgs.length = 0;
};
await pag.goto(BASE + "/login", { waitUntil: "load", timeout: 120_000 });
await pag.waitForTimeout(2000);
await pag.locator("#em").fill(cuenta.email);
await pag.locator("#pw").fill(cuenta.password);
await pag.locator("#auGo").click();
await pag.waitForURL(/\/app/, { timeout: 60_000 });
await pag.waitForTimeout(4000);
volcar("login → " + new URL(pag.url()).pathname);
for (const r of rutas) {
  await pag.goto(BASE + r, { waitUntil: "load", timeout: 120_000 });
  await pag.waitForTimeout(4000);
  volcar(r);
}
await nav.close();
