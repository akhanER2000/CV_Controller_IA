# Handoff de ingeniería — Corpus

> Contrato de integración del sistema de diseño. Lo que sigue es normativo:
> donde dice "no cambia", no cambia. Un ingeniero debería poder construir el
> producto leyendo este documento y los archivos que referencia, sin adivinar.
>
> Este documento no reemplaza a las especificaciones de detalle
> (`02-sistema/motion.md`, `02-sistema/densidad.md`, `05-documento-cv/ESPECIFICACION.md`);
> las ata. Cuando un dato aparezca aquí y allá, la fuente de verdad es el archivo
> de detalle, y este documento apunta a él.

---

## 0 · Nombre de marca: Corpus (producto) vs CANON (repositorio)

Hay dos nombres en circulación y significan cosas distintas. No son intercambiables.

- **Corpus** es el nombre **de cara al usuario**: el producto, la marca, la palabra
  que aparece en la UI, en el copy (`06-handoff/copy.md`), en el `<title>`, en el
  logotipo y en cualquier texto que un usuario pueda leer. La cabecera de
  `02-sistema/tokens.css` ya dice "Corpus". Ese es el nombre canónico del producto.
- **CANON** es el nombre **de trabajo / interno**: la carpeta del sistema de diseño,
  el prefijo de los artefactos técnicos (`canon-motion.js`, `canon-aurora.js`,
  `canon-*` en las clases CSS) y el namespace global de JavaScript (`window.CANON`).
  Es infraestructura; el usuario nunca lo ve.

**Resolución explícita para ingeniería:**

1. Todo lo visible dice **Corpus**. Si encontrás "CANON" en un lugar donde lo lee
   un usuario, es un bug de copy: corregilo a "Corpus".
2. Todo lo interno **conserva el prefijo `canon-` / `CANON`** tal cual. No renombres
   `window.CANON`, ni las clases `c-*`, ni los archivos `canon-*`. Renombrarlos rompe
   el contrato de portado a React descrito en §3 sin ningún beneficio de marca.
3. La regla mnemónica: **`canon-` = herramienta; "Corpus" = producto.**

No unifiques los dos nombres. La ambigüedad no es un descuido a limpiar; es la
separación normal entre nombre de marca y nombre de código.

---

## 1 · Mapa del paquete `canon-design/` y cómo leerlo

El paquete está numerado por orden de lectura. Leelo de arriba abajo la primera vez.

```
canon-design/
├── 00-README.md              Punto de entrada. Empezá acá.
├── index.html                Índice navegable del paquete (ver nota de estado en §6).
│
├── 01-producto/              EL PORQUÉ. Léelo una vez; no se toca al construir.
│   ├── posicionamiento.md     Qué es Corpus y contra qué se define.
│   └── principios.md          Las reglas duras (IA no inventa, un master, etc.).
│
├── 02-sistema/               EL CÓMO. Esta carpeta es la que se consume en código.
│   ├── tokens.css             ★ Tokens semánticos y crudos. Fuente de verdad de color/tipo/espacio.
│   ├── tokens.json            Los mismos tokens en JSON (para herramientas / Tailwind).
│   ├── tipografia.md          Escala, familias, uso.
│   ├── densidad.md            Escala de densidad para UI de app (filas, controles).
│   ├── motion.md              ★ Doctrina de movimiento: 4 niveles de ceremonia, el shimmer único.
│   ├── canon-motion.css       Los 11 keyframes + las clases c-*.
│   ├── canon-motion.js        ★ El motor: window.CANON (stagger/shimmer/countTo/confirm/dismiss).
│   ├── canon-aurora.css       ★ El sistema ventana/muro/velo/panel + el dial --aurora-strength.
│   ├── canon-aurora.js        ★ El shader WebGL2 y CANON.aurora (mount/setActive/pause/resume).
│   ├── ANALISIS-REFERENCIA.md  Forense de alkemymarket.com (emulado, no copiado).
│   ├── DEMO-aurora.html        Demo aislada del humo. Útil para calibrar.
│   └── DEMO-movimiento.html    Demo aislada del kit de motion.
│
├── 03-componentes/           EL VOCABULARIO.
│   ├── componentes.md          Inventario de componentes y estados.
│   └── componentes.html        Mock renderizado de los componentes.
│
├── 04-pantallas/             LAS PANTALLAS (solo 2 de 11 — ver §6).
│   ├── dashboard.html
│   └── editor-variante.html
│
├── 05-documento-cv/          EL DOCUMENTO EXPORTABLE (deliberadamente sobrio).
│   ├── ESPECIFICACION.md       ★ Spec exacta en pt/mm para reconstruir en react-pdf.
│   ├── decision-tipografica.md La apuesta del mono y su Plan B.
│   ├── datos-ejemplo.json      ★ El golden file (modelo interno). Persona: Matías Fuentes Aguilar.
│   ├── cv-texto-plano.txt      ★ El texto extraído de referencia para el diff de CI.
│   ├── cv-1pagina-es/en.html   Artboards del documento (medidos: .page = 297 mm exactos).
│   ├── cv-2paginas-es/en.html
│   └── cv-bn.html              Prueba de que el CV no depende del color.
│
└── 06-handoff/               LA INTEGRACIÓN.
    ├── copy.md                 Copy bilingüe ES+EN completo, 14 secciones.
    └── handoff.md              Este documento.
```

