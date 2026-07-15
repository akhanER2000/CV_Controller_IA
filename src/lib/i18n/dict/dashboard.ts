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
  } as Record<string, string>,
} as const;
