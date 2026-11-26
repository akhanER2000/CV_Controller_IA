import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * VARIANTES · FECHAS, ORDEN Y PROGRESO (lote ajuste-y-experiencia, variantes-fechas)
 * contra el dev:local del 3000 y el Supabase LOCAL:
 *   · cada tarjeta dice «Creada <fecha> · Editada <hoy hh:mm | fecha>» con la hora
 *     completa en el title;
 *   · los cuatro órdenes (más recientes, más antiguas, editadas recientemente, nombre)
 *     dan cuatro secuencias distintas, y la elección sobrevive a recargar;
 *   · «Crear con IA» y leer una plantilla .md enseñan el Progreso por pasos sin mover
 *     el botón ni la zona de carga.
 *
 * Fechas: created_at se fija con el service role del Supabase local; updated_at lo
 * toca el trigger (touch_updated_at) en cada update, así que su orden es el orden de
 * esos updates. Tres variantes, cuatro permutaciones distintas:
 *   recientes  Beta · Álvaro · Zeta      antiguas  Zeta · Álvaro · Beta
 *   nombre     Álvaro · Beta · Zeta      editadas  Beta · Zeta · Álvaro
 *
 * «Crear con IA»: la respuesta de POST /api/variants se FIJA tras una espera (el
 * modelo no es lo que se prueba aquí, sino la espera visible) y apunta a una
 * variante real del usuario. La plantilla .md va al servidor de verdad (sin IA,
 * confirmar:false → no escribe), solo con una espera delante.
 *
 * Capturas en prompts/lotes-fable5/_diseno/variantes-fechas/ (escritorio y móvil).
 *
 *   npm run test:e2e:local -- tests/e2e/variantes-fechas.spec.ts
 */

const DISENO = path.resolve(process.cwd(), "prompts/lotes-fable5/_diseno/variantes-fechas");
const DIA = 86_400_000;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("solo contra el Supabase local");
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function crearUsuario(): Promise<{ email: string; password: string }> {
  const email = `variantes.fechas+${Date.now()}@ejemplo.cl`;
  const password = `Vf-${Math.random().toString(36).slice(2, 12)}-2026!`;
  const { error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`no se pudo crear el usuario: ${error.message}`);
  return { email, password };
}

