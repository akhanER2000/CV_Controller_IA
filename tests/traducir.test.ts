import { describe, it, expect } from "vitest";
import {
  preservesFacts,
  preservesFactsWhenShortening,
  preservaHechosAlTraducir,
} from "../src/lib/verify";
import {
  EQUIVALENCIAS_ENTIDAD,
  ORIGEN_TRADUCCION,
  SIN_TRADUCCIONES,
  avisoDeTraduccion,
  campoBilingue,
  clasificarCampo,
  construirTraduccion,
  datosBilingues,
  detectarIdioma,
  esEspejo,
  indiceDeTraducciones,
  lineaBilingue,
  planificarTraduccion,
  promptDeTraduccion,
  traducirFecha,
  traducirPorTabla,
  traducirVocabulario,
  verificarTraduccion,
  type ItemTraducible,
  type TraduccionLLM,
} from "../src/lib/cv/traducir";

/* ============================================================================
   EL CV BILINGÜE — los tests están escritos para ROMPER el motor, no para
   acompañarlo. Cada bloque inyecta el mutante que corresponde y comprueba que
   MUERE: un modelo que se come una cifra, uno que se inventa una tecnología, uno
   que cambia la magnitud, uno que devuelve claves que nadie pidió, uno que se
   calla. Si alguien «simplifica» el candado, aquí se entera de qué se lleva por
   delante.

   ⚠ El doble honesto marca lo traducido con el prefijo minúsculo «tr:» a
     propósito. La primera versión usaba «EN::» y TODOS los casos honestos
     fallaban: «EN» es un acrónimo en mayúsculas, `extractEntities` lo caza y el
     candado lo denunciaba como entidad inventada. El candado tenía razón y el
     fixture estaba mal — queda escrito para que nadie lo vuelva a poner.
   ============================================================================ */

// La viñeta del contrato de producto, con dos cifras y una tecnología.
const VINETA = "Reduje la latencia p99 de 850 ms a 180 ms migrando el pipeline a Kafka";
const VINETA_EN = "Cut p99 latency from 850 ms to 180 ms by migrating the pipeline to Kafka";

describe("traducir · por qué hacía falta un TERCER candado y no valía ninguno de los dos", () => {
  it("1 · preservesFacts APRUEBA una traducción que se come las dos cifras y Kafka", () => {
    const pobre = "Improved latency";
    // ★ El agujero, escrito como test: cero cifras nuevas, cero entidades nuevas.
    expect(preservesFacts(VINETA, pobre).ok).toBe(true);
    // Y sin embargo se ha comido 850, 180, 99 y Kafka.
    const v = preservaHechosAlTraducir(VINETA, pobre, EQUIVALENCIAS_ENTIDAD);
    expect(v.ok).toBe(false);
    expect(v.lostNumbers).toEqual(expect.arrayContaining(["850", "180"]));
    expect(v.lostEntities).toContain("kafka");
  });

  it("2 · preservesFactsWhenShortening RECHAZA una traducción impecable, y por el motivo equivocado", () => {
    // El caso que lo demuestra es EN → ES, donde el español es SIEMPRE más largo.
    const en = "Led a 6-person team";
    const es = "Lideré un equipo de 6 personas";
    const r = preservesFactsWhenShortening(en, es);
    expect(r.lostNumbers).toEqual([]);
    expect(r.newNumbers).toEqual([]);
    expect(r.lostEntities).toEqual([]);
    expect(r.shorter).toBe(false); // ← el ÚNICO motivo del rechazo
    expect(r.ok).toBe(false);
    // El candado de traducción, que no exige longitud, la acepta.
    expect(preservaHechosAlTraducir(en, es, EQUIVALENCIAS_ENTIDAD).ok).toBe(true);
  });

  it("3 · una traducción honesta pasa en los DOS sentidos", () => {
    expect(preservaHechosAlTraducir(VINETA, VINETA_EN, EQUIVALENCIAS_ENTIDAD).ok).toBe(true);
    expect(preservaHechosAlTraducir(VINETA_EN, VINETA, EQUIVALENCIAS_ENTIDAD).ok).toBe(true);
  });
});

