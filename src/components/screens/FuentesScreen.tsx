"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Aurora } from "@/components/Aurora";
import { DropZone } from "@/components/DropZone";
import { useBoot } from "@/lib/corpus/runtime";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { withOrigin } from "@/components/Breadcrumb";
import { fileKindFromName, safeStorageName, type FileKind } from "@/lib/db/sources";
import "./fuentes.css";

/* ============================================================================
   Fuentes — porte de corpus-design/04-pantallas/fuentes.html
   (ver docs/spec/pantallas/fuentes.md).

   ★ VENTANA (antes muro). Aquí no se LEE trabajo denso: se DECIDE qué material
   entra y por qué vía — arrastrar un PDF, pegar texto, conectar GitHub. Es una
   sala de puertas, y las puertas respiran: monta <Aurora state="calm"/>, el
   <main> es .c-window y cada tarjeta es .c-panel (vidrio ahumado) para que el
   humo se intuya detrás sin comerse una letra. El texto suelto que no vive
   dentro de una tarjeta lleva su velo (.c-scrim--soft).
   El único movimiento de montaje sigue siendo el hr.c-divider de CorpusMotion.boot().

   ★ CABLEADO A DATOS REALES (agente B). En modo Supabase cada tarjeta ES la acción
   IN SITU (sin salir de Fuentes): PDF/DOCX, imágenes, texto, URL y GitHub suben /
   pegan / consultan y stagean; LinkedIn ejecuta sus tres vías dentro de su tarjeta;
   cada fuente ya ingerida ofrece «releer» y «quitar». La maqueta completa (persona
   Diego Gatica) SOLO se usa como fallback del modo local.
   ============================================================================ */

/* Origen que Fuentes declara al mandarte a una pantalla interior. Toda salida de
   aquí hacia /app/importar o /app/staging lo lleva, para que el botón volver de
   esas pantallas te devuelva A FUENTES y no "al Panel por defecto". */
const ORIGEN = "/app/fuentes";
const HREF_IMPORTAR = withOrigin("/app/importar", ORIGEN);
const HREF_STAGING = withOrigin("/app/staging", ORIGEN);
const hrefStagingDe = (sourceId: string) => withOrigin(`/app/staging?source=${sourceId}`, ORIGEN);

type Repo = { n: string; m: string; on: boolean; why?: string };

// Maqueta del MODO LOCAL (persona Diego Gatica). Nunca se usa con Supabase.
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

interface SourceView {
  id: string;
  kind: string;
  originalName: string | null;
  sourceUrl: string | null;
  status: string;
  pageCount: number | null;
  rawTextLength: number;
  createdAt: string;
}

const KIND_KEYS = new Set(["paste", "pdf", "docx", "image", "url", "github", "manual"]);
const STATUS_KEYS = new Set(["pending", "parsing", "extracted", "failed", "reviewed"]);

function rel(iso: string, t: (key: string) => string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const d = Math.max(0, Date.now() - then);
  const day = 86_400_000;
  if (d < 3_600_000) return t("fuentes.rel.now");
  if (d < day) return t("fuentes.rel.hours").replace("{n}", String(Math.round(d / 3_600_000)));
  if (d < 30 * day) {
    const n = Math.round(d / day);
    return t(n === 1 ? "fuentes.rel.day" : "fuentes.rel.days").replace("{n}", String(n));
  }
  const n = Math.round(d / (30 * day));
  return t(n === 1 ? "fuentes.rel.month" : "fuentes.rel.months").replace("{n}", String(n));
}

