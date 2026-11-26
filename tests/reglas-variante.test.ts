import { describe, it, expect } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";
import { toPlainText, type ResumeData } from "../src/lib/cv/resume";
import example from "../src/lib/cv/fixtures/datos-ejemplo.json";
import {
  aplicarReglasAlDocumento,
  contieneTermino,
  cumpleReglas,
  estadoDeReglas,
  normalizarReglas,
  obtenerReglas,
  reglasParaPrompt,
  terminoExcluidoEn,
  validarReglas,
  REGLAS_VACIAS,
  type Reglas,
} from "../src/lib/cv/reglas";
import { itemDeAjuste } from "../src/lib/cv/ajuste";
import {
  construirAfinado,
  itemDeAfinar,
  resolverSinRespaldo,
  respaldoSegunReglas,
  type AccionRespaldo,
  type AfinarItem,
  type MaestroRef,
} from "../src/lib/cv/afinar";
import { construirTailor, verificarReformulacion, type ItemTailor } from "../src/lib/cv/tailor";
import { reglas as dictReglas } from "../src/lib/i18n/dict/reglas";

/* ============================================================================
   REGLAS POR VARIANTE (DA-R1) — lo que nada rompe. Las maneras concretas en que
   fallaría: un término excluido que se cuela en el PDF o en un texto de IA; un
   item obligatorio que afinar quita; una sección oculta que se pinta igual.
   ============================================================================ */

const conReglas = (p: Partial<Reglas>): Reglas => normalizarReglas({ ...p });

/** El ejemplo, con «Unity» sembrado en todas las capas que pinta el documento. */
function docConUnity(): ResumeData {
  const d = structuredClone(example) as unknown as ResumeData;
  d.basics.summary = {
    es: "Ingeniero de software con foco en backend. Hice juegos en Unity durante la carrera.",
    en: "Software engineer focused on backend. Built games in Unity at university.",
  };
  d.skills = [...d.skills, { group: { es: "Motores", en: "Engines" }, items: { es: "Unity, Godot", en: "Unity, Godot" } }];
  d.work[0]!.bullets = [...d.work[0]!.bullets, { p1: true, es: "Porté el cliente a Unity3D.", en: "Ported the client to Unity3D." }];
  d.projects = [...d.projects, { p1: true, es: "Juego 2D en Unity — plataformas", en: "2D game in Unity — platformer" }];
  return d;
}

async function textoPdf(d: ResumeData): Promise<string> {
  const buf = await renderResumeToBuffer(d);
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

describe("contrato · obtenerReglas / validarReglas", () => {
  it("sin reglas ⇒ valores por defecto, nunca lanza", () => {
    expect(obtenerReglas(null)).toEqual(REGLAS_VACIAS);
    expect(obtenerReglas({ reglas: "basura" })).toEqual(REGLAS_VACIAS);
    expect(obtenerReglas({ reglas: { paginasMax: 7, ocultarSecciones: ["inventada", "skills"] } })).toMatchObject({
      paginasMax: null,
      ocultarSecciones: ["skills"],
    });
  });
  it("cada regla es obligatoria por defecto y puede ser preferida", () => {
    const r = obtenerReglas({ reglas: { fuerza: { excluirTerminos: "preferida", sinFoto: "x" } } });
    expect(r.fuerza.excluirTerminos).toBe("preferida");
    expect(r.fuerza.sinFoto).toBe("obligatoria");
  });
  it("validarReglas rechaza lo que engañaría en silencio", () => {
    const v = validarReglas({ paginasMax: 5, ocultarSecciones: ["nope"], incluirSiempre: ["ajeno"] }, { masterIds: new Set(["m1"]) });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errores).toHaveLength(3);
    expect(validarReglas({ paginasMax: 2, excluirTerminos: ["Unity", "unity", " "] })).toMatchObject({
      ok: true,
      reglas: { paginasMax: 2, excluirTerminos: ["Unity"] },
    });
  });
});

describe("términos · por palabra, sin tildes ni mayúsculas", () => {
  it("Unity está en «Unity3D» y «UNITY,» pero no en «Community»; Java no está en JavaScript", () => {
    expect(contieneTermino("Porté a Unity3D", "unity")).toBe(true);
    expect(contieneTermino("C#, UNITY, Godot", "Unity")).toBe(true);
    expect(contieneTermino("Community manager", "Unity")).toBe(false);
    expect(contieneTermino("JavaScript y TypeScript", "Java")).toBe(false);
    expect(contieneTermino("Gestión de café", "gestion")).toBe(true);
    expect(contieneTermino("Uso C++ a diario", "C++")).toBe(true);
  });
});

