import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runImport } from "@/lib/extract/pipeline";
import { makeGeminiExtractor, geminiApiKey } from "@/lib/extract/llm";
import { fetchGithubUser } from "@/lib/extract/github";
import { fetchViaJina } from "@/lib/extract/web";
import { ensureMaster, persistImport } from "@/lib/db/queries";
import { registrarIngesta } from "@/lib/db/telemetria";
import { extractFile, extractDepsFor, type FileKind } from "@/lib/extract/files";
import { sourceKindFor, causaSinItems, nuevoId } from "@/lib/db/sources";
import { getUserLlmKey } from "@/lib/account/byok";

// Esperar el I/O del LLM no cuenta como Active CPU en Fluid Compute → timeout
// generoso barato. Hobby permite 300 s (02 §1).
export const runtime = "nodejs";
export const maxDuration = 300;

/** Referencia a un archivo YA subido a Storage por el navegador (bucket 'sources'). */
interface FileRef {
  path?: string;
  name?: string;
  kind?: string;
}

const FILE_KINDS: readonly string[] = ["pdf", "docx", "image", "text"];
const asKind = (k: unknown): FileKind | null =>
  typeof k === "string" && FILE_KINDS.includes(k) ? (k as FileKind) : null;

/**
 * ⚠⚠ RUTA HEREDADA — LA PANTALLA DE IMPORTAR YA NO LA USA ⚠⚠
 *
 * El camino vivo es `POST /api/import/job` (trabajo durable, una fuente = una
 * fila = sus propios items). Esta ruta sigue aquí porque puede haber clientes
 * apuntándole, y por eso el fallo de ATRIBUCIÓN que motivó el bloque A SE
 * ARREGLÓ TAMBIÉN AQUÍ, no solo en el motor nuevo: una ruta abandonada que
 * sigue respondiendo es una ruta que sigue mintiendo. Sigue concatenando las
 * fuentes en un solo texto para extraer (esa es la diferencia de diseño con el
 * motor), pero ya NO cuelga todo de una fila kind='paste': cada item vuelve del
 * pipeline con la fuente de la que salió y se persiste en la fila de ESE
 * documento (ver los pasos 3 y 4). El «extraída · 0 items» de las 14 capturas
 * salía de aquí; de aquí se ha quitado.
 *
 * Lo que esta ruta NO arregla, y por lo que sigue siendo la heredada: al hacer
 * una sola llamada por petición no sobrevive a una ingesta larga — si se pasa
 * del maxDuration se pierde el trabajo entero. Antes de volver a cablearla a
 * una interfaz, léete `src/app/api/import/_motor/motor.ts`.
 *
 * ── documentación original ──────────────────────────────────────────────────
 * "Pega lo que tengas" (§3). Autentica → descarga y extrae los archivos de
 * Storage (los archivos NUNCA pasan por el body: límite 4,5 MB de Vercel) →
 * corre el pipeline (Gemini + GitHub API + Jina) sobre texto + archivos →
 * persiste en staged_items y registra cada archivo como su propia
 * ingestion_source (procedencia). NADA entra al master aquí (§4.1).
 *
 * ★ EL ORDEN IMPORTA, Y ANTES ESTABA AL REVÉS. Se creaba la fuente de texto
 *   pegado, se le colgaban TODOS los items, y solo DESPUÉS se insertaba cada
 *   archivo como su propia fila… cuando ya no quedaba nada que colgarle. De ahí
 *   las 14 capturas diciendo «extraída · 0 ítems» con su transcripción entera
 *   guardada al lado. Ahora las fuentes de archivo se crean ANTES (con id propio
 *   generado aquí, sin depender del orden de vuelta de un insert múltiple) y
 *   cada item va a la fila del documento del que salió.
 */
