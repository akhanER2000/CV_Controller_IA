/* ============================================================================
   LAS COSTURAS · lo que otros agentes dejaron marcado y no podía quedarse así.

   Este test vigila tres promesas que el producto no se puede permitir romper:

   1 · NINGUNA PANTALLA PRESENTA DATOS DE UNA PERSONA INVENTADA COMO DEL USUARIO.
       /tailor y /salud eran maquetas rotuladas como producto: el análisis de un
       tal «Diego Gatica» —«Altiplano Pagos», «~40.000 tx diarias», «2 viñetas de
       la página 1 sin cifra»— servido a cualquiera que llegara desde la barra de
       SU editor, con el [id] de la ruta ignorado. Aquí se comprueba que esas
       cifras no pueden volver: ni en el código, ni —sobre todo— en el
       diccionario, que es donde vivía de verdad el texto que el usuario leía.

   2 · EL «VOLVER» DE VARIANTES ESTÁ VIVO, Y NO INVENTA VIAJES. Staging enlaza
       con ?from= desde hace tiempo y nadie lo leía. Ahora se lee — pero Variantes
       es una pestaña raíz, así que la miga solo aparece si el viaje existe.

   3 · LA INTERFAZ NO AFIRMA HABER GUARDADO LO QUE NO GUARDÓ. «Actualizar» /
       «Mantener» eran optimistas y locales: cambiaban un booleano en React y
       anunciaban «Ahora está al día» a los lectores de pantalla.

   MÉTODO. Ataca funciones PURAS donde las hay (rutaDeLaVariante, debeMostrarMiga,
   enLotes) y el texto fuente donde no. El escaneo del fuente se hace SIN
   COMENTARIOS: las cabeceras explican qué se retiró y citan las cifras viejas a
   propósito —esa memoria es parte del arreglo— y no deben disparar el guardián.
   No monta React: el entorno es node.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { rutaDeLaVariante as rutaTailor } from "../src/components/screens/TailorScreen";
import { rutaDeLaVariante as rutaSalud } from "../src/components/screens/SaludScreen";
import { debeMostrarMiga, enLotes } from "../src/components/screens/VariantesScreen";
import { withOrigin } from "../src/components/Breadcrumb";
import { HREF_VARIANTES } from "../src/components/screens/StagingScreen";
import { tailor } from "../src/lib/i18n/dict/tailor";
import { salud } from "../src/lib/i18n/dict/salud";
import { variantes } from "../src/lib/i18n/dict/variantes";
import { master } from "../src/lib/i18n/dict/master";
import { editor } from "../src/lib/i18n/dict/editor";

const here = path.dirname(fileURLToPath(import.meta.url));
const leer = (rel: string) => readFileSync(path.join(here, rel), "utf8");

/**
 * Quita comentarios de línea y de bloque respetando los literales de cadena.
 * Sin esto, la cabecera de TailorScreen —que cita las cifras inventadas para
 * explicar por qué se fueron— haría fallar al guardián que las prohíbe, y la
 * única salida sería borrar la memoria del arreglo. La memoria se queda.
 */
function sinComentarios(src: string): string {
  let out = "";
  let modo: "code" | "line" | "block" | "'" | '"' | "`" = "code";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const d = src[i + 1];
    if (modo === "code") {
      if (c === "/" && d === "/") { modo = "line"; i++; continue; }
      if (c === "/" && d === "*") { modo = "block"; i++; continue; }
      if (c === "'" || c === '"' || c === "`") modo = c;
      out += c;
      continue;
    }
    if (modo === "line") { if (c === "\n") { modo = "code"; out += c; } continue; }
    if (modo === "block") { if (c === "*" && d === "/") { modo = "code"; i++; } continue; }
    // dentro de un literal de cadena
    if (c === "\\") { out += c + (d ?? ""); i++; continue; }
    if (c === modo) modo = "code";
    out += c;
  }
  return out;
}

const fuenteTailor = sinComentarios(leer("../src/components/screens/TailorScreen.tsx"));
const fuenteSalud = sinComentarios(leer("../src/components/screens/SaludScreen.tsx"));
const fuenteVariantes = sinComentarios(leer("../src/components/screens/VariantesScreen.tsx"));
const fuenteStaging = sinComentarios(leer("../src/components/screens/StagingScreen.tsx"));

