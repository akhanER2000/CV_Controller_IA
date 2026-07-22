import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  CAMPOS_POR_KIND,
  CLAVE_CABECERA,
  PERFIL_EJEMPLO,
  SECCIONES,
  parsearCorpusMd,
  plantillaEjemplo,
  plantillaVacia,
} from "@/lib/corpus-md";
import { importar } from "../src/lib/i18n/dict/importar";
import { master } from "../src/lib/i18n/dict/master";

/* ============================================================================
   ★ PARIDAD PLANTILLA ↔ MODELO DE DATOS

   La tesis de este archivo es una sola: LA PLANTILLA Y EL MASTER NO PUEDEN SER
   DOS LISTAS QUE ALGUIEN MANTIENE A MANO. Cuando lo fueron, divergieron — el
   enum `item_kind` tenía 'publication' desde el esquema 0001 y la plantilla
   ofrecía nueve secciones sin él, así que quien la rellenaba a mano no tenía
   dónde escribir su paper y no lo escribía. Un dato que no tiene dónde ir es un
   dato perdido, aunque nadie lo borre.

   Aquí la autoridad no es una constante de TypeScript que se pueda editar para
   que el test pase: son LAS MIGRACIONES SQL, que es lo que la base acepta de
   verdad. Si mañana una migración añade un kind y nadie lo pone en el
   vocabulario, este archivo se cae.
   ============================================================================ */

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(here, "..");
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

const VACIA = plantillaVacia();
const EJEMPLO = plantillaEjemplo();

/* ── La autoridad: el enum de las migraciones ──────────────────────────────
   Se lee el SQL y no `src/lib/extract/types.ts` a propósito: el union de
   TypeScript es una opinión del cliente y ya va por detrás (no tiene
   'publication'). El enum de la base es lo que un INSERT acepta o rechaza. */
function kindsDelEnum(): string[] {
  const dir = path.join(raiz, "supabase/migrations");
  const ficheros = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const kinds = new Set<string>();
  for (const f of ficheros) {
    const sql = readFileSync(path.join(dir, f), "utf8");
    const creado = sql.match(/create\s+type\s+item_kind\s+as\s+enum\s*\(([\s\S]*?)\)\s*;/i);
    if (creado) for (const m of creado[1]!.matchAll(/'([a-z_]+)'/gi)) kinds.add(m[1]!);
    for (const m of sql.matchAll(/alter\s+type\s+item_kind\s+add\s+value[^;]*?'([a-z_]+)'/gi)) kinds.add(m[1]!);
  }
  return [...kinds];
}

const KINDS_DEL_MASTER = kindsDelEnum();

/**
 * `bullet` no tiene sección y NO puede tenerla: una viñeta no es una entrada,
 * cuelga de su rol y se escribe «- …» dentro de él. Darle un «## VIÑETAS» sería
 * enseñar a escribir logros huérfanos, que es exactamente lo que el parser avisa
 * cuando los ve. Se declara aquí para que la exención sea una decisión revisable
 * y no un agujero silencioso en el bucle.
 */
const SIN_SECCION_PROPIA: Record<string, string> = {
  bullet: "una viñeta cuelga de su entrada; se escribe «- …» dentro del ###",
};

/**
 * ★ BRECHAS CONOCIDAS — la lista que tiene que quedarse VACÍA.
 *
 * La plantilla ofrece PUBLICACIONES porque el master (el enum, y el POST de
 * /api/master) acepta ese kind. La puerta .md, en cambio, lo filtra: `KINDS` en
 * src/lib/corpus-md-staging.ts no lo incluye, así que una publicación escrita en
 * la plantilla NO llega a staging — se NOMBRA en «noImportados», que es honesto,
 * pero no entra.
 *
 * Esto se declara aquí, con su fichero y su línea, en vez de dejarlo en un
 * comentario que nadie lee o —peor— de callarlo. Y el test es de DOS FILOS: si
 * alguien cierra la brecha y no borra esta entrada, también falla. Una lista de
 * deuda que no se limpia sola vuelve a ser mentira en tres meses.
 */
