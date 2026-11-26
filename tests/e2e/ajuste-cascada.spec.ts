import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * «AJUSTAR PÁGINAS» EN CASCADA, en vivo (DA-A1) — solo contra el Supabase LOCAL.
 *
 * Con la cuenta de prueba local (supabase/cuenta-prueba.json):
 *   1 · el master lleva la plantilla v2 y el complemento del 26-11 (Importar → .md,
 *       sin IA; se importa solo si falta, para no duplicar en cada corrida);
 *   2 · se arma una variante GRANDE con objetivo 2 páginas que ni a 10 pt cabe;
 *   3 · se pulsa «Ajustar páginas»: el panel enseña los tres pasos EN ORDEN y cuál
 *       lo resuelve; se aplica ese paso (recortes · otra plantilla · a medida);
 *   4 · el PDF real de la variante, medido por /api/cv, queda en 2 páginas.
 * Capturas en prompts/lotes-fable5/_diseno/ajuste/.
 */

const RAIZ = process.cwd();
const DISENO = path.join(RAIZ, "prompts/lotes-fable5/_diseno/ajuste");
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

test("ajustar páginas en cascada · la variante grande queda en 2 páginas reales", async ({ page }) => {
  test.setTimeout(600_000);
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
  const tieneComplemento = items.some((i) => i.kind === "project" && /Tamiz/.test(String(i.data.name ?? "")));
  if (!tieneComplemento) {
    await importarMd(page, MD_COMPLEMENTO);
    items = await master(req);
  }
  expect(items.some((i) => i.kind === "project" && /Tamiz/.test(String(i.data.name ?? ""))), "el complemento está en el master").toBe(true);

  // ── 2 · Una variante GRANDE: la mínima que ni a 10 pt cabe en 2 páginas ─────
  // Base: datos, resumen, aptitudes y formación; luego roles con sus viñetas, de a
  // uno, hasta que el autofit diga «no cabe» (medido en el PDF real).
  const fijos = items.filter((i) => ["basics", "summary", "skill", "education", "language"].includes(i.kind)).map((i) => i.id);
  const roles = items.filter((i) => i.kind === "work");
  const vinetasDe = (rol: string) => items.filter((i) => i.kind === "bullet" && i.parentId === rol).map((i) => i.id);
  const proyectos = items.filter((i) => i.kind === "project").map((i) => i.id);
  const bloques: string[][] = [...roles.map((r) => [r.id, ...vinetasDe(r.id)]), ...proyectos.map((p) => [p])];
  let variantId = "";
  let antes: Awaited<ReturnType<typeof medir>> | null = null;
  for (let n = 1; n <= bloques.length; n += 1) {
    const includeIds = [...fijos, ...bloques.slice(0, n).flat()];
    const cr = await req.post("/api/variants", {
      data: { mode: "tailor", includeIds, targetTitle: "AI Engineer", name: `ajuste-cascada · ${n} bloques` },
    });
    expect(cr.ok(), await cr.text()).toBeTruthy();
    const id = ((await cr.json()) as { variant: { id: string } }).variant.id;
    const m = await medir(req, id);
    if (m.autofit.noCabe) {
      variantId = id;
      antes = m;
      break;
    }
    await req.delete(`/api/variants/${id}`);
  }
  expect(variantId, "ninguna selección desborda las 2 páginas").not.toBe("");
  expect(antes!.pages, "la variante grande no cabe en 2 ni a 10 pt").toBeGreaterThan(2);
  await req.patch(`/api/variants/${variantId}`, { data: { paginas_objetivo: 2 } });

  // ── 3 · «Ajustar páginas» → la cascada ──────────────────────────────────────
  await page.goto(`/app/variantes/${variantId}`);
  const ajustar = page.locator(".flu-ajustar");
  await expect(ajustar).toBeVisible({ timeout: 120_000 });
  const analisis = page.waitForResponse(
    (r) => r.url().includes(`/api/variants/${variantId}/ajustar`) && r.request().method() === "POST",
    { timeout: 300_000 },
  );
  await ajustar.click();
  const resp = await analisis;
  expect(resp.ok(), await resp.text()).toBeTruthy();
  const { ajuste } = (await resp.json()) as {
    ajuste: { sobran: number; quitar: { id: string }[]; cascada: { resueltoPor: 1 | 2 | 3 | null; pasos: { paso: number; resuelve: boolean }[] } };
  };
  // «sobran» ya no es la cuenta teórica: al menos las líneas de las páginas de más.
  expect(ajuste.sobran).toBeGreaterThan(0);
  const panel = page.locator("#edCascada");
  await expect(panel).toBeVisible({ timeout: 60_000 });
  // Los pasos EN ORDEN, cada uno con su estado, y cuál lo resolvió.
  await expect(panel.locator("li[data-paso]")).toHaveCount(3);
  expect(await panel.locator("li[data-paso]").evaluateAll((els) => els.map((e) => e.getAttribute("data-paso")))).toEqual(["1", "2", "3"]);
  const r = ajuste.cascada.resueltoPor;
  await expect(panel.locator(".flu-cas-res")).toHaveAttribute("data-resuelto", String(r ?? "ninguno"));
  if (r) await expect(panel.locator(".flu-cas-res")).toContainText(`paso ${r}`);
  // Los pasos posteriores al que resuelve no se calculan: «no hizo falta».
  for (const n of [1, 2, 3]) {
    const p = ajuste.cascada.pasos.find((x) => x.paso === n);
    await expect(panel.locator(`li[data-paso="${n}"]`)).toHaveAttribute(
      "data-estado",
      !p ? "noHizoFalta" : p.resuelve ? "resuelve" : "noAlcanza",
    );
  }
  await page.waitForTimeout(1_500); // las miniaturas se rasterizan en el cliente
  await panel.screenshot({ path: path.join(DISENO, "ajuste-01-cascada.png") });
  await page.screenshot({ path: path.join(DISENO, "ajuste-02-editor-cascada.png") });
  expect(r, "la cascada tiene que resolver la variante grande").not.toBeNull();

  // ── 4 · Aplicar el paso que resuelve ────────────────────────────────────────
  if (r === 1) {
    // Los recortes son manuales: se aceptan uno a uno, como el usuario.
    await panel.locator(".flu-cas-x").click();
    for (const q of ajuste.quitar) {
      const b = page.locator(`.flu-prop[data-prop="q"][data-for="${q.id}"] button`).last();
      if (await b.count()) await b.click();
    }
    await page.waitForTimeout(3_000);
  } else {
    // «Usar esta» guarda la plantilla con savePresentation, sin recargar (DA-AC4):
    // se espera el PATCH de la variante y se recarga para leerla de la base.
    const boton = r === 2 ? panel.locator(".flu-cas-cands li button").first() : panel.locator(".flu-cas-medida button");
    const guardado = page.waitForResponse(
      (res) => res.request().method() === "PATCH" && res.url().includes(`/api/variants/${variantId}`),
      { timeout: 120_000 },
    );
    await boton.click();
    expect((await guardado).ok(), "«Usar esta» guarda la plantilla en la variante").toBeTruthy();
    await page.reload();
  }
  await expect(page.locator(".flu-ajustar")).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: path.join(DISENO, `ajuste-03-aplicado-paso-${r}.png`) });

  // ── 5 · El PDF REAL de la variante: 2 páginas ───────────────────────────────
  const despues = await medir(req, variantId);
  expect(despues.pages, "tras la cascada el PDF real mide 2 páginas").toBeLessThanOrEqual(2);
  expect(despues.autofit.noCabe).toBe(false);
  expect(despues.autofit.bodySize).toBeGreaterThanOrEqual(10);

  // ── 6 · Galería · «Personalizadas» (la plantilla a medida, si se creó) ──────
  const lista = (await (await req.get("/api/plantillas")).json()) as { plantillas: { id: string; nombre: string }[] };
  if (r === 3) expect(lista.plantillas.length).toBeGreaterThan(0);
  const abrirGaleria = page.locator(".tplopen").first();
  if (await abrirGaleria.isVisible().catch(() => false)) {
    await abrirGaleria.click();
    await page.locator("#tgTab-propias").click();
    await expect(page.locator('[data-pestana="propias"]')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2_500);
    await page.screenshot({ path: path.join(DISENO, "ajuste-04-galeria-personalizadas.png") });
  }

  // Nunca el remoto (DA-V3).
  for (const h of supabaseVisto) expect(h, "solo el Supabase local").toMatch(/^(127\.0\.0\.1|localhost):/);
  console.log(JSON.stringify({ variantId, antes: antes!.pages, sobran: ajuste.sobran, resueltoPor: r, despues: despues.pages, cuerpo: despues.autofit.bodySize }));
});

