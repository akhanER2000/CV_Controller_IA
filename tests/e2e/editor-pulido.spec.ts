import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * EDITOR PULIDO (experiencia-editor) — contra el dev:local del 3000 y el Supabase LOCAL:
 *   · LA BARRA NO SE MUEVE: la posición y el tamaño de cada botón de la barra son los
 *     mismos antes, DURANTE «Afinar con IA» (la petición se retiene 2,5 s para medir
 *     a mitad), con la confirmación de «sin respaldo» abierta (va en el panel anclado)
 *     y mientras la vista previa rehace el documento tras «Aplicar»;
 *   · el Progreso aparece por pasos reales («Revisando el respaldo · 1 de 2») y en
 *     posición fija (no ocupa sitio en la barra);
 *   · ENCUADRE DE LA FOTO: subir abre el encuadre; teclado (+, flechas) acerca y
 *     mueve; se guarda la foto recortada (420 × 540, la proporción del CV) y aparte el
 *     original con sus parámetros; el PDF DESCARGADO lleva esos bytes exactos; volver
 *     a «Encuadrar» abre con los mismos parámetros y re-encuadrar cambia la foto sin
 *     perder el original.
 *   · capturas en prompts/lotes-fable5/_diseno/editor-pulido/ (1440 y 390).
 *
 * «Sin respaldo» es el alcance de aptitudes: no llama a la IA (no gasta tokens).
 *
 *   npm run test:e2e:local -- tests/e2e/editor-pulido.spec.ts
 */

const CAPS = path.join(process.cwd(), "prompts/lotes-fable5/_diseno/editor-pulido");

async function crearUsuario(): Promise<{ email: string; password: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("solo contra el Supabase local");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `editor.pulido+${Date.now()}@ejemplo.cl`;
  const password = `Ep-${Math.random().toString(36).slice(2, 12)}-2026!`;
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
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

const cap = async (page: Page, nombre: string) => {
  mkdirSync(CAPS, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(CAPS, nombre) });
};

async function esperarPreview(page: Page) {
  await expect(page.locator(".pv-frame")).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".pv-busy")).toHaveCount(0, { timeout: 90_000 });
}

async function abrir(page: Page, id: string) {
  for (let i = 0; i < 5; i += 1) {
    try {
      await page.goto(`/app/variantes/${id}`);
      await esperarPreview(page);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1200);
      await expect(page.locator("#edAfinar")).toBeVisible();
      return;
    } catch {
      /* reintento */
    }
  }
  throw new Error("el editor no abrió estable");
}

type Caja = { k: string; x: number; y: number; w: number; h: number };
/** Cada botón y enlace de la barra (fuera de los paneles flotantes): dónde está y cuánto mide. */
const posiciones = (page: Page): Promise<Caja[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".ed-bar a, .ed-bar button"))
      .filter((el) => !el.closest(".edx-desp-panel") && el.getClientRects().length > 0)
      .map((el, i) => {
        const r = el.getBoundingClientRect();
        const q = (n: number) => Math.round(n * 2) / 2;
        return { k: el.id || `${i}:${(el.textContent ?? "").trim().slice(0, 18)}`, x: q(r.x), y: q(r.y), w: q(r.width), h: q(r.height) };
      }),
  );
/** Las claves cambian de texto (p. ej. «afinando…»): se compara por orden y geometría. */
const geometria = (cs: Caja[]) => cs.map(({ x, y, w, h }) => ({ x, y, w, h }));

async function basics(req: APIRequestContext, id: string) {
  const r = await req.get(`/api/variants/${id}`);
  expect(r.ok()).toBeTruthy();
  const j = (await r.json()) as { items: { kind: string; override_data: Record<string, unknown> | null }[] };
  return (j.items.find((i) => i.kind === "basics")?.override_data ?? {}) as Record<string, unknown>;
}

const medidas = (page: Page, dataUrl: string) =>
  page.evaluate(
    (src) =>
      new Promise<{ w: number; h: number }>((res, rej) => {
        const im = new Image();
        im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => rej(new Error("no decodifica"));
        im.src = src;
      }),
    dataUrl,
  );

