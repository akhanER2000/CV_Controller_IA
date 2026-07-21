import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/* ============================================================================
   EL HUECO ENTRE `tsc` Y `next build`.

   Un fichero especial del App Router (route.ts, page.tsx, layout.tsx…) solo puede
   exportar sus manejadores HTTP y un puñado de campos de configuración. Cualquier
   otro export hace fallar la comprobación de tipos del BUILD, con un error que no
   nombra al culpable de forma obvia:

     Type 'OmitWithTag<typeof import("…/route"), "GET" | "DELETE" | …>' does not
     satisfy the constraint '{ [x: string]: never; }'.

   Y esto es lo que lo hace peligroso: `tsc --noEmit` lo da por bueno, y `vitest`
   también — de hecho el import desde el test es justo lo que empuja a exportarlo.
   Pasó de verdad: `invalidItemData` vivía en src/app/api/master/[id]/route.ts, los
   1637 tests estaban en verde, los tipos limpios, y `next build` no compilaba. El
   único de los tres que se parece a producción era el único que lo veía.

   Este test cierra ese hueco en el ciclo rápido. Es barato: lee ficheros y busca
   exports. Si alguien vuelve a colgar un ayudante de una ruta, lo dice AQUÍ y con
   su nombre, en vez de en un build de tres minutos con un mensaje sobre
   OmitWithTag.

   La corrección nunca es dejar de exportarlo: es MOVERLO a src/lib. En cuanto algo
   hay que importarlo desde otro sitio, ya no pertenece a la frontera HTTP.
   ============================================================================ */

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "../src/app");

/** Lo único que Next permite exportar desde un fichero especial del App Router. */
const PERMITIDOS = new Set([
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
  "runtime", "dynamic", "revalidate", "fetchCache", "maxDuration",
  "preferredRegion", "generateStaticParams", "metadata", "generateMetadata",
  "config", "alt", "size", "contentType", "default", "viewport", "generateViewport",
]);

const ESPECIALES =
  /^(route|page|layout|opengraph-image|twitter-image|icon|apple-icon|error|loading|not-found|template)\.(ts|tsx)$/;

function ficherosEspeciales(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) ficherosEspeciales(f, out);
    else if (ESPECIALES.test(e.name)) out.push(f);
  }
  return out;
}

const rel = (f: string) => path.relative(path.join(here, ".."), f).split(path.sep).join("/");

describe("App Router · una ruta es una frontera HTTP, no un módulo compartido", () => {
  const ficheros = ficherosEspeciales(APP);

  it("el escáner encuentra ficheros de verdad (si no, este test daría verde por vacío)", () => {
    // Sin esto, un cambio de estructura de carpetas convertiría el candado en un
    // adorno que pasa siempre. Es el fallo clásico de los tests que barren el disco.
    expect(ficheros.length).toBeGreaterThan(10);
    expect(ficheros.map(rel)).toContain("src/app/api/master/[id]/route.ts");
  });

  it("★ ninguna exporta nada fuera de lo que Next admite", () => {
    const infractores: string[] = [];
    for (const f of ficheros) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm)) {
        if (!PERMITIDOS.has(m[1]!)) infractores.push(`${rel(f)} exporta «${m[1]}»`);
      }
      for (const m of s.matchAll(/^export\s+(?:type|interface)\s+(\w+)/gm)) {
        infractores.push(`${rel(f)} exporta el tipo «${m[1]}»`);
      }
    }
    expect(
      infractores,
      `Estos exports harán fallar «next build» aunque tsc y vitest estén verdes.\n` +
        `Muévelos a src/lib y que la ruta los importe:\n  ${infractores.join("\n  ")}`,
    ).toEqual([]);
  });

  it("ningún test importa de un fichero de ruta algo que NO sea un handler HTTP", () => {
    /* Esta regla nació prohibiendo importar CUALQUIER cosa de un route, y era
       demasiado estricta: bloqueaba un test que ejercita `GET`/`POST` de verdad,
       que es la mejor forma de probar una ruta —mejor que probar una copia de su
       lógica—. El build lo confirma: importar handlers compila sin problema.

       Lo que de verdad rompe `next build` es EXPORTAR de un route algo que no sea
       handler ni config (lo vigila el test de arriba). Y lo que empuja a hacerlo
       es querer importar desde un test un ayudante que vive ahí. Así que la regla
       correcta no es «no importes de un route», es «no importes de un route nada
       que no sea un handler»: en cuanto necesitas un helper, ese helper ya no
       pertenece a la frontera HTTP y su sitio es src/lib. */
    const tests = readdirSync(here).filter((f) => f.endsWith(".test.ts"));
    const malos: string[] = [];
    for (const t of tests) {
      const s = readFileSync(path.join(here, t), "utf8");
      // Captura los símbolos importados junto al módulo del que vienen.
      for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']*\/(?:route|page|layout))["']/g)) {
        const simbolos = m[1]!.split(",").map((x) => x.trim().split(/\s+as\s+/)[0]!.trim()).filter(Boolean);
        const noHandlers = simbolos.filter((s2) => !PERMITIDOS.has(s2));
        if (noHandlers.length) malos.push(`tests/${t} importa de ${m[2]} → ${noHandlers.join(", ")}`);
      }
      // Un import por defecto o de namespace se lleva el módulo entero: no vale.
      for (const m of s.matchAll(/import\s+(?!\{|type\b)[\w*]+[^;]*from\s*["']([^"']*\/(?:route|page|layout))["']/g)) {
        malos.push(`tests/${t} importa el módulo entero de ${m[1]}`);
      }
    }
    expect(malos, `Eso no es un handler: muévelo a src/lib y que la ruta lo importe.\n  ${malos.join("\n  ")}`).toEqual([]);
  });
});
