"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "./staging.css";

/* ============================================================================
   Staging — porte de corpus-design/04-pantallas/staging.html
   (ver docs/spec/pantallas/staging.md). MURO: aquí se trabaja, NO monta aurora.

   Paso 2 de 2 de la ingesta: revisar item por item los 61 pendientes, con la
   evidencia (el fragmento de origen) a un clic, y decidir qué entra al master.
   Nada entra sin confirmación. Los lotes solo tocan lo verificado.

   Fidelidad:
   - Clases sin renombrar (contrato diseño↔código); CSS de pantalla verbatim.
   - Procedencia por item · niveles verificado/parcial/sin-evidencia (glifo+palabra).
   - Interacciones REALES con estado React: filtros, aceptar/descartar con deshacer,
     lotes por grupo y global, abrir origen, editar en sitio, promover hueco a
     origen manual (none→ok), fusión de duplicado campo por campo, teclado j/k/a/d/o.
   - Contadores derivados de los datos (no hardcodeados) y animados con
     CorpusMotion.counter hacia el número REAL.
   - El panel .demo del HTML NO se porta (convención de entrega, no producto).
   ============================================================================ */

type Ver = "ok" | "partial" | "none";
type Src = "tx" | "gh" | "web" | "cv" | "q";
type Kind = "acc" | "dis";
type GroupId = "exp" | "sk" | "pj" | "ct";

interface Bullet {
  id: string;
  tx: string; // puede contener <span class="t-num">…</span>
  ver: Ver;
  src: Src;
  frag: string; // puede contener <mark>…</mark>
  ask?: string;
}
interface Exp {
  id: string;
  tt: string;
  org: string;
  ver: Ver;
  src: Src;
  frag: string;
  bullets: Bullet[];
}
interface DupSide {
  src: string;
  cargo: string;
  fechas: string;
  vin: string;
}
interface Dup {
  id: "e2";
  anchor: string;
  tt: string;
  why: string;
  a: DupSide;
  b: DupSide;
  bullets: Bullet[];
}
interface Dense {
  n: string;
  ev: string;
  ver: Ver;
  src: Src;
}

const SRC: Record<Src, string> = {
  tx: "texto pegado",
  gh: "github.com/dgatica",
  web: "dgatica.cl",
  cv: "CV_2023.pdf",
  q: "cuestionario-identidad.md",
};

const VER: Record<Ver, [string, string]> = {
  ok: ["c-ver--ok", "verificado"],
  partial: ["c-ver--partial", "parcial"],
  none: ["c-ver--none", "sin evidencia"],
};

/* ── datos de ejemplo (el perfil del volcado: Diego Gatica) ──
   ver: ok = el fragmento aparece literal · partial = coincidencia difusa ·
   none = no aparece en ninguna fuente (derivado de un hecho, no auto-reportado) */
