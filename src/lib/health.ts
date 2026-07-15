/**
 * Salud de una variante — SIN score (prompt §7). Una lista de reglas, cada una
 * con su fuente. Solo comprueba lo que PUEDE fallar: las garantías por
 * construcción del renderer (1 columna, sin tablas, texto seleccionable…) no se
 * listan como logros — sería teatro de tranquilidad. "Todo en orden" = silencio.
 *
 * Cada hallazgo declara si su respaldo es [fuente] (evidencia citada) o
 * [criterio] (decisión de diseño nuestra, dicha como tal) — disfrazar la segunda
 * de la primera es justo lo que este producto no hace.
 */

import { extractNumbers, normalize } from "./verify";
import { normalizeCompany } from "./extract/dedup";

export type SourceKind = "fuente" | "criterio";
export interface Finding {
  rule: string;
  message: string;
  source: string;
  sourceKind: SourceKind;
}

export interface HealthBullet {
  text: string;
}
export interface HealthWork {
  company: string;
  title: string;
  dates?: string | null;
  bullets: HealthBullet[];
}
export interface HealthSkill {
  name: string;
  /** ¿aparece en alguna viñeta, repo o fuente? (lo calcula la capa de datos) */
  hasEvidence: boolean;
}
export interface HealthContact {
  name?: string;
  email?: string;
  phone?: string;
}
export interface HealthInput {
  targetTitle?: string;
  /** título del aviso, si hay JD enlazada */
  jobTitle?: string;
  work: HealthWork[];
  skills: HealthSkill[];
  contact: HealthContact;
  pageCount: number;
}

// Empresa con identificador legal: heurística — el nombre canónico (sin sufijo)
// difiere del nombre tal cual ⇒ tiene forma legal. Si son iguales ⇒ le falta.
function hasLegalId(company: string): boolean {
  return normalizeCompany(company) !== normalize(company).replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

const ABBREV = /\b(sr|jr|eng|dev|mgr|arch|adm|ing|lic)\.?\b/i;
const RESP_DE = /^\s*responsable de\b/i;

/**
 * Devuelve los hallazgos de una variante. Lista vacía ⇒ nada que señalar
 * (silencio = en orden). No incluye ✓ de garantías por construcción.
 */
export function checkHealth(v: HealthInput): Finding[] {
  const f: Finding[] = [];

  // 1 · Viñetas sin ninguna cifra — una por una, SIN umbral ni porcentaje.
  const sinCifra = v.work.flatMap((w) => w.bullets).filter((b) => extractNumbers(b.text).length === 0);
  for (const b of sinCifra) {
    f.push({
      rule: "bullet-sin-cifra",
      message: `Viñeta sin ninguna cifra — ¿cuánto? ¿cuántos? ¿en cuánto tiempo?: “${b.text}”`,
      source: "58,2% de reclutadores prioriza el logro medible",
      sourceKind: "fuente",
    });
  }

  // 2 · target_title ausente o distinto del aviso — 10,6×.
  if (!v.targetTitle || !v.targetTitle.trim()) {
    f.push({
      rule: "sin-titulo-objetivo",
      message: "Sin título objetivo. Si coincide con el título del aviso: 10,6× más entrevistas.",
      source: "Jobscan, 2,5M postulaciones",
      sourceKind: "fuente",
    });
  } else if (v.jobTitle && normalize(v.targetTitle) !== normalize(v.jobTitle)) {
    f.push({
      rule: "titulo-distinto-del-aviso",
      message: `Tu título objetivo (“${v.targetTitle}”) no coincide con el del aviso (“${v.jobTitle}”).`,
      source: "Jobscan, 2,5M postulaciones",
      sourceKind: "fuente",
    });
  }

  // 3 · Empresas sin identificador legal ("Acme" → "Acme SpA").
  for (const w of v.work) {
    if (!hasLegalId(w.company)) {
      f.push({
        rule: "empresa-sin-forma-legal",
        message: `“${w.company}” sin identificador legal — ¿“${w.company} SpA”?`,
        source: "Greenhouse",
        sourceKind: "fuente",
      });
    }
  }

  // 4 · Cargos abreviados ("Sr. Eng.").
  for (const w of v.work) {
    if (ABBREV.test(w.title)) {
      f.push({
        rule: "cargo-abreviado",
        message: `Cargo abreviado: “${w.title}”. Escríbelo completo.`,
        source: "Greenhouse",
        sourceKind: "fuente",
      });
    }
  }

  // 5 · Viñetas que empiezan con "Responsable de" (Fórmula XYZ).
  for (const w of v.work) {
    for (const b of w.bullets) {
      if (RESP_DE.test(b.text)) {
        f.push({
          rule: "responsable-de",
          message: `“${b.text}” — empieza con “Responsable de”. Di el logro, no el deber (X hice, medido por Y, haciendo Z).`,
          source: "Fórmula XYZ (Bock)",
          sourceKind: "criterio",
        });
      }
    }
  }

  // 6 · 3+ páginas — la página 3 es residual para el reclutador.
  if (v.pageCount >= 3) {
    f.push({
      rule: "tres-o-mas-paginas",
      message: `${v.pageCount} páginas — la página 3 no existe para el reclutador.`,
      source: "Ladders",
      sourceKind: "fuente",
    });
  }

  // 7 · Skills declaradas sin evidencia en ninguna fuente.
  for (const s of v.skills) {
    if (!s.hasEvidence) {
      f.push({
        rule: "skill-sin-evidencia",
        message: `${s.name} — sin evidencia. No aparece en ninguna viñeta, repo ni portfolio. ¿Dónde lo usaste?`,
        source: "32% admite declarar skills que no tiene",
        sourceKind: "fuente",
      });
    }
  }

  // 8 · Contacto incompleto — el riesgo real: existir y ser inalcanzable.
  const missing = [
    !v.contact.name && "nombre",
    !v.contact.email && "email",
    !v.contact.phone && "teléfono",
  ].filter(Boolean);
  if (missing.length) {
    f.push({
      rule: "contacto-incompleto",
      message: `Contacto incompleto (falta ${missing.join(", ")}) — el riesgo real es existir y ser inalcanzable.`,
      source: "el email en un header que Workday ignora deja el CV sin vía de contacto",
      sourceKind: "fuente",
    });
  }

  return f;
}

/**
 * Garantías POR CONSTRUCCIÓN del renderer — van en una nota discreta, UNA vez,
 * NUNCA como una lista de ✓ perpetuos (eso es el humo que el producto no vende).
 */
export const GUARANTEED_BY_CONSTRUCTION = [
  "una sola columna",
  "sin tablas",
  "sin headers/footers (contacto en el cuerpo)",
  "sin foto",
  "texto seleccionable",
] as const;
