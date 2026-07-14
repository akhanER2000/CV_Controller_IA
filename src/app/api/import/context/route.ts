import { NextResponse } from "next/server";
import { importContext } from "@/lib/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { text?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 }); }
  const text = (body.text ?? "").trim();
  if (text.length < 20) return NextResponse.json({ error: "Pega un poco más de texto (al menos un par de frases)." }, { status: 400 });
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Falta configurar GEMINI_API_KEY en el servidor." }, { status: 503 });
  }
  try {
    const result = await importContext(text);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al importar" }, { status: 500 });
  }
}
