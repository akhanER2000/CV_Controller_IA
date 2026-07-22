import { describe, it, expect } from "vitest";
import {
  computeLibPlan,
  forcedOpenSections,
  libSectionOpen,
  libSectionOfKind,
  libTextOf,
  loadFoldedFrom,
  saveFoldedTo,
  LIB_SECTIONS,
  LIB_FOLD_KEY,
  type LibSectionId,
} from "../src/components/screens/EditorVarianteScreen";

/* ============================================================================
   BLOQUE E · ACORDEÓN DE LA BIBLIOTECA (punto 5)

   La columna izquierda mostraba el master DE CORRIDO; con 105 items no se
   navega. Lo que se prueba aquí no es «la función devuelve algo»: son las tres
   trampas reales del bloque, cada una con su MUTANTE (se rompe la regla a
   propósito y se comprueba que un test cae). Un test que pasa igual con el
   código roto no prueba nada.

     1. EL CONTADOR NO MIENTE AL BUSCAR. El filtrado ocurría dentro de la fila
        (devolvía null), y la cabecera/contador salían del master SIN filtrar:
        un grupo podía decir «12» con 0 filas a la vista. El plan filtra ANTES,
        y el contador cuenta lo que SE PINTA.
     2. LA EXPERIENCIA ES ROLES + VIÑETAS. Filtrar por rol no puede dejar
        viñetas huérfanas ni contar una viñeta como rol.
     3. AUTO-DESPLEGADO Y PERSISTENCIA. Al buscar se abren solas las secciones
        CON resultados; el plegado manual se recuerda entre sesiones y una
        forzada-abierta lo gana sin borrarlo.

   Los tests corren en Node (sin DOM), así que se ejerce la LÓGICA PURA extraída
   de la pantalla — la misma que decide lo que el componente pinta.
   ============================================================================ */

// El tipo del parámetro es MasterRow[] (interno de la pantalla); se toma de la
// firma para construir filas con forma correcta sin castings.
type Master = Parameters<typeof computeLibPlan>[0];

let so = 0;
const row = (id: string, kind: string, data: Record<string, unknown>, parent: string | null = null): Master[number] => ({
  id,
  kind,
  data,
  parent_id: parent,
  sort_order: so++,
});

/** Un master realista: resumen, DOS roles con viñetas, skills, un proyecto, una
 *  educación, un certificado, dos idiomas, una publicación y DOS referencias. El
 *  orden de inserción es el de pintado.
 *
 *  ⚠ CERTIFICADO, IDIOMAS Y PUBLICACIÓN ENTRARON DESPUÉS, y su ausencia aquí era
 *  parte del problema: la biblioteca no ofrecía esos kinds (libSectionOfKind
 *  devolvía null), así que un usuario con certificados guardados en el master no
 *  podía meterlos en ninguna variante y nada se lo decía. Ahora el documento tiene
 *  esas secciones y la biblioteca las ofrece; el fixture las trae para que el plan
 *  se pruebe con ellas dentro y no solo en teoría. */
function masterFixture(): Master {
  so = 0;
  return [
    row("sum1", "summary", { text: "Backend con foco en pagos y conciliación." }),
    row("e1", "work", { title: "Backend Developer", company: "Altiplano Pagos" }),
    row("b1", "bullet", { text: "Servicio de conciliación de pagos en Go." }, "e1"),
    row("b2", "bullet", { text: "Librería interna de idempotencia adoptada por otros equipos." }, "e1"),
    row("b3", "bullet", { text: "Mantengo los pipelines de CI/CD del equipo." }, "e1"),
    row("e2", "work", { title: "Backend Developer", company: "Rayén Retail" }),
    row("b4", "bullet", { text: "APIs del checkout en Node.js y PostgreSQL." }, "e2"),
    row("b5", "bullet", { text: "Flujo de cupones y descuentos del checkout." }, "e2"),
    row("s1", "skill", { group: "Lenguajes", items: "Go, Python, SQL" }),
    row("p1", "project", { name: "idempotency-go", description: "librería open source." }),
    row("ed1", "education", { degree: "Ingeniería Civil en Computación", institution: "UNAB" }),
    row("ce1", "certification", { name: "AWS Solutions Architect", issuer: "Amazon Web Services" }),
    row("la1", "language", { language: "Español", level: "nativo" }),
    row("la2", "language", { language: "Inglés", level: "profesional (B2)" }),
    row("pu1", "publication", { name: "Conciliación a escala", description: "charla en la PyCon local." }),
    row("ref1", "reference", { name: "Rodrigo Peña", role: "CTO", org: "Tesseract" }),
    row("ref2", "reference", { name: "Marta Ibáñez", role: "Profesora", org: "UNAB" }),
  ];
}

