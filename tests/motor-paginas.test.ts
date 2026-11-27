import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDocumentProxy } from "unpdf";
import type { ResumeData } from "../src/lib/cv/resume";
import { autofit, plantillaDe, type ResultadoAutofit } from "../src/lib/cv/autofit";
import { CUERPO_MIN_PT } from "../src/lib/cv/templates";
import { normalizarReglas, type Reglas } from "../src/lib/cv/reglas";
import { verificarCondensado, type AjusteItem, type CondensarLLM } from "../src/lib/cv/ajuste";
import { prioridades, resolverPaginas, simularPlan, terminosDe, textoChoque } from "../src/lib/cv/motor-paginas";
import { motorPaginas } from "../src/lib/i18n/dict/motor-paginas";

/**
 * EL MOTOR DE PÁGINAS (DA-A6): N páginas pedidas = N páginas, SIEMPRE.
 *   · el candado «condensar»: nada nuevo, más corto, sin términos excluidos;
 *   · la prioridad para el título objetivo: «incluir siempre» es fijo, y el rol de
 *     una viñeta protegida, y la primera viñeta de un rol protegido;
 *   · sobre el PDF REAL (react-pdf + medir.ts), con un CV que ni el catálogo ni la
 *     plantilla a medida dejan en 2 páginas: el motor termina en 1, 2 y 3 páginas
 *     reales a ≥ 10 pt, sin tocar lo protegido, sin el término excluido y usando
 *     solo los textos condensados que pasan el candado;
 *   · si ni lo mínimo cabe, dice qué regla choca con cuál, con la medida.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const ejemplo = JSON.parse(readFileSync(path.join(here, "../src/lib/cv/fixtures/datos-ejemplo.json"), "utf8")) as ResumeData;
const RELLENO = " en coordinación con los equipos de producto, diseño y operaciones, documentando cada decisión técnica para el equipo";

/** Un CV con `n` empleos de más (viñetas únicas y de dos líneas) y sus items de variante. */
function cvGrande(n: number): ResumeData {
  const d = structuredClone(ejemplo);
  d.templateId = "ats-clasica";
  for (let i = 0; i < n; i++) {
    const w = structuredClone(ejemplo.work[1]!);
    const letra = String.fromCharCode(65 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
    w.company = `Empresa Extra ${letra}`;
    w.bullets = w.bullets.map((b) => ({ ...b, es: `${b.es.replace(/\.$/, "")}${RELLENO} de la sede ${letra}.`, en: `${b.en} (site ${letra})` }));
    d.work.push(w);
  }
  return d;
}

function itemsDe(d: ResumeData): AjusteItem[] {
  const out: AjusteItem[] = [];
  let k = 0;
  const mk = (kind: string, datos: Record<string, unknown>, parentId: string | null, campo: string | null, original: string, texto: string): AjusteItem => {
    k += 1;
    return { id: `v${k}`, itemId: `m${k}`, kind, visible: true, sortOrder: k, parentId, datos, texto, campo, original, origen: null, verificado: false };
  };
  out.push(mk("basics", { name: d.basics.name }, null, null, "", d.basics.name));
  out.push(mk("summary", { text: d.basics.summary.es }, null, "text", d.basics.summary.es, d.basics.summary.es));
  for (const w of d.work) {
    const wi = mk("work", { company: w.company, title: w.title.es, dates: w.dates.es }, null, null, "", `${w.title.es} · ${w.company}`);
    out.push(wi);
    for (const b of w.bullets) out.push(mk("bullet", { text: b.es }, wi.itemId, "text", b.es, b.es));
  }
  for (const s of d.skills) out.push(mk("skill", { group: s.group.es, items: s.items.es }, null, null, "", `${s.group.es}: ${s.items.es}`));
  for (const p of d.projects) {
    const [name, ...rest] = p.es.split(" — ");
    out.push(mk("project", { name, description: rest.join(" — ") }, null, "description", rest.join(" — "), p.es));
  }
  for (const e of d.education) out.push(mk("education", { degree: e.title.es, institution: e.org, dates: e.dates.es }, null, null, "", `${e.title.es} · ${e.org}`));
  return out;
}

const paginasDe = async (b64: string) => (await getDocumentProxy(new Uint8Array(Buffer.from(b64, "base64")))).numPages;

describe("candado «condensar»", () => {
  const o = "Reduje la latencia p99 del checkout de 850 ms a 210 ms migrando a Kafka y Redis.";
  it("acepta omitir (una cifra o una tecnología pueden caer)", () => {
    expect(verificarCondensado(o, "Reduje la latencia p99 del checkout a 210 ms con Kafka.").ok).toBe(true);
  });
  it("rechaza lo NUEVO: cifra, nombre o tecnología que no están en el texto ni en la evidencia", () => {
    expect(verificarCondensado(o, "Reduje la latencia p99 a 90 ms con Kafka.").ok).toBe(false);
    expect(verificarCondensado(o, "Reduje la latencia con Kafka en AWS.").ok).toBe(false);
    expect(verificarCondensado(o, "Reduje la latencia con Kafka y Docker.").ok).toBe(false);
    // La evidencia (el rol) sí puede aportar la sigla.
    expect(verificarCondensado(o, "Como SRE, reduje la latencia con Kafka.", "SRE · Rayén Retail").ok).toBe(true);
  });
  it("rechaza lo que no es más corto, lo vacío y lo que nombra un término excluido", () => {
    expect(verificarCondensado(o, o).ok).toBe(false);
    expect(verificarCondensado(o, "  ").ok).toBe(false);
    expect(verificarCondensado(o, "Migré a Kafka.", "", (s) => (/kafka/i.test(s) ? "Kafka" : null)).ok).toBe(false);
  });
});

describe("prioridad para el título objetivo", () => {
  const d = cvGrande(2);
  const items = itemsDe(d);
  const rol = items.find((i) => i.kind === "work")!;
  const vinetasRol = items.filter((i) => i.parentId === rol.itemId);
  const proyecto = items.find((i) => i.kind === "project")!;
  const p = prioridades(items, "Backend Developer", new Set([rol.itemId, proyecto.itemId]));
  it("«incluir siempre» y el contacto son fijos (nunca se quitan)", () => {
    expect(p.get(rol.id)!.fijo).toBe(true);
    expect(p.get(proyecto.id)!.fijo).toBe(true);
    expect(p.get(items[0]!.id)!.fijo).toBe(true);
  });
  it("la primera viñeta de un rol protegido es fija; las demás, de lo último en irse", () => {
    expect(p.get(vinetasRol[0]!.id)!.fijo).toBe(true);
    const otra = p.get(vinetasRol[1]!.id)!;
    expect(otra.fijo).toBe(false);
    const ajena = items.find((i) => i.kind === "bullet" && i.parentId !== rol.itemId)!;
    expect(otra.valor).toBeGreaterThan(p.get(ajena.id)!.valor);
  });
  it("términos del título sin palabras vacías", () => {
    expect(terminosDe("Ingeniero de IA para el área de Datos")).toEqual(["ingeniero", "ia", "area", "datos"]);
  });
});

describe("simularPlan", () => {
  it("quita lo oculto, condensa en los DOS idiomas y vuelve a aplicar las reglas", () => {
    const d = cvGrande(1);
    const items = itemsDe(d);
    const b = items.filter((i) => i.kind === "bullet");
    const reglas = normalizarReglas({ excluirTerminos: ["Godot"] });
    const sim = simularPlan(
      d,
      items,
      {
        ocultar: [{ id: b[0]!.id, kind: "bullet", texto: b[0]!.texto, motivo: "debil" }],
        reescribir: [
          { id: b[1]!.id, kind: "bullet", campo: "text", original: b[1]!.original, propuesto: "Corto." },
          { id: b[2]!.id, kind: "bullet", campo: "text", original: b[2]!.original, propuesto: "Con Godot." },
        ],
      },
      reglas,
    );
    const todas = sim.work.flatMap((w) => w.bullets);
    expect(todas.some((x) => x.es === b[0]!.original)).toBe(false);
    expect(todas.some((x) => x.es === "Corto." && x.en === "Corto.")).toBe(true);
    expect(JSON.stringify(sim)).not.toMatch(/Godot/);
  });
});

describe("simularPlan · un proyecto cuya URL no sale en el PDF", () => {
  it("★ se quita igual (antes la simulación lo daba por «no impreso» y lo dejaba)", () => {
    const d = cvGrande(0);
    const items = itemsDe(d).map((i) => (i.kind === "project" ? { ...i, datos: { ...i.datos, url: "https://no-se-imprime.example/x" } } : i));
    const proyectos = items.filter((i) => i.kind === "project");
    const sim = simularPlan(d, items, { reescribir: [], ocultar: proyectos.map((p) => ({ id: p.id, kind: "project", texto: p.texto, motivo: "peso" as const })) }, normalizarReglas({}));
    expect(sim.projects).toEqual([]);
  });
});

describe("motor sobre el PDF REAL: N páginas = N páginas", () => {
  let d: ResumeData;
  let items: AjusteItem[];
  let reglas: Reglas;
  const actual: Record<number, ResultadoAutofit> = {};
  const llamadas: number[] = [];
  /** Un modelo de mentira: uno bien (omite), uno que inventa una cifra, uno con el término excluido. */
  const condensar: CondensarLLM = async ({ items: pedidos }) => {
    llamadas.push(pedidos.length);
    return {
      items: pedidos.map((p, i) => ({
        id: p.id,
        texto: i % 5 === 1 ? `${p.texto.slice(0, 30)} con 99 % más` : i % 5 === 2 ? "Lo hice con Godot." : p.texto.split(RELLENO)[0]!.slice(0, p.max),
      })),
    };
  };
  beforeAll(async () => {
    d = cvGrande(14);
    items = itemsDe(d);
    const proteger = items.filter((i) => i.kind === "work").slice(0, 2).map((i) => i.itemId);
    reglas = normalizarReglas({ paginasMax: 2, incluirSiempre: proteger, excluirTerminos: ["Godot"] });
    for (const o of [1, 2, 3]) actual[o] = await autofit(d, plantillaDe(d), o);
  }, 600000);

  it("el caso: a 10 pt no cabe ni en 3", () => {
    expect(actual[3]!.noCabe).toBe(true);
    expect(actual[2]!.bodySize).toBe(CUERPO_MIN_PT);
  });

  for (const objetivo of [2, 1, 3]) {
    it(`★ objetivo ${objetivo}: termina en ${objetivo} páginas REALES a ≥ 10 pt, sin tocar lo protegido`, async () => {
      const pasos: number[] = [];
      const r = await resolverPaginas({
        data: d,
        objetivo,
        actual: actual[objetivo]!,
        items,
        reglas: { ...reglas, paginasMax: objetivo as 1 | 2 | 3 },
        targetTitle: "Backend Developer",
        condensar: objetivo === 2 ? condensar : undefined,
        topeMs: 4000,
        onProgreso: (p) => pasos.push(p.paso),
      });
      expect(r.cabe, r.razon ?? "").toBe(true);
      expect(r.resueltoPor).toBe("motor");
      expect(r.cuerpo).toBeGreaterThanOrEqual(CUERPO_MIN_PT);
      // La medida es del PDF que devuelve, no de una estimación.
      expect(await paginasDe(r.pdf!)).toBeLessThanOrEqual(objetivo);
      expect(r.paginas).toBeLessThanOrEqual(objetivo);
      // Nunca «incluir siempre», ni el rol de una viñeta protegida.
      const fuera = new Set(r.plan.ocultar.map((o) => o.id));
      // Un cambio por item: lo que se deja fuera no se reescribe.
      for (const x of r.plan.reescribir) expect(fuera.has(x.id), x.id).toBe(false);
      for (const it of items.filter((i) => reglas.incluirSiempre.includes(i.itemId))) expect(fuera.has(it.id)).toBe(false);
      expect(fuera.has(items[0]!.id), "el contacto no se quita").toBe(false);
      // Las reglas, tras el último paso.
      expect(r.incumplidas.filter((x) => x.fuerza === "obligatoria")).toEqual([]);
      expect(r.palancas).toContain("seleccion");
      expect(pasos).toContain(3);
      if (objetivo === 2) {
        expect(llamadas.length).toBe(1);
        // Solo lo que pasó el candado se usa: nada con cifras nuevas ni con «Godot».
        for (const x of r.reescriturasValidas) {
          expect(x.propuesto).not.toMatch(/99|Godot/);
          expect(x.propuesto.length).toBeLessThan(x.original.length);
        }
        expect(r.reescritura!.descartados.length).toBeGreaterThan(0);
        expect(r.reescriturasValidas.length).toBeGreaterThan(0);
      }
    }, 600000);
  }

  it("★ si ni lo mínimo cabe, termina igual y dice qué regla choca con cuál, con la medida", async () => {
    const todos = items.filter((i) => i.kind === "work").map((i) => i.itemId);
    const r = await resolverPaginas({
      data: d,
      objetivo: 1,
      actual: actual[1]!,
      items,
      reglas: normalizarReglas({ paginasMax: 1, incluirSiempre: todos }),
      targetTitle: "Backend Developer",
      topeMs: 2000,
    });
    expect(r.cabe).toBe(false);
    expect(r.choque).not.toBeNull();
    expect(r.choque!.con).toBe("incluirSiempre");
    expect(r.choque!.paginas).toBeGreaterThan(1);
    expect(r.razon).toBe(textoChoque(r.choque!));
    expect(r.razon).toMatch(/Máximo 1 página.*Incluir siempre/);
  }, 600000);

  it("solo la actual (tarjeta C): no cambia de plantilla", async () => {
    const r = await resolverPaginas({
      data: d,
      objetivo: 3,
      actual: actual[3]!,
      items,
      reglas,
      targetTitle: "Backend Developer",
      soloActual: true,
    });
    expect(r.cabe).toBe(true);
    expect(r.plan.disposicion.tipo).toBe("actual");
    expect(r.palancas).not.toContain("disposicion");
    expect(r.paginas).toBeLessThanOrEqual(3);
  }, 600000);
});

describe("i18n · paridad ES/EN del namespace motor", () => {
  it("mismas claves en los dos idiomas, ninguna vacía", () => {
    expect(Object.keys(motorPaginas.en).sort()).toEqual(Object.keys(motorPaginas.es).sort());
    for (const v of [...Object.values(motorPaginas.es), ...Object.values(motorPaginas.en)]) expect(v.trim()).not.toBe("");
  });
});
