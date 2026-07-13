"use client";

import Link from "next/link";
import { Divider } from "@/components/Divider";

/**
 * Fuentes — ordenadas por verificabilidad (esa jerarquía ES la tesis).
 * SHELL: la conexión real (GitHub OAuth, Jina, ingesta con IA) necesita setup
 * externo (OAuth app, Storage, claves de IA) y el pipeline de ingesta. Aquí está
 * el diseño y el orden; los conectores se activan cuando el backend esté listo.
 */
const SOURCES = [
  {
    key: "github", name: "GitHub", stars: 5,
    note: "Dato duro · API oficial · sin IA. No hay nada que alucinar.",
    detail: "Repos, lenguajes con bytes reales, descripciones, estrellas, topics.",
    cta: "Conectar GitHub",
  },
  {
    key: "portfolio", name: "Portfolio", stars: 5,
    note: "Fuente de primera parte: se lee su propia estructura (JSON-LD / lectura directa).",
    detail: "Pega la URL de tu sitio o portfolio.",
    cta: "Leer portfolio",
  },
  {
    key: "linkedin", name: "LinkedIn", stars: 3,
    note: "Capturas o el PDF de exportación → transcripción verbatim → extracción.",
    detail: "Tu LinkedIn puede estar desactualizado; por eso todo pasa por revisión.",
    cta: "Subir capturas / PDF",
  },
  {
    key: "cv", name: "CV viejo / DOCX", stars: 3,
    note: "El mismo camino: transcripción primero, extracción después.",
    detail: "Aunque esté malo — sobre todo si está malo.",
    cta: "Subir archivo",
  },
];

export default function Fuentes() {
  return (
    <div className="page fuentes">
      <header className="page__head">
        <p className="page__eyebrow">Fuentes</p>
        <h1 className="page__title">Conecta tus fuentes</h1>
        <p className="page__sub">
          Ordenadas por verificabilidad. Lo nuevo va a revisión (staging), nunca directo al master —
          ni siquiera lo que viene de una API: la decisión de qué va en tu CV es tuya.
        </p>
      </header>
      <Divider />

      <div className="src__list">
        {SOURCES.map((s) => (
          <div key={s.key} className="src c-hairline">
            <div className="src__head">
              <h2 className="src__name">{s.name}</h2>
              <span className="src__stars" title={`${s.stars}/5 verificabilidad`}>
                {"★".repeat(s.stars)}{"☆".repeat(5 - s.stars)}
              </span>
            </div>
            <p className="src__note">{s.note}</p>
            <p className="src__detail">{s.detail}</p>
            <div className="src__foot">
              <button className="btn btn--ghost btn--sm" disabled title="Requiere configurar el backend de ingesta">
                {s.cta}
              </button>
              <span className="src__soon">en construcción</span>
            </div>
          </div>
        ))}
      </div>

      <p className="page__foot">
        Mientras la ingesta con IA se termina de construir, puedes cargar tu información a mano en el{" "}
        <Link href="/app/master">Master</Link> — el origen escrito a mano es el más verificable de todos.
      </p>
    </div>
  );
}
