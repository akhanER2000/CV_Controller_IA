import { z } from "zod";
// Import RELATIVO a propósito (igual que ajuste.ts y variant-ai.ts): este módulo lo
// carga Vitest directamente y no debe arrastrar `server-only` ni el alias "@/". Todo
// lo que hay aquí es PURO: entra un master, sale una propuesta. El I/O vive en la ruta.
import { normalize, preservaHechosAlTraducir, soundsLikeAI, type TraducirResult } from "../verify";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL CV BILINGÜE (ES ⇄ EN) — el motor.
 *
 * EL ESTADO QUE ARREGLA: el renderizador YA es bilingüe (`I18n = {es, en}` en
 * resume.ts; ResumePDF elige `locale`), pero la extracción llena UN idioma y copia
 * el mismo string en los dos lados. Y `ai_translated` existía en el enum
 * `item_origin` desde la 0001 sin que NINGÚN código lo produjera: una etiqueta sin
 * motor. Esto es el motor.
 *
 * TRES DECISIONES QUE MANDAN SOBRE TODO LO DEMÁS:
 *
 *  1 · VÍA DETERMINISTA PRIMERO. Lo que no se traduce se COPIA, y no se paga. Las
 *      fechas son formato, no idioma. PharmIQ es PharmIQ en los dos idiomas. Python
 *      es Python. Solo las viñetas de logro, el resumen, los cargos genéricos y las
 *      descripciones necesitan un modelo. Esa clasificación es una función pura y
 *      testeada (`clasificarCampo`), porque es LA que decide cuánto se paga: sobre
 *      el master real de 105 items, manda al modelo una minoría de campos y copia
 *      el resto sin gastar un token.
 *
 *      ⚠ «actualidad» → «present» SÍ es traducción, pero DETERMINISTA: tabla
 *        cerrada, no una llamada al modelo. Igual los meses.
 *
 *  2 · BAJO DEMANDA, NUNCA EN LA INGESTA. Traducir 71 items al importar es pagar
 *      por algo que quizá no se use jamás. Al importar, el idioma de entrada llena
 *      su lado y el otro queda PENDIENTE DE TRADUCCIÓN — explícito, no vacío en
 *      silencio. Un botón lo dispara cuando hace falta.
 *
 *  3 · TRADUCIR NO ES REFORMULAR NI MEJORAR. Las cifras y las entidades nombradas
 *      son INTOCABLES, y el candado (`preservaHechosAlTraducir`, verify.ts) mira las
 *      DOS direcciones: nada nuevo Y nada perdido. Lo que no pasa el candado NO se
 *      ofrece traducido: el campo se queda con el texto ORIGINAL —literal, cierto,
 *      en el otro idioma— y se DICE. Un CV en un idioma que no dominas no se aplica
 *      a ciegas, así que todo llega como propuesta revisable con REVERTIR.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type Idioma = "es" | "en";
export const IDIOMAS: readonly Idioma[] = ["es", "en"] as const;
export const esIdioma = (v: unknown): v is Idioma => v === "es" || v === "en";
/** El otro idioma. Existe para que nadie escriba a mano el ternario al revés. */
export const otroIdioma = (l: Idioma): Idioma => (l === "es" ? "en" : "es");

/** El `origin` con el que se guarda una traducción. Enum item_origin (0001). */
export const ORIGEN_TRADUCCION = "ai_translated";

/* ════════════════════════════════════════════════════════════════════════════
   1 · LA CLASIFICACIÓN — la función que decide cuánto se paga
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Las tres vías por las que puede pasar un campo. El orden es el del coste:
 *  · copiar — el valor sobrevive LITERAL. Cero tokens. Es la vía por defecto.
 *  · tabla  — traducción determinista con vocabulario CERRADO (meses, «actualidad»,
 *             modalidad de trabajo, nivel de idioma). Cero tokens, y auditable:
 *             se puede leer la tabla y comprobar qué salió.
 *  · modelo — traducción real, la única que justifica pagar el modelo bueno.
 */
export type Via = "copiar" | "tabla" | "modelo";

/**
 * QUÉ VÍA LE TOCA A CADA CAMPO. El mapa es por NOMBRE DE CAMPO y no por (kind,
 * campo) porque las claves de `data` ya son inequívocas en este esquema: `company`
 * es siempre la empresa, `text` siempre el texto redactado. Duplicarlo por kind
 * daría 40 entradas donde caben 20 y multiplicaría los sitios donde olvidarse una.
 *
 * ⚠ `name` es COPIAR en los tres sitios donde aparece, y conviene decir por qué en
 *   voz alta: en `basics` es el nombre de la persona, en `reference` el de un
 *   tercero y en `project` el título del proyecto. Los tres son nombres propios.
 *   «PharmIQ» es «PharmIQ» en inglés, y traducir el nombre de alguien sería un
 *   disparate. Un solo caso, una sola regla.
 *
 * ⚠ `items` (la lista CSV de un grupo de habilidades) NO se traduce: son Python,
 *   Docker, RAG, PostgreSQL. Traducirlas sería inventarse tecnologías que no
 *   existen. Lo que SÍ se traduce de una habilidad es su `group` («Infraestructura»
 *   → «Infrastructure»), que es una palabra del idioma, no un nombre propio.
 */
