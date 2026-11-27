import { NextResponse } from "next/server";
import { getDocumentProxy, extractText } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { hayClaveIA } from "@/lib/ai/modelos";
import { getUserLlmKey, getUserLlmKey3 } from "@/lib/account/byok";
import { runImport } from "@/lib/extract/pipeline";
import { makeGeminiExtractor } from "@/lib/extract/llm";
import { extractFile, extractDepsFor } from "@/lib/extract/files";
import { fileKindFromName, sourceKindFor, isOwnedPath, insertStagedTwoPhase } from "@/lib/db/sources";
import { ensureMaster, getMasterItems, promoteStaged } from "@/lib/db/queries";
import { createVariant, updateVariant, setVariantPresentation } from "@/lib/db/variants";
import { registrarIngesta } from "@/lib/db/telemetria";
import {
  CAMPO_ORDEN, CAMPO_PAGINA, casarConMaster, nombreSinExtension, ordenPropio, ordenarComoElCv,
  seccionesEnOrden, textoCorto, tituloDelCv,
} from "./plan";

export const runtime = "nodejs";
export const maxDuration = 300;

/* ============================================================================
   POST /api/variants/desde-cv — «Partir de mi CV anterior» (DA-V7)
   ============================================================================
   Dos llamadas, con la revisión del usuario en medio:

   { accion:"leer", path, name } → NDJSON
       {tipo:"paso", paso:0}  leyendo     (Storage → texto, el lector de siempre)
       {tipo:"paso", paso:1}  extrayendo  (runImport, la extracción de siempre)
       {tipo:"paso", paso:2}  verificando (evidencia ya verificada por el pipeline
                                           + casado con el master + staging)
       {tipo:"revision", sourceId, titulo, nombre, items:[…], total, nuevos}
     Deja una fuente normal (kind pdf/docx) con su staging: si el usuario no sigue,
     sus items quedan en Staging como cualquier importación.

   { accion:"crear", sourceId } → JSON { variant, items, nuevos }
       Lo nuevo entra al master (promoteStaged, con su fuente y su página); lo que
       ya estaba se reusa (staged 'merged' → promoted_to). La variante lleva
       EXACTAMENTE esos items, en el orden del CV, con su orden de secciones y su
       título. La fuente queda enlazada a la variante (evento desde-cv.variante).

   ⚠ Solo el texto del CV: no se siguen enlaces (sin GitHub ni web). Un portafolio
     enlazado traería items que ese CV no tenía.
   ============================================================================ */

const EVENTO_VARIANTE = "desde-cv.variante";

