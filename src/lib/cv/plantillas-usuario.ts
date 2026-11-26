/**
 * Las plantillas a medida del usuario en la base (`plantillas_usuario`, 0011).
 *
 * El render resuelve las plantillas con getTemplate(), que es síncrona y vive en
 * templates.ts. Una plantilla "u:<uuid>" no está en el catálogo: antes de renderizar,
 * el servidor la lee CON EL CLIENTE DEL USUARIO (RLS: solo las suyas) y la registra.
 * Si no es suya o ya no existe, el id se quita del documento y sale la de por
 * defecto: nunca se pinta la plantilla de otro ni se deja a nadie sin CV.
 *
 * Sin la 0011 aplicada todo degrada: listar devuelve [], resolver quita el id, y
 * guardar falla con el motivo real («falta la migración 0011»).
 */

import type { ResumeData } from "./resume";
import { PREFIJO_PLANTILLA_USUARIO, esPlantillaUsuario, olvidarPlantillaUsuario, type CvTemplate } from "./templates";
import { plantillaDeParams, validarParams, type ParamsMedida } from "./plantilla-medida";

// El cliente de Supabase, tipado lo justo (el de servidor y el de service-role valen).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = { from: (t: string) => any };

export interface PlantillaUsuario {
  /** "u:<uuid>" — el id con el que la pide el documento */
  id: string;
  nombre: string;
  base: string;
  params: ParamsMedida;
  creada: string;
}

const TABLA = "plantillas_usuario";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El uuid de un id "u:<uuid>", o null si no tiene esa forma. */
export function uuidDe(id: string): string | null {
  if (!esPlantillaUsuario(id)) return null;
  const u = id.slice(PREFIJO_PLANTILLA_USUARIO.length);
  return UUID.test(u) ? u : null;
}

const nombreLimpio = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || "A medida";

function deFila(f: { id: string; nombre: string; base_template_id: string; params: ParamsMedida; created_at: string }): PlantillaUsuario {
  return { id: `${PREFIJO_PLANTILLA_USUARIO}${f.id}`, nombre: f.nombre, base: f.base_template_id, params: f.params, creada: f.created_at };
}

/** Registra en templates.ts una plantilla leída de la base (si sus parámetros siguen siendo válidos). */
function registrar(p: PlantillaUsuario): CvTemplate | null {
  if (!validarParams(p.params).ok) return null;
  return plantillaDeParams(p.params, p.id, p.nombre);
}

export async function listarPlantillasUsuario(sb: SB, userId: string): Promise<PlantillaUsuario[]> {
  const { data, error } = await sb
    .from(TABLA)
    .select("id,nombre,base_template_id,params,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[plantillas-usuario] no se pudieron listar (¿falta la 0011?)", error.message);
    return [];
  }
  const lista = (data ?? []).map(deFila);
  for (const p of lista) registrar(p);
  return lista;
}

export async function guardarPlantillaUsuario(
  sb: SB,
  userId: string,
  params: ParamsMedida,
  nombre?: string,
): Promise<PlantillaUsuario> {
  const v = validarParams(params);
  if (!v.ok) throw new Error(`Plantilla fuera de los límites ATS: ${v.razon}.`);
  const { data, error } = await sb
    .from(TABLA)
    .insert({ user_id: userId, nombre: nombreLimpio(nombre), base_template_id: params.base, params })
    .select("id,nombre,base_template_id,params,created_at")
    .single();
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message) ? "Falta aplicar la migración 0011 (plantillas_usuario)." : error.message);
  const p = deFila(data);
  registrar(p);
  return p;
}

export async function renombrarPlantillaUsuario(sb: SB, userId: string, id: string, nombre: string): Promise<boolean> {
  const u = uuidDe(id);
  if (!u) return false;
  const { data, error } = await sb.from(TABLA).update({ nombre: nombreLimpio(nombre) }).eq("id", u).eq("user_id", userId).select("id");
  if (error) throw new Error(error.message);
  olvidarPlantillaUsuario(id); // el nombre nuevo se registra en la próxima lectura
  return (data ?? []).length > 0;
}

export async function eliminarPlantillaUsuario(sb: SB, userId: string, id: string): Promise<boolean> {
  const u = uuidDe(id);
  if (!u) return false;
  const { data, error } = await sb.from(TABLA).delete().eq("id", u).eq("user_id", userId).select("id");
  if (error) throw new Error(error.message);
  olvidarPlantillaUsuario(id);
  return (data ?? []).length > 0;
}

/** Lee y registra UNA plantilla del usuario. null si no es suya, no existe o no hay 0011. */
export async function cargarPlantillaUsuario(sb: SB, userId: string, id: string): Promise<CvTemplate | null> {
  const u = uuidDe(id);
  if (!u) return null;
  const { data, error } = await sb
    .from(TABLA)
    .select("id,nombre,base_template_id,params,created_at")
    .eq("id", u)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) {
    olvidarPlantillaUsuario(id);
    return null;
  }
  return registrar(deFila(data));
}

/**
 * Antes de renderizar: si el documento (o las opciones) piden una plantilla "u:…",
 * se carga la del usuario; si no se puede, el id se quita y sale la de por defecto.
 * Devuelve el documento a renderizar (el mismo objeto si no había nada que hacer).
 */
export async function resolverPlantillaDelDocumento<T extends { templateId?: string }>(
  sb: SB | null,
  userId: string | null,
  data: ResumeData,
  opts?: T,
): Promise<{ data: ResumeData; opts?: T }> {
  const ids = [data.templateId, opts?.templateId].filter((x): x is string => esPlantillaUsuario(x));
  if (!ids.length) return { data, opts };
  let d = data;
  let o = opts;
  for (const id of new Set(ids)) {
    const ok = sb && userId ? await cargarPlantillaUsuario(sb, userId, id) : null;
    if (ok) continue;
    if (d.templateId === id) d = { ...d, templateId: undefined };
    if (o?.templateId === id) o = { ...o, templateId: undefined };
  }
  return { data: d, opts: o };
}
