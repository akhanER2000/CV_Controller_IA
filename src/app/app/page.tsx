"use client";

import Link from "next/link";
import { useProfiles } from "@/lib/store/store";
import { Divider } from "@/components/Divider";

export default function Dashboard() {
  const { current, renameCurrent } = useProfiles();
  const d = current.data;
  const skillCount = d.skills.reduce((a, s) => a + s.items.length, 0);
  const counts = [
    { n: d.work.length, k: "experiencias" },
    { n: skillCount, k: "aptitudes" },
    { n: d.projects.length, k: "proyectos" },
    { n: d.education.length, k: "formación" },
  ];
  const total = d.work.length + skillCount + d.projects.length + d.education.length;

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

      <section className="dsec">
        <div className="sechd">
          <h2 className="sech">Tu master</h2>
          <span className="meta">{total} elementos</span>
        </div>
        <Divider />
        <div className="kpis4">
          {counts.map((c) => (
            <div key={c.k} className="kpi">
              <div className="kpi__n">{c.n}</div>
              <div className="kpi__k">{c.k}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="dsec">
        <div className="sechd">
          <h2 className="sech">Acciones</h2>
        </div>
        <Divider />
        <div className="cards2">
          <Link href="/app/master" className="card c-hairline">
            <h3>Editar tu master</h3>
            <p>Todo lo que has hecho: experiencia, aptitudes, formación, proyectos. Se guarda solo.</p>
            <span className="card__go">Abrir editor →</span>
          </Link>
          <Link href="/app/cv" className="card c-hairline">
            <h3>Ver y exportar tu CV</h3>
            <p>Previsualiza el PDF, revisa cómo lo lee el ATS, y descárgalo.</p>
            <span className="card__go">Abrir CV →</span>
          </Link>
        </div>
      </section>

      <p className="page__foot">
        Editando <strong>{current.label}</strong>. Cambia de perfil arriba a la derecha.
      </p>
    </div>
  );
}
