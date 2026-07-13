"use client";

import Link from "next/link";
import { useProfiles } from "@/lib/store/store";

export default function Dashboard() {
  const { current, renameCurrent } = useProfiles();
  const d = current.data;
  const counts = [
    { n: d.work.length, k: "experiencias" },
    { n: d.skills.reduce((a, s) => a + s.items.length, 0), k: "aptitudes" },
    { n: d.projects.length, k: "proyectos" },
    { n: d.education.length, k: "formación" },
  ];

  return (
    <div className="page">
      <header className="page__head">
        <p className="page__eyebrow">Panel</p>
        <input
          className="page__titleedit"
          value={current.label}
          onChange={(e) => renameCurrent(e.target.value)}
          aria-label="Nombre del perfil"
        />
        <p className="page__sub">
          {d.basics.name || "Sin nombre"}
          {d.basics.targetTitleDefault ? ` · ${d.basics.targetTitleDefault}` : ""}
        </p>
      </header>

      <div className="kpis4">
        {counts.map((c) => (
          <div key={c.k} className="kpi">
            <div className="kpi__n">{c.n}</div>
            <div className="kpi__k">{c.k}</div>
          </div>
        ))}
      </div>

      <div className="cards2">
        <Link href="/app/master" className="card">
          <h3>Editar tu master</h3>
          <p>Todo lo que has hecho: experiencia, aptitudes, formación, proyectos. Se guarda solo.</p>
          <span className="card__go">Abrir editor →</span>
        </Link>
        <Link href="/app/cv" className="card">
          <h3>Ver y exportar tu CV</h3>
          <p>Previsualiza el PDF, revisa cómo lo lee el ATS, y descárgalo.</p>
          <span className="card__go">Abrir CV →</span>
        </Link>
      </div>

      <p className="page__foot">
        Estás editando <strong>{current.label}</strong>. Cambia de perfil arriba a la derecha.
      </p>
    </div>
  );
}
