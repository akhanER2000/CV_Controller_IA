/* i18n · namespace "ajustes". Claves planas con prefijo "ajustes.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "ajustes". */
export const ajustes = {
  es: {
    "ajustes.title": "Ajustes",

    // Flash (avisos efímeros de estado)
    "ajustes.flash.nameSaved": "Nombre guardado ✓",
    "ajustes.flash.keyParked": "Cifrado en preparación — la clave NO se guardó (nada de secretos en texto plano).",
    "ajustes.flash.keySaved": "Clave guardada ✓ (cifrada, no se muestra)",
    "ajustes.flash.keyIncluded": "Se usará la clave incluida ✓",
    "ajustes.flash.exported": "Registro descargado ✓",
    "ajustes.flash.exportError": "No se pudo exportar",

    // Cuenta
    "ajustes.account.overline": "Cuenta",
    "ajustes.name.label": "Nombre visible",
    "ajustes.name.hint": "el de tu menú, no el del CV",
    "ajustes.name.placeholder": "Tu nombre",
    "ajustes.email.label": "Email",
    "ajustes.email.hint": "el de la cuenta · edítalo en Perfil",
    "ajustes.email.aria": "Email de la cuenta",

    // Idioma y tema
    "ajustes.langTheme.overline": "Idioma y tema",
    "ajustes.lang.label": "Idioma de la interfaz",
    "ajustes.lang.hint": "tus CVs pueden ir en otro",
    "ajustes.lang.es": "Español",
    "ajustes.lang.en": "English",
    "ajustes.lang.note": "se aplica y se guarda al instante",
    "ajustes.theme.label": "Tema",
    "ajustes.theme.hint": "grafito de noche, porcelana de día",
    "ajustes.theme.dark": "Grafito",
    "ajustes.theme.light": "Porcelana",
    "ajustes.theme.auto": "Sistema",
    "ajustes.theme.note": "se aplica al instante — mira alrededor",

    // Inteligencia artificial
    "ajustes.ai.overline": "Inteligencia artificial",
    "ajustes.ai.label": "IA activada",
    "ajustes.ai.hint": "extracción · comparación · reformulación",
    "ajustes.ai.ariaOn": "IA activada",
    "ajustes.ai.ariaOff": "IA desactivada",
    "ajustes.ai.on": "encendida — nunca inventa; solo selecciona, reordena y reformula con origen",
    "ajustes.ai.off": "apagada — modo manual completo",

    // BYOK (tu propia clave)
    "ajustes.byok.label": "Tu propia clave",
    "ajustes.byok.hint": "BYOK — opcional",
    "ajustes.byok.hintSaved": " · hay una guardada",
    "ajustes.byok.included": "Incluida",
    "ajustes.byok.placeholder": "sk-… (se cifra, solo se usa en tus extracciones)",
    "ajustes.byok.placeholderSaved": "•••••••••• (guardada — escribe para cambiarla)",
    "ajustes.byok.aria": "Tu propia clave (BYOK)",
    "ajustes.byok.useIncluded": "Usar la incluida",
    "ajustes.byok.saveKey": "Guardar clave",

    // Nota de modo manual (IA apagada)
    "ajustes.manual.lead": "Modo manual — legítimo, no degradado.",
    "ajustes.manual.body1":
      " Se apagan: el volcado con extracción, el análisis de avisos y las reformulaciones. Sigue todo lo demás: master, variantes, overrides, preview-igual-al-PDF, rayos-X del ATS y salud. Los items que escribas quedan con ",
    "ajustes.manual.origin": "origen: tú",
    "ajustes.manual.body2": " — el más verificable de todos.",

    // Tus datos
    "ajustes.data.overline": "Tus datos",
    "ajustes.data.hint": "sin permiso, sin retención hostil",
    "ajustes.export.label": "Exportar todo",
    "ajustes.export.hint": "master · variantes (JSON)",
    "ajustes.export.button": "Descargar mi registro completo",
    "ajustes.export.detail": "master · variantes · overrides · evidencias",
    "ajustes.delete.label": "Borrar todo",
    "ajustes.delete.hint": "irreversible de verdad",
    "ajustes.delete.button": "Borrar mi cuenta y mis datos",
    "ajustes.delete.confirmPre": "Escribe ",
    "ajustes.delete.confirmPost": " para confirmar:",
    "ajustes.delete.aria": "Escribe BORRAR para confirmar",
    "ajustes.delete.deleting": "Borrando…",
    "ajustes.delete.confirmButton": "Borrar definitivamente",
    "ajustes.delete.error": "No se pudo borrar. Reintenta.",
  } as Record<string, string>,
  en: {
    "ajustes.title": "Settings",

    // Flash (ephemeral status notes)
    "ajustes.flash.nameSaved": "Name saved ✓",
    "ajustes.flash.keyParked": "Encryption not ready — the key was NOT saved (no plaintext secrets).",
    "ajustes.flash.keySaved": "Key saved ✓ (encrypted, never shown)",
    "ajustes.flash.keyIncluded": "The included key will be used ✓",
    "ajustes.flash.exported": "Record downloaded ✓",
    "ajustes.flash.exportError": "Couldn't export",

    // Account
    "ajustes.account.overline": "Account",
    "ajustes.name.label": "Display name",
    "ajustes.name.hint": "shown in your menu, not on your resume",
    "ajustes.name.placeholder": "Your name",
    "ajustes.email.label": "Email",
    "ajustes.email.hint": "the account one · edit it in Profile",
    "ajustes.email.aria": "Account email",

    // Language and theme
    "ajustes.langTheme.overline": "Language and theme",
    "ajustes.lang.label": "Interface language",
    "ajustes.lang.hint": "your resumes can be in another",
    "ajustes.lang.es": "Español",
    "ajustes.lang.en": "English",
    "ajustes.lang.note": "applied and saved instantly",
    "ajustes.theme.label": "Theme",
    "ajustes.theme.hint": "graphite by night, porcelain by day",
    "ajustes.theme.dark": "Graphite",
    "ajustes.theme.light": "Porcelain",
    "ajustes.theme.auto": "System",
    "ajustes.theme.note": "applied instantly — look around",

    // Artificial intelligence
    "ajustes.ai.overline": "Artificial intelligence",
    "ajustes.ai.label": "AI on",
    "ajustes.ai.hint": "extraction · comparison · rewriting",
    "ajustes.ai.ariaOn": "AI on",
    "ajustes.ai.ariaOff": "AI off",
    "ajustes.ai.on": "on — never invents; it only selects, reorders and rewrites with a source",
    "ajustes.ai.off": "off — full manual mode",

    // BYOK (your own key)
    "ajustes.byok.label": "Your own key",
    "ajustes.byok.hint": "BYOK — optional",
    "ajustes.byok.hintSaved": " · one is saved",
    "ajustes.byok.included": "Included",
    "ajustes.byok.placeholder": "sk-… (encrypted, used only for your extractions)",
    "ajustes.byok.placeholderSaved": "•••••••••• (saved — type to change it)",
    "ajustes.byok.aria": "Your own key (BYOK)",
    "ajustes.byok.useIncluded": "Use the included one",
    "ajustes.byok.saveKey": "Save key",

    // Manual-mode note (AI off)
    "ajustes.manual.lead": "Manual mode — legitimate, not degraded.",
    "ajustes.manual.body1":
      " Off: extraction, posting analysis, rewrites. Everything else stays: master, variants, overrides, preview-equals-PDF, ATS X-ray and health. What you write is marked ",
    "ajustes.manual.origin": "origin: you",
    "ajustes.manual.body2": " — the most verifiable of all.",

    // Your data
    "ajustes.data.overline": "Your data",
    "ajustes.data.hint": "no permission needed, no hostile retention",
    "ajustes.export.label": "Export everything",
    "ajustes.export.hint": "master · variants (JSON)",
    "ajustes.export.button": "Download my full record",
    "ajustes.export.detail": "master · variants · overrides · evidence",
    "ajustes.delete.label": "Delete everything",
    "ajustes.delete.hint": "genuinely irreversible",
    "ajustes.delete.button": "Delete my account and data",
    "ajustes.delete.confirmPre": "Type ",
    "ajustes.delete.confirmPost": " to confirm:",
    "ajustes.delete.aria": "Type BORRAR to confirm",
    "ajustes.delete.deleting": "Deleting…",
    "ajustes.delete.confirmButton": "Delete permanently",
    "ajustes.delete.error": "Couldn't delete. Try again.",
  } as Record<string, string>,
} as const;