export async function POST(req: Request) {
  let body: { text?: string; files?: FileRef[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const fileRefs = Array.isArray(body.files) ? body.files : [];

  if (text.length < 20 && fileRefs.length === 0) {
    return NextResponse.json({ error: "Pega un poco más de texto (al menos un par de frases)." }, { status: 400 });
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  // BYOK: la clave del usuario (descifrada, solo servidor) o la del servidor.
  const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
  if (!byok && !geminiApiKey()) {
    return NextResponse.json({ error: "Falta configurar la clave de IA (BYOK o GEMINI_API_KEY del servidor)." }, { status: 503 });
  }

  // ── 1 · Descargar de Storage + extraer texto por archivo ────────────────────
  /** Una fuente de archivo de esta ingesta, con su id decidido AQUÍ. */
  interface FuenteArchivo {
    /** id de la ingestion_source, generado antes de insertar (ver nuevoId) */
    id: string;
    kind: FileKind;
    name: string;
    /** etiqueta ÚNICA con que el pipeline atribuye sus items (ver más abajo) */
    etiqueta: string;
    path: string;
    rawText: string;
    isTranscription: boolean;
    pageCount?: number;
    /** aviso honesto de la extracción (extract/files). null si no hubo. */
    aviso: string | null;
    /** mensaje de la excepción si la lectura REVENTÓ. null si no reventó. */
    fallo: string | null;
  }

  const forPipeline: { label: string; text: string }[] = [];
  const fileSources: FuenteArchivo[] = [];
  const warnings: string[] = [];

  /* Dos capturas con el mismo nombre («captura.png» descargada dos veces) darían
     la MISMA etiqueta, y entonces el mapa etiqueta→fuente perdería una de las
     dos: sus items se colgarían de la otra. La etiqueta se hace única aquí
     mismo; `original_name` conserva el nombre real. */
  const usadas = new Set<string>();
  const etiquetaUnica = (name: string): string => {
    if (!usadas.has(name)) {
      usadas.add(name);
      return name;
    }
    for (let i = 2; ; i++) {
      const alt = `${name} (${i})`;
      if (!usadas.has(alt)) {
        usadas.add(alt);
        return alt;
      }
    }
  };

  for (const ref of fileRefs) {
    const kind = asKind(ref.kind);
    const path = typeof ref.path === "string" ? ref.path : "";
    const name = (typeof ref.name === "string" && ref.name) || (path.split("/").pop() ?? "archivo");

    if (!kind || !path) {
      warnings.push(`«${name}»: referencia de archivo inválida (tipo o ruta).`);
      continue;
    }
    // Defensa en profundidad: el path debe ser del usuario (la RLS ya lo exige).
    if (!path.startsWith(`${user.id}/`)) {
      warnings.push(`«${name}»: ruta no autorizada.`);
      continue;
    }

    const etiqueta = etiquetaUnica(name);
    try {
      const { data: blob, error: dlErr } = await sb.storage.from("sources").download(path);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "no se pudo descargar de Storage");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mime = blob.type || undefined;

      const ex = await extractFile({ kind, bytes, mime, name }, extractDepsFor(byok));
      if (ex.text.trim()) forPipeline.push({ label: etiqueta, text: ex.text });
      if (ex.warning) warnings.push(`«${name}»: ${ex.warning}`);

      fileSources.push({
        id: nuevoId(),
        kind,
        name,
        etiqueta,
        path,
        rawText: ex.text,
        isTranscription: ex.isTranscription,
        pageCount: ex.pageCount,
        aviso: ex.warning ?? null,
        fallo: null,
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : "error";
      warnings.push(`«${name}»: no se pudo procesar (${m}).`);
      fileSources.push({
        id: nuevoId(),
        kind,
        name,
        etiqueta,
        path,
        rawText: "",
        isTranscription: kind === "image",
        aviso: null,
        fallo: m,
      });
    }
  }

  // Sin NADA legible (ni texto suficiente ni archivos con contenido): honestidad.
  const hasContent = text.length >= 20 || forPipeline.some((f) => f.text.trim());
  if (!hasContent) {
    const detail = warnings.length ? " " + warnings.join(" ") : "";
    return NextResponse.json(
      { error: "No pudimos leer texto de lo que subiste." + detail },
      { status: 422 },
    );
  }

  // ── 2 · Pipeline: verifica la evidencia sobre texto + transcripciones ───────
  try {
    const result = await runImport(
      { pastedText: text, files: forPipeline },
      { extract: makeGeminiExtractor(byok), fetchGithubUser, fetchWeb: fetchViaJina },
    );
    // Avisos de la LECTURA (p. ej. documento tan largo que no cupo entero): van a
    // la UI junto a los de cada archivo. Nada se descarta en silencio.
    warnings.push(...result.warnings);
    await ensureMaster(sb, user.id);

    // ── 3 · Cada archivo, como su propia ingestion_source — ANTES de los items ─
    // kind pdf/docx/image, raw_text y raw_text_is_transcription (imagen/escaneado).
    // El id de cada fila se decide aquí (nuevoId), así que el mapa etiqueta→fuente
    // se conoce sin depender del orden en que la base devuelva el insert.
    const fuentesPorEtiqueta = new Map<string, string>();
    if (fileSources.length) {
      const { error: fsErr } = await sb.from("ingestion_sources").insert(
        fileSources.map((f) => ({
          id: f.id,
          user_id: user.id,
          // 'text' no existe en el enum de la BD: un .md/.txt se guarda como
          // 'paste' (que es lo que es) sin perder original_name ni storage_path.
          kind: sourceKindFor(f.kind),
          original_name: f.name,
          storage_path: f.path,
          // El estado definitivo se decide en el paso 5, cuando ya se sabe si
          // esta fuente produjo items. Aquí solo se registra si se pudo leer.
          status: f.fallo || !f.rawText.trim() ? "failed" : "extracted",
          page_count: f.pageCount ?? null,
          raw_text: f.rawText || null,
          raw_text_is_transcription: f.isTranscription,
          error: f.fallo ?? f.aviso ?? null,
        })),
      );
      if (fsErr) {
        // Sin las filas de archivo no hay a qué colgar sus items: se dice, y los
        // items caen en la fuente principal en vez de perderse.
        warnings.push(`No se pudieron registrar las fuentes de archivo: ${fsErr.message}`);
      } else {
        for (const f of fileSources) fuentesPorEtiqueta.set(f.etiqueta, f.id);
      }
    }

    // ── 4 · Los items, cada uno a la fuente de la que SALIÓ ───────────────────
    // La fila kind='paste' solo se crea si de verdad hubo texto pegado: crearla
    // vacía en un volcado que era solo archivos sería inventar una fuente (y
    // pintar en la pantalla una tarjeta que no corresponde a nada que el usuario
    // subiera). Sin texto pegado, la fuente principal es el primer archivo.
    // Y si la principal tiene que ser un archivo, se elige uno QUE APORTARA
    // TEXTO: colgar lo no atribuido de una fuente que no se pudo leer sería
    // firmar con el nombre de un documento que no dijo nada.
    const conFila = fileSources.filter((f) => fuentesPorEtiqueta.has(f.etiqueta));
    const principalDeArchivo = text
      ? undefined
      : (conFila.find((f) => f.rawText.trim()) ?? conFila[0])?.id;
    const { sourceId, staged, itemsPorFuente } = await persistImport(sb, user.id, result, {
      fuentesPorEtiqueta,
      sourceIdPrincipal: principalDeArchivo,
      // La fila de texto pegado guarda el texto COMBINADO: es lo que el modelo
      // leyó de verdad, y es contra eso contra lo que se verificó la evidencia
      // de los items que no se pudieron atribuir a un archivo concreto.
      rawTextPrincipal: result.rawText,
    });

    // ── 5 · ★ NINGUNA FUENTE VACÍA EN VERDE ──────────────────────────────────
    // Toda fuente de archivo que acabe con CERO items dice POR QUÉ, con la causa
    // real (no se pudo leer / sin texto legible / se leyó y no había nada
    // extraíble). El motivo va a la columna `error`, que la tarjeta ya pinta.
    for (const f of fileSources) {
      const id = fuentesPorEtiqueta.get(f.etiqueta);
      if (!id) continue; // su fila no llegó a existir; ya se avisó arriba
      const vacia = causaSinItems({
        items: itemsPorFuente[id] ?? 0,
        caracteres: f.rawText.trim().length,
        aviso: f.aviso,
        fallo: f.fallo,
      });
      if (!vacia) continue;
      const { error: upErr } = await sb
        .from("ingestion_sources")
        .update({ status: vacia.status, error: vacia.motivo })
        .eq("id", id)
        .eq("user_id", user.id);
      if (upErr) warnings.push(`«${f.name}»: no se pudo guardar el motivo del cero (${upErr.message}).`);
      else warnings.push(`«${f.name}»: ${vacia.motivo}`);
    }

    // Y la fila de texto pegado juega con las mismas reglas: si no se le atribuyó
    // ni un item, la tarjeta lo explica en vez de decir «extraída». (Cuando la
    // principal ES un archivo, ya pasó por el bucle de arriba: no se repite.)
    if (!principalDeArchivo) {
      const vaciaPrincipal = causaSinItems({
        items: itemsPorFuente[sourceId] ?? 0,
        caracteres: text.trim().length,
        aviso: null,
        fallo: null,
      });
      if (vaciaPrincipal) {
        await sb
          .from("ingestion_sources")
          .update({ status: vaciaPrincipal.status, error: vaciaPrincipal.motivo })
          .eq("id", sourceId)
          .eq("user_id", user.id);
        warnings.push(vaciaPrincipal.motivo);
      }
    }

    // ── 6 · Telemetría: el consumo, que es un hecho, se guarda y se muestra ──
    // Se escribe AQUÍ y no antes porque `ingestion_events.source_id` es NOT NULL
    // y la fuente acaba de nacer en persistImport (ver telemetria.ts). Si falla,
    // sube como aviso: la contabilidad no puede tumbar una ingesta buena.
    if (result.consumo) {
      const err = await registrarIngesta(sb, user.id, sourceId, {
        consumo: result.consumo,
        contexto: result.lectura?.contexto ?? [],
      });
      if (err) warnings.push(err);
    }

    return NextResponse.json({
      sourceId,
      staged,
      counts: result.counts,
      sources: result.sources,
      linkedin: result.linkedin,
      warnings,
      // El REPARTO REAL, fuente por fuente. Antes esto no se podía ni preguntar:
      // todo colgaba de una fila. Ahora la respuesta dice cuántos ítems aportó
      // cada documento — incluidos los ceros, con su motivo ya escrito arriba.
      fuentes: [
        ...(principalDeArchivo ? [] : [{ id: sourceId, nombre: "texto pegado", items: itemsPorFuente[sourceId] ?? 0 }]),
        ...fileSources.map((f) => {
          const id = fuentesPorEtiqueta.get(f.etiqueta) ?? null;
          return { id, nombre: f.name, items: id ? itemsPorFuente[id] ?? 0 : 0 };
        }),
      ],
      // El consumo y el reparto viajan a la UI. `lectura.contexto` lleva las
      // secciones que NO se mandaron al modelo, con su nombre y sus caracteres:
      // la pantalla las enseña. Ninguna sección desaparece en silencio.
      consumo: result.consumo ?? null,
      lectura: result.lectura ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al importar" }, { status: 500 });
  }
}
