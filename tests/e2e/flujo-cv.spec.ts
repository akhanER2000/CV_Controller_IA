import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getDocumentProxy } from "unpdf";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * FLUJO DEL CV — equivalencia REAL entre el flujo anterior (panel «Ajustar
 * páginas» con cuatro listas) y el nuevo (las decisiones viven en el documento).
 *
 * Mismo usuario, mismo master y DOS variantes gemelas (B = duplicado de A). Se
 * toman EXACTAMENTE las mismas decisiones —quitar una viñeta, reordenar otra,
 * aceptar un acortado (que el servidor vuelve a pasar por verificarAcortado)—, A
 * por el flujo anterior y B por el nuevo, y se comparan sus variant_items y el
 * PDF de /api/cv. La propuesta de /ajustar `analizar` se FIJA (page.route) para
 * que las dos corridas reciban la misma; aceptar un acortado NO se intercepta:
 * va al servidor de verdad.
 *
 * Dos fases, porque el flujo anterior deja de existir al implementar el nuevo:
 *   FLUJO_FASE=antes   → crea usuario + master + A y B; recorre el flujo VIEJO en A.
 *   FLUJO_FASE=despues → recorre el flujo NUEVO en B y compara con la foto de A.
 *   (sin FLUJO_FASE)   → recorrido del flujo nuevo con capturas, usuario propio.
 * El estado entre fases vive en el temp del SO (fuera del repo). Persona INVENTADA.
 *
 *   npx playwright test tests/e2e/flujo-cv.spec.ts
 */

const FASE = process.env.FLUJO_FASE ?? "recorrido";
const STATE = path.join(os.tmpdir(), "corpus-flujo-cv.json");
const DISENO = path.resolve(process.cwd(), "prompts/lotes-fable5/_diseno");

interface Estado {
  email: string;
  password: string;
  /** clave lógica → id del profile_item */
  m: Record<string, string>;
  A: string;
  B: string;
  fotoA?: Foto;
}
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
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
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
  for (let i = 0; i < 2; i += 1) {
    await page.goto(`/app/variantes/${varId}`);
    await esperarPreview(page);
    await expect(page.locator(".flu-hueco").first()).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState("networkidle");
  }
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

const cap = async (page: Page, nombre: string) => {
  mkdirSync(DISENO, { recursive: true });
  await page.screenshot({ path: path.join(DISENO, nombre), fullPage: false });
};

// ── FLUJO ANTERIOR: el panel con cuatro listas, fila por fila ─────────────────
async function flujoAnterior(page: Page) {
  await page.getByRole("button", { name: "Ajustar páginas" }).click();
  const panel = page.locator("#edFit");
  await expect(panel).toBeVisible();
  await cap(page, "flujo-cv-antes-01-panel.png");
  await panel.getByRole("button", { name: "Analizar" }).click();
  await expect(panel.getByText("Qué quitar")).toBeVisible();
  await cap(page, "flujo-cv-antes-02-listas.png");
  await panel.locator(".fitrow").last().scrollIntoViewIfNeeded();
  await cap(page, "flujo-cv-antes-03-que-falta.png");
  // Fila por fila, en el orden del panel: quitar → reordenar ×2 → acortar.
  for (let i = 0; i < 4; i += 1) {
    const btn = panel.locator(".fitacts").getByRole("button", { name: "Aceptar", exact: true }).first();
    const esAcortar = (await btn.locator("xpath=ancestor::div[contains(@class,'fitrow')][1]").getAttribute("class"))?.includes("fitcut");
    if (esAcortar) {
      const resp = page.waitForResponse((r) => r.url().includes("/ajustar") && r.request().method() === "POST");
      await btn.click();
      expect((await resp).ok()).toBeTruthy();
    } else {
      await btn.click();
    }
  }
  await expect(panel.locator(".fitacts").getByRole("button", { name: "Aceptar", exact: true })).toHaveCount(0);
}

