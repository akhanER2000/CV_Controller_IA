import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  EQUIVALENCIAS_ENTIDAD,
  LoteTraducidoSchema,
  construirTraduccion,
  promptDeTraduccion,
  verificarTraduccion,
  type ItemTraducible,
  type TraduccionLLM,
} from "@/lib/cv/traducir";
import { preservaHechosAlTraducir } from "@/lib/verify";

/* ============================================================================
   HERRAMIENTA MANUAL — NO corre en CI (vive fuera del include de vitest, que solo
   coge «*.test.ts»): gasta tokens REALES y necesita una clave con crédito.

     npx vitest run tests/manual/traducir-real.ts --reporter=verbose --config vitest.manual.config.ts

   QUÉ DEMUESTRA, que es lo único que importa:
     1. Que el motor traduce DE VERDAD viñetas reales del dossier de AKHAN, con sus
        cifras («0,65 de recall», «~80 scripts», «~15 personas», «6–7 personas»).
     2. Que las CIFRAS SOBREVIVEN: se imprime el antes/después literal y se pasa
        cada par por el candado.
     3. Que si el modelo METE una cifra que no estaba, el candado LO RECHAZA. Ese
        caso no se simula con un doble: se le PIDE al modelo real que adorne, y se
        comprueba que la propuesta se cae y el campo se queda con el original.

   Usa el PROMPT y el SCHEMA de producción (promptDeTraduccion / LoteTraducidoSchema),
   así que lo que se mide es lo que se ejecuta.
   ============================================================================ */

