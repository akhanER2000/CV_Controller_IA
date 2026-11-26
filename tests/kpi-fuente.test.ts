import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { KpiCard } from "../src/components/ui/KpiCard";

/**
 * KpiCard exige `fuente`.
 *
 * Regla del producto: ningún número en la UI sin fuente real. La primera
 * barrera es el TIPO: un <KpiCard> sin `fuente` no compila. Aquí se prueba con
 * el compilador de TypeScript de verdad (no con un @ts-expect-error que nadie
 * mira): se compila un archivo virtual que usa el componente con y sin fuente,
 * y se exige el error exacto en el segundo caso y cero errores en el primero.
 * La segunda barrera es la de ejecución: una fuente en blanco se rechaza.
 */

const RAIZ = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function diagnosticos(codigo: string): ts.Diagnostic[] {
  const virtual = path.join(RAIZ, "tests", "__sonda_kpi__.tsx");
  const opciones: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    isolatedModules: true,
    lib: ["lib.dom.d.ts", "lib.esnext.d.ts"],
    baseUrl: RAIZ,
    paths: { "@/*": ["./src/*"] },
  };
  const host = ts.createCompilerHost(opciones);
  const leer = host.getSourceFile;
  host.getSourceFile = (nombre, idioma, ...resto) =>
    path.resolve(nombre) === virtual
      ? ts.createSourceFile(nombre, codigo, idioma)
      : leer.call(host, nombre, idioma, ...resto);
  const existe = host.fileExists;
  host.fileExists = (f) => path.resolve(f) === virtual || existe.call(host, f);
  const programa = ts.createProgram([virtual], opciones, host);
  const fuente = programa.getSourceFile(virtual)!;
  return [...programa.getSyntacticDiagnostics(fuente), ...programa.getSemanticDiagnostics(fuente)];
}

const texto = (d: ts.Diagnostic) => ts.flattenDiagnosticMessageText(d.messageText, "\n");

describe("KpiCard · la fuente es obligatoria", () => {
  it(
    "1 · CON fuente compila sin un solo error (si no, el test 2 daría verde por otra razón)",
    () => {
      const d = diagnosticos(
        `import { KpiCard } from "../src/components/ui/KpiCard";\n` +
          `export const ok = <KpiCard etiqueta="Ítems" valor={70} fuente="master" />;\n`,
      );
      expect(d.map(texto)).toEqual([]);
    },
    60_000,
  );

  it(
    "2 · SIN fuente NO compila, y el error nombra `fuente`",
    () => {
      const d = diagnosticos(
        `import { KpiCard } from "../src/components/ui/KpiCard";\n` +
          `export const mal = <KpiCard etiqueta="Ítems" valor={70} />;\n`,
      );
      expect(d.length).toBeGreaterThan(0);
      // TS2741: Property 'fuente' is missing in type … but required in type 'KpiCardProps'.
      expect(d.some((x) => x.code === 2741 && /'fuente'/.test(texto(x))), d.map(texto).join(" | ")).toBe(true);
    },
    60_000,
  );

  it("3 · en ejecución, una fuente en blanco se rechaza (el tipo no ve los strings vacíos)", () => {
    expect(() =>
      renderToStaticMarkup(createElement(KpiCard, { etiqueta: "Ítems", valor: 70, fuente: "   " })),
    ).toThrow(/falta la fuente/);
  });

  it("4 · la fuente se PINTA junto a la cifra, no se esconde", () => {
    const html = renderToStaticMarkup(createElement(KpiCard, { etiqueta: "Ítems", valor: 70, fuente: "master" }));
    expect(html).toContain("70");
    expect(html).toMatch(/u-kpi-fuente[^>]*>.*master/);
  });
});