const EXP: Exp[] = [
  {
    id: "e1",
    tt: "Backend Developer",
    org: "Altiplano Pagos · mar 2022 – hoy",
    ver: "ok",
    src: "tx",
    frag:
      "Los últimos tres años trabajé en <mark>Altiplano Pagos como backend developer</mark> — partí haciendo integraciones de pago…",
    bullets: [
      {
        id: "b1",
        tx: 'A cargo del servicio de conciliación de pagos en Go (<span class="t-num">~40.000</span> transacciones diarias).',
        ver: "ok",
        src: "tx",
        frag: "…y terminé <mark>a cargo del servicio de conciliación (Go, ~40 mil transacciones diarias)</mark>.",
      },
      {
        id: "b2",
        tx: "Diseñé la integración con 3 procesadores de pago.",
        ver: "partial",
        src: "tx",
        frag:
          "El texto dice <mark>«partí haciendo integraciones de pago»</mark> — sin decir cuántos ni cuáles. Precísalo o suaviza la viñeta.",
      },
      {
        id: "b3",
        tx: 'Reduje el tiempo de conciliación de 4 horas a <span class="t-num">20 minutos</span>.',
        ver: "none",
        src: "tx",
        frag:
          "Esas cifras no aparecen en ninguna fuente. Si son reales, cuéntanos de dónde salen — quedará como origen: tú.",
        ask: "¿De dónde salen las 4 horas y los 20 minutos?",
      },
      {
        id: "b4",
        tx: "Escribí la librería interna de idempotencia usada por otros servicios.",
        ver: "ok",
        src: "gh",
        frag: "repo <mark>idempotency-go</mark> · Go · 214 KB · README: «librería interna de idempotencia»",
      },
      {
        id: "b5",
        tx: "Mantengo los pipelines de CI/CD del equipo (GitHub Actions).",
        ver: "ok",
        src: "gh",
        frag: "<mark>workflows de GitHub Actions</mark> presentes en 4 de tus repos con commits tuyos.",
      },
      {
        id: "b6",
        tx: "Turno de soporte (on-call) una semana al mes.",
        ver: "ok",
        src: "q",
        frag: "«…hago <mark>on-call una semana al mes</mark>, incluye madrugadas de conciliación.»",
      },
      {
        id: "b7",
        tx: "Documenté la API pública de conciliación (OpenAPI).",
        ver: "ok",
        src: "gh",
        frag: "repo <mark>conciliador-api</mark> · carpeta /docs con especificación <mark>OpenAPI 3.1</mark>.",
      },
      {
        id: "b8",
        tx: "Mentoreo a 2 desarrolladores junior.",
        ver: "ok",
        src: "q",
        frag: "«Desde 2024 <mark>mentoreo a dos juniors</mark> del equipo de pagos.»",
      },
    ],
  },
  { id: "e2", tt: "", org: "", ver: "ok", src: "tx", frag: "", bullets: [] }, // placeholder del duplicado
  {
    id: "e3",
    tt: "Desarrollador freelance",
    org: "Independiente · 2019 – 2020",
    ver: "ok",
    src: "q",
    frag: "«Antes de Rayén trabajé <mark>por mi cuenta un año</mark>, puros proyectos chicos…»",
    bullets: [
      {
        id: "b16",
        tx: "Construí sitios y APIs para 4 pymes chilenas.",
        ver: "ok",
        src: "q",
        frag: "«…hice <mark>sitios y APIs para cuatro pymes</mark>, cobraba por proyecto.»",
      },
      {
        id: "b17",
        tx: "Sistema de reservas para un centro deportivo (Django).",
        ver: "ok",
        src: "web",
        frag: "dgatica.cl/proyectos: <mark>«Reservas Club — sistema de reservas en Django»</mark> con caso y capturas.",
      },
      {
        id: "b18",
        tx: 'Mantuve un e-commerce con <span class="t-num">1.200</span> productos.',
        ver: "none",
        src: "cv",
        frag: "El CV dice «mantuve un e-commerce WooCommerce» — el <mark>1.200</mark> no aparece en ninguna fuente.",
        ask: "¿De dónde sale el 1.200?",
      },
      {
        id: "b19",
        tx: "Administré hosting y dominios de clientes.",
        ver: "ok",
        src: "cv",
        frag: "«<mark>Administración de hosting y dominios</mark> para clientes de desarrollo web.»",
      },
      {
        id: "b20",
        tx: "Facturé y gestioné contratos directamente.",
        ver: "ok",
        src: "q",
        frag: "«Aprendí a <mark>facturar y manejar contratos yo solo</mark> — nadie te enseña eso.»",
      },
    ],
  },
  {
    id: "e4",
    tt: "Práctica profesional — Área TI",
    org: "Universidad Andrés Bello · 2018 – 2019",
    ver: "ok",
    src: "cv",
    frag: "«<mark>Práctica profesional, Dirección de TI UNAB</mark>, soporte a sistemas académicos.»",
    bullets: [
      {
        id: "b21",
        tx: "Soporte a la plataforma de matrícula en periodos peak.",
        ver: "ok",
        src: "cv",
        frag: "«<mark>Soporte a plataforma de matrícula</mark> en procesos de admisión.»",
      },
      {
        id: "b22",
        tx: "Scripts de migración de datos de alumnos (Python).",
        ver: "ok",
        src: "cv",
        frag: "«<mark>Scripts en Python para migración de datos</mark> entre sistemas académicos.»",
      },
      {
        id: "b23",
        tx: "Levanté un dashboard interno de tickets.",
        ver: "partial",
        src: "cv",
        frag: "El CV menciona «apoyo en reportes del área» — el <mark>dashboard</mark> como tal no aparece. ¿Es la misma cosa?",
      },
      {
        id: "b24",
        tx: "Documenté procesos del área para nuevos practicantes.",
        ver: "ok",
        src: "cv",
        frag: "«<mark>Documentación de procesos internos</mark> del área de soporte.»",
      },
      {
        id: "b25",
        tx: 'Atendí la mesa de ayuda (<span class="t-num">≈30</span> tickets semanales).',
        ver: "none",
        src: "cv",
        frag: "El CV dice «apoyo a mesa de ayuda» — el <mark>≈30 semanal</mark> no aparece en ninguna fuente.",
        ask: "¿Recuerdas el volumen real? Deja la cifra solo si puedes sostenerla.",
      },
    ],
  },
];

const DUP: Dup = {
  id: "e2",
  anchor: "dup-rayen",
  tt: "Rayén Retail — Backend, equipo Checkout",
  why: "aparece en texto pegado y en CV_2023.pdf, redactado distinto",
  a: {
    src: "CV_2023.pdf",
    cargo: "Desarrollador de Software",
    fechas: "enero 2020 – febrero 2022",
    vin: "«Desarrollo y mantención de APIs del checkout (Node.js, PostgreSQL)» · «Implementación del flujo de cupones» · «Automatización de reportes de venta»",
  },
  b: {
    src: "texto pegado",
    cargo: "Backend developer, equipo de checkout",
    fechas: "«dos años, hasta 2022»",
    vin: "«Antes estuve dos años en el e-commerce de Rayén Retail, en el equipo de checkout.»",
  },
  bullets: [
    {
      id: "b9",
      tx: "Desarrollé y mantuve APIs del checkout (Node.js, PostgreSQL).",
      ver: "ok",
      src: "cv",
      frag: "«<mark>Desarrollo y mantención de APIs del checkout (Node.js, PostgreSQL)</mark>.»",
    },
    {
      id: "b10",
      tx: 'Mejoré el rendimiento del checkout en un <span class="t-num">15%</span>.',
      ver: "none",
      src: "cv",
      frag:
        "El CV dice «mejoré el rendimiento del checkout» — <mark>el 15% no aparece en ninguna fuente</mark>. Una cifra sin origen es exactamente lo que este producto no hace.",
      ask: "¿Cuánto fue, medido cómo? Si no lo recuerdas, deja la viñeta sin cifra.",
    },
    {
      id: "b11",
      tx: "Participé en la migración del checkout monolítico a servicios.",
      ver: "partial",
      src: "cv",
      frag:
        "El CV dice «participación en <mark>migración a microservicios</mark>»; tu texto solo menciona el equipo. Vale, pero revisa el alcance.",
    },
    {
      id: "b12",
      tx: "Atendí incidentes de producción en cyber days.",
      ver: "ok",
      src: "q",
      frag: "«Los <mark>cyber</mark> eran una guerra: <mark>incidentes de producción</mark> toda la semana, peaks brutales.»",
    },
    {
      id: "b13",
      tx: "Implementé el flujo de cupones y descuentos.",
      ver: "ok",
      src: "cv",
      frag: "«<mark>Implementación del flujo de cupones</mark> y descuentos del checkout.»",
    },
    {
      id: "b14",
      tx: "Automaticé reportes de ventas diarios para operaciones.",
      ver: "ok",
      src: "cv",
      frag: "«<mark>Automatización de reportes de venta</mark> diarios para el área de operaciones.»",
    },
    {
      id: "b15",
      tx: "Coordiné con el equipo de fraude la validación de pagos.",
      ver: "partial",
      src: "q",
      frag: "El cuestionario menciona «trabajar <mark>con los de fraude</mark>» sin detallar qué. ¿Coordinabas tú, o participabas?",
    },
  ],
};

