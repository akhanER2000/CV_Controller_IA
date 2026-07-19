"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useBoot } from "@/lib/corpus/runtime";
import { Breadcrumb } from "@/components/Breadcrumb";
import "./tailor.css";

/* Nombre de maqueta de la variante abierta y salida de último recurso: adaptar
   siempre se hace SOBRE una variante, y de una variante se vuelve a ella. */
const VARIANT_TITLE = "Backend — Fintech";
const FALLBACK = "/app/variantes";

/* ============================================================================
   Tailor — porte de corpus-design/04-pantallas/tailor.html
   (ver docs/spec/pantallas/tailor.md). MURO: NO monta la aurora
   («donde hay trabajo, el trabajo gana»).

   El alma ética del producto: contrasta el aviso contra el MASTER (52 items),
   no contra la variante, y responde con HECHOS en tres grupos — nunca un score
   ni un porcentaje de match. El grupo 3 («no está en ninguna parte») NO tiene
   botón de añadir: punto.

   Fidelidad y decisiones:
   - Todo el estado del HTML original (outerHTML/innerHTML/contentEditable) se
     modela como estado React: added, reframed, titleAligned, propStates[].
   - Números derivados de los datos del mock, no sueltos: 6/4/3 = HAVE/ADD/GAP.
   - El log de análisis reproducía «148 palabras, 14 exigencias» — cifras sin
     fuente y contradictorias con la propia pantalla (spec §10). Aquí se derivan:
     palabras = conteo real del aviso; exigencias = HAVE+ADD+GAP (13).
   - a11y (spec §8): #work es role="status" aria-live; el resultado se anuncia
     por live region; la propuesta editable lleva role="textbox"+aria-label;
     los botones táctiles suben a 44px en móvil (tailor.css).
   - El panel .demo NO se porta (convención de entrega, no producto): sus dos
     estados equivalen a los botones reales «usar aviso de ejemplo» + «Comparar».
   ============================================================================ */

const JD = `Backend Engineer — Pagos (Santiago, híbrido)

Buscamos Backend Engineer para el equipo de infraestructura de pagos. Vas a diseñar y operar servicios de reconciliación y liquidación de alto volumen.

Requisitos:
• 4+ años construyendo servicios backend en Go
• PostgreSQL y modelado de datos transaccionales
• gRPC y diseño de APIs
• Experiencia operando Kubernetes en producción
• Kafka o streaming de eventos
• AWS (ECS/EKS, RDS)
• Inglés para documentación y equipos globales
• Disponibilidad de turnos on-call

Deseable: experiencia en fintech o medios de pago, CI/CD, mentoría a ingenieros junior.`;

interface Fact {
  k: string;
  d: string;
  re?: boolean;
}

const HAVE: Fact[] = [
  { k: "Go · 4+ años", d: "viñeta «servicio de conciliación en Go (~40.000 tx diarias)» · skill verificada: 412 KB, 3 repos" },
  { k: "PostgreSQL", d: "skill verificada · APIs del checkout (Rayén, 2 años)" },
  { k: "gRPC y APIs", d: "skill verificada · conciliador-api con protos versionados" },
  { k: "Pagos / fintech", d: "Altiplano Pagos: conciliación y liquidación — es literalmente el dominio del aviso" },
  { k: "On-call", d: "viñeta «turno de soporte una semana al mes»" },
  { k: "Inglés", d: "B2 declarado — el aviso pide inglés de documentación: alcanza, dilo así" },
];

const ADD: Fact[] = [
  { k: "CI/CD", d: "viñeta en tu master: «mantengo los pipelines de CI/CD (GitHub Actions)»" },
  { k: "Mentoría", d: "viñeta en tu master: «mentoreo a 2 desarrolladores junior»" },
  { k: "Redis", d: "skill verificada en tu master (locks de idempotency-go)" },
  { k: "Documentación de APIs", d: "viñeta en tu master: «documenté la API pública (OpenAPI 3.1)»" },
];

