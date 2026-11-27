/**
 * CUÁNTO GANAN LOS MODOS DE DENSIDAD (plantillas-programables, DA-A7).
 *
 *   npx vitest run --config scripts/plantillas/vitest.config.ts scripts/plantillas/capacidad.audit.ts
 *
 * Mide la capacidad REAL (renderizando, no estimando) como «roles extra que caben en
 * 2 páginas» sobre el fixture de ejemplo, en tres bases (fechas a la derecha, en
 * línea propia y colgante):
 *   · la base tal cual, cada modo solo y todos los modos (métricas de la base);
 *   · la plantilla a medida EN SU LÍMITE de antes (sin modos) y la de ahora (con modos).
 * Escribe prompts/lotes-fable5/_diseno/plantillas-programables/capacidad.md.
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDocumentProxy } from "unpdf";
import { renderResumeToBuffer } from "../../src/lib/cv/ResumePDF";
import { medirPdf } from "../../src/lib/cv/medir";
import type { ResumeData } from "../../src/lib/cv/resume";
import {
  MODOS_DENSIDAD,
  getTemplate,
  plantillaDeEspec,
  registrarPlantillaUsuario,
  resolveMetrics,
  type CvTemplate,
  type ModoDensidad,
} from "../../src/lib/cv/templates";
import { modosUtiles, plantillaEnElLimite } from "../../src/lib/cv/plantilla-medida";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "prompts/lotes-fable5/_diseno/plantillas-programables");
const data = JSON.parse(readFileSync(path.join(ROOT, "src/lib/cv/fixtures/datos-ejemplo.json"), "utf8")) as ResumeData;
const conEmpleos = (n: number): ResumeData => {
  const d = structuredClone(data);
  for (let i = 0; i < n; i++) {
    const w = structuredClone(data.work[i % data.work.length]!);
    w.company = `Empresa Extra ${i + 1}`;
    d.work.push(w);
  }
  return d;
};

async function rolesQueCaben(tpl: CvTemplate, paginas = 2): Promise<number> {
  const cabe = async (k: number) => {
    const d = { ...conEmpleos(k), templateId: tpl.id };
    const buf = new Uint8Array(await renderResumeToBuffer(d, { locale: "es" }));
    return (await medirPdf(buf, resolveMetrics(tpl.metrics))).porPagina.length <= paginas;
  };
  if (!(await cabe(0))) return 0;
  let lo = 0;
  let hi = 1;
  while (await cabe(hi)) {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (await cabe(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Páginas que ocupa un documento FIJO (el fixture + 8 roles): las llenas + la
 *  fracción de la última hasta la línea más baja. Más fina que contar roles. */
async function ocupacion(tpl: CvTemplate): Promise<number> {
  const buf = new Uint8Array(await renderResumeToBuffer({ ...conEmpleos(8), templateId: tpl.id }, { locale: "es" }));
  const pdf = await getDocumentProxy(buf);
  const page = await pdf.getPage(pdf.numPages);
  const H = (page.view as number[])[3]!;
  const ys = ((await page.getTextContent()).items as Array<{ str: string; transform: number[] }>)
    .filter((i) => i.str?.trim())
    .map((i) => i.transform[5]!);
  return Math.round((pdf.numPages - 1 + (H - Math.min(...ys)) / H) * 100) / 100;
}

let n = 0;
const conModos = (base: string, modos: readonly ModoDensidad[]) => {
  const t = plantillaDeEspec({ base, modos }, `u:capacidad-${(n += 1)}`, modos.join("+"));
  registrarPlantillaUsuario(t);
  return t;
};

describe("capacidad de los modos de densidad", () => {
  it("mide y escribe capacidad.md", async () => {
    mkdirSync(OUT, { recursive: true });
    const filas: string[] = [];
    for (const base of ["ats-clasica", "ats-expediente", "ats-veterana"]) {
      const b = getTemplate(base);
      const r0 = await rolesQueCaben(b);
      const celdas: string[] = [];
      for (const modo of MODOS_DENSIDAD) {
        if (!modosUtiles(b).includes(modo)) {
          celdas.push("—");
          continue;
        }
        const r = await rolesQueCaben(conModos(base, [modo]));
        celdas.push(`${r} (${r - r0 >= 0 ? "+" : ""}${r - r0})`);
      }
      const todos = await rolesQueCaben(conModos(base, MODOS_DENSIDAD));
      const limAntes = await plantillaEnElLimite(data, b, false);
      const limAhora = await plantillaEnElLimite(data, b, true);
      const antes = await rolesQueCaben(limAntes);
      const ahora = await rolesQueCaben(limAhora);
      const [oAntes, oAhora] = [await ocupacion(limAntes), await ocupacion(limAhora)];
      const ganancia = Math.round((oAntes / oAhora - 1) * 100);
      filas.push(
        `| \`${base}\` | ${r0} | ${celdas.join(" | ")} | **${todos} (+${todos - r0})** | ${antes} · ${oAntes} pág. | **${ahora} (+${ahora - antes}) · ${oAhora} pág. (+${ganancia} % de capacidad)** |`,
      );
      expect(ahora, base).toBeGreaterThanOrEqual(antes);
      expect(oAhora, base).toBeLessThan(oAntes);
    }
    const md = [
      "# Capacidad de los modos de densidad",
      "",
      `Generado por \`scripts/plantillas/capacidad.audit.ts\` (${new Date().toISOString().slice(0, 10)}). ` +
        "Capacidad = roles extra (copias de los del fixture, con sus viñetas) que caben en **2 páginas reales** sobre `datos-ejemplo.json`, medido renderizando el PDF. " +
        "En las dos últimas columnas, además, «pág.» = lo que ocupa un documento FIJO (fixture + 8 roles) y la capacidad ganada = ocupación antes ÷ ocupación ahora − 1.",
      "",
      `| Base | Base tal cual | ${MODOS_DENSIDAD.join(" | ")} | Todos los modos | A medida en su límite, antes | A medida en su límite, ahora |`,
      `|---|---|${MODOS_DENSIDAD.map(() => "---").join("|")}|---|---|---|`,
      ...filas,
      "",
      "«—» = el modo no cambia nada en esa base (en la columna colgante la fecha y el lugar ya comparten columna).",
      "«En su límite» = cuerpo 10 pt, interlineado 1,15, márgenes ≥ 12 mm, aire × 0,5, títulos × 0,85 y la caja ensanchada hasta p90 ≈ 86; «ahora» = eso mismo + todos los modos útiles.",
      "",
    ].join("\n");
    writeFileSync(path.join(OUT, "capacidad.md"), md);
  });
});
