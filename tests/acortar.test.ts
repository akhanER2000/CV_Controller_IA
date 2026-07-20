import { describe, it, expect } from "vitest";
import { preservesFacts, preservesFactsWhenShortening } from "../src/lib/verify";

/* ============================================================================
   EL CANDADO DEL ACORTADO.

   Estos tests existen para demostrar UNA cosa incómoda: que el control que ya
   teníamos (preservesFacts) NO sirve para acortar, y que dejarlo como único
   guardián habría borrado cifras sin que saltara nada.

   Por eso casi todos los casos se comprueban DOS veces: lo que dice el control
   viejo y lo que dice el nuevo. Si algún día alguien "simplifica" volviendo a
   preservesFacts, estos tests le enseñan exactamente qué se rompe.
   ============================================================================ */

// El ejemplo literal del contrato de producto.
const VINETA = "Reduje la latencia p99 de 850 ms a 180 ms migrando el pipeline a Kafka";

describe("acortar · lo que preservesFacts NO puede ver", () => {
  it("1 · «optimicé la latencia» no inventa nada — y por eso el control viejo lo aprueba", () => {
    const pobre = "Optimicé la latencia";
    // ★ Esto es el agujero, escrito como test: cero cifras nuevas, cero
    //   entidades nuevas. Impecable para preservesFacts.
    expect(preservesFacts(VINETA, pobre).ok).toBe(true);
    // Y sin embargo se ha comido 850, 180, 99 y Kafka.
    const r = preservesFactsWhenShortening(VINETA, pobre);
    expect(r.ok).toBe(false);
    expect(r.lostNumbers).toEqual(expect.arrayContaining(["850", "180"]));
    expect(r.lostEntities).toContain("kafka");
  });

  it("2 · cambiar la MAGNITUD es peor que perderla, y se caza por los dos lados", () => {
    const mentira = "Reduje la latencia p99 de 85 ms a 18 ms migrando el pipeline a Kafka";
    const r = preservesFactsWhenShortening(VINETA, mentira);
    expect(r.ok).toBe(false);
    // 850 y 180 desaparecieron…
    expect(r.lostNumbers).toEqual(expect.arrayContaining(["850", "180"]));
    // …y 85 y 18 salieron de la nada.
    expect(r.newNumbers).toEqual(expect.arrayContaining(["85", "18"]));
  });

  it("3 · un acortamiento HONESTO pasa: se va el relleno, se quedan los hechos", () => {
    const bueno = "Latencia p99: de 850 ms a 180 ms migrando el pipeline a Kafka";
    const r = preservesFactsWhenShortening(VINETA, bueno);
    expect(r.lostNumbers).toEqual([]);
    expect(r.lostEntities).toEqual([]);
    expect(r.newNumbers).toEqual([]);
    expect(r.shorter).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("4 · cambiar la UNIDAD conservando el número no cuela (850 ms ≠ 850 %)", () => {
    const r = preservesFactsWhenShortening(
      "Reduje el coste un 40 % en 3 meses",
      "Reduje el coste 40x en 3 meses",
    );
    expect(r.ok).toBe(false);
    expect(r.newNumbers.join(" ")).toContain("40x");
  });

  it("5 · una propuesta MÁS LARGA no es un acortamiento, aunque preserve todo", () => {
    const masLargo = VINETA + " y documenté el proceso para el equipo";
    const r = preservesFactsWhenShortening(VINETA, masLargo);
    expect(r.lostNumbers).toEqual([]);
    expect(r.newNumbers).toEqual([]);
    expect(r.shorter).toBe(false);
    expect(r.ok, "no puede entrar por la puerta del acortado").toBe(false);
  });

  it("6 · perder una SIGLA cuenta como perder un hecho", () => {
    const r = preservesFactsWhenShortening(
      "Implementé CI/CD y RAG sobre AWS para el equipo de datos",
      "Implementé CI/CD para el equipo de datos",
    );
    expect(r.ok).toBe(false);
    expect(r.lostEntities).toEqual(expect.arrayContaining(["rag", "aws"]));
    expect(r.lostEntities).not.toContain("ci/cd");
  });

  it("7 · reordenar sin perder nada y acortando de verdad sí vale", () => {
    const r = preservesFactsWhenShortening(
      "Durante el año 2025 lideré un equipo de 6 personas en el proyecto de 3 fases",
      "Lideré 6 personas en el proyecto de 3 fases (2025)",
    );
    expect(r.ok).toBe(true);
  });

  it("8 · no se puede acortar a nada: el vacío pierde todos los hechos", () => {
    const r = preservesFactsWhenShortening(VINETA, "");
    expect(r.ok).toBe(false);
    expect(r.lostNumbers.length).toBeGreaterThan(0);
  });

  it("9 · una viñeta SIN cifras ni entidades sí se puede acortar libremente", () => {
    // El candado no debe volverse un impuesto sobre el texto que no tiene nada
    // que proteger: si no hay hechos duros, acortar es solo estilo.
    const r = preservesFactsWhenShortening(
      "Responsable de la coordinación diaria del equipo y de sus rituales",
      "Coordiné al equipo y sus rituales",
    );
    expect(r.lostNumbers).toEqual([]);
    expect(r.lostEntities).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
