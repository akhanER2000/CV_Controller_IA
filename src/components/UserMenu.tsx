"use client";

/* ============================================================================
   UserMenu — avatar + controles persistentes, arriba a la derecha, en TODAS las
   páginas de /app. Vive en el layout (no en cada pantalla), como elemento
   position:fixed sobre el header. Su CSS oculta los .hd-av/.hd-lang estáticos y
   duplicados que cada pantalla sigue pintando en su propio <header>.

   Contiene, de izquierda a derecha:
     · toggle de idioma  ES ⇄ EN  (motor i18n en vivo, useLang)
     · toggle de tema    grafito ⇄ porcelana  (escribe data-theme, persiste)
     · avatar → menú     Perfil · Ajustes · Cerrar sesión

   El menú es navegable por teclado (flechas/Home/End/Esc), con roles ARIA
   correctos (button aria-expanded / role=menu / role=menuitem), se cierra con
   click-fuera y con Esc devolviendo el foco al botón.

   ⚠ La foto es SOLO para esta UI. Nunca entra en el CV ni en el PDF.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";
import { useLang, useT } from "@/lib/i18n";
import "./UserMenu.css";

type Theme = "dark" | "light";
const THEME_KEY = "corpus-theme";

function isTheme(v: unknown): v is Theme {
  return v === "dark" || v === "light";
}

/** Iniciales (hasta 2) a partir del nombre visible o, en su defecto, del email. */
function initialsFrom(name: string | null, email: string | null): string {
  const src = (name && name.trim()) || (email ? email.split("@")[0] : "");
  if (!src) return "··";
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? parts[0][0] + parts[1][0] : src.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 2);
  return (letters || src.slice(0, 2)).toUpperCase();
}

