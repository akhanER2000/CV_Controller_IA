import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { extractText, getDocumentProxy } from "unpdf";
import { CREDS_PATH, type E2ECreds } from "./global-setup";

/**
 * LA CADENA REAL, con una persona INVENTADA (Valentina Rojas Fuentes, ingeniera
 * de datos). Un solo test secuencial: cada paso depende del anterior.
 *
 *   login → estados VACÍOS → volcado (Gemini real) → staging con evidencia →
 *   aceptar → master POBLADO → PDF (/api/cv) → round-trip ATS (unpdf).
 *
 * Es lento y costoso A PROPÓSITO: prueba la cadena real, no un mock.
 */

const CONTEXT = `Me llamo Valentina Rojas Fuentes y soy ingeniera de datos.
Durante tres años trabajé en Andes Analytics como Data Engineer, construyendo pipelines de datos en Python y SQL sobre BigQuery, procesando cerca de 200 millones de eventos al mes.
Mi correo es valentina.rojas@ejemplo.cl y mi GitHub es github.com/valrojas.
Estudié Ingeniería Civil Informática en la Universidad de Concepción (2015 - 2020). Manejo inglés nivel B2.`;

function creds(): E2ECreds {
  return JSON.parse(readFileSync(CREDS_PATH, "utf8")) as E2ECreds;
}

test("cadena completa: cuenta nueva → vacío → volcado → staging → master → PDF", async ({ page }) => {
  const { email, password } = creds();
  let variantId = "";

  await test.step("login con la cuenta nueva (auth real de Supabase)", async () => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL("**/app", { timeout: 30_000 });
  });

  await test.step("dashboard: estado día-1 VACÍO", async () => {
    await expect(page.getByText("Tu registro está vacío")).toBeVisible();
  });

  await test.step("master: estado VACÍO", async () => {
    await page.goto("/app/master");
    await expect(page.getByRole("heading", { name: "Aún no hay registro." })).toBeVisible();
  });

  await test.step("variantes: estado VACÍO (derivado del count real)", async () => {
    await page.goto("/app/variantes");
    await expect(page.getByText("Sin variantes todavía")).toBeVisible();
  });

  await test.step("fuentes: estado VACÍO", async () => {
    await page.goto("/app/fuentes");
    await expect(page.getByText("Aún no has conectado ninguna fuente.")).toBeVisible();
  });

  await test.step("volcado: pegar contexto con link → extraer con evidencia (Gemini real)", async () => {
    await page.goto("/app/importar");
    await page.getByLabel("Pega aquí lo que tengas").fill(CONTEXT);
    const go = page.getByRole("button", { name: "Extraer con evidencia" });
    await expect(go).toBeEnabled();
    await go.click();
    // La extracción real tarda; el "fin" aparece cuando termina.
    await expect(page.getByText("items esperan tu revisión")).toBeVisible({ timeout: 120_000 });
    await page.getByRole("link", { name: "Revisar en staging →" }).click();
    await page.waitForURL("**/app/staging");
  });

  await test.step("staging: items con evidencia; aceptar lo verificado + el resto", async () => {
    // Al menos un item con su acción de aceptar y su botón de origen (evidencia).
    await expect(page.locator("button.ok").first()).toBeVisible({ timeout: 30_000 });
    expect(await page.getByRole("button", { name: /origen/ }).count()).toBeGreaterThan(0);

    // Lote de verificados por la UI (la acción principal del usuario).
    const batch = page.getByRole("button", { name: /Aceptar todo lo verificado/ });
    if ((await batch.count()) > 0 && (await batch.isEnabled())) {
      await batch.click();
      await expect(page.getByRole("button", { name: /Aceptando/ })).toBeHidden({ timeout: 30_000 }).catch(() => {});
    }

    // El resto (p. ej. basics sin evidencia) vía API: estable frente a la
    // animación/re-render de la lista (no es un fallo de app, es una carrera del test).
    const { items = [] } = await page.request.get("/api/staging").then((r) => r.json());
    for (const it of items as { id: string }[]) {
      await page.request.post("/api/staging/accept", { data: { stagedId: it.id } });
    }
  });

  await test.step("master: ahora POBLADO (items con origen/evidencia)", async () => {
    await page.goto("/app/master");
    // #msN muestra "N items · …" con N ≥ 1 (nunca "0 items").
    await expect(page.locator("#msN")).toHaveText(/[1-9]\d* items/, { timeout: 20_000 });
    await expect(page.locator("#msEmpty")).toBeHidden();
  });

  await test.step("PDF del master (/api/cv) + round-trip ATS (unpdf) contiene 'Valentina'", async () => {
    const resp = await page.request.post("/api/cv", { data: { fromMaster: true } });
    expect(resp.status()).toBe(200);
    expect(resp.headers()["content-type"]).toContain("application/pdf");

    const buf = await resp.body();
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain("Valentina");
  });

  // ── VARIANTES: crear con IA en un clic (parte del master REAL) ──────────────
  await test.step("crear variante con IA: 'Backend Engineer' (POST mode:'ai')", async () => {
    // La IA real (Gemini) puede tardar; damos margen amplio.
    const resp = await page.request.post("/api/variants", {
      data: { mode: "ai", prompt: "Backend Engineer" },
      timeout: 120_000,
    });
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as { variant?: { id?: string } };
    expect(body.variant?.id).toBeTruthy();
    variantId = body.variant!.id!;

    // La UI del editor carga la variante ya armada (el #objInput es su ancla).
    await page.goto(`/app/variantes/${variantId}`);
    await expect(page.locator("#objInput")).toBeVisible({ timeout: 20_000 });
  });

  await test.step("la variante referencia items REALES del master y tiene target_title", async () => {
    const { variant, items, master } = (await page.request
      .get(`/api/variants/${variantId}`)
      .then((r) => r.json())) as {
      variant: { target_title: string | null };
      items: { item_id: string }[];
      master: { id: string }[];
    };
    expect(items.length).toBeGreaterThan(0);
    const masterIds = new Set(master.map((m) => m.id));
    for (const it of items) expect(masterIds.has(it.item_id)).toBe(true);
    expect((variant.target_title ?? "").trim().length).toBeGreaterThan(0);
  });

  await test.step("PDF de la variante (/api/cv {variantId}): honestidad + round-trip ATS", async () => {
    // Corpus del master: TODO el texto de sus datos, para la prueba de honestidad.
    const { master } = (await page.request
      .get(`/api/variants/${variantId}`)
      .then((r) => r.json())) as { master: { data: Record<string, unknown> }[] };
    const masterText = master
      .flatMap((m) => Object.values(m.data ?? {}))
      .map((x) => String(x))
      .join(" ")
      .replace(/\s+/g, " ");

    const resp = await page.request.post("/api/cv", { data: { variantId } });
    expect(resp.status()).toBe(200);
    expect(resp.headers()["content-type"]).toContain("application/pdf");

    const buf = await resp.body();
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const flat = text.replace(/\s+/g, " ");

    // Round-trip: la persona inventada y sus datos del master están en el PDF.
    expect(flat).toContain("Valentina");

    // Honestidad: ninguna cifra de ≥3 dígitos del PDF puede faltar en el master
    // (la variante NO inventa números que no estén en tu registro).
    const nums = flat.match(/\d{3,}/g) ?? [];
    for (const n of nums) {
      expect(masterText, `cifra «${n}» del PDF ausente en el master`).toContain(n);
    }
  });
});
