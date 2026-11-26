import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * AFINAR EN VIVO (remate-afinar) — contra el dev:local del 3000 y el Supabase LOCAL:
 *   · el aviso con el que nace la variante («Adaptar a un aviso») queda guardado y el
 *     editor lo tiene (DA-AV3);
 *   · «sin respaldo» pide UNA confirmación: Cancelar no toca nada; Aplicar sí (DA-M5);
 *   · «Revertir afinado» deja la variante como estaba;
 *   · el PDF se descarga;
 *   · ninguna petición del navegador va a un Supabase que no sea 127.0.0.1:55321.
 *
 * Usuario desechable del Supabase local (service role del entorno), master pequeño:
 * «Kubernetes» tiene respaldo en una viñeta que queda FUERA de la variante (se añade)
 * y «Kafka» no tiene ninguno (se oculta).
 *
 *   npm run test:e2e:local -- tests/e2e/afinar-vivo.spec.ts
 */

async function crearUsuario(): Promise<{ email: string; password: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("solo contra el Supabase local");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `afinar.vivo+${Date.now()}@ejemplo.cl`;
  const password = `Av-${Math.random().toString(36).slice(2, 12)}-2026!`;
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

interface VItem {
  id: string;
  item_id: string;
  kind: string;
  visible: boolean;
  override_data: Record<string, unknown> | null;
  override_origin: string | null;
}

const AVISO =
  "Buscamos Backend Engineer para el equipo de pagos. Requisitos: Go, PostgreSQL, Kafka y Kubernetes. " +
  "Valoramos experiencia reduciendo latencia en APIs de alto tráfico.";

/** La forma del documento: qué items hay, cuáles se ven y qué override llevan. */
async function forma(req: APIRequestContext, id: string) {
  const r = await req.get(`/api/variants/${id}`);
  expect(r.ok()).toBeTruthy();
  const j = (await r.json()) as { items: VItem[]; aviso?: string | null };
  const items = j.items
    .map((i) => ({
      item: i.item_id,
      visible: i.visible,
      ov: i.override_data && Object.keys(i.override_data).length ? JSON.stringify(i.override_data) : null,
    }))
    .sort((a, b) => a.item.localeCompare(b.item));
  return { items, aviso: j.aviso ?? null, crudo: j.items };
}

test("afinar en vivo · aviso guardado, confirmación de sin respaldo, revertir y PDF", async ({ page }) => {
  test.setTimeout(240_000);
  const supabaseVisto = new Set<string>();
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/auth/v1") || u.pathname.startsWith("/rest/v1") || u.hostname.endsWith("supabase.co")) {
      supabaseVisto.add(u.host);
    }
  });

  await login(page, await crearUsuario());
  const req = page.request;

  // ── Master pequeño y conocido ──
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
  await crear("bullet", { text: "Me encargué de mantener la documentación interna del equipo al día." }, w1);
  await crear("skill", { group: "Backend", items: "Redis, Kubernetes, Kafka" });
  const mr = await req.get("/api/master");
  const master = ((await mr.json()) as { items: { id: string }[] }).items;

  // ── La variante nace de «Adaptar a un aviso» (sin la viñeta de Kubernetes) ──
  const cr = await req.post("/api/variants", {
    data: {
      mode: "tailor",
      includeIds: master.map((m) => m.id).filter((x) => x !== fuera),
      targetTitle: "Backend Engineer",
      aviso: AVISO,
    },
  });
  expect(cr.ok(), await cr.text()).toBeTruthy();
  const vid = ((await cr.json()) as { variant: { id: string } }).variant.id;

  const base = await forma(req, vid);
  expect(base.aviso, "el aviso queda guardado con la variante").toBe(AVISO);

  await page.goto(`/app/variantes/${vid}`);
  await expect(page.locator("#edAfinar")).toBeVisible({ timeout: 60_000 });

  // ── 1 · «Sin respaldo» (solo aptitudes, sin IA) → Cancelar: nada cambia ──
  await page.locator("#edAfinar").click();
  await expect(page.locator("#edAfinarAviso"), "el editor sabe que la variante tiene aviso").toBeVisible();
  await page.locator('button[data-alcance="skills"]').click();
  const conf = page.locator("#edAfinarRespaldo");
  await expect(conf).toBeVisible({ timeout: 60_000 });
  await expect(conf).toContainText(/Añadiré 1 viñetas y ocultaré 1 aptitudes o grupos/);
  await expect(conf).toContainText("puede sumar páginas");
  await page.locator("#edAfinarRespCancelar").click();
  await expect(conf).toBeHidden();
  expect((await forma(req, vid)).items, "Cancelar no toca la variante").toEqual(base.items);

  // ── 2 · Todo el CV (IA real + candado) → confirmar → Aplicar ──
  const llamadaAfinar = page.waitForResponse((r) => r.url().includes(`/api/variants/${vid}/afinar`) && r.request().method() === "POST", { timeout: 180_000 });
  await page.locator("#edAfinar").click();
  await page.locator('button[data-alcance="todo"]').click();
  const cuerpo = (await llamadaAfinar).request().postDataJSON() as { alcance?: string; aviso?: string };
  expect(cuerpo.aviso, "afinar envía el aviso guardado").toBe(AVISO);
  await expect(conf).toBeVisible({ timeout: 180_000 });
  const trasTexto = await forma(req, vid);
  // Las reescrituras ya están (de un clic); la forma (items y visibilidad) sigue igual.
  expect(trasTexto.items.map((i) => [i.item, i.visible])).toEqual(base.items.map((i) => [i.item, i.visible]));
  const nTexto = trasTexto.crudo.filter((i) => i.override_origin === "ai_rephrased").length;

  await page.locator("#edAfinarRespAplicar").click();
  await expect(conf).toBeHidden({ timeout: 60_000 });
  const aplicado = await forma(req, vid);
  expect(aplicado.items.some((i) => i.item === fuera && i.visible), "la viñeta que respalda Kubernetes entra").toBe(true);
  const skill = aplicado.crudo.find((i) => i.kind === "skill");
  expect(String(skill?.override_data?.items ?? ""), "Kafka (sin respaldo) se oculta").not.toMatch(/Kafka/);
  await expect(page.locator("#edAfinarRes")).toBeVisible();

  // ── 3 · Revertir afinado: vuelve a la forma y al texto de antes ──
  await page.locator("#edAfinarRevertir").click();
  await expect(page.locator("#edAfinarRevertir")).toBeHidden({ timeout: 60_000 });
  const revertido = await forma(req, vid);
  expect(revertido.items, "revertir deja la variante como estaba").toEqual(base.items);
  expect(revertido.crudo.filter((i) => i.override_origin === "ai_rephrased" && i.override_data && Object.keys(i.override_data).length).length).toBe(0);

  // ── 4 · Descargar el PDF ──
  const descarga = page.waitForEvent("download", { timeout: 120_000 });
  await page.locator("#btnPdf").click();
  const d = await descarga;
  expect(d.suggestedFilename()).toMatch(/\.pdf$/);

  // ── 5 · El navegador solo habló con el Supabase local ──
  expect([...supabaseVisto], "peticiones a Supabase").toEqual(["127.0.0.1:55321"]);
  console.log(`[afinar-vivo] textos afinados por IA: ${nTexto} · supabase: ${[...supabaseVisto].join(", ")}`);
});
