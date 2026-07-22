import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMasterItems } from "@/lib/db/queries";
import { persistSource, isOwnedPath, matchStagedAgainstMaster } from "@/lib/db/sources";
import { analizarCorpusMd, fraseInforme } from "@/lib/corpus-md-staging";
import { parsearCorpusMd, pareceCorpusMd } from "@/lib/corpus-md";

export const runtime = "nodejs";

/* ============================================================================
   POST /api/import/corpus-md — LA PUERTA DETERMINISTA (bloque B).

   Un .md en formato corpus/1 entra al STAGING sin que el modelo lo toque.

   ★ CERO IA, Y ESO ES LA MITAD DE LA GRACIA.
   Esta ruta no importa `extract/llm`, no construye un extractor, no llama a
   `getUserLlmKey` y NO devuelve 503 por falta de GEMINI_API_KEY. Con las claves
   de IA sin configurar —el estado por defecto de un despliegue nuevo— el usuario
   puede meter su carrera entera igual. tests/import-corpus-md.test.ts lo
   comprueba leyendo este fichero, no fiándose de este comentario.

   ★ NADA DE ATAJOS AL MASTER. Va a `staged_items` como todo lo demás. La regla no
   tiene excepciones «porque el dato es fiable»: si el usuario no lo confirma, no
   entra. Por eso existe además el modo «solo analizar».

   ★ EL INFORME PRIMERO. `{ analizar: true }` parsea, cuenta y devuelve el informe
   SIN ESCRIBIR NADA. El usuario ve «Leí 5 roles, 33 viñetas…» y entonces decide.

   ★ EL FICHERO ENTERO SE GUARDA. `raw_text` es el .md literal, así que las líneas
   que el parser no supo encajar (y que devuelve como avisos con su número de
   línea) siguen existiendo en la base aunque no sean un item. Nada del usuario
   desaparece en silencio.

   ★ EL TEXTO VIAJA EN EL CUERPO, Y ESE ES EL CAMINO POR DEFECTO.
   Un .md de carrera pesa unos pocos KB y CABE de sobra en el límite de 4,5 MB
   del cuerpo de un Route Handler. Subirlo a Storage para volver a bajarlo era un
   rodeo con dos puntos de fallo (permisos del bucket, ruta mal formada) y cero
   ventajas — y uno de esos fallos se le echaba encima al usuario con un «el
   fichero está vacío» que era mentira. La vía por Storage se conserva como
   RESPALDO (quien ya subió el archivo puede mandar solo la ruta), pero el camino
   normal es el directo.

   Cuerpo (se aceptan los DOS juegos de nombres: la pantalla habla español y la
   ruta nació en inglés; una de las dos tenía que ceder y ceden las dos):
     { text | texto }                el .md pegado / leído por el navegador
     { path, name? | nombre? }       referencia a Storage (bucket 'sources'), como /api/sources
     { analizar?: true }             solo informe, no escribe
     { confirmar?: false }           lo mismo, dicho como lo dice ImportarScreen
     { lang?: 'es'|'en'|… }          idioma de los items que no lo declaren
   ============================================================================ */

/** Un .md de carrera no llega a 200 KB. Se RECHAZA por encima de esto en vez de
 *  recortar: truncar en silencio es perder datos del usuario y decirle que bien. */
const MAX_BYTES = 2 * 1024 * 1024;

interface Cuerpo {
  text?: unknown;
  texto?: unknown;
  path?: unknown;
  name?: unknown;
  nombre?: unknown;
  analizar?: unknown;
  confirmar?: unknown;
  lang?: unknown;
}

/** El primer valor que sea una cadena con algo dentro. `""` para «no vino». */
const primeraCadena = (...vs: unknown[]): string => {
  for (const v of vs) if (typeof v === "string" && v) return v;
  return "";
};

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * El enum `item_kind` gana 'reference' en la migración 0004, que en este proyecto
 * se aplica A MANO. Si falta, Postgres rechaza el INSERT con un mensaje que no le
 * dice nada a nadie: se traduce a qué hacer. Degradar honesto > 500 críptico.
 */
function pista(error: string): string {
  if (/invalid input value for enum item_kind/i.test(error)) {
    return `${error} — falta aplicar la migración 0004 (valor 'reference' del enum item_kind) en Supabase.`;
  }
  return error;
}

