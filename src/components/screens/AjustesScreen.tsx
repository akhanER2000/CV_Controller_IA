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

/* ════════════════════════════════════════════════════════════════════════════
   ★ SELECTOR DE MODELOS PROBADOS (GET/POST /api/ai/modelos).

   El listado de la API MIENTE: para esta misma clave devolvió 20 modelos con
   generateContent y solo 11 respondieron al llamarlos (ocho dan 404 «no longer
   available»). Por eso el desplegable NO se puebla del listado: se puebla de
   `elegibles`, que son los que contestaron a una llamada REAL. Un modelo muerto
   ofrecido aquí no rompe aquí — rompe después, en mitad de una extracción.
   ════════════════════════════════════════════════════════════════════════════ */
interface ModeloProbadoUI {
  id: string;
  responde: boolean;
  error?: string;
  latenciaMs?: number;
  /** aviso MEDIDO, en código: el texto lo pone i18n (ES y EN) */
  aviso?: "lite" | "preview";
}
interface CatalogoUI {
  modelos: ModeloProbadoUI[];
  elegibles: string[];
  descartados: { id: string; motivo: string }[];
  listados: number;
  reutilizado: boolean;
  errorListado?: string;
}
interface ValidacionUI {
  modelo: string;
  responde: boolean;
  error?: string;
  latenciaMs?: number;
  reutilizado: boolean;
  /** un modelo que SÍ respondió, para proponerlo cuando el activo está caído */
  sugerencia?: string;
}
interface EstadoModelos {
  elegido: string | null;
  origen: "elegido" | "registro";
  modeloEfectivo: string;
  modeloRegistro: string;
  espejoPingSalud: string;
  espejoOk: boolean;
  claveFuente: "byok" | "servidor" | "ninguna";
  columnaAusente: boolean;
  sqlPendiente?: string;
  validacion: ValidacionUI | null;
  catalogo: CatalogoUI | null;
}

const THEME_KEY = "corpus-theme";
const WIPE_WORD = "BORRAR MIS DATOS";

type SaveResult = {
  ok?: boolean;
  keyParked?: boolean;
  key2Parked?: boolean;
  key2Unavailable?: boolean;
  /** ★ ¿el servidor puede cifrar? (hay CORPUS_ENCRYPTION_KEY válida) */
  encryptionAvailable?: boolean;
};

