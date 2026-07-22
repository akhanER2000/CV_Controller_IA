/**
 * ════════════════════════════════════════════════════════════════════════════
 * INGESTA DURABLE · EL MODELO DE PROGRESO (puro, sin servidor, sin red)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ★ POR QUÉ ESTE FICHERO EXISTE Y POR QUÉ ES PURO
 *
 * El estado de una ingesta vive en la BASE, no en la pestaña. Eso obliga a que
 * la MISMA derivación «filas de la base → qué está pasando» corra en tres
 * sitios: el navegador (que sondea y pinta), el servidor (que decide si un
 * trabajo sigue vivo) y los tests (que la rompen a propósito). Si cada uno
 * calculara lo suyo, serían tres verdades que se separan — y este producto ya
 * tuvo una pantalla que enseñaba números que nadie podía comprobar.
 *
 * Por eso aquí NO se importa `server-only`, ni Supabase, ni nada de Next: se
 * reciben FILAS y se devuelve un modelo. Se prueba sin base de datos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ★ LAS DOS TABLAS QUE YA EXISTÍAN (cero migraciones)
 *
 *   · `ingestion_batches`  → ES EL TRABAJO. Su id es el que devuelve el POST.
 *   · `ingestion_sources`  → UNA FILA POR FUENTE REAL, con su `status`
 *     (pending → parsing → extracted|failed). El enum `ingestion_status` de
 *     0001_schema.sql ya tenía exactamente esos estados y NADIE los usaba como
 *     máquina de estados: se insertaba 'extracted' de golpe al final.
 *   · `ingestion_events`   → EL PROGRESO. `message` es CLAVE DE I18N (así lo
 *     documenta el esquema) y `payload` el dato. Tiene RLS «own rows», así que
 *     el navegador la lee directo con la anon key: sondear sale gratis en
 *     invocaciones, que es justo lo que no pasa con SSE en serverless.
 *
 * NO se inventa ninguna tabla nueva porque `supabase/migrations` está fuera de
 * la frontera y porque las migraciones de este proyecto se aplican A MANO: una
 * tabla nueva sería una función que en producción no existe hasta que alguien
 * pegue un SQL. Lo que hay basta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ★ NINGÚN PORCENTAJE INVENTADO
 *
 * No hay un `percent`. Hay «fuente 3 de 16», el NOMBRE de la fuente, la ETAPA
 * concreta y los items REALES contados hasta ahora. Cuando no se sabe cuánto
 * falta —y no se sabe: una captura tarda 2 s y un PDF de 40 páginas 90— se dice
 * QUÉ se está haciendo. Un 47% sería un número sin fuente.
 * ════════════════════════════════════════════════════════════════════════════
 */

/* ══════════════════════════════════════════════════════════════════════════
   1 · EL CATÁLOGO DE ETAPAS — claves de i18n, jamás copy
   ══════════════════════════════════════════════════════════════════════════
   Van en `ingestion_events.message`, que el esquema comenta como «clave de
   i18n, no texto hardcodeado». Enum cerrado: la base no guarda frases, y una
   etapa nueva obliga a pasar por aquí (y por los dos idiomas del diccionario).

   Se declaran AQUÍ y no en `db/telemetria.ts` porque ese módulo importa
   `server-only` y el navegador tiene que poder leer estas mismas constantes
   para pintar el log. `telemetria.ts` conserva su propio EVENTO (consumo /
   contexto), que es telemetría de gasto y no etapa de progreso.               */

export const ETAPA = {
  /** la fuente se dio de alta y espera turno */
  encolada: "ingesta.etapa.encolada",
  /** se está sacando el texto del archivo (o se toma el ya pegado) */
  leyendo: "ingesta.etapa.leyendo",
  /** imagen o PDF escaneado: transcripción VERBATIM antes de extraer nada */
  transcribiendo: "ingesta.etapa.transcribiendo",
  /** el modelo estructura y cita evidencia */
  extrayendo: "ingesta.etapa.extrayendo",
  /** se cruza contra lo ya extraído (duplicados) y se escribe en staging */
  cruzando: "ingesta.etapa.cruzando",
  /** la fuente terminó bien; payload.items = cuántos aportó ELLA */
  lista: "ingesta.etapa.lista",
  /** la fuente falló; payload.motivo = por qué, tal cual */
  fallida: "ingesta.etapa.fallida",
  /** falló pero se le da otra oportunidad; payload.intento */
  reintento: "ingesta.etapa.reintento",
  /** la invocación se quedó sin presupuesto: el trabajo queda EN PAUSA, no roto */
  pausa: "ingesta.etapa.pausa",
  /** otra invocación retomó el trabajo donde estaba */
  reanudado: "ingesta.etapa.reanudado",
} as const;

