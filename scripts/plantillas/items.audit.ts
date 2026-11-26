import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { getDocumentProxy } from "unpdf";
import { renderResumeToBuffer } from "../../src/lib/cv/ResumePDF";
import type { ResumeData } from "../../src/lib/cv/resume";
// Vuelca los items de texto (str, x, y, ancho, fuente) que contienen ITEMS_GREP.
it("items", async () => {
  const d = JSON.parse(readFileSync("src/lib/cv/fixtures/datos-ejemplo.json", "utf8")) as ResumeData;
  if (process.env.LARGO) d.work = [...d.work, ...d.work.map((w) => ({ ...w, company: `${w.company} (etapa 1)` }))];
  d.templateId = process.env.TPL ?? "ats-cronica";
  const pdf = await getDocumentProxy(new Uint8Array(await renderResumeToBuffer(d, { locale: "es", onePage: false })));
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    const items = tc.items as Array<{ str: string; transform: number[]; width: number; fontName: string; hasEOL: boolean }>;
    items.forEach((it, i) => {
      if (items.slice(Math.max(0, i - 2), i + 3).some((x) => x.str.includes(process.env.ITEMS_GREP ?? "Cat")))
        out.push(`${p} ${JSON.stringify(it.str)} x=${it.transform[4]!.toFixed(1)} y=${it.transform[5]!.toFixed(1)} w=${it.width.toFixed(1)} ${it.fontName} eol=${it.hasEOL}`);
    });
  }
  writeFileSync(process.env.DEP_OUT ?? "items.txt", out.join("\n"));
});
