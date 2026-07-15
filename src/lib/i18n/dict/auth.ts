/* i18n · namespace "auth". Claves planas con prefijo "auth.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "auth". */
export const auth = {
  es: {
    "auth.claim": "Un registro canónico de tu carrera. Cada CV, una vista de él — no una copia.",

    "auth.title.login": "Entrar",
    "auth.title.signup": "Crear cuenta",

    "auth.recoverAccess": "Recuperar acceso →",

    "auth.email.label": "Email",
    "auth.email.placeholder": "tu@correo.cl",
    "auth.password.label": "Contraseña",
    "auth.password2.label": "Repite la contraseña",

    "auth.cta.login": "Entrar",
    "auth.cta.signup": "Crear mi registro",

    "auth.oauth.google": "Continuar con Google",
    "auth.oauth.github": "Continuar con GitHub",

    "auth.swap.toLogin": "Ya tengo cuenta",
    "auth.swap.toSignup": "Crear cuenta",
    "auth.forgot": "Olvidé mi contraseña",

    "auth.fine": "Tus datos son tuyos: exportas todo o borras todo desde Ajustes, sin pedir permiso. La descarga de tu CV nunca queda detrás de un pago.",

    "auth.err.pwMismatch": "Las contraseñas no coinciden.",
    "auth.info.accountCreated": "Cuenta creada. Revisa tu correo para confirmarla y luego entra. (Puedes desactivar la confirmación en Supabase → Authentication → Sign In.)",
    "auth.err.credentials": "Ese correo y esa contraseña no calzan. No sabemos cuál de los dos falla — así funciona la seguridad.",
    "auth.err.alreadyRegistered": "Ese correo ya tiene cuenta. Entra desde “Ya tengo cuenta”.",
    "auth.err.unconfirmed": "Tu correo aún no está confirmado. Revisa tu bandeja, o desactiva la confirmación en Supabase.",
    "auth.err.generic": "No se pudo completar. Reintenta.",
  } as Record<string, string>,
  en: {
    "auth.claim": "One canonical record of your career. Every resume is a view of it — not a copy.",

    "auth.title.login": "Sign in",
    "auth.title.signup": "Create account",

    "auth.recoverAccess": "Recover access →",

    "auth.email.label": "Email",
    "auth.email.placeholder": "you@email.com",
    "auth.password.label": "Password",
    "auth.password2.label": "Repeat password",

    "auth.cta.login": "Sign in",
    "auth.cta.signup": "Create my record",

    "auth.oauth.google": "Continue with Google",
    "auth.oauth.github": "Continue with GitHub",

    "auth.swap.toLogin": "I already have an account",
    "auth.swap.toSignup": "Create account",
    "auth.forgot": "I forgot my password",

    "auth.fine": "Your data is yours: export or delete everything from Settings, no questions asked. Downloading your resume is never behind a paywall.",

    "auth.err.pwMismatch": "The passwords don't match.",
    "auth.info.accountCreated": "Account created. Check your email to confirm it, then sign in. (You can turn off confirmation in Supabase → Authentication → Sign In.)",
    "auth.err.credentials": "That email and password don't match. We can't tell you which one is wrong — that's how security works.",
    "auth.err.alreadyRegistered": "That email already has an account. Sign in from “I already have an account”.",
    "auth.err.unconfirmed": "Your email isn't confirmed yet. Check your inbox, or turn off confirmation in Supabase.",
    "auth.err.generic": "Couldn't complete it. Try again.",
  } as Record<string, string>,
} as const;
