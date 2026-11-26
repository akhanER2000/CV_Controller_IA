import { it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { buildVariantResumeData, getVariant } from "@/lib/db/variants";
import { itemDeAjuste } from "@/lib/cv/ajuste";
import { simularRecortes } from "@/lib/cv/cascada";

// MANUAL: ¿qué items de una variante real no sabe quitar la simulación del paso 1?
it.skipIf(!process.env.SONDA_KEY)("cobertura de simularRecortes", async () => {
  const sb = createClient(process.env.SONDA_URL!, process.env.SONDA_KEY!, { auth: { persistSession: false } });
  const U = process.env.SONDA_USER!, V = process.env.SONDA_VARIANT!;
  const det = await getVariant(sb as never, U, V);
  const data = await buildVariantResumeData(sb as never, U, V);
  const items = det!.items.map(itemDeAjuste).filter((i) => i.visible);
  const fallan: Record<string, number> = {};
  for (const it of items) {
    if (it.kind === "basics") continue;
    const r = simularRecortes(data, items, { quitar: [{ id: it.id, kind: it.kind, texto: it.texto, motivo: "" }], acortar: [] });
    if (r.sinSimular) { fallan[it.kind] = (fallan[it.kind] ?? 0) + 1; if (fallan[it.kind] === 1) console.log(it.kind, JSON.stringify(it.datos).slice(0, 200)); }
    if (it.campo && it.original) {
      const a = simularRecortes(data, items, { quitar: [], acortar: [{ id: it.id, kind: it.kind, campo: it.campo, original: it.original, propuesto: "X", motivo: "", ahorro: 1 }] });
      if (a.sinSimular) { const k = "acortar:" + it.kind; fallan[k] = (fallan[k] ?? 0) + 1; if (fallan[k] === 1) console.log(k, it.original.slice(0, 150)); }
    }
  }
  console.log("FALLAN", JSON.stringify(fallan), "de", items.length);
  console.log("summary", JSON.stringify(data.basics.summary).slice(0, 200));
});
it.skipIf(!process.env.SONDA_KEY)("dónde está el texto", async () => {
  const sb = createClient(process.env.SONDA_URL!, process.env.SONDA_KEY!, { auth: { persistSession: false } });
  const data = await buildVariantResumeData(sb as never, process.env.SONDA_USER!, process.env.SONDA_VARIANT!);
  const s = JSON.stringify(data);
  console.log("RECALL", s.includes("Recall 0,65"), "CUADERNO", s.includes("cuaderno"), "links", JSON.stringify(data.basics.links).slice(0, 300), "refs", (data.references ?? []).length);
  const i = s.indexOf("Recall 0,6"); console.log("CTX", s.slice(Math.max(0, i - 200), i + 80));
});
