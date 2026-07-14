"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProfiles } from "@/lib/store/store";
import { Divider } from "@/components/Divider";
import type { StagedItem } from "@/lib/cv/serialize";

type Phase = "idle" | "reading" | "done" | "error";

const PLACEHOLDER = `Pega aquí lo que tengas sobre tu carrera: el "Acerca de" de tu LinkedIn, el texto de tu CV viejo, una bio de tu portfolio…

Si dentro pones la URL de tu GitHub (github.com/tu-usuario) o de tu portfolio, también los leo: de GitHub saco lenguajes y repos como dato duro, sin IA.`;

export default function Importar() {
  const { updateCurrentData } = useProfiles();
  const router = useRouter();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ staged: StagedItem[]; sources: string[]; linkedinWarning: boolean } | null>(null);

  async function run() {
    setPhase("reading");
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/import/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No pude leer tus fuentes.");
      const staged = data.staged as StagedItem[];
      updateCurrentData((d) => ({ ...d, staged: [...(d.staged ?? []), ...staged] }));
      setResult({ staged, sources: data.sources ?? [], linkedinWarning: !!data.linkedinWarning });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude leer tus fuentes.");
      setPhase("error");
    }
  }

  // ── Estado: leyendo ────────────────────────────────────────────────────────
  if (phase === "reading") {
    return (
      <div className="page imp">
        <header className="page__head">
          <p className="page__eyebrow">Con IA · desde tus fuentes</p>
          <h1 className="page__title">Leyendo tus fuentes…</h1>
          <p className="page__sub">Esto tarda unos segundos. No inventamos nada: solo estructuramos lo que ya está ahí.</p>
        </header>
        <Divider />
        <div className="imp__wait c-hairline">
          <span className="c-thinking" aria-hidden />
          <p>Detectando enlaces, trayendo dato duro de GitHub y extrayendo tu experiencia…</p>
        </div>
      </div>
    );
  }

  // ── Estado: listo ──────────────────────────────────────────────────────────
  if (phase === "done" && result) {
    const n = result.staged.length;
    return (
      <div className="page imp">
        <header className="page__head">
          <p className="page__eyebrow">Con IA · desde tus fuentes</p>
          <h1 className="page__title c-shimmer is-firing">Listo. {n} items para que revises.</h1>
          <p className="page__sub">Nada entró todavía a tu master. Cada item muestra de dónde salió; tú confirmas uno a uno.</p>
        </header>
        <Divider />

        <div className="imp__sources">
          {result.sources.map((s) => <span key={s} className="imp__src c-hairline">{s}</span>)}
        </div>

        {result.linkedinWarning && (
          <div className="imp__note c-override">
            <strong>Detecté un enlace de LinkedIn.</strong> LinkedIn no deja leer perfiles desde un servidor
            (hay que iniciar sesión). Para traer eso: entra a tu LinkedIn, copia el texto de tu «Acerca de» y de
            tu experiencia, y pégalo aquí arriba; o exporta tu perfil a PDF y súbelo cuando esté esa opción.
          </div>
        )}

        <div className="imp__cta">
          <button className="btn btn--gold" onClick={() => router.push("/app/staging")}>Revisar {n} items</button>
          <button className="btn btn--ghost" onClick={() => { setPhase("idle"); setText(""); }}>Pegar más</button>
        </div>
      </div>
    );
  }

  // ── Estado: entrada (pega lo que tengas) ─────────────────────────────────────
  return (
    <div className="page imp">
      <header className="page__head">
        <p className="page__eyebrow">Con IA · desde tus fuentes</p>
        <h1 className="page__title">Pega lo que tengas. Yo armo tu master.</h1>
        <p className="page__sub">
          La IA extrae; <strong>tú confirmas cada item</strong> antes de que entre al master. No inventa nada:
          de cada dato guarda el fragmento exacto de donde salió.
        </p>
      </header>
      <Divider />

      <textarea
        className="imp__box c-hairline c-focusable"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={14}
      />

      {phase === "error" && <p className="imp__err">{error}</p>}

      <div className="imp__cta">
        <button className="btn btn--gold" onClick={run} disabled={text.trim().length < 20}>
          Armar mi master
        </button>
        <span className="imp__hint">Dato duro de GitHub · sin IA · no hay nada que alucinar</span>
      </div>
    </div>
  );
}
