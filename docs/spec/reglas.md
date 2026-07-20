# Corpus — reglas.md · digest ejecutable de lo NO NEGOCIABLE

> **Este archivo es el guardián de las reglas del sistema.** Es un digest de fuentes canónicas;
> cuando una regla aquí choque con una interpretación, gana la **fuente citada** (ruta al lado).
> Copia literal: los nombres de clase, tokens y copy NO se parafrasean — son el contrato diseño↔código.
>
> Fuentes: `Corpus_ diseño completo/corpus-design/` → `01-producto/{principios,posicionamiento}.md`,
> `02-sistema/{motion,densidad,tipografia}.md · {motion,tokens,aurora,base}.css · tokens.json`,
> `06-handoff/{handoff,copy,criterios-aceptacion}.md`, `00-README.md`.

---

## 1 · Principios de producto (con su fuente)

Marca de lectura: **[fuente]** = evidencia citada en investigación · **[criterio]** = decisión de
diseño nuestra, declarada como tal. Disfrazar la segunda de la primera está prohibido.
(fuente: `01-producto/principios.md`)

1. **El enemigo es la extracción defectuosa, no un filtro maligno.** El "75% auto-rechazado" es un mito (Preptel, 2013). Si el parseo falla, la ficha igual se crea, pero quedas mal indexado e invisible. **[fuente: Greenhouse docs · unchartedcareer.com]**
2. **Mostrar el texto que el parser extrae, no un score.** Ningún ATS publica su fórmula; un score es humo. El texto extraído es un hecho verificable. **[fuente: docs Greenhouse/Lever/Workday — ausencia de fórmula pública]**
3. **Cada dato de la UI cita su origen o no se muestra.** Niveles derivados de un hecho: `verificado` (aparece literal), `parcial` (coincidencia difusa), `sin evidencia` (borde punteado + icono + texto, nunca solo color). **[criterio — es la tesis del producto]**
4. **Señala viñetas sin cifra una a una; jamás un umbral.** No existe estudio que fije "X% de viñetas con número". **[fuente: Jobscan 2025, n=384 · verificación negativa]**
5. **El job title se alinea al aviso.** Coincidencia de título = 10,6× más entrevistas (dirección sólida, magnitud probablemente inflada — úsalo para priorizar, no para prometer). **[fuente: Jobscan, 2,5M postulaciones]**
6. **1 y 2 páginas son igual de válidas; la página 3 no existe.** Preferencia 2,3× por 2 páginas (2,9× managerial). **[fuente: ResumeGo 2018 · Ladders 2018]**
7. **Una columna, cero tablas, cero headers/footers, cero iconos, cero fotos, texto seleccionable, < 2,5 MB.** **[fuente: Greenhouse · Lever · Workday]**
8. **Sin foto por defecto.** Desaconsejada en Chile, con efectos discriminatorios medidos. **[fuente: Robert Walters Chile · Ruffle & Shtudiner, Management Science 2015]**
9. **Viñetas XYZ:** "Logré [X], medido por [Y], haciendo [Z]", verbo de acción, sin adjetivos sin evidencia. STAR es para la entrevista, no para el CV. **[fuente: Laszlo Bock, Google]**
10. **La especificidad verificable es indetectable como IA porque la IA no la puede inventar.** ~20% de hiring managers rechazaría un CV que parezca de IA. La IA estructura, comprime y adapta — nunca redacta desde la nada. **[fuente: TopResume 2025 · Greenhouse 2025]**
11. **El movimiento se gana su lugar comunicando un cambio de estado; si solo decora, se borra. Cuanto más frecuente la acción, más corto — hasta desaparecer.** **[criterio]**
12. **La herramienta no regaña ni celebra: constata e invita.** Los huecos son invitaciones ("¿cuánto? ¿en cuánto tiempo?"), nunca errores. **[criterio — tono]**
13. **Honestidad estructural en la ingesta:** LinkedIn no se puede leer desde fuera (login wall); la UI lo dice y ofrece las tres vías reales. El progreso dice *qué* hace, jamás un % inventado. **[fuente: bloqueo documentado de LinkedIn · criterio]**
14. **GitHub es la fuente donde la IA no puede alucinar** — API con esquema; `Go: 412.803 bytes` es un hecho. Con freno: un CV no es un volcado de repos → selector con default sensato pero revisable. **[fuente: API GitHub · criterio]**
15. **Accesibilidad de contraste verificada, no estimada.** Cada par de `tokens.css` lleva su ratio WCAG. Nunca blanco sobre pátina; sobre claro el acento es `patina-700`. **[fuente: cálculo de luminancia WCAG en tokens.css]**

