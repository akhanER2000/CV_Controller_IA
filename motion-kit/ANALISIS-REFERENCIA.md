# Análisis forense de alkemymarket.com
## Todo lo que hace, cómo lo hace, y qué nos llevamos

> No es de oídas. Abrí la página, inspeccioné el DOM, extraje el CSS computado y
> localicé el contexto de render. Cada línea de aquí está verificada en el navegador.

---

# 1 · El fondo de humo — QUÉ ES REALMENTE

**Es un shader WebGL2.** Punto. No es un GIF, ni un vídeo, ni un `feTurbulence` de SVG, ni una
imagen. Lo confirmé:

```
canvas count: 1  ·  contexto: WEBGL2
contenedor: <div> position:fixed · inset:0 · z-index:0 · pointer-events:none
feTurbulence: 0  ·  videos: 0  ·  background-image url(): ninguno
THREE: false · OGL: false   (va empaquetado, sin librería 3D expuesta)
```

## ★ El hallazgo que lo cambia todo: el buffer es de **300 × 150 píxeles**

```
<canvas> buffer = 300x150   →  escalado a 1920x901
```

**Están renderizando el humo a una resolución ridícula y escalándolo.** Y funciona, porque **el humo
no tiene bordes duros**: al ampliarlo, la interpolación bilineal lo difumina y nadie nota nada. La
GPU apenas trabaja.

Ese era exactamente mi miedo cuando dije que un fondo animado era caro — y **estaba equivocado sobre
el coste**. Con este truco, un fondo vivo cuesta prácticamente nada. **Tenías razón en insistir.**

## La técnica del shader: fBm + domain warping

Los remolinos no salen de un ruido normal. Salen de **alimentar el ruido consigo mismo**
(*domain warping*, la técnica de Inigo Quilez):

```
q = fbm(uv)              →  primera distorsión
r = fbm(uv + 4·q)        →  el ruido distorsiona su propio dominio
f = fbm(uv + 4·r)        →  y otra vez  →  remolinos, filamentos, humo
```

Eso es todo. ~40 líneas de GLSL. **Ya lo implementé en `canon-aurora.js`.**

## ★★ El "blackout": no es lo que parece, y es más elegante

Tú lo describiste como *"se agrega un tipo blackout sobre el fondo, pero igual uno aprecia el
movimiento del humo"*. Fui a mirar **el fondo de cada sección, una por una**. El resultado:

```
🔓 VENTANA   HeroSection           bg = rgba(0,0,0,0)   ← transparente
🧱 MURO      AudienceSection       bg = rgb(5,5,8)
🧱 MURO      TransmutationSection  bg = rgb(5,5,8)
🔓 VENTANA   FeaturesSection       bg = rgba(0,0,0,0)   ← aquí ves el humo
🔓 VENTANA   SpeedSection          bg = rgba(0,0,0,0)
🧱 MURO      ProofSection          bg = rgb(5,5,8)
🔓 VENTANA   PricingSection        bg = rgba(0,0,0,0)
🧱 MURO      PhilosophySection     bg = rgb(5,5,8)
🔓 VENTANA   CompareSection        bg = rgba(0,0,0,0)
🔓 VENTANA   CostCalculatorSection bg = rgba(0,0,0,0)
🧱 MURO      FinalCTASection       bg = rgb(5,5,8)

contenedor de página: bg = rgb(5,5,8)   ← OPACO
```

**No hay ningún velo encima del humo.** Es al revés:

1. El humo vive en una capa **fija al fondo** (`z-index: 0`), a pantalla completa.
2. El contenedor de página es **opaco** (`#050508`). Eso lo **tapa**.
3. Algunas secciones se declaran **transparentes** → son **ventanas** por las que el humo asoma.

Al bajar, el humo **aparece y desaparece en un ritmo**. El fondo **respira**. Y donde hay algo que
leer, **hay muro**.

**Ese es todo el secreto, y es exactamente la respuesta a "¿cómo hago que no estorbe al dashboard?"**
→ implementado en `canon-aurora.css`: `.c-window` · `.c-wall` · `.c-scrim` · `.c-panel`.

---

# 2 · Inventario completo de movimiento (verificado en su CSS)

