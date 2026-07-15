"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useBoot } from "@/lib/corpus/runtime";
import "./ajustes.css";

/* ============================================================================
   Ajustes — porte de corpus-design/04-pantallas/ajustes.html
   (ver docs/spec/pantallas/ajustes.md). MURO: NO monta la aurora — donde hay
   trabajo, el trabajo gana.

   El corazón de la pantalla: el tema se cambia AQUÍ y se ve en vivo, escribiendo
   document.documentElement.dataset.theme (global, en <html>, no en un contexto).
   Toggle de IA con el modo manual como legítimo (no degradado). BYOK. Exportar.
   Borrar con doble confirmación tipeada (escribe BORRAR).

   Fidelidad e interacciones REALES de producto (no la demo):
   - theme(dark|light|auto): 'auto' se resuelve una vez con matchMedia; el botón
     Sistema queda presionado aunque el data-theme diga dark/light. No persiste.
   - ia(on): conmuta #iaLabel y muestra la nota del modo manual con la IA apagada.
   - BYOK: el input se habilita salvo con "Incluida" (por value, no por texto) y
     recibe foco al elegir Anthropic/Gemini.
   - Borrado: #btnDel2 se habilita solo con "BORRAR" (trim, sensible a mayúsculas).
   - M.boot() dibuja los 4 hairlines .c-divider (arrancan en scaleX(0)).

   Cierres de a11y (spec §8) sin tocar clases: nombres accesibles en los inputs,
   live regions en el cambio de modo de IA, y el foco vuelve a #btnDel al cancelar
   el borrado (la referencia lo dejaba huérfano). El panel .demo NO se porta.
   El alert() de maqueta se sustituye por un status accesible; el borrado real
   queda pendiente de backend (ver issues).
   ============================================================================ */

type ThemeSel = "dark" | "light" | "auto";
type Provider = "Incluida" | "Anthropic" | "Gemini";

const IA_ON = "encendida — nunca inventa; solo selecciona, reordena y reformula con origen";
const IA_OFF = "apagada — modo manual completo";

