import "server-only";
import { createHash } from "node:crypto";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { modeloDe, pingProveedor } from "./modelos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CATÁLOGO DE MODELOS · EL LISTADO MIENTE, ASÍ QUE SE PRUEBA UNO A UNO.
 *
 * EL HECHO QUE ORIGINA ESTE FICHERO (medido, no supuesto):
 *   `GET /v1beta/models?key=…` devolvió VEINTE modelos con `generateContent` para
 *   la clave del usuario. Al llamarlos de verdad, solo ONCE respondieron. Ocho dan
 *   404 «no longer available to new users» (gemini-2.5-flash, 2.5-pro,
 *   2.5-flash-lite, 2.0-flash, 2.0-flash-001, 2.0-flash-lite, 2.0-flash-lite-001,
 *   3-pro-preview) y gemini-omni-flash-preview da 400 (solo Interactions API).
 *
 * POR QUÉ ESO OBLIGA A PROBAR:
 *   Un modelo que FIGURA en el listado y se cae al llamarlo es PEOR que uno
 *   ausente. Ausente, el usuario no lo elige. Presente, lo elige, guarda la
 *   preferencia, se va, y la app revienta DESPUÉS —en mitad de una extracción de
 *   verdad, no aquí—. Ofrecer lo listado sería exactamente el «✓ optimista» que
 *   este producto prohíbe en el chequeo de salud: un sí que no ha llamado a nada.
 *
 * SE PRUEBA COMO SE LLAMA (y esto es lo fino):
 *   La sonda NO es un `generateText` de cortesía: es un `generateObject` con
 *   schema, o sea la MISMA forma de llamada que hace la extracción estructurada,
 *   que es la tarea que el usuario está eligiendo. Un modelo puede contestar texto
 *   suelto y NO admitir `responseSchema` (le pasa a familias enteras): con una
 *   sonda de texto entraría al selector y se caería en la primera extracción. Si
 *   la sonda no prueba lo que la tarea necesita, no prueba nada.
 *
 * EL COSTE ES REAL Y SE TRATA COMO TAL — son N llamadas facturadas:
 *   · se filtran los candidatos por MODALIDAD (nada de imagen/tts/audio/vídeo/
 *     embeddings/robótica/computer-use: no pueden atender la tarea ni queriendo),
 *   · se topa el número (MAX_CANDIDATOS),
 *   · se cachea el barrido y CADA sonda individual (TTL_CATALOGO_MS),
 *   · `maxRetries: 0` — reintentar multiplica la factura y además ESCONDE el error
 *     real detrás del último intento,
 *   · y NO se corre al cargar la pantalla: solo cuando el usuario pulsa «comprobar
 *     modelos». Lo que sí corre al cargar es la validación de UN modelo, que es lo
 *     que ya hace el panel de salud y reutiliza su misma ventana.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** El listado oficial. Mismo host que usa el proveedor de Google del SDK. */
const URL_LISTADO = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Ventana de reutilización del barrido y de cada sonda. Larga comparada con el
 * ping de salud (60 s) A PROPÓSITO: aquello es un semáforo que se mira seguido;
 * esto son N llamadas facturadas que el usuario pide explícitamente. Qué modelos
 * admite una clave no cambia cada minuto.
 */
export const TTL_CATALOGO_MS = 10 * 60_000;

/**
 * Tope de sondas por barrido. El coste crece LINEAL con esto: no se sube a la ligera.
 *
 * ⚠ MEDIDO, no elegido a ojo: el listado real de esta clave devuelve 41 modelos con
 *   `generateContent`; el filtro por modalidad se lleva 14 (tts, imagen, robótica,
 *   computer-use, música) y quedan ~27 candidatos. Con 20 el barrido dejaba fuera
 *   modelos de verdad — entre ellos el DEL REGISTRO, que es el que la app usa. Por
 *   eso hay tope Y prioritarios: el tope protege la factura, los prioritarios
 *   garantizan que lo que ya está en uso se prueba SIEMPRE.
 */
export const MAX_CANDIDATOS = 30;

/** Sondas simultáneas. Sube el paralelismo, no el gasto (el nº de llamadas es el mismo). */
export const CONCURRENCIA = 6;

/** Corte por sonda. Un modelo que tarda más de esto tampoco sirve para trabajar. */
export const TIMEOUT_SONDA_MS = 12_000;

