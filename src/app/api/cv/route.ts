import { renderResumeToBuffer, type RenderOpts } from "@/lib/cv/ResumePDF";
import type { ResumeData } from "@/lib/cv/resume";
import example from "@/lib/cv/fixtures/datos-ejemplo.json";
import { createClient } from "@/lib/supabase/server";
import { buildResumeData } from "@/lib/db/queries";

// react-pdf necesita el runtime de Node (fontkit, streams).
export const runtime = "nodejs";

/**
 * Genera el PDF del CV. Body:
 *   { fromMaster: true }  → arma el ResumeData del master del usuario autenticado.
 *   { data }              → usa el ResumeData dado (preview del editor).
 *   (nada)                → el ejemplo (Diego Gatica), para la demo.
 * El MISMO componente sirve el preview y la descarga → cero deriva
 * (documento-cv.md §7 / ESPECIFICACION §5.1). opts: {locale, onePage}. download: bool.
 */
export async function POST(req: Request) {
  let body: { data?: ResumeData; fromMaster?: boolean; opts?: RenderOpts; download?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* sin body → usa el ejemplo */
  }

  let data: ResumeData;
  if (body.fromMaster) {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return new Response("Sesión requerida", { status: 401 });
    data = await buildResumeData(sb, user.id);
  } else {
    data = body.data ?? (example as unknown as ResumeData);
  }
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
