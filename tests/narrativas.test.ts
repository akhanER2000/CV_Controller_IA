import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { planificarExtraccion, promptDeExtraccion } from "../src/lib/extract/llm";
import {
  repartir, textoPara, conserva, clasificarTitulo,
  CLAVES_DESCARTABLES, CLAVES_NARRATIVAS, EXTRACTORES_5,
} from "../src/lib/extract/segmentar";

/* ============================================================================
   LAS NARRATIVAS RESCATADAS · lo que se perdía era la VOZ del CV.

   QUÉ PASABA, medido sobre el dossier real del repo. Nueve secciones acababan en
   el cubo «contexto» y NO se mandaban a ningún extractor:

     CÓMO USAR ESTE DOCUMENTO · 13 QUÉ BUSCA · 14 CONTEXTO QUE HUMANIZA ·
     BLOQUE 2 Tu historia · BLOQUE 6 Visión y futuro · BLOQUE 7 Qué buscas AHORA ·
     BLOQUE 9 Fuera de la computación · BLOQUE 10 Pruebas sociales ·
     BLOQUE 12 Preguntas incómodas

   De esas nueve, UNA se descarta con razón: «CÓMO USAR ESTE DOCUMENTO» son
   instrucciones sobre el propio documento. Las otras ocho —26.498 caracteres—
   son exactamente el material del RESUMEN y del OBJETIVO PROFESIONAL: «QUÉ
   BUSCA» es el rol al que se apunta y «Tu historia» es de dónde viene la persona.
   Un CV sin eso es una tabla de fechas.

   ESTE FICHERO EXISTE PARA ROMPER EL RESCATE, no para celebrarlo. La prueba que
   importa no es «el reparto dice que van a basics», es «el texto aparece de
   verdad en el prompt que se manda». Lo primero se puede cumplir mientras el
   texto se evapora en el camino; lo segundo, no.
   ============================================================================ */

const RUTA = path.join(__dirname, "..", "material-perfil", "dossier", "DOSSIER-MAESTRO-AKHAN.md");
const DOSSIER = fs.readFileSync(RUTA, "utf8");

/** Las ocho que se rescatan, por un fragmento de su título real. */
const RESCATADAS = [
  "13 · QUÉ BUSCA",
  "14 · CONTEXTO QUE HUMANIZA",
  "BLOQUE 2 — Tu historia",
  "BLOQUE 6 — Visión y futuro",
  "BLOQUE 7 ⭐ — Qué buscas AHORA",
  "BLOQUE 9 — Fuera de la computación",
  "BLOQUE 10 — Pruebas sociales",
  "BLOQUE 12 — Preguntas incómodas",
];

const R = repartir(DOSSIER);
const seccion = (frag: string) => R.secciones.find((s) => s.titulo.includes(frag));

