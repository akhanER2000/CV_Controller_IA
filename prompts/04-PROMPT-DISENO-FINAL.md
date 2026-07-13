# PROMPT 04 — DISEÑO FINAL
## Milestone 3 (última): movimiento, componentes, pantallas, handoff
## Para: la MISMA sesión de Claude Design (Opus 4.8)
## Al terminar esto, el diseño se cierra y pasa a código.

---

Lee primero `03-PROMPT-DISENO-CONTINUACION.md` (dashboard-first, dos puertas de entrada, GitHub como
fuente). Todo eso sigue en pie. Este documento **añade la capa de movimiento y craft** y cierra el
paquete.

---

# A · La referencia: alkemymarket.com

La estudié en el navegador, no de oídas. Esto es lo que hay realmente ahí.

## A1 · El hallazgo incómodo: ya tenemos su mismo esqueleto

| | Alkemy | CANON (nuestro sistema, ya existente) |
|---|---|---|
| Display / titulares | **Cormorant Garamond** (serif de alto contraste) | **Playfair Display** |
| UI / texto | **Outfit** (grotesque geométrica) | **Geist** |
| Datos / cifras | **JetBrains Mono** | **Geist Mono** |
| Fondo | Casi negro | **Obsidiana `#0B0B0D`** |
| Acento | Verde esmeralda + oro | **Oro `#D4AF37`** |
| Metáfora | Alquimia: transmutación, metal base → oro | **Oro (el contacto que conduce sin corroerse) · Obsidiana (vidrio volcánico)** |

**Es el mismo reparto de tres voces, el mismo fondo, y casi la misma metáfora.** Lo que le gusta de
esa página **ya lo tiene**. Lo que no tiene es la **ambición de ejecución**.

> **Conclusión operativa: no copies nada. No hace falta y sería peor.** Alkemy es un sitio comercial
> real, con su propia identidad (alquimia, símbolos 🜁🜂🜃, esmeralda). Importar eso nos daría un
> producto derivado y confuso. **Lo que hay que importar es el nivel de oficio, no los píxeles.**

## A2 · Lo que sí hace bien, y hay que robarle (las ideas, no la piel)

**1 · El vocabulario de movimiento.** Verificado en su CSS:

| Patrón | Qué es |
|---|---|
| `fade-in` + `slide-in-up`, **escalonado** | El contenido entra desde abajo, con opacidad, con retraso incremental entre hermanos |
| **blur-in** en titulares | El título entra desenfocado y **resuelve al enfocar**. Lo cacé a mitad de transición. Es el efecto más caro de la página. |
| `dividerDraw` | Una **hairline que se dibuja sola** de izquierda a derecha al entrar en viewport |
| `shimmer-sweep` | Un barrido de luz que cruza una superficie |
| `gradient-flow`, `glow-spin` | Gradiente que se desplaza; halo que gira lento |
| Fondo de **tinta/humo animado** a sangre completa | Remolinos de color sobre negro |

**2 · El ritmo de sección, repetido como una métrica poética:**

```
overline (mono, MAYÚSCULAS, tracking +0.14em, color apagado)
    ↓
titular serif grande, con UNA palabra en negrita o itálica
    ↓
lede de una línea, gris
    ↓
contenido
```

Es exactamente nuestro token `overline` (Geist Mono 500, uppercase, +0.14em). **Ya lo tenemos
definido y no lo estamos usando como sistema.**

**3 · ★ La mejor idea de toda la página: las tarjetas contienen UI real del producto, no iconos.**

En vez de un icono de camión con "Envíos multi-carrier", ponen **la tabla real de tarifas**:

```
USPS Priority    6-10d    $18.40
UPS Saver         3-5d    $32.10
DHL Express       2-3d    $41.80
```

En vez de un escudo con "Moderación", ponen **la cola de revisión real**, con sus badges
`PASS / REVIEW / REJECT`. En mono. Diminuto. Funcional.

**Eso es lo que hay que robar.** Es honesto, es específico, y **es imposible de fingir**: solo puedes
mostrar la UI de tu producto si tu producto existe.

