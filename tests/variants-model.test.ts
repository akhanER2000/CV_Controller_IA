import { describe, it, expect } from "vitest";
import {
  buildVCard,
  mergePresentationOverride,
  type ResumeData,
  type ResumeLinkInput,
} from "../src/lib/cv/resume";

/**
 * Helpers PUROS del modelo de variantes (sin DB): la vCard 3.0 que codifica el QR en
 * modo 'vcard' y el merge por campo del override de presentación/contacto. Son la
 * lógica que la capa de datos (variants.ts) y el editor comparten; testearlos aquí
 * evita que un cambio de reglas se cuele sin red.
 */

const basics: ResumeData["basics"] = {
  name: "Diego Gatica Morales",
  label: { es: "Backend Engineer", en: "Backend Engineer" },
  email: "diego.gatica@ejemplo.cl",
  phone: "+56 9 6123 4567",
  location: { es: "Santiago, Chile (RM)", en: "Santiago, Chile" },
  links: ["github.com/dgatica", { label: "Portafolio", url: "dgatica.cl" }],
  summary: { es: "", en: "" },
};

describe("buildVCard · vCard 3.0 de los basics efectivos", () => {
  const vc = buildVCard(basics, "es");
  const lines = vc.split("\r\n");

  it("abre y cierra como vCard 3.0, con CRLF entre líneas", () => {
    expect(lines[0]).toBe("BEGIN:VCARD");
    expect(lines[1]).toBe("VERSION:3.0");
    expect(lines[lines.length - 1]).toBe("END:VCARD");
    expect(vc).toContain("\r\n");
  });

  it("N parte el nombre en family (resto) ; given (primero); FN es el nombre completo", () => {
    expect(vc).toContain("N:Gatica Morales;Diego;;;");
    expect(vc).toContain("FN:Diego Gatica Morales");
  });

  it("incluye TITLE, EMAIL, TEL y una URL por enlace", () => {
    expect(vc).toContain("TITLE:Backend Engineer");
    expect(vc).toContain("EMAIL;TYPE=INTERNET:diego.gatica@ejemplo.cl");
    expect(vc).toContain("TEL;TYPE=CELL:+56 9 6123 4567");
    expect(vc).toContain("URL:github.com/dgatica");
    expect(vc).toContain("URL:dgatica.cl");
  });

  it("escapa comas y punto y coma dentro de un componente (RFC 2426 §5)", () => {
    // location "Santiago, Chile (RM)" → la coma se escapa dentro del ADR.
    expect(vc).toContain("ADR;TYPE=HOME:;;Santiago\\, Chile (RM);;;;");
    const tricky = buildVCard(
      { ...basics, label: { es: "Dev, Sr.; lead", en: "" } },
      "es",
    );
    expect(tricky).toContain("TITLE:Dev\\, Sr.\\; lead");
  });

  it("respeta el locale para label y location", () => {
    const en = buildVCard(basics, "en");
    expect(en).toContain("ADR;TYPE=HOME:;;Santiago\\, Chile;;;;");
  });
});

describe("mergePresentationOverride · merge por campo", () => {
  it("undefined no toca; string (incluida '') fija; null quita el override", () => {
    expect(mergePresentationOverride({}, { photo: "x" })).toEqual({ photo: "x" });
    expect(mergePresentationOverride({ photo: "x" }, { photo: "" })).toEqual({ photo: "" });
    expect(mergePresentationOverride({ name: "A", email: "e" }, { name: null })).toEqual({ email: "e" });
    expect(mergePresentationOverride({ name: "A" }, { email: "B" })).toEqual({ name: "A", email: "B" });
    expect(mergePresentationOverride({}, { email: "" })).toEqual({ email: "" });
  });

  it("no muta el objeto de entrada", () => {
    const current = { name: "A" };
    mergePresentationOverride(current, { name: "B" });
    expect(current).toEqual({ name: "A" });
  });

  it("QR: url y modo se mantienen juntos y no se pisan al editarse por separado", () => {
    expect(mergePresentationOverride({}, { qrUrl: "u" })).toEqual({ qr: { url: "u" } });
    expect(mergePresentationOverride({ qr: { url: "u", mode: "url" } }, { qrMode: "vcard" })).toEqual({
      qr: { url: "u", mode: "vcard" },
    });
    // apagar el QR = url vacía + modo url (queda OFF para buildVariantResumeData).
    expect(mergePresentationOverride({ qr: { url: "u", mode: "vcard" } }, { qrUrl: "", qrMode: "url" })).toEqual({
      qr: { url: "", mode: "url" },
    });
  });

  it("links: se normaliza al shape del modelo; null lo revierte", () => {
    const links: ResumeLinkInput[] = [{ label: "L", url: "x.cl" }, "  y.cl  ", { label: "", url: "" }];
    expect(mergePresentationOverride({}, { links })).toEqual({
      links: [{ label: "L", url: "x.cl" }, "y.cl"],
    });
    expect(mergePresentationOverride({ links: ["x.cl"] }, { links: null })).toEqual({});
  });
});
