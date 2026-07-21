import type { SupabaseClient } from "@supabase/supabase-js";
import type { MasterItem } from "@/lib/db/queries";
import {
  clustersDeDuplicados,
  resolverDuplicado,
  CAMPOS_POR_KIND,
  type ClusterDuplicado,
  type MiembroDuplicado,
  type DestinoVinetas,
} from "@/lib/db/duplicados";
import {
  normalizeCompany,
  parseRange,
  type DetectOptions,
} from "@/lib/extract/dedup";
import { classifyProjectShape } from "@/lib/extract/classify";
import { signalsOf } from "@/lib/extract/similar";
import { chipsFromCsv, chipsToCsv, mergeChips } from "@/lib/db/master";
import { normalize, extractNumbers } from "@/lib/verify";
import { normalizeDateRange } from "@/lib/extract/dates";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * BARRIDO DEL MASTER (§B · punto 2 del contrato). «Revisar mi master con IA».
 *
 * EL PROBLEMA: la detección de duplicados ya funciona, pero resolverlos DE A UNO
 * es agotador. El registro real trae 105 items con DIEZ roles donde hay cinco y
 * TREINTA Y TRES grupos de aptitudes donde hay ~diez. Hace falta el barrido
 * COMPLETO, en dos pasos: primero ANALIZAR (aquí, sin tocar nada), y después el
 * usuario pulsa «Aplicar las N correcciones» sobre una lista que YA HA VISTO.
 *
 * ⚠ REGLA INVIOLABLE (Corpus): la IA nunca inventa; cada dato lleva su
 *   procedencia; NADA se aplica sin que el usuario lo haya visto; ningún dato del
 *   usuario se descarta en silencio. Por eso `analizarMaster` es PURA y SOLO
 *   PROPONE, y `aplicarBarrido` ejecuta EXACTAMENTE lo que el usuario seleccionó.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ★ POR QUÉ ESTO NO ESCRIBE EN ingestion_events (decisión de la premisa de progreso).
 *
 * El encargo pedía «progreso honesto» por SONDEO sobre `ingestion_events`. Pero:
 *   1. `ingestion_events.source_id` es NOT NULL con FK a `ingestion_sources`, y un
 *      barrido del master NO tiene fuente: cruza el master contra TODAS. Una fuente
 *      sintética ensuciaría la lista de fuentes del usuario; colgar los eventos de
 *      una fuente real MENTIRÍA sobre su log de ingesta (esos eventos no salieron
 *      de ella). Ninguna de las dos es honesta.
 *   2. El barrido es DETERMINISTA y rápido: reusa el detector O(n²) (microsegundos
 *      sobre ~150 items) y una búsqueda literal en el raw_text. Cabe en UNA sola
 *      invocación → no hay progreso entre invocaciones que sondear. El SSE ingenuo
 *      tampoco valdría en serverless (lo dice la corrección de premisa del encargo).
 * Por eso el progreso honesto viaja EN LA RESPUESTA: `recorrido` dice, con cifras
 * REALES, qué se examinó («comparé 105 items contra 3 fuentes · revisé 10 roles ·
 * encontré 5 posibles duplicados»). No es un porcentaje inventado: es el recuento
 * de lo que de verdad se hizo.
 *
 * Si algún día el barrido pasara a llamar a un LLM por item (varias invocaciones),
 * SÍ necesitaría progreso persistido — y NO cabría en ingestion_events. Haría falta
 * una tabla propia con `scan_id` en vez de `source_id`. El SQL exacto va en la
 * respuesta del agente (noHecho): `supabase/` está fuera de esta frontera.
 * ════════════════════════════════════════════════════════════════════════════
 */

type SB = SupabaseClient;

const str = (o: Record<string, unknown>, k: string): string => String(o[k] ?? "").trim();

/* ============================================================================
   CONTRATO DE ENTRADA / SALIDA
   ============================================================================ */

/** Una fuente reducida a lo único que el cruce necesita: su id y su texto crudo. */
export interface FuenteBarrido {
  id: string;
  rawText: string;
}

export type TipoHallazgo =
  | "duplicado"
  | "mal-clasificado"
  | "fecha-ausente"
  | "vineta-sin-cifra"
  | "aptitud-sin-evidencia";

/**
 * La FUSIÓN propuesta para un clúster de duplicados. Es el corazón del bloque, y
 * lo más fácil de implementar mal:
 *   · EL DEFAULT ES FUSIONAR, NO DESCARTAR. Las versiones narrativas del
 *     cuestionario traen detalle que las de LinkedIn no tienen; descartarlas
 *     pierde información REAL del usuario.
 *   · Base (`keepId`): la versión con FECHAS y datos estructurados.
 *   · `data`: para cada campo se conserva el de la base; si la base lo tiene
 *     VACÍO, se RELLENA con el de otra versión (no se pierde el dato del otro).
 *     Para las aptitudes (`items`), se hace la UNIÓN de chips sin duplicar.
 *   · `vinetas: "reenganchar"`: las viñetas del descartado pasan a la base. Perder
 *     una viñeta con contenido propio es el fallo capital de este bloque.
 */
export interface CorreccionDuplicado {
  keepId: string;
  dropIds: string[];
  data: Record<string, string>;
  vinetas: DestinoVinetas;
}

export interface HallazgoDuplicado {
  tipo: "duplicado";
  cluster: ClusterDuplicado;
  fusion: CorreccionDuplicado;
}

export interface HallazgoMalClasificado {
  tipo: "mal-clasificado";
  itemId: string;
  nombre: string;
  /** propuesta: nombre → grupo, descripción → chips del grupo. */
  group: string;
  items: string;
  razon: string;
}

export interface HallazgoFecha {
  tipo: "fecha-ausente";
  itemId: string;
  kind: string;
  etiqueta: string;
  /** la fecha LITERAL hallada en la fuente. */
  dates: string;
  sourceId: string;
  /** la línea de la fuente donde estaba: es la evidencia que el usuario verá. */
  evidencia: string;
}

export interface HallazgoVineta {
  tipo: "vineta-sin-cifra";
  itemId: string;
  texto: string;
  sourceId: string;
  /** la línea de la fuente con la cifra que a la viñeta le falta. */
  evidencia: string;
  numeros: string[];
}

export interface HallazgoAptitud {
  tipo: "aptitud-sin-evidencia";
  itemId: string;
  group: string;
  /** los chips del grupo que NO aparecen en ninguna fuente. */
  sinEvidencia: string[];
}

