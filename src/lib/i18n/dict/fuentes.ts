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
  } as Record<string, string>,
} as const;