export function UserMenu() {
  const router = useRouter();
  const t = useT();
  const { lang, setLang } = useLang();

  const [theme, setTheme] = useState<Theme>("dark");
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | HTMLButtonElement | null>>([]);

  // ── Tema: aplica localStorage al instante, luego reconcilia con user_settings ──
  const applyTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }, []);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(THEME_KEY);
      if (isTheme(cached)) applyTheme(cached);
      else applyTheme((document.documentElement.dataset.theme as Theme) || "dark");
    } catch {
      /* noop */
    }
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
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
            .upsert({ user_id: user.id, theme: next }, { onConflict: "user_id" });
        })
        .catch(() => {
          /* best-effort */
        });
    }
  }, [theme, applyTheme]);

  // ── Perfil: usuario + ajustes (avatar/nombre) al montar y cuando algo cambie ──
  const loadProfile = useCallback(async () => {
    if (!supabaseEnabled) return;
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    setEmail(user.email ?? null);

    const { data } = await sb
      .from("user_settings")
      .select("avatar_url, display_name, theme")
      .eq("user_id", user.id)
      .maybeSingle();

    setDisplayName((data?.display_name as string | null) ?? null);
    if (isTheme(data?.theme)) {
      applyTheme(data.theme);
      try {
        localStorage.setItem(THEME_KEY, data.theme);
      } catch {
        /* noop */
      }
    }

    const path = data?.avatar_url as string | null;
    if (path) {
      const { data: signed } = await sb.storage.from("avatars").createSignedUrl(path, 3600);
      setAvatarSrc(signed?.signedUrl ?? null);
    } else {
      setAvatarSrc(null);
    }
  }, [applyTheme]);

  useEffect(() => {
    void loadProfile();
    const onUpdate = () => void loadProfile();
    window.addEventListener("corpus:profile-updated", onUpdate);
    return () => window.removeEventListener("corpus:profile-updated", onUpdate);
  }, [loadProfile]);

  // ── Cerrar con click-fuera ──
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // ── Al abrir: enfocar el primer item ──
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  function focusItem(index: number) {
    const items = itemRefs.current.filter(Boolean) as Array<HTMLElement>;
    if (items.length === 0) return;
    const wrapped = (index + items.length) % items.length;
    items[wrapped]?.focus();
  }

  function currentIndex(): number {
    const items = itemRefs.current.filter(Boolean) as Array<HTMLElement>;
    return items.findIndex((el) => el === document.activeElement);
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        focusItem(currentIndex() + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusItem(currentIndex() - 1);
        break;
      case "Home":
        e.preventDefault();
        focusItem(0);
        break;
      case "End":
        e.preventDefault();
        focusItem(-1);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  function onButtonKeyDown(e: React.KeyboardEvent) {
    // Enter/Espacio los maneja el click nativo del <button> (toggle). Aquí solo
    // añadimos la flecha abajo/arriba para abrir y caer en el primer item.
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
      e.preventDefault();
      setOpen(true);
    }
  }

  async function signOut() {
    if (!supabaseEnabled) {
      router.push("/login");
      return;
    }
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
    } finally {
      setOpen(false);
      router.push("/login");
      router.refresh();
    }
  }

  const initials = initialsFrom(displayName, email);
  const showSignOut = supabaseEnabled && authed;

  // Índices estables de los items para el foco por teclado.
  let idx = 0;
  const profileIdx = idx++;
  const settingsIdx = idx++;
  const signOutIdx = showSignOut ? idx++ : -1;

  return (
    <div className="um-bar" aria-label="Cuenta y preferencias">
      <div className="um-inner">
        {/* Toggle de idioma — motor i18n en vivo */}
        <div
          className="um-lang"
          role="group"
          aria-label={t("menu.lang")}
          title={t("menu.lang")}
        >
          <button
            type="button"
            aria-pressed={lang === "es"}
            onClick={() => setLang("es")}
          >
            ES
          </button>
          <button
            type="button"
            aria-pressed={lang === "en"}
            onClick={() => setLang("en")}
          >
            EN
          </button>
        </div>

        {/* Toggle de tema — grafito ⇄ porcelana */}
        <button
          type="button"
          className="um-theme"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? t("menu.themeToLight") : t("menu.themeToDark")}
          title={theme === "dark" ? t("menu.themeToLight") : t("menu.themeToDark")}
        >
          <span aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
        </button>

        {/* Avatar + menú */}
        <div className="um-menu" ref={rootRef}>
          <button
            type="button"
            ref={buttonRef}
            className="um-av"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={open ? t("menu.close") : t("menu.open")}
            onClick={() => setOpen((v) => !v)}
            onKeyDown={onButtonKeyDown}
          >
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt={t("menu.avatarAlt")} />
            ) : (
              <span aria-hidden="true">{initials}</span>
            )}
          </button>

          {open ? (
            <div
              className="um-pop"
              role="menu"
              aria-label={t("menu.open")}
              onKeyDown={onMenuKeyDown}
            >
              {(displayName || email) && (
                <div className="um-id" role="presentation">
                  {displayName ? <b>{displayName}</b> : null}
                  {email ? <span>{email}</span> : null}
                </div>
              )}

              <Link
                href="/app/cuenta"
                role="menuitem"
                className="um-item"
                ref={(el) => {
                  itemRefs.current[profileIdx] = el;
                }}
                onClick={() => setOpen(false)}
              >
                {t("menu.profile")}
              </Link>

              <Link
                href="/app/ajustes"
                role="menuitem"
                className="um-item"
                ref={(el) => {
                  itemRefs.current[settingsIdx] = el;
                }}
                onClick={() => setOpen(false)}
              >
                {t("menu.settings")}
              </Link>

              {showSignOut ? (
                <>
                  <hr className="um-sep" />
                  <button
                    type="button"
                    role="menuitem"
                    className="um-item um-item--danger"
                    ref={(el) => {
                      itemRefs.current[signOutIdx] = el;
                    }}
                    disabled={signingOut}
                    onClick={signOut}
                  >
                    {signingOut ? t("menu.signingOut") : t("menu.signout")}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
