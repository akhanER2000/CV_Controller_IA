"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import "./master.css";

/* ============================================================================
   Master — porte de corpus-design/04-pantallas/master.html
   (ver docs/spec/pantallas/master.md). MURO: NO monta la aurora.
   Es el registro canónico completo — un editor, no un formulario. Se edita
   inline (contenteditable) y cada item recuerda su origen (fragmento expandible).

   Decisiones de fidelidad (documentadas en el schema devuelto):
   - Muro ⇒ sin <Aurora>. El fondo es var(--bg) opaco (.c-wall).
   - El panel .demo (3/52/200/vacío) NO se porta: es afordancia de revisión de
     diseño, no un control de producto. El máster escala con los datos reales; se
     renderiza el estado canónico poblado. El estado vacío deriva de los datos
     (isEmpty) y se conserva su markup.
   - #msN: los conteos NO se hardcodean. `total` y `sourceCount` se DERIVAN de los
     datos (spec §10.2: los literales "52 items · 4 fuentes" del HTML contradicen
     la doctrina "ningún número sin fuente"). "editado hace 2 días" queda como
     placeholder de maqueta (pendiente de timestamp real).
   - Interacciones REALES con estado React: buscar, filtrar, plegar grupos,
     expandir origen, edición inline → "editado por ti".
   - Huecos de a11y de la spec §8 cerrados sin renombrar clases.
   ============================================================================ */

type SrcKey = "tx" | "gh" | "web" | "cv" | "q" | "man";
type Ver = "ok" | "partial" | "none";
type FilterKey = "all" | "sin-cifra" | "sin-evidencia" | "sin-fechas";

const SRC: Record<SrcKey, string> = {
  tx: "texto pegado",
  gh: "github",
  web: "dgatica.cl",
  cv: "CV_2023.pdf",
  q: "cuestionario",
  man: "escrito por ti",
};

interface Bullet {
  tx: string;
  src: SrcKey;
  num: boolean;
  nudge?: string;
}
interface Role {
  tt: string;
  org: string;
  dates: string;
  src: SrcKey;
  warn?: string;
  frag: ReactNode;
  bullets: Bullet[];
}
interface Skill {
  n: string;
  ver: Ver;
  ev: ReactNode;
  ask?: string;
}
interface Row {
  tx: string;
  m: string;
}

const EXP: Role[] = [
  {
    tt: "Backend Developer",
    org: "Altiplano Pagos SpA · Santiago",
    dates: "mar 2022 – hoy",
    src: "tx",
    frag: (
      <>
        «Los últimos tres años trabajé en <mark>Altiplano Pagos como backend developer</mark>…»
      </>
    ),
    bullets: [
      { tx: "A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias).", src: "tx", num: true },
      { tx: "Escribí la librería interna de idempotencia (Go), adoptada por otros equipos.", src: "gh", num: false, nudge: "¿cuántos equipos?" },
      { tx: "Mantengo los pipelines de CI/CD del equipo (GitHub Actions).", src: "gh", num: false, nudge: "¿cuántos deploys/semana?" },
      { tx: "Documenté la API pública de conciliación (OpenAPI 3.1).", src: "gh", num: false },
      { tx: "Mentoreo a 2 desarrolladores junior del equipo de pagos.", src: "q", num: true },
      { tx: "Turno de soporte (on-call) una semana al mes.", src: "q", num: true },
    ],
  },
  {
    tt: "Backend Developer — equipo Checkout",
    org: "Rayén Retail S.A. · Santiago",
    dates: "ene 2020 – feb 2022",
    src: "cv",
    frag: (
      <>
        Fusionado por ti desde <mark>CV_2023.pdf</mark> y <mark>texto pegado</mark> (staging, 12 jul).
      </>
    ),
    bullets: [
      { tx: "Desarrollé y mantuve APIs del checkout (Node.js, PostgreSQL).", src: "cv", num: false, nudge: "¿qué volumen movían?" },
      { tx: "Implementé el flujo de cupones y descuentos del checkout.", src: "cv", num: false },
      { tx: "Atendí incidentes de producción durante cyber days.", src: "q", num: false, nudge: "¿cuántos peaks? ¿qué tráfico?" },
      { tx: "Automaticé reportes de ventas diarios para operaciones.", src: "cv", num: false },
    ],
  },
  {
    tt: "Desarrollador freelance",
    org: "Independiente · Santiago",
    dates: "2019 – …",
    warn: "falta fecha de término",
    src: "q",
    frag: (
      <>
        «Antes de Rayén trabajé <mark>por mi cuenta un año</mark>…» — el año de término no quedó registrado.
      </>
    ),
    bullets: [
      { tx: "Construí sitios y APIs para 4 pymes chilenas.", src: "q", num: true },
      { tx: "Sistema de reservas para un centro deportivo (Django), en producción desde 2020.", src: "web", num: true },
      { tx: "Administré hosting y dominios de clientes.", src: "cv", num: false },
    ],
  },
  {
    tt: "Práctica profesional — Área TI",
    org: "Universidad Andrés Bello · Santiago",
    dates: "2018 – 2019",
    src: "cv",
    frag: (
      <>
        «<mark>Práctica profesional, Dirección de TI UNAB</mark>, soporte a sistemas académicos.»
      </>
    ),
    bullets: [
      { tx: "Soporte a la plataforma de matrícula en periodos peak.", src: "cv", num: false },
      { tx: "Scripts de migración de datos de alumnos (Python).", src: "cv", num: false },
      { tx: "Documenté procesos del área para nuevos practicantes.", src: "cv", num: false },
    ],
  },
];

