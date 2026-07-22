"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";
import { derivarProgreso, type FilaEvento, type FilaFuente, type Progreso } from "./progreso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL OBSERVADOR — la pantalla MIRA, no ejecuta
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ★ POR QUÉ SONDEO Y NO SSE. En serverless, el que ingiere y el que sirve un
 *   stream son DOS invocaciones distintas: no comparten memoria, así que un SSE
 *   tendría que leer igualmente de la base para saber qué emitir — y encima
 *   mantendría una función abierta consumiendo presupuesto durante todo el
 *   trabajo. `ingestion_sources` e `ingestion_events` tienen RLS «own rows», o
 *   sea que el navegador puede leerlas DIRECTAMENTE con la anon key: sondear no
 *   gasta ni una invocación de función.
 *
 * ★ POR QUÉ EL HOOK EMPUJA. Comprobado en las docs de Vercel: `waitUntil` (y
 *   `after()`, que es lo mismo allí) muere con la invocación — «If the function
 *   times out, the promises will be cancelled». Una ingesta de 16 fuentes puede
 *   pasarse de los 300 s de Hobby. Cuando eso ocurre el trabajo queda EN PAUSA,
 *   con todo lo hecho escrito, y alguien tiene que abrir una invocación nueva.
 *   Ese alguien es este hook, desde cualquier pantalla donde esté montado.
 *
 *   ⚠ SE DICE ENTERO: si nadie tiene la app abierta, el trabajo espera. No se
 *     pierde ni se repite — espera. Un worker autónomo de verdad exige un
 *     servicio fuera de Vercel, y eso es una decisión del usuario, no una que
 *     este código pueda tomar por su cuenta.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Cada cuánto se relee el estado MIENTRAS hay un trabajo vivo. Suficiente para
 *  que una etapa no pase desapercibida y lo bastante espaciado para no castigar
 *  a Supabase. */
export const MS_SONDEO = 2500;

/** Cada cuánto pregunta el indicador del shell cuando NO hay nada en marcha.
 *  Va montado en las diez pantallas: a 2,5 s sería una consulta cada dos
 *  segundos y medio durante toda la sesión, para no enseñar nada. */
export const MS_SONDEO_REPOSO = 15_000;

/** Mínimo entre dos empujones. Sin esto, un trabajo que tarda en arrancar
 *  recibiría una invocación por sondeo — y se pagarían todas. */
export const MS_ENTRE_EMPUJONES = 20_000;

export interface EstadoObservado {
  jobId: string | null;
  progreso: Progreso | null;
  /** hay un `avanzar` en vuelo */
  reanudando: boolean;
  /** fallo del SONDEO o del empujón, literal. Nunca se traga. */
  error: string | null;
  /** fuerza una relectura inmediata (tras crear el trabajo, p. ej.) */
  refrescar: () => void;
}

const mensaje = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Observa un trabajo de ingesta.
 *
 * @param jobIdFijado  el trabajo a mirar. `null` = búscalo tú (el shell no sabe
 *                     cuál es: pregunta por cualquier fuente sin terminar).
 * @param empujar      si este observador puede pedir `avanzar`. La pantalla de
 *                     importar y el indicador del shell lo hacen los dos; que
 *                     coincidan no rompe nada (el reclamo de fuentes es atómico),
 *                     pero el acuerdo de espera evita gastar invocaciones de más.
 */
