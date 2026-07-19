import { extractText, getDocumentProxy } from "unpdf";
import { renderResumeToBuffer, type RenderOpts } from "@/lib/cv/ResumePDF";
import type { ResumeData } from "@/lib/cv/resume";
import example from "@/lib/cv/fixtures/datos-ejemplo.json";
import { createClient } from "@/lib/supabase/server";
import { buildResumeData } from "@/lib/db/queries";
import { buildVariantResumeData } from "@/lib/db/variants";

// react-pdf necesita el runtime de Node (fontkit, streams). unpdf también.
export const runtime = "nodejs";

/**
 * EL ÚNICO MOTOR DEL DOCUMENTO. Aquí se renderiza el PDF y de aquí sale TODO lo
 * que la app dice del documento: los bytes que se descargan, los bytes que se
 * embeben en el preview, el texto "cómo lo lee el ATS" y el número de páginas.
 *
 * Fuente de los datos (body):
 *   { variantId }         → el ResumeData de ESA variante (items visibles + overrides).
 *   { fromMaster: true }  → el ResumeData del master del usuario autenticado.
 *   { data }              → el ResumeData dado (lo que usa el editor: preview y descarga).
 *   (nada)                → el ejemplo (Diego Gatica), para la demo.
 *
 * Forma de la respuesta (`as`):
 *   'pdf' (por defecto) → los bytes del PDF (application/pdf). download:true = adjunto.
 *   'text'              → { text, pages } — el texto RE-PARSEADO con unpdf del MISMO
 *                         buffer que se acaba de renderizar. No hay un segundo
 *                         generador de texto: el rayos-X es literalmente lo que el
 *                         parser extrae del PDF entregado.
 *   'preview'           → { pdf (base64), text, pages } — las tres cosas del MISMO
 *                         buffer, en UNA llamada. Es lo que embebe el editor: el
 *                         documento que se ve y el texto del rayos-X no pueden
 *                         derivar porque son el mismo artefacto.
 *
 * Errores: SIEMPRE con el motivo real en el cuerpo → { error }. Un preview en
 * blanco y mudo es peor que un error legible (documento-cv.md §7).
 */

type As = "pdf" | "text" | "preview";

interface CvBody {
  data?: ResumeData;
  fromMaster?: boolean;
  variantId?: string;
  opts?: RenderOpts;
  download?: boolean;
  as?: As;
}

/** El motivo REAL de un fallo, en texto. Nunca "algo salió mal". */
const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Error como cuerpo JSON: el cliente lo muestra tal cual en la barra de estado. */
const failure = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  let body: CvBody = {};
  try {
    body = (await req.json()) as CvBody;
  } catch {
    /* sin body (o body no-JSON) → se usa el ejemplo; no es un error del usuario */
  }

  const as: As = body.as === "text" || body.as === "preview" ? body.as : "pdf";

  // ── 1 · De dónde salen los datos ───────────────────────────────────────────
  let data: ResumeData;
  if (body.variantId) {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return failure("Sesión requerida.", 401);
    try {
      data = await buildVariantResumeData(sb, user.id, body.variantId);
    } catch (e) {
      console.error("[api/cv] no se pudo armar la variante", body.variantId, e);
      return failure(reason(e), 404);
    }
  } else if (body.fromMaster) {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return failure("Sesión requerida.", 401);
    try {
      data = await buildResumeData(sb, user.id);
    } catch (e) {
      console.error("[api/cv] no se pudo armar el master", e);
      return failure(reason(e), 500);
    }
  } else {
    data = body.data ?? (example as unknown as ResumeData);
  }

  // ── 2 · UN render. Todo lo que sigue sale de ESTE buffer ───────────────────
  let buf: Buffer;
  try {
    buf = await renderResumeToBuffer(data, body.opts ?? {});
  } catch (e) {
    // El motivo sube tal cual: fuente que no carga, imagen corrupta, QR imposible…
    // El usuario tiene derecho a leer QUÉ falló.
    console.error("[api/cv] falló el render del PDF", e);
    return failure(reason(e), 500);
  }

  // ── 3 · Rayos-X / paginación: se RE-PARSEA ese mismo buffer con unpdf ───────
  if (as === "text" || as === "preview") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      return Response.json(
        {
          text,
          pages: pdf.numPages,
          ...(as === "preview" ? { pdf: buf.toString("base64") } : {}),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e) {
      console.error("[api/cv] falló el re-parseo del PDF con unpdf", e);
      return failure(reason(e), 500);
    }
  }

  // ── 4 · Los bytes del PDF ──────────────────────────────────────────────────
  const safe = (data.basics?.name || "corpus").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${body.download ? "attachment" : "inline"}; filename="CV-${safe}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
