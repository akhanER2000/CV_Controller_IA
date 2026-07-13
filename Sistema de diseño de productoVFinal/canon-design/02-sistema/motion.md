# Motion — la escala de ceremonia

> **La regla del movimiento en Corpus:** una animación se gana su lugar si comunica un cambio de
> estado que el usuario necesita entender. **Si solo decora, se borra.**
>
> Corolario (el que duele): **cuanto más frecuente es la acción, más corta debe ser la animación —
> hasta desaparecer.** Guardar una viñeta (40 veces al día) = 0 ms, instantáneo. Terminar de
> ingerir tu LinkedIn (2 veces en la vida) = te puedes gastar el shimmer entero.

Corpus **no es una landing.** La animación de una landing existe para *vender*: el visitante entra,
se deslumbra y se va. La nuestra existe para *trabajar*: el usuario entra un martes a las 11 de la
noche, tras la sexta postulación rechazada del mes, a adaptar su CV otra vez. No necesita
deslumbrarse. Necesita que la herramienta sea rápida y clara y **no le haga perder el tiempo con
animaciones que ya vio.** El lujo aquí es que se sienta cara **y no se note que se esforzó.**

Valores base en `tokens.css` (`--dur-*`, `--ease-*`). Este documento manda sobre dónde y cuándo.

---

## Sobre la referencia (alkemymarket.com)

Comparte nuestro esqueleto: serif de alto contraste + grotesque + mono, fondo casi negro, acento
metálico, metáfora de transmutación. **De ahí se roba el nivel de oficio y el vocabulario de
movimiento — nunca los píxeles.** Se rechaza explícitamente: el **fondo de tinta animada** (decoración
pura, hostil en una herramienta), la **paleta multi-tono** (nosotros tenemos un acento), el **texto
con gradiente** (nuestro oro es un oro) y **todo el género de landing** (la matamos en el milestone 2).

---

## La escala de ceremonia

Todo movimiento cae en uno de cuatro niveles. El nivel lo fija la **frecuencia** de la acción, no lo
vistosa que sea.

| Nivel | Frecuencia | Presupuesto | Propiedades | Ejemplos |
|---|---|---|---|---|
| **0 · Instantáneo** | Decenas/día | **0–80 ms** (`--dur-instant`) | solo `color` / `opacity` | Editar viñeta · marcar visible/oculto · reordenar · hover/focus |
| **1 · Confirmación** | Varias/sesión | **120–200 ms** (`--dur-fast`) | `opacity` + `transform` corto | Aceptar item en staging · añadir a la variante · revertir override · guardar |
| **2 · Transición** | Pocas/sesión | **250–400 ms** (`--dur-base`/`--dur-slow`) | `transform` con desplazamiento | Cambiar de variante · abrir "cómo lo lee el ATS" · entrar a tailoring |
| **3 · Ceremonia** | Una vez cada mucho | **600–1200 ms** (`--dur-deliberate`/`--shimmer-dur`), escalonado | compuesto | Crear el master · terminar una ingesta · primera generación del PDF |

Curvas: `--ease-standard` (entradas/salidas) · `--ease-decelerate` (algo que aparece) ·
`--ease-accelerate` (algo que se va) · `--ease-spring` (micro-confirmaciones, nivel 1).

---

## El mapa: cada patrón, a un trabajo concreto

Ninguno se usa "porque queda bien". Cada uno enseña algo. Y cada uno tiene un **dónde NO**.

### C1 · `dividerDraw` — la hairline dorada que se dibuja
- **Dónde:** bajo cada encabezado de sección del master y del editor.
- **Trabajo:** la primera vez, la línea se dibuja de izquierda a derecha (~500 ms, nivel 2) y
  **enseña el límite de la sección**. Después es solo una línea.
- **Técnica:** `transform: scaleX(0)→1`, `transform-origin:left` (nunca animar `width`).
- **Dónde NO:** nunca dos veces en la misma sesión. Nunca en el documento CV.
- **Reduced-motion:** la línea aparece ya dibujada (opacidad 0→1 instantánea).

### C2 · Escalonado `fade + slide-up` — el momento estelar
- **Dónde:** **solo** cuando termina la ingesta y los items se pueblan en staging.
- **Trabajo:** ver aparecer tu carrera item por item es el producto entero en tres segundos.
  Nivel 3.
- **Técnica:** cada item entra con `opacity 0→1` + `translateY(8px→0)`, **~40 ms de retraso entre
  hermanos**. **Tope de ~24 items animados**; el resto aparece de golpe (con 100 items, el stagger
  dura un minuto y se vuelve tortura).
- **Dónde NO:** en el master los items **ya están** al cargar — no se "revelan". En ninguna lista de
  trabajo. Nunca en scroll (ver C6).
- **Reduced-motion:** todos aparecen a la vez, sin desplazamiento.

### C3 · **blur-in** — el efecto más caro, y su único sitio
- **Dónde:** el toggle **"Cómo lo lee el ATS"** en el editor.
- **Trabajo:** al cambiar del preview elegante al texto del parser, el PDF **se desenfoca y pierde
  el color**, y del desenfoque **resuelve** el texto crudo en Geist Mono monocromo. El documento
  **se desviste.** Es literalmente la metáfora del producto: así te ve la máquina, sin la ropa.
  Nivel 2 (~360 ms).
- **Técnica:** `filter: blur(10px)→0` + `opacity` + `saturate(1)→0` en capas cruzadas.
- **Dónde NO:** en ningún otro toggle. En ninguna carga de contenido normal.
- **Reduced-motion:** **corte limpio** sin blur (swap instantáneo). Comunica lo mismo: el contraste
  entre las dos vistas es la información, no la transición.

