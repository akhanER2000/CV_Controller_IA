/**
 * EXPORTAR · master → corpus/1.
 *
 * La dirección contraria del parser, y su espejo EXACTO: un solo formato, dos
 * direcciones. Todo lo que aquí se escribe, `parsearCorpusMd` lo lee; y lo que
 * este fichero no supiera escribir se perdería en el viaje — por eso nada se
 * omite «por ser feo»: lo que el formato no representa va como `extra:` en el
 * bloque de procedencia.
 *
 * EL CRITERIO QUE MANDA: exportar → parsear → comparar con el original tiene que
 * dar CERO diferencias sobre el objeto `data` COMPLETO, campo por campo. Comparar
 * una versión «normalizada» dejaría pasar un test verde mientras el dato se
 * degrada, que es justo el fallo que este formato existe para impedir.
 */

import {
  ADMITEN_VINETAS,
  CAMPOS_POR_KIND,
  CAMPO_TIPO,
  CLAVE_CABECERA,
  FORMATO_ID,
  MARCA_INTERNA,
  MARCA_PROC,
  SECCIONES,
  campoDeClaveData,
  codificar,
  codificarEnComentario,
  escribirEnlace,
  lineasDeCampo,
  seccionPorKind,
  type ItemParaExportar,
} from "./formato";

/* ── Procedencia ──────────────────────────────────────────────────────────── */

/**
 * El default del formato: un item SIN bloque es uno escrito a mano — origin
 * `manual` y evidencia verificada (el propio fichero ES la fuente). Escribir el
 * bloque cuando el item ya coincide con ese default sería ensuciar el documento
 * con metadatos que no dicen nada.
 *
 * ⚠ Asimetría deliberada y necesaria: el parser trata un bloque PRESENTE sin
 * `verificada:` como NO verificado (decir «verificado» sin que nadie lo haya
 * comprobado sería mentir). Por eso, en cuanto se escribe bloque, se escribe
 * `verificada:` SIEMPRE — si se omitiera, un item verificado volvería sin serlo.
 */
function necesitaBloque(it: ItemParaExportar, extras: [string, unknown][]): boolean {
  if (extras.length > 0) return true;
  if (it.evidenceSnippet != null && it.evidenceSnippet !== "") return true;
  if (it.sourceId != null) return true;
  if (it.evidencePage != null) return true;
  const origin = it.origin ?? "manual";
  if (origin !== "manual") return true;
  return (it.evidenceVerified ?? true) !== true;
}

/** Las claves de `data` que este kind NO sabe escribir como campo del formato. */
function extrasDe(it: ItemParaExportar): [string, unknown][] {
  const fuera: [string, unknown][] = [];
  for (const [k, v] of Object.entries(it.data ?? {})) {
    if (campoDeClaveData(it.kind, k)) continue;
    // En OTROS el kind viaja como campo `tipo`, no como extra.
    if (it.kind === "otros" && k === CAMPO_TIPO) continue;
    fuera.push([k, v]);
  }
  return fuera;
}

function bloqueProc(it: ItemParaExportar, extras: [string, unknown][]): string[] {
  const cuerpo: string[] = [];
  // ⚠ La marca va en la MISMA línea que `<!--`: el parser decide si el
  // comentario es de procedencia mirando lo que sigue a la apertura. Con la
  // marca en la línea de abajo, el bloque se leería como un comentario humano
  // cualquiera y la procedencia se perdería en silencio — que es exactamente el
  // fallo que este formato existe para impedir.
  if (it.sourceId != null) cuerpo.push(`fuente: ${codificarEnComentario(it.sourceId)}`);
  if (it.evidencePage != null) cuerpo.push(`pagina: ${it.evidencePage}`);
  cuerpo.push(`verificada: ${(it.evidenceVerified ?? true) ? "si" : "no"}`);

  const ev = it.evidenceSnippet;
  if (ev != null && ev !== "") {
    // Multilínea con continuaciones `|`: cada línea del fragmento es una línea
    // del fichero, así que git la diffea línea a línea. base64 habría cabido en
    // una sola y habría vuelto ilegible cualquier cambio.
    const trozos = ev.split("\n");
    cuerpo.push(`evidencia: |${codificarEnComentario(trozos[0]!)}`);
    for (const t of trozos.slice(1)) cuerpo.push(`|${codificarEnComentario(t)}`);
  }

  // El JSON conserva el TIPO exacto: `true` no vuelve como `"true"`.
  for (const [k, v] of extras) {
    cuerpo.push(`extra: ${codificarEnComentario(k)} = ${codificarEnComentario(JSON.stringify(v))}`);
  }

  return [`<!-- ${MARCA_PROC} origen: ${codificarEnComentario(it.origin ?? "manual")}`, ...cuerpo, "-->"];
}

