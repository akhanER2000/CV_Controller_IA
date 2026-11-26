/**
 * REGLAS POR VARIANTE (DA-R1) — lo que el usuario fija para UNA variante y que
 * nada rompe: ni «Crear con IA», ni «Analizar la oferta», ni «Afinar», ni «Ajustar».
 *
 * Vive en cv_variants.reglas (jsonb, 0012). Este módulo es PURO (sin BD ni red):
 *  · obtenerReglas(variant) → Reglas con valores por defecto (nunca lanza);
 *  · validarReglas(raw)     → lo que llega de un cliente, saneado o con errores;
 *  · aplicarReglasAlDocumento(data, reglas) → el ResumeData que se pinta: sin las
 *    secciones ocultas, sin foto si se pidió, y sin ninguna línea que nombre un
 *    término excluido (en los dos idiomas). Lo usan el servidor (el PDF que se
 *    descarga) y el espejo del editor (la vista previa): el mismo documento;
 *  · terminoExcluidoEn(texto, reglas) → el candado de los textos de IA. Se SUMA a
 *    preservesFacts (verify.ts no se toca): un texto que nombre un término
 *    excluido no se aplica;
 *  · cumpleReglas(resume, reglas, ctx) → lo que se puede comprobar, incumplido.
 *
 * Cada regla es «obligatoria» (se hace cumplir y bloquea lo que la rompa) o
 * «preferida» (viaja en el prompt y se avisa, pero no se fuerza).
 */
import type { ResumeData, I18n } from "./resume";
import { ALL_SECTION_IDS, type SectionId } from "./templates";

export type Fuerza = "obligatoria" | "preferida";
export type ClaveRegla =
  | "paginasMax"
  | "incluirSiempre"
  | "excluirTerminos"
  | "ocultarSecciones"
  | "sinFoto"
  | "idioma";
export const CLAVES_REGLA: readonly ClaveRegla[] = [
  "paginasMax", "incluirSiempre", "excluirTerminos", "ocultarSecciones", "sinFoto", "idioma",
];

export interface Reglas {
  paginasMax: 1 | 2 | 3 | null;
  /** ids de items del MASTER que ningún recorte ni IA quita de la variante. */
  incluirSiempre: string[];
  excluirTerminos: string[];
  ocultarSecciones: SectionId[];
  sinFoto: boolean;
  idioma: "es" | "en" | null;
  notas: string;
  /** obligatoria por defecto. */
  fuerza: Record<ClaveRegla, Fuerza>;
}

export const FUERZA_POR_DEFECTO: Record<ClaveRegla, Fuerza> = {
  paginasMax: "obligatoria",
  incluirSiempre: "obligatoria",
  excluirTerminos: "obligatoria",
  ocultarSecciones: "obligatoria",
  sinFoto: "obligatoria",
  idioma: "obligatoria",
};

export const REGLAS_VACIAS: Reglas = {
  paginasMax: null,
  incluirSiempre: [],
  excluirTerminos: [],
  ocultarSecciones: [],
  sinFoto: false,
  idioma: null,
  notas: "",
  fuerza: { ...FUERZA_POR_DEFECTO },
};

export const MAX_TERMINOS = 30;
export const MAX_TERMINO_LEN = 60;
export const MAX_NOTAS_LEN = 600;
export const MAX_INCLUIR = 60;

const SECCIONES = new Set<string>(ALL_SECTION_IDS);

const cadenas = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function unicos(xs: string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = normalizarTexto(x);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    out.push(x);
  }
  return out;
}