export type Hallazgo =
  | HallazgoDuplicado
  | HallazgoMalClasificado
  | HallazgoFecha
  | HallazgoVineta
  | HallazgoAptitud;

/** Un paso del barrido, con cifras reales para pintar el progreso honesto. */
export interface PasoBarrido {
  clave: string;
  datos: Record<string, number>;
}

export interface ResumenBarrido {
  itemsRevisados: number;
  fuentes: number;
  /** clústeres de duplicados hallados. */
  duplicados: number;
  /** cuántos items SOBRARÍAN si se aplicaran TODAS las fusiones. */
  itemsSobrantes: number;
  malClasificados: number;
  fechasAusentes: number;
  vinetasSinCifra: number;
  aptitudesSinEvidencia: number;
  /** hallazgos AUTO-APLICABLES (fusión, reclasificar, rellenar fecha). Los
   *  consultivos —viñeta sin cifra, aptitud sin evidencia— no entran al lote: se
   *  muestran para que el usuario los resuelva a mano (editar prosa o borrar un
   *  dato es SIEMPRE su decisión, nunca la del sistema). */
  aplicables: number;
}

/**
 * ★ §H · el desglose del DESEMPATE con LLM barato. Viaja en la respuesta para que
 * el panel diga la verdad: si el juez corrió o no, cuántos pares dudosos se le
 * pasaron y cuántos confirmó. Sin clave (`ejecutado:false`) el barrido se queda en
 * DETERMINISTA y lo DICE — la mejora requiere clave; su ausencia degrada, no rompe.
 */
export interface DesempateInfo {
  /** ¿pudo correr el juez LLM? */
  ejecutado: boolean;
  /** por qué no corrió, si no corrió */
  motivo?: "sin-clave";
  /** pares dudosos generados (criba amplia, precisión baja a propósito) */
  candidatos: number;
  /** veredictos SÍ → nuevos hallazgos de duplicado que el usuario revisa uno a uno */
  confirmados: number;
}

export interface ResultadoBarrido {
  hallazgos: Hallazgo[];
  recorrido: PasoBarrido[];
  resumen: ResumenBarrido;
  /** presente cuando el barrido corre por `barrerMaster` (no en `analizarMaster` puro) */
  desempate?: DesempateInfo;
}

/** ¿Este tipo de hallazgo entra en el lote de «Aplicar las N correcciones»? */
export function esAplicable(h: Hallazgo): boolean {
  return h.tipo === "duplicado" || h.tipo === "mal-clasificado" || h.tipo === "fecha-ausente";
}

/* ============================================================================
   PASO 1 · ANALIZAR — PURO. No toca la base. Se prueba con el volcado real.
   ============================================================================ */

/** Los kinds que llevan fecha (y a los que, por tanto, se les puede FALTAR). */
const KINDS_CON_FECHA = new Set(["work", "education", "certification"]);

/** Anclas de un item para localizarlo en el raw_text (título + entidad). */
function anclasDe(item: MasterItem): string[] {
  const d = item.data ?? {};
  switch (item.kind) {
    case "work":
      return [str(d, "title"), str(d, "company")];
    case "education":
      return [str(d, "degree"), str(d, "institution")];
    case "certification":
      return [str(d, "name"), str(d, "issuer")];
    default:
      return [];
  }
}

/** Etiqueta legible de un item con fecha (para la tarjeta del hallazgo). */
function etiquetaConFecha(item: MasterItem): string {
  const d = item.data ?? {};
  const cab =
    item.kind === "work"
      ? str(d, "title") || str(d, "company")
      : item.kind === "education"
        ? str(d, "degree") || str(d, "institution")
        : str(d, "name") || str(d, "issuer");
  return cab || "(sin título)";
}

const lineasDe = (raw: string): string[] =>
  raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

// ── Reconocer un TROZO de fecha dentro de una línea de prosa ──────────────────
// Exige mes+año, MM/AAAA, o un rango con guion. Un año suelto embebido («…850 ms
// en 2024») NO cuenta: sería tomar la cifra de un logro por una fecha de empleo.
// Es la diferencia entre «evidencia literal» y un falso positivo que molesta.
const MES =
  "ene|feb|mar|abr|may|jun|jul|ago|sep|set|sept|oct|nov|dic|jan|apr|aug|dec|" +
  "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|" +
  "octubre|noviembre|diciembre|january|february|march|april|june|july|august|" +
  "september|october|november|december";
const ANYO = "(?:19|20)\\d{2}";
const ENDPOINT = `(?:(?:${MES})[a-z]*\\.?\\s*(?:de\\s+)?\\d{4}|\\d{1,2}[/\\-.]\\d{4})`;
const PRESENTE = "hoy|actualidad|actual|presente|present|current|now|en\\s+curso|a\\s+la\\s+fecha";
const RANGO_RE = new RegExp(`${ENDPOINT}\\s*[–—-]\\s*(?:${ENDPOINT}|${PRESENTE})`, "i");
// Un rango de AÑOS a secas («2014 – 2019», «2023 – hoy»): dos años unidos por un
// guion casi nunca son otra cosa que una fecha. Un año SUELTO embebido en prosa
// («…850 ms en 2024») no entra aquí a propósito: ese es un falso positivo caro.
const RANGO_ANYO_RE = new RegExp(`\\b${ANYO}\\s*[–—-]\\s*(?:${ANYO}|${PRESENTE})\\b`, "i");
const ENDPOINT_RE = new RegExp(ENDPOINT, "i");

/** El primer trozo de fecha VÁLIDO de una línea, o null. */
function fechaEnLinea(linea: string): string | null {
  const m = RANGO_RE.exec(linea) ?? RANGO_ANYO_RE.exec(linea) ?? ENDPOINT_RE.exec(linea);
  if (!m) return null;
  const chunk = m[0].trim();
  const dr = normalizeDateRange(chunk);
  if (dr.invalid) return null;
  if (!dr.start && !dr.end && !dr.current) return null;
  return chunk;
}

/**
 * Busca en las fuentes una FECHA para un item al que le falta. La fecha tiene que
 * estar en una línea con un trozo de fecha reconocible, Y alguna de las anclas del
 * item (su título o su empresa) debe aparecer en una ventana de ±2 líneas: así la
 * fecha se atribuye al item correcto y no a otro cargo del mismo documento.
 */
