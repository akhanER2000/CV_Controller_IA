# PROMPT 07 — DISEÑO DEFINITIVO · MOVIMIENTO POR CAPAS Y VALIDACIÓN ESTRICTA
## Para: Claude (Opus 4.8, esfuerzo máximo) · Modo diseño ("Claude Design")
## Salida: el sistema de diseño CERRADO — pantallas vivas, no un kit dormido
##
## ⚠️ ADJUNTA SIEMPRE, sin excepción:
##   `00-INVESTIGACION.md` · `tokens.css` · `tokens.json` · `tipografia.md` · `densidad.md` ·
##   `motion.md` · `canon-motion.css` · `canon-motion.js` · `canon-aurora.js` · `canon-aurora.css` ·
##   `copy.md` · `ESPECIFICACION.md` (del documento CV)
##
## Después de esta entrega se pasa a código (repo objetivo: ProfileStack, Next.js + Tailwind).

---

# 0 · Por qué existe este prompt (léelo, no lo saltes)

Ya hubo tres rondas de diseño (prompts 01, 05, 06). Produjeron una **fundación excelente** y un
**kit de movimiento de primer nivel** — y luego **fallaron en lo único que importa: convertir el kit
en pantallas que se mueven de verdad.** Una auditoría forense archivo por archivo del build V3 lo
demostró. Estos son los hechos, verificados, no opiniones:

1. **Los colores SÍ se respetan.** `tokens.css`, `tokens.json` y el shader `canon-aurora.js` usan
   estrictamente **oro `#D4AF37` / obsidiana / porcelana** + los tres metales (oro / cobre `#B87333`
   / plata `#ADB6C2`). **Cero** verde, morado o carmesí de la referencia en toda la UI. Este no es el
   problema. *No lo toques salvo para las correcciones puntuales del §7.*

2. **El sistema está construido pero DORMIDO.** El dashboard entrega 11 `@keyframes`… y **ninguno
   está cableado a un elemento real del DOM.** El fondo aurora **nunca se monta** (la clase
   `.c-aurora-gl` existe en el CSS pero en **cero** elementos `<body>`). Las dos ceremonias estelares
   (`CANON.stagger()` y el shimmer único) **jamás se disparan**. La pantalla se ve, pero **no vive.**

3. **Faltan 9 de 11 pantallas.** Solo existen `dashboard.html` y `editor-variante.html`. No hay
   `auth`, `onboarding`, `ingesta`, `staging`, `master`, `fuentes`, `tailoring`, `salud`, `ajustes`.
   Y las dos que existen son marcos fijos a 1440px: **sin 1024, sin 390, sin estados de carga/error.**

4. **La validación anterior contaba definiciones, no uso.** El test de los prompts 05/06 era
   `grep -c "@keyframes"`. Una pantalla 100% estática con 11 keyframes muertos **pasaba la prueba.**
   Ese es el agujero exacto. **Este prompt lo cierra: aquí se valida USO en el DOM real, jamás la mera
   presencia de una definición CSS o JS.** (§8)

> **La lección de una frase:** *un `@keyframes` que no está aplicado a un `class=""` real es un
> comentario decorado. No cuenta. Nunca contó.*

**Tu encargo esta vez:** cablear el kit que ya existe a pantallas reales, **construir las 9 pantallas
que faltan**, y elevar el movimiento al nivel de la referencia **donde corresponde** (§5). Y hacerlo
de modo que **pase la batería de validación del §8**, que voy a ejecutar sobre tu entrega, comando
por comando.

---

# 1 · Tu rol y la ley suprema

Eres el **director de diseño de producto** de **Corpus** (nombre de marca de cara al usuario; el
nombre de trabajo interno y de carpeta es *CANON*; el repo es `CV_Controller_IA`). No maquetas:
decides qué se ve, en qué orden, con qué jerarquía y **por qué**, y dejas una especificación que
ingeniería puede construir sin adivinar nada.

Dos restricciones **innegociables**, en tensión permanente. Todo tu trabajo es resolverla con elegancia:

1. **La aplicación debe ser bellísima.** Editorial, luminosa, atmosférica. Debe dar la sensación de
   una herramienta cara. El fondo respira, el oro señala, el movimiento comunica.
2. **El documento CV que produce es deliberadamente sobrio.** Una columna, sin iconos, sin color, sin
   gráficos, ATS-perfecto. **No se mueve: es papel.**

> **El principio que resuelve la tensión:** *el lujo está en la contención.* La app despliega el oro;
> el documento lo administra en hairlines y jerarquía. **La app es la joyería; el CV es la joya.**

Si tienes que elegir entre "espectacular" y "lo parsea bien un ATS": **en el documento gana el ATS,
siempre. En la aplicación gana lo espectacular, siempre.** No mezcles los dominios.

## 1.1 La decisión nueva que gobierna esta ronda: **movimiento POR CAPAS**

El diseño anterior fue **demasiado contenido**. Rechazó a propósito la riqueza de la referencia
("matamos la landing", "oro escaso") y entregó pantallas casi inertes. **Esta ronda corrige el rumbo,
pero con disciplina.** El movimiento se organiza en **dos capas**, y cada pantalla pertenece a una:

| Capa | Pantallas | Ambición de movimiento |
|---|---|---|
| 🌌 **ATMOSFÉRICA** | `landing` · `auth` · `onboarding` · **`ingesta` (la espera de la IA)** · dashboard **vacío** del día 1 | **Coreografía completa nivel referencia.** Revelado de titular, eyebrow que se aprieta, ceremonia de carga, aurora agitado, partículas. Aquí el producto deslumbra. |
| 🛠️ **DE TRABAJO** | `editor-variante` · `master` · `staging` · `tailoring` · `salud` · `fuentes` · `ajustes` · dashboard **denso** | **Sobrio, rápido, funcional.** Micro-confirmaciones de 120–200 ms, hairlines, x-ray. **Cero scroll-reveal. El editor es sagrado: nada se mueve mientras se escribe.** |

**La regla mental:** *cuanto más frecuente es una acción, más corto debe ser su movimiento — hasta
desaparecer.* Terminar de ingerir tu LinkedIn (2 veces en la vida) = ceremonia entera. Guardar una
viñeta (40 veces al día) = 0 ms.

---

# 2 · De dónde partes — el estado real, auditado

No empiezas de cero. Esto es lo que ya existe y su estado real:

| Pieza | Estado | Qué hacer |
|---|---|---|
| `tokens.css` / `tokens.json` | ✅ Excelente | Consumir. Solo las correcciones del §7. |
| `tipografia.md` / `densidad.md` | ✅ Completo | Consumir. |
| `canon-motion.css` (11 keyframes) | ✅ Autoría impecable | **Cablear al DOM.** No reescribir. |
| `canon-motion.js` (API `CANON.*`) | ✅ Motor completo | **Invocar de verdad.** |
| `canon-aurora.js` / `.css` | ✅ Shader oro/cobre/plata | **Montarlo** (falta `.c-aurora-gl` en el body). |
| `copy.md` | ✅ Completo ES+EN | Consumir línea por línea. |
| `05-documento-cv/` + golden file | ✅ Presente | **No tocar** salvo el defecto del §7.4. |
| `dashboard.html` | ⚠️ Estático | **Rehacer con movimiento cableado + 1024/390.** |
| `editor-variante.html` | ⚠️ Parcial (x-ray funciona) | **Mantener el x-ray, cablear el resto, + 1024/390.** |
| `componentes.html` | ⚠️ 1 keyframe, colores que se filtran | **Rehacer** (§7.2). |
| `auth · onboarding · ingesta · staging · master · fuentes · tailoring · salud · ajustes` | ❌ **NO EXISTEN** | **Construir las 9.** |
| `06-handoff/handoff.md` · `criterios-aceptacion.md` | ❌ Faltan | Se entregan aparte con este prompt. |

---

# 3 · LA REFERENCIA, forenseada en vivo (emular, no copiar)

Todo lo que sigue lo extraje **abriendo `alkemymarket.com` en el navegador**, inspeccionando el DOM,
el CSS computado y el WebGL. Son valores **verificados**, no de oído. **Úsalos como material; no los
copies tal cual — tradúcelos a nuestro oro.**