export function AjustesScreen() {
  // Cuenta (editable en el mock)
  const [name, setName] = useState("Diego Gatica Morales");
  const [email, setEmail] = useState("diego.gatica@ejemplo.cl");

  // Idioma (solo visual, como la referencia) y tema (en vivo, global)
  const [lang, setLang] = useState<"es" | "en">("es");
  const [themeSel, setThemeSel] = useState<ThemeSel>("dark");

  // IA + BYOK
  const [iaOn, setIaOn] = useState(true);
  const [provider, setProvider] = useState<Provider>("Incluida");
  const [byok, setByok] = useState("");
  const byokDisabled = provider === "Incluida";

  // Borrado con doble confirmación tipeada
  const [delOpen, setDelOpen] = useState(false);
  const [delWord, setDelWord] = useState("");
  const [delMsg, setDelMsg] = useState<string | null>(null);
  const delReady = delWord.trim() === "BORRAR";

  const byokRef = useRef<HTMLInputElement>(null);
  const delWordRef = useRef<HTMLInputElement>(null);
  const btnDelRef = useRef<HTMLButtonElement>(null);
  const delMounted = useRef(false);

  // CorpusMotion.boot() — dibuja los .c-divider (arrancan en scaleX(0)). Sin
  // esto los 4 hairlines quedan invisibles. Acotado al <main> con la ref.
  const bootRef = useBoot<HTMLElement>();

  // Tema en vivo: escribe el atributo global en <html>. 'auto' se resuelve una
  // sola vez (ni persiste ni se suscribe a prefers-color-scheme, como el original).
  function applyTheme(t: ThemeSel) {
    const resolved: "dark" | "light" =
      t === "auto"
        ? window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark"
        : t;
    document.documentElement.dataset.theme = resolved;
    setThemeSel(t);
  }

  // Foco automático al habilitar BYOK (elegir Anthropic/Gemini).
  useEffect(() => {
    if (provider !== "Incluida") byokRef.current?.focus();
  }, [provider]);

  // Movimientos de foco del borrado: al abrir → #delWord; al cancelar → #btnDel
  // (cierra el hueco de la spec §8: la referencia dejaba el foco huérfano). Se
  // salta la primera ejecución (montaje) para no robar el foco al cargar.
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
  function confirmDelete() {
    // Maqueta: el borrado destructivo real (y su confirmación por correo) queda
    // pendiente de backend. No se dispara el alert() de la referencia.
    setDelMsg("Aquí se borra todo, de verdad, y se confirma por correo.");
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
            <nav className="hd-nav" style={{ display: "flex" }}>
              <Link href="/app/ajustes" aria-current="page">
                Ajustes
              </Link>
            </nav>
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

          {/* ── Cuenta ── */}
          <section className="aj-g" data-screen-label="ajustes-cuenta">
            <div className="aj-gh">
              <span className="t-overline">Cuenta</span>
            </div>
            <hr className="c-divider" />
            <div className="aj-rows">
              <div className="aj-row">
                <span className="k">
                  <b>Nombre</b>
                </span>
                <span className="v">
                  <input
                    className="c-input"
                    style={{ maxWidth: "300px" }}
                    aria-label="Nombre"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </span>
              </div>
              <div className="aj-row">
                <span className="k">
                  <b>Email</b>
                  <span>el de la cuenta, no el del CV</span>
                </span>
                <span className="v">
                  <input
                    className="c-input"
                    style={{ maxWidth: "300px" }}
                    aria-label="Email de la cuenta"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                </span>
              </div>
              <div className="aj-row">
                <span className="k">
                  <b>Tema</b>
                  <span>grafito de noche, porcelana de día</span>
                </span>
                <span className="v">
                  <span className="aj-seg" id="segTheme">
                    <button
                      data-t="dark"
                      aria-pressed={themeSel === "dark"}
                      onClick={() => applyTheme("dark")}
                    >
                      Grafito
                    </button>
                    <button
                      data-t="light"
                      aria-pressed={themeSel === "light"}
                      onClick={() => applyTheme("light")}
                    >
                      Porcelana
                    </button>
                    <button
                      data-t="auto"
                      aria-pressed={themeSel === "auto"}
                      onClick={() => applyTheme("auto")}
                    >
                      Sistema
                    </button>
                  </span>
                  <span
                    style={{
                      font: "400 var(--fs-micro)/1 var(--font-mono)",
                      color: "var(--text-subtle)",
                    }}
                  >
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
                    onClick={() => setIaOn((v) => !v)}
                  />
                  <span
                    style={{
                      font: "400 var(--fs-data)/1.5 var(--font-sans)",
                      color: "var(--text-muted)",
                    }}
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
                  <span>BYOK — opcional</span>
                </span>
                <span className="v">
                  <span className="aj-seg" id="segProv">
                    <button
                      aria-pressed={provider === "Incluida"}
                      onClick={() => setProvider("Incluida")}
                    >
                      Incluida
                    </button>
                    <button
                      aria-pressed={provider === "Anthropic"}
                      onClick={() => setProvider("Anthropic")}
                    >
                      Anthropic
                    </button>
                    <button
                      aria-pressed={provider === "Gemini"}
                      onClick={() => setProvider("Gemini")}
                    >
                      Gemini
                    </button>
                  </span>
                  <input
                    className="c-input"
                    id="byok"
                    ref={byokRef}
                    placeholder="sk-… (se cifra, solo se usa en tus extracciones)"
                    style={{ maxWidth: "320px" }}
                    aria-label="Tu propia clave (BYOK)"
                    disabled={byokDisabled}
                    value={byok}
                    onChange={(e) => setByok(e.target.value)}
                  />
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
              <span
                style={{
                  font: "400 var(--fs-micro)/1 var(--font-mono)",
                  color: "var(--text-subtle)",
                }}
              >
                sin permiso, sin retención hostil
              </span>
            </div>
            <hr className="c-divider" />
            <div className="aj-rows">
              <div className="aj-row">
                <span className="k">
                  <b>Exportar todo</b>
                  <span>JSON propio + resume.json estándar</span>
                </span>
                <span className="v">
                  <button className="c-btn">Descargar mi registro completo</button>
                  <span
                    style={{
                      font: "400 var(--fs-micro)/1 var(--font-mono)",
                      color: "var(--text-subtle)",
                    }}
                  >
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
                    <span
                      style={{
                        font: "400 var(--fs-data)/1.5 var(--font-sans)",
                        color: "var(--text-muted)",
                      }}
                    >
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
                      disabled={!delReady}
                      style={{ background: "var(--danger)", borderColor: "transparent", color: "#FFF" }}
                      onClick={confirmDelete}
                    >
                      Borrar definitivamente
                    </button>
                    <button className="c-btn c-btn--quiet" id="btnDelNo" onClick={cancelDel}>
                      cancelar
                    </button>
                  </span>
                  {delMsg ? (
                    <span
                      role="status"
                      style={{
                        font: "400 var(--fs-data)/1.5 var(--font-sans)",
                        color: "var(--text-muted)",
                      }}
                    >
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
