// Sin "use client": solo lo importa el editor (que ya es cliente), y así sus
// props pueden ser funciones sin el aviso de props serializables.
import { useState, type ReactNode } from "react";
import { StatusChip, type EstadoChip } from "@/components/ui/StatusChip";
import { useT } from "@/lib/i18n";
import type { AutofitInfo, EstadoDoc, Fit, FitFalta, FitTipoFalta, PropEnLinea } from "@/components/flujo-cv";
import type { AjusteUnClic } from "@/components/editor/useAjusteUnClic";
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
 * detalle con las medidas), «Ajustar páginas» (de un clic, DA-A4: deja el CV en las
 * páginas pedidas y lo dice en el panel anclado) y, si hay propuestas abiertas
 * («Revisar uno por uno»), cuántas quedan y «Siguiente».
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
  /** motivos de las reglas OBLIGATORIAS que el documento no cumple (estadoDeReglas) */
  reglas?: readonly string[];
  onProponer: () => void;
  onSiguiente: () => void;
  /** lo que va en el hueco «acciones de IA» (Afinar con IA) */
  ia?: ReactNode;
  /** el panel anclado del ajuste de un clic (PanelAjuste), bajo la guía */
  panel?: ReactNode;
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
  const reglasRotas = props.reglas ?? [];
  const reglasTxt = reglasRotas.length
    ? t(reglasRotas.length === 1 ? "editor.fluReglas1" : "editor.fluReglasN").replace("{n}", String(reglasRotas.length))
    : "";
  // UN chip de estado (DA-V5): el color nunca va solo, el texto dice lo mismo.
  // Una regla obligatoria sin cumplir lo pone en aviso aunque el documento quepa.
  const chip: EstadoChip =
    estado === "error"
      ? "error"
      : reglasRotas.length
        ? "aviso"
        : estado === "cabe"
          ? "ok"
          : urgente || avisos.length
            ? "aviso"
            : "neutro";
  const etiqueta = [corto, huecosTxt, reglasTxt].filter(Boolean).join(" · ");

  return (
    <div className="flu-guia" id="edGuia" role="group" aria-label={t("editor.fluAria")}>
      <Desplegable
        abierto={abierto}
        onCambiar={setAbierto}
        botonId="edEstado"
        botonClase="flu-estado"
        botonEtiqueta={t("editor.edEstadoAria").replace("{e}", etiqueta)}
        ancho={380}
        boton={
          <>
            <span className="flu-doc" data-estado={estado} role="status">
              <StatusChip estado={chip}>{corto}</StatusChip>
            </span>
            {huecosTxt && <span className="flu-cuenta">· {huecosTxt}</span>}
            {reglasTxt && (
              <span className="flu-cuenta flu-reglas" id="edReglasRotas">
                · {reglasTxt}
              </span>
            )}
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
          {reglasRotas.length > 0 && (
            <>
              <span className="t-overline">{t("editor.fluReglasT")}</span>
              <ul className="flu-det-reglas">
                {reglasRotas.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}
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
      {props.panel}
    </div>
  );
}

// ── «Ajustar páginas» de un clic (DA-A6) ────────────────────────────────────
/**
 * El panel ANCLADO bajo la guía (posición absoluta: la barra no se mueve) con lo
 * que el motor de páginas YA aplicó, dicho con su medida real: qué palancas usó
 * (disposición, reescritura para caber, selección) y QUÉ cambió, cada cambio con
 * su «Revertir». Las salidas: «Deshacer ajuste» (todo), «Elegir cómo ajustar»
 * (A-D medidas con la miniatura del MISMO PDF medido) y, como enlace secundario,
 * «Revisar uno por uno». Si la descarga se bloqueó por la regla obligatoria,
 * arriba va «Ajustar ahora».
 */
export function PanelAjuste({
  aj,
  objetivo,
  paginasTxt,
  onRevisar,
}: {
  aj: AjusteUnClic;
  objetivo: number;
  paginasTxt: (n: number) => string;
  onRevisar: () => void;
}) {
  const t = useT();
  if (!aj.abierto) return null;
  const coma = (n: number) => String(n).replace(".", ",");
  const r = aj.resultado;
  const p = (n: number) => paginasTxt(n);
  const plan = r?.plan;
  const cambios = r?.cambios ?? [];
  const real = aj.real ?? r?.real ?? null;
  const resuelto = !!r && !!r.resueltoPor && r.resueltoPor !== "ya-cabe" && (r.cabe ?? true);
  const palancas = r?.palancas ?? [];

  let frase = "";
  const detalle: string[] = [];
  if (r) {
    if (aj.deshecho) frase = t("ajuste.deshecho").replace("{n}", r.antes.nombre);
    else if (r.resueltoPor === "ya-cabe") frase = t("ajuste.unYaCabe").replace("{p}", p(r.antes.paginas));
    else if (r.choque) {
      const c = r.choque;
      frase = t("motor.choque")
        .replace("{o}", p(c.objetivo))
        .replace("{con}", t(c.con === "incluirSiempre" ? "motor.conIncluir" : "motor.conContacto"))
        .replace("{f}", String(c.fijos))
        .replace("{p}", String(c.paginas))
        .replace("{l}", String(c.lineas))
        .replace("{c}", String(c.caben))
        .replace("{d}", c.disposicion);
    } else if (resuelto) {
      const pags = p(real?.paginas ?? r.paginas ?? objetivo);
      const cuerpo = coma(real?.cuerpo ?? r.cuerpo ?? 10);
      // Solo disposición (paso 1 o 2): la frase de DA-A4, sin tocar el contenido.
      if (r.resueltoPor === "plantilla" && plan)
        frase = t(plan.disposicion.propia ? "ajuste.unPropia" : "ajuste.unPlantilla")
          .replace("{n}", plan.disposicion.nombre)
          .replace("{p}", pags);
      else if (r.resueltoPor === "medida")
        frase = t("ajuste.unMedida").replace("{n}", r.medidaNombre ?? t("ajuste.paso3")).replace("{p}", pags);
      else frase = t("motor.listo").replace("{p}", pags).replace("{s}", cuerpo);
      if (r.resueltoPor !== "motor") detalle.push(t("ajuste.unCuerpo").replace("{s}", cuerpo));
      const m = r.medicion;
      if (m && m.medidas > 0)
        detalle.push(
          t("ajuste.unMedicion")
            .replace("{m}", String(m.medidas))
            .replace("{c}", String(m.consideradas))
            .replace("{s}", coma(Math.round(m.ms / 100) / 10))
            .replace("{k}", String(m.caben)) + (m.tope ? ` ${t("ajuste.unTope")}` : ""),
        );
      if (palancas.length && r.resueltoPor === "motor")
        detalle.push(t("motor.palancas").replace("{l}", palancas.map((x) => t(`motor.palanca_${x}`)).join(" + ")));
      const rs = plan?.reescribir ?? [];
      if (rs.length)
        detalle.push(
          t("motor.cuentaReescritos")
            .replace("{n}", String(rs.length))
            .replace("{a}", String(rs.reduce((a, x) => a + x.original.length, 0)))
            .replace("{d}", String(rs.reduce((a, x) => a + x.propuesto.length, 0))),
        );
      if (plan?.ocultar.length) detalle.push(t("motor.cuentaFuera").replace("{n}", String(plan.ocultar.length)));
      if (!rs.length && !plan?.ocultar.length && r.resueltoPor === "motor") detalle.push(t("motor.sinContenido"));
    } else frase = t("ajuste.unNoCabe").replace("{p}", p(objetivo)).replace("{r}", r.razon ?? "");
    if (!aj.deshecho && real && !real.cabe && resuelto) detalle.push(t("motor.realNoCabe").replace("{n}", String(real.paginas)));
    if (r.rechazados?.length) detalle.push(t("motor.rechazados").replace("{n}", String(r.rechazados.length)));
    const desc = r.reescritura?.descartados.length ?? 0;
    if (desc) detalle.push(t("motor.descartados").replace("{n}", String(desc)));
  }
  const puedeDeshacer = aj.aplicado && !aj.deshecho;
  const textoCambio = (c: (typeof cambios)[number]) =>
    c.tipo === "plantilla"
      ? t("motor.cambioPlantilla").replace("{a}", c.texto).replace("{b}", c.nuevo ?? "")
      : c.tipo === "medida"
        ? t("motor.cambioMedida").replace("{a}", c.texto).replace("{b}", r?.medidaNombre ?? c.nuevo ?? "")
        : c.texto;

  return (
    <section
      className="flu-cascada flu-unclic"
      id="edAjuste"
      aria-label={t("ajuste.unTitulo").replace("{p}", p(objetivo))}
      // La medida que respalda la frase, legible para pruebas y soporte.
      data-resuelto-por={r?.resueltoPor ?? (aj.err ? "error" : "ninguno")}
      data-palancas={palancas.join(",")}
      data-paginas={real?.paginas ?? r?.paginas ?? 0}
      data-cuerpo={real?.cuerpo ?? r?.cuerpo ?? 0}
      data-reescritos={plan?.reescribir.length ?? 0}
      data-fuera={plan?.ocultar.length ?? 0}
      data-choque={r?.choque ? "1" : "0"}
      data-plantilla={r?.medidaId ?? plan?.disposicion.templateId ?? ""}
      data-medidas={r?.medicion?.medidas ?? 0}
      data-consideradas={r?.medicion?.consideradas ?? 0}
      data-caben={r?.medicion?.caben ?? 0}
      data-renders={r?.medicion?.renders ?? 0}
      data-ms={r?.medicion?.ms ?? 0}
      data-tope={r?.medicion?.tope ? "1" : "0"}
    >
      <header>
        <span className="t-overline">{t("ajuste.unTitulo").replace("{p}", p(objetivo))}</span>
        <button type="button" className="flu-cas-x" aria-label={t("ajuste.cerrar")} onClick={aj.cerrar}>
          ×
        </button>
      </header>
      {aj.bloqueo && (
        <div className="flu-bloqueo" id="edBloqueoPdf" role="alert">
          <p>{t("motor.bloqueo").replace("{n}", String(aj.bloqueo.paginas)).replace("{m}", p(aj.bloqueo.max))}</p>
          <button type="button" className="c-btn c-btn--patina" id="edAjustarAhora" disabled={aj.busy} onClick={aj.ajustar}>
            <AnchoFijo ocupado={aj.busy} reposo={t("motor.ajustarAhora")} carga={t("editor.edAjustando")} />
          </button>
        </div>
      )}
      {aj.err ? (
        <p className="flu-cas-res" role="status" data-resuelto="error">
          {aj.err}
        </p>
      ) : (
        r && (
          <p className="flu-cas-res" role="status" data-resuelto={aj.deshecho ? "deshecho" : (r.resueltoPor ?? "ninguno")}>
            {frase}
          </p>
        )
      )}
      {detalle.length > 0 && <p className="flu-cas-hint">{detalle.join(" ")}</p>}
      {r && !resuelto && !r.choque && r.resueltoPor !== "ya-cabe" && !aj.err && (
        <p className="flu-cas-hint">{t("ajuste.unNoCabeHint")}</p>
      )}
      {resuelto && !aj.deshecho && cambios.length > 0 && (
        <>
          <span className="t-overline">{t("motor.cambiosT")}</span>
          <ul className="flu-cambios" id="edAjusteCambios">
            {cambios.map((c) => {
              const hecho = aj.revertidos.has(c.id);
              return (
                <li key={`${c.tipo}:${c.id}`} data-cambio={c.id} data-tipo={c.tipo} data-revertido={hecho ? "" : undefined}>
                  <span className="flu-cambio-t">
                    <b>
                      {c.tipo === "reescrito"
                        ? t("motor.cambioReescrito")
                        : c.tipo === "fuera"
                          ? t("motor.cambioFuera")
                          : t("motor.cambioDisposicion")}
                    </b>
                    <span className={c.tipo === "reescrito" ? "flu-cambio-antes" : undefined}>{textoCambio(c)}</span>
                    {c.tipo === "reescrito" && c.nuevo && <span className="flu-cambio-nuevo">{c.nuevo}</span>}
                    {c.tipo === "fuera" && c.motivo && <span className="flu-cambio-why">{t(`motor.motivo_${c.motivo}`)}</span>}
                  </span>
                  {hecho ? (
                    <span className="flu-cambio-ok">{t("motor.revertido")}</span>
                  ) : (
                    <button
                      type="button"
                      className="c-btn c-btn--quiet"
                      disabled={aj.revirtiendo != null || !puedeDeshacer}
                      onClick={() => aj.revertir(c.id)}
                    >
                      <AnchoFijo ocupado={aj.revirtiendo === c.id} reposo={t("motor.revertir")} carga={t("motor.revirtiendo")} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="flu-un-acts">
        {puedeDeshacer && (
          <button type="button" className="c-btn" id="edAjusteDeshacer" disabled={aj.deshaciendo} onClick={aj.deshacer}>
            <AnchoFijo ocupado={aj.deshaciendo} reposo={t("ajuste.deshacer")} carga={t("ajuste.deshaciendo")} />
          </button>
        )}
        {(!r || r.resueltoPor !== "ya-cabe") && (
          <button
            type="button"
            className="c-btn c-btn--quiet"
            id="edAjusteElegir"
            aria-expanded={aj.elegir != null}
            disabled={aj.eligiendo || aj.busy}
            onClick={aj.verElegir}
          >
            <AnchoFijo ocupado={aj.eligiendo} reposo={t("motor.elegir")} carga={t("motor.elegirBuscando")} />
          </button>
        )}
        <button type="button" className="flu-un-revisar" id="edAjusteRevisar" onClick={onRevisar}>
          {t("ajuste.revisar")}
        </button>
      </div>
      {aj.elegir && (
        <>
          <span className="t-overline">{t("motor.elegirT").replace("{p}", p(aj.elegir.objetivo))}</span>
          {aj.elegir.deshecho && <p className="flu-cas-hint">{t("motor.elegirDeshecho")}</p>}
          {aj.elegir.yaCabe ? (
            <p className="flu-cas-hint">{t("motor.elegirYaCabe").replace("{p}", p(aj.elegir.objetivo))}</p>
          ) : (
            <ul className="flu-elegir" id="edAjusteOpcionesAD">
              {aj.elegir.opciones.map((o) => {
                const enUso = aj.aplicada === o.clave;
                return (
                  <li key={o.clave} data-op={o.clave} data-cabe={o.cabe ? "1" : "0"} data-paginas={o.paginas} data-cuerpo={o.cuerpo}>
                    <span className="flu-cas-mini">
                      {o.pdf && <MiniaturaPdf pdf={o.pdf} alt={t("ajuste.miniAria").replace("{n}", String(o.paginas))} />}
                    </span>
                    <span className="flu-cas-nom">
                      <b>{t(`motor.op_${o.clave}`)}</b>
                      {o.nombre && <span>{o.nombre}</span>}
                      {o.plan ? (
                        <>
                          <span>
                            {t("motor.opMide").replace("{p}", p(o.paginas)).replace("{s}", coma(o.cuerpo))} ·{" "}
                            <em className="flu-op-cabe" data-cabe={o.cabe ? "1" : "0"}>
                              {t(o.cabe ? "motor.opCabe" : "motor.opNoCabe")}
                            </em>
                          </span>
                          <span>
                            {o.reescritos || o.fuera
                              ? t("motor.opCambios").replace("{r}", String(o.reescritos)).replace("{q}", String(o.fuera))
                              : t("motor.opSinContenido")}
                          </span>
                        </>
                      ) : (
                        <span>{t("motor.opNada").replace("{r}", o.razon ?? "")}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="c-btn"
                      disabled={!o.plan || enUso || aj.aplicando != null}
                      onClick={() => aj.usarOpcion(o)}
                    >
                      <AnchoFijo
                        ocupado={aj.aplicando === o.clave}
                        reposo={enUso ? t("motor.aplicada") : t("motor.usar")}
                        carga={t("motor.aplicando")}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
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
