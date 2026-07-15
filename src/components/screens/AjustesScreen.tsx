"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBoot } from "@/lib/corpus/runtime";
import { useLang } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";
import "./ajustes.css";

/* ============================================================================
   Ajustes — porte de corpus-design/04-pantallas/ajustes.html, ahora CABLEADO a
   persistencia real (user_settings). MURO: no monta la aurora.

   Qué persiste y cómo:
   - Idioma: reutiliza el motor i18n (useLang) → re-render en vivo + user_settings.ui_lang.
   - Tema: se aplica al instante (data-theme) + localStorage + user_settings.theme.
   - IA activada: al instante + user_settings.ai_enabled.
   - Nombre visible: con botón "Guardar" → display_name.
   - Tu clave (BYOK): con botón "Guardar clave" → llm_api_key (null = Incluida).
     La clave NUNCA vuelve del servidor (solo se sabe si hay una).
   - Exportar: descarga real del master + variantes en JSON.
   - Borrar: confirmación tipeada (BORRAR) → borrado real de la cuenta.
   ============================================================================ */

type ThemeSel = "dark" | "light" | "auto";
type Provider = "Incluida" | "Anthropic" | "Gemini";

const IA_ON = "encendida — nunca inventa; solo selecciona, reordena y reformula con origen";
const IA_OFF = "apagada — modo manual completo";
const THEME_KEY = "corpus-theme";

