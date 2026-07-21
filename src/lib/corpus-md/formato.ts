/* ============================================================================
   corpus/1 · LA GRAMÁTICA

   Un solo formato, dos direcciones: lo que exportar.ts escribe, parser.ts lo
   vuelve a leer sin perder un byte. Este fichero es el vocabulario compartido —
   si una decisión afecta a las dos direcciones, vive AQUÍ y no duplicada.

   ── EL ESQUELETO ───────────────────────────────────────────────────────────
     # CORPUS · Perfil profesional
     formato: corpus/1

     ## CONTACTO                  → kind basics
     nombre: Ignacia Belén Roa
     email: i.roa@ejemplo.cl
     enlace: LinkedIn | https://linkedin.com/in/iroa

     ## EXPERIENCIA               → kind work
     ### Educadora de párvulos    ← el ### abre una entrada; su texto es el título
     empresa: Jardín Infantil Minilandia
     fechas: 2020 - 2024
     - Lideré reuniones con apoderados.   ← viñeta (kind bullet) del rol en curso

   ── LAS SIETE REGLAS DEL PARSER ────────────────────────────────────────────
   1. Encabezados sin acentos ni mayúsculas obligatorias, y en ES o EN:
      «## EXPERIENCIA» = «## Experiencia» = «## experience».
   2. Claves tolerantes al acento y a variantes: ubicacion=ubicación,
      institucion=institución, titulo=título.
   3. `enlace:` y `referencia:` se ACUMULAN; no se pisan.
   4. Las líneas que empiezan por `-` o `*` son viñetas del bloque en curso.
   5. Lo que no encaja SE CONSERVA como nota con su número de línea.
   6. No se adivina: una fecha que no se entiende se marca y se pregunta.
   7. No se reclasifica: lo que está bajo ## HABILIDADES es una habilidad. El
      humano ya clasificó al escribirlo, y eso vale más que cualquier heurística.

   ── POR QUÉ `fechas:` ES EL CAMPO CANÓNICO (y desde:/hasta: solo azúcar) ────
   El master guarda `dates` como TEXTO LIBRE ("2020 - 2024", o "") más banderas
   derivadas (dateStart, dateEnd, dateCurrent, dateMissing…). Si el formato solo
   tuviera desde:/hasta: y el parser RECONSTRUYERA `dates`, el round-trip
   devolvería un texto PARECIDO, no idéntico, y «cero diferencias» fallaría por
   un espacio. Por eso `fechas:` lleva el texto literal del master, y desde:/
   hasta: existen para el humano que escribe a mano: el parser los normaliza,
   pero el exportador NUNCA los escribe.

   ── EL PROBLEMA DE LOS ESPACIOS (la forma literal `|`) ─────────────────────
   `clave: valor` recorta los bordes, que es lo que quiere un humano. Pero un
   valor del master puede llevar espacios al borde o saltos de línea, y
   recortarlos sería descartar dato en silencio. De ahí la forma literal:

       texto: |  dos espacios delante y un salto aquí
       |segunda línea, verbatim

   El primer `|` tras los dos puntos dice «lo que sigue es exacto». Una línea que
   empieza por `|` continúa el campo anterior añadiendo un `\n`. Cada trozo del
   valor es una línea del fichero, así que un snippet largo sigue diffeándose
   línea a línea en git (que es justo lo que base64 rompería).
   ========================================================================== */

import { normalizeDateRange } from "@/lib/extract/dates";

/** El identificador del formato. Va declarado en el fichero: `formato: corpus/1`. */
export const FORMATO_ID = "corpus/1";

/* ── Tipos públicos (los otros dos bloques programan contra esto) ─────────── */

export interface AvisoParseo {
  /** número de línea 1-based, para que el humano vaya justo ahí. */
  linea: number;
  mensaje: string;
  sugerencia?: string;
}

export interface ItemParseado {
  kind: string;
  data: Record<string, unknown>;
  /** índice del padre DENTRO de items[] (una viñeta a su rol). */
  parentIndex?: number;
  /** presentes solo si el fichero traía bloque de procedencia. */
  origin?: string;
  sourceId?: string | null;
  evidenceSnippet?: string | null;
  evidencePage?: number | null;
  evidenceVerified?: boolean;
}