/* ── 0 · El propio guardián, antes de fiarnos de él ───────────────────────── */

describe("costuras · el escáner de fuente hace lo que dice", () => {
  it("quita comentarios de línea, de bloque y JSX, y conserva las cadenas", () => {
    const limpio = sinComentarios(
      ['const a = "40.000 tx";', "// 40.000 en comentario", "/* 40.000 en bloque */", "{/* 40.000 en JSX */}"].join("\n"),
    );
    expect(limpio).toContain('"40.000 tx"');
    expect(limpio.match(/40\.000/g), "debería quedar exactamente una aparición").toHaveLength(1);
  });

  it("no se come una cadena que contenga '//' (una URL, por ejemplo)", () => {
    expect(sinComentarios('const u = "https://x.dev/a"; // fuera')).toContain('"https://x.dev/a"');
  });

  it("los fuentes que vigila existen y no llegaron vacíos por un path malo", () => {
    // Un readFileSync que apunta a otro sitio dejaría TODO en verde por vacío.
    for (const [nombre, src] of Object.entries({ fuenteTailor, fuenteSalud, fuenteVariantes, fuenteStaging })) {
      expect(src.length, `${nombre} vino vacío`).toBeGreaterThan(500);
    }
  });
});

/* ── 1 · Ni una cifra, ni un nombre, de una persona que no existe ─────────── */

/* Rastros de la maqueta: el nombre y su empresa, las cifras que nadie midió y
   los estudios que las sostenían. Si cualquiera reaparece en el texto que el
   usuario lee, hemos vuelto al punto de partida. */
const RASTROS_INVENTADOS = [
  "Diego", "Gatica", "Altiplano", "Rayén", "Rayen",
  "40.000", "40,000", "conciliación", "reconciliación",
  "10,6", "10.6", "58,2", "58.2", "n=384", "n=30", "2,5M", "2.5M",
  "Jobscan", "Ladders", "Backend — Fintech", "backend-fintech",
  "52 items", "52 item",
];

const textosDe = (ns: { es: Record<string, string>; en: Record<string, string> }) => [
  ...Object.entries(ns.es).map(([k, v]) => [`es:${k}`, v] as const),
  ...Object.entries(ns.en).map(([k, v]) => [`en:${k}`, v] as const),
];

