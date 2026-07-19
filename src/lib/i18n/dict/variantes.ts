/* i18n · namespace "variantes". Claves planas con prefijo "variantes.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "variantes". */
export const variantes = {
  es: {
    "variantes.loading": "Leyendo tus variantes…",

    // Lead ({n} + {s} se componen con .replace en la pantalla).
    "variantes.leadCount": "{n} variante{s}, un solo master.",
    "variantes.leadBody":
      "Cada una referencia tus datos — no los copia. Cuando el master cambia, las variantes lo saben; los overrides tuyos siempre ganan.",

    // Panel de creación — con IA.
    "variantes.aiLabel": "Crear con IA — un punto de partida",
    "variantes.aiPlaceholder": "Describe el rol o el enfoque: «para Backend Engineer», «un CV completo y honesto»…",
    "variantes.aiCreate": "Crear con IA",
    "variantes.aiCreating": "Armando…",
    "variantes.aiHint":
      "La IA elige del master lo que encaja y propone un título. Tú lo revisas antes de nada — no se aplica en silencio.",

    // Panel de creación — manual.
    "variantes.nameAria": "Nombre de la nueva variante",
    "variantes.namePlaceholder": "Nombre (opcional): «Backend — Fintech»",
    "variantes.manualCreate": "Nueva variante (vacía)",
    "variantes.manualCreating": "Creando…",
    "variantes.manualHint": "Empiezas de cero y eliges del master.",

    // Errores y nota de modo local.
    "variantes.errManual": "No se pudo crear la variante. Intenta de nuevo.",
    "variantes.errAi": "La IA no pudo armar la variante. Intenta otra descripción o crea una manual.",
    "variantes.aiLocalNote":
      "Modo local: la IA real se activa con Supabase configurado. Esto es una vista de la maqueta.",

    // Tarjeta de resultado de IA ({name} va literal; <b> envuelve aiResultBodyBold).
    "variantes.aiResultOverline": "Variante creada — revísala",
    "variantes.aiResultBody1": "quedó armada como ",
    "variantes.aiResultBodyBold": "punto de partida",
    "variantes.aiResultBody2": ". Ábrela y ajusta lo que quieras — nada se tocó en tu master.",
    "variantes.aiResultNotePrefix": "Nota de la IA: ",
    "variantes.aiResultOpen": "Abrir para revisar →",

    // Filas de la lista.
    "variantes.dotTitle": "desactualizada",
    "variantes.pdfBtn": "PDF ↓",
    "variantes.pdfTitle": "El PDF sale del mismo estado que el preview",
    "variantes.metaOutdated": "desactualizada — el master cambió",
    "variantes.metaUpToDate": "al día",
    "variantes.openLink": "abrir →",
    "variantes.objectivePrefix": "objetivo: ",
    "variantes.noObjective": "sin objetivo definido",

    // Gestión de filas: renombrar, duplicar, eliminar, chip «borrador».
    "variantes.renameAria": "Nombre de la variante",
    "variantes.renameTitle": "clic para renombrar",
    "variantes.rowDuplicate": "Duplicar variante",
    "variantes.rowDuplicateShort": "duplicar",
    "variantes.rowDelete": "Eliminar variante",
    "variantes.rowDeleteShort": "eliminar",
    "variantes.draftChip": "borrador",
    "variantes.draftTitle": "Sin título objetivo ni items — es un punto de partida vacío.",
    "variantes.errDuplicate": "No se pudo duplicar la variante. Intenta de nuevo.",
    "variantes.announceDuplicated": "Variante «{nm}» duplicada.",
    "variantes.undoDeleted": "Variante «{nm}» eliminada",
    "variantes.undoDeletedOverrides": "Variante «{nm}» eliminada · se pierden {n} ajuste{s} propio{s}",

    // Panel de diferencias (variante desactualizada).
    "variantes.diffOverline": "Qué cambió en el master",
    "variantes.diffBody":
      "El master cambió después de la última vez que abriste esta variante. Revisa qué adoptar y qué mantener como override.",
    "variantes.diffUpdate": "Actualizar esta variante",
    "variantes.diffKeep": "Mantener como está (override)",
    "variantes.diffOpenEditor": "ver en el editor",

    // Estado vacío ({n} + {s} se componen con .replace).
    "variantes.emptyOverline": "Sin variantes todavía",
    "variantes.emptyHasMasterLine1": "Tu master tiene {n} item{s}.",
    "variantes.emptyHasMasterLine2": "Una variante es la vista de 2 páginas para un rol.",
    "variantes.emptyNoMasterLine1": "Aún no hay master del que salgan variantes.",
    "variantes.emptyNoMasterLine2": "Vuelca tu carrera primero; la variante es una vista de ella.",
    "variantes.emptyHasMasterBody":
      "Elige qué cuenta, ajusta el título al aviso, y el PDF sale igual al preview. Empieza por el rol al que más postulas — o deja que la IA arme un punto de partida.",
    "variantes.emptyNoMasterBody":
      "Una variante referencia tu master — no lo copia. Sin master, no hay de dónde elegir.",
    "variantes.emptyDumpCta": "Volcar lo que tengo →",

    // Anuncios aria-live ({nm} se compone con .replace).
    "variantes.announceUpdated": "Variante «{nm}» actualizada con el master. Ahora está al día.",
    "variantes.announceKept": "Variante «{nm}»: override mantenido. Ahora está al día.",
    "variantes.announceAiCreated":
      "Variante «{nm}» creada con IA como punto de partida. Ábrela para revisarla.",
  } as Record<string, string>,
  en: {
    "variantes.loading": "Reading your variants…",

    "variantes.leadCount": "{n} variant{s}, one master.",
    "variantes.leadBody":
      "Each references your data — it doesn't copy it. When the master changes, variants know; your overrides always win.",

    "variantes.aiLabel": "Create with AI — a starting point",
    "variantes.aiPlaceholder": "Describe the role or the angle: 'for Backend Engineer', 'a complete, honest resume'…",
    "variantes.aiCreate": "Create with AI",
    "variantes.aiCreating": "Building…",
    "variantes.aiHint":
      "The AI picks what fits from your master and proposes a title. You review it before anything — nothing is applied silently.",

    "variantes.nameAria": "Name for the new variant",
    "variantes.namePlaceholder": "Name (optional): 'Backend — Fintech'",
    "variantes.manualCreate": "New variant (blank)",
    "variantes.manualCreating": "Creating…",
    "variantes.manualHint": "You start from scratch and pick from your master.",

    "variantes.errManual": "Couldn't create the variant. Try again.",
    "variantes.errAi": "The AI couldn't put the variant together. Try another description or create one manually.",
    "variantes.aiLocalNote":
      "Local mode: the real AI turns on once Supabase is configured. This is a mockup view.",

    "variantes.aiResultOverline": "Variant created — review it",
    "variantes.aiResultBody1": "is set up as a ",
    "variantes.aiResultBodyBold": "starting point",
    "variantes.aiResultBody2": ". Open it and adjust whatever you like — nothing was touched in your master.",
    "variantes.aiResultNotePrefix": "AI note: ",
    "variantes.aiResultOpen": "Open to review →",

    "variantes.dotTitle": "out of date",
    "variantes.pdfBtn": "PDF ↓",
    "variantes.pdfTitle": "The PDF comes from the same state as the preview",
    "variantes.metaOutdated": "out of date — the master changed",
    "variantes.metaUpToDate": "up to date",
    "variantes.openLink": "open →",
    "variantes.objectivePrefix": "target: ",
    "variantes.noObjective": "no target set",

    // Row management: rename, duplicate, delete, «draft» chip.
    "variantes.renameAria": "Variant name",
    "variantes.renameTitle": "click to rename",
    "variantes.rowDuplicate": "Duplicate variant",
    "variantes.rowDuplicateShort": "duplicate",
    "variantes.rowDelete": "Delete variant",
    "variantes.rowDeleteShort": "delete",
    "variantes.draftChip": "draft",
    "variantes.draftTitle": "No target title and no items — an empty starting point.",
    "variantes.errDuplicate": "Couldn't duplicate the variant. Try again.",
    "variantes.announceDuplicated": "Variant «{nm}» duplicated.",
    "variantes.undoDeleted": "Variant «{nm}» deleted",
    "variantes.undoDeletedOverrides": "Variant «{nm}» deleted · {n} of your own tweak{s} lost",

    "variantes.diffOverline": "What changed in the master",
    "variantes.diffBody":
      "The master changed since the last time you opened this variant. Review what to adopt and what to keep as an override.",
    "variantes.diffUpdate": "Update this variant",
    "variantes.diffKeep": "Keep as is (override)",
    "variantes.diffOpenEditor": "view in the editor",

    "variantes.emptyOverline": "No variants yet",
    "variantes.emptyHasMasterLine1": "Your master has {n} item{s}.",
    "variantes.emptyHasMasterLine2": "A variant is the 2-page view for one role.",
    "variantes.emptyNoMasterLine1": "There's no master yet for variants to come from.",
    "variantes.emptyNoMasterLine2": "Dump your career first; a variant is a view of it.",
    "variantes.emptyHasMasterBody":
      "Choose what it tells, match the title to the posting, and the PDF comes out exactly like the preview. Start with the role you apply to most — or let the AI put together a starting point.",
    "variantes.emptyNoMasterBody":
      "A variant references your master — it doesn't copy it. With no master, there's nothing to choose from.",
    "variantes.emptyDumpCta": "Dump what I have →",

    "variantes.announceUpdated": "Variant «{nm}» updated from the master. It's up to date now.",
    "variantes.announceKept": "Variant «{nm}»: override kept. It's up to date now.",
    "variantes.announceAiCreated":
      "Variant «{nm}» created with AI as a starting point. Open it to review.",
  } as Record<string, string>,
} as const;
