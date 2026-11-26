import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { hayClaveIA, modeloPara } from "@/lib/ai/modelos";
import { createClient } from "@/lib/supabase/server";
import {
  getVariant,
  getVariantItem,
  setAiOverride,
  buildVariantResumeData,
  setVariantPresentation,
  updateItem,
} from "@/lib/db/variants";
import { geminiApiKey } from "@/lib/extract/llm";
import { getUserLlmKey, getUserLlmKey3 } from "@/lib/account/byok";
import { contextoMemoria, mensajesConMemoria, type ContextoMemoria } from "@/lib/ai/memoria";
// Cuántas páginas quiere el usuario: 1, 2 o 3 (objetivoDe vive en autofit.ts, con
// su test; un route.ts de Next no puede exportar nada que no sea del contrato).
import { autofit, objetivoDe, plantillaDe } from "@/lib/cv/autofit";
import { resolverAjuste, sinProtegidos, type ProgresoAjuste, type ResultadoAjuste } from "@/lib/cv/cascada";
import { comprobar, plantillaDeParams, validarParams, type ParamsMedida } from "@/lib/cv/plantilla-medida";
import {
  guardarPlantillaUsuario,
  listarPlantillasUsuario,
  resolverPlantillaDelDocumento,
  type PlantillaUsuario,
} from "@/lib/cv/plantillas-usuario";
import { getTemplate } from "@/lib/cv/templates";
import { obtenerReglas, type Reglas } from "@/lib/cv/reglas-ajuste";
import { renderResumeToBuffer } from "@/lib/cv/ResumePDF";
import {
  construirAjuste,
  itemDeAjuste,
  lineasDelPrompt,
  verificarAcortado,
  campoDe,
  AjustePlanSchema,
  type AjusteLLM,
  type AjusteItem,
} from "@/lib/cv/ajuste";

export const runtime = "nodejs";
// El I/O del LLM no cuenta como Active CPU en Fluid Compute (02 §1).
export const maxDuration = 300;

/**
 * «AJUSTAR A N PÁGINAS» (1, 2 o 3) — la ruta.
 *
 *   POST { accion:'ajustar' }   → DE UN CLIC (DA-A4): prueba TODAS las plantillas
 *        (catálogo + personalizadas) con el contenido tal cual, luego la plantilla a
 *        medida (que guarda en Personalizadas) y solo al final los recortes, todos de
 *        una vez; APLICA la primera que deja el CV en las páginas pedidas y guarda una
 *        instantánea. Responde en NDJSON con el progreso real (cascada.ts).
 *   POST { accion:'deshacer' }  → repone plantilla, items y textos de la instantánea.
 *   POST { accion:'opciones' }  → solo mide: las plantillas donde cabe tal cual.
 *   POST { accion:'analizar' }  → «Revisar uno por uno»: la PROPUESTA revisable de
 *        recortes, item a item; quitar y reordenar siguen por DELETE/PATCH items.
 *   POST { accion:'acortar', id, propuesto }      → aplica UN acortado, ya aceptado.
 *   POST { accion:'guardar-medida', params, nombre? } → guarda una plantilla a
 *        medida como plantilla del usuario, tras volver a comprobarla aquí.
 *
 * Las REGLAS de la variante (DA-R1) mandan: paginasMax obligatoria acota el
 * objetivo, sinFoto deja fuera las plantillas de foto y un recorte JAMÁS quita un
 * item de «incluir siempre».
 *
 * ★ EL NÚMERO SALE DE MEDIR, NO DE ESTIMAR. `sobran` se calcula renderizando el PDF
 * REAL de la variante (el mismo motor que /api/cv: el preview ES el PDF) y contando
 * sus líneas con medir.ts. Por eso esta ruta renderiza aunque «solo» vaya a pedirle
 * una opinión a un modelo: la opinión es opinable, el número no.
 */

const fallo = (msg: string, status: number) => NextResponse.json({ error: msg }, { status });
const motivo = (e: unknown) => (e instanceof Error ? e.message : "Error");

/**
 * El LLM real como función inyectable. Clave BYOK del usuario o del servidor.
 * apiKey3 = clave de Anthropic: con ella redacta Claude; sin ella, el fallback Gemini.
 */