describe("costuras · ninguna pantalla presenta datos de una persona inventada", () => {
  it("el diccionario de tailor no contiene ni un rastro de la maqueta", () => {
    // AQUÍ vivía de verdad la mentira: el .tsx solo tenía las constantes; el
    // texto que el usuario LEÍA («52 items», «10,6× entrevistas») estaba en el
    // diccionario. Vaciar la pantalla y dejar el dict habría sido pura fachada.
    for (const [clave, valor] of textosDe(tailor)) {
      for (const rastro of RASTROS_INVENTADOS) {
        expect(valor.includes(rastro), `tailor ${clave} contiene «${rastro}»: ${valor}`).toBe(false);
      }
    }
  });

  it("el diccionario de salud no contiene ni un rastro de la maqueta", () => {
    for (const [clave, valor] of textosDe(salud)) {
      for (const rastro of RASTROS_INVENTADOS) {
        expect(valor.includes(rastro), `salud ${clave} contiene «${rastro}»: ${valor}`).toBe(false);
      }
    }
  });

  it("el código de las dos pantallas tampoco los trae de vuelta", () => {
    for (const [nombre, src] of [["TailorScreen", fuenteTailor], ["SaludScreen", fuenteSalud]] as const) {
      for (const rastro of RASTROS_INVENTADOS) {
        expect(src.includes(rastro), `${nombre} contiene «${rastro}»`).toBe(false);
      }
    }
  });

  it("no vuelven las constantes de maqueta ni el HTML crudo que las pintaba", () => {
    // El mutante más probable: «lo dejo como ejemplo, total se ve que es demo».
    expect(/const\s+(JD|HAVE|ADD|GAP|PROPS|VARIANT_ID|VARIANT_TITLE)\s*[:=]/.test(fuenteTailor)).toBe(false);
    expect(/const\s+(VARIANT_ID|VARIANT_TITLE|buildFindings|buildGuaranteed)\s*[:=]/.test(fuenteSalud)).toBe(false);
    // dangerouslySetInnerHTML servía las «reformulaciones propuestas».
    expect(fuenteTailor).not.toContain("dangerouslySetInnerHTML");
    expect(fuenteSalud).not.toContain("dangerouslySetInnerHTML");
  });

  it("las dos pantallas no leen NADA del usuario: lo que no se lee no se pinta mal", () => {
    // Invariante de hoy, y la razón por la que estas pantallas ya no pueden
    // mentir. Si algún día se cablean de verdad, este test debe caer — y ese es
    // justo el momento de volver a demostrar que lo que pintan es real.
    for (const [nombre, src] of [["TailorScreen", fuenteTailor], ["SaludScreen", fuenteSalud]] as const) {
      expect(src.includes("fetch("), `${nombre} hace fetch: demuestra que lo que pinta es real`).toBe(false);
    }
  });

  it("el conteo de hallazgos de salud ya no existe: no se puede contar lo que no se midió", () => {
    // «4 hallazgos · 0 bloqueantes» salía de un array escrito a mano.
    for (const clave of ["salud.count.findings", "salud.count.blocking"]) {
      expect(salud.es[clave], `${clave} debería haber desaparecido`).toBeUndefined();
      expect(salud.en[clave], `${clave} debería haber desaparecido`).toBeUndefined();
    }
    expect(salud.es["salud.barPending"]?.trim()).toBeTruthy();
    expect(salud.en["salud.barPending"]?.trim()).toBeTruthy();
  });

  it("se retiraron las garantías «por construcción» que el motor ya no cumple", () => {
    // Prometían «una sola columna» y «cero fotos» cuando el catálogo de
    // plantillas ya define layouts de 2 columnas con sidebar y foto. Una
    // garantía citada con fuentes que el producto incumple es peor que ninguna.
    for (const n of [1, 2, 3, 4, 5]) {
      expect(salud.es[`salud.g${n}.b`], `salud.g${n}.b sigue viva`).toBeUndefined();
      expect(salud.en[`salud.g${n}.b`], `salud.g${n}.b sigue viva`).toBeUndefined();
    }
    expect(salud.es["salud.builtLabel"]).toBeUndefined();
    // Y el motivo sigue siendo cierto: el catálogo tiene layouts de 2 columnas.
    const catalogo = leer("../src/lib/cv/catalog.ts");
    expect(
      /columns:\s*2/.test(catalogo),
      "si el catálogo volviera a ser todo de 1 columna, la garantía podría volver",
    ).toBe(true);
  });
});

/* ── 2 · El [id] de la ruta dejó de ignorarse ─────────────────────────────── */

