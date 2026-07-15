"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useBoot } from "@/lib/corpus/runtime";
import "./editor-variante.css";

/* ============================================================================
   Editor de variante — porte de corpus-design/04-pantallas/editor-variante.html
   (ver docs/spec/pantallas/editor-variante.md). LA PANTALLA MÁS IMPORTANTE.

   MURO: no monta la aurora ("donde hay trabajo, el trabajo gana"). Por eso NO
   se importa ni renderiza <Aurora>.

   Tres columnas: biblioteca del master (referencia) · composición de la variante
   (incluir / ocultar / afinar / reordenar, con override por campo) · preview que
   ES el PDF (mismo motor, misma paginación real medida en el DOM) con su rayos-X.

   Fidelidad crítica (spec §6.3, Anexo):
   - La paginación es MEDICIÓN REAL: div fuera de pantalla, width 664px,
     display:flow-root, PAGE_H = 1056 − 68·2 = 920. Nunca se recorta contenido.
   - El rayos-X se genera del ESTADO, no del DOM (los runs pegados son el bug que
     el producto denuncia).
   - textOf(): el override gana siempre; si el texto vuelve a igualar al master,
     el override se elimina solo.
   - Añadir una viñeta arrastra su experiencia padre.
   - El drag & drop solo reordena dentro de la misma experiencia.
   - .var-orig es el hermano ADYACENTE de .var-b (.var-b.ovr + .var-orig).

   El panel .demo del HTML NO se porta (convención de entrega). Sus cinco estados
   (normal · rayos-x · override · 3 páginas · vacía) son alcanzables como producto
   real: el toggle Documento/ATS, editar un campo, vaciar la variante o dejar que
   el contenido rebase a 3 páginas los producen sin botón de atajo.
   ============================================================================ */

// ── EL MASTER (biblioteca canónica; ids estables) ──────────────────────────
interface MExp {
  id: string;
  tt: string;
  org: string;
  loc: string;
  dates: string;
  bullets: { id: string; tx: string }[];
}
interface MSkill {
  id: string;
  g: string;
  tx: string;
}
interface MProj {
  id: string;
  tx: string;
}
interface MEdu {
  id: string;
  tt: string;
  org: string;
  dates: string;
}

