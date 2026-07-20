/**
 * ════════════════════════════════════════════════════════════════════════════
 * SEGMENTAR — cortar el documento por encabezados y decidir QUÉ EXTRACTOR lee QUÉ.
 *
 * EL PROBLEMA QUE RESUELVE (medido, no estimado):
 * `extractWindow` interpolaba el texto COMPLETO de cada ventana en las CINCO
 * llamadas de extracción. Lo único distinto entre ellas eran ~30 caracteres de
 * sufijo y el schema. Sobre el dossier real (103.744 caracteres) eso daba
 * 20 llamadas y 563.720 caracteres de prompt: el mismo texto pagado cinco veces.
 * La sección «EDUCACIÓN» se le mandaba íntegra al extractor de proyectos, que no
 * puede sacar nada de ella. Es gasto puro.
 *
 * LO QUE HACE:
 * 1. Corta el texto por encabezados (markdown `#…` y líneas en MAYÚSCULAS, que es
 *    como salen los CV pegados en texto plano).
 * 2. Enruta cada sección a un SUBCONJUNTO de los cinco extractores mirando su
 *    TÍTULO, por palabras clave con FRONTERA DE PALABRA, en español e inglés.
 * 3. Devuelve el reparto COMPLETO y auditable: sección a sección, con su título,
 *    sus caracteres, su destino y POR QUÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ★ POR QUÉ ESTE FICHERO ES PELIGROSO Y CÓMO SE DEFIENDE ★
 *
 * En la ronda 7 este producto tenía un `rawText.slice(0, 30000)` que tiraba el
 * 72% de un dossier EN SILENCIO. Fue el peor fallo de su historia. Un enrutador
 * es exactamente la misma clase de máquina: decide qué texto NO se lee. Si se
 * equivoca, el usuario pierde un trabajo o un proyecto y jamás se entera.
 *
 * Cuatro defensas, y ninguna es opcional:
 *
 *   D1 · CONSERVACIÓN EXACTA. Las secciones son tramos [inicio, fin) del texto
 *        ORIGINAL y son contiguas: `secciones.map(s => texto.slice(...)).join("")`
 *        devuelve el documento carácter por carácter. La suma de sus longitudes
 *        es EXACTAMENTE `texto.length`. Ni un carácter puede evaporarse en el
 *        reparto. Lo exige `tests/segmentar.test.ts` y es la invariante madre.
 *
 *   D2 · ANTE LA DUDA, SE PAGA. Un título que no dispara ninguna clave NO se
 *        adivina: va a los cinco extractores (cubo «difuso»). Quitar una clave
 *        ambigua del diccionario es SIEMPRE seguro (cae al fallback y cuesta
 *        más); añadir una clave ambigua es lo que pierde datos. Por eso el
 *        diccionario es corto y explícito, y `titulo` NO está en educación:
 *        «más allá del título» no habla de un grado académico.
 *
 *   D3 · FRONTERA DE PALABRA DE VERDAD. El primer intento de este enrutador
 *        mandaba «Destacados» a educación porque la subcadena contiene «acad»
 *        (des-t-ACAD-os). Eso manda los seis proyectos del portfolio al extractor
 *        equivocado y el usuario los PIERDE. Aquí se comparan TOKENS, no
 *        subcadenas: un stem solo casa si el token EMPIEZA por él.
 *
 *   D4 · EL CUBO «CONTEXTO» NUNCA SE CALLA. Las secciones que no producen items
 *        de CV (relato del cuestionario: «Tu historia», «Preguntas incómodas»…)
 *        no se mandan al modelo, pero quedan REGISTRADAS, CONTADAS y NOMBRADAS
 *        en el reparto para que la ingesta se las enseñe al usuario por su
 *        nombre. Y `repartir(texto, { forzarCompleto: true })` las devuelve todas
 *        a los cinco: siempre existe la forma de volver a pagarlo todo.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Los cinco extractores. Se conservan los cinco schemas: existen por el límite de
 *  24 parámetros opcionales de los structured outputs, y ese motivo sigue en pie. */
export type Extractor5 = "basics" | "work" | "education" | "skills" | "projects";
export const EXTRACTORES_5: readonly Extractor5[] = ["basics", "work", "education", "skills", "projects"];

/** Los tres cubos del reparto. `contexto` es el único que NO va al modelo. */
export type Cubo = "dirigido" | "difuso" | "contexto";

