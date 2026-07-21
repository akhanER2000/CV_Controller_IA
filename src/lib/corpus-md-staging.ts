/* ============================================================================
   corpus/1 → STAGING, SIN UNA SOLA LLAMADA AL MODELO (bloque B).

   Este módulo es la mitad PURA de POST /api/import/corpus-md: convierte lo que
   devuelve el parser del bloque A en filas de `staged_items` (StagedRow) y en el
   INFORME que el usuario lee ANTES de decidir si importa.

   ★ POR QUÉ VIVE EN src/lib Y NO EN LA RUTA
   Un `route.ts` de Next solo puede exportar sus manejadores HTTP; cualquier otro
   export revienta `next build` aunque tsc y vitest estén verdes (el candado es
   tests/rutas-exports.test.ts, y el caso real fue `invalidItemData`). Como esto
   hay que probarlo con mutantes, no puede vivir en la frontera HTTP.

   ★ POR QUÉ LA ENTRADA ES `unknown` Y NO EL TIPO DEL BLOQUE A
   Este bloque se escribió EN PARALELO con el parser. Importar sus *tipos* ataría
   la compilación de la puerta determinista a decisiones de nomenclatura que aún
   no existían: cualquier diferencia de nombre en un campo opcional habría roto el
   build entero. Así que la frontera con el bloque A es de DATOS, no de tipos:
   `analizarCorpusMd` recibe `unknown`, lo normaliza en runtime y —esto es lo
   importante— FALLA RUIDOSO si no reconoce la forma. Un adaptador que devuelve
   una lista vacía cuando no entiende la entrada es exactamente el fallo capital
   de este producto (descartar datos del usuario en silencio) disfrazado de
   robustez. Aquí no entender es un error, no un cero.

   ★ CERO IA. Este fichero no importa `extract/llm`, ni el SDK `ai`, ni pide
   GEMINI_API_KEY. Es media gracia del bloque: el camino .md tiene que funcionar
   con las claves de IA sin configurar. tests/import-corpus-md.test.ts lo verifica
   leyendo el código fuente, no confiando en este comentario.
   ============================================================================ */

import type { StagedRow, ItemKind, Origin, EvidenceLevel } from "@/lib/extract/types";
import { invalidItemData } from "@/lib/db/item-data";

/* ============================================================================
   1 · EL CONTRATO CON EL BLOQUE A, declarado estructuralmente
   ============================================================================ */

/** El bloque de procedencia de un item (el comentario HTML del formato). */
export interface ProcedenciaMd {
  origin?: unknown;
  sourceId?: unknown;
  evidenceSnippet?: unknown;
  evidencePage?: unknown;
  evidenceVerified?: unknown;
  /** etiqueta legible del origen ("LinkedIn", "CV.pdf"). No está en las 5 columnas
   *  obligatorias del encargo, pero si el export la escribe la conservamos. */
  sourceLabel?: unknown;
  evidenceLevel?: unknown;
  /** claves de `data` que el formato no sabe escribir y viajan aquí (§5 del contrato). */
  extra?: unknown;
}

/**
 * Un item ya parseado: kind + data + su procedencia (o nada, si es nuevo).
 *
 * La procedencia se acepta de DOS formas, y no por indecisión: el bloque A la
 * entrega PLANA sobre el item (`ItemParseado.origin`, `.evidenceSnippet`…), que es
 * la que manda en producción; la anidada bajo `procedencia` era el contrato
 * provisional con el que se escribió esta puerta antes de que su fichero
 * existiera. Se mantienen las dos porque la anidada está probada, no cuesta nada
 * y protege de que el otro bloque cambie de opinión.
 *
 * Lo mismo con el enlace viñeta→rol: el bloque A usa `parentIndex` (índice dentro
 * de items[]); el contrato provisional usaba `parentKey`.
 */
