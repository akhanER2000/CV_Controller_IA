/* ============================================================================
   corpus/1 · EL PARSER  (.md → items)

   ★ CERO IA. Ni un modelo, ni una llamada de red, ni un import de `ai`. La
   pregunta «¿el parser llama a algún modelo?» la responde el build, no una
   persona: tests/corpus-md-parser.test.ts lee el FUENTE de estos módulos y falla
   si aparece un import prohibido. Aquí solo hay gramática.

   ── DEGRADACIÓN ELEGANTE ───────────────────────────────────────────────────
   Una sección mal escrita se MARCA; no tumba el fichero. Tres errores producen
   tres avisos y el resto se importa igual. Nada se descarta: lo que no encaja en
   la gramática sale en `notas` con su número de línea, para que el humano lo vea
   y decida. Un parser que se calla es peor que uno que falla.
   ========================================================================== */

import {
  ALIAS_DESDE,
  ALIAS_HASTA,
  ALIAS_TIPO,
  CAMPOS_PROC,
  CLAVES_DATA,
  CLAVE_CABECERA,
  FORMATO_ID,
  MARCA_INTERNA,
  MARCA_PROC,
  ORIGENES,
  SUGERENCIA_FECHA,
  campoPorAlias,
  esNombreDeCampo,
  leerBooleano,
  leerContinuacion,
  leerEnlace,
  leerValor,
  normalizarClave,
  normalizarDesdeHasta,
  seccionPorTitulo,
  type AvisoParseo,
  type ItemParseado,
  type ResultadoParseo,
} from "./formato";

/* ── Detección barata ─────────────────────────────────────────────────────── */

/**
 * ¿Esto es un corpus/1? Se pregunta ANTES de decidir por dónde entra un texto,
 * así que aquí se es ESTRICTO: hace falta la declaración `formato: corpus/1` o
 * el encabezado `# CORPUS`. Bastar con «tiene un ## Experiencia» habría hecho
 * que cualquier CV en markdown se colara por la vía determinista y se importara
 * a medias. Se miran solo las primeras líneas: es una comprobación, no un
 * análisis.
 */
