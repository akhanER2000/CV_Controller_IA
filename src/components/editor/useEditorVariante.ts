// Sin "use client": solo lo importa la pantalla del editor (ya cliente).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBoot } from "@/lib/corpus/runtime";
import { useT } from "@/lib/i18n";
import { supabaseEnabled } from "@/lib/supabase/config";
import {
  normalizeLinks,
  linkUrl,
  linkLabel,
  mergePresentationOverride,
  normalizeSectionOrder,
  documentSections,
  metricsOf,
  referencesOptIn,
  SECTION_ORDER_FIELD,
  type PresentationPatch,
  type ReferenceFields,
} from "@/lib/cv/resume";
import { getTemplate, resolveMetrics, PINNED_LAST_SECTION, type SectionId } from "@/lib/cv/templates";
// Solo la función PURA de sugerencia y su tipo (db/references.ts importa SupabaseClient
// con `import type`): nada de servidor entra al bundle del navegador.
import { suggestReferences, type ReferenceView } from "@/lib/db/references";
import { recommendTemplates, type MasterSummary } from "@/lib/cv/recommend";
import { docHashFromSig } from "@/components/TemplateGallery";
import {
  contarPendientes,
  estadoDoc,
  huecosPorItem,
  propuestasEnLinea,
  siguienteIndice,
  type AutofitInfo,
  type Fit,
  type FitAcortar,
  type FitFalta,
  type FitMark,
  type FitQuitar,
  type FitTipoFalta,
  type FitReordenar,
  type PropEnLinea,
} from "@/components/flujo-cv";
import type { SeccionNav } from "./NavSecciones";
import { accionDeTecla } from "./atajos";
import { archivoAOriginal, leerEncuadre, type Encuadre } from "./encuadre";
import { aplicarReglasAlDocumento, estadoDeReglas, obtenerReglas, type Reglas } from "@/lib/cv/reglas";
import { textoDeItem } from "@/lib/cv/ajuste";
import { PV_ANCHO_DEF, alternarCompleto, alternarOculto, limitarAncho, useVistaPrevia } from "./vista-previa";
import {
  TEMPLATES,
  JSON_HEADERS,
  LIB_TITLE_KEY,
  S,
  bySort,
  buildEditorResumeData,
  buildFallback,
  editableField,
  libSectionOfKind,
  libTextOf,
  normalizeIncoming,
  pdfBlobFromBase64,
  pickDefaultQrLink,
  planBiblioteca,
  readApiError,
  reason,
  type FiltroLib,
  type LibSectionId,
  type MasterRow,
  type Mode,
  type MotorFaltas,
  type Objetivo,
  type VItem,
  type VMeta,
  type View,
} from "./modelo";

/* ============================================================================
   EL ESTADO DEL EDITOR DE VARIANTE — un hook, sin JSX.
   Todo lo que el editor sabe y hace: la carga (GET /api/variants/[id]), cada
   manejador contra el contrato (POST/DELETE/PATCH …/items, PATCH la variante,
   POST /ajustar, POST /api/cv), el preview que ES el PDF, la propuesta de
   ajuste repartida y los atajos. Los componentes de src/components/editor/ solo
   pintan lo que esto devuelve. Los manejadores y los cuerpos que viajan son los
   MISMOS de antes del rediseño (movidos, no reescritos): tests/e2e/flujo-cv.spec
   compara sus variant_items y la huella del PDF con la línea base.
   ============================================================================ */

/** El patch de presentación + el encuadre de la foto (original y parámetros), que
 *  guarda la ruta de la variante junto al resto del override de basics. */
export type PatchPresentacion = PresentationPatch & { photoEncuadre?: ({ src: string } & Encuadre) | null };

/** El mismo merge que el servidor para el encuadre: quitar la foto quita también su original. */
function conEncuadre(ov: Record<string, unknown>, patch: PatchPresentacion): Record<string, unknown> {
  const next = { ...ov };
  if (patch.photo === "" || patch.photoEncuadre === null) delete next.photoEncuadre;
  else if (patch.photoEncuadre) next.photoEncuadre = patch.photoEncuadre;
  return next;
}

/** Lo que la vista previa está rehaciendo y por qué (para el Progreso de la barra). */
export type MotivoPv = "afinar" | "diseno";