**4 · La tabla comparativa con cifras reales y citadas.** Comparan sus comisiones contra Etsy,
Shopify y Amazon, **con cada fee sacado de la documentación pública de cada plataforma.** Es
exactamente nuestra ética. Es la parte más persuasiva de su sitio y no usa ni una animación.

## A3 · Lo que hay que rechazar, y por qué

- ❌ **El fondo de tinta animada.** Es precioso y es **decoración pura**. Viola frontalmente la regla
  del oro escaso (*"≤1 elemento dorado dominante por vista; nunca relleno ni fondo masivo"*). Y en
  una herramienta de trabajo, un fondo que se mueve mientras editas es hostil. **Fuera.**
- ❌ **La paleta multi-tono** (esmeralda + púrpura + carmesí + oro). Nosotros tenemos **un** acento.
  Esa es nuestra disciplina y es mejor.
- ❌ **El texto con gradiente** verde→oro en el titular. Nuestro oro es **un** oro.
- ❌ **Todo el género.** Alkemy es una **landing de marketing**. Nosotros matamos la landing
  (decisión del milestone 2). Su animación existe para **vender**. La nuestra tiene que existir para
  **trabajar**.

---

# B · El encargo real, y por qué es más difícil y más original que copiar la referencia

> **Casi todo el mundo sabe hacer que una landing se sienta cara. Casi nadie sabe hacer que una
> herramienta densa se sienta cara sin estorbar.**

Ese es el encargo. La animación de scroll-reveal es fácil porque la landing **se ve una vez**. Un
editor de CV se usa **cuarenta veces al día**, y cualquier efecto que sea encantador la primera vez es
**una piedra en el zapato la vigésima**.

**Esa es la restricción que ordena todo lo que sigue:**

> ### La regla del movimiento en CANON
> **Una animación se gana su lugar si comunica un cambio de estado que el usuario necesita entender.
> Si solo decora, se borra.**
>
> Y su corolario, que es el que duele:
> **Cuanto más frecuente es la acción, más corta debe ser la animación — hasta desaparecer.**
> Guardar una viñeta (40 veces al día) = **0 ms, cambio instantáneo**. Terminar de ingerir tu
> LinkedIn (2 veces en la vida) = **te puedes gastar el shimmer entero.**

Diseña una **escala de ceremonia** con eso, y aplícala a todo:

| Nivel | Frecuencia | Presupuesto de movimiento | Ejemplos |
|---|---|---|---|
| **0 · Instantáneo** | Decenas de veces al día | **0–80 ms**, solo color/opacidad | Editar una viñeta, marcar visible/oculto, reordenar |
| **1 · Confirmación** | Varias veces por sesión | **120–200 ms**, transición de estado | Aceptar un item en staging, añadir al variant, revertir un override |
| **2 · Transición** | Pocas veces por sesión | **250–400 ms**, con desplazamiento | Cambiar de variante, abrir "cómo lo lee el ATS", entrar al tailoring |
| **3 · Ceremonia** | Una vez cada mucho | **600–1200 ms**, escalonado | Crear el master, terminar una ingesta, primera generación del PDF |

---

# C · El mapa: cada patrón de Alkemy, a un sitio donde se gane el sueldo

**Ninguno se usa "porque queda bien". Cada uno tiene un trabajo.**

## C1 · `dividerDraw` → la hairline dorada que se dibuja
**Dónde:** bajo cada encabezado de sección del master y del editor.
**Por qué se lo gana:** el ojo aprende que la hairline **marca el límite de una sección**. Al
dibujarse, enseña la estructura del documento la primera vez, y después es solo una línea.
**Ceremonia 1.** Solo la primera vez que la sección entra en pantalla en la sesión. **Nunca dos veces.**

## C2 · Escalonado `fade + slide-up` → **el momento estelar del producto**
**Dónde:** cuando termina la ingesta y los items se pueblan en staging.
**Por qué:** *ver aparecer tu carrera, item por item, es el producto entero en tres segundos.*
**Ceremonia 3.** Escalonado real (~40 ms entre hermanos), tope de ~24 items animados y el resto
aparece de golpe (si no, con 100 items la animación dura un minuto y se vuelve tortura).
**En ningún otro sitio.** Los items del master **ya están ahí** al cargar la página: no se "revelan".

