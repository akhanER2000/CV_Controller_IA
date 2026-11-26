// Sin "use client": solo lo importa el editor (ya cliente).
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseEnabled } from "@/lib/supabase/config";
import type { AplicadoAfinar, DescartadoAfinar, SeccionAfinar } from "@/lib/cv/afinar";
import type { UsoLlamada } from "@/lib/ai/memoria";
import type { ResumenRespaldo } from "@/lib/cv/afinar-confirmar";
import { JSON_HEADERS, editableField, normalizeIncoming, readApiError, reason } from "./modelo";
import type { Editor } from "./useEditorVariante";

/* ============================================================================
   EL ESTADO DE «AFINAR CON IA» — sin JSX. Habla con POST /api/variants/[id]/afinar
   y pinta SIEMPRE la variante que devuelve el servidor (lo guardado, no lo que
   se cree guardado). Al cambiar los items, el preview vuelve a pasar el autofit.

   El selector «Texto: del master / afinado» alterna la versión DE VERDAD: «del
   master» revierte los overrides afinados en la base; «afinado» los vuelve a
   escribir pasando otra vez el candado en el servidor. Para poder volver, los
   textos afinados se recuerdan en este navegador (localStorage); si no hay nada
   recordado, se reconstruyen de los overrides de IA verificados de la variante.
   ============================================================================ */

export type AlcanceUI = "todo" | SeccionAfinar;
export type ModoTexto = "master" | "afinado";

interface TextoAfinado {
  id: string;
  campo: string;
  propuesto: string;
}

export interface UltimoAfinado {
  aplicado: AplicadoAfinar[];
  descartado: DescartadoAfinar[];
  notas: string;
  uso: UsoLlamada | null;
}

const claveDe = (variantId: string) => `corpus.afinado.v1.${variantId}`;

function leer(variantId: string): { modo: ModoTexto; textos: TextoAfinado[] } | null {
  try {
    const raw = localStorage.getItem(claveDe(variantId));
    if (!raw) return null;
    const v = JSON.parse(raw) as { modo?: string; textos?: TextoAfinado[] };
    if (!Array.isArray(v.textos)) return null;
    return { modo: v.modo === "master" ? "master" : "afinado", textos: v.textos };
  } catch {
    return null;
  }
}

function guardar(variantId: string, modo: ModoTexto, textos: TextoAfinado[]) {
  try {
    if (textos.length) localStorage.setItem(claveDe(variantId), JSON.stringify({ modo, textos }));
    else localStorage.removeItem(claveDe(variantId));
  } catch {
    /* sin almacenamiento: el selector vive solo en esta sesión */
  }
}

