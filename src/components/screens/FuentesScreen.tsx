"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useBoot } from "@/lib/corpus/runtime";
import { supabaseEnabled } from "@/lib/supabase/config";
import { useT } from "@/lib/i18n";
import "./fuentes.css";

/* ============================================================================
   Fuentes — porte de corpus-design/04-pantallas/fuentes.html
   (ver docs/spec/pantallas/fuentes.md). Es un MURO: NO monta la aurora. El único
   movimiento de montaje es el hr.c-divider que dibuja CorpusMotion.boot().

   ★ CABLEADO A DATOS REALES. En modo Supabase el inventario sale de /api/sources
   (ingestion_sources del usuario, RLS por auth.uid()), más un SHELL de GitHub
   (afordancia, sin repos ficticios) y la tarjeta educativa de LinkedIn (genérica,
   sin datos). Una cuenta nueva ⇒ estado vacío. La maqueta completa (persona Diego
   Gatica, con la lista de repos) SOLO se usa como fallback del modo local.
   ============================================================================ */

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

export function FuentesScreen() {
  // boot() dibuja el hr.c-divider del scope.
  const bootRef = useBoot<HTMLElement>();
  const t = useT();
  const kindLabel = (k: string) => (KIND_KEYS.has(k) ? t(`fuentes.kind.${k}`) : k);
  const statusLabel = (s: string) => (STATUS_KEYS.has(s) ? t(`fuentes.status.${s}`) : s);

  // Estado del MODO LOCAL (demo interactiva).
  const [repos, setRepos] = useState<Repo[]>(INITIAL_REPOS);
  const [reposOpen, setReposOpen] = useState(false);
  const [ghState, setGhState] = useState<ReadState>("idle");
  const [webState, setWebState] = useState<ReadState>("idle");

  // Estado del MODO SUPABASE (fuentes reales).
  const [sources, setSources] = useState<SourceView[]>([]);
  const [loading, setLoading] = useState(supabaseEnabled);

  useEffect(() => {
    if (!supabaseEnabled) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/sources");
        const data = await res.json();
        if (active) setSources((data.sources ?? []) as SourceView[]);
      } catch {
        if (active) setSources([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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

  // La tarjeta educativa de LinkedIn es genérica (sin datos de persona): se
  // muestra en ambos modos.
  const linkedInCard = (
    <article className="c-card fu-card fu-li" data-screen-label="fuentes-linkedin">
      <div className="fu-h">
        <span className="nm">linkedin</span>
        <span className="tag">{t("fuentes.li.tag")}</span>
      </div>
      <p>{t("fuentes.li.body")}</p>
      <div className="vias">
        <Link href="/app/importar">
          <b>{t("fuentes.li.via1Bold")}</b>{t("fuentes.li.via1")}
        </Link>
        <Link href="/app/importar">
          <b>{t("fuentes.li.via2Bold")}</b>{t("fuentes.li.via2")}
        </Link>
        <Link href="/app/importar">
          <b>{t("fuentes.li.via3Bold")}</b>{t("fuentes.li.via3")}
        </Link>
      </div>
    </article>
  );

  // ═══════════════════════ MODO SUPABASE (datos reales) ═══════════════════════
  if (supabaseEnabled) {
    const sourcesEmpty = !loading && sources.length === 0;
    return (
      <div className="c-page">
        {header}
        <main className="fu-main c-wall" data-screen-label="fuentes" ref={bootRef}>
          <div className="c-container">
            <div className="fu-lead">
              <p>
                {t("fuentes.lead.prefix")}
                <b style={{ color: "var(--text)", fontWeight: 500 }}>{t("fuentes.lead.bold")}</b>
                {t("fuentes.lead.suffixReal")}
              </p>
              <Link className="c-btn" href="/app/importar">
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
              <div style={{ textAlign: "center", padding: "48px 0 40px" }} data-screen-label="fuentes-vacio">
                <span className="t-overline">{t("fuentes.empty.overline")}</span>
                <h2 style={{ marginTop: "14px" }}>{t("fuentes.empty.title")}</h2>
                <p style={{ color: "var(--text-muted)", maxWidth: "52ch", margin: "10px auto 0" }}>
                  {t("fuentes.empty.body")}
                </p>
                <div style={{ marginTop: "24px" }}>
                  <Link className="c-btn c-btn--patina" href="/app/importar">
                    {t("fuentes.empty.cta")}
                  </Link>
                </div>
              </div>
            ) : null}

            {!loading &&
              sources.map((s) => {
                const name = s.originalName || s.sourceUrl || kindLabel(s.kind);
                return (
                  <article className="c-card fu-card" key={s.id} data-screen-label="fuentes-item">
                    <div className="fu-h">
                      <span className="nm">{name}</span>
                      <span className="tag">{kindLabel(s.kind)}</span>
                      <span className="acts">
                        <Link className="c-btn c-btn--quiet" href="/app/staging">
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
                  </article>
                );
              })}

            {/* GitHub: shell (afordancia real, sin repos ficticios) */}
            <article className="c-card fu-card" data-screen-label="fuentes-github">
              <div className="fu-h">
                <span className="nm">GitHub</span>
                <span className="tag star">{t("fuentes.tag.noAiApi")}</span>
                <span className="acts">
                  <Link className="c-btn c-btn--quiet" href="/app/importar">
                    {t("fuentes.ghShell.connect")}
                  </Link>
                </span>
              </div>
              <div className="fu-note">
                {t("fuentes.ghShell.notePre")}<b>{t("fuentes.ghShell.noteBold")}</b>{t("fuentes.ghShell.noteSuf")}
              </div>
            </article>

            {linkedInCard}

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

  // ═══════════════════════ MODO LOCAL (maqueta interactiva) ═══════════════════
  return (
    <div className="c-page">
      {header}

      <main className="fu-main c-wall" data-screen-label="fuentes" ref={bootRef}>
        <div className="c-container">
          <div className="fu-lead">
            <p>
              {t("fuentes.lead.prefix")}
              <b style={{ color: "var(--text)", fontWeight: 500 }}>{t("fuentes.lead.bold")}</b>
              {t("fuentes.lead.suffixLocal")}
            </p>
            <Link className="c-btn" href="/app/importar">
              {t("fuentes.dumpMore")}
            </Link>
          </div>
          <hr className="c-divider" />

          {/* GitHub: la fuente estrella */}
          <article className="c-card fu-card" data-screen-label="fuentes-github">
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
                    <Link className="c-btn c-btn--quiet" href="/app/staging">
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
                <b>
                  {t("fuentes.repo.selected").replace("{sel}", String(selected)).replace("{tot}", String(total))}
                </b>
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
          <article className="c-card fu-card" data-screen-label="fuentes-portfolio">
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
          <article className="c-card fu-card" data-screen-label="fuentes-archivos">
            <div className="fu-h">
              <span className="nm">{t("fuentes.files.name")}</span>
              <span className="tag">{t("fuentes.files.tag")}</span>
              <span className="acts">
                <Link className="c-btn c-btn--quiet" href="/app/importar">
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

          {linkedInCard}

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
