import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMasterItems } from "@/lib/db/queries";
import { nombrePlantilla } from "@/lib/corpus-md-staging";
import { exportarCorpusMd, plantillaEjemplo, plantillaVacia } from "@/lib/corpus-md";

export const runtime = "nodejs";

/* ============================================================================
   GET /api/master/plantilla — el .md corpus/1, descargable. TRES variantes.

     ?v=blanco   → `plantillaVacia()`: el esqueleto con sus instrucciones.
     ?v=ejemplo  → `plantillaEjemplo()`: la misma estructura RELLENA con un
                   perfil inventado. Un ejemplo enseña más que diez líneas de
                   instrucciones: se ve cómo queda una fecha, una viñeta con
                   cifra, trece grupos de habilidades, una referencia.
     ?v=master   → TU master exportado. Es el mejor ejemplo que existe porque es
                   el tuyo, y es la mitad del round-trip: descargas, editas en tu
                   editor (con git, si quieres) y vuelves a subir por
                   /api/import/corpus-md.
     ?v=estado   → JSON {items}. NO es un fichero: es cuántos items tiene el
                   master, para que la pantalla de Importar sepa si puede ofrecer
                   la tercera opción y con qué rótulo. En el servidor cuesta la
                   MISMA lectura que /api/master (no hay un count aparte; esa
                   consulta vive en queries.ts, que es frontera de otro bloque);
                   lo que ahorra es la RESPUESTA: 105 items con su `data` entero
                   —cientos de KB— para acabar mirando un `length`.
     sin `v`     → el comportamiento de siempre: master si lo hay, esqueleto si
                   no. Los enlaces existentes siguen funcionando igual, y un `v`
                   desconocido cae aquí en vez de fallar: un parámetro que no
                   entendemos no es motivo para dejar a alguien sin su fichero.

   ⚠ `v=master` con el master VACÍO devuelve 409 y no un esqueleto. Servir otra
     cosa de la que se pide es la versión educada de mentir, y esta ruta ya
     tiene una variante para pedir el esqueleto a propósito.
   ⚠ CERO IA aquí también: es una lectura de la base y un serializador.
   ⚠ El texto de las plantillas NO vive en este fichero. Un route.ts solo puede
     exportar handlers HTTP (tests/rutas-exports.test.ts); además, el formato es
     del bloque A y tiene que ser EL MISMO que el parser sabe leer — dos copias
     del esqueleto es cómo se rompe un round-trip.
   ============================================================================ */

/**
 * El exportador es del bloque A y se programó contra su firma antes de que
 * existiera. Si acabara devolviendo `{texto}` o `{md}` en vez de un string
 * pelado, esto lo absorbe en vez de escribir "[object Object]" en el fichero que
 * el usuario se lleva. No exportada: es un ayudante de esta frontera.
 */
function comoTexto(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    for (const k of ["texto", "md", "markdown", "contenido", "text"]) {
      const s = (v as Record<string, unknown>)[k];
      if (typeof s === "string") return s;
    }
  }
  throw new Error("El exportador de corpus/1 no devolvió texto; no se descarga un fichero vacío.");
}

export async function GET(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const v = new URL(req.url).searchParams.get("v");

  try {
    // El ejemplo no toca la base: es un fichero constante. Se sirve antes de
    // consultar nada para no cobrarle una lectura al usuario por un texto fijo.
    if (v === "ejemplo") {
      return descarga(comoTexto(plantillaEjemplo()), "corpus-plantilla-ejemplo.md");
    }
    if (v === "blanco") {
      return descarga(comoTexto(plantillaVacia()), nombrePlantilla(false));
    }

    const items = await getMasterItems(sb, user.id);
    const conDatos = items.length > 0;

    if (v === "estado") {
      return NextResponse.json({ items: items.length }, { headers: { "Cache-Control": "no-store" } });
    }
    if (v === "master" && !conDatos) {
      return NextResponse.json(
        {
          error:
            "Tu master está vacío: no hay nada que exportar. Descarga la plantilla en blanco o la del ejemplo.",
        },
        { status: 409 },
      );
    }

    const md = comoTexto(conDatos ? exportarCorpusMd(items) : plantillaVacia());
    return descarga(md, nombrePlantilla(conDatos));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo generar la plantilla." },
      { status: 500 },
    );
  }
}

/**
 * La respuesta de descarga. El nombre del fichero del ejemplo se escribe aquí y
 * no en `nombrePlantilla` porque esa función es de otro bloque y solo conoce dos
 * casos (con datos / sin datos); añadirle un tercero desde aquí sería editarle
 * la frontera a alguien. Va como constante en la única llamada que la usa.
 */
function descarga(md: string, nombre: string): NextResponse {
  return new NextResponse(md, {
    status: 200,
    headers: {
      // charset explícito: el formato lleva acentos y viñetas «·» y un editor
      // que adivine la codificación devolvería un round-trip con mojibake.
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
