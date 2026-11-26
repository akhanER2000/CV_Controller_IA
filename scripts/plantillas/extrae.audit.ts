import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { extractText, getDocumentProxy } from "unpdf";
// Extrae el texto de un PDF suelto (EXTRAE_IN) a EXTRAE_OUT, en un proceso limpio.
it("extrae", async () => {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(process.env.EXTRAE_IN!)));
  const { text } = await extractText(pdf, { mergePages: true });
  writeFileSync(process.env.EXTRAE_OUT!, text);
});