describe("traducir · el candado, mutante a mutante", () => {
  it("cifra PERDIDA — «~300 personas» → «the team» se cae", () => {
    const v = preservaHechosAlTraducir("Coordiné a ~300 personas", "Coordinated the team", EQUIVALENCIAS_ENTIDAD);
    expect(v.ok).toBe(false);
    expect(v.lostNumbers).toContain("300");
  });

  it("cifra INVENTADA — el modelo adorna con un 40 % que no existía", () => {
    const v = preservaHechosAlTraducir(
      "Reduje el coste de infraestructura",
      "Cut infrastructure cost by 40 %",
      EQUIVALENCIAS_ENTIDAD,
    );
    expect(v.ok).toBe(false);
    expect(v.newNumbers.join(" ")).toContain("40");
  });

  it("MAGNITUD cambiada — 850 → 85 se caza por los dos lados a la vez", () => {
    const mentira = "Cut p99 latency from 85 ms to 18 ms by migrating the pipeline to Kafka";
    const v = preservaHechosAlTraducir(VINETA, mentira, EQUIVALENCIAS_ENTIDAD);
    expect(v.ok).toBe(false);
    expect(v.lostNumbers).toEqual(expect.arrayContaining(["850", "180"]));
    expect(v.newNumbers).toEqual(expect.arrayContaining(["85", "18"]));
  });

  it("UNIDAD cambiada — 40 % no es 40x aunque el número sea el mismo", () => {
    const v = preservaHechosAlTraducir("Bajé el coste un 40 %", "Cut cost 40x", EQUIVALENCIAS_ENTIDAD);
    expect(v.ok).toBe(false);
  });

  it("ENTIDAD inventada — traducir no autoriza a meter Kubernetes", () => {
    const v = preservaHechosAlTraducir(
      "Desplegué el servicio con Docker",
      "Deployed the service with Docker and Kubernetes",
      EQUIVALENCIAS_ENTIDAD,
    );
    expect(v.ok).toBe(false);
    expect(v.newEntities).toContain("kubernetes");
  });

  it("traducción VACÍA — un fallo mudo del modelo también es un fallo", () => {
    const v = preservaHechosAlTraducir(VINETA, "   ", EQUIVALENCIAS_ENTIDAD);
    expect(v.ok).toBe(false);
    expect(v.vacia).toBe(true);
    expect(verificarTraduccion(VINETA, "  ")).toEqual({ ok: false, razon: "la traducción llegó vacía" });
  });

  it("la sigla que SÍ cambia de idioma no se castiga: IA ⇄ AI", () => {
    const es = "Lideré el equipo de IA de la compañía";
    const en = "Led the company AI team";
    expect(preservaHechosAlTraducir(es, en, EQUIVALENCIAS_ENTIDAD).ok).toBe(true);
    // Sin la tabla, esa misma traducción correcta se rechazaría. Es la prueba de
    // que la tabla no es un adorno: es lo que evita un candado que miente.
    expect(preservaHechosAlTraducir(es, en).ok).toBe(false);
  });

  it("★ la tabla de equivalencias es CERRADA: Kafka no puede convertirse en Pulsar", () => {
    const v = preservaHechosAlTraducir(
      "Migré el pipeline a Kafka",
      "Migrated the pipeline to Pulsar",
      EQUIVALENCIAS_ENTIDAD,
    );
    expect(v.ok).toBe(false);
    expect(v.lostEntities).toContain("kafka");
  });
});