describe("★ un término excluido nunca aparece en el PDF", () => {
  const reglas = conReglas({ excluirTerminos: ["Unity"] });
  it("el documento se limpia en todas sus capas y en los dos idiomas", async () => {
    const antes = docConUnity();
    expect(/unity/i.test(await textoPdf(antes))).toBe(true); // el caso es real
    const d = aplicarReglasAlDocumento(antes, reglas);
    const pdf = await textoPdf(d);
    expect(/unity/i.test(pdf)).toBe(false);
    expect(/unity/i.test(toPlainText(d, { locale: "en" }))).toBe(false);
    // Lo demás sobrevive: la frase limpia del resumen y Godot de la lista.
    expect(pdf).toContain("Ingeniero de software con foco en backend.");
    expect(pdf).toContain("Godot");
    expect(cumpleReglas(d, reglas)).toEqual([]);
    expect(cumpleReglas(antes, reglas)[0]).toMatchObject({ regla: "excluirTerminos" });
  }, 30000);
  it("es idempotente y una regla preferida no filtra (solo avisa)", () => {
    const d = aplicarReglasAlDocumento(docConUnity(), reglas);
    expect(aplicarReglasAlDocumento(d, reglas)).toEqual(d);
    const pref = conReglas({ excluirTerminos: ["Unity"], fuerza: { ...REGLAS_VACIAS.fuerza, excluirTerminos: "preferida" } });
    const dp = aplicarReglasAlDocumento(docConUnity(), pref);
    expect(cumpleReglas(dp, pref)[0]).toMatchObject({ regla: "excluirTerminos", fuerza: "preferida" });
  });
});

describe("★ una sección oculta no se pinta", () => {
  it("ni el resumen ni las habilidades (que se rotulan siempre) salen en el PDF", async () => {
    const d = aplicarReglasAlDocumento(structuredClone(example) as unknown as ResumeData, conReglas({ ocultarSecciones: ["summary", "skills"] }));
    const pdf = await textoPdf(d);
    const plano = toPlainText(d);
    for (const t of [pdf, plano]) {
      expect(t).not.toMatch(/perfil|resumen|habilidades/i);
      expect(t).toMatch(/experiencia/i);
    }
    expect(cumpleReglas(d, conReglas({ ocultarSecciones: ["summary", "skills"] }))).toEqual([]);
  }, 30000);
  it("sinFoto apaga la foto", () => {
    const d = { ...(structuredClone(example) as unknown as ResumeData), photo: "data:image/png;base64,AAAA" };
    expect(aplicarReglasAlDocumento(d, conReglas({ sinFoto: true })).photo).toBeUndefined();
    expect(cumpleReglas(d, conReglas({ sinFoto: true }))[0]).toMatchObject({ regla: "sinFoto" });
  });
});

describe("cumpleReglas · lo comprobable", () => {
  it("páginas medidas, item obligatorio ausente e idioma", () => {
    const d = structuredClone(example) as unknown as ResumeData;
    const r = conReglas({ paginasMax: 1, incluirSiempre: ["m-x"], idioma: "en" });
    const fallos = cumpleReglas(d, r, { paginas: 2, idsVisibles: new Set(["m-y"]), nombreDe: () => "Mi proyecto", idioma: "es" });
    expect(fallos.map((f) => f.regla).sort()).toEqual(["idioma", "incluirSiempre", "paginasMax"]);
    const estado = estadoDeReglas(d, d, r, { paginas: 1, idsVisibles: new Set(["m-x"]), nombreDe: () => "Mi proyecto", idioma: "en" });
    expect(estado.every((e) => e.cumple === true)).toBe(true);
    // Sin medir el PDF ni saber el idioma, «por comprobar» (null), nunca un «cumple» supuesto.
    const sinMedir = estadoDeReglas(d, d, r, { idsVisibles: new Set(["m-x"]) });
    expect(sinMedir.filter((e) => e.cumple === null).map((e) => e.regla).sort()).toEqual(["idioma", "paginasMax"]);
  });
});

// ── IA: el candado de reglas se suma al de verify.ts ─────────────────────────
const master: MaestroRef[] = [
  { id: "m-sum", kind: "summary", parentId: null, sortOrder: 0, data: { text: "Ingeniero backend con foco en pagos." } },
  { id: "m-work", kind: "work", parentId: null, sortOrder: 1, data: { title: "Backend Developer", company: "Altiplano", dates: "2021 — 2024" } },
  { id: "m-b1", kind: "bullet", parentId: "m-work", sortOrder: 2, data: { text: "Fui responsable del motor de juego en Unity." } },
  { id: "m-sk", kind: "skill", parentId: null, sortOrder: 3, data: { group: "Motores", items: "Unreal, Godot" } },
];
const filas = [
  { id: "v-sum", item_id: "m-sum", kind: "summary", visible: true, sort_order: 0, parent_id: null, data: master[0]!.data },
  { id: "v-work", item_id: "m-work", kind: "work", visible: true, sort_order: 1, parent_id: null, data: master[1]!.data },
  { id: "v-b1", item_id: "m-b1", kind: "bullet", visible: true, sort_order: 2, parent_id: "m-work", data: master[2]!.data },
  { id: "v-sk", item_id: "m-sk", kind: "skill", visible: true, sort_order: 3, parent_id: null, data: master[3]!.data },
];
const porId = new Map(master.map((m) => [m.id, m]));
const items: AfinarItem[] = filas.map((f) => itemDeAfinar(itemDeAjuste(f), porId.get(f.item_id)));

