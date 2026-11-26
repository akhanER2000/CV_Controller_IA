// Sin "use client": solo lo importa el editor (que ya es cliente), y así sus
// props pueden ser funciones sin el aviso de props serializables.
import { useEffect, useState, type ReactNode } from "react";
import { StatusChip, type EstadoChip } from "@/components/ui/StatusChip";
import { useT } from "@/lib/i18n";
import type { AutofitInfo, EstadoDoc, Fit, FitFalta, FitTipoFalta, PropEnLinea } from "@/components/flujo-cv";
import type { Cascada, PasoActual, PasoCatalogo, PasoMedida } from "@/lib/cv/cascada";
import { MiniaturaPdf } from "@/components/TemplateGallery";
import { AnchoFijo } from "@/components/ui/Progreso";
import { Desplegable, Kbd } from "@/components/editor/Desplegable";
import { TECLA } from "@/components/editor/atajos";
import "./FlujoCv.css";

/* ============================================================================
   FLUJO DEL CV — la guía de la columna que compone y las marcas que se pintan
   SOBRE cada item. Reemplaza al panel «Ajustar páginas» de cuatro listas
   (apartado en _to_delete/flujo-cv/). Ver prompts/lotes-fable5/_diseno/flujo-cv.md.

   Estos componentes no deciden nada: reciben la propuesta ya repartida
   (flujo-cv.ts) y devuelven el clic al editor, que ejecuta con los MISMOS
   manejadores de siempre (removeItem · reorder · POST /ajustar acortar).
   ============================================================================ */

/** Etiqueta de cada hueco. El texto lo pone i18n; aquí solo el mapa. */
export const HUECO_KEY: Record<FitTipoFalta, string> = {
  "sin-cifra": "editor.fitGapNumber",
  "sin-fecha": "editor.fitGapDate",
  "sin-respaldo": "editor.fitGapEvidence",
};

// ── La guía ──────────────────────────────────────────────────────────────────
/**
 * La guía COMPACTA de la barra superior: UN indicador de estado (que abre el
 * detalle con las medidas), «Ajustar páginas» (pedir la propuesta: una llamada al
 * modelo, siempre a mano) y, si hay propuestas abiertas, cuántas quedan y
 * «Siguiente». Las decisiones no viven aquí: viven bajo cada item.
 */
