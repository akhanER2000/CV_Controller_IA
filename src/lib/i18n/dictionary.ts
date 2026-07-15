/* ============================================================================
   i18n · dictionary.ts — el diccionario bilingüe (ES + EN), ensamblado desde los
   namespaces de dict/*. Cada pantalla llena su propio archivo (dict/<pantalla>.ts)
   para que el barrido i18n se pueda paralelizar sin colisiones. Aquí solo se
   fusionan. ES es la referencia; EN sale de 06-handoff/copy.md (voz del producto).

   Las claves son planas ("auth.claim", "master.title"). translate() cae a ES y,
   en último caso, a la propia clave — así una clave aún no traducida degrada
   visible pero no rompe.
   ============================================================================ */

import { menuCuenta } from "./dict/menu-cuenta";
import { common } from "./dict/common";
import { auth } from "./dict/auth";
import { onboarding } from "./dict/onboarding";
import { importar } from "./dict/importar";
import { staging } from "./dict/staging";
import { dashboard } from "./dict/dashboard";
import { master } from "./dict/master";
import { variantes } from "./dict/variantes";
import { editor } from "./dict/editor";
import { tailor } from "./dict/tailor";
import { salud } from "./dict/salud";
import { fuentes } from "./dict/fuentes";
import { ajustes } from "./dict/ajustes";

type Table = Record<string, string>;
interface Namespace {
  es: Table;
  en: Table;
}

const parts: Namespace[] = [
  menuCuenta, common, auth, onboarding, importar, staging, dashboard,
  master, variantes, editor, tailor, salud, fuentes, ajustes,
];

const merge = (lang: "es" | "en"): Table => Object.assign({}, ...parts.map((p) => p[lang]));

export const dict = { es: merge("es"), en: merge("en") } as const;

/** Idiomas soportados por la UI. */
export type Lang = "es" | "en";
/** Claves de traducción: planas (string). translate() degrada con gracia. */
export type TKey = string;

/** Traduce `key` al `lang` dado, con fallback a ES y, en último caso, a la clave. */
export function translate(lang: Lang, key: TKey): string {
  return dict[lang][key] ?? dict.es[key] ?? key;
}
