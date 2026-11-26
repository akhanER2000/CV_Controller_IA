// C5 · recorrido completo de pantallas-forja-v2 con la cuenta de prueba LOCAL.
// Panel → Master → Revisión → Variantes (PDF de la fila) → Editor (3 páginas +
// descargar PDF) → Importar → Ajustes → Salud → Fuentes → Ingesta → Adaptar →
// Onboarding → Cuenta, en escritorio (1440) y móvil (390).
// coherencia-visual (DA-V5): además mide, en móvil, si la barra inferior tapa
// contenido al final del scroll (tapados) y guarda esa vista como *-movil-fin.png.
// Uso: node prompts/lotes-fable5/_diseno/forja-v2/recorrido/recorrido.mjs [baseURL]
// Requiere `npm run dev:local` (DA-V3: nunca contra el Supabase remoto).
// Además de la captura, mide en el DOM dos defectos: texto CORTADO (un bloque de
// texto con overflow oculto cuyo contenido no cabe) y texto SUPERPUESTO (dos hojas
// de texto visibles cuyas cajas se pisan). Escribe informe.json junto a las fotos.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Filtros para correr una vista a la vez sin cargar el servidor compartido:
//   --tam=escritorio|movil   --vistas=04-variantes,07-ajustes (prefijos de n)
const ARGS = process.argv.slice(2);
const flag = (k) => ARGS.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const BASE = ARGS.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const SOLO_TAM = flag("tam");
const SOLO_VISTAS = flag("vistas")?.split(",").filter(Boolean);
const OUT = path.dirname(fileURLToPath(import.meta.url));
const cuenta = JSON.parse(readFileSync("supabase/cuenta-prueba.json", "utf8"));

const TAMANOS = [
  { sufijo: "escritorio", viewport: { width: 1440, height: 900 } },
  { sufijo: "movil", viewport: { width: 390, height: 844 }, movil: true },
];

/** Corre en la página: devuelve los textos cortados y los pares superpuestos. */
function medir() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const enCapaOculta = (el) => !!el.closest('[aria-hidden="true"], .sr-only, .u-sr, [hidden], dialog:not([open])');
  const hojas = [];
  for (const el of document.querySelectorAll("main *, header *, nav *")) {
    if (enCapaOculta(el) || !visible(el)) continue;
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (propio) hojas.push(el);
  }
  const cortados = [];
  for (const el of hojas) {
    const cs = getComputedStyle(el);
    const oculta = /hidden|clip/.test(cs.overflowX + cs.overflowY) || cs.textOverflow === "ellipsis";
    if (!oculta) continue;
    if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 3) {
      // line-clamp a propósito (lectura resumida) se reporta aparte, no como fallo
      const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== "none";
      cortados.push({ texto: el.innerText.slice(0, 60), clase: String(el.className).slice(0, 60), clamp: !!clamp, ellipsis: cs.textOverflow === "ellipsis" });
    }
  }
  // superposición: rangos de texto reales (no cajas), entre hojas sin relación de ancestro
  // Cada rect de texto se recorta con los ancestros que ocultan su desborde: el
  // texto escondido dentro de una sección plegada o un bloque con scroll no se ve,
  // y no cuenta como superpuesto.
  const recorte = (el) => {
    let c = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 };
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY)) {
        const r = a.getBoundingClientRect();
        c = { left: Math.max(c.left, r.left), top: Math.max(c.top, r.top), right: Math.min(c.right, r.right), bottom: Math.min(c.bottom, r.bottom) };
      }
    }
    return c;
  };
  const cajas = hojas.slice(0, 900).map((el) => {
    const rg = document.createRange();
    rg.selectNodeContents(el);
    const c = recorte(el);
    const rs = [...rg.getClientRects()]
      .map((r) => ({ left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) }))
      .filter((r) => r.right - r.left > 1 && r.bottom - r.top > 1);
    return { el, rs };
  });
  const pisan = (a, b) => {
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return x > 3 && y > 3;
  };
  const superpuestos = [];
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const A = cajas[i], B = cajas[j];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      if (A.rs.some((a) => B.rs.some((b) => pisan(a, b)))) {
        superpuestos.push([A.el.innerText.slice(0, 40), B.el.innerText.slice(0, 40)]);
        if (superpuestos.length > 20) break;
      }
    }
  }
  return { cortados, superpuestos, anchoDoc: document.documentElement.scrollWidth, anchoVista: innerWidth };
}