function buscarFecha(item: MasterItem, fuentes: FuenteBarrido[]): Omit<HallazgoFecha, "tipo" | "itemId" | "kind" | "etiqueta"> | null {
  const anclas = anclasDe(item).map(normalize).filter((a) => a.length >= 5);
  if (!anclas.length) return null;
  for (const f of fuentes) {
    const lineas = lineasDe(f.rawText);
    const norm = lineas.map(normalize);
    for (let i = 0; i < lineas.length; i++) {
      const chunk = fechaEnLinea(lineas[i]!);
      if (!chunk) continue;
      const lo = Math.max(0, i - 2);
      const hi = Math.min(lineas.length - 1, i + 2);
      let anclado = false;
      for (let j = lo; j <= hi && !anclado; j++) {
        if (anclas.some((a) => norm[j]!.includes(a))) anclado = true;
      }
      if (!anclado) continue;
      return { dates: chunk, sourceId: f.id, evidencia: lineas[i]! };
    }
  }
  return null;
}

/** ¿Es esta cifra un AÑO suelto (ruido para una viñeta de logro)? */
function esAnyo(raw: string, value: number, unit: string): boolean {
  return unit === "" && Number.isInteger(value) && value >= 1900 && value <= 2099 && !/[.,]/.test(raw);
}

/** tokens significativos (≥4 chars) de un texto normalizado. */
const tokens = (s: string): Set<string> =>
  new Set(normalize(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));

/**
 * Busca en las fuentes una CIFRA que a la viñeta le falta. La línea de la fuente
 * tiene que compartir ≥50% de los tokens de la viñeta (para casar la MISMA frase,
 * no una cualquiera con números) y traer una cifra que no sea un año suelto ni
 * esté ya en la viñeta.
 */
function buscarCifra(texto: string, fuentes: FuenteBarrido[]): Omit<HallazgoVineta, "tipo" | "itemId" | "texto"> | null {
  const toks = tokens(texto);
  if (toks.size < 2) return null; // demasiado corta para casar con seguridad
  const yaTiene = new Set(extractNumbers(texto).map((n) => n.raw));
  for (const f of fuentes) {
    for (const linea of lineasDe(f.rawText)) {
      const nums = extractNumbers(linea).filter((n) => !esAnyo(n.raw, n.value, n.unit));
      if (!nums.length) continue;
      const lt = tokens(linea);
      let inter = 0;
      for (const w of toks) if (lt.has(w)) inter++;
      if (inter / toks.size < 0.5) continue;
      const nuevas = [...new Set(nums.map((n) => n.raw).filter((r) => !yaTiene.has(r)))];
      if (nuevas.length) return { sourceId: f.id, evidencia: linea, numeros: nuevas };
    }
  }
  return null;
}

/* ── Elegir la BASE de una fusión ─────────────────────────────────────────────
   La base es la versión con FECHAS y datos estructurados. Regla, en orden:
     1. la que tenga una fecha que PARSEA a un rango real (no un vago «2 meses»);
     2. si ninguna, la que al menos tenga el campo de fecha con algo;
     3. si ninguna, todas — y entonces manda el resto de la regla.
   Dentro del grupo elegido: la que tenga MÁS campos con contenido, y a igualdad,
   la primera en orden de lectura (la que el detector ya trae como canónica).
   Nunca se elige por azar: perder la versión con fechas sería justo lo contrario
   de lo que pide el encargo. */
const valorCampo = (m: MiembroDuplicado, clave: string): string =>
  (m.campos.find((f) => f.clave === clave)?.valor ?? "").trim();
const camposLlenos = (m: MiembroDuplicado): number => m.campos.filter((f) => f.valor.trim()).length;
const fechaReal = (m: MiembroDuplicado): boolean => {
  const dr = normalizeDateRange(valorCampo(m, "dates"));
  return !dr.invalid && Boolean(dr.start || dr.end || dr.current);
};

export function elegirBase(c: ClusterDuplicado): MiembroDuplicado {
  const idx = new Map(c.miembros.map((m, i) => [m.id, i]));
  const conReal = c.miembros.filter(fechaReal);
  const conAlgo = c.miembros.filter((m) => valorCampo(m, "dates") !== "");
  const pool = conReal.length ? conReal : conAlgo.length ? conAlgo : c.miembros;
  return [...pool].sort(
    (a, b) => camposLlenos(b) - camposLlenos(a) || idx.get(a.id)! - idx.get(b.id)!,
  )[0]!;
}

/**
 * La fusión propuesta para un clúster. FUSIONAR por defecto: la base con fechas,
 * rellenando sus huecos con lo que aporten las otras versiones y uniendo los chips
 * de aptitudes. Nada se descarta: las viñetas se reenganchan.
 */
export function planFusion(c: ClusterDuplicado): CorreccionDuplicado {
  const base = elegirBase(c);
  const otros = c.miembros.filter((m) => m.id !== base.id);
  const claves = base.campos.map((f) => f.clave);
  const data: Record<string, string> = {};

  for (const clave of claves) {
    if (c.kind === "skill" && clave === "items") {
      // UNIÓN de chips (base primero): no se pierde ninguna aptitud de ninguna versión.
      let acc = chipsFromCsv(valorCampo(base, clave));
      for (const m of otros) acc = mergeChips(acc, chipsFromCsv(valorCampo(m, clave))).chips;
      data[clave] = chipsToCsv(acc);
      continue;
    }
    const baseVal = valorCampo(base, clave);
    if (baseVal) {
      data[clave] = baseVal;
      continue;
    }
    // hueco en la base: se RELLENA con la primera versión que lo tenga (no se pierde).
    for (const m of otros) {
      const v = valorCampo(m, clave);
      if (v) {
        data[clave] = v;
        break;
      }
    }
  }

  return { keepId: base.id, dropIds: otros.map((m) => m.id), data, vinetas: "reenganchar" };
}

/**
 * ★ EL ANÁLISIS COMPLETO. Cruza el master contra las fuentes y devuelve la lista
 * de hallazgos con su propuesta y su razón, más el recorrido honesto de lo que se
 * examinó. PURO: no toca la base, así que se prueba con el volcado real de 105
 * items sin una sola fila de DB de por medio.
 */