## 3.1 El fondo (lo que el usuario más quiere)

- **Es un único `<canvas>` WebGL2.** Humo de **fBm + domain warping** (la técnica de Inigo Quilez:
  alimentar el ruido consigo mismo). El buffer se renderiza a **baja resolución y se escala** — por
  eso cuesta casi nada. Contenedor `position:fixed; inset:0; z-index:0; pointer-events:none`.
- El contenedor de página es **opaco `#050508`**; algunas secciones se declaran **transparentes** =
  **"ventanas"** por donde asoma el humo; el resto son **"muros"**.
- **→ Nuestra traducción, YA construida en `canon-aurora.js`:** el mismo shader, pero en
  **oro `#D4AF37` / cobre `#B87333` / plata `#ADB6C2` sobre obsidiana `#050508`** — *los tres metales
  conductores*, no los cuatro acentos de ellos. Y el nuestro **significa**: `CANON.aurora.setActive(true)`
  agita el humo cuando la IA piensa; `CANON.aurora.pause()` lo detiene cuando el usuario escribe.
  **Tu trabajo NO es rehacer el shader. Es MONTARLO** (poner `.c-aurora-gl` en el body de las
  pantallas atmosféricas) y usar el sistema ventana/muro.

## 3.2 Paleta de la referencia (para entender su sistema — NO para adoptarla)

Cuatro acentos, uno por sección: esmeralda `#2dd4a8`, oro `#e8b840`, amatista `#9b6dff`, carmesí
`#ff4466`. Convención de glow = color + `20` de alpha (~12.5%). **Nosotros tenemos UN acento (oro), y
esa disciplina es más fuerte que la suya.** Los tres metales viven **solo en la atmósfera del shader**;
la UI es oro y punto. *Atmósfera ≠ señal.*

## 3.3 Tipografía de la referencia vs. la nuestra

| Rol | Referencia | Corpus (el nuestro — mantener) |
|---|---|---|
| Display | Cormorant Garamond **peso 300**, `-0.01em`, `line-height 1.04` | **Playfair Display** |
| UI | Outfit | **Geist** |
| Datos | JetBrains Mono | **Geist Mono** |

*El mismo reparto de tres voces.* No hay nada que copiar: usa **las nuestras** con su nivel de ambición.
Detalle que sí robamos: el display de la referencia es **peso ligero con tracking negativo** — aplica
esa misma finura a Playfair en los titulares grandes.

## 3.4 ★ Los keyframes exactos de la referencia (cuerpos extraídos del CSS)

Estos son los que dan la sensación "cara". **Tradúcelos a oro y añádelos al kit** (§5). Valores literales:

```css
/* Titular del héroe — revelado en dos escalas */
@keyframes wordReveal { 0%{opacity:0; filter:blur(6px); transform:translateY(24px)} 100%{opacity:1; filter:blur(0); transform:translateY(0)} }
@keyframes charReveal { 0%{opacity:0; filter:blur(4px); transform:translateY(8px)}  100%{opacity:1; filter:blur(0); transform:translateY(0)} }
@keyframes glitter    { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.15)} }   /* brillo lento sobre el oro */
@keyframes scrollPulse{ 0%,100%{opacity:1; transform:scaleY(1)} 50%{opacity:.3; transform:scaleY(.4)} }

/* ★ El detalle firma, barato y elegante: el eyebrow/overline se APRIETA al aparecer */
@keyframes sectionEyebrow { 0%{opacity:0; letter-spacing:.6em} 100%{opacity:1; letter-spacing:.3em} }

/* Hairline que se dibuja bajo cada encabezado */
@keyframes dividerDraw { 0%{transform:scaleX(0)} 100%{transform:scaleX(1)} }

/* ★★ La pantalla de carga: una ceremonia entera (perfecta para la ESPERA DE INGESTA) */
@keyframes letterReveal { 0%{opacity:0; filter:blur(4px); transform:scale(.8)} 100%{opacity:1; filter:blur(0); transform:scale(1)} }
@keyframes ringDraw     { 100%{stroke-dashoffset:0} }                 /* un anillo SVG que se traza */
@keyframes horizonDraw  { 100%{width:min(280px,60vw)} }              /* una línea de horizonte que crece */
@keyframes glowPulse    { 0%,100%{opacity:.4; transform:scale(1)} 50%{opacity:.8; transform:scale(1.1)} }
@keyframes particleRise { 0%{opacity:0; transform:translateY(0) scale(.5)} 20%{opacity:.6} 100%{opacity:0; transform:translateY(-40px) scale(1)} }

/* El botón CTA lanza partículas al pulsarse */
@keyframes sparkFloat   { 0%{opacity:1; transform:translate(0) scale(1)} 60%{opacity:.6} 100%{opacity:0; transform:translate(var(--sx,10px),var(--sy,-30px)) scale(0)} }
```

