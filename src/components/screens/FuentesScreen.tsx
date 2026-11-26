"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AuroraTune, AURORA_HOJEO } from "@/components/Aurora";
import { DropZone } from "@/components/DropZone";
import { useBoot } from "@/lib/corpus/runtime";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { withOrigin } from "@/components/Breadcrumb";
import { fileKindFromName, safeStorageName, type FileKind } from "@/lib/db/sources";
import { Button, Card, Chip, EmptyState, PanelHeader } from "@/components/ui";
import { CabezaPantalla } from "@/components/cuenta/CabezaPantalla";
import { Estado, type EstadoValor } from "@/components/cuenta/Estado";
import "./fuentes.css";

/* ============================================================================
   Fuentes — porte de corpus-design/04-pantallas/fuentes.html
   (ver docs/spec/pantallas/fuentes.md).

   ★ Aquí no se LEE trabajo denso: se DECIDE qué material entra y por qué vía —
   arrastrar un PDF, pegar texto, conectar GitHub. Es una sala de puertas, y las
   puertas respiran: el humo va entero (0.55 · AURORA_HOJEO), el <main> es
   .c-window y cada tarjeta es .c-panel (vidrio ahumado) para que el humo se
   intuya detrás sin comerse una letra. El texto suelto que no vive dentro de una
   tarjeta lleva su velo (.c-scrim--soft).
   La aurora NO se monta aquí: la monta el shell (app/app/layout) para las diez
   pantallas; esta solo declara su intensidad. Ver src/components/Aurora.tsx.
   El único movimiento de montaje sigue siendo el hr.c-divider de CorpusMotion.boot().

   ★ CABLEADO A DATOS REALES (agente B). En modo Supabase cada tarjeta ES la acción
   IN SITU (sin salir de Fuentes): PDF/DOCX, imágenes, texto, URL y GitHub suben /
   pegan / consultan y stagean; LinkedIn ejecuta sus tres vías dentro de su tarjeta;
   cada fuente ya ingerida ofrece «releer» y «quitar». La maqueta completa (persona
   Diego Gatica) SOLO se usa como fallback del modo local.

   ★ FORJA v2 (rediseño de cuenta). Mismo cableado, otra piel: la página es
   .cu-pagina, cada fuente y cada puerta es una <Card> grafito, el estado de la
   lectura es un <Estado> (punto + etiqueta) y el informe son baldosas. El
   <header class="c-header"> duplicado del shell se quitó (solo traía logo/nav).
   En modo local, toda cifra de la maqueta va rotulada «ejemplo».
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
  createdAt: string;
  // ── Informe por fuente (bloque D). El servidor rellena estos; null ⟺ sin dato. ──
  error: string | null;
  isTranscription: boolean;
  charsRead: number | null;
  aiCalls: number | null;
  tokens: number | null;
  tokensAreFloor: boolean;
  fromCache: boolean;
  contextSections: { titulo: string; caracteres: number }[];
  itemsExtracted: number;
  pending: number;
  possibleDuplicates: number;
  withoutEvidence: number;
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

/* ── Un chip del informe: valor grande + etiqueta pequeña. `warn` tiñe el valor
   cuando la cifra pide atención (un duplicado o una falta de evidencia por
   revisar). En Forja v2 cada chip es una baldosa de la rejilla del informe, que
   fluye sola: añadir un dato NO obliga a tocar ningún gridTemplateColumns. */
function ReportChip({ v, k, warn, tag }: { v: string; k: string; warn?: boolean; tag?: string }) {
  return (
    <div className={`fu-rchip${warn ? " fu-rchip--warn" : ""}`}>
      <div className="v">{v}</div>
      <div className="k">{k}</div>
      {tag ? <span className="fu-rtag">{tag}</span> : null}
    </div>
  );
}

/* ── Estado de la lectura → <Estado> (punto + etiqueta). ★ Una fuente «extraída»
   con 0 ítems NO sale en línea: sale «a medias» (punto hueco), y el motivo lo
   pinta <SourceReport> justo debajo. Un estado desconocido tampoco se da por bueno. */
function estadoDe(s: SourceView): EstadoValor {
  if (s.status === "failed") return "fail";
  if (s.status !== "extracted" && s.status !== "reviewed") return "warn";
  return s.itemsExtracted === 0 ? "warn" : "ok";
}