export interface ResultadoParseo {
  /** false SOLO si el texto no es un corpus/1 reconocible. */
  ok: boolean;
  /** "corpus/1" si el fichero lo declara; null si no lo declara. */
  formato: string | null;
  items: ItemParseado[];
  avisos: AvisoParseo[];
  /** lo que no encajó, CONSERVADO con su línea. Nunca se descarta. */
  notas: { linea: number; texto: string }[];
  /** conteo por kind, para el informe previo a la importación. */
  resumen: Record<string, number>;
}

/**
 * La forma que devuelve getMasterItems (src/lib/db/queries.ts) más las dos
 * columnas de procedencia que esa consulta aún no baja (evidencePage, sourceId).
 * Son opcionales: sin ellas el exportador funciona, pero el round-trip pierde
 * esas dos columnas — y eso hay que decirlo, no esconderlo.
 */
export interface ItemParaExportar {
  id?: string;
  kind: string;
  parentId?: string | null;
  data: Record<string, unknown>;
  origin?: string;
  evidenceSnippet?: string | null;
  evidenceVerified?: boolean;
  sortOrder?: number;
  evidencePage?: number | null;
  sourceId?: string | null;
}

/* ── Normalización de claves y encabezados ────────────────────────────────── */

/** Sin acentos, en minúsculas y con los espacios colapsados. Regla 1 y 2. */
export function normalizarClave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas de acento, ya separadas por NFD
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* ── Escapes: el mínimo imprescindible, y solo el imprescindible ───────────
   Un valor puede llevar un carácter que rompería el fichero: un salto de línea
   (lo resuelve la forma literal), un carácter de control invisible, un `--`
   dentro de un comentario HTML (cerraría el bloque de procedencia) o un `|` en
   un enlace (es el separador etiqueta|url).

   Se escapan como `\xHH` con HH en MAYÚSCULAS, y SOLO se decodifican los
   códigos que el exportador puede llegar a emitir: 00-1F, 2D (-), 5C (\),
   7C (|) y 7F. Así, un humano que escriba «\x41» en su CV se queda con «\x41»
   literal y no con una «A» aparecida de la nada. Descodificar cualquier \xHH
   habría sido cambiar el dato del usuario sin avisar. */
const DECODIFICABLES = /\\x(0[0-9A-F]|1[0-9A-F]|2D|5C|7C|7F)/g;

/** Aplica los escapes mínimos a un trozo de valor de una línea. */
export function codificar(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const cp = c.codePointAt(0)!;
    // Un `\` seguido de `x` se escapa a sí mismo, o «\x2D» escrito por el
    // usuario se leería como un guion al volver.
    if (c === "\\" && s[i + 1] === "x") { out += "\\x5C"; continue; }
    if (cp < 0x20 || cp === 0x7f) { out += `\\x${cp.toString(16).toUpperCase().padStart(2, "0")}`; continue; }
    out += c;
  }
  return out;
}

/** Como codificar(), y además parte los `--` que cerrarían el comentario HTML. */
export function codificarEnComentario(s: string): string {
  return codificar(s).replace(/--/g, "-\\x2D");
}

/** Como codificar(), y además protege el `|` que separa etiqueta de url. */
export function codificarEnlace(s: string): string {
  return codificar(s).replace(/\|/g, "\\x7C");
}

export function decodificar(s: string): string {
  return s.replace(DECODIFICABLES, (_m, hh: string) => String.fromCharCode(parseInt(hh, 16)));
}

/* ── Lectura y escritura de un valor ──────────────────────────────────────── */

/**
 * Lee la parte derecha de `clave: valor` (o de una viñeta `- valor`).
 * Con `|` delante el valor es VERBATIM; sin él se recortan los bordes.
 */
export function leerValor(resto: string): string {
  const s = resto.replace(/^[ \t]+/, "");
  if (s.startsWith("|")) return decodificar(s.slice(1));
  return decodificar(s.trim());
}