const SKILLS: Dense[] = [
  { n: "Go", ev: "412 KB · 3 repos · citada en 2 viñetas de experiencia", ver: "ok", src: "gh" },
  { n: "Python", ev: "188 KB · 2 repos · scripts de migración (práctica)", ver: "ok", src: "gh" },
  { n: "SQL", ev: "mencionada en tu texto · consultas en 3 repos", ver: "ok", src: "tx" },
  { n: "PostgreSQL", ev: "CV_2023 · APIs del checkout · docker-compose en 2 repos", ver: "ok", src: "cv" },
  { n: "Node.js", ev: "CV_2023 · APIs del checkout en Rayén", ver: "ok", src: "cv" },
  { n: "TypeScript", ev: "96 KB · 2 repos (front del portfolio)", ver: "ok", src: "gh" },
  { n: "Docker", ev: "Dockerfile en 5 repos", ver: "ok", src: "gh" },
  { n: "GitHub Actions", ev: "workflows en 4 repos", ver: "ok", src: "gh" },
  { n: "Django", ev: "proyecto Reservas Club (portfolio)", ver: "ok", src: "web" },
  { n: "gRPC", ev: "conciliador-api · protos versionados", ver: "ok", src: "gh" },
  { n: "Redis", ev: "README de idempotency-go: backend de locks", ver: "ok", src: "gh" },
  { n: "OpenAPI", ev: "spec 3.1 en conciliador-api/docs", ver: "ok", src: "gh" },
  { n: "Git", ev: "historia de commits · 6 años", ver: "ok", src: "gh" },
  { n: "Linux", ev: "cuestionario: entorno diario de trabajo", ver: "ok", src: "q" },
  { n: "Bash", ev: "scripts de operación en 3 repos", ver: "ok", src: "gh" },
  { n: "Inglés B2", ev: "declarado en tu texto — sin certificado adjunto", ver: "ok", src: "tx" },
  { n: "Kubernetes", ev: "tu texto: «lo usamos pero no lo administraba yo» — declara el nivel real", ver: "partial", src: "tx" },
  { n: "AWS", ev: "aparece en un README — sin repos ni viñetas que la usen", ver: "partial", src: "gh" },
  { n: "Grafana", ev: "dashboard de tickets (práctica) — coincidencia difusa", ver: "partial", src: "cv" },
  { n: "Kafka", ev: "no aparece en ninguna viñeta, repo ni fuente", ver: "none", src: "cv" },
  { n: "Microservicios", ev: "inferida de contexto — como skill suelta no dice nada. ¿Descartar?", ver: "none", src: "cv" },
  { n: "Liderazgo técnico", ev: "adjetivo sin evidencia — mejor cuéntalo en una viñeta con hechos", ver: "none", src: "cv" },
  { n: "Scrum", ev: "CV_2023 la lista — ninguna otra fuente la respalda", ver: "partial", src: "cv" },
];

const PROJ: Dense[] = [
  { n: "pago-conciliador", ev: "Go · 412 KB · privado espejo del servicio de Altiplano", ver: "ok", src: "gh" },
  { n: "idempotency-go", ev: "Go · 214 KB · 41 commits · README con ejemplos", ver: "ok", src: "gh" },
  { n: "reservas-club", ev: "Django · caso completo en dgatica.cl con capturas", ver: "ok", src: "web" },
  { n: "dgatica.cl", ev: "portfolio · Next.js · 6 proyectos documentados", ver: "ok", src: "web" },
  { n: "scraper-sii", ev: "Python · 67 KB · scraping de tipo de cambio", ver: "ok", src: "gh" },
  { n: "dotfiles", ev: "configuración personal — casi nunca aporta a un CV. ¿Descartar?", ver: "ok", src: "gh" },
];

const CERT: Dense[] = [
  { n: "Diplomado en Ingeniería de Datos — PUC (2022)", ev: "tu texto + cuestionario coinciden", ver: "ok", src: "tx" },
  { n: "Inglés B2", ev: "auto-declarado — si tienes EF SET o similar, adjúntalo", ver: "partial", src: "tx" },
  { n: "AWS Certified Cloud Practitioner", ev: "solo en CV_2023 — sin credencial ni fecha. ¿Sigue vigente?", ver: "none", src: "cv" },
];

const TOTAL = 61; // constante canónica (título · 4 exp + 25 viñetas + 23 skills + 6 proyectos + 3 certs)

interface OrderUnit {
  id: string;
  ver: Ver;
  group: GroupId;
}

