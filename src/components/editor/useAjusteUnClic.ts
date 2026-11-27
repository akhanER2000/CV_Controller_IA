// Sin "use client": solo lo importa el editor (ya cliente).
import { useCallback, useEffect, useState } from "react";
import { supabaseEnabled } from "@/lib/supabase/config";
import type { ProgresoAjuste } from "@/lib/cv/cascada";
import type { ClaveOpcion, OpcionAjuste, ResultadoAjusteVariante } from "@/lib/cv/ajuste-variante";
import { JSON_HEADERS, normalizeIncoming, readApiError, reason } from "./modelo";
import type { Editor } from "./useEditorVariante";

/* ============================================================================
   «AJUSTAR PÁGINAS» DE UN CLIC (DA-A6). Un clic = POST /ajustar {accion:'ajustar'}:
   el MOTOR DE PÁGINAS combina disposición, reescritura para caber y selección
   hasta que el PDF real mide las páginas pedidas, lo APLICA con instantánea y
   dice qué palanca usó y qué cambió. Aquí: leer el progreso real (NDJSON), pintar
   la variante que devuelve, «Deshacer ajuste», revertir UN cambio, y «Elegir cómo
   ajustar» (A-D medidas, se prueban y se elige). Y la puerta de la descarga: si
   el servidor no entregó el PDF por la regla, el panel ofrece «Ajustar ahora».
   ============================================================================ */

/** El resultado del ajuste. Los campos del motor pueden faltar (respuestas fijadas en pruebas). */
export type ResultadoUnClic = Partial<ResultadoAjusteVariante> &
  Pick<ResultadoAjusteVariante, "objetivo" | "resueltoPor" | "antes" | "razon">;

export interface Elegir {
  deshecho: boolean;
  objetivo: number;
  yaCabe: boolean;
  opciones: OpcionAjuste[];
}

type Linea =
  | ({ tipo: "progreso" } & ProgresoAjuste)
  | { tipo: "resultado"; resultado?: ResultadoUnClic; elegir?: Elegir; aplicado?: boolean; items?: unknown[] }
  | { tipo: "error"; error: string };

/** Lee una respuesta NDJSON línea a línea, a medida que llega. */
async function leerLineas(res: Response, cada: (l: Linea) => void): Promise<void> {
  if (!res.body) {
    for (const l of (await res.text()).split("\n")) if (l.trim()) cada(JSON.parse(l) as Linea);
    return;
  }
  const lector = res.body.getReader();
  const dec = new TextDecoder();
  let resto = "";
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    let i: number;
    while ((i = resto.indexOf("\n")) >= 0) {
      const l = resto.slice(0, i).trim();
      resto = resto.slice(i + 1);
      if (l) cada(JSON.parse(l) as Linea);
    }
  }
  if (resto.trim()) cada(JSON.parse(resto) as Linea);
}

export interface AjusteUnClic {
  busy: boolean;
  progreso: ProgresoAjuste | null;
  resultado: ResultadoUnClic | null;
  aplicado: boolean;
  err: string;
  deshaciendo: boolean;
  deshecho: boolean;
  /** cambios ya revertidos uno a uno (id del variant_item o "diseno") */
  revertidos: ReadonlySet<string>;
  revirtiendo: string | null;
  /** las páginas reales tras el último deshacer/revertir */
  real: { paginas: number; cuerpo: number; cabe: boolean } | null;
  /** «Elegir cómo ajustar»: null = no pedido */
  elegir: Elegir | null;
  eligiendo: boolean;
  aplicando: ClaveOpcion | null;
  aplicada: ClaveOpcion | null;
  /** la descarga no se entregó por «Máximo N páginas» obligatoria */
  bloqueo: { paginas: number; max: number } | null;
  abierto: boolean;
  ajustar: () => void;
  deshacer: () => void;
  revertir: (id: string) => void;
  verElegir: () => void;
  usarOpcion: (o: OpcionAjuste) => void;
  cerrar: () => void;
}

