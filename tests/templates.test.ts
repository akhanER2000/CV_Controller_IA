import { describe, it, expect } from "vitest";
import { contrastRatio, meetsAA, parseHex, ratioText } from "../src/lib/cv/contrast";
import {
  BODY_WEIGHT,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  listPalettes,
  listTemplates,
  listTypographies,
  paperOf,
  resolveMetrics,
  resolveTemplate,
  resolveTypography,
  templateCount,
} from "../src/lib/cv/templates";

/**
 * EL CATÁLOGO, AUDITADO. Este archivo es el que impide que "sistema de plantillas"
 * signifique "cuatro CSS distintos y una promesa". Comprueba tres cosas que un
 * catálogo de diseño puede prometer y luego no cumplir:
 *
 *   1. CONTRASTE — ninguna paleta entra si su acento no pasa AA sobre el papel.
 *   2. UN SOLO ACENTO — el resto de tintas son neutras: el documento tiene UN color.
 *   3. BLANCO Y NEGRO — la jerarquía la sostienen el peso, el tamaño y el filete.
 *      Si al imprimir en gris se pierde una señal, la señal era solo-color y sobra.
 *
 * (El cuarto candado —que cada plantilla ATS sobreviva al parseo— vive donde debe:
 * en tests/ats-roundtrip.test.ts, renderizando PDF de verdad.)
 */

const TODAS = listTemplates();
const ATS = TODAS.filter((t) => t.gama === "ats");
const VISUAL = TODAS.filter((t) => t.gama === "visual");