export function analizarMaster(
  items: MasterItem[],
  fuentes: FuenteBarrido[],
  opts: DetectOptions = {},
): ResultadoBarrido {
  const hallazgos: Hallazgo[] = [];

  // 1 · duplicados (se REUSA el detector; nunca se reimplementa).
  const clusters = clustersDeDuplicados(items, opts);
  for (const c of clusters) {
    hallazgos.push({ tipo: "duplicado", cluster: c, fusion: planFusion(c) });
  }
  const itemsSobrantes = clusters.reduce((n, c) => n + c.miembros.length - 1, 0);

  // 2 · proyectos que en realidad son grupos de aptitudes (looksLikeSkillGroup /
  //     classifyProjectShape). Solo si hay una lista real que volver chips.
  let malClasificados = 0;
  for (const it of items) {
    if (it.kind !== "project") continue;
    const nombre = str(it.data, "name");
    const desc = str(it.data, "description");
    const shape = classifyProjectShape(nombre, desc);
    if (shape.kind !== "skill-group") continue;
    const chips = chipsFromCsv(desc);
    if (chips.length < 2) continue; // sin lista clara no hay reclasificación limpia
    malClasificados++;
    hallazgos.push({
      tipo: "mal-clasificado",
      itemId: it.id,
      nombre,
      group: nombre,
      items: chipsToCsv(chips),
      razon: shape.reason,
    });
  }

  // Las tres que EXIGEN leer el raw_text: buscar en la fuente el dato que al master
  // le falta. Eso es evidencia literal, no invención.
  let fechasAusentes = 0;
  let vinetasSinCifra = 0;
  let aptitudesSinEvidencia = 0;

  if (fuentes.length > 0) {
    // 3 · fechas ausentes que SÍ están en alguna fuente.
    for (const it of items) {
      if (!KINDS_CON_FECHA.has(it.kind)) continue;
      if (str(it.data, "dates")) continue; // ya tiene fecha
      const hit = buscarFecha(it, fuentes);
      if (!hit) continue;
      fechasAusentes++;
      hallazgos.push({
        tipo: "fecha-ausente",
        itemId: it.id,
        kind: it.kind,
        etiqueta: etiquetaConFecha(it),
        ...hit,
      });
    }

    // 4 · viñetas sin cifra que SÍ tienen la cifra en el origen.
    for (const it of items) {
      if (it.kind !== "bullet") continue;
      const texto = str(it.data, "text");
      if (!texto || /\d/.test(texto)) continue; // ya trae cifra
      const hit = buscarCifra(texto, fuentes);
      if (!hit) continue;
      vinetasSinCifra++;
      hallazgos.push({ tipo: "vineta-sin-cifra", itemId: it.id, texto, ...hit });
    }

    // 5 · aptitudes sin evidencia. Los grupos manuales se saltan (el origen manual
    //     es el más verificable: lo escribió el humano). Se listan los chips que no
    //     aparecen en NINGUNA fuente — es consultivo, no se borra nada solo.
    const corpus = fuentes.map((f) => normalize(f.rawText)).join("  \n  ");
    for (const it of items) {
      if (it.kind !== "skill") continue;
      if (it.origin === "manual") continue;
      const chips = chipsFromCsv(str(it.data, "items"));
      const sin = chips.filter((c) => {
        const n = normalize(c);
        return n.length >= 2 && !corpus.includes(n);
      });
      if (!sin.length) continue;
      aptitudesSinEvidencia++;
      hallazgos.push({
        tipo: "aptitud-sin-evidencia",
        itemId: it.id,
        group: str(it.data, "group"),
        sinEvidencia: sin,
      });
    }
  }

  const nRoles = items.filter((i) => i.kind === "work").length;
  const nSkills = items.filter((i) => i.kind === "skill").length;

  const recorrido: PasoBarrido[] = [
    { clave: "barrido.paso.comparar", datos: { items: items.length, fuentes: fuentes.length } },
    { clave: "barrido.paso.experiencia", datos: { n: nRoles } },
    { clave: "barrido.paso.aptitudes", datos: { n: nSkills } },
    { clave: "barrido.paso.duplicados", datos: { n: clusters.length } },
    { clave: "barrido.paso.malclasificados", datos: { n: malClasificados } },
    {
      clave: "barrido.paso.cruce",
      datos: { fechas: fechasAusentes, cifras: vinetasSinCifra, aptitudes: aptitudesSinEvidencia },
    },
  ];

  const aplicables = hallazgos.filter(esAplicable).length;

  return {
    hallazgos,
    recorrido,
    resumen: {
      itemsRevisados: items.length,
      fuentes: fuentes.length,
      duplicados: clusters.length,
      itemsSobrantes,
      malClasificados,
      fechasAusentes,
      vinetasSinCifra,
      aptitudesSinEvidencia,
      aplicables,
    },
  };
}

/* ============================================================================
   ★ §H · DESEMPATE DE DUPLICADOS CON LLM BARATO — la pieza de más valor.
   ============================================================================

   EL PROBLEMA MEDIDO EN VIVO: el barrido DETERMINISTA (bloque B) sobre el master
   REAL de 105 items baja 10 roles a 9, no a los ~5 que el usuario espera. Los
   duplicados reales que quedan NO comparten texto, así que ningún algoritmo los ve:
     · «Founder & AI Engineer @ PharmIQ» vs «Desarrollador de software @ Químico
       farmacéutico» (Químico farmacéutico es la PROFESIÓN del cliente, no la
       empresa: cero solape textual en empresa).
     · Cuatro Tesseract con títulos totalmente distintos (becario / Práctica /
       Software Engineering Intern) y la empresa escrita de cuatro formas, una vacía.
     · Dos Scrum Master en la misma universidad, uno sin fecha ni viñetas.

   LA DIVISIÓN CORRECTA (§1.5 del contrato): el LLB barato SUBE EL RECALL; la
   confirmación humana MANTIENE LA PRECISIÓN. Nada de esto es «apilar modelos para
   fiabilidad» —eso solo añade modos de fallo—: es una CRIBA amplia y barata cuyo
   único trabajo es proponer pares al humano, que decide.

     a) CANDIDATOS con recall alto y precisión baja A PROPÓSITO: pares de roles que
        comparten una SEÑAL DÉBIL —misma empresa aunque mal escrita, fechas que se
        solapan, o una entidad compartida (PharmIQ, Tesseract, 3DLab)—. No hace falta
        que compartan texto: basta una entidad para que el par entre a la criba.
     b) JUEZ LLM barato, INYECTADO (como variant-ai.ts y ajuste.ts reciben su LLM):
        recibe los DOS textos completos y juzga IDENTIDAD —«¿es el mismo trabajo?»—,
        SÍ/NO + por qué. NO redacta ni inventa: solo juzga.
     c) Cada SÍ se convierte en un hallazgo de duplicado que el usuario REVISA una a
        una. La FUSIÓN sigue siendo la determinista del bloque B (planFusion: base con
        fecha + rellenar huecos + reenganchar viñetas). El juez NUNCA redacta el item
        fusionado.

   ⚠ SIN clave (ni 2ª ni Gemini) el juez no corre: el barrido se queda en 10→9 y lo
     DICE (`desempate.ejecutado:false`). La mejora requiere clave; su ausencia degrada.
   ⚠ El juez trabaja SOLO sobre roles (`work`): los ejemplos reales son todos roles y
     ahí la identidad no la da un algoritmo. Educación/certificaciones no se desempatan
     con LLM (su identidad —título+institución— sí la ve el determinista). */

