import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

/**
 * MOTOR DE PÁGINAS (DA-A6) · el caso real, en vivo con el master LOCAL de la cuenta
 * de prueba (supabase/cuenta-prueba.json; nunca el remoto):
 *   · el master = plantilla v2 + complemento (Importar → .md, sin IA);
 *   · una variante de 40+ items con «Máximo 2» (obligatoria), «Sin foto», «No
 *     mencionar DIAKONOS», sin Referencias ni Publicaciones e «Incluir siempre»
 *     PharmIQ, AeroFit y Corpus — y una foto puesta, que la regla debe quitar;
 *   · Descargar con la regla rota NO entrega el PDF: ofrece «Ajustar ahora»;
 *   · UN clic → el PDF real mide 2 páginas a ≥ 10 pt, lo obligatorio sigue, sin
 *     DIAKONOS, sin foto, sin las secciones ocultas; revertir un cambio; Deshacer
 *     repone items, diseño y huella;
 *   · «Elegir cómo ajustar» muestra A-D medidas; se usa una y se deshace;
 *   · lo mismo con objetivo 1 y 3.
 * Capturas en prompts/lotes-fable5/_diseno/paginas-inviolables/.
 *
 *   npm run test:e2e:local -- tests/e2e/motor-paginas.spec.ts --workers=1
 */

const RAIZ = process.cwd();
const DISENO = path.join(RAIZ, "prompts/lotes-fable5/_diseno/paginas-inviolables");
const CUENTA = JSON.parse(readFileSync(path.join(RAIZ, "supabase/cuenta-prueba.json"), "utf8")) as {
  email: string;
  password: string;
};
const MD_V2 = path.join(RAIZ, "material-perfil/corpus-plantilla-AKHAN-v2.md");
const MD_COMPLEMENTO = path.join(RAIZ, "material-perfil/corpus-complemento-AKHAN-2026-11-26.md");
// Una foto mínima (PNG 1×1): la regla «Sin foto» tiene que quitarla del PDF.
const FOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

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

interface MItem {
  id: string;
  kind: string;
  parentId?: string | null;
  data: Record<string, unknown>;
}
interface VItem {
  id: string;
  item_id: string;
  kind: string;
  visible: boolean;
  override_data: Record<string, unknown> | null;
  override_origin: string | null;
}

const master = async (req: APIRequestContext) =>
  ((await (await req.get("/api/master", { timeout: 300_000 })).json()) as { items: MItem[] }).items;

