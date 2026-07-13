# Auditoría V3 — Corpus (working name CANON)

**Repositorio:** CV_Controller_IA · **Raíz de build:** `Sistema de diseño de productoV3/canon-design`
**Fecha:** 2026-07-13 · **Alcance:** build V3 completo, cinco dimensiones (movimiento, color/tokens, pantallas, handoff/copy, adopción de referencia)
**Base:** auditoría file-by-file con seis agentes + revisor adversarial (fuente: `tasks/wjol0exj2.output`)

---

## 1. Resumen ejecutivo

- **Los colores SÍ se respetan.** La escala oro, el tema obsidiana y el tema porcelana existen con hex idénticos entre `tokens.css` y `tokens.json`; la aurora WebGL renderiza los tres metales (oro `#D4AF37` = `gold-500` al byte, cobre `#B87333`, plata `#ADB6C2`) sobre obsidiana, **no** los acentos esmeralda/amatista/carmesí de la referencia. La disciplina "un solo oro" se sostiene en la UI. El problema **nunca fue el color.**

- **El problema real son tres:** (a) **pantallas ausentes** — solo existen 2 de 11 (`dashboard` + `editor-variante`); (b) **kit dormido** — el motion kit es de nivel excelente pero la mayoría de sus clases no se aplican a ningún DOM real, la aurora no monta en ninguna pantalla, y las dos ceremonias insignia (stagger "el momento estelar", el shimmer único) nunca se disparan; (c) **validación que contaba definiciones, no uso** — los gates del prompt-06 (`grep -c "@keyframes"`, `grep -l "c-aurora-gl"`) pasan con una pantalla 100% estática porque miden presencia de reglas CSS/JS, no aplicación en el `class=` del body.

- **La fundación es de primer nivel** y está lista para construir encima: `tokens.css/json`, `canon-motion.css/js` (11 keyframes a doctrina, `prefers-reduced-motion` completo por patrón), `canon-aurora.css/js` (shader fBm de humo metálico), `motion.md` (doctrina de 4 niveles de ceremonia), `copy.md` (bilingüe ES+EN, 14 secciones, sin patrones prohibidos) y el par golden `datos-ejemplo.json ⇄ cv-texto-plano.txt` con `ESPECIFICACION.md`. Nada de esto hay que rehacerlo.

- **La única ceremonia sustantiva implementada** es el toggle rayos-X "Cómo lo lee el ATS ⇄ PDF" en `editor-variante.html` — cableado sobre DOM real, funciona al click, y traduce el blur-in de la referencia en la metáfora que define el producto. Es el modelo de cómo debería estar el resto.

- **Faltan entregables obligatorios de handoff:** `handoff.md` y `criterios-aceptacion.md` no existen en todo el árbol; `06-handoff/` contiene solo `copy.md` (1 de 3). Sin criterios de aceptación escritos no hay nada contra lo cual firmar el build. Además, `index.html` no enlaza ninguna de las 2 pantallas construidas: son indescubribles desde el índice del paquete.

---

## 2. Tabla de severidad por dimensión

| Dimensión | Severidad | Veredicto de una línea |
|---|---|---|
| **Pantallas (completitud)** | 🔴 **Bloqueante** | 2 de 11 pantallas; 0 breakpoints 1024/390; sin artboards de loading/error. |
| **Movimiento / animación** | 🟠 **Mayor** | Kit excelente pero dormido: la mayoría del kit no toca DOM real; aurora no monta; stagger y shimmer nunca disparan. |
| **Handoff / copy** | 🟠 **Mayor** | `copy.md` excelente, pero faltan `handoff.md` y `criterios-aceptacion.md`; contradicción interna en `masterHealth`. |
| **Color / tokens** | 🟢 **Menor** | Identidad respetada; solo drift de `--danger`, colores linguist de GitHub filtrados, `#050508` sin tokenizar. |
| **Adopción de referencia** | 🟢 **Menor** | 2 técnicas adoptadas, 1 a medias, 4 ausentes — casi todas rechazos deliberados y documentados. |

---

## 3. Detalle por dimensión

### 3.1 Pantallas (completitud) — 🔴 Bloqueante

