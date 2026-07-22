"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuroraTune, AURORA_HOJEO } from "@/components/Aurora";
import { DropZone } from "@/components/DropZone";
import { BloqueCopiable } from "@/components/BloqueCopiable";
import { Breadcrumb, readOrigin, withOrigin } from "@/components/Breadcrumb";
import { createClient } from "@/lib/supabase/client";
import { fileKindFromName, FILE_ACCEPT, type FileKind } from "@/lib/db/sources";
import { useT, useLang } from "@/lib/i18n";
import { useIngesta } from "@/lib/ingesta/useIngesta";
import { estadoVisual, type LineaFuente } from "@/lib/ingesta/progreso";
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
/* El estado visual de una fila del log ya no se declara aquí: lo deriva
   `estadoVisual` (lib/ingesta/progreso.ts), que es puro y tiene su candado en
   los tests. Tenerlo en un solo sitio es lo que impide que esta pantalla y el
   indicador del shell cuenten dos historias distintas de la misma fuente. */
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

/* El log de la ingesta ya NO es un array local que esta pantalla va rellenando:
   es lo que hay ESCRITO en `ingestion_sources` + `ingestion_events`, leído por
   `useIngesta`. Por eso desapareció el `LogRow` de antes junto con sus dos
   botones de recuperación de maqueta: aquellos eran una simulación (el PDF
   escaneado de la persona del mock), y una simulación no puede convivir con un
   log verdadero sin que el usuario deje de saber cuál de los dos está mirando.
   El fallo REAL de una fuente llega ahora por su fila, con su motivo literal. */

/* Texto de ejemplo — la fuente de la que sale todo lo demás (persona del mock:
   Diego Gatica). Verbatim del HTML. */
const SAMPLE = `Soy ingeniero civil en computación, titulado en la UNAB (2019). Los últimos tres años trabajé en Altiplano Pagos como backend developer — partí haciendo integraciones de pago y terminé a cargo del servicio de conciliación (Go, ~40 mil transacciones diarias). Antes estuve dos años en el e-commerce de Rayén Retail, en el equipo de checkout.

Mi portfolio es https://dgatica.cl y mi github es github.com/dgatica. También dejo el LinkedIn: linkedin.com/in/diego-gatica

Sé Go, Python, SQL, algo de Kubernetes (lo usamos pero no lo administraba yo). Inglés B2. Diplomado en ingeniería de datos en la UC (2022).`;

/* El placeholder del textarea vive en el diccionario (importar.placeholder) —
   verbatim del HTML, con el DOBLE espacio tras «Por ejemplo:» y el salto real. */

/* ════════════════════════════════════════════════════════════════════════════
   EL CIERRE DEL TRABAJO — GET /api/import/job/[id]
   ════════════════════════════════════════════════════════════════════════════
   Se pide UNA vez, cuando la ingesta termina. Todos sus números salen de filas
   reales: los conteos, del nivel de evidencia que cada staged guardó; el
   consumo, de la SUMA de la telemetría de cada fuente; el contexto, de las
   secciones que no se mandaron al modelo, con su nombre.

   ⚠ Esto NO es el sondeo. El progreso se lee del propio Supabase con la RLS del
     usuario (useIngesta), sin gastar una invocación por segundo.               */
interface ResumenTrabajo {
  jobId: string;
  counts: { verified: number; partial: number; none: number; api: number; total: number };
  /* ★ El consumo real de IA de esta ingesta. Viene del campo `usage` que
     devuelve el proveedor en cada llamada, no de una estimación nuestra.
     `llamadasSinUso` > 0 significa que el proveedor no reportó tokens en alguna
     llamada: entonces el total es un SUELO y se muestra con «≥». */
  consumo: {
    llamadas: number;
    tokensEntrada: number;
    tokensSalida: number;
    caracteresPrompt: number;
    caracteresDocumento: number;
    llamadasSinUso: number;
    desdeCache: boolean;
  } | null;
  /* Secciones que NO se mandaron al modelo, CON SU NOMBRE: se listan una a una. */
  contexto: { titulo: string; caracteres: number }[];
  /* Avisos por fuente (PDF sin capa de texto, imagen ilegible, fuente fallida). */
  avisos: string[];
}

/** Dónde se recuerda el trabajo en curso de ESTA pestaña. Solo para volver a la
 *  vista donde ibas: la VERDAD está en la base, esto es un marcapáginas. Si se
 *  pierde, el indicador del shell vuelve a encontrar el trabajo por su cuenta. */
const CLAVE_JOB = "corpus.ingesta.job";

/* ════════════════════════════════════════════════════════════════════════════
   PUERTA 3 · LA PLANTILLA ESTRUCTURADA — el informe previo del parseo.

   EL CONTRATO CON EL SERVIDOR (ruta de otro agente, POST /api/import/corpus-md):

     paso 1 · informe     { nombre, texto, confirmar: false }  → NO escribe nada
     paso 2 · confirmar   { nombre, texto, confirmar: true, token? } → a staging

   Dos viajes con el mismo cuerpo a propósito: el informe no puede dejar rastro
   en la base (si lo dejara, mirar ya sería importar) y el usuario tiene que
   poder cerrar la pestaña después de leerlo sin haber creado nada. El `token`,
   si el servidor lo devuelve, se le devuelve tal cual — es SU mecanismo de
   idempotencia, no nuestro.

   ★ POR QUÉ LA LECTURA ES TOLERANTE Y AUN ASÍ HONESTA. La ruta la escribe otro
   agente en paralelo y su forma exacta puede no coincidir con la que aquí se
   espera. Se aceptan los sinónimos razonables de cada campo (total/items,
   notas/notes, linea/line…) porque un nombre distinto no cambia el dato. Lo que
   NO se hace es rellenar huecos: si no se reconoce ni siquiera el total, esto
   devuelve null y la pantalla enseña la respuesta CRUDA diciendo que no la sabe
   leer — jamás un "0 items" tranquilizador que sería mentira.
   ════════════════════════════════════════════════════════════════════════════ */