type SB = Awaited<ReturnType<typeof createClient>>;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function POST(req: Request) {
  let body: { accion?: string; path?: string; name?: string; sourceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  if (body.accion === "crear") {
    const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
    if (!sourceId) return NextResponse.json({ error: "Falta sourceId." }, { status: 400 });
    try {
      return NextResponse.json(await crear(sb, user.id, sourceId));
    } catch (e) {
      return NextResponse.json({ error: msg(e) }, { status: 500 });
    }
  }

  if (body.accion !== "leer") return NextResponse.json({ error: "accion: leer | crear" }, { status: 400 });

  const path = typeof body.path === "string" ? body.path : "";
  const name = (typeof body.name === "string" && body.name) || path.split("/").pop() || "cv";
  const kind = fileKindFromName(name, undefined);
  if (kind !== "pdf" && kind !== "docx") {
    return NextResponse.json({ error: "Sube tu CV en PDF o DOCX." }, { status: 400 });
  }
  if (!path || !isOwnedPath(path, user.id)) {
    return NextResponse.json({ error: "Ruta de archivo no autorizada." }, { status: 403 });
  }
  const byok = (await getUserLlmKey(sb, user.id)) ?? undefined;
  const byok3 = (await getUserLlmKey3(sb, user.id)) ?? undefined;
  if (!hayClaveIA(byok, byok3)) {
    return NextResponse.json(
      { error: "Falta configurar una clave de IA (BYOK, ANTHROPIC_API_KEY o GEMINI_API_KEY del servidor)." },
      { status: 503 },
    );
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const enviar = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        /* ── 0 · leyendo ─────────────────────────────────────────────────── */
        enviar({ tipo: "paso", paso: 0 });
        const { data: blob, error: dErr } = await sb.storage.from("sources").download(path);
        if (dErr || !blob) throw new Error(dErr?.message ?? "No se pudo descargar el archivo.");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        // Copia aparte: el lector de PDF puede transferir (y vaciar) el buffer que recibe.
        const copia = bytes.slice();
        const lec = await extractFile({ kind, bytes, name }, extractDepsFor(byok, byok3));
        const texto = lec.text.trim();
        if (!texto) throw new Error(lec.warning ?? "No se pudo leer texto de este archivo.");
        // Las páginas, para la procedencia «página N». Solo PDF con capa de texto:
        // una transcripción no conserva los cortes de página.
        let paginas: string[] | undefined;
        if (kind === "pdf" && !lec.isTranscription) {
          try {
            const pdf = await getDocumentProxy(copia);
            const r = await extractText(pdf, { mergePages: false });
            paginas = Array.isArray(r.text) ? r.text : [String(r.text)];
          } catch {
            paginas = undefined; // sin páginas: la procedencia va sin número, no con uno inventado
          }
        }

        /* ── 1 · extrayendo ──────────────────────────────────────────────── */
        enviar({ tipo: "paso", paso: 1 });
        const res = await runImport(
          { pastedText: texto, files: [] },
          { extract: makeGeminiExtractor(byok, { claveAnthropic: byok3 }) },
        );
        if (!res.staged.length) throw new Error("No encontramos items en este CV.");

        /* ── 2 · verificando ─────────────────────────────────────────────── */
        enviar({ tipo: "paso", paso: 2 });
        await ensureMaster(sb, user.id);
        const { data: lote, error: lErr } = await sb
          .from("ingestion_batches")
          .insert({ user_id: user.id })
          .select("id")
          .single();
        if (lErr || !lote) throw new Error(`No se pudo crear el lote: ${lErr?.message ?? "sin id"}`);
        const { data: fuente, error: fErr } = await sb
          .from("ingestion_sources")
          .insert({
            user_id: user.id,
            batch_id: lote.id,
            kind: sourceKindFor(kind),
            original_name: name,
            storage_path: path,
            status: "parsing",
            raw_text: texto,
            raw_text_is_transcription: lec.isTranscription,
            page_count: lec.pageCount ?? null,
            error: lec.warning ?? null,
          })
          .select("id")
          .single();
        if (fErr || !fuente) throw new Error(`No se pudo registrar la fuente: ${fErr?.message ?? "sin id"}`);
        const sourceId = fuente.id as string;

        const ordenadas = ordenarComoElCv(res.staged, texto, paginas);
        const filas = ordenadas.map(({ fila, orden, pagina }) => ({
          ...fila,
          data: { ...fila.data, [CAMPO_ORDEN]: orden, ...(pagina ? { [CAMPO_PAGINA]: pagina } : {}) },
        }));
        const master = await getMasterItems(sb, user.id);
        const yaEsta = casarConMaster(master, filas);
        await insertStagedTwoPhase(sb, user.id, sourceId, filas, yaEsta);
        await sb.from("ingestion_sources").update({ status: "extracted" }).eq("id", sourceId).eq("user_id", user.id);
        if (res.consumo) {
          await registrarIngesta(sb, user.id, sourceId, { consumo: res.consumo, contexto: res.lectura?.contexto ?? [] });
        }

        const items = ordenadas.map(({ fila, pagina }) => ({
          kind: fila.kind,
          texto: textoCorto(fila.kind, fila.data),
          pagina,
          ya: yaEsta.has(fila.key),
          verificado: fila.evidenceVerified,
        }));
        enviar({
          tipo: "revision",
          sourceId,
          titulo: tituloDelCv(filas),
          nombre: name,
          paginas: lec.pageCount ?? null,
          items,
          total: items.length,
          nuevos: items.filter((i) => !i.ya).length,
        });
      } catch (e) {
        enviar({ tipo: "error", error: msg(e) });
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform" },
  });
}

interface FilaStaged {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  status: string;
  duplicate_of: string | null;
  promoted_to: string | null;
  parent_staged_id: string | null;
}

/**
 * Crea la variante desde el staging de la fuente. Idempotente ante un reintento:
 * lo que ya se promovió o se reusó lleva promoted_to y no se vuelve a crear.
 */
