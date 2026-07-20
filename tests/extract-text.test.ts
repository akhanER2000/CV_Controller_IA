import { describe, it, expect } from "vitest";
import { extractFile } from "../src/lib/extract/files";
import {
  segmentText,
  mergeExtractions,
  truncationWarning,
  WINDOW_CHARS,
  WINDOW_OVERLAP,
  MAX_WINDOWS,
} from "../src/lib/extract/llm";
import { fileKindFromName, sourceKindFor, FILE_ACCEPT } from "../src/lib/db/sources";
import type { Extraction } from "../src/lib/extract/schema";

/* ============================================================================
   Texto plano + fin del truncado silencioso.

   Dos agujeros que se tapan aquí:

   1. El .md se RECHAZABA aunque la zona de arrastre lo anunciaba como fuente
      soportada ("el cuestionario respondido (.md)"). La interfaz se contradecía
      con su propio validador delante del usuario.

   2. ★ El grande: la extracción cortaba el texto en `slice(0, 30000)`. Un
      dossier de 104 KB (~106.000 caracteres) se leía del primer 28% y el 72%
      restante se descartaba SIN AVISAR. Aquí se prueba que la segmentación
      cubre el documento ENTERO, que la fusión no duplica, y que cuando se
      aplica el tope se dice en voz alta.

   El dossier de 104 KB se GENERA en el test (no se commitea ningún fixture).
   ============================================================================ */

// ── Generador de dossier realista ────────────────────────────────────────────
const EMPRESAS = ["Altiplano Pagos SpA", "Rayén Retail S.A.", "Andes Data Ltda.", "Cobre Digital SpA"];
const CARGOS = ["Backend Developer", "Ingeniero de Plataforma", "Tech Lead", "Desarrollador Full-Stack"];

/** Dossier profesional con estructura real: experiencia, viñetas con cifras, habilidades, proyectos, formación. */
function dossier(targetBytes: number): string {
  const out: string[] = [
    "# Dossier profesional — Diego Gatica Morales",
    "",
    "diego.gatica@ejemplo.cl · +56 9 1234 5678 · Santiago, Chile",
    "Portfolio: https://dgatica.cl · GitHub: github.com/dgatica",
    "",
    "## Resumen",
    "Ingeniero civil en computación con ocho años construyendo servicios de pago y conciliación.",
    "",
    "## Experiencia",
    "",
  ];
  let i = 0;
  const enc = new TextEncoder();
  const size = () => enc.encode(out.join("\n")).length;

  while (size() < targetBytes) {
    const empresa = EMPRESAS[i % EMPRESAS.length]!;
    const cargo = CARGOS[i % CARGOS.length]!;
    const desde = 2010 + (i % 14);
    out.push(
      `### ${cargo} — ${empresa}`,
      `${desde} – ${desde + 2} · Santiago, Chile`,
      `Responsable del servicio de conciliación número ${i}, con foco en idempotencia y trazabilidad.`,
      `- Reduje la latencia p95 del endpoint de pagos número ${i} en un ${20 + (i % 60)}%, de 840 ms a 310 ms.`,
      `- Procesé ${30 + i} mil transacciones diarias sin pérdida de idempotencia durante el proyecto ${i}.`,
      `- Migré ${2 + (i % 9)} servicios legados a Go, bajando el costo de infraestructura un ${10 + (i % 30)}%.`,
      `- Documenté el contrato OpenAPI del servicio ${i} y lo dejé versionado para los equipos consumidores.`,
      "",
      `#### Proyecto interno ${i}: conciliación bancaria`,
      `Diseñé el motor de matching del proyecto ${i} sobre PostgreSQL, con reintentos exponenciales.`,
      "",
    );
    i++;
  }

  out.push(
    "## Aptitudes",
    "Lenguajes: Go, Python, SQL, TypeScript",
    "Plataforma: Kubernetes, Docker, Terraform, AWS",
    "Idiomas: Español nativo, Inglés B2",
    "",
    "## Proyectos",
    "### idempotency-go",
    "Librería de idempotencia para APIs de pago. https://github.com/dgatica/idempotency-go",
    "",
    "## Formación",
    "Ingeniería Civil en Computación — Universidad Andrés Bello (UNAB), 2015 – 2019",
    "Diplomado en Ingeniería de Datos — Pontificia Universidad Católica, 2022",
    "",
  );
  return out.join("\n");
}

const KB104 = 104 * 1024;
const DOSSIER = dossier(KB104);
const DOSSIER_BYTES = new TextEncoder().encode(DOSSIER);

