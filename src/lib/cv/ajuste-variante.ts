/**
 * AJUSTE DE UNA VARIANTE EN LA BASE (DA-A6) — el lado con I/O del motor de páginas.
 *
 *  · prepararMotor: mide el PDF REAL de la variante (el mismo documento que se
 *    descarga: buildVariantResumeData + autofit) y arma la entrada del motor;
 *  · ajustarVariante: corre el motor, APLICA el plan de forma atómica con
 *    instantánea y vuelve a MEDIR el PDF real; si la simulación se quedó corta,
 *    otra ronda sobre lo ya aplicado (sin IA). Lo usan «Ajustar» y las puertas de
 *    Crear con IA, Analizar la oferta y Afinar;
 *  · aplicarPlanMotor: el plan llega del motor O DEL CLIENTE («Elegir cómo
 *    ajustar»), así que todo se revalida aquí: la plantilla existe y es del
 *    usuario, lo oculto no es de «incluir siempre», y cada texto condensado vuelve
 *    a pasar el candado contra el texto de la base;
 *  · deshacerAjuste / revertirCambio: la instantánea vive en el override de basics
 *    (clave `ajustePrevio`): el cliente nunca manda qué reponer.
 */
import { generateObject } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hayClaveIA, modeloPara } from "@/lib/ai/modelos";
import { geminiApiKey } from "@/lib/extract/llm";
import { getUserLlmKey, getUserLlmKey3 } from "@/lib/account/byok";
import { contextoMemoria, mensajesConMemoria, type ContextoMemoria } from "@/lib/ai/memoria";
import { buildVariantResumeData, getVariant, setAiOverride, setVariantPresentation, updateItem } from "@/lib/db/variants";
import { autofit, objetivoDe, plantillaDe, type PaginasObjetivo, type ResultadoAutofit } from "@/lib/cv/autofit";
import {
  guardarPlantillaUsuario,
  listarPlantillasUsuario,
  resolverPlantillaDelDocumento,
  type PlantillaUsuario,
} from "@/lib/cv/plantillas-usuario";
import { esPlantillaUsuario, getTemplate, type CvTemplate } from "@/lib/cv/templates";
import { obtenerReglas, terminoExcluidoEn, type Reglas } from "@/lib/cv/reglas";
import { validarParams } from "@/lib/cv/plantilla-medida";
import type { ResumeData } from "@/lib/cv/resume";
import type { ProgresoAjuste } from "@/lib/cv/cascada";
import {
  CondensarSchema,
  campoDe,
  itemDeAjuste,
  verificarCondensado,
  type AjusteItem,
  type CondensarLLM,
} from "@/lib/cv/ajuste";
import {
  resolverPaginas,
  type Choque,
  type Disposicion,
  type MotorInput,
  type Palanca,
  type PlanMotor,
  type Reescritura,
  type ResultadoMotor,
} from "@/lib/cv/motor-paginas";

type SB = SupabaseClient;
export type ItemVariante = NonNullable<Awaited<ReturnType<typeof getVariant>>>["items"][number];

// ── Reglas y objetivo ────────────────────────────────────────────────────────
/** Las reglas de la variante; sin la 0012 (o sin la columna) salen las de por defecto. */
export async function leerReglasVariante(sb: SB, userId: string, variantId: string): Promise<Reglas> {
  const { data, error } = await sb.from("cv_variants").select("*").eq("id", variantId).eq("user_id", userId).maybeSingle();
  if (error) console.warn("[ajuste] no se pudieron leer las reglas; sin reglas", error.message);
  return obtenerReglas((data as { reglas?: unknown } | null) ?? null);
}

/** ¿«Máximo N páginas» obligatoria? */
export const paginasObligatorias = (r: Reglas): number | null =>
  r.paginasMax && r.fuerza.paginasMax === "obligatoria" ? r.paginasMax : null;

/** paginasMax obligatoria: el objetivo nunca la pasa (DA-R1). */
export function objetivoSegunReglas(pedidas: number, r: Reglas): PaginasObjetivo {
  const max = paginasObligatorias(r);
  return objetivoDe(max ? Math.min(pedidas, max) : pedidas);
}

/** El PDF REAL de la variante, medido con el autofit al objetivo. */
export async function medirVariante(
  sb: SB,
  userId: string,
  variantId: string,
  objetivo: number,
): Promise<{ resume: ResumeData; actual: ResultadoAutofit }> {
  const { data: resume } = await resolverPlantillaDelDocumento(sb, userId, await buildVariantResumeData(sb, userId, variantId));
  return { resume, actual: await autofit(resume, plantillaDe(resume), objetivo) };
}

