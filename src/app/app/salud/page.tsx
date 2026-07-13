"use client";

import { useProfiles } from "@/lib/store/store";
import { Divider } from "@/components/Divider";

type Level = "warn" | "info";
interface Check { message: string; source?: string; level: Level }

export default function Salud() {
  const { current } = useProfiles();
  const d = current.data;

  const bullets: string[] = [
    ...d.work.flatMap((w) => w.bullets.map((b) => b.text)),
    ...d.projects.flatMap((p) => p.bullets.map((b) => b.text)),
    ...d.education.flatMap((e) => (e.notes ?? []).map((n) => n.text)),
  ].filter((t) => t.trim());

  const checks: Check[] = [];

  const noNumber = bullets.filter((t) => !/\d/.test(t));
  if (noNumber.length)
    checks.push({
      message: `${noNumber.length} ${noNumber.length === 1 ? "viñeta" : "viñetas"} sin ninguna cifra`,
      source: "Jobscan 2025: 58,2% de reclutadores prioriza el logro medible. Sin umbral.",
      level: "warn",
    });

  const LEGAL = /\b(S\.?A\.?|SpA|Ltda|Ltd|Inc|LLC|GmbH|S\.?L\.?|S\.?A\.?S\.?|Corp)\b/i;
  const noLegal = d.work.filter((w) => w.orgLegal.trim() && !LEGAL.test(w.orgLegal));
  if (noLegal.length)
    checks.push({
      message: `${noLegal.length} ${noLegal.length === 1 ? "empresa" : "empresas"} sin identificador legal (p. ej. "${noLegal[0]!.orgLegal} SpA")`,
      source: "Greenhouse",
      level: "info",
    });

  const ABBR = /\b(Sr|Jr|Eng|Dev|Mgr|Coord)\b\.?/;
  const abbr = d.work.filter((w) => ABBR.test(w.title));
  if (abbr.length)
    checks.push({
      message: `Cargo abreviado: "${abbr[0]!.title}" → escríbelo completo`,
      source: "Greenhouse",
      level: "info",
    });

  const RESP = /^\s*(responsable de|encargado de|a cargo de)/i;
  const resp = bullets.filter((t) => RESP.test(t));
  if (resp.length)
    checks.push({
      message: `${resp.length} ${resp.length === 1 ? "viñeta empieza" : "viñetas empiezan"} con "Responsable de…" — empieza con un verbo de logro`,
      source: "Fórmula XYZ (Bock)",
      level: "info",
    });

  const contacts = d.basics.contacts.filter((c) => c.visible);
  const hasEmail = contacts.some((c) => /email|correo/i.test(c.label) || /@/.test(c.value));
  const hasPhone = contacts.some((c) => /tel|fono|phone/i.test(c.label) || /\+?\d[\d ]{6,}/.test(c.value));
  if (d.basics.name.trim() && (!hasEmail || !hasPhone))
    checks.push({
      message: `Contacto incompleto: falta ${[!hasEmail && "email", !hasPhone && "teléfono"].filter(Boolean).join(" y ")}`,
      source: "El riesgo real: existir y ser inalcanzable",
      level: "warn",
    });

  if (!(d.basics.targetTitleDefault ?? "").trim())
    checks.push({
      message: "Falta un título objetivo por defecto",
      source: "Jobscan: coincidencia de título = 10,6x entrevistas",
      level: "warn",
    });

  return (
    <div className="page salud">
      <header className="page__head">
        <p className="page__eyebrow">Sin score · sin barras · sin umbrales</p>
        <h1 className="page__title">Salud del master</h1>
        <p className="page__sub">
          {checks.length
            ? `${checks.length} ${checks.length === 1 ? "cosa" : "cosas"} por revisar`
            : "Nada que corregir por ahora"}
        </p>
      </header>
      <Divider />
      <p className="salud__intro">
        No hay puntaje. Cada línea es verificable o no la ponemos. Solo mostramos lo que depende de tu
        contenido y puede fallar.
      </p>

      {checks.length ? (
        <ul className="salud__list">
          {checks.map((c, i) => (
            <li key={i} className={`salud__item salud__item--${c.level}`}>
              <span className="salud__icon">{c.level === "warn" ? "⚠" : "·"}</span>
              <div className="salud__msgwrap">
                <p className="salud__msg">{c.message}</p>
                {c.source ? <p className="salud__src">{c.source}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="salud__clear">
          <span className="salud__icon salud__icon--ok">✓</span>
          <div className="salud__msgwrap">
            <p className="salud__msg">No hay nada que corregir por ahora.</p>
            <p className="salud__src">
              Tu contenido pasa las reglas que dependen de ti. Cuando cambie —una viñeta sin cifra, un
              título genérico— te aviso.
            </p>
          </div>
        </div>
      )}

      <p className="salud__note">
        Lo estructural —una columna, sin foto, contacto en el cuerpo, texto seleccionable— lo cumple la
        plantilla por construcción. No lo listamos como logros: seis ✓ perpetuos serían teatro.
      </p>
    </div>
  );
}