export function pareceCorpusMd(texto: string): boolean {
  if (!texto) return false;
  const cabeza = texto.split(/\r?\n/, 40);
  for (const l of cabeza) {
    if (/^\s*formato\s*:\s*corpus\/1\s*$/i.test(l)) return true;
    if (/^#\s+CORPUS\b/i.test(l)) return true;
  }
  return false;
}

/* ── Estado interno del recorrido ─────────────────────────────────────────── */

/** Procedencia leída de un bloque `<!-- corpus:proc … -->`, aún sin dueño. */
interface ProcPendiente {
  linea: number;
  origin?: string;
  sourceId?: string | null;
  evidenceSnippet?: string | null;
  evidencePage?: number | null;
  evidenceVerified?: boolean;
  extras: Record<string, unknown>;
}

/** Una entrada abierta: el item y lo que aún no se ha volcado en su `data`. */
interface Entrada {
  indice: number;
  kind: string;
  /** desde:/hasta: se resuelven al CERRAR la entrada, no línea a línea. */
  desde: string | null;
  hasta: string | null;
  lineaDesde: number;
  lineaHasta: number;
  /** ¿se escribió `fechas:` explícito? Entonces manda él. */
  fechasExplicitas: boolean;
}

export function parsearCorpusMd(texto: string): ResultadoParseo {
  const lineas = (texto ?? "").split(/\r?\n/);
  const items: ItemParseado[] = [];
  const avisos: AvisoParseo[] = [];
  const notas: { linea: number; texto: string }[] = [];

  let formato: string | null = null;
  let seccionKind: string | null = null;
  let seccionReconocida = false;
  let huboSeccion = false;
  let entrada: Entrada | null = null;
  /** el item al que apunta una continuación `|`: [índice, clave] o null. */
  let campoAbierto: { destino: Record<string, unknown> | string[]; clave: string } | null = null;
  let proc: ProcPendiente | null = null;
  /** párrafo libre acumulado bajo ## RESUMEN. */
  let prosaResumen: { linea: number; trozos: string[] } | null = null;

  const avisar = (linea: number, mensaje: string, sugerencia?: string): void => {
    avisos.push(sugerencia ? { linea, mensaje, sugerencia } : { linea, mensaje });
  };
  const anotar = (linea: number, t: string): void => {
    if (t.trim()) notas.push({ linea, texto: t });
  };

  /* ── cierre de estructuras ─────────────────────────────────────────────── */

  /** Vuelca el azúcar de fechas en la entrada que se cierra. */
  const cerrarEntrada = (): void => {
    if (!entrada) return;
    const e = entrada;
    entrada = null;
    if (e.desde == null && e.hasta == null) return;
    const it = items[e.indice];
    if (!it) return;
    const { dates, banderas, noEntendidas } = normalizarDesdeHasta(e.desde, e.hasta);
    const lineaRef = e.desde != null ? e.lineaDesde : e.lineaHasta;
    for (const raro of noEntendidas) {
      // Se MARCA y se pregunta; no se infiere ni se descarta. El texto literal
      // sigue viviendo en `dates`, así que el dato no se pierde por no
      // entenderse.
      avisar(lineaRef, `«${raro}» no es una fecha válida.`, SUGERENCIA_FECHA);
    }
    if (e.fechasExplicitas) {
      // `fechas:` es el canónico (lleva el texto tal cual del master). El azúcar
      // solo aporta las banderas derivadas.
      avisar(lineaRef, "hay «fechas:» y también «desde:/hasta:»; manda «fechas:».",
        "Deja solo uno de los dos para no tener dos versiones de lo mismo.");
    } else if (dates !== "") {
      it.data.dates = dates;
    }
    if (e.hasta != null && e.desde == null) {
      avisar(e.lineaHasta, "hay «hasta:» sin «desde:».", "Añade «desde:» o escribe el rango entero en «fechas:».");
    }
    Object.assign(it.data, banderas);
  };

  const cerrarProsaResumen = (): void => {
    if (!prosaResumen) return;
    const p = prosaResumen;
    prosaResumen = null;
    const it = items[items.length - 1];
    if (!it || it.kind !== "summary") return;
    const texto = p.trozos.join("\n");
    if (typeof it.data.text === "string" && it.data.text !== "") {
      // El campo explícito manda, pero la prosa NO se tira: sale como nota.
      anotar(p.linea, texto);
      avisar(p.linea, "hay «texto:» y además un párrafo suelto en RESUMEN; manda «texto:».",
        "El párrafo suelto se conserva como nota; bórralo o quita «texto:».");
      return;
    }
    it.data.text = texto;
  };

  /* ── creación de items ─────────────────────────────────────────────────── */

  const crearItem = (kind: string, data: Record<string, unknown>, parentIndex?: number): number => {
    const it: ItemParseado = { kind, data };
    if (parentIndex != null) it.parentIndex = parentIndex;
    if (proc) {
      // ★ El bloque describe al item que viene JUSTO DESPUÉS. Regla sin
      // excepciones: así también funciona para el CONTACTO, que no lleva ###.
      if (proc.origin !== undefined) it.origin = proc.origin;
      if (proc.sourceId !== undefined) it.sourceId = proc.sourceId;
      if (proc.evidenceSnippet !== undefined) it.evidenceSnippet = proc.evidenceSnippet;
      if (proc.evidencePage !== undefined) it.evidencePage = proc.evidencePage;
      it.evidenceVerified = proc.evidenceVerified ?? false;
      if (it.origin === undefined) it.origin = "manual";
      for (const [k, v] of Object.entries(proc.extras)) {
        if (k in data) {
          avisar(proc.linea, `«${k}» está a la vez como campo y como extra; se queda el campo.`);
          continue;
        }
        data[k] = v;
      }
      proc = null;
    }
    items.push(it);
    return items.length - 1;
  };

  /** Abre una entrada del kind de la sección (explícita con ### o implícita). */
  const abrirEntrada = (kind: string, rotulo: string, linea: number): Entrada => {
    cerrarProsaResumen();
    cerrarEntrada();
    const data: Record<string, unknown> = {};
    const claveCabecera = CLAVE_CABECERA[kind];
    if (rotulo !== "") {
      if (claveCabecera) data[claveCabecera] = rotulo;
      else {
        // Un ### con texto en una sección cuyo kind no tiene título (RESUMEN,
        // OTROS): no se adivina a qué campo iría. Se conserva como nota.
        anotar(linea, rotulo);
        avisar(linea, `«${rotulo}» está en un ### de una sección sin título; se conserva como nota.`,
          "Escribe el dato con su clave (p. ej. «texto: …»).");
      }
    }
    const indice = crearItem(kind, data);
    entrada = { indice, kind, desde: null, hasta: null, lineaDesde: linea, lineaHasta: linea, fechasExplicitas: false };
    return entrada;
  };

  /** La entrada en curso, creándola implícita si aún no hay ninguna. */
  const entradaViva = (linea: number): Entrada | null => {
    if (entrada) return entrada;
    if (!seccionKind) return null;
    return abrirEntrada(seccionKind, "", linea);
  };

  /* ── recorrido ─────────────────────────────────────────────────────────── */

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]!;
    const n = i + 1;

    /* Comentarios HTML. Los `corpus:*` son del formato; el resto son anotaciones
       de la persona y NO son datos — se ignoran, pero se avisa una vez para que
       nadie escriba media experiencia dentro de un comentario y la dé por
       importada. */
    const abre = linea.match(/^\s*<!--\s*(.*)$/);
    if (abre) {
      const primeraDentro = abre[1]!;
      const esProc = normalizarClave(primeraDentro).startsWith(MARCA_PROC);
      const esInterno = normalizarClave(primeraDentro).startsWith(MARCA_INTERNA);
      const cuerpo: { linea: number; texto: string }[] = [];
      let resto = primeraDentro;
      let j = i;
      let cerrado = false;
      for (;;) {
        const fin = resto.indexOf("-->");
        if (fin >= 0) { cuerpo.push({ linea: j + 1, texto: resto.slice(0, fin) }); cerrado = true; break; }
        cuerpo.push({ linea: j + 1, texto: resto });
        j++;
        if (j >= lineas.length) break;
        resto = lineas[j]!;
      }
      if (!cerrado) {
        avisar(n, "hay un comentario HTML sin cerrar.", "Ciérralo con «-->».");
      }
      if (esProc) {
        proc = leerBloqueProc(cuerpo, n, avisar);
      } else if (!esInterno) {
        const dentro = cuerpo.map((c) => c.texto).join("\n").trim();
        if (dentro) {
          avisar(n, "un comentario HTML no se importa: nada de lo que hay dentro entra al master.",
            "Si eso es un dato, sácalo del comentario.");
        }
      }
      i = j;
      campoAbierto = null;
      continue;
    }

    /* Continuación `|` de un valor multilínea. Va ANTES que nada porque su
       primer carácter no colisiona con ninguna otra forma. */
    if (campoAbierto) {
      const cont = leerContinuacion(linea);
      if (cont !== null) {
        const d = campoAbierto.destino;
        if (Array.isArray(d)) d[d.length - 1] += `\n${cont}`;
        else d[campoAbierto.clave] = `${String(d[campoAbierto.clave] ?? "")}\n${cont}`;
        continue;
      }
    }
    campoAbierto = null;

    if (linea.trim() === "") { continue; }

    /* Encabezado de sección `##`. */
    const h2 = linea.match(/^\s*##\s+(.*?)\s*#*\s*$/);
    if (h2) {
      cerrarProsaResumen();
      cerrarEntrada();
      huboSeccion = true;
      const def = seccionPorTitulo(h2[1]!);
      if (!def) {
        seccionKind = null;
        avisar(n, `«${h2[1]}» no es una sección conocida; lo que venga debajo se conserva como notas.`,
          "Secciones válidas: CONTACTO, RESUMEN, EXPERIENCIA, HABILIDADES, EDUCACION, PROYECTOS, CERTIFICACIONES, IDIOMAS, PUBLICACIONES, ENLACES, REFERENCIAS.");
        anotar(n, linea.trim());
      } else {
        seccionKind = def.kind;
        seccionReconocida = true;
      }
      continue;
    }

    /* Encabezado de entrada `###`. */
    const h3 = linea.match(/^\s*###\s*(.*?)\s*#*\s*$/);
    if (h3) {
      if (!seccionKind) {
        anotar(n, linea.trim());
        avisar(n, "hay una entrada «###» fuera de cualquier sección.", "Ponle encima su «## SECCIÓN».");
        continue;
      }
      abrirEntrada(seccionKind, decodeRotulo(h3[1]!), n);
      continue;
    }

    /* Título `#` del documento: rótulo, no dato. */
    if (/^\s*#\s+/.test(linea)) { continue; }

    /* Viñeta `-` / `*`. Regla 4. */
    const vin = linea.match(/^\s*[-*]\s?(.*)$/);
    if (vin) {
      cerrarProsaResumen();
      const valor = leerValor(vin[1]!);
      const padre = entrada;
      if (!padre) {
        crearItem("bullet", { text: valor });
        avisar(n, "esta viñeta no cuelga de ningún bloque; entra suelta.",
          seccionKind === "skill"
            ? "En HABILIDADES escribe «Grupo: a, b, c»."
            : "Ponle encima su «### título» para que sepamos de qué es.");
      } else {
        const idx = crearItem("bullet", { text: valor }, padre.indice);
        if (!["work", "project", "publication", "education"].includes(padre.kind)) {
          avisar(n, `una viñeta colgando de «${padre.kind}» es rara, pero se conserva.`);
        }
        const it = items[idx]!;
        campoAbierto = { destino: it.data, clave: "text" };
      }
      if (!campoAbierto) campoAbierto = { destino: items[items.length - 1]!.data, clave: "text" };
      continue;
    }

    /* Campo `clave: valor`. */
    const campo = linea.match(/^\s*([^:\n]+?)\s*:(.*)$/);
    if (campo) {
      const claveCruda = campo[1]!;
      const resto = campo[2]!;
      const clave = normalizarClave(claveCruda);

      // La declaración del formato, antes de cualquier sección.
      if (!huboSeccion && clave === "formato") {
        formato = leerValor(resto);
        if (formato !== FORMATO_ID) {
          avisar(n, `el formato declarado es «${formato}» y no «${FORMATO_ID}».`,
            `Escribe «formato: ${FORMATO_ID}».`);
        }
        continue;
      }

      if (!seccionKind) {
        anotar(n, linea.trim());
        avisar(n, `«${claveCruda}» está fuera de cualquier sección; se conserva como nota.`,
          "Ponle encima su «## SECCIÓN».");
        continue;
      }

      const e = entradaViva(n);
      if (!e) { anotar(n, linea.trim()); continue; }
      const it = items[e.indice]!;

      // OTROS lleva el kind en un campo: es lo que hace la sección reversible.
      if (e.kind === "otros" && ALIAS_TIPO.includes(clave)) {
        const k = leerValor(resto);
        if (k) it.kind = k;
        continue;
      }

      // Azúcar de fechas. Se guarda y se resuelve al cerrar la entrada, porque
      // «desde» y «hasta» solo significan algo juntos.
      if (ALIAS_DESDE.includes(clave) || ALIAS_HASTA.includes(clave)) {
        if (ALIAS_DESDE.includes(clave)) { e.desde = leerValor(resto); e.lineaDesde = n; }
        else { e.hasta = leerValor(resto); e.lineaHasta = n; }
        continue;
      }

      const def = campoPorAlias(e.kind, claveCruda);
      if (def) {
        const valor = leerValor(resto);
        if (def.clave === "links") {
          // Regla 3: los repetibles se ACUMULAN, no se pisan.
          const lista = Array.isArray(it.data.links) ? (it.data.links as unknown[]) : [];
          lista.push(leerEnlace(valor));
          it.data.links = lista;
          // Una continuación de un enlace toca el último elemento crudo; se
          // resuelve como texto y luego se vuelve a partir en etiqueta|url.
          campoAbierto = null;
        } else {
          if (def.clave === "dates") e.fechasExplicitas = true;
          it.data[def.clave] = valor;
          campoAbierto = { destino: it.data, clave: def.clave };
        }
        continue;
      }

      // Regla 7: bajo ## HABILIDADES, una clave que no es campo conocido ES el
      // nombre de un grupo. «Idiomas: Inglés B1» es una habilidad llamada
      // «Idiomas», no el idioma Inglés. El humano ya clasificó al escribirlo.
      if (seccionKind === "skill" && !esNombreDeCampo("skill", claveCruda)) {
        cerrarEntrada();
        const idx = crearItem("skill", { group: claveCruda.trim(), items: leerValor(resto) });
        entrada = { indice: idx, kind: "skill", desde: null, hasta: null, lineaDesde: n, lineaHasta: n, fechasExplicitas: false };
        campoAbierto = { destino: items[idx]!.data, clave: "items" };
        continue;
      }

      // No encaja: se conserva. Regla 5.
      anotar(n, linea.trim());
      avisar(n, `«${claveCruda}» no es un campo de ${nombreLegible(e.kind)}; se conserva como nota.`,
        sugerirCampos(e.kind));
      continue;
    }

    /* Prosa suelta. Bajo ## RESUMEN es el párrafo libre; en el resto, nota. */
    if (seccionKind === "summary") {
      const e = entradaViva(n);
      if (e) {
        if (!prosaResumen) prosaResumen = { linea: n, trozos: [] };
        prosaResumen.trozos.push(linea.trim());
        continue;
      }
    }
    anotar(n, linea.trim());
    avisar(n, "esta línea no encaja en el formato; se conserva como nota.",
      "Si es un dato, dale su clave («clave: valor») o conviértela en viñeta con «-».");
  }

  cerrarProsaResumen();
  cerrarEntrada();

  if (proc) {
    avisar(proc.linea, "hay un bloque de procedencia que no describe a ningún item.",
      "Va justo ENCIMA del item al que pertenece.");
  }

  // Aviso tardío: claves que el master rechazaría. Se conservan igual — el 400
  // lo tiene que ver el humano ANTES de importar, no después.
  for (const it of items) {
    for (const k of Object.keys(it.data)) {
      if (!CLAVES_DATA.has(k)) {
        avisar(0, `la clave «${k}» no está en el vocabulario del master; se conserva, pero el guardado la rechazará.`);
        break;
      }
    }
  }

  const resumen: Record<string, number> = {};
  for (const it of items) resumen[it.kind] = (resumen[it.kind] ?? 0) + 1;

  return {
    ok: formato === FORMATO_ID || seccionReconocida,
    formato,
    items,
    avisos,
    notas,
    resumen,
  };
}

/* ── Bloque de procedencia ────────────────────────────────────────────────── */

function leerBloqueProc(
  cuerpo: { linea: number; texto: string }[],
  lineaBloque: number,
  avisar: (l: number, m: string, s?: string) => void,
): ProcPendiente {
  const p: ProcPendiente = { linea: lineaBloque, extras: {} };
  let evidencia: string | null = null;
  let abierto: "evidencia" | null = null;

  for (let k = 0; k < cuerpo.length; k++) {
    const { linea: nl, texto } = cuerpo[k]!;
    // La primera línea trae la marca «corpus:proc»; se descuenta.
    const crudo = k === 0 ? texto.replace(/^\s*corpus:proc\s*/i, "") : texto;
    if (crudo.trim() === "") { abierto = null; continue; }

    if (abierto === "evidencia") {
      const cont = leerContinuacion(crudo);
      if (cont !== null) { evidencia = `${evidencia ?? ""}\n${cont}`; continue; }
    }
    abierto = null;

    const m = crudo.match(/^\s*([^:\n]+?)\s*:(.*)$/);
    if (!m) { avisar(nl, `«${crudo.trim()}» no encaja en el bloque de procedencia; se ignora.`); continue; }
    const clave = normalizarClave(m[1]!);
    const valor = leerValor(m[2]!);

    if ((CAMPOS_PROC.origen as readonly string[]).includes(clave)) {
      p.origin = valor;
      if (!ORIGENES.has(valor)) {
        avisar(nl, `«${valor}» no es un origen conocido.`, "Válidos: extracted, manual, api, ai_rephrased, ai_translated.");
      }
      continue;
    }
    if ((CAMPOS_PROC.fuente as readonly string[]).includes(clave)) { p.sourceId = valor === "" ? null : valor; continue; }
    if ((CAMPOS_PROC.pagina as readonly string[]).includes(clave)) {
      const num = Number(valor);
      if (valor === "" ) { p.evidencePage = null; continue; }
      if (!Number.isFinite(num)) { avisar(nl, `«${valor}» no es un número de página.`, "Usa un entero, p. ej. «pagina: 3»."); continue; }
      p.evidencePage = num;
      continue;
    }
    if ((CAMPOS_PROC.verificada as readonly string[]).includes(clave)) {
      const b = leerBooleano(valor);
      if (b === null) { avisar(nl, `«${valor}» no es sí ni no.`, "Escribe «verificada: si» o «verificada: no»."); continue; }
      p.evidenceVerified = b;
      continue;
    }
    if ((CAMPOS_PROC.evidencia as readonly string[]).includes(clave)) {
      evidencia = evidencia === null ? valor : `${evidencia}\n${valor}`;
      abierto = "evidencia";
      continue;
    }
    if ((CAMPOS_PROC.extra as readonly string[]).includes(clave)) {
      const eq = valor.indexOf("=");
      if (eq < 0) { avisar(nl, `«${valor}» no tiene la forma «clave = valor».`); continue; }
      const ck = valor.slice(0, eq).trim();
      const cv = valor.slice(eq + 1).trim();
      try {
        p.extras[ck] = JSON.parse(cv) as unknown;
      } catch {
        // Un extra ilegible NO se tira: entra como texto. Perder el valor por no
        // saber su tipo sería justo el fallo que este formato existe para evitar.
        p.extras[ck] = cv;
        avisar(nl, `el extra «${ck}» no es JSON válido; entra como texto.`);
      }
      continue;
    }
    avisar(nl, `«${m[1]}» no es un campo de procedencia; se ignora.`,
      "Campos válidos: origen, fuente, pagina, verificada, evidencia, extra.");
  }

  if (evidencia !== null) p.evidenceSnippet = evidencia;
  // Un bloque presente pero sin `verificada` es, por defecto, NO verificado:
  // decir «verificado» sin que nadie lo haya comprobado sería mentir.
  if (p.evidenceVerified === undefined) p.evidenceVerified = false;
  return p;
}

/* ── Ayudas de redacción de avisos ────────────────────────────────────────── */

/** El rótulo de un ### pasa por el mismo decodificador que los valores. */
function decodeRotulo(s: string): string {
  return leerValor(s);
}

function nombreLegible(kind: string): string {
  const n: Record<string, string> = {
    basics: "CONTACTO", summary: "RESUMEN", work: "EXPERIENCIA", skill: "HABILIDADES",
    education: "EDUCACION", project: "PROYECTOS", certification: "CERTIFICACIONES",
    language: "IDIOMAS", publication: "PUBLICACIONES", link: "ENLACES",
    reference: "REFERENCIAS", bullet: "una viñeta", otros: "OTROS",
  };
  return n[kind] ?? kind;
}

function sugerirCampos(kind: string): string | undefined {
  const campos = (
    {
      basics: "nombre, titular, email, telefono, ubicacion, enlace",
      summary: "texto",
      work: "puesto, empresa, ubicacion, fechas (o desde/hasta)",
      skill: "grupo, items, contexto — o directamente «Grupo: a, b, c»",
      education: "titulo, institucion, ubicacion, fechas",
      project: "nombre, descripcion, url, fechas",
      certification: "nombre, emisor, url, fechas",
      language: "idioma, nivel",
      publication: "nombre, descripcion, url, fechas",
      link: "etiqueta, url",
      reference: "nombre, cargo, organizacion, relacion, email, telefono",
    } as Record<string, string>
  )[kind];
  return campos ? `Campos de esta sección: ${campos}.` : undefined;
}
