/* ============================================================================
   i18n · dictionary.ts — el diccionario bilingüe (ES + EN).
   Namespaced por superficie. Solo se llena aquí lo que ESTE agente toca:
   el menú de usuario y la pantalla de cuenta/perfil. Otras superficies se
   traducirán en un barrido posterior reutilizando este mismo motor.

   Los textos siguen la voz del producto (ver 06-handoff/copy.md): sereno,
   competente, sin drama. Las claves son planas con notación de punto para que
   `t('menu.profile')` sea directo y tipado.
   ============================================================================ */

export const dict = {
  es: {
    // ── Menú de usuario (persistente, arriba a la derecha) ──
    "menu.open": "Abrir menú de cuenta",
    "menu.close": "Cerrar menú de cuenta",
    "menu.profile": "Perfil",
    "menu.settings": "Ajustes",
    "menu.signout": "Cerrar sesión",
    "menu.signingOut": "Cerrando…",
    "menu.lang": "Idioma",
    "menu.theme": "Tema",
    "menu.themeToDark": "Cambiar a tema grafito",
    "menu.themeToLight": "Cambiar a tema porcelana",
    "menu.avatarAlt": "Tu foto de perfil",

    // ── Pantalla de cuenta / perfil ──
    "cuenta.title": "Perfil",
    "cuenta.subtitle":
      "Tu cuenta y cómo te ves aquí dentro. Nada de esto viaja a tu CV — el documento se arma en el master.",
    "cuenta.back": "← Volver al panel",

    "cuenta.photo.overline": "Foto de perfil",
    "cuenta.photo.hint": "Solo para tu menú aquí dentro. Nunca entra en el CV ni en el PDF.",
    "cuenta.photo.change": "Cambiar foto",
    "cuenta.photo.remove": "Quitar",
    "cuenta.photo.uploading": "Subiendo…",
    "cuenta.photo.tooBig": "La imagen supera 2 MB. Elige una más liviana.",
    "cuenta.photo.notImage": "Ese archivo no es una imagen.",
    "cuenta.photo.error": "No se pudo subir la foto. Reintenta.",

    "cuenta.identity.overline": "Identidad",
    "cuenta.name.label": "Nombre visible",
    "cuenta.name.hint": "el que se muestra en tu menú, no el del CV",
    "cuenta.name.placeholder": "Tu nombre",
    "cuenta.email.label": "Email de la cuenta",
    "cuenta.email.hint": "con el que entras — no el que aparece en el CV",
    "cuenta.email.confirm":
      "Te enviamos un correo para confirmar el cambio de email. El anterior sigue activo hasta que confirmes.",
    "cuenta.save": "Guardar",
    "cuenta.saving": "Guardando…",
    "cuenta.saved": "Guardado.",
    "cuenta.saveError": "No se pudo guardar. Reintenta.",

    "cuenta.password.overline": "Contraseña",
    "cuenta.password.hint": "solo para cuentas con correo y contraseña",
    "cuenta.password.new": "Nueva contraseña",
    "cuenta.password.repeat": "Repite la contraseña",
    "cuenta.password.placeholder": "••••••••••",
    "cuenta.password.change": "Cambiar contraseña",
    "cuenta.password.changing": "Cambiando…",
    "cuenta.password.changed": "Contraseña actualizada.",
    "cuenta.password.mismatch": "Las contraseñas no coinciden.",
    "cuenta.password.tooShort": "Usa al menos 8 caracteres.",
    "cuenta.password.oauthOnly":
      "Entraste con un proveedor externo (Google o GitHub). La contraseña la gestiona ese proveedor.",

    "cuenta.needAuth":
      "Inicia sesión para gestionar tu perfil. En modo local no hay cuenta que editar.",
  },

  en: {
    // ── User menu (persistent, top-right) ──
    "menu.open": "Open account menu",
    "menu.close": "Close account menu",
    "menu.profile": "Profile",
    "menu.settings": "Settings",
    "menu.signout": "Sign out",
    "menu.signingOut": "Signing out…",
    "menu.lang": "Language",
    "menu.theme": "Theme",
    "menu.themeToDark": "Switch to graphite theme",
    "menu.themeToLight": "Switch to porcelain theme",
    "menu.avatarAlt": "Your profile photo",

    // ── Account / profile screen ──
    "cuenta.title": "Profile",
    "cuenta.subtitle":
      "Your account and how you look in here. None of this travels to your resume — the document is built from your master.",
    "cuenta.back": "← Back to dashboard",

    "cuenta.photo.overline": "Profile photo",
    "cuenta.photo.hint": "For your menu in here only. It never enters your resume or the PDF.",
    "cuenta.photo.change": "Change photo",
    "cuenta.photo.remove": "Remove",
    "cuenta.photo.uploading": "Uploading…",
    "cuenta.photo.tooBig": "The image is over 2 MB. Pick a lighter one.",
    "cuenta.photo.notImage": "That file isn't an image.",
    "cuenta.photo.error": "Couldn't upload the photo. Try again.",

    "cuenta.identity.overline": "Identity",
    "cuenta.name.label": "Display name",
    "cuenta.name.hint": "shown in your menu, not on your resume",
    "cuenta.name.placeholder": "Your name",
    "cuenta.email.label": "Account email",
    "cuenta.email.hint": "the one you log in with — not the one on your resume",
    "cuenta.email.confirm":
      "We sent a message to confirm the email change. The old one stays active until you confirm.",
    "cuenta.save": "Save",
    "cuenta.saving": "Saving…",
    "cuenta.saved": "Saved.",
    "cuenta.saveError": "Couldn't save. Try again.",

    "cuenta.password.overline": "Password",
    "cuenta.password.hint": "only for email-and-password accounts",
    "cuenta.password.new": "New password",
    "cuenta.password.repeat": "Repeat password",
    "cuenta.password.placeholder": "••••••••••",
    "cuenta.password.change": "Change password",
    "cuenta.password.changing": "Changing…",
    "cuenta.password.changed": "Password updated.",
    "cuenta.password.mismatch": "The passwords don't match.",
    "cuenta.password.tooShort": "Use at least 8 characters.",
    "cuenta.password.oauthOnly":
      "You signed in with an external provider (Google or GitHub). That provider manages your password.",

    "cuenta.needAuth":
      "Sign in to manage your profile. In local mode there's no account to edit.",
  },
} as const;

/** Idiomas soportados por la UI. */
export type Lang = keyof typeof dict; // 'es' | 'en'

/** Claves válidas de traducción (derivadas del diccionario ES, la referencia). */
export type TKey = keyof (typeof dict)["es"];

/** Traduce `key` al `lang` dado, con fallback a ES y, en último caso, a la clave. */
export function translate(lang: Lang, key: TKey): string {
  const table = dict[lang] as Record<string, string>;
  return table[key] ?? (dict.es as Record<string, string>)[key] ?? key;
}