export const VIA_POR_CAMPO: Readonly<Record<string, Via>> = {
  // ── COPIAR: nombres propios, datos de máquina y banderas ──────────────────
  name: "copiar",           // persona · tercero · título de proyecto
  company: "copiar",        // razón social
  institution: "copiar",    // universidad / centro
  issuer: "copiar",         // quien emite una certificación
  org: "copiar",            // organización de una referencia
  url: "copiar",
  email: "copiar",
  phone: "copiar",
  links: "copiar",
  photo: "copiar",
  qr: "copiar",
  items: "copiar",          // Python, Docker, RAG…
  sourceContext: "copiar",  // metadato de procedencia, no se imprime
  dateCurrent: "copiar",    // booleanos de la procedencia de la fecha (§C2)
  dateMissing: "copiar",
  dateInvalid: "copiar",
  dateByHuman: "copiar",

  // ── TABLA: determinista y cerrada ─────────────────────────────────────────
  dates: "tabla",           // «mar 2022 – actualidad» → «Mar 2022 – Present»
  dateStart: "tabla",
  dateEnd: "tabla",
  location: "tabla",        // la ciudad se copia; «Remoto» → «Remote»
  level: "tabla",           // «Nativo» → «Native»
  language: "tabla",        // «Inglés» → «English»

  // ── MODELO: lo único que justifica pagar ──────────────────────────────────
  text: "modelo",           // viñeta de logro · resumen
  description: "modelo",    // descripción de proyecto
  title: "modelo",          // cargo
  label: "modelo",          // titular profesional
  degree: "modelo",         // título académico
  group: "modelo",          // grupo de habilidades
  role: "modelo",           // cargo de una referencia
  relation: "modelo",       // «jefe directo» → «direct manager»
};

/** El veredicto de clasificar un campo, con su POR QUÉ (auditable en el panel). */
export interface Clasificacion {
  via: Via;
  motivo: string;
  /** true si el campo NO estaba declarado en el mapa: se copia, y se dice. */
  noDeclarado: boolean;
}

const MOTIVO: Readonly<Record<Via, string>> = {
  copiar: "no es idioma: nombre propio, dato de máquina o tecnología",
  tabla: "traducción determinista con vocabulario cerrado (cero tokens)",
  modelo: "texto redactado: es lo único que necesita traducción real",
};

/**
 * ¿Por dónde va este campo? PURA y con la puerta cerrada por defecto: un campo que
 * no esté declarado se COPIA (su valor sobrevive literal, que nunca es mentira) y se
 * marca `noDeclarado` para que el plan lo enseñe. Mandarlo al modelo «por si acaso»
 * sería pagar por adivinar; descartarlo sería perder un dato en silencio.
 */
export function clasificarCampo(campo: string): Clasificacion {
  const via = VIA_POR_CAMPO[campo];
  if (!via) {
    return {
      via: "copiar",
      motivo: "campo no declarado en el mapa de traducción: se copia literal y se avisa",
      noDeclarado: true,
    };
  }
  return { via, motivo: MOTIVO[via], noDeclarado: false };
}

/* ════════════════════════════════════════════════════════════════════════════
   2 · LAS TABLAS DETERMINISTAS — «actualidad» → «present» sin llamar a nadie
   ════════════════════════════════════════════════════════════════════════════ */

/** Un par de equivalencia cerrado. Se recorre en los dos sentidos. */
interface Par {
  es: string;
  en: string;
}

/**
 * MESES. Se listan las formas largas y las abreviadas porque el master real trae
 * las dos («marzo 2022», «mar 2022»). La abreviatura se traduce a abreviatura para
 * no descuadrar la línea de una entrada que ya estaba medida.
 */
const MESES: readonly Par[] = [
  { es: "enero", en: "january" }, { es: "ene", en: "jan" },
  { es: "febrero", en: "february" }, { es: "feb", en: "feb" },
  { es: "marzo", en: "march" }, { es: "mar", en: "mar" },
  { es: "abril", en: "april" }, { es: "abr", en: "apr" },
  { es: "mayo", en: "may" }, { es: "may", en: "may" },
  { es: "junio", en: "june" }, { es: "jun", en: "jun" },
  { es: "julio", en: "july" }, { es: "jul", en: "jul" },
  { es: "agosto", en: "august" }, { es: "ago", en: "aug" },
  { es: "septiembre", en: "september" }, { es: "setiembre", en: "september" },
  { es: "sept", en: "sept" }, { es: "sep", en: "sep" },
  { es: "octubre", en: "october" }, { es: "oct", en: "oct" },
  { es: "noviembre", en: "november" }, { es: "nov", en: "nov" },
  { es: "diciembre", en: "december" }, { es: "dic", en: "dec" },
];

/**
 * «ACTUALIDAD» → «PRESENT» y el conector del rango. Es traducción, sí, pero de
 * vocabulario CERRADO: no hay ninguna razón para pagarle a un modelo por decidir
 * que «actualidad» es «present». Las formas de más de una palabra van primero
 * (`FECHA_FRASES`) porque «la actualidad» tiene que ganarle a «actualidad».
 */
const FECHA_FRASES: readonly Par[] = [
  { es: "la actualidad", en: "Present" },
  { es: "el presente", en: "Present" },
  { es: "en curso", en: "Ongoing" },
];
const FECHA_PALABRAS: readonly Par[] = [
  { es: "actualidad", en: "Present" },
  { es: "actual", en: "Present" },
  { es: "presente", en: "Present" },
  { es: "hoy", en: "Present" },
  // El conector del rango. Se traduce SOLO dentro de un campo de fecha: ahí una «a»
  // suelta es el guion del rango y nada más. Fuera de aquí sería temerario.
  { es: "a", en: "to" },
];

/**
 * MODALIDAD DE TRABAJO Y NIVEL DE IDIOMA. Palabras del idioma, no nombres propios.
 *
 * ⚠ Deliberadamente NO hay tabla de ciudades ni de países. «Santiago, Chile» se
 *   copia igual en los dos idiomas, y meter «España → Spain» abriría una lista
 *   infinita de topónimos donde cada omisión se ve como un fallo. La regla de las
 *   entidades manda: lo que es nombre propio, sobrevive literal.
 */
