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
 *   D4 · EL CUBO «CONTEXTO» NUNCA SE CALLA, Y AHORA CASI NO EXISTE. Lo único que
 *        se deja de mandar al modelo son INSTRUCCIONES E ÍNDICES: texto sobre el
 *        documento, no sobre la persona. Aun así queda REGISTRADO, CONTADO y
 *        NOMBRADO en el reparto. Y `repartir(texto, { forzarCompleto: true })` lo
 *        devuelve todo a los cinco: siempre existe la forma de volver a pagarlo.
 *
 *   D5 · UNA SECCIÓN DE RELATO NO SE DESCARTA, SE LEE CON OTRO EXTRACTOR. Nueve
 *        secciones del dossier real («13 · QUÉ BUSCA», «14 · CONTEXTO QUE
 *        HUMANIZA», «BLOQUE 2 — Tu historia», «BLOQUE 6 — Visión y futuro»,
 *        «BLOQUE 7 — Qué buscas AHORA», «BLOQUE 9 — Fuera de la computación»,
 *        «BLOQUE 10 — Pruebas sociales», «BLOQUE 12 — Preguntas incómodas»)
 *        acababan en el cubo «contexto» y NO se extraían. Eso es exactamente lo
 *        que da VOZ a un CV: «QUÉ BUSCA» es el rol objetivo y «Tu historia» es la
 *        materia del resumen. Ahora van al extractor `basics`, que es el que sabe
 *        leer prosa y el que produce `summary` y `label`. Cuestan ×1, no ×5, y
 *        dejan de perderse. La única lista que sigue descartando es
 *        `CLAVES_DESCARTABLES`, y es MÍNIMA y LITERAL a propósito.
 *
 *   D6 · CADA FUENTE SE REPARTE CON SU PROPIA ESTRUCTURA (`repartirPorFuente`).
 *        La ingesta concatena todo —dossier + capturas + portfolio— en UN
 *        `raw_text`, y repartir sobre el amasijo tiene dos consecuencias, una cara
 *        y otra GRAVE: una captura sin encabezados propios se pega a la ÚLTIMA
 *        sección del documento anterior y hereda su destino. Si esa sección era
 *        difusa, la captura se paga cinco veces; si era «# EDUCACIÓN», las catorce
 *        capturas de LinkedIn se mandan SOLO al extractor de formación y el
 *        empleo desaparece. Repartiendo documento a documento, la estructura de
 *        uno no puede contaminar al siguiente.
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
  | "narrativa"           // relato: no es una lista de cargos, pero SÍ es resumen y objetivo → basics
  | "instrucciones"       // texto SOBRE el documento (cómo usarlo, índice): lo único que no se lee
  | "sin-clave"           // título sin señal: al fallback de los cinco
  | "forzado";            // forzarCompleto: todo a los cinco, sin excepción

export interface Seccion {
  /** posición en el documento, 0-based */
  indice: number;
  /** el encabezado tal cual (sin las almohadillas). "" si es preámbulo. */
  titulo: string;
  /** 1..6 para markdown; 1 para líneas en MAYÚSCULAS o encabezados de perfil; 0 para el preámbulo. */
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
  /** de qué DOCUMENTO salió el tramo. Solo lo rellena `repartirPorFuente` (D6). */
  fuente?: string;
}

/** Una sección nombrada y contada, para poder enseñársela al usuario. */
export interface SeccionNombrada {
  titulo: string;
  caracteres: number;
}