export interface ItemMd {
  key?: unknown;
  parentKey?: unknown;
  parentIndex?: unknown;
  kind?: unknown;
  data?: unknown;
  procedencia?: unknown;
  lang?: unknown;
  /** línea del .md donde empieza. Sirve para que cada aviso se pueda ir a mirar. */
  linea?: unknown;
  /* … o la procedencia PLANA, tal como la escribe el bloque A: */
  origin?: unknown;
  sourceId?: unknown;
  evidenceSnippet?: unknown;
  evidencePage?: unknown;
  evidenceVerified?: unknown;
  sourceLabel?: unknown;
  evidenceLevel?: unknown;
}

/** Un aviso del parser (fecha que no se entendió, línea conservada como nota…). */
export interface AvisoMd {
  linea: number | null;
  es: string;
  en: string;
}

/** La forma normalizada del parseo, ya sin `unknown`. */
export interface ParseoMd {
  items: ItemMd[];
  avisos: AvisoMd[];
}

/* ============================================================================
   2 · EL INFORME — números REALES del parseo, y ninguno sin fuente
   ============================================================================ */

export interface InformeCorpusMd {
  /** items que entran (o entrarían) a staging */
  total: number;
  /** desglose por kind: {work:5, bullet:33, skill:8, project:12} */
  porTipo: Record<string, number>;
  /** cuántos traían bloque de procedencia (vienen de un export) */
  conProcedencia: number;
  /** cuántos entran como manual nuevo (escritos a mano en el fichero) */
  nuevos: number;
  /** cuántos el detector reconoce como YA aceptados en el master (se marcan, no se tiran) */
  yaEnMaster: number;
  /** lo que el parser produjo y NO se puede importar. Se NOMBRA uno a uno. */
  noImportados: AvisoMd[];
  /** avisos del parser + los míos, con su número de línea */
  avisos: AvisoMd[];
  /** la frase para la pantalla, en los DOS idiomas (el producto lo exige) */
  frase: { es: string; en: string };
  /** el mismo reparto por nivel de evidencia que devuelven las demás ingestas */
  counts: { verified: number; partial: number; none: number; api: number; total: number };
}

export interface AnalisisCorpusMd {
  rows: StagedRow[];
  informe: InformeCorpusMd;
}

export interface OpcionesAnalisis {
  /** etiqueta legible del fichero, para los items SIN procedencia propia */
  etiqueta?: string;
  /** idioma de los items que no lo declaren */
  lang?: string;
  /** cuántos de estos items ya están en el master (lo calcula la ruta con la BD) */
  yaEnMaster?: number;
}

/* ============================================================================
   3 · VOCABULARIOS CERRADOS — nada entra a un enum sin estar en su lista
   ============================================================================ */

/** item_kind del esquema 0001 + 'reference' (0004). 'publication' está en el enum
 *  de la base pero NO en el union de TypeScript ni en el esqueleto de corpus/1:
 *  si apareciera, se NOMBRA en noImportados en vez de colarse con un cast. */
const KINDS = new Set<string>([
  "basics", "summary", "work", "bullet", "education",
  "skill", "project", "certification", "language", "link", "reference",
]);

/** item_origin (0001). Un valor fuera de aquí reventaría el INSERT. */
const ORIGENES = new Set<string>(["extracted", "manual", "ai_rephrased", "ai_translated", "api"]);

const NIVELES = new Set<string>(["verified", "partial", "none", "api"]);

/**
 * Singular y plural de cada kind, en los dos idiomas. El ORDEN de este objeto es
 * el orden de la frase del informe: fijarlo aquí hace la frase determinista, que
 * es lo que permite que un test la compare literal en vez de "que contenga algo".
 */