// ── FLUJO NUEVO: las decisiones viven en el documento ─────────────────────────
async function flujoNuevo(page: Page, capturas: boolean) {
  const guia = page.locator("#edGuia");
  await expect(guia).toBeVisible();
  // «Qué falta» ya está, sin análisis ni IA: sobre la viñeta, el rol y la aptitud.
  await expect(page.locator(".flu-hueco").first()).toBeVisible();
  if (capturas) await cap(page, "flujo-cv-despues-01-documento.png");
  await guia.getByRole("button", { name: /Proponer recortes/ }).click();
  await expect(page.locator(".flu-prop").first()).toBeVisible();
  if (capturas) await cap(page, "flujo-cv-despues-02-propuestas.png");
  // Las MISMAS decisiones, una a una, en el sitio donde ocurren.
  await page.locator('.flu-prop[data-prop="q"]').getByRole("button", { name: "Quitar", exact: true }).click();
  // Mover b5 arriba deja a b4 en su puesto propuesto: esa segunda decisión ya
  // se cumple y no se pide (en el panel viejo, aceptarla era un no-op).
  await page.locator('.flu-prop[data-prop="r"]').first().getByRole("button", { name: "Mover", exact: true }).click();
  await expect(page.locator('.flu-prop[data-prop="r"]')).toHaveCount(0);
  const resp = page.waitForResponse((r) => r.url().includes("/ajustar") && r.request().method() === "POST");
  const corta = page.locator('.flu-prop[data-prop="a"]');
  if (capturas) {
    await corta.scrollIntoViewIfNeeded();
    await cap(page, "flujo-cv-despues-03-acortar.png");
  }
  await corta.getByRole("button", { name: "Usar", exact: true }).click();
  expect((await resp).ok()).toBeTruthy();
  await expect(page.locator(".flu-prop")).toHaveCount(0);
  // Lo verificado queda sellado: no pide otra revisión.
  await expect(page.locator(".flu-sello").first()).toBeVisible();
  if (capturas) {
    await page.locator(".flu-sello").first().scrollIntoViewIfNeeded();
    await cap(page, "flujo-cv-despues-04-verificado.png");
    await guia.getByRole("button", { name: /Detalle/ }).click();
    await cap(page, "flujo-cv-despues-05-detalle.png");
  }
}

test.describe.configure({ mode: "serial" });