/** El veredicto del juez sobre un par: ¿es el mismo trabajo? */
export interface VeredictoJuez {
  mismoTrabajo: boolean;
  /** por qué, en una frase. NO redacta el item: solo explica su juicio de identidad. */
  porque: string;
}

/**
 * El juez INYECTABLE. Recibe los dos textos completos (y los ids, por trazabilidad)
 * y devuelve identidad SÍ/NO. Se inyecta para poder testear con un doble sin red ni
 * clave — igual que VariantLLM y AjusteLLM.
 */
export type JuezDuplicados = (par: {
  aId: string;
  bId: string;
  aTexto: string;
  bTexto: string;
}) => Promise<VeredictoJuez>;

/** Un par candidato a desempate, con la señal débil que lo emparejó y los dos textos. */
export interface CandidatoDesempate {
  aId: string;
  bId: string;
  /** la señal DÉBIL (para depurar): «misma empresa», «comparten PharmIQ»… */
  senal: string;
  /** el texto completo de cada rol (cabecera + evidencia + viñetas): lo que ve el juez */
  aTexto: string;
  bTexto: string;
}

/** Un borde confirmado por el juez (los ids son el mismo trabajo). */
export interface BordeDesempate {
  aId: string;
  bId: string;
  porque: string;
}

/** Techo de candidatos: la criba es amplia, pero no infinita (cada par cuesta una
 *  llamada al juez). O(n²) sobre ~15-20 roles cabe de sobra bajo este techo. */
const MAX_CANDIDATOS = 300;

/** Índice de hijos (viñetas) por padre, para componer el texto completo de un rol. */
function indiceHijos(items: MasterItem[]): Map<string, MasterItem[]> {
  const m = new Map<string, MasterItem[]>();
  for (const it of items) {
    if (!it.parentId) continue;
    const l = m.get(it.parentId);
    if (l) l.push(it);
    else m.set(it.parentId, [it]);
  }
  return m;
}

/** El texto COMPLETO de un rol que ve el juez: cabecera + evidencia + todas sus viñetas. */
function textoRolCompleto(it: MasterItem, hijosDe: Map<string, MasterItem[]>): string {
  const d = it.data ?? {};
  const cab = [str(d, "title"), str(d, "company"), str(d, "dates")].filter(Boolean).join(" · ");
  const ev = (it.evidenceSnippet ?? "").trim();
  const vs = (hijosDe.get(it.id) ?? []).map((h) => str(h.data ?? {}, "text")).filter(Boolean);
  return [cab, ev, ...vs].filter(Boolean).join("\n");
}

/** Señales de contenido (entidades y cifras) de un rol, ya con sus viñetas dentro. */
function senalesRol(texto: string): { entidades: Set<string>; cifras: Set<string> } {
  const bag = signalsOf(texto);
  return { entidades: bag.entities, cifras: bag.numbers };
}

const interseccion = (a: Set<string>, b: Set<string>): string[] => {
  const out: string[] = [];
  for (const x of a) if (b.has(x)) out.push(x);
  return out;
};

/** El año (número) de un extremo de fecha, o null si es abierto («hoy») o no lo hay. */
const anioNum = (s: string | null): number | null => {
  if (!s) return null;
  const m = /\b(?:19|20)\d{2}\b/.exec(s);
  return m ? Number(m[0]) : null;
};

/**
 * ¿Se solapan dos rangos CERRADOS (ambos con año de inicio Y de fin)? Como señal
 * débil de candidato, el solape se exige CERRADO a propósito: un año suelto («2023»)
 * o un rango abierto («… – actualidad») dejaría el extremo sin acotar y «solaparía»
 * con casi todo, inundando la criba de pares falsos. Dos periodos cerrados que se
 * pisan sí es una pista real de que podría ser el mismo trabajo.
 */
function fechasSolapanCerrado(a: ReturnType<typeof parseRange>, b: ReturnType<typeof parseRange>): boolean {
  if (!a.ok || !b.ok) return false;
  const aS = anioNum(a.start), aE = anioNum(a.end);
  const bS = anioNum(b.start), bE = anioNum(b.end);
  if (aS == null || aE == null || bS == null || bE == null) return false;
  return aS <= bE && bS <= aE;
}

/**
 * GENERA LOS CANDIDATOS. Criba amplia sobre los roles (`work`) que NO están ya en el
 * mismo clúster determinista (esos ya son un hallazgo; no hay nada que preguntarle al
 * juez sobre ellos). Un par entra si comparte CUALQUIER señal débil:
 *   · misma empresa normalizada (igual o una contenida en la otra: «Tesseract» ⊂
 *     «TesseractSoftwares» tras normalizar);
 *   · fechas que se solapan de verdad;
 *   · al menos una ENTIDAD compartida (PharmIQ, Tesseract, 3DLab, Node…): así entra
 *     el par PharmIQ aunque su empresa no coincida en absoluto;
 *   · al menos una CIFRA compartida.
 * PURA y testeable: sin red, sin clave. El juez decide después; esto solo propone.
 */