export function GuiaAjuste(props: {
  estado: EstadoDoc;
  paginas: number;
  objetivo: number;
  autofit: AutofitInfo | null;
  paginasTxt: (n: number) => string;
  huecos: number;
  huecosTipo: Readonly<Record<FitTipoFalta, number>>;
  pendientes: number;
  fit: Fit | null;
  busy: boolean;
  err: string;
  notasIA: string | null;
  /** avisos de páginas que antes iban en rojo sobre la vista previa: viven en el detalle */
  avisos?: readonly string[];
  onProponer: () => void;
  onSiguiente: () => void;
  /** lo que va en el hueco «acciones de IA» (Afinar con IA) */
  ia?: ReactNode;
  /**
   * Aplicar una plantilla elegida en la cascada (paso 2 o 3). El editor la pasa con
   * su `savePresentation({ templateId })`; sin ella, el panel la guarda por la API
   * de la variante y recarga (ver DECISIONES, DA-AC).
   */
  onUsarPlantilla?: (templateId: string) => void;
}) {
  const t = useT();
  const [abierto, setAbierto] = useState(false);
  const { estado, paginas, objetivo, autofit, paginasTxt, huecos, huecosTipo, pendientes, fit, busy, err, notasIA } = props;
  const encogido = autofit && autofit.bodySize < autofit.base;
  const coma = (n: number) => String(n).replace(".", ",");

  // La frase LARGA (va en el detalle): la de siempre.
  const doc =
    estado === "midiendo"
      ? t("editor.fluMidiendo")
      : estado === "error"
        ? t("editor.fluError")
        : estado === "vacio"
          ? t("editor.fluVacio")
          : estado === "no-cabe"
            ? t("editor.fluNoCabe").replace("{p}", paginasTxt(objetivo))
            : estado === "excede"
              ? t("editor.fluExcede").replace("{n}", String(paginas)).replace("{o}", String(objetivo))
              : t("editor.fluCabe").replace("{p}", paginasTxt(paginas));
  // La CORTA (el indicador): cabe / no cabe, y los huecos.
  const corto =
    estado === "midiendo"
      ? t("editor.edMidiendo")
      : estado === "error"
        ? t("editor.edError")
        : estado === "vacio"
          ? t("editor.edVacio")
          : estado === "cabe"
            ? t("editor.edCabe").replace("{p}", paginasTxt(paginas))
            : estado === "excede"
              ? t("editor.fluExcede").replace("{n}", String(paginas)).replace("{o}", String(objetivo))
              : t("editor.edNoCabe").replace("{p}", paginasTxt(objetivo));
  const huecosTxt =
    huecos > 0 ? t(huecos === 1 ? "editor.fluHuecos1" : "editor.fluHuecosN").replace("{n}", String(huecos)) : "";

  const descartados = fit ? fit.descartados.filter((d) => d.tipo === "acortar") : [];
  const urgente = estado === "no-cabe" || estado === "excede";
  const avisos = props.avisos ?? [];
  // UN chip de estado (DA-V5): el color nunca va solo, el texto dice lo mismo.
  const chip: EstadoChip =
    estado === "cabe" ? "ok" : estado === "error" ? "error" : urgente || avisos.length ? "aviso" : "neutro";

  return (
    <div className="flu-guia" id="edGuia" role="group" aria-label={t("editor.fluAria")}>
      <Desplegable
        abierto={abierto}
        onCambiar={setAbierto}
        botonId="edEstado"
        botonClase="flu-estado"
        botonEtiqueta={t("editor.edEstadoAria").replace("{e}", huecosTxt ? `${corto} · ${huecosTxt}` : corto)}
        ancho={380}
        boton={
          <>
            <span className="flu-doc" data-estado={estado} role="status">
              <StatusChip estado={chip}>{corto}</StatusChip>
            </span>
            {huecosTxt && <span className="flu-cuenta">· {huecosTxt}</span>}
            <span className="chev" aria-hidden="true">
              ▾
            </span>
          </>
        }
      >
        <div className="flu-det" id="edGuiaDet">
          <p className="flu-det-t" data-estado={estado}>
            {doc}
            {estado === "cabe" && encogido && <> · {t("editor.autofitSize").replace("{s}", coma(autofit!.bodySize))}</>}
          </p>
          {avisos.map((a) => (
            <p className="flu-det-aviso" key={a}>
              {a}
            </p>
          ))}
          {/* LAS MEDIDAS. Todo sale del PDF real o del autofit de ese PDF. */}
          {paginas > 0 && (
            <p>
              {t("editor.fluDetPaginas").replace("{p}", paginasTxt(paginas)).replace("{o}", paginasTxt(objetivo))}
            </p>
          )}
          {autofit && (
            <p>
              {encogido
                ? t("editor.fluDetCuerpo").replace("{s}", coma(autofit.bodySize)).replace("{b}", coma(autofit.base))
                : t("editor.fluDetCuerpoBase").replace("{b}", coma(autofit.base))}
            </p>
          )}
          {fit ? (
            <p>
              {fit.sobran > 0
                ? t("editor.fluDetSobran").replace("{n}", String(fit.sobran))
                : t("editor.fluDetLibres").replace("{n}", String(-fit.sobran))}
            </p>
          ) : (
            <p>{t("editor.fluDetSinAnalisis")}</p>
          )}
          {/* Los huecos, por tipo: calcularFaltas, la misma función del servidor. */}
          {huecos > 0 && (
            <p className="flu-det-huecos">
              {(["sin-cifra", "sin-fecha", "sin-respaldo"] as const)
                .filter((k) => huecosTipo[k] > 0)
                .map((k) => `${huecosTipo[k]} · ${t(HUECO_KEY[k])}`)
                .join("   ")}
            </p>
          )}
          {fit && (
            <p>
              {pendientes > 0
                ? t(pendientes === 1 ? "editor.fluPend1" : "editor.fluPendN").replace("{n}", String(pendientes))
                : t("editor.fluNadaPend")}
            </p>
          )}
          <p>{t("editor.fitManual")}</p>
          {descartados.length > 0 && (
            <>
              <p>{t("editor.fitDropped").replace("{n}", String(descartados.length))}</p>
              <p>{t("editor.fitDroppedHint")}</p>
              <ul>
                {descartados.map((d, i) => (
                  <li key={`${d.id}:${i}`}>{d.razon}</li>
                ))}
              </ul>
            </>
          )}
          {fit?.notas && (
            <>
              <span className="t-overline">{t("editor.fitNotes")}</span>
              <p className="flu-notas">{fit.notas}</p>
            </>
          )}
          {notasIA && (
            <>
              <span className="t-overline">{t("editor.fluNotasIA")}</span>
              <p className="flu-notas">{notasIA}</p>
            </>
          )}
        </div>
      </Desplegable>
      <button
        type="button"
        className={"c-btn flu-ajustar " + (urgente && !fit ? "c-btn--patina" : "c-btn--quiet")}
        disabled={busy}
        onClick={props.onProponer}
      >
        {/* AnchoFijo (DA-EE3): «Ajustar páginas» y «ajustando…» ocupan lo mismo; la barra no se mueve. */}
        <AnchoFijo ocupado={busy} reposo={t("editor.fitOpen")} carga={t("editor.edAjustando")} />
      </button>
      {/* HUECO RESERVADO para las acciones de IA (lo llena el lote siguiente).
          Sin lógica: vacío no ocupa sitio (:empty en FlujoCv.css). */}
      <span className="flu-ia" id="edAccionesIA" data-ranura="acciones-ia" aria-label={t("editor.edAccionesIA")}>
        {props.ia}
      </span>
      {fit && (
        <span className="flu-pend">
          {pendientes > 0 ? (
            <>
              <b>{t(pendientes === 1 ? "editor.fluPend1" : "editor.fluPendN").replace("{n}", String(pendientes))}</b>
              <button type="button" className="c-btn flu-sig" onClick={props.onSiguiente}>
                {t("editor.edSiguiente")} <Kbd>{TECLA.siguiente}</Kbd>
              </button>
            </>
          ) : (
            t("editor.fluNadaPend")
          )}
        </span>
      )}
      {err && (
        <span className="flu-err" role="status">
          {err}
        </span>
      )}
      <PanelCascada
        cascada={(fit as (Fit & { cascada?: Cascada }) | null)?.cascada ?? null}
        paginasTxt={paginasTxt}
        onUsar={props.onUsarPlantilla}
      />
    </div>
  );
}