**La tesis (posicionamiento):** *"Un registro canónico de tu carrera. Todas las versiones de tu CV
son vistas de él, no copias."* Un master profile; N variantes que **referencian, no copian**; la IA
**nunca inventa** (cada línea apunta a algo que el usuario escribió; lo no rastreable se marca); *"lo
que ves es lo que el parser lee"*. Tono: sereno, competente, sin drama — **diseñamos para la
dignidad**. (fuente: `01-producto/posicionamiento.md`)

---

## 2 · Presupuestos de movimiento (C0/C1/C2/C3) y equivalencia con `prefers-reduced-motion`

**La regla:** una animación se gana su lugar si comunica un cambio de estado que el usuario necesita
entender. Si solo decora, se borra. Más frecuente la acción → más corta, hasta desaparecer.
(fuente: `02-sistema/motion.md` + `motion.css`)

### La escala de ceremonia

| Ceremonia | Frecuencia | Presupuesto | Ejemplos |
|---|---|---|---|
| **C0 · Instantáneo** | decenas/día | **0–80 ms**, solo color/opacidad | editar viñeta, mostrar/ocultar, reordenar, hover de fila |
| **C1 · Confirmación** | varias/sesión | **120–200 ms** | aceptar item, añadir a variante, revertir override, hover de botón |
| **C2 · Transición** | pocas/sesión | **250–400 ms** | cambiar de variante, cambio de vista (`enter`), **el rayos-X** |
| **C3 · Ceremonia** | una vez cada mucho | **600–1200 ms** | montaje de pantallas ceremoniales, fin de ingesta (escalonado + shimmer) |

Firma: `--ease-signature: cubic-bezier(0.16, 1, 0.3, 1)` (easeOutExpo). Escalonado: 80 ms ceremonial ·
40 ms en listas densas. `durMs`: instant 80 · fast 140 · base 220 · slow 360 · deliberate 640 ·
reveal 900. Tope de escalonado: 24 items (`staggerCap`).

### Equivalencia con `prefers-reduced-motion: reduce` — **pierde el movimiento, nunca la información**

Los estados base (fuera del media query) son los **finales**; el JS degrada por función.

| Efecto | Con motion | Equivalencia reduce |
|---|---|---|
| Reveal / stagger / divider | blur+desplazamiento escalonado | contenido visible de inmediato, sin transición |
| wordReveal / charReveal | palabra a palabra / letra a letra | el texto **no se fragmenta**: queda intacto y visible |
| `enter` (cambio de vista) | 360 ms blur+lift | corte limpio (mismo contenido) |
| **Rayos-X** | el doc se desenfoca y resuelve el crudo | **corte limpio, misma información** |
| Shimmer (fin de ingesta) | barrido de pátina, 1 vez | no ocurre; el resumen aparece completo |
| Contadores | count-up easeOutExpo hacia el valor real | el valor final se escribe directo |
| Skeleton / spinner / pulso | pulso u ⟳ | estático (el estado se lee por texto/glifo) |
| Aurora | humo WebGL2, calm/active | **fallback estático** (gradientes CSS, misma paleta) |
| Hover forge/lift | translateY + glow | solo cambio de color/borde |

**TODO el movimiento vive bajo `@media (prefers-reduced-motion: no-preference)`.** Regla implementada
literalmente en `motion.css` (línea 33: `@media (prefers-reduced-motion: no-preference){ … }`).

### El kit de movimiento (motion.css) — números REALES