/** Texto re-parseado y páginas del PDF REAL de la variante, con el autofit a `paginas`. */
async function pdf(req: APIRequestContext, variantId: string, paginas: number) {
  const r = await req.post("/api/cv", { timeout: 300_000, data: { variantId, as: "text", paginas } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const j = (await r.json()) as { text: string; pages: number; autofit: { noCabe: boolean; bodySize: number } };
  return { ...j, plano: j.text.replace(/\s+/g, " "), huella: `${createHash("sha256").update(j.text).digest("hex").slice(0, 16)}·${j.pages}p` };
}

/** Los bytes del PDF que se descargaría (sin la puerta: `download` no va). ¿Lleva una imagen? */
async function llevaImagen(req: APIRequestContext, variantId: string, paginas: number) {
  const r = await req.post("/api/cv", { timeout: 300_000, data: { variantId, as: "pdf", paginas } });
  expect(r.ok(), await r.text()).toBeTruthy();
  return /\/Subtype\s*\/Image/.test((await r.body()).toString("latin1"));
}

async function forma(req: APIRequestContext, id: string) {
  const j = (await (await req.get(`/api/variants/${id}`, { timeout: 300_000 })).json()) as { items: VItem[] };
  const basics = j.items.find((i) => i.kind === "basics");
  const ov = { ...(basics?.override_data ?? {}) } as Record<string, unknown>;
  delete ov.ajustePrevio;
  const items = j.items
    .filter((i) => i.kind !== "basics")
    .map((i) => ({ vid: i.id, item: i.item_id, visible: i.visible, ov: i.override_data ? JSON.stringify(i.override_data) : null, origen: i.override_origin }))
    .sort((a, b) => a.item.localeCompare(b.item));
  return {
    items,
    visibles: items.filter((i) => i.visible).map((i) => i.item),
    ocultos: items.filter((i) => !i.visible).map((i) => i.item),
    basics: JSON.stringify(Object.keys(ov).sort().map((k) => [k, ov[k]])),
    previo: !!basics?.override_data?.ajustePrevio,
  };
}

/** El master SIN repetidos (un rol importado dos veces cuenta una), con sus viñetas. */
function unicosDelMaster(items: MItem[]) {
  const clave = (i: MItem) =>
    `${i.kind}|${String(i.data.company ?? i.data.name ?? i.data.institution ?? i.data.group ?? i.data.title ?? i.data.text ?? "")}|${String(i.data.title ?? i.data.degree ?? "")}`;
  const vistos = new Set<string>();
  const fuera = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    if (i.kind === "bullet") continue;
    if (["basics", "summary"].includes(i.kind) && out.some((o) => items.find((x) => x.id === o)?.kind === i.kind)) continue;
    const k = clave(i);
    if (vistos.has(k)) {
      fuera.add(i.id);
      continue;
    }
    vistos.add(k);
    out.push(i.id);
  }
  const vinetas = items.filter((i) => i.kind === "bullet" && i.parentId && out.includes(i.parentId)).map((i) => i.id);
  return [...out, ...vinetas];
}

test.use({ viewport: { width: 1440, height: 960 } });

test("motor de páginas · el caso real: Máximo 2 + Sin foto + sin DIAKONOS + sin Referencias/Publicaciones + Incluir siempre PharmIQ, AeroFit y Corpus", async ({ page }) => {
  test.setTimeout(3_600_000);
  mkdirSync(DISENO, { recursive: true });
  const supabaseVisto = new Set<string>();
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/auth/v1") || u.pathname.startsWith("/rest/v1") || u.hostname.endsWith("supabase.co")) supabaseVisto.add(u.host);
  });
  await login(page);
  const req = page.request;

  // ── 1 · El master real: v2 (si falta PharmIQ) + complemento (si falta Corpus) ─
  let items = await master(req);
  const esProy = (re: RegExp) => (i: MItem) => i.kind === "project" && re.test(String(i.data.name ?? ""));
  if (!items.some(esProy(/PharmIQ/))) {
    await importarMd(page, MD_V2);
    items = await master(req);
  }
  if (!items.some(esProy(/^Corpus/))) {
    await importarMd(page, MD_COMPLEMENTO);
    items = await master(req);
  }
  const proyPharm = items.find(esProy(/PharmIQ/));
  const proyAero = items.find(esProy(/AeroFit/));
  const proyCorpus = items.find(esProy(/^Corpus/));
  const rolPharm = items.find((i) => i.kind === "work" && /PharmIQ/i.test(String(i.data.company ?? "")));
  expect(proyPharm && proyAero && proyCorpus && rolPharm, "el master tiene PharmIQ (rol y proyecto), AeroFit y Corpus").toBeTruthy();
  const incluirSiempre = [rolPharm!.id, proyPharm!.id, proyAero!.id, proyCorpus!.id];

  // ── 2 · La variante: 40+ items, foto puesta, y las reglas del caso ──────────
  const includeIds = unicosDelMaster(items);
  for (const id of incluirSiempre) if (!includeIds.includes(id)) includeIds.push(id);
  expect(includeIds.length, "una variante de 40+ items").toBeGreaterThanOrEqual(40);
  const cr = await req.post("/api/variants", {
    timeout: 300_000,
    data: { mode: "tailor", includeIds, targetTitle: "AI Engineer", name: "motor-paginas · caso real" },
  });
  expect(cr.ok(), await cr.text()).toBeTruthy();
  const variantId = ((await cr.json()) as { variant: { id: string } }).variant.id;
  expect((await req.patch(`/api/variants/${variantId}`, { timeout: 300_000, data: { presentation: { photo: FOTO } } })).ok()).toBeTruthy();
  const reglasDe = (max: 1 | 2 | 3) => ({
    paginasMax: max,
    sinFoto: true,
    excluirTerminos: ["DIAKONOS"],
    ocultarSecciones: ["references", "publications"],
    incluirSiempre,
  });
  const reg = await req.patch(`/api/variants/${variantId}`, { timeout: 300_000, data: { reglas: reglasDe(2) } });
  expect(reg.ok(), await reg.text()).toBeTruthy();
  expect(((await reg.json()) as { persistido?: boolean }).persistido, "0012 aplicada en local").not.toBe(false);
  await req.patch(`/api/variants/${variantId}`, { timeout: 300_000, data: { paginas_objetivo: 2 } });

  const antes = await pdf(req, variantId, 2);
  expect(antes.autofit.noCabe, `el caso desborda: ${antes.pages} páginas a ${antes.autofit.bodySize} pt`).toBe(true);
  const formaAntes = await forma(req, variantId);
  console.log(`[motor] variante ${variantId} · ${includeIds.length} items · ${antes.pages} páginas a ${antes.autofit.bodySize} pt`);
  // Lo que la regla oculta: el texto propio de referencias y publicaciones del master.
  const textosOcultos = items
    .filter((i) => ["reference", "publication"].includes(i.kind) && includeIds.includes(i.id))
    .map((i) => String(i.data.name ?? i.data.title ?? "").trim())
    .filter((s) => s.length > 6);

  /** Lo que el PDF real debe cumplir tras cualquier ajuste a `n` páginas. */
  async function cumple(n: number, etiqueta: string) {
    const d = await pdf(req, variantId, n);
    expect(d.pages, `${etiqueta}: el PDF real mide ${n} páginas`).toBeLessThanOrEqual(n);
    expect(d.autofit.noCabe, etiqueta).toBe(false);
    expect(d.autofit.bodySize, `${etiqueta}: cuerpo ≥ 10 pt`).toBeGreaterThanOrEqual(10);
    for (const s of ["PharmIQ", "AeroFit", "Corpus"]) expect(d.plano, `${etiqueta}: «${s}» sigue`).toContain(s);
    expect(d.plano, `${etiqueta}: sin DIAKONOS`).not.toMatch(/diakonos/i);
    for (const s of textosOcultos) expect(d.plano, `${etiqueta}: sin «${s}» (sección oculta)`).not.toContain(s);
    expect(await llevaImagen(req, variantId, n), `${etiqueta}: sin foto`).toBe(false);
    const f = await forma(req, variantId);
    for (const id of incluirSiempre) expect(f.visibles, `${etiqueta}: «incluir siempre» sobrevive`).toContain(id);
    for (const v of f.visibles) expect(formaAntes.visibles, `${etiqueta}: nada oculto vuelve`).toContain(v);
    return { ...d, forma: f };
  }

  // ── 3 · Descargar con la regla rota NO entrega el PDF ────────────────────────
  const puerta = await req.post("/api/cv", { timeout: 300_000, data: { variantId, as: "pdf", download: true, paginas: 2 } });
  expect(puerta.status(), "la puerta responde 409").toBe(409);
  expect(((await puerta.json()) as { codigo?: string }).codigo).toBe("paginas-max");
  await page.goto(`/app/variantes/${variantId}`);
  const ajustar = page.locator(".flu-ajustar");
  await expect(ajustar).toBeVisible({ timeout: 120_000 });
  await expect(page.locator("#edReglasRotas")).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(3_000);
  let descargado = false;
  page.on("download", () => (descargado = true));
  await page.locator("#btnPdf").click();
  const panel = page.locator("#edAjuste");
  await expect(page.locator("#edBloqueoPdf"), "Descargar ofrece «Ajustar ahora»").toBeVisible({ timeout: 120_000 });
  await expect(page.locator("#edAjustarAhora")).toHaveText(/Ajustar ahora/);
  await page.waitForTimeout(1_500);
  expect(descargado, "no se entregó ningún PDF").toBe(false);
  await page.screenshot({ path: path.join(DISENO, "01-descargar-bloqueado.png") });

  // ── 4 · UN clic («Ajustar ahora») → 2 páginas reales con todo cumplido ───────
  await page.locator("#edAjustarAhora").click();
  await expect(panel.locator(".flu-cas-res")).toBeVisible({ timeout: 900_000 });
  await expect(ajustar).toBeEnabled({ timeout: 900_000 });
  const resuelto = (await panel.getAttribute("data-resuelto-por")) ?? "";
  const palancas = (await panel.getAttribute("data-palancas")) ?? "";
  const reescritos = Number(await panel.getAttribute("data-reescritos"));
  const fueraN = Number(await panel.getAttribute("data-fuera"));
  console.log(`[motor] 2 págs · ${resuelto} · palancas ${palancas} · ${reescritos} condensados · ${fueraN} fuera · ${await panel.locator(".flu-cas-res").textContent()} ${await panel.locator(".flu-cas-hint").first().textContent().catch(() => "")}`);
  expect(["plantilla", "medida", "motor"], `lo resolvió: ${resuelto}`).toContain(resuelto);
  expect(Number(await panel.getAttribute("data-paginas"))).toBeLessThanOrEqual(2);
  expect(Number(await panel.getAttribute("data-cuerpo"))).toBeGreaterThanOrEqual(10);
  await expect(page.locator("#edBloqueoPdf")).toHaveCount(0);
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: path.join(DISENO, "02-ajustado-2-paginas.png") });
  const dos = await cumple(2, "objetivo 2");
  expect(dos.forma.previo).toBe(true);

  // Ahora la descarga sí se entrega.
  const bajada = page.waitForEvent("download", { timeout: 120_000 });
  await page.locator("#btnPdf").click();
  expect((await bajada).suggestedFilename()).toMatch(/\.pdf$/);

  // ── 5 · Revertir UN cambio (el primero de la lista) ──────────────────────────
  const cambios = panel.locator("#edAjusteCambios > li");
  const nCambios = await cambios.count();
  expect(nCambios, "el panel dice qué cambió").toBeGreaterThan(0);
  const ids = await cambios.evaluateAll((ls) => ls.map((l) => l.getAttribute("data-cambio")));
  expect(new Set(ids).size, "un cambio por item").toBe(ids.length);
  expect(nCambios, "la lista cuenta lo que dice la frase").toBe(reescritos + fueraN + (/disposicion/.test(palancas) ? 1 : 0));
  await panel.locator("#edAjusteCambios").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(DISENO, "03-que-cambio.png") });
  const uno = cambios.filter({ has: page.locator('button:has-text("Revertir")') }).last();
  const idCambio = (await uno.getAttribute("data-cambio")) ?? "";
  const tipoCambio = (await uno.getAttribute("data-tipo")) ?? "";
  await uno.getByRole("button", { name: "Revertir" }).click();
  await expect(panel.locator(`[data-cambio="${idCambio}"]`)).toHaveAttribute("data-revertido", "", { timeout: 120_000 });
  const trasRevertir = await forma(req, variantId);
  const fila = (f: typeof formaAntes) => f.items.find((i) => i.vid === idCambio);
  if (tipoCambio === "fuera" || tipoCambio === "reescrito") {
    expect(fila(trasRevertir), "el cambio revertido vuelve a como estaba").toEqual(fila(formaAntes));
  } else {
    expect(trasRevertir.basics, "el diseño revertido vuelve a como estaba").toEqual(formaAntes.basics);
  }
  console.log(`[motor] revertido ${tipoCambio} ${idCambio}`);

  // ── 6 · Deshacer ajuste repone TODO ─────────────────────────────────────────
  await panel.locator("#edAjusteDeshacer").click();
  await expect(panel.locator(".flu-cas-res")).toContainText("Ajuste deshecho", { timeout: 120_000 });
  const deshecha = await forma(req, variantId);
  expect(deshecha.items, "Deshacer repone los variant_items").toEqual(formaAntes.items);
  expect(deshecha.basics, "Deshacer repone la plantilla y el diseño").toEqual(formaAntes.basics);
  expect(deshecha.previo).toBe(false);
  expect((await pdf(req, variantId, 2)).huella, "Deshacer repone la huella del PDF").toBe(antes.huella);
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: path.join(DISENO, "04-deshecho.png") });

  // ── 7 · «Elegir cómo ajustar»: A-D medidas, se usa una y se deshace ─────────
  await panel.locator("#edAjusteElegir").click();
  const tarjetas = panel.locator("#edAjusteOpcionesAD > li");
  await expect(tarjetas).toHaveCount(4, { timeout: 900_000 });
  const ops: Record<string, { paginas: number; cuerpo: number; cabe: boolean; plan: boolean }> = {};
  for (const clave of ["A", "B", "C", "D"]) {
    const li = panel.locator(`#edAjusteOpcionesAD > li[data-op="${clave}"]`);
    ops[clave] = {
      paginas: Number(await li.getAttribute("data-paginas")),
      cuerpo: Number(await li.getAttribute("data-cuerpo")),
      cabe: (await li.getAttribute("data-cabe")) === "1",
      plan: await li.getByRole("button", { name: "Usar esta" }).isEnabled(),
    };
    expect(ops[clave]!.paginas, `la tarjeta ${clave} trae su medida`).toBeGreaterThan(0);
  }
  console.log(`[motor] elegir · ${JSON.stringify(ops)}`);
  expect(ops.D!.cabe, "la combinación del motor cabe").toBe(true);
  await expect(panel.locator('#edAjusteOpcionesAD > li[data-op="D"] .flu-cas-mini img, #edAjusteOpcionesAD > li[data-op="D"] .flu-cas-mini canvas').first()).toBeVisible({ timeout: 60_000 }).catch(() => {});
  await panel.locator("#edAjusteOpcionesAD").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(DISENO, "05-elegir-a-d.png") });
  // Se prueba una que no es la D (si alguna cabe) y luego la D: nada se pierde entre medias.
  const otra = ["A", "B", "C"].find((k) => ops[k]!.cabe && ops[k]!.plan);
  for (const clave of otra ? [otra, "D"] : ["D"]) {
    await panel.locator(`#edAjusteOpcionesAD > li[data-op="${clave}"]`).getByRole("button", { name: "Usar esta" }).click();
    await expect(panel.locator(`#edAjusteOpcionesAD > li[data-op="${clave}"] button`)).toHaveText(/Aplicada/, { timeout: 300_000 });
    await cumple(2, `opción ${clave}`);
  }
  await page.screenshot({ path: path.join(DISENO, "06-elegida-d.png") });
  await panel.locator("#edAjusteDeshacer").click();
  await expect(panel.locator(".flu-cas-res")).toContainText("Ajuste deshecho", { timeout: 120_000 });
  expect((await forma(req, variantId)).items, "tras elegir, Deshacer repone todo").toEqual(formaAntes.items);

  // ── 8 · Lo mismo con objetivo 1 y 3 ─────────────────────────────────────────
  const resumen: Record<number, unknown> = { 2: { resuelto, palancas, reescritos, fuera: fueraN, paginas: dos.pages, cuerpo: dos.autofit.bodySize } };
  for (const n of [1, 3] as const) {
    expect((await req.patch(`/api/variants/${variantId}`, { timeout: 300_000, data: { reglas: reglasDe(n) } })).ok()).toBeTruthy();
    expect((await req.patch(`/api/variants/${variantId}`, { timeout: 300_000, data: { paginas_objetivo: n } })).ok()).toBeTruthy();
    await page.goto(`/app/variantes/${variantId}`);
    await expect(ajustar).toBeVisible({ timeout: 120_000 });
    await page.locator("#pvObjetivo button").nth(n - 1).click();
    await expect(page.locator("#pvObjetivo button").nth(n - 1)).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(2_000);
    await ajustar.click();
    await expect(panel.locator(".flu-cas-res")).toBeVisible({ timeout: 900_000 });
    await expect(ajustar).toBeEnabled({ timeout: 900_000 });
    const r = {
      resuelto: await panel.getAttribute("data-resuelto-por"),
      palancas: await panel.getAttribute("data-palancas"),
      reescritos: Number(await panel.getAttribute("data-reescritos")),
      fuera: Number(await panel.getAttribute("data-fuera")),
    };
    console.log(`[motor] ${n} págs · ${JSON.stringify(r)} · ${await panel.locator(".flu-cas-res").textContent()}`);
    expect(["plantilla", "medida", "motor", "ya-cabe"]).toContain(r.resuelto);
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: path.join(DISENO, `07-objetivo-${n}.png`) });
    const d = await cumple(n, `objetivo ${n}`);
    resumen[n] = { ...r, paginas: d.pages, cuerpo: d.autofit.bodySize };
    if (await panel.locator("#edAjusteDeshacer").count()) {
      await panel.locator("#edAjusteDeshacer").click();
      await expect(panel.locator(".flu-cas-res")).toContainText("Ajuste deshecho", { timeout: 120_000 });
      expect((await forma(req, variantId)).items, `objetivo ${n}: Deshacer repone todo`).toEqual(formaAntes.items);
    }
  }

  // ── 9 · C12: sobre la plantilla a medida resultante, paleta, tipografía, QR y
  //    orden siguen funcionando y siguen en 2 páginas (si no, Ajustar lo devuelve a 2).
  expect((await req.patch(`/api/variants/${variantId}`, { timeout: 300_000, data: { reglas: reglasDe(2) } })).ok()).toBeTruthy();
  expect((await req.patch(`/api/variants/${variantId}`, { timeout: 300_000, data: { paginas_objetivo: 2 } })).ok()).toBeTruthy();
  const plantillaActual = async () => {
    const j = (await (await req.get(`/api/variants/${variantId}`, { timeout: 300_000 })).json()) as { items: VItem[] };
    return String(j.items.find((i) => i.kind === "basics")?.override_data?.templateId ?? "");
  };
  const ajustarA2 = async (etiqueta: string) => {
    await page.goto(`/app/variantes/${variantId}`);
    await expect(ajustar).toBeVisible({ timeout: 120_000 });
    await page.locator("#pvObjetivo button").nth(1).click();
    await expect(page.locator("#pvObjetivo button").nth(1)).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(2_000);
    await ajustar.click();
    await expect(panel.locator(".flu-cas-res")).toBeVisible({ timeout: 900_000 });
    await expect(ajustar).toBeEnabled({ timeout: 900_000 });
    console.log(`[c12] ${etiqueta} · ${await panel.getAttribute("data-resuelto-por")} · ${await panel.locator(".flu-cas-res").textContent()}`);
  };
  await ajustarA2("un clic");
  await cumple(2, "C12 · un clic");
  const medida = await plantillaActual();
  console.log(`[c12] plantilla resultante ${medida}`);
  const cambiosDiseno: [string, Record<string, unknown>][] = [
    ["paleta", { paletteId: "oro" }],
    ["tipografía", { typographyId: "editorial" }],
    ["QR", { qrUrl: "corpus.cl/c12-paginas" }],
    ["orden", { sectionOrder: ["work", "projects", "education", "skills", "summary"] }],
  ];
  const trasDiseno: Record<string, unknown> = {};
  for (const [nombre, patch] of cambiosDiseno) {
    const r = await req.patch(`/api/variants/${variantId}`, { timeout: 300_000, data: { presentation: patch } });
    expect(r.ok(), `${nombre}: ${await r.text()}`).toBeTruthy();
    expect(await plantillaActual(), `${nombre}: la plantilla a medida no se pierde`).toBe(medida);
    let d = await pdf(req, variantId, 2);
    if (nombre === "QR") expect(d.plano, "el QR imprime su enlace").toContain("corpus.cl/c12-paginas");
    let reajustado = false;
    if (d.pages > 2 || d.autofit.noCabe) {
      // Con «Máximo 2» rota, la descarga no entrega PDF; Ajustar lo devuelve a 2.
      const p = await req.post("/api/cv", { timeout: 300_000, data: { variantId, as: "pdf", download: true, paginas: 2 } });
      expect(p.status(), `${nombre}: la puerta no entrega el PDF que rompe «Máximo 2»`).toBe(409);
      await ajustarA2(`tras ${nombre}`);
      reajustado = true;
    }
    d = await cumple(2, `C12 · tras ${nombre}`);
    trasDiseno[nombre] = { paginas: d.pages, cuerpo: d.autofit.bodySize, reajustado };
  }
  await page.screenshot({ path: path.join(DISENO, "08-c12-diseno-sobre-medida.png") });
  console.log(`[c12] RESUMEN ${JSON.stringify({ medida, trasDiseno })}`);

  for (const h of supabaseVisto) expect(h, "solo el Supabase local").toMatch(/^(127\.0\.0\.1|localhost):/);
  console.log(`[motor] RESUMEN ${JSON.stringify({ variantId, items: includeIds.length, antes: antes.pages, resumen })}`);
});
