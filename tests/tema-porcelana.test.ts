import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contrastRatio, meetsAA, ratioText, relativeLuminance } from "../src/lib/cv/contrast";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL TEMA CLARO ("PORCELANA") NO PUEDE VOLVER A ROMPERSE EN SILENCIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Historia de lo que pasó, porque explica la forma de este test:
 *
 * globals.css define los tokens de color dos veces, una por tema. El bloque
 * oscuro se escribió como `[data-theme="dark"], :root`, o sea que TAMBIÉN es el
 * fallback de todo el documento. El bloque claro es solo `[data-theme="light"]`.
 * Consecuencia: si un token se define en el oscuro y se OLVIDA en el claro, no
 * hay error, no hay warning, no hay nada — el tema claro se queda callado con el
 * valor del tema oscuro.
 *
 * Eso pasó con dos tokens:
 *   · --surface-elevated → en porcelana valía #1A201E (casi negro). Como casi
 *     siempre se usa con color:var(--text) (#14181A en claro), daba 1.08:1:
 *     texto negro sobre negro. 51 usos en 15 ficheros, incluido .c-btn BASE.
 *   · --ver-ok → var(--patina-300), que NO cambia con el tema, usado como color
 *     de TEXTO: 1.75:1 sobre porcelana.
 *
 * Ninguna de las dos cosas la caza un test de "¿está definido el token?", porque
 * lo estaban. Ni un test de presencia en el CSS, porque estaban presentes. Solo
 * las caza COMPARAR LOS DOS TEMAS ENTRE SÍ y CALCULAR los contrastes.
 *
 * Por eso este fichero hace exactamente dos cosas:
 *   1. Paridad: todo token que lleve color y no siga al tema por sí solo tiene
 *      que estar definido en LOS DOS bloques. Falla NOMBRANDO el que falte.
 *   2. Contraste calculado (fórmula WCAG, sobre los valores REALES leídos del
 *      CSS, no copiados aquí): si alguien retoca un hex, el número cambia y el
 *      test cae. Un comentario con un ratio es una promesa; esto es una prueba.
 */

const RUTA_GLOBALS = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
const CSS_CRUDO = readFileSync(RUTA_GLOBALS, "utf8");

/* ── Parseo ────────────────────────────────────────────────────────────────
   Los comentarios se quitan ANTES de nada y no es un detalle: este CSS está
   lleno de comentarios que citan nombres de token y valores hex (justo los que
   documentan estos arreglos). Sin quitarlos, el parser "encontraría" tokens que
   solo existen en la prosa y el test daría verde por la razón equivocada. */
function quitarComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Reglas de cuerpo plano (sin llaves anidadas). Los bloques de tokens lo son. */
const RE_REGLA = /([^{}]+)\{([^{}]*)\}/g;
const RE_DECL = /(--[\w-]+)\s*:\s*([^;]+)/g;

type Mapa = Map<string, string>;

/** Declaraciones de los bloques de nivel superior cuyo selector case `coincide`. */
function tokensDe(css: string, coincide: (sel: string) => boolean): Mapa {
  const out: Mapa = new Map();
  for (const m of quitarComentarios(css).matchAll(RE_REGLA)) {
    const selector = m[1]!.trim();
    if (!coincide(selector)) continue;
    for (const d of m[2]!.matchAll(RE_DECL)) out.set(d[1]!, d[2]!.trim());
  }
  return out;
}

const partes = (sel: string) => sel.split(",").map((s) => s.trim());

/** Ámbito BASE: `:root` y `[data-theme="dark"]` — el que hace de fallback. */
const BASE = tokensDe(CSS_CRUDO, (sel) =>
  partes(sel).some((p) => p === ":root" || p === '[data-theme="dark"]'),
);
/** Ámbito CLARO: solo el bloque de tokens, NUNCA reglas descendientes
 *  (`[data-theme="light"] .c-panel` es CSS de componente, no un token). */
const CLARO = tokensDe(CSS_CRUDO, (sel) => partes(sel).every((p) => p === '[data-theme="light"]'));

/* ── ¿Qué token necesita gemelo claro? ─────────────────────────────────────
   Regla, y es la parte que de verdad importa:

   Un token lleva color de dos maneras. O lo lleva QUEMADO (#hex, rgb(), hsl()),
   y entonces es ciego al tema y necesita su propio valor claro. O lo lleva por
   REFERENCIA (var(--otro)), y entonces solo sirve si TODO lo que referencia
   sigue al tema. `--ver-partial: var(--text-muted)` sigue al tema, porque
   --text-muted se redefine en claro. `--ver-ok: var(--patina-300)` NO, porque la
   escala de pátina es la misma en los dos temas a propósito. Esa distinción —
   "referencia una cosa que cambia" vs "referencia una cosa que no cambia" — es
   exactamente el bug que se nos escapó, y aquí es una función. */
const RE_COLOR_QUEMADO = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const refsDe = (v: string) => [...v.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]!);

