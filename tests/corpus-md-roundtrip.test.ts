import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { exportarCorpusMd, parsearCorpusMd, plantillaVacia, type ItemParaExportar } from "@/lib/corpus-md";

/* ============================================================================
   EL CÍRCULO COMPLETO · exportar → parsear → comparar.

   El criterio no admite matices: CERO diferencias sobre el objeto `data`
   COMPLETO, campo por campo, más el kind, la jerarquía y la procedencia. Se
   compara el objeto entero y no una versión «normalizada» porque normalizar es
   exactamente cómo un test se queda verde mientras el dato se degrada — y si el
   round-trip degrada los datos, el formato no sirve para nada.
   ============================================================================ */

const here = path.dirname(fileURLToPath(import.meta.url));

/** Un master de juguete que toca los diez kinds y todas las formas difíciles. */
const MASTER: ItemParaExportar[] = [
  {
    id: "b1", kind: "basics", sortOrder: 0,
    data: {
      name: "Akhan Lorenzo Espinoza",
      label: "AI/ML Engineer",
      email: "akhan@ejemplo.cl",
      phone: "+56 9 5612 1922",
      location: "Valparaíso, Chile",
      // Las dos formas conviven a propósito: string suelto y {label,url}.
      links: ["https://github.com/akhanER2000", { label: "LinkedIn", url: "https://linkedin.com/in/akhan" }],
    },
    origin: "manual", evidenceVerified: true,
  },
  {
    id: "s1", kind: "summary", sortOrder: 1,
    data: { text: "Ingeniero civil en computación.\nConstruyo sistemas RAG anclados a normativa real." },
    origin: "extracted", evidenceSnippet: "Ingeniero civil en computación", evidenceVerified: true,
    sourceId: "11111111-2222-3333-4444-555555555555", evidencePage: 2,
  },
  {
    id: "w1", kind: "work", sortOrder: 2,
    data: {
      title: "Founder & AI Engineer", company: "PharmIQ", location: "Valparaíso, Chile",
      dates: "abr 2026 – actualidad",
      // Banderas derivadas: no las escribe un humano, pero no se pueden perder.
      dateStart: "2026-04", dateCurrent: true, dateByHuman: true,
    },
    origin: "extracted", evidenceSnippet: "Founder & AI Engineer — PharmIQ", evidenceVerified: false,
  },
  { id: "v1", kind: "bullet", parentId: "w1", sortOrder: 3, data: { text: "Reduje la latencia p99 de 850 ms a 180 ms." }, origin: "extracted", evidenceSnippet: "850 ms a 180 ms", evidenceVerified: true },
  { id: "v2", kind: "bullet", parentId: "w1", sortOrder: 4, data: { text: "Asistente RAG anclado al MINSAL." }, origin: "manual", evidenceVerified: true },
  { id: "k1", kind: "skill", sortOrder: 5, data: { group: "Lenguajes", items: "Python, TypeScript, SQL" }, origin: "manual", evidenceVerified: true },
  { id: "k2", kind: "skill", sortOrder: 6, data: { group: "IA y LLMs", items: "RAG, LangChain, Ollama", sourceContext: "PharmIQ" }, origin: "api", evidenceVerified: true },
  { id: "e1", kind: "education", sortOrder: 7, data: { degree: "Ingeniería Civil en Computación", institution: "Universidad Andrés Bello", location: "", dates: "2022 - 2026" }, origin: "extracted", evidenceSnippet: "UNAB", evidenceVerified: true },
  { id: "p1", kind: "project", sortOrder: 8, data: { name: "AeroFit", description: "Evaluación de aptitud médica aeronáutica.", url: "https://github.com/akhanER2000/aerofit", dates: "2026", dateMissing: false }, origin: "manual", evidenceVerified: true },
  { id: "v3", kind: "bullet", parentId: "p1", sortOrder: 9, data: { text: "Recall 0,65 en la clase de riesgo." }, origin: "manual", evidenceVerified: true },
  { id: "c1", kind: "certification", sortOrder: 10, data: { name: "Ethical Hacker", issuer: "Cisco", dates: "2026-06" }, origin: "manual", evidenceVerified: true },
  { id: "i1", kind: "language", sortOrder: 11, data: { language: "Inglés", level: "profesional (B2)" }, origin: "manual", evidenceVerified: true },
  { id: "r1", kind: "reference", sortOrder: 12, data: { name: "Nombre Apellido", role: "Jefe de proyecto", org: "Tesseract", relation: "jefe directo", email: "jefe@ejemplo.cl", phone: "" }, origin: "manual", evidenceVerified: true },
];