/** Una línea del informe: lo que no encajó, o lo que hay que preguntar. */
interface InformeLinea {
  /** nº de línea del .md; null si el servidor no lo dio (no se inventa). */
  linea: number | null;
  texto: string;
}

interface Informe {
  /** items que entrarían a staging. Es el campo que decide si sabemos leer. */
  total: number;
  /** reparto por kind. Vacío = el servidor no lo desglosó, no "no hay". */
  tipos: { kind: string; n: number }[];
  /** líneas conservadas como nota (regla capital: nunca se descarta nada). */
  notas: InformeLinea[];
  /** lo que el parser NO adivina y va a preguntar (fechas ilegibles…). */
  preguntas: InformeLinea[];
  avisos: string[];
  /** idempotencia del servidor, si la usa. Se devuelve tal cual. */
  token: string | null;
}

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Primer valor numérico finito entre varias claves sinónimas. */
function numeroDe(o: Record<string, unknown>, claves: string[]): number | null {
  for (const k of claves) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/** Primer valor string no vacío entre varias claves sinónimas. */
function textoDe(o: Record<string, unknown>, claves: string[]): string | null {
  for (const k of claves) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/** Lista de strings: acepta el array directo e ignora lo que no sea texto. */
function listaTexto(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/** Lista de líneas: acepta strings sueltos y objetos {linea,texto} con sinónimos. */
function listaLineas(x: unknown): InformeLinea[] {
  if (!Array.isArray(x)) return [];
  const out: InformeLinea[] = [];
  for (const v of x) {
    if (typeof v === "string" && v.trim()) {
      out.push({ linea: null, texto: v });
    } else if (esObjeto(v)) {
      const texto = textoDe(v, ["texto", "text", "mensaje", "message", "raw", "contenido"]);
      if (!texto) continue;
      out.push({ linea: numeroDe(v, ["linea", "line", "lineNumber", "n"]), texto });
    }
  }
  return out;
}

/** Reparto por tipo: acepta el array [{kind,n}] y el mapa {work:5,bullet:20}. */
function listaTipos(x: unknown): { kind: string; n: number }[] {
  if (Array.isArray(x)) {
    const out: { kind: string; n: number }[] = [];
    for (const v of x) {
      if (!esObjeto(v)) continue;
      const kind = textoDe(v, ["kind", "tipo", "k", "nombre", "name"]);
      const n = numeroDe(v, ["n", "count", "total", "items", "cuantos"]);
      if (kind && n !== null) out.push({ kind, n });
    }
    return out;
  }
  if (esObjeto(x)) {
    const out: { kind: string; n: number }[] = [];
    for (const [kind, v] of Object.entries(x)) {
      if (typeof v === "number" && Number.isFinite(v)) out.push({ kind, n: v });
    }
    return out;
  }
  return [];
}

/**
 * Lee el informe del servidor. Devuelve null cuando NO reconoce la forma: eso
 * lleva a enseñar la respuesta cruda, no a inventarse un informe vacío.
 */
function normalizarInforme(json: unknown): Informe | null {
  if (!esObjeto(json)) return null;
  // El informe puede venir envuelto (`{ok, informe:{…}}`) o plano.
  const raiz = esObjeto(json.informe) ? json.informe : esObjeto(json.report) ? json.report : json;
  const total = numeroDe(raiz, ["total", "items", "staged", "count", "n"]);
  if (total === null) return null;
  return {
    total,
    tipos: listaTipos(raiz.porTipo ?? raiz.tipos ?? raiz.byKind ?? raiz.kinds),
    notas: listaLineas(raiz.notas ?? raiz.notes ?? raiz.sinUbicar ?? raiz.unmatched),
    preguntas: listaLineas(raiz.preguntas ?? raiz.dudas ?? raiz.questions ?? raiz.marcados),
    avisos: listaTexto(raiz.avisos ?? raiz.warnings ?? raiz.aviso),
    token: textoDe(raiz, ["token", "idempotencia", "importId", "id"]) ?? textoDe(json, ["token"]),
  };
}

/** Mensaje de error del servidor si lo trae; si no, null (no se maquilla). */
function errorDe(json: unknown): string | null {
  if (!esObjeto(json)) return null;
  return textoDe(json, ["error", "message", "mensaje", "detalle"]);
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
  if (ext === "md" || ext === "markdown") return "importar.tag.md";
  if (ext === "txt" || ext === "text") return "importar.tag.text";
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

/* El detector de tipo vive en @/lib/db/sources (fileKindFromName), compartido con
   Fuentes y con las rutas de API. Antes había aquí una copia que NO reconocía el
   .md — el mismo .md que la zona de arrastre lleva anunciando como fuente
   soportada: la interfaz se contradecía con su propio validador delante del
   usuario. Una sola lista, un solo sitio. */

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

/* Salida declarada cuando nadie dijo de dónde venías. Nunca se queda sin una. */
const FALLBACK = "/app";

export function ImportarScreen() {
  const t = useT();
  // El idioma, para formatear los miles del consumo con la convención correcta
  // (31.245 en ES, 31,245 en EN). Un número mal agrupado se lee como otro número.
  const { lang } = useLang();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDrag, setIsDrag] = useState(false);
  const [screen, setScreen] = useState<Screen>("idle");
  const [result, setResult] = useState<ResumenTrabajo | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  /* ── EL TRABAJO DURABLE ───────────────────────────────────────────────────
     `jobId` es lo ÚNICO que esta pantalla guarda de la ingesta. Todo lo demás
     —qué fuente va, en qué etapa, cuántos items llevan— se lee de la base a
     través de `useIngesta`. Por eso volver a esta pantalla (o abrirla en otra
     pestaña) RETOMA la vista donde iba en vez de empezar de cero: el estado
     nunca estuvo en la pestaña. */
  const [jobId, setJobId] = useState<string | null>(null);
  const { progreso, reanudando, error: errObs } = useIngesta(jobId, true);
  const cerrado = useRef<string | null>(null);

  /* ── Puerta 3 · la plantilla estructurada ────────────────────────────────
     `plTexto` guarda el contenido leído del fichero para poder MANDARLO OTRA
     VEZ al confirmar. Alternativa descartada: que el informe deje el .md
     guardado en el servidor y el confirmar lo referencie — eso convertiría el
     mero hecho de mirar en una escritura, y el informe tiene que poder
     abandonarse sin dejar rastro. El .md son unos pocos KB: reenviarlo es
     barato y deja la ruta sin estado entre los dos viajes. */
  const [plName, setPlName] = useState<string | null>(null);
  const [plTexto, setPlTexto] = useState("");
  const [plBusy, setPlBusy] = useState(false);
  const [plConfBusy, setPlConfBusy] = useState(false);
  const [plErr, setPlErr] = useState<string | null>(null);
  const [plInf, setPlInf] = useState<Informe | null>(null);
  /* La respuesta que NO supimos leer, tal cual. Se enseña en vez de fingir un
     informe: el usuario tiene derecho a ver qué contestó el servidor. */
  const [plRaw, setPlRaw] = useState<string | null>(null);
  const plPanelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  /* ── ¿Hay master que exportar? ────────────────────────────────────────────
     La descarga por defecto de /api/master/plantilla devuelve TU master cuando
     lo hay, y el esqueleto cuando no. El botón tiene que decir cuál de las dos
     cosas va a bajar, así que la pantalla necesita el número de items.

     `null` = todavía no lo sabemos (o la consulta falló). Se rotula como
     «plantilla» y NO se ofrece «en blanco» aparte: prometer un fichero que a lo
     mejor está vacío es peor que no ofrecerlo. Se pide `?v=estado`, que devuelve
     `{items:n}` y nada más, en vez de /api/master, que baja los items con su
     `data` entero —cientos de KB— para acabar mirando un `length`. En el
     servidor cuesta la misma lectura; lo que se ahorra es la red. */
  const [plMasterItems, setPlMasterItems] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch("/api/master/plantilla?v=estado", { cache: "no-store" });
        if (!res.ok) return; // 401 sin sesión: se queda en null, sin ruido.
        const j = (await res.json()) as { items?: unknown };
        if (vivo && typeof j.items === "number") setPlMasterItems(j.items);
      } catch {
        /* sin red: null, y la pantalla ofrece las dos versiones que no dependen
           de la base. Un fallo aquí no puede tumbar la puerta 3. */
      }
    })();
    return () => { vivo = false; };
  }, []);
  const plHayMaster = (plMasterItems ?? 0) > 0;

  /* ── De dónde vienes (?from=) ────────────────────────────────────────────────
     El <Breadcrumb> resuelve su destino solo. Aquí hace falta el MISMO origen
     para PROPAGARLO al enlace de staging: cuando terminas de volcar, "volver"
     desde la revisión debe llevarte al sitio del que saliste (Fuentes), no a
     esta pantalla, que al remontarse ya no recuerda nada. Se lee de
     window.location.search en vez de useSearchParams() para no arrastrar un
     límite de <Suspense> hasta el CTA; hasta que hidrata vale el fallback, que
     ya es una salida válida. */
  const [origen, setOrigen] = useState(FALLBACK);
  useEffect(() => {
    setOrigen(readOrigin(window.location.search, FALLBACK));
  }, []);

  // Cliente de Supabase del navegador: la subida es DIRECTA a Storage (los
  // archivos nunca pasan por el body de la ruta, límite 4,5 MB de Vercel).
  const supabase = useMemo(() => createClient(), []);

  // ── ceremonia de entrada ──────────────────────────────────────────────────
  const ovRef = useRef<HTMLSpanElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const splitDone = useRef(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const liPanelRef = useRef<HTMLDivElement>(null);
  const prevLi = useRef(false);

  // ── ingesta ─────────────────────────────────────────────────────────────
  const stIngestRef = useRef<HTMLElement>(null);
  const stDoneRef = useRef<HTMLElement>(null);
  const finPanelRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const revealed = useRef<Set<string>>(new Set());
  const running = useRef(false);

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
    const kind = fileKindFromName(file.name, file.type || undefined);
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

  /* ── Las tres puertas: cada tarjeta LLEVA a su superficie de trabajo ──────
     Las tres superficies están montadas siempre (ninguna puerta detrás de un
     desplegable); las tarjetas solo mueven el foco a la que toca. Que la 1 y la
     2 compartan caja es un hecho del volcado, no un intento de esconder la 3:
     por eso la 3 tiene panel propio y su propia entrada en el índice. */
  // El desplazamiento respeta prefers-reduced-motion (M.rm()): un scroll suave
  // no deja de ser movimiento, y aquí lo dispara un control, no el usuario.
  const scrollBehavior = (): ScrollBehavior => (window.CorpusMotion?.rm() ? "auto" : "smooth");

  function irAPuerta1() {
    taRef.current?.focus();
    taRef.current?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  }
  function irAPuerta2() {
    // El <DropZone> compartido no expone ref; su botón sí tiene id="drop" y su
    // click abre el selector nativo, que es exactamente lo que la puerta promete.
    document.getElementById("drop")?.click();
  }
  function irAPuerta3() {
    const el = plPanelRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: scrollBehavior() });
    el.focus();
  }

  /* ── Puerta 3 · leer la plantilla (informe previo, sin escribir nada) ───── */
  function resetPlantilla() {
    setPlName(null);
    setPlTexto("");
    setPlErr(null);
    setPlInf(null);
    setPlRaw(null);
  }

  async function leerPlantilla(list: File[]) {
    const file = list[0];
    if (!file) return;
    setPlErr(null);
    setPlInf(null);
    setPlRaw(null);
    setPlName(file.name);

    // El filtro por extensión es del CLIENTE y es una cortesía, no una barrera:
    // manda un aviso claro y redirige a la puerta que sí lee ese tipo. Un PDF
    // aquí no es un error del usuario, es una puerta equivocada.
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (ext !== "md" && ext !== "markdown") {
      setPlErr(t("importar.pl.badExt"));
      return;
    }

    setPlBusy(true);
    try {
      const texto = await file.text();
      if (!texto.trim()) {
        setPlErr(t("importar.pl.empty"));
        return;
      }
      setPlTexto(texto);
      const res = await fetch("/api/import/corpus-md", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: file.name, texto, confirmar: false }),
      });
      // Se lee como TEXTO y se parsea a mano: si la ruta aún no existe, la
      // respuesta es HTML de Next y res.json() reventaría con un error de
      // sintaxis que no le dice nada a nadie. Así el fallo se puede contar.
      const cuerpo = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(cuerpo);
      } catch {
        json = null;
      }
      if (!res.ok) {
        throw new Error(errorDe(json) ?? `${t("importar.pl.failed")} (HTTP ${res.status})`);
      }
      const inf = normalizarInforme(json);
      if (!inf) {
        // Recortado: la respuesta cruda es para diagnosticar, no para volcar
        // media base de datos en la pantalla.
        setPlRaw(cuerpo.slice(0, 4000));
        return;
      }
      setPlInf(inf);
    } catch (e) {
      setPlErr(e instanceof Error ? e.message : t("importar.pl.failed"));
    } finally {
      setPlBusy(false);
    }
  }

  /* ── Puerta 3 · confirmar: SEGUNDO viaje, el único que escribe ─────────── */
  async function confirmarPlantilla() {
    if (!plInf || plConfBusy) return;
    setPlConfBusy(true);
    setPlErr(null);
    try {
      const res = await fetch("/api/import/corpus-md", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: plName,
          texto: plTexto,
          confirmar: true,
          ...(plInf.token ? { token: plInf.token } : {}),
        }),
      });
      const cuerpo = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(cuerpo);
      } catch {
        json = null;
      }
      if (!res.ok) {
        throw new Error(errorDe(json) ?? `${t("importar.pl.failed")} (HTTP ${res.status})`);
      }
      // A staging, arrastrando el origen: "volver" desde la revisión tiene que
      // devolverte al sitio del que saliste, no a esta pantalla.
      router.push(withOrigin("/app/staging", origen));
    } catch (e) {
      setPlErr(e instanceof Error ? e.message : t("importar.pl.failed"));
      setPlConfBusy(false);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     LA ESPERA — progreso específico y verdadero, jamás un porcentaje
     ══════════════════════════════════════════════════════════════════════════
     Antes, esta función HACÍA la ingesta: pintaba un log a mano, esperaba una
     respuesta que podía tardar minutos y, si te ibas de la pantalla, te
     quedabas sin saber qué pasó. Ahora crea el trabajo, guarda su id y se
     dedica a MIRAR. Todo lo que se enseña sale de `useIngesta`, que lee la base.
     ══════════════════════════════════════════════════════════════════════════ */

  function setCount(to: number, dur: number) {
    const el = countRef.current;
    if (!el) return;
    const M = window.CorpusMotion;
    if (M) M.counter(el, to, { dur });
    else el.textContent = String(to);
  }

  // reveal-once por fila; la clave es el id de la FUENTE, que es estable entre
  // sondeos (a diferencia de un índice de array, que bailaría al reordenar).
  const rowRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el && !revealed.current.has(id)) {
      revealed.current.add(id);
      window.CorpusMotion?.reveal(el);
    }
  };

  /* ── Al montar: ¿había un trabajo a medias? ───────────────────────────────
     El marcapáginas está en localStorage, pero la VERDAD la trae el sondeo: si
     el trabajo ya no existe o ya terminó, el efecto de abajo lo resuelve. Aquí
     solo se recupera el id y se entra en modo espera. */
  useEffect(() => {
    const guardado = window.localStorage.getItem(CLAVE_JOB);
    if (guardado) {
      setJobId(guardado);
      setScreen("ingest");
    }
  }, []);

  /* ── El contador y el cierre, gobernados por lo que dice la base ────────── */
  useEffect(() => {
    if (!progreso || screen !== "ingest") return;
    setCount(progreso.items, 600);
    window.CorpusAurora?.setState(progreso.pausado ? "calm" : "active");
  }, [progreso, screen]);

  useEffect(() => {
    if (!jobId || !progreso?.terminado || screen === "done") return;
    // Una sola vez por trabajo: sin este candado, un re-render volvería a pedir
    // el resumen (y a gastar una invocación) en cada vuelta.
    if (cerrado.current === jobId) return;
    cerrado.current = jobId;

    let cancelado = false;
    void (async () => {
      try {
        const res = await fetch(`/api/import/job/${jobId}`);
        const data = (await res.json()) as ResumenTrabajo & { error?: string };
        if (!res.ok) throw new Error(data.error || t("importar.extractFailed"));
        if (cancelado) return;
        setResult(data);
        setWarnings(data.avisos ?? []);
      } catch (e) {
        if (!cancelado) setErr(e instanceof Error ? e.message : t("importar.extractFailed"));
      } finally {
        if (!cancelado) {
          // El marcapáginas se borra SIEMPRE al cerrar, incluso si el resumen
          // falló: el trabajo terminó de verdad y dejarlo apuntado haría que la
          // próxima visita entrara en modo espera de algo que ya no espera.
          window.localStorage.removeItem(CLAVE_JOB);
          window.CorpusAurora?.setState("calm");
          setScreen("done");
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [jobId, progreso?.terminado, screen, t]);

  /** Crea el trabajo. Devuelve enseguida: el trabajo de verdad ya está en marcha
   *  en el servidor y su estado vive en la base, no aquí. */
  async function runIngest() {
    if (running.current || uploading) return;
    running.current = true;
    setErr(null);

    if (countRef.current) countRef.current.textContent = "0";
    revealed.current.clear();
    cerrado.current = null;
    setResult(null);
    setWarnings([]);
    setScreen("ingest");
    window.CorpusAurora?.setState("active");

    // Archivos ya subidos: van por referencia (path), nunca por el body.
    const sendFiles = okFiles.map((f) => ({ path: f.path, name: f.name, kind: f.kind }));

    try {
      const res = await fetch("/api/import/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, files: sendFiles }),
      });
      const data = (await res.json()) as { jobId?: string; warnings?: string[]; error?: string };
      if (!res.ok || !data.jobId) throw new Error(data.error || t("importar.extractFailed"));

      window.localStorage.setItem(CLAVE_JOB, data.jobId);
      setJobId(data.jobId);
      if (data.warnings?.length) setWarnings(data.warnings);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("importar.extractFailed"));
      window.CorpusAurora?.setState("calm");
      setScreen("idle");
    } finally {
      running.current = false;
    }
  }

  /** El nombre visible de una fuente. El texto pegado no tiene nombre de
   *  archivo: su etiqueta la pone AQUÍ el diccionario, no la base de datos. */
  function nombreDe(l: LineaFuente): string {
    return l.nombrado ? l.nombre : t("importar.log.pastedText");
  }

  /** El detalle de una fila del log: la etapa REAL, y al terminar sus items. */
  function detalleDe(l: LineaFuente): string {
    if (l.estado === "failed") return l.error ?? t("ingesta.etapa.fallida");
    if (l.estado === "extracted") {
      const n = l.items ?? 0;
      if (n === 0) return t("importar.job.cero");
      return n === 1 ? t("importar.job.itemsFuenteUno") : t("importar.job.itemsFuente").replace("{n}", String(n));
    }
    // `etapa` es la CLAVE de i18n tal cual la guardó el servidor en
    // ingestion_events.message: se traduce directamente, sin tabla intermedia.
    return l.etapa ? t(l.etapa) : t("ingesta.etapa.encolada");
  }

  const filas: LineaFuente[] = progreso?.fuentes ?? [];

  return (
    <div className="c-page">
      {/* El fondo vivo lo monta UNA vez el shell de /app; aquí solo se declara la
          intensidad. Volcar es hojear y esperar, así que va al valor alto. */}
      <AuroraTune strength={AURORA_HOJEO} />

      <header className="c-header">
        <div className="c-container">
          <div className="hd-crumb">
            <Link className="c-logo" href="/app">
              Corpus
            </Link>
            <span className="hd-sep" />
            {/* La salida: vuelve a donde estabas (?from=), no "al Panel". */}
            <Breadcrumb fallback={FALLBACK} current={t("nav.importar")} />
            <span className="hd-sep imp-hd-sep-step" />
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

          {/* ═══ EL ÍNDICE DE LAS TRES PUERTAS ═════════════════════════════
              Antes esta pantalla tenía dos puertas (pegar y subir) metidas en
              la misma caja y NINGUNA decía que gastan IA: el coste se
              descubría en el informe del final, cuando ya se había pagado. Y
              la tercera vía —la que más se va a usar y la única sin coste ni
              invención— no existía en la interfaz, vivía en la documentación.

              Las tres van aquí arriba, con el mismo tamaño, y cada una lleva
              su etiqueta de coste EN LA CARA. No es un menú que oculte nada:
              las tres superficies de trabajo están montadas más abajo y estas
              tarjetas solo llevan el foco a la que toca. ═══════════════════ */}
          <div
            className="imp-doors"
            role="group"
            aria-label={t("importar.puertas.aria")}
            data-reveal
            style={{ "--d": "580ms" } as React.CSSProperties}
          >
            <span className="t-overline imp-doors__h">{t("importar.puertas.overline")}</span>
            <div className="imp-doors__row">
              <button type="button" className="imp-door" id="puerta1" onClick={irAPuerta1}>
                <span className="n">01</span>
                <span className="h">{t("importar.puerta1.title")}</span>
                <span className="d">{t("importar.puerta1.body")}</span>
                <span className="cost cost--ia">{t("importar.puerta1.cost")}</span>
                <span className="go">{t("importar.puerta1.go")} →</span>
              </button>
              <button type="button" className="imp-door" id="puerta2" onClick={irAPuerta2}>
                <span className="n">02</span>
                <span className="h">{t("importar.puerta2.title")}</span>
                <span className="d">{t("importar.puerta2.body")}</span>
                <span className="cost cost--ia">{t("importar.puerta2.cost")}</span>
                <span className="go">{t("importar.puerta2.go")} →</span>
              </button>
              <button type="button" className="imp-door" id="puerta3" onClick={irAPuerta3}>
                <span className="n">03</span>
                <span className="h">{t("importar.puerta3.title")}</span>
                <span className="d">{t("importar.puerta3.body")}</span>
                <span className="cost cost--free">{t("importar.puerta3.cost")}</span>
                <span className="go">{t("importar.puerta3.go")} →</span>
              </button>
            </div>
          </div>

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
              setIsDrag(false);
              // La caja entera acepta sueltes, pero dentro vive el <DropZone>
              // compartido, que ya añade lo que le cae encima. Sin esta guarda
              // el evento burbujea y el mismo archivo entraría DOS VECES.
              if ((e.target as HTMLElement).closest?.(".dz")) return;
              if (e.dataTransfer) addFiles(e.dataTransfer.files);
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

            {/* El gesto canónico, ya compartido con Fuentes (components/DropZone). */}
            <DropZone
              id="drop"
              className="imp-drop"
              accept={FILE_ACCEPT}
              multiple
              onFiles={addFiles}
              label={
                <>
                  <b>{t("importar.drop.bold")}</b>
                  {t("importar.drop.rest")}
                  <br />
                  {t("importar.drop.line2")}
                </>
              }
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

          {/* ═══ PUERTA 3 · LA PLANTILLA ESTRUCTURADA ══════════════════════
              Vive FUERA de .imp-box a propósito: esa caja captura los sueltes
              en toda su superficie, y una zona de arrastre suya dentro daría
              de alta el mismo fichero dos veces (el suelte burbujea). Aquí,
              como hermana, no hay solape posible.

              El molde es el del panel de LinkedIn: título + párrafo + <ol>
              numerado. Un procedimiento de tres pasos explicado con dignidad,
              que es exactamente lo que esto es. ═══════════════════════════ */}
          <div
            className="c-panel imp-pl"
            id="plantilla"
            ref={plPanelRef}
            tabIndex={-1}
            data-screen-label="importar-plantilla"
            data-reveal
            style={{ "--d": "820ms" } as React.CSSProperties}
          >
            <span className="t-overline">{t("importar.pl.overline")}</span>
            <h3>{t("importar.pl.title")}</h3>
            <p className="imp-pl__lead">{t("importar.pl.body")}</p>
            <ol>
              <li>
                <span className="n">01</span>
                <div className="h">{t("importar.pl.s1.h")}</div>
                <div className="d">
                  <p>{t("importar.pl.s1.d")}</p>
                  {/* Ancla plana con `download`: el Content-Disposition lo pone
                      el servidor (mismo patrón que la descarga de datos de
                      Ajustes). Sin Blob ni createObjectURL — no hay nada que
                      construir en el cliente ni un revoke que temporizar.

                      EL RÓTULO DICE LO QUE BAJA: esta URL sin parámetros
                      devuelve tu master si lo tienes y el esqueleto si no, así
                      que la etiqueta cambia con el estado. Un botón que dijera
                      siempre «plantilla» y bajara 105 items sería una sorpresa,
                      y las sorpresas en una descarga se pagan en confianza. */}
                  <a className="c-btn imp-pl__dl" id="btnPlantilla" href="/api/master/plantilla" download>
                    {plHayMaster ? t("importar.pl.dl.mio") : t("importar.pl.download")}
                  </a>
                  {/* Las otras dos versiones del MISMO fichero. Enlaces
                      pequeños, no botones: son alternativas, no la acción
                      principal. Cada una lleva su `title` explicando qué trae.
                      «en blanco» solo aparece cuando el botón de arriba NO baja
                      el esqueleto; ofrecer dos veces lo mismo es ruido. */}
                  <p className="imp-note" style={{ marginTop: "10px" }}>
                    <span>{t("importar.pl.dl.otras")}</span>{" "}
                    {plHayMaster ? (
                      <>
                        <a href="/api/master/plantilla?v=blanco" download title={t("importar.pl.dl.blancoTitle")}>
                          {t("importar.pl.dl.blanco")}
                        </a>
                        <span aria-hidden="true"> · </span>
                      </>
                    ) : null}
                    <a href="/api/master/plantilla?v=ejemplo" download title={t("importar.pl.dl.ejemploTitle")}>
                      {t("importar.pl.dl.ejemplo")}
                    </a>
                  </p>
                </div>
              </li>
              <li>
                <span className="n">02</span>
                <div className="h">{t("importar.pl.s2.h")}</div>
                <div className="d">
                  <p>{t("importar.pl.s2.d")}</p>
                  <BloqueCopiable
                    id="plPrompt"
                    className="imp-pl__prompt"
                    texto={t("importar.pl.prompt")}
                    label={t("importar.pl.promptLabel")}
                    aria={t("importar.pl.promptAria")}
                    copiar={t("importar.pl.copiar")}
                    copiado={t("importar.pl.copiado")}
                    fallo={t("importar.pl.copiaFallo")}
                  />
                </div>
              </li>
              <li>
                <span className="n">03</span>
                <div className="h">{t("importar.pl.s3.h")}</div>
                <div className="d">
                  <p>{t("importar.pl.s3.d")}</p>
                  <DropZone
                    id="plDrop"
                    className="imp-pl__drop"
                    accept=".md,.markdown,text/markdown"
                    disabled={plBusy || plConfBusy}
                    onFiles={leerPlantilla}
                    label={
                      <>
                        <b>{t("importar.pl.drop.bold")}</b>
                        {t("importar.pl.drop.rest")}
                        <br />
                        {t("importar.pl.drop.line2")}
                      </>
                    }
                  />

                  {plName ? (
                    <p className="imp-pl__file">
                      <span className="k">{t("importar.pl.fileLabel")}</span>
                      <b>{plName}</b>
                      {plBusy ? (
                        <span className="busy" role="status" aria-live="polite">
                          <span className="c-spin">⟳</span> {t("importar.pl.reading")}
                        </span>
                      ) : (
                        <button type="button" className="imp-pl__otro" onClick={resetPlantilla}>
                          {t("importar.pl.otro")}
                        </button>
                      )}
                    </p>
                  ) : null}

                  {plErr ? (
                    <p className="imp-pl__err" role="alert">
                      {plErr}
                    </p>
                  ) : null}

                  {/* La respuesta que no supimos leer, TAL CUAL. No se maquilla
                      como "0 items": eso sería decirle al usuario que su
                      fichero está vacío cuando lo que falla es la ruta. */}
                  {plRaw ? (
                    <div className="imp-pl__raw" role="alert">
                      <p>{t("importar.pl.inf.rara")}</p>
                      <pre>{plRaw}</pre>
                    </div>
                  ) : null}

                  {/* ★ EL INFORME PREVIO. Se lee ANTES de que nada se mueva: el
                      servidor no ha escrito una línea todavía. Solo el botón de
                      confirmar dispara el segundo viaje. */}
                  {plInf ? (
                    <div className="imp-pl__inf">
                      <span className="t-overline">{t("importar.pl.inf.overline")}</span>
                      {plInf.total > 0 ? (
                        <p className="imp-pl__tot">
                          {plInf.total === 1
                            ? t("importar.pl.inf.totalUno")
                            : t("importar.pl.inf.total").replace("{n}", String(plInf.total))}
                        </p>
                      ) : (
                        <p className="imp-pl__err" role="alert">
                          {t("importar.pl.inf.cero")}
                        </p>
                      )}

                      {plInf.tipos.length > 0 ? (
                        <div className="imp-pl__blk">
                          <span className="imp-pl__k">{t("importar.pl.inf.tipos")}</span>
                          <div className="imp-pl__tipos">
                            {plInf.tipos.map((x) => (
                              <span className="c-chip" key={x.kind}>
                                <b>{x.n}</b>
                                <span>{x.kind}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Lo que no encajó. La regla capital del producto en una
                          lista: se conserva CON su número de línea. */}
                      {plInf.notas.length > 0 ? (
                        <div className="imp-pl__blk">
                          <span className="imp-pl__k">{t("importar.pl.inf.notas")}</span>
                          <p className="imp-pl__blkd">{t("importar.pl.inf.notasBody")}</p>
                          <ul className="imp-pl__lines">
                            {plInf.notas.map((l, i) => (
                              <li key={i}>
                                {l.linea !== null ? (
                                  <span className="ln">
                                    {t("importar.pl.inf.linea").replace("{n}", String(l.linea))}
                                  </span>
                                ) : null}
                                <span className="tx">{l.texto}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {plInf.preguntas.length > 0 ? (
                        <div className="imp-pl__blk">
                          <span className="imp-pl__k">{t("importar.pl.inf.preguntas")}</span>
                          <p className="imp-pl__blkd">{t("importar.pl.inf.preguntasBody")}</p>
                          <ul className="imp-pl__lines">
                            {plInf.preguntas.map((l, i) => (
                              <li key={i}>
                                {l.linea !== null ? (
                                  <span className="ln">
                                    {t("importar.pl.inf.linea").replace("{n}", String(l.linea))}
                                  </span>
                                ) : null}
                                <span className="tx">{l.texto}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {plInf.avisos.length > 0 ? (
                        <div className="imp-pl__blk">
                          <span className="imp-pl__k">{t("importar.pl.inf.avisos")}</span>
                          <ul className="imp-pl__lines">
                            {plInf.avisos.map((a, i) => (
                              <li key={i}>
                                <span className="tx">{a}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {plInf.total > 0 ? (
                        <div className="imp-pl__acts">
                          <button
                            type="button"
                            className="c-btn c-btn--patina"
                            id="plConfirm"
                            disabled={plConfBusy}
                            onClick={() => void confirmarPlantilla()}
                          >
                            {plConfBusy ? t("importar.pl.inf.confirmando") : t("importar.pl.inf.confirmar")}
                          </button>
                          <button type="button" className="imp-pl__cancel" onClick={resetPlantilla}>
                            {t("importar.pl.inf.cancelar")}
                          </button>
                        </div>
                      ) : null}
                      <p className="imp-pl__sub">{t("importar.pl.inf.sub")}</p>
                    </div>
                  ) : null}
                </div>
              </li>
            </ol>
          </div>

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
          {/* La fuente CONCRETA que se está leyendo, con su número de orden. No
              hay barra de progreso porque no hay dato para dibujarla: una
              captura tarda dos segundos y un PDF de cuarenta páginas, minuto y
              medio. Se dice QUÉ se hace, que sí se sabe. */}
          {progreso?.actual ? (
            <div className="ing-cap" aria-live="polite">
              {t("importar.job.fuente")
                .replace("{i}", String(progreso.actual.indice))
                .replace("{n}", String(progreso.total))}
              {" · "}
              {nombreDe(progreso.actual)}
            </div>
          ) : null}

          <div className="c-panel ing-log" id="log" aria-live="polite">
            {filas.map((l) => {
              /* ★ El estado VISUAL no es el de la base: una fuente que terminó
                 con CERO items no lleva ✓ verde. Ese tick sobre un cero era
                 justo la mentira de las 14 capturas. La lógica vive en
                 `estadoVisual` (pura, con su mutante en los tests) y no aquí:
                 el shell y esta pantalla tienen que contar lo mismo. */
              const st = estadoVisual(l);
              return (
                <div key={l.id} ref={rowRef(l.id)} className={`ing-row is-${st === "aviso" ? "err" : st}`}>
                  <span className="st" aria-hidden="true">
                    {st === "run" ? (
                      <span className="c-spin">⟳</span>
                    ) : st === "ok" ? (
                      "✓"
                    ) : st === "aviso" ? (
                      "⚠"
                    ) : (
                      "✕"
                    )}
                  </span>
                  <span className="src">{nombreDe(l)}</span>
                  <span className="det">{detalleDe(l)}</span>
                </div>
              );
            })}
          </div>

          {/* ★ LA PAUSA, DICHA CON TODAS SUS LETRAS. Cuando una invocación se
              queda sin presupuesto el trabajo NO se ha roto: está esperando. Se
              explica y se ofrece el botón, aunque el observador ya lo esté
              retomando solo — un usuario mirando una pantalla quieta merece
              saber por qué está quieta y poder empujar él. */}
          {progreso?.pausado ? (
            <div className="c-card" style={{ width: "100%", marginTop: 14, textAlign: "left", padding: "16px 20px" }} role="status">
              <span className="t-overline">{t("importar.job.pausadoTitle")}</span>
              <p style={{ margin: "10px 0 0", color: "var(--text-muted)", fontSize: "var(--fs-ui)" }}>
                {t("importar.job.pausadoBody")}
              </p>
              <p style={{ margin: "10px 0 0" }}>
                <button
                  type="button"
                  className="c-btn"
                  disabled={reanudando}
                  onClick={() => {
                    if (!jobId) return;
                    void fetch(`/api/import/job/${jobId}/avanzar`, { method: "POST" }).catch(() => {});
                  }}
                >
                  {reanudando ? (
                    <>
                      <span className="c-spin">⟳</span> {t("importar.job.retomando")}
                    </>
                  ) : (
                    t("importar.job.pausadoCta")
                  )}
                </button>
              </p>
            </div>
          ) : null}

          {/* El fallo del SONDEO no se traga: si la pantalla no puede leer el
              estado, lo dice — el trabajo puede seguir vivo en el servidor. */}
          {errObs ? (
            <p className="imp-note" role="alert" style={{ color: "var(--danger)" }}>
              {t("importar.job.sondeoFallo").replace("{motivo}", errObs)}
            </p>
          ) : null}

          <p className="ing-hint">
            {t("importar.ing.hint1")}
            <br />
            {t("importar.ing.hint2")}
            <br />
            {t("importar.job.seguir")}
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

          {/* ★ EL CONSUMO, A LA VISTA. Antes no se leía el `usage` que devuelve el
              proveedor en NINGUNA de las llamadas del repo, así que el gasto era
              invisible: se podía multiplicar por cinco sin que apareciera en
              ninguna pantalla — y lo estaba. Sin precio en pesos (el plan de cada
              uno es distinto e inventarlo sería un número sin fuente); con los
              hechos, que sí son verificables. */}
          {result?.consumo ? (
            <div className="c-card" style={{ width: "100%", marginTop: 14, textAlign: "left", padding: "16px 20px" }}>
              <span className="t-overline">{t("importar.fin.consumo.overline")}</span>
              <p style={{ margin: "10px 0 0", color: "var(--text-muted)", fontSize: "var(--fs-ui)" }}>
                {result.consumo.desdeCache
                  ? t("importar.fin.consumo.cache")
                  : [
                      t("importar.fin.consumo.leido").replace(
                        "{kb}",
                        String(Math.max(1, Math.round(result.consumo.caracteresDocumento / 1024))),
                      ),
                      result.consumo.llamadas === 1
                        ? t("importar.fin.consumo.llamadasUna")
                        : t("importar.fin.consumo.llamadas").replace("{n}", String(result.consumo.llamadas)),
                      // Con alguna llamada sin `usage`, el total NO se presenta
                      // como exacto: se dice «≥» y cuántas faltan.
                      result.consumo.llamadasSinUso > 0
                        ? t("importar.fin.consumo.tokensSuelo")
                            .replace("{n}", result.consumo.tokensEntrada.toLocaleString(lang === "en" ? "en-US" : "es-CL"))
                            .replace("{sin}", String(result.consumo.llamadasSinUso))
                        : t("importar.fin.consumo.tokens").replace(
                            "{n}",
                            result.consumo.tokensEntrada.toLocaleString(lang === "en" ? "en-US" : "es-CL"),
                          ),
                    ].join(" · ")}
              </p>
              {result.consumo.desdeCache ? null : (
                <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: "var(--fs-micro, 12px)" }}>
                  {t("importar.fin.consumo.nota")}
                </p>
              )}
            </div>
          ) : null}

          {/* ★★ LAS SECCIONES QUE NO SE MANDARON AL MODELO, UNA A UNA Y POR SU
              NOMBRE. Esta es la regla capital del producto: ningún dato del
              usuario se descarta en silencio. El reparto por secciones ahorra
              justo porque no manda a extraer el relato del cuestionario — y
              precisamente por eso el usuario tiene que VER exactamente qué se
              quedó fuera y poder pedir que se lea entero. */}
          {result && result.contexto.length > 0 ? (
            <div className="c-card" style={{ width: "100%", marginTop: 14, textAlign: "left", padding: "16px 20px" }}>
              <span className="t-overline">{t("importar.fin.contexto.overline")}</span>
              <p style={{ margin: "10px 0 0", color: "var(--text-muted)", fontSize: "var(--fs-ui)" }}>
                {(result.contexto.length === 1
                  ? t("importar.fin.contexto.bodyUna")
                  : t("importar.fin.contexto.body").replace("{n}", String(result.contexto.length))
                ).replace(
                  "{kb}",
                  String(
                    Math.max(1, Math.round(result.contexto.reduce((n, s) => n + s.caracteres, 0) / 1024)),
                  ),
                )}
              </p>
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--text-muted)", fontSize: "var(--fs-ui)" }}>
                {result.contexto.map((s, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {s.titulo}{" "}
                    <span style={{ opacity: 0.7 }}>
                      · {t("importar.fin.contexto.chars").replace("{n}", s.caracteres.toLocaleString(lang === "en" ? "en-US" : "es-CL"))}
                    </span>
                  </li>
                ))}
              </ul>
              <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: "var(--fs-micro, 12px)" }}>
                {t("importar.fin.contexto.releer")}
              </p>
            </div>
          ) : null}

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
              <Link className="c-btn c-btn--forge c-btn--hero" href={withOrigin("/app/staging", origen)}>
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