/** Saneado tolerante: lo que no se entiende cae al valor por defecto. Nunca lanza. */
export function normalizarReglas(raw: unknown): Reglas {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const pm = o.paginasMax;
  const fz = o.fuerza && typeof o.fuerza === "object" ? (o.fuerza as Record<string, unknown>) : {};
  const fuerza = { ...FUERZA_POR_DEFECTO };
  for (const k of CLAVES_REGLA) if (fz[k] === "preferida" || fz[k] === "obligatoria") fuerza[k] = fz[k] as Fuerza;
  return {
    paginasMax: pm === 1 || pm === 2 || pm === 3 ? pm : null,
    incluirSiempre: [...new Set(cadenas(o.incluirSiempre).map((s) => s.trim()).filter(Boolean))].slice(0, MAX_INCLUIR),
    excluirTerminos: unicos(
      cadenas(o.excluirTerminos).map((s) => s.trim().slice(0, MAX_TERMINO_LEN)).filter((s) => s.length > 0),
    ).slice(0, MAX_TERMINOS),
    ocultarSecciones: [...new Set(cadenas(o.ocultarSecciones).filter((s) => SECCIONES.has(s)))] as SectionId[],
    sinFoto: o.sinFoto === true,
    idioma: o.idioma === "es" || o.idioma === "en" ? o.idioma : null,
    notas: typeof o.notas === "string" ? o.notas.trim().slice(0, MAX_NOTAS_LEN) : "",
    fuerza,
  };
}

/** Las reglas de una variante (fila de cv_variants o lo que traiga `reglas`). */
export function obtenerReglas(variant: { reglas?: unknown } | null | undefined): Reglas {
  return normalizarReglas(variant?.reglas);
}

export function hayReglas(r: Reglas): boolean {
  return (
    r.paginasMax !== null ||
    r.incluirSiempre.length > 0 ||
    r.excluirTerminos.length > 0 ||
    r.ocultarSecciones.length > 0 ||
    r.sinFoto ||
    r.idioma !== null ||
    r.notas !== ""
  );
}

export type ValidacionReglas = { ok: true; reglas: Reglas } | { ok: false; errores: string[] };

/**
 * Lo que llega de un cliente. Estricto donde un error silencioso engañaría (un
 * máximo de páginas fuera de rango, una sección que no existe, un id que no es del
 * master); el resto se sanea como en normalizarReglas.
 */
export function validarReglas(raw: unknown, opts: { masterIds?: ReadonlySet<string> } = {}): ValidacionReglas {
  if (raw == null) return { ok: true, reglas: { ...REGLAS_VACIAS, fuerza: { ...FUERZA_POR_DEFECTO } } };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errores: ["Las reglas deben ser un objeto."] };
  const o = raw as Record<string, unknown>;
  const errores: string[] = [];
  if (o.paginasMax != null && o.paginasMax !== 1 && o.paginasMax !== 2 && o.paginasMax !== 3)
    errores.push("El máximo de páginas debe ser 1, 2 o 3.");
  for (const s of cadenas(o.ocultarSecciones))
    if (!SECCIONES.has(s)) errores.push(`«${s}» no es una sección del documento.`);
  if (o.idioma != null && o.idioma !== "es" && o.idioma !== "en") errores.push("El idioma debe ser es o en.");
  if (cadenas(o.excluirTerminos).some((t) => t.trim().length > MAX_TERMINO_LEN))
    errores.push(`Un término excluido no puede pasar de ${MAX_TERMINO_LEN} caracteres.`);
  if (opts.masterIds) {
    const fuera = cadenas(o.incluirSiempre).filter((id) => !opts.masterIds!.has(id));
    if (fuera.length) errores.push(`${fuera.length} item(s) de «Incluir siempre» no están en tu master.`);
  }
  if (errores.length) return { ok: false, errores };
  return { ok: true, reglas: normalizarReglas(raw) };
}