/**
 * Filtro por MODALIDAD. No es una lista negra de modelos «malos»: son familias que
 * no pueden atender la tarea ni queriendo (no generan texto contra un schema).
 * Probarlas sería pagar por un no cantado. Cada exclusión lleva su motivo, y el
 * catálogo los devuelve para que la pantalla pueda decir POR QUÉ no están.
 */
const EXCLUIDOS: ReadonlyArray<{ re: RegExp; motivo: string }> = [
  { re: /embed/i, motivo: "embeddings: no genera texto" },
  { re: /imagen|image/i, motivo: "imagen: no genera texto contra un schema" },
  { re: /tts|audio/i, motivo: "voz/audio: otra modalidad" },
  { re: /lyria/i, motivo: "música: otra modalidad" },
  { re: /veo|video/i, motivo: "vídeo: otra modalidad" },
  { re: /robotics/i, motivo: "robótica: otro dominio" },
  { re: /computer-use/i, motivo: "control de pantalla: otro dominio" },
  { re: /^aqa$/i, motivo: "AQA: API distinta, no generateContent de uso general" },
];

/**
 * Avisos MEDIDOS sobre un modelo que SÍ responde. Se devuelven como CÓDIGO, no
 * como texto: el texto vive en el diccionario i18n (ES y EN). Un servidor que
 * devuelve prosa en español rompe la paridad de idiomas en cuanto alguien mira la
 * app en inglés.
 */
export type AvisoModelo = "lite" | "preview";

export interface ModeloProbado {
  /** id sin el prefijo "models/", tal y como se pasa al SDK. */
  id: string;
  /** ¿venía en `GET /v1beta/models` con generateContent? */
  listado: boolean;
  /** ★ ¿respondió a una llamada REAL con schema? Esto es lo único que habilita. */
  responde: boolean;
  /** el motivo REAL del fallo (404 «no longer available», 400, timeout…). */
  error?: string;
  /** solo si respondió */
  latenciaMs?: number;
  /** displayName del listado, informativo */
  etiqueta?: string;
  /** aviso medido (lite parafrasea · preview puede desaparecer) */
  aviso?: AvisoModelo;
  /** cuándo se hizo la llamada real (epoch ms) */
  medidoEn: number;
}

export interface DescartadoSinProbar {
  id: string;
  motivo: string;
}

export interface CatalogoModelos {
  /** todos los candidatos PROBADOS, respondan o no: la tabla completa, sin recortar. */
  modelos: ModeloProbado[];
  /** ★ los únicos elegibles: los que RESPONDIERON. Nunca se puebla del listado. */
  elegibles: string[];
  /** los que ni se probaron, con su motivo (modalidad o tope) */
  descartados: DescartadoSinProbar[];
  /** cuántos devolvió el listado con generateContent (para enseñar listado vs. real) */
  listados: number;
  /** cuántas sondas se lanzaron de verdad en este barrido (0 si vino de caché) */
  probados: number;
  medidoEn: number;
  edadMs: number;
  reutilizado: boolean;
  /** si el LISTADO falló (clave mala, red): se dice, no se finge una lista vacía */
  errorListado?: string;
}

/**
 * La sonda: una llamada REAL a un modelo. Inyectable SOLO para poder testear sin
 * red y sin gasto — producción usa `sondaReal` y nunca pasa este parámetro.
 * Devuelve la muestra de lo que contestó (prueba de que la llamada ocurrió).
 */
export type Sonda = (id: string, apiKey: string) => Promise<string>;

export interface OpcionesCatalogo {
  /** salta la caché y vuelve a llamar de verdad */
  forzar?: boolean;
  /** sonda falsa (tests). Sin esto, se llama al proveedor de verdad. */
  sonda?: Sonda;
  /** tope de candidatos (por defecto MAX_CANDIDATOS) */
  tope?: number;
  /**
   * ★ Modelos que se prueban SIEMPRE, los primeros, pase lo que pase con el tope:
   * el del registro y el que el usuario tenga elegido. Salió de una medición real —
   * con tope 20 y 41 modelos listados, el barrido se quedaba sin probar
   * `gemini-3.6-flash`, que es EL QUE LA APP ESTÁ USANDO. Un catálogo que no incluye
   * el modelo en uso no puede decir si lo que usas funciona: justo su único trabajo.
   * Se prueban aunque NO figuren en el listado (y entonces se marcan `listado:false`,
   * que también es información: en uso pero fuera del listado oficial).
   */
  prioritarios?: readonly string[];
}

