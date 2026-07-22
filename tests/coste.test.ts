import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { segmentText, promptDeExtraccion, planificarExtraccion, WINDOW_CHARS, WINDOW_OVERLAP } from "../src/lib/extract/llm";
import { repartir, textoPara, conserva, EXTRACTORES_5, type Extractor5, type Fuente } from "../src/lib/extract/segmentar";
import { CARACTERES_POR_TOKEN, consumoCero, anotarLlamada } from "../src/lib/db/telemetria";

/* ============================================================================
   LA MEDICIÓN · cuánto costaba leer un volcado y cuánto cuesta ahora.

   REPRODUCIBLE Y GRATIS: se mide el prompt que SE MANDARÍA, no se llama a
   Gemini. Cuesta cero, es exacto, y corre en CI sin clave.

   MISMA REGLA A LOS DOS LADOS, declarada una vez:
     · 4 caracteres por token (CARACTERES_POR_TOKEN, en telemetria.ts).
     · El prompt se construye con la MISMA función en el antes y en el después
       (`promptDeExtraccion`), porque el código viejo era literalmente
       `BASE + texto + "\n\n(Extrae: " + foco + ")"` — que es lo que esa función
       hace. Así la comparación no depende de que yo transcriba bien el prompt
       antiguo: usa el de verdad.

   DOS DOCUMENTOS, PORQUE EL PROBLEMA MEDIDO EN PRODUCCIÓN ERA EL SEGUNDO:
     A · el dossier real del repo, 103.744 caracteres. 41 secciones escritas por
         un humano; no es un fixture generado.
     B · EL CASO REAL: ese mismo dossier MÁS catorce transcripciones de capturas
         de LinkedIn, concatenadas exactamente como lo hace `runImport`
         (`\n\n[etiqueta]\n…`). Es la ingesta que en producción dio 3,7×, y la
         única forma de ver el fallo: en el amasijo las capturas no abren sección
         propia y heredan el destino de la última sección del dossier.

   ⚠ HONESTIDAD SOBRE EL 3,7×: la cifra de producción (137 KB → 128.471 tokens)
     no se puede reproducir aquí, porque las catorce transcripciones REALES no
     están en el repo (son datos de una cuenta) y porque «tokens» los cuenta el
     proveedor con su tokenizador, no con la regla de 4 caracteres. Lo que sí se
     puede medir es el MECANISMO, con transcripciones simuladas del mismo tamaño
     que las reales (3.479, 2.711, 2.314, 1.349… caracteres). Los factores de
     abajo son los de este fixture, no los de la cuenta de nadie.
   ============================================================================ */

const RUTA = path.join(__dirname, "..", "material-perfil", "dossier", "DOSSIER-MAESTRO-AKHAN.md");
const DOC = fs.readFileSync(RUTA, "utf8");

const tokens = (chars: number) => Math.round(chars / CARACTERES_POR_TOKEN);
const miles = (n: number) => n.toLocaleString("es-CL");

/* ── EL FIXTURE DEL CASO REAL ─────────────────────────────────────────────────
   Catorce transcripciones de captura de LinkedIn. La forma es la que produce
   `transcribeImage` (llm.ts), que PIDE los encabezados de sección en su propia
   línea. Los tamaños imitan los de la base real: de 3.479 a 1.349 caracteres. */
const TAMANOS = [3479, 2711, 2314, 1349, 2890, 2103, 1876, 1512, 2664, 1988, 1731, 2245, 1603, 2410];

