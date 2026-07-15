/* i18n · namespace "importar". Claves planas con prefijo "importar.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "importar". */
export const importar = {
  es: {
    // ── Cabecera (paso dinámico) ──────────────────────────────────────────
    "importar.step.idle": "VOLCADO · PASO 1 DE 2",
    "importar.step.ingest": "INGESTA · LEYENDO FUENTES",
    "importar.step.done": "INGESTA · COMPLETA",
    "importar.langAria": "Idioma",

    // ── Volcado ───────────────────────────────────────────────────────────
    "importar.overline": "Nada entra al master sin tu confirmación",
    "importar.h1.pre": "No escribas tu perfil. ",
    "importar.h1.em": "Vuélcalo.",
    "importar.sub":
      "Pega lo que tengas: párrafos sueltos, tu CV viejo, notas, links. El orden no importa — ordenarlo es trabajo nuestro.",
    "importar.placeholder":
      "Pega lo que tengas. Sin formato. Sin orden.\n\nPor ejemplo:  «Soy ingeniero civil en computación, titulado en la UNAB. Trabajé tres años en una fintech haciendo APIs de pago… mi portfolio es https://misitio.cl y mi github es github.com/usuario. Adjunto también mi CV viejo.»",
    "importar.ta.aria": "Pega aquí lo que tengas",
    "importar.detect.overline": "Fuentes detectadas en tu texto",
    "importar.chip.github": "API pública — se leerá sin IA",
    "importar.chip.linkedin": "no legible desde fuera",
    "importar.chip.web": "se leerá como portfolio",

    // ── Archivos ──────────────────────────────────────────────────────────
    "importar.file.uploading": "subiendo…",
    "importar.file.errorPrefix": "error: ",
    "importar.file.uploadFailed": "no se pudo subir",
    "importar.file.unsupported": "tipo no soportado (usa PDF, DOCX o imagen)",
    "importar.file.needSession": "sesión requerida para subir",
    "importar.file.tooBig": "archivo grande (>10 MB): puede tardar",
    "importar.file.remove": "Quitar",
    "importar.tag.md": "cuestionario · fuente de primera",
    "importar.tag.image": "captura · se transcribe literal",

    // ── Dropzone ──────────────────────────────────────────────────────────
    "importar.drop.bold": "arrastra archivos aquí",
    "importar.drop.rest": " — o haz clic para elegir",
    "importar.drop.line2":
      "CV en PDF o DOCX · el cuestionario respondido (.md) · capturas de LinkedIn · certificados",

    // ── Meta del textarea (interpolado) ───────────────────────────────────
    "importar.meta.words": "{n} palabras",
    "importar.meta.linkOne": "{n} link detectado",
    "importar.meta.linkMany": "{n} links detectados",
    "importar.useSample": "usar texto de ejemplo",
    "importar.clear": "limpiar",

    // ── El momento LinkedIn ───────────────────────────────────────────────
    "importar.li.title": "LinkedIn no permite que un servicio lea tu perfil desde fuera.",
    "importar.li.body":
      "Está detrás de tu sesión y bloquea lectores automáticos — a nosotros y a cualquiera que diga lo contrario. Tres vías que sí funcionan:",
    "importar.li.inProfile": "En tu perfil: ",
    "importar.li.s1.h": "Copia el texto de tu perfil",
    "importar.li.s1.mid": " y ",
    "importar.li.s1.post": ", y pégalo aquí encima. Es la vía más completa.",
    "importar.li.s2.h": "Sube el PDF que exporta LinkedIn",
    "importar.li.s2.b1": "Más…",
    "importar.li.s2.b2": "Guardar como PDF",
    "importar.li.s2.post": ". Arrástralo a esta caja.",
    "importar.li.s3.h": "Capturas de pantalla",
    "importar.li.s3.d": "Las transcribimos literal, sin interpretar. Lo que no se lea, no se inventa.",

    // ── CTA + nota ────────────────────────────────────────────────────────
    "importar.cta": "Extraer con evidencia",
    "importar.altWrite": "Prefiero escribirlo de cero →",
    "importar.extractFailed": "No se pudo extraer.",
    "importar.note":
      "La IA no inventa: cada dato citará el fragmento del que salió. Tú confirmas item por item antes de que entre al master.",

    // ── Ingesta (la espera) ───────────────────────────────────────────────
    "importar.ing.overline": "Leyendo tus fuentes",
    "importar.ing.caption": "items encontrados hasta ahora",
    "importar.ing.hint1": "Esto toma entre 5 y 40 segundos según las fuentes.",
    "importar.ing.hint2": "Sin porcentajes inventados: te decimos qué estamos haciendo.",

    // ── Log de la ingesta (filas dinámicas) ───────────────────────────────
    "importar.log.pastedText": "Texto pegado",
    "importar.log.reading": "leyendo…",
    "importar.log.transcribing": "transcribiendo literal…",
    "importar.log.readingPdf": "leyendo el PDF…",
    "importar.log.readingDocx": "leyendo el DOCX…",
    "importar.log.queryingApi": "consultando la API pública…",
    "importar.log.readingPortfolio": "leyendo el portfolio…",
    "importar.log.extractingSrc": "Extrayendo con evidencia",
    "importar.log.extractingDet": "la IA estructura y cita el origen…",
    "importar.log.result": "{total} items · {verified} con evidencia literal",
    "importar.log.stopped": "detenido",
    "importar.log.onlyPage1": "solo página 1 · 6 items",
    "importar.log.retryFail": "sigue sin texto — continuando con la página 1",

    // ── Recuperación de error (acciones por fila) ─────────────────────────
    "importar.err.continue": "Continuar sin la página 2",
    "importar.err.retry": "Reintentar",
    "importar.err.retrying": "reintentando…",

    // ── Fin ───────────────────────────────────────────────────────────────
    "importar.fin.overline": "Extracción completa",
    "importar.fin.title": "Listo. Ahora, tu turno.",
    "importar.fin.awaitReview": "items esperan tu revisión",
    "importar.fin.verified": "con evidencia literal",
    "importar.fin.partial": "evidencia parcial",
    "importar.fin.api": "dato duro (GitHub)",
    "importar.fin.noneLabel": "sin evidencia",
    "importar.fin.flagged": "quedan marcados — la revisión te los pondrá delante, no debajo.",
    "importar.fin.warnings": "Avisos de la ingesta",
    "importar.fin.reviewCta": "Revisar en staging →",
    "importar.fin.sub": "Nada entra al master sin tu confirmación.",
  } as Record<string, string>,
  en: {
    // ── Header (dynamic step) ─────────────────────────────────────────────
    "importar.step.idle": "DUMP · STEP 1 OF 2",
    "importar.step.ingest": "INTAKE · READING SOURCES",
    "importar.step.done": "INTAKE · COMPLETE",
    "importar.langAria": "Language",

    // ── Dump ──────────────────────────────────────────────────────────────
    "importar.overline": "Nothing enters your master without your sign-off",
    "importar.h1.pre": "Don't write your profile. ",
    "importar.h1.em": "Dump it.",
    "importar.sub":
      "Paste whatever you have: loose paragraphs, your old resume, notes, links. Order doesn't matter — sorting it out is our job.",
    "importar.placeholder":
      "Paste whatever you have. No format. No order.\n\nFor example:  \"I'm a software engineer, graduated from UNAB. Spent three years at a fintech building payment APIs… my portfolio is https://mysite.cl and my github is github.com/user. I'm also attaching my old resume.\"",
    "importar.ta.aria": "Paste whatever you have here",
    "importar.detect.overline": "Sources detected in your text",
    "importar.chip.github": "public API — read without AI",
    "importar.chip.linkedin": "not readable from outside",
    "importar.chip.web": "will be read as a portfolio",

    // ── Files ─────────────────────────────────────────────────────────────
    "importar.file.uploading": "uploading…",
    "importar.file.errorPrefix": "error: ",
    "importar.file.uploadFailed": "couldn't upload",
    "importar.file.unsupported": "unsupported type (use PDF, DOCX or image)",
    "importar.file.needSession": "sign-in required to upload",
    "importar.file.tooBig": "large file (>10 MB): may take a while",
    "importar.file.remove": "Remove",
    "importar.tag.md": "questionnaire · first-hand source",
    "importar.tag.image": "screenshot · transcribed verbatim",

    // ── Dropzone ──────────────────────────────────────────────────────────
    "importar.drop.bold": "drag files here",
    "importar.drop.rest": " — or click to choose",
    "importar.drop.line2":
      "resume in PDF or DOCX · your answered questionnaire (.md) · LinkedIn screenshots · certificates",

    // ── Textarea meta (interpolated) ──────────────────────────────────────
    "importar.meta.words": "{n} words",
    "importar.meta.linkOne": "{n} link detected",
    "importar.meta.linkMany": "{n} links detected",
    "importar.useSample": "use sample text",
    "importar.clear": "clear",

    // ── The LinkedIn moment ───────────────────────────────────────────────
    "importar.li.title": "LinkedIn doesn't let any service read your profile from outside.",
    "importar.li.body":
      "It sits behind your login and blocks automated readers — us, and anyone who claims otherwise. Three ways that do work:",
    "importar.li.inProfile": "In your profile: ",
    "importar.li.s1.h": "Copy your profile text",
    "importar.li.s1.mid": " and ",
    "importar.li.s1.post": ", and paste it above. The most complete route.",
    "importar.li.s2.h": "Upload LinkedIn's own PDF",
    "importar.li.s2.b1": "More…",
    "importar.li.s2.b2": "Save to PDF",
    "importar.li.s2.post": ". Drag it into this box.",
    "importar.li.s3.h": "Screenshots",
    "importar.li.s3.d": "We transcribe them verbatim, no interpretation. What can't be read doesn't get made up.",

    // ── CTA + note ────────────────────────────────────────────────────────
    "importar.cta": "Extract with evidence",
    "importar.altWrite": "I'd rather write it from scratch →",
    "importar.extractFailed": "Couldn't extract.",
    "importar.note":
      "The AI doesn't invent: every fact will cite the fragment it came from. You confirm item by item before it enters your master.",

    // ── Intake (the wait) ─────────────────────────────────────────────────
    "importar.ing.overline": "Reading your sources",
    "importar.ing.caption": "items found so far",
    "importar.ing.hint1": "This takes between 5 and 40 seconds depending on your sources.",
    "importar.ing.hint2": "No made-up percentages: we tell you what we're doing.",

    // ── Intake log (dynamic rows) ─────────────────────────────────────────
    "importar.log.pastedText": "Pasted text",
    "importar.log.reading": "reading…",
    "importar.log.transcribing": "transcribing verbatim…",
    "importar.log.readingPdf": "reading the PDF…",
    "importar.log.readingDocx": "reading the DOCX…",
    "importar.log.queryingApi": "querying the public API…",
    "importar.log.readingPortfolio": "reading the portfolio…",
    "importar.log.extractingSrc": "Extracting with evidence",
    "importar.log.extractingDet": "the AI structures it and cites the source…",
    "importar.log.result": "{total} items · {verified} with literal evidence",
    "importar.log.stopped": "stopped",
    "importar.log.onlyPage1": "only page 1 · 6 items",
    "importar.log.retryFail": "still no text — continuing with page 1",

    // ── Error recovery (per-row actions) ──────────────────────────────────
    "importar.err.continue": "Continue without page 2",
    "importar.err.retry": "Retry",
    "importar.err.retrying": "retrying…",

    // ── Done ──────────────────────────────────────────────────────────────
    "importar.fin.overline": "Extraction complete",
    "importar.fin.title": "Done. Your turn now.",
    "importar.fin.awaitReview": "items await your review",
    "importar.fin.verified": "with literal evidence",
    "importar.fin.partial": "partial evidence",
    "importar.fin.api": "hard fact (GitHub)",
    "importar.fin.noneLabel": "without evidence",
    "importar.fin.flagged": "flagged — review puts them in front of you, not under the rug.",
    "importar.fin.warnings": "Intake warnings",
    "importar.fin.reviewCta": "Review in staging →",
    "importar.fin.sub": "Nothing enters your master without your sign-off.",
  } as Record<string, string>,
} as const;