// ── La cascada de «Ajustar páginas» (DA-A1) ─────────────────────────────────
/**
 * Los tres pasos EN ORDEN y cuál resolvió el problema. Se abre solo cuando llega un
 * análisis nuevo (una cascada por clic en «Ajustar páginas») y se cierra a mano.
 * Todas las cifras son del PDF real que midió el servidor; las miniaturas son ESE
 * mismo PDF, no un render aparte.
 */
function PanelCascada({
  cascada,
  paginasTxt,
  onUsar,
}: {
  cascada: Cascada | null;
  paginasTxt: (n: number) => string;
  onUsar?: (templateId: string) => void;
}) {
  const t = useT();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setAbierto(cascada != null);
    setMsg("");
    setOcupado(null);
  }, [cascada]);
  if (!cascada || !abierto) return null;

  const coma = (n: number) => String(n).replace(".", ",");
  const { objetivo, resueltoPor } = cascada;
  const paso = <P,>(n: 1 | 2 | 3) => cascada.pasos.find((p) => p.paso === n) as P | undefined;
  const p1 = paso<PasoActual>(1);
  const p2 = paso<PasoCatalogo>(2);
  const p3 = paso<PasoMedida>(3);
  const NOMBRE = { 1: t("ajuste.paso1"), 2: t("ajuste.paso2"), 3: t("ajuste.paso3") } as const;
  const varianteId = cascada.variantId;

  const aplicar = async (templateId: string) => {
    if (onUsar) {
      onUsar(templateId);
      setMsg(t("ajuste.usada"));
      return;
    }
    // Sin el manejador del editor: la presentación se guarda en la variante y se
    // recarga, para que el editor lea la plantilla nueva de la base.
    const res = await fetch(`/api/variants/${varianteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ presentation: { templateId } }),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
    setMsg(t("ajuste.usada"));
    window.location.reload();
  };
  const usar = async (clave: string, fn: () => Promise<void>) => {
    setOcupado(clave);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      console.error("[ajuste] no se pudo aplicar la plantilla de la cascada", e);
      setMsg(t("ajuste.errUsar").replace("{r}", e instanceof Error ? e.message : String(e)));
    } finally {
      setOcupado(null);
    }
  };
  const guardarMedida = async (params: NonNullable<PasoMedida["params"]>) => {
    const res = await fetch(`/api/variants/${varianteId}/ajustar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "guardar-medida", params }),
    });
    const j = (await res.json().catch(() => null)) as { plantilla?: { id: string }; error?: string } | null;
    if (!res.ok || !j?.plantilla) throw new Error(j?.error ?? `HTTP ${res.status}`);
    await aplicar(j.plantilla.id);
  };

  const estadoDe = (p: { resuelve: boolean } | undefined) =>
    !p ? "noHizoFalta" : p.resuelve ? "resuelve" : "noAlcanza";
  const chipDe = (e: string): EstadoChip => (e === "resuelve" ? "ok" : e === "noAlcanza" ? "aviso" : "neutro");

  return (
    <section className="flu-cascada" id="edCascada" aria-label={t("ajuste.cascadaT").replace("{p}", paginasTxt(objetivo))}>
      <header>
        <span className="t-overline">{t("ajuste.cascadaT").replace("{p}", paginasTxt(objetivo))}</span>
        <button type="button" className="flu-cas-x" aria-label={t("ajuste.cancelar")} onClick={() => setAbierto(false)}>
          ×
        </button>
      </header>
      <p className="flu-cas-res" data-resuelto={resueltoPor ?? "ninguno"}>
        {resueltoPor
          ? t("ajuste.resueltoPor").replace("{n}", String(resueltoPor)).replace("{paso}", NOMBRE[resueltoPor])
          : t("ajuste.sinResolver").replace("{p}", paginasTxt(objetivo))}
      </p>
      {!resueltoPor && <p className="flu-cas-hint">{t("ajuste.sinResolverHint")}</p>}
      <ol className="flu-cas-pasos">
        {([1, 2, 3] as const).map((n) => {
          const p = n === 1 ? p1 : n === 2 ? p2 : p3;
          const e = estadoDe(p);
          return (
            <li key={n} data-paso={n} data-estado={e}>
              <div className="flu-cas-cab">
                <b>
                  {n} · {NOMBRE[n]}
                </b>
                <StatusChip estado={chipDe(e)}>{t(`ajuste.${e}`)}</StatusChip>
              </div>
              {n === 1 && p1 && (
                <>
                  <p>
                    {p1.paginas <= objetivo
                      ? t("ajuste.p1Cabe").replace("{s}", coma(p1.cuerpo)).replace("{p}", paginasTxt(objetivo))
                      : t("ajuste.p1Mide")
                          .replace("{s}", coma(p1.cuerpo))
                          .replace("{n}", String(p1.paginas))
                          .replace("{l}", String(p1.sobran))}
                  </p>
                  {p1.paginas > objetivo && (
                    <p>
                      {p1.paginasConRecortes == null
                        ? t("ajuste.p1SinRecortes")
                        : t("ajuste.p1Recortes")
                            .replace("{r}", String(p1.propuestas))
                            .replace("{n}", String(p1.paginasConRecortes))}
                      {p1.sinSimular > 0 && <> {t("ajuste.p1RecortesAprox").replace("{x}", String(p1.sinSimular))}</>}
                    </p>
                  )}
                </>
              )}
              {n === 2 && p2 && (
                <>
                  <p>
                    {(p2.candidatas.length ? t("ajuste.p2Medidas") : t("ajuste.p2Ninguna"))
                      .replace("{m}", String(p2.medidas))
                      .replace("{c}", String(p2.candidatas.length))}
                  </p>
                  {p2.candidatas.length > 0 && (
                    <ul className="flu-cas-cands">
                      {p2.candidatas.map((c) => (
                        <li key={c.templateId} data-tpl={c.templateId}>
                          <span className="flu-cas-mini">
                            <MiniaturaPdf pdf={c.pdf} alt={t("ajuste.miniAria").replace("{n}", String(c.paginas))} />
                          </span>
                          <span className="flu-cas-nom">
                            <b>{c.nombre}</b>
                            <span>
                              {t("ajuste.p2Cand").replace("{p}", paginasTxt(c.paginas)).replace("{s}", coma(c.cuerpo))}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="c-btn"
                            disabled={ocupado != null}
                            onClick={() => void usar(c.templateId, () => aplicar(c.templateId))}
                          >
                            {ocupado === c.templateId ? t("ajuste.guardando") : t("ajuste.usarEsta")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {n === 3 && p3 && (
                <>
                  {p3.resuelve && p3.params ? (
                    <div className="flu-cas-cands">
                      <div className="flu-cas-medida">
                        {p3.pdf && (
                          <span className="flu-cas-mini">
                            <MiniaturaPdf pdf={p3.pdf} alt={t("ajuste.miniAria").replace("{n}", String(p3.paginas))} />
                          </span>
                        )}
                        <span className="flu-cas-nom">
                          <span>
                            {t("ajuste.p3Cabe")
                              .replace("{s}", coma(p3.params.cuerpo))
                              .replace("{v}", coma(p3.params.margenVmm))
                              .replace("{h}", coma(p3.params.margenHmm))
                              .replace("{i}", coma(p3.params.interlineado))}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="c-btn"
                          disabled={ocupado != null}
                          onClick={() => void usar("medida", () => guardarMedida(p3.params!))}
                        >
                          {ocupado === "medida" ? t("ajuste.guardando") : t("ajuste.usarMedida")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p>
                      {p3.paginas > objetivo
                        ? t("ajuste.p3NoCabe").replace("{n}", String(p3.paginas))
                        : t("ajuste.p3Falla").replace("{r}", p3.razon ?? "")}
                    </p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
      {msg && (
        <p className="flu-cas-msg" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}

// ── «Sin respaldo», contado por sección ─────────────────────────────────────
/**
 * Los avisos «sin respaldo» de una sección, en UN contador que se despliega (no
 * un chip por grupo). Plegado, dice cuántos; desplegado, NOMBRA lo que no está
 * respaldado, grupo a grupo, para que se juzgue el hecho.
 */
export function HuecosSeccion({ faltas, grupo }: { faltas: readonly FitFalta[]; grupo: (id: string) => string }) {
  const t = useT();
  const [abierto, setAbierto] = useState(false);
  const sin = faltas.filter((f) => f.tipo === "sin-respaldo");
  if (!sin.length) return null;
  const id = `flu-sr-${sin[0]!.id}`;
  return (
    <div className="flu-sr">
      <button
        type="button"
        className="flu-sr-b"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="chev" aria-hidden="true">
          {abierto ? "▾" : "▸"}
        </span>
        <span className="flu-hueco-n">{sin.length}</span>
        <span>
          {t(sin.length === 1 ? "editor.edSinRespaldo1" : "editor.edSinRespaldoN").replace("{n}", String(sin.length))}
        </span>
      </button>
      {abierto && (
        <div className="flu-sr-l" id={id}>
          <p className="hint">{t("editor.edSinRespaldoHint")}</p>
          <ul>
            {sin.map((f) => (
              <li key={f.id}>
                <b>{grupo(f.id)}:</b> {f.detalle}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── «Qué falta», sobre el item ──────────────────────────────────────────────
/** Las etiquetas de hueco de UN item (viñeta o rol). El detalle va en el title. */
export function Huecos({ faltas }: { faltas: readonly FitFalta[] | undefined }) {
  const t = useT();
  // «sin respaldo» no se pinta item a item: va contado en su sección (HuecosSeccion).
  const propias = faltas?.filter((f) => f.tipo !== "sin-respaldo") ?? [];
  if (!propias.length) return null;
  return (
    <span className="flu-huecos">
      {propias.map((f) => (
        <span className="flu-hueco" key={f.tipo} title={f.detalle}>
          {t(HUECO_KEY[f.tipo])}
        </span>
      ))}
    </span>
  );
}

// ── Una propuesta, bajo su item ─────────────────────────────────────────────
export function PropuestaEnLinea({
  prop,
  revertida,
  actual = false,
  onAceptar,
  onRechazar,
}: {
  prop: PropEnLinea;
  /** la decisión marcada (la trajo «Siguiente» o tiene el foco): la que acepta A */
  actual?: boolean;
  /** el usuario aceptó y luego revirtió este acortado */
  revertida: boolean;
  onAceptar: () => void;
  onRechazar: () => void;
}) {
  const t = useT();
  const { tipo, p } = prop;
  return (
    <div
      className="flu-prop"
      data-prop={tipo}
      data-pendiente=""
      data-for={p.id}
      data-clave={prop.clave}
      data-actual={actual ? "" : undefined}
    >
      {tipo === "q" && (
        <>
          <span className="lbl">{t("editor.fluPropQuitar")}</span>
          {prop.p.motivo && <span className="why">{prop.p.motivo}</span>}
        </>
      )}
      {tipo === "r" && (
        <span className="lbl">
          {t(prop.p.hasta < prop.p.desde ? "editor.fitMoveUp" : "editor.fitMoveDown")
            .replace("{a}", String(prop.p.desde + 1))
            .replace("{b}", String(prop.p.hasta + 1))}
        </span>
      )}
      {tipo === "a" && (
        <>
          <span className="lbl">{t("editor.fluPropAcortar").replace("{n}", String(prop.p.ahorro))}</span>
          <span className="nuevo">{prop.p.propuesto}</span>
          {prop.p.motivo && <span className="why">{prop.p.motivo}</span>}
        </>
      )}
      <span className="fl-acts">
        {revertida && <span className="fl-nota">{t("editor.fitReverted")}</span>}
        <button type="button" className="c-btn c-btn--quiet" onClick={onRechazar}>
          {tipo === "q" ? t("editor.fluMantener") : t("editor.fluNo")}
        </button>
        <button type="button" className="c-btn" onClick={onAceptar}>
          {tipo === "q" ? t("editor.fluQuitar") : tipo === "r" ? t("editor.fluMover") : t("editor.fluUsar")}
          {actual && <Kbd>{TECLA.aceptar}</Kbd>}
        </button>
      </span>
    </div>
  );
}

// ── Lo verificado ───────────────────────────────────────────────────────────
/** Sello de oro: este texto pasó el candado en el servidor. Deshacer solo si se aceptó en esta sesión. */
export function SelloVerificado({ onDeshacer }: { onDeshacer?: () => void }) {
  const t = useT();
  return (
    <span className="flu-sello" title={t("editor.fluSelloTitle")}>
      ✓ {t("editor.fluSello")}
      {onDeshacer && (
        <button type="button" onClick={onDeshacer}>
          {t("editor.fluDeshacer")}
        </button>
      )}
    </span>
  );
}