const NOMBRES: Record<string, { es: [string, string]; en: [string, string] }> = {
  basics: { es: ["bloque de contacto", "bloques de contacto"], en: ["contact block", "contact blocks"] },
  summary: { es: ["resumen", "resúmenes"], en: ["summary", "summaries"] },
  work: { es: ["rol", "roles"], en: ["role", "roles"] },
  bullet: { es: ["viñeta", "viñetas"], en: ["bullet", "bullets"] },
  education: { es: ["titulación", "titulaciones"], en: ["degree", "degrees"] },
  skill: { es: ["grupo de habilidades", "grupos de habilidades"], en: ["skill group", "skill groups"] },
  project: { es: ["proyecto", "proyectos"], en: ["project", "projects"] },
  certification: { es: ["certificación", "certificaciones"], en: ["certification", "certifications"] },
  language: { es: ["idioma", "idiomas"], en: ["language", "languages"] },
  reference: { es: ["referencia", "referencias"], en: ["reference", "references"] },
  link: { es: ["enlace", "enlaces"], en: ["link", "links"] },
};

/* ============================================================================
   4 · COERCIONES — leer lo ajeno sin creerse nada
   ============================================================================ */

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

const textoOnull = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const entero = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) ? v : null;

/** Primer campo de `o` que sea un array, entre varios nombres plausibles. */
function primerArray(o: Record<string, unknown>, nombres: string[]): unknown[] | null {
  for (const n of nombres) {
    const v = o[n];
    if (Array.isArray(v)) return v;
  }
  return null;
}

/** Un aviso ajeno (string suelto u objeto) → mi forma bilingüe con línea. */
function avisoAjeno(v: unknown): AvisoMd | null {
  if (typeof v === "string") {
    return v.trim() ? { linea: null, es: v.trim(), en: v.trim() } : null;
  }
  if (!esObjeto(v)) return null;
  // Los avisos del PARSER los redacta el bloque A; aquí no se traducen (traducir
  // texto ajeno en runtime sería inventar). Se propagan con es=en para que la
  // pantalla no se quede sin el aviso en inglés, que sería peor.
  const msg = texto(v.es) || texto(v.mensaje) || texto(v.message) || texto(v.texto);
  if (!msg.trim()) return null;
  return { linea: entero(v.linea) ?? entero(v.line), es: msg.trim(), en: (texto(v.en) || msg).trim() };
}

/**
 * `unknown` del bloque A → forma normalizada. FALLA RUIDOSO si no reconoce la
 * entrada: devolver `{items:[]}` ante algo que no se entiende sería tragarse el
 * fichero del usuario y decirle que salió bien.
 */
export function normalizarParseo(raw: unknown): ParseoMd {
  if (Array.isArray(raw)) return { items: raw.filter(esObjeto) as ItemMd[], avisos: [] };
  if (!esObjeto(raw)) {
    throw new Error(
      "El parser de corpus/1 no devolvió un objeto con los items del fichero. " +
        "No se importa nada: antes que adivinar, se para.",
    );
  }
  const items = primerArray(raw, ["items", "elementos", "filas", "entradas"]);
  if (!items) {
    throw new Error(
      "No encontré la lista de items en lo que devolvió el parser de corpus/1 " +
        `(claves vistas: ${Object.keys(raw).join(", ") || "ninguna"}). No se importa nada.`,
    );
  }
  const avisos = [
    ...(primerArray(raw, ["avisos", "warnings", "advertencias"]) ?? []),
    // Las líneas que no encajaron y el parser conserva como NOTA son avisos de
    // pleno derecho: el usuario tiene que verlas, no descubrirlas luego.
    ...(primerArray(raw, ["notas", "notes"]) ?? []),
  ]
    .map(avisoAjeno)
    .filter((a): a is AvisoMd => a !== null);

  return { items: items.filter(esObjeto) as ItemMd[], avisos };
}

/* ============================================================================
   5 · EL ARMADO DE FILAS
   ============================================================================ */

/** Etiqueta corta y humana de un item, para poder NOMBRARLO en un aviso. */
function etiquetaItem(kind: string, data: Record<string, unknown>): string {
  const cand = [data.title, data.name, data.group, data.degree, data.language, data.text]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .find((s) => s.length > 0);
  if (!cand) return kind;
  return cand.length > 60 ? `${cand.slice(0, 57)}…` : cand;
}

const conLinea = (linea: number | null, es: string, en: string): AvisoMd => ({ linea, es, en });

