import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getDocumentProxy } from "unpdf";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * EDITOR FLUIDO — equivalencia REAL: la UI nueva del editor (barra compacta,
 * biblioteca en cajón, secciones en tarjetas, vista previa ajustable, atajos)
 * deja EXACTAMENTE el mismo documento que las llamadas de sus manejadores.
 *
 * Mismo usuario, mismo master y DOS variantes gemelas (B = duplicado de A). Las
 * mismas decisiones —quitar una viñeta, reordenar otra, aceptar un acortado (que
 * el servidor vuelve a pasar por verificarAcortado)—: en A por la línea base
 * (las llamadas de removeItem · reorder · fitAcceptShorten), en B por el editor.
 * Se comparan sus variant_items, el texto y la huella del PDF de /api/cv. La
 * propuesta de /ajustar `analizar` se FIJA (page.route); aceptar un acortado NO
 * se intercepta: va al servidor de verdad. Persona INVENTADA.
 *
 * Capturas en prompts/lotes-fable5/_diseno/forja-v2/editor/ (escritorio y 1366 px).
 *
 *   npx playwright test tests/e2e/flujo-cv.spec.ts
 */

const DISENO = path.resolve(process.cwd(), "prompts/lotes-fable5/_diseno");

interface Foto {
  items: unknown[];
  pdfSha: string;
  pdfBytes: number;
  pages: number;
  text: string;
}

function loadEnvLocal(): void {
  const p = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2]!;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = val;
  }
}

async function crearUsuario(): Promise<{ email: string; password: string }> {
  loadEnvLocal();
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `valentina.flujo+${Date.now()}@ejemplo.cl`;
  const password = `Vr-${Math.random().toString(36).slice(2, 12)}-2026!`;
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`no se pudo crear el usuario: ${error.message}`);
  return { email, password };
}

async function login(page: Page, email: string, password: string) {
  // En un `next dev` compartido el formulario puede enviarse antes de hidratar
  // (GET /login?) o recargarse por Fast Refresh: se espera a la red y se reintenta.
  for (let i = 0; i < 4; i += 1) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    try {
      await page.waitForURL(/\/app/, { timeout: 30_000 });
      return;
    } catch {
      /* reintento */
    }
  }
  throw new Error("no se pudo entrar tras 4 intentos");
}

// ── El master de prueba: huecos conocidos a propósito ─────────────────────────
const LARGA =
  "Lideré la migración del monolito a servicios en Kubernetes junto al equipo de plataforma y con mucha coordinación entre áreas para lograrlo.";
const CORTA = "Lideré la migración del monolito a servicios en Kubernetes junto al equipo de plataforma.";

async function sembrar(req: APIRequestContext): Promise<Record<string, string>> {
  const m: Record<string, string> = {};
  const post = async (k: string, kind: string, data: Record<string, unknown>, parentId?: string) => {
    const r = await req.post("/api/master", { data: { kind, data, parentId } });
    expect(r.ok(), `POST master ${k}: ${await r.text()}`).toBeTruthy();
    m[k] = ((await r.json()) as { item: { id: string } }).item.id;
  };
  await post("basics", "basics", { name: "Valentina Rojas Fuentes", label: "Backend Engineer", email: "valentina@ejemplo.cl" });
  await post("summary", "summary", { text: "Ingeniera backend con 6 años en pagos y plataformas." });
  await post("w1", "work", { title: "Backend Engineer", company: "Fintech Andina", dates: "2021 – 2024" });
  await post("b1", "bullet", { text: "Reduje la latencia p95 del API de pagos de 850 ms a 210 ms con caché en Redis." }, m.w1);
  await post("b2", "bullet", { text: LARGA }, m.w1);
  await post("b3", "bullet", { text: "Mantuve la documentación interna del equipo al día." }, m.w1);
  await post("w2", "work", { title: "Desarrolladora", company: "Agencia Sur", dates: "" });
  await post("b4", "bullet", { text: "Construí 12 sitios en Next.js para clientes del retail." }, m.w2);
  await post("b5", "bullet", { text: "Automaticé despliegues con GitHub Actions, de 40 min a 6 min." }, m.w2);
  await post("sk", "skill", { group: "Backend", items: "Go, PostgreSQL, Redis, Kafka" });
  await post("ed", "education", { degree: "Ingeniería Civil en Computación", institution: "Universidad de Chile", dates: "2015 – 2020" });
  return m;
}

