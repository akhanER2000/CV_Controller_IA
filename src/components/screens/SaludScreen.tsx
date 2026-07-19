"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { Breadcrumb } from "@/components/Breadcrumb";
import "./salud.css";

/* ============================================================================
   Salud de la variante — porte de corpus-design/04-pantallas/salud.html
   (ver docs/spec/pantallas/salud.md). MURO: NO monta la aurora
   ("donde hay trabajo que leer, hay muro"). Sin score, sin barras, sin
   umbrales, sin porcentajes. Solo lo que PUEDE fallar; cada hallazgo con su
   fuente ([fuente] = evidencia citada · [criterio] = decisión de diseño).
   "Todo en orden" = silencio (se deriva de los datos, no es un toggle de UI).

   Fidelidad / decisiones:
   - Los nombres de clase (sl-*, c-*, hd-*, t-*) son el contrato; no cambian.
   - El conteo de #slN se DERIVA del mock (findings.length + los bloqueantes),
     no se hardcodea suelto. Con 4 hallazgos y 0 marcados como bloqueantes da
     exactamente el literal del HTML: "4 hallazgos · 0 bloqueantes".
   - Interacciones reales de producto con estado React: cada cita abre/cierra
     de forma independiente (no acordeón); el bloque "garantizado" se pliega.
   - El panel .demo del HTML NO se porta (convención de entrega, no producto):
     "con hallazgos" vs "todo en orden" es estado de DATOS, no un botón.
   - a11y: se cierran huecos documentados en la spec §8 SIN tocar clases —
     aria-expanded/aria-controls en los disclosure, aria-hidden en decorativos.
   - i18n: el TEXTO sale de dict/salud.ts (ES=referencia, EN=copy.md) vía t();
     los findings/garantizados se arman con builders que reciben t (rule 1).
   ============================================================================ */

/* Ruta de producto de la variante abierta. En la maqueta el [id] del route se
   ignora (spec §12); editor-variante.html → /app/variantes/[id],
   tailor.html → /app/variantes/[id]/tailor. */
const VARIANT_ID = "backend-fintech";
const VARIANT_TITLE = "Backend — Fintech";
const EDITOR_HREF = `/app/variantes/${VARIANT_ID}`;
const TAILOR_HREF = `/app/variantes/${VARIANT_ID}/tailor`;
/* Salida de último recurso si la ruta no trae [id] (no debería, pero una
   pantalla sin salida es el bug que estamos matando). */
const FALLBACK = "/app/variantes";

interface Finding {
  id: string; // c1..c4 — cableado a la cita
  title: string; // .tt
  detail: string; // .sl-d
  fixLabel: string; // texto del enlace .fix (la → es parte del texto)
  fixHref: string;
  blocking: boolean; // deriva el conteo de "bloqueantes"; ninguno lo es hoy
  cite: React.ReactNode; // .sl-cite (con <b> en fuente/criterio)
}

const buildFindings = (t: (key: string) => string): Finding[] => [
  {
    id: "c1",
    title: t("salud.c1.title"),
    detail: t("salud.c1.detail"),
    fixLabel: t("salud.c1.fix"),
    fixHref: EDITOR_HREF,
    blocking: false,
    cite: (
      <>
        <b>{t("salud.c1.citeSrc")}</b>
        {t("salud.c1.cite1")}
        <b>{t("salud.c1.citeBold")}</b>
        {t("salud.c1.cite2")}
      </>
    ),
  },
  {
    id: "c2",
    title: t("salud.c2.title"),
    detail: t("salud.c2.detail"),
    fixLabel: t("salud.c2.fix"),
    fixHref: EDITOR_HREF,
    blocking: false,
    cite: (
      <>
        <b>{t("salud.c2.citeSrc")}</b>
        {t("salud.c2.cite1")}
      </>
    ),
  },
  {
    id: "c3",
    title: t("salud.c3.title"),
    detail: t("salud.c3.detail"),
    fixLabel: t("salud.c3.fix"),
    fixHref: TAILOR_HREF,
    blocking: false,
    cite: (
      <>
        <b>{t("salud.c3.citeSrc")}</b>
        {t("salud.c3.cite1")}
      </>
    ),
  },
  {
    id: "c4",
    title: t("salud.c4.title"),
    detail: t("salud.c4.detail"),
    fixLabel: t("salud.c4.fix"),
    fixHref: EDITOR_HREF,
    blocking: false,
    cite: (
      <>
        <b>{t("salud.c4.citeSrc")}</b>
        {t("salud.c4.cite1")}
      </>
    ),
  },
];

/* Lo garantizado por construcción — educación plegada, no teatro. */
const buildGuaranteed = (t: (key: string) => string): React.ReactNode[] => [
  <>
    <b>{t("salud.g1.b")}</b>
    {t("salud.g1.t")}
  </>,
  <>
    <b>{t("salud.g2.b")}</b>
    {t("salud.g2.t")}
  </>,
  <>
    <b>{t("salud.g3.b")}</b>
    {t("salud.g3.t")}
  </>,
  <>
    <b>{t("salud.g4.b")}</b>
    {t("salud.g4.t")}
  </>,
  <>
    <b>{t("salud.g5.b")}</b>
    {t("salud.g5.t")}
  </>,
];