async function login(page: Page, cuenta: { email: string; password: string }) {
  for (let i = 0; i < 4; i += 1) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(cuenta.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(cuenta.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    try {
      await page.waitForURL(/\/app/, { timeout: 30_000 });
      return;
    } catch {
      /* reintento (Fast Refresh en un dev compartido) */
    }
  }
  throw new Error("no se pudo entrar");
}

/** Nombres de las tarjetas visibles, en el orden en que se pintan. */
async function nombres(page: Page): Promise<string[]> {
  return (await page.locator(".vr-list .vr-row .vr-name").allTextContents()).map((s) => s.trim());
}

test("variantes · fechas reales, cuatro órdenes recordados y progreso sin mover botones", async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(DISENO, { recursive: true });
  const supabaseVisto = new Set<string>();
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/auth/v1") || u.pathname.startsWith("/rest/v1") || u.hostname.endsWith("supabase.co")) {
      supabaseVisto.add(u.host);
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, await crearUsuario());
  const req = page.request;

  // ── Master mínimo (sin master no hay de dónde crear) ──
  for (const [kind, data] of [
    ["basics", { name: "Valentina Rojas Fuentes", label: "Backend Engineer", email: "valentina@ejemplo.cl" }],
    ["summary", { text: "Ingeniera backend con 6 años en pagos y plataformas." }],
    ["work", { title: "Backend Engineer", company: "Fintech Andina", dates: "2021 – 2024" }],
  ] as const) {
    const r = await req.post("/api/master", { data: { kind, data } });
    expect(r.ok(), `POST master ${kind}: ${await r.text()}`).toBeTruthy();
  }

  // ── Tres variantes con fechas de creación conocidas ──
  const ids: Record<string, string> = {};
  for (const nm of ["Beta remoto", "Álvaro fintech", "Zeta academia"]) {
    const r = await req.post("/api/variants", { data: { mode: "manual", name: nm } });
    expect(r.ok(), await r.text()).toBeTruthy();
    ids[nm] = ((await r.json()) as { variant: { id: string } }).variant.id;
  }
  const ahora = Date.now();
  const sb = admin();
  // Orden de los updates = orden de updated_at (trigger): Álvaro, Zeta, Beta.
  for (const [nm, dias] of [
    ["Álvaro fintech", 56],
    ["Zeta academia", 150],
    ["Beta remoto", 1],
  ] as const) {
    const { error } = await sb
      .from("cv_variants")
      .update({ created_at: new Date(ahora - dias * DIA).toISOString() })
      .eq("id", ids[nm]!);
    expect(error, error?.message).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
  }

  // ── La API expone created_at ──
  const lista = (await (await req.get("/api/variants")).json()) as { variants: { name: string; createdAt: string }[] };
  const beta = lista.variants.find((v) => v.name === "Beta remoto")!;
  expect(Math.abs(new Date(beta.createdAt).getTime() - (ahora - DIA)), "createdAt real en /api/variants").toBeLessThan(5_000);

  await page.evaluate(() => window.localStorage.removeItem("corpus.variantes.orden"));
  await page.goto("/app/variantes");
  await expect(page.locator(".vr-list .vr-row")).toHaveCount(3, { timeout: 60_000 });

  // ── Fechas reales en la tarjeta ──
  const meta = page.locator(".vr-row", { hasText: "Zeta academia" }).locator(".meta");
  await expect(meta).toContainText(/Creada \d{1,2} \w{3,5}\.? \d{4}/);
  await expect(meta).toContainText(/Editada hoy \d{2}:\d{2}/);
  const tCreada = await meta.locator("time").first().getAttribute("title");
  expect(tCreada, "la hora completa va en el title").toMatch(/\d{4}.*\d{2}:\d{2}/);

  // ── Los cuatro órdenes (por defecto: editadas recientemente) ──
  const orden = page.getByTestId("vr-orden");
  await expect(orden).toHaveValue("editadas");
  expect(await nombres(page)).toEqual(["Beta remoto", "Zeta academia", "Álvaro fintech"]);
  await orden.selectOption("recientes");
  expect(await nombres(page)).toEqual(["Beta remoto", "Álvaro fintech", "Zeta academia"]);
  await orden.selectOption("antiguas");
  expect(await nombres(page)).toEqual(["Zeta academia", "Álvaro fintech", "Beta remoto"]);
  await orden.selectOption("nombre");
  expect(await nombres(page)).toEqual(["Álvaro fintech", "Beta remoto", "Zeta academia"]);

  // El orden convive con el filtro y se recuerda al recargar.
  await page.getByRole("tab", { name: /Al día/ }).click();
  expect(await nombres(page)).toEqual(["Álvaro fintech", "Beta remoto", "Zeta academia"]);
  await page.getByRole("tab", { name: /Todas/ }).click();
  await page.reload();
  await expect(page.locator(".vr-list .vr-row")).toHaveCount(3, { timeout: 60_000 });
  await expect(orden).toHaveValue("nombre");
  expect(await nombres(page)).toEqual(["Álvaro fintech", "Beta remoto", "Zeta academia"]);

  await orden.selectOption("recientes");
  await page.waitForTimeout(600); // reveal del sistema
  await page.screenshot({ path: path.join(DISENO, "variantes-escritorio.png"), fullPage: true });

  // ── Progreso al «Crear con IA», sin mover el botón ──
  await page.route("**/api/variants", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((r) => setTimeout(r, 2_500));
    await route.fulfill({ json: { variant: { id: ids["Beta remoto"], name: "Beta remoto" }, notes: null } });
  });
  await page.locator("#aiPrompt").fill("Backend para fintech, en español");
  const btnIA = page.locator(".vr-hero .vr-puerta--ia button");
  const antes = await btnIA.boundingBox();
  await btnIA.click();
  const prog = page.locator("#vr-progreso");
  await expect(prog).toHaveAttribute("data-activo", "");
  await expect(prog).toContainText("La IA arma la variante desde tu master · 1 de 2");
  const durante = await btnIA.boundingBox();
  expect(durante, "el botón no se mueve ni cambia de ancho").toEqual(antes);
  await page.screenshot({ path: path.join(DISENO, "variantes-progreso-ia.png") });
  await page.waitForURL(new RegExp(`/app/variantes/${ids["Beta remoto"]}`), { timeout: 30_000 });
  await page.unroute("**/api/variants");

  // ── Progreso al leer una plantilla .md (Importar, puerta 3), sin mover la zona ──
  await page.route("**/api/import/corpus-md", async (route) => {
    await new Promise((r) => setTimeout(r, 2_500));
    await route.continue();
  });
  await page.goto("/app/importar");
  const drop = page.locator("#plDrop");
  await drop.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1_200); // entrada (reveal) del sistema: la captura no sale en blanco
  // Posición en la PÁGINA (no en la ventana): lo que no debe moverse es el
  // contenido; si la ventana se desplaza, eso no es un salto del diseño.
  const enPagina = () => drop.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const px = (n: number) => Math.round(n / 2) * 2; // tolerancia sub-píxel
    return { x: px(r.x + window.scrollX), y: px(r.y + window.scrollY), w: px(r.width), h: px(r.height), sy: window.scrollY };
  });
  const zonaAntes = await enPagina();
  const chooser = page.waitForEvent("filechooser");
  await drop.click();
  await (await chooser).setFiles({
    name: "plantilla.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Valentina Rojas Fuentes\n\n## Experiencia\n\n### Backend Engineer · Fintech Andina\n\n- Reduje la latencia p95 del API de pagos.\n"),
  });
  const progImp = page.locator("#imp-progreso");
  await expect(progImp).toHaveAttribute("data-activo", "");
  await expect(progImp).toContainText("Analizando la plantilla, sin IA · 2 de 2");
  const zonaDurante = await enPagina();
  console.log("[variantes-fechas] zona antes/durante", JSON.stringify(zonaAntes), JSON.stringify(zonaDurante));
  expect({ ...zonaDurante, sy: 0 }, "la zona de carga no se mueve").toEqual({ ...zonaAntes, sy: 0 });
  await page.screenshot({ path: path.join(DISENO, "importar-progreso-md.png") });
  await expect(progImp).not.toHaveAttribute("data-activo", "", { timeout: 60_000 });
  await page.unroute("**/api/import/corpus-md");

  // ── Móvil ──
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/variantes");
  await expect(page.locator(".vr-list .vr-row")).toHaveCount(3, { timeout: 60_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(DISENO, "variantes-movil.png"), fullPage: true });

  for (const h of supabaseVisto) expect(h, "solo el Supabase local").toMatch(/^(127\.0\.0\.1|localhost):/);
});