- **Easing firma real de todo el sitio:** `cubic-bezier(0.16, 1, 0.3, 1)` (easeOutExpo). *(El nuestro
  usa `cubic-bezier(.2,0,0,1)`; puedes adoptar el suyo en las entradas atmosféricas — es más "caro".)*
- **Escalonado de entrada:** `transition-delay` de **80 / 160 / 240 / 320 / 400 ms**.
- **Reveal genérico de tarjeta:** `opacity:0 · filter:blur(3–6px) · translateY(8–30px)` → limpio, en **0.9 s**.

## 3.5 Técnicas de layout que SÍ robamos (baratas y de alto impacto)

1. **Gap-hairline:** rejillas con `gap: 1–2px` sobre fondo oscuro → **el hueco mismo es la línea
   divisoria.** Sin bordes entre tarjetas. Denso, elegante, gratis. *(El build V3 no lo usó; úsalo.)*
2. **Micro-UI real dentro de las tarjetas:** nunca "icono + etiqueta". Pon **el dato en mono**:
   `Go · 412 KB · 3 repos`, la cola real `Item → PASS`, la tabla real. *(El V3 sí lo hizo — mantenlo.)*
3. **El eyebrow como sistema:** overline mono, mayúsculas, `+0.14em`, repetido en **cada** sección —
   **con la animación `sectionEyebrow` de §3.4.**
4. **Botón "forge":** glow con `::before{inset:-6px; filter:blur(14px); opacity:.12→.3}` + un filamento
   luminoso horizontal + `sparkFloat` al pulsar. **Solo en los CTA atmosféricos** (login, onboarding).
5. **Spotlight de tarjeta al hover:** `radial-gradient(400px, rgba(255,255,255,.04), transparent 60%)`
   siguiendo el cursor. Discreto; permitido también en pantallas de trabajo.
6. **Ritmo de sección atmosférico:** `padding: 160px 0`, header 64px sticky con
   `backdrop-filter: blur(4px) saturate(1.5)`. *(Solo en landing / pantallas de lectura.)*

## 3.6 Lo que NO copiamos, y por qué

- ❌ Los **4 acentos**. Nosotros tenemos uno. (Nuestra disciplina es mejor que la suya.)
- ❌ El **texto con degradado** verde→oro. Nuestro oro es *un* oro.
- ❌ **Lenis** (smooth-scroll con inercia). Secuestra el scroll nativo: en una lista de 200 items el
  contenido *resbala* y sobrepasa tu objetivo. **Permitido solo** en `landing` y `ajustes`. Nunca en
  master, editor, staging, dashboard.
- ❌ La **metáfora alquímica** (🜁🜂🜃). La nuestra ya existe y es mejor: *el oro es el metal con que se
  bañan los contactos críticos porque conduce sin corroerse.*

---

# 4 · Qué construir

## 4.1 Las 9 pantallas que faltan + rehacer las 3 que están mal

Para **cada** pantalla entrega: layout a **1440 / 1024 / 390**; estados **vacío / cargando / con
datos / error**; e interacciones clave anotadas. Formato: **un `.html` autocontenido por pantalla**,
CSS en `<style>` y JS en `<script>` inline, fuentes desde Google Fonts CDN. **Se abre con doble clic
y se mueve.** Nada de React, nada de build.