const MASTER = {
  summary: {
    id: "sum",
    tx: "Backend developer con 6 años construyendo servicios de pago y e-commerce en Go y Node.js. A cargo del servicio de conciliación de Altiplano Pagos (~40.000 transacciones diarias). Busco problemas de plataforma con datos de verdad.",
  },
  exp: [
    {
      id: "e1",
      tt: "Backend Developer",
      org: "Altiplano Pagos SpA",
      loc: "Santiago, Chile",
      dates: "mar 2022 – hoy",
      bullets: [
        { id: "b1", tx: "A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias)." },
        { id: "b4", tx: "Escribí la librería interna de idempotencia (Go) adoptada por otros equipos de la empresa." },
        { id: "b5", tx: "Mantengo los pipelines de CI/CD del equipo (GitHub Actions)." },
        { id: "b7", tx: "Documenté la API pública de conciliación (OpenAPI 3.1)." },
        { id: "b8", tx: "Mentoreo a 2 desarrolladores junior del equipo de pagos." },
        { id: "b6", tx: "Turno de soporte (on-call) una semana al mes." },
      ],
    },
    {
      id: "e2",
      tt: "Backend Developer — equipo Checkout",
      org: "Rayén Retail S.A.",
      loc: "Santiago, Chile",
      dates: "ene 2020 – feb 2022",
      bullets: [
        { id: "b9", tx: "Desarrollé y mantuve APIs del checkout (Node.js, PostgreSQL)." },
        { id: "b13", tx: "Implementé el flujo de cupones y descuentos del checkout." },
        { id: "b12", tx: "Atendí incidentes de producción durante cyber days." },
        { id: "b14", tx: "Automaticé reportes de ventas diarios para operaciones." },
      ],
    },
    {
      id: "e3",
      tt: "Desarrollador freelance",
      org: "Independiente",
      loc: "Santiago, Chile",
      dates: "2019 – 2020",
      bullets: [
        { id: "b16", tx: "Construí sitios y APIs para 4 pymes chilenas." },
        { id: "b17", tx: "Sistema de reservas para un centro deportivo (Django)." },
        { id: "b19", tx: "Administré hosting y dominios de clientes." },
      ],
    },
    {
      id: "e4",
      tt: "Práctica profesional — Área TI",
      org: "Universidad Andrés Bello",
      loc: "Santiago, Chile",
      dates: "2018 – 2019",
      bullets: [
        { id: "b21", tx: "Soporte a la plataforma de matrícula en periodos peak." },
        { id: "b22", tx: "Scripts de migración de datos de alumnos (Python)." },
        { id: "b24", tx: "Documenté procesos del área para nuevos practicantes." },
      ],
    },
  ] as MExp[],
  skills: [
    { id: "s1", g: "Lenguajes", tx: "Go, Python, SQL, TypeScript" },
    { id: "s2", g: "Backend", tx: "PostgreSQL, Redis, gRPC, OpenAPI, Node.js, Django" },
    { id: "s3", g: "Plataforma", tx: "Docker, GitHub Actions, Linux, Bash" },
    { id: "s4", g: "Idiomas", tx: "Español nativo, Inglés B2" },
  ] as MSkill[],
  proj: [
    { id: "p1", tx: "idempotency-go — librería open source de idempotencia en Go (github.com/dgatica)." },
    { id: "p2", tx: "reservas-club — sistema de reservas en Django, en producción desde 2020 (dgatica.cl)." },
    { id: "p3", tx: "scraper-sii — CLI en Python para series de tipo de cambio del SII." },
  ] as MProj[],
  edu: [
    { id: "ed1", tt: "Ingeniería Civil en Computación e Informática", org: "Universidad Andrés Bello", dates: "2014 – 2019" },
    { id: "ed2", tt: "Diplomado en Ingeniería de Datos", org: "Pontificia Universidad Católica de Chile", dates: "2022" },
  ] as MEdu[],
};

const BASICS = {
  name: "Diego Gatica Morales",
  email: "diego.gatica@ejemplo.cl",
  tel: "+56 9 6123 4567",
  loc: "Santiago, Chile",
  web: "dgatica.cl",
  gh: "github.com/dgatica",
};

// Índice plano: a cada viñeta se le añade `exp` (id de su experiencia padre).
const byId: Record<string, { tx?: string; exp?: string }> = {};
MASTER.exp.forEach((e) => {
  byId[e.id] = {};
  e.bullets.forEach((b) => (byId[b.id] = { tx: b.tx, exp: e.id }));
});
MASTER.skills.forEach((s) => (byId[s.id] = { tx: s.tx }));
MASTER.proj.forEach((p) => (byId[p.id] = { tx: p.tx }));
MASTER.edu.forEach((d) => (byId[d.id] = {}));
byId.sum = { tx: MASTER.summary.tx };

// El "N items — tu biblioteca" se DERIVA del master real (spec §10): nunca un
// literal a mano. Aquí = filas que produce la biblioteca (sum + cabeceras de
// experiencia + viñetas + skills + proyectos + educación).
const LIB_COUNT =
  1 +
  MASTER.exp.reduce((n, e) => n + 1 + e.bullets.length, 0) +
  MASTER.skills.length +
  MASTER.proj.length +
  MASTER.edu.length;

// El estado inicial de la variante (referencia + overrides + ocultos + orden).
const INITIAL_INC = [
  "sum", "e1", "b1", "b4", "b5", "b8", "b6", "b7", "e2", "b9", "b13", "b12", "b14",
  "e3", "b16", "b17", "e4", "b21", "b22", "s1", "s2", "s3", "s4", "p1", "p2", "p3", "ed1", "ed2",
];

// Carta 816×1056 @96dpi, márgenes 68/76 → 920px de caja útil.
const PAGE_H = 1056 - 68 * 2;