// ── Términos ──────────────────────────────────────────────────────────────────
/** Minúsculas y sin tildes: «Unity», «unity» y «ÚNITY» son el mismo término. */
export function normalizarTexto(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * ¿`texto` nombra `termino`? Por palabra, no por subcadena: «Unity» está en
 * «Unity3D» y en «Unity, C#» pero NO en «Community»; «Java» no está en
 * «JavaScript». Una letra pegada a cualquiera de los dos lados lo anula.
 */
export function contieneTermino(texto: string, termino: string): boolean {
  const t = normalizarTexto(termino);
  if (!t) return false;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapar(t)}(?![\\p{L}])`, "u");
  return re.test(normalizarTexto(texto));
}

/** Los términos que el documento NO puede nombrar (solo los obligatorios se fuerzan). */
function terminosForzados(r: Reglas): string[] {
  return r.fuerza.excluirTerminos === "obligatoria" ? r.excluirTerminos : [];
}

/** El primer término excluido (obligatorio) que nombra el texto, o null. El candado de la IA. */
export function terminoExcluidoEn(texto: string, reglas: Reglas): string | null {
  for (const t of terminosForzados(reglas)) if (contieneTermino(texto, t)) return t;
  return null;
}

/** Como terminoExcluidoEn, pero con CUALQUIER término (también los preferidos): para avisar. */
function cualquierTerminoEn(texto: string, reglas: Reglas): string | null {
  for (const t of reglas.excluirTerminos) if (contieneTermino(texto, t)) return t;
  return null;
}

// ── Aplicar al documento ──────────────────────────────────────────────────────
const textoDe = (v: I18n | string | undefined): string =>
  v == null ? "" : typeof v === "string" ? v : `${v.es}\n${v.en}`;

/** Quita las frases que nombran un término (el resumen no se descarta entero). */
function sinFrasesCon(s: string, terminos: string[]): string {
  if (!terminos.some((t) => contieneTermino(s, t))) return s;
  return s
    .split(/(?<=[.!?…])\s+/)
    .filter((f) => !terminos.some((t) => contieneTermino(f, t)))
    .join(" ")
    .trim();
}

/** Una lista «C#, Unity, Godot» sin los elementos que nombran un término. */
function listaSin(s: string, terminos: string[]): string {
  if (!terminos.some((t) => contieneTermino(s, t))) return s;
  return s
    .split(/\s*[,;·•|]\s*/)
    .filter((x) => x.trim() && !terminos.some((t) => contieneTermino(x, t)))
    .join(", ");
}

/**
 * El documento tal como lo permiten las reglas. Determinista e idempotente.
 *  · secciones ocultas: su contenido fuera y `ocultas` para que el render no
 *    rotule ni las que se pintan siempre (resumen y habilidades);
 *  · sinFoto: sin foto;
 *  · términos excluidos (obligatorios): fuera toda entrada que los nombre, en
 *    cualquiera de los dos idiomas; del resumen, solo la frase; de una lista de
 *    habilidades, solo el elemento.
 */
export function aplicarReglasAlDocumento(data: ResumeData, reglas: Reglas): ResumeData {
  const ocultas = reglas.fuerza.ocultarSecciones === "obligatoria" ? reglas.ocultarSecciones : [];
  const terminos = terminosForzados(reglas);
  const sinFoto = reglas.sinFoto && reglas.fuerza.sinFoto === "obligatoria";
  if (!ocultas.length && !terminos.length && !sinFoto) return data;

  const oculta = (id: SectionId) => ocultas.includes(id);
  const nombra = (...vs: (I18n | string | undefined)[]) =>
    terminos.length > 0 && vs.some((v) => terminos.some((t) => contieneTermino(textoDe(v), t)));
  const i18n = (v: I18n, f: (s: string) => string): I18n => ({ es: f(v.es), en: f(v.en) });

  const out: ResumeData = {
    ...data,
    basics: {
      ...data.basics,
      label: nombra(data.basics.label) ? { es: "", en: "" } : data.basics.label,
      links: data.basics.links.filter((l) => !nombra(typeof l === "string" ? l : `${l.label ?? ""} ${l.url}`)),
      summary: oculta("summary") ? { es: "", en: "" } : i18n(data.basics.summary, (s) => sinFrasesCon(s, terminos)),
    },
    photo: sinFoto ? undefined : data.photo,
    skills: oculta("skills")
      ? []
      : data.skills
          .filter((s) => !nombra(s.group))
          .map((s) => ({ ...s, items: i18n(s.items, (x) => listaSin(x, terminos)) }))
          .filter((s) => (s.items.es || s.items.en).trim() !== ""),
    work: oculta("work")
      ? []
      : data.work
          .filter((w) => !nombra(w.company, w.title, w.location))
          .map((w) => ({ ...w, bullets: w.bullets.filter((b) => !nombra(b)) })),
    projects: oculta("projects") ? [] : data.projects.filter((p) => !nombra(p)),
    education: oculta("education") ? [] : data.education.filter((e) => !nombra(e.title, e.org)),
    certifications: oculta("certifications") ? [] : data.certifications?.filter((c) => !nombra(c.title, c.org)),
    languages: oculta("languages") ? [] : data.languages?.filter((l) => !nombra(l)),
    publications: oculta("publications") ? [] : data.publications?.filter((p) => !nombra(p)),
    references: oculta("references") ? [] : data.references?.filter((r) => !nombra(r)),
  };
  if (ocultas.length) out.ocultas = [...ocultas];
  return out;
}

// ── Comprobar ─────────────────────────────────────────────────────────────────
export interface Incumplimiento {
  regla: ClaveRegla;
  fuerza: Fuerza;
  motivo: string;
}

export interface ContextoCumplimiento {
  /** páginas MEDIDAS del PDF, si se midieron. */
  paginas?: number;
  /** ids del master de los items VISIBLES en la variante. */
  idsVisibles?: ReadonlySet<string>;
  /** nombre legible de un item del master, para el motivo. */
  nombreDe?: (id: string) => string;
  /** idioma en que se genera el documento. */
  idioma?: "es" | "en";
}

/** Todo el texto que se puede pintar de una sección (los dos idiomas). */
function textoSeccion(data: ResumeData, id: SectionId): string {
  const j = (xs: (I18n | string | undefined)[]) => xs.map(textoDe).join("\n");
  switch (id) {
    case "summary": return textoDe(data.basics.summary);
    case "skills": return j(data.skills.flatMap((s) => [s.group, s.items]));
    case "work": return j(data.work.flatMap((w) => [w.company, w.title, w.location, w.dates, ...w.bullets]));
    case "projects": return j(data.projects);
    case "education": return j(data.education.flatMap((e) => [e.title, e.org, e.dates]));
    case "certifications": return j((data.certifications ?? []).flatMap((c) => [c.title, c.org, c.dates]));
    case "languages": return j(data.languages ?? []);
    case "publications": return j(data.publications ?? []);
    case "references": return j(data.references ?? []);
  }
}

/** El texto entero del documento (cabecera incluida). */
export function textoDelDocumento(data: ResumeData): string {
  const b = data.basics;
  const links = b.links.map((l) => (typeof l === "string" ? l : `${l.label ?? ""} ${l.url}`));
  return [b.name, textoDe(b.label), textoDe(b.location), ...links, ...ALL_SECTION_IDS.map((id) => textoSeccion(data, id))].join("\n");
}

/**
 * Lo comprobable, incumplido: páginas medidas por encima del máximo, término
 * excluido presente, sección oculta con contenido visible, foto con «sin foto»,
 * item obligatorio ausente de la variante, idioma distinto del pedido.
 * Lista vacía ⇒ cumple todo lo que se pudo comprobar.
 */
export function cumpleReglas(resume: ResumeData, reglas: Reglas, ctx: ContextoCumplimiento = {}): Incumplimiento[] {
  const out: Incumplimiento[] = [];
  const f = reglas.fuerza;
  if (reglas.paginasMax !== null && ctx.paginas != null && ctx.paginas > reglas.paginasMax) {
    out.push({
      regla: "paginasMax",
      fuerza: f.paginasMax,
      motivo: `El PDF mide ${ctx.paginas} página${ctx.paginas === 1 ? "" : "s"}; el máximo es ${reglas.paginasMax}.`,
    });
  }
  const texto = textoDelDocumento(resume);
  for (const t of reglas.excluirTerminos) {
    if (contieneTermino(texto, t)) out.push({ regla: "excluirTerminos", fuerza: f.excluirTerminos, motivo: `El documento menciona «${t}».` });
  }
  const ocultasPintadas = new Set(resume.ocultas ?? []);
  for (const id of reglas.ocultarSecciones) {
    if (!ocultasPintadas.has(id) && textoSeccion(resume, id).trim() !== "")
      out.push({ regla: "ocultarSecciones", fuerza: f.ocultarSecciones, motivo: `La sección «${id}» se ve en el documento.` });
  }
  if (reglas.sinFoto && resume.photo) out.push({ regla: "sinFoto", fuerza: f.sinFoto, motivo: "El documento lleva foto." });
  if (ctx.idsVisibles) {
    for (const id of reglas.incluirSiempre) {
      if (!ctx.idsVisibles.has(id))
        out.push({
          regla: "incluirSiempre",
          fuerza: f.incluirSiempre,
          motivo: `«${ctx.nombreDe?.(id) ?? id}» no está visible en la variante.`,
        });
    }
  }
  if (reglas.idioma && ctx.idioma && ctx.idioma !== reglas.idioma)
    out.push({ regla: "idioma", fuerza: f.idioma, motivo: `El documento sale en ${ctx.idioma}; la regla pide ${reglas.idioma}.` });
  return out;
}

/** El estado de UNA regla activa, para la pestaña «Reglas» del editor. */
export interface EstadoRegla {
  regla: ClaveRegla;
  fuerza: Fuerza;
  /** null ⇒ aún no se puede comprobar (p. ej. el PDF no se ha medido). */
  cumple: boolean | null;
  /** por qué cumple o por qué no, en una frase. */
  motivo: string;
}

/**
 * Cada regla ACTIVA con su estado. `antes` es el documento sin reglas y `despues`
 * el que se pinta: así una regla que cumple dice también lo que hizo («se quitan
 * 3 líneas que nombran Unity») en vez de un «cumple» mudo.
 */
export function estadoDeReglas(
  antes: ResumeData,
  despues: ResumeData,
  reglas: Reglas,
  ctx: ContextoCumplimiento = {},
): EstadoRegla[] {
  const fallos = cumpleReglas(despues, reglas, ctx);
  const falla = (k: ClaveRegla, extra?: (i: Incumplimiento) => boolean) =>
    fallos.filter((i) => i.regla === k && (!extra || extra(i)));
  const out: EstadoRegla[] = [];
  const f = reglas.fuerza;
  if (reglas.paginasMax !== null) {
    const x = falla("paginasMax")[0];
    out.push({
      regla: "paginasMax",
      fuerza: f.paginasMax,
      cumple: x ? false : ctx.paginas != null ? true : null,
      motivo: x?.motivo ?? (ctx.paginas != null
        ? `El PDF mide ${ctx.paginas} de ${reglas.paginasMax} página${reglas.paginasMax === 1 ? "" : "s"} como máximo.`
        : "Se comprobará al medir el PDF."),
    });
  }
  const textoAntes = textoDelDocumento(antes);
  for (const t of reglas.excluirTerminos) {
    const x = falla("excluirTerminos", (i) => i.motivo.includes(`«${t}»`))[0];
    out.push({
      regla: "excluirTerminos",
      fuerza: f.excluirTerminos,
      cumple: !x,
      motivo: x?.motivo ?? (contieneTermino(textoAntes, t)
        ? `«${t}» estaba en la variante: se quita del documento.`
        : `«${t}» no aparece en el documento.`),
    });
  }
  for (const id of reglas.ocultarSecciones) {
    const x = falla("ocultarSecciones", (i) => i.motivo.includes(`«${id}»`))[0];
    out.push({
      regla: "ocultarSecciones",
      fuerza: f.ocultarSecciones,
      cumple: !x,
      motivo: x?.motivo ?? `La sección «${NOMBRE_SECCION[id]}» no se pinta.`,
    });
  }
  if (reglas.sinFoto) {
    const x = falla("sinFoto")[0];
    out.push({
      regla: "sinFoto",
      fuerza: f.sinFoto,
      cumple: !x,
      motivo: x?.motivo ?? (antes.photo ? "Tienes foto en la variante, pero no sale en el PDF." : "El documento va sin foto."),
    });
  }
  for (const id of reglas.incluirSiempre) {
    const nombre = ctx.nombreDe?.(id) ?? id;
    const x = falla("incluirSiempre", (i) => i.motivo.includes(`«${nombre}»`))[0];
    out.push({
      regla: "incluirSiempre",
      fuerza: f.incluirSiempre,
      cumple: !x,
      motivo: x?.motivo ?? `«${nombre}» está en la variante y ningún ajuste lo quita.`,
    });
  }
  if (reglas.idioma) {
    const x = falla("idioma")[0];
    out.push({
      regla: "idioma",
      fuerza: f.idioma,
      cumple: x ? false : ctx.idioma ? true : null,
      motivo: x?.motivo ?? `El CV debe salir en ${reglas.idioma === "es" ? "español" : "inglés"}; la IA lo recibe en el prompt.`,
    });
  }
  return out;
}

/** ¿Un item obligatorio? Ningún recorte ni IA lo quita. */
export function esObligatorio(reglas: Reglas, masterItemId: string): boolean {
  return reglas.incluirSiempre.includes(masterItemId);
}

/** Un término excluido presente en un texto, aunque la regla sea solo preferida (para avisar). */
export function terminoAvisableEn(texto: string, reglas: Reglas): string | null {
  return cualquierTerminoEn(texto, reglas);
}

// ── Prompt ───────────────────────────────────────────────────────────────────
const NOMBRE_SECCION: Record<SectionId, string> = {
  summary: "resumen", skills: "habilidades", work: "experiencia", projects: "proyectos",
  education: "formación", certifications: "certificaciones", languages: "idiomas",
  publications: "publicaciones", references: "referencias",
};

/**
 * Las reglas como bloque de texto para el prompt de la IA. Vacío si no hay reglas.
 * La salida se revisa igual contra ellas antes de aplicarse: el prompt orienta, el
 * candado decide.
 */
export function reglasParaPrompt(r: Reglas, nombreDe?: (id: string) => string): string {
  if (!hayReglas(r)) return "";
  const et = (k: ClaveRegla) => (r.fuerza[k] === "obligatoria" ? "OBLIGATORIA" : "preferida");
  const l: string[] = [];
  if (r.excluirTerminos.length)
    l.push(`- [${et("excluirTerminos")}] No menciones NUNCA: ${r.excluirTerminos.map((t) => `«${t}»`).join(", ")} (ni en textos reescritos ni en el resumen).`);
  if (r.incluirSiempre.length)
    l.push(`- [${et("incluirSiempre")}] Incluye SIEMPRE estos items (ids): ${r.incluirSiempre.map((id) => `[${id}]${nombreDe ? ` ${nombreDe(id)}` : ""}`).join(", ")}.`);
  if (r.ocultarSecciones.length)
    l.push(`- [${et("ocultarSecciones")}] No uses las secciones: ${r.ocultarSecciones.map((s) => NOMBRE_SECCION[s]).join(", ")}.`);
  if (r.paginasMax) l.push(`- [${et("paginasMax")}] Máximo ${r.paginasMax} página${r.paginasMax === 1 ? "" : "s"}: sé conciso.`);
  if (r.sinFoto) l.push(`- [${et("sinFoto")}] Sin foto.`);
  if (r.idioma) l.push(`- [${et("idioma")}] Idioma del CV: ${r.idioma === "es" ? "español" : "inglés"}.`);
  if (r.notas) l.push(`- Nota del usuario: ${r.notas}`);
  return `REGLAS DE ESTA VARIANTE (el usuario las fijó; las OBLIGATORIAS no se rompen):\n${l.join("\n")}`;
}

export { NOMBRE_SECCION };
