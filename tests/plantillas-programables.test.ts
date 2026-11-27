import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import QRCode from "qrcode";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import { toPlainText, type ResumeData } from "../src/lib/cv/resume";
import { medirPdf } from "../src/lib/cv/medir";
import {
  CUERPO_MIN_PT,
  MODOS_DENSIDAD,
  aplicarModos,
  getTemplate,
  listPalettes,
  listTypographies,
  modosDe,
  normalizarModos,
  plantillaDeEspec,
  registrarPlantillaUsuario,
  resolveMetrics,
  resolveTemplate,
  type CvTemplate,
  type ModoDensidad,
} from "../src/lib/cv/templates";
import {
  ESCALONES,
  LIMITES_MEDIDA,
  buscarPlantillaMedida,
  modosUtiles,
  p90DeLinea,
  paramsDeEscalon,
  pasaRoundTrip,
  plantillaDeParams,
  plantillaEnElLimite,
  validarParams,
} from "../src/lib/cv/plantilla-medida";

/**
 * PLANTILLAS PROGRAMABLES (DA-A7): una plantilla es una EspecPlantilla —base del
 * catálogo + métricas + modos de densidad— que el motor de siempre renderiza.
 * Lo que tiene que ser verdad:
 *   · cada modo de densidad, solo y todos juntos, deja el PDF dentro de los límites
 *     ATS (round-trip en orden, p90 ≤ 90, cuerpo ≥ 10 pt, márgenes ≥ 12 mm, una
 *     columna) y gana sitio o lo deja igual;
 *   · una personalizada "u:" cambia de paleta, tipografía, foto, QR y orden igual que
 *     una del catálogo, y su PDF sigue pasando el round-trip;
 *   · la plantilla a medida en su límite tiene MÁS capacidad que la de antes.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(path.join(here, "../src/lib/cv/fixtures/datos-ejemplo.json"), "utf8"),
) as ResumeData;
const conEmpleos = (n: number): ResumeData => {
  const d = structuredClone(data);
  for (let i = 0; i < n; i++) {
    const w = structuredClone(data.work[i % data.work.length]!);
    w.company = `Empresa Extra ${i + 1}`;
    d.work.push(w);
  }
  return d;
};
// Una «foto» PNG RGB de verdad (el PNG de 1 px en gris de otros tests @react-pdf
// no lo llega a incrustar, y aquí se cuenta la imagen en el PDF).
let PNG = "";
const mm = (v: string) => {
  const x = /^(\d+(?:\.\d+)?)mm$/.exec(v.trim());
  return x ? parseFloat(x[1]!) : NaN;
};
const render = async (d: ResumeData) => new Uint8Array(await renderResumeToBuffer(d, { locale: "es", onePage: false }));
const texto = async (buf: Uint8Array) => {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
  return text.replace(/\s+/g, " ");
};

/** Lo que ocupa el documento, en páginas: las llenas + la fracción de la última
 *  (de lo alto de la página a la línea base más baja con texto). */