describe("dossier generado · es representativo del caso real (104 KB)", () => {
  it("pesa ~104 KB y tiene ~16.800 palabras", () => {
    expect(DOSSIER_BYTES.byteLength).toBeGreaterThanOrEqual(KB104);
    expect(DOSSIER_BYTES.byteLength).toBeLessThan(KB104 * 1.1);
    const palabras = DOSSIER.trim().split(/\s+/).length;
    expect(palabras).toBeGreaterThan(12_000);
  });

  it("★ el corte viejo (slice 0,30000) habría descartado más del 70% del documento", () => {
    const leidoAntes = Math.min(DOSSIER.length, 30_000);
    expect(leidoAntes / DOSSIER.length).toBeLessThan(0.3);
  });
});

// ── A1 · el .md/.txt entra ────────────────────────────────────────────────────
describe("fileKindFromName · el texto plano ya no se rechaza", () => {
  it("acepta .md, .markdown y .txt por EXTENSIÓN (el MIME de .md suele venir vacío)", () => {
    expect(fileKindFromName("cuestionario-respondido.md", "")).toBe("text");
    expect(fileKindFromName("notas.MD")).toBe("text");
    expect(fileKindFromName("dossier.markdown")).toBe("text");
    expect(fileKindFromName("notas.txt")).toBe("text");
  });

  it("acepta también por MIME cuando el nombre no dice nada", () => {
    expect(fileKindFromName("sin-extension", "text/plain")).toBe("text");
    expect(fileKindFromName("sin-extension", "text/markdown")).toBe("text");
  });

  it("no rompe la detección de lo que ya funcionaba", () => {
    expect(fileKindFromName("CV_2023.pdf")).toBe("pdf");
    expect(fileKindFromName("perfil.docx")).toBe("docx");
    expect(fileKindFromName("captura.PNG")).toBe("image");
    expect(fileKindFromName("sin-extension", "application/pdf")).toBe("pdf");
  });

  it("sigue rechazando lo que de verdad no sabemos leer (.doc binario, .key)", () => {
    expect(fileKindFromName("viejo.doc")).toBeNull();
    expect(fileKindFromName("presentacion.key")).toBeNull();
    expect(fileKindFromName("archivo")).toBeNull();
  });

  it("★ lo que el selector OFRECE coincide con lo que el validador ACEPTA", () => {
    // La contradicción original: la zona de arrastre anunciaba .md y kindFor lo
    // devolvía null. Aquí se ata: cada extensión del `accept` debe ser aceptada.
    const exts = FILE_ACCEPT.split(",").filter((x) => x.startsWith("."));
    for (const ext of exts) expect(fileKindFromName(`archivo${ext}`), ext).not.toBeNull();
  });

  it("al persistir, 'text' se guarda como 'paste' (el enum de la BD no tiene otro valor)", () => {
    expect(sourceKindFor("text")).toBe("paste");
    expect(sourceKindFor("pdf")).toBe("pdf");
    expect(sourceKindFor("docx")).toBe("docx");
    expect(sourceKindFor("image")).toBe("image");
  });
});

describe("extractFile · kind 'text' → el contenido ES el raw_text", () => {
  it("★ devuelve el dossier de 104 KB ÍNTEGRO, sin LLM, sin OCR", async () => {
    const ex = await extractFile({ kind: "text", bytes: DOSSIER_BYTES, name: "dossier.md" });
    expect(ex.isTranscription).toBe(false);
    expect(ex.warning).toBeUndefined();
    expect(ex.text).toBe(DOSSIER.trim());
    // íntegro de verdad: principio, medio y final del documento
    expect(ex.text).toContain("Dossier profesional");
    expect(ex.text).toContain("Universidad Andrés Bello");
    expect(ex.text.length).toBeGreaterThan(100_000);
  });

  it("conserva acentos y ñ (UTF-8 real, no latin-1 mal leído)", async () => {
    const src = "Formación en la Universidad Andrés Bello. Diseñé el motor de conciliación.";
    const ex = await extractFile({ kind: "text", bytes: new TextEncoder().encode(src) });
    expect(ex.text).toBe(src);
  });

  it("no llama NUNCA al modelo (ni transcripción ni extracción de imagen)", async () => {
    let llamadas = 0;
    const espia = {
      transcribeImage: async () => { llamadas++; return "NO"; },
      transcribePdf: async () => { llamadas++; return "NO"; },
      hasAiKey: () => true,
    };
    await extractFile({ kind: "text", bytes: new TextEncoder().encode("hola mundo") }, espia);
    expect(llamadas).toBe(0);
  });

  it("archivo vacío → aviso honesto, no un texto inventado", async () => {
    const vacio = await extractFile({ kind: "text", bytes: new Uint8Array(0) });
    expect(vacio.text).toBe("");
    expect(vacio.warning).toMatch(/vacío/i);

    const blancos = await extractFile({ kind: "text", bytes: new TextEncoder().encode("   \n\n  ") });
    expect(blancos.text).toBe("");
    expect(blancos.warning).toMatch(/vacío/i);
  });

  it("bytes que no son UTF-8 (binario con extensión .txt) → aviso, no basura", async () => {
    const binario = new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x02, 0xff, 0xff, 0xfd, 0x03, 0x04]);
    const ex = await extractFile({ kind: "text", bytes: binario, name: "raro.txt" });
    expect(ex.text).toBe("");
    expect(ex.warning).toMatch(/UTF-8/i);
  });
});