test(`flujo del CV · fase ${FASE}`, async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  if (process.env.FLUJO_DEBUG) {
    page.on("framenavigated", (f) => f === page.mainFrame() && console.log("[nav]", f.url()));
    page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 300)));
  }

  if (FASE === "antes") {
    const u = await crearUsuario();
    await login(page, u.email, u.password);
    const m = await sembrar(page.request);
    const A = await variante(page.request, m);
    const dup = await page.request.post(`/api/variants/${A}/duplicate`);
    expect(dup.ok()).toBeTruthy();
    const B = ((await dup.json()) as { variant: { id: string } }).variant.id;
    // El duplicado se llama «… (copia)», y el nombre viaja a los metadatos del PDF:
    // se le devuelve el mismo nombre para que sean gemelas de verdad.
    const ren = await page.request.patch(`/api/variants/${B}`, { data: { name: "Backend — Fintech" } });
    expect(ren.ok()).toBeTruthy();
    const st: Estado = { ...u, m, A, B };
    // Gemelas de verdad: antes de tocar nada, A y B dejan el mismo documento.
    const a0 = await foto(page.request, A);
    const b0 = await foto(page.request, B);
    expect(b0.items).toEqual(a0.items);
    expect(b0.pdfSha).toBe(a0.pdfSha);
    writeFileSync(STATE, JSON.stringify(st), "utf8");

    await fijarPropuesta(page, A, m);
    await page.goto(`/app/variantes/${A}`);
    await esperarPreview(page);
    await cap(page, "flujo-cv-antes-00-editor.png");
    await flujoAnterior(page);
    await page.waitForTimeout(2500); // PATCH/DELETE optimistas en vuelo
    st.fotoA = await foto(page.request, A);
    writeFileSync(STATE, JSON.stringify(st), "utf8");
    return;
  }

  if (FASE === "inspeccion") {
    const st = JSON.parse(readFileSync(STATE, "utf8")) as Estado;
    await login(page, st.email, st.password);
    const a = await foto(page.request, st.A);
    for (const n of [2, 3, 1]) await page.request.post("/api/cv", { data: { variantId: st.B, paginas: n, as: "preview" } });
    await page.goto(`/app/variantes/${st.B}`);
    await esperarPreview(page);
    const a2 = await foto(page.request, st.A);
    writeFileSync(
      path.join(os.tmpdir(), "corpus-flujo-inspeccion.json"),
      JSON.stringify({ guardada: st.fotoA, ahora: a, otraVez: a2, huella: await huellaPdf(Buffer.from(await (await page.request.post("/api/cv", { data: { variantId: st.A, paginas: 1 } })).body())) }, null, 1),
    );
    return;
  }

  if (FASE === "despues") {
    const st = JSON.parse(readFileSync(STATE, "utf8")) as Estado;
    expect(st.fotoA, "falta la foto de A: corre antes FLUJO_FASE=antes").toBeTruthy();
    await login(page, st.email, st.password);
    // A, re-renderizado en ESTE servidor antes de tocar B: debe coincidir con la
    // foto de la fase anterior (si no, el PDF no es estable entre procesos).
    const fotoAPre = await foto(page.request, st.A);
    await fijarPropuesta(page, st.B, st.m);
    await abrirEditorNuevo(page, st.B);
    await flujoNuevo(page, true);
    await page.waitForTimeout(2500);
    const fotoAPost = await foto(page.request, st.A);
    const fotoB = await foto(page.request, st.B);
    const informe = {
      fecha: new Date().toISOString(),
      comparacion:
        "A = flujo anterior (panel de cuatro listas), B = flujo nuevo (decisiones en el documento); " +
        "gemelas (B = duplicado de A con el mismo nombre, huella idéntica antes de tocarlas); " +
        "mismas decisiones: quitar b3, subir b5, acortar b2 (candado real del servidor)",
      itemsIguales: JSON.stringify(fotoB.items) === JSON.stringify(st.fotoA!.items),
      textoPdfIgual: fotoB.text === st.fotoA!.text,
      huellaPdfIgual: fotoB.pdfSha === fotoAPost.pdfSha,
      huellaAEstable: { faseAntes: st.fotoA!.pdfSha, antesDeB: fotoAPre.pdfSha, despuesDeB: fotoAPost.pdfSha },
      huellaB: fotoB.pdfSha,
      paginas: { A: st.fotoA!.pages, B: fotoB.pages },
      variantItems: fotoB.items.length,
    };
    writeFileSync(path.join(DISENO, "flujo-cv-equivalencia.json"), JSON.stringify(informe, null, 2) + "\n", "utf8");
    if (fotoB.pdfSha !== fotoAPost.pdfSha || fotoAPre.pdfSha !== st.fotoA!.pdfSha) {
      const h = async (id: string) =>
        huellaPdf(Buffer.from(await (await page.request.post("/api/cv", { data: { variantId: id, paginas: 1 } })).body()));
      writeFileSync(path.join(os.tmpdir(), "corpus-flujo-huellas.json"), JSON.stringify({ A: await h(st.A), B: await h(st.B) }));
    }
    expect(fotoB.items).toEqual(st.fotoA!.items);
    expect(fotoB.text).toBe(st.fotoA!.text);
    expect(fotoB.pdfSha).toBe(fotoAPost.pdfSha);
    return;
  }

  // RECORRIDO COMPLETO del flujo nuevo (usuario propio, sin comparación):
  // Variantes → abrir la variante → decidir en el documento → descargar el PDF.
  const u = await crearUsuario();
  await login(page, u.email, u.password);
  const m = await sembrar(page.request);
  const V = await variante(page.request, m);
  await fijarPropuesta(page, V, m);
  await abrirEditorNuevo(page, V); // calienta el chunk en dev (ver abrirEditorNuevo)
  await page.goto("/app/variantes");
  const tarjeta = page.locator(`a[href="/app/variantes/${V}"]`).first();
  await expect(tarjeta).toBeVisible();
  await cap(page, "flujo-cv-recorrido-01-variantes.png");
  await tarjeta.click();
  await page.waitForURL(new RegExp(`/app/variantes/${V}$`));
  await esperarPreview(page);
  await flujoNuevo(page, false);
  await cap(page, "flujo-cv-recorrido-02-decidido.png");
  const descarga = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar PDF" }).click();
  const pdf = await descarga;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
});