**Los archivos con ★ son los que se consumen al construir.** El resto es contexto
que se lee una vez. La ruta corta para un ingeniero con prisa: `00-README.md` →
`02-sistema/tokens.css` → `02-sistema/motion.md` → este documento → `05-documento-cv/ESPECIFICACION.md`.

---

## 2 · Tokens: cómo consumir el sistema

Fuente de verdad: `02-sistema/tokens.css` (y su espejo `tokens.json`).

### 2.1 · La regla central: consumir SIEMPRE los semánticos

Hay dos capas de tokens y no se mezclan:

- **Crudos** (`--gold-500`, `--obsidian-surface`, `--porcelain-bg`, la escala de
  espaciado): **no cambian entre temas**. Existen para *construir* los semánticos.
- **Semánticos** (`--bg`, `--surface`, `--text`, `--link`, `--accent`, `--border`,
  `--focus-ring`, `--on-accent`, sombras…): **sí cambian entre temas**. Son los que
  se consumen en la UI.

En cualquier componente de aplicación, usá el token semántico, nunca el crudo ni
un hex literal. `color: var(--text)`, no `color: #F5F5F2` ni `color: var(--obsidian-text)`.
Esto es lo que hace que el mismo componente sirva en obsidiana y en porcelana sin
tocar una línea.

### 2.2 · Los dos temas

- **Obsidiana** (oscuro) es el tema **por defecto**: vive en `:root` con
  `color-scheme: dark`.
- **Porcelana** (claro) se activa con `[data-theme="porcelain"]` en un ancestro.
- **El documento CV es un caso aparte:** vive SIEMPRE en porcelana/tinta porque es
  impresión, con independencia del tema de la app. No hereda el tema de la UI. Ver §5 y
  `05-documento-cv/ESPECIFICACION.md §9`.

### 2.3 · La regla del oro escaso (normativa, no estética)

**El oro es el ÚNICO acento interactivo de la UI.** Un solo color señala "acá se
actúa / esto es tuyo / esto tiene foco". Si el oro empieza a aparecer decorando cosas
que no son accionables, deja de significar algo.

Corolarios que ingeniería debe respetar:

- **No hay semáforo de confianza.** No se usa rojo/amarillo/verde para representar
  "score" o nivel de confianza. La IA no inventa puntajes ni porcentajes (principio
  de producto). `--success-quiet` existe solo para una confirmación discreta y
  **nunca** para un "score".