// ── El modelo que condensa (L2) ─────────────────────────────────────────────
export function condensadorIA(apiKey?: string, apiKey3?: string, mem?: ContextoMemoria): CondensarLLM {
  const key = apiKey || geminiApiKey();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  const model = modeloPara("redaccion-preserva-hechos", key, undefined, undefined, apiKey3);
  const SYS =
    "Ayudas a que un CV QUEPA en un número de páginas CONDENSANDO textos. Te doy cada texto con su id, " +
    "su tipo, el número MÁXIMO de caracteres y su evidencia (el rol al que pertenece). Devuelve cada texto " +
    "condensado a ese máximo. Puedes OMITIR detalles secundarios y relleno; lo más relevante para el rol " +
    "objetivo se queda. ★ REGLA DURA: no AÑADAS nada — ninguna cifra, nombre, sigla o tecnología que no esté " +
    "en el texto o en su evidencia. Mismo idioma que el texto. Si un texto no se puede condensar sin " +
    "inventar, no lo devuelvas.";
  return async ({ targetTitle, items, reglas }) => {
    const r = await generateObject({
      model,
      schema: CondensarSchema,
      ...mensajesConMemoria({
        memoria: mem?.memoria,
        modelo: model,
        sistema: SYS + (reglas ? `\n\n${reglas}` : ""),
        usuario:
          `ROL OBJETIVO: ${targetTitle || "(sin especificar)"}\n\nTEXTOS:\n` +
          items
            .map((i) => `- [${i.id}] (${i.kind}, máx. ${i.max} caracteres)${i.evidencia ? ` · evidencia: ${i.evidencia}` : ""}\n  ${i.texto}`)
            .join("\n"),
      }),
      temperature: 0.2,
    });
    await mem?.alUsar(r);
    return r.object;
  };
}

/** El condensador con la clave del usuario o del servidor; undefined sin clave (L2 no corre). */
export async function condensadorDeUsuario(sb: SB, userId: string): Promise<CondensarLLM | undefined> {
  const byok = (await getUserLlmKey(sb, userId)) ?? undefined;
  const byok3 = (await getUserLlmKey3(sb, userId)) ?? undefined;
  if (!hayClaveIA(byok, byok3)) return undefined;
  try {
    return condensadorIA(byok, byok3, await contextoMemoria(sb, userId, "ajustar"));
  } catch (e) {
    console.warn("[ajuste] sin condensador", e);
    return undefined;
  }
}

// ── Preparar ────────────────────────────────────────────────────────────────
export interface Preparado {
  detalle: NonNullable<Awaited<ReturnType<typeof getVariant>>>;
  reglas: Reglas;
  objetivo: PaginasObjetivo;
  resume: ResumeData;
  actual: ResultadoAutofit;
  items: AjusteItem[];
  propias: CvTemplate[];
  propiasLista: PlantillaUsuario[];
  targetTitle: string;
}

export async function prepararMotor(sb: SB, userId: string, variantId: string, paginasPedidas: number): Promise<Preparado | null> {
  const detalle = await getVariant(sb, userId, variantId);
  if (!detalle) return null;
  const reglas = await leerReglasVariante(sb, userId, variantId);
  const objetivo = objetivoSegunReglas(paginasPedidas, reglas);
  const { resume, actual } = await medirVariante(sb, userId, variantId, objetivo);
  const propiasLista = await listarPlantillasUsuario(sb, userId);
  // listarPlantillasUsuario ya las registró en templates.ts.
  const propias = propiasLista.map((p) => getTemplate(p.id)).filter((t) => t.id.startsWith("u:"));
  return {
    detalle,
    reglas,
    objetivo,
    resume,
    actual,
    items: detalle.items.map(itemDeAjuste),
    propias,
    propiasLista,
    targetTitle: detalle.variant.target_title ?? "",
  };
}

export function entradaMotor(prep: Preparado, extra: Partial<MotorInput> = {}): MotorInput {
  return {
    data: prep.resume,
    objetivo: prep.objetivo,
    actual: prep.actual,
    items: prep.items,
    reglas: prep.reglas,
    targetTitle: prep.targetTitle,
    propias: prep.propias,
    sinFoto: prep.reglas.sinFoto && prep.reglas.fuerza.sinFoto === "obligatoria",
    ...extra,
  };
}