export function useIngesta(jobIdFijado: string | null, empujar = true): EstadoObservado {
  /* ⚠ SIN SUPABASE NO HAY NADA QUE OBSERVAR, Y HAY QUE NO ESTORBAR.
     `createClient()` revienta si faltan las NEXT_PUBLIC_*, y este hook va
     montado en el shell de /app: un throw aquí tumbaría LAS DIEZ PANTALLAS en
     el modo local que la propia app documenta (lib/supabase/config.ts). Se
     construye `null` y todo lo demás se apaga solo. */
  const sb = useMemo(() => (supabaseEnabled ? createClient() : null), []);
  const [jobId, setJobId] = useState<string | null>(jobIdFijado);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [reanudando, setReanudando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const ultimoEmpujon = useRef(0);
  const vivo = useRef(true);

  useEffect(() => {
    setJobId(jobIdFijado);
    // Al cambiar de trabajo, el progreso anterior deja de ser cierto: se limpia
    // en vez de arrastrar los números del trabajo viejo un sondeo más.
    if (jobIdFijado === null) setProgreso(null);
  }, [jobIdFijado]);

  const refrescar = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!sb) return; // modo local: no hay base que sondear
    // Alias no-nulo: las funciones de abajo son cierres asíncronos y TypeScript
    // no puede estrechar `sb` dentro de ellos.
    const db = sb;
    vivo.current = true;
    let temporizador: number | undefined;

    /** Reprograma el siguiente sondeo. Es un temporizador que se re-arma solo,
     *  no un intervalo fijo: así el ritmo puede cambiar según lo que se vea, y
     *  dos sondeos no se solapan si uno tarda. */
    const reprogramar = (ms: number) => {
      if (!vivo.current) return;
      temporizador = window.setTimeout(() => void sondear(), ms);
    };

    async function descubrir(): Promise<string | null> {
      // Cualquier fuente sin terminar delata su lote. RLS «own rows» se encarga
      // de que solo se vean las propias: no hace falta filtrar por usuario.
      const { data, error: e } = await db
        .from("ingestion_sources")
        .select("batch_id,created_at")
        .in("status", ["pending", "parsing"])
        .not("batch_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (e) throw new Error(e.message);
      return (data?.[0]?.batch_id as string | undefined) ?? null;
    }

    async function sondear() {
      let siguiente = MS_SONDEO;
      try {
        const id = jobId ?? (jobIdFijado === null ? await descubrir() : null);
        if (!vivo.current) return;
        if (!id) {
          setProgreso(null);
          siguiente = MS_SONDEO_REPOSO;
          return;
        }
        if (id !== jobId) setJobId(id);

        const { data: fuentes, error: e1 } = await db
          .from("ingestion_sources")
          .select("id,kind,original_name,status,error,created_at")
          .eq("batch_id", id)
          .order("created_at", { ascending: true });
        if (e1) throw new Error(e1.message);
        const filas = (fuentes ?? []) as unknown as FilaFuente[];
        if (!filas.length) {
          setProgreso(null);
          siguiente = MS_SONDEO_REPOSO;
          return;
        }

        const { data: eventos, error: e2 } = await db
          .from("ingestion_events")
          .select("source_id,message,payload,created_at")
          .in(
            "source_id",
            filas.map((f) => f.id),
          )
          .order("created_at", { ascending: true });
        if (e2) throw new Error(e2.message);

        if (!vivo.current) return;
        const p = derivarProgreso(id, filas, (eventos ?? []) as unknown as FilaEvento[], Date.now());
        setProgreso(p);
        setError(null);

        // Terminado ⇒ se deja de preguntar. El resultado ya no cambia solo, y
        // sondear una ingesta muerta es gasto sin nada que enseñar.
        if (p.terminado) {
          siguiente = 0;
          return;
        }

        /* ── el empujón ──────────────────────────────────────────────────
           Solo cuando el trabajo está EN PAUSA de verdad y ha pasado el
           acuerdo de espera. `avanzar` es inocuo si no hay nada que hacer,
           pero inocuo no es gratis: cada llamada es una invocación. */
        const ahora = Date.now();
        if (empujar && p.pausado && ahora - ultimoEmpujon.current > MS_ENTRE_EMPUJONES) {
          ultimoEmpujon.current = ahora;
          setReanudando(true);
          try {
            const res = await fetch(`/api/import/job/${id}/avanzar`, { method: "POST" });
            if (!res.ok) {
              const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
              throw new Error(cuerpo?.error ?? `HTTP ${res.status}`);
            }
          } finally {
            if (vivo.current) setReanudando(false);
          }
        }
      } catch (e) {
        if (vivo.current) setError(mensaje(e));
        // Un fallo de red no puede convertirse en una tormenta de reintentos.
        siguiente = MS_SONDEO_REPOSO;
      } finally {
        if (siguiente > 0) reprogramar(siguiente);
      }
    }

    void sondear();
    return () => {
      vivo.current = false;
      if (temporizador) window.clearTimeout(temporizador);
    };
    // `tick` fuerza el reinicio del ciclo tras crear un trabajo.
  }, [sb, jobId, jobIdFijado, empujar, tick]);

  return { jobId, progreso, reanudando, error, refrescar };
}