/**
 * Parseo normalizado → filas de staging + informe. PURO: ni Supabase ni red ni
 * reloj. Todo lo que no se puede importar sale NOMBRADO en el informe.
 */
export function analizarCorpusMd(parseoCrudo: unknown, opts: OpcionesAnalisis = {}): AnalisisCorpusMd {
  const parseo = normalizarParseo(parseoCrudo);
  const etiqueta = (opts.etiqueta ?? "").trim() || "fichero corpus/1";
  const langPorDefecto = (opts.lang ?? "").trim() || "es";

  const rows: StagedRow[] = [];
  const avisos: AvisoMd[] = [...parseo.avisos];
  const noImportados: AvisoMd[] = [];
  const porTipo: Record<string, number> = {};
  let conProcedencia = 0;

  /* Las claves del bloque A se REEMPLAZAN por unas propias (`md0`, `md1`…). No es
     manía: `assignIds` mapea clave→uuid, así que dos items con la misma clave
     recibirían el MISMO uuid y el segundo INSERT reventaría por clave primaria
     duplicada — o peor, colgaría las viñetas del rol equivocado. Con un espacio de
     claves propio eso es imposible por construcción, venga lo que venga. */
  const claveDe = new Map<string, string>(); // clave del bloque A → clave mía
  parseo.items.forEach((it, i) => {
    const k = texto(it.key);
    // primero-gana: el padre se declara ANTES que sus viñetas en el fichero.
    if (k && !claveDe.has(k)) claveDe.set(k, `md${i}`);
  });

  parseo.items.forEach((it, i) => {
    const linea = entero(it.linea);
    const kind = texto(it.kind).trim();

    // ── kind: vocabulario cerrado. Fuera de él NO se importa, pero se NOMBRA. ──
    if (!KINDS.has(kind)) {
      noImportados.push(
        conLinea(
          linea,
          `Tipo de item desconocido «${kind || "(vacío)"}»: no se puede guardar y NO se importó. Sigue en tu fichero, íntegro.`,
          `Unknown item type "${kind || "(empty)"}": it cannot be stored and was NOT imported. It is still in your file, intact.`,
        ),
      );
      return;
    }

    // ── data: siempre un objeto. Los `extra` de la procedencia vuelven a data ──
    const dataItem = esObjeto(it.data) ? { ...it.data } : {};
    if (!esObjeto(it.data)) {
      avisos.push(
        conLinea(
          linea,
          `«${kind}»: el item llegó sin campos. Entra igualmente, vacío, para que puedas verlo y decidir.`,
          `"${kind}": the item arrived with no fields. It still enters, empty, so you can see it and decide.`,
        ),
      );
    }

    const proc: ProcedenciaMd | null = esObjeto(it.procedencia) ? (it.procedencia as ProcedenciaMd) : null;

    // §5 del contrato: lo que el formato no sabe escribir viaja en el bloque de
    // procedencia como `extra` y tiene que VOLVER a data, o el round-trip degrada
    // el dato mientras el test dice que pasa. `data` manda si hay colisión: es lo
    // que el humano escribió a la vista, y el extra es el respaldo.
    if (proc && esObjeto(proc.extra)) {
      for (const [k, v] of Object.entries(proc.extra)) {
        if (!(k in dataItem)) dataItem[k] = v;
      }
    }

    // Una clave que el editor del master no sabrá guardar (PATCH valida contra
    // DATA_KEYS y devuelve 400) NO se descarta: se conserva y se AVISA. Descartar
    // sería el fallo capital; callar sería dejar una bomba para el día que edite.
    const motivo = invalidItemData(dataItem);
    if (motivo) {
      avisos.push(
        conLinea(
          linea,
          `«${etiquetaItem(kind, dataItem)}»: ${motivo} El dato se conserva tal cual, pero el editor del master no podrá guardarlo hasta que se arregle.`,
          `"${etiquetaItem(kind, dataItem)}": ${motivo} The value is kept as is, but the master editor will not be able to save it until it is fixed.`,
        ),
      );
    }

    // ── PROCEDENCIA ────────────────────────────────────────────────────────────
    let origin: Origin;
    let evidenceSnippet: string | null;
    let evidenceVerified: boolean;
    let evidenceLevel: EvidenceLevel;
    let sourceLabel: string;

    if (!proc) {
      /* SIN bloque de procedencia = item nuevo, escrito a mano en el fichero. El
         propio archivo ES la fuente: no hay nada contra lo que verificar, así que
         `evidence_verified` es TRUE con toda propiedad. Es además la procedencia
         más fuerte que existe en este producto (nadie interpretó nada). */
      origin = "manual";
      evidenceSnippet = null;
      evidenceVerified = true;
      evidenceLevel = "verified";
      sourceLabel = etiqueta;
    } else {
      conProcedencia += 1;
      const crudo = texto(proc.origin).trim();
      if (crudo && ORIGENES.has(crudo)) {
        origin = crudo as Origin;
      } else {
        /* Un origin ilegible no se puede guardar (es un enum) y tampoco se puede
           inventar. Lo ÚNICO que sabemos de verdad es que llegó por este fichero →
           'manual'; la afirmación original se conserva en data._originRaw y se
           avisa. Poner 'extracted' a ojo sería fabricar procedencia. */
        origin = "manual";
        if (crudo) {
          dataItem._originRaw = crudo;
          avisos.push(
            conLinea(
              linea,
              `«${etiquetaItem(kind, dataItem)}»: el origen «${crudo}» no es uno de los que la base admite. Se guarda como «manual» y el valor original queda anotado en el item.`,
              `"${etiquetaItem(kind, dataItem)}": origin "${crudo}" is not one the database accepts. It is stored as "manual" and the original value is kept noted on the item.`,
            ),
          );
        }
      }
      evidenceSnippet = textoOnull(proc.evidenceSnippet);
      // Ausente ⇒ false. No se asciende a verificado algo que el fichero no afirma.
      evidenceVerified = proc.evidenceVerified === true;
      const nivel = texto(proc.evidenceLevel).trim();
      evidenceLevel = NIVELES.has(nivel)
        ? (nivel as EvidenceLevel)
        : evidenceVerified
          ? "verified"
          : "none";
      sourceLabel = texto(proc.sourceLabel).trim() || etiqueta;

      /* Las otras dos columnas del encargo (source_id ORIGINAL y evidence_page)
         no caben en las columnas de esta fila: `staged_items.source_id` es la FK a
         la fuente de ESTA importación (el .md), no la de origen. Viajan en data._*
         siguiendo el mecanismo que este código ya usa para _origin/_level/_source.
         Ver `noHecho`: `clean()` de promoteStaged las borra al promover, igual que
         hoy borra _level y _source. */
      const sid = textoOnull(proc.sourceId);
      if (sid) dataItem._sourceId = sid;
      const pag = entero(proc.evidencePage);
      if (pag !== null) dataItem._evidencePage = pag;
    }

    // ── enlace viñeta → su rol ────────────────────────────────────────────────
    const padreAjeno = texto(it.parentKey).trim();
    let parentKey: string | undefined;
    if (padreAjeno) {
      parentKey = claveDe.get(padreAjeno);
      if (!parentKey) {
        avisos.push(
          conLinea(
            linea,
            `«${etiquetaItem(kind, dataItem)}»: apunta a un bloque padre que no está en el fichero. Entra suelta para que no se pierda; podrás recolocarla al aceptarla.`,
            `"${etiquetaItem(kind, dataItem)}": it points to a parent block that is not in the file. It enters on its own so nothing is lost; you can re-attach it when you accept it.`,
          ),
        );
      }
    }

    const lang = texto(it.lang).trim() || langPorDefecto;

    rows.push({
      key: `md${i}`,
      ...(parentKey ? { parentKey } : {}),
      kind: kind as ItemKind,
      data: dataItem,
      lang,
      origin,
      sourceLabel,
      evidenceSnippet,
      evidenceLevel,
      evidenceVerified,
    });
    porTipo[kind] = (porTipo[kind] ?? 0) + 1;
  });

  const counts = { verified: 0, partial: 0, none: 0, api: 0, total: rows.length };
  for (const r of rows) counts[r.evidenceLevel] += 1;

  const informe: InformeCorpusMd = {
    total: rows.length,
    porTipo,
    conProcedencia,
    nuevos: rows.length - conProcedencia,
    yaEnMaster: Math.max(0, opts.yaEnMaster ?? 0),
    noImportados,
    avisos,
    counts,
    frase: { es: "", en: "" },
  };
  informe.frase = fraseInforme(informe);
  return { rows, informe };
}

