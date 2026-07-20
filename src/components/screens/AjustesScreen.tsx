"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBoot } from "@/lib/corpus/runtime";
import { useLang, useT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { AuroraTune, AURORA_HOJEO } from "@/components/Aurora";
import { supabaseEnabled } from "@/lib/supabase/config";
import "./ajustes.css";

/* ============================================================================
   Ajustes — porte de corpus-design/04-pantallas/ajustes.html, ahora CABLEADO a
   persistencia real (user_settings).

   Atmósfera: la monta el shell; aquí se declara 0.55 — no es trabajo denso, se
   entra a cambiar una cosa y se sale. Ver src/components/Aurora.tsx.

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

type ConnStatus = "ok" | "warn" | "fail";
interface ConnService {
  id: string;
  ok: boolean;
  status: ConnStatus;
  detail: string;
  meta?: Record<string, unknown>;
}
interface ConnResult {
  checkedAt: string;
  services: ConnService[];
}
interface WipeCounts {
  items: number;
  variants: number;
  sources: number;
  staged: number;
  files: number;
}

const THEME_KEY = "corpus-theme";
const WIPE_WORD = "BORRAR MIS DATOS";

async function saveSettings(patch: Record<string, unknown>): Promise<{ ok?: boolean; keyParked?: boolean } | null> {
  if (!supabaseEnabled) return null;
  const r = await fetch("/api/account/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return r.ok ? ((await r.json()) as { ok?: boolean; keyParked?: boolean }) : null;
}

/** Línea técnica compacta por servicio (meta). Solo datos, sin i18n: modelo,
 *  fuente de clave, latencia, cupo… Devuelve null si no hay nada que mostrar. */
function connMeta(s: ConnService): string | null {
  const m = s.meta;
  if (!m) return null;
  if (s.id === "gemini") {
    const parts = [String(m.model ?? ""), `clave: ${String(m.keySource ?? "?")}`];
    if (m.parked) parts.push("BYOK aparcada");
    if (typeof m.latencyMs === "number") parts.push(`${m.latencyMs} ms`);
    return parts.filter(Boolean).join(" · ");
  }
  if (s.id === "github" && (m.remaining != null || m.limit != null)) {
    return `${m.remaining ?? "?"}/${m.limit ?? "?"} req · sin OAuth`;
  }
  return null;
}

export function AjustesScreen() {
  const router = useRouter();
  const { lang, setLang } = useLang();
  const t = useT();

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

  // E1 · bloque 1 — «Borrar todos mis datos» (conserva la cuenta)
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeWord, setWipeWord] = useState("");
  const [wiping, setWiping] = useState(false);
  const [wipeErr, setWipeErr] = useState<string | null>(null);
  const [wipeDone, setWipeDone] = useState<WipeCounts | null>(null);
  const wipeReady = wipeWord.trim() === WIPE_WORD;

  // E2 · estado de conexiones
  const [conn, setConn] = useState<ConnResult | null>(null);
  const [connLoading, setConnLoading] = useState(false);
  const [connErr, setConnErr] = useState<string | null>(null);

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
      note(t("ajustes.flash.nameSaved"));
      window.dispatchEvent(new Event("corpus:profile-updated"));
    });
  }

  function saveKey() {
    const value = byokDisabled ? null : byok.trim() || null;
    void saveSettings({ llm_api_key: value }).then((res) => {
      if (value && res?.keyParked) {
        // El servidor NO guarda secretos sin cifrar (falta CORPUS_ENCRYPTION_KEY).
        setHasKey(false);
        note(t("ajustes.flash.keyParked"));
      } else {
        setHasKey(!!value);
        note(value ? t("ajustes.flash.keySaved") : t("ajustes.flash.keyIncluded"));
      }
    });
  }

  // E1 · borra el CONTENIDO (no la cuenta). La confirmación se verifica también en
  // el servidor; aquí solo se habilita el botón cuando coincide EXACTO.
  async function confirmWipe() {
    setWiping(true);
    setWipeErr(null);
    try {
      const res = await fetch("/api/account/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: WIPE_WORD }),
      });
      const d = (await res.json().catch(() => null)) as { deleted?: WipeCounts; error?: string } | null;
      if (!res.ok || !d?.deleted) throw new Error(d?.error ?? t("ajustes.wipe.error"));
      setWipeDone(d.deleted);
      setWipeOpen(false);
      setWipeWord("");
      // Deja el resto de la app en día-1 (paneles y contadores se recalculan).
      window.dispatchEvent(new Event("corpus:profile-updated"));
    } catch (e) {
      setWipeErr(e instanceof Error ? e.message : t("ajustes.wipe.error"));
    } finally {
      setWiping(false);
    }
  }

  // E2 · comprueba el estado real de las conexiones (una llamada, sin autorefresh).
  const loadConn = useCallback(() => {
    if (!supabaseEnabled) return;
    setConnLoading(true);
    setConnErr(null);
    fetch("/api/health/status")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ConnResult) => setConn(d))
      .catch((e) => setConnErr(e instanceof Error ? e.message : "error"))
      .finally(() => setConnLoading(false));
  }, []);

  useEffect(() => {
    loadConn();
  }, [loadConn]);

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
      setDelMsg(e instanceof Error ? e.message : t("ajustes.delete.error"));
    }
  }

  return (
    <div className="c-page">
      {/* Ajustes no es trabajo denso: se entra, se cambia una cosa y se sale. */}
      <AuroraTune strength={AURORA_HOJEO} />
      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/app">
            Corpus
          </Link>
          <nav className="hd-nav">
            <Link href="/app">{t("nav.panel")}</Link>
            <Link href="/app/master">{t("nav.master")}</Link>
            <Link href="/app/variantes">{t("nav.variantes")}</Link>
            <Link href="/app/fuentes">{t("nav.fuentes")}</Link>
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
          <h2>{t("ajustes.title")}</h2>
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
              <span className="t-overline">{t("ajustes.account.overline")}</span>
            </div>
            <hr className="c-divider" />
            <div className="aj-rows">
              <div className="aj-row">
                <span className="k">
                  <b>{t("ajustes.name.label")}</b>
                  <span>{t("ajustes.name.hint")}</span>
                </span>
                <span className="v" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <input
                    className="c-input"
                    style={{ maxWidth: "300px" }}
                    aria-label={t("ajustes.name.label")}
                    placeholder={t("ajustes.name.placeholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button className="c-btn" onClick={saveName}>
                    {t("common.save")}
                  </button>
                </span>
              </div>
              <div className="aj-row">
                <span className="k">
                  <b>{t("ajustes.email.label")}</b>
                  <span>{t("ajustes.email.hint")}</span>
                </span>
                <span className="v">
                  <input
                    className="c-input"
                    style={{ maxWidth: "300px", opacity: 0.7 }}
                    aria-label={t("ajustes.email.aria")}
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
              <span className="t-overline">{t("ajustes.langTheme.overline")}</span>
            </div>
            <hr className="c-divider" />
            <div className="aj-rows">
              <div className="aj-row">
                <span className="k">
                  <b>{t("ajustes.lang.label")}</b>
                  <span>{t("ajustes.lang.hint")}</span>
                </span>
                <span className="v">
                  <span className="aj-seg" id="segLang">
                    <button aria-pressed={lang === "es"} onClick={() => setLang("es")}>
                      {t("ajustes.lang.es")}
                    </button>
                    <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>
                      {t("ajustes.lang.en")}
                    </button>
                  </span>
                  <span style={{ font: "400 var(--fs-micro)/1 var(--font-mono)", color: "var(--text-subtle)" }}>
                    {t("ajustes.lang.note")}
                  </span>
                </span>
              </div>
              <div className="aj-row">
                <span className="k">
                  <b>{t("ajustes.theme.label")}</b>
                  <span>{t("ajustes.theme.hint")}</span>
                </span>
                <span className="v">
                  <span className="aj-seg" id="segTheme">
                    <button data-t="dark" aria-pressed={themeSel === "dark"} onClick={() => applyTheme("dark")}>
                      {t("ajustes.theme.dark")}
                    </button>
                    <button data-t="light" aria-pressed={themeSel === "light"} onClick={() => applyTheme("light")}>
                      {t("ajustes.theme.light")}
                    </button>
                    <button data-t="auto" aria-pressed={themeSel === "auto"} onClick={() => applyTheme("auto")}>
                      {t("ajustes.theme.auto")}
                    </button>
                  </span>
                  <span style={{ font: "400 var(--fs-micro)/1 var(--font-mono)", color: "var(--text-subtle)" }}>
                    {t("ajustes.theme.note")}
                  </span>
                </span>
              </div>
            </div>
          </section>

          {/* ── Inteligencia artificial ── */}
          <section className="aj-g" data-screen-label="ajustes-ia">
            <div className="aj-gh">
              <span className="t-overline">{t("ajustes.ai.overline")}</span>
            </div>
            <hr className="c-divider" />
            <div className="aj-rows">
              <div className="aj-row">
                <span className="k">
                  <b>{t("ajustes.ai.label")}</b>
                  <span>{t("ajustes.ai.hint")}</span>
                </span>
                <span className="v">
                  <button
                    className="aj-sw"
                    id="swIA"
                    role="switch"
                    aria-checked={iaOn}
                    aria-label={iaOn ? t("ajustes.ai.ariaOn") : t("ajustes.ai.ariaOff")}
                    aria-describedby="iaNote"
                    onClick={toggleIA}
                  />
                  <span
                    style={{ font: "400 var(--fs-data)/1.5 var(--font-sans)", color: "var(--text-muted)" }}
                    id="iaLabel"
                    aria-live="polite"
                  >
                    {iaOn ? t("ajustes.ai.on") : t("ajustes.ai.off")}
                  </span>
                </span>
              </div>
              <div className="aj-row">
                <span className="k">
                  <b>{t("ajustes.byok.label")}</b>
                  <span>{t("ajustes.byok.hint")}{hasKey ? t("ajustes.byok.hintSaved") : ""}</span>
                </span>
                <span className="v">
                  <span className="aj-seg" id="segProv">
                    <button aria-pressed={provider === "Incluida"} onClick={() => setProvider("Incluida")}>
                      {t("ajustes.byok.included")}
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
                      placeholder={hasKey ? t("ajustes.byok.placeholderSaved") : t("ajustes.byok.placeholder")}
                      style={{ maxWidth: "320px" }}
                      aria-label={t("ajustes.byok.aria")}
                      disabled={byokDisabled}
                      value={byok}
                      onChange={(e) => setByok(e.target.value)}
                    />
                    <button className="c-btn" onClick={saveKey}>
                      {byokDisabled ? t("ajustes.byok.useIncluded") : t("ajustes.byok.saveKey")}
                    </button>
                  </span>
                </span>
              </div>
            </div>
            <div className={`aj-note${iaOn ? "" : " show"}`} id="iaNote" aria-live="polite">
              <b>{t("ajustes.manual.lead")}</b>{t("ajustes.manual.body1")}<b>{t("ajustes.manual.origin")}</b>{t("ajustes.manual.body2")}
            </div>
          </section>

          {/* ── Estado de conexiones (E2) ── */}
          <section className="aj-g" data-screen-label="ajustes-conexiones">
            <div className="aj-gh">
              <span className="t-overline">{t("ajustes.conn.overline")}</span>
              <span style={{ font: "400 var(--fs-micro)/1 var(--font-mono)", color: "var(--text-subtle)" }}>
                {t("ajustes.conn.hint")}
              </span>
              <button
                className="c-btn c-btn--quiet"
                style={{ marginLeft: "auto" }}
                onClick={loadConn}
                disabled={connLoading}
              >
                {connLoading ? t("ajustes.conn.checking") : t("ajustes.conn.recheck")}
              </button>
            </div>
            <hr className="c-divider" />
            {connErr ? (
              <div className="aj-note show" role="status">
                {t("ajustes.conn.error")} — {connErr}
              </div>
            ) : null}
            <div className="aj-rows">
              {conn?.services?.length
                ? conn.services.map((s) => {
                    const statusLabel =
                      s.status === "ok"
                        ? t("ajustes.conn.ok")
                        : s.status === "warn"
                          ? t("ajustes.conn.warn")
                          : t("ajustes.conn.fail");
                    const meta = connMeta(s);
                    return (
                      <div className="aj-row aj-conn-row" key={s.id}>
                        <span className="k">
                          <b>{t(`ajustes.conn.svc.${s.id}`)}</b>
                          {meta ? <span>{meta}</span> : null}
                        </span>
                        <span className="v aj-conn-v">
                          <span className={`aj-conn-badge is-${s.status}`}>
                            <span className="aj-dot" aria-hidden="true" />
                            {statusLabel}
                          </span>
                          <span className="aj-conn-detail">{s.detail}</span>
                        </span>
                      </div>
                    );
                  })
                : !connErr
                  ? (
                    <div className="aj-row">
                      <span
                        className="v"
                        style={{ color: "var(--text-subtle)", font: "400 var(--fs-data)/1.5 var(--font-mono)" }}
                      >
                        {t("ajustes.conn.checking")}
                      </span>
                    </div>
                  )
                  : null}
            </div>
          </section>

          {/* ── Tus datos (E1) — dos bloques separados ── */}
          <section className="aj-g aj-danger" data-screen-label="ajustes-datos">
            <div className="aj-gh">
              <span className="t-overline">{t("ajustes.data.overline")}</span>
              <span style={{ font: "400 var(--fs-micro)/1 var(--font-mono)", color: "var(--text-subtle)" }}>
                {t("ajustes.data.hint")}
              </span>
            </div>
            <hr className="c-divider" />
            <div className="aj-rows">
              {/* Bloque 1 — Borrar todos mis datos (conserva la cuenta) */}
              <div className="aj-row">
                <span className="k">
                  <b>{t("ajustes.wipe.label")}</b>
                  <span>{t("ajustes.wipe.hint")}</span>
                </span>
                <span className="v">
                  <button
                    className="c-btn"
                    style={{
                      borderColor: "color-mix(in srgb,var(--danger) 45%,transparent)",
                      color: "var(--danger)",
                      display: wipeOpen ? "none" : undefined,
                    }}
                    onClick={() => {
                      setWipeOpen(true);
                      setWipeErr(null);
                      setWipeDone(null);
                    }}
                  >
                    {t("ajustes.wipe.button")}
                  </button>
                  <span className={`aj-confirm aj-wipe${wipeOpen ? " show" : ""}`}>
                    <span className="aj-wipe-dl">
                      <span style={{ font: "400 var(--fs-data)/1.5 var(--font-sans)", color: "var(--text-muted)" }}>
                        {t("ajustes.wipe.downloadLead")}
                      </span>
                      <a className="c-btn" href="/api/account/data" download>
                        {t("ajustes.wipe.download")}
                      </a>
                    </span>
                    <span className="aj-wipe-confirm">
                      <span style={{ font: "400 var(--fs-data)/1.5 var(--font-sans)", color: "var(--text-muted)" }}>
                        {t("ajustes.wipe.confirmPre")}
                        <b style={{ fontFamily: "var(--font-mono)" }}>{WIPE_WORD}</b>
                        {t("ajustes.wipe.confirmPost")}
                      </span>
                      <input
                        className="c-input"
                        autoComplete="off"
                        aria-label={t("ajustes.wipe.aria")}
                        value={wipeWord}
                        onChange={(e) => setWipeWord(e.target.value)}
                        style={{ maxWidth: "260px" }}
                      />
                      <button
                        className="c-btn"
                        disabled={!wipeReady || wiping}
                        style={{ background: "var(--danger)", borderColor: "transparent", color: "var(--text-on-danger)" }}
                        onClick={confirmWipe}
                      >
                        {wiping ? t("ajustes.wipe.deleting") : t("ajustes.wipe.confirmButton")}
                      </button>
                      <button
                        className="c-btn c-btn--quiet"
                        onClick={() => {
                          setWipeOpen(false);
                          setWipeWord("");
                          setWipeErr(null);
                        }}
                      >
                        {t("common.cancel")}
                      </button>
                    </span>
                  </span>
                  {wipeErr ? (
                    <span role="status" style={{ font: "400 var(--fs-data)/1.5 var(--font-sans)", color: "var(--danger)" }}>
                      {wipeErr}
                    </span>
                  ) : null}
                  {wipeDone ? (
                    <span role="status" style={{ font: "400 var(--fs-data)/1.6 var(--font-sans)", color: "var(--text-muted)" }}>
                      {t("ajustes.wipe.doneLead")}{" "}
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent-text)" }}>
                        {wipeDone.items} {t("ajustes.wipe.uItems")} · {wipeDone.variants} {t("ajustes.wipe.uVariants")} ·{" "}
                        {wipeDone.sources} {t("ajustes.wipe.uSources")} · {wipeDone.staged} {t("ajustes.wipe.uStaged")} ·{" "}
                        {wipeDone.files} {t("ajustes.wipe.uFiles")}
                      </span>
                    </span>
                  ) : null}
                </span>
              </div>

              {/* Bloque 2 — Borrar mi cuenta (separado, con su propio peso) */}
              <div className="aj-row">
                <span className="k">
                  <b>{t("ajustes.delete.label")}</b>
                  <span>{t("ajustes.delete.hint")}</span>
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
                    {t("ajustes.delete.button")}
                  </button>
                  <span className={`aj-confirm${delOpen ? " show" : ""}`} id="delConfirm">
                    <span style={{ font: "400 var(--fs-data)/1.5 var(--font-sans)", color: "var(--text-muted)" }}>
                      {t("ajustes.delete.confirmPre")}<b style={{ fontFamily: "var(--font-mono)" }}>BORRAR</b>{t("ajustes.delete.confirmPost")}
                    </span>
                    <input
                      className="c-input"
                      id="delWord"
                      ref={delWordRef}
                      autoComplete="off"
                      aria-label={t("ajustes.delete.aria")}
                      value={delWord}
                      onChange={(e) => setDelWord(e.target.value)}
                    />
                    <button
                      className="c-btn"
                      id="btnDel2"
                      disabled={!delReady || deleting}
                      style={{ background: "var(--danger)", borderColor: "transparent", color: "var(--text-on-danger)" }}
                      onClick={confirmDelete}
                    >
                      {deleting ? t("ajustes.delete.deleting") : t("ajustes.delete.confirmButton")}
                    </button>
                    <button className="c-btn c-btn--quiet" id="btnDelNo" onClick={cancelDel}>
                      {t("common.cancel")}
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
