/* ============================================================================
   Recomendación de plantilla · tests.

   Dos bloques con propósitos distintos:

   1) Con un POOL SINTÉTICO — las reglas se prueban contra plantillas inventadas
      aquí, con ids y etiquetas controladas. El catálogo real está creciendo (de 5
      a ~30 plantillas) en paralelo: si estos tests dependieran de sus ids, se
      romperían por un cambio ajeno y no por un cambio de esta lógica.

   2) Contra el CATÁLOGO REAL — solo invariantes que deben cumplirse tenga el
      catálogo 5 plantillas o 35: nunca se recomienda gama 'visual', nunca se
      devuelve un id que no existe, nunca se repite una plantilla.

   Lo que este test vigila por encima de todo: que la razón sea un DATO, no un
   número inventado. Cada razón se compara contra el número que se metió en el
   resumen del master.
   ============================================================================ */

import { describe, it, expect } from "vitest";
import {
  recommendTemplates,
  reasonById,
  bodyLinePt,
  isMonoFaced,
  type MasterSummary,
} from "../src/lib/cv/recommend";
import { listTemplates, type CvTemplate, type TemplateTag } from "../src/lib/cv/templates";

// ── Pool sintético ───────────────────────────────────────────────────────────
/** Una plantilla mínima: solo lo que la recomendación mira (gama, tags, métricas,
 *  y la FAMILIA del cuerpo — la mono no puede ser el default técnico). */
function tpl(
  id: string,
  gama: "ats" | "visual",
  tags: TemplateTag[],
  metrics: { bodySize: number; bodyLeading: number; sectionGap: number },
  face: "sans" | "mono" = "sans",
): CvTemplate {
  const family = face === "mono" ? "Geist Mono" : "Geist";
  return {
    id,
    name: id,
    gama,
    description: `plantilla ${id}`,
    ...(gama === "visual" ? { warning: "dos columnas: el parser puede leerla al revés" } : {}),
    layout: { columns: gama === "visual" ? 2 : 1, photo: gama === "visual", sidebar: gama === "visual" },
    palette: { id: "p", name: "P", accent: "#1F6E5A", ink: "#14181A", muted: "#454B49", hair: "#D8DAD6" },
    typography: { id: face, name: face, display: family, body: family },
    metrics: {
      nameSize: 22,
      bodySize: metrics.bodySize,
      bodyLeading: metrics.bodyLeading,
      sectionGap: metrics.sectionGap,
      upperHeadings: true,
      headingRule: true,
    },
    tags,
  };
}

// Aire de línea: aireada 10×1.6=16 · media 10×1.45=14.5 · densa 9×1.28=11.52
const AIREADA = { bodySize: 10, bodyLeading: 1.6, sectionGap: 18 };
const MEDIA = { bodySize: 10, bodyLeading: 1.45, sectionGap: 13 };
const DENSA = { bodySize: 9, bodyLeading: 1.28, sectionGap: 8 };
const MUY_DENSA = { bodySize: 8.6, bodyLeading: 1.25, sectionGap: 7 };

const POOL: CvTemplate[] = [
  tpl("a-clasica", "ats", ["clasica", "general"], MEDIA),
  tpl("a-editorial", "ats", ["editorial", "academia"], AIREADA),
  tpl("a-tecnica", "ats", ["tecnica", "datos-ia"], MEDIA),
  tpl("a-compacta", "ats", ["minimal", "1pagina"], DENSA),
  tpl("a-apretada", "ats", ["minimal"], MUY_DENSA),
  tpl("a-moderna", "ats", ["moderna", "primer-empleo"], MEDIA),
  tpl("v-lateral", "visual", ["moderna"], MEDIA),
];

const summary = (over: Partial<MasterSummary> = {}): Partial<MasterSummary> => over;
const only = (recs: { templateId: string }[]) => recs.map((r) => r.templateId);

