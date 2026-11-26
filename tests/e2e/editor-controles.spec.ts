import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { getDocumentProxy } from "unpdf";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";

/**
 * EDITOR INTEGRAL — cada control del editor de variante, pulsado en vivo y con su
 * efecto comprobado (en la pantalla y, si persiste, contra la API).
 *
 * Cuenta: un usuario desechable del Supabase LOCAL (service role del entorno, como
 * flujo-cv) con un master pequeño y conocido. Se arma UNA variante con parte de él
 * (lo demás queda en la biblioteca) y al final se elimina con el propio botón. Dos garantías además de los efectos:
 *   · navegar el editor (vistas, pestañas, biblioteca, galería, idioma) NO cambia
 *     el documento: mismos variant_items y misma huella del PDF antes y después;
 *   · capturas en escritorio (1440), portátil (1366) y móvil (390) en
 *     prompts/lotes-fable5/_diseno/forja-v2/editor-v2/.
 *
 *   npx playwright test tests/e2e/editor-controles.spec.ts   (contra el dev:local del 3000)
 */

/** La respuesta fijada del ajuste de un clic (NDJSON, DA-A4): no resuelve ni aplica nada. */
const AJUSTE_FIJADO =
  JSON.stringify({ tipo: "progreso", paso: 0 }) +
  "\n" +
  JSON.stringify({
    tipo: "resultado",
    aplicado: false,
    resultado: {
      objetivo: 2, resueltoPor: null, antes: { templateId: "ats-clasica", nombre: "Clásica", paginas: 3, cuerpo: 10 },
      plantilla: null, medida: null, recortes: null, alternativas: [],
      medicion: { consideradas: 0, propias: 0, porCapacidad: 0, porFoto: 0, medidas: 0, caben: 0, tope: false, ms: 0 },
      razon: "fijado en la prueba",
    },
  }) +
  "\n";

const RAIZ = process.cwd();
const CAPS = path.join(RAIZ, "prompts/lotes-fable5/_diseno/forja-v2/editor-v2");
/** Un usuario desechable del Supabase LOCAL (service role del entorno, como flujo-cv). */
async function crearUsuario(): Promise<{ email: string; password: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error("solo contra el Supabase local");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `controles.editor+${Date.now()}@ejemplo.cl`;
  const password = `Ce-${Math.random().toString(36).slice(2, 12)}-2026!`;
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`no se pudo crear el usuario: ${error.message}`);
  return { email, password };
}

/** Un master pequeño y conocido (el de flujo-cv) para la cuenta desechable. */
async function sembrar(req: APIRequestContext) {
  const post = async (kind: string, data: Record<string, unknown>, parentId?: string) => {
    const r = await req.post("/api/master", { data: { kind, data, parentId } });
    expect(r.ok(), `POST master ${kind}: ${await r.text()}`).toBeTruthy();
  };
  const crear = async (kind: string, data: Record<string, unknown>) => {
    const r = await req.post("/api/master", { data: { kind, data } });
    expect(r.ok()).toBeTruthy();
    return ((await r.json()) as { item: { id: string } }).item.id;
  };
  await post("basics", { name: "Valentina Rojas Fuentes", label: "Backend Engineer", email: "valentina@ejemplo.cl" });
  await post("summary", { text: "Ingeniera backend con 6 años en pagos y plataformas." });
  const w1 = await crear("work", { title: "Backend Engineer", company: "Fintech Andina", dates: "2021 – 2024" });
  await post("bullet", { text: "Reduje la latencia p95 del API de pagos de 850 ms a 210 ms con caché en Redis." }, w1);
  await post("bullet", { text: "Lideré la migración del monolito a servicios en Kubernetes junto al equipo de plataforma." }, w1);
  await post("bullet", { text: "Mantuve la documentación interna del equipo al día." }, w1);
  const w2 = await crear("work", { title: "Desarrolladora", company: "Agencia Sur", dates: "2018 – 2021" });
  await post("bullet", { text: "Construí 12 sitios en Next.js para clientes del retail." }, w2);
  await post("skill", { group: "Backend", items: "Go, PostgreSQL, Redis, Kafka" });
  await post("skill", { group: "Datos", items: "SQL, dbt, Airflow" });
  await post("education", { degree: "Ingeniería Civil en Computación", institution: "Universidad de Chile", dates: "2015 – 2020" });
  await post("certification", { name: "AWS Solutions Architect", issuer: "Amazon", dates: "2023" });
}