// ── La instantánea ───────────────────────────────────────────────────────────
/** La clave de la instantánea dentro del override de basics (el PDF no la lee). */
export const CLAVE_PREVIO = "ajustePrevio";
const CLAVES_DISENO = ["templateId", "paletteId", "typographyId"] as const;
const COLS = "id,visible,override_data,override_origin,override_verified,override_source_item,override_reason";
interface FilaPrevia {
  id: string;
  visible: boolean;
  override_data: Record<string, unknown> | null;
  override_origin: string | null;
  override_verified: boolean;
  override_source_item: string | null;
  override_reason: string | null;
}
interface Instantanea {
  v: 1;
  cuando: string;
  resueltoPor: string;
  /** el diseño de antes; null = la clave no estaba */
  diseno: Record<(typeof CLAVES_DISENO)[number], string | null>;
  /** las filas que el ajuste toca, tal como estaban (todas sus columnas de override) */
  filas: FilaPrevia[];
  /** el diseño ya se revirtió a mano (revertir por item) */
  disenoRevertido?: boolean;
}

const basicsDe = (items: ItemVariante[]) => items.find((i) => i.kind === "basics") ?? null;
const previoDe = (items: ItemVariante[]): Instantanea | null => {
  const ov = (basicsDe(items)?.override_data ?? null) as Record<string, unknown> | null;
  const p = ov?.[CLAVE_PREVIO] as Instantanea | undefined;
  return p && p.v === 1 ? p : null;
};
export const hayAjusteAplicado = (items: ItemVariante[]) => previoDe(items) !== null;