export function generarCandidatosDesempate(items: MasterItem[], opts: DetectOptions = {}): CandidatoDesempate[] {
  const hijosDe = indiceHijos(items);
  const roles = items.filter((it) => it.kind === "work" && !it.parentId);
  if (roles.length < 2) return [];

  // Pares que YA están en el mismo clúster determinista (de roles): se saltan.
  const clusters = clustersDeDuplicados(items, opts).filter((c) => c.kind === "work");
  const clusterDe = new Map<string, string>();
  for (const c of clusters) for (const m of c.miembros) clusterDe.set(m.id, c.id);

  // Precómputo por rol: empresa normalizada, rango de fechas, señales de contenido.
  const info = new Map<
    string,
    { empresa: string; rango: ReturnType<typeof parseRange>; sen: ReturnType<typeof senalesRol>; texto: string }
  >();
  for (const it of roles) {
    const d = it.data ?? {};
    const texto = textoRolCompleto(it, hijosDe);
    info.set(it.id, {
      empresa: normalizeCompany(str(d, "company")),
      rango: parseRange(str(d, "dates")),
      sen: senalesRol(texto),
      texto,
    });
  }

  type Cand = CandidatoDesempate & { rango: number };
  const cands: Cand[] = [];

  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      const a = roles[i]!;
      const b = roles[j]!;
      // Ya emparejados por el determinista → nada que desempatar.
      const ca = clusterDe.get(a.id);
      if (ca && ca === clusterDe.get(b.id)) continue;

      const ia = info.get(a.id)!;
      const ib = info.get(b.id)!;

      // ── señal 1 · misma empresa (normalizada, con contención por camelCase) ──
      const emp =
        ia.empresa.length >= 3 &&
        ib.empresa.length >= 3 &&
        (ia.empresa === ib.empresa ||
          (ia.empresa.length >= 4 && ib.empresa.length >= 4 &&
            (ia.empresa.includes(ib.empresa) || ib.empresa.includes(ia.empresa))));
      // ── señal 2 · dos periodos CERRADOS que se solapan ──
      const fechas = fechasSolapanCerrado(ia.rango, ib.rango);
      // ── señal 3 · entidades compartidas (PharmIQ, Tesseract, 3DLab, Node…) ──
      const ents = interseccion(ia.sen.entidades, ib.sen.entidades);
      // ── señal 4 · cifras compartidas ──
      const nums = interseccion(ia.sen.cifras, ib.sen.cifras);

      if (!emp && !fechas && ents.length === 0 && nums.length === 0) continue;

      // Etiqueta legible de la señal más fuerte, y un rango para priorizar bajo el techo.
      let senal: string;
      let rango: number;
      if (emp) { senal = "misma empresa (aunque escrita distinto)"; rango = 4; }
      else if (fechas) { senal = "las fechas se solapan"; rango = 3; }
      else if (ents.length) { senal = `comparten «${ents.slice(0, 3).join(", ")}»`; rango = 2; }
      else { senal = `comparten la cifra ${nums.slice(0, 2).join(", ")}`; rango = 1; }

      cands.push({ aId: a.id, bId: b.id, senal, aTexto: ia.texto, bTexto: ib.texto, rango });
    }
  }

  // Si la criba desborda el techo, se quedan los pares de señal más fuerte primero.
  cands.sort((x, y) => y.rango - x.rango);
  return cands.slice(0, MAX_CANDIDATOS).map(({ rango: _r, ...c }) => c);
}

/**
 * Pasa cada candidato por el juez INYECTADO y devuelve los bordes que dijo SÍ. Un
 * juez que falla en un par no tumba el barrido: ese par se ignora (queda sin
 * confirmar), que es el lado seguro —no confirmar de más—. Async y aislada del
 * armado de clústeres para poder probarla con un doble.
 */
export async function juzgarCandidatos(
  candidatos: CandidatoDesempate[],
  juez: JuezDuplicados,
): Promise<BordeDesempate[]> {
  const bordes: BordeDesempate[] = [];
  for (const c of candidatos) {
    let v: VeredictoJuez;
    try {
      v = await juez({ aId: c.aId, bId: c.bId, aTexto: c.aTexto, bTexto: c.bTexto });
    } catch {
      continue; // el juez falló en este par: no se confirma (lado seguro)
    }
    if (v?.mismoTrabajo) bordes.push({ aId: c.aId, bId: c.bId, porque: (v.porque ?? "").trim() });
  }
  return bordes;
}

/** Construye un ClusterDuplicado desde MasterItems (para un grupo que armó el juez). */
function construirClusterDesempate(
  miembros: MasterItem[],
  hijosDe: Map<string, MasterItem[]>,
  reason: string,
): ClusterDuplicado {
  const kind = miembros[0]!.kind;
  const claveTit = CAMPOS_POR_KIND[kind]?.[0]?.clave ?? "title";
  return {
    id: miembros[0]!.id,
    kind,
    level: "media", // el juez SUGIERE; la precisión la pone la confirmación humana
    reason,
    signals: [],
    pares: [],
    miembros: miembros.map((it) => {
      const d = it.data ?? {};
      const campos = (CAMPOS_POR_KIND[it.kind] ?? []).map((c) => ({
        clave: c.clave,
        ph: c.ph,
        valor: str(d, c.clave),
      }));
      const empresa = str(d, "company") || str(d, "institution") || str(d, "issuer");
      const fechas = str(d, "dates");
      return {
        id: it.id,
        kind: it.kind,
        titulo: str(d, claveTit),
        subtitulo: [empresa, fechas].filter(Boolean).join(" · "),
        campos,
        vinetas: (hijosDe.get(it.id) ?? []).map((h) => ({ id: h.id, texto: str(h.data ?? {}, "text") })),
        origen: it.origin,
        evidencia: it.evidenceSnippet,
      };
    }),
  };
}

/**
 * ★ Combina el DETERMINISTA con los bordes del juez y devuelve TODOS los hallazgos de
 * duplicado (el conjunto de reemplazo, no un añadido). Los clústeres deterministas de
 * roles se SIEMBRAN en el union-find y los bordes del juez los EXTIENDEN; un grupo que
 * crece supersede a su clúster determinista (no se reporta dos veces). Los clústeres
 * que NO son roles (skills, proyectos, educación) pasan intactos: el juez no los toca.
 *
 * Con `bordes` vacío reproduce EXACTAMENTE los duplicados deterministas de hoy — esa
 * es la garantía de «sin juez, el barrido no cambia».
 */