describe("costuras · el [id] de la ruta manda (y no puede sacarte de /app)", () => {
  it("las dos pantallas leen el id del route", () => {
    expect(fuenteTailor).toContain("useParams");
    expect(fuenteSalud).toContain("useParams");
  });

  /* La MISMA batería contra las dos copias de la función. Están duplicadas a
     propósito (fronteras de trabajo distintas, sin fichero compartido); esto es
     lo que impide que diverjan en silencio. */
  const implementaciones = [["TailorScreen", rutaTailor], ["SaludScreen", rutaSalud]] as const;

  const casos: [unknown, string | null][] = [
    [undefined, null],
    [null, null],
    ["", null],
    ["   ", null],
    [123, null],
    [["a", "b"], null], // ruta catch-all: no es un id
    [{}, null],
    ["abc", "/app/variantes/abc"],
    ["  abc  ", "/app/variantes/abc"], // se recorta, no se rechaza
    ["a/b", null], // dejaría de ser una variante y sería otra ruta
    ["../master", null], // travesía
    ["a\\b", null],
    ["/app", null],
    ["a b", "/app/variantes/a%20b"], // se codifica, no se cuela crudo
  ];

  for (const [nombre, fn] of implementaciones) {
    it(`${nombre}: rutaDeLaVariante nunca inventa una variante`, () => {
      for (const [entrada, esperado] of casos) {
        expect(fn(entrada), `entrada ${JSON.stringify(entrada)}`).toBe(esperado);
      }
    });
  }

  it("las dos copias coinciden en TODOS los casos: no pueden divergir en silencio", () => {
    for (const [entrada] of casos) {
      expect(rutaTailor(entrada), `divergen en ${JSON.stringify(entrada)}`).toBe(rutaSalud(entrada));
    }
  });

  it("el resultado, cuando existe, es siempre una ruta interna de /app", () => {
    for (const id of ["abc", "1", "a-b_c", "ÑOÑO", "a b", "%2e%2e"]) {
      const r = rutaTailor(id);
      expect(r, `id ${id}`).not.toBeNull();
      expect(r!.startsWith("/app/variantes/"), `id ${id} → ${r}`).toBe(true);
      expect(r!.includes("//"), `id ${id} → ${r}`).toBe(false);
    }
  });

  it("sin id utilizable se vuelve al listado, no a una variante adivinada", () => {
    expect(fuenteTailor).toContain('const FALLBACK = "/app/variantes"');
    expect(fuenteSalud).toContain('const FALLBACK = "/app/variantes"');
    expect(fuenteTailor).toContain("variante ?? FALLBACK");
    expect(fuenteSalud).toContain("variante ?? FALLBACK");
  });

  it("el breadcrumb ya no rotula la salida con el nombre de la persona inventada", () => {
    // fallbackLabel={VARIANT_TITLE} ponía «Backend — Fintech» como si fuera tu
    // variante. Sin él, el Breadcrumb rotula por ruta («La variante»): cierto
    // sin leer nada.
    expect(fuenteTailor).not.toContain("fallbackLabel");
    expect(fuenteSalud).not.toContain("fallbackLabel");
  });
});

/* ── 3 · Las salidas que ofrecen son salidas que existen ──────────────────── */

describe("costuras · el estado vacío deriva a lo que SÍ funciona", () => {
  it("Tailor manda al ajuste a dos páginas (que vive en el editor) y al master", () => {
    expect(fuenteTailor).toContain("href={volverA}");
    expect(fuenteTailor).toContain('href="/app/master"');
  });

  it("Tailor rotula ese botón con la MISMA clave que el botón real del editor", () => {
    // Si alguien renombra «Ajustar a dos páginas», esta indicación se renombra
    // con él en vez de quedar apuntando a un botón que ya no se llama así.
    expect(fuenteTailor).toContain('t("editor.fitOpen")');
    expect(editor.es["editor.fitOpen"]?.trim()).toBeTruthy();
    expect(editor.en["editor.fitOpen"]?.trim()).toBeTruthy();
  });

  it("Salud manda al master y a la variante real", () => {
    expect(fuenteSalud).toContain('href="/app/master"');
    expect(fuenteSalud).toContain("href={volverA}");
  });

  it("los filtros de calidad que Salud promete existen de verdad en el master", () => {
    // El copy dice «sin evidencia, sin fechas y posibles duplicados». Si alguien
    // los quita de MasterScreen, este texto pasa a ser una promesa vacía.
    for (const k of ["master.filter.noEvidence", "master.filter.noDates", "master.filter.dups"]) {
      expect(master.es[k]?.trim(), `falta ${k}`).toBeTruthy();
      expect(master.en[k]?.trim(), `falta ${k}`).toBeTruthy();
    }
    const fuenteMaster = sinComentarios(leer("../src/components/screens/MasterScreen.tsx"));
    expect(fuenteMaster).toContain("master.filter.noEvidence");
  });

  it("el hueco se dice en futuro y en los dos idiomas, sin fingir que ya analizó", () => {
    const nuevas = [
      ["tailor.voidOverline", tailor], ["tailor.voidTitle", tailor], ["tailor.voidBody", tailor],
      ["tailor.voidEthic", tailor], ["tailor.voidNextOverline", tailor], ["tailor.voidFitNote", tailor],
      ["tailor.voidMasterCta", tailor], ["tailor.voidMasterNote", tailor], ["tailor.toolbarNote", tailor],
      ["salud.voidOverline", salud], ["salud.voidTitle", salud], ["salud.voidBody.pre", salud],
      ["salud.voidBody.mid", salud], ["salud.voidBody.post", salud], ["salud.voidEthic", salud],
      ["salud.voidNextOverline", salud], ["salud.voidMasterCta", salud], ["salud.voidMasterNote", salud],
      ["salud.voidVariantCta", salud], ["salud.voidVariantNote", salud], ["salud.barPending", salud],
    ] as const;
    for (const [k, ns] of nuevas) {
      expect(ns.es[k]?.trim(), `falta ES: ${k}`).toBeTruthy();
      expect(ns.en[k]?.trim(), `falta EN: ${k}`).toBeTruthy();
      // EN copiado tal cual del ES es el fallback silencioso que dictionary.ts
      // esconde. Son frases, no siglas: no hay coincidencia legítima.
      expect(ns.es[k], `EN sin traducir: ${k}`).not.toBe(ns.en[k]);
    }
  });

  it("las claves de la maqueta murieron en los dos idiomas", () => {
    const muertas: [string, { es: Record<string, string>; en: Record<string, string> }][] = [
      ["tailor.hintItems", tailor], ["tailor.titleWhy", tailor], ["tailor.haveTitle", tailor],
      ["tailor.addTitle", tailor], ["tailor.gapTitle", tailor], ["tailor.refTitle", tailor],
      ["tailor.logComparing", tailor], ["tailor.resultMsg", tailor],
      ["salud.c1.title", salud], ["salud.c2.title", salud], ["salud.c3.title", salud],
      ["salud.c4.title", salud], ["salud.builtLabel", salud], ["salud.ok.line1", salud],
    ];
    for (const [k, ns] of muertas) {
      expect(ns.es[k], `sigue viva en ES: ${k}`).toBeUndefined();
      expect(ns.en[k], `sigue viva en EN: ${k}`).toBeUndefined();
    }
  });
});

