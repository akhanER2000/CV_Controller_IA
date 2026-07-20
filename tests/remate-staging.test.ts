/* ============================================================================
   EL REMATE DEL VOLCADO · de staging a variantes.

   EL BUG QUE CIERRA. Al terminar de revisar, la única salida de Staging era
   «Ver el master». El master es el INVENTARIO, no el objetivo: el usuario venía
   a tener un CV y se quedaba mirando una lista. Peor: la línea fina ya prometía
   por escrito «crear tu primera variante para un aviso concreto» y no enlazaba
   nada. Una promesa escrita y no cumplida es peor que no prometer.

   QUÉ VIGILA ESTE TEST. Lo que puede MENTIR, que es exactamente lo que el
   producto no se permite:

     · pintar un número que nadie confirmó («47 items en tu master» sin haber
       preguntado al servidor);
     · ofrecer «crear la primera con IA» cuando no hay master del que sacarla
       —POST /api/variants {mode:'ai'} contesta 422 «Tu master está vacío»—, o
       cuando ni siquiera se sabe si el usuario ya tiene variantes;
     · perder la salida que ya existía al añadir la nueva;
     · rotular con claves i18n que no existen, o que existen solo en español.

   Ataca la función PURA (rotuloRemate) contra el diccionario REAL, y el JSX por
   texto donde no hay función que atacar. No monta React: el entorno es node.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rotuloRemate, HREF_VARIANTES, type RemateInfo } from "../src/components/screens/StagingScreen";
import { withOrigin } from "../src/components/Breadcrumb";
import { staging } from "../src/lib/i18n/dict/staging";

const here = path.dirname(fileURLToPath(import.meta.url));
const leer = (rel: string) => readFileSync(path.join(here, rel), "utf8");
const fuente = leer("../src/components/screens/StagingScreen.tsx");

/* ── 1 · Ningún número sin fuente ─────────────────────────────────────────── */

describe("remate · ningún número sin fuente", () => {
  it("sin respuesta del servidor no hay número que pintar", () => {
    // El caso real: 401 en modo local, red caída, payload raro. El botón tiene
    // que seguir ahí; el número, no.
    expect(rotuloRemate(null).master).toBe(null);
  });

  it("un master de 0 items no se anuncia (todo descartado no es un logro)", () => {
    expect(rotuloRemate({ variantes: 0, masterItems: 0 }).master).toBe(null);
    expect(rotuloRemate({ variantes: 3, masterItems: 0 }).master).toBe(null);
  });

  it("un NaN colado por el fetch no llega a pintarse", () => {
    // `typeof NaN === "number"` pasa la validación del payload: el filtro real
    // es este. Si alguien cambia `> 0` por `!= null`, se pinta "NaN items".
    expect(rotuloRemate({ variantes: 0, masterItems: Number.NaN }).master).toBe(null);
    expect(rotuloRemate({ variantes: 0, masterItems: -7 }).master).toBe(null);
  });

  it("con número real, se pinta ESE número y no otro", () => {
    expect(rotuloRemate({ variantes: 0, masterItems: 47 }).master).toBe(47);
    expect(rotuloRemate({ variantes: 2, masterItems: 1 }).master).toBe(1);
  });

  it("el JSX no pinta el número fuera del guardián", () => {
    // La clave del número solo puede aparecer bajo `rotulo.master !== null`.
    const usos = fuente.match(/staging\.remateMaster/g) ?? [];
    expect(usos.length, "la clave del número aparece más de una vez").toBe(1);
    expect(
      /rotulo\.master !== null \?[\s\S]{0,120}staging\.remateMaster/.test(fuente),
      "staging.remateMaster se pinta sin comprobar que el número existe",
    ).toBe(true);
  });
});

/* ── 2 · La promesa de IA solo cuando se sostiene ─────────────────────────── */