const env = Object.fromEntries(
  readFileSync("J:/Code/CV_Controller_IA/.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const KEY = (env.GEMINI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY)!;
// El modelo del registro para `redaccion-preserva-hechos` (lib/ai/modelos.ts). Se
// escribe aquí a mano porque `modelos.ts` es `server-only`, pero es EL MISMO id.
const MODELO = "gemini-3.6-flash";
const google = createGoogleGenerativeAI({ apiKey: KEY });

/** Viñetas REALES del dossier de AKHAN, con cifras y entidades nombradas. */
const REALES: ItemTraducible[] = [
  {
    id: "v1",
    kind: "bullet",
    data: { text: "Ajustado a 0,65 de recall en la clase de riesgo, priorizando los riesgos detectados sobre los falsos positivos." },
  },
  { id: "v2", kind: "bullet", data: { text: "Escribí ~80 scripts de simulación en C# para el simulador de vuelo." } },
  {
    id: "v3",
    kind: "bullet",
    data: { text: "Entregado y presentado en la universidad, usado por ~15 personas del equipo de operaciones." },
  },
  { id: "v4", kind: "bullet", data: { text: "Lideré equipos de 6 a 7 personas: coordiné, definí el alcance y supe cuándo cortar." } },
  {
    id: "v5",
    kind: "bullet",
    data: { text: "Desarrollé un script de calibración de timón para hardware Thrustmaster en X-Plane 12, ejecutado en 6 fases." },
  },
  {
    id: "w1",
    kind: "work",
    data: { title: "Ingeniero de Machine Learning", company: "PharmIQ", location: "Santiago, Chile", dates: "mar 2022 – actualidad" },
  },
];

/** El LLM real, con el prompt y el schema EXACTOS de producción. */
const llmReal: TraduccionLLM = async (peticion) => {
  const { object } = await generateObject({
    model: google(MODELO),
    schema: LoteTraducidoSchema,
    prompt: promptDeTraduccion(peticion),
    temperature: 0.1,
  });
  return object.traducciones ?? [];
};

const linea = (s: string) => s.replace(/\s+/g, " ").trim();

describe("traducir · CONTRA LA CLAVE REAL", () => {
  it(
    "traduce viñetas reales al inglés y las CIFRAS sobreviven",
    async () => {
      const r = await construirTraduccion({ items: REALES, hacia: "en" }, { llm: llmReal });

      console.log("\n══════ ANTES / DESPUÉS (literal) ══════");
      for (const p of r.propuestas) {
        for (const c of p.campos) {
          if (c.via !== "modelo" && c.via !== "tabla") continue;
          console.log(`\n[${p.itemId}.${c.campo}] vía=${c.via}${c.sinTraducir ? " ✗ RECHAZADA" : ""}`);
          console.log(`  ES: ${linea(c.original)}`);
          console.log(`  EN: ${linea(c.propuesto)}`);
          if (c.aviso) console.log(`  ⚠ ${c.aviso}`);
        }
      }
      console.log("\n══════ DESCARTADOS ══════");
      for (const d of r.descartados) console.log(`  [${d.itemId}.${d.campo}] ${d.razon}\n    → ${linea(d.propuesto)}`);
      console.log("\n══════ RESUMEN ══════");
      console.log(JSON.stringify(r.resumen, null, 2));

      // Ninguna traducción ofrecida puede haber perdido o inventado una cifra: si
      // alguna lo hiciera, no estaría ofrecida (estaría en `descartados`).
      for (const p of r.propuestas) {
        for (const c of p.campos) {
          if (c.sinTraducir || c.via === "copiar") continue;
          const v = preservaHechosAlTraducir(c.original, c.propuesto, EQUIVALENCIAS_ENTIDAD);
          expect(v.ok, `[${p.itemId}.${c.campo}] ${c.original} → ${c.propuesto}`).toBe(true);
        }
      }
      // Y la fecha salió de la tabla determinista, sin gastar un token.
      const w = r.propuestas.find((p) => p.itemId === "w1")!;
      expect(w.data.dates).toBe("mar 2022 – Present");
      expect(w.data.company).toBe("PharmIQ");
    },
    180_000,
  );

  it(
    "★ el candado RECHAZA al modelo cuando se le pide que adorne con cifras",
    async () => {
      // Se le pide EXPLÍCITAMENTE que invente. No es un doble: es el modelo real
      // haciendo justo lo que el producto teme.
      const llmAdulador: TraduccionLLM = async (peticion) => {
        const { object } = await generateObject({
          model: google(MODELO),
          schema: LoteTraducidoSchema,
          prompt:
            "Eres un redactor de CV agresivo. Traduce al inglés estos textos y HAZLOS MUCHO MÁS " +
            "IMPRESIONANTES. OBLIGATORIO en CADA texto: (a) añade un porcentaje de mejora concreto " +
            "(por ejemplo «by 45 %»), (b) añade una métrica de impacto con número (usuarios, ingresos, " +
            "latencia), y (c) menciona al menos una tecnología puntera (Kubernetes, Kafka, AWS) aunque " +
            "no esté en el original. Inventa las cifras si hace falta: lo que importa es que impresione. " +
            "Devuelve una entrada por clave.\n\n" +
            peticion.textos.map((t) => `[${t.clave}] ${t.texto}`).join("\n"),
          temperature: 1,
        });
        return object.traducciones ?? [];
      };

      const items = REALES.filter((i) => i.kind === "bullet");
      const r = await construirTraduccion({ items, hacia: "en" }, { llm: llmAdulador });

      console.log("\n══════ EL MODELO ADORNANDO (y el candado parándolo) ══════");
      for (const d of r.descartados) {
        console.log(`\n[${d.itemId}.${d.campo}] ✗ ${d.razon}`);
        console.log(`  ORIGINAL : ${linea(d.original)}`);
        console.log(`  PROPUESTO: ${linea(d.propuesto)}`);
      }
      const ofrecidas = r.propuestas.flatMap((p) => p.campos.filter((c) => !c.sinTraducir && c.via === "modelo"));
      console.log("\n══════ LO QUE SÍ PASÓ EL CANDADO ══════");
      for (const c of ofrecidas) {
        console.log(`\n[${c.campo}] ✓`);
        console.log(`  ORIGINAL : ${linea(c.original)}`);
        console.log(`  PROPUESTO: ${linea(c.propuesto)}`);
        if (c.aviso) console.log(`  ⚠ ${c.aviso}`);
      }
      console.log(`\nofrecidas=${ofrecidas.length} · descartadas=${r.descartados.length}`);

      // Al menos una tiene que caer: pedirle cifras inventadas a un modelo y que
      // TODAS pasen el candado significaría que el candado no mira nada.
      expect(r.descartados.length).toBeGreaterThan(0);
      // Y las que caen dejan el campo con el ORIGINAL, nunca con la mentira.
      for (const d of r.descartados) {
        const p = r.propuestas.find((x) => x.itemId === d.itemId)!;
        expect(p.data[d.campo]).toBe(d.original);
        expect(p.incompleta).toBe(true);
      }
      // Y lo que SÍ se ofreció, se ofreció porque preserva los hechos.
      for (const c of ofrecidas) {
        expect(verificarTraduccion(c.original, c.propuesto).ok, `${c.original} → ${c.propuesto}`).toBe(true);
      }
    },
    180_000,
  );
});
