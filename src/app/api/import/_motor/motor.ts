import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runImport, type ImportOutcome } from "@/lib/extract/pipeline";
import { makeGeminiExtractor } from "@/lib/extract/llm";
import { fetchGithubUser } from "@/lib/extract/github";
import { fetchViaJina } from "@/lib/extract/web";
import { extractFile, extractDepsFor, type FileKind } from "@/lib/extract/files";
import { fileKindFromName, insertStagedTwoPhase } from "@/lib/db/sources";
import { registrarIngesta } from "@/lib/db/telemetria";
import {
  ETAPA, MS_RECLAMO, derivarProgreso, esReclamable,
  type FilaEvento, type FilaFuente, type Progreso,
} from "@/lib/ingesta/progreso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL MOTOR REANUDABLE — el trabajo avanza a TROZOS y cada trozo queda escrito
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ★★ LO QUE SE COMPROBÓ ANTES DE ESCRIBIR UNA LÍNEA (docs de Vercel, julio 2026)
 *
 *   · maxDuration: Hobby 300 s por defecto Y COMO MÁXIMO. Pro 800 s (1800 s en
 *     beta). No hay forma de pedir más en Hobby.
 *   · `waitUntil` (y por tanto `after()` de Next, que es lo mismo en Vercel):
 *     «Promises passed to waitUntil() will have the same timeout as the function
 *     itself. If the function times out, the promises will be cancelled.»
 *     ⇒ seguir trabajando tras responder NO regala tiempo: regala que el usuario
 *       no tenga que esperar mirando. El techo sigue siendo el de la invocación.
 *   · Cron en Hobby: UNA VEZ AL DÍA, con precisión de ±59 min.
 *     ⇒ una cola drenada por cron significa que una ingesta puede tardar 24 h.
 *       Eso no es un producto. Descartado por dato, no por gusto.
 *
 * DE AHÍ SALE ESTE DISEÑO, y es el único que sobrevive en Vercel SIN añadir un
 * servicio, una dependencia ni una factura nueva:
 *
 *   1. El trabajo se parte en UNIDADES DURABLES: una fuente. Cada fuente que
 *      termina deja su `status` y sus `staged_items` ESCRITOS. Nada vive en
 *      memoria entre fuentes.
 *   2. Una invocación procesa TODAS las que le quepan en su presupuesto y, si se
 *      queda sin tiempo, se para LIMPIA dejando el trabajo EN PAUSA — no roto.
 *   3. Cualquier invocación posterior (la del observador que ve la pausa) retoma
 *      exactamente donde estaba, porque el «dónde estaba» es una columna, no una
 *      variable.
 *
 * ★ LO QUE ESTO NO ES, dicho en voz alta: no es un worker autónomo. Si el
 *   presupuesto se agota Y NADIE vuelve a abrir la app, el trabajo se queda en
 *   pausa hasta que alguien vuelva. No se pierde, no se corrompe y no se repite:
 *   espera. La alternativa autónoma de verdad exige un servicio externo (Render)
 *   o Vercel Workflows, y las dos son decisiones de infraestructura del usuario.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ★ POR QUÉ UNA FUENTE = UNA EXTRACCIÓN (y no el churro de hoy)
 *
 * Hoy `/api/import/context` concatena TODO en un solo texto, crea UNA fuente
 * kind='paste' con todos los items colgando, y luego inserta cada archivo como
 * su propia fuente SIN NINGÚN ITEM. Por eso las 14 capturas salen «extraída ·
 * 0 items» aunque sí aportaron texto: no es un fallo de visión, es de
 * ATRIBUCIÓN. Aquí cada fuente se lee, se extrae y se escribe POR SEPARADO, así
 * que sus items son SUYOS. La atribución deja de ser una promesa.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Cuántas veces se reintenta una fuente que reventó antes de darla por fallida.
 *  Uno: cubre el fallo transitorio (red, 429 del proveedor) sin convertir un
 *  error determinista en un bucle que se paga a cada vuelta. */
export const MAX_REINTENTOS = 1;