export type EtapaClave = (typeof ETAPA)[keyof typeof ETAPA];

/** Las etapas conocidas, para validar lo que vuelve de la base sin confiar. */
const ETAPAS: readonly string[] = Object.values(ETAPA);

/** Etapas que describen un TRABAJO, no una fuente: no cambian la etapa de la fila. */
const ETAPAS_DE_TRABAJO: readonly string[] = [ETAPA.pausa, ETAPA.reanudado];

/* ══════════════════════════════════════════════════════════════════════════
   2 · LOS PLAZOS — por qué estos números y no otros
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Cuánto puede pasar sin señal antes de que el OBSERVADOR diga «esto está en
 * pausa» y pida reanudar. Generoso a propósito: una transcripción de una imagen
 * grande tarda decenas de segundos sin escribir nada entremedias, y llamar a
 * reanudar mientras el motor sigue vivo no rompe nada (ver MS_RECLAMO) — pero
 * gastaría una invocación para nada.
 */
export const MS_LATIDO = 120_000;

/**
 * Cuánto tiene que llevar una fuente en 'parsing' SIN NINGUNA SEÑAL para que
 * otra invocación pueda quitársela y rehacerla. Es la única defensa contra una
 * fuente que se quedó a medias porque a la lambda se le acabó el tiempo.
 *
 * ⚠ Tiene que ser MAYOR que lo que tarda la fuente más lenta imaginable, o dos
 *   trabajadores harían el mismo trabajo (y lo pagarían dos veces). 240 s es
 *   más que el presupuesto entero de una invocación en Hobby, así que un motor
 *   VIVO nunca puede perder su fuente: cuando se cumple el plazo, el que la
 *   tenía ya está muerto por definición.
 */
export const MS_RECLAMO = 240_000;

/* ══════════════════════════════════════════════════════════════════════════
   3 · LAS FILAS, TAL COMO LLEGAN DE LA BASE
   ══════════════════════════════════════════════════════════════════════════
   Se tipan LAXAS (status y message son `string`, no el enum) porque vienen de
   fuera: una fila escrita por una versión anterior, o un estado que alguien
   añada al enum de Postgres, no puede tumbar la pantalla de nadie.            */