/** Corre en la página ya desplazada al final: hojas de texto o controles que
 *  quedan debajo de la barra inferior fija (.lt-side) en móvil. */
function tapadosPorBarra() {
  const barra = document.querySelector(".lt-side");
  if (!barra) return [];
  const b = barra.getBoundingClientRect();
  if (getComputedStyle(barra).position !== "fixed" || b.top > innerHeight - 10) return [];
  const out = [];
  for (const el of document.querySelectorAll(".sh-main main *, .sh-main .c-page *")) {
    if (barra.contains(el) || el.closest('[aria-hidden="true"], [hidden], .u-sr')) continue;
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || /^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    if (!propio) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.position === "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom > b.top + 2 && r.top < b.bottom) out.push((el.innerText || el.tagName).trim().slice(0, 50));
    if (out.length > 10) break;
  }
  return out;
}

const navegador = await chromium.launch();
const informe = { fecha: new Date().toISOString(), base: BASE, vistas: [], errores: [] };
for (const t of TAMANOS.filter((x) => !SOLO_TAM || x.sufijo === SOLO_TAM)) {
  const ctx = await navegador.newContext({
    viewport: t.viewport,
    deviceScaleFactor: t.movil ? 2 : 1,
    isMobile: !!t.movil,
    hasTouch: !!t.movil,
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  const pag = await ctx.newPage();
  pag.on("pageerror", (e) => informe.errores.push(`${t.sufijo} ${pag.url()}: ${e.message.slice(0, 200)}`));
  await pag.goto(BASE + "/login", { waitUntil: "load", timeout: 240_000 });
  await pag.waitForTimeout(4000);
  await pag.locator("#em").fill(cuenta.email);
  await pag.locator("#pw").fill(cuenta.password);
  await pag.locator("#auGo").click();
  await pag.waitForURL(/\/app/, { timeout: 240_000 });

  const { variants = [] } = await (await pag.request.get(BASE + "/api/variants")).json();
  if (!variants.length) throw new Error("la cuenta de prueba no tiene variantes: corre antes pantallas/capturas.mjs");
  const varId = variants[0].id;

  const PASOS = [
    { n: "01-panel", ruta: "/app" },
    { n: "02-master", ruta: "/app/master" },
    { n: "03-revision", ruta: "/app/staging" },
    { n: "04-variantes", ruta: "/app/variantes" },
    { n: "05-editor", ruta: `/app/variantes/${varId}`, editor: true },
    { n: "06-importar", ruta: "/app/importar" },
    { n: "07-ajustes", ruta: "/app/ajustes" },
    { n: "08-salud", ruta: `/app/variantes/${varId}/salud` },
    { n: "09-fuentes", ruta: "/app/fuentes" },
    { n: "10-ingesta", ruta: "/app/ingesta" },
    { n: "11-adaptar", ruta: `/app/variantes/${varId}/tailor` },
    { n: "12-onboarding", ruta: "/app/onboarding" },
    { n: "13-cuenta", ruta: "/app/cuenta" },
  ];
  for (const p of PASOS.filter((x) => !SOLO_VISTAS || SOLO_VISTAS.some((v) => x.n.startsWith(v)))) {
    for (let intento = 1; intento <= 3; intento++) {
      let fallo = false;
      const alFallar = () => (fallo = true);
      pag.on("pageerror", alFallar);
      // `load` y no `networkidle`: Variantes mantiene peticiones vivas y nunca
      // queda en reposo de red; lo que importa es que la pantalla termine de cargar.
      const r = await pag.goto(BASE + p.ruta, { waitUntil: "load", timeout: 180_000 }).catch((e) => {
        fallo = true;
        informe.errores.push(`${t.sufijo} ${p.ruta}: ${String(e.message).split(/\r?\n/)[0]}`);
        return null;
      });
      if (!r || r.status() >= 400) informe.errores.push(`${p.ruta} → HTTP ${r?.status()}`);
      const cargo = await pag
        .waitForFunction(() => !/Leyendo|Cargando|Reading|Loading/i.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      pag.off("pageerror", alFallar);
      if (cargo && !fallo) break;
      informe.errores.push(`${t.sufijo} ${p.ruta}: intento ${intento} ${fallo ? "con error de página" : "sin terminar de cargar"}`);
    }
    const extra = {};
    if (p.editor) {
      // el editor termina de pedir y medir su vista previa antes de tocarlo
      const quieto = () =>
        pag
          .waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some((e) => /Midiendo|Measuring/i.test(e.textContent ?? "")), null, { timeout: 30_000 })
          .catch(() => {});
      await pag.waitForTimeout(3000);
      await quieto();
      const tres = pag.locator("#pvObjetivo").getByRole("button", { name: "3 págs", exact: true });
      if (await tres.isVisible().catch(() => false)) {
        for (let i = 0; i < 3 && (await tres.getAttribute("aria-pressed")) !== "true"; i++) {
          await tres.click();
          await pag.waitForTimeout(1500);
        }
        await quieto();
        extra.tresPaginas = (await tres.getAttribute("aria-pressed")) ?? "clic";
      } else extra.tresPaginas = "no visible";
      const boton = pag.getByRole("button", { name: "Descargar PDF" });
      if (await boton.isVisible().catch(() => false)) {
        let descarga = null;
        for (let i = 0; i < 2 && !descarga; i++) {
          const espera = pag.waitForEvent("download", { timeout: 45_000 }).catch(() => null);
          await boton.click();
          descarga = await espera;
        }
        if (descarga) {
          await descarga.saveAs(path.join(OUT, `05-editor-${t.sufijo}.pdf`));
          extra.pdf = descarga.suggestedFilename();
        } else {
          extra.pdf = "SIN descarga · estado: " + (await pag.locator('[role="status"]').allInnerTexts()).join(" | ").slice(0, 160);
          informe.errores.push(`${t.sufijo} editor: el clic en Descargar PDF no descargó`);
        }
      } else extra.pdf = "botón no visible";
      await pag.waitForTimeout(1000);
    }
    if (p.n === "04-variantes") {
      // El botón PDF de la fila descarga el PDF de ESA variante (mismo /api/cv).
      const pdf = pag.locator(".vr-acciones .pdf").first();
      if (await pdf.isVisible().catch(() => false)) {
        const espera = pag.waitForEvent("download", { timeout: 180_000 }).catch(() => null);
        await pdf.click();
        const d = await espera;
        if (d) {
          await d.saveAs(path.join(OUT, `04-variantes-${t.sufijo}.pdf`));
          extra.pdf = d.suggestedFilename();
        } else {
          extra.pdf = "SIN descarga";
          informe.errores.push(`${t.sufijo} variantes: el botón PDF no descargó`);
        }
      } else extra.pdf = "botón no visible";
    }
    await pag.waitForTimeout(1200);
    const m = await pag.evaluate(medir);
    if (t.movil) {
      await pag.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await pag.waitForTimeout(500);
      m.tapados = await pag.evaluate(tapadosPorBarra);
      await pag.screenshot({ path: path.join(OUT, `${p.n}-${t.sufijo}-fin.png`) });
      await pag.evaluate(() => window.scrollTo(0, 0));
    }
    informe.vistas.push({ vista: `${p.n}-${t.sufijo}`, ...extra, ...m });
    await pag.screenshot({ path: path.join(OUT, `${p.n}-${t.sufijo}.png`), fullPage: true });
  }
  await ctx.close();
}
await navegador.close();
writeFileSync(path.join(OUT, SOLO_TAM || SOLO_VISTAS ? `informe-${SOLO_TAM ?? "todos"}${SOLO_VISTAS ? "-" + SOLO_VISTAS.join("+") : ""}.json` : "informe.json"), JSON.stringify(informe, null, 2) + "\n", "utf8");
for (const v of informe.vistas) {
  const desborde = v.anchoDoc > v.anchoVista ? ` DESBORDE ${v.anchoDoc}>${v.anchoVista}` : "";
  const tap = v.tapados ? ` · tapados ${v.tapados.length}` : "";
  console.log(`${v.vista}: cortados ${v.cortados.filter((c) => !c.clamp).length} · superpuestos ${v.superpuestos.length}${tap}${desborde}${v.pdf ? ` · pdf ${v.pdf}${v.tresPaginas ? ` · 3 págs ${v.tresPaginas}` : ""}` : ""}`);
}
console.log(informe.errores.length ? "ERRORES:\n" + informe.errores.join("\n") : "sin errores de página");