- **7 `@keyframes` — LA LISTA CANÓNICA COMPLETA, nombres exactos, no negociables:**
  `cWordIn` · `cCharIn` · `cEnter` · `cShimmer` · `cPulse` · `cSkel` · `cSpin`.
- **17 clases del kit** (selectores `.c-*` en motion.css): `.c-divider` · `.c-divider--patina` ·
  `.c-w` · `.c-ch` · `.c-shimmer` · `.c-spot` · `.c-pulse-dot` · `.c-xray` · `.c-xray__doc` ·
  `.c-xray__raw` · `.c-stagger-css` · `.c-enter` · `.c-skel` · `.c-spin` · `.c-forge` ·
  `.c-btn--forge` · `.c-lift`.
- `base.css`, `aurora.css`, `tokens.css`: **0 `@keyframes`**.
- Las 13 pantallas de `04-pantallas/*.html` NO definen keyframes propios: cada una lleva una **copia
  íntegra** de los mismos 7 keyframes dentro de su bloque `<style data-corpus-system="css">`
  (líneas 435–463 en todas). **Total UNy;ICO de keyframes en el paquete = 7.** (Verificación abajo, §Contradicciones.)
- **La aurora** (`aurora.js`): `calm` por defecto; `active` **solo** durante la ingesta. Se pausa al
  enfocar un campo (el editor es sagrado), con la pestaña oculta, y bajo demanda. Un dial:
  `--aurora-strength` (0.22 trabajo denso · 0.55 ★ hojeo · 0.8 fuerte).
  **Se monta UNA sola vez por shell** (`src/app/app/layout.tsx` para las diez pantallas de la app;
  `AuthScreen` y la landing, que quedan fuera de ese layout, montan la suya). Ninguna pantalla de
  dentro la monta: cada una **declara su intensidad** con `<AuroraTune>` (`src/components/Aurora.tsx`).
  ⚠ *Deroga* la regla anterior «solo las VENTANAS la montan; los MUROS no» — ver §2 bis.


---

## 2 bis · La atmósfera — doctrina vigente

> **La aurora está SIEMPRE presente — es la atmósfera del producto, no una decoración por pantalla.
> Lo que protege la lectura no es su ausencia, sino la SUPERFICIE sobre la que vive el contenido.**

**Qué deroga.** La gramática **ventana / muro** («las secciones son opacas (muro) y algunas
transparentes (ventana); donde hay trabajo que leer, hay muro; los muros ni montan la aurora») era un
**error de diseño**, no de implementación. Salió de una *landing*: allí las secciones se alternan al
hacer scroll y la alternancia se experimenta **en secuencia**, y eso produce ritmo. **Corpus no es una
página que se recorre: es una app de pestañas.** Nunca ves la alternancia — pulsas Master y no hay
humo, pulsas Fuentes y sí. Eso no se lee como ritmo: se lee como **inconsistencia**.

**Las tres reglas que la sustituyen.**

1. **Un solo montaje, en el shell.** `<Aurora>` vive en `src/app/app/layout.tsx` y cubre las diez
   pantallas (Panel · Master · Variantes · Editor · Staging · Tailoring · Salud · Fuentes · Importar ·
   Ajustes). Fuera de ese layout montan la suya `AuthScreen` (login/signup/auth) y la landing.
   Montar diez veces obligaba a un baile de `pause`/`resume` por pantalla, y una razón pausada y nunca
   levantada dejaba el fondo **congelado toda la sesión** (pasó de verdad con `'corpus-hojeo'`).
2. **Se modula, no se enciende y apaga.** Cada pantalla declara su intensidad con `<AuroraTune>`:
   **0.55** al hojear o esperar (Panel vacío · Importar · Ingesta · galería · Fuentes · Variantes ·
   Ajustes · Onboarding · login) y **0.22** en trabajo denso (Master poblado · editor · staging ·
   tailoring · salud · Panel poblado). El cambio entre pestañas se interpola (~520 ms): sin escalón.
   `setState('active')` sigue siendo **solo** la ingesta.
