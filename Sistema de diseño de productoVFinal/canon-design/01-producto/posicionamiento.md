# Posicionamiento

## La tesis, en una frase

> **Un registro canónico de tu carrera. Todas las versiones son vistas de él, no copias.**

Todos los competidores —Teal, Rezi, Kickresume, Enhancv, Resume.io, y hasta el OSS ProfileStack—
hacen lo mismo: **duplicar y divergir.** N archivos que se desincronizan al primer mes. Corpus tiene
lo que ninguno tiene: **una fuente de verdad.** El master es el registro; las variantes lo
*referencian*, no lo copian. Cambias tu cargo una vez y las 7 variantes se actualizan solas, salvo
donde hay un override explícito.

## Posicionamiento (una línea)

> **"El sistema de registro de tu carrera."** Un master profile canónico, alimentado por IA desde
> cualquier fuente, del que se derivan variantes **verificables — nunca inventadas** — y se exportan
> PDFs que el ATS lee **exactamente** como los ves.

## Los pilares (y su evidencia)

1. **Ingesta por fuentes, ordenadas por verificabilidad.** No escribes tu perfil: conectas tus
   fuentes. Y **las fuentes no valen lo mismo** — la jerarquía *es* la tesis, y se ve en la UI:
   **GitHub** (API oficial, OAuth) y **tu portfolio** (primera parte, estructura propia) son
   **dato duro ★★★★★**; LinkedIn (capturas/PDF) y el CV viejo son ★★★☆☆ y pasan por revisión.
2. **Anti-alucinación con trazabilidad.** La IA solo selecciona, reordena y reformula hechos del
   master; cada línea es trazable a su origen; nunca inventa. *El diferenciador defendible* (§7 #2).
   Y ahora con un argumento nuevo y mejor (§ siguiente).
3. **"Lo que ves es lo que el parser lee."** Mostramos el texto plano real extraído del PDF, lado a
   lado. *Solo OpenResume se acerca* (§7 #4).
4. **Skills con evidencia.** La skill "Go" no es una afirmación: es *3 repos · 412 KB · usada en 2
   viñetas*. Resuelve el problema más difícil del CV técnico (el 32% declara skills que no tiene) y
   sale casi gratis con la API de GitHub. *Nadie en el mercado lo tiene.*
5. **Sincronización master↔variantes.** "Actualizaste tu cargo; 4 de 7 variantes están obsoletas".
   *Nadie te lo dice* (§7 #5).

## El mejor argumento, y llegó tarde: la alucinación estructuralmente imposible

Hasta ahora "la IA no inventa" era una **promesa de proceso** (la IA solo toca hechos del master).
GitHub y el portfolio la vuelven una **imposibilidad estructural**: son fuentes donde **no hay IA en
la extracción**. Si el repo dice `Go: 412.803 bytes`, es un hecho de una API con esquema, no una
extracción que se pueda alucinar. Son las **primeras fuentes del producto donde inventar es
imposible por construcción, no por política.** Es el mejor argumento que tenemos — dilo fuerte.

> Matiz honesto que también va en la UI: un CV **no es** un volcado de GitHub. La mayoría de los
> repos son forks, tutoriales y dotfiles. El usuario elige qué repos son proyectos reales; el
> producto **propone** un default sensato (no-fork, con descripción, commits propios, actividad
> reciente) y lo muestra **revisable, nunca automático**.

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

**Corpus** es el nombre elegido (antes el placeholder era "CANON"). Significa *"el cuerpo completo
de tu obra"*: el master **es** el corpus; cada variante, una lectura de él. Es casi la tesis hecha
nombre — idéntico en ES y EN, voz editorial/académica, ata con Playfair. El repositorio sigue
siendo `CV_Controller_IA`. El wordmark está **parametrizado**: cambiar el nombre no rompe nada (un
token `--brand-name` y un componente `<Wordmark>`).

### Alternativas que quedan disponibles

1. **Ledger** — *el libro mayor.* Registro canónico, contable, confiable: "el libro de tu carrera".
   Transmite precisión y trazabilidad, y es legible de inmediato para el público dev.
2. **Origen / Origin** — la promesa anti-alucinación en una palabra: cada línea tiene un origen
   trazable. Bilingüe, sereno, y nombra justo lo que nos separa de la competencia.
3. **CANON** — el placeholder original (del griego *kanṓn*, la vara de medir; "canónico" = fuente de
   verdad). Buen default genérico, pero menos ligado al CV que Corpus.

> Elegido: **Corpus** — la voz editorial y el significado ("tu obra completa") son los más adecuados
> para un producto de CV. Diseñar con `--brand-name` = "Corpus"; **Ledger** queda como plan B si se
> prioriza la señal de confianza para devs.

---

## Precio y modelo de negocio

**La regla que lo ordena todo: se cobra la IA, no el documento.** La IA cuesta dinero real por
llamada; el PDF no cuesta nada. Cobrar por la descarga es *el* dark pattern del sector (resume.io
bloquea el PDF tras el paywall) y es exactamente lo que prometimos no ser.

> **Nota:** los importes son **placeholders** (`[PRECIO]`), aún no decididos. La **estructura** sí
> está fija. **No hay página pública de precios** (§B: no hay landing de marketing) — el modelo vive
> **in-app**, en el flujo de upgrade y en Ajustes.

Consecuencia directa de la regla, y nueva con §C: **conectar GitHub y el portfolio es gratis**,
porque son API/estructura y **no llaman a un LLM**. Solo se cobra lo que consume el modelo.

| Plan | Precio | Incluye |
|---|---|---|
| **Gratis, para siempre, sin tarjeta** | **$0** | Master profile completo · **conectar GitHub y portfolio** · variantes ilimitadas · descarga de PDF y `resume.json` ilimitada · chequeo de salud · vista "Cómo lo lee el ATS". **Todo lo que no llama a un LLM.** |
| **Pro** | **`[PRECIO]`/mes** | Ingesta con IA (LinkedIn por captura/PDF, CV viejo, otras capturas) y tailoring contra el aviso |
| **BYOK** | **gratis o casi** | Trae tu propia API key y usa la IA sin plan. Feature de confianza; encaja con la tesis |

### El bloque de promesa (en el onboarding y el upgrade in-app, no en una landing)

Decirlo explícito, grande, porque es ventaja competitiva real y el sector está podrido:

> **Sin trial que se auto-renueva. Sin descarga bloqueada. Cancelas en un clic.**

Diséñalo para que se lea como una **promesa**, no como términos y condiciones.

---

## "¿Por qué esto no es otro Rezi?" (respuesta explícita, criterio de aceptación §7)

Rezi (y Jobscan, y Teal) te venden un **número**: un "ATS score" que optimizas hasta hacer keyword
stuffing, con IA que **inventa** viñetas y plantillas de dos columnas que **rompen** el parseo.

Corpus hace lo contrario en los tres ejes:

1. **Evidencia, no score.** Te mostramos el texto que el parser realmente extrae y las keywords del
   aviso que te faltan — separadas entre "lo tienes en el master" y "no lo tienes en ninguna parte".
   Nunca un porcentaje inventado.
2. **Trazabilidad, no generación.** La IA no escribe experiencia: selecciona, ordena y reformula lo
   que tú registraste, y cada línea apunta a su origen. Lo no trazable se marca en rojo.
3. **Una fuente de verdad, no cinco archivos.** El master es canónico; las variantes son vistas
   sincronizadas.

Y encima: **la descarga siempre es gratis.** Rezi te cobra por bajar tu propio CV. Nosotros no.
