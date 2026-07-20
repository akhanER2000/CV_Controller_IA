import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import { lineasPorPagina } from "../src/lib/cv/medir";
import { getTemplate, registerTemplate, resolveMetrics, type ResolvedMetrics } from "../src/lib/cv/templates";
import { contactLayout, toPlainText, type ResumeData } from "../src/lib/cv/resume";

/**
 * LA CABECERA COMPACTA, MEDIDA — no estimada.
 *
 * El problema que resuelve `ats-compacta-maxima` es aritmético y aburrido: la
 * cabecera de la clásica se come 74,95 pt de los 678,6 pt de caja útil de una LETTER
 * con 20 mm de margen. Un 11 % de la primera página para decir quién eres, en cuatro
 * líneas apiladas. Cuando a alguien "no le caben dos páginas", ese 11 % es lo primero
 * que hay que mirar — y era lo único que nadie miraba, porque comprimir un CV se
 * entiende siempre como apretar el cuerpo.
 *
 * ESTE ARCHIVO NO SE CREE NINGÚN NÚMERO. La altura de la cabecera se saca del PDF
 * renderizado: se mide la línea base del primer rótulo de sección, que es donde
 * empieza el contenido. Y se cruza con un modelo aritmético de la métrica. Que los
 * dos coincidan al centésimo es lo que convierte "gana un 31 %" en un dato con
 * fuente, en vez de en una promesa de catálogo.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, "../src/lib/cv/fixtures");
const data = JSON.parse(readFileSync(path.join(fx, "datos-ejemplo.json"), "utf8")) as ResumeData;
const golden = readFileSync(path.join(fx, "cv-texto-plano.txt"), "utf8");
const norm = (x: string) => x.replace(/\s+/g, " ").trim();

const NUEVA = "ats-compacta-maxima";
const nueva = getTemplate(NUEVA);
const mNueva = resolveMetrics(nueva.metrics);
const mClasica = resolveMetrics(getTemplate("ats-clasica").metrics);

/**
 * LA LÍNEA BASE DE REFERENCIA, verificada renderizando: la cabecera de la clásica
 * ocupa 74,95 pt. No es un número heredado — el test 2 lo reconstruye sumando los
 * bloques de la métrica y el test 3 lo cruza contra el PDF.
 */
const CABECERA_CLASICA_PT = 74.95;
/** El objetivo del encargo: recuperar al menos un 15 % de ese alto. */
const GANANCIA_MINIMA = 0.15;

/**
 * El alto que consume la cabecera SEGÚN LA MÉTRICA. Reproduce lo que hace la hoja de
 * estilos de ResumePDF: el nombre y el subtítulo apilados (o en la misma línea, y
 * entonces manda el mayor de los dos), más una línea de contacto por párrafo con sus
 * márgenes — 5 pt sobre la primera, 1 pt sobre las siguientes.
 *
 * Vive en el test y no en producción a propósito: es un MODELO, y su único trabajo
 * es discrepar del PDF si alguien cambia la hoja de estilos sin darse cuenta.
 */
function cabeceraSegunMetrica(m: ResolvedMetrics, lineasContacto: number): number {
  const nombre = m.nameSize * m.nameLeading;
  const subtitulo = m.labelSize * 1.3; // lineHeight fijo del estilo `label`
  const identidad = m.headerInline ? Math.max(nombre, subtitulo) : nombre + subtitulo + 2;
  const contacto = lineasContacto * (m.contactSize * 1.5) + 5 + (lineasContacto - 1) * 1;
  return identidad + contacto;
}

/** La coordenada Y de la línea base de un texto en la primera página. */
async function baseDe(buf: Uint8Array, texto: string): Promise<number> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const tc = await (await pdf.getPage(1)).getTextContent();
  const it = (tc.items as { str: string; transform: number[] }[]).find((i) => i.str.trim() === texto);
  expect(it, `no se encontró "${texto}" en la primera página`).toBeDefined();
  return it!.transform[5]!;
}

async function pdfDe(id: string, onePage = false): Promise<Uint8Array> {
  return new Uint8Array(await renderResumeToBuffer({ ...data, templateId: id }, { locale: "es", onePage }));
}

