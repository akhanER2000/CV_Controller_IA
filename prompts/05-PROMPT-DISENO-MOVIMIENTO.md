# PROMPT 05 — CERRAR EL DISEÑO: MOVIMIENTO Y PANTALLAS QUE FALTAN
## Para: la MISMA sesión de Claude Design (Opus 4.8)
## ⚠️ Adjunta también: `canon-motion.css`, `canon-motion.js`, **`canon-aurora.js`**
##    y `ANALISIS-REFERENCIA.md` (el análisis forense de la referencia)

---

# 0 · Lo que pasó, sin rodeos

Audité la V2. Los números:

| Archivo | `@keyframes` | Veredicto |
|---|---|---|
| `04-pantallas/dashboard.html` | **0** | **La pantalla principal del producto no tiene una sola animación.** |
| `03-componentes/componentes.html` | **1** (`pulse`) | Prácticamente estático |
| `04-pantallas/editor-variante.html` | **2** (`dividerDraw`, `pulse`) + el blur-in del toggle ATS | ★ El único que sí hizo el trabajo |

Y faltan **7 pantallas** (onboarding, fuentes, staging, master, tailoring, salud, ajustes, auth) y
**todo `06-handoff/`** — incluido `copy.md`, que declaré obligatorio dos veces.

**El fallo es mío, no tuyo.** Te describí las animaciones en prosa ("una hairline que se dibuja") y
esperé que las materializaras. Eso no funciona: **una animación no se transmite en prosa, se
transmite en código.**

Así que esta vez no te describo nada. **Te entrego la librería, funcionando y verificada.**

---

# 1 · El kit de movimiento — ya está hecho

Adjunto dos archivos. **No son una propuesta ni una referencia: son la implementación.**

| Archivo | Qué contiene |
|---|---|
| **`canon-motion.css`** | Los **11 keyframes** del producto, la escala de ceremonia, el hairline dorado como sistema de estados, el blur-in del toggle ATS, el shimmer único, y el bloque `prefers-reduced-motion` completo con la equivalencia de cada efecto |
| **`canon-motion.js`** | El motor: `IntersectionObserver` para la hairline (con guarda de "una sola vez"), el escalonado con tope, el shimmer autolimitado, el toggle rayos-X, el contador honesto, y las live regions para lectores de pantalla |
| **`canon-aurora.js`** ★ | **El fondo vivo.** Shader WebGL2 (fBm + domain warping) en oro sobre obsidiana |

Usa los tokens que **ya existen** en tu `02-sistema/tokens.css` (`--dur-*`, `--ease-*`, `--gold-*`,
`--border-gold`). No inventé ninguno. Verificado: 11 keyframes definidos, 11 usados, 0 huérfanos; JS
válido; todas las clases resueltas.

## Los 11 keyframes, y dónde va cada uno

| Keyframe | Ceremonia | Dónde vive | Dónde **NO** |
|---|---|---|---|
| `c-rise` (+ `.c-stagger`) | **3** | ★ Los items poblándose al terminar la ingesta | En ningún otro sitio |
| `c-shimmer` | **3** | ★ **El único shimmer.** Al terminar la extracción | Se autolimita: la 2ª llamada avisa por consola y no hace nada |
| `c-divider-draw` | 1 | La hairline bajo cada encabezado de sección | Nunca dos veces en la misma sesión |
| `c-confirm` | 1 | Aceptar un item en staging | — |
| `c-dismiss` | 1 | Descartar / quitar de la variante | — |
| `c-glow-in` | 0 | El halo del elemento activo | Máximo **uno** por vista |
| `c-panel-in` | 2 | Cambio de panel / de variante | — |
| `c-breathe` | — | "Pensando…" | **No uses spinner.** Un spinner que gira dice "se colgó" |
| `c-skeleton` | — | Mientras se extrae | Barrido de oro apagadísimo, no el gris de Bootstrap |
| `c-pending` | — | Propuesta de IA pendiente | Pulso lento (2,4 s): pide atención con educación, no a gritos |
| `c-drift` (`.c-aurora`) | — | Aurora CSS ligera (cajas pequeñas) | — |

## ★ El fondo vivo — `canon-aurora.js`

**Me equivoqué al rechazarlo, y tú tenías razón al insistir.** Fui a la referencia y desmonté el
humo: **es un shader WebGL2**, y el buffer que renderizan es de **300 × 150 píxeles** escalados a
1920. Están pintando el fondo a una resolución ridícula y ampliándolo — y funciona, porque **el humo
no tiene bordes duros**. Mi objeción era el coste, y **con ese truco el coste es casi cero**.

