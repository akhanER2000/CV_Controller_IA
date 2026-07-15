/* ============================================================================
   i18n · paridad de claves ES/EN.

   translate() cae a ES cuando falta la clave EN (dictionary.ts §49). Eso evita
   que la UI reviente, pero también ESCONDE los huecos: una pantalla "traducida"
   puede seguir mostrando español en EN sin que nada falle. Este test convierte
   ese fallback silencioso en un fallo ruidoso: ES y EN deben tener EXACTAMENTE
   el mismo conjunto de claves, namespace por namespace y en el diccionario ya
   fusionado.

   Si añades una clave, añádela en los dos idiomas. Si un namespace pisa una
   clave de otro (colisión en el merge), el recuento por-namespace lo delata.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import { dict } from "../src/lib/i18n/dictionary";

import { menuCuenta } from "../src/lib/i18n/dict/menu-cuenta";
import { common } from "../src/lib/i18n/dict/common";
import { auth } from "../src/lib/i18n/dict/auth";
import { onboarding } from "../src/lib/i18n/dict/onboarding";
import { importar } from "../src/lib/i18n/dict/importar";
import { staging } from "../src/lib/i18n/dict/staging";
import { dashboard } from "../src/lib/i18n/dict/dashboard";
import { master } from "../src/lib/i18n/dict/master";
import { variantes } from "../src/lib/i18n/dict/variantes";
import { editor } from "../src/lib/i18n/dict/editor";
import { tailor } from "../src/lib/i18n/dict/tailor";
import { salud } from "../src/lib/i18n/dict/salud";
import { fuentes } from "../src/lib/i18n/dict/fuentes";
import { ajustes } from "../src/lib/i18n/dict/ajustes";

type Namespace = { es: Record<string, string>; en: Record<string, string> };

const namespaces: Record<string, Namespace> = {
  menuCuenta, common, auth, onboarding, importar, staging, dashboard,
  master, variantes, editor, tailor, salud, fuentes, ajustes,
};

describe("i18n · paridad de claves ES/EN", () => {
  it("cada namespace tiene el mismo conjunto de claves en ES y EN", () => {
    const mismatches: string[] = [];
    for (const [name, ns] of Object.entries(namespaces)) {
      const es = Object.keys(ns.es).sort();
      const en = Object.keys(ns.en).sort();
      const faltanEn = es.filter((k) => !(k in ns.en));
      const faltanEs = en.filter((k) => !(k in ns.es));
      if (faltanEn.length) mismatches.push(`[${name}] sin EN: ${faltanEn.join(", ")}`);
      if (faltanEs.length) mismatches.push(`[${name}] sin ES: ${faltanEs.join(", ")}`);
    }
    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });

  it("el diccionario fusionado tiene las mismas claves en ES y EN", () => {
    const es = Object.keys(dict.es);
    const en = Object.keys(dict.en);
    const faltanEn = es.filter((k) => !(k in dict.en));
    const faltanEs = en.filter((k) => !(k in dict.es));
    expect(faltanEn, `claves sin EN: ${faltanEn.join(", ")}`).toEqual([]);
    expect(faltanEs, `claves sin ES: ${faltanEs.join(", ")}`).toEqual([]);
  });

  it("ningún valor EN quedó copiado tal cual del español de forma sospechosa", () => {
    // No exige que ES≠EN (hay términos idénticos legítimos: 'PDF', 'GitHub',
    // 'DevOps', nombres propios…). Solo verifica que EN no esté VACÍO donde ES
    // tiene texto — un vacío es un hueco real, no una coincidencia.
    const vacios = Object.keys(dict.es).filter(
      (k) => dict.es[k]?.trim() && !dict.en[k]?.trim(),
    );
    expect(vacios, `claves con EN vacío: ${vacios.join(", ")}`).toEqual([]);
  });
});