/* ── EL INFORME POR FUENTE (bloque D · §1·§2) ─────────────────────────────────
   Todos los números salen del servidor (queries.listSources). La regla manda: un
   dato que no se tiene NO se pinta —charsRead/aiCalls/tokens son null cuando no
   hay telemetría (p. ej. GitHub no llama al modelo), y entonces su chip no
   aparece— en vez de enseñar un cero inventado. Los recuentos del staging
   (ítems / duplicados / sin evidencia) SÍ se conocen siempre, así que sus ceros
   se muestran: «0 sin evidencia» tranquiliza, no es ruido.
   El estado de la lectura ya no es un chip: va en la cabecera como <Estado>. */
function SourceReport({ s, t }: { s: SourceView; t: (key: string) => string }) {
  const nf = (n: number) => n.toLocaleString("es-CL");

  // «104 KB» a partir de 1 KB; por debajo, los caracteres exactos (no se redondea
  // a 0 KB una fuente pequeña). El sufijo de páginas viaja con este mismo chip.
  let readValue: string | null = null;
  if (s.charsRead != null) {
    readValue =
      s.charsRead >= 1024
        ? t("fuentes.report.kb").replace("{n}", nf(Math.round(s.charsRead / 1024)))
        : t("fuentes.report.chars").replace("{n}", nf(s.charsRead));
    if (s.pageCount) readValue += t("fuentes.item.pages").replace("{n}", String(s.pageCount));
  }

  const ctx = s.contextSections.filter((c) => c.titulo.trim());

  return (
    <>
      <div className="fu-report">
        {readValue != null ? (
          <ReportChip
            v={readValue}
            k={t("fuentes.report.readK")}
            tag={s.isTranscription ? t("fuentes.report.transcribed") : undefined}
          />
        ) : null}
        {s.aiCalls != null ? <ReportChip v={nf(s.aiCalls)} k={t("fuentes.report.callsK")} /> : null}
        {s.tokens != null ? (
          <ReportChip v={`${s.tokensAreFloor ? "≥ " : ""}${nf(s.tokens)}`} k={t("fuentes.report.tokensK")} />
        ) : null}
        {/* ★ El CERO se tiñe. «0 ítems extraídos» junto a un estado «extraída» era
            la tarjeta diciendo que todo fue bien: aquí deja de pasar por normal. */}
        <ReportChip v={nf(s.itemsExtracted)} k={t("fuentes.report.itemsK")} warn={s.itemsExtracted === 0} />
        <ReportChip v={nf(s.possibleDuplicates)} k={t("fuentes.report.duplicatesK")} warn={s.possibleDuplicates > 0} />
        <ReportChip v={nf(s.withoutEvidence)} k={t("fuentes.report.noEvidenceK")} warn={s.withoutEvidence > 0} />
        <ReportChip v={rel(s.createdAt, t)} k={t("fuentes.item.added")} />
      </div>

      {s.fromCache ? <p className="fu-rnote">{t("fuentes.report.cache")}</p> : null}

      {/* «qué quedó fuera», PERSISTIDO: las secciones que se leyeron como contexto y
          no se mandaron a extraer, por su nombre. La regla capital hecha durable —
          antes esto era un aviso que se veía una vez y se perdía. */}
      {ctx.length ? (
        <p className="fu-rnote fu-rnote--ctx">
          {t(ctx.length === 1 ? "fuentes.report.contextOne" : "fuentes.report.contextMany")
            .replace("{n}", String(ctx.length))
            .replace("{list}", ctx.map((c) => `«${c.titulo}»`).join(", "))}
        </p>
      ) : null}

      {/* El motivo del fallo, que hasta hoy estaba escrito y no se enseñaba. Solo
          cuando la fuente falló de verdad (status 'failed' rellena `error`). */}
      {s.status === "failed" && s.error ? (
        <div className="fu-status is-err" role="alert">
          <span aria-hidden="true">✕</span> {t("fuentes.report.failed").replace("{msg}", s.error)}
        </div>
      ) : s.itemsExtracted === 0 ? (
        /* ★ UNA FUENTE VACÍA NUNCA SE PINTA DE VERDE. Vale para TODA fuente, no
           solo para las que fallaron: «extraída · 0 ítems» sin explicación era la
           pantalla afirmando que tu documento no valía nada. El motivo lo escribe
           el servidor al ingerir (db/sources · causaSinItems) y se enseña aquí. Si
           una fila antigua no lo tiene, se dice ESO — no se rellena con nada. */
        <div className="fu-status is-err" role="alert">
          <span aria-hidden="true">⚠</span>{" "}
          {s.error
            ? t("fuentes.report.empty").replace("{msg}", s.error)
            : t("fuentes.report.emptyUnknown")}
        </div>
      ) : null}
    </>
  );
}

