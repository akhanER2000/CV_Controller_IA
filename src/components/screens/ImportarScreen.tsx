"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Aurora } from "@/components/Aurora";
import "./importar.css";

/* ============================================================================
   Importar — porte de corpus-design/04-pantallas/importar.html
   (ver docs/spec/pantallas/importar.md). VENTANA con aurora en calma; la
   aurora pasa a `active` SOLO durante la ingesta (el pulso de la máquina
   pensando) y vuelve a `calm` al terminar. La pausa por foco de campo la
   cablea motion.js sola (crítico aquí: el volcado es un <textarea>).

   Tres estados-página (un <main> visible a la vez): volcado → ingesta → fin.
   Nada entra al master sin confirmación; la extracción cita evidencia.

   Fidelidad:
   - overline con charReveal, h1 con wordReveal (una sola vez, tras el runtime).
   - Detector de URLs en vivo (chips github/web/linkedin) con la misma regex y
     clasificación del diseño; el «momento LinkedIn» aparece con M.enter().
   - Dropzone operable por teclado (ya era role="button" tabindex 0 en el HTML).
   - Ingesta async con log de filas (M.reveal), contador honesto (M.counter
     hacia el total REAL derivado de la grilla del fin, no un 61 mágico) y la
     recuperación del PDF escaneado con sus dos botones.
   - El fin recibe EL ÚNICO shimmer del producto (M.shimmer, doble rAF).
   - El panel .demo NO se porta (convención de entrega, no producto): los
     estados reales se alcanzan con el CTA «Extraer con evidencia».
   - A11y (spec §8): live regions en contador y log, aria-busy en la ingesta,
     y el foco se mueve al <main> que entra.
   ============================================================================ */

type Screen = "idle" | "ingest" | "done";
type Kind = "github" | "linkedin" | "web";
type RowState = "run" | "ok" | "err";

interface Source {
  host: string;
  path: string;
  kind: Kind;
  note: string;
  ok: boolean;
  label: string;
}

interface FileItem {
  name: string;
  size: string;
  tag: string;
}

interface LogRow {
  id: number;
  src: string;
  det: string;
  st: RowState;
  errActs?: boolean;
  retrying?: boolean;
}

/* Texto de ejemplo — la fuente de la que sale todo lo demás (persona del mock:
   Diego Gatica). Verbatim del HTML. */
const SAMPLE = `Soy ingeniero civil en computación, titulado en la UNAB (2019). Los últimos tres años trabajé en Altiplano Pagos como backend developer — partí haciendo integraciones de pago y terminé a cargo del servicio de conciliación (Go, ~40 mil transacciones diarias). Antes estuve dos años en el e-commerce de Rayén Retail, en el equipo de checkout.

Mi portfolio es https://dgatica.cl y mi github es github.com/dgatica. También dejo el LinkedIn: linkedin.com/in/diego-gatica

Sé Go, Python, SQL, algo de Kubernetes (lo usamos pero no lo administraba yo). Inglés B2. Diplomado en ingeniería de datos en la UC (2022).`;

/* Placeholder del textarea — verbatim del HTML (genérico, no el de la persona;
   ojo al DOBLE espacio tras «Por ejemplo:» y al salto real de línea). */
const PLACEHOLDER = `Pega lo que tengas. Sin formato. Sin orden.

Por ejemplo:  «Soy ingeniero civil en computación, titulado en la UNAB. Trabajé tres años en una fintech haciendo APIs de pago… mi portfolio es https://misitio.cl y mi github es github.com/usuario. Adjunto también mi CV viejo.»`;

/* La respuesta real de /api/import/context. El "fin" se renderiza de estos
   conteos REALES (no de una grilla de maqueta): total y niveles de evidencia. */
interface ImportResponse {
  sourceId: string;
  staged: number;
  counts: { verified: number; partial: number; none: number; api: number; total: number };
  sources: string[];
  linkedin: { url: string; slug?: string }[];
}

/* Detección de links en vivo — misma regex y clasificación del diseño. */
const URL_RE = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/[^\s,;)»"']*)?/gi;

function classify(host: string): { kind: Kind; note: string; ok: boolean } {
  if (host.includes("github.com")) return { kind: "github", note: "API pública — se leerá sin IA", ok: true };
  if (host.includes("linkedin.com")) return { kind: "linkedin", note: "no legible desde fuera", ok: false };
  return { kind: "web", note: "se leerá como portfolio", ok: true };
}

