"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useBoot } from "@/lib/corpus/runtime";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { fileKindFromName, FILE_ACCEPT, type FileKind } from "@/lib/db/sources";
import { AuroraTune, AURORA_TRABAJO } from "@/components/Aurora";
import { Breadcrumb } from "@/components/Breadcrumb";
import "./tailor.css";

/* ============================================================================
   Adaptar el CV a una oferta (bloque C · punto 3 del contrato). YA CABLEADA.

   QUÉ FUE ESTO Y POR QUÉ YA NO. Esta pantalla nació como una MAQUETA (el análisis
   de una persona inventada rotulado como del usuario) y se dejó, con toda razón,
   como ESTADO VACÍO HONESTO: no leía nada, no podía pintar mal nada. Ese estado era
   una promesa —«cuando exista, hará esto»— y esto es su cumplimiento.

   Ahora sí lee datos del usuario, y por eso ahora sí tiene la obligación de no
   mentir. La disciplina entera vive en el motor puro (lib/cv/tailor.ts) y en las
   rutas: aquí solo se PINTA lo que el servidor ya validó. Los candados que importan:

     · Los TRES GRUPOS, con un botón distinto cada uno:
         — «ya en la variante»: se enseña, no se toca.
         — «en tu master, no aquí»: un clic para añadirlo (sigue siendo tuyo).
         — «el aviso lo pide y no lo tienes»: se ENSEÑA, y NO tiene botón de añadir.
           Añadir algo que no tienes sería mentir en un CV, y eso no se ofrece.
     · NADA se aplica en bloque. Cada reformulación es original-contra-propuesto y se
       acepta una a una; el servidor vuelve a pasar preservesFacts al aceptar.
     · NUNCA un score ni un porcentaje de match: el propio copy lo promete por escrito.

   El [id] de la ruta SÍ manda: es la variante que se está adaptando. Sin un [id]
   utilizable no se puede analizar (no hay variante), y se cae a las salidas de abajo.
   ============================================================================ */

/** Salida de último recurso cuando la ruta no trae un [id] utilizable. */
const FALLBACK = "/app/variantes";

/**
 * Ruta de la variante abierta a partir del [id] crudo del route, o null si no hay un
 * id con el que construir una ruta honesta. Rechaza lo que no sea un segmento simple.
 *
 * ⚠ Está DUPLICADA a propósito en SaludScreen (mismas 6 líneas); tests/costuras.test.ts
 * pasa la MISMA batería a las dos copias, así que divergir en silencio no es posible.
 */
export function rutaDeLaVariante(routeId: unknown): string | null {
  if (typeof routeId !== "string") return null;
  const id = routeId.trim();
  if (!id || id.includes("/") || id.includes("\\") || id.includes("..")) return null;
  return `/app/variantes/${encodeURIComponent(id)}`;
}

// ── El contrato que devuelve el servidor (lib/cv/tailor.ts → TailorResult) ────
interface ItemRelevante {
  id: string;
  itemId: string;
  kind: string;
  texto: string;
  cubre: string[];
}
interface RequisitoFalta {
  termino: string;
  evidencia: string;
}
interface PropuestaReformular {
  id: string;
  kind: string;
  campo: string;
  original: string;
  propuesto: string;
  motivo: string;
}
interface Analisis {
  tituloObjetivo: string;
  yaEnVariante: ItemRelevante[];
  enMasterNoEnVariante: ItemRelevante[];
  faltan: RequisitoFalta[];
  reformulaciones: PropuestaReformular[];
  resumen: string | null;
  notas: string;
}

type Tab = "paste" | "url" | "file";
type FileRef = { path: string; name: string; kind: FileKind };

/** Sanea el nombre para el path de Storage (mismo criterio que ImportarScreen). */
function safeName(name: string): string {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120) || "archivo";
}

