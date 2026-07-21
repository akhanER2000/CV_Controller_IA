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

/* ── La plantilla vacía ───────────────────────────────────────────────────── */

/**
 * El esqueleto para quien empieza de cero. Las instrucciones van como comentario
 * del propio formato (`corpus:` — el parser los ignora sin ruido), así que el
 * fichero se puede rellenar y subir tal cual sin borrar nada.
 *
 * Los valores de ejemplo van entre corchetes a propósito: se ven a la legua y
 * quien no los sustituya verá `[Tu nombre]` en su CV, que es un fallo evidente y
 * no uno silencioso.
 */
export function plantillaVacia(): string {
  return `# CORPUS · Perfil profesional
formato: ${FORMATO_ID}

<!-- corpus: CÓMO SE RELLENA ESTO
     · Cada «## SECCIÓN» agrupa un tipo de dato. Cada «### entrada» es un item.
     · Los campos son «clave: valor». Los logros van como viñetas «- …».
     · Lo que no sepas, DÉJALO VACÍO o borra la línea. No lo inventes.
     · Puedes borrar las secciones que no uses.
     · Las fechas: «fechas: 2022 – 2024», o «desde: 2022-03» y «hasta: actualidad».
     · Este bloque y los demás comentarios NO se importan: puedes dejarlos.
-->

## CONTACTO
nombre: [Tu nombre completo]
titular: [Tu título profesional, p. ej. AI/ML Engineer]
email: [tu@correo.cl]
telefono: [+56 9 0000 0000]
ubicacion: [Ciudad, País]
enlace: LinkedIn | [https://www.linkedin.com/in/usuario]
enlace: GitHub | [https://github.com/usuario]

## RESUMEN
texto: [Dos o tres líneas sobre quién eres profesionalmente. Sin adjetivos vacíos: qué haces, con qué, y para quién.]

## EXPERIENCIA
### [Tu cargo] — [Empresa]
empresa: [Empresa]
ubicacion: [Ciudad, País]
desde: [2024-01]
hasta: [actualidad]
- [Un logro concreto. Si tiene una cifra, ponla: es lo que lo hace verificable.]
- [Otro logro. Qué hiciste, con qué, y qué cambió.]

## HABILIDADES
[Lenguajes]: [Python, TypeScript, SQL]
[Herramientas]: [Docker, Git, PostgreSQL]

## EDUCACION
### [Tu título]
institucion: [Universidad]
desde: [2020-03]
hasta: [2024-12]

## PROYECTOS
### [Nombre del proyecto]
descripcion: [Qué es y qué resuelve, en una línea.]
enlace: [https://github.com/usuario/proyecto]
- [Un detalle con cifra, si lo tiene.]

## CERTIFICACIONES
### [Nombre de la certificación]
emisor: [Quién la emite]
fechas: [2025]

## IDIOMAS
### [Español]
nivel: [nativo]

## REFERENCIAS
<!-- corpus: pídele permiso a la persona antes de incluirla. Son datos suyos, no tuyos. -->
### [Nombre de la persona]
cargo: [Su cargo]
organizacion: [Su organización]
relacion: [jefe directo | cliente | profesor]
email: [su@correo.cl]
`;
}