const textOf = (id: string, ovr: Record<string, string>): string =>
  ovr[id] != null ? ovr[id] : (byId[id]?.tx ?? "");

// Viñetas incluidas de la experiencia `e`, aplicando VAR.order[e.id] si existe
// (ids reordenados primero, los no listados después).
function bulletsOf(e: MExp, inc: Set<string>, order: Record<string, string[]>): string[] {
  const base = e.bullets.map((b) => b.id).filter((id) => inc.has(id));
  const ord = order[e.id];
  if (!ord) return base;
  return [...ord.filter((id) => base.includes(id)), ...base.filter((id) => !ord.includes(id))];
}

const numWrap = (t: string): string => t.replace(/(\d[\d.,%~½]*)/g, '<span class="num">$1</span>');

// ── Bloques del documento → HTML (mismo granulado que el original: el corte de
//    página ocurre ENTRE bloques). El preview ES el PDF. ──
function buildBlocks(
  inc: Set<string>,
  hid: Set<string>,
  ovr: Record<string, string>,
  order: Record<string, string[]>,
  obj: string,
): string[] {
  const B: string[] = [];
  B.push(
    '<div class="cvd-name">' + BASICS.name + '</div><div class="cvd-label">' + (obj || "") + "</div>" +
      '<div class="cvd-contact">Email: ' + BASICS.email + " · Tel: " + BASICS.tel + " · " + BASICS.loc +
      "<br>" + BASICS.gh + " · " + BASICS.web + "</div>",
  );
  if (inc.has("sum") && !hid.has("sum"))
    B.push('<div class="cvd-h">Resumen</div><p class="cvd-sum">' + textOf("sum", ovr) + "</p>");
  const sks = MASTER.skills.filter((s) => inc.has(s.id));
  if (sks.length)
    B.push(
      '<div class="cvd-h">Habilidades</div>' +
        sks.map((s) => '<p class="cvd-skline"><b>' + s.g + ":</b> " + s.tx + "</p>").join(""),
    );
  const exps = MASTER.exp.filter((e) => inc.has(e.id));
  if (exps.length) {
    B.push('<div class="cvd-h">Experiencia</div>');
    exps.forEach((e) => {
      B.push(
        '<div class="cvd-erow"><span class="t">' + e.tt + " — " + e.org + '</span><span class="d">' + e.dates +
          '</span></div><div class="cvd-org">' + e.loc + "</div>",
      );
      bulletsOf(e, inc, order)
        .filter((id) => !hid.has(id))
        .forEach((id) => B.push('<p class="cvd-b">• ' + numWrap(textOf(id, ovr)) + "</p>"));
    });
  }
  const pjs = MASTER.proj.filter((p) => inc.has(p.id) && !hid.has(p.id));
  if (pjs.length)
    B.push('<div class="cvd-h">Proyectos</div>' + pjs.map((p) => '<p class="cvd-b">• ' + textOf(p.id, ovr) + "</p>").join(""));
  const eds = MASTER.edu.filter((d) => inc.has(d.id));
  if (eds.length) {
    B.push('<div class="cvd-h">Educación</div>');
    eds.forEach((d) =>
      B.push(
        '<div class="cvd-erow"><span class="t">' + d.tt + '</span><span class="d">' + d.dates +
          '</span></div><div class="cvd-org">' + d.org + "</div>",
      ),
    );
  }
  return B;
}

