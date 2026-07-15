# Componentes — `fuentes-ia.html`

> **REGLA MADRE.** El HTML de referencia es la **referencia visual literal**, no una sugerencia.
> Los nombres de clase **NO CAMBIAN**: son el contrato diseño↔código.
> Copia literal. Cero paráfrasis en nombres de clase, CSS y copy.
>
> Fuente: `Corpus_ diseño completo/corpus-design/03-componentes/fuentes-ia.html`
> Contexto: `Corpus_ diseño completo/corpus-design/03-componentes/componentes.md`
>
> El bloque `<style data-corpus-system="css">` y `<script data-corpus-system="js">` son una **copia
> del sistema canónico** (`02-sistema/*`). **No se transcriben aquí.** Este documento especifica
> únicamente **lo específico de la hoja**.

---

## 1 · Qué familia de componentes es y dónde se usa

Es la hoja de **fuentes conectadas y estados de IA**: la familia de componentes que gobierna
**de dónde entra el material** al Corpus y **con qué grado de máquina** se procesa.

Según `componentes.md`, esta es una de las tres hojas autocontenidas del paquete:

> `fuentes-ia.html` — fuente conectada (GitHub con hechos de API), ★ selector de repos con default
> sensato, toggle de IA, estados de IA (encendida / apagada / BYOK / error de proveedor), skeleton.

Contiene **4 familias** (una por `<section class="sp-g">`, cada una con su `data-screen-label`):

| `data-screen-label` | Familia | Dónde se usa en producto |
|---|---|---|
| `fuente-conectada` | Tarjeta de fuente conectada (`.fc`) | Pantalla **Fuentes** — cada proveedor conectado (GitHub es "la estrella") |
| `selector-repos` | Selector de repos (`.rp`) | Paso de ingesta de GitHub — decidir qué entra al CV |
| `estados-ia` | Switch (`.sw`) + filas de estado de IA (`.ia-row`) | Ajustes de IA · BYOK · banner de proveedor caído |
| `skeleton` | Skeleton de carga (`.c-skel`, sistema) | Cualquier lista/tarjeta cargando |

**Andamiaje de la hoja (no es producto, es la maqueta de revisión):** `.sp-main`, `.sp-col`,
`.sp-g`, `.sp-gh`, `.sp-note`, `.sp-demo`, `.skel-demo`. Los componentes reales son `.fc*`,
`.rp*`, `.sw`, `.ia-*`.

**Tesis de la hoja (lo que hay que no romper):**
- **Nunca un icono donde puedas poner el dato.** `412.803 bytes de Go` no es "Conecta tu GitHub" con un logo.
- La **IA apagada es legítima, no degradada**. El error de proveedor **no bloquea el modo manual**.
- El **skeleton pulsa opacidad**, sin color de marca. El **shimmer de pátina está reservado** (uno en todo el producto).

---

## 2 · Inventario de componentes — uno por uno

### 2.1 · Andamiaje de hoja (`.sp-*`)

| Clase | Rol | Notas |
|---|---|---|
| `.sp-main` | `<main>` de la hoja, junto a `c-wall` | `flex:1;padding:34px 0 120px` |
| `.sp-col` | Columna de lectura | `max-width:860px` centrada. **Es el `scope` del `stagger`.** |
| `.sp-g` | Grupo/sección | `margin-top:44px`. **Cada `.sp-g` es un item del escalonado.** Lleva `data-screen-label`. |
| `.sp-gh` | Cabecera del grupo | Contiene un `<span class="t-overline">` (sistema) |
| `.sp-demo` | Envoltorio de la demo | `margin-top:14px`. Se combina: `class="sp-demo c-card fc"`, `class="sp-demo rp"`, `class="sp-demo ia-st"`, `class="sp-demo skel-demo"` |
| `.sp-note` | Nota al pie de la sección | mono, `--fs-micro`, `--text-subtle`, `max-width:78ch`. `<b>` dentro → `--text-muted` peso 500 |

Cada `.sp-gh` va seguido de `<hr class="c-divider">` (sistema — el hairline que se dibuja).

**Estados:** ninguno propio. El `.sp-g` recibe `data-reveal="soft"` + `--d` + `data-visible` por JS.

---

### 2.2 · Fuente conectada — `.fc`

Estructura literal:

