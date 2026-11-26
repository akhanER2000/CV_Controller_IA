import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

/**
 * C11 · AJUSTAR + REGLAS, en vivo con el master real de la cuenta de prueba LOCAL
 * (supabase/cuenta-prueba.json; nunca el remoto, DA-V3):
 *   · variante con reglas «Máximo 2 páginas» + «Incluir siempre PharmIQ» (rol y
 *     proyecto) + «No mencionar Unity», tan grande que ni a 10 pt cabe en 2;
 *   · el chip de estado de la barra dice «1 regla sin cumplir» (el PDF pasa de 2);
 *   · UN clic en «Ajustar páginas»: el PDF real queda en ≤2 páginas, PharmIQ sigue,
 *     «Unity» no aparece, nada oculto vuelve a verse y el chip deja de avisar;
 *   · «Deshacer ajuste» repone items, diseño y huella.
 * Capturas en prompts/lotes-fable5/_diseno/ajuste-y-reglas/.
 *
 *   npm run test:e2e:local -- tests/e2e/ajuste-y-reglas.spec.ts
 */

const RAIZ = process.cwd();
const DISENO = path.join(RAIZ, "prompts/lotes-fable5/_diseno/ajuste-y-reglas");
const CUENTA = JSON.parse(readFileSync(path.join(RAIZ, "supabase/cuenta-prueba.json"), "utf8")) as {
  email: string;
  password: string;
};

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
interface VItem {
  id: string;
  item_id: string;
  kind: string;
  visible: boolean;
  override_data: Record<string, unknown> | null;
  override_origin: string | null;
}

const master = async (req: APIRequestContext) =>
  ((await (await req.get("/api/master")).json()) as { items: MItem[] }).items;

