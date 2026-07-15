/* i18n · namespace "tailor". Claves planas con prefijo "tailor.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "tailor". */
export const tailor = {
  es: {
    // toolbar
    "tailor.toolbarNote": "sin score — tres respuestas honestas",

    // el aviso (columna izquierda)
    "tailor.jdLabel": "El aviso, tal cual",
    "tailor.jdPlaceholder": "Pega aquí la descripción del cargo — completa, sin limpiar.",
    "tailor.words": "{n} palabras",
    "tailor.useSample": "usar aviso de ejemplo",
    "tailor.compare": "Comparar con tu master",

    // log del análisis
    "tailor.logReading": "Leyendo el aviso — {n} palabras, {r} exigencias detectadas",
    "tailor.logComparing": "Comparando contra 52 items del master…",
    "tailor.logSearching": "Buscando las exigencias en tus viñetas, skills y repos…",

    // anuncio del resultado (live region)
    "tailor.resultMsg":
      "Comparación lista. {have} ya están en esta variante, {add} en tu master, {gap} sin evidencia en ninguna parte.",

    // hint (nada que comparar todavía)
    "tailor.hintOverline": "Todavía nada que comparar",
    "tailor.hintBefore": "Pega el aviso y Corpus lo contrasta contra tus",
    "tailor.hintItems": "52 items",
    "tailor.hintAfter": "— los del master, no los de esta variante.",
    "tailor.hintLine2": "La respuesta son hechos en tres grupos, no un porcentaje.",

    // título alineado
    "tailor.titlePre": "El aviso pide",
    "tailor.titleMid": "tu variante dice",
    "tailor.titleAlignedValue": "«Backend Engineer (Ingeniero de Software III)»",
    "tailor.titleCurrent": "«Backend Developer»",
    "tailor.titleWhy": "título alineado = 10,6× entrevistas [Jobscan]",
    "tailor.titleDone": "✓ título alineado — honesto: tu cargo real queda al lado",
    "tailor.titleUse": "Usar el del aviso",

    // grupo 1 — ya está
    "tailor.haveTitle": "Ya está en esta variante",

    // grupo 2 — en el master, no en la variante
    "tailor.addTitle": "Lo tienes en el master, no en esta variante",
    "tailor.addWhy": "un clic y entra — es tuyo, es honesto",
    "tailor.addBtn": "añadir a la variante",
    "tailor.addDone": "✓ en la variante",

    // grupo 3 — no está en ninguna parte
    "tailor.gapTitle": "No está en ninguna parte",
    "tailor.gapWhy": "y no vamos a inventarlo",
    "tailor.gapReframeBtn": "reencuadrar con lo que sí tienes",
    "tailor.gapNote":
      "Aquí no hay botón de «añadir». Tres salidas reales: apréndelo, busca en tu master evidencia parcial que reencuadrar, o asume que este aviso no calza contigo — también está bien.",

    // reformulaciones
    "tailor.refTitle": "Reformulaciones propuestas",
    "tailor.refCount": "{n} · una a una, nunca en bloque",
    "tailor.propLabel": "Propuesta {n}",
    "tailor.verSavedOrigin": "verificado · origen: tú",
    "tailor.verOk": "verificado",
    "tailor.verNone": "no verificado",
    "tailor.colOriginal": "Original (master)",
    "tailor.colProposed": "Propuesto para esta variante",

    // pie de cada propuesta
    "tailor.footAccepted": "✓ aplicada como override — el original sigue en el master, revertible en el editor",
    "tailor.footRejected": "rechazada — no se guarda nada",
    "tailor.footEditing": "edítala — al guardar queda como origen: tú",
    "tailor.footSaveMine": "guardar como mía",
    "tailor.footSaved": "✓ guardada con origen manual",
    "tailor.footIdleNote": "si aceptas, queda como override — reversible, con el original a la vista",
    "tailor.footAccept": "aceptar",
    "tailor.footEditYou": "editarlo tú",
    "tailor.footReject": "rechazar",
  } as Record<string, string>,
  en: {
    // toolbar
    "tailor.toolbarNote": "no score — three honest answers",

    // the posting (left column)
    "tailor.jdLabel": "The posting, as is",
    "tailor.jdPlaceholder": "Paste the job description here — complete, uncleaned.",
    "tailor.words": "{n} words",
    "tailor.useSample": "use a sample posting",
    "tailor.compare": "Compare with your master",

    // analysis log
    "tailor.logReading": "Reading the posting — {n} words, {r} requirements detected",
    "tailor.logComparing": "Comparing against your 52 master items…",
    "tailor.logSearching": "Looking for the requirements in your bullets, skills and repos…",

    // result announcement (live region)
    "tailor.resultMsg":
      "Comparison ready. {have} already in this variant, {add} in your master, {gap} with no evidence anywhere.",

    // hint (nothing to compare yet)
    "tailor.hintOverline": "Nothing to compare yet",
    "tailor.hintBefore": "Paste the posting and Corpus compares it against your",
    "tailor.hintItems": "52 items",
    "tailor.hintAfter": "— the master's, not this variant's.",
    "tailor.hintLine2": "The answer is facts in three groups, not a percentage.",

    // aligned title
    "tailor.titlePre": "The posting asks for",
    "tailor.titleMid": "your variant says",
    "tailor.titleAlignedValue": "«Backend Engineer (Software Engineer III)»",
    "tailor.titleCurrent": "«Backend Developer»",
    "tailor.titleWhy": "aligned title = 10.6× interviews [Jobscan]",
    "tailor.titleDone": "✓ title aligned — honest: your real title stays beside it",
    "tailor.titleUse": "Use the posting's",

    // group 1 — already in
    "tailor.haveTitle": "Already in this variant",

    // group 2 — in the master, not in the variant
    "tailor.addTitle": "In your master, not in this variant",
    "tailor.addWhy": "one click and it's in — it's yours, it's honest",
    "tailor.addBtn": "add to the variant",
    "tailor.addDone": "✓ in the variant",

    // group 3 — nowhere in your record
    "tailor.gapTitle": "Nowhere in your record",
    "tailor.gapWhy": "and we won't invent it",
    "tailor.gapReframeBtn": "reframe with what you do have",
    "tailor.gapNote":
      "There's no «add» button here. Three real ways out: learn it, look in your master for partial evidence to reframe, or accept this posting isn't your fit — that's fine too.",

    // rewrites
    "tailor.refTitle": "Proposed rewrites",
    "tailor.refCount": "{n} · one at a time, never in bulk",
    "tailor.propLabel": "Proposal {n}",
    "tailor.verSavedOrigin": "verified · origin: you",
    "tailor.verOk": "verified",
    "tailor.verNone": "unverified",
    "tailor.colOriginal": "Original (master)",
    "tailor.colProposed": "Proposed for this variant",

    // footer of each proposal
    "tailor.footAccepted": "✓ applied as an override — the original stays in your master, revertible in the editor",
    "tailor.footRejected": "rejected — nothing is saved",
    "tailor.footEditing": "edit it — on save it becomes origin: you",
    "tailor.footSaveMine": "save as mine",
    "tailor.footSaved": "✓ saved with manual origin",
    "tailor.footIdleNote": "if you accept, it becomes an override — reversible, with the original in view",
    "tailor.footAccept": "accept",
    "tailor.footEditYou": "edit it yourself",
    "tailor.footReject": "reject",
  } as Record<string, string>,
} as const;