// ── A2 · segmentación: el documento entero, o se dice ─────────────────────────
describe("segmentText · el documento ENTERO, en ventanas solapadas", () => {
  it("un texto que cabe en una ventana no se parte", () => {
    const seg = segmentText("a".repeat(1000));
    expect(seg.windows).toHaveLength(1);
    expect(seg.truncated).toBe(false);
    expect(seg.total).toBe(1);
  });

  it("texto vacío → ninguna ventana (no se llama al modelo por nada)", () => {
    expect(segmentText("").windows).toHaveLength(0);
  });

  it("★ el dossier de 104 KB produce varias ventanas y NINGUNA se descarta", () => {
    const seg = segmentText(DOSSIER);
    expect(seg.windows.length).toBeGreaterThan(1);
    expect(seg.truncated).toBe(false);
    expect(seg.covered).toBe(DOSSIER.length);
  });

  it("★★ la UNIÓN de las ventanas ES el documento, carácter por carácter", () => {
    const seg = segmentText(DOSSIER);
    // Reconstrucción exacta desde los offsets: cada ventana empieza donde la
    // anterior aún no había terminado (solape), así que concatenar los tramos
    // nuevos devuelve el original íntegro. Si hubiera un hueco, esto falla.
    const stride = WINDOW_CHARS - WINDOW_OVERLAP;
    let reconstruido = "";
    seg.windows.forEach((w, i) => {
      const inicio = i * stride;
      reconstruido += inicio >= reconstruido.length ? w : w.slice(reconstruido.length - inicio);
    });
    expect(reconstruido).toBe(DOSSIER);
  });

  it("★ ninguna parte del documento se queda fuera de TODA ventana (muestreo denso)", () => {
    const seg = segmentText(DOSSIER);
    for (let pos = 0; pos < DOSSIER.length; pos += 500) {
      const trozo = DOSSIER.slice(pos, pos + 120);
      expect(seg.windows.some((w) => w.includes(trozo)), `hueco en el offset ${pos}`).toBe(true);
    }
  });

  it("★ el solape es real: un item a caballo del corte cabe ENTERO en la ventana siguiente", () => {
    const seg = segmentText(DOSSIER);
    const stride = WINDOW_CHARS - WINDOW_OVERLAP;
    for (let i = 1; i < seg.windows.length; i++) {
      // La ventana i-1 termina en (i*stride + OVERLAP). Cualquier item de hasta
      // OVERLAP caracteres que quede partido por ese corte empieza, como muy
      // pronto, en i*stride — que es justo donde arranca la ventana i. Así que
      // aparece completo aquí. Eso es lo que impide extraer medias viñetas.
      const finVentanaPrevia = i * stride + WINDOW_OVERLAP;
      const itemPartido = DOSSIER.slice(finVentanaPrevia - WINDOW_OVERLAP, finVentanaPrevia + 1);
      expect(seg.windows[i]!.includes(itemPartido.slice(0, WINDOW_OVERLAP)), `corte ${i}`).toBe(true);
    }
  });

  it("cada ventana respeta el tamaño máximo (no revienta el límite del proveedor)", () => {
    for (const w of segmentText(DOSSIER).windows) expect(w.length).toBeLessThanOrEqual(WINDOW_CHARS);
  });

  it("★ documento enorme → se aplica el tope y se DICE (nunca en silencio)", () => {
    const enorme = "x".repeat(WINDOW_CHARS * (MAX_WINDOWS + 10));
    const seg = segmentText(enorme);
    expect(seg.windows).toHaveLength(MAX_WINDOWS);
    expect(seg.truncated).toBe(true);
    expect(seg.total).toBeGreaterThan(MAX_WINDOWS);

    const aviso = truncationWarning(seg)!;
    expect(aviso).toBeTruthy();
    expect(aviso).toContain(`${seg.windows.length} de ${seg.total} partes`);
    expect(aviso).toMatch(/NO se extrajo/);
  });

  it("sin tope aplicado NO se inventa un aviso", () => {
    expect(truncationWarning(segmentText(DOSSIER))).toBeNull();
  });
});

// ── A2 · fusión y deduplicación ───────────────────────────────────────────────
const basicsVacio = {
  name: "", label: "", email: "", phone: "", location: "", links: [] as string[],
  summary: "", summaryEvidence: "",
};
const parte = (over: Partial<Extraction> = {}): Extraction => ({
  basics: { ...basicsVacio }, work: [], education: [], skills: [], projects: [], ...over,
});

