import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { CX, toPlainText, type ResumeData } from "../src/lib/cv/resume";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import { listTemplates, nameText, resolveMetrics } from "../src/lib/cv/templates";

/**
 * EL TEST QUE NADIE HACE (documento-cv.md §6). Renderiza el PDF desde el golden
 * JSON, lo re-parsea con unpdf, normaliza y lo compara contra cv-texto-plano.txt.
 * Si no coincide, FALLA EL BUILD. Es el test de CI y, a la vez, el feature más
 * vendible ("cómo lo lee el ATS": el texto plano real que extrae el parser).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const fx = path.join(here, "../src/lib/cv/fixtures");
const data = JSON.parse(readFileSync(path.join(fx, "datos-ejemplo.json"), "utf8")) as ResumeData;
const golden = readFileSync(path.join(fx, "cv-texto-plano.txt"), "utf8");

const norm = (x: string) => x.replace(/\s+/g, " ").trim();

describe("CV round-trip ATS · golden (Diego Gatica, 2 páginas, es)", () => {
  let extracted = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(data, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extracted = norm(text);
  });

  it("1 · el generador de texto plano reproduce cv-texto-plano.txt EXACTO", () => {
    expect(toPlainText(data, { locale: "es", onePage: false })).toBe(golden);
  });

  it("2 · el PDF re-parseado contiene cada línea del golden, EN ORDEN DE LECTURA", () => {
    let cursor = 0;
    for (const line of golden.split("\n").map(norm).filter(Boolean)) {
      const idx = extracted.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
  });

  it("3 · contacto y datos sobreviven al parseo (runs no se pegan ni separan)", () => {
    for (const needle of [
      "Diego Gatica Morales",
      "diego.gatica@ejemplo.cl",
      "+56 9 6123 4567",
      "github.com/dgatica",
      "40.000",
      "Altiplano Pagos SpA",
      "mar 2022 – hoy",
      "Go, Python, SQL, TypeScript",
    ]) {
      expect(extracted, `dato perdido: "${needle}"`).toContain(needle);
    }
  });

  it("4 · < 2,5 MB (umbral Greenhouse) y con texto real seleccionable", async () => {
    const buf = await renderResumeToBuffer(data, { locale: "es", onePage: false });
    expect(buf.length).toBeLessThan(2.5 * 1024 * 1024);
    expect(extracted.length).toBeGreaterThan(500);
  });

  it("5 · sin basura de embedding (letras espaciadas / mojibake)", () => {
    expect(extracted).not.toMatch(/D i e g o|E x p e r i e n c i a/);
  });

  it("6 · la versión de 1 página aplica el filtro p1 (freelance y práctica fuera, sin Proyectos)", () => {
    const one = toPlainText(data, { locale: "es", onePage: true });
    expect(one).not.toContain("Desarrollador freelance");
    expect(one).not.toContain("Práctica profesional");
    expect(one).not.toContain("Proyectos");
    expect(one).toContain("Backend Developer — Altiplano Pagos SpA");
    // Altiplano queda en 4 viñetas (fuera "Documenté la API…" y "Turno de soporte…")
    expect(one).not.toContain("Documenté la API pública");
    expect(one).not.toContain("Turno de soporte");
  });
});

/**
 * ENLACES CON HIPERVÍNCULO REAL. Cada URL de la línea de contacto se envuelve en un
 * <Link> de @react-pdf; el TEXTO visible sigue siendo la URL tal cual, así que el
 * round-trip no lo nota. Este bloque fija ese candado: los enlaces del golden se
 * extraen EN ORDEN aunque ahora sean hipervínculos.
 */
/**
 * REGRESIÓN «[object Object]». Con enlaces ETIQUETADOS ({label,url}) el documento
 * debe imprimir la URL LITERAL (es lo único que lee el ATS); la etiqueta es solo
 * para la UI del editor. Este test falla si alguien vuelve a coercer el objeto con
 * String()/join() en cualquiera de los dos renderizadores.
 */