async function crear(sb: SB, userId: string, sourceId: string) {
  const { data: src, error: sErr } = await sb
    .from("ingestion_sources")
    .select("id,original_name")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!src) throw new Error("Fuente no encontrada.");

  const { data, error } = await sb
    .from("staged_items")
    .select("id,kind,data,status,duplicate_of,promoted_to,parent_staged_id")
    .eq("source_id", sourceId)
    .eq("user_id", userId)
    .neq("status", "rejected");
  if (error) throw new Error(error.message);
  const ordenDe = (f: FilaStaged) => {
    const o = Number(f.data?.[CAMPO_ORDEN]);
    return Number.isFinite(o) ? o : Number.MAX_SAFE_INTEGER;
  };
  const filas = ((data ?? []) as FilaStaged[]).sort((a, b) => ordenDe(a) - ordenDe(b));
  if (!filas.length) throw new Error("Esta lectura ya no tiene items que usar.");

  // Lo que el casado dio por «ya está» se comprueba ANTES de reusarlo: pudo
  // borrarse del master entre la lectura y este clic.
  const dupIds = [...new Set(filas.map((f) => f.duplicate_of).filter((x): x is string => !!x))];
  const vivos = new Set<string>();
  if (dupIds.length) {
    const { data: ex, error: exErr } = await sb.from("profile_items").select("id").eq("user_id", userId).in("id", dupIds);
    if (exErr) throw new Error(exErr.message);
    for (const r of ex ?? []) vivos.add(r.id as string);
  }

  const itemDe = new Map<string, string>();
  let nuevos = 0;
  // Dos pasadas: roles y demás primero, viñetas después (la viñeta necesita el
  // promoted_to de su rol, sea nuevo o reusado).
  const pasada = async (lista: FilaStaged[]) => {
    for (const f of lista) {
      if (f.promoted_to) {
        itemDe.set(f.id, f.promoted_to);
        continue;
      }
      if (f.duplicate_of && vivos.has(f.duplicate_of)) {
        const { error: mErr } = await sb
          .from("staged_items")
          .update({ status: "merged", promoted_to: f.duplicate_of })
          .eq("id", f.id)
          .eq("user_id", userId);
        if (mErr) throw new Error(mErr.message);
        itemDe.set(f.id, f.duplicate_of);
        continue;
      }
      const id = await promoteStaged(sb, userId, f.id);
      nuevos += 1;
      const pagina = Number(f.data?.[CAMPO_PAGINA]);
      if (Number.isInteger(pagina) && pagina > 0) {
        await sb.from("profile_items").update({ evidence_page: pagina }).eq("id", id).eq("user_id", userId);
      }
      itemDe.set(f.id, id);
    }
  };
  await pasada(filas.filter((f) => f.kind !== "bullet"));
  await pasada(filas.filter((f) => f.kind === "bullet"));

  const filaBasics = filas.find((f) => f.kind === "basics");
  const titulo = String(filaBasics?.data?.label ?? "").trim();
  const nombre = titulo || nombreSinExtension(String(src.original_name ?? "")) || "CV anterior";
  const variant = await createVariant(sb, userId, nombre);
  if (titulo) await updateVariant(sb, userId, variant.id, { target_title: titulo });

  // Los items, en el orden del CV y sin repetir (dos filas pueden caer en el mismo item del master).
  const ids: string[] = [];
  for (const f of filas) {
    const id = itemDe.get(f.id);
    if (id && !ids.includes(id)) ids.push(id);
  }
  if (ids.length) {
    const { error: vErr } = await sb
      .from("variant_items")
      .insert(ids.map((item_id, i) => ({ variant_id: variant.id, user_id: userId, item_id, visible: true, sort_order: i })));
    if (vErr) throw new Error(vErr.message);
  }

  // El orden de secciones vive en el override del basics de la variante: solo se
  // guarda si el CV traía cabecera (sin ella, guardarlo sembraría un basics vacío).
  const secciones = seccionesEnOrden(filas.map((f) => f.kind));
  if (filaBasics && itemDe.has(filaBasics.id) && ordenPropio(secciones)) await setVariantPresentation(sb, userId, variant.id, { sectionOrder: secciones });

  // La fuente, enlazada a la variante que salió de ella.
  await sb
    .from("ingestion_events")
    .insert({ source_id: sourceId, user_id: userId, message: EVENTO_VARIANTE, payload: { variantId: variant.id } });
  await sb.from("ingestion_sources").update({ status: "reviewed" }).eq("id", sourceId).eq("user_id", userId);

  return {
    variant: { id: variant.id, name: nombre, target_title: titulo || null },
    items: ids.length,
    nuevos,
  };
}
