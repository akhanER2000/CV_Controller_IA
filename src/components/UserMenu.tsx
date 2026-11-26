"use client";

/* ============================================================================
   UserMenu — EL LATERAL del shell (Forja v2) + CuentaMenu (la cuenta, que
   ahora vive en la barra superior: src/components/ui/BarraSuperior.tsx).

   Forja v2 (lote sistema-visual-y-claude): cada destino lleva su icono en una
   pastilla; la del activo va RELLENA de brasa. La tarjeta «Una oferta nueva»
   es un bloque relleno de brasa con botón de tinta. La identidad sube a la
   barra superior (CuentaMenu); el lateral queda para navegar.

   Historia (rediseño "Forja"):

   Antes era una barra fija arriba a la derecha (idioma, tema, avatar). Ahora es
   el lateral flotante de toda el área /app: la navegación principal vive aquí
   y no en el <header> de cada pantalla (su CSS oculta esas .hd-nav duplicadas,
   igual que ya ocultaba los .hd-av/.hd-lang estáticos). Conserva el nombre del
   archivo y del componente porque el layout y los tests lo importan así.

   De arriba abajo:
     · marca Corpus → /app
     · identidad     → CuentaMenu, en la barra superior (Forja v2)
     · navegación    Trabajo: Panel · Master (└ Revisión) · Variantes ·
                     Fuentes (└ Volcar material) · Cuenta: Ajustes
     · tarjeta       «Una oferta nueva» → Variantes (el único botón de brasa)
     · pie           toggle de idioma ES ⇄ EN y de tema grafito ⇄ porcelana

   Responsive: ≥1100px lateral completo · 768–1099px carril de iconos ·
   <768px barra inferior con los cinco destinos.

   El menú es navegable por teclado (flechas/Home/End/Esc), con roles ARIA
   correctos (button aria-expanded / role=menu / role=menuitem), se cierra con
   click-fuera y con Esc devolviendo el foco al botón.

   ⚠ La foto es SOLO para esta UI. Nunca entra en el CV ni en el PDF.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";
import { useLang, useT } from "@/lib/i18n";
import { ICONOS } from "@/components/ui/Icono";
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

/* ── Navegación ──────────────────────────────────────────────────────────────
   Iconos: el set propio de Corpus (src/components/ui/Icono.tsx). */
