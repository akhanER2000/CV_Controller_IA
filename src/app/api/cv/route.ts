import { renderResumeToBuffer } from "@/lib/cv/ResumePDF";
import type { ResumeModel } from "@/lib/cv/serialize";

// react-pdf necesita el runtime de Node (fontkit, streams).
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { model, download } = (await req.json()) as { model: ResumeModel; download?: boolean };
  const buf = await renderResumeToBuffer(model);
  const safe = (model.name || "corpus").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="CV-${safe}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
