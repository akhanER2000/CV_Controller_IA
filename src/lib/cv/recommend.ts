/**
 * RECOMENDACIONES DE PLANTILLA — derivadas del master REAL, sin números inventados.
 *
 * Con treinta plantillas el problema deja de ser la variedad y pasa a ser la
 * parálisis de elección. Esto es la curación: un puñado de plantillas y, junto a
 * cada una, POR QUÉ, en una línea, citando el dato que la sostiene.
 *
 * LO QUE ESTE MÓDULO NO HACE, Y NO VA A HACER:
 *   · No devuelve un score, ni un porcentaje, ni un «95% de afinidad». Un número
 *     sin fuente es una mentira con decimales. La razón se dice en palabras y el
 *     único número que aparece es uno que el usuario puede ir a contar él mismo
 *     («tu master tiene 23 habilidades»).
 *   · No recomienda la gama 'visual'. Una plantilla que lleva `warning` se elige
 *     a sabiendas, no se sugiere: recomendar algo que rompe el parseo del ATS
 *     sería vender el problema como si fuera la solución.
 *
 * PURO Y SIN ESTADO: entra un resumen del master (números), sale una lista de
 * ids con su razón. No toca el DOM, no pide nada por red y no depende de ids
 * concretos del catálogo — se lee siempre `listTemplates()` (o el pool que le
 * pasen los tests), así que funciona igual con 5 plantillas que con 35.
 *
 * LA RAZÓN VIAJA COMO CÓDIGO, NO COMO FRASE. Devolver "tu master tiene 23
 * habilidades" en español dejaría a la UI en inglés hablando español. Se devuelve
 * { code, n, m } y el diccionario lo redacta en cada idioma. Así el módulo sigue
 * siendo puro y la frase sigue siendo traducible.
 */

import {
  listTemplates,
  resolveMetrics,
  tagsOf,
  type CvTemplate,
  type TemplateTag,
} from "./templates";

/**
 * El master del usuario, contado. Todos los campos son NÚMEROS QUE ALGUIEN PUEDE
 * VERIFICAR mirando su propia biblioteca: no hay ninguna estimación aquí.
 */
export interface MasterSummary {
  /** Roles de experiencia. */
  roles: number;
  /** Viñetas (de todos los roles). */
  bullets: number;
  /** Grupos de habilidades ("Lenguajes", "Backend"…). */
  skillGroups: number;
  /** Habilidades sueltas, sumando los items de cada grupo. */
  skillItems: number;
  /**
   * Habilidades con evidencia COMPROBADA. Opcional a propósito: hoy el editor no
   * recibe la marca de evidencia del master (la API de la variante no la trae), y
   * preferimos no afirmarlo antes que afirmarlo a ojo. Cuando el dato llega, la
   * razón se vuelve la fuerte («con evidencia»); mientras no llega, se cuenta lo
   * que sí se sabe.
   */
  skillsWithEvidence?: number;
  /** Proyectos. */
  projects: number;
  /** Títulos y formaciones. */
  education: number;
  /** ¿Hay resumen profesional? */
  hasSummary: boolean;
  /**
   * Páginas REALES del PDF que el usuario está viendo (numPages del documento,
   * no una estimación del DOM). 0 = todavía no se sabe, y entonces no se usa.
   */
  pages: number;
}

const EMPTY: MasterSummary = {
  roles: 0,
  bullets: 0,
  skillGroups: 0,
  skillItems: 0,
  projects: 0,
  education: 0,
  hasSummary: false,
  pages: 0,
};

/**
 * Por qué se recomienda. Cada código se redacta en el diccionario con {n} (y {m})
 * interpolados; ninguno admite un número que no venga del master o del PDF.
 */
export type ReasonCode =
  /** El documento YA sale en {n} páginas → métricas que aprietan. */
  | "pages"
  /** {n} habilidades CON EVIDENCIA → gama técnica, habilidades arriba. */
  | "skillsEvidence"
  /** {n} habilidades listadas (sin marca de evidencia disponible). */
  | "skills"
  /** {n} proyectos frente a {m} roles → que los proyectos manden. */
  | "projectsOverRoles"
  /** {n} roles → una carrera larga pide la gama conservadora. */
  | "manyRoles"
  /** {n} formaciones y poca experiencia → gama académica/editorial. */
  | "academic"
  /** Relleno honesto: la propiedad es de la PLANTILLA, no una afirmación sobre ti. */
  | "ats";

export interface RecommendReason {
  code: ReasonCode;
  /** El dato citado. Para "ats" es 0: esa razón no habla del usuario. */
  n: number;
  /** Segundo dato, solo cuando la razón compara dos cosas. */
  m?: number;
}

export interface Recommendation {
  templateId: string;
  reason: RecommendReason;
}

// ── Densidad: sale de las MÉTRICAS de la plantilla, no de una etiqueta ────────
/**
 * La altura real de una línea de cuerpo, en puntos: tamaño × interlineado. Es una
 * medida física del documento, no un "índice" inventado, y existe para TODA
 * plantilla del catálogo — también para las que el catálogo aún no ha etiquetado.
 * Por eso la regla del volumen no depende de que alguien se acuerde de poner
 * la etiqueta "1pagina".
 */