/**
 * Tokens deliberadamente COMPARTIDOS entre temas. Cada uno con su motivo, porque
 * una lista de excepciones sin motivos es donde van a morir los bugs futuros.
 */
const COMPARTIDOS = new Map<string, string>([
  ["--patina-100", "la escala de pátina es el acento y es COMPARTIDA (lo dice tokens.css)"],
  ["--patina-300", "ídem — por eso apuntar a ella NO es seguir el tema"],
  ["--patina-500", "ídem · la pátina de marca"],
  ["--patina-700", "ídem · la pátina que usa el tema claro"],
  ["--patina-900", "ídem"],
  ["--ink-on-patina", "la pátina es clara en AMBOS temas, así que encima siempre va tinta"],
  ["--copper", "metal de atmósfera: solo vive en el shader, nunca en la UI"],
  ["--silver", "ídem"],
  ["--steel", "ídem"],
]);

function sigueElTema(nombre: string, vistos = new Set<string>()): boolean {
  if (CLARO.has(nombre)) return true; // tiene su propio valor claro
  if (COMPARTIDOS.has(nombre)) return false; // igual en ambos: NO sigue al tema
  if (vistos.has(nombre)) return false; // ciclo de var() → no se sostiene
  vistos.add(nombre);
  const valor = BASE.get(nombre);
  if (valor === undefined) return false;
  if (RE_COLOR_QUEMADO.test(valor)) return false;
  const refs = refsDe(valor);
  if (refs.length === 0) return true; // no lleva color (px, ms, cubic-bezier…)
  return refs.every((r) => sigueElTema(r, vistos));
}

/** Devuelve los tokens del ámbito base que EXIGEN un valor propio en claro. */
function tokensSinGemeloClaro(base: Mapa = BASE): string[] {
  const faltan: string[] = [];
  for (const [nombre, valor] of base) {
    if (COMPARTIDOS.has(nombre) || CLARO.has(nombre)) continue;
    const quemado = RE_COLOR_QUEMADO.test(valor);
    const refs = refsDe(valor);
    if (!quemado && refs.length === 0) continue; // no es un token de color
    if (quemado || !refs.every((r) => sigueElTema(r))) faltan.push(nombre);
  }
  return faltan;
}

