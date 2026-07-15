/* i18n · namespace "master". Claves planas con prefijo "master.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "master". */
export const master = {
  es: {
    // Barra de herramientas
    "master.searchAria": "Buscar en tu registro",
    "master.searchPlaceholder": "Buscar en tu registro… (título, viñeta, skill)",
    "master.filtersAria": "Filtros",
    "master.filter.all": "todo",
    "master.filter.noEvidence": "⚠ sin evidencia",
    "master.filter.noDates": "sin fechas",
    "master.noNumber": "sin cifra",

    // Estado / contador
    "master.reading": "leyendo…",
    "master.item": "item",
    "master.items": "items",
    "master.role": "rol",
    "master.roles": "roles",
    "master.bullet": "viñeta",
    "master.bullets": "viñetas",
    "master.source": "fuente",
    "master.sources": "fuentes",
    "master.itemsMatch": "{n} items coinciden",

    // Intro
    "master.intro.a": "Tu archivo completo — aquí cabe todo tu historial aunque cada variante muestre una parte.",
    "master.intro.b": "Haz clic en cualquier texto y edítalo ahí mismo",
    "master.intro.c": "; cada item recuerda de dónde salió.",
    "master.addManual": "+ Añadir item manual",
    "master.addManualMock": "En producto: fila nueva editable al foco, origen: manual. (Mock)",

    // Origen
    "master.originPrefix": "origen: ",
    "master.srcEdited": "origen: editado por ti · ahora ▾",
    "master.origin.manual": "escrito por ti",
    "master.origin.github": "github",
    "master.origin.aiRephrased": "reformulado por IA",
    "master.origin.aiTranslated": "traducido por IA",
    "master.origin.extracted": "texto pegado",
    "master.origin.questionnaire": "cuestionario",
    "master.frag.manual": "escrito por ti — el origen manual es el más verificable de todos.",
    "master.frag.none": "Sin fragmento de origen registrado — revísalo.",

    // Grupos
    "master.fold.collapse": "plegar",
    "master.fold.expand": "desplegar",
    "master.group.summary": "Resumen",
    "master.group.experience": "Experiencia",
    "master.group.skills": "Skills — con su evidencia",
    "master.group.projects": "Proyectos",
    "master.group.education": "Educación y certificaciones",
    "master.eachVariantPicks": "cada variante elige los suyos",
    "master.addRole": "+ añadir rol",
    "master.addSkill": "+ añadir skill (quedará como origen: tú)",

    // Skills
    "master.ver.ok": "verificado",
    "master.ver.partial": "parcial",
    "master.ver.none": "sin evidencia",
    "master.whereUsed": "¿Dónde lo usaste?",
    "master.skillAnswer": "responder — quedará como origen: tú",

    // Avisos
    "master.warn.missingDate": "falta fecha",
    "master.warn.missingEndDate": "falta fecha de término",
    "master.warn.missingName": "falta tu nombre",

    // Etiquetas accesibles (aria)
    "master.aria.editRoleTitle": "Editar título del rol: ",
    "master.aria.editBullet": "Editar viñeta",
    "master.aria.editItem": "Editar elemento",
    "master.aria.editSummary": "Editar resumen",
    "master.aria.editName": "Editar nombre",
    "master.aria.editPrefix": "Editar ",
    "master.aria.linkLabel": "Etiqueta del enlace",
    "master.aria.linkUrl": "URL del enlace",
    "master.aria.removeLink": "Quitar enlace",

    // Contacto (basics)
    "master.contact.overline": "Perfil / Contacto",
    "master.contact.cnt": "se imprime en el cuerpo del CV",
    "master.contact.add": "+ Añadir datos de contacto",
    "master.contact.label": "Título",
    "master.contact.labelMiss": "p. ej. Backend Engineer",
    "master.contact.email": "Email",
    "master.contact.miss": "falta — sale vacío en el CV",
    "master.contact.phone": "Teléfono",
    "master.contact.location": "Ciudad",
    "master.contact.locationMiss": "p. ej. Santiago, Chile (RM)",
    "master.contact.links": "Enlaces",
    "master.contact.linksEmpty":
      "LinkedIn, GitHub, portafolio, un paper, una charla… la etiqueta es para ti; la URL es lo que importa.",
    "master.contact.addLink": "+ añadir enlace",
    "master.link.labelPlaceholder": "etiqueta (opcional)",
    "master.link.urlPlaceholder": "url — es lo que lee el ATS (linkedin.com/in/…, github.com/…)",

    // Carga
    "master.loadingRecord": "Leyendo tu registro…",

    // Estado vacío
    "master.empty.overline": "Master vacío",
    "master.empty.title": "Aún no hay registro.",
    "master.empty.body": "Vuélcalo con IA en 5 minutos, o escríbelo de cero con la IA apagada.",
    "master.empty.dump": "Volcar lo que tengo",
    "master.empty.scratch": "Escribir de cero",

    // Notas de guardado (transitorias)
    "master.saved.localEdit": "editado (modo local)",
    "master.saved.fail": "no se pudo guardar",
    "master.saved.contactAddedLocal": "bloque de contacto añadido (modo local)",
    "master.saved.contactAdded": "bloque de contacto añadido ✓",
    "master.saved.contactAddFail": "no se pudo añadir",
  } as Record<string, string>,
  en: {
    // Toolbar
    "master.searchAria": "Search your record",
    "master.searchPlaceholder": "Search your record… (title, bullet, skill)",
    "master.filtersAria": "Filters",
    "master.filter.all": "all",
    "master.filter.noEvidence": "⚠ no evidence",
    "master.filter.noDates": "no dates",
    "master.noNumber": "no number",

    // Status / counter
    "master.reading": "reading…",
    "master.item": "item",
    "master.items": "items",
    "master.role": "role",
    "master.roles": "roles",
    "master.bullet": "bullet",
    "master.bullets": "bullets",
    "master.source": "source",
    "master.sources": "sources",
    "master.itemsMatch": "{n} matching items",

    // Intro
    "master.intro.a": "Your complete archive — your whole history fits here even if each variant shows only part of it.",
    "master.intro.b": "Click any text and edit it in place",
    "master.intro.c": "; every item remembers where it came from.",
    "master.addManual": "+ Add manual item",
    "master.addManualMock": "In production: a new editable row on focus, origin: manual. (Mock)",

    // Origin
    "master.originPrefix": "origin: ",
    "master.srcEdited": "origin: edited by you · just now ▾",
    "master.origin.manual": "written by you",
    "master.origin.github": "github",
    "master.origin.aiRephrased": "rephrased by AI",
    "master.origin.aiTranslated": "translated by AI",
    "master.origin.extracted": "pasted text",
    "master.origin.questionnaire": "questionnaire",
    "master.frag.manual": "written by you — manual origin is the most verifiable of all.",
    "master.frag.none": "No source fragment recorded — check it.",

    // Groups
    "master.fold.collapse": "collapse",
    "master.fold.expand": "expand",
    "master.group.summary": "Summary",
    "master.group.experience": "Experience",
    "master.group.skills": "Skills — with their evidence",
    "master.group.projects": "Projects",
    "master.group.education": "Education & certifications",
    "master.eachVariantPicks": "each variant picks its own",
    "master.addRole": "+ add role",
    "master.addSkill": "+ add skill (it'll be marked origin: you)",

    // Skills
    "master.ver.ok": "verified",
    "master.ver.partial": "partial",
    "master.ver.none": "no evidence",
    "master.whereUsed": "Where did you use it?",
    "master.skillAnswer": "answer — it'll be marked origin: you",

    // Warnings
    "master.warn.missingDate": "missing date",
    "master.warn.missingEndDate": "missing end date",
    "master.warn.missingName": "your name is missing",

    // Accessible labels (aria)
    "master.aria.editRoleTitle": "Edit role title: ",
    "master.aria.editBullet": "Edit bullet",
    "master.aria.editItem": "Edit item",
    "master.aria.editSummary": "Edit summary",
    "master.aria.editName": "Edit name",
    "master.aria.editPrefix": "Edit ",
    "master.aria.linkLabel": "Link label",
    "master.aria.linkUrl": "Link URL",
    "master.aria.removeLink": "Remove link",

    // Contact (basics)
    "master.contact.overline": "Profile / Contact",
    "master.contact.cnt": "printed in the body of your resume",
    "master.contact.add": "+ Add contact details",
    "master.contact.label": "Title",
    "master.contact.labelMiss": "e.g. Backend Engineer",
    "master.contact.email": "Email",
    "master.contact.miss": "missing — it'll be blank on your resume",
    "master.contact.phone": "Phone",
    "master.contact.location": "City",
    "master.contact.locationMiss": "e.g. Santiago, Chile (RM)",
    "master.contact.links": "Links",
    "master.contact.linksEmpty":
      "LinkedIn, GitHub, a portfolio, a paper, a talk… the label is for you; the URL is what matters.",
    "master.contact.addLink": "+ add link",
    "master.link.labelPlaceholder": "label (optional)",
    "master.link.urlPlaceholder": "url — it's what the ATS reads (linkedin.com/in/…, github.com/…)",

    // Loading
    "master.loadingRecord": "Reading your record…",

    // Empty state
    "master.empty.overline": "Empty master",
    "master.empty.title": "No record yet.",
    "master.empty.body": "Dump it with AI in 5 minutes, or write it from scratch with AI off.",
    "master.empty.dump": "Dump what I have",
    "master.empty.scratch": "Write from scratch",

    // Save notes (transient)
    "master.saved.localEdit": "edited (local mode)",
    "master.saved.fail": "couldn't save",
    "master.saved.contactAddedLocal": "contact block added (local mode)",
    "master.saved.contactAdded": "contact block added ✓",
    "master.saved.contactAddFail": "couldn't add",
  } as Record<string, string>,
} as const;
