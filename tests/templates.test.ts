import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { contrastRatio, meetsAA, parseHex, ratioText } from "../src/lib/cv/contrast";
import { toPlainText, type ResumeData } from "../src/lib/cv/resume";
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
  tagsOf,
  templateCount,
  templatesByTags,
  TEMPLATE_TAGS,
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

/** El mismo fixture del round-trip: aquí se usa sin renderizar PDF (solo el rayos-X). */
const datos = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/lib/cv/fixtures/datos-ejemplo.json"),
    "utf8",
  ),
) as ResumeData;

/** Cuánto color tiene un hex (0 = gris perfecto). Distancia entre canales. */
function croma(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

describe("catálogo de plantillas · qué hay dentro", () => {
  it("1 · está cargado y la de por defecto existe, es ATS y es de una columna", () => {
    expect(templateCount()).toBeGreaterThanOrEqual(33);
    const def = getTemplate();
    expect(def.id).toBe(DEFAULT_TEMPLATE_ID);
    expect(def.gama).toBe("ats");
    expect(def.layout).toEqual({ columns: 1, photo: false, sidebar: false });
  });

  it("2 · treinta de gama ATS con carácter propio, más tres o más visuales", () => {
    const ids = TODAS.map((t) => t.id);
    for (const id of ["ats-clasica", "ats-editorial", "ats-instrumento", "ats-compacta"]) {
      expect(ids, `falta la plantilla ${id}`).toContain(id);
    }
    expect(ATS.length).toBeGreaterThanOrEqual(30);
    expect(VISUAL.length).toBeGreaterThanOrEqual(3);
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

  it("5 · gama ATS: UNA columna y sin barra lateral — sin excepciones", () => {
    for (const t of ATS) {
      expect(t.layout.columns, `${t.id}: la gama ATS es de una columna`).toBe(1);
      expect(t.layout.sidebar, `${t.id}: la gama ATS no lleva barra lateral`).toBe(false);
    }
  });

  /**
   * LA FOTO, con dos candados en vez de una prohibición.
   *
   * Antes esto decía "la gama ATS no reserva hueco de foto", y era una regla de
   * brocha gorda: lo que rompe el parseo no es una imagen, es una imagen que
   * convierte la cabecera en dos columnas y fragmenta el contacto. Una foto en la
   * esquina superior derecha, emitida DESPUÉS del texto que la acompaña, no toca el
   * orden de lectura — y eso no se argumenta, se comprueba: el round-trip
   * parametrizado renderiza cada plantilla ATS y exige su texto plano en orden, y
   * hay un bloque que lo repite con la foto puesta de verdad.
   *
   * Lo que sí se exige aquí es lo que no puede comprobar un PDF: que la foto sea una
   * ELECCIÓN y no una imposición. Cada plantilla con hueco tiene su gemela sin él, y
   * la gemela no deja un vacío donde iba la imagen: recompone la cabecera.
   */
  it("5b · toda plantilla ATS con hueco de foto tiene su GEMELA sin foto, y al revés", () => {
    const ids = new Set(ATS.map((t) => t.id));
    const conFoto = ATS.filter((t) => t.layout.photo);
    expect(conFoto.length, "no hay ni una plantilla con hueco de foto").toBeGreaterThanOrEqual(4);
    for (const t of conFoto) {
      expect(t.id, `${t.id}: una plantilla con foto se nombra con el sufijo -foto`).toMatch(/-foto$/);
      const gemela = t.id.replace(/-foto$/, "");
      expect(ids, `${t.id} no tiene gemela sin foto (falta ${gemela})`).toContain(gemela);
      const g = getTemplate(gemela);
      expect(g.layout.photo, `${gemela} debería ser la versión SIN foto`).toBe(false);
      // La gemela COMPENSA el hueco: no puede limitarse a borrar la imagen y dejar
      // media cabecera vacía. Tiene que recomponerla — repartiendo el contacto a lo
      // ancho, alineándolo al otro lado o cerrando la cabecera con un filete.
      const [a, b] = [resolveMetrics(t.metrics), resolveMetrics(g.metrics)];
      const compensa =
        a.contactStyle !== b.contactStyle || a.contactAlign !== b.contactAlign || a.nameRule !== b.nameRule;
      expect(compensa, `${gemela}: quita la foto y no recompone la cabecera (hueco evidente)`).toBe(true);
    }
    for (const t of ATS) {
      if (t.id.endsWith("-foto")) expect(t.layout.photo, `${t.id} se llama -foto y no reserva hueco`).toBe(true);
    }
  });

  it("5c · la foto CIRCULAR no es un eje de la gama ATS (ni la foto manda la maqueta)", () => {
    for (const t of ATS) {
      const m = resolveMetrics(t.metrics);
      expect(m.photoShape, `${t.id}: la foto circular se queda en la gama visual`).not.toBe("circle");
      // Y solo hay una posición posible: junto al nombre, arriba a la derecha.
      expect(["none", "header-right"]).toContain(m.photoSlot);
    }
  });

  it("6 · gama visual: lleva warning explicando el motivo, y la ATS no lo necesita", () => {
    for (const t of VISUAL) {
      expect(t.warning?.trim().length ?? 0, `${t.id} sin aviso`).toBeGreaterThan(30);
      expect(t.warning!.toLowerCase()).toContain("ats");
    }
    for (const t of ATS) expect(t.warning).toBeUndefined();
  });

  /**
   * EL TEST QUE JUSTIFICA EL NÚMERO. Treinta plantillas solo valen algo si son
   * treinta documentos; si fueran el mismo CV pintado de otro color, el catálogo
   * sería peor que no tener catálogo (parálisis de elección a cambio de nada).
   *
   * La huella incluye los EJES DE COMPOSICIÓN, no solo fuente y color: dos plantillas
   * con la misma pareja tipográfica y la misma paleta siguen siendo distintas si una
   * numera las secciones, mete las fechas en línea propia y pone la formación
   * primero. Y al revés: cambiar solo el acento NO cuenta como una plantilla nueva,
   * porque el acento ya es un selector aparte (resolveTemplate lo intercambia).
   */
  it("7 · las plantillas ATS no son clones: cada una difiere en ≥4 rasgos de diseño", () => {
    const huella = (t: (typeof ATS)[number]) => {
      const m = resolveMetrics(t.metrics);
      return [
        t.typography.id, t.palette.id,
        // ritmo y proporción
        m.nameSize, m.bodySize, m.bodyLeading, m.sectionGap, m.entryGap, m.pageMarginV, m.pageMarginH,
        // tratamiento del rótulo
        m.upperHeadings, m.headingSize, m.headingNumbered,
        `${m.headingRule}/${m.headingRuleStyle}/${m.headingRulePosition}`,
        // composición
        m.nameCase, m.nameAlign, m.nameRule, m.headerInline, m.contactStyle, m.contactLabels, m.contactAlign,
        m.dateStyle, m.bulletMarker, m.skillStyle, m.sectionOrder.join(">"),
        // esqueleto y hueco de foto
        `${m.skeleton}/${m.hangingWidth}`, m.photoSlot, m.headingBand,
        // uso del acento
        `${m.accentName}/${m.accentHeadings}`,
      ];
    };
    for (let i = 0; i < ATS.length; i++) {
      for (let j = i + 1; j < ATS.length; j++) {
        const [a, b] = [huella(ATS[i]!), huella(ATS[j]!)];
        const distintos = a.filter((v, k) => v !== b[k]).length;
        expect(distintos, `${ATS[i]!.id} y ${ATS[j]!.id} se parecen demasiado`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("7b · la variedad no sale solo de la paleta: hay tantos DOCUMENTOS como plantillas", () => {
    // El riesgo real de un catálogo grande: N paletas × M tipografías presentadas
    // como N×M plantillas. Aquí se exige que, IGNORANDO paleta y tipografía, sigan
    // quedando muchas composiciones distintas — o sea, que el catálogo no sea una
    // tabla de multiplicar disfrazada.
    const composicion = (t: (typeof ATS)[number]) => {
      const m = resolveMetrics(t.metrics);
      return JSON.stringify([
        m.bodySize, m.bodyLeading, m.sectionGap, m.entryGap, m.pageMarginV, m.pageMarginH,
        m.upperHeadings, m.headingNumbered, m.headingRule, m.headingRuleStyle, m.headingRulePosition,
        m.headingBand, m.nameCase, m.nameAlign, m.nameRule, m.headerInline,
        m.contactStyle, m.contactLabels, m.contactAlign,
        m.dateStyle, m.bulletMarker, m.skillStyle, m.sectionOrder.join(">"),
        m.skeleton, m.hangingWidth, m.photoSlot,
        m.accentName, m.accentHeadings,
      ]);
    };
    const distintas = new Set(ATS.map(composicion));
    expect(distintas.size, "hay composiciones repetidas: son la misma plantilla con otro color").toBe(ATS.length);
  });

  it("7c · cada eje de composición se USA de verdad (un eje que nadie usa no existe)", () => {
    // Añadir campos al contrato es gratis; que el catálogo los ejercite, no. Si un eje
    // no aparece en ninguna plantilla, es código muerto con aire de funcionalidad.
    const ms = TODAS.map((t) => resolveMetrics(t.metrics));
    const usados = <T,>(f: (m: (typeof ms)[number]) => T) => new Set(ms.map(f));
    expect(usados((m) => m.sectionOrder.join(">")).size, "todas las plantillas leen en el mismo orden").toBeGreaterThanOrEqual(4);
    expect(usados((m) => m.bulletMarker), "solo se usa un marcador de viñeta").toEqual(
      new Set(["dot", "dash", "emdash", "none"]),
    );
    expect(usados((m) => m.contactStyle), "el contacto se reparte de una sola manera").toEqual(
      new Set(["inline", "split", "stacked"]),
    );
    expect(usados((m) => m.dateStyle), "las fechas caen siempre en el mismo sitio").toEqual(
      new Set(["right", "inline", "own-line", "hanging"]),
    );
    expect(usados((m) => m.skeleton), "solo se usa un esqueleto").toEqual(new Set(["flat", "hanging"]));
    expect(usados((m) => m.contactAlign).size, "el contacto se alinea siempre igual").toBeGreaterThanOrEqual(3);
    // La columna colgante no puede existir en un solo ancho: el ancho ES la medida.
    const anchos = new Set(ms.filter((m) => m.skeleton === "hanging").map((m) => m.hangingWidth));
    expect(anchos.size, "todas las columnas colgantes miden lo mismo").toBeGreaterThanOrEqual(3);
    expect(usados((m) => m.skillStyle), "las habilidades se agrupan de una sola manera").toEqual(
      new Set(["grouped", "inline", "paired"]),
    );
    expect(usados((m) => m.headingRuleStyle), "el filete es siempre el mismo").toEqual(
      new Set(["full", "partial", "double"]),
    );
    for (const [eje, f] of [
      ["nameCase", (m: (typeof ms)[number]) => m.nameCase === "upper"],
      ["nameAlign", (m: (typeof ms)[number]) => m.nameAlign === "center"],
      ["nameRule", (m: (typeof ms)[number]) => m.nameRule],
      ["headerInline", (m: (typeof ms)[number]) => m.headerInline],
      ["nameTracking", (m: (typeof ms)[number]) => m.nameTracking > 0],
      ["headingTracking", (m: (typeof ms)[number]) => m.headingTracking > 0],
      ["headingNumbered", (m: (typeof ms)[number]) => m.headingNumbered],
      ["headingRulePosition:above", (m: (typeof ms)[number]) => m.headingRulePosition === "above"],
      ["headingLabel:false", (m: (typeof ms)[number]) => !m.headingLabel],
      ["contactLabels:false", (m: (typeof ms)[number]) => !m.contactLabels],
      ["upperHeadings:false", (m: (typeof ms)[number]) => !m.upperHeadings],
      ["sin acento", (m: (typeof ms)[number]) => !m.accentName && !m.accentHeadings],
      ["headingBand", (m: (typeof ms)[number]) => m.headingBand],
      ["photoSlot", (m: (typeof ms)[number]) => m.photoSlot !== "none"],
      ["photoBorder", (m: (typeof ms)[number]) => m.photoBorder],
      ["photoShape:rounded", (m: (typeof ms)[number]) => m.photoShape === "rounded"],
      ["contactAlign:right", (m: (typeof ms)[number]) => m.contactAlign === "right"],
      ["contactAlign:center", (m: (typeof ms)[number]) => m.contactAlign === "center"],
    ] as const) {
      expect(ms.some(f), `el eje "${eje}" no lo usa ninguna plantilla`).toBe(true);
    }
  });

  it("7d · todas llevan `tags` del vocabulario cerrado: tono, densidad y afinidad", () => {
    // El selector filtra por estas etiquetas. Una plantilla sin etiquetar no aparece
    // en ningún filtro: existe en el catálogo y no existe para el usuario.
    const TONO = ["clasica", "editorial", "tecnica", "minimal", "moderna"];
    const DENSIDAD = ["1pagina", "2paginas"];
    const AFINIDAD = ["ingenieria", "datos-ia", "academia", "general", "primer-empleo"];
    for (const t of TODAS) {
      const tags = tagsOf(t);
      expect(tags.length, `${t.id} sin etiquetas: el selector no la encontrará nunca`).toBeGreaterThan(0);
      for (const tag of tags) expect(TEMPLATE_TAGS, `${t.id}: etiqueta fuera del vocabulario "${tag}"`).toContain(tag);
      expect(tags.filter((x) => TONO.includes(x)).length, `${t.id}: debe declarar UN tono`).toBe(1);
      expect(tags.filter((x) => DENSIDAD.includes(x)).length, `${t.id}: debe declarar UNA densidad`).toBe(1);
      expect(tags.filter((x) => AFINIDAD.includes(x)).length, `${t.id}: debe declarar UNA afinidad`).toBe(1);
    }
    // Y ninguna etiqueta del vocabulario se queda sin plantillas: un filtro que
    // siempre devuelve vacío es peor que no ofrecer el filtro.
    for (const tag of TEMPLATE_TAGS) {
      expect(templatesByTags([tag]).length, `la etiqueta "${tag}" no tiene ni una plantilla`).toBeGreaterThan(0);
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

/**
 * EL NÚCLEO NO NEGOCIABLE DE LA GAMA ATS.
 *
 * Todo lo demás de este archivo comprueba que el catálogo tiene VARIEDAD. Este
 * bloque comprueba lo contrario: que por debajo de la variedad hay un suelo que
 * ninguna plantilla puede perforar, por bonita que quede. Es la diferencia entre un
 * sistema de diseño y una colección de gustos.
 *
 * Los números no son opinión: 45-75 caracteres es el óptimo de lectura y 80 el
 * techo accesible (la medida real la mide tests/medida-linea.test.ts sobre el PDF);
 * 10-11 pt de cuerpo, 1,15-1,3 de interlineado y 20 mm de margen son la práctica
 * tipográfica de un documento impreso que además se lee en pantalla.
 */
describe("catálogo de plantillas · el NÚCLEO no negociable de la gama ATS", () => {
  for (const t of ATS) {
    const m = resolveMetrics(t.metrics);
    const ty = resolveTypography(t.typography);

    describe(`${t.id} · ${t.name}`, () => {
      it("a · una columna, contacto en el cuerpo, sin barra lateral", () => {
        expect(t.layout.columns).toBe(1);
        expect(t.layout.sidebar).toBe(false);
        // Rótulos ESTÁNDAR: el texto del rótulo sale de los datos del usuario
        // (data.headings), nunca de la plantilla. Una plantilla que pudiera
        // renombrar "Experiencia" a "Trayectoria" rompería la segmentación del
        // parser, así que el contrato simplemente no le da esa capacidad: lo único
        // que puede hacer con el rótulo es numerarlo o quitarlo.
        expect(m.headingLabel, `${t.id}: la gama ATS SIEMPRE rotula sus secciones`).toBe(true);
      });

      it("b · cuerpo 10-11 pt, interlineado 1,15-1,3 y 12-16 pt entre secciones", () => {
        expect(m.bodySize, `cuerpo de ${m.bodySize} pt`).toBeGreaterThanOrEqual(10);
        expect(m.bodySize, `cuerpo de ${m.bodySize} pt`).toBeLessThanOrEqual(11);
        expect(m.bodyLeading, `interlineado ${m.bodyLeading}`).toBeGreaterThanOrEqual(1.15);
        expect(m.bodyLeading, `interlineado ${m.bodyLeading}`).toBeLessThanOrEqual(1.3);
        expect(m.sectionGap, `${m.sectionGap} pt entre secciones`).toBeGreaterThanOrEqual(12);
        expect(m.sectionGap, `${m.sectionGap} pt entre secciones`).toBeLessThanOrEqual(16);
      });

      it("c · márgenes de 20 mm o más, en las dos direcciones", () => {
        for (const [lado, v] of [["vertical", m.pageMarginV], ["horizontal", m.pageMarginH]] as const) {
          expect(v, `${t.id}: margen ${lado} sin unidad mm`).toMatch(/^\d+(\.\d+)?mm$/);
          expect(parseFloat(v), `${t.id}: margen ${lado} de ${v}`).toBeGreaterThanOrEqual(20);
        }
      });

      it("d · máximo DOS familias tipográficas", () => {
        const familias = new Set([ty.display, ty.body, ty.mono].filter(Boolean));
        expect(familias.size, `${t.id} usa ${[...familias].join(" + ")}`).toBeLessThanOrEqual(2);
      });

      it("e · sin monoespaciada: ni de titular, ni en el cuerpo, ni en las cifras", () => {
        // El fundamento es probable, no seguro (la encuesta que hunde a las mono en
        // el ranking la pagó un marketplace de tipografías y mide preferencia
        // declarada, no conducta). Pero el coste es asimétrico: si acierta, la mono
        // penaliza; si falla, no usarla no cuesta nada. Sigue en el catálogo como
        // pareja elegible — lo que no hace es venir puesta.
        for (const fam of [ty.display, ty.body, ty.headingFace, ty.figuresFace]) {
          expect(fam, `${t.id}: monoespaciada por defecto en la gama ATS`).not.toMatch(/Mono/);
        }
      });

      it("f · un solo acento, y solo en los rótulos y los filetes", () => {
        expect(m.accentName, `${t.id}: el nombre no va en el acento`).toBe(false);
      });
    });
  }

  it("z · la NUMERACIÓN de secciones es minoritaria (no hay evidencia que la sostenga)", () => {
    // Cero evidencia a favor y ruido añadido al parser. Se queda como opción de un
    // par de plantillas; el día que sea el eje protagonista del catálogo, falla.
    const numeradas = ATS.filter((t) => resolveMetrics(t.metrics).headingNumbered);
    expect(numeradas.length, "nadie numera: el eje sobra del contrato").toBeGreaterThanOrEqual(1);
    expect(numeradas.length / ATS.length, "la numeración se ha vuelto el eje protagonista").toBeLessThanOrEqual(0.15);
  });

  it("z2 · la MONOESPACIADA sigue existiendo como opción del catálogo, sin venir puesta", () => {
    // "Minoritaria" no es "borrada": quien la quiera la elige desde el selector de
    // parejas (resolveTemplate la intercambia sobre cualquier plantilla).
    const mono = listTypographies().filter((ty) => [ty.display, ty.body, ty.mono].some((f) => f?.includes("Mono")));
    expect(mono.length, "la mono desapareció del catálogo: eso es censura, no criterio").toBeGreaterThanOrEqual(1);
    expect(mono.length / listTypographies().length, "la mono ya no es minoritaria").toBeLessThanOrEqual(0.35);
  });

  it("z3 · sin emojis en ningún texto que llegue al documento o al selector", () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    for (const t of TODAS) {
      expect(emoji.test(t.name), `${t.id}: emoji en el nombre`).toBe(false);
      expect(emoji.test(t.description), `${t.id}: emoji en la descripción`).toBe(false);
      expect(emoji.test(t.warning ?? ""), `${t.id}: emoji en el aviso`).toBe(false);
    }
  });

  it("z4 · el rótulo sobre BANDA tintada sigue pasando AA sobre su propio fondo", () => {
    // Una banda de color detrás del rótulo es el modo más fácil de perder contraste
    // sin enterarse: el ratio deja de medirse contra el papel y pasa a medirse contra
    // la banda. Por eso el render pone el rótulo con banda en TINTA, no en el acento.
    for (const t of TODAS) {
      if (!resolveMetrics(t.metrics).headingBand) continue;
      const r = contrastRatio(t.palette.ink, t.palette.hair);
      expect(meetsAA(r), `${t.id}: rótulo sobre banda en ${ratioText(r)}`).toBe(true);
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

  it("1 · son un puñado de parejas ya emparejadas, no un selector de 200 fuentes", () => {
    // El tope existe a propósito: con TRES familias en el repo, más de media docena
    // de "parejas" serían la misma combinación con otro nombre. La variedad del
    // catálogo sale de los ejes de composición, no de inventar parejas.
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

  /** Los pesos que existen de verdad en src/lib/fonts/, familia por familia. */
  const PESOS: Record<string, number[]> = {
    Geist: [400, 500, 600, 700],
    "Geist Mono": [400, 500],
    "Playfair Display": [500, 600],
  };

  it("3 · pesos que existen: Playfair 500/600, Geist Mono 400/500, Geist hasta 700", () => {
    for (const t of parejas) {
      const { displayWeight, display } = resolveTypography(t);
      expect(PESOS[display], `pareja ${t.id}: ${display} no tiene el peso ${displayWeight}`).toContain(displayWeight);
    }
  });

  it("3b · ninguna PLANTILLA pide un peso de encabezado que su familia no tenga", () => {
    // @react-pdf no falla si el peso no existe: elige el más cercano en silencio. El
    // documento sale entonces con una tipografía que nadie diseñó, y no hay manera de
    // enterarse mirando el PDF. Este test es la única alarma posible.
    for (const t of listTemplates()) {
      const { headingFace } = resolveTypography(t.typography);
      const { headingWeight } = resolveMetrics(t.metrics);
      expect(
        PESOS[headingFace],
        `${t.id}: rotula en ${headingFace} con peso ${headingWeight}, que no existe en el repo`,
      ).toContain(headingWeight);
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

  /**
   * EL CANDADO DE LAS MAYÚSCULAS, resuelto en vez de esquivado.
   *
   * Antes esto decía: "la gama ATS rotula SIEMPRE en mayúsculas". Era verdad por una
   * razón que no tenía nada que ver con el diseño — toPlainText escribía los rótulos
   * en mayúsculas SIEMPRE, así que una plantilla en caja mixta habría hecho que el
   * documento y su "cómo lo lee el ATS" dejaran de coincidir. La caja de los rótulos
   * estaba clavada por una limitación del rayos-X, no por una decisión tipográfica.
   *
   * Ahora toPlainText aplica la MISMA caja que el documento (upperHeadings), así que
   * la caja mixta es un eje legítimo. Lo que se comprueba aquí ya no es "todas en
   * mayúsculas" sino lo único que de verdad importaba: que documento y rayos-X
   * coincidan SIEMPRE, sea cual sea la caja. Es un candado más fuerte, no más flojo
   * — y el golden sigue byte a byte donde estaba, porque la clásica no se ha movido.
   */
  it("z · documento y rayos-X coinciden en la CAJA del rótulo, plantilla a plantilla", () => {
    for (const t of TODAS) {
      const m = resolveMetrics(t.metrics);
      if (!m.headingLabel) continue; // esta no rotula: no hay caja que comparar
      const xray = toPlainText({ ...datos, templateId: t.id }, { locale: "es", onePage: false });
      const enPlano = t.metrics.upperHeadings ? "EXPERIENCIA" : "Experiencia";
      expect(xray, `${t.id}: el rayos-X no rotula en la caja del documento`).toContain(enPlano);
    }
  });

  it("z2 · la clásica sigue en mayúsculas, y la caja mixta existe en el catálogo", () => {
    // Las dos mitades del candado: lo de siempre no se ha movido Y el eje es real.
    expect(resolveMetrics(getTemplate("ats-clasica").metrics).upperHeadings).toBe(true);
    expect(TODAS.some((t) => !resolveMetrics(t.metrics).upperHeadings)).toBe(true);
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

  it("6 · resolveMetrics rellena los defaults, y son los del NÚCLEO de legibilidad", () => {
    // Los valores por defecto no son "lo que había": son el mínimo del núcleo, para
    // que una plantilla que solo declare lo obligatorio nazca ya conforme en vez de
    // nacer fuera y tener que acordarse de arreglarlo.
    const m = resolveMetrics({
      nameSize: 21, bodySize: 10.5, bodyLeading: 1.25, sectionGap: 14,
      upperHeadings: true, headingRule: true,
    });
    expect(m.pageMarginV).toBe("20mm");
    expect(m.pageMarginH).toBe("22mm");
    expect(m.headingSize).toBe(10.5);
    expect(m.headingWeight).toBe(700);
    expect(m.entryTitleSize).toBe(11);
    expect(m.bulletIndent).toBe(11);
    expect(m.bulletHang).toBe(7.5);
    // El acento vive en rótulos y filetes; el nombre se sostiene por tamaño y peso.
    expect(m.accentName).toBe(false);
    expect(m.accentHeadings).toBe(true);
    // El esqueleto por defecto es el PLANO: la columna colgante es un eje opcional,
    // no un cambio de comportamiento por la puerta de atrás.
    expect(m.skeleton).toBe("flat");
    expect(m.dateStyle).toBe("right");
    expect(m.photoSlot).toBe("none");
    expect(m.contactAlign).toBe("inherit");
    expect(m.headingBand).toBe(false);

    // …y la clásica del catálogo es EXACTAMENTE esos defaults más UNA decisión: el
    // margen horizontal que le baja la medida de 96 caracteres a 83. Es la plantilla
    // que menos decisiones toma del catálogo, y la única que toma es la de la medida.
    //
    // No cuelga la columna, que sería el arreglo más elegante, por un motivo que no
    // es de diseño: es la plantilla POR DEFECTO y su texto plano está atado byte a
    // byte al golden, que escribe las fechas pegadas al cargo. La columna colgante
    // las emite aparte —tiene que hacerlo, es el orden en que se leen— así que
    // adoptarla aquí habría obligado a regenerar el golden.
    expect(resolveMetrics(getTemplate("ats-clasica").metrics)).toEqual({ ...m, pageMarginH: "32mm" });
  });

  it("7 · el esqueleto colgante IMPONE dónde van las fechas (una sola fuente de verdad)", () => {
    // Si `dateStyle` se pudiera declarar por libre junto a `skeleton: "hanging"`, el
    // PDF y el texto plano podrían deducir cosas distintas y el round-trip compararía
    // dos documentos. Aquí se fija que el esqueleto gana siempre.
    const colgante = resolveMetrics({
      nameSize: 21, bodySize: 10.5, bodyLeading: 1.25, sectionGap: 14,
      upperHeadings: true, headingRule: true,
      skeleton: "hanging", dateStyle: "inline", // se declara y se ignora, a propósito
    });
    expect(colgante.dateStyle).toBe("hanging");
    for (const t of TODAS) {
      const m = resolveMetrics(t.metrics);
      expect(m.skeleton === "hanging", `${t.id}: esqueleto y fechas descuadrados`).toBe(m.dateStyle === "hanging");
    }
  });
});
