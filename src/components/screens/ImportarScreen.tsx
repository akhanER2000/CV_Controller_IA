"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Aurora } from "@/components/Aurora";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
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
/** Tipos de archivo que subimos y extraemos (PDF unpdf / DOCX mammoth / imagen transcrita). */
type FileKind = "pdf" | "docx" | "image";
type UploadStatus = "uploading" | "ok" | "error";

interface Source {
  host: string;
  path: string;
  kind: Kind;
  note: string;
  ok: boolean;
  label: string;
}

interface FileItem {
  /** id local (no de Storage): identifica la fila mientras sube. */
  id: string;
  name: string;
  size: string;
  tag: string;
  /** tipo detectado (null = tipo no soportado). */
  kind: FileKind | null;
  /** ruta en Storage ({user_id}/{uuid}/{filename}) una vez subido. */
  path: string | null;
  status: UploadStatus;
  /** mensaje de error de subida (tipo no soportado, RLS, red…). */
  error?: string;
  /** aviso no bloqueante (p. ej. archivo grande). */
  note?: string;
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

/* El placeholder del textarea vive en el diccionario (importar.placeholder) —
   verbatim del HTML, con el DOBLE espacio tras «Por ejemplo:» y el salto real. */

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

/* Devuelve una CLAVE i18n (o el ext crudo, que degrada a sí mismo en t()) para
   la etiqueta del archivo; el texto visible se resuelve con t(f.tag) al pintar. */
function tagFor(name: string): string {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (ext === "md") return "importar.tag.md";
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "importar.tag.image";
  return ext;
}

function fmtSize(b: number): string {
  return b > 1048576
    ? (b / 1048576).toFixed(1).replace(".", ",") + " MB"
    : Math.max(1, Math.round(b / 1024)) + " KB";
}

/** Tipo de archivo que sabemos extraer. null = no soportado (se avisa, no se sube). */
function kindFor(name: string, mime: string): FileKind | null {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  return null;
}

/** Clave de Storage segura: conserva la extensión, sanea el resto. */
function safeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "archivo";
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^a-zA-Z0-9]+/g, "").toLowerCase() : "";
  return ext ? `${base}.${ext}` : base;
}

const MAX_WARN_BYTES = 10 * 1024 * 1024; // >10 MB: avisamos (no bloqueamos).

function countWords(txt: string): number {
  return (txt.trim().match(/\S+/g) ?? []).length;
}

