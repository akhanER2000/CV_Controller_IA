import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * «PARTIR DE MI CV ANTERIOR» (DA-V7) — la cadena REAL contra el dev:local.
 *
 * Un usuario nuevo con un master MÍNIMO sembrado (un rol y una viñeta que el CV
 * también trae). Sube el CV sintético de 2 páginas en PDF por la cuarta puerta,
 * revisa lo nuevo, crea la variante y aterriza en el editor con el aviso. Luego
 * repite con el MISMO CV en DOCX. Se comprueba contra la base:
 *   · la variante trae EXACTAMENTE los items de la lectura, en el orden del CV;
 *   · lo que ya estaba en el master no se repite (ni el rol sembrado, ni nada
 *     del PDF al leer el DOCX);
 *   · lo nuevo entra con su procedencia (fuente + página en el PDF);
 *   · el orden de secciones y el título son los del CV; la fuente queda enlazada.
 * La extracción es la real (IA del servidor). Persona INVENTADA.
 *
 *   npm run test:e2e:local -- tests/e2e/desde-cv-anterior.spec.ts --workers=1
 */

const DISENO = path.resolve(process.cwd(), "prompts/lotes-fable5/_diseno/desde-cv-anterior");
const FIXTURES = path.resolve(process.cwd(), "tests/fixtures");

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

function admin(): SupabaseClient {
  loadEnvLocal();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function login(page: Page, email: string, password: string) {
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

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const EMPRESAS = ["puerto digital", "costa brava", "valle hondo"];

interface Corrida {
  variantId: string;
  sourceId: string;
  items: number;
  nuevos: number;
}

/** Sube el CV por la cuarta puerta, revisa, crea y comprueba el aviso del editor. */
async function porLaPuerta(page: Page, archivo: string, captura: string): Promise<Corrida> {
  await page.goto("/app/variantes");
  const entrada = page.getByTestId("cv-anterior-input");
  await expect(entrada).toBeAttached({ timeout: 30_000 });
  await entrada.setInputFiles(path.join(FIXTURES, archivo));

  // El progreso flotante dice el paso real mientras lee.
  await expect(page.locator("#vr-progreso")).toContainText(/Leyendo tu CV|Extrayendo|Verificando/, { timeout: 30_000 });

  const rev = page.getByTestId("cv-anterior-revision");
  await expect(rev).toBeVisible({ timeout: 240_000 });
  await expect(rev).toContainText("Revisión de lo nuevo");
  await rev.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(DISENO, `${captura}-revision.png`) });

  const respuesta = page.waitForResponse((r) => r.url().includes("/api/variants/desde-cv") && r.request().method() === "POST");
  await rev.getByRole("button", { name: "Crear la variante" }).click();
  const j = (await (await respuesta).json()) as { variant: { id: string }; items: number; nuevos: number };
  await page.waitForURL(`**/app/variantes/${j.variant.id}`, { timeout: 60_000 });

  const aviso = page.getByTestId("aviso-desde-cv");
  await expect(aviso).toBeVisible({ timeout: 30_000 });
  await expect(aviso).toContainText(
    `Variante creada desde tu CV anterior: ${j.items} items, ${j.nuevos} nuevos en tu master`,
  );
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(DISENO, `${captura}-editor-aviso.png`) });

  const a = admin();
  const { data: ev } = await a
    .from("ingestion_events")
    .select("source_id,payload")
    .eq("message", "desde-cv.variante");
  const enlace = (ev ?? []).find((e) => (e.payload as { variantId?: string })?.variantId === j.variant.id);
  expect(enlace, "la fuente queda enlazada a la variante").toBeTruthy();
  return { variantId: j.variant.id, sourceId: enlace!.source_id as string, items: j.items, nuevos: j.nuevos };
}