// ── Rayos-X: texto plano en el ORDEN del documento, generado del ESTADO ──
function buildRaw(
  inc: Set<string>,
  hid: Set<string>,
  ovr: Record<string, string>,
  order: Record<string, string[]>,
  obj: string,
): string {
  const L: string[] = [];
  L.push(BASICS.name);
  const o = obj.trim();
  if (o) L.push(o);
  L.push("Email: " + BASICS.email + " · Tel: " + BASICS.tel + " · " + BASICS.loc);
  L.push(BASICS.gh + " · " + BASICS.web, "");
  if (inc.has("sum") && !hid.has("sum")) L.push("RESUMEN", textOf("sum", ovr), "");
  const sks = MASTER.skills.filter((s) => inc.has(s.id));
  if (sks.length) {
    L.push("HABILIDADES");
    sks.forEach((s) => L.push(s.g + ": " + s.tx));
    L.push("");
  }
  const exps = MASTER.exp.filter((e) => inc.has(e.id));
  if (exps.length) {
    L.push("EXPERIENCIA");
    exps.forEach((e) => {
      L.push(e.tt + " — " + e.org + "   " + e.dates, e.loc);
      bulletsOf(e, inc, order)
        .filter((id) => !hid.has(id))
        .forEach((id) => L.push("• " + textOf(id, ovr)));
      L.push("");
    });
  }
  const pjs = MASTER.proj.filter((p) => inc.has(p.id) && !hid.has(p.id));
  if (pjs.length) {
    L.push("PROYECTOS");
    pjs.forEach((p) => L.push("• " + textOf(p.id, ovr)));
    L.push("");
  }
  const eds = MASTER.edu.filter((d) => inc.has(d.id));
  if (eds.length) {
    L.push("EDUCACIÓN");
    eds.forEach((d) => L.push(d.tt + "   " + d.dates, d.org));
  }
  const body = L.join("\n").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return '<span class="cap">texto extraído del PDF — esto es lo que indexa el reclutador</span>' + body;
}

// Ejecuta layout-effect en cliente sin avisar en SSR.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Mode = "doc" | "raw";
type View = "master" | "mid" | "preview";