async function variante(req: APIRequestContext, m: Record<string, string>): Promise<string> {
  const r = await req.post("/api/variants", { data: { mode: "manual", name: "Backend — Fintech" } });
  expect(r.ok()).toBeTruthy();
  const id = ((await r.json()) as { variant: { id: string } }).variant.id;
  for (const k of ["basics", "summary", "w1", "b1", "b2", "b3", "w2", "b4", "b5", "sk", "ed"]) {
    const a = await req.post(`/api/variants/${id}/items`, { data: { item_id: m[k] } });
    expect(a.ok(), `add ${k}: ${await a.text()}`).toBeTruthy();
  }
  const p = await req.patch(`/api/variants/${id}`, { data: { target_title: "Backend Engineer · pagos" } });
  expect(p.ok()).toBeTruthy();
  return id;
}

interface VItemApi {
  id: string;
  item_id: string;
  kind: string;
  visible: boolean;
  sort_order: number;
  override_data: Record<string, unknown> | null;
  override_origin: string | null;
  override_verified: boolean;
}

/** La propuesta FIJA, armada sobre los ids reales de ESTA variante. */
async function fijarPropuesta(page: Page, varId: string, m: Record<string, string>) {
  const r = await page.request.get(`/api/variants/${varId}`);
  const { items } = (await r.json()) as { items: VItemApi[] };
  const v = (k: string) => items.find((i) => i.item_id === m[k])!.id;
  const ajuste = {
    paginas: 2,
    paginasObjetivo: 1,
    sobran: 9,
    quitar: [{ id: v("b3"), kind: "bullet", texto: "Mantuve la documentación interna del equipo al día.", motivo: "Es la menos ligada al rol objetivo." }],
    reordenar: [
      { id: v("b5"), kind: "bullet", texto: "Automaticé despliegues con GitHub Actions, de 40 min a 6 min.", parentId: m.w2, desde: 1, hasta: 0 },
      { id: v("b4"), kind: "bullet", texto: "Construí 12 sitios en Next.js para clientes del retail.", parentId: m.w2, desde: 0, hasta: 1 },
    ],
    acortar: [
      { id: v("b2"), kind: "bullet", campo: "text", original: LARGA, propuesto: CORTA, motivo: "Se quita el relleno del final.", ahorro: LARGA.length - CORTA.length },
    ],
    falta: [
      { id: v("b3"), kind: "bullet", texto: "Mantuve la documentación interna del equipo al día.", tipo: "sin-cifra", detalle: "ninguna cifra en esta viñeta" },
      { id: v("w2"), kind: "work", texto: "Desarrolladora · Agencia Sur", tipo: "sin-fecha", detalle: "este rol no lleva fechas" },
    ],
    descartados: [],
    notas: "Con quitar una viñeta y acortar otra, cabe.",
  };
  await page.route(`**/api/variants/${varId}/ajustar`, async (route) => {
    const body = route.request().postDataJSON() as { accion?: string };
    if (body?.accion === "analizar") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ajuste }) });
    } else {
      await route.continue(); // aceptar un acortado: servidor REAL, candado real
    }
  });
}

async function esperarPreview(page: Page) {
  await expect(page.locator(".pv-frame")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".pv-busy")).toHaveCount(0, { timeout: 60_000 });
}