const SK: Skill[] = [
  {
    n: "Go",
    ver: "ok",
    ev: (
      <>
        412 KB · 3 repos · citada en 2 viñetas de experiencia
        <br />
        <a href="#">github.com/dgatica/pago-conciliador</a> · +2 más
      </>
    ),
  },
  { n: "Python", ver: "ok", ev: "188 KB · 2 repos · scripts de migración (práctica UNAB)" },
  { n: "PostgreSQL", ver: "ok", ev: "APIs del checkout (Rayén) · docker-compose en 2 repos" },
  { n: "Node.js", ver: "ok", ev: "CV_2023 · checkout de Rayén, 2 años" },
  { n: "SQL", ver: "ok", ev: "texto pegado · consultas en 3 repos" },
  { n: "TypeScript", ver: "ok", ev: "96 KB · 2 repos (front del portfolio)" },
  { n: "Docker", ver: "ok", ev: "Dockerfile en 5 repos" },
  { n: "GitHub Actions", ver: "ok", ev: "workflows en 4 repos" },
  { n: "Django", ver: "ok", ev: "reservas-club (portfolio) · en producción desde 2020" },
  { n: "gRPC", ver: "ok", ev: "conciliador-api · protos versionados" },
  { n: "Redis", ver: "ok", ev: "README de idempotency-go: backend de locks" },
  { n: "Inglés B2", ver: "ok", ev: "declarado en tu texto — sin certificado adjunto" },
  { n: "Kubernetes", ver: "partial", ev: "tu texto: «lo usamos pero no lo administraba yo» — nivel declarado: usuario" },
  { n: "Grafana", ver: "partial", ev: "dashboard de tickets (práctica) — coincidencia difusa" },
  { n: "Kafka", ver: "none", ev: "No aparece en ninguna viñeta, ni en tus repos, ni en tu portfolio.", ask: "¿Dónde lo usaste?" },
  { n: "AWS", ver: "none", ev: "Un README la menciona; ninguna viñeta ni proyecto la usa.", ask: "¿Dónde la usaste?" },
];

const PJ: Row[] = [
  { tx: "idempotency-go — librería open source de idempotencia en Go", m: "github · 214 KB · 41 commits" },
  { tx: "reservas-club — sistema de reservas en Django", m: "dgatica.cl · en producción" },
  { tx: "scraper-sii — CLI de series de tipo de cambio", m: "github · Python · 67 KB" },
  { tx: "dgatica.cl — portfolio con 6 casos documentados", m: "Next.js" },
];

const ED: Row[] = [
  { tx: "Ingeniería Civil en Computación e Informática — Universidad Andrés Bello", m: "2014 – 2019" },
  { tx: "Diplomado en Ingeniería de Datos — Pontificia Universidad Católica", m: "2022" },
  { tx: "Inglés B2 — autoevaluación", m: "sin certificado" },
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "todo" },
  { key: "sin-cifra", label: "sin cifra" },
  { key: "sin-evidencia", label: "⚠ sin evidencia" },
  { key: "sin-fechas", label: "sin fechas" },
];

/* Envuelve cada cifra visible en la voz mono `t-num` — réplica de
   b.tx.replace(/(\d[\d.,%~]*)/g,'<span class="t-num">$1</span>') del HTML. */