3. **El contenido, sobre vidrio.** En las pantallas densas `.c-wall` ya **no es una pared opaca**:
   conserva el nombre (es el contrato en 8 pantallas) pero es la **lámina de vidrio** de la pantalla —
   velo mínimo + **un** `backdrop-filter`, en un pseudo-elemento para no crear bloque contenedor y
   romper los `position:fixed` de sus overlays. Encima, las superficies de item son **translúcidas sin
   filtro propio** (`--surface-glass`, `--bg-glass`, `.c-panel--solid`).
   ⚠ **Coste:** el vidrio se paga **una vez por pantalla, no una vez por fila**. `backdrop-filter` en
   cada item de una lista de 200 son 200 capas de composición. El desenfoque lo pone el **contenedor**;
   las filas solo llevan color. `.c-panel` (con filtro propio) es para tarjetas **sueltas**.

**Los frenos no se tocan.** La aurora se pausa al enfocar cualquier campo (`'focus'`, lo cablea
`motion.js`: mientras se escribe no se mueve nada), con la pestaña oculta (`'hidden'`), y bajo
`prefers-reduced-motion` cae al fallback estático. **Cero scroll-reveal dentro de la app.**

*(Las secciones «§2 · Ventana o muro · Aurora» de `docs/spec/pantallas/*.md` documentan el paquete de
diseño original tal como se entregó: son **histórico**, no la regla vigente. La regla vigente es esta.)*
---

## 3 · Densidad y tipografía — reglas duras

(fuente: `02-sistema/densidad.md` · `tipografia.md` · `tokens.json`)

### Densidad

- **Nunca letra < 11 px en la app.** La densidad NO se compra con letra pequeña ni con `transform: scale()` — se logra con micro-tipografía real.
- **Nunca un icono donde puedas poner el dato.** Mini-UI en tarjetas: fuente 9–11 px mono · filas 16–20 px · gaps 4–6 px · hairlines de 1 px, sin bordes internos.
- Listas de trabajo: fila compacta 44–56 px · padding-inline 16–24 px · meta en mono 11–12 · separación entre filas = hairline `--border`, **no espacio**.
- Rejillas hairline (el hueco es la línea): bento 12 col `gap: 2px` · pasos 3 col `1px` · métricas 4 col `1px`. Celdas opacas (`--surface`) sobre `--bg`; **cero bordes entre tarjetas contiguas**.
- Controles: alturas **40** (default) · **44** (formularios) · **62** (CTA héroe). **Hit target móvil ≥ 44 px.** Radios: **3** (micro) · **6** (controles) · **8** (tarjetas) · **12** (paneles).
- Ritmo vertical: pantallas de trabajo secciones 48–64 px, header **64 px** sticky; ceremoniales hasta 160 px. Contenedor **1200 px** máx · padding-inline **24 px**. Breakpoints **768** y **480** (mobile-last).
- **Cada lista se diseña con 3 items y con 200.** Con 3, la fila respira (56 px); con 200, búsqueda + filtros arriba, escalonado con tope 24 y el resto de golpe.

### Tipografía — tres voces (el reparto ES el posicionamiento)

| Rol | Familia | Pesos | Escala (token · px · uso) |
|---|---|---|---|
| Display | **Playfair Display** | 500 · 600 · 500 itálica | `--fs-hero` 56 · `--fs-display` 44 · `--fs-h2` 28 |
| UI | **Geist** | 400 · 500 · 600 | `--fs-h3` 20 · `--fs-lead` 16 · `--fs-body` 14 · `--fs-ui` 13 |
| Datos | **Geist Mono** | 400 · 500 | `--fs-data` 12 · `--fs-micro` 11 |

