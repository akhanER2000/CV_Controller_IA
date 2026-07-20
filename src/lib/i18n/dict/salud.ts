/* i18n · namespace "salud". Claves planas con prefijo "salud.". ES = referencia; EN = copy.md.

   ⚠ ESTE NAMESPACE SE VACIÓ EN LA COSTURA G. Las claves anteriores contenían:
     · los cuatro hallazgos inventados (c1..c4) con sus citas — «2 viñetas de la
       página 1 no llevan ninguna cifra», «una viñeta ocupa 4 líneas»… — que
       nadie había medido y se presentaban como el diagnóstico del CV del usuario;
     · el bloque «lo garantizado por construcción» (g1..g5), retirado porque hoy
       es FALSO: el catálogo de plantillas incluye layouts de 2 columnas con
       sidebar y foto (src/lib/cv/catalog.ts), así que «una sola columna» y «cero
       fotos» ya no son garantías del motor. Volverán cuando se puedan afirmar
       POR PLANTILLA.
   Ver la cabecera de SaludScreen.tsx.

   Se conservan salud.sectionLabel y las etiquetas [fuente]/[criterio]: la
   distinción entre evidencia citada y criterio propio es doctrina del producto y
   sigue en pie en el copy de esta pantalla. */
export const salud = {
  es: {
    // Barra superior.
    "salud.sectionLabel": "SALUD DE LA VARIANTE",
    // Donde antes iba «4 hallazgos · 0 bloqueantes» derivado de datos inventados.
    "salud.barPending": "sin análisis todavía",

    // Las dos etiquetas del producto (se siguen usando en el cuerpo).
    "salud.tag.source": "[fuente]",
    "salud.tag.criterion": "[criterio]",

    // El hueco, dicho de frente.
    "salud.voidOverline": "Salud de la variante · todavía sin construir",
    "salud.voidTitle": "Aquí no hay hallazgos que enseñarte.",
    "salud.voidBody.pre":
      "Cuando exista, esta pantalla dirá solo lo que puede fallar, y cada hallazgo traerá su respaldo: ",
    "salud.voidBody.mid": " es evidencia citada, ",
    "salud.voidBody.post":
      " es una decisión de diseño nuestra, dicha como tal. Sin score, sin barras y sin umbrales. Lo que está bien no aparecerá: el silencio es la señal.",
    // La regla, no una disculpa.
    "salud.voidEthic":
      "Hasta entonces no te enseñamos hallazgos de ejemplo. Un aviso falso sobre tu CV es peor que ninguno: te haría cambiar algo que estaba bien.",

    // Las salidas que sí funcionan.
    "salud.voidNextOverline": "Lo que sí puedes revisar ahora",
    "salud.voidMasterCta": "Revisar tu master",
    "salud.voidMasterNote":
      "Trae filtros de calidad que sí están cableados: sin evidencia, sin fechas y posibles duplicados. Es donde de verdad se arregla lo que un CV arrastra.",
    "salud.voidVariantCta": "Abrir esta variante",
    "salud.voidVariantNote":
      "En su editor ves cada viñeta con su origen, y «Ajustar a dos páginas» mide el PDF real y propone qué quitar o acortar.",
  } as Record<string, string>,
  en: {
    // Top bar.
    "salud.sectionLabel": "VARIANT HEALTH",
    // Where «4 findings · 0 blocking» used to sit, derived from invented data.
    "salud.barPending": "no analysis yet",

    // The product's two tags (still used in the body copy).
    "salud.tag.source": "[source]",
    "salud.tag.criterion": "[criterion]",

    // The gap, stated plainly.
    "salud.voidOverline": "Variant health · not built yet",
    "salud.voidTitle": "There are no findings to show you here.",
    "salud.voidBody.pre":
      "Once it exists, this screen will name only what can fail, and every finding will carry its backing: ",
    "salud.voidBody.mid": " is cited evidence, ",
    "salud.voidBody.post":
      " is a design decision of ours, stated as such. No score, no bars, no thresholds. What's fine won't show up: silence is the signal.",
    // The rule, not an apology.
    "salud.voidEthic":
      "Until then we won't show you sample findings. A false warning about your resume is worse than none: it would make you change something that was fine.",

    // The exits that do work.
    "salud.voidNextOverline": "What you can actually review now",
    "salud.voidMasterCta": "Review your master",
    "salud.voidMasterNote":
      "It carries quality filters that are actually wired up: no evidence, no dates and possible duplicates. That's where what a resume drags along really gets fixed.",
    "salud.voidVariantCta": "Open this variant",
    "salud.voidVariantNote":
      "Its editor shows every bullet with its origin, and 'Fit to two pages' measures the real PDF and proposes what to drop or shorten.",
  } as Record<string, string>,
} as const;