/**
 * Abre el editor del flujo nuevo ya CALIENTE. En `next dev`, la primera vez que
 * se compila el chunk de import("@/lib/cv/ajuste") Next recarga la página entera
 * (se ve como dos navegaciones a la misma URL), y una recarga a mitad de prueba
 * borra la propuesta del estado. Se abre, se espera a los huecos (= chunk
 * cargado) y se vuelve a abrir. En producción no hay recarga.
 */
async function abrirEditorNuevo(page: Page, varId: string) {
  // Dos aperturas buenas seguidas. En un `next dev` compartido con otras sesiones
  // que editan, Fast Refresh puede recargar a mitad: se reintenta (hasta 6).
  let buenas = 0;
  for (let i = 0; i < 6 && buenas < 2; i += 1) {
    try {
      await page.goto(`/app/variantes/${varId}`);
      await esperarPreview(page);
      await expect(page.locator(".flu-hueco").first()).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState("networkidle");
      buenas += 1;
    } catch {
      buenas = 0;
    }
  }
  expect(buenas, "el editor no llegó a abrir estable").toBe(2);
}

/**
 * La HUELLA de un PDF. Los bytes no sirven: react-pdf emite los objetos en orden
 * asíncrono y cada render sortea el prefijo del subconjunto de fuente (TJLFSQ+…),
 * así que dos renders del MISMO documento nunca son byte a byte iguales (medido).
 * Se compara lo que se ve: nº de páginas, su tamaño, la secuencia de operaciones
 * de dibujo de cada página y cada trozo de texto con su posición y su ancho.
 */
async function huellaPdf(buf: Buffer) {
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const paginas: unknown[] = [];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  for (let i = 1; i <= doc.numPages; i += 1) {
    const pg = await doc.getPage(i);
    const vp = pg.getViewport({ scale: 1 });
    const ops = await pg.getOperatorList();
    const tc = await pg.getTextContent();
    paginas.push({
      w: r2(vp.width),
      h: r2(vp.height),
      ops: Array.from(ops.fnArray),
      texto: tc.items.map((it) =>
        "str" in it ? [it.str, it.transform.map(r2), r2(it.width), r2(it.height)] : null,
      ),
    });
  }
  return { n: doc.numPages, paginas };
}

/** Lo que deja el flujo: los variant_items (normalizados) y el PDF de /api/cv. */
async function foto(req: APIRequestContext, varId: string): Promise<Foto> {
  const r = await req.get(`/api/variants/${varId}`);
  const { items } = (await r.json()) as { items: VItemApi[] };
  const norm = items
    .map((i) => ({
      item_id: i.item_id,
      kind: i.kind,
      visible: i.visible,
      sort_order: i.sort_order,
      override_data: i.override_data,
      override_origin: i.override_origin,
      override_verified: i.override_verified,
    }))
    .sort((a, b) => a.item_id.localeCompare(b.item_id));
  const pdf = await req.post("/api/cv", { data: { variantId: varId, paginas: 1 } });
  expect(pdf.ok()).toBeTruthy();
  const raw = await pdf.body();
  const txt = await req.post("/api/cv", { data: { variantId: varId, paginas: 1, as: "text" } });
  const tj = (await txt.json()) as { text?: string; pages?: number };
  return {
    items: norm,
    pdfSha: createHash("sha256").update(JSON.stringify(await huellaPdf(raw))).digest("hex"),
    pdfBytes: raw.length,
    pages: Number(tj.pages ?? 0),
    text: String(tj.text ?? ""),
  };
}

const EDITOR = path.join(DISENO, "forja-v2", "editor");
const cap = async (page: Page, nombre: string) => {
  mkdirSync(EDITOR, { recursive: true });
  await page.screenshot({ path: path.join(EDITOR, nombre), fullPage: false });
};
/** La misma vista en escritorio (1440×900) y portátil (1366×768). */
const capDoble = async (page: Page, nombre: string) => {
  await cap(page, `${nombre}-escritorio.png`);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(250);
  await cap(page, `${nombre}-portatil.png`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);
};