function Icono({ d }: { d: string }) {
  return (
    <svg className="lt-ico" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

type Item = {
  href: string;
  key: string;
  icon: keyof typeof ICONOS;
  activo: (p: string) => boolean;
  hijos?: { href: string; key: string; activo: (p: string) => boolean }[];
};

const empieza = (base: string) => (p: string) => p === base || p.startsWith(base + "/");

const TRABAJO: Item[] = [
  { href: "/app", key: "nav.panel", icon: "panel", activo: (p) => p === "/app" },
  {
    href: "/app/master",
    key: "nav.master",
    icon: "master",
    activo: empieza("/app/master"),
    hijos: [{ href: "/app/staging", key: "nav.staging", activo: empieza("/app/staging") }],
  },
  {
    href: "/app/variantes",
    key: "nav.variantes",
    icon: "variantes",
    activo: (p) => empieza("/app/variantes")(p) || empieza("/app/cv")(p),
  },
  {
    href: "/app/fuentes",
    key: "nav.fuentes",
    icon: "fuentes",
    activo: empieza("/app/fuentes"),
    hijos: [
      {
        href: "/app/importar",
        key: "nav.importar",
        activo: (p) => empieza("/app/importar")(p) || empieza("/app/ingesta")(p),
      },
    ],
  },
];
const CUENTA: Item[] = [
  { href: "/app/ajustes", key: "nav.ajustes", icon: "ajustes", activo: empieza("/app/ajustes") },
];

/** Textos propios del lateral (el diccionario común solo trae los nombres de ruta). */
const TXT = {
  es: {
    aria: "Navegación principal",
    trabajo: "Trabajo",
    cuenta: "Cuenta",
    ofertaT: "Una oferta nueva",
    ofertaB: "Pega la oferta y Corpus arma la variante desde tu master, sin inventar nada.",
    ofertaBtn: "Nueva variante",
    invitado: "Modo local",
  },
  en: {
    aria: "Main navigation",
    trabajo: "Work",
    cuenta: "Account",
    ofertaT: "A new job post",
    ofertaB: "Paste the post and Corpus builds the variant from your master, inventing nothing.",
    ofertaBtn: "New variant",
    invitado: "Local mode",
  },
} as const;

/** Aplica el tema al documento y lo recuerda en este navegador. */
function aplicarTema(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* noop */
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   CuentaMenu — identidad + menú Perfil · Ajustes · Cerrar sesión.
   Vive en la barra superior. Es quien LEE user_settings (nombre, foto y tema
   guardado) y reconcilia el tema con lo que el usuario eligió en otro equipo.
   ══════════════════════════════════════════════════════════════════════════ */
export function CuentaMenu() {
  const router = useRouter();
  const t = useT();
  const { lang } = useLang();

  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | HTMLButtonElement | null>>([]);

  // ── Perfil: usuario + ajustes (avatar/nombre/tema) al montar y cuando algo cambie ──
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
    if (isTheme(data?.theme)) aplicarTema(data.theme);

    const path = data?.avatar_url as string | null;
    if (path) {
      const { data: signed } = await sb.storage.from("avatars").createSignedUrl(path, 3600);
      setAvatarSrc(signed?.signedUrl ?? null);
    } else {
      setAvatarSrc(null);
    }
  }, []);

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
  const tx = TXT[lang === "en" ? "en" : "es"];

  // Índices estables de los items para el foco por teclado.
  let idx = 0;
  const profileIdx = idx++;
  const settingsIdx = idx++;
  const signOutIdx = showSignOut ? idx++ : -1;

  return (
    <div className="um-menu lt-id" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="lt-idbtn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? t("menu.close") : t("menu.open")}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onButtonKeyDown}
      >
        <span className="um-av" aria-hidden="true">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc} alt="" />
          ) : (
            <span>{initials}</span>
          )}
        </span>
        <span className="lt-idtxt">
          <b>{displayName || (email ? email.split("@")[0] : "Corpus")}</b>
          <span>{email || tx.invitado}</span>
        </span>
      </button>

      {open ? (
        <div className="um-pop" role="menu" aria-label={t("menu.open")} onKeyDown={onMenuKeyDown}>
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
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   UserMenu — EL LATERAL: marca, navegación, tarjeta de la oferta, idioma y tema.
   ══════════════════════════════════════════════════════════════════════════ */
export function UserMenu() {
  const pathname = usePathname() || "/app";
  const t = useT();
  const { lang, setLang } = useLang();
  const [theme, setTheme] = useState<Theme>("dark");

  // ── Tema: localStorage al instante; y escucha html[data-theme], porque quien
  //    reconcilia con user_settings es CuentaMenu (y Ajustes también lo cambia).
  useEffect(() => {
    try {
      const cached = localStorage.getItem(THEME_KEY);
      if (isTheme(cached)) document.documentElement.dataset.theme = cached;
    } catch {
      /* noop */
    }
    const leer = () => {
      const v = document.documentElement.dataset.theme;
      setTheme(isTheme(v) ? v : "dark");
    };
    leer();
    const obs = new MutationObserver(leer);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    aplicarTema(next);
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
  }, [theme]);

  const tx = TXT[lang === "en" ? "en" : "es"];

  function enlace(item: Item) {
    const on = item.activo(pathname);
    const hijoOn = item.hijos?.some((h) => h.activo(pathname)) ?? false;
    return (
      <li key={item.href} className="lt-li">
        <Link
          href={item.href}
          className="lt-item"
          data-on={on || undefined}
          data-rama={hijoOn || undefined}
          aria-current={on ? "page" : undefined}
          title={t(item.key)}
        >
          <span className="lt-pastilla" aria-hidden="true">
            <Icono d={ICONOS[item.icon]} />
          </span>
          <span className="lt-txt">{t(item.key)}</span>
        </Link>
        {item.hijos ? (
          <ul className="lt-rama">
            {item.hijos.map((h) => {
              const hon = h.activo(pathname);
              return (
                <li key={h.href}>
                  <Link
                    href={h.href}
                    className="lt-hijo"
                    data-on={hon || undefined}
                    aria-current={hon ? "page" : undefined}
                  >
                    {t(h.key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </li>
    );
  }

  return (
    <aside className="lt-side" aria-label={tx.aria}>
      <Link className="lt-brand c-logo" href="/app">
        Corpus
      </Link>

      <nav className="lt-nav" aria-label={tx.aria}>
        <p className="lt-grupo">{tx.trabajo}</p>
        <ul className="lt-ul">{TRABAJO.map(enlace)}</ul>
        <p className="lt-grupo">{tx.cuenta}</p>
        <ul className="lt-ul">{CUENTA.map(enlace)}</ul>
      </nav>

      {/* La tarjeta de la oferta: bloque RELLENO de brasa, botón de tinta. */}
      <div className="lt-cta">
        <p className="lt-cta-t">{tx.ofertaT}</p>
        <p className="lt-cta-b">{tx.ofertaB}</p>
        <Link href="/app/variantes" className="lt-cta-btn" title={tx.ofertaBtn}>
          <Icono d={ICONOS.mas} />
          <span className="lt-txt">{tx.ofertaBtn}</span>
        </Link>
      </div>

      <div className="lt-foot">
        {/* Toggle de idioma — motor i18n en vivo */}
        <div className="um-lang" role="group" aria-label={t("menu.lang")} title={t("menu.lang")}>
          <button type="button" aria-pressed={lang === "es"} onClick={() => setLang("es")}>
            ES
          </button>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>
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
      </div>
    </aside>
  );
}