test("editor pulido · la barra no se mueve al afinar, progreso por pasos y foto encuadrada en el PDF", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, await crearUsuario());
  const req = page.request;

  // ── Master pequeño: «Kubernetes» tiene respaldo en una viñeta que queda fuera; «Kafka» ninguno ──
  const crear = async (kind: string, data: Record<string, unknown>, parentId?: string) => {
    const r = await req.post("/api/master", { data: { kind, data, parentId } });
    expect(r.ok(), `POST master ${kind}: ${await r.text()}`).toBeTruthy();
    return ((await r.json()) as { item: { id: string } }).item.id;
  };
  await crear("basics", { name: "Valentina Rojas Fuentes", label: "Backend Engineer", email: "valentina@ejemplo.cl" });
  await crear("summary", { text: "Ingeniera backend con 6 años en pagos y plataformas." });
  const w1 = await crear("work", { title: "Backend Engineer", company: "Fintech Andina", dates: "2021 – 2024" });
  await crear("bullet", { text: "Reduje la latencia p95 del API de pagos de 850 ms a 210 ms con caché en Redis." }, w1);
  const fuera = await crear("bullet", { text: "Lideré la migración del monolito a servicios en Kubernetes junto al equipo de plataforma." }, w1);
  await crear("skill", { group: "Backend", items: "Redis, Kubernetes, Kafka" });
  const master = ((await (await req.get("/api/master")).json()) as { items: { id: string }[] }).items;

  const nueva = await req.post("/api/variants", { data: { mode: "manual", name: "Pulido e2e" } });
  expect(nueva.ok(), await nueva.text()).toBeTruthy();
  const vid = ((await nueva.json()) as { variant: { id: string } }).variant.id;
  for (const m of master.filter((x) => x.id !== fuera)) {
    const a = await req.post(`/api/variants/${vid}/items`, { data: { item_id: m.id } });
    expect(a.ok(), `añadir: ${await a.text()}`).toBeTruthy();
  }

  await abrir(page, vid);
  await cap(page, "01-barra-reposo-escritorio.png");
  const antes = await posiciones(page);
  expect(antes.length).toBeGreaterThan(8);

  // ── 1 · DURANTE afinar: la petición se retiene para medir a mitad ──
  let soltar: () => void = () => {};
  const retenida = new Promise<void>((r) => (soltar = r));
  await page.route(`**/api/variants/${vid}/afinar`, async (route) => {
    await retenida;
    await route.continue();
  });
  await page.locator("#edAfinar").click();
  await expect(page.locator("#edAfinarPanel")).toBeVisible();
  expect(geometria(await posiciones(page)), "abrir el panel de afinar no mueve la barra").toEqual(geometria(antes));
  await cap(page, "02-afinar-panel-escritorio.png");
  await page.locator('button[data-alcance="skills"]').click();
  const prog = page.locator("#edProgreso");
  await expect(prog).toContainText("Revisando el respaldo · 1 de 2");
  expect(await prog.evaluate((el) => getComputedStyle(el).position), "el progreso no ocupa sitio en la barra").toBe("fixed");
  expect(geometria(await posiciones(page)), "DURANTE afinar la barra no se mueve").toEqual(geometria(antes));
  await cap(page, "03-afinando-progreso-escritorio.png");
  soltar();

  // ── 2 · La confirmación va en el panel anclado, no en la barra ──
  const conf = page.locator("#edAfinarRespaldo");
  await expect(conf).toBeVisible({ timeout: 60_000 });
  expect(await conf.evaluate((el) => Boolean(el.closest(".edx-desp-panel"))), "la confirmación vive en el panel").toBe(true);
  await expect(prog).not.toContainText("Revisando");
  expect(geometria(await posiciones(page)), "con la confirmación abierta la barra no se mueve").toEqual(geometria(antes));
  await cap(page, "04-confirmacion-panel-escritorio.png");

  // ── 3 · Aplicar: la vista previa rehace el documento (paso 2 de 2) y la barra sigue quieta ──
  await page.locator("#edAfinarRespAplicar").click();
  await expect(prog).toContainText("Midiendo el documento · 2 de 2", { timeout: 30_000 });
  expect(geometria(await posiciones(page)), "mientras la vista previa mide, la barra no se mueve").toEqual(geometria(antes));
  await expect(prog).not.toHaveAttribute("data-activo", "", { timeout: 90_000 });
  await expect(page.locator("#edAfinarRes")).toBeVisible();
  expect(geometria(await posiciones(page)), "con el resumen abierto la barra no se mueve").toEqual(geometria(antes));
  await cap(page, "05-resumen-panel-escritorio.png");
  await page.keyboard.press("Escape");
  await page.unroute(`**/api/variants/${vid}/afinar`);

  // ── 4 · Encuadre de la foto ──
  const doc = page.locator('[data-sec="doc"]');
  await doc.scrollIntoViewIfNeeded();
  await doc.getByRole("tab", { name: "Presentación" }).click();
  // Una imagen conocida: 800 × 600 con cuatro cuadrantes de color.
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 600;
    const x = c.getContext("2d")!;
    const cols = ["rgb(200,60,40)", "rgb(40,120,200)", "rgb(60,170,90)", "rgb(230,190,40)"];
    cols.forEach((col, i) => {
      x.fillStyle = col;
      x.fillRect((i % 2) * 400, Math.floor(i / 2) * 300, 400, 300);
    });
    return c.toDataURL("image/png").split(",")[1]!;
  });
  const elegir = page.waitForEvent("filechooser");
  await page.getByLabel("Incluir foto en esta variante").click();
  const fc = await elegir;
  await fc.setFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });

  const marco = page.locator("#edEncMarco");
  await expect(marco).toBeVisible({ timeout: 30_000 });
  await expect(marco.locator("img")).toBeVisible();
  await marco.focus();
  for (let i = 0; i < 10; i += 1) await page.keyboard.press("+");
  for (let i = 0; i < 4; i += 1) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowUp");
  await expect(marco).toHaveAttribute("data-zoom", "2");
  await cap(page, "06-encuadre-escritorio.png");
  const guardado = page.waitForResponse((r) => r.url().endsWith(`/api/variants/${vid}`) && r.request().method() === "PATCH");
  await page.locator("#edEncGuardar").click();
  expect((await guardado).ok()).toBeTruthy();
  await expect(marco).toBeHidden();

  const b1 = await basics(req, vid);
  const foto1 = String(b1.photo ?? "");
  const enc1 = b1.photoEncuadre as { src: string; zoom: number; cx: number; cy: number };
  expect(foto1).toMatch(/^data:image\/jpeg;base64,/);
  expect(await medidas(page, foto1), "la foto guardada tiene la proporción del CV").toEqual({ w: 420, h: 540 });
  expect(enc1.zoom).toBe(2);
  expect(enc1.cx).toBeGreaterThan(0.5);
  expect(enc1.cy).toBeLessThan(0.5);
  expect(await medidas(page, enc1.src), "el original se conserva entero").toEqual({ w: 800, h: 600 });

  // ── 5 · El PDF descargado lleva ESA foto (los bytes JPEG van tal cual en el PDF) ──
  await esperarPreview(page);
  const descarga = page.waitForEvent("download", { timeout: 120_000 });
  await page.locator("#btnPdf").click();
  const d = await descarga;
  const pdf = readFileSync((await d.path())!);
  const jpeg1 = Buffer.from(foto1.split(",")[1]!, "base64");
  expect(pdf.indexOf(jpeg1), "la foto encuadrada sale en el PDF descargado").toBeGreaterThan(0);

  // ── 6 · Re-encuadrar: abre con los mismos parámetros; cambia la foto, no el original ──
  await page.locator("#edFotoEncuadrar").click();
  await expect(marco).toBeVisible();
  await expect(marco).toHaveAttribute("data-zoom", "2");
  await expect(marco).toHaveAttribute("data-cx", String(Math.round(enc1.cx * 1000) / 1000));
  await marco.focus();
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("-");
  await expect(marco).toHaveAttribute("data-zoom", "1.5");
  const guardado2 = page.waitForResponse((r) => r.url().endsWith(`/api/variants/${vid}`) && r.request().method() === "PATCH");
  await page.locator("#edEncGuardar").click();
  expect((await guardado2).ok()).toBeTruthy();
  const b2 = await basics(req, vid);
  const enc2 = b2.photoEncuadre as { src: string; zoom: number };
  expect(String(b2.photo), "re-encuadrar cambia la foto").not.toBe(foto1);
  expect(enc2.zoom).toBe(1.5);
  expect(enc2.src, "el original no se toca").toBe(enc1.src);
  await esperarPreview(page);
  const pdf2 = await req.post("/api/cv", { data: { variantId: vid, paginas: 2 } });
  expect(pdf2.ok()).toBeTruthy();
  const jpeg2 = Buffer.from(String(b2.photo).split(",")[1]!, "base64");
  expect(Buffer.from(await pdf2.body()).indexOf(jpeg2), "el PDF lleva la foto re-encuadrada").toBeGreaterThan(0);
  await cap(page, "07-foto-encuadrada-escritorio.png");

  // ── 7 · Móvil (390): barra, panel de afinar, progreso y encuadre ──
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await cap(page, "08-barra-movil.png");
  const antesMovil = await posiciones(page);
  let soltarM: () => void = () => {};
  const retenidaM = new Promise<void>((r) => (soltarM = r));
  await page.route(`**/api/variants/${vid}/afinar`, async (route) => {
    await retenidaM;
    await route.continue();
  });
  await page.locator("#edAfinar").click();
  await cap(page, "09-afinar-panel-movil.png");
  await page.locator('button[data-alcance="skills"]').click();
  await expect(prog).toContainText("1 de 2");
  expect(geometria(await posiciones(page)), "en móvil, durante afinar la barra tampoco se mueve").toEqual(geometria(antesMovil));
  await cap(page, "10-afinando-progreso-movil.png");
  soltarM();
  await expect(prog).not.toHaveAttribute("data-activo", "", { timeout: 60_000 });
  await page.keyboard.press("Escape");
  await page.unroute(`**/api/variants/${vid}/afinar`);
  await page.locator('.ed-tabs [data-view="mid"]').click().catch(() => {});
  await page.locator("#edFotoEncuadrar").scrollIntoViewIfNeeded();
  await page.locator("#edFotoEncuadrar").click();
  await expect(marco).toBeVisible();
  await cap(page, "11-encuadre-movil.png");
  await page.locator("#edEncCancelar").click();
  await expect(marco).toBeHidden();

  writeFileSync(
    path.join(CAPS, "medidas.json"),
    JSON.stringify({ fecha: new Date().toISOString(), escritorio: antes, movil: antesMovil, encuadre: [enc1.zoom, enc2.zoom] }, null, 2) + "\n",
  );
});
