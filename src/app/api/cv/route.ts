import { renderResumeToBuffer } from "@/lib/cv/ResumePDF";
import type { ResumeModel } from "@/lib/cv/serialize";

// react-pdf necesita el runtime de Node (fontkit, streams).
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { model, download } = (await req.json()) as { model: ResumeModel; download?: boolean };
  // Si la foto rompe el render (formato raro, etc.), degradamos a CV sin foto en
  // vez de fallar entero. El CV sale igual; solo se pierde la imagen.
  let buf: Buffer;
  try {
    buf = await renderResumeToBuffer(model);
  } catch (e) {
    if (model.photo) buf = await renderResumeToBuffer({ ...model, photo: undefined });
    else throw e;
  }
  const safe = (model.name || "corpus").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="CV-${safe}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
