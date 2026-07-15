/** Formas de datos de la ingesta. StagedRow mapea 1:1 a la tabla staged_items. */

export type ItemKind =
  | "basics" | "summary" | "work" | "bullet" | "education"
  | "skill" | "project" | "certification" | "language" | "link";

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
  /** clave de otro staged que quizá duplica a este (el usuario decide la fusión) */
  duplicateOfKey?: string;
}

export interface ImportResult {
  rawText: string;
  sources: string[];
  staged: StagedRow[];
  /** URLs de LinkedIn detectadas — NO legibles: la UI ofrece alternativas */
  linkedin: { url: string; slug?: string }[];
  counts: { verified: number; partial: number; none: number; api: number; total: number };
}