describe("mergeExtractions · un item repetido entre ventanas NO sale dos veces", () => {
  it("★ el mismo rol visto en dos ventanas se fusiona en uno", () => {
    const a = parte({
      work: [{
        title: "Backend Developer", company: "Altiplano Pagos SpA", location: "", dates: "",
        evidence: "Backend Developer en Altiplano",
        bullets: [{ text: "Reduje la latencia un 38%.", evidence: "reduje la latencia un 38%" }],
      }],
    });
    const b = parte({
      work: [{
        // la segunda ventana lo ve con acentos/mayúsculas distintos y aporta las fechas
        title: "backend developer", company: "Altiplano Pagos SpA", location: "Santiago",
        dates: "mar 2022 – hoy", evidence: "",
        bullets: [
          { text: "Reduje la latencia un 38%.", evidence: "" },   // duplicada
          { text: "Migré 4 servicios a Go.", evidence: "migré 4 servicios" }, // nueva
        ],
      }],
    });
    const m = mergeExtractions([a, b]);
    expect(m.work).toHaveLength(1);
    expect(m.work[0]!.bullets).toHaveLength(2);
    // gana el primer valor NO vacío: la ventana 2 completa los huecos de la 1
    expect(m.work[0]!.dates).toBe("mar 2022 – hoy");
    expect(m.work[0]!.location).toBe("Santiago");
    expect(m.work[0]!.evidence).toBe("Backend Developer en Altiplano");
  });

  it("roles DISTINTOS no se fusionan por error", () => {
    const w = (title: string, company: string) => ({
      title, company, location: "", dates: "", evidence: "e", bullets: [],
    });
    const m = mergeExtractions([
      parte({ work: [w("Backend Developer", "Altiplano Pagos SpA")] }),
      parte({ work: [w("Tech Lead", "Rayén Retail S.A.")] }),
    ]);
    expect(m.work).toHaveLength(2);
  });

  it("basics: se completan los huecos sin pisar lo ya visto", () => {
    const m = mergeExtractions([
      parte({ basics: { ...basicsVacio, name: "Diego Gatica", links: ["https://dgatica.cl"] } }),
      parte({ basics: { ...basicsVacio, name: "OTRO NOMBRE", email: "diego@x.cl", links: ["https://dgatica.cl", "github.com/dgatica"] } }),
    ]);
    expect(m.basics.name).toBe("Diego Gatica"); // gana el primero no vacío
    expect(m.basics.email).toBe("diego@x.cl");  // hueco rellenado
    expect(m.basics.links).toEqual(["https://dgatica.cl", "github.com/dgatica"]); // sin duplicar
  });

  it("el resumen viaja SIEMPRE con su propia evidencia (no se cruzan)", () => {
    const m = mergeExtractions([
      parte({ basics: { ...basicsVacio, summary: "", summaryEvidence: "cita huérfana" } }),
      parte({ basics: { ...basicsVacio, summary: "Ocho años en pagos.", summaryEvidence: "ocho años construyendo pagos" } }),
    ]);
    expect(m.basics.summary).toBe("Ocho años en pagos.");
    expect(m.basics.summaryEvidence).toBe("ocho años construyendo pagos");
  });

  it("aptitudes: mismo grupo en dos ventanas → una fila, sin repetir aptitudes", () => {
    const m = mergeExtractions([
      parte({ skills: [{ group: "Lenguajes", items: "Go, Python", evidence: "Uso Go y Python" }] }),
      parte({ skills: [{ group: "Lenguajes", items: "Python, SQL, Go", evidence: "" }] }),
    ]);
    expect(m.skills).toHaveLength(1);
    expect(m.skills[0]!.items).toBe("Go, Python, SQL");
  });

  it("formación y proyectos también deduplican", () => {
    const edu = { degree: "Ingeniería Civil", institution: "UNAB", location: "", dates: "", evidence: "e" };
    const proj = { name: "idempotency-go", url: "", description: "", dates: "", evidence: "e" };
    const m = mergeExtractions([
      parte({ education: [edu], projects: [proj] }),
      parte({ education: [{ ...edu, dates: "2015 – 2019" }], projects: [{ ...proj, description: "librería" }] }),
    ]);
    expect(m.education).toHaveLength(1);
    expect(m.education[0]!.dates).toBe("2015 – 2019");
    expect(m.projects).toHaveLength(1);
    expect(m.projects[0]!.description).toBe("librería");
  });

  it("una sola ventana pasa tal cual, y cero ventanas no revienta", () => {
    const uno = parte({ work: [{ title: "X", company: "Y", location: "", dates: "", evidence: "e", bullets: [] }] });
    expect(mergeExtractions([uno])).toBe(uno);
    const cero = mergeExtractions([]);
    expect(cero.work).toEqual([]);
    expect(cero.basics.name).toBe("");
  });
});
