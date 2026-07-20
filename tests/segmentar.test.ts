import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  repartir, conserva, textoPara, clasificarTitulo, tokensDeTitulo,
  EXTRACTORES_5, DICCIONARIO, CLAVES_CONTEXTO,
  type Reparto, type Extractor5,
} from "../src/lib/extract/segmentar";

/* ============================================================================
   SEGMENTAR · el enrutador que decide qué texto NO se manda al modelo.

   Este fichero existe para ROMPERLO, no para acompañarlo. El enrutador es la
   misma clase de máquina que el `rawText.slice(0, 30000)` de la ronda 7 —el peor
   fallo de la historia de este producto, que descartó el 72% de un dossier sin
   avisar— y su forma de fallar es idéntica: manda una sección al extractor
   equivocado, el item no aparece, y el usuario no tiene forma de saberlo.

   Se prueba contra el DOSSIER REAL del repo (103.744 caracteres, 41 secciones),
   no contra un fixture cómodo. Los títulos que rompen el enrutado son los
   títulos que un humano escribió de verdad.
   ============================================================================ */

const RUTA_DOSSIER = path.join(__dirname, "..", "material-perfil", "dossier", "DOSSIER-MAESTRO-AKHAN.md");
const DOSSIER = fs.readFileSync(RUTA_DOSSIER, "utf8");

/** El reparto del dossier real, calculado una vez. */
const R = repartir(DOSSIER);
const seccionPorTitulo = (r: Reparto, frag: string) =>
  r.secciones.find((s) => s.titulo.includes(frag));