describe("remate · la promesa de «la primera con IA»", () => {
  it("se ofrece con cero variantes y master poblado", () => {
    const r = rotuloRemate({ variantes: 0, masterItems: 52 });
    expect(r.cta).toBe("staging.remateCtaFirst");
    expect(r.fine).toBe("staging.remateFineFirst");
  });

  it("NO se ofrece con el master vacío: el endpoint contestaría 422", () => {
    const r = rotuloRemate({ variantes: 0, masterItems: 0 });
    expect(r.cta).toBe("staging.remateCta");
    expect(r.fine).not.toBe("staging.remateFineFirst");
  });

  it("NO se ofrece cuando no se sabe nada: no se promete a ciegas", () => {
    const r = rotuloRemate(null);
    expect(r.cta).toBe("staging.remateCta");
    expect(r.fine).toBe("staging.emptyFine");
  });

  it("NO se ofrece a quien ya tiene variantes: no sería «la primera»", () => {
    const r = rotuloRemate({ variantes: 1, masterItems: 52 });
    expect(r.cta).toBe("staging.remateCta");
    expect(r.fine).toBe("staging.remateFineMore");
  });

  it("la regla se cumple en toda la matriz, no solo en los casos bonitos", () => {
    const casos: RemateInfo[] = [null];
    for (const variantes of [0, 1, 7]) {
      for (const masterItems of [0, 1, 52, -3, Number.NaN]) casos.push({ variantes, masterItems });
    }
    for (const c of casos) {
      const prometeIA = rotuloRemate(c).cta === "staging.remateCtaFirst";
      const sostenible = c !== null && c.variantes === 0 && c.masterItems > 0;
      expect(prometeIA, `promesa de IA incoherente en ${JSON.stringify(c)}`).toBe(sostenible);
    }
  });
});

/* ── 3 · Los rótulos son claves REALES, en los dos idiomas ────────────────── */

describe("remate · i18n con paridad, sin claves fantasma", () => {
  const salidas: RemateInfo[] = [
    null,
    { variantes: 0, masterItems: 0 },
    { variantes: 0, masterItems: 52 },
    { variantes: 4, masterItems: 52 },
  ];

  it("toda clave que rotuloRemate puede devolver existe en ES y EN", () => {
    // Si alguien renombra una clave del diccionario y olvida la función (o al
    // revés), el botón se queda con la clave cruda en pantalla. Aquí revienta.
    for (const c of salidas) {
      const { cta, fine } = rotuloRemate(c);
      for (const k of [cta, fine]) {
        expect(staging.es[k]?.trim(), `falta ES: ${k}`).toBeTruthy();
        expect(staging.en[k]?.trim(), `falta EN: ${k}`).toBeTruthy();
      }
    }
  });

  it("las claves nuevas están en los dos idiomas y no son la misma cadena", () => {
    const nuevas = [
      "staging.remateMaster",
      "staging.remateCta",
      "staging.remateCtaFirst",
      "staging.remateFineFirst",
      "staging.remateFineMore",
      "staging.sourceParamNote",
    ];
    for (const k of nuevas) {
      expect(staging.es[k]?.trim(), `falta ES: ${k}`).toBeTruthy();
      expect(staging.en[k]?.trim(), `falta EN: ${k}`).toBeTruthy();
      // EN copiado tal cual del ES es el fallback silencioso que el producto no
      // se permite (son frases, no siglas: no hay coincidencia legítima).
      expect(staging.es[k], `EN sin traducir: ${k}`).not.toBe(staging.en[k]);
    }
  });

  it("los marcadores de interpolación viajan en los dos idiomas", () => {
    for (const lang of ["es", "en"] as const) {
      for (const k of ["staging.remateMaster", "staging.remateFineMore"]) {
        expect(staging[lang][k], `${lang} ${k} sin {n}`).toContain("{n}");
        expect(staging[lang][k], `${lang} ${k} sin {s}`).toContain("{s}");
      }
    }
  });

  it("la línea fina genérica ya no promete «la primera»: no sabe si lo es", () => {
    // Es la que se usa cuando el servidor no contestó. Prometer «tu primera
    // variante» ahí es exactamente la promesa vieja, ahora además sin datos.
    expect(staging.es["staging.emptyFine"].toLowerCase()).not.toContain("primera");
    expect(staging.en["staging.emptyFine"].toLowerCase()).not.toContain("first");
  });
});

