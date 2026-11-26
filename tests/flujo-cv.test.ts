import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  contarPendientes,
  estadoDoc,
  huecosPorItem,
  propuestasEnLinea,
  siguienteIndice,
  type Fit,
  type FitMark,
} from "../src/components/flujo-cv";
import { calcularFaltas, itemDeAjuste } from "../src/lib/cv/ajuste";
import { editor } from "../src/lib/i18n/dict/editor";

/**
 * FLUJO DEL CV — las decisiones viven en el documento (flujo-cv.ts + FlujoCv.tsx).
 * Lo que se prueba aquí es lo que el flujo nuevo PROMETE no cambiar: cada decisión
 * sigue siendo una y del usuario, el acortado sigue pasando por el candado del
 * servidor, «qué falta» es la misma función que en el servidor, y lo verificado
 * no vuelve a pedirse. La equivalencia con el flujo anterior sobre datos reales la
 * prueba tests/e2e/flujo-cv.spec.ts.
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

const fit = (over: Partial<Fit> = {}): Fit => ({
  paginas: 2,
  paginasObjetivo: 1,
  sobran: 9,
  quitar: [{ id: "v3", kind: "bullet", texto: "Mantuve la documentación.", motivo: "poco ligada al rol" }],
  reordenar: [
    { id: "v5", kind: "bullet", texto: "Automaticé despliegues.", parentId: "w2", desde: 1, hasta: 0 },
    { id: "v4", kind: "bullet", texto: "Construí 12 sitios.", parentId: "w2", desde: 0, hasta: 1 },
  ],
  acortar: [
    { id: "v2", kind: "bullet", campo: "text", original: "largo largo", propuesto: "largo", motivo: "", ahorro: 6 },
  ],
  falta: [],
  descartados: [],
  notas: "",
  ...over,
});
const items = (verificado: string[] = []) =>
  ["v2", "v3", "v4", "v5"].map((id) => ({ id, override_verified: verificado.includes(id) }));

describe("flujo-cv · la propuesta se reparte sobre los items", () => {
  it("cada propuesta va bajo SU item, en orden quitar → mover → acortar", () => {
    const m = propuestasEnLinea(fit(), items(), {});
    expect([...m.keys()].sort()).toEqual(["v2", "v3", "v4", "v5"]);
    expect(m.get("v3")!.map((p) => p.clave)).toEqual(["q:v3"]);
    expect(m.get("v2")!.map((p) => p.clave)).toEqual(["a:v2"]);
    expect(contarPendientes(m)).toBe(4);
  });

  it("una decisión tomada (aceptada o rechazada) desaparece; las demás siguen, una a una", () => {
    const hechas: Record<string, FitMark> = { "q:v3": "ok", "a:v2": "no" };
    const m = propuestasEnLinea(fit(), items(), hechas);
    expect(m.has("v3")).toBe(false);
    expect(m.has("v2")).toBe(false);
    expect(contarPendientes(m)).toBe(2);
  });

  it("un acortado revertido («undo») vuelve a estar abierto", () => {
    const m = propuestasEnLinea(fit(), items(["v2"]), { "a:v2": "undo" });
    expect(m.get("v2")!.map((p) => p.tipo)).toEqual(["a"]);
  });

  it("lo ya verificado no exige revisión: sin propuesta de acortado sobre un texto que pasó el candado", () => {
    const m = propuestasEnLinea(fit(), items(["v2"]), {});
    expect(m.has("v2")).toBe(false);
    // …pero quitarlo sigue siendo una decisión legítima del usuario.
    const q = propuestasEnLinea(fit({ quitar: [{ id: "v2", kind: "bullet", texto: "", motivo: "" }] }), items(["v2"]), {});
    expect(q.get("v2")!.map((p) => p.tipo)).toEqual(["q"]);
  });

  it("un reordenado que el orden actual ya cumple no pide decisión (aceptarlo era un no-op)", () => {
    const pos = new Map([
      ["v5", 0],
      ["v4", 1],
    ]);
    const m = propuestasEnLinea(fit(), items(), {}, pos);
    expect(m.has("v5")).toBe(false);
    expect(m.has("v4")).toBe(false);
  });

  it("una propuesta sobre un item que ya no está en la variante no se enseña", () => {
    const m = propuestasEnLinea(fit(), items().filter((i) => i.id !== "v3"), {});
    expect(m.has("v3")).toBe(false);
  });

  it("sin análisis no hay propuestas", () => {
    expect(propuestasEnLinea(null, items(), {}).size).toBe(0);
  });
});

describe("flujo-cv · «qué falta» es la MISMA función del servidor, aplicada en el cliente", () => {
  it("los huecos se agrupan por item para pintarlos sobre él", () => {
    const vitems = [
      { id: "w2", item_id: "m-w2", kind: "work", visible: true, sort_order: 1, parent_id: null, data: { title: "Dev", company: "Sur", dates: "" } },
      { id: "b1", item_id: "m-b1", kind: "bullet", visible: true, sort_order: 2, parent_id: "m-w2", data: { text: "Mantuve la documentación." } },
      { id: "b2", item_id: "m-b2", kind: "bullet", visible: true, sort_order: 3, parent_id: "m-w2", data: { text: "Construí 12 sitios en Next.js." } },
      { id: "sk", item_id: "m-sk", kind: "skill", visible: true, sort_order: 4, parent_id: null, data: { group: "Backend", items: "Next.js, Kafka" } },
    ];
    const h = huecosPorItem(calcularFaltas(vitems.map(itemDeAjuste)));
    expect(h.get("w2")!.map((f) => f.tipo)).toEqual(["sin-fecha"]);
    expect(h.get("b1")!.map((f) => f.tipo)).toEqual(["sin-cifra"]);
    expect(h.has("b2")).toBe(false);
    expect(h.get("sk")![0]!.detalle).toBe("Kafka");
  });

  it("el editor no reimplementa calcularFaltas: la importa de ajuste.ts", () => {
    const src = sinComentarios(leeEditor());
    expect(src).toContain('import("@/lib/cv/ajuste")');
    expect(src).not.toMatch(/function\s+calcularFaltas/);
  });
});

describe("flujo-cv · las garantías del flujo anterior siguen en pie", () => {
  const src = sinComentarios(leeEditor());
  const comp = sinComentarios(lee("../src/components/FlujoCv.tsx"));

  it("aceptar un acortado sigue yendo al servidor (accion 'acortar' → verificarAcortado) y solo cambia el texto si dice que sí", () => {
    const i = src.indexOf("const fitAcceptShorten");
    const cuerpo = src.slice(i, src.indexOf("const fitRevertShorten", i));
    expect(cuerpo).toContain('accion: "acortar"');
    expect(cuerpo.indexOf("if (!res.ok) throw")).toBeGreaterThan(-1);
    expect(cuerpo.indexOf("if (!res.ok) throw")).toBeLessThan(cuerpo.indexOf("setItems("));
    const ruta = sinComentarios(lee("../src/app/api/variants/[id]/ajustar/route.ts"));
    expect(ruta).toContain("verificarAcortado(");
  });

  it("cada propuesta se acepta con el MISMO manejador que en el panel anterior", () => {
    const i = src.indexOf("const aceptarProp");
    const cuerpo = src.slice(i, src.indexOf("const propsDe", i));
    expect(cuerpo).toContain("fitAcceptDrop(pr.p)");
    expect(cuerpo).toContain("fitAcceptMove(pr.p)");
    expect(cuerpo).toContain("fitAcceptShorten(pr.p)");
  });

  it("no existe «aceptar todo»: ningún bucle aplica propuestas", () => {
    expect(src).not.toMatch(/\.(forEach|map)\([^)]*\)\s*=>\s*aceptarProp/);
    expect(src).not.toMatch(/for\s*\([^)]*\)\s*\{?[^}]*aceptarProp/);
    expect(comp).not.toMatch(/aceptar ?todo|accept ?all/i);
  });

  it("pedir la propuesta sigue siendo manual: nada llama a runFit desde un efecto", () => {
    const efectos = src.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
    expect(efectos.filter((e) => e.includes("runFit")).length).toBe(0);
  });

  it("el panel de cuatro listas ya no está (su copia local vive en _to_delete/flujo-cv/)", () => {
    expect(src).not.toContain('className="c-card fit"');
    expect(src).not.toContain('id="edFit"');
  });

  it("el CSS del flujo usa solo tokens: ningún hex suelto", () => {
    const css = lee("../src/components/FlujoCv.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgba?\(/);
  });

  it("los textos nuevos existen en ES y en EN", () => {
    const claves = Object.keys(editor.es).filter((k) => k.startsWith("editor.flu"));
    expect(claves.length).toBeGreaterThan(20);
    for (const k of claves) expect(editor.en[k]?.trim(), k).toBeTruthy();
  });
});

describe("flujo-cv · la guía", () => {
  const base = { busy: false, error: "", paginas: 2, objetivo: 2, autofit: null };
  it("dice el estado del PDF REAL", () => {
    expect(estadoDoc({ ...base, busy: true, paginas: 0 })).toBe("midiendo");
    expect(estadoDoc({ ...base, error: "x" })).toBe("error");
    expect(estadoDoc({ ...base, paginas: 0 })).toBe("vacio");
    expect(estadoDoc(base)).toBe("cabe");
    expect(estadoDoc({ ...base, paginas: 3 })).toBe("excede");
    expect(
      estadoDoc({ ...base, paginas: 3, autofit: { bodySize: 10, base: 11, noCabe: true, objetivo: 2, sobran: 12 } }),
    ).toBe("no-cabe");
  });

  it("«Siguiente» recorre las decisiones en orden de lectura y vuelve al principio", () => {
    expect(siguienteIndice([], 0)).toBe(-1);
    expect(siguienteIndice([100, 300, 500], 0)).toBe(0);
    expect(siguienteIndice([100, 300, 500], 100)).toBe(1);
    expect(siguienteIndice([100, 300, 500], 500)).toBe(0);
  });
});
