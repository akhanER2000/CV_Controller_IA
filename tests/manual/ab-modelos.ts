import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { planificarExtraccion } from "@/lib/extract/llm";
import { BasicsSchema, WorkSchema, EducationSchema, SkillsSchema, ProjectsSchema } from "@/lib/extract/schema";
import { verifyEvidence } from "@/lib/verify";

/* ============================================================================
   HERRAMIENTA MANUAL — NO corre en CI: vive fuera del include de vitest (que solo
   coge los ficheros «.test.ts») a propósito, porque gasta tokens reales y necesita
   una clave con crédito.

   Para correrla:  npx vitest run tests/manual/ab-modelos.ts --reporter=verbose
   Requiere GEMINI_API_KEY y ANTHROPIC_API_KEY con crédito en .env.local (nunca se imprimen).
   Compara Claude (principal) con Gemini (secundario); AB_MODELOS="a,b" cambia la lista.

   Mide el CANARIO: la tasa de evidencia verificada. Un modelo débil no falla
   inventando, falla PARAFRASEANDO —resume «con sus palabras» y el includes() del
   servidor da false—. Por eso el % verificado ES la medida de si el modelo sirve
   para la extracción. Usa los prompts EXACTOS de producción
   (planificarExtraccion), cambiando SOLO el modelo, así que el número es el real.

   Cómo decidir con la tabla que imprime (línea base 19-jul: 119 items ≈ 85%):
     · ≈85% y ≈119 items  → la rebaja es dinero gratis, fíjala en modelos.ts.
     · % cae claro (<70%)  → está parafraseando: sube un escalón.
     · items << 119        → se salta contenido: sube un escalón.

   NOTA: al escribir esto, la clave de AKHAN devolvía 429 (créditos agotados), así
   que el A/B no se pudo ejecutar y la extracción se dejó en gemini-2.5-flash sin
   bajar a lite. Corre esto cuando haya crédito para confirmar la bajada.
   ============================================================================ */

const env = Object.fromEntries(
  readFileSync("J:/Code/CV_Controller_IA/.env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const KEY = (env.GEMINI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY)!;
// La clave de Anthropic del servidor. NUNCA se imprime: solo se pasa al SDK / cabecera.
const KEY_A = env.ANTHROPIC_API_KEY;
const DOSSIER = readFileSync("J:/Code/CV_Controller_IA/material-perfil/dossier/DOSSIER-MAESTRO-AKHAN.md", "utf8");

const SCHEMA = { basics: BasicsSchema, work: WorkSchema, education: EducationSchema, skills: SkillsSchema, projects: ProjectsSchema } as const;
// Claude (principal) contra el Gemini secundario. AB_MODELOS="a,b" para cambiar la lista.
const MODELOS = (process.env.AB_MODELOS ?? "claude-sonnet-5-5,gemini-3.6-flash").split(",").map((m) => m.trim()).filter(Boolean);
const modeloDe = (id: string) =>
  /^claude-/.test(id) ? createAnthropic({ apiKey: KEY_A! })(id) : createGoogleGenerativeAI({ apiKey: KEY })(id);

describe("Anthropic · qué modelos lista la clave y cuáles RESPONDEN", () => {
  it.skipIf(!KEY_A)("lista /v1/models y hace ping real a Sonnet y Haiku", async () => {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": KEY_A!, "anthropic-version": "2023-06-01" },
    });
    console.log(`\nGET /v1/models → HTTP ${r.status}`);
    const j = (await r.json()) as { data?: { id: string; created_at?: string }[] };
    const ids = (j.data ?? []).map((m) => m.id);
    console.log(ids.map((id) => `  · ${id}`).join("\n"));
    const candidatos = ids.filter((id) => /sonnet|haiku/.test(id) && !/latest/.test(id));
    for (const id of candidatos) {
      const t0 = Date.now();
      try {
        const { text } = await generateText({ model: createAnthropic({ apiKey: KEY_A! })(id), prompt: "Responde exactamente con la palabra: OK", maxRetries: 0 });
        console.log(`  ✔ ${id.padEnd(32)} ${Date.now() - t0} ms · ${text.trim().slice(0, 12)}`);
      } catch (e) {
        console.log(`  ✘ ${id.padEnd(32)} ${(e as Error).message.slice(0, 100)}`);
      }
    }
  }, 120000);

  it.skipIf(!KEY_A || !KEY)("ping de salud REAL a los dos proveedores (las funciones de producción)", async () => {
    const { pingProveedor, pingProveedorAnthropic } = await import("@/lib/ai/modelos");
    const a = await pingProveedorAnthropic(KEY_A!, true);
    const g = await pingProveedor(KEY, true);
    console.log(`\nping anthropic · ${a.modelo} · ok=${a.ok} · ${a.latenciaMs} ms · ${a.muestra || a.error}`);
    console.log(`ping gemini    · ${g.modelo} · ok=${g.ok} · ${g.latenciaMs} ms · ${g.muestra || g.error}`);
  }, 60000);
});

// Recoge (evidence) de cada item de una respuesta, según extractor.
function evidencias(extractor: string, obj: any): string[] {
  if (extractor === "basics") return [obj?.summaryEvidence ?? ""].filter(Boolean);
  return (obj?.items ?? []).map((it: any) => it.evidence ?? "").filter(Boolean);
}
function nItems(extractor: string, obj: any): number {
  if (extractor === "basics") return obj?.name ? 1 : 0;
  return (obj?.items ?? []).length;
}

describe("A/B de modelos sobre el dossier real", () => {
  it("mide items y % verificado por modelo", async () => {
    const plan = planificarExtraccion(DOSSIER);
    console.log(`\nplan: ${plan.llamadas.length} llamadas · extractores: ${plan.llamadas.map((l) => l.extractor).join(",")}`);

    const filas: string[] = [];
    for (const modelo of MODELOS) {
      if (/^claude-/.test(modelo) && !KEY_A) { filas.push(`${modelo}: sin ANTHROPIC_API_KEY`); continue; }
      const model = modeloDe(modelo);
      let items = 0, ver = 0, par = 0, none = 0, inTok = 0, outTok = 0, fallos = 0;
      for (const ll of plan.llamadas) {
        try {
          const r = await generateObject({ model, schema: (SCHEMA as any)[ll.extractor], prompt: ll.prompt, temperature: 0.1 });
          items += nItems(ll.extractor, r.object);
          for (const ev of evidencias(ll.extractor, r.object)) {
            const lvl = verifyEvidence(DOSSIER, ev);
            if (lvl === "verified") ver++; else if (lvl === "partial") par++; else none++;
          }
          inTok += r.usage?.inputTokens ?? 0;
          outTok += r.usage?.outputTokens ?? 0;
        } catch (e) {
          fallos++;
          console.log(`  ✗ ${modelo} / ${ll.extractor}: ${(e as Error).message.slice(0, 80)}`);
        }
      }
      const conEv = ver + par + none;
      const pct = conEv ? Math.round((ver / conEv) * 100) : 0;
      filas.push(`${modelo.padEnd(24)} items ${String(items).padStart(3)} · verif ${String(ver).padStart(3)}/${String(conEv).padStart(3)} = ${String(pct).padStart(3)}% · parc ${par} · in ${inTok} out ${outTok}${fallos ? ` · FALLOS ${fallos}` : ""}`);
    }
    console.log("\n================ A/B (canario = % de evidencia literal verificada) ================");
    filas.forEach((f) => console.log(f));
    console.log("línea base declarada por AKHAN (19-jul): 119 items · 101 verif · 18 parc · 0 none ≈ 85%");
  }, 600000);
});
