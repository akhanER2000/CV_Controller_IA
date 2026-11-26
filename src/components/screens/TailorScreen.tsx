"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import { useBoot } from "@/lib/corpus/runtime";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { fileKindFromName, FILE_ACCEPT, type FileKind } from "@/lib/db/sources";
import { AuroraTune, AURORA_TRABAJO } from "@/components/Aurora";
import { Breadcrumb } from "@/components/Breadcrumb";
import { DropZone } from "@/components/DropZone";
import { Button, Card, Chip, PageHeader, PanelHeader } from "@/components/ui";
import { Pasos } from "@/components/cuenta/Pasos";
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

  /* Los pasos 1 · 2 · 3 salen del MISMO estado que decide qué se pinta: sin
     análisis, pegar el aviso; con análisis, leerlo; y en cuanto se añade o se
     aplica algo, el tercero. No hay paso que no corresponda a un dato. */
  const pasos = [
    { id: "aviso", titulo: t("tailor.paso.aviso") },
    { id: "analisis", titulo: t("tailor.paso.analisis") },
    { id: "aplicar", titulo: t("tailor.paso.aplicar") },
  ];
  const pasoActual = !analisis ? 0 : addedIds.size + appliedIds.size > 0 ? 2 : 1;

  return (
    <div className="c-page" ref={bootRef}>
      {/* Leer un aviso y contrastarlo es trabajo denso: el humo baja. */}
      <AuroraTune strength={AURORA_TRABAJO} />

      {/* Forja v2: el <header class="c-header"> de antes solo traía logo, nav e
          idioma de maqueta (todo lo da el shell) y se quitó. La barra .tl-bar
          traía la salida y el rótulo: la salida sigue aquí arriba. */}
      <main className="cu-pagina tl-main" data-screen-label="tailor">
        <div className="tl-top">
          {/* La salida: a la variante que estás adaptando (o al ?from que te trajo). */}
          <Breadcrumb fallback={volverA} />
          <Pasos pasos={pasos} actual={pasoActual} etiqueta={t("tailor.pasos.aria")} />
        </div>

        <PageHeader
          rotulo={t("tailor.voidOverline")}
          titulo={analisis ? t("tailor.resultOverline") : t("tailor.voidTitle")}
          sub={analisis ? undefined : t("tailor.voidBody")}
          acciones={<Chip>{t("tailor.toolbarNote")}</Chip>}
        />

        {!analisis ? (
          <>
            {/* La regla, no una disculpa. */}
            <p className="cu-aviso tl-ethic">{t("tailor.voidEthic")}</p>

            {puedeAnalizar ? (
              <Card as="section" grande className="tl-entry" aria-labelledby="tlEntryT">
                <PanelHeader
                  nivel={2}
                  id="tlEntryT"
                  titulo={
                    <>
                      <span className="cu-num" aria-hidden="true">
                        1
                      </span>
                      {t("tailor.entryTitle")}
                    </>
                  }
                  sub={t("tailor.entryBody")}
                />

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
                    <span className="cu-nota">{t("tailor.urlHint")}</span>
                  </div>
                )}

                {tab === "file" && (
                  <div className="tl-filerow">
                    {/* La zona de carga destacada (la misma del volcado). Un solo
                        archivo: el aviso es UNO. Mismo manejador que el selector
                        de antes; arrastrar es un atajo, no el único camino. */}
                    <DropZone
                      className="tl-drop"
                      accept={FILE_ACCEPT}
                      disabled={uploading}
                      onFiles={(fs) => {
                        const f = fs[0];
                        if (f) void subirArchivo(f);
                      }}
                      label={
                        <>
                          <b>{uploading ? t("tailor.fileUploading") : fileRef ? fileRef.name : t("tailor.filePick")}</b>{" "}
                          {t("tailor.fileDrop")}
                        </>
                      }
                    />
                    <span className="cu-nota">{t("tailor.fileHint")}</span>
                    {fileErr ? (
                      <p className="tl-err" role="alert">
                        {fileErr}
                      </p>
                    ) : null}
                  </div>
                )}

                <div className="tl-actions">
                  <Button
                    variante="brasa"
                    tamano="lg"
                    disabled={analizando || uploading || !hayEntrada}
                    onClick={() => void analizar()}
                  >
                    {analizando ? t("tailor.analyzing") : t("tailor.analyze")}
                  </Button>
                  <span className="cu-nota tl-score">{t("tailor.scoreNever")}</span>
                </div>
                {analizarErr ? (
                  <p className="tl-err" role="alert">
                    {analizarErr}
                  </p>
                ) : null}
              </Card>
            ) : null}
          </>
        ) : (
          <>
            {/* ── El análisis: tres grupos, sin score ── */}
            <Card as="section" className="tl-resumen">
              <div className="tl-rhead">
                <div className="tl-target">
                  {analisis.tituloObjetivo ? (
                    <>
                      <span className="tl-k">{t("tailor.targetPrefix")}</span>
                      <b>{analisis.tituloObjetivo}</b>
                    </>
                  ) : null}
                  <span className="cu-nota">{t("tailor.scoreNever")}</span>
                </div>
                <Button variante="grafito" onClick={reiniciar}>
                  {t("tailor.reAnalyze")}
                </Button>
              </div>

              {avisos.length ? (
                <ul className="tl-warns">
                  {avisos.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </Card>

            {gruposVacios ? (
              <p className="cu-aviso">{t("tailor.emptyGroups")}</p>
            ) : (
              <>
                {/* GRUPO 1 — ya en la variante (sin botón) */}
                {analisis.yaEnVariante.length > 0 && (
                  <Card as="section" className="tl-group">
                    <PanelHeader nivel={2} titulo={t("tailor.groupHaveTitle")} sub={t("tailor.groupHaveNote")} />
                    <div className="tl-items">
                      {analisis.yaEnVariante.map((it) => (
                        <div className="tl-item" key={it.id}>
                          <span className="tl-itext">{it.texto}</span>
                          <span className="tl-cubre">
                            {t("tailor.coversPrefix")}
                            {it.cubre.join(", ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* GRUPO 2 — en el master, no en la variante (un clic para añadir) */}
                {analisis.enMasterNoEnVariante.length > 0 && (
                  <Card as="section" className="tl-group">
                    <PanelHeader nivel={2} titulo={t("tailor.groupAddTitle")} sub={t("tailor.groupAddNote")} />
                    <div className="tl-items">
                      {analisis.enMasterNoEnVariante.map((it) => (
                        <div className="tl-item tl-item--add" key={it.id}>
                          <span className="tl-itext">{it.texto}</span>
                          <span className="tl-cubre">
                            {t("tailor.coversPrefix")}
                            {it.cubre.join(", ")}
                          </span>
                          {addedIds.has(it.id) ? (
                            <span className="tl-done">{t("tailor.added")}</span>
                          ) : (
                            <Button
                              variante="grafito"
                              icono="mas"
                              disabled={addingId !== null}
                              onClick={() => void anadir(it)}
                            >
                              {addingId === it.id ? t("tailor.adding") : t("tailor.addBtn")}
                            </Button>
                          )}
                          {reformErr[it.id] ? (
                            <span className="tl-err" role="alert">
                              {reformErr[it.id]}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* GRUPO 3 — el aviso lo pide y no lo tienes (SIN botón: no se inventa) */}
                {analisis.faltan.length > 0 && (
                  <Card as="section" className="tl-group">
                    <PanelHeader nivel={2} titulo={t("tailor.groupGapTitle")} sub={t("tailor.groupGapNote")} />
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
                  </Card>
                )}

                {/* Reformulaciones — original contra propuesto, una a una */}
                {analisis.reformulaciones.length > 0 && (
                  <Card as="section" className="tl-group">
                    <PanelHeader nivel={2} titulo={t("tailor.reformOverline")} sub={t("tailor.reformNote")} />
                    <div className="tl-items">
                      {analisis.reformulaciones.map((r) => (
                        <div className="tl-reform" key={r.id}>
                          <div className="tl-rcols">
                            <div className="tl-rcol">
                              <span className="tl-k">{t("tailor.reformOriginal")}</span>
                              <p className="tl-rtext tl-rtext--orig">{r.original}</p>
                            </div>
                            <div className="tl-rcol tl-rcol--prop">
                              <span className="tl-k">{t("tailor.reformProposed")}</span>
                              <p className="tl-rtext">{r.propuesto}</p>
                            </div>
                          </div>
                          {r.motivo ? <span className="tl-rmotivo">{r.motivo}</span> : null}
                          <div className="tl-ractions">
                            {appliedIds.has(r.id) ? (
                              <span className="tl-done">{t("tailor.reformApplied")}</span>
                            ) : (
                              <Button
                                variante="grafito"
                                icono="revision"
                                disabled={applyingId !== null}
                                onClick={() => void aplicarReform(r)}
                              >
                                {applyingId === r.id ? t("tailor.reformApplying") : t("tailor.reformApply")}
                              </Button>
                            )}
                            {reformErr[r.id] ? (
                              <span className="tl-err" role="alert">
                                {reformErr[r.id]}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}

            {analisis.notas ? (
              <p className="cu-nota tl-notes">
                {t("tailor.notesPrefix")}
                {analisis.notas}
              </p>
            ) : null}
          </>
        )}

        {/* ── Salidas secundarias: lo que también funciona ── */}
        <section className="tl-outs-sec" aria-labelledby="tlOutsT">
          <h2 className="cu-rotulo tl-outs-h" id="tlOutsT">
            {t("tailor.voidNextOverline")}
          </h2>
          <div className="cu-rejilla cu-rejilla--2 tl-outs">
            <Card className="tl-out">
              {/* Rótulo con la MISMA clave que el botón real del editor: si alguien lo
                  renombra, esta indicación se renombra con él. */}
              <Button variante="grafito" href={volverA}>
                {t("editor.fitOpen")} →
              </Button>
              <span className="note">{t("tailor.voidFitNote")}</span>
            </Card>
            <Card className="tl-out">
              <Button variante="grafito" icono="master" href="/app/master">
                {t("tailor.voidMasterCta")}
              </Button>
              <span className="note">{t("tailor.voidMasterNote")}</span>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