```html
<div class="sp-demo c-card fc">
  <div class="fc-h">
    <span class="nm">github.com/dgatica</span>
    <span class="tag">sin IA — API con esquema</span>
    <span style="margin-left:auto">
      <button class="c-btn c-btn--quiet"><span class="c-pulse-dot"></span>&nbsp;2 repos con actividad — leer</button>
    </span>
  </div>
  <div class="fc-facts">
    <div><div class="v">412.803</div><div class="k">bytes de Go — un hecho</div></div>
    <div><div class="v">14</div><div class="k">items aportados</div></div>
    <div><div class="v">hace 3 días</div><div class="k">último push</div></div>
  </div>
</div>
```

| Clase | Rol |
|---|---|
| `.fc` | Raíz. **Siempre en combinación `c-card fc`** — `c-card` da fondo/borde/radio, `.fc` solo `overflow:hidden` |
| `.fc-h` | Cabecera de la tarjeta (`display:flex;align-items:baseline;gap:12px;padding:14px 20px`) |
| `.fc-h .nm` | Nombre de la fuente — **mono 14px/500** |
| `.fc-h .tag` | Etiqueta de procedencia — mono 9px, uppercase, `letter-spacing:.1em`, borde `--border-patina`, texto `--accent-text` |
| `.fc-facts` | Rejilla de hechos, **3 columnas, `gap:1px`, fondo `--border`** → *el hueco es la línea* |
| `.fc-facts>div` | Celda **opaca** (`background:var(--surface)`) — sin bordes propios |
| `.fc-facts .v` | El **valor** — mono 16px/500 |
| `.fc-facts .k` | La **clave** — sans, `--fs-micro`, `--text-muted` |

**Elementos de sistema que consume:** `c-card`, `c-btn`, `c-btn--quiet`, `c-pulse-dot`.

**Variantes:** una sola en la hoja (GitHub). El `.tag` es el eje de variación semántica
(`sin IA — API con esquema` vs. lo que corresponda a una fuente que sí pasa por IA).

**Estados:**
- **Normal** — como arriba.
- **Hover del CTA** — heredado de `.c-btn--quiet:hover` (color `--text`, borde `--border`).
- **Focus-visible del CTA** — anillo global `:focus-visible` (`2px solid var(--focus-ring)`).
- **Novedad** — `.c-pulse-dot` (sistema) con `cPulse 2.8s ease-in-out infinite`. **El pulso significa "hay algo nuevo que puedes leer": acción, no adorno.**
- **Responsive** — `@media (max-width:768px)` → `.fc-facts` pasa a **1 columna**.

---

### 2.3 · Selector de repos — `.rp` ★

Estructura literal:

```html
<div class="sp-demo rp" id="rp">
  <div class="rp-h"><b id="rpN">3 de 6 seleccionados.</b> Forks, tutoriales y config quedan fuera por defecto —
    un CV no es un volcado de GitHub.</div>
  <label class="rp-r"><input type="checkbox" checked><span class="nm">pago-conciliador</span><span class="meta">Go · 412 KB · hace 3 días</span></label>
  ...
  <label class="rp-r off"><input type="checkbox"><span class="nm">dotfiles</span><span class="meta">config personal</span><span class="why">fuera: config</span></label>
</div>
```

| Clase | Rol |
|---|---|
| `.rp` | Raíz. **No usa `c-card`**: define su propio `border`, `radius-md`, `overflow:hidden` |
| `.rp-h` | Cabecera-contador. Fondo `--surface-elevated`, mono `--fs-micro`, `--text-muted` |
| `.rp-h b` | El **contador vivo** (`#rpN`) — `--text`, peso 500 |
| `.rp-r` | Fila de repo. **Es un `<label>`** (todo el renglón activa el checkbox) |
| `.rp-r input` | Checkbox **nativo**, `accent-color:var(--patina-500)`, `transform:translateY(1px)` |
| `.rp-r .nm` | Nombre del repo — `--text`, `min-width:160px` |
| `.rp-r .meta` | Hechos (`Go · 412 KB · hace 3 días`) — `--text-subtle`, `flex:1` |
| `.rp-r .why` | **Razón de exclusión** — 10px, uppercase, `letter-spacing:.06em`, `--text-subtle` |

**Variantes de fila:**
- **`.rp-r`** (dentro, checkbox `checked`) — `.nm` en `--text`.
- **`.rp-r.off`** (fuera, checkbox sin `checked`) — `.nm` **y** `.meta` bajan a `--text-subtle`; lleva `.why`.

