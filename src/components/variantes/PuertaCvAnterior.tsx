"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnchoFijo } from "@/components/ui/Progreso";
import { createClient } from "@/lib/supabase/client";
import { fileKindFromName, safeStorageName } from "@/lib/db/sources";
import { useT } from "@/lib/i18n";
import { CLAVE_AVISO_DESDE_CV } from "./AvisoDesdeCv";

/* ============================================================================
   CUARTA PUERTA · «Partir de mi CV anterior» (DA-V7)
   ============================================================================
   Subo mi CV (PDF o DOCX) → Corpus lo lee con la extracción de siempre → reviso
   lo nuevo (lo que ya está en el master se reconoce y no se vuelve a crear) →
   crea una variante con exactamente esos items, en su orden, con su título.

   El progreso lo pinta el <Progreso> flotante de la pantalla (pasos reales:
   leyendo, extrayendo, verificando, creando): esta puerta solo dice en qué paso
   está. Los botones no se mueven (AnchoFijo).
   ============================================================================ */

export interface ItemRevision {
  kind: string;
  texto: string;
  pagina: number | null;
  ya: boolean;
  verificado: boolean;
}

export interface Revision {
  sourceId: string;
  titulo: string;
  nombre: string;
  items: ItemRevision[];
  total: number;
  nuevos: number;
}

type Linea =
  | { tipo: "paso"; paso: number }
  | ({ tipo: "revision" } & Revision)
  | { tipo: "error"; error: string };

async function leerLineas(res: Response, cada: (l: Linea) => void): Promise<void> {
  if (!res.body) {
    for (const l of (await res.text()).split("\n")) if (l.trim()) cada(JSON.parse(l) as Linea);
    return;
  }
  const lector = res.body.getReader();
  const dec = new TextDecoder();
  let resto = "";
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    let i: number;
    while ((i = resto.indexOf("\n")) >= 0) {
      const l = resto.slice(0, i).trim();
      resto = resto.slice(i + 1);
      if (l) cada(JSON.parse(l) as Linea);
    }
  }
  if (resto.trim()) cada(JSON.parse(resto) as Linea);
}

export interface PuertaCvAnteriorProps {
  /** otra puerta está trabajando */
  bloqueado: boolean;
  /** esta puerta empieza / termina de trabajar (bloquea las demás) */
  alOcupar(ocupada: boolean): void;
  /** el paso real en curso para el <Progreso> de la pantalla; null = nada en vuelo */
  alProgreso(p: { pasos: string[]; paso: number } | null): void;
}