/** El viaje completo, tal cual lo hace el producto. */
function viaje(items: ItemParaExportar[]) {
  const md = exportarCorpusMd(items);
  const r = parsearCorpusMd(md);
  return { md, r };
}

/** Empareja lo parseado con lo original por posición dentro de su kind. */
function comparar(orig: ItemParaExportar[], parseado: ReturnType<typeof parsearCorpusMd>) {
  const difs: string[] = [];
  const usados = new Set<number>();
  for (const o of orig) {
    const idx = parseado.items.findIndex((p, i) => {
      if (usados.has(i)) return false;
      if (p.kind !== o.kind) return false;
      // Se empareja por el contenido, no por id: el .md no lleva ids.
      return JSON.stringify(p.data) === JSON.stringify(o.data) || i >= 0;
    });
    if (idx < 0) { difs.push(`${o.kind} «${JSON.stringify(o.data).slice(0, 50)}» no apareció al volver`); continue; }
    usados.add(idx);
    const p = parseado.items[idx]!;
    // ★ El objeto data COMPLETO, campo por campo. Nada de normalizar.
    for (const [k, v] of Object.entries(o.data)) {
      if (JSON.stringify(p.data[k]) !== JSON.stringify(v)) {
        difs.push(`${o.kind}.${k}: esperaba ${JSON.stringify(v)} y volvió ${JSON.stringify(p.data[k])}`);
      }
    }
    for (const k of Object.keys(p.data)) {
      if (!(k in o.data)) difs.push(`${o.kind}.${k}: apareció de la nada (${JSON.stringify(p.data[k])})`);
    }
    // Y la procedencia, que es lo que el encargo dice que invalida el formato.
    const oOrigin = o.origin ?? "manual";
    if ((p.origin ?? "manual") !== oOrigin) difs.push(`${o.kind}: origin ${oOrigin} → ${p.origin}`);
    const oEv = o.evidenceSnippet ?? null;
    if ((p.evidenceSnippet ?? null) !== oEv) difs.push(`${o.kind}: evidencia «${oEv}» → «${p.evidenceSnippet}»`);
    if ((p.evidenceVerified ?? true) !== (o.evidenceVerified ?? true)) difs.push(`${o.kind}: verificada ${o.evidenceVerified} → ${p.evidenceVerified}`);
    if ((p.sourceId ?? null) !== (o.sourceId ?? null)) difs.push(`${o.kind}: fuente ${o.sourceId} → ${p.sourceId}`);
    if ((p.evidencePage ?? null) !== (o.evidencePage ?? null)) difs.push(`${o.kind}: página ${o.evidencePage} → ${p.evidencePage}`);
  }
  return difs;
}