> ⚠️ La clase `off` y el estado `checked` **están acoplados**: `off === !checked`. El JS los mantiene sincronizados. En React se **deriva**, no se guarda dos veces.

**Estados:** normal · `off` · focus-visible (anillo del sistema sobre el `<input>`) · hover (no hay estilo propio de hover en la fila — **no lo inventes**).

**Contenido literal de las 6 filas:**

| checked | `.nm` | `.meta` | `.why` |
|---|---|---|---|
| ✓ | `pago-conciliador` | `Go · 412 KB · hace 3 días` | — |
| ✓ | `idempotency-go` | `Go · 214 KB · 41 commits` | — |
| ✓ | `reservas-club` | `Django · en producción` | — |
| — | `dotfiles` | `config personal` | `fuera: config` |
| — | `awesome-go (fork)` | `sin commits propios` | `fuera: fork` |
| — | `tarea-redes` | `curso 2017` | `fuera: tutorial` |

---

### 2.4 · Switch — `.sw`

```html
<button class="sw" role="switch" aria-checked="true" id="sw1"></button>
```

Switch **CSS puro sobre atributo**: `42×24px`, pista `--surface-sunken` + borde `--border-strong`;
el tirador es el pseudo-elemento `::after` (`16×16px`, `background:var(--text-muted)`).

| Estado | Selector | Pista | Tirador |
|---|---|---|---|
| **Apagado** | `.sw` (`aria-checked="false"`) | `--surface-sunken`, borde `--border-strong` | `--text-muted`, `left:3px` |
| **Encendido** | `.sw[aria-checked="true"]` | **`--patina-700`**, `border-color:transparent` | **`#EAF5F1`**, `transform:translateX(18px)` |

Transiciones: pista `background .14s`; tirador `transform .18s var(--ease-standard), background .14s`.

