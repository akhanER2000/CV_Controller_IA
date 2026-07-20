import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { segmentText, promptDeExtraccion, planificarExtraccion, WINDOW_CHARS, WINDOW_OVERLAP } from "../src/lib/extract/llm";
import { repartir, textoPara, conserva, EXTRACTORES_5, type Extractor5 } from "../src/lib/extract/segmentar";
import { CARACTERES_POR_TOKEN, consumoCero, anotarLlamada } from "../src/lib/db/telemetria";

/* ============================================================================
   LA MEDICIÓN · cuánto costaba leer un dossier y cuánto cuesta ahora.

   REPRODUCIBLE Y GRATIS: se mide el prompt que SE MANDARÍA, no se llama a
   Gemini. Cuesta cero, es exacto, y corre en CI sin clave.

   MISMA REGLA A LOS DOS LADOS, declarada una vez:
     · 4 caracteres por token (CARACTERES_POR_TOKEN, en telemetria.ts).
     · El prompt se construye con la MISMA función en el antes y en el después
       (`promptDeExtraccion`), porque el código viejo era literalmente
       `BASE + texto + "\n\n(Extrae: " + foco + ")"` — que es lo que esa función
       hace. Así la comparación no depende de que yo transcriba bien el prompt
       antiguo: usa el de verdad.

   EL DOCUMENTO: el dossier real del repo, 103.744 caracteres JS (106.374 bytes).
   No es un fixture generado: son las 41 secciones que un humano escribió.
   ============================================================================ */

const RUTA = path.join(__dirname, "..", "material-perfil", "dossier", "DOSSIER-MAESTRO-AKHAN.md");
const DOC = fs.readFileSync(RUTA, "utf8");

const tokens = (chars: number) => Math.round(chars / CARACTERES_POR_TOKEN);
const miles = (n: number) => n.toLocaleString("es-CL");

interface Medida {
  llamadas: number;
  caracteresPrompt: number;
  /** solo el TEXTO del usuario interpolado, sin el preámbulo ni el sufijo */
  caracteresTexto: number;
  detalle: { extractor: Extractor5; ventanas: number; chars: number }[];
}

/* ── ANTES ────────────────────────────────────────────────────────────────────
   `extractWindow`: el documento en ventanas solapadas y, por CADA ventana, las
   CINCO llamadas con el texto COMPLETO interpolado en las cinco. Lo único
   distinto entre ellas: ~30 caracteres de sufijo y el schema.               */
function medirAntes(doc: string): Medida {
  const seg = segmentText(doc);
  const m: Medida = { llamadas: 0, caracteresPrompt: 0, caracteresTexto: 0, detalle: [] };
  for (const extractor of EXTRACTORES_5) {
    let chars = 0;
    for (const ventana of seg.windows) {
      m.llamadas += 1;
      const prompt = promptDeExtraccion(extractor, ventana);
      m.caracteresPrompt += prompt.length;
      m.caracteresTexto += ventana.length;
      chars += prompt.length;
    }
    m.detalle.push({ extractor, ventanas: seg.windows.length, chars });
  }
  return m;
}

/* ── DESPUÉS ──────────────────────────────────────────────────────────────────
   Cada extractor recibe SOLO su corpus (el reparto por secciones), ventaneado
   aparte. Un extractor con corpus vacío no se llama.                        */
function medirDespues(doc: string, forzarCompleto = false): Medida {
  // ★ Se mide EL PLAN REAL que ejecuta `makeGeminiExtractor`, no una copia de su
  //   bucle. Si el bucle cambiara y esta medición fuese una réplica, el informe
  //   seguiría diciendo un número bonito mientras el código gasta otro.
  const plan = planificarExtraccion(doc, { forzarCompleto });
  const m: Medida = { llamadas: 0, caracteresPrompt: 0, caracteresTexto: 0, detalle: [] };
  const porExtractor = new Map<Extractor5, { ventanas: number; chars: number }>();

  for (const ll of plan.llamadas) {
    m.llamadas += 1;
    m.caracteresPrompt += ll.prompt.length;
    // el texto del usuario = el prompt menos el preámbulo y el sufijo de foco
    m.caracteresTexto += ll.prompt.length - (promptDeExtraccion(ll.extractor, "").length);
    const acc = porExtractor.get(ll.extractor) ?? { ventanas: 0, chars: 0 };
    acc.ventanas += 1;
    acc.chars += ll.prompt.length;
    porExtractor.set(ll.extractor, acc);
  }
  for (const extractor of EXTRACTORES_5) {
    m.detalle.push({ extractor, ...(porExtractor.get(extractor) ?? { ventanas: 0, chars: 0 }) });
  }
  return m;
}