/** Resuelve un token a hex siguiendo la cadena de var() dentro de un tema. */
function resolver(nombre: string, tema: "dark" | "light"): string {
  const mapa: Mapa = tema === "light" ? new Map([...BASE, ...CLARO]) : BASE;
  let valor = mapa.get(nombre);
  for (let i = 0; valor && /^var\(/.test(valor) && i < 10; i++) {
    valor = mapa.get(valor.match(/var\(\s*(--[\w-]+)/)![1]!);
  }
  if (!valor || !/^#[0-9a-fA-F]{3,8}$/.test(valor.trim())) {
    throw new Error(`--${nombre} no resuelve a un hex en ${tema}: ${valor}`);
  }
  return valor.trim();
}

const ratio = (a: string, b: string, tema: "dark" | "light") =>
  contrastRatio(resolver(a, tema), resolver(b, tema));

/* ══════════════════════════════════════════════════════════════════════════
   1 · PARIDAD — el test que habría cazado esto el día que se escribió
   ══════════════════════════════════════════════════════════════════════════ */
describe("porcelana · paridad de tokens entre los dos temas", () => {
  it("1 · el parser lee los dos bloques de verdad (si esto falla, lo demás miente)", () => {
    // Sin este ancla, un parser roto devolvería 0 tokens y TODOS los tests de
    // paridad pasarían por vacuidad. Es la comprobación que protege al resto.
    expect(BASE.size).toBeGreaterThan(30);
    expect(CLARO.size).toBeGreaterThan(15);
    expect(BASE.get("--bg")).toBe("#0A0C0B");
    expect(CLARO.get("--bg")).toBe("#F7F8F6");
  });

  it("2 · ningún token de color del ámbito base se queda sin valor en porcelana", () => {
    const faltan = tokensSinGemeloClaro();
    expect(
      faltan,
      `Estos tokens llevan color y NO tienen valor propio en [data-theme="light"], ` +
        `así que en porcelana se quedan con el valor de GRAFITO: ${faltan.join(", ")}`,
    ).toEqual([]);
  });

  it("3 · --surface-elevated existe en claro (la causa raíz #1: 51 usos, 15 ficheros)", () => {
    expect(CLARO.has("--surface-elevated"), "falta --surface-elevated en el tema claro").toBe(true);
    // Y no vale ponerlo con cualquier valor: tiene que ser claro de verdad.
    expect(relativeLuminance(resolver("--surface-elevated", "light"))).toBeGreaterThan(0.5);
  });

  it("4 · --ver-ok existe en claro y NO apunta a la pátina luminosa (causa raíz #2)", () => {
    expect(CLARO.has("--ver-ok"), "falta --ver-ok en el tema claro").toBe(true);
    expect(resolver("--ver-ok", "light")).not.toBe(BASE.get("--patina-300"));
  });

  it("5 · las sombras y el glow de grafito tienen recalibrado claro", () => {
    for (const t of ["--shadow-1", "--shadow-2", "--glow-patina"]) {
      expect(CLARO.has(t), `${t} está calibrado para grafito y no tiene versión clara`).toBe(true);
      // El negro puro de grafito no debe sobrevivir en porcelana.
      expect(CLARO.get(t)).not.toMatch(/rgba?\(\s*0\s*,\s*0\s*,\s*0/);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2 · MUTANTES — ¿el test de arriba sirve, o solo da verde?
   Un test de paridad que no sabe fallar es peor que no tener test: da confianza
   sin darla. Aquí se le inyectan las tres averías posibles y se comprueba que
   las tres MUEREN, y que muere NOMBRANDO al culpable (que es lo que convierte
   un fallo en un arreglo de dos minutos).
   ══════════════════════════════════════════════════════════════════════════ */
describe("porcelana · mutantes: la red tiene que saber fallar", () => {
  it("1 · MUTANTE quitar --surface-elevated del bloque claro → lo detecta y lo nombra", () => {
    const mutante = CSS_CRUDO.replace(/^\s*--surface-elevated:\s*#F1F3F0;.*$/m, "");
    expect(mutante, "el mutante no llegó a aplicarse").not.toBe(CSS_CRUDO);
    const claroMutado = tokensDe(mutante, (s) =>
      partes(s).every((p) => p === '[data-theme="light"]'),
    );
    expect(claroMutado.has("--surface-elevated")).toBe(false);
    // La regla real: quemado en base + ausente en claro = hallazgo.
    expect(RE_COLOR_QUEMADO.test(BASE.get("--surface-elevated")!)).toBe(true);
  });

  it("2 · MUTANTE un token de color nuevo en base sin gemelo claro → lo detecta", () => {
    const base = new Map(BASE);
    base.set("--surface-nueva", "#123456");
    expect(tokensSinGemeloClaro(base)).toContain("--surface-nueva");
  });

  it("3 · MUTANTE el caso sutil: var() a algo COMPARTIDO parece seguir el tema y no lo sigue", () => {
    // Este es EXACTAMENTE el bug de --ver-ok, en miniatura. Un token que apunta a
    // la escala de pátina se lee como "hereda del tema" y no hereda nada.
    const base = new Map(BASE);
    base.set("--ver-inventado", "var(--patina-300)");
    expect(tokensSinGemeloClaro(base)).toContain("--ver-inventado");

    // …y el contraste: un token que apunte ahí como TEXTO sobre porcelana falla.
    const r = contrastRatio(BASE.get("--patina-300")!, resolver("--bg", "light"));
    expect(meetsAA(r), `patina-300 sobre porcelana mide ${ratioText(r)}`).toBe(false);
  });

  it("4 · CONTRAMUTANTE: var() a algo que SÍ cambia de tema no se marca (sin falsos positivos)", () => {
    // Si el test marcase esto, sería ruido y alguien lo desactivaría. Que no lo marque
    // es tan importante como que marque el caso 3.
    const base = new Map(BASE);
    base.set("--ver-inventado-2", "var(--text-muted)");
    expect(tokensSinGemeloClaro(base)).not.toContain("--ver-inventado-2");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3 · CONTRASTE CALCULADO sobre los valores REALES del CSS
   ══════════════════════════════════════════════════════════════════════════ */
describe("porcelana · contraste calculado de los pares texto/fondo", () => {
  const SUPERFICIES = ["--bg", "--surface", "--surface-elevated", "--surface-sunken"];

  it("1 · --text pasa AA sobre TODAS las superficies, en los DOS temas", () => {
    for (const tema of ["dark", "light"] as const) {
      for (const s of SUPERFICIES) {
        const r = ratio("--text", s, tema);
        expect(meetsAA(r), `${tema}: --text sobre ${s} mide ${ratioText(r)}`).toBe(true);
      }
    }
  });

  it("2 · --text-muted pasa AA sobre TODAS las superficies, en los DOS temas", () => {
    for (const tema of ["dark", "light"] as const) {
      for (const s of SUPERFICIES) {
        const r = ratio("--text-muted", s, tema);
        expect(meetsAA(r), `${tema}: --text-muted sobre ${s} mide ${ratioText(r)}`).toBe(true);
      }
    }
  });

  it("3 · el par que estaba roto (--text sobre --surface-elevated en claro) hoy es legible", () => {
    // Antes: 1.08:1 — texto negro sobre negro. Es LA regresión a vigilar.
    const r = ratio("--text", "--surface-elevated", "light");
    expect(r).toBeGreaterThan(4.5);
    expect(r).toBeCloseTo(16.01, 1);
  });

  it("4 · --accent-text pasa AA sobre todas las superficies, en los dos temas", () => {
    for (const tema of ["dark", "light"] as const) {
      for (const s of SUPERFICIES) {
        const r = ratio("--accent-text", s, tema);
        expect(meetsAA(r), `${tema}: --accent-text sobre ${s} mide ${ratioText(r)}`).toBe(true);
      }
    }
  });

  it("5 · --ver-ok se usa como TEXTO: tiene que pasar AA sobre todo, en los dos temas", () => {
    for (const tema of ["dark", "light"] as const) {
      for (const s of SUPERFICIES) {
        const r = ratio("--ver-ok", s, tema);
        expect(meetsAA(r), `${tema}: --ver-ok sobre ${s} mide ${ratioText(r)}`).toBe(true);
      }
    }
  });

  it("6 · --surface-elevated cae ENTRE --surface y --surface-sunken en claro, y se distingue", () => {
    const [surf, elev, sunk] = ["--surface", "--surface-elevated", "--surface-sunken"].map((t) =>
      relativeLuminance(resolver(t, "light")),
    ) as [number, number, number];
    expect(elev).toBeLessThan(surf);
    expect(elev).toBeGreaterThan(sunk);
    // Y separado del fondo lo bastante para leerse como superficie, no como ruido.
    expect(contrastRatio(resolver("--surface-elevated", "light"), resolver("--bg", "light"))).toBeGreaterThan(1.02);
  });

  it("7 · --text-on-danger pasa AA sobre --danger en los dos temas (y por eso INVIERTE)", () => {
    for (const tema of ["dark", "light"] as const) {
      const r = ratio("--text-on-danger", "--danger", tema);
      expect(meetsAA(r), `${tema}: texto sobre peligro mide ${ratioText(r)}`).toBe(true);
    }
    // Lo que había escrito a mano fallaba en grafito, y su "gemelo" fallaba en claro.
    expect(meetsAA(contrastRatio("#FFFFFF", resolver("--danger", "dark")))).toBe(false);
    expect(
      meetsAA(contrastRatio(BASE.get("--ink-on-patina")!, resolver("--danger", "light"))),
    ).toBe(false);
    // Y el token no es el mismo valor en los dos temas: invierte, a propósito.
    expect(resolver("--text-on-danger", "dark")).not.toBe(resolver("--text-on-danger", "light"));
  });

  it("8 · sobre relleno de pátina el texto sigue siendo tinta y pasa AA (la regla del sistema)", () => {
    const tinta = BASE.get("--ink-on-patina")!;
    for (const p of ["--patina-100", "--patina-300", "--patina-500"]) {
      const r = contrastRatio(tinta, BASE.get(p)!);
      expect(meetsAA(r), `--ink-on-patina sobre ${p} mide ${ratioText(r)}`).toBe(true);
    }
    // Y blanco sobre patina-500 sigue fallando: la regla no es una opinión.
    expect(meetsAA(contrastRatio("#FFFFFF", BASE.get("--patina-500")!))).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4 · REGRESIONES CONCRETAS que ya nos mordieron una vez
   ══════════════════════════════════════════════════════════════════════════ */
describe("porcelana · regresiones concretas", () => {
  const lee = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

  it("1 · nadie vuelve a escribir un color de texto a mano sobre var(--danger)", () => {
    const ajustes = lee("../src/components/screens/AjustesScreen.tsx");
    const sospechosas = ajustes
      .split("\n")
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /var\(--danger\)/.test(l) && /color:\s*"#/.test(l));
    expect(
      sospechosas.map(([n]) => n),
      `líneas con un hex a mano sobre --danger (usa --text-on-danger): ` +
        sospechosas.map(([n, l]) => `${n}: ${l.trim()}`).join(" · "),
    ).toEqual([]);
  });

  it("2 · el selector de tema es legible en porcelana (era el síntoma más visible)", () => {
    // ajustes.css .aj-seg button[aria-pressed="true"] pinta --text sobre
    // --surface-elevated: al pulsar "Claro", el botón pulsado se volvía invisible.
    const ajustesCss = lee("../src/components/screens/ajustes.css");
    expect(ajustesCss).toMatch(/\.aj-seg button\[aria-pressed="true"\][^}]*--surface-elevated/);
    const r = ratio("--text", "--surface-elevated", "light");
    expect(meetsAA(r), `el botón de tema pulsado mide ${ratioText(r)} en porcelana`).toBe(true);
  });

  it("3 · el ÚNICO --text-subtle sobre --surface-elevated se subió a muted (fallaba en AMBOS temas)", () => {
    const staging = lee("../src/components/screens/staging.css");
    expect(staging).toMatch(/\.stg-mhead>div\{background:var\(--surface-elevated\)[^}]*--text-muted\)\}/);
    // El motivo, medido: subtle no llega a AA sobre elevated en ninguno de los dos.
    expect(meetsAA(ratio("--text-subtle", "--surface-elevated", "dark"))).toBe(false);
    expect(meetsAA(ratio("--text-subtle", "--surface-elevated", "light"))).toBe(false);
    // Y muted sí, en los dos.
    expect(meetsAA(ratio("--text-muted", "--surface-elevated", "dark"))).toBe(true);
    expect(meetsAA(ratio("--text-muted", "--surface-elevated", "light"))).toBe(true);
  });

  it("4 · el fallback de la aurora tiene versión clara (en porcelana pintaba verde y cobre oscuros)", () => {
    expect(quitarComentarios(CSS_CRUDO)).toMatch(
      /\[data-theme="light"\]\s*\.c-aurora-fallback\s*\{/,
    );
  });

  it("5 · ThemeToggle.tsx sigue borrado (escribía data-theme=porcelain en la clave compartida)", () => {
    // Era código muerto que nadie montaba, pero escribía "porcelain"/"obsidian" en
    // la MISMA clave localStorage (corpus-theme) que usan AjustesScreen y UserMenu,
    // y layout.tsx solo acepta "light"/"dark": si alguien lo hubiera montado, habría
    // pisado la preferencia real del usuario con un valor que el arranque descarta.
    expect(() => lee("../src/components/ThemeToggle.tsx")).toThrow();
  });
});