/* ── 4 · El «volver» de Variantes: vivo, pero sin inventar viajes ─────────── */

describe("costuras · la miga de Variantes solo aparece si el viaje existe", () => {
  it("sin ?from= no hay miga: en una pestaña raíz sería un volver inventado", () => {
    expect(debeMostrarMiga(null)).toBe(false);
    expect(debeMostrarMiga(undefined)).toBe(false);
    expect(debeMostrarMiga("")).toBe(false);
  });

  it("con un origen interno válido, sí", () => {
    expect(debeMostrarMiga("/app/staging")).toBe(true);
    expect(debeMostrarMiga("/app")).toBe(true);
    expect(debeMostrarMiga("/app/fuentes?x=1")).toBe(true);
  });

  it("un origen hostil no abre la miga (open-redirect en la barra de navegación)", () => {
    for (const malo of [
      "https://evil.com/app", "//evil.com", "/\\evil.com", "javascript:alert(1)",
      "/login", "/appearance", "/app/../admin", "/app/%2e%2e/admin", " /app", "/app\\x",
    ]) {
      expect(debeMostrarMiga(malo), `debería rechazar ${malo}`).toBe(false);
    }
  });

  it("la pantalla monta el Breadcrumb UNA vez y detrás de la condición", () => {
    const apariciones = fuenteVariantes.match(/<Breadcrumb/g) ?? [];
    expect(apariciones.length, "el Breadcrumb aparece más de una vez o ninguna").toBe(1);
    expect(
      /if \(!debeMostrarMiga\(from\)\) return null;[\s\S]{0,200}<Breadcrumb/.test(fuenteVariantes),
      "el Breadcrumb se monta sin comprobar antes que el viaje existe",
    ).toBe(true);
    // Y con un fallback real, no con el Panel «porque sí» en el caso general.
    expect(fuenteVariantes).toContain('fallback="/app"');
    expect(fuenteVariantes).toContain('current={t("nav.variantes")}');
  });

  it("el otro extremo del cable sigue soldado: Staging manda el ?from=", () => {
    // Si alguien quita el origen en Staging, la miga no aparecería nunca y este
    // arreglo quedaría muerto sin que nada fallara. Se comprueba el valor real
    // que exporta la pantalla (lo compone con withOrigin, no es un literal).
    expect(HREF_VARIANTES).toBe(withOrigin("/app/variantes", "/app/staging"));
    expect(HREF_VARIANTES).toContain("from=%2Fapp%2Fstaging");
    // …y que ese href es el que viaja al botón, no una constante huérfana.
    expect(fuenteStaging).toContain("href={HREF_VARIANTES}");
  });
});

