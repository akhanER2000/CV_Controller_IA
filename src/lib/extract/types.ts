/** Formas de datos de la ingesta. StagedRow mapea 1:1 a la tabla staged_items. */

import type { SuspicionLevel, DuplicateSignal } from "./dedup";

/**
 * Los kinds del enum item_kind. 'reference' lo añade la migración 0004.
 *
 * ⚠ La INGESTA nunca produce 'reference': una referencia son datos de otra persona
 * y la escribe el usuario a mano (origin 'manual'), después de haberle pedido
 * permiso. Está en el union porque el enum de la base lo tiene y porque el master
 * las lee, no porque el extractor pueda inventarlas.
 */
export type ItemKind =
  | "basics" | "summary" | "work" | "bullet" | "education"
  | "skill" | "project" | "certification" | "language" | "link" | "reference";

export type Origin = "extracted" | "manual" | "ai_rephrased" | "ai_translated" | "api";

/** Verificación derivada de HECHOS, nunca del auto-reporte del LLM (§4.4). */
export type EvidenceLevel = "verified" | "partial" | "none" | "api";

export interface StagedRow {
  /** id local para enlazar viñetas ↔ su rol ANTES de insertar en la DB */
  key: string;
  /** una viñeta apunta a su work por esta clave */
  parentKey?: string;
  kind: ItemKind;
  /** forma según kind; se guarda en staged_items.data (jsonb) */
  data: Record<string, unknown>;
  lang: string;
  origin: Origin;
  /** etiqueta legible del origen: "texto pegado" · "GitHub · @user · API" · "misitio.cl" */
  sourceLabel: string;
  /** el fragmento LITERAL citado; null si no aplica */
  evidenceSnippet: string | null;
  evidenceLevel: EvidenceLevel;
  /** ¿el snippet aparece literal en raw_text? (staged_items.evidence_verified) */
  evidenceVerified: boolean;
  /** sospecha de que este item repite a otro. El usuario decide SIEMPRE. */
  duplicate?: DuplicateHint;
}

/**
 * La sospecha de duplicado tal cual viaja al staging. Antes era `duplicateOfKey`:
 * una clave suelta, sin nivel ni motivo, que obligaba a la UI a decir «posible
 * duplicado» sin poder explicar por qué. Un aviso que no se puede justificar no
 * ayuda a decidir — y aquí decidir es del usuario, así que la explicación es
 * parte del dato, no un adorno.
 */
export interface DuplicateHint {
  /** clave del otro staged (el que aparece ANTES: el candidato a canónico) */
  otherKey: string;
  level: SuspicionLevel;
  /** qué disparó la sospecha: "misma-empresa", "contenido", "misma-fuente"… */
  signals: DuplicateSignal[];
  /** motivo en español legible, para pintar en la tarjeta */
  reason: string;
}

export interface ImportResult {
  rawText: string;
  sources: string[];
  staged: StagedRow[];
  /** URLs de LinkedIn detectadas — NO legibles: la UI ofrece alternativas */
  linkedin: { url: string; slug?: string }[];
  counts: { verified: number; partial: number; none: number; api: number; total: number };
}