/** ¿La línea es una continuación (`|…`) del campo anterior? Devuelve el trozo. */
export function leerContinuacion(linea: string): string | null {
  const m = linea.match(/^[ \t]*\|(.*)$/);
  return m ? decodificar(m[1]!) : null;
}

/**
 * Escribe un valor: devuelve el trozo que va tras `clave:` y las líneas de
 * continuación. Usa la forma literal solo cuando hace falta, para que el
 * fichero siga pareciendo escrito por una persona.
 */
export function escribirValor(v: string): { primera: string; continuaciones: string[] } {
  const trozos = v.split("\n");
  const p0 = trozos[0]!;
  const literal = p0 !== p0.trim() || p0.startsWith("|");
  return {
    primera: literal ? `|${codificar(p0)}` : codificar(p0),
    // De la segunda en adelante SIEMPRE literal: el `|` es lo que las identifica
    // como continuación, y de paso les conserva los espacios del borde.
    continuaciones: trozos.slice(1).map((t) => `|${codificar(t)}`),
  };
}

/** Monta las líneas completas de un campo (`clave: valor` + continuaciones). */
export function lineasDeCampo(nombre: string, valor: string): string[] {
  const { primera, continuaciones } = escribirValor(valor);
  return [primera === "" ? `${nombre}:` : `${nombre}: ${primera}`, ...continuaciones];
}

/* ── El vocabulario: secciones ────────────────────────────────────────────── */

export interface DefSeccion {
  kind: string;
  /** cómo se ESCRIBE al exportar. */
  titulo: string;
  /** alias aceptados al leer, ya normalizados (ES y EN). */
  alias: string[];
}

/**
 * Las secciones, en el orden en que se exportan. PUBLICACIONES, ENLACES y OTROS
 * no están en el encargo pero SÍ en el enum item_kind de la base: sin ellas un
 * item de esos kinds no tendría dónde escribirse, y «no tener dónde» acaba
 * siempre en «se descarta». OTROS es la red de seguridad para un kind futuro.
 */
export const SECCIONES: DefSeccion[] = [
  { kind: "basics", titulo: "CONTACTO", alias: ["contacto", "datos personales", "datos de contacto", "basics", "contact", "personal", "personal details"] },
  { kind: "summary", titulo: "RESUMEN", alias: ["resumen", "perfil", "perfil profesional", "sobre mi", "summary", "profile", "about", "about me"] },
  { kind: "work", titulo: "EXPERIENCIA", alias: ["experiencia", "experiencia laboral", "experiencia profesional", "trabajo", "work", "experience", "work experience", "employment"] },
  { kind: "skill", titulo: "HABILIDADES", alias: ["habilidades", "competencias", "aptitudes", "conocimientos", "skills", "competencies"] },
  { kind: "education", titulo: "EDUCACION", alias: ["educacion", "formacion", "formacion academica", "estudios", "education", "studies"] },
  { kind: "project", titulo: "PROYECTOS", alias: ["proyectos", "projects"] },
  { kind: "certification", titulo: "CERTIFICACIONES", alias: ["certificaciones", "certificados", "cursos", "certifications", "certificates", "courses"] },
  { kind: "language", titulo: "IDIOMAS", alias: ["idiomas", "languages"] },
  { kind: "publication", titulo: "PUBLICACIONES", alias: ["publicaciones", "publications"] },
  { kind: "link", titulo: "ENLACES", alias: ["enlaces", "links"] },
  { kind: "reference", titulo: "REFERENCIAS", alias: ["referencias", "references"] },
  { kind: "otros", titulo: "OTROS", alias: ["otros", "otro", "other", "misc"] },
];

const SECCION_POR_ALIAS = new Map<string, DefSeccion>();
for (const s of SECCIONES) for (const a of s.alias) SECCION_POR_ALIAS.set(a, s);

export function seccionPorTitulo(texto: string): DefSeccion | undefined {
  return SECCION_POR_ALIAS.get(normalizarClave(texto));
}

export function seccionPorKind(kind: string): DefSeccion | undefined {
  return SECCIONES.find((s) => s.kind === kind);
}

/* ── El vocabulario: campos por kind ──────────────────────────────────────── */