const GAP: Fact[] = [
  {
    k: "Kubernetes en producción",
    d: "Tienes evidencia parcial: «lo usamos pero no lo administraba yo». Puedes contarlo como usuario — no como operador. Eso sí es defendible en entrevista.",
    re: true,
  },
  {
    k: "Kafka / streaming",
    d: "No aparece en tu master, tus repos ni tu portfolio. Si lo has usado y no lo registraste, regístralo con su contexto. Si no: es una brecha real de este aviso, no un defecto de tu CV.",
  },
  {
    k: "AWS (ECS/EKS, RDS)",
    d: "Solo un README la menciona. Sin proyectos ni viñetas que la sostengan, ponerla te expone en la entrevista de 20 segundos.",
  },
];

type Ver = "ok" | "none";
interface Prop {
  ver: Ver;
  trace: string;
  o: string;
  p: string;
  warn: string | null;
}

const PROPS: Prop[] = [
  {
    ver: "ok",
    trace: "tu viñeta b1 + término literal del aviso («reconciliación»)",
    o: "A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias).",
    p: "A cargo del servicio de <b>conciliación (reconciliación) de pagos</b> en Go (~40.000 transacciones diarias), incluyendo <b>liquidación</b>.",
    warn: null,
  },
  {
    ver: "ok",
    trace: "tu resumen del master, reordenado — mismo contenido, dominio primero",
    o: "Backend developer con 6 años construyendo servicios de pago y e-commerce en Go y Node.js…",
    p: "<b>Backend engineer de pagos</b> con 6 años en Go y Node.js. A cargo de la <b>reconciliación</b> de Altiplano Pagos (~40.000 tx/día)…",
    warn: null,
  },
  {
    ver: "none",
    trace: "la IA lo propuso — SIN origen en tu master",
    o: "(no existe una viñeta de origen)",
    p: "Diseñé la arquitectura event-driven del pipeline de pagos con Kafka.",
    warn: "No verificado: nada en tu master sostiene «arquitectura event-driven» ni «Kafka». Si es verdad, escríbelo tú y quedará como origen manual. Si no lo es, recházalo — así de simple.",
  },
];

type PropState = "idle" | "accepted" | "rejected" | "editing" | "saved";

const REFRAME_BULLET =
  "✓ viñeta honesta añadida: «Operé servicios sobre Kubernetes como usuario (deploys, debugging) — sin administrar el cluster»";

const countWords = (s: string): number => (s.trim().match(/\S+/g) || []).length;
const fmt = (n: number): string => n.toLocaleString("es-CL");
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const done: React.CSSProperties = { font: "500 var(--fs-micro)/1 var(--font-mono)", color: "var(--ver-ok)" };
const rejNote: React.CSSProperties = { font: "500 var(--fs-micro)/1 var(--font-mono)", color: "var(--text-subtle)" };
const inlineNote: React.CSSProperties = { font: "400 10px/1.5 var(--font-mono)", color: "var(--text-subtle)" };
const editNote: React.CSSProperties = { font: "400 10px/1.5 var(--font-mono)", color: "var(--text-muted)" };