/** prefers-reduced-motion vía el runtime vanilla; acorta la ceremonia simulada. */
function reduced(): boolean {
  return typeof window !== "undefined" && !!window.CorpusMotion?.rm();
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Estado por fases de una acción de una tarjeta (subir → extraer → resultado). */
type Phase =
  | { state: "idle" }
  | { state: "working"; msg: string }
  | { state: "error"; msg: string }
  | { state: "done"; staged: number; sourceId: string | null; extra: string[] };

/** Estado de una acción por fila (releer / quitar). */
type RowState2 = { state: "idle" | "working" | "done" | "error"; msg?: string };

/** Respuesta de POST /api/sources · resync (lo que la UI consume). */
interface PostResult {
  sourceId?: string | null;
  staged?: number;
  warnings?: string[];
  github?: { handle: string; repos: string[]; languages: string[] };
  error?: string;
}

export function FuentesScreen() {
  // boot() dibuja el hr.c-divider del scope.
  const bootRef = useBoot<HTMLElement>();
  const t = useT();
  const kindLabel = (k: string) => (KIND_KEYS.has(k) ? t(`fuentes.kind.${k}`) : k);
  const statusLabel = (s: string) => (STATUS_KEYS.has(s) ? t(`fuentes.status.${s}`) : s);

  // Cliente de Supabase del navegador SOLO en modo Supabase (createClient exige
  // las NEXT_PUBLIC_*; en modo local no existen y lanzaría al construirse).
  const supabase = useMemo(() => (supabaseEnabled ? createClient() : null), []);

  // Estado del MODO LOCAL (demo interactiva).
  const [repos, setRepos] = useState<Repo[]>(INITIAL_REPOS);
  const [reposOpen, setReposOpen] = useState(false);
  const [ghState, setGhState] = useState<ReadState>("idle");
  const [webState, setWebState] = useState<ReadState>("idle");

  // Estado del MODO SUPABASE (fuentes reales).
  const [sources, setSources] = useState<SourceView[]>([]);
  const [loading, setLoading] = useState(supabaseEnabled);

  // Buffers y estado de las acciones in situ.
  const [openCard, setOpenCard] = useState<null | "paste" | "li-paste">(null);
  const [pasteText, setPasteText] = useState("");
  const [urlText, setUrlText] = useState("");
  const [ghText, setGhText] = useState("");
  const [liText, setLiText] = useState("");
  const [phases, setPhases] = useState<Record<string, Phase>>({});
  const [rowPhase, setRowPhase] = useState<Record<string, RowState2>>({});
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // PDF/DOCX e imágenes ya no tienen input propio: su selector lo lleva dentro
  // el <DropZone> compartido. LinkedIn conserva los suyos porque sus tres vías
  // siguen abriendo cada una su selector concreto.
  const liPdfInRef = useRef<HTMLInputElement>(null);
  const liImgInRef = useRef<HTMLInputElement>(null);

  const setPhase = (k: string, p: Phase) => setPhases((prev) => ({ ...prev, [k]: p }));
  const busy = (k: string) => phases[k]?.state === "working";
  const rowBusy = (id: string) => rowPhase[id]?.state === "working";

  const loadSources = useCallback(async () => {
    try {
      const res = await fetch("/api/sources");
      const data = await res.json();
      setSources((data.sources ?? []) as SourceView[]);
    } catch {
      /* conserva la lista actual */
    }
  }, []);

  useEffect(() => {
    if (!supabaseEnabled) return;
    let active = true;
    (async () => {
      await loadSources();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadSources]);

  // ── Acciones reales (modo Supabase) ─────────────────────────────────────────
  function extrasFrom(data: PostResult): string[] {
    const out: string[] = [];
    if (data.github?.repos?.length) out.push(`${t("fuentes.gh2.readLabel")} ${data.github.repos.join(", ")}`);
    if (Array.isArray(data.warnings)) out.push(...data.warnings);
    return out;
  }

  /** Sube archivos a Storage y los ingiere. Fases honestas: subiendo → extrayendo. */
  async function runFileUpload(cardKey: string, list: File[]) {
    if (!list.length || !supabase) return;
    setConfirmRemove(null);
    setPhase(cardKey, { state: "working", msg: t("fuentes.act.busy.uploading") });
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setPhase(cardKey, { state: "error", msg: t("fuentes.act.needSession") });
        return;
      }
      const refs: { path: string; name: string; kind: FileKind }[] = [];
      const skipped: string[] = [];
      for (const f of list) {
        const kind = fileKindFromName(f.name, f.type || undefined);
        if (!kind) {
          skipped.push(f.name);
          continue;
        }
        const path = `${user.id}/${crypto.randomUUID()}/${safeStorageName(f.name)}`;
        const { error } = await supabase.storage.from("sources").upload(path, f, {
          contentType: f.type || undefined,
          upsert: false,
        });
        if (error) throw new Error(error.message);
        refs.push({ path, name: f.name, kind });
      }
      if (!refs.length) {
        setPhase(cardKey, { state: "error", msg: t("fuentes.act.unsupported") });
        return;
      }
      setPhase(cardKey, { state: "working", msg: t("fuentes.act.busy.extracting") });
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: refs[0]!.kind, files: refs }),
      });
      const data = (await res.json()) as PostResult;
      if (!res.ok) throw new Error(data.error || t("fuentes.act.failed"));
      const extra = extrasFrom(data);
      if (skipped.length) extra.push(t("fuentes.act.skipped").replace("{f}", skipped.join(", ")));
      setPhase(cardKey, { state: "done", staged: data.staged ?? 0, sourceId: data.sourceId ?? null, extra });
      await loadSources();
    } catch (e) {
      setPhase(cardKey, { state: "error", msg: e instanceof Error ? e.message : t("fuentes.act.failed") });
    }
  }

  /** Envía texto / URL / handle al endpoint y refresca la lista. */
  async function runTextPost(cardKey: string, payload: Record<string, unknown>, clear?: () => void) {
    setConfirmRemove(null);
    setPhase(cardKey, { state: "working", msg: t("fuentes.act.busy.extracting") });
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as PostResult;
      if (!res.ok) throw new Error(data.error || t("fuentes.act.failed"));
      setPhase(cardKey, { state: "done", staged: data.staged ?? 0, sourceId: data.sourceId ?? null, extra: extrasFrom(data) });
      clear?.();
      await loadSources();
    } catch (e) {
      setPhase(cardKey, { state: "error", msg: e instanceof Error ? e.message : t("fuentes.act.failed") });
    }
  }

  async function resyncSource(id: string) {
    setRowPhase((p) => ({ ...p, [id]: { state: "working", msg: t("fuentes.item.resyncBusy") } }));
    try {
      const res = await fetch(`/api/sources/${id}/resync`, { method: "POST" });
      const data = (await res.json()) as PostResult;
      if (!res.ok) throw new Error(data.error || t("fuentes.act.failed"));
      const warn = data.warnings?.length ? ` · ${data.warnings.join(" ")}` : "";
      setRowPhase((p) => ({
        ...p,
        [id]: { state: "done", msg: t("fuentes.item.resynced").replace("{n}", String(data.staged ?? 0)) + warn },
      }));
      await loadSources();
    } catch (e) {
      setRowPhase((p) => ({ ...p, [id]: { state: "error", msg: e instanceof Error ? e.message : t("fuentes.act.failed") } }));
    }
  }

  async function removeSource(id: string) {
    setRowPhase((p) => ({ ...p, [id]: { state: "working", msg: t("fuentes.item.removeBusy") } }));
    try {
      const res = await fetch(`/api/sources/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as PostResult;
      if (!res.ok) throw new Error(data.error || t("fuentes.act.failed"));
      setConfirmRemove(null);
      setRowPhase((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
      await loadSources();
    } catch (e) {
      setRowPhase((p) => ({ ...p, [id]: { state: "error", msg: e instanceof Error ? e.message : t("fuentes.act.failed") } }));
    }
  }

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

  const header = (
    <header className="c-header">
      <div className="c-container">
        <Link className="c-logo" href="/app">
          Corpus
        </Link>
        <nav className="hd-nav">
          <Link href="/app">{t("nav.panel")}</Link>
          <Link href="/app/master">{t("nav.master")}</Link>
          <Link href="/app/variantes">{t("nav.variantes")}</Link>
          <Link href="/app/fuentes" aria-current="page">
            {t("nav.fuentes")}
          </Link>
        </nav>
        <div className="hd-right">
          <nav className="hd-nav" style={{ display: "flex" }}>
            <Link href="/app/ajustes">{t("nav.ajustes")}</Link>
          </nav>
          <div className="hd-lang">
            <span data-on>ES</span>
            <span>EN</span>
          </div>
          <div className="hd-av">DG</div>
        </div>
      </div>
    </header>
  );

  // Línea de estado por fases (compartida por todas las tarjetas de acción).
  function phaseLine(pk: string) {
    const p = phases[pk];
    if (!p || p.state === "idle") return null;
    if (p.state === "working") {
      return (
        <div className="fu-status" role="status" aria-live="polite">
          <span className="c-spin" aria-hidden="true">
            ⟳
          </span>{" "}
          {p.msg}
        </div>
      );
    }
    if (p.state === "error") {
      return (
        <div className="fu-status is-err" role="alert">
          <span aria-hidden="true">✕</span> {p.msg}
        </div>
      );
    }
    return (
      <div className="fu-status is-ok" role="status" aria-live="polite">
        <span aria-hidden="true">✓</span> {t("fuentes.act.done").replace("{n}", String(p.staged))}
        {p.sourceId ? (
          <span className="go">
            <Link className="c-btn c-btn--quiet" href={hrefStagingDe(p.sourceId)}>
              {t("fuentes.act.reviewStaging")}
            </Link>
          </span>
        ) : null}
        {p.extra.length ? (
          <div className="fu-extra">
            {p.extra.map((x, i) => (
              <div key={i}>{x}</div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  // La tarjeta educativa de LinkedIn del MODO LOCAL (genérica, sin datos, con las
  // vías como enlaces al volcado — el modo Supabase usa la versión ejecutable).
  const linkedInCardLocal = (
    <article className="c-panel fu-card fu-li" data-screen-label="fuentes-linkedin">
      <div className="fu-h">
        <span className="nm">linkedin</span>
        <span className="tag">{t("fuentes.li.tag")}</span>
      </div>
      <p>{t("fuentes.li.body")}</p>
      <div className="vias">
        <Link href={HREF_IMPORTAR}>
          <b>{t("fuentes.li.via1Bold")}</b>
          {t("fuentes.li.via1")}
        </Link>
        <Link href={HREF_IMPORTAR}>
          <b>{t("fuentes.li.via2Bold")}</b>
          {t("fuentes.li.via2")}
        </Link>
        <Link href={HREF_IMPORTAR}>
          <b>{t("fuentes.li.via3Bold")}</b>
          {t("fuentes.li.via3")}
        </Link>
      </div>
    </article>
  );

  // ═══════════════════════ MODO SUPABASE (datos reales) ═══════════════════════
  if (supabaseEnabled) {
    const sourcesEmpty = !loading && sources.length === 0;

    // Tarjetas de acción (añadir una fuente). Cada una ES la acción, in situ.
    const addCards = (
      <>
        <div className="fu-sub c-scrim c-scrim--soft">
          <span className="t-overline">{t("fuentes.add.heading")}</span>
        </div>

        {/* PDF / DOCX — el gesto de arrastre del volcado, mismo componente */}
        <article className="c-panel fu-card" data-screen-label="fuentes-add-archivos">
          <div className="fu-h">
            <span className="nm">{t("fuentes.card.files.name")}</span>
            <span className="tag">{t("fuentes.card.files.tag")}</span>
          </div>
          <div className="fu-body">{t("fuentes.card.files.body")}</div>
          <DropZone
            className="fu-drop"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={busy("filesCard")}
            onFiles={(fs) => void runFileUpload("filesCard", fs)}
            label={
              <>
                <b>{t("fuentes.drop.files.bold")}</b>
                {t("fuentes.drop.files.rest")}
              </>
            }
          />
          {phaseLine("filesCard")}
        </article>

        {/* Capturas / imágenes */}
        <article className="c-panel fu-card" data-screen-label="fuentes-add-imagenes">
          <div className="fu-h">
            <span className="nm">{t("fuentes.card.images.name")}</span>
            <span className="tag">{t("fuentes.card.images.tag")}</span>
          </div>
          <div className="fu-body">{t("fuentes.card.images.body")}</div>
          <DropZone
            className="fu-drop"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            multiple
            disabled={busy("imagesCard")}
            onFiles={(fs) => void runFileUpload("imagesCard", fs)}
            label={
              <>
                <b>{t("fuentes.drop.images.bold")}</b>
                {t("fuentes.drop.images.rest")}
              </>
            }
          />
          {phaseLine("imagesCard")}
        </article>

        {/* Texto pegado */}
        <article className="c-panel fu-card" data-screen-label="fuentes-add-texto">
          <div className="fu-h">
            <span className="nm">{t("fuentes.card.paste.name")}</span>
            <span className="tag">{t("fuentes.card.paste.tag")}</span>
            <span className="acts">
              <button
                type="button"
                className="c-btn c-btn--quiet"
                aria-expanded={openCard === "paste"}
                onClick={() => setOpenCard(openCard === "paste" ? null : "paste")}
              >
                {t("fuentes.card.paste.open")}
              </button>
            </span>
          </div>
          <div className="fu-body">{t("fuentes.card.paste.body")}</div>
          {openCard === "paste" ? (
            <div className="fu-inline">
              <textarea
                className="c-input fu-ta"
                placeholder={t("fuentes.card.paste.placeholder")}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="fu-inline-acts">
                <button
                  type="button"
                  className="c-btn"
                  disabled={busy("pasteCard") || pasteText.trim().length < 20}
                  onClick={() => runTextPost("pasteCard", { kind: "paste", text: pasteText }, () => setPasteText(""))}
                >
                  {t("fuentes.card.paste.submit")}
                </button>
                <button type="button" className="c-btn c-btn--quiet" onClick={() => setOpenCard(null)}>
                  {t("fuentes.card.paste.cancel")}
                </button>
              </div>
            </div>
          ) : null}
          {phaseLine("pasteCard")}
        </article>

        {/* Enlace (URL) */}
        <article className="c-panel fu-card" data-screen-label="fuentes-add-url">
          <div className="fu-h">
            <span className="nm">{t("fuentes.card.url.name")}</span>
            <span className="tag">{t("fuentes.card.url.tag")}</span>
          </div>
          <div className="fu-body">{t("fuentes.card.url.body")}</div>
          <div className="fu-form">
            <input
              className="c-input"
              type="url"
              inputMode="url"
              placeholder={t("fuentes.card.url.placeholder")}
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && urlText.trim() && !busy("urlCard"))
                  runTextPost("urlCard", { kind: "url", url: urlText }, () => setUrlText(""));
              }}
            />
            <button
              type="button"
              className="c-btn"
              disabled={busy("urlCard") || !urlText.trim()}
              onClick={() => runTextPost("urlCard", { kind: "url", url: urlText }, () => setUrlText(""))}
            >
              {t("fuentes.card.url.submit")}
            </button>
          </div>
          {phaseLine("urlCard")}
        </article>

        {/* GitHub — dato duro, sin IA (API pública, sin OAuth) */}
        <article className="c-panel fu-card" data-screen-label="fuentes-github">
          <div className="fu-h">
            <span className="nm">GitHub</span>
            <span className="tag star">{t("fuentes.tag.noAiApi")}</span>
          </div>
          <div className="fu-body">{t("fuentes.gh2.body")}</div>
          <div className="fu-form">
            <span className="fu-at">github.com/</span>
            <input
              className="c-input"
              placeholder={t("fuentes.gh2.placeholder")}
              value={ghText}
              onChange={(e) => setGhText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ghText.trim() && !busy("ghCard"))
                  runTextPost("ghCard", { kind: "github", handle: ghText }, () => setGhText(""));
              }}
            />
            <button
              type="button"
              className="c-btn"
              disabled={busy("ghCard") || !ghText.trim()}
              onClick={() => runTextPost("ghCard", { kind: "github", handle: ghText }, () => setGhText(""))}
            >
              {t("fuentes.gh2.submit")}
            </button>
          </div>
          {phaseLine("ghCard")}
          <div className="fu-note">{t("fuentes.gh.note")}</div>
        </article>

        {/* LinkedIn — las TRES vías se ejecutan aquí (nada de mandar al volcado) */}
        <article className="c-panel fu-card fu-li" data-screen-label="fuentes-linkedin">
          <div className="fu-h">
            <span className="nm">linkedin</span>
            <span className="tag">{t("fuentes.li.tag")}</span>
          </div>
          <p>{t("fuentes.li.body")}</p>
          <div className="vias">
            <button
              type="button"
              className="fu-via"
              aria-expanded={openCard === "li-paste"}
              onClick={() => setOpenCard(openCard === "li-paste" ? null : "li-paste")}
            >
              <b>{t("fuentes.li.via1Bold")}</b>
              {t("fuentes.li.via1")}
            </button>
            <button type="button" className="fu-via" disabled={busy("liCard")} onClick={() => liPdfInRef.current?.click()}>
              <b>{t("fuentes.li.via2Bold")}</b>
              {t("fuentes.li.via2")}
            </button>
            <button type="button" className="fu-via" disabled={busy("liCard")} onClick={() => liImgInRef.current?.click()}>
              <b>{t("fuentes.li.via3Bold")}</b>
              {t("fuentes.li.via3")}
            </button>
          </div>
          {openCard === "li-paste" ? (
            <div className="fu-inline">
              <textarea
                className="c-input fu-ta"
                placeholder={t("fuentes.li2.pastePlaceholder")}
                value={liText}
                onChange={(e) => setLiText(e.target.value)}
              />
              <div className="fu-inline-acts">
                <button
                  type="button"
                  className="c-btn"
                  disabled={busy("liCard") || liText.trim().length < 20}
                  onClick={() =>
                    runTextPost("liCard", { kind: "paste", text: liText, name: t("fuentes.li2.pasteName") }, () => {
                      setLiText("");
                      setOpenCard(null);
                    })
                  }
                >
                  {t("fuentes.li2.pasteSubmit")}
                </button>
                <button type="button" className="c-btn c-btn--quiet" onClick={() => setOpenCard(null)}>
                  {t("fuentes.card.paste.cancel")}
                </button>
              </div>
            </div>
          ) : null}
          {/* Vías 2 y 3 (PDF oficial · capturas) también por arrastre: mismo gesto
              que el volcado. Los botones de arriba siguen abriendo su selector
              concreto; esto añade el atajo, no lo sustituye. */}
          <DropZone
            className="fu-drop"
            accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            multiple
            disabled={busy("liCard")}
            onFiles={(fs) => void runFileUpload("liCard", fs)}
            label={
              <>
                <b>{t("fuentes.drop.li.bold")}</b>
                {t("fuentes.drop.li.rest")}
              </>
            }
          />
          {phaseLine("liCard")}
          <input
            ref={liPdfInRef}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(e) => {
              if (e.target.files) void runFileUpload("liCard", Array.from(e.target.files));
              e.target.value = "";
            }}
          />
          <input
            ref={liImgInRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void runFileUpload("liCard", Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </article>
      </>
    );

    return (
      <div className="c-page">
        <Aurora state="calm" />
        {header}
        <main className="fu-main c-window" data-screen-label="fuentes" ref={bootRef}>
          <div className="c-container">
            <div className="fu-lead c-scrim c-scrim--soft">
              <p>
                {t("fuentes.lead.prefix")}
                <b style={{ color: "var(--text)", fontWeight: 500 }}>{t("fuentes.lead.bold")}</b>
                {t("fuentes.lead.suffixReal")}
              </p>
              <Link className="c-btn" href={HREF_IMPORTAR}>
                {t("fuentes.dumpMore")}
              </Link>
            </div>
            <hr className="c-divider" />

            {loading ? (
              <p className="t-overline" style={{ color: "var(--text-muted)" }}>
                {t("fuentes.loading")}
              </p>
            ) : null}

            {sourcesEmpty ? (
              <div
                className="c-scrim c-scrim--soft"
                style={{ textAlign: "center", padding: "48px 0 40px" }}
                data-screen-label="fuentes-vacio"
              >
                <span className="t-overline">{t("fuentes.empty.overline")}</span>
                <h2 style={{ marginTop: "14px" }}>{t("fuentes.empty.title")}</h2>
                <p style={{ color: "var(--text-muted)", maxWidth: "52ch", margin: "10px auto 0" }}>{t("fuentes.empty.body")}</p>
                <div style={{ marginTop: "24px" }}>
                  <button type="button" className="c-btn c-btn--patina" onClick={() => setOpenCard("paste")}>
                    {t("fuentes.empty.cta")}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Fuentes ya ingeridas: cada fila con acciones «releer» y «quitar». */}
            {!loading &&
              sources.map((s) => {
                const name = s.originalName || s.sourceUrl || kindLabel(s.kind);
                const canResync = s.kind !== "paste" && s.kind !== "manual";
                const rp = rowPhase[s.id];
                return (
                  <article className="c-panel fu-card" key={s.id} data-screen-label="fuentes-item">
                    <div className="fu-h">
                      <span className="nm">{name}</span>
                      <span className="tag">{kindLabel(s.kind)}</span>
                      <span className="acts">
                        {canResync ? (
                          <button
                            type="button"
                            className="c-btn c-btn--quiet"
                            disabled={rowBusy(s.id)}
                            onClick={() => resyncSource(s.id)}
                          >
                            {rowBusy(s.id) && rp?.msg === t("fuentes.item.resyncBusy") ? t("fuentes.item.resyncBusy") : t("fuentes.item.resync")}
                          </button>
                        ) : (
                          <button type="button" className="c-btn c-btn--quiet" disabled title={t("fuentes.item.resyncPasteDisabled")}>
                            {t("fuentes.item.resync")}
                          </button>
                        )}
                        <button type="button" className="c-btn c-btn--quiet" disabled={rowBusy(s.id)} onClick={() => setConfirmRemove(s.id)}>
                          {t("fuentes.item.remove")}
                        </button>
                        <Link className="c-btn c-btn--quiet" href={hrefStagingDe(s.id)}>
                          {t("fuentes.item.viewStaging")}
                        </Link>
                      </span>
                    </div>
                    <div className="fu-facts" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                      <div>
                        <div className="v" style={{ fontSize: "13px" }}>
                          {statusLabel(s.status)}
                        </div>
                        <div className="k">{t("fuentes.item.readStatus")}</div>
                      </div>
                      <div>
                        <div className="v" style={{ fontSize: "13px" }}>
                          {s.rawTextLength.toLocaleString("es-CL")}
                        </div>
                        <div className="k">
                          {t("fuentes.item.charsRead")}
                          {s.pageCount ? t("fuentes.item.pages").replace("{n}", String(s.pageCount)) : ""}
                        </div>
                      </div>
                      <div>
                        <div className="v" style={{ fontSize: "13px" }}>
                          {rel(s.createdAt, t)}
                        </div>
                        <div className="k">{t("fuentes.item.added")}</div>
                      </div>
                    </div>

                    {confirmRemove === s.id ? (
                      <div className="fu-confirm" role="alertdialog" aria-label={t("fuentes.item.remove")}>
                        <span>{t("fuentes.item.removeConfirm")}</span>
                        <div className="fu-confirm-acts">
                          <button type="button" className="c-btn" disabled={rowBusy(s.id)} onClick={() => removeSource(s.id)}>
                            {rowBusy(s.id) ? t("fuentes.item.removeBusy") : t("fuentes.item.removeYes")}
                          </button>
                          <button type="button" className="c-btn c-btn--quiet" onClick={() => setConfirmRemove(null)}>
                            {t("fuentes.item.removeNo")}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {rp && rp.state !== "working" && rp.msg ? (
                      <div className={`fu-status ${rp.state === "error" ? "is-err" : "is-ok"}`} role="status" aria-live="polite">
                        {rp.state === "error" ? <span aria-hidden="true">✕</span> : <span aria-hidden="true">✓</span>} {rp.msg}
                      </div>
                    ) : null}
                  </article>
                );
              })}

            {addCards}
          </div>
        </main>
      </div>
    );
  }

  // ═══════════════════════ MODO LOCAL (maqueta interactiva) ═══════════════════
  return (
    <div className="c-page">
      <Aurora state="calm" />
      {header}

      <main className="fu-main c-window" data-screen-label="fuentes" ref={bootRef}>
        <div className="c-container">
          <div className="fu-lead c-scrim c-scrim--soft">
            <p>
              {t("fuentes.lead.prefix")}
              <b style={{ color: "var(--text)", fontWeight: 500 }}>{t("fuentes.lead.bold")}</b>
              {t("fuentes.lead.suffixLocal")}
            </p>
            <Link className="c-btn" href={HREF_IMPORTAR}>
              {t("fuentes.dumpMore")}
            </Link>
          </div>
          <hr className="c-divider" />

          {/* GitHub: la fuente estrella */}
          <article className="c-panel fu-card" data-screen-label="fuentes-github">
            <div className="fu-h">
              <span className="nm">github.com/dgatica</span>
              <span className="tag star">{t("fuentes.tag.noAiApi")}</span>
              <span className="acts">
                <button
                  type="button"
                  className="c-btn c-btn--quiet"
                  id="btnRepos"
                  aria-expanded={reposOpen}
                  aria-controls="repos"
                  onClick={() => setReposOpen((v) => !v)}
                >
                  {t("fuentes.gh.chooseRepos").replace("{sel}", String(selected)).replace("{tot}", String(total))}
                </button>
                <button type="button" className="c-btn" id="btnRead" aria-busy={ghState === "reading"} aria-disabled={ghState === "reading"} onClick={readGithub}>
                  {ghState === "reading" ? (
                    <>
                      <span className="c-spin" aria-hidden="true">
                        ⟳
                      </span>
                      {t("fuentes.gh.readingApi")}
                    </>
                  ) : ghState === "read" ? (
                    t("fuentes.gh.readNew")
                  ) : (
                    <>
                      <span className="c-pulse-dot" />
                      {" "}
                      {t("fuentes.gh.readNew")}
                    </>
                  )}
                </button>
              </span>
            </div>
            <div className="fu-facts" id="ghFacts">
              <div>
                <div className="v">{total}</div>
                <div className="k">{t("fuentes.gh.factReposK")}</div>
              </div>
              <div>
                <div className="v">412.803</div>
                <div className="k">{t("fuentes.gh.factBytesK")}</div>
              </div>
              <div>
                <div className="v">14</div>
                <div className="k">{t("fuentes.gh.factItemsK")}</div>
              </div>
              <div>
                <div className="v">hace 3 días</div>
                <div className="k">{t("fuentes.gh.factPushK")}</div>
              </div>
            </div>
            <div className="fu-new" id="ghNew" role="status" aria-live="polite">
              {ghState === "reading" ? (
                <>
                  <span className="c-spin" aria-hidden="true">
                    ⟳
                  </span>{" "}
                  {t("fuentes.gh.readingActivity")}
                </>
              ) : ghState === "read" ? (
                <>
                  <span aria-hidden="true">✓</span> {t("fuentes.gh.readDonePre")} <b>{t("fuentes.gh.readDoneBold")}</b>
                  {t("fuentes.gh.readDoneSuf")}{" "}
                  <span className="go">
                    <Link className="c-btn c-btn--quiet" href={HREF_STAGING}>
                      {t("fuentes.gh.review")}
                    </Link>
                  </span>
                </>
              ) : (
                <>
                  <b>{t("fuentes.gh.newBold")}</b>
                  {t("fuentes.gh.newMid")}idempotency-go, scraper-sii{" "}
                  <span className="go">
                    <button type="button" className="c-btn c-btn--quiet" onClick={readGithub}>
                      {t("fuentes.gh.readThem")}
                    </button>
                  </span>
                </>
              )}
            </div>
            <div className={`fu-repos${reposOpen ? " open" : ""}`} id="repos">
              <div className="fu-rh">
                <b>{t("fuentes.repo.selected").replace("{sel}", String(selected)).replace("{tot}", String(total))}</b>
                {t("fuentes.repo.mid")}<b>{t("fuentes.repo.boldRule")}</b>{t("fuentes.repo.end")}
              </div>
              <div id="repoRows">
                {repos.map((r, i) => (
                  <label className={`fu-repo${r.on ? "" : " off"}`} key={r.n}>
                    <input type="checkbox" checked={r.on} data-r={i} onChange={(e) => toggleRepo(i, e.target.checked)} />
                    <span className="nm">{r.n}</span>
                    <span className="meta">{r.m}</span>
                    {r.why ? <span className="why">{t("fuentes.repo.leftOut")}{r.why}</span> : null}
                  </label>
                ))}
              </div>
            </div>
            <div className="fu-note">{t("fuentes.gh.note")}</div>
          </article>

          {/* Portfolio */}
          <article className="c-panel fu-card" data-screen-label="fuentes-portfolio">
            <div className="fu-h">
              <span className="nm">dgatica.cl</span>
              <span className="tag">{t("fuentes.tag.portfolio")}</span>
              <span className="acts">
                <button type="button" className="c-btn c-btn--quiet" id="btnWeb" aria-busy={webState === "reading"} aria-disabled={webState === "reading"} onClick={reReadWeb}>
                  {webState === "reading" ? (
                    <>
                      <span className="c-spin" aria-hidden="true">
                        ⟳
                      </span>
                      {t("fuentes.web.reading")}
                    </>
                  ) : (
                    t("fuentes.web.reread")
                  )}
                </button>
              </span>
            </div>
            <div className="fu-facts">
              <div>
                <div className="v">6</div>
                <div className="k">{t("fuentes.web.factProjectsK")}</div>
              </div>
              <div>
                <div className="v">12</div>
                <div className="k">{t("fuentes.web.factItemsK")}</div>
              </div>
              <div>
                <div className="v">hace 12 días</div>
                <div className="k">{t("fuentes.web.factLastReadK")}</div>
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
                    ? t("fuentes.web.cmpComparing")
                    : webState === "read"
                      ? t("fuentes.web.cmpNoChangeRead")
                      : t("fuentes.web.cmpNoChange")}
                </div>
              </div>
            </div>
          </article>

          {/* Archivos */}
          <article className="c-panel fu-card" data-screen-label="fuentes-archivos">
            <div className="fu-h">
              <span className="nm">{t("fuentes.files.name")}</span>
              <span className="tag">{t("fuentes.files.tag")}</span>
              <span className="acts">
                <Link className="c-btn c-btn--quiet" href={HREF_IMPORTAR}>
                  {t("fuentes.files.upload")}
                </Link>
              </span>
            </div>
            <div className="fu-facts" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <div className="v" style={{ fontSize: "13px" }}>
                  CV_2023.pdf
                </div>
                <div className="k">{t("fuentes.files.doc1K")}</div>
              </div>
              <div>
                <div className="v" style={{ fontSize: "13px" }}>
                  cuestionario-identidad.md
                </div>
                <div className="k">{t("fuentes.files.doc2K")}</div>
              </div>
            </div>
          </article>

          {linkedInCardLocal}

          <div className="fu-add">
            <input className="c-input" placeholder={t("fuentes.add.placeholder")} />
            <button type="button" className="c-btn">
              {t("fuentes.add.button")}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