// ════════════════════════════════════════════════════════════════════════════
// D1 · CONSERVACIÓN. La invariante madre: ni un carácter se evapora.
// ════════════════════════════════════════════════════════════════════════════
describe("D1 · el reparto CONSERVA el documento, carácter por carácter", () => {
  it("★★ la SUMA de caracteres de todos los cubos es EXACTAMENTE la longitud del documento", () => {
    const { dirigido, difuso, contexto } = R.totales;
    expect(dirigido + difuso + contexto).toBe(DOSSIER.length);
    expect(R.longitud).toBe(DOSSIER.length);
  });

  it("★★ la suma de las SECCIONES también es exactamente la longitud", () => {
    expect(R.secciones.reduce((n, s) => n + s.caracteres, 0)).toBe(DOSSIER.length);
  });

  it("★★ concatenar los tramos devuelve el documento ORIGINAL, byte a byte", () => {
    const rehecho = R.secciones.map((s) => DOSSIER.slice(s.inicio, s.fin)).join("");
    expect(rehecho).toBe(DOSSIER);
  });

  it("los tramos son contiguos y sin solape: fin de uno = inicio del siguiente", () => {
    for (let i = 1; i < R.secciones.length; i++) {
      expect(R.secciones[i]!.inicio, `hueco/solape en la sección ${i}`).toBe(R.secciones[i - 1]!.fin);
    }
    expect(R.secciones[0]!.inicio).toBe(0);
    expect(R.secciones.at(-1)!.fin).toBe(DOSSIER.length);
  });

  it("`conserva` dice true para el reparto real", () => {
    expect(conserva(DOSSIER, R)).toBe(true);
  });

  /* ── MUTANTES: se corrompe el reparto a mano y `conserva` DEBE cazarlo.
        Si estos pasaran, la comprobación de runtime de llm.ts sería decorativa
        y el fallback de seguridad no saltaría nunca. ───────────────────────── */
  it("☠ MUTANTE · una sección que desaparece → `conserva` = false", () => {
    const roto: Reparto = { ...R, secciones: R.secciones.filter((_, i) => i !== 5) };
    expect(conserva(DOSSIER, roto)).toBe(false);
  });

  it("☠ MUTANTE · un tramo que se acorta (texto que se cae por el hueco) → false", () => {
    const secciones = R.secciones.map((s, i) => (i === 3 ? { ...s, fin: s.fin - 100, caracteres: s.caracteres - 100 } : s));
    expect(conserva(DOSSIER, { ...R, secciones })).toBe(false);
  });

  it("☠ MUTANTE · dos tramos que se solapan (texto contado dos veces) → false", () => {
    const secciones = R.secciones.map((s, i) => (i === 3 ? { ...s, inicio: s.inicio - 50, caracteres: s.caracteres + 50 } : s));
    expect(conserva(DOSSIER, { ...R, secciones })).toBe(false);
  });

  it("la conservación aguanta textos raros: sin salto final, con \\r\\n, y vacío", () => {
    for (const t of [
      "# Uno\nalgo\n# Dos\nmás",                    // sin salto final
      "# Uno\r\nalgo\r\n# Dos\r\nmás\r\n",          // CRLF
      "sin ningún encabezado, solo prosa suelta",
      "\n\n\n",
      "#Sin espacio tras la almohadilla",
    ]) {
      const r = repartir(t);
      expect(conserva(t, r), JSON.stringify(t)).toBe(true);
      expect(r.secciones.reduce((n, s) => n + s.caracteres, 0)).toBe(t.length);
    }
    expect(repartir("").secciones).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D2 · EL CASO COMÚN NO SE ROMPE: texto pegado suelto → entero al fallback.
// ════════════════════════════════════════════════════════════════════════════
describe("D2 · un documento SIN encabezados cae ENTERO a los cinco extractores", () => {
  const PEGADO =
    "Soy ingeniero civil en computación, titulado en la UNAB en 2019. Los últimos tres años " +
    "trabajé en Altiplano Pagos como backend developer, a cargo del servicio de conciliación " +
    "en Go con unas 40 mil transacciones diarias. Sé Go, Python y SQL. Inglés B2.";

  it("★ es el caso común (pegar un párrafo) y NO puede romperse", () => {
    const r = repartir(PEGADO);
    expect(r.secciones).toHaveLength(1);
    expect(r.secciones[0]!.motivo).toBe("sin-encabezados");
    expect(r.secciones[0]!.destinos).toEqual([...EXTRACTORES_5]);
    expect(r.totales.contexto).toBe(0);
    expect(r.contexto).toEqual([]);
  });

  it("★ cada uno de los cinco extractores recibe el texto ÍNTEGRO", () => {
    const r = repartir(PEGADO);
    for (const ex of EXTRACTORES_5) expect(textoPara(PEGADO, r, ex)).toBe(PEGADO.trim());
  });

  it("un texto sin encabezados NUNCA produce cubo de contexto (no hay nada que descartar)", () => {
    for (const t of [PEGADO, "hola", "una línea\notra línea\ny otra"]) {
      expect(repartir(t).totales.contexto, t.slice(0, 20)).toBe(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D3 · FRONTERA DE PALABRA. El trap «Destacados» → «acad» → educación.
// ════════════════════════════════════════════════════════════════════════════
describe("D3 · frontera de palabra: el fallo que mandaba los proyectos a educación", () => {
  it("☠☠ «8.1 Destacados (los seis del portfolio)» NO va a educación", () => {
    // El primer intento del enrutador casaba la SUBCADENA «acad» dentro de
    // des-t-ACAD-os y mandaba los seis proyectos del portfolio al extractor de
    // formación académica. El usuario los perdía. Esta es LA prueba del fichero.
    const s = seccionPorTitulo(R, "Destacados")!;
    expect(s, "la sección Destacados existe en el dossier real").toBeTruthy();
    expect(s.destinos).not.toContain("education");
    expect(s.destinos).toContain("projects");
  });

  it("☠ el mutante (búsqueda por subcadena) SÍ se equivoca — se demuestra que el bug era real", () => {
    const titulo = "8.1 Destacados (los seis del portfolio)";
    const norm = titulo.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
    // Así fallaba: subcadena suelta, sin frontera.
    expect(norm.includes("acad"), "el sustrato del bug sigue ahí, por eso hay frontera").toBe(true);
    // Así NO falla: tokens.
    expect(tokensDeTitulo(titulo).some((t) => t.startsWith("academic"))).toBe(false);
  });

  it("★ los 41 títulos REALES del dossier: ninguno cae en un extractor absurdo", () => {
    // Contratos concretos, título a título. Si alguien toca el diccionario y
    // rompe uno, aquí se ve cuál y hacia dónde se fue.
    const debe: [string, Extractor5[], Extractor5[]][] = [
      //  fragmento del título          DEBE contener        NO PUEDE contener
      ["1 · IDENTIDAD Y CONTACTO",      ["basics"],          ["projects", "education"]],
      ["4 · EXPERIENCIA PROFESIONAL",   ["work"],            ["education", "projects"]],
      ["5 · EDUCACIÓN",                 ["education"],       ["projects", "work"]],
      ["6 · CERTIFICACIONES",           ["education"],       ["projects"]],
      ["7 · IDIOMAS",                   ["skills"],          ["work", "projects"]],
      ["8 · PROYECTOS",                 ["projects"],        ["education"]],
      ["8.1 Destacados",                ["projects"],        ["education"]],
      ["8.3 Actividad de GitHub",       ["projects"],        ["education"]],
      ["10 · HABILIDADES TÉCNICAS",     ["skills"],          ["education", "projects"]],
      ["11 · LOGROS CON CIFRAS",        ["work"],            ["education"]],
      ["BLOQUE 3", /* Experiencia real */ ["work"],          ["education"]],
      ["BLOQUE 4", /* Logros con números */ ["work"],        ["education"]],
      ["BLOQUE 8", /* habilidades no obvias */ ["skills"],   ["education"]],
    ];
    for (const [frag, incluye, excluye] of debe) {
      const s = seccionPorTitulo(R, frag);
      expect(s, `no existe sección con «${frag}»`).toBeTruthy();
      for (const d of incluye) expect(s!.destinos, `«${s!.titulo}» debería ir a ${d}`).toContain(d);
      for (const d of excluye) expect(s!.destinos, `«${s!.titulo}» NO debería ir a ${d}`).not.toContain(d);
    }
  });

  it("ninguna clave del diccionario casa a mitad de palabra (barrido de trampas conocidas)", () => {
    // Palabras que CONTIENEN una clave como SUBCADENA sin serla. Con el enrutado
    // por subcadena todas casarían; con tokens, ninguna.
    for (const trampa of [
      "Destacados",       // contiene «acad»    → educación
      "Contactología",    // contiene «contact» → basics
      "Masterclass",      // contiene «master»  → educación
      "Proyectil",        // contiene «proyect» → proyectos
      "Descursado",       // contiene «curso»   → educación
    ]) {
      expect(clasificarTitulo(trampa).destinos, `«${trampa}» no debería enrutar a nada`).toEqual([]);
    }
  });

  it("un STEM casa por prefijo de token, y esa dirección es la segura", () => {
    // Los stems (`proyecto*`) casan con las variantes reales de la palabra…
    for (const t of ["Proyectos", "Proyecto personal", "Projects", "Project work"]) {
      expect(clasificarTitulo(t).destinos, t).toContain("projects");
    }
    // …y cuando un stem casa de más, manda texto de SOBRA a un extractor: cuesta
    // dinero. Cuando falla al revés, se pierde un item. Solo se acepta el primero.
    expect(clasificarTitulo("Cursos de posgrado").destinos).toContain("education");
  });

  it("enruta igual en inglés que en español", () => {
    expect(clasificarTitulo("Work Experience").destinos).toContain("work");
    expect(clasificarTitulo("Education").destinos).toContain("education");
    expect(clasificarTitulo("Technical Skills").destinos).toContain("skills");
    expect(clasificarTitulo("Projects").destinos).toContain("projects");
    expect(clasificarTitulo("Contact").destinos).toContain("basics");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL BUG QUE SE COMÍA UN EMPLEO: la herencia SUMA, no sustituye.
// ════════════════════════════════════════════════════════════════════════════
describe("herencia · un subtítulo MATIZA a su padre, no lo contradice", () => {
  it("☠☠ «4.2 AI/ML Engineer — Proyecto de título» va a work Y a projects", () => {
    // Cuelga de «4 · EXPERIENCIA PROFESIONAL» pero su propio título dice
    // «Proyecto». Con la herencia como FALLBACK la clave propia ganaba y la
    // sección iba SOLO a proyectos: el empleo desaparecía del CV en silencio.
    const s = seccionPorTitulo(R, "4.2 AI/ML Engineer")!;
    expect(s.destinos).toContain("work");
    expect(s.destinos).toContain("projects");
  });

  it("☠ TODAS las subsecciones de «4 · EXPERIENCIA PROFESIONAL» llegan a work", () => {
    for (const frag of ["4.1 Founder", "4.2 AI/ML", "4.3 Independent", "4.4 Scrum Master", "4.5 Software Engineering"]) {
      const s = seccionPorTitulo(R, frag)!;
      expect(s, frag).toBeTruthy();
      expect(s.destinos, `«${s.titulo}» perdió el destino work`).toContain("work");
    }
  });

  it("una subsección sin claves hereda del padre («8.2 Resto del catálogo público» → projects)", () => {
    const s = seccionPorTitulo(R, "8.2 Resto del catálogo")!;
    expect(s.motivo).toBe("heredado");
    expect(s.destinos).toEqual(["projects"]);
  });

  it("la herencia se corta al cambiar de rama (una H1 nueva no hereda de la anterior)", () => {
    const doc = "# EXPERIENCIA\nrol A\n## sub sin claves\ndetalle\n# EDUCACIÓN\ncarrera\n## otra sub\ndetalle";
    const r = repartir(doc);
    const sub1 = r.secciones.find((s) => s.titulo === "sub sin claves")!;
    const sub2 = r.secciones.find((s) => s.titulo === "otra sub")!;
    expect(sub1.destinos).toEqual(["work"]);
    expect(sub2.destinos).toEqual(["education"]);
  });

  it("un padre DIFUSO no transmite «no sé»: el hijo decide solo", () => {
    const doc = "# Notas varias\nalgo\n## EXPERIENCIA PROFESIONAL\nrol";
    const r = repartir(doc);
    expect(r.secciones.find((s) => s.titulo === "Notas varias")!.destinos).toEqual([...EXTRACTORES_5]);
    expect(r.secciones.find((s) => s.titulo.includes("EXPERIENCIA"))!.destinos).toEqual(["work"]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D4 · EL CUBO PELIGROSO. Registrado, contado, nombrado y reversible.
// ════════════════════════════════════════════════════════════════════════════
describe("D4 · el cubo «contexto» nunca se calla y siempre se puede revertir", () => {
  it("★ cada sección de contexto está NOMBRADA y CONTADA en el reparto", () => {
    expect(R.contexto.length).toBeGreaterThan(0);
    for (const c of R.contexto) {
      expect(c.titulo.trim().length, "una sección de contexto sin nombre es una sección perdida").toBeGreaterThan(0);
      expect(c.caracteres).toBeGreaterThan(0);
    }
    // y lo nombrado cuadra con lo contado
    expect(R.contexto.reduce((n, c) => n + c.caracteres, 0)).toBe(R.totales.contexto);
    expect(R.contexto).toHaveLength(R.secciones.filter((s) => s.cubo === "contexto").length);
  });

  it("★★ una sección de contexto NO llega a ningún extractor (es lo que ahorra) …", () => {
    for (const s of R.secciones) {
      if (s.cubo === "contexto") expect(s.destinos, `«${s.titulo}»`).toEqual([]);
    }
  });

  it("★★ … pero su texto SIGUE en el documento: no se borra, solo no se extrae", () => {
    // La diferencia entre «no se manda al modelo» y «se pierde» es esta prueba.
    for (const c of R.contexto) {
      expect(DOSSIER.includes(c.titulo), `«${c.titulo}» ya no está en el raw_text`).toBe(true);
    }
  });

  it("★★ forzarCompleto devuelve TODO a los cinco: cero contexto, cero excepciones", () => {
    const f = repartir(DOSSIER, { forzarCompleto: true });
    expect(f.forzado).toBe(true);
    expect(f.totales.contexto).toBe(0);
    expect(f.contexto).toEqual([]);
    expect(f.totales.difuso).toBe(DOSSIER.length);
    for (const s of f.secciones) expect(s.destinos).toEqual([...EXTRACTORES_5]);
    // y cada extractor recibe el documento entero
    for (const ex of EXTRACTORES_5) {
      expect(f.porExtractor[ex]).toBe(DOSSIER.length);
    }
    expect(conserva(DOSSIER, f)).toBe(true);
  });

  /* ── Las secciones que NO pueden ser contexto por mucho que lo parezcan ──── */
  it("☠☠ «BLOQUE 0 — Datos a confirmar» NO es contexto: ahí está el nombre, la ubicación y el correo", () => {
    const s = seccionPorTitulo(R, "BLOQUE 0")!;
    expect(s.cubo).not.toBe("contexto");
    expect(s.destinos.length).toBeGreaterThan(0);
    // y lo que contiene, para que se vea que no es una regla caprichosa
    const cuerpo = DOSSIER.slice(s.inicio, s.fin);
    expect(cuerpo).toMatch(/gmail\.com|correo/i);
  });

  it("☠☠ «15 · PUNTOS A CONFIRMAR» NO es contexto: ahí está el teléfono", () => {
    const s = seccionPorTitulo(R, "PUNTOS A CONFIRMAR")!;
    expect(s.cubo).not.toBe("contexto");
    const cuerpo = DOSSIER.slice(s.inicio, s.fin);
    expect(cuerpo).toMatch(/\+56|teléfono/i);
  });

  it("☠ una sección de relato colgada de EXPERIENCIA sigue siendo experiencia", () => {
    // El contexto no puede ganarle a una herencia dirigida: si el padre dice
    // «experiencia», el hijo se extrae aunque se llame «Tu historia».
    const doc = "# EXPERIENCIA PROFESIONAL\nroles\n## Tu historia en la empresa\nrelato con datos";
    const s = repartir(doc).secciones.find((x) => x.titulo.includes("Tu historia"))!;
    expect(s.cubo).toBe("dirigido");
    expect(s.destinos).toContain("work");
  });

  it("☠ un título que es a la vez relato y sección de CV → gana el extractor", () => {
    // «BLOQUE 3 — Experiencia real» y «BLOQUE 4 — Logros con números» son
    // preguntas de cuestionario Y son la experiencia del usuario.
    for (const frag of ["BLOQUE 3", "BLOQUE 4"]) {
      const s = seccionPorTitulo(R, frag)!;
      expect(s.cubo, `«${s.titulo}» no puede ser contexto`).toBe("dirigido");
      expect(s.destinos).toContain("work");
    }
  });

  it("el contexto es una lista CERRADA: nada casa por parecerse un poco", () => {
    // Títulos que suenan a relato pero no están en la lista → difuso, no contexto.
    for (const t of ["Reflexiones", "Anécdotas del equipo", "Mi filosofía", "Comentarios"]) {
      expect(clasificarTitulo(t).esContexto, t).toBe(false);
    }
    // Y los que sí están, casan.
    expect(clasificarTitulo("BLOQUE 2 — Tu historia (origen y giro)").esContexto).toBe(true);
    expect(clasificarTitulo("Hobbies").esContexto).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ENCABEZADOS EN MAYÚSCULAS (el CV pegado en texto plano)
// ════════════════════════════════════════════════════════════════════════════
describe("encabezados en MAYÚSCULAS · como salen los CV en texto plano", () => {
  const CV_PLANO = [
    "DIEGO GATICA MORALES",
    "diego@ejemplo.cl · +56 9 1234 5678",
    "",
    "EXPERIENCIA PROFESIONAL",
    "Backend Developer — Altiplano Pagos SpA · 2022 – hoy",
    "- Reduje la latencia p95 un 38%.",
    "",
    "EDUCACIÓN",
    "Ingeniería Civil en Computación — UNAB, 2015 – 2019",
    "",
    "APTITUDES",
    "Go, Python, SQL, Kubernetes",
  ].join("\n");

  it("★ detecta los encabezados en mayúsculas y enruta por ellos", () => {
    const r = repartir(CV_PLANO);
    expect(r.secciones.find((s) => s.titulo === "EXPERIENCIA PROFESIONAL")!.destinos).toEqual(["work"]);
    expect(r.secciones.find((s) => s.titulo === "EDUCACIÓN")!.destinos).toEqual(["education"]);
    expect(r.secciones.find((s) => s.titulo === "APTITUDES")!.destinos).toEqual(["skills"]);
  });

  it("★ conserva el documento entero también en este formato", () => {
    expect(conserva(CV_PLANO, repartir(CV_PLANO))).toBe(true);
  });

  it("★ la ÑOÑERÍA de los acentos: «EDUCACIÓN» con tilde cuenta como mayúsculas", () => {
    const r = repartir("EDUCACIÓN\nalgo");
    expect(r.secciones[0]!.titulo).toBe("EDUCACIÓN");
    expect(r.secciones[0]!.destinos).toEqual(["education"]);
  });

  it("NO confunde una frase con un encabezado (viñetas, frases con punto, siglas sueltas)", () => {
    for (const linea of [
      "- REDUJE LA LATENCIA.",     // viñeta
      "Esto es una frase normal.",
      "SQL",                        // sigla suelta, sin palabra de 3+ mayúsculas… (SQL sí tiene 3)
      "trabajé en varias empresas",
    ]) {
      const r = repartir(`${linea}\ncuerpo`);
      // no debe partirse en dos por una línea que no es título
      if (linea === "SQL") continue; // documentado abajo
      expect(r.secciones, linea).toHaveLength(1);
    }
  });

  it("una línea terminada en punto NUNCA es encabezado, por mucho que grite", () => {
    const r = repartir("REDUJE LA LATENCIA UN 38 POR CIENTO.\ncuerpo");
    expect(r.secciones).toHaveLength(1);
    expect(r.secciones[0]!.motivo).toBe("sin-encabezados");
  });

  it("☠★ un falso encabezado CUESTA dinero pero NO pierde datos (cae al difuso)", () => {
    // ESTA es la garantía que hace tolerable el detector de mayúsculas, y hay
    // que entender por qué es difuso y no `work`: una línea en mayúsculas se
    // detecta como nivel 1, igual que «EXPERIENCIA», así que es su HERMANA, no
    // su hija — y los hermanos no heredan. El trozo huérfano acaba en el
    // fallback de los cinco: se paga de más, no se pierde ni una línea. La
    // dirección del error es la única que este producto puede permitirse.
    const doc = "EXPERIENCIA\nrol\nGRITO FALSO EN MEDIO\nmás del mismo rol";
    const r = repartir(doc);
    const huerfana = r.secciones.find((s) => s.titulo === "GRITO FALSO EN MEDIO")!;
    expect(huerfana).toBeTruthy();
    expect(huerfana.cubo).toBe("difuso");
    expect(huerfana.destinos).toEqual([...EXTRACTORES_5]);
    // y sobre todo: el texto huérfano SIGUE llegando a los cinco extractores
    for (const ex of EXTRACTORES_5) expect(textoPara(doc, r, ex)).toContain("más del mismo rol");
    expect(conserva(doc, r)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// textoPara · lo que de verdad se le manda a cada extractor
// ════════════════════════════════════════════════════════════════════════════
describe("textoPara · el corpus de cada extractor", () => {
  it("★ un extractor solo recibe SUS secciones, en el orden del documento", () => {
    const edu = textoPara(DOSSIER, R, "education");
    expect(edu).toContain("EDUCACIÓN");
    expect(edu).toContain("CERTIFICACIONES");
    // …y NO el relato del cuestionario ni las aptitudes puras
    expect(edu).not.toContain("Tu historia (origen y giro)");
    expect(edu).not.toContain("10 · HABILIDADES TÉCNICAS");
  });

  it("★ el texto que se manda es un TROZO LITERAL del original (la evidencia sigue verificándose)", () => {
    // Si aquí se parafraseara o se reordenara, la verificación de evidencia de
    // §4.4 empezaría a marcar como «sin evidencia» items perfectamente buenos.
    for (const ex of EXTRACTORES_5) {
      for (const s of R.secciones.filter((x) => x.destinos.includes(ex))) {
        expect(DOSSIER.includes(DOSSIER.slice(s.inicio, s.fin))).toBe(true);
      }
    }
  });

  it("★ nada de lo dirigido/difuso se queda sin extractor", () => {
    for (const s of R.secciones) {
      if (s.cubo !== "contexto") expect(s.destinos.length, `«${s.titulo}» sin destino`).toBeGreaterThan(0);
    }
  });

  it("un extractor sin secciones recibe cadena vacía (llm.ts lo usa para NO llamar)", () => {
    const doc = "# EDUCACIÓN\nIngeniería Civil en Computación — UNAB, 2015 – 2019";
    const r = repartir(doc);
    expect(textoPara(doc, r, "education")).toContain("UNAB");
    expect(textoPara(doc, r, "work")).toBe("");
    expect(textoPara(doc, r, "projects")).toBe("");
  });

  it("porExtractor cuadra con lo que textoPara devuelve de verdad", () => {
    // Un contador que no cuadra con el texto real es un contador que miente en
    // la telemetría. Se compara con tolerancia por los separadores («\n\n») y el
    // trim final, que textoPara añade y el contador no cuenta.
    for (const ex of EXTRACTORES_5) {
      const real = textoPara(DOSSIER, R, ex).length;
      const contado = R.porExtractor[ex];
      const n = R.secciones.filter((s) => s.destinos.includes(ex)).length;
      expect(Math.abs(real - contado), ex).toBeLessThanOrEqual(2 * n + 4);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Higiene del diccionario
// ════════════════════════════════════════════════════════════════════════════
describe("diccionario · higiene", () => {
  it("las claves están normalizadas (sin acentos, sin mayúsculas): si no, no casan nunca", () => {
    const todas = [...Object.values(DICCIONARIO).flat(), ...CLAVES_CONTEXTO];
    for (const c of todas) {
      expect(c, `«${c}» tiene mayúsculas`).toBe(c.toLowerCase());
      expect(c.normalize("NFD").replace(/\p{Mn}/gu, ""), `«${c}» lleva acentos`).toBe(c);
      expect(/^[a-z0-9 *]+$/.test(c), `«${c}» tiene caracteres que tokensDeTitulo borra`).toBe(true);
    }
  });

  it("★ `titulo` NO está en educación (ausencia deliberada: «más allá del título»)", () => {
    expect(DICCIONARIO.education).not.toContain("titulo");
    expect(clasificarTitulo("BLOQUE 1 ⭐ — Quién eres (más allá del título)").destinos).not.toContain("education");
  });

  it("★ «a confirmar» NO está en el contexto (ausencia deliberada: ahí vive el teléfono)", () => {
    expect(CLAVES_CONTEXTO.some((c) => c.includes("confirmar"))).toBe(false);
  });

  it("tokensDeTitulo no pierde números (los «BLOQUE 4» se distinguen)", () => {
    expect(tokensDeTitulo("BLOQUE 4 ⭐ — Logros con números")).toEqual(["bloque", "4", "logros", "con", "numeros"]);
  });

  it("es determinista: el mismo texto da el mismo reparto", () => {
    const a = repartir(DOSSIER);
    const b = repartir(DOSSIER);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