describe("★ round-trip corpus/1 · exportar → parsear → cero diferencias", () => {
  it("los diez kinds vuelven idénticos, campo por campo", () => {
    const { r } = viaje(MASTER);
    expect(r.ok, "el export no se reconoce como corpus/1").toBe(true);
    expect(r.formato).toBe("corpus/1");
    const difs = comparar(MASTER, r);
    expect(difs, `DIFERENCIAS:\n  ${difs.join("\n  ")}`).toEqual([]);
  });

  it("la jerarquía sobrevive: cada viñeta vuelve colgando de SU rol", () => {
    const { r } = viaje(MASTER);
    const bullets = r.items.filter((i) => i.kind === "bullet");
    expect(bullets).toHaveLength(3);
    for (const b of bullets) {
      expect(b.parentIndex, `viñeta «${b.data.text}» volvió huérfana`).toBeTypeOf("number");
      const padre = r.items[b.parentIndex!]!;
      expect(["work", "project"]).toContain(padre.kind);
    }
    // La de AeroFit cuelga del proyecto, no del rol: si el exportador escribiera
    // todas las viñetas seguidas, esta se pegaría al bloque equivocado.
    const recall = bullets.find((b) => String(b.data.text).includes("Recall"))!;
    expect(r.items[recall.parentIndex!]!.data.name).toBe("AeroFit");
  });

  it("★ un item extraído NO vuelve convertido en «manual» a secas", () => {
    // El requisito literal del encargo. Es lo que separa un formato que sirve de
    // uno que pierde la procedencia por el camino.
    const { r } = viaje(MASTER);
    const sum = r.items.find((i) => i.kind === "summary")!;
    expect(sum.origin).toBe("extracted");
    expect(sum.evidenceSnippet).toBe("Ingeniero civil en computación");
    expect(sum.sourceId).toBe("11111111-2222-3333-4444-555555555555");
    expect(sum.evidencePage).toBe(2);
  });

  it("las banderas derivadas de fecha viajan sin cambiar de tipo (true ≠ «true»)", () => {
    const { r } = viaje(MASTER);
    const w = r.items.find((i) => i.kind === "work")!;
    expect(w.data.dateCurrent).toBe(true);
    expect(w.data.dateByHuman).toBe(true);
    expect(w.data.dateStart).toBe("2026-04");
    expect(w.data.dates).toBe("abr 2026 – actualidad");
    const p = r.items.find((i) => i.kind === "project")!;
    expect(p.data.dateMissing).toBe(false);
  });

  it("los enlaces conservan su forma: string suelto sigue string, objeto sigue objeto", () => {
    const { r } = viaje(MASTER);
    const b = r.items.find((i) => i.kind === "basics")!;
    expect(b.data.links).toEqual([
      "https://github.com/akhanER2000",
      { label: "LinkedIn", url: "https://linkedin.com/in/akhan" },
    ]);
  });

  it("el CSV de una habilidad vuelve con el mismo orden y los mismos espacios", () => {
    const { r } = viaje(MASTER);
    const k = r.items.filter((i) => i.kind === "skill");
    expect(k[0]!.data.items).toBe("Python, TypeScript, SQL");
    expect(k[1]!.data.sourceContext).toBe("PharmIQ");
  });

  it("un texto multilínea sobrevive al viaje", () => {
    const { r } = viaje(MASTER);
    const s = r.items.find((i) => i.kind === "summary")!;
    expect(s.data.text).toBe("Ingeniero civil en computación.\nConstruyo sistemas RAG anclados a normativa real.");
  });

  it("★ MUTANTE: si el exportador se comiera una clave, el test lo caza", () => {
    // Prueba de que la comparación es de verdad campo por campo y no un
    // «parece igual». Se simula la pérdida quitando una clave del original.
    const roto = MASTER.map((i) => (i.kind === "work" ? { ...i, data: { ...i.data } } : i));
    const { r } = viaje(roto);
    const w = r.items.find((i) => i.kind === "work")!;
    delete (w.data as Record<string, unknown>).dateStart;
    const difs = comparar(roto, { ...r, items: r.items });
    expect(difs.length, "quitar dateStart debería producir una diferencia").toBeGreaterThan(0);
  });

  it("la plantilla vacía es un corpus/1 válido y no trae datos inventados", () => {
    const t = plantillaVacia();
    const r = parsearCorpusMd(t);
    expect(r.ok).toBe(true);
    expect(r.formato).toBe("corpus/1");
    // Los ejemplos van entre corchetes: se ven a la legua, y quien no los
    // sustituya verá «[Tu nombre]» en su CV — un fallo evidente, no silencioso.
    expect(t).toContain("[Tu nombre completo]");
    expect(t.toLowerCase()).toContain("no lo inventes");
  });
});

describe("corpus/1 · el parser no puede llamar a un modelo", () => {
  it("★ ningún módulo de corpus-md importa IA (lo responde el build, no una persona)", () => {
    const dir = path.join(here, "../src/lib/corpus-md");
    const prohibidos = [/from\s+["']ai["']/, /@ai-sdk\//, /lib\/extract\/llm/, /lib\/ai\/modelos/, /generateObject|generateText/];
    const malos: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(path.join(dir, f), "utf8");
      // Se ignoran los comentarios: este módulo EXPLICA que no usa IA, y esas
      // menciones no son imports.
      const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const re of prohibidos) {
        if (re.test(codigo)) malos.push(`${f} → ${re}`);
      }
    }
    expect(malos, `corpus-md tiene que ser 100% determinista:\n  ${malos.join("\n  ")}`).toEqual([]);
  });
});
