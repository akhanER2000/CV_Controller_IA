/* panel-datos (Forja v2): las cifras del Panel salen de datos reales y, si no
   hay dato, no hay número. Y la sección plegable conserva sus asideros. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  filtrarVariantes,
  itemsPorTipo,
  ultimaActualizacion,
  variantesPorMes,
  verificacion,
} from "@/components/panel/datos";
import { SeccionPlegable } from "@/components/panel/SeccionPlegable";

const it_ = (kind: string, evidenceVerified = false) => ({ kind, evidenceVerified });

describe("datos del Panel", () => {
  it("cuenta ítems por tipo, de más a menos", () => {
    const r = itemsPorTipo([it_("bullet"), it_("work"), it_("bullet"), it_("skill"), it_("bullet")]);
    expect(r).toEqual([
      { kind: "bullet", n: 3 },
      { kind: "skill", n: 1 },
      { kind: "work", n: 1 },
    ]);
  });

  it("verificación: null sin ítems (0 de 0 no es 0 %)", () => {
    expect(verificacion([])).toBeNull();
    expect(verificacion([it_("a", true), it_("b"), it_("c", true), it_("d", true)])).toEqual({
      verificados: 3,
      total: 4,
      pct: 75,
    });
  });

  it("variantes por mes: agrupa por mes UTC y descarta fechas inválidas", () => {
    const r = variantesPorMes([
      { updatedAt: "2026-10-02T10:00:00Z" },
      { updatedAt: "2026-11-20T10:00:00Z" },
      { updatedAt: "2026-11-01T00:00:00Z" },
      { updatedAt: "no-es-fecha" },
    ]);
    expect(r).toEqual([
      { mes: "2026-10", n: 1 },
      { mes: "2026-11", n: 2 },
    ]);
  });

  it("última actualización: la más reciente; null si no hay ninguna", () => {
    expect(ultimaActualizacion([null, undefined, "x"])).toBeNull();
    expect(ultimaActualizacion(["2026-01-01T00:00:00Z", "2026-11-25T00:00:00Z", undefined])).toBe("2026-11-25T00:00:00Z");
  });

  it("filtra variantes por texto (nombre u objetivo) y estado", () => {
    const l = [
      { nm: "Backend Fintech", obj: "Backend Engineer", old: true },
      { nm: "Data", obj: "Data Engineer", old: false },
    ];
    expect(filtrarVariantes(l, "engineer", "todas")).toHaveLength(2);
    expect(filtrarVariantes(l, "fintech", "todas")).toEqual([l[0]]);
    expect(filtrarVariantes(l, "", "aldia")).toEqual([l[1]]);
    expect(filtrarVariantes(l, "data", "desactualizadas")).toEqual([]);
  });
});

describe("SeccionPlegable", () => {
  it("plegada: botón .fold con aria-expanded=false y cuerpo oculto", () => {
    const html = renderToStaticMarkup(
      createElement(SeccionPlegable, { id: "exp", titulo: "Experiencia", meta: "5 roles", plegada: true, onPlegar: () => {}, claseCuerpo: "ms-body", children: "contenido" }),
    );
    expect(html).toContain('class="fold pn-sec-fold"');
    expect(html).toContain('data-fold="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="exp-cuerpo"');
    expect(html).toMatch(/class="pn-sec-b ms-body" id="exp-cuerpo" hidden=""/);
  });
  it("sin onPlegar no hay botón", () => {
    const html = renderToStaticMarkup(createElement(SeccionPlegable, { titulo: "X", children: "y" }));
    expect(html).not.toContain("data-fold");
  });
});

describe("regla del producto en las 4 pantallas", () => {
  const archivos = ["DashboardScreen", "MasterScreen", "StagingScreen", "VariantesScreen"].map((n) =>
    readFileSync(`src/components/screens/${n}.tsx`, "utf8"),
  );
  it("todo <KpiCard> de las pantallas lleva fuente desde el diccionario (nunca vacía ni literal)", () => {
    for (const src of archivos) {
      for (const m of src.matchAll(/<KpiCard\b[^>]*>/g)) {
        expect(m[0]).toMatch(/fuente=\{(t\(|fu\()/);
      }
    }
  });
  it("las pantallas ya no pintan la cabecera vieja con el avatar inventado «DG»", () => {
    for (const src of archivos) expect(src).not.toMatch(/className="hd-av">DG</);
  });
});
