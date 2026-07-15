"use client";

import { useState } from "react";
import Link from "next/link";
import { useBoot } from "@/lib/corpus/runtime";
import "./fuentes.css";

/* ============================================================================
   Fuentes — porte de corpus-design/04-pantallas/fuentes.html
   (ver docs/spec/pantallas/fuentes.md). Es un MURO: NO monta la aurora
   ("donde hay trabajo, el trabajo gana"). El único movimiento de montaje es el
   hr.c-divider que dibuja CorpusMotion.boot() vía useBoot().

   Interacciones REALES de producto con estado React (el panel .demo NO se porta):
   - selector de repos: toggle open/close, con aria-expanded/aria-controls.
   - checkboxes de repo: on/off; los dos contadores «n de N» derivan de los datos
     (repos.length), no de un 12 hardcodeado.
   - «Leer lo nuevo»: secuencia asíncrona idle → reading → read; hasNews (=ghState
     ≠ read) gobierna el c-pulse-dot, no un efecto colateral de textContent.
   - «Releer» portfolio: idle → reading → read; el resultado es «sin cambios».
   Ambas esperas se acortan con prefers-reduced-motion (M.rm()), igual que el HTML.

   A11y (huecos de la spec §8, sin cambiar clases):
   - #ghNew y la 4ª celda del portfolio son live regions (role="status").
   - #btnRepos lleva aria-expanded + aria-controls.
   - los botones que leen usan aria-busy + aria-disabled (no `disabled`), para no
     perder el foco al <body> durante la lectura.
   - los glifos ⟳ y ✓ van aria-hidden.
   ============================================================================ */

type Repo = { n: string; m: string; on: boolean; why?: string };

// Maqueta estática (persona Diego Gatica). Los conteos «n de N» se derivan de aquí.
const INITIAL_REPOS: Repo[] = [
  { n: "pago-conciliador", m: "Go · 412 KB · hace 3 días", on: true },
  { n: "idempotency-go", m: "Go · 214 KB · 41 commits", on: true },
  { n: "conciliador-api", m: "Go · protos + OpenAPI", on: true },
  { n: "reservas-club", m: "Python/Django · en producción", on: true },
  { n: "scraper-sii", m: "Python · 67 KB", on: true },
  { n: "dotfiles", m: "config personal", on: false, why: "config" },
  { n: "algoritmos-unab", m: "ejercicios de curso 2016", on: false, why: "tutorial" },
  { n: "linux-notes", m: "apuntes", on: false, why: "apuntes" },
  { n: "awesome-go (fork)", m: "fork sin commits propios", on: false, why: "fork" },
  { n: "react-tutorial (fork)", m: "fork sin commits propios", on: false, why: "fork" },
  { n: "prueba-hackathon-2019", m: "2 commits", on: false, why: "experimento" },
  { n: "tarea-redes", m: "curso 2017", on: false, why: "tutorial" },
];

type ReadState = "idle" | "reading" | "read";

