// Carga cada ruta del shell y lista errores de página / consola.
import { chromium } from "@playwright/test";
const BASE = process.argv[2] ?? "http://localhost:3107";
const RUTAS = ["/app", "/app/master", "/app/variantes", "/app/fuentes", "/app/ajustes", "/app/muestrario"];
const b = await chromium.launch();
for (const r of RUTAS) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message.split("\n")[0]));
  await p.goto(BASE + r, { waitUntil: "networkidle", timeout: 120000 });
  await p.waitForTimeout(500);
  console.log(r, errs.length ? errs.join(" | ") : "ok");
  await p.close();
}
await b.close();