- **El `--danger` real existe y es sobrio.** `--danger` (#C4453A) es solo para
  acciones destructivas y errores duros de sistema. `--danger-quiet` (#E07A70) es su
  variante de texto sobre oscuro. No se usa danger para "advertencias" de contenido
  (eso va en el chequeo de salud, con lenguaje, no con rojo).
- **Los tres metales (oro/cobre/plata) viven SOLO en la atmósfera** (el aurora, §4).
  En la UI nunca aparecen cobre ni plata como color de señal. *Atmósfera ≠ señal.*
- El estado dorado siempre lleva **una segunda señal** además del color (borde, texto,
  icono textual), para que sobreviva a impresión, daltonismo y falta de contraste.

### 2.4 · Deudas de token que ingeniería debe resolver al portar

Estas son promociones pendientes en `tokens.css`. Hacerlas antes de escalar evita
que el hex se filtre por el código.

1. **`#050508` debe promoverse a `--obsidian-deep`.** Hoy no está tokenizado: el
   negro profundo del sustrato del aurora aparece únicamente como *fallback* inline
   en `canon-aurora.css` (`var(--obsidian-deep,#050508)` en `.c-wall`, `.c-window::before/after`)
   y como constante en el shader (`OBSIDIAN = [0.020,0.020,0.031]`). Acción: agregar
   `--obsidian-deep: #050508;` a `:root` en `tokens.css`. Mientras no exista el token,
   el sistema funciona por el fallback, pero un cambio de sustrato obliga a editar tres
   lugares en vez de uno.
2. **Deriva del token `danger`.** `tokens.css` define `--danger: #C4453A`, pero algunas
   pantallas hardcodean el fallback `#C6544B`. Al portar, consumí `var(--danger)` y
   eliminá el literal `#C6544B`.
3. **Colores linguist de GitHub filtrados.** El mock de repos en `03-componentes/componentes.html`
   trae colores de lenguaje de GitHub (#79c0ff, #3572A5, #844FBA, #2b7489, #89e051,
   #f1e05a). Son de un mock; no deben entrar al sistema de color ni volverse tokens.

---

## 3 · El kit de motion: `window.CANON.*` y las clases `c-*`

Fuentes de verdad: `02-sistema/canon-motion.js` (lógica), `canon-motion.css` (keyframes
y clases), `motion.md` (doctrina).

### 3.1 · El contrato con ingeniería (léelo antes que la API)

> Al portar a React, **los nombres de clase `c-*` y la API `window.CANON.*` NO CAMBIAN.**

La implementación vanilla (`canon-motion.js`, ~2 KB, sin dependencias) se reescribe
como hooks en Next.js, pero la superficie pública es idéntica: los mismos nombres de
método, la misma firma, los mismos nombres de clase en el DOM. Un `CANON.stagger(ref.current)`
en un `useEffect` hace exactamente lo que hace hoy el script. Esto es deliberado: es
lo que permite que las pantallas HTML de este paquete sean una especificación ejecutable
y no un boceto que hay que reinterpretar.

**Orden de carga (constraint real, no cosmético):** cargar **`canon-motion.js` ANTES
que `canon-aurora.js`**. `canon-motion.js` hace `window.CANON = { … }` (asignación
plana); `canon-aurora.js` hace `window.CANON = Object.assign(window.CANON || {}, { aurora })`.
Si el aurora carga primero, la asignación plana de motion **borra** `CANON.aurora`. En
el orden correcto (motion → aurora) ambos coexisten. Al portar a módulos, exportá un
único objeto `CANON` y evitás el problema; mientras sean dos scripts, respetá el orden.

### 3.2 · La API `window.CANON`

`canon-motion.js` expone: `{ stagger, shimmer, countTo, confirm, dismiss, announce, REDUCED }`.
`canon-aurora.js` agrega: `{ aurora }`.

| Método | Firma | Qué hace | Notas de contrato |
|---|---|---|---|
| `stagger` | `stagger(container, { step=40, max=24 })` | Escalona la entrada de los hijos `.c-stagger-item` del contenedor. Añade `is-running` al contenedor tras doble `rAF`. | **El momento estelar:** poblar la carrera item por item al terminar la ingesta. Más de `max` hijos entran de golpe (`.c-no-stagger`). |
| `shimmer` | `shimmer(el, key='global')` | Dispara el brillo dorado una vez. Añade `.is-firing`, lo quita al `animationend`. | **Se autolimita: hay UN shimmer por producto.** La segunda llamada con la misma `key` no hace nada y avisa por consola. Reservado para el fin de la extracción de la IA. |
| `countTo` | `countTo(el, to, ms=600)` | Sube contando hasta `to` con ease-out cúbico. | Cuenta lo **realmente encontrado**, nunca un porcentaje inventado. Con `reduced-motion`, escribe `to` de una. |
| `confirm` | `confirm(el)` | Ceremonia 1: reinicia y dispara la animación `.c-confirm`. | Para la microconfirmación de "confirmado". |
| `dismiss` | `dismiss(el, after)` | Añade `.c-dismiss` y elimina el nodo al `animationend`, luego llama a `after`. | Con `reduced-motion` llama a `after` y elimina de inmediato. |
| `announce` | `announce(msg)` | Escribe `msg` en la región `aria-live="polite"` (`#canon-live`, se crea sola). | **Accesibilidad no negociable:** cada estado de IA que se ve, se anuncia. |
| `REDUCED` | booleano | `true` si el usuario pide movimiento reducido. | Toda animación con lógica debe consultarlo. |

**Comportamientos que se cablean solos al cargar el script** (no requieren llamada):

- **`dividerDraw`** — cualquier `.c-divider[data-divider]` dibuja su hairline dorada la
  **primera** vez que entra al viewport (IntersectionObserver, `threshold 0.6`), y nunca
  más. La guarda "una sola vez por sesión" (`once()`) es central en la doctrina: una
  animación que se repite deja de enseñar.
- **Toggle rayos-X "Cómo lo lee el ATS"** — botones `[data-xray-toggle="#sel"]` alternan
  `data-mode` del objetivo entre `doc` y `raw`, actualizan `aria-pressed` y anuncian.
  Es la **única ceremonia que hoy funciona de punta a punta** (en `editor-variante.html`).
- **Scroll-reveal** — solo dentro de `.c-doc .c-reveal`. En la app está **prohibido**
  el reveal por scroll; solo vive en superficies tipo documento.

### 3.3 · Las clases `c-*`

Definidas en `canon-motion.css` y `canon-aurora.css`. Inventario (los nombres son parte
del contrato de §3.1):

- **Estructura de atmósfera** (aurora, ver §4): `c-aurora-gl`, `c-wall`, `c-window`,
  `c-scrim` (`-light`/`-heavy`/`-radial`), `c-panel`, `c-panel-solid`.
- **Escalonado:** `c-stagger`, `c-stagger-item`, `c-no-stagger`.
- **Hairlines y líneas:** `c-divider` (`-draw`), `c-hairline`.
- **Estados de contenido:** `c-pending`, `c-unverified`, `c-override`, `c-skeleton`,
  `c-thinking`, `c-shimmer`.
- **Entradas:** `c-rise`, `c-glow-in`, `c-panel-in`, `c-reveal`.
- **Rayos-X:** `c-xray`, `c-xray__doc`, `c-xray__raw`.

### 3.4 · Doctrina (resumen; el detalle está en `motion.md`)

Cuatro niveles de ceremonia, y ambición **por capas** (decisión tomada):

- **Nivel 0 — instantáneo (0–80 ms):** feedback de control. Todas las pantallas.
- **Nivel 1 — confirmación (120–200 ms):** `confirm`, toggles, microestados.
- **Nivel 2 — transición (250–400 ms):** cambios de vista, paneles.
- **Nivel 3 — ceremonia (600–1200 ms):** reservado. El `stagger`, el shimmer único, la
  pantalla de espera de la ingesta.

**Reparto por tipo de pantalla:**

- **Pantallas atmosféricas** (landing, auth, onboarding, **espera de la ingesta**):
  coreografía completa grado-referencia — revelado por palabra/carácter, `letter-spacing`
  del eyebrow que se cierra de 0.6em a 0.3em, ceremonia de carga (ringDraw / horizonDraw /
  particleRise / glowPulse / letterReveal), sparkFloat del ForgeButton.
- **Pantallas de trabajo** (editor, master, staging, tailoring): movimiento **restringido
  y rápido**. Nada de ceremonia. El editor es **sagrado**: el aurora se pausa mientras
  el usuario escribe.
- **El documento CV nunca se mueve.**

---

## 4 · El sistema ventana / muro / velo / panel — y dónde va el aurora

Fuente de verdad: `02-sistema/canon-aurora.css` (estructura) y `canon-aurora.js` (shader).

### 4.1 · El mecanismo (no es un "blackout" encima del humo)

El humo no se tapa con una capa negra por encima. Es al revés, y entenderlo evita
reimplementarlo mal:

1. El humo vive en una capa **fija al fondo**, `z-index: 0`, `pointer-events: none`
   (`.c-aurora-gl`). Nunca intercepta un clic.
2. El contenido de la página es **opaco** y **tapa** el humo por defecto.
3. Algunas superficies se declaran **transparentes** — son **ventanas** por las que el
   humo asoma.

`--aurora-strength` (en `:root`, default `0.55`) es el **dial maestro**: un solo número
gobierna cuánto humo hay en todo el producto (0 apagado · 0.35 discreto · 0.55 estándar
· 0.8 fuerte).

### 4.2 · Las cuatro superficies

| Clase | Qué es | Cuándo |
|---|---|---|
| `.c-window` | Fondo **transparente**: el humo se ve. Tiene degradados de 64 px arriba/abajo para que no corte en seco. | Donde el humo debe respirar. |
| `.c-wall` | Fondo **opaco** `var(--obsidian-deep,#050508)`. Tapa el humo. | Donde hay **trabajo que leer**. |
| `.c-scrim` | Velo semitransparente **bajo el texto** que va encima del humo. Variantes `-light` (.15), default (.28), `-heavy` (.45), `-radial`. Usá siempre el **mínimo** que deje leer. | Texto sobre ventana. |
| `.c-panel` | Vidrio ahumado (`backdrop-filter: blur(14px)`), deja intuir el humo sin comerse una letra. `.c-panel--solid` = superficie opaca, cero transparencia. | `.c-panel` para superficies livianas sobre humo; `.c-panel--solid` para listas densas y el editor. |

El humo tiene una luminancia máxima de ~73/255: **no aguanta un velo pesado**. Los
valores de scrim están calibrados mirando capturas reales; no los subas "por si acaso"
o el humo desaparece.

### 4.3 · La regla de oro: dónde va el aurora y dónde NUNCA

> Donde hay trabajo, el trabajo gana. Siempre.

- **VENTANA (humo visible) — pantallas "window":** login · onboarding · **espera de la
  ingesta** · dashboard **vacío** del día 1 · cabeceras de sección.
- **MURO (humo tapado) — nunca aurora:** el **editor de variante** · el **master con 200
  items** · staging · tailoring · **el documento CV**.

El aurora se monta buscando elementos `.c-aurora-gl` (`CANON.aurora.mount()`, auto en
`DOMContentLoaded`). Consecuencia práctica: en una pantalla de muro, simplemente **no
pongas** `.c-aurora-gl` en el DOM. En una de ventana, montalo una vez a nivel de layout.

### 4.4 · API del aurora y disciplina de intensidad

- `CANON.aurora.mount(root=document)` — monta el canvas en cada `.c-aurora-gl`.
- `CANON.aurora.setActive(true|false)` — sube/baja la agitación del humo. Semántica:
  **la IA está trabajando** → el humo se agita. Ojo: hoy afecta a **todas** las
  instancias montadas (no es selectivo por instancia).
- `CANON.aurora.pause()` / `.resume()` — congela el bucle. **Usar `pause()` mientras el
  usuario escribe** (editor sagrado) y en cualquier momento en que el movimiento estorbe.
- Sin WebGL2 o con `reduced-motion`: degradado estático `.is-static` con los mismos
  metales y cero GPU. El buffer corre a ~0.28 de resolución (tope 560 px) y el bucle es
  de 30 fps que se detiene con la pestaña oculta: es barato a propósito.

Los tres metales del shader son atmósfera, no señal (§2.3): obsidiana `#050508`, oro
`#D4AF37`, cobre `#B87333`, plata `#ADB6C2`.

---

## 5 · El contrato del golden file

Fuente de verdad: `05-documento-cv/ESPECIFICACION.md §7`, con
`datos-ejemplo.json` ⇄ `cv-texto-plano.txt`.

### 5.1 · El circuito de CI

```
datos-ejemplo.json          (modelo interno: superset con variantes, procedencia,
      │                       confianza, visible, orden. Persona: Matías Fuentes Aguilar)
      │  render con @react-pdf/renderer
      ▼
   CV.pdf                    (una sola columna semántica: orden del DOM = orden del
      │                       content stream del PDF)
      │  re-parse con pdf.js / unpdf
      ▼
 texto extraído  ── diff ──▶ cv-texto-plano.txt   (el texto de referencia)
      │
      ▼
  ¿coinciden?  NO → falla el build.   SÍ → pasa.
```

Reglas que el ingeniero debe preservar para que el diff sea estable:

- Los encabezados salen en **MAYÚSCULAS** porque `text-transform` dibuja glifos en
  mayúscula en el PDF; el fixture ya los espera así.
- Los **bullets son marcador CSS** (`list-style`), no caracteres de texto: **no** entran
  al texto extraído. Si `react-pdf` emite el bullet como glifo, se ajusta la técnica o se
  **regenera el fixture documentando el porqué** — no se parchea el diff a mano.
- Registrar las fuentes como **`.ttf`** (no `.woff2`) en `react-pdf`. Un solo acento:
  `gold-700 #8A6414`, solo en el nombre. Ver la escala exacta en pt/mm en la spec.
- **La apuesta del mono está pendiente de verificación real** (las cifras en Geist Mono).
  Mitigada por 5 reglas duras (§5 de la spec) y con **Plan B escrito**: si el re-parseo
  muestra que el run mono se pega o se separa, la cifra vuelve a Geist 600 dentro de la
  viñeta — degradación de un solo token (`--cv-num-font`), sin tocar layout. El mono se
  conserva en la app (preview, rayos-X, métricas), donde no hay parser que respetar.

### 5.2 · ⚠️ Defecto a reconciliar antes de confiar en `masterHealth`

El bloque `masterHealth` de `datos-ejemplo.json` tiene una **contradicción interna** que
un test de salud tomaría como verdad. Hay que arreglar el fixture antes de construir el
chequeo de salud contra él:

- La entrada **`h-nometric`** (severity `warn`) dice literalmente *"3 viñetas sin ninguna
  cifra"* y referencia `["w-fintual-b5", "sk-practices", "pr-conc-b1"]`.
- Pero al inspeccionar esos refs en el mismo JSON:
  - **`w-fintual-b5`** tiene `hasMetric: true` — su texto sí trae cifras ("menos de 5
    minutos", "2 días").
  - **`pr-conc-b1`** tiene `hasMetric: true` — su texto sí trae cifras ("320 estrellas",
    "4 empresas").
  - **`sk-practices`** ni siquiera es una viñeta: es una **categoría de skills**
    ("Prácticas"). El ref está mal tipado dentro de un aviso `kind: "bullet-sin-cifra"`.

O sea: dos de los tres refs contradicen el mensaje (tienen cifra) y el tercero no es del
tipo que el aviso declara. **Acción:** antes de usar `datos-ejemplo.json` como golden del
chequeo de salud, reconciliar `h-nometric` — corregir el mensaje, los refs, o los flags
`hasMetric`, según cuál sea la intención real. Mientras no se reconcilie, no derives el
comportamiento del health-check de este fixture: la referencia se contradice a sí misma.

---

## 6 · Estado: qué está construido vs qué falta

### 6.1 · Fundaciones — sólidas y listas para consumir

- **Tokens** (`tokens.css` / `tokens.json`): completos. Con las 3 deudas de §2.4 pendientes.
- **Kit de motion** (`canon-motion.*`): 11 keyframes, API completa, doctrina en `motion.md`.
  **De grado mundial pero mayormente latente** — ver 6.3.
- **Aurora** (`canon-aurora.*`): shader y sistema de superficies completos y calibrados.
- **Copy** (`copy.md`): completo, bilingüe ES+EN, 14 secciones.
- **Documento CV** (`05-documento-cv/`): spec exacta, golden file y artboards medidos
  (1 y 2 páginas, ES/EN, B/N).

### 6.2 · Pantallas — 2 de 11 construidas

**Construidas:** `dashboard.html`, `editor-variante.html`.

**Pendientes (9):** auth · onboarding · ingesta · staging · master · fuentes · tailoring ·
salud · ajustes.

Faltan además: los breakpoints **1024** y **390** (las 2 pantallas actuales son marcos
fijos de 1440), y los artboards de **loading** y **error**. `index.html` existe como
índice pero **no enlaza** las 2 pantallas construidas.

### 6.3 · Ceremonias que aún no se disparan (host faltante, no bug)

- **El aurora nunca se monta:** `.c-aurora-gl` está en el CSS pero en **0 elementos del
  DOM**. Ninguna pantalla de ventana lo hospeda todavía.
- **`stagger` y el shimmer único nunca se disparan:** no existe la pantalla de ingesta /
  staging que los hospeda. La ceremonia estelar del producto (ver la carrera aparecer
  item por item) está construida y sin escenario.
- **Lo que sí funciona hoy:** el toggle rayos-X en `editor-variante.html`.

### 6.4 · Defectos menores a limpiar al portar

- El editor trae un `dividerDraw` legacy que se dispara en cada carga (viola la regla C1
  de `motion.md`: la hairline se dibuja una vez) más un `.pulse` muerto.
- Ambas pantallas inlinean ~130 líneas de shader de aurora **muerto** (duplican
  `canon-aurora.js`). Al portar, consumir el módulo único y borrar el inline.
- Deriva de `danger` y colores linguist de GitHub (ver §2.4).

---

## 7 · Puente hacia ProfileStack (el destino de código)

El objetivo de producción es el repositorio open-source **ProfileStack** (Next.js +
Tailwind), que descubre variantes `*.profile.js` y exporta PDF desde el navegador. El
mapeo desde este paquete:

- **Tokens → Tailwind.** `tokens.json` alimenta el `theme` de `tailwind.config`. Los
  **semánticos** (`--bg`, `--text`, `--accent`…) se exponen como CSS variables y se
  referencian desde utilidades Tailwind (p. ej. `bg-[var(--surface)]`) para conservar el
  cambio de tema por `[data-theme]`. Los crudos se quedan solo como insumo. Mantené la
  separación crudo/semántico de §2.1 — no aplanes todo a colores de Tailwind.

- **Motion vanilla → hooks, misma superficie.** `canon-motion.js` se reescribe como
  hooks/utilidades de React, pero **respetando el contrato de §3.1**: mismos nombres
  `CANON.stagger/shimmer/countTo/confirm/dismiss/announce` y mismas clases `c-*`. Un
  patrón razonable: un módulo `canon` que exporta las funciones y un par de hooks
  (`useStagger`, `useDividerDraw`) que envuelven la lógica de IntersectionObserver. La
  guarda "una vez por sesión" del shimmer debe sobrevivir al portado (un módulo con
  estado, no un flag por componente).

- **Aurora → componente de layout.** `.c-aurora-gl` se vuelve un componente montado una
  vez por layout de pantalla "window", con `CANON.aurora.mount()` en efecto y `pause()`
  atado al foco del editor. El sistema ventana/muro/velo/panel se traduce a componentes
  de layout (`<Wall>`, `<Window>`, `<Scrim>`, `<Panel solid?>`), no a utilidades sueltas.
  Al unificar a módulos ES, exportá **un** objeto `CANON` y el constraint de orden de
  carga de §3.1 desaparece.

- **Documento CV → `@react-pdf/renderer`.** Reconstruir según `ESPECIFICACION.md`, valores
  en pt/mm exactos, fuentes `.ttf`. El **modelo de datos** (`datos-ejemplo.json`) es el
  superset interno; una variante `*.profile.js` de ProfileStack es una **vista** que
  referencia ese master, nunca una copia. El **contrato de CI del golden file (§5) es
  parte del puerto**: el diff `datos-ejemplo.json → react-pdf → re-parse → cv-texto-plano.txt`
  debe correr en CI de ProfileStack, no quedarse en este paquete. Reconciliar el defecto
  de `masterHealth` (§5.2) antes de portar el chequeo de salud.

- **Principio que ProfileStack no puede diluir:** un único master canónico; cada CV es una
  **vista** que lo referencia; la IA ingesta a una zona de staging donde el usuario
  confirma **cada** item; la IA no inventa; no hay scores ni porcentajes inventados. El
  documento exportado es sobrio y ATS-parseable; la app es bella (oro/obsidiana/porcelana
  + aurora). Estas no son decisiones de UI: son el producto.