export interface DefCampo {
  /** la clave real de `data` (una de DATA_KEYS). */
  clave: string;
  /** cómo se ESCRIBE al exportar. */
  nombre: string;
  /** alias aceptados al leer, normalizados. Incluye el nombre canónico. */
  alias: string[];
}

/**
 * ⚠ La resolución de claves es ESTRICTAMENTE POR KIND, sin tabla global de
 * respaldo. No es purismo: bajo ## HABILIDADES la línea «Idiomas: Inglés B1» es
 * un GRUPO de habilidades llamado «Idiomas» (regla 7: el humano ya clasificó).
 * Con una tabla global, «idiomas» habría resuelto a un campo y esa habilidad se
 * habría convertido en otra cosa sin que nadie lo pidiera.
 */
export const CAMPOS_POR_KIND: Record<string, DefCampo[]> = {
  basics: [
    { clave: "name", nombre: "nombre", alias: ["nombre", "name", "nombre completo", "full name"] },
    { clave: "label", nombre: "titular", alias: ["titular", "cargo", "rotulo", "label", "headline", "title"] },
    { clave: "email", nombre: "email", alias: ["email", "correo", "correo electronico", "e-mail", "mail"] },
    { clave: "phone", nombre: "telefono", alias: ["telefono", "phone", "movil", "celular", "tel"] },
    { clave: "location", nombre: "ubicacion", alias: ["ubicacion", "location", "localidad", "ciudad", "city"] },
    { clave: "links", nombre: "enlace", alias: ["enlace", "link", "url", "web", "sitio"] },
    { clave: "photo", nombre: "foto", alias: ["foto", "photo", "imagen", "avatar"] },
  ],
  summary: [
    { clave: "text", nombre: "texto", alias: ["texto", "text", "resumen", "summary"] },
  ],
  work: [
    { clave: "title", nombre: "puesto", alias: ["puesto", "cargo", "titulo", "title", "position", "role"] },
    { clave: "company", nombre: "empresa", alias: ["empresa", "company", "organizacion", "organization", "employer"] },
    { clave: "location", nombre: "ubicacion", alias: ["ubicacion", "location", "localidad", "ciudad", "city"] },
    { clave: "dates", nombre: "fechas", alias: ["fechas", "fecha", "dates", "date", "periodo", "period"] },
  ],
  bullet: [
    { clave: "text", nombre: "texto", alias: ["texto", "text"] },
  ],
  skill: [
    { clave: "group", nombre: "grupo", alias: ["grupo", "group", "categoria", "category"] },
    { clave: "items", nombre: "items", alias: ["items", "elementos", "habilidades"] },
    { clave: "sourceContext", nombre: "contexto", alias: ["contexto", "context", "de", "from"] },
  ],
  education: [
    { clave: "degree", nombre: "titulo", alias: ["titulo", "grado", "degree", "carrera", "estudios", "qualification"] },
    { clave: "institution", nombre: "institucion", alias: ["institucion", "institution", "centro", "universidad", "school", "college"] },
    { clave: "location", nombre: "ubicacion", alias: ["ubicacion", "location", "localidad", "ciudad", "city"] },
    { clave: "dates", nombre: "fechas", alias: ["fechas", "fecha", "dates", "date", "periodo", "period"] },
  ],
  project: [
    { clave: "name", nombre: "nombre", alias: ["nombre", "name", "titulo", "title"] },
    { clave: "description", nombre: "descripcion", alias: ["descripcion", "description", "detalle"] },
    { clave: "url", nombre: "url", alias: ["url", "enlace", "link", "web"] },
    { clave: "dates", nombre: "fechas", alias: ["fechas", "fecha", "dates", "date", "periodo", "period"] },
  ],
  certification: [
    { clave: "name", nombre: "nombre", alias: ["nombre", "name", "titulo", "title", "certificacion"] },
    { clave: "issuer", nombre: "emisor", alias: ["emisor", "issuer", "entidad", "organismo", "institucion"] },
    { clave: "url", nombre: "url", alias: ["url", "enlace", "link", "web"] },
    { clave: "dates", nombre: "fechas", alias: ["fechas", "fecha", "dates", "date", "periodo", "period"] },
  ],
  language: [
    { clave: "language", nombre: "idioma", alias: ["idioma", "language", "lengua"] },
    { clave: "level", nombre: "nivel", alias: ["nivel", "level"] },
  ],
  publication: [
    { clave: "name", nombre: "nombre", alias: ["nombre", "name", "titulo", "title"] },
    { clave: "description", nombre: "descripcion", alias: ["descripcion", "description"] },
    { clave: "url", nombre: "url", alias: ["url", "enlace", "link", "web"] },
    { clave: "dates", nombre: "fechas", alias: ["fechas", "fecha", "dates", "date", "periodo", "period"] },
  ],
  link: [
    { clave: "label", nombre: "etiqueta", alias: ["etiqueta", "label", "rotulo", "nombre", "name"] },
    { clave: "url", nombre: "url", alias: ["url", "enlace", "link", "web"] },
  ],
  // reference · VOCABULARIO CERRADO de 6 claves (name obligatoria). Sus vínculos
  // con items del master viven en la tabla reference_links (migración 0005), NO
  // en `data`: por eso aquí no hay ningún campo para ellos.
  reference: [
    { clave: "name", nombre: "nombre", alias: ["nombre", "name"] },
    { clave: "role", nombre: "cargo", alias: ["cargo", "rol", "role", "puesto", "position"] },
    { clave: "org", nombre: "organizacion", alias: ["organizacion", "org", "empresa", "organization", "company"] },
    { clave: "relation", nombre: "relacion", alias: ["relacion", "relation", "vinculo", "relationship"] },
    { clave: "email", nombre: "email", alias: ["email", "correo", "correo electronico", "e-mail", "mail"] },
    { clave: "phone", nombre: "telefono", alias: ["telefono", "phone", "movil", "celular", "tel"] },
  ],
  otros: [],
};