export function useEditorVariante(variantId: string) {
  const t = useT();
  const paginasTxt = (n: number) =>
    n === 1 ? t("editor.objOne") : t("editor.objMany").replace("{n}", String(n));
  const router = useRouter();
  const [fb] = useState(() => (supabaseEnabled ? null : buildFallback(variantId)));
  const [master, setMaster] = useState<MasterRow[]>(() => fb?.master ?? []);
  const [items, setItems] = useState<VItem[]>(() => fb?.items ?? []);
  const [meta, setMeta] = useState<VMeta | null>(() => fb?.meta ?? null);
  const [targetTitle, setTargetTitle] = useState<string>(() => fb?.meta.target_title ?? "");
  // El aviso con el que nació la variante («Adaptar a un aviso»); afinar lo envía (DA-AV3).
  const [aviso, setAviso] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(supabaseEnabled);

  const [libQ, setLibQ] = useState("");
  const [mode, setMode] = useState<Mode>("doc");
  const [view, setView] = useState<View>("mid");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Presentación opt-in (foto/QR). qrCustom = el usuario eligió "otra URL".
  const [qrCustom, setQrCustom] = useState(false);
  /* Las REFERENCIAS del master con sus VÍNCULOS. Se piden aparte de la variante
     porque los vínculos viven en su propia tabla (reference_links) y GET
     /api/variants/[id] no los trae. Solo sirven para SUGERIR: nada se añade solo. */
  const [refs, setRefs] = useState<ReferenceView[]>([]);
  /* HUECO ARREGLADO: GET /api/references devuelve migracionPendiente cuando faltan
     las migraciones 0004/0005, y antes el editor lo tiraba con setRefs([]) EN
     SILENCIO. El usuario veía una biblioteca sin referencias y ni una pista. Ahora
     el motivo (migración pendiente o error real) se guarda y se pinta donde el
     usuario iría a crearlas. */
  const [refsMigracion, setRefsMigracion] = useState(false);
  const [refsError, setRefsError] = useState("");
  /* La BIBLIOTECA en pestañas: el tipo que se mira, el filtro por estado (en la
     variante / fuera) y los roles cuyas viñetas se desplegaron a mano. Estado de
     la sesión: no se persiste (abrir el editor empieza siempre por «Todo»). */
  const [libTab, setLibTab] = useState<LibSectionId | "todo">("todo");
  const [libFiltro, setLibFiltro] = useState<FiltroLib>("todo");
  const [rolesAbiertos, setRolesAbiertos] = useState<ReadonlySet<string>>(new Set());
  /* PUNTO 6 · formulario de alta de referencia DESDE el editor. Nace cerrado; se
     abre solo cuando el master no tiene ninguna (ver más abajo). El borrador es
     local hasta pulsar «Añadir»: nada entra al master a medio escribir. */
  const [refFormOpen, setRefFormOpen] = useState(false);
  const [refDraft, setRefDraft] = useState<ReferenceFields>({});
  const [refSaving, setRefSaving] = useState(false);
  const [refFormErr, setRefFormErr] = useState("");
  // Galería de plantillas (el selector con miniaturas reales). Cerrarla no pierde
  // nada: cada elección se persiste en el momento, como cualquier otro ajuste.
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  // Encuadre de la foto abierto: el ORIGINAL (recién subido o el guardado) y sus
  // parámetros. Nada se guarda hasta «Guardar encuadre».
  const [fotoEncuadre, setFotoEncuadre] = useState<{ src: string; encuadre: Encuadre | null } | null>(null);
  // Eliminar variante: confirmación INLINE (no window.confirm) porque tras archivar se
  // navega a /app/variantes; el toast diferido de deshacer no encaja al desmontar aquí.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Borrador local de los enlaces del contacto (se confirma al desenfocar / quitar).
  const [linkRows, setLinkRows] = useState<{ label: string; url: string }[]>([]);
  const linksSigRef = useRef<string>("");
  // Serializa los guardados de presentación: setVariantPresentation hace un
  // read-modify-write de override_data; sin esto, dos ediciones seguidas (subir
  // foto + activar QR) se pisarían campo a campo. La cadena garantiza que el 2º
  // PATCH lea lo que el 1º ya escribió.
  const presSaveChain = useRef<Promise<void>>(Promise.resolve());

  // Barra de estado (#edState): live region, con flash reentrante a 2600 ms.
  // "" = reposo → se pinta t("editor.stIdle") en vivo (reactivo al idioma).
  const [stMsg, setStMsg] = useState("");
  const [stAccent, setStAccent] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pvScrollRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLSpanElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const sortSnap = useRef<Map<string, number> | null>(null);
  const bootRef = useBoot<HTMLDivElement>(); // no-op defensivo: no hay reveals aquí

  const flash = useCallback((msg: string) => {
    setStMsg(msg);
    setStAccent(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setStMsg("");
      setStAccent(false);
    }, 2600);
  }, []);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // `t` cambia de identidad al cambiar de idioma; guardarlo en un ref deja que los
  // efectos de datos dependan SOLO de sus datos (cambiar de idioma no recarga nada).
  const tRef = useRef(t);
  tRef.current = t;

  /**
   * DESTAPAR EL ERROR. Todo fallo pasa por aquí: al log con contexto (para quien
   * depura) y a la barra de estado con el MOTIVO REAL interpolado en {r} (para
   * quien usa). Ningún catch de esta pantalla se queda callado.
   */
  const fail = useCallback(
    (context: string, e: unknown, key: string) => {
      console.error(`[editor] ${context}`, e);
      flash(tRef.current(key).replace("{r}", reason(e)));
    },
    [flash],
  );

  // ── Carga real (modo Supabase) ──
  useEffect(() => {
    if (!supabaseEnabled) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/variants/${variantId}`);
        if (!res.ok) throw new Error(await readApiError(res));
        const data = await res.json();
        if (!active) return;
        setMaster((data.master ?? []) as MasterRow[]);
        setItems(((data.items ?? []) as unknown[]).map(normalizeIncoming));
        const m = data.variant as VMeta | undefined;
        setMeta(m ?? null);
        setTargetTitle(m?.target_title ?? "");
        setAviso(typeof data.aviso === "string" ? data.aviso : "");
      } catch (e) {
        if (active) {
          setMaster([]);
          setItems([]);
          setMeta(null);
          fail(`carga de la variante ${variantId}`, e, "editor.stLoadErr");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [variantId, fail]);

  /* Los VÍNCULOS de las referencias. Efecto aparte del de la variante: si las
     migraciones 0004/0005 aún no están aplicadas, esto devuelve lista vacía y el
     editor sigue funcionando entero — lo único que se pierde es la SUGERENCIA, que
     es una ayuda, no un dato del documento. */
  useEffect(() => {
    if (!supabaseEnabled) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/references");
        if (!res.ok) throw new Error(await readApiError(res));
        const j = (await res.json()) as { references?: ReferenceView[]; migracionPendiente?: boolean };
        if (!active) return;
        setRefs(j.references ?? []);
        // NO se descarta en silencio: si faltan las migraciones, se recuerda para
        // pintar el aviso real donde el usuario querría crear una referencia, en
        // vez de mostrarle una biblioteca vacía sin explicación.
        setRefsMigracion(j.migracionPendiente === true);
        setRefsError("");
      } catch (e) {
        // No se calla: sin esto, «¿por qué no me sugiere a mi jefe?» no se depura.
        console.error("[editor] no se pudieron leer las referencias", e);
        if (active) {
          setRefs([]);
          setRefsError(reason(e));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ── Índices derivados ──
  const masterById = useMemo(() => {
    const m = new Map<string, MasterRow>();
    master.forEach((r) => m.set(r.id, r));
    return m;
  }, [master]);

  const vItemByMaster = useMemo(() => {
    const m = new Map<string, VItem>();
    items.forEach((it) => m.set(it.item_id, it));
    return m;
  }, [items]);

  // ¿La viñeta `bullet` pertenece al `work` (variant_item)?
  const belongsTo = useCallback(
    (bullet: VItem, work: VItem): boolean => {
      const mParent = masterById.get(bullet.item_id)?.parent_id ?? bullet.parent_id;
      return mParent === work.item_id || bullet.parent_id === work.id;
    },
    [masterById],
  );

  const bulletsForWork = useCallback(
    (work: VItem): VItem[] => items.filter((b) => b.kind === "bullet" && belongsTo(b, work)).sort(bySort),
    [items, belongsTo],
  );

  // basics: preferir el variant_item si existe; si no, el master. Siempre se pinta.
  const basicsData = useMemo(() => {
    const vi = items.find((i) => i.kind === "basics");
    if (vi) return vi.data;
    return master.find((m) => m.kind === "basics")?.data ?? {};
  }, [items, master]);

  // ── Presentación opt-in (foto / QR) — override del basics de ESTA variante ──
  const hasBasics = useMemo(() => master.some((m) => m.kind === "basics") || items.some((i) => i.kind === "basics"), [master, items]);
  // Enlaces del contacto para el QR, SIN duplicados por url (normalizeLinks no
  // deduplica): dos links iguales darían dos <option> con la misma key en React.
  const linkOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { url: string; label: string }[] = [];
    for (const l of normalizeLinks(basicsData.links)) {
      const url = linkUrl(l);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, label: linkLabel(l) });
    }
    return out;
  }, [basicsData.links]);
  // override_data del variant_item de basics: qué campos de contacto están tuneados
  // SOLO en esta variante (marca visual + revertir). masterBasics = la identidad
  // canónica de la que hereda cada campo.
  const basicsOverride = useMemo(() => {
    const vi = items.find((i) => i.kind === "basics");
    return (vi?.override_data as Record<string, unknown> | null) ?? {};
  }, [items]);
  const masterBasics = useMemo(() => master.find((m) => m.kind === "basics")?.data ?? {}, [master]);

  const photoUrl = S(basicsData, "photo").trim();
  const qrObj = (basicsData.qr as Record<string, unknown> | undefined) ?? {};
  const qrUrl = S(qrObj, "url").trim();
  const qrMode: "url" | "vcard" = qrObj.mode === "vcard" ? "vcard" : "url";
  const photoOn = !!photoUrl;
  const qrOn = qrMode === "vcard" || !!qrUrl;
  const qrChecked = qrOn || qrCustom;
  const qrCustomMode = qrMode === "url" && (qrCustom || (!!qrUrl && !linkOptions.some((l) => l.url === qrUrl)));

  // Diseño elegido para esta variante. Vacío ⇒ la plantilla por defecto (getTemplate
  // resuelve el id desconocido sin lanzar: un id roto no puede dejarte sin CV).
  const designTemplateId = S(basicsData, "templateId").trim() || getTemplate(null).id;
  const designPaletteId = S(basicsData, "paletteId").trim();
  const designTypographyId = S(basicsData, "typographyId").trim();
  const activeTemplate = getTemplate(designTemplateId);

  /* ── ORDEN DE LAS SECCIONES, POR VARIANTE ───────────────────────────────────
     El orden de la PLANTILLA es el valor inicial (así carga como siempre); si esta
     variante guardó el suyo, ese manda. Se normaliza contra el de la plantilla, de
     modo que un orden guardado hace tres versiones —cuando aún no existían
     certificaciones— no las pierde: aparecen al final, pero aparecen. */
  const templateOrder = useMemo(
    () => resolveMetrics(activeTemplate.metrics).sectionOrder,
    [activeTemplate],
  );
  const storedOrder = useMemo(
    () => normalizeSectionOrder(basicsData[SECTION_ORDER_FIELD], templateOrder),
    [basicsData, templateOrder],
  );
  /** El orden que el documento usará AHORA MISMO (y que pinta el reordenador). */
  const effectiveOrder = storedOrder ?? templateOrder;
  /** ¿Esta variante tiene orden propio? (decide si se ofrece «volver al de la plantilla») */
  const orderIsCustom = storedOrder !== null;

  // Reconcilia el estado del cliente con la VERDAD del servidor tras guardar la
  // presentación: fija el id real del variant_item de basics, su override_data
  // efectivo (limpia marcas de override que en realidad quedaron canónicas), y —si
  // la primera guardada SEMBRÓ el basics del master— añade/actualiza esa fila.
  const applyPresentationTruth = useCallback(
    (p: {
      basicsItemId?: string;
      override?: Record<string, unknown> | null;
      masterBasicsId?: string;
      masterBasics?: Record<string, unknown>;
    }) => {
      if (p.masterBasicsId) {
        const mid = p.masterBasicsId;
        const mdata = p.masterBasics ?? {};
        setMaster((prev) =>
          prev.some((m) => m.id === mid)
            ? prev.map((m) => (m.id === mid ? { ...m, data: mdata } : m))
            : [...prev, { id: mid, kind: "basics", data: mdata, parent_id: null, sort_order: -1 }],
        );
      }
      setItems((prev) => {
        const ov = (p.override ?? null) as Record<string, unknown> | null;
        const base = p.masterBasics ?? prev.find((i) => i.kind === "basics")?.data ?? {};
        const data = { ...base, ...(ov ?? {}) };
        const existing = prev.find((i) => i.kind === "basics");
        if (existing) {
          return prev.map((i) =>
            i.id === existing.id
              ? { ...i, id: p.basicsItemId ?? i.id, item_id: p.masterBasicsId ?? i.item_id, override_data: ov, data }
              : i,
          );
        }
        if (!p.basicsItemId) return prev;
        return [
          ...prev,
          { id: p.basicsItemId, item_id: p.masterBasicsId ?? "", kind: "basics", visible: true, sort_order: -1,
            override_data: ov, override_origin: ov ? "manual" : null, override_verified: false, data, parent_id: null },
        ];
      });
    },
    [],
  );

  // Persiste foto/QR/contacto: optimista en items (para que el preview cambie ya) +
  // PATCH. El merge optimista usa el MISMO helper puro que el servidor.
  const savePresentation = useCallback(
    (patch: PatchPresentacion) => {
      setItems((prev) => {
        const basicsMaster = master.find((m) => m.kind === "basics");
        const existing = prev.find((i) => i.kind === "basics");
        const base = basicsMaster?.data ?? existing?.data ?? {};
        const curOv = (existing?.override_data as Record<string, unknown> | null) ?? {};
        const nextOv = conEncuadre(mergePresentationOverride(curOv, patch), patch);
        const nextData = { ...base, ...nextOv };
        if (existing) return prev.map((i) => (i.id === existing.id ? { ...i, override_data: nextOv, data: nextData } : i));
        const tmp: VItem = {
          id: "tmp-basics", item_id: basicsMaster?.id ?? "tmp-basics-master", kind: "basics", visible: true,
          sort_order: -1, override_data: nextOv, override_origin: "manual", override_verified: false,
          data: nextData, parent_id: null,
        };
        return [...prev, tmp];
      });
      if (!supabaseEnabled) {
        flash(t("editor.stPresSaved"));
        return;
      }
      // Encolar tras el guardado anterior: los PATCH se aplican EN ORDEN, así el
      // read-modify-write del servidor nunca pierde un campo por una carrera.
      presSaveChain.current = presSaveChain.current.then(async () => {
        try {
          const res = await fetch(`/api/variants/${variantId}`, {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: JSON.stringify({ presentation: patch }),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          const json = (await res.json().catch((e: unknown) => {
            // Guardó bien (2xx) pero el cuerpo no se pudo leer: no se reconcilia,
            // el optimista se queda. Se registra para no perder la pista.
            console.error("[editor] respuesta de presentación ilegible", e);
            return null;
          })) as {
            presentation?: {
              basicsItemId?: string;
              override?: Record<string, unknown> | null;
              masterBasicsId?: string;
              masterBasics?: Record<string, unknown>;
            };
          } | null;
          if (json?.presentation) applyPresentationTruth(json.presentation);
          flash(t("editor.stPresSaved"));
        } catch (e) {
          fail("guardado de presentación/contacto", e, "editor.stPresErr");
        }
      });
    },
    [master, variantId, flash, t, fail, applyPresentationTruth],
  );

  /* ── Reordenar el CUERPO del documento ──────────────────────────────────────
     Subir/bajar una sección. Es LA alternativa de teclado y no un extra: son dos
     <button> de verdad, así que tabulador + Enter/Espacio bastan, y el anuncio del
     movimiento va a la barra de estado, que es una live region. NO se implementó
     arrastrar: un arrastre exige duplicar toda esta lógica en punteros y teclado, y
     la versión con botones ya cubre a todo el mundo.

     ⚠ EL FOCO NO SE PIERDE. Cada fila lleva `key={id}`, así que al reordenar React
     MUEVE el nodo en vez de recrearlo: el botón que acabas de pulsar sigue siendo el
     mismo elemento y conserva el foco. Sin esa key, pulsar «subir» tres veces exige
     volver a tabular tres veces. */
  const moveSection = useCallback(
    (id: SectionId, dir: -1 | 1) => {
      const cur: SectionId[] = [...effectiveOrder];
      const i = cur.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return;
      // CANDADO: las referencias van al final SIEMPRE. Ni se mueven ellas ni las
      // desplaza otra sección al pasar por encima (una referencia no abre un CV).
      if (cur[i] === PINNED_LAST_SECTION || cur[j] === PINNED_LAST_SECTION) return;
      const tmp = cur[i]!;
      cur[i] = cur[j]!;
      cur[j] = tmp;
      savePresentation({ sectionOrder: cur });
      flash(
        t("editor.stOrderMoved")
          .replace("{s}", t(LIB_TITLE_KEY[id]))
          .replace("{n}", String(j + 1))
          .replace("{m}", String(cur.length)),
      );
    },
    [effectiveOrder, savePresentation, flash, t],
  );

  /** Un preset de un clic. Son los órdenes que YA usa el catálogo (no una copia). */
  const applyOrderPreset = useCallback(
    (order: readonly SectionId[]) => savePresentation({ sectionOrder: [...order] }),
    [savePresentation],
  );

  /** Volver al orden de la plantilla: borra el override (no guarda «el de ahora»). */
  const resetOrder = useCallback(() => savePresentation({ sectionOrder: null }), [savePresentation]);

  const onPhotoFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setBusyPhoto(true);
      try {
        // Subir NO guarda: abre el encuadre con el original (reducido a 1280 px).
        setFotoEncuadre({ src: await archivoAOriginal(file), encuadre: null });
      } catch (e) {
        // Archivo corrupto, formato que el navegador no decodifica, canvas sin
        // contexto… el motivo va a la barra: el usuario sabe qué reintentar.
        fail(`lectura de la foto "${file.name}"`, e, "editor.stPhotoErr");
      } finally {
        setBusyPhoto(false);
        if (photoInputRef.current) photoInputRef.current.value = "";
      }
    },
    [fail],
  );

  /** «Encuadrar» la foto que ya está: desde el original guardado, o desde la foto si no lo hay. */
  const abrirEncuadre = useCallback(() => {
    const guardado = leerEncuadre(basicsData.photoEncuadre);
    if (guardado) setFotoEncuadre(guardado);
    else if (photoUrl) setFotoEncuadre({ src: photoUrl, encuadre: null });
  }, [basicsData.photoEncuadre, photoUrl]);

  /** «Guardar encuadre»: la foto recortada para el PDF + el original y los parámetros. */
  const guardarEncuadre = useCallback(
    (foto: string, encuadre: Encuadre) => {
      const src = fotoEncuadre?.src;
      setFotoEncuadre(null);
      if (!src) return;
      if (foto.length > 900_000) {
        flash(t("editor.stPhotoBig"));
        return;
      }
      savePresentation({ photo: foto, photoEncuadre: { src, ...encuadre } });
    },
    [fotoEncuadre, savePresentation, flash, t],
  );

  // Foto ON abre el selector (el guardado ocurre al elegir archivo); OFF la quita.
  const togglePhoto = useCallback(
    (on: boolean) => {
      if (on) photoInputRef.current?.click();
      else savePresentation({ photo: "" });
    },
    [savePresentation],
  );

  const toggleQr = useCallback(
    (on: boolean) => {
      if (on) {
        const def = pickDefaultQrLink(linkOptions);
        setQrCustom(false);
        // Con enlace → modo 'url' con ese enlace. Sin enlaces → modo 'vcard' (no
        // necesita URL: el glifo sale del contacto), así el QR queda ON de una.
        if (def) savePresentation({ qrUrl: def, qrMode: "url" });
        else savePresentation({ qrUrl: "", qrMode: "vcard" });
      } else {
        setQrCustom(false);
        savePresentation({ qrUrl: "", qrMode: "url" });
      }
    },
    [linkOptions, savePresentation],
  );

  const changeQrMode = useCallback(
    (m: "url" | "vcard") => {
      if (m === "vcard") {
        savePresentation({ qrMode: "vcard" });
      } else {
        // Volver a 'url' necesita una URL para quedar ON; si no hay, toma el default.
        const url = qrUrl || pickDefaultQrLink(linkOptions);
        setQrCustom(!url);
        savePresentation({ qrMode: "url", qrUrl: url });
      }
    },
    [qrUrl, linkOptions, savePresentation],
  );

  const onQrSelect = useCallback(
    (val: string) => {
      if (val === "__custom__") {
        setQrCustom(true);
        return;
      }
      setQrCustom(false);
      savePresentation({ qrUrl: val, qrMode: "url" });
    },
    [savePresentation],
  );

  const onQrCustomInput = useCallback((val: string) => savePresentation({ qrUrl: val.trim(), qrMode: "url" }), [savePresentation]);

  // ── Contacto por variante: cada campo hereda del master; al editarlo se vuelve
  //    override SOLO de esta variante. Si el valor vuelve a igualar al master, se
  //    revierte (se quita el override). ──
  const onContactBlur = useCallback(
    (field: "name" | "email" | "phone" | "location", raw: string) => {
      const v = raw.trim();
      const masterVal = S(masterBasics, field).trim();
      const overridden = field in basicsOverride;
      if (v === masterVal) {
        if (overridden) savePresentation({ [field]: null } as PresentationPatch);
      } else {
        savePresentation({ [field]: v } as PresentationPatch);
      }
    },
    [masterBasics, basicsOverride, savePresentation],
  );

  const revertContact = useCallback(
    (field: "name" | "email" | "phone" | "location" | "links") =>
      savePresentation({ [field]: null } as PresentationPatch),
    [savePresentation],
  );

  // Enlaces efectivos (para sembrar el borrador editable) y su firma para resincronizar
  // el borrador cuando cambian por fuera (carga, revert, reconciliación).
  const effectiveLinks = useMemo(
    () => normalizeLinks(basicsData.links).map((l) => ({ label: linkLabel(l), url: linkUrl(l) })),
    [basicsData.links],
  );
  useEffect(() => {
    const sig = JSON.stringify(effectiveLinks);
    if (linksSigRef.current !== sig) {
      linksSigRef.current = sig;
      setLinkRows(effectiveLinks);
    }
  }, [effectiveLinks]);

  // Confirma los enlaces: limpia filas sin URL, compara con el master y decide entre
  // override (distinto del master) o revertir (igual al master).
  const commitLinks = useCallback(
    (rows: { label: string; url: string }[]) => {
      const cleaned = rows.map((r) => ({ label: r.label.trim(), url: r.url.trim() })).filter((r) => r.url);
      const asInput = cleaned.map((r) => (r.label ? { label: r.label, url: r.url } : r.url));
      const sameAsMaster =
        JSON.stringify(normalizeLinks(asInput)) === JSON.stringify(normalizeLinks(masterBasics.links));
      if (sameAsMaster) {
        if ("links" in basicsOverride) savePresentation({ links: null });
      } else {
        savePresentation({ links: asInput });
      }
    },
    [masterBasics.links, basicsOverride, savePresentation],
  );

  const updateLinkRow = useCallback((i: number, key: "label" | "url", val: string) => {
    setLinkRows((prev) => prev.map((r, k) => (k === i ? { ...r, [key]: val } : r)));
  }, []);
  const addLinkRow = useCallback(() => setLinkRows((prev) => [...prev, { label: "", url: "" }]), []);
  const removeLinkRow = useCallback(
    (i: number) => {
      setLinkRows((prev) => {
        const next = prev.filter((_, k) => k !== i);
        commitLinks(next);
        return next;
      });
    },
    [commitLinks],
  );

  // ── Eliminar variante (archiva) → navega a la lista. Confirmación inline. ──
  const doDeleteVariant = useCallback(async () => {
    if (!supabaseEnabled) {
      flash(t("editor.stDeleteLocal"));
      setConfirmDelete(false);
      return;
    }
    try {
      const res = await fetch(`/api/variants/${variantId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res));
      router.push("/app/variantes");
    } catch (e) {
      fail(`eliminación de la variante ${variantId}`, e, "editor.stDeleteErr");
      setConfirmDelete(false);
    }
  }, [variantId, router, flash, t, fail]);

  // ── EL DOCUMENTO: un solo modelo (ResumeData) para el preview y la descarga ──
  // Las REGLAS de la variante (DA-R1) mandan sobre lo que se pinta: misma función
  // que el servidor (buildVariantResumeData), así preview y descarga son el mismo PDF.
  const [reglas, setReglasEstado] = useState<Reglas>(() => obtenerReglas(meta));
  const reglasGuardadas = meta?.reglas;
  useEffect(() => {
    setReglasEstado(obtenerReglas({ reglas: reglasGuardadas }));
  }, [meta?.id, reglasGuardadas]);
  const resumeSinReglas = useMemo(
    () => buildEditorResumeData({ items, basicsData, masterById, targetTitle, variantName: meta?.name }),
    [items, basicsData, masterById, targetTitle, meta?.name],
  );
  const resumeData = useMemo(() => aplicarReglasAlDocumento(resumeSinReglas, reglas), [resumeSinReglas, reglas]);
  /** Guarda las reglas (PATCH). Los obligatorios que falten vuelven con `items`. */
  const reglasTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardarReglas = useCallback(
    (r: Reglas) => {
      setReglasEstado(r);
      if (!supabaseEnabled) return;
      // Debounce: la nota libre cambia por tecla; se guarda al parar.
      if (reglasTimer.current) clearTimeout(reglasTimer.current);
      reglasTimer.current = setTimeout(() => void (async () => {
        try {
          const res = await fetch(`/api/variants/${variantId}`, {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: JSON.stringify({ reglas: r }),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          const j = (await res.json()) as { persistido?: boolean; items?: unknown[] };
          if (Array.isArray(j.items)) setItems(j.items.map(normalizeIncoming));
          flash(t(j.persistido === false ? "reglas.sinColumna" : "reglas.guardadas"));
        } catch (e) {
          fail("PATCH de la variante · reglas", e, "editor.stSaveErr");
        }
      })(), 500);
    },
    [variantId, flash, t, fail],
  );
  /* QUÉ SECCIONES SE IMPRIMEN DE VERDAD. Se calcula con la MISMA función que usa el
     PDF (documentSections) y la MISMA métrica (metricsOf): el reordenador dice «no
     se imprime: no tienes nada aquí» porque lo sabe, no porque lo suponga. Una
     sección vacía sigue apareciendo en la lista —moverla es legítimo, y esconderla
     sería descartarla en silencio— pero con su motivo escrito al lado. */
  const printedSections = useMemo(
    () => new Set<SectionId>(documentSections(resumeData, false, metricsOf(resumeData))),
    [resumeData],
  );
  // Ref para que el efecto del preview y la descarga usen SIEMPRE el último
  // documento sin volverse a crear en cada render.
  const resumeRef = useRef(resumeData);
  resumeRef.current = resumeData;
  // Firma del documento: si no cambia, no se vuelve a pedir un PDF. Es también el
  // disparador del debounce (escribir no dispara nada hasta que paras).
  const docSig = useMemo(() => JSON.stringify(resumeData), [resumeData]);

  // ── El preview ES el PDF: bytes reales de /api/cv, embebidos en un <iframe> ──
  const [pdfUrl, setPdfUrl] = useState("");
  const [xrayText, setXrayText] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [pvBusy, setPvBusy] = useState(true);
  const [pvError, setPvError] = useState("");
  const [pvRetry, setPvRetry] = useState(0);
  const pdfUrlRef = useRef("");
  // Páginas que pide el usuario (1, 2 o 3). Preview y descarga mandan ESTE objetivo
  // a /api/cv, que pasa el documento por el autofit (autofit.ts): el cuerpo más
  // grande entre 10 pt y el de la plantilla con el que cabe. Mismo body, mismo PDF.
  const [objetivo, setObjetivo] = useState<Objetivo>(2);
  const objetivoRef = useRef(objetivo);
  objetivoRef.current = objetivo;
  const [autofitInfo, setAutofitInfo] = useState<AutofitInfo | null>(null);
  const estadoReglas = useMemo(() => {
    const visibles = new Set(items.filter((i) => i.visible).map((i) => i.item_id));
    const nombreDe = (id: string) => {
      const m = masterById.get(id);
      return m ? textoDeItem(m.kind, m.data ?? {}).slice(0, 60) || m.kind : id;
    };
    return estadoDeReglas(resumeSinReglas, resumeData, reglas, {
      paginas: pageCount || undefined,
      idsVisibles: visibles,
      nombreDe,
    });
  }, [items, masterById, resumeSinReglas, resumeData, reglas, pageCount]);
  // El objetivo vive en la base (cv_variants.paginas_objetivo, 0009): llega con la
  // cabecera de la variante y sobrevive a otro navegador. Sin la columna, 2.
  const paginasGuardadas = meta?.paginas_objetivo;
  useEffect(() => {
    if (paginasGuardadas === 1 || paginasGuardadas === 2 || paginasGuardadas === 3) setObjetivo(paginasGuardadas);
  }, [meta?.id, paginasGuardadas]);
  const elegirObjetivo = useCallback(
    (n: Objetivo) => {
      setObjetivo(n);
      if (!supabaseEnabled) return;
      void (async () => {
        try {
          const res = await fetch(`/api/variants/${variantId}`, {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: JSON.stringify({ paginas_objetivo: n }),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          flash(t("editor.stSaved"));
        } catch (e) {
          fail("PATCH de la variante · paginas_objetivo", e, "editor.stSaveErr");
        }
      })();
    },
    [variantId, flash, t, fail],
  );

  // Un object URL vivo por PDF: se revoca el anterior al llegar el nuevo y el
  // último al desmontar (si no, cada tecleo filtraría un blob).
  useEffect(
    () => () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (loading) return; // aún no sabemos qué documento es
    let cancelled = false;
    setPvBusy(true);
    // DEBOUNCE: no se pide un PDF por tecla. Se regenera ~600 ms después de la
    // última edición (y al desenfocar, porque el commit cambia `docSig`).
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/cv", {
            method: "POST",
            headers: JSON_HEADERS,
            // El MISMO body que la descarga: mismo artefacto, sin excepciones.
            // `data` (y no `variantId`) para que el preview refleje lo que ves
            // AHORA, incluso antes de que el guardado optimista llegue al servidor,
            // y para que funcione igual sin Supabase (modo local).
            body: JSON.stringify({ data: resumeRef.current, as: "preview", paginas: objetivoRef.current }),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          const json = (await res.json()) as {
            pdf?: string;
            text?: string;
            pages?: number;
            autofit?: AutofitInfo;
          };
          if (cancelled) return;
          if (!json.pdf) throw new Error("La respuesta no trae el PDF.");
          const url = URL.createObjectURL(pdfBlobFromBase64(json.pdf));
          if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
          pdfUrlRef.current = url;
          // #view=FitH: el visor ajusta la página al ancho del panel (sin corte lateral
          // al estrechar la vista previa). Los bytes son los mismos.
          setPdfUrl(`${url}#view=FitH`);
          // El rayos-X NO se genera aquí: es el texto que unpdf extrajo de ESTE
          // mismo PDF en el servidor. Y las páginas son su numPages real.
          setXrayText(json.text ?? "");
          setPageCount(Number(json.pages ?? 0));
          setAutofitInfo(json.autofit ?? null);
          setPvError("");
        } catch (e) {
          if (cancelled) return;
          // Nunca un panel en blanco y mudo: el motivo real se pinta en el panel
          // y en la barra de estado.
          console.error("[editor] preview: no se pudo generar el PDF", e);
          setPvError(reason(e));
          flash(tRef.current("editor.stPdfErr").replace("{r}", reason(e)));
        } finally {
          if (!cancelled) setPvBusy(false);
        }
      })();
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [docSig, loading, pvRetry, flash, objetivo]);

  /* ── SEGUIR UNA RE-RENDERIZACIÓN de la vista previa (afinar, plantilla, paleta) ──
     Pasos REALES, vistos desde aquí: «esperando» (el cambio llegó; el preview aún
     no arrancó) → «midiendo» (el PDF nuevo se está generando y midiendo) → nada.
     Si el preview no arranca en 1,5 s (el cambio no tocó el documento), se suelta. */
  const [pvSigue, setPvSigue] = useState<{ motivo: MotivoPv; fase: "esperando" | "midiendo" } | null>(null);
  const seguirVistaPrevia = useCallback((motivo: MotivoPv) => setPvSigue({ motivo, fase: "esperando" }), []);
  useEffect(() => {
    if (!pvSigue) return;
    if (pvSigue.fase === "esperando" && pvBusy) setPvSigue({ ...pvSigue, fase: "midiendo" });
    else if (pvSigue.fase === "midiendo" && !pvBusy) setPvSigue(null);
  }, [pvBusy, pvSigue]);
  useEffect(() => {
    if (pvSigue?.fase !== "esperando") return;
    const tm = setTimeout(() => setPvSigue((v) => (v?.fase === "esperando" ? null : v)), 1500);
    return () => clearTimeout(tm);
  }, [pvSigue]);
  // Cambiar plantilla, paleta o tipografía rehace la vista previa: se sigue. La
  // primera firma (la de la carga) no cuenta: abrir el editor no es «cambiar».
  const disenoSig = `${designTemplateId}|${designPaletteId}|${designTypographyId}`;
  const disenoPrev = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    if (disenoPrev.current !== null && disenoPrev.current !== disenoSig) seguirVistaPrevia("diseno");
    disenoPrev.current = disenoSig;
  }, [disenoSig, loading, seguirVistaPrevia]);

  // ── El master, CONTADO — la entrada de la recomendación ────────────────────
  /**
   * Números que el usuario puede ir a verificar él mismo en su biblioteca; ni uno
   * estimado. `pages` es el numPages REAL del PDF que está viendo (0 mientras no
   * se sepa, y entonces la regla del volumen no dispara).
   *
   * `skillsWithEvidence` NO se manda: la API de la variante no devuelve la marca
   * de evidencia del master, y afirmar "con evidencia" sin tenerla sería
   * exactamente el tipo de número inventado que este producto no se permite. Se
   * cuenta lo que sí se sabe (las habilidades listadas) y la razón lo dice así.
   */
  const masterSummary = useMemo<MasterSummary>(() => {
    const of = (kind: string) => master.filter((m) => m.kind === kind);
    const skills = of("skill");
    const skillItems = skills.reduce(
      (n, s) => n + S(s.data, "items").split(",").map((x) => x.trim()).filter(Boolean).length,
      0,
    );
    return {
      roles: of("work").length,
      bullets: of("bullet").length,
      skillGroups: skills.length,
      skillItems,
      projects: of("project").length,
      education: of("education").length,
      hasSummary: of("summary").length > 0,
      pages: pageCount,
    };
  }, [master, pageCount]);

  const recommendations = useMemo(
    () => recommendTemplates(masterSummary, { limit: 8, templates: TEMPLATES }),
    [masterSummary],
  );

  // El hash del documento para las miniaturas: el MISMO que usa la galería, para
  // que la miniatura de la tarjeta y la de la rejilla compartan caché.
  const thumbDocHash = useMemo(() => docHashFromSig(docSig), [docSig]);

  // ── Persistencia (contra el contrato; en modo local es no-op) ──
  const patchItem = useCallback(
    (vitemId: string, patch: Record<string, unknown>) => {
      if (!supabaseEnabled || vitemId.startsWith("tmp-")) return;
      void (async () => {
        try {
          const res = await fetch(`/api/variants/${variantId}/items`, {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: JSON.stringify({ id: vitemId, ...patch }),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          flash(t("editor.stSavedItem"));
        } catch (e) {
          // El estado local ya cambió (optimista): si el servidor lo rechazó, el
          // usuario tiene que enterarse, o creerá que guardó.
          fail(`PATCH del item ${vitemId} · ${Object.keys(patch).join(",")}`, e, "editor.stSaveItemErr");
        }
      })();
    },
    [variantId, flash, t, fail],
  );

  const patchVariant = useCallback(
    (patch: Record<string, unknown>) => {
      if (!supabaseEnabled) return;
      void (async () => {
        try {
          const res = await fetch(`/api/variants/${variantId}`, {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: JSON.stringify(patch),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          flash(t("editor.stSaved"));
        } catch (e) {
          fail(`PATCH de la variante · ${Object.keys(patch).join(",")}`, e, "editor.stSaveErr");
        }
      })();
    },
    [variantId, flash, t, fail],
  );

  const nextSortOrder = useCallback(
    (kind: string) => {
      const same = items.filter((i) => i.kind === kind);
      return same.length ? Math.max(...same.map((i) => i.sort_order)) + 1 : items.length + 1;
    },
    [items],
  );

  // POST un item del master a la variante (optimista con id temporal + reconcilia).
  // rowHint: la fila del master cuando TODAVÍA no está en masterById — es el caso
  // de una referencia recién creada desde el editor, cuyo setMaster aún no se ha
  // reflejado en este render. Sin él, postItem saldría en vacío y la referencia
  // nueva no se añadiría a la variante.
  const postItem = useCallback(
    async (masterId: string, rowHint?: MasterRow) => {
      const m = masterById.get(masterId) ?? rowHint;
      if (!m || items.some((i) => i.item_id === masterId)) return;
      const tmpId = "tmp-" + Math.random().toString(36).slice(2);
      const optimistic: VItem = {
        id: tmpId,
        item_id: m.id,
        kind: m.kind,
        visible: true,
        sort_order: nextSortOrder(m.kind),
        override_data: null,
        override_origin: null,
        override_verified: false,
        data: m.data,
        parent_id: m.parent_id,
      };
      setItems((prev) => [...prev, optimistic]);
      if (!supabaseEnabled) return;
      try {
        const res = await fetch(`/api/variants/${variantId}/items`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ item_id: masterId }),
        });
        if (!res.ok) throw new Error(await readApiError(res));
        const { item } = (await res.json()) as { item?: unknown };
        if (item) {
          const norm = normalizeIncoming(item);
          if (!norm.data || Object.keys(norm.data).length === 0) norm.data = m.data;
          setItems((prev) => prev.map((i) => (i.id === tmpId ? norm : i)));
        }
      } catch (e) {
        setItems((prev) => prev.filter((i) => i.id !== tmpId));
        fail(`POST del item ${masterId} a la variante`, e, "editor.stAddErr");
      }
    },
    [masterById, items, nextSortOrder, variantId, flash, t, fail],
  );

  const removeItem = useCallback(
    (vitemId: string) => {
      const it = items.find((i) => i.id === vitemId);
      if (!it) return;
      // Quitar un rol arrastra sus viñetas (no dejar variant_items huérfanos).
      const childIds =
        it.kind === "work" ? items.filter((b) => b.kind === "bullet" && belongsTo(b, it)).map((b) => b.id) : [];
      const allIds = new Set([vitemId, ...childIds]);
      setItems((prev) => prev.filter((i) => !allIds.has(i.id)));
      flash(t("editor.stRemoved"));
      if (!supabaseEnabled) return;
      allIds.forEach((id) => {
        if (id.startsWith("tmp-")) return;
        void (async () => {
          try {
            const res = await fetch(`/api/variants/${variantId}/items?id=${encodeURIComponent(id)}`, {
              method: "DELETE",
            });
            if (!res.ok) throw new Error(await readApiError(res));
          } catch (e) {
            // Ya desapareció de la pantalla: si el servidor no lo borró, volverá al
            // recargar. Decirlo es la diferencia entre un bug y una sorpresa.
            fail(`DELETE del item ${id} de la variante`, e, "editor.stRemoveErr");
          }
        })();
      });
    },
    [items, belongsTo, variantId, flash, t, fail],
  );

  // Biblioteca: clic en una fila = alternar (añadir/quitar). Añadir una viñeta
  // arrastra su rol padre.
  const toggleFromLib = useCallback(
    async (masterId: string) => {
      const existing = items.find((i) => i.item_id === masterId);
      if (existing) {
        removeItem(existing.id);
        return;
      }
      const m = masterById.get(masterId);
      if (m?.kind === "bullet" && m.parent_id && !items.some((i) => i.item_id === m.parent_id)) {
        await postItem(m.parent_id);
      }
      await postItem(masterId);
      flash(t("editor.stAdded"));
    },
    [items, masterById, removeItem, postItem, flash, t],
  );

  /* ── PUNTO 6 · crear una referencia DESDE el editor ───────────────────────────
     LA REGLA DEL PRODUCTO, INTACTA: una referencia creada desde la variante TAMBIÉN
     ENTRA AL MASTER. El master es la fuente de verdad; no se crean datos huérfanos
     dentro de una variante. La variante decide cuáles se IMPRIMEN, no cuáles
     existen. Por eso el gesto son dos pasos encadenados y verificables:
       1) POST /api/references  → nace en el master (origin 'manual').
       2) postItem(ref.id, hint)→ se añade a ESTA variante.
     El `hint` es imprescindible: setMaster no se ve en este mismo render, así que
     postItem no encontraría la fila por masterById sin él. */
  const createReferenceFromEditor = useCallback(async () => {
    const nombre = String(refDraft.name ?? "").trim();
    if (!nombre) {
      // El servidor también lo exige (invalidReferenceData), pero decirlo aquí
      // ahorra un viaje y no deja el foco perdido.
      setRefFormErr(tRef.current("editor.refFormNameReq"));
      return;
    }
    if (!supabaseEnabled) {
      // Sin backend no hay dónde crearla; se dice, no se finge que se guardó.
      setRefFormErr(tRef.current("editor.fitLocal"));
      return;
    }
    setRefSaving(true);
    setRefFormErr("");
    try {
      const res = await fetch("/api/references", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ data: refDraft }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const { reference } = (await res.json()) as { reference?: ReferenceView };
      if (!reference) throw new Error("La respuesta no trae la referencia creada.");
      // 1) que la biblioteca y las sugerencias la vean YA.
      setRefs((prev) => [...prev, reference]);
      const fila: MasterRow = {
        id: reference.id,
        kind: "reference",
        data: reference.data,
        parent_id: null,
        sort_order: reference.sortOrder,
      };
      setMaster((prev) => (prev.some((m) => m.id === fila.id) ? prev : [...prev, fila]));
      // 2) añadirla a esta variante (con hint, porque el master aún no se refleja).
      await postItem(reference.id, fila);
      setRefDraft({});
      setRefFormOpen(false);
      flash(tRef.current("editor.refFormSaved"));
    } catch (e) {
      // Se destapa el motivo real (403 sin sesión, 503 migración pendiente, 400 de
      // validación…): un formulario que falla en mudo es peor que no tenerlo.
      console.error("[editor] no se pudo crear la referencia", e);
      setRefFormErr(tRef.current("editor.refFormErr").replace("{r}", reason(e)));
    } finally {
      setRefSaving(false);
    }
  }, [refDraft, postItem, flash]);

  const alternarRol = useCallback((id: string) => {
    setRolesAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleHide = useCallback(
    (vitemId: string) => {
      const it = items.find((i) => i.id === vitemId);
      if (!it) return;
      const nextVisible = !it.visible;
      setItems((prev) => prev.map((i) => (i.id === vitemId ? { ...i, visible: nextVisible } : i)));
      flash(nextVisible ? t("editor.stShown") : t("editor.stHidden"));
      patchItem(vitemId, { visible: nextVisible });
    },
    [items, flash, patchItem, t],
  );

  const revert = useCallback(
    (vitemId: string) => {
      const it = items.find((i) => i.id === vitemId);
      if (!it) return;
      const field = editableField(it.kind) ?? "text";
      const masterVal = S(masterById.get(it.item_id)?.data, field);
      setItems((prev) =>
        prev.map((i) => (i.id === vitemId ? { ...i, override_data: null, data: { ...i.data, [field]: masterVal } } : i)),
      );
      flash(t("editor.stReverted"));
      patchItem(vitemId, { override_data: null });
    },
    [items, masterById, flash, patchItem, t],
  );

  const startEdit = useCallback((id: string) => setEditingId(id), []);

  // Al entrar en edición: enfocar y colapsar al final.
  useEffect(() => {
    if (!editingId) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (sel) {
      sel.selectAllChildren(el);
      sel.collapseToEnd();
    }
  }, [editingId]);

  const finishEdit = useCallback(() => {
    const id = editingId;
    const el = editRef.current;
    if (!id || !el) {
      setEditingId(null);
      return;
    }
    const it = items.find((i) => i.id === id);
    const field = it ? editableField(it.kind) ?? "text" : "text";
    const v = (el.textContent ?? "").trim();
    const masterVal = S(masterById.get(it?.item_id ?? "")?.data, field);
    if (v && v !== masterVal) {
      const override = { [field]: v };
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, override_data: override, data: { ...i.data, [field]: v } } : i)),
      );
      flash(t("editor.stOvrSaved"));
      patchItem(id, { override_data: override });
    } else if (v === masterVal && it?.override_data) {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, override_data: null, data: { ...i.data, [field]: masterVal } } : i)),
      );
      patchItem(id, { override_data: null });
    }
    setEditingId(null);
  }, [editingId, items, masterById, flash, patchItem, t]);

  const onEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }, []);

  // ── Reordenar (solo viñetas, dentro de su rol). Permuta los sort_order del grupo. ──
  const computeReorder = useCallback(
    (list: VItem[], work: VItem, dragId: string, toIndex: number): { id: string; sort_order: number }[] | null => {
      const group = list.filter((b) => b.kind === "bullet" && belongsTo(b, work)).sort(bySort);
      const ids = group.map((g) => g.id);
      const fromIndex = ids.indexOf(dragId);
      if (fromIndex < 0) return null;
      const clampTo = Math.max(0, Math.min(group.length - 1, toIndex));
      if (clampTo === fromIndex) return null;
      const sortVals = group.map((g) => g.sort_order).slice().sort((a, b) => a - b);
      const newOrder = group.slice();
      const [moved] = newOrder.splice(fromIndex, 1);
      newOrder.splice(clampTo, 0, moved);
      const changed: { id: string; sort_order: number }[] = [];
      newOrder.forEach((g, i) => {
        if (g.sort_order !== sortVals[i]) changed.push({ id: g.id, sort_order: sortVals[i] });
      });
      return changed.length ? changed : null;
    },
    [belongsTo],
  );

  const reorder = useCallback(
    (work: VItem, dragId: string, toIndex: number, persist: boolean) => {
      setItems((prev) => {
        const changed = computeReorder(prev, work, dragId, toIndex);
        if (!changed) return prev;
        const map = new Map(changed.map((c) => [c.id, c.sort_order]));
        if (persist) changed.forEach((c) => patchItem(c.id, { sort_order: c.sort_order }));
        return prev.map((i) => (map.has(i.id) ? { ...i, sort_order: map.get(i.id)! } : i));
      });
    },
    [computeReorder, patchItem],
  );

  const onGripKey = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, bullet: VItem, work: VItem) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const group = bulletsForWork(work);
      const idx = group.findIndex((g) => g.id === bullet.id);
      const to = e.key === "ArrowUp" ? idx - 1 : idx + 1;
      if (to < 0 || to >= group.length) return;
      reorder(work, bullet.id, to, true);
      flash(t("editor.stReordered"));
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-grip="${bullet.id}"]`)?.focus());
    },
    [bulletsForWork, reorder, flash, t],
  );

  /* ── Ajustar: una PROPUESTA, nunca una aplicación — repartida EN el documento ──
     MANUAL, SIEMPRE. El servidor mide el PDF real y devuelve qué quitar, qué
     reordenar y qué acortar. Aquí no se aplica NADA hasta que el usuario pulsa en
     UNA propuesta concreta. No hay «aceptar todo» y no es un hueco del diseño: un
     CV que se reordena solo es un CV en el que se deja de confiar.

     Cada acción reutiliza el camino que ya existía y que ya estaba probado:
     quitar → removeItem, reordenar → reorder (el mismo que el arrastre y las
     flechas), acortar → la ruta, que VUELVE a pasar el candado antes de escribir.

     FLUJO DEL CV (prompts/lotes-fable5/_diseno/flujo-cv.md): la propuesta ya no
     es un panel de cuatro listas. Cada decisión aparece BAJO el item al que afecta
     (flujo-cv.ts la reparte; FlujoCv.tsx la pinta) y desaparece al tomarla; «qué
     falta» se calcula en el cliente con la MISMA calcularFaltas del servidor y se
     pinta sobre la viñeta, el rol o la aptitud; la guía de arriba dice cómo está
     el documento y lleva a la siguiente decisión. El panel anterior está en
     _to_delete/flujo-cv/. */
  const [fitBusy, setFitBusy] = useState(false);
  const [fitErr, setFitErr] = useState("");
  const [fit, setFit] = useState<Fit | null>(null);
  /** decisión del usuario por propuesta ("q:id" | "r:id" | "a:id") */
  const [fitDone, setFitDone] = useState<Record<string, FitMark>>({});
  /** el override que había ANTES de aceptar un acortado — sin esto, Revertir miente */
  const fitPrev = useRef<Record<string, Record<string, unknown> | null>>({});

  const mark = useCallback((k: string, v: FitMark) => setFitDone((p) => ({ ...p, [k]: v })), []);

  const runFit = useCallback(() => {
    if (!supabaseEnabled) {
      setFitErr(t("editor.fitLocal"));
      return;
    }
    setFitBusy(true);
    setFitErr("");
    void (async () => {
      try {
        const res = await fetch(`/api/variants/${variantId}/ajustar`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ accion: "analizar", paginas: objetivo }),
        });
        if (!res.ok) throw new Error(await readApiError(res));
        const { ajuste } = (await res.json()) as { ajuste?: Fit };
        if (!ajuste) throw new Error("La respuesta no trae la propuesta.");
        setFit(ajuste);
        setFitDone({});
        fitPrev.current = {};
      } catch (e) {
        console.error("[editor] no se pudo armar la propuesta de ajuste", e);
        setFitErr(reason(e));
        flash(t("editor.fitErr").replace("{r}", reason(e)));
      } finally {
        setFitBusy(false);
      }
    })();
  }, [variantId, t, flash, objetivo]);

  // Si ni a 10 pt cabe, el autofit ya no puede hacer nada: la guía lo dice y
  // «Proponer recortes» pasa a botón principal (sigue siendo manual: nadie gasta
  // una llamada al modelo sin pulsarlo). En móvil se vuelve a la composición, que
  // es donde se decide. Solo en la TRANSICIÓN a «no cabe», no en cada tecleo.
  const noCabe = autofitInfo?.noCabe === true;
  const noCabeAntes = useRef(false);
  useEffect(() => {
    if (noCabe && !noCabeAntes.current) setView("mid");
    noCabeAntes.current = noCabe;
  }, [noCabe]);
  // Un análisis hecho para otro objetivo ya no describe este documento.
  useEffect(() => {
    setFit(null);
    setFitDone({});
  }, [objetivo]);

  const fitAcceptDrop = useCallback(
    (p: FitQuitar) => {
      removeItem(p.id);
      mark(`q:${p.id}`, "ok");
    },
    [removeItem, mark],
  );

  const fitAcceptMove = useCallback(
    (p: FitReordenar) => {
      // parentId es el id del MASTER del rol; el reorder trabaja con el variant_item.
      const work = items.find((i) => i.kind === "work" && i.item_id === p.parentId);
      if (!work) return;
      reorder(work, p.id, p.hasta, true);
      mark(`r:${p.id}`, "ok");
      flash(t("editor.stReordered"));
    },
    [items, reorder, mark, flash, t],
  );

  /**
   * Aceptar UN acortado. El texto NO se escribe aquí y se avisa al servidor: se
   * escribe EN el servidor, que vuelve a pasar el candado antes de guardar. Si lo
   * rechaza, el motivo real sube a la barra de estado y el documento no se toca —
   * el optimismo se aplica DESPUÉS de que el servidor diga que sí, precisamente
   * porque este es el único cambio del editor que puede perder un hecho.
   */
  const fitAcceptShorten = useCallback(
    (p: FitAcortar) => {
      void (async () => {
        try {
          const res = await fetch(`/api/variants/${variantId}/ajustar`, {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({ accion: "acortar", id: p.id, propuesto: p.propuesto }),
          });
          if (!res.ok) throw new Error(await readApiError(res));
          fitPrev.current[p.id] = items.find((i) => i.id === p.id)?.override_data ?? null;
          setItems((prev) =>
            prev.map((i) =>
              i.id === p.id
                ? {
                    ...i,
                    override_data: { ...(i.override_data ?? {}), [p.campo]: p.propuesto },
                    override_origin: "ai_rephrased",
                    override_verified: true,
                    data: { ...i.data, [p.campo]: p.propuesto },
                  }
                : i,
            ),
          );
          mark(`a:${p.id}`, "ok");
          flash(t("editor.stOvrSaved"));
        } catch (e) {
          fail(`acortado del item ${p.id}`, e, "editor.fitErr");
        }
      })();
    },
    [variantId, items, mark, flash, t, fail],
  );

  /** Revertir: vuelve al override que HABÍA (o al master si no había ninguno). */
  const fitRevertShorten = useCallback(
    (p: FitAcortar) => {
      const antes = fitPrev.current[p.id] ?? null;
      patchItem(p.id, { override_data: antes });
      setItems((prev) =>
        prev.map((i) =>
          i.id === p.id
            ? {
                ...i,
                override_data: antes,
                override_origin: antes ? "manual" : null,
                override_verified: false,
                data: { ...i.data, [p.campo]: p.original },
              }
            : i,
        ),
      );
      mark(`a:${p.id}`, "undo");
      flash(t("editor.fitReverted"));
    },
    [patchItem, mark, flash, t],
  );

  // ── QUÉ FALTA, en el cliente y sin IA ─────────────────────────────────────
  // La MISMA calcularFaltas que usa el servidor (ajuste.ts): un hueco es un hecho
  // comprobable, no una opinión, así que no necesita «Analizar» ni una llamada al
  // modelo. Se carga con import dinámico para que zod (que ajuste.ts arrastra por
  // su esquema) no entre en el bundle inicial del editor.
  const [motorFaltas, setMotorFaltas] = useState<MotorFaltas | null>(null);
  useEffect(() => {
    let vivo = true;
    import("@/lib/cv/ajuste")
      .then((m) => {
        if (vivo) setMotorFaltas({ calcularFaltas: m.calcularFaltas, itemDeAjuste: m.itemDeAjuste });
      })
      .catch((e) => console.error("[editor] no se pudo cargar el cálculo de huecos", e));
    return () => {
      vivo = false;
    };
  }, []);
  const faltas = useMemo<FitFalta[]>(
    () => (motorFaltas ? motorFaltas.calcularFaltas(items.map((i) => motorFaltas.itemDeAjuste(i))) : []),
    [motorFaltas, items],
  );
  const huecos = useMemo(() => huecosPorItem(faltas), [faltas]);

  // ── La propuesta, repartida sobre los items ───────────────────────────────
  // Posición actual de cada viñeta entre sus hermanas VISIBLES (la base de
  // desde/hasta en ajuste.ts): un reordenado que ya se cumple no pide decisión.
  const posicion = useMemo(() => {
    const grupos = new Map<string, VItem[]>();
    for (const i of items) {
      if (i.kind !== "bullet" || !i.visible || !i.parent_id) continue;
      const g = grupos.get(i.parent_id);
      if (g) g.push(i);
      else grupos.set(i.parent_id, [i]);
    }
    const m = new Map<string, number>();
    for (const g of grupos.values()) g.sort(bySort).forEach((it, k) => m.set(it.id, k));
    return m;
  }, [items]);
  const enLinea = useMemo(() => propuestasEnLinea(fit, items, fitDone, posicion), [fit, items, fitDone, posicion]);
  const pendientes = contarPendientes(enLinea);

  /** Aceptar UNA propuesta: el mismo manejador que tenía su fila en el panel. */
  const aceptarProp = useCallback(
    (pr: PropEnLinea) => {
      if (pr.tipo === "q") fitAcceptDrop(pr.p);
      else if (pr.tipo === "r") fitAcceptMove(pr.p);
      else fitAcceptShorten(pr.p);
    },
    [fitAcceptDrop, fitAcceptMove, fitAcceptShorten],
  );

  /* La decisión MARCADA: la que trajo «Siguiente» (J). Es la única que acepta la
     tecla A; sin marca, A primero la busca (nunca acepta algo que no se ha visto). */
  const [actual, setActual] = useState<string | null>(null);


  // «Siguiente ↓»: la próxima decisión del DOCUMENTO, en orden de lectura.
  const ultimaDecision = useRef<HTMLElement | null>(null);
  const irASiguiente = useCallback(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("#mid [data-pendiente]"));
    const ult = ultimaDecision.current && document.contains(ultimaDecision.current) ? ultimaDecision.current : null;
    const desde = ult
      ? ult.getBoundingClientRect().top
      : document.getElementById("edNav")?.getBoundingClientRect().bottom ?? 0;
    const i = siguienteIndice(
      els.map((e) => e.getBoundingClientRect().top),
      desde,
    );
    if (i < 0) return;
    const el = els[i]!;
    ultimaDecision.current = el;
    setActual(el.dataset.clave ?? null);
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: suave ? "smooth" : "auto" });
    // El foco va al botón PRUDENTE (mantener / no): Intro nunca aplica un cambio
    // que el usuario no ha leído.
    el.querySelector<HTMLButtonElement>(".fl-acts button")?.focus({ preventScroll: true });
  }, []);

  /** Tecla A: acepta UNA decisión, la marcada (o la que tiene el foco). */
  const aceptarActual = useCallback(() => {
    const activo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const clave = activo?.closest<HTMLElement>("[data-clave]")?.dataset.clave ?? actual;
    const pr = clave ? Array.from(enLinea.values()).flat().find((x) => x.clave === clave) : undefined;
    if (!pr) {
      irASiguiente(); // primero se ve; aceptar es la siguiente pulsación
      return;
    }
    setActual(null);
    aceptarProp(pr);
  }, [actual, enLinea, aceptarProp, irASiguiente]);

  // ── Layout: biblioteca (cajón) y vista previa (al lado · oculta · completa) ──
  const [libAbierta, setLibAbierta] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  // La pantalla ocupa EXACTAMENTE lo que queda de ventana bajo la barra del shell
  // (que va en el flujo y cambia de alto): se mide, no se adivina.
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const medir = () => el.style.setProperty("--ed-top", `${Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))}px`);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  const libQRef = useRef<HTMLInputElement>(null);
  const midRef = useRef<HTMLElement>(null);
  const [masAbierto, setMasAbierto] = useState(false);
  const [atajosAbierto, setAtajosAbierto] = useState(false);
  const {
    modo: pvModo,
    ancho: pvAncho,
    anchoRef: pvAnchoRef,
    cambiarModo: pvCambiar,
    fijarAncho: pvFijar,
  } = useVistaPrevia();

  /** Ancho disponible para centro + vista previa (sin la biblioteca). */
  const disponiblePv = useCallback(() => {
    const grid = bootRef.current;
    if (!grid) return 0;
    const lib = grid.querySelector<HTMLElement>(".ed-col--lib");
    return grid.getBoundingClientRect().width - (lib?.offsetWidth ?? 0) - 8;
  }, [bootRef]);

  const arrastrarDivisor = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const grid = bootRef.current;
      if (!grid || e.button !== 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      const derecha = grid.getBoundingClientRect().right;
      const disp = disponiblePv();
      let ultimo = pvAnchoRef.current;
      grid.setAttribute("data-arrastrando", "");
      const mover = (ev: PointerEvent) => {
        ultimo = limitarAncho(derecha - ev.clientX, disp);
        pvFijar(ultimo, false);
      };
      const soltar = () => {
        handle.removeEventListener("pointermove", mover);
        handle.removeEventListener("pointerup", soltar);
        handle.removeEventListener("pointercancel", soltar);
        grid.removeAttribute("data-arrastrando");
        pvFijar(ultimo, true);
      };
      handle.addEventListener("pointermove", mover);
      handle.addEventListener("pointerup", soltar);
      handle.addEventListener("pointercancel", soltar);
    },
    [bootRef, disponiblePv, pvAnchoRef, pvFijar],
  );

  const teclaDivisor = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const paso = e.shiftKey ? 96 : 24;
      const d = e.key === "ArrowLeft" ? paso : e.key === "ArrowRight" ? -paso : 0;
      if (e.key === "Home") pvFijar(limitarAncho(PV_ANCHO_DEF, disponiblePv()), true);
      if (!d) return;
      e.preventDefault();
      pvFijar(limitarAncho(pvAnchoRef.current + d, disponiblePv()), true);
    },
    [disponiblePv, pvAnchoRef, pvFijar],
  );

  // ── Atajos de teclado (ver src/components/editor/atajos.ts) ──
  useEffect(() => {
    const estrecho = () => window.matchMedia("(max-width: 1024px)").matches;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const a = accionDeTecla({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        target: e.target instanceof HTMLElement ? e.target : null,
      });
      if (!a) return;
      switch (a) {
        case "siguiente":
          e.preventDefault();
          if (pvModo === "completo") pvCambiar("lado");
          setView("mid");
          irASiguiente();
          break;
        case "aceptar":
          e.preventDefault();
          aceptarActual();
          break;
        case "preview":
          e.preventDefault();
          if (estrecho()) setView((v) => (v === "preview" ? "mid" : "preview"));
          else pvCambiar(alternarOculto(pvModo));
          break;
        case "completa":
          e.preventDefault();
          pvCambiar(alternarCompleto(pvModo));
          break;
        case "biblioteca":
          e.preventDefault();
          setLibAbierta((v) => !v);
          break;
        case "buscar":
          e.preventDefault();
          setLibAbierta(true);
          requestAnimationFrame(() => libQRef.current?.focus());
          break;
        case "ayuda":
          e.preventDefault();
          setAtajosAbierto((v) => !v);
          break;
        case "escape":
          if (pvModo === "completo") {
            pvCambiar("lado");
          } else if (libAbierta && document.activeElement?.closest("#edLib")) {
            setLibAbierta(false);
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pvModo, pvCambiar, irASiguiente, aceptarActual, libAbierta]);

  // Las notas de la IA al crear la variante (VariantesScreen las deja aquí al
  // saltar directo al editor). Se hidrata ya montado; sin almacenamiento, no hay.
  const [notasIA, setNotasIA] = useState<string | null>(null);
  useEffect(() => {
    try {
      setNotasIA(window.sessionStorage.getItem(`corpus.notasIA.${variantId}`));
    } catch {
      /* sin sessionStorage: las notas se vieron en Variantes y no se repiten */
    }
  }, [variantId]);

  const onDragStart = useCallback(
    (id: string) => {
      dragIdRef.current = id;
      setDraggingId(id);
      sortSnap.current = new Map(items.map((i) => [i.id, i.sort_order]));
    },
    [items],
  );
  const onDragEnd = useCallback(() => {
    dragIdRef.current = null;
    setDraggingId(null);
    const snap = sortSnap.current;
    sortSnap.current = null;
    if (!snap) return;
    items.forEach((i) => {
      const before = snap.get(i.id);
      if (before !== undefined && before !== i.sort_order) patchItem(i.id, { sort_order: i.sort_order });
    });
  }, [items, patchItem]);
  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, overB: VItem, work: VItem) => {
      const dragId = dragIdRef.current;
      if (!dragId || overB.id === dragId) return;
      const drag = items.find((i) => i.id === dragId);
      if (!drag || drag.kind !== "bullet" || !belongsTo(drag, work)) return;
      e.preventDefault();
      const group = bulletsForWork(work);
      const overIndex = group.findIndex((g) => g.id === overB.id);
      const fromIndex = group.findIndex((g) => g.id === dragId);
      const r = e.currentTarget.getBoundingClientRect();
      let to = e.clientY < r.top + r.height / 2 ? overIndex : overIndex + 1;
      if (fromIndex < to) to -= 1;
      reorder(work, dragId, to, false); // se persiste en onDragEnd
    },
    [items, belongsTo, bulletsForWork, reorder],
  );

  // ── Descargar PDF ─────────────────────────────────────────────────────────
  // MISMO endpoint y MISMO body que el preview (solo cambia `download`): el PDF
  // que se descarga es, byte a byte, el que estás viendo. Funciona igual sin
  // Supabase, porque el documento viaja en `data`, no en un id de la base.
  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadPdf = useCallback(async () => {
    flash(t("editor.stPdfGen"));
    setPdfBusy(true);
    try {
      const res = await fetch("/api/cv", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ data: resumeRef.current, download: true, paginas: objetivoRef.current }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (resumeRef.current.basics.name || "corpus").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
      a.download = `CV-${safe}.pdf`;
      a.click();
      // Revocar en el mismo tick corta la descarga en algunos navegadores.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      flash(t("editor.stPdfDone"));
    } catch (e) {
      fail("descarga del PDF", e, "editor.stPdfErr");
    } finally {
      setPdfBusy(false);
    }
  }, [flash, t, fail]);

  // ── Nombre / título objetivo ──
  const onNameBlur = useCallback(
    (e: React.FocusEvent<HTMLSpanElement>) => {
      const name = (e.currentTarget.textContent ?? "").trim();
      if (!name || name === meta?.name) return;
      setMeta((prev) => (prev ? { ...prev, name } : prev));
      patchVariant({ name });
    },
    [meta?.name, patchVariant],
  );
  const onObjBlur = useCallback(() => {
    const t = targetTitle.trim();
    if (t === (meta?.target_title ?? "").trim()) return;
    setMeta((prev) => (prev ? { ...prev, target_title: t } : prev));
    patchVariant({ target_title: t });
  }, [targetTitle, meta?.target_title, patchVariant]);


  // ── Biblioteca (master): el PLAN de grupos, ya filtrado ANTES de pintar ──
  // (ver computeLibPlan y la nota del bug del contador arriba). El texto buscable
  // es la función pura libTextOf, compartida con el plan: buscar «lo que veo».
  const libText = (m: MasterRow): string => libTextOf(m.kind, m.data);

  const mReferences = useMemo(() => master.filter((m) => m.kind === "reference"), [master]);
  // El total de la biblioteca es ESTRUCTURAL (todo lo que el master puede aportar),
  // no lo filtrado: dice cuánto hay, no cuánto se ve ahora mismo.
  const libCount = useMemo(() => master.reduce((n, m) => (libSectionOfKind(m.kind) ? n + 1 : n), 0), [master]);
  // Las pestañas: búsqueda y filtro ya aplicados (planBiblioteca, puro y probado).
  const enVariante = useMemo(() => new Set(items.map((i) => i.item_id)), [items]);
  const libPestanas = useMemo(
    () => planBiblioteca(master, libQ, enVariante, libFiltro),
    [master, libQ, enVariante, libFiltro],
  );
  // La sección del item que se edita en el centro: su pestaña se resalta.
  const editingSection = useMemo<LibSectionId | null>(() => {
    if (!editingId) return null;
    const it = items.find((i) => i.id === editingId);
    return it ? libSectionOfKind(it.kind) : null;
  }, [editingId, items]);


  // ── Grupos de la variante (centro) ──
  const summaryItems = items.filter((i) => i.kind === "summary");
  const workItems = items.filter((i) => i.kind === "work").sort(bySort);
  const skillItems = items.filter((i) => i.kind === "skill").sort(bySort);
  const projectItems = items.filter((i) => i.kind === "project").sort(bySort);
  const eduItems = items.filter((i) => i.kind === "education").sort(bySort);
  const refItems = items.filter((i) => i.kind === "reference").sort(bySort);
  // Los tres kinds que el documento aprendió a pintar. Se listan en la composición
  // igual que la formación: fila con su texto compuesto y su botón de quitar.
  const certItems = items.filter((i) => i.kind === "certification").sort(bySort);
  const langItems = items.filter((i) => i.kind === "language").sort(bySort);
  const pubItems = items.filter((i) => i.kind === "publication").sort(bySort);

  /* ── B · EL INTERRUPTOR Y LA SUGERENCIA ─────────────────────────────────────
     `refsOn` sale del MISMO helper que usa el servidor (referencesOptIn): si aquí
     se leyera el flag "a mano", el preview podría decir que sí y el PDF que no.

     La sugerencia es literalmente eso: aparece cuando una referencia está anclada a
     algo que YA está en la variante y ella todavía no. Se PROPONE con su motivo
     («trabajasteis juntos en X») y un botón. Nada se añade solo — meter datos de
     una tercera persona en un CV sin que nadie lo pulse sería exactamente lo que
     este producto promete no hacer. */
  const refsOn = referencesOptIn(basicsData);
  const itemIdsEnVariante = items.filter((i) => i.visible).map((i) => i.item_id);
  const refsSugeridas = suggestReferences(
    refs,
    itemIdsEnVariante,
    refItems.map((r) => r.item_id),
  );
  const masterLabel = (id: string): string => {
    const m = masterById.get(id);
    return m ? libText(m) : id;
  };


  // basics es IDENTIDAD (portador de foto/QR), no una referencia que el usuario
  // compuso: se excluye de los conteos y del "¿variante vacía?".
  const contentItems = items.filter((i) => i.kind !== "basics");
  const overrideCount = contentItems.filter((i) => i.override_data != null).length;
  const midN = t("editor.midN")
    .replace("{n}", String(contentItems.length))
    .replace("{m}", String(overrideCount));
  const isEmpty = !loading && contentItems.length === 0;

  /* Los huecos por sección (para la navegación fija y el detalle del estado).
     Una viñeta cuenta en la sección de su rol: es donde se ve. */
  const huecosTipo = useMemo(() => {
    const r: Record<FitTipoFalta, number> = { "sin-cifra": 0, "sin-fecha": 0, "sin-respaldo": 0 };
    for (const f of faltas) r[f.tipo] += 1;
    return r;
  }, [faltas]);
  const huecosDe = (list: readonly VItem[], conVinetas = false) =>
    list.reduce(
      (n, it) =>
        n +
        (huecos.get(it.id)?.length ?? 0) +
        (conVinetas ? bulletsForWork(it).reduce((m, b) => m + (huecos.get(b.id)?.length ?? 0), 0) : 0),
      0,
    );
  const huecosTexto = (n: number) =>
    t(n === 1 ? "editor.edHuecosSec1" : "editor.edHuecosSecN").replace("{n}", String(n));
  const secciones: SeccionNav[] = [{ id: "titulo", titulo: t("editor.edSecTitulo") }];
  const pushSec = (id: string, titleKey: string, list: readonly VItem[], h = 0) => {
    if (list.length) secciones.push({ id, titulo: t(titleKey), n: list.length, huecos: h, huecosTexto: huecosTexto(h) });
  };
  pushSec("summary", "editor.groupSummary", summaryItems, huecosDe(summaryItems));
  pushSec("work", "editor.groupExperience", workItems, huecosDe(workItems, true));
  pushSec("skills", "editor.groupSkillsFull", skillItems, huecosDe(skillItems));
  pushSec("projects", "editor.groupProjects", projectItems, huecosDe(projectItems));
  pushSec("education", "editor.groupEducation", eduItems);
  pushSec("certifications", "editor.groupCertifications", certItems);
  pushSec("languages", "editor.groupLanguages", langItems);
  pushSec("publications", "editor.groupPublications", pubItems);
  pushSec("references", "editor.groupReferences", refItems);
  secciones.push({ id: "doc", titulo: t("editor.edSecDocumento") });


  // El estado del DOCUMENTO (cabe · no cabe · midiendo · error): UN indicador en la
  // barra con su detalle; la vista previa ya no pinta avisos propios.
  const estado = estadoDoc({ busy: pvBusy, error: pvError, paginas: pageCount, objetivo, autofit: autofitInfo });

  return {
    variantId, t, paginasTxt, loading, meta, master, items, masterById, vItemByMaster, bulletsForWork,
    // afinar con IA (useAfinar): pinta la variante que devuelve el servidor y avisa
    setItems, flash, aviso,
    // barra
    onNameBlur, stMsg, stAccent, objetivo, elegirObjetivo, downloadPdf, doDeleteVariant,
    confirmDelete, setConfirmDelete, masAbierto, setMasAbierto, atajosAbierto, setAtajosAbierto,
    estado, pageCount, autofitInfo, faltas, huecosTipo, pendientes, fit, fitBusy, fitErr, notasIA,
    runFit, irASiguiente, setView, view, noCabe,
    // biblioteca
    libAbierta, setLibAbierta, libQ, setLibQ, libQRef, libTab, setLibTab, libFiltro, setLibFiltro,
    rolesAbiertos, alternarRol, libPestanas, libCount, editingSection, toggleFromLib,
    // composición
    midRef, secciones, targetTitle, setTargetTitle, onObjBlur, midN, isEmpty,
    summaryItems, workItems, skillItems, projectItems, eduItems, certItems, langItems, pubItems, refItems,
    huecos, enLinea, fitDone, actual, aceptarProp, mark, fitRevertShorten,
    editingId, editRef, startEdit, finishEdit, onEditKeyDown, draggingId, onDragStart, onDragEnd, onDragOver,
    onGripKey, toggleHide, revert, removeItem,
    // documento
    basicsData, basicsOverride, revertContact, onContactBlur, linkRows, updateLinkRow, commitLinks, addLinkRow,
    removeLinkRow, resumeData, docSig, reglas, guardarReglas, estadoReglas, thumbDocHash, designTemplateId, designPaletteId, designTypographyId,
    activeTemplate, savePresentation, galleryOpen, setGalleryOpen, recommendations, effectiveOrder, orderIsCustom,
    printedSections, moveSection, applyOrderPreset, resetOrder, hasBasics, photoOn, photoUrl, photoInputRef,
    busyPhoto, onPhotoFile, togglePhoto, qrChecked, toggleQr, qrMode, changeQrMode, linkOptions, qrCustomMode,
    qrUrl, onQrSelect, onQrCustomInput, refsOn, refsMigracion, refsError, mReferences, refFormOpen, setRefFormOpen,
    refDraft, setRefDraft, refFormErr, setRefFormErr, refSaving, createReferenceFromEditor, refsSugeridas, refs,
    masterLabel,
    // vista previa
    pageRef, bootRef, pvModo, pvAncho, pvCambiar, pvFijar, disponiblePv, arrastrarDivisor, teclaDivisor,
    mode, setMode, pvBusy, pvError, setPvRetry, pdfUrl, xrayText, pvScrollRef,
    // progreso (ui/Progreso) y encuadre de la foto
    pdfBusy, pvSigue, seguirVistaPrevia, fotoEncuadre, setFotoEncuadre, abrirEncuadre, guardarEncuadre,
  };
}

export type Editor = ReturnType<typeof useEditorVariante>;
