import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret, encryptionAvailable, encryptSecret } from "@/lib/crypto";
import { estadoLlmKey2 } from "@/lib/account/byok";

export const runtime = "nodejs";

/**
 * Ajustes del usuario (user_settings). GET devuelve todo MENOS las claves BYOK
 * (solo `hasKey` / `hasKey2`): las claves nunca vuelven al cliente (02 §2). POST
 * persiste los campos enviados con la sesión del usuario (RLS por auth.uid()).
 *
 * ★ EL CANDADO. Sin CORPUS_ENCRYPTION_KEY no se persiste NINGUNA clave (se aparca), y
 *   el GET lo dice con `encryptionAvailable` para que la pantalla pueda CERRAR el campo
 *   en vez de aceptar un secreto que va a rechazar. `keyParked`/`key2Parked` distinguen
 *   «hay clave guardada» de «hay clave que sirve»: un blob que ya no se puede descifrar
 *   (maestra perdida o rotada) se marca aparcado, nunca se muestra como buena.
 *
 * ★ §H · SEGUNDA CLAVE (Groq, router por coste). Se lee y se escribe SIEMPRE en su
 *   propia consulta, nunca junto al resto: la columna llm_api_key_2 (migración 0006)
 *   puede no existir todavía, y un error suyo NO debe tumbar la lectura ni el guardado
 *   de los demás ajustes. Degrada con honestidad — se dice, no se calla.
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

  // La 2ª clave se sondea aparte (columna que puede faltar). Solo la PRESENCIA.
  const est2 = await estadoLlmKey2(sb, user.id);

  // ★ ¿Hay candado? Se expone el ESTADO del cifrado (un booleano de configuración),
  //   nunca la clave maestra ni nada derivado de ella. Lo necesita la UI para CERRAR
  //   el campo BYOK en vez de dejar escribir un secreto que después va a rechazar:
  //   un campo que acepta texto y luego lo tira parece roto y hace perder el tiempo.
  const cifradoDisponible = encryptionAvailable();

  // ¿La 1ª clave guardada es USABLE hoy? Se comprueba descifrando el blob que ya
  // tenemos (sin consulta extra). Se distingue «hay clave» de «hay clave que sirve»:
  // si se perdió o se rotó CORPUS_ENCRYPTION_KEY, el valor sigue en la base pero es
  // ilegible — decirlo «guardada ✓» sería el ✓ optimista que este producto no admite.
  // Es la MISMA distinción que estadoLlmKey2 hace para la 2ª clave (byok.ts §H).
  const blob1 = (data?.llm_api_key as string | null | undefined) ?? null;
  let clave1Usable = false;
  if (blob1 && blob1.startsWith("v1:") && cifradoDisponible) {
    try {
      clave1Usable = !!decryptSecret(blob1).trim();
    } catch {
      clave1Usable = false; // maestra distinta o blob corrupto: aparcada, nunca en claro
    }
  }

  return NextResponse.json({
    ui_lang: data?.ui_lang ?? "es",
    theme: data?.theme ?? "dark",
    ai_enabled: data?.ai_enabled ?? true,
    display_name: data?.display_name ?? "",
    email: user.email ?? "",
    provider: (user.app_metadata?.provider as string) ?? "email",
    hasKey: !!data?.llm_api_key, // la clave NO se devuelve
    hasKey2: est2.almacenada, // la 2ª clave tampoco se devuelve, solo si existe
    encryptionAvailable: cifradoDisponible, // hay CORPUS_ENCRYPTION_KEY válida en el servidor
    // 1ª clave guardada de antes pero hoy indescifrable (falta o cambió la maestra).
    keyParked: !!blob1 && !clave1Usable,
    key2Parked: est2.aparcada, // guardada pero indescifrable (falta CORPUS_ENCRYPTION_KEY)
    key2Unavailable: est2.columnaAusente, // migración 0006 sin aplicar
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

  // ── §H · la 2ª clave, en su PROPIA escritura ───────────────────────────────
  // Va aparte a propósito: si la columna llm_api_key_2 no existe (migración 0006
  // sin aplicar), su upsert falla, pero el resto de ajustes YA se guardaron arriba.
  // El fallo NO se traga en silencio: se informa con `key2Unavailable`.
  let key2Parked = false;
  let key2Unavailable = false;
  if ("llm_api_key_2" in body) {
    const v = body["llm_api_key_2"];
    let cifrada: string | null = null;
    let escribir = true;
    if (v == null || v === "") {
      cifrada = null; // limpiar la 2ª clave → todo vuelve a Gemini
    } else if (encryptionAvailable()) {
      cifrada = encryptSecret(String(v)); // ★ CIFRADA igual que la primera
    } else {
      // Sin cifrado no se persiste un secreto en claro: se aparca, no se escribe.
      key2Parked = true;
      escribir = false;
    }
    if (escribir) {
      const { error: e2 } = await sb
        .from("user_settings")
        .upsert({ user_id: user.id, llm_api_key_2: cifrada }, { onConflict: "user_id" });
      if (e2) key2Unavailable = true; // columna sin aplicar: se dice, no se traga
    }
  }

  // `encryptionAvailable` viaja también en la respuesta del POST: si el estado que
  // tenía el cliente estaba viejo (se guardó ANTES de que el servidor perdiera la
  // clave maestra), la pantalla puede cerrar el campo en el acto en vez de esperar
  // a la siguiente carga. El motivo real acompaña siempre al rechazo.
  return NextResponse.json({
    ok: true,
    keyParked,
    key2Parked,
    key2Unavailable,
    encryptionAvailable: encryptionAvailable(),
  });
}