export function bodyLinePt(t: CvTemplate): number {
  const m = resolveMetrics(t.metrics);
  return m.bodySize * m.bodyLeading;
}

/** Las `n` plantillas que gastan menos papel por línea. Empates: menos aire de sección. */
function densest(pool: CvTemplate[], n: number): CvTemplate[] {
  return [...pool]
    .sort(
      (a, b) =>
        bodyLinePt(a) - bodyLinePt(b) ||
        resolveMetrics(a.metrics).sectionGap - resolveMetrics(b.metrics).sectionGap ||
        a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, n));
}

/** Plantillas que llevan ALGUNA de estas etiquetas (vocabulario cerrado de templates.ts). */
function withAnyTag(pool: CvTemplate[], tags: TemplateTag[]): CvTemplate[] {
  return pool.filter((t) => {
    const own = tagsOf(t);
    return tags.some((tag) => own.includes(tag));
  });
}

export interface RecommendOptions {
  /** Cuántas devolver. Un puñado: por defecto 6. */
  limit?: number;
  /** Pool a considerar. Por defecto, el catálogo entero (listTemplates()). */
  templates?: CvTemplate[];
}

/**
 * Las plantillas recomendadas, EN ORDEN DE PRIORIDAD (no de puntuación): la
 * primera regla que dispara pone sus plantillas antes. Si dos reglas proponen la
 * misma plantilla, se queda con la razón de la regla más prioritaria — la razón
 * que se muestra es siempre la que la metió en la lista.
 *
 * Los umbrales son deliberadamente gruesos y están justificados: no son un modelo,
 * son el punto a partir del cual la forma del documento empieza a importar.
 */
export function recommendTemplates(
  summary: Partial<MasterSummary> = {},
  opts: RecommendOptions = {},
): Recommendation[] {
  const s: MasterSummary = { ...EMPTY, ...summary };
  const limit = Math.max(1, Math.floor(opts.limit ?? 6));
  // Solo gama ATS: la 'visual' se elige leyendo su aviso, no por recomendación nuestra.
  const pool = (opts.templates ?? listTemplates()).filter((t) => t.gama === "ats");
  if (!pool.length) return [];

  const out: Recommendation[] = [];
  const seen = new Set<string>();
  const push = (list: CvTemplate[], reason: RecommendReason) => {
    for (const t of list) {
      if (out.length >= limit) return;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push({ templateId: t.id, reason });
    }
  };

  // 1 · EL VOLUMEN MANDA. Si tu documento ya sale en dos o más páginas, lo primero
  //     que te sirve no es un estilo: es una métrica que quepa.
  if (s.pages >= 2) push(densest(pool, 2), { code: "pages", n: s.pages });

  // 2 · MUCHAS HABILIDADES → gama técnica (mono en las cifras, denso, habilidades
  //     que se leen como datos). 8 con evidencia, o 18 listadas, es el punto en el
  //     que la sección de habilidades deja de ser una línea y pasa a ser un bloque.
  const evidenced = s.skillsWithEvidence ?? 0;
  const technical: TemplateTag[] = ["tecnica", "datos-ia", "ingenieria"];
  if (evidenced >= 8) push(withAnyTag(pool, technical), { code: "skillsEvidence", n: evidenced });
  else if (s.skillItems >= 18) push(withAnyTag(pool, technical), { code: "skills", n: s.skillItems });

  // 3 · MÁS PROYECTOS QUE EXPERIENCIA FORMAL. Con ≤2 roles y ≥3 proyectos, lo que
  //     te define está en los proyectos: que el documento no los entierre al final.
  if (s.projects >= 3 && s.roles <= 2) {
    push(withAnyTag(pool, ["primer-empleo", "moderna"]), {
      code: "projectsOverRoles",
      n: s.projects,
      m: s.roles,
    });
  }

  // 4 · CARRERA LARGA. Cuatro roles o más: la gama conservadora sostiene mejor una
  //     cronología larga que una plantilla con personalidad.
  if (s.roles >= 4) push(withAnyTag(pool, ["clasica"]), { code: "manyRoles", n: s.roles });

  // 5 · PERFIL ACADÉMICO. Dos o más formaciones con poca experiencia: la formación
  //     es el eje del documento, y ahí la gama editorial/académica es la que cabe.
  if (s.education >= 2 && s.roles <= 2) {
    push(withAnyTag(pool, ["academia", "editorial"]), { code: "academic", n: s.education });
  }

  // 6 · RELLENO HONESTO. Si las reglas no llenan el puñado, se completa con la gama
  //     ATS en el orden del catálogo. Esta razón NO afirma nada sobre el usuario:
  //     afirma una propiedad comprobable de la plantilla (una columna, sin foto).
  push(pool, { code: "ats", n: 0 });

  return out;
}

/**
 * Índice id → razón, para pintar la razón en la tarjeta sin recorrer la lista en
 * cada render.
 */
export function reasonById(recs: Recommendation[]): Map<string, RecommendReason> {
  return new Map(recs.map((r) => [r.templateId, r.reason]));
}
