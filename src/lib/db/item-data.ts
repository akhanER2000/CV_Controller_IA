/**
 * Validación del `data` de un profile_item, compartida por la ruta y los tests.
 *
 * ⚠ VIVE AQUÍ Y NO EN LA RUTA POR UNA RAZÓN DURA, NO POR ORDEN. Un `route.ts` de
 * Next solo puede exportar sus manejadores HTTP y un puñado de campos de
 * configuración; cualquier otro export hace fallar la comprobación de tipos del
 * build. Exportar `invalidItemData` desde la ruta pasaba `tsc --noEmit` Y pasaba
 * los 1637 tests, y reventaba `next build` — que es el único de los tres que se
 * parece a producción. Un fichero de ruta es una frontera HTTP, no un módulo
 * compartido: en cuanto algo hay que importarlo desde otro sitio, ya no es suyo.
 */

/* ── Validación del `data` que entra por PATCH ────────────────────────────────
   patchMasterItem hace .update({ data }): REEMPLAZA la columna entera, no fusiona.
   Un PATCH mal formado no corrompe un campo — borra el item entero por dentro. Por
   eso aquí no vale "es un objeto": se comprueba forma, claves y valores.

   DATA_KEYS es la unión REAL de lo que escriben la ingesta (extract/pipeline.ts,
   extract/github.ts), el staging (§C2, las claves date*) y esta pantalla. No es un
   catálogo aspiracional: si mañana el pipeline guarda una clave nueva, hay que
   añadirla aquí a mano. Se RECHAZA la clave desconocida en vez de descartarla en
   silencio — descartar sería guardar algo distinto de lo que el cliente pidió y
   decirle que salió bien. */
const DATA_KEYS = new Set([
  // basics (contacto)
  "name", "label", "email", "phone", "location", "links", "photo", "qr",
  // summary y viñeta
  "text",
  // work
  "title", "company", "dates",
  // education
  "degree", "institution",
  // project
  "description", "url",
  // certification / language (el kind existe en el enum; el pipeline aún no los crea)
  "issuer", "language", "level",
  // reference — datos de terceros. La escritura normal va por /api/references,
  // pero el master manda el spread COMPLETO del item al editar cualquier campo:
  // sin estas tres claves, editar una referencia devolvía 400 y el usuario no
  // podía corregir un cargo mal escrito desde donde lo estaba viendo.
  "role", "org", "relation",
  // skill — un grupo es {group, items:CSV}; sourceContext dice de qué rol salió
  "group", "items", "sourceContext",
  // procedencia de la fecha (§C2): quién la puso y qué se entendió de ella
  "dateStart", "dateEnd", "dateCurrent", "dateMissing", "dateInvalid", "dateByHuman",
]);

/** Tope del payload. No hay CV cuyo item legítimo pese 64 KB; más es un cliente roto. */
const MAX_DATA_BYTES = 64 * 1024;
const MAX_LINKS = 40;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Los enlaces del contacto: "url" suelta u {label,url}. Nada más. */
function invalidLinks(v: unknown): string | null {
  if (!Array.isArray(v)) return "links debe ser una lista.";
  if (v.length > MAX_LINKS) return `Demasiados enlaces (máx. ${MAX_LINKS}).`;
  for (const l of v) {
    if (typeof l === "string") continue;
    if (!isPlainObject(l)) return "Cada enlace es una url o {label,url}.";
    for (const [k, val] of Object.entries(l)) {
      if (k !== "label" && k !== "url") return `Clave de enlace no permitida: «${k}».`;
      if (typeof val !== "string") return "label y url de un enlace son texto.";
    }
  }
  return null;
}

/**
 * Devuelve el motivo del rechazo, o null si el `data` puede guardarse. Escalares
 * solamente (texto/número/booleano/null); las dos únicas estructuras que el modelo
 * usa de verdad son `links` (lista) y `qr` (objeto plano de textos).
 */
export function invalidItemData(data: unknown): string | null {
  if (!isPlainObject(data)) return "data debe ser un objeto (ni lista ni nulo).";
  let bytes = 0;
  try {
    bytes = JSON.stringify(data).length;
  } catch {
    return "data no es serializable.";
  }
  if (bytes > MAX_DATA_BYTES) return "data demasiado grande.";

  for (const [k, v] of Object.entries(data)) {
    if (!DATA_KEYS.has(k)) return `Clave no permitida en data: «${k}».`;
    if (k === "links") {
      const bad = invalidLinks(v);
      if (bad) return bad;
      continue;
    }
    if (k === "qr") {
      if (!isPlainObject(v)) return "qr debe ser un objeto.";
      for (const qv of Object.values(v)) {
        if (typeof qv !== "string" && typeof qv !== "boolean") return "qr solo admite texto o booleanos.";
      }
      continue;
    }
    if (v === null) continue;
    const ty = typeof v;
    if (ty !== "string" && ty !== "number" && ty !== "boolean") {
      return `El valor de «${k}» debe ser texto, número o booleano.`;
    }
  }
  return null;
}