interface MasterApi {
  id: string;
  kind: string;
  parentId: string | null;
  data: Record<string, unknown>;
}
interface VItemApi {
  id: string;
  item_id: string;
  kind: string;
  visible: boolean;
  sort_order: number;
  override_data: Record<string, unknown> | null;
}
interface VarianteApi {
  variant: { id: string; name: string; target_title: string | null; paginas_objetivo?: number };
  items: VItemApi[];
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
  throw new Error("no se pudo entrar con la cuenta de prueba");
}

const leer = async (req: APIRequestContext, id: string): Promise<VarianteApi> => {
  const r = await req.get(`/api/variants/${id}`);
  expect(r.ok(), `GET variante: ${r.status()}`).toBeTruthy();
  return (await r.json()) as VarianteApi;
};
const basicsOv = async (req: APIRequestContext, id: string) =>
  ((await leer(req, id)).items.find((i) => i.kind === "basics")?.override_data ?? {}) as Record<string, unknown>;

/** Huella de un PDF: páginas, operaciones y texto con posición (ver flujo-cv.spec). */
async function huella(req: APIRequestContext, id: string) {
  const v = await leer(req, id);
  const items = v.items
    .map((i) => ({ item_id: i.item_id, kind: i.kind, visible: i.visible, sort_order: i.sort_order, override_data: i.override_data }))
    .sort((a, b) => a.item_id.localeCompare(b.item_id));
  const pdf = await req.post("/api/cv", { data: { variantId: id, paginas: 2 } });
  expect(pdf.ok()).toBeTruthy();
  const doc = await getDocumentProxy(new Uint8Array(await pdf.body()));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const paginas: unknown[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const pg = await doc.getPage(p);
    const tc = await pg.getTextContent();
    paginas.push({
      ops: Array.from((await pg.getOperatorList()).fnArray),
      texto: tc.items.map((it) => ("str" in it ? [it.str, it.transform.map(r2)] : null)),
    });
  }
  return { items, pdf: createHash("sha256").update(JSON.stringify(paginas)).digest("hex") };
}

async function esperarPreview(page: Page) {
  await expect(page.locator(".pv-frame")).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".pv-busy")).toHaveCount(0, { timeout: 90_000 });
}

async function abrir(page: Page, id: string) {
  // En un `next dev` compartido, el primer import("@/lib/cv/ajuste") recarga la
  // página: se abre hasta tenerla estable (huecos calculados + PDF a la vista).
  for (let i = 0; i < 5; i += 1) {
    try {
      await page.goto(`/app/variantes/${id}`);
      await esperarPreview(page);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1200);
      await expect(page.locator("#edGrid")).toBeVisible();
      return;
    } catch {
      /* reintento */
    }
  }
  throw new Error("el editor no abrió estable");
}

const cap = async (page: Page, nombre: string) => {
  mkdirSync(CAPS, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(CAPS, nombre) });
};
/** Sin scroll horizontal de la página (nada se sale por la derecha). */
const sinDesborde = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

/** Espera el PATCH/POST/DELETE que dispara un control. */
const respuesta = (page: Page, re: RegExp, metodo: string) =>
  page.waitForResponse((r) => re.test(r.url()) && r.request().method() === metodo, { timeout: 30_000 });

test.describe.configure({ mode: "serial" });

