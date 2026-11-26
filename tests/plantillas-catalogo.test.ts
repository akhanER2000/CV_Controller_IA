import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import type { ResumeData } from "../src/lib/cv/resume";
import { contrastRatio } from "../src/lib/cv/contrast";
import { getPalette, getTemplate, listTemplates, listTypographies, resolveMetrics, resolveTypography } from "../src/lib/cv/templates";

/**
 * PLANTILLAS-CATALOGO — lo que trajo el lote y los dos fallos del motor que destapó
 * la auditoría (scripts/plantillas/auditoria.audit.ts). Las plantillas nuevas entran
 * además en TODOS los candados de siempre (ats-roundtrip, medida-linea,
 * autofit-10pt, templates), que recorren listTemplates() entero.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const FONTS = path.join(here, "../src/lib/fonts");
const base = JSON.parse(readFileSync(path.join(here, "../src/lib/cv/fixtures/datos-ejemplo.json"), "utf8")) as ResumeData;
const clon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const norm = (x: string) => x.replace(/\s+/g, " ").trim();
async function texto(buf: Uint8Array | Buffer): Promise<string> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
  return norm(text);
}

describe("plantillas-catalogo · las familias nuevas existen de verdad", () => {
  /** Lo que ResumePDF registra de cada familia nueva: archivo y peso. */
  const ARCHIVOS: Record<string, string[]> = {
    "IBM Plex Serif": ["IBMPlexSerif-Regular", "IBMPlexSerif-Medium", "IBMPlexSerif-SemiBold", "IBMPlexSerif-Bold", "IBMPlexSerif-MediumItalic"],
    Spectral: ["Spectral-Medium", "Spectral-SemiBold", "Spectral-MediumItalic"],
    "Crimson Text": ["CrimsonText-SemiBold", "CrimsonText-Bold"],
  };
  const OFL: Record<string, string> = { "IBM Plex Serif": "IBMPlexSerif", Spectral: "Spectral", "Crimson Text": "CrimsonText" };

  it("1 · cada .ttf está en src/lib/fonts y viaja con su licencia OFL", () => {
    for (const [fam, files] of Object.entries(ARCHIVOS)) {
      for (const f of files) expect(existsSync(path.join(FONTS, `${f}.ttf`)), `${fam}: falta ${f}.ttf`).toBe(true);
      const lic = readFileSync(path.join(FONTS, `OFL-${OFL[fam]}.txt`), "utf8");
      expect(lic, `${fam}: OFL-${OFL[fam]}.txt no es la OFL`).toContain("SIL Open Font License");
    }
  });

  it("2 · /api/cv y /ajustar despliegan las .ttf (outputFileTracingIncludes las cubre)", () => {
    const cfg = readFileSync(path.join(here, "../next.config.mjs"), "utf8");
    expect(cfg).toMatch(/"\/api\/cv":\s*\["\.\/src\/lib\/fonts\/\*\.ttf"\]/);
    // Ajustar también renderiza (autofit) y el precalentado carga TODAS las familias.
    expect(cfg).toMatch(/"\/api\/variants\/\*\/ajustar":\s*\["\.\/src\/lib\/fonts\/\*\.ttf"\]/);
  });

  it("3 · ninguna pareja pide un peso que no exista: cuerpo 400/600/700, cursiva 500 si la lleva", () => {
    const PESOS: Record<string, number[]> = {
      Geist: [400, 500, 600, 700], "Geist Mono": [400, 500], "Playfair Display": [500, 600],
      "IBM Plex Serif": [400, 500, 600, 700], Spectral: [500, 600], "Crimson Text": [600, 700],
    };
    const CURSIVA_500 = ["Playfair Display", "IBM Plex Serif", "Spectral"];
    for (const ty of listTypographies()) {
      const r = resolveTypography(ty);
      expect(PESOS[r.display], `${ty.id}: titular ${r.display} ${r.displayWeight}`).toContain(r.displayWeight);
      // El cuerpo pone las viñetas (400), las etiquetas de habilidades (600) y el cargo (700).
      for (const w of [400, 600, 700]) expect(PESOS[r.body], `${ty.id}: cuerpo ${r.body} sin ${w}`).toContain(w);
      if (r.labelItalic) expect(CURSIVA_500, `${ty.id}: ${r.display} no tiene cursiva 500`).toContain(r.display);
    }
  });
});

