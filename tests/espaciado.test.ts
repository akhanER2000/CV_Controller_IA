/* ============================================================================
   ESPACIADO · el candado de los dos bugs visuales del bloque C

   Los dos síntomas que se reportaron eran el mismo fallo con dos caras:

     1. EL MASTER. La barra de acciones de arriba (Descargar .md · en blanco ·
        con un ejemplo · Revisar mi master con IA · + Añadir item manual) quedaba
        pegada al rótulo «PERFIL / CONTACTO · se imprime en el cuerpo del CV».
        Causa: el ritmo vertical entre secciones (40px) lo llevaba SOLO la clase
        .ms-g, que la pinta groupSection(); el bloque de contacto no pasa por ahí
        —no se pliega— y se escribió a mano como <section id="contacto">, así que
        nació sin margen. Y es justamente el que va PRIMERO.
     2. EL PANEL. «Aún no hay variantes · Crea la primera →» pegado al borde de
        su celda. Causa: un `style={{padding:"12px 0"}}` en línea que pisaba el
        canalón de .db-fine. Un padding en línea le gana SIEMPRE a la hoja, así
        que ninguna revisión del CSS podía verlo.

   La causa de fondo de las dos es la misma: espaciado ESCRITO A MANO. Mientras
   el valor viva en veinte sitios, cada componente nuevo elige el suyo (en master
   convivían 20px, 18px y 16px de canalón; en el Panel, 11, 12, 14, 16 y un 0).

   Este fichero NO comprueba que algo «esté bonito»: comprueba que el valor tenga
   UN dueño y que nadie lo pise. Cada bloque trae su MUTANTE —se reinyecta la
   avería y se exige que el candado la mate— y, donde hace falta, su
   CONTRAMUTANTE, para que no salte con lo que sí es legítimo.

   Se lee el CÓDIGO FUENTE, no un DOM: el entorno de vitest es `node`, y aunque
   se montara jsdom NO resuelve var(--x) en getComputedStyle, que es precisamente
   lo que hay que verificar aquí. Lo que se comprueba es exactamente lo que se
   despliega.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const raiz = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const lee = (rel: string) => readFileSync(raiz(rel), "utf8");

/** El fuente SIN comentarios. Imprescindible en negativo: los comentarios de
 *  este repo CITAN la avería que se quitó («el style={{padding:…}} que había
 *  aquí»), y buscarla a pelo encontraría la explicación y daría rojo por la
 *  razón equivocada. */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ");

const GLOBALS = lee("../src/app/globals.css");
const MASTER_CSS = lee("../src/components/screens/master.css");
const DASH_CSS = lee("../src/components/screens/dashboard.css");
const MASTER_TSX = lee("../src/components/screens/MasterScreen.tsx");
const DASH_TSX = lee("../src/components/screens/DashboardScreen.tsx");

/* ── Analizador mínimo de CSS ────────────────────────────────────────────────
   Mismo enfoque que pulido-visual.test.ts: un barrido de reglas planas. Las
   reglas dentro de @media también caen (el prelude del @media no casa porque su
   cuerpo contiene llaves, así que el barrido entra a las de dentro). */
type Regla = { sel: string; cuerpo: string };

function reglasDe(css: string): Regla[] {
  const out: Regla[] = [];
  for (const m of sinComentarios(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ sel: m[1]!.trim(), cuerpo: m[2]! });
  }
  return out;
}

/** Valor de una propiedad en el cuerpo de una regla (`padding`, `margin-top`…). */
function valorDe(cuerpo: string, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(cuerpo);
  return m ? m[1]!.trim() : null;
}

/** Parte un valor abreviado en componentes RESPETANDO los paréntesis: `12px
 *  var(--card-pad-x)` son dos, no tres (var(--a, 4px) tampoco se rompe). */