test("editor integral · cada control hace lo que dice", async ({ page }) => {
  test.setTimeout(600_000);
  const estado: Record<string, string> = {};
  const ok = (control: string) => (estado[control] = "ok");
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, await crearUsuario());
  const req = page.request;
  await sembrar(req);

  // ── Una variante desechable con items del master de la cuenta de prueba ──
  const mr = await req.get("/api/master");
  expect(mr.ok()).toBeTruthy();
  const master = ((await mr.json()) as { items: MasterApi[] }).items;
  const de = (k: string) => master.filter((m) => m.kind === k);
  const rol = de("work").find((w) => master.filter((b) => b.kind === "bullet" && b.parentId === w.id).length >= 2);
  expect(rol, "la cuenta de prueba necesita un rol con dos viñetas").toBeTruthy();
  const vinetas = master.filter((b) => b.kind === "bullet" && b.parentId === rol!.id).slice(0, 3);
  const elegidos = [...de("basics").slice(0, 1), ...de("summary").slice(0, 1), rol!, ...vinetas, ...de("skill").slice(0, 2), ...de("education").slice(0, 1)];
  const nueva = await req.post("/api/variants", { data: { mode: "manual", name: "Controles e2e" } });
  expect(nueva.ok(), await nueva.text()).toBeTruthy();
  const id = ((await nueva.json()) as { variant: { id: string } }).variant.id;
  for (const m of elegidos) {
    const a = await req.post(`/api/variants/${id}/items`, { data: { item_id: m.id } });
    expect(a.ok(), `añadir ${m.kind}: ${await a.text()}`).toBeTruthy();
  }
  await req.patch(`/api/variants/${id}`, { data: { target_title: "Ingeniero de prueba" } });

  // Calentamiento: el primer render tras compilar /api/cv en `next dev` puede
  // diferir (carga de fuentes); la huella de referencia es la del segundo.
  await huella(req, id);
  const antes = await huella(req, id);
  await abrir(page, id);
  await sinDesborde(page);
  await cap(page, "01-editor-escritorio.png");

  // ══ 1 · NAVEGAR NO CAMBIA EL DOCUMENTO ═══════════════════════════════════════
  // Ayuda de atajos (?).
  await page.locator("#edAyuda").click();
  await expect(page.locator("#edAtajos")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#edAtajos")).toHaveCount(0);
  ok("atajos");

  // Chip de estado → detalle; Esc lo cierra.
  await page.locator("#edEstado").click();
  await expect(page.locator("#edGuiaDet")).toBeVisible();
  await expect(page.locator("#edEstado .u-status")).toHaveCount(1);
  await cap(page, "02-detalle-estado-escritorio.png");
  await page.keyboard.press("Escape");
  await expect(page.locator("#edGuiaDet")).toHaveCount(0);
  ok("estado");
  // El hueco reservado de IA está junto a «Ajustar páginas» (vacío, sin lógica).
  await expect(page.locator('#edGuia [data-ranura="acciones-ia"]')).toHaveCount(1);
  ok("hueco IA");

  // Más → Salud (enlace) y eliminar (se prueba al final).
  await page.locator("#edMas").click();
  await expect(page.getByRole("link", { name: "Salud" })).toHaveAttribute("href", `/app/variantes/${id}/salud`);
  await page.keyboard.press("Escape");
  ok("más · salud");
  await expect(page.getByRole("link", { name: "Adaptar a un aviso" })).toHaveAttribute("href", `/app/variantes/${id}/tailor`);
  ok("adaptar");
  await expect(page.locator(".ed-bar .bk")).toHaveAttribute("href", "/app/variantes");
  ok("volver");

  // Biblioteca: abre, pestañas por tipo, filtro, buscador y viñetas bajo su rol.
  await page.getByRole("button", { name: /Biblioteca/ }).click();
  const lib = page.locator("#edLib");
  await expect(lib).toBeVisible();
  await lib.locator('[data-tab="work"]').click();
  await expect(lib.locator('[data-lib-section]')).toHaveCount(1);
  await expect(lib.locator('[data-lib-section="work"]')).toBeVisible();
  await expect(lib.locator(`.lib-card[data-lib="${rol!.id}"]`)).toHaveClass(/\bin\b/);
  await lib.locator(`.lib-card[data-lib="${rol!.id}"] .lib-vin-b`).click();
  await expect(lib.locator(`.lib-card[data-lib="${rol!.id}"] .lib-vin`)).toBeVisible();
  ok("biblioteca · pestañas · viñetas");
  await cap(page, "03-biblioteca-escritorio.png");
  await lib.locator('[data-filtro="fuera"]').click();
  await expect(lib.locator('.lib-card.in[data-kind="skill"]')).toHaveCount(0);
  await lib.locator('[data-filtro="dentro"]').click();
  await expect(lib.locator(".lib-card:not(.in):not([data-kind='work'])")).toHaveCount(0);
  await lib.locator('[data-filtro="todo"]').click();
  ok("biblioteca · filtro");
  await lib.locator('[data-tab="todo"]').click();
  const palabra = String(vinetas[0]!.data.text ?? "").split(/\s+/).find((w) => w.length > 6) ?? "";
  await page.locator("#libQ").fill(palabra);
  await expect(lib.locator(`.lib-vin-r[data-lib="${vinetas[0]!.id}"]`)).toBeVisible();
  await page.locator("#libQ").fill("zzzz-nada-casa-zzzz");
  await expect(lib.locator(".lib-empty")).toBeVisible();
  await page.locator("#libQ").fill("");
  ok("biblioteca · buscador");
  await page.locator(".ed-lib-x").click();
  await expect(lib).toHaveCount(0);
  await page.keyboard.press("b");
  await expect(lib).toBeVisible();
  await page.keyboard.press("b");
  await expect(lib).toHaveCount(0);
  ok("biblioteca · cerrar · B");

  // Navegación fija → Documento; pestañas del documento.
  await page.locator(".edx-nav-b", { hasText: "Documento" }).click();
  await expect(page.locator('[data-sec="doc"]')).toBeInViewport();
  ok("navegación por secciones");
  const doc = page.locator('[data-sec="doc"]');
  await expect(doc.locator("#c-name")).toBeVisible();
  await doc.getByRole("tab", { name: "Diseño" }).click();
  await expect(doc.locator(".tplopen")).toBeVisible();
  await cap(page, "04-documento-diseno-escritorio.png");
  await doc.getByRole("tab", { name: "Orden" }).click();
  await expect(doc.locator(".ordlist")).toBeVisible();
  await doc.getByRole("tab", { name: "Presentación" }).click();
  await expect(doc.locator(".ptog").first()).toBeVisible();
  await doc.getByRole("tab", { name: "Contacto" }).click();
  ok("documento · pestañas");

  // Galería de plantillas: abre y cierra (Esc).
  await doc.getByRole("tab", { name: "Diseño" }).click();
  await doc.locator(".tplopen").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  ok("plantilla · galería");

  // Vista previa: ATS, documento, pantalla completa, ocultar, ancho.
  await page.locator("#segRaw").click();
  await expect(page.locator("#pvRaw")).toBeVisible();
  await expect(page.locator("#pvDoc")).toBeHidden();
  await expect(page.locator("#pvRaw")).toContainText(String(rol!.data.title ?? "").slice(0, 12));
  await cap(page, "05-ats-escritorio.png");
  await page.locator("#segDoc").click();
  await expect(page.locator("#pvDoc")).toBeVisible();
  await expect(page.locator("#pvRaw")).toBeHidden();
  ok("vista previa · documento / ATS");
  await page.locator("#pvCompleta").click();
  await expect(page.locator("#edGrid")).toHaveAttribute("data-pv", "completo");
  await page.keyboard.press("Escape");
  await expect(page.locator("#edGrid")).toHaveAttribute("data-pv", "lado");
  ok("vista previa · pantalla completa");
  await page.locator("#pvOcultar").click();
  await expect(page.locator("#edPv")).toBeHidden();
  await page.locator(".ed-tog--pv").click();
  await expect(page.locator("#edPv")).toBeVisible();
  ok("vista previa · ocultar / mostrar");
  const ancho0 = (await page.locator("#edPv").boundingBox())!.width;
  await page.locator(".ed-split").focus();
  for (let i = 0; i < 4; i += 1) await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await page.locator("#edPv").boundingBox())!.width).toBeGreaterThan(ancho0 + 60);
  await page.keyboard.press("Home");
  ok("vista previa · ancho");

  // Idioma: el editor sigue al idioma de la interfaz (ES ⇄ EN del lateral).
  await page.locator(".um-lang").getByRole("button", { name: "EN", exact: true }).dispatchEvent("click"); // el distintivo «N» de next dev lo tapa
  await expect(page.locator("#btnPdf")).toContainText("Download PDF");
  await page.locator(".um-lang").getByRole("button", { name: "ES", exact: true }).dispatchEvent("click");
  await expect(page.locator("#btnPdf")).toContainText("Descargar PDF");
  ok("idioma");

  await page.waitForTimeout(1500);
  const tras = await huella(req, id);
  expect(tras.items, "navegar no cambia los variant_items").toEqual(antes.items);
  expect(tras.pdf, "navegar no cambia la huella del PDF").toBe(antes.pdf);
  ok("documento intacto al navegar");

  // ══ 2 · LO QUE PERSISTE (efecto comprobado contra la API) ═════════════════════
  // Nombre (en línea).
  const nm = page.locator(".ed-bar .nm");
  await nm.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Controles e2e · renombrada");
  let r = respuesta(page, new RegExp(`/api/variants/${id}$`), "PATCH");
  await page.locator("#midN").click();
  await r;
  expect((await leer(req, id)).variant.name).toBe("Controles e2e · renombrada");
  ok("nombre");

  // Título objetivo.
  await page.locator("#objInput").fill("Ingeniero de prueba · controles");
  r = respuesta(page, new RegExp(`/api/variants/${id}$`), "PATCH");
  await page.locator("#midN").click();
  await r;
  expect((await leer(req, id)).variant.target_title).toBe("Ingeniero de prueba · controles");
  ok("título objetivo");

  // Páginas objetivo 1 · 3 · 2.
  for (const [boton, n] of [["1 pág", 1], ["3 págs", 3], ["2 págs", 2]] as const) {
    r = respuesta(page, new RegExp(`/api/variants/${id}$`), "PATCH");
    await page.locator("#pvObjetivo").getByRole("button", { name: boton, exact: true }).click();
    await r;
    await expect(page.locator("#pvObjetivo").getByRole("button", { name: boton, exact: true })).toHaveAttribute("aria-pressed", "true");
    const guardado = (await leer(req, id)).variant.paginas_objetivo;
    if (guardado !== undefined) expect(guardado).toBe(n);
  }
  ok("páginas 1/2/3");

  // Viñeta: editar en línea → override; revertir → vuelve al master.
  const v1 = (await leer(req, id)).items.find((i) => i.item_id === vinetas[0]!.id)!;
  const fila = page.locator(`.var-b[data-b="${v1.id}"]`);
  await fila.locator(".tx").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" (afinada)");
  r = respuesta(page, new RegExp(`/api/variants/${id}/items`), "PATCH");
  await page.keyboard.press("Enter");
  await r;
  expect((await leer(req, id)).items.find((i) => i.id === v1.id)!.override_data).toBeTruthy();
  ok("afinar en línea");
  r = respuesta(page, new RegExp(`/api/variants/${id}/items`), "PATCH");
  await page.locator(`.rv[data-rv="${v1.id}"]`).click();
  await r;
  expect((await leer(req, id)).items.find((i) => i.id === v1.id)!.override_data).toBeNull();
  ok("revertir");

  // Ocultar / mostrar.
  await fila.hover();
  r = respuesta(page, new RegExp(`/api/variants/${id}/items`), "PATCH");
  await fila.locator('[data-a="hide"]').click();
  await r;
  expect((await leer(req, id)).items.find((i) => i.id === v1.id)!.visible).toBe(false);
  r = respuesta(page, new RegExp(`/api/variants/${id}/items`), "PATCH");
  await fila.locator('[data-a="hide"]').click();
  await r;
  expect((await leer(req, id)).items.find((i) => i.id === v1.id)!.visible).toBe(true);
  ok("ocultar / mostrar");

  // Reordenar con el teclado (asa + flecha).
  const orden0 = (await leer(req, id)).items.find((i) => i.id === v1.id)!.sort_order;
  r = respuesta(page, new RegExp(`/api/variants/${id}/items`), "PATCH");
  await page.locator(`[data-grip="${v1.id}"]`).focus();
  await page.keyboard.press("ArrowDown");
  await r;
  await expect.poll(async () => (await leer(req, id)).items.find((i) => i.id === v1.id)!.sort_order).not.toBe(orden0);
  ok("reordenar");

  // Quitar (×) y volver a añadir desde la biblioteca.
  const v2 = (await leer(req, id)).items.find((i) => i.item_id === vinetas[1]!.id)!;
  await page.locator(`.var-b[data-b="${v2.id}"]`).hover();
  r = respuesta(page, new RegExp(`/api/variants/${id}/items`), "DELETE");
  await page.locator(`.var-b[data-b="${v2.id}"] [data-a="out"]`).click();
  await r;
  expect((await leer(req, id)).items.some((i) => i.item_id === vinetas[1]!.id)).toBe(false);
  ok("quitar");
  await page.keyboard.press("b");
  await page.locator('#edLib [data-tab="work"]').click();
  const tarjeta = page.locator(`#edLib .lib-card[data-lib="${rol!.id}"]`);
  if ((await tarjeta.locator(".lib-vin").count()) === 0) await tarjeta.locator(".lib-vin-b").click();
  r = respuesta(page, new RegExp(`/api/variants/${id}/items`), "POST");
  await tarjeta.locator(`.lib-add[data-add="${vinetas[1]!.id}"]`).click();
  await r;
  expect((await leer(req, id)).items.some((i) => i.item_id === vinetas[1]!.id)).toBe(true);
  await expect(tarjeta.locator(`.lib-add[data-add="${vinetas[1]!.id}"]`)).toHaveAttribute("aria-pressed", "true");
  ok("biblioteca · añadir / quitar");
  await page.locator(".ed-lib-x").click();

  // Documento: cada control guarda en el override de basics de la variante
  // (PATCH {presentation}); «revertir/volver/apagar» lo deja como estaba.
  const ov = async () => JSON.stringify(await basicsOv(req, id));
  const guarda = async (accion: () => Promise<unknown>) => {
    const previo = await ov();
    const rr = respuesta(page, new RegExp(`/api/variants/${id}$`), "PATCH");
    await accion();
    await rr;
    await expect.poll(ov).not.toBe(previo);
    return previo;
  };
  const vuelve = async (previo: string, accion: () => Promise<unknown>) => {
    const rr = respuesta(page, new RegExp(`/api/variants/${id}$`), "PATCH");
    await accion();
    await rr;
    await expect.poll(ov).toBe(previo);
  };

  await page.locator(".edx-nav-b", { hasText: "Documento" }).click();
  await doc.getByRole("tab", { name: "Contacto" }).click();
  let previo = await guarda(async () => {
    await doc.locator("#c-phone").fill("+56 9 1111 2222");
    await doc.locator("#c-location").click();
  });
  expect((await basicsOv(req, id)).phone).toBe("+56 9 1111 2222");
  ok("contacto");
  await vuelve(previo, () => doc.locator(".cfield").filter({ has: page.locator("#c-phone") }).locator(".crev").click());
  ok("contacto · revertir");

  await guarda(async () => {
    await doc.locator(".caddlink").click();
    await doc.locator(".clink .url").last().fill("https://ejemplo.cl/portafolio");
    await doc.locator("#c-name").click();
  });
  expect(await ov()).toContain("ejemplo.cl/portafolio");
  ok("enlaces");

  // Diseño: plantilla (galería tal cual), paleta y tipografía.
  await doc.getByRole("tab", { name: "Diseño" }).click();
  await doc.locator(".tplopen").click();
  await guarda(() => page.getByRole("dialog").locator(".tg-card:not(.is-active) .tg-pick").first().click());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  ok("plantilla");
  const chipPaleta = doc.locator(".cfield").nth(1).locator(".dchip").nth(1);
  await guarda(() => chipPaleta.click());
  await expect(chipPaleta).toHaveAttribute("aria-pressed", "true");
  ok("paleta");
  const chipTipo = doc.locator(".cfield").nth(2).locator(".dchip").nth(1);
  await guarda(() => chipTipo.click());
  await expect(chipTipo).toHaveAttribute("aria-pressed", "true");
  ok("tipografía");

  // Orden: bajar una sección y volver al de la plantilla.
  await doc.getByRole("tab", { name: "Orden" }).click();
  previo = await guarda(() => doc.locator(".ordrow:not(.pinned) .ordacts button:not([disabled])").first().click());
  ok("orden");
  await guarda(() => doc.locator(".cfield").first().locator(".dchip").last().click());
  ok("orden · volver al de la plantilla");

  // Presentación: QR y referencias (si la cuenta los permite), encender y apagar.
  await doc.getByRole("tab", { name: "Presentación" }).click();
  for (const [n, nombre] of [[1, "QR"], [2, "referencias"]] as const) {
    const caja = doc.locator(".ptog input[type=checkbox]").nth(n);
    if (!(await caja.isEnabled())) {
      estado[nombre] = "deshabilitado en esta cuenta (sin datos)";
      continue;
    }
    const antesCaja = await caja.isChecked();
    await guarda(() => caja.click());
    await expect(caja).toBeChecked({ checked: !antesCaja });
    // Apagar el QR deja {url:"", mode:"url"} (= apagado, mismo manejador de siempre):
    // se comprueba el interruptor y que el PATCH salió.
    const rr = respuesta(page, new RegExp(`/api/variants/${id}$`), "PATCH");
    await caja.click();
    await rr;
    await expect(caja).toBeChecked({ checked: antesCaja });
    ok(nombre);
  }

  // Ajustar páginas: la propuesta (fijada, sin gastar IA) aparece bajo su item y
  // se rechaza una sin tocar el documento.
  const items = (await leer(req, id)).items;
  const vQuitar = items.find((i) => i.item_id === vinetas[0]!.id)!;
  // «Ajustar páginas» es de un clic (DA-A4); la propuesta item a item es «Revisar
  // uno por uno», en su panel. Las dos respuestas se fijan: no se aplica nada.
  await page.route(`**/api/variants/${id}/ajustar`, (route) =>
    (route.request().postDataJSON() as { accion?: string })?.accion === "ajustar"
      ? route.fulfill({ status: 200, contentType: "application/x-ndjson", body: AJUSTE_FIJADO })
      : route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ajuste: {
              paginas: 2, paginasObjetivo: 1, sobran: 4,
              quitar: [{ id: vQuitar.id, kind: "bullet", texto: "x", motivo: "La menos ligada al rol." }],
              reordenar: [], acortar: [], falta: [], descartados: [], notas: "",
            },
          }),
        }),
  );
  await page.locator("#edGuia").getByRole("button", { name: "Ajustar páginas", exact: true }).click();
  await page.locator("#edAjusteRevisar").click();
  const prop = page.locator(`.flu-prop[data-for="${vQuitar.id}"]`);
  await expect(prop).toBeVisible();
  await prop.scrollIntoViewIfNeeded();
  await cap(page, "06-propuesta-escritorio.png");
  await prop.getByRole("button", { name: "Mantener", exact: true }).click();
  await expect(prop).toHaveCount(0);
  expect((await leer(req, id)).items.some((i) => i.id === vQuitar.id)).toBe(true);
  ok("ajustar páginas");

  // Descargar PDF.
  const descarga = page.waitForEvent("download");
  await page.locator("#btnPdf").click();
  expect((await descarga).suggestedFilename()).toMatch(/\.pdf$/);
  ok("descargar PDF");

  // ══ 3 · CAPTURAS PORTÁTIL Y MÓVIL ═════════════════════════════════════════════
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator("#edNav .edx-nav-b").first().click();
  await cap(page, "07-editor-portatil.png");
  await sinDesborde(page);
  await page.keyboard.press("b");
  await cap(page, "08-biblioteca-portatil.png");
  await sinDesborde(page);
  await page.keyboard.press("b");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await sinDesborde(page);
  await cap(page, "09-editor-movil.png");
  await page.locator('.ed-tabs [data-view="preview"]').click();
  await expect(page.locator("#edPv")).toBeVisible();
  await cap(page, "10-vista-previa-movil.png");
  await page.locator('.ed-tabs [data-view="master"]').click();
  await expect(page.locator("#edLib")).toBeVisible();
  await cap(page, "11-biblioteca-movil.png");
  await sinDesborde(page);
  await page.locator('.ed-tabs [data-view="mid"]').click();
  await expect(page.locator("#edLib")).toHaveCount(0);
  await page.locator(".edx-nav-b", { hasText: "Documento" }).click();
  await cap(page, "12-documento-movil.png");
  await sinDesborde(page);
  ok("capturas sin desborde");
  await page.setViewportSize({ width: 1440, height: 900 });

  // ══ 4 · VOLVER Y ELIMINAR ═════════════════════════════════════════════════════
  await page.locator(".ed-bar .bk").click();
  await page.waitForURL(/\/app\/variantes$/);
  await abrir(page, id);
  await page.locator("#edMas").click();
  await page.getByRole("button", { name: "Eliminar variante" }).click();
  await page.locator(".ed-delconfirm").getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.waitForURL(/\/app\/variantes$/);
  // Borrado SUAVE (se archiva): sale del listado de variantes.
  const lista = await req.get("/api/variants");
  expect(lista.ok()).toBeTruthy();
  expect(await lista.text()).not.toContain(id);
  ok("eliminar");

  writeFileSync(path.join(CAPS, "controles.json"), JSON.stringify({ fecha: new Date().toISOString(), estado }, null, 2) + "\n");
});