function geminiAjusteLLM(apiKey?: string, apiKey3?: string, mem?: ContextoMemoria): AjusteLLM {
  const key = apiKey || geminiApiKey();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  // Acortar/seleccionar sin inventar es redaccion-preserva-hechos: por el registro.
  const model = modeloPara("redaccion-preserva-hechos", key, undefined, undefined, apiKey3);
  const SYS =
    "Eres un asistente que ayuda a que un CV QUEPA en un número de páginas. Te doy los items " +
    "VISIBLES de la variante (id, tipo y texto), el rol objetivo y CUÁNTAS LÍNEAS SOBRAN (medidas " +
    "sobre el PDF real: son las líneas que cayeron en las páginas de más). Tu tarea tiene tres " +
    "partes y NINGUNA es escribir un CV nuevo:\n" +
    "(1) QUITAR: los items menos relevantes para el rol objetivo, los que sobrarían primero. Propón " +
    "los SUFICIENTES para cubrir las líneas que sobran (una viñeta ocupa de 1 a 3 líneas; un rol " +
    "entero, su cabecera más sus viñetas): quedarse corto deja el CV en las mismas páginas.\n" +
    "(2) ORDEN: los ids de las VIÑETAS en el orden en que deberían ir dentro de su experiencia " +
    "(lo más fuerte arriba). Solo viñetas.\n" +
    "(3) ACORTAR: reescrituras MÁS CORTAS del mismo texto.\n" +
    "★ REGLA QUE NO SE NEGOCIA: al acortar, las CIFRAS (con su unidad) y los NOMBRES PROPIOS, " +
    "siglas y tecnologías son INTOCABLES. 850 ms sigue siendo 850 ms; Kafka sigue siendo Kafka. " +
    "Se recorta el relleno («fui responsable de», «me encargué de»), jamás el hecho. Si una viñeta " +
    "no se puede acortar sin perder un dato, NO la incluyas: una propuesta menos es mejor que una " +
    "propuesta que borra el dato que hacía valiosa la viñeta.\n" +
    "No inventes ids. No inventes cifras. No añadas tecnologías que no estén en el texto original.";
  return async ({ items, targetTitle, sobran, paginasObjetivo }) => {
    // La memoria (DA-M2) va primero y cacheada; los items de la VARIANTE (sus ids y
    // su texto con overrides) siguen en el mensaje: son lo que se acorta.
    const r = await generateObject({
      model,
      schema: AjustePlanSchema,
      ...mensajesConMemoria({
        memoria: mem?.memoria,
        modelo: model,
        sistema: SYS,
        usuario:
          `ROL OBJETIVO: ${targetTitle || "(sin especificar)"}\n` +
          `OBJETIVO: ${paginasObjetivo} páginas. SOBRAN ${sobran} LÍNEAS.\n\n` +
          `ITEMS DE LA VARIANTE:\n${lineasDelPrompt(items)}`,
      }),
      temperature: 0.2,
    });
    await mem?.alUsar(r);
    return r.object;
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: variantId } = await params;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fallo("Sesión requerida.", 401);

  let body: { accion?: string; paginas?: number; id?: string; propuesto?: string; params?: ParamsMedida; nombre?: string };
  try {
    body = await req.json();
  } catch {
    return fallo("cuerpo inválido", 400);
  }

  // ── ACEPTAR UN ACORTADO ────────────────────────────────────────────────────
  // Se aplica UNO. El texto que llega del cliente NO se cree: el original se lee
  // de la base y el candado vuelve a correr aquí. Entre la propuesta y el clic hay
  // una red y un navegador, y ninguno de los dos es de fiar.
  if (body.accion === "acortar") {
    const vitemId = (body.id ?? "").trim();
    const propuesto = (body.propuesto ?? "").trim();
    if (!vitemId) return fallo("Falta el id del item.", 400);
    if (!propuesto) return fallo("La propuesta está vacía.", 400);

    try {
      const it = await getVariantItem(sb, user.id, variantId, vitemId);
      if (!it) return fallo("Ese item no está en esta variante.", 404);

      const campo = campoDe(it.kind);
      if (!campo) return fallo("Este tipo de item no tiene texto acortable.", 422);

      const original = String(it.data[campo] ?? "");
      if (!original.trim()) return fallo("El item no tiene texto que acortar.", 422);

      const veredicto = verificarAcortado(original, propuesto);
      if (!veredicto.ok) {
        // 422 y el motivo REAL: el cliente lo pinta tal cual. Un rechazo mudo aquí
        // sería indistinguible de un fallo de red, y esto no es un fallo: es el
        // producto negándose a escribir algo que pierde un hecho.
        return fallo(`No se aplicó: ${veredicto.razon}`, 422);
      }

      // El override se MEZCLA con el que hubiera (foto, QR y demás viven ahí):
      // escribir solo el campo acortado borraría lo que no se está tocando.
      await setAiOverride(sb, user.id, vitemId, {
        data: { ...(it.overrideData ?? {}), [campo]: propuesto },
        sourceItem: it.itemId,
        reason: "Acortado por IA; cifras y entidades del original preservadas (verify.ts).",
      });

      return NextResponse.json({ ok: true, id: vitemId, campo, original, propuesto });
    } catch (e) {
      console.error("[api/ajustar] no se pudo aplicar el acortado", vitemId, e);
      return fallo(motivo(e), 500);
    }
  }

  // ── GUARDAR LA PLANTILLA A MEDIDA (paso 3) ─────────────────────────────────
  // Los parámetros llegan del cliente y NO se creen: se validan contra los límites
  // ATS y se vuelve a renderizar ESTA variante con ellos para comprobar round-trip,
  // medida y contraste aquí. Solo entonces se guarda.
  if (body.accion === "guardar-medida") {
    const params = body.params;
    if (!params || typeof params !== "object") return fallo("Faltan los parámetros de la plantilla.", 400);
    const v = validarParams(params);
    if (!v.ok) return fallo(`No se guardó: ${v.razon}.`, 422);
    try {
      const resume = await buildVariantResumeData(sb, user.id, variantId);
      const borrador = plantillaDeParams(params);
      const doc = { ...resume, templateId: borrador.id, paletteId: undefined, typographyId: undefined };
      const buf = new Uint8Array(await renderResumeToBuffer(doc, {}));
      const c = await comprobar({ ...resume, paletteId: undefined, typographyId: undefined }, borrador, buf);
      if (c.razon) return fallo(`No se guardó: ${c.razon}.`, 422);
      const p = await guardarPlantillaUsuario(sb, user.id, params, body.nombre);
      return NextResponse.json({ ok: true, plantilla: { id: p.id, nombre: p.nombre } });
    } catch (e) {
      console.error("[api/ajustar] no se pudo guardar la plantilla a medida", variantId, e);
      return fallo(motivo(e), 500);
    }
  }

  const paginasPedidas = objetivoDe(body.paginas);

  // ── DESHACER EL AJUSTE ─────────────────────────────────────────────────────
  // La instantánea vive EN EL SERVIDOR (override de basics, clave `ajustePrevio`):
  // el cliente no manda qué reponer, así que no puede colar un texto sin candado.
  if (body.accion === "deshacer") {
    try {
      const detalle = await getVariant(sb, user.id, variantId);
      if (!detalle) return fallo("Variante no encontrada.", 404);
      const ok = await deshacerAjuste(sb, user.id, variantId, detalle.items);
      if (!ok) return fallo("No hay ningún ajuste que deshacer.", 409);
      return NextResponse.json({ ok: true, items: (await getVariant(sb, user.id, variantId))?.items ?? [] });
    } catch (e) {
      console.error("[api/ajustar] no se pudo deshacer el ajuste", variantId, e);
      return fallo(motivo(e), 500);
    }
  }

  // Sin clave de IA no hay recortes propuestos, pero buscar plantilla (catálogo,
  // personalizadas, a medida) es del motor y corre igual.
  const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
  const byok3 = (await getUserLlmKey3(sb, user.id)) ?? undefined;
  const conIA = hayClaveIA(byok, byok3);

  /** Lo común a analizar, ajustar y opciones: medir el documento y saber proponer recortes. */
  const preparar = async (paginasObjetivo: number) => {
    const detalle = await getVariant(sb, user.id, variantId);
    if (!detalle) return null;
    const reglas = await leerReglasVariante(sb, user.id, variantId);
    // paginasMax obligatoria: el objetivo nunca la pasa (DA-R1).
    const objetivo = objetivoDe(
      reglas.paginasMax && reglas.fuerza.paginasMax === "obligatoria" ? Math.min(paginasObjetivo, reglas.paginasMax) : paginasObjetivo,
    );
    // MEDIR. El mismo motor que el preview, el mismo buffer, la misma métrica de la
    // plantilla que el usuario eligió. Se mide DESPUÉS del autofit: si bajando el
    // cuerpo (hasta 10 pt) ya cabe, no sobra nada; si no, «sobran» se cuenta a 10 pt.
    const { data: resume } = await resolverPlantillaDelDocumento(
      sb,
      user.id,
      await buildVariantResumeData(sb, user.id, variantId),
    );
    const actual = await autofit(resume, plantillaDe(resume), objetivo);
    // Solo los VISIBLES cuentan: lo oculto no ocupa líneas.
    const items: AjusteItem[] = detalle.items.map(itemDeAjuste);
    const entrada = {
      targetTitle: detalle.variant.target_title ?? "",
      items,
      paginas: actual.medida.porPagina.length,
      paginasObjetivo: objetivo,
      sobran: actual.sobran,
    };
    const sinPlan =
      (notas: string): AjusteLLM =>
      async () => ({ quitar: [], orden: [], acortar: [], notas });
    /**
     * La propuesta de recortes: una llamada al modelo, solo si de verdad no cabe.
     * `estricto` (ajuste de un clic): sin clave o si el modelo falla, es un motivo
     * que se dice, no una propuesta vacía que se aplica.
     */
    const proponer = async (estricto: boolean) => {
      if (conIA && actual.noCabe) {
        try {
          return await construirAjuste(entrada, {
            llm: geminiAjusteLLM(byok, byok3, await contextoMemoria(sb, user.id, "ajustar")),
          });
        } catch (e) {
          if (estricto) throw new Error(`la IA no respondió (${motivo(e)}): no hay recortes propuestos`);
          console.error("[api/ajustar] el modelo no respondió; sin recortes", variantId, e);
          return construirAjuste(entrada, {
            llm: sinPlan(`La IA no respondió (${motivo(e)}): no hay recortes propuestos.`),
          });
        }
      }
      if (estricto && actual.noCabe) throw new Error("sin clave de IA no hay recortes propuestos");
      return construirAjuste(entrada, {
        llm: sinPlan(conIA ? "" : "Sin clave de IA: no hay recortes propuestos."),
      });
    };
    return { detalle, reglas, objetivo, resume, actual, items, proponer };
  };

  // ── AJUSTAR DE UN CLIC (DA-A4) · OPCIONES ──────────────────────────────────
  // «ajustar» resuelve y APLICA la primera salida que deja el CV en las páginas
  // pedidas, con instantánea para «Deshacer ajuste». «opciones» solo mide: las
  // plantillas donde el contenido cabe tal cual, con miniatura. Las dos responden
  // en NDJSON: una línea por paso real ({tipo:'progreso'}) y al final
  // {tipo:'resultado'} o {tipo:'error'}.
  if (body.accion === "ajustar" || body.accion === "opciones") {
    const soloOpciones = body.accion === "opciones";
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const enviar = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        try {
          enviar({ tipo: "progreso", paso: 0 });
          const prep = await preparar(paginasPedidas);
          if (!prep) throw new Error("Variante no encontrada.");
          const propiasLista = await listarPlantillasUsuario(sb, user.id);
          // listarPlantillasUsuario ya las registró en templates.ts.
          const propias = propiasLista.map((p) => getTemplate(p.id)).filter((t) => t.id.startsWith("u:"));
          const resultado = await resolverAjuste({
            data: prep.resume,
            objetivo: prep.objetivo,
            actual: prep.actual,
            propias,
            sinFoto: prep.reglas.sinFoto && prep.reglas.fuerza.sinFoto === "obligatoria",
            // Un recorte JAMÁS quita un item de «incluir siempre», sea cual sea su fuerza.
            protegidos: new Set(prep.reglas.incluirSiempre),
            soloPlantillas: soloOpciones,
            maxAlternativas: soloOpciones ? 6 : 4,
            recortes: async () => ({ items: prep.items, propuesta: await prep.proponer(true) }),
            onProgreso: (p: ProgresoAjuste) => enviar({ tipo: "progreso", ...p }),
          });
          if (soloOpciones) {
            enviar({ tipo: "resultado", resultado });
            return;
          }
          const aplicado = await aplicarAjuste(sb, user.id, variantId, prep.detalle.items, resultado, propiasLista);
          console.log("[api/ajustar] ajuste de un clic", {
            variantId,
            resueltoPor: resultado.resueltoPor,
            medidas: resultado.medicion.medidas,
            caben: resultado.medicion.caben,
            ms: resultado.medicion.ms,
          });
          enviar({
            tipo: "resultado",
            resultado: aplicado.resultado,
            aplicado: aplicado.aplicado,
            items: aplicado.aplicado ? ((await getVariant(sb, user.id, variantId))?.items ?? []) : undefined,
          });
        } catch (e) {
          console.error("[api/ajustar] no se pudo ajustar", variantId, e);
          enviar({ tipo: "error", error: motivo(e) });
        } finally {
          ctrl.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform" },
    });
  }

  // ── ANALIZAR (Revisar uno por uno) ─────────────────────────────────────────
  // La propuesta REVISABLE de recortes, item a item, como antes: no aplica nada.
  try {
    const prep = await preparar(paginasPedidas);
    if (!prep) return fallo("Variante no encontrada.", 404);
    const propuesta = await prep.proponer(false);
    // Los descartes se registran EN EL SERVIDOR además de viajar al cliente: si un
    // día el modelo empieza a comerse cifras en masa, tiene que verse en los logs y
    // no solo en la pantalla de quien lo sufrió.
    for (const d of propuesta.descartados) {
      if (d.tipo === "acortar") {
        console.warn("[api/ajustar] acortado RECHAZADO por el candado", { variantId, item: d.id, razon: d.razon });
      }
    }
    // Lo que toca un item de «incluir siempre» ni se propone (DA-R1).
    const prot = sinProtegidos(prep.items, propuesta, new Set(prep.reglas.incluirSiempre));
    return NextResponse.json({ ajuste: { ...propuesta, quitar: prot.quitar } });
  } catch (e) {
    console.error("[api/ajustar] no se pudo armar la propuesta", variantId, e);
    return fallo(motivo(e), 500);
  }
}