1. **Playfair habla poco y alto.** Solo titulares y encabezados de sección; **jamás** en controles, tablas o texto corrido. Si Playfair aparece más de 2 veces en una vista, **sobra una**.
2. **El mono es la voz de la evidencia.** Cifras, rutas, tamaños de repo, fragmentos de origen, fechas en columnas → siempre `--font-mono` (`.t-num`, `.t-data`). "mono = hecho".
3. **Overline ritual:** mono 11, caps, tracking **.16em**, `--text-subtle`. Etiqueta de sección de todo el producto.
4. **Números tabulares** (`font-variant-numeric: tabular-nums`) en contadores y columnas.
5. Móvil: hero 40→32, display 32. **Nunca menos de 11 px en la app.**
6. Carga (Google Fonts CDN, en cada pantalla): `Playfair+Display:ital,wght@0,500;0,600;1,500 · Geist:wght@400;500;600 · Geist+Mono:wght@400;500`.

---

## 4 · Reglas de color / pátina — las prohibiciones duras

(fuente: `01-producto/posicionamiento.md` · `tokens.json` · `00-README.md`)

**Tres minerales, tres roles:** **grafito** (sustrato, negro frío) · **pátina** (el acento — valor
y acción) · **porcelana** (el blanco cocido, el papel del documento). Cobre y plata (`#B87333`,
`#ADB6C2`) existen **solo como atmósfera en el shader de fondo**. Atmósfera ≠ señal.

Prohibiciones (cada una con su ratio de falla):

- ❌ **Texto blanco sobre relleno de pátina.** Sobre pátina el texto es SIEMPRE tinta `--ink-on-patina` (`#06110E`). Blanco falla (**2.56:1**).
- ❌ **`patina-500` como acento sobre porcelana (tema claro).** Falla (**2.41:1**). Sobre claro el acento/enlace es `patina-700` (`#1F6E5A`, 5.74:1 AA); hover `patina-900`.
- ❌ **Cobre / plata / acero en la UI.** Solo en el shader de fondo. Prohibidos como señal.
- **≤ 1 elemento de pátina dominante por vista.** La pátina es el único acento interactivo.
- Ratios de referencia (grafito): `patina-100` 10.99:1 · `patina-300` 9.47:1 (enlaces/focus) · `patina-500` 7.66:1 (★ marca/CTA) · `patina-700` 5.74:1 (sobre claro) · `patina-900` 7.99:1 (hover claro).
- **Atmósfera constante (deroga «ventana / muro»):** la aurora está **siempre** presente — es la
  atmósfera del producto, no una decoración por pantalla. Lo que protege la lectura no es su
  ausencia, sino la **superficie** sobre la que vive el contenido. Ver §2 bis.
- «Sin evidencia» = **borde punteado + glifo + palabra**, nunca solo color.
- El fondo vivo es **WebGL2 crudo, cero dependencias** (fBm + domain warping). Fallback estático CSS para reduce-motion y sin WebGL2 — misma atmósfera, cero movimiento.
- Temas: `data-theme="dark|light"` en `<html>`; contrastes verificados en `tokens.css`; focus-visible con anillo `--focus-ring`.

---

## 5 · Criterios de aceptación del diseño (literal de `06-handoff/criterios-aceptacion.md`)

1. **Cada pantalla abre con doble clic y se mueve**: hairlines que se dibujan, escalonado al poblarse, rayos-X que resuelve del desenfoque, aurora que respira en las ventanas y se agita solo en la ingesta. Verificable archivo por archivo con su panel `demo`.
2. **Un ingeniero construye cualquier pantalla sin preguntar nada de diseño**: valores en tokens.css/tokens.json, geometría del documento en pt/mm (ESPECIFICACION.md), copy completo en copy.md (ES+EN), estados enumerados en handoff.md, movimiento con presupuesto y equivalencia en motion.md.
3. **`cv-texto-plano.txt` demuestra el parseo limpio**: nombre → título → email/tel → links → secciones → cargos con fechas → viñetas, en orden, sin runs pegados. Extraído a máquina del render de referencia; el contrato de CI (§6 de la especificación) lo regenera desde el PDF real y falla el build si no coincide.
4. **Cada regla del documento tiene fuente citada o se declara [criterio]** — las dos cosas son legítimas; disfrazar la segunda de la primera, no.
5. **Todo el copy existe en ES y EN** (copy.md) y ninguna línea suena a coach ni a robot — regla de voz al inicio del archivo.
6. **No existe ningún número sin fuente en la UI.** Sin ATS score, sin % de match, sin % de progreso, sin umbrales de viñetas. Los números que aparecen son hechos del sistema (conteos, bytes, fechas) o evidencia citada (10,6×, 58,2% con su vendor y su n).
7. **`prefers-reduced-motion` en todo**, con la equivalencia de cada efecto documentada en motion.md: pierde el movimiento, nunca la información (el rayos-X corta limpio; los contadores escriben el valor final; la aurora cae a fallback estático).
8. **La app se ve cara; el documento se ve serio** — y se entiende por qué son distintos: la app es grafito con una pátina viva que señala valor y acción; el documento es porcelana tipográfica donde el único lujo es el espacio y la única pátina es tinta (patina-700) que sobrevive en B/N.