export function FuentesScreen() {
  // boot() dibuja el hr.c-divider del scope.
  const bootRef = useBoot<HTMLElement>();
  const t = useT();
  const kindLabel = (k: string) => (KIND_KEYS.has(k) ? t(`fuentes.kind.${k}`) : k);
  // El estado de la lectura se rotula en la cabecera de cada tarjeta (<Estado>).
  const statusLabel = (st: string) => (STATUS_KEYS.has(st) ? t(`fuentes.status.${st}`) : st);

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
            <Button variante="fantasma" href={hrefStagingDe(p.sourceId)}>
              {t("fuentes.act.reviewStaging")}
            </Button>
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

  /** Rótulos de una tarjeta-puerta: el tipo arriba, en chip; el ejemplo, rotulado. */
  function etiquetas(tag: string, tono: "neutro" | "oro" = "neutro", ejemplo = false) {
    return (
      <div className="fu-tags">
        <Chip tono={tono}>{tag}</Chip>
        {ejemplo ? <Chip tono="ejemplo">{t("fuentes.ejemplo")}</Chip> : null}
      </div>
    );
  }

  // Cabecera de la pantalla (los dos modos). El nombre de la ruta ya lo pone la
  // barra superior del shell; aquí va la frase que dice qué se decide en Fuentes.
  const cabeza = (suffix: string) => (
    <CabezaPantalla
      titulo={t("fuentes.titulo")}
      sub={
        <>
          {t("fuentes.lead.prefix")}
          <b className="fu-lead-b">{t("fuentes.lead.bold")}</b>
          {suffix}
        </>
      }
      acciones={
        <Button variante="brasa" icono="mas" href={HREF_IMPORTAR}>
          {t("fuentes.dumpMore")}
        </Button>
      }
    />
  );

  // La tarjeta educativa de LinkedIn del MODO LOCAL (genérica, sin datos, con las
  // vías como enlaces al volcado — el modo Supabase usa la versión ejecutable).
  const linkedInCardLocal = (
    <Card as="article" className="fu-card fu-li fu-ancha" data-screen-label="fuentes-linkedin">
      {etiquetas(t("fuentes.li.tag"))}
      <PanelHeader titulo="LinkedIn" sub={t("fuentes.li.body")} />
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
    </Card>
  );

  // ═══════════════════════ MODO SUPABASE (datos reales) ═══════════════════════
  if (supabaseEnabled) {
    const sourcesEmpty = !loading && sources.length === 0;

    // Tarjetas de acción (añadir una fuente). Cada una ES la acción, in situ.
    const addCards = (
      <section className="fu-seccion" aria-labelledby="fu-add-t">
        <PanelHeader nivel={2} id="fu-add-t" titulo={t("fuentes.add.heading")} sub={t("fuentes.add.sub")} />
        <div className="cu-rejilla cu-rejilla--2 fu-rejilla">
          {/* PDF / DOCX — el gesto de arrastre del volcado, mismo componente.
              Es la zona de carga destacada de la pantalla (.cu-carga). */}
          <Card as="article" className="fu-card" data-screen-label="fuentes-add-archivos">
            {etiquetas(t("fuentes.card.files.tag"))}
            <PanelHeader titulo={t("fuentes.card.files.name")} sub={t("fuentes.card.files.body")} />
            <DropZone
              className="fu-drop cu-carga"
              // Un .md/.txt entra por aquí igual que un PDF (el arrastre ya lo
              // aceptaba porque ignora `accept`; el clic también debe ofrecerlo).
              accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
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
          </Card>

          {/* Capturas / imágenes */}
          <Card as="article" className="fu-card" data-screen-label="fuentes-add-imagenes">
            {etiquetas(t("fuentes.card.images.tag"))}
            <PanelHeader titulo={t("fuentes.card.images.name")} sub={t("fuentes.card.images.body")} />
            <DropZone
              className="fu-drop cu-carga"
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
          </Card>

          {/* Texto pegado */}
          <Card as="article" className="fu-card" data-screen-label="fuentes-add-texto">
            {etiquetas(t("fuentes.card.paste.tag"))}
            <PanelHeader titulo={t("fuentes.card.paste.name")} sub={t("fuentes.card.paste.body")} />
            <div className="fu-inline-acts">
              <Button
                variante="grafito"
                aria-expanded={openCard === "paste"}
                onClick={() => setOpenCard(openCard === "paste" ? null : "paste")}
              >
                {t("fuentes.card.paste.open")}
              </Button>
            </div>
            {openCard === "paste" ? (
              <div className="fu-inline">
                <textarea
                  className="c-input fu-ta"
                  aria-label={t("fuentes.card.paste.name")}
                  placeholder={t("fuentes.card.paste.placeholder")}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <div className="fu-inline-acts">
                  <Button
                    variante="grafito"
                    disabled={busy("pasteCard") || pasteText.trim().length < 20}
                    onClick={() => runTextPost("pasteCard", { kind: "paste", text: pasteText }, () => setPasteText(""))}
                  >
                    {t("fuentes.card.paste.submit")}
                  </Button>
                  <Button variante="fantasma" onClick={() => setOpenCard(null)}>
                    {t("fuentes.card.paste.cancel")}
                  </Button>
                </div>
              </div>
            ) : null}
            {phaseLine("pasteCard")}
          </Card>

          {/* Enlace (URL) */}
          <Card as="article" className="fu-card" data-screen-label="fuentes-add-url">
            {etiquetas(t("fuentes.card.url.tag"))}
            <PanelHeader titulo={t("fuentes.card.url.name")} sub={t("fuentes.card.url.body")} />
            <div className="fu-form">
              <input
                className="c-input"
                type="url"
                inputMode="url"
                aria-label={t("fuentes.card.url.name")}
                placeholder={t("fuentes.card.url.placeholder")}
                value={urlText}
                onChange={(e) => setUrlText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && urlText.trim() && !busy("urlCard"))
                    runTextPost("urlCard", { kind: "url", url: urlText }, () => setUrlText(""));
                }}
              />
              <Button
                variante="grafito"
                disabled={busy("urlCard") || !urlText.trim()}
                onClick={() => runTextPost("urlCard", { kind: "url", url: urlText }, () => setUrlText(""))}
              >
                {t("fuentes.card.url.submit")}
              </Button>
            </div>
            {phaseLine("urlCard")}
          </Card>

          {/* GitHub — dato duro, sin IA (API pública, sin OAuth) */}
          <Card as="article" className="fu-card" data-screen-label="fuentes-github">
            {etiquetas(t("fuentes.tag.noAiApi"), "oro")}
            <PanelHeader titulo="GitHub" sub={t("fuentes.gh2.body")} />
            <div className="fu-form">
              <span className="fu-at">github.com/</span>
              <input
                className="c-input"
                aria-label="GitHub"
                placeholder={t("fuentes.gh2.placeholder")}
                value={ghText}
                onChange={(e) => setGhText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && ghText.trim() && !busy("ghCard"))
                    runTextPost("ghCard", { kind: "github", handle: ghText }, () => setGhText(""));
                }}
              />
              <Button
                variante="grafito"
                disabled={busy("ghCard") || !ghText.trim()}
                onClick={() => runTextPost("ghCard", { kind: "github", handle: ghText }, () => setGhText(""))}
              >
                {t("fuentes.gh2.submit")}
              </Button>
            </div>
            {phaseLine("ghCard")}
            <p className="fu-note">{t("fuentes.gh.note")}</p>
          </Card>

          {/* LinkedIn — las TRES vías se ejecutan aquí (nada de mandar al volcado) */}
          <Card as="article" className="fu-card fu-li fu-ancha" data-screen-label="fuentes-linkedin">
            {etiquetas(t("fuentes.li.tag"))}
            <PanelHeader titulo="LinkedIn" sub={t("fuentes.li.body")} />
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
                  aria-label={t("fuentes.li.via1Bold")}
                  placeholder={t("fuentes.li2.pastePlaceholder")}
                  value={liText}
                  onChange={(e) => setLiText(e.target.value)}
                />
                <div className="fu-inline-acts">
                  <Button
                    variante="grafito"
                    disabled={busy("liCard") || liText.trim().length < 20}
                    onClick={() =>
                      runTextPost("liCard", { kind: "paste", text: liText, name: t("fuentes.li2.pasteName") }, () => {
                        setLiText("");
                        setOpenCard(null);
                      })
                    }
                  >
                    {t("fuentes.li2.pasteSubmit")}
                  </Button>
                  <Button variante="fantasma" onClick={() => setOpenCard(null)}>
                    {t("fuentes.card.paste.cancel")}
                  </Button>
                </div>
              </div>
            ) : null}
            {/* Vías 2 y 3 (PDF oficial · capturas) también por arrastre: mismo gesto
                que el volcado. Los botones de arriba siguen abriendo su selector
                concreto; esto añade el atajo, no lo sustituye. */}
            <DropZone
              className="fu-drop cu-carga"
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
          </Card>
        </div>
      </section>
    );

    return (
      <div className="c-page">
        <AuroraTune strength={AURORA_HOJEO} />
        <main className="cu-pagina fu-pagina c-window" data-screen-label="fuentes" ref={bootRef}>
          {cabeza(t("fuentes.lead.suffixReal"))}

          <section className="fu-seccion" aria-labelledby="fu-list-t">
            <PanelHeader nivel={2} id="fu-list-t" titulo={t("fuentes.list.heading")} />

            {loading ? (
              <p className="cu-nota" role="status">
                {t("fuentes.loading")}
              </p>
            ) : null}

            {sourcesEmpty ? (
              <Card className="fu-vacio" data-screen-label="fuentes-vacio">
                <EmptyState
                  icono="fuentes"
                  titulo={t("fuentes.empty.title")}
                  texto={t("fuentes.empty.body")}
                  accion={
                    <Button variante="grafito" onClick={() => setOpenCard("paste")}>
                      {t("fuentes.empty.cta")}
                    </Button>
                  }
                />
              </Card>
            ) : null}

            {/* Fuentes ya ingeridas: cada tarjeta con acciones «releer» y «quitar». */}
            {!loading && sources.length ? (
              <div className="cu-rejilla cu-rejilla--2 fu-rejilla">
                {sources.map((s) => {
                  const name = s.originalName || s.sourceUrl || kindLabel(s.kind);
                  const canResync = s.kind !== "paste" && s.kind !== "manual";
                  const rp = rowPhase[s.id];
                  return (
                    <Card as="article" className="fu-card fu-fuente" key={s.id} data-screen-label="fuentes-item">
                      <div className="fu-h">
                        <h3 className="nm">{name}</h3>
                        <div className="fu-tags">
                          <Chip>{kindLabel(s.kind)}</Chip>
                          <Estado valor={estadoDe(s)}>{statusLabel(s.status)}</Estado>
                        </div>
                      </div>
                      <SourceReport s={s} t={t} />

                      {confirmRemove === s.id ? (
                        <div className="fu-confirm cu-confirmar" role="alertdialog" aria-label={t("fuentes.item.remove")}>
                          <span>{t("fuentes.item.removeConfirm")}</span>
                          <div className="fu-confirm-acts">
                            <Button
                              className="cu-btn-peligro cu-btn-peligro--lleno"
                              disabled={rowBusy(s.id)}
                              onClick={() => removeSource(s.id)}
                            >
                              {rowBusy(s.id) ? t("fuentes.item.removeBusy") : t("fuentes.item.removeYes")}
                            </Button>
                            <Button variante="fantasma" onClick={() => setConfirmRemove(null)}>
                              {t("fuentes.item.removeNo")}
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {rp && rp.state !== "working" && rp.msg ? (
                        <div className={`fu-status ${rp.state === "error" ? "is-err" : "is-ok"}`} role="status" aria-live="polite">
                          {rp.state === "error" ? <span aria-hidden="true">✕</span> : <span aria-hidden="true">✓</span>} {rp.msg}
                        </div>
                      ) : null}

                      <div className="acts">
                        {canResync ? (
                          <Button variante="grafito" disabled={rowBusy(s.id)} onClick={() => resyncSource(s.id)}>
                            {rowBusy(s.id) && rp?.msg === t("fuentes.item.resyncBusy") ? t("fuentes.item.resyncBusy") : t("fuentes.item.resync")}
                          </Button>
                        ) : (
                          <Button variante="grafito" disabled title={t("fuentes.item.resyncPasteDisabled")}>
                            {t("fuentes.item.resync")}
                          </Button>
                        )}
                        <Button variante="fantasma" disabled={rowBusy(s.id)} onClick={() => setConfirmRemove(s.id)}>
                          {t("fuentes.item.remove")}
                        </Button>
                        <Button variante="fantasma" icono="flecha" href={hrefStagingDe(s.id)}>
                          {t("fuentes.item.viewStaging")}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : null}
          </section>

          {addCards}
        </main>
      </div>
    );
  }

  // ═══════════════════════ MODO LOCAL (maqueta interactiva) ═══════════════════
  // Todas las cifras de aquí son de la maqueta (persona Diego Gatica): cada
  // tarjeta que las enseña lleva el chip «ejemplo».
  return (
    <div className="c-page">
      <AuroraTune strength={AURORA_HOJEO} />

      <main className="cu-pagina fu-pagina c-window" data-screen-label="fuentes" ref={bootRef}>
        {cabeza(t("fuentes.lead.suffixLocal"))}

        <div className="cu-rejilla cu-rejilla--2 fu-rejilla">
          {/* GitHub: la fuente estrella */}
          <Card as="article" className="fu-card fu-ancha" data-screen-label="fuentes-github">
            {etiquetas(t("fuentes.tag.noAiApi"), "oro", true)}
            <PanelHeader
              className="fu-ph-acc"
              titulo={<span className="fu-dato">github.com/dgatica</span>}
              acciones={
                <>
                  <Button
                    variante="fantasma"
                    id="btnRepos"
                    aria-expanded={reposOpen}
                    aria-controls="repos"
                    onClick={() => setReposOpen((v) => !v)}
                  >
                    {t("fuentes.gh.chooseRepos").replace("{sel}", String(selected)).replace("{tot}", String(total))}
                  </Button>
                  <Button variante="grafito" id="btnRead" aria-busy={ghState === "reading"} aria-disabled={ghState === "reading"} onClick={readGithub}>
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
                  </Button>
                </>
              }
            />
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
                    <Button variante="fantasma" href={HREF_STAGING}>
                      {t("fuentes.gh.review")}
                    </Button>
                  </span>
                </>
              ) : (
                <>
                  <b>{t("fuentes.gh.newBold")}</b>
                  {t("fuentes.gh.newMid")}idempotency-go, scraper-sii{" "}
                  <span className="go">
                    <Button variante="fantasma" onClick={readGithub}>
                      {t("fuentes.gh.readThem")}
                    </Button>
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
            <p className="fu-note">{t("fuentes.gh.note")}</p>
          </Card>

          {/* Portfolio */}
          <Card as="article" className="fu-card" data-screen-label="fuentes-portfolio">
            {etiquetas(t("fuentes.tag.portfolio"), "neutro", true)}
            <PanelHeader
              className="fu-ph-acc"
              titulo={<span className="fu-dato">dgatica.cl</span>}
              acciones={
                <Button variante="fantasma" id="btnWeb" aria-busy={webState === "reading"} aria-disabled={webState === "reading"} onClick={reReadWeb}>
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
                </Button>
              }
            />
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
          </Card>

          {/* Archivos */}
          <Card as="article" className="fu-card" data-screen-label="fuentes-archivos">
            {etiquetas(t("fuentes.files.tag"), "neutro", true)}
            <PanelHeader
              className="fu-ph-acc"
              titulo={t("fuentes.files.name")}
              acciones={
                <Button variante="fantasma" href={HREF_IMPORTAR}>
                  {t("fuentes.files.upload")}
                </Button>
              }
            />
            <div className="fu-facts fu-facts--doc">
              <div>
                <div className="v">CV_2023.pdf</div>
                <div className="k">{t("fuentes.files.doc1K")}</div>
              </div>
              <div>
                <div className="v">cuestionario-identidad.md</div>
                <div className="k">{t("fuentes.files.doc2K")}</div>
              </div>
            </div>
          </Card>

          {linkedInCardLocal}
        </div>

        <div className="fu-add">
          <input className="c-input" aria-label={t("fuentes.add.button")} placeholder={t("fuentes.add.placeholder")} />
          <Button variante="grafito">{t("fuentes.add.button")}</Button>
        </div>
      </main>
    </div>
  );
}