function wrapNums(text: string): ReactNode[] {
  return text.split(/(\d[\d.,%~]*)/g).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="t-num">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/* Fragmento de una viñeta: depende del origen (idéntico al HTML). */
function bulletFrag(src: SrcKey): ReactNode {
  return src === "gh" ? (
    <>
      evidencia: repos y archivos de <mark>github.com/dgatica</mark> — hechos de API, sin IA.
    </>
  ) : (
    <>
      fragmento de <mark>{SRC[src]}</mark> citado en staging (12 jul).
    </>
  );
}

export function MasterScreen() {
  // Estado real de producto.
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openFrags, setOpenFrags] = useState<ReadonlySet<string>>(new Set());
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());

  const mainRef = useRef<HTMLElement>(null);
  const groupsRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLSpanElement>(null);

  // Conteos DERIVADOS de los datos (nunca literales sueltos; spec §10).
  const totalBullets = EXP.reduce((a, e) => a + e.bullets.length, 0); // 16
  const total = 1 /*resumen*/ + EXP.length + totalBullets + SK.length + PJ.length + ED.length; // 44
  // «fuentes» = orígenes externos distintos que aportaron items. El origen
  // manual («escrito por ti», el del resumen) no es una fuente conectada, así
  // que no cuenta — es la ausencia de fuente, "el más verificable de todos".
  const externalSrc = new Set<SrcKey>();
  EXP.forEach((e) => {
    externalSrc.add(e.src);
    e.bullets.forEach((b) => externalSrc.add(b.src));
  });
  const sourceCount = externalSrc.size; // 5: tx, gh, web, cv, q
  const isEmpty = total === 0;
  const msNText = isEmpty ? "0 items" : `${total} items · ${sourceCount} fuentes · editado hace 2 días`;

  const toggleIn = (
    setter: (fn: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void,
    id: string,
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleFrag = (id: string) => toggleIn(setOpenFrags, id);
  const toggleFold = (id: string) => toggleIn(setFolded, id);
  const markTouched = (id: string) =>
    setTouched((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  // Movimiento del sistema: escalonado + dibujo de hairlines, una sola vez,
  // cuando el runtime vanilla exista (patrón de OnboardingScreen/AuthScreen).
  useEffect(() => {
    let tries = 0;
    const id = window.setInterval(() => {
      const M = window.CorpusMotion;
      if (!M) {
        if (++tries > 100) window.clearInterval(id);
        return;
      }
      window.clearInterval(id);
      const groups = groupsRef.current;
      if (groups) {
        M.stagger(groups, {
          step: 40,
          cap: 24,
          items: groups.querySelectorAll(".ms-card,.ms-sk,.ms-row"),
        });
      }
      M.boot(mainRef.current ?? document);
    }, 30);
    return () => window.clearInterval(id);
  }, []);

  // Deep-link por hash: /app/master#sin-cifra activa el filtro a los 60 ms.
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (FILTERS.some((f) => f.key === h)) {
      const t = window.setTimeout(() => setFilter(h as FilterKey), 60);
      return () => window.clearTimeout(t);
    }
  }, []);

  // Búsqueda + filtros: réplica LITERAL de applyFilter() del HTML (incluida su
  // semántica de items anidados y ocultación de grupos vacíos). Query y filtro
  // son estado React; la aplicación usa el mismo algoritmo del contrato.
  useLayoutEffect(() => {
    const groups = groupsRef.current;
    if (!groups) return;
    const q = query.toLowerCase();
    groups.querySelectorAll<HTMLElement>("[data-item]").forEach((it) => {
      let ok = true;
      if (q) ok = (it.textContent || "").toLowerCase().includes(q);
      if (ok && filter === "sin-cifra") ok = it.dataset.num === "false";
      if (ok && filter === "sin-evidencia") ok = it.dataset.ver === "none";
      if (ok && filter === "sin-fechas") ok = !!it.querySelector('[data-warn="fechas"]');
      it.style.display = ok ? "" : "none";
    });
    groups.querySelectorAll<HTMLElement>(".ms-g").forEach((g) => {
      const any = [...g.querySelectorAll<HTMLElement>("[data-item]")].some(
        (i) => i.style.display !== "none",
      );
      g.style.display = any ? "" : "none";
    });
    // a11y §8.4: anunciar el recuento tras filtrar (el HTML no lo hacía).
    if (liveRef.current) {
      const n = [...groups.querySelectorAll<HTMLElement>("[data-item]")].filter(
        (i) => i.style.display !== "none",
      ).length;
      liveRef.current.textContent = query || filter !== "all" ? `${n} items coinciden` : "";
    }
  }, [query, filter]);

  const handleAdd = () =>
    window.alert("En producto: fila nueva editable al foco, origen: manual. (Mock)");

  // Botón de origen expandible (con foco de teclado y aria-expanded — spec §8.3).
  const srcButton = (id: string, srcKey: SrcKey): ReactNode => {
    const isTouched = touched.has(id);
    return (
      <button
        type="button"
        className="ms-src"
        aria-expanded={openFrags.has(id)}
        aria-controls={`${id}-frag`}
        style={isTouched ? { opacity: 1, color: "var(--accent-text)" } : undefined}
        onClick={() => toggleFrag(id)}
      >
        {isTouched ? "origen: editado por ti · ahora ▾" : `origen: ${SRC[srcKey]} ▾`}
      </button>
    );
  };

  const fragClass = (id: string) => `ms-frag${openFrags.has(id) ? " open" : ""}`;

  const nudge = (b: Bullet): ReactNode => {
    if (b.num) return null;
    return (
      <span className={`ms-nudge${b.nudge ? " push" : ""}`}>
        {b.nudge ? `sin cifra — ${b.nudge}` : "sin cifra"}
      </span>
    );
  };

  const groupSection = (id: string, title: string, cnt: string, body: ReactNode): ReactNode => {
    const isFolded = folded.has(id);
    return (
      <section className={`ms-g${isFolded ? " folded" : ""}`} id={id} key={id}>
        <div className="ms-gh">
          <span className="t-overline">{title}</span>
          <span className="cnt">{cnt}</span>
          <button
            type="button"
            className="fold"
            data-fold
            aria-expanded={!isFolded}
            onClick={() => toggleFold(id)}
          >
            {isFolded ? "desplegar" : "plegar"}
          </button>
        </div>
        <hr className="c-divider" />
        <div className="ms-body">{body}</div>
      </section>
    );
  };

  const roleCard = (e: Role, i: number): ReactNode => {
    const headerId = `it-exp-${i}`;
    return (
      <article className="c-card ms-card" data-item key={headerId}>
        <div className="ms-eh">
          <span
            className="tt"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            role="textbox"
            aria-label={`Editar título del rol: ${e.tt}`}
            onBlur={() => markTouched(headerId)}
          >
            {e.tt}
          </span>
          <span className="org">
            {e.org} · {e.dates}
          </span>
          {e.warn ? (
            <span className="warn" data-warn="fechas">
              ⚠ {e.warn}
            </span>
          ) : null}
          <span className="meta">{srcButton(headerId, e.src)}</span>
        </div>
        <div className={fragClass(headerId)} id={`${headerId}-frag`} data-frag={headerId}>
          {e.frag}
        </div>
        {e.bullets.map((b, j) => {
          const bid = `it-exp-${i}-b-${j}`;
          return (
            <Fragment key={bid}>
              <div className="ms-b" data-item data-num={String(b.num)}>
                <span
                  className="tx"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  role="textbox"
                  aria-label="Editar viñeta"
                  onBlur={() => markTouched(bid)}
                >
                  {wrapNums(b.tx)}
                </span>
                {nudge(b)}
                {srcButton(bid, b.src)}
              </div>
              <div className={fragClass(bid)} id={`${bid}-frag`} data-frag={bid}>
                {bulletFrag(b.src)}
              </div>
            </Fragment>
          );
        })}
      </article>
    );
  };

  const skillCard = (s: Skill, i: number): ReactNode => (
    <div className="ms-sk" data-item data-ver={s.ver} key={`sk-${i}`}>
      <div className="top">
        <span className="nm">{s.n}</span>
        <span className={`c-ver c-ver--${s.ver}`}>
          {s.ver === "ok" ? "verificado" : s.ver === "partial" ? "parcial" : "sin evidencia"}
        </span>
      </div>
      <div className="ev">{s.ev}</div>
      {s.ask ? (
        <>
          <hr />
          <div className="ask">
            {s.ask}{" "}
            <button type="button">responder — quedará como origen: tú</button>
          </div>
        </>
      ) : null}
    </div>
  );

  const denseRow = (r: Row, key: string): ReactNode => (
    <div className="ms-row" data-item key={key}>
      <span contentEditable suppressContentEditableWarning spellCheck={false} role="textbox" aria-label="Editar elemento">
        {r.tx}
      </span>
      <span className="m">{r.m}</span>
    </div>
  );

  return (
    <div className="c-page">
      <header className="c-header">
        <div className="c-container">
          <Link className="c-logo" href="/app">
            Corpus
          </Link>
          <nav className="hd-nav">
            <Link href="/app">Panel</Link>
            <Link href="/app/master" aria-current="page">
              Master
            </Link>
            <Link href="/app/variantes">Variantes</Link>
            <Link href="/app/fuentes">Fuentes</Link>
          </nav>
          <div className="hd-right">
            <Link href="/app/ajustes" className="hd-nav" style={{ display: "inline-flex" }}>
              <span
                style={{
                  font: "500 var(--fs-ui)/1 var(--font-sans)",
                  color: "var(--text-muted)",
                  padding: "9px 12px",
                }}
              >
                Ajustes
              </span>
            </Link>
            <div className="hd-lang">
              <span data-on>ES</span>
              <span>EN</span>
            </div>
            <div className="hd-av">DG</div>
          </div>
        </div>
      </header>

      <div className="ms-sub" data-screen-label="master-toolbar">
        <div className="c-container">
          <input
            className="c-input"
            id="q"
            aria-label="Buscar en tu registro"
            placeholder="Buscar en tu registro… (título, viñeta, skill)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="ms-f" role="group" aria-label="Filtros">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                data-f={f.key}
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="n" id="msN" aria-live="polite">
            {msNText}
          </span>
        </div>
      </div>

      <main className="ms-main c-wall" data-screen-label="master" ref={mainRef}>
        <div className="c-container" id="body">
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <p style={{ color: "var(--text-muted)", fontSize: "var(--fs-ui)", maxWidth: "64ch" }}>
              Tu archivo completo — aquí caben los 14 proyectos aunque cada variante muestre 3.{" "}
              <b style={{ color: "var(--text)", fontWeight: 500 }}>
                Haz clic en cualquier texto y edítalo ahí mismo
              </b>
              ; cada item recuerda de dónde salió.
            </p>
            <button type="button" className="c-btn" id="btnAdd" onClick={handleAdd}>
              + Añadir item manual
            </button>
          </div>

          <div id="groups" ref={groupsRef}>
            {isEmpty ? null : (
              <>
                {groupSection(
                  "resumen",
                  "Resumen",
                  "1 item",
                  <div className="c-card ms-card">
                    <div className="ms-b" data-item>
                      <span
                        className="tx"
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck={false}
                        role="textbox"
                        aria-label="Editar resumen"
                        onBlur={() => markTouched("it-resumen")}
                      >
                        Backend developer con 6 años construyendo servicios de pago y e-commerce en Go y
                        Node.js. A cargo del servicio de conciliación de Altiplano Pagos (
                        <span className="t-num">~40.000</span> transacciones diarias).
                      </span>
                      {srcButton("it-resumen", "man")}
                    </div>
                    <div className={fragClass("it-resumen")} id="it-resumen-frag" data-frag="it-resumen">
                      escrito por ti (onboarding) —{" "}
                      <mark>el origen manual es el más verificable de todos</mark>.
                    </div>
                  </div>,
                )}

                {groupSection(
                  "experiencia",
                  "Experiencia",
                  `${EXP.length} roles · ${totalBullets} viñetas`,
                  <>
                    {EXP.map((e, i) => roleCard(e, i))}
                    <button type="button" className="ms-add">
                      + añadir rol
                    </button>
                  </>,
                )}

                {SK.length > 0 &&
                  groupSection(
                    "skills",
                    "Skills — con su evidencia",
                    `${SK.length} items`,
                    <>
                      <div className="ms-skills">{SK.map((s, i) => skillCard(s, i))}</div>
                      <button type="button" className="ms-add">
                        + añadir skill (quedará como origen: tú)
                      </button>
                    </>,
                  )}

                {PJ.length > 0 &&
                  groupSection(
                    "proyectos",
                    "Proyectos",
                    `${PJ.length} items — cada variante elige los suyos`,
                    <div className="ms-rows">{PJ.map((p, i) => denseRow(p, `pj-${i}`))}</div>,
                  )}

                {ED.length > 0 &&
                  groupSection(
                    "educacion",
                    "Educación y certificaciones",
                    `${ED.length} items`,
                    <div className="ms-rows">{ED.map((d, i) => denseRow(d, `ed-${i}`))}</div>,
                  )}
              </>
            )}
          </div>

          <span ref={liveRef} className="ms-sr" aria-live="polite" />

          <div className="ms-empty" id="msEmpty" hidden={!isEmpty}>
            <span className="t-overline">Master vacío</span>
            <h2 style={{ marginTop: "14px" }}>Aún no hay registro.</h2>
            <p>Vuélcalo con IA en 5 minutos, o escríbelo de cero con la IA apagada.</p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "24px" }}>
              <Link className="c-btn c-btn--patina" href="/app/importar">
                Volcar lo que tengo
              </Link>
              <Link className="c-btn" href="/app/onboarding">
                Escribir de cero
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
