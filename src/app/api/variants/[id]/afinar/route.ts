import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { hayClaveIA, modeloPara } from "@/lib/ai/modelos";
import { createClient } from "@/lib/supabase/server";
import { addItem, getVariant, setAiOverride, updateItem, removeItem } from "@/lib/db/variants";
import { getMasterItems, type MasterItem } from "@/lib/db/queries";
import { geminiApiKey } from "@/lib/extract/llm";
import { getUserLlmKey, getUserLlmKey3 } from "@/lib/account/byok";
import { contextoMemoria, mensajesConMemoria, usoDe, type ContextoMemoria, type UsoLlamada } from "@/lib/ai/memoria";
import { itemDeAjuste } from "@/lib/cv/ajuste";
import {
  AfinarPlanSchema,
  alcanceDe,
  construirAfinado,
  enAlcance,
  incluyeAptitudes,
  itemDeAfinar,
  lineasDelPromptAfinar,
  planRevertir,
  resolverSinRespaldo,
  verificarAfinado,
  type AfinarItem,
  type AfinarLLM,
  type AplicadoAfinar,
  type DescartadoAfinar,
  type MaestroRef,
} from "@/lib/cv/afinar";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * «AFINAR CON IA» — la ruta. Tres acciones:
 *
 *   POST { alcance: 'todo'|'summary'|'work'|'projects'|'skills'|{itemId}, aviso? }
 *        → la IA reescribe (con la memoria cacheada), el candado corre OTRA VEZ
 *          aquí y lo que pasa se APLICA de un clic como override ai_rephrased.
 *          Las aptitudes «sin respaldo» se resuelven sin IA (mostrar / ocultar).
 *   POST { accion:'aplicar', propuestas:[{id, propuesto}] }
 *        → vuelve a poner un afinado (selector «Texto: afinado»), re-verificado.
 *   POST { accion:'revertir', aplicados }  → deshace lo aplicado: el texto vuelve
 *        al master, lo mostrado se oculta, lo añadido se quita.
 *
 * Todas devuelven `items` (la variante tal y como quedó) para que el editor pinte
 * lo guardado y no lo que cree que se guardó; el preview vuelve a pasar el autofit.
 */

const fallo = (msg: string, status: number) => NextResponse.json({ error: msg }, { status });
const motivo = (e: unknown) => (e instanceof Error ? e.message : "Error");
const MAX_AVISO = 8000;

const SYS =
  "Eres un editor de CV. Te doy items de una variante (id, tipo, el texto del master y, si la hay, su " +
  "EVIDENCIA VERIFICADA del documento original), el ROL OBJETIVO y, a veces, el AVISO de trabajo. " +
  "Reescribe cada item para que sea MÁS DIRECTO hacia ese rol: verbo de acción delante, el resultado " +
  "visible, sin relleno («fui responsable de», «me encargué de»).\n" +
  "★ REGLAS QUE NO SE NEGOCIAN:\n" +
  "1. Solo hechos del propio item y de su evidencia. Ni una cifra, sigla, empresa o tecnología que no " +
  "esté ahí. El rol objetivo y el aviso ORIENTAN el énfasis; NO autorizan hechos: si el aviso pide " +
  "Kafka y el item no lo tiene, Kafka no aparece.\n" +
  "2. Conserva TODAS las cifras (con su unidad) y TODOS los nombres propios y tecnologías del original.\n" +
  "3. Mismo idioma que el original. Extensión parecida o menor.\n" +
  "4. Si un item ya es directo o no se puede mejorar sin romper las reglas, NO lo incluyas.\n" +
  "No inventes ids.";