describe("recommendTemplates · pool sintético", () => {
  it("nunca recomienda una plantilla de gama visual", () => {
    const recs = recommendTemplates(summary({ roles: 6, projects: 5 }), { templates: POOL, limit: 99 });
    expect(only(recs)).not.toContain("v-lateral");
    // Y sí propone TODAS las ATS cuando el límite da de sí.
    expect(only(recs).sort()).toEqual(POOL.filter((t) => t.gama === "ats").map((t) => t.id).sort());
  });

  it("no repite plantillas y respeta el límite", () => {
    const recs = recommendTemplates(
      summary({ pages: 3, roles: 5, projects: 4, education: 3, skillItems: 40 }),
      { templates: POOL, limit: 4 },
    );
    expect(recs).toHaveLength(4);
    expect(new Set(only(recs)).size).toBe(4);
  });

  it("con un documento de 3 páginas propone primero las densas, y la razón cita las páginas", () => {
    const recs = recommendTemplates(summary({ pages: 3 }), { templates: POOL, limit: 6 });
    expect(only(recs).slice(0, 2)).toEqual(["a-apretada", "a-compacta"]);
    expect(recs[0]!.reason).toEqual({ code: "pages", n: 3 });
  });

  it("con una sola página no dispara la regla del volumen", () => {
    const recs = recommendTemplates(summary({ pages: 1 }), { templates: POOL, limit: 6 });
    expect(recs[0]!.reason.code).not.toBe("pages");
  });

  it("muchas habilidades CON EVIDENCIA → gama técnica, y el número es el que se le pasó", () => {
    const recs = recommendTemplates(summary({ skillsWithEvidence: 23, skillItems: 30 }), {
      templates: POOL,
      limit: 6,
    });
    expect(only(recs)[0]).toBe("a-tecnica");
    expect(recs[0]!.reason).toEqual({ code: "skillsEvidence", n: 23 });
  });

  it("sin marca de evidencia usa las habilidades listadas y lo dice con otro código", () => {
    const recs = recommendTemplates(summary({ skillItems: 21 }), { templates: POOL, limit: 6 });
    const why = reasonById(recs).get("a-tecnica");
    expect(why).toEqual({ code: "skills", n: 21 });
  });

  it("pocas habilidades no disparan la regla técnica", () => {
    const recs = recommendTemplates(summary({ skillItems: 6, skillsWithEvidence: 2 }), {
      templates: POOL,
      limit: 6,
    });
    const why = reasonById(recs).get("a-tecnica");
    expect(why?.code).toBe("ats");
  });

  it("más proyectos que roles → la razón lleva los DOS números", () => {
    const recs = recommendTemplates(summary({ projects: 5, roles: 1 }), { templates: POOL, limit: 6 });
    expect(reasonById(recs).get("a-moderna")).toEqual({ code: "projectsOverRoles", n: 5, m: 1 });
  });

  it("carrera larga → la clásica, citando los roles", () => {
    const recs = recommendTemplates(summary({ roles: 7 }), { templates: POOL, limit: 6 });
    expect(reasonById(recs).get("a-clasica")).toEqual({ code: "manyRoles", n: 7 });
  });

  it("perfil académico → editorial/academia, citando las formaciones", () => {
    const recs = recommendTemplates(summary({ education: 3, roles: 1 }), { templates: POOL, limit: 6 });
    expect(reasonById(recs).get("a-editorial")).toEqual({ code: "academic", n: 3 });
  });

  it("con muchos roles NO se considera académico aunque haya formaciones", () => {
    const recs = recommendTemplates(summary({ education: 4, roles: 6 }), { templates: POOL, limit: 6 });
    expect(reasonById(recs).get("a-editorial")?.code).not.toBe("academic");
  });

  it("un master vacío devuelve la gama ATS con la razón de la PLANTILLA (n=0)", () => {
    const recs = recommendTemplates({}, { templates: POOL, limit: 3 });
    expect(recs).toHaveLength(3);
    for (const r of recs) expect(r.reason).toEqual({ code: "ats", n: 0 });
  });

  it("la prioridad manda: la razón que se muestra es la de la primera regla que la metió", () => {
    // pages=2 mete a-apretada y a-compacta por volumen; la regla técnica llega
    // después y no debe reescribir su razón.
    const recs = recommendTemplates(summary({ pages: 2, skillsWithEvidence: 30 }), {
      templates: POOL,
      limit: 6,
    });
    expect(reasonById(recs).get("a-apretada")).toEqual({ code: "pages", n: 2 });
    expect(reasonById(recs).get("a-tecnica")).toEqual({ code: "skillsEvidence", n: 30 });
  });

  it("ninguna razón inventa un número: todo n sale del resumen (o es 0 en 'ats')", () => {
    const s: Partial<MasterSummary> = {
      pages: 4,
      skillsWithEvidence: 11,
      projects: 3,
      roles: 2,
      education: 2,
    };
    const permitidos = new Set([4, 11, 3, 2, 0]);
    for (const r of recommendTemplates(s, { templates: POOL, limit: 99 })) {
      expect(permitidos.has(r.reason.n)).toBe(true);
      if (r.reason.m !== undefined) expect(permitidos.has(r.reason.m)).toBe(true);
    }
  });

  it("un pool sin plantillas ATS no recomienda nada (en vez de recomendar una que rompe el ATS)", () => {
    const soloVisual = POOL.filter((t) => t.gama === "visual");
    expect(recommendTemplates(summary({ roles: 5 }), { templates: soloVisual })).toEqual([]);
  });

  it("una plantilla sin etiquetas nunca rompe: solo no entra por las reglas de etiqueta", () => {
    const desnuda = [tpl("a-sin-tags", "ats", [], MEDIA)];
    const recs = recommendTemplates(summary({ skillsWithEvidence: 30, roles: 9 }), {
      templates: desnuda,
      limit: 4,
    });
    expect(only(recs)).toEqual(["a-sin-tags"]);
    expect(recs[0]!.reason.code).toBe("ats");
  });
});