Así que está construido. **`canon-aurora.js`** — shader propio, fBm con *domain warping* (la técnica
de Inigo Quilez: alimentar el ruido consigo mismo, de ahí salen los remolinos), **en oro sobre
obsidiana**. No es el suyo. El suyo tiene cuatro acentos; el nuestro tiene **uno**.

```html
<div class="c-aurora-gl" data-aurora="calm"></div>
<script src="canon-aurora.js"></script>
```

**Y hace algo que el suyo no hace: significa.**

```js
CANON.aurora.setActive(true)   // la IA se pone a trabajar → el humo se agita, el oro sube
CANON.aurora.setActive(false)  // termina → se calma
CANON.aurora.pause()           // el usuario está escribiendo → SE DETIENE. El editor es sagrado.
```

> **Un fondo que no comunica nada no tiene derecho a moverse.** El nuestro comunica: es el pulso de
> la máquina pensando.

**Por qué no duele:** buffer a 1/4 de resolución (tope 480 px) · **30 fps**, no 60 · pestaña oculta =
cero trabajo · `prefers-reduced-motion` o sin WebGL2 → degradado estático de la misma paleta.

**Dónde vive:** login · onboarding · **la espera de la ingesta** · el dashboard vacío del día 1.
**Nunca** detrás del editor de variante, del master con 200 items, ni del documento. Ahí compite con
el trabajo, y **el trabajo gana siempre**.

## ⚠️ Y una cosa de la referencia que hay que NO copiar: Lenis

Usan **Lenis** (`<html class="lenis">`) para el smooth-scroll con inercia. Es de donde sale buena
parte de la sensación "cara" al bajar por su página.

**No lo copies en la app.** El smooth-scroll secuestra el scroll nativo. En una landing que bajas una
vez es un lujo; en una herramienta donde recorres 200 items buscando una viñeta, el contenido
"resbala" y **sobrepasa tu objetivo**. Molesta a la tercera vez.

**Permitido solo** en pantallas de lectura (ajustes, "cómo funciona"). Nunca en master, editor,
staging ni dashboard.

**Y el efecto que no es un keyframe, sino el corazón del producto:**

```css
.c-xray[data-mode="raw"] .c-xray__doc{ opacity:0; filter:blur(12px) saturate(0); }
.c-xray[data-mode="raw"] .c-xray__raw{ opacity:1; filter:blur(0)   saturate(1); }
```

El PDF se desenfoca, **pierde el color**, y del desenfoque **resuelve el texto crudo del parser**.
No es decoración: **es la metáfora del producto.** Así te ve la máquina, sin la ropa. Es el
screenshot que se comparte en LinkedIn.

---

# 2 · Qué tienes que hacer con esto

## 2.1 Reglas mecánicas, no negociables

1. **Copia `canon-motion.css` y `canon-motion.js` íntegros dentro de CADA `.html`** que entregues
   (en `<style>` y `<script>` inline — los archivos tienen que abrirse con doble clic y moverse).
   **No los reescribas. No los "mejores". No los resumas.** Si algo no calza, dilo, no lo cambies a
   escondidas.
2. **Usa los nombres de clase tal cual.** `c-stagger`, `c-divider`, `c-xray`, `c-hairline`,
   `c-pending`, `c-unverified`, `c-override`, `c-skeleton`, `c-thinking`, `c-aurora`. Son el
   **contrato con ingeniería**: cuando esto se porte a React, las clases y la API de `window.CANON`
   **no cambian**.
3. **Cada pantalla tiene que MOVERSE al abrirla.** No un mockup con una nota que diga "aquí va una
   animación". Si la abro con doble clic y no se mueve, está mal.
4. **Guárdala en `02-sistema/` como parte del sistema**, y reescribe `motion.md` para que documente
   *esto* — la escala de ceremonia, el mapa, y la equivalencia reduce-motion de cada efecto.

## 2.2 Dónde va cada cosa, pantalla por pantalla

| Pantalla | Movimiento obligatorio |
|---|---|
| **Dashboard** *(hoy tiene CERO — es la principal)* | `c-divider` en cada encabezado de sección · `c-hairline` en todas las tarjetas · `c-pending` en las variantes desactualizadas · `c-skeleton` mientras cargan las fuentes · **cero scroll-reveal** |
| **Onboarding** | Las dos puertas, simétricas. `c-hairline[data-state=active]` al elegir. |
| **Espera de la ingesta** ★ | **`canon-aurora.js` con `data-aurora="active"`** — el humo agitado mientras la IA piensa · `c-thinking` · progreso **honesto y específico** ("Leyendo página 2 de 3…") · **nunca un porcentaje inventado** |
| **Login / auth** | `canon-aurora.js` en calma. Es la primera impresión del producto. |
| **Staging** ★ | `CANON.stagger()` al poblarse · `CANON.countTo()` en el contador · `CANON.shimmer()` **una vez** · `c-confirm` / `c-dismiss` al aceptar/descartar · `c-unverified` en lo que la IA no puede demostrar |
| **Master** | `c-divider` por sección · `c-hairline` · la **skill con evidencia** · **cero scroll-reveal aunque haya 200 items** |
| **Editor de variante** ★ | Ya lo hiciste bien. **Mantén el blur-in.** Añade `c-override` (arista dorada izquierda) y `c-panel-in` al cambiar de variante. |
| **Tailoring** | `c-pending` en cada propuesta · original ⇄ propuesto lado a lado · `c-unverified` en lo que no tiene `item_id` |
| **Salud** | Sin barras, sin score. `c-hairline` y listas concretas. |
| **Ajustes** | `.c-doc` + `c-reveal` (**el único sitio donde el scroll-reveal está permitido**) |

