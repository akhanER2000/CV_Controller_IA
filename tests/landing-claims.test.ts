/* ============================================================================
   EL CANDADO ANTI-INVENCIÓN DE LA LANDING.

   La tesis del producto es que la IA no inventa y que cada dato tiene
   procedencia. Si la página que vende esa tesis cita una métrica de humo, el
   discurso entero se cae — y el producto ES ese discurso. Así que la landing
   está sometida a su propia regla: toda cifra que aparezca en su diccionario
   tiene que estar en prompts/00-INVESTIGACION.md, el anexo donde cada
   afirmación lleva su fuente.

   Cómo funciona:
     · se extraen TODOS los tokens numéricos de los valores ES y EN;
     · se buscan en el anexo con frontera de dígito (para que "30" no cuele
       porque exista "300"), probando las dos formas del separador decimal
       (ES "10,6" · EN "10.6") — la misma cifra escrita en dos idiomas;
     · si un token no está, el test dice exactamente qué clave lo metió.

   Por eso los DATOS DE EJEMPLO (el CV ficticio de la demo) viven fuera del
   diccionario, en src/components/landing/demo-data.ts: son una maqueta de
   contenido declarada como tal en la página, no afirmaciones sobre el mundo.
   Si alguien los mueve al diccionario, este test se lo dirá.

   Y el número de plantillas tampoco se escribe a mano: sale de listTemplates()
   en tiempo de build. Aquí se comprueba que el copy siga usando el marcador y no
   una cifra congelada.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { landing } from "../src/lib/i18n/dict/landing";

const here = path.dirname(fileURLToPath(import.meta.url));
const anexo = readFileSync(path.join(here, "../prompts/00-INVESTIGACION.md"), "utf8");

/** Un número tal y como se escribe en un texto: 7,4 · 10.6 · 384 · 2025 */
const NUM = /\d+(?:[.,]\d+)*/g;

/** Las dos escrituras de la misma cifra (separador decimal ES/EN). */
function variants(token: string): string[] {
  const swapped = token.includes(",")
    ? token.replace(/,/g, ".")
    : token.includes(".")
      ? token.replace(/\./g, ",")
      : null;
  return swapped ? [token, swapped] : [token];
}

/** ¿Aparece la cifra en el anexo COMO CIFRA (no como trozo de otra mayor)? */
function citedInAnexo(token: string): boolean {
  return variants(token).some((v) => {
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\d.,])${escaped}(?![\\d.,])`).test(anexo);
  });
}

/** Todas las cifras del diccionario, con la clave y el idioma que las trae. */
function figuresInDict(): { key: string; lang: "es" | "en"; token: string }[] {
  const out: { key: string; lang: "es" | "en"; token: string }[] = [];
  for (const lang of ["es", "en"] as const) {
    for (const [key, value] of Object.entries(landing[lang])) {
      for (const token of value.match(NUM) ?? []) out.push({ key, lang, token });
    }
  }
  return out;
}

describe("landing · ninguna cifra inventada", () => {
  it("toda cifra del diccionario de la landing está en 00-INVESTIGACION.md", () => {
    const huerfanas = figuresInDict()
      .filter((f) => !citedInAnexo(f.token))
      .map((f) => `${f.lang} · ${f.key} → "${f.token}" no está en el anexo`);

    expect(huerfanas, huerfanas.join("\n")).toEqual([]);
  });

  it("el anexo se leyó de verdad (si no, el test anterior sería un placebo)", () => {
    // Un fichero vacío o mal resuelto haría pasar cualquier cifra... o ninguna.
    // Estas tres SÍ están en el anexo y son las que cita la página.
    expect(anexo.length).toBeGreaterThan(1000);
    for (const token of ["10,6", "76,4", "7,4"]) {
      expect(citedInAnexo(token), `el anexo debería contener ${token}`).toBe(true);
    }
    // Y esta no está: si diera positivo, la frontera de dígito no funciona.
    expect(citedInAnexo("99999")).toBe(false);
  });

  it("cada cifra citada va acompañada de su fuente y de sus límites", () => {
    // La página promete "con su fuente y sus límites a la vista": la promesa se
    // cumple en la estructura del diccionario, no en la buena voluntad de nadie.
    for (const k of ["a", "b", "c"]) {
      for (const lang of ["es", "en"] as const) {
        const tabla = landing[lang];
        expect(tabla[`landing.ev.${k}.figure`]?.trim(), `${lang} ev.${k}.figure`).toBeTruthy();
        expect(tabla[`landing.ev.${k}.source`]?.trim(), `${lang} ev.${k}.source`).toBeTruthy();
        expect(tabla[`landing.ev.${k}.caveat`]?.trim(), `${lang} ev.${k}.caveat`).toBeTruthy();
      }
    }
  });

  it("el número de plantillas no está escrito a mano: se inyecta desde el catálogo", () => {
    for (const lang of ["es", "en"] as const) {
      expect(landing[lang]["landing.tpl.title"]).toContain("{n}");
      expect(landing[lang]["landing.tpl.count"]).toContain("{a}");
      expect(landing[lang]["landing.tpl.count"]).toContain("{b}");
    }
  });

  it("ES y EN tienen exactamente las mismas claves", () => {
    const es = Object.keys(landing.es).sort();
    const en = Object.keys(landing.en).sort();
    expect(es.filter((k) => !(k in landing.en)), "sin EN").toEqual([]);
    expect(en.filter((k) => !(k in landing.es)), "sin ES").toEqual([]);
  });
});
