import { renderResumeToBuffer, type RenderOpts } from "@/lib/cv/ResumePDF";
import type { ResumeData } from "@/lib/cv/resume";
import example from "@/lib/cv/fixtures/datos-ejemplo.json";

// react-pdf necesita el runtime de Node (fontkit, streams).
export const runtime = "nodejs";

/**
 * Genera el PDF del CV desde el shape de datos-ejemplo.json (ResumeData).
 * Body: { data?: ResumeData, opts?: {locale,onePage}, download?: boolean }.
 * Si no llega `data`, usa el ejemplo (Diego Gatica) — así el preview del editor
 * y la demo funcionan sin master real todavía. El MISMO componente sirve el
 * preview y la descarga → cero deriva (documento-cv.md §7 / ESPECIFICACION §5.1).
 */
export async function POST(req: Request) {
  let body: { data?: ResumeData; opts?: RenderOpts; download?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* sin body → usa el ejemplo */
  }
  const data = body.data ?? (example as unknown as ResumeData);
  const buf = await renderResumeToBuffer(data, body.opts ?? {});
  const safe = (data.basics?.name || "corpus").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${body.download ? "attachment" : "inline"}; filename="CV-${safe}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