export interface Reparto {
  secciones: Seccion[];
  /** longitud del documento. Igual a la suma de `caracteres` de las secciones. */
  longitud: number;
  /** caracteres por cubo. dirigido + difuso + contexto === longitud. */
  totales: Record<Cubo, number>;
  /** caracteres que acabará leyendo CADA extractor (el difuso suma en los cinco) */
  porExtractor: Record<Extractor5, number>;
  /** las secciones NO mandadas al modelo (instrucciones/índices), CON NOMBRE */
  contexto: SeccionNombrada[];
  /**
   * Las secciones de RELATO que ANTES se descartaban y ahora se leen con `basics`
   * (D5). Van aparte de `contexto` porque el aviso al usuario es distinto: de
   * estas SÍ salieron items (resumen y objetivo), y hay que decírselo.
   */
  narrativas: SeccionNombrada[];
  /** true si se pidió forzarCompleto (todo a los cinco) */
  forzado: boolean;
  /** cuántos DOCUMENTOS se repartieron por separado. 1 = reparto sobre un texto único. */
  fuentes: number;
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

/* ── ENCABEZADOS DE UN PERFIL TRANSCRITO ──────────────────────────────────────
   Una captura de LinkedIn no trae markdown ni MAYÚSCULAS: trae «Experiencia»,
   «Aptitudes», «Educación» en caja de título, cada uno en su línea. Y no es
   casualidad: `transcribeImage`/`transcribePdf` (llm.ts) le PIDEN literalmente al
   modelo de visión que los transcriba así, «para saber qué es habilidad y qué es
   logro». El sistema los fabrica a propósito y el enrutador no sabía leerlos: las
   catorce capturas del caso real caían enteras al cubo difuso y se pagaban cinco
   veces cada una.

   ⚠ ES UNA HEURÍSTICA PELIGROSA Y VA CON DOS CANDADOS, porque un falso positivo
     aquí no cuesta dinero: MANDA TEXTO A UN SOLO EXTRACTOR. Medido sobre el
     dossier real, la línea 2364 dice exactamente «Experiencia» — es un jirón de
     una tabla a dos columnas dentro de «BLOQUE 12 — Preguntas incómodas», no un
     título. Con el detector suelto, media sección se habría ido a `work`.

     C1 · EL DOCUMENTO TIENE QUE PARECER UN PERFIL: hacen falta DOS encabezados
          de perfil DISTINTOS. Un «Experiencia» suelto en 103 KB de prosa no lo es.
     C2 · Y TIENE QUE SER CORTO (≤ 20.000 caracteres). Una transcripción de
          pantalla ronda 1–4 KB; un dossier, cien veces más.

   Los dos candados solo pueden distinguir de verdad cuando cada documento se
   reparte POR SEPARADO (D6): en el amasijo, el dossier y las capturas son un
   único texto y el gate no tiene nada que separar. Por eso las dos correcciones
   van juntas.

   Ojo: esta lista decide «esta línea ES un encabezado», NO a dónde va. El destino
   lo sigue decidiendo `clasificarTitulo` con el diccionario de siempre — por eso
   se pueden incluir sin miedo nombres como «Destacado» o «Recomendaciones», que
   no casan con ninguna clave y acaban en el difuso.                             */
export const ENCABEZADOS_PERFIL: readonly string[] = [
  "experiencia", "experience",
  "aptitudes", "skills",
  "educacion", "education",
  "acerca de", "about",
  "licencias y certificaciones", "licenses certifications", "licenses and certifications",
  "certificaciones", "certifications",
  "proyectos", "projects",
  "idiomas", "languages",
  "recomendaciones", "recommendations",
  "publicaciones", "publications",
  "cursos", "courses",
  "voluntariado", "volunteering",
  "premios y reconocimientos", "honors and awards", "honors awards",
  "destacado", "featured",
  "intereses", "interests",
  "actividad", "activity",
];
const SET_PERFIL = new Set(ENCABEZADOS_PERFIL);

/** Caracteres máximos para que un documento pueda considerarse un perfil (C2). */
export const MAX_CHARS_PERFIL = 20_000;
/** Encabezados de perfil DISTINTOS que hacen falta para activar el detector (C1). */
export const MIN_ENCABEZADOS_PERFIL = 2;

/**
 * Si la línea es EXACTAMENTE uno de los encabezados de perfil, su clave; si no, null.
 * Exige línea entera: «Experiencia» sí, «Experiencia laboral en Chile» no (esa ya
 * la coge el diccionario por otra vía si toca).
 */
function claveDePerfil(linea: string): string | null {
  const t = linea.trim();
  if (!t || t.length > 48) return null;
  // Viñetas, tablas, citas, markdown y las etiquetas de archivo («[captura.png]»)
  // nunca son encabezados de perfil.
  if (/^[-*•·>|#[(]/.test(t)) return null;
  if (/[.;:,]$/.test(t)) return null;
  const clave = tokensDeTitulo(t).join(" ");
  return SET_PERFIL.has(clave) ? clave : null;
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
  // Se recorre línea a línea conservando el offset acumulado, incluidos los
  // separadores (\r\n o \n), que se cuentan al avanzar. Nunca se hace
  // `split`+`join`: la reconstrucción exacta (D1) no puede depender de adivinar
  // cuántos saltos había ni de qué tipo eran.
  const lineas: { texto: string; inicio: number }[] = [];
  const re = /\r?\n/g;
  let desde = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    lineas.push({ texto: texto.slice(desde, m.index), inicio: desde });
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) lineas.push({ texto: texto.slice(desde), inicio: desde });

  // C1 + C2: ¿este documento parece un perfil transcrito? Se decide ANTES de
  // cortar, mirando el documento entero, no línea a línea.
  const distintos = new Set<string>();
  if (texto.length <= MAX_CHARS_PERFIL) {
    for (const l of lineas) {
      const k = claveDePerfil(l.texto);
      if (k) distintos.add(k);
    }
  }
  const esPerfil = distintos.size >= MIN_ENCABEZADOS_PERFIL;

  const cortes: Corte[] = [];
  for (const l of lineas) {
    const md = RE_MD.exec(l.texto);
    if (md) {
      cortes.push({ inicio: l.inicio, titulo: md[2]!.trim(), nivel: md[1]!.length });
      continue;
    }
    if (esEncabezadoMayusculas(l.texto)) {
      cortes.push({ inicio: l.inicio, titulo: l.texto.trim(), nivel: 1 });
      continue;
    }
    if (esPerfil && claveDePerfil(l.texto)) {
      cortes.push({ inicio: l.inicio, titulo: l.texto.trim(), nivel: 1 });
    }
  }
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
 * ★ LO ÚNICO QUE SE DESCARTA. Texto SOBRE el documento, no sobre la persona:
 * instrucciones de uso e índices. Un lector humano tampoco los leería para
 * escribir un CV, y no contienen ni un hecho de la carrera de nadie.
 *
 * La lista es MÍNIMA y LITERAL, y esa es la regla: ANTE LA DUDA, SE EXTRAE.
 * Descartar cuesta cero y puede borrar una carrera; leer de más cuesta unos
 * céntimos. La asimetría no admite «me suena a relleno».
 *
 * Ausencias deliberadas, para que nadie las «arregle» luego:
 *   · «nota del autor» / «disclaimer» — estuvieron aquí y salieron. Un
 *     disclaimer puede decir «los nombres de cliente están anonimizados», que es
 *     información sobre los hechos. No es un índice. Cae al difuso y se paga.
 *   · «contenidos» / «contents» a secas — «BLOQUE 13 — Contenido para las
 *     secciones nuevas» es material del CV, no una tabla de contenidos.
 *
 * Y una regla que manda sobre esta lista: si el título casa ADEMÁS con cualquier
 * clave de los cinco extractores, GANA EL EXTRACTOR (ver `clasificarTitulo`).
 */
export const CLAVES_DESCARTABLES: readonly string[] = [
  "como usar este documento", "how to use this document", "how to use",
  "instrucciones", "instructions", "instrucciones de uso",
  "indice", "index", "tabla de contenidos", "table of contents",
];

/**
 * ★ SECCIONES DE RELATO. NO producen una lista de cargos ni de títulos… pero son
 * exactamente la materia del RESUMEN y del OBJETIVO PROFESIONAL. Se enrutan a
 * `basics`, que es el extractor que sabe leer prosa (produce `summary` y `label`).
 *
 * ANTES ESTABAN JUNTO A LAS DESCARTABLES Y SE PERDÍAN. En el dossier real eso
 * eran 26.498 caracteres: «QUÉ BUSCA» (el rol objetivo), «CONTEXTO QUE HUMANIZA»,
 * «Tu historia», «Visión y futuro», «Qué buscas AHORA», «Fuera de la
 * computación», «Pruebas sociales» y «Preguntas incómodas». Se perdía justo lo
 * que distingue un CV de una tabla de fechas.
 *
 * ⚠ Una sección narrativa NO se convierte en ancestro heredable: sus hijas
 *   deciden solas y, si no saben, caen al difuso. Heredar «esto es prosa» le
 *   quitaría a un cargo escondido bajo «Tu historia» sus otros cuatro extractores.
 *
 * ⚠ «a confirmar» / «puntos a confirmar» NO están aquí ni entre las descartables,
 *   y se quitaron tras mirar el documento real: «BLOQUE 0 — Datos a confirmar»
 *   contiene el nombre público, la ubicación, la disponibilidad y el correo, y
 *   «15 · PUNTOS A CONFIRMAR» contiene el TELÉFONO. Una sección sobre «cosas por
 *   confirmar» es justo donde viven los hechos en disputa. Van al difuso.
 */
export const CLAVES_NARRATIVAS: readonly string[] = [
  "tu historia", "your story", "historia personal",
  "vision y futuro", "vision and future",
  "que buscas", "que busca", "what you are looking for", "what you want",
  "pregunta*",                       // «Preguntas incómodas (pero muy útiles)»
  "fuera de la computacion", "outside of tech", "hobbies", "hobby",
  "intereses personales", "personal interests", "tiempo libre",
  "prueba* social*", "social proof",
  "contexto que humaniza",
];

/* ══════════════════════════════════════════════════════════════════════════
   4 · CLASIFICACIÓN DE UN TÍTULO
   ══════════════════════════════════════════════════════════════════════════ */

/** Qué clase de sección es, mirando solo el título. */
export type TipoTitulo =
  | "extractor"     // casó con el diccionario: va a esos extractores
  | "narrativa"     // relato: va a `basics` (resumen y objetivo)
  | "descartable"   // instrucciones o índice: no se manda al modelo
  | "nada";         // sin señal: lo decide el llamador (difuso)

export interface Clasificacion {
  destinos: Extractor5[];
  claves: string[];
  tipo: TipoTitulo;
}

/**
 * Mira SOLO el título. Devuelve a qué extractores va y por qué.
 * Orden de decisión (el orden ES la política de seguridad):
 *   1. ¿casa con algún extractor? → va ahí. Aunque también suene a relato.
 *   2. ¿es instrucciones/índice? → descartable. Es la única salida sin extractor.
 *   3. ¿es relato? → narrativa: a `basics`, que sabe leer prosa.
 *   4. nada → sin destinos: que decida el llamador (difuso, a los cinco).
 *
 * El paso 2 va ANTES del 3 porque es el más específico y el más literal: las dos
 * listas no se solapan hoy, y si algún día lo hicieran, «cómo usar este
 * documento» debe seguir siendo instrucciones y no relato.
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
  if (destinos.length) return { destinos, claves, tipo: "extractor" };

  const fuera = CLAVES_DESCARTABLES.filter((c) => casa(tokens, c));
  if (fuera.length) return { destinos: [], claves: fuera.map((c) => `descartable:${c}`), tipo: "descartable" };

  const relato = CLAVES_NARRATIVAS.filter((c) => casa(tokens, c));
  // El destino NO es un descarte disfrazado: es `basics`, y de ahí salen el
  // resumen y el objetivo profesional del CV.
  if (relato.length) return { destinos: ["basics"], claves: relato.map((c) => `narrativa:${c}`), tipo: "narrativa" };

  return { destinos: [], claves: [], tipo: "nada" };
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

  if (longitud === 0) return armar([], 0, forzado);

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
      /* Solo un título que casó con el DICCIONARIO aporta destinos propios a la
         herencia. Una NARRATIVA no matiza a su padre: «Tu historia en la empresa»
         colgado de «EXPERIENCIA» es experiencia, y añadirle `basics` sería pagar
         una segunda lectura por una corazonada sobre la prosa. Si hay padre
         dirigido, manda el padre; si no lo hay, se cae al caso `narrativa`.     */
      const propios = c.tipo === "extractor" ? c.destinos : [];

      if (propios.length || heredado.length) {
        /* ── La herencia SUMA, no sustituye ─────────────────────────────────
           Este es el bug que casi cuesta un empleo. «4.2 AI/ML Engineer —
           Proyecto de título (AeroFit)» cuelga de «4 · EXPERIENCIA PROFESIONAL»
           pero su propio título dice «Proyecto». Con la herencia como FALLBACK,
           la clave propia ganaba y la sección se mandaba SOLO a proyectos: el
           empleo desaparecía del CV sin que nadie lo notara. Un encabezado hijo
           MATIZA a su padre, no lo contradice — así que va a los destinos de los
           dos. Cuesta una llamada más y no pierde el rol.                     */
        const union = [...heredado];
        for (const d of propios) if (!union.includes(d)) union.push(d);
        cubo = "dirigido";
        destinos = EXTRACTORES_5.filter((e) => union.includes(e)); // orden estable
        motivo = propios.length ? "titulo-clave" : "heredado";
        claves = propios.length ? c.claves : [];
      } else if (c.tipo === "descartable") {
        // Lo ÚNICO que no se manda al modelo, y solo si NO hay herencia dirigida:
        // una subsección colgada de «EXPERIENCIA» sigue siendo experiencia.
        cubo = "contexto"; destinos = []; motivo = "instrucciones"; claves = c.claves;
      } else if (c.tipo === "narrativa") {
        // D5 · relato → `basics`. Es DIRIGIDO: se lee, se paga una vez, y de ahí
        // salen el resumen y el objetivo. Antes esto caía en «contexto» y se perdía.
        cubo = "dirigido"; destinos = ["basics"]; motivo = "narrativa"; claves = c.claves;
      } else {
        cubo = "difuso"; destinos = TODOS(); motivo = "sin-clave"; claves = [];
      }
    }

    secciones.push({
      indice: secciones.length, titulo: b.titulo, nivel: b.nivel,
      inicio, fin, caracteres: fin - inicio, cubo, destinos, motivo, claves,
    });

    /* Solo un encabezado dirigido POR SU TÍTULO O POR HERENCIA se convierte en
       ancestro heredable. Un padre difuso o de instrucciones deja a sus hijos
       decidir solos (y si no saben, al difuso): heredar «no sé» no es información.

       ⚠ Y una NARRATIVA tampoco hereda, aunque su cubo sea «dirigido». Es el
         mismo razonamiento: «esto es prosa» no es un destino, es la ausencia de
         uno. Si heredara, una subsección de «Tu historia» que describiera un
         cargo iría SOLO a `basics` y perdería los otros cuatro extractores. Así
         cae al difuso: cuesta más y no pierde nada.                              */
    if (b.nivel > 0) {
      const heredable = cubo === "dirigido" && motivo !== "narrativa";
      ancestros.push({ nivel: b.nivel, destinos: heredable ? destinos : [] });
    }
  }