| Nombre real | Qué hace | ¿Nos lo llevamos? |
|---|---|---|
| **Shader WebGL2** | El humo de fondo | ✅ **SÍ** → `canon-aurora.js`, en oro sobre obsidiana |
| **`dividerDraw`** | Una hairline con degradado que **se dibuja** en el `::before` de **CADA sección**, 1 s | ✅ **SÍ** → `c-divider` (ya estaba) |
| **`fade-in` + `slide-in-up`** | Entrada escalonada de contenido | ✅ **SÍ** → `c-stagger` / `c-rise` |
| **blur-in en titulares** | El título entra desenfocado y **resuelve** | ✅ **SÍ** → y le encontré el mejor sitio posible: el toggle **"Cómo lo lee el ATS"** |
| **`shimmer-sweep`** | Barrido de luz sobre una superficie | ✅ **SÍ** → `c-shimmer`, pero **UNO solo en todo el producto** |
| **`gradient-flow`** | Degradado que se desplaza | ⚠️ Solo dentro del shader |
| **`glow-spin`** | Halo que gira lento | ✅ Adaptado → `c-glow-in` (sin girar: girar dice "cargando") |
| **`pulse`** | Latido de atención | ✅ → `c-pending`, mucho más lento (2,4 s) |
| **`fadeSlideIn`** | Entrada de tarjetas del dashboard | ✅ → `c-panel-in` |
| **Lenis** (`<html class="lenis">`) | **Smooth scroll con inercia.** Es de dónde sale la sensación "cara" al bajar. | ⚠️ **Ver §5. Es la decisión difícil.** |
| **Hairlines de sección con degradado de color** | Cada sección tiene su color de acento en la línea superior | ❌ **NO.** Ellos tienen 4 acentos. Nosotros **uno**. |

---

# 3 · Estructura y composición (lo que no es animación pero hace el trabajo)

## 3.1 El ritmo de sección — repetido como una métrica poética

```
┌ hairline con degradado, que SE DIBUJA al entrar     ← dividerDraw
│
│  OVERLINE          (mono · MAYÚSCULAS · tracking +0.14em · color apagado)
│
│  Titular serif grande, con UNA palabra en negrita
│
│  Lede de una línea, gris
│
│  Contenido
└
```

**Ya tenemos ese token `overline` definido en `tipografia.md` y no lo estamos usando como sistema.**
Ellos lo repiten en cada sección y es la mitad del ritmo.

## 3.2 ★ Las tarjetas contienen UI REAL, no iconos

La mejor idea de toda la página, y no usa ni una animación:

| No ponen… | Ponen… |
|---|---|
| Un icono de camión + "Envíos multi-carrier" | `USPS Priority · 6-10d · $18.40` / `UPS Saver · 3-5d · $32.10` — **la tabla real, en mono** |
| Un escudo + "Moderación con IA" | La **cola real**: `Cedar Bowl → PASS` · `Import Item → REVIEW` · `Widget Pack → REJECT` |
| Un gráfico + "Analytics" | Las cifras: `96% win rate` · `$840 recuperados` |
| Un icono + "Site builder" | Los **bloques arrastrables**: `⋮⋮ Hero` `⋮⋮ Products` `⋮⋮ Gallery` |

**Es imposible de fingir: solo puedes enseñar la UI de tu producto si tu producto existe.**

## 3.3 La tabla comparativa con cifras citadas

Comparan sus comisiones contra Etsy, Shopify y Amazon **desglosando cada fee**, sacado de la
documentación pública de cada plataforma. *"En una venta de $50, Alkemy se lleva $4,25. Etsy $14,52.
Amazon FBA $18,07."*

**Es la parte más persuasiva del sitio y no tiene una sola animación.** Y es exactamente nuestra
ética: no afirmamos, demostramos.

## 3.4 Tipografía — el hallazgo incómodo

| | Alkemy | CANON (ya lo teníamos) |
|---|---|---|
| Display | Cormorant Garamond | **Playfair Display** |
| UI | Outfit | **Geist** |
| Datos | JetBrains Mono | **Geist Mono** |
| Fondo | casi negro | **Obsidiana `#0B0B0D`** |

