import { NextResponse } from "next/server";
import { puertaPaginas } from "@/lib/cv/ajuste-variante";
import { generateObject } from "ai";
import { hayClaveIA, modeloPara } from "@/lib/ai/modelos";
import { createClient } from "@/lib/supabase/server";
import { listVariants, countMasterItems, getMasterItems, type MasterItem } from "@/lib/db/queries";
import { createVariant, updateVariant, addItem, setAiOverride, guardarReglas, guardarPaginasObjetivo } from "@/lib/db/variants";
import { esObligatorio, reglasParaPrompt, terminoExcluidoEn, validarReglas, REGLAS_VACIAS, type Reglas } from "@/lib/cv/reglas";
import { guardarAvisoDeVariante } from "@/lib/db/aviso";
import { preservesFacts } from "@/lib/verify";
import { geminiApiKey } from "@/lib/extract/llm";
import { getUserLlmKey, getUserLlmKey3 } from "@/lib/account/byok";
import { contextoMemoria, mensajesConMemoria, type ContextoMemoria } from "@/lib/ai/memoria";
import {
  buildAiVariant,
  VariantPlanSchema,
  type VariantLLM,
  type AiMasterItem,
} from "@/lib/extract/variant-ai";

export const runtime = "nodejs";
// El I/O del LLM no cuenta como Active CPU en Fluid Compute (02 §1).
export const maxDuration = 300;


