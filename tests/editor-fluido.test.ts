import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ATAJOS, accionDeTecla, escribeTexto } from "../src/components/editor/atajos";
import {
  CENTRO_MIN,
  PV_ANCHO_MIN,
  alternarCompleto,
  alternarOculto,
  limitarAncho,
} from "../src/components/editor/vista-previa";
import { editor } from "../src/lib/i18n/dict/editor";

/**
 * EDITOR FLUIDO — lo que la presentación nueva promete: los atajos no se comen
 * lo que escribes, aceptar con el teclado es UNA decisión vista, la vista previa
 * nunca se come el centro, y todo texto nuevo existe en ES y EN. La equivalencia
 * de documento (mismos variant_items, misma huella de PDF) la prueba
 * tests/e2e/flujo-cv.spec.ts.
 */

const lee = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
// El editor de variante quedó dividido (editor-integral): la pantalla compone y el
// estado y los manejadores viven en src/components/editor/. Se lee TODO el editor.
const leeEditor = () =>
  ["../src/components/screens/EditorVarianteScreen.tsx", ...readdirSync(resolve(__dirname, "../src/components/editor"))
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => `../src/components/editor/${f}`)]
    .map(lee)
    .join("\n");
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("editor fluido · atajos", () => {
  it("una tecla sola es un atajo; con Ctrl/⌘/Alt no", () => {
    expect(accionDeTecla({ key: "j" })).toBe("siguiente");
    expect(accionDeTecla({ key: "J" })).toBe("siguiente");
    expect(accionDeTecla({ key: "a" })).toBe("aceptar");
    expect(accionDeTecla({ key: "p" })).toBe("preview");
    expect(accionDeTecla({ key: "f" })).toBe("completa");
    expect(accionDeTecla({ key: "b" })).toBe("biblioteca");
    expect(accionDeTecla({ key: "/" })).toBe("buscar");
    expect(accionDeTecla({ key: "?" })).toBe("ayuda");
    expect(accionDeTecla({ key: "a", ctrlKey: true })).toBeNull(); // Ctrl+A sigue siendo «seleccionar todo»
    expect(accionDeTecla({ key: "p", metaKey: true })).toBeNull();
    expect(accionDeTecla({ key: "x" })).toBeNull();
  });

  it("mientras escribes, la tecla es del texto (salvo Esc)", () => {
    for (const target of [
      { tagName: "INPUT", type: "text" },
      { tagName: "INPUT" },
      { tagName: "TEXTAREA" },
      { tagName: "SELECT" },
      { tagName: "SPAN", isContentEditable: true },
    ]) {
      expect(escribeTexto(target)).toBe(true);
      expect(accionDeTecla({ key: "a", target })).toBeNull();
      expect(accionDeTecla({ key: "j", target })).toBeNull();
      expect(accionDeTecla({ key: "Escape", target })).toBe("escape");
    }
    // Un botón o un checkbox no escriben: ahí sí.
    expect(accionDeTecla({ key: "j", target: { tagName: "BUTTON" } })).toBe("siguiente");
    expect(accionDeTecla({ key: "j", target: { tagName: "INPUT", type: "checkbox" } })).toBe("siguiente");
  });

  it("la ayuda lista cada atajo con su texto en ES y EN", () => {
    expect(ATAJOS.map((a) => a.tecla)).toEqual(["J", "A", "P", "F", "B", "/", "Esc"]);
    for (const a of ATAJOS) {
      expect(editor.es[a.clave]?.trim(), a.clave).toBeTruthy();
      expect(editor.en[a.clave]?.trim(), a.clave).toBeTruthy();
    }
  });

  it("A acepta UNA decisión: la marcada; sin marca, primero la enseña", () => {
    const src = sinComentarios(leeEditor());
    const i = src.indexOf("const aceptarActual");
    const cuerpo = src.slice(i, src.indexOf("});", src.indexOf("}, [actual", i)));
    expect(cuerpo).toContain(".find(");
    expect(cuerpo.match(/aceptarProp\(/g)?.length).toBe(1);
    expect(cuerpo).toMatch(/if \(!pr\) \{\s*irASiguiente\(\);\s*return;/);
    // Y sigue sin existir «aceptar todo».
    expect(src).not.toMatch(/\.(forEach|map)\([^)]*\)\s*=>\s*aceptarProp/);
  });

  it("los atajos no piden la propuesta: «Ajustar páginas» sigue siendo un clic", () => {
    const src = sinComentarios(leeEditor());
    const i = src.indexOf("// ── Atajos de teclado");
    const efecto = src.slice(i, src.indexOf("}, [pvModo", i));
    expect(efecto).not.toContain("runFit");
  });
});

describe("editor fluido · vista previa", () => {
  it("el ancho se limita: nunca menos que el mínimo ni a costa del centro", () => {
    expect(limitarAncho(100, 1200)).toBe(PV_ANCHO_MIN);
    expect(limitarAncho(500, 1200)).toBe(500);
    expect(limitarAncho(1000, 1200)).toBe(1200 - CENTRO_MIN);
    // Sin sitio, gana el mínimo de la vista previa (el CSS colapsa a una columna).
    expect(limitarAncho(600, 500)).toBe(PV_ANCHO_MIN);
  });

  it("P alterna al lado ↔ oculta; F alterna pantalla completa", () => {
    expect(alternarOculto("lado")).toBe("oculto");
    expect(alternarOculto("oculto")).toBe("lado");
    expect(alternarOculto("completo")).toBe("lado");
    expect(alternarCompleto("lado")).toBe("completo");
    expect(alternarCompleto("completo")).toBe("lado");
    expect(alternarCompleto("oculto")).toBe("completo");
  });

  it("la vista previa sigue siendo el PDF de /api/cv (el mismo body que la descarga)", () => {
    const src = sinComentarios(leeEditor());
    expect(src).toContain('<iframe className="pv-frame" src={pdfUrl}');
    expect(src).toContain('body: JSON.stringify({ data: resumeRef.current, as: "preview", paginas: objetivoRef.current })');
    expect(src).toContain('body: JSON.stringify({ data: resumeRef.current, download: true, paginas: objetivoRef.current })');
  });
});

describe("editor fluido · presentación", () => {
  const src = sinComentarios(leeEditor());

  it("la biblioteca es un cajón cerrado por defecto", () => {
    expect(src).toContain("const [libAbierta, setLibAbierta] = useState(false);");
    expect(src).toMatch(/\{ed\.libAbierta && <Biblioteca ed=\{ed\} \/>\}/);
    expect(src).toContain('<aside className="ed-col ed-col--lib" id="edLib"');
  });

  it("«sin respaldo» va contado por sección, no un chip por grupo", () => {
    expect(src).toContain("<HuecosSeccion");
    expect(src).not.toContain("HuecosAptitud");
    const comp = sinComentarios(lee("../src/components/FlujoCv.tsx"));
    expect(comp).toContain('f.tipo !== "sin-respaldo"');
  });

  it("el objetivo de páginas vive en la barra con las tres opciones", () => {
    expect(src).toMatch(/id="pvObjetivo"[\s\S]{0,400}OBJETIVOS\.map/);
    expect(editor.es["editor.edSeg1"]).toBe("1 pág");
    expect(editor.es["editor.edSegN"]).toBe("{n} págs");
  });

  it("los textos nuevos del editor existen en ES y en EN", () => {
    const claves = Object.keys(editor.es).filter((k) => k.startsWith("editor.ed") && /^editor\.ed[A-Z]/.test(k));
    expect(claves.length).toBeGreaterThan(40);
    for (const k of claves) expect(editor.en[k]?.trim(), k).toBeTruthy();
  });

  it("el CSS nuevo usa solo tokens: ningún hex ni rgba suelto", () => {
    for (const f of ["../src/components/editor/editor.css", "../src/components/FlujoCv.css"]) {
      const css = lee(f).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css, f).not.toMatch(/rgba?\(/);
    }
  });
});