// ── Reglas, instantánea, aplicar y deshacer ─────────────────────────────────
type SBx = Awaited<ReturnType<typeof createClient>>;
type ItemVariante = NonNullable<Awaited<ReturnType<typeof getVariant>>>["items"][number];

/** Las reglas de la variante; sin la 0012 (o sin la columna) salen las de por defecto. */
async function leerReglasVariante(sb: SBx, userId: string, variantId: string): Promise<Reglas> {
  const { data, error } = await sb.from("cv_variants").select("*").eq("id", variantId).eq("user_id", userId).maybeSingle();
  if (error) console.warn("[api/ajustar] no se pudieron leer las reglas; sin reglas", error.message);
  return obtenerReglas((data as { reglas?: unknown } | null) ?? null);
}

/** La clave de la instantánea dentro del override de basics (el PDF no la lee). */
const CLAVE_PREVIO = "ajustePrevio";
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
}

const basicsDe = (items: ItemVariante[]) => items.find((i) => i.kind === "basics") ?? null;

/**
 * Aplica lo que resolvió el motor y guarda la instantánea. Si no se resolvió (o ya
 * cabía) no toca nada. Devuelve el resultado para el cliente (con el id y el nombre
 * de la plantilla a medida, si se creó).
 */
async function aplicarAjuste(
  sb: SBx,
  userId: string,
  variantId: string,
  items: ItemVariante[],
  resultado: ResultadoAjuste,
  propias: PlantillaUsuario[],
): Promise<{ aplicado: boolean; resultado: ResultadoAjuste & { medidaId?: string; medidaNombre?: string } }> {
  const r = resultado.resueltoPor;
  if (!r || r === "ya-cabe") return { aplicado: false, resultado };

  const ovBasics = (basicsDe(items)?.override_data ?? {}) as Record<string, unknown>;
  const diseno = Object.fromEntries(
    CLAVES_DISENO.map((k) => [k, typeof ovBasics[k] === "string" && ovBasics[k] ? (ovBasics[k] as string) : null]),
  ) as Instantanea["diseno"];
  const rec = resultado.recortes;
  const ids = r === "recortes" && rec ? [...new Set([...rec.quitar.map((q) => q.id), ...rec.acortar.map((a) => a.id)])] : [];
  let filas: FilaPrevia[] = [];
  if (ids.length) {
    const { data, error } = await sb.from("variant_items").select(COLS).eq("variant_id", variantId).eq("user_id", userId).in("id", ids);
    if (error) throw new Error(error.message);
    filas = (data ?? []) as FilaPrevia[];
  }
  const previo: Instantanea = { v: 1, cuando: new Date().toISOString(), resueltoPor: r, diseno, filas };

  const extra: { medidaId?: string; medidaNombre?: string } = {};
  if (r === "plantilla" && resultado.plantilla) {
    const p = resultado.plantilla;
    // Una propia lleva su paleta y su pareja dentro: las del usuario se sueltan.
    await setVariantPresentation(
      sb,
      userId,
      variantId,
      p.propia ? { templateId: p.templateId, paletteId: null, typographyId: null } : { templateId: p.templateId },
    );
  } else if (r === "medida" && resultado.medida) {
    const params = resultado.medida.params;
    // Si ya hay una personalizada con estos mismos parámetros, se reusa.
    const igual = propias.find((x) => JSON.stringify(x.params) === JSON.stringify(params));
    const p = igual ?? (await guardarPlantillaUsuario(sb, userId, params, `A medida · ${resultado.antes.nombre}`));
    extra.medidaId = p.id;
    extra.medidaNombre = p.nombre;
    await setVariantPresentation(sb, userId, variantId, { templateId: p.id, paletteId: null, typographyId: null });
  } else if (r === "recortes" && rec) {
    // Quitar = OCULTAR (reversible). Acortar = override, con el candado corriendo
    // otra vez aquí sobre el texto de la base.
    const porId = new Map(items.map((i) => [i.id, i]));
    for (const q of rec.quitar) await updateItem(sb, userId, q.id, { visible: false });
    for (const a of rec.acortar) {
      const it = porId.get(a.id);
      const campo = it ? campoDe(it.kind) : null;
      const original = it && campo ? String(it.data[campo] ?? "") : "";
      if (!it || !campo || !original.trim() || !verificarAcortado(original, a.propuesto).ok) continue;
      await setAiOverride(sb, userId, a.id, {
        data: { ...(it.override_data ?? {}), [campo]: a.propuesto },
        sourceItem: it.item_id,
        reason: "Acortado por IA al ajustar páginas; cifras y entidades del original preservadas (verify.ts).",
      });
    }
  }
  // La instantánea va junto al diseño (override de basics): sin migración.
  const pres = await setVariantPresentation(sb, userId, variantId, {});
  const { error } = await sb
    .from("variant_items")
    .update({ override_data: { ...(pres.override ?? {}), [CLAVE_PREVIO]: previo } })
    .eq("id", pres.basicsItemId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { aplicado: true, resultado: { ...resultado, ...extra } };
}

/** Repone el diseño y las filas de la instantánea y la retira. false si no había ninguna. */
async function deshacerAjuste(sb: SBx, userId: string, variantId: string, items: ItemVariante[]): Promise<boolean> {
  const basics = basicsDe(items);
  const ov = (basics?.override_data ?? null) as Record<string, unknown> | null;
  const previo = ov?.[CLAVE_PREVIO] as Instantanea | undefined;
  if (!basics || !ov || !previo || previo.v !== 1) return false;
  const propios = new Set(items.map((i) => i.id));
  for (const f of previo.filas ?? []) {
    if (!propios.has(f.id)) continue; // solo filas de ESTA variante
    const { id, ...cols } = f;
    const { error } = await sb.from("variant_items").update(cols).eq("id", id).eq("variant_id", variantId).eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
  const next: Record<string, unknown> = { ...ov };
  delete next[CLAVE_PREVIO];
  for (const k of CLAVES_DISENO) {
    const v = previo.diseno?.[k];
    if (v) next[k] = v;
    else delete next[k];
  }
  const { error } = await sb
    .from("variant_items")
    .update({ override_data: Object.keys(next).length ? next : null })
    .eq("id", basics.id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return true;
}