const groupById = (plan: ReturnType<typeof computeLibPlan>, id: LibSectionId) => plan.find((g) => g.id === id)!;
const rowIds = (plan: ReturnType<typeof computeLibPlan>, id: LibSectionId) => groupById(plan, id).rows.map((r) => r.row.id);

/* ══ 1 · EL PLAN, SIN BÚSQUEDA ═════════════════════════════════════════════ */
describe("computeLibPlan · sin búsqueda pinta todo el master, agrupado y en orden", () => {
  const plan = computeLibPlan(masterFixture(), "");

  it("hay una sección por grupo y en el orden del catálogo de la columna", () => {
    expect(plan.map((g) => g.id)).toEqual([...LIB_SECTIONS]);
  });

  it("experiencia = roles + viñetas intercaladas, contados por separado", () => {
    const work = groupById(plan, "work");
    expect(work.roles).toBe(2);
    expect(work.bullets).toBe(5);
    expect(work.count).toBe(7); // 2 roles + 5 viñetas
    // Orden de pintado: rol, sus viñetas, siguiente rol, sus viñetas.
    expect(rowIds(plan, "work")).toEqual(["e1", "b1", "b2", "b3", "e2", "b4", "b5"]);
    // Las viñetas están marcadas como tales; los roles no.
    expect(work.rows.filter((r) => r.isBullet).map((r) => r.row.id)).toEqual(["b1", "b2", "b3", "b4", "b5"]);
    expect(work.rows.filter((r) => !r.isBullet).map((r) => r.row.id)).toEqual(["e1", "e2"]);
  });

  it("los grupos planos cuentan sus filas y marcan present/hasMatches", () => {
    expect(groupById(plan, "summary").count).toBe(1);
    expect(groupById(plan, "skills").count).toBe(1);
    expect(groupById(plan, "projects").count).toBe(1);
    expect(groupById(plan, "education").count).toBe(1);
    expect(groupById(plan, "certifications").count).toBe(1);
    expect(groupById(plan, "languages").count).toBe(2);
    expect(groupById(plan, "publications").count).toBe(1);
    expect(groupById(plan, "references").count).toBe(2);
    for (const g of plan) {
      expect(g.present).toBe(true);
      expect(g.hasMatches).toBe(true);
    }
  });

  it("un grupo sin datos en el master no es present (no pinta cabecera)", () => {
    const soloResumen = computeLibPlan([row("x", "summary", { text: "solo esto" })], "");
    expect(groupById(soloResumen, "summary").present).toBe(true);
    expect(groupById(soloResumen, "skills").present).toBe(false);
    expect(groupById(soloResumen, "work").present).toBe(false);
  });
});

/* ══ 2 · EL CONTADOR NO MIENTE AL BUSCAR (la trampa del bloque) ═════════════ */
describe("computeLibPlan · al buscar, el contador cuenta lo que SE PINTA", () => {
  it("una palabra que solo casa en UNA viñeta deja el grupo en 1 rol · 1 viñeta", () => {
    const plan = computeLibPlan(masterFixture(), "idempotencia");
    const work = groupById(plan, "work");
    // MUTANTE de referencia: si el contador saliera del master sin filtrar diría
    // roles=2, bullets=5, count=7. El plan filtrado dice exactamente lo visible.
    expect(work.roles).toBe(1);
    expect(work.bullets).toBe(1);
    expect(work.count).toBe(2);
    expect(rowIds(plan, "work")).toEqual(["e1", "b2"]);
  });

  it("los grupos sin coincidencias quedan a 0 y hasMatches=false (pero siguen present)", () => {
    const plan = computeLibPlan(masterFixture(), "idempotencia");
    const otras = [
      "summary", "skills", "projects", "education",
      "certifications", "languages", "publications", "references",
    ] as LibSectionId[];
    for (const id of otras) {
      const g = groupById(plan, id);
      expect(g.count, `${id} debería no pintar filas`).toBe(0);
      expect(g.hasMatches, `${id} no tiene coincidencias`).toBe(false);
      expect(g.present, `${id} sí existe en el master`).toBe(true);
    }
  });

  it("una búsqueda que no casa con nada deja TODO a cero, sin reventar", () => {
    const plan = computeLibPlan(masterFixture(), "xyzzy-no-existe");
    expect(plan.every((g) => g.count === 0 && !g.hasMatches)).toBe(true);
    expect(plan.every((g) => g.present)).toBe(true);
  });
});

