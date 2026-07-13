"use client";

import { useEffect, useMemo, useState } from "react";
import { useProfiles } from "@/lib/store/store";
import { serializeWithVariant, buildDefaultVariant, resumeToPlainText } from "@/lib/cv/serialize";

export default function CvPage() {
  const { current } = useProfiles();
  const hasPhoto = !!current.data.basics.photo;
  const [includePhoto, setIncludePhoto] = useState(false);
  // Por defecto: incluir la foto si existe (versión "para persona").
  useEffect(() => { setIncludePhoto(hasPhoto); }, [hasPhoto, current.id]);

  const model = useMemo(
    () => serializeWithVariant(current.data, buildDefaultVariant(current.data, "es"), { includePhoto }),
    [current, includePhoto],
  );
  const ats = useMemo(() => resumeToPlainText(model), [model]);

  const [mode, setMode] = useState<"doc" | "raw">("doc");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch("/api/cv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("No se pudo generar el PDF");
        const blob = await r.blob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [model]);

  async function download() {
    const r = await fetch("/api/cv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, download: true }),
    });
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CV-${(model.name || "corpus").replace(/[^a-z0-9]+/gi, "-")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <header className="page__head cv__head">
        <div>
          <p className="page__eyebrow">Documento</p>
          <h1 className="page__title">{model.name || "Tu CV"}</h1>
        </div>
        <div className="cv__actions">
          <div className="xraytabs">
            <button className={mode === "doc" ? "is-on" : ""} onClick={() => setMode("doc")}>Vista PDF</button>
            <button className={mode === "raw" ? "is-on" : ""} onClick={() => setMode("raw")}>Cómo lo lee el ATS</button>
          </div>
          {hasPhoto ? (
            <label className="cv__photochk">
              <input type="checkbox" checked={includePhoto} onChange={(e) => setIncludePhoto(e.target.checked)} />
              Incluir foto
            </label>
          ) : null}
          <button className="btn btn--gold" onClick={download}>Descargar PDF</button>
        </div>
      </header>

      <div className="cv__stage">
        {mode === "doc" ? (
          err ? (
            <div className="cv__err">{err}</div>
          ) : loading || !pdfUrl ? (
            <div className="cv__loading">Generando el PDF…</div>
          ) : (
            <iframe title="Previsualización del CV" src={pdfUrl} className="cv__frame" />
          )
        ) : (
          <pre className="cv__raw">{ats || "Tu CV está vacío. Ve al Master y agrega tu información."}</pre>
        )}
      </div>

      <p className="cv__hint">
        {mode === "doc"
          ? "Píxel por píxel = el PDF que descargas."
          : "Texto plano · así te ve la máquina. Verificado en CI: coincide con el re-parseo real del PDF."}
      </p>
    </div>
  );
}