const ANTES = medirAntes(DOC);
const DESPUES = medirDespues(DOC);
const REPARTO = repartir(DOC);

// ════════════════════════════════════════════════════════════════════════════
// EL INFORME. Se imprime siempre: es el entregable, no un efecto secundario.
// ════════════════════════════════════════════════════════════════════════════
describe("★ MEDICIÓN DEL COSTE · dossier real, sin llamar a Gemini", () => {
  it("imprime el antes y el después con la misma regla de tokens", () => {
    const factorChars = ANTES.caracteresPrompt / DESPUES.caracteresPrompt;
    const factorLlamadas = ANTES.llamadas / DESPUES.llamadas;

    const L = (s = "") => console.log(s);
    L();
    L("╔══════════════════════════════════════════════════════════════════════╗");
    L("║  COSTE DE LA INGESTA · DOSSIER-MAESTRO-AKHAN.md                      ║");
    L("╚══════════════════════════════════════════════════════════════════════╝");
    L(`  Documento .............. ${miles(DOC.length)} caracteres JS (${miles(fs.statSync(RUTA).size)} bytes)`);
    L(`  Regla de tokens ........ ${CARACTERES_POR_TOKEN} caracteres = 1 token (la MISMA antes y después)`);
    L(`  Ventana / solape ....... ${miles(WINDOW_CHARS)} / ${miles(WINDOW_OVERLAP)} caracteres`);
    L();
    L("  ─── ANTES · el texto completo interpolado en las CINCO llamadas ───────");
    L(`  Llamadas ............... ${ANTES.llamadas}`);
    L(`  Caracteres de prompt ... ${miles(ANTES.caracteresPrompt)}`);
    L(`  Texto interpolado ...... ${miles(ANTES.caracteresTexto)}  (× 5, por el solape de ventanas)`);
    L(`  Tokens de entrada ...... ~${miles(tokens(ANTES.caracteresPrompt))}`);
    L();
    L("  ─── DESPUÉS · cada extractor lee SOLO lo suyo ────────────────────────");
    L(`  Llamadas ............... ${DESPUES.llamadas}`);
    L(`  Caracteres de prompt ... ${miles(DESPUES.caracteresPrompt)}`);
    L(`  Texto interpolado ...... ${miles(DESPUES.caracteresTexto)}`);
    L(`  Tokens de entrada ...... ~${miles(tokens(DESPUES.caracteresPrompt))}`);
    for (const d of DESPUES.detalle) {
      L(`      · ${d.extractor.padEnd(10)} ${String(d.ventanas)} ventana(s)  ${miles(d.chars).padStart(9)} chars`);
    }
    L();
    L("  ─── EL REPARTO (suma exacta = documento) ─────────────────────────────");
    L(`  Dirigido ............... ${miles(REPARTO.totales.dirigido)}  (${((REPARTO.totales.dirigido / DOC.length) * 100).toFixed(1)}%)`);
    L(`  Difuso (a los cinco) ... ${miles(REPARTO.totales.difuso)}  (${((REPARTO.totales.difuso / DOC.length) * 100).toFixed(1)}%)`);
    L(`  Contexto (no extraído) . ${miles(REPARTO.totales.contexto)}  (${((REPARTO.totales.contexto / DOC.length) * 100).toFixed(1)}%) · ${REPARTO.contexto.length} secciones NOMBRADAS`);
    L(`  Suma ................... ${miles(REPARTO.totales.dirigido + REPARTO.totales.difuso + REPARTO.totales.contexto)} = ${miles(DOC.length)} ✓`);
    L();
    L("  ─── EL RECORTE ──────────────────────────────────────────────────────");
    L(`  Factor en caracteres/tokens ... ${factorChars.toFixed(2)}×`);
    L(`  Factor en llamadas ............ ${factorLlamadas.toFixed(2)}×  (${ANTES.llamadas} → ${DESPUES.llamadas})`);
    L(`  Tokens ahorrados por ingesta .. ~${miles(tokens(ANTES.caracteresPrompt - DESPUES.caracteresPrompt))}`);
    L();
    L("  NOTA HONESTA: el objetivo de partida era 5,46×, calculado con un");
    L("  enrutado que resultó ser inseguro. Tres correcciones lo bajaron, y las");
    L("  tres se pagan a propósito (ver tests/segmentar.test.ts):");
    L("    1. «BLOQUE 0 — Datos a confirmar» y «15 · PUNTOS A CONFIRMAR» NO son");
    L("       contexto: contienen el nombre público, el correo y el TELÉFONO.");
    L("    2. Las subsecciones de «4 · EXPERIENCIA» heredan work ADEMÁS de su");
    L("       propia clave; si no, «4.2 … Proyecto de título» iba solo a");
    L("       proyectos y el empleo desaparecía.");
    L("    3. «identidad» fuera del diccionario: casaba con el cuestionario");
    L("       entero y arrastraba trece secciones a basics.");
    L();

    expect(DESPUES.caracteresPrompt).toBeGreaterThan(0);
  });

  // ── Las cifras, como aserciones ────────────────────────────────────────────
  it("el documento medido es el dossier real (103.744 caracteres)", () => {
    expect(DOC.length).toBe(103_744);
    expect(fs.statSync(RUTA).size).toBe(106_374);
  });

  it("ANTES · 4 ventanas × 5 extractores = 20 llamadas, y el texto se paga 5 veces", () => {
    const seg = segmentText(DOC);
    expect(seg.windows).toHaveLength(4);
    expect(seg.truncated).toBe(false);
    expect(ANTES.llamadas).toBe(20);
    // La línea base declarada: 112.744 caracteres únicos por ventana × 5.
    expect(ANTES.caracteresTexto).toBe(112_744 * 5);
    expect(ANTES.caracteresTexto).toBe(563_720);
  });

  it("★ DESPUÉS · menos llamadas y menos caracteres, con la misma regla", () => {
    expect(DESPUES.llamadas).toBeLessThan(ANTES.llamadas);
    expect(DESPUES.caracteresPrompt).toBeLessThan(ANTES.caracteresPrompt);
  });

  it("★★ el factor de recorte en caracteres es de al menos 3×", () => {
    // Umbral deliberadamente por DEBAJO del real: este test protege el recorte,
    // no lo celebra. El número exacto se imprime arriba; si alguien toca el
    // diccionario y lo empeora, esto se cae.
    const factor = ANTES.caracteresPrompt / DESPUES.caracteresPrompt;
    expect(factor, `factor real: ${factor.toFixed(2)}×`).toBeGreaterThan(3);
  });

  it("★★ el factor de recorte en LLAMADAS es de al menos 2×", () => {
    const factor = ANTES.llamadas / DESPUES.llamadas;
    expect(factor, `${ANTES.llamadas} → ${DESPUES.llamadas} llamadas`).toBeGreaterThanOrEqual(2);
  });

  it("los tokens estimados se calculan con la MISMA regla en los dos lados", () => {
    expect(tokens(ANTES.caracteresPrompt)).toBe(Math.round(ANTES.caracteresPrompt / 4));
    expect(tokens(DESPUES.caracteresPrompt)).toBe(Math.round(DESPUES.caracteresPrompt / 4));
    expect(CARACTERES_POR_TOKEN).toBe(4);
  });

  it("es REPRODUCIBLE: medir dos veces da exactamente lo mismo", () => {
    expect(medirDespues(DOC)).toEqual(DESPUES);
    expect(medirAntes(DOC)).toEqual(ANTES);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL AHORRO NO PUEDE VENIR DE PERDER TEXTO
// ════════════════════════════════════════════════════════════════════════════
describe("★ el recorte NO sale de tirar datos", () => {
  it("★★ SUMA EXACTA · cada carácter del documento está en un cubo y solo en uno", () => {
    const { dirigido, difuso, contexto } = REPARTO.totales;
    expect(dirigido + difuso + contexto).toBe(DOC.length);
    expect(conserva(DOC, REPARTO)).toBe(true);
  });

  it("★★ todo lo que NO es contexto llega de verdad a algún extractor", () => {
    // No basta con que el reparto lo diga: se comprueba contra el texto que
    // `textoPara` devuelve de verdad, que es lo que se manda.
    const corpus = EXTRACTORES_5.map((e) => textoPara(DOC, REPARTO, e)).join("\n");
    for (const s of REPARTO.secciones) {
      if (s.cubo === "contexto") continue;
      const cuerpo = DOC.slice(s.inicio, s.fin).trim();
      if (!cuerpo) continue;
      // se comprueba con la primera línea sustantiva de la sección
      const marca = cuerpo.split("\n").find((l) => l.trim().length > 12)?.trim();
      if (marca) expect(corpus.includes(marca), `«${s.titulo}» no llegó a ningún extractor`).toBe(true);
    }
  });

  it("★★ lo tratado como contexto está CONTADO y NOMBRADO, no desaparecido", () => {
    expect(REPARTO.contexto.reduce((n, c) => n + c.caracteres, 0)).toBe(REPARTO.totales.contexto);
    for (const c of REPARTO.contexto) expect(c.titulo.trim()).not.toBe("");
  });

  it("★★ forzarCompleto recupera EXACTAMENTE el coste (y la cobertura) de antes", () => {
    // La vía de escape tiene que devolver el comportamiento viejo bit a bit: si
    // costara menos, es que estaría leyendo menos, y entonces no sería una vía
    // de escape sino otra optimización disfrazada.
    const full = medirDespues(DOC, true);
    expect(full.llamadas).toBe(ANTES.llamadas);
    expect(full.caracteresPrompt).toBe(ANTES.caracteresPrompt);
    expect(full.caracteresTexto).toBe(ANTES.caracteresTexto);
  });

  it("un texto pegado sin encabezados cuesta lo MISMO que antes (no se optimiza a ciegas)", () => {
    const pegado =
      "Soy ingeniero civil en computación, titulado en la UNAB en 2019. Trabajé en Altiplano " +
      "Pagos como backend developer a cargo de conciliación, en Go. Sé Go, Python y SQL.";
    const a = medirAntes(pegado);
    const d = medirDespues(pegado);
    expect(d.llamadas).toBe(a.llamadas);
    expect(d.caracteresPrompt).toBe(a.caracteresPrompt);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL CONTADOR DE CONSUMO (lo que hoy no se leía en ninguna llamada)
// ════════════════════════════════════════════════════════════════════════════
describe("telemetría · el `usage` del proveedor deja de ignorarse", () => {
  it("acumula llamadas, tokens y caracteres de prompt", () => {
    const c = consumoCero();
    anotarLlamada(c, 1000, { inputTokens: 250, outputTokens: 40 });
    anotarLlamada(c, 500, { inputTokens: 125, outputTokens: 20 });
    expect(c.llamadas).toBe(2);
    expect(c.tokensEntrada).toBe(375);
    expect(c.tokensSalida).toBe(60);
    expect(c.caracteresPrompt).toBe(1500);
    expect(c.llamadasSinUso).toBe(0);
  });

  it("★ si el proveedor NO reporta usage, se CUENTA la ausencia (el total es un suelo)", () => {
    // Sumar cero y presentarlo como total sería inventarse un número. El
    // contador de ausencias es lo que permite a la UI decir «≥» en vez de mentir.
    const c = consumoCero();
    anotarLlamada(c, 1000, { inputTokens: 250, outputTokens: 40 });
    anotarLlamada(c, 800, undefined);
    anotarLlamada(c, 800, {});
    expect(c.llamadas).toBe(3);
    expect(c.tokensEntrada).toBe(250);
    expect(c.llamadasSinUso).toBe(2);
    // los caracteres de prompt SÍ son exactos siempre: los contamos nosotros
    expect(c.caracteresPrompt).toBe(2600);
  });

  it("un usage corrupto (NaN, null) no envenena el total", () => {
    const c = consumoCero();
    anotarLlamada(c, 100, { inputTokens: NaN, outputTokens: undefined });
    expect(c.tokensEntrada).toBe(0);
    expect(c.llamadasSinUso).toBe(1);
    expect(Number.isFinite(c.tokensEntrada)).toBe(true);
  });
});