/**
 * El schema de la sonda: mínimo, pero SCHEMA. Es lo que convierte esta llamada en
 * una prueba de la tarea real (extracción estructurada) y no en un «hola».
 */
const ESQUEMA_SONDA = z.object({ ok: z.string() });

const sondaReal: Sonda = async (id, apiKey) => {
  const r = await generateObject({
    model: createGoogleGenerativeAI({ apiKey })(id),
    schema: ESQUEMA_SONDA,
    prompt: 'Devuelve exactamente {"ok":"OK"}.',
    temperature: 0,
    // Sin reintentos: multiplican la factura y tapan el error real (te enseñan el
    // del último intento). Aquí el error ES el dato que buscamos.
    maxRetries: 0,
    // Sin tope de tokens de salida a propósito: los modelos con «thinking» gastan
    // tokens internos y un tope bajo los haría parecer rotos cuando funcionan.
    abortSignal: AbortSignal.timeout(TIMEOUT_SONDA_MS),
  });
  return String(r.object?.ok ?? "");
};

/** La clave NUNCA se guarda: se indexa por huella, de la que no se recupera. */
const huella = (k: string) => createHash("sha256").update(k).digest("hex").slice(0, 16);

/** Barrido completo por huella de clave. */
const cacheCatalogo = new Map<string, CatalogoModelos>();
/** Sonda individual por huella:id. La comparten el barrido y la validación. */
const cacheSonda = new Map<string, ModeloProbado>();

/** Deja las dos cachés limpias entre casos de test. */
export function _resetCatalogo(): void {
  cacheCatalogo.clear();
  cacheSonda.clear();
}

/**
 * ¿Tiene forma de id de modelo? Se valida ANTES de meterlo en una URL o de
 * guardarlo: un id es `[a-z0-9._-]`, nada más. Sin esto, un valor con `/` o `..`
 * viajaría al path del proveedor, y uno de 10 KB acabaría en la base de datos.
 */
export function idModeloValido(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id);
}

/** El aviso MEDIDO de un modelo que responde, o undefined si no hay nada que avisar. */
export function avisoDe(id: string): AvisoModelo | undefined {
  // Los lite responden perfectamente y aun así no sirven para esta tarea: el A/B
  // del canario los midió parafraseando en vez de citar (ver REGISTRO en
  // lib/ai/modelos.ts). Se ofrecen —es la clave del usuario— pero se avisa.
  if (/lite/i.test(id)) return "lite";
  if (/preview|exp/i.test(id)) return "preview";
  return undefined;
}

/** Motivo REAL y compacto de un fallo. Nunca «error»: el porqué es el producto. */
function motivoDe(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { statusCode?: number; message?: string; name?: string };
    const msg = (o.message ?? String(e)).replace(/\s+/g, " ").trim();
    if (typeof o.statusCode === "number") return `HTTP ${o.statusCode}: ${msg}`.slice(0, 220);
    if (o.name === "TimeoutError" || /aborted|timeout/i.test(msg)) {
      return `Sin respuesta en ${TIMEOUT_SONDA_MS} ms.`;
    }
    return msg.slice(0, 220) || "sin motivo";
  }
  return String(e).slice(0, 220);
}

/**
 * Separa los candidatos a probar de los descartados sin gastar una llamada.
 * Exportado porque el tope y el filtro SON la política de coste: se testean.
 */
export function candidatosDe(
  ids: readonly string[],
  tope = MAX_CANDIDATOS,
): { candidatos: string[]; descartados: DescartadoSinProbar[] } {
  const candidatos: string[] = [];
  const descartados: DescartadoSinProbar[] = [];
  for (const id of ids) {
    const ex = EXCLUIDOS.find((x) => x.re.test(id));
    if (ex) {
      descartados.push({ id, motivo: ex.motivo });
      continue;
    }
    if (!idModeloValido(id)) {
      descartados.push({ id, motivo: "id con forma inesperada" });
      continue;
    }
    if (candidatos.length >= tope) {
      descartados.push({ id, motivo: `tope de ${tope} sondas por barrido (coste)` });
      continue;
    }
    candidatos.push(id);
  }
  return { candidatos, descartados };
}

