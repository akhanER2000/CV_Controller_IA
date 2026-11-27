import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

/**
 * «AJUSTAR PÁGINAS» DE UN CLIC, en vivo (DA-A4) — solo contra el Supabase LOCAL.
 *
 * Con la cuenta de prueba local (supabase/cuenta-prueba.json):
 *   1 · el master lleva la plantilla v2 y el complemento del 26-11 (Importar → .md,
 *       sin IA; se importa solo si falta, para no duplicar en cada corrida);
 *   2 · una variante con casi todo (sin referencias), foto y QR, objetivo 2, que ni
 *       a 10 pt cabe; «incluir siempre» sobre una viñeta (DA-R1) si la 0012 está;
 *   3 · UN clic en «Ajustar páginas»: progreso por pasos reales, la barra no se
 *       mueve, y queda aplicada una plantilla (o la a medida) SIN quitar nada;
 *   4 · el PDF real, medido por /api/cv, mide 2 páginas y conserva todos los items;
 *   5 · «Ver otras opciones» y 6 · «Deshacer ajuste» reponen items, plantilla y huella.
 * Capturas en prompts/lotes-fable5/_diseno/ajuste-un-clic/.
 */

const RAIZ = process.cwd();
const DISENO = path.join(RAIZ, "prompts/lotes-fable5/_diseno/ajuste-un-clic");
const DISENO_MEDIDA = path.join(RAIZ, "prompts/lotes-fable5/_diseno/ajuste");
const CUENTA = JSON.parse(readFileSync(path.join(RAIZ, "supabase/cuenta-prueba.json"), "utf8")) as {
  email: string;
  password: string;
};
const MD_V2 = path.join(RAIZ, "material-perfil/corpus-plantilla-AKHAN-v2.md");
const MD_COMPLEMENTO = path.join(RAIZ, "material-perfil/corpus-complemento-AKHAN-2026-11-26.md");