export function duplicadosConDesempate(
  items: MasterItem[],
  opts: DetectOptions,
  bordes: BordeDesempate[],
): HallazgoDuplicado[] {
  const hijosDe = indiceHijos(items);
  const clusters = clustersDeDuplicados(items, opts);
  const workClusters = clusters.filter((c) => c.kind === "work");
  const otros = clusters.filter((c) => c.kind !== "work");

  const roles = items.filter((it) => it.kind === "work" && !it.parentId);
  const rolPorId = new Map(roles.map((it) => [it.id, it]));
  const ordenDe = new Map(items.map((it, i) => [it.id, i])); // orden de lectura del master

  // union-find sobre los roles, sembrado con los clústeres deterministas.
  const padre = new Map<string, string>();
  for (const it of roles) padre.set(it.id, it.id);
  const find = (k: string): string => {
    let r = k;
    while (padre.get(r) !== r) r = padre.get(r)!;
    while (padre.get(k) !== r) { const n = padre.get(k)!; padre.set(k, r); k = n; }
    return r;
  };
  const unir = (a: string, b: string) => {
    if (!padre.has(a) || !padre.has(b)) return; // ids que no son roles: se ignoran
    const ra = find(a), rb = find(b);
    if (ra !== rb) padre.set(rb, ra);
  };
  for (const c of workClusters) {
    const ids = c.miembros.map((m) => m.id);
    for (let i = 1; i < ids.length; i++) unir(ids[0]!, ids[i]!);
  }
  const porqueDe = new Map<string, string>(); // raíz → un «por qué» del juez
  for (const e of bordes) {
    unir(e.aId, e.bId);
    if (e.porque && !porqueDe.has(find(e.aId))) porqueDe.set(find(e.aId), e.porque);
  }

  // Agrupa los roles por raíz, en orden de lectura.
  const grupos = new Map<string, MasterItem[]>();
  for (const it of roles) {
    const r = find(it.id);
    const g = grupos.get(r);
    if (g) g.push(it);
    else grupos.set(r, [it]);
  }

  // Un clúster determinista reutilizable, indexado por su conjunto EXACTO de ids: si
  // el grupo final coincide, se reusa (conserva su nivel/razón/pares ricos); si creció
  // por el juez, se construye uno nuevo (el determinista queda superseded, no duplicado).
  const claveIds = (ids: string[]) => [...ids].sort().join("|");
  const detPorClave = new Map<string, ClusterDuplicado>();
  for (const c of workClusters) detPorClave.set(claveIds(c.miembros.map((m) => m.id)), c);

  const workHallazgos: HallazgoDuplicado[] = [];
  for (const [raiz, miembros] of grupos) {
    if (miembros.length < 2) continue;
    const ordenados = [...miembros].sort((a, b) => (ordenDe.get(a.id) ?? 0) - (ordenDe.get(b.id) ?? 0));
    const clave = claveIds(ordenados.map((m) => m.id));
    const det = detPorClave.get(clave);
    let cluster: ClusterDuplicado;
    if (det) {
      cluster = det; // idéntico al determinista: se reusa tal cual
    } else {
      const porque = porqueDe.get(raiz) ?? "";
      const reason = porque
        ? `El desempate con IA los marcó como el mismo trabajo: ${porque}`
        : "El desempate con IA los marcó como el mismo trabajo.";
      cluster = construirClusterDesempate(ordenados.filter((m) => rolPorId.has(m.id)), hijosDe, reason);
    }
    workHallazgos.push({ tipo: "duplicado", cluster, fusion: planFusion(cluster) });
  }

  // Los no-roles pasan intactos (misma forma que analizarMaster: cluster + planFusion).
  const otrosHallazgos: HallazgoDuplicado[] = otros.map((c) => ({
    tipo: "duplicado",
    cluster: c,
    fusion: planFusion(c),
  }));

  // Los grupos que más items le quitan de encima al usuario, primero.
  workHallazgos.sort((a, b) => b.cluster.miembros.length - a.cluster.miembros.length);
  return [...workHallazgos, ...otrosHallazgos];
}

/* ============================================================================
   Lectura de la base para el análisis (la parte con I/O; la lógica es la de arriba).
   ============================================================================ */

/** Trae las fuentes del usuario con su raw_text (RLS por auth.uid()). */
export async function fuentesDelUsuario(sb: SB, userId: string): Promise<FuenteBarrido[]> {
  const { data, error } = await sb
    .from("ingestion_sources")
    .select("id,raw_text")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r) => ({ id: r.id as string, rawText: typeof r.raw_text === "string" ? (r.raw_text as string) : "" }))
    .filter((f) => f.rawText.trim().length > 0);
}

/**
 * El barrido leyendo de la base: master + fuentes → análisis. No muta nada.
 *
 * ★ §H · si se INYECTA un `juez`, corre el desempate con LLM barato: genera pares
 * candidatos, los juzga uno a uno y REEMPLAZA los hallazgos de duplicado por el
 * conjunto combinado (determinista + confirmados por el juez). Sin juez, el barrido
 * se queda EN DETERMINISTA y lo DICE (`desempate.ejecutado:false`) — la mejora
 * requiere clave; su ausencia degrada, no rompe. El juez se inyecta desde la ruta
 * (con el modelo barato del router) para poder testear el desempate con un doble.
 */
export async function barrerMaster(
  sb: SB,
  userId: string,
  opts: DetectOptions = {},
  deps: { juez?: JuezDuplicados } = {},
): Promise<ResultadoBarrido> {
  // Import perezoso para no arrastrar queries.ts si un test solo usa analizarMaster.
  const { getMasterItems } = await import("@/lib/db/queries");
  const [items, fuentes] = await Promise.all([getMasterItems(sb, userId), fuentesDelUsuario(sb, userId)]);
  const base = analizarMaster(items, fuentes, opts);

  // Sin juez: determinista puro, y se DICE. Nada de fingir una mejora que no corrió.
  if (!deps.juez) {
    return { ...base, desempate: { ejecutado: false, motivo: "sin-clave", candidatos: 0, confirmados: 0 } };
  }

  // Con juez: la criba amplia + el juez + el conjunto combinado de duplicados.
  const candidatos = generarCandidatosDesempate(items, opts);
  const bordes = await juzgarCandidatos(candidatos, deps.juez);
  const dupHallazgos = duplicadosConDesempate(items, opts, bordes);

  // Reemplaza los duplicados del análisis por el conjunto combinado, deja el resto igual.
  const noDup = base.hallazgos.filter((h) => h.tipo !== "duplicado");
  const hallazgos: Hallazgo[] = [...dupHallazgos, ...noDup];
  const itemsSobrantes = dupHallazgos.reduce((n, h) => n + h.cluster.miembros.length - 1, 0);

  const recorrido: PasoBarrido[] = [
    ...base.recorrido,
    { clave: "barrido.paso.desempate", datos: { candidatos: candidatos.length, confirmados: bordes.length } },
  ];

  return {
    hallazgos,
    recorrido,
    resumen: {
      ...base.resumen,
      duplicados: dupHallazgos.length,
      itemsSobrantes,
      aplicables: hallazgos.filter(esAplicable).length,
    },
    desempate: { ejecutado: true, candidatos: candidatos.length, confirmados: bordes.length },
  };
}

