import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { REGISTRO, TAREAS, type Tarea } from "@/lib/ai/modelos";

/* ============================================================================
   EL REGISTRO NO PUEDE ENVEJECER EN SILENCIO.

   Un alias flotante (`-latest`) deja que Google elija el modelo —y la factura—.
   El consumo real se fue a Gemini 3.5 Flash, el escalón más caro, sin que nadie
   lo eligiera: el alias fue detrás de la promoción. Esto lo detectó el usuario
   mirando su panel de facturación, no el código: ninguna lectura del repo lo
   habría revelado, porque el registro era correcto en su FORMA y estaba mal en
   su CONTENIDO. Este test hace que el contenido tampoco pueda derivar sin que
   algo se ponga rojo.
   ============================================================================ */

const here = path.dirname(fileURLToPath(import.meta.url));
const fuente = readFileSync(path.join(here, "../src/lib/ai/modelos.ts"), "utf8");

describe("registro de modelos · nada flotante, nada mudo", () => {
  it("★ ningún modelo del registro usa un alias -latest", () => {
    // No basta con mirar los valores en runtime: un modeloFallback o un futuro
    // proveedor podrían colar un alias en una rama que este test no instancia.
    // Se lee la FUENTE y se prohíbe el patrón en cualquier campo de modelo.
    for (const t of TAREAS) {
      const def = REGISTRO[t];
      expect(def.modelo, `${t}.modelo es un alias flotante`).not.toMatch(/-latest$/);
      if (def.modeloFallback) {
        expect(def.modeloFallback, `${t}.modeloFallback es un alias flotante`).not.toMatch(/-latest$/);
      }
    }
    // Y en el texto del fichero, por si alguien añade una tarea nueva con -latest:
    // solo se permite `-latest` dentro de comentarios (que explican por qué NO usarlo).
    const enCodigo = fuente
      .split("\n")
      .filter((l) => /modelo(Fallback)?\s*:/.test(l)) // solo las líneas que ASIGNAN un modelo
      .filter((l) => /-latest/.test(l));
    expect(enCodigo, `hay asignaciones de modelo con -latest:\n${enCodigo.join("\n")}`).toEqual([]);
  });

  it("cada tarea nombra un modelo versionado explícito y un motivo no vacío", () => {
    for (const t of TAREAS) {
      const def = REGISTRO[t];
      expect(def.modelo, `${t} sin modelo`).toBeTruthy();
      // Un ID versionado lleva un número de versión (2.5, 3.1, 70b…): no es solo
      // un nombre de familia como "flash" o "pro".
      expect(def.modelo, `${t}.modelo no parece versionado`).toMatch(/\d/);
      expect(def.motivo?.trim(), `${t} sin motivo`).toBeTruthy();
    }
  });

  it("las tareas donde se juega la promesa NO están en un modelo lite", () => {
    // El canario protege la extracción; la redacción se protege aquí, en el test:
    // un futuro cambio que la mande a un lite tiene que ser una decisión consciente
    // que pase por reescribir esto, no un descuido.
    const critica: Tarea[] = ["redaccion-preserva-hechos"];
    for (const t of critica) {
      expect(REGISTRO[t].modelo, `${t} no debería ir a un modelo lite sin decisión explícita`).not.toMatch(/lite/i);
    }
  });
});
