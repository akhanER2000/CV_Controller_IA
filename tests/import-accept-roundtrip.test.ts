import { describe, it, expect, beforeAll } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { emptyProfile, serializeWithVariant, resumeToPlainText, type Profile, type StagedItem } from "../src/lib/cv/serialize";
import { promote } from "../src/lib/cv/promote";
import { renderResumeToBuffer } from "../src/lib/cv/ResumePDF";

/**
 * Criterio #1 de PROMPT 08, extremo a extremo a nivel unitario:
 * items de staging (con la forma exacta que produce src/lib/ingest.ts) → aceptar →
 * master → serializar la variante → PDF → re-parsear → contiene lo aceptado.
 * Prueba que "acepto → PDF que pasa el round-trip" NO depende del navegador.
 */

const staged: StagedItem[] = [
  { id: "s1", section: "basics", label: "Datos básicos", preview: "", origin: "texto pegado", originKind: "manual", evidenceLevel: "verified",
    payload: { name: "Ana Soto", targetTitleDefault: "Ingeniera Backend", contacts: [{ type: "manual", label: "Email", value: "ana.soto@correo.cl", visible: true }] } },
  { id: "s2", section: "summary", label: "Resumen", preview: "", origin: "texto pegado → IA", originKind: "ai", evidenceLevel: "verified",
    payload: { text: "Ingeniera backend con seis años construyendo sistemas de pago." } },
  { id: "s3", section: "skills", label: "Lenguajes", preview: "", origin: "GitHub · API", originKind: "api", evidenceLevel: "api",
    payload: { category: "Lenguajes", items: ["Go", "Python", "PostgreSQL"] } },
  { id: "s4", section: "work", label: "Senior Backend Engineer", preview: "", origin: "texto pegado → IA", originKind: "ai", evidenceLevel: "verified",
    payload: { title: "Senior Backend Engineer", orgLegal: "Cornershop", location: "Santiago", start: "2021-01", end: null, current: true, bullets: [{ text: "Reduje la latencia de checkout en 38%." }] } },
  { id: "s5", section: "education", label: "Ingeniería Civil", preview: "", origin: "texto pegado → IA", originKind: "ai", evidenceLevel: "verified",
    payload: { degree: "Ingeniería Civil en Computación", institution: "Universidad de Chile", location: "Santiago", start: "2014", end: "2019" } },
  { id: "s6", section: "projects", label: "APP-RAG", preview: "", origin: "GitHub · API", originKind: "api", evidenceLevel: "api",
    payload: { name: "APP-RAG", url: "github.com/ana/app-rag", start: "", end: null, bullets: [{ text: "Asistente RAG para consultar PDFs." }] } },
];

function acceptAll(): Profile {
  let p = emptyProfile();
  p = { ...p, staged: [...staged] };
  for (const item of staged) p = promote(p, item);
  return p;
}

describe("Importar → aceptar → master → CV", () => {
  const profile = acceptAll();
  const variant = profile.variants[0]!;
  const model = serializeWithVariant(profile, variant);
  let extracted = "";

  beforeAll(async () => {
    const buf = await renderResumeToBuffer(model);
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    extracted = text.replace(/\s+/g, " ").trim();
  });

  it("1 · nada queda pendiente tras aceptar todo", () => {
    expect(profile.staged ?? []).toHaveLength(0);
  });

  it("2 · el master recibió cada sección", () => {
    expect(profile.basics.name).toBe("Ana Soto");
    expect(profile.work).toHaveLength(1);
    expect(profile.education).toHaveLength(1);
    expect(profile.projects).toHaveLength(1);
    expect(profile.skills[0]?.items.map((i) => i.name)).toEqual(["Go", "Python", "PostgreSQL"]);
    expect(profile.basics.summaries).toHaveLength(1);
  });

  it("3 · la variante quedó enlazada (si no, el CV saldría vacío)", () => {
    expect(variant.targetTitle).toBe("Ingeniera Backend");
    expect(variant.summaryRef).toBeTruthy();
    expect(variant.sections?.map((s) => s.type)).toEqual(["skills", "work", "education", "projects"]);
  });

  it("4 · el texto serializado contiene lo aceptado, en orden de lectura", () => {
    const txt = resumeToPlainText(model);
    for (const needle of [
      "Ana Soto", "Ingeniera Backend", "ana.soto@correo.cl",
      "RESUMEN", "seis años", "APTITUDES TÉCNICAS", "Lenguajes: Go, Python, PostgreSQL",
      "EXPERIENCIA", "Senior Backend Engineer", "Cornershop · Santiago", "latencia de checkout en 38%",
      "EDUCACIÓN", "Universidad de Chile", "PROYECTOS", "APP-RAG",
    ]) expect(txt, `ausente: ${needle}`).toContain(needle);
  });

  it("5 · el PDF re-parseado conserva los datos aceptados", () => {
    for (const needle of ["Ana Soto", "Senior Backend Engineer", "38%", "Universidad de Chile", "APP-RAG"]) {
      expect(extracted, `perdido en el PDF: ${needle}`).toContain(needle);
    }
  });
});