describe("traducir · la vía determinista (lo que NO se paga)", () => {
  it("«mar 2022 – actualidad» → «mar 2022 – Present», y el año no se toca", () => {
    expect(traducirFecha("mar 2022 – actualidad", "en")).toBe("mar 2022 – Present");
    expect(traducirFecha("Marzo 2022 – la actualidad", "en")).toBe("March 2022 – Present");
    expect(traducirFecha("2019 – 2022", "en")).toBe("2019 – 2022");
  });

  it("y al revés: «Mar 2022 – Present» → «Mar 2022 – Actualidad»", () => {
    expect(traducirFecha("Mar 2022 – Present", "es")).toBe("Mar 2022 – Actualidad");
    expect(traducirFecha("March 2022 to June 2024", "es")).toBe("Marzo 2022 a Junio 2024");
  });

  it("una fecha traducida CONSERVA todas sus cifras — pasa su propio candado", () => {
    const original = "ene 2019 – dic 2022";
    const traducida = traducirFecha(original, "en");
    expect(traducida).toBe("jan 2019 – dec 2022");
    expect(preservaHechosAlTraducir(original, traducida, EQUIVALENCIAS_ENTIDAD).ok).toBe(true);
  });

  it("la ciudad se COPIA y la modalidad se traduce: nada de tablas de topónimos", () => {
    expect(traducirVocabulario("Santiago, Chile", "en")).toBe("Santiago, Chile");
    expect(traducirVocabulario("Remoto", "en")).toBe("Remote");
    expect(traducirVocabulario("Santiago, Chile · Remoto", "en")).toBe("Santiago, Chile · Remote");
    expect(traducirVocabulario("Nativo", "en")).toBe("Native");
  });

  it("traducirPorTabla enruta fechas a la tabla de fechas y el resto a la de vocabulario", () => {
    expect(traducirPorTabla("dates", "ene 2020", "en")).toBe("jan 2020");
    expect(traducirPorTabla("location", "Remoto", "en")).toBe("Remote");
    expect(traducirPorTabla("level", "Avanzado", "en")).toBe("Advanced");
  });
});

describe("traducir · la clasificación, que es la que decide cuánto se paga", () => {
  it("nombres propios y tecnologías se COPIAN: PharmIQ es PharmIQ, Python es Python", () => {
    for (const campo of ["name", "company", "institution", "items", "url", "email"]) {
      expect(clasificarCampo(campo).via, campo).toBe("copiar");
    }
  });

  it("fechas y vocabulario cerrado van por TABLA (cero tokens)", () => {
    for (const campo of ["dates", "dateStart", "location", "level"]) {
      expect(clasificarCampo(campo).via, campo).toBe("tabla");
    }
  });

  it("solo lo REDACTADO va al modelo", () => {
    for (const campo of ["text", "description", "title", "degree", "group"]) {
      expect(clasificarCampo(campo).via, campo).toBe("modelo");
    }
  });

  it("★ un campo NO declarado se copia literal y se AVISA — nunca se descarta en silencio", () => {
    const c = clasificarCampo("campoQueNadieDeclaro");
    expect(c.via).toBe("copiar");
    expect(c.noDeclarado).toBe(true);
    const plan = planificarTraduccion([{ id: "x", kind: "work", data: { campoQueNadieDeclaro: "algo" } }], "en");
    expect(plan.noDeclarados).toContain("campoQueNadieDeclaro");
    // el valor sobrevive: copiado, no perdido
    expect(plan.copiados.find((c2) => c2.campo === "campoQueNadieDeclaro")?.resultado).toBe("algo");
  });
});

/* Un master pequeño pero REALISTA: un rol con dos viñetas, un grupo de skills, un
   proyecto y una educación. Sirve para medir el reparto del gasto. */
const MASTER: ItemTraducible[] = [
  {
    id: "w1",
    kind: "work",
    data: {
      title: "Desarrollador Backend",
      company: "PharmIQ",
      location: "Santiago, Chile",
      dates: "mar 2022 – actualidad",
    },
  },
  { id: "b1", kind: "bullet", data: { text: VINETA } },
  { id: "b2", kind: "bullet", data: { text: "Coordiné a ~300 personas en la migración" } },
  { id: "s1", kind: "skill", data: { group: "Infraestructura", items: "Docker, Kubernetes, Terraform" } },
  {
    id: "p1",
    kind: "project",
    data: { name: "Corpus", description: "Gestor de CV con verificación de evidencia", url: "https://ejemplo.cl" },
  },
  {
    id: "e1",
    kind: "education",
    data: { degree: "Ingeniería Civil Informática", institution: "Universidad de Chile", dates: "2015 – 2020" },
  },
];