function afinarLLM(
  apiKey: string | undefined,
  apiKey3: string | undefined,
  mem: ContextoMemoria,
  registrarUso: (u: UsoLlamada) => void,
): AfinarLLM {
  const key = apiKey || geminiApiKey();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  const model = modeloPara("redaccion-preserva-hechos", key, undefined, undefined, apiKey3);
  return async ({ items, targetTitle, aviso }) => {
    // Memoria primero y cacheada (DA-M2); lo variable (rol, aviso, items) después.
    const r = await generateObject({
      model,
      schema: AfinarPlanSchema,
      ...mensajesConMemoria({
        memoria: mem.memoria,
        modelo: model,
        sistema: SYS,
        usuario:
          `ROL OBJETIVO: ${targetTitle || "(sin especificar)"}\n` +
          (aviso ? `AVISO (solo orienta, no autoriza hechos):\n${aviso}\n\n` : "\n") +
          `ITEMS A AFINAR:\n${lineasDelPromptAfinar(items)}`,
      }),
      temperature: 0.3,
    });
    registrarUso(usoDe("afinar", r));
    await mem.alUsar(r);
    return r.object;
  };
}

const aRef = (m: MasterItem): MaestroRef => ({
  id: m.id,
  kind: m.kind,
  parentId: m.parentId,
  data: m.data,
  sortOrder: m.sortOrder,
  evidenceSnippet: m.evidenceSnippet,
  evidenceVerified: m.evidenceVerified,
});

