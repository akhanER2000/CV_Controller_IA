import { z } from "zod";
// Import RELATIVO a propósito: este módulo lo carga Vitest directamente (sin el
// alias "@/" de Next). Nada de "server-only" aquí → la función es pura y testeable.
import { preservesFacts } from "../verify";

/**
 * Constructor de VARIANTE con IA — el "atajo" que arma un CV para un rol a partir
 * del master, INYECTABLE para poder probarlo sin LLM en vivo.
 *
 * La promesa entera del producto es "la IA nunca inventa". Por eso la salida del
 * LLM NUNCA se confía tal cual:
 *   · include → se filtra a ids que EXISTEN de verdad en el master (nada de ids
 *     inventados), preservando el orden que propuso el modelo y sin duplicados.
 *   · summary → pasa por preservesFacts (verify.ts) contra el texto del master;
 *     si introduce una cifra o entidad ausente, se DESCARTA (queda null) y el
 *     llamador se queda con el summary del master, sin override.
 *
 * El LLM real (Gemini) se construye en la Route Handler y se pasa como `llm`.
 */

/** Un item del master, reducido a lo que la IA necesita ver: id, tipo y texto. */
export interface AiMasterItem {
  id: string;
  kind: string;
  /** texto legible del item (se muestra al LLM y se usa para validar el summary) */
  text: string;
}

/** Forma de salida que le pedimos al LLM (Zod v4). */
export const VariantPlanSchema = z.object({
  target_title: z
    .string()
    .describe("El job title objetivo de la variante, p.ej. 'Backend Engineer'. Sin comillas."),
  summary: z
    .string()
    .describe(
      "Resumen profesional de 2-3 frases, redactado SOLO a partir de hechos que aparecen en el master. " +
        "NO inventes cifras, tecnologías, empresas ni logros que no estén en los items dados.",
    ),
  include: z
    .array(z.string())
    .describe(
      "Los ids de los items del master a incluir en la variante, EN ORDEN de relevancia (lo más fuerte primero). " +
        "USA SOLO ids de la lista dada; no inventes ids.",
    ),
  notes: z
    .string()
    .describe(
      "Notas honestas para el usuario. Si el master es flaco para este rol (faltan experiencias o skills), dilo aquí.",
    ),
});
export type VariantPlan = z.infer<typeof VariantPlanSchema>;

/** La función inyectable que llama al modelo. */
export type VariantLLM = (input: { items: AiMasterItem[]; prompt: string }) => Promise<VariantPlan>;

/** Resultado ya VALIDADO en el servidor (no se confía en el LLM). */
export interface BuildAiVariantResult {
  targetTitle: string;
  /** summary validado (preserva hechos) o null si el LLM inventó → sin override */
  summary: string | null;
  /** ids validados: existen en el master, en el orden propuesto, sin duplicados */
  includeIds: string[];
  notes: string;
}

export async function buildAiVariant(
  { master, prompt }: { master: AiMasterItem[]; prompt: string },
  { llm }: { llm: VariantLLM },
): Promise<BuildAiVariantResult> {
  const plan = await llm({ items: master, prompt });

  // 1 · include → SOLO ids que existen de verdad en el master, en orden, sin duplicados.
  const validIds = new Set(master.map((m) => m.id));
  const seen = new Set<string>();
  const includeIds: string[] = [];
  for (const id of Array.isArray(plan.include) ? plan.include : []) {
    if (validIds.has(id) && !seen.has(id)) {
      seen.add(id);
      includeIds.push(id);
    }
  }

  // 2 · summary → debe PRESERVAR los hechos del master. Una cifra/entidad nueva = invención → se descarta.
  const masterText = master.map((m) => m.text).join(" \n ");
  const proposed = (plan.summary ?? "").trim();
  let summary: string | null = null;
  if (proposed) {
    const check = preservesFacts(masterText, proposed, "");
    if (check.ok) summary = proposed;
  }

  return {
    targetTitle: (plan.target_title ?? "").trim(),
    summary,
    includeIds,
    notes: (plan.notes ?? "").trim(),
  };
}