describe("traducir · el PLAN (puro, gratis y medible)", () => {
  it("manda al modelo SOLO lo redactado; el resto se copia o va por tabla", () => {
    const plan = planificarTraduccion(MASTER, "en");
    const campos = (l: { campo: string }[]) => l.map((c) => c.campo).sort();

    expect(campos(plan.modelo)).toEqual(["degree", "description", "group", "text", "text", "title"]);
    expect(campos(plan.tabla)).toEqual(["dates", "dates", "location"]);
    expect(campos(plan.copiados)).toEqual(["company", "institution", "items", "name", "url"]);

    // El número que justifica la vía determinista: la MAYORÍA de los campos no
    // llega al modelo. Si alguien mete `company` o `items` en la vía cara, este
    // número sube y el test lo grita.
    expect(plan.modelo.length).toBe(6);
    expect(plan.copiados.length + plan.tabla.length).toBe(8);
  });

  it("★ NO SE RE-TRADUCE: un item ya traducido no entra al plan ni cuesta un token", () => {
    const conUno = MASTER.map((i) => (i.id === "b1" ? { ...i, yaTraducido: true } : i));
    const plan = planificarTraduccion(conUno, "en");
    expect(plan.yaTraducidos).toBe(1);
    expect(plan.items.some((i) => i.id === "b1")).toBe(false);
    expect(plan.modelo.some((c) => c.itemId === "b1")).toBe(false);
  });

  it("un campo vacío no se manda al modelo (pagar por traducir «» es pagar por nada)", () => {
    const plan = planificarTraduccion([{ id: "s", kind: "summary", data: { text: "   " } }], "en");
    expect(plan.modelo).toEqual([]);
    expect(plan.copiados).toHaveLength(1);
  });

  it("las claves internas (_origin, _source) no son contenido del CV y no viajan", () => {
    const plan = planificarTraduccion([{ id: "x", kind: "bullet", data: { text: "Hola", _origin: "extracted" } }], "en");
    expect(plan.modelo.map((c) => c.campo)).toEqual(["text"]);
    expect([...plan.copiados, ...plan.tabla].some((c) => c.campo.startsWith("_"))).toBe(false);
  });
});

/* ── Modelos falsos: cada uno con su forma de mentir ─────────────────────────── */

/** Traduce «bien» (marcando el texto con un prefijo inocuo). Línea base. */
const llmHonesto: TraduccionLLM = async (p) =>
  p.textos.map((t) => ({ clave: t.clave, traduccion: t.texto === VINETA ? VINETA_EN : `tr:${t.texto}` }));

