import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { createClient } from "@/lib/supabase/server";
import { modeloPara } from "@/lib/ai/modelos";
import { geminiApiKey } from "@/lib/extract/llm";
import { getUserLlmKey } from "@/lib/account/byok";
import { ensureMaster } from "@/lib/db/queries";
import {
  ORIGEN_TRADUCCION,
  LoteTraducidoSchema,
  construirTraduccion,
  detectarIdioma,
  esIdioma,
  otroIdioma,
  planificarTraduccion,
  promptDeTraduccion,
  verificarTraduccion,
  type Idioma,
  type ItemTraducible,
  type TraduccionLLM,
} from "@/lib/cv/traducir";

export const runtime = "nodejs";
// El I/O del LLM (un lote por cada 20 textos) no cuenta como Active CPU (02 §1).
export const maxDuration = 300;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL CV BILINGÜE — la ruta. Cuatro verbos, y NINGUNO aplica nada por su cuenta.
 *
 *   GET  /api/master/traducir            → ESTADO. Qué idioma tiene el master, qué
 *        hay traducido y qué está PENDIENTE DE TRADUCCIÓN. Solo lectura, sin IA,
 *        sin coste. Es lo que la pantalla necesita para pintar el botón.
 *
 *   POST { accion:'plan',      hacia }   → EL PRESUPUESTO, sin llamar al modelo.
 *        Cuántos campos se copian, cuántos van por tabla determinista y cuántos
 *        cuestan de verdad. Que el usuario vea la factura ANTES de pagarla.
 *
 *   POST { accion:'analizar',  hacia }   → LA PROPUESTA. Llama al modelo SOLO con lo
 *        que hay que pagar, pasa cada campo por el candado y devuelve original ⇄
 *        traducción. NO escribe en la base.
 *
 *   POST { accion:'aplicar',   hacia, items:[{itemId,data}] }
 *        → Escribe las filas espejo (origin='ai_translated', translated_from=id,
 *          lang=hacia). El candado VUELVE A CORRER aquí contra el original leído de
 *          la base: entre la propuesta y el clic hay una red y un navegador, y
 *          ninguno de los dos es de fiar.
 *
 *   POST { accion:'revertir',  hacia, itemIds? } → borra las filas espejo. Un CV en
 *        un idioma que no dominas tiene que poder deshacerse entero de un clic.
 *
 * ★ CÓMO SE GUARDA UNA TRADUCCIÓN, Y POR QUÉ ASÍ.
 *   Una fila HERMANA en `profile_items` con `translated_from` apuntando al original
 *   y `lang` en el idioma destino. Es exactamente para lo que la 0001 creó esa
 *   columna («paridad ES/EN») y su índice, y para lo que existía `ai_translated` en
 *   el enum `item_origin` — una etiqueta que hasta hoy NINGÚN código producía.
 *
 *   La alternativa (meter la traducción DENTRO del `data` del original) se descartó
 *   con una razón dura: `invalidItemData` valida `data` contra un vocabulario
 *   CERRADO, y la pantalla del master manda el `data` COMPLETO en cada edición
 *   inline. Una clave nueva ahí devolvería 400 en cada edición de cualquier campo.
 *
 * ⚠ Las filas espejo NO son items del registro y no pueden aparecer como tales:
 *   `getMasterItems` (queries.ts) las excluye por `origin <> 'ai_translated'`, que
 *   es el ÚNICO embudo por el que pasan el master, el barrido, el detector de
 *   duplicados, la biblioteca de variantes y la exportación .md.
 * ════════════════════════════════════════════════════════════════════════════
 */

const fallo = (msg: string, status: number) => NextResponse.json({ error: msg }, { status });
const motivo = (e: unknown) => (e instanceof Error ? e.message : "Error");

/** Las columnas que la traducción necesita ver de un item del master. */
const COLS = "id,kind,parent_id,data,lang,origin,translated_from,sort_order";

interface FilaItem {
  id: string;
  kind: string;
  parent_id: string | null;
  data: Record<string, unknown>;
  lang: string | null;
  origin: string | null;
  translated_from: string | null;
  sort_order: number | null;
}