export function EditorVarianteScreen({ variantId = "backend-fintech" }: { variantId?: string } = {}) {
  // La variante: referencia + overrides + ocultos + orden.
  const [inc, setInc] = useState<Set<string>>(() => new Set(INITIAL_INC));
  const [hid, setHid] = useState<Set<string>>(() => new Set());
  const [ovr, setOvr] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<Record<string, string[]>>({});
  const [obj, setObj] = useState("Backend Engineer"); // #objInput — alimenta .cvd-label y el rayos-X

  const [libQ, setLibQ] = useState("");
  const [mode, setMode] = useState<Mode>("doc");
  const [view, setView] = useState<View>("mid");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Barra de estado (#edState): live region, con flash reentrante a 2600 ms.
  const [stMsg, setStMsg] = useState("al día · guardado");
  const [stAccent, setStAccent] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pvScrollRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLSpanElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const bootRef = useBoot<HTMLDivElement>(); // no-op defensivo: no hay reveals aquí

  const flash = useCallback((msg: string) => {
    setStMsg(msg);
    setStAccent(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setStMsg("al día · guardado");
      setStAccent(false);
    }, 2600);
  }, []);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // ── Paginación real (medición en el DOM). El error posible queda del lado
  //    honesto: nunca se recorta contenido. ──
  const [pages, setPages] = useState<string[]>([]);
  const [scale, setScale] = useState(1);

  const recompute = useCallback(() => {
    const blks = buildBlocks(inc, hid, ovr, order, obj);
    const meas = document.createElement("div");
    meas.style.cssText = "position:absolute;visibility:hidden;left:-9999px;top:0;width:664px";
    const inner = document.createElement("div");
    inner.style.cssText = "display:flow-root;width:664px;font:400 13.3px/1.5 var(--font-sans)";
    meas.appendChild(inner);
    document.body.appendChild(meas);
    const pagesArr: string[][] = [[]];
    blks.forEach((html) => {
      inner.insertAdjacentHTML("beforeend", html);
      if (inner.scrollHeight > PAGE_H && pagesArr[pagesArr.length - 1].length) {
        pagesArr.push([]);
        inner.innerHTML = html;
      }
      pagesArr[pagesArr.length - 1].push(html);
    });
    meas.remove();
    const sc = Math.min(1, ((pvScrollRef.current?.clientWidth || 470) - 36) / 816);
    setPages(pagesArr.map((pg) => pg.join("")));
    setScale(sc);
  }, [inc, hid, ovr, order, obj]);

  const computeRef = useRef(recompute);
  computeRef.current = recompute;

  useIsoLayoutEffect(() => {
    recompute();
  }, [recompute]);

  // resize + carga de fuentes → re-paginar (spec §6.3/§Riesgos: sin fuentes la
  // medición miente; el scale depende del ancho de .pv-scroll).
  useEffect(() => {
    const run = () => computeRef.current();
    const el = pvScrollRef.current;
    const ro = el ? new ResizeObserver(run) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener("resize", run);
    let cancelled = false;
    if (typeof document !== "undefined" && document.fonts?.ready)
      document.fonts.ready.then(() => { if (!cancelled) run(); });
    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      window.removeEventListener("resize", run);
    };
  }, []);

  const rawHtml = useMemo(() => buildRaw(inc, hid, ovr, order, obj), [inc, hid, ovr, order, obj]);
  const pageCount = pages.length;
  const docHeight = pageCount * (1056 + 30) * scale;

  // ── Acciones de estado ─────────────────────────────────────────────────────
  const addLib = useCallback((id: string) => {
    setInc((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
        const parent = byId[id]?.exp; // añadir una viñeta arrastra su experiencia padre
        if (parent) n.add(parent);
      }
      return n;
    });
  }, []);

  const removeInc = useCallback((id: string) => {
    setInc((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  }, []);

  const toggleHide = useCallback((id: string) => {
    setHid((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const revert = useCallback(
    (id: string) => {
      setOvr((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      flash("override revertido — vuelve a seguir al master");
    },
    [flash],
  );

  const startEdit = useCallback((id: string) => setEditingId(id), []);

  // Al entrar en edición: enfocar y seleccionar todo (como el original).
  useEffect(() => {
    if (!editingId) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (sel) {
      sel.selectAllChildren(el);
      sel.collapseToEnd();
    }
  }, [editingId]);

  const finishEdit = useCallback(() => {
    const id = editingId;
    const el = editRef.current;
    if (!id || !el) {
      setEditingId(null);
      return;
    }
    const v = (el.textContent ?? "").trim();
    const masterTx = byId[id]?.tx;
    if (v && v !== masterTx) {
      setOvr((prev) => ({ ...prev, [id]: v }));
      flash("override guardado — solo en esta variante");
    } else if (v === masterTx) {
      setOvr((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    }
    setEditingId(null);
  }, [editingId, flash]);

  const onEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }, []);

  // ── Drag & drop: reordenar SOLO dentro de la misma experiencia ──
  const onDragStart = useCallback((id: string) => {
    dragIdRef.current = id;
    setDraggingId(id);
  }, []);
  const onDragEnd = useCallback(() => {
    dragIdRef.current = null;
    setDraggingId(null);
  }, []);
  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, overId: string) => {
      const dragId = dragIdRef.current;
      if (!dragId || overId === dragId) return;
      const de = byId[dragId];
      const oe = byId[overId];
      if (!de || !oe || de.exp !== oe.exp || !de.exp) return; // solo dentro de su experiencia
      e.preventDefault();
      const exp = MASTER.exp.find((x) => x.id === de.exp);
      if (!exp) return;
      const ordArr = bulletsOf(exp, inc, order).filter((id) => id !== dragId);
      const idx = ordArr.indexOf(overId);
      const r = e.currentTarget.getBoundingClientRect();
      ordArr.splice(e.clientY < r.top + r.height / 2 ? idx : idx + 1, 0, dragId);
      setOrder((prev) => ({ ...prev, [exp.id]: ordArr }));
    },
    [inc, order],
  );

  // ── Render de una viñeta (.var-b + su .var-orig adyacente si hay override) ──
  // Función de render (no componente anidado) para no remontar el nodo editable.
  const renderBullet = (id: string) => {
    const ov = ovr[id] != null;
    const hidden = hid.has(id);
    const editing = editingId === id;
    return (
      <Fragment key={id}>
        <div
          className={"var-b" + (ov ? " ovr" : "") + (hidden ? " hid" : "") + (draggingId === id ? " dragging" : "")}
          data-b={id}
          draggable={!editing}
          onDragStart={() => onDragStart(id)}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, id)}
        >
          <span className="grip" title="arrastra para reordenar" aria-hidden="true">
            ⠿
          </span>
          <span
            className="tx"
            data-edit=""
            contentEditable={editing}
            suppressContentEditableWarning
            ref={editing ? editRef : undefined}
            onBlur={editing ? finishEdit : undefined}
            onKeyDown={editing ? onEditKeyDown : undefined}
          >
            {textOf(id, ovr)}
          </span>
          <span className="bacts">
            <button type="button" data-a="hide" title="ocultar en esta variante" onClick={() => toggleHide(id)}>
              {hidden ? "mostrar" : "👁 ocultar"}
            </button>
            <button type="button" data-a="edit" title="afinar solo aquí" onClick={() => startEdit(id)}>
              afinar
            </button>
            <button type="button" data-a="out" title="quitar de la variante" onClick={() => removeInc(id)}>
              ×
            </button>
          </span>
        </div>
        {ov && (
          <div className="var-orig">
            <span>original: {byId[id]?.tx}</span>
            <button type="button" className="rv" data-rv={id} onClick={() => revert(id)}>
              revertir
            </button>
          </div>
        )}
      </Fragment>
    );
  };

  // ── Biblioteca (master): filas filtradas por substring del texto visible ──
  const q = libQ.trim().toLowerCase();
  const libRow = (id: string, text: string, node?: React.ReactNode) => {
    if (q && !text.toLowerCase().includes(q)) return null;
    const inV = inc.has(id);
    return (
      <div className={"lib-row" + (inV ? " in" : "")} data-lib={id} key={id}>
        <span className="tx">{node ?? text}</span>
        <button
          type="button"
          className="add"
          title={inV ? "quitar de la variante" : "añadir a la variante"}
          aria-pressed={inV}
          onClick={() => addLib(id)}
        >
          {inV ? "✓" : "+"}
        </button>
      </div>
    );
  };

  const exps = MASTER.exp.filter((e) => inc.has(e.id));
  const sks = MASTER.skills.filter((s) => inc.has(s.id));
  const pjs = MASTER.proj.filter((p) => inc.has(p.id));
  const eds = MASTER.edu.filter((d) => inc.has(d.id));

  const midN = inc.size + " referencias · " + Object.keys(ovr).length + " overrides";

  const setTab = (v: View) => setView(v);

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
            <Link href="/app/variantes" aria-current="page">
              Variantes
            </Link>
            <Link href="/app/fuentes">Fuentes</Link>
          </nav>
          <div className="hd-right">
            <Link href="/app/cuenta" className="hd-nav" style={{ display: "inline-flex" }}>
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

      <div className="ed-bar" data-screen-label="editor-toolbar">
        <div className="c-container">
          <Link className="bk" href="/app/variantes">
            ← Variantes
          </Link>
          <span style={{ width: "1px", height: "16px", background: "var(--border-strong)" }} />
          <span className="nm" contentEditable suppressContentEditableWarning spellCheck={false} aria-label="Nombre de la variante">
            Backend — Fintech
          </span>
          <span className="st" id="edState" role="status" style={stAccent ? { color: "var(--accent-text)" } : undefined}>
            {stMsg}
          </span>
          <span className="acts">
            <Link className="c-btn c-btn--quiet" href={`/app/variantes/${variantId}/tailor`}>
              Adaptar a un aviso
            </Link>
            <Link className="c-btn c-btn--quiet" href={`/app/variantes/${variantId}/salud`}>
              Salud
            </Link>
            <button
              type="button"
              className="c-btn c-btn--patina"
              id="btnPdf"
              onClick={() => flash("el PDF se genera del mismo estado que ves — sin sorpresas")}
            >
              Descargar PDF
            </button>
          </span>
        </div>
      </div>

      <div className="ed-tabs" role="group" aria-label="Vista de columna">
        <button type="button" data-view="master" aria-pressed={view === "master"} onClick={() => setTab("master")}>
          Master
        </button>
        <button type="button" data-view="mid" aria-pressed={view === "mid"} onClick={() => setTab("mid")}>
          Esta variante
        </button>
        <button type="button" data-view="preview" aria-pressed={view === "preview"} onClick={() => setTab("preview")}>
          Preview
        </button>
      </div>

      <div className="ed-grid c-wall" id="edGrid" data-view={view} data-screen-label="editor-3-paneles" ref={bootRef}>
        {/* ── MASTER (biblioteca) ── */}
        <aside className="ed-col ed-col--lib" data-screen-label="editor-master">
          <div className="ed-colh">
            <span className="t-overline">Master</span>
            <span className="n">{LIB_COUNT} items — tu biblioteca</span>
          </div>
          <div className="lib-search">
            <input
              className="c-input"
              id="libQ"
              placeholder="Buscar en tu master…"
              aria-label="Buscar en tu master"
              value={libQ}
              onChange={(e) => setLibQ(e.target.value)}
            />
          </div>
          <div id="lib">
            <div className="lib-g">
              <span className="t-overline">Resumen</span>
              {libRow("sum", MASTER.summary.tx.slice(0, 80) + "…")}
            </div>
            <div className="lib-g">
              <span className="t-overline">Experiencia · viñetas</span>
              {MASTER.exp.map((e) => (
                <Fragment key={e.id}>
                  {libRow(e.id, e.tt + " · " + e.org, (
                    <>
                      <b style={{ color: "var(--text)" }}>{e.tt}</b> · {e.org}
                    </>
                  ))}
                  {e.bullets.map((b) => libRow(b.id, b.tx))}
                </Fragment>
              ))}
            </div>
            <div className="lib-g">
              <span className="t-overline">Skills</span>
              {MASTER.skills.map((s) =>
                libRow(s.id, s.g + ": " + s.tx, (
                  <>
                    <b style={{ color: "var(--text)" }}>{s.g}:</b> {s.tx}
                  </>
                )),
              )}
            </div>
            <div className="lib-g">
              <span className="t-overline">Proyectos</span>
              {MASTER.proj.map((p) => libRow(p.id, p.tx))}
            </div>
            <div className="lib-g">
              <span className="t-overline">Educación</span>
              {MASTER.edu.map((d) => libRow(d.id, d.tt + " · " + d.org))}
            </div>
          </div>
          <p style={{ margin: "20px 18px 30px", font: "400 10px/1.7 var(--font-mono)", color: "var(--text-subtle)" }}>
            Aquí vive todo. La variante solo <b style={{ color: "var(--text-muted)" }}>referencia</b> — si editas el
            master, las variantes se actualizan solas.
          </p>
        </aside>

        {/* ── ESTA VARIANTE (composición) ── */}
        <section className="ed-col ed-col--mid" data-screen-label="editor-composicion">
          <div className="ed-colh">
            <span className="t-overline">Esta variante</span>
            <span className="n" id="midN">
              {midN}
            </span>
          </div>
          <div className="c-card var-obj">
            <label htmlFor="objInput">
              Título objetivo{" "}
              <span style={{ letterSpacing: 0, textTransform: "none", color: "var(--text-subtle)" }}>
                — el campo que más pesa
              </span>
            </label>
            <input
              className="c-input"
              id="objInput"
              value={obj}
              spellCheck={false}
              onChange={(e) => setObj(e.target.value)}
            />
            <p className="hint">
              Si coincide con el título del aviso: <b>10,6× más entrevistas</b> [Jobscan, 2,5M postulaciones]. Honesto
              y con tu cargo real al lado: «Backend Engineer (Ingeniero de Software III)».
            </p>
          </div>

          <div id="mid">
            {inc.has("sum") && (
              <div className="var-g">
                <div className="gh">
                  <span className="t-overline">Resumen</span>
                </div>
                <div className="var-exp">{renderBullet("sum")}</div>
              </div>
            )}

            {exps.length > 0 && (
              <div className="var-g">
                <div className="gh">
                  <span className="t-overline">Experiencia</span>
                  <span className="n">las fechas vienen del master</span>
                </div>
                {exps.map((e) => (
                  <div className="var-exp" data-exp={e.id} key={e.id}>
                    <div className="var-eh">
                      <span className="tt">{e.tt}</span>
                      <span className="org">
                        {e.org} · {e.dates}
                      </span>
                    </div>
                    {bulletsOf(e, inc, order).map((id) => renderBullet(id))}
                  </div>
                ))}
              </div>
            )}

            {sks.length > 0 && (
              <div className="var-g">
                <div className="gh">
                  <span className="t-overline">Habilidades</span>
                </div>
                <div className="var-chips">
                  {sks.map((s) => (
                    <span className="c-chip" key={s.id}>
                      <b>{s.g}</b> {s.tx.split(",").length} items
                      <button type="button" data-out={s.id} title="quitar" onClick={() => removeInc(s.id)}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {pjs.length > 0 && (
              <div className="var-g">
                <div className="gh">
                  <span className="t-overline">Proyectos</span>
                </div>
                <div className="var-exp">{pjs.map((p) => renderBullet(p.id))}</div>
              </div>
            )}

            {eds.length > 0 && (
              <div className="var-g">
                <div className="gh">
                  <span className="t-overline">Educación</span>
                </div>
                <div className="var-exp">
                  {eds.map((d) => (
                    <div className="var-b" data-b={d.id} key={d.id}>
                      <span className="grip" aria-hidden="true">
                        ⠿
                      </span>
                      <span className="tx">
                        {d.tt} — {d.org} · {d.dates}
                      </span>
                      <span className="bacts">
                        <button type="button" data-a="out" title="quitar de la variante" onClick={() => removeInc(d.id)}>
                          ×
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="var-empty" id="midEmpty" hidden={inc.size > 0}>
            <span className="t-overline">Variante vacía</span>
            Elige del master qué cuenta esta variante.
            <br />
            Pulsa <b>+</b> en la biblioteca — nada se copia: se referencia.
          </div>
          <div style={{ height: "40px" }} />
        </section>

        {/* ── PREVIEW: el preview ES el PDF ── */}
        <section className="ed-col pv-col" data-screen-label="editor-preview">
          <div className="pv-tools">
            <div className="pv-seg" role="group" aria-label="Vista del documento">
              <button type="button" id="segDoc" aria-pressed={mode === "doc"} onClick={() => setMode("doc")}>
                Documento
              </button>
              <button type="button" id="segRaw" aria-pressed={mode === "raw"} onClick={() => setMode("raw")}>
                Cómo lo lee el ATS
              </button>
            </div>
            <span className="pv-pages" id="pvPages">
              {pageCount <= 2 ? (
                "pág " + Math.min(pageCount, 1) + " / " + pageCount
              ) : (
                <span className="warn">⚠ {pageCount} páginas — la página 3 no existe para el reclutador [Ladders]</span>
              )}
            </span>
          </div>
          <div className="pv-scroll" ref={pvScrollRef}>
            <div className="pv-fit c-xray" id="xray" data-mode={mode}>
              <div className="c-xray__doc pv-doc" id="pvDoc" style={{ height: docHeight ? docHeight + "px" : undefined }}>
                <div className="pv-pagewrap" style={{ transform: `scale(${scale})`, width: "816px" }}>
                  {pages.map((html, i) => (
                    <div className={"pv-page" + (i >= 2 ? " pv-p3" : "")} key={i}>
                      <span className="pv-pnum">pág {i + 1}</span>
                      <div className="inner" dangerouslySetInnerHTML={{ __html: html }} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="c-xray__raw" id="pvRawWrap" style={{ width: "100%" }}>
                <div className="pv-raw" id="pvRaw" dangerouslySetInnerHTML={{ __html: rawHtml }} />
              </div>
            </div>
          </div>
          <div className="pv-foot">
            El preview ES el PDF: mismo motor, mismos cortes de página. Si el preview miente, el producto miente.
          </div>
        </section>
      </div>
    </div>
  );
}
