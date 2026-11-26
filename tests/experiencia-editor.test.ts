import { describe, expect, it } from "vitest";
import { textoProgreso } from "@/components/ui/Progreso";
import {
  ENCUADRE_INICIAL,
  SALIDA_ALTO,
  SALIDA_ANCHO,
  ZOOM_MAX,
  encuadreValido,
  leerEncuadre,
  limitar,
  mover,
  recorte,
  zoomA,
} from "@/components/editor/encuadre";
import { PHOTO_RATIO } from "@/lib/cv/templates";

/* experiencia-editor: el texto del Progreso (pasos reales, porcentaje solo si es
   real — DA-A2) y la cuenta del encuadre de la foto (proporción del CV, nunca
   fuera de la imagen). */

describe("Progreso · el texto que se lee", () => {
  const de = "{i} de {n}";
  it("dice el paso real y en cuál va", () => {
    expect(textoProgreso({ pasos: ["Midiendo", "Redactando", "Guardando"], paso: 0 }, de)).toBe("Midiendo · 1 de 3");
    expect(textoProgreso({ pasos: ["Midiendo", "Redactando", "Guardando"], paso: 1 }, de)).toBe("Redactando · 2 de 3");
  });
  it("sin pasos, la etiqueta sola; sin porcentaje, ningún número", () => {
    expect(textoProgreso({ etiqueta: "Generando el PDF" }, de)).toBe("Generando el PDF");
    expect(textoProgreso({ etiqueta: "Generando el PDF", porcentaje: null }, de)).not.toMatch(/\d/);
  });
  it("el porcentaje solo si es un número real, redondeado y acotado", () => {
    expect(textoProgreso({ etiqueta: "Subiendo", porcentaje: 41.6 }, de)).toBe("Subiendo · 42 %");
    expect(textoProgreso({ etiqueta: "Subiendo", porcentaje: Number.NaN }, de)).toBe("Subiendo");
    expect(textoProgreso({ etiqueta: "Subiendo", porcentaje: 140 }, de)).toBe("Subiendo · 100 %");
  });
  it("un paso fuera de rango no inventa uno", () => {
    expect(textoProgreso({ pasos: ["A", "B"], paso: 9 }, de)).toBe("B · 2 de 2");
    expect(textoProgreso({ pasos: ["Único"], paso: 0 }, de)).toBe("Único");
  });
});

describe("Encuadre de la foto", () => {
  const ratio = (r: { sw: number; sh: number }) => r.sh / r.sw;

  it("la salida tiene la proporción del CV", () => {
    expect(SALIDA_ALTO / SALIDA_ANCHO).toBeCloseTo(PHOTO_RATIO, 2);
  });

  it("zoom 1: el mayor recorte de la proporción del CV que cabe (apaisada y vertical)", () => {
    const ap = recorte(1600, 900, ENCUADRE_INICIAL);
    expect(ratio(ap)).toBeCloseTo(PHOTO_RATIO, 6);
    expect(ap.sh).toBeCloseTo(900, 6);
    const ve = recorte(600, 1200, ENCUADRE_INICIAL);
    expect(ratio(ve)).toBeCloseTo(PHOTO_RATIO, 6);
    expect(ve.sw).toBeCloseTo(600, 6);
  });

  it("nunca se sale de la imagen, por mucho que se mueva o se acerque", () => {
    let e = zoomA(1000, 800, ENCUADRE_INICIAL, 2.5);
    for (let i = 0; i < 80; i += 1) e = mover(1000, 800, e, 0.1, -0.1);
    const r = recorte(1000, 800, e);
    expect(r.sx).toBeGreaterThanOrEqual(-1e-6);
    expect(r.sy).toBeGreaterThanOrEqual(-1e-6);
    expect(r.sx + r.sw).toBeLessThanOrEqual(1000 + 1e-6);
    expect(r.sy + r.sh).toBeLessThanOrEqual(800 + 1e-6);
    expect(ratio(r)).toBeCloseTo(PHOTO_RATIO, 6);
  });

  it("zoom acotado a [1, 4] y centro acotado", () => {
    expect(limitar(800, 800, { zoom: 9, cx: 0.5, cy: 0.5 }).zoom).toBe(ZOOM_MAX);
    expect(limitar(800, 800, { zoom: 0.2, cx: 0.5, cy: 0.5 }).zoom).toBe(1);
    const e = limitar(800, 800, { zoom: 1, cx: 0, cy: 0 });
    expect(e.cx).toBeGreaterThan(0);
  });

  it("acercar reduce el recorte en la misma razón", () => {
    const a = recorte(1200, 1200, ENCUADRE_INICIAL);
    const b = recorte(1200, 1200, zoomA(1200, 1200, ENCUADRE_INICIAL, 2));
    expect(b.sw).toBeCloseTo(a.sw / 2, 6);
  });

  it("lo que llega de la base se lee sin lanzar y el servidor valida", () => {
    expect(leerEncuadre(null)).toBeNull();
    expect(leerEncuadre({ src: "https://x/y.png" })).toBeNull();
    const ok = { src: "data:image/jpeg;base64,AAAA", zoom: 1.5, cx: 0.4, cy: 0.6 };
    expect(leerEncuadre(ok)?.encuadre).toEqual({ zoom: 1.5, cx: 0.4, cy: 0.6 });
    expect(encuadreValido(ok)).toBeNull();
    expect(encuadreValido({ ...ok, zoom: 7 })).toMatch(/fuera de rango/);
    expect(encuadreValido({ ...ok, src: "data:image/jpeg;base64,<script>" })).toMatch(/no es una imagen/);
    expect(encuadreValido({ src: "javascript:alert(1)" })).toMatch(/debe ser una imagen/);
  });
});