const LUGAR: readonly Par[] = [
  { es: "remoto", en: "remote" },
  { es: "teletrabajo", en: "remote" },
  { es: "híbrido", en: "hybrid" },
  { es: "presencial", en: "on-site" },
];
const NIVEL: readonly Par[] = [
  { es: "nativo", en: "native" },
  { es: "bilingüe", en: "bilingual" },
  { es: "avanzado", en: "advanced" },
  { es: "intermedio", en: "intermediate" },
  { es: "básico", en: "basic" },
];
const IDIOMA_NOMBRE: readonly Par[] = [
  { es: "español", en: "spanish" }, { es: "castellano", en: "spanish" },
  { es: "inglés", en: "english" }, { es: "francés", en: "french" },
  { es: "alemán", en: "german" }, { es: "italiano", en: "italian" },
  { es: "portugués", en: "portuguese" }, { es: "chino", en: "chinese" },
  { es: "japonés", en: "japanese" },
];

/**
 * Índice normalizado (sin acentos, en minúsculas) de una tabla, EN UN SENTIDO.
 *
 * ⚠ `soloMultipalabra` no es un detalle: la pasada de FRASES existe para que «la
 *   actualidad» le gane a «actualidad», y eso solo tiene sentido cuando la forma de
 *   ORIGEN tiene más de una palabra. Sin este filtro, traducir al español metía la
 *   frase «Present → la actualidad» en la pasada de frases y salía «La actualidad»
 *   con el artículo pegado y en mayúscula. Un origen de una sola palabra pertenece a
 *   la pasada de palabras, que es la que respeta las fronteras de token.
 */
function indice(pares: readonly Par[], hacia: Idioma, soloMultipalabra = false): Map<string, string> {
  const desde: Idioma = otroIdioma(hacia);
  const m = new Map<string, string>();
  for (const p of pares) {
    const origen = p[desde];
    if (soloMultipalabra && !/\s/.test(origen)) continue;
    const k = normalize(origen);
    // La PRIMERA entrada gana: en MESES la forma larga precede a la abreviada, así
    // que «mar» no puede ser pisado por nada y «marzo» conserva su forma larga.
    if (!m.has(k)) m.set(k, p[hacia]);
  }
  return m;
}

/**
 * Copia la caja del original: «Marzo» → «March», «MAR» → «MAR», «mar» → «mar».
 * Si el original va en minúsculas se respeta la caja CANÓNICA de la tabla, que es
 * por lo que «actualidad» sale «Present» (con mayúscula, como en cualquier CV en
 * inglés) y no «present».
 */
function conLaCajaDe(original: string, traducido: string): string {
  if (original === original.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(original)) return traducido.toUpperCase();
  if (/^[A-ZÁÉÍÓÚÑ]/.test(original)) return traducido.charAt(0).toUpperCase() + traducido.slice(1);
  return traducido;
}

/**
 * Traduce una FECHA. Determinista, sin red y sin coste: se sustituyen meses,
 * «actualidad» y el conector del rango; TODO lo demás (años, guiones, barras,
 * paréntesis) sobrevive carácter a carácter. Un año jamás se toca — es una cifra, y
 * las cifras son intocables incluso por la vía barata.
 */