async function saveSettings(patch: Record<string, unknown>) {
  if (!supabaseEnabled) return;
  await fetch("/api/account/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function AjustesScreen() {
  const router = useRouter();
  const { lang, setLang } = useLang();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [themeSel, setThemeSel] = useState<ThemeSel>("dark");
  const [iaOn, setIaOn] = useState(true);
  const [provider, setProvider] = useState<Provider>("Incluida");
  const [byok, setByok] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const byokDisabled = provider === "Incluida";
  const [flash, setFlash] = useState<string | null>(null);

  const [delOpen, setDelOpen] = useState(false);
  const [delWord, setDelWord] = useState("");
  const [delMsg, setDelMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const delReady = delWord.trim() === "BORRAR";

  const byokRef = useRef<HTMLInputElement>(null);
  const delWordRef = useRef<HTMLInputElement>(null);
  const btnDelRef = useRef<HTMLButtonElement>(null);
  const delMounted = useRef(false);

  const bootRef = useBoot<HTMLElement>();

  const note = useCallback((msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash((m) => (m === msg ? null : m)), 1800);
  }, []);

  // Cargar los ajustes reales al montar.
  useEffect(() => {
    if (!supabaseEnabled) return;
    let alive = true;
    fetch("/api/account/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setName(d.display_name ?? "");
        setEmail(d.email ?? "");
        setIaOn(d.ai_enabled ?? true);
        setHasKey(!!d.hasKey);
        if (d.hasKey) setProvider("Anthropic");
        const t = (d.theme as ThemeSel) ?? "dark";
        setThemeSel(t);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Tema en vivo: resuelve 'auto', escribe data-theme, persiste (localStorage +
  // user_settings). localStorage guarda el valor RESUELTO (para el anti-flash y
  // el menú); user_settings guarda la SELECCIÓN (incl. 'auto').
  function applyTheme(t: ThemeSel) {
    const resolved: "dark" | "light" =
      t === "auto"
        ? window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark"
        : t;
    document.documentElement.dataset.theme = resolved;
    try {
      localStorage.setItem(THEME_KEY, resolved);
    } catch {
      /* noop */
    }
    setThemeSel(t);
    void saveSettings({ theme: t });
  }

  function toggleIA() {
    setIaOn((v) => {
      const next = !v;
      void saveSettings({ ai_enabled: next });
      return next;
    });
  }

  function saveName() {
    void saveSettings({ display_name: name }).then(() => {
      note("Nombre guardado ✓");
      window.dispatchEvent(new Event("corpus:profile-updated"));
    });
  }

  function saveKey() {
    const value = byokDisabled ? null : byok.trim() || null;
    void saveSettings({ llm_api_key: value }).then(() => {
      setHasKey(!!value);
      note(value ? "Clave guardada ✓ (cifrada, no se muestra)" : "Se usará la clave incluida ✓");
    });
  }

  async function exportAll() {
    try {
      const [m, v] = await Promise.all([
        fetch("/api/master").then((r) => r.json()),
        fetch("/api/variants").then((r) => r.json()),
      ]);
      const blob = new Blob([JSON.stringify({ master: m.items ?? [], variants: v.variants ?? [] }, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "corpus-registro.json";
      a.click();
      URL.revokeObjectURL(url);
      note("Registro descargado ✓");
    } catch {
      note("No se pudo exportar");
    }
  }

  useEffect(() => {
    if (provider !== "Incluida") byokRef.current?.focus();
  }, [provider]);

  useEffect(() => {
    if (!delMounted.current) {
      delMounted.current = true;
      return;
    }
    if (delOpen) delWordRef.current?.focus();
    else btnDelRef.current?.focus();
  }, [delOpen]);

  function openDel() {
    setDelMsg(null);
    setDelOpen(true);
  }
  function cancelDel() {
    setDelOpen(false);
    setDelWord("");
    setDelMsg(null);
  }
  async function confirmDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok && res.status !== 204) throw new Error(await res.text());
      if (supabaseEnabled) await createClient().auth.signOut();
      router.push("/login");
    } catch (e) {
      setDeleting(false);
      setDelMsg(e instanceof Error ? e.message : "No se pudo borrar. Reintenta.");
    }
  }

  return (
    <div className="c-page">
      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/app">
            Corpus
          </Link>
          <nav className="hd-nav">
            <Link href="/app">Panel</Link>
            <Link href="/app/master">Master</Link>
            <Link href="/app/variantes">Variantes</Link>
            <Link href="/app/fuentes">Fuentes</Link>
          </nav>
          <div className="hd-right">
            <div className="hd-lang">
              <span data-on>ES</span>
              <span>EN</span>
            </div>
            <div className="hd-av">DG</div>
          </div>
        </div>
      </header>

      <main className="aj-main c-wall" data-screen-label="ajustes" ref={bootRef}>
        <div className="c-container aj-col">
          <h2>Ajustes</h2>
          <span
            role="status"
            aria-live="polite"
            style={{
              minHeight: "16px",
              font: "500 var(--fs-micro)/1 var(--font-mono)",
              color: "var(--accent-text)",
            }}
          >
            {flash}
          </span>

          {/* ── Cuenta ── */}
          <section className="aj-g" data-screen-label="ajustes-cuenta">
            <div className="aj-gh">
              <span className="t-overline">Cuenta</span>
            </div>
            <hr className="c-divider" />
            <div className="aj-rows">
              <div className="aj-row">
                <span className="k">
                  <b>Nombre visible</b>
                  <span>el de tu menú, no el del CV</span>
                </span>
                <span className="v" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <input
                    className="c-input"
                    style={{ maxWidth: "300px" }}
                    aria-label="Nombre visible"
                    placeholder="Tu nombre"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button className="c-btn" onClick={saveName}>
                    Guardar
                  </button>
                </span>
              </div>
              <div className="aj-row">
                <span className="k">
                  <b>Email</b>
                  <span>el de la cuenta · edítalo en Perfil</span>
                </span>
                <span className="v">
                  <input
                    className="c-input"
                    style={{ maxWidth: "300px", opacity: 0.7 }}
                    aria-label="Email de la cuenta"
                    value={email}
                    readOnly
                  />
                </span>
              </div>
            </div>
          </section>

          {/* ── Idioma y tema ── */}
          <section className="aj-g" data-screen-label="ajustes-idioma-tema">
            <div className="aj-gh">
              <span className="t-overline">Idioma y tema</span>
            </div>
            <hr className="c-divider" />
            <div className="aj-rows">
              <div className="aj-row">
                <span className="k">
                  <b>Idioma de la interfaz</b>
                  <span>tus CVs pueden ir en otro</span>
                </span>
                <span className="v">
                  <span className="aj-seg" id="segLang">
                    <button aria-pressed={lang === "es"} onClick={() => setLang("es")}>
                      Español
                    </button>
                    <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>
                      English
                    </button>
                  </span>
                  <span style={{ font: "400 var(--fs-micro)/1 var(--font-mono)", color: "var(--text-subtle)" }}>
                    se aplica y se guarda al instante
                  </span>
                </span>
              </div>
              <div className="aj-row">
                <span className="k">
                  <b>Tema</b>
                  <span>grafito de noche, porcelana de día</span>
                </span>
                <span className="v">
                  <span className="aj-seg" id="segTheme">
                    <button data-t="dark" aria-pressed={themeSel === "dark"} onClick={() => applyTheme("dark")}>
                      Grafito
                    </button>
                    <button data-t="light" aria-pressed={themeSel === "light"} onClick={() => applyTheme("light")}>
                      Porcelana
                    </button>
                    <button data-t="auto" aria-pressed={themeSel === "auto"} onClick={() => applyTheme("auto")}>
                      Sistema
                    </button>
                  </span>
                  <span style={{ font: "400 var(--fs-micro)/1 var(--font-mono)", color: "var(--text-subtle)" }}>
                    se aplica al instante — mira alrededor
                  </span>
                </span>
              </div>
            </div>
          </section>

          {/* ── Inteligencia artificial ── */}
          <section className="aj-g" data-screen-label="ajustes-ia">
            <div className="aj-gh">
              <span className="t-overline">Inteligencia artificial</span>
            </div>
            <hr className="c-divider" />
            <div className="aj-rows">
              <div className="aj-row">
                <span className="k">
                  <b>IA activada</b>
                  <span>extracción · comparación · reformulación</span>
                </span>
                <span className="v">
                  <button
                    className="aj-sw"
                    id="swIA"
                    role="switch"
                    aria-checked={iaOn}
                    aria-label={iaOn ? "IA activada" : "IA desactivada"}
                    aria-describedby="iaNote"
                    onClick={toggleIA}
                  />
                  <span
                    style={{ font: "400 var(--fs-data)/1.5 var(--font-sans)", color: "var(--text-muted)" }}
                    id="iaLabel"
                    aria-live="polite"
                  >
                    {iaOn ? IA_ON : IA_OFF}
                  </span>
                </span>
              </div>
              <div className="aj-row">
                <span className="k">
                  <b>Tu propia clave</b>
                  <span>BYOK — opcional{hasKey ? " · hay una guardada" : ""}</span>
                </span>
                <span className="v">
                  <span className="aj-seg" id="segProv">
                    <button aria-pressed={provider === "Incluida"} onClick={() => setProvider("Incluida")}>
                      Incluida
                    </button>
                    <button aria-pressed={provider === "Anthropic"} onClick={() => setProvider("Anthropic")}>
                      Anthropic
                    </button>
                    <button aria-pressed={provider === "Gemini"} onClick={() => setProvider("Gemini")}>
                      Gemini
                    </button>
                  </span>
                  <span style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input
                      className="c-input"
                      id="byok"
                      ref={byokRef}
                      type="password"
                      placeholder={hasKey ? "•••••••••• (guardada — escribe para cambiarla)" : "sk-… (se cifra, solo se usa en tus extracciones)"}
                      style={{ maxWidth: "320px" }}
                      aria-label="Tu propia clave (BYOK)"
                      disabled={byokDisabled}
                      value={byok}
                      onChange={(e) => setByok(e.target.value)}
                    />
                    <button className="c-btn" onClick={saveKey}>
                      {byokDisabled ? "Usar la incluida" : "Guardar clave"}
                    </button>
                  </span>
                </span>
              </div>
            </div>
            <div className={`aj-note${iaOn ? "" : " show"}`} id="iaNote" aria-live="polite">
              <b>Modo manual — legítimo, no degradado.</b> Se apagan: el volcado con extracción, el
              análisis de avisos y las reformulaciones. Sigue todo lo demás: master, variantes,
              overrides, preview-igual-al-PDF, rayos-X del ATS y salud. Los items que escribas quedan
              con <b>origen: tú</b> — el más verificable de todos.
            </div>
          </section>

          {/* ── Tus datos ── */}
          <section className="aj-g aj-danger" data-screen-label="ajustes-datos">
            <div className="aj-gh">
              <span className="t-overline">Tus datos</span>
              <span style={{ font: "400 var(--fs-micro)/1 var(--font-mono)", color: "var(--text-subtle)" }}>
                sin permiso, sin retención hostil
              </span>
            </div>
            <hr className="c-divider" />
            <div className="aj-rows">
              <div className="aj-row">
                <span className="k">
                  <b>Exportar todo</b>
                  <span>master · variantes (JSON)</span>
                </span>
                <span className="v">
                  <button className="c-btn" onClick={exportAll}>
                    Descargar mi registro completo
                  </button>
                  <span style={{ font: "400 var(--fs-micro)/1 var(--font-mono)", color: "var(--text-subtle)" }}>
                    master · variantes · overrides · evidencias
                  </span>
                </span>
              </div>
              <div className="aj-row">
                <span className="k">
                  <b>Borrar todo</b>
                  <span>irreversible de verdad</span>
                </span>
                <span className="v">
                  <button
                    className="c-btn"
                    id="btnDel"
                    ref={btnDelRef}
                    style={{
                      borderColor: "color-mix(in srgb,var(--danger) 45%,transparent)",
                      color: "var(--danger)",
                      display: delOpen ? "none" : undefined,
                    }}
                    onClick={openDel}
                  >
                    Borrar mi cuenta y mis datos
                  </button>
                  <span className={`aj-confirm${delOpen ? " show" : ""}`} id="delConfirm">
                    <span style={{ font: "400 var(--fs-data)/1.5 var(--font-sans)", color: "var(--text-muted)" }}>
                      Escribe <b style={{ fontFamily: "var(--font-mono)" }}>BORRAR</b> para confirmar:
                    </span>
                    <input
                      className="c-input"
                      id="delWord"
                      ref={delWordRef}
                      autoComplete="off"
                      aria-label="Escribe BORRAR para confirmar"
                      value={delWord}
                      onChange={(e) => setDelWord(e.target.value)}
                    />
                    <button
                      className="c-btn"
                      id="btnDel2"
                      disabled={!delReady || deleting}
                      style={{ background: "var(--danger)", borderColor: "transparent", color: "#FFF" }}
                      onClick={confirmDelete}
                    >
                      {deleting ? "Borrando…" : "Borrar definitivamente"}
                    </button>
                    <button className="c-btn c-btn--quiet" id="btnDelNo" onClick={cancelDel}>
                      cancelar
                    </button>
                  </span>
                  {delMsg ? (
                    <span role="status" style={{ font: "400 var(--fs-data)/1.5 var(--font-sans)", color: "var(--text-muted)" }}>
                      {delMsg}
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
