/* i18n · namespace "ajustes". Claves planas con prefijo "ajustes.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "ajustes". */
export const ajustes = {
  es: {
    "ajustes.title": "Ajustes",

    // Flash (avisos efímeros de estado)
    "ajustes.flash.nameSaved": "Nombre guardado ✓",
    // ★ El mensaje ACCIONABLE. El anterior («cifrado en preparación») sonaba a función a
    //   medio hacer: el usuario lo leía como un fallo del producto. Es lo contrario —el
    //   candado funcionando— y lo que falta es una variable de entorno. Se dice cuál.
    "ajustes.flash.keyParked":
      "Falta configurar CORPUS_ENCRYPTION_KEY en el servidor. Hasta entonces no se guarda ninguna clave — a propósito, para no dejar secretos en claro.",
    "ajustes.flash.keySaved": "Clave guardada ✓ (cifrada, no se muestra)",
    "ajustes.flash.keyIncluded": "Se usará la clave incluida ✓",
    "ajustes.flash.key2Saved": "2ª clave guardada ✓ (cifrada, no se muestra)",
    "ajustes.flash.key2Parked":
      "Falta configurar CORPUS_ENCRYPTION_KEY en el servidor. Hasta entonces no se guarda ninguna clave — a propósito, para no dejar secretos en claro.",
    "ajustes.flash.key2Unavailable": "Falta aplicar la migración 0006 (llm_api_key_2): la 2ª clave no se pudo guardar.",
    "ajustes.flash.key2Cleared": "2ª clave quitada ✓ — todo vuelve a Gemini",
    "ajustes.flash.modeloSaved": "Modelo guardado ✓ — se probó antes de guardarlo",
    "ajustes.flash.modeloRegistro": "Vuelves al modelo del registro ✓",
    "ajustes.flash.modeloNoResponde": "Ese modelo no respondió — no se guarda nada",
    "ajustes.flash.modeloSinColumna": "Falta la columna llm_model en user_settings: la elección no se pudo guardar.",
    "ajustes.flash.modeloError": "No se pudo guardar la elección.",

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

    // ★ Candado del cifrado. Cuando el servidor no tiene CORPUS_ENCRYPTION_KEY, el campo
    //   se CIERRA con su motivo al lado: aceptar el texto para tirarlo después hace
    //   perder el tiempo y parece un producto roto. Es lo contrario: es el candado.
    "ajustes.byok.lockedBadge": "Campo cerrado · sin cifrado en el servidor",
    "ajustes.byok.lockedWhy":
      "Falta configurar CORPUS_ENCRYPTION_KEY en el servidor. Hasta entonces no se guarda ninguna clave — a propósito, para no dejar secretos en claro.",
    "ajustes.byok.lockedHow":
      "Genérala con  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"  (o  openssl rand -base64 32 ) y ponla en .env.local y en las variables de entorno de Vercel.",
    "ajustes.byok.lockedPlaceholder": "cerrado hasta que haya cifrado en el servidor",
    "ajustes.byok.parkedSaved":
      "Hay una clave guardada que HOY no se puede descifrar (falta o cambió CORPUS_ENCRYPTION_KEY): está aparcada, no se usa. Vuelve a pegarla cuando el servidor pueda cifrar.",

    // BYOK · segunda clave (§H) — el proveedor BARATO del router por coste (Groq)
    "ajustes.byok2.label": "Segunda clave · proveedor barato",
    "ajustes.byok2.hint": "BYOK — opcional · router por coste",
    "ajustes.byok2.hintSaved": " · hay una guardada",
    "ajustes.byok2.placeholder": "gsk-… (Groq · se cifra, solo tareas baratas)",
    "ajustes.byok2.placeholderSaved": "•••••••••• (guardada — escribe para cambiarla)",
    "ajustes.byok2.aria": "Segunda clave del proveedor barato (BYOK)",
    "ajustes.byok2.save": "Guardar 2ª clave",
    "ajustes.byok2.clear": "Quitar",
    "ajustes.byok2.note": "Solo abarata clasificar y desempatar duplicados. Sin ella, todo va a Gemini (no se rompe nada).",

    // ★ Selector de modelos PROBADOS. El listado de la API miente (20 listados, 11
    //   responden), así que aquí solo se ofrece lo que contestó a una llamada real.
    "ajustes.modelo.label": "Modelo de extracción",
    "ajustes.modelo.hint": "solo los que tu clave admite de verdad",
    "ajustes.modelo.aria": "Modelo de extracción",
    "ajustes.modelo.optRegistro": "El del registro (recomendado)",
    "ajustes.modelo.origenElegido": "activo · lo elegiste tú",
    "ajustes.modelo.origenRegistro": "activo · el del registro — ganó el A/B del canario (87 % de evidencia verificada)",
    "ajustes.modelo.espejo": "el chequeo de salud prueba este mismo modelo — si probara otro, no probaría nada",
    "ajustes.modelo.espejoRoto": "⚠ El chequeo de salud apunta a otro modelo: dejaría de probar lo que usas.",
    "ajustes.modelo.probar": "Comprobar modelos",
    "ajustes.modelo.probando": "Probando uno a uno…",
    "ajustes.modelo.probarNota": "el listado miente: una llamada real por modelo, y solo cuando lo pidas",
    "ajustes.modelo.guardar": "Usar este modelo",
    "ajustes.modelo.guardando": "Probando y guardando…",
    "ajustes.modelo.listados": "listados",
    "ajustes.modelo.responden": "responden de verdad",
    "ajustes.modelo.descartados": "sin probar (otra modalidad)",
    "ajustes.modelo.responde": "responde",
    "ajustes.modelo.caido": "no responde",
    "ajustes.modelo.noRespondeActivo": "El modelo activo NO responde:",
    "ajustes.modelo.sugerencia": "Sí responde ahora:",
    "ajustes.modelo.usarSugerencia": "Usarlo",
    "ajustes.modelo.sinSugerencia": "Pulsa «Comprobar modelos» para ver cuáles admite tu clave.",
    "ajustes.modelo.sinClave": "Sin clave efectiva no hay nada que probar: guarda tu clave o define GEMINI_API_KEY en el servidor.",
    "ajustes.modelo.avisoLite": "lite · medido: parafrasea en vez de citar (30–35 % de evidencia verificada frente al 87 %)",
    "ajustes.modelo.avisoPreview": "preview · Google puede retirarlo sin aviso",
    "ajustes.modelo.errorListado": "El listado no respondió:",
    "ajustes.modelo.sinColumna": "La elección no se puede guardar todavía: falta la columna llm_model en user_settings. Mientras tanto va el del registro.",
    "ajustes.modelo.reutilizado": "medido hace unos segundos, no ahora mismo",

    // Nota de modo manual (IA apagada)
    "ajustes.manual.lead": "Modo manual — legítimo, no degradado.",
    "ajustes.manual.body1":
      " Se apagan: el volcado con extracción, el análisis de avisos y las reformulaciones. Sigue todo lo demás: master, variantes, overrides, preview-igual-al-PDF, rayos-X del ATS y salud. Los items que escribas quedan con ",
    "ajustes.manual.origin": "origen: tú",
    "ajustes.manual.body2": " — el más verificable de todos.",

    // Estado de conexiones (E2) — cada check llama de verdad
    "ajustes.conn.overline": "Estado de conexiones",
    "ajustes.conn.hint": "cada check llama de verdad · el motivo real, no un ✓ optimista",
    "ajustes.conn.recheck": "Volver a comprobar",
    "ajustes.conn.checking": "Comprobando…",
    "ajustes.conn.error": "No se pudo comprobar el estado",
    "ajustes.conn.ok": "en línea",
    "ajustes.conn.warn": "a medias",
    "ajustes.conn.fail": "caído",
    "ajustes.conn.svc.gemini": "Gemini · extracción",
    "ajustes.conn.svc.groq": "Groq · router barato",
    "ajustes.conn.svc.anthropic": "Anthropic",
    "ajustes.conn.svc.github": "GitHub",
    "ajustes.conn.svc.supabase": "Supabase · RLS",
    "ajustes.conn.svc.storage": "Storage · archivos",

    // Tus datos
    "ajustes.data.overline": "Tus datos",
    "ajustes.data.hint": "sin permiso, sin retención hostil",

    // Borrar todos mis datos (E1 · bloque 1) — conserva la cuenta
    "ajustes.wipe.label": "Borrar todos mis datos y empezar de cero",
    "ajustes.wipe.hint": "vacía master, variantes, fuentes y archivos · mantiene tu cuenta, tu sesión y tus ajustes",
    "ajustes.wipe.button": "Borrar todos mis datos…",
    "ajustes.wipe.downloadLead": "Descárgalos antes, por si acaso:",
    "ajustes.wipe.download": "Descargar mis datos (JSON)",
    "ajustes.wipe.confirmPre": "Escribe ",
    "ajustes.wipe.confirmPost": " para confirmar:",
    "ajustes.wipe.aria": "Escribe BORRAR MIS DATOS para confirmar",
    "ajustes.wipe.confirmButton": "Borrar mis datos",
    "ajustes.wipe.deleting": "Borrando…",
    "ajustes.wipe.error": "No se pudo borrar. Reintenta.",
    "ajustes.wipe.doneLead": "Listo — tus datos se borraron. Vuelves al día 1.",
    "ajustes.wipe.uItems": "items",
    "ajustes.wipe.uVariants": "variantes",
    "ajustes.wipe.uSources": "fuentes",
    "ajustes.wipe.uStaged": "en cola",
    "ajustes.wipe.uFiles": "archivos",

    // Borrar mi cuenta (E1 · bloque 2) — separado, con su propio peso
    "ajustes.delete.label": "Borrar mi cuenta",
    "ajustes.delete.hint": "cierra la sesión y borra la cuenta entera · aparte de lo anterior",
    "ajustes.delete.button": "Borrar mi cuenta",
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
    "ajustes.flash.keyParked":
      "CORPUS_ENCRYPTION_KEY isn't set on the server. Until it is, no key gets saved — on purpose, so no secret is ever stored in plaintext.",
    "ajustes.flash.keySaved": "Key saved ✓ (encrypted, never shown)",
    "ajustes.flash.keyIncluded": "The included key will be used ✓",
    "ajustes.flash.key2Saved": "2nd key saved ✓ (encrypted, never shown)",
    "ajustes.flash.key2Parked":
      "CORPUS_ENCRYPTION_KEY isn't set on the server. Until it is, no key gets saved — on purpose, so no secret is ever stored in plaintext.",
    "ajustes.flash.key2Unavailable": "Migration 0006 (llm_api_key_2) isn't applied yet: the 2nd key couldn't be saved.",
    "ajustes.flash.key2Cleared": "2nd key removed ✓ — everything goes back to Gemini",
    "ajustes.flash.modeloSaved": "Model saved ✓ — it was probed before saving",
    "ajustes.flash.modeloRegistro": "Back to the registry's model ✓",
    "ajustes.flash.modeloNoResponde": "That model didn't answer — nothing was saved",
    "ajustes.flash.modeloSinColumna": "Column llm_model is missing in user_settings: the choice couldn't be saved.",
    "ajustes.flash.modeloError": "Couldn't save the choice.",

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

    // ★ Encryption lock — same reasoning as ES: a closed field with its reason beats a
    //   field that takes your secret and then throws it away.
    "ajustes.byok.lockedBadge": "Field closed · no encryption on the server",
    "ajustes.byok.lockedWhy":
      "CORPUS_ENCRYPTION_KEY isn't set on the server. Until it is, no key gets saved — on purpose, so no secret is ever stored in plaintext.",
    "ajustes.byok.lockedHow":
      "Generate it with  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"  (or  openssl rand -base64 32 ) and set it in .env.local and in Vercel's environment variables.",
    "ajustes.byok.lockedPlaceholder": "closed until the server can encrypt",
    "ajustes.byok.parkedSaved":
      "There's a saved key that can NOT be decrypted today (CORPUS_ENCRYPTION_KEY is missing or changed): it's parked, not used. Paste it again once the server can encrypt.",

    // BYOK · second key (§H) — the CHEAP provider of the cost router (Groq)
    "ajustes.byok2.label": "Second key · cheap provider",
    "ajustes.byok2.hint": "BYOK — optional · cost router",
    "ajustes.byok2.hintSaved": " · one is saved",
    "ajustes.byok2.placeholder": "gsk-… (Groq · encrypted, cheap tasks only)",
    "ajustes.byok2.placeholderSaved": "•••••••••• (saved — type to change it)",
    "ajustes.byok2.aria": "Second key for the cheap provider (BYOK)",
    "ajustes.byok2.save": "Save 2nd key",
    "ajustes.byok2.clear": "Remove",
    "ajustes.byok2.note": "It only makes classifying and de-duplicating cheaper. Without it, everything goes to Gemini (nothing breaks).",

    // ★ Probed-model selector. The API listing lies (20 listed, 11 answer), so only
    //   what answered a real call is offered here.
    "ajustes.modelo.label": "Extraction model",
    "ajustes.modelo.hint": "only the ones your key really accepts",
    "ajustes.modelo.aria": "Extraction model",
    "ajustes.modelo.optRegistro": "The registry's one (recommended)",
    "ajustes.modelo.origenElegido": "active · you chose it",
    "ajustes.modelo.origenRegistro": "active · the registry's one — it won the canary A/B (87% verified evidence)",
    "ajustes.modelo.espejo": "the health check probes this very model — probing another would prove nothing",
    "ajustes.modelo.espejoRoto": "⚠ The health check points at another model: it would stop probing what you use.",
    "ajustes.modelo.probar": "Check models",
    "ajustes.modelo.probando": "Probing one by one…",
    "ajustes.modelo.probarNota": "the listing lies: one real call per model, and only when you ask",
    "ajustes.modelo.guardar": "Use this model",
    "ajustes.modelo.guardando": "Probing and saving…",
    "ajustes.modelo.listados": "listed",
    "ajustes.modelo.responden": "really answer",
    "ajustes.modelo.descartados": "not probed (other modality)",
    "ajustes.modelo.responde": "answers",
    "ajustes.modelo.caido": "doesn't answer",
    "ajustes.modelo.noRespondeActivo": "The active model does NOT answer:",
    "ajustes.modelo.sugerencia": "This one does answer right now:",
    "ajustes.modelo.usarSugerencia": "Use it",
    "ajustes.modelo.sinSugerencia": "Press «Check models» to see which ones your key accepts.",
    "ajustes.modelo.sinClave": "With no effective key there's nothing to probe: save your key or set GEMINI_API_KEY on the server.",
    "ajustes.modelo.avisoLite": "lite · measured: it paraphrases instead of quoting (30–35% verified evidence vs. 87%)",
    "ajustes.modelo.avisoPreview": "preview · Google can retire it without notice",
    "ajustes.modelo.errorListado": "The listing didn't answer:",
    "ajustes.modelo.sinColumna": "The choice can't be saved yet: column llm_model is missing in user_settings. Meanwhile the registry's one is used.",
    "ajustes.modelo.reutilizado": "measured seconds ago, not right now",

    // Manual-mode note (AI off)
    "ajustes.manual.lead": "Manual mode — legitimate, not degraded.",
    "ajustes.manual.body1":
      " Off: extraction, posting analysis, rewrites. Everything else stays: master, variants, overrides, preview-equals-PDF, ATS X-ray and health. What you write is marked ",
    "ajustes.manual.origin": "origin: you",
    "ajustes.manual.body2": " — the most verifiable of all.",

    // Connections status (E2) — every check really calls
    "ajustes.conn.overline": "Connections status",
    "ajustes.conn.hint": "every check really calls · the real reason, not an optimistic ✓",
    "ajustes.conn.recheck": "Check again",
    "ajustes.conn.checking": "Checking…",
    "ajustes.conn.error": "Couldn't check status",
    "ajustes.conn.ok": "online",
    "ajustes.conn.warn": "partial",
    "ajustes.conn.fail": "down",
    "ajustes.conn.svc.gemini": "Gemini · extraction",
    "ajustes.conn.svc.groq": "Groq · cheap router",
    "ajustes.conn.svc.anthropic": "Anthropic",
    "ajustes.conn.svc.github": "GitHub",
    "ajustes.conn.svc.supabase": "Supabase · RLS",
    "ajustes.conn.svc.storage": "Storage · files",

    // Your data
    "ajustes.data.overline": "Your data",
    "ajustes.data.hint": "no permission needed, no hostile retention",

    // Delete all my data (E1 · block 1) — keeps the account
    "ajustes.wipe.label": "Delete all my data and start fresh",
    "ajustes.wipe.hint": "empties master, variants, sources and files · keeps your account, session and settings",
    "ajustes.wipe.button": "Delete all my data…",
    "ajustes.wipe.downloadLead": "Download them first, just in case:",
    "ajustes.wipe.download": "Download my data (JSON)",
    "ajustes.wipe.confirmPre": "Type ",
    "ajustes.wipe.confirmPost": " to confirm:",
    "ajustes.wipe.aria": "Type BORRAR MIS DATOS to confirm",
    "ajustes.wipe.confirmButton": "Delete my data",
    "ajustes.wipe.deleting": "Deleting…",
    "ajustes.wipe.error": "Couldn't delete. Try again.",
    "ajustes.wipe.doneLead": "Done — your data was deleted. Back to day one.",
    "ajustes.wipe.uItems": "items",
    "ajustes.wipe.uVariants": "variants",
    "ajustes.wipe.uSources": "sources",
    "ajustes.wipe.uStaged": "staged",
    "ajustes.wipe.uFiles": "files",

    // Delete my account (E1 · block 2) — separate, with its own weight
    "ajustes.delete.label": "Delete my account",
    "ajustes.delete.hint": "signs you out and deletes the whole account · separate from the above",
    "ajustes.delete.button": "Delete my account",
    "ajustes.delete.confirmPre": "Type ",
    "ajustes.delete.confirmPost": " to confirm:",
    "ajustes.delete.aria": "Type BORRAR to confirm",
    "ajustes.delete.deleting": "Deleting…",
    "ajustes.delete.confirmButton": "Delete permanently",
    "ajustes.delete.error": "Couldn't delete. Try again.",
  } as Record<string, string>,
} as const;
