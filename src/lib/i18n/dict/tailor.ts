/* i18n · namespace "tailor". Claves planas con prefijo "tailor.". ES = referencia; EN = copy.md.

   ⚠ ESTE NAMESPACE SE VACIÓ EN LA COSTURA G. Las ~40 claves anteriores eran el
   copy de una maqueta: el aviso de ejemplo, los tres grupos (HAVE/ADD/GAP), las
   reformulaciones y sus cifras («52 items», «10,6× entrevistas», «~40.000 tx
   diarias»). Todas describían el análisis de una persona inventada y se pintaban
   como si fueran del usuario. No se «tradujeron»: se retiraron, con la pantalla
   que las mostraba. Ver la cabecera de TailorScreen.tsx.

   Las claves de aquí abajo NO afirman nada sobre el usuario: dicen qué falta,
   qué hará cuando exista (en futuro) y a dónde ir mientras tanto. */
export const tailor = {
  es: {
    // Barra superior.
    "tailor.toolbarNote": "todavía sin construir",

    // El hueco, dicho de frente.
    "tailor.voidOverline": "Adaptar a un aviso · todavía sin construir",
    "tailor.voidTitle": "Aquí no hay análisis que enseñarte.",
    "tailor.voidBody":
      "Contrastar un aviso contra tu master es la pieza que falta. Cuando exista, responderá con hechos en tres grupos —lo que ya está en esta variante, lo que está en tu master y no en ella, y lo que no está en ninguna parte— y nunca con un score ni un porcentaje de match.",
    // La regla, no una disculpa.
    "tailor.voidEthic":
      "Hasta entonces esta pantalla no te enseña el análisis de nadie. Antes que un ejemplo con cifras inventadas rotulado como tuyo, nada.",

    // Las salidas que sí funcionan.
    "tailor.voidNextOverline": "Lo que sí puedes hacer ahora",
    "tailor.voidFitNote":
      "Vive dentro del editor de esta variante. Mide el PDF real —el mismo que se descarga— y propone qué quitar, qué reordenar y qué acortar. Se acepta propuesta a propuesta; no se aplica nada solo.",
    "tailor.voidMasterCta": "Revisar tu master",
    "tailor.voidMasterNote":
      "De ahí sale todo lo que puede entrar en una variante. Cuanto más completo esté, menos huecos tendrás delante de un aviso.",
  } as Record<string, string>,
  en: {
    // Top bar.
    "tailor.toolbarNote": "not built yet",

    // The gap, stated plainly.
    "tailor.voidOverline": "Tailor to a posting · not built yet",
    "tailor.voidTitle": "There's no analysis to show you here.",
    "tailor.voidBody":
      "Checking a posting against your master is the missing piece. Once it exists, it will answer with facts in three groups —what's already in this variant, what's in your master but not in it, and what's nowhere at all— and never with a score or a match percentage.",
    // The rule, not an apology.
    "tailor.voidEthic":
      "Until then this screen won't show you anybody's analysis. Rather than a sample with made-up numbers labelled as yours, nothing.",

    // The exits that do work.
    "tailor.voidNextOverline": "What you can actually do now",
    "tailor.voidFitNote":
      "It lives inside this variant's editor. It measures the real PDF —the same one you download— and proposes what to drop, what to reorder and what to shorten. You accept one proposal at a time; nothing applies itself.",
    "tailor.voidMasterCta": "Review your master",
    "tailor.voidMasterNote":
      "Everything a variant can draw from lives there. The fuller it is, the fewer gaps a posting will find.",
  } as Record<string, string>,
} as const;
