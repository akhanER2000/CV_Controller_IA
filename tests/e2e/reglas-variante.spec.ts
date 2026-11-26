import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy, getResolvedPDFJS } from "unpdf";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * REGLAS POR VARIANTE (DA-R1, lote ajuste-y-reglas · reglas-variante) contra el
 * dev:local del 3000 y el Supabase LOCAL (0012 aplicada):
 *   · en Variantes, el bloque plegable «Reglas» con «Máximo 2 páginas» + «No
 *     mencionar Unity» + «Sin foto», y «Nueva variante» las guarda con ella;
 *   · el master SÍ menciona Unity (resumen, viñeta, habilidades y un proyecto) y la
 *     variante SÍ lleva foto: el PDF que arma el servidor sale con ≤2 páginas, sin
 *     «Unity» y sin ninguna imagen;
 *   · la pestaña «Reglas» del editor enseña las tres reglas y su estado (cumple).
 *
 * Capturas en prompts/lotes-fable5/_diseno/reglas/.
 *
 *   npm run test:e2e:local -- tests/e2e/reglas-variante.spec.ts
 */

const DISENO = path.resolve(process.cwd(), "prompts/lotes-fable5/_diseno/reglas");
// PNG 2×2 rojo: una foto real, para que «Sin foto» tenga algo que apagar.
const FOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("solo contra el Supabase local");
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function crearUsuario(): Promise<{ email: string; password: string }> {
  const email = `reglas.variante+${Date.now()}@ejemplo.cl`;
  const password = `Rv-${Math.random().toString(36).slice(2, 12)}-2026!`;
  const { error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`no se pudo crear el usuario: ${error.message}`);
  return { email, password };
}

async function login(page: Page, cuenta: { email: string; password: string }) {
  // Sin la sesión del usuario global (storageState): /login redirigiría a /app.
  await page.context().clearCookies();
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

async function crearItem(page: Page, kind: string, data: Record<string, unknown>, parentId?: string): Promise<string> {
  const r = await page.request.post("/api/master", { data: { kind, data, parentId } });
  expect(r.ok(), `POST /api/master ${kind}: ${await r.text()}`).toBe(true);
  return ((await r.json()) as { item: { id: string } }).item.id;
}

async function imagenesDelPdf(buf: Buffer): Promise<{ paginas: number; imagenes: number; texto: string }> {
  const { OPS } = await getResolvedPDFJS();
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  let imagenes = 0;
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const ops = await (await pdf.getPage(n)).getOperatorList();
    const fns = Array.from(ops.fnArray as ArrayLike<number>);
    expect(fns.includes(OPS.showText) || fns.includes(OPS.showSpacedText), "lector ciego").toBe(true);
    imagenes += fns.filter((f) => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject).length;
  }
  const pdf2 = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf2, { mergePages: true });
  return { paginas: pdf.numPages, imagenes, texto: text };
}

test.use({ viewport: { width: 1440, height: 1000 } });

