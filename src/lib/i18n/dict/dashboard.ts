/* i18n · namespace "dashboard". Claves planas con prefijo "dashboard.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "dashboard". */
export const dashboard = {
  es: {
    // ── Cargando ──────────────────────────────────────────────────────────────
    "dashboard.loading": "Leyendo tu registro…",

    // ── Franja superior (muro) ────────────────────────────────────────────────
    // suffix: se compone con .replace("{n}", …).replace("{m}", …)
    "dashboard.strip.suffix": " · master: {n} items · {m} fuentes",
    "dashboard.strip.newVariant": "Nueva variante",

    // ── Estado vacío (día 1) ──────────────────────────────────────────────────
    "dashboard.empty.overline": "Día 1 · master: 0 items",
    "dashboard.empty.h1.pre": "Tu registro está vacío. Bien: ",
    "dashboard.empty.h1.em": "partamos de verdad.",
    "dashboard.empty.sub":
      "Corpus guarda tu carrera una sola vez, con la evidencia de cada dato. Las variantes de tu CV salen de ahí — no al revés.",
    "dashboard.empty.doorA.overline": "Con IA · 5 minutos",
    "dashboard.empty.doorA.title": "Vuelca lo que tengas",
    "dashboard.empty.doorA.body":
      "Texto suelto, tu CV viejo, tu GitHub, tu portfolio. La IA extrae; tú confirmas item por item. Nada entra sin tu ojo.",
    "dashboard.empty.doorA.cta": "Pegar y extraer →",
    "dashboard.empty.doorB.overline": "Sin IA · a tu ritmo",
    "dashboard.empty.doorB.title": "Escríbelo de cero",
    "dashboard.empty.doorB.body":
      "Desde una plantilla de rol o en blanco, con la IA apagada. El origen manual es el más verificable de todos: lo escribiste tú.",
    "dashboard.empty.doorB.cta": "Empezar a escribir →",
    "dashboard.empty.fine": "Ninguna puerta es de segunda. Puedes cambiar de vía cuando quieras.",

    // ── Celda Variantes ───────────────────────────────────────────────────────
    "dashboard.variants.outdated.one": "desactualizada",
    "dashboard.variants.outdated.other": "desactualizadas",
    "dashboard.variants.seeAll": "ver todas →",
    "dashboard.variants.emptyRow": "Aún no hay variantes. ",
    "dashboard.variants.createFirst": "Crea la primera →",

    // ── Fila de variante (VariantRow) ─────────────────────────────────────────
    // aria: se compone con .replace("{nm}", …).replace("{obj}", …)
    "dashboard.variant.aria": "{nm} — objetivo: {obj}",
    "dashboard.variant.outdatedDot": "desactualizada",
    "dashboard.variant.pdfTitle": "Descargar el PDF sin entrar",
    "dashboard.variant.pdf": "PDF ↓",
    "dashboard.variant.outdated": "desactualizada · el master cambió",
    "dashboard.variant.upToDate": "al día",
    "dashboard.variant.target": "objetivo: ",
    // touched: se compone con .replace("{rel}", …)
    "dashboard.variant.touched": "tocada {rel}",
    "dashboard.variant.noTarget": "sin objetivo definido",

    // ── Celda Salud del master ────────────────────────────────────────────────
    "dashboard.health.overline": "Salud del master",
    "dashboard.health.n": "sin score — cosas concretas",
    "dashboard.health.clear": "Nada que señalar. El silencio es la señal.",
    "dashboard.health.fine": "Lo que está bien no aparece aquí. Silencio = en orden.",

    // ── Hallazgos derivados de tus propios items (sin cifra en el texto) ───────
    "dashboard.findings.noNum.one": "viñeta sin ninguna cifra — ¿cuánto? ¿cuántos? ¿en cuánto tiempo?",
    "dashboard.findings.noNum.other": "viñetas sin ninguna cifra — ¿cuánto? ¿cuántos? ¿en cuánto tiempo?",
    "dashboard.findings.noDates.one": "rol sin fechas — un vacío que el reclutador nota",
    "dashboard.findings.noDates.other": "roles sin fechas — un vacío que el reclutador nota",
    "dashboard.findings.noEv.one": "skill sin evidencia — respáldala o quítala",
    "dashboard.findings.noEv.other": "skills sin evidencia — respáldalas o quítalas",

    // ── Celda Staging ─────────────────────────────────────────────────────────
    "dashboard.staging.pending": "items de la ingesta esperan tu decisión",
    "dashboard.staging.review": "revisar →",

    // ── Celda Fuentes ─────────────────────────────────────────────────────────
    "dashboard.sources.emptyName": "Sin fuentes conectadas",
    "dashboard.sources.emptyFacts":
      "Vuelca material en Importar y quedará registrado aquí, con lo que aportó cada uno.",
    "dashboard.sources.emptyCta": "Volcar lo que tengo →",
    // facts/read: se componen con .replace
    "dashboard.source.chars": "caracteres",
    "dashboard.source.read": "leída {rel}",
    "dashboard.source.extracted": "extraída — revisa el staging",
    "dashboard.source.static": "fuente estática",

    // ── Etiquetas de tipo de fuente (kindLabel) ───────────────────────────────
    "dashboard.kind.paste": "texto pegado",
    "dashboard.kind.pdf": "PDF",
    "dashboard.kind.docx": "DOCX",
    "dashboard.kind.image": "captura",
    "dashboard.kind.url": "portfolio",
    "dashboard.kind.github": "GitHub",
    "dashboard.kind.manual": "manual",

    // ── Tiempo relativo (rel) — {n} es el número ──────────────────────────────
    "dashboard.rel.now": "recién",
    "dashboard.rel.min": "hace {n} min",
    "dashboard.rel.hour": "hace {n} h",
    "dashboard.rel.day.one": "hace {n} día",
    "dashboard.rel.day.other": "hace {n} días",
    "dashboard.rel.week": "hace {n} sem",
    "dashboard.rel.month.one": "hace {n} mes",
    "dashboard.rel.month.other": "hace {n} meses",
    "dashboard.rel.year.one": "hace {n} año",
    "dashboard.rel.year.other": "hace {n} años",
    // ── Forja v2 (panel-datos) ──
    "dashboard.v2.fuentePrefix": "fuente: ",
    "dashboard.v2.kpi.items": "Ítems en el master",
    "dashboard.v2.kpi.variants": "Variantes",
    "dashboard.v2.kpi.verified": "Ítems verificados",
    "dashboard.v2.kpi.verifiedNote": "{v} de {n} con evidencia",
    "dashboard.v2.kpi.sources": "Fuentes cargadas",
    "dashboard.v2.kpi.updated": "Última actualización",
    "dashboard.v2.fuente.master": "master",
    "dashboard.v2.fuente.variants": "variantes",
    "dashboard.v2.fuente.evidence": "master · evidencia",
    "dashboard.v2.fuente.sources": "fuentes",
    "dashboard.v2.fuente.updated": "variantes · fuentes",
    "dashboard.v2.fuente.demo": "maqueta local · ejemplo",
    "dashboard.v2.hero.over": "Tu próxima variante",
    "dashboard.v2.hero.title": "Pega la oferta. Corpus la arma.",
    "dashboard.v2.hero.sub": "Cada línea sale de tu master y lleva su fuente. Lo que no tiene respaldo, no entra.",
    "dashboard.v2.hero.new": "Nueva variante",
    "dashboard.v2.hero.import": "Importar",
    "dashboard.v2.hero.review": "Revisión",
    "dashboard.v2.hero.reviewN": "Revisión · {n} pendientes",
    "dashboard.v2.verif.title": "Evidencia del master",
    "dashboard.v2.verif.sub": "ítems con su evidencia verificada",
    "dashboard.v2.verif.center": "{v} de {n}",
    "dashboard.v2.verif.emptyT": "Sin ítems que medir",
    "dashboard.v2.tipos.title": "El master por tipo",
    "dashboard.v2.tipos.sub": "ítems por tipo de bloque",
    "dashboard.v2.tipos.chart": "Ítems del master por tipo",
    "dashboard.v2.tipos.emptyT": "Aún no hay ítems",
    "dashboard.v2.tipo.basics": "Contacto",
    "dashboard.v2.tipo.summary": "Resumen",
    "dashboard.v2.tipo.work": "Roles",
    "dashboard.v2.tipo.bullet": "Viñetas",
    "dashboard.v2.tipo.education": "Educación",
    "dashboard.v2.tipo.project": "Proyectos",
    "dashboard.v2.tipo.skill": "Habilidades",
    "dashboard.v2.tipo.certification": "Certificaciones",
    "dashboard.v2.tipo.reference": "Referencias",
    "dashboard.v2.serie.title": "Variantes por mes",
    "dashboard.v2.serie.sub": "según el mes de su última edición",
    "dashboard.v2.serie.chart": "Variantes por mes de última edición",
    "dashboard.v2.serie.emptyT": "Aún no hay serie",
    "dashboard.v2.serie.emptyB": "Se dibuja cuando haya variantes editadas en al menos dos meses distintos.",
    "dashboard.v2.recent.title": "Variantes recientes",
    "dashboard.v2.recent.seeAll": "Ver todas",
    "dashboard.v2.sources.title": "Fuentes",
    "dashboard.v2.sources.seeAll": "Ver fuentes",
    // ── Forja v2 (panel-datos) ──
    "dashboard.v2.tipo.language": "Idiomas",
    "dashboard.v2.tipo.link": "Enlaces",
    "dashboard.v2.tipo.publication": "Publicaciones",
    "dashboard.v2.tipo.award": "Premios",
    "dashboard.v2.tipo.volunteer": "Voluntariado",
  } as Record<string, string>,
  en: {
    // ── Loading ───────────────────────────────────────────────────────────────
    "dashboard.loading": "Reading your record…",

    // ── Top strip (wall) ──────────────────────────────────────────────────────
    "dashboard.strip.suffix": " · master: {n} items · {m} sources",
    "dashboard.strip.newVariant": "New variant",

    // ── Empty state (day 1) ───────────────────────────────────────────────────
    "dashboard.empty.overline": "Day 1 · master: 0 items",
    "dashboard.empty.h1.pre": "Your record is empty. Good — ",
    "dashboard.empty.h1.em": "let's start with the truth.",
    "dashboard.empty.sub":
      "Corpus stores your career once, with evidence for every fact. Your resume variants come from it — not the other way around.",
    "dashboard.empty.doorA.overline": "With AI · 5 minutes",
    "dashboard.empty.doorA.title": "Dump what you have",
    "dashboard.empty.doorA.body":
      "Loose text, your old resume, your GitHub, your portfolio. The AI extracts; you confirm item by item. Nothing enters without your eye.",
    "dashboard.empty.doorA.cta": "Paste and extract →",
    "dashboard.empty.doorB.overline": "No AI · at your pace",
    "dashboard.empty.doorB.title": "Write it from scratch",
    "dashboard.empty.doorB.body":
      "From a role template or a blank page, with AI off. The manual origin is the most verifiable of all: you wrote it.",
    "dashboard.empty.doorB.cta": "Start writing →",
    "dashboard.empty.fine": "Neither door is second-rate. You can switch paths whenever you want.",

    // ── Variants cell ─────────────────────────────────────────────────────────
    "dashboard.variants.outdated.one": "out of date",
    "dashboard.variants.outdated.other": "out of date",
    "dashboard.variants.seeAll": "see all →",
    "dashboard.variants.emptyRow": "No variants yet. ",
    "dashboard.variants.createFirst": "Create the first →",

    // ── Variant row (VariantRow) ──────────────────────────────────────────────
    "dashboard.variant.aria": "{nm} — target: {obj}",
    "dashboard.variant.outdatedDot": "out of date",
    "dashboard.variant.pdfTitle": "Download the PDF without opening it",
    "dashboard.variant.pdf": "PDF ↓",
    "dashboard.variant.outdated": "out of date · the master changed",
    "dashboard.variant.upToDate": "up to date",
    "dashboard.variant.target": "target: ",
    "dashboard.variant.touched": "touched {rel}",
    "dashboard.variant.noTarget": "no target set",

    // ── Master health cell ────────────────────────────────────────────────────
    "dashboard.health.overline": "Master health",
    "dashboard.health.n": "no score — concrete things",
    "dashboard.health.clear": "Nothing to flag. Silence is the signal.",
    "dashboard.health.fine": "What's fine doesn't show up here. Silence = in order.",

    // ── Findings derived from your own items (no number in the text) ───────────
    "dashboard.findings.noNum.one": "bullet with no number — how much? how many? how long?",
    "dashboard.findings.noNum.other": "bullets with no number — how much? how many? how long?",
    "dashboard.findings.noDates.one": "role missing dates — a gap the recruiter notices",
    "dashboard.findings.noDates.other": "roles missing dates — a gap the recruiter notices",
    "dashboard.findings.noEv.one": "skill without evidence — back it up or drop it",
    "dashboard.findings.noEv.other": "skills without evidence — back them up or drop them",

    // ── Staging cell ──────────────────────────────────────────────────────────
    "dashboard.staging.pending": "items from the intake await your decision",
    "dashboard.staging.review": "review →",

    // ── Sources cell ──────────────────────────────────────────────────────────
    "dashboard.sources.emptyName": "No sources connected",
    "dashboard.sources.emptyFacts":
      "Dump material in Import and it will be recorded here, with what each one contributed.",
    "dashboard.sources.emptyCta": "Dump what I have →",
    "dashboard.source.chars": "characters",
    "dashboard.source.read": "read {rel}",
    "dashboard.source.extracted": "extracted — check staging",
    "dashboard.source.static": "static source",

    // ── Source kind labels (kindLabel) ────────────────────────────────────────
    "dashboard.kind.paste": "pasted text",
    "dashboard.kind.pdf": "PDF",
    "dashboard.kind.docx": "DOCX",
    "dashboard.kind.image": "screenshot",
    "dashboard.kind.url": "portfolio",
    "dashboard.kind.github": "GitHub",
    "dashboard.kind.manual": "manual",

    // ── Relative time (rel) — {n} is the number ───────────────────────────────
    "dashboard.rel.now": "just now",
    "dashboard.rel.min": "{n} min ago",
    "dashboard.rel.hour": "{n} h ago",
    "dashboard.rel.day.one": "{n} day ago",
    "dashboard.rel.day.other": "{n} days ago",
    "dashboard.rel.week": "{n} wk ago",
    "dashboard.rel.month.one": "{n} month ago",
    "dashboard.rel.month.other": "{n} months ago",
    "dashboard.rel.year.one": "{n} year ago",
    "dashboard.rel.year.other": "{n} years ago",
    // ── Forja v2 (panel-datos) ──
    "dashboard.v2.fuentePrefix": "source: ",
    "dashboard.v2.kpi.items": "Items in the master",
    "dashboard.v2.kpi.variants": "Variants",
    "dashboard.v2.kpi.verified": "Verified items",
    "dashboard.v2.kpi.verifiedNote": "{v} of {n} with evidence",
    "dashboard.v2.kpi.sources": "Sources loaded",
    "dashboard.v2.kpi.updated": "Last update",
    "dashboard.v2.fuente.master": "master",
    "dashboard.v2.fuente.variants": "variants",
    "dashboard.v2.fuente.evidence": "master · evidence",
    "dashboard.v2.fuente.sources": "sources",
    "dashboard.v2.fuente.updated": "variants · sources",
    "dashboard.v2.fuente.demo": "local mock · sample",
    "dashboard.v2.hero.over": "Your next variant",
    "dashboard.v2.hero.title": "Paste the offer. Corpus builds it.",
    "dashboard.v2.hero.sub": "Every line comes from your master and carries its source. Nothing without backing gets in.",
    "dashboard.v2.hero.new": "New variant",
    "dashboard.v2.hero.import": "Import",
    "dashboard.v2.hero.review": "Review",
    "dashboard.v2.hero.reviewN": "Review · {n} pending",
    "dashboard.v2.verif.title": "Master evidence",
    "dashboard.v2.verif.sub": "items with verified evidence",
    "dashboard.v2.verif.center": "{v} of {n}",
    "dashboard.v2.verif.emptyT": "No items to measure",
    "dashboard.v2.tipos.title": "The master by type",
    "dashboard.v2.tipos.sub": "items per block type",
    "dashboard.v2.tipos.chart": "Master items by type",
    "dashboard.v2.tipos.emptyT": "No items yet",
    "dashboard.v2.tipo.basics": "Contact",
    "dashboard.v2.tipo.summary": "Summary",
    "dashboard.v2.tipo.work": "Roles",
    "dashboard.v2.tipo.bullet": "Bullets",
    "dashboard.v2.tipo.education": "Education",
    "dashboard.v2.tipo.project": "Projects",
    "dashboard.v2.tipo.skill": "Skills",
    "dashboard.v2.tipo.certification": "Certifications",
    "dashboard.v2.tipo.reference": "References",
    "dashboard.v2.serie.title": "Variants per month",
    "dashboard.v2.serie.sub": "by the month of their last edit",
    "dashboard.v2.serie.chart": "Variants per month of last edit",
    "dashboard.v2.serie.emptyT": "No series yet",
    "dashboard.v2.serie.emptyB": "It is drawn once variants were edited in at least two different months.",
    "dashboard.v2.recent.title": "Recent variants",
    "dashboard.v2.recent.seeAll": "See all",
    "dashboard.v2.sources.title": "Sources",
    "dashboard.v2.sources.seeAll": "See sources",
    // ── Forja v2 (panel-datos) ──
    "dashboard.v2.tipo.language": "Languages",
    "dashboard.v2.tipo.link": "Links",
    "dashboard.v2.tipo.publication": "Publications",
    "dashboard.v2.tipo.award": "Awards",
    "dashboard.v2.tipo.volunteer": "Volunteering",
  } as Record<string, string>,
} as const;