describe("traducir · construir la propuesta con modelos que mienten", () => {
  it("caso honesto: se propone traducción y nada queda incompleto", async () => {
    const r = await construirTraduccion({ items: MASTER, hacia: "en" }, { llm: llmHonesto });
    expect(r.hacia).toBe("en");
    expect(r.desde).toBe("es");
    expect(r.descartados).toEqual([]);
    expect(r.propuestas.every((p) => !p.incompleta)).toBe(true);
    // La viñeta traducida de verdad conserva sus cifras y Kafka.
    const b1 = r.propuestas.find((p) => p.itemId === "b1")!;
    expect(b1.data.text).toBe(VINETA_EN);
    // Y la fecha salió de la TABLA, sin pasar por el modelo.
    const w1 = r.propuestas.find((p) => p.itemId === "w1")!;
    expect(w1.data.dates).toBe("mar 2022 – Present");
    expect(w1.data.company).toBe("PharmIQ");
    expect(w1.campos.find((c) => c.campo === "dates")?.via).toBe("tabla");
  });

  it("★ MUTANTE 1 — el modelo se come una cifra: NO se ofrece, el campo se queda con el ORIGINAL", async () => {
    const llmComeCifras: TraduccionLLM = async (p) =>
      p.textos.map((t) => ({ clave: t.clave, traduccion: t.campo === "text" ? "Improved latency" : `tr:${t.texto}` }));
    const r = await construirTraduccion({ items: MASTER, hacia: "en" }, { llm: llmComeCifras });

    const b1 = r.propuestas.find((p) => p.itemId === "b1")!;
    expect(b1.data.text).toBe(VINETA); // el hecho sobrevive LITERAL, no se pierde
    expect(b1.incompleta).toBe(true);
    expect(b1.campos.find((c) => c.campo === "text")?.sinTraducir).toBe(true);

    const d = r.descartados.find((x) => x.itemId === "b1")!;
    expect(d.propuesto).toBe("Improved latency");
    expect(d.razon).toContain("se pierden cifras");
    expect(d.perdidas.cifras).toEqual(expect.arrayContaining(["850", "180"]));
    expect(r.resumen.camposRechazados).toBeGreaterThan(0);
  });

  it("★ MUTANTE 2 — el modelo INVENTA una cifra: se descarta y se nombra la cifra", async () => {
    const llmAdorna: TraduccionLLM = async (p) =>
      p.textos.map((t) => ({
        clave: t.clave,
        traduccion: t.campo === "description" ? "CV manager with 99 % evidence verification" : `tr:${t.texto}`,
      }));
    const r = await construirTraduccion({ items: MASTER, hacia: "en" }, { llm: llmAdorna });
    const d = r.descartados.find((x) => x.campo === "description")!;
    expect(d.razon).toContain("aparecen cifras que no estaban");
    expect(d.nuevas.cifras.join(" ")).toContain("99");
    expect(r.propuestas.find((p) => p.itemId === "p1")!.data.description).toBe(
      "Gestor de CV con verificación de evidencia",
    );
  });

  it("★ MUTANTE 3 — el modelo devuelve claves que NADIE pidió: se ignoran", async () => {
    const llmRuidoso: TraduccionLLM = async (p) => [
      ...p.textos.map((t) => ({ clave: t.clave, traduccion: `tr:${t.texto}` })),
      { clave: "inventado:text", traduccion: "Senior Staff Principal Engineer at Google" },
    ];
    const r = await construirTraduccion({ items: MASTER, hacia: "en" }, { llm: llmRuidoso });
    expect(r.propuestas.some((p) => p.itemId === "inventado")).toBe(false);
    expect(JSON.stringify(r.propuestas)).not.toContain("Google");
  });

  it("★ MUTANTE 4 — el modelo se CALLA: no hay traducción muda, se dice y se conserva el original", async () => {
    const llmMudo: TraduccionLLM = async () => [];
    const r = await construirTraduccion({ items: MASTER, hacia: "en" }, { llm: llmMudo });
    expect(r.descartados).toHaveLength(6); // los seis campos de la vía modelo
    for (const d of r.descartados) expect(d.razon).toContain("no devolvió traducción");
    // Y las filas siguen siendo CIERTAS: cada campo con su texto original.
    expect(r.propuestas.find((p) => p.itemId === "b1")!.data.text).toBe(VINETA);
    expect(r.propuestas.every((p) => p.incompleta)).toBe(true);
  });

  it("★ MUTANTE 5 — el modelo no puede traducir un NOMBRE PROPIO porque no se le enseña", async () => {
    const vistos: string[] = [];
    const llmEspia: TraduccionLLM = async (p) => {
      vistos.push(...p.textos.map((t) => t.texto));
      return p.textos.map((t) => ({ clave: t.clave, traduccion: `tr:${t.texto}` }));
    };
    await construirTraduccion({ items: MASTER, hacia: "en" }, { llm: llmEspia });
    expect(vistos).not.toContain("PharmIQ");
    expect(vistos).not.toContain("Docker, Kubernetes, Terraform");
    expect(vistos).not.toContain("https://ejemplo.cl");
    expect(vistos).not.toContain("mar 2022 – actualidad");
    expect(vistos).toContain(VINETA);
  });

  it("los lotes trocean el gasto y se cuentan (ni una llamada por campo, ni una sola gigante)", async () => {
    let llamadas = 0;
    const llm: TraduccionLLM = async (p) => {
      llamadas++;
      return p.textos.map((t) => ({ clave: t.clave, traduccion: `tr:${t.texto}` }));
    };
    const r = await construirTraduccion({ items: MASTER, hacia: "en" }, { llm, porLote: 2 });
    expect(llamadas).toBe(3); // 6 campos de modelo / 2 por lote
    expect(r.resumen.lotes).toBe(3);
  });

  it("`copiar` conserva el VALOR CRUDO: una lista de enlaces no se convierte en texto", async () => {
    const conLinks: ItemTraducible[] = [
      {
        id: "bs",
        kind: "basics",
        data: {
          name: "Ana Pérez",
          label: "Ingeniera",
          links: ["https://a.cl", { label: "GitHub", url: "https://gh" }],
        },
      },
    ];
    const r = await construirTraduccion({ items: conLinks, hacia: "en" }, { llm: llmHonesto });
    const p = r.propuestas[0]!;
    expect(Array.isArray(p.data.links)).toBe(true);
    expect((p.data.links as unknown[]).length).toBe(2);
    expect(p.data.name).toBe("Ana Pérez"); // el nombre de la persona no se traduce
    expect(p.data.label).toBe("tr:Ingeniera");
  });
});

