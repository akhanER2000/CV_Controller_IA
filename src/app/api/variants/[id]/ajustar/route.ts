import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { hayClaveIA, modeloPara } from "@/lib/ai/modelos";
import { createClient } from "@/lib/supabase/server";
import { getVariant, getVariantItem, setAiOverride, buildVariantResumeData } from "@/lib/db/variants";
import { geminiApiKey } from "@/lib/extract/llm";
import { getUserLlmKey, getUserLlmKey3 } from "@/lib/account/byok";
import { contextoMemoria, mensajesConMemoria, type ContextoMemoria } from "@/lib/ai/memoria";
// Cuántas páginas quiere el usuario: 1, 2 o 3 (objetivoDe vive en autofit.ts, con
// su test; un route.ts de Next no puede exportar nada que no sea del contrato).
import { autofit, objetivoDe, plantillaDe } from "@/lib/cv/autofit";
import { cascada } from "@/lib/cv/cascada";
import { comprobar, plantillaDeParams, validarParams, type ParamsMedida } from "@/lib/cv/plantilla-medida";
import { guardarPlantillaUsuario, resolverPlantillaDelDocumento } from "@/lib/cv/plantillas-usuario";
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
 * «AJUSTAR A N PÁGINAS» (1, 2 o 3) — la ruta. Tres acciones, todas MANUALES:
 *
 *   POST { accion:'analizar' }                    → una PROPUESTA revisable + la CASCADA.
 *   POST { accion:'acortar', id, propuesto }      → aplica UN acortado, ya aceptado.
 *   POST { accion:'guardar-medida', params, nombre? } → guarda la plantilla a medida
 *        (paso 3) como plantilla del usuario, tras volver a comprobarla aquí.
 *
 * LA CASCADA (DA-A1, cascada.ts): 1 · autofit y recortes en la plantilla actual;
 * 2 · plantillas del catálogo donde el mismo contenido cabe; 3 · plantilla a medida.
 * Viaja dentro de `ajuste.cascada`; cada paso dice si deja el CV en las páginas
 * pedidas, MEDIDAS en el PDF real.
 *
 * No existe un «aplicar todo», y no es un olvido: es la regla. Quitar y reordenar
 * viajan por el contrato que ya existe (DELETE/PATCH /api/variants/[id]/items), uno
 * a uno, porque el usuario los acepta uno a uno. Lo único que necesita ruta propia
 * es el acortado, y solo porque tiene que volver a pasar el candado en el servidor.
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

  // ── ANALIZAR ───────────────────────────────────────────────────────────────
  const paginasObjetivo = objetivoDe(body.paginas);

  // Sin clave de IA el paso 1 se queda sin recortes propuestos, pero la cascada
  // (autofit, catálogo y plantilla a medida) es del motor y corre igual.
  const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
  const byok3 = (await getUserLlmKey3(sb, user.id)) ?? undefined;
  const conIA = hayClaveIA(byok, byok3);

  try {
    const detalle = await getVariant(sb, user.id, variantId);
    if (!detalle) return fallo("Variante no encontrada.", 404);

    // 1 · MEDIR. El mismo motor que el preview, el mismo buffer, la misma métrica
    //     de la plantilla que el usuario eligió. Si esto fallara, no hay número —
    //     y sin número no hay propuesta, porque «sobran N líneas» ES la propuesta.
    //     Se mide DESPUÉS del autofit: si bajando el cuerpo (hasta 10 pt) ya cabe,
    //     no sobra nada; si no, «sobran» se cuenta a 10 pt, que es el documento que
    //     el usuario está viendo en el preview.
    const { data: resume } = await resolverPlantillaDelDocumento(
      sb,
      user.id,
      await buildVariantResumeData(sb, user.id, variantId),
    );
    const actual = await autofit(resume, plantillaDe(resume), paginasObjetivo);
    const { medida, sobran } = actual;

    // 2 · PROPONER. Solo los VISIBLES: lo oculto no ocupa líneas y proponer quitarlo
    //     sería teatro.
    const items: AjusteItem[] = detalle.items.map(itemDeAjuste);
    const targetTitle = detalle.variant.target_title ?? "";

    // Si ya cabe, no se gasta una llamada al modelo: no hay nada que recortar. Y si el
    // modelo falla, la cascada (que es del motor) sigue sin recortes y lo dice.
    const sinPlan =
      (notas: string): AjusteLLM =>
      async () => ({ quitar: [], orden: [], acortar: [], notas });
    const entrada = { targetTitle, items, paginas: medida.porPagina.length, paginasObjetivo, sobran };
    let propuesta;
    if (conIA && actual.noCabe) {
      try {
        propuesta = await construirAjuste(entrada, {
          llm: geminiAjusteLLM(byok, byok3, await contextoMemoria(sb, user.id, "ajustar")),
        });
      } catch (e) {
        console.error("[api/ajustar] el modelo no respondió; la cascada sigue sin recortes", variantId, e);
        propuesta = await construirAjuste(entrada, {
          llm: sinPlan(`La IA no respondió (${motivo(e)}): no hay recortes propuestos; la cascada sigue con el motor.`),
        });
      }
    } else {
      propuesta = await construirAjuste(entrada, {
        llm: sinPlan(conIA ? "" : "Sin clave de IA: no hay recortes propuestos; la cascada sigue con el motor."),
      });
    }

    // 3 · LA CASCADA: ¿alcanza con lo de arriba? Si no, catálogo y plantilla a medida.
    const informe = await cascada({ data: resume, objetivo: paginasObjetivo, actual, items, propuesta });

    // Los descartes se registran EN EL SERVIDOR además de viajar al cliente: si un
    // día el modelo empieza a comerse cifras en masa, tiene que verse en los logs y
    // no solo en la pantalla de quien lo sufrió.
    for (const d of propuesta.descartados) {
      if (d.tipo === "acortar") {
        console.warn("[api/ajustar] acortado RECHAZADO por el candado", { variantId, item: d.id, razon: d.razon });
      }
    }

    return NextResponse.json({ ajuste: { ...propuesta, cascada: { ...informe, variantId } } });
  } catch (e) {
    console.error("[api/ajustar] no se pudo armar la propuesta", variantId, e);
    return fallo(motivo(e), 500);
  }
}
