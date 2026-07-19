import { z } from "zod";

/**
 * Esquemas de extracción TROCEADOS por sección (prompt §4.3). Un schema gigante
 * revienta el límite de Claude (24 opcionales → "Schema is too complex"). Cada
 * sección es una llamada aparte, en paralelo.
 *
 * Regla §4.3: preferir `required` con "" a campos opcionales (cada opcional casi
 * duplica el espacio de estados de la gramática). Aquí NO hay opcionales: los
 * campos ausentes se piden como cadena vacía.
 *
 * ★ Cada item lleva `evidence`: el fragmento LITERAL del texto de donde salió.
 *   Se verifica contra raw_text en el servidor (verify.ts). Sin evidencia
 *   verificable, el item se marca — no se maquilla (§4.4).
 */

const EVIDENCE = "El texto EXACTO del origen del que extrajiste esto. Copia literal, sin parafrasear. Si lo inferiste, deja \"\".";

export const BasicsSchema = z.object({
  name: z.string().describe("Nombre completo tal cual aparece, o \"\""),
  label: z.string().describe("Título o rol profesional actual, o \"\""),
  email: z.string().describe("Email, o \"\""),
  phone: z.string().describe("Teléfono, o \"\""),
  location: z.string().describe("Ciudad/país, o \"\""),
  links: z.array(z.string()).describe("URLs de portfolio/perfil mencionadas"),
  summary: z.string().describe("Resumen profesional en 2-3 frases, o \"\""),
  summaryEvidence: z.string().describe(EVIDENCE),
});
export type Basics = z.infer<typeof BasicsSchema>;

const BulletSchema = z.object({
  text: z.string().describe("La viñeta, un logro o responsabilidad"),
  evidence: z.string().describe(EVIDENCE),
});

export const WorkSchema = z.object({
  items: z.array(
    z.object({
      title: z.string().describe("Cargo"),
      company: z.string().describe("Empresa, con su forma legal si aparece (SpA, S.A., Ltda)"),
      location: z.string().describe("Ubicación, o \"\""),
      dates: z.string().describe("Rango tal cual: 'mar 2022 – hoy', '2019 – 2020', o \"\""),
      evidence: z.string().describe(EVIDENCE),
      bullets: z.array(BulletSchema),
    }),
  ),
});
export type Work = z.infer<typeof WorkSchema>;

export const EducationSchema = z.object({
  items: z.array(
    z.object({
      degree: z.string(),
      institution: z.string(),
      location: z.string().describe("o \"\""),
      dates: z.string().describe("Rango o año, o \"\""),
      evidence: z.string().describe(EVIDENCE),
    }),
  ),
});
export type Education = z.infer<typeof EducationSchema>;

export const SkillsSchema = z.object({
  items: z.array(
    z.object({
      group: z.string().describe("Categoría: Lenguajes, Backend, Plataforma, Idiomas…"),
      items: z.string().describe("Lista separada por comas de las aptitudes de ese grupo"),
      evidence: z.string().describe(EVIDENCE),
    }),
  ),
});
export type Skills = z.infer<typeof SkillsSchema>;

export const ProjectsSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      url: z.string().describe("URL del proyecto, o \"\""),
      description: z.string().describe("Qué es y qué hiciste"),
      dates: z.string().describe("Rango o año del proyecto tal cual aparece, o \"\" si no hay"),
      evidence: z.string().describe(EVIDENCE),
    }),
  ),
});
export type Projects = z.infer<typeof ProjectsSchema>;

/** El resultado completo de la extracción troceada. */
export interface Extraction {
  basics: Basics;
  work: Work["items"];
  education: Education["items"];
  skills: Skills["items"];
  projects: Projects["items"];
}

export const SECTION_SCHEMAS = {
  basics: BasicsSchema,
  work: WorkSchema,
  education: EducationSchema,
  skills: SkillsSchema,
  projects: ProjectsSchema,
} as const;
