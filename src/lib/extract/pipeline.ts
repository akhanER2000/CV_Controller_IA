import { verifyEvidence, normalize } from "../verify";
import { detectAndClassify } from "./urls";
import { detectDuplicates, titlesClearlyDifferent, type DedupItem, type DuplicateSignal, type SuspicionLevel } from "./dedup";
import { classifyBulletText, classifyProjectShape, linkedInSkillLines, normalizeLine } from "./classify";
import { normalizeDateRange } from "./dates";
import type { Extractor, ResumenLectura } from "./llm";
import type { Fuente } from "./segmentar";
import type { ConsumoIA } from "../db/telemetria";
import type { GithubFetcher } from "./github";
import type { StagedRow, ImportResult, EvidenceLevel } from "./types";

/**
 * El orquestador de "pega lo que tengas" (prompt §3). Todo lo externo es
 * INYECTABLE (extract, fetchGithub, fetchWeb) → el pipeline se prueba entero,
 * de forma determinista, sin LLM ni red.
 *
 * Flujo: detectar URLs → GitHub (dato duro, sin IA) · web (Jina) · LinkedIn
 * (honesto, no legible) → armar raw_text → extraer troceado → VERIFICAR la
 * evidencia de cada item contra raw_text → staged. Nada entra al master aquí:
 * esto solo puebla el staging (§4.1).
 */

export interface ImportInput {
  pastedText: string;
  /** archivos ya convertidos a texto (raw_text por fuente), con su etiqueta */
  files?: { label: string; text: string }[];
}

/* ============================================================================
   ★ ATRIBUCIÓN POR FUENTE — de qué documento salió CADA item
   ============================================================================
   EL FALLO QUE ARREGLA. El pipeline concatena el texto pegado, cada archivo y
   cada portfolio en UN solo `raw` y se lo da al extractor. Hasta hoy, TODOS los
   items volvían con `sourceLabel: "texto pegado"` cableado a mano, así que el
   writer los colgaba de una única fila kind='paste'. Consecuencia real, medida
   en la base: 14 capturas de LinkedIn con su transcripción guardada (3.479,
   2.711, 2.314… caracteres) y «extraída · 0 ítems» en la tarjeta, mientras una
   sola fila de texto pegado se llevaba los 83 ítems. No fue la visión: fue la
   ATRIBUCIÓN. El dato existía y se le colgaba a otra fila.

   CÓMO SE RESUELVE, Y POR QUÉ ASÍ. El extractor no dice de qué trozo sacó cada
   cosa —no se le puede creer aunque lo dijera (§4.4: nada de auto-reporte)—,
   pero SÍ cita un fragmento literal. Ese fragmento es un HECHO comprobable: se
   busca en el texto de cada fuente por separado, exactamente con la misma
   normalización que usa la verificación de evidencia. La fuente que contiene la
   cita es la fuente del item. No se adivina: se comprueba.

   Y CUANDO NO SE PUEDE, SE DICE. Cada item se lleva CÓMO se atribuyó
   (`_sourceComo`): por evidencia literal, por coincidencia difusa, porque no
   había más que una fuente, o «sin-resolver» cuando la cita no aparece en
   ninguna (el caso honesto de una evidencia que el modelo no copió bien). Una
   atribución sin procedencia sería otro número sin fuente.
   ============================================================================ */

/** Cómo se decidió la fuente de un item. Viaja en data._sourceComo (metadato de
 *  staging: se limpia al promover, como todo lo que empieza por `_`). */
export type ComoSeAtribuyo = "unica" | "evidencia" | "difusa" | "sin-resolver";

export interface Atribucion {
  /** etiqueta de la fuente a la que se atribuye el item */
  etiqueta: string;
  como: ComoSeAtribuyo;
  /** OTRAS fuentes donde el mismo texto también aparece literal. No se elige por
   *  el usuario ni se esconde: el mismo hecho contado por dos fuentes es
   *  precisamente lo que dispara la sospecha de duplicado. */
  tambien: string[];
}

/** Una fuente del import, con su texto tal cual entró al `raw` combinado. */
export interface ParteFuente {
  etiqueta: string;
  texto: string;
}

interface Segmento {
  etiqueta: string;
  norm: string;
  /** tokens del segmento; se calculan solo si hace falta el fallback difuso */
  tokens: Set<string> | null;
}

/** Un texto más corto que esto no identifica nada: «Go» aparece en cualquier
 *  documento. Por debajo del umbral se pasa al siguiente candidato en vez de
 *  atribuir por una coincidencia que no significa nada. */
const MIN_ATRIBUIR = 5;
/** El MISMO umbral que verifyEvidence para el solape de tokens: una sola
 *  definición de «esto se parece bastante». */
const UMBRAL_DIFUSO = 0.7;

export interface Atribuidor {
  /** etiquetas registradas, en el orden en que entraron al raw */
  etiquetas: string[];
  /** Resuelve la fuente de un item con sus textos, del MÁS identificativo al
   *  menos (evidencia citada primero, luego título/empresa, etc.). */
  de(...textos: (string | null | undefined)[]): Atribucion;
}

