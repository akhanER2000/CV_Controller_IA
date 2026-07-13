# PROMPT 03 — CONTINUACIÓN DEL DISEÑO
## Milestone 2: componentes + pantallas + handoff
## Para: la MISMA sesión de Claude Design (Opus 4.8) que entregó `canon-design/`

---

Revisé la entrega "Fundación + documento". El sistema es sólido y el documento CV está bien
resuelto: el híbrido "un solo gesto" está bien argumentado, la spec es ejecutable, y el golden file
es **real** (verifiqué las 41 líneas de `cv-texto-plano.txt` contra el HTML: coinciden).

Antes de que sigas: **tres correcciones** y **un cambio de producto**. El cambio no es cosmético —
altera qué pantallas hay que diseñar, así que léelo antes de tocar nada.

---

# A · Tres correcciones a lo entregado

## A1 · ⚠️ La verificación del mono en las cifras es vacua. Retírala.

`decision-tipografica.md` y `00-README.md` (decisión 3) afirman que el riesgo de *runs* de fuente
está **"probado y superado"**, y lo sustentan en que las cifras salen limpias en
`cv-texto-plano.txt`.

**Ese texto se extrajo del HTML.** En HTML **no existen los runs de fuente**: es un fenómeno del
content stream de un PDF. El método usado **no puede detectar el modo de fallo que dice haber
descartado.** El riesgo sigue exactamente igual de abierto que antes de la prueba.

Fuiste honesto al dejar el contrato de CI ("si `react-pdf` rompe un run, se actualiza la técnica").
Eso está bien. **El problema es el titular**, que afirma más de lo que se hizo — en el paquete de
diseño de un producto cuya tesis entera es *no afirmar nada que no se pueda demostrar*.

**Corrige así:**
- Reemplaza *"probado y superado"* por: **"pendiente de verificación real: solo se puede probar
  contra el PDF de `@react-pdf/renderer`, en CI (Fase 1 de ingeniería)."**
- Mantén las 4 reglas duras (espacio normal antes/después del run, `letter-spacing: 0`, no partir
  palabras a través del límite de fuente, bullet como marcador CSS) — son correctas y son la
  mitigación.
- Añade en `ESPECIFICACION.md` el **plan B explícito**, para que ingeniería no tenga que decidirlo
  sola a las 2 AM: *si el run mono se rompe en el PDF real, la cifra vuelve a Geist con `font-weight
  600` y se pierde el mono en el documento (se conserva en la app).* Un fallback escrito es un
  regalo; uno improvisado es un bug.

## A2 · `index.html` es el índice del paquete, no una landing

Aclaración, porque generó confusión: lo que entregaste como `index.html` **es el índice de
navegación del sistema de diseño** — y como tal está bien. La landing del producto **no existe
todavía**. No hace falta que la defiendas.

**Y ya no hace falta que la diseñes.** Ver §B.

## A3 · El fixture no habla el mismo idioma que el modelo interno

`datos-ejemplo.json` usa `confidence: "high" | "medium" | "low"` y `provenanceMethods:
["extracted","handwritten","ai-reworded"]`. El modelo de datos de ingeniería usa otros nombres, y
—más importante— **prohíbe el `confidence` auto-reportado por el LLM** (un número que el modelo se
inventa sobre sí mismo es el mismo pecado que el "ATS score" que condenamos).

**No cambies el concepto de tres niveles: es correcto y la UI lo necesita.** Cambia de dónde sale:

| Nivel | Ya no significa | Significa |
|---|---|---|
| `verified` | "el LLM dice 87%" | El `evidence_snippet` **aparece literal** en el texto fuente |
| `partial` | — | Coincidencia difusa (el snippet no calza exacto) |
| `unverified` | — | Sin evidencia rastreable → **la UI lo señala** |

Y renombra `provenanceMethods` a los valores del modelo: `extracted` · `manual` · `ai_rephrased` ·
`ai_translated` · **`api`** (nuevo, ver §C).

