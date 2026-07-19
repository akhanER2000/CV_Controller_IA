"use client";

import { useMemo, useState } from "react";
import { toPlainText } from "@/lib/cv/resume";
import { useLang, useT } from "@/lib/i18n";
import { demoCv, demoSections, type DemoSection } from "./demo-data";

/* ============================================================================
   EL SPLIT · «tu PDF» ⇄ «lo que el ATS realmente lee».

   Es el bloque protagonista de la landing y lo único que un competidor no puede
   copiar sin construir el producto entero. Por eso NO es una imagen ni dos
   maquetas independientes: las dos caras salen del MISMO objeto `demoCv`.

     · Izquierda — el documento, con la anatomía y las medidas de la plantilla
       'ats-clasica' (una columna, contacto en el cuerpo con los prefijos de
       texto "Email:"/"Tel:", encabezados en mayúsculas SIN tracking, fechas a la
       derecha por flex y no por tabla, viñeta "• "). Las medidas son las de
       catalog.ts (CLASICA) leídas en pt: aquí 1pt = 1px (--pt), así que la hoja
       mide los 612px de una carta.
     · Derecha  — `toPlainText()`, la MISMA función del producto que fija el
       contrato golden y contra la que se compara el PDF re-parseado en cada
       build (tests/ats-roundtrip.test.ts). No hay un segundo generador que
       pueda mentir sobre el primero.

   El emparejamiento sección↔bloque no se hardcodea a ciegas: `toPlainText()`
   separa los bloques con una línea en blanco y solo emite los que tienen
   contenido, así que si la correspondencia no cuadra se renderiza el texto de
   una pieza y se pierde solo el resalte, nunca la información.
   ============================================================================ */

export function SplitAts() {
  const t = useT();
  const { lang } = useLang();
  const [hl, setHl] = useState<DemoSection | null>(null);

  const b = demoCv.basics;
  const tt = <T extends { es: string; en: string }>(v: T) => v[lang];

  // El texto plano REAL del producto, partido en sus bloques de lectura.
  const { blocks, paired } = useMemo(() => {
    const raw = toPlainText(demoCv, { locale: lang, onePage: true });
    const parts = raw.split("\n\n");
    return { blocks: parts, paired: parts.length === demoSections.length };
  }, [lang]);

  const cls = (sec: DemoSection, base: string) =>
    `${base}${hl === sec ? " is-hl" : hl ? " is-dim" : ""}`;

  const hover = (sec: DemoSection) => ({
    onMouseEnter: () => setHl(sec),
    onMouseLeave: () => setHl(null),
  });

  const work = demoCv.work.filter((w) => w.p1);
  const education = demoCv.education.filter((e) => e.p1);

  return (
    <div className="ls-split">
      {/* ── Cara A: el documento ─────────────────────────────────────────── */}
      <figure className="ls-face c-panel">
        <figcaption className="ls-face__cap">
          <span className="t-overline">{t("landing.split.docLabel")}</span>
          <span className="c-chip">{t("landing.split.sample")}</span>
        </figcaption>

        <div className="ls-paper-wrap">
          <div className="ls-paper" aria-hidden="true">
            <div className={cls("basics", "ls-p-sec")} {...hover("basics")}>
              <div className="ls-p-name">{b.name}</div>
              <div className="ls-p-label">{tt(b.label)}</div>
              <div className="ls-p-contact">
                Email: {b.email} · Tel: {b.phone} · {tt(b.location)}
              </div>
              <div className="ls-p-contact">
                {b.links.map((l) => (typeof l === "string" ? l : l.url)).join(" · ")}
              </div>
            </div>

            <div className={cls("summary", "ls-p-sec")} {...hover("summary")}>
              <div className="ls-p-h">{tt(demoCv.headings.summary).toUpperCase()}</div>
              <p className="ls-p-body">{tt(b.summary)}</p>
            </div>

            <div className={cls("skills", "ls-p-sec")} {...hover("skills")}>
              <div className="ls-p-h">{tt(demoCv.headings.skills).toUpperCase()}</div>
              {demoCv.skills.map((s, i) => (
                <p className="ls-p-sk" key={i}>
                  <b>{tt(s.group)}:</b> {tt(s.items)}
                </p>
              ))}
            </div>

            <div className={cls("work", "ls-p-sec")} {...hover("work")}>
              <div className="ls-p-h">{tt(demoCv.headings.work).toUpperCase()}</div>
              {work.map((w, i) => (
                <div className="ls-p-entry" key={i}>
                  <div className="ls-p-row">
                    <span className="ls-p-t">
                      {tt(w.title)} — {w.company}
                    </span>
                    <span className="ls-p-d">{tt(w.dates)}</span>
                  </div>
                  <div className="ls-p-org">{tt(w.location)}</div>
                  {w.bullets
                    .filter((bl) => bl.p1)
                    .map((bl, j) => (
                      <p className="ls-p-b" key={j}>
                        • {tt(bl)}
                      </p>
                    ))}
                </div>
              ))}
            </div>

            <div className={cls("education", "ls-p-sec")} {...hover("education")}>
              <div className="ls-p-h">{tt(demoCv.headings.education).toUpperCase()}</div>
              {education.map((e, i) => (
                <div className="ls-p-entry" key={i}>
                  <div className="ls-p-row">
                    <span className="ls-p-t">{tt(e.title)}</span>
                    <span className="ls-p-d">{tt(e.dates)}</span>
                  </div>
                  <div className="ls-p-org">{e.org}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </figure>

      {/* ── Cara B: lo que el parser extrae ──────────────────────────────── */}
      <figure className="ls-face c-panel">
        <figcaption className="ls-face__cap">
          <span className="t-overline">{t("landing.split.rawLabel")}</span>
        </figcaption>

        <div className="ls-raw-wrap">
          <pre className="ls-raw">
            {paired
              ? blocks.map((blk, i) => (
                  <span
                    key={demoSections[i]}
                    className={cls(demoSections[i], "ls-raw-blk")}
                    {...hover(demoSections[i])}
                  >
                    {i > 0 ? "\n\n" : ""}
                    {blk}
                  </span>
                ))
              : blocks.join("\n\n")}
          </pre>
        </div>
      </figure>
    </div>
  );
}
