"use client";

/* ============================================================================
   i18n · provider.tsx — el MOTOR que cambia la UI en vivo.

   - <LangProvider> mantiene el idioma actual en estado de React: cambiarlo
     re-renderiza todo el árbol que consuma `useT`/`useLang` (no es solo persistir).
   - `useT()` devuelve `t(key)` según el idioma actual.
   - `useLang()` devuelve `{ lang, setLang }`.
   - Idioma inicial: localStorage (instantáneo, sin parpadeo) y, si Supabase está
     activo, se reconcilia con user_settings.ui_lang al montar.
   - `setLang` actualiza el estado (re-render inmediato) Y persiste: localStorage
     siempre, y user_settings.ui_lang si hay sesión.

   Está listo para que CUALQUIER pantalla lo use luego (importar { useT, useLang }).
   ============================================================================ */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";
import { type Lang, type TKey, translate } from "./dictionary";

const LANG_KEY = "corpus-lang";

function isLang(v: unknown): v is Lang {
  return v === "es" || v === "en";
}

interface LangContextValue {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (key: TKey) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({
  children,
  initial = "es",
}: {
  children: React.ReactNode;
  initial?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initial);

  // Al montar: aplica lo cacheado en localStorage (instantáneo) y luego, si hay
  // sesión, reconcilia con user_settings. Evita parpadeo y respeta la elección
  // previa aunque el servidor tarde.
  useEffect(() => {
    let cancelled = false;

    try {
      const cached = localStorage.getItem(LANG_KEY);
      if (isLang(cached)) setLangState(cached);
    } catch {
      /* localStorage no disponible: se ignora */
    }

    if (supabaseEnabled) {
      const sb = createClient();
      sb.auth
        .getUser()
        .then(async ({ data: { user } }) => {
          if (!user || cancelled) return;
          const { data } = await sb
            .from("user_settings")
            .select("ui_lang")
            .eq("user_id", user.id)
            .maybeSingle();
          if (!cancelled && isLang(data?.ui_lang)) {
            setLangState(data.ui_lang);
            try {
              localStorage.setItem(LANG_KEY, data.ui_lang);
            } catch {
              /* noop */
            }
          }
        })
        .catch(() => {
          /* sin sesión o sin red: nos quedamos con localStorage */
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  // Refleja el idioma en <html lang> para accesibilidad/SEO.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next); // re-render inmediato de toda la UI
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* noop */
    }
    if (supabaseEnabled) {
      const sb = createClient();
      sb.auth
        .getUser()
        .then(({ data: { user } }) => {
          if (!user) return;
          return sb
            .from("user_settings")
            .upsert({ user_id: user.id, ui_lang: next }, { onConflict: "user_id" });
        })
        .catch(() => {
          /* la persistencia remota es best-effort; localStorage ya guardó */
        });
    }
  }, []);

  const value = useMemo<LangContextValue>(
    () => ({ lang, setLang, t: (key: TKey) => translate(lang, key) }),
    [lang, setLang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

function useLangContext(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error("useT/useLang deben usarse dentro de <LangProvider>.");
  }
  return ctx;
}

/** Devuelve la función de traducción `t(key)` del idioma actual. */
export function useT(): (key: TKey) => string {
  return useLangContext().t;
}

/** Devuelve `{ lang, setLang }` para leer y cambiar el idioma en vivo. */
export function useLang(): { lang: Lang; setLang: (next: Lang) => void } {
  const { lang, setLang } = useLangContext();
  return { lang, setLang };
}
