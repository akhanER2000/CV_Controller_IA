"use client";

import Link from "next/link";
import { AuroraCanvas } from "@/components/AuroraCanvas";

/**
 * Las dos puertas de entrada — visualmente simétricas, ninguna de segunda.
 * Copy literal de 06-handoff/copy.md §2. Pantalla ATMOSFÉRICA (ventana + aurora).
 */
export default function Onboarding() {
  return (
    <main className="onb c-window">
      <AuroraCanvas active />
      <div className="onb__inner c-panel-in">
        <p className="onb__eyebrow">Tu registro canónico</p>
        <h1 className="onb__title">Empieza por una de dos puertas.</h1>
        <p className="onb__lede">
          Corpus guarda tu carrera una sola vez; cada CV es una vista de ella. Las dos puertas son de
          primera clase.
        </p>

        <div className="onb__doors">
          <div className="onb__door c-hairline">
            <p className="onb__dtag">Puerta A</p>
            <h2 className="onb__dtitle">Desde cero, o desde una plantilla de estructura</h2>
            <p className="onb__dbody">
              Empiezas con un master vacío, o partiendo de un andamio de secciones según tu rol.{" "}
              <strong>Escribes tú.</strong> La IA está disponible, pero apagada. Lo que escribes a mano
              es el origen más verificable de todos.
            </p>
            <div className="onb__spacer" />
            <Link href="/app/master" className="btn btn--gold">Empezar a escribir</Link>
          </div>

          <div className="onb__door c-hairline">
            <p className="onb__dtag">Puerta B</p>
            <h2 className="onb__dtitle">Con IA, desde tus fuentes</h2>
            <p className="onb__dbody">
              Conecta GitHub y tu portfolio (dato duro, sin IA, gratis), sube tu LinkedIn y tu CV viejo.
              La IA extrae; <strong>tú confirmas cada item</strong> antes de que entre al master.
            </p>
            <div className="onb__chips">
              <span>GitHub</span><span>Portfolio</span><span>LinkedIn</span><span>CV / DOCX</span>
            </div>
            <Link href="/app/fuentes" className="btn btn--ghost">Conectar fuentes</Link>
          </div>
        </div>

        <p className="onb__foot">
          Ninguna puerta es el camino de segunda. La IA acelera la entrada de datos; no es requisito.
        </p>
      </div>
    </main>
  );
}