/**
 * Construye el atribuidor de una ingesta. PURO y determinista: se prueba entero
 * sin LLM, sin red y sin base — que es como se prueba que un item de la captura
 * 7 acaba en la fila de la captura 7 y no en otra.
 */
export function construirAtribuidor(partes: ParteFuente[]): Atribuidor {
  const segs: Segmento[] = partes
    .filter((p) => p.texto.trim())
    .map((p) => ({ etiqueta: p.etiqueta, norm: normalize(p.texto), tokens: null }));

  // Con cero fuentes registradas la etiqueta cae a la del texto pegado: es la
  // fila principal de la ingesta, la única que seguro existe.
  const porDefecto = segs[0]?.etiqueta ?? "texto pegado";
  const etiquetas = segs.map((s) => s.etiqueta);

  const tokensDe = (s: Segmento): Set<string> => (s.tokens ??= new Set(s.norm.split(/[^a-z0-9]+/)));

  function de(...textos: (string | null | undefined)[]): Atribucion {
    // Una sola fuente: no hay nada que decidir y decir «verificado por evidencia»
    // sería adornar. Se dice lo que es.
    if (segs.length <= 1) return { etiqueta: porDefecto, como: "unica", tambien: [] };

    // 1 · coincidencia LITERAL (normalizada), candidato a candidato.
    for (const t of textos) {
      const n = normalize(t ?? "");
      if (n.length < MIN_ATRIBUIR) continue;
      const dentro = segs.filter((s) => s.norm.includes(n));
      if (dentro.length) {
        return {
          etiqueta: dentro[0]!.etiqueta,
          como: "evidencia",
          tambien: dentro.slice(1).map((s) => s.etiqueta),
        };
      }
    }

    // 2 · fallback DIFUSO sobre el primer candidato con tokens suficientes. Es el
    //     caso del modelo que cita casi bien (una tilde, una coma de más).
    for (const t of textos) {
      const n = normalize(t ?? "");
      if (n.length < MIN_ATRIBUIR) continue;
      const toks = n.split(/[^a-z0-9]+/).filter((x) => x.length > 2);
      if (!toks.length) continue;
      let mejor = 0;
      const puntos = segs.map((s) => {
        const src = tokensDe(s);
        const score = toks.filter((x) => src.has(x)).length / toks.length;
        if (score > mejor) mejor = score;
        return { etiqueta: s.etiqueta, score };
      });
      if (mejor >= UMBRAL_DIFUSO) {
        const empatados = puntos.filter((p) => p.score === mejor).map((p) => p.etiqueta);
        return { etiqueta: empatados[0]!, como: "difusa", tambien: empatados.slice(1) };
      }
    }

    // 3 · no se pudo. Se atribuye a la fuente principal Y SE DICE que no se
    //     resolvió: inventar una procedencia sería peor que admitir la duda.
    return { etiqueta: porDefecto, como: "sin-resolver", tambien: [] };
  }

  return { etiquetas, de };
}

/**
 * Cuántos items quedó atribuido a cada etiqueta. PURO: es el recuento que
 * permite a la ruta detectar una fuente que se leyó y no produjo NADA — y decir
 * el motivo en vez de pintarla de verde con un cero al lado.
 */
export function itemsPorEtiqueta(rows: StagedRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.sourceLabel] = (out[r.sourceLabel] ?? 0) + 1;
  return out;
}

/** Los metadatos `_` que la atribución deja en el item. Vacío en el caso trivial
 *  (una sola fuente): no se ensucia el staging con ruido que no informa. */
function marcaAtribucion(a: Atribucion): Record<string, unknown> {
  if (a.como === "unica") return {};
  return {
    _sourceComo: a.como,
    ...(a.tambien.length ? { _sourceTambien: a.tambien } : {}),
  };
}