/** Azúcar de fechas, aceptado en todo kind que tenga `dates`. Nunca se exporta. */
export const ALIAS_DESDE = ["desde", "from", "inicio", "start"];
export const ALIAS_HASTA = ["hasta", "to", "fin", "end", "until"];

/** En OTROS, el kind viaja en un campo: es lo que hace la sección reversible. */
export const CAMPO_TIPO = "tipo";
export const ALIAS_TIPO = ["tipo", "kind", "type"];

export function campoPorAlias(kind: string, clave: string): DefCampo | undefined {
  const n = normalizarClave(clave);
  return (CAMPOS_POR_KIND[kind] ?? []).find((c) => c.alias.includes(n));
}

export function campoDeClaveData(kind: string, claveData: string): DefCampo | undefined {
  return (CAMPOS_POR_KIND[kind] ?? []).find((c) => c.clave === claveData);
}

/** ¿Es un nombre de campo reconocido en este kind (incluidos azúcar y `tipo`)? */
export function esNombreDeCampo(kind: string, clave: string): boolean {
  const n = normalizarClave(clave);
  if (ALIAS_DESDE.includes(n) || ALIAS_HASTA.includes(n) || ALIAS_TIPO.includes(n)) return true;
  return (CAMPOS_POR_KIND[kind] ?? []).some((c) => c.alias.includes(n));
}

/**
 * La clave que viaja en el texto del `###`. El encabezado NO es un campo más:
 * es el rótulo que lee un humano. Si además aparece el campo explícito, MANDA EL
 * CAMPO (así el exportador puede escribir valores raros sin ensuciar el título).
 * basics y summary no llevan ### en su primera entrada — ver exportar.ts.
 */
export const CLAVE_CABECERA: Record<string, string | undefined> = {
  basics: "name",
  summary: undefined,
  work: "title",
  skill: "group",
  education: "degree",
  project: "name",
  certification: "name",
  language: "language",
  publication: "name",
  link: "label",
  reference: "name",
  otros: undefined,
};

/** Kinds a los que una viñeta les pertenece con naturalidad. */
export const ADMITEN_VINETAS = new Set(["work", "project", "publication", "education"]);

/* ── Enlaces: `enlace: Etiqueta | https://…` o `enlace: https://…` ──────────
   basics.links mezcla strings sueltos y objetos {label,url}. El exportador debe
   PRESERVAR cuál de las dos formas tenía cada enlace: un string que volviera
   como objeto sería un cambio de tipo silencioso. */