export function TailorScreen() {
  const bootRef = useBoot<HTMLDivElement>();
  const t = useT();
  // La variante real de la ruta; si no hay [id], al listado (nunca a la nada).
  const routeId = useParams()?.id;
  const volverA = typeof routeId === "string" && routeId ? `/app/variantes/${routeId}` : FALLBACK;

  const [jd, setJd] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [logSteps, setLogSteps] = useState<{ text: string; done: boolean }[]>([]);
  const [resultMsg, setResultMsg] = useState("");

  const [titleAligned, setTitleAligned] = useState(false);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [reframed, setReframed] = useState<Set<number>>(new Set());
  const [propStates, setPropStates] = useState<PropState[]>(() => PROPS.map(() => "idle"));

  const workRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const propRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const revealedRef = useRef(0);
  const runningRef = useRef(false);
  const focusPropRef = useRef<number | null>(null);

  const words = countWords(jd);
  const canGo = words >= 30;
  const totalReqs = HAVE.length + ADD.length + GAP.length;

  // Revela cada línea del log al aparecer (M.reveal, como el original). Sin
  // data-reveal en el nodo: si el runtime no está, las líneas quedan visibles.
  useEffect(() => {
    if (!analyzing) return;
    const M = window.CorpusMotion;
    const host = workRef.current;
    if (!M || !host) return;
    const kids = host.children;
    for (let i = revealedRef.current; i < kids.length; i++) M.reveal(kids[i]);
    revealedRef.current = kids.length;
  }, [logSteps, analyzing]);

  // Al aparecer #out: entrada C2 + stagger de filas/props + boot de los hairlines.
  useEffect(() => {
    if (!analyzed) return;
    const M = window.CorpusMotion;
    const el = outRef.current;
    if (!M || !el) return;
    M.enter(el);
    M.stagger(el, { step: 60, cap: 24, items: el.querySelectorAll(".tl-row,.tl-title,.tl-prop") });
    M.boot(el);
  }, [analyzed]);

  // Al pasar una propuesta a edición: foco al texto + caret al final (a11y).
  useEffect(() => {
    if (focusPropRef.current == null) return;
    const el = propRefs.current[focusPropRef.current];
    focusPropRef.current = null;
    if (!el) return;
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  }, [propStates]);

  async function analyze() {
    if (runningRef.current) return;
    runningRef.current = true;

    const M = window.CorpusMotion;
    const steps = [
      t("tailor.logReading").replace("{n}", fmt(words)).replace("{r}", String(totalReqs)),
      t("tailor.logComparing"),
      t("tailor.logSearching"),
    ];

    setResultMsg("");
    setAnalyzed(false);
    setAnalyzing(true);
    setLogSteps([]);
    revealedRef.current = 0;

    const rm = M?.rm ? M.rm() : window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (let i = 0; i < steps.length; i++) {
      setLogSteps((prev) => [...prev, { text: steps[i], done: false }]);
      await sleep(rm ? 80 : 850);
      setLogSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, done: true } : s)));
    }

    setAnalyzing(false);
    setAnalyzed(true);
    setResultMsg(
      t("tailor.resultMsg")
        .replace("{have}", String(HAVE.length))
        .replace("{add}", String(ADD.length))
        .replace("{gap}", String(GAP.length)),
    );
    runningRef.current = false;
  }

  const addItem = (i: number) => setAdded((s) => new Set(s).add(i));
  const reframeItem = (i: number) => setReframed((s) => new Set(s).add(i));
  const setProp = (i: number, st: PropState) =>
    setPropStates((s) => s.map((v, idx) => (idx === i ? st : v)));
  const acceptProp = (i: number) => setProp(i, "accepted");
  const rejectProp = (i: number) => setProp(i, "rejected");
  const editProp = (i: number) => {
    focusPropRef.current = i;
    setProp(i, "editing");
  };
  const saveProp = (i: number) => setProp(i, "saved");

  function renderFoot(i: number, p: Prop, st: PropState) {
    if (st === "accepted") return <span style={done}>{t("tailor.footAccepted")}</span>;
    if (st === "rejected") return <span style={rejNote}>{t("tailor.footRejected")}</span>;
    if (st === "editing")
      return (
        <>
          <span style={editNote}>{t("tailor.footEditing")}</span>
          <span className="sp">
            <button type="button" className="acc" onClick={() => saveProp(i)}>
              {t("tailor.footSaveMine")}
            </button>
          </span>
        </>
      );
    if (st === "saved") return <span style={done}>{t("tailor.footSaved")}</span>;
    // idle
    return (
      <>
        {p.warn ? (
          <span className="warn">⚠ {p.warn}</span>
        ) : (
          <span style={inlineNote}>{t("tailor.footIdleNote")}</span>
        )}
        <span className="sp">
          {p.ver === "ok" ? (
            <button type="button" className="acc" onClick={() => acceptProp(i)}>
              {t("tailor.footAccept")}
            </button>
          ) : (
            <button type="button" onClick={() => editProp(i)}>
              {t("tailor.footEditYou")}
            </button>
          )}
          <button type="button" className="rej" onClick={() => rejectProp(i)}>
            {t("tailor.footReject")}
          </button>
        </span>
      </>
    );
  }

  return (
    <div className="c-page" ref={bootRef}>
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

      <div className="tl-bar" data-screen-label="tailor-toolbar">
        <div className="c-container">
          {/* La salida: a la variante que estás adaptando (o al ?from). */}
          <Breadcrumb fallback={volverA} fallbackLabel={VARIANT_TITLE} />
          <span style={{ width: "1px", height: "16px", background: "var(--border-strong)" }} />
          <span
            style={{
              font: "500 var(--fs-micro)/1 var(--font-mono)",
              letterSpacing: ".14em",
              color: "var(--text-muted)",
            }}
          >
            {t("common.tailor").toUpperCase()}
          </span>
          <span
            style={{
              marginLeft: "auto",
              font: "400 var(--fs-micro)/1 var(--font-mono)",
              color: "var(--text-subtle)",
            }}
          >
            {t("tailor.toolbarNote")}
          </span>
        </div>
      </div>

      <main className="tl-main c-wall" data-screen-label="tailor">
        <div className="c-container tl-grid">
          {/* el aviso */}
          <aside className="tl-left" data-screen-label="tailor-aviso">
            <label className="c-label" htmlFor="jd">
              {t("tailor.jdLabel")}
            </label>
            <textarea
              className="c-textarea"
              id="jd"
              spellCheck={false}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder={t("tailor.jdPlaceholder")}
            />
            <div className="foot">
              <span className="meta" id="jdMeta">
                {t("tailor.words").replace("{n}", fmt(words))}
              </span>
              <span style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="c-btn c-btn--quiet" id="btnSample" onClick={() => setJd(JD)}>
                  {t("tailor.useSample")}
                </button>
                <button
                  type="button"
                  className="c-btn c-btn--patina"
                  id="btnGo"
                  disabled={!canGo}
                  onClick={analyze}
                >
                  {t("tailor.compare")}
                </button>
              </span>
            </div>
            <div
              className={`tl-work${analyzing ? " show" : ""}`}
              id="work"
              ref={workRef}
              role="status"
              aria-live="polite"
            >
              {logSteps.map((s, i) => (
                <div key={i}>
                  {s.done ? "✓ " : "⟳ "}
                  {s.text}
                </div>
              ))}
            </div>
          </aside>

          {/* resultado */}
          <section className="tl-res" id="res">
            <span aria-live="polite" style={srOnly}>
              {resultMsg}
            </span>

            <div className="tl-hint c-card" id="hint" hidden={analyzing || analyzed}>
              <span className="t-overline">{t("tailor.hintOverline")}</span>
              {t("tailor.hintBefore")} <b>{t("tailor.hintItems")}</b> {t("tailor.hintAfter")}
              <br />
              {t("tailor.hintLine2")}
            </div>

            <div id="out" ref={outRef} hidden={!analyzed}>
              {/* título */}
              <div className="c-card tl-title" data-screen-label="tailor-titulo">
                <span className="pair">
                  {t("tailor.titlePre")} <b>«Backend Engineer»</b>
                  <span className="arrow">·</span>{t("tailor.titleMid")}{" "}
                  <b id="curTitle">
                    {titleAligned ? t("tailor.titleAlignedValue") : t("tailor.titleCurrent")}
                  </b>
                </span>
                <span className="act">
                  <span className="why">{t("tailor.titleWhy")}</span>
                  {titleAligned ? (
                    <span className="done" style={done}>
                      {t("tailor.titleDone")}
                    </span>
                  ) : (
                    <button type="button" className="c-btn" id="btnTitle" onClick={() => setTitleAligned(true)}>
                      {t("tailor.titleUse")}
                    </button>
                  )}
                </span>
              </div>

              {/* grupo 1 — ya está */}
              <div className="tl-g tl-g--have">
                <div className="tl-gh">
                  <span className="g-mark">✓</span>
                  <span className="t-overline">{t("tailor.haveTitle")}</span>
                  <span className="n" id="nHave">
                    {HAVE.length}
                  </span>
                </div>
                <hr className="c-divider" />
                <div className="tl-rows" id="gHave">
                  {HAVE.map((x) => (
                    <div className="tl-row" key={x.k}>
                      <span className="k">{x.k}</span>
                      <span className="d">{x.d}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* grupo 2 — en el master, no en la variante */}
              <div className="tl-g tl-g--add">
                <div className="tl-gh">
                  <span className="g-mark">＋</span>
                  <span className="t-overline">{t("tailor.addTitle")}</span>
                  <span className="n">{ADD.length}</span>
                  <span className="why">{t("tailor.addWhy")}</span>
                </div>
                <hr className="c-divider" />
                <div className="tl-rows" id="gAdd">
                  {ADD.map((x, i) => (
                    <div className="tl-row" key={x.k}>
                      <span className="k">{x.k}</span>
                      <span className="d">{x.d}</span>
                      <span className="act">
                        {added.has(i) ? (
                          <span className="done">{t("tailor.addDone")}</span>
                        ) : (
                          <button type="button" onClick={() => addItem(i)}>
                            {t("tailor.addBtn")}
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* grupo 3 — el alma ética: sin botón de añadir */}
              <div className="tl-g tl-g--gap">
                <div className="tl-gh">
                  <span className="g-mark">○</span>
                  <span className="t-overline">{t("tailor.gapTitle")}</span>
                  <span className="n">{GAP.length}</span>
                  <span className="why">{t("tailor.gapWhy")}</span>
                </div>
                <hr className="c-divider" />
                <div className="tl-rows" id="gGap">
                  {GAP.map((x, i) => (
                    <div className="tl-row" key={x.k}>
                      <span className="k">{x.k}</span>
                      <span className="d" style={{ fontFamily: "var(--font-sans)" }}>
                        {x.d}
                      </span>
                      {x.re && (
                        <span className="act">
                          {reframed.has(i) ? (
                            <span className="done">{REFRAME_BULLET}</span>
                          ) : (
                            <button type="button" onClick={() => reframeItem(i)}>
                              {t("tailor.gapReframeBtn")}
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                  <div className="tl-gap-note">{t("tailor.gapNote")}</div>
                </div>
              </div>

              {/* reformulaciones — original ⇄ propuesto, una a una */}
              <div className="tl-ref" data-screen-label="tailor-reformulaciones">
                <div className="tl-gh">
                  <span className="t-overline">{t("tailor.refTitle")}</span>
                  <span className="n">{t("tailor.refCount").replace("{n}", String(PROPS.length))}</span>
                </div>
                <hr className="c-divider" />
                <div id="props">
                  {PROPS.map((p, i) => {
                    const st = propStates[i];
                    return (
                      <div
                        className="c-card tl-prop"
                        data-p={i}
                        key={i}
                        style={st === "rejected" ? { opacity: 0.45 } : undefined}
                      >
                        <div className="tl-phead">
                          <span className="t-overline">{t("tailor.propLabel").replace("{n}", String(i + 1))}</span>
                          <span className="trace">{p.trace}</span>
                          {st === "saved" ? (
                            <span className="c-ver c-ver--ok">{t("tailor.verSavedOrigin")}</span>
                          ) : (
                            <span className={`c-ver ${p.ver === "ok" ? "c-ver--ok" : "c-ver--none"}`}>
                              {p.ver === "ok" ? t("tailor.verOk") : t("tailor.verNone")}
                            </span>
                          )}
                        </div>
                        <div className="tl-cols">
                          <div>
                            <span className="lbl">{t("tailor.colOriginal")}</span>
                            <span className="orig">{p.o}</span>
                          </div>
                          <div>
                            <span className="lbl">{t("tailor.colProposed")}</span>
                            <span
                              className="prop"
                              ref={(el) => {
                                propRefs.current[i] = el;
                              }}
                              role={st === "editing" ? "textbox" : undefined}
                              aria-label={st === "editing" ? "Editar la propuesta" : undefined}
                              aria-multiline={st === "editing" ? true : undefined}
                              contentEditable={st === "editing" ? true : st === "saved" ? false : undefined}
                              suppressContentEditableWarning
                              dangerouslySetInnerHTML={{ __html: p.p }}
                            />
                          </div>
                        </div>
                        <div className="tl-pfoot">{renderFoot(i, p, st)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