test("plantilla a medida en vivo · se guarda con candado, el PDF la resuelve y la galería la gestiona", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(DISENO, { recursive: true });
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
  await page.screenshot({ path: path.join(DISENO, "ajuste-04-galeria-personalizadas.png") });

  await tarjeta.getByRole("button", { name: "Renombrar" }).click();
  await tarjeta.getByLabel("Nombre de la plantilla").fill("Mi plantilla compacta");
  await tarjeta.getByRole("button", { name: "Guardar" }).click();
  await expect(tarjeta).toContainText("Mi plantilla compacta", { timeout: 30_000 });

  await tarjeta.getByRole("button", { name: "Eliminar" }).click();
  await expect(tarjeta).toContainText("vuelven a la plantilla por defecto");
  await page.screenshot({ path: path.join(DISENO, "ajuste-05-eliminar-confirma.png") });
  await tarjeta.getByRole("button", { name: "Sí, eliminar" }).click();
  await expect(tarjeta).toBeHidden({ timeout: 30_000 });
  const lista = (await (await req.get("/api/plantillas")).json()) as { plantillas: { id: string }[] };
  expect(lista.plantillas.some((p) => p.id === plantilla.id)).toBe(false);

  // Borrada la plantilla, la variante sigue teniendo CV (cae en la de por defecto).
  const tras = await medir(req, vid);
  expect(tras.pages).toBeGreaterThan(0);
  await req.delete(`/api/variants/${vid}`);
});