// ── LÍNEA BASE: las MISMAS llamadas que hacen los manejadores del editor ──────
/**
 * Lo que el editor ejecuta al aceptar cada decisión, llamado directo:
 *   quitar  → removeItem    → DELETE /api/variants/:id/items?id=…
 *   mover   → reorder       → computeReorder (permuta los sort_order del grupo) + PATCH …/items
 *   acortar → fitAcceptShorten → POST …/ajustar { accion:"acortar" } (candado real del servidor)
 * La UI nueva cambia la presentación, no estas llamadas: si su resultado coincide
 * con el de esta línea base, el documento es el mismo.
 */
async function decisionesPorApi(req: APIRequestContext, varId: string, m: Record<string, string>) {
  const r = await req.get(`/api/variants/${varId}`);
  const { items } = (await r.json()) as { items: VItemApi[] };
  const v = (k: string) => items.find((i) => i.item_id === m[k])!;
  const del = await req.delete(`/api/variants/${varId}/items?id=${encodeURIComponent(v("b3").id)}`);
  expect(del.ok(), `DELETE b3: ${await del.text()}`).toBeTruthy();
  // b5 sube al puesto 0 de su rol: los sort_order del grupo se permutan.
  const grupo = [v("b4"), v("b5")].sort((a, b) => a.sort_order - b.sort_order);
  const valores = grupo.map((g) => g.sort_order).sort((a, b) => a - b);
  const nuevo = [v("b5"), ...grupo.filter((g) => g.id !== v("b5").id)];
  for (const [i, g] of nuevo.entries()) {
    if (g.sort_order === valores[i]) continue;
    const p = await req.patch(`/api/variants/${varId}/items`, { data: { id: g.id, sort_order: valores[i] } });
    expect(p.ok(), `PATCH sort_order: ${await p.text()}`).toBeTruthy();
  }
  const a = await req.post(`/api/variants/${varId}/ajustar`, { data: { accion: "acortar", id: v("b2").id, propuesto: CORTA } });
  expect(a.ok(), `acortar b2: ${await a.text()}`).toBeTruthy();
}