/** Motivo del enrutado. Código estable (la UI le pone texto en ES y EN). */
export type MotivoReparto =
  | "sin-encabezados"     // el documento no tiene títulos: entero al fallback
  | "titulo-clave"        // el título dijo a qué extractor pertenece
  | "heredado"            // subsección sin claves: hereda del encabezado padre
  | "contexto-narrativo"  // relato/cuestionario: no produce items de CV
  | "sin-clave"           // título sin señal: al fallback de los cinco
  | "forzado";            // forzarCompleto: todo a los cinco, sin excepción

export interface Seccion {
  /** posición en el documento, 0-based */
  indice: number;
  /** el encabezado tal cual (sin las almohadillas). "" si es preámbulo. */
  titulo: string;
  /** 1..6 para markdown; 1 para líneas en MAYÚSCULAS; 0 para el preámbulo. */
  nivel: number;
  /** offset de inicio en el texto ORIGINAL (incluye la línea del encabezado) */
  inicio: number;
  /** offset de fin, exclusivo */
  fin: number;
  /** fin - inicio. La suma de todas es exactamente texto.length (D1). */
  caracteres: number;
  cubo: Cubo;
  /** a qué extractores va este tramo. Vacío ⟺ cubo === "contexto". */
  destinos: Extractor5[];
  motivo: MotivoReparto;
  /** las claves que dispararon el enrutado (auditable: por qué fue ahí) */
  claves: string[];
}

export interface Reparto {
  secciones: Seccion[];
  /** longitud del documento. Igual a la suma de `caracteres` de las secciones. */
  longitud: number;
  /** caracteres por cubo. dirigido + difuso + contexto === longitud. */
  totales: Record<Cubo, number>;
  /** caracteres que acabará leyendo CADA extractor (el difuso suma en los cinco) */
  porExtractor: Record<Extractor5, number>;
  /** las secciones tratadas como contexto, CON NOMBRE, para enseñárselas al usuario */
  contexto: { titulo: string; caracteres: number }[];
  /** true si se pidió forzarCompleto (todo a los cinco) */
  forzado: boolean;
}