export function traducirFecha(texto: string, hacia: Idioma): string {
  const bruto = texto ?? "";
  if (!bruto.trim()) return bruto;

  const frases = indice(FECHA_FRASES, hacia, true);
  const palabras = new Map([...indice(MESES, hacia), ...indice(FECHA_PALABRAS, hacia)]);

  let salida = bruto;
  // Primero las frases (más de una palabra): «la actualidad» antes que «actualidad».
  for (const [k, v] of frases) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(k)})($|[^\\p{L}\\p{N}])`, "giu");
    salida = salida.replace(re, (_m, pre: string, hit: string, post: string) =>
      `${pre}${conLaCajaDe(hit, v)}${post}`);
  }
  // Y después palabra a palabra, respetando las fronteras de token.
  salida = salida.replace(/[\p{L}\p{N}]+/gu, (tok) => {
    const v = palabras.get(normalize(tok));
    return v ? conLaCajaDe(tok, v) : tok;
  });
  return salida;
}

/**
 * Traduce un valor de vocabulario CERRADO (modalidad, nivel, nombre de idioma).
 * Lo que no está en la tabla se COPIA LITERAL — que es justo lo que tiene que pasar
 * con «Santiago, Chile». Se parte por los separadores que el master usa de verdad
 * (coma, punto medio, barra) para que «Santiago, Chile · Remoto» traduzca solo la
 * parte que es idioma.
 */
export function traducirVocabulario(texto: string, hacia: Idioma): string {
  const bruto = texto ?? "";
  if (!bruto.trim()) return bruto;
  const tabla = new Map([
    ...indice(LUGAR, hacia),
    ...indice(NIVEL, hacia),
    ...indice(IDIOMA_NOMBRE, hacia),
  ]);
  // Se conservan los separadores originales Y los espacios de alrededor: partir y
  // volver a unir con otra cosa cambiaría el documento por una razón que no es el
  // idioma. («Santiago, Chile · Remoto» perdía el espacio antes de «Remote».)
  return bruto
    .split(/([,·/|]|\s—\s|\s-\s)/)
    .map((trozo) => {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(trozo);
      if (!m) return trozo;
      const [, izq, nucleo, der] = m as unknown as [string, string, string, string];
      const v = tabla.get(normalize(nucleo));
      return v ? `${izq}${conLaCajaDe(nucleo, v)}${der}` : trozo;
    })
    .join("");
}

/** La vía `tabla` aplicada al campo que toque. Un solo sitio decide qué tabla. */
export function traducirPorTabla(campo: string, valor: string, hacia: Idioma): string {
  if (campo === "dates" || campo === "dateStart" || campo === "dateEnd") {
    return traducirFecha(valor, hacia);
  }
  return traducirVocabulario(valor, hacia);
}

/* ════════════════════════════════════════════════════════════════════════════
   3 · LAS EQUIVALENCIAS DE SIGLA — la pieza sin la cual el candado miente
   ════════════════════════════════════════════════════════════════════════════
   `extractEntities` (verify.ts) caza siglas en MAYÚSCULAS y un diccionario de
   tecnologías. Hay siglas que CAMBIAN legítimamente al traducir: «IA» es «AI»,
   «I+D» es «R&D», «microservicios» es «microservices». Sin declararlas, la
   traducción CORRECTA se rechazaría por «perder IA e inventar AI» — y el usuario
   vería el candado dispararse contra el trabajo bien hecho.

   La tabla es CERRADA a propósito. Lo que no esté aquí tiene que sobrevivir
   LITERAL: es la única forma de que «Kafka» no pueda convertirse en «Pulsar» por
   la puerta de atrás de una equivalencia inventada.                              */
const PARES_ENTIDAD: readonly [string, string][] = [
  ["ia", "ai"],            // Inteligencia Artificial
  ["ti", "it"],            // Tecnologías de la Información
  ["rrhh", "hr"], ["rr.hh.", "hr"],
  ["i+d", "r&d"],
  ["pib", "gdp"],
  ["pyme", "sme"], ["pymes", "sme"],
  ["ue", "eu"],
  ["ong", "ngo"],
  ["microservicios", "microservices"],
  ["aprendizaje automatico", "machine learning"],
];

/** entidad normalizada → forma canónica compartida por los dos idiomas. */
export const EQUIVALENCIAS_ENTIDAD: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [es, en] of PARES_ENTIDAD) {
    const canon = normalize(en);
    m.set(normalize(es), canon);
    m.set(canon, canon);
  }
  return m;
})();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ════════════════════════════════════════════════════════════════════════════
   4 · EN QUÉ IDIOMA ESTÁ ESCRITO ESTO — la simetría, de verdad
   ════════════════════════════════════════════════════════════════════════════
   «Da igual en qué idioma subas»: si el master está en inglés, el botón tiene que
   ofrecer «Generar versión en español». La columna `lang` no sirve para saberlo hoy
   — el pipeline escribe `lang:"es"` fijo (extract/pipeline.ts) —, así que fiarse de
   ella haría que un CV en inglés se «tradujera» al inglés.

   Se detecta con palabras vacías, DETERMINISTA y sin coste. No es un clasificador
   general: es un desempate entre DOS idiomas conocidos sobre texto de CV, y para
   eso las palabras vacías bastan y se pueden auditar leyendo la lista.            */

const VACIAS_ES = new Set([
  "de", "la", "el", "los", "las", "del", "y", "en", "con", "para", "por", "un", "una",
  "que", "se", "su", "sus", "como", "entre", "sobre", "desde", "hasta", "mediante",
  "durante", "al", "lo", "mas", "muy", "fue", "fui", "he", "ha", "e",
]);
const VACIAS_EN = new Set([
  "the", "of", "and", "in", "with", "for", "to", "by", "from", "at", "on", "an",
  "that", "as", "into", "using", "across", "was", "were", "have", "has", "their",
  "its", "over", "through", "while", "led",
]);

/**
 * ¿Español o inglés? `null` cuando no hay evidencia suficiente para decidir — y eso
 * es una respuesta, no un fallo: mejor no saberlo y decirlo que adivinar y traducir
 * al idioma equivocado 71 items.
 */
export function detectarIdioma(texto: string): Idioma | null {
  const t = (texto ?? "").toLowerCase();
  if (!t.trim()) return null;
  // Acentos y ñ: señal fuerte de español (el inglés técnico no los usa).
  const acentos = (t.match(/[áéíóúñ¿¡]/g) ?? []).length;
  const tokens = normalize(t).split(/[^a-z0-9]+/).filter(Boolean);
  let es = 0;
  let en = 0;
  for (const tok of tokens) {
    if (VACIAS_ES.has(tok)) es++;
    if (VACIAS_EN.has(tok)) en++;
  }
  es += acentos;
  // Empate o casi: no se decide. El umbral es relativo (20 % de ventaja) para que
  // dos o tres coincidencias sueltas no impongan un idioma sobre un texto corto.
  const total = es + en;
  if (total < 3) return null;
  if (es > en * 1.2) return "es";
  if (en > es * 1.2) return "en";
  return null;
}

/* ════════════════════════════════════════════════════════════════════════════
   5 · EL PLAN — qué se copia, qué va por tabla y qué cuesta dinero
   ════════════════════════════════════════════════════════════════════════════ */

/** Un item del master reducido a lo que la traducción necesita ver. */
export interface ItemTraducible {
  id: string;
  kind: string;
  /** el idioma DECLARADO del item (columna `lang`). Se contrasta con el detectado. */
  lang?: string;
  data: Record<string, unknown>;
  /** ¿ya existe una fila traducida a `hacia` colgando de este item? */
  yaTraducido?: boolean;
}

/** Un campo concreto de un item, con la vía que le tocó y su porqué. */
export interface CampoPlan {
  /** clave estable `${itemId}:${campo}` — es la que viaja al modelo y vuelve. */
  clave: string;
  itemId: string;
  kind: string;
  campo: string;
  original: string;
  via: Via;
  motivo: string;
  /** resultado YA calculado para las vías deterministas (copiar y tabla). */
  resultado?: string;
}

export interface PlanTraduccion {
  desde: Idioma;
  hacia: Idioma;
  /** items que hay que traducir (los que ya lo están no vuelven a pasar por aquí) */
  items: ItemTraducible[];
  copiados: CampoPlan[];
  tabla: CampoPlan[];
  modelo: CampoPlan[];
  /** campos con una clave que el mapa no declara: se copian, y se enseñan. */
  noDeclarados: string[];
  /** items que ya tienen traducción a `hacia` y NO se vuelven a traducir. */
  yaTraducidos: number;
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * EL PLAN, SEPARADO DE LA EJECUCIÓN — la misma disciplina que `planificarExtraccion`
 * (extract/llm.ts). Decidir QUÉ se manda al modelo es puro y gratis; mandarlo cuesta.
 * Al separarlo, el test mide EL PLAN REAL (el mismo que ejecuta la ruta) en vez de
 * una copia del bucle que podría quedarse desfasada.
 *
 * ⚠ NO SE RE-TRADUCE. Un item con `yaTraducido` no entra: la traducción es un dato
 *   guardado, no un cálculo que se repite cada vez que alguien abre la pantalla.
 */
export function planificarTraduccion(
  items: readonly ItemTraducible[],
  hacia: Idioma,
  desde: Idioma = otroIdioma(hacia),
): PlanTraduccion {
  const plan: PlanTraduccion = {
    desde,
    hacia,
    items: [],
    copiados: [],
    tabla: [],
    modelo: [],
    noDeclarados: [],
    yaTraducidos: 0,
  };

  for (const it of items) {
    if (it.yaTraducido) {
      plan.yaTraducidos++;
      continue;
    }
    plan.items.push(it);
    for (const [campo, valor] of Object.entries(it.data ?? {})) {
      // Las claves internas (`_origin`, `_source`…) no son contenido del CV.
      if (campo.startsWith("_")) continue;
      const cl = clasificarCampo(campo);
      if (cl.noDeclarado && !plan.noDeclarados.includes(campo)) plan.noDeclarados.push(campo);

      const original = texto(valor);
      const base: CampoPlan = {
        clave: `${it.id}:${campo}`,
        itemId: it.id,
        kind: it.kind,
        campo,
        original,
        via: cl.via,
        motivo: cl.motivo,
      };

      // Un campo vacío o no textual (booleano, objeto `qr`, lista `links`) se COPIA
      // tal cual: no hay idioma que traducir y mandarlo al modelo sería pagar por
      // que nos devuelva lo mismo. El valor crudo viaja intacto en `resultado`.
      if (cl.via === "copiar" || !original.trim()) {
        plan.copiados.push({ ...base, via: "copiar", resultado: original });
        continue;
      }
      if (cl.via === "tabla") {
        plan.tabla.push({ ...base, resultado: traducirPorTabla(campo, original, hacia) });
        continue;
      }
      plan.modelo.push(base);
    }
  }
  return plan;
}

/* ════════════════════════════════════════════════════════════════════════════
   6 · LA LLAMADA AL MODELO — inyectable, como en todo el repo
   ════════════════════════════════════════════════════════════════════════════ */

export interface PeticionTraduccion {
  desde: Idioma;
  hacia: Idioma;
  textos: { clave: string; kind: string; campo: string; texto: string }[];
}

/** Lo que devuelve el modelo: la traducción de cada clave. Nada más. */
export interface ParTraducido {
  clave: string;
  traduccion: string;
}

/**
 * La forma de salida que se le exige al modelo. Deliberadamente MÍNIMA: una clave y
 * un texto. Ni «confianza», ni «notas», ni «calidad» — un campo numérico en este
 * schema sería una cifra sin fuente, y el producto no pinta cifras sin fuente.
 *
 * Vive en el módulo PURO (y no en la ruta) por la misma razón que
 * `promptDeExtraccion`: así la herramienta manual que mide la traducción contra la
 * clave real usa EXACTAMENTE el mismo contrato que producción. Una medición que
 * puede desincronizarse de lo medido no es una medición.
 */
export const LoteTraducidoSchema = z.object({
  traducciones: z
    .array(
      z.object({
        clave: z
          .string()
          .describe("La clave EXACTA [id:campo] que se dio en la entrada. No inventes claves."),
        traduccion: z
          .string()
          .describe(
            "El MISMO texto en el idioma destino. Conserva TODAS las cifras con su unidad y TODOS " +
              "los nombres propios, siglas y tecnologías. No añadas nada que no esté en el original.",
          ),
      }),
    )
    .describe("Una entrada por cada clave de la entrada, en el mismo orden."),
});

/** La función inyectable que llama al modelo (el LLM real se arma en la ruta). */
export type TraduccionLLM = (p: PeticionTraduccion) => Promise<ParTraducido[]>;

/* ════════════════════════════════════════════════════════════════════════════
   7 · EL RESULTADO — propuesta revisable, con lo rechazado a la vista
   ════════════════════════════════════════════════════════════════════════════ */

/** Un campo ya resuelto, tal como se enseña en el panel original ⇄ traducción. */
export interface CampoTraducido {
  campo: string;
  original: string;
  propuesto: string;
  via: Via;
  /**
   * true cuando el candado tumbó la traducción y el campo se quedó con el ORIGINAL.
   * El dato sobrevive literal (que nunca es mentira) y el usuario lo ve marcado.
   */
  sinTraducir: boolean;
  /** aviso NO bloqueante: se ofrece, pero se señala (vocabulario delator, etc.). */
  aviso?: string;
}

export interface PropuestaTraduccion {
  itemId: string;
  kind: string;
  /** el `data` COMPLETO de la fila traducida (copiados + tabla + modelo aceptados) */
  data: Record<string, unknown>;
  campos: CampoTraducido[];
  /** algún campo se quedó sin traducir por el candado. Se dice, no se calla. */
  incompleta: boolean;
}

/** Lo que el modelo propuso y NO se ofrece, con el motivo exacto. Depurable. */
export interface DescartadoTraduccion {
  itemId: string;
  campo: string;
  original: string;
  propuesto: string;
  razon: string;
  perdidas: { cifras: string[]; entidades: string[] };
  nuevas: { cifras: string[]; entidades: string[] };
}

export interface ResumenTraduccion {
  items: number;
  camposCopiados: number;
  camposTabla: number;
  camposModelo: number;
  camposRechazados: number;
  yaTraducidos: number;
  /** llamadas al modelo que se harían/hicieron (lotes) */
  lotes: number;
}

export interface ResultadoTraduccion {
  desde: Idioma;
  hacia: Idioma;
  propuestas: PropuestaTraduccion[];
  descartados: DescartadoTraduccion[];
  noDeclarados: string[];
  resumen: ResumenTraduccion;
}

/** Cuántos textos van en cada llamada. Lotes: una llamada por campo sería absurda
 *  (y carísima); un solo lote de 200 textos se sale del techo de salida del modelo. */
export const TEXTOS_POR_LOTE = 20;

/**
 * Por qué se cayó una traducción, en una frase que se entienda en un log sin abrir
 * el código. El orden importa: INVENTAR y PERDER son fallos distintos, y el primero
 * es el que rompe la promesa del producto, así que se nombra antes.
 */
export function razonDelCandadoTraduccion(v: TraducirResult): string {
  if (v.vacia) return "la traducción llegó vacía";
  const partes: string[] = [];
  if (v.newNumbers.length) partes.push(`aparecen cifras que no estaban (${v.newNumbers.join(", ")})`);
  if (v.newEntities.length) partes.push(`aparecen nombres que no estaban (${v.newEntities.join(", ")})`);
  if (v.lostNumbers.length) partes.push(`se pierden cifras del original (${v.lostNumbers.join(", ")})`);
  if (v.lostEntities.length) partes.push(`se pierden nombres del original (${v.lostEntities.join(", ")})`);
  return partes.join("; ") || "no pasó el candado de la traducción";
}

/**
 * Verifica UNA traducción. Se llama al PROPONER y otra vez al ACEPTAR: entre la
 * propuesta y el clic hay una red y un navegador, y ninguno de los dos es de fiar.
 * El candado tiene que estar donde se ESCRIBE, no solo donde se sugiere.
 */
export function verificarTraduccion(
  original: string,
  propuesta: string,
): { ok: true } | { ok: false; razon: string } {
  const v = preservaHechosAlTraducir(original, (propuesta ?? "").trim(), EQUIVALENCIAS_ENTIDAD);
  return v.ok ? { ok: true } : { ok: false, razon: razonDelCandadoTraduccion(v) };
}

/**
 * AVISOS NO BLOQUEANTES. Traducir no es «mejorar», pero la prueba de que algo se ha
 * adornado no siempre es una cifra nueva: a veces es vocabulario («leverage»,
 * «robust», «seamless» — el filtro §6.1 que ya existe) o un texto que ha crecido el
 * doble. Ninguna de las dos cosas es DEMOSTRABLEMENTE una invención, así que no
 * tumban la propuesta: la marcan. Rechazar por sospecha enseñaría a ignorar los
 * rechazos; callarlo sería peor. Se ofrece, marcado, y decide la persona.
 */
export function avisoDeTraduccion(original: string, propuesta: string): string | undefined {
  const delator = soundsLikeAI(propuesta);
  const yaEstaba = soundsLikeAI(original);
  const nuevos = delator.terms.filter((x) => !yaEstaba.terms.includes(x));
  if (nuevos.length) return `vocabulario que suena a IA y no estaba en el original: ${nuevos.join(", ")}`;

  const o = normalize(original).length;
  const p = normalize(propuesta).length;
  // El umbral solo se aplica a textos con cuerpo: en un cargo de 3 palabras la
  // proporción se dispara sola («Dev» → «Desarrollador») sin que nadie adorne nada.
  if (o >= 40 && p > o * 2) return `la traducción es más del doble de larga que el original (${o}→${p} caracteres)`;
  if (o >= 40 && normalize(original) === normalize(propuesta)) return "el texto volvió idéntico: puede que no se haya traducido";
  return undefined;
}

/**
 * EL CONSTRUCTOR DE LA PROPUESTA. Toma el master, planifica, manda al modelo SOLO lo
 * que hay que pagar y devuelve una propuesta que se puede revisar entera sin fiarse
 * de nadie: cada campo lleva su original al lado y todo lo rechazado sale nombrado.
 *
 * ★ NADA SE APLICA AQUÍ. Esto no escribe en la base: devuelve texto. El usuario
 *   acepta (y puede revertir) desde la pantalla.
 */
export async function construirTraduccion(
  {
    items,
    hacia,
    desde,
  }: { items: readonly ItemTraducible[]; hacia: Idioma; desde?: Idioma },
  { llm, porLote = TEXTOS_POR_LOTE }: { llm: TraduccionLLM; porLote?: number },
): Promise<ResultadoTraduccion> {
  const plan = planificarTraduccion(items, hacia, desde ?? otroIdioma(hacia));

  // ── 1 · Al modelo, en lotes y EN SERIE ────────────────────────────────────
  // En serie a propósito, igual que la extracción: disparar 8 lotes de golpe es la
  // forma más rápida de comerse el límite de peticiones y perder la traducción
  // entera por un 429.
  const traducciones = new Map<string, string>();
  const tam = Math.max(1, porLote);
  const lotes = Math.ceil(plan.modelo.length / tam);
  for (let i = 0; i < plan.modelo.length; i += tam) {
    const trozo = plan.modelo.slice(i, i + tam);
    const pares = await llm({
      desde: plan.desde,
      hacia: plan.hacia,
      textos: trozo.map((c) => ({ clave: c.clave, kind: c.kind, campo: c.campo, texto: c.original })),
    });
    for (const p of Array.isArray(pares) ? pares : []) {
      const clave = String(p?.clave ?? "");
      // Una clave que no se pidió es ruido del modelo: se ignora. No hay forma de
      // que invente un campo si solo se acepta lo que estaba en el lote.
      if (trozo.some((c) => c.clave === clave)) traducciones.set(clave, String(p?.traduccion ?? ""));
    }
  }

  // ── 2 · Ensamblado, campo a campo, con el candado en medio ────────────────
  const porItem = new Map<string, PropuestaTraduccion>();
  const descartados: DescartadoTraduccion[] = [];
  let camposRechazados = 0;

  const asegura = (c: CampoPlan): PropuestaTraduccion => {
    let p = porItem.get(c.itemId);
    if (!p) {
      p = { itemId: c.itemId, kind: c.kind, data: {}, campos: [], incompleta: false };
      porItem.set(c.itemId, p);
    }
    return p;
  };

  // Los deterministas primero: así el `data` de la fila traducida se arma completo
  // aunque el modelo falle entero (y entonces la fila es el original en su idioma,
  // que sigue siendo cierto — nunca una fila a medias con huecos).
  const original = new Map<string, ItemTraducible>(plan.items.map((i) => [i.id, i]));
  for (const c of [...plan.copiados, ...plan.tabla]) {
    const p = asegura(c);
    const crudo = original.get(c.itemId)?.data?.[c.campo];
    // `copiar` conserva el VALOR CRUDO (booleanos, `links`, el objeto `qr`): pasarlo
    // por String() convertiría una lista de enlaces en "[object Object]".
    p.data[c.campo] = c.via === "copiar" ? crudo : (c.resultado ?? c.original);
    if (c.original.trim() || c.via === "tabla") {
      p.campos.push({
        campo: c.campo,
        original: c.original,
        propuesto: c.resultado ?? c.original,
        via: c.via,
        sinTraducir: false,
      });
    }
  }

  for (const c of plan.modelo) {
    const p = asegura(c);
    const propuesto = (traducciones.get(c.clave) ?? "").trim();

    // El modelo no devolvió nada para esta clave: no es un rechazo del candado, es
    // una ausencia. Se conserva el original y se nombra igual — el silencio es lo
    // único que este producto no se permite.
    if (!propuesto) {
      camposRechazados++;
      p.data[c.campo] = c.original;
      p.incompleta = true;
      p.campos.push({ campo: c.campo, original: c.original, propuesto: c.original, via: "modelo", sinTraducir: true });
      descartados.push({
        itemId: c.itemId,
        campo: c.campo,
        original: c.original,
        propuesto: "",
        razon: "el modelo no devolvió traducción para este campo",
        perdidas: { cifras: [], entidades: [] },
        nuevas: { cifras: [], entidades: [] },
      });
      continue;
    }

    const v = preservaHechosAlTraducir(c.original, propuesto, EQUIVALENCIAS_ENTIDAD);
    if (!v.ok) {
      camposRechazados++;
      // ★ NO SE OFRECE. Y no se ofrece con un aviso: no se ofrece. El campo se queda
      //   con el texto ORIGINAL — en el otro idioma, sí, pero CIERTO — y el descarte
      //   sale nombrado con su motivo.
      p.data[c.campo] = c.original;
      p.incompleta = true;
      p.campos.push({ campo: c.campo, original: c.original, propuesto: c.original, via: "modelo", sinTraducir: true });
      descartados.push({
        itemId: c.itemId,
        campo: c.campo,
        original: c.original,
        propuesto,
        razon: razonDelCandadoTraduccion(v),
        perdidas: { cifras: v.lostNumbers, entidades: v.lostEntities },
        nuevas: { cifras: v.newNumbers, entidades: v.newEntities },
      });
      continue;
    }

    p.data[c.campo] = propuesto;
    p.campos.push({
      campo: c.campo,
      original: c.original,
      propuesto,
      via: "modelo",
      sinTraducir: false,
      aviso: avisoDeTraduccion(c.original, propuesto),
    });
  }

  // El orden de las propuestas es el del master (no el de los lotes): la pantalla
  // enseña el registro tal como el usuario lo tiene, no como se troceó el gasto.
  const propuestas = plan.items.map((i) => porItem.get(i.id)).filter((p): p is PropuestaTraduccion => !!p);

  return {
    desde: plan.desde,
    hacia: plan.hacia,
    propuestas,
    descartados,
    noDeclarados: plan.noDeclarados,
    resumen: {
      items: plan.items.length,
      camposCopiados: plan.copiados.length,
      camposTabla: plan.tabla.length,
      camposModelo: plan.modelo.length,
      camposRechazados,
      yaTraducidos: plan.yaTraducidos,
      lotes,
    },
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   8 · LA LECTURA BILINGÜE — de dos filas a un `I18n`
   ════════════════════════════════════════════════════════════════════════════
   Vive aquí, PURA, porque la usan DOS constructores de documento
   (buildResumeData y buildVariantResumeData) y componer la paridad por separado en
   cada uno es la receta conocida para que el PDF del master y el de la variante
   acaben diciendo cosas distintas del mismo dato.                                */

/** Una fila de `profile_items` reducida a lo que la lectura bilingüe necesita. */
export interface FilaBilingue {
  id: string;
  lang?: string | null;
  origin?: string | null;
  translated_from?: string | null;
  data: Record<string, unknown>;
}

/** ¿Es una fila ESPEJO (la traducción) y no un item del registro? */
export const esEspejo = (f: { origin?: string | null }): boolean => (f.origin ?? "") === ORIGEN_TRADUCCION;

/** idioma → (id del item ORIGINAL → su `data` traducida). */
export type IndiceTraducciones = Record<Idioma, Map<string, Record<string, unknown>>>;

/** Índice vacío: un master sin traducciones sigue rindiendo, en un solo idioma. */
export const SIN_TRADUCCIONES: IndiceTraducciones = { es: new Map(), en: new Map() };

/** Construye el índice a partir de las filas crudas (originales y espejos juntos). */
export function indiceDeTraducciones(filas: readonly FilaBilingue[]): IndiceTraducciones {
  const idx: IndiceTraducciones = { es: new Map(), en: new Map() };
  for (const f of filas) {
    if (!esEspejo(f) || !f.translated_from) continue;
    const l = f.lang;
    if (!esIdioma(l)) continue;
    idx[l].set(f.translated_from, f.data ?? {});
  }
  return idx;
}

/**
 * El `data` de un item EN CADA IDIOMA.
 *
 * ★ LA REGLA: manda el ÍNDICE, no la columna `lang`. Si hay traducción a ese idioma
 *   se usa; si no, se usa el ORIGINAL. Nunca vacío, nunca inventado.
 *
 * ⚠ Y no se consulta `lang` a propósito, aunque parezca lo natural: hoy el pipeline
 *   escribe `lang:"es"` fijo para TODO lo que entra (extract/pipeline.ts), así que un
 *   CV subido en inglés viene marcado como español. Un master inglés al que se le ha
 *   generado la versión española tiene sus espejos con `lang='es'`; si esta función
 *   preguntara por la columna, vería «el item ya es español» y devolvería el inglés
 *   en el lado español — justo el caso que la SIMETRÍA promete resolver. El índice no
 *   miente porque se construye de filas que existen.
 *
 * ⚠ El fallback al original NO es un apaño: es la promesa. Un item sin traducir sale
 *   en su idioma —cierto y completo— en vez de en blanco. Lo que falta se dice en la
 *   pantalla («pendiente de traducción»), no se disimula con un hueco en el PDF.
 */
export function datosBilingues(
  item: { id: string; data: Record<string, unknown> },
  idx: IndiceTraducciones,
): Record<Idioma, Record<string, unknown>> {
  const propio = item.data ?? {};
  return { es: idx.es.get(item.id) ?? propio, en: idx.en.get(item.id) ?? propio };
}

const comoTexto = (o: Record<string, unknown>, campo: string): string => String(o[campo] ?? "");

/** UN campo del item, en los dos idiomas. Es el `I18n` que consume el documento. */
export function campoBilingue(
  item: { id: string; data: Record<string, unknown> },
  campo: string,
  idx: IndiceTraducciones,
): { es: string; en: string } {
  const d = datosBilingues(item, idx);
  return { es: comoTexto(d.es, campo), en: comoTexto(d.en, campo) };
}

/**
 * VARIOS campos compuestos en una línea, en los dos idiomas (el «Nombre — Descripción»
 * de un proyecto). Se compone DENTRO de cada idioma: componer en español y traducir la
 * línea entera sería traducir también el conector, y el conector es del documento.
 */
export function lineaBilingue(
  item: { id: string; data: Record<string, unknown> },
  campos: readonly string[],
  separador: string,
  idx: IndiceTraducciones,
): { es: string; en: string } {
  const d = datosBilingues(item, idx);
  const arma = (o: Record<string, unknown>) => campos.map((c) => comoTexto(o, c)).filter(Boolean).join(separador);
  return { es: arma(d.es), en: arma(d.en) };
}

/* ════════════════════════════════════════════════════════════════════════════
   9 · EL PROMPT — inglés PROFESIONAL de CV, no traducción literal
   ════════════════════════════════════════════════════════════════════════════
   Esto es lo ÚNICO que justifica el modelo bueno y no un traductor mecánico:
   «Lideré un equipo de 6 personas» tiene que salir «Led a 6-person team», no «I led
   a team of 6 people». Registro de CV, verbo de acción en pasado, sin sujeto, sin
   artículos de más. Un traductor automático da la segunda; y la segunda delata al
   candidato en la primera línea.                                                  */

const REGISTRO_ES = "español profesional de CV (sin sujeto, verbos de acción, sin florituras)";
const REGISTRO_EN = "professional CV English (no first-person pronouns, action verbs in past tense, concise)";

/** El prompt EXACTO que se manda. Aislado para poder MEDIRLO sin llamar a nadie. */
export function promptDeTraduccion(p: PeticionTraduccion): string {
  const destino = p.hacia === "en" ? REGISTRO_EN : REGISTRO_ES;
  const lineas = p.textos.map((t) => `[${t.clave}] (${t.kind}.${t.campo}) ${t.texto}`).join("\n");
  return (
    `Traduce del ${p.desde === "es" ? "español" : "inglés"} al ${p.hacia === "es" ? "español" : "inglés"} ` +
    `los textos de un CV. Registro: ${destino}.\n` +
    "\n★ REGLAS QUE NO SE NEGOCIAN:\n" +
    "1. TRADUCES, no reformulas ni mejoras. No añadas logros, adjetivos, contexto ni " +
    "nada que no esté en el original. Si el original es escueto, la traducción es escueta.\n" +
    "2. Las CIFRAS son intocables: «850 ms» sigue siendo «850 ms», «~300 personas» es " +
    "«~300 people». Mismo número, misma unidad, mismo signo de aproximación.\n" +
    "3. Los NOMBRES PROPIOS, siglas y tecnologías son intocables: empresas, productos, " +
    "Kafka, Docker, PostgreSQL, RAG. NO los traduzcas y NO añadas ninguno que no esté.\n" +
    "4. NO subas de nivel una afirmación: si el original dice «algo de Kubernetes», la " +
    "traducción dice «some Kubernetes», no «solid Kubernetes skills». El matiz se respeta.\n" +
    "5. Registro de CV: sin «I», sin «Yo», verbo de acción en pasado. " +
    "«Lideré un equipo de 6 personas» → «Led a 6-person team» (NO «I led a team of 6 people»).\n" +
    "6. Devuelve EXACTAMENTE una entrada por cada clave [id:campo] que te doy, con la " +
    "misma clave. No inventes claves, no omitas ninguna, no fusiones textos.\n" +
    `\nTEXTOS:\n${lineas}`
  );
}