| Pantalla | Capa | Movimiento OBLIGATORIO (cableado al DOM real) |
|---|---|---|
| **`landing`** (nueva) | 🌌 | `wordReveal`+`charReveal` en el titular · `sectionEyebrow` en cada overline · `dividerDraw` por sección · botón forge con `sparkFloat` · aurora en calma · `Lenis` permitido |
| **`auth`** | 🌌 | Aurora en calma (primera impresión) · `sectionEyebrow` · botón forge · el `.c-aurora-gl` **montado** |
| **`onboarding`** | 🌌 | Las **dos puertas simétricas** (A: desde cero/plantilla, sin IA · B: con IA desde fuentes) · aurora · `c-hairline[data-state=active]` al elegir |
| **`ingesta`** ★ | 🌌 | **La ceremonia de carga completa** (§5.2): `CANON.aurora.setActive(true)` + `letterReveal`/`ringDraw`/`horizonDraw`/`glowPulse`/`particleRise` · `c-thinking` · progreso **honesto y específico** ("Leyendo página 2 de 3…") · **jamás un % inventado** |
| **`staging`** ★ | 🛠️ | Al terminar: `CANON.stagger(items)` + `CANON.countTo()` + `CANON.shimmer()` **una vez** · `c-confirm`/`c-dismiss` · `c-unverified` en lo no demostrable · fusión de duplicados · **muro** |
| **`master`** | 🛠️ | `c-divider` por sección (vía IntersectionObserver, una vez) · la **skill con evidencia** · edición inline · **cero scroll-reveal con 200 items** · **muro** |
| **`editor-variante`** | 🛠️ | **Mantén el x-ray blur-in** (ya funciona) · añade `c-override` (arista dorada) y `c-panel-in` al cambiar de variante · **el editor es sagrado** (aurora en pausa) · **muro** |
| **`fuentes`** | 🛠️ | GitHub OAuth · **selector de repos** · portfolio · LinkedIn (capturas) · estado de sync · **lo nuevo va a staging, nunca al master** |
| **`tailoring`** | 🛠️ | Los **tres grupos** (ya está / lo tienes en el master → 1 clic / **no lo tienes → NO ofrecer añadirlo**) · original ⇄ propuesto lado a lado · `c-pending` · `c-unverified` |
| **`salud`** | 🛠️ | **Sin score, sin barras, sin umbrales.** Solo lo que **puede fallar** (no listes los ✓ que el renderer garantiza por construcción) · `c-hairline` |
| **`ajustes`** | 🛠️ | Idioma · tema · **toggle global de IA** (y cómo se ve todo con la IA apagada) · BYOK · exportar todo · borrar todo · `.c-doc` (único sitio con scroll-reveal permitido) |
| **`dashboard`** (rehacer) | 🌌 vacío / 🛠️ denso | Vacío (día 1): aurora + ceremonia ligera. Denso (200 items, 7 variantes): `c-divider` por encabezado · `c-hairline` en tarjetas · `c-pending` en variantes desactualizadas · `c-skeleton` al cargar fuentes · **muro · cero scroll-reveal** |
| **`componentes`** (rehacer) | — | Galería que **demuestra en vivo** confirm/dismiss/stagger/shimmer/hairline-state/skeleton/thinking. Y arregla la fuga de color (§7.2). |

## 4.2 Componentes que faltan
Skill con evidencia ★ · tarjeta de fuente conectada · selector de repos de GitHub · toggle global de
IA (con la IA **apagada**) · niveles de verificación (`verificado` / `parcial` / `sin evidencia`).

---

# 5 · La doctrina de movimiento, en detalle

## 5.1 Reglas mecánicas — no negociables

1. **Copia `canon-motion.css` y `canon-motion.js` íntegros dentro de CADA `.html`** (inline). **No los
   reescribas, no los "mejores", no los resumas.** Si algo no calza, dilo — no lo cambies a escondidas.