/* ══ 3 · EL FILTRADO DE LA EXPERIENCIA (roles y viñetas) ════════════════════ */
describe("computeLibPlan · filtrar experiencia sin dejar viñetas huérfanas", () => {
  it("si casa el ROL (p. ej. la empresa), salen TODAS sus viñetas como contexto", () => {
    const plan = computeLibPlan(masterFixture(), "altiplano");
    // e1 es de Altiplano: rol + sus tres viñetas; e2 (Rayén) desaparece entero.
    expect(rowIds(plan, "work")).toEqual(["e1", "b1", "b2", "b3"]);
    expect(groupById(plan, "work").roles).toBe(1);
    expect(groupById(plan, "work").bullets).toBe(3);
  });

  it("si solo casan VIÑETAS, sale la cabecera del rol + esas viñetas (no huérfanas)", () => {
    const plan = computeLibPlan(masterFixture(), "checkout");
    // Las dos viñetas de e2 mencionan checkout; e2 no casa por título/empresa.
    // MUTANTE: sin la cabecera, las viñetas quedarían sin rol (el bug viejo).
    expect(rowIds(plan, "work")).toEqual(["e2", "b4", "b5"]);
    const work = groupById(plan, "work");
    expect(work.rows[0]!.isBullet).toBe(false); // la cabecera del rol va primero
    expect(work.roles).toBe(1);
    expect(work.bullets).toBe(2);
  });

  it("un rol del que no casa NADA desaparece por completo", () => {
    const plan = computeLibPlan(masterFixture(), "cupones");
    // Solo b5 (de e2) menciona cupones. e1 no aporta ninguna fila.
    expect(rowIds(plan, "work")).toEqual(["e2", "b5"]);
    expect(rowIds(plan, "work")).not.toContain("e1");
  });
});

/* ══ 4 · AUTO-DESPLEGADO Y RESALTADO ═══════════════════════════════════════ */
describe("forcedOpenSections · abre solas las secciones con resultados y la que se edita", () => {
  it("al buscar, se fuerzan abiertas SOLO las secciones con coincidencias", () => {
    const plan = computeLibPlan(masterFixture(), "idempotencia");
    const forced = forcedOpenSections(plan, "idempotencia", null);
    expect(forced.has("work")).toBe(true);
    // MUTANTE: si se forzaran todas, estas también estarían — y no tienen filas.
    expect(forced.has("skills")).toBe(false);
    expect(forced.has("references")).toBe(false);
  });

  it("sin búsqueda no se fuerza ninguna por resultados (manda el plegado del usuario)", () => {
    const plan = computeLibPlan(masterFixture(), "");
    expect(forcedOpenSections(plan, "", null).size).toBe(0);
  });

  it("la sección del item en edición se fuerza abierta, con o sin búsqueda", () => {
    const plan = computeLibPlan(masterFixture(), "");
    expect(forcedOpenSections(plan, "", "education").has("education")).toBe(true);
    // Y se suma a las de búsqueda.
    const plan2 = computeLibPlan(masterFixture(), "idempotencia");
    const forced = forcedOpenSections(plan2, "idempotencia", "skills");
    expect(forced.has("work")).toBe(true); // por resultado
    expect(forced.has("skills")).toBe(true); // por edición
  });
});

/* ══ 5 · EL ESTADO ABIERTO/PLEGADO ═════════════════════════════════════════ */
describe("libSectionOpen · forzada-abierta gana; si no, abierta salvo plegado manual", () => {
  it("por defecto (nada plegado, nada forzado) está abierta", () => {
    expect(libSectionOpen("work", new Set(), new Set())).toBe(true);
  });

  it("plegada por el usuario está cerrada", () => {
    expect(libSectionOpen("work", new Set(["work"]), new Set())).toBe(false);
  });

  it("una forzada-abierta GANA al plegado (y no lo borra: es superposición)", () => {
    const folded = new Set(["work"]);
    // Aunque el usuario la plegó, buscar la abre; el Set de plegadas sigue intacto.
    expect(libSectionOpen("work", folded, new Set(["work"]))).toBe(true);
    expect(folded.has("work")).toBe(true);
  });
});

