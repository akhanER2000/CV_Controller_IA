import { describe, it, expect } from "vitest";
import { normalizeDateRange } from "../src/lib/extract/dates";

/**
 * §C2 · fechas: detectarlas o admitir que faltan. NUNCA se inventa el mes de un
 * año suelto, ni se rellena lo ausente, ni se corrige un rango imposible.
 */

describe("normalizeDateRange · ES/EN", () => {
  it("«mar 2022 – hoy» → inicio + abierto", () => {
    expect(normalizeDateRange("mar 2022 – hoy")).toEqual({ start: "03/2022", current: true });
  });

  it("«enero de 2020 - marzo de 2021» → inicio y fin con mes", () => {
    expect(normalizeDateRange("enero de 2020 - marzo de 2021")).toEqual({ start: "01/2020", end: "03/2021" });
  });

  it("«Jan 2020 – Present» → inicio + abierto (EN)", () => {
    expect(normalizeDateRange("Jan 2020 – Present")).toEqual({ start: "01/2020", current: true });
  });

  it("«03/2021 - 09/2023» → numérico MM/AAAA", () => {
    expect(normalizeDateRange("03/2021 - 09/2023")).toEqual({ start: "03/2021", end: "09/2023" });
  });

  it("«mayo 2019 – actualidad» → abierto por 'actualidad'", () => {
    expect(normalizeDateRange("mayo 2019 – actualidad")).toEqual({ start: "05/2019", current: true });
  });
});

describe("normalizeDateRange · honestidad (no inventa)", () => {
  it("★ año solo → «AAAA», sin inventar el mes", () => {
    expect(normalizeDateRange("2019 – 2020")).toEqual({ start: "2019", end: "2020" });
  });

  it("un único año → solo inicio, año honesto", () => {
    expect(normalizeDateRange("2021")).toEqual({ start: "2021" });
  });

  it("★ sin fecha reconocible → objeto vacío (el pipeline marcará dateMissing)", () => {
    expect(normalizeDateRange("")).toEqual({});
    expect(normalizeDateRange("cuando pude")).toEqual({});
  });

  it("★ rango imposible (fin < inicio) → invalid con el texto original", () => {
    expect(normalizeDateRange("2023 - 2021")).toEqual({ invalid: "2023 - 2021" });
    expect(normalizeDateRange("09/2023 - 03/2021")).toEqual({ invalid: "09/2023 - 03/2021" });
  });

  it("mismo año con meses en orden no es imposible", () => {
    expect(normalizeDateRange("marzo 2020 - junio 2020")).toEqual({ start: "03/2020", end: "06/2020" });
  });

  it("inicio con mes y fin solo-año del mismo año no se marca imposible", () => {
    // granularidad distinta → se compara por año; 2020 == 2020, válido
    expect(normalizeDateRange("marzo 2020 - 2020")).toEqual({ start: "03/2020", end: "2020" });
  });
});