async function reponerFilas(sb: SB, userId: string, variantId: string, filas: FilaPrevia[], propios: ReadonlySet<string>) {
  for (const f of filas) {
    if (!propios.has(f.id)) continue; // solo filas de ESTA variante
    const { id, ...cols } = f;
    const { error } = await sb.from("variant_items").update(cols).eq("id", id).eq("variant_id", variantId).eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
}

async function escribirBasics(sb: SB, userId: string, basicsId: string, next: Record<string, unknown>) {
  const { error } = await sb
    .from("variant_items")
    .update({ override_data: Object.keys(next).length ? next : null })
    .eq("id", basicsId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

const conDiseno = (ov: Record<string, unknown>, diseno: Instantanea["diseno"]) => {
  const next: Record<string, unknown> = { ...ov };
  for (const k of CLAVES_DISENO) {
    const v = diseno?.[k];
    if (v) next[k] = v;
    else delete next[k];
  }
  return next;
};

/** Repone el diseño y las filas de la instantánea y la retira. false si no había ninguna. */
export async function deshacerAjuste(sb: SB, userId: string, variantId: string, items: ItemVariante[]): Promise<boolean> {
  const basics = basicsDe(items);
  const previo = previoDe(items);
  if (!basics || !previo) return false;
  await reponerFilas(sb, userId, variantId, previo.filas ?? [], new Set(items.map((i) => i.id)));
  const next = conDiseno((basics.override_data ?? {}) as Record<string, unknown>, previo.diseno);
  delete next[CLAVE_PREVIO];
  await escribirBasics(sb, userId, basics.id, next);
  return true;
}

/**
 * Revierte UN cambio del ajuste: una fila (oculto o reescrito) o el diseño
 * ("diseno"). Sale de la instantánea: «Deshacer ajuste» ya no lo vuelve a tocar.
 */
export async function revertirCambio(sb: SB, userId: string, variantId: string, items: ItemVariante[], cambio: string): Promise<boolean> {
  const basics = basicsDe(items);
  const previo = previoDe(items);
  if (!basics || !previo) return false;
  const ov = { ...((basics.override_data ?? {}) as Record<string, unknown>) };
  if (cambio === "diseno") {
    if (previo.disenoRevertido) return false;
    const next = conDiseno(ov, previo.diseno);
    next[CLAVE_PREVIO] = { ...previo, disenoRevertido: true };
    await escribirBasics(sb, userId, basics.id, next);
    return true;
  }
  const fila = (previo.filas ?? []).find((f) => f.id === cambio);
  if (!fila) return false;
  await reponerFilas(sb, userId, variantId, [fila], new Set(items.map((i) => i.id)));
  ov[CLAVE_PREVIO] = { ...previo, filas: previo.filas.filter((f) => f.id !== cambio) };
  await escribirBasics(sb, userId, basics.id, ov);
  return true;
}

// ── Aplicar un plan ─────────────────────────────────────────────────────────
export interface Aplicado {
  medidaId?: string;
  medidaNombre?: string;
  /** lo que el servidor NO aplicó al revalidar (id + motivo) */
  rechazados: { id: string; razon: string }[];
  reescritos: number;
  ocultos: number;
}

/**
 * Aplica un plan del motor (o del cliente) de forma ATÓMICA: si algo falla a
 * mitad, se repone lo ya escrito desde la instantánea en memoria. `fusionar`:
 * una ronda más del MISMO ajuste (la instantánea conserva el estado de antes del
 * primero); si no, la instantánea empieza aquí.
 */
export async function aplicarPlanMotor(
  sb: SB,
  userId: string,
  variantId: string,
  items: ItemVariante[],
  plan: PlanMotor,
  ctx: { reglas: Reglas; propias: PlantillaUsuario[]; nombreAntes: string; resueltoPor: string; fusionar?: boolean },
): Promise<Aplicado> {
  const porId = new Map(items.map((i) => [i.id, i]));
  const protegidos = new Set(ctx.reglas.incluirSiempre);
  const out: Aplicado = { rechazados: [], reescritos: 0, ocultos: 0 };
  const no = (id: string, razon: string) => out.rechazados.push({ id, razon });

  // 1 · Revalidar TODO (el plan puede venir del cliente).
  const d = plan.disposicion as Disposicion | undefined;
  let diseno: { templateId: string; paletteId?: null; typographyId?: null } | null = null;
  let medidaParams: Disposicion["params"] | null = null;
  if (d && d.tipo === "plantilla") {
    const t = getTemplate(d.templateId);
    const propia = esPlantillaUsuario(d.templateId);
    if (t.id !== d.templateId || (propia && !ctx.propias.some((p) => p.id === d.templateId))) no("diseno", "esa plantilla no existe o no es tuya");
    else diseno = propia ? { templateId: t.id, paletteId: null, typographyId: null } : { templateId: t.id };
  } else if (d && d.tipo === "medida") {
    const v = d.params ? validarParams(d.params) : { ok: false as const, razon: "faltan los parámetros" };
    if (!v.ok) no("diseno", `la plantilla a medida no pasa los límites: ${v.razon}`);
    else medidaParams = d.params!;
  }
  const ocultar = (plan.ocultar ?? []).filter((o) => {
    const it = porId.get(o.id);
    if (!it || !it.visible) return (no(o.id, "ese item no está visible en esta variante"), false);
    if (it.kind === "basics") return (no(o.id, "el contacto no se quita"), false);
    if (protegidos.has(it.item_id)) return (no(o.id, "es de «incluir siempre»"), false);
    if (it.kind === "work" && items.some((h) => h.parent_id === it.item_id && protegidos.has(h.item_id)))
      return (no(o.id, "lleva una viñeta de «incluir siempre»"), false);
    return true;
  });
  const reescribir: (Reescritura & { overrideData: Record<string, unknown> | null; itemId: string })[] = [];
  for (const r of plan.reescribir ?? []) {
    const it = porId.get(r.id);
    const campo = it ? campoDe(it.kind) : null;
    const original = it && campo ? String(it.data[campo] ?? "") : "";
    if (!it || !campo || campo !== r.campo || !original.trim()) {
      no(r.id, "este item no tiene ese texto");
      continue;
    }
    const rol = it.parent_id ? items.find((x) => x.item_id === it.parent_id) : undefined;
    const evidencia = rol ? itemDeAjuste(rol).texto : "";
    const v = verificarCondensado(original, r.propuesto, evidencia, (s) => terminoExcluidoEn(s, ctx.reglas));
    if (!v.ok) {
      no(r.id, v.razon);
      continue;
    }
    reescribir.push({ ...r, original, overrideData: it.override_data ?? null, itemId: it.item_id });
  }

  // 2 · La instantánea (en memoria primero: si algo falla, se repone con ella).
  const basics = basicsDe(items);
  const ovBasics = (basics?.override_data ?? {}) as Record<string, unknown>;
  const anterior = ctx.fusionar ? previoDe(items) : null;
  const disenoAhora = Object.fromEntries(
    CLAVES_DISENO.map((k) => [k, typeof ovBasics[k] === "string" && ovBasics[k] ? (ovBasics[k] as string) : null]),
  ) as Instantanea["diseno"];
  const ids = [...new Set([...ocultar.map((o) => o.id), ...reescribir.map((r) => r.id)])];
  let filas: FilaPrevia[] = [];
  if (ids.length) {
    const { data, error } = await sb.from("variant_items").select(COLS).eq("variant_id", variantId).eq("user_id", userId).in("id", ids);
    if (error) throw new Error(error.message);
    filas = (data ?? []) as FilaPrevia[];
  }
  const yaGuardadas = new Set((anterior?.filas ?? []).map((f) => f.id));
  const previo: Instantanea = {
    v: 1,
    cuando: anterior?.cuando ?? new Date().toISOString(),
    resueltoPor: ctx.resueltoPor,
    diseno: anterior?.diseno ?? disenoAhora,
    filas: [...(anterior?.filas ?? []), ...filas.filter((f) => !yaGuardadas.has(f.id))],
  };

  // 3 · Aplicar. Ocultar = visible:false (reversible); reescribir = override con el candado ya corrido.
  try {
    if (diseno) await setVariantPresentation(sb, userId, variantId, diseno);
    else if (medidaParams) {
      const igual = ctx.propias.find((x) => JSON.stringify(x.params) === JSON.stringify(medidaParams));
      const p = igual ?? (await guardarPlantillaUsuario(sb, userId, medidaParams, `A medida · ${ctx.nombreAntes}`));
      out.medidaId = p.id;
      out.medidaNombre = p.nombre;
      await setVariantPresentation(sb, userId, variantId, { templateId: p.id, paletteId: null, typographyId: null });
    }
    for (const o of ocultar) {
      await updateItem(sb, userId, o.id, { visible: false });
      out.ocultos += 1;
    }
    for (const r of reescribir) {
      await setAiOverride(sb, userId, r.id, {
        data: { ...(r.overrideData ?? {}), [r.campo]: r.propuesto },
        sourceItem: r.itemId,
        reason: "Condensado por IA para caber en las páginas pedidas; nada nuevo (candado «condensar»).",
      });
      out.reescritos += 1;
    }
    // La instantánea va junto al diseño (override de basics): sin migración.
    const pres = await setVariantPresentation(sb, userId, variantId, {});
    await escribirBasics(sb, userId, pres.basicsItemId, { ...(pres.override ?? {}), [CLAVE_PREVIO]: previo });
  } catch (e) {
    // Atómico: lo ya escrito vuelve a como estaba.
    console.error("[ajuste] falló a mitad; se repone la instantánea", variantId, e);
    try {
      await reponerFilas(sb, userId, variantId, filas, new Set(items.map((i) => i.id)));
      if (basics) await escribirBasics(sb, userId, basics.id, ovBasics);
    } catch (e2) {
      console.error("[ajuste] tampoco se pudo reponer", variantId, e2);
    }
    throw e;
  }
  return out;
}

// ── Todo junto: medir, resolver, aplicar y volver a medir ───────────────────
export interface CambioAjuste {
  /** id del variant_item, o "diseno" */
  id: string;
  tipo: "plantilla" | "medida" | "reescrito" | "fuera";
  kind?: string;
  texto: string;
  nuevo?: string;
  motivo?: string;
}

/** Lo que vuelve al cliente (sin miniaturas: el editor rehace su vista previa). */
export type ResultadoAjusteVariante = Omit<ResultadoMotor, "pdf"> & {
  aplicado: boolean;
  medidaId?: string;
  medidaNombre?: string;
  /** el PDF REAL de la variante tras aplicar (lo que se descarga) */
  real: { paginas: number; cuerpo: number; cabe: boolean } | null;
  rechazados: { id: string; razon: string }[];
  cambios: CambioAjuste[];
  rondas: number;
};

export function cambiosDe(plan: PlanMotor, antes: string, medidaNombre?: string): CambioAjuste[] {
  const out: CambioAjuste[] = [];
  const fuera = new Set(plan.ocultar.map((o) => o.id));
  if (plan.disposicion.tipo !== "actual")
    out.push({
      id: "diseno",
      tipo: plan.disposicion.tipo === "medida" ? "medida" : "plantilla",
      texto: antes,
      nuevo: plan.disposicion.tipo === "medida" ? (medidaNombre ?? plan.disposicion.nombre) : plan.disposicion.nombre,
    });
  for (const r of plan.reescribir)
    if (!fuera.has(r.id)) out.push({ id: r.id, tipo: "reescrito", kind: r.kind, texto: r.original, nuevo: r.propuesto });
  for (const o of plan.ocultar) out.push({ id: o.id, tipo: "fuera", kind: o.kind, texto: o.texto, motivo: o.motivo });
  return out;
}

const sinMiniaturas = (r: ResultadoMotor): Omit<ResultadoMotor, "pdf"> => {
  const { pdf: _pdf, ...resto } = r;
  return {
    ...resto,
    mejorPlantilla: r.mejorPlantilla ? { ...r.mejorPlantilla, pdf: undefined } : null,
    medida: r.medida ? { ...r.medida, pdf: undefined } : null,
    alternativas: r.alternativas.map((a) => ({ ...a, pdf: undefined })),
  };
};

/**
 * El ajuste entero de una variante. `soloSiRegla`: las puertas (crear, tailor,
 * afinar) solo lo corren con «Máximo N páginas» obligatoria. Si no cabe ni con lo
 * mínimo, no aplica nada: devuelve el choque con su medida.
 */
export async function ajustarVariante(
  sb: SB,
  userId: string,
  variantId: string,
  opts: { paginas?: number; soloSiRegla?: boolean; onProgreso?: (p: ProgresoAjuste) => void; conIA?: boolean } = {},
): Promise<ResultadoAjusteVariante | null> {
  const reglas0 = await leerReglasVariante(sb, userId, variantId);
  const max = paginasObligatorias(reglas0);
  if (opts.soloSiRegla && !max) return null;
  const pedidas = opts.paginas ?? max ?? 2;
  let prep = await prepararMotor(sb, userId, variantId, pedidas);
  if (!prep) throw new Error("Variante no encontrada.");
  const condensar = opts.conIA === false ? undefined : await condensadorDeUsuario(sb, userId);
  const nombreAntes = plantillaDe(prep.resume).name;
  let r = await resolverPaginas(entradaMotor(prep, { condensar, onProgreso: opts.onProgreso }));
  const salida: ResultadoAjusteVariante = {
    ...sinMiniaturas(r),
    aplicado: false,
    real: null,
    rechazados: [],
    cambios: [],
    rondas: 1,
  };
  if (!r.cabe || r.resueltoPor === "ya-cabe") {
    salida.real = { paginas: r.paginas, cuerpo: r.cuerpo, cabe: r.cabe };
    return salida;
  }
  // Ronda 1, y hasta 2 más si el PDF REAL (no la simulación) sigue pasándose.
  const planes: PlanMotor[] = [];
  const palancas = new Set<Palanca>();
  for (let ronda = 1; ronda <= 3; ronda += 1) {
    const ap = await aplicarPlanMotor(sb, userId, variantId, prep.detalle.items, r.plan, {
      reglas: prep.reglas,
      propias: prep.propiasLista,
      nombreAntes,
      resueltoPor: r.resueltoPor ?? "motor",
      fusionar: ronda > 1,
    });
    planes.push(r.plan);
    r.palancas.forEach((p) => palancas.add(p));
    salida.aplicado = true;
    salida.rondas = ronda;
    salida.rechazados.push(...ap.rechazados);
    if (ap.medidaId) Object.assign(salida, { medidaId: ap.medidaId, medidaNombre: ap.medidaNombre });
    const { actual } = await medirVariante(sb, userId, variantId, prep.objetivo);
    salida.real = { paginas: actual.medida.porPagina.length, cuerpo: actual.bodySize, cabe: !actual.noCabe };
    if (!actual.noCabe || ronda === 3) break;
    // La simulación se quedó corta: otra ronda sobre lo YA aplicado, sin IA.
    prep = (await prepararMotor(sb, userId, variantId, pedidas))!;
    r = await resolverPaginas(entradaMotor(prep, { onProgreso: opts.onProgreso }));
    if (!r.cabe || r.resueltoPor === "ya-cabe") break;
  }
  // El plan que se cuenta: el de todas las rondas juntas (la disposición, la última).
  const total: PlanMotor = {
    disposicion: [...planes].reverse().find((p) => p.disposicion.tipo !== "actual")?.disposicion ?? planes[0]!.disposicion,
    reescribir: planes.flatMap((p) => p.reescribir),
    ocultar: planes.flatMap((p) => p.ocultar),
  };
  const rechazadosIds = new Set(salida.rechazados.map((x) => x.id));
  total.ocultar = total.ocultar.filter((x) => !rechazadosIds.has(x.id));
  // Un item condensado en una ronda y dejado fuera en otra cuenta como «fuera»
  // (su «Revertir» repone la fila original de la instantánea, texto incluido).
  const fueraIds = new Set(total.ocultar.map((x) => x.id));
  total.reescribir = total.reescribir.filter((x) => !rechazadosIds.has(x.id) && !fueraIds.has(x.id));
  salida.plan = total;
  salida.palancas = (["disposicion", "reescritura", "seleccion"] as Palanca[]).filter((p) => palancas.has(p));
  salida.cambios = cambiosDe(total, nombreAntes, salida.medidaNombre);
  if (salida.real) Object.assign(salida, { paginas: salida.real.paginas, cuerpo: salida.real.cuerpo });
  return salida;
}

/** Para las respuestas de crear/tailor/afinar: el ajuste en pocas cifras. */
export function resumenAjuste(r: ResultadoAjusteVariante | null) {
  if (!r) return null;
  return {
    aplicado: r.aplicado,
    cabe: r.real?.cabe ?? r.cabe,
    paginas: r.real?.paginas ?? r.paginas,
    cuerpo: r.real?.cuerpo ?? r.cuerpo,
    objetivo: r.objetivo,
    palancas: r.palancas,
    reescritos: r.plan.reescribir.length,
    fuera: r.plan.ocultar.length,
    choque: r.choque as Choque | null,
  };
}

/**
 * La puerta de crear/tailor/afinar: con «Máximo N páginas» obligatoria, el motor
 * corre ANTES de dar el resultado. Un fallo del motor no tumba lo creado: se dice.
 */
export async function puertaPaginas(sb: SB, userId: string, variantId: string) {
  try {
    return resumenAjuste(await ajustarVariante(sb, userId, variantId, { soloSiRegla: true }));
  } catch (e) {
    console.error("[ajuste] la puerta de páginas falló", variantId, e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ── «Elegir cómo ajustar»: las cuatro, medidas ──────────────────────────────
export type ClaveOpcion = "A" | "B" | "C" | "D";
export interface OpcionAjuste {
  /** A plantilla existente · B plantilla a medida · C reescritura en la actual · D la combinación del motor */
  clave: ClaveOpcion;
  nombre: string;
  cabe: boolean;
  paginas: number;
  cuerpo: number;
  /** miniatura: el MISMO render que se midió */
  pdf?: string;
  /** null = no hay nada que aplicar (p. ej. ninguna plantilla del catálogo entra en la búsqueda) */
  plan: PlanMotor | null;
  palancas: Palanca[];
  reescritos: number;
  fuera: number;
  razon: string | null;
  choque: Choque | null;
}

const soloDisposicion = (d: Disposicion): PlanMotor => ({ disposicion: d, reescribir: [], ocultar: [] });

function opcionDeMotor(clave: ClaveOpcion, r: ResultadoMotor): OpcionAjuste {
  return {
    clave,
    nombre: r.plan.disposicion.nombre,
    cabe: r.cabe,
    paginas: r.paginas,
    cuerpo: r.cuerpo,
    pdf: r.pdf,
    plan: r.plan,
    palancas: r.palancas,
    reescritos: r.plan.reescribir.length,
    fuera: r.plan.ocultar.length,
    razon: r.razon,
    choque: r.choque,
  };
}

/**
 * Las cuatro salidas medidas, desde el documento SIN ajustar: si había un ajuste
 * aplicado, se deshace primero (nada se pierde: se elige otra vez y se aplica con
 * su instantánea). D es el motor entero; A y B salen de su L1; C es el motor
 * solo sobre la plantilla actual, reusando las reescrituras que D ya validó.
 */
export async function opcionesDeAjuste(
  sb: SB,
  userId: string,
  variantId: string,
  paginas: number,
  onProgreso?: (p: ProgresoAjuste) => void,
): Promise<{ deshecho: boolean; objetivo: number; yaCabe: boolean; antes: ResultadoMotor["antes"] | null; opciones: OpcionAjuste[] }> {
  const det = await getVariant(sb, userId, variantId);
  if (!det) throw new Error("Variante no encontrada.");
  const deshecho = hayAjusteAplicado(det.items) ? await deshacerAjuste(sb, userId, variantId, det.items) : false;
  const prep = await prepararMotor(sb, userId, variantId, paginas);
  if (!prep) throw new Error("Variante no encontrada.");
  if (!prep.actual.noCabe) return { deshecho, objetivo: prep.objetivo, yaCabe: true, antes: null, opciones: [] };
  const condensar = await condensadorDeUsuario(sb, userId);
  const d = await resolverPaginas(entradaMotor(prep, { condensar, onProgreso }));
  const c = await resolverPaginas(
    entradaMotor(prep, {
      soloActual: true,
      condensar: d.reescritura ? undefined : condensar,
      reescriturasPrevias: d.reescritura ? d.reescriturasValidas : undefined,
      onProgreso,
    }),
  );
  const a: OpcionAjuste = d.mejorPlantilla
    ? {
        clave: "A",
        nombre: d.mejorPlantilla.disposicion.nombre,
        cabe: d.mejorPlantilla.cabe,
        paginas: d.mejorPlantilla.paginas,
        cuerpo: d.mejorPlantilla.cuerpo,
        pdf: d.mejorPlantilla.pdf,
        plan: soloDisposicion(d.mejorPlantilla.disposicion),
        palancas: ["disposicion"],
        reescritos: 0,
        fuera: 0,
        razon: null,
        choque: null,
      }
    : { clave: "A", nombre: "", cabe: false, paginas: 0, cuerpo: 0, plan: null, palancas: [], reescritos: 0, fuera: 0, razon: "ninguna plantilla del catálogo entra en la búsqueda", choque: null };
  const b: OpcionAjuste = d.medida
    ? {
        clave: "B",
        nombre: d.medida.disposicion.nombre,
        cabe: d.medida.cabe,
        paginas: d.medida.paginas,
        cuerpo: d.medida.cuerpo,
        pdf: d.medida.pdf,
        plan: soloDisposicion(d.medida.disposicion),
        palancas: ["disposicion"],
        reescritos: 0,
        fuera: 0,
        razon: d.medida.razon ?? null,
        choque: null,
      }
    : { clave: "B", nombre: "", cabe: false, paginas: 0, cuerpo: 0, plan: null, palancas: [], reescritos: 0, fuera: 0, razon: "la plantilla a medida no se pudo medir", choque: null };
  return { deshecho, objetivo: prep.objetivo, yaCabe: false, antes: d.antes, opciones: [a, b, opcionDeMotor("C", c), opcionDeMotor("D", d)] };
}

/**
 * Aplica la opción ELEGIDA (el plan viaja por el cliente: aplicarPlanMotor lo
 * revalida entero). Si ya había un ajuste, se deshace antes: «Deshacer» vuelve
 * siempre al documento de antes de ajustar.
 */
export async function aplicarOpcion(sb: SB, userId: string, variantId: string, plan: PlanMotor, paginas: number): Promise<ResultadoAjusteVariante> {
  let det = await getVariant(sb, userId, variantId);
  if (!det) throw new Error("Variante no encontrada.");
  if (hayAjusteAplicado(det.items)) {
    await deshacerAjuste(sb, userId, variantId, det.items);
    det = (await getVariant(sb, userId, variantId))!;
  }
  const prep = await prepararMotor(sb, userId, variantId, paginas);
  if (!prep) throw new Error("Variante no encontrada.");
  const nombreAntes = plantillaDe(prep.resume).name;
  const ap = await aplicarPlanMotor(sb, userId, variantId, det.items, plan, {
    reglas: prep.reglas,
    propias: prep.propiasLista,
    nombreAntes,
    resueltoPor: "elegido",
  });
  const { actual } = await medirVariante(sb, userId, variantId, prep.objetivo);
  const rech = new Set(ap.rechazados.map((x) => x.id));
  const aplicado: PlanMotor = {
    disposicion: rech.has("diseno") ? { tipo: "actual", templateId: prep.resume.templateId ?? "", nombre: nombreAntes, propia: false } : plan.disposicion,
    reescribir: (plan.reescribir ?? []).filter((x) => !rech.has(x.id)),
    ocultar: (plan.ocultar ?? []).filter((x) => !rech.has(x.id)),
  };
  const palancas = (["disposicion", "reescritura", "seleccion"] as Palanca[]).filter((p) =>
    p === "disposicion" ? aplicado.disposicion.tipo !== "actual" : p === "reescritura" ? aplicado.reescribir.length > 0 : aplicado.ocultar.length > 0,
  );
  const real = { paginas: actual.medida.porPagina.length, cuerpo: actual.bodySize, cabe: !actual.noCabe };
  return {
    objetivo: prep.objetivo,
    cabe: real.cabe,
    resueltoPor: "motor",
    palancas,
    plan: aplicado,
    paginas: real.paginas,
    cuerpo: real.cuerpo,
    antes: { templateId: plantillaDe(prep.resume).id, nombre: nombreAntes, paginas: prep.actual.medida.porPagina.length, cuerpo: prep.actual.bodySize },
    mejorPlantilla: null,
    medida: null,
    alternativas: [],
    medicion: { consideradas: 0, medidas: 0, caben: 0, renders: 0, tope: false, ms: 0 },
    reescritura: null,
    seleccion: null,
    reescriturasValidas: [],
    choque: null,
    incumplidas: [],
    pasos: [],
    razon: null,
    aplicado: true,
    medidaId: ap.medidaId,
    medidaNombre: ap.medidaNombre,
    real,
    rechazados: ap.rechazados,
    cambios: cambiosDe(aplicado, nombreAntes, ap.medidaNombre),
    rondas: 1,
  };
}