/** Unidades revisables en orden de DOM. `merged` añade el cabezal e2 del duplicado ya fusionado. */
function buildOrder(merged: boolean): OrderUnit[] {
  const out: OrderUnit[] = [];
  const e1 = EXP[0];
  out.push({ id: e1.id, ver: e1.ver, group: "exp" });
  e1.bullets.forEach((b) => out.push({ id: b.id, ver: b.ver, group: "exp" }));
  if (merged) out.push({ id: "e2", ver: "ok", group: "exp" });
  DUP.bullets.forEach((b) => out.push({ id: b.id, ver: b.ver, group: "exp" }));
  const e3 = EXP[2];
  out.push({ id: e3.id, ver: e3.ver, group: "exp" });
  e3.bullets.forEach((b) => out.push({ id: b.id, ver: b.ver, group: "exp" }));
  const e4 = EXP[3];
  out.push({ id: e4.id, ver: e4.ver, group: "exp" });
  e4.bullets.forEach((b) => out.push({ id: b.id, ver: b.ver, group: "exp" }));
  SKILLS.forEach((s, i) => out.push({ id: "sk" + i, ver: s.ver, group: "sk" }));
  PROJ.forEach((p, i) => out.push({ id: "pj" + i, ver: p.ver, group: "pj" }));
  CERT.forEach((c, i) => out.push({ id: "ct" + i, ver: c.ver, group: "ct" }));
  return out;
}

const BASE_ORDER = buildOrder(false); // 60 unidades resolvables (el cabezal del dup no lo es)
const countVer = (v: Ver) => BASE_ORDER.filter((u) => u.ver === v).length;
const CHIP = { ok: countVer("ok"), partial: countVer("partial"), none: countVer("none") }; // 43 / 9 / 8
const okBase = (g: GroupId) => BASE_ORDER.filter((u) => u.group === g && u.ver === "ok").length; // 20 / 16 / 6 / 1

const html = (s: string) => ({ __html: s });
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "");

type Resolution = { kind: Kind; batched: boolean };