test("reglas · Máximo 2 páginas + No mencionar Unity + Sin foto llegan al PDF", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(DISENO, { recursive: true });
  const cuenta = await crearUsuario();
  await login(page, cuenta);

  // ── El master MENCIONA Unity en todas las capas ──────────────────────────────
  const ids: string[] = [];
  ids.push(await crearItem(page, "basics", { name: "Ana Reglas", label: "Backend Engineer", email: "ana@ejemplo.cl" }));
  ids.push(await crearItem(page, "summary", { text: "Ingeniera backend con foco en pagos. Hice juegos en Unity en la universidad." }));
  const work = await crearItem(page, "work", { title: "Backend Engineer", company: "Altiplano", dates: "2021 — 2024" });
  ids.push(work);
  ids.push(await crearItem(page, "bullet", { text: "Reduje la latencia del checkout de 850 ms a 180 ms." }, work));
  ids.push(await crearItem(page, "bullet", { text: "Porté el cliente de realidad virtual a Unity3D." }, work));
  ids.push(await crearItem(page, "skill", { group: "Motores", items: "Unity, Godot" }));
  ids.push(await crearItem(page, "skill", { group: "Backend", items: "Go, Postgres, Redis" }));
  ids.push(await crearItem(page, "project", { name: "Plataformas 2D", description: "juego hecho en Unity para una game jam" }));

  // ── Variantes: el bloque «Reglas» y la puerta «Nueva variante» ───────────────
  await page.goto("/app/variantes");
  await page.waitForLoadState("networkidle");
  const bloque = page.locator("details.rg--plegable").first();
  await bloque.locator("summary").click();
  await bloque.getByRole("button", { name: "Máximo 2 páginas" }).click();
  await bloque.getByRole("button", { name: "Sin foto" }).click();
  const termino = bloque.getByLabel("No mencionar…");
  await termino.fill("Unity");
  await termino.press("Enter");
  await expect(bloque.locator(".rg-chip--on", { hasText: "Unity" })).toBeVisible();
  await expect(bloque.locator("summary")).toContainText("3 activas");
  await bloque.screenshot({ path: path.join(DISENO, "variantes-bloque-reglas.png") });
  await page.screenshot({ path: path.join(DISENO, "variantes-reglas-escritorio.png"), fullPage: false });

  await page.getByLabel("Nombre de la nueva variante").fill("Backend sin Unity");
  await page.getByRole("button", { name: "Nueva variante (vacía)" }).click();
  await page.waitForURL(/\/app\/variantes\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const variantId = page.url().match(/variantes\/([0-9a-f-]{36})/)![1]!;

  // La variante nació con sus reglas y con el objetivo de páginas del máximo.
  const det = (await (await page.request.get(`/api/variants/${variantId}`)).json()) as {
    variant: { reglas: { paginasMax: number; excluirTerminos: string[]; sinFoto: boolean }; paginas_objetivo: number };
  };
  expect(det.variant.reglas).toMatchObject({ paginasMax: 2, excluirTerminos: ["Unity"], sinFoto: true });
  expect(det.variant.paginas_objetivo).toBe(2);

  // Todo el master entra en la variante, y la variante lleva FOTO.
  for (const id of ids) {
    const r = await page.request.post(`/api/variants/${variantId}/items`, { data: { item_id: id } });
    expect(r.ok(), await r.text()).toBe(true);
  }
  const pres = await page.request.patch(`/api/variants/${variantId}`, { data: { presentation: { photo: FOTO } } });
  expect(pres.ok(), await pres.text()).toBe(true);
  expect(((await pres.json()) as { presentation: { photo: string } }).presentation.photo).toBe(FOTO);

  // ── El PDF del servidor: ≤2 páginas, sin Unity, sin imagen ───────────────────
  const cv = await page.request.post("/api/cv", { data: { variantId, paginas: 2 } });
  expect(cv.ok(), await cv.text()).toBe(true);
  const { paginas, imagenes, texto } = await imagenesDelPdf(Buffer.from(await cv.body()));
  expect(paginas).toBeLessThanOrEqual(2);
  expect(texto).not.toMatch(/unity/i);
  expect(imagenes).toBe(0);
  // Lo que no nombra Unity sigue ahí: el documento se limpia, no se vacía.
  expect(texto).toContain("Ana Reglas");
  expect(texto).toContain("850 ms a 180 ms");
  expect(texto).toContain("Godot");
  expect(texto).toContain("Ingeniera backend con foco en pagos.");

  // ── El editor: pestaña «Reglas» con el estado de cada una ────────────────────
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Reglas" }).click();
  const estado = page.locator(".rg-estado");
  await expect(estado).toBeVisible();
  await expect(estado.locator('li[data-regla="excluirTerminos"]')).toHaveAttribute("data-cumple", "1");
  await expect(estado.locator('li[data-regla="sinFoto"]')).toHaveAttribute("data-cumple", "1");
  await expect(estado.locator('li[data-regla="paginasMax"]')).toHaveAttribute("data-cumple", "1", { timeout: 60_000 });
  await expect(estado.locator('li[data-regla="excluirTerminos"]')).toContainText("se quita del documento");
  await page.mouse.move(0, 0);
  await estado.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await page.screenshot({ path: path.join(DISENO, "editor-pestana-reglas.png") });

  // Móvil: el bloque de Variantes cabe sin scroll horizontal.
  await page.setViewportSize({ width: 390, height: 844 });
  const b2 = page.locator("details.rg--plegable").first();
  for (let i = 0; i < 3; i += 1) {
    await page.goto("/app/variantes");
    await page.waitForLoadState("networkidle");
    try {
      await b2.locator("summary").waitFor({ timeout: 60_000 });
      break;
    } catch {
      /* el dev compartido recompila: otra vuelta */
    }
  }
  await b2.locator("summary").click();
  await b2.scrollIntoViewIfNeeded();
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(ancho).toBeLessThanOrEqual(1);
  await page.screenshot({ path: path.join(DISENO, "variantes-reglas-movil.png"), fullPage: false });
});
