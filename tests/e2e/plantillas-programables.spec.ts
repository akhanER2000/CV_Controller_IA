import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";

/**
 * PLANTILLAS PROGRAMABLES en vivo (DA-A7) — solo contra el Supabase LOCAL.
 *
 * Con la cuenta de prueba local (supabase/cuenta-prueba.json) y una variante desechable:
 *   1 · se guarda una plantilla a medida CON modos de densidad (la espec viaja en params);
 *   2 · sobre esa "u:" la variante cambia paleta, tipografía, foto, QR y orden, y el PDF
 *       real (/api/cv) sigue saliendo con todo su texto;
 *   3 · la galería · «Personalizadas» dice qué modos usa, la DUPLICA y la renombra.
 * Al final se borran la variante y las dos plantillas. Capturas en
 * prompts/lotes-fable5/_diseno/plantillas-programables/.
 */
const RAIZ = process.cwd();
const DISENO = path.join(RAIZ, "prompts/lotes-fable5/_diseno/plantillas-programables");
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

test.setTimeout(600_000);

test("una personalizada con modos de densidad: editable como el catálogo, y la galería la duplica", async ({ page }) => {
  mkdirSync(DISENO, { recursive: true });
  await login(page);
  const req = page.request;
  const items = ((await (await req.get("/api/master")).json()) as { items: { id: string; kind: string }[] }).items;
  test.skip(!items.some((i) => i.kind === "work"), "la cuenta de prueba no tiene experiencia en el master");
  const fijos = items.filter((i) => ["basics", "summary", "work", "education", "skill"].includes(i.kind)).map((i) => i.id);
  const cr = await req.post("/api/variants", {
    data: { mode: "tailor", includeIds: fijos, targetTitle: "AI Engineer", name: "plantillas-programables · e2e" },
  });
  expect(cr.ok(), await cr.text()).toBeTruthy();
  const vid = ((await cr.json()) as { variant: { id: string } }).variant.id;
  const creadas: string[] = [];
  try {
    // 1 · La espec: base + métricas a medio camino + TODOS los modos de densidad.
    const modos = ["sangriaReducida", "espacioCompacto", "habilidadesEnLinea", "fechaLugarDerecha", "cabeceraCompacta"];
    const params = {
      v: 1, base: "ats-clasica", t: 0.5, cuerpo: 10.25, interlineado: 1.2, margenVmm: 16, margenHmm: 31.03,
      espacio: 0.75, titulos: 0.93, paletteId: "patina", typographyId: "clasica", modos,
    };
    const ok = await req.post(`/api/variants/${vid}/ajustar`, {
      data: { accion: "guardar-medida", params, nombre: "Programable · e2e" },
    });
    expect(ok.ok(), await ok.text()).toBeTruthy();
    const { plantilla } = (await ok.json()) as { plantilla: { id: string } };
    creadas.push(plantilla.id);
    const lista = (await (await req.get("/api/plantillas")).json()) as { plantillas: { id: string; params: { modos?: string[] } }[] };
    expect(lista.plantillas.find((p) => p.id === plantilla.id)?.params.modos).toEqual(modos);

    // 2 · Paleta, tipografía, foto, QR y orden sobre la "u:", como sobre el catálogo.
    const foto = await QRCode.toDataURL("foto e2e", { color: { dark: "#335577", light: "#ffeedd" } });
    const pres = await req.patch(`/api/variants/${vid}`, {
      data: {
        presentation: {
          templateId: plantilla.id,
          paletteId: "oro",
          typographyId: "editorial",
          photo: foto,
          qrUrl: "corpus.cl/e2e-programable",
          sectionOrder: ["work", "education", "skills", "summary", "projects"],
        },
      },
    });
    expect(pres.ok(), await pres.text()).toBeTruthy();
    const txt = (await (await req.post("/api/cv", { data: { variantId: vid, as: "text" } })).json()) as { text: string };
    expect(txt.text).toContain("corpus.cl/e2e-programable");
    const pdf = await req.post("/api/cv", { data: { variantId: vid } });
    expect(pdf.ok(), await pdf.text()).toBeTruthy();
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

    // 3 · La galería: qué modos usa, duplicar y renombrar.
    const tarjeta = page.locator(`[data-pestana="propias"] [data-tpl="${plantilla.id}"]`);
    // En un dev compartido una recompilación puede recargar la página a mitad: se reintenta.
    for (let intento = 0; intento < 3; intento += 1) {
      await page.goto(`/app/variantes/${vid}`);
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".flu-ajustar")).toBeVisible({ timeout: 120_000 });
      const tabDiseno = page.getByRole("tab", { name: "Diseño", exact: true });
      if (await tabDiseno.count()) await tabDiseno.first().click();
      await page.waitForTimeout(4_000); // la vista previa sale del PDF real
      if (intento === 0) await page.screenshot({ path: path.join(DISENO, "01-editor-personalizada.png") });
      const abrir = page.locator(".tplopen").first();
      await abrir.scrollIntoViewIfNeeded();
      await abrir.click();
      await page.locator("#tgTab-propias").click();
      if (await tarjeta.isVisible({ timeout: 30_000 }).catch(() => false)) break;
      await tarjeta.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
      if (await tarjeta.isVisible()) break;
    }
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.locator(".tg-modos")).toContainText("cabecera compacta");
    await expect(tarjeta.locator(".tg-modos")).toContainText("habilidades en línea");
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: path.join(DISENO, "02-galeria-modos.png") });

    const antes = (await (await req.get("/api/plantillas")).json()) as { plantillas: { id: string }[] };
    await tarjeta.getByRole("button", { name: "Duplicar" }).click();
    const copia = page.locator('[data-pestana="propias"] article', { hasText: "Programable · e2e (copia)" });
    await expect(copia).toBeVisible({ timeout: 30_000 });
    const despues = (await (await req.get("/api/plantillas")).json()) as {
      plantillas: { id: string; nombre: string; params: { modos?: string[] } }[];
    };
    const nueva = despues.plantillas.find((p) => !antes.plantillas.some((a) => a.id === p.id))!;
    creadas.push(nueva.id);
    expect(nueva.params.modos).toEqual(modos);
    const laCopia = page.locator(`[data-pestana="propias"] [data-tpl="${nueva.id}"]`);
    await laCopia.getByRole("button", { name: "Renombrar" }).click();
    await laCopia.getByLabel("Nombre de la plantilla").fill("Mi copia compacta");
    await laCopia.getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator(`[data-pestana="propias"] [data-tpl="${nueva.id}"]`)).toContainText("Mi copia compacta", {
      timeout: 30_000,
    });
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: path.join(DISENO, "03-galeria-duplicada.png") });
  } finally {
    for (const id of creadas) await req.delete(`/api/plantillas/${encodeURIComponent(id)}`);
    await req.delete(`/api/variants/${vid}`);
  }
});