// ── FLUJO NUEVO: las decisiones viven en el documento; la barra es compacta ───
async function flujoNuevo(page: Page, capturas: boolean) {
  const guia = page.locator("#edGuia");
  await expect(guia).toBeVisible();
  // El objetivo de páginas se ve ENTERO (antes se cortaba en «1 pág p»).
  for (const n of ["1 pág", "2 págs", "3 págs"]) {
    await expect(page.locator("#pvObjetivo").getByRole("button", { name: n, exact: true })).toBeVisible();
  }
  // «Qué falta» ya está, sin análisis ni IA; «sin respaldo» va CONTADO por sección.
  await expect(page.locator(".flu-hueco").first()).toBeVisible();
  await expect(page.locator(".flu-sr-b")).toHaveCount(1);
  await expect(page.locator(".flu-sr-l")).toHaveCount(0);
  if (capturas) await capDoble(page, "01-documento");
  await page.locator(".flu-sr-b").click();
  await expect(page.locator(".flu-sr-l li")).toHaveCount(1);
  if (capturas) {
    await page.locator('[data-sec="skills"]').scrollIntoViewIfNeeded();
    await capDoble(page, "02-sin-respaldo");
  }
  // La biblioteca: cajón cerrado por defecto; se abre, se busca, se cierra.
  await expect(page.locator("#edLib")).toHaveCount(0);
  await page.keyboard.press("b");
  await expect(page.locator("#edLib")).toBeVisible();
  await page.locator("#libQ").fill("Kafka");
  if (capturas) await capDoble(page, "03-biblioteca");
  await page.locator("#libQ").fill("");
  await page.locator(".ed-lib-x").click();
  await expect(page.locator("#edLib")).toHaveCount(0);

  await guia.getByRole("button", { name: "Ajustar páginas", exact: true }).click();
  await expect(page.locator(".flu-prop").first()).toBeVisible();
  if (capturas) await capDoble(page, "04-propuestas");
  // LAS MISMAS decisiones. La primera, con el teclado: J marca la próxima bajo
  // la vista y A acepta SOLO la marcada (nunca una que no se ha visto).
  await expect(page.locator(".flu-prop[data-actual]")).toHaveCount(0);
  await page.locator("#midN").click(); // foco fuera de cualquier campo
  await page.keyboard.press("j");
  const marcada = page.locator(".flu-prop[data-actual]");
  await expect(marcada).toHaveCount(1);
  const tipo = (await marcada.getAttribute("data-prop"))!;
  const clave = (await marcada.getAttribute("data-clave"))!;
  if (capturas) await capDoble(page, "05-decision-marcada");
  const respTecla = tipo === "a" ? page.waitForResponse((r) => r.url().includes("/ajustar") && r.request().method() === "POST") : null;
  await page.keyboard.press("a");
  if (respTecla) expect((await respTecla).ok()).toBeTruthy();
  await expect(page.locator(`.flu-prop[data-clave="${clave}"]`)).toHaveCount(0);
  // El resto, con el ratón, en su sitio.
  if ((await page.locator('.flu-prop[data-prop="q"]').count()) > 0) {
    await page.locator('.flu-prop[data-prop="q"]').getByRole("button", { name: "Quitar", exact: true }).click();
  }
  // Mover b5 arriba deja a b4 en su puesto propuesto (y al revés): la segunda
  // decisión de reordenado ya se cumple y no se pide.
  if ((await page.locator('.flu-prop[data-prop="r"]').count()) > 0) {
    await page.locator('.flu-prop[data-prop="r"]').first().getByRole("button", { name: "Mover", exact: true }).click();
  }
  await expect(page.locator('.flu-prop[data-prop="r"]')).toHaveCount(0);
  if ((await page.locator('.flu-prop[data-prop="a"]').count()) > 0) {
    const resp = page.waitForResponse((r) => r.url().includes("/ajustar") && r.request().method() === "POST");
    await page.locator('.flu-prop[data-prop="a"]').getByRole("button", { name: /^Usar/ }).click();
    expect((await resp).ok()).toBeTruthy();
  }
  await expect(page.locator(".flu-prop")).toHaveCount(0);
  // Lo verificado queda sellado: no pide otra revisión.
  await expect(page.locator(".flu-sello").first()).toBeVisible();
  if (capturas) {
    await page.locator("#edEstado").click();
    await expect(page.locator("#edGuiaDet")).toBeVisible();
    await capDoble(page, "06-detalle-estado");
    await page.keyboard.press("Escape");
    await expect(page.locator("#edGuiaDet")).toHaveCount(0);
  }
  // Vista previa: oculta (P), de vuelta, y a pantalla completa (F / Esc).
  await page.keyboard.press("p");
  await expect(page.locator("#edPv")).toBeHidden();
  if (capturas) await capDoble(page, "07-sin-vista-previa");
  await page.keyboard.press("p");
  await expect(page.locator("#edPv")).toBeVisible();
  await page.keyboard.press("f");
  await expect(page.locator("#edGrid")).toHaveAttribute("data-pv", "completo");
  if (capturas) await capDoble(page, "08-vista-previa-completa");
  await page.keyboard.press("Escape");
  await expect(page.locator("#edGrid")).toHaveAttribute("data-pv", "lado");
  // El divisor ajusta el ancho (y nunca se come el centro).
  const pv = page.locator("#edPv");
  const antes = (await pv.boundingBox())!.width;
  const div = page.locator(".ed-split");
  const caja = (await div.boundingBox())!;
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x - 160, caja.y + caja.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await pv.boundingBox())!.width).toBeGreaterThan(antes + 100);
  if (capturas) await capDoble(page, "09-vista-previa-ancha");
  await div.focus();
  await page.keyboard.press("Home"); // vuelve al ancho por defecto
}