export function PuertaCvAnterior({ bloqueado, alOcupar, alProgreso }: PuertaCvAnteriorProps) {
  const t = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<"reposo" | "leyendo" | "revision" | "creando">("reposo");
  const [rev, setRev] = useState<Revision | null>(null);
  const [err, setErr] = useState("");
  const pasos = [
    t("variantes.cv.paso.leyendo"),
    t("variantes.cv.paso.extrayendo"),
    t("variantes.cv.paso.verificando"),
    t("variantes.cv.paso.creando"),
  ];

  const terminar = (e?: string) => {
    setFase(rev ? "revision" : "reposo");
    alOcupar(false);
    alProgreso(null);
    if (e) setErr(e);
  };

  async function subir(file: File) {
    setErr("");
    const kind = fileKindFromName(file.name, file.type || undefined);
    if (kind !== "pdf" && kind !== "docx") {
      setErr(t("variantes.cv.errTipo"));
      return;
    }
    setRev(null);
    setFase("leyendo");
    alOcupar(true);
    alProgreso({ pasos, paso: 0 });
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(t("variantes.cv.errSesion"));
      const path = `${user.id}/${crypto.randomUUID()}/${safeStorageName(file.name)}`;
      const { error } = await supabase.storage
        .from("sources")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw new Error(error.message);

      const res = await fetch("/api/variants/desde-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "leer", path, name: file.name }),
      });
      if (!res.ok && !res.headers.get("content-type")?.includes("ndjson")) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || t("variantes.cv.errLeer"));
      }
      const fin: { revision: Revision | null; fallo: string } = { revision: null, fallo: "" };
      await leerLineas(res, (l) => {
        if (l.tipo === "paso") alProgreso({ pasos, paso: l.paso });
        else if (l.tipo === "revision") fin.revision = l;
        else fin.fallo = l.error;
      });
      if (!fin.revision) throw new Error(fin.fallo || t("variantes.cv.errLeer"));
      setRev(fin.revision);
      setFase("revision");
      alOcupar(false);
      alProgreso(null);
    } catch (e) {
      setFase("reposo");
      alOcupar(false);
      alProgreso(null);
      setErr(e instanceof Error && e.message ? e.message : t("variantes.cv.errLeer"));
    }
  }

  async function crear() {
    if (!rev) return;
    setErr("");
    setFase("creando");
    alOcupar(true);
    alProgreso({ pasos, paso: 3 });
    try {
      const res = await fetch("/api/variants/desde-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "crear", sourceId: rev.sourceId }),
      });
      const j = (await res.json()) as { variant?: { id: string }; items?: number; nuevos?: number; error?: string };
      if (!res.ok || !j.variant) throw new Error(j.error || t("variantes.cv.errCrear"));
      try {
        window.sessionStorage.setItem(
          `${CLAVE_AVISO_DESDE_CV}.${j.variant.id}`,
          JSON.stringify({ items: j.items ?? 0, nuevos: j.nuevos ?? 0 }),
        );
      } catch {
        /* sin sessionStorage: se abre igual, sin el aviso */
      }
      // `ocupada` se queda puesto: nada se puede pulsar mientras se navega al editor.
      router.push(`/app/variantes/${j.variant.id}`);
    } catch (e) {
      terminar(e instanceof Error && e.message ? e.message : t("variantes.cv.errCrear"));
    }
  }

  function cancelar() {
    setRev(null);
    setFase("reposo");
    setErr("");
  }

  const ocupada = fase === "leyendo" || fase === "creando";
  const ya = rev ? rev.items.filter((i) => i.ya) : [];
  const nuevos = rev ? rev.items.filter((i) => !i.ya) : [];

  return (
    <div className="vr-puerta vr-puerta--cv" data-fase={fase}>
      <span className="t-overline vr-cv-over">{t("variantes.cv.label")}</span>
      <div className="vr-cv-fila">
        <input
          ref={input}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="vr-cv-input"
          aria-label={t("variantes.cv.inputAria")}
          data-testid="cv-anterior-input"
          disabled={bloqueado || ocupada}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void subir(f);
          }}
        />
        <button
          type="button"
          className="c-btn"
          disabled={bloqueado || ocupada}
          onClick={() => input.current?.click()}
        >
          <AnchoFijo ocupado={fase === "leyendo"} reposo={t("variantes.cv.subir")} carga={t("variantes.cv.leyendo")} />
        </button>
        <span className="vr-cv-hint">{t("variantes.cv.hint")}</span>
      </div>

      {rev && (
        <section className="vr-cv-rev" aria-labelledby="vr-cv-rev-t" data-testid="cv-anterior-revision">
          <h3 id="vr-cv-rev-t" className="vr-cv-rev-t">
            {t("variantes.cv.revTitulo")}
          </h3>
          <p className="vr-cv-rev-sub">
            {t("variantes.cv.revResumen")
              .replace("{n}", String(rev.total))
              .replace("{m}", String(rev.nuevos))
              .replace("{y}", String(rev.total - rev.nuevos))}
            {rev.titulo ? (
              <>
                {" "}
                {t("variantes.cv.revTitulo2").replace("{t}", rev.titulo)}
              </>
            ) : null}
          </p>
          {nuevos.length > 0 && (
            <ul className="vr-cv-lista" aria-label={t("variantes.cv.revNuevos")}>
              {nuevos.map((it, k) => (
                <li key={`n${k}`} className="vr-cv-item" data-ya="no">
                  <span className="vr-cv-kind">{t(`variantes.cv.kind.${it.kind}`)}</span>
                  <span className="vr-cv-txt">{it.texto}</span>
                  <span className="vr-cv-proc">
                    {it.pagina
                      ? t("variantes.cv.procPagina").replace("{p}", String(it.pagina))
                      : t("variantes.cv.proc")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {ya.length > 0 && (
            <details className="vr-cv-ya">
              <summary>{t("variantes.cv.revYa").replace("{y}", String(ya.length))}</summary>
              <ul className="vr-cv-lista">
                {ya.map((it, k) => (
                  <li key={`y${k}`} className="vr-cv-item" data-ya="si">
                    <span className="vr-cv-kind">{t(`variantes.cv.kind.${it.kind}`)}</span>
                    <span className="vr-cv-txt">{it.texto}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="vr-cv-acts">
            <button type="button" className="c-btn c-btn--patina" disabled={bloqueado || ocupada} onClick={() => void crear()}>
              <AnchoFijo ocupado={fase === "creando"} reposo={t("variantes.cv.crear")} carga={t("variantes.cv.creando")} />
            </button>
            <button type="button" className="c-btn c-btn--quiet" disabled={ocupada} onClick={cancelar}>
              {t("variantes.cv.cancelar")}
            </button>
            <span className="vr-cv-hint">{t("variantes.cv.cancelarHint")}</span>
          </div>
        </section>
      )}

      {err ? (
        <p className="vr-cv-err" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