export function StagingScreen() {
  const [resolved, setResolved] = useState<Record<string, Resolution>>({});
  const [openFrag, setOpenFrag] = useState<Set<string>>(new Set());
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | Ver>("all");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [picks, setPicks] = useState<{ cargo?: "a" | "b"; fechas?: "a" | "b"; vin?: "a" | "b" }>({});
  const [merged, setMerged] = useState(false);
  const [accdOpen, setAccdOpen] = useState<Record<GroupId, boolean>>({ exp: false, sk: false, pj: false, ct: false });
  const [kbFocusId, setKbFocusId] = useState<string | null>(null);
  const [batchAllDone, setBatchAllDone] = useState(false);

  const groupsRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const dupCardRef = useRef<HTMLDivElement>(null);
  const nPendRef = useRef<HTMLElement>(null);
  const nAccRef = useRef<HTMLElement>(null);
  const nDisRef = useRef<HTMLElement>(null);
  const unitRefs = useRef<Map<string, HTMLElement>>(new Map());

  const order = useMemo(() => buildOrder(merged), [merged]);

  const acc = Object.values(resolved).filter((r) => r.kind === "acc").length;
  const dis = Object.values(resolved).filter((r) => r.kind === "dis").length;
  const pend = TOTAL - acc - dis;
  const showEmpty = pend === 0;

  const effVer = (id: string, baseVer: Ver): Ver => (saved.has(id) ? "ok" : baseVer);
  const filterHidden = (v: Ver) => filter !== "all" && v !== filter;
  const accdCount = (g: GroupId) => order.filter((u) => u.group === g && resolved[u.id]?.batched).length;
  const labelHTML = (id: string, fallback: string) => edits[id] ?? fallback;
  const plainLabel = (id: string, fallback: string) => stripHtml(labelHTML(id, fallback)).slice(0, 72);

  // ── contadores: animados con CorpusMotion.counter hacia el número REAL ──
  useEffect(() => {
    const M = window.CorpusMotion;
    if (M) {
      if (nPendRef.current) M.counter(nPendRef.current, pend, { dur: 300 });
      if (nAccRef.current) M.counter(nAccRef.current, acc, { dur: 300 });
      if (nDisRef.current) M.counter(nDisRef.current, dis, { dur: 300 });
    } else {
      if (nPendRef.current) nPendRef.current.textContent = String(pend);
      if (nAccRef.current) nAccRef.current.textContent = String(acc);
      if (nDisRef.current) nDisRef.current.textContent = String(dis);
    }
  }, [acc, dis, pend]);

  // ── escalonado de entrada + dibujar los hairlines (c-divider) al montar ──
  useEffect(() => {
    let cancelled = false;
    const tryBoot = () => {
      const M = window.CorpusMotion;
      if (!M) return false;
      const g = groupsRef.current;
      if (g) {
        const items = g.querySelectorAll(".stg-card,.stg-dup,.stg-sk,.stg-g .stg-gh");
        M.stagger(g, { step: 40, cap: 24, items });
      }
      M.boot(g ?? document);
      return true;
    };
    if (tryBoot()) return;
    let tries = 0;
    const iv = window.setInterval(() => {
      if (cancelled) return;
      if (tryBoot() || ++tries > 100) window.clearInterval(iv);
    }, 30);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  // ── entrada C2 de la tarjeta fusionada ──
  useEffect(() => {
    if (!merged) return;
    const M = window.CorpusMotion;
    const el = document.querySelector('[data-card="e2"]') as HTMLElement | null;
    if (M && el) M.enter(el);
  }, [merged]);

  // ── entrada C2 del estado vacío ──
  useEffect(() => {
    if (!showEmpty) return;
    const M = window.CorpusMotion;
    if (M && emptyRef.current) M.enter(emptyRef.current);
  }, [showEmpty]);

  // ── acciones (estables vía updaters funcionales) ──
  function resolve(id: string, kind: Kind, batched = false) {
    setResolved((p) => (p[id] ? p : { ...p, [id]: { kind, batched } }));
    setOpenFrag((p) => {
      if (!p.has(id)) return p;
      const n = new Set(p);
      n.delete(id);
      return n;
    });
  }
  function undo(id: string) {
    setResolved((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
  }
  function toggleFrag(id: string) {
    setOpenFrag((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function scrollToUnit(id: string) {
    const el = unitRefs.current.get(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Scroll manual calculado — nunca scrollIntoView (regla del handoff).
    if (r.top < 150 || r.bottom > window.innerHeight - 80)
      window.scrollTo({ top: r.top + window.scrollY - window.innerHeight / 2.6 });
  }
  function focusKb(id: string) {
    setKbFocusId(id);
    requestAnimationFrame(() => scrollToUnit(id));
  }
  function startEdit(e: React.MouseEvent, id: string) {
    const unit = (e.currentTarget as HTMLElement).closest(".stg-unit");
    const label = unit?.querySelector<HTMLElement>(".tx,.nm,.tt");
    if (!label) return;
    label.contentEditable = "true";
    label.focus();
    const fin = () => {
      label.contentEditable = "false";
      setEdits((p) => ({ ...p, [id]: label.innerHTML }));
      setEdited((p) => new Set(p).add(id));
    };
    label.addEventListener("blur", fin, { once: true });
    label.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        label.blur();
      }
    });
  }
  function saveAsk(e: React.MouseEvent, id: string) {
    const wrap = (e.currentTarget as HTMLElement).closest(".stg-ask");
    const inp = wrap?.querySelector<HTMLInputElement>("input");
    if (!inp || !inp.value.trim()) return;
    setSaved((p) => new Set(p).add(id)); // promueve none → ok, quita .miss del fragmento
  }
  function pick(k: "cargo" | "fechas" | "vin", side: "a" | "b") {
    setPicks((p) => ({ ...p, [k]: side }));
  }
  function doMerge() {
    if (!(picks.cargo && picks.fechas && picks.vin)) return;
    setMerged(true);
  }
  function jumpToDup(e: React.MouseEvent) {
    e.preventDefault();
    setMergeOpen(true);
    const el = dupCardRef.current;
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 140 });
  }
  function toggleAccd(g: GroupId) {
    setAccdOpen((p) => ({ ...p, [g]: !p[g] }));
  }
  function batchTargets(gid: GroupId | null) {
    return order.filter(
      (u) => (gid === null || u.group === gid) && effVer(u.id, u.ver) === "ok" && !resolved[u.id],
    );
  }
  function applyBatch(targets: OrderUnit[]) {
    if (!targets.length) return;
    setResolved((p) => {
      const n = { ...p };
      targets.forEach((u) => {
        if (!n[u.id]) n[u.id] = { kind: "acc", batched: true };
      });
      return n;
    });
    setOpenFrag((p) => {
      const n = new Set(p);
      targets.forEach((u) => n.delete(u.id));
      return n;
    });
    // El lote te deja delante de lo que necesita tus ojos: foco al primer sin evidencia.
    const firstNone = order.find(
      (u) => effVer(u.id, u.ver) === "none" && !resolved[u.id] && !filterHidden(effVer(u.id, u.ver)),
    );
    if (firstNone) focusKb(firstNone.id);
  }
  function batch(gid: GroupId) {
    applyBatch(batchTargets(gid));
  }
  function acceptAll() {
    applyBatch(batchTargets(null));
    setBatchAllDone(true);
  }

  // ── teclado j/k/a/d/o (lee el estado más reciente vía refs) ──
  const visibleKbIds = order
    .filter((u) => !resolved[u.id] && !filterHidden(effVer(u.id, u.ver)))
    .map((u) => u.id);
  const kbRef = useRef<{ ids: string[]; cur: string | null }>({ ids: [], cur: null });
  kbRef.current = { ids: visibleKbIds, cur: kbFocusId };
  const actRef = useRef({ resolve, toggleFrag, focusKb, setKbFocusId });
  actRef.current = { resolve, toggleFrag, focusKb, setKbFocusId };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && t.matches && t.matches('input,textarea,[contenteditable="true"]')) return;
      if (!["j", "k", "a", "d", "o"].includes(e.key)) return;
      const { ids: L, cur } = kbRef.current;
      const A = actRef.current;
      if (!L.length) return;
      const idx = cur ? L.indexOf(cur) : -1;
      if (e.key === "j") A.focusKb(L[idx < 0 ? 0 : Math.min(idx + 1, L.length - 1)]);
      else if (e.key === "k") A.focusKb(L[idx < 0 ? 0 : Math.max(idx - 1, 0)]);
      else if (e.key === "a" && cur) {
        A.resolve(cur, "acc");
        const next = L[idx + 1] ?? L[idx - 1] ?? null;
        next ? A.focusKb(next) : A.setKbFocusId(null);
      } else if (e.key === "d" && cur) {
        A.resolve(cur, "dis");
        const next = L[idx + 1] ?? L[idx - 1] ?? null;
        next ? A.focusKb(next) : A.setKbFocusId(null);
      } else if (e.key === "o" && cur) A.toggleFrag(cur);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const setRef = (id: string) => (el: HTMLElement | null) => {
    if (el) unitRefs.current.set(id, el);
    else unitRefs.current.delete(id);
  };

  // ── piezas de render ──
  const verBadge = (v: Ver) => <span className={"c-ver " + VER[v][0]}>{VER[v][1]}</span>;
  const editedBadge = (
    <span className="stg-src" style={{ color: "var(--accent-text)", borderColor: "var(--border-patina)" }}>
      editado por ti
    </span>
  );
  const acts = (id: string) => (
    <span className="stg-acts">
      <button className="ok" data-a="acc" onClick={() => resolve(id, "acc")}>
        ✓ aceptar
      </button>
      <button data-a="edit" onClick={(e) => startEdit(e, id)}>
        editar
      </button>
      <button className="no" data-a="dis" onClick={() => resolve(id, "dis")}>
        × descartar
      </button>
    </span>
  );
  function DoneRow({ id, kind, label, hidden }: { id: string; kind: Kind; label: string; hidden: boolean }) {
    return (
      <div className="stg-donerow" data-undo="1" hidden={hidden}>
        {kind === "acc" ? (
          <>
            <span className="g">✓</span>
            <span>{"al master · " + label}</span>
          </>
        ) : (
          <>
            <span className="r">×</span>
            <span>{"descartado · " + label}</span>
          </>
        )}
        <button onClick={() => undo(id)}>deshacer</button>
      </div>
    );
  }

  function renderBullet(b: Bullet, group: GroupId) {
    const r = resolved[b.id];
    if (r)
      return (
        <DoneRow
          key={b.id}
          id={b.id}
          kind={r.kind}
          label={plainLabel(b.id, b.tx)}
          hidden={r.batched && !accdOpen[group]}
        />
      );
    const ev = effVer(b.id, b.ver);
    const isSaved = saved.has(b.id);
    const fragMiss = ev === "none" && !isSaved;
    return (
      <React.Fragment key={b.id}>
        <div
          ref={setRef(b.id)}
          className={"stg-b stg-unit" + (kbFocusId === b.id ? " kb-focus" : "")}
          data-id={b.id}
          data-ver={ev}
          data-kb=""
          hidden={filterHidden(ev)}
        >
          <span className="tx" dangerouslySetInnerHTML={html(labelHTML(b.id, b.tx))} />
          {verBadge(ev)}
          {edited.has(b.id) && editedBadge}
          <button className="stg-orig" data-a="orig" onClick={() => toggleFrag(b.id)}>
            {openFrag.has(b.id) ? "origen ▴" : "origen ▾"}
          </button>
          {acts(b.id)}
        </div>
        <div
          className={"stg-frag" + (fragMiss ? " miss" : "") + (openFrag.has(b.id) ? " open" : "")}
          data-frag={b.id}
          dangerouslySetInnerHTML={html(
            '<span class="from">' + SRC[b.src] + (fragMiss ? " — la cifra no tiene respaldo" : "") + "</span>" + b.frag,
          )}
        />
        {b.ask &&
          (isSaved ? (
            <div className="stg-ask" data-ask={b.id}>
              <span style={{ color: "var(--ver-ok)" }}>✓ guardado como origen manual</span>
              <span className="t-subtle" style={{ font: "400 11px/1.4 var(--font-mono)" }}>
                — lo escribiste tú: el origen más verificable de todos.
              </span>
            </div>
          ) : (
            <div className="stg-ask" data-ask={b.id}>
              <span>{"⚠ " + b.ask}</span>
              <input
                className="c-input"
                placeholder="Escríbelo aquí y quedará como origen: tú (el más verificable de todos)"
              />
              <button data-a="saveask" onClick={(e) => saveAsk(e, b.id)}>
                guardar como origen manual
              </button>
            </div>
          ))}
      </React.Fragment>
    );
  }

  const unitVisible = (id: string, baseVer: Ver, group: GroupId) => {
    const r = resolved[id];
    if (r) return !(r.batched && !accdOpen[group]);
    return !filterHidden(effVer(id, baseVer));
  };

  function renderExpCard(e: Exp) {
    const ev = effVer(e.id, e.ver);
    const head = resolved[e.id];
    const units: { id: string; ver: Ver }[] = [{ id: e.id, ver: e.ver }, ...e.bullets.map((b) => ({ id: b.id, ver: b.ver }))];
    const cardHidden = !units.some((u) => unitVisible(u.id, u.ver, "exp"));
    return (
      <div className="c-card stg-card" data-card={e.id} hidden={cardHidden} key={e.id}>
        {head ? (
          <DoneRow
            id={e.id}
            kind={head.kind}
            label={plainLabel(e.id, e.tt)}
            hidden={head.batched && !accdOpen.exp}
          />
        ) : (
          <>
            <div
              ref={setRef(e.id)}
              className={"stg-chead stg-unit" + (kbFocusId === e.id ? " kb-focus" : "")}
              data-id={e.id}
              data-ver={ev}
              data-kb=""
              hidden={filterHidden(ev)}
            >
              <span className="tt" dangerouslySetInnerHTML={html(labelHTML(e.id, e.tt))} />
              <span className="org">{e.org}</span>
              {verBadge(ev)}
              {edited.has(e.id) && editedBadge}
              <button className="stg-orig" data-a="orig" onClick={() => toggleFrag(e.id)}>
                {openFrag.has(e.id) ? "origen ▴" : "origen ▾"}
              </button>
              {acts(e.id)}
            </div>
            <div
              className={"stg-frag" + (openFrag.has(e.id) ? " open" : "")}
              data-frag={e.id}
              dangerouslySetInnerHTML={html('<span class="from">' + SRC[e.src] + "</span>" + e.frag)}
            />
          </>
        )}
        {e.bullets.map((b) => renderBullet(b, "exp"))}
      </div>
    );
  }

  function renderDupCard() {
    const cardHidden = !DUP.bullets.some((b) => unitVisible(b.id, b.ver, "exp"));
    const rows: [keyof DupSide & ("cargo" | "fechas" | "vin"), string][] = [
      ["cargo", "cargo"],
      ["fechas", "fechas"],
      ["vin", "viñetas"],
    ];
    return (
      <div className="c-card stg-dup" id={DUP.anchor} data-card="e2" ref={dupCardRef} hidden={cardHidden}>
        <button
          className="dh"
          data-a="dtoggle"
          aria-expanded={mergeOpen}
          onClick={() => setMergeOpen((v) => !v)}
          style={{ width: "100%" }}
        >
          <span className="tt">{DUP.tt}</span>
          <span className="why">{DUP.why}</span>
          <span className="tog">{mergeOpen ? "cerrar ▴" : "resolver campo por campo ▾"}</span>
        </button>
        <div className={"stg-merge" + (mergeOpen ? " open" : "")} id="merge">
          <div className="stg-mhead">
            <div />
            <div>{DUP.a.src}</div>
            <div>{DUP.b.src}</div>
          </div>
          {rows.map(([k, label]) => (
            <div className="stg-mrow" key={k}>
              <div className="k">{label}</div>
              <button data-pick={k + ":a"} aria-pressed={picks[k] === "a"} onClick={() => pick(k, "a")}>
                {DUP.a[k]}
              </button>
              <button data-pick={k + ":b"} aria-pressed={picks[k] === "b"} onClick={() => pick(k, "b")}>
                {DUP.b[k]}
              </button>
            </div>
          ))}
        </div>
        <div className="stg-mfoot" id="mfoot" hidden={!mergeOpen}>
          <span className="note">
            La fusión la decides tú — nunca automática. Las viñetas no elegidas no se pierden: quedan abajo, cada una con
            su revisión.
          </span>
          <button
            className="c-btn"
            id="btnMerge"
            disabled={!(picks.cargo && picks.fechas && picks.vin)}
            onClick={doMerge}
          >
            Crear item fusionado
          </button>
        </div>
        {DUP.bullets.map((b) => renderBullet(b, "exp"))}
      </div>
    );
  }

  function mergedCard(): Exp {
    return {
      id: "e2",
      tt: picks.cargo === "a" ? DUP.a.cargo : DUP.b.cargo,
      org: "Rayén Retail · " + (picks.fechas === "a" ? DUP.a.fechas : "2020 – 2022 (de tu texto)"),
      ver: "ok",
      src: picks.cargo === "a" ? "cv" : "tx",
      frag:
        "Fusionado por ti desde <mark>CV_2023.pdf</mark> y <mark>texto pegado</mark>. Ambos originales quedan citados.",
      bullets: DUP.bullets,
    };
  }

  function denseSk(id: string, x: Dense, group: GroupId) {
    const r = resolved[id];
    if (r)
      return (
        <div className="stg-sk stg-unit done" data-id={id} data-ver={x.ver} data-kb="" hidden={r.batched} key={id}>
          <span className="nm" dangerouslySetInnerHTML={html(labelHTML(id, x.n))} />
          {verBadge(x.ver)}
          {edited.has(id) && editedBadge}
          <span className="ev">
            {r.kind === "acc" ? (
              <span style={{ color: "var(--ver-ok)" }}>✓ al master</span>
            ) : (
              <span style={{ color: "var(--danger)" }}>× descartado</span>
            )}
            {" · "}
            <button
              style={{ textDecoration: "underline", color: "var(--text-subtle)", font: "inherit" }}
              data-a="undo-sk"
              onClick={() => undo(id)}
            >
              deshacer
            </button>
          </span>
        </div>
      );
    const ev = effVer(id, x.ver);
    return (
      <div
        ref={setRef(id)}
        className={"stg-sk stg-unit" + (kbFocusId === id ? " kb-focus" : "")}
        data-id={id}
        data-ver={ev}
        data-kb=""
        hidden={filterHidden(ev)}
        key={id}
      >
        <span className="nm" dangerouslySetInnerHTML={html(labelHTML(id, x.n))} />
        {verBadge(ev)}
        {edited.has(id) && editedBadge}
        <span
          className="ev"
          dangerouslySetInnerHTML={html(x.ev + ' · <span class="stg-src" style="border:0;padding:0">' + SRC[x.src] + "</span>")}
        />
        {acts(id)}
      </div>
    );
  }

  const accdKey = (g: GroupId) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleAccd(g);
    }
  };

  function groupHead(title: string, cnt: string, gid: GroupId) {
    const n = accdCount(gid);
    return (
      <div className="stg-gh">
        <span className="t-overline">{title}</span>
        <span className="cnt">{cnt}</span>
        {n > 0 && (
          <span className="accd" data-a="showacc" role="button" tabIndex={0} onClick={() => toggleAccd(gid)} onKeyDown={accdKey(gid)}>
            {"✓ " + n + " aceptados — ver"}
          </span>
        )}
        <button className="batch" data-a="batch" data-g={gid} onClick={() => batch(gid)}>
          {"aceptar " + okBase(gid) + " verificados ✓"}
        </button>
      </div>
    );
  }

  return (
    <div className="c-page">
      <header className="c-header">
        <div className="c-container">
          <div className="hd-crumb" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <Link className="c-logo" href="/app">
              Corpus
            </Link>
            <span style={{ width: "1px", height: "18px", background: "var(--border-strong)" }} />
            <span
              style={{ font: "500 var(--fs-micro)/1 var(--font-mono)", letterSpacing: ".14em", color: "var(--text-muted)" }}
            >
              INGESTA · PASO 2 DE 2 — REVISIÓN
            </span>
          </div>
          <div className="hd-right">
            <div className="hd-lang">
              <span data-on>ES</span>
              <span>EN</span>
            </div>
            <div className="hd-av">DG</div>
          </div>
        </div>
      </header>

      <div className="stg-sub" data-screen-label="staging-cabecera">
        <div className="c-container">
          <span className="stg-title">Staging</span>
          <div className="stg-nums">
            <span>
              <b id="nPend" ref={nPendRef}>
                {TOTAL}
              </b>{" "}
              pendientes
            </span>
            <span className="stg-bar" aria-hidden="true">
              <span className="ok" id="barOk" style={{ width: (acc / TOTAL) * 100 + "%" }} />
              <span className="out" id="barOut" style={{ width: (dis / TOTAL) * 100 + "%" }} />
            </span>
            <span>
              <b id="nAcc" className="t-accent" ref={nAccRef}>
                {0}
              </b>{" "}
              al master
            </span>
            <span>
              <b id="nDis" ref={nDisRef}>
                {0}
              </b>{" "}
              descartados
            </span>
          </div>
          <div className="stg-filter" role="group" aria-label="Filtrar por verificación">
            <button data-f="all" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              todos
            </button>
            <button data-f="ok" aria-pressed={filter === "ok"} onClick={() => setFilter("ok")}>
              ● verificado <span id="fOk">{CHIP.ok}</span>
            </button>
            <button data-f="partial" aria-pressed={filter === "partial"} onClick={() => setFilter("partial")}>
              ◐ parcial <span id="fPa">{CHIP.partial}</span>
            </button>
            <button data-f="none" aria-pressed={filter === "none"} onClick={() => setFilter("none")}>
              ⚠ sin evidencia <span id="fNo">{CHIP.none}</span>
            </button>
          </div>
          <span
            role="status"
            aria-live="polite"
            style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
          >
            {`${acc} al master, ${dis} descartados, ${pend} pendientes`}
          </span>
        </div>
      </div>

      <main className="stg-main c-wall" data-screen-label="staging">
        <div className="c-container">
          <div className="stg-lead" hidden={showEmpty}>
            <p>
              Nada de esto está en tu master todavía. Cada item cita su origen — <b>ábrelo</b> antes de aceptar lo que no
              te suene. Los lotes solo tocan lo <b>verificado</b>: lo demás pasa por tus ojos, uno a uno.
            </p>
            <button className="c-btn c-btn--patina" id="btnBatchAll" onClick={acceptAll} disabled={batchAllDone}>
              {batchAllDone
                ? "Verificados aceptados ✓ — quedan los que piden tu ojo"
                : `Aceptar todo lo verificado (${CHIP.ok})`}
            </button>
          </div>

          <div className="c-card stg-dupq" id="dupq" hidden={showEmpty}>
            {merged ? (
              <>
                <span>⚡</span>
                <span>
                  <b>1 duplicado resuelto por ti.</b> Quedan 2 menores (PostgreSQL/Postgres · reservas-club en dos
                  fuentes) — están marcados en sus grupos.
                </span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>
                  <b>3 posibles duplicados</b> — el mismo hecho, redactado distinto en dos fuentes. La fusión la decides
                  tú, campo por campo.
                </span>
                <a href="#dup-rayen" style={{ marginLeft: "auto" }} id="dupJump" onClick={jumpToDup}>
                  resolver →
                </a>
              </>
            )}
          </div>

          <div id="groups" ref={groupsRef} hidden={showEmpty}>
            <section className="stg-g" data-g="exp">
              {groupHead("Experiencia", "4 items · 25 viñetas", "exp")}
              <hr className="c-divider" />
              {renderExpCard(EXP[0])}
              {merged ? renderExpCard(mergedCard()) : renderDupCard()}
              {renderExpCard(EXP[2])}
              {renderExpCard(EXP[3])}
            </section>

            <section className="stg-g" data-g="sk">
              {groupHead("Skills", "23 items", "sk")}
              <hr className="c-divider" />
              <div className="stg-skills">{SKILLS.map((s, i) => denseSk("sk" + i, s, "sk"))}</div>
            </section>

            <section className="stg-g" data-g="pj">
              {groupHead("Proyectos", "6 items — un CV no es un volcado de GitHub: elige", "pj")}
              <hr className="c-divider" />
              <div className="stg-skills">{PROJ.map((p, i) => denseSk("pj" + i, p, "pj"))}</div>
            </section>

            <section className="stg-g" data-g="ct">
              {groupHead("Certificaciones", "3 items", "ct")}
              <hr className="c-divider" />
              <div className="stg-skills" style={{ gridTemplateColumns: "1fr" }}>
                {CERT.map((c, i) => denseSk("ct" + i, c, "ct"))}
              </div>
            </section>
          </div>

          <div className={"stg-empty" + (showEmpty ? " show" : "")} id="empty" ref={emptyRef}>
            <div className="mark">✓</div>
            <h2>Staging limpio.</h2>
            <p>
              <span className="t-num" id="emptyAcc">
                {acc}
              </span>{" "}
              items entraron a tu master, cada uno con su origen. Lo descartado no se borra: queda en la papelera de la
              ingesta por 30 días.
            </p>
            <span className="c-forge">
              <Link className="c-btn c-btn--forge c-btn--lg" href="/app/master">
                Ver el master →
              </Link>
            </span>
            <p className="fine">Siguiente paso razonable: crear tu primera variante para un aviso concreto.</p>
          </div>
        </div>
      </main>

      <div className="stg-kbd" aria-hidden="true">
        <span>
          <b>j/k</b> moverse
        </span>
        <span>
          <b>a</b> aceptar
        </span>
        <span>
          <b>d</b> descartar
        </span>
        <span>
          <b>o</b> origen
        </span>
        <span>
          <b>deshacer</b> con clic
        </span>
      </div>
    </div>
  );
}
