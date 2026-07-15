/* i18n · namespace "salud". Claves planas con prefijo "salud.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "salud". */
export const salud = {
  es: {
    // Barra superior + cabecera de sección
    "salud.sectionLabel": "SALUD DE LA VARIANTE",
    // Conteo derivado (#slN). Interpolación: {n} hallazgos · {b} bloqueantes.
    "salud.count.findings": "{n} hallazgos",
    "salud.count.blocking": " · {b} bloqueantes",

    // Encabezado
    "salud.overline": "Sin score, sin umbrales",
    "salud.title": "Solo lo que puede fallar.",
    "salud.tag.source": "[fuente]",
    "salud.tag.criterion": "[criterio]",
    // Toggle de la cita en cada hallazgo (la flecha ▾/▴ va aparte, es decorativa).
    "salud.source": "fuente",
    "salud.lead.pre": "Cada hallazgo trae su fuente — ",
    "salud.lead.mid": " es evidencia citada, ",
    "salud.lead.post":
      " es una decisión de diseño nuestra, dicha como tal. Lo que está bien no aparece: el silencio es la señal.",

    // Hallazgo c1
    "salud.c1.title": "2 viñetas de la página 1 no llevan ninguna cifra",
    "salud.c1.detail":
      "«Implementé el flujo de cupones…» y «Desarrollé y mantuve APIs…». ¿Cuánto movían? ¿Cuántos usuarios? ¿En cuánto tiempo? Una por una — tú decides cuáles lo ameritan.",
    "salud.c1.fix": "verlas en el editor →",
    "salud.c1.citeSrc": "[fuente — Jobscan 2025, n=384]",
    "salud.c1.cite1":
      " el 58,2% de reclutadores dice que lo que más destaca es un logro cuantificado. ",
    "salud.c1.citeBold": "No existe",
    "salud.c1.cite2":
      " un umbral de «% de viñetas con cifra» en ningún estudio — por eso te las señalamos una a una y no te damos un porcentaje.",

    // Hallazgo c2
    "salud.c2.title": "Una viñeta ocupa 4 líneas",
    "salud.c2.detail":
      "La del servicio de conciliación. En el escaneo de 7 segundos, las frases largas pierden: parte en dos o deja solo el resultado.",
    "salud.c2.fix": "recortarla →",
    "salud.c2.citeSrc": "[fuente — Ladders 2018, eye-tracking]",
    "salud.c2.cite1":
      " screening inicial promedio de 7,4 s; los CVs peor evaluados comparten «frases largas, clutter, poco espacio en blanco». n=30, estudio de vendor: dirección, no ley.",

    // Hallazgo c3
    "salud.c3.title": "El título no coincide con el último aviso que adaptaste",
    "salud.c3.detail":
      "El aviso pedía «Backend Engineer»; la variante dice «Backend Developer». Honesto y efectivo: «Backend Engineer (Ingeniero de Software III)».",
    "salud.c3.fix": "alinearlo →",
    "salud.c3.citeSrc": "[fuente — Jobscan, 2,5M postulaciones]",
    "salud.c3.cite1":
      " título del CV = título del aviso → 10,6× más entrevistas. Datos internos del vendor: úsalo para priorizar, no como promesa.",

    // Hallazgo c4
    "salud.c4.title": "La sección «Proyectos» queda huérfana al final de la página 2",
    "salud.c4.detail":
      "El encabezado entra pero solo cabe una línea de contenido. Sube un proyecto a la página 1 u oculta uno: un final limpio se lee mejor.",
    "salud.c4.fix": "reordenar →",
    "salud.c4.citeSrc": "[criterio]",
    "salud.c4.cite1":
      " decisión tipográfica nuestra, sin estudio detrás — y lo decimos. Disfrazar criterio de evidencia es exactamente lo que este producto no hace.",

    // Lo garantizado por construcción
    "salud.builtLabel":
      "Lo que no revisamos porque el motor lo garantiza por construcción — listarlo como logro sería teatro de tranquilidad",
    "salud.g1.b": "Una sola columna",
    "salud.g1.t": " — el parser lee de izquierda a derecha atravesando columnas [Greenhouse]",
    "salud.g2.b": "Cero tablas, headers o footers",
    "salud.g2.t":
      " — Workday los ignora: contacto siempre en el cuerpo [Greenhouse · Workday]",
    "salud.g3.b": "Cero iconos ni fotos",
    "salud.g3.t":
      " — «Email:» con letras; glifos no textuales se parsean como basura [Greenhouse · Robert Walters Chile]",
    "salud.g4.b": "Texto seleccionable",
    "salud.g4.t":
      " — «si no puedes seleccionar el texto, el documento no es parseable» [Lever, literal]",
    "salud.g5.b": "< 2,5 MB",
    "salud.g5.t": " — sobre eso Greenhouse no parsea el archivo [Greenhouse]",

    // Todo en orden (sin hallazgos)
    "salud.ok.line1": "Nada que señalar en esta variante.",
    "salud.ok.line2": "No hay medalla: el silencio es la señal.",
  } as Record<string, string>,
  en: {
    // Top bar + section header
    "salud.sectionLabel": "VARIANT HEALTH",
    // Derived count (#slN). Interpolation: {n} findings · {b} blocking.
    "salud.count.findings": "{n} findings",
    "salud.count.blocking": " · {b} blocking",

    // Header
    "salud.overline": "No score, no thresholds",
    "salud.title": "Only what can fail.",
    "salud.tag.source": "[source]",
    "salud.tag.criterion": "[criterion]",
    // Citation toggle on each finding (the ▾/▴ arrow stays separate, decorative).
    "salud.source": "source",
    "salud.lead.pre": "Every finding carries its source — ",
    "salud.lead.mid": " is cited evidence, ",
    "salud.lead.post":
      " is a design decision of ours, stated as such. What's fine doesn't show: silence is the signal.",

    // Finding c1
    "salud.c1.title": "2 bullets on page 1 carry no number at all",
    "salud.c1.detail":
      "'Implemented the coupon flow…' and 'Built and maintained APIs…'. How much did they move? How many users? In what time? One by one — you decide which ones deserve it.",
    "salud.c1.fix": "see them in the editor →",
    "salud.c1.citeSrc": "[source — Jobscan 2025, n=384]",
    "salud.c1.cite1":
      " 58.2% of recruiters say what stands out most is a quantified achievement. ",
    "salud.c1.citeBold": "There's no",
    "salud.c1.cite2":
      " threshold for a '% of bullets with a number' in any study — that's why we point them out one by one and don't give you a percentage.",

    // Finding c2
    "salud.c2.title": "One bullet runs 4 lines",
    "salud.c2.detail":
      "The reconciliation-service one. In the 7-second scan, long sentences lose: split it in two or keep only the result.",
    "salud.c2.fix": "trim it →",
    "salud.c2.citeSrc": "[source — Ladders 2018, eye-tracking]",
    "salud.c2.cite1":
      " initial screening averages 7.4 s; the worst-rated resumes share 'long sentences, clutter, little white space'. n=30, a vendor study: direction, not law.",

    // Finding c3
    "salud.c3.title": "The title doesn't match the last posting you tailored to",
    "salud.c3.detail":
      "The posting asked for 'Backend Engineer'; the variant says 'Backend Developer'. Honest and effective: 'Backend Engineer (Software Engineer III)'.",
    "salud.c3.fix": "align it →",
    "salud.c3.citeSrc": "[source — Jobscan, 2.5M applications]",
    "salud.c3.cite1":
      " resume title = posting title → 10.6× more interviews. Vendor's internal data: use it to prioritize, not as a promise.",

    // Finding c4
    "salud.c4.title": "The 'Projects' section is left orphaned at the end of page 2",
    "salud.c4.detail":
      "The heading fits but only one line of content does. Move a project up to page 1 or hide one: a clean ending reads better.",
    "salud.c4.fix": "reorder →",
    "salud.c4.citeSrc": "[criterion]",
    "salud.c4.cite1":
      " a typographic decision of ours, no study behind it — and we say so. Dressing up a criterion as evidence is exactly what this product doesn't do.",

    // Guaranteed by construction
    "salud.builtLabel":
      "What we don't check because the engine guarantees it by construction — listing it as a win would be reassurance theater",
    "salud.g1.b": "A single column",
    "salud.g1.t": " — the parser reads left to right across columns [Greenhouse]",
    "salud.g2.b": "Zero tables, headers or footers",
    "salud.g2.t":
      " — Workday ignores them: contact always in the body [Greenhouse · Workday]",
    "salud.g3.b": "Zero icons or photos",
    "salud.g3.t":
      " — 'Email:' in letters; non-text glyphs get parsed as garbage [Greenhouse · Robert Walters Chile]",
    "salud.g4.b": "Selectable text",
    "salud.g4.t":
      " — 'if you can't select the text, the document isn't parseable' [Lever, verbatim]",
    "salud.g5.b": "< 2.5 MB",
    "salud.g5.t": " — above that Greenhouse won't parse the file [Greenhouse]",

    // All in order (no findings)
    "salud.ok.line1": "Nothing to flag in this variant.",
    "salud.ok.line2": "No medal: silence is the signal.",
  } as Record<string, string>,
} as const;