/** Texto re-parseado y páginas del PDF REAL de la variante, con el autofit a 2. */
async function pdf(req: APIRequestContext, variantId: string) {
  const r = await req.post("/api/cv", { data: { variantId, as: "text", paginas: 2 } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const j = (await r.json()) as { text: string; pages: number; autofit: { noCabe: boolean; bodySize: number } };
  return { ...j, huella: `${createHash("sha256").update(j.text).digest("hex").slice(0, 16)}·${j.pages}p` };
}

async function forma(req: APIRequestContext, id: string) {
  const j = (await (await req.get(`/api/variants/${id}`)).json()) as { items: VItem[] };
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

async function cajasBarra(page: Page) {
  return page.evaluate(() =>
    ["#pvObjetivo", "#edEstado", ".flu-ajustar", "#edAccionesIA", ".ed-tog", ".ed-tog--pv"].map((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r ? [s, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(":") : `${s}:—`;
    }),
  );
}

/** Los bloques del master sin repetidos: roles con sus viñetas, aptitudes y proyectos. */
function bloquesDelMaster(items: MItem[], fuera: ReadonlySet<string>) {
  const clave = (i: MItem) => `${i.kind}|${String(i.data.company ?? i.data.name ?? "")}|${String(i.data.title ?? "")}`;
  const vistos = new Set<string>();
  const unicos = (l: MItem[]) => l.filter((i) => (vistos.has(clave(i)) ? false : (vistos.add(clave(i)), true)));
  const vinetas = (rol: string) => items.filter((i) => i.kind === "bullet" && i.parentId === rol).map((i) => i.id);
  const roles = unicos(items.filter((i) => i.kind === "work" && !fuera.has(i.id)));
  const aptitudes = unicos(items.filter((i) => i.kind === "skill"));
  const proyectos = unicos(items.filter((i) => i.kind === "project" && !fuera.has(i.id)));
  return [...roles.map((r) => [r.id, ...vinetas(r.id)]), ...aptitudes.map((a) => [a.id]), ...proyectos.map((p) => [p.id])];
}

test.use({ viewport: { width: 1440, height: 960 } });

test("ajuste + reglas · Máximo 2 + Incluir siempre PharmIQ + No mencionar Unity: 2 páginas reales, PharmIQ sigue, sin Unity, y se deshace", async ({ page }) => {
  test.setTimeout(900_000);
  mkdirSync(DISENO, { recursive: true });
  const supabaseVisto = new Set<string>();
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/auth/v1") || u.pathname.startsWith("/rest/v1") || u.hostname.endsWith("supabase.co")) supabaseVisto.add(u.host);
  });
  await login(page);
  const req = page.request;

  // ── 1 · PharmIQ y Unity en el master real ───────────────────────────────────
  const items = await master(req);
  const rolPharm = items.find((i) => i.kind === "work" && /PharmIQ/i.test(String(i.data.company ?? "")));
  const proyPharm = items.find((i) => i.kind === "project" && /PharmIQ/i.test(String(i.data.name ?? "")));
  expect(rolPharm && proyPharm, "el master local tiene el rol y el proyecto PharmIQ (plantilla v2)").toBeTruthy();
  expect(items.some((i) => /\bUnity/i.test(JSON.stringify(i.data))), "el master menciona Unity").toBe(true);
  const pharm = [rolPharm!.id, ...items.filter((i) => i.parentId === rolPharm!.id).map((i) => i.id), proyPharm!.id];
  const primero = (k: string) => items.filter((i) => i.kind === k).slice(0, 1).map((i) => i.id);
  const fijos = [...primero("basics"), ...primero("summary"), ...items.filter((i) => ["education", "language"].includes(i.kind)).map((i) => i.id), ...pharm];
  const bloques = bloquesDelMaster(items, new Set(pharm));
  const reglas = { paginasMax: 2, incluirSiempre: [rolPharm!.id, proyPharm!.id], excluirTerminos: ["Unity"] };

  // ── 2 · La variante: reglas PRIMERO y luego se mide (sin Unity, mide menos) ──
  let variantId = "";
  for (let n = 4; n <= bloques.length && !variantId; n += 2) {
    const cr = await req.post("/api/variants", {
      data: { mode: "tailor", includeIds: [...fijos, ...bloques.slice(0, n).flat()], targetTitle: "AI Engineer", name: `C11 · reglas · ${n} bloques` },
    });
    expect(cr.ok(), await cr.text()).toBeTruthy();
    const id = ((await cr.json()) as { variant: { id: string } }).variant.id;
    const reg = await req.patch(`/api/variants/${id}`, { data: { reglas } });
    expect(reg.ok(), await reg.text()).toBeTruthy();
    expect(((await reg.json()) as { persistido?: boolean }).persistido, "0012 aplicada en local").not.toBe(false);
    await req.patch(`/api/variants/${id}`, { data: { paginas_objetivo: 2 } });
    if ((await pdf(req, id)).autofit.noCabe) variantId = id;
    else await req.delete(`/api/variants/${id}`);
  }
  expect(variantId, "ninguna selección desborda las 2 páginas").not.toBe("");

  // Un item oculto A MANO (una viñeta que no es de PharmIQ): el ajuste no lo devuelve.
  const det0 = (await (await req.get(`/api/variants/${variantId}`)).json()) as { items: VItem[] };
  const aOcultar = det0.items.find((i) => i.kind === "bullet" && i.visible && !pharm.includes(i.item_id));
  expect(aOcultar, "hay una viñeta fuera de PharmIQ que ocultar").toBeTruthy();
  if (!aOcultar) return;
  expect((await req.patch(`/api/variants/${variantId}/items`, { data: { id: aOcultar.id, visible: false } })).ok()).toBeTruthy();

  const antes = await pdf(req, variantId);
  expect(antes.autofit.noCabe).toBe(true);
  expect(antes.text).not.toMatch(/\bunity/i);
  const formaAntes = await forma(req, variantId);
  expect(formaAntes.ocultos).toContain(aOcultar.item_id);
  for (const id of reglas.incluirSiempre) expect(formaAntes.visibles).toContain(id);

  // ── 3 · El editor: el chip avisa la regla obligatoria rota ──────────────────
  await page.goto(`/app/variantes/${variantId}`);
  const ajustar = page.locator(".flu-ajustar");
  await expect(ajustar).toBeVisible({ timeout: 120_000 });
  const rotas = page.locator("#edReglasRotas");
  await expect(rotas).toContainText("1 regla sin cumplir", { timeout: 120_000 });
  await page.waitForTimeout(3_000);
  const barraAntes = await cajasBarra(page);
  await page.locator("#edEstado").click();
  await expect(page.locator(".flu-det-reglas li")).toContainText("máximo es 2");
  await page.screenshot({ path: path.join(DISENO, "01-chip-regla-rota.png") });
  await page.locator("#edEstado").click();

  // ── 4 · Un clic en «Ajustar páginas» ─────────────────────────────────────────
  await ajustar.click();
  const panel = page.locator("#edAjuste");
  await expect(panel).toBeVisible({ timeout: 600_000 });
  await expect(ajustar).toBeEnabled({ timeout: 600_000 });
  const resuelto = (await panel.getAttribute("data-resuelto-por")) ?? "";
  console.log(`[C11] resuelto por ${resuelto} · ${await panel.locator(".flu-cas-res").textContent()}`);
  expect(["plantilla", "medida", "recortes"], `lo resolvió: ${resuelto}`).toContain(resuelto);
  await expect(rotas).toHaveCount(0, { timeout: 120_000 });
  await page.waitForTimeout(3_000);
  expect(await cajasBarra(page), "la barra no se mueve tras ajustar").toEqual(barraAntes);
  await page.screenshot({ path: path.join(DISENO, "02-ajustado.png") });

  // ── 5 · El PDF REAL: ≤2 páginas, PharmIQ sigue, sin Unity ────────────────────
  const despues = await pdf(req, variantId);
  expect(despues.pages, "tras el ajuste el PDF real mide 2 páginas").toBeLessThanOrEqual(2);
  expect(despues.autofit.noCabe).toBe(false);
  expect(despues.text).not.toMatch(/\bunity/i);
  expect(despues.text).toContain("PharmIQ");
  // Texto propio del PROYECTO PharmIQ (el rol dice «generación de turnos»).
  expect(despues.text.replace(/\s+/g, " ")).toMatch(/Gesti[oó]n de turnos con IA/);
  const formaDespues = await forma(req, variantId);
  for (const id of reglas.incluirSiempre) expect(formaDespues.visibles, "«incluir siempre» sobrevive").toContain(id);
  expect(formaDespues.ocultos, "lo oculto sigue oculto").toContain(aOcultar.item_id);
  for (const v of formaDespues.visibles) expect(formaAntes.visibles, "nada oculto vuelve a verse").toContain(v);
  expect(formaDespues.previo).toBe(true);

  // ── 6 · Deshacer ajuste repone todo ──────────────────────────────────────────
  await panel.locator("#edAjusteDeshacer").click();
  await expect(panel.locator(".flu-cas-res")).toContainText("Ajuste deshecho", { timeout: 60_000 });
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: path.join(DISENO, "03-deshecho.png") });
  const formaDeshecha = await forma(req, variantId);
  expect(formaDeshecha.items, "Deshacer repone los variant_items").toEqual(formaAntes.items);
  expect(formaDeshecha.basics, "Deshacer repone la plantilla y el diseño").toEqual(formaAntes.basics);
  expect(formaDeshecha.previo).toBe(false);
  expect((await pdf(req, variantId)).huella, "Deshacer repone la huella del PDF").toBe(antes.huella);
  await expect(rotas).toContainText("1 regla sin cumplir", { timeout: 120_000 });

  for (const h of supabaseVisto) expect(h, "solo el Supabase local").toMatch(/^(127\.0\.0\.1|localhost):/);
  console.log(JSON.stringify({ variantId, antes: antes.pages, resuelto, despues: despues.pages, cuerpo: despues.autofit.bodySize }));
});