describe("CV round-trip ATS · enlaces con etiqueta imprimen la URL, no [object Object]", () => {
  const labeled: ResumeData = {
    ...data,
    basics: {
      ...data.basics,
      links: [
        { label: "LinkedIn", url: "linkedin.com/in/akhan" },
        { label: "Portafolio", url: "akhan.cl" },
      ],
    },
  };

  it("1 · el PDF re-parseado contiene las URLs literales y NINGÚN [object Object]", async () => {
    const buf = await renderResumeToBuffer(labeled, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const out = norm(text);
    expect(out).toContain("linkedin.com/in/akhan");
    expect(out).toContain("akhan.cl");
    expect(out).not.toContain("[object Object]");
  });

  it("2 · el texto plano (rayos-X) usa la URL, no la etiqueta ni el objeto", () => {
    const plain = toPlainText(labeled, { locale: "es", onePage: false });
    expect(plain).toContain("linkedin.com/in/akhan · akhan.cl");
    expect(plain).not.toContain("[object Object]");
  });
});

describe("CV round-trip ATS · enlaces como hipervínculo (el texto no cambia)", () => {
  let extractedLinks = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(data, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extractedLinks = norm(text);
  });

  it("1 · cada URL de contacto sigue como TEXTO seleccionable, en orden", () => {
    let cursor = extractedLinks.indexOf("github.com/dgatica");
    for (const url of ["github.com/dgatica", "dgatica.cl", "linkedin.com/in/diego-gatica"]) {
      const idx = extractedLinks.indexOf(url, cursor);
      expect(idx, `enlace fuera de orden o ausente: "${url}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + url.length;
    }
  });

  it("2 · el golden completo sigue EN ORDEN con los enlaces envueltos en <Link>", () => {
    let cursor = 0;
    for (const line of golden.split("\n").map(norm).filter(Boolean)) {
      const idx = extractedLinks.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
  });
});

/**
 * QR opt-in y HONESTO. Con qr puesto se dibuja un QR al pie, pero la URL SIEMPRE
 * va también como TEXTO al lado (el ATS no lee el QR). El round-trip debe SEGUIR
 * pasando: la URL se extrae y el orden de lectura del documento no se rompe.
 */
describe("CV round-trip ATS · QR opt-in (la URL en texto, orden intacto)", () => {
  const QR_URL = "dgatica.cl/portafolio";
  const withQr: ResumeData = { ...data, qr: { url: QR_URL } };
  let extractedQr = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(withQr, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extractedQr = norm(text);
  });

  it("1 · la URL del QR aparece como TEXTO seleccionable (la máquina la lee)", () => {
    expect(extractedQr).toContain(QR_URL);
  });

  it("2 · las líneas del golden siguen EN ORDEN — el QR al pie no rompe la lectura", () => {
    let cursor = 0;
    for (const line of golden.split("\n").map(norm).filter(Boolean)) {
      const idx = extractedQr.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente con QR: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
  });

  it("3 · la URL del QR va DESPUÉS de todo el contenido del golden (pie de página)", () => {
    const lastGolden = golden.split("\n").map(norm).filter(Boolean).pop()!;
    expect(extractedQr.indexOf(QR_URL)).toBeGreaterThan(extractedQr.indexOf(lastGolden));
  });
});

/**
 * FOTO opt-in (versión "visual"). Con foto puesta se dibuja una imagen arriba,
 * pero es INVISIBLE para el parser: no inyecta texto ni basura, y el contacto en
 * texto sobrevive igual. Es la garantía de que enviar un CV con foto a un ATS no
 * rompe la lectura del texto (aunque el estándar sea sin foto).
 */
describe("CV round-trip ATS · foto opt-in (imagen invisible al parser)", () => {
  // PNG 1×1 transparente — data-URL mínima, como la que sube el usuario reducida.
  const PHOTO =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const withPhoto: ResumeData = { ...data, photo: PHOTO };
  let extractedPhoto = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(withPhoto, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extractedPhoto = norm(text);
  });

  it("1 · el contacto en texto sobrevive con la foto puesta", () => {
    for (const needle of ["Diego Gatica Morales", "diego.gatica@ejemplo.cl", "+56 9 6123 4567"]) {
      expect(extractedPhoto, `dato perdido con foto: "${needle}"`).toContain(needle);
    }
  });

  it("2 · las líneas del golden siguen EN ORDEN — la foto no inyecta texto", () => {
    let cursor = 0;
    for (const line of golden.split("\n").map(norm).filter(Boolean)) {
      const idx = extractedPhoto.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente con foto: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
  });

  it("3 · sin basura de embedding (la imagen no ensucia el texto)", () => {
    expect(extractedPhoto).not.toMatch(/D i e g o|E x p e r i e n c i a/);
  });
});

/**
 * QR con URL SOBRE la capacidad del código (~2.3 KB): QRCode.toDataURL lanzaría, así
 * que el render degrada a SOLO-TEXTO (sin glifo) en vez de reventar el PDF. El candado
 * "la URL va como texto" se mantiene; el documento nunca falla por una URL larga.
 */
describe("CV round-trip ATS · QR con URL larga degrada a solo-texto (no revienta)", () => {
  const LONG = "https://ejemplo.cl/" + "a".repeat(2600); // supera la capacidad del QR
  const withLong: ResumeData = { ...data, qr: { url: LONG } };

  it("1 · renderResumeToBuffer NO lanza y produce un PDF", async () => {
    const buf = await renderResumeToBuffer(withLong, { locale: "es", onePage: false });
    expect(buf.length).toBeGreaterThan(0);
  });

  it("2 · la URL sigue apareciendo como TEXTO aunque no haya glifo QR", async () => {
    const buf = await renderResumeToBuffer(withLong, { locale: "es", onePage: false });
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    // El prefijo estable de la URL debe estar en el texto extraído.
    expect(norm(text)).toContain("https://ejemplo.cl/aaaaaaaa");
  });
});

/**
 * QR modo 'vcard'. El QR codifica una vCard de los basics; el contacto YA está como
 * texto en el CUERPO (el candado ATS se cumple ahí), así que al pie NO se emite URL
 * extra, solo una leyenda honesta. El round-trip del golden debe seguir intacto y el
 * PDF no puede reventar. La vCard en sí NO debe aparecer como texto (vive en la imagen).
 */
describe("CV round-trip ATS · QR modo vcard (contacto en el cuerpo, orden intacto)", () => {
  const withVcard: ResumeData = { ...data, qr: { mode: "vcard" } };
  let extractedVc = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(withVcard, { locale: "es", onePage: false });
    expect(buf.length).toBeGreaterThan(0);
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extractedVc = norm(text);
  });

  it("1 · el golden sigue EN ORDEN — el QR vcard no altera la lectura", () => {
    let cursor = 0;
    for (const line of golden.split("\n").map(norm).filter(Boolean)) {
      const idx = extractedVc.indexOf(line, cursor);
      expect(idx, `fuera de orden o ausente con QR vcard: "${line}"`).toBeGreaterThanOrEqual(0);
      cursor = idx + line.length;
    }
  });

  it("2 · la vCard NO se filtra como texto (vive dentro del glifo, no en el stream)", () => {
    expect(extractedVc).not.toContain("BEGIN:VCARD");
    expect(extractedVc).not.toContain("VERSION:3.0");
  });

  it("3 · el contacto en texto (nombre/email/tel) sobrevive igual", () => {
    for (const needle of ["Diego Gatica Morales", "diego.gatica@ejemplo.cl", "+56 9 6123 4567"]) {
      expect(extractedVc, `dato perdido con QR vcard: "${needle}"`).toContain(needle);
    }
  });
});

/**
 * EL CANDADO DEL CATÁLOGO (§C4). Todo lo de arriba prueba UNA plantilla: la de por
 * defecto. Este bloque lo prueba para TODAS las de gama ATS, una por una, con el
 * mismo golden: si una plantilla no sobrevive al round-trip, no se publica como
 * ATS. Es lo que separa un sistema de plantillas de un catálogo de promesas.
 *
 * Las de gama 'visual' quedan FUERA del bucle a propósito —su composición de dos
 * columnas rompe el orden de lectura, y ese es justo su trato— pero se les exige
 * lo único que las hace honestas: un `warning` de verdad.
 */
const ATS_TEMPLATES = listTemplates().filter((t) => t.gama === "ats");
const VISUAL_TEMPLATES = listTemplates().filter((t) => t.gama === "visual");

/**
 * Los DATOS que el documento tiene que conservar, sea cual sea la plantilla. Se
 * derivan del propio fixture en vez de escribirse a mano: así, el día que alguien
 * añada un empleo al golden, el candado lo cubre solo. Son cadenas que NINGÚN eje
 * transforma (ni caja, ni marcador, ni orden), y por eso valen para las treinta.
 */
const DATOS_INTOCABLES = [
  data.basics.email,
  data.basics.phone,
  ...data.basics.links.map((l) => (typeof l === "string" ? l : l.url)),
  ...data.work.map((w) => w.company),
  ...data.work.map((w) => w.dates.es),
  ...data.work.flatMap((w) => w.bullets.map((b) => b.es)),
  ...data.projects.map((p) => p.es),
  ...data.education.map((e) => e.org),
  ...data.education.map((e) => e.dates.es),
  ...data.skills.map((s) => s.items.es),
  data.basics.summary.es,
];

describe("CV round-trip ATS · PARAMETRIZADO por plantilla del catálogo", () => {
  // Un render por plantilla, reutilizado por sus comprobaciones (renderizar un PDF
  // de dos páginas cinco veces por aserción sería absurdo).
  const salida = new Map<string, string>();

  beforeAll(async () => {
    for (const tpl of ATS_TEMPLATES) {
      const buf = await renderResumeToBuffer({ ...data, templateId: tpl.id }, { locale: "es", onePage: false });
      expect(buf.length, `${tpl.id}: PDF vacío`).toBeGreaterThan(0);
      expect(buf.length, `${tpl.id}: pasa de 2,5 MB (umbral Greenhouse)`).toBeLessThan(2.5 * 1024 * 1024);
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      salida.set(tpl.id, norm(text));
    }
  }, 300000);

  it("0 · el catálogo trae una gama ATS de VERDAD (treinta o más), con la clásica dentro", () => {
    expect(ATS_TEMPLATES.length).toBeGreaterThanOrEqual(30);
    expect(ATS_TEMPLATES.map((t) => t.id)).toContain("ats-clasica");
  });

  it("0b · 'Compacta' cumple su nombre: el contenido de DOS páginas le cabe en UNA", async () => {
    // El nombre de una plantilla es una promesa. Esta la cumple con el mismo golden
    // que la clásica reparte en dos páginas — sin recortar una sola palabra (eso lo
    // comprueba el test 'b' de esta misma tanda, que exige el golden entero).
    const paginas = async (id: string) => {
      const buf = await renderResumeToBuffer({ ...data, templateId: id }, { locale: "es", onePage: false });
      return (await getDocumentProxy(new Uint8Array(buf))).numPages;
    };
    expect(await paginas("ats-compacta")).toBe(1);
    expect(await paginas("ats-clasica")).toBe(2);
  }, 60000);

  it("0c · la versión de una página CABE en una página, en todas las plantillas ATS", async () => {
    // Con el filtro p1 puesto, "1 página" tiene que ser verdad. Una plantilla con
    // tanto aire que se desborda a dos no es un estilo: es una promesa incumplida.
    for (const tpl of ATS_TEMPLATES) {
      const buf = await renderResumeToBuffer({ ...data, templateId: tpl.id }, { locale: "es", onePage: true });
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      expect(pdf.numPages, `${tpl.id}: la versión de una página sale en ${pdf.numPages}`).toBe(1);
    }
  }, 120000);

  for (const tpl of ATS_TEMPLATES) {
    /**
     * El rayos-X DE ESTA PLANTILLA. Con treinta plantillas el golden ya no puede ser
     * la vara para todas: hay plantillas que reordenan las secciones, numeran los
     * rótulos o cambian el marcador de viñeta, y exigirles el orden del golden sería
     * exigirles que no hagan lo que las hace distintas.
     *
     * Lo que NO se relaja es el candado: se les exige que el PDF coincida con SU
     * PROPIO texto plano, que es el que la app le enseña al usuario en "cómo lo lee
     * el ATS". Si el documento y su rayos-X divergieran, el producto estaría mintiendo
     * en la única pantalla donde promete no hacerlo. La clásica, además, sigue atada
     * al golden byte a byte (bloque de retrocompatibilidad, más abajo).
     */
    const rayosX = toPlainText({ ...data, templateId: tpl.id }, { locale: "es", onePage: false });

    describe(`${tpl.id} · ${tpl.name}`, () => {
      it("a · nombre, contacto, cargos y fechas sobreviven al parseo", () => {
        const out = salida.get(tpl.id)!;
        const m = resolveMetrics(tpl.metrics);
        for (const needle of [
          nameText(data.basics.name, m), // el nombre, en la caja que use la plantilla
          "diego.gatica@ejemplo.cl", // email
          "+56 9 6123 4567", // teléfono
          "github.com/dgatica", // enlace
          "Altiplano Pagos SpA", // empresa
          "Backend Developer, equipo Checkout", // el cargo más largo
          "mar 2022 – hoy", // fechas (con guion corto)
          "ene 2020 – feb 2022",
          "2014 – 2019", // fechas de formación
          "Go, Python, SQL, TypeScript", // habilidades
          "40.000", // cifra dentro de una viñeta
        ]) {
          expect(out, `${tpl.id} · dato perdido: "${needle}"`).toContain(needle);
        }
      });

      it("b · TODAS las líneas de su texto plano, en ORDEN DE LECTURA", () => {
        const out = salida.get(tpl.id)!;
        let cursor = 0;
        for (const line of rayosX.split("\n").map(norm).filter(Boolean)) {
          const idx = out.indexOf(line, cursor);
          expect(idx, `${tpl.id} · fuera de orden o ausente: "${line}"`).toBeGreaterThanOrEqual(0);
          cursor = idx + line.length;
        }
      });

      it("c · NINGÚN dato del master se pierde por el camino", () => {
        // El orden puede cambiar; el contenido no. Un eje de composición que se coma
        // una viñeta, una empresa o un enlace no es un estilo: es una pérdida de datos.
        const out = salida.get(tpl.id)!;
        for (const dato of DATOS_INTOCABLES) {
          expect(out, `${tpl.id} · el documento pierde: "${dato}"`).toContain(norm(dato));
          expect(rayosX, `${tpl.id} · el rayos-X pierde: "${dato}"`).toContain(dato);
        }
      });

      it("d · sin basura de embedding (letras espaciadas / mojibake)", () => {
        const out = salida.get(tpl.id)!;
        expect(out).not.toMatch(/D i e g o|E x p e r i e n c i a/);
        expect(out).not.toContain("[object Object]");
        expect(out.length).toBeGreaterThan(500);
      });
    });
  }
});

/**
 * GAMA VISUAL. No pasa por el round-trip —su barra lateral rompe el orden de
 * lectura, y por eso existe el aviso— pero sí tiene que: (1) llevar un `warning`
 * que diga POR QUÉ, y (2) generar un PDF sin reventar, con el contacto dentro.
 */
describe("CV gama visual · exenta del round-trip, obligada al aviso", () => {
  it("1 · hay al menos una plantilla visual y TODAS llevan warning no vacío", () => {
    expect(VISUAL_TEMPLATES.length).toBeGreaterThanOrEqual(1);
    for (const tpl of VISUAL_TEMPLATES) {
      expect(tpl.warning?.trim(), `${tpl.id} sin aviso`).toBeTruthy();
      expect(tpl.warning!.trim().length, `${tpl.id}: aviso demasiado corto para explicar nada`).toBeGreaterThan(30);
      expect(tpl.warning!.toLowerCase(), `${tpl.id}: el aviso no nombra el ATS`).toContain("ats");
    }
  });

  it("2 · ninguna plantilla de gama ATS lleva warning (si lo necesitara, no sería ATS)", () => {
    for (const tpl of ATS_TEMPLATES) expect(tpl.warning, `${tpl.id} no debería avisar de nada`).toBeUndefined();
  });

  it("3 · lee en otro ORDEN, pero no PIERDE texto (la frontera entre 'peor' y 'roto')", async () => {
    // Un CV que parsea en mal orden es un mal CV; uno que se come media URL o el
    // último empleo está ROTO, y eso no lo salva ningún aviso. Este test nació de un
    // fallo real: sin `flexBasis: 0` la columna de contenido se encogía y las URLs
    // (palabras que no se pueden partir) se cortaban a media palabra.
    const palabras = [...new Set(golden.split(/\s+/).filter((w) => w.length >= 4))];
    // Los RÓTULOS de sección son lo único que una plantilla puede quitar a propósito
    // (headingLabel: false), y solo en esta gama. No es texto del usuario: es la
    // etiqueta del bloque. Quitarla es exactamente lo que su aviso explica, así que
    // no se le exige a esa plantilla — pero a las demás sí, y los DATOS a todas.
    const rotulos = new Set(Object.values(data.headings).map((h) => h.es.toUpperCase()));
    for (const tpl of VISUAL_TEMPLATES) {
      const rotula = resolveMetrics(tpl.metrics).headingLabel;
      const buf = await renderResumeToBuffer({ ...data, templateId: tpl.id }, { locale: "es", onePage: false });
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      const out = norm(text);
      const exigidas = rotula ? palabras : palabras.filter((w) => !rotulos.has(w));
      const perdidas = exigidas.filter((w) => !out.includes(w));
      expect(perdidas, `${tpl.id} · palabras recortadas: ${perdidas.slice(0, 8).join(", ")}`).toEqual([]);
      // Los datos del master no se pierden NUNCA, ni en esta gama.
      for (const dato of DATOS_INTOCABLES) {
        expect(out, `${tpl.id} · el documento pierde: "${dato}"`).toContain(norm(dato));
      }
    }
  }, 120000);

  it("4 · renderiza un PDF válido y el contacto sigue estando como texto", async () => {
    for (const tpl of VISUAL_TEMPLATES) {
      const buf = await renderResumeToBuffer({ ...data, templateId: tpl.id }, { locale: "es", onePage: true });
      expect(buf.length, `${tpl.id}: PDF vacío`).toBeGreaterThan(0);
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      const out = norm(text);
      for (const needle of ["Diego Gatica Morales", "diego.gatica@ejemplo.cl", "+56 9 6123 4567"]) {
        expect(out, `${tpl.id} · dato perdido: "${needle}"`).toContain(needle);
      }
    }
  }, 60000);
});

/**
 * RETROCOMPATIBILIDAD, dicha en un test. Un documento SIN templateId debe salir
 * exactamente igual que uno con la plantilla por defecto: mismos bytes. Es la
 * garantía de que meter un sistema de plantillas no le cambió el CV a nadie.
 */
describe("CV plantillas · sin templateId = plantilla por defecto (bytes idénticos)", () => {
  it("1 · el PDF sin plantilla y el PDF con 'ats-clasica' son el MISMO documento", async () => {
    const sin = await renderResumeToBuffer(data, { locale: "es", onePage: false });
    const con = await renderResumeToBuffer({ ...data, templateId: "ats-clasica" }, { locale: "es", onePage: false });
    // El PDF lleva fechas de creación: se comparan por tamaño y por texto extraído,
    // que es lo que de verdad define "el mismo documento" para este producto.
    expect(con.length).toBe(sin.length);
    const t1 = await extractText(await getDocumentProxy(new Uint8Array(sin)), { mergePages: true });
    const t2 = await extractText(await getDocumentProxy(new Uint8Array(con)), { mergePages: true });
    expect(norm(t2.text)).toBe(norm(t1.text));
  }, 60000);

  it("2 · un templateId DESCONOCIDO no deja a nadie sin CV: cae en la de por defecto", async () => {
    const raro = await renderResumeToBuffer({ ...data, templateId: "no-existe-esta-plantilla" }, { locale: "es" });
    const sin = await renderResumeToBuffer(data, { locale: "es" });
    expect(raro.length).toBe(sin.length);
  }, 60000);

  it("3 · el texto plano por defecto (y el de 'ats-clasica') ES el golden", () => {
    const base = toPlainText(data, { locale: "es", onePage: false });
    expect(base).toBe(golden);
    expect(toPlainText({ ...data, templateId: "ats-clasica" }, { locale: "es", onePage: false })).toBe(golden);
    // Y un id que no existe tampoco mueve el rayos-X: cae en la de por defecto.
    expect(toPlainText({ ...data, templateId: "no-existe" }, { locale: "es", onePage: false })).toBe(golden);
  });

  it("4 · el rayos-X SIGUE a la plantilla: mismas líneas, en el orden de cada una", () => {
    // Antes este test decía que el texto plano no dependía de la plantilla, y era
    // verdad porque ninguna plantilla movía el texto. Al llegar los ejes de orden de
    // sección, caja y marcador, esa promesa se volvió falsa Y peligrosa: si el PDF
    // pone la formación arriba y el rayos-X la sigue poniendo abajo, la pantalla
    // "cómo lo lee el ATS" enseña un documento que no existe. Lo que se conserva —y
    // es lo que había que conservar— es que NO SE PIERDE NI SE INVENTA CONTENIDO.
    // Una línea "desnuda": sin numeral de sección, sin marcador de viñeta y en caja
    // alta. Es decir, la línea SIN lo que los ejes tienen permiso para cambiar — lo
    // que queda es contenido puro, y eso sí tiene que salir del master.
    const etiquetas = new RegExp(`${CX.email.toUpperCase()}|${CX.tel.toUpperCase()}`, "g");
    const desnudar = (l: string) =>
      l
        .replace(/^\d{2} · /, "") // numeral de sección
        .replace(/^[•—-]\s+/, "") // marcador de viñeta
        .replace(/ · /g, " ") // separador de segmentos (contacto, fechas en línea)
        .toUpperCase() // caja del rótulo y del nombre
        .replace(etiquetas, ""); // prefijos "Email:" / "Tel:"
    const enLineas = (s: string) => s.split("\n").map(norm).filter(Boolean);
    const baseDesnuda = enLineas(golden).map(desnudar);

    for (const tpl of listTemplates()) {
      const suyo = toPlainText({ ...data, templateId: tpl.id }, { locale: "es", onePage: false });
      for (const dato of DATOS_INTOCABLES) {
        expect(suyo, `${tpl.id} · el rayos-X pierde: "${dato}"`).toContain(dato);
      }
      // Ninguna plantilla INVENTA contenido: cada línea suya, ya desnuda, tiene que
      // ser una línea del golden o un trozo/unión de ellas (el contacto se reparte,
      // las habilidades se juntan, las fechas se separan del cargo).
      for (const l of enLineas(suyo).map(desnudar)) {
        const explicada = baseDesnuda.some((g) => g.includes(l) || l.includes(g));
        expect(explicada, `${tpl.id} · línea que no sale de los datos: "${l}"`).toBe(true);
      }
    }
  });
});
