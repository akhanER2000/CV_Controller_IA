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
import { objetivoDe } from "@/lib/cv/autofit";
import { resolverAjuste, sinProtegidos, type ProgresoAjuste } from "@/lib/cv/cascada";
import { comprobar, plantillaDeParams, validarParams, type ParamsMedida } from "@/lib/cv/plantilla-medida";
import { guardarPlantillaUsuario } from "@/lib/cv/plantillas-usuario";
import { renderResumeToBuffer } from "@/lib/cv/ResumePDF";
import type { PlanMotor } from "@/lib/cv/motor-paginas";
import {
  ajustarVariante,
  aplicarOpcion,
  deshacerAjuste,
  leerReglasVariante,
  medirVariante,
  objetivoSegunReglas,
  opcionesDeAjuste,
  prepararMotor,
  revertirCambio,
} from "@/lib/cv/ajuste-variante";
import {
  construirAjuste,
  lineasDelPrompt,
  verificarAcortado,
  campoDe,
  AjustePlanSchema,
  type AjusteLLM,
} from "@/lib/cv/ajuste";

export const runtime = "nodejs";
// El I/O del LLM no cuenta como Active CPU en Fluid Compute (02 §1).
export const maxDuration = 300;

/**
 * «AJUSTAR A N PÁGINAS» (1, 2 o 3) — la ruta.
 *
 *   POST { accion:'ajustar' }   → DE UN CLIC (DA-A6): el MOTOR DE PÁGINAS
 *        (motor-paginas.ts) combina disposición, reescritura para caber y selección
 *        hasta que el PDF real mide las páginas pedidas; APLICA el plan de forma
 *        atómica con instantánea y vuelve a medir. Si ni lo mínimo cabe, no aplica
 *        nada y dice qué regla choca con cuál. NDJSON con el progreso real.
 *   POST { accion:'elegir' }    → «Elegir cómo ajustar»: A-D medidas, con miniatura.
 *   POST { accion:'aplicar', plan } → aplica la opción elegida (revalidada aquí).
 *   POST { accion:'deshacer' }  → repone plantilla, items y textos de la instantánea.
 *   POST { accion:'revertir', cambio } → revierte UN cambio (un item o "diseno").
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

  let body: {
    accion?: string;
    paginas?: number;
    id?: string;
    propuesto?: string;
    params?: ParamsMedida;
    nombre?: string;
    plan?: PlanMotor;
    cambio?: string;
  };
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

  // ── DESHACER EL AJUSTE · REVERTIR UN CAMBIO ────────────────────────────────
  // La instantánea vive EN EL SERVIDOR (override de basics, clave `ajustePrevio`):
  // el cliente no manda qué reponer, así que no puede colar un texto sin candado.
  if (body.accion === "deshacer" || body.accion === "revertir") {
    const accion = body.accion;
    try {
      const detalle = await getVariant(sb, user.id, variantId);
      if (!detalle) return fallo("Variante no encontrada.", 404);
      const ok =
        accion === "deshacer"
          ? await deshacerAjuste(sb, user.id, variantId, detalle.items)
          : await revertirCambio(sb, user.id, variantId, detalle.items, String(body.cambio ?? ""));
      if (!ok) return fallo(accion === "deshacer" ? "No hay ningún ajuste que deshacer." : "Ese cambio ya no se puede revertir.", 409);
      const reglas = await leerReglasVariante(sb, user.id, variantId);
      const { actual } = await medirVariante(sb, user.id, variantId, objetivoSegunReglas(paginasPedidas, reglas));
      return NextResponse.json({
        ok: true,
        items: (await getVariant(sb, user.id, variantId))?.items ?? [],
        real: { paginas: actual.medida.porPagina.length, cuerpo: actual.bodySize, cabe: !actual.noCabe },
      });
    } catch (e) {
      console.error("[api/ajustar] no se pudo " + accion, variantId, e);
      return fallo(motivo(e), 500);
    }
  }

  // ── APLICAR LA OPCIÓN ELEGIDA («Elegir cómo ajustar») ──────────────────────
  // El plan viaja por el cliente: aplicarOpcion lo REVALIDA entero (plantilla
  // del usuario, nada de «incluir siempre», candado «condensar» contra la base).
  if (body.accion === "aplicar") {
    if (!body.plan || typeof body.plan !== "object" || !body.plan.disposicion) return fallo("Falta el plan.", 400);
    try {
      const resultado = await aplicarOpcion(sb, user.id, variantId, body.plan, paginasPedidas);
      return NextResponse.json({ resultado, aplicado: true, items: (await getVariant(sb, user.id, variantId))?.items ?? [] });
    } catch (e) {
      console.error("[api/ajustar] no se pudo aplicar la opción", variantId, e);
      return fallo(motivo(e), 500);
    }
  }

  // ── AJUSTAR DE UN CLIC (DA-A6) · ELEGIR · OPCIONES ─────────────────────────
  // «ajustar» corre el MOTOR DE PÁGINAS (disposición → reescritura → selección,
  // medido en el PDF real), APLICA el plan de forma atómica con instantánea y
  // vuelve a medir el PDF real. «elegir» mide las cuatro salidas (A-D) sin aplicar
  // ninguna. «opciones» solo mide plantillas donde cabe tal cual. Las tres en
  // NDJSON: una línea por paso real ({tipo:'progreso'}) y al final
  // {tipo:'resultado'} o {tipo:'error'}.
  if (body.accion === "ajustar" || body.accion === "elegir" || body.accion === "opciones") {
    const accion = body.accion;
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        const enviar = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        const onProgreso = (p: ProgresoAjuste) => enviar({ tipo: "progreso", ...p });
        try {
          enviar({ tipo: "progreso", paso: 0 });
          if (accion === "ajustar") {
            const resultado = await ajustarVariante(sb, user.id, variantId, { paginas: paginasPedidas, onProgreso });
            if (!resultado) throw new Error("Variante no encontrada.");
            console.log("[api/ajustar] motor de páginas", {
              variantId,
              resueltoPor: resultado.resueltoPor,
              palancas: resultado.palancas,
              reescritos: resultado.plan.reescribir.length,
              fuera: resultado.plan.ocultar.length,
              real: resultado.real,
              renders: resultado.medicion.renders,
              ms: resultado.medicion.ms,
              choque: resultado.razon,
            });
            enviar({
              tipo: "resultado",
              resultado,
              aplicado: resultado.aplicado,
              items: resultado.aplicado ? ((await getVariant(sb, user.id, variantId))?.items ?? []) : undefined,
            });
            return;
          }
          if (accion === "elegir") {
            const o = await opcionesDeAjuste(sb, user.id, variantId, paginasPedidas, onProgreso);
            enviar({ tipo: "resultado", elegir: o, items: o.deshecho ? ((await getVariant(sb, user.id, variantId))?.items ?? []) : undefined });
            return;
          }
          const prep = await prepararMotor(sb, user.id, variantId, paginasPedidas);
          if (!prep) throw new Error("Variante no encontrada.");
          const resultado = await resolverAjuste({
            data: prep.resume,
            objetivo: prep.objetivo,
            actual: prep.actual,
            propias: prep.propias,
            sinFoto: prep.reglas.sinFoto && prep.reglas.fuerza.sinFoto === "obligatoria",
            soloPlantillas: true,
            maxAlternativas: 6,
            onProgreso,
          });
          enviar({ tipo: "resultado", resultado });
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
    const prep = await prepararMotor(sb, user.id, variantId, paginasPedidas);
    if (!prep) return fallo("Variante no encontrada.", 404);
    const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
    const byok3 = (await getUserLlmKey3(sb, user.id)) ?? undefined;
    const conIA = hayClaveIA(byok, byok3);
    const entrada = {
      targetTitle: prep.targetTitle,
      items: prep.items,
      paginas: prep.actual.medida.porPagina.length,
      paginasObjetivo: prep.objetivo,
      sobran: prep.actual.sobran,
    };
    const sinPlan =
      (notas: string): AjusteLLM =>
      async () => ({ quitar: [], orden: [], acortar: [], notas });
    let propuesta: Awaited<ReturnType<typeof construirAjuste>>;
    if (conIA && prep.actual.noCabe) {
      try {
        propuesta = await construirAjuste(entrada, { llm: geminiAjusteLLM(byok, byok3, await contextoMemoria(sb, user.id, "ajustar")) });
      } catch (e) {
        console.error("[api/ajustar] el modelo no respondió; sin recortes", variantId, e);
        propuesta = await construirAjuste(entrada, { llm: sinPlan(`La IA no respondió (${motivo(e)}): no hay recortes propuestos.`) });
      }
    } else {
      propuesta = await construirAjuste(entrada, { llm: sinPlan(conIA ? "" : "Sin clave de IA: no hay recortes propuestos.") });
    }
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
