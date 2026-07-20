/* i18n · namespace "staging". Claves planas con prefijo "staging.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "staging". */
export const staging = {
  es: {
    "staging.microStep": "INGESTA · PASO 2 DE 2 — REVISIÓN",
    "staging.title": "Staging",

    // Contadores de cabecera
    "staging.pending": "pendientes",
    "staging.toMaster": "al master",
    "staging.discarded": "descartados",

    // Filtro por verificación
    "staging.filterAria": "Filtrar por verificación",
    "staging.filterAll": "todos",
    "staging.filterVerified": "verificado",
    "staging.filterPartial": "parcial",
    "staging.filterNone": "sin evidencia",

    // Estado de carga / lead
    "staging.loading": "Leyendo tu staging…",
    "staging.lead1": "Nada de esto está en tu master todavía. Cada item cita su origen — ",
    "staging.leadOpen": "ábrelo",
    "staging.lead2": " antes de aceptar lo que no te suene. Los lotes solo tocan lo ",
    "staging.leadVerified": "verificado",
    "staging.lead3": ": lo demás pasa por tus ojos, uno a uno.",
    "staging.batchAccepting": "Aceptando…",
    "staging.batchAccept": "Aceptar todo lo verificado ({n})",
    "staging.sourceParamNote":
      "Estás viendo solo los items de la fuente desde la que llegaste. Cada uno dice de dónde viene — ábrelo antes de aceptar.",
    "staging.sourceParamAll": "Ver toda la cola",

    // El lote deja fuera por DOS motivos, y dice cuántos por cada uno. Verificado
    // detecta invención, no repetición: un duplicado está perfectamente verificado.
    "staging.batchOutDup": "{n} item{s} quedan fuera por posible duplicado — revísalos.",
    "staging.batchOutDoubt": "{n} item{s} quedan fuera por duda de clasificación — revísalos.",
    "staging.batchPartial":
      "Entraron {n} al master antes de que algo fallara; el resto sigue en la cola.",

    // Posible duplicado (§A2) — se marca y se explica; lo resuelve el usuario
    "staging.dupChip": "⚠ posible duplicado",
    "staging.dupOf": "⚠ posible duplicado de:",
    "staging.dupLevel_baja": "sospecha baja",
    "staging.dupLevel_media": "sospecha media",
    "staging.dupLevel_alta": "sospecha alta",
    "staging.dupReview": "comparar las dos",
    "staging.dupClose": "cerrar la comparación",
    "staging.dupGone":
      "La otra versión ya no está en la cola: la aceptaste o la descartaste. Decide esta por su cuenta.",
    "staging.dupThis": "esta versión",
    "staging.dupOther": "la otra versión",
    "staging.dupEmpty": "— vacío —",
    "staging.dupPick": "Elige campo a campo con qué te quedas. Nada se decide solo.",
    "staging.dupKeepThis": "quedarme con esta",
    "staging.dupKeepOther": "quedarme con la otra",
    "staging.dupMerge": "fusionar lo elegido",
    "staging.dupBusy": "resolviendo…",
    "staging.errDup": "No se pudo resolver el duplicado.",

    // Grupo de habilidades disfrazado de proyecto (§A1)
    "staging.skillGroupChip": "¿grupo de habilidades?",
    "staging.skillGroupMove": "moverlo a Skills",
    "staging.skillGroupKeep": "es un proyecto",
    "staging.skillGroupAll": "Mover los {n} a Skills",
    "staging.skillGroupAllBusy": "Moviendo…",

    // Encabezados de grupo
    "staging.groupProfile": "Perfil",
    "staging.groupExperience": "Experiencia",
    "staging.groupSkills": "Skills",
    "staging.groupProjects": "Proyectos — un CV no es un volcado de GitHub: elige",
    "staging.groupEducation": "Educación",

    // Insignia de verificación (badge) y origen
    "staging.ver_ok": "verificado",
    "staging.ver_partial": "parcial",
    "staging.ver_none": "sin evidencia",
    "staging.source": "origen",
    "staging.sourceFallback": "texto pegado",
    "staging.noFragment": "Sin fragmento de origen — revísalo antes de aceptar.",

    // Acciones por item
    "staging.accept": "✓ aceptar",
    "staging.discard": "× descartar",

    // Clasificación en duda (§C1): ¿viñeta o habilidad?
    "staging.doubtChip": "¿habilidad?",
    "staging.doubtWhy": "Parece una etiqueta de habilidad, no un logro.",
    "staging.doubtIsSkill": "es habilidad",
    "staging.doubtIsBullet": "es viñeta",
    "staging.skillFrom": "de:",

    // Fechas (§C2)
    "staging.dateMissing": "falta fecha",
    "staging.dateInvalid": "fecha imposible",
    "staging.dateInvalidHint": "el fin va antes del inicio — corrígela",
    "staging.dateAdd": "añadir fecha",
    "staging.datePlaceholder": "ej. mar 2022 – hoy",
    "staging.dateSave": "guardar",
    "staging.dateSaving": "guardando…",

    // Estado vacío
    "staging.emptyTitle": "Staging limpio.",
    "staging.emptyBody":
      "items entraron a tu master, cada uno con su origen. Lo descartado no se borra: queda en la papelera de la ingesta.",
    "staging.emptyCta": "Ver el master →",
    // Línea fina genérica: la que se usa cuando NO se sabe cuántas variantes hay.
    // No promete «la primera» porque no lo sabe.
    "staging.emptyFine": "Una variante es la vista de tu master para un aviso concreto: nada se copia, se elige.",

    // El remate — de «tengo los datos» a «tengo un CV»
    // «tiene ya» (total), no «entraron» (este lote): la línea de arriba cuenta lo
    // aceptado ahora y esta el tamaño del master. Sin esa palabra, 15 y 16 juntos
    // parecen una contradicción en vez de dos hechos distintos.
    "staging.remateMaster": "Listo — tu master tiene ya {n} item{s}.",
    "staging.remateCta": "Crear mi CV →",
    "staging.remateCtaFirst": "Crear mi primer CV con IA →",
    "staging.remateFineFirst":
      "Aún no tienes ninguna. En la pantalla siguiente describes el aviso y la IA arma la primera desde tu master — la revisas tú antes de que sea nada.",
    "staging.remateFineMore":
      "Ya tienes {n} variante{s}: la siguiente sale del mismo master, para el aviso que le digas.",

    // Errores
    "staging.errRead": "No se pudo leer el staging.",
    "staging.errAccept": "No se pudo.",
    "staging.errGeneric": "Error",
  } as Record<string, string>,
  en: {
    "staging.microStep": "INTAKE · STEP 2 OF 2 — REVIEW",
    "staging.title": "Staging",

    // Header counters
    "staging.pending": "pending",
    "staging.toMaster": "to master",
    "staging.discarded": "discarded",

    // Filter by verification
    "staging.filterAria": "Filter by verification",
    "staging.filterAll": "all",
    "staging.filterVerified": "verified",
    "staging.filterPartial": "partial",
    "staging.filterNone": "no evidence",

    // Loading / lead
    "staging.loading": "Reading your staging…",
    "staging.lead1": "None of this is in your master yet. Every item cites its source — ",
    "staging.leadOpen": "open it",
    "staging.lead2": " before accepting anything that doesn't ring true. Batches only touch ",
    "staging.leadVerified": "verified",
    "staging.lead3": " items: the rest goes through your eyes, one by one.",
    "staging.batchAccepting": "Accepting…",
    "staging.batchAccept": "Accept everything verified ({n})",
    "staging.sourceParamNote":
      "You're seeing only the items from the source you came in from. Each one names where it came from — open it before accepting.",
    "staging.sourceParamAll": "See the whole queue",

    // The batch leaves items out for TWO reasons, and says how many for each.
    // Verified detects invention, not repetition: a duplicate is perfectly verified.
    "staging.batchOutDup": "{n} item{s} left out as possible duplicates — review them.",
    "staging.batchOutDoubt": "{n} item{s} left out over a classification doubt — review them.",
    "staging.batchPartial":
      "{n} made it into your master before something failed; the rest is still in the queue.",

    // Possible duplicate (§A2) — marked and explained; the user resolves it
    "staging.dupChip": "⚠ possible duplicate",
    "staging.dupOf": "⚠ possible duplicate of:",
    "staging.dupLevel_baja": "low suspicion",
    "staging.dupLevel_media": "medium suspicion",
    "staging.dupLevel_alta": "high suspicion",
    "staging.dupReview": "compare the two",
    "staging.dupClose": "close the comparison",
    "staging.dupGone":
      "The other version is no longer in the queue: you accepted or discarded it. Decide this one on its own.",
    "staging.dupThis": "this version",
    "staging.dupOther": "the other version",
    "staging.dupEmpty": "— empty —",
    "staging.dupPick": "Pick field by field what you keep. Nothing is decided for you.",
    "staging.dupKeepThis": "keep this one",
    "staging.dupKeepOther": "keep the other one",
    "staging.dupMerge": "merge what I picked",
    "staging.dupBusy": "resolving…",
    "staging.errDup": "Couldn't resolve the duplicate.",

    // Skill group disguised as a project (§A1)
    "staging.skillGroupChip": "a skill group?",
    "staging.skillGroupMove": "move it to Skills",
    "staging.skillGroupKeep": "it's a project",
    "staging.skillGroupAll": "Move all {n} to Skills",
    "staging.skillGroupAllBusy": "Moving…",

    // Group headings
    "staging.groupProfile": "Profile",
    "staging.groupExperience": "Experience",
    "staging.groupSkills": "Skills",
    "staging.groupProjects": "Projects — a resume isn't a GitHub dump: choose",
    "staging.groupEducation": "Education",

    // Verification badge and source
    "staging.ver_ok": "verified",
    "staging.ver_partial": "partial",
    "staging.ver_none": "no evidence",
    "staging.source": "source",
    "staging.sourceFallback": "pasted text",
    "staging.noFragment": "No source fragment — review it before accepting.",

    // Per-item actions
    "staging.accept": "✓ accept",
    "staging.discard": "× discard",

    // Classification doubt (§C1): bullet or skill?
    "staging.doubtChip": "a skill?",
    "staging.doubtWhy": "Looks like a skill tag, not an achievement.",
    "staging.doubtIsSkill": "it's a skill",
    "staging.doubtIsBullet": "it's a bullet",
    "staging.skillFrom": "from:",

    // Dates (§C2)
    "staging.dateMissing": "missing date",
    "staging.dateInvalid": "impossible date",
    "staging.dateInvalidHint": "end is before start — fix it",
    "staging.dateAdd": "add date",
    "staging.datePlaceholder": "e.g. Mar 2022 – present",
    "staging.dateSave": "save",
    "staging.dateSaving": "saving…",

    // Empty state
    "staging.emptyTitle": "Staging clear.",
    "staging.emptyBody":
      "items entered your master, each with its origin. Discards aren't deleted: they sit in the intake trash.",
    "staging.emptyCta": "See your master →",
    // Generic fine line: used when we DON'T know how many variants exist.
    // It doesn't promise "your first" because it doesn't know.
    "staging.emptyFine": "A variant is the view of your master for one specific posting: nothing is copied, it's chosen.",

    // The finish — from "I have the data" to "I have a resume"
    "staging.remateMaster": "Done — your master now holds {n} item{s}.",
    "staging.remateCta": "Create my resume →",
    "staging.remateCtaFirst": "Create my first resume with AI →",
    "staging.remateFineFirst":
      "You don't have one yet. On the next screen you describe the posting and the AI builds the first one from your master — you review it before it's anything.",
    "staging.remateFineMore":
      "You already have {n} variant{s}: the next one comes from the same master, for whatever posting you name.",

    // Errors
    "staging.errRead": "Couldn't read your staging.",
    "staging.errAccept": "Couldn't complete that.",
    "staging.errGeneric": "Error",
  } as Record<string, string>,
} as const;