  return armar(secciones, longitud, forzado);
}

function armar(secciones: Seccion[], longitud: number, forzado: boolean, fuentes = 1): Reparto {
  const totales: Record<Cubo, number> = { dirigido: 0, difuso: 0, contexto: 0 };
  const porExtractor: Record<Extractor5, number> = { basics: 0, work: 0, education: 0, skills: 0, projects: 0 };
  const contexto: SeccionNombrada[] = [];
  const narrativas: SeccionNombrada[] = [];

  for (const s of secciones) {
    totales[s.cubo] += s.caracteres;
    for (const d of s.destinos) porExtractor[d] += s.caracteres;
    if (s.cubo === "contexto") contexto.push({ titulo: s.titulo, caracteres: s.caracteres });
    else if (s.motivo === "narrativa") narrativas.push({ titulo: s.titulo, caracteres: s.caracteres });
  }
  return { secciones, longitud, totales, porExtractor, contexto, narrativas, forzado, fuentes };
}

/* ══════════════════════════════════════════════════════════════════════════
   5-bis · EL REPARTO POR FUENTE (D6)
   ══════════════════════════════════════════════════════════════════════════ */

/** Un DOCUMENTO dentro del `raw_text` combinado: su etiqueta y su tramo. */
export interface Fuente {
  /** etiqueta legible: «texto pegado», «captura-linkedin-3.png», «misitio.cl» */
  etiqueta: string;
  /** offset de inicio en el texto COMBINADO */
  inicio: number;
  /** offset de fin, exclusivo */
  fin: number;
}