// ── La monoespaciada no es el default técnico ────────────────────────────────
/* Un CV de ingeniero en mono «parece» de ingeniero, pero quien lo lee primero no
   es un ingeniero: en la encuesta a hiring managers la mono puntúa al fondo. No
   se prohíbe (sigue en el catálogo y sigue elegible); lo que no puede es
   presentarse como LA plantilla para un perfil técnico. */
const POOL_MONO: CvTemplate[] = [
  tpl("a-terminal", "ats", ["tecnica", "ingenieria"], DENSA, "mono"),
  tpl("a-instrumento", "ats", ["tecnica", "datos-ia"], MEDIA, "sans"),
  tpl("a-clasica", "ats", ["clasica", "general"], MEDIA, "sans"),
];

describe("recommendTemplates · la mono no es la plantilla de ingeniería", () => {
  it("con muchas habilidades propone la técnica NO monoespaciada", () => {
    const recs = recommendTemplates(summary({ skillsWithEvidence: 20 }), {
      templates: POOL_MONO,
      limit: 6,
    });
    expect(only(recs)[0]).toBe("a-instrumento");
    expect(recs[0]!.reason.code).toBe("skillsEvidence");
  });

  it("la mono nunca lleva una razón técnica: si aparece, es por la razón honesta", () => {
    for (const s of [{ skillsWithEvidence: 30 }, { skillItems: 25 }]) {
      const recs = recommendTemplates(s, { templates: POOL_MONO, limit: 9 });
      const why = reasonById(recs).get("a-terminal");
      expect(why?.code).toBe("ats");
    }
  });

  it("sigue estando disponible: se ofrece, solo que la última", () => {
    const recs = recommendTemplates({}, { templates: POOL_MONO, limit: 9 });
    expect(only(recs)).toContain("a-terminal");
    expect(only(recs)[only(recs).length - 1]).toBe("a-terminal");
  });

  it("si TODA la gama técnica es mono, la regla no dispara y nadie se queda sin lista", () => {
    const soloMono = [
      tpl("a-terminal", "ats", ["tecnica", "ingenieria"], DENSA, "mono"),
      tpl("a-clasica", "ats", ["clasica"], MEDIA, "sans"),
    ];
    const recs = recommendTemplates(summary({ skillsWithEvidence: 30 }), {
      templates: soloMono,
      limit: 6,
    });
    expect(recs.length).toBe(2);
    for (const r of recs) expect(r.reason.code).toBe("ats");
  });
});