export function useAfinar(ed: Editor) {
  const { variantId, t, setItems, flash, aviso, seguirVistaPrevia } = ed;
  const [busy, setBusy] = useState<AlcanceUI | "modo" | "revertir" | "respaldo" | null>(null);
  // «Sin respaldo» pendiente de UNA confirmación (DA-M5): añadir/ocultar cambia la forma del CV.
  const [respaldo, setRespaldo] = useState<ResumenRespaldo | null>(null);
  const [err, setErr] = useState("");
  const [ultimo, setUltimo] = useState<UltimoAfinado | null>(null);
  const [textos, setTextos] = useState<TextoAfinado[]>([]);
  const [modo, setModo] = useState<ModoTexto>("afinado");
  const iniciado = useRef(false);

  // Arranque: lo recordado, o los overrides de IA verificados que ya tiene la variante.
  useEffect(() => {
    if (ed.loading || iniciado.current) return;
    iniciado.current = true;
    const mem = leer(variantId);
    if (mem) {
      setTextos(mem.textos);
      setModo(mem.modo);
      return;
    }
    const deIA: TextoAfinado[] = [];
    for (const i of ed.items) {
      const campo = editableField(i.kind);
      const v = campo ? i.override_data?.[campo] : undefined;
      if (campo && i.override_origin === "ai_rephrased" && i.override_verified && typeof v === "string" && v.trim()) {
        deIA.push({ id: i.id, campo, propuesto: v });
      }
    }
    setTextos(deIA);
  }, [ed.loading, ed.items, variantId]);

  const fijar = useCallback(
    (m: ModoTexto, ts: TextoAfinado[]) => {
      setModo(m);
      setTextos(ts);
      guardar(variantId, m, ts);
    },
    [variantId],
  );

  const llamar = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/variants/${variantId}/afinar`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const json = (await res.json()) as {
        aplicado?: AplicadoAfinar[];
        descartado?: DescartadoAfinar[];
        notas?: string;
        uso?: UsoLlamada | null;
        respaldo?: ResumenRespaldo | null;
        items?: unknown[];
      };
      if (Array.isArray(json.items)) {
        setItems(json.items.map(normalizeIncoming));
        // Paso 2 del Progreso: la vista previa rehace y mide el documento nuevo.
        seguirVistaPrevia("afinar");
      }
      return json;
    },
    [variantId, setItems, seguirVistaPrevia],
  );

  const afinar = useCallback(
    (alcance: AlcanceUI) => {
      if (!supabaseEnabled) {
        setErr(t("editor.afLocal"));
        return;
      }
      setBusy(alcance);
      setErr("");
      setRespaldo(null);
      void (async () => {
        try {
          // El aviso guardado en la variante orienta (no autoriza hechos) — DA-AV3.
          const r = await llamar({ alcance, aviso: aviso || undefined });
          const aplicado = r.aplicado ?? [];
          const descartado = r.descartado ?? [];
          setUltimo({ aplicado, descartado, notas: r.notas ?? "", uso: r.uso ?? null });
          // Los textos nuevos reemplazan a los recordados del mismo item.
          const nuevos = aplicado.flatMap((a) =>
            a.tipo === "texto" ? [{ id: a.id, campo: a.campo, propuesto: a.propuesto }] : [],
          );
          const ids = new Set(nuevos.map((n) => n.id));
          if (nuevos.length) fijar("afinado", [...textos.filter((x) => !ids.has(x.id)), ...nuevos]);
          const pend = r.respaldo && r.respaldo.anadir + r.respaldo.ocultar > 0 ? r.respaldo : null;
          setRespaldo(pend);
          if (aplicado.length || descartado.length || !pend) {
            flash(
              aplicado.length || descartado.length
                ? t("editor.afHecho").replace("{a}", String(aplicado.length)).replace("{d}", String(descartado.length))
                : t("editor.afNada"),
            );
          }
          if (!aplicado.length && r.notas) setErr(r.notas);
        } catch (e) {
          console.error("[editor] no se pudo afinar", e);
          setErr(reason(e));
          flash(t("editor.afErr").replace("{r}", reason(e)));
        } finally {
          setBusy(null);
        }
      })();
    },
    [llamar, fijar, textos, flash, t, aviso],
  );

  /** «Aplicar» del resumen de sin respaldo: el servidor lo recalcula y, si cambió, no toca nada. */
  const aplicarRespaldo = useCallback(() => {
    if (!respaldo) return;
    setBusy("respaldo");
    void (async () => {
      try {
        const r = await llamar({ accion: "respaldo", esperado: respaldo });
        const nuevos = r.aplicado ?? [];
        // Se suma al último afinado: «Revertir afinado» deshace también esto.
        setUltimo((u) => ({
          aplicado: [...(u?.aplicado ?? []), ...nuevos],
          descartado: u?.descartado ?? [],
          notas: u?.notas ?? "",
          uso: u?.uso ?? null,
        }));
        setRespaldo(null);
        flash(t("editor.afRespHecho").replace("{n}", String(nuevos.length)));
      } catch (e) {
        console.error("[editor] no se pudo aplicar el sin respaldo", e);
        setRespaldo(null);
        setErr(reason(e));
        flash(t("editor.afErr").replace("{r}", reason(e)));
      } finally {
        setBusy(null);
      }
    })();
  }, [respaldo, llamar, flash, t]);

  const cancelarRespaldo = useCallback(() => {
    setRespaldo(null);
    flash(t("editor.afRespCancelado"));
  }, [flash, t]);

  /** Deshace el ÚLTIMO afinado entero: texto al master, lo mostrado oculto, lo añadido fuera. */
  const revertir = useCallback(() => {
    if (!ultimo?.aplicado.length) return;
    setBusy("revertir");
    void (async () => {
      try {
        await llamar({ accion: "revertir", aplicados: ultimo.aplicado });
        const ids = new Set(ultimo.aplicado.map((a) => a.id));
        fijar(modo, textos.filter((x) => !ids.has(x.id)));
        setUltimo(null);
        flash(t("editor.afRevertido"));
      } catch (e) {
        console.error("[editor] no se pudo revertir el afinado", e);
        flash(t("editor.afErr").replace("{r}", reason(e)));
      } finally {
        setBusy(null);
      }
    })();
  }, [ultimo, llamar, fijar, modo, textos, flash, t]);

  // El selector dice lo que HAY en la base, no lo recordado: si un item afinado
  // tiene ahora su texto afinado, la variante está «afinada»; si no, «del master».
  // (Revertir un item suelto o deshacer en otra pestaña no deja el selector mintiendo.)
  const modoReal: ModoTexto = textos.some((x) => {
    const it = ed.items.find((i) => i.id === x.id);
    return it != null && String(it.data[x.campo] ?? "") === x.propuesto;
  })
    ? "afinado"
    : textos.length
      ? "master"
      : modo;

  /** El selector: «del master» revierte en la base; «afinado» vuelve a escribir (con candado). */
  const cambiarModo = useCallback(
    (m: ModoTexto) => {
      if (m === modoReal || !textos.length) return;
      setBusy("modo");
      void (async () => {
        try {
          if (m === "master") {
            const aplicados = textos.map((x) => ({
              tipo: "texto" as const, id: x.id, itemId: "", kind: "", campo: x.campo,
              original: "", propuesto: x.propuesto, motivo: "", antes: null,
            }));
            await llamar({ accion: "revertir", aplicados });
            fijar("master", textos);
            flash(t("editor.afModoMasterOk"));
          } else {
            const r = await llamar({ accion: "aplicar", propuestas: textos.map((x) => ({ id: x.id, propuesto: x.propuesto })) });
            const ok = (r.aplicado ?? []).flatMap((a) =>
              a.tipo === "texto" ? [{ id: a.id, campo: a.campo, propuesto: a.propuesto }] : [],
            );
            fijar("afinado", ok);
            flash(t("editor.afModoAfinadoOk").replace("{n}", String(ok.length)));
          }
          setUltimo(null);
        } catch (e) {
          console.error("[editor] no se pudo cambiar el texto de la variante", e);
          flash(t("editor.afErr").replace("{r}", reason(e)));
        } finally {
          setBusy(null);
        }
      })();
    },
    [modoReal, textos, llamar, fijar, flash, t],
  );

  return {
    busy, err, ultimo, textos, modo: modoReal, afinar, revertir, cambiarModo, cerrarResumen: () => setUltimo(null),
    respaldo, aplicarRespaldo, cancelarRespaldo, conAviso: Boolean(aviso),
  };
}