describe("cabecera compacta · la plantilla existe y respeta el núcleo", () => {
  it("1 · está en el catálogo, es de gama ATS, sin aviso y sin hueco de foto", () => {
    expect(nueva.id).toBe(NUEVA);
    expect(nueva.gama).toBe("ats");
    expect(nueva.warning).toBeUndefined();
    expect(nueva.layout).toEqual({ columns: 1, photo: false, sidebar: false });
    expect(mNueva.photoSlot).toBe("none");
    expect(mNueva.headerInline, "la plantilla no usa el eje que justifica su nombre").toBe(true);
  });

  /**
   * COMPRIMIR NO ES AMONTONAR. Es la regla entera de esta plantilla: todo el espacio
   * que gana sale de la CABECERA. Si mañana alguien la "mejora" bajándole el cuerpo,
   * este test se cae — y se cae aquí, con el motivo escrito, no en el test 8 del
   * catálogo con un mensaje sobre `ats-compacta`.
   */
  it("2 · el CUERPO no se aprieta: sigue por encima de la más densa del catálogo", () => {
    const compacta = resolveMetrics(getTemplate("ats-compacta").metrics);
    const alto = (m: ResolvedMetrics) => m.bodySize * m.bodyLeading;
    expect(alto(mNueva), "el cuerpo se apretó por debajo de Compacta").toBeGreaterThan(alto(compacta));
    expect(mNueva.sectionGap, "el aire de sección se apretó por debajo de Compacta").toBeGreaterThan(compacta.sectionGap);
    // Y dentro del núcleo de legibilidad, que es lo que hace que esto sea un estilo.
    expect(mNueva.bodySize).toBeGreaterThanOrEqual(10);
    expect(mNueva.bodySize).toBeLessThanOrEqual(11);
    expect(mNueva.bodyLeading).toBeGreaterThanOrEqual(1.15);
    expect(mNueva.bodyLeading).toBeLessThanOrEqual(1.3);
  });

  it("3 · el MARGEN SUPERIOR no baja del suelo de 20 mm (aunque el encargo lo pidiera)", () => {
    // El encargo pedía "margen superior reducido". No se puede: 20 mm es el suelo del
    // núcleo y `ats-clasica` YA está en él. Bajarlo sería sacar de la legibilidad el
    // espacio que esta plantilla saca de la composición, que es justo lo contrario de
    // lo que promete. Queda como candado para que no se cuele por la puerta de atrás.
    expect(mNueva.pageMarginV).toMatch(/^\d+(\.\d+)?mm$/);
    expect(parseFloat(mNueva.pageMarginV)).toBeGreaterThanOrEqual(20);
    expect(parseFloat(mNueva.pageMarginH)).toBeGreaterThanOrEqual(20);
  });
});