export function ImportarScreen() {
  const t = useT();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDrag, setIsDrag] = useState(false);
  const [screen, setScreen] = useState<Screen>("idle");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // Cliente de Supabase del navegador: la subida es DIRECTA a Storage (los
  // archivos nunca pasan por el body de la ruta, límite 4,5 MB de Vercel).
  const supabase = useMemo(() => createClient(), []);

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
  const okFiles = files.filter((f) => f.status === "ok" && f.path && f.kind);
  const uploading = files.some((f) => f.status === "uploading");
  // Listo si hay texto suficiente o al menos un archivo subido; nunca mientras sube.
  const ready = (text.trim().length >= 40 || okFiles.length > 0) && !uploading;
  const clearHidden = text.length === 0 && files.length === 0;

  const linkCount = sources.length;
  const linkPart = linkCount
    ? " · " +
      (linkCount === 1 ? t("importar.meta.linkOne") : t("importar.meta.linkMany")).replace(
        "{n}",
        String(linkCount),
      )
    : "";
  const taMeta = t("importar.meta.words").replace("{n}", words.toLocaleString("es-CL")) + linkPart;

  const hdStep =
    screen === "ingest"
      ? t("importar.step.ingest")
      : screen === "done"
        ? t("importar.step.done")
        : t("importar.step.idle");

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

  // ── ficheros: subida DIRECTA a Storage con estado por archivo ───────────────
  function patchFile(id: string, patch: Partial<FileItem>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  async function uploadOne(file: File, id: string) {
    const kind = kindFor(file.name, file.type || "");
    if (!kind) {
      patchFile(id, { status: "error", error: t("importar.file.unsupported") });
      return;
    }
    const note = file.size > MAX_WARN_BYTES ? t("importar.file.tooBig") : undefined;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        patchFile(id, { status: "error", error: t("importar.file.needSession") });
        return;
      }
      // Path {user_id}/{uuid}/{filename}: la RLS del bucket autoriza al dueño
      // (primer segmento = auth.uid()).
      const path = `${user.id}/${crypto.randomUUID()}/${safeName(file.name)}`;
      const { error } = await supabase.storage
        .from("sources")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) {
        patchFile(id, { status: "error", error: error.message });
        return;
      }
      patchFile(id, { status: "ok", kind, path, note });
    } catch (e) {
      patchFile(id, { status: "error", error: e instanceof Error ? e.message : t("importar.file.uploadFailed") });
    }
  }

  function addFiles(list: FileList | File[]) {
    for (const f of Array.from(list)) {
      const id = crypto.randomUUID();
      setFiles((prev) => [
        ...prev,
        {
          id,
          name: f.name,
          size: fmtSize(f.size || 0),
          tag: tagFor(f.name),
          kind: null,
          path: null,
          status: "uploading",
        },
      ]);
      void uploadOne(f, id);
    }
  }

  function removeFile(id: string) {
    // Best-effort: si ya estaba en Storage, lo quitamos (no bloquea la UI).
    const target = files.find((f) => f.id === id);
    if (target?.path) void supabase.storage.from("sources").remove([target.path]);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function useSample() {
    setText(SAMPLE);
  }
  function clearAll() {
    for (const f of files) if (f.path) void supabase.storage.from("sources").remove([f.path]);
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
    setRow(id, { st: "ok", det: t("importar.log.onlyPage1"), errActs: false });
    errResolve.current?.();
    errResolve.current = null;
  }
  async function onRetry(id: number) {
    setRow(id, { retrying: true });
    await wait(1400);
    setRow(id, {
      st: "err",
      det: t("importar.log.retryFail"),
      errActs: false,
      retrying: false,
    });
    errResolve.current?.();
    errResolve.current = null;
  }

  async function runIngest() {
    if (running.current || uploading) return;
    running.current = true;
    setErr(null);

    itemCount.current = 0;
    if (countRef.current) countRef.current.textContent = "0";
    setRows([]);
    revealed.current.clear();
    setResult(null);
    setWarnings([]);
    setScreen("ingest");
    window.CorpusAurora?.setState("active");

    // Archivos ya subidos: van por referencia (path), nunca por el body.
    const sendFiles = okFiles.map((f) => ({ path: f.path, name: f.name, kind: f.kind }));

    // Log HONESTO: qué se está leyendo, sin cifras inventadas por fuente. El
    // total real llega en la respuesta (no hay SSE por-fuente todavía).
    const src = detectSources(text);
    const rowIds: number[] = [];
    if (text.trim().length >= 20)
      rowIds.push(logRow(t("importar.log.pastedText"), t("importar.log.reading"), "run"));
    for (const f of okFiles) {
      const det =
        f.kind === "image"
          ? t("importar.log.transcribing")
          : f.kind === "pdf"
            ? t("importar.log.readingPdf")
            : t("importar.log.readingDocx");
      rowIds.push(logRow(f.name, det, "run"));
    }
    for (const s of src) {
      if (s.kind === "github") rowIds.push(logRow(s.label, t("importar.log.queryingApi"), "run"));
      else if (s.kind === "web") rowIds.push(logRow(s.label, t("importar.log.readingPortfolio"), "run"));
      // linkedin: no se lee desde el servidor (se avisa en el volcado)
    }
    const idAI = logRow(t("importar.log.extractingSrc"), t("importar.log.extractingDet"), "run");

    try {
      const res = await fetch("/api/import/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, files: sendFiles }),
      });
      const data = (await res.json()) as ImportResponse & { error?: string; warnings?: string[] };
      if (!res.ok) throw new Error(data.error || t("importar.extractFailed"));

      for (const id of rowIds) setRow(id, { st: "ok" });
      setRow(idAI, {
        st: "ok",
        det: t("importar.log.result")
          .replace("{total}", String(data.counts.total))
          .replace("{verified}", String(data.counts.verified)),
      });
      itemCount.current = data.counts.total;
      setCount(data.counts.total, 600);
      setResult(data);
      setWarnings(data.warnings ?? []);

      await wait(700);
      window.CorpusAurora?.setState("calm");
      setScreen("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("importar.extractFailed"));
      setRows((prev) => prev.map((r) => (r.st === "run" ? { ...r, st: "err", det: t("importar.log.stopped") } : r)));
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
            <div className="hd-lang" aria-label={t("importar.langAria")}>
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
            {t("importar.overline")}
          </span>
          <h1 className="imp-h1" id="h1" ref={h1Ref}>
            {t("importar.h1.pre")}
            <em>{t("importar.h1.em")}</em>
          </h1>
          <p className="imp-sub" data-reveal style={{ "--d": "520ms" } as React.CSSProperties}>
            {t("importar.sub")}
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
              aria-label={t("importar.ta.aria")}
              placeholder={t("importar.placeholder")}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <div className={`imp-detect${sources.length ? " has" : ""}`} id="detect">
              <span className="t-overline">{t("importar.detect.overline")}</span>
              <div className="imp-chips" id="chips">
                {sources.map((s) => (
                  <span className={`c-chip${s.ok ? " c-chip--ok" : ""}`} key={s.host + s.path}>
                    <span className="dot" />
                    <b>{s.label}</b>
                    <span>· {t(`importar.chip.${s.kind}`)}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className={`imp-files${files.length ? " has" : ""}`} id="files">
              {files.map((f) => {
                const statusText =
                  f.status === "uploading"
                    ? t("importar.file.uploading")
                    : f.status === "error"
                      ? `${t("importar.file.errorPrefix")}${f.error ?? t("importar.file.uploadFailed")}`
                      : f.note
                        ? `${t(f.tag)} · ${f.note}`
                        : t(f.tag);
                return (
                  <div className="imp-file" key={f.id}>
                    <span className="nm">{f.name}</span>
                    <span className="sz">{f.size}</span>
                    <span
                      className="tag"
                      style={f.status === "error" ? { color: "var(--danger)" } : undefined}
                    >
                      {statusText}
                    </span>
                    <button type="button" className="rm" aria-label={t("importar.file.remove")} onClick={() => removeFile(f.id)}>
                      ×
                    </button>
                  </div>
                );
              })}
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
              <b>{t("importar.drop.bold")}</b>
              {t("importar.drop.rest")}
              <br />
              {t("importar.drop.line2")}
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
                  {t("importar.useSample")}
                </button>
                <button type="button" id="btnClear" hidden={clearHidden} onClick={clearAll}>
                  {t("importar.clear")}
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
            <h3>{t("importar.li.title")}</h3>
            <p>{t("importar.li.body")}</p>
            <ol>
              <li>
                <span className="n">01</span>
                <span className="h">{t("importar.li.s1.h")}</span>
                <span className="d">
                  {t("importar.li.inProfile")}
                  <span className="c-kbd">Ctrl</span>+<span className="c-kbd">A</span>
                  {t("importar.li.s1.mid")}
                  <span className="c-kbd">Ctrl</span>+<span className="c-kbd">C</span>
                  {t("importar.li.s1.post")}
                </span>
              </li>
              <li>
                <span className="n">02</span>
                <span className="h">{t("importar.li.s2.h")}</span>
                <span className="d">
                  {t("importar.li.inProfile")}
                  <b>{t("importar.li.s2.b1")}</b> → <b>{t("importar.li.s2.b2")}</b>
                  {t("importar.li.s2.post")}
                </span>
              </li>
              <li>
                <span className="n">03</span>
                <span className="h">{t("importar.li.s3.h")}</span>
                <span className="d">{t("importar.li.s3.d")}</span>
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
                {t("importar.cta")}
              </button>
            </span>
            <Link className="imp-alt" href="/app/onboarding">
              {t("importar.altWrite")}
            </Link>
          </div>

          {err ? (
            <p className="imp-note" role="alert" style={{ color: "var(--danger)" }}>
              {err}
            </p>
          ) : null}

          <p className="imp-note" data-reveal style={{ "--d": "880ms" } as React.CSSProperties}>
            <span className="c-divider" style={{ "--d": "900ms" } as React.CSSProperties} />
            {t("importar.note")}
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
          <span className="t-overline">{t("importar.ing.overline")}</span>
          <div className="ing-count" id="count" ref={countRef} role="status" aria-live="polite">
            0
          </div>
          <div className="ing-cap">{t("importar.ing.caption")}</div>
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
                      {t("importar.err.continue")}
                    </button>
                    <button type="button" onClick={() => onRetry(r.id)}>
                      {r.retrying ? (
                        <>
                          <span className="c-spin">⟳</span> {t("importar.err.retrying")}
                        </>
                      ) : (
                        t("importar.err.retry")
                      )}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="ing-hint">
            {t("importar.ing.hint1")}
            <br />
            {t("importar.ing.hint2")}
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
          <span className="t-overline">{t("importar.fin.overline")}</span>
          <h2 style={{ marginTop: "18px" }}>{t("importar.fin.title")}</h2>
          <div className="c-panel fin-panel" id="finPanel" ref={finPanelRef}>
            <div className="fin-head">
              <span className="n" id="finCount">
                {result?.counts.total ?? 0}
              </span>
              <span className="l">{t("importar.fin.awaitReview")}</span>
            </div>
            <div className="fin-grid">
              <div className="fin-cell">
                <div className="v">{result?.counts.verified ?? 0}</div>
                <div className="k">{t("importar.fin.verified")}</div>
              </div>
              <div className="fin-cell">
                <div className="v">{result?.counts.partial ?? 0}</div>
                <div className="k">{t("importar.fin.partial")}</div>
              </div>
              <div className="fin-cell">
                <div className="v">{result?.counts.api ?? 0}</div>
                <div className="k">{t("importar.fin.api")}</div>
              </div>
            </div>
            <div className="fin-noev">
              <span className="c-ver c-ver--none">
                {result?.counts.none ?? 0} {t("importar.fin.noneLabel")}
              </span>
              <span>{t("importar.fin.flagged")}</span>
            </div>
          </div>

          {/* Avisos honestos por archivo (PDF escaneado sin capa, imagen ilegible…):
              nunca se inventa lo que no se pudo leer. */}
          {warnings.length > 0 ? (
            <div className="c-card" style={{ width: "100%", marginTop: 14, textAlign: "left", padding: "16px 20px" }}>
              <span className="t-overline">{t("importar.fin.warnings")}</span>
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--text-muted)", fontSize: "var(--fs-ui)" }}>
                {warnings.map((w, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="fin-cta">
            <span className="c-forge">
              <Link className="c-btn c-btn--forge c-btn--hero" href="/app/staging">
                {t("importar.fin.reviewCta")}
              </Link>
            </span>
            <span className="fin-sub">{t("importar.fin.sub")}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
