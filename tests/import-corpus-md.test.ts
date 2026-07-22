/* ============================================================================
   BLOQUE B · EL CABLEADO SIN IA: un .md corpus/1 entra a STAGING con CERO
   llamadas al modelo, y la procedencia sobrevive el viaje.

   Estos tests están escritos para ROMPER lo hecho, no para acompañarlo:

     1. CERO IA — se lee el CÓDIGO FUENTE de las dos rutas nuevas y de la mitad
        pura. Y el detector se valida con un CONTROL POSITIVO: el mismo escáner,
        pasado por /api/sources/route.ts (que sí usa el modelo), tiene que
        encenderse. Sin ese control, un escáner con la regex mal puesta daría
        verde para siempre y nadie se enteraría.
     2. PROCEDENCIA — los dos casos del encargo (con bloque y sin bloque), con
        mutantes que intentan ASCENDER a «verificado» algo que el fichero no
        afirma y colar un `origin` que el enum de la base no admite.
     3. NÚMEROS REALES — la frase del informe sale del reparto de verdad. Se
        inyectan mutantes (un item más, un tipo a cero) y se comprueba que la
        frase cambia: una frase cableada pasaría el test original y mentiría.
     4. NADA SE DESCARTA EN SILENCIO — kind desconocido, viñeta huérfana, clave
        que el editor no sabe guardar, claves repetidas del parser. Todo entra o
        se NOMBRA; nada desaparece.
     5. EL VIAJE A LA BASE — doble de Supabase en memoria (el patrón de
        tests/duplicados-staging.test.ts) y un `fetch` global que REVIENTA: si
        alguna capa intentara hablar con una API, el test cae.
     6. NADA AL MASTER — profile_items queda vacío. Sin excepciones.
   ============================================================================ */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  analizarCorpusMd,
  normalizarParseo,
  fraseInforme,
  nombrePlantilla,
  type InformeCorpusMd,
} from "../src/lib/corpus-md-staging";
import { persistSource, matchStagedAgainstMaster, type MasterItemLite } from "../src/lib/db/sources";

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = (p: string) => path.join(here, "..", p);

const RUTA_IMPORT = raiz("src/app/api/import/corpus-md/route.ts");
const RUTA_PLANTILLA = raiz("src/app/api/master/plantilla/route.ts");
const LIB_STAGING = raiz("src/lib/corpus-md-staging.ts");
/** Control positivo: esta ruta SÍ usa el modelo. El escáner debe encenderse. */
const RUTA_CON_IA = raiz("src/app/api/sources/route.ts");

/* ============================================================================
   1 · CERO IA — y un escáner que se demuestra a sí mismo
   ============================================================================ */