function transcripcion(i: number, largo: number): string {
  const roles = [
    ["Founder & AI Engineer", "PharmIQ", "abr. 2024 - actualidad"],
    ["AI/ML Engineer", "Universidad Andrés Bello", "mar. 2023 - dic. 2023"],
    ["Independent Developer", "Open-Source & Simulation", "ene. 2022 - feb. 2023"],
    ["Scrum Master & Technical Team Lead", "Proyecto VR", "jun. 2021 - dic. 2021"],
    ["Software Engineering Intern", "Tesseract Softwares", "ene. 2021 - may. 2021"],
  ];
  const r = roles[i % roles.length]!;
  const cabeza = [
    "Experiencia",
    r[0]!,
    `${r[1]} · Jornada completa`,
    `${r[2]} · 1 año 4 meses`,
    "Santiago, Región Metropolitana de Chile · Híbrido",
    "",
    "Aptitudes",
    "Python · TypeScript · PostgreSQL · Docker",
    "",
    "Educación",
    "Universidad Andrés Bello",
    "Ingeniería Civil en Computación e Informática · 2019 - 2024",
    "",
    "Licencias y certificaciones",
    "Google Cloud Associate Cloud Engineer · Google · sept. 2024",
    "",
    "Idiomas",
    "Español · Competencia bilingüe o nativa",
    "",
    "Experiencia",
    "Detalle del rol:",
  ].join("\n");
  // relleno determinista hasta el tamaño pedido, para que la medición sea exacta
  const linea = `Implementación de servicios y reducción de latencia medida en el rol ${i + 1}. `;
  let out = cabeza;
  while (out.length < largo) out += `\n${linea}`;
  return out.slice(0, largo);
}

/** Concatena como `runImport`: mismo separador, misma etiqueta, mismos tramos. */
function volcadoReal(): { raw: string; fuentes: Fuente[] } {
  let raw = DOC.trim();
  const fuentes: Fuente[] = [{ etiqueta: "texto pegado", inicio: 0, fin: raw.length }];
  TAMANOS.forEach((n, i) => {
    const desde = raw.length;
    const etiqueta = `linkedin-${i + 1}.png`;
    raw += `\n\n[${etiqueta}]\n${transcripcion(i, n)}`;
    fuentes.push({ etiqueta, inicio: desde, fin: raw.length });
  });
  return { raw, fuentes };
}

const VOLCADO = volcadoReal();

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
   aparte. Un extractor con corpus vacío no se llama. Con `fuentes`, además, cada
   documento se reparte con SU estructura antes de juntar los corpus.        */