export function TailorScreen() {
  const bootRef = useBoot<HTMLDivElement>();
  const t = useT();
  const routeId = useParams()?.id;
  // La variante real de la ruta; si no hay [id] usable, al listado.
  const variante = rutaDeLaVariante(routeId);
  const volverA = variante ?? FALLBACK;
  // El id crudo (ya validado por rutaDeLaVariante) para las llamadas al servidor.
  const idStr = typeof routeId === "string" ? routeId.trim() : "";
  const puedeAnalizar = supabaseEnabled && variante !== null;

  const supabase = useMemo(() => (supabaseEnabled ? createClient() : null), []);

  // Entrada del aviso.
  const [tab, setTab] = useState<Tab>("paste");
  const [offerText, setOfferText] = useState("");
  const [url, setUrl] = useState("");
  const [fileRef, setFileRef] = useState<FileRef | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileErr, setFileErr] = useState("");

  // Análisis.
  const [analizando, setAnalizando] = useState(false);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [analizarErr, setAnalizarErr] = useState("");
  const [avisos, setAvisos] = useState<string[]>([]);

  // Acciones por item (una a una, nunca en bloque).
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [reformErr, setReformErr] = useState<Record<string, string>>({});

  const hayEntrada =
    (tab === "paste" && offerText.trim().length >= 20) ||
    (tab === "url" && url.trim().length >= 4) ||
    (tab === "file" && fileRef !== null);

  async function subirArchivo(file: File) {
    if (!supabase) return;
    setFileErr("");
    const kind = fileKindFromName(file.name, file.type || undefined);
    if (!kind) {
      setFileErr(t("tailor.errAnalyze"));
      return;
    }
    setUploading(true);
    setFileRef(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setFileErr(t("tailor.errAnalyze"));
        return;
      }
      // Path {user_id}/{uuid}/{filename}: la RLS del bucket autoriza al dueño.
      const path = `${user.id}/${crypto.randomUUID()}/${safeName(file.name)}`;
      const { error } = await supabase.storage
        .from("sources")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) {
        setFileErr(error.message);
        return;
      }
      setFileRef({ path, name: file.name, kind });
    } catch (e) {
      setFileErr(e instanceof Error ? e.message : t("tailor.errAnalyze"));
    } finally {
      setUploading(false);
    }
  }

  async function analizar() {
    if (!puedeAnalizar || analizando || !hayEntrada) return;
    setAnalizando(true);
    setAnalizarErr("");
    setAvisos([]);
    // Reinicia el estado de acciones: el análisis anterior ya no aplica.
    setAddedIds(new Set());
    setAppliedIds(new Set());
    setReformErr({});
    const body: Record<string, unknown> = { accion: "analizar" };
    if (tab === "paste") body.offerText = offerText.trim();
    else if (tab === "url") body.url = url.trim();
    else if (tab === "file" && fileRef) body.files = [fileRef];
    try {
      const res = await fetch(`/api/variants/${idStr}/tailor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalizarErr(data.error || t("tailor.errAnalyze"));
        return;
      }
      setAnalisis(data.analisis as Analisis);
      setAvisos(Array.isArray(data.warnings) ? (data.warnings as string[]) : []);
    } catch {
      setAnalizarErr(t("tailor.errAnalyze"));
    } finally {
      setAnalizando(false);
    }
  }

  async function anadir(item: ItemRelevante) {
    if (addingId || addedIds.has(item.id)) return;
    setAddingId(item.id);
    try {
      const res = await fetch(`/api/variants/${idStr}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.itemId }),
      });
      if (!res.ok) throw new Error();
      setAddedIds((prev) => new Set(prev).add(item.id));
    } catch {
      setReformErr((prev) => ({ ...prev, [item.id]: t("tailor.errAdd") }));
    } finally {
      setAddingId(null);
    }
  }

  async function aplicarReform(r: PropuestaReformular) {
    if (applyingId || appliedIds.has(r.id)) return;
    setApplyingId(r.id);
    setReformErr((prev) => {
      const next = { ...prev };
      delete next[r.id];
      return next;
    });
    try {
      const res = await fetch(`/api/variants/${idStr}/tailor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "reformular", id: r.id, propuesto: r.propuesto }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReformErr((prev) => ({ ...prev, [r.id]: t("tailor.reformErr") + (data.error || "") }));
        return;
      }
      setAppliedIds((prev) => new Set(prev).add(r.id));
    } catch {
      setReformErr((prev) => ({ ...prev, [r.id]: t("tailor.errAdd") }));
    } finally {
      setApplyingId(null);
    }
  }

  function reiniciar() {
    setAnalisis(null);
    setAnalizarErr("");
    setAvisos([]);
    setOfferText("");
    setUrl("");
    setFileRef(null);
  }

  const gruposVacios =
    !!analisis &&
    analisis.yaEnVariante.length === 0 &&
    analisis.enMasterNoEnVariante.length === 0 &&
    analisis.faltan.length === 0 &&
    analisis.reformulaciones.length === 0;

  return (
    <div className="c-page" ref={bootRef}>
      {/* Leer un aviso y contrastarlo es trabajo denso: el humo baja. */}
      <AuroraTune strength={AURORA_TRABAJO} />
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
          </div>
        </div>
      </header>

      <div className="tl-bar" data-screen-label="tailor-toolbar">
        <div className="c-container">
          {/* La salida: a la variante que estás adaptando (o al ?from que te trajo). */}
          <Breadcrumb fallback={volverA} />
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
        <div className="c-container tl-wrap">
          {!analisis ? (
            <>
              {/* Intro / estado previo: antes de pegar un aviso no hay análisis. */}
              <span className="t-overline">{t("tailor.voidOverline")}</span>
              <h2 style={{ marginTop: "14px" }}>{t("tailor.voidTitle")}</h2>
              <p className="tl-void-body">{t("tailor.voidBody")}</p>
              <p className="tl-void-ethic">{t("tailor.voidEthic")}</p>

              {puedeAnalizar ? (
                <div className="c-card tl-entry">
                  <span className="t-overline">{t("tailor.entryOverline")}</span>
                  <h3 style={{ marginTop: "10px" }}>{t("tailor.entryTitle")}</h3>
                  <p className="tl-entry-body">{t("tailor.entryBody")}</p>

                  <div className="tl-tabs" role="tablist" aria-label={t("tailor.entryOverline")}>
                    {(["paste", "url", "file"] as Tab[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        role="tab"
                        aria-selected={tab === k}
                        className={`tl-tab${tab === k ? " on" : ""}`}
                        onClick={() => setTab(k)}
                      >
                        {t(k === "paste" ? "tailor.tabPaste" : k === "url" ? "tailor.tabUrl" : "tailor.tabFile")}
                      </button>
                    ))}
                  </div>

                  {tab === "paste" && (
                    <textarea
                      className="c-input tl-paste"
                      rows={6}
                      placeholder={t("tailor.pastePlaceholder")}
                      value={offerText}
                      onChange={(e) => setOfferText(e.target.value)}
                    />
                  )}

                  {tab === "url" && (
                    <div className="tl-urlrow">
                      <input
                        className="c-input"
                        type="url"
                        placeholder={t("tailor.urlPlaceholder")}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                      <span className="tl-hint">{t("tailor.urlHint")}</span>
                    </div>
                  )}

                  {tab === "file" && (
                    <div className="tl-filerow">
                      <label className="c-btn c-btn--quiet tl-filepick">
                        {uploading ? t("tailor.fileUploading") : fileRef ? fileRef.name : t("tailor.filePick")}
                        <input
                          type="file"
                          accept={FILE_ACCEPT}
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void subirArchivo(f);
                          }}
                        />
                      </label>
                      <span className="tl-hint">{t("tailor.fileHint")}</span>
                      {fileErr ? (
                        <p className="tl-err" role="alert">
                          {fileErr}
                        </p>
                      ) : null}
                    </div>
                  )}

                  <div className="tl-actions">
                    <button
                      type="button"
                      className="c-btn c-btn--patina"
                      disabled={analizando || uploading || !hayEntrada}
                      onClick={() => void analizar()}
                    >
                      {analizando ? t("tailor.analyzing") : t("tailor.analyze")}
                    </button>
                    <span className="tl-score">{t("tailor.scoreNever")}</span>
                  </div>
                  {analizarErr ? (
                    <p className="tl-err" role="alert">
                      {analizarErr}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              {/* ── El análisis: tres grupos, sin score ── */}
              <div className="tl-rhead">
                <span className="t-overline">{t("tailor.resultOverline")}</span>
                <button type="button" className="c-btn c-btn--quiet" onClick={reiniciar}>
                  {t("tailor.reAnalyze")}
                </button>
              </div>
              {analisis.tituloObjetivo ? (
                <p className="tl-target">
                  <span className="t-overline">{t("tailor.targetPrefix")}</span>
                  <b>{analisis.tituloObjetivo}</b>
                </p>
              ) : null}
              <p className="tl-score tl-score--result">{t("tailor.scoreNever")}</p>

              {avisos.length ? (
                <ul className="tl-warns">
                  {avisos.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}

              {gruposVacios ? (
                <p className="tl-void-body">{t("tailor.emptyGroups")}</p>
              ) : (
                <>
                  {/* GRUPO 1 — ya en la variante (sin botón) */}
                  {analisis.yaEnVariante.length > 0 && (
                    <section className="tl-group">
                      <div className="tl-ghead">
                        <h3>{t("tailor.groupHaveTitle")}</h3>
                        <span className="tl-gnote">{t("tailor.groupHaveNote")}</span>
                      </div>
                      {analisis.yaEnVariante.map((it) => (
                        <div className="c-card tl-item" key={it.id}>
                          <span className="tl-itext">{it.texto}</span>
                          <span className="tl-cubre">
                            {t("tailor.coversPrefix")}
                            {it.cubre.join(", ")}
                          </span>
                        </div>
                      ))}
                    </section>
                  )}

                  {/* GRUPO 2 — en el master, no en la variante (un clic para añadir) */}
                  {analisis.enMasterNoEnVariante.length > 0 && (
                    <section className="tl-group">
                      <div className="tl-ghead">
                        <h3>{t("tailor.groupAddTitle")}</h3>
                        <span className="tl-gnote">{t("tailor.groupAddNote")}</span>
                      </div>
                      {analisis.enMasterNoEnVariante.map((it) => (
                        <div className="c-card tl-item tl-item--add" key={it.id}>
                          <span className="tl-itext">{it.texto}</span>
                          <span className="tl-cubre">
                            {t("tailor.coversPrefix")}
                            {it.cubre.join(", ")}
                          </span>
                          {addedIds.has(it.id) ? (
                            <span className="tl-done">{t("tailor.added")}</span>
                          ) : (
                            <button
                              type="button"
                              className="c-btn"
                              disabled={addingId !== null}
                              onClick={() => void anadir(it)}
                            >
                              {addingId === it.id ? t("tailor.adding") : t("tailor.addBtn")}
                            </button>
                          )}
                          {reformErr[it.id] ? (
                            <span className="tl-err" role="alert">
                              {reformErr[it.id]}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </section>
                  )}

                  {/* GRUPO 3 — el aviso lo pide y no lo tienes (SIN botón: no se inventa) */}
                  {analisis.faltan.length > 0 && (
                    <section className="tl-group">
                      <div className="tl-ghead">
                        <h3>{t("tailor.groupGapTitle")}</h3>
                        <span className="tl-gnote">{t("tailor.groupGapNote")}</span>
                      </div>
                      <div className="tl-gaps">
                        {analisis.faltan.map((f, i) => (
                          <div className="tl-gap" key={i}>
                            <b>{f.termino}</b>
                            <span className="tl-cite">
                              {t("tailor.offerCitePrefix")}«{f.evidencia}»
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Reformulaciones — original contra propuesto, una a una */}
                  {analisis.reformulaciones.length > 0 && (
                    <section className="tl-group">
                      <div className="tl-ghead">
                        <h3>{t("tailor.reformOverline")}</h3>
                        <span className="tl-gnote">{t("tailor.reformNote")}</span>
                      </div>
                      {analisis.reformulaciones.map((r) => (
                        <div className="c-card tl-reform" key={r.id}>
                          <div className="tl-rcols">
                            <div className="tl-rcol">
                              <span className="t-overline">{t("tailor.reformOriginal")}</span>
                              <p className="tl-rtext tl-rtext--orig">{r.original}</p>
                            </div>
                            <div className="tl-rcol">
                              <span className="t-overline">{t("tailor.reformProposed")}</span>
                              <p className="tl-rtext">{r.propuesto}</p>
                            </div>
                          </div>
                          {r.motivo ? <span className="tl-rmotivo">{r.motivo}</span> : null}
                          <div className="tl-ractions">
                            {appliedIds.has(r.id) ? (
                              <span className="tl-done">{t("tailor.reformApplied")}</span>
                            ) : (
                              <button
                                type="button"
                                className="c-btn c-btn--patina"
                                disabled={applyingId !== null}
                                onClick={() => void aplicarReform(r)}
                              >
                                {applyingId === r.id ? t("tailor.reformApplying") : t("tailor.reformApply")}
                              </button>
                            )}
                            {reformErr[r.id] ? (
                              <span className="tl-err" role="alert">
                                {reformErr[r.id]}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </section>
                  )}
                </>
              )}

              {analisis.notas ? (
                <p className="tl-notes">
                  {t("tailor.notesPrefix")}
                  {analisis.notas}
                </p>
              ) : null}
            </>
          )}

          {/* ── Salidas secundarias: lo que también funciona ── */}
          <hr className="c-divider" style={{ marginTop: "34px" }} />
          <span className="t-overline" style={{ display: "block", marginTop: "24px" }}>
            {t("tailor.voidNextOverline")}
          </span>
          <div className="tl-outs">
            <div className="c-card tl-out">
              {/* Rótulo con la MISMA clave que el botón real del editor: si alguien lo
                  renombra, esta indicación se renombra con él. */}
              <Link className="c-btn c-btn--patina" href={volverA}>
                {t("editor.fitOpen")} →
              </Link>
              <span className="note">{t("tailor.voidFitNote")}</span>
            </div>
            <div className="c-card tl-out">
              <Link className="c-btn" href="/app/master">
                {t("tailor.voidMasterCta")}
              </Link>
              <span className="note">{t("tailor.voidMasterNote")}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