/** Baja el master del usuario: los items REALES y sus filas espejo, de una vez. */
async function leerTodo(
  sb: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ originales: FilaItem[]; espejos: FilaItem[] }> {
  const { data, error } = await sb
    .from("profile_items")
    .select(COLS)
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as unknown as FilaItem[];
  return {
    originales: filas.filter((f) => f.origin !== ORIGEN_TRADUCCION),
    espejos: filas.filter((f) => f.origin === ORIGEN_TRADUCCION),
  };
}

/**
 * El texto REDACTADO del master, para detectar en qué idioma está escrito.
 * Solo campos de prosa: mezclar «PharmIQ» o «Docker, Kubernetes» en la muestra
 * emborronaría la señal con palabras que no son de ningún idioma.
 */
function muestraDeIdioma(originales: FilaItem[]): string {
  const CAMPOS = ["text", "description", "title", "label", "degree"];
  const trozos: string[] = [];
  for (const f of originales) {
    for (const c of CAMPOS) {
      const v = f.data?.[c];
      if (typeof v === "string" && v.trim()) trozos.push(v);
    }
    if (trozos.length > 60) break; // con 60 textos la detección ya está decidida
  }
  return trozos.join(" \n ");
}

/**
 * El idioma en que está escrito el master. Se DETECTA sobre el texto y no se lee de
 * la columna `lang`, y eso no es desconfianza gratuita: hoy el pipeline escribe
 * `lang:"es"` fijo (extract/pipeline.ts), así que un CV subido en inglés vendría
 * marcado como español y el producto se ofrecería a «traducirlo» al inglés que ya
 * es. La detección es determinista y gratis; la columna, por ahora, es una
 * constante. Si no hay evidencia suficiente, se cae a `lang` y, en último término,
 * a "es" — pero se DICE cuál de los dos caminos se usó.
 */
function idiomaDelMaster(originales: FilaItem[]): { idioma: Idioma; detectado: boolean } {
  const d = detectarIdioma(muestraDeIdioma(originales));
  if (d) return { idioma: d, detectado: true };
  const declarado = originales.find((f) => f.lang === "en") ? "en" : "es";
  return { idioma: declarado, detectado: false };
}

/** Los items listos para el motor, con la marca de «ya traducido a `hacia`». */
function paraTraducir(originales: FilaItem[], espejos: FilaItem[], hacia: Idioma): ItemTraducible[] {
  const yaHay = new Set(
    espejos.filter((e) => (e.lang ?? "") === hacia && e.translated_from).map((e) => e.translated_from!),
  );
  return originales.map((f) => ({
    id: f.id,
    kind: f.kind,
    lang: f.lang ?? "es",
    data: f.data ?? {},
    yaTraducido: yaHay.has(f.id),
  }));
}

/**
 * El LLM real (Gemini) como función inyectable, igual que en /ajustar. Traducir sin
 * inventar ES `redaccion-preserva-hechos`: por el registro único de modelos, no por
 * un literal suelto. Y no baja a un modelo lite a propósito — el candado impediría
 * la invención igual, pero un modelo débil traduce literal («I led a team of 6
 * people») y eso delata al candidato en la primera línea. Aquí pagar bien vale.
 */
function geminiTraduccionLLM(apiKey?: string): TraduccionLLM {
  const key = apiKey || geminiApiKey();
  if (!key) throw new Error("Falta GEMINI_API_KEY");
  const model = modeloPara("redaccion-preserva-hechos", key);
  return async (peticion) => {
    const { object } = await generateObject({
      model,
      schema: LoteTraducidoSchema,
      prompt: promptDeTraduccion(peticion),
      // Temperatura muy baja: traducir es una tarea con una respuesta correcta, no
      // un ejercicio de estilo. La creatividad aquí solo puede añadir lo que no hay.
      temperature: 0.1,
    });
    return object.traducciones ?? [];
  };
}

/**
 * ★ HIGIENE: filas espejo HUÉRFANAS. `translated_from` es `on delete set null`, así
 * que borrar un item del master deja su traducción viva y sin dueño. Sin esto, esa
 * fila sobreviviría para siempre ocupando sitio (y, si algún día alguien cambiara el
 * filtro de `getMasterItems` por `translated_from is null`, reaparecería en el
 * registro como un item fantasma en otro idioma). Se limpian al tocar el idioma.
 */