describe("traducir · avisos que NO bloquean (se ofrece, marcado)", () => {
  it("vocabulario delator que no estaba en el original", () => {
    const a = avisoDeTraduccion("Mantuve el servicio de pagos", "Spearheaded the robust payments service");
    expect(a).toContain("suena a IA");
  });

  it("un texto que crece el doble se marca, pero no se tumba", () => {
    const orig = "Mantuve el servicio de pagos de la compañía durante dos años seguidos";
    const larga = `${orig} ${orig} ${orig}`;
    expect(avisoDeTraduccion(orig, larga)).toContain("más del doble");
    // No es un rechazo: el candado de hechos lo deja pasar y decide el usuario.
    expect(preservaHechosAlTraducir(orig, larga, EQUIVALENCIAS_ENTIDAD).ok).toBe(true);
  });

  it("un cargo corto que se alarga al traducir NO se marca (el umbral solo mira textos con cuerpo)", () => {
    expect(avisoDeTraduccion("Dev", "Desarrollador de software")).toBeUndefined();
  });
});

describe("traducir · la SIMETRÍA: da igual en qué idioma subas", () => {
  it("detectarIdioma acierta en los dos sentidos y admite no saberlo", () => {
    expect(detectarIdioma("Lideré el equipo de backend de la compañía durante dos años")).toBe("es");
    expect(detectarIdioma("Led the backend team of the company for two years")).toBe("en");
    expect(detectarIdioma("Kafka Docker")).toBe(null); // sin evidencia: no se inventa
    expect(detectarIdioma("")).toBe(null);
  });

  it("un master en INGLÉS se traduce al español con las mismas reglas", async () => {
    const enMaster: ItemTraducible[] = [
      {
        id: "w",
        kind: "work",
        lang: "en",
        data: { title: "Backend Developer", company: "PharmIQ", dates: "Mar 2022 – Present" },
      },
      { id: "b", kind: "bullet", lang: "en", data: { text: VINETA_EN } },
    ];
    const llm: TraduccionLLM = async (p) =>
      p.textos.map((t) => ({ clave: t.clave, traduccion: t.texto === VINETA_EN ? VINETA : "Desarrollador Backend" }));
    const r = await construirTraduccion({ items: enMaster, hacia: "es", desde: "en" }, { llm });
    expect(r.hacia).toBe("es");
    expect(r.descartados).toEqual([]);
    expect(r.propuestas.find((p) => p.itemId === "w")!.data.dates).toBe("Mar 2022 – Actualidad");
    expect(r.propuestas.find((p) => p.itemId === "b")!.data.text).toBe(VINETA);
  });
});