## 2.3 La prueba que tienes que pasar (y que voy a correr)

Voy a ejecutar esto sobre tu entrega:

```bash
# Cada pantalla debe traer la librería completa y usarla.
for f in 03-componentes/*.html 04-pantallas/*.html; do
  grep -c "@keyframes" "$f"      # ≥ 11 en todas
  grep -c "prefers-reduced-motion" "$f"   # ≥ 1
  grep -c "IntersectionObserver" "$f"     # ≥ 1
done
# Y en staging: CANON.stagger, CANON.shimmer, CANON.countTo
# Y en editor-variante: data-xray-toggle + filter:blur
```

**Si el dashboard vuelve a tener 0 keyframes, la entrega se rechaza.** No es una amenaza, es un
criterio de aceptación: ya pasó una vez y no puedo verificarlo leyendo prosa.

---

# 3 · Lo que falta, además del movimiento

## 3.1 Pantallas (7 + auth)
`onboarding` · `fuentes` (GitHub OAuth + selector de repos + portfolio + LinkedIn) · `staging` ·
`master` · `tailoring` · `salud` · `ajustes` · `auth`.
A **1440 / 1024 / 390**, con estados **vacío / cargando / con datos / error**.

**Y el dashboard en sus dos extremos:** vacío (día 1, nada) y denso (200 items, 7 variantes, 4
fuentes). Los dos tienen que verse bien.

## 3.2 `06-handoff/` — no lo has entregado y es obligatorio

- **`copy.md`** — **TODO el copy, ES + EN.** Te lo he pedido dos veces. Sin esto, ingeniería lo
  improvisa y **va a sonar a Jobscan**. El copy de este producto *es* el producto:

  > ❌ *"Faltan 7 keywords — tu match es 62%"*
  > ✅ *"El aviso pide Kubernetes. No aparece en tu master. ¿Lo has usado y no lo registraste, o es una brecha real?"*

  Escribe línea por línea: los tres grupos del tailoring, los estados vacíos, los errores, el
  "sin evidencia", el dashboard del día 1, los mensajes de progreso de la ingesta.

- **`handoff.md`** · **`criterios-aceptacion.md`** (solo criterios de **diseño**: visual, copy,
  interacción, a11y — los técnicos son de ingeniería).

## 3.3 Componentes que faltan
Tarjeta de skill con evidencia ★ · tarjeta de fuente conectada · selector de repos de GitHub ·
toggle global de IA (y cómo se ve todo con la IA **apagada**) · niveles de verificación
(`verificado` / `parcial` / `sin evidencia`).

---

# 4 · La vara

Abre tu propia pantalla y **usa el botón cinco veces seguidas**. Si a la tercera te molesta, está
mal — por bonito que sea.

> **Una animación se gana su lugar si comunica un cambio de estado que el usuario necesita entender.
> Si solo decora, se borra.**
>
> **Cuanto más frecuente es la acción, más corta debe ser — hasta desaparecer.**
> Guardar una viñeta (40 veces al día) = **0 ms**. Terminar de ingerir tu LinkedIn (2 veces en la
> vida) = **el shimmer entero**.

Y lo que sigue mandando por encima de todo:

- La app es **bellísima**. El documento es **sobrio**. El documento **no se mueve: es papel.**
- **Un** acento. El oro es escaso, intencional y luminoso.
- **La IA nunca inventa. Ningún número sin fuente.**
- **Nada se mueve mientras el usuario escribe.** El editor es sagrado.

---

> Nuestro usuario entra un martes a las 11 de la noche, después de la sexta postulación rechazada del
> mes, a adaptar su CV otra vez.
>
> No necesita deslumbrarse. Necesita que la herramienta sea rápida, clara, y que **no le haga perder
> el tiempo con animaciones que ya vio.**
>
> El lujo, aquí, es que se sienta cara **y no se note que se esforzó.**
>
> **Cierra el diseño.**