---

## 6 · La lista de PROHIBICIONES (lo que el sistema hace difícil a propósito)

**Números y métricas falsas** (fuente: posicionamiento §Anti-producto · principios 2/4 · criterio 6):
- ❌ **ATS score.** Ninguna forma. Workday/Greenhouse/Lever puntúan distinto y no publican fórmula.
- ❌ **`% de match`** ("62% de match") en cualquier parte de la UI.
- ❌ **`confidence` / "confianza: 87%"** — ningún nivel de confianza numérico auto-reportado.
- ❌ **`% de progreso`** en la ingesta. El progreso dice *qué* hace, nunca un % inventado.
- ❌ **Umbrales de viñetas** ("el 60% de tus viñetas debería llevar cifra"). Ese umbral no existe en ningún estudio.
- ❌ **Cualquier `[0-9]+/100`, score, match %, confidence** en `src/app` / `src/components`.
- ✅ Permitido: hechos del sistema (conteos, bytes, fechas) y evidencia citada con su fuente y su n (10,6× [Jobscan], 58,2% [Jobscan 2025 n=384]…).

**Gamificación** (fuente: posicionamiento):
- ❌ Rachas, badges, confetti/🎉, medallas. «No hay medalla: el silencio es la señal.»

**Movimiento** (fuente: motion.md):
- ❌ **Scroll-reveal en la app.** `CorpusMotion.io` solo acepta documentos de lectura. El contenido de una herramienta está ahí, ya.
- ❌ **Animar mientras se escribe:** la aurora **se pausa** en `focusin` de cualquier campo.
- ❌ **Animar `width/height/top/box-shadow`** en listas — solo `transform` y `opacity`.
- ❌ **Más de un shimmer.** Hay **UN** shimmer en todo el producto (fin de ingesta), autolimitado en código.
- ❌ **Escalonar más de 24 items** (`staggerCap: 24`) — el resto entra de golpe.
- ❌ **`scrollIntoView`** — se usa scroll manual calculado; mantenerlo así.

**Otras prohibiciones de producto** (fuente: principios · handoff):
- ❌ **Keyword stuffing.** Sube el match con la máquina y hunde el CV con el humano (Ladders, eye-tracking).
- ❌ **La IA inventa experiencia.** Cada línea apunta a un fragmento; lo no rastreable se marca, no se maquilla.
- ❌ **Foto por defecto** en el CV. ❌ **Página 3.** ❌ Tablas / headers / footers / iconos / multicolumna en el documento CV.
- ❌ Verificación derivada del **auto-reporte del LLM** — siempre derivada de hechos (literal/difuso/ausente).
- ❌ Renombrar clases/keyframes/tokens del sistema. Los **nombres son el contrato** diseño↔código.

---

## 7 · Vocabulario prohibido en el copy (ES y EN)

(fuente: `06-handoff/copy.md`, regla de voz al inicio del archivo)

**Regla de voz:** sereno, competente, sin drama. **Nunca coach motivacional, nunca robot.** Ningún
número sin fuente. La herramienta **constata e invita; no regaña ni celebra.**

**Lista literal de vocabulario prohibido** (copy.md, línea 6):
`potenciar` · `sinergia` · `impulsar la excelencia` · `journey` · `unlock` · `🎉`.

