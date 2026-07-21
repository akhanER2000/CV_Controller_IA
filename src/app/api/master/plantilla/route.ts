import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMasterItems } from "@/lib/db/queries";
import { nombrePlantilla } from "@/lib/corpus-md-staging";
import { exportarCorpusMd, plantillaVacia } from "@/lib/corpus-md";

export const runtime = "nodejs";

/* ============================================================================
   GET /api/master/plantilla — el .md corpus/1, descargable.

   Dos casos, y la diferencia importa:
     · master VACÍO   → `plantillaVacia()`: el esqueleto con sus instrucciones.
       Una plantilla en blanco enseña el formato sin que haya que leer un manual.
     · master CON DATOS → `exportarCorpusMd(getMasterItems(…))`: TU master, el de
       verdad. Es la mitad del round-trip: descargas, editas en tu editor con git
       si quieres, y vuelves a subir por /api/import/corpus-md. Devolver el
       esqueleto vacío a alguien que ya tiene 105 items sería obligarle a
       reescribir su carrera para poder editarla.

   ⚠ CERO IA aquí también: es una lectura de la base y un serializador.
   ⚠ El texto de la plantilla NO vive en este fichero. Un route.ts solo puede
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

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  try {
    const items = await getMasterItems(sb, user.id);
    const conDatos = items.length > 0;
    const md = comoTexto(conDatos ? exportarCorpusMd(items) : plantillaVacia());

    return new NextResponse(md, {
      status: 200,
      headers: {
        // charset explícito: el formato lleva acentos y viñetas «·» y un editor
        // que adivine la codificación devolvería un round-trip con mojibake.
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombrePlantilla(conDatos)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo generar la plantilla." },
      { status: 500 },
    );
  }
}