/** Huellas de que un fichero habla con un modelo. Si aparece una, hay IA. */
const HUELLAS_IA: [string, RegExp][] = [
  ["import de extract/llm", /extract\/llm/],
  ["SDK 'ai'", /from\s+["']ai["']/],
  ["SDK @ai-sdk", /@ai-sdk/],
  ["generateObject/generateText", /\bgenerate(Object|Text)\b/],
  ["GEMINI_API_KEY", /GEMINI_API_KEY/],
  ["clave del usuario (BYOK)", /getUserLlmKey/],
  ["registro de modelos", /modeloPara|claveGemini|MODELOS\b/],
  ["extractor Gemini", /makeGeminiExtractor/],
  ["pipeline con LLM", /\brunImport\b/],
];

/**
 * Los comentarios NO cuentan. Este candado mira lo que el fichero HACE, y estas
 * rutas explican por escrito justo lo que no hacen ("no importa extract/llm", "no
 * pide GEMINI_API_KEY"): sin quitar la prosa, documentar la decisión rompería el
 * test que la protege — y el arreglo sería borrar la explicación. Al revés.
 */
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ") // bloques /* … */
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // línea //…  (el [^:] salva los "https://")
}

const huellasEn = (src: string): string[] => {
  const codigo = soloCodigo(src);
  return HUELLAS_IA.filter(([, re]) => re.test(codigo)).map(([n]) => n);
};

describe("★ CERO IA · el camino .md → staging no toca ningún modelo", () => {
  it("el escáner FUNCIONA: en /api/sources (que sí usa IA) se enciende", () => {
    // Sin este control, una regex rota daría verde en todos los tests de abajo
    // para siempre. El candado tiene que poder fallar.
    const encontradas = huellasEn(readFileSync(RUTA_CON_IA, "utf8"));
    expect(encontradas.length).toBeGreaterThan(2);
    expect(encontradas).toContain("import de extract/llm");
  });

  it("POST /api/import/corpus-md no tiene NI UNA huella de modelo", () => {
    const src = readFileSync(RUTA_IMPORT, "utf8");
    expect(huellasEn(src), `La puerta determinista dejó de serlo: ${huellasEn(src).join(", ")}`).toEqual([]);
  });

  it("la mitad pura (corpus-md-staging) tampoco", () => {
    const src = readFileSync(LIB_STAGING, "utf8");
    expect(huellasEn(src)).toEqual([]);
  });

  it("GET /api/master/plantilla tampoco (es una lectura y un serializador)", () => {
    expect(huellasEn(readFileSync(RUTA_PLANTILLA, "utf8"))).toEqual([]);
  });

  it("★ y NO exige clave de IA: no hay ningún 503 por falta de clave", () => {
    // La mitad de la gracia del bloque. Un despliegue nuevo, sin GEMINI_API_KEY y
    // sin BYOK, tiene que poder meter la carrera entera por aquí.
    for (const f of [RUTA_IMPORT, RUTA_PLANTILLA]) {
      const src = readFileSync(f, "utf8");
      expect(src, `${path.basename(path.dirname(f))} devuelve 503`).not.toMatch(/status:\s*503/);
      expect(src).not.toMatch(/Falta configurar la clave/);
    }
  });

  it("las dependencias de la ruta están en una lista CERRADA (para que nadie cuele una)", () => {
    const src = readFileSync(RUTA_IMPORT, "utf8");
    const imports = [...src.matchAll(/from\s+["'](@\/[^"']+)["']/g)].map((m) => m[1]!);
    // Si el escáner no encuentra imports, el candado es un adorno.
    expect(imports.length).toBeGreaterThan(3);
    const permitidos = new Set([
      "@/lib/supabase/server",
      "@/lib/db/queries",
      "@/lib/db/sources",
      "@/lib/corpus-md-staging",
      "@/lib/corpus-md",
    ]);
    const intrusos = imports.filter((i) => !permitidos.has(i));
    expect(intrusos, `Dependencia nueva en la puerta determinista: ${intrusos.join(", ")}`).toEqual([]);
  });
});

/* ============================================================================
   2 · PROCEDENCIA — los dos casos del encargo
   ============================================================================ */

const item = (over: Record<string, unknown>) => ({
  kind: "work",
  data: { title: "Backend Developer", company: "Altiplano", dates: "2020 - 2024" },
  ...over,
});

describe("procedencia · un item SIN bloque entra como manual y verificado", () => {
  it("origin manual, evidence_verified TRUE y el fichero como etiqueta de origen", () => {
    // El propio archivo ES la fuente: no hay nada contra lo que verificar, y es
    // la procedencia más fuerte que existe (nadie interpretó nada por el usuario).
    const { rows } = analizarCorpusMd({ items: [item({})] }, { etiqueta: "mi-carrera.md" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.origin).toBe("manual");
    expect(rows[0]!.evidenceVerified).toBe(true);
    expect(rows[0]!.evidenceLevel).toBe("verified");
    expect(rows[0]!.evidenceSnippet).toBeNull();
    expect(rows[0]!.sourceLabel).toBe("mi-carrera.md");
  });

  it("y NO se inventa una cita: el snippet es null, no el texto del item", () => {
    const { rows } = analizarCorpusMd({ items: [item({})] });
    expect(rows[0]!.evidenceSnippet).toBeNull();
  });
});

describe("procedencia · un item CON bloque la conserva EXACTA", () => {
  const conBloque = item({
    procedencia: {
      origin: "extracted",
      sourceId: "src-linkedin-9",
      evidenceSnippet: "Backend Developer\nAltiplano · 2020 - 2024",
      evidencePage: 3,
      evidenceVerified: true,
      sourceLabel: "LinkedIn",
      evidenceLevel: "partial",
    },
  });

  it("las cinco columnas del encargo sobreviven el viaje", () => {
    const { rows } = analizarCorpusMd({ items: [conBloque] }, { etiqueta: "export.md" });
    const r = rows[0]!;
    expect(r.origin).toBe("extracted");
    expect(r.evidenceSnippet).toBe("Backend Developer\nAltiplano · 2020 - 2024");
    expect(r.evidenceVerified).toBe(true);
    // source_id y evidence_page no caben en columnas de esta fila (source_id es la
    // FK a la fuente de ESTA importación): viajan en data._* como _origin/_level.
    expect(r.data._sourceId).toBe("src-linkedin-9");
    expect(r.data._evidencePage).toBe(3);
    expect(r.evidenceLevel).toBe("partial");
    expect(r.sourceLabel).toBe("LinkedIn");
  });

  it("★ NO vuelve convertido en «manual a secas» — que es el fallo que invalida el formato", () => {
    const { rows, informe } = analizarCorpusMd({ items: [conBloque] });
    expect(rows[0]!.origin).not.toBe("manual");
    expect(informe.conProcedencia).toBe(1);
    expect(informe.nuevos).toBe(0);
  });

  it("MUTANTE · un bloque que NO afirma verificación no asciende a verificado", () => {
    // Ascender por comodidad («si trae bloque, algo se verificó») convertiría el
    // segundo eje de la cola en decoración: todo entraría como aceptable en lote.
    const sinAfirmar = item({ procedencia: { origin: "extracted", evidenceSnippet: "x" } });
    const falso = item({ procedencia: { origin: "extracted", evidenceVerified: false } });
    const cadena = item({ procedencia: { origin: "extracted", evidenceVerified: "true" } });
    const { rows } = analizarCorpusMd({ items: [sinAfirmar, falso, cadena] });
    expect(rows.map((r) => r.evidenceVerified)).toEqual([false, false, false]);
    expect(rows.map((r) => r.evidenceLevel)).toEqual(["none", "none", "none"]);
  });

  it("MUTANTE · un `origin` que el enum de la base no admite no se cuela (ni se pierde)", () => {
    const { rows, informe } = analizarCorpusMd({
      items: [item({ procedencia: { origin: "importado_a_mano_por_juan" } })],
    });
    // no revienta el INSERT…
    expect(["extracted", "manual", "ai_rephrased", "ai_translated", "api"]).toContain(rows[0]!.origin);
    expect(rows[0]!.origin).toBe("manual");
    // …y la afirmación original NO se tira: queda anotada y avisada.
    expect(rows[0]!.data._originRaw).toBe("importado_a_mano_por_juan");
    expect(informe.avisos.some((a) => a.es.includes("importado_a_mano_por_juan"))).toBe(true);
    expect(informe.avisos.some((a) => a.en.includes("importado_a_mano_por_juan"))).toBe(true);
  });

  it("los `extra` (lo que el formato no sabe escribir) VUELVEN a data", () => {
    // §5 del contrato: comparar una versión «normalizada» haría pasar el test
    // mientras el dato se degrada. Estas claves tienen que volver enteras.
    const { rows } = analizarCorpusMd({
      items: [
        item({
          procedencia: {
            origin: "extracted",
            extra: { dateStart: "2020-01", dateEnd: "2024-06", dateByHuman: true, sourceContext: "CV 2024" },
          },
        }),
      ],
    });
    expect(rows[0]!.data.dateStart).toBe("2020-01");
    expect(rows[0]!.data.dateEnd).toBe("2024-06");
    expect(rows[0]!.data.dateByHuman).toBe(true);
    expect(rows[0]!.data.sourceContext).toBe("CV 2024");
  });

  it("si un extra choca con lo que el humano escribió, gana lo escrito", () => {
    const { rows } = analizarCorpusMd({
      items: [
        item({
          data: { title: "Tech Lead", company: "Altiplano", dates: "2021 - 2024" },
          procedencia: { origin: "extracted", extra: { dates: "2020 - 2024" } },
        }),
      ],
    });
    expect(rows[0]!.data.dates).toBe("2021 - 2024");
  });
});

/* ============================================================================
   3 · EL INFORME — números reales, y ninguno cableado
   ============================================================================ */

/** n items de un kind, con datos distintos para que no parezcan uno repetido. */
function muchos(kind: string, n: number, extra: (i: number) => Record<string, unknown> = () => ({})) {
  return Array.from({ length: n }, (_, i) => ({ kind, data: { title: `${kind} ${i}`, ...extra(i) } }));
}

describe("informe previo · «Leí 5 roles, 33 viñetas, 8 grupos de habilidades y 12 proyectos»", () => {
  const parseo = {
    items: [
      ...muchos("work", 5),
      ...muchos("bullet", 33),
      ...muchos("skill", 8),
      ...muchos("project", 12),
    ],
  };

  it("la frase dice los números que hay, en español y en inglés", () => {
    const { informe } = analizarCorpusMd(parseo);
    expect(informe.frase.es).toBe("Leí 5 roles, 33 viñetas, 8 grupos de habilidades y 12 proyectos.");
    expect(informe.frase.en).toBe("Read 5 roles, 33 bullets, 8 skill groups and 12 projects.");
  });

  it("el reparto por tipo cuadra con las filas que van a entrar", () => {
    const { rows, informe } = analizarCorpusMd(parseo);
    expect(informe.total).toBe(rows.length);
    expect(informe.total).toBe(58);
    expect(informe.porTipo).toEqual({ work: 5, bullet: 33, skill: 8, project: 12 });
    const contadas = Object.values(informe.porTipo).reduce((a, b) => a + b, 0);
    expect(contadas).toBe(rows.length);
  });

  it("★ MUTANTE · un item más cambia la frase (no está cableada)", () => {
    const { informe } = analizarCorpusMd({ items: [...parseo.items, { kind: "work", data: { title: "otro" } }] });
    expect(informe.frase.es).toContain("6 roles");
    expect(informe.frase.es).not.toContain("5 roles");
  });

  it("un tipo con CERO items no aparece: enumerar ceros no informa", () => {
    const { informe } = analizarCorpusMd(parseo);
    expect(informe.frase.es).not.toMatch(/0 /);
    expect(informe.frase.es).not.toContain("certificaci");
    expect(informe.frase.en).not.toContain("certification");
  });

  it("singular y plural, en los dos idiomas", () => {
    const { informe } = analizarCorpusMd({ items: [{ kind: "work", data: {} }, { kind: "project", data: {} }] });
    expect(informe.frase.es).toBe("Leí 1 rol y 1 proyecto.");
    expect(informe.frase.en).toBe("Read 1 role and 1 project.");
  });

  it("un fichero sin items lo dice, no devuelve una frase vacía", () => {
    const { informe } = analizarCorpusMd({ items: [] });
    expect(informe.frase.es).toBe("No leí ningún item de este fichero.");
    expect(informe.frase.en).toBe("I read no items from this file.");
  });

  it("los avisos y lo no importado se CUENTAN en la frase, no se esconden", () => {
    const { informe } = analizarCorpusMd({
      items: [{ kind: "work", data: {} }, { kind: "kind-que-no-existe", data: {} }],
      avisos: ["No entendí la fecha «desde siempre» (línea 12)."],
    });
    expect(informe.frase.es).toContain("1 item no se pudo importar.");
    expect(informe.frase.es).toContain("1 aviso.");
    expect(informe.frase.en).toContain("1 item could not be imported.");
    expect(informe.frase.en).toContain("1 warning.");
  });

  it("«ya está en tu master» se dice con su número, y en los dos idiomas", () => {
    const base: InformeCorpusMd = analizarCorpusMd({ items: muchos("work", 3) }).informe;
    base.yaEnMaster = 2;
    const f = fraseInforme(base);
    expect(f.es).toContain("2 ya están en tu master.");
    expect(f.en).toContain("2 are already in your master.");
  });

  it("counts (verificado/parcial/…) sale de las filas, para cuadrar con las otras ingestas", () => {
    const { informe } = analizarCorpusMd({
      items: [
        item({}), // sin procedencia → verified
        item({ procedencia: { origin: "extracted", evidenceVerified: true } }), // verified
        item({ procedencia: { origin: "api", evidenceLevel: "api" } }), // api
      ],
    });
    expect(informe.counts).toEqual({ verified: 2, partial: 0, none: 0, api: 1, total: 3 });
  });
});

/* ============================================================================
   4 · NADA DEL USUARIO DESAPARECE EN SILENCIO
   ============================================================================ */

describe("★ nada se descarta en silencio", () => {
  it("un kind que la base no admite NO entra, pero se NOMBRA con su línea", () => {
    const { rows, informe } = analizarCorpusMd({
      items: [{ kind: "kind-que-no-existe", data: { title: "Paper" }, linea: 42 }, item({})],
    });
    expect(rows).toHaveLength(1); // solo el work
    expect(informe.noImportados).toHaveLength(1);
    expect(informe.noImportados[0]!.linea).toBe(42);
    expect(informe.noImportados[0]!.es).toContain("kind-que-no-existe");
    expect(informe.noImportados[0]!.en).toContain("kind-que-no-existe");
  });

  it("los avisos del parser (y las notas que conserva) llegan al informe", () => {
    const { informe } = analizarCorpusMd({
      items: [item({})],
      avisos: [{ linea: 7, mensaje: "Fecha no reconocida: «el verano pasado»." }],
      notas: ["Línea 88 conservada: «Aficiones: escalada»."],
    });
    expect(informe.avisos).toHaveLength(2);
    expect(informe.avisos[0]!.linea).toBe(7);
    expect(informe.avisos[0]!.es).toContain("verano pasado");
    expect(informe.avisos[1]!.es).toContain("escalada");
  });

  it("una clave que el editor del master no sabrá guardar se CONSERVA y se avisa", () => {
    // El precedente real: `dateBySource` lo escribe el barrido y no está en
    // DATA_KEYS, así que PATCH lo rechazaría. Tirarla sería el fallo capital;
    // callarla sería dejarle una bomba al usuario para el día que edite.
    const { rows, informe } = analizarCorpusMd({
      items: [{ kind: "work", data: { title: "Dev", dateBySource: "linkedin" }, linea: 5 }],
    });
    expect(rows[0]!.data.dateBySource).toBe("linkedin");
    const aviso = informe.avisos.find((a) => a.es.includes("dateBySource"));
    expect(aviso).toBeDefined();
    expect(aviso!.linea).toBe(5);
    expect(aviso!.en).toContain("dateBySource");
  });

  it("una viñeta cuyo padre no está en el fichero entra SUELTA, no se tira", () => {
    const { rows, informe } = analizarCorpusMd({
      items: [{ kind: "bullet", parentKey: "w-fantasma", data: { text: "Reduje el TTFB un 40%." }, linea: 9 }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.parentKey).toBeUndefined();
    expect(rows[0]!.data.text).toBe("Reduje el TTFB un 40%.");
    expect(informe.avisos.some((a) => a.linea === 9 && /padre/.test(a.es))).toBe(true);
  });

  it("un item sin campos entra vacío y avisado, en vez de desaparecer", () => {
    const { rows, informe } = analizarCorpusMd({ items: [{ kind: "work", data: null, linea: 3 }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.data).toEqual({});
    expect(informe.avisos.some((a) => a.linea === 3)).toBe(true);
  });

  it("★ MUTANTE · dos items con la MISMA clave del parser no colapsan en uno", () => {
    // assignIds mapea clave→uuid: dos filas con la misma clave recibirían el mismo
    // uuid y la segunda reventaría por clave primaria duplicada (o peor, colgaría
    // las viñetas del rol equivocado). Por eso el espacio de claves es propio.
    const { rows } = analizarCorpusMd({
      items: [
        { key: "w1", kind: "work", data: { title: "Uno" } },
        { key: "w1", kind: "work", data: { title: "Dos" } },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
    expect(rows.map((r) => r.data.title)).toEqual(["Uno", "Dos"]);
  });

  it("la viñeta cuelga del rol correcto aunque las claves del parser se repitan", () => {
    const { rows } = analizarCorpusMd({
      items: [
        { key: "w1", kind: "work", data: { title: "Primero" } },
        { key: "b1", parentKey: "w1", kind: "bullet", data: { text: "hice algo" } },
        { key: "w1", kind: "work", data: { title: "Segundo" } },
      ],
    });
    const primero = rows.find((r) => r.data.title === "Primero")!;
    const vin = rows.find((r) => r.kind === "bullet")!;
    expect(vin.parentKey).toBe(primero.key);
  });
});

describe("normalizarParseo · antes que adivinar, se para", () => {
  it("★ una forma que no reconoce FALLA RUIDOSO (no devuelve lista vacía)", () => {
    // Devolver {items:[]} ante algo que no se entiende sería tragarse el fichero
    // del usuario y decirle que salió bien. Es exactamente el fallo capital.
    expect(() => normalizarParseo(null)).toThrow(/no devolvió un objeto/);
    expect(() => normalizarParseo("# CORPUS")).toThrow(/no devolvió un objeto/);
    expect(() => normalizarParseo({ resultado: "ok" })).toThrow(/No encontré la lista de items/);
  });

  it("acepta las formas plausibles del bloque A (items · elementos · array pelado)", () => {
    expect(normalizarParseo({ items: [{ kind: "work" }] }).items).toHaveLength(1);
    expect(normalizarParseo({ elementos: [{ kind: "work" }] }).items).toHaveLength(1);
    expect(normalizarParseo([{ kind: "work" }]).items).toHaveLength(1);
  });

  it("una lista vacía DE VERDAD sí es válida (fichero sin items ≠ parser incomprensible)", () => {
    expect(normalizarParseo({ items: [] })).toEqual({ items: [], avisos: [] });
  });
});

/* ============================================================================
   5 · EL VIAJE A LA BASE — doble en memoria, y la red prohibida
   ============================================================================ */

type Fila = Record<string, unknown>;

class FakeDb {
  tablas = new Map<string, Fila[]>();
  private n = 0;
  tabla(t: string): Fila[] {
    let r = this.tablas.get(t);
    if (!r) this.tablas.set(t, (r = []));
    return r;
  }
  nextId(): string {
    return `gen-${++this.n}`;
  }
}

type Op = "select" | "insert" | "update" | "delete";

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filtros: [string, unknown][] = [];
  private modo: "many" | "single" | "maybe" = "many";
  private devolver = false;
  constructor(private db: FakeDb, private t: string, private op: Op, private payload?: unknown) {
    if (op === "insert") this.devolver = true;
  }
  eq(col: string, val: unknown) { this.filtros.push([col, val]); return this; }
  in(_col: string, _vals: unknown[]) { return this; }
  select(_c?: string) { this.devolver = true; return this; }
  order(_c: string, _o?: unknown) { return this; }
  single() { this.modo = "single"; return this; }
  maybeSingle() { this.modo = "maybe"; return this; }
  private casan(f: Fila): boolean { return this.filtros.every(([c, v]) => f[c] === v); }
  private ejecutar(): unknown {
    const filas = this.db.tabla(this.t);
    if (this.op === "insert") {
      const entrada = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Fila[];
      const nuevas = entrada.map((f) => ({ ...f, id: (f.id as string) ?? this.db.nextId() }));
      filas.push(...nuevas);
      return nuevas;
    }
    return filas.filter((f) => this.casan(f));
  }
  then<R1 = { data: unknown; error: null }, R2 = never>(
    ok?: ((v: { data: unknown; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    bad?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const filas = this.ejecutar() as Fila[];
    const data = this.modo === "many" ? (this.devolver ? filas : null) : (filas[0] ?? null);
    const res =
      this.modo === "single" && !filas.length
        ? { data: null, error: { message: "no rows" } }
        : { data, error: null };
    return Promise.resolve(res).then(ok ?? undefined, bad ?? undefined);
  }
}

function fakeSb(db: FakeDb): SupabaseClient {
  return {
    from(t: string) {
      return {
        select: (c?: string) => new FakeQuery(db, t, "select").select(c),
        insert: (p: unknown) => new FakeQuery(db, t, "insert", p),
        update: (p: unknown) => new FakeQuery(db, t, "update", p),
        delete: () => new FakeQuery(db, t, "delete"),
      };
    },
  } as unknown as SupabaseClient;
}

const UID = "user-1";
const MD_LITERAL =
  "# CORPUS · Perfil profesional\nformato: corpus/1\n\n## EXPERIENCIA\n### Backend Developer\n" +
  "empresa: Altiplano\nfechas: 2020 - 2024\n- Reduje el TTFB un 40%.\n\nAficiones: escalada\n";

/* La red, PROHIBIDA durante todo este bloque. Si alguna capa intentara llamar a
   un modelo (o a cualquier API), el test cae con un mensaje que lo dice. Es la
   contraparte dinámica del escáner estático de arriba. */
const fetchReal = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (u: unknown) => {
    throw new Error(`RED PROHIBIDA en el camino determinista: se intentó llamar a ${String(u)}`);
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = fetchReal;
});

const parseoCompleto = {
  items: [
    { key: "w1", kind: "work", data: { title: "Backend Developer", company: "Altiplano", dates: "2020 - 2024" } },
    { key: "b1", parentKey: "w1", kind: "bullet", data: { text: "Reduje el TTFB un 40%." } },
    {
      key: "s1",
      kind: "skill",
      data: { group: "Lenguajes", items: "Python, TypeScript, SQL" },
      procedencia: { origin: "extracted", sourceId: "src-cv-1", evidenceSnippet: "Python, TypeScript, SQL", evidenceVerified: true },
    },
  ],
  avisos: ["Línea 9 conservada como nota: «Aficiones: escalada»."],
};

describe("★ .md → staging · sin modelo, sin red, y sin atajos al master", () => {
  it("escribe la fuente y las filas de staging, todas PENDIENTES", async () => {
    const db = new FakeDb();
    const { rows } = analizarCorpusMd(parseoCompleto, { etiqueta: "mi-carrera.md" });
    const { sourceId, staged } = await persistSource(
      fakeSb(db),
      UID,
      { kind: "paste", originalName: "mi-carrera.md", rawText: MD_LITERAL, status: "extracted" },
      rows,
    );

    expect(staged).toBe(3);
    const fuentes = db.tabla("ingestion_sources");
    expect(fuentes).toHaveLength(1);
    // el enum source_kind no tiene 'text': un .md se guarda como 'paste'
    expect(fuentes[0]!.kind).toBe("paste");
    expect(fuentes[0]!.original_name).toBe("mi-carrera.md");

    const items = db.tabla("staged_items");
    expect(items).toHaveLength(3);
    expect(items.every((f) => f.status === "pending")).toBe(true);
    expect(items.every((f) => f.source_id === sourceId)).toBe(true);
  });

  it("★ NADA entra al master: profile_items queda vacío", async () => {
    const db = new FakeDb();
    const { rows } = analizarCorpusMd(parseoCompleto);
    await persistSource(fakeSb(db), UID, { kind: "paste", rawText: MD_LITERAL }, rows);
    expect(db.tabla("profile_items")).toHaveLength(0);
  });

  it("el .md ENTERO queda en raw_text: lo que el parser no encajó sigue existiendo", async () => {
    // Los avisos dicen qué líneas no encajaron; raw_text garantiza que además
    // SIGUEN AHÍ, literales, aunque no sean un item.
    const db = new FakeDb();
    const { rows } = analizarCorpusMd(parseoCompleto);
    await persistSource(fakeSb(db), UID, { kind: "paste", rawText: MD_LITERAL }, rows);
    expect(db.tabla("ingestion_sources")[0]!.raw_text).toBe(MD_LITERAL);
    expect(String(db.tabla("ingestion_sources")[0]!.raw_text)).toContain("Aficiones: escalada");
  });

  it("la viñeta cuelga de su rol (dos fases), no queda huérfana en la base", async () => {
    const db = new FakeDb();
    const { rows } = analizarCorpusMd(parseoCompleto);
    await persistSource(fakeSb(db), UID, { kind: "paste", rawText: MD_LITERAL }, rows);
    const items = db.tabla("staged_items");
    const rol = items.find((f) => (f.data as Fila).title === "Backend Developer")!;
    const vin = items.find((f) => f.kind === "bullet")!;
    expect(vin.parent_staged_id).toBe(rol.id);
  });

  it("★ la procedencia sobrevive HASTA LA BASE, en los dos casos", async () => {
    const db = new FakeDb();
    const { rows } = analizarCorpusMd(parseoCompleto, { etiqueta: "mi-carrera.md" });
    await persistSource(fakeSb(db), UID, { kind: "paste", rawText: MD_LITERAL }, rows);
    const items = db.tabla("staged_items");

    // (a) sin bloque → manual y verificado por el propio fichero
    const rol = items.find((f) => (f.data as Fila).title === "Backend Developer")!;
    expect((rol.data as Fila)._origin).toBe("manual");
    expect(rol.evidence_verified).toBe(true);
    expect((rol.data as Fila)._source).toBe("mi-carrera.md");

    // (b) con bloque → la de origen, intacta
    const hab = items.find((f) => f.kind === "skill")!;
    expect((hab.data as Fila)._origin).toBe("extracted");
    expect(hab.evidence_snippet).toBe("Python, TypeScript, SQL");
    expect(hab.evidence_verified).toBe(true);
    expect((hab.data as Fila)._sourceId).toBe("src-cv-1");
    // y el CSV de habilidades se guarda TAL CUAL (mismo orden, mismos espacios)
    expect((hab.data as Fila).items).toBe("Python, TypeScript, SQL");
  });

  it("lo que YA está en el master se MARCA (duplicate_of) y sigue entrando pendiente", async () => {
    // Sin esto, reimportar el master exportado re-propondría los ~105 items ya
    // revisados. ⚠ Marca, no descarta: la fila entra igual y el usuario decide.
    const db = new FakeDb();
    const { rows } = analizarCorpusMd(parseoCompleto);
    const master: MasterItemLite[] = [
      { id: "pi-7", kind: "work", data: { title: "Backend Developer", company: "Altiplano", dates: "2020 - 2024" } },
    ];
    const dupMap = matchStagedAgainstMaster(master, rows);
    expect(dupMap.size).toBe(1);

    await persistSource(fakeSb(db), UID, { kind: "paste", rawText: MD_LITERAL }, rows, dupMap);
    const rol = db.tabla("staged_items").find((f) => (f.data as Fila).title === "Backend Developer")!;
    expect(rol.duplicate_of).toBe("pi-7");
    expect(rol.status).toBe("pending");
    // los demás no se marcan por contagio
    expect(db.tabla("staged_items").filter((f) => f.duplicate_of).length).toBe(1);
  });

  it("sin dupMap se comporta igual que siempre (el parámetro es aditivo)", async () => {
    const db = new FakeDb();
    const { rows } = analizarCorpusMd(parseoCompleto);
    await persistSource(fakeSb(db), UID, { kind: "paste", rawText: MD_LITERAL }, rows);
    expect(db.tabla("staged_items").every((f) => f.duplicate_of === null)).toBe(true);
  });
});

/* ============================================================================
   6 · «SOLO ANALIZAR» — ver el informe y ENTONCES decidir
   ============================================================================ */

describe("modo «solo analizar» · nada entra sin que el usuario lo haya visto", () => {
  it("el análisis es PURO: no recibe cliente de base y no puede escribir", async () => {
    const db = new FakeDb();
    const { informe } = analizarCorpusMd(parseoCompleto, { etiqueta: "mi-carrera.md" });
    expect(informe.total).toBe(3);
    expect(db.tablas.size).toBe(0); // ni una tabla tocada
    // y la firma no admite un cliente: la pureza es estructural, no una promesa
    expect(analizarCorpusMd.length).toBeLessThanOrEqual(2);
  });

  it("★ en la ruta, el corte por «solo analizar» va ANTES de escribir", () => {
    // Candado estructural: si alguien moviera el persistSource por encima del
    // early-return, el modo «previsualizar» escribiría igualmente y la promesa
    // «nada entra sin que lo hayas visto» sería falsa sin que nada fallara.
    const src = readFileSync(RUTA_IMPORT, "utf8");
    const guarda = src.indexOf("if (soloAnalizar)");
    const escribe = src.indexOf("await persistSource(");
    expect(guarda, "el modo «solo analizar» desapareció de la ruta").toBeGreaterThan(-1);
    expect(escribe).toBeGreaterThan(-1);
    expect(escribe, "persistSource quedó por ENCIMA del corte de «solo analizar»").toBeGreaterThan(guarda);
  });
});

/* ============================================================================
   7 · LA PLANTILLA
   ============================================================================ */

describe("GET /api/master/plantilla · nombre del fichero", () => {
  it("master vacío → plantilla; master con datos → tu master, fechado", () => {
    const d = new Date("2026-07-20T10:00:00Z");
    expect(nombrePlantilla(false, d)).toBe("corpus-plantilla.md");
    expect(nombrePlantilla(true, d)).toBe("corpus-master-2026-07-20.md");
  });

  it("la ruta descarga como fichero .md, no lo pinta en el navegador", () => {
    const src = readFileSync(RUTA_PLANTILLA, "utf8");
    expect(src).toContain("Content-Disposition");
    expect(src).toContain("attachment");
    expect(src).toContain("text/markdown; charset=utf-8");
  });

  it("el texto de la plantilla NO vive en la ruta (una copia rompería el round-trip)", () => {
    const src = readFileSync(RUTA_PLANTILLA, "utf8");
    expect(src).toContain("plantillaVacia");
    expect(src).not.toContain("## EXPERIENCIA"); // ningún esqueleto duplicado aquí
  });
});