export function escribirEnlace(l: unknown): string | null {
  if (typeof l === "string") return codificarEnlace(l);
  if (l && typeof l === "object" && !Array.isArray(l)) {
    const o = l as Record<string, unknown>;
    const claves = Object.keys(o);
    const soloConocidas = claves.every((k) => k === "label" || k === "url");
    if (soloConocidas && typeof o.url === "string" && typeof o.label === "string") {
      return `${codificarEnlace(o.label)} | ${codificarEnlace(o.url)}`;
    }
  }
  // Forma que el campo no sabe escribir → que lo resuelva el bloque de
  // procedencia como extra. Devolver null es decir «yo no puedo con esto».
  return null;
}

export function leerEnlace(valor: string): string | { label: string; url: string } {
  const i = valor.indexOf(" | ");
  if (i < 0) return valor;
  return { label: valor.slice(0, i), url: valor.slice(i + 3) };
}

/* ── Bloque de procedencia ────────────────────────────────────────────────── */

/**
 * ★ LA DECISIÓN MÁS DELICADA DEL FORMATO.
 *
 * Un item que vino de LinkedIn con su evidence_snippet no puede volver
 * convertido en «manual» a secas. Pero un humano que escribe su CV a mano no
 * tiene por qué escribir procedencia ninguna. Las dos cosas a la vez se
 * resuelven con un comentario HTML: invisible al renderizar el markdown,
 * discreto al leerlo en crudo, y presente al volver.
 *
 *     <!-- corpus:proc
 *     origen: extracted
 *     fuente: 04dd0000-1111-2222-3333-444455556666
 *     pagina: 3
 *     verificada: si
 *     evidencia: |Ignacia Belén Roa Escobar · i.roa@ejemplo.cl
 *     evidencia: |+56 9 3126 5960
 *     extra: dateMissing = true
 *     -->
 *
 * Sintaxis, y por qué exactamente esta:
 *  · MISMA gramática de campos que fuera del comentario (`clave: valor`, forma
 *    literal `|`, continuaciones). Un formato con dos gramáticas es dos
 *    formatos, y el segundo siempre es el que se rompe.
 *  · La evidencia multilínea se escribe con continuaciones `|`: cada línea del
 *    snippet es una línea del fichero, así que git la diffea línea a línea.
 *    base64 habría cabido en una línea y habría convertido cualquier cambio en
 *    un borrón ilegible.
 *  · EL BLOQUE VA DELANTE del item que describe. Es la única regla sin casos
 *    especiales: «describe al siguiente item que se cree». Detrás habría que
 *    decidir a qué se pega cuando la entrada no tiene `###` (el CONTACTO no lo
 *    lleva) y esa ambigüedad se paga en bugs.
 *  · AUSENTE = item nuevo escrito a mano: origin `manual`, evidence_verified
 *    TRUE. No es optimismo: el propio fichero ES la fuente, y no hay ningún
 *    raw_text contra el que verificar nada.
 *  · Las banderas derivadas de fecha (dateStart, dateMissing…) y cualquier clave
 *    que el formato no sepa escribir viajan como `extra: clave = <json>`. Son
 *    metadatos, no algo que un humano escriba, y el JSON conserva el TIPO
 *    exacto (true no es "true").
 */
export const MARCA_PROC = "corpus:proc";
/** Prefijo de los comentarios internos del formato: se ignoran sin ruido. */
export const MARCA_INTERNA = "corpus:";

export const CAMPOS_PROC = {
  origen: ["origen", "origin"],
  fuente: ["fuente", "source", "source_id", "fuente_id"],
  pagina: ["pagina", "page", "evidencia-pagina"],
  verificada: ["verificada", "verified", "evidencia-verificada"],
  evidencia: ["evidencia", "evidence", "snippet", "evidencia-fragmento"],
  extra: ["extra", "extras"],
} as const;

/** Valores del enum item_origin. Otro valor se conserva, pero se avisa. */
export const ORIGENES = new Set(["extracted", "manual", "api", "ai_rephrased", "ai_translated"]);