## C3 · **blur-in** → el efecto más caro, y ya sé exactamente dónde va
**Dónde: en el toggle "Cómo lo lee el ATS".**

Este es el mejor uso posible de ese efecto y es el momento que define el producto. Cuando el usuario
cambia del preview elegante al texto plano del parser:

> el PDF **se desenfoca y pierde el color**, y del desenfoque **resuelve** el texto crudo, en Geist
> Mono, monocromo. El documento **se desviste.**

No es decoración: es **literalmente la metáfora del producto** — así es como la máquina te ve, sin la
ropa. **Ceremonia 2.** Y con `prefers-reduced-motion`, un corte limpio sin blur que comunica lo mismo.

## C4 · `shimmer-sweep` → **el único shimmer, ya reservado**
El sistema (`motion.md`) ya dice que hay **un** shimmer y es cuando la IA termina de extraer.
**Confírmalo y protégelo.** Un shimmer que aparece dos veces deja de ser un momento y pasa a ser un
tic. **Ceremonia 3, una vez.**

## C5 · `glow` / hairline dorada → **el sistema de estados**, no un adorno
El brief original ya lo pedía: *"el hairline dorado como sistema de estados, en vez de fondos de
color"*. **Ahora tiene una técnica concreta.** Foco, activo, override presente, item seleccionado:
todo se dice con la arista dorada, no con relleno. **Ceremonia 0.**

## C6 · **Scroll-reveal → NO va en la app**
Y esto es importante, porque es lo primero que se te va a ocurrir: **una herramienta no revela su
contenido al hacer scroll.** Si tengo 200 items en el master y cada uno hace fade-in al entrar en
viewport, **no puedo trabajar.** El contenido de una app está ahí, ya. Punto.

**Único sitio donde se permite:** documentos largos de lectura (ajustes, "cómo funciona", el
onboarding). Y aun así, corto.

## C7 · El fondo de tinta animada → **muerto, con una excepción**
Fuera de la app. **Excepción única y controlada:** la pantalla de espera de la ingesta, mientras el
LLM trabaja. Ahí no hay contenido con el que interferir, la espera es real (5–40 s), y un fondo vivo
—**en oro y obsidiana, un solo tono, muy contenido**— convierte una barra de progreso en un momento.
Con `prefers-reduced-motion`: estático.

---

# D · El patrón que hay que robar de verdad: **UI real dentro de la tarjeta**

Aplícalo en todo el producto. **Nunca un icono donde puedas poner el dato.**

| En vez de… | Pon… |
|---|---|
| Un icono de GitHub y "Conecta tu GitHub" | `Go · 412 KB · 3 repos` / `Python · 180 KB · 2 repos` — **en mono, la evidencia real** |
| Un escudo y "Verificamos la evidencia" | El `evidence_snippet` literal, con el fragmento resaltado |
| Un icono de documento y "Exporta tu CV" | Las **dos primeras líneas del texto que extrae el parser**, en mono |
| Una barra de progreso y "Salud del CV" | **Las tres viñetas sin cifra, listadas**, con su enlace |
| Un icono de sync y "Variantes desactualizadas" | `Backend — Fintech · desactualizada · cambió: cargo en Acme` |

**Es honesto, es específico y es imposible de fingir.** Y encaja con la tesis: nosotros no decimos
que verificamos — **enseñamos la verificación.**

Esto aplica con especial fuerza a la **tarjeta de skill con evidencia** (§C1 del milestone 2). Es el
componente que ninguna herramienta del mercado tiene:

```
Go                                                    ● verificado
412 KB · 3 repos · citada en 2 viñetas de experiencia
github.com/usuario/pago-conciliador  ·  +2 más
```

---

# E · Entregables — el paquete final

Cierra `canon-design/` con todo lo pendiente:

```
02-sistema/
  motion.md            ← REESCRIBIR con la escala de ceremonia (§B) y el mapa (§C).
                          Duraciones, curvas, y para CADA patrón: dónde va, dónde NO,
                          y su versión con prefers-reduced-motion.
03-componentes/
  componentes.md       Inventario: variantes, estados, props, a11y
  *.html               Uno por familia, autocontenido, CON EL MOVIMIENTO REAL FUNCIONANDO
                       (CSS/JS inline — tengo que poder abrirlo y verlo moverse)
  ★ tarjeta de item con procedencia · tarjeta de skill con evidencia
  ★ tarjeta de fuente conectada · selector de repos de GitHub
  ★ estados de IA · niveles de verificación · hairline dorada de estados
  ★ toggle global de IA (y cómo se ve todo con la IA apagada)
04-pantallas/          A 1440 / 1024 / 390, estados vacío / cargando / con datos / error
  01-dashboard         ★ la principal. VACÍO y DENSO (200 items, 7 variantes, 4 fuentes)
  02-onboarding        Las dos puertas, simétricas
  03-fuentes           GitHub OAuth, portfolio, LinkedIn, archivos + selector de repos
  04-staging           Revisión, evidencia, duplicados, y el caso "viene de una API"
  05-master            Con la skill con evidencia
  06-editor-variante   ★ 3 paneles. Sigue siendo la pantalla más importante.
                         CON el blur-in del toggle "Cómo lo lee el ATS" funcionando.
  07-tailoring · 08-salud · 09-ajustes · 10-auth
  anotaciones.md       Decisiones, interacciones, edge cases
06-handoff/
  handoff.md
  copy.md              ★ TODO el copy, ES + EN. Sin esto, ingeniería lo improvisa y suena a Jobscan.
  criterios-aceptacion.md   Solo criterios de DISEÑO (visual, copy, interacción, a11y)
```

**Los HTML de componentes y pantallas tienen que moverse de verdad.** Abrir con doble clic, ver el
stagger, ver la hairline dibujarse, ver el blur-in resolver. Ingeniería no puede reconstruir una
animación desde una descripción en prosa — la reconstruye desde el código que le dejas.

---

# F · Las reglas duras del movimiento

1. **`prefers-reduced-motion`, sin excepciones.** Cada animación tiene una versión sin movimiento
   **que no pierde información**. El blur-in se vuelve un corte; el stagger, una aparición; el
   shimmer, un cambio de color. **Documenta cada equivalencia.**
2. **Nada anima a más de 60 fps.** Solo `transform` y `opacity`. Nada de animar `width`, `height`,
   `top` o `box-shadow` en una lista de 200 items. Esto es un editor, no una landing.
3. **Ninguna animación bloquea una acción.** Si el usuario hace clic durante una transición, la
   transición se interrumpe. Siempre.
4. **Nada se mueve mientras se escribe.** El editor es sagrado.
5. **La animación nunca es la única señal de un cambio de estado.** Siempre hay un cambio persistente
   (color, texto, icono) que sobrevive al movimiento.
6. **Presupuesto total:** si al usar la app diez minutos seguidos algo se siente lento o repetitivo,
   **está mal, por bonito que sea.** Prueba tus propias pantallas con esa vara.

---

# G · Lo que no cambia

- El documento CV: **como está** (con la corrección A1 del milestone 2 — la verificación del mono
  sigue pendiente hasta que corra contra el PDF real de `react-pdf`, en CI). **El documento no tiene
  movimiento. Es papel.**
- Oro · Obsidiana · Porcelana. **Un** acento. **El oro es escaso, intencional y luminoso.**
- **La app es bellísima. El documento es sobrio.**
- **La IA nunca inventa. Ningún número sin fuente.**
- **Diseña para la dignidad.**

---

> Un último encuadre, porque va a determinar si esto sale bien o sale bonito.
>
> Te van a dar ganas de hacer que CANON **impresione**. Lo que hay que hacer es que **respete**.
>
> Alkemy anima para vender: el visitante entra, se deslumbra y se va. Nuestro usuario **entra un
> martes a las 11 de la noche, después de la sexta postulación rechazada del mes**, a adaptar su CV
> otra vez. No necesita deslumbrarse. Necesita que la herramienta sea rápida, clara, y que **no le
> haga perder el tiempo con animaciones que ya vio.**
>
> El lujo, aquí, es que la herramienta se sienta cara **y no se note que se esforzó.**
>
> **Esa es la vara. Cierra el diseño.**