export async function POST(req: Request) {
  let body: Cuerpo;
  try {
    body = (await req.json()) as Cuerpo;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  /* «solo analizar» se dice de dos maneras y las dos valen. Ojo con `confirmar`:
     solo su AUSENCIA de valor booleano es neutra — `confirmar:false` es una
     petición explícita de informe, y confundirla con «no vino» era escribir en
     la base cuando el usuario solo quería mirar. */
  const soloAnalizar = body.analizar === true || body.confirmar === false;
  const lang = typeof body.lang === "string" && body.lang.trim() ? body.lang.trim() : "es";
  const path = typeof body.path === "string" ? body.path : "";
  let nombre = primeraCadena(body.name, body.nombre).trim();
  let texto = primeraCadena(body.text, body.texto);
  let storagePath: string | null = null;

  try {
    /* ── El fichero: por defecto el CUERPO; Storage solo como respaldo ────────
       Los tres desenlaces de la vía de Storage eran indistinguibles y los tres
       decían «el fichero está vacío», que es acusar al usuario de algo que casi
       nunca hizo. Ahora cada uno dice lo suyo y apunta a quien puede arreglarlo. */
    if (!texto && path) {
      if (!isOwnedPath(path, user.id)) {
        return NextResponse.json({ error: "Ruta no autorizada." }, { status: 403 });
      }
      const { data: blob, error } = await sb.storage.from("sources").download(path);

      // (1) La descarga falló o no vino blob: infraestructura, no el archivo.
      if (error || !blob) {
        return NextResponse.json(
          {
            error:
              "No se pudo leer el archivo del almacenamiento. Reintenta la subida. " +
              `(ruta «${path}»${error?.message ? `, ${error.message}` : ", sin contenido"})`,
          },
          { status: 502 },
        );
      }

      texto = await blob.text();
      storagePath = path;
      if (!nombre) nombre = path.split("/").pop() ?? "corpus.md";

      // (2) La subida dijo OK y lo que baja no tiene texto: se registran la ruta
      //     y el tamaño que Storage dice tener. Con `size > 0` el archivo está
      //     ahí y el problema es de la ruta o de los permisos del bucket, no del
      //     documento; con `size === 0` lo que se subió fueron cero bytes.
      if (!texto.trim()) {
        const bytes = typeof blob.size === "number" ? blob.size : -1;
        return NextResponse.json(
          {
            error:
              bytes > 0
                ? `El archivo bajó sin texto legible desde el almacenamiento (ruta «${path}», ${bytes} bytes). ` +
                  "El archivo está ahí: el problema es la ruta o los permisos del bucket. Reintenta la subida."
                : `Lo que se subió al almacenamiento tiene 0 bytes (ruta «${path}»). ` +
                  "La subida no llegó a completarse: vuelve a elegir el archivo.",
          },
          { status: 502 },
        );
      }
    }

    // (3) Y este es el único caso en que la culpa SÍ es del fichero: llegó por el
    //     cuerpo (o no llegó nada) y está vacío de verdad.
    if (!texto.trim()) {
      return NextResponse.json(
        { error: "El fichero está vacío. Descarga la plantilla desde «Mi master» y escribe sobre ella." },
        { status: 400 },
      );
    }
    if (texto.length > MAX_BYTES) {
      return NextResponse.json(
        {
          error:
            `El fichero pesa ${Math.round(texto.length / 1024)} KB y el tope son ${MAX_BYTES / 1024} KB. ` +
            "No se recorta: pártelo en dos y súbelos por separado, así no se pierde nada.",
        },
        { status: 413 },
      );
    }
    if (!nombre) nombre = "corpus.md";

    // ── PARSEO DETERMINISTA (bloque A). Ni una llamada al modelo. ──────────────
    const parece = pareceCorpusMd(texto) === true;
    const { rows, informe } = analizarCorpusMd(parsearCorpusMd(texto), { etiqueta: nombre, lang });

    if (!rows.length) {
      // Sin items no hay nada que confirmar. Se explica POR QUÉ y adónde ir, en
      // vez de crear una fuente vacía que ensucie la pantalla de Fuentes.
      return NextResponse.json(
        {
          informe,
          staged: 0,
          sourceId: null,
          error: parece
            ? "El fichero tiene el formato corpus/1 pero no encontré ningún item dentro."
            : "Esto no parece un fichero corpus/1. Si es un CV normal, súbelo por «Fuentes» (lo lee la IA); " +
              "si querías el formato, descarga la plantilla desde «Mi master».",
        },
        { status: 422 },
      );
    }

    // ── Lo que YA está en el master se MARCA (no se descarta ni se re-propone a
    //    ciegas). Es lectura pura: vale igual para el modo «solo analizar». ──────
    const master = await getMasterItems(sb, user.id);
    const dupMap = master.length
      ? matchStagedAgainstMaster(
          master.map((m) => ({ id: m.id, kind: m.kind, data: m.data })),
          rows,
        )
      : new Map<string, string>();
    informe.yaEnMaster = dupMap.size;

    if (!parece) {
      informe.avisos.push({
        linea: null,
        es: "El fichero no declara la cabecera «formato: corpus/1». Se leyó igualmente y esto es lo que salió; revísalo con calma antes de aceptar.",
        en: 'The file does not declare the "formato: corpus/1" header. It was read anyway and this is the result; review it carefully before accepting.',
      });
    }

    // La frase lleva DENTRO los dos números que se acaban de conocer (cuántos ya
    // están en el master y cuántos avisos hay), así que se rehace al final. Si no,
    // la pantalla enseñaría un resumen que no cuadra con la lista de abajo.
    informe.frase = fraseInforme(informe);

    // ── MODO «SOLO ANALIZAR»: se devuelve el informe y NO SE ESCRIBE NADA ──────
    if (soloAnalizar) {
      return NextResponse.json({
        analizado: true,
        sourceId: null,
        sourceIds: [],
        staged: 0,
        counts: informe.counts,
        informe,
        warnings: informe.avisos.map((a) => a.es),
      });
    }

    // ── A STAGING. `kind:'paste'` porque el enum source_kind no tiene 'text' (un
    //    .md es texto plano que llegó como archivo); el fichero real queda
    //    identificado por original_name + storage_path, y raw_text lo guarda ENTERO.
    const { sourceId, staged } = await persistSource(
      sb,
      user.id,
      {
        kind: "paste",
        originalName: nombre,
        storagePath,
        rawText: texto,
        status: "extracted",
      },
      rows,
      dupMap,
    );

    return NextResponse.json({
      analizado: false,
      sourceId,
      sourceIds: [sourceId],
      staged,
      counts: informe.counts,
      informe,
      warnings: informe.avisos.map((a) => a.es),
    });
  } catch (e) {
    return NextResponse.json({ error: pista(msg(e)) || "Error al leer el fichero." }, { status: 500 });
  }
}