describe("isMonoFaced · mira la familia, no el id del catálogo", () => {
  it("detecta la mono en el cuerpo y en el nombre, y no confunde una sans", () => {
    expect(isMonoFaced(tpl("x", "ats", [], MEDIA, "mono"))).toBe(true);
    expect(isMonoFaced(tpl("y", "ats", [], MEDIA, "sans"))).toBe(false);
  });

  it("las CIFRAS en mono no hacen mono el documento: eso es un detalle, no un look", () => {
    const cronica = tpl("z", "ats", ["editorial"], MEDIA, "sans");
    const conCifras: CvTemplate = {
      ...cronica,
      typography: { ...cronica.typography, mono: "Geist Mono", monoFigures: true },
    };
    expect(isMonoFaced(conCifras)).toBe(false);
  });
});

describe("bodyLinePt · mide el documento, no una etiqueta", () => {
  it("es tamaño × interlineado, en puntos", () => {
    expect(bodyLinePt(POOL[3]!)).toBeCloseTo(9 * 1.28, 5);
  });

  it("ordena de densa a aireada", () => {
    const [a, m, d] = [POOL[1]!, POOL[0]!, POOL[3]!];
    expect(bodyLinePt(d)).toBeLessThan(bodyLinePt(m));
    expect(bodyLinePt(m)).toBeLessThan(bodyLinePt(a));
  });
});

describe("recommendTemplates · contra el catálogo real", () => {
  const catalogo = listTemplates();
  const ids = new Set(catalogo.map((t) => t.id));
  const casos: Partial<MasterSummary>[] = [
    {},
    { pages: 1, roles: 1 },
    { pages: 2, roles: 4, bullets: 30, skillItems: 25, projects: 3, education: 2 },
    { pages: 5, roles: 9, bullets: 80, skillsWithEvidence: 40, projects: 12, education: 4 },
    { projects: 6, roles: 0, education: 3, hasSummary: true },
  ];

  it("todo id recomendado existe en el catálogo y ninguno es de gama visual", () => {
    for (const c of casos) {
      const recs = recommendTemplates(c, { limit: 8 });
      expect(recs.length).toBeGreaterThan(0);
      for (const r of recs) {
        expect(ids.has(r.templateId), `id fantasma: ${r.templateId}`).toBe(true);
        expect(catalogo.find((t) => t.id === r.templateId)!.gama).toBe("ats");
      }
      expect(new Set(recs.map((r) => r.templateId)).size).toBe(recs.length);
    }
  });

  it("nunca devuelve más de las que hay ni más del límite", () => {
    const atsCount = catalogo.filter((t) => t.gama === "ats").length;
    const recs = recommendTemplates({ pages: 3, roles: 5 }, { limit: 100 });
    expect(recs.length).toBeLessThanOrEqual(atsCount);
  });

  it("ninguna monoespaciada llega recomendada por una razón técnica", () => {
    // Invariante independiente de los ids: vale con 5 plantillas y con 35, y
    // sobrevive a que el catálogo se reescriba entero.
    const tecnicas = new Set(["skillsEvidence", "skills"]);
    for (const c of casos) {
      for (const r of recommendTemplates(c, { limit: 12 })) {
        if (!tecnicas.has(r.reason.code)) continue;
        const t = catalogo.find((x) => x.id === r.templateId)!;
        expect(isMonoFaced(t), `mono recomendada como técnica: ${t.id}`).toBe(false);
      }
    }
  });

  it("es determinista: el mismo resumen da exactamente la misma lista", () => {
    const s = { pages: 2, roles: 5, skillItems: 22, projects: 4, education: 2 };
    expect(recommendTemplates(s, { limit: 6 })).toEqual(recommendTemplates(s, { limit: 6 }));
  });
});
