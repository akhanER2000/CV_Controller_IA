import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { generateObject } from "ai";
import { modeloPara } from "@/lib/ai/modelos";
import { construirMemoria, mensajesConMemoria, usoDe, type ItemMemoria } from "@/lib/ai/memoria";
import { OfertaPlanSchema } from "@/lib/cv/tailor";

/* ════════════════════════════════════════════════════════════════════════════
   MANUAL (fuera de CI; gasta tokens): ¿la memoria llega CACHEADA a Anthropic?

   Dos «adaptaciones a un aviso» seguidas con el modelo REAL de producción
   (modeloPara("redaccion-preserva-hechos"), envuelto con fallback) y el helper
   único mensajesConMemoria. La primera escribe la caché; la segunda debe leerla:
   cacheados > 0. Master SINTÉTICO (sin datos de nadie).

   Requiere ANTHROPIC_API_KEY en .env.local (nunca se imprime).
   npx vitest run --config vitest.manual.config.ts tests/manual/memoria-cache.ts
   ════════════════════════════════════════════════════════════════════════════ */

const RUTA_ENV = "J:/Code/CV_Controller_IA/.env.local";
const env: Record<string, string> = existsSync(RUTA_ENV)
  ? Object.fromEntries(
      readFileSync(RUTA_ENV, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    )
  : {};
const KEY_A = env.ANTHROPIC_API_KEY;
const KEY_G = env.GEMINI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY || undefined;

function masterSintetico(): ItemMemoria[] {
  const it: ItemMemoria[] = [
    { id: "b0", kind: "basics", parentId: null, data: { name: "Persona de Prueba", email: "prueba@example.com" }, evidenceSnippet: null, evidenceVerified: false, sortOrder: 0 },
    { id: "s0", kind: "summary", parentId: null, data: { text: "Ingeniería backend con foco en sistemas distribuidos y datos." }, evidenceSnippet: null, evidenceVerified: false, sortOrder: 0 },
  ];
  const empresas = ["Acme", "Globex", "Initech", "Umbrella", "Hooli", "Vandelay"];
  empresas.forEach((c, i) => {
    it.push({ id: `w${i}`, kind: "work", parentId: null, data: { company: c, title: "Backend Engineer", start: `201${i}-01`, end: `201${i + 1}-12` }, evidenceSnippet: null, evidenceVerified: false, sortOrder: i });
    for (let j = 0; j < 6; j++) {
      it.push({
        id: `w${i}b${j}`,
        kind: "bullet",
        parentId: `w${i}`,
        data: { text: `En ${c} reduje la latencia p99 del servicio ${j} de ${800 + j * 10} ms a ${100 + j * 5} ms migrando colas a Kafka y cachés a Redis, con ${3 + j} personas.` },
        evidenceSnippet: `latencia p99 del servicio ${j}`,
        evidenceVerified: true,
        sortOrder: j,
      });
    }
  });
  ["Go", "TypeScript", "PostgreSQL", "Kafka", "Redis", "Kubernetes", "Terraform"].forEach((s, i) =>
    it.push({ id: `k${i}`, kind: "skill", parentId: null, data: { name: s }, evidenceSnippet: null, evidenceVerified: false, sortOrder: i }),
  );
  return it;
}

describe.skipIf(!KEY_A)("memoria cacheada en Anthropic (llamada real)", () => {
  it("dos adaptaciones seguidas: la segunda lee tokens de caché", async () => {
    const mem = construirMemoria(masterSintetico());
    const model = modeloPara("redaccion-preserva-hechos", KEY_G, undefined, undefined, KEY_A);
    const SYS = "Adapta el CV al aviso usando SOLO hechos de la memoria. Devuelve requisitos, selección de ids, resumen y reformulaciones.";
    const avisos = [
      "Buscamos Backend Engineer con Kafka y PostgreSQL para pagos en tiempo real.",
      "Se busca ingeniera de plataforma con Kubernetes, Terraform y Go.",
    ];
    const usos = [];
    for (const [i, aviso] of avisos.entries()) {
      const r = await generateObject({
        model,
        schema: OfertaPlanSchema,
        ...mensajesConMemoria({ memoria: mem.contenido, modelo: model, sistema: SYS, usuario: `AVISO:\n${aviso}` }),
        temperature: 0.2,
        maxRetries: 0,
      });
      const u = usoDe(`adaptar-${i + 1}`, r);
      usos.push(u);
      console.info(`[manual] ${u.tarea}: entrada ${u.entrada} · salida ${u.salida} · cacheados ${u.cacheados} · escritos ${u.escritosCache}`);
    }
    console.info(`[manual] memoria: ${mem.items} items, ~${mem.tokensAprox} tokens, huella ${mem.huella}`);
    expect(usos[1]!.cacheados).toBeGreaterThan(0);
  }, 180_000);
});
