import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserLlmKey } from "@/lib/account/byok";
import { SQL_COLUMNA_MODELO, elegirModelo, leerModeloElegido } from "@/lib/account/preferencias";
import { catalogoCacheado, listarModelos, validarModeloEfectivo } from "@/lib/ai/catalogo";
import { claveGemini, modeloDe, modeloEfectivo, nombreVarClave } from "@/lib/ai/modelos";

export const runtime = "nodejs";
// El barrido son N llamadas reales en oleadas de CONCURRENCIA: necesita margen.
// El GET normal (sin `probar`) no se acerca ni de lejos a este techo.
export const maxDuration = 60;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * GET  /api/ai/modelos          → qué modelo atiende de verdad + si RESPONDE.
 * GET  /api/ai/modelos?probar=1 → además, el barrido: lista + PRUEBA cada modelo.
 * POST /api/ai/modelos          → guarda la elección ({ modelo } | { modelo: null }).
 *
 * TRES REGLAS QUE ESTA RUTA NO PUEDE ROMPER:
 *
 *  1) EL BARRIDO CUESTA DINERO y por eso NO ocurre solo. Sin `?probar=1` esta ruta
 *     jamás lanza N llamadas: devuelve el catálogo YA cacheado (o null) y valida un
 *     único modelo —el efectivo—, que además reutiliza la ventana del ping de salud
 *     cuando es el del registro. Cargar Ajustes no puede facturar veinte llamadas.
 *
 *  2) NO SE GUARDA UN MODELO QUE NO RESPONDE. El POST lo PRUEBA antes de escribir.
 *     Guardar sin probar reproduce exactamente el fallo que este bloque arregla: el
 *     listado ofrece un modelo muerto, el usuario lo elige, y la app se cae después,
 *     lejos de aquí, en mitad de una extracción de verdad.
 *
 *  3) EL ESPEJO. `ping-salud` debe seguir apuntando al MISMO modelo que la
 *     extracción (lo garantiza `modeloEfectivo` en el registro). Aquí se DEVUELVE
 *     comprobado, para que la pantalla pueda enseñarlo y para que un futuro cambio
 *     que lo rompa se vea a simple vista en la respuesta.
 * ════════════════════════════════════════════════════════════════════════════
 */

export async function GET(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const url = new URL(req.url);
  const probar = url.searchParams.get("probar") === "1";
  const forzar = url.searchParams.get("forzar") === "1";

  // La clave EFECTIVA: la del usuario (BYOK, descifrada en servidor) o la del
  // servidor. NUNCA vuelve al cliente; solo se dice de dónde salió.
  const byok = await getUserLlmKey(sb, user.id);
  const servidor = claveGemini();
  const key = byok ?? servidor;
  const claveFuente = byok ? "byok" : servidor ? "servidor" : "ninguna";

  const pref = await leerModeloElegido(sb, user.id);
  const registro = modeloDe("extraccion-estructurada");
  const efectivo = modeloEfectivo("extraccion-estructurada", pref.modelo);
  const espejoPing = modeloEfectivo("ping-salud", pref.modelo);

  const base = {
    elegido: pref.modelo,
    // El PORQUÉ del modelo activo, que es lo que la pantalla tiene que explicar.
    origen: pref.modelo ? ("elegido" as const) : ("registro" as const),
    modeloEfectivo: efectivo,
    modeloRegistro: registro,
    // El espejo, comprobado y devuelto: si algún día dejaran de coincidir, el
    // chequeo de salud estaría probando otro modelo y esto lo delata.
    espejoPingSalud: espejoPing,
    espejoOk: espejoPing === efectivo,
    claveFuente,
    envVar: nombreVarClave(),
    columnaAusente: pref.columnaAusente,
    sqlPendiente: pref.columnaAusente ? SQL_COLUMNA_MODELO : undefined,
    errorPreferencia: pref.error,
  };

  if (!key) {
    // Sin clave no se inventa nada: ni validación ni catálogo. Se dice el motivo.
    return NextResponse.json({ ...base, validacion: null, catalogo: null, motivo: "sin-clave" });
  }

  const validacion = await validarModeloEfectivo(key, efectivo, { forzar });
  // ★ El modelo EN USO y el del registro se prueban siempre, aunque el tope de
  //   coste corte el resto: un catálogo sin el modelo que usas no sirve de nada.
  const catalogo = probar
    ? await listarModelos(key, { forzar, prioritarios: [efectivo, registro] })
    : catalogoCacheado(key);

  return NextResponse.json({ ...base, validacion, catalogo });
}

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  let body: { modelo?: unknown };
  try {
    body = (await req.json()) as { modelo?: unknown };
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  // La DECISIÓN (validar · PROBAR · guardar) vive en src/lib, no aquí: una ruta es
  // una frontera HTTP, no un módulo compartido. Aquí solo queda el mapeo a HTTP.
  const byok = await getUserLlmKey(sb, user.id);
  const res = await elegirModelo(sb, user.id, body.modelo, byok ?? claveGemini() ?? null);

  // 400 solo cuando la petición se RECHAZA (id malo, sin clave, no responde). Un
  // guardado que no se pudo escribir por falta de columna NO es culpa del cliente:
  // va 200 con `ok:false` y el SQL exacto que falta.
  return NextResponse.json(res, { status: res.motivo ? 400 : 200 });
}