/* ══ 6 · EL MAPA DE KIND → SECCIÓN ═════════════════════════════════════════ */
describe("libSectionOfKind · cada kind cae en su sección; 'bullet' bajo 'work'", () => {
  it("mapea los kinds con grupo propio", () => {
    expect(libSectionOfKind("summary")).toBe("summary");
    expect(libSectionOfKind("work")).toBe("work");
    expect(libSectionOfKind("bullet")).toBe("work");
    expect(libSectionOfKind("skill")).toBe("skills");
    expect(libSectionOfKind("project")).toBe("projects");
    expect(libSectionOfKind("education")).toBe("education");
    expect(libSectionOfKind("reference")).toBe("references");
    // ⚠ EL AGUJERO QUE ESTE TEST DABA POR BUENO. Antes exigía que estos tres kinds
    // devolvieran null «porque no tienen columna», y eso era justo el bug: el enum
    // item_kind los acepta desde 0001, el master deja crearlos y el corpus.md los
    // importa, pero el documento no sabía pintarlos, así que la biblioteca los
    // escondía y no había forma de meterlos en un CV.
    expect(libSectionOfKind("certification")).toBe("certifications");
    expect(libSectionOfKind("language")).toBe("languages");
    expect(libSectionOfKind("publication")).toBe("publications");
  });

  it("un kind SIN sección en el documento devuelve null (no se inventa una columna)", () => {
    // `basics` y `link` son CONTACTO, y el contacto vive en la cabecera: no se
    // compone ni se reordena desde la biblioteca. Y un kind inventado tampoco.
    for (const k of ["link", "basics", "loquesea"]) {
      expect(libSectionOfKind(k)).toBeNull();
    }
  });
});

/* ══ 7 · TEXTO BUSCABLE ════════════════════════════════════════════════════ */
describe("libTextOf · el texto que se busca es el que se ve (referencia = línea impresa)", () => {
  it("una referencia se busca por su LÍNEA compuesta (nombre, cargo, org…)", () => {
    const txt = libTextOf("reference", { name: "Rodrigo Peña", role: "CTO", org: "Tesseract" });
    expect(txt).toContain("Rodrigo Peña");
    expect(txt).toContain("Tesseract");
    // Y por eso una búsqueda por nombre encuentra la referencia:
    const plan = computeLibPlan(masterFixture(), "rodrigo");
    expect(rowIds(plan, "references")).toEqual(["ref1"]);
  });
});

/* ══ 8 · PERSISTENCIA DEL PLEGADO (localStorage) ═══════════════════════════ */
describe("loadFoldedFrom / saveFoldedTo · preferencia de UI que sobrevive a la sesión", () => {
  const fakeStore = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => void m.set(k, v),
      _map: m,
    };
  };

  it("ida y vuelta: lo guardado se recupera igual", () => {
    const store = fakeStore();
    saveFoldedTo(store, new Set(["work", "skills"]));
    const back = loadFoldedFrom(store);
    expect(back).toEqual(new Set(["work", "skills"]));
    // Se persiste bajo la clave esperada, como lista JSON.
    expect(JSON.parse(store._map.get(LIB_FOLD_KEY)!)).toEqual(["work", "skills"]);
  });

  it("sin store (SSR / sin window) degrada a vacío sin lanzar", () => {
    expect(loadFoldedFrom(null)).toEqual(new Set());
    expect(loadFoldedFrom(undefined)).toEqual(new Set());
    expect(() => saveFoldedTo(null, new Set(["work"]))).not.toThrow();
  });

  it("un valor corrupto NO revienta la pantalla: se lee como vacío", () => {
    const store = fakeStore();
    store._map.set(LIB_FOLD_KEY, "{esto no es json");
    expect(loadFoldedFrom(store)).toEqual(new Set());
    // Y descarta lo que no sea una lista de strings.
    store._map.set(LIB_FOLD_KEY, JSON.stringify({ work: true }));
    expect(loadFoldedFrom(store)).toEqual(new Set());
    store._map.set(LIB_FOLD_KEY, JSON.stringify(["work", 3, null, "skills"]));
    expect(loadFoldedFrom(store)).toEqual(new Set(["work", "skills"]));
  });

  it("MUTANTE · si save y load usaran claves distintas, la ida y vuelta perdería el estado", () => {
    // Ancla la clave: save escribe en LIB_FOLD_KEY y load lee de LIB_FOLD_KEY.
    const store = fakeStore();
    saveFoldedTo(store, new Set(["references"]));
    expect(store._map.has(LIB_FOLD_KEY)).toBe(true);
    expect(loadFoldedFrom(store).has("references")).toBe(true);
  });
});