export function SaludScreen() {
  const t = useT();
  /* La salud SIEMPRE es la salud DE una variante: su salida natural es esa
     variante, tomada del [id] real de la ruta (no del id de maqueta). Si por lo
     que sea no hay [id], se cae al listado — nunca a "ningún sitio". */
  const routeId = useParams()?.id;
  const volverA = typeof routeId === "string" && routeId ? `/app/variantes/${routeId}` : FALLBACK;
  const findings = buildFindings(t);
  const guaranteed = buildGuaranteed(t);
  const hasFindings = findings.length > 0;
  const blockingCount = findings.filter((f) => f.blocking).length;
  // #slN: conteo derivado de los datos. "Todo en orden" pierde "· bloqueantes".
  // Interpolación por .replace: {n} = nº de hallazgos, {b} = nº de bloqueantes.
  const findingsLabel = hasFindings
    ? t("salud.count.findings").replace("{n}", String(findings.length)) +
      t("salud.count.blocking").replace("{b}", String(blockingCount))
    : t("salud.count.findings").replace("{n}", "0");

  const [openCites, setOpenCites] = useState<Set<string>>(() => new Set());
  const [builtOpen, setBuiltOpen] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Movimiento del sistema: escalonar los .sl-item (step:60, cap:24 — literal del
  // HTML) y dibujar el hairline (c-divider) vía boot(), una sola vez cuando el
  // runtime vanilla exista. Con prefers-reduced-motion ambos degradan al estado
  // final visible (motion.js lo maneja internamente).
  useEffect(() => {
    let tries = 0;
    const id = window.setInterval(() => {
      const M = window.CorpusMotion;
      if (!M) {
        if (++tries > 100) window.clearInterval(id);
        return;
      }
      window.clearInterval(id);
      if (!started.current) {
        started.current = true;
        if (listRef.current) M.stagger(listRef.current, { step: 60, cap: 24 });
      }
      M.boot();
    }, 30);
    return () => window.clearInterval(id);
  }, []);

  const toggleCite = (cid: string) =>
    setOpenCites((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });

  return (
    <div className="c-page">
      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/app">
            Corpus
          </Link>
          <nav className="hd-nav">
            <Link href="/app">{t("nav.panel")}</Link>
            <Link href="/app/master">{t("nav.master")}</Link>
            <Link href="/app/variantes" aria-current="page">
              {t("nav.variantes")}
            </Link>
            <Link href="/app/fuentes">{t("nav.fuentes")}</Link>
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

      <div className="sl-bar" data-screen-label="salud-toolbar">
        <div className="c-container">
          {/* La salida: a la variante de la que cuelga esta salud, o a donde
              dijo el ?from si vienes de otro sitio. */}
          <Breadcrumb fallback={volverA} fallbackLabel={VARIANT_TITLE} />
          <span
            style={{ width: "1px", height: "16px", background: "var(--border-strong)" }}
            aria-hidden="true"
          />
          <span
            style={{
              font: "500 var(--fs-micro)/1 var(--font-mono)",
              letterSpacing: ".14em",
              color: "var(--text-muted)",
            }}
          >
            {t("salud.sectionLabel")}
          </span>
          <span
            id="slN"
            style={{
              marginLeft: "auto",
              font: "400 var(--fs-micro)/1 var(--font-mono)",
              color: "var(--text-subtle)",
            }}
          >
            {findingsLabel}
          </span>
        </div>
      </div>

      <main className="sl-main c-wall" data-screen-label="salud">
        <div className="c-container sl-col">
          <span className="t-overline">{t("salud.overline")}</span>
          <h2 style={{ marginTop: "12px" }}>{t("salud.title")}</h2>
          <p className="sl-lead">
            {t("salud.lead.pre")}
            <b>{t("salud.tag.source")}</b>
            {t("salud.lead.mid")}
            <b>{t("salud.tag.criterion")}</b>
            {t("salud.lead.post")}
          </p>
          <hr className="c-divider" style={{ marginTop: "18px" }} />

          {hasFindings ? (
            <div className="sl-list" id="list" ref={listRef}>
              {findings.map((f) => {
                const open = openCites.has(f.id);
                return (
                  <article className="c-card sl-item" key={f.id}>
                    <div className="sl-h">
                      <span className="mark">⚠</span>
                      <span className="tt">{f.title}</span>
                      <button
                        type="button"
                        className="src"
                        aria-expanded={open}
                        aria-controls={f.id}
                        onClick={() => toggleCite(f.id)}
                      >
                        {open ? `${t("salud.source")} ▴` : `${t("salud.source")} ▾`}
                      </button>
                      <Link className="fix c-btn c-btn--quiet" href={f.fixHref}>
                        {f.fixLabel}
                      </Link>
                    </div>
                    <div className="sl-d">{f.detail}</div>
                    <div className={`sl-cite${open ? " open" : ""}`} id={f.id}>
                      {f.cite}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="sl-ok show" id="ok">
              <div className="mark" aria-hidden="true">
                —
              </div>
              <p>
                {t("salud.ok.line1")}
                <br />
                {t("salud.ok.line2")}
              </p>
            </div>
          )}

          <div
            className={`sl-built${builtOpen ? " open" : ""}`}
            id="built"
            data-screen-label="salud-garantizado"
          >
            <button
              type="button"
              id="builtBtn"
              aria-expanded={builtOpen}
              aria-controls="builtRows"
              onClick={() => setBuiltOpen((v) => !v)}
            >
              {`${builtOpen ? "▾" : "▸"}  ${t("salud.builtLabel")}`}
            </button>
            <div className="rows" id="builtRows">
              {guaranteed.map((row, i) => (
                <div className="sl-brow" key={i}>
                  {row}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