/* ============================================================================
   ★ CONSOLIDACIÓN EN ORIGEN — el mismo hecho, contado tres veces, en UNA tarjeta
   ============================================================================
   EL PROBLEMA, que está en el documento a PROPÓSITO. El dossier real describe
   cada trabajo desde tres ángulos y lo marca: [LI] lo que dice LinkedIn, [PF] lo
   que dice el portfolio, [CU] lo que contestó el usuario en el cuestionario. Para
   un humano eso es riqueza. Para el extractor, que lee por ventanas y sin
   memoria, son TRES cargos. Y el staging enseñaba tres tarjetas: la primera
   limpia y las otras dos marcadas «posible duplicado». El usuario tenía que
   comparar tres textos a mano para decidir que eran el mismo empleo.

   QUÉ HACE ESTO, Y SOBRE TODO QUÉ NO HACE. Se presentan FUSIONADAS: una sola
   tarjeta con los campos completados entre las versiones (gana el primer valor no
   vacío, así la que traía la fecha la aporta) y con TODOS sus orígenes guardados
   en `data._origenes`. La tarjeta sigue marcada como POSIBLE DUPLICADO con su
   motivo: es una propuesta, no un veredicto.

   ⚠ NADA SE DESCARTA. Cada versión absorbida deja su cargo, su empresa, sus
     fechas, su cita literal y su etiqueta de fuente en `_origenes`. Las viñetas
     de las tres versiones se reparentan a la tarjeta superviviente. Si el usuario
     decide que no eran lo mismo, la información para deshacerlo está ahí.

   ⚠ NO HAY DETECTOR NUEVO. Se usa `detectDuplicates` (dedup.ts), el mismo que ya
     marcaba las sospechas, con dos candados que estrechan lo que se fusiona:

       1 · SOLO NIVEL «alta». Que es exactamente lo que pide el encargo: misma
           empresa + fechas que se solapan (n1), o mismo nombre (n1-bis), o
           contenido «fuerte» — entidades y cifras compartidas — cuando no hay
           fecha (n2). Una sospecha «media» se sigue marcando y NO se fusiona.

       2 · SIN LA SUBIDA POR ORIGEN (n3). Ese nivel sube la sospecha cuando dos
           items vienen del mismo documento, y en una ingesta multi-fuente eso
           convertiría cualquier «media» en «alta»: fusionaríamos por haber
           llegado juntos, no por ser lo mismo. Para MARCAR es una señal legítima;
           para FUSIONAR no basta. Se le quita el `sourceId` a la copia que
           alimenta la fusión.

       3 · Y el mismo guardarraíl que usa la fusión entre ventanas de llm.ts: si
           los cargos son CLARAMENTE distintos, no se toca. «Backend Developer» y
           «Tech Lead» en la misma empresa son una promoción, no un duplicado.

       4 · SOLO DENTRO DEL MISMO DOCUMENTO. Dos items atribuidos a fuentes
           distintas NO se fusionan aunque el detector los dé por idénticos, y el
           motivo es una regla del producto, no una comodidad: si el rol de la
           captura 3 se absorbiera dentro del de la captura 1, la captura 3
           pasaría a tener CERO items y la ficha de fuentes la pintaría como leída
           y vacía. Una fuente vacía que sí aportó es exactamente la mentira que
           este producto no puede contar (ver el bloque de ATRIBUCIÓN, arriba).
           Y encaja con lo que se pide: el duplicado a consolidar es el que el
           dossier crea DENTRO de sí mismo al contar cada trabajo tres veces. Un
           duplicado ENTRE documentos se sigue MARCANDO, que es lo que era.

   ⚠ SOLO work y project. Un grupo de aptitudes se fusiona uniendo listas, que es
     otra operación con otros riesgos (perder la mitad de «Lenguajes» si ganara el
     primer valor no vacío). Las aptitudes se siguen MARCANDO, como hasta ahora.
   ============================================================================ */

/** Una de las versiones que se fusionaron, tal cual la contó su documento. */
export interface OrigenFusionado {
  /** etiqueta de la fuente a la que estaba atribuida esta versión */
  fuente: string;
  /** cargo o nombre de proyecto, tal cual lo redactó ESTA versión */
  titulo: string;
  empresa?: string;
  fechas?: string;
  /** su cita literal; null si el modelo no copió ninguna */
  evidencia: string | null;
  /** viñetas suyas que ya estaban palabra por palabra en la tarjeta y no se
   *  repitieron. Se cuentan para que «no se repitió» no se confunda con «se perdió». */
  vinetasRepetidas?: number;
}

/** Kinds que se consolidan. Ver el candado 4 del bloque de arriba. */
const CONSOLIDABLES = new Set(["work", "project"]);

/** Los campos que identifican al item, por kind. Se completan de una versión a otra. */
const CAMPOS_FUSION: Record<string, string[]> = {
  work: ["title", "company", "location", "dates"],
  project: ["name", "url", "description", "dates"],
};

const primero = (a: unknown, b: unknown): unknown => {
  const s = typeof a === "string" ? a.trim() : a;
  return s ? a : b;
};

/**
 * Fusiona en la PRESENTACIÓN los items que el detector da por el mismo hecho con
 * nivel «alta». Devuelve las filas supervivientes, en el orden original.
 * PURA: sin red, sin LLM, sin reloj (salvo el año, inyectable). Se prueba entera.
 */