---

# B · El cambio de producto: **la app abre en un dashboard, no en una landing**

Decisión tomada. **Elimina del alcance la landing de marketing**, la página pública de precios y la
demo pregrabada. Ese esfuerzo se va entero a la herramienta.

**Por qué es la decisión correcta, y no solo un ahorro:** una landing de SaaS genérica no es lo que
hace bueno a este producto — es lo que hace que **parezca** un producto. Y la referencia de la que
partimos (ProfileStack) no tiene landing: tiene una herramienta que se abre y funciona. Lo que
diferencia a CANON está **dentro**: la procedencia, el golden file, el "cómo lo lee el ATS". Ninguna
de esas cosas se vende con un hero.

**Lo que sí necesitas diseñar en su lugar:**

## B1 · `/app` — el dashboard. La primera pantalla real del producto.

Al entrar, el usuario ve **el estado de su carrera**, no un saludo. Es un panel de control, y debe
responder de un vistazo:

- **Mis variantes.** Cuáles hay, para qué rol cada una, cuál se tocó por última vez, **cuáles están
  desactualizadas** respecto al master. Descargar el PDF desde aquí, sin entrar.
- **Salud del master.** Qué le falta al registro canónico: roles sin fechas, viñetas sin cifra,
  skills sin evidencia. **Sin score.** Cosas concretas, accionables, enlazables.
- **Fuentes conectadas.** GitHub, portfolio, LinkedIn, archivos (ver §C). Cuándo se sincronizó cada
  una, qué aportó, **qué hay nuevo desde la última vez**.
- **Acciones de arranque**, según el estado:
  - Master vacío → las **dos puertas** (§B2), grandes, con igual peso visual.
  - Master poblado → "crear variante", "adaptar a un aviso", "revisar N items pendientes".

**Diseña los dos extremos:** el dashboard **vacío** (día 1, sin nada) y el **denso** (200 items, 7
variantes, 4 fuentes). Ambos tienen que verse bien, y el vacío no puede ser deprimente ni una
fanfarria.

## B2 · Las dos puertas de entrada — y las dos son de primera clase

Hasta ahora el producto asumía "no escribas tu perfil, súbelo". **Eso era demasiado estrecho.** Hay
gente que no tiene un CV viejo, que no quiere subir nada, o que sencillamente prefiere escribir. Y
hay gente que quiere que la IA lo haga. **Las dos son legítimas y ninguna es el camino de segunda.**

| Puerta | Qué es |
|---|---|
| **A · Desde cero, o desde una plantilla de perfil** | Empiezas con un master vacío, o partiendo de un **perfil de arranque** (backend, frontend, data/IA, diseño, producto, QA, DevOps, investigación) que **precarga la estructura y las secciones esperadas** — no el contenido. Escribes tú. La IA está **disponible pero apagada**. |
| **B · Con IA, desde tus fuentes** | Conectas GitHub, tu portfolio, subes tu LinkedIn y tu CV viejo. La IA extrae. Tú confirmas en staging. |

**Diseña ambas, y diséñalas simétricas.** El `origin: 'manual'` no es un ciudadano de segunda: **es
el más verificable de todos** (lo escribió el humano).

> **Cuidado con las "plantillas de perfil".** No son plantillas de CV (eso ya está resuelto: hay una
> plantilla ATS y punto). Son **andamios de estructura**: qué secciones espera un rol backend, qué
> tipo de evidencia pide un perfil de investigación (publicaciones, no métricas de negocio), qué
> mide un perfil de diseño. **Nunca contenido de ejemplo que el usuario pueda dejar puesto sin
> darse cuenta.** Eso sería inventar experiencia por la puerta de atrás.

## B3 · La IA es opcional, en todas partes