2. **Usa los nombres de clase tal cual** (`c-stagger`, `c-divider`, `c-xray`, `c-hairline`, `c-pending`,
   `c-unverified`, `c-override`, `c-skeleton`, `c-thinking`, `c-shimmer`, `c-aurora-gl`…). Son el
   **contrato con ingeniería**: al portar a React, las clases y la API `window.CANON` **no cambian.**
3. **Cablea, no decores.** Cada `@keyframes` que definas debe estar **aplicado a un `class=""` real**
   o invocado desde JS **sin comentar**. Un keyframe huérfano = entrega rechazada (§8).
4. **La API se INVOCA:** `CANON.stagger(lista)` · `CANON.shimmer(el,'ingesta')` · `CANON.countTo(el,n)`
   · `CANON.confirm(el)` / `CANON.dismiss(el)` · `CANON.aurora.setActive(true|false)` ·
   `CANON.aurora.pause()`. En `staging` e `ingesta` tienen que **ejecutarse de verdad** al cargar/actuar.

## 5.2 ★ La ceremonia de la ingesta (la pantalla que decide si el producto deslumbra)

Es la traducción a oro de la pantalla de carga de la referencia. Extraer con un LLM tarda 5–40 s: ese
tiempo es una **oportunidad**, no un problema. Móntala así:

- Fondo: `.c-aurora-gl` montado + `CANON.aurora.setActive(true)` → el humo **se agita** en oro.
- Un **anillo SVG que se traza** (`ringDraw`) + una **línea de horizonte que crece** (`horizonDraw`)
  + **partículas doradas que suben** (`particleRise`) + **pulso de brillo** (`glowPulse`).
- El título/estado entra con `letterReveal`.
- **Progreso específico y verdadero:** "Leyendo página 2 de 3…", "Encontré 4 experiencias…",
  "Detecté 23 skills…". El contador sube con `CANON.countTo()`. **Nunca un porcentaje inventado.**
- Al terminar → vas a `staging`, y **ahí** cae el **único shimmer del producto** (`CANON.shimmer()`)
  mientras los items se pueblan con `CANON.stagger()`.

## 5.3 La escala de ceremonia (de `motion.md`, respétala)

| Ceremonia | Frecuencia | Presupuesto | Ejemplos |
|---|---|---|---|
| **0 · Instantáneo** | decenas/día | **0–80 ms**, solo color/opacidad | editar viñeta, mostrar/ocultar, reordenar |
| **1 · Confirmación** | varias/sesión | **120–200 ms** | aceptar item, añadir a variante, revertir override |
| **2 · Transición** | pocas/sesión | **250–400 ms** | cambiar de variante, el blur-in del x-ray |
| **3 · Ceremonia** | una vez cada mucho | **600–1200 ms** | terminar una ingesta → escalonado + shimmer |

**Prohibido:** scroll-reveal en pantallas de trabajo · animar mientras se escribe · animar
`width`/`height`/`top`/`box-shadow` en listas · un shimmer que salga dos veces · un spinner que gire
("se colgó" — usa `c-breathe`).

---

# 6 · Accesibilidad (piso, no techo)

- **WCAG 2.1 AA.** Respeta los contrastes ya verificados en `tokens.css`; no introduzcas pares nuevos
  sin calcular el ratio.
- Foco visible **siempre** con el `focus-ring` dorado. Nunca `outline:none` sin reemplazo.
- El editor de 3 paneles, **operable por teclado**, incluido el reordenamiento (drag con alternativa
  de teclado — requisito, no extra).
- **`prefers-reduced-motion` en TODO**, con **equivalencia que preserva la información** — no un
  `*{animation:none}` que borre la señal. Cada estado (confirm/dismiss/hairline/skeleton) mantiene su
  significado sin moverse.
- Estados de IA anunciados a lectores de pantalla (`aria-live`).
- **Nunca información solo por color:** confianza, override, "no verificado" llevan **segunda señal**
  (forma, texto, posición).

---

# 7 · Correcciones puntuales al build actual (hazlas, son baratas)

1. **Promueve `#050508` a token** `--obsidian-deep` en `tokens.css`/`tokens.json` (hoy solo vive como
   fallback inline). Es el sustrato del 85% de la app y de todo el sistema ventana/muro.
