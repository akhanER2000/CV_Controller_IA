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

    // Estado vacío
    "staging.emptyTitle": "Staging limpio.",
    "staging.emptyBody":
      "items entraron a tu master, cada uno con su origen. Lo descartado no se borra: queda en la papelera de la ingesta.",
    "staging.emptyCta": "Ver el master →",
    "staging.emptyFine": "Siguiente paso razonable: crear tu primera variante para un aviso concreto.",

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

    // Empty state
    "staging.emptyTitle": "Staging clear.",
    "staging.emptyBody":
      "items entered your master, each with its origin. Discards aren't deleted: they sit in the intake trash.",
    "staging.emptyCta": "See your master →",
    "staging.emptyFine": "Sensible next step: create your first variant for a specific posting.",

    // Errors
    "staging.errRead": "Couldn't read your staging.",
    "staging.errAccept": "Couldn't complete that.",
    "staging.errGeneric": "Error",
  } as Record<string, string>,
} as const;