describe("★ un término excluido nunca aparece en un texto de IA aplicado", () => {
  const reglas = conReglas({ excluirTerminos: ["Unity"] });
  it("afinar descarta la reescritura que lo nombra y el prompt lo lleva", async () => {
    let prompt = "";
    const r = await construirAfinado(
      { items, alcance: "todo", targetTitle: "Backend", reglas },
      {
        llm: async (inp) => {
          prompt = inp.reglas ?? "";
          return {
            propuestas: [
              { id: "v-b1", propuesto: "Lideré el motor de juego en Unity.", motivo: "" },
              { id: "v-sum", propuesto: "Ingeniero backend centrado en pagos.", motivo: "" },
            ],
            notas: "",
          };
        },
      },
    );
    expect(prompt).toContain("«Unity»");
    expect(r.propuestas.map((p) => p.id)).toEqual(["v-sum"]);
    expect(r.descartados.find((d) => d.id === "v-b1")?.razon).toMatch(/Unity/);
  });
  it("tailor: reformulación, resumen y selección; y al aceptar se vuelve a comprobar", async () => {
    const it: ItemTailor[] = [
      { id: "m-sum", itemId: "m-sum", kind: "summary", texto: "Ingeniero backend con foco en pagos.", campo: "text", original: "Ingeniero backend con foco en pagos.", enVariante: true } as ItemTailor,
      { id: "m-b1", itemId: "m-b1", kind: "bullet", texto: "Fui responsable del motor de juego en Unity.", campo: "text", original: "Fui responsable del motor de juego en Unity.", enVariante: true } as ItemTailor,
    ];
    const r = await construirTailor(
      { offerText: "Buscamos backend con experiencia en pagos y Unity.", items: it, reglas },
      {
        llm: async () => ({
          titulo_objetivo: "Backend",
          requisitos: [],
          seleccion: ["m-b1"],
          resumen: "Ingeniero backend con foco en pagos y Unity.",
          reformulaciones: [{ id: "m-b1", propuesto: "Responsable del motor de juego en Unity.", motivo: "" }],
          notas: "",
        }),
      },
    );
    expect(r.reformulaciones).toEqual([]);
    expect(r.resumen).toBeNull();
    expect(r.seleccion).not.toContain("m-b1");
    expect(verificarReformulacion("Fui responsable del motor.", "Responsable del motor en Unity.", reglas)).toMatchObject({ ok: false });
    expect(terminoExcluidoEn("todo en Godot", reglas)).toBeNull();
  });
  it("el bloque de prompt está vacío sin reglas", () => {
    expect(reglasParaPrompt(REGLAS_VACIAS)).toBe("");
  });
});

describe("★ un item obligatorio sobrevive a afinar", () => {
  it("«sin respaldo» no oculta un grupo obligatorio (y sí el que no lo es)", () => {
    const acciones = resolverSinRespaldo(items, master);
    const grupo = acciones.find((a) => a.tipo === "ocultar-grupo");
    expect(grupo).toMatchObject({ itemId: "m-sk" }); // sin reglas, afinar lo ocultaría
    expect(respaldoSegunReglas(acciones, conReglas({ incluirSiempre: ["m-sk"] })).some((a) => a.tipo === "ocultar-grupo")).toBe(false);
    expect(respaldoSegunReglas(acciones, REGLAS_VACIAS)).toEqual(acciones);
  });
  it("no se muestra ni se añade un item que nombra un término excluido", () => {
    const a: AccionRespaldo[] = [{ tipo: "anadir", itemId: "m-b1", kind: "bullet", aptitudes: ["x"], texto: "motor en Unity" }];
    expect(respaldoSegunReglas(a, conReglas({ excluirTerminos: ["Unity"] }))).toEqual([]);
  });
  it("la selección de tailor añade el obligatorio aunque el modelo no lo elija", async () => {
    const it: ItemTailor[] = [
      { id: "m-sum", itemId: "m-sum", kind: "summary", texto: "Resumen.", campo: "text", original: "Resumen.", enVariante: false } as ItemTailor,
      { id: "m-b1", itemId: "m-b1", kind: "bullet", texto: "Hice X en Unity.", campo: "text", original: "Hice X en Unity.", enVariante: false } as ItemTailor,
    ];
    const r = await construirTailor(
      { offerText: "Un aviso cualquiera de backend.", items: it, reglas: conReglas({ incluirSiempre: ["m-b1"], excluirTerminos: ["Unity"] }) },
      { llm: async () => ({ titulo_objetivo: "", requisitos: [], seleccion: [], resumen: "", reformulaciones: [], notas: "" }) },
    );
    expect(r.seleccion).toContain("m-b1"); // obligatorio gana a la exclusión en la selección
  });
});

describe("i18n · paridad ES/EN del namespace reglas", () => {
  it("las mismas claves en los dos idiomas, sin vacíos", () => {
    expect(Object.keys(dictReglas.en).sort()).toEqual(Object.keys(dictReglas.es).sort());
    for (const v of [...Object.values(dictReglas.es), ...Object.values(dictReglas.en)]) expect(v.trim()).not.toBe("");
  });
});
