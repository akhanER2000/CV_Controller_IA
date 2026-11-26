import { describe, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { buildResumeData } from "@/lib/db/queries";
import { buildVariantResumeData } from "@/lib/db/variants";
import { autofit, plantillaDe } from "@/lib/cv/autofit";
import { getTemplate } from "@/lib/cv/templates";
import { cascada } from "@/lib/cv/cascada";
import { paramsDeEscalon, plantillaDeParams, p90DeLinea, baseParaMedida } from "@/lib/cv/plantilla-medida";
import { renderResumeToBuffer } from "@/lib/cv/ResumePDF";
import { medirPdf } from "@/lib/cv/medir";
import { resolveMetrics } from "@/lib/cv/templates";

/* ════════════════════════════════════════════════════════════════════════════
   MANUAL (fuera de CI): ¿por qué «Ajustar páginas» no deja el CV en 2 páginas?
   Arma el ResumeData del MASTER de la cuenta de prueba LOCAL (service-role del
   Supabase local, nunca el remoto) y corre el autofit a 2 páginas, con detalle.

   SONDA_URL=http://127.0.0.1:55321 SONDA_KEY=<service role local> SONDA_USER=<uuid> \
   npx vitest run --config vitest.manual.config.ts tests/manual/ajuste-cascada-sonda.ts
   ════════════════════════════════════════════════════════════════════════════ */

const URL = process.env.SONDA_URL ?? "";
const KEY = process.env.SONDA_KEY ?? "";
const USER = process.env.SONDA_USER ?? "";
const local = /^http:\/\/(127\.0\.0\.1|localhost)/.test(URL);

describe.skipIf(!local || !KEY || !USER)("sonda del ajuste (Supabase local)", () => {
  it("autofit a 2 páginas sobre el master entero", async () => {
    const sb = createClient(URL, KEY, { auth: { persistSession: false } });
    const vid = process.env.SONDA_VARIANT;
    const data = vid ? await buildVariantResumeData(sb as never, USER, vid) : await buildResumeData(sb as never, USER);
    const ids = (process.env.SONDA_TPL ?? `${data.templateId ?? ""}`).split(",").filter(Boolean);
    for (const id of ids.length ? ids : [getTemplate(null).id]) {
      const d = { ...data, templateId: id };
      const r = await autofit(d, plantillaDe(d), 2);
      console.log(
        JSON.stringify({
          plantilla: id,
          cuerpo: r.bodySize,
          base: r.base,
          noCabe: r.noCabe,
          paginasReales: r.medida.porPagina.length,
          porPagina: r.medida.porPagina,
          caben: r.medida.caben,
          sobran: r.sobran,
        }),
      );
      if (process.env.SONDA_ESCALONES) {
        const base = baseParaMedida(plantillaDe(d));
        let p90b: number | undefined;
        for (const t of [0, 0.5, 1]) {
          const p = paramsDeEscalon(base, t, {}, p90b);
          const tpl = plantillaDeParams(p);
          const buf = new Uint8Array(await renderResumeToBuffer({ ...d, templateId: tpl.id, paletteId: undefined, typographyId: undefined }));
          const m = await medirPdf(buf, resolveMetrics(tpl.metrics));
          const p90 = await p90DeLinea(buf);
          if (t === 0) p90b = p90;
          console.log(JSON.stringify({ t, p, porPagina: m.porPagina, p90 }));
        }
      }
      if (process.env.SONDA_CASCADA) {
        const t0 = Date.now();
        const c = await cascada({ data: d, objetivo: 2, actual: r, items: [], propuesta: { quitar: [], acortar: [] } });
        const sinPdf = JSON.parse(JSON.stringify(c, (k, v) => (k === "pdf" && v ? `<${String(v).length} b64>` : v)));
        console.log(JSON.stringify({ ms: Date.now() - t0, ...sinPdf }));
      }
    }
  }, 300000);
});