function medirDespues(doc: string, opts: { forzarCompleto?: boolean; fuentes?: readonly Fuente[] } = {}): Medida {
  // ★ Se mide EL PLAN REAL que ejecuta `makeGeminiExtractor`, no una copia de su
  //   bucle. Si el bucle cambiara y esta medición fuese una réplica, el informe
  //   seguiría diciendo un número bonito mientras el código gasta otro.
  const plan = planificarExtraccion(doc, opts);
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

// El caso real, con y sin la corrección del reparto por fuente.
const VOL_ANTES = medirAntes(VOLCADO.raw);
const VOL_AMASIJO = medirDespues(VOLCADO.raw);                                  // reparto sobre el amasijo
const VOL_POR_FUENTE = medirDespues(VOLCADO.raw, { fuentes: VOLCADO.fuentes }); // documento a documento

/** Cuánto se paga por cada carácter del documento. Es LA cifra del encargo. */
const factor = (m: Medida, doc: string) => m.caracteresPrompt / doc.length;

// ════════════════════════════════════════════════════════════════════════════
// EL INFORME. Se imprime siempre: es el entregable, no un efecto secundario.
// ════════════════════════════════════════════════════════════════════════════
describe("★ MEDICIÓN DEL COSTE · sin llamar a Gemini", () => {
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
    L(`  Tokens de entrada ...... ~${miles(tokens(ANTES.caracteresPrompt))}`);
    L(`  FACTOR (prompt/doc) .... ${factor(ANTES, DOC).toFixed(2)}×`);
    L();
    L("  ─── DESPUÉS · cada extractor lee SOLO lo suyo ────────────────────────");
    L(`  Llamadas ............... ${DESPUES.llamadas}`);
    L(`  Caracteres de prompt ... ${miles(DESPUES.caracteresPrompt)}`);
    L(`  Tokens de entrada ...... ~${miles(tokens(DESPUES.caracteresPrompt))}`);
    L(`  FACTOR (prompt/doc) .... ${factor(DESPUES, DOC).toFixed(2)}×`);
    for (const d of DESPUES.detalle) {
      L(`      · ${d.extractor.padEnd(10)} ${String(d.ventanas)} ventana(s)  ${miles(d.chars).padStart(9)} chars`);
    }
    L();
    L("  ─── EL REPARTO (suma exacta = documento) ─────────────────────────────");
    L(`  Dirigido ............... ${miles(REPARTO.totales.dirigido)}  (${((REPARTO.totales.dirigido / DOC.length) * 100).toFixed(1)}%)`);
    L(`     · de eso, NARRATIVAS  ${miles(REPARTO.narrativas.reduce((a, s) => a + s.caracteres, 0))}  en ${REPARTO.narrativas.length} secciones RESCATADAS → basics`);
    L(`  Difuso (a los cinco) ... ${miles(REPARTO.totales.difuso)}  (${((REPARTO.totales.difuso / DOC.length) * 100).toFixed(1)}%)`);
    L(`  Contexto (no extraído) . ${miles(REPARTO.totales.contexto)}  (${((REPARTO.totales.contexto / DOC.length) * 100).toFixed(1)}%) · ${REPARTO.contexto.length} sección(es) NOMBRADA(S)`);
    L(`  Suma ................... ${miles(REPARTO.totales.dirigido + REPARTO.totales.difuso + REPARTO.totales.contexto)} = ${miles(DOC.length)} ✓`);
    L();
    L("  ─── EL RECORTE ──────────────────────────────────────────────────────");
    L(`  Factor en caracteres/tokens ... ${factorChars.toFixed(2)}×`);
    L(`  Factor en llamadas ............ ${factorLlamadas.toFixed(2)}×  (${ANTES.llamadas} → ${DESPUES.llamadas})`);
    L(`  Tokens ahorrados por ingesta .. ~${miles(tokens(ANTES.caracteresPrompt - DESPUES.caracteresPrompt))}`);
    L();
    L("╔══════════════════════════════════════════════════════════════════════╗");
    L("║  EL CASO REAL · dossier + 14 transcripciones de capturas de LinkedIn ║");
    L("╚══════════════════════════════════════════════════════════════════════╝");
    L(`  Volcado combinado ...... ${miles(VOLCADO.raw.length)} caracteres · ${VOLCADO.fuentes.length} documentos`);
    L(`  Transcripciones ........ ${miles(TAMANOS.reduce((a, b) => a + b, 0))} caracteres en ${TAMANOS.length} capturas`);
    L();
    L("  ┌────────────────────────────┬──────────┬─────────────┬──────────┐");
    L("  │ estrategia                 │ llamadas │ chars prompt│  factor  │");
    L("  ├────────────────────────────┼──────────┼─────────────┼──────────┤");
    const fila = (n: string, m: Medida) =>
      L(`  │ ${n.padEnd(26)} │ ${String(m.llamadas).padStart(8)} │ ${miles(m.caracteresPrompt).padStart(11)} │ ${(factor(m, VOLCADO.raw).toFixed(2) + "×").padStart(8)} │`);
    fila("ronda 7 · todo × 5", VOL_ANTES);
    fila("reparto sobre el amasijo", VOL_AMASIJO);
    fila("★ reparto POR FUENTE", VOL_POR_FUENTE);
    L("  └────────────────────────────┴──────────┴─────────────┴──────────┘");
    L(`  Recorte respecto al amasijo ... ${(VOL_AMASIJO.caracteresPrompt / VOL_POR_FUENTE.caracteresPrompt).toFixed(2)}×`);
    L(`  Recorte respecto a la ronda 7 . ${(VOL_ANTES.caracteresPrompt / VOL_POR_FUENTE.caracteresPrompt).toFixed(2)}×`);
    L();
    L("  DE DÓNDE SALE EL RECORTE (y no es de tirar texto):");
    L("    · En el amasijo, las 14 transcripciones NO abren sección propia: se");
    L("      pegan a la última sección del dossier y heredan su destino. En este");
    L("      fixture esa sección es difusa, así que se pagan CINCO veces. Si");
    L("      hubiera sido «# EDUCACIÓN», se habrían mandado SOLO a formación y la");
    L("      experiencia de LinkedIn habría desaparecido — eso no es coste, es");
    L("      pérdida, y es lo que arregla el reparto por fuente.");
    L("    · Por fuente, cada captura se corta por SUS encabezados de perfil");
    L("      («Experiencia», «Aptitudes»…) y va a UN extractor en vez de a cinco.");
    L();
    L("  LO QUE SUBE EL FACTOR A PROPÓSITO (se paga y se sabe por qué):");
    L(`    1. Las ${REPARTO.narrativas.length} secciones NARRATIVAS ya no se descartan: se leen con`);
    L(`       basics. Son ${miles(REPARTO.narrativas.reduce((a, s) => a + s.caracteres, 0))} caracteres que ANTES no se extraían.`);
    L("    2. El cubo difuso sigue yendo a los CINCO extractores. Es la regla D2:");
    L("       ante la duda se paga. Bajarlo sería adivinar, y adivinar pierde.");
    L("    3. «BLOQUE 0 — Datos a confirmar» y «15 · PUNTOS A CONFIRMAR» no son");
    L("       contexto: contienen el nombre público, el correo y el TELÉFONO.");
    L();
    L("  ─── ¿SE LLEGA AL ≤1,50× DEL ENCARGO? NO. Y esto es lo que falta ─────");
    const narrat = REPARTO.narrativas.reduce((a, s) => a + s.caracteres, 0);
    const difusoX4 = REPARTO.totales.difuso * 4; // lo que cuestan las 4 lecturas de más
    L(`  Factor alcanzado ............... ${factor(VOL_POR_FUENTE, VOLCADO.raw).toFixed(2)}×  (objetivo 1,50×)`);
    L(`  Sin rescatar las narrativas .... ${((VOL_POR_FUENTE.caracteresPrompt - narrat) / VOLCADO.raw.length).toFixed(2)}×  ← pero se volverían a PERDER`);
    L(`  Sin el cubo difuso ×5 .......... ${((VOL_POR_FUENTE.caracteresPrompt - difusoX4) / VOLCADO.raw.length).toFixed(2)}×  ← exigiría ADIVINAR`);
    L(`  El difuso son ${miles(REPARTO.totales.difuso)} caracteres leídos 5 veces = ${miles(REPARTO.totales.difuso * 5)}`);
    L(`  (el ${((REPARTO.totales.difuso * 5 / VOL_POR_FUENTE.caracteresPrompt) * 100).toFixed(0)}% de todo el prompt). Son secciones cuyo título no dice a qué`);
    L("  extractor pertenecen: «BLOQUE 1 — Quién eres», «BLOQUE 0 — Datos a");
    L("  confirmar», «12 · DIFERENCIADORES Y MÉTODO»… Enrutarlas a ojo es la");
    L("  apuesta que en la ronda 7 mandó los seis proyectos del portfolio al");
    L("  extractor de educación. La diferencia entre 1,84× y 1,50× son céntimos;");
    L("  la diferencia entre acertar y adivinar es la carrera de alguien.");
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

  it("★★ el factor de recorte en caracteres es de al menos 2,5×", () => {
    // Umbral deliberadamente por DEBAJO del real: este test protege el recorte,
    // no lo celebra. El número exacto se imprime arriba; si alguien toca el
    // diccionario y lo empeora, esto se cae.
    //
    // ⚠ BAJÓ DE 3× A 2,5× A PROPÓSITO, y el motivo importa: las nueve secciones
    //   narrativas ya no se descartan. Se leen con `basics`, cuestan ~26 KB más
    //   de prompt, y a cambio dejan de perderse el resumen y el objetivo. Un
    //   umbral que solo se puede mantener descartando texto no es un umbral de
    //   eficiencia: es un incentivo a perder datos.
    const f = ANTES.caracteresPrompt / DESPUES.caracteresPrompt;
    expect(f, `factor real: ${f.toFixed(2)}×`).toBeGreaterThan(2.5);
  });

  it("★★ el factor de recorte en LLAMADAS es de al menos 2×", () => {
    const f = ANTES.llamadas / DESPUES.llamadas;
    expect(f, `${ANTES.llamadas} → ${DESPUES.llamadas} llamadas`).toBeGreaterThanOrEqual(2);
  });

  it("los tokens estimados se calculan con la MISMA regla en los dos lados", () => {
    expect(tokens(ANTES.caracteresPrompt)).toBe(Math.round(ANTES.caracteresPrompt / 4));
    expect(tokens(DESPUES.caracteresPrompt)).toBe(Math.round(DESPUES.caracteresPrompt / 4));
    expect(CARACTERES_POR_TOKEN).toBe(4);
  });

  it("es REPRODUCIBLE: medir dos veces da exactamente lo mismo", () => {
    expect(medirDespues(DOC)).toEqual(DESPUES);
    expect(medirAntes(DOC)).toEqual(ANTES);
    expect(medirDespues(VOLCADO.raw, { fuentes: VOLCADO.fuentes })).toEqual(VOL_POR_FUENTE);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ★ EL CASO REAL · lo que de verdad se midió en producción
// ════════════════════════════════════════════════════════════════════════════
describe("★ el volcado real (dossier + 14 capturas) · repartir por fuente", () => {
  it("el fixture imita el caso medido: 14 capturas, del tamaño de las reales", () => {
    expect(VOLCADO.fuentes).toHaveLength(15); // texto pegado + 14 capturas
    expect(TAMANOS).toHaveLength(14);
    expect(Math.max(...TAMANOS)).toBe(3479);
    expect(Math.min(...TAMANOS)).toBe(1349);
    // y los tramos TESELAN el raw: sin eso, el reparto por fuente ni se intenta
    expect(VOLCADO.fuentes[0]!.inicio).toBe(0);
    expect(VOLCADO.fuentes.at(-1)!.fin).toBe(VOLCADO.raw.length);
  });

  it("☠☠ EN EL AMASIJO las 14 capturas caen en UNA sola sección heredada", () => {
    // La demostración del mecanismo: el reparto del texto combinado tiene las
    // MISMAS secciones que el dossier solo. Las capturas no abren ninguna: se
    // pegan a la última sección del dossier y heredan lo que esa diga.
    const amasijo = repartir(VOLCADO.raw);
    expect(amasijo.secciones).toHaveLength(REPARTO.secciones.length);
    const ultima = amasijo.secciones.at(-1)!;
    const capturas = TAMANOS.reduce((a, b) => a + b, 0);
    expect(ultima.caracteres - REPARTO.secciones.at(-1)!.caracteres).toBeGreaterThan(capturas - 1);
  });

  it("★★ POR FUENTE cada captura se corta sola y el documento se conserva ENTERO", () => {
    const plan = planificarExtraccion(VOLCADO.raw, { fuentes: VOLCADO.fuentes });
    expect(conserva(VOLCADO.raw, plan.reparto)).toBe(true);
    expect(plan.reparto.fuentes).toBe(15);
    // muchas más secciones: cada captura aporta las suyas
    expect(plan.reparto.secciones.length).toBeGreaterThan(REPARTO.secciones.length + 14 * 4);
    const t = plan.reparto.totales;
    expect(t.dirigido + t.difuso + t.contexto).toBe(VOLCADO.raw.length);
  });

  it("★★ EL NÚMERO · repartir por fuente cuesta MENOS que repartir el amasijo", () => {
    expect(VOL_POR_FUENTE.caracteresPrompt).toBeLessThan(VOL_AMASIJO.caracteresPrompt);
    const mejora = VOL_AMASIJO.caracteresPrompt / VOL_POR_FUENTE.caracteresPrompt;
    expect(mejora, `mejora real: ${mejora.toFixed(2)}×`).toBeGreaterThan(1.2);
  });

  it("★★ el factor del caso real baja de 2× (objetivo del encargo: 1,5×, NO alcanzado)", () => {
    // Este test declara la verdad incómoda en vez de esconderla: se pasó de 2,88×
    // a 1,84×, y el 1,50× del encargo NO se cumple. Lo que queda por encima es,
    // casi entero, el cubo difuso leído cinco veces — y ese ×5 es la regla D2, no
    // una ineficiencia. El umbral se pone en 2,0× para proteger lo conseguido; si
    // alguien lo empeora, salta aquí.
    const f = factor(VOL_POR_FUENTE, VOLCADO.raw);
    expect(f, `factor real del caso real: ${f.toFixed(2)}×`).toBeLessThan(2.0);
    expect(f, "y sigue por encima del objetivo declarado, que es lo honesto decir").toBeGreaterThan(1.5);
  });

  it("★★ y NO sale de leer menos: cada captura llega a algún extractor", () => {
    const plan = planificarExtraccion(VOLCADO.raw, { fuentes: VOLCADO.fuentes });
    const corpus = EXTRACTORES_5.map((e) => textoPara(VOLCADO.raw, plan.reparto, e)).join("\n");
    for (let i = 0; i < TAMANOS.length; i++) {
      // una marca única por captura: si no está, esa captura no se leyó
      expect(corpus.includes(`medida en el rol ${i + 1}.`), `la captura ${i + 1} no llegó a ningún extractor`).toBe(true);
    }
  });

  it("★ el número de llamadas NO explota al repartir por fuente", () => {
    // Repartir por fuente Y ADEMÁS llamar por fuente daría 5 llamadas por captura
    // (78 medidas). Se reparte por fuente y se llama por CORPUS: las secciones de
    // los 15 documentos que van al mismo extractor se juntan y se ventanean una vez.
    expect(VOL_POR_FUENTE.llamadas).toBeLessThanOrEqual(VOL_AMASIJO.llamadas + 2);
    expect(VOL_POR_FUENTE.llamadas).toBeLessThan(20);
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

  it("★★ lo ÚNICO que ya no se lee son instrucciones: menos del 2% del dossier", () => {
    // La cifra que hace honesta toda la medición. Si esto subiera, el «ahorro»
    // habría vuelto a salir de dejar de leer a alguien.
    expect(REPARTO.totales.contexto / DOC.length).toBeLessThan(0.02);
    expect(REPARTO.contexto.map((c) => c.titulo)).toEqual(["CÓMO USAR ESTE DOCUMENTO"]);
  });

  it("★★ forzarCompleto recupera EXACTAMENTE el coste (y la cobertura) de antes", () => {
    // La vía de escape tiene que devolver el comportamiento viejo bit a bit: si
    // costara menos, es que estaría leyendo menos, y entonces no sería una vía
    // de escape sino otra optimización disfrazada.
    const full = medirDespues(DOC, { forzarCompleto: true });
    expect(full.llamadas).toBe(ANTES.llamadas);
    expect(full.caracteresPrompt).toBe(ANTES.caracteresPrompt);
    expect(full.caracteresTexto).toBe(ANTES.caracteresTexto);
  });

  it("★★ forzarCompleto sigue siendo la vía de escape AUNQUE se pasen tramos", () => {
    const full = medirDespues(VOLCADO.raw, { forzarCompleto: true, fuentes: VOLCADO.fuentes });
    expect(full).toEqual(medirAntes(VOLCADO.raw));
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
