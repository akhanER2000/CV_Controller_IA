import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  repartir, repartirPorFuente, fuentesTeselan, conserva, textoPara, clasificarTitulo, tokensDeTitulo,
  EXTRACTORES_5, DICCIONARIO, CLAVES_DESCARTABLES, CLAVES_NARRATIVAS, ENCABEZADOS_PERFIL,
  MAX_CHARS_PERFIL, MIN_ENCABEZADOS_PERFIL,
  type Reparto, type Extractor5, type Fuente,
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
// D4 · EL CUBO PELIGROSO. Ahora solo caben INSTRUCCIONES, y aun así se cuenta.
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

  it("☠ un título que es a la vez relato y sección de CV → gana el extractor", () => {
    // «BLOQUE 3 — Experiencia real» y «BLOQUE 4 — Logros con números» son
    // preguntas de cuestionario Y son la experiencia del usuario.
    for (const frag of ["BLOQUE 3", "BLOQUE 4"]) {
      const s = seccionPorTitulo(R, frag)!;
      expect(s.cubo, `«${s.titulo}» no puede ser contexto`).toBe("dirigido");
      expect(s.destinos).toContain("work");
    }
  });

  it("lo descartable es una lista CERRADA: nada casa por parecerse un poco", () => {
    // Títulos que suenan a relleno pero no están en la lista → difuso, no descarte.
    for (const t of ["Reflexiones", "Anécdotas del equipo", "Mi filosofía", "Comentarios", "Nota del autor"]) {
      expect(clasificarTitulo(t).tipo, t).toBe("nada");
    }
    // Y lo que sí está, casa.
    expect(clasificarTitulo("CÓMO USAR ESTE DOCUMENTO").tipo).toBe("descartable");
    expect(clasificarTitulo("Tabla de contenidos").tipo).toBe("descartable");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D5 · LAS NUEVE NARRATIVAS. Lo que se perdía era justo la VOZ del CV.
// ════════════════════════════════════════════════════════════════════════════
describe("D5 · una sección de relato NO se descarta: se lee con `basics`", () => {
  /** Las nueve que el dossier real mandaba al limbo, con su tratamiento debido. */
  const NUEVE: [string, "narrativa" | "descartable"][] = [
    ["CÓMO USAR ESTE DOCUMENTO", "descartable"],   // la ÚNICA que sí sobra: son instrucciones
    ["13 · QUÉ BUSCA", "narrativa"],               // el rol objetivo
    ["14 · CONTEXTO QUE HUMANIZA", "narrativa"],
    ["BLOQUE 2 — Tu historia", "narrativa"],       // la materia del resumen
    ["BLOQUE 6 — Visión y futuro", "narrativa"],
    ["BLOQUE 7 ⭐ — Qué buscas AHORA", "narrativa"],
    ["BLOQUE 9 — Fuera de la computación", "narrativa"],
    ["BLOQUE 10 — Pruebas sociales", "narrativa"],
    ["BLOQUE 12 — Preguntas incómodas", "narrativa"],
  ];

  it("★★ ocho de las nueve llegan a `basics`; solo las INSTRUCCIONES se descartan", () => {
    for (const [frag, esperado] of NUEVE) {
      const s = seccionPorTitulo(R, frag);
      expect(s, `no existe sección con «${frag}»`).toBeTruthy();
      if (esperado === "narrativa") {
        expect(s!.motivo, `«${s!.titulo}» debería ser narrativa`).toBe("narrativa");
        expect(s!.cubo).toBe("dirigido");
        expect(s!.destinos, `«${s!.titulo}» tiene que llegar a basics`).toEqual(["basics"]);
      } else {
        expect(s!.cubo, `«${s!.titulo}» son instrucciones`).toBe("contexto");
        expect(s!.destinos).toEqual([]);
      }
    }
  });

  it("★★ el texto de las narrativas LLEGA de verdad al corpus de basics", () => {
    // Que el reparto lo diga no basta: se comprueba contra `textoPara`, que es lo
    // que se manda. Este es el test que habría cazado la pérdida original.
    const basics = textoPara(DOSSIER, R, "basics");
    for (const [frag, esperado] of NUEVE) {
      if (esperado !== "narrativa") continue;
      const s = seccionPorTitulo(R, frag)!;
      const cuerpo = DOSSIER.slice(s.inicio, s.fin);
      const marca = cuerpo.split("\n").find((l) => l.trim().length > 20)?.trim();
      expect(marca, frag).toBeTruthy();
      expect(basics.includes(marca!), `«${s.titulo}» no llegó a basics`).toBe(true);
    }
  });

  it("★ el reparto las NOMBRA y las CUENTA aparte del contexto (el aviso es otro)", () => {
    expect(R.narrativas.length).toBe(8);
    for (const n of R.narrativas) {
      expect(n.titulo.trim()).not.toBe("");
      expect(n.caracteres).toBeGreaterThan(0);
    }
    // y ninguna se cuela también en `contexto`: son listas disjuntas
    const ctx = new Set(R.contexto.map((c) => c.titulo));
    for (const n of R.narrativas) expect(ctx.has(n.titulo), n.titulo).toBe(false);
  });

  it("☠☠ MUTANTE · si las narrativas volvieran al descarte, se pierden 26 KB", () => {
    // La prueba de que esto no es cosmético: se mide lo que dejaría de leerse.
    const rescatado = R.narrativas.reduce((n, s) => n + s.caracteres, 0);
    expect(rescatado, "las narrativas del dossier real pesan ~26 KB").toBeGreaterThan(25_000);
    // …y lo que SÍ sigue sin leerse es solo el manual de instrucciones.
    expect(R.totales.contexto).toBeLessThan(2_000);
  });

  it("☠ una narrativa NO se convierte en ancestro: su hija no hereda «esto es prosa»", () => {
    // Si heredara, una subsección de «Tu historia» que describiera un cargo iría
    // SOLO a basics y perdería los otros cuatro extractores. Cae al difuso.
    const doc = "# BLOQUE 2 — Tu historia\nrelato\n## Un subtítulo sin claves\naquí hay un cargo escondido";
    const r = repartir(doc);
    expect(r.secciones.find((s) => s.titulo.includes("Tu historia"))!.destinos).toEqual(["basics"]);
    expect(r.secciones.find((s) => s.titulo.includes("subtítulo"))!.destinos).toEqual([...EXTRACTORES_5]);
  });

  it("☠ pero una narrativa colgada de EXPERIENCIA sigue siendo experiencia (la herencia manda)", () => {
    const doc = "# EXPERIENCIA PROFESIONAL\nroles\n## Tu historia en la empresa\nrelato con datos";
    const s = repartir(doc).secciones.find((x) => x.titulo.includes("Tu historia"))!;
    expect(s.cubo).toBe("dirigido");
    expect(s.motivo).toBe("heredado");
    expect(s.destinos).toContain("work");
  });

  it("★ las dos listas siguen siendo disjuntas y la de descarte, mínima", () => {
    const enAmbas = CLAVES_DESCARTABLES.filter((c) => CLAVES_NARRATIVAS.includes(c));
    expect(enAmbas, "una clave en las dos listas hace impredecible el orden").toEqual([]);
    expect(CLAVES_DESCARTABLES.length, "la lista de descarte tiene que seguir siendo mínima").toBeLessThanOrEqual(12);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D6 · REPARTO POR FUENTE. Una captura no puede heredar del dossier anterior.
// ════════════════════════════════════════════════════════════════════════════
describe("D6 · cada documento se reparte con SU estructura", () => {
  const CAPTURA = [
    "Experiencia",
    "Backend Developer",
    "Altiplano Pagos SpA · Jornada completa",
    "mar. 2022 - actualidad",
    "Reduje la latencia p95 un 38% con caché semántica.",
    "",
    "Aptitudes",
    "Go",
    "PostgreSQL",
    "",
    "Educación",
    "Universidad Andrés Bello",
    "Ingeniería Civil en Computación",
  ].join("\n");

  const armarCombinado = (cabeza: string, capturas: string[]) => {
    let raw = cabeza;
    const fuentes: Fuente[] = [{ etiqueta: "texto pegado", inicio: 0, fin: raw.length }];
    capturas.forEach((c, i) => {
      const desde = raw.length;
      raw += `\n\n[captura-${i + 1}.png]\n${c}`;
      fuentes.push({ etiqueta: `captura-${i + 1}.png`, inicio: desde, fin: raw.length });
    });
    return { raw, fuentes };
  };

  /* Una cabeza LARGA a propósito: por encima de MAX_CHARS_PERFIL el detector de
     encabezados de perfil se apaga (C2), que es exactamente lo que pasa en el
     caso real —un dossier de 104 KB con las capturas pegadas detrás— y lo que
     hace que la captura no abra sección propia dentro del amasijo. */
  const CABEZA_LARGA =
    "# EDUCACIÓN\nIngeniería Civil en Computación — UNAB, 2015 – 2019.\n" +
    "Detalle del plan de estudios y de las asignaturas cursadas. ".repeat(400);

  it("☠☠ EL FALLO GRAVE · en el amasijo, una captura HEREDA la última sección del dossier", () => {
    // Este es el test que demuestra que el bug era real y de PÉRDIDA, no de coste.
    const { raw, fuentes } = armarCombinado(CABEZA_LARGA, [CAPTURA]);
    expect(raw.length, "el amasijo tiene que superar el umbral de perfil").toBeGreaterThan(MAX_CHARS_PERFIL);

    const amasijo = repartir(raw);
    // La captura no abre sección propia: se queda dentro de «# EDUCACIÓN»…
    expect(textoPara(raw, amasijo, "work"), "en el amasijo la experiencia NO llega a work").toBe("");
    expect(textoPara(raw, amasijo, "education")).toContain("Backend Developer");

    // …y por fuente, la captura decide sola: su «Experiencia» va a work.
    const porFuente = repartirPorFuente(raw, fuentes);
    expect(textoPara(raw, porFuente, "work")).toContain("Backend Developer");
    expect(textoPara(raw, porFuente, "skills")).toContain("PostgreSQL");
    expect(conserva(raw, porFuente), "el reparto por fuente sigue conservando el documento").toBe(true);
  });

  it("★★ CONSERVACIÓN · repartir por fuente sigue devolviendo el documento exacto", () => {
    const { raw, fuentes } = armarCombinado(DOSSIER, [CAPTURA, CAPTURA, CAPTURA]);
    const r = repartirPorFuente(raw, fuentes);
    expect(conserva(raw, r)).toBe(true);
    expect(r.secciones.reduce((n, s) => n + s.caracteres, 0)).toBe(raw.length);
    expect(r.totales.dirigido + r.totales.difuso + r.totales.contexto).toBe(raw.length);
    expect(r.secciones.map((s) => raw.slice(s.inicio, s.fin)).join("")).toBe(raw);
  });

  it("★ cada sección sabe de qué DOCUMENTO salió", () => {
    const { raw, fuentes } = armarCombinado(CABEZA_LARGA, [CAPTURA]);
    const r = repartirPorFuente(raw, fuentes);
    expect(r.fuentes).toBe(2);
    expect(new Set(r.secciones.map((s) => s.fuente))).toEqual(new Set(["texto pegado", "captura-1.png"]));
  });

  it("☠ unos tramos que NO teselan el texto se IGNORAN y se cae al reparto normal", () => {
    // Cualquier hueco o solape rompería la conservación. Antes que arriesgarla, se
    // reparte como siempre: peor coste, cero pérdida.
    const texto = "# EDUCACIÓN\ncarrera\n\n[x]\nmás";
    for (const malas of [
      [{ etiqueta: "a", inicio: 1, fin: texto.length }],                       // no empieza en 0
      [{ etiqueta: "a", inicio: 0, fin: 5 }],                                  // no llega al final
      [{ etiqueta: "a", inicio: 0, fin: 10 }, { etiqueta: "b", inicio: 8, fin: texto.length }],   // solape
      [{ etiqueta: "a", inicio: 0, fin: 10 }, { etiqueta: "b", inicio: 12, fin: texto.length }],  // hueco
      [] as Fuente[],
    ]) {
      expect(fuentesTeselan(malas, texto.length), JSON.stringify(malas)).toBe(false);
      const r = repartirPorFuente(texto, malas);
      expect(conserva(texto, r)).toBe(true);
      expect(r.fuentes, "se cayó al reparto de siempre").toBe(1);
    }
  });

  it("☠ forzarCompleto ignora los tramos: la vía de escape no puede leer menos", () => {
    const { raw, fuentes } = armarCombinado("# EDUCACIÓN\ncarrera", [CAPTURA]);
    const f = repartirPorFuente(raw, fuentes, { forzarCompleto: true });
    expect(f.forzado).toBe(true);
    for (const ex of EXTRACTORES_5) expect(textoPara(raw, f, ex)).toBe(raw);
  });

  it("★ un solo documento por fuente da EXACTAMENTE el mismo reparto que sin tramos", () => {
    const uno: Fuente[] = [{ etiqueta: "texto pegado", inicio: 0, fin: DOSSIER.length }];
    const a = repartirPorFuente(DOSSIER, uno);
    const b = repartir(DOSSIER);
    expect(a.secciones.map((s) => ({ ...s, fuente: undefined }))).toEqual(b.secciones.map((s) => ({ ...s, fuente: undefined })));
    expect(a.totales).toEqual(b.totales);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ENCABEZADOS DE PERFIL TRANSCRITO. La heurística con dos candados.
// ════════════════════════════════════════════════════════════════════════════
describe("encabezados de perfil · «Experiencia» a secas SÍ es un título… a veces", () => {
  const PERFIL = "Experiencia\nBackend Developer\nAltiplano Pagos\n\nAptitudes\nGo, SQL\n\nIdiomas\nInglés B2";

  it("★ una transcripción con VARIOS encabezados de perfil se enruta por ellos", () => {
    const r = repartir(PERFIL);
    expect(r.secciones.find((s) => s.titulo === "Experiencia")!.destinos).toEqual(["work"]);
    expect(r.secciones.find((s) => s.titulo === "Aptitudes")!.destinos).toEqual(["skills"]);
    expect(r.secciones.find((s) => s.titulo === "Idiomas")!.destinos).toEqual(["skills"]);
    expect(conserva(PERFIL, r)).toBe(true);
  });

  it("☠☠ C1 · UN encabezado suelto NO activa nada (el falso positivo del dossier real)", () => {
    // En el dossier real, la línea 2364 dice exactamente «Experiencia»: es un
    // jirón de una tabla a dos columnas dentro de «BLOQUE 12 — Preguntas
    // incómodas». Con el detector suelto, media sección se iría a `work`.
    expect(MIN_ENCABEZADOS_PERFIL).toBe(2);
    const suelto = "Un párrafo cualquiera sobre nada.\nExperiencia\ny sigue la frase de la otra columna.";
    const r = repartir(suelto);
    expect(r.secciones, "un solo encabezado de perfil no parte el documento").toHaveLength(1);
    expect(r.secciones[0]!.motivo).toBe("sin-encabezados");
  });

  it("☠☠ C1 · y en el DOSSIER REAL ese «Experiencia» sigue sin partir BLOQUE 12", () => {
    const i = DOSSIER.indexOf("\nExperiencia\n");
    expect(i, "el falso positivo sigue en el documento (por eso hay candado)").toBeGreaterThan(0);
    expect(R.secciones.some((s) => s.titulo === "Experiencia"), "se coló como encabezado").toBe(false);
  });

  it("☠☠ C2 · un documento LARGO nunca es un perfil, por muchos encabezados que tenga", () => {
    const relleno = "x".repeat(MAX_CHARS_PERFIL);
    const largo = `${PERFIL}\n${relleno}`;
    expect(largo.length).toBeGreaterThan(MAX_CHARS_PERFIL);
    expect(repartir(largo).secciones, "un dossier no es una captura").toHaveLength(1);
  });

  it("☠ no casa a mitad de línea ni en viñetas, tablas o etiquetas de archivo", () => {
    for (const linea of [
      "- Experiencia",              // viñeta
      "| Aptitudes |",              // tabla
      "> Idiomas",                  // cita
      "[captura-experiencia.png]",  // etiqueta de archivo del pipeline
      "Experiencia laboral en Chile", // no es la línea entera
      "Experiencia:",               // termina en dos puntos
    ]) {
      const doc = `${linea}\ncuerpo\nAptitudes\nGo\nIdiomas\nInglés`;
      const r = repartir(doc);
      expect(r.secciones.some((s) => s.titulo === linea), linea).toBe(false);
    }
  });

  it("★ la lista de encabezados decide QUÉ es título, no A DÓNDE va", () => {
    // «Destacado» y «Recomendaciones» abren sección pero no casan con ninguna
    // clave: caen al difuso, que es la respuesta segura.
    const doc = "Experiencia\nrol\n\nDestacado\nalgo\n\nRecomendaciones\nalguien dijo algo";
    const r = repartir(doc);
    expect(r.secciones.find((s) => s.titulo === "Destacado")!.destinos).toEqual([...EXTRACTORES_5]);
    expect(r.secciones.find((s) => s.titulo === "Recomendaciones")!.destinos).toEqual([...EXTRACTORES_5]);
  });

  it("★ la lista está normalizada (si no, no casaría nunca) y no tiene duplicados", () => {
    for (const c of ENCABEZADOS_PERFIL) {
      expect(c, `«${c}» tiene mayúsculas`).toBe(c.toLowerCase());
      expect(c.normalize("NFD").replace(/\p{Mn}/gu, ""), `«${c}» lleva acentos`).toBe(c);
      expect(/^[a-z0-9 ]+$/.test(c), `«${c}» tiene caracteres que tokensDeTitulo borra`).toBe(true);
    }
    expect(new Set(ENCABEZADOS_PERFIL).size).toBe(ENCABEZADOS_PERFIL.length);
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
    const todas = [...Object.values(DICCIONARIO).flat(), ...CLAVES_DESCARTABLES, ...CLAVES_NARRATIVAS];
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

  it("★ «a confirmar» no está en NINGUNA de las dos listas (ahí vive el teléfono)", () => {
    const todas = [...CLAVES_DESCARTABLES, ...CLAVES_NARRATIVAS];
    expect(todas.some((c: string) => c.includes("confirmar"))).toBe(false);
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