/** Pool con límite: el nº de llamadas no cambia, solo cuántas van a la vez. */
async function enParalelo<T, R>(items: T[], limite: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let siguiente = 0;
  const obreros = Array.from({ length: Math.max(1, Math.min(limite, items.length)) }, async () => {
    for (;;) {
      const i = siguiente++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(obreros);
  return out;
}

/**
 * Prueba UN modelo de verdad, con caché por (clave, id). Es el ladrillo del que
 * están hechos el barrido y la validación del modelo elegido: así, comprobar el
 * catálogo y validar la elección no pagan dos veces por el mismo modelo.
 */
export async function probarModelo(
  apiKey: string,
  id: string,
  opts: OpcionesCatalogo = {},
): Promise<ModeloProbado> {
  const clave = `${huella(apiKey)}:${id}`;
  const previo = cacheSonda.get(clave);
  if (!opts.forzar && previo && Date.now() - previo.medidoEn < TTL_CATALOGO_MS) return previo;

  const sonda = opts.sonda ?? sondaReal;
  const t0 = Date.now();
  let r: ModeloProbado;
  try {
    await sonda(id, apiKey);
    r = { id, listado: false, responde: true, latenciaMs: Date.now() - t0, aviso: avisoDe(id), medidoEn: Date.now() };
  } catch (e) {
    // El fallo se cachea IGUAL que el éxito: si un modelo da 404, insistir en cada
    // carga solo gasta tiempo y dinero para volver a saber lo mismo.
    r = { id, listado: false, responde: false, error: motivoDe(e), latenciaMs: Date.now() - t0, medidoEn: Date.now() };
  }
  cacheSonda.set(clave, r);
  return r;
}

/** Lee el listado oficial. Devuelve los ids con generateContent (sin "models/"). */
async function leerListado(apiKey: string): Promise<{ ids: string[]; etiquetas: Map<string, string> }> {
  // pageSize alto para no paginar: hoy son ~50 modelos en total, no miles.
  const res = await fetch(`${URL_LISTADO}?pageSize=200&key=${encodeURIComponent(apiKey)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).replace(/\s+/g, " ").slice(0, 160)}`);
  }
  const j = (await res.json()) as {
    models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
  };
  const ids: string[] = [];
  const etiquetas = new Map<string, string>();
  for (const m of j.models ?? []) {
    if (!m.name) continue;
    if (!(m.supportedGenerationMethods ?? []).includes("generateContent")) continue;
    const id = m.name.replace(/^models\//, "");
    ids.push(id);
    if (m.displayName) etiquetas.set(id, m.displayName);
  }
  return { ids, etiquetas };
}

/**
 * ★ EL BARRIDO. Lista + PRUEBA. Devuelve la tabla entera (respondan o no) y, por
 * separado, los `elegibles` — que salen SOLO de `responde:true`, jamás del listado.
 *
 * No lanza nunca: si el listado falla, se devuelve el motivo real en `errorListado`
 * y una tabla vacía. Un catálogo vacío con su porqué es honesto; una excepción a
 * mitad de una pantalla de ajustes, no.
 */
export async function listarModelos(apiKey: string, opts: OpcionesCatalogo = {}): Promise<CatalogoModelos> {
  const hk = huella(apiKey);
  const previo = cacheCatalogo.get(hk);
  if (!opts.forzar && previo) {
    const edadMs = Date.now() - previo.medidoEn;
    if (edadMs < TTL_CATALOGO_MS) return { ...previo, edadMs, reutilizado: true, probados: 0 };
  }

  let ids: string[] = [];
  let etiquetas = new Map<string, string>();
  let errorListado: string | undefined;
  try {
    const l = await leerListado(apiKey);
    ids = l.ids;
    etiquetas = l.etiquetas;
  } catch (e) {
    errorListado = motivoDe(e);
  }

  // Los prioritarios van DELANTE: así el tope nunca puede dejar sin probar el
  // modelo que la app está usando. `Set` conserva el orden de inserción y quita
  // duplicados, que es exactamente lo que hace falta aquí.
  const ordenados = [...new Set([...(opts.prioritarios ?? []).filter(idModeloValido), ...ids])];
  const { candidatos, descartados } = candidatosDe(ordenados, opts.tope ?? MAX_CANDIDATOS);
  const probados = await enParalelo(candidatos, CONCURRENCIA, (id) => probarModelo(apiKey, id, opts));

  const enListado = new Set(ids);
  const modelos = probados
    // `listado` no se pone a `true` por estar aquí: un prioritario puede estar en
    // uso y NO figurar en el listado. Decir «listado» de algo que no lo está sería
    // otra media verdad, y este fichero existe precisamente por una de esas.
    .map((m) => ({ ...m, listado: enListado.has(m.id), etiqueta: etiquetas.get(m.id) }))
    // Orden de UTILIDAD, no alfabético: primero lo que responde; dentro de eso,
    // lo que no lleva aviso medido en contra; y al final lo que se cayó.
    .sort((a, b) => {
      if (a.responde !== b.responde) return a.responde ? -1 : 1;
      const pa = a.aviso ? 1 : 0;
      const pb = b.aviso ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return a.id.localeCompare(b.id);
    });

  const cat: CatalogoModelos = {
    modelos,
    elegibles: modelos.filter((m) => m.responde).map((m) => m.id),
    descartados,
    listados: ids.length,
    probados: candidatos.length,
    medidoEn: Date.now(),
    edadMs: 0,
    reutilizado: false,
    errorListado,
  };
  cacheCatalogo.set(hk, cat);
  return cat;
}

/** El catálogo YA cacheado, o null. Para pintar la pantalla sin gastar una llamada. */
export function catalogoCacheado(apiKey: string): CatalogoModelos | null {
  const previo = cacheCatalogo.get(huella(apiKey));
  if (!previo) return null;
  const edadMs = Date.now() - previo.medidoEn;
  if (edadMs >= TTL_CATALOGO_MS) return null;
  return { ...previo, edadMs, reutilizado: true, probados: 0 };
}

export interface ValidacionModelo {
  /** el modelo que se validó (el EFECTIVO, ya resuelto) */
  modelo: string;
  responde: boolean;
  /** el motivo REAL si no responde. Nunca un genérico. */
  error?: string;
  latenciaMs?: number;
  /** ms desde la llamada real: 0 = recién hecha, >0 = reutilizada de la ventana */
  edadMs: number;
  reutilizado: boolean;
  /**
   * Un modelo que SÍ respondió, para proponerlo si el elegido está caído. Solo
   * sale de una llamada real (catálogo cacheado o sonda al modelo del registro):
   * proponer «prueba con X» sin haber llamado a X sería otro ✓ optimista.
   */
  sugerencia?: string;
}

/**
 * ★ VALIDACIÓN AL ARRANCAR. Comprueba que el modelo que se va a usar DE VERDAD
 * responde, y si no, dice por qué y propone uno que sí.
 *
 * Coste: una llamada, y ni eso en el caso normal. Si el modelo efectivo es el del
 * registro, se reutiliza `pingProveedor` —la MISMA ventana de 60 s que ya usa el
 * panel de salud—, así que abrir Ajustes no paga una llamada extra por esto.
 */
export async function validarModeloEfectivo(
  apiKey: string,
  modelo: string,
  opts: OpcionesCatalogo = {},
): Promise<ValidacionModelo> {
  let base: { responde: boolean; error?: string; latenciaMs?: number; edadMs: number; reutilizado: boolean };

  if (modelo === modeloDe("ping-salud") && !opts.sonda) {
    // El camino barato: es exactamente el chequeo que el panel de salud ya hace.
    const p = await pingProveedor(apiKey, opts.forzar);
    base = { responde: p.ok, error: p.error, latenciaMs: p.latenciaMs, edadMs: p.edadMs, reutilizado: p.reutilizado };
  } else {
    const antes = Date.now();
    const m = await probarModelo(apiKey, modelo, opts);
    const edadMs = Math.max(0, antes - m.medidoEn);
    base = { responde: m.responde, error: m.error, latenciaMs: m.latenciaMs, edadMs, reutilizado: edadMs > 0 };
  }

  const out: ValidacionModelo = { modelo, ...base };
  if (base.responde) return out;

  // No responde: hay que proponer algo, pero SOLO con evidencia.
  // 1) del catálogo ya probado, si lo hay (cero llamadas nuevas).
  const cat = catalogoCacheado(apiKey);
  const delCatalogo = cat?.elegibles.find((id) => id !== modelo && !avisoDe(id)) ?? cat?.elegibles.find((id) => id !== modelo);
  if (delCatalogo) return { ...out, sugerencia: delCatalogo };

  // 2) el del registro: se PRUEBA antes de proponerlo (una llamada, cacheada).
  const registro = modeloDe("extraccion-estructurada");
  if (registro !== modelo) {
    const m = await probarModelo(apiKey, registro, opts);
    if (m.responde) return { ...out, sugerencia: registro };
  }
  // 3) sin evidencia, sin sugerencia. La pantalla invita a «comprobar modelos».
  return out;
}