/**
 * Lista las variantes del usuario autenticado (RLS por auth.uid()).
 *   GET /api/variants → { variants, masterItems }
 * masterItems alimenta el copy del estado vacío ("Tu master tiene N items").
 * Una cuenta nueva devuelve variants: [] — nunca las 7 de la demo.
 */
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  try {
    const [variants, masterItems] = await Promise.all([
      listVariants(sb, user.id),
      countMasterItems(sb, user.id),
    ]);
    return NextResponse.json({ variants, masterItems });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/** Texto legible de un item del master (para el prompt y para validar el summary). */
function masterItemText(m: MasterItem): string {
  const d = m.data ?? {};
  const parts = Object.values(d)
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
  return `${m.kind}: ${parts.join(" · ")}`.trim();
}

/** El LLM real (Gemini) como función inyectable de buildAiVariant. La clave es la
 *  BYOK del usuario (ya descifrada) o, si no, la del servidor. */
function geminiVariantLLM(apiKey?: string, apiKey3?: string, mem?: ContextoMemoria, reglas: Reglas = REGLAS_VACIAS): VariantLLM {
  const key = apiKey || geminiApiKey();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  // Armar la variante es redacción/selección que no puede inventar: pasa por el
  // registro (redaccion-preserva-hechos), no por un alias flotante propio. apiKey3 =
  // clave de Anthropic: con ella redacta Claude; sin ella, el fallback Gemini.
  const model = modeloPara("redaccion-preserva-hechos", key, undefined, undefined, apiKey3);
  const SYS =
    "Eres un asistente que arma una VARIANTE de CV a partir de un MASTER canónico. " +
    "Te doy los items del master (cada uno con su id, tipo y texto) y un rol/descripción objetivo. " +
    "Tu tarea: (1) SELECCIONA los ids relevantes para el rol usando SOLO ids de la lista dada — no inventes ids; " +
    "(2) ORDÉNALOS por relevancia; (3) incluye SIEMPRE el item de tipo 'basics' y el de 'summary' si existen; " +
    "(4) pon un target_title acorde; (5) redacta un summary de 2-3 frases A PARTIR de los hechos del master, " +
    "sin inventar cifras, tecnologías, empresas ni logros. Si el master es flaco para el rol, dilo en notes.";
  return async ({ items, prompt }) => {
    // Con memoria (DA-M2), los items del master ya viajan en ella —cacheados— con
    // sus mismos ids: no se repiten aquí. Sin memoria, la lista de siempre.
    const list = mem?.memoria
      ? "(los de la MEMORIA DEL PERFIL, cada uno con su [id])"
      : items.map((it) => `- [${it.id}] ${it.text}`).join("\n");
    const r = await generateObject({
      model,
      schema: VariantPlanSchema,
      ...mensajesConMemoria({
        memoria: mem?.memoria,
        modelo: model,
        sistema: SYS,
        usuario: `ROL/DESCRIPCIÓN OBJETIVO:\n${prompt}\n\nITEMS DEL MASTER:\n${list}` + (reglasParaPrompt(reglas) ? `\n\n${reglasParaPrompt(reglas)}` : ""),
      }),
      temperature: 0.2,
    });
    await mem?.alUsar(r);
    return r.object;
  };
}

/**
 * Crea una variante.
 *   { mode:'manual', name? }            → variante VACÍA. → { variant }
 *   { mode:'ai', prompt, name? }        → variante armada desde el master con IA.
 *                                         → { variant, notes }
 *   { mode:'tailor', includeIds, targetTitle?, summary?, name?, aviso? }
 *                                       → variante YA ADAPTADA a un aviso, a partir de
 *                                         una SELECCIÓN que el usuario acaba de revisar
 *                                         (la propone /api/tailor/analizar). → { variant, notes }
 * La IA NUNCA inventa: ids se filtran a los del master; el summary pasa por
 * preservesFacts (variant-ai.ts / verify.ts) antes de convertirse en override.
 */
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: {
    mode?: "manual" | "ai" | "tailor";
    name?: string;
    prompt?: string;
    includeIds?: string[];
    targetTitle?: string;
    summary?: string;
    notes?: string;
    aviso?: string;
    /** las REGLAS de la variante (DA-R1), de cualquiera de las tres puertas. */
    reglas?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const mode = body.mode ?? "manual";

  try {
    // ── REGLAS (DA-R1): se validan contra el master REAL antes de crear nada. ──
    const conReglas = body.reglas != null;
    const masterParaReglas = conReglas ? await getMasterItems(sb, user.id) : [];
    const vr = validarReglas(body.reglas, { masterIds: new Set(masterParaReglas.map((m) => m.id)) });
    if (!vr.ok) return NextResponse.json({ error: vr.errores.join(" ") }, { status: 400 });
    const reglas = vr.reglas;
    /** Guarda las reglas en la variante recién creada (persistido:false si falta la 0012). */
    const fijarReglas = async (variantId: string) => {
      if (!conReglas) return true;
      // «Máximo N páginas» fija también el objetivo de páginas con el que nace.
      if (reglas.paginasMax) await guardarPaginasObjetivo(sb, user.id, variantId, reglas.paginasMax);
      return (await guardarReglas(sb, user.id, variantId, reglas)).persistido;
    };
    /** ¿Este item del master puede entrar? Un término excluido lo deja fuera, salvo que sea obligatorio. */
    const admitido = (m: MasterItem) => esObligatorio(reglas, m.id) || !terminoExcluidoEn(masterItemText(m), reglas);
    /** Los ids, filtrados por las reglas y con los obligatorios que falten al final. */
    const segunReglas = (ids: string[], master: MasterItem[]) => {
      const porId = new Map(master.map((m) => [m.id, m]));
      const out = ids.filter((id) => porId.has(id) && admitido(porId.get(id)!));
      for (const id of reglas.incluirSiempre) if (porId.has(id) && !out.includes(id)) out.push(id);
      return out;
    };
    /** Un summary de IA que nombra un término excluido no se aplica. */
    const summaryAdmitido = (s: string) => !terminoExcluidoEn(s, reglas);

    if (mode === "manual") {
      const variant = await createVariant(sb, user.id, body.name);
      const reglasPersistidas = await fijarReglas(variant.id);
      // «Incluir siempre» en una variante vacía: los obligatorios entran desde el principio.
      for (const id of segunReglas([], masterParaReglas)) await addItem(sb, user.id, variant.id, id);
      return NextResponse.json({ variant, reglasPersistidas });
    }

    // mode === "tailor": crear una variante desde una SELECCIÓN ya revisada por el
    // usuario (la tercera puerta de Variantes / el análisis de un aviso). No hay LLM
    // aquí: la sastrería ya la hizo /api/tailor/analizar; esto solo MATERIALIZA lo que
    // el usuario aprobó. Como todo lo demás, no se confía en el cliente: los ids se
    // validan contra el master real y el summary vuelve a pasar preservesFacts.
    if (mode === "tailor") {
      const pedidos = Array.isArray(body.includeIds) ? body.includeIds.filter((x): x is string => typeof x === "string") : [];
      if (pedidos.length === 0) {
        return NextResponse.json({ error: "Selecciona al menos un item para la variante." }, { status: 400 });
      }
      const master = await getMasterItems(sb, user.id);
      if (master.length === 0) {
        return NextResponse.json({ error: "Tu master está vacío: importa o agrega items antes de crear una variante." }, { status: 422 });
      }
      const valido = new Set(master.map((m) => m.id));
      const vistos = new Set<string>();
      const unicosPedidos: string[] = [];
      for (const id of pedidos) {
        if (valido.has(id) && !vistos.has(id)) {
          vistos.add(id);
          unicosPedidos.push(id);
        }
      }
      const ordenados = segunReglas(unicosPedidos, master);
      if (ordenados.length === 0) {
        return NextResponse.json({ error: "Ninguno de los items seleccionados existe en tu master." }, { status: 422 });
      }

      const targetTitle = (body.targetTitle ?? "").trim();
      const variant = await createVariant(sb, user.id, (body.name ?? "").trim() || targetTitle);
      const reglasPersistidas = await fijarReglas(variant.id);

      const variantItemByMaster = new Map<string, string>();
      for (const id of ordenados) {
        const row = await addItem(sb, user.id, variant.id, id);
        variantItemByMaster.set(row.item_id as string, row.id as string);
      }
      if (targetTitle) {
        await updateVariant(sb, user.id, variant.id, { target_title: targetTitle });
      }
      // El aviso queda con la variante para que «Afinar con IA» lo use (DA-AV3).
      if (typeof body.aviso === "string") await guardarAvisoDeVariante(sb, user.id, variant.id, body.aviso, targetTitle);

      // El summary reformulado para el aviso vuelve a validarse aquí: llegó del cliente,
      // y un cliente es cualquiera. Si introduce una cifra o entidad ausente, se ignora.
      const summary = (body.summary ?? "").trim();
      if (summary) {
        const masterBody = master.map(masterItemText).join(" \n ");
        if (preservesFacts(masterBody, summary).ok && summaryAdmitido(summary)) {
          const summaryMaster = master.find((m) => m.kind === "summary");
          const summaryVariantItem = summaryMaster ? variantItemByMaster.get(summaryMaster.id) : undefined;
          if (summaryMaster && summaryVariantItem) {
            await setAiOverride(sb, user.id, summaryVariantItem, {
              data: { text: summary },
              sourceItem: summaryMaster.id,
              reason: "Resumen redactado por IA para un aviso; hechos del master preservados.",
            });
          }
        }
      }

      // La puerta de páginas (DA-A6): con «Máximo N» obligatoria, el motor corre ANTES de responder.
      const ajuste = await puertaPaginas(sb, user.id, variant.id);
      return NextResponse.json({
        variant: { ...variant, target_title: targetTitle || variant.target_title },
        notes: (body.notes ?? "").trim() || null,
        reglasPersistidas,
        ajuste,
      });
    }

    // mode === "ai"
    const prompt = (body.prompt ?? "").trim();
    if (prompt.length < 2) {
      return NextResponse.json({ error: "Describe el rol o el CV que quieres (p.ej. 'Backend Engineer')." }, { status: 400 });
    }
    // BYOK: la clave del usuario (descifrada, solo servidor) o la del servidor.
    const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
    const byok3 = (await getUserLlmKey3(sb, user.id)) ?? undefined;
    if (!hayClaveIA(byok, byok3)) {
      return NextResponse.json({ error: "Falta configurar una clave de IA (BYOK, ANTHROPIC_API_KEY o GEMINI_API_KEY del servidor)." }, { status: 503 });
    }

    const master = await getMasterItems(sb, user.id);
    if (master.length === 0) {
      return NextResponse.json({ error: "Tu master está vacío: importa o agrega items antes de armar una variante con IA." }, { status: 422 });
    }

    const aiItems: AiMasterItem[] = master.map((m) => ({ id: m.id, kind: m.kind, text: masterItemText(m) }));
    const plan = await buildAiVariant({ master: aiItems, prompt }, { llm: geminiVariantLLM(byok, byok3, await contextoMemoria(sb, user.id, "variantes"), reglas) });

    const variant = await createVariant(sb, user.id, body.name ?? plan.targetTitle);
    const reglasPersistidas = await fijarReglas(variant.id);

    // Añade los items validados EN ORDEN; recuerda el variant_item de cada master item.
    const variantItemByMaster = new Map<string, string>();
    // La salida de la IA se revisa contra las reglas antes de aplicarse.
    for (const id of segunReglas(plan.includeIds, master)) {
      const row = await addItem(sb, user.id, variant.id, id);
      variantItemByMaster.set(row.item_id as string, row.id as string);
    }

    if (plan.targetTitle) {
      await updateVariant(sb, user.id, variant.id, { target_title: plan.targetTitle });
    }

    // Si el summary de la IA validó, va como override del variant_item del summary.
    if (plan.summary && summaryAdmitido(plan.summary)) {
      const summaryMaster = master.find((m) => m.kind === "summary");
      const summaryVariantItem = summaryMaster ? variantItemByMaster.get(summaryMaster.id) : undefined;
      if (summaryMaster && summaryVariantItem) {
        await setAiOverride(sb, user.id, summaryVariantItem, {
          data: { text: plan.summary },
          sourceItem: summaryMaster.id,
        });
      }
    }

    // La puerta de páginas (DA-A6): con «Máximo N» obligatoria, el motor corre ANTES de responder.
    const ajuste = await puertaPaginas(sb, user.id, variant.id);
    return NextResponse.json({
      variant: { ...variant, target_title: plan.targetTitle || variant.target_title },
      notes: plan.notes,
      reglasPersistidas,
      ajuste,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
