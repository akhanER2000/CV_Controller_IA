"use client";

import { useState } from "react";
import Link from "next/link";
import { useProfiles } from "@/lib/store/store";
import { Divider } from "@/components/Divider";
import { sampleStaging } from "@/lib/cv/staging";
import type { Profile, StagedItem } from "@/lib/cv/serialize";

const uid = () => `id-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

const LEVEL: Record<StagedItem["evidenceLevel"], { label: string; cls: string; glyph: string }> = {
  verified: { label: "Verificado", cls: "lvl-ver", glyph: "◆" },
  api: { label: "Dato de API", cls: "lvl-ver", glyph: "◆" },
  partial: { label: "Parcial", cls: "lvl-par", glyph: "◈" },
  unverified: { label: "Sin evidencia", cls: "lvl-unv", glyph: "⚠" },
};

/** Promueve un item aceptado al master (nada entra sin esta acción explícita). */
function promote(d: Profile, item: StagedItem): Profile {
  const nd = structuredClone(d);
  const pl = item.payload as never;
  if (item.section === "work") nd.work.push(pl);
  else if (item.section === "projects") nd.projects.push(pl);
  else if (item.section === "education") nd.education.push(pl);
  else if (item.section === "summary") nd.basics.summaries.push(pl);
  else if (item.section === "skills") {
    let cat = nd.skills.find((c) => c.category === "Importadas");
    if (!cat) { cat = { id: uid(), category: "Importadas", items: [] }; nd.skills.push(cat); }
    cat.items.push(pl);
  }
  nd.staged = (nd.staged ?? []).filter((s) => s.id !== item.id);
  return nd;
}

export default function Staging() {
  const { current, updateCurrentData } = useProfiles();
  const staged = current.data.staged ?? [];
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<Record<string, "confirm" | "dismiss">>({});

  const accepted = current.data.work.length; // referencia laxa; el foco es lo pendiente
  const batch = staged.filter((s) => s.evidenceLevel === "verified" || s.evidenceLevel === "api");

  function toggle(id: string) {
    setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function act(item: StagedItem, kind: "accept" | "reject") {
    setLeaving((l) => ({ ...l, [item.id]: kind === "accept" ? "confirm" : "dismiss" }));
    window.setTimeout(() => {
      updateCurrentData((d) =>
        kind === "accept" ? promote(d, item) : { ...d, staged: (d.staged ?? []).filter((s) => s.id !== item.id) },
      );
      setLeaving((l) => { const n = { ...l }; delete n[item.id]; return n; });
    }, 200);
  }

  function acceptAllVerified() {
    updateCurrentData((d) => {
      let nd = d;
      for (const item of (d.staged ?? []).filter((s) => s.evidenceLevel === "verified" || s.evidenceLevel === "api")) {
        nd = promote(nd, item);
      }
      return nd;
    });
  }

  function loadSample() {
    updateCurrentData((d) => ({ ...d, staged: sampleStaging() }));
  }

  if (staged.length === 0) {
    return (
      <div className="page">
        <header className="page__head">
          <p className="page__eyebrow">Revisión</p>
          <h1 className="page__title">Nada pendiente</h1>
          <p className="page__sub">Tu master está al día. Lo que extraigan tus fuentes aparecerá aquí para que lo confirmes.</p>
        </header>
        <Divider />
        <div className="door c-hairline">
          <p className="dnum">Probar la revisión</p>
          <h3>Carga un ejemplo de extracción</h3>
          <p>
            Simula lo que la ingesta con IA produciría: items con su procedencia y nivel de verificación,
            para que veas cómo se revisa. (Cuando la ingesta real esté lista, esto se llena solo.)
          </p>
          <button className="btn btn--gold" onClick={loadSample}>Cargar ejemplo (simulación)</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page stg">
      <header className="page__head">
        <p className="page__eyebrow">Revisión · {staged.length} por revisar · {accepted} en el master</p>
        <h1 className="page__title">Nada entra a tu master sin que lo confirmes.</h1>
        <p className="page__sub">Revisa lo que se extrajo. Cada item muestra de dónde salió.</p>
      </header>
      <Divider />

      {batch.length > 0 && (
        <div className="batch">
          <span>
            <strong>Aceptar toda la sección verificada ({batch.length})</strong> con un clic. Los de
            «parcial» y «sin evidencia» se revisan uno a uno.
          </span>
          <button className="btn btn--gold btn--sm" onClick={acceptAllVerified}>Aceptar {batch.length} verificados</button>
        </div>
      )}

      <ul className="stg__list c-stagger is-running">
        {staged.map((item) => {
          const lv = LEVEL[item.evidenceLevel];
          const isOpen = open.has(item.id);
          const leave = leaving[item.id];
          return (
            <li
              key={item.id}
              className={`stg__item c-stagger-item${item.evidenceLevel === "unverified" ? " c-unverified" : ""}${leave ? ` c-${leave}` : ""}`}
            >
              <p className="stg__preview">{item.preview}</p>
              <div className="stg__meta">
                <span className="stg__origin">{item.origin}</span>
                <span className={`lvl ${lv.cls}`}>{lv.glyph} {lv.label}</span>
                {item.evidence ? (
                  <button className="stg__evtoggle" onClick={() => toggle(item.id)}>
                    {isOpen ? "ocultar evidencia" : "ver evidencia"}
                  </button>
                ) : null}
              </div>
              {isOpen && item.evidence ? (
                <p className={`stg__ev${item.evidenceLevel === "unverified" ? " stg__ev--unv" : ""}`}>
                  {item.evidenceLevel === "unverified" ? "" : "Fragmento en la fuente: "}{item.evidence}
                </p>
              ) : null}
              <div className="stg__acts">
                {item.evidenceLevel === "unverified" ? (
                  <button className="btn btn--ghost btn--sm" onClick={() => act(item, "accept")}>Editar y respaldar</button>
                ) : (
                  <button className="btn btn--gold btn--sm" onClick={() => act(item, "accept")}>Aceptar</button>
                )}
                <button className="btn btn--ghost btn--sm" onClick={() => act(item, "reject")}>Descartar</button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="page__foot">
        Al aceptar, el item entra en tu <Link href="/app/master">master</Link>. Nada se guarda sin este paso.
      </p>
    </div>
  );
}