**El mismo reparto de tres voces.** No hay nada que copiar: hay que **usar** lo que ya tenemos con
su nivel de ambición.

---

# 4 · Lo que NO nos llevamos, y por qué

- ❌ **La paleta multicolor.** Verde esmeralda + púrpura + carmesí + oro. Cada sección con su color.
  Nosotros tenemos **un** acento, y esa disciplina es **mejor que la suya**. El oro escaso es una
  regla más fuerte que cuatro acentos bonitos.
- ❌ **El texto con degradado** (verde→oro en el titular). Nuestro oro es *un* oro.
- ❌ **La iconografía alquímica** (🜁🜂🜃, "Dissolution/Conjunction/Projection"). Es **su** metáfora y
  es buena. La nuestra ya existe y es mejor para nosotros: *el oro es el metal con que se bañan los
  contactos críticos porque conduce sin corroerse.* No la cambiemos por una prestada.
- ❌ **Todo el género.** Es una **landing**. Nosotros matamos la landing. Su movimiento existe para
  **vender**; el nuestro tiene que existir para **trabajar**.

---

# 5 · La decisión difícil: **Lenis** (smooth scroll)

Es de donde sale buena parte de la sensación "cara" de su página: el scroll tiene inercia, se desliza.

**Y es la única cosa de esa página que recomiendo NO copiar, aunque sea la más tentadora.**

Razón: el smooth-scroll con inercia **secuestra el scroll nativo del sistema operativo**. En una
landing que bajas una vez, es un lujo. En una **herramienta de trabajo** donde recorres una lista de
200 items buscando una viñeta concreta, es **exactamente lo contrario a lo que quieres**: el
contenido "resbala" y sobrepasa tu objetivo. Molesta a la tercera vez, y la vara ya la fijamos:

> *Si a la tercera vez molesta, está mal — por bonito que sea.*

**Propuesta honesta:** Lenis **solo** en las pantallas de lectura (ajustes, "cómo funciona",
documentación). **Nunca** en el master, el editor, el staging ni el dashboard.

Si aun así lo quieres en todas partes, se puede — pero que sea una decisión tomada a sabiendas, no
un efecto colateral de copiar la referencia.

---

# 6 · Lo que ya está construido y verificado

| Archivo | Qué es | Verificado |
|---|---|---|
| `canon-motion.css` | 11 keyframes + escala de ceremonia + hairline de estados + blur-in del rayos-X + reduce-motion completo | ✅ 11 definidos, 11 usados, 0 huérfanos |
| `canon-motion.js` | IntersectionObserver, escalonado con tope, shimmer autolimitado, toggle rayos-X, contador honesto, live regions | ✅ sintaxis válida |
| **`canon-aurora.js`** | **El fondo vivo. Shader WebGL2, fBm + domain warping, oro sobre obsidiana** | ✅ GLSL ES 3.00, llaves balanceadas, 6 uniforms declarados = 6 usados = 6 locations |
| `DEMO-movimiento.html` | Todo el movimiento, jugable | ✅ |
| `DEMO-aurora.html` | El fondo, con sus controles | ✅ |

## Cómo hicimos que el fondo no duela

1. **Buffer a 1/4 de resolución** (tope 480 px), escalado. El truco de ellos. Nadie lo nota.
2. **30 fps, no 60.** Es una deriva lenta; duplicar frames solo quema batería.
3. **Pestaña oculta → cero trabajo.**
4. **`CANON.aurora.pause()` mientras el usuario escribe.** El editor es sagrado.
5. **`prefers-reduced-motion` o sin WebGL2 → degradado estático** de la misma paleta.
6. **El fondo DICE algo:** en calma, deriva imperceptible. Cuando la IA trabaja,
   `CANON.aurora.setActive(true)` y el humo se agita, el oro sube.
   **Un fondo que no comunica nada no tiene derecho a moverse.**

## Dónde vive el fondo

✅ Login · onboarding · **la espera de la ingesta** · el dashboard vacío del día 1.

❌ **Nunca** detrás del editor de variante, del master con 200 items, ni del documento. Ahí compite
con el trabajo — y el trabajo gana siempre.