describe("traducir · la LECTURA bilingüe (de dos filas a un I18n)", () => {
  const original = { id: "b1", data: { text: VINETA }, origin: "extracted", translated_from: null, lang: "es" };
  const espejo = {
    id: "b1-en",
    data: { text: VINETA_EN },
    origin: ORIGEN_TRADUCCION,
    translated_from: "b1",
    lang: "en",
  };

  it("el índice solo recoge ESPEJOS, y los indexa por el id del ORIGINAL", () => {
    const idx = indiceDeTraducciones([original, espejo]);
    expect(esEspejo(original)).toBe(false);
    expect(esEspejo(espejo)).toBe(true);
    expect(idx.en.get("b1")).toEqual({ text: VINETA_EN });
    expect(idx.es.size).toBe(0);
  });

  it("con traducción, cada lado dice lo suyo", () => {
    const idx = indiceDeTraducciones([original, espejo]);
    expect(campoBilingue(original, "text", idx)).toEqual({ es: VINETA, en: VINETA_EN });
  });

  it("★ SIN traducción, el otro idioma cae al ORIGINAL — nunca a un hueco", () => {
    const idx = indiceDeTraducciones([original]);
    expect(campoBilingue(original, "text", idx)).toEqual({ es: VINETA, en: VINETA });
    // Es exactamente el comportamiento de antes de que existiera la traducción:
    // un master sin traducir no puede rendir peor que ayer.
    expect(campoBilingue(original, "text", SIN_TRADUCCIONES)).toEqual({ es: VINETA, en: VINETA });
  });

  it("★ un master en INGLÉS traducido al español NO se apoya en la columna `lang`", () => {
    // El pipeline escribe lang:"es" para TODO, así que este item inglés viene
    // etiquetado como español. Si la lectura preguntara por `lang`, devolvería el
    // inglés en el lado español y la simetría sería mentira.
    const ingles = { id: "x", data: { text: VINETA_EN }, origin: "extracted", translated_from: null, lang: "es" };
    const aEspanol = {
      id: "x-es",
      data: { text: VINETA },
      origin: ORIGEN_TRADUCCION,
      translated_from: "x",
      lang: "es",
    };
    const idx = indiceDeTraducciones([ingles, aEspanol]);
    expect(campoBilingue(ingles, "text", idx)).toEqual({ es: VINETA, en: VINETA_EN });
  });

  it("una fila espejo sin `translated_from` (original borrado) no entra al índice", () => {
    const huerfana = { id: "h", data: { text: "x" }, origin: ORIGEN_TRADUCCION, translated_from: null, lang: "en" };
    const idx = indiceDeTraducciones([huerfana]);
    expect(idx.en.size).toBe(0);
  });

  it("un `lang` que no es ni es ni en se ignora en vez de romper el render", () => {
    const raro = { id: "r", data: { text: "x" }, origin: ORIGEN_TRADUCCION, translated_from: "b1", lang: "pt" };
    const idx = indiceDeTraducciones([raro]);
    expect(idx.es.size + idx.en.size).toBe(0);
  });

  it("la línea compuesta se arma DENTRO de cada idioma (el conector es del documento)", () => {
    const proj = {
      id: "p",
      data: { name: "Corpus", description: "Gestor de CV" },
      origin: "manual",
      translated_from: null,
      lang: "es",
    };
    const projEn = {
      id: "p-en",
      data: { name: "Corpus", description: "CV manager" },
      origin: ORIGEN_TRADUCCION,
      translated_from: "p",
      lang: "en",
    };
    const idx = indiceDeTraducciones([proj, projEn]);
    expect(lineaBilingue(proj, ["name", "description"], " — ", idx)).toEqual({
      es: "Corpus — Gestor de CV",
      en: "Corpus — CV manager",
    });
  });

  it("datosBilingues devuelve el objeto ENTERO por idioma (para los helpers de línea)", () => {
    const idx = indiceDeTraducciones([original, espejo]);
    const d = datosBilingues(original, idx);
    expect(d.es).toEqual({ text: VINETA });
    expect(d.en).toEqual({ text: VINETA_EN });
  });
});

describe("traducir · el prompt (medible sin llamar a nadie)", () => {
  it("lleva las reglas duras y una línea por clave pedida", () => {
    const p = promptDeTraduccion({
      desde: "es",
      hacia: "en",
      textos: [{ clave: "b1:text", kind: "bullet", campo: "text", texto: VINETA }],
    });
    expect(p).toContain("[b1:text] (bullet.text)");
    expect(p).toContain("CIFRAS son intocables");
    expect(p).toContain("no reformulas ni mejoras");
    // ★ El registro de CV, que es lo ÚNICO que justifica el modelo bueno.
    expect(p).toContain("Led a 6-person team");
    expect(p).toContain("professional CV English");
  });
});
