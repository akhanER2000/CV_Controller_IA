import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { planificarExtraccion } from "@/lib/extract/llm";
import { BasicsSchema, WorkSchema, EducationSchema, SkillsSchema, ProjectsSchema } from "@/lib/extract/schema";
import { verifyEvidence } from "@/lib/verify";

/* ============================================================================
   HERRAMIENTA MANUAL — NO corre en CI: vive fuera del include de vitest (que solo
   coge los ficheros «.test.ts») a propósito, porque gasta tokens reales y necesita
   una clave con crédito.

   Para correrla:  npx vitest run tests/manual/ab-modelos.ts --reporter=verbose
   Requiere GEMINI_API_KEY con crédito en .env.local.

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
const DOSSIER = readFileSync("J:/Code/CV_Controller_IA/material-perfil/dossier/DOSSIER-MAESTRO-AKHAN.md", "utf8");

const SCHEMA = { basics: BasicsSchema, work: WorkSchema, education: EducationSchema, skills: SkillsSchema, projects: ProjectsSchema } as const;
const MODELOS = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

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
      const google = createGoogleGenerativeAI({ apiKey: KEY });
      const model = google(modelo);
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
