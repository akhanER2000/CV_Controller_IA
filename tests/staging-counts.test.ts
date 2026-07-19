/* ============================================================================
   Staging · progreso = servidor + sesión.

   El bug que fija este test: los contadores de aceptados/descartados vivían solo
   en estado de React, así que al remontar StagingScreen volvían a 0 y la barra
   se pintaba vacía aunque los items ya estuvieran promovidos en la base. La
   corrección mueve la fuente de verdad al servidor (GET /api/staging devuelve
   `counts`) y deja la sesión como mero delta.

   Aquí se prueba la parte PURA de esa aritmética: stagingProgress. La consulta
   (getStagingCounts) toca Supabase y no se simula — se verifica en la app.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import { stagingProgress, ZERO_COUNTS } from "../src/lib/db/staging-counts";

describe("stagingProgress · el progreso sobrevive al remontaje", () => {
  it("con la sesión a cero, el progreso sigue siendo el del servidor", () => {
    // Exactamente el escenario del bug: el usuario revisó 7 y descartó 2, se fue
    // a otra pantalla y volvió. La sesión arranca vacía; la barra NO debe caer.
    const p = stagingProgress({ accepted: 7, rejected: 2 }, ZERO_COUNTS, 11);
    expect(p.accepted).toBe(7);
    expect(p.rejected).toBe(2);
    expect(p.total).toBe(20);
    expect(p.acceptedPct).toBeCloseTo(35);
    expect(p.rejectedPct).toBeCloseTo(10);
  });

  it("suma el delta de la sesión sobre la foto del servidor", () => {
    // La foto del GET es de antes de estos clics: aceptar/descartar ya escribió
    // en la base, pero `base` no se ha refrescado. Sumar es lo correcto.
    const p = stagingProgress({ accepted: 7, rejected: 2 }, { accepted: 3, rejected: 1 }, 7);
    expect(p.accepted).toBe(10);
    expect(p.rejected).toBe(3);
    expect(p.pending).toBe(7);
    expect(p.total).toBe(20);
  });

  it("tras recargar (base fresca, sesión a cero) da el mismo número, no el doble", () => {
    // Invariante que hace segura la suma: load() refresca base Y resetea sesión.
    const optimista = stagingProgress({ accepted: 7, rejected: 2 }, { accepted: 3, rejected: 1 }, 7);
    const recargado = stagingProgress({ accepted: 10, rejected: 3 }, ZERO_COUNTS, 7);
    expect(recargado.accepted).toBe(optimista.accepted);
    expect(recargado.rejected).toBe(optimista.rejected);
    expect(recargado.acceptedPct).toBeCloseTo(optimista.acceptedPct);
  });

  it("el total es todo lo que pasó por el staging, no solo lo pendiente", () => {
    const p = stagingProgress({ accepted: 4, rejected: 1 }, ZERO_COUNTS, 5);
    expect(p.total).toBe(p.accepted + p.rejected + p.pending);
    expect(p.total).toBe(10);
  });

  it("staging virgen: 0% en vez de NaN (dividir por cero no pinta barras)", () => {
    const p = stagingProgress(ZERO_COUNTS, ZERO_COUNTS, 0);
    expect(p.total).toBe(0);
    expect(p.acceptedPct).toBe(0);
    expect(p.rejectedPct).toBe(0);
    expect(Number.isNaN(p.acceptedPct)).toBe(false);
  });

  it("cola llena y nada revisado: la barra está a cero pero el total no", () => {
    const p = stagingProgress(ZERO_COUNTS, ZERO_COUNTS, 12);
    expect(p.total).toBe(12);
    expect(p.acceptedPct).toBe(0);
    expect(p.rejectedPct).toBe(0);
  });

  it("las dos anchuras nunca suman más de 100", () => {
    const p = stagingProgress({ accepted: 9, rejected: 9 }, { accepted: 2, rejected: 0 }, 0);
    expect(p.acceptedPct + p.rejectedPct).toBeCloseTo(100);
  });

  it("basura entrante (negativos, NaN) cuenta como cero, no contamina", () => {
    // Si un counts del servidor llegara raro, la barra debe degradar a algo
    // legible en vez de escupir anchuras negativas o NaN al style.
    const p = stagingProgress({ accepted: -5, rejected: Number.NaN }, { accepted: 4, rejected: 1 }, -3);
    expect(p.accepted).toBe(4);
    expect(p.rejected).toBe(1);
    expect(p.pending).toBe(0);
    expect(p.total).toBe(5);
    expect(p.acceptedPct).toBeCloseTo(80);
  });
});
