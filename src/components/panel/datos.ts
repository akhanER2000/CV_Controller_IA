/* ============================================================================
   Derivaciones del Panel (Forja v2). Funciones PURAS: reciben lo que devuelven
   /api/master?summary=1, /api/variants y /api/sources y calculan las cifras que
   pinta la pantalla. Aquí no se inventa nada: si un dato no existe, la función
   devuelve null o una lista vacía y la pantalla pone un EmptyState.

   De dónde sale cada número (y la `fuente` que lleva su KpiCard):
     ítems del master      → summary.masterItems           (countMasterItems)
     variantes             → summary.variants              (cv_variants no archivadas)
     % verificados         → items[].evidenceVerified      (getMasterItems)
     fuentes cargadas      → summary.sources               (ingestion_sources)
     última actualización  → max(variants[].updatedAt, sources[].createdAt)
     ítems por tipo        → items[].kind                  (getMasterItems)
     variantes por mes     → variants[].updatedAt          (listVariants)
   ============================================================================ */

export interface ItemLite {
  kind: string;
  evidenceVerified: boolean;
}

export interface TipoCuenta {
  kind: string;
  n: number;
}

/** Ítems del master agrupados por tipo, de más a menos. Las viñetas se cuentan
 *  aparte de su rol: son ítems propios del registro. */
export function itemsPorTipo(items: ItemLite[]): TipoCuenta[] {
  const m = new Map<string, number>();
  for (const it of items) m.set(it.kind, (m.get(it.kind) ?? 0) + 1);
  return [...m.entries()]
    .map(([kind, n]) => ({ kind, n }))
    .sort((a, b) => b.n - a.n || a.kind.localeCompare(b.kind));
}

/** Verificados contra pendientes. `null` si no hay ítems: 0 de 0 no es un 0 %. */
export function verificacion(items: ItemLite[]): { verificados: number; total: number; pct: number } | null {
  if (items.length === 0) return null;
  const verificados = items.filter((i) => i.evidenceVerified).length;
  return { verificados, total: items.length, pct: Math.round((verificados / items.length) * 100) };
}

/** Variantes por mes de su última edición ("2026-11"), en orden cronológico.
 *  Solo se usa si hay al menos dos meses distintos: un punto no es una serie. */
export function variantesPorMes(variantes: { updatedAt: string }[]): { mes: string; n: number }[] {
  const m = new Map<string, number>();
  for (const v of variantes) {
    const d = new Date(v.updatedAt);
    if (!Number.isFinite(d.getTime())) continue;
    const mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    m.set(mes, (m.get(mes) ?? 0) + 1);
  }
  return [...m.entries()].map(([mes, n]) => ({ mes, n })).sort((a, b) => a.mes.localeCompare(b.mes));
}

/** La fecha más reciente de las que llegan (ISO). `null` si no hay ninguna válida. */
export function ultimaActualizacion(fechas: (string | null | undefined)[]): string | null {
  let mejor: number | null = null;
  let iso: string | null = null;
  for (const f of fechas) {
    if (!f) continue;
    const t = new Date(f).getTime();
    if (!Number.isFinite(t)) continue;
    if (mejor === null || t > mejor) {
      mejor = t;
      iso = f;
    }
  }
  return iso;
}

/** Filtro de la lista de variantes: texto (nombre u objetivo) y estado. */
export type EstadoVariante = "todas" | "aldia" | "desactualizadas";

export function filtrarVariantes<T extends { nm: string; obj: string; old: boolean }>(
  lista: T[],
  texto: string,
  estado: EstadoVariante,
): T[] {
  const q = texto.trim().toLocaleLowerCase();
  return lista.filter((v) => {
    if (estado === "aldia" && v.old) return false;
    if (estado === "desactualizadas" && !v.old) return false;
    if (!q) return true;
    return v.nm.toLocaleLowerCase().includes(q) || v.obj.toLocaleLowerCase().includes(q);
  });
}