export interface OpcionesReparto {
  /** Vuelve a mandarlo TODO a los cinco extractores. La vía de escape (D4). */
  forzarCompleto?: boolean;
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · CORTE POR ENCABEZADOS
   ══════════════════════════════════════════════════════════════════════════ */

/** `## 4.1 Founder & AI Engineer` → nivel 2, título "4.1 Founder & AI Engineer". */
const RE_MD = /^(#{1,6})\s+(\S.*)$/;

/**
 * ¿Es una línea de encabezado en MAYÚSCULAS? (`EXPERIENCIA PROFESIONAL`)
 * Así salen la mayoría de los CV pegados como texto plano, que no traen markdown.
 *
 * Condiciones deliberadamente estrictas — un falso positivo aquí parte una
 * sección en dos, y el trozo huérfano pierde el enrutado de su padre. Aun así el
 * daño está acotado: un huérfano sin claves cae al fallback de los cinco (D2),
 * o sea que un fallo aquí CUESTA dinero pero no pierde datos.
 */
function esEncabezadoMayusculas(linea: string): boolean {
  const t = linea.trim();
  if (t.length < 3 || t.length > 64) return false;
  // Las viñetas y las listas nunca son encabezados, por mucho que griten.
  if (/^[-*•·>|]/.test(t)) return false;
  // Una frase terminada en punto es una frase, no un título.
  if (/[.;:,]$/.test(t)) return false;
  const letras = t.match(/\p{L}/gu);
  if (!letras || letras.length < 3) return false;
  // Toda letra con caja debe estar en MAYÚSCULA (ñ, á y ç incluidas: \p{Lu}).
  for (const c of letras) if (c.toLowerCase() !== c.toUpperCase() && c !== c.toUpperCase()) return false;
  // Al menos una palabra de 3+ letras: descarta siglas sueltas tipo "API" o "SQL"
  // que aparecen como valor en una línea, no como título.
  return /\p{Lu}{3,}/u.test(t);
}

interface Corte {
  inicio: number;   // offset del PRIMER carácter de la línea del encabezado
  titulo: string;
  nivel: number;
}

/**
 * Localiza los encabezados con sus OFFSETS reales en el texto original.
 * Trabaja con offsets (no con `split`+`join`) precisamente para que la
 * reconstrucción sea exacta y D1 no dependa de adivinar cuántos `\n` había.
 */
function localizarEncabezados(texto: string): Corte[] {
  const cortes: Corte[] = [];
  // Se recorre línea a línea conservando el offset acumulado, incluidos los
  // separadores (\r\n o \n), que se cuentan al avanzar. Nunca se hace
  // `split`+`join`: la reconstrucción exacta (D1) no puede depender de adivinar
  // cuántos saltos había ni de qué tipo eran.
  const re = /\r?\n/g;
  let desde = 0;
  let m: RegExpExecArray | null;
  const empujar = (linea: string, inicio: number) => {
    const md = RE_MD.exec(linea);
    if (md) {
      cortes.push({ inicio, titulo: md[2]!.trim(), nivel: md[1]!.length });
      return;
    }
    if (esEncabezadoMayusculas(linea)) {
      cortes.push({ inicio, titulo: linea.trim(), nivel: 1 });
    }
  };
  while ((m = re.exec(texto)) !== null) {
    empujar(texto.slice(desde, m.index), desde);
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) empujar(texto.slice(desde), desde);
  return cortes;
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · NORMALIZACIÓN Y FRONTERA DE PALABRA (D3)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Título → tokens comparables: sin acentos, sin caja, sin puntuación.
 * Devuelve la lista de tokens; comparar TOKENS es lo que da la frontera de
 * palabra real y lo que impide que «Destacados» case con «acad» (D3).
 */
export function tokensDeTitulo(titulo: string): string[] {
  return titulo
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")       // fuera los diacríticos combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")   // números incluidos: «BLOQUE 4» conserva el 4
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * ¿Alguno de los tokens casa con la clave?
 *   · "experien*" → el token debe EMPEZAR por "experien"  (stem)
 *   · "stack"     → el token debe ser EXACTAMENTE "stack" (palabra completa)
 *   · "open source" → dos tokens consecutivos, en orden   (frase)
 * En los tres casos el inicio está anclado a un límite de token: nunca casa a
 * mitad de palabra, que es el fallo que mandaba proyectos a educación.
 */
function casa(tokens: string[], clave: string): boolean {
  if (clave.includes(" ")) {
    const partes = clave.split(" ");
    for (let i = 0; i + partes.length <= tokens.length; i++) {
      if (partes.every((p, j) => coincideToken(tokens[i + j]!, p))) return true;
    }
    return false;
  }
  return tokens.some((t) => coincideToken(t, clave));
}

function coincideToken(token: string, clave: string): boolean {
  return clave.endsWith("*") ? token.startsWith(clave.slice(0, -1)) : token === clave;
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · EL DICCIONARIO
   ──────────────────────────────────────────────────────────────────────────
   Corto a propósito. Cada clave que se añade es una apuesta: si acierta, ahorra;
   si falla, MANDA DATOS AL EXTRACTOR EQUIVOCADO Y SE PIERDEN. Una clave que
   falta solo cuesta dinero (cae al fallback de los cinco). La asimetría es
   brutal, así que el criterio es: en la duda, NO se añade.

   Ausencias deliberadas, para que nadie las "arregle" luego sin pensarlo:
     · `titulo`  — «más allá del título», «Proyecto de título» no son un grado.
     · `destacad*` — no significa nada por sí solo; el trap original.
     · `publicacion*` — puede ser un paper (investigación) o un post. Difuso.
     · `logro*` / `resultado*` → SÍ van a work: en un CV un logro cuelga de un rol.
   ══════════════════════════════════════════════════════════════════════════ */

export const DICCIONARIO: Readonly<Record<Extractor5, readonly string[]>> = {
  basics: [
    // `identidad` NO está: casaba con «ANEXO A — CUESTIONARIO DE IDENTIDAD
    // PROFESIONAL», que es un cuestionario entero de 60 KB, no un bloque de
    // contacto — y por herencia arrastraba trece secciones a basics. Un título
    // que solo diga «Identidad» cae al difuso, que es la respuesta segura.
    "contacto", "contactos", "contact", "datos personales",
    "personal details", "titular", "headline", "perfil", "profile",
    "resumen", "resumenes", "summary", "about me", "acerca de mi", "sobre mi",
    "presentacion", "objetivo profesional", "professional summary",
  ],
  work: [
    "experien*",              // experiencia / experiencias / experience
    "laboral", "laborales", "empleo", "empleos", "employment",
    "trayectoria", "career", "historial profesional",
    "work history", "work experience",
    "cargo", "cargos", "puesto", "puestos", "position", "positions",
    "practica", "practicas", "internship", "internships", "pasantia", "pasantias",
    "logro*",                 // logros con números: viñetas de un rol
    "achievement*", "responsabilidad*", "responsibilit*",
  ],
  education: [
    "educacion", "education", "formacion", "academic*",  // academico/a/os/as
    "estudios", "studies", "universidad", "university",
    "licenciatura", "grado academico", "degree", "degrees",
    "magister", "master", "doctorado", "phd", "postgrado", "posgrado",
    "certificacion*", "certification*", "certificado*", "certificate*",
    "curso*", "course*", "diplomado*", "bootcamp",
  ],
  skills: [
    "habilidad*", "skill*", "aptitud*", "competencia*", "competenc*",
    "tecnologia*", "technolog*", "stack", "herramienta*", "tool*",
    "idioma*", "language*", "lenguaje*",
    "conocimiento*", "expertise", "technical skills", "tecnicas",
  ],
  projects: [
    "proyecto*", "project*", "portfolio", "portafolio",
    "repositorio*", "repositor*", "repos", "github", "open source",
    "investigacion", "research", "linea de investigacion",
  ],
};

/**
 * Secciones de RELATO que no producen items de CV. Es el cubo que más ahorra y
 * el único que puede hacer daño, así que la lista es CERRADA y literal: son
 * títulos del cuestionario de identidad y encabezados de instrucciones, no una
 * heurística. Nada que se parezca «un poco» entra aquí.
 *
 * Y una regla que manda sobre esta lista: si el título casa ADEMÁS con cualquier
 * clave de los cinco extractores, GANA EL EXTRACTOR (ver `clasificarTitulo`).
 * «BLOQUE 3 — Experiencia real» es relato y es experiencia: se extrae.
 */
export const CLAVES_CONTEXTO: readonly string[] = [
  "tu historia", "your story", "historia personal",
  "vision y futuro", "vision and future",
  "que buscas", "que busca", "what you are looking for", "what you want",
  "pregunta*",                       // «Preguntas incómodas (pero muy útiles)»
  "fuera de la computacion", "outside of tech", "hobbies", "hobby",
  "intereses personales", "personal interests", "tiempo libre",
  "prueba* social*", "social proof",
  // ⚠ «a confirmar» / «puntos a confirmar» ESTUVIERON aquí y se quitaron tras
  //   mirar el documento real: «BLOQUE 0 — Datos a confirmar» contiene el nombre
  //   público, la ubicación, la disponibilidad y el correo del usuario, y
  //   «15 · PUNTOS A CONFIRMAR» contiene su TELÉFONO. Una sección sobre «cosas
  //   por confirmar» es justo donde viven los hechos en disputa: es el último
  //   sitio del que se puede prescindir. Van al difuso y se pagan.
  "como usar este documento", "how to use this document",
  "instrucciones", "instructions", "nota del autor", "disclaimer",
  "contexto que humaniza",
];

/* ══════════════════════════════════════════════════════════════════════════
   4 · CLASIFICACIÓN DE UN TÍTULO
   ══════════════════════════════════════════════════════════════════════════ */

export interface Clasificacion {
  destinos: Extractor5[];
  claves: string[];
  esContexto: boolean;
}

/**
 * Mira SOLO el título. Devuelve a qué extractores va y por qué.
 * Orden de decisión (el orden ES la política de seguridad):
 *   1. ¿casa con algún extractor? → va ahí. Aunque también suene a relato.
 *   2. ¿casa con el relato del cuestionario? → contexto.
 *   3. nada → sin destinos y sin contexto: que decida el llamador (difuso).
 */
export function clasificarTitulo(titulo: string): Clasificacion {
  const tokens = tokensDeTitulo(titulo);
  const destinos: Extractor5[] = [];
  const claves: string[] = [];

  for (const ex of EXTRACTORES_5) {
    for (const clave of DICCIONARIO[ex]) {
      if (casa(tokens, clave)) {
        if (!destinos.includes(ex)) destinos.push(ex);
        claves.push(`${ex}:${clave}`);
      }
    }
  }
  if (destinos.length) return { destinos, claves, esContexto: false };

  const ctx = CLAVES_CONTEXTO.filter((c) => casa(tokens, c));
  if (ctx.length) return { destinos: [], claves: ctx.map((c) => `contexto:${c}`), esContexto: true };

  return { destinos: [], claves: [], esContexto: false };
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · EL REPARTO
   ══════════════════════════════════════════════════════════════════════════ */

const TODOS = (): Extractor5[] => [...EXTRACTORES_5];

/**
 * Corta el documento y reparte cada tramo entre los cinco extractores.
 * PURO: sin red, sin LLM, sin reloj. Determinista y testeable a mano.
 */
export function repartir(texto: string, opts: OpcionesReparto = {}): Reparto {
  const forzado = !!opts.forzarCompleto;
  const longitud = texto.length;

  const vacio = (): Reparto => ({
    secciones: [],
    longitud,
    totales: { dirigido: 0, difuso: 0, contexto: 0 },
    porExtractor: { basics: 0, work: 0, education: 0, skills: 0, projects: 0 },
    contexto: [],
    forzado,
  });
  if (longitud === 0) return vacio();

  const cortes = localizarEncabezados(texto);

  /* ── El caso COMÚN: texto pegado suelto, sin un solo encabezado ──────────────
     Un párrafo pegado a mano no tiene títulos y NO puede romperse por esto: cae
     ENTERO al fallback de los cinco, exactamente como funcionaba antes. Cero
     ahorro y cero riesgo — que es la respuesta correcta cuando no hay señal.

     Solo aplica cuando NO hay ni un encabezado. Hubo aquí una condición extra
     («un único encabezado y menos de 400 caracteres → difuso») y se quitó: hacía
     que `# EDUCACIÓN\n…` se mandara a los cinco extractores por ser corto, un
     comportamiento que nadie podía predecir leyendo el título. Si hay
     encabezado, se usa; si no lo hay, al fallback. Sin terceras vías. */
  if (cortes.length === 0) {
    return armar(
      [{
        indice: 0, titulo: "", nivel: 0,
        inicio: 0, fin: longitud, caracteres: longitud,
        cubo: "difuso", destinos: TODOS(), motivo: "sin-encabezados", claves: [],
      }],
      longitud,
      forzado,
    );
  }

  // Tramos contiguos [inicio, fin). El preámbulo (texto antes del primer
  // encabezado) es una sección más: si no fuese así, se perdería.
  const bordes: Corte[] = cortes[0]!.inicio > 0
    ? [{ inicio: 0, titulo: "", nivel: 0 }, ...cortes]
    : cortes;

  const secciones: Seccion[] = [];
  // Pila de ancestros para la herencia: [nivel, destinos] del encabezado padre.
  const ancestros: { nivel: number; destinos: Extractor5[] }[] = [];

  for (let i = 0; i < bordes.length; i++) {
    const b = bordes[i]!;
    const inicio = b.inicio;
    const fin = i + 1 < bordes.length ? bordes[i + 1]!.inicio : longitud;

    // Se desapilan los ancestros de nivel igual o más profundo: ya no aplican.
    while (ancestros.length && ancestros[ancestros.length - 1]!.nivel >= b.nivel) ancestros.pop();

    let cubo: Cubo;
    let destinos: Extractor5[];
    let motivo: MotivoReparto;
    let claves: string[];

    if (forzado) {
      cubo = "difuso"; destinos = TODOS(); motivo = "forzado"; claves = [];
    } else {
      const c = clasificarTitulo(b.titulo);
      const heredado = ancestros.length ? ancestros[ancestros.length - 1]!.destinos : [];

      if (c.destinos.length || heredado.length) {
        /* ── La herencia SUMA, no sustituye ─────────────────────────────────
           Este es el bug que casi cuesta un empleo. «4.2 AI/ML Engineer —
           Proyecto de título (AeroFit)» cuelga de «4 · EXPERIENCIA PROFESIONAL»
           pero su propio título dice «Proyecto». Con la herencia como FALLBACK,
           la clave propia ganaba y la sección se mandaba SOLO a proyectos: el
           empleo desaparecía del CV sin que nadie lo notara. Un encabezado hijo
           MATIZA a su padre, no lo contradice — así que va a los destinos de los
           dos. Cuesta una llamada más y no pierde el rol.                     */
        const union = [...heredado];
        for (const d of c.destinos) if (!union.includes(d)) union.push(d);
        cubo = "dirigido";
        destinos = EXTRACTORES_5.filter((e) => union.includes(e)); // orden estable
        motivo = c.destinos.length ? "titulo-clave" : "heredado";
        claves = c.claves;
      } else if (c.esContexto) {
        // El contexto solo se aplica si NO hay herencia dirigida: una subsección
        // narrativa colgada de «EXPERIENCIA» sigue siendo experiencia.
        cubo = "contexto"; destinos = []; motivo = "contexto-narrativo"; claves = c.claves;
      } else {
        cubo = "difuso"; destinos = TODOS(); motivo = "sin-clave"; claves = [];
      }
    }

    secciones.push({
      indice: secciones.length, titulo: b.titulo, nivel: b.nivel,
      inicio, fin, caracteres: fin - inicio, cubo, destinos, motivo, claves,
    });

    // Solo un encabezado DIRIGIDO se convierte en ancestro heredable. Un padre
    // difuso o de contexto deja a sus hijos decidir solos (y si no saben, al
    // difuso): heredar «no sé» no es información.
    if (b.nivel > 0) {
      ancestros.push({ nivel: b.nivel, destinos: cubo === "dirigido" ? destinos : [] });
    }
  }

  return armar(secciones, longitud, forzado);
}

function armar(secciones: Seccion[], longitud: number, forzado: boolean): Reparto {
  const totales: Record<Cubo, number> = { dirigido: 0, difuso: 0, contexto: 0 };
  const porExtractor: Record<Extractor5, number> = { basics: 0, work: 0, education: 0, skills: 0, projects: 0 };
  const contexto: { titulo: string; caracteres: number }[] = [];

  for (const s of secciones) {
    totales[s.cubo] += s.caracteres;
    for (const d of s.destinos) porExtractor[d] += s.caracteres;
    if (s.cubo === "contexto") contexto.push({ titulo: s.titulo, caracteres: s.caracteres });
  }
  return { secciones, longitud, totales, porExtractor, contexto, forzado };
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · DEL REPARTO AL TEXTO QUE SE MANDA
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El texto que le toca a UN extractor: sus secciones, en el orden del documento,
 * separadas por línea en blanco. Se corta del texto ORIGINAL (no de copias), así
 * que la evidencia literal que devuelva el modelo sigue existiendo tal cual en
 * `raw_text` y la verificación de §4.4 sigue funcionando sin tocar nada.
 */
export function textoPara(texto: string, reparto: Reparto, extractor: Extractor5): string {
  let salida = "";
  let finAnterior = -1;
  for (const s of reparto.secciones) {
    if (!s.destinos.includes(extractor)) continue;
    /* Dos secciones CONTIGUAS se pegan sin separador: el texto queda idéntico al
       original. Importa por dos motivos, y ninguno es estético:
         · `forzarCompleto` tiene que devolver el documento EXACTO. Si metiera
           saltos, la vía de escape costaría más que la lectura antigua y ya no
           sería una comparación honesta (lo cazó tests/coste.test.ts, 395
           caracteres de más).
         · La verificación de evidencia (§4.4) compara literales. Un «\n\n»
           inyectado en medio de un párrafo puede partir la cita que el modelo
           copió y convertir un item bueno en «sin evidencia».
       Solo se separan los tramos que de verdad NO eran vecinos en el original. */
    salida += s.inicio === finAnterior ? texto.slice(s.inicio, s.fin) : (salida ? "\n\n" : "") + texto.slice(s.inicio, s.fin);
    finAnterior = s.fin;
  }
  return salida;
}

/**
 * Comprobación de conservación (D1), disponible en runtime y no solo en el test:
 * concatenar los tramos debe devolver el documento EXACTO. Si esto fuese false
 * alguna vez, hay texto evaporándose y la ingesta debe gritarlo, no seguir.
 */
export function conserva(texto: string, reparto: Reparto): boolean {
  if (reparto.secciones.reduce((n, s) => n + s.caracteres, 0) !== texto.length) return false;
  let cursor = 0;
  for (const s of reparto.secciones) {
    if (s.inicio !== cursor) return false;
    cursor = s.fin;
  }
  return cursor === texto.length;
}