async function limpiarHuerfanas(
  sb: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number> {
  const { data, error } = await sb
    .from("profile_items")
    .delete()
    .eq("user_id", userId)
    .eq("origin", ORIGEN_TRADUCCION)
    .is("translated_from", null)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

/* ── GET · el ESTADO (sin IA, sin coste) ───────────────────────────────────── */
export async function GET() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fallo("Sesión requerida.", 401);

  try {
    const { originales, espejos } = await leerTodo(sb, user.id);
    const { idioma, detectado } = idiomaDelMaster(originales);
    const destino = otroIdioma(idioma);
    const traducidosA = (l: Idioma) =>
      new Set(espejos.filter((e) => (e.lang ?? "") === l && e.translated_from).map((e) => e.translated_from!)).size;

    return NextResponse.json({
      idiomaMaster: idioma,
      idiomaDetectado: detectado,
      destino,
      items: originales.length,
      // «PENDIENTE DE TRADUCCIÓN», explícito. Un hueco que no se nombra es un hueco
      // que el usuario descubre cuando ya ha mandado el CV.
      pendientes: Math.max(0, originales.length - traducidosA(destino)),
      traducidos: { es: traducidosA("es"), en: traducidosA("en") },
    });
  } catch (e) {
    console.error("[api/traducir] no se pudo leer el estado", e);
    return fallo(motivo(e), 500);
  }
}

interface Cuerpo {
  accion?: string;
  hacia?: string;
  itemIds?: unknown;
  items?: { itemId?: string; data?: Record<string, unknown> }[];
}

export async function POST(req: Request) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fallo("Sesión requerida.", 401);

  let body: Cuerpo;
  try {
    body = (await req.json()) as Cuerpo;
  } catch {
    return fallo("cuerpo inválido", 400);
  }

  const hacia = body.hacia;
  if (!esIdioma(hacia)) return fallo("El idioma destino tiene que ser «es» o «en».", 400);

  try {
    const { originales, espejos } = await leerTodo(sb, user.id);
    const { idioma: desde } = idiomaDelMaster(originales);
    if (desde === hacia) {
      // No es un error del servidor: es que no hay nada que hacer, y decirlo claro
      // es mejor que gastar una llamada para devolver el mismo texto.
      return fallo(`Tu registro ya está en ${hacia === "es" ? "español" : "inglés"}.`, 422);
    }

    // ── REVERTIR ─────────────────────────────────────────────────────────────
    if (body.accion === "revertir") {
      const ids = Array.isArray(body.itemIds) ? body.itemIds.map(String).filter(Boolean) : null;
      let q = sb
        .from("profile_items")
        .delete()
        .eq("user_id", user.id)
        .eq("origin", ORIGEN_TRADUCCION)
        .eq("lang", hacia);
      if (ids && ids.length) q = q.in("translated_from", ids);
      const { data, error } = await q.select("id");
      if (error) throw new Error(error.message);
      return NextResponse.json({ revertidas: (data ?? []).length, hacia });
    }

    const items = paraTraducir(originales, espejos, hacia);

    // ── PLAN · la factura ANTES de pagarla ───────────────────────────────────
    if (body.accion === "plan") {
      const plan = planificarTraduccion(items, hacia, desde);
      return NextResponse.json({
        desde,
        hacia,
        plan: {
          items: plan.items.length,
          yaTraducidos: plan.yaTraducidos,
          camposCopiados: plan.copiados.length,
          camposTabla: plan.tabla.length,
          camposModelo: plan.modelo.length,
          noDeclarados: plan.noDeclarados,
        },
      });
    }

    // ── APLICAR ──────────────────────────────────────────────────────────────
    if (body.accion === "aplicar") {
      const entradas = Array.isArray(body.items) ? body.items : [];
      if (!entradas.length) return fallo("No llegó ninguna traducción que aplicar.", 400);

      const porId = new Map(originales.map((f) => [f.id, f]));
      const yaHay = new Map(
        espejos.filter((e) => (e.lang ?? "") === hacia && e.translated_from).map((e) => [e.translated_from!, e.id]),
      );
      const profileId = await ensureMaster(sb, user.id);

      const filas: Record<string, unknown>[] = [];
      const rechazados: { itemId: string; campo: string; razon: string }[] = [];
      let saltados = 0;

      for (const ent of entradas) {
        const itemId = (ent?.itemId ?? "").trim();
        const original = porId.get(itemId);
        if (!original) {
          rechazados.push({ itemId, campo: "*", razon: "ese item no está en tu registro" });
          continue;
        }
        // NO SE RE-TRADUCE, tampoco por esta puerta: si ya hay espejo, se salta.
        if (yaHay.has(itemId)) {
          saltados++;
          continue;
        }

        // ★ EL CANDADO, OTRA VEZ, AQUÍ. Campo a campo y contra el `data` que está en
        //   la BASE, nunca contra el que mandó el cliente. Lo que no pasa se queda
        //   con el ORIGINAL: el hecho sobrevive literal y el rechazo se nombra.
        const propuesta = (ent?.data ?? {}) as Record<string, unknown>;
        const dataFinal: Record<string, unknown> = {};
        for (const [campo, valor] of Object.entries(original.data ?? {})) {
          if (campo.startsWith("_")) continue;
          const textoOriginal = typeof valor === "string" ? valor : "";
          const propuesto = propuesta[campo];
          // Campo no textual o no propuesto ⇒ se conserva el valor CRUDO del master
          // (booleanos, `links`, el objeto `qr`): pasarlo por String() destrozaría
          // una lista de enlaces.
          if (typeof propuesto !== "string" || !textoOriginal.trim()) {
            dataFinal[campo] = valor;
            continue;
          }
          if (propuesto.trim() === textoOriginal.trim()) {
            dataFinal[campo] = valor;
            continue;
          }
          const v = verificarTraduccion(textoOriginal, propuesto);
          if (v.ok) {
            dataFinal[campo] = propuesto.trim();
          } else {
            dataFinal[campo] = valor;
            rechazados.push({ itemId, campo, razon: v.razon });
          }
        }

        filas.push({
          profile_id: profileId,
          user_id: user.id,
          kind: original.kind,
          // parent_id NULO a propósito: si la fila espejo colgara del mismo rol que
          // el original, cualquier consulta que agrupe viñetas por `parent_id`
          // (fusión de duplicados, borrado en cascada, el propio render) vería DOS
          // viñetas donde hay una. El vínculo con el padre se deriva por
          // `translated_from` → original.parent_id, que es donde de verdad vive.
          parent_id: null,
          data: dataFinal,
          lang: hacia,
          origin: ORIGEN_TRADUCCION,
          translated_from: original.id,
          sort_order: original.sort_order ?? 0,
        });
      }

      // Los rechazos se registran EN EL SERVIDOR además de viajar al cliente: si un
      // día el modelo empieza a comerse cifras en masa, tiene que verse en los logs.
      for (const r of rechazados) {
        console.warn("[api/traducir] traducción RECHAZADA por el candado", r);
      }

      let insertadas = 0;
      if (filas.length) {
        const { data, error } = await sb.from("profile_items").insert(filas).select("id");
        if (error) throw new Error(error.message);
        insertadas = (data ?? []).length;
      }
      const huerfanas = await limpiarHuerfanas(sb, user.id);
      return NextResponse.json({ hacia, desde, insertadas, saltados, rechazados, huerfanas });
    }

    // ── ANALIZAR (por defecto) ───────────────────────────────────────────────
    const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
    if (!byok && !geminiApiKey()) {
      return fallo("Falta configurar la clave de IA (BYOK o GEMINI_API_KEY del servidor).", 503);
    }

    const resultado = await construirTraduccion(
      { items, hacia, desde },
      { llm: geminiTraduccionLLM(byok) },
    );
    for (const d of resultado.descartados) {
      console.warn("[api/traducir] propuesta RECHAZADA por el candado", {
        item: d.itemId,
        campo: d.campo,
        razon: d.razon,
      });
    }
    return NextResponse.json({ traduccion: resultado });
  } catch (e) {
    console.error("[api/traducir] falló", body.accion ?? "analizar", e);
    return fallo(motivo(e), 500);
  }
}