/** Comprobaciones de base comunes a las dos corridas. Devuelve las empresas en orden. */
async function comprobarVariante(userId: string, c: Corrida): Promise<string[]> {
  const a = admin();
  // Lo que se leyó, en el orden del CV.
  const { data: staged } = await a
    .from("staged_items")
    .select("id,kind,data,status,promoted_to")
    .eq("source_id", c.sourceId)
    .eq("user_id", userId);
  const filas = (staged ?? []).sort(
    (x, y) => Number((x.data as Record<string, unknown>)._orden) - Number((y.data as Record<string, unknown>)._orden),
  );
  expect(filas.length).toBeGreaterThan(5);
  // Nada se quedó sin destino: cada fila leída es un item nuevo o uno que ya estaba.
  for (const f of filas) expect(f.promoted_to, `fila ${f.kind} sin item`).toBeTruthy();
  const esperado: string[] = [];
  for (const f of filas) if (!esperado.includes(f.promoted_to as string)) esperado.push(f.promoted_to as string);

  // La variante trae EXACTAMENTE esos items, en ese orden.
  const { data: vitems } = await a
    .from("variant_items")
    .select("item_id,sort_order")
    .eq("variant_id", c.variantId)
    .order("sort_order", { ascending: true });
  expect((vitems ?? []).map((v) => v.item_id)).toEqual(esperado);
  expect(c.items).toBe(esperado.length);

  // Título del CV y orden de secciones del CV (Experiencia → Formación antes que Aptitudes).
  const { data: v } = await a.from("cv_variants").select("name,target_title").eq("id", c.variantId).single();
  expect(norm(v!.target_title)).toContain("ingeniero de datos");
  const { data: items } = await a
    .from("profile_items")
    .select("id,kind,data,source_id,origin,evidence_page,parent_id")
    .in("id", esperado);
  const porId = new Map((items ?? []).map((i) => [i.id as string, i]));
  const basics = esperado.map((id) => porId.get(id)).find((i) => i?.kind === "basics");
  expect(basics, "la cabecera del CV está en la variante").toBeTruthy();
  const { data: vb } = await a
    .from("variant_items")
    .select("override_data")
    .eq("variant_id", c.variantId)
    .eq("item_id", basics!.id)
    .single();
  // El orden de secciones guardado es el de LO LEÍDO (primera aparición de cada
  // sección en el orden del CV). Se compara contra la lectura y no contra un orden
  // fijo: la extracción es la de siempre (IA) y puede no devolver una sección.
  const SECCION: Record<string, string> = {
    summary: "summary", skill: "skills", work: "work", project: "projects", education: "education",
    certification: "certifications", language: "languages", publication: "publications", reference: "references",
  };
  const leidas: string[] = [];
  for (const f of filas) {
    const s = SECCION[f.kind as string];
    if (s && !leidas.includes(s)) leidas.push(s);
  }
  const orden = ((vb!.override_data as Record<string, unknown> | null)?.sectionOrder ?? []) as string[];
  expect(orden.slice(0, leidas.length)).toEqual(leidas);
  // Este CV tiene Experiencia antes que Aptitudes (al revés que el orden por defecto).
  expect(leidas[0]).toBe("work");
  expect(orden.indexOf("skills")).toBeGreaterThan(orden.indexOf("work"));

  // Las experiencias, en el orden del CV.
  return esperado
    .map((id) => porId.get(id))
    .filter((i) => i?.kind === "work")
    .map((i) => norm((i!.data as Record<string, unknown>).company));
}

async function contarPorEmpresa(userId: string): Promise<Record<string, number>> {
  const { data } = await admin().from("profile_items").select("data").eq("user_id", userId).eq("kind", "work");
  const out: Record<string, number> = {};
  for (const e of EMPRESAS) out[e] = (data ?? []).filter((r) => norm((r.data as Record<string, unknown>).company).includes(e)).length;
  return out;
}

