/* ============================================================================
   LAS TRES PUERTAS — el candado de la tercera vía.

   El encargo tiene una tesis: la puerta que MÁS se va a usar (bajarse una
   plantilla, rellenarla con la IA que ya pagas y subirla) es también la que más
   fácil se cae por el desagüe, porque no gasta tokens, no luce en ninguna
   métrica y cabe perfectamente en un párrafo de documentación que nadie lee.
   Este archivo existe para que no quepa: si alguien la esconde, la degrada a
   letra pequeña, le quita el botón de descarga o —lo peor— afloja la regla que
   impide que la IA ajena invente, el test se cae.

   MUTANTES QUE TIENEN QUE MORIR (probados uno a uno al escribir esto):
     1. borrar la frase «No inventes datos…» del prompt          → §3
     2. suavizarla a «intenta no inventar»                        → §3
     3. quitar la etiqueta de coste de una puerta                 → §2
     4. poner «sin coste» en una puerta que sí usa IA             → §2
     5. esconder la puerta 3 tras un hidden/desplegable           → §1
     6. borrar el botón de descarga de Importar o de Master       → §4
     7. fingir «Copiado» cuando el portapapeles falla             → §5
     8. mandar el .md a staging sin informe previo                → §6
     9. dejar una clave nueva solo en español                     → §7

   Se lee el CÓDIGO FUENTE, no un DOM renderizado, por la misma razón que lo
   hacen landing-claims y cabecera-compacta: el entorno de vitest es `node` y
   montar React aquí traería el runtime de motion, Supabase y el router para
   comprobar una frase. Lo que se verifica es exactamente lo que se despliega.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { importar } from "../src/lib/i18n/dict/importar";
import { master } from "../src/lib/i18n/dict/master";

const here = path.dirname(fileURLToPath(import.meta.url));
const leer = (rel: string) => readFileSync(path.join(here, "..", rel), "utf8");

const IMPORTAR_TSX = leer("src/components/screens/ImportarScreen.tsx");
const IMPORTAR_CSS = leer("src/components/screens/importar.css");
const MASTER_TSX = leer("src/components/screens/MasterScreen.tsx");
const MASTER_CSS = leer("src/components/screens/master.css");
const BLOQUE_TSX = leer("src/components/BloqueCopiable.tsx");
const BLOQUE_CSS = leer("src/components/BloqueCopiable.css");

/** Sin acentos y en minúsculas: comparar copy no puede depender de la tilde. */
function plano(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * El código SIN comentarios. Hace falta para las comprobaciones en negativo
 * («no se usa execCommand», «no se fabrica un Blob»): los comentarios de este
 * repo explican precisamente POR QUÉ no se usa cada cosa, y buscar el término a
 * pelo encontraría la explicación y daría el test por roto. Se quitan bloques
 * (incluidos los {/* *\/} del JSX) y líneas enteras comentadas; NO se toca el
 * `//` de mitad de línea, que en este archivo siempre es una URL dentro de un
 * string.
 */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}
const IMPORTAR_CODE = sinComentarios(IMPORTAR_TSX);
const BLOQUE_CODE = sinComentarios(BLOQUE_TSX);

/* ══ §1 · LAS TRES PUERTAS ESTÁN, Y NINGUNA ESCONDIDA ═══════════════════════ */
describe("§1 · las tres puertas existen y ninguna se esconde", () => {
  it("las tres tarjetas se renderizan, con su número", () => {
    for (const id of ["puerta1", "puerta2", "puerta3"]) {
      expect(IMPORTAR_TSX).toContain(`id="${id}"`);
    }
    // El índice es un grupo con nombre accesible, no tres botones sueltos.
    expect(IMPORTAR_TSX).toContain('aria-label={t("importar.puertas.aria")}');
  });

  it("la puerta 3 tiene panel propio y NO está detrás de hidden ni de un estado", () => {
    expect(IMPORTAR_TSX).toContain('id="plantilla"');
    // El panel se declara sin `hidden`: sale a la vez que la pantalla de volcado.
    const panel = IMPORTAR_TSX.slice(
      IMPORTAR_TSX.indexOf('className="c-panel imp-pl"'),
      IMPORTAR_TSX.indexOf('<ol>', IMPORTAR_TSX.indexOf('className="c-panel imp-pl"')),
    );
    expect(panel.length).toBeGreaterThan(0);
    expect(panel).not.toMatch(/\bhidden\b/);
  });

  it("los tres pasos de la puerta 3 están montados siempre (nada tras un toggle)", () => {
    for (const k of ["importar.pl.s1.h", "importar.pl.s2.h", "importar.pl.s3.h"]) {
      expect(IMPORTAR_TSX).toContain(`t("${k}")`);
    }
    // Si alguien mete un `open`/`abierto` que envuelva los pasos, esto lo delata:
    // el <ol> de la puerta 3 no debe depender de ningún estado booleano propio.
    const ol = IMPORTAR_TSX.slice(
      IMPORTAR_TSX.indexOf('className="c-panel imp-pl"'),
      IMPORTAR_TSX.indexOf("</ol>", IMPORTAR_TSX.indexOf('className="c-panel imp-pl"')),
    );
    expect(ol).not.toMatch(/\{\s*(plOpen|abierto|open)\s*(&&|\?)/);
  });

  it("las tres tarjetas tienen el MISMO peso visual (una sola regla .imp-door)", () => {
    // Un mutante típico: .imp-door--alt más pequeña para la tercera. Si aparece
    // cualquier modificador de tamaño por puerta, esto se cae.
    expect(IMPORTAR_CSS).toContain(".imp-door{");
    expect(IMPORTAR_CSS).not.toMatch(/\.imp-door--\w+\s*\{[^}]*(font-size|padding|opacity|transform)/);
    // La rejilla reparte a tercios: ninguna columna privilegiada.
    expect(IMPORTAR_CSS).toContain(".imp-doors__row{display:grid;grid-template-columns:repeat(3,1fr)");
  });
});

/* ══ §2 · EL COPY DICE LA VERDAD DEL COSTE ══════════════════════════════════ */
describe("§2 · cada puerta declara si usa IA", () => {
  const idiomas = ["es", "en"] as const;

  it("las tres puertas tienen etiqueta de coste en los dos idiomas", () => {
    for (const l of idiomas) {
      for (const n of [1, 2, 3]) {
        const v = importar[l][`importar.puerta${n}.cost`];
        expect(v, `falta importar.puerta${n}.cost en ${l}`).toBeTruthy();
        expect(v.trim().length).toBeGreaterThan(3);
      }
    }
  });

  it("las puertas 1 y 2 admiten que usan IA; la 3 dice que no", () => {
    for (const l of idiomas) {
      for (const n of [1, 2]) {
        const c = plano(importar[l][`importar.puerta${n}.cost`]);
        expect(c, `la puerta ${n} (${l}) debe declarar que usa IA`).toMatch(/\b(usa ia|uses ai)\b/);
        // Y NO puede decir que es gratis: sería exactamente la mentira que esto vigila.
        expect(c).not.toMatch(/sin coste|no cost|gratis|free/);
      }
      const tres = plano(importar[l]["importar.puerta3.cost"]);
      expect(tres).toMatch(/sin ia|no ai/);
      expect(tres).toMatch(/sin coste|no cost/);
    }
  });

  it("la puerta 3 promete además que no hay invención", () => {
    expect(plano(importar.es["importar.puerta3.cost"])).toMatch(/sin invencion/);
    expect(plano(importar.en["importar.puerta3.cost"])).toMatch(/nothing invented/);
  });

  it("el cuerpo de la puerta 3 nombra la vía real: tu propia IA", () => {
    // «con tu propia IA» / «with your own AI»: si desaparece, la tercera vía se
    // lee como "rellénalo tú a mano", que es la versión que nadie usa.
    expect(plano(importar.es["importar.puerta3.body"])).toMatch(/tu propia ia/);
    expect(plano(importar.en["importar.puerta3.body"])).toMatch(/your own ai/);
  });
});

/* ══ §3 · ★ LA FRASE QUE IMPIDE LA INVENCIÓN POR LA PUERTA DE ATRÁS ═════════ */
describe("§3 · el prompt copiable no deja inventar", () => {
  /* Es LA cláusula del encargo. La vía "segura" manda el trabajo a un modelo que
     no controlamos: si el prompt no se lo prohíbe explícitamente, la plantilla
     vuelve rellena de humo con aspecto de dato confirmado — y entra por la
     puerta que se vendía como la que no alucina. */
  const FRASE_ES = "No inventes datos: si algo no está en lo que te doy, déjalo vacío.";

  it("la frase está LITERAL en el prompt ES", () => {
    expect(importar.es["importar.pl.prompt"]).toContain(FRASE_ES);
  });

  it("la frase sobrevive a la comparación sin acentos (por si alguien la reescribe)", () => {
    expect(plano(importar.es["importar.pl.prompt"])).toContain(
      plano("No inventes datos: si algo no esta en lo que te doy, dejalo vacio."),
    );
  });

  it("el prompt EN dice lo mismo, no algo más blando", () => {
    const en = plano(importar.en["importar.pl.prompt"]);
    expect(en).toContain("don't make anything up");
    expect(en).toContain("leave it empty");
  });

  it("no hay versiones tibias de la regla", () => {
    /* Los mutantes reales: pedir el esfuerzo («intenta no inventar») en vez de
       prohibirlo, o —peor— autorizar el relleno cuando falta el dato. Ojo: el
       prompt SÍ contiene «no deduzcas» / «don't infer», que es la prohibición;
       lo que se busca aquí es la forma PERMISIVA, con su condicional delante. */
    for (const l of ["es", "en"] as const) {
      const p = plano(importar[l]["importar.pl.prompt"]);
      expect(p, "«intenta no inventar» NO es la regla").not.toMatch(
        /intenta no inventar|procura no inventar|try not to (make|invent)|avoid making things up/,
      );
      expect(p, "autorizar el relleno es lo contrario de la regla").not.toMatch(
        /si (falta|no (lo )?(sabes|encuentras|esta))[^.\n]*(deduce|deduzcalo|infiere|estima|inventa|rellena|complet)/,
      );
      expect(p, "autorizar el relleno es lo contrario de la regla").not.toMatch(
        /if (something|anything|a (date|field))[^.\n]*(is missing|isn't there)[^.\n]*(infer|guess|estimate|fill)/,
      );
      // Y la prohibición explícita de deducir sigue ahí, en positivo.
      expect(p).toMatch(/(ni|no) (las )?dedu|don't infer/);
    }
  });

  it("el prompt prohíbe además reescribir y normalizar fechas (las otras dos invenciones)", () => {
    const es = plano(importar.es["importar.pl.prompt"]);
    expect(es).toMatch(/no adornes|no reescribas/);
    expect(es).toMatch(/no las normalices/);
    const en = plano(importar.en["importar.pl.prompt"]);
    expect(en).toMatch(/don't embellish|don't rewrite/);
    expect(en).toMatch(/don't normalise|don't normalize/);
  });

  it("el prompt enseña el formato que el parser espera (no un markdown cualquiera)", () => {
    // Si el prompt no nombra los encabezados y las claves, el modelo devuelve un
    // CV bonito que el parser no sabe leer, y la tercera vía "no funciona".
    const es = importar.es["importar.pl.prompt"];
    expect(es).toContain("## EXPERIENCIA");
    expect(es).toContain("fechas:");
    expect(plano(es)).toMatch(/una linea por grupo/);
    const en = importar.en["importar.pl.prompt"];
    expect(en).toContain("## EXPERIENCE");
    expect(en).toContain("dates:");
  });

  it("el prompt que se copia es EXACTAMENTE el que se muestra", () => {
    // Un solo `texto` alimenta el <pre> y el portapapeles. Si alguien mete una
    // segunda constante "para copiar", esto lo caza.
    expect(IMPORTAR_TSX).toContain('texto={t("importar.pl.prompt")}');
    expect(BLOQUE_TSX).toContain("navigator.clipboard.writeText(texto)");
    expect(BLOQUE_TSX).toContain("{texto}");
  });
});

/* ══ §4 · LOS DOS BOTONES DE DESCARGA ═══════════════════════════════════════ */
describe("§4 · descargar la plantilla desde Importar Y desde Master", () => {
  const RUTA = "/api/master/plantilla";

  it("Importar tiene el ancla de descarga con `download`", () => {
    expect(IMPORTAR_TSX).toContain(`href="${RUTA}"`);
    const i = IMPORTAR_TSX.indexOf(`href="${RUTA}"`);
    expect(IMPORTAR_TSX.slice(i, i + 120)).toContain("download");
  });

  it("Master lo tiene en la barra de acciones Y en el estado vacío", () => {
    const anclas = MASTER_TSX.split(`href="${RUTA}"`).length - 1;
    expect(anclas, "faltan anclas de descarga en Master").toBe(2);
    expect(MASTER_TSX).toContain('id="btnMasterMd"');
    expect(MASTER_TSX).toContain('className="ms-empty__pl"');
    expect(MASTER_CSS).toContain(".ms-empty__pl{");
  });

  it("es un ancla plana, no un Blob fabricado en el cliente", () => {
    // Patrón (a) de AjustesScreen: el Content-Disposition lo pone el servidor.
    // Si alguien lo convierte en createObjectURL, hereda el bug del revoke.
    const i = IMPORTAR_CODE.indexOf('id="btnPlantilla"');
    expect(i).toBeGreaterThan(-1);
    expect(IMPORTAR_CODE.slice(i - 400, i + 200)).not.toContain("createObjectURL");
  });
});

/* ══ §5 · EL BOTÓN DE COPIAR NO FINGE ═══════════════════════════════════════ */
describe("§5 · copiar al portapapeles falla de cara", () => {
  it("el éxito se marca SOLO dentro del try, después del await", () => {
    // El mutante clásico: setEstado("ok") fuera del try (o antes del await), que
    // pinta «Copiado» aunque el portapapeles haya rechazado la escritura.
    const i = BLOQUE_TSX.indexOf("await navigator.clipboard.writeText(texto)");
    const j = BLOQUE_TSX.indexOf('setEstado("ok")');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    // Y en el catch se marca el fallo, no se traga.
    const cat = BLOQUE_TSX.slice(BLOQUE_TSX.indexOf("} catch {"), BLOQUE_TSX.indexOf("} catch {") + 160);
    expect(cat).toContain('setEstado("fallo")');
    expect(cat).toContain("seleccionar()");
  });

  it("la ausencia de API se trata como fallo, no como éxito silencioso", () => {
    expect(BLOQUE_TSX).toContain("if (!navigator.clipboard?.writeText) throw");
  });

  it("no se usa execCommand como red (devuelve true sin haber copiado)", () => {
    expect(BLOQUE_CODE).not.toContain("execCommand");
  });

  it("el fallo se DICE y se puede leer (live region + remedio manual)", () => {
    expect(BLOQUE_TSX).toContain('role="status"');
    expect(BLOQUE_TSX).toContain('aria-live="polite"');
    for (const l of ["es", "en"] as const) {
      const f = plano(importar[l]["importar.pl.copiaFallo"]);
      expect(f, "el aviso tiene que decir CÓMO copiarlo a mano").toMatch(/ctrl\+c/);
    }
    // El aviso de fallo no caduca (una instrucción que se borra sola no sirve).
    const efecto = BLOQUE_TSX.slice(BLOQUE_TSX.indexOf("useEffect(() => {"), BLOQUE_TSX.indexOf("/** Deja el texto"));
    expect(efecto).toContain('if (estado !== "ok") return;');
  });

  it("el bloque es legible y seleccionable aunque el botón falle", () => {
    expect(BLOQUE_CSS).toContain("user-select: text");
    expect(BLOQUE_TSX).toContain("tabIndex={0}");
  });
});

/* ══ §6 · INFORME PREVIO ANTES DE TOCAR NADA ════════════════════════════════ */
describe("§6 · subir el .md lleva al informe, y solo entonces se confirma", () => {
  it("el primer viaje pide informe, no escritura", () => {
    expect(IMPORTAR_TSX).toContain('fetch("/api/import/corpus-md"');
    expect(IMPORTAR_TSX).toContain("confirmar: false");
    expect(IMPORTAR_TSX).toContain("confirmar: true");
  });

  it("el botón de confirmar solo existe con informe delante", () => {
    // El bloque de acciones vive dentro de `{plInf ? … }` y además exige total>0.
    const inf = IMPORTAR_TSX.slice(IMPORTAR_TSX.indexOf("{plInf ? ("), IMPORTAR_TSX.indexOf('id="plConfirm"'));
    expect(inf).toContain("plInf.total > 0");
    expect(IMPORTAR_TSX).toContain("confirmarPlantilla()");
  });

  it("confirmar no es lo mismo que leer: son dos funciones y dos viajes", () => {
    expect(IMPORTAR_TSX).toContain("async function leerPlantilla");
    expect(IMPORTAR_TSX).toContain("async function confirmarPlantilla");
    // leerPlantilla NO puede navegar a staging por su cuenta.
    const leerFn = IMPORTAR_TSX.slice(
      IMPORTAR_TSX.indexOf("async function leerPlantilla"),
      IMPORTAR_TSX.indexOf("async function confirmarPlantilla"),
    );
    expect(leerFn).not.toContain("router.push");
  });

  it("una respuesta que no se entiende se enseña cruda, no se maquilla de 0 items", () => {
    expect(IMPORTAR_TSX).toContain("setPlRaw(");
    expect(IMPORTAR_TSX).toContain('t("importar.pl.inf.rara")');
    // El normalizador devuelve null cuando no reconoce el total.
    expect(IMPORTAR_TSX).toContain("if (total === null) return null;");
  });

  it("las líneas que no encajan se listan CON su número (nada se descarta)", () => {
    expect(IMPORTAR_TSX).toContain('t("importar.pl.inf.notas")');
    expect(IMPORTAR_TSX).toContain('t("importar.pl.inf.linea").replace("{n}"');
    for (const l of ["es", "en"] as const) {
      const b = plano(importar[l]["importar.pl.inf.notasBody"]);
      expect(b).toMatch(/no se descartan|nothing is dropped/);
    }
  });

  it("el informe recuerda que staging no es el master", () => {
    for (const l of ["es", "en"] as const) {
      const s = plano(importar[l]["importar.pl.inf.sub"]);
      expect(s).toMatch(/staging/);
      expect(s).toMatch(/master/);
    }
  });

  it("la zona de arrastre de la puerta 3 vive FUERA de .imp-box (no duplica altas)", () => {
    // La caja de volcado captura sueltes en toda su superficie; una zona suya
    // dentro daría de alta el mismo fichero dos veces al burbujear el evento.
    const box = IMPORTAR_TSX.indexOf('id="dropzone"');
    const cierreBox = IMPORTAR_TSX.indexOf('id="liPanel"');
    const plDrop = IMPORTAR_TSX.indexOf('id="plDrop"');
    expect(box).toBeGreaterThan(-1);
    expect(plDrop).toBeGreaterThan(cierreBox);
  });
});

/* ══ §7 · PARIDAD Y PROCEDENCIA DEL COPY NUEVO ══════════════════════════════ */
describe("§7 · i18n de todo lo nuevo, en los dos idiomas", () => {
  const NUEVAS_IMPORTAR = [
    "importar.puertas.aria", "importar.puertas.overline",
    "importar.puerta1.title", "importar.puerta1.body", "importar.puerta1.cost", "importar.puerta1.go",
    "importar.puerta2.title", "importar.puerta2.body", "importar.puerta2.cost", "importar.puerta2.go",
    "importar.puerta3.title", "importar.puerta3.body", "importar.puerta3.cost", "importar.puerta3.go",
    "importar.pl.overline", "importar.pl.title", "importar.pl.body",
    "importar.pl.s1.h", "importar.pl.s1.d", "importar.pl.download",
    "importar.pl.s2.h", "importar.pl.s2.d", "importar.pl.promptLabel", "importar.pl.promptAria",
    "importar.pl.prompt", "importar.pl.copiar", "importar.pl.copiado", "importar.pl.copiaFallo",
    "importar.pl.s3.h", "importar.pl.s3.d",
    "importar.pl.drop.bold", "importar.pl.drop.rest", "importar.pl.drop.line2",
    "importar.pl.badExt", "importar.pl.empty", "importar.pl.reading", "importar.pl.failed",
    "importar.pl.fileLabel", "importar.pl.otro",
    "importar.pl.inf.overline", "importar.pl.inf.total", "importar.pl.inf.totalUno",
    "importar.pl.inf.tipos", "importar.pl.inf.notas", "importar.pl.inf.notasBody",
    "importar.pl.inf.preguntas", "importar.pl.inf.preguntasBody", "importar.pl.inf.avisos",
    "importar.pl.inf.linea", "importar.pl.inf.confirmar", "importar.pl.inf.confirmando",
    "importar.pl.inf.cancelar", "importar.pl.inf.sub", "importar.pl.inf.cero", "importar.pl.inf.rara",
  ];
  const NUEVAS_MASTER = [
    "master.plantilla.descargar", "master.plantilla.title",
    "master.empty.plantilla", "master.empty.plantillaNote", "master.empty.plantillaHow",
  ];

  it("toda clave nueva existe en ES y en EN, y ninguna está vacía", () => {
    for (const k of NUEVAS_IMPORTAR) {
      expect(importar.es[k], `falta ${k} en ES`).toBeTruthy();
      expect(importar.en[k], `falta ${k} en EN`).toBeTruthy();
    }
    for (const k of NUEVAS_MASTER) {
      expect(master.es[k], `falta ${k} en ES`).toBeTruthy();
      expect(master.en[k], `falta ${k} en EN`).toBeTruthy();
    }
  });

  it("el EN no es el ES copiado (el fallback silencioso no cuenta como traducir)", () => {
    // Se excluyen las claves cuya traducción legítima coincide (ninguna aquí,
    // pero la lista se declara para que el día que la haya se vea).
    const iguales: string[] = [];
    for (const k of NUEVAS_IMPORTAR) {
      if (importar.es[k] === importar.en[k]) iguales.push(k);
    }
    for (const k of NUEVAS_MASTER) {
      if (master.es[k] === master.en[k]) iguales.push(k);
    }
    expect(iguales, `sin traducir: ${iguales.join(", ")}`).toEqual([]);
  });

  it("cada clave nueva se USA de verdad en su pantalla (no hay copy muerto)", () => {
    const usadaEnImportar = (k: string) => IMPORTAR_TSX.includes(`t("${k}")`);
    const huerfanas = NUEVAS_IMPORTAR.filter((k) => !usadaEnImportar(k));
    expect(huerfanas, `claves declaradas y no usadas: ${huerfanas.join(", ")}`).toEqual([]);
    const huerfanasM = NUEVAS_MASTER.filter((k) => !MASTER_TSX.includes(`t("${k}")`));
    expect(huerfanasM, `claves declaradas y no usadas: ${huerfanasM.join(", ")}`).toEqual([]);
  });

  it("ningún texto visible de la puerta 3 quedó incrustado en el TSX", () => {
    // Un mutante muy fácil: escribir «Descargar plantilla» a pelo en el JSX. Se
    // vería bien en español y desaparecería en inglés sin que nada fallara.
    const jsxTextos = IMPORTAR_TSX.match(/>\s*[A-ZÁÉÍÓÚÑ][^<>{}\n]{12,}\s*</g) ?? [];
    expect(jsxTextos, `texto suelto en el JSX: ${jsxTextos.join(" | ")}`).toEqual([]);
  });
});
