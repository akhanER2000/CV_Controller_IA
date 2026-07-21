/* i18n · namespace "tailor". Claves planas con prefijo "tailor.". ES = referencia; EN = copy.md.

   ⚠ ESTE NAMESPACE SE VACIÓ EN LA COSTURA G. Las ~40 claves anteriores eran el
   copy de una maqueta: el aviso de ejemplo, los tres grupos (HAVE/ADD/GAP), las
   reformulaciones y sus cifras («52 items», «10,6× entrevistas», «~40.000 tx
   diarias»). Todas describían el análisis de una persona inventada y se pintaban
   como si fueran del usuario. No se «tradujeron»: se retiraron, con la pantalla
   que las mostraba. Ver la cabecera de TailorScreen.tsx.

   Las claves *void* de aquí abajo NO afirman nada sobre el usuario: sirven de
   introducción/estado previo (antes de pegar un aviso no hay análisis, y eso es
   cierto) y de salidas secundarias hacia lo que también funciona. Bajo ellas van
   las claves de la pantalla YA CABLEADA (entrada del aviso + tres grupos). */
export const tailor = {
  es: {
    // Barra superior.
    "tailor.toolbarNote": "sin score ni porcentaje · solo hechos",

    // Introducción / estado previo (antes de pegar un aviso: aún no hay análisis).
    "tailor.voidOverline": "Adaptar a un aviso",
    "tailor.voidTitle": "Todavía no hay ningún aviso que analizar.",
    "tailor.voidBody":
      "Pega el aviso y lo contrasto con tu master: respondo con hechos en tres grupos —lo que ya está en esta variante, lo que está en tu master y no en ella, y lo que no está en ninguna parte— y nunca con un score ni un porcentaje de match.",
    // La regla, no una disculpa.
    "tailor.voidEthic":
      "Lo que no esté en tu material no aparecerá como tuyo. Antes que un requisito inventado rotulado como algo que tienes, nada.",

    // Las salidas secundarias, que también funcionan.
    "tailor.voidNextOverline": "Lo que también puedes hacer",
    "tailor.voidFitNote":
      "Vive dentro del editor de esta variante. Mide el PDF real —el mismo que se descarga— y propone qué quitar, qué reordenar y qué acortar. Se acepta propuesta a propuesta; no se aplica nada solo.",
    "tailor.voidMasterCta": "Revisar tu master",
    "tailor.voidMasterNote":
      "De ahí sale todo lo que puede entrar en una variante. Cuanto más completo esté, menos huecos tendrás delante de un aviso.",

    // ── Pantalla CABLEADA · entrada del aviso ──────────────────────────────────
    "tailor.entryOverline": "El aviso",
    "tailor.entryTitle": "Pega la oferta a la que te postulas",
    "tailor.entryBody":
      "La leo, la contrasto con tu master y te respondo en tres grupos. Nunca invento: lo que no está en tu material no aparece como tuyo.",
    "tailor.tabPaste": "Pegar texto",
    "tailor.tabUrl": "Enlace",
    "tailor.tabFile": "Captura o PDF",
    "tailor.pastePlaceholder": "Pega aquí el texto del aviso…",
    "tailor.urlPlaceholder": "https://… la dirección del aviso",
    "tailor.urlHint":
      "Si el portal publica el aviso como datos estructurados (JobPosting), los leo exactos; si no, leo el texto de la página.",
    "tailor.fileHint":
      "Transcribo la captura o el PDF palabra por palabra antes de analizar —como en el volcado—. Sin esa transcripción no habría nada que verificar.",
    "tailor.filePick": "Elegir archivo",
    "tailor.fileUploading": "subiendo…",
    "tailor.analyze": "Analizar el aviso",
    "tailor.analyzing": "Leyendo el aviso…",
    "tailor.errAnalyze": "No se pudo analizar el aviso. Prueba a pegar el texto directamente.",
    "tailor.needText": "Necesito algo de texto del aviso: pégalo, sube una captura o pega el enlace.",
    "tailor.scoreNever": "Sin score ni porcentaje de match. Solo hechos que puedes comprobar.",

    // ── Resultado · los tres grupos ────────────────────────────────────────────
    "tailor.resultOverline": "El análisis, en tres grupos",
    "tailor.targetPrefix": "Puesto objetivo: ",
    "tailor.coversPrefix": "cubre: ",
    "tailor.offerCitePrefix": "del aviso: ",
    "tailor.groupHaveTitle": "Ya en esta variante",
    "tailor.groupHaveNote": "Lo que ya cuentas y el aviso valora. No hay nada que hacer: ya está.",
    "tailor.groupAddTitle": "En tu master, no en esta variante",
    "tailor.groupAddNote": "Lo tienes, pero fuera de esta variante. Un clic para añadirlo —sigue siendo tuyo—.",
    "tailor.groupGapTitle": "El aviso lo pide y no lo tienes",
    "tailor.groupGapNote":
      "No aparece en ninguna parte de tu master. Se te enseña porque es útil saberlo, pero no hay botón de añadir: añadir algo que no tienes sería mentir en tu CV.",
    "tailor.addBtn": "Añadir a la variante",
    "tailor.adding": "añadiendo…",
    "tailor.added": "añadido ✓",
    "tailor.errAdd": "No se pudo añadir. Intenta de nuevo.",
    "tailor.emptyGroups":
      "El aviso no coincidió con nada de tu master. Ni items que mostrar ni requisitos que cruzar; revisa que pegaste el aviso correcto.",

    // ── Reformulaciones · una a una ────────────────────────────────────────────
    "tailor.reformOverline": "Reformular para el aviso",
    "tailor.reformNote":
      "Alinea el fraseo con el aviso sin tocar los hechos. Original contra propuesto, uno a uno. Nada se aplica en bloque.",
    "tailor.reformOriginal": "actual",
    "tailor.reformProposed": "propuesto",
    "tailor.reformApply": "Aplicar",
    "tailor.reformApplying": "aplicando…",
    "tailor.reformApplied": "aplicado ✓",
    "tailor.reformErr": "No se aplicó: ",
    "tailor.notesPrefix": "Nota de la IA: ",
    "tailor.reAnalyze": "Analizar otro aviso",
  } as Record<string, string>,
  en: {
    // Top bar.
    "tailor.toolbarNote": "no score, no percentage · facts only",

    // Intro / pre-analysis state (before you paste a posting there's no analysis yet).
    "tailor.voidOverline": "Tailor to a posting",
    "tailor.voidTitle": "There's no posting to analyze yet.",
    "tailor.voidBody":
      "Paste the posting and I check it against your master: I answer with facts in three groups —what's already in this variant, what's in your master but not in it, and what's nowhere at all— and never with a score or a match percentage.",
    // The rule, not an apology.
    "tailor.voidEthic":
      "Whatever isn't in your material won't show up as yours. Rather than an invented requirement labelled as something you have, nothing.",

    // The secondary exits, which also work.
    "tailor.voidNextOverline": "What you can also do",
    "tailor.voidFitNote":
      "It lives inside this variant's editor. It measures the real PDF —the same one you download— and proposes what to drop, what to reorder and what to shorten. You accept one proposal at a time; nothing applies itself.",
    "tailor.voidMasterCta": "Review your master",
    "tailor.voidMasterNote":
      "Everything a variant can draw from lives there. The fuller it is, the fewer gaps a posting will find.",

    // ── Wired screen · posting entry ───────────────────────────────────────────
    "tailor.entryOverline": "The posting",
    "tailor.entryTitle": "Paste the posting you're applying to",
    "tailor.entryBody":
      "I read it, cross-check it against your master and answer in three groups. I never invent: whatever isn't in your material won't show up as yours.",
    "tailor.tabPaste": "Paste text",
    "tailor.tabUrl": "Link",
    "tailor.tabFile": "Screenshot or PDF",
    "tailor.pastePlaceholder": "Paste the posting text here…",
    "tailor.urlPlaceholder": "https://… the posting URL",
    "tailor.urlHint":
      "If the site publishes the posting as structured data (JobPosting), I read it exactly; otherwise I read the page text.",
    "tailor.fileHint":
      "I transcribe the screenshot or PDF word for word before analyzing —same as the dump—. Without that transcription there'd be nothing to verify.",
    "tailor.filePick": "Choose file",
    "tailor.fileUploading": "uploading…",
    "tailor.analyze": "Analyze the posting",
    "tailor.analyzing": "Reading the posting…",
    "tailor.errAnalyze": "Couldn't analyze the posting. Try pasting the text directly.",
    "tailor.needText": "I need some text from the posting: paste it, upload a screenshot or paste the link.",
    "tailor.scoreNever": "No score, no match percentage. Only facts you can check.",

    // ── Result · the three groups ──────────────────────────────────────────────
    "tailor.resultOverline": "The analysis, in three groups",
    "tailor.targetPrefix": "Target role: ",
    "tailor.coversPrefix": "covers: ",
    "tailor.offerCitePrefix": "from the posting: ",
    "tailor.groupHaveTitle": "Already in this variant",
    "tailor.groupHaveNote": "What you already tell and the posting values. Nothing to do: it's in.",
    "tailor.groupAddTitle": "In your master, not in this variant",
    "tailor.groupAddNote": "You have it, just outside this variant. One click to add it —still yours—.",
    "tailor.groupGapTitle": "The posting asks for it and you don't have it",
    "tailor.groupGapNote":
      "It's nowhere in your master. You're shown it because it's useful to know, but there's no add button: adding something you don't have would be lying on your resume.",
    "tailor.addBtn": "Add to the variant",
    "tailor.adding": "adding…",
    "tailor.added": "added ✓",
    "tailor.errAdd": "Couldn't add it. Try again.",
    "tailor.emptyGroups":
      "The posting didn't match anything in your master. No items to show and no requirements to cross-check; make sure you pasted the right posting.",

    // ── Rephrasings · one at a time ────────────────────────────────────────────
    "tailor.reformOverline": "Rephrase for the posting",
    "tailor.reformNote":
      "Aligns the wording with the posting without touching the facts. Original vs proposed, one at a time. Nothing applies in bulk.",
    "tailor.reformOriginal": "current",
    "tailor.reformProposed": "proposed",
    "tailor.reformApply": "Apply",
    "tailor.reformApplying": "applying…",
    "tailor.reformApplied": "applied ✓",
    "tailor.reformErr": "Not applied: ",
    "tailor.notesPrefix": "AI note: ",
    "tailor.reAnalyze": "Analyze another posting",
  } as Record<string, string>,
} as const;
