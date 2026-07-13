"use client";

import Link from "next/link";
import { useProfiles } from "@/lib/store/store";
import { Divider } from "@/components/Divider";
import type { Profile } from "@/lib/cv/serialize";

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.round(Math.random() * 1e6)}`);

/** Encabezado de sección: título Playfair + la hairline dorada que se dibuja. */
function SectionHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <>
      <div className="ed__sechead">
        <h2 className="ed__h2">{title}</h2>
        {action}
      </div>
      <Divider />
    </>
  );
}

export default function MasterEditor() {
  const { current, updateCurrentData } = useProfiles();
  const d = current.data;

  // Edición inmutable simple: clona, muta, devuelve. Se guarda solo (localStorage).
  const edit = (fn: (draft: Profile) => void) =>
    updateCurrentData((data) => {
      const nd = structuredClone(data);
      fn(nd);
      return nd;
    });

  return (
    <div className="page ed">
      <header className="page__head">
        <p className="page__eyebrow">Master · {current.label}</p>
        <h1 className="page__title">Tu registro completo</h1>
        <p className="page__sub">Todo lo que has hecho. Se guarda solo mientras escribes.</p>
      </header>

      <div className="ed__toolbar">
        <span className="ed__count">
          {d.work.length + d.education.length + d.projects.length + d.certifications.length +
            d.languages.length + d.skills.reduce((n, s) => n + s.items.length, 0)}{" "}
          elementos
        </span>
        <Link href="/app/cv" className="btn btn--ghost">Ver y exportar CV →</Link>
      </div>

      {/* IDENTIDAD */}
      <section className="ed__sec">
        <SectionHead title="Identidad" />
        <div className="ed__grid2">
          <Field label="Nombre completo" value={d.basics.name} onChange={(v) => edit((x) => { x.basics.name = v; })} />
          <Field label="Título objetivo por defecto" value={d.basics.targetTitleDefault ?? ""} onChange={(v) => edit((x) => { x.basics.targetTitleDefault = v; })} placeholder="Ingeniero de Software Senior" />
        </div>
        <PhotoField value={d.basics.photo} onChange={(v) => edit((x) => { x.basics.photo = v; })} />
      </section>

      {/* CONTACTO */}
      <section className="ed__sec">
        <SectionHead
          title="Contacto"
          action={<button className="ed__add" onClick={() => edit((x) => { x.basics.contacts.push({ type: "manual", label: "", value: "", visible: true }); })}>+ Añadir</button>}
        />
        {d.basics.contacts.map((c, i) => (
          <div className="ed__row3" key={i}>
            <Field label="Etiqueta" value={c.label} onChange={(v) => edit((x) => { x.basics.contacts[i]!.label = v; })} placeholder="Email" />
            <Field label="Valor" value={c.value} onChange={(v) => edit((x) => { x.basics.contacts[i]!.value = v; })} placeholder="tu@correo.cl" />
            <Remove onClick={() => edit((x) => { x.basics.contacts.splice(i, 1); })} />
          </div>
        ))}
      </section>

      {/* RESUMEN */}
      <section className="ed__sec">
        <SectionHead
          title="Resumen"
          action={<button className="ed__add" onClick={() => edit((x) => { x.basics.summaries.push({ id: uid(), text: "" }); })}>+ Añadir</button>}
        />
        {d.basics.summaries.map((sm, i) => (
          <div className="ed__stack" key={sm.id}>
            <Area label={`Resumen ${i + 1}`} value={sm.text} onChange={(v) => edit((x) => { x.basics.summaries[i]!.text = v; })} placeholder="Ingeniero de software con 8 años…" />
            <Remove onClick={() => edit((x) => { x.basics.summaries.splice(i, 1); })} />
          </div>
        ))}
      </section>

      {/* EXPERIENCIA */}
      <section className="ed__sec">
        <SectionHead
          title="Experiencia"
          action={<button className="ed__add" onClick={() => edit((x) => { x.work.push({ id: uid(), title: "", orgLegal: "", location: "", start: "", end: null, current: false, bullets: [] }); })}>+ Añadir</button>}
        />
        {d.work.map((w, i) => (
          <div className="ed__card" key={w.id}>
            <div className="ed__grid2">
              <Field label="Cargo" value={w.title} onChange={(v) => edit((x) => { x.work[i]!.title = v; })} placeholder="Senior Backend Engineer" />
              <Field label="Empresa (con identificador legal)" value={w.orgLegal} onChange={(v) => edit((x) => { x.work[i]!.orgLegal = v; })} placeholder="Fintual … S.A." />
            </div>
            <div className="ed__grid3">
              <Field label="Ubicación" value={w.location} onChange={(v) => edit((x) => { x.work[i]!.location = v; })} placeholder="Santiago, Chile" />
              <Field label="Inicio (AAAA-MM)" value={w.start} onChange={(v) => edit((x) => { x.work[i]!.start = v; })} placeholder="2021-01" />
              <Field label="Fin (AAAA-MM · vacío = actual)" value={w.end ?? ""} onChange={(v) => edit((x) => { x.work[i]!.end = v || null; x.work[i]!.current = !v; })} placeholder="2020-12" />
            </div>
            <ListEditor
              label="Viñetas"
              items={w.bullets.map((b) => b.text)}
              onAdd={() => edit((x) => { x.work[i]!.bullets.push({ id: uid(), text: "" }); })}
              onChange={(j, v) => edit((x) => { x.work[i]!.bullets[j]!.text = v; })}
              onRemove={(j) => edit((x) => { x.work[i]!.bullets.splice(j, 1); })}
              placeholder="Reduje la latencia p99 de 850 ms a 180 ms…"
            />
            <Remove label="Eliminar experiencia" onClick={() => edit((x) => { x.work.splice(i, 1); })} />
          </div>
        ))}
      </section>

      {/* APTITUDES */}
      <section className="ed__sec">
        <SectionHead
          title="Aptitudes técnicas"
          action={<button className="ed__add" onClick={() => edit((x) => { x.skills.push({ id: uid(), category: "", items: [] }); })}>+ Categoría</button>}
        />
        {d.skills.map((s, i) => (
          <div className="ed__card" key={s.id}>
            <Field label="Categoría" value={s.category} onChange={(v) => edit((x) => { x.skills[i]!.category = v; })} placeholder="Lenguajes" />
            <ListEditor
              label="Aptitudes (una por línea)"
              items={s.items.map((it) => it.name)}
              onAdd={() => edit((x) => { x.skills[i]!.items.push({ name: "" }); })}
              onChange={(j, v) => edit((x) => { x.skills[i]!.items[j]!.name = v; })}
              onRemove={(j) => edit((x) => { x.skills[i]!.items.splice(j, 1); })}
              placeholder="Go"
              compact
            />
            <Remove label="Eliminar categoría" onClick={() => edit((x) => { x.skills.splice(i, 1); })} />
          </div>
        ))}
      </section>

      {/* EDUCACIÓN */}
      <section className="ed__sec">
        <SectionHead
          title="Educación"
          action={<button className="ed__add" onClick={() => edit((x) => { x.education.push({ id: uid(), degree: "", institution: "", location: "", start: "", end: "", notes: [] }); })}>+ Añadir</button>}
        />
        {d.education.map((e, i) => (
          <div className="ed__card" key={e.id}>
            <div className="ed__grid2">
              <Field label="Título / grado" value={e.degree} onChange={(v) => edit((x) => { x.education[i]!.degree = v; })} placeholder="Ingeniería Civil en Computación" />
              <Field label="Institución" value={e.institution} onChange={(v) => edit((x) => { x.education[i]!.institution = v; })} placeholder="Universidad de Chile" />
            </div>
            <div className="ed__grid3">
              <Field label="Ubicación" value={e.location} onChange={(v) => edit((x) => { x.education[i]!.location = v; })} placeholder="Santiago, Chile" />
              <Field label="Inicio (AAAA)" value={e.start} onChange={(v) => edit((x) => { x.education[i]!.start = v; })} placeholder="2011" />
              <Field label="Fin (AAAA)" value={e.end} onChange={(v) => edit((x) => { x.education[i]!.end = v; })} placeholder="2016" />
            </div>
            <ListEditor
              label="Notas (memoria, distinciones…)"
              items={(e.notes ?? []).map((n) => n.text)}
              onAdd={() => edit((x) => { (x.education[i]!.notes ??= []).push({ id: uid(), text: "" }); })}
              onChange={(j, v) => edit((x) => { x.education[i]!.notes![j]!.text = v; })}
              onRemove={(j) => edit((x) => { x.education[i]!.notes!.splice(j, 1); })}
              placeholder="Memoria: detección de fraude…"
            />
            <Remove label="Eliminar formación" onClick={() => edit((x) => { x.education.splice(i, 1); })} />
          </div>
        ))}
      </section>

      {/* PROYECTOS */}
      <section className="ed__sec">
        <SectionHead
          title="Proyectos"
          action={<button className="ed__add" onClick={() => edit((x) => { x.projects.push({ id: uid(), name: "", url: null, start: "", end: null, org: "", bullets: [] }); })}>+ Añadir</button>}
        />
        {d.projects.map((p, i) => (
          <div className="ed__card" key={p.id}>
            <Field label="Nombre" value={p.name} onChange={(v) => edit((x) => { x.projects[i]!.name = v; })} placeholder="pago-conciliador — librería open source (Go)" />
            <div className="ed__grid3">
              <Field label="URL (opcional)" value={p.url ?? ""} onChange={(v) => edit((x) => { x.projects[i]!.url = v || null; })} placeholder="github.com/…" />
              <Field label="Inicio (AAAA)" value={p.start} onChange={(v) => edit((x) => { x.projects[i]!.start = v; })} placeholder="2022" />
              <Field label="Fin (AAAA · vacío = actual)" value={p.end ?? ""} onChange={(v) => edit((x) => { x.projects[i]!.end = v || null; })} placeholder="2023" />
            </div>
            <Field label="Meta (organización · detalle, opcional)" value={p.org ?? ""} onChange={(v) => edit((x) => { x.projects[i]!.org = v; })} placeholder="Meetup Golang Chile · 180 asistentes" />
            <ListEditor
              label="Viñetas"
              items={p.bullets.map((b) => b.text)}
              onAdd={() => edit((x) => { x.projects[i]!.bullets.push({ id: uid(), text: "" }); })}
              onChange={(j, v) => edit((x) => { x.projects[i]!.bullets[j]!.text = v; })}
              onRemove={(j) => edit((x) => { x.projects[i]!.bullets.splice(j, 1); })}
              placeholder="Librería de conciliación; 320 estrellas…"
            />
            <Remove label="Eliminar proyecto" onClick={() => edit((x) => { x.projects.splice(i, 1); })} />
          </div>
        ))}
      </section>

      {/* CERTIFICACIONES */}
      <section className="ed__sec">
        <SectionHead
          title="Certificaciones"
          action={<button className="ed__add" onClick={() => edit((x) => { x.certifications.push({ id: uid(), name: "", year: "" }); })}>+ Añadir</button>}
        />
        {d.certifications.map((c, i) => (
          <div className="ed__row3" key={c.id}>
            <Field label="Nombre" value={c.name} onChange={(v) => edit((x) => { x.certifications[i]!.name = v; })} placeholder="AWS Certified Solutions Architect – Associate" />
            <Field label="Año" value={c.year} onChange={(v) => edit((x) => { x.certifications[i]!.year = v; })} placeholder="2022" />
            <Remove onClick={() => edit((x) => { x.certifications.splice(i, 1); })} />
          </div>
        ))}
      </section>

      {/* IDIOMAS */}
      <section className="ed__sec">
        <SectionHead
          title="Idiomas"
          action={<button className="ed__add" onClick={() => edit((x) => { x.languages.push({ id: uid(), language: "", level: "" }); })}>+ Añadir</button>}
        />
        {d.languages.map((l, i) => (
          <div className="ed__row3" key={l.id}>
            <Field label="Idioma" value={l.language} onChange={(v) => edit((x) => { x.languages[i]!.language = v; })} placeholder="Español" />
            <Field label="Nivel" value={l.level} onChange={(v) => edit((x) => { x.languages[i]!.level = v; })} placeholder="nativo" />
            <Remove onClick={() => edit((x) => { x.languages.splice(i, 1); })} />
          </div>
        ))}
      </section>
    </div>
  );
}

// ── Controles reutilizables ─────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Area({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} />
    </label>
  );
}

function Remove({ onClick, label = "Quitar" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="ed__remove" onClick={onClick}>{label}</button>
  );
}

/**
 * Reescala y recomprime la imagen a un JPEG pequeño (máx 512px, calidad 0.85).
 * Una foto de teléfono cruda pesa varios MB y (a) supera el límite de 4.5 MB de
 * Vercel al enviar el modelo a /api/cv y (b) puede romper el decodificador de
 * react-pdf. Reducida queda en ~60 KB y en un JPEG base que react-pdf sí digiere.
 */
function downscaleImage(file: File, maxSize = 512, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("sin canvas")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagen inválida")); };
    img.src = url;
  });
}

function PhotoField({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <div className="ed__photo">
      <div className="ed__photoprev">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Foto de perfil" />
        ) : (
          <span>Sin foto</span>
        )}
      </div>
      <div className="ed__photoactions">
        <div className="ed__photobtns">
          <label className="ed__add ed__filelabel">
            {value ? "Cambiar foto" : "Subir foto"}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  onChange(await downscaleImage(file));
                } catch {
                  alert("No se pudo procesar la imagen. Prueba con otra (JPG o PNG).");
                }
              }}
            />
          </label>
          {value ? (
            <button type="button" className="ed__remove ed__remove--sm" onClick={() => onChange(undefined)}>Quitar</button>
          ) : null}
        </div>
        <p className="ed__phototip">
          Opcional. En la versión ATS del CV la foto se omite (una foto puede afectar el parseo automático).
          Úsala en la versión “para persona”, cuando envías el CV directo a alguien.
        </p>
      </div>
    </div>
  );
}

function ListEditor({ label, items, onAdd, onChange, onRemove, placeholder, compact }: {
  label: string; items: string[]; onAdd: () => void; onChange: (i: number, v: string) => void; onRemove: (i: number) => void; placeholder?: string; compact?: boolean;
}) {
  return (
    <div className="ed__list">
      <div className="ed__listhead">
        <span>{label}</span>
        <button type="button" className="ed__add ed__add--sm" onClick={onAdd}>+ línea</button>
      </div>
      {items.map((it, i) => (
        <div className="ed__listrow" key={i}>
          {compact ? (
            <input className="ed__listinput" value={it} onChange={(e) => onChange(i, e.target.value)} placeholder={placeholder} />
          ) : (
            <textarea className="ed__listinput" value={it} onChange={(e) => onChange(i, e.target.value)} placeholder={placeholder} rows={2} />
          )}
          <button type="button" className="ed__remove ed__remove--sm" onClick={() => onRemove(i)}>×</button>
        </div>
      ))}
    </div>
  );
}
