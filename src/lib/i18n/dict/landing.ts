/* ============================================================================
   i18n · namespace "landing" — la puerta pública (/).

   REGLA DURA DE ESTE ARCHIVO: aquí no entra ni una cifra inventada.
   Toda cifra que aparezca en un valor de este diccionario tiene que estar en
   prompts/00-INVESTIGACION.md, y tests/landing-claims.test.ts lo comprueba en
   cada build (ES y EN, con separador decimal indistinto). Si una cifra no se
   pudo rastrear hasta un estudio, no se cita: se calla.

   Por eso los DATOS DE EJEMPLO (el CV de Diego Gatica, el texto pegado de la
   demo) NO viven aquí sino en src/components/landing/demo-data.ts: son datos de
   una demostración declarada como tal, no afirmaciones sobre el mundo, y
   mezclarlos con la copia haría inútil el candado.

   El número de plantillas tampoco se escribe: sale de listTemplates() en tiempo
   de build y se inyecta en {n} / {a} / {b}.
   ============================================================================ */
export const landing = {
  es: {
    // ── Cabecera ──────────────────────────────────────────────────────────────
    "landing.nav.demo": "Cómo funciona",
    "landing.nav.ats": "Lo que lee el ATS",
    "landing.nav.plantillas": "Plantillas",
    "landing.nav.precio": "Precio",
    "landing.cta.login": "Entrar",
    "landing.cta.signup": "Crear cuenta",
    "landing.lang.aria": "Idioma de la página",
    "landing.skipToContent": "Saltar al contenido",

    // ── 1 · El problema ───────────────────────────────────────────────────────
    "landing.hero.overline": "El sistema de registro de tu carrera",
    "landing.hero.title":
      "No tienes un CV. Tienes una carrera, y cinco versiones desincronizadas de ella.",
    "landing.hero.lead":
      "Corpus guarda una sola vez cada cosa que hiciste —con la procedencia de cada dato— y de ahí se deriva cada CV que envías. Cambias tu cargo una vez, no en cinco archivos.",
    "landing.hero.cta": "Crear mi registro",
    "landing.hero.ctaAlt": "Ver lo que el ATS lee",
    "landing.hero.fine":
      "La descarga del PDF es gratis, siempre. Sin tarjeta y sin prueba que se auto-renueve.",

    // ── 2 · El momento mágico (demo pregrabada) ───────────────────────────────
    "landing.demo.overline": "El momento",
    "landing.demo.title": "Pega lo que tengas. El perfil se puebla.",
    "landing.demo.lead":
      "Un CV viejo, el texto de tu LinkedIn, la URL de tu portafolio. Corpus lo lee, distingue una viñeta de una habilidad y de un proyecto, y te muestra cada item junto al fragmento exacto del que salió.",
    "landing.demo.pasteLabel": "texto pegado",
    "landing.demo.run": "Extraer",
    "landing.demo.replay": "Ver otra vez",
    "landing.demo.log1": "leyendo el texto…",
    "landing.demo.log2": "clasificando: ¿viñeta, habilidad o proyecto?",
    "landing.demo.log3": "anclando cada item a su fragmento de origen…",
    "landing.demo.resultTitle": "Encontrado en tu texto",
    "landing.demo.origin": "origen: texto pegado, línea {n}",
    "landing.demo.verOk": "verificado",
    "landing.demo.verPartial": "parcial",
    "landing.demo.kind.perfil": "Perfil",
    "landing.demo.kind.experiencia": "Experiencia",
    "landing.demo.kind.vineta": "Viñeta",
    "landing.demo.kind.habilidades": "Habilidades",
    "landing.demo.kind.proyecto": "Proyecto",
    "landing.demo.kind.enlace": "Enlace",
    "landing.demo.pending":
      "Nada de esto está todavía en tu master: aceptas o descartas item por item, y lo descartado no se borra.",
    "landing.demo.disclaimer":
      "Demostración pregrabada, con un perfil de ejemplo (Diego Gatica, ficticio). Esta página no llama a ningún modelo de IA: lo que ves es una grabación, no una extracción en vivo.",

    // ── 3 · El split: tu PDF ⇄ lo que el ATS lee ──────────────────────────────
    "landing.split.overline": "El centro del asunto",
    "landing.split.title": "Tu PDF, y lo que el ATS realmente lee.",
    "landing.split.lead":
      "El reclutador no busca sobre tu PDF: busca sobre la base de datos que su sistema extrajo de él. Corpus te enseña las dos caras del mismo documento, siempre y sin pedirlo. Si el parser no lo lee, aquí no aparece.",
    "landing.split.docLabel": "tu PDF",
    "landing.split.rawLabel": "texto extraído — esto es lo que indexa el reclutador",
    "landing.split.sample": "documento de ejemplo",
    "landing.split.hint":
      "Pasa el cursor por una sección: es la misma información, en sus dos caras.",
    "landing.split.foot":
      "En la app este panel se vuelve a extraer del PDF real que acabas de generar, no de una copia paralela. En cada build el documento de ejemplo se renderiza, se re-parsea con el mismo tipo de extractor que usa un ATS y se comprueba que cada línea esté presente y en el orden de lectura correcto. Si no coincide, el build falla.",

    // ── Evidencia (las únicas cifras de la página) ─────────────────────────────
    "landing.ev.overline": "Por qué esto importa",
    "landing.ev.title": "Tres cifras, con su fuente y sus límites a la vista.",
    "landing.ev.sourceLabel": "fuente",
    "landing.ev.caveatLabel": "límites",
    "landing.ev.a.figure": "10,6×",
    "landing.ev.a.claim":
      "más probabilidad de entrevista cuando el cargo de tu CV coincide con el del aviso.",
    "landing.ev.a.source": "Jobscan, análisis de 2,5M de postulaciones.",
    "landing.ev.a.caveat":
      "Datos internos de sus propios usuarios: la dirección es sólida, la magnitud probablemente está inflada. Sirve para priorizar, no para prometer resultados.",
    "landing.ev.b.figure": "76,4%",
    "landing.ev.b.claim":
      "de los reclutadores filtra por habilidades dentro del ATS. Es el filtro más usado de todos.",
    "landing.ev.b.source": "Jobscan, State of the Job Search 2025, n=384 reclutadores.",
    "landing.ev.b.caveat":
      "Encuesta del propio Jobscan, que vende herramientas de CV. Tómalo como orden de magnitud.",
    "landing.ev.c.figure": "7,4 s",
    "landing.ev.c.claim":
      "dura la primera lectura de un CV, y en ese rato el reclutador mira sobre todo los cargos.",
    "landing.ev.c.source": "Ladders, estudio de eye-tracking, 2018.",
    "landing.ev.c.caveat":
      "n=30 reclutadores, estudio de proveedor, no revisado por pares. Es una dirección, no una ley.",
    "landing.ev.foot":
      "El mito de que “los ATS rechazan solos la mayoría de los CVs” no aparece en esta página porque no es cierto: se rastrea hasta un proveedor que quebró sin publicar nunca su metodología. El riesgo real no es el rechazo automático — es quedar mal extraído y, por lo tanto, invisible en las búsquedas del reclutador.",

    // ── 4 · La promesa anti-alucinación ───────────────────────────────────────
    "landing.anti.overline": "La regla que no se rompe",
    "landing.anti.title":
      "Cada línea de tu CV apunta a algo que tú escribiste. Si la IA no puede rastrearlo, no lo escribe.",
    "landing.anti.lead":
      "La especificidad verificable —el nombre real del sistema, la magnitud real, la restricción concreta— es justo lo que una IA no puede inventar. Por eso el modelo aquí no redacta tu carrera: la ordena.",
    "landing.anti.a.title": "Selecciona, no inventa",
    "landing.anti.a.body":
      "La IA solo puede elegir, reordenar y reformular hechos que ya están en tu master. No tiene permiso para añadir uno nuevo.",
    "landing.anti.b.title": "Cada item cita su origen",
    "landing.anti.b.body":
      "El fragmento exacto del documento del que salió, guardado junto al dato. Puedes abrirlo y leerlo cuando quieras, meses después.",
    "landing.anti.c.title": "Lo que no se puede rastrear queda señalado",
    "landing.anti.c.body":
      "No se borra ni se disimula: se marca “sin evidencia”, con borde punteado, y decides tú qué hacer con ello.",
    "landing.anti.verNone": "sin evidencia",
    "landing.anti.exampleTitle": "Así se ve tu master por dentro",
    "landing.anti.exampleNote":
      "Nunca solo color: icono, texto y borde. El nivel de verificación se lee incluso impreso en blanco y negro.",

    // ── 5 · El catálogo de plantillas ─────────────────────────────────────────
    "landing.tpl.overline": "El documento",
    "landing.tpl.title": "{n} plantillas. Cada una dice la verdad sobre sí misma.",
    "landing.tpl.lead":
      "La gama ATS es de una columna, sin foto, sin barras de nivel y sin iconos: es la lista literal de causas de fallo de parseo que documentan los propios ATS. La variedad no sale del layout, sale de la tipografía, del ritmo vertical, del peso y del filete.",
    "landing.tpl.count": "{a} de gama ATS · {b} de gama visual",
    "landing.tpl.atsLabel": "ATS",
    "landing.tpl.visualLabel": "visual",
    "landing.tpl.warn":
      "Las de gama visual se ven mejor y parsean peor. Lo advierten ellas mismas, en su ficha, antes de que elijas — y esa advertencia es obligatoria para entrar al catálogo.",
    "landing.tpl.same":
      "El texto que el ATS extrae es el mismo en todas las plantillas de una columna: cambiar de plantilla cambia cómo te ven, no lo que el reclutador puede buscar.",

    // ── 6 · Precio honesto ────────────────────────────────────────────────────
    "landing.price.overline": "Precio",
    "landing.price.title": "La descarga es gratis. Siempre.",
    "landing.price.a": "Descargar tu PDF no cuesta nada y no pide tarjeta. No hay una versión del producto en la que sí.",
    "landing.price.b":
      "Sin prueba gratis que se convierta sola en una suscripción, y sin laberinto para cancelar.",
    "landing.price.c":
      "Si prefieres, traes tu propia clave de IA y pagas tus extracciones directo al proveedor.",
    "landing.price.d":
      "Tus datos son tuyos: exportas todo o borras todo desde Ajustes, sin pedir permiso.",

    // ── Cierre ────────────────────────────────────────────────────────────────
    "landing.end.title": "Empieza por pegar lo que ya tienes.",
    "landing.end.lead":
      "No hay formulario en blanco. Traes un CV viejo, un perfil o una URL, y sales con un master del que cuelgan todas tus versiones.",
    "landing.end.cta": "Crear mi registro",
    "landing.end.alt": "Ya tengo cuenta",

    // ── Pie ───────────────────────────────────────────────────────────────────
    "landing.footer.claim":
      "Un registro canónico de tu carrera. Cada CV, una vista de él — no una copia.",
    "landing.footer.sources":
      "Las cifras de esta página salen del anexo de investigación del proyecto, con su fuente y sus límites a la vista. Las que no se pudieron rastrear hasta un estudio no aparecen.",
  } as Record<string, string>,

  en: {
    // ── Header ────────────────────────────────────────────────────────────────
    "landing.nav.demo": "How it works",
    "landing.nav.ats": "What the ATS reads",
    "landing.nav.plantillas": "Templates",
    "landing.nav.precio": "Pricing",
    "landing.cta.login": "Sign in",
    "landing.cta.signup": "Create account",
    "landing.lang.aria": "Page language",
    "landing.skipToContent": "Skip to content",

    // ── 1 · The problem ───────────────────────────────────────────────────────
    "landing.hero.overline": "The system of record for your career",
    "landing.hero.title":
      "You don't have a resume. You have a career — and five out-of-sync versions of it.",
    "landing.hero.lead":
      "Corpus stores each thing you did once —with the provenance of every fact— and every resume you send is derived from it. You change your job title once, not in five files.",
    "landing.hero.cta": "Create my record",
    "landing.hero.ctaAlt": "See what the ATS reads",
    "landing.hero.fine":
      "Downloading your PDF is free, always. No card, and no trial that renews itself.",

    // ── 2 · The magic moment (pre-recorded demo) ──────────────────────────────
    "landing.demo.overline": "The moment",
    "landing.demo.title": "Paste whatever you have. The profile fills itself in.",
    "landing.demo.lead":
      "An old resume, the text of your LinkedIn, the URL of your portfolio. Corpus reads it, tells a bullet from a skill from a project, and shows you every item next to the exact fragment it came from.",
    "landing.demo.pasteLabel": "pasted text",
    "landing.demo.run": "Extract",
    "landing.demo.replay": "Play again",
    "landing.demo.log1": "reading the text…",
    "landing.demo.log2": "classifying: bullet, skill or project?",
    "landing.demo.log3": "anchoring every item to its source fragment…",
    "landing.demo.resultTitle": "Found in your text",
    "landing.demo.origin": "source: pasted text, line {n}",
    "landing.demo.verOk": "verified",
    "landing.demo.verPartial": "partial",
    "landing.demo.kind.perfil": "Profile",
    "landing.demo.kind.experiencia": "Experience",
    "landing.demo.kind.vineta": "Bullet",
    "landing.demo.kind.habilidades": "Skills",
    "landing.demo.kind.proyecto": "Project",
    "landing.demo.kind.enlace": "Link",
    "landing.demo.pending":
      "None of this is in your master yet: you accept or discard item by item, and what you discard isn't deleted.",
    "landing.demo.disclaimer":
      "Pre-recorded demo, with an example profile (Diego Gatica, fictional). This page calls no AI model: what you see is a recording, not a live extraction.",

    // ── 3 · The split: your PDF ⇄ what the ATS reads ──────────────────────────
    "landing.split.overline": "The heart of it",
    "landing.split.title": "Your PDF, and what the ATS actually reads.",
    "landing.split.lead":
      "The recruiter doesn't search your PDF: they search the database their system extracted from it. Corpus shows you both faces of the same document, always, without being asked. If the parser can't read it, it isn't here.",
    "landing.split.docLabel": "your PDF",
    "landing.split.rawLabel": "extracted text — this is what the recruiter's search indexes",
    "landing.split.sample": "example document",
    "landing.split.hint": "Hover a section: it's the same information, in both of its faces.",
    "landing.split.foot":
      "In the app this panel is re-extracted from the actual PDF you just generated, not from a parallel copy. On every build the example document is rendered, re-parsed with the same kind of extractor an ATS uses, and checked line by line for presence and reading order. If it doesn't match, the build fails.",

    // ── Evidence (the only figures on the page) ───────────────────────────────
    "landing.ev.overline": "Why this matters",
    "landing.ev.title": "Three figures, with their source and their limits in plain sight.",
    "landing.ev.sourceLabel": "source",
    "landing.ev.caveatLabel": "limits",
    "landing.ev.a.figure": "10.6×",
    "landing.ev.a.claim":
      "more likely to get an interview when your resume's job title matches the posting's.",
    "landing.ev.a.source": "Jobscan, analysis of 2.5M applications.",
    "landing.ev.a.caveat":
      "Internal data from their own users: the direction is solid, the magnitude is probably inflated. Use it to prioritise, not to promise results.",
    "landing.ev.b.figure": "76.4%",
    "landing.ev.b.claim":
      "of recruiters filter by skills inside the ATS. It is the single most used filter.",
    "landing.ev.b.source": "Jobscan, State of the Job Search 2025, n=384 recruiters.",
    "landing.ev.b.caveat":
      "A survey by Jobscan itself, which sells resume tools. Take it as an order of magnitude.",
    "landing.ev.c.figure": "7.4 s",
    "landing.ev.c.claim":
      "is how long the first read of a resume lasts — and in that time recruiters look mostly at job titles.",
    "landing.ev.c.source": "Ladders, eye-tracking study, 2018.",
    "landing.ev.c.caveat":
      "n=30 recruiters, vendor study, not peer-reviewed. A direction, not a law.",
    "landing.ev.foot":
      "The myth that “ATSs auto-reject most resumes” isn't on this page because it isn't true: it traces back to a vendor that went under without ever publishing a methodology. The real risk isn't automatic rejection — it's being badly extracted and therefore invisible in the recruiter's searches.",

    // ── 4 · The anti-hallucination promise ────────────────────────────────────
    "landing.anti.overline": "The rule that doesn't bend",
    "landing.anti.title":
      "Every line of your resume points at something you wrote. If the AI can't trace it, it doesn't write it.",
    "landing.anti.lead":
      "Verifiable specificity —the real system name, the real magnitude, the concrete constraint— is exactly what an AI cannot invent. That's why the model here doesn't write your career: it orders it.",
    "landing.anti.a.title": "It selects, it doesn't invent",
    "landing.anti.a.body":
      "The AI can only pick, reorder and rephrase facts that are already in your master. It has no permission to add a new one.",
    "landing.anti.b.title": "Every item cites its source",
    "landing.anti.b.body":
      "The exact fragment of the document it came from, stored next to the fact. You can open it and read it whenever you want, months later.",
    "landing.anti.c.title": "What can't be traced is flagged",
    "landing.anti.c.body":
      "It isn't deleted or hidden: it's marked “no evidence”, with a dashed border, and you decide what to do about it.",
    "landing.anti.verNone": "no evidence",
    "landing.anti.exampleTitle": "This is your master from the inside",
    "landing.anti.exampleNote":
      "Never colour alone: icon, text and border. The verification level reads even printed in black and white.",

    // ── 5 · The template catalogue ────────────────────────────────────────────
    "landing.tpl.overline": "The document",
    "landing.tpl.title": "{n} templates. Each one tells the truth about itself.",
    "landing.tpl.lead":
      "The ATS range is one column, no photo, no skill bars and no icons: it is the literal list of parse-failure causes the ATSs themselves document. The variety doesn't come from the layout — it comes from the typography, the vertical rhythm, the weight and the rule.",
    "landing.tpl.count": "{a} in the ATS range · {b} in the visual range",
    "landing.tpl.atsLabel": "ATS",
    "landing.tpl.visualLabel": "visual",
    "landing.tpl.warn":
      "The visual ones look better and parse worse. They say so themselves, on their own card, before you choose — and that warning is mandatory to enter the catalogue.",
    "landing.tpl.same":
      "The text an ATS extracts is the same across every one-column template: changing template changes how you look, not what the recruiter can search for.",

    // ── 6 · Honest pricing ────────────────────────────────────────────────────
    "landing.price.overline": "Pricing",
    "landing.price.title": "The download is free. Always.",
    "landing.price.a":
      "Downloading your PDF costs nothing and asks for no card. There is no version of the product where it does.",
    "landing.price.b":
      "No free trial that quietly turns into a subscription, and no maze to cancel.",
    "landing.price.c":
      "If you'd rather, bring your own AI key and pay for your extractions straight to the provider.",
    "landing.price.d":
      "Your data is yours: export everything or delete everything from Settings, no questions asked.",

    // ── Closing ───────────────────────────────────────────────────────────────
    "landing.end.title": "Start by pasting what you already have.",
    "landing.end.lead":
      "There's no blank form. You bring an old resume, a profile or a URL, and you leave with a master that every one of your versions hangs from.",
    "landing.end.cta": "Create my record",
    "landing.end.alt": "I already have an account",

    // ── Footer ────────────────────────────────────────────────────────────────
    "landing.footer.claim":
      "One canonical record of your career. Every resume is a view of it — not a copy.",
    "landing.footer.sources":
      "The figures on this page come from the project's research annex, with their source and their limits in plain sight. The ones that couldn't be traced to a study aren't here.",
  } as Record<string, string>,
} as const;