function partesDe(valor: string): string[] {
  const out: string[] = [];
  let buf = "";
  let prof = 0;
  for (const ch of valor.trim()) {
    if (ch === "(") prof++;
    if (ch === ")") prof--;
    if (/\s/.test(ch) && prof === 0) {
      if (buf) out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

/** Los componentes del EJE X de un padding/margin abreviado (1, 2, 3 ó 4 partes). */
function ejeX(valor: string): string[] {
  const p = partesDe(valor);
  if (p.length === 0) return [];
  if (p.length === 1) return [p[0]!];
  if (p.length >= 4) return [p[1]!, p[3]!];
  return [p[1]!];
}

const ES_LITERAL_PX = (v: string) => /^-?\d*\.?\d+px$/.test(v);

/* ══════════════════════════════════════════════════════════════════════════
   1 · EL TOKEN TIENE UN SOLO DUEÑO
   El canalón interior de una tarjeta (--card-pad-x) se declara en globals y en
   ningún otro sitio. Dos declaraciones = dos verdades = el bug otra vez, pero
   más difícil de encontrar.
   ══════════════════════════════════════════════════════════════════════════ */
describe("espaciado · --card-pad-x se declara una vez y se usa desde fuera", () => {
  const declaraciones = (css: string) =>
    [...sinComentarios(css).matchAll(/--card-pad-x\s*:/g)].length;

  it("1 · globals.css lo declara exactamente una vez", () => {
    expect(declaraciones(GLOBALS)).toBe(1);
    // Y con un valor real, no vacío ni heredado de la nada.
    expect(sinComentarios(GLOBALS)).toMatch(/--card-pad-x\s*:\s*\d+px/);
  });

  it("2 · ninguna pantalla lo REDECLARA (una segunda verdad local es el bug de origen)", () => {
    expect(declaraciones(MASTER_CSS), "master.css redeclara --card-pad-x").toBe(0);
    expect(declaraciones(DASH_CSS), "dashboard.css redeclara --card-pad-x").toBe(0);
  });

  it("3 · y las dos pantallas del bloque lo USAN (si nadie lo usa, el token es decoración)", () => {
    expect(sinComentarios(MASTER_CSS)).toMatch(/var\(--card-pad-x\)/);
    expect(sinComentarios(DASH_CSS)).toMatch(/var\(--card-pad-x\)/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2 · EL MASTER · el ritmo vertical tiene un dueño y DOS clientes
   ══════════════════════════════════════════════════════════════════════════ */

/** Las reglas que fijan el ritmo de sección, sea cual sea su selector. */
function reglasDeRitmo(css: string): Regla[] {
  return reglasDe(css).filter((r) => /margin-top\s*:\s*var\(--ms-ritmo-seccion\)/.test(r.cuerpo));
}

/** ¿La lista de selectores cubre a los grupos plegables (.ms-g)? */
const cubreGrupos = (sel: string) => sel.split(",").some((p) => /\.ms-g(?![\w-])/.test(p));

/** ¿…y al bloque de CONTACTO, que NO lleva .ms-g porque no lo pinta
 *  groupSection()? Vale cualquiera de las dos formas honestas: la genérica
 *  (cualquier <section> hija de #groups) o la nominal (#contacto). */
const cubreContacto = (sel: string) =>
  sel.split(",").some((p) => /#groups\s*>\s*section(?![\w-])/.test(p) || /#contacto(?![\w-])/.test(p));

describe("espaciado · master: la barra de acciones no se pega al primer bloque", () => {
  const ritmo = reglasDeRitmo(MASTER_CSS);

  it("1 · el valor del ritmo vive en un único token, declarado una vez", () => {
    expect([...sinComentarios(MASTER_CSS).matchAll(/--ms-ritmo-seccion\s*:/g)].length).toBe(1);
    expect(sinComentarios(MASTER_CSS)).toMatch(/--ms-ritmo-seccion\s*:\s*40px/);
    // Y ya NO queda el 40px suelto que antes era la única fuente de verdad.
    expect(
      sinComentarios(MASTER_CSS),
      "vuelve a haber un margin-top:40px escrito a mano; son dos verdades",
    ).not.toMatch(/margin-top\s*:\s*40px/);
  });

  it("2 · una sola regla fija el ritmo, y cubre grupos Y contacto", () => {
    expect(ritmo.length, "el ritmo se fija en más de un sitio o en ninguno").toBe(1);
    const sel = ritmo[0]!.sel;
    expect(cubreGrupos(sel), `el ritmo dejó de cubrir .ms-g: «${sel}»`).toBe(true);
    expect(
      cubreContacto(sel),
      `el ritmo NO cubre el bloque de contacto: «${sel}». Es el que va primero, ` +
        "así que sin margen queda pegado a la barra de acciones.",
    ).toBe(true);
  });

  it("3 · el marcado sigue siendo el que el selector persigue", () => {
    // Si mañana el contacto deja de ser <section> hija de #groups, la regla del
    // punto 2 pasa a no casar con NADA y el bug vuelve en silencio: el CSS se
    // quedaría correcto y la pantalla, pegada. Este anclaje es lo que convierte
    // el candado anterior en una comprobación real.
    const iGroups = MASTER_TSX.indexOf('id="groups"');
    const iLlamada = MASTER_TSX.indexOf("{contactBlock()}");
    expect(iGroups, "MasterScreen ya no pinta #groups").toBeGreaterThan(-1);
    expect(MASTER_TSX, 'MasterScreen ya no pinta <section id="contacto">').toContain(
      '<section id="contacto"',
    );
    // Se compara con la LLAMADA, no con la definición de contactBlock(): la
    // función se declara arriba del componente y su índice no dice nada de dónde
    // se pinta. Lo que importa es que se pinte DENTRO de #groups.
    expect(iLlamada, "contactBlock() ya no se pinta").toBeGreaterThan(-1);
    expect(iLlamada, "el bloque de contacto salió de #groups").toBeGreaterThan(iGroups);
  });

  it("4 · MUTANTE: volver a dejar el ritmo solo en .ms-g → el candado lo caza", () => {
    const mutante = ".ms-g{margin-top:var(--ms-ritmo-seccion)}";
    const r = reglasDeRitmo(mutante);
    expect(r.length).toBe(1);
    expect(cubreGrupos(r[0]!.sel)).toBe(true);
    expect(cubreContacto(r[0]!.sel)).toBe(false); // ← esto es lo que hoy da rojo
  });

  it("5 · CONTRAMUTANTE: la forma nominal también vale (no exigimos UNA redacción)", () => {
    const otra = ".ms-g,#contacto{margin-top:var(--ms-ritmo-seccion)}";
    const r = reglasDeRitmo(otra);
    expect(cubreGrupos(r[0]!.sel)).toBe(true);
    expect(cubreContacto(r[0]!.sel)).toBe(true);
    // Y una clase que solo EMPIEZA por ms-g no cuenta como .ms-g.
    expect(cubreGrupos(".ms-group{margin-top:0}")).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3 · EL PANEL · todas las tarjetas comparten canalón
   ══════════════════════════════════════════════════════════════════════════ */

/** Las seis celdas del bento. Son las que se ven a la vez, separadas por 1–2px:
 *  si una arranca en otra x, la rejilla se lee torcida. */
const TARJETAS_PANEL = [".db-ch", ".db-vrow", ".db-srow", ".db-fine", ".db-stg", ".db-fcell"];

/**
 * Reglas EXENTAS de la regla del canalón, cada una con su motivo. Es una lista
 * cerrada a propósito: si mañana aparece una tarjeta nueva con su padding a
 * mano, NO cae aquí por descuido — hay que venir a escribir por qué.
 */
const EXENTAS = new Map<string, string>([
  [".db-main", "es el <main> de la pantalla, no una tarjeta: su x es 0 (el canalón lo pone .c-container)"],
  [".db-cell", "reset a 0 a propósito: el padding lo ponen sus hijas (.db-ch, .db-vrow…)"],
  [".db-empty", "pantalla del día 1 a página completa; su x es --container-pad, el canalón de página"],
  [".db-vrow .pdf", "botón dentro de una fila, no una tarjeta: su padding es el de un control"],
]);

/** Cada padding de dashboard.css con su selector, ya filtrado por exenciones. */
function paddingsDelPanel(css: string): { sel: string; valor: string }[] {
  return reglasDe(css)
    .map((r) => ({ sel: r.sel, valor: valorDe(r.cuerpo, "padding") }))
    .filter((x): x is { sel: string; valor: string } => x.valor !== null)
    .filter((x) => !EXENTAS.has(x.sel));
}

describe("espaciado · panel: ninguna tarjeta elige su propio canalón", () => {
  it("1 · ancla: el analizador ve reglas de verdad (si no, todo daría verde por vacío)", () => {
    expect(reglasDe(DASH_CSS).length).toBeGreaterThan(30);
    expect(paddingsDelPanel(DASH_CSS).length).toBeGreaterThan(4);
  });

  it("2 · ningún padding del Panel escribe píxeles a mano en el eje x", () => {
    const culpables: string[] = [];
    for (const { sel, valor } of paddingsDelPanel(DASH_CSS)) {
      for (const x of ejeX(valor)) if (ES_LITERAL_PX(x)) culpables.push(`${sel} → padding:${valor}`);
    }
    expect(
      culpables,
      "el canalón vuelve a estar escrito a mano; así es como una tarjeta acabó a 0: " +
        culpables.join(" · "),
    ).toEqual([]);
  });

  it("3 · las seis tarjetas del bento usan LITERALMENTE el mismo token", () => {
    const porTarjeta = new Map<string, string[]>();
    for (const { sel, valor } of paddingsDelPanel(DASH_CSS)) {
      if (TARJETAS_PANEL.includes(sel)) porTarjeta.set(sel, ejeX(valor));
    }
    // Todas presentes: si alguien borra una regla, no queremos verde por ausencia.
    expect([...porTarjeta.keys()].sort()).toEqual([...TARJETAS_PANEL].sort());
    for (const [sel, xs] of porTarjeta) {
      for (const x of xs) {
        expect(x, `${sel} no comparte el canalón del Panel`).toBe("var(--card-pad-x)");
      }
    }
  });

  it("4 · el estado vacío de variantes usa .db-fine, que es quien trae el canalón", () => {
    // El síntoma reportado. La clase tiene que seguir puesta: sin ella el texto
    // pierde a la vez el canalón y la tipografía de letra pequeña.
    expect(DASH_TSX).toMatch(/className="db-fine"/);
    expect(DASH_TSX).toContain("dashboard.variants.emptyRow");
    expect(DASH_TSX).toContain("dashboard.variants.createFirst");
  });

  it("5 · MUTANTE: una tarjeta con su padding a mano → cazada por 2 y por 3", () => {
    const mutante = ".db-fcell{background:var(--surface-glass);padding:14px 12px}";
    const p = paddingsDelPanel(mutante);
    expect(p).toHaveLength(1);
    expect(ejeX(p[0]!.valor).some(ES_LITERAL_PX)).toBe(true);
    expect(ejeX(p[0]!.valor)[0]).not.toBe("var(--card-pad-x)");
    // CONTRAMUTANTE: la forma buena NO se marca.
    const sano = ".db-fcell{padding:var(--sp-4) var(--card-pad-x)}";
    expect(ejeX(paddingsDelPanel(sano)[0]!.valor).some(ES_LITERAL_PX)).toBe(false);
  });

  it("6 · el troceador respeta los paréntesis (o el candado mentiría en ambos sentidos)", () => {
    expect(partesDe("var(--sp-4) var(--card-pad-x)")).toEqual(["var(--sp-4)", "var(--card-pad-x)"]);
    expect(partesDe("var(--sp-3, 12px) 20px")).toEqual(["var(--sp-3, 12px)", "20px"]);
    expect(ejeX("var(--sp-5)")).toEqual(["var(--sp-5)"]);          // 1 valor: los 4 lados
    expect(ejeX("12px 20px")).toEqual(["20px"]);                    // 2 valores
    expect(ejeX("16px 20px 12px")).toEqual(["20px"]);               // 3 valores
    expect(ejeX("1px 2px 3px 4px")).toEqual(["2px", "4px"]);        // 4 valores: izq y der
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4 · NADIE PISA EL CANALÓN DESDE EL `style` EN LÍNEA
   Este es el candado que habría cazado el bug reportado. Un padding en el
   atributo `style` gana a cualquier hoja de estilos, así que el CSS puede estar
   perfecto y la tarjeta salir pegada al borde igual.
   ══════════════════════════════════════════════════════════════════════════ */

/** Propiedades de espaciado escritas dentro de un `style={{ … }}` del JSX. */
function paddingsEnLinea(tsx: string): string[] {
  const out: string[] = [];
  for (const m of sinComentarios(tsx).matchAll(/style=\{\{([^}]*)\}\}/g)) {
    const cuerpo = m[1]!;
    if (/(^|[,{\s])padding[A-Za-z]*\s*:/.test(cuerpo)) out.push(m[0]!.slice(0, 80));
  }
  return out;
}

describe("espaciado · el `style` en línea no decide el canalón del Panel", () => {
  it("1 · DashboardScreen no escribe ningún padding en línea", () => {
    const hallazgos = paddingsEnLinea(DASH_TSX);
    expect(
      hallazgos,
      "un padding en línea le gana a la hoja: es exactamente como «Aún no hay " +
        "variantes» acabó pegado al borde de su tarjeta. " + hallazgos.join(" · "),
    ).toEqual([]);
  });

  it("2 · MUTANTE: reinyectar el padding original → cazado", () => {
    const mutante = '<div className="db-fine" style={{ padding: "12px 0" }}>';
    expect(paddingsEnLinea(mutante)).toHaveLength(1);
    // Y sus primos: paddingLeft/paddingInline también son pisar el canalón.
    expect(paddingsEnLinea('<div style={{ paddingLeft: 0 }}>')).toHaveLength(1);
    expect(paddingsEnLinea('<div style={{ color: "red", paddingInline: 0 }}>')).toHaveLength(1);
  });

  it("3 · CONTRAMUTANTE: márgenes y colores en línea NO se marcan", () => {
    // El fichero usa `style={{ marginBottom: "2px" }}` para casar el hilo del
    // divisor con el gap del bento: es colocación, no canalón de tarjeta. Si el
    // candado saltara con eso, alguien lo apagaría la primera semana.
    expect(paddingsEnLinea('<hr style={{ marginBottom: "2px" }} />')).toEqual([]);
    expect(paddingsEnLinea('<span style={{ color: "var(--accent-text)" }} />')).toEqual([]);
    // Y una MENCIÓN en un comentario no es una infracción.
    expect(paddingsEnLinea('/* antes: style={{ padding: "12px 0" }} */')).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5 · EL MASTER · el canalón de las tarjetas dejó de tener tres valores
   Convivían 20px (.ms-eh/.ms-b), 18px (.ms-sk/.ms-row/.ms-skgroup/.ms-bar) y
   16px (.ms-ref/.ms-dup). Son secciones CONTIGUAS de la misma columna, así que
   el texto arrancaba en tres x distintas al bajar por la pantalla.
   ══════════════════════════════════════════════════════════════════════════ */
const TARJETAS_MASTER = [".ms-eh", ".ms-b", ".ms-sk", ".ms-row", ".ms-skgroup", ".ms-ref", ".ms-dup", ".ms-bar"];

describe("espaciado · master: todas las tarjetas arrancan en la misma x", () => {
  const porSelector = new Map<string, string>();
  for (const r of reglasDe(MASTER_CSS)) {
    const v = valorDe(r.cuerpo, "padding");
    if (v && TARJETAS_MASTER.includes(r.sel)) porSelector.set(r.sel, v);
  }

  it("1 · están todas (si una desaparece, no valdría el verde por ausencia)", () => {
    expect([...porSelector.keys()].sort()).toEqual([...TARJETAS_MASTER].sort());
  });

  it("2 · y todas usan el mismo token en el eje x", () => {
    for (const [sel, valor] of porSelector) {
      for (const x of ejeX(valor)) {
        expect(x, `${sel} vuelve a tener su propio canalón (padding:${valor})`).toBe("var(--card-pad-x)");
      }
    }
  });

  it("3 · el fragmento de evidencia se alinea con el MISMO token, no con un 20 suelto", () => {
    // .ms-frag cuelga de la fila que lo abrió: su margen lateral ES el canalón.
    const frag = reglasDe(MASTER_CSS).find((r) => r.sel === ".ms-frag");
    expect(frag, "desapareció .ms-frag").toBeTruthy();
    expect(ejeX(valorDe(frag!.cuerpo, "margin")!)).toEqual(["var(--card-pad-x)"]);
  });

  it("4 · MUTANTE: devolver .ms-row a sus 18px → cazado", () => {
    const mutante = ".ms-row{display:flex;padding:11px 18px;font-size:13px}";
    const r = reglasDe(mutante)[0]!;
    expect(ejeX(valorDe(r.cuerpo, "padding")!)).toEqual(["18px"]);
    expect(ejeX(valorDe(r.cuerpo, "padding")!)[0]).not.toBe("var(--card-pad-x)");
  });
});
