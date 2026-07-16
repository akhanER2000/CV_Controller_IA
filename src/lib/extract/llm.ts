import "server-only";
import { generateObject, generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  BasicsSchema, WorkSchema, EducationSchema, SkillsSchema, ProjectsSchema,
  type Extraction,
} from "./schema";

/**
 * La capa LLM. Gemini Flash para extracción y transcripción (258 tok/pág, y no
 * cobra los tokens del texto nativo extraído). Se expone como un `Extractor`
 * inyectable → el pipeline se prueba con un extractor falso, sin LLM en vivo.
 *
 * Modelo: gemini-flash-latest (la key del usuario no habilita 2.5/2.0-flash).
 * Clave: GEMINI_API_KEY (el provider por defecto busca GOOGLE_GENERATIVE_AI_API_KEY,
 * por eso se pasa explícita).
 */

export type Extractor = (rawText: string) => Promise<Extraction>;

const MODEL = "gemini-flash-latest";

/** La clave que se usa DE VERDAD. Se pasa explícita al provider (si no, el
 *  provider de Google leería GOOGLE_GENERATIVE_AI_API_KEY por defecto y la
 *  GEMINI_API_KEY quedaría sin usar). Se acepta cualquiera de las dos. */
export function geminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

function google() {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY");
  return createGoogleGenerativeAI({ apiKey })(MODEL);
}

const BASE =
  "Eres un extractor de datos de CV. Extrae SOLO lo que aparece literalmente en el TEXTO. " +
  "NO inventes: si un dato no está, deja el campo como \"\". Para cada item incluye `evidence`: " +
  "el fragmento LITERAL del texto de donde lo sacaste (copia exacta, sin parafrasear). " +
  "Fechas tal cual aparecen. Responde solo la estructura pedida.\n\nTEXTO:\n";

/** El extractor real: 5 llamadas troceadas en paralelo (prompt §4.3). */
export const geminiExtractor: Extractor = async (rawText) => {
  const text = rawText.slice(0, 30000);
  const model = google();
  const p = (focus: string) => `${BASE}${text}\n\n(Extrae: ${focus})`;

  const [basics, work, education, skills, projects] = await Promise.all([
    generateObject({ model, schema: BasicsSchema, prompt: p("datos básicos, contacto y resumen"), temperature: 0.1 }),
    generateObject({ model, schema: WorkSchema, prompt: p("experiencia laboral, con viñetas"), temperature: 0.1 }),
    generateObject({ model, schema: EducationSchema, prompt: p("formación académica"), temperature: 0.1 }),
    generateObject({ model, schema: SkillsSchema, prompt: p("aptitudes técnicas agrupadas"), temperature: 0.1 }),
    generateObject({ model, schema: ProjectsSchema, prompt: p("proyectos personales/open source"), temperature: 0.1 }),
  ]);

  return {
    basics: basics.object,
    work: work.object.items,
    education: education.object.items,
    skills: skills.object.items,
    projects: projects.object.items,
  };
};

/**
 * ★ Transcripción VERBATIM de una imagen / PDF escaneado (prompt §4.2). Dos
 * pasos: primero se transcribe TODO el texto visible, después se extrae SOBRE
 * esa transcripción. Sin este raw_text, la verificación de evidencia (§4.4)
 * quedaría desactivada justo en las fuentes con mayor riesgo de alucinación.
 */
export async function transcribeImage(dataUrl: string): Promise<string> {
  const { text } = await generateText({
    model: google(),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe LITERALMENTE todo el texto visible en esta imagen, en orden de lectura. No interpretes, no resumas, no completes lo que no se lee. Devuelve solo el texto transcrito.",
          },
          { type: "image", image: new URL(dataUrl) },
        ],
      },
    ],
  });
  return text;
}

/**
 * ★ Transcripción VERBATIM de un PDF ESCANEADO / de solo imagen (sin capa de
 * texto). Se manda el PDF al modelo de visión como DOCUMENTO (Gemini rasteriza
 * las páginas internamente — no hace falta canvas en el servidor) y se transcribe
 * literal, página por página. Igual disciplina que transcribeImage: es la fuente
 * sobre la que corre la verificación de evidencia (§4.4), así que NADA se inventa.
 */
export async function transcribePdf(bytes: Uint8Array): Promise<string> {
  const { text } = await generateText({
    model: google(),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Este PDF es un ESCANEO (páginas como imagen, sin capa de texto). " +
              "Transcribe LITERALMENTE todo el texto visible, página por página, en orden de lectura. " +
              "No interpretes, no resumas, no reordenes ni completes lo que no se lee. " +
              "Si una página es ilegible, omítela. Devuelve solo el texto transcrito.",
          },
          { type: "file", data: bytes, mediaType: "application/pdf" },
        ],
      },
    ],
  });
  return text;
}