test("cuarta puerta: CV anterior en PDF y en DOCX → variante igual al CV, sin duplicar el master", async ({ page }) => {
  test.setTimeout(900_000);
  mkdirSync(DISENO, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  const a = admin();
  const email = `tomas.cvanterior+${Date.now()}@ejemplo.cl`;
  const password = `Ti-${Math.random().toString(36).slice(2, 12)}-2026!`;
  const { data: creado, error } = await a.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !creado.user) throw new Error(`no se pudo crear el usuario: ${error?.message}`);
  const userId = creado.user.id;
  await login(page, email, password);

  // El master mínimo: el rol actual y una de sus viñetas, tal cual los trae el CV.
  const post = async (kind: string, data: Record<string, unknown>, parentId?: string) => {
    const r = await page.request.post("/api/master", { data: { kind, data, parentId }, timeout: 180_000 });
    expect(r.ok(), await r.text()).toBeTruthy();
    return ((await r.json()) as { item: { id: string } }).item.id;
  };
  const rol = await post("work", { title: "Ingeniero de Datos", company: "Puerto Digital SpA", location: "", dates: "mar 2022 – hoy" });
  const vin = await post("bullet", { text: "Diseñé el lago de datos portuario en BigQuery para 14 terminales." }, rol);

  /* ── 1 · PDF de 2 páginas ─────────────────────────────────────────────── */
  const pdf = await porLaPuerta(page, "cv-anterior.pdf", "01-pdf");
  const empresasPdf = await comprobarVariante(userId, pdf);
  expect(empresasPdf.map((e) => EMPRESAS.findIndex((x) => e.includes(x)))).toEqual([0, 1, 2]);

  // Lo sembrado se REUSÓ (no se creó otra vez) y está en la variante.
  const { data: vPdf } = await a.from("variant_items").select("item_id").eq("variant_id", pdf.variantId);
  const enPdf = new Set((vPdf ?? []).map((v) => v.item_id as string));
  expect(enPdf.has(rol)).toBe(true);
  expect(enPdf.has(vin)).toBe(true);
  expect(await contarPorEmpresa(userId)).toEqual({ "puerto digital": 1, "costa brava": 1, "valle hondo": 1 });

  // Lo nuevo entra con procedencia: esta fuente, extraído, y su página (1 o 2).
  const { data: nuevosPdf } = await a
    .from("profile_items")
    .select("kind,origin,evidence_page,data")
    .eq("user_id", userId)
    .eq("source_id", pdf.sourceId);
  expect(nuevosPdf!.length).toBe(pdf.nuevos);
  expect(pdf.nuevos).toBeGreaterThan(0);
  for (const n of nuevosPdf!) expect(n.origin).toBe("extracted");
  const paginas = nuevosPdf!.map((n) => n.evidence_page).filter((p) => p != null);
  expect(paginas.every((p) => p === 1 || p === 2)).toBe(true);
  const hondo = nuevosPdf!.find((n) => n.kind === "work" && norm((n.data as Record<string, unknown>).company).includes("valle hondo"));
  expect(hondo?.evidence_page, "el rol de la página 2 dice página 2").toBe(2);

  /* ── 2 · el MISMO CV en DOCX ──────────────────────────────────────────── */
  const docx = await porLaPuerta(page, "cv-anterior.docx", "02-docx");
  const empresasDocx = await comprobarVariante(userId, docx);
  expect(empresasDocx.map((e) => EMPRESAS.findIndex((x) => e.includes(x)))).toEqual([0, 1, 2]);
  // Nada de lo que ya entró con el PDF se repite en el master.
  expect(await contarPorEmpresa(userId)).toEqual({ "puerto digital": 1, "costa brava": 1, "valle hondo": 1 });
  expect(docx.nuevos).toBeLessThan(docx.items);
  // En DOCX no hay páginas: no se inventa ninguna.
  const { data: nuevosDocx } = await a.from("profile_items").select("evidence_page").eq("source_id", docx.sourceId);
  expect((nuevosDocx ?? []).every((n) => n.evidence_page == null)).toBe(true);
});