export function consolidarEnOrigen(
  filas: StagedRow[],
  candidatos: DedupItem[],
  currentYear?: number,
): { filas: StagedRow[]; fusionadas: number } {
  const porKey = new Map(filas.map((r) => [r.key, r] as const));
  const tituloDe = new Map(candidatos.map((c) => [c.key, c.title ?? ""] as const));

  // Candado 2: se le quita el origen a la copia que decide la FUSIÓN. El n3 sigue
  // vivo para el marcado, que ocurre después y con los candidatos completos.
  const sinOrigen = candidatos
    .filter((c) => CONSOLIDABLES.has(c.kind ?? ""))
    .map(({ sourceId: _n3, ...resto }) => resto);

  // Union-find sobre las parejas que superan los candados. No es un detector
  // nuevo: es agrupar lo que `detectDuplicates` ya dijo.
  const padre = new Map<string, string>();
  const raiz = (k: string): string => {
    let r = k;
    while (padre.get(r) !== r) r = padre.get(r)!;
    return r;
  };
  for (const c of sinOrigen) padre.set(c.key, c.key);

  const motivos = new Map<string, { level: SuspicionLevel; signals: DuplicateSignal[]; reasons: string[] }>();
  for (const s of detectDuplicates(sinOrigen, { currentYear, minLevel: "alta" })) {
    // Candado 3: cargos claramente distintos ⇒ es una promoción, no un duplicado.
    if (titlesClearlyDifferent(tituloDe.get(s.aKey), tituloDe.get(s.bKey))) continue;
    // Candado 4: solo dentro del mismo documento. La igualdad de etiqueta es
    // transitiva, así que basta comprobarla par a par para que TODO el grupo
    // comparta fuente y ninguna fuente pierda sus items al fusionar.
    if (porKey.get(s.aKey)?.sourceLabel !== porKey.get(s.bKey)?.sourceLabel) continue;
    const ra = raiz(s.aKey), rb = raiz(s.bKey);
    if (ra === rb) continue;
    padre.set(rb, ra);
    const acc = motivos.get(ra) ?? { level: s.level, signals: [], reasons: [] };
    acc.level = s.level;
    for (const g of s.signals) if (!acc.signals.includes(g)) acc.signals.push(g);
    if (!acc.reasons.includes(s.reason)) acc.reasons.push(s.reason);
    motivos.set(ra, acc);
    // el motivo del grupo absorbido viaja con él, para no perder su explicación
    const sub = motivos.get(rb);
    if (sub) {
      for (const g of sub.signals) if (!acc.signals.includes(g)) acc.signals.push(g);
      for (const rz of sub.reasons) if (!acc.reasons.includes(rz)) acc.reasons.push(rz);
      motivos.delete(rb);
    }
  }

  // Grupos, en orden de aparición. El primero de cada grupo es el superviviente.
  const grupos = new Map<string, string[]>();
  for (const c of sinOrigen) {
    const r = raiz(c.key);
    const g = grupos.get(r);
    if (g) g.push(c.key);
    else grupos.set(r, [c.key]);
  }

  const absorbidas = new Set<string>();
  let fusionadas = 0;

  for (const [r, miembros] of grupos) {
    if (miembros.length < 2) continue;
    const vivo = porKey.get(r);
    if (!vivo) continue;

    const campos = CAMPOS_FUSION[vivo.kind] ?? [];
    const origenes: OrigenFusionado[] = [origenDe(vivo, campos)];
    // las viñetas ya presentes, normalizadas, para no repetir la misma frase
    const vistas = new Set(
      filas.filter((f) => f.kind === "bullet" && f.parentKey === vivo.key).map((f) => normalize(String(f.data.text ?? ""))),
    );

    for (const k of miembros.slice(1)) {
      const otra = porKey.get(k);
      if (!otra || otra.kind !== vivo.kind) continue;
      absorbidas.add(k);
      fusionadas++;

      let repetidas = 0;
      for (const f of filas) {
        if (f.kind !== "bullet" || f.parentKey !== k) continue;
        const n = normalize(String(f.data.text ?? ""));
        // Una viñeta IDÉNTICA no se duplica bajo la misma tarjeta; se cuenta, que
        // es lo que la distingue de haberla tirado. Las demás se reparentan.
        if (n && vistas.has(n)) { absorbidas.add(f.key); repetidas++; continue; }
        if (n) vistas.add(n);
        f.parentKey = vivo.key;
      }

      origenes.push({ ...origenDe(otra, campos), ...(repetidas ? { vinetasRepetidas: repetidas } : {}) });

      // Los campos vacíos del superviviente los completa la versión absorbida.
      for (const c of campos) vivo.data[c] = primero(vivo.data[c], otra.data[c]);
      // La evidencia también: una tarjeta sin cita no puede quedarse sin ella
      // habiendo una disponible entre las versiones fusionadas.
      if (!vivo.evidenceSnippet && otra.evidenceSnippet) {
        vivo.evidenceSnippet = otra.evidenceSnippet;
        vivo.evidenceLevel = otra.evidenceLevel;
        vivo.evidenceVerified = otra.evidenceVerified;
      }
    }

    // Las fechas se recalculan DESPUÉS de completar: si el superviviente venía
    // con `dateMissing` y la versión absorbida traía «mar 2022 – hoy», la señal
    // vieja mentiría. Se borran las derivadas y se vuelven a derivar del crudo.
    for (const s of ["dateStart", "dateEnd", "dateCurrent", "dateMissing", "dateInvalid"]) delete vivo.data[s];
    applyDates(vivo.data, String(vivo.data.dates ?? ""));

    vivo.data._origenes = origenes;
    vivo.data._consolidado = origenes.length;

    const m = motivos.get(r);
    vivo.duplicate = {
      // La pareja ya no existe como fila: `mergeProposalFor` resolverá
      // `duplicateOf: null` y la marca se sostiene sola con su motivo, que es
      // justo el caso que sources.ts documenta.
      otherKey: miembros[1]!,
      level: m?.level ?? "alta",
      signals: m?.signals ?? [],
      reason:
        `Se presentan ya fusionados: «${vivo.sourceLabel}» contaba este mismo hecho ${origenes.length} veces, ` +
        `como ${origenes.map((o) => `«${o.titulo || "(sin título)"}»`).join(", ")}. ` +
        (m?.reasons.length ? `${m.reasons.join(" ")} ` : "") +
        `No se descartó nada: las ${origenes.length} versiones están en el item. Decide tú si es uno solo.`,
    };
  }

  if (!absorbidas.size) return { filas, fusionadas: 0 };
  return { filas: filas.filter((f) => !absorbidas.has(f.key)), fusionadas };
}