/* ── 4 · El destino, el origen y la salida que ya existía ─────────────────── */

describe("remate · a dónde lleva y qué no se rompe por el camino", () => {
  it("lleva a /app/variantes propagando el origen, como hace Importar", () => {
    expect(HREF_VARIANTES).toBe(withOrigin("/app/variantes", "/app/staging"));
    expect(HREF_VARIANTES).toContain("/app/variantes");
    expect(HREF_VARIANTES).toContain("from=%2Fapp%2Fstaging");
  });

  it("el botón principal apunta al CV, no al inventario", () => {
    expect(
      /c-btn--forge c-btn--lg" href=\{HREF_VARIANTES\}/.test(fuente),
      "el CTA primario (forge/lg) ya no apunta a HREF_VARIANTES",
    ).toBe(true);
    // La salida vieja no puede seguir siendo la primaria disfrazada.
    expect(
      /c-btn--forge[^\n]*href="\/app\/master"/.test(fuente),
      "«Ver el master» sigue siendo el botón forge: no se degradó",
    ).toBe(false);
  });

  it("«Ver el master» sigue existiendo, degradado a secundario", () => {
    // Añadir una salida no puede costar la que ya había.
    expect(/className="c-btn" href="\/app\/master"/.test(fuente)).toBe(true);
    expect(fuente).toContain('t("staging.emptyCta")');
  });

  it("el rótulo del CTA sale de rotuloRemate, no de un ternario suelto en el JSX", () => {
    expect(fuente).toContain("{t(rotulo.cta)}");
  });
});

/* ── 5 · El parámetro ?source=, que pasó de muerto a vivo ─────────────────── */

/* Fuentes enlaza a /app/staging?source=<id> desde siempre (FuentesScreen.tsx:42)
   y durante meses NADIE lo leía: ni la pantalla ni GET /api/staging. El usuario
   creía revisar UNA fuente y tenía delante la cola entera. Este bloque decía eso
   y exigía que el copy lo confesara.
   Ahora el filtro EXISTE de verdad, así que el bloque cambia de bando: en vez de
   vigilar que se confiese el hueco, vigila que el filtro siga cableado por los
   TRES sitios que tienen que estar de acuerdo. Si alguien quita cualquiera de
   los tres, el usuario vuelve a ver una cosa y a aceptar otra — que es peor que
   el bug original, porque el botón contaría una fuente y promovería la cola. */
describe("staging · ?source= filtra de verdad, y por los tres sitios a la vez", () => {
  const queries = leer("../src/lib/db/queries.ts");
  const rutaGet = leer("../src/app/api/staging/route.ts");
  const rutaAccept = leer("../src/app/api/staging/accept/route.ts");

  it("1 · la consulta filtra por la columna, no por una etiqueta de texto", () => {
    // data._source es una ETIQUETA humana («texto pegado»), no un id: filtrar por
    // ella habría parecido funcionar y habría mezclado fuentes con el mismo rótulo.
    expect(queries).toMatch(/\.eq\(\s*["']source_id["']/);
    expect(queries).toMatch(/getStaging\([^)]*sourceId\??\s*:\s*string/);
  });

  it("2 · el GET lee el parámetro y se lo pasa a la consulta", () => {
    expect(rutaGet).toContain('params.get("source")');
    expect(rutaGet).toMatch(/getStaging\(sb,\s*user\.id,\s*source\)/);
  });

  it("3 ★ el LOTE honra el mismo filtro: contar una fuente y promover otra sería mentir", () => {
    // Este es el que de verdad importa. Si el GET filtra y el accept no, el botón
    // dice «aceptar 8» y promueve los 119 de la cola entera. Un fallo silencioso
    // e irreversible: los items ya están en el master.
    expect(rutaAccept).toMatch(/getStaging\(sb,\s*user\.id,\s*source\)/);
  });

  it("4 · la pantalla lee el parámetro y lo manda al aceptar", () => {
    expect(fuente).toContain('get("source")');
  });
});