function detectSources(txt: string): Source[] {
  const found = new Map<string, Source>();
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(txt)) !== null) {
    const host = m[1].toLowerCase();
    const tld = host.split(".").pop() ?? "";
    if (!/[a-z]{2,}$/.test(tld)) continue;
    const path = (m[2] ?? "").replace(/[.,;)»"']+$/, "");
    const key = host + path;
    if (!found.has(key)) {
      const c = classify(host);
      const full = host + path;
      const label = full.length > 32 ? full.slice(0, 31) + "…" : full;
      found.set(key, { host, path, label, ...c });
    }
  }
  return [...found.values()];
}

function tagFor(name: string): string {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (ext === "md") return "cuestionario · fuente de primera";
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "captura · se transcribe literal";
  return ext;
}

function fmtSize(b: number): string {
  return b > 1048576
    ? (b / 1048576).toFixed(1).replace(".", ",") + " MB"
    : Math.max(1, Math.round(b / 1024)) + " KB";
}

function countWords(txt: string): number {
  return (txt.trim().match(/\S+/g) ?? []).length;
}

export function ImportarScreen() {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDrag, setIsDrag] = useState(false);
  const [screen, setScreen] = useState<Screen>("idle");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ── ceremonia de entrada ──────────────────────────────────────────────────
  const ovRef = useRef<HTMLSpanElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const splitDone = useRef(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInRef = useRef<HTMLInputElement>(null);
  const liPanelRef = useRef<HTMLDivElement>(null);
  const prevLi = useRef(false);

  // ── ingesta ─────────────────────────────────────────────────────────────
  const stIngestRef = useRef<HTMLElement>(null);
  const stDoneRef = useRef<HTMLElement>(null);
  const finPanelRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const itemCount = useRef(0);
  const rowId = useRef(0);
  const revealed = useRef<Set<number>>(new Set());
  const running = useRef(false);
  const errResolve = useRef<(() => void) | null>(null);

  const sources = useMemo(() => detectSources(text), [text]);
  const words = useMemo(() => countWords(text), [text]);
  const hasLi = sources.some((s) => s.kind === "linkedin");
  const ready = text.trim().length >= 40 || files.length > 0;
  const clearHidden = text.length === 0 && files.length === 0;

  const linkCount = sources.length;
  const taMeta =
    words.toLocaleString("es-CL") +
    " palabras" +
    (linkCount
      ? " · " + linkCount + " link" + (linkCount > 1 ? "s" : "") + " detectado" + (linkCount > 1 ? "s" : "")
      : "");

  const hdStep =
    screen === "ingest"
      ? "INGESTA · LEYENDO FUENTES"
      : screen === "done"
        ? "INGESTA · COMPLETA"
        : "VOLCADO · PASO 1 DE 2";

  // charReveal (overline) + wordReveal (h1) + boot — una sola vez.
  useEffect(() => {
    let tries = 0;
    const id = window.setInterval(() => {
      const M = window.CorpusMotion;
      if (!M) {
        if (++tries > 100) window.clearInterval(id);
        return;
      }
      window.clearInterval(id);
      if (!splitDone.current) {
        splitDone.current = true;
        if (ovRef.current) M.chars(ovRef.current);
        if (h1Ref.current) M.words(h1Ref.current);
      }
      M.boot();
    }, 30);
    return () => window.clearInterval(id);
  }, []);

  // autosize del textarea (el CSS ya limita min 240px / max 50vh).
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(window.innerHeight * 0.5, Math.max(240, ta.scrollHeight)) + "px";
  }, [text]);

  // El momento LinkedIn: entra con M.enter() en la primera aparición del link.
  useEffect(() => {
    if (hasLi && !prevLi.current && liPanelRef.current) {
      window.CorpusMotion?.enter(liPanelRef.current);
    }
    prevLi.current = hasLi;
  }, [hasLi]);

  // Transiciones de <main>: M.enter + foco al que entra; shimmer en el fin.
  useEffect(() => {
    const M = window.CorpusMotion;
    if (screen === "ingest" && stIngestRef.current) {
      M?.enter(stIngestRef.current);
      stIngestRef.current.focus();
    } else if (screen === "done" && stDoneRef.current) {
      M?.enter(stDoneRef.current);
      stDoneRef.current.focus();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (finPanelRef.current) M?.shimmer(finPanelRef.current);
        }),
      );
    }
  }, [screen]);

  // ── ficheros ──────────────────────────────────────────────────────────────
  function addFiles(list: FileList | File[]) {
    const added = Array.from(list).map((f) => ({
      name: f.name,
      size: fmtSize(f.size || 0),
      tag: tagFor(f.name),
    }));
    if (added.length) setFiles((prev) => [...prev, ...added]);
  }
  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function useSample() {
    setText(SAMPLE);
  }
  function clearAll() {
    setText("");
    setFiles([]);
    prevLi.current = false;
  }

  // ── la espera: progreso específico y verdadero, jamás un porcentaje ────────
  const rm = (): boolean => !!window.CorpusMotion?.rm();
  const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, rm() ? Math.min(ms, 120) : ms));

  function setCount(to: number, dur: number) {
    const el = countRef.current;
    if (!el) return;
    const M = window.CorpusMotion;
    if (M) M.counter(el, to, { dur });
    else el.textContent = String(to);
  }
  function logRow(src: string, det: string, st: RowState): number {
    const id = ++rowId.current;
    setRows((prev) => [...prev, { id, src, det, st }]);
    return id;
  }
  function setRow(id: number, patch: Partial<Omit<LogRow, "id">>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  // reveal-once por fila cuando su nodo monta.
  const rowRef = (id: number) => (el: HTMLDivElement | null) => {
    if (el && !revealed.current.has(id)) {
      revealed.current.add(id);
      window.CorpusMotion?.reveal(el);
    }
  };

  function onContinue(id: number) {
    setRow(id, { st: "ok", det: "solo página 1 · 6 items", errActs: false });
    errResolve.current?.();
    errResolve.current = null;
  }
  async function onRetry(id: number) {
    setRow(id, { retrying: true });
    await wait(1400);
    setRow(id, {
      st: "err",
      det: "sigue sin texto — continuando con la página 1",
      errActs: false,
      retrying: false,
    });
    errResolve.current?.();
    errResolve.current = null;
  }

  async function runIngest() {
    if (running.current) return;
    running.current = true;
    setErr(null);

    itemCount.current = 0;
    if (countRef.current) countRef.current.textContent = "0";
    setRows([]);
    revealed.current.clear();
    setResult(null);
    setScreen("ingest");
    window.CorpusAurora?.setState("active");

    // Log HONESTO: qué se está leyendo, sin cifras inventadas por fuente. El
    // total real llega en la respuesta (no hay SSE por-fuente todavía).
    const src = detectSources(text);
    const rowIds: number[] = [logRow("Texto pegado", "leyendo…", "run")];
    for (const s of src) {
      if (s.kind === "github") rowIds.push(logRow(s.label, "consultando la API pública…", "run"));
      else if (s.kind === "web") rowIds.push(logRow(s.label, "leyendo el portfolio…", "run"));
      // linkedin: no se lee desde el servidor (se avisa en el volcado)
    }
    const idAI = logRow("Extrayendo con evidencia", "la IA estructura y cita el origen…", "run");

    try {
      const res = await fetch("/api/import/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as ImportResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo extraer.");

      for (const id of rowIds) setRow(id, { st: "ok" });
      setRow(idAI, { st: "ok", det: `${data.counts.total} items · ${data.counts.verified} con evidencia literal` });
      itemCount.current = data.counts.total;
      setCount(data.counts.total, 600);
      setResult(data);

      await wait(700);
      window.CorpusAurora?.setState("calm");
      setScreen("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo extraer.");
      setRows((prev) => prev.map((r) => (r.st === "run" ? { ...r, st: "err", det: "detenido" } : r)));
      window.CorpusAurora?.setState("calm");
      setScreen("idle");
    } finally {
      running.current = false;
    }
  }

  return (
    <div className="c-page">
      <Aurora state="calm" />

      <header className="c-header">
        <div className="c-container">
          <div className="hd-crumb">
            <Link className="c-logo" href="/app">
              Corpus
            </Link>
            <span className="hd-sep" />
            <span className="hd-step" id="hdStep">
              {hdStep}
            </span>
          </div>
          <div className="hd-right">
            <div className="hd-lang" aria-label="Idioma">
              <span data-on>ES</span>
              <span>EN</span>
            </div>
            <div className="hd-av">DG</div>
          </div>
        </div>
      </header>

      {/* ═══ ESTADO: VOLCADO (ventana — la aurora asoma, en calma) ═══ */}
      <main className="imp-main c-window" id="stIdle" data-screen-label="importar-volcado" hidden={screen !== "idle"}>
        <div className="imp-col">
          <span className="t-overline" id="ov" ref={ovRef}>
            Nada entra al master sin tu confirmación
          </span>
          <h1 className="imp-h1" id="h1" ref={h1Ref}>
            No escribas tu perfil. <em>Vuélcalo.</em>
          </h1>
          <p className="imp-sub" data-reveal style={{ "--d": "520ms" } as React.CSSProperties}>
            Pega lo que tengas: párrafos sueltos, tu CV viejo, notas, links. El orden no importa — ordenarlo es
            trabajo nuestro.
          </p>

          <div
            className={`c-panel imp-box${isDrag ? " is-drag" : ""}`}
            id="dropzone"
            data-reveal
            style={{ "--d": "640ms" } as React.CSSProperties}
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDrag(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDrag(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDrag(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer) addFiles(e.dataTransfer.files);
              setIsDrag(false);
            }}
          >
            <textarea
              className="imp-ta"
              id="ta"
              ref={taRef}
              spellCheck={false}
              aria-label="Pega aquí lo que tengas"
              placeholder={PLACEHOLDER}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <div className={`imp-detect${sources.length ? " has" : ""}`} id="detect">
              <span className="t-overline">Fuentes detectadas en tu texto</span>
              <div className="imp-chips" id="chips">
                {sources.map((s) => (
                  <span className={`c-chip${s.ok ? " c-chip--ok" : ""}`} key={s.host + s.path}>
                    <span className="dot" />
                    <b>{s.label}</b>
                    <span>· {s.note}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className={`imp-files${files.length ? " has" : ""}`} id="files">
              {files.map((f, i) => (
                <div className="imp-file" key={f.name + i}>
                  <span className="nm">{f.name}</span>
                  <span className="sz">{f.size}</span>
                  <span className="tag">{f.tag}</span>
                  <button type="button" className="rm" aria-label="Quitar" onClick={() => removeFile(i)}>
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div
              className="imp-drop"
              id="drop"
              role="button"
              tabIndex={0}
              onClick={() => fileInRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInRef.current?.click();
                }
              }}
            >
              <b>arrastra archivos aquí</b> — o haz clic para elegir
              <br />
              CV en PDF o DOCX · el cuestionario respondido (.md) · capturas de LinkedIn · certificados
            </div>
            <input
              type="file"
              id="fileIn"
              ref={fileInRef}
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="imp-meta">
              <span id="taMeta">{taMeta}</span>
              <span className="acts">
                <button type="button" id="btnSample" onClick={useSample}>
                  usar texto de ejemplo
                </button>
                <button type="button" id="btnClear" hidden={clearHidden} onClick={clearAll}>
                  limpiar
                </button>
              </span>
            </div>
          </div>

          {/* El momento LinkedIn: honestidad con dignidad, no un error */}
          <div
            className="c-card imp-li"
            id="liPanel"
            ref={liPanelRef}
            hidden={!hasLi}
            data-screen-label="importar-linkedin"
          >
            <h3>LinkedIn no permite que un servicio lea tu perfil desde fuera.</h3>
            <p>
              Está detrás de tu sesión y bloquea lectores automáticos — a nosotros y a cualquiera que diga lo
              contrario. Tres vías que sí funcionan:
            </p>
            <ol>
              <li>
                <span className="n">01</span>
                <span className="h">Copia el texto de tu perfil</span>
                <span className="d">
                  En tu perfil: <span className="c-kbd">Ctrl</span>+<span className="c-kbd">A</span> y{" "}
                  <span className="c-kbd">Ctrl</span>+<span className="c-kbd">C</span>, y pégalo aquí encima. Es la
                  vía más completa.
                </span>
              </li>
              <li>
                <span className="n">02</span>
                <span className="h">Sube el PDF que exporta LinkedIn</span>
                <span className="d">
                  En tu perfil: <b>Más…</b> → <b>Guardar como PDF</b>. Arrástralo a esta caja.
                </span>
              </li>
              <li>
                <span className="n">03</span>
                <span className="h">Capturas de pantalla</span>
                <span className="d">
                  Las transcribimos literal, sin interpretar. Lo que no se lea, no se inventa.
                </span>
              </li>
            </ol>
          </div>

          <div className="imp-cta" data-reveal style={{ "--d": "760ms" } as React.CSSProperties}>
            <span className="c-forge">
              <button
                className="c-btn c-btn--forge c-btn--hero"
                id="btnGo"
                disabled={!ready}
                onClick={() => runIngest()}
              >
                Extraer con evidencia
              </button>
            </span>
            <Link className="imp-alt" href="/app/onboarding">
              Prefiero escribirlo de cero →
            </Link>
          </div>

          {err ? (
            <p className="imp-note" role="alert" style={{ color: "var(--danger)" }}>
              {err}
            </p>
          ) : null}

          <p className="imp-note" data-reveal style={{ "--d": "880ms" } as React.CSSProperties}>
            <span className="c-divider" style={{ "--d": "900ms" } as React.CSSProperties} />
            La IA no inventa: cada dato citará el fragmento del que salió. Tú confirmas item por item antes de que
            entre al master.
          </p>
        </div>
      </main>

      {/* ═══ ESTADO: INGESTA (ventana — aurora ACTIVA: el pulso de la máquina) ═══ */}
      <main
        className="imp-main c-window"
        id="stIngest"
        ref={stIngestRef}
        tabIndex={-1}
        hidden={screen !== "ingest"}
        data-screen-label="importar-ingesta"
        aria-busy={screen === "ingest"}
      >
        <div className="ing-col">
          <span className="t-overline">Leyendo tus fuentes</span>
          <div className="ing-count" id="count" ref={countRef} role="status" aria-live="polite">
            0
          </div>
          <div className="ing-cap">items encontrados hasta ahora</div>
          <div className="c-panel ing-log" id="log" aria-live="polite">
            {rows.map((r) => (
              <div key={r.id} ref={rowRef(r.id)} className={`ing-row is-${r.st}`}>
                <span className="st">
                  {r.st === "run" ? <span className="c-spin">⟳</span> : r.st === "ok" ? "✓" : "✕"}
                </span>
                <span className="src">{r.src}</span>
                <span className="det">{r.det}</span>
                {r.errActs && (
                  <div className="ing-err-acts">
                    <button type="button" onClick={() => onContinue(r.id)}>
                      Continuar sin la página 2
                    </button>
                    <button type="button" onClick={() => onRetry(r.id)}>
                      {r.retrying ? (
                        <>
                          <span className="c-spin">⟳</span> reintentando…
                        </>
                      ) : (
                        "Reintentar"
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="ing-hint">
            Esto toma entre 5 y 40 segundos según las fuentes.
            <br />
            Sin porcentajes inventados: te decimos qué estamos haciendo.
          </p>
        </div>
      </main>

      {/* ═══ ESTADO: FIN (el ÚNICO shimmer de todo el producto) ═══ */}
      <main
        className="imp-main c-window"
        id="stDone"
        ref={stDoneRef}
        tabIndex={-1}
        hidden={screen !== "done"}
        data-screen-label="importar-fin"
      >
        <div className="fin-col">
          <span className="t-overline">Extracción completa</span>
          <h2 style={{ marginTop: "18px" }}>Listo. Ahora, tu turno.</h2>
          <div className="c-panel fin-panel" id="finPanel" ref={finPanelRef}>
            <div className="fin-head">
              <span className="n" id="finCount">
                {result?.counts.total ?? 0}
              </span>
              <span className="l">items esperan tu revisión</span>
            </div>
            <div className="fin-grid">
              <div className="fin-cell">
                <div className="v">{result?.counts.verified ?? 0}</div>
                <div className="k">con evidencia literal</div>
              </div>
              <div className="fin-cell">
                <div className="v">{result?.counts.partial ?? 0}</div>
                <div className="k">evidencia parcial</div>
              </div>
              <div className="fin-cell">
                <div className="v">{result?.counts.api ?? 0}</div>
                <div className="k">dato duro (GitHub)</div>
              </div>
            </div>
            <div className="fin-noev">
              <span className="c-ver c-ver--none">{result?.counts.none ?? 0} sin evidencia</span>
              <span>quedan marcados — la revisión te los pondrá delante, no debajo.</span>
            </div>
          </div>
          <div className="fin-cta">
            <span className="c-forge">
              <Link className="c-btn c-btn--forge c-btn--hero" href="/app/staging">
                Revisar en staging →
              </Link>
            </span>
            <span className="fin-sub">Nada entra al master sin tu confirmación.</span>
          </div>
        </div>
      </main>
    </div>
  );
}