/* ============================================================================
   PASO 2 · APLICAR — ejecuta EXACTAMENTE lo que el usuario seleccionó.
   ============================================================================
   El lote entero es REVERSIBLE con un solo deshacer porque la pantalla lo DIFIERE
   (UndoToast): esta función no corre hasta que la ventana de gracia expira. Undo =
   nunca se llamó. Por eso aquí no hay «deshacer» propio: o se aplicó todo, o nada.

   ⚠ Cada corrección vuelve a validarse en el servidor (ownership, tipos, fechas):
     el cliente puede AJUSTAR la propuesta, así que no se confía en lo que llega. */

export type Correccion =
  | {
      tipo: "duplicado";
      keepId: string;
      dropIds: string[];
      data?: Record<string, string>;
      vinetas?: DestinoVinetas;
      force?: boolean;
    }
  | { tipo: "fecha"; itemId: string; dates: string; sourceId?: string }
  | { tipo: "reclasificar"; itemId: string; group: string; items: string };

export interface FusionBloqueada {
  keepId: string;
  dropIds: string[];
  usage: { variantsCount: number; overridesCount: number; referencedIds: string[] };
}

export interface ResultadoAplicar {
  aplicadas: number;
  fusiones: number;
  fechas: number;
  reclasificadas: number;
  vinetasReenganchadas: number;
  /** fusiones que NO se aplicaron porque lo que se descartaba lo usa una variante
   *  (RESTRICT). Se informan con el uso real para que la pantalla ofrezca reintentar
   *  con force — nunca un 500 crudo, y nunca se borra a la brava. */
  bloqueadas: FusionBloqueada[];
  /** errores por corrección concreta; el lote sigue con las demás. */
  errores: string[];
}

/** Claves de procedencia de la fecha (se recalculan enteras al escribir). */
const DATE_META = ["dateStart", "dateEnd", "dateCurrent", "dateMissing", "dateInvalid", "dateByHuman", "dateBySource"];

/**
 * data + la fecha HALLADA EN LA FUENTE. Espeja mergeDates de la pantalla, pero la
 * procedencia es distinta y honesta: `dateBySource` (vino de una fuente, no de una
 * persona ni de la IA). No se sobrescribe una fecha ya puesta.
 */
function construirFecha(prev: Record<string, unknown>, raw: string, sourceId?: string): Record<string, unknown> | null {
  const text = raw.trim();
  const dr = normalizeDateRange(text);
  if (dr.invalid) return null;
  if (!dr.start && !dr.end && !dr.current) return null;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(prev)) if (!DATE_META.includes(k)) next[k] = v;
  next.dates = text;
  if (sourceId) next.dateBySource = sourceId;
  else next.dateBySource = true;
  if (dr.start) next.dateStart = dr.start;
  if (dr.end) next.dateEnd = dr.end;
  if (dr.current) next.dateCurrent = true;
  return next;
}

export async function aplicarBarrido(
  sb: SB,
  userId: string,
  correcciones: Correccion[],
): Promise<ResultadoAplicar> {
  const out: ResultadoAplicar = {
    aplicadas: 0,
    fusiones: 0,
    fechas: 0,
    reclasificadas: 0,
    vinetasReenganchadas: 0,
    bloqueadas: [],
    errores: [],
  };

  // Las fusiones ANTES que el resto: una fusión mueve/borra items, y reclasificar o
  // rellenar la fecha de un item que otra corrección va a descartar sería trabajo
  // perdido. El orden lo fija el sistema, no el cliente.
  const orden = [...correcciones].sort(
    (a, b) => (a.tipo === "duplicado" ? 0 : 1) - (b.tipo === "duplicado" ? 0 : 1),
  );

  for (const c of orden) {
    try {
      if (c.tipo === "duplicado") {
        const r = await resolverDuplicado(sb, userId, {
          keepId: c.keepId,
          dropIds: c.dropIds,
          data: c.data,
          vinetas: c.vinetas ?? "reenganchar",
          force: c.force === true,
        });
        if (r.bloqueado) {
          out.bloqueadas.push({ keepId: c.keepId, dropIds: c.dropIds, usage: r.usage });
          continue;
        }
        out.fusiones++;
        out.aplicadas++;
        out.vinetasReenganchadas += r.vinetasReenganchadas;
      } else if (c.tipo === "fecha") {
        const { data: fila, error } = await sb
          .from("profile_items")
          .select("id,data")
          .eq("id", c.itemId)
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!fila) throw new Error("El item de la fecha no existe o no es tuyo.");
        const prev = (fila.data as Record<string, unknown>) ?? {};
        if (str(prev, "dates")) continue; // ya tiene fecha: no se pisa
        const next = construirFecha(prev, c.dates, c.sourceId);
        if (!next) throw new Error("La fecha hallada no se pudo interpretar.");
        const { error: uErr } = await sb
          .from("profile_items")
          .update({ data: next })
          .eq("id", c.itemId)
          .eq("user_id", userId);
        if (uErr) throw new Error(uErr.message);
        out.fechas++;
        out.aplicadas++;
      } else {
        // reclasificar: proyecto → grupo de aptitudes, EN SU SITIO. Cambiar el kind y
        // reformar la data conserva el id y TODA la procedencia (origin, evidencia,
        // source_id). No se borra ni se crea nada: no hay dato que se pierda.
        const { data: fila, error } = await sb
          .from("profile_items")
          .select("id,kind,data")
          .eq("id", c.itemId)
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!fila) throw new Error("El item a reclasificar no existe o no es tuyo.");
        if (String(fila.kind) !== "project") throw new Error("Solo se reclasifica un proyecto.");
        const group = c.group.trim();
        const items = chipsToCsv(chipsFromCsv(c.items));
        if (!group) throw new Error("Falta el nombre del grupo.");
        const prev = (fila.data as Record<string, unknown>) ?? {};
        const next: Record<string, unknown> = { ...prev, group, items };
        delete next.name;
        delete next.description;
        delete next.url;
        const { error: uErr } = await sb
          .from("profile_items")
          .update({ kind: "skill", data: next })
          .eq("id", c.itemId)
          .eq("user_id", userId);
        if (uErr) throw new Error(uErr.message);
        out.reclasificadas++;
        out.aplicadas++;
      }
    } catch (e) {
      out.errores.push(e instanceof Error ? e.message : "error");
    }
  }

  return out;
}