/**
 * Cuánto tiempo sigue el motor COGIENDO fuentes nuevas. No es el maxDuration:
 * es el momento a partir del cual ya no vale la pena empezar otra, porque la
 * que empieces puede no caber.
 *
 * 240 s con maxDuration=300 deja 60 s de margen para que la fuente que arrancó
 * en el segundo 239 termine y ESCRIBA. Si aun así no cabe, la invocación muere
 * a mitad, la fuente se queda en 'parsing' sin señal y la siguiente la reclama y
 * la rehace entera — sin duplicar nada, porque procesar una fuente es
 * idempotente (ver `procesarFuente`).
 */
export const PRESUPUESTO_MS = 240_000;

/* ══════════════════════════════════════════════════════════════════════════
   LO QUE EL MOTOR NECESITA DE FUERA — todo inyectable, todo probable sin red
   ══════════════════════════════════════════════════════════════════════════ */

/** La fuente tal como la necesita el motor (más campos que `FilaFuente`). */
export interface FuenteTrabajo extends FilaFuente {
  storage_path: string | null;
  raw_text: string | null;
  raw_text_is_transcription: boolean;
}

/** Lo que devuelve leer un archivo: texto + honestidad sobre cómo se leyó. */
export interface LecturaArchivo {
  text: string;
  isTranscription: boolean;
  pageCount?: number;
  warning?: string;
}

export interface MotorDeps {
  /** Storage → texto. Solo se llama para fuentes con `storage_path`. */
  leerArchivo(f: FuenteTrabajo): Promise<LecturaArchivo>;
  /** El pipeline entero sobre el texto de UNA fuente. */
  extraer(texto: string): Promise<ImportOutcome>;
  /** Inyectado para que los tests puedan colocarse en el borde exacto del plazo. */
  ahora(): number;
  presupuestoMs: number;
  msReclamo: number;
}

/** Cómo terminó ESTA invocación del motor. Ninguno de los tres es un error. */
export type EstadoAvance =
  /** no queda nada por hacer */
  | "terminado"
  /** se acabó el presupuesto de la invocación; el trabajo espera a que lo empujen */
  | "pausado"
  /** todas las fuentes restantes las tiene otro trabajador VIVO */
  | "ocupado";

export interface ResultadoAvance {
  estado: EstadoAvance;
  /** fuentes que ESTA invocación llevó a un estado terminal */
  avanzadas: number;
  progreso: Progreso;
}

/* ══════════════════════════════════════════════════════════════════════════
   ACCESO A DATOS — todo con la RLS del usuario puesta
   ══════════════════════════════════════════════════════════════════════════ */

const COLS_FUENTE =
  "id,kind,original_name,status,error,created_at,storage_path,raw_text,raw_text_is_transcription";

export async function leerFuentes(sb: SupabaseClient, userId: string, jobId: string): Promise<FuenteTrabajo[]> {
  const { data, error } = await sb
    .from("ingestion_sources")
    .select(COLS_FUENTE)
    .eq("batch_id", jobId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Fuentes del trabajo: ${error.message}`);
  return (data ?? []) as unknown as FuenteTrabajo[];
}

export async function leerEventos(sb: SupabaseClient, userId: string, ids: string[]): Promise<FilaEvento[]> {
  if (!ids.length) return [];
  const { data, error } = await sb
    .from("ingestion_events")
    .select("source_id,message,payload,created_at")
    .eq("user_id", userId)
    .in("source_id", ids)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Eventos del trabajo: ${error.message}`);
  return (data ?? []) as unknown as FilaEvento[];
}

/**
 * Escribe una etapa. NUNCA lanza: el progreso es un subproducto y no puede
 * tumbar una ingesta que va bien — la misma doctrina que `registrarIngesta`.
 * Devuelve false si no se pudo escribir, para que el que llame lo sepa.
 */
export async function registrarEtapa(
  sb: SupabaseClient,
  userId: string,
  sourceId: string,
  clave: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { error } = await sb
      .from("ingestion_events")
      .insert({ source_id: sourceId, user_id: userId, message: clave, payload });
    return !error;
  } catch {
    return false;
  }
}

