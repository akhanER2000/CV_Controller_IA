import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@/lib/supabase/server";
import { getVariant, getVariantItem, setAiOverride, buildVariantResumeData } from "@/lib/db/variants";
import { geminiApiKey } from "@/lib/extract/llm";
import { getUserLlmKey } from "@/lib/account/byok";
import { renderResumeToBuffer } from "@/lib/cv/ResumePDF";
import { medirPdf, lineasQueSobran } from "@/lib/cv/medir";
import { resolveMetrics, resolveTemplate } from "@/lib/cv/templates";
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

const AI_MODEL = "gemini-flash-latest";

/**
 * «AJUSTAR A DOS PÁGINAS» — la ruta. Dos acciones, las dos MANUALES:
 *
 *   POST { accion:'analizar' }                    → una PROPUESTA revisable.
 *   POST { accion:'acortar', id, propuesto }      → aplica UN acortado, ya aceptado.
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

/** El LLM real (Gemini) como función inyectable. Clave BYOK del usuario o del servidor. */
function geminiAjusteLLM(apiKey?: string): AjusteLLM {
  const key = apiKey || geminiApiKey();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  const model = createGoogleGenerativeAI({ apiKey: key })(AI_MODEL);
  const SYS =
    "Eres un asistente que ayuda a que un CV QUEPA en un número de páginas. Te doy los items " +
    "VISIBLES de la variante (id, tipo y texto), el rol objetivo y CUÁNTAS LÍNEAS SOBRAN (medidas " +
    "sobre el PDF real). Tu tarea tiene tres partes y NINGUNA es escribir un CV nuevo:\n" +
    "(1) QUITAR: los items menos relevantes para el rol objetivo, los que sobrarían primero.\n" +
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
    const { object } = await generateObject({
      model,
      schema: AjustePlanSchema,
      prompt:
        `${SYS}\n\nROL OBJETIVO: ${targetTitle || "(sin especificar)"}\n` +
        `OBJETIVO: ${paginasObjetivo} páginas. SOBRAN ${sobran} LÍNEAS.\n\n` +
        `ITEMS DE LA VARIANTE:\n${lineasDelPrompt(items)}`,
      temperature: 0.2,
    });
    return object;
  };
}

/** Cuántas páginas quiere el usuario. Se acepta 1 o 2 y nada más: el resto no es
 *  «ajustar», es otro documento, y no hay medida que lo respalde. */
function objetivoDe(v: unknown): number {
  const n = Number(v);
  return n === 1 ? 1 : 2;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: variantId } = await params;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fallo("Sesión requerida.", 401);

  let body: { accion?: string; paginas?: number; id?: string; propuesto?: string };
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

  // ── ANALIZAR ───────────────────────────────────────────────────────────────
  const paginasObjetivo = objetivoDe(body.paginas);

  const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
  if (!byok && !geminiApiKey()) {
    return fallo("Falta configurar la clave de IA (BYOK o GEMINI_API_KEY del servidor).", 503);
  }

  try {
    const detalle = await getVariant(sb, user.id, variantId);
    if (!detalle) return fallo("Variante no encontrada.", 404);

    // 1 · MEDIR. El mismo motor que el preview, el mismo buffer, la misma métrica
    //     de la plantilla que el usuario eligió. Si esto fallara, no hay número —
    //     y sin número no hay propuesta, porque «sobran N líneas» ES la propuesta.
    const resume = await buildVariantResumeData(sb, user.id, variantId);
    const buf = await renderResumeToBuffer(resume, {});
    const tpl = resolveTemplate({
      templateId: resume.templateId,
      paletteId: resume.paletteId,
      typographyId: resume.typographyId,
    });
    const medida = await medirPdf(new Uint8Array(buf), resolveMetrics(tpl.metrics));
    const sobran = lineasQueSobran(medida, paginasObjetivo);

    // 2 · PROPONER. Solo los VISIBLES: lo oculto no ocupa líneas y proponer quitarlo
    //     sería teatro.
    const items: AjusteItem[] = detalle.items.map(itemDeAjuste);
    const targetTitle = detalle.variant.target_title ?? "";

    const propuesta = await construirAjuste(
      { targetTitle, items, paginas: medida.porPagina.length, paginasObjetivo, sobran },
      { llm: geminiAjusteLLM(byok) },
    );

    // Los descartes se registran EN EL SERVIDOR además de viajar al cliente: si un
    // día el modelo empieza a comerse cifras en masa, tiene que verse en los logs y
    // no solo en la pantalla de quien lo sufrió.
    for (const d of propuesta.descartados) {
      if (d.tipo === "acortar") {
        console.warn("[api/ajustar] acortado RECHAZADO por el candado", { variantId, item: d.id, razon: d.razon });
      }
    }

    return NextResponse.json({ ajuste: propuesta });
  } catch (e) {
    console.error("[api/ajustar] no se pudo armar la propuesta", variantId, e);
    return fallo(motivo(e), 500);
  }
}