function origenDe(r: StagedRow, campos: string[]): OrigenFusionado {
  const d = r.data;
  const titulo = String(d.title ?? d.name ?? "");
  return {
    fuente: r.sourceLabel,
    titulo,
    ...(campos.includes("company") ? { empresa: String(d.company ?? "") } : {}),
    fechas: String(d.dates ?? ""),
    evidencia: r.evidenceSnippet,
  };
}

export interface ImportDeps {
  extract: Extractor;
  fetchGithubUser?: GithubFetcher;
  /** web → markdown (Jina). Devuelve "" si no se pudo leer. */
  fetchWeb?: (url: string) => Promise<string>;
}

/**
 * ImportResult + los avisos honestos de la LECTURA (p. ej. "el documento era tan
 * largo que se leyeron 8 de 12 partes"). Van aquí, y no dentro de ImportResult,
 * para no tocar el contrato compartido de types.ts; las rutas los reenvían a la
 * UI junto a los avisos por archivo. Un aviso que no llega al usuario es lo
 * mismo que no avisar.
 */
export interface ImportOutcome extends ImportResult {
  warnings: string[];
  /**
   * Consumo real de IA de esta ingesta (tokens leídos de `usage`), si el
   * extractor lo mide. Un extractor falso (los tests) no mide y esto es
   * undefined: opcional para no romper el contrato inyectable, que es lo que
   * permite probar el pipeline entero sin LLM.
   */
  consumo?: ConsumoIA;
  /** Cómo se repartió el documento, incluidas las secciones tratadas como
   *  contexto CON SU NOMBRE. La ruta las sube a la UI: nada se calla. */
  lectura?: ResumenLectura;
}

let seq = 0;
const key = (p: string) => `${p}-${++seq}`;

const verified = (level: EvidenceLevel) => level === "verified" || level === "api";

/**
 * Anota las fechas normalizadas en `data`, o admite honestamente que faltan (§C2).
 * Estas señales van SIN prefijo `_` a propósito: deben SOBREVIVIR al master
 * (dateMissing/dateInvalid son honestidad hacia el usuario, no metadato interno;
 * persistImport solo limpia las claves con `_`). Nunca se inventa lo ausente.
 */
function applyDates(data: Record<string, unknown>, rawDates: string): void {
  const dr = normalizeDateRange(rawDates);
  if (dr.invalid) {
    data.dateInvalid = dr.invalid; // el texto ORIGINAL; lo arregla un humano
    return;
  }
  if (dr.start || dr.end || dr.current) {
    if (dr.start) data.dateStart = dr.start;
    if (dr.end) data.dateEnd = dr.end;
    if (dr.current) data.dateCurrent = true;
    return;
  }
  data.dateMissing = true;
}