2. **Fuga de color en `componentes.html`:** los puntos de lenguaje de GitHub usan hex de colores
   (`#79c0ff`, `#3572A5`, `#844FBA`, `#2b7489`, `#89e051`, `#f1e05a`). **Renderízalos en gris o en oro
   monocromo.** Es el único sitio donde entra azul/verde/morado en la UI — y es justo la queja #1.
3. **Deriva del token `danger`:** las pantallas escriben `var(--danger,#C6544B)` pero el token es
   `#C4453A`. **Unifica en `#C4453A`** (o corrige el token). Un solo rojo "danger".
4. **Defecto del golden file:** en `datos-ejemplo.json`, el `masterHealth` `h-nometric` advierte de
   "3 viñetas sin cifra" pero apunta a viñetas marcadas `hasMetric:true`. **Corrige la contradicción**
   (o el flag, o la advertencia) para que el test de CI del §7 de `ESPECIFICACION.md` no falle.
5. **`editor-variante.html`:** elimina el `@keyframes dividerDraw` local que se dispara en cada carga
   (viola la regla C1 "nunca dos veces por sesión") y el `.pulse` muerto. Usa el `c-divider` canónico
   con su `IntersectionObserver` y guarda de una-vez.
6. **No embebas shader muerto:** si una pantalla no monta el aurora, **no** inlinees los ~130 líneas
   de `canon-aurora.js` en ella.

---

# 8 · ★ LA BATERÍA DE VALIDACIÓN — la voy a ejecutar sobre tu entrega

Esto reemplaza al viejo `grep -c "@keyframes"`. **Cada gate asierta USO en el DOM real, no presencia.**
Corre desde `canon-design/`. **Si un gate falla, la entrega se rechaza** — no es amenaza, es el
criterio, y ya pasó una vez por no tenerlo.

```bash
cd canon-design

# GATE 1 — Las 11 pantallas EXISTEN como archivo
for s in auth onboarding ingesta staging master fuentes tailoring salud ajustes dashboard editor-variante; do
  test -f "04-pantallas/$s.html" && echo "OK $s" || echo "❌ FALTA $s"
done   # → cero "FALTA"

# GATE 2 — Keyframes DEFINIDOS == USADOS (0 huérfanos). Cierra el agujero "dormido".
for f in 04-pantallas/*.html 03-componentes/*.html; do
  for k in $(grep -oE '@keyframes [A-Za-z0-9_-]+' "$f" | awk '{print $2}'); do
    u=$(grep -E "animation(-name)?:[^;]*\b$k\b" "$f" | grep -vc '@keyframes')
    [ "$u" -eq 0 ] && echo "❌ $f HUÉRFANO:$k"
  done
done   # → cero HUÉRFANO

# GATE 3 — El aurora MONTA en DOM real en las pantallas atmosféricas (no basta el CSS)
for f in 04-pantallas/{auth,onboarding,ingesta}.html; do
  echo "$f = $(grep -oE 'class="[^"]*c-aurora-gl' "$f" | wc -l)"   # → cada uno >= 1
done

# GATE 4 — La ceremonia de ingesta/staging se DISPARA (clase real + llamada sin comentar)
for f in 04-pantallas/{ingesta,staging}.html; do
  dom=$(grep -oE 'class="[^"]*c-stagger\b' "$f" | wc -l)
  call=$(grep -E 'CANON\.(stagger|shimmer)\(' "$f" | grep -vcE '^\s*(//|\*)')
  echo "$f dom=$dom call=$call"   # → al menos una host con dom>=1 y call>=1
done

# GATE 5 — reduced-motion por pantalla
for f in 03-componentes/*.html 04-pantallas/*.html; do echo "$f=$(grep -c 'prefers-reduced-motion' "$f")"; done  # → todas >= 1

# GATE 6 — Tres breakpoints por pantalla (1440 / 1024 / 390)
for f in 04-pantallas/*.html; do echo "$f=$(grep -cE '1024px|390px|48rem|24rem' "$f")"; done  # → todas >= 2 media queries de layout

# GATE 7 — El x-ray sigue cableado en el editor (guarda contra regresión)
grep -c 'data-xray-toggle' 04-pantallas/editor-variante.html   # → >= 1

# GATE 8 — Pureza de paleta: ningún hex fuera del set oro/obsidiana/porcelana/metal
grep -rhoE '#[0-9A-Fa-f]{6}' 03-componentes/*.html 04-pantallas/*.html 02-sistema/*.css 02-sistema/*.js \
 | tr 'a-f' 'A-F' | sort -u \
 | grep -vE '#(F6E2A2|E7C24F|D4AF37|8A6414|5C450F|1A1206|0B0B0D|141418|1C1C22|0E0E11|050508|F5F5F2|B4B4AD|82827B|FAFAF7|FFFFFF|F1F1EC|17171A|45454A|6E6E72|C4453A|B87333|ADB6C2)'
# → salida vacía. Cada hex superviviente necesita una exención humana explícita.

# GATE 9 — Sin número sin fuente en copy.md
grep -nE '[0-9]+([.,][0-9]+)?(x|×|%)' 06-handoff/copy.md | grep -viE '\.src|fuente|source|Jobscan|GitHub|uptime'  # → vacío

# GATE 10 — Los 3 archivos de handoff existen
for f in 06-handoff/{copy.md,handoff.md,criterios-aceptacion.md}; do test -f "$f" && echo "OK $f" || echo "❌ FALTA $f"; done
```