/**
 * ¿Los tramos TESELAN el texto? Contiguos, en orden, sin huecos ni solapes, del
 * carácter 0 al último. Si no, el reparto por fuente no puede conservar el
 * documento (D1) y no se usa: se cae al reparto normal, que es siempre correcto.
 */
export function fuentesTeselan(fuentes: readonly Fuente[], longitud: number): boolean {
  if (!fuentes.length) return false;
  let cursor = 0;
  for (const f of fuentes) {
    if (f.inicio !== cursor || f.fin < f.inicio) return false;
    cursor = f.fin;
  }
  return cursor === longitud;
}

/**
 * ★ Reparte DOCUMENTO A DOCUMENTO y devuelve UN solo `Reparto` sobre el texto
 * combinado, con los offsets ya trasladados.
 *
 * POR QUÉ IMPORTA (D6, medido): la ingesta pega el dossier y las catorce capturas
 * de LinkedIn en un único `raw_text`. Una captura transcrita no trae markdown, así
 * que al repartir el amasijo NO abre sección propia: se queda pegada a la última
 * sección del dossier y hereda su destino. En el caso real esa última sección era
 * difusa y las catorce capturas se pagaron cinco veces cada una; si hubiera sido
 * «# EDUCACIÓN», se habrían mandado SOLO al extractor de formación y toda la
 * experiencia de LinkedIn habría desaparecido sin un aviso.
 *
 * Lo que NO cambia, y es lo que mantiene el coste bajo: el resultado sigue siendo
 * UN reparto. `textoPara` junta después las secciones de TODOS los documentos que
 * van al mismo extractor en un solo corpus, y se ventanea una vez. Repartir por
 * fuente Y ADEMÁS llamar por fuente daría 5 llamadas por captura (78 en el caso
 * real, medido): correcto y carísimo. Se reparte por fuente; se llama por corpus.
 */
export function repartirPorFuente(
  texto: string,
  fuentes: readonly Fuente[],
  opts: OpcionesReparto = {},
): Reparto {
  // La vía de escape no se toca: forzarCompleto debe seguir costando y cubriendo
  // EXACTAMENTE lo mismo que la lectura antigua, sin importar cómo venga partido.
  if (opts.forzarCompleto || !fuentesTeselan(fuentes, texto.length)) return repartir(texto, opts);

  const secciones: Seccion[] = [];
  for (const f of fuentes) {
    const trozo = texto.slice(f.inicio, f.fin);
    for (const s of repartir(trozo, opts).secciones) {
      secciones.push({
        ...s,
        indice: secciones.length,
        inicio: s.inicio + f.inicio,
        fin: s.fin + f.inicio,
        fuente: f.etiqueta,
      });
    }
  }
  return armar(secciones, texto.length, false, fuentes.length);
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
