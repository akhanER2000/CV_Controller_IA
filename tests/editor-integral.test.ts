import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { planBiblioteca, tarjetaTextos, type MasterRow } from "../src/components/editor/modelo";

/**
 * EDITOR INTEGRAL — la biblioteca en pestañas (lógica pura) y la promesa de la
 * división: la pantalla solo compone; los manejadores y endpoints son los de
 * siempre (la equivalencia sobre datos reales la prueban las e2e).
 */

const fila = (id: string, kind: string, data: Record<string, unknown>, parent_id: string | null = null, sort_order = 0): MasterRow => ({
  id,
  kind,
  data,
  parent_id,
  sort_order,
});

const MASTER: MasterRow[] = [
  fila("s", "summary", { text: "Ingeniera backend con 6 años." }),
  fila("w1", "work", { title: "Backend Engineer", company: "Fintech Andina", dates: "2021 – 2024" }, null, 0),
  fila("b1", "bullet", { text: "Reduje la latencia p95 con Redis." }, "w1", 0),
  fila("b2", "bullet", { text: "Lideré la migración a Kubernetes." }, "w1", 1),
  fila("w2", "work", { title: "Desarrolladora", company: "Agencia Sur" }, null, 1),
  fila("b3", "bullet", { text: "Construí 12 sitios en Next.js." }, "w2", 0),
  fila("k", "skill", { group: "Backend", items: "Go, PostgreSQL, Redis, Kafka" }),
  fila("c", "certification", { name: "AWS SAA", issuer: "Amazon", dates: "2023" }),
];

describe("biblioteca · pestañas por tipo", () => {
  it("solo hay pestaña para los tipos que el master tiene, en orden", () => {
    const p = planBiblioteca(MASTER, "", new Set(), "todo");
    expect(p.map((x) => x.id)).toEqual(["summary", "work", "skills", "certifications"]);
  });

  it("las viñetas cuelgan de su rol (no son tarjetas sueltas) y se cuentan", () => {
    const work = planBiblioteca(MASTER, "", new Set(["w1", "b1"]), "todo").find((x) => x.id === "work")!;
    expect(work.tarjetas.map((t) => t.row.id)).toEqual(["w1", "w2"]);
    const w1 = work.tarjetas[0]!;
    expect(w1.vinetas.map((v) => v.row.id)).toEqual(["b1", "b2"]);
    expect([w1.vinetasDentro, w1.vinetasTotal]).toEqual([1, 2]);
    expect(w1.enVariante).toBe(true);
    expect(work.n).toBe(5); // 2 roles + 3 viñetas
  });

  it("filtro «en la variante» y «fuera»", () => {
    const dentro = new Set(["w1", "b1", "k"]);
    const d = planBiblioteca(MASTER, "", dentro, "dentro");
    expect(d.find((x) => x.id === "skills")!.tarjetas).toHaveLength(1);
    expect(d.find((x) => x.id === "summary")!.tarjetas).toHaveLength(0);
    const w = d.find((x) => x.id === "work")!.tarjetas;
    expect(w.map((t) => t.row.id)).toEqual(["w1"]);
    expect(w[0]!.vinetas.map((v) => v.row.id)).toEqual(["b1"]);
    // Fuera: el rol que está dentro sigue apareciendo si tiene viñetas fuera.
    const f = planBiblioteca(MASTER, "", dentro, "fuera").find((x) => x.id === "work")!.tarjetas;
    expect(f.map((t) => t.row.id)).toEqual(["w1", "w2"]);
    expect(f[0]!.vinetas.map((v) => v.row.id)).toEqual(["b2"]);
  });

  it("buscar una viñeta abre su rol; buscar el rol no", () => {
    const porVineta = planBiblioteca(MASTER, "kubernetes", new Set(), "todo").find((x) => x.id === "work")!;
    expect(porVineta.tarjetas.map((t) => t.row.id)).toEqual(["w1"]);
    expect(porVineta.tarjetas[0]!.abrir).toBe(true);
    const porRol = planBiblioteca(MASTER, "fintech", new Set(), "todo").find((x) => x.id === "work")!;
    expect(porRol.tarjetas[0]!.abrir).toBe(false);
    expect(porRol.tarjetas[0]!.vinetas).toHaveLength(2);
  });

  it("título y subtítulo útiles por tipo", () => {
    expect(tarjetaTextos("work", MASTER[1]!.data)).toEqual({ titulo: "Backend Engineer", sub: "Fintech Andina · 2021 – 2024" });
    expect(tarjetaTextos("skill", MASTER[6]!.data)).toEqual({ titulo: "Backend", sub: "Go, PostgreSQL, Redis, Kafka" });
    expect(tarjetaTextos("certification", MASTER[7]!.data)).toEqual({ titulo: "AWS SAA", sub: "Amazon · 2023" });
  });
});

describe("la pantalla solo compone", () => {
  const lee = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
  const pantalla = lee("../src/components/screens/EditorVarianteScreen.tsx");
  const editor = readdirSync(resolve(__dirname, "../src/components/editor"))
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => lee(`../src/components/editor/${f}`))
    .join("\n");

  it("EditorVarianteScreen no habla con la API ni guarda estado", () => {
    expect(pantalla).not.toMatch(/fetch\(|useState\(|useEffect\(/);
    for (const c of ["<BarraEditor", "<Biblioteca", "<Secciones", "<DocumentoPanel", "<VistaPrevia"]) expect(pantalla).toContain(c);
  });

  it("los mismos endpoints de siempre, en el hook", () => {
    for (const e of [
      "`/api/variants/${variantId}/items`",
      "`/api/variants/${variantId}/ajustar`",
      '"/api/cv"',
      '"/api/references"',
    ])
      expect(editor).toContain(e);
  });

  it("la barra reserva el hueco de «acciones de IA» junto a Ajustar páginas", () => {
    const flujo = lee("../src/components/FlujoCv.tsx");
    expect(flujo).toMatch(/fitOpen[\s\S]{0,400}data-ranura="acciones-ia"/);
  });

  it("la vista previa no pinta avisos en rojo: el estado va en UN StatusChip", () => {
    const vp = lee("../src/components/editor/VistaPrevia.tsx");
    expect(vp).not.toMatch(/className="warn"|pagesWarn|pagesOver|obj3Note/);
    expect(lee("../src/components/FlujoCv.tsx")).toContain("<StatusChip");
  });

  it("el selector de plantilla monta TemplateGallery tal cual", () => {
    expect(editor).toMatch(/<TemplateGallery\s/);
  });

  it("ningún color suelto en el CSS del editor", () => {
    const css = lee("../src/components/editor/editor.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