## 8.1 La rúbrica humana (lo que no se puede grepear — la reviso a ojo)

1. **La ceremonia se ve al cargar.** Abro `ingesta`/`staging` (sin reduced-motion): ¿los items entran
   escalonados y el shimmer cae **exactamente una vez**? Una pantalla estática que pase los greps
   **falla aquí**.
2. **El aurora está vivo y es metálico.** En las pantallas ventana el humo se mueve en oro/cobre/plata
   sobre obsidiana, reacciona al cursor, y **se pausa al escribir en el editor**.
3. **Disciplina de un-oro a la vista.** El oro es el único acento interactivo; los tres metales, solo
   atmósfera. Cualquier croma no-oro en la UI es una violación de la queja #1.
4. **App bella / documento sobrio.** Las pantallas se sienten atmosféricas; el CV exportado es una
   columna, gris, ATS, y **no se mueve.** Se entiende **por qué son distintos.**
5. **reduced-motion preserva la información**, no la borra.
6. **El copy es sobrio y con evidencia.** Sin coach, sin gamificación, sin score inventado.
7. **Referencia emulada, no copiada.** Se siente informada por `alkemymarket.com` (micro-UI, secciones
   numeradas serif, humo ventana/muro, el blur-in del x-ray) **rechazando** la landing genérica, los
   4 acentos y el texto degradado.
8. **Faltante-por-diseño vs. por-negligencia.** Cada ausencia tiene una decisión escrita en
   `criterios-aceptacion.md` — o es deuda, no diseño.

---

# 9 · Lo que NO cambia

- El **documento CV**: como está. **No se mueve: es papel.**
- **Un** acento en la UI. El oro es escaso, intencional, luminoso. Los tres metales viven **solo en la
  atmósfera** del shader. **Atmósfera ≠ señal.**
- **La IA nunca inventa. Ningún número sin fuente.**
- **Nada se mueve mientras el usuario escribe. El editor es sagrado.**
- **Diseña para la dignidad.** Nuestro usuario entra un martes a las 11 de la noche, tras la sexta
  postulación rechazada del mes. No necesita deslumbrarse: necesita que la herramienta sea rápida,
  clara, y **no le haga perder el tiempo con animaciones que ya vio.** El lujo, aquí, es que se sienta
  cara **y no se note que se esforzó.**

---

# 10 · Cómo trabajar

Pregúntame solo lo que **de verdad** cambie el diseño. Para las dudas de producto, vuelve a
`00-INVESTIGACION.md`: casi todas las respuestas están ahí, respaldadas.

Abre tu propia pantalla y **usa el botón cinco veces seguidas.** Si a la tercera te molesta, está mal
— por bonito que sea.

> **Cierra el diseño. Esta vez, que se mueva de verdad.**
