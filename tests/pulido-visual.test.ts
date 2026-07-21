import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contrastRatio, ratioText } from "../src/lib/cv/contrast";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PULIDO VISUAL · los candados del bloque C
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este fichero NO comprueba que algo "esté bonito". Comprueba las cuatro cosas
 * que se rompieron de verdad al ir entrando funciones una detrás de otra, y que
 * ningún test de los que ya había podía ver:
 *
 *   1. TOKENS FANTASMA. `var(--warn, …)` y `var(--text-patina, …)` estaban
 *      escritos en master.css y tailor.css. Ninguno de los dos existe. CSS no
 *      avisa: se come el fallback y sigue. El resultado es que el comentario de
 *      al lado prometía un color («el color de aviso, no el de peligro») y en
 *      pantalla salía otro. Un fantasma con fallback es peor que un error: se
 *      ve razonable y miente.
 *   2. COLISIÓN DE PREFIJOS. Breadcrumb.css y BloqueCopiable.css usaban los dos
 *      `bc-`. Los dos CSS son globales, así que sus reglas se sumaban sobre los
 *      mismos nodos: la miga del header salía con fondo hundido y borde, el
 *      bloque copiable se maquetaba en fila, y el texto de «volver» perdía su
 *      hover. Nada de eso lo caza un test por pantalla.
 *   3. ESTADOS QUE FALTAN. Acciones que solo aparecen con el ratón encima y no
 *      con el foco del teclado: existen, se pueden tabular y no se ven.
 *   4. DESHABILITADO A OJO. Cinco opacidades distintas para el mismo estado.
 *
 * Cada bloque trae su MUTANTE: se reinyecta la avería y se comprueba que el
 * candado la mata. Un candado que no sabe fallar solo da confianza.
 */

const raiz = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const lee = (rel: string) => readFileSync(raiz(rel), "utf8");
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const GLOBALS = lee("../src/app/globals.css");

/** Todos los .css de la frontera visual, con su ruta relativa para los mensajes. */
function ficherosCss(): { ruta: string; css: string }[] {
  const dirs = ["../src/components", "../src/components/screens", "../src/components/landing"];
  const out: { ruta: string; css: string }[] = [];
  for (const d of dirs) {
    for (const f of readdirSync(raiz(d))) {
      if (!f.endsWith(".css")) continue;
      out.push({ ruta: `${d.replace("../", "")}/${f}`, css: readFileSync(raiz(`${d}/${f}`), "utf8") });
    }
  }
  out.push({ ruta: "src/app/globals.css", css: GLOBALS });
  return out;
}