/*
 * Brechas declaradas: un kind que la plantilla OFRECE y la puerta .md todavía no
 * guarda. Se declaran aquí en vez de callarlas, y el test de abajo obliga a
 * borrar la entrada cuando se cierra — así la lista no puede quedarse mintiendo.
 *
 * `publication` estuvo aquí y YA NO: llevaba desde 0001 en el enum de la base y
 * en el POST del master, y solo faltaba en dos listas de TypeScript. Cerrada.
 */
const BRECHAS_CONOCIDAS: Record<string, string> = {};

/** El `KINDS` de la puerta .md, leído del fuente: es quien decide qué entra. */
function kindsDeLaPuertaMd(): Set<string> {
  const src = leer("src/lib/corpus-md-staging.ts");
  const m = src.match(/const KINDS = new Set<string>\(\[([\s\S]*?)\]\)/);
  expect(m, "no se encontró el vocabulario KINDS de corpus-md-staging.ts").toBeTruthy();
  return new Set([...m![1]!.matchAll(/"([a-z_]+)"/g)].map((x) => x[1]!));
}

/** Los títulos «## X» que aparecen de verdad en un .md. */
function seccionesDe(md: string): string[] {
  return [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());
}

describe("★ paridad · cada kind que el master acepta tiene su sección", () => {
  it("el enum de las migraciones se lee de verdad (si esto falla, el resto no prueba nada)", () => {
    // Un test cuyo «recorrido» está vacío pasa siempre. Se ancla el suelo.
    expect(KINDS_DEL_MASTER.length).toBeGreaterThanOrEqual(12);
    expect(KINDS_DEL_MASTER).toContain("basics");
    expect(KINDS_DEL_MASTER).toContain("publication"); // 0001
    expect(KINDS_DEL_MASTER).toContain("reference"); // 0004
  });

  it("todo kind del enum tiene sección en el vocabulario", () => {
    const huerfanos = KINDS_DEL_MASTER.filter(
      (k) => !SIN_SECCION_PROPIA[k] && !SECCIONES.some((s) => s.kind === k),
    );
    expect(huerfanos, `kinds sin «## SECCIÓN» en SECCIONES: ${huerfanos.join(", ")}`).toEqual([]);
  });

  it("★ …y esa sección aparece en la PLANTILLA VACÍA y en la del EJEMPLO", () => {
    const faltanVacia: string[] = [];
    const faltanEjemplo: string[] = [];
    for (const k of KINDS_DEL_MASTER) {
      if (SIN_SECCION_PROPIA[k]) continue;
      const sec = SECCIONES.find((s) => s.kind === k)!;
      if (!seccionesDe(VACIA).includes(sec.titulo)) faltanVacia.push(`${k} → ## ${sec.titulo}`);
      if (!seccionesDe(EJEMPLO).includes(sec.titulo)) faltanEjemplo.push(`${k} → ## ${sec.titulo}`);
    }
    expect(faltanVacia, `secciones que el master acepta y la plantilla no ofrece: ${faltanVacia.join(", ")}`).toEqual([]);
    expect(faltanEjemplo, `secciones que el ejemplo no enseña: ${faltanEjemplo.join(", ")}`).toEqual([]);
  });

  it("la plantilla ofrece las 11 secciones (las 9 de antes + PUBLICACIONES + ENLACES)", () => {
    const titulos = seccionesDe(VACIA);
    for (const t of ["CONTACTO", "RESUMEN", "EXPERIENCIA", "HABILIDADES", "EDUCACION",
      "PROYECTOS", "CERTIFICACIONES", "IDIOMAS", "PUBLICACIONES", "ENLACES", "REFERENCIAS"]) {
      expect(titulos, `falta ## ${t}`).toContain(t);
    }
    // OTROS es la red de seguridad del EXPORTADOR, no un sitio donde escribir.
    expect(titulos).not.toContain("OTROS");
  });

  it("★ cada CAMPO del vocabulario está en la plantilla (o en su ###)", () => {
    const faltan: string[] = [];
    for (const sec of SECCIONES) {
      if (sec.kind === "otros") continue;
      const bloque = trozoDeSeccion(VACIA, sec.titulo);
      for (const def of CAMPOS_POR_KIND[sec.kind] ?? []) {
        // El campo de cabecera viaja en el texto del ###; el resto, como línea.
        const enCabecera = CLAVE_CABECERA[sec.kind] === def.clave && /^### \S/m.test(bloque);
        const enLinea = new RegExp(`^${def.nombre}:`, "m").test(bloque);
        // HABILIDADES escribe el grupo como CLAVE («Lenguajes: …»), forma corta.
        const enFormaCorta = sec.kind === "skill" && /^\[[^\]]+\]:/m.test(bloque);
        // `dates` se puede enseñar con su azúcar: «desde:»/«hasta:» ESCRIBEN en
        // data.dates igual que «fechas:». No es una excepción cómoda — es que el
        // campo sí está expuesto, en la forma que un humano escribe a mano.
        const enAzucar = def.clave === "dates" && /^desde:/m.test(bloque) && /^hasta:/m.test(bloque);
        if (!enCabecera && !enLinea && !enFormaCorta && !enAzucar) faltan.push(`${sec.kind}.${def.nombre}`);
      }
    }
    expect(faltan, `campos del modelo que la plantilla no expone: ${faltan.join(", ")}`).toEqual([]);
    // …y la forma CANÓNICA («fechas:», la que escribe el exportador) tiene que
    // aparecer también, o quien vuelva a subir su propio master no la reconocerá.
    expect((VACIA.match(/^fechas:/gm) ?? []).length, "la plantilla solo enseña el azúcar de fechas").toBeGreaterThanOrEqual(2);
  });

  it("los campos que el encargo echaba en falta están, y donde el master los guarda", () => {
    const exp = trozoDeSeccion(VACIA, "EXPERIENCIA");
    // Ubicación por rol.
    expect(exp).toMatch(/^ubicacion:/m);
    // Modalidad: NO es una clave nueva (el master no la tiene); vive dentro de
    // «ubicacion», igual que en la pantalla del master. Y la plantilla lo dice.
    expect(exp.toLowerCase()).toContain("modalidad");
    expect(exp.toLowerCase()).toMatch(/h[íi]brido/);
    // Enlace del rol: `url` es clave válida del master y ahora tiene campo.
    expect(exp).toMatch(/^url:/m);
    // Enlaces adicionales: en CONTACTO se repiten, y además existe ## ENLACES.
    const contacto = trozoDeSeccion(VACIA, "CONTACTO");
    expect((contacto.match(/^enlace:/gm) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

/* ── MUTANTES: la plantilla se DERIVA, no se escribe ───────────────────────
   La prueba de que esto no vuelve a ser dos listas paralelas. Se mete un kind
   (y un campo) en el vocabulario EN CALIENTE y se exige que aparezcan solos en
   la plantilla. Si alguien sustituye el generador por un literal, estos dos
   tests mueren en el acto. Se restaura siempre en `finally`: el resto del
   archivo comparte el módulo. */
describe("★ mutantes · el vocabulario manda", () => {
  it("un KIND nuevo aparece solo en la plantilla, sin tocar el texto", () => {
    const antes = SECCIONES.length;
    SECCIONES.push({ kind: "premio", titulo: "PREMIOS", alias: ["premios", "awards"] });
    CAMPOS_POR_KIND.premio = [
      { clave: "name", nombre: "nombre", alias: ["nombre", "name"] },
      { clave: "issuer", nombre: "emisor", alias: ["emisor", "issuer"] },
    ];
    CLAVE_CABECERA.premio = "name";
    try {
      const md = plantillaVacia();
      expect(md, "un kind nuevo del vocabulario NO llegó a la plantilla").toContain("## PREMIOS");
      // Y con su pista genérica: fea, pero presente. La fealdad se ve.
      expect(md).toContain("### [name]");
      expect(md).toContain("emisor: [emisor]");
    } finally {
      SECCIONES.length = antes;
      delete CAMPOS_POR_KIND.premio;
      delete CLAVE_CABECERA.premio;
    }
  });

  it("un CAMPO nuevo de un kind existente aparece solo en su bloque", () => {
    const campos = CAMPOS_POR_KIND.work!;
    campos.push({ clave: "level", nombre: "seniority", alias: ["seniority", "nivel"] });
    try {
      expect(plantillaVacia()).toContain("seniority: [seniority]");
    } finally {
      campos.pop();
    }
  });
});

/* ── La plantilla vacía sigue siendo válida ────────────────────────────────── */
describe("plantilla vacía · parsea, y lo único que chirría son los corchetes", () => {
  it("es un corpus/1 reconocible y no trae datos inventados", () => {
    const r = parsearCorpusMd(VACIA);
    expect(r.ok).toBe(true);
    expect(r.formato).toBe("corpus/1");
    expect(VACIA).toContain("[Tu nombre completo]");
    expect(VACIA.toLowerCase()).toContain("no lo inventes");
  });

  it("★ ni un aviso que no sea por un corchete sin sustituir", () => {
    // Un aviso ajeno a los placeholders sería un fallo de la plantilla, no del
    // usuario: le estaríamos dando un fichero que nuestro propio parser rechaza.
    const r = parsearCorpusMd(VACIA);
    const ajenos = r.avisos.filter((a) => !a.mensaje.includes("["));
    expect(ajenos, `avisos que no son del [placeholder]: ${JSON.stringify(ajenos)}`).toEqual([]);
    // Y NADA se queda como nota suelta: cada línea encaja en alguna sección.
    expect(r.notas, `líneas que la plantilla escribe y el parser no coloca: ${JSON.stringify(r.notas)}`).toEqual([]);
  });

  it("HABILIDADES enseña la riqueza real, no dos líneas", () => {
    const bloque = trozoDeSeccion(VACIA, "HABILIDADES");
    const grupos = (bloque.match(/^\[[^\]]+\]:/gm) ?? []).length;
    expect(grupos, "la plantilla vuelve a sugerir dos grupos como si un master tuviera dos").toBeGreaterThanOrEqual(6);
    expect(bloque).toMatch(/10 y 15|10-15/);
  });

  it("cada sección con viñetas enseña al menos una, y con cifra", () => {
    for (const t of ["EXPERIENCIA", "PROYECTOS", "PUBLICACIONES"]) {
      expect(trozoDeSeccion(VACIA, t), `## ${t} no enseña ninguna viñeta`).toMatch(/^- /m);
    }
    expect(trozoDeSeccion(VACIA, "EXPERIENCIA").toLowerCase()).toContain("cifra");
  });
});

/* ── La plantilla de ejemplo ───────────────────────────────────────────────── */
describe("★ plantilla con ejemplo · un perfil inventado que el parser acepta entero", () => {
  it("★ CERO avisos y CERO notas: el ejemplo no puede enseñar nada que el parser rechace", () => {
    const r = parsearCorpusMd(EJEMPLO);
    expect(r.ok).toBe(true);
    expect(r.formato).toBe("corpus/1");
    expect(r.avisos, `avisos:\n${r.avisos.map((a) => `  línea ${a.linea}: ${a.mensaje}`).join("\n")}`).toEqual([]);
    expect(r.notas, `notas: ${JSON.stringify(r.notas)}`).toEqual([]);
  });

  it("★ MUTANTE: si el ejemplo trajera una línea inválida, el test anterior lo cazaría", () => {
    // Prueba de que «cero avisos» tiene dientes y no es un parser que se calla.
    const roto = EJEMPLO.replace("## EXPERIENCIA", "## EXPERIENCIA\ncosa rara: valor");
    const r = parsearCorpusMd(roto);
    expect(r.avisos.length, "el parser se tragó una clave inventada sin avisar").toBeGreaterThan(0);
  });

  it("★ vuelve entero: cada item del ejemplo se recupera campo por campo", () => {
    const r = parsearCorpusMd(EJEMPLO);
    const difs: string[] = [];
    const usados = new Set<number>();
    for (const o of PERFIL_EJEMPLO) {
      const idx = r.items.findIndex((p, i) => !usados.has(i) && p.kind === o.kind);
      if (idx < 0) { difs.push(`${o.kind} «${String(o.data.name ?? o.data.text ?? "")}» no volvió`); continue; }
      usados.add(idx);
      const p = r.items[idx]!;
      for (const [k, v] of Object.entries(o.data)) {
        if (JSON.stringify(p.data[k]) !== JSON.stringify(v)) {
          difs.push(`${o.kind}.${k}: esperaba ${JSON.stringify(v)} y volvió ${JSON.stringify(p.data[k])}`);
        }
      }
      for (const k of Object.keys(p.data)) {
        if (!(k in o.data)) difs.push(`${o.kind}.${k}: apareció de la nada`);
      }
    }
    expect(difs, `DIFERENCIAS:\n  ${difs.join("\n  ")}`).toEqual([]);
    expect(r.items.length, "sobran o faltan items al volver").toBe(PERFIL_EJEMPLO.length);
  });

  it("las viñetas vuelven colgando de SU entrada, no sueltas", () => {
    const r = parsearCorpusMd(EJEMPLO);
    const vinetas = r.items.filter((i) => i.kind === "bullet");
    expect(vinetas.length).toBe(PERFIL_EJEMPLO.filter((i) => i.kind === "bullet").length);
    for (const v of vinetas) {
      expect(v.parentIndex, `viñeta huérfana: «${String(v.data.text).slice(0, 40)}»`).toBeTypeOf("number");
    }
    // Y la de la publicación cuelga de la publicación, no del último rol.
    const pub = vinetas.find((v) => String(v.data.text).includes("240 sensores"))!;
    expect(r.items[pub.parentIndex!]!.kind).toBe("publication");
  });

  it("★ el ejemplo se declara INVENTADO y no puede confundirse con un CV real", () => {
    const cabeza = EJEMPLO.slice(0, EJEMPLO.indexOf("## CONTACTO"));
    expect(cabeza.toLowerCase(), "el ejemplo no avisa de que es inventado").toContain("inventado");
    expect(cabeza).toContain("EJEMPLO");
    // Todo correo del fichero es del dominio reservado .invalid (RFC 2606): no
    // puede existir, así que no hay forma de que apunte a una persona real.
    const correos = EJEMPLO.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    expect(correos.length).toBeGreaterThan(0);
    expect(correos.filter((c) => !c.endsWith(".invalid")), "hay correos que no son .invalid").toEqual([]);
    // Y ningún dominio de ejemplo propio fuera de .invalid (salvo los perfiles
    // sociales, que llevan «cambia-esto» en la ruta para que se vean).
    for (const u of EJEMPLO.match(/https?:\/\/[^\s|]+/g) ?? []) {
      const ok = u.includes(".invalid") || u.includes("cambia-esto-por-tu-usuario");
      expect(ok, `url que no se ve inventada: ${u}`).toBe(true);
    }
  });

  it("★ el ejemplo NO son los datos del usuario real del repo", () => {
    // El riesgo obvio al escribir un ejemplo: copiar el master que se tenía a
    // mano. Sería publicar los datos de una persona dentro del producto.
    const plano = EJEMPLO.toLowerCase();
    for (const rastro of ["akhan", "castrolorenzo", "pharmiq", "aerofit", "espinoza",
      "andrés bello", "andres bello", "minsal", "5612 1922"]) {
      expect(plano.includes(rastro), `el ejemplo contiene «${rastro}»: eso es de una persona real`).toBe(false);
    }
  });

  it("el ejemplo enseña LA RIQUEZA: 13 grupos, fechas, viñetas con cifra, referencia", () => {
    const grupos = PERFIL_EJEMPLO.filter((i) => i.kind === "skill");
    expect(grupos.length, "un master real tiene 10-15 grupos; el ejemplo tiene que enseñarlo").toBeGreaterThanOrEqual(13);
    // Al menos un grupo con `contexto`: si no, ese campo no se ve nunca.
    expect(grupos.some((g) => typeof g.data.sourceContext === "string" && g.data.sourceContext !== "")).toBe(true);
    // Toda viñeta con al menos una cifra: es lo que la hace comprobable.
    const sinCifra = PERFIL_EJEMPLO
      .filter((i) => i.kind === "bullet")
      .filter((i) => !/\d/.test(String(i.data.text)));
    expect(sinCifra.map((i) => i.data.text), "viñetas de ejemplo sin una sola cifra").toEqual([]);
    // Una fecha en curso y una cerrada: las dos formas que el master distingue.
    const fechas = PERFIL_EJEMPLO.filter((i) => i.kind === "work").map((i) => String(i.data.dates));
    expect(fechas.some((f) => /actualidad/i.test(f))).toBe(true);
    expect(fechas.some((f) => /\d{4}\s*–\s*\w/.test(f))).toBe(true);
    // Modalidad donde el master la guarda: dentro de la ubicación del rol.
    expect(PERFIL_EJEMPLO.some((i) => i.kind === "work" && /híbrido|remoto/i.test(String(i.data.location)))).toBe(true);
    // Y la referencia completa, con las seis claves de su vocabulario cerrado.
    const ref = PERFIL_EJEMPLO.find((i) => i.kind === "reference")!;
    for (const k of ["name", "role", "org", "relation", "email", "phone"]) {
      expect(ref.data[k], `la referencia de ejemplo no enseña «${k}»`).toBeTruthy();
    }
  });

  it("el ejemplo NO enseña bloques de procedencia (son metadato de máquina)", () => {
    expect(EJEMPLO).not.toContain("corpus:proc");
  });
});

/* ── La brecha que hay que cerrar, declarada y auto-limpiable ──────────────── */
describe("★ lo que la plantilla ofrece, ¿entra de verdad por la puerta .md?", () => {
  const puerta = kindsDeLaPuertaMd();

  it("toda sección ofrecida es importable, o está declarada como brecha con su arreglo", () => {
    const rotas: string[] = [];
    for (const sec of SECCIONES) {
      if (sec.kind === "otros") continue;
      if (!seccionesDe(VACIA).includes(sec.titulo)) continue;
      if (puerta.has(sec.kind)) continue;
      if (BRECHAS_CONOCIDAS[sec.kind]) continue;
      rotas.push(`## ${sec.titulo} (${sec.kind}): la plantilla lo pide y la puerta .md no lo guarda`);
    }
    expect(rotas, rotas.join("\n")).toEqual([]);
  });

  it("★ y si alguien cierra una brecha, hay que borrarla de la lista (o esto falla)", () => {
    const yaCerradas = Object.keys(BRECHAS_CONOCIDAS).filter((k) => puerta.has(k));
    expect(
      yaCerradas,
      `brechas ya arregladas que siguen declaradas como deuda: ${yaCerradas.join(", ")} — bórralas de BRECHAS_CONOCIDAS`,
    ).toEqual([]);
  });

  it("la brecha viva se nombra con fichero y arreglo, no con un «pendiente»", () => {
    for (const [kind, motivo] of Object.entries(BRECHAS_CONOCIDAS)) {
      expect(puerta.has(kind), `${kind} ya está en la puerta`).toBe(false);
      expect(motivo).toContain("src/");
      expect(motivo.toLowerCase()).toContain("arreglo");
    }
  });
});

/* ── Ayuda ─────────────────────────────────────────────────────────────────── */

/** El texto de una sección: desde su «## X» hasta el siguiente «##». */
function trozoDeSeccion(md: string, titulo: string): string {
  const lineas = md.split("\n");
  const i = lineas.indexOf(`## ${titulo}`);
  if (i < 0) return "";
  let j = i + 1;
  while (j < lineas.length && !lineas[j]!.startsWith("## ")) j++;
  return lineas.slice(i + 1, j).join("\n");
}

/* ══ LAS TRES DESCARGAS · la ruta y los dos sitios desde donde se piden ══════
   Se lee el CÓDIGO FUENTE, como en tests/tres-puertas.test.ts y por el mismo
   motivo: el entorno de vitest es `node` y el handler de la ruta arrastra
   Supabase y `next/headers`. Lo que se verifica es exactamente lo que se
   despliega — que las tres opciones EXISTEN y llegan a la ruta. */
describe("★ las tres descargas: en blanco · con un ejemplo · tu propio master", () => {
  const RUTA = leer("src/app/api/master/plantilla/route.ts");
  const IMPORTAR = leer("src/components/screens/ImportarScreen.tsx");
  const MASTER_TSX = leer("src/components/screens/MasterScreen.tsx");

  it("la ruta distingue las variantes y no las adivina", () => {
    expect(RUTA).toContain('searchParams.get("v")');
    expect(RUTA).toContain('v === "ejemplo"');
    expect(RUTA).toContain('v === "blanco"');
    expect(RUTA).toContain("plantillaEjemplo()");
    expect(RUTA).toContain("plantillaVacia()");
    expect(RUTA).toContain("exportarCorpusMd(items)");
  });

  it("★ pedir «mi master» con el master vacío NO devuelve otra cosa: devuelve 409", () => {
    // Servir el esqueleto a quien pidió su master sería la versión educada de
    // mentir. El mutante es fácil (cambiar el 409 por plantillaVacia) y este
    // test lo mata.
    const i = RUTA.indexOf('v === "master"');
    expect(i, "la ruta ya no distingue el caso «master vacío»").toBeGreaterThan(-1);
    // Solo el cuerpo de ESE `if`: hasta la siguiente sentencia de la función.
    const trozo = RUTA.slice(i, RUTA.indexOf("const md =", i));
    expect(trozo).toContain("409");
    expect(trozo).not.toContain("plantillaVacia()");
    expect(trozo).not.toContain("plantillaEjemplo()");
  });

  it("el fichero del ejemplo se llama distinto (no pisa la plantilla en Descargas)", () => {
    expect(RUTA).toContain("corpus-plantilla-ejemplo.md");
  });

  it("Importar ofrece las tres, y la de siempre sigue siendo un ancla plana", () => {
    expect(IMPORTAR).toContain('href="/api/master/plantilla"');
    expect(IMPORTAR).toContain('href="/api/master/plantilla?v=ejemplo"');
    expect(IMPORTAR).toContain('href="/api/master/plantilla?v=blanco"');
    // El rótulo dice lo que baja: con master poblado, «mi master».
    expect(IMPORTAR).toContain('t("importar.pl.dl.mio")');
    // Y el número de items se pide con la consulta barata, no bajando el master.
    expect(IMPORTAR).toContain('/api/master/plantilla?v=estado');
    expect(IMPORTAR).not.toContain('fetch("/api/master")');
  });

  it("Master ofrece el ejemplo en la barra Y en el estado vacío", () => {
    expect((MASTER_TSX.match(/href="\/api\/master\/plantilla\?v=ejemplo"/g) ?? []).length).toBe(2);
    expect(MASTER_TSX).toContain('href="/api/master/plantilla?v=blanco"');
  });

  it("★ ni un texto de estos botones incrustado en el TSX: ES y EN, los dos", () => {
    const nuevas = {
      importar: ["importar.pl.dl.mio", "importar.pl.dl.otras", "importar.pl.dl.blanco",
        "importar.pl.dl.blancoTitle", "importar.pl.dl.ejemplo", "importar.pl.dl.ejemploTitle"],
      master: ["master.plantilla.blanco", "master.plantilla.blancoTitle",
        "master.plantilla.ejemplo", "master.plantilla.ejemploTitle", "master.empty.plantillaEjemplo"],
    };
    const iguales: string[] = [];
    for (const k of nuevas.importar) {
      expect(importar.es[k], `falta ${k} en ES`).toBeTruthy();
      expect(importar.en[k], `falta ${k} en EN`).toBeTruthy();
      if (importar.es[k] === importar.en[k]) iguales.push(k);
      expect(IMPORTAR, `clave declarada y no usada: ${k}`).toContain(`t("${k}")`);
    }
    for (const k of nuevas.master) {
      expect(master.es[k], `falta ${k} en ES`).toBeTruthy();
      expect(master.en[k], `falta ${k} en EN`).toBeTruthy();
      if (master.es[k] === master.en[k]) iguales.push(k);
      expect(MASTER_TSX, `clave declarada y no usada: ${k}`).toContain(`t("${k}")`);
    }
    // El fallback a español es silencioso: una clave sin traducir se ve bien en
    // ES y desaparece en EN sin que nada falle. Aquí falla.
    expect(iguales, `sin traducir (EN = ES): ${iguales.join(", ")}`).toEqual([]);
  });

  it("el ejemplo se anuncia como INVENTADO también en la interfaz, no solo dentro del .md", () => {
    // Quien pulsa «con un ejemplo» tiene que saber ANTES de abrirlo que ese
    // perfil no es de nadie. El aviso vive en el title de los dos sitios.
    for (const s of [importar.es["importar.pl.dl.ejemploTitle"]!, master.es["master.plantilla.ejemploTitle"]!]) {
      expect(s.toLowerCase()).toContain("inventado");
    }
    for (const s of [importar.en["importar.pl.dl.ejemploTitle"]!, master.en["master.plantilla.ejemploTitle"]!]) {
      expect(s.toLowerCase()).toMatch(/made-up|fictional|invented/);
    }
  });
});