/* ── Escritura de una entrada ─────────────────────────────────────────────── */

/**
 * ¿Este valor sobrevive intacto dentro de un `### …`? El encabezado recorta los
 * bordes y no admite saltos de línea, así que un valor con espacios al borde,
 * multilínea o vacío tiene que ir además como campo explícito (el parser da
 * prioridad al campo, así lo dice su propio comentario).
 */
function cabeEnTitulo(v: unknown): v is string {
  return typeof v === "string" && v !== "" && !v.includes("\n") && v === v.trim() && !v.startsWith("|");
}

function lineasDeItem(it: ItemParaExportar, hijos: ItemParaExportar[]): string[] {
  const out: string[] = [];
  const extras = extrasDe(it);
  if (necesitaBloque(it, extras)) out.push(...bloqueProc(it, extras));

  const data = it.data ?? {};
  const claveCab = CLAVE_CABECERA[it.kind];
  const valorCab = claveCab ? data[claveCab] : undefined;

  // basics y summary no llevan `###`: sus campos cuelgan directos de la sección
  // (el parser abre la entrada solo al ver el primer campo).
  const llevaTitulo = it.kind !== "basics" && it.kind !== "summary";
  // ⚠ Sin el `llevaTitulo`, en CONTACTO se saltaba el campo `name` dando por
  // hecho que ya estaba escrito en un `###`… que nunca se escribió, y el nombre
  // se perdía en el viaje. La condición y el sitio donde se escribe tienen que
  // ser la MISMA decisión, no dos parecidas.
  const cabeceraEnTitulo = llevaTitulo && claveCab != null && cabeEnTitulo(valorCab);
  if (llevaTitulo) {
    out.push(cabeceraEnTitulo ? `### ${codificar(valorCab)}` : "###");
  }

  if (it.kind === "otros") {
    // Lo que hace la sección OTROS reversible: el kind real viaja en un campo.
    out.push(...lineasDeCampo(CAMPO_TIPO, String((data as Record<string, unknown>)[CAMPO_TIPO] ?? it.kind)));
  }

  for (const def of CAMPOS_POR_KIND[it.kind] ?? []) {
    if (!(def.clave in data)) continue;
    // Ya está escrito en el `###`; repetirlo sería duplicar el dato.
    if (cabeceraEnTitulo && def.clave === claveCab) continue;
    const v = data[def.clave];

    if (def.clave === "links") {
      // Repetible: una línea por enlace, preservando si era string u objeto.
      for (const l of Array.isArray(v) ? v : [v]) {
        const escrito = escribirEnlace(l);
        if (escrito != null) out.push(`${def.nombre}: ${escrito}`);
      }
      continue;
    }
    if (typeof v === "string") { out.push(...lineasDeCampo(def.nombre, v)); continue; }
    // Un no-string en una clave conocida (p. ej. `qr`) no cabe como texto: se
    // escribe como extra para no cambiarle el tipo al volver.
    out.push(`<!-- ${MARCA_PROC} extra: ${codificarEnComentario(def.clave)} = ${codificarEnComentario(JSON.stringify(v))} -->`);
  }

  // El texto del summary va como campo `texto:`, no como prosa suelta: la prosa
  // es azúcar de ENTRADA (cómoda de escribir a mano) y el campo es inequívoco.
  for (const h of hijos) {
    // Una viñeta tiene procedencia PROPIA: puede venir de una fuente distinta a
    // la de su rol (el rol de LinkedIn, el logro del cuestionario). Sin su
    // bloque delante, volvería como «manual» y perdería su evidencia.
    const extrasH = extrasDe(h);
    if (necesitaBloque(h, extrasH)) out.push(...bloqueProc(h, extrasH));
    const t = h.data?.text;
    const texto = typeof t === "string" ? t : String(t ?? "");
    const trozos = texto.split("\n");
    out.push(`- ${trozos[0] === trozos[0]!.trim() && trozos[0] !== "" ? codificar(trozos[0]!) : `|${codificar(trozos[0]!)}`}`);
    for (const resto of trozos.slice(1)) out.push(`|${codificar(resto)}`);
  }

  return out;
}