const CSS = ficherosCss();
const DECLARA = /(--[\w-]+)\s*:/g;
const USA = /var\(\s*(--[\w-]+)/g;

const nombres = (re: RegExp, s: string) => [...s.matchAll(new RegExp(re.source, "g"))].map((m) => m[1]!);

/* ══════════════════════════════════════════════════════════════════════════
   1 · NINGÚN TOKEN FANTASMA
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Propiedades personalizadas que NO están en globals.css y aun así son legítimas
 * porque las escribe JavaScript en el `style` del nodo. Cada una con su sitio:
 * si mañana alguien borra ese código, el candado deja de excusarla y salta.
 */
const DESDE_JS = new Map<string, string>([
  ["--tv-zoom", "TemplateViewer.tsx:275 — el zoom del visor, en el style del <div>"],
  ["--tv-base", "TemplateViewer.tsx:275 — el ancho base de la hoja"],
  ["--d", "retardo de escalonado; lo ponen AuthScreen/ImportarScreen en style"],
  ["--i", "índice de palabra/letra en cWordIn/cCharIn; lo pone el JS del reveal"],
  ["--mx", "posición del puntero para .c-spot; la escribe el runtime"],
  ["--my", "ídem"],
]);

/** Tokens declarados en globals.css (el vocabulario del producto). */
const DEL_SISTEMA = new Set(nombres(DECLARA, sinComentarios(GLOBALS)));

function fantasmasDe(ruta: string, css: string): string[] {
  const limpio = sinComentarios(css);
  // Un fichero puede definirse variables propias (landing.css lo hace con --doc-*).
  const propias = new Set(nombres(DECLARA, limpio));
  return [...new Set(nombres(USA, limpio))].filter(
    (n) => !DEL_SISTEMA.has(n) && !propias.has(n) && !DESDE_JS.has(n) && ruta === ruta,
  );
}

describe("pulido visual · tokens fantasma", () => {
  it("1 · el vocabulario está completo (si esto falla, el resto del bloque miente)", () => {
    // Ancla: si el parser devolviera 0 tokens, todo daría verde por vacuidad.
    expect(DEL_SISTEMA.size).toBeGreaterThan(60);
    expect(DEL_SISTEMA.has("--accent-text")).toBe(true);
    expect(DEL_SISTEMA.has("--opacity-disabled")).toBe(true);
    expect(CSS.length).toBeGreaterThan(15);
  });

  it("2 · ningún var(--x) apunta a un token que no existe en ninguna parte", () => {
    const hallazgos: string[] = [];
    for (const { ruta, css } of CSS) {
      for (const n of fantasmasDe(ruta, css)) hallazgos.push(`${ruta} → ${n}`);
    }
    expect(
      hallazgos,
      "var() a propiedades que nadie define. CSS se come el fallback y sigue, así " +
        "que se ve razonable y pinta otra cosa: " + hallazgos.join(" · "),
    ).toEqual([]);
  });

  it("3 · los dos fantasmas concretos que había ya no están escritos", () => {
    // Sin quitar comentarios esto daría rojo por la razón equivocada: los dos
    // ficheros CITAN el fantasma en la nota que explica por qué se fue.
    expect(sinComentarios(lee("../src/components/screens/master.css"))).not.toMatch(
      /var\(\s*--warn\b/,
    );
    expect(sinComentarios(lee("../src/components/screens/tailor.css"))).not.toMatch(
      /var\(\s*--text-patina\b/,
    );
    // Y lo que quedó en su sitio es un token REAL, no otro invento.
    expect(lee("../src/components/screens/tailor.css")).toMatch(
      /\.tl-done\{color:var\(--accent-text\)/,
    );
  });

  it("4 · MUTANTE: un fantasma nuevo con fallback creíble → el candado lo caza", () => {
    const mutante = ".ms-x{color:var(--warn-nuevo,var(--danger))}";
    expect(fantasmasDe("mutante.css", mutante)).toContain("--warn-nuevo");
    // CONTRAMUTANTE: un token real con fallback NO se marca (sin falsos positivos,
    // o alguien apagaría el test la primera semana).
    expect(fantasmasDe("mutante.css", ".ms-x{color:var(--danger,#000)}")).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2 · UN PREFIJO, UN COMPONENTE
   ══════════════════════════════════════════════════════════════════════════ */

/** Selectores de clase que declara un CSS (`.foo`, `.foo-bar`). */
function clasesDe(css: string): Set<string> {
  const limpio = sinComentarios(css);
  return new Set([...limpio.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]!));
}

describe("pulido visual · el prefijo bc- es de la miga y de nadie más", () => {
  const BREADCRUMB = clasesDe(lee("../src/components/Breadcrumb.css"));
  const COPIABLE = clasesDe(lee("../src/components/BloqueCopiable.css"));

  it("1 · Breadcrumb conserva sus clases (es el que tenía el nombre)", () => {
    for (const c of ["bc", "bc-back", "bc-arrow", "bc-sep", "bc-current"]) {
      expect(BREADCRUMB.has(c), `Breadcrumb.css perdió .${c}`).toBe(true);
    }
  });

  it("2 · BloqueCopiable no declara NI UNA clase del espacio bc-", () => {
    const invasoras = [...COPIABLE].filter((c) => c === "bc" || c.startsWith("bc-"));
    expect(
      invasoras,
      `BloqueCopiable.css vuelve a pisar el prefijo de la miga: ${invasoras.join(", ")}`,
    ).toEqual([]);
    // Y sí declara el suyo, que no es un prefijo de bc- (un selector de clase casa
    // el token entero: .bc nunca casa "bcp").
    expect(COPIABLE.has("bcp")).toBe(true);
    expect(COPIABLE.has("bcp-head")).toBe(true);
  });

  it("3 · el marcado del componente va con su CSS (si no, se queda sin estilo)", () => {
    const tsx = lee("../src/components/BloqueCopiable.tsx");
    for (const c of ["bcp", "bcp-head", "bcp-label", "bcp-copy", "bcp-pre", "bcp-status"]) {
      expect(tsx.includes(c), `BloqueCopiable.tsx no pinta .${c}`).toBe(true);
    }
    expect(tsx).not.toMatch(/className=["'`]bc[-"'` ]/);
    // Y quien lo coloca desde una pantalla también apunta al nombre nuevo.
    expect(lee("../src/components/screens/importar.css")).toMatch(/\.bcp\.imp-pl__prompt/);
  });

  /**
   * REFERENCIAR el espacio `bc-` no es ocuparlo. Una pantalla que aloja la miga
   * puede colocarla desde su propio CSS (variantes.css la esconde en estrecho con
   * `.c-header .vr-bc .bc-current`) y eso es legítimo: el selector está ANCLADO a
   * una clase que no es de la miga. Ocuparlo es escribir una regla cuyo selector
   * se compone SOLO de clases del espacio bc-, como hacía `.bc-label{…}`: esa
   * regla cae sobre cualquier miga del producto, venga de donde venga.
   */
  const esDelEspacioBc = (c: string) => c === "bc" || c.startsWith("bc-");
  function ocupacionesDe(css: string): string[] {
    const out: string[] = [];
    for (const m of sinComentarios(css).matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      for (const parte of m[1]!.split(",")) {
        const cs = [...parte.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((x) => x[1]!);
        if (cs.length && cs.every(esDelEspacioBc)) out.push(parte.trim());
      }
    }
    return out;
  }

  it("4 · ningún OTRO css del producto se apropia del espacio bc-", () => {
    const intrusos: string[] = [];
    for (const { ruta, css } of CSS) {
      if (ruta.endsWith("Breadcrumb.css")) continue;
      for (const sel of ocupacionesDe(css)) intrusos.push(`${ruta} → ${sel}`);
    }
    expect(
      intrusos,
      `otro componente vuelve a ocupar el prefijo de la miga: ${intrusos.join(" · ")}`,
    ).toEqual([]);
  });

  it("5 · MUTANTE: reintroducir .bc-label fuera de la miga se caza; anclarlo no", () => {
    expect(ocupacionesDe(".bc-label{color:red}")).toEqual([".bc-label"]);
    // CONTRAMUTANTE: colocar la miga desde una pantalla NO es ocuparla.
    expect(ocupacionesDe(".c-header .vr-bc .bc-current{display:none}")).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3 · LO QUE APARECE CON EL RATÓN TIENE QUE APARECER CON EL FOCO
   ══════════════════════════════════════════════════════════════════════════
   Patrón del producto: una fila de acciones vive en `opacity:0` y se revela con
   `:hover` del contenedor. Si el único disparador es el ratón, quien tabula
   enfoca un botón invisible. Master, editor y variantes ya lo habían tapado;
   staging no. Esto lo generaliza: por cada clase revelada por hover, tiene que
   existir un revelado por foco de la MISMA clase.
   ══════════════════════════════════════════════════════════════════════════ */

/** Reglas `selector{…opacity:1…}` — devuelve [selector, cuerpo]. */
function reglasOpacidadUno(css: string): [string, string][] {
  const out: [string, string][] = [];
  for (const m of sinComentarios(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/opacity\s*:\s*1\b/.test(m[2]!)) out.push([m[1]!.trim(), m[2]!]);
  }
  return out;
}

/** La última clase del selector: la que de verdad se está revelando. */
function claseRevelada(sel: string): string | null {
  const cs = [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]!);
  return cs.length ? cs[cs.length - 1]! : null;
}

/** Clases que ALGUNA regla deja en `opacity:0`: las que de verdad se esconden. */
function ocultasEnReposo(css: string): Set<string> {
  const out = new Set<string>();
  for (const m of sinComentarios(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/opacity\s*:\s*0\s*(;|$)/.test(m[2]!)) continue;
    for (const parte of m[1]!.split(",")) {
      const c = claseRevelada(parte);
      if (c) out.add(c);
    }
  }
  return out;
}

function reveladas(css: string, filtro: (sel: string) => boolean): Set<string> {
  const ocultas = ocultasEnReposo(css);
  const out = new Set<string>();
  for (const [sel] of reglasOpacidadUno(css)) {
    if (!filtro(sel)) continue;
    for (const parte of sel.split(",")) {
      if (!filtro(parte)) continue;
      // Un ::before/::after es DECORACIÓN, no un control: el brillo de .c-spot o
      // el filamento de .c-btn--forge aparecen con el puntero y no tienen por qué
      // aparecer con el foco — no hay nada que pulsar ahí.
      if (parte.includes("::")) continue;
      const c = claseRevelada(parte);
      // Y solo cuenta lo que estaba ESCONDIDO del todo. Atenuar (.tg-zoom vive al
      // .55) no deja a nadie sin ver el control.
      if (c && ocultas.has(c)) out.add(c);
    }
  }
  return out;
}

const porHover = (css: string) => reveladas(css, (s) => s.includes(":hover"));
const porFoco = (css: string) => reveladas(css, (s) => s.includes(":focus"));

describe("pulido visual · ningún control se esconde del teclado", () => {
  it("1 · toda clase revelada por :hover tiene también un disparador de :focus", () => {
    const huecos: string[] = [];
    for (const { ruta, css } of CSS) {
      const foco = porFoco(css);
      for (const c of porHover(css)) {
        if (!foco.has(c)) huecos.push(`${ruta} → .${c}`);
      }
    }
    expect(
      huecos,
      "estas acciones aparecen con el ratón y no con el foco: quien tabula enfoca " +
        "un control invisible. " + huecos.join(" · "),
    ).toEqual([]);
  });

  it("2 · staging, que era el hueco, revela sus acciones con foco", () => {
    const stg = lee("../src/components/screens/staging.css");
    expect(stg).toMatch(/\.stg-b:focus-within\s+\.stg-acts/);
    expect(stg).toMatch(/\.stg-chead:focus-within\s+\.stg-acts/);
    expect(stg).toMatch(/\.stg-sk:focus-within\s+\.stg-acts/);
    // Y el reposo NO se toca: siguen ocultas hasta que algo las pide.
    expect(stg).toMatch(/\.stg-acts\{[^}]*opacity:0/);
  });

  it("3 · MUTANTE: devolver staging a como estaba (sin foco) → el candado salta", () => {
    const original = sinComentarios(lee("../src/components/screens/staging.css"));
    // Se le quita TODO disparador de foco, que es exactamente el estado del que
    // venía la pantalla. Si el candado no lo caza así, no cazaría nada.
    const mutante = original.replace(/:focus-within/g, ":hover").replace(/:focus-visible/g, ":hover");
    expect(mutante, "el mutante no llegó a aplicarse").not.toBe(original);
    expect(porFoco(mutante).size).toBe(0);
    expect(
      [...porHover(mutante)].some((c) => !porFoco(mutante).has(c)),
      "con staging sin foco tiene que quedar al menos un control inalcanzable",
    ).toBe(true);
    // Y con el fichero REAL, ese mismo hueco no existe.
    expect([...porHover(original)].filter((c) => !porFoco(original).has(c))).toEqual([]);
  });

  it("4 · el volcado de Importar apaga el aro del sistema PERO pone el suyo", () => {
    const imp = lee("../src/components/screens/importar.css");
    // Si un día se quita el outline:none, este candado deja de tener sentido y hay
    // que borrarlo; mientras esté, el acuse del contenedor es obligatorio.
    expect(imp).toMatch(/\.imp-ta:focus\{outline:none\}/);
    expect(imp).toMatch(/\.imp-box:focus-within\{[^}]*--focus-ring/);
    // Y el orden importa: .is-drag pesa lo mismo (0,2,0) y tiene que ir DESPUÉS
    // para ganar el empate mientras se arrastra.
    expect(imp.indexOf(".imp-box:focus-within")).toBeLessThan(imp.indexOf(".imp-box.is-drag"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4 · UN SOLO APAGADO
   ══════════════════════════════════════════════════════════════════════════ */
describe("pulido visual · lo deshabilitado se apaga igual en toda la app", () => {
  /** Reglas con :disabled / [disabled] que fijan una opacidad literal. */
  function opacidadesLiterales(css: string): string[] {
    const out: string[] = [];
    for (const m of sinComentarios(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1]!.trim();
      if (!/:disabled|\[disabled\]|aria-disabled/.test(sel)) continue;
      const op = m[2]!.match(/opacity\s*:\s*([\d.]+)/);
      if (op) out.push(`${sel} → opacity:${op[1]}`);
    }
    return out;
  }

  it("1 · el token existe y vale lo mismo que el .c-btn del porte", () => {
    const decl = sinComentarios(GLOBALS).match(/--opacity-disabled:\s*([^;]+);/);
    expect(decl, "falta --opacity-disabled en globals.css").not.toBeNull();
    const delBoton = sinComentarios(GLOBALS).match(
      /\.c-btn\[disabled\][^{]*\{[^}]*opacity:\s*([\d.]+)/,
    );
    expect(delBoton, "ya no existe la regla del sistema que este token refleja").not.toBeNull();
    expect(Number(decl![1]!.trim())).toBeCloseTo(Number(delBoton![1]!), 5);
  });

  it("2 · ninguna pantalla se inventa su propia opacidad de deshabilitado", () => {
    const sueltas: string[] = [];
    for (const { ruta, css } of CSS) {
      // La única excepción es la regla del sistema en globals.css: §2 es copia
      // íntegra del paquete de diseño y aquí no se interpreta el porte.
      for (const r of opacidadesLiterales(css)) {
        if (ruta === "src/app/globals.css" && r.startsWith(".c-btn[disabled]")) continue;
        sueltas.push(`${ruta} → ${r}`);
      }
    }
    expect(
      sueltas,
      "usa var(--opacity-disabled): un control apagado tiene que apagarse igual en " +
        "toda la app o el usuario no aprende a leerlo. " + sueltas.join(" · "),
    ).toEqual([]);
  });

  it("3 · y el token se usa de verdad, no está solo declarado", () => {
    const usos = CSS.filter(({ css }) => css.includes("var(--opacity-disabled)")).length;
    expect(usos).toBeGreaterThanOrEqual(6);
  });

  it("4 · MUTANTE: una opacidad a mano en un :disabled nuevo → se caza", () => {
    expect(opacidadesLiterales(".x:disabled{opacity:.5;cursor:default}")).toEqual([
      ".x:disabled → opacity:.5",
    ]);
    expect(opacidadesLiterales(".x:disabled{opacity:var(--opacity-disabled)}")).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5 · PORCELANA · el punto de estado no puede ir por libre
   ══════════════════════════════════════════════════════════════════════════
   El panel de conexiones pintaba el punto de «en línea» con patina-500 mientras
   su etiqueta usaba --accent-text. En grafito da lo mismo; en porcelana no:
   patina-500 sobre el papel del panel no llega al 3:1 que pide un objeto
   gráfico con significado, y su etiqueta sí. Con `currentColor` el punto no
   puede volver a separarse del texto que lo nombra.
   ══════════════════════════════════════════════════════════════════════════ */
describe("pulido visual · el panel de conexiones en porcelana", () => {
  const AJUSTES = lee("../src/components/screens/ajustes.css");
  // Valores leídos del CSS real, no copiados: si alguien retoca un hex, cae aquí.
  const hexDe = (tokenYAmbito: RegExp) => sinComentarios(GLOBALS).match(tokenYAmbito)![1]!;
  const PATINA_500 = hexDe(/--patina-500:\s*(#[0-9A-Fa-f]{6})/);
  const PATINA_700 = hexDe(/--patina-700:\s*(#[0-9A-Fa-f]{6})/);
  const SURFACE_CLARA = "#FFFFFF"; // [data-theme="light"] --surface
  const MINIMO_NO_TEXTO = 3; // WCAG 1.4.11 · componentes de interfaz y gráficos

  it("1 · el motivo, medido: patina-500 no vale como punto sobre porcelana y patina-700 sí", () => {
    const malo = contrastRatio(PATINA_500, SURFACE_CLARA);
    const bueno = contrastRatio(PATINA_700, SURFACE_CLARA);
    expect(malo, `patina-500 sobre papel mide ${ratioText(malo)}`).toBeLessThan(MINIMO_NO_TEXTO);
    expect(bueno, `patina-700 sobre papel mide ${ratioText(bueno)}`).toBeGreaterThanOrEqual(
      MINIMO_NO_TEXTO,
    );
  });

  it("2 · el punto hereda el color de su etiqueta y no declara ninguno propio", () => {
    expect(AJUSTES).toMatch(/\.aj-dot\{[^}]*background:currentColor/);
    // Ninguna regla de estado le vuelve a poner un color de relleno a mano.
    const conRelleno = [...sinComentarios(AJUSTES).matchAll(/([^{}]*\.aj-dot[^{}]*)\{([^{}]*)\}/g)]
      .filter(([, , cuerpo]) => /background:\s*(?!transparent|currentColor)[^;]/.test(cuerpo!))
      .map(([, sel]) => sel!.trim());
    expect(
      conRelleno,
      `el punto vuelve a llevar color propio (se despega de su etiqueta): ${conRelleno.join(" · ")}`,
    ).toEqual([]);
  });

  it("3 · «a medias» se distingue por FORMA, no solo por tono", () => {
    // Su etiqueta es --text-muted, el mismo gris del motivo que va debajo: sin una
    // diferencia de forma, el estado intermedio no se lee como estado.
    expect(AJUSTES).toMatch(
      /\.aj-conn-badge\.is-warn\s+\.aj-dot\{[^}]*background:transparent;[^}]*inset 0 0 0 2px currentColor/,
    );
  });
});
