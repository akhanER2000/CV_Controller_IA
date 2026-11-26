// Sin "use client": solo lo importa el editor (ya cliente).
import { useCallback, useEffect, useState } from "react";
import { supabaseEnabled } from "@/lib/supabase/config";
import type { OpcionPlantilla, ProgresoAjuste, ResultadoAjuste } from "@/lib/cv/cascada";
import { JSON_HEADERS, normalizeIncoming, readApiError, reason } from "./modelo";
import type { Editor } from "./useEditorVariante";

/* ============================================================================
   «AJUSTAR PÁGINAS» DE UN CLIC (DA-A4). Un clic = POST /ajustar {accion:'ajustar'}:
   el servidor prueba todas las plantillas con el contenido tal cual, luego la
   plantilla a medida y solo al final los recortes, APLICA la primera que deja el CV
   en las páginas pedidas y guarda la instantánea. Aquí: leer el progreso real
   (NDJSON, una línea por paso), pintar la variante que devuelve, y «Deshacer
   ajuste» / «Ver otras opciones».
   ============================================================================ */

export type ResultadoUnClic = ResultadoAjuste & { medidaId?: string; medidaNombre?: string };

type Linea =
  | ({ tipo: "progreso" } & ProgresoAjuste)
  | { tipo: "resultado"; resultado: ResultadoUnClic; aplicado?: boolean; items?: unknown[] }
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
  /** «Ver otras opciones»: null = no pedidas; [] = ninguna */
  opciones: OpcionPlantilla[] | null;
  buscandoOpciones: boolean;
  /** la alternativa elegida después (o null) */
  usada: string | null;
  abierto: boolean;
  ajustar: () => void;
  deshacer: () => void;
  verOpciones: () => void;
  usar: (o: OpcionPlantilla) => void;
  cerrar: () => void;
}

export function useAjusteUnClic(ed: Editor): AjusteUnClic {
  const { variantId, objetivo, t, setItems, flash, seguirVistaPrevia, savePresentation } = ed;
  const [busy, setBusy] = useState(false);
  const [progreso, setProgreso] = useState<ProgresoAjuste | null>(null);
  const [resultado, setResultado] = useState<ResultadoUnClic | null>(null);
  const [aplicado, setAplicado] = useState(false);
  const [err, setErr] = useState("");
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [deshecho, setDeshecho] = useState(false);
  const [opciones, setOpciones] = useState<OpcionPlantilla[] | null>(null);
  const [buscandoOpciones, setBuscandoOpciones] = useState(false);
  const [usada, setUsada] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  // Un ajuste hecho para otro objetivo ya no describe este documento.
  useEffect(() => {
    setAbierto(false);
    setResultado(null);
    setOpciones(null);
  }, [objetivo]);

  const pedir = useCallback(
    async (accion: "ajustar" | "opciones", alProgreso?: (p: ProgresoAjuste) => void) => {
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
    setOpciones(null);
    setUsada(null);
    void (async () => {
      try {
        const fin = await pedir("ajustar", setProgreso);
        setResultado(fin.resultado);
        setAplicado(fin.aplicado === true);
        if (Array.isArray(fin.items)) {
          setItems(fin.items.map(normalizeIncoming));
          // La vista previa rehace y mide el documento con la plantilla nueva.
          seguirVistaPrevia("diseno");
        }
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
  }, [pedir, setItems, seguirVistaPrevia, t]);

  const deshacer = useCallback(() => {
    setDeshaciendo(true);
    setErr("");
    void (async () => {
      try {
        const res = await fetch(`/api/variants/${variantId}/ajustar`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ accion: "deshacer" }),
        });
        if (!res.ok) throw new Error(await readApiError(res));
        const j = (await res.json()) as { items?: unknown[] };
        if (Array.isArray(j.items)) {
          setItems(j.items.map(normalizeIncoming));
          seguirVistaPrevia("diseno");
        }
        setDeshecho(true);
        setAplicado(false);
        setOpciones(null);
        setUsada(null);
        flash(t("ajuste.deshechoCorto"));
      } catch (e) {
        console.error("[editor] no se pudo deshacer el ajuste", e);
        setErr(t("ajuste.errDeshacer").replace("{r}", reason(e)));
      } finally {
        setDeshaciendo(false);
      }
    })();
  }, [variantId, setItems, seguirVistaPrevia, flash, t]);

  const verOpciones = useCallback(() => {
    // Las del ajuste ya vienen medidas y con miniatura; si no hay, se miden ahora.
    if (resultado?.alternativas.length) {
      setOpciones((o) => (o ? null : resultado.alternativas));
      return;
    }
    if (opciones) {
      setOpciones(null);
      return;
    }
    setBuscandoOpciones(true);
    void (async () => {
      try {
        const fin = await pedir("opciones");
        setOpciones(fin.resultado.alternativas);
      } catch (e) {
        console.error("[editor] no se pudieron medir las opciones", e);
        setErr(t("ajuste.errAjustar").replace("{r}", reason(e)));
      } finally {
        setBuscandoOpciones(false);
      }
    })();
  }, [resultado, opciones, pedir, t]);

  const usar = useCallback(
    (o: OpcionPlantilla) => {
      // Una propia lleva su paleta y su pareja dentro. La instantánea del ajuste se
      // queda: «Deshacer ajuste» sigue volviendo a como estaba ANTES del ajuste.
      savePresentation(o.propia ? { templateId: o.templateId, paletteId: null, typographyId: null } : { templateId: o.templateId });
      setUsada(o.templateId);
      seguirVistaPrevia("diseno");
    },
    [savePresentation, seguirVistaPrevia],
  );

  const cerrar = useCallback(() => setAbierto(false), []);

  return {
    busy,
    progreso,
    resultado,
    aplicado,
    err,
    deshaciendo,
    deshecho,
    opciones,
    buscandoOpciones,
    usada,
    abierto,
    ajustar,
    deshacer,
    verOpciones,
    usar,
    cerrar,
  };
}