/* ── 5 · La interfaz ya no afirma haber guardado nada ─────────────────────── */

describe("costuras · «Actualizar»/«Mantener» no pueden volver sin endpoint", () => {
  it("los botones optimistas y sus anuncios están fuera del código", () => {
    for (const rastro of ["diffUpdate", "diffKeep", "announceUpdated", "announceKept", "updateVariant", "keepVariant"]) {
      expect(fuenteVariantes.includes(rastro), `sigue en el código: ${rastro}`).toBe(false);
    }
  });

  it("y fuera del diccionario, en los dos idiomas", () => {
    for (const k of ["variantes.diffUpdate", "variantes.diffKeep", "variantes.announceUpdated", "variantes.announceKept"]) {
      expect(variantes.es[k], `sigue viva en ES: ${k}`).toBeUndefined();
      expect(variantes.en[k], `sigue viva en EN: ${k}`).toBeUndefined();
    }
  });

  it("el panel de desactualización no tiene ni un botón que prometa algo", () => {
    // Recorte explícito: del panel de diferencias hasta el bloque siguiente
    // (el estado vacío). Sin límites claros, este test daría verde por mirar
    // donde no hay botones o rojo por mirar los de otra sección.
    const desde = fuenteVariantes.indexOf('className="vr-diff"');
    const hasta = fuenteVariantes.indexOf("vr-empty", desde);
    expect(desde, "no se encontró el panel de desactualización").toBeGreaterThan(-1);
    expect(hasta, "no se encontró el final del recorte").toBeGreaterThan(desde);
    const panel = fuenteVariantes.slice(desde, hasta);
    expect(/<button/.test(panel), "volvió un botón al panel de desactualización").toBe(false);
    // …y el enlace que SÍ funciona sigue ahí: no se arregló vaciando el panel.
    expect(panel).toContain('t("variantes.diffOpenEditor")');
  });

  it("en su lugar se confiesa que no se puede resolver desde aquí", () => {
    expect(fuenteVariantes).toContain('t("variantes.diffPending")');
    for (const lang of ["es", "en"] as const) {
      const v = variantes[lang]["variantes.diffPending"];
      expect(v?.trim(), `falta ${lang}: variantes.diffPending`).toBeTruthy();
    }
    expect(variantes.es["variantes.diffPending"]).not.toBe(variantes.en["variantes.diffPending"]);
  });

  it("el texto NO dice que quedó al día (era justo la afirmación falsa)", () => {
    expect(variantes.es["variantes.diffPending"].toLowerCase()).not.toContain("al día");
    expect(variantes.en["variantes.diffPending"].toLowerCase()).not.toContain("up to date");
    // «Actualizada» / «updated» en pasado sería la misma mentira con otras letras.
    expect(variantes.es["variantes.diffPending"].toLowerCase()).not.toContain("actualizada");
    expect(variantes.en["variantes.diffPending"].toLowerCase()).not.toContain("updated");
  });

  it("la señal de desactualización sigue existiendo: no se arregló ocultándola", () => {
    // El atajo tentador era quitar el punto y el panel. Eso no es honestidad,
    // es esconder el problema: el master SÍ cambió y el usuario debe saberlo.
    expect(fuenteVariantes).toContain("c-pulse-dot");
    expect(fuenteVariantes).toContain('t("variantes.metaOutdated")');
    expect(fuenteVariantes).toContain('t("variantes.diffOverline")');
    expect(variantes.es["variantes.metaOutdated"]?.trim()).toBeTruthy();
  });
});

/* ── 6 · El N+1 de los conteos, con techo ─────────────────────────────────── */

