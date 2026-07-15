import { describe, it, expect } from "vitest";
import { detectUrls, classifyUrl, detectAndClassify, LINKEDIN_ALTERNATIVES } from "../src/lib/extract/urls";
import {
  normalizeCompany,
  datesOverlap,
  looksLikeDuplicate,
  clusterDuplicates,
} from "../src/lib/extract/dedup";

describe("detectUrls · encuentra links en el texto pegado (prompt §3)", () => {
  const pegado =
    "Soy ingeniero, titulado en la UNAB. Mi portfolio es https://misitio.cl y mi github es " +
    "github.com/usuario. También github.com/usuario/idempotency-go. Perfil: linkedin.com/in/diego-gatica.";

  it("detecta portfolio, github (perfil y repo) y linkedin", () => {
    const urls = detectUrls(pegado);
    expect(urls).toContain("https://misitio.cl");
    expect(urls).toContain("github.com/usuario");
    expect(urls).toContain("github.com/usuario/idempotency-go");
    expect(urls).toContain("linkedin.com/in/diego-gatica");
  });

  it("NO confunde tecnologías con URLs (node.js, Django)", () => {
    const urls = detectUrls("mi stack es node.js con django y python 3.11");
    expect(urls).toHaveLength(0);
  });

  it("no duplica la misma URL", () => {
    expect(detectUrls("github.com/ana y otra vez github.com/ana")).toEqual(["github.com/ana"]);
  });
});

describe("classifyUrl · la ruta de lectura correcta", () => {
  it("github.com/<user> → perfil (API, sin LLM)", () => {
    expect(classifyUrl("github.com/dgatica")).toMatchObject({ kind: "github-profile", handle: "dgatica" });
  });
  it("github.com/<user>/<repo> → repo", () => {
    expect(classifyUrl("https://github.com/dgatica/idempotency-go")).toMatchObject({
      kind: "github-repo", handle: "dgatica", repo: "idempotency-go",
    });
  });
  it("linkedin.com/in/<slug> → linkedin (NO legible)", () => {
    expect(classifyUrl("linkedin.com/in/diego-gatica")).toMatchObject({ kind: "linkedin", handle: "diego-gatica" });
  });
  it("cualquier otra → web (portfolio)", () => {
    expect(classifyUrl("https://dgatica.cl/proyectos")).toMatchObject({ kind: "web", handle: "dgatica.cl" });
  });
});

describe("LinkedIn se maneja con honestidad, no se finge (prompt §3.1)", () => {
  it("detectar una URL de LinkedIn ofrece las alternativas reales", () => {
    const kinds = detectAndClassify("mi linkedin: linkedin.com/in/ana-soto").map((u) => u.kind);
    expect(kinds).toContain("linkedin");
    expect(LINKEDIN_ALTERNATIVES.vias).toHaveLength(3);
    expect(LINKEDIN_ALTERNATIVES.titulo).toMatch(/no permite/i);
  });
});

describe("dedup · match determinista (prompt §4.5)", () => {
  it("normalizeCompany quita la forma legal SOLO para comparar", () => {
    expect(normalizeCompany("Altiplano Pagos SpA")).toBe("altiplano pagos");
    expect(normalizeCompany("Rayén Retail S.A.")).toBe("rayen retail");
    expect(normalizeCompany("Foo Ltda.")).toBe("foo");
  });

  it("datesOverlap detecta solapamiento por año", () => {
    expect(datesOverlap({ start: "2020", end: "2022" }, { start: "2021", end: "hoy" })).toBe(true);
    expect(datesOverlap({ start: "2018", end: "2019" }, { start: "2020", end: "2022" })).toBe(false);
  });

  it("★ 'Altiplano Pagos SpA' y 'Altiplano Pagos' con fechas solapadas → duplicado", () => {
    const a = { company: "Altiplano Pagos SpA", start: "mar 2022", end: null };
    const b = { company: "Altiplano Pagos", start: "2022", end: "hoy" };
    expect(looksLikeDuplicate(a, b, 2026)).toBe(true);
  });

  it("misma empresa pero fechas que NO se solapan → no es duplicado", () => {
    const a = { company: "Rayén Retail S.A.", start: "2015", end: "2017" };
    const b = { company: "Rayén Retail", start: "2020", end: "2022" };
    expect(looksLikeDuplicate(a, b, 2026)).toBe(false);
  });

  it("empresas distintas → no es duplicado", () => {
    const a = { company: "Altiplano Pagos SpA", start: "2022", end: null };
    const b = { company: "Rayén Retail S.A.", start: "2022", end: null };
    expect(looksLikeDuplicate(a, b, 2026)).toBe(false);
  });

  it("clusterDuplicates agrupa el mismo trabajo de dos fuentes", () => {
    const items = [
      { company: "Altiplano Pagos SpA", start: "mar 2022", end: null },
      { company: "Altiplano Pagos", start: "2022", end: "hoy" },
      { company: "Rayén Retail S.A.", start: "2020", end: "2022" },
    ];
    const clusters = clusterDuplicates(items, 2026);
    expect(clusters).toHaveLength(2);
    expect(clusters.find((c) => c.length === 2)).toBeTruthy();
  });
});