/**
 * ★ EL CANDADO CONTRA EL TRABAJO DOBLE. Un UPDATE condicionado al estado que se
 * ESPERABA encontrar: `where id = ? and status = <esperado>`. PostgREST devuelve
 * las filas afectadas, así que si vuelve vacío es que otra invocación se la
 * llevó primero. Es un compare-and-set atómico hecho con lo que hay, sin
 * `select … for update` ni una tabla de locks (que sería una migración).
 */
export async function reclamarFuente(
  sb: SupabaseClient,
  userId: string,
  sourceId: string,
  estadoEsperado: string,
): Promise<boolean> {
  const { data, error } = await sb
    .from("ingestion_sources")
    .update({ status: "parsing" })
    .eq("id", sourceId)
    .eq("user_id", userId)
    .eq("status", estadoEsperado)
    .select("id");
  if (error) throw new Error(`Reclamar fuente: ${error.message}`);
  return (data ?? []).length > 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   ELECCIÓN DE LA SIGUIENTE FUENTE — pura, para probar el borde del plazo
   ══════════════════════════════════════════════════════════════════════════ */

/** Última señal (ms epoch) de cada fuente. Sin evento, no hay entrada. */
export function ultimaSenalPorFuente(eventos: FilaEvento[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of eventos) {
    const t = Date.parse(e.created_at);
    if (!Number.isFinite(t)) continue;
    const prev = m.get(e.source_id);
    if (prev === undefined || t > prev) m.set(e.source_id, t);
  }
  return m;
}

/**
 * La siguiente fuente que ESTA invocación puede tomar, y con qué estado esperado
 * hay que reclamarla (el compare-and-set necesita saberlo).
 *
 * Prioriza las 'pending' sobre las huérfanas: rehacer una huérfana cuesta una
 * extracción entera, y mientras haya trabajo virgen ese gasto puede esperar.
 */
export function siguienteFuente(
  fuentes: FuenteTrabajo[],
  eventos: FilaEvento[],
  ahora: number,
  msReclamo: number = MS_RECLAMO,
): { fuente: FuenteTrabajo; estadoEsperado: string } | null {
  const senal = ultimaSenalPorFuente(eventos);
  const desde = (f: FuenteTrabajo): number | null => {
    const t = senal.get(f.id);
    return t === undefined ? null : Math.max(0, ahora - t);
  };
  const pendiente = fuentes.find((f) => f.status === "pending");
  if (pendiente) return { fuente: pendiente, estadoEsperado: "pending" };
  const huerfana = fuentes.find((f) => f.status === "parsing" && esReclamable(f.status, desde(f), null, msReclamo));
  return huerfana ? { fuente: huerfana, estadoEsperado: "parsing" } : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   EL BUCLE
   ══════════════════════════════════════════════════════════════════════════ */

export async function avanzarTrabajo(
  sb: SupabaseClient,
  userId: string,
  jobId: string,
  deps: MotorDeps,
): Promise<ResultadoAvance> {
  const inicio = deps.ahora();
  let avanzadas = 0;

  // Guarda dura contra un bucle infinito: aunque un estado imposible hiciera que
  // el bucle no progresara, hay un techo de vueltas. Cada fuente puede tocarse
  // como mucho (1 + MAX_REINTENTOS) veces, más un margen.
  let vueltas = 0;

  for (;;) {
    const fuentes = await leerFuentes(sb, userId, jobId);
    const eventos = await leerEventos(sb, userId, fuentes.map((f) => f.id));
    const progreso = derivarProgreso(jobId, fuentes, eventos, deps.ahora());

    if (progreso.terminado) return { estado: "terminado", avanzadas, progreso };

    if (++vueltas > fuentes.length * (2 + MAX_REINTENTOS) + 4) {
      return { estado: "ocupado", avanzadas, progreso };
    }

    // ¿Queda presupuesto para EMPEZAR otra? La comprobación va antes de reclamar:
    // reclamar y no poder terminar es exactamente lo que deja huérfanas.
    if (deps.ahora() - inicio >= deps.presupuestoMs) {
      const proxima = fuentes.find((f) => f.status === "pending") ?? fuentes[fuentes.length - 1];
      if (proxima) {
        await registrarEtapa(sb, userId, proxima.id, ETAPA.pausa, {
          hechas: progreso.listas,
          total: progreso.total,
          motivo: "presupuesto-invocacion",
        });
      }
      return { estado: "pausado", avanzadas, progreso };
    }

    const elegida = siguienteFuente(fuentes, eventos, deps.ahora(), deps.msReclamo);
    // Sin candidata pero sin terminar ⇒ las que quedan las tiene otro trabajador
    // VIVO. No es un error: es que aquí no hay nada que hacer.
    if (!elegida) return { estado: "ocupado", avanzadas, progreso };

    const tomada = await reclamarFuente(sb, userId, elegida.fuente.id, elegida.estadoEsperado);
    if (!tomada) continue; // se la llevó otro entre el SELECT y el UPDATE: a por la siguiente

    await procesarFuente(sb, userId, elegida.fuente, progreso, eventos, deps);
    avanzadas += 1;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   UNA FUENTE, DE PRINCIPIO A FIN
   ══════════════════════════════════════════════════════════════════════════ */

/** Cuántas veces se ha reintentado ya esta fuente (se cuenta de sus eventos). */
function intentosDe(eventos: FilaEvento[], sourceId: string): number {
  return eventos.filter((e) => e.source_id === sourceId && e.message === ETAPA.reintento).length;
}

const motivo = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Nombre visible de una fuente. Nunca vacío: un log sin nombre no dice nada. */
export const nombreDe = (f: FuenteTrabajo): string => (f.original_name ?? "").trim() || f.kind || "fuente";

async function procesarFuente(
  sb: SupabaseClient,
  userId: string,
  fuente: FuenteTrabajo,
  progreso: Progreso,
  eventos: FilaEvento[],
  deps: MotorDeps,
): Promise<void> {
  const nombre = nombreDe(fuente);
  const linea = progreso.fuentes.find((l) => l.id === fuente.id);
  const base = { nombre, indice: linea?.indice ?? 0, total: progreso.total, kind: fuente.kind };

  try {
    await registrarEtapa(sb, userId, fuente.id, ETAPA.leyendo, base);

    /* ── 1 · el texto de ESTA fuente y de ninguna otra ───────────────────── */
    let texto = (fuente.raw_text ?? "").trim();
    let esTranscripcion = fuente.raw_text_is_transcription;
    let paginas: number | undefined;
    let aviso: string | undefined;

    if (fuente.storage_path) {
      // Solo la transcripción de imagen/PDF escaneado merece etapa propia: es la
      // que tarda de verdad y la que el usuario necesita ver nombrada.
      if (fuente.kind === "image") {
        await registrarEtapa(sb, userId, fuente.id, ETAPA.transcribiendo, base);
      }
      const lec = await deps.leerArchivo(fuente);
      texto = lec.text.trim();
      esTranscripcion = lec.isTranscription;
      paginas = lec.pageCount;
      aviso = lec.warning;
    }

    /* ── 2 · sin texto NO se inventa nada: se falla en voz alta ──────────── */
    if (!texto) {
      const razon = aviso ?? "No se pudo leer texto de esta fuente.";
      await sb
        .from("ingestion_sources")
        .update({ status: "failed", error: razon, raw_text_is_transcription: esTranscripcion })
        .eq("id", fuente.id)
        .eq("user_id", userId);
      await registrarEtapa(sb, userId, fuente.id, ETAPA.fallida, { ...base, motivo: razon });
      return;
    }

    /* ── 3 · extracción, cruce y escritura ──────────────────────────────── */
    await registrarEtapa(sb, userId, fuente.id, ETAPA.extrayendo, { ...base, caracteres: texto.length });
    const res = await deps.extraer(texto);

    await registrarEtapa(sb, userId, fuente.id, ETAPA.cruzando, { ...base, candidatos: res.staged.length });

    /* ★ IDEMPOTENCIA POR FUENTE. Si esta fuente ya se había intentado (una
       invocación muerta a mitad, un reintento), pudo dejar filas escritas. Se
       borran las PENDIENTES de ESTA fuente antes de escribir las nuevas.
       ⚠ Solo 'pending': lo que el usuario ya aceptó o rechazó es suyo y no se
         toca — rehacer una lectura no puede deshacer una decisión. */
    const { error: limpieza } = await sb
      .from("staged_items")
      .delete()
      .eq("source_id", fuente.id)
      .eq("user_id", userId)
      .eq("status", "pending");
    if (limpieza) throw new Error(`Limpiar staging previo: ${limpieza.message}`);

    const n = await insertStagedTwoPhase(sb, userId, fuente.id, res.staged);

    const { error: upd } = await sb
      .from("ingestion_sources")
      .update({
        status: "extracted",
        raw_text: texto,
        raw_text_is_transcription: esTranscripcion,
        page_count: paginas ?? null,
        // El aviso de lectura (PDF sin capa de texto, imagen a medias) se guarda
        // aunque la fuente haya salido bien: es información honesta, no un fallo.
        error: aviso ?? null,
      })
      .eq("id", fuente.id)
      .eq("user_id", userId);
    if (upd) throw new Error(`Cerrar fuente: ${upd.message}`);

    // Telemetría de gasto: por fuente, que es como se puede auditar de verdad.
    if (res.consumo) {
      await registrarIngesta(sb, userId, fuente.id, {
        consumo: res.consumo,
        contexto: res.lectura?.contexto ?? [],
      });
    }

    // Los avisos de la lectura viajan en el evento de cierre. Un aviso que no
    // llega al usuario es lo mismo que no avisar.
    const avisos = [...(res.warnings ?? []), ...(aviso ? [aviso] : [])];
    await registrarEtapa(sb, userId, fuente.id, ETAPA.lista, { ...base, items: n, avisos });
  } catch (e) {
    const razon = motivo(e);
    const yaIntentado = intentosDe(eventos, fuente.id);
    if (yaIntentado < MAX_REINTENTOS) {
      // Vuelve a la cola. El evento de reintento ES el contador: sin él la
      // fuente podría rebotar para siempre y pagarse en cada vuelta.
      await registrarEtapa(sb, userId, fuente.id, ETAPA.reintento, {
        ...base,
        intento: yaIntentado + 1,
        motivo: razon,
      });
      await sb
        .from("ingestion_sources")
        .update({ status: "pending", error: razon })
        .eq("id", fuente.id)
        .eq("user_id", userId);
      return;
    }
    await sb
      .from("ingestion_sources")
      .update({ status: "failed", error: razon })
      .eq("id", fuente.id)
      .eq("user_id", userId);
    await registrarEtapa(sb, userId, fuente.id, ETAPA.fallida, { ...base, motivo: razon });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   LAS DEPENDENCIAS REALES
   ══════════════════════════════════════════════════════════════════════════ */

/** El tipo de archivo se deduce del NOMBRE, no del `kind` de la base: el enum
 *  `source_kind` no tiene valor para «archivo de texto» y un .md se guarda como
 *  'paste' (ver `sourceKindFor` en db/sources.ts). El nombre sí lo sabe. */
function kindDeArchivo(f: FuenteTrabajo): FileKind {
  return fileKindFromName(f.original_name ?? "", undefined) ?? "text";
}

export function depsReales(sb: SupabaseClient, byok?: string): MotorDeps {
  const extractDeps = extractDepsFor(byok);
  return {
    async leerArchivo(f) {
      const path = f.storage_path!;
      const { data: blob, error } = await sb.storage.from("sources").download(path);
      if (error || !blob) throw new Error(error?.message ?? "no se pudo descargar de Storage");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const ex = await extractFile(
        { kind: kindDeArchivo(f), bytes, mime: blob.type || undefined, name: f.original_name ?? undefined },
        extractDeps,
      );
      return { text: ex.text, isTranscription: ex.isTranscription, pageCount: ex.pageCount, warning: ex.warning };
    },
    extraer: (texto) =>
      runImport(
        { pastedText: texto, files: [] },
        { extract: makeGeminiExtractor(byok), fetchGithubUser, fetchWeb: fetchViaJina },
      ),
    ahora: () => Date.now(),
    presupuestoMs: PRESUPUESTO_MS,
    msReclamo: MS_RECLAMO,
  };
}