const ocupacion = async (buf: Uint8Array) => {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const page = await pdf.getPage(pdf.numPages);
  const [, , , H] = page.view as [number, number, number, number];
  const ys = ((await page.getTextContent()).items as Array<{ str: string; transform: number[] }>)
    .filter((i) => i.str?.trim())
    .map((i) => i.transform[5]!);
  return pdf.numPages - 1 + (H - Math.min(...ys)) / H;
};
const imagenes = (buf: Uint8Array) => (Buffer.from(buf).toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;

let n = 0;
const conModos = (base: string, modos: readonly ModoDensidad[]): CvTemplate => {
  const t = plantillaDeEspec({ base, modos }, `u:test-modos-${(n += 1)}`, `Prueba ${modos.join("+")}`);
  registrarPlantillaUsuario(t);
  return t;
};

describe("EspecPlantilla · los modos de densidad (puros)", () => {
  it("sin modos, la métrica es la misma (mismo objeto): las del catálogo no cambian ni un byte", () => {
    const m = getTemplate("ats-clasica").metrics;
    expect(aplicarModos(m, [])).toBe(m);
    expect(aplicarModos(m, undefined)).toBe(m);
  });
  it("normalizarModos: solo modos conocidos, sin repetir y en el orden canónico", () => {
    expect(normalizarModos(["cabeceraCompacta", "inventado", "sangriaReducida", "sangriaReducida"])).toEqual([
      "sangriaReducida",
      "cabeceraCompacta",
    ]);
    expect(normalizarModos(null)).toEqual([]);
  });
  it("★ ningún modo toca cuerpo, interlineado, márgenes ni columnas (eso es de las métricas)", () => {
    for (const base of ["ats-clasica", "ats-expediente", "ats-veterana", "ats-registro"]) {
      const r0 = resolveMetrics(getTemplate(base).metrics);
      const r1 = resolveMetrics(aplicarModos(getTemplate(base).metrics, MODOS_DENSIDAD));
      expect([r1.bodySize, r1.bodyLeading, r1.pageMarginV, r1.pageMarginH, r1.skeleton]).toEqual([
        r0.bodySize, r0.bodyLeading, r0.pageMarginV, r0.pageMarginH, r0.skeleton,
      ]);
      expect(r1.bulletIndent).toBeGreaterThanOrEqual(0);
      expect(r1.bulletHang).toBeLessThanOrEqual(r1.bulletIndent);
    }
  });
  it("cada plantilla de la espec guarda su espec y dice qué modos usa", () => {
    const t = conModos("ats-clasica", ["cabeceraCompacta", "habilidadesEnLinea"]);
    expect(modosDe(t)).toEqual(["habilidadesEnLinea", "cabeceraCompacta"]);
    expect(t.espec?.base).toBe("ats-clasica");
    expect(t.layout).toEqual({ columns: 1, photo: false, sidebar: false });
    expect(t.gama).toBe("ats");
    expect(modosDe(getTemplate("ats-clasica"))).toEqual([]);
  });
  it("en la columna colgante «fecha y lugar a la derecha» no es útil (ya comparten columna)", () => {
    expect(modosUtiles(getTemplate("ats-veterana"))).not.toContain("fechaLugarDerecha");
    expect(modosUtiles(getTemplate("ats-clasica"))).toEqual([...MODOS_DENSIDAD]);
  });
});

describe("★ cada modo de densidad pasa el round-trip ATS y la medida, sobre el PDF real", () => {
  // Cuatro bases que cubren las cuatro colocaciones de fecha: derecha, línea propia,
  // en línea y columna colgante.
  const BASES = ["ats-clasica", "ats-expediente", "ats-registro", "ats-veterana"];
  for (const base of BASES) {
    it(`${base}: cada modo solo y todos juntos`, async () => {
      const occ0 = await ocupacion(await render({ ...data, templateId: base }));
      const casos: ModoDensidad[][] = [...modosUtiles(getTemplate(base)).map((m) => [m]), [...MODOS_DENSIDAD]];
      for (const modos of casos) {
        const tpl = conModos(base, modos);
        const d = { ...data, templateId: tpl.id };
        const buf = await render(d);
        const r = resolveMetrics(tpl.metrics);
        const tag = `${base} + ${modos.join("+")}`;
        expect(await pasaRoundTrip(d, buf), tag).toBeNull();
        expect(await p90DeLinea(buf), tag).toBeLessThanOrEqual(LIMITES_MEDIDA.p90Max);
        expect(r.bodySize, tag).toBeGreaterThanOrEqual(CUERPO_MIN_PT);
        expect(mm(r.pageMarginH), tag).toBeGreaterThanOrEqual(LIMITES_MEDIDA.margenMinMm);
        expect(mm(r.pageMarginV), tag).toBeGreaterThanOrEqual(LIMITES_MEDIDA.margenMinMm);
        expect(tpl.layout.columns, tag).toBe(1);
        // Gana sitio o lo deja igual (con 1 % de holgura por el reparto de una línea).
        expect(await ocupacion(buf), tag).toBeLessThanOrEqual(occ0 + 0.01);
      }
    }, 120000);
  }

  it("cabecera compacta: el contacto y los enlaces caen en UNA línea; fecha y lugar comparten fila", async () => {
    const tpl = conModos("ats-clasica", ["cabeceraCompacta", "fechaLugarDerecha"]);
    const d = { ...data, templateId: tpl.id };
    const txt = await texto(await render(d));
    const w = data.work[0]!;
    // La ubicación va pegada a las fechas (mismo párrafo), no en su línea.
    expect(txt).toContain(`${w.dates.es} ${w.location.es}`.replace(/\s+/g, " "));
    expect(txt).toContain(data.basics.email);
    // El texto plano (rayos-X) sigue diciendo lo mismo, en el mismo orden.
    expect(toPlainText(d, { locale: "es", onePage: false })).toContain(w.location.es);
  }, 60000);
});

describe("★ una personalizada es tan editable como una del catálogo", () => {
  let propia: CvTemplate;
  beforeAll(async () => {
    PNG = await QRCode.toDataURL("foto de prueba", { color: { dark: "#335577", light: "#ffeedd" } });
    const p = paramsDeEscalon(getTemplate("ats-clasica"), 0.5, {}, undefined, ["sangriaReducida", "cabeceraCompacta"]);
    expect(validarParams(p)).toEqual({ ok: true });
    propia = plantillaDeParams(p, "u:00000000-0000-4000-8000-00000000abcd", "Mía");
  });

  it("paleta y tipografía de la variante sobreescriben las de su espec", () => {
    const pal = listPalettes().find((x) => x.id !== propia.palette.id)!;
    const ty = listTypographies().find((x) => x.id !== propia.typography.id)!;
    const t = resolveTemplate({ templateId: propia.id, paletteId: pal.id, typographyId: ty.id });
    expect(t.id).toBe(propia.id);
    expect(t.palette.id).toBe(pal.id);
    expect(t.typography.id).toBe(ty.id);
    expect(t.metrics).toBe(propia.metrics); // la espec (modos incluidos) se conserva
  });

  it("★ cambia paleta, tipografía, foto, QR y orden y su PDF sigue pasando el round-trip", async () => {
    const pal = listPalettes().find((x) => x.id !== propia.palette.id)!;
    const ty = listTypographies().find((x) => x.id !== propia.typography.id && x.id !== "ats-geist")!;
    const orden = ["work", "education", "skills", "summary", "projects"] as const;
    const d: ResumeData = {
      ...data,
      templateId: propia.id,
      paletteId: pal.id,
      typographyId: ty.id,
      photo: PNG,
      qr: { url: "dgatica.cl/portafolio" },
      sectionOrder: orden,
    };
    const buf = await render(d);
    expect(await pasaRoundTrip(d, buf)).toBeNull();
    const txt = await texto(buf);
    expect(txt).toContain("dgatica.cl/portafolio"); // QR: la URL va como texto
    const conFoto = imagenes(buf); // la foto + el glifo del QR
    // El orden de la variante manda también sobre la personalizada.
    const plano = toPlainText(d, { locale: "es", onePage: false });
    const pos = (s: string) => plano.indexOf(s.toUpperCase());
    expect(pos(data.headings.work.es)).toBeLessThan(pos(data.headings.summary.es));
    // Y el PDF es OTRO documento que el de la personalizada sin cambios.
    const sin = await render({ ...data, templateId: propia.id });
    expect(Buffer.compare(Buffer.from(sin), Buffer.from(buf))).not.toBe(0);
    // Sin foto: el mismo documento sin imagen, y sigue pasando.
    const sinFoto = { ...d, photo: undefined };
    const b2 = await render(sinFoto);
    expect(imagenes(b2)).toBeLessThan(conFoto);
    expect(await pasaRoundTrip(sinFoto, b2)).toBeNull();
  }, 120000);
});

describe("★ la plantilla a medida: primero la densidad, después las métricas", () => {
  /** Cuántos roles extra caben en `paginas` páginas reales con esta plantilla. */
  const rolesQueCaben = async (tpl: CvTemplate, paginas: number) => {
    const cabe = async (k: number) => {
      const d = { ...conEmpleos(k), templateId: tpl.id, paletteId: undefined, typographyId: undefined };
      return (await medirPdf(await render(d), resolveMetrics(tpl.metrics))).porPagina.length <= paginas;
    };
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
  };

  it("★ en su límite cabe MÁS que la plantilla a medida de antes (sin modos)", async () => {
    const actual = getTemplate("ats-clasica");
    const antes = await plantillaEnElLimite(data, actual, false);
    const ahora = await plantillaEnElLimite(data, actual, true);
    const rAntes = await rolesQueCaben(antes, 2);
    const rAhora = await rolesQueCaben(ahora, 2);
    console.log(`[capacidad] roles extra en 2 páginas · límite de antes ${rAntes} · con modos ${rAhora}`);
    expect(rAhora).toBeGreaterThan(rAntes);
    // Y el límite nuevo sigue dentro de lo ATS.
    const d = { ...conEmpleos(rAhora), templateId: ahora.id };
    const buf = await render(d);
    expect(await pasaRoundTrip(d, buf)).toBeNull();
    expect(await p90DeLinea(buf)).toBeLessThanOrEqual(LIMITES_MEDIDA.p90Max);
  }, 600000);

  it("si los modos bastan, no toca las métricas (t = 0, cuerpo y márgenes de la base)", async () => {
    const tpl = getTemplate("ats-clasica");
    // El menor contenido que desborda 1 página con la base.
    let d: ResumeData | null = null;
    for (const k of [0, 1, 2]) {
      const x = { ...conEmpleos(k), templateId: tpl.id };
      x.projects = [];
      const pags = (await medirPdf(await render(x), resolveMetrics(tpl.metrics))).porPagina.length;
      if (pags > 1) {
        d = x;
        break;
      }
    }
    expect(d, "ningún tamaño desborda 1 página").not.toBeNull();
    const r = await buscarPlantillaMedida(d!, tpl, 1);
    if (r.ok && r.params.modos?.length && r.params.t === 0) {
      expect(r.params.cuerpo).toBe(tpl.metrics.bodySize);
      expect(r.comprobaciones!.roundTrip).toBe(true);
    } else {
      // Si los modos no alcanzaron, la búsqueda los lleva TODOS puestos al pasar a métricas.
      expect(normalizarModos(r.params.modos)).toEqual(modosUtiles(tpl));
      expect(r.params.t).toBeGreaterThan(0);
      expect(r.params.t).toBeLessThanOrEqual(1);
    }
    expect(r.renders).toBeLessThanOrEqual(3 + Math.ceil(Math.log2(modosUtiles(tpl).length + ESCALONES)) + 1);
  }, 300000);
});
