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

/**
 * El modelo Gemini con la clave EFECTIVA: la BYOK del usuario (ya descifrada, se
 * pasa explícita) o, si no hay, la del servidor (GEMINI_API_KEY). La clave BYOK se
 * descifra solo en el servidor (getUserLlmKey) y nunca se guarda en claro.
 */
function googleModel(apiKey?: string) {
  const key = apiKey || geminiApiKey();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  return createGoogleGenerativeAI({ apiKey: key })(MODEL);
}

const BASE =
  "Eres un extractor de datos de CV. Extrae SOLO lo que aparece literalmente en el TEXTO. " +
  "NO inventes: si un dato no está, deja el campo como \"\". Para cada item incluye `evidence`: " +
  "el fragmento LITERAL del texto de donde lo sacaste (copia exacta, sin parafrasear). " +
  "Fechas tal cual aparecen. Responde solo la estructura pedida.\n\nTEXTO:\n";

/**
 * El extractor real: 5 llamadas troceadas en paralelo (prompt §4.3). La clave se
 * inyecta (BYOK del usuario o, si no, la del servidor). `geminiExtractor` es el
 * atajo con la clave del servidor (compat con el pipeline y sus tests).
 */
export function makeGeminiExtractor(apiKey?: string): Extractor {
  return async (rawText) => {
    const text = rawText.slice(0, 30000);
    const model = googleModel(apiKey);
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
}
export const geminiExtractor: Extractor = makeGeminiExtractor();

/**
 * ★ Transcripción VERBATIM de una imagen / PDF escaneado (prompt §4.2). Dos
 * pasos: primero se transcribe TODO el texto visible, después se extrae SOBRE
 * esa transcripción. Sin este raw_text, la verificación de evidencia (§4.4)
 * quedaría desactivada justo en las fuentes con mayor riesgo de alucinación.
 */
export async function transcribeImage(dataUrl: string, apiKey?: string): Promise<string> {
  const { text } = await generateText({
    model: googleModel(apiKey),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Transcribe LITERALMENTE todo el texto visible en esta imagen, en orden de lectura. " +
              "No interpretes, no resumas, no completes lo que no se lee. " +
              "Es CLAVE para capturas de LinkedIn: transcribe los ENCABEZADOS DE SECCIÓN tal cual, " +
              "cada uno en su propia línea y en su lugar (Experiencia/Experience, Aptitudes/Skills, " +
              "Educación/Education, Acerca de/About, Licencias y certificaciones/Licenses & certifications, " +
              "Proyectos/Projects, Idiomas/Languages). Así se sabe qué es habilidad y qué es logro. " +
              "Devuelve solo el texto transcrito.",
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
export async function transcribePdf(bytes: Uint8Array, apiKey?: string): Promise<string> {
  const { text } = await generateText({
    model: googleModel(apiKey),
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
              "Transcribe los ENCABEZADOS DE SECCIÓN tal cual y en su propia línea (Experiencia/Experience, " +
              "Aptitudes/Skills, Educación/Education, Acerca de/About, Licencias y certificaciones/Licenses & " +
              "certifications, Proyectos/Projects, Idiomas/Languages): sirven para no confundir habilidades con logros. " +
              "Si una página es ilegible, omítela. Devuelve solo el texto transcrito.",
          },
          { type: "file", data: bytes, mediaType: "application/pdf" },
        ],
      },
    ],
  });
  return text;
}
