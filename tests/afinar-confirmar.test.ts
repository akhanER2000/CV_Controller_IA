import { describe, expect, it } from "vitest";
import { mismoResumen, resumenRespaldo } from "@/lib/cv/afinar-confirmar";

// DA-M5 · el resumen que el editor enseña antes de aplicar las «sin respaldo».
describe("afinar · confirmación de «sin respaldo»", () => {
  it("cuenta viñetas que aparecen (mostrar/añadir) y aptitudes o grupos que se ocultan", () => {
    const r = resumenRespaldo([
      { tipo: "mostrar" },
      { tipo: "anadir" },
      { tipo: "anadir" },
      { tipo: "ocultar-aptitud" },
      { tipo: "ocultar-grupo" },
      { tipo: "texto" }, // la reescritura no cuenta: es de un clic
    ]);
    expect(r).toEqual({ anadir: 3, ocultar: 2 });
  });

  it("vacío ⇒ nada que confirmar", () => {
    expect(resumenRespaldo([])).toEqual({ anadir: 0, ocultar: 0 });
  });

  it("solo aplica si lo recalculado es lo que el usuario confirmó", () => {
    expect(mismoResumen({ anadir: 2, ocultar: 1 }, { anadir: 2, ocultar: 1 })).toBe(true);
    expect(mismoResumen({ anadir: 2, ocultar: 1 }, { anadir: 3, ocultar: 1 })).toBe(false);
    expect(mismoResumen({ anadir: 0, ocultar: 0 }, undefined)).toBe(false);
    expect(mismoResumen({ anadir: 0, ocultar: 0 }, "2,1")).toBe(false);
  });
});