async function saveSettings(patch: Record<string, unknown>): Promise<SaveResult | null> {
  if (!supabaseEnabled) return null;
  const r = await fetch("/api/account/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return r.ok ? ((await r.json()) as SaveResult) : null;
}

/**
 * ★ EL CANDADO DEL CIFRADO, dicho al lado del campo cerrado.
 *
 * Se pinta cuando el servidor NO tiene CORPUS_ENCRYPTION_KEY. Antes el campo aceptaba
 * la clave, el usuario pulsaba «Guardar» y el servidor la rechazaba: leído desde fuera,
 * eso es un producto roto. No lo es —es el candado haciendo su trabajo— pero un campo
 * abierto que tira lo que le das hace perder el tiempo y miente sobre lo que puede
 * hacer. Cerrado + motivo + comando exacto: la verdad, y qué hacer con ella.
 *
 * Sirve para las DOS claves BYOK a propósito: el candado es del SERVIDOR, no del campo.
 */
function CandadoCifrado({ id }: { id: string }) {
  const t = useT();
  return (
    <span className="aj-note show" id={id} role="note">
      <b>{t("ajustes.byok.lockedBadge")}</b> — {t("ajustes.byok.lockedWhy")}{" "}
      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-subtle)" }}>
        {t("ajustes.byok.lockedHow")}
      </span>
    </span>
  );
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
  // ★ ¿Puede el servidor cifrar? Arranca en `true` a propósito: mientras no llegue la
  //   respuesta del GET no se sabe, y cerrar un campo que sí funciona sería peor que
  //   abrirlo un instante de más. El servidor SIEMPRE manda este booleano; el `!== false`
  //   solo protege de un backend viejo que no lo mande.
  const [cifradoOk, setCifradoOk] = useState(true);
  // Clave guardada en otra época que hoy NO se puede descifrar: ni se usa ni se borra
  // sola. Se llevan por separado (1ª y 2ª) para que el aviso salga en SU fila: decir
  // «hay una clave aparcada» junto al campo equivocado es media verdad.
  const [claveAparcada, setClaveAparcada] = useState(false);
  const [clave2Aparcada, setClave2Aparcada] = useState(false);
  const byokDisabled = provider === "Incluida";
  // Campo CERRADO: sin cifrado no hay guardado posible, así que no se acepta el texto.
  // Nota: quitar/limpiar la clave (mandar null) SÍ sigue permitido — eso no persiste
  // ningún secreto, y dejar al usuario encerrado con una clave aparcada sería absurdo.
  const byokCerrado = !cifradoOk;
  // §H · segunda clave BYOK (proveedor barato del router por coste). Independiente
  // de la primera: existe o no, se guarda o se quita, sin depender del segmento.
  const [byok2, setByok2] = useState("");
  const [hasKey2, setHasKey2] = useState(false);
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

  // ★ Selector de modelos probados. `modeloSel` es lo que hay ELEGIDO EN EL
  //   DESPLEGABLE (todavía sin guardar); "" significa «el del registro».
  const [modelos, setModelos] = useState<EstadoModelos | null>(null);
  const [modeloSel, setModeloSel] = useState("");
  const [probando, setProbando] = useState(false);
  const [guardandoModelo, setGuardandoModelo] = useState(false);

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
        setHasKey2(!!d.hasKey2);
        setCifradoOk(d.encryptionAvailable !== false);
        setClaveAparcada(!!d.keyParked);
        setClave2Aparcada(!!d.key2Parked);
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
      // El servidor manda su estado de cifrado en CADA respuesta: si se perdió la clave
      // maestra desde que se cargó la pantalla, el campo se cierra aquí mismo y no en la
      // siguiente visita. El estado que se muestra es el del servidor, no el recordado.
      if (res && res.encryptionAvailable !== undefined) setCifradoOk(res.encryptionAvailable);
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

  // §H · guarda / quita la 2ª clave (proveedor barato). Las tres degradaciones del
  // servidor se dicen, ninguna se traga: aparcada (sin cifrado), no disponible
  // (migración 0006 sin aplicar) o guardada. La clave nunca vuelve del servidor.
  function saveKey2(value: string | null) {
    void saveSettings({ llm_api_key_2: value }).then((res) => {
      if (res && res.encryptionAvailable !== undefined) setCifradoOk(res.encryptionAvailable);
      if (value && res?.key2Unavailable) {
        setHasKey2(false);
        note(t("ajustes.flash.key2Unavailable"));
      } else if (value && res?.key2Parked) {
        setHasKey2(false);
        note(t("ajustes.flash.key2Parked"));
      } else {
        setHasKey2(!!value);
        setByok2("");
        note(value ? t("ajustes.flash.key2Saved") : t("ajustes.flash.key2Cleared"));
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

  /**
   * ★ Estado del modelo. `probar:false` (lo que corre al montar) NO barre nada:
   * devuelve el catálogo ya cacheado —si lo hay— y valida UN solo modelo, el
   * efectivo, reutilizando la misma ventana de 60 s del ping de salud cuando es el
   * del registro. Es decir: abrir Ajustes NO factura veinte llamadas.
   * `probar:true` es el barrido completo, y solo sale de pulsar el botón.
   */
  const cargarModelos = useCallback((probar: boolean) => {
    if (!supabaseEnabled) return;
    if (probar) setProbando(true);
    fetch(`/api/ai/modelos${probar ? "?probar=1" : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: EstadoModelos | null) => {
        if (!d) return;
        setModelos(d);
        setModeloSel(d.elegido ?? "");
      })
      .catch(() => {})
      .finally(() => setProbando(false));
  }, []);

  useEffect(() => {
    cargarModelos(false);
  }, [cargarModelos]);

  /**
   * Guarda la elección (null = volver al del registro). El servidor PRUEBA el
   * modelo antes de escribirlo: si no responde, no se guarda y se dice por qué —
   * el motivo real del proveedor, no un «no válido» genérico.
   * Después se recarga el estado y el panel de salud, porque el chequeo pasa a
   * probar el modelo nuevo (espeja a la extracción).
   */
  async function guardarModelo(id: string | null) {
    if (!supabaseEnabled) return;
    setGuardandoModelo(true);
    try {
      const r = await fetch("/api/ai/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelo: id }),
      });
      const d = (await r.json().catch(() => null)) as
        | { ok?: boolean; motivo?: string; columnaAusente?: boolean }
        | null;
      if (!r.ok || !d?.ok) {
        if (d?.motivo === "no-responde") note(t("ajustes.flash.modeloNoResponde"));
        else if (d?.columnaAusente) note(t("ajustes.flash.modeloSinColumna"));
        else note(t("ajustes.flash.modeloError"));
        // Se recarga igual: el usuario tiene que ver qué quedó vigente DE VERDAD.
        cargarModelos(false);
        return;
      }
      note(id ? t("ajustes.flash.modeloSaved") : t("ajustes.flash.modeloRegistro"));
      cargarModelos(false);
      loadConn();
    } catch {
      note(t("ajustes.flash.modeloError"));
    } finally {
      setGuardandoModelo(false);
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
      setDelMsg(e instanceof Error ? e.message : t("ajustes.delete.error"));
    }
  }

  /**
   * Las opciones del desplegable. ★ SALEN DE `responde`, NO DEL LISTADO: ese es
   * el bloque entero. Se añade además el modelo YA elegido aunque no esté en la
   * tabla (todavía no se ha barrido, o hoy está caído) — si no, el desplegable
   * mostraría otra cosa distinta de lo que el usuario tiene guardado, que es
   * justo la clase de mentira que aquí se persigue.
   */
  const opcionesModelo: ModeloProbadoUI[] = (modelos?.catalogo?.modelos ?? []).filter((m) => m.responde);
  if (modelos?.elegido && !opcionesModelo.some((m) => m.id === modelos.elegido)) {
    opcionesModelo.push({ id: modelos.elegido, responde: !!modelos.validacion?.responde });
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
                      placeholder={
                        byokCerrado
                          ? t("ajustes.byok.lockedPlaceholder")
                          : hasKey
                            ? t("ajustes.byok.placeholderSaved")
                            : t("ajustes.byok.placeholder")
                      }
                      style={{ maxWidth: "320px" }}
                      aria-label={t("ajustes.byok.aria")}
                      // ★ CERRADO sin cifrado: no se acepta un secreto que después se va a
                      //   rechazar. El motivo va al lado (aria-describedby), no escondido.
                      disabled={byokDisabled || byokCerrado}
                      aria-describedby={byokCerrado ? "byokCandado" : undefined}
                      value={byok}
                      onChange={(e) => setByok(e.target.value)}
                    />
                    <button
                      className="c-btn"
                      onClick={saveKey}
                      // "Usar la incluida" manda null: eso NO persiste ningún secreto, así
                      // que sigue disponible aunque no haya cifrado. Guardar, no.
                      disabled={byokCerrado && !byokDisabled}
                    >
                      {byokDisabled ? t("ajustes.byok.useIncluded") : t("ajustes.byok.saveKey")}
                    </button>
                  </span>
                  {byokCerrado ? <CandadoCifrado id="byokCandado" /> : null}
                  {claveAparcada ? (
                    <span
                      role="status"
                      style={{ font: "400 var(--fs-micro)/1.5 var(--font-mono)", color: "var(--text-subtle)" }}
                    >
                      {t("ajustes.byok.parkedSaved")}
                    </span>
                  ) : null}
                </span>
              </div>
              {/* §H · segunda clave: el proveedor BARATO del router por coste (Groq).
                  Sin ella, el router no actúa y TODO va a Gemini — se dice en la nota. */}
              <div className="aj-row">
                <span className="k">
                  <b>{t("ajustes.byok2.label")}</b>
                  <span>{t("ajustes.byok2.hint")}{hasKey2 ? t("ajustes.byok2.hintSaved") : ""}</span>
                </span>
                <span className="v">
                  <span style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      className="c-input"
                      id="byok2"
                      type="password"
                      placeholder={
                        byokCerrado
                          ? t("ajustes.byok.lockedPlaceholder")
                          : hasKey2
                            ? t("ajustes.byok2.placeholderSaved")
                            : t("ajustes.byok2.placeholder")
                      }
                      style={{ maxWidth: "320px" }}
                      aria-label={t("ajustes.byok2.aria")}
                      // Mismo candado que la 1ª clave: es del servidor, no del campo.
                      disabled={byokCerrado}
                      aria-describedby={byokCerrado ? "byok2Candado" : undefined}
                      value={byok2}
                      onChange={(e) => setByok2(e.target.value)}
                    />
                    <button
                      className="c-btn"
                      onClick={() => saveKey2(byok2.trim() || null)}
                      disabled={byokCerrado}
                    >
                      {t("ajustes.byok2.save")}
                    </button>
                    {hasKey2 ? (
                      // Quitar manda null: no persiste secreto alguno, así que el candado
                      // no la bloquea. Es la única salida si quedó una clave aparcada.
                      <button className="c-btn c-btn--quiet" onClick={() => saveKey2(null)}>
                        {t("ajustes.byok2.clear")}
                      </button>
                    ) : null}
                  </span>
                  {byokCerrado ? <CandadoCifrado id="byok2Candado" /> : null}
                  {clave2Aparcada ? (
                    <span
                      role="status"
                      style={{ font: "400 var(--fs-micro)/1.5 var(--font-mono)", color: "var(--text-subtle)" }}
                    >
                      {t("ajustes.byok.parkedSaved")}
                    </span>
                  ) : null}
                  <span style={{ font: "400 var(--fs-micro)/1.5 var(--font-mono)", color: "var(--text-subtle)" }}>
                    {t("ajustes.byok2.note")}
                  </span>
                </span>
              </div>

              {/* ★ MODELO DE EXTRACCIÓN — el desplegable se puebla de lo que RESPONDE,
                  nunca del listado (20 listados · 11 responden con esta misma clave).
                  Debajo va la evidencia: cada modelo con su veredicto y su latencia. */}
              <div className="aj-row">
                <span className="k">
                  <b>{t("ajustes.modelo.label")}</b>
                  <span>{t("ajustes.modelo.hint")}</span>
                </span>
                <span className="v">
                  <span style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <select
                      className="c-input"
                      id="modeloIA"
                      style={{ maxWidth: "320px" }}
                      aria-label={t("ajustes.modelo.aria")}
                      value={modeloSel}
                      onChange={(e) => setModeloSel(e.target.value)}
                    >
                      <option value="">
                        {t("ajustes.modelo.optRegistro")}
                        {modelos?.modeloRegistro ? ` · ${modelos.modeloRegistro}` : ""}
                      </option>
                      {opcionesModelo.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                          {m.aviso === "lite" ? " · lite" : m.aviso === "preview" ? " · preview" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      className="c-btn"
                      onClick={() => guardarModelo(modeloSel || null)}
                      disabled={guardandoModelo || modeloSel === (modelos?.elegido ?? "")}
                    >
                      {guardandoModelo ? t("ajustes.modelo.guardando") : t("ajustes.modelo.guardar")}
                    </button>
                    <button
                      className="c-btn c-btn--quiet"
                      onClick={() => cargarModelos(true)}
                      disabled={probando || modelos?.claveFuente === "ninguna"}
                    >
                      {probando ? t("ajustes.modelo.probando") : t("ajustes.modelo.probar")}
                    </button>
                  </span>

                  {/* Cuál está activo y POR QUÉ, más el espejo con el chequeo de salud. */}
                  {modelos ? (
                    <span style={{ font: "400 var(--fs-micro)/1.5 var(--font-mono)", color: "var(--text-subtle)" }}>
                      <b style={{ color: "var(--accent-text)" }}>{modelos.modeloEfectivo}</b>
                      {" · "}
                      {modelos.origen === "elegido"
                        ? t("ajustes.modelo.origenElegido")
                        : t("ajustes.modelo.origenRegistro")}
                      {modelos.validacion
                        ? modelos.validacion.responde
                          ? ` · ${t("ajustes.modelo.responde")}${
                              typeof modelos.validacion.latenciaMs === "number"
                                ? ` (${modelos.validacion.latenciaMs} ms)`
                                : ""
                            }`
                          : ` · ${t("ajustes.modelo.caido")}`
                        : ""}
                      {" · "}
                      {modelos.espejoOk ? t("ajustes.modelo.espejo") : ""}
                    </span>
                  ) : null}
                  {modelos && !modelos.espejoOk ? (
                    <span
                      role="status"
                      style={{ font: "500 var(--fs-micro)/1.5 var(--font-mono)", color: "var(--danger)" }}
                    >
                      {t("ajustes.modelo.espejoRoto")}
                    </span>
                  ) : null}

                  {/* El modelo activo NO responde: motivo REAL + propuesta PROBADA. */}
                  {modelos?.validacion && !modelos.validacion.responde ? (
                    <span className="aj-note show" role="status">
                      <b>{t("ajustes.modelo.noRespondeActivo")}</b>{" "}
                      <span style={{ fontFamily: "var(--font-mono)" }}>{modelos.validacion.error}</span>
                      {modelos.validacion.sugerencia ? (
                        <>
                          {" · "}
                          {t("ajustes.modelo.sugerencia")}{" "}
                          <b style={{ fontFamily: "var(--font-mono)" }}>{modelos.validacion.sugerencia}</b>{" "}
                          <button
                            className="c-btn c-btn--quiet"
                            onClick={() => guardarModelo(modelos.validacion!.sugerencia!)}
                            disabled={guardandoModelo}
                          >
                            {t("ajustes.modelo.usarSugerencia")}
                          </button>
                        </>
                      ) : (
                        <> · {t("ajustes.modelo.sinSugerencia")}</>
                      )}
                    </span>
                  ) : null}

                  {/* Degradaciones honestas: sin clave no hay nada que probar; sin la
                      columna llm_model la elección no se puede guardar (va el registro). */}
                  {modelos?.claveFuente === "ninguna" ? (
                    <span className="aj-note show" role="status">{t("ajustes.modelo.sinClave")}</span>
                  ) : null}
                  {modelos?.columnaAusente ? (
                    <span className="aj-note show" role="status">
                      {t("ajustes.modelo.sinColumna")}
                      {modelos.sqlPendiente ? (
                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-subtle)" }}>
                          {" "}
                          {modelos.sqlPendiente}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {modelos?.catalogo?.errorListado ? (
                    <span className="aj-note show" role="status">
                      {t("ajustes.modelo.errorListado")}{" "}
                      <span style={{ fontFamily: "var(--font-mono)" }}>{modelos.catalogo.errorListado}</span>
                    </span>
                  ) : null}

                  {/* LA EVIDENCIA: listado vs. lo que responde de verdad, uno a uno. */}
                  {modelos?.catalogo ? (
                    <>
                      <span style={{ font: "400 var(--fs-micro)/1.5 var(--font-mono)", color: "var(--text-subtle)" }}>
                        {modelos.catalogo.listados} {t("ajustes.modelo.listados")} ·{" "}
                        {modelos.catalogo.elegibles.length} {t("ajustes.modelo.responden")}
                        {modelos.catalogo.descartados.length
                          ? ` · ${modelos.catalogo.descartados.length} ${t("ajustes.modelo.descartados")}`
                          : ""}
                        {modelos.catalogo.reutilizado ? ` · ${t("ajustes.modelo.reutilizado")}` : ""}
                      </span>
                      <span
                        role="list"
                        style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "2px" }}
                      >
                        {modelos.catalogo.modelos.map((m) => (
                          <span
                            role="listitem"
                            key={m.id}
                            style={{
                              display: "flex",
                              gap: "8px",
                              alignItems: "baseline",
                              flexWrap: "wrap",
                              font: "400 var(--fs-micro)/1.6 var(--font-mono)",
                            }}
                          >
                            <span className={`aj-conn-badge is-${m.responde ? "ok" : "fail"}`}>
                              <span className="aj-dot" aria-hidden="true" />
                              {m.responde ? t("ajustes.modelo.responde") : t("ajustes.modelo.caido")}
                            </span>
                            <b style={{ fontFamily: "var(--font-mono)" }}>{m.id}</b>
                            <span style={{ color: "var(--text-subtle)" }}>
                              {m.responde
                                ? `${m.latenciaMs ?? "?"} ms${
                                    m.aviso === "lite"
                                      ? ` · ${t("ajustes.modelo.avisoLite")}`
                                      : m.aviso === "preview"
                                        ? ` · ${t("ajustes.modelo.avisoPreview")}`
                                        : ""
                                  }`
                                : m.error}
                            </span>
                          </span>
                        ))}
                      </span>
                    </>
                  ) : null}

                  <span style={{ font: "400 var(--fs-micro)/1.5 var(--font-mono)", color: "var(--text-subtle)" }}>
                    {t("ajustes.modelo.probarNota")}
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
