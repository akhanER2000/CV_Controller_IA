/* i18n · namespace "editor". Claves planas con prefijo "editor.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "editor". */
export const editor = {
  es: {
    // Barra superior de la variante.
    "editor.backToVariants": "← Variantes",
    "editor.nameAria": "Nombre de la variante",
    "editor.defaultVariantName": "Variante",

    // Barra de estado (#edState). stIdle = reposo; el resto son flashes efímeros.
    "editor.stIdle": "al día · guardado",
    "editor.stSavedItem": "guardado en esta variante",
    "editor.stSaveItemErr": "no se pudo guardar el cambio",
    "editor.stSaved": "guardado",
    "editor.stSaveErr": "no se pudo guardar",
    "editor.stAddErr": "no se pudo añadir el item",
    "editor.stRemoved": "quitado de la variante",
    "editor.stAdded": "añadido a la variante",
    "editor.stShown": "mostrado en esta variante",
    "editor.stHidden": "oculto en esta variante",
    "editor.stReverted": "override revertido — vuelve a seguir al master",
    "editor.stOvrSaved": "override guardado — solo en esta variante",
    "editor.stReordered": "viñeta reordenada",
    "editor.stPdfLocal": "el PDF se genera del mismo estado que ves — sin sorpresas",
    "editor.stPdfGen": "generando PDF…",
    "editor.stPdfDone": "PDF descargado ✓",
    "editor.stPdfErr": "no se pudo generar el PDF",

    // Pestañas de columna (móvil) y su aria.
    "editor.tabMaster": "Master",
    "editor.tabThis": "Esta variante",
    "editor.tabPreview": "Preview",
    "editor.tabsAria": "Vista de columna",

    // Columna Master (biblioteca).
    "editor.libOverline": "Master",
    "editor.libCount": "{n} items — tu biblioteca",
    "editor.libSearchPlaceholder": "Buscar en tu master…",
    "editor.libSearchAria": "Buscar en tu master",
    "editor.groupSummary": "Resumen",
    "editor.groupWorkBullets": "Experiencia · viñetas",
    "editor.groupSkills": "Skills",
    "editor.groupProjects": "Proyectos",
    "editor.groupEducation": "Educación",
    "editor.libFootA": "Aquí vive todo. La variante solo",
    "editor.libFootRef": "referencia",
    "editor.libFootB": "— si editas el master, las variantes se actualizan solas.",

    // Columna central (composición de la variante).
    "editor.midOverline": "Esta variante",
    "editor.reading": "leyendo…",
    "editor.midN": "{n} referencias · {m} overrides",
    "editor.objLabel": "Título objetivo",
    "editor.objLabelHint": "— el campo que más pesa",
    "editor.objPlaceholder": "p. ej. Backend Engineer",
    "editor.objHintA": "Si coincide con el título del aviso:",
    "editor.objHintBold": "10,6× más entrevistas",
    "editor.objHintB":
      "[Jobscan, 2,5M postulaciones]. Honesto y con tu cargo real al lado: «Backend Engineer (Ingeniero de Software III)».",
    "editor.groupExperience": "Experiencia",
    "editor.datesFromMaster": "las fechas vienen del master",
    "editor.removeRoleTitle": "quitar el rol (y sus viñetas) de la variante",
    "editor.groupSkillsFull": "Habilidades",
    "editor.skillItemsCount": "{n} items",
    "editor.removeTitle": "quitar",
    "editor.removeFromVariant": "quitar de la variante",
    "editor.addToVariant": "añadir a la variante",

    // Estado vacío de la variante.
    "editor.emptyOverline": "Variante vacía",
    "editor.emptyLine1": "Elige del master qué cuenta esta variante.",
    "editor.emptyLine2A": "Pulsa",
    "editor.emptyLine2B": "en la biblioteca — nada se copia: se referencia.",

    // Viñeta / item de texto (acciones y override).
    "editor.gripTitle": "arrastra para reordenar (o usa las flechas ↑ ↓)",
    "editor.gripAria": "Reordenar viñeta. Usa las flechas arriba y abajo para mover.",
    "editor.hideTitle": "ocultar en esta variante",
    "editor.show": "mostrar",
    "editor.hide": "👁 ocultar",
    "editor.tuneTitle": "afinar solo aquí",
    "editor.tune": "afinar",
    "editor.original": "original:",
    "editor.revert": "revertir",

    // Columna de preview (el preview ES el PDF) + rayos-X.
    "editor.segAria": "Vista del documento",
    "editor.viewDoc": "Documento",
    "editor.viewRaw": "Cómo lo lee el ATS",
    "editor.pageLabel": "pág {a} / {b}",
    "editor.pagesWarn": "⚠ {n} páginas — la página 3 no existe para el reclutador [Ladders]",
    "editor.pageNum": "pág {n}",
    "editor.previewFoot":
      "El preview ES el PDF: mismo motor, mismos cortes de página. Si el preview miente, el producto miente.",
    "editor.xrayLegend": "texto extraído del PDF — esto es lo que indexa el reclutador",
  } as Record<string, string>,
  en: {
    // Variant top bar.
    "editor.backToVariants": "← Variants",
    "editor.nameAria": "Variant name",
    "editor.defaultVariantName": "Variant",

    // Status bar (#edState). stIdle = at rest; the rest are ephemeral flashes.
    "editor.stIdle": "up to date · saved",
    "editor.stSavedItem": "saved in this variant",
    "editor.stSaveItemErr": "couldn't save the change",
    "editor.stSaved": "saved",
    "editor.stSaveErr": "couldn't save",
    "editor.stAddErr": "couldn't add the item",
    "editor.stRemoved": "removed from the variant",
    "editor.stAdded": "added to the variant",
    "editor.stShown": "shown in this variant",
    "editor.stHidden": "hidden in this variant",
    "editor.stReverted": "override reverted — follows the master again",
    "editor.stOvrSaved": "override saved — this variant only",
    "editor.stReordered": "bullet reordered",
    "editor.stPdfLocal": "the PDF is built from the same state you see — no surprises",
    "editor.stPdfGen": "generating PDF…",
    "editor.stPdfDone": "PDF downloaded ✓",
    "editor.stPdfErr": "couldn't generate the PDF",

    // Column tabs (mobile) and their aria.
    "editor.tabMaster": "Master",
    "editor.tabThis": "This variant",
    "editor.tabPreview": "Preview",
    "editor.tabsAria": "Column view",

    // Master column (library).
    "editor.libOverline": "Master",
    "editor.libCount": "{n} items — your library",
    "editor.libSearchPlaceholder": "Search your master…",
    "editor.libSearchAria": "Search your master",
    "editor.groupSummary": "Summary",
    "editor.groupWorkBullets": "Experience · bullets",
    "editor.groupSkills": "Skills",
    "editor.groupProjects": "Projects",
    "editor.groupEducation": "Education",
    "editor.libFootA": "Everything lives here. The variant only",
    "editor.libFootRef": "references",
    "editor.libFootB": "— edit the master and variants update on their own.",

    // Center column (variant composition).
    "editor.midOverline": "This variant",
    "editor.reading": "reading…",
    "editor.midN": "{n} references · {m} overrides",
    "editor.objLabel": "Target title",
    "editor.objLabelHint": "— the field that weighs most",
    "editor.objPlaceholder": "e.g. Backend Engineer",
    "editor.objHintA": "If it matches the posting's title:",
    "editor.objHintBold": "10.6× more interviews",
    "editor.objHintB":
      "[Jobscan, 2.5M applications]. Honest, with your real title next to it: 'Backend Engineer (Software Engineer III)'.",
    "editor.groupExperience": "Experience",
    "editor.datesFromMaster": "dates come from the master",
    "editor.removeRoleTitle": "remove the role (and its bullets) from the variant",
    "editor.groupSkillsFull": "Skills",
    "editor.skillItemsCount": "{n} items",
    "editor.removeTitle": "remove",
    "editor.removeFromVariant": "remove from the variant",
    "editor.addToVariant": "add to the variant",

    // Empty variant state.
    "editor.emptyOverline": "Empty variant",
    "editor.emptyLine1": "Choose from the master what this variant tells.",
    "editor.emptyLine2A": "Press",
    "editor.emptyLine2B": "in the library — nothing is copied: it's referenced.",

    // Bullet / text item (actions and override).
    "editor.gripTitle": "drag to reorder (or use the ↑ ↓ arrows)",
    "editor.gripAria": "Reorder bullet. Use the up and down arrows to move.",
    "editor.hideTitle": "hide in this variant",
    "editor.show": "show",
    "editor.hide": "👁 hide",
    "editor.tuneTitle": "tune here only",
    "editor.tune": "tune",
    "editor.original": "original:",
    "editor.revert": "revert",

    // Preview column (the preview IS the PDF) + X-ray.
    "editor.segAria": "Document view",
    "editor.viewDoc": "Document",
    "editor.viewRaw": "How the ATS reads it",
    "editor.pageLabel": "page {a} / {b}",
    "editor.pagesWarn": "⚠ {n} pages — page 3 doesn't exist to the recruiter [Ladders]",
    "editor.pageNum": "page {n}",
    "editor.previewFoot":
      "The preview IS the PDF: same engine, same page breaks. If the preview lies, the product lies.",
    "editor.xrayLegend": "text extracted from the PDF — this is what the recruiter's search indexes",
  } as Record<string, string>,
} as const;