export function leerBooleano(v: string): boolean | null {
  const n = normalizarClave(v);
  if (["si", "sí", "true", "yes", "1", "verdadero"].includes(n)) return true;
  if (["no", "false", "0", "falso"].includes(n)) return false;
  return null;
}

/* ── DATA_KEYS, duplicada a propósito ─────────────────────────────────────── */

/**
 * Espejo de DATA_KEYS (src/lib/db/item-data.ts). Está duplicada porque allí es
 * un const de módulo sin export, y ese fichero es frontera de otro bloque: no se
 * toca. La divergencia no queda al azar — tests/corpus-md-parser.test.ts lee el
 * FUENTE de item-data.ts y falla si las dos listas dejan de coincidir.
 *
 * Sirve para AVISAR, no para filtrar: una clave desconocida se conserva igual
 * (el master la rechazaría con un 400, y eso el humano tiene que saberlo ANTES).
 */
export const CLAVES_DATA = new Set([
  "name", "label", "email", "phone", "location", "links", "photo", "qr",
  "text",
  "title", "company", "dates",
  "degree", "institution",
  "description", "url",
  "issuer", "language", "level",
  "role", "org", "relation",
  "group", "items", "sourceContext",
  "dateStart", "dateEnd", "dateCurrent", "dateMissing", "dateInvalid", "dateByHuman",
]);

/* ── Fechas: azúcar desde:/hasta: ─────────────────────────────────────────── */

/** Marcas de «sigue en curso». Solo para el azúcar de entrada. */
const EN_CURSO = ["hoy", "actual", "actualidad", "presente", "present", "current", "now", "ongoing", "en curso", "a la fecha", "to date"];

export function esEnCurso(texto: string): boolean {
  const n = normalizarClave(texto);
  return EN_CURSO.some((p) => n === p || n.includes(p));
}

export interface FechasNormalizadas {
  /** el texto que va a `dates`, compuesto con los textos LITERALES del humano. */
  dates: string;
  banderas: Record<string, unknown>;
  /** partes que no se entendieron: se preguntan, no se infieren. */
  noEntendidas: string[];
}

/**
 * Normaliza desde:/hasta: SIN inventar. El texto de `dates` se compone con lo
 * que escribió la persona (nunca con la fecha reinterpretada), y las banderas
 * salen de normalizeDateRange, el MISMO normalizador que usa el resto del
 * producto: si aquí fuéramos más estrictos que la ingesta, el mismo CV se
 * comportaría distinto según por dónde entrara.
 */
export function normalizarDesdeHasta(desde: string | null, hasta: string | null): FechasNormalizadas {
  const banderas: Record<string, unknown> = {};
  const noEntendidas: string[] = [];
  const d = (desde ?? "").trim();
  const h = (hasta ?? "").trim();

  if (d && h) {
    const dates = `${d} - ${h}`;
    const r = normalizeDateRange(dates);
    if (r.invalid) {
      banderas.dateInvalid = r.invalid;
      return { dates, banderas, noEntendidas };
    }
    if (r.start) banderas.dateStart = r.start;
    else noEntendidas.push(d);
    if (esEnCurso(h)) banderas.dateCurrent = true;
    else if (r.end) banderas.dateEnd = r.end;
    else noEntendidas.push(h);
    return { dates, banderas, noEntendidas };
  }

  if (d) {
    // Solo inicio. NO se deduce que siga en curso: eso sería inventar.
    const r = normalizeDateRange(d);
    if (r.start) banderas.dateStart = r.start;
    else noEntendidas.push(d);
    return { dates: d, banderas, noEntendidas };
  }

  if (h) {
    if (esEnCurso(h)) {
      banderas.dateCurrent = true;
    } else {
      const r = normalizeDateRange(h);
      if (r.start) banderas.dateEnd = r.start;
      else noEntendidas.push(h);
    }
    return { dates: h, banderas, noEntendidas };
  }

  return { dates: "", banderas, noEntendidas };
}

/** La sugerencia que acompaña a una fecha que no se entendió. */
export const SUGERENCIA_FECHA = "Usa AAAA-MM (p. ej. 2025-03), AAAA, o «actualidad» si sigue en curso.";