const REASON_TEXTO = "Afinado por IA hacia el rol; cifras y entidades del master y su evidencia preservadas (afinar.ts).";
const REASON_APTITUD = "Afinar: aptitud sin respaldo oculta en esta variante (determinista, sin IA).";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: variantId } = await params;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fallo("Sesión requerida.", 401);

  let body: {
    accion?: string;
    alcance?: unknown;
    aviso?: string;
    propuestas?: { id?: string; propuesto?: string }[];
    aplicados?: AplicadoAfinar[];
  };
  try {
    body = await req.json();
  } catch {
    return fallo("cuerpo inválido", 400);
  }

  try {
    const detalle = await getVariant(sb, user.id, variantId);
    if (!detalle) return fallo("Variante no encontrada.", 404);
    const master = (await getMasterItems(sb, user.id)).map(aRef);
    const masterById = new Map(master.map((m) => [m.id, m]));
    const porId = new Map(detalle.items.map((v) => [v.id, v]));
    const items: AfinarItem[] = detalle.items.map((v) => itemDeAfinar(itemDeAjuste(v), masterById.get(v.item_id)));
    const itemsPorId = new Map(items.map((i) => [i.id, i]));
    const frescos = async () => (await getVariant(sb, user.id, variantId))?.items ?? [];

    /** Escribe UN afinado de texto, con el candado corriendo aquí, donde se escribe. */
    const escribirTexto = async (
      id: string,
      propuesto: string,
      motivoTxt: string,
      aplicados: AplicadoAfinar[],
      descartados: DescartadoAfinar[],
    ) => {
      const it = itemsPorId.get(id);
      const v = porId.get(id);
      if (!it || !v || !it.campo) {
        descartados.push({ id, propuesto, razon: "ese item no está en esta variante o no tiene texto" });
        return;
      }
      if (it.origen === "manual") {
        descartados.push({ id, propuesto, razon: "editado a mano en esta variante: no se pisa" });
        return;
      }
      const ver = verificarAfinado(it.maestro, it.evidencia, propuesto);
      if (!ver.ok) {
        console.warn("[api/afinar] afinado RECHAZADO por el candado", { variantId, item: id, razon: ver.razon });
        descartados.push({ id, propuesto, razon: ver.razon, nuevas: ver.nuevas, perdidas: ver.perdidas });
        return;
      }
      const antes = v.override_data ?? null;
      await setAiOverride(sb, user.id, id, {
        data: { ...(antes ?? {}), [it.campo]: propuesto.trim() },
        sourceItem: it.itemId,
        reason: REASON_TEXTO,
      });
      aplicados.push({
        tipo: "texto",
        id,
        itemId: it.itemId,
        kind: it.kind,
        campo: it.campo,
        original: it.maestro,
        propuesto: propuesto.trim(),
        motivo: motivoTxt,
        antes,
      });
    };

    // ── REVERTIR ─────────────────────────────────────────────────────────────
    if (body.accion === "revertir") {
      const ops = planRevertir(Array.isArray(body.aplicados) ? body.aplicados : []);
      let revertidos = 0;
      for (const op of ops) {
        if (!porId.has(op.id)) continue; // solo items de ESTA variante
        if (op.op === "override") await updateItem(sb, user.id, op.id, { override_data: op.override_data });
        else if (op.op === "visible") await updateItem(sb, user.id, op.id, { visible: op.visible });
        else await removeItem(sb, user.id, op.id);
        revertidos += 1;
      }
      return NextResponse.json({ revertidos, items: await frescos() });
    }

    // ── APLICAR (volver al afinado desde el selector) ────────────────────────
    if (body.accion === "aplicar") {
      const aplicados: AplicadoAfinar[] = [];
      const descartados: DescartadoAfinar[] = [];
      for (const p of Array.isArray(body.propuestas) ? body.propuestas : []) {
        await escribirTexto(String(p?.id ?? ""), String(p?.propuesto ?? ""), "", aplicados, descartados);
      }
      return NextResponse.json({ aplicado: aplicados, descartado: descartados, items: await frescos() });
    }

    // ── AFINAR ───────────────────────────────────────────────────────────────
    const alcance = alcanceDe(body.alcance);
    if (!alcance) return fallo("Alcance inválido.", 400);
    const aviso = String(body.aviso ?? "").trim().slice(0, MAX_AVISO);
    const targetTitle = detalle.variant.target_title ?? "";

    const aplicados: AplicadoAfinar[] = [];
    const descartados: DescartadoAfinar[] = [];
    let notas = "";
    const uso: { v: UsoLlamada | null } = { v: null };

    // 1 · Texto, con IA. Solo si hay algo reescribible en el alcance.
    const hayTexto = alcance !== "skills" && items.some((i) => enAlcance(i, alcance));
    if (hayTexto) {
      const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
      const byok3 = (await getUserLlmKey3(sb, user.id)) ?? undefined;
      if (!hayClaveIA(byok, byok3)) {
        return fallo("Falta configurar una clave de IA (BYOK, ANTHROPIC_API_KEY o GEMINI_API_KEY del servidor).", 503);
      }
      const mem = await contextoMemoria(sb, user.id, "afinar");
      const r = await construirAfinado(
        { items, alcance, targetTitle, aviso },
        { llm: afinarLLM(byok, byok3, mem, (u) => (uso.v = u)) },
      );
      notas = r.notas;
      descartados.push(...r.descartados);
      // ★ El candado vuelve a correr en escribirTexto: lo que pasó en el motor se
      //   re-verifica contra lo que hay en la base en el momento de escribir.
      for (const p of r.propuestas) await escribirTexto(p.id, p.propuesto, p.motivo, aplicados, descartados);
    }

    // 2 · «Sin respaldo», sin IA. Nunca escribe una viñeta: muestra, añade o quita.
    if (incluyeAptitudes(alcance)) {
      for (const a of resolverSinRespaldo(items, master)) {
        if (a.tipo === "mostrar") {
          await updateItem(sb, user.id, a.id, { visible: true });
          aplicados.push(a);
        } else if (a.tipo === "anadir") {
          const nuevo = await addItem(sb, user.id, variantId, a.itemId);
          aplicados.push({ ...a, id: String(nuevo.id) });
        } else if (a.tipo === "ocultar-grupo") {
          await updateItem(sb, user.id, a.id, { visible: false });
          aplicados.push({ ...a, kind: "skill" });
        } else {
          const antes = porId.get(a.id)?.override_data ?? null;
          await setAiOverride(sb, user.id, a.id, {
            data: { ...(antes ?? {}), items: a.propuesto },
            sourceItem: a.itemId,
            reason: REASON_APTITUD,
          });
          aplicados.push({ ...a, kind: "skill", antes });
        }
      }
    }

    return NextResponse.json({ aplicado: aplicados, descartado: descartados, notas, uso: uso.v, items: await frescos() });
  } catch (e) {
    console.error("[api/afinar] no se pudo afinar", variantId, e);
    return fallo(motivo(e), 500);
  }
}