test.describe.configure({ mode: "serial" });

/**
 * Una corrida, dos gemelas (B = duplicado de A con el mismo nombre). A recibe las
 * decisiones por la línea base (las llamadas de los manejadores); B, por la UI
 * nueva. Se compara lo que dejan: variant_items, texto y huella del PDF. Además,
 * ABRIR el editor nuevo no puede cambiar el documento (B antes = B tras abrir).
 */
test("editor fluido · mismas decisiones, mismo documento", async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  if (process.env.FLUJO_DEBUG) {
    page.on("framenavigated", (f) => f === page.mainFrame() && console.log("[nav]", f.url()));
    page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 300)));
  }

  const u = await crearUsuario();
  await login(page, u.email, u.password);
  const m = await sembrar(page.request);
  const A = await variante(page.request, m);
  const dup = await page.request.post(`/api/variants/${A}/duplicate`);
  expect(dup.ok()).toBeTruthy();
  const B = ((await dup.json()) as { variant: { id: string } }).variant.id;
  // El duplicado se llama «… (copia)», y el nombre viaja a los metadatos del PDF.
  const ren = await page.request.patch(`/api/variants/${B}`, { data: { name: "Backend — Fintech" } });
  expect(ren.ok()).toBeTruthy();
  const a0 = await foto(page.request, A);
  const b0 = await foto(page.request, B);
  expect(b0.items).toEqual(a0.items);
  expect(b0.pdfSha).toBe(a0.pdfSha);

  await decisionesPorApi(page.request, A, m);
  const fotoA = await foto(page.request, A);

  await fijarPropuesta(page, B, m);
  await abrirEditorNuevo(page, B);
  const bAbierta = await foto(page.request, B);
  await flujoNuevo(page, !process.env.SIN_CAPTURAS);
  await page.waitForTimeout(2500); // PATCH/DELETE optimistas en vuelo
  const fotoB = await foto(page.request, B);
  const fotoA2 = await foto(page.request, A);

  const informe = {
    fecha: new Date().toISOString(),
    comparacion:
      "A = decisiones por las llamadas de los manejadores (DELETE items · PATCH sort_order · POST ajustar acortar); " +
      "B = mismas decisiones por el editor fluido (la primera con J + A; el resto con clic); gemelas con huella idéntica antes de tocarlas",
    abrirNoCambia: { items: JSON.stringify(bAbierta.items) === JSON.stringify(b0.items), huella: bAbierta.pdfSha === b0.pdfSha },
    itemsIguales: JSON.stringify(fotoB.items) === JSON.stringify(fotoA.items),
    textoPdfIgual: fotoB.text === fotoA.text,
    huellaPdfIgual: fotoB.pdfSha === fotoA2.pdfSha,
    huellaAEstable: fotoA.pdfSha === fotoA2.pdfSha,
    huellaB: fotoB.pdfSha,
    paginas: { A: fotoA.pages, B: fotoB.pages },
    variantItems: fotoB.items.length,
  };
  mkdirSync(EDITOR, { recursive: true });
  writeFileSync(path.join(EDITOR, "equivalencia.json"), JSON.stringify(informe, null, 2) + "\n", "utf8");
  expect(bAbierta.items).toEqual(b0.items);
  expect(bAbierta.pdfSha).toBe(b0.pdfSha);
  expect(fotoB.items).toEqual(fotoA.items);
  expect(fotoB.text).toBe(fotoA.text);
  expect(fotoB.pdfSha).toBe(fotoA2.pdfSha);

  // Y el PDF se descarga desde la barra.
  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar PDF" }).click();
  expect((await descarga).suggestedFilename()).toMatch(/\.pdf$/);
});