// ════════════════════════════════════════════════════════════════════════════
// LO QUE DE VERDAD SE MANDA · el prompt, no el reparto
// ════════════════════════════════════════════════════════════════════════════
describe("★★ las ocho narrativas VIAJAN EN EL PROMPT que se manda a basics", () => {
  const PLAN = planificarExtraccion(DOSSIER);
  const promptsBasics = PLAN.llamadas.filter((l) => l.extractor === "basics").map((l) => l.prompt).join("\n");

  it("★★ el prompt de `basics` contiene texto literal de LAS OCHO", () => {
    // Se busca una frase real del CUERPO de cada sección, no su título: un título
    // puede colarse por casualidad, un párrafo de 40 caracteres no.
    for (const frag of RESCATADAS) {
      const s = seccion(frag);
      expect(s, `no existe sección «${frag}» en el dossier real`).toBeTruthy();
      const cuerpo = DOSSIER.slice(s!.inicio, s!.fin);
      const parrafo = cuerpo.split("\n").find((l) => l.trim().length > 40)?.trim();
      expect(parrafo, `«${s!.titulo}» no tiene cuerpo que comprobar`).toBeTruthy();
      expect(promptsBasics.includes(parrafo!), `«${s!.titulo}» NO llegó al prompt de basics`).toBe(true);
    }
  });

  it("★★ y NO llegan a los otros cuatro extractores: se leen una vez, no cinco", () => {
    // El rescate tiene que costar ×1. Si acabaran en el difuso, el aviso diría
    // «rescatadas» y la factura diría otra cosa.
    for (const frag of RESCATADAS) {
      const s = seccion(frag)!;
      expect(s.destinos, `«${s.titulo}»`).toEqual(["basics"]);
    }
  });

  it("☠☠ MUTANTE · si `textoPara` dejara de incluirlas, este test se cae", () => {
    // Se simula el retroceso: un reparto en el que las narrativas vuelven al
    // cubo «contexto». El prompt de basics tiene que ADELGAZAR de forma medible.
    const mutante = {
      ...R,
      secciones: R.secciones.map((s) =>
        s.motivo === "narrativa" ? { ...s, cubo: "contexto" as const, destinos: [] } : s,
      ),
    };
    const antes = textoPara(DOSSIER, R, "basics").length;
    const despues = textoPara(DOSSIER, mutante, "basics").length;
    expect(antes - despues, "el rescate tiene que valer 26 KB de prompt").toBeGreaterThan(25_000);
  });

  it("★ el texto que viaja es un TROZO LITERAL: la evidencia se sigue verificando", () => {
    // Si aquí se parafraseara o se reordenara, la verificación de §4.4 empezaría
    // a marcar «sin evidencia» items perfectamente buenos.
    for (const frag of RESCATADAS) {
      const s = seccion(frag)!;
      expect(DOSSIER.includes(DOSSIER.slice(s.inicio, s.fin))).toBe(true);
    }
  });

  it("★ el foco de `basics` PIDE el objetivo profesional (si no, lo lee y no lo devuelve)", () => {
    const p = promptDeExtraccion("basics", "x");
    expect(p).toContain("objetivo profesional");
    expect(p).toContain("resumen");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EL AVISO · deja de sonar a pérdida porque deja de haberla
// ════════════════════════════════════════════════════════════════════════════
describe("★ el aviso dice qué se extrajo de ellas y dónde mirarlo", () => {
  const PLAN = planificarExtraccion(DOSSIER);
  const aviso = PLAN.warnings.find((w) => w.includes("relato"));

  it("★★ hay un aviso, y NO dice «no se extrajeron»", () => {
    expect(aviso, "las 8 narrativas del dossier tienen que producir un aviso").toBeTruthy();
    expect(aviso!.toLowerCase()).not.toContain("no se extrajeron");
    expect(aviso!.toLowerCase()).not.toContain("no se mandaron");
  });

  it("★★ dice QUÉ salió de ellas y DÓNDE revisarlo", () => {
    expect(aviso).toContain("RESUMEN");
    expect(aviso).toContain("objetivo profesional");
    expect(aviso!.toLowerCase()).toContain("staging");
  });

  it("★★ las NOMBRA todas: una sección sin nombre es una sección perdida", () => {
    for (const frag of RESCATADAS) {
      const s = seccion(frag)!;
      expect(aviso!.includes(s.titulo), `«${s.titulo}» no sale nombrada en el aviso`).toBe(true);
    }
  });

  it("★ sin narrativas NO hay aviso (no se avisa de nada que no ha pasado)", () => {
    const plan = planificarExtraccion("# EDUCACIÓN\nIngeniería Civil en Computación — UNAB, 2015 – 2019");
    expect(plan.reparto.narrativas).toEqual([]);
    expect(plan.warnings.some((w) => w.includes("relato"))).toBe(false);
  });

  it("★ con UNA sola narrativa el aviso está en singular (no «1 secciones»)", () => {
    const plan = planificarExtraccion("# BLOQUE 2 — Tu historia\nempecé arreglando impresoras en la pyme de mi tío");
    expect(plan.reparto.narrativas).toHaveLength(1);
    const a = plan.warnings.find((w) => w.includes("relato"))!;
    expect(a).toContain("Una sección de relato");
    expect(a).not.toContain("1 secciones");
  });

  it("★ la lectura sube las narrativas APARTE del contexto: son dos avisos distintos", () => {
    // `lectura.contexto` es «esto no se leyó» y `lectura.narrativas` es «esto se
    // leyó de otra forma». Mezclarlas es como estaba antes, y por eso se perdían.
    expect(R.contexto.map((c) => c.titulo)).toEqual(["CÓMO USAR ESTE DOCUMENTO"]);
    expect(R.narrativas).toHaveLength(8);
    expect(R.narrativas.reduce((a, s) => a + s.caracteres, 0)).toBeGreaterThan(25_000);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA LISTA DE DESCARTE · mínima, literal y ANTE LA DUDA SE EXTRAE
// ════════════════════════════════════════════════════════════════════════════
describe("★ lo único descartable son instrucciones e índices", () => {
  it("★★ solo UNA sección del dossier real se sigue sin leer, y son instrucciones", () => {
    expect(R.contexto).toHaveLength(1);
    expect(R.contexto[0]!.titulo).toBe("CÓMO USAR ESTE DOCUMENTO");
    expect(R.totales.contexto).toBeLessThan(2_000);
  });

  it("★ las claves de descarte son instrucciones o índices, nada más", () => {
    // Barrido literal: cada clave tiene que hablar del DOCUMENTO, no de la
    // persona. Si alguien añade «hobbies» aquí, esto lo caza.
    const permitidas = /(usar|instrucc|instruct|how to use|indice|index|contenidos|contents)/;
    for (const c of CLAVES_DESCARTABLES) {
      expect(permitidas.test(c), `«${c}» no es ni instrucción ni índice`).toBe(true);
    }
    expect(CLAVES_DESCARTABLES.length).toBeLessThanOrEqual(12);
  });

  it("☠☠ ninguna clave narrativa se coló en la lista de descarte", () => {
    for (const c of CLAVES_NARRATIVAS) {
      expect(CLAVES_DESCARTABLES.includes(c), `«${c}» es relato, no instrucciones`).toBe(false);
    }
  });

  it("☠ ANTE LA DUDA SE EXTRAE: lo que suena a relleno cae al difuso, no al limbo", () => {
    for (const t of [
      "Nota del autor", "Disclaimer", "Reflexiones", "Anexos", "Apéndice",
      "Comentarios finales", "Advertencia", "Metodología",
    ]) {
      const c = clasificarTitulo(t);
      expect(c.tipo, `«${t}» no puede descartarse`).not.toBe("descartable");
    }
  });

  it("☠ un documento que es SOLO instrucciones no se queda sin leer en silencio", () => {
    // Caso límite: si TODO es descartable, el usuario tiene que verlo nombrado.
    const doc = "# CÓMO USAR ESTE DOCUMENTO\nlee de arriba abajo y no te saltes nada";
    const r = repartir(doc);
    expect(r.totales.contexto).toBe(doc.length);
    expect(r.contexto[0]!.titulo).toBe("CÓMO USAR ESTE DOCUMENTO");
    expect(conserva(doc, r)).toBe(true);
    // y no se hace ni una llamada: no hay nada que extraer y no se finge que sí
    expect(planificarExtraccion(doc).llamadas).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA INVARIANTE MADRE SIGUE EN PIE
// ════════════════════════════════════════════════════════════════════════════
describe("★★ el rescate no rompe la conservación", () => {
  it("★★ la suma de los cubos sigue siendo EXACTAMENTE la longitud del documento", () => {
    const { dirigido, difuso, contexto } = R.totales;
    expect(dirigido + difuso + contexto).toBe(DOSSIER.length);
    expect(conserva(DOSSIER, R)).toBe(true);
  });

  it("★★ y las narrativas están DENTRO de dirigido, no sumadas aparte", () => {
    // `narrativas` es una VISTA de secciones que ya cuentan en `dirigido`. Si se
    // sumara como cuarto cubo, el total dejaría de cuadrar y la invariante madre
    // se convertiría en una cuenta que se ajusta sola.
    const narrat = R.narrativas.reduce((a, s) => a + s.caracteres, 0);
    const enDirigido = R.secciones
      .filter((s) => s.motivo === "narrativa")
      .reduce((a, s) => a + s.caracteres, 0);
    expect(narrat).toBe(enDirigido);
    expect(R.totales.dirigido).toBeGreaterThan(narrat);
  });

  it("★★ ninguna sección se queda sin destino salvo las de contexto", () => {
    for (const s of R.secciones) {
      if (s.cubo === "contexto") expect(s.destinos).toEqual([]);
      else expect(s.destinos.length, `«${s.titulo}» sin destino`).toBeGreaterThan(0);
    }
  });

  it("★ forzarCompleto sigue devolviéndolo TODO a los cinco, narrativas incluidas", () => {
    const f = repartir(DOSSIER, { forzarCompleto: true });
    expect(f.narrativas).toEqual([]);
    expect(f.contexto).toEqual([]);
    for (const ex of EXTRACTORES_5) expect(f.porExtractor[ex]).toBe(DOSSIER.length);
  });
});