> ⚠️ **El estado vive en el atributo `aria-checked`, no en una clase.** Si el DOM no lleva
> `aria-checked="true"`, el switch **no se mueve**. Este es el punto exacto donde se rompe en React.
>
> ⚠️ `#EAF5F1` es un **hex literal** (el único fuera de tokens en esta hoja). La hoja lo justifica:
> *«el switch relleno usa patina-700 con tirador claro (#EAF5F1 — no es texto)»*. **Cópialo tal cual.**

**Estados presentes:** on · off · focus-visible (anillo global). **No hay** `disabled` ni `hover` propios.

---

### 2.5 · Filas de estado de IA — `.ia-st` / `.ia-row`

| Clase | Rol |
|---|---|
| `.ia-st` | Contenedor (`display:grid;gap:10px`) |
| `.ia-row` | Fila (`flex`, `gap:14px`, `align-items:center`, `padding:13px 18px`, borde `--border`, `radius-md`, `--surface`) |
| `.ia-row .lbl` | Etiqueta — sans 13px/500, `min-width:150px` |
| `.ia-row .d` | Descripción — sans, `--fs-data`, `--text-muted`, `flex:1` |
| `.ia-row .st` | Estado — mono 10px/500, uppercase, `letter-spacing:.08em`. **El color va inline, no hay clase.** |

**Las 4 variantes (todas presentes en la hoja):**

| Variante | `aria-checked` | `.lbl` | `.st` (texto) | color de `.st` (inline) | Borde de la fila |
|---|---|---|---|---|---|
| **IA encendida** | `true` | `IA encendida` | `activa` | `style="color:var(--accent-text)"` | por defecto |
| **IA apagada** | `false` | `IA apagada` | `manual` | `style="color:var(--text-muted)"` | por defecto |
| **BYOK** | `true` | `BYOK` | `clave propia` | `style="color:var(--accent-text)"` | por defecto |
| **Proveedor caído** | `true` | `Proveedor caído` | `error` | `style="color:var(--danger)"` | `style="border-style:dashed;border-color:color-mix(in srgb,var(--danger) 40%,transparent)"` |

> ⚠️ **Los colores de `.st` y el borde de error son estilos INLINE en la referencia, no clases.**
> No los "normalices" a `.ia-row--error` sin mandato: son parte de la copia literal.
> (Si el equipo decide crear la clase, el **valor CSS debe ser idéntico**.)

**Responsive:** `@media (max-width:768px)` → `.ia-row{flex-wrap:wrap}`.

---

### 2.6 · Skeleton — `.skel-demo` + `.c-skel` (sistema)

```html
<div class="sp-demo skel-demo">
  <div class="c-skel" style="height:48px"></div>
  <div class="c-skel" style="height:48px;width:82%"></div>
  <div class="c-skel" style="height:48px;width:64%"></div>
</div>
```

`.skel-demo` es solo `display:grid;gap:8px`. **El skeleton en sí es del sistema** (`.c-skel`:
`--surface-elevated`, `radius 4px`, `color:transparent!important`, animación `cSkel 1.6s ease-in-out infinite`
— pulso de **opacidad**, sin color de marca).

Las alturas (`48px`) y anchos escalonados (`100%` / `82%` / `64%`) van **inline** y son load-bearing:
comunican "tres filas de lista, la última más corta".

---

## 3 · CSS específico VERBATIM (fuera de `data-corpus-system`)

Es el **segundo `<style>`** de la hoja (sin atributo). Copia literal, sin reformatear:

```css
.sp-main{flex:1;padding:34px 0 120px}
.sp-col{max-width:860px;margin-inline:auto}
.sp-g{margin-top:44px}
.sp-gh{display:flex;align-items:baseline;gap:12px;padding-bottom:8px}
.sp-note{margin-top:10px;font:400 var(--fs-micro)/1.8 var(--font-mono);color:var(--text-subtle);max-width:78ch}
.sp-note b{color:var(--text-muted);font-weight:500}
.sp-demo{margin-top:14px}
/* fuente conectada */
.fc{overflow:hidden}
.fc-h{display:flex;align-items:baseline;gap:12px;padding:14px 20px}
.fc-h .nm{font:500 14px/1 var(--font-mono)}
.fc-h .tag{font:500 9px/1 var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--accent-text);border:1px solid var(--border-patina);border-radius:4px;padding:4px 7px}
.fc-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border-top:1px solid var(--border)}
.fc-facts>div{background:var(--surface);padding:11px 20px 13px}
.fc-facts .v{font:500 16px/1.1 var(--font-mono)}
.fc-facts .k{margin-top:4px;font:400 var(--fs-micro)/1.4 var(--font-sans);color:var(--text-muted)}
/* selector de repos */
.rp{border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden}
.rp-h{padding:11px 18px;font:400 var(--fs-micro)/1.6 var(--font-mono);color:var(--text-muted);background:var(--surface-elevated)}
.rp-h b{color:var(--text);font-weight:500}
.rp-r{display:flex;align-items:baseline;gap:12px;padding:9px 18px;border-top:1px solid var(--border);background:var(--surface);font:400 var(--fs-data)/1.5 var(--font-mono)}
.rp-r input{accent-color:var(--patina-500);transform:translateY(1px)}
.rp-r .nm{color:var(--text);min-width:160px}
.rp-r .meta{color:var(--text-subtle);flex:1}
.rp-r .why{color:var(--text-subtle);font-size:10px;letter-spacing:.06em;text-transform:uppercase}
.rp-r.off .nm,.rp-r.off .meta{color:var(--text-subtle)}
/* switch + estados IA */
.sw{position:relative;width:42px;height:24px;border-radius:12px;background:var(--surface-sunken);border:1px solid var(--border-strong);transition:background .14s;flex:none;cursor:pointer}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--text-muted);transition:transform .18s var(--ease-standard),background .14s}
.sw[aria-checked="true"]{background:var(--patina-700);border-color:transparent}
.sw[aria-checked="true"]::after{transform:translateX(18px);background:#EAF5F1}
.ia-st{display:grid;gap:10px}
.ia-row{display:flex;gap:14px;align-items:center;padding:13px 18px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface)}
.ia-row .lbl{font:500 13px/1.3 var(--font-sans);min-width:150px}
.ia-row .d{flex:1;font:400 var(--fs-data)/1.6 var(--font-sans);color:var(--text-muted)}
.ia-row .st{font:500 10px/1 var(--font-mono);letter-spacing:.08em;text-transform:uppercase}
/* skeleton */
.skel-demo{display:grid;gap:8px}
@media (max-width:768px){.fc-facts{grid-template-columns:1fr}.ia-row{flex-wrap:wrap}}
```

### 3.1 · `@keyframes` propios

**Ninguno.** Esta hoja **no define ningún `@keyframes` fuera de `data-corpus-system`.**
Todo el movimiento visible viene del sistema: `cPulse` (`.c-pulse-dot`), `cSkel` (`.c-skel`),
y las transiciones de `[data-reveal]` / `.c-divider`.

### 3.2 · Estilos inline load-bearing (NO son decoración)

Se reproducen tal cual — no existen como clase:

```html
<!-- header: subtítulo de la hoja -->
style="margin-left:14px;font:500 var(--fs-micro)/1 var(--font-mono);letter-spacing:.14em;color:var(--text-muted)"

<!-- .fc-h: empuja el CTA a la derecha -->
style="margin-left:auto"

<!-- .ia-row .st: el color del estado -->
style="color:var(--accent-text)"
style="color:var(--text-muted)"
style="color:var(--danger)"

<!-- .ia-row de error: borde punteado de peligro -->
style="border-style:dashed;border-color:color-mix(in srgb,var(--danger) 40%,transparent)"

<!-- skeletons -->
style="height:48px"
style="height:48px;width:82%"
style="height:48px;width:64%"
```

---

## 4 · Comportamiento JS

El **tercer `<script>`** (sin `data-corpus-system`), IIFE en `'use strict'`. Copia literal:

```js
(function(){
'use strict';
const M=window.CorpusMotion;
document.addEventListener('click',e=>{
  const sw=e.target.closest('.sw');
  if(sw)sw.setAttribute('aria-checked',String(sw.getAttribute('aria-checked')!=='true'));
});
document.getElementById('rp').addEventListener('change',()=>{
  const n=[...document.querySelectorAll('#rp input')].filter(i=>i.checked).length;
  document.getElementById('rpN').textContent=n+' de 6 seleccionados.';
  document.querySelectorAll('#rp .rp-r').forEach(r=>r.classList.toggle('off',!r.querySelector('input').checked));
});
M.stagger(document.querySelector('.sp-col'),{step:70,cap:24,items:document.querySelectorAll('.sp-g')});
M.boot();
})();
```

### 4.1 · Los tres comportamientos

**(a) Toggle del switch — delegación global**
Un único listener de `click` en `document`. Busca el `.sw` más cercano y **invierte el atributo
`aria-checked`** (string `"true"`/`"false"`). No hay clase de estado: **el atributo ARIA *es* el estado**.
Como `.sw` es un `<button>`, Enter y Espacio disparan `click` → **el switch ya funciona con teclado**.

**(b) Contador del selector de repos**
Listener de `change` sobre `#rp` (delegado por burbujeo desde los `<input>`):
1. Cuenta los `input:checked` dentro de `#rp`.
2. Escribe `` `${n} de 6 seleccionados.` `` en el `textContent` de `#rpN` (el `<b>`).
   El **6 está hardcodeado**; la segunda frase (`Forks, tutoriales y config…`) es un nodo de texto
   **hermano** del `<b>`, no se toca.
3. Sincroniza la clase `off` en cada `.rp-r`: `off = !checked`.

**(c) Montaje escalonado**
`M.stagger(scope=.sp-col, {step:70, cap:24, items: todas las .sp-g})` → a cada `.sp-g` le pone
`data-reveal="soft"` y `--d: 0/70/140/210 ms`, y en el doble-rAF siguiente le añade `data-visible`.
Después `M.boot()` dibuja los `.c-divider` (`transform:scaleX(0)→scaleX(1)`, 1s `--ease-signature`).

> `step:70` diverge del token `--stagger-step: 80ms` y del default de `motion.js`. **Es intencional en
> la hoja: cópialo (70), no lo "corrijas" a 80.**

### 4.2 · Sistema que la hoja NO usa

- **`CorpusAurora.mount()` nunca se llama** y no existe nodo `.c-aurora` en el `<body>`.
  La hoja es **muro opaco** (`<main class="sp-main c-wall">`). **No hay fondo vivo aquí.**
- `M.shimmer()` **no se invoca**. Correcto: el shimmer está reservado al fin de ingesta.
- `M.io()` no se usa (no es documento de lectura larga).

### 4.3 · Degradación con `prefers-reduced-motion: reduce`

Gratis, vía sistema: `M.stagger` sigue mostrando (los estados base fuera del media query **son los
finales**), `.c-pulse-dot` y `.c-skel` dejan de animar pero **conservan su color/forma**.
Se pierde el movimiento, **nunca la información**.

---

## 5 · Copy verbatim

### Header
- Logo: `Corpus` → `../index.html`
- Subtítulo: `COMPONENTES · FUENTES Y ESTADOS DE IA`
- CTA derecha: `procedencia →` → `procedencia.html`

### Título de la hoja
- `<h2>`: `Fuentes conectadas y estados de IA`

### Sección `fuente-conectada`
- Overline: `Fuente conectada (GitHub — la estrella)`
- `.nm`: `github.com/dgatica`
- `.tag`: `sin IA — API con esquema`
- Botón: `2 repos con actividad — leer` *(precedido de `.c-pulse-dot` + `&nbsp;`)*
- Hechos:
  | `.v` | `.k` |
  |---|---|
  | `412.803` | `bytes de Go — un hecho` |
  | `14` | `items aportados` |
  | `hace 3 días` | `último push` |
- Nota: `La cifra <b>es</b> el contenido: nada de «Conecta tu GitHub» con un icono. El pulso de pátina señala que hay algo nuevo que <b>puedes</b> leer (acción, no adorno).`

### Sección `selector-repos`
- Overline: `★ Selector de repos — default sensato, decisión tuya`
- `.rp-h`: `<b>3 de 6 seleccionados.</b> Forks, tutoriales y config quedan fuera por defecto — un CV no es un volcado de GitHub.`
- Filas (ver tabla §2.3): `pago-conciliador` · `Go · 412 KB · hace 3 días` — `idempotency-go` · `Go · 214 KB · 41 commits` — `reservas-club` · `Django · en producción` — `dotfiles` · `config personal` · `fuera: config` — `awesome-go (fork)` · `sin commits propios` · `fuera: fork` — `tarea-redes` · `curso 2017` · `fuera: tutorial`

### Sección `estados-ia`
- Overline: `Toggle y estados de IA`

| `.lbl` | `.d` | `.st` |
|---|---|---|
| `IA encendida` | `extrae, compara y reformula — siempre con origen citado; nunca inventa` | `activa` |
| `IA apagada` | `modo manual completo — legítimo, no degradado; todo lo que escribes queda con origen: tú` | `manual` |
| `BYOK` | `tu propia clave (Anthropic / Gemini) — cifrada, usada solo en tus extracciones` | `clave propia` |
| `Proveedor caído` | `«El proveedor de IA no responde (error 529). Tu trabajo manual sigue intacto; reintenta en unos minutos.»` | `error` |

- Nota: `El switch relleno usa <b>patina-700</b> con tirador claro (#EAF5F1 — no es texto). El error no bloquea el modo manual: la IA es una capa, no el piso.`

### Sección `skeleton`
- Overline: `Carga (skeleton) — pulso neutro, NO es el shimmer`
- Nota: `El shimmer de pátina existe <b>una sola vez</b> en el producto (fin de ingesta) y es autolimitado en código. El skeleton pulsa opacidad, sin color de marca.`

> **Detalles ortotipográficos que hay que respetar:** comillas angulares `« »`, guion largo `—`
> (no `-`), punto de separación de miles `412.803` (locale `es-CL`), estrella `★` en los overlines
> destacados, flecha `→` en `procedencia →`, y el `&nbsp;` entre el pulse-dot y el texto del botón.

---

## 6 · A11y

### Lo que la referencia hace bien
- **`.rp-r` es un `<label>`** que envuelve el `<input type="checkbox">` nativo → nombre accesible
  implícito, área de clic completa, foco y teclado gratis. **No lo sustituyas por un div custom.**
- **`.sw` es un `<button role="switch" aria-checked>`** → operable con Enter/Espacio; el estado se
  anuncia correctamente por el atributo ARIA (que además es lo que dibuja el CSS).
- **Nunca solo color:** el estado de IA se dice con **palabra** (`activa` / `manual` / `clave propia`
  / `error`) además del color; el error añade **borde punteado** (`border-style:dashed`) — legible en
  daltonismo y en impresión B/N. Igual que la exclusión de repos, que se dice con `.why`
  (`fuera: fork`), no solo con el gris.
- **Focus-visible** universal del sistema: `2px solid var(--focus-ring); outline-offset:2px`.
- **Contrastes**: todos los pares usados están en la tabla verificada de tokens (`--text-subtle` es el
  límite AA en ambos temas). El tirador `#EAF5F1` sobre `--patina-700` **no es texto**, no aplica ratio.
- `prefers-reduced-motion` cubierto por el sistema.

### Huecos reales que hay que cerrar al portar (la referencia NO los resuelve)

1. **`.sw` no tiene nombre accesible.** El `<button role="switch">` está **vacío** y el `.lbl`
   contiguo no está asociado. Un lector de pantalla anuncia *"switch, activado"* sin decir **qué**.
   → **Al portar:** `aria-labelledby` apuntando al `.lbl` (o `aria-label`). *No cambia ni una clase.*
2. **`.ia-row` de error no se anuncia.** El mensaje `«El proveedor de IA no responde (error 529)…»`
   aparece sin `role="status"` / `aria-live`.
   → **Al portar:** el contenedor del error debería ser `role="status"` (`aria-live="polite"`).
3. **`#rpN` cambia sin anuncio.** El contador se reescribe en `change` sin región viva.
   → **Al portar:** `aria-live="polite"` en `.rp-h` (el `<b>` cambia dentro).
4. **Los `.c-skel` no declaran carga.** Son `<div>` decorativos sin `aria-hidden` ni `aria-busy` en el
   contenedor.
   → **Al portar:** `aria-busy="true"` en el contenedor de la lista + `aria-hidden="true"` en los skeletons.
5. **No hay estado `disabled`** en `.sw` (`componentes.md` regla 6 lo exige por componente).
   → **Al portar:** el sistema ya define `[disabled],[aria-disabled="true"]{opacity:.42;pointer-events:none}`
   para `.c-btn`; para `.sw` hay que **añadir la regla**, no improvisarla en cada uso.

---

## 7 · Traducción a React — SIN cambiar las clases CSS

### Regla de oro del port

> El CSS específico de §3 se copia **verbatim** a una hoja **global** (`styles/componentes/fuentes-ia.css`),
> importada una vez. **PROHIBIDO CSS Modules / `styled-components` / Tailwind** aquí: renombrarían
> `.fc`, `.rp`, `.sw`, `.nm`, `.meta`, `.why`, `.lbl`, `.d`, `.st`, `.v`, `.k` — y **los nombres de clase
> son el contrato**. Se escribe `className="fc-h"`, literal.

### 7.1 · `<FuenteConectada>`

```tsx
// clases: c-card fc · fc-h · nm · tag · fc-facts · v · k
type Hecho = { v: string; k: string };            // v ya viene FORMATEADO ("412.803", "hace 3 días")
type FuenteConectadaProps = {
  nombre: string;                                  // "github.com/dgatica"
  tag: string;                                     // "sin IA — API con esquema"
  hechos: Hecho[];                                 // 3 en la referencia
  novedad?: { texto: string; onLeer: () => void }; // "2 repos con actividad — leer"
};
```
- Raíz: `<div className="c-card fc">`.
- El CTA: `<span style={{marginLeft:'auto'}}><button className="c-btn c-btn--quiet"><span className="c-pulse-dot"/>&nbsp;{texto}</button></span>` — **el `margin-left:auto` inline y el `&nbsp;` son parte de la referencia.**
- `v` es **string ya formateado**, no `number`. El formateo vive fuera (locale `es-CL`, igual que `CorpusMotion.counter`). *Nunca inventes el destino de un contador.*
- Si el valor todavía se está cargando → renderiza `<div className="c-skel" style={{height:48}}/>` en su lugar (§7.5).

### 7.2 · `<SelectorRepos>` ★

```tsx
// clases: rp · rp-h · rp-r · off · nm · meta · why
type Repo = { id: string; nm: string; meta: string; why?: string };
type SelectorReposProps = {
  repos: Repo[];
  seleccionados: Set<string>;                      // controlado
  onToggle: (id: string, checked: boolean) => void;
  nota: string;                                    // "Forks, tutoriales y config quedan fuera…"
};
```
- `<div className="rp">` (**sin `c-card`** — `.rp` trae su propio borde).
- Cabecera: `<div className="rp-h" aria-live="polite"><b>{n} de {repos.length} seleccionados.</b> {nota}</div>`
  — el `<b>` y el nodo de texto hermano se mantienen separados. El `6` deja de estar hardcodeado
  (`repos.length`), y **eso es lo único que cambia respecto al JS de la hoja.**
- Cada fila es `<label className={`rp-r${checked ? '' : ' off'}`}>` con `<input type="checkbox" checked={checked} onChange={…}/>`.
  **`off` se DERIVA de `checked`** — nunca dos fuentes de verdad.
- El checkbox es **nativo** (`accent-color: var(--patina-500)`). No lo reemplaces.

### 7.3 · `<Switch>`

```tsx
// clase: sw   ·   el estado vive en aria-checked, NO en una clase
type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  labelId?: string;        // id del .lbl → aria-labelledby (cierra el hueco a11y nº1)
  disabled?: boolean;
};
```
```tsx
<button
  type="button"
  className="sw"
  role="switch"
  aria-checked={checked}            // React lo serializa a "true"/"false" — es lo que el CSS lee
  aria-labelledby={labelId}
  aria-disabled={disabled || undefined}
  onClick={() => !disabled && onChange(!checked)}
/>
```
> ⚠️ **El fallo clásico:** guardar el estado en `className={checked && 'is-on'}`. El CSS de la
> referencia solo mira `[aria-checked="true"]` → el tirador **no se movería nunca**.
> `type="button"` es obligatorio: dentro de un `<form>`, un `<button>` sin `type` envía el formulario.

### 7.4 · `<IaEstadoRow>`

```tsx
// clases: ia-st (contenedor) · ia-row · lbl · d · st
type IaEstadoRowProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;                                    // "IA encendida" | "BYOK" | "Proveedor caído"
  descripcion: string;
  estado: string;                                   // "activa" | "manual" | "clave propia" | "error"
  tono: 'accent' | 'muted' | 'danger';              // → color inline de .st
  error?: boolean;                                  // → borde punteado inline de la fila
};
```
- Mapa de `tono` → **el valor inline exacto de la referencia**:
  ```ts
  const TONO = {
    accent: 'var(--accent-text)',
    muted:  'var(--text-muted)',
    danger: 'var(--danger)',
  } as const;
  ```
- Fila de error → **el mismo estilo inline, literal**:
  ```tsx
  style={error ? {borderStyle:'dashed', borderColor:'color-mix(in srgb,var(--danger) 40%,transparent)'} : undefined}
  ```
  y añade `role="status"` (hueco a11y nº2). **El valor CSS no se toca.**
- El `.lbl` lleva un `id` que se pasa al `<Switch labelId>`.
- Contenedor: `<div className="ia-st">`.

### 7.5 · `<Skeleton>`

```tsx
// clase de SISTEMA: c-skel  ·  el contenedor de la demo era .skel-demo (andamiaje, no producto)
type SkeletonProps = { height?: number | string; width?: number | string };
const Skeleton = ({height = 48, width}: SkeletonProps) =>
  <div className="c-skel" aria-hidden="true" style={{height, ...(width ? {width} : {})}} />;
```
- La lista contenedora lleva `aria-busy="true"` mientras carga (hueco a11y nº4).
- **Jamás le pongas color de marca ni le llames `shimmer`.** El shimmer de pátina es otro componente,
  ocurre **una vez** en todo el producto y está autolimitado en `CorpusMotion.shimmer()`.

### 7.6 · Escalonado de montaje (`.sp-g`)

El `M.stagger(...{step:70, cap:24})` es **andamiaje de la hoja de revisión**, no producto. Si se
reproduce en una pantalla real:

```tsx
useEffect(() => { CorpusMotion.stagger(ref.current, {step:70, cap:24, items: ref.current.children}); }, []);
```
Debe ejecutarse **una sola vez tras el montaje** y respetar el doble-`requestAnimationFrame` interno
de `motion.js` — con StrictMode (doble montaje en dev) hay que asegurar idempotencia (el helper solo
añade atributos, así que reejecutarlo es inofensivo, pero **no lo llames en cada render**).

### 7.7 · Tabla resumen

| Componente HTML | React propuesto | Clases que **NO** cambian |
|---|---|---|
| `.c-card.fc` | `<FuenteConectada>` | `c-card fc fc-h nm tag fc-facts v k` |
| `.rp` | `<SelectorRepos>` + `<RepoRow>` | `rp rp-h rp-r off nm meta why` |
| `.sw` | `<Switch>` | `sw` (+ atributo `aria-checked`) |
| `.ia-st` / `.ia-row` | `<IaEstadoList>` / `<IaEstadoRow>` | `ia-st ia-row lbl d st` |
| `.c-skel` | `<Skeleton>` | `c-skel` |
| `.sp-*` | (andamiaje — **no portar a producto**) | `sp-main sp-col sp-g sp-gh sp-note sp-demo skel-demo` |