Corolario del punto anterior: **ninguna función core puede exigir una llamada al LLM.** Crear el
master, editar, componer variantes, exportar el PDF, ver "cómo lo lee el ATS" y el chequeo de salud
**funcionan sin IA**. La IA acelera la entrada de datos y sugiere adaptaciones. Nada más.

Diseña el **toggle global de IA** (on/off) y cómo se ve cada pantalla con la IA apagada. No es un
modo degradado: es un modo legítimo.

---

# C · Fuentes de ingesta: el cambio más importante

El producto ya no ingiere "archivos". Ingiere **fuentes**, y las fuentes **no valen lo mismo**.
Ordénalas por verificabilidad, porque esa jerarquía **es** la tesis del producto y debe verse en la
UI:

| # | Fuente | Cómo | Verificabilidad |
|---|---|---|---|
| **1** | **GitHub** | **API oficial**, con OAuth. Repos, lenguajes (con bytes reales), descripciones, READMEs, estrellas, forks, contribuciones, releases, topics. | ★★★★★ **Dato duro. La IA no interviene en la extracción — es una API.** No hay nada que alucinar. |
| **2** | **Mi portfolio** | **Fuente de primera parte.** El portfolio del usuario ya es un Next.js con `content/projects.json`, una BD en Supabase y rutas `/proyectos`, `/experiencia`, `/investigacion`, `/perfil`, e incluso una `/api/github`. **No hay que scrapearlo: se lee su propia estructura.** | ★★★★★ Datos propios, estructurados. |
| **3** | **LinkedIn** | **Capturas de pantalla** o el **PDF de exportación** que LinkedIn permite descargar (*"Guardar como PDF"* del perfil, o *"Obtener una copia de tus datos"*). Transcripción verbatim → extracción. | ★★★☆☆ El LLM sí interviene. Necesita staging y verificación de evidencia. |
| **4** | **CV viejo / DOCX / otras capturas** | Como estaba. | ★★★☆☆ Igual. |

## C1 · GitHub cambia el producto, no solo lo amplía

Merece que lo pienses en serio, porque es la mejor fuente que vas a tener:

- **Es la única fuente donde la IA no puede alucinar, porque no hay IA.** Es una API con esquema. Si
  el repo dice `Go: 412.803 bytes`, eso es un hecho, no una extracción.
- **Resuelve el problema más difícil del CV técnico: las skills sin evidencia.** El 32% de los
  candidatos admite declarar skills que no tiene, y los reclutadores lo están cazando. Con GitHub, la
  skill "Go" no es una afirmación: **es un enlace a 12 repos y 400 KB de código.**
- Y encaja con el chequeo de salud que ya existe: *"declaras Kubernetes, pero no aparece en ninguna
  viñeta, ni en tu portfolio, ni en tus repos. ¿Dónde lo usaste?"*

**Diseña la tarjeta de skill con evidencia.** Una skill del master debería poder mostrar de dónde
sale: `Go` → *3 repos · 412 KB · usada en 2 viñetas de experiencia*. Ese es el componente que
ninguna herramienta del mercado tiene, y sale casi gratis con la API.

> ⚠️ **Y el freno correspondiente.** Un CV **no es** un volcado de GitHub. La mayoría de los repos
> de cualquiera son forks, tutoriales, código muerto y `dotfiles`. **Diseña el filtro como parte de
> la experiencia, no como un ajuste escondido:** el usuario elige qué repos son proyectos reales.
> Propón un default sensato (no-fork, con descripción, con commits propios, con actividad reciente)
> y **muéstralo como propuesta revisable, nunca como selección automática.** Los repos de un
> estudiante de último año son señal frágil: trátalos con cuidado, no los infles.

## C2 · La sección "Fuentes" pasa a ser una pantalla central

Deja de ser un historial de subidas. Es un **panel de conexiones vivas**:

- GitHub: conectado como `@usuario` · sincronizado hace 2 días · 14 repos considerados, 4 en el
  master · **3 repos nuevos desde la última vez**.