Corolarios de tono prohibidos (derivados de la voz y del anti-producto):
- Nada de lenguaje de coach/celebración: sin «¡felicidades!», «¡vamos!», «tu viaje», «desbloquea», «potencia tu perfil».
- Nada de humo de métrica en el copy: sin «tu CV es un 87%», «mejora tu match», «optimizado para ATS».
- Los huecos se redactan como **invitación** ("¿cuánto? ¿en cuánto tiempo?"), nunca como reproche ni error.
- «sin evidencia» / «sin cifra» son constataciones neutras, no regaños.

---

## Contradicciones con el PROMPT DE IMPLEMENTACIÓN (choques diseño ↔ puertas)

> Sección de guardián: estos son choques REALES entre `criterios-aceptacion.md` (diseño) y las
> puertas del prompt de implementación. Verificados a mano, no estimados.

### C-1 · La puerta de los `>= 11 @keyframes` es INSATISFACIBLE desde el diseño canónico

- **Puerta del prompt:** FASE 0 y Criterio 3 exigen `grep -c "@keyframes" src/app/globals.css >= 11`.
- **Hecho verificado:** el sistema canónico define **exactamente 7** `@keyframes`
  (`cWordIn`, `cCharIn`, `cEnter`, `cShimmer`, `cPulse`, `cSkel`, `cSpin`) en `02-sistema/motion.css`.
  `base.css`, `aurora.css`, `tokens.css` = **0**. Las **13 pantallas** de `04-pantallas/*.html`
  **NO añaden keyframes propios**: cada una copia los mismos 7 (líneas 435–463) dentro de
  `<style data-corpus-system="css">`. **Total único en TODO el paquete = 7. No hay ninguna fuente
  de la que salgan 11.**
- **Consecuencia observada (el daño ya ocurrió):** el `src/app/globals.css` actual tiene 11 keyframes,
  pero son **inventados y renombrados**: `c-glow-in`, `c-confirm`, `c-dismiss`, `c-divider-draw`,
  `c-rise`, `c-shimmer`, `c-panel-in`, `c-breathe`, `c-skeleton`, `c-pending`, `c-drift`. Solo
  `c-shimmer` mapea al canónico `cShimmer`; los otros 10 **no existen en el sistema**. Esto viola la
  REGLA MADRE (los nombres NO cambian) y el principio "la IA/el equipo no inventa".
- **Resolución recomendada:** la puerta debe ser **`== 7`** con los **nombres exactos** del sistema
  (`cWordIn cCharIn cEnter cShimmer cPulse cSkel cSpin`), no un `>= 11` numérico. Un umbral que solo
  cuenta cantidad premia fabricar keyframes basura; hay que assertar **presencia por nombre**.

### C-2 · «Las 12 clases del kit» no cuadra con el kit real

- **Puerta del prompt:** FASE 0 exige "las 12 clases del kit presentes".
- **Hecho verificado:** `motion.css` define **17** clases `.c-*` del kit (`.c-divider`,
  `.c-divider--patina`, `.c-w`, `.c-ch`, `.c-shimmer`, `.c-spot`, `.c-pulse-dot`, `.c-xray`,
  `.c-xray__doc`, `.c-xray__raw`, `.c-stagger-css`, `.c-enter`, `.c-skel`, `.c-spin`, `.c-forge`,
  `.c-btn--forge`, `.c-lift`). El número "12" no corresponde a ningún subconjunto declarado en el
  sistema. La aserción debe listar los **nombres exactos** exigidos, no un conteo.

### C-3 · El Criterio 9 del prompt sí concuerda con el diseño (no es contradicción, es refuerzo)

- **Puerta del prompt:** `grep -rn "score|match.*%|[0-9]+/100|confidence"` en `src/app`/`src/components` → **cero**.
- **Concordancia:** coincide literalmente con el Criterio 6 del diseño y con §6 de este digest.
  Advertencia de guardián: el patrón `[0-9]+/100` **no** debe cazar hechos legítimos con fuente
  (bytes como `412.803`, conteos como `61 items`, evidencia como `10,6×` / `58,2%`), que sí son válidos.
