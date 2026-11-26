import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { extractText, getDocumentProxy } from "unpdf";
import { renderResumeToBuffer } from "../../src/lib/cv/ResumePDF";
import { toPlainText, type ResumeData } from "../../src/lib/cv/resume";

// Depuración puntual. TPL=id1,id2,… se renderizan EN SECUENCIA en el mismo proceso
// (como en /api/cv) y se vuelca el último: PDF re-parseado y rayos-X.
// NB=n añade un rol de n viñetas; BODY=pt fuerza el cuerpo; DEP_OUT=fichero.
it("depura", async () => {
  const base = JSON.parse(readFileSync("src/lib/cv/fixtures/datos-ejemplo.json", "utf8")) as ResumeData;
  const d = JSON.parse(JSON.stringify(base)) as ResumeData;
  const monstruo = {
    ...base.work[0]!,
    company: "Corporación Rol Extenso SpA",
    bullets: Array.from({ length: Number(process.env.NB ?? 0) }, (_, i) => ({
      p1: true, es: `Hito ${String(i + 1).padStart(2, "0")}: migré el módulo ${i + 1} sin cortes de servicio.`, en: "x",
    })),
  };
  d.work = [...(process.env.NB ? [monstruo] : []), ...d.work, ...base.work.map((w) => ({ ...w, company: `${w.company} (etapa 1)`, bullets: w.bullets.map((b) => ({ ...b, es: process.env.SUF ? `${b.es} Etapa 1.` : b.es })) }))];
  const body = process.env.BODY ? Number(process.env.BODY) : undefined;
  let out = "";
  for (const tpl of (process.env.TPL ?? "ats-clasica").split(",")) {
    d.templateId = tpl;
    const buf = await renderResumeToBuffer(d, { locale: "es", onePage: false, bodySize: body });
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
    out = `PDF:\n${text}\n\nPX:\n${toPlainText(d, { locale: "es", onePage: false })}`;
  }
  writeFileSync(process.env.DEP_OUT ?? "dep.txt", out);
});