export async function runImport(input: ImportInput, deps: ImportDeps): Promise<ImportOutcome> {
  const detected = detectAndClassify(input.pastedText);
  const sources: string[] = [];
  const staged: StagedRow[] = [];
  const linkedin: { url: string; slug?: string }[] = [];

  // Las PARTES de la ingesta, cada una con su etiqueta. Es lo que convierte el
  // `raw` combinado en algo atribuible: sin esta lista, todo item vuelve a
  // colgar de la misma fila y las capturas vuelven a decir «0 ítems».
  const partes: ParteFuente[] = [];

  /* Los mismos documentos, pero como TRAMOS del `raw` combinado. Es lo que
     necesita el reparto para segmentar cada fuente con SU propia estructura (D6
     de segmentar.ts) en vez de sobre el amasijo, donde una captura sin
     encabezados se pega a la última sección del documento anterior y hereda su
     destino. Ojo a la diferencia con `partes`: aquí el tramo INCLUYE el separador
     y la etiqueta («\n\n[captura.png]\n»), porque los tramos tienen que TESELAR el
     raw sin huecos — si no, la conservación carácter a carácter se rompería y
     `repartirPorFuente` se caería al reparto de siempre.                        */
  let raw = input.pastedText.trim();
  const fuentes: Fuente[] = [];
  const tramo = (etiqueta: string, inicio: number) => fuentes.push({ etiqueta, inicio, fin: raw.length });

  if (raw) {
    sources.push("texto pegado");
    partes.push({ etiqueta: "texto pegado", texto: raw });
    tramo("texto pegado", 0);
  }

  // archivos (PDF/DOCX/transcripción de imagen) → al raw_text, etiquetados
  for (const f of input.files ?? []) {
    if (!f.text.trim()) continue;
    const desde = raw.length;
    raw += `\n\n[${f.label}]\n${f.text}`;
    sources.push(f.label);
    partes.push({ etiqueta: f.label, texto: f.text });
    tramo(f.label, desde);
  }

  // URLs, cada una por su ruta
  for (const u of detected) {
    if (u.kind === "github-profile" || u.kind === "github-repo") {
      if (!deps.fetchGithubUser || !u.handle) continue;
      const { staged: gh } = await deps.fetchGithubUser(u.handle);
      staged.push(...gh); // dato duro; su texto NO va al raw_text (evita re-extracción)
      sources.push(`GitHub · @${u.handle}`);
    } else if (u.kind === "linkedin") {
      linkedin.push({ url: u.url, slug: u.handle }); // no legible desde el servidor
    } else if (u.kind === "web" && deps.fetchWeb) {
      const md = await deps.fetchWeb(u.url);
      if (md.trim()) {
        // hasta 12k: da aire al JSON-LD + crawl de secciones internas (§C4).
        // La etiqueta es UNA sola variable: la que va al raw, la que se cuenta
        // como fuente y la que atribuye. Tres copias distintas era justo el
        // camino para que la atribución no casara con nada.
        const etiquetaWeb = u.handle ?? u.url;
        const trozo = md.slice(0, 12000);
        const desde = raw.length;
        raw += `\n\n[${etiquetaWeb} — portfolio]\n${trozo}`;
        sources.push(etiquetaWeb);
        partes.push({ etiqueta: etiquetaWeb, texto: trozo });
        tramo(etiquetaWeb, desde);
      }
    }
  }

  // Extracción troceada (inyectada). Nada de esto es dato duro: se verifica.
  // Los TRAMOS viajan con el texto: el extractor los usa para repartir documento
  // a documento. Es opcional en el contrato, así que un extractor falso (todos
  // los de los tests) los ignora y sigue funcionando igual.
  const ex = await deps.extract(raw, fuentes);
  const check = (evidence: string): EvidenceLevel => verifyEvidence(raw, evidence);
  // El raw_text normalizado UNA vez: lo comparten basics y las aptitudes. Con un
  // dossier grande, normalizarlo por item era rehacer el mismo trabajo 150 veces.
  const rawNorm = normalize(raw);
  // El atribuidor de ESTA ingesta: convierte la cita de cada item en la fuente
  // real de la que salió. Ver el bloque grande de arriba.
  const atribuidor = construirAtribuidor(partes);

  // basics — verificado si el nombre y algún contacto aparecen literal en la fuente
  const b = ex.basics;
  if (b.name || b.email || b.phone) {
    const nameIn = b.name ? rawNorm.includes(normalize(b.name)) : false;
    const contactIn = [b.email, b.phone].some((c) => c && rawNorm.includes(normalize(c)));
    const level: EvidenceLevel = nameIn && contactIn ? "verified" : nameIn || contactIn ? "partial" : "none";
    // Los datos de contacto SON su propia cita: el email es el texto más
    // identificativo que hay en un CV, y el nombre el segundo.
    const a = atribuidor.de(b.email, b.phone, b.name);
    staged.push({
      key: key("basics"), kind: "basics",
      data: {
        name: b.name, label: b.label, email: b.email, phone: b.phone, location: b.location, links: b.links,
        ...marcaAtribucion(a),
      },
      lang: "es", origin: "extracted", sourceLabel: a.etiqueta,
      evidenceSnippet: [b.name, b.email, b.phone].filter(Boolean).join(" · ") || null,
      evidenceLevel: level, evidenceVerified: verified(level),
    });
  }

  if (b.summary) {
    const level = check(b.summaryEvidence);
    const a = atribuidor.de(b.summaryEvidence, b.summary);
    staged.push({
      key: key("summary"), kind: "summary",
      data: { text: b.summary, ...marcaAtribucion(a) }, lang: "es", origin: "extracted", sourceLabel: a.etiqueta,
      evidenceSnippet: b.summaryEvidence || null, evidenceLevel: level, evidenceVerified: verified(level),
    });
  }

  // Red de seguridad §C5: líneas que en el origen cuelgan de «Aptitudes/Skills»
  // (típico de capturas de LinkedIn) son habilidades, jamás viñetas de logro.
  const skillLines = linkedInSkillLines(raw);

  for (const w of ex.work) {
    const wk = key("work");
    const level = check(w.evidence);
    const workData: Record<string, unknown> = { title: w.title, company: w.company, location: w.location, dates: w.dates };
    applyDates(workData, w.dates);
    // Si la cita no basta, el par título+empresa es lo que identifica un rol.
    const aw = atribuidor.de(w.evidence, `${w.title} ${w.company}`.trim(), w.company, w.title);
    Object.assign(workData, marcaAtribucion(aw));
    staged.push({
      key: wk, kind: "work", data: workData,
      lang: "es", origin: "extracted", sourceLabel: aw.etiqueta,
      evidenceSnippet: w.evidence || null, evidenceLevel: level, evidenceVerified: verified(level),
    });

    const roleLabel = w.title || w.company || "";
    for (const bl of w.bullets) {
      const bLevel = check(bl.evidence);
      // §C1 · clasificar ANTES de stagear: ¿viñeta, habilidad o duda?
      let cls = classifyBulletText(bl.text);
      if (cls.kind !== "skill" && skillLines.has(normalizeLine(bl.text))) {
        cls = { kind: "skill", reason: "aparece bajo «Aptitudes/Skills» en el origen" };
      }

      // La viñeta se atribuye por SU PROPIO texto, no por el del rol: en un
      // volcado con LinkedIn + cuestionario, el rol viene de una fuente y el
      // detalle narrativo de la otra. Ese es el caso de uso, no la excepción.
      const ab = atribuidor.de(bl.evidence, bl.text);

      if (cls.kind === "skill") {
        // se convierte en habilidad stageada, con su MISMA evidencia y sourceLabel.
        // sourceContext (§C3) conserva de qué rol salió — honesto, sobrevive al master.
        staged.push({
          key: key("skill"), kind: "skill",
          data: {
            group: "Herramientas", items: bl.text, sourceContext: roleLabel, _classFrom: "bullet",
            ...marcaAtribucion(ab),
          },
          lang: "es", origin: "extracted", sourceLabel: ab.etiqueta,
          evidenceSnippet: bl.evidence || null, evidenceLevel: bLevel, evidenceVerified: verified(bLevel),
        });
        continue;
      }

      const bData: Record<string, unknown> = { text: bl.text, ...marcaAtribucion(ab) };
      if (cls.kind === "doubt") {
        // se stagea COMO VIÑETA pero con la duda VISIBLE — no se adivina en silencio.
        // `_` = metadato de staging: se resuelve antes de promover, no viaja al master.
        bData._classDoubt = "skill";
        bData._classReason = cls.reason;
      }
      staged.push({
        key: key("bullet"), parentKey: wk, kind: "bullet",
        data: bData, lang: "es", origin: "extracted", sourceLabel: ab.etiqueta,
        evidenceSnippet: bl.evidence || null, evidenceLevel: bLevel, evidenceVerified: verified(bLevel),
      });
    }
  }

  for (const e of ex.education) {
    const level = check(e.evidence);
    const a = atribuidor.de(e.evidence, `${e.degree} ${e.institution}`.trim(), e.institution, e.degree);
    staged.push({
      key: key("edu"), kind: "education",
      data: {
        degree: e.degree, institution: e.institution, location: e.location, dates: e.dates,
        ...marcaAtribucion(a),
      },
      lang: "es", origin: "extracted", sourceLabel: a.etiqueta,
      evidenceSnippet: e.evidence || null, evidenceLevel: level, evidenceVerified: verified(level),
    });
  }

  // skills — verificación POR ITEM: una aptitud está respaldada si aparece literal.
  for (const s of ex.skills) {
    const items = s.items.split(",").map((x) => x.trim()).filter(Boolean);
    if (!items.length) continue;
    const present = items.filter((i) => rawNorm.includes(normalize(i)));
    const level: EvidenceLevel =
      present.length === items.length ? "verified" : present.length >= Math.ceil(items.length / 2) ? "partial" : "none";
    // ⚠ La evidencia de una aptitud es una frase FABRICADA («En la fuente: …»)
    //   que no está en ningún documento: buscarla no atribuiría nada. Se atribuye
    //   por la lista de aptitudes y por el nombre del grupo, que sí son texto real.
    const a = atribuidor.de(s.items, s.evidence, s.group);
    staged.push({
      key: key("skill"), kind: "skill",
      data: { group: s.group, items: s.items, ...marcaAtribucion(a) },
      lang: "es", origin: "extracted", sourceLabel: a.etiqueta,
      evidenceSnippet: present.length ? `En la fuente: ${present.join(", ")}` : null,
      evidenceLevel: level, evidenceVerified: verified(level),
    });
  }

  // projects — los que ya vinieron por la API de GitHub no se repiten
  const apiProjects = new Set(
    staged.filter((r) => r.kind === "project" && r.origin === "api").map((r) => normalize(String(r.data.name ?? ""))),
  );
  for (const p of ex.projects) {
    if (p.name && apiProjects.has(normalize(p.name))) continue;
    const level = check(p.evidence);
    const projData: Record<string, unknown> = { name: p.name, url: p.url, description: p.description, dates: p.dates };
    applyDates(projData, p.dates);
    // §A1 · doce GRUPOS DE APTITUDES se colaron como proyectos en el volcado real
    // («Desarrollo Web y Backend: Next.js, React, …»). Se marca la duda y punto:
    // MISMO patrón que `_classDoubt` de las viñetas — el sistema no reclasifica
    // solo, lo resuelve el usuario. `_` = metadato de staging, no viaja al master.
    const forma = classifyProjectShape(p.name, p.description);
    if (forma.kind === "skill-group") {
      projData._classDoubt = "skill";
      projData._classReason = forma.reason;
    }
    const a = atribuidor.de(p.evidence, p.description, p.name);
    Object.assign(projData, marcaAtribucion(a));
    staged.push({
      key: key("proj"), kind: "project", data: projData,
      lang: "es", origin: "extracted", sourceLabel: a.etiqueta,
      evidenceSnippet: p.evidence || null, evidenceLevel: level, evidenceVerified: verified(level),
    });
  }

  /* ── Sospecha de duplicado (§4.5 · §A1) ─────────────────────────────────────
     Se PROPONE, nunca se decide: la tarjeta queda marcada con nivel, señales y
     motivo, y el que resuelve es el usuario. Lo que sí cambia con la
     consolidación es la FORMA de la propuesta cuando la sospecha es máxima: en
     vez de tres tarjetas y dos marcas «duplicado de aquella», una tarjeta con sus
     tres orígenes dentro y una marca que lo explica. Sigue sin descartarse nada y
     sigue decidiendo el usuario; lo que se le ahorra es comparar tres textos a
     mano para descubrir lo que el detector ya sabía.

     Se compara work, project Y skill: los tres tenían duplicados reales en el
     volcado. El texto que se le pasa al detector es TODO el contenido del item
     (incluidas las viñetas de un rol): es ahí donde vive la identidad del hecho
     cuando el título y la empresa no coinciden.                                 */
  const multiFuente = new Set(sources).size > 1;
  const candidatos = candidatosDedup(staged, multiFuente);

  /* ── PRIMERO consolidar, DESPUÉS marcar ────────────────────────────────────
     El orden importa y no es estético. Si se marcara antes, la sospecha
     apuntaría a filas que la consolidación va a hacer desaparecer y la cola
     enseñaría un «duplicado de» que no existe. Consolidando primero, lo que
     queda por marcar son las sospechas de VERDAD abiertas entre tarjetas
     distintas — que son las que el usuario tiene que mirar.                    */
  const { filas, fusionadas } = consolidarEnOrigen(staged, candidatos);
  const finales = fusionadas ? filas : staged;

  const porKey = new Map(finales.map((r) => [r.key, r] as const));
  for (const s of detectDuplicates(fusionadas ? candidatosDedup(finales, multiFuente) : candidatos)) {
    const row = porKey.get(s.bKey);
    if (!row || row.duplicate) continue; // ya tiene una sospecha más fuerte (van ordenadas)
    row.duplicate = { otherKey: s.aKey, level: s.level, signals: s.signals, reason: s.reason };
  }

  const counts = {
    verified: finales.filter((r) => r.evidenceLevel === "verified").length,
    partial: finales.filter((r) => r.evidenceLevel === "partial").length,
    none: finales.filter((r) => r.evidenceLevel === "none").length,
    api: finales.filter((r) => r.evidenceLevel === "api").length,
    total: finales.length,
  };

  return {
    rawText: raw, sources, staged: finales, linkedin, counts,
    warnings: ex.warnings ?? [],
    consumo: ex.consumo,
    lectura: ex.lectura,
  };
}