export function useAjusteUnClic(ed: Editor): AjusteUnClic {
  const { variantId, objetivo, t, setItems, flash, seguirVistaPrevia, bloqueoPdf, setBloqueoPdf } = ed;
  const [busy, setBusy] = useState(false);
  const [progreso, setProgreso] = useState<ProgresoAjuste | null>(null);
  const [resultado, setResultado] = useState<ResultadoUnClic | null>(null);
  const [aplicado, setAplicado] = useState(false);
  const [err, setErr] = useState("");
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [deshecho, setDeshecho] = useState(false);
  const [revertidos, setRevertidos] = useState<ReadonlySet<string>>(new Set());
  const [revirtiendo, setRevirtiendo] = useState<string | null>(null);
  const [real, setReal] = useState<AjusteUnClic["real"]>(null);
  const [elegir, setElegir] = useState<Elegir | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [aplicando, setAplicando] = useState<ClaveOpcion | null>(null);
  const [aplicada, setAplicada] = useState<ClaveOpcion | null>(null);
  const [abierto, setAbierto] = useState(false);

  // Un ajuste hecho para otro objetivo ya no describe este documento.
  useEffect(() => {
    setAbierto(false);
    setResultado(null);
    setElegir(null);
  }, [objetivo]);
  // La descarga bloqueada abre el panel con «Ajustar ahora».
  useEffect(() => {
    if (bloqueoPdf) setAbierto(true);
  }, [bloqueoPdf]);

  const pintar = useCallback(
    (items: unknown[] | undefined) => {
      if (!Array.isArray(items)) return;
      setItems(items.map(normalizeIncoming));
      // La vista previa rehace y mide el documento con lo aplicado.
      seguirVistaPrevia("diseno");
    },
    [setItems, seguirVistaPrevia],
  );

  const pedir = useCallback(
    async (accion: "ajustar" | "elegir", alProgreso?: (p: ProgresoAjuste) => void) => {
      const res = await fetch(`/api/variants/${variantId}/ajustar`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ accion, paginas: objetivo }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      let fin: Extract<Linea, { tipo: "resultado" }> | null = null;
      let error = "";
      await leerLineas(res, (l) => {
        if (l.tipo === "progreso") alProgreso?.(l);
        else if (l.tipo === "resultado") fin = l;
        else error = l.error;
      });
      if (error) throw new Error(error);
      if (!fin) throw new Error("La respuesta no trae el resultado.");
      return fin as Extract<Linea, { tipo: "resultado" }>;
    },
    [variantId, objetivo],
  );

  const ajustar = useCallback(() => {
    if (!supabaseEnabled) {
      setErr(t("editor.fitLocal"));
      setAbierto(true);
      return;
    }
    setBusy(true);
    setErr("");
    setProgreso({ paso: 0 });
    setDeshecho(false);
    setRevertidos(new Set());
    setReal(null);
    setElegir(null);
    setAplicada(null);
    setBloqueoPdf(null);
    void (async () => {
      try {
        const fin = await pedir("ajustar", setProgreso);
        setResultado(fin.resultado ?? null);
        setAplicado(fin.aplicado === true);
        pintar(fin.items);
      } catch (e) {
        console.error("[editor] no se pudo ajustar de un clic", e);
        setErr(t("ajuste.errAjustar").replace("{r}", reason(e)));
        setResultado(null);
      } finally {
        setBusy(false);
        setProgreso(null);
        setAbierto(true);
      }
    })();
  }, [pedir, pintar, t, setBloqueoPdf]);

  /** deshacer y revertir: el servidor repone desde SU instantánea y vuelve a medir. */
  const reponer = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/variants/${variantId}/ajustar`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ ...body, paginas: objetivo }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const j = (await res.json()) as { items?: unknown[]; real?: AjusteUnClic["real"] };
      pintar(j.items);
      setReal(j.real ?? null);
    },
    [variantId, objetivo, pintar],
  );

  const deshacer = useCallback(() => {
    setDeshaciendo(true);
    setErr("");
    void (async () => {
      try {
        await reponer({ accion: "deshacer" });
        setDeshecho(true);
        setAplicado(false);
        setAplicada(null);
        flash(t("ajuste.deshechoCorto"));
      } catch (e) {
        console.error("[editor] no se pudo deshacer el ajuste", e);
        setErr(t("ajuste.errDeshacer").replace("{r}", reason(e)));
      } finally {
        setDeshaciendo(false);
      }
    })();
  }, [reponer, flash, t]);

  const revertir = useCallback(
    (id: string) => {
      setRevirtiendo(id);
      setErr("");
      void (async () => {
        try {
          await reponer({ accion: "revertir", cambio: id });
          setRevertidos((s) => new Set([...s, id]));
        } catch (e) {
          console.error("[editor] no se pudo revertir el cambio", id, e);
          setErr(t("motor.errRevertir").replace("{r}", reason(e)));
        } finally {
          setRevirtiendo(null);
        }
      })();
    },
    [reponer, t],
  );

  const verElegir = useCallback(() => {
    if (elegir) {
      setElegir(null);
      return;
    }
    if (!supabaseEnabled) {
      setErr(t("editor.fitLocal"));
      setAbierto(true);
      return;
    }
    setEligiendo(true);
    setErr("");
    setAbierto(true);
    setProgreso({ paso: 0 });
    void (async () => {
      try {
        const fin = await pedir("elegir", setProgreso);
        if (fin.elegir) setElegir(fin.elegir);
        // Si había un ajuste aplicado, el servidor lo deshizo para comparar.
        if (fin.elegir?.deshecho) {
          pintar(fin.items);
          setAplicado(false);
          setAplicada(null);
        }
      } catch (e) {
        console.error("[editor] no se pudieron medir las opciones", e);
        setErr(t("motor.errElegir").replace("{r}", reason(e)));
      } finally {
        setEligiendo(false);
        setProgreso(null);
      }
    })();
  }, [elegir, pedir, pintar, t]);

  const usarOpcion = useCallback(
    (o: OpcionAjuste) => {
      if (!o.plan) return;
      setAplicando(o.clave);
      setErr("");
      void (async () => {
        try {
          const res = await fetch(`/api/variants/${variantId}/ajustar`, {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({ accion: "aplicar", plan: o.plan, paginas: objetivo }),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          const j = (await res.json()) as { resultado?: ResultadoUnClic; items?: unknown[] };
          setResultado(j.resultado ?? null);
          setAplicado(true);
          setDeshecho(false);
          setRevertidos(new Set());
          setReal(null);
          setAplicada(o.clave);
          setBloqueoPdf(null);
          pintar(j.items);
        } catch (e) {
          console.error("[editor] no se pudo aplicar la opción", o.clave, e);
          setErr(t("ajuste.errAjustar").replace("{r}", reason(e)));
        } finally {
          setAplicando(null);
        }
      })();
    },
    [variantId, objetivo, pintar, t, setBloqueoPdf],
  );

  const cerrar = useCallback(() => {
    setAbierto(false);
    setBloqueoPdf(null);
  }, [setBloqueoPdf]);

  return {
    busy,
    progreso,
    resultado,
    aplicado,
    err,
    deshaciendo,
    deshecho,
    revertidos,
    revirtiendo,
    real,
    elegir,
    eligiendo,
    aplicando,
    aplicada,
    bloqueo: bloqueoPdf,
    abierto,
    ajustar,
    deshacer,
    revertir,
    verElegir,
    usarOpcion,
    cerrar,
  };
}
