import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptionAvailable, encryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";

/**
 * Ajustes del usuario (user_settings). GET devuelve todo MENOS la clave BYOK
 * (solo `hasKey`): la clave nunca vuelve al cliente (02 §2). POST persiste los
 * campos enviados con la sesión del usuario (RLS por auth.uid()).
 */
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const { data } = await sb
    .from("user_settings")
    .select("ui_lang,theme,ai_enabled,display_name,llm_api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    ui_lang: data?.ui_lang ?? "es",
    theme: data?.theme ?? "dark",
    ai_enabled: data?.ai_enabled ?? true,
    display_name: data?.display_name ?? "",
    email: user.email ?? "",
    provider: (user.app_metadata?.provider as string) ?? "email",
    hasKey: !!data?.llm_api_key, // la clave NO se devuelve
  });
}

const ALLOWED = ["ui_lang", "theme", "ai_enabled", "display_name", "llm_api_key"] as const;

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { user_id: user.id };
  let keyParked = false;
  for (const k of ALLOWED) {
    if (!(k in body)) continue;
    if (k === "llm_api_key") {
      const v = body[k];
      if (v == null || v === "") {
        patch[k] = null; // limpiar / "Incluida"
      } else if (encryptionAvailable()) {
        patch[k] = encryptSecret(String(v)); // ★ CIFRADA en reposo — nunca en texto plano
      } else {
        // Sin CORPUS_ENCRYPTION_KEY: NO se persiste un secreto sin cifrar. Se aparca.
        keyParked = true;
      }
    } else {
      patch[k] = body[k];
    }
  }

  const { error } = await sb.from("user_settings").upsert(patch, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, keyParked });
}