### C4 · `shimmer-sweep` — el único shimmer, reservado y protegido
- **Dónde:** una sola vez, cuando la IA termina de extraer y el perfil se puebla.
- **Trabajo:** marca *el* momento mágico. Nivel 3, una pasada (~1100 ms), `--shimmer-dur`.
- **Dónde NO:** en ningún guardado, ningún hover, ningún otro éxito. **Un shimmer que aparece dos
  veces deja de ser un momento y pasa a ser un tic.**
- **Técnica:** barrido de `linear-gradient` (`--shimmer-core`) sobre las tarjetas nuevas, vía
  `background-position` o un pseudo con `transform`.
- **Reduced-motion:** un cambio de color de un frame (tinte dorado estático) sobre las tarjetas
  nuevas, sin barrido.

### C5 · Hairline dorada — el **sistema de estados**, no un adorno
- **Dónde:** foco · activo · override presente · item seleccionado. Todo se dice con la **arista
  dorada**, no con relleno de color.
- **Trabajo:** coherente con "el oro escaso". Nivel 0 (aparición instantánea de la arista; el color
  puede hacer un fade de 80 ms).
- **Dónde NO:** nunca como fondo, nunca como glow decorativo en reposo.
- **Reduced-motion:** la arista es un estado persistente (borde), no una animación — sobrevive tal
  cual. Nada que degradar.

### C6 · Scroll-reveal — **NO va en la app**
- **Una herramienta no revela su contenido al hacer scroll.** Con 200 items en el master, si cada
  uno hace fade-in al entrar en viewport, no puedo trabajar. El contenido de una app está ahí, ya.
- **Único sitio permitido:** documentos largos de lectura (ajustes, "cómo funciona", onboarding), y
  aun así corto (nivel 1, una vez).
- **Reduced-motion:** desactivado.

### C7 · Fondo de tinta animada — **muerto, con una excepción controlada**
- Fuera de la app. **Excepción única:** la pantalla de espera de la ingesta, mientras el LLM trabaja
  (5–40 s reales). Ahí no hay contenido con el que interferir. Un fondo vivo **en oro y obsidiana,
  un solo tono, muy contenido** convierte una barra de progreso en un momento. Nivel 3 (ambiente).
- **Dónde NO:** cualquier pantalla con contenido editable. Jamás detrás del editor o el documento.
- **Reduced-motion:** estático (un degradado fijo obsidiana→oro muy sutil).

---

## Estados de IA (recordatorio, encajan en la escala)

| Estado | Nivel | Movimiento | Reduced-motion |
|---|---|---|---|
| Pensando | ambiente | pulso lento del punto/hairline dorado | opacidad fija + texto "Pensando…" |
| Extrayendo | ambiente | contador real que sube ("página 2 de 3 · 4 experiencias") con `spring` | salta al total, sigue siendo verdadero |
| Propuesto | 1 | entra con fade + 6 px, hairline dorado | aparece con hairline, sin desplazamiento |
| Aceptado | 1 | `spring` breve + el hairline se desvanece a neutro | cambia de estado, con su etiqueta |
| Rechazado | 1 | `accelerate`, colapsa hacia arriba | desaparece, sin colapso |
| Extracción lista | 3 | **el shimmer** (C4) | tinte dorado estático |

---

## Reglas duras del movimiento

1. **`prefers-reduced-motion`, sin excepciones.** Cada animación tiene una versión sin movimiento
   que **no pierde información** (ver tabla abajo). El reset global vive en `tokens.css`.
2. **Nada baja de 60 fps.** Solo `transform` y `opacity` (y `filter` puntual en el blur-in, sobre
   **un** elemento, nunca sobre una lista). Nunca animar `width`, `height`, `top` o `box-shadow` en
   una lista de 200 items.
3. **Ninguna animación bloquea una acción.** Si el usuario hace clic durante una transición, la
   transición se interrumpe. Siempre.
4. **Nada se mueve mientras se escribe.** El editor es sagrado.
5. **La animación nunca es la única señal de un cambio de estado.** Siempre hay un cambio persistente
   (color, texto, icono, posición) que sobrevive al movimiento.
6. **Presupuesto total:** si al usar la app diez minutos seguidos algo se siente lento o repetitivo,
   está mal, por bonito que sea. Prueba tus pantallas con esa vara.

## Tabla de equivalencias `prefers-reduced-motion`

| Patrón | Con movimiento | Sin movimiento (equivalente que conserva la info) |
|---|---|---|
| C1 dividerDraw | la línea se dibuja L→R | la línea aparece ya dibujada |
| C2 stagger | items entran escalonados desde abajo | todos aparecen a la vez |
| C3 blur-in ATS | el PDF se desenfoca y resuelve el texto | corte limpio entre las dos vistas |
| C4 shimmer | barrido de luz una vez | tinte dorado estático de un frame |
| C5 hairline de estado | arista con fade de color | arista persistente (idéntica; es un borde) |
| C6 scroll-reveal | fade-in al entrar en viewport | contenido visible desde el inicio |
| C7 fondo de ingesta | tinta oro/obsidiana en movimiento | degradado estático sutil |
| IA · extrayendo | contador con spring | contador salta al total |
| Confirmaciones (nivel 1) | fade + transform corto | cambio de estado instantáneo con su etiqueta |

**El documento CV no tiene movimiento. Es papel.**
