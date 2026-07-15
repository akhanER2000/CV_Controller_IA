import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@/lib/supabase/server";
import { listVariants, countMasterItems, getMasterItems, type MasterItem } from "@/lib/db/queries";
import { createVariant, updateVariant, addItem, setAiOverride } from "@/lib/db/variants";
import { geminiApiKey } from "@/lib/extract/llm";
import {
  buildAiVariant,
  VariantPlanSchema,
  type VariantLLM,
  type AiMasterItem,
} from "@/lib/extract/variant-ai";

export const runtime = "nodejs";
// El I/O del LLM no cuenta como Active CPU en Fluid Compute (02 §1).
export const maxDuration = 300;

const AI_MODEL = "gemini-flash-latest";

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

/** El LLM real (Gemini) como función inyectable de buildAiVariant. */
function geminiVariantLLM(): VariantLLM {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY");
  const model = createGoogleGenerativeAI({ apiKey })(AI_MODEL);
  const SYS =
    "Eres un asistente que arma una VARIANTE de CV a partir de un MASTER canónico. " +
    "Te doy los items del master (cada uno con su id, tipo y texto) y un rol/descripción objetivo. " +
    "Tu tarea: (1) SELECCIONA los ids relevantes para el rol usando SOLO ids de la lista dada — no inventes ids; " +
    "(2) ORDÉNALOS por relevancia; (3) incluye SIEMPRE el item de tipo 'basics' y el de 'summary' si existen; " +
    "(4) pon un target_title acorde; (5) redacta un summary de 2-3 frases A PARTIR de los hechos del master, " +
    "sin inventar cifras, tecnologías, empresas ni logros. Si el master es flaco para el rol, dilo en notes.";
  return async ({ items, prompt }) => {
    const list = items.map((it) => `- [${it.id}] ${it.text}`).join("\n");
    const { object } = await generateObject({
      model,
      schema: VariantPlanSchema,
      prompt: `${SYS}\n\nROL/DESCRIPCIÓN OBJETIVO:\n${prompt}\n\nITEMS DEL MASTER:\n${list}`,
      temperature: 0.2,
    });
    return object;
  };
}

/**
 * Crea una variante.
 *   { mode:'manual', name? }            → variante VACÍA. → { variant }
 *   { mode:'ai', prompt, name? }        → variante armada desde el master con IA.
 *                                         → { variant, notes }
 * La IA NUNCA inventa: ids se filtran a los del master; el summary pasa por
 * preservesFacts (variant-ai.ts) antes de convertirse en override.
 */
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { mode?: "manual" | "ai"; name?: string; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const mode = body.mode ?? "manual";

  try {
    if (mode === "manual") {
      const variant = await createVariant(sb, user.id, body.name);
      return NextResponse.json({ variant });
    }

    // mode === "ai"
    const prompt = (body.prompt ?? "").trim();
    if (prompt.length < 2) {
      return NextResponse.json({ error: "Describe el rol o el CV que quieres (p.ej. 'Backend Engineer')." }, { status: 400 });
    }
    if (!geminiApiKey()) {
      return NextResponse.json({ error: "Falta configurar GEMINI_API_KEY en el servidor." }, { status: 503 });
    }

    const master = await getMasterItems(sb, user.id);
    if (master.length === 0) {
      return NextResponse.json({ error: "Tu master está vacío: importa o agrega items antes de armar una variante con IA." }, { status: 422 });
    }

    const aiItems: AiMasterItem[] = master.map((m) => ({ id: m.id, kind: m.kind, text: masterItemText(m) }));
    const plan = await buildAiVariant({ master: aiItems, prompt }, { llm: geminiVariantLLM() });

    const variant = await createVariant(sb, user.id, body.name ?? plan.targetTitle);

    // Añade los items validados EN ORDEN; recuerda el variant_item de cada master item.
    const variantItemByMaster = new Map<string, string>();
    for (const id of plan.includeIds) {
      const row = await addItem(sb, user.id, variant.id, id);
      variantItemByMaster.set(row.item_id as string, row.id as string);
    }

    if (plan.targetTitle) {
      await updateVariant(sb, user.id, variant.id, { target_title: plan.targetTitle });
    }

    // Si el summary de la IA validó, va como override del variant_item del summary.
    if (plan.summary) {
      const summaryMaster = master.find((m) => m.kind === "summary");
      const summaryVariantItem = summaryMaster ? variantItemByMaster.get(summaryMaster.id) : undefined;
      if (summaryMaster && summaryVariantItem) {
        await setAiOverride(sb, user.id, summaryVariantItem, {
          data: { text: plan.summary },
          sourceItem: summaryMaster.id,
        });
      }
    }

    return NextResponse.json({
      variant: { ...variant, target_title: plan.targetTitle || variant.target_title },
      notes: plan.notes,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