export interface FilaFuente {
  id: string;
  kind: string;
  original_name: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

export interface FilaEvento {
  source_id: string;
  message: string;
  payload: unknown;
  created_at: string;
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · EL MODELO QUE VE LA INTERFAZ
   ══════════════════════════════════════════════════════════════════════════ */

/** Estados por los que pasa una fuente. Espejo del enum `ingestion_status`. */
export type EstadoFuente = "pending" | "parsing" | "extracted" | "failed" | "reviewed";

/** Estados en los que la fuente YA no tiene trabajo pendiente. */
const TERMINALES: readonly string[] = ["extracted", "failed", "reviewed"];

export interface LineaFuente {
  id: string;
  /** posición 1-based en el trabajo: el «3» de «fuente 3 de 16» */
  indice: number;
  /** nombre visible. Nunca vacío: si la fuente no trajo nombre, cae a su tipo. */
  nombre: string;
  /**
   * ¿El nombre es SUYO (un fichero real) o un relleno derivado del tipo?
   *
   * Importa porque el texto pegado no tiene nombre de archivo, y ponerle uno
   * («Texto pegado») al crear la fila metería COPY EN ESPAÑOL dentro de la base
   * de datos: un usuario en inglés vería su log en dos idiomas. Con esta señal,
   * la interfaz sabe cuándo tiene que poner ella la etiqueta traducida y cuándo
   * el nombre viene del usuario y no se toca.
   */
  nombrado: boolean;
  kind: string;
  estado: EstadoFuente;
  /** la última etapa REAL registrada para esta fuente; null si aún no hay ninguna */
  etapa: EtapaClave | null;
  /** items que aportó ESTA fuente, contados de su evento `lista`. null si no terminó. */
  items: number | null;
  /** el motivo del fallo, literal. Nunca se maquilla. */
  error: string | null;
  /** cuántas veces se reintentó (eventos `reintento`) */
  intentos: number;
  /**
   * ★ LEYÓ BIEN Y NO APORTÓ NADA. Terminó sin error y con CERO items.
   * No es un éxito y no es un fallo: es exactamente el caso que este producto
   * lleva prometiendo no esconder. Ver `estadoVisual`.
   */
  vacia: boolean;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ★★ UNA FUENTE VACÍA NUNCA SE PINTA DE VERDE ★★
 * ════════════════════════════════════════════════════════════════════════════
 * Es la regla que este bloque existe para no volver a romper. El fallo que se
 * está arreglando —14 capturas mostradas como «extraída · 0 items»— era
 * EXACTAMENTE eso: un ✓ verde encima de cero. El tick decía «esto salió bien» y
 * cero decía «aquí no hay nada»; las dos cosas a la vez son una mentira.
 *
 * Por eso el estado VISUAL no es el estado de la base. Se derive aquí, en una
 * función pura, y se prueba con un mutante: si alguien vuelve a mapear
 * 'extracted' → verde sin mirar los items, el candado lo mata.
 *
 *   run   → en marcha (o en cola)
 *   ok    → terminó y aportó items. El único que puede ir en verde.
 *   aviso → terminó, no falló, y NO aportó nada. Se marca, no se felicita.
 *   err   → falló, con su motivo.
 * ════════════════════════════════════════════════════════════════════════════
 */
export type EstadoVisual = "run" | "ok" | "aviso" | "err";

export function estadoVisual(l: LineaFuente): EstadoVisual {
  if (l.estado === "failed") return "err";
  if (l.estado === "extracted" || l.estado === "reviewed") return l.vacia ? "aviso" : "ok";
  return "run";
}

export interface Progreso {
  jobId: string;
  total: number;
  /** fuentes en estado terminal (extracted | failed | reviewed) */
  listas: number;
  fallidas: number;
  /** fuentes en 'parsing' ahora mismo */
  enCurso: number;
  /** fuentes que ni han empezado */
  pendientes: number;
  /** suma REAL de los items que reportó cada fuente terminada. No es un cálculo. */
  items: number;
  /** no queda ninguna fuente por hacer */
  terminado: boolean;
  /**
   * El trabajo no ha terminado y no da señales de vida: la invocación que lo
   * movía se quedó sin presupuesto. NO está roto — está esperando a que alguien
   * lo empuje. Es la condición que dispara `avanzar` desde el observador.
   */
  pausado: boolean;
  /** la fuente en curso, para el «leyendo fuente 3 de 16». null si no hay ninguna. */
  actual: LineaFuente | null;
  /** todas las fuentes, en el orden en que se dieron de alta */
  fuentes: LineaFuente[];
  /** milisegundos desde la última señal; null si el trabajo no tiene ninguna */
  desdeUltimaSenal: number | null;
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · LA DERIVACIÓN
   ══════════════════════════════════════════════════════════════════════════ */

const esObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Número finito de un payload, o null. Nunca se adivina un 0. */
function num(p: unknown, clave: string): number | null {
  if (!esObjeto(p)) return null;
  const v = p[clave];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const ms = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/** El estado de la fila, validado. Lo desconocido se trata como 'pending':
 *  el lado seguro del error es «queda trabajo», nunca «ya está hecho». */
function estadoDe(status: string): EstadoFuente {
  switch (status) {
    case "parsing":
    case "extracted":
    case "failed":
    case "reviewed":
      return status;
    default:
      return "pending";
  }
}

/**
 * Filas de la base → qué está pasando. PURA y determinista.
 *
 * `ahora` se inyecta (no se llama a Date.now() dentro) porque de él depende
 * `pausado`, que es la decisión que dispara una invocación de verdad. Un test
 * tiene que poder colocarse justo antes y justo después del plazo.
 */
export function derivarProgreso(
  jobId: string,
  fuentes: FilaFuente[],
  eventos: FilaEvento[],
  ahora: number,
  msLatido: number = MS_LATIDO,
): Progreso {
  // Orden estable: el que se dieron de alta. El «3 de 16» tiene que ser el
  // mismo número en dos sondeos seguidos, o el usuario ve la lista bailar.
  const ordenadas = [...fuentes].sort((a, b) => {
    const d = ms(a.created_at) - ms(b.created_at);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

  // Último evento POR FUENTE (solo etapas de fuente), y los contadores.
  const ultimaEtapa = new Map<string, { clave: EtapaClave; en: number }>();
  const itemsDe = new Map<string, number>();
  const intentosDe = new Map<string, number>();
  let ultimaSenal = 0;

  for (const e of eventos) {
    const en = ms(e.created_at);
    if (en > ultimaSenal) ultimaSenal = en;
    if (!ETAPAS.includes(e.message)) continue; // telemetría de consumo, u otra cosa
    if (e.message === ETAPA.lista) {
      const n = num(e.payload, "items");
      if (n !== null) itemsDe.set(e.source_id, n);
    }
    if (e.message === ETAPA.reintento) {
      intentosDe.set(e.source_id, (intentosDe.get(e.source_id) ?? 0) + 1);
    }
    if (ETAPAS_DE_TRABAJO.includes(e.message)) continue; // pausa/reanudado no son etapa de fuente
    const prev = ultimaEtapa.get(e.source_id);
    // `>=` y no `>`: dos eventos con el mismo timestamp (pasa: created_at es
    // del servidor y dos inserts seguidos comparten milisegundo) tienen que
    // resolverse por ORDEN DE LLEGADA, no quedarse en el primero.
    if (!prev || en >= prev.en) ultimaEtapa.set(e.source_id, { clave: e.message as EtapaClave, en });
  }

  const lineas: LineaFuente[] = ordenadas.map((f, i) => {
    const estado = estadoDe(f.status);
    const terminada = TERMINALES.includes(estado);
    // Los items solo se afirman cuando la fuente terminó BIEN. Una fuente a
    // medias no puede decir «12 items»: todavía no los ha escrito.
    const items = estado === "extracted" ? itemsDe.get(f.id) ?? 0 : terminada ? 0 : null;
    return {
      id: f.id,
      indice: i + 1,
      nombre: (f.original_name ?? "").trim() || f.kind || "fuente",
      nombrado: Boolean((f.original_name ?? "").trim()),
      kind: f.kind,
      estado,
      etapa: ultimaEtapa.get(f.id)?.clave ?? null,
      items,
      error: f.error,
      intentos: intentosDe.get(f.id) ?? 0,
      // Terminó sin fallar y no aportó nada. Ver `estadoVisual`.
      vacia: (estado === "extracted" || estado === "reviewed") && (items ?? 0) === 0,
    };
  });

  const listas = lineas.filter((l) => TERMINALES.includes(l.estado)).length;
  const fallidas = lineas.filter((l) => l.estado === "failed").length;
  const enCurso = lineas.filter((l) => l.estado === "parsing").length;
  const pendientes = lineas.filter((l) => l.estado === "pending").length;
  const items = lineas.reduce((n, l) => n + (l.items ?? 0), 0);
  const terminado = lineas.length > 0 && pendientes === 0 && enCurso === 0;

  const desdeUltimaSenal = ultimaSenal ? Math.max(0, ahora - ultimaSenal) : null;

  // PAUSADO ⟺ queda trabajo y hace tiempo que nadie da señales. Si el trabajo
  // nunca tuvo un evento (se creó y la invocación murió antes de escribir uno),
  // también cuenta como pausado: hay fuentes pendientes y NADIE las mueve.
  const pausado =
    !terminado && lineas.length > 0 && (desdeUltimaSenal === null || desdeUltimaSenal > msLatido);

  return {
    jobId,
    total: lineas.length,
    listas,
    fallidas,
    enCurso,
    pendientes,
    items,
    terminado,
    pausado,
    actual: lineas.find((l) => l.estado === "parsing") ?? null,
    fuentes: lineas,
    desdeUltimaSenal,
  };
}

/**
 * ¿Puede ESTA invocación quedarse con esta fuente? Pura, para poder probar el
 * borde exacto del plazo.
 *
 * · 'pending' → sí, siempre.
 * · 'parsing' → solo si lleva MS_RECLAMO sin dar señal: quien la tenía está
 *   muerto (ver la nota de MS_RECLAMO). Reclamarla es rehacerla entera, lo cual
 *   es seguro porque el motor borra el staging PENDIENTE de esa fuente antes de
 *   escribir el suyo (idempotencia por fuente).
 * · terminal → nunca.
 */
export function esReclamable(
  estado: string,
  msDesdeUltimaSenal: number | null,
  ahoraNoImporta?: unknown,
  msReclamo: number = MS_RECLAMO,
): boolean {
  void ahoraNoImporta;
  const e = estadoDe(estado);
  if (e === "pending") return true;
  if (e !== "parsing") return false;
  // Sin ninguna señal, una fuente en 'parsing' es huérfana por definición: el
  // motor escribe su etapa ANTES de empezar a trabajar, así que si no hay
  // evento es que nadie llegó a arrancarla.
  return msDesdeUltimaSenal === null || msDesdeUltimaSenal > msReclamo;
}
