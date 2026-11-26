// Capturas de las pantallas de cuenta en Forja v2 (escritorio y móvil).
// Uso: node prompts/lotes-fable5/_diseno/forja-v2/pantallas/capturas-cuenta.mjs [baseURL]
// Requiere `npm run dev:local` (Supabase local + cuenta de supabase/cuenta-prueba.json).
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(OUT, "../../../../..");
const cuenta = JSON.parse(readFileSync(path.join(RAIZ, "supabase", "cuenta-prueba.json"), "utf8"));

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

  const hosts = new Set();
  pag.on("request", (r) => {
    if (r.url().includes("/auth/v1/")) hosts.add(new URL(r.url()).host);
  });
  await pag.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 120_000 });
  await pag.locator('input[type="email"]').fill(cuenta.email);
  await pag.locator('input[type="password"]').first().fill(cuenta.password);
  await pag.locator("#auGo").click();
  try {
    await pag.waitForURL(/\/app/, { timeout: 30_000 });
  } catch {
    console.log("login no entró:", pag.url(), "· auth en:", [...hosts].join(", ") || "(ninguna petición)");
    console.log((await pag.locator("main").innerText().catch(() => "")).slice(0, 500));
    process.exit(1);
  }

  // Una variante real para Adaptar y Salud (si la cuenta no tiene, la ruta de ejemplo).
  let idVariante = "sin-variante";
  const lista = await pag.request.get(BASE + "/api/variants").catch(() => null);
  if (lista?.ok()) {
    const j = await lista.json().catch(() => null);
    const arr = Array.isArray(j) ? j : (j?.variants ?? []);
    if (arr[0]?.id) idVariante = arr[0].id;
  }

  const VISTAS = [
    { nombre: "ajustes", ruta: "/app/ajustes" },
    { nombre: "cuenta", ruta: "/app/cuenta" },
    { nombre: "onboarding", ruta: "/app/onboarding" },
    { nombre: "salud", ruta: `/app/variantes/${idVariante}/salud` },
    { nombre: "fuentes", ruta: "/app/fuentes" },
    { nombre: "importar", ruta: "/app/importar" },
    { nombre: "ingesta", ruta: "/app/ingesta" },
    { nombre: "tailor", ruta: `/app/variantes/${idVariante}/tailor` },
  ];
  for (const v of VISTAS) {
    await pag.goto("about:blank");
    const r = await pag.goto(BASE + v.ruta, { waitUntil: "networkidle", timeout: 120_000 });
    if (!r || r.status() >= 400) errores.push(`${v.ruta} → HTTP ${r?.status()}`);
    await pag.waitForTimeout(1200);
    await pag.screenshot({ path: path.join(OUT, `${v.nombre}-${t.sufijo}.png`), fullPage: true });
  }
  await ctx.close();
}
await navegador.close();
console.log(errores.length ? "ERRORES:\n" + errores.join("\n") : "capturas ok, sin errores de página");