describe("plantillas-catalogo · paletas formales", () => {
  it("1 · las cinco existen, su acento pasa AA y el cuerpo sigue en tinta oscura", () => {
    for (const id of ["oro", "burdeos", "azul-tinta", "botella", "grafito-calido"]) {
      const p = getPalette(id);
      expect(p, `falta la paleta ${id}`).toBeDefined();
      expect(contrastRatio(p!.accent, "#FFFFFF"), `${id}: acento`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p!.ink, "#FFFFFF"), `${id}: tinta`).toBeGreaterThanOrEqual(15);
    }
  });

  it("2 · Oro viejo: el oro claro es FILETE (no pasa AA) y el que se lee es el oscuro", () => {
    const oro = getPalette("oro")!;
    expect(contrastRatio(oro.hair, "#FFFFFF")).toBeLessThan(3);
    expect(contrastRatio(oro.accent, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("plantillas-catalogo · plantillas nuevas", () => {
  const NUEVAS = ["ats-oro-viejo", "ats-notaria", "ats-tinta-azul", "ats-botella", "ats-grafito-calido", "ats-lamina", "ats-sello", "ats-despacho"];

  it("1 · están las ocho, en gama ATS, a una columna, y usan las familias y paletas nuevas", () => {
    const ids = listTemplates().map((t) => t.id);
    for (const id of NUEVAS) {
      expect(ids).toContain(id);
      const t = getTemplate(id);
      expect(t.gama).toBe("ats");
      expect(t.layout).toEqual({ columns: 1, photo: false, sidebar: false });
      expect(["IBM Plex Serif", "Spectral", "Crimson Text"]).toContain(t.typography.display);
      expect(["oro", "burdeos", "azul-tinta", "botella", "grafito-calido"]).toContain(t.palette.id);
      expect(resolveMetrics(t.metrics).accentName, `${id}: el nombre no va en el acento`).toBe(false);
    }
  });
});

describe("plantillas-catalogo · dos fallos del motor que destapó la auditoría", () => {
  /**
   * ★ EL CV DE UNO NO PUEDE ROMPER EL DEL SIGUIENTE. Un documento con «EDUCACIÓN»
   * y sin «PROYECTOS» dejaba la «O» de Geist Bold cacheada SIN carácter (la pide el
   * subset como componente de la «Ó»); el documento siguiente del mismo proceso
   * escribía «PROYECTOS» con un ToUnicode vacío y el parser leía «PR3YECT3S». Este
   * test tiene que ser el PRIMER render de su archivo para que la caché esté limpia.
   */
  it("1 · dos documentos seguidos en el mismo proceso: el segundo se re-parsea entero", async () => {
    const primero = clon(base);
    primero.projects = [];
    primero.templateId = "ats-cronica";
    await renderResumeToBuffer(primero, { locale: "es", onePage: false });
    const segundo = clon(base);
    segundo.templateId = "ats-cronica";
    const txt = await texto(await renderResumeToBuffer(segundo, { locale: "es", onePage: false }));
    expect(txt).toContain("PROYECTOS");
    expect(txt).not.toMatch(/PR3YECT3S/);
    // Y el precalentado no descuadra las ligaduras («ﬁ» cacheada como un carácter
    // partía «C|atólica» en la columna colgante).
    expect(txt).toContain("Pontificia Universidad Católica de Chile");
  }, 60000);

  /**
   * ★ UN CARGO LARGO SE PARTE, NO PISA LA FECHA. Con las fechas a la derecha, el
   * cargo se medía a su ancho natural: «… Rayén Retail S.A. (etapa 1)» se montaba
   * 10 pt sobre «ene 2020» y el texto salía pegado («(etapa 1)ene 2020»).
   */
  it("2 · cargo largo con fechas a la derecha: se parte, no se solapa y no se pega", async () => {
    const d = clon(base);
    d.work = [...d.work, ...d.work.map((w) => ({ ...w, company: `${w.company} (etapa 1)` }))];
    d.templateId = "ats-clasica";
    const buf = await renderResumeToBuffer(d, { locale: "es", onePage: false });
    expect(await texto(buf)).toContain("Rayén Retail S.A. (etapa 1) ene 2020 – feb 2022");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    for (let p = 1; p <= pdf.numPages; p++) {
      const items = ((await (await pdf.getPage(p)).getTextContent()).items as Array<{ str: string; transform: number[]; width: number }>)
        .filter((i) => i.str.trim());
      for (let a = 0; a < items.length; a++) {
        for (let b = a + 1; b < items.length; b++) {
          const [A, B] = [items[a]!, items[b]!];
          if (Math.abs(A.transform[5]! - B.transform[5]!) > 3) continue;
          const pisa = Math.min(A.transform[4]! + A.width, B.transform[4]! + B.width) - Math.max(A.transform[4]!, B.transform[4]!);
          expect(pisa, `«${A.str}» pisa a «${B.str}»`).toBeLessThanOrEqual(2);
        }
      }
    }
  }, 60000);
});