**Construido**
- `04-pantallas/dashboard.html` (66 KB, 1210 líneas): dos artboards de estado — "con datos (denso) · 1440" (línea 588) y "vacío / día 1 · 1440" (línea 661). Estados empty + data cubiertos, **pero solo a 1440**.
- `04-pantallas/editor-variante.html` (68 KB, 1262 líneas): editor de 3 paneles, un solo artboard "Editor de variante · 3 paneles · 1440" (línea 610). Solo estado data, solo 1440.
- Ambas cablean el sistema real: aurora (referencias `aurora.mount`), motion tokens, un solo acento oro, `prefers-reduced-motion`, el shimmer con guardia `console.warn` y el skeleton oro como CSS utilitario.
- Fundación de producto completa: `01-producto/posicionamiento.md` (8.3 KB) y `01-producto/principios.md` (4.3 KB, 9 principios con fuente).

**Dormido**
- `c-skeleton` / `c-shimmer` existen como CSS utilitario pero **ninguna pantalla los instancia** como artboard de carga.

**Faltante**
- **9 pantallas ausentes, sin archivo:** `auth` (decisión #6, Email+Google+GitHub), `onboarding` (dos puertas simétricas, decisión #8), `ingesta`/wait (principio 7 "la espera de la IA se diseña" — central a la tesis), `staging` (zona de revisión/confirmación, núcleo anti-alucinación), `master` (el registro canónico), `fuentes` (conectores incl. GitHub/portfolio), `tailoring` (keywords faltantes), `salud` (chequeo con reglas citadas, no %), `ajustes` (pricing/upgrade).
- **Breakpoints 1024 y 390: 0%** en todo el build. Las únicas `@media` en ambos archivos son `prefers-reduced-motion`; cada artboard es un frame fijo `width:1440px` / `height:900-928px`.
- **Artboard de loading: ausente.** **Artboard de error: ausente** ("error" solo aparece en `console.error()` del logging del shader).

**Defectos**
- **Pantallas huérfanas:** `index.html` no enlaza `dashboard.html` ni `editor-variante.html`; su catálogo marca "Pantallas de app · siguiente" como pendiente (líneas 81-82). El strip de estado contradice lo que hay en disco.
- **No responsive por construcción:** frames fijos 1440×900/928 (`dashboard.html:26`, `editor-variante.html:29`). No hay layout fluido ni ruta de media-query hacia 1024/390 → agregar breakpoints es reconstruir, no extender.
- **Asimetría de estados:** dashboard cubre empty+data; editor solo data. Ninguna cubre loading ni error → la matriz requerida (empty/loading/data/error) llega como máximo a 2/4 en la mejor pantalla.

---

### 3.2 Movimiento / animación — 🟠 Mayor

**Construido**
- `canon-motion.css`: 11 `@keyframes` a especificación (`c-glow-in`, `c-confirm`, `c-dismiss`, `c-divider-draw`, `c-rise`, `c-shimmer`, `c-panel-in`, `c-breathe`, `c-skeleton`, `c-pending`, `c-drift`); solo se animan transform/opacity/filter, por doctrina.
- `canon-motion.js`: motor vanilla completo — IntersectionObserver `dividerDraw` con guardia `Set()` una-vez-por-sesión, `CANON.stagger()/shimmer()/countTo()/confirm()/dismiss()`, `announce()` con aria-live, scroll-reveal `.c-doc`; guardia `matchMedia(REDUCED)` en todo.
- `prefers-reduced-motion`: degradación completa por patrón en `canon-motion.css` (§reduce, líneas 293-316) con tabla de equivalencias en `motion.md` — cada animación pierde movimiento sin perder información.
- **★ La única ceremonia sustantiva implementada:** el blur-in C3 en `editor-variante.html:706` — `.c-xray[data-mode]` con capas `.c-xray__doc` + `.c-xray__raw` y botón `data-xray-toggle`, cableado sobre DOM real, dispara al click.
- `motion.md`: doctrina rigurosa de 4 niveles de ceremonia con equivalencias reduced-motion y 6 reglas duras.

**Dormido** (definido-pero-sin-uso, el problema central de esta dimensión)
- `CANON.stagger()` y `CANON.shimmer()` están definidas pero **nunca se invocan** en ninguna pantalla (los únicos hits son los comentarios `Uso:` en el JS). `.c-stagger` / `.c-stagger-item` no aparecen en ningún DOM real.
- **La aurora WebGL está muerta en ambas pantallas:** `mount()` busca `.c-aurora-gl`, que no está en el markup de ningún body → monta cero canvas pese a correr en `DOMContentLoaded`.
- `dashboard.html` aplica casi nada del kit al DOM real: `c-divider`, `c-xray`, `c-stagger`, `c-shimmer`, `c-skeleton`, `c-thinking`, `c-hairline`, `c-panel-in`, `c-rise`, `c-override`, `c-unverified` están todas definidas-pero-sin-usar.
- Los IntersectionObserver de ambas pantallas observan cero targets (no existen `.c-divider` ni `.c-doc .c-reveal` en DOM real).
- Movimiento de estado-IA (`c-thinking` breathe, `c-skeleton` sweep): nunca cableado a DOM.

**Faltante**
- **No existe pantalla ingesta / staging / loading** que hospede las ceremonias insignia → C2 stagger "el momento estelar", C4 "el único shimmer" y C7 aurora no tienen host y nunca disparan. Esto es consecuencia directa del bloqueante de pantallas.
- Coreografía de entrada de la referencia (`wordReveal`, `charReveal`, ceremonia de loading con `ringDraw`/`horizonDraw`/`particleRise`/`glowPulse`/`letterReveal`, `sparkFloat`): 0 hits en todo el árbol — **rechazo deliberado y documentado** en `motion.md` y `ANALISIS-REFERENCIA.md` ("matamos la landing"), no un olvido accidental.

**Defectos**
- `editor-variante.html:79`: el `.msec>h4::after` `dividerDraw` local corre en **cada carga** sin guardia una-vez-por-sesión ni gate de viewport → contradice directamente `motion.md` C1 ("nunca dos veces en la misma sesión"). La pantalla envía **dos sistemas paralelos de divider**: el `dividerDraw` local que sí dispara y el canon `c-divider-draw` que nunca se aplica.
- `editor-variante.html:146-147`: `@keyframes pulse` + `.pulse` legacy definidos pero `.pulse` no se aplica a ningún elemento → regla muerta. Los 13 keyframes del archivo = 11 canon + 2 legacy (`dividerDraw`, `pulse`).
- `dashboard.html` y `editor-variante.html` **inlinean el shader WebGL2 completo (~130 líneas c/u)** que nunca puede activarse porque no hay host `.c-aurora-gl` → payload muerto en cada pantalla.
- `componentes.html:172`: reduced-motion es un `*{animation:none!important;transition:none!important}` general en vez de la degradación por patrón que el sistema exige — inconsistente con la doctrina.

---

### 3.3 Handoff / copy — 🟠 Mayor

**Construido**
- `06-handoff/copy.md`: completo, cada fila con ES y EN, 14 secciones cubriendo toda la superficie de la app (auth, onboarding, ingesta, staging, master, editor, tailoring, salud, fuentes, ajustes, dashboard, errores/empty, micro-copy de confianza).
- Evita patrones prohibidos: sin porcentaje/score inventado del CV, sin gamificación, sin tono coach, ninguna palabra baneada. Los únicos % son investigación de terceros **citada** (`hlth.nometric.src` "Jobscan 2025: 58,2%"; `hlth.skill.src` "GitHub 2025: 32%") o la métrica real del usuario (99,95% uptime) — evidencia, no score.
- Par golden presente y realista: `datos-ejemplo.json` (canon.profile/v0, con provenance, evidenceLevels, variants, datos del selector de repos GitHub, `masterHealth`) ↔ `cv-texto-plano.txt`. Persona: Matías Fuentes Aguilar, backend senior chileno; métricas plausibles (p99 850→180 ms, 320 stars).
- El par golden es internamente consistente en contenido/orden: `cv-texto-plano.txt` reproduce exacto la variante `isGoldenSource` `var-backend-2p-es` (título, orden de secciones, viñetas, encabezados en mayúsculas) — coincide con el método de extracción de `ESPECIFICACION.md` §7.
- `ESPECIFICACION.md` es de grado handoff: valores pt/mm exactos, contrato react-pdf, contrato de golden-diff en CI (§7), Plan B para el riesgo de mono-run (§5), atribución honesta de fuentes por regla (§8).

**Faltante**
- **`06-handoff/handoff.md`: ausente** en todo el árbol. Requerido por prompt-06; no hay documento de entrada de ingeniería que ate tokens, motion kit, pantallas, `copy.md` y la spec del documento.
- **`06-handoff/criterios-aceptacion.md`: ausente** en todo el árbol. No hay definición-de-hecho escrita → nada contra lo cual firmar el build.
- `06-handoff/` contiene **solo `copy.md`** (1 de los 3 archivos que pide el prompt-06).

**Defectos**
- `datos-ejemplo.json` — **contradicción interna en `masterHealth`:** `h-nometric` (líneas ~998-1010) afirma "3 viñetas sin ninguna cifra" y referencia `w-fintual-b5`, `sk-practices`, `pr-conc-b1` — pero `w-fintual-b5` y `pr-conc-b1` están marcadas `hasMetric:true` y contienen números visibles, y `sk-practices` es una categoría de skill, no una viñeta. **Toda** viñeta del fixture tiene `hasMetric:true` (cero viñetas sin métrica) → el warning no está soportado por los datos a los que apunta. Un ingeniero que construya el chequeo de salud §8 contra este golden choca con la contradicción.
- `copy.md` — `ed.targetTitle.why = "10,6× entrevistas..."` afirma una estadística **sin `.src` inline**, mientras la regla del propio archivo es "ningún número sin fuente" (las keys hermanas sí llevan `.src`). La fuente existe en `datos-ejemplo.json` (`h-title`, "Jobscan: coincidencia de título = 10,6x entrevistas") pero no se expone en el string de copy.
- **Mismatch de marca:** `copy.md:19` usa marca **"Corpus"** (tagline "El sistema de registro de tu carrera"), mientras el nombre de carpeta/working es **CANON**. Quien consuma el handoff debe saber que la marca de cara al usuario es Corpus.

---

### 3.4 Color / tokens — 🟢 Menor

**Construido**
- Escala oro en ambas fuentes con hex idéntico (`tokens.css:19-24`, `tokens.json:11-17`): `gold-100 #F6E2A2`, `gold-300 #E7C24F`, `gold-500 #D4AF37` (brand), `gold-700 #8A6414`, `gold-900 #5C450F`, `ink-on-gold #1A1206`.
- Tema obsidiana = `:root` default con set semántico completo (`tokens.css:15-79`); tema porcelana = `[data-theme="porcelain"]` (`tokens.css:225-255`). Todos los hex coinciden entre css/json.
- Aurora renderiza **oro/cobre/plata sobre obsidiana, no** esmeralda/púrpura: `canon-aurora.js:36-39` define `OBSIDIAN=#050508`, `GOLD=#D4AF37` (= `gold-500` al byte), `COPPER=#B87333`, `SILVER=#ADB6C2`. Grep de `2dd4a8/9b6dff/ff4466/e8b840/emerald/amethyst/crimson` → **cero matches** en todo el árbol.
- Sistema window/wall/scrim/panel completo en `canon-aurora.css` y **cableado en las pantallas reales** (`c-window`/`c-wall`/`c-scrim`/`c-panel` aparecen 21× en cada pantalla).

**Faltante**
- `--obsidian-deep (#050508)` — el color substrato sobre el que se apoya ~85% del fondo y todo el sistema window/wall/scrim — **no está definido** en `tokens.css` ni `tokens.json`. Sobrevive solo vía fallback inline `var(--obsidian-deep,#050508)` (`dashboard.html:505/522-523`, `editor-variante.html:531/548-549`, `canon-aurora.css:57/74-75`) y definido localmente solo en `DEMO-aurora.html:10`. El negro estructural clave falta en la fuente de verdad.
- La escala oro es una rampa dispersa de 5 stops (100/300/500/700/900) — sin 200/400/600/800. Aceptable como decisión, se anota por completitud.

**Defectos**
- **Drift del token danger:** `tokens.css:44` / `tokens.json:41` definen `--danger = #C4453A`, pero cada pantalla hardcodea un rojo **distinto** como fallback: `#C6544B` en `dashboard.html:371`, `editor-variante.html:397`, `DEMO-aurora.html:16`, `DEMO-movimiento.html:18/166/169/204`. Dos rojos diferentes rotulados "danger": fuente de verdad y build no coinciden. (El rojo para destructivo está permitido; esto es defecto de fidelidad, no rompe la regla de un-solo-oro.)
- **Colores linguist de GitHub filtran cromo no-metálico:** `componentes.html:285-293` pinta swatches `.lang` con `#79c0ff`, `#3572A5`, `#844FBA`, `#2b7489`, `#89e051`, `#f1e05a`. Son los colores de GitHub linguist en un mock de import de repo — defendible como mímica de dato externo, pero es el **único lugar** donde aparecen azul/verde/púrpura/amarillo en la UI. Dado que el color es la queja #1, se recomienda renderizarlos en gris o monocromo oro.
- **Los CV bypassean los tokens porcelana con grises de imprenta a medida:** `05-documento-cv/*.html` usan `#E7E5DF` / `#24242A` / `#B7B7B2` / etc. en vez de los tokens porcelana. Aceptable — el CV es un artefacto deliberadamente sobrio en escala de grises (`cv-bn.html:184` aplica `grayscale(1)`) — pero es drift: el documento no consume los tokens.

---

### 3.5 Adopción de referencia (alkemymarket.com) — 🟢 Menor

De 7 técnicas auditadas: **2 adoptadas, 1 a medias, 4 ausentes** — la mayoría de las ausencias son rechazos deliberados y documentados en `ANALISIS-REFERENCIA.md`. Es adopción selectiva guiada por tesis, no negligencia.

**Construido (adoptado)**
- **#2 Micro-UI real dentro de las cards** (dato mono, no icono+label) — adoptado fuerte: `componentes.html:210-229` cards `.prov` de provenance, `:116-118` cards `.skill` de evidencia, `:120-136` cards `.source`; `dashboard.html:647-650` filas de fuente ("GitHub · @mfuentes-demo", "41 items · 38 aceptados") y `:639-642` filas de "Salud del master" con citas mono. Nombrado "la mejor idea" en `ANALISIS-REFERENCIA.md` §3.2 e implementado.
- **#5 Toggle rayos-X blur→resolve** ("cómo lo lee el ATS") — adoptado ejemplar: def en `canon-motion.css:168-194`, cableado en `canon-motion.js:89-100` (aria-pressed, aria-live), fallback reduced-motion en `:305`, instanciado en `editor-variante.html:702-744` con capa `__doc` renderizada Y capa `__raw` de parser ATS genuino. El blur-in de la referencia repurposeado como metáfora que define el producto.

**A medias**
- **#3 overline/eyebrow** — el sistema repetido está presente (`index.html:24,73`; `componentes.html:26`; DEMO) con mono mayúscula y tracking estático `+0.14em`, pero **falta el letter-spacing tighten animado** de la referencia (keyframe `sectionEyebrow`: `letter-spacing 0.6em→0.3em` en el reveal). Ningún `@keyframes` del build anima `letter-spacing`. Es el único micro-detalle de referencia que se podría agregar barato y consistente con la tesis.

**Faltante (mayormente rechazos deliberados)**
- **#1 grids hairline gap:1-2px** — ausente; la separación se hace con `border-bottom:1px solid var(--border)`.
- **#4 forge button glow+filament+spark** — ausente (0 hits de `forge`/`sparkFloat`); deliberado por `ANALISIS` §4 "oro escaso".
- **#6 card hover spotlight** (radial track del mouse) — ausente; ni adoptado ni rechazado explícitamente → pequeña oportunidad perdida que encajaría incluso en una herramienta de trabajo.
- **#7 ritmo de sección 160px + header sticky borroso** — ausente ambas mitades; rechazo deliberado "matamos la landing".

**Defectos**
- Token muerto: `--z-sticky:100` (`tokens.css:206`) declarado pero nunca aplicado — coherente con la decisión no-sticky, pero deja una afordancia sin usar en el set.

---

## 4. Los agujeros de validación (loopholes)

Estos son los huecos que dejaron pasar trabajo débil. Todos comparten una raíz: **los tests medían presencia de definiciones, no uso real en DOM.**

1. **DEFINIDO-PERO-DORMIDO (el escape #1).** El test del prompt-06 `grep -c "@keyframes"` cuenta **definiciones**, no aplicaciones. `dashboard.html` envía 11 `@keyframes` que satisfacen el conteo mientras **ninguno** está cableado a DOM real. Una pantalla puede pasar todos los greps siendo 100% estática. **Fix del gate:** todo gate debe asertar uso en un atributo `class=` de DOM real o una invocación JS real — nunca la mera presencia de una def CSS/JS o un comentario.

2. **`grep -l` MATCHEA LA REGLA CSS.** `grep -l "c-aurora-gl" onboarding.html` pasa porque `.c-aurora-gl{...}` existe en el stylesheet — pero el canvas nunca monta porque ningún elemento del body lleva esa clase (0 ocurrencias `class=` en ambas pantallas). **Fix:** contar usos en elementos del body (`class="...c-aurora-gl"`), no ocurrencias en stylesheet/JS-string.

3. **COMENTARIO-COMO-EVIDENCIA.** `grep -l "CANON.stagger"` pasaría sobre un comentario `// Uso: CANON.stagger(list)`. Los únicos hits de stagger/shimmer en el árbol son ejemplos en comentarios — las funciones nunca se llaman. **Fix:** los gates de invocación deben excluir comentarios (exigir call-site fuera de líneas `//`/`/*`) Y exigir la clase gatillo en DOM real.

4. **ARCHIVO-FALTANTE-POR-DOC-DE-DISEÑO.** Las ausencias se lavan como "deliberadas" citando `ANALISIS-REFERENCIA.md` ("matamos la landing"). Un rationale para rechazar el **género** landing no excusa las 9 pantallas de app faltantes ni `handoff.md` + `criterios-aceptacion.md`, que el prompt-06 lista como entregables requeridos. **Fix:** los gates de existencia de pantalla/archivo deben ser pass/fail sobre `test -f`, independientes de cualquier justificación en prosa.

5. **SIN PANTALLA-HOST = LA CEREMONIA NUNCA CORRE.** Las dos ceremonias insignia y la aurora son físicamente indisparables porque la pantalla ingesta/staging/loading que las hospedaría no existe. Se puede reclamar cobertura desde el kit mientras cero de él dispara. **Fix:** atar la ceremonia a su artboard host — la pantalla ingesta debe existir Y disparar stagger+shimmer.

6. **COBERTURA DE UNA SOLA PANTALLA.** Una regla satisfecha en UNA pantalla (`data-xray-toggle` solo en `editor-variante`) se reporta como "adoptada" a nivel producto. **Fix:** los gates deben nombrar el archivo exacto, para que "implementado una vez" no se disfrace de "implementado".

7. **FUGA DE PALETA VÍA "DATO EXTERNO".** Seis hex no-oro en `componentes.html` excusados como "colores linguist de GitHub". Dado que la queja #1 es la fuga no-oro, el gate debe flaggear **cualquier** hex fuera del set sancionado (oro/obsidiana/porcelana/metal) sin importar la justificación semántica, y exigir waiver humano.

8. **DRIFT TOKEN/BUILD OCULTO POR SINTAXIS FALLBACK.** Las pantallas hardcodean `var(--danger,#C6544B)` mientras el token define `#C4453A`. El fallback inline hace que renderice el rojo **equivocado** y el token nunca se consulte. **Fix:** el gate debe diffear los hex fallback literales contra la fuente de verdad, no solo chequear que el token exista.

9. **GOLDEN "PARECE CONSISTENTE" SIN CROSS-CHECK.** El warning "viñeta sin número" de `masterHealth` apunta a viñetas marcadas `hasMetric:true` — contradicción que solo aflora con cross-check a nivel campo. La paridad superficial "el txt matchea el orden del json" la pierde. **Fix:** gatear el par golden con una aserción de consistencia de campos scripteada, no a ojo.

10. **ESTADÍSTICA SIN FUENTE SE ESCAPA DE "sin números inventados".** La regla del propio `copy.md` es "ningún número sin fuente", pero `ed.targetTitle.why = 10,6×` viaja sin `.src` hermano. **Fix:** "números-necesitan-fuentes" debe ser un check de máquina sobre `copy.md`.

11. **SISTEMAS PARALELOS/LEGACY DUPLICADOS.** `editor-variante` envía tanto un `dividerDraw` local (dispara cada carga, sin guardia — viola `motion.md` C1) COMO el canon `c-divider-draw` (nunca aplicado), más un `@keyframes pulse`/`.pulse` legacy muerto. Un conteo ingenuo de keyframes premia este bloat. **Fix:** gatear keyframes huérfanos (definido-pero-sin-uso) y prohibir mecanismos duplicados de divider.

---

## 5. Plan de acción priorizado

Bloqueadores primero. El orden respeta dependencias: sin pantallas host, las ceremonias del kit no tienen dónde correr.

### P0 — Bloqueadores (desbloquean todo lo demás)

1. **Construir la pantalla `ingesta` (wait de extracción IA) primero.** Es la que hospeda las tres piezas dormidas de mayor valor: aurora montada (`.c-aurora-gl` en el body real), stagger "el momento estelar" y el shimmer único. Al construirla, cablear:
   - `class="...c-aurora-gl"` en el body → verificar que `mount()` monte el canvas.
   - un contenedor `.c-stagger` real + una llamada `CANON.stagger(` no-comentario.
   - `c-shimmer` sobre un elemento real + su disparo (`CANON.shimmer()` / `is-firing`), exactamente una vez.
   - `c-thinking` / `c-skeleton` sobre DOM real durante el wait.
2. **Construir la pantalla `staging` (zona de revisión/confirmación)** — el núcleo anti-alucinación de la tesis. Hospeda confirm/dismiss y las clases de estado (`c-unverified`, `c-override`) sobre DOM real.
3. **Construir las 7 pantallas restantes:** `auth`, `onboarding`, `master`, `fuentes`, `tailoring`, `salud`, `ajustes`. Cada una con `prefers-reduced-motion` y sin payload muerto inline.
4. **Escribir `06-handoff/criterios-aceptacion.md`** — la definición-de-hecho contra la que firmar el build, con gates que aserten **uso en DOM**, no presencia de def (ver §4). Sin esto no hay forma de cerrar V3.
5. **Escribir `06-handoff/handoff.md`** — documento de entrada de ingeniería que ate tokens + motion kit + pantallas + `copy.md` + `ESPECIFICACION.md`, y que resuelva explícitamente la marca (**Corpus** de cara al usuario, CANON working-name).

### P1 — Mayores (calidad del build existente)

6. **Montar la aurora en las 2 pantallas ya construidas:** agregar `.c-aurora-gl` al body de `dashboard.html` (estado vacío) y donde corresponda; retirar el shader inline muerto (~130 líneas c/u) y consumir `canon-aurora.js` como fuente única.
7. **Eliminar los sistemas duplicados/legacy en `editor-variante.html`:** borrar el `dividerDraw` local (`:79`) y usar el canon `c-divider-draw` con su guardia una-vez-por-sesión; borrar `@keyframes pulse` + `.pulse` muertos (`:146-147`).
8. **Cablear al menos una demostración viva del kit en `componentes.html`:** confirm/dismiss/stagger/shimmer/skeleton/hairline-state sobre DOM real, para que la galería demuestre el sistema en vez de solo definirlo.
9. **Corregir la contradicción del golden:** en `datos-ejemplo.json`, o marcar `hasMetric:false` las viñetas que `masterHealth h-nometric` referencia, o reapuntar el warning a viñetas realmente sin cifra. Debe pasar un check de campos scripteado.
10. **Agregar `.src` a `ed.targetTitle.why` en `copy.md`** (la fuente ya existe en `datos-ejemplo.json` → "Jobscan: coincidencia de título = 10,6x").

### P2 — Menores (higiene de tokens y pulido)

11. **Tokenizar `--obsidian-deep: #050508`** en `tokens.css` y `tokens.json`; reemplazar los fallbacks inline por la var.
12. **Resolver el drift de `--danger`:** decidir el rojo canónico (`#C4453A` del token) y eliminar los fallbacks `#C6544B` de las pantallas y DEMOs.
13. **Neutralizar los colores linguist de GitHub** en `componentes.html:285-293` a gris/monocromo oro (o registrar un waiver humano explícito).
14. **Enlazar las pantallas construidas desde `index.html`** y sincronizar el strip de estado con lo que hay en disco.
15. **Definir los breakpoints 1024 y 390** como parte de cada pantalla nueva (no como retrofit sobre los frames fijos 1440), y agregar artboards de **loading** y **error** a las pantallas donde importan (ingesta, staging).
16. **(Opcional, barato y consistente con la tesis)** implementar el `sectionEyebrow` letter-spacing tighten (`0.6em→0.3em`) como keyframe — el único micro-detalle de la referencia que valdría la pena sumar.

### P3 — Reforzar la validación (para que no vuelva a pasar)

17. Reemplazar los gates de `grep -c` por los gates de **uso en DOM** derivados en la auditoría: keyframes definidos == usados (0 huérfanos), aurora monta (usos `class=`), stagger/shimmer cableados con call-site no-comentario, pureza de paleta con diff de hex, paridad golden scripteada, "ningún número sin fuente" sobre `copy.md`, y `test -f` de las 11 pantallas + los 3 archivos de handoff.