/**
 * Los candidatos que ve el detector. Extraído para poder recalcularlo DESPUÉS de
 * consolidar: si se reutilizara la lista vieja, el marcado hablaría de filas que
 * ya no existen y de contenidos que ya no son los de la tarjeta fusionada.
 *
 * `sourceId` (n3) solo se rellena si el import trae MÁS DE UNA fuente. Con una
 * sola, «vienen del mismo documento» es cierto para todos los pares y por tanto
 * no distingue nada: subir la sospecha con eso sería inflarla a ciegas.
 */
export function candidatosDedup(filas: StagedRow[], multiFuente: boolean): DedupItem[] {
  // las viñetas se indexan por rol UNA vez: un dossier de 104 KB trae 150 items y
  // volver a barrer las filas por cada rol es trabajo cuadrático justo en el caso
  // que motivó todo esto.
  const bulletsPorRol = new Map<string, string[]>();
  for (const r of filas) {
    if (r.kind !== "bullet" || !r.parentKey) continue;
    const lista = bulletsPorRol.get(r.parentKey);
    const texto = String(r.data.text ?? "");
    if (lista) lista.push(texto);
    else bulletsPorRol.set(r.parentKey, [texto]);
  }
  const bulletsDe = (parentKey: string) => (bulletsPorRol.get(parentKey) ?? []).join(" · ");

  return filas
    .filter((r) => r.kind === "work" || r.kind === "project" || r.kind === "skill")
    .map((r) => {
      const d = r.data;
      const base = { key: r.key, kind: r.kind, sourceId: multiFuente ? r.sourceLabel : undefined };
      if (r.kind === "work") {
        return {
          ...base,
          title: String(d.title ?? ""),
          company: String(d.company ?? ""),
          dates: String(d.dates ?? ""),
          text: [r.evidenceSnippet ?? "", bulletsDe(r.key)].filter(Boolean).join(" · "),
        };
      }
      if (r.kind === "project") {
        return {
          ...base,
          title: String(d.name ?? ""),
          dates: String(d.dates ?? ""),
          text: [String(d.description ?? ""), r.evidenceSnippet ?? ""].filter(Boolean).join(" · "),
        };
      }
      return { ...base, title: String(d.group ?? ""), text: String(d.items ?? "") };
    });
}