/* ============================================================================
   6 · LA FRASE DEL INFORME — ningún número sin su cosa contada
   ============================================================================ */

/** "a, b y c" · "a, b and c". */
function juntar(partes: string[], y: string): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} ${y} ${partes[partes.length - 1]}`;
}

/**
 * "Leí 5 roles, 33 viñetas, 8 grupos de habilidades y 12 proyectos. 2 avisos."
 *
 * Los números salen del reparto REAL (`porTipo`), no de un resumen aparte: no hay
 * forma de que la frase diga 5 y la cola traiga 4. Un kind con cero items NO
 * aparece — enumerar ceros no informa, distrae.
 */
export function fraseInforme(inf: InformeCorpusMd): { es: string; en: string } {
  const trozo = (idioma: "es" | "en"): string[] =>
    Object.keys(NOMBRES)
      .filter((k) => (inf.porTipo[k] ?? 0) > 0)
      .map((k) => {
        const n = inf.porTipo[k]!;
        const [uno, varios] = NOMBRES[k]![idioma];
        return `${n} ${n === 1 ? uno : varios}`;
      });

  // Un kind válido para la base pero sin nombre en la tabla no puede desaparecer
  // de la frase: se nombra por su propio kind antes que omitirlo.
  const sueltos = Object.keys(inf.porTipo).filter((k) => !(k in NOMBRES) && (inf.porTipo[k] ?? 0) > 0);
  const extraEs = sueltos.map((k) => `${inf.porTipo[k]} × ${k}`);

  const es: string[] = [];
  const en: string[] = [];
  const listaEs = [...trozo("es"), ...extraEs];
  const listaEn = [...trozo("en"), ...extraEs];

  es.push(listaEs.length ? `Leí ${juntar(listaEs, "y")}.` : "No leí ningún item de este fichero.");
  en.push(listaEn.length ? `Read ${juntar(listaEn, "and")}.` : "I read no items from this file.");

  if (inf.yaEnMaster > 0) {
    es.push(`${inf.yaEnMaster} ${inf.yaEnMaster === 1 ? "ya está" : "ya están"} en tu master.`);
    en.push(`${inf.yaEnMaster} ${inf.yaEnMaster === 1 ? "is" : "are"} already in your master.`);
  }
  if (inf.noImportados.length > 0) {
    const n = inf.noImportados.length;
    es.push(`${n} ${n === 1 ? "item no se pudo importar" : "items no se pudieron importar"}.`);
    en.push(`${n} ${n === 1 ? "item could not be imported" : "items could not be imported"}.`);
  }
  if (inf.avisos.length > 0) {
    const n = inf.avisos.length;
    es.push(`${n} ${n === 1 ? "aviso" : "avisos"}.`);
    en.push(`${n} ${n === 1 ? "warning" : "warnings"}.`);
  }
  return { es: es.join(" "), en: en.join(" ") };
}

/* ============================================================================
   7 · NOMBRE DEL FICHERO DE LA PLANTILLA (GET /api/master/plantilla)
   ============================================================================
   Vive aquí y no en la ruta por lo mismo que todo lo demás: un route.ts no puede
   exportar ayudantes. `fecha` se inyecta para que el test no dependa del reloj. */
export function nombrePlantilla(conDatos: boolean, fecha = new Date()): string {
  const dia = fecha.toISOString().slice(0, 10);
  return conDatos ? `corpus-master-${dia}.md` : "corpus-plantilla.md";
}
