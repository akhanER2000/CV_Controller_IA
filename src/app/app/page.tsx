"use client";

import Link from "next/link";
import { useProfiles } from "@/lib/store/store";
import { Divider } from "@/components/Divider";
import { serializeWithVariant, buildDefaultVariant } from "@/lib/cv/serialize";
import type { Variant } from "@/lib/cv/serialize";

export default function Dashboard() {
  const { current, renameCurrent, addVariant, deleteVariant } = useProfiles();
  const d = current.data;
  const variants = d.variants ?? [];
  const skillCount = d.skills.reduce((a, s) => a + s.items.length, 0);
  const masterCount =
    d.work.length + skillCount + d.projects.length + d.education.length + d.certifications.length + d.languages.length;

  async function downloadVariant(v: Variant) {
    const model = serializeWithVariant(d, v, { includePhoto: !!d.basics.photo });
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

  function newVariant() {
    const name = window.prompt("Nombre de la variante (p. ej. Backend, Frontend, Data):", "");
    if (name === null) return;
    addVariant(name.trim());
  }

  return (
    <div className="page dash">
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
      <Divider />

      <section className="dsec">
        <div className="sechd">
          <h2 className="sech">Mis variantes</h2>
          <div className="sechd__right">
            <span className="meta">{variants.length} {variants.length === 1 ? "variante" : "variantes"}</span>
            <button className="btn btn--gold btn--sm" onClick={newVariant}>+ Nueva variante</button>
          </div>
        </div>
        <Divider />

        {variants.length === 0 ? (
          <div className="door c-hairline">
            <p className="dnum">Empieza aquí</p>
            <h3>Crea tu primera variante de CV</h3>
            <p>Un CV por rol o empresa, todos derivados de tu master. Lo escribes una vez.</p>
            <button className="btn btn--gold" onClick={newVariant}>Crear variante</button>
          </div>
        ) : (
          <div className="vgrid">
            {variants.map((v) => (
              <div key={v.id} className={`vcard c-hairline${v.isGoldenSource ? " is-gold" : ""}`}>
                <div className="vt">
                  <Link href={`/app/cv?v=${v.id}`} className="vname">{v.name || "Variante"}</Link>
                  <span className="pageb">
                    {(v.language || "es").toUpperCase()}{v.pages ? ` · ${v.pages}p` : ""}
                  </span>
                </div>
                <p className="vrole">{v.targetTitle || v.role || "Sin título objetivo"}</p>
                <div className="vfoot">
                  <div className="vacts">
                    <Link href={`/app/cv?v=${v.id}`} className="btn btn--ghost btn--sm">Abrir</Link>
                    <button className="btn btn--ghost btn--sm" onClick={() => downloadVariant(v)}>PDF</button>
                  </div>
                  <button
                    className="vdel"
                    title="Eliminar variante"
                    onClick={() => { if (window.confirm(`¿Eliminar la variante "${v.name || ""}"?`)) deleteVariant(v.id); }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dsec">
        <div className="sechd">
          <h2 className="sech">Tu master</h2>
          <span className="meta">{masterCount} elementos</span>
        </div>
        <Divider />
        <div className="dpanel">
          <div className="dstats">
            <div className="dstat"><span className="dstat__n">{d.work.length}</span><span className="dstat__k">experiencias</span></div>
            <div className="dstat"><span className="dstat__n">{skillCount}</span><span className="dstat__k">aptitudes</span></div>
            <div className="dstat"><span className="dstat__n">{d.projects.length}</span><span className="dstat__k">proyectos</span></div>
            <div className="dstat"><span className="dstat__n">{d.education.length}</span><span className="dstat__k">formación</span></div>
          </div>
          <Link href="/app/master" className="btn btn--ghost">Editar master →</Link>
        </div>
      </section>

      <p className="page__foot">
        Editando <strong>{current.label}</strong>. Cambia de perfil arriba a la derecha.
      </p>
    </div>
  );
}
