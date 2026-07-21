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
    "importar.file.unsupported":
      "tipo no soportado — se aceptan PDF, DOCX, texto (.md, .txt) e imágenes (PNG, JPG, WEBP)",
    "importar.file.needSession": "sesión requerida para subir",
    "importar.file.tooBig": "archivo grande (>10 MB): puede tardar",
    "importar.file.remove": "Quitar",
    "importar.tag.md": "cuestionario · fuente de primera",
    "importar.tag.text": "texto plano · se lee tal cual",
    "importar.tag.image": "captura · se transcribe literal",

    // ── Dropzone ──────────────────────────────────────────────────────────
    "importar.drop.bold": "arrastra archivos aquí",
    "importar.drop.rest": " — o haz clic para elegir",
    "importar.drop.line2":
      "CV en PDF o DOCX · el cuestionario respondido (.md) · notas en .txt · capturas de LinkedIn · certificados",

    // ── Meta del textarea (interpolado) ───────────────────────────────────
    "importar.meta.words": "{n} palabras",
    "importar.meta.linkOne": "{n} link detectado",
    "importar.meta.linkMany": "{n} links detectados",
    "importar.useSample": "usar texto de ejemplo",
    "importar.clear": "limpiar",

    // ── LAS TRES PUERTAS (el índice honesto de la pantalla) ───────────────
    // Cada puerta dice EN SU CARA si consume IA. Antes las dos primeras eran lo
    // único que había y no lo decían: el usuario descubría el gasto después.
    "importar.puertas.aria": "Las tres formas de entrar",
    "importar.puertas.overline": "Tres formas de entrar · elige la tuya",
    "importar.puerta1.title": "Pega lo que tengas",
    "importar.puerta1.body": "Párrafos sueltos, tu CV viejo, notas, links. Desordenado.",
    "importar.puerta1.cost": "Usa IA · consume tokens",
    "importar.puerta1.go": "Pegar aquí abajo",
    "importar.puerta2.title": "Sube un archivo",
    "importar.puerta2.body": "PDF, DOCX, .txt o capturas de pantalla.",
    "importar.puerta2.cost": "Usa IA · consume tokens",
    "importar.puerta2.go": "Elegir archivo",
    "importar.puerta3.title": "Plantilla estructurada",
    "importar.puerta3.body": "Descárgala, rellénala (a mano o con tu propia IA) y súbela.",
    "importar.puerta3.cost": "Sin IA · sin coste · sin invención",
    "importar.puerta3.go": "Ir a la plantilla",

    // ── PUERTA 3 · la plantilla estructurada ──────────────────────────────
    // La comodidad del modelo grande la pagas en una suscripción que YA tienes;
    // aquí no se gasta ni un token de API. El copy no exagera: la plantilla no
    // es "mejor", es distinta — pide trabajo tuyo a cambio de coste cero.
    "importar.pl.overline": "Puerta 3 · sin IA, sin coste",
    "importar.pl.title": "Rellena la plantilla y súbela.",
    "importar.pl.body":
      "Es un .md con las secciones ya puestas. Lo rellenas a mano, o se lo das a la IA que ya pagas (ChatGPT, Claude, Gemini) junto con tu LinkedIn y tu CV viejo. Nosotros lo leemos con un parser: sin modelo, sin tokens, sin nada que alucinar.",
    "importar.pl.s1.h": "Descarga la plantilla",
    "importar.pl.s1.d": "Un fichero .md con las secciones y los campos ya escritos. Ábrelo con cualquier editor de texto.",
    "importar.pl.download": "Descargar plantilla (.md)",
    "importar.pl.s2.h": "Rellénala — a mano o con tu propia IA",
    "importar.pl.s2.d":
      "Si la rellenas a mano, escribe y ya está. Si prefieres que la rellene un modelo, copia estas instrucciones y pégalas en tu chat con la plantilla y tu material:",
    "importar.pl.promptLabel": "Instrucciones para tu chat",
    "importar.pl.promptAria": "Instrucciones listas para pegar en tu chat",
    "importar.pl.copiar": "Copiar",
    "importar.pl.copiado": "Copiado",
    "importar.pl.copiaFallo":
      "Tu navegador no dejó copiar. El texto ha quedado seleccionado: pulsa Ctrl+C (⌘+C en Mac).",
    // ★ La regla 1 es LITERAL y no se toca: es lo único que impide que la vía
    //   segura meta invención por la puerta de atrás. Si un día alguien la
    //   suaviza, tests/tres-puertas.test.ts se cae.
    "importar.pl.prompt": `Te voy a dar dos cosas: una plantilla en Markdown y mi información en bruto (mi perfil de LinkedIn, mi CV antiguo, mis notas sueltas). Rellena la plantilla con mis datos y devuélvemela.

Reglas, sin excepciones:
1. No inventes datos: si algo no está en lo que te doy, déjalo vacío.
2. No adornes ni reescribas: copia mis frases tal cual. Si algo está mal redactado, déjalo mal redactado.
3. Respeta los encabezados (## EXPERIENCIA, ## HABILIDADES…) y los nombres de los campos (titulo:, empresa:, fechas:…). No añadas secciones nuevas.
4. Las fechas van tal y como aparecen en mi material: «2020 - 2024», «marzo 2025 - actualidad». No las normalices ni deduzcas las que falten.
5. Un logro por viñeta, empezando con «- ». No los fusiones ni los resumas.
6. Las habilidades van en una línea por grupo: «Lenguajes: Python, SQL, Go».
7. Si dudas entre dos secciones, elige una sola y no dupliques el dato.
8. Devuélveme el fichero .md completo, dentro de un bloque de código y sin comentarios tuyos alrededor.

--- PLANTILLA ---
[pega aquí la plantilla que descargaste de Corpus]

--- MI INFORMACIÓN ---
[pega aquí tu perfil de LinkedIn, tu CV antiguo y tus notas]`,
    "importar.pl.s3.h": "Súbela aquí",
    "importar.pl.s3.d":
      "La leemos con un parser, no con un modelo. Antes de guardar nada te enseñamos qué hemos entendido, línea por línea.",
    "importar.pl.drop.bold": "arrastra el .md relleno",
    "importar.pl.drop.rest": " — o haz clic para elegirlo",
    "importar.pl.drop.line2": "Solo el fichero de plantilla (.md). Para PDF, DOCX o capturas usa la puerta 2.",
    "importar.pl.badExt":
      "Eso no es un .md. Esta puerta solo lee el fichero de plantilla; para PDF, DOCX o capturas usa la puerta 2 — esa sí usa IA.",
    "importar.pl.empty": "El fichero está vacío. No hemos enviado nada.",
    "importar.pl.reading": "leyendo la plantilla, sin IA…",
    "importar.pl.failed": "No se pudo leer la plantilla.",
    "importar.pl.fileLabel": "Fichero:",
    "importar.pl.otro": "Subir otro",

    // ── Informe previo del parseo (ANTES de tocar staging) ────────────────
    "importar.pl.inf.overline": "Lo que hemos entendido",
    "importar.pl.inf.total": "{n} items listos para pasar a staging",
    "importar.pl.inf.totalUno": "1 item listo para pasar a staging",
    "importar.pl.inf.tipos": "Por tipo",
    "importar.pl.inf.notas": "Líneas que no encajaban en ninguna sección",
    "importar.pl.inf.notasBody":
      "No se descartan. Entran como nota con su número de línea, para que las coloques tú donde toque.",
    "importar.pl.inf.preguntas": "Cosas que no vamos a adivinar",
    "importar.pl.inf.preguntasBody":
      "Van marcadas y te las preguntamos en staging. Una fecha que no se entiende no se inventa.",
    "importar.pl.inf.avisos": "Avisos",
    "importar.pl.inf.linea": "línea {n}",
    "importar.pl.inf.confirmar": "Confirmar y llevar a staging →",
    "importar.pl.inf.confirmando": "llevando a staging…",
    "importar.pl.inf.cancelar": "Descartar esta lectura",
    "importar.pl.inf.sub": "Esto solo lo deja en staging. Al master no entra nada sin que lo confirmes item por item.",
    "importar.pl.inf.cero":
      "El fichero se leyó, pero no salió ningún item. Comprueba que conserve los encabezados (## EXPERIENCIA, ## HABILIDADES…). No hemos guardado nada.",
    "importar.pl.inf.rara":
      "El servidor respondió algo que no sabemos leer, así que no hemos guardado nada. Esto es lo que devolvió, tal cual:",

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
    "importar.log.readingText": "leyendo el texto tal cual…",
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

    // ── Consumo de IA (hecho verificable, no estimación) ──────────────────
    // Sin precio: el plan de cada uno es distinto e inventar pesos sería un
    // número sin fuente. Lo que SÍ es un hecho es cuánto se leyó y cuánto costó
    // en llamadas y tokens, y eso se enseña.
    "importar.fin.consumo.overline": "Lo que costó leer esto",
    "importar.fin.consumo.leido": "{kb} KB leídos",
    "importar.fin.consumo.llamadas": "{n} llamadas al modelo",
    "importar.fin.consumo.llamadasUna": "1 llamada al modelo",
    "importar.fin.consumo.tokens": "~{n} tokens de entrada",
    // Cuando el proveedor no reportó `usage` en alguna llamada, el total es un
    // SUELO. Se dice con «≥», no se redondea a un número que aparenta exactitud.
    "importar.fin.consumo.tokensSuelo": "≥{n} tokens de entrada ({sin} llamadas sin dato del proveedor)",
    "importar.fin.consumo.cache": "Sin coste: ya habíamos leído este mismo contenido.",
    "importar.fin.consumo.nota":
      "No mostramos un precio porque depende de tu plan. El consumo sí es un hecho y queda registrado.",

    // ── Secciones leídas como contexto (NUNCA en silencio) ────────────────
    "importar.fin.contexto.overline": "Secciones leídas como contexto",
    "importar.fin.contexto.body":
      "Estas {n} secciones ({kb} KB) no se mandaron a extraer porque no producen items de CV. No se han borrado: siguen en la fuente y puedes volver a leerlas enteras.",
    "importar.fin.contexto.bodyUna":
      "Esta sección ({kb} KB) no se mandó a extraer porque no produce items de CV. No se ha borrado: sigue en la fuente y puedes volver a leerla entera.",
    "importar.fin.contexto.chars": "{n} caracteres",
    "importar.fin.contexto.releer": "¿Crees que ahí hay datos tuyos? Vuelve a Fuentes y pulsa «Releer» con la lectura completa.",
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
    "importar.file.unsupported":
      "unsupported type — we accept PDF, DOCX, text (.md, .txt) and images (PNG, JPG, WEBP)",
    "importar.file.needSession": "sign-in required to upload",
    "importar.file.tooBig": "large file (>10 MB): may take a while",
    "importar.file.remove": "Remove",
    "importar.tag.md": "questionnaire · first-hand source",
    "importar.tag.text": "plain text · read as-is",
    "importar.tag.image": "screenshot · transcribed verbatim",

    // ── Dropzone ──────────────────────────────────────────────────────────
    "importar.drop.bold": "drag files here",
    "importar.drop.rest": " — or click to choose",
    "importar.drop.line2":
      "resume in PDF or DOCX · your answered questionnaire (.md) · notes in .txt · LinkedIn screenshots · certificates",

    // ── Textarea meta (interpolated) ──────────────────────────────────────
    "importar.meta.words": "{n} words",
    "importar.meta.linkOne": "{n} link detected",
    "importar.meta.linkMany": "{n} links detected",
    "importar.useSample": "use sample text",
    "importar.clear": "clear",

    // ── THE THREE DOORS (the screen's honest index) ───────────────────────
    "importar.puertas.aria": "The three ways in",
    "importar.puertas.overline": "Three ways in · pick yours",
    "importar.puerta1.title": "Paste whatever you have",
    "importar.puerta1.body": "Loose paragraphs, your old resume, notes, links. Unsorted.",
    "importar.puerta1.cost": "Uses AI · spends tokens",
    "importar.puerta1.go": "Paste below",
    "importar.puerta2.title": "Upload a file",
    "importar.puerta2.body": "PDF, DOCX, .txt or screenshots.",
    "importar.puerta2.cost": "Uses AI · spends tokens",
    "importar.puerta2.go": "Choose a file",
    "importar.puerta3.title": "Structured template",
    "importar.puerta3.body": "Download it, fill it in (by hand or with your own AI), upload it.",
    "importar.puerta3.cost": "No AI · no cost · nothing invented",
    "importar.puerta3.go": "Go to the template",

    // ── DOOR 3 · the structured template ──────────────────────────────────
    "importar.pl.overline": "Door 3 · no AI, no cost",
    "importar.pl.title": "Fill in the template and upload it.",
    "importar.pl.body":
      "It's a .md file with the sections already laid out. Fill it in by hand, or hand it to the AI you already pay for (ChatGPT, Claude, Gemini) along with your LinkedIn and your old resume. We read it with a parser: no model, no tokens, nothing to hallucinate.",
    "importar.pl.s1.h": "Download the template",
    "importar.pl.s1.d": "A .md file with the sections and fields already written. Open it with any text editor.",
    "importar.pl.download": "Download template (.md)",
    "importar.pl.s2.h": "Fill it in — by hand or with your own AI",
    "importar.pl.s2.d":
      "Filling it by hand is just typing. If you'd rather have a model do it, copy these instructions and paste them into your chat together with the template and your material:",
    "importar.pl.promptLabel": "Instructions for your chat",
    "importar.pl.promptAria": "Instructions ready to paste into your chat",
    "importar.pl.copiar": "Copy",
    "importar.pl.copiado": "Copied",
    "importar.pl.copiaFallo":
      "Your browser wouldn't let us copy. The text is selected: press Ctrl+C (⌘+C on Mac).",
    // ★ Rule 1 is LITERAL and stays that way: it's the only thing keeping the
    //   safe route from smuggling invention in through the back door.
    "importar.pl.prompt": `I'm going to give you two things: a Markdown template and my raw material (my LinkedIn profile, my old resume, my loose notes). Fill the template in with my data and give it back to me.

Rules, no exceptions:
1. Don't make anything up: if something isn't in what I give you, leave it empty.
2. Don't embellish or rewrite: copy my sentences as they are. If something is badly worded, leave it badly worded.
3. Keep the headings (## EXPERIENCE, ## SKILLS…) and the field names (title:, company:, dates:…). Don't add new sections.
4. Dates go exactly as they appear in my material: "2020 - 2024", "March 2025 - present". Don't normalise them and don't infer the missing ones.
5. One achievement per bullet, starting with "- ". Don't merge or summarise them.
6. Skills go one line per group: "Languages: Python, SQL, Go".
7. If you're torn between two sections, pick one and don't duplicate the entry.
8. Give me back the complete .md file, inside a code block, with no commentary around it.

--- TEMPLATE ---
[paste here the template you downloaded from Corpus]

--- MY MATERIAL ---
[paste here your LinkedIn profile, your old resume and your notes]`,
    "importar.pl.s3.h": "Upload it here",
    "importar.pl.s3.d":
      "We read it with a parser, not a model. Before anything is saved we show you what we understood, line by line.",
    "importar.pl.drop.bold": "drag the filled-in .md here",
    "importar.pl.drop.rest": " — or click to choose it",
    "importar.pl.drop.line2": "Template file only (.md). For PDF, DOCX or screenshots use door 2.",
    "importar.pl.badExt":
      "That isn't a .md file. This door only reads the template; for PDF, DOCX or screenshots use door 2 — that one does use AI.",
    "importar.pl.empty": "The file is empty. We haven't sent anything.",
    "importar.pl.reading": "reading the template, no AI…",
    "importar.pl.failed": "Couldn't read the template.",
    "importar.pl.fileLabel": "File:",
    "importar.pl.otro": "Upload another",

    // ── Parse preview report (BEFORE anything touches staging) ────────────
    "importar.pl.inf.overline": "What we understood",
    "importar.pl.inf.total": "{n} items ready to go to staging",
    "importar.pl.inf.totalUno": "1 item ready to go to staging",
    "importar.pl.inf.tipos": "By type",
    "importar.pl.inf.notas": "Lines that didn't fit any section",
    "importar.pl.inf.notasBody":
      "Nothing is dropped. They come in as a note with their line number, for you to place where they belong.",
    "importar.pl.inf.preguntas": "Things we won't guess",
    "importar.pl.inf.preguntasBody":
      "They're flagged and we'll ask you in staging. A date we can't read doesn't get invented.",
    "importar.pl.inf.avisos": "Warnings",
    "importar.pl.inf.linea": "line {n}",
    "importar.pl.inf.confirmar": "Confirm and send to staging →",
    "importar.pl.inf.confirmando": "sending to staging…",
    "importar.pl.inf.cancelar": "Discard this reading",
    "importar.pl.inf.sub": "This only puts it in staging. Nothing enters your master until you confirm it item by item.",
    "importar.pl.inf.cero":
      "The file was read, but no items came out. Check that it still has its headings (## EXPERIENCE, ## SKILLS…). Nothing has been saved.",
    "importar.pl.inf.rara":
      "The server answered something we can't read, so nothing has been saved. Here's exactly what it returned:",

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
    "importar.log.readingText": "reading the text as-is…",
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

    // ── AI consumption (a verifiable fact, not an estimate) ────────────────
    "importar.fin.consumo.overline": "What reading this cost",
    "importar.fin.consumo.leido": "{kb} KB read",
    "importar.fin.consumo.llamadas": "{n} model calls",
    "importar.fin.consumo.llamadasUna": "1 model call",
    "importar.fin.consumo.tokens": "~{n} input tokens",
    "importar.fin.consumo.tokensSuelo": "≥{n} input tokens ({sin} calls with no provider figure)",
    "importar.fin.consumo.cache": "No cost: we had already read this exact content.",
    "importar.fin.consumo.nota":
      "We don't show a price because it depends on your plan. The usage is a fact, and it's on the record.",

    // ── Sections read as context (NEVER silently) ─────────────────────────
    "importar.fin.contexto.overline": "Sections read as context",
    "importar.fin.contexto.body":
      "These {n} sections ({kb} KB) weren't sent for extraction because they don't produce CV items. Nothing was deleted: they're still in the source and you can re-read them in full.",
    "importar.fin.contexto.bodyUna":
      "This section ({kb} KB) wasn't sent for extraction because it doesn't produce CV items. Nothing was deleted: it's still in the source and you can re-read it in full.",
    "importar.fin.contexto.chars": "{n} characters",
    "importar.fin.contexto.releer": "Think your data is in there? Go back to Sources and hit \"Re-read\" with full reading.",
  } as Record<string, string>,
} as const;