/* ── La función pública ───────────────────────────────────────────────────── */

/**
 * El master entero como un `.md` de corpus/1. Los items se agrupan por sección
 * en el orden de SECCIONES y, dentro de cada una, por `sortOrder` — el mismo
 * orden que ve el usuario en la pantalla del master.
 */
export function exportarCorpusMd(items: ItemParaExportar[]): string {
  const lineas: string[] = ["# CORPUS · Perfil profesional", `formato: ${FORMATO_ID}`, ""];

  // Las viñetas no son entradas: cuelgan de su padre. Se indexan por parentId
  // para no barrer la lista entera por cada rol (con 105 items eso es cuadrático).
  const hijosDe = new Map<string, ItemParaExportar[]>();
  const sueltas: ItemParaExportar[] = [];
  for (const it of items) {
    if (it.kind !== "bullet") continue;
    if (it.parentId) {
      const l = hijosDe.get(it.parentId) ?? [];
      l.push(it);
      hijosDe.set(it.parentId, l);
    } else {
      sueltas.push(it);
    }
  }
  for (const l of hijosDe.values()) l.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const porOrden = (a: ItemParaExportar, b: ItemParaExportar): number => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  const conocidos = new Set(SECCIONES.map((s) => s.kind));

  for (const sec of SECCIONES) {
    let delKind: ItemParaExportar[];
    if (sec.kind === "otros") {
      // La red de seguridad: un kind sin sección propia (o inventado más tarde)
      // tiene DÓNDE escribirse. Sin esto acabaría descartado, que es la única
      // cosa que este producto no se permite.
      delKind = items.filter((i) => i.kind !== "bullet" && !conocidos.has(i.kind)).sort(porOrden);
    } else {
      delKind = items.filter((i) => i.kind === sec.kind).sort(porOrden);
    }
    if (delKind.length === 0) continue;

    lineas.push(`## ${sec.titulo}`);
    for (const it of delKind) {
      const hijos = ADMITEN_VINETAS.has(it.kind) && it.id ? (hijosDe.get(it.id) ?? []) : [];
      lineas.push(...lineasDeItem(it, hijos));
      lineas.push("");
    }
  }

  // Una viñeta huérfana (sin padre) no se tira: se escribe al final con su aviso.
  if (sueltas.length > 0) {
    lineas.push("## OTROS");
    for (const h of sueltas.sort(porOrden)) {
      lineas.push(...lineasDeItem({ ...h, kind: "otros", data: { ...h.data, [CAMPO_TIPO]: "bullet" } }, []));
      lineas.push("");
    }
  }

  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/* ============================================================================
   LA PLANTILLA VACÍA · DERIVADA, NO ESCRITA A MANO

   Antes esto era un literal de 70 líneas. Con el vocabulario en `formato.ts` y
   el texto aquí, eran DOS LISTAS QUE MANTENER A LA VEZ, y las dos listas
   divergieron exactamente como divergen siempre: el formato sabía escribir
   PUBLICACIONES y ENLACES desde el primer día y la plantilla no los ofrecía, así
   que quien la rellenaba a mano producía menos de lo que el sistema admite —
   perder un dato por no tener dónde escribirlo es perderlo igual.

   Ahora el fichero se GENERA recorriendo SECCIONES y CAMPOS_POR_KIND. Añadir un
   kind al vocabulario lo hace aparecer aquí el mismo día; añadir un campo a un
   kind lo hace aparecer en su bloque. Si nadie le escribe una pista, sale con la
   genérica `[nombre]`: fea, pero PRESENTE. La fealdad se ve; la ausencia no.

   Los valores van entre corchetes a propósito: se ven a la legua y quien no los
   sustituya verá `[Tu nombre]` en su CV — un fallo evidente, no uno silencioso.
   ========================================================================== */

/**
 * Lo que se escribe a la derecha de un campo de la plantilla.
 *  · `string`      → una línea `campo: valor`.
 *  · `string[]`    → una línea POR ELEMENTO (los repetibles, hoy `enlace:`).
 *  · `{desde,hasta}` → el azúcar de fechas, que el exportador nunca escribe pero
 *    la plantilla SÍ enseña: es la forma cómoda para quien escribe a mano.
 */
type ValorPista = string | string[] | { desde: string; hasta: string };

interface BloquePlantilla {
  /** valores por CLAVE DE `data`. Lo que falte sale con su pista genérica. */
  campos?: Record<string, ValorPista>;
  /** viñetas de ejemplo del bloque (solo tienen sentido en ADMITEN_VINETAS). */
  vinetas?: string[];
}

interface SeccionPlantilla {
  /** comentario `corpus:` que va justo bajo el «## TÍTULO». */
  nota?: string[];
  /** líneas literales antes de los bloques. Hoy solo HABILIDADES (ver abajo). */
  crudas?: string[];
  bloques: BloquePlantilla[];
}

/**
 * El comentario del formato: `corpus:` lo hace INTERNO y el parser lo ignora sin
 * ruido, así que el fichero se puede subir con las instrucciones dentro.
 *
 * Exportado porque `ejemplo.ts` escribe los suyos con la MISMA forma: dos copias
 * de esta función acabarían con dos dialectos de comentario en el mismo formato.
 * La línea en blanco se queda en blanco de verdad (sin la sangría): un fichero
 * con espacios al final de línea ensucia el primer diff que le hagan.
 */
export function comentarioCorpus(lineas: string[]): string[] {
  if (lineas.length === 1) return [`<!-- ${MARCA_INTERNA} ${lineas[0]} -->`];
  return [
    `<!-- ${MARCA_INTERNA} ${lineas[0]}`,
    ...lineas.slice(1).map((l) => (l === "" ? "" : `     ${l}`)),
    "-->",
  ];
}

const INSTRUCCIONES = [
  "CÓMO SE RELLENA ESTO",
  "· Cada «## SECCIÓN» agrupa un tipo de dato. Cada «### entrada» es un item.",
  "· Los campos son «clave: valor». Los logros van como viñetas «- …».",
  "· Lo que no sepas, DÉJALO VACÍO o borra la línea. No lo inventes.",
  "· Puedes borrar las secciones que no uses, y repetir un «###» tantas veces como haga falta.",
  "· Las fechas: «fechas: 2022 – 2024», o «desde: 2022-03» y «hasta: actualidad».",
  "· Este bloque y los demás comentarios NO se importan: puedes dejarlos.",
  "· This template is written in Spanish, but the parser also accepts English",
  "  field names (name, company, dates, skills…) and English section titles.",
];

/**
 * Las pistas de cada sección. Es TEXTO, no estructura: la estructura sale del
 * vocabulario. Un kind que no esté aquí se dibuja igual, con un bloque de pistas
 * genéricas — que es justo lo que impide que un kind nuevo se quede fuera.
 */
const ESQUELETO: Record<string, SeccionPlantilla> = {
  basics: {
    bloques: [{
      campos: {
        name: "[Tu nombre completo]",
        label: "[Tu título profesional, p. ej. AI/ML Engineer]",
        email: "[tu@correo.cl]",
        phone: "[+56 9 0000 0000]",
        location: "[Ciudad, País]",
        // Repetible: `enlace:` se ACUMULA (regla 3), no se pisa. La forma
        // «Etiqueta | url» y la url pelada valen las dos.
        links: [
          "LinkedIn | [https://www.linkedin.com/in/usuario]",
          "GitHub | [https://github.com/usuario]",
          "[Portfolio] | [https://tusitio.cl]",
        ],
        // ⚠ VACÍO A PROPÓSITO. `photo` es una clave real del master (la usa
        // buildResumeData para el PDF) y por eso el campo se enseña; pero se
        // rellena desde el editor de la variante, no escribiendo aquí. Con una
        // pista entre corchetes, quien no la borrara acabaría con «[…]» de src
        // de la foto y una imagen rota en su CV.
        photo: "",
      },
    }],
    nota: [
      "«enlace» se puede repetir tantas veces como quieras: no se pisan.",
      "«foto» se deja vacío: la foto se sube desde el editor de la variante.",
    ],
  },

  summary: {
    bloques: [{
      campos: {
        text: "[Dos o tres líneas sobre quién eres profesionalmente. Sin adjetivos vacíos: qué haces, con qué, y para quién.]",
      },
    }],
  },

  work: {
    nota: [
      "La MODALIDAD va en «ubicacion», que es donde la guarda el master:",
      "«ubicacion: Santiago, Chile · híbrido» (o remoto, o presencial).",
      "Copia el bloque «###» entero por cada rol que hayas tenido.",
    ],
    bloques: [
      {
        campos: {
          title: "[Tu cargo] — [Empresa]",
          company: "[Empresa]",
          location: "[Ciudad, País]",
          url: "[https://empresa.cl — opcional]",
          // Con desde:/hasta: en el rol en curso y `fechas:` en el anterior, la
          // plantilla enseña LAS DOS formas sin explicar ninguna.
          dates: { desde: "[2024-01]", hasta: "[actualidad]" },
        },
        vinetas: [
          "[Un logro concreto. Si tiene una cifra, ponla: es lo que lo hace verificable.]",
          "[Otro logro. Qué hiciste, con qué, y qué cambió.]",
        ],
      },
      {
        campos: {
          title: "[Cargo anterior] — [Empresa anterior]",
          company: "[Empresa anterior]",
          location: "[Ciudad, País · remoto]",
          url: "",
          dates: "[2021 – 2024]",
        },
        vinetas: ["[Qué dejaste mejor de lo que estaba. Con cifra si la tienes.]"],
      },
    ],
  },

  skill: {
    nota: [
      "LA FORMA CORTA: «Grupo: uno, dos, tres». Una línea por grupo.",
      "Un master real tiene entre 10 y 15 grupos, no dos: añade los tuyos.",
      "Regla 7: lo que escribas aquí es una HABILIDAD, no se reclasifica sola.",
    ],
    // ⚠ LITERALES, y no derivadas del vocabulario, por una razón del formato: la
    // forma corta usa el NOMBRE DEL GRUPO como clave («Lenguajes: …»), así que no
    // hay ningún `def.nombre` que escribir. El bloque largo de abajo sí sale del
    // vocabulario y es el que garantiza que ningún campo de skill se quede fuera.
    crudas: [
      "[Lenguajes]: [Python, TypeScript, SQL]",
      "[Herramientas]: [Docker, Git, PostgreSQL]",
      "[Frameworks]: [React, Next.js, FastAPI]",
      "[Datos]: [PostgreSQL, pandas, dbt]",
      "[Nube y DevOps]: [AWS, Terraform, GitHub Actions]",
      "[IA aplicada]: [RAG, embeddings, evaluación]",
      "[Metodologías]: [Scrum, revisión de código, TDD]",
      "[Blandas]: [mentoría, documentación técnica, hablar en público]",
    ],
    bloques: [{
      campos: {
        group: "[Nombre del grupo, si prefieres la forma larga]",
        items: "[uno, dos, tres]",
        sourceContext: "[de qué rol o proyecto salió este grupo — opcional]",
      },
    }],
  },

  education: {
    bloques: [{
      campos: {
        degree: "[Tu título]",
        institution: "[Universidad]",
        location: "[Ciudad, País]",
        url: "[https://enlace-al-programa — opcional]",
        dates: { desde: "[2020-03]", hasta: "[2024-12]" },
      },
    }],
  },

  project: {
    bloques: [{
      campos: {
        name: "[Nombre del proyecto]",
        description: "[Qué es y qué resuelve, en una línea.]",
        url: "[https://github.com/usuario/proyecto]",
        dates: "[2025]",
      },
      vinetas: ["[Un detalle con cifra, si lo tiene.]"],
    }],
  },

  certification: {
    bloques: [{
      campos: {
        name: "[Nombre de la certificación]",
        issuer: "[Quién la emite]",
        url: "[https://enlace-a-la-credencial — opcional]",
        dates: "[2025]",
      },
    }],
  },

  language: {
    bloques: [
      { campos: { language: "[Español]", level: "[nativo]" } },
      { campos: { language: "[Inglés]", level: "[profesional (B2)]" } },
    ],
  },

  // ★ La sección que faltaba y que más pesa en un perfil de investigación: un
  // paper, una ponencia, un capítulo. El kind existe en el enum item_kind desde
  // el esquema 0001 y el formato sabía escribirlo; sin sección en la plantilla,
  // quien la rellenaba a mano no tenía dónde ponerlo.
  publication: {
    nota: ["Artículos, ponencias, capítulos, informes técnicos publicados."],
    bloques: [{
      campos: {
        name: "[Título de la publicación]",
        description: "[Dónde salió y de qué va, en una línea. Revisada por pares o no.]",
        url: "[https://doi.org/… o el enlace donde se lee]",
        dates: "[2025]",
      },
      vinetas: ["[Lo que la hace citable: dónde se presentó, cuántas citas, qué datos abriste.]"],
    }],
  },

  link: {
    nota: ["Enlaces que no son de contacto: una charla, un repo suelto, una entrevista."],
    bloques: [{
      campos: {
        label: "[Cómo se llama ese enlace]",
        url: "[https://…]",
      },
    }],
  },

  reference: {
    nota: ["Pídele permiso a la persona antes de incluirla. Son datos suyos, no tuyos."],
    bloques: [{
      campos: {
        name: "[Nombre de la persona]",
        role: "[Su cargo]",
        org: "[Su organización]",
        relation: "[jefe directo, cliente, profesor…]",
        email: "[su@correo.cl]",
        phone: "",
      },
    }],
  },
};

/**
 * OTROS no se dibuja: es la red de seguridad del EXPORTADOR (dónde escribir un
 * kind que no tiene sección propia), no un sitio donde un humano deba escribir
 * nada. Ofrecérselo sería invitarle a poner `tipo: loQueSea` y a que el master
 * se lo rechace con un 400. La exclusión está declarada aquí —y comprobada en
 * el test de paridad— para que sea una decisión y no un olvido.
 */
const SIN_PLANTILLA = new Set(["otros"]);

/** Un bloque `###` con todos los campos de su kind, en el orden del vocabulario. */
function lineasDeBloquePlantilla(kind: string, b: BloquePlantilla): string[] {
  const out: string[] = [];
  const campos = b.campos ?? {};
  const claveCab = CLAVE_CABECERA[kind];
  // Misma condición que en lineasDeItem: CONTACTO y RESUMEN cuelgan sus campos
  // directos de la sección. Si fueran dos decisiones parecidas en vez de la
  // misma, la plantilla enseñaría una forma que el exportador no escribe.
  const conTitulo = kind !== "basics" && kind !== "summary" && claveCab != null;

  if (conTitulo) {
    const rot = campos[claveCab];
    out.push(`### ${typeof rot === "string" && rot !== "" ? rot : `[${claveCab}]`}`);
  }

  for (const def of CAMPOS_POR_KIND[kind] ?? []) {
    if (conTitulo && def.clave === claveCab) continue; // ya está en el ###
    // ★ EL FALLBACK QUE HACE QUE ESTO NO SE PUDRA: un campo nuevo del que nadie
    // escribió pista sale igual, con su nombre entre corchetes.
    const v = campos[def.clave] ?? `[${def.nombre}]`;

    if (Array.isArray(v)) {
      for (const l of v) out.push(`${def.nombre}: ${l}`);
      continue;
    }
    if (typeof v === "object") {
      // El azúcar solo significa algo donde hay `dates`; en cualquier otro campo
      // sería una línea que el parser no sabría colocar.
      if (def.clave === "dates") out.push(`desde: ${v.desde}`, `hasta: ${v.hasta}`);
      else out.push(...lineasDeCampo(def.nombre, ""));
      continue;
    }
    out.push(...lineasDeCampo(def.nombre, v));
  }

  for (const t of b.vinetas ?? []) out.push(`- ${t}`);
  return out;
}

/**
 * El esqueleto para quien empieza de cero, generado desde el vocabulario. Las
 * instrucciones van como comentario del propio formato (`corpus:` — el parser
 * los ignora sin ruido), así que el fichero se puede rellenar y subir tal cual
 * sin borrar nada.
 */
export function plantillaVacia(): string {
  const lineas: string[] = [
    "# CORPUS · Perfil profesional",
    `formato: ${FORMATO_ID}`,
    "",
    ...comentarioCorpus(INSTRUCCIONES),
    "",
  ];

  for (const sec of SECCIONES) {
    if (SIN_PLANTILLA.has(sec.kind)) continue;
    const esq = ESQUELETO[sec.kind] ?? { bloques: [{}] };
    lineas.push(`## ${sec.titulo}`);
    if (esq.nota) lineas.push(...comentarioCorpus(esq.nota));
    if (esq.crudas) lineas.push(...esq.crudas, "");
    for (const b of esq.bloques) {
      lineas.push(...lineasDeBloquePlantilla(sec.kind, b));
      lineas.push("");
    }
  }

  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