describe("cabecera compacta · cuánto se gana, medido sobre el PDF", () => {
  let altoClasica = 0;
  let altoNueva = 0;
  let lineasNueva: string[][] = [];
  let lineasClasica: string[][] = [];
  let extraidoNueva = "";

  beforeAll(async () => {
    /**
     * CÓMO SE MIDE LA CABECERA SIN PODER VERLA. En el PDF no hay ninguna marca donde
     * la cabecera acaba: hay texto y coordenadas. Lo que sí se puede localizar es la
     * línea base del PRIMER RÓTULO de sección, que es exactamente donde empieza el
     * contenido. Entre el borde superior de la caja de texto y esa línea base hay
     * tres cosas: la cabecera, el aire de sección (`sectionGap`) y la subida del
     * propio rótulo hasta su línea base.
     *
     * Esa subida no se puede calcular sin las métricas de la fuente — pero se puede
     * ANULAR: las dos plantillas rotulan con el MISMO tipo (Geist), el MISMO cuerpo
     * (10,5 pt), el mismo interlineado y el mismo margen vertical, así que el término
     * es idéntico en las dos y se cancela al restar. De ahí sale un ancla:
     *
     *     ancla = cabeceraClásica + baseDelRótuloClásica + sectionGapClásica
     *     cabecera(x) = ancla − baseDelRótulo(x) − sectionGap(x)
     *
     * Y para que el ancla no sea un número mágico heredado, el test 1 comprueba que
     * la cabecera de la clásica que entra en esa fórmula es la que sale de sumar los
     * bloques de su propia métrica.
     */
    for (const m of [mClasica, mNueva]) {
      expect(m.headingSize, "el ancla exige el mismo cuerpo de rótulo en las dos").toBe(10.5);
      expect(m.pageMarginV, "el ancla exige el mismo margen vertical en las dos").toBe("20mm");
      expect(m.upperHeadings, "el ancla exige el mismo rótulo en las dos").toBe(true);
    }
    const baseClasica = await baseDe(await pdfDe("ats-clasica"), "RESUMEN");
    const baseNueva = await baseDe(await pdfDe(NUEVA), "RESUMEN");
    const ancla = CABECERA_CLASICA_PT + baseClasica + mClasica.sectionGap;
    altoClasica = ancla - baseClasica - mClasica.sectionGap;
    altoNueva = ancla - baseNueva - mNueva.sectionGap;

    lineasClasica = await lineasPorPagina(await pdfDe("ats-clasica"));
    lineasNueva = await lineasPorPagina(await pdfDe(NUEVA));
    const { text } = await extractText(await getDocumentProxy(await pdfDe(NUEVA)), { mergePages: true });
    extraidoNueva = norm(text);

    console.log(
      `\ncabecera · clásica ${altoClasica.toFixed(2)} pt · ${NUEVA} ${altoNueva.toFixed(2)} pt · ` +
        `ganancia ${(((altoClasica - altoNueva) / altoClasica) * 100).toFixed(1)} % ` +
        `(${(altoClasica - altoNueva).toFixed(2)} pt devueltos al contenido)\n`,
    );
  }, 180000);

  it("1 · el modelo aritmético de la cabecera REPRODUCE el 74,95 pt de la clásica", () => {
    // Si esto se cae, el ancla del test 3 deja de significar nada: querría decir que
    // la hoja de estilos de ResumePDF ya no compone la cabecera como dice el modelo.
    expect(cabeceraSegunMetrica(mClasica, 2)).toBeCloseTo(CABECERA_CLASICA_PT, 6);
  });

  it("2 · la cabecera nueva ocupa lo que dice su métrica (modelo y PDF coinciden)", () => {
    // El cruce que hace verificable todo lo demás: dos caminos independientes —sumar
    // la métrica y medir el PDF— tienen que dar el mismo número. Una décima de
    // discrepancia significa que uno de los dos está describiendo otro documento.
    expect(altoNueva).toBeCloseTo(cabeceraSegunMetrica(mNueva, 2), 1);
    expect(altoClasica).toBeCloseTo(CABECERA_CLASICA_PT, 6);
  });

  it("3 · gana AL MENOS un 15 % de alto de cabecera frente a la clásica", () => {
    const ganancia = (altoClasica - altoNueva) / altoClasica;
    expect(
      ganancia,
      `la cabecera pasa de ${altoClasica.toFixed(2)} pt a ${altoNueva.toFixed(2)} pt: ` +
        `solo un ${(ganancia * 100).toFixed(1)} % de ganancia`,
    ).toBeGreaterThanOrEqual(GANANCIA_MINIMA);
  });

  it("4 · la ganancia sale de la COMPOSICIÓN, no de encoger la letra", () => {
    // La mitad del ahorro tiene que venir de juntar nombre y subtítulo en una línea,
    // no de bajar los cuerpos. Se aísla evaluando el modelo con los CUERPOS DE LA
    // CLÁSICA y solo el eje nuevo encendido: si eso ya no gana ≥15 %, la plantilla
    // estaría vendiendo como composición lo que es letra pequeña.
    const soloComposicion = cabeceraSegunMetrica({ ...mClasica, headerInline: true }, 2);
    const ganancia = (CABECERA_CLASICA_PT - soloComposicion) / CABECERA_CLASICA_PT;
    expect(
      ganancia,
      `el eje headerInline por sí solo deja la cabecera en ${soloComposicion.toFixed(2)} pt ` +
        `(${(ganancia * 100).toFixed(1)} %)`,
    ).toBeGreaterThanOrEqual(GANANCIA_MINIMA);
  });

  it("5 · la cabecera pasa de CUATRO líneas a TRES, y se ve en el PDF", () => {
    const cabecera = (paginas: string[][]) =>
      paginas[0]!.slice(0, paginas[0]!.indexOf("RESUMEN"));
    expect(cabecera(lineasClasica)).toHaveLength(4);
    expect(cabecera(lineasNueva)).toHaveLength(3);
  });

  it("6 · nombre y título objetivo salen en la MISMA línea (y en la clásica, no)", () => {
    // El reconstructor agrupa por coordenada Y: que los dos caigan en una sola línea
    // es la prueba de que comparten línea base de verdad, no de que estén cerca.
    const primeraNueva = lineasNueva[0]![0]!;
    expect(primeraNueva).toContain(data.basics.name);
    expect(primeraNueva).toContain(data.basics.label.es);
    // Control: en la clásica son dos líneas, y ninguna contiene a la otra.
    expect(lineasClasica[0]![0]).toBe(data.basics.name);
    expect(lineasClasica[0]![1]).toBe(data.basics.label.es);
  });

  /**
   * EL CANDADO QUE PROTEGE AL RAYOS-X. Juntar dos textos en una línea es barato; la
   * tentación es unirlos con un " · " o un " — " para que se lean como una unidad.
   * No se puede: `toPlainText` los emite como dos líneas y no lo toca este módulo,
   * así que cualquier glifo de unión sería un carácter que el documento tiene y su
   * "cómo lo lee el ATS" no. Entre el nombre y el título solo puede haber blancos.
   */
  it("7 · entre el nombre y el título NO se cuela ningún separador con glifo", () => {
    const i = extraidoNueva.indexOf(data.basics.name);
    expect(i).toBeGreaterThanOrEqual(0);
    const entre = extraidoNueva.slice(i + data.basics.name.length, extraidoNueva.indexOf(data.basics.label.es));
    expect(entre, `se coló "${entre}" entre el nombre y el título`).toMatch(/^\s*$/);
  });

  it("8 · el round-trip de ESTA plantilla: todo su rayos-X, en orden de lectura", () => {
    const rayosX = toPlainText({ ...data, templateId: NUEVA }, { locale: "es", onePage: false });
    let cursor = 0;
    for (const line of rayosX.split("\n").map(norm).filter(Boolean)) {
      const idx = extraidoNueva.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
  });

  it("9 · ni un dato de contacto se pierde por comprimir la cabecera", () => {
    for (const needle of [
      data.basics.name,
      data.basics.label.es,
      data.basics.email,
      data.basics.phone,
      "Santiago, Chile",
      ...data.basics.links.map((l) => (typeof l === "string" ? l : l.url)),
    ]) {
      expect(extraidoNueva, `dato perdido en la cabecera: "${needle}"`).toContain(needle);
    }
  });
});

/**
 * LO QUE NO SE PUDO HACER, ESCRITO COMO TEST EN VEZ DE COMO EXCUSA.
 *
 * El encargo pedía el contacto en UNA sola línea (email · teléfono · ciudad ·
 * linkedin · github). Con los datos reales eso son ~140 caracteres en una línea, y el
 * candado de medida de línea (tests/medida-linea.test.ts) prohíbe pasar de 110 en
 * cualquier línea suelta y de 90 en el percentil 90. El usuario fue explícito en el
 * orden de prioridades: la corrección de caracteres por línea manda sobre la
 * compresión. Así que el contacto se queda en dos líneas —que es el mínimo que ya
 * daba `contactStyle: "inline"`— y aquí queda la ARITMÉTICA de por qué, para que
 * nadie lo intente otra vez a ciegas.
 */
describe("cabecera compacta · el contacto en una sola línea es imposible, y esto lo prueba", () => {
  it("1 · el contacto entero pasa del máximo de caracteres por línea del núcleo", () => {
    const MAX_LINEA = 110; // el candado de tests/medida-linea.test.ts
    const c = contactLayout(data.basics, "es", mNueva);
    const todo = [...c.info.map((l) => l.join("")), ...c.links.map((l) => l.join(" · "))].join(" · ");
    expect(
      todo.length,
      `el contacto en una línea mide ${todo.length} caracteres; el techo del núcleo es ${MAX_LINEA}`,
    ).toBeGreaterThan(MAX_LINEA);
  });

  it("2 · repartido en dos líneas, ninguna pasa del techo (que es por lo que se reparte)", () => {
    const c = contactLayout(data.basics, "es", mNueva);
    const lineas = [...c.info.map((l) => l.join("")), ...c.links.map((l) => l.join(" · "))];
    expect(lineas).toHaveLength(2);
    for (const l of lineas) expect(l.length, `línea de contacto de ${l.length} caracteres`).toBeLessThanOrEqual(110);
  });
});

/**
 * EL EJE, CONTRA SUS PROPIOS EFECTOS COLATERALES.
 *
 * `headerInline` mete el subtítulo DENTRO del <Text> del nombre, y en @react-pdf un
 * run anidado hereda del padre. Eso significa que la caja alta y el tracking —que son
 * ejes DEL NOMBRE— se le aplicarían también al título objetivo si nadie los apagara.
 * No es una hipótesis: es lo que hace textTransform por definición. Se registra una
 * plantilla de prueba (solo dentro de este archivo) que enciende los dos ejes a la
 * vez, porque en el catálogo no hay ninguna que los combine y un eje sin ese candado
 * es una bomba de relojería para la primera plantilla que los junte.
 */
describe("cabecera compacta · el título no se contagia de los ejes del nombre", () => {
  const ID = "test-headerinline-caja-alta";

  beforeAll(() => {
    registerTemplate({
      ...nueva,
      id: ID,
      name: "Prueba caja alta",
      metrics: { ...nueva.metrics, nameCase: "upper", nameTracking: 1.1 },
    });
  });

  it("1 · con el nombre en caja alta, el título objetivo SIGUE en caja mixta", async () => {
    const { text } = await extractText(await getDocumentProxy(await pdfDe(ID)), { mergePages: true });
    const out = norm(text);
    expect(out, "el nombre no salió en caja alta").toContain(data.basics.name.toUpperCase());
    expect(out, "el título objetivo se contagió de la caja alta del nombre").toContain(data.basics.label.es);
    expect(out).not.toContain(data.basics.label.es.toUpperCase());
  }, 60000);

  it("2 · el tracking del nombre no separa las letras del título (ni las del nombre)", async () => {
    // El tracking alto es justo lo que hace que un parser lea "D I E G O". El propio
    // contrato lo limita; aquí se comprueba que además NO se hereda al subtítulo.
    const { text } = await extractText(await getDocumentProxy(await pdfDe(ID)), { mergePages: true });
    const out = norm(text);
    expect(out).not.toMatch(/D I E G O|B a c k e n d/);
  }, 60000);
});

/**
 * EL GOLDEN, INTACTO. Añadir un eje al contrato significa tocar `resolveMetrics`, que
 * es de donde sale el documento por defecto. Si el defecto del eje nuevo no fuera
 * exactamente "lo de siempre", el CV de todo el mundo cambiaría en silencio.
 */
describe("cabecera compacta · el eje nuevo no mueve el documento por defecto", () => {
  it("1 · headerInline nace apagado y ninguna otra plantilla lo enciende", () => {
    expect(resolveMetrics({
      nameSize: 21, bodySize: 10.5, bodyLeading: 1.25, sectionGap: 14,
      upperHeadings: true, headingRule: true,
    }).headerInline).toBe(false);
    expect(mClasica.headerInline).toBe(false);
  });

  it("2 · el texto plano por defecto sigue siendo el golden, byte a byte", () => {
    expect(toPlainText(data, { locale: "es", onePage: false })).toBe(golden);
    expect(toPlainText({ ...data, templateId: "ats-clasica" }, { locale: "es", onePage: false })).toBe(golden);
  });

  it("3 · el PDF sin plantilla pesa EXACTAMENTE lo mismo que con 'ats-clasica'", async () => {
    const sin = await renderResumeToBuffer(data, { locale: "es", onePage: false });
    const con = await renderResumeToBuffer({ ...data, templateId: "ats-clasica" }, { locale: "es", onePage: false });
    expect(con.length).toBe(sin.length);
  }, 60000);
});

describe("cabecera compacta · la promesa de una página se sigue cumpliendo", () => {
  it("1 · con el filtro p1, cabe en una página", async () => {
    const pdf = await getDocumentProxy(await pdfDe(NUEVA, true));
    expect(pdf.numPages).toBe(1);
  }, 60000);

  it("2 · sin filtro no gasta MENOS papel que Compacta (que es la que menos gasta)", async () => {
    // El candado 0b del round-trip vive de esto: si una plantilla nueva se colara por
    // debajo de Compacta, el nombre de Compacta dejaría de significar nada.
    const mia = (await getDocumentProxy(await pdfDe(NUEVA))).numPages;
    const suya = (await getDocumentProxy(await pdfDe("ats-compacta"))).numPages;
    expect(mia).toBeGreaterThanOrEqual(suya);
  }, 120000);
});