async function login(page: Page) {
  for (let i = 0; i < 4; i += 1) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(CUENTA.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(CUENTA.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    try {
      await page.waitForURL(/\/app/, { timeout: 30_000 });
      return;
    } catch {
      /* reintento (Fast Refresh en un dev compartido) */
    }
  }
  throw new Error("no se pudo entrar con la cuenta de prueba");
}

interface MItem {
  id: string;
  kind: string;
  parentId?: string | null;
  data: Record<string, unknown>;
}
const master = async (req: APIRequestContext) =>
  ((await (await req.get("/api/master")).json()) as { items: MItem[] }).items;

/** Importar → .md (puerta 3, sin IA) y aceptar lo verificado en staging. */
async function importarMd(page: Page, archivo: string) {
  await page.goto("/app/importar");
  const drop = page.locator("#plDrop");
  await drop.scrollIntoViewIfNeeded();
  const chooser = page.waitForEvent("filechooser");
  await drop.click();
  await (await chooser).setFiles(archivo);
  await page.locator("#plConfirm").click({ timeout: 120_000 });
  await page.waitForURL(/\/app\/staging/, { timeout: 120_000 });
  const lote = page.getByRole("button", { name: /Aceptar todo lo verificado/ });
  await expect(lote).toBeVisible({ timeout: 60_000 });
  if (await lote.isEnabled()) {
    await lote.click();
    await expect(page.getByRole("button", { name: /Aceptando/ })).toBeHidden({ timeout: 120_000 }).catch(() => {});
  }
}

/** Páginas REALES del PDF de la variante con el autofit a `paginas` (el mismo motor que el editor). */
async function medir(req: APIRequestContext, variantId: string, paginas = 2) {
  const r = await req.post("/api/cv", { data: { variantId, as: "text", paginas } });
  expect(r.ok(), await r.text()).toBeTruthy();
  return (await r.json()) as { pages: number; autofit: { noCabe: boolean; bodySize: number; sobran: number } };
}

/** Huella del documento (DA-C8): sha256 del texto RE-PARSEADO del PDF + páginas. */
async function huella(req: APIRequestContext, variantId: string) {
  const r = await req.post("/api/cv", { data: { variantId, as: "text", paginas: 2 } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const j = (await r.json()) as { text: string; pages: number };
  return `${createHash("sha256").update(j.text).digest("hex").slice(0, 16)}·${j.pages}p`;
}

interface VItem {
  id: string;
  item_id: string;
  kind: string;
  visible: boolean;
  override_data: Record<string, unknown> | null;
  override_origin: string | null;
}
/** La forma de la variante: qué items hay, cuáles se ven, qué override y la plantilla. */
async function forma(req: APIRequestContext, id: string) {
  const j = (await (await req.get(`/api/variants/${id}`)).json()) as { items: VItem[] };
  const basics = j.items.find((i) => i.kind === "basics");
  const ov = { ...(basics?.override_data ?? {}) } as Record<string, unknown>;
  delete ov.ajustePrevio;
  const items = j.items
    .filter((i) => i.kind !== "basics")
    .map((i) => ({ item: i.item_id, visible: i.visible, ov: i.override_data ? JSON.stringify(i.override_data) : null, origen: i.override_origin }))
    .sort((a, b) => a.item.localeCompare(b.item));
  return {
    items,
    visibles: items.filter((i) => i.visible).map((i) => i.item),
    basics: JSON.stringify(Object.keys(ov).sort().map((k) => [k, ov[k]])),
    templateId: String(ov.templateId ?? ""),
    previo: !!basics?.override_data?.ajustePrevio,
  };
}

/** Las cajas de la barra del editor: si algo se corre, cambia una x o un ancho. */
async function cajasBarra(page: Page) {
  return page.evaluate(() =>
    ["#pvObjetivo", "#edEstado", ".flu-ajustar", "#edAccionesIA", ".ed-tog", ".ed-tog--pv"].map((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r ? [s, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(":") : `${s}:—`;
    }),
  );
}

// Una foto mínima (PNG 1×1) y un QR: la variante «con casi todo, foto y QR».
const FOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

/** Crea una variante con esos items, foto, QR y objetivo 2. */
async function crearVariante(req: APIRequestContext, includeIds: string[], name: string) {
  const cr = await req.post("/api/variants", { data: { mode: "tailor", includeIds, targetTitle: "AI Engineer", name } });
  expect(cr.ok(), await cr.text()).toBeTruthy();
  const id = ((await cr.json()) as { variant: { id: string } }).variant.id;
  const pres = await req.patch(`/api/variants/${id}`, {
    data: { presentation: { photo: FOTO, qrUrl: "https://example.com/portafolio", qrMode: "url" } },
  });
  expect(pres.ok(), await pres.text()).toBeTruthy();
  await req.patch(`/api/variants/${id}`, { data: { paginas_objetivo: 2 } });
  return id;
}

/** Los bloques del master SIN repetidos (un rol importado dos veces cuenta una). */
function bloquesDelMaster(items: MItem[]) {
  const clave = (i: MItem) => `${i.kind}|${String(i.data.company ?? i.data.name ?? "")}|${String(i.data.title ?? "")}`;
  const vistos = new Set<string>();
  const unicos = (l: MItem[]) => l.filter((i) => (vistos.has(clave(i)) ? false : (vistos.add(clave(i)), true)));
  const primero = (k: string) => items.filter((i) => i.kind === k).slice(0, 1).map((i) => i.id);
  const fijos = [...primero("basics"), ...primero("summary"), ...items.filter((i) => ["education", "language"].includes(i.kind)).map((i) => i.id)];
  const roles = unicos(items.filter((i) => i.kind === "work"));
  const vinetas = (rol: string) => items.filter((i) => i.kind === "bullet" && i.parentId === rol).map((i) => i.id);
  const aptitudes = unicos(items.filter((i) => i.kind === "skill"));
  const proyectos = unicos(items.filter((i) => i.kind === "project"));
  return {
    fijos,
    roles: roles.map((r) => [r.id, ...vinetas(r.id)]),
    aptitudes: aptitudes.map((a) => a.id),
    bloques: [...roles.map((r) => [r.id, ...vinetas(r.id)]), ...aptitudes.map((a) => [a.id]), ...proyectos.map((p) => [p.id])],
  };
}

test("ajustar de un clic · la variante grande con foto y QR queda en 2 páginas reales sin quitar nada, y se deshace", async ({ page }) => {
  test.setTimeout(900_000);
  mkdirSync(DISENO, { recursive: true });
  const supabaseVisto = new Set<string>();
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/auth/v1") || u.pathname.startsWith("/rest/v1") || u.hostname.endsWith("supabase.co")) {
      supabaseVisto.add(u.host);
    }
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  const req = page.request;

  // ── 1 · El master: v2 (si está vacío) + complemento (si falta) ──────────────
  let items = await master(req);
  if (!items.length) {
    await importarMd(page, MD_V2);
    items = await master(req);
  }
  if (!items.some((i) => i.kind === "project" && /Tamiz/.test(String(i.data.name ?? "")))) {
    await importarMd(page, MD_COMPLEMENTO);
    items = await master(req);
  }
  expect(items.some((i) => i.kind === "project" && /Tamiz/.test(String(i.data.name ?? ""))), "el complemento está en el master").toBe(true);

  // ── 2 · La variante GRANDE del master real, con foto y QR, objetivo 2 ──────
  // «Casi todo» mide 8 páginas a 10 pt en local (el master tiene roles repetidos):
  // ese caso va en otra prueba. Aquí, sin repetidos, se suman bloques (roles con sus
  // viñetas, aptitudes, proyectos) hasta que ni a 10 pt cabe en 2 páginas.
  const { fijos, bloques } = bloquesDelMaster(items);
  let variantId = "";
  for (let n = 1; n <= bloques.length && !variantId; n += 1) {
    const id = await crearVariante(req, [...fijos, ...bloques.slice(0, n).flat()], `ajuste-un-clic · ${n} bloques`);
    if ((await medir(req, id)).autofit.noCabe) variantId = id;
    else await req.delete(`/api/variants/${id}`);
  }
  expect(variantId, "ninguna selección desborda las 2 páginas").not.toBe("");

  // «Incluir siempre» (DA-R1) sobre la viñeta del rol más antiguo, la primera que se
  // recortaría. Si la 0012 no está en local, la regla no se guarda y se dice.
  const vinetaProtegida = bloques.flat().filter((id) => items.find((i) => i.id === id)?.kind === "bullet").pop() ?? "";
  const reg = await req.patch(`/api/variants/${variantId}`, { data: { reglas: { incluirSiempre: [vinetaProtegida] } } });
  const reglasGuardadas = reg.ok() && ((await reg.json()) as { persistido?: boolean }).persistido !== false;
  console.log(`[ajuste-un-clic] incluirSiempre ${reglasGuardadas ? "guardada" : "NO guardada (¿0012?)"}: ${vinetaProtegida}`);

  const antes = await medir(req, variantId);
  expect(antes.autofit.noCabe, "la variante grande no cabe en 2 páginas ni a 10 pt").toBe(true);
  const formaAntes = await forma(req, variantId);
  const huellaAntes = await huella(req, variantId);

  // ── 3 · Un clic en «Ajustar páginas» ─────────────────────────────────────────
  await page.goto(`/app/variantes/${variantId}`);
  const ajustar = page.locator(".flu-ajustar");
  await expect(ajustar).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(4_000); // la vista previa termina de medir
  const barraAntes = await cajasBarra(page);
  await page.screenshot({ path: path.join(DISENO, "01-antes.png") });

  const respuesta = page.waitForResponse(
    (r) => r.url().includes(`/api/variants/${variantId}/ajustar`) && r.request().method() === "POST",
    { timeout: 600_000 },
  );
  const t0 = Date.now();
  await ajustar.click();
  // Mientras trabaja: el progreso por pasos reales y la barra quieta.
  const progreso = page.locator("#edProgreso");
  await expect(progreso).toContainText(/Probando las plantillas|Midiendo el documento/, { timeout: 60_000 });
  const barraDurante = await cajasBarra(page);
  await page.screenshot({ path: path.join(DISENO, "02-progreso.png") });
  // La respuesta es NDJSON en streaming (el navegador no deja leer su cuerpo): el
  // resultado se lee del panel, que lleva la medida en data-*.
  expect((await respuesta).ok()).toBeTruthy();
  const panel = page.locator("#edAjuste");
  await expect(panel).toBeVisible({ timeout: 600_000 });
  await expect(page.locator(".flu-ajustar")).toBeEnabled({ timeout: 600_000 });
  const dato = async (k: string) => (await panel.getAttribute(`data-${k}`)) ?? "";
  const r = {
    resueltoPor: await dato("resuelto-por"),
    plantilla: await dato("plantilla"),
    medidas: Number(await dato("medidas")),
    consideradas: Number(await dato("consideradas")),
    caben: Number(await dato("caben")),
    ms: Number(await dato("ms")),
    tope: (await dato("tope")) === "1",
    recortes: Number(await dato("recortes")),
  };
  console.log(`[ajuste-un-clic] ${JSON.stringify({ ...r, msCliente: Date.now() - t0 })}`);
  await expect(panel.locator(".flu-cas-res")).not.toHaveAttribute("data-resuelto", "error");
  // Paso 1 o 2: una plantilla (catálogo o personalizada) o la plantilla a medida, SIN recortar.
  expect(["plantilla", "medida"], `lo resolvió: ${r.resueltoPor} · ${await panel.locator(".flu-cas-res").textContent()}`).toContain(r.resueltoPor);
  expect(r.recortes).toBe(0);
  expect(r.medidas).toBeGreaterThan(0);

  await expect(panel.locator(".flu-cas-res")).toContainText("cabe en 2 páginas sin quitar nada");
  await expect(panel.locator("#edAjusteDeshacer")).toBeVisible();
  await expect(panel.locator("#edAjusteRevisar")).toBeVisible();
  await page.waitForTimeout(5_000); // la vista previa rehace el PDF con la plantilla nueva
  const barraDespues = await cajasBarra(page);
  await panel.screenshot({ path: path.join(DISENO, "03-panel-aplicado.png") });
  await page.screenshot({ path: path.join(DISENO, "04-editor-aplicado.png") });

  // La barra no se mueve: antes, durante y después, las mismas cajas.
  expect(barraDurante, "la barra no se mueve mientras ajusta").toEqual(barraAntes);
  expect(barraDespues, "la barra no se mueve tras ajustar").toEqual(barraAntes);

  // ── 4 · El PDF REAL: 2 páginas, con TODO el contenido ───────────────────────
  const despues = await medir(req, variantId);
  expect(despues.pages, "tras el ajuste el PDF real mide 2 páginas").toBeLessThanOrEqual(2);
  expect(despues.autofit.noCabe).toBe(false);
  expect(despues.autofit.bodySize).toBeGreaterThanOrEqual(10);
  const formaDespues = await forma(req, variantId);
  expect(formaDespues.visibles, "no se quitó ni ocultó ningún item").toEqual(formaAntes.visibles);
  expect(formaDespues.items, "ningún texto cambió").toEqual(formaAntes.items);
  expect(formaDespues.templateId).not.toBe(formaAntes.templateId);
  expect(formaDespues.previo, "la instantánea queda guardada").toBe(true);
  if (vinetaProtegida) expect(formaDespues.visibles).toContain(vinetaProtegida);

  // ── 6 · Deshacer ajuste: plantilla, items y huella como antes ───────────────
  const deshacer = page.waitForResponse(
    (res) => res.url().includes(`/api/variants/${variantId}/ajustar`) && res.request().method() === "POST",
    { timeout: 120_000 },
  );
  await panel.locator("#edAjusteDeshacer").click();
  expect((await deshacer).ok()).toBeTruthy();
  await expect(panel.locator(".flu-cas-res")).toContainText("Ajuste deshecho", { timeout: 30_000 });
  await page.waitForTimeout(4_000);
  await panel.screenshot({ path: path.join(DISENO, "06-deshecho.png") });
  expect(await cajasBarra(page), "la barra no se mueve al deshacer").toEqual(barraAntes);
  const formaDeshecha = await forma(req, variantId);
  expect(formaDeshecha.items, "Deshacer repone los variant_items").toEqual(formaAntes.items);
  expect(formaDeshecha.basics, "Deshacer repone la plantilla y el diseño").toEqual(formaAntes.basics);
  expect(formaDeshecha.previo, "la instantánea se retira").toBe(false);
  expect(await huella(req, variantId), "Deshacer repone la huella del PDF").toBe(huellaAntes);

  // ── 7 · «Elegir cómo ajustar» (DA-A6: reemplaza «Ver otras opciones»): A-D medidas ──
  // Desde lo deshecho no hay nada que deshacer antes de medir: la variante no cambia.
  await panel.locator("#edAjusteElegir").click();
  await expect(panel.locator("#edAjusteOpcionesAD > li")).toHaveCount(4, { timeout: 600_000 });
  await page.waitForTimeout(2_000); // las miniaturas se rasterizan en el cliente
  await panel.screenshot({ path: path.join(DISENO, "05-otras-opciones.png") });
  expect((await forma(req, variantId)).items, "medir las opciones no toca la variante").toEqual(formaAntes.items);

  // Nunca el remoto (DA-V3).
  for (const h of supabaseVisto) expect(h, "solo el Supabase local").toMatch(/^(127\.0\.0\.1|localhost):/);
  console.log(JSON.stringify({ variantId, antes: antes.pages, resueltoPor: r.resueltoPor, despues: despues.pages, cuerpo: despues.autofit.bodySize }));
});

test("ajustar de un clic · «casi todo» (8 páginas) no cabe en 2 sin recortar: lo dice y no toca nada", async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync(DISENO, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  const req = page.request;
  const items = await master(req);
  const variantId = await crearVariante(req, items.filter((i) => i.kind !== "reference").map((i) => i.id), "ajuste-un-clic · casi todo");
  const antes = await medir(req, variantId);
  expect(antes.autofit.noCabe).toBe(true);
  const formaAntes = await forma(req, variantId);
  const huellaAntes = await huella(req, variantId);

  await page.goto(`/app/variantes/${variantId}`);
  const ajustar = page.locator(".flu-ajustar");
  await expect(ajustar).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(4_000);
  const barraAntes = await cajasBarra(page);
  const t0 = Date.now();
  await ajustar.click();
  const panel = page.locator("#edAjuste");
  await expect(panel).toBeVisible({ timeout: 600_000 });
  await expect(ajustar).toBeEnabled({ timeout: 600_000 });
  const dato = async (k: string) => (await panel.getAttribute(`data-${k}`)) ?? "";
  const r = {
    paginasAntes: antes.pages,
    resueltoPor: await dato("resuelto-por"),
    medidas: Number(await dato("medidas")),
    consideradas: Number(await dato("consideradas")),
    caben: Number(await dato("caben")),
    ms: Number(await dato("ms")),
    recortes: Number(await dato("recortes")),
    msCliente: Date.now() - t0,
  };
  console.log(`[ajuste-un-clic] casi todo ${JSON.stringify(r)} · ${await panel.locator(".flu-cas-res").textContent()}`);
  await page.waitForTimeout(2_000);
  await panel.screenshot({ path: path.join(DISENO, "07-casi-todo-no-cabe.png") });
  // DA-A6: el motor sí lo deja en 2 (condensa y deja fuera); el chip de estado cambia de
  // TEXTO por el contenido nuevo (huecos), no por el ajuste en curso. Sin cambios, la
  // barra queda exactamente igual.
  if (r.resueltoPor === "ninguno") expect(await cajasBarra(page), "la barra no se mueve").toEqual(barraAntes);

  if (r.resueltoPor === "ninguno") {
    // Honesto: lo dice, no ofrece deshacer y el documento queda EXACTAMENTE igual.
    await expect(panel.locator(".flu-cas-res")).toContainText("No pude dejarlo en 2 páginas");
    await expect(panel.locator("#edAjusteDeshacer")).toHaveCount(0);
    await expect(panel.locator("#edAjusteRevisar")).toBeVisible();
    const formaDespues = await forma(req, variantId);
    expect(formaDespues.items).toEqual(formaAntes.items);
    expect(formaDespues.basics).toEqual(formaAntes.basics);
    expect(formaDespues.previo).toBe(false);
    expect(await huella(req, variantId)).toBe(huellaAntes);
  } else {
    // Si un día cabe (p. ej. con recortes), cabe de verdad.
    const despues = await medir(req, variantId);
    expect(despues.pages).toBeLessThanOrEqual(2);
  }
});

test("ajustar de un clic · si solo recortando cabe, recorta todo de una vez y nunca quita lo de «incluir siempre»", async ({ page }) => {
  test.setTimeout(600_000);
  mkdirSync(DISENO, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  const req = page.request;
  const items = await master(req);
  const { fijos, roles } = bloquesDelMaster(items);
  // TODAS las aptitudes del master (32 grupos, repetidos incluidos) y un rol: 3
  // páginas que ninguna plantilla ni la plantilla a medida salvan.
  const aptitudes = items.filter((i) => i.kind === "skill").map((i) => i.id);
  const variantId = await crearVariante(req, [...fijos, ...aptitudes, ...roles[0]!], "ajuste-un-clic · recortes");
  const protegido = aptitudes[aptitudes.length - 1]!;
  const reg = await req.patch(`/api/variants/${variantId}`, { data: { reglas: { incluirSiempre: [protegido] } } });
  test.skip(!reg.ok() || ((await reg.json()) as { persistido?: boolean }).persistido === false, "sin la 0012 en local no hay reglas");
  const formaAntes = await forma(req, variantId);
  const huellaAntes = await huella(req, variantId);
  expect(formaAntes.visibles).toContain(protegido);

  await page.goto(`/app/variantes/${variantId}`);
  const ajustar = page.locator(".flu-ajustar");
  await expect(ajustar).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(3_000);
  await ajustar.click();
  const panel = page.locator("#edAjuste");
  await expect(panel).toBeVisible({ timeout: 600_000 });
  await expect(ajustar).toBeEnabled({ timeout: 600_000 });
  const resuelto = (await panel.getAttribute("data-resuelto-por")) ?? "";
  console.log(`[ajuste-un-clic] recortes · ${resuelto} · ${await panel.locator(".flu-cas-res").textContent()} · ${await panel.locator(".flu-cas-hint").first().textContent().catch(() => "")}`);
  await page.waitForTimeout(2_000);
  await panel.screenshot({ path: path.join(DISENO, "08-recortes-aplicados.png") });

  // DA-A6: lo que antes eran «recortes» ahora es el motor de páginas («motor»). Si una
  // disposición sola ya alcanza (p. ej. una personalizada guardada antes, ahora con modos
  // de densidad), mejor: cabe sin quitar nada.
  expect(["recortes", "motor", "ninguno", "plantilla", "medida"], "lo resolvió").toContain(resuelto);
  const despues = await forma(req, variantId);
  expect(despues.visibles, "«incluir siempre» sobrevive al ajuste").toContain(protegido);
  if (resuelto === "plantilla" || resuelto === "medida") {
    expect((await medir(req, variantId)).pages).toBeLessThanOrEqual(2);
    expect(despues.visibles, "solo disposición: no se quitó nada").toEqual(formaAntes.visibles);
  }
  if (resuelto === "recortes" || resuelto === "motor") {
    expect((await medir(req, variantId)).pages).toBeLessThanOrEqual(2);
    expect(despues.visibles.length).toBeLessThan(formaAntes.visibles.length);
    // Deshacer repone los items ocultados y los textos acortados.
    await panel.locator("#edAjusteDeshacer").click();
    await expect(panel.locator(".flu-cas-res")).toContainText("Ajuste deshecho", { timeout: 60_000 });
    const deshecha = await forma(req, variantId);
    expect(deshecha.items).toEqual(formaAntes.items);
    expect(await huella(req, variantId)).toBe(huellaAntes);
  }
});

test("plantilla a medida en vivo · se guarda con candado, el PDF la resuelve y la galería la gestiona", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(DISENO_MEDIDA, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  const req = page.request;
  const items = await master(req);
  const fijos = items.filter((i) => ["basics", "summary", "work"].includes(i.kind)).map((i) => i.id);
  const cr = await req.post("/api/variants", {
    data: { mode: "tailor", includeIds: fijos, targetTitle: "AI Engineer", name: "ajuste-cascada · a medida" },
  });
  expect(cr.ok(), await cr.text()).toBeTruthy();
  const vid = ((await cr.json()) as { variant: { id: string } }).variant.id;

  // Los parámetros del límite de «Clásica» (lo que propone el paso 3 en su escalón 1).
  const params = {
    v: 1, base: "ats-clasica", t: 1, cuerpo: 10, interlineado: 1.15, margenVmm: 12, margenHmm: 35.62,
    espacio: 0.5, titulos: 0.85, paletteId: "patina", typographyId: "clasica",
  };
  // Fuera de los límites ATS: el servidor no se lo cree y no guarda nada.
  const malo = await req.post(`/api/variants/${vid}/ajustar`, {
    data: { accion: "guardar-medida", params: { ...params, cuerpo: 9 } },
  });
  expect(malo.status()).toBe(422);
  expect(await malo.text()).toMatch(/cuerpo bajo 10 pt/);

  const ok = await req.post(`/api/variants/${vid}/ajustar`, {
    data: { accion: "guardar-medida", params, nombre: "A medida · e2e" },
  });
  expect(ok.ok(), await ok.text()).toBeTruthy();
  const { plantilla } = (await ok.json()) as { plantilla: { id: string; nombre: string } };
  expect(plantilla.id).toMatch(/^u:[0-9a-f-]{36}$/);

  // La variante la usa y el PDF real la resuelve (texto completo, ≥ 10 pt).
  const usar = await req.patch(`/api/variants/${vid}`, { data: { presentation: { templateId: plantilla.id } } });
  expect(usar.ok(), await usar.text()).toBeTruthy();
  const m = await medir(req, vid);
  expect(m.autofit.bodySize).toBeGreaterThanOrEqual(10);
  const txt = (await (await req.post("/api/cv", { data: { variantId: vid, as: "text" } })).json()) as { text: string };
  const nombre = String(items.find((i) => i.kind === "basics")?.data.name ?? "");
  expect(txt.text).toContain(nombre.split(" ")[0]!);

  // La galería · «Personalizadas»: aparece, se renombra y se elimina (sin diálogos del navegador).
  await page.goto(`/app/variantes/${vid}`);
  await expect(page.locator(".flu-ajustar")).toBeVisible({ timeout: 120_000 });
  const tabDiseno = page.getByRole("tab", { name: "Diseño", exact: true });
  if (await tabDiseno.count()) await tabDiseno.first().click();
  const abrir = page.locator(".tplopen").first();
  await abrir.scrollIntoViewIfNeeded();
  await abrir.click();
  await page.locator("#tgTab-propias").click();
  const tarjeta = page.locator(`[data-pestana="propias"] [data-tpl="${plantilla.id}"]`);
  await expect(tarjeta).toBeVisible({ timeout: 30_000 });
  await expect(tarjeta).toContainText("A medida · e2e");
  await page.waitForTimeout(3_000); // la miniatura sale del PDF real
  await page.screenshot({ path: path.join(DISENO_MEDIDA, "ajuste-04-galeria-personalizadas.png") });

  await tarjeta.getByRole("button", { name: "Renombrar" }).click();
  await tarjeta.getByLabel("Nombre de la plantilla").fill("Mi plantilla compacta");
  await tarjeta.getByRole("button", { name: "Guardar" }).click();
  await expect(tarjeta).toContainText("Mi plantilla compacta", { timeout: 30_000 });

  await tarjeta.getByRole("button", { name: "Eliminar" }).click();
  await expect(tarjeta).toContainText("vuelven a la plantilla por defecto");
  await page.screenshot({ path: path.join(DISENO_MEDIDA, "ajuste-05-eliminar-confirma.png") });
  await tarjeta.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(tarjeta).toBeHidden({ timeout: 30_000 });
  const lista = (await (await req.get("/api/plantillas")).json()) as { plantillas: { id: string }[] };
  expect(lista.plantillas.some((p) => p.id === plantilla.id)).toBe(false);

  // Borrada la plantilla, la variante sigue teniendo CV (cae en la de por defecto).
  const tras = await medir(req, vid);
  expect(tras.pages).toBeGreaterThan(0);
  await req.delete(`/api/variants/${vid}`);
});