- Portfolio: `mi-sitio.cl` · 8 proyectos · 2 con contenido actualizado.
- LinkedIn: 3 capturas · última hace 4 meses · *"tu LinkedIn puede estar desactualizado"*.
- CV_2023.pdf · procesado · 41 items, 38 aceptados.

Con **resincronización**, y con el mismo respeto de siempre: **lo nuevo va a staging, no al master.**
Ni siquiera lo que viene de una API — porque aunque el dato sea duro, **la decisión de si va en tu CV
es del humano.**

---

# D · Qué diseñar ahora (alcance de esta milestone)

## `03-componentes/`
Lo que ya pedía el brief original (formularios, tarjeta de procedencia, niveles de confianza,
estados de IA, hairline de estados, densidad) **más**:

- **Tarjeta de skill con evidencia** (§C1) — el componente nuevo más importante.
- **Tarjeta de fuente conectada** (con estado de sync y "hay novedades").
- **Selector de repos de GitHub** (con el default propuesto y revisable).
- **Toggle global de IA** (on/off) y el aspecto de una pantalla con la IA apagada.

## `04-pantallas/` — a 1440 / 1024 / 390, con estados vacío / cargando / con datos / error

1. **`/app` — Dashboard** ★ *la nueva pantalla principal. Diseña el vacío Y el denso.*
2. **Onboarding — las dos puertas** (§B2), simétricas.
3. **Conectar fuentes** (GitHub OAuth, portfolio, LinkedIn, archivos) + **selector de repos**.
4. **Staging / revisión** — como estaba, más **el caso "viene de una API"** (dato duro, revisión más
   ligera: no hay evidencia que verificar, pero sí decisión humana de incluirlo).
5. **Master profile** — con la **skill con evidencia**.
6. **Editor de variante** (3 paneles) — sin cambios respecto al brief original. **Sigue siendo la
   pantalla más importante del producto.**
7. **Tailoring**.
8. **Chequeo de salud** — ahora puede cruzar skills declaradas contra evidencia de GitHub/portfolio.
   *Solo lo que puede fallar. Nada de seis ✓ perpetuos.*
9. **Ajustes** (cuenta, idioma, tema, IA on/off, BYOK, exportar todo, borrar todo).

**Login/signup:** mínimo y funcional. Email + Google. **Y ahora también GitHub OAuth** — que aquí sí
tiene sentido, porque a diferencia de LinkedIn, **la API de GitHub sí entrega lo que promete.** Esa
asimetría es honesta y merece existir.

## `06-handoff/`
`handoff.md` · `copy.md` (**todo el copy, ES + EN** — incluido el de las fuentes, los repos y el
estado vacío del dashboard) · `criterios-aceptacion.md` (**solo criterios de diseño**: visual, copy,
interacción, a11y. Los técnicos son de ingeniería).

---

# E · Lo que NO cambia

- El documento CV y su golden file: **quedan como están** (salvo la corrección A1).
- La tipografía híbrida "un solo gesto": **bien elegida, bien argumentada. Se mantiene.**
- El sistema Oro · Obsidiana · Porcelana.
- **La app es bellísima. El documento es sobrio.**
- **La IA nunca inventa.** GitHub y el portfolio **refuerzan** esta tesis: son las primeras fuentes
  del producto donde la alucinación es **estructuralmente imposible**. Dilo en el posicionamiento —
  es el mejor argumento que tenemos y llegó tarde.
- **Ningún número sin fuente en la UI.**
- **Diseña para la dignidad.**

---

> Una última cosa sobre el cambio de la landing al dashboard. No es un recorte: es reconocer qué
> clase de producto es este. Nadie va a elegir CANON por un hero bonito. Lo va a elegir porque abre,
> le muestra que tres de sus variantes están desactualizadas, y se lo arregla en dos clics.
>
> **La herramienta es el argumento de venta.** Diséñala como tal.
