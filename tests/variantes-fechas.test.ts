import { describe, expect, it } from "vitest";
import {
  esOrden,
  fechaCompleta,
  fechaCorta,
  fechaRelativaDia,
  ordenarIndices,
} from "@/components/screens/variantes-fechas";

// Fechas construidas en hora LOCAL: el test no depende de la zona del equipo.
const ahora = new Date(2026, 10, 26, 18, 0);
const iso = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m, d, h, mi).toISOString();
const ES = { hoy: "hoy {h}", ayer: "ayer {h}" };
const EN = { hoy: "today {h}", ayer: "yesterday {h}" };

describe("fechas de las tarjetas de variante", () => {
  it("hoy: ES en 24 h, EN con su reloj", () => {
    const hoy = iso(2026, 10, 26, 15, 40);
    expect(fechaRelativaDia(hoy, "es", ES, ahora)).toBe("hoy 15:40");
    expect(fechaRelativaDia(hoy, "en", EN, ahora)).toBe("today 03:40 PM");
  });

  it("ayer, aunque hayan pasado menos de 24 h", () => {
    const ayer = iso(2026, 10, 25, 23, 5);
    expect(fechaRelativaDia(ayer, "es", ES, ahora)).toBe("ayer 23:05");
    expect(fechaRelativaDia(ayer, "en", EN, ahora)).toBe("yesterday 11:05 PM");
  });

  it("otra fecha: día, mes corto y año locales", () => {
    const vieja = iso(2026, 10, 3, 9, 0);
    expect(fechaRelativaDia(vieja, "es", ES, ahora)).toBe("3 nov 2026");
    expect(fechaRelativaDia(vieja, "en", EN, ahora)).toBe("Nov 3, 2026");
    expect(fechaCorta(iso(2025, 0, 14), "es")).toBe("14 ene 2025");
    expect(fechaCorta(iso(2025, 0, 14), "en")).toBe("Jan 14, 2025");
  });

  it("title con fecha y hora completas", () => {
    const d = iso(2026, 10, 26, 15, 40);
    expect(fechaCompleta(d, "es")).toContain("26 de noviembre de 2026");
    expect(fechaCompleta(d, "es")).toContain("15:40");
    expect(fechaCompleta(d, "en")).toContain("November 26, 2026");
  });

  it("sin fecha legible no se inventa nada", () => {
    expect(fechaRelativaDia(null, "es", ES, ahora)).toBe("");
    expect(fechaRelativaDia("no-es-fecha", "es", ES, ahora)).toBe("");
    expect(fechaCorta(undefined, "en")).toBe("");
    expect(fechaCompleta("", "es")).toBe("");
  });
});

describe("orden de variantes", () => {
  const lista = [
    { nm: "beta", createdAt: iso(2026, 9, 1), updatedAt: iso(2026, 10, 20) },
    { nm: "Álvaro", createdAt: iso(2026, 10, 25), updatedAt: iso(2026, 10, 25) },
    { nm: "zeta", createdAt: iso(2026, 5, 1), updatedAt: iso(2026, 10, 26) },
    { nm: "demo sin fecha" },
  ];

  it("más recientes / más antiguas por created_at; sin fecha al final", () => {
    expect(ordenarIndices(lista, "recientes", "es")).toEqual([1, 0, 2, 3]);
    expect(ordenarIndices(lista, "antiguas", "es")).toEqual([2, 0, 1, 3]);
  });

  it("editadas recientemente por updated_at", () => {
    expect(ordenarIndices(lista, "editadas", "es")).toEqual([2, 1, 0, 3]);
  });

  it("nombre con collator local (tildes y mayúsculas no rompen el orden)", () => {
    expect(ordenarIndices(lista, "nombre", "es")).toEqual([1, 0, 3, 2]);
  });

  it("solo acepta órdenes conocidos (lo recordado puede venir corrupto)", () => {
    expect(esOrden("nombre")).toBe(true);
    expect(esOrden("cualquiera")).toBe(false);
    expect(esOrden(null)).toBe(false);
  });
});