/** Corre `n` tareas por enLotes midiendo cuántas estuvieron vivas a la vez. */
async function medirConcurrencia(n: number, limite: number) {
  let vivas = 0;
  let pico = 0;
  const orden: number[] = [];
  const items = Array.from({ length: n }, (_, i) => i);
  const res = await enLotes(items, limite, async (i) => {
    vivas++;
    pico = Math.max(pico, vivas);
    await new Promise((r) => setTimeout(r, 1));
    orden.push(i);
    vivas--;
    return i * 10;
  });
  return { pico, res, orden };
}

describe("costuras · enLotes pone techo al N+1 de los conteos", () => {
  it("nunca hay más tareas vivas que el techo", async () => {
    // El mutante exacto que mata: volver a Promise.all(candidates.map(...)).
    const { pico } = await medirConcurrencia(20, 4);
    expect(pico, `pico de concurrencia ${pico}`).toBeLessThanOrEqual(4);
  });

  it("aun así las hace TODAS y conserva el orden de entrada", async () => {
    const { res, orden } = await medirConcurrencia(20, 4);
    expect(res).toEqual(Array.from({ length: 20 }, (_, i) => i * 10));
    expect(orden.length, "alguna tarea no llegó a ejecutarse").toBe(20);
  });

  it("el techo se aprovecha de verdad (no es un bucle secuencial disfrazado)", async () => {
    const { pico } = await medirConcurrencia(20, 4);
    expect(pico, "con 20 tareas y techo 4, algo va en serie").toBeGreaterThan(1);
  });

  it("un techo absurdo no deja el trabajo sin hacer en silencio", async () => {
    for (const limite of [0, -3, Number.NaN, 0.4]) {
      const res = await enLotes([1, 2, 3], limite, async (x) => x * 2);
      expect(res, `techo ${limite}`).toEqual([2, 4, 6]);
    }
  });

  it("un techo mayor que la lista no crea obreros de más ni rompe", async () => {
    const { pico, res } = await medirConcurrencia(3, 50);
    expect(pico).toBeLessThanOrEqual(3);
    expect(res).toEqual([0, 10, 20]);
  });

  it("con la lista vacía no explota", async () => {
    expect(await enLotes([], 4, async (x) => x)).toEqual([]);
  });

  it("cuando el llamante dice basta, para en seco y el resto queda en null", async () => {
    // El caso real: el efecto se desmonta (cambio de idioma, navegación) y no
    // tiene sentido seguir pidiendo conteos para una pantalla que ya no está.
    let hechas = 0;
    const res = await enLotes(
      Array.from({ length: 40 }, (_, i) => i),
      2,
      async (i) => {
        hechas++;
        await new Promise((r) => setTimeout(r, 1));
        return i;
      },
      () => hechas < 6,
    );
    expect(hechas, `siguió trabajando: ${hechas} tareas`).toBeLessThan(40);
    expect(res.filter((x) => x === null).length, "debería quedar cola sin hacer").toBeGreaterThan(0);
  });

  it("la pantalla lo usa con techo y con corte, no con Promise.all", async () => {
    // ⚠ Este test nació débil: comprobaba que «CONCURRENCIA_CONTEOS» aparecía en
    // el fichero, y la declaración de la constante lo satisfacía sola. Un mutante
    // que llamaba a enLotes(candidates, candidates.length, …) —techo igual al
    // total, o sea SIN techo— sobrevivía. Ahora se comprueba la LLAMADA.
    expect(
      /enLotes\(\s*candidates,\s*CONCURRENCIA_CONTEOS,/.test(fuenteVariantes),
      "enLotes ya no se llama con el techo: alguien le pasa otro límite",
    ).toBe(true);
    // Y que el techo sea una constante pequeña, no el tamaño de la lista.
    const techo = fuenteVariantes.match(/const CONCURRENCIA_CONTEOS = (\d+)/);
    expect(techo, "desapareció la constante del techo").not.toBeNull();
    expect(Number(techo![1]), "un techo así de alto no es un techo").toBeLessThanOrEqual(8);
    expect(Number(techo![1])).toBeGreaterThan(0);
    // El corte al desmontar.
    expect(fuenteVariantes).toContain("() => active");
    expect(
      /Promise\.all\(\s*candidates/.test(fuenteVariantes),
      "volvió el Promise.all sobre todos los candidatos",
    ).toBe(false);
  });
});
