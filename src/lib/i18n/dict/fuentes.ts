/* i18n · namespace "fuentes". Claves planas con prefijo "fuentes.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "fuentes". */
export const fuentes = {
  es: {
    // Etiquetas de tipo de fuente (KIND_LABEL)
    "fuentes.kind.paste": "texto pegado",
    "fuentes.kind.pdf": "PDF",
    "fuentes.kind.docx": "DOCX",
    "fuentes.kind.image": "captura · transcrita",
    "fuentes.kind.url": "portfolio",
    "fuentes.kind.github": "GitHub",
    "fuentes.kind.manual": "escrito por ti",

    // Estado de la lectura (STATUS_LABEL)
    "fuentes.status.pending": "en cola",
    "fuentes.status.parsing": "leyendo…",
    "fuentes.status.extracted": "extraída",
    "fuentes.status.failed": "falló",
    "fuentes.status.reviewed": "revisada",

    // Tiempo relativo (rel) — {n} se reemplaza en runtime
    "fuentes.rel.now": "recién",
    "fuentes.rel.hours": "hace {n} h",
    "fuentes.rel.day": "hace {n} día",
    "fuentes.rel.days": "hace {n} días",
    "fuentes.rel.month": "hace {n} mes",
    "fuentes.rel.months": "hace {n} meses",

    // Encabezado / lead
    "fuentes.lead.prefix": "Cada fuente dice ",
    "fuentes.lead.bold": "qué aportó",
    "fuentes.lead.suffixReal": " y cuándo se leyó. Nada se relee ni entra al master sin pasar por staging.",
    "fuentes.lead.suffixLocal": " y qué hay de nuevo desde la última lectura. Nada se relee ni entra al master sin pasar por staging.",
    "fuentes.dumpMore": "+ Volcar más material",

    // Modo Supabase
    "fuentes.loading": "Leyendo tus fuentes…",
    "fuentes.empty.overline": "Sin fuentes todavía",
    "fuentes.empty.title": "Aún no has conectado ninguna fuente.",
    "fuentes.empty.body":
      "Pega texto, sube tu CV o enlaza tu GitHub y tu portfolio. Cada fuente quedará aquí, con lo que aportó y cuándo la leímos.",
    "fuentes.empty.cta": "Volcar lo que tengo →",
    "fuentes.item.viewStaging": "ver en staging",
    "fuentes.item.readStatus": "estado de la lectura",
    "fuentes.item.charsRead": "caracteres leídos",
    "fuentes.item.pages": " · {n} págs",
    "fuentes.item.added": "añadida",

    // ── Informe por fuente (bloque D) — números reales del servidor. Cada chip es
    //    un valor (calculado en código) + esta etiqueta. Sin dato → no se pinta. ──
    "fuentes.report.readK": "leídos del documento",
    "fuentes.report.kb": "{n} KB",
    "fuentes.report.chars": "{n} caracteres",
    "fuentes.report.transcribed": "transcrito por IA",
    "fuentes.report.callsK": "llamadas al modelo",
    "fuentes.report.tokensK": "tokens",
    "fuentes.report.itemsK": "ítems extraídos",
    "fuentes.report.duplicatesK": "posibles duplicados",
    "fuentes.report.noEvidenceK": "sin evidencia",
    "fuentes.report.cache": "servido de caché — sin coste de IA",
    "fuentes.report.failed": "No se pudo leer: {msg}",
    "fuentes.report.contextOne": "1 sección se leyó como contexto y no se extrajo: {list}",
    "fuentes.report.contextMany": "{n} secciones se leyeron como contexto y no se extrajeron: {list}",

    // Tags compartidos
    "fuentes.tag.noAiApi": "sin IA — API con esquema",
    "fuentes.tag.portfolio": "portfolio",

    // GitHub shell (modo Supabase)
    "fuentes.ghShell.connect": "conectar",
    "fuentes.ghShell.notePre": "Pega un enlace a tu ",
    "fuentes.ghShell.noteBold": "github.com/usuario",
    "fuentes.ghShell.noteSuf":
      " en el volcado: leeremos tus repos públicos por la API oficial — sin IA, sin alucinación. Lo que ves es la API.",

    // Añadir fuente (compartido)
    "fuentes.add.placeholder": "https:// otra fuente — portfolio, blog, repositorio…",
    "fuentes.add.button": "Añadir fuente",

    // GitHub — modo local (maqueta)
    "fuentes.gh.chooseRepos": "elegir repos ({sel} de {tot})",
    "fuentes.gh.readingApi": " leyendo la API…",
    "fuentes.gh.readNew": "Leer lo nuevo",
    "fuentes.gh.factReposK": "repos públicos",
    "fuentes.gh.factBytesK": "bytes de Go — un hecho, no una estimación",
    "fuentes.gh.factItemsK": "items aportados al master",
    "fuentes.gh.factPushK": "último push detectado",
    "fuentes.gh.readingActivity": "idempotency-go: 3 commits nuevos · scraper-sii: README actualizado",
    "fuentes.gh.readDonePre": "leído —",
    "fuentes.gh.readDoneBold": "2 items nuevos",
    "fuentes.gh.readDoneSuf": " esperan en staging (nada entra solo al master)",
    "fuentes.gh.review": "revisar →",
    "fuentes.gh.newBold": "2 repos con actividad",
    "fuentes.gh.newMid": " desde la última lectura: ",
    "fuentes.gh.readThem": "leerlos →",
    "fuentes.gh.note": "GitHub es la única fuente donde la IA no puede alucinar: no hay IA. Lo que ves es la API.",

    // Selector de repos
    "fuentes.repo.selected": "{sel} de {tot} seleccionados.",
    "fuentes.repo.mid": " Por defecto quedan fuera forks, tutoriales y configuración — ",
    "fuentes.repo.boldRule": "un CV no es un volcado de GitHub.",
    "fuentes.repo.end": " Revisa la decisión, no la delegues.",
    "fuentes.repo.leftOut": "fuera por defecto: ",

    // Portfolio — modo local
    "fuentes.web.reading": " leyendo…",
    "fuentes.web.reread": "Releer",
    "fuentes.web.factProjectsK": "proyectos documentados",
    "fuentes.web.factItemsK": "items aportados",
    "fuentes.web.factLastReadK": "última lectura",
    "fuentes.web.cmpComparing": "comparando contra la lectura anterior…",
    "fuentes.web.cmpNoChangeRead": "sin cambios — misma versión que el 2 jul",
    "fuentes.web.cmpNoChange": "sin cambios detectados",

    // Archivos — modo local
    "fuentes.files.name": "archivos",
    "fuentes.files.tag": "estáticos — no cambian solos",
    "fuentes.files.upload": "+ subir otro",
    "fuentes.files.doc1K": "2 páginas · aportó 15 items · leído 12 jul",
    "fuentes.files.doc2K": "16 bloques · aportó 6 items · fuente de primera: lo escribiste tú",

    // Tarjeta educativa LinkedIn (ambos modos)
    "fuentes.li.tag": "no conectable — así funciona LinkedIn",
    "fuentes.li.body":
      "LinkedIn bloquea la lectura externa de perfiles: ningún servicio serio puede conectarse, y los que lo prometen, scrapean contra sus términos. Tres vías que sí funcionan:",
    "fuentes.li.via1Bold": "Pegar el texto",
    "fuentes.li.via1": "Ctrl+A y Ctrl+C sobre tu perfil → a la caja de volcado. La más completa.",
    "fuentes.li.via2Bold": "El PDF oficial",
    "fuentes.li.via2": "En tu perfil: Más… → Guardar como PDF → súbelo.",
    "fuentes.li.via3Bold": "Capturas",
    "fuentes.li.via3": "Se transcriben literal. Lo que no se lee, no se inventa.",

    // ── Cableado B — acciones in situ (modo Supabase) ──
    // Estado por fases de una acción (subir → extraer → resultado)
    "fuentes.act.busy.uploading": "subiendo…",
    "fuentes.act.busy.extracting": "extrayendo…",
    "fuentes.act.done": "{n} ítems al staging",
    "fuentes.act.reviewStaging": "revisar en staging →",
    "fuentes.act.failed": "No se pudo completar.",
    "fuentes.act.needSession": "Inicia sesión para volcar material.",
    "fuentes.act.unsupported":
      "Ese tipo de archivo no lo sabemos leer. Se aceptan PDF, DOCX, texto (.md, .txt) e imágenes (PNG, JPG, WEBP).",
    "fuentes.act.skipped": "Omitidos (tipo no soportado): {f}",

    // Sección "añadir una fuente"
    "fuentes.add.heading": "Añadir una fuente",

    // Tarjeta PDF / DOCX
    "fuentes.card.files.name": "PDF · DOCX",
    "fuentes.card.files.tag": "sube un archivo",
    "fuentes.card.files.body":
      "Tu CV, una carta, un certificado. Lo leemos y proponemos items al staging — nada entra al master sin tu visto bueno.",
    "fuentes.card.files.button": "Elegir PDF o DOCX",

    // Zonas de arrastre (el mismo gesto del volcado, componente DropZone)
    "fuentes.drop.files.bold": "Arrastra aquí tu PDF o DOCX",
    "fuentes.drop.files.rest": " · o pulsa para elegirlo",
    "fuentes.drop.images.bold": "Arrastra aquí tus capturas",
    "fuentes.drop.images.rest": " · o pulsa para elegirlas",
    "fuentes.drop.li.bold": "Arrastra aquí el PDF de LinkedIn o tus capturas",
    "fuentes.drop.li.rest": " · o pulsa para elegirlos",

    // Tarjeta capturas / imágenes
    "fuentes.card.images.name": "capturas · imágenes",
    "fuentes.card.images.tag": "transcritas literal",
    "fuentes.card.images.body":
      "PNG, JPG o WEBP. Se transcriben palabra por palabra antes de extraer nada: lo que no se lee, no se inventa.",
    "fuentes.card.images.button": "Elegir imágenes",

    // Tarjeta texto pegado
    "fuentes.card.paste.name": "texto",
    "fuentes.card.paste.tag": "pega y extrae",
    "fuentes.card.paste.body":
      "Pega lo que tengas — un borrador, la descripción de un puesto, notas sueltas. Extraemos con evidencia.",
    "fuentes.card.paste.open": "Pegar texto",
    "fuentes.card.paste.placeholder": "Pega aquí tu experiencia, un CV en texto, notas…",
    "fuentes.card.paste.submit": "Extraer con evidencia",
    "fuentes.card.paste.cancel": "cancelar",

    // Tarjeta enlace (URL)
    "fuentes.card.url.name": "enlace",
    "fuentes.card.url.tag": "portfolio · blog · repo",
    "fuentes.card.url.body":
      "Pega la dirección de tu portfolio, tu blog o un repositorio. Lo leemos y proponemos items al staging.",
    "fuentes.card.url.placeholder": "https://tu-portfolio.cl",
    "fuentes.card.url.submit": "Leer enlace",

    // Tarjeta GitHub (real, sin IA)
    "fuentes.gh2.body":
      "Leemos tus repos públicos por la API oficial — sin IA, sin alucinación. Lo que ves es la API.",
    "fuentes.gh2.placeholder": "tu-usuario",
    "fuentes.gh2.submit": "Leer repos",
    "fuentes.gh2.readLabel": "leídos:",

    // LinkedIn — las tres vías se ejecutan en la tarjeta
    "fuentes.li2.pastePlaceholder": "Ctrl+A y Ctrl+C sobre tu perfil de LinkedIn, pega el texto aquí…",
    "fuentes.li2.pasteSubmit": "Extraer",
    "fuentes.li2.pasteName": "LinkedIn (texto pegado)",

    // Acciones por fila de una fuente ya ingerida
    "fuentes.item.resync": "releer",
    "fuentes.item.resyncBusy": "releyendo…",
    "fuentes.item.resyncPasteDisabled": "el texto pegado no tiene un origen externo que releer",
    "fuentes.item.resynced": "releída — {n} al staging",
    "fuentes.item.remove": "quitar",
    "fuentes.item.removeBusy": "quitando…",
    "fuentes.item.removeConfirm":
      "¿Quitar esta fuente? Se borran sus propuestas pendientes en staging. Lo que ya aceptaste en tu master se queda (pierde el vínculo a la fuente).",
    "fuentes.item.removeYes": "quitar fuente",
    "fuentes.item.removeNo": "cancelar",
  } as Record<string, string>,
  en: {
    // Source-kind labels (KIND_LABEL)
    "fuentes.kind.paste": "pasted text",
    "fuentes.kind.pdf": "PDF",
    "fuentes.kind.docx": "DOCX",
    "fuentes.kind.image": "screenshot · transcribed",
    "fuentes.kind.url": "portfolio",
    "fuentes.kind.github": "GitHub",
    "fuentes.kind.manual": "written by you",

    // Reading status (STATUS_LABEL)
    "fuentes.status.pending": "queued",
    "fuentes.status.parsing": "reading…",
    "fuentes.status.extracted": "extracted",
    "fuentes.status.failed": "failed",
    "fuentes.status.reviewed": "reviewed",

    // Relative time (rel) — {n} replaced at runtime
    "fuentes.rel.now": "just now",
    "fuentes.rel.hours": "{n} h ago",
    "fuentes.rel.day": "{n} day ago",
    "fuentes.rel.days": "{n} days ago",
    "fuentes.rel.month": "{n} month ago",
    "fuentes.rel.months": "{n} months ago",

    // Header / lead
    "fuentes.lead.prefix": "Each source says ",
    "fuentes.lead.bold": "what it contributed",
    "fuentes.lead.suffixReal":
      " and when it was read. Nothing is re-read or enters your master without passing through staging.",
    "fuentes.lead.suffixLocal":
      " and what's new since the last read. Nothing is re-read or enters your master without passing through staging.",
    "fuentes.dumpMore": "+ Dump more material",

    // Supabase mode
    "fuentes.loading": "Reading your sources…",
    "fuentes.empty.overline": "No sources yet",
    "fuentes.empty.title": "You haven't connected any source yet.",
    "fuentes.empty.body":
      "Paste text, upload your resume, or link your GitHub and portfolio. Each source will live here, with what it contributed and when we read it.",
    "fuentes.empty.cta": "Dump what I have →",
    "fuentes.item.viewStaging": "view in staging",
    "fuentes.item.readStatus": "reading status",
    "fuentes.item.charsRead": "characters read",
    "fuentes.item.pages": " · {n} pages",
    "fuentes.item.added": "added",

    // ── Per-source report (block D) — real server numbers. Each chip is a value
    //    (computed in code) + this label. No datum → not painted. ──
    "fuentes.report.readK": "read from the document",
    "fuentes.report.kb": "{n} KB",
    "fuentes.report.chars": "{n} characters",
    "fuentes.report.transcribed": "AI-transcribed",
    "fuentes.report.callsK": "model calls",
    "fuentes.report.tokensK": "tokens",
    "fuentes.report.itemsK": "items extracted",
    "fuentes.report.duplicatesK": "possible duplicates",
    "fuentes.report.noEvidenceK": "without evidence",
    "fuentes.report.cache": "served from cache — no AI cost",
    "fuentes.report.failed": "Couldn't read: {msg}",
    "fuentes.report.contextOne": "1 section was read as context and not extracted: {list}",
    "fuentes.report.contextMany": "{n} sections were read as context and not extracted: {list}",

    // Shared tags
    "fuentes.tag.noAiApi": "no AI — schema-backed API",
    "fuentes.tag.portfolio": "portfolio",

    // GitHub shell (Supabase mode)
    "fuentes.ghShell.connect": "connect",
    "fuentes.ghShell.notePre": "Paste a link to your ",
    "fuentes.ghShell.noteBold": "github.com/user",
    "fuentes.ghShell.noteSuf":
      " into the dump: we'll read your public repos through the official API — no AI, no hallucination. What you see is the API.",

    // Add source (shared)
    "fuentes.add.placeholder": "https:// another source — portfolio, blog, repository…",
    "fuentes.add.button": "Add source",

    // GitHub — local mode (mockup)
    "fuentes.gh.chooseRepos": "choose repos ({sel} of {tot})",
    "fuentes.gh.readingApi": " reading the API…",
    "fuentes.gh.readNew": "Read what's new",
    "fuentes.gh.factReposK": "public repos",
    "fuentes.gh.factBytesK": "bytes of Go — a fact, not an estimate",
    "fuentes.gh.factItemsK": "items contributed to your master",
    "fuentes.gh.factPushK": "last push detected",
    "fuentes.gh.readingActivity": "idempotency-go: 3 new commits · scraper-sii: README updated",
    "fuentes.gh.readDonePre": "read —",
    "fuentes.gh.readDoneBold": "2 new items",
    "fuentes.gh.readDoneSuf": " wait in staging (nothing enters your master on its own)",
    "fuentes.gh.review": "review →",
    "fuentes.gh.newBold": "2 repos with activity",
    "fuentes.gh.newMid": " since the last read: ",
    "fuentes.gh.readThem": "read them →",
    "fuentes.gh.note": "GitHub is the only source where the AI can't hallucinate: there is no AI. What you see is the API.",

    // Repo picker
    "fuentes.repo.selected": "{sel} of {tot} selected.",
    "fuentes.repo.mid": " By default forks, tutorials and configuration are left out — ",
    "fuentes.repo.boldRule": "a resume isn't a GitHub dump.",
    "fuentes.repo.end": " Review the decision, don't delegate it.",
    "fuentes.repo.leftOut": "left out by default: ",

    // Portfolio — local mode
    "fuentes.web.reading": " reading…",
    "fuentes.web.reread": "Re-read",
    "fuentes.web.factProjectsK": "documented projects",
    "fuentes.web.factItemsK": "items contributed",
    "fuentes.web.factLastReadK": "last read",
    "fuentes.web.cmpComparing": "comparing against the previous read…",
    "fuentes.web.cmpNoChangeRead": "no changes — same version as Jul 2",
    "fuentes.web.cmpNoChange": "no changes detected",

    // Files — local mode
    "fuentes.files.name": "files",
    "fuentes.files.tag": "static — they don't change on their own",
    "fuentes.files.upload": "+ upload another",
    "fuentes.files.doc1K": "2 pages · contributed 15 items · read Jul 12",
    "fuentes.files.doc2K": "16 blocks · contributed 6 items · first-hand source: you wrote it",

    // LinkedIn educational card (both modes)
    "fuentes.li.tag": "not connectable — how LinkedIn works",
    "fuentes.li.body":
      "LinkedIn blocks external reading of profiles: no serious service can connect, and those that promise to are scraping against its terms. Three ways that do work:",
    "fuentes.li.via1Bold": "Paste the text",
    "fuentes.li.via1": "Ctrl+A and Ctrl+C on your profile → into the dump box. The most complete route.",
    "fuentes.li.via2Bold": "The official PDF",
    "fuentes.li.via2": "On your profile: More… → Save to PDF → upload it.",
    "fuentes.li.via3Bold": "Screenshots",
    "fuentes.li.via3": "Transcribed verbatim. What can't be read doesn't get made up.",

    // ── Wiring B — in-situ actions (Supabase mode) ──
    // Phased status of an action (upload → extract → result)
    "fuentes.act.busy.uploading": "uploading…",
    "fuentes.act.busy.extracting": "extracting…",
    "fuentes.act.done": "{n} items to staging",
    "fuentes.act.reviewStaging": "review in staging →",
    "fuentes.act.failed": "Couldn't complete.",
    "fuentes.act.needSession": "Sign in to dump material.",
    "fuentes.act.unsupported":
      "We don't know how to read that file type. We accept PDF, DOCX, text (.md, .txt) and images (PNG, JPG, WEBP).",
    "fuentes.act.skipped": "Skipped (unsupported type): {f}",

    // "Add a source" section
    "fuentes.add.heading": "Add a source",

    // PDF / DOCX card
    "fuentes.card.files.name": "PDF · DOCX",
    "fuentes.card.files.tag": "upload a file",
    "fuentes.card.files.body":
      "Your resume, a cover letter, a certificate. We read it and propose items to staging — nothing enters your master without your say-so.",
    "fuentes.card.files.button": "Choose PDF or DOCX",

    // Drop zones (the same gesture as the dump box, DropZone component)
    "fuentes.drop.files.bold": "Drop your PDF or DOCX here",
    "fuentes.drop.files.rest": " · or click to choose it",
    "fuentes.drop.images.bold": "Drop your screenshots here",
    "fuentes.drop.images.rest": " · or click to choose them",
    "fuentes.drop.li.bold": "Drop your LinkedIn PDF or screenshots here",
    "fuentes.drop.li.rest": " · or click to choose them",

    // Screenshots / images card
    "fuentes.card.images.name": "screenshots · images",
    "fuentes.card.images.tag": "transcribed verbatim",
    "fuentes.card.images.body":
      "PNG, JPG or WEBP. Transcribed word for word before extracting anything: what can't be read doesn't get made up.",
    "fuentes.card.images.button": "Choose images",

    // Pasted-text card
    "fuentes.card.paste.name": "text",
    "fuentes.card.paste.tag": "paste and extract",
    "fuentes.card.paste.body":
      "Paste whatever you have — a draft, a job description, loose notes. We extract with evidence.",
    "fuentes.card.paste.open": "Paste text",
    "fuentes.card.paste.placeholder": "Paste your experience, a resume as text, notes…",
    "fuentes.card.paste.submit": "Extract with evidence",
    "fuentes.card.paste.cancel": "cancel",

    // Link (URL) card
    "fuentes.card.url.name": "link",
    "fuentes.card.url.tag": "portfolio · blog · repo",
    "fuentes.card.url.body":
      "Paste the address of your portfolio, your blog or a repository. We read it and propose items to staging.",
    "fuentes.card.url.placeholder": "https://your-portfolio.com",
    "fuentes.card.url.submit": "Read link",

    // GitHub card (real, no AI)
    "fuentes.gh2.body":
      "We read your public repos through the official API — no AI, no hallucination. What you see is the API.",
    "fuentes.gh2.placeholder": "your-username",
    "fuentes.gh2.submit": "Read repos",
    "fuentes.gh2.readLabel": "read:",

    // LinkedIn — the three ways run inside the card
    "fuentes.li2.pastePlaceholder": "Ctrl+A and Ctrl+C on your LinkedIn profile, paste the text here…",
    "fuentes.li2.pasteSubmit": "Extract",
    "fuentes.li2.pasteName": "LinkedIn (pasted text)",

    // Per-row actions on an already-ingested source
    "fuentes.item.resync": "re-read",
    "fuentes.item.resyncBusy": "re-reading…",
    "fuentes.item.resyncPasteDisabled": "pasted text has no external origin to re-read",
    "fuentes.item.resynced": "re-read — {n} to staging",
    "fuentes.item.remove": "remove",
    "fuentes.item.removeBusy": "removing…",
    "fuentes.item.removeConfirm":
      "Remove this source? Its pending staging proposals are deleted. What you already accepted into your master stays (it loses the link to the source).",
    "fuentes.item.removeYes": "remove source",
    "fuentes.item.removeNo": "cancel",
  } as Record<string, string>,
} as const;