/** Cuánto color tiene un hex (0 = gris perfecto). Distancia entre canales. */
function croma(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

describe("catálogo de plantillas · qué hay dentro", () => {
  it("1 · está cargado y la de por defecto existe, es ATS y es de una columna", () => {
    expect(templateCount()).toBeGreaterThanOrEqual(5);
    const def = getTemplate();
    expect(def.id).toBe(DEFAULT_TEMPLATE_ID);
    expect(def.gama).toBe("ats");
    expect(def.layout).toEqual({ columns: 1, photo: false, sidebar: false });
  });

  it("2 · las cuatro de gama ATS con carácter propio, más la visual", () => {
    const ids = TODAS.map((t) => t.id);
    for (const id of ["ats-clasica", "ats-editorial", "ats-instrumento", "ats-compacta"]) {
      expect(ids, `falta la plantilla ${id}`).toContain(id);
    }
    expect(ATS.length).toBeGreaterThanOrEqual(4);
    expect(VISUAL.length).toBeGreaterThanOrEqual(1);
  });

  it("3 · ids únicos, nombre y descripción de verdad en todas", () => {
    expect(new Set(TODAS.map((t) => t.id)).size).toBe(TODAS.length);
    for (const t of TODAS) {
      expect(t.name.trim().length, `${t.id} sin nombre`).toBeGreaterThan(0);
      expect(t.description.trim().length, `${t.id}: descripción que no describe`).toBeGreaterThan(20);
    }
  });

  it("4 · listTemplates devuelve la gama ATS PRIMERO (es la que el producto recomienda)", () => {
    const primeraVisual = TODAS.findIndex((t) => t.gama === "visual");
    const ultimaAts = TODAS.map((t) => t.gama).lastIndexOf("ats");
    expect(primeraVisual).toBeGreaterThan(ultimaAts);
  });

  it("5 · gama ATS: UNA columna, sin barra lateral y sin hueco de foto — sin excepciones", () => {
    for (const t of ATS) {
      expect(t.layout.columns, `${t.id}: la gama ATS es de una columna`).toBe(1);
      expect(t.layout.sidebar, `${t.id}: la gama ATS no lleva barra lateral`).toBe(false);
      expect(t.layout.photo, `${t.id}: la gama ATS no reserva hueco de foto`).toBe(false);
    }
  });

  it("6 · gama visual: lleva warning explicando el motivo, y la ATS no lo necesita", () => {
    for (const t of VISUAL) {
      expect(t.warning?.trim().length ?? 0, `${t.id} sin aviso`).toBeGreaterThan(30);
      expect(t.warning!.toLowerCase()).toContain("ats");
    }
    for (const t of ATS) expect(t.warning).toBeUndefined();
  });

  it("7 · las plantillas ATS no son clones: cada una difiere en ≥3 rasgos de diseño", () => {
    const huella = (t: (typeof ATS)[number]) => {
      const m = resolveMetrics(t.metrics);
      return [
        t.typography.id, t.palette.id, m.nameSize, m.bodySize, m.bodyLeading,
        m.sectionGap, m.headingRule, m.headingSize, m.entryGap, m.pageMarginV,
      ];
    };
    for (let i = 0; i < ATS.length; i++) {
      for (let j = i + 1; j < ATS.length; j++) {
        const [a, b] = [huella(ATS[i]!), huella(ATS[j]!)];
        const distintos = a.filter((v, k) => v !== b[k]).length;
        expect(distintos, `${ATS[i]!.id} y ${ATS[j]!.id} se parecen demasiado`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("8 · los nombres significan algo: Compacta es la más densa, Editorial la más aireada", () => {
    const alto = (id: string) => {
      const m = resolveMetrics(getTemplate(id).metrics);
      return m.bodySize * m.bodyLeading; // alto de línea del cuerpo
    };
    const gap = (id: string) => resolveMetrics(getTemplate(id).metrics).sectionGap;
    const otras = ATS.filter((t) => t.id !== "ats-compacta").map((t) => t.id);
    for (const id of otras) {
      expect(alto("ats-compacta"), `Compacta no es más densa que ${id}`).toBeLessThan(alto(id));
      expect(gap("ats-compacta"), `Compacta respira más que ${id}`).toBeLessThan(gap(id));
    }
    for (const id of ATS.filter((t) => t.id !== "ats-editorial").map((t) => t.id)) {
      expect(gap("ats-editorial"), `Editorial no tiene más aire que ${id}`).toBeGreaterThan(gap(id));
    }
  });
});

describe("catálogo de plantillas · contraste verificado (WCAG AA)", () => {
  const paletas = listPalettes();

  it("1 · hay al menos cuatro paletas y todas declaran papel blanco (el PDF no pinta fondo)", () => {
    expect(paletas.length).toBeGreaterThanOrEqual(4);
    expect(new Set(paletas.map((p) => p.id)).size).toBe(paletas.length);
    for (const p of paletas) {
      // Si algún día el render pinta un fondo, este test hay que cambiarlo A LA VEZ:
      // declarar un papel de color que no se imprime sería falsear los ratios.
      expect(paperOf(p), `${p.id}: papel que el documento no imprime`).toBe("#FFFFFF");
    }
  });

  it("2 · el ACENTO de cada paleta pasa AA (4,5:1) sobre el papel — sin excepciones", () => {
    for (const p of paletas) {
      const r = contrastRatio(p.accent, paperOf(p));
      expect(meetsAA(r), `paleta ${p.id}: acento ${p.accent} solo llega a ${ratioText(r)}`).toBe(true);
    }
  });

  it("3 · la TINTA del cuerpo llega a AAA (7:1) y el texto apagado sigue pasando AA", () => {
    for (const p of paletas) {
      const rInk = contrastRatio(p.ink, paperOf(p));
      expect(rInk, `paleta ${p.id}: tinta ${p.ink} en ${ratioText(rInk)}`).toBeGreaterThanOrEqual(7);
      const rMut = contrastRatio(p.muted, paperOf(p));
      expect(meetsAA(rMut), `paleta ${p.id}: apagado ${p.muted} en ${ratioText(rMut)}`).toBe(true);
    }
  });

  it("4 · el FILETE se ve en papel, y se le exige eso y no más (no es texto ni un control)", () => {
    // WCAG pide 3:1 a los componentes de interfaz; un filete de sección en un
    // documento impreso no lo es, y forzarlo a 3:1 obligaría a un gris sucio que
    // compite con el texto. Se le exige ser VISIBLE, y que la jerarquía no dependa
    // de él (eso lo comprueba el bloque de blanco y negro).
    for (const p of paletas) {
      const r = contrastRatio(p.hair, paperOf(p));
      expect(r, `paleta ${p.id}: filete ${p.hair} invisible (${ratioText(r)})`).toBeGreaterThan(1.2);
      expect(r, `paleta ${p.id}: filete ${p.hair} tan oscuro que compite con el texto`).toBeLessThan(4.5);
    }
  });

  it("5 · UN SOLO ACENTO: tinta, apagado y filete son neutros — el color es uno", () => {
    for (const p of paletas) {
      for (const [campo, hex] of [["ink", p.ink], ["muted", p.muted], ["hair", p.hair]] as const) {
        expect(croma(hex), `paleta ${p.id}: ${campo} ${hex} tiene color propio`).toBeLessThanOrEqual(0.08);
      }
    }
  });

  it("6 · cada plantilla usa exactamente UNA paleta del catálogo (sin colores sueltos)", () => {
    const ids = new Set(paletas.map((p) => p.id));
    for (const t of TODAS) expect(ids, `${t.id} usa una paleta fuera del catálogo`).toContain(t.palette.id);
  });
});

describe("catálogo de plantillas · parejas tipográficas", () => {
  // Lo que hay en src/lib/fonts/ y está registrado en ResumePDF. No se añaden .ttf.
  const FAMILIAS = ["Geist", "Geist Mono", "Playfair Display"];
  const parejas = listTypographies();

  it("1 · son tres o cuatro parejas ya emparejadas, no un selector de 200 fuentes", () => {
    expect(parejas.length).toBeGreaterThanOrEqual(3);
    expect(parejas.length).toBeLessThanOrEqual(6);
    expect(new Set(parejas.map((t) => t.id)).size).toBe(parejas.length);
  });

  it("2 · solo usan familias que existen en el repo y están registradas", () => {
    for (const t of parejas) {
      for (const fam of [t.display, t.body, t.mono].filter(Boolean) as string[]) {
        expect(FAMILIAS, `pareja ${t.id}: familia desconocida "${fam}"`).toContain(fam);
      }
    }
  });

  it("3 · pesos que existen: Playfair solo tiene 500 y 600; Geist llega a 700", () => {
    for (const t of parejas) {
      const { displayWeight } = resolveTypography(t);
      if (t.display === "Playfair Display") {
        expect([500, 600], `pareja ${t.id}: Playfair no tiene el peso ${displayWeight}`).toContain(displayWeight);
      } else {
        expect([400, 500, 600, 700], `pareja ${t.id}: peso ${displayWeight} inexistente`).toContain(displayWeight);
      }
    }
  });

  it("4 · quien pide cifras en mono declara la familia mono (si no, no habría mono)", () => {
    for (const t of parejas) {
      const r = resolveTypography(t);
      if (r.monoFigures) expect(t.mono, `pareja ${t.id}: monoFigures sin familia mono`).toBeTruthy();
      expect(["display", "body"]).toContain(r.headingFamily);
      // La familia que rotula secciones siempre sale resuelta a una familia real.
      expect(FAMILIAS).toContain(r.headingFace);
      expect(FAMILIAS).toContain(r.figuresFace);
    }
  });
});

describe("catálogo de plantillas · impreso en BLANCO Y NEGRO (jerarquía sin color)", () => {
  /**
   * La prueba de fuego: quitar el color. Si al imprimir en gris el lector ya no
   * distingue un encabezado de una línea de cuerpo, la jerarquía era un truco de
   * color. Cada señal informativa del documento tiene que apoyarse en AL MENOS DOS
   * rasgos no cromáticos (tamaño, peso, caja, filete).
   */
  for (const t of TODAS) {
    const m = resolveMetrics(t.metrics);
    const ty = resolveTypography(t.typography);

    describe(`${t.id} · ${t.name}`, () => {
      it("a · el NOMBRE se distingue por tamaño y peso, no por ir en el acento", () => {
        expect(m.nameSize, "el nombre no es claramente mayor que el cuerpo").toBeGreaterThanOrEqual(m.bodySize * 1.4);
        expect(ty.displayWeight, "el nombre no pesa más que el cuerpo").toBeGreaterThan(BODY_WEIGHT);
      });

      it("b · el ENCABEZADO de sección se sostiene con dos señales no cromáticas", () => {
        const senales = [
          m.upperHeadings, // caja
          m.headingWeight > BODY_WEIGHT, // peso
          m.headingSize > m.bodySize, // tamaño
          m.headingRule, // filete
          m.sectionGap >= m.bodySize, // aire por encima
        ].filter(Boolean).length;
        expect(senales, "el encabezado depende demasiado del color").toBeGreaterThanOrEqual(2);
      });

      it("c · el CARGO destaca sobre la viñeta por peso y tamaño", () => {
        expect(m.entryTitleSize).toBeGreaterThanOrEqual(m.bodySize * 0.95);
        expect(m.entryGap, "las entradas no se separan entre sí").toBeGreaterThan(m.bulletGap);
      });

      it("d · las FECHAS no compiten con el cargo (van más pequeñas)", () => {
        expect(m.dateSize).toBeLessThanOrEqual(m.entryTitleSize);
        expect(m.dateGap, "las fechas se pegarían al cargo").toBeGreaterThan(0);
      });

      it("e · si el color desaparece, NINGUNA señal se queda sin respaldo", () => {
        // El caso peligroso: acento en el nombre o en los encabezados. Si además
        // fueran del mismo tamaño y peso que el cuerpo, en gris se perderían.
        if (m.accentName) expect(m.nameSize).toBeGreaterThan(m.bodySize);
        if (m.accentHeadings) {
          expect(m.upperHeadings || m.headingWeight > BODY_WEIGHT).toBe(true);
          expect(m.headingWeight > BODY_WEIGHT || m.headingSize > m.bodySize || m.headingRule).toBe(true);
        }
      });
    });
  }

  it("z · la gama ATS rotula SIEMPRE en mayúsculas (el rayos-X también las imprime)", () => {
    // toPlainText escribe los encabezados en MAYÚSCULAS. Una plantilla que los
    // rotulara en caja mixta haría que el documento y su "cómo lo lee el ATS"
    // dejaran de coincidir, y el round-trip parametrizado se caería con razón.
    for (const t of ATS) expect(resolveMetrics(t.metrics).upperHeadings, `${t.id}`).toBe(true);
  });
});

describe("catálogo de plantillas · resolución (nadie se queda sin CV)", () => {
  it("1 · un id desconocido, vacío o nulo cae en la plantilla por defecto", () => {
    for (const id of [undefined, null, "", "no-existe", "ATS-CLASICA"]) {
      expect(getTemplate(id).id, `id ${JSON.stringify(id)}`).toBe(DEFAULT_TEMPLATE_ID);
    }
  });

  it("2 · resolveTemplate cambia la PALETA sin tocar el resto de la plantilla", () => {
    const base = getTemplate("ats-clasica");
    const r = resolveTemplate({ templateId: "ats-clasica", paletteId: "acero" });
    expect(r.palette.id).toBe("acero");
    expect(r.typography).toEqual(base.typography);
    expect(r.metrics).toEqual(base.metrics);
    expect(r.id).toBe(base.id);
  });

  it("3 · resolveTemplate cambia la PAREJA TIPOGRÁFICA sin tocar la paleta", () => {
    const base = getTemplate("ats-clasica");
    const r = resolveTemplate({ templateId: "ats-clasica", typographyId: "instrumento" });
    expect(r.typography.id).toBe("instrumento");
    expect(r.palette).toEqual(base.palette);
  });

  it("4 · una paleta o pareja desconocida se IGNORA (se conserva la de la plantilla)", () => {
    const base = getTemplate("ats-editorial");
    const r = resolveTemplate({ templateId: "ats-editorial", paletteId: "fucsia", typographyId: "comic" });
    expect(r.palette).toEqual(base.palette);
    expect(r.typography).toEqual(base.typography);
  });

  it("5 · sin argumentos devuelve la de por defecto, no revienta", () => {
    expect(resolveTemplate().id).toBe(DEFAULT_TEMPLATE_ID);
    expect(resolveTemplate({}).id).toBe(DEFAULT_TEMPLATE_ID);
  });

  it("6 · resolveMetrics rellena los defaults del documento clásico", () => {
    // Una plantilla que solo declare lo obligatorio sale como el CV de siempre.
    const m = resolveMetrics({
      nameSize: 22, bodySize: 10, bodyLeading: 1.45, sectionGap: 13,
      upperHeadings: true, headingRule: true,
    });
    expect(m.pageMarginV).toBe("18mm");
    expect(m.pageMarginH).toBe("20mm");
    expect(m.headingSize).toBe(10.5);
    expect(m.headingWeight).toBe(700);
    expect(m.entryTitleSize).toBe(11);
    expect(m.bulletIndent).toBe(11);
    expect(m.bulletHang).toBe(7.5);
    expect(m.accentName).toBe(true);
    expect(m.accentHeadings).toBe(true);
    // …y la clásica del catálogo declara exactamente esos mismos números.
    expect(resolveMetrics(getTemplate("ats-clasica").metrics)).toEqual(m);
  });
});
