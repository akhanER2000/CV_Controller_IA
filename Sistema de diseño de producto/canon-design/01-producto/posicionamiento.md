# Posicionamiento

## La tesis, en una frase

> **Un registro canónico de tu carrera. Todas las versiones son vistas de él, no copias.**

Todos los competidores —Teal, Rezi, Kickresume, Enhancv, Resume.io, y hasta el OSS ProfileStack—
hacen lo mismo: **duplicar y divergir.** N archivos que se desincronizan al primer mes. CANON tiene
lo que ninguno tiene: **una fuente de verdad.** El master es el registro; las variantes lo
*referencian*, no lo copian. Cambias tu cargo una vez y las 7 variantes se actualizan solas, salvo
donde hay un override explícito.

## Posicionamiento (una línea)

> **"El sistema de registro de tu carrera."** Un master profile canónico, alimentado por IA desde
> cualquier fuente, del que se derivan variantes **verificables — nunca inventadas** — y se exportan
> PDFs que el ATS lee **exactamente** como los ves.

## Los cuatro pilares (y su evidencia)

1. **Ingesta multimodal.** No escribes tu perfil: lo subes. PDF, DOCX, capturas de LinkedIn, URL de
   portfolio. *Nadie lo hace bien* (investigación §7, hueco #1).
2. **Anti-alucinación con trazabilidad.** La IA solo selecciona, reordena y reformula hechos del
   master; cada línea es trazable a su origen; nunca inventa. *El diferenciador defendible* (§7 #2).
3. **"Lo que ves es lo que el parser lee."** Mostramos el texto plano real extraído del PDF, lado a
   lado. *Solo OpenResume se acerca* (§7 #4).
4. **Sincronización master↔variantes.** "Actualizaste tu cargo; 4 de 7 variantes están obsoletas".
   *Nadie te lo dice* (§7 #5).

---

## Anti-producto — qué NO somos

- ❌ **No somos un "ATS score".** Ese número es humo: Workday, Greenhouse y Lever puntúan distinto y
  ninguno publica su fórmula. Mostramos **evidencia verificable**, no un índice.
- ❌ **Ningún número sin fuente, en ninguna parte de la UI.** Ni "62% de match", ni "el 60% de tus
  viñetas debería llevar cifra", ni "confianza: 87%". Si no podemos citar de dónde sale, no se
  muestra. Mostramos el **hecho**, no el índice.
- ❌ **No hacemos keyword stuffing.** Sube el match con la máquina y **hunde el CV con el humano**
  (Ladders). Riesgo asimétrico sin upside.
- ❌ **La IA no inventa experiencia. Nunca.** Precisión de la promesa: garantizamos que **la IA** no
  fabrica contenido — *no* que el usuario no pueda escribir lo que quiera en su master. El copy
  correcto es *"cada línea de tu CV apunta a algo que tú escribiste"*, no *"el producto te impide
  exagerar"*. Lo segundo sería mentira, y este producto se vende sobre no mentir.
- ❌ **No hay dark patterns de pricing.** La descarga del PDF es **siempre gratis** (ver abajo).
- ❌ **No hay gamificación**, ni rachas, ni badges, ni confetti. Esta gente no necesita un coach
  entusiasta: necesita una herramienta que respete su inteligencia.

---

## El nombre

**CANON** es el placeholder de trabajo (del griego *kanṓn*, la vara de medir; y "canónico" =
fuente de verdad). El repositorio es `CV_Controller_IA`. El wordmark está **parametrizado**: cambiar
el nombre no rompe nada (un token `--brand-name` y un componente `<Wordmark>`).

### Tres alternativas

1. **Corpus** — *"el cuerpo completo de tu obra".* El master **es** el corpus; cada variante, una
   lectura de él. Idéntico en ES y EN, voz editorial/académica, ata con Playfair. Es casi la tesis
   hecha nombre.
2. **Ledger** — *el libro mayor.* Registro canónico, contable, confiable: "el libro de tu carrera".
   Transmite precisión y trazabilidad, y es legible de inmediato para el público dev.
3. **Origen / Origin** — la promesa anti-alucinación en una palabra: cada línea tiene un origen
   trazable. Bilingüe, sereno, y nombra justo lo que nos separa de la competencia.

> Recomendación: **Corpus** si se prioriza la voz editorial; **Ledger** si se prioriza la señal de
> confianza para devs. CANON sigue siendo un buen default. Diseñar con `--brand-name` = "CANON".

---

## Precio y modelo de negocio

**La regla que lo ordena todo: se cobra la IA, no el documento.** La IA cuesta dinero real por
llamada; el PDF no cuesta nada. Cobrar por la descarga es *el* dark pattern del sector (resume.io
bloquea el PDF tras el paywall) y es exactamente lo que prometimos no ser.

> **Nota:** los importes son **placeholders** (`[PRECIO]`), aún no decididos. La **estructura** sí
> está fija.

| Plan | Precio | Incluye |
|---|---|---|
| **Gratis, para siempre, sin tarjeta** | **$0** | Master profile completo · variantes ilimitadas · descarga de PDF y `resume.json` ilimitada · chequeo de salud · vista "Cómo lo lee el ATS". **Todo lo que no llama a un LLM.** |
| **Pro** | **`[PRECIO]`/mes** | Ingesta con IA (archivos, capturas, URL) y tailoring contra el aviso |
| **BYOK** | **gratis o casi** | Trae tu propia API key y usa la IA sin plan. Feature de confianza; encaja con la tesis |

### El bloque de promesa en la landing (no letra chica)

Decirlo explícito, grande, porque es ventaja competitiva real y el sector está podrido:

> **Sin trial que se auto-renueva. Sin descarga bloqueada. Cancelas en un clic.**

Diséñalo para que se lea como una **promesa**, no como términos y condiciones.

---

## "¿Por qué esto no es otro Rezi?" (respuesta explícita, criterio de aceptación §7)

Rezi (y Jobscan, y Teal) te venden un **número**: un "ATS score" que optimizas hasta hacer keyword
stuffing, con IA que **inventa** viñetas y plantillas de dos columnas que **rompen** el parseo.

CANON hace lo contrario en los tres ejes:

1. **Evidencia, no score.** Te mostramos el texto que el parser realmente extrae y las keywords del
   aviso que te faltan — separadas entre "lo tienes en el master" y "no lo tienes en ninguna parte".
   Nunca un porcentaje inventado.
2. **Trazabilidad, no generación.** La IA no escribe experiencia: selecciona, ordena y reformula lo
   que tú registraste, y cada línea apunta a su origen. Lo no trazable se marca en rojo.
3. **Una fuente de verdad, no cinco archivos.** El master es canónico; las variantes son vistas
   sincronizadas.

Y encima: **la descarga siempre es gratis.** Rezi te cobra por bajar tu propio CV. Nosotros no.