/** prefers-reduced-motion vía el runtime vanilla; acorta la ceremonia simulada. */
function reduced(): boolean {
  return typeof window !== "undefined" && !!window.CorpusMotion?.rm();
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function FuentesScreen() {
  // boot() dibuja el único hr.c-divider del scope (no hay [data-reveal] aquí).
  const bootRef = useBoot<HTMLElement>();

  const [repos, setRepos] = useState<Repo[]>(INITIAL_REPOS);
  const [reposOpen, setReposOpen] = useState(false);
  const [ghState, setGhState] = useState<ReadState>("idle");
  const [webState, setWebState] = useState<ReadState>("idle");

  const total = repos.length;
  const selected = repos.filter((r) => r.on).length;

  function toggleRepo(i: number, checked: boolean) {
    setRepos((rs) => rs.map((r, idx) => (idx === i ? { ...r, on: checked } : r)));
  }

  async function readGithub() {
    if (ghState === "reading") return;
    setGhState("reading");
    await wait(reduced() ? 150 : 1900);
    setGhState("read");
  }

  async function reReadWeb() {
    if (webState === "reading") return;
    setWebState("reading");
    await wait(reduced() ? 150 : 1700);
    setWebState("read");
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
            <Link href="/app/fuentes" aria-current="page">
              Fuentes
            </Link>
          </nav>
          <div className="hd-right">
            <nav className="hd-nav" style={{ display: "flex" }}>
              <Link href="/app/ajustes">Ajustes</Link>
            </nav>
            <div className="hd-lang">
              <span data-on>ES</span>
              <span>EN</span>
            </div>
            <div className="hd-av">DG</div>
          </div>
        </div>
      </header>

      <main className="fu-main c-wall" data-screen-label="fuentes" ref={bootRef}>
        <div className="c-container">
          <div className="fu-lead">
            <p>
              Cada fuente dice <b style={{ color: "var(--text)", fontWeight: 500 }}>qué aportó</b> y qué
              hay de nuevo desde la última lectura. Nada se relee ni entra al master sin pasar por staging.
            </p>
            <Link className="c-btn" href="/app/importar">
              + Volcar más material
            </Link>
          </div>
          <hr className="c-divider" />

          {/* GitHub: la fuente estrella */}
          <article className="c-card fu-card" data-screen-label="fuentes-github">
            <div className="fu-h">
              <span className="nm">github.com/dgatica</span>
              <span className="tag star">sin IA — API con esquema</span>
              <span className="acts">
                <button
                  type="button"
                  className="c-btn c-btn--quiet"
                  id="btnRepos"
                  aria-expanded={reposOpen}
                  aria-controls="repos"
                  onClick={() => setReposOpen((v) => !v)}
                >
                  elegir repos ({selected} de {total})
                </button>
                <button
                  type="button"
                  className="c-btn"
                  id="btnRead"
                  aria-busy={ghState === "reading"}
                  aria-disabled={ghState === "reading"}
                  onClick={readGithub}
                >
                  {ghState === "reading" ? (
                    <>
                      <span className="c-spin" aria-hidden="true">
                        ⟳
                      </span>
                      {" leyendo la API…"}
                    </>
                  ) : ghState === "read" ? (
                    "Leer lo nuevo"
                  ) : (
                    <>
                      <span className="c-pulse-dot" />
                      {" Leer lo nuevo"}
                    </>
                  )}
                </button>
              </span>
            </div>
            <div className="fu-facts" id="ghFacts">
              <div>
                <div className="v">{total}</div>
                <div className="k">repos públicos</div>
              </div>
              <div>
                <div className="v">412.803</div>
                <div className="k">bytes de Go — un hecho, no una estimación</div>
              </div>
              <div>
                <div className="v">14</div>
                <div className="k">items aportados al master</div>
              </div>
              <div>
                <div className="v">hace 3 días</div>
                <div className="k">último push detectado</div>
              </div>
            </div>
            <div className="fu-new" id="ghNew" role="status" aria-live="polite">
              {ghState === "reading" ? (
                <>
                  <span className="c-spin" aria-hidden="true">
                    ⟳
                  </span>{" "}
                  idempotency-go: 3 commits nuevos · scraper-sii: README actualizado
                </>
              ) : ghState === "read" ? (
                <>
                  <span aria-hidden="true">✓</span> leído — <b>2 items nuevos</b> esperan en staging (nada
                  entra solo al master){" "}
                  <span className="go">
                    <Link className="c-btn c-btn--quiet" href="/app/staging">
                      revisar →
                    </Link>
                  </span>
                </>
              ) : (
                <>
                  <b>2 repos con actividad</b> desde la última lectura: idempotency-go, scraper-sii{" "}
                  <span className="go">
                    <button type="button" className="c-btn c-btn--quiet" onClick={readGithub}>
                      leerlos →
                    </button>
                  </span>
                </>
              )}
            </div>
            <div className={`fu-repos${reposOpen ? " open" : ""}`} id="repos">
              <div className="fu-rh">
                <b>
                  {selected} de {total} seleccionados.
                </b>{" "}
                Por defecto quedan fuera forks, tutoriales y configuración — <b>un CV no es un volcado de
                GitHub.</b> Revisa la decisión, no la delegues.
              </div>
              <div id="repoRows">
                {repos.map((r, i) => (
                  <label className={`fu-repo${r.on ? "" : " off"}`} key={r.n}>
                    <input
                      type="checkbox"
                      checked={r.on}
                      data-r={i}
                      onChange={(e) => toggleRepo(i, e.target.checked)}
                    />
                    <span className="nm">{r.n}</span>
                    <span className="meta">{r.m}</span>
                    {r.why ? <span className="why">fuera por defecto: {r.why}</span> : null}
                  </label>
                ))}
              </div>
            </div>
            <div className="fu-note">
              GitHub es la única fuente donde la IA no puede alucinar: no hay IA. Lo que ves es la API.
            </div>
          </article>

          {/* Portfolio */}
          <article className="c-card fu-card" data-screen-label="fuentes-portfolio">
            <div className="fu-h">
              <span className="nm">dgatica.cl</span>
              <span className="tag">portfolio</span>
              <span className="acts">
                <button
                  type="button"
                  className="c-btn c-btn--quiet"
                  id="btnWeb"
                  aria-busy={webState === "reading"}
                  aria-disabled={webState === "reading"}
                  onClick={reReadWeb}
                >
                  {webState === "reading" ? (
                    <>
                      <span className="c-spin" aria-hidden="true">
                        ⟳
                      </span>{" "}
                      leyendo…
                    </>
                  ) : (
                    "Releer"
                  )}
                </button>
              </span>
            </div>
            <div className="fu-facts">
              <div>
                <div className="v">6</div>
                <div className="k">proyectos documentados</div>
              </div>
              <div>
                <div className="v">12</div>
                <div className="k">items aportados</div>
              </div>
              <div>
                <div className="v">hace 12 días</div>
                <div className="k">última lectura</div>
              </div>
              <div role="status" aria-live="polite">
                <div className="v" id="webChg">
                  {webState === "reading" ? (
                    <span className="c-spin" aria-hidden="true">
                      ⟳
                    </span>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="k" id="webChgK">
                  {webState === "reading"
                    ? "comparando contra la lectura anterior…"
                    : webState === "read"
                      ? "sin cambios — misma versión que el 2 jul"
                      : "sin cambios detectados"}
                </div>
              </div>
            </div>
          </article>

          {/* Archivos */}
          <article className="c-card fu-card" data-screen-label="fuentes-archivos">
            <div className="fu-h">
              <span className="nm">archivos</span>
              <span className="tag">estáticos — no cambian solos</span>
              <span className="acts">
                <Link className="c-btn c-btn--quiet" href="/app/importar">
                  + subir otro
                </Link>
              </span>
            </div>
            <div className="fu-facts" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <div className="v" style={{ fontSize: "13px" }}>
                  CV_2023.pdf
                </div>
                <div className="k">2 páginas · aportó 15 items · leído 12 jul</div>
              </div>
              <div>
                <div className="v" style={{ fontSize: "13px" }}>
                  cuestionario-identidad.md
                </div>
                <div className="k">16 bloques · aportó 6 items · fuente de primera: lo escribiste tú</div>
              </div>
            </div>
          </article>

          {/* LinkedIn: honesto */}
          <article className="c-card fu-card fu-li" data-screen-label="fuentes-linkedin">
            <div className="fu-h">
              <span className="nm">linkedin</span>
              <span className="tag">no conectable — así funciona LinkedIn</span>
            </div>
            <p>
              LinkedIn bloquea la lectura externa de perfiles: ningún servicio serio puede conectarse, y
              los que lo prometen, scrapean contra sus términos. Tres vías que sí funcionan:
            </p>
            <div className="vias">
              <Link href="/app/importar">
                <b>Pegar el texto</b>Ctrl+A y Ctrl+C sobre tu perfil → a la caja de volcado. La más
                completa.
              </Link>
              <Link href="/app/importar">
                <b>El PDF oficial</b>En tu perfil: Más… → Guardar como PDF → súbelo.
              </Link>
              <Link href="/app/importar">
                <b>Capturas</b>Se transcriben literal. Lo que no se lee, no se inventa.
              </Link>
            </div>
          </article>

          <div className="fu-add">
            <input className="c-input" placeholder="https:// otra fuente — portfolio, blog, repositorio…" />
            <button type="button" className="c-btn">
              Añadir fuente
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
