# Spec — `03-componentes/procedencia.html`

> **REGLA MADRE.** Este documento es una transcripción, no una interpretación.
> Los nombres de clase (`it`, `it-h`, `it-orig`, `it-frag`, `it-ask`, `sk`, `sk-grid`, `sp-*`)
> **son el contrato diseño↔código y NO se renombran** — ni a BEM, ni a camelCase, ni a
> CSS Modules con hash. El CSS de la §3 se copia carácter a carácter.
> El bloque `<style data-corpus-system="css">` y `<script data-corpus-system="js">` NO se
> transcriben aquí: son copia del sistema canónico (`02-sistema/*`), ya lo tenemos.

- **Fuente:** `Corpus_ diseño completo/corpus-design/03-componentes/procedencia.html`
- **Contexto:** `Corpus_ diseño completo/corpus-design/03-componentes/componentes.md`
- **`<html lang="es" data-theme="dark">`** · título: `Corpus — Componentes · procedencia y verificación`
- **Fuentes web:** `Playfair Display` (ital,wght 0,500;0,600;1,500), `Geist` (400;500;600), `Geist Mono` (400;500)

---

## 1 · Qué familia de componentes es y dónde se usa

Es la **familia de procedencia y verificación**: el conjunto de componentes que hace *creíble*
el producto. Su tesis, escrita en la propia hoja:

> el nivel se deriva de un **hecho** (el fragmento aparece / coincide difuso / no aparece),
> nunca del auto-reporte del LLM.

Y su regla dura de accesibilidad/impresión:

> «sin evidencia» jamás se señala solo con color: borde punteado + glifo + palabra.

**Tres piezas, tres secciones** (`<section class="sp-g" data-screen-label="…">`):

| `data-screen-label` | Pieza | Marcada como ★ en la hoja |
|---|---|---|
| `niveles` | Niveles de verificación (`.c-ver`, sistema) | no |
| `item-procedencia` | ★ Tarjeta de item con procedencia | sí |
| `skill-evidencia` | ★ Skill con evidencia — «el componente que nadie más tiene» | sí |

**Dónde se usa en el producto** (según `componentes.md` y el resto del corpus):
- **Staging / revisión con procedencia** → `.it` (tarjeta de item) es la unidad de la lista de
  revisión: cada viñeta extraída se muestra con su nivel y su origen expandible.
- **Master / CV** → `.c-ver` acompaña a cada dato promovido.
- **Skills del perfil** → `.sk-grid` / `.sk` es la parrilla de habilidades con su evidencia real
  (bytes, repos, citas). Los ejemplos de la hoja (Go / Kubernetes) vienen del brief.
- **Hueco-como-invitación** → `.it-ask` y `.sk .ask` convierten la falta de evidencia en una
  pregunta, nunca en un regaño; al responder, el item pasa a **origen: tú**.

⚠️ **La página NO monta la aurora.** No hay `.c-aurora` en el DOM ni llamada a
`CorpusAurora.mount()`; el `<main>` es `.c-wall` (opaco, `background:var(--bg)`). Tampoco hay
panel `.demo` ni conmutador de tema: la hoja se ve **solo en grafito**. Ver §Riesgos.

---

## 2 · Inventario de componentes — uno por uno

### 2.0 — Chrome de la hoja (shell de spec, no es producto)

| Elemento | Clases exactas | Notas |
|---|---|---|
| Página | `c-page` | sistema |
| Header | `c-header` > `c-container` | sistema, sticky 64px |
| Logo | `a.c-logo` → `href="../index.html"` | sistema |
| Etiqueta de hoja | `<span>` con `style` inline (ver §5) | **estilo inline, no clase** |
| Salida | `div.hd-right` > `a.c-btn.c-btn--quiet` → `href="controles.html"` | sistema |
| Main | `main.sp-main.c-wall` | `sp-main` propia + `c-wall` sistema |
| Columna | `div.c-container.sp-col` | ancho máx. 860px |
| Título | `<h2>` | Playfair vía `h2` del sistema |
| Nota de cabecera | `p.sp-note` + `style="font-size:var(--fs-data)"` | **override inline a 12px** |

**Grupo de sección (repetido ×3):**
```html
<section class="sp-g" data-screen-label="…">
  <div class="sp-gh"><span class="t-overline">…</span></div><hr class="c-divider">
  <div class="sp-demo">…</div>
  <p class="sp-note">…</p>
</section>
```
- `sp-g` — bloque de sección (`margin-top:44px`); **es la unidad del escalonado** (§4).
- `sp-gh` — cabecera del grupo (flex, baseline).
- `hr.c-divider` — hairline del sistema; se dibuja con `scaleX(0→1)` al recibir `[data-visible]`.
- `sp-demo` — contenedor de la demo. En `skill-evidencia` se combina: `class="sp-demo sk-grid"`.
  En `niveles` lleva `style="display:flex;gap:22px;flex-wrap:wrap"` **inline**.
- `sp-note` — nota al pie del grupo, mono 11px; admite `<b>` (sube a `--text-muted`, weight 500).

---

### 2.1 — Nivel de verificación · `.c-ver` (**del sistema**, no propia)

Definida en `data-corpus-system`. Se inventaría porque **es el átomo de la familia**.

| Variante | Clases exactas | Glifo `::before` | Color |
|---|---|---|---|
| Verificado | `c-ver c-ver--ok` | `●` (9px) | `--ver-ok` = `--patina-300` |
| Parcial | `c-ver c-ver--partial` | `◐` (9px) | `--ver-partial` = `--text-muted` |
| Sin evidencia | `c-ver c-ver--none` | `⚠` (**11px**) | `--ver-none` = `--danger` |

- Tipografía: `500 var(--fs-micro)/1 var(--font-mono)`, `letter-spacing:.08em`, `text-transform:uppercase`.
- **Nunca solo color**: glifo (`::before`) + palabra (texto) + —en «sin evidencia»— borde punteado
  en el contenedor (`.c-noev`).
- **Compañera obligada:** `.c-noev` → `border:1px dashed color-mix(in srgb,var(--danger) 55%,transparent)!important`.
- Estados: no tiene hover/focus — es un indicador, no un control.
- Existe una **cuarta forma de texto** creada en runtime por el JS:
  `<span class="c-ver c-ver--ok">verificado · origen: tú</span>` (misma variante `--ok`, copy distinto).

---

### 2.2 — ★ Tarjeta de item con procedencia · `.it`

**Anatomía** (literal del `sp-note` de la sección):
> contenido · nivel · **origen expandible con el fragmento literal resaltado** · y en los huecos,
> una invitación con input — nunca un regaño.

```html
<div class="c-card it">
  <div class="it-h">
    <span class="tx">…contenido… <span class="t-num">~40.000</span>…</span>
    <span class="c-ver c-ver--ok">verificado</span>
    <button class="it-orig" data-o="f1">origen ▾</button>
  </div>
  <div class="it-frag" id="f1"><span class="from">texto pegado — 12 jul</span>«…<mark>…</mark>.»</div>
</div>
```

| Sub-elemento | Clases exactas | Rol |
|---|---|---|
| Raíz | `c-card it` | `c-card` = superficie del sistema; `it` anula padding y recorta (`overflow:hidden`) |
| Cabecera | `it-h` | flex, `align-items:baseline`, `padding:13px 18px`, `font-size:13.5px` |
| Contenido | `span.tx` (dentro de `.it-h`) | `flex:1` |
| Cifra dentro del texto | `span.t-num` (sistema) | dentro de `.tx` se re-tinta a `var(--text)` |
| Nivel | `span.c-ver.c-ver--*` | ver 2.1 |
| Disparador de origen | `button.it-orig` + `data-o="<id-del-fragmento>"` | **el `data-o` apunta al `id` del `.it-frag`** |
| Fragmento | `div.it-frag` + `id` | `display:none` por defecto; `.open` lo muestra |
| Procedencia del fragmento | `span.from` (dentro de `.it-frag`) | overline 10px, uppercase |
| Resaltado literal | `<mark>` (dentro de `.it-frag`) | fondo `rgba(95,198,169,.16)`, texto `--text` |
| Invitación | `div.it-ask` | solo en la variante sin evidencia |
| Campo | `input.c-input` (dentro de `.it-ask`) | alto 32px, `font-size:var(--fs-data)` |
| Guardar | `button#saveAsk` (dentro de `.it-ask`) | mono micro, borde `--border-strong` |

**Variantes**

| Variante | Cómo se compone | Estado inicial en la hoja |
|---|---|---|
| **Verificada** | `.c-card.it` + `.c-ver--ok` + `.it-frag` (cerrado) | fragmento cerrado, botón `origen ▾` |
| **Sin evidencia** | `.c-card.it.c-noev` + `style="margin-top:10px"` + `.c-ver--none` + `.it-frag.miss.open` + `.it-ask` | fragmento **abierto** y en rojo, con invitación |
| **Guardada (runtime)** | el JS quita `c-noev`, sustituye el `.c-ver` por `verificado · origen: tú` y reemplaza el `.it-ask` por el acuse | no existe en el HTML estático |

**Estados**

- `.it-orig` — normal `color:var(--text-muted)`; `:hover` → `color:var(--accent-text)` +
  `background:var(--surface-elevated)`. Focus: anillo global `:focus-visible`.
- `.it-frag` — cerrado (`display:none`) / abierto (`.open` → `display:block`).
- `.it-frag.miss` — `border-left-color:color-mix(in srgb,var(--danger) 50%,transparent)`
  (el borde-izquierdo por defecto es `--border-strong`).
- `.it-ask button` — `:hover` → `color:var(--accent-text)` + `border-color:var(--border-patina)`.
- `.c-input` (sistema) — `:focus` → `border-color:var(--focus-ring)` + halo
  `0 0 0 3px color-mix(in srgb,var(--focus-ring) 16%,transparent)`; **y pausa la aurora** (`focusin`).

**Etiqueta del botón de origen:** alterna `origen ▾` (cerrado) ⇄ `origen ▴` (abierto). El texto se
reescribe entero en JS (§4).

---

### 2.3 — ★ Skill con evidencia · `.sk-grid` / `.sk`

> «El componente que nadie más tiene.»
> Regla: la evidencia es **micro-tipografía real, no iconos**: bytes, repos, citas.
> Nunca un icono donde puedas poner el dato.

```html
<div class="sp-demo sk-grid">
  <div class="sk">
    <div class="top"><span class="nm">Go</span><span class="c-ver c-ver--ok">verificado</span></div>
    <div class="ev">412 KB · 3 repos · citada en 2 viñetas de experiencia<br>github.com/…</div>
  </div>
  <div class="sk" data-ver="none">
    <div class="top"><span class="nm">Kubernetes</span><span class="c-ver c-ver--none">sin evidencia</span></div>
    <div class="ev">…</div>
    <div class="ask">¿Dónde lo usaste? <button>responder — quedará como origen: tú</button></div>
  </div>
  …
</div>
```

| Sub-elemento | Clases / atributos exactos | Rol |
|---|---|---|
| Rejilla | `sk-grid` | **rejilla hairline**: `gap:1px` + `background:var(--border)` + celdas opacas. 2 columnas; 1 col. a ≤768px |
| Celda | `sk` | `background:var(--surface)`, `padding:14px 18px` |
| Fila superior | `div.top` (dentro de `.sk`) | flex baseline, `gap:10px` |
| Nombre | `span.nm` | `500 14px/1.2 var(--font-sans)` |
| Nivel | `span.c-ver.c-ver--*` | empujado a la derecha por `.sk .top .c-ver{margin-left:auto}` |
| Evidencia | `div.ev` | mono 11px, `line-height:1.7`, `--text-muted`; admite `<br>` |
| Invitación | `div.ask` | separada por `border-top:1px solid var(--border)` |
| Botón de invitación | `button` dentro de `.ask` | **sin clase**; mono micro, `color:var(--accent-text)` |

**Variantes** (por atributo, no por clase):

| Variante | Marca | Efecto visual |
|---|---|---|
| Normal | (sin `data-ver`) | `background:var(--surface)` |
| **Sin evidencia** | `data-ver="none"` | `background:color-mix(in srgb,var(--danger) 4%,var(--surface))` + anillo interior `inset 0 0 0 1px color-mix(in srgb,var(--danger) 28%,transparent)` |

Las cuatro instancias de la hoja son: **Go** (ok) · **Kubernetes** (`data-ver="none"`) ·
**Kubernetes (honesta)** (parcial) · **Inglés B2** (ok). La tercera demuestra el patrón
«declaración honesta»: nivel declarado `usuario`, resaltado con
`<b style="color:var(--text)">usuario</b>` (**hex-free, pero inline**).

**Estados:** las celdas `.sk` **no tienen hover ni son clicables**. El único control es el
`button` de `.ask` — sin `:hover` propio; hereda el `:focus-visible` global. (Hueco conocido: ver §Riesgos.)

---

## 3 · CSS específico VERBATIM (fuera de `data-corpus-system`)

Segundo `<style>` de la hoja, **sin bloque `<style>`, tal cual, íntegro** (líneas 488–522):

```css
.sp-main{flex:1;padding:34px 0 120px}
.sp-col{max-width:860px;margin-inline:auto}
.sp-g{margin-top:44px}
.sp-gh{display:flex;align-items:baseline;gap:12px;padding-bottom:8px}
.sp-note{margin-top:10px;font:400 var(--fs-micro)/1.8 var(--font-mono);color:var(--text-subtle);max-width:78ch}
.sp-note b{color:var(--text-muted);font-weight:500}
.sp-demo{margin-top:14px}
/* tarjeta de item con procedencia */
.it{padding:0;overflow:hidden}
.it-h{display:flex;gap:12px;align-items:baseline;padding:13px 18px;font-size:13.5px;line-height:1.55}
.it-h .tx{flex:1}
.it-h .tx .t-num{color:var(--text)}
.it-orig{font:500 10px/1 var(--font-mono);color:var(--text-muted);padding:5px 8px;border-radius:4px;cursor:pointer;white-space:nowrap}
.it-orig:hover{color:var(--accent-text);background:var(--surface-elevated)}
.it-frag{display:none;margin:0 18px 14px;padding:12px 16px;background:var(--surface-sunken);
  border-left:2px solid var(--border-strong);border-radius:0 6px 6px 0;font:400 var(--fs-data)/1.7 var(--font-mono);color:var(--text-muted)}
.it-frag.open{display:block}
.it-frag .from{display:block;margin-bottom:6px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-subtle)}
.it-frag mark{background:rgba(95,198,169,.16);color:var(--text);padding:0 3px;border-radius:2px}
.it-frag.miss{border-left-color:color-mix(in srgb,var(--danger) 50%,transparent)}
.it-ask{margin:0 18px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font:400 var(--fs-data)/1.5 var(--font-sans);color:var(--text-muted)}
.it-ask input{flex:1;min-width:200px;height:32px;font-size:var(--fs-data)}
.it-ask button{font:500 var(--fs-micro)/1 var(--font-mono);padding:8px 10px;border:1px solid var(--border-strong);border-radius:5px;color:var(--text-muted)}
.it-ask button:hover{color:var(--accent-text);border-color:var(--border-patina)}
/* skill con evidencia */
.sk-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden}
.sk{background:var(--surface);padding:14px 18px}
.sk .top{display:flex;align-items:baseline;gap:10px}
.sk .nm{font:500 14px/1.2 var(--font-sans)}
.sk .top .c-ver{margin-left:auto}
.sk .ev{margin-top:7px;font:400 var(--fs-micro)/1.7 var(--font-mono);color:var(--text-muted)}
.sk[data-ver="none"]{background:color-mix(in srgb,var(--danger) 4%,var(--surface));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--danger) 28%,transparent)}
.sk .ask{margin-top:8px;font:400 var(--fs-data)/1.5 var(--font-sans);color:var(--text-muted);border-top:1px solid var(--border);padding-top:9px}
.sk .ask button{font:500 var(--fs-micro)/1 var(--font-mono);color:var(--accent-text)}
@media (max-width:768px){.sk-grid{grid-template-columns:1fr}}
```

**`@keyframes` propios de la hoja: NINGUNO.** Todo el movimiento (`cWordIn`, `cCharIn`, `cEnter`,
`cShimmer`, `cPulse`, `cSkel`, `cSpin`) vive en `data-corpus-system` (motion.css). No los reimplementes.

**Estilos inline presentes en el HTML** (no están en el `<style>`; si se portan, hay que conservarlos):

| Elemento | `style` verbatim |
|---|---|
| `<span>` etiqueta de header | `margin-left:14px;font:500 var(--fs-micro)/1 var(--font-mono);letter-spacing:.14em;color:var(--text-muted)` |
| `p.sp-note` de cabecera | `font-size:var(--fs-data)` |
| `.sp-demo` de `niveles` | `display:flex;gap:22px;flex-wrap:wrap` |
| segunda `.c-card.it` | `margin-top:10px` |
| `.from` del fragmento `f2` | `color:var(--danger)` |
| `<b>` de la skill honesta | `color:var(--text)` |
| (runtime, JS) acuse de guardado | `color:var(--ver-ok);font:500 11px/1 var(--font-mono)` |

---

## 4 · Comportamiento JS

El bloque `<script data-corpus-system="js">` (aurora.js + motion.js) **no se transcribe**. Lo
específico de esta hoja es el último `<script>` (líneas 869–888), **IIFE con `'use strict'`**:

```js
const M=window.CorpusMotion;
document.addEventListener('click',e=>{
  const o=e.target.closest('[data-o]');
  if(o){const f=document.getElementById(o.dataset.o);f.classList.toggle('open');
    o.textContent=f.classList.contains('open')?'origen ▴':'origen ▾'}
  if(e.target.id==='saveAsk'){
    const card=e.target.closest('.it');
    const inp=card.querySelector('input');
    if(!inp.value.trim())return;
    card.classList.remove('c-noev');
    card.querySelector('.c-ver').outerHTML='<span class="c-ver c-ver--ok">verificado · origen: tú</span>';
    card.querySelector('.it-ask').innerHTML='<span style="color:var(--ver-ok);font:500 11px/1 var(--font-mono)">✓ guardado como origen manual</span>';
    card.querySelector('.it-frag').classList.remove('miss');
  }
});
M.stagger(document.querySelector('.sp-col'),{step:70,cap:24,items:document.querySelectorAll('.sp-g')});
M.boot();
```

### 4.1 · Toggle de origen (delegado en `document`)
- Se dispara con `e.target.closest('[data-o]')` → **delegación**, no listener por botón.
- `data-o` contiene el **`id`** del `.it-frag`; se resuelve con `getElementById`.
- Toggle de la clase `.open` sobre el fragmento.
- El **texto del botón se reescribe**: `origen ▴` si quedó abierto, `origen ▾` si quedó cerrado.

### 4.2 · Guardar el hueco (`#saveAsk`)
Secuencia exacta, en este orden:
1. `card = e.target.closest('.it')`
2. `inp = card.querySelector('input')` — **si `inp.value.trim()` está vacío, no hace nada** (sin mensaje de error).
3. `card.classList.remove('c-noev')` → desaparece el borde punteado.
4. Se **sustituye el primer `.c-ver` de la tarjeta** por
   `<span class="c-ver c-ver--ok">verificado · origen: tú</span>` (vía `outerHTML`).
5. Se **vacía `.it-ask`** y se pone el acuse: `✓ guardado como origen manual`.
6. `card.querySelector('.it-frag').classList.remove('miss')` → el fragmento deja de ser rojo
   (pero **sigue abierto y sigue diciendo el copy de «ninguna fuente respalda las cifras»** — ver §Contradicciones).

### 4.3 · Movimiento de montaje
- `M.stagger(document.querySelector('.sp-col'), {step:70, cap:24, items: document.querySelectorAll('.sp-g')})`
  → escalonado **de 70 ms** (no los 80 ms por defecto) sobre las **tres `<section class="sp-g">`**.
  `stagger` les pone `data-reveal="soft"` y `--d` incremental, y las revela en `raf2`.
- `M.boot()` → dibuja todos los `.c-divider` (`scaleX(0→1)`, 1 s) y revela cualquier `[data-reveal]`
  pendiente.
- Todo bajo `@media (prefers-reduced-motion: no-preference)`: con `reduce`, los estados base ya son
  los finales (`[data-reveal]{opacity:1}`) → se pierde el movimiento, nunca la información.
- **La aurora NO se monta en esta hoja** (no hay `CorpusAurora.mount()`), pero motion.js **sí**
  registra `focusin`/`focusout` globales que llamarían a `CorpusAurora.pause('focus')` /
  `resume('focus')` — inocuos aquí, obligatorios en la app real.

---

## 5 · Copy verbatim

**Cabecera**
- `<title>`: `Corpus — Componentes · procedencia y verificación`
- Logo: `Corpus`
- Etiqueta de hoja: `COMPONENTES · PROCEDENCIA Y VERIFICACIÓN`
- Botón derecha: `controles →`

**Intro**
- H2: `Procedencia y verificación`
- Nota: `La familia que hace creíble el producto. Regla dura: el nivel se deriva de un **hecho** (el fragmento aparece / coincide difuso / no aparece), nunca del auto-reporte del LLM. Y «sin evidencia» jamás se señala solo con color: borde punteado + glifo + palabra.`
  *(`hecho` va en `<b>`)*

**Sección `niveles`**
- Overline: `Niveles de verificación`
- Chips: `verificado` · `parcial` · `sin evidencia`
- Nota: `verificado = el fragmento aparece **literal** en la fuente · parcial = coincidencia difusa (se muestra qué parte) · sin evidencia = no aparece en ninguna fuente → borde punteado en su contenedor.`
  *(`literal` va en `<b>`)*

**Sección `item-procedencia`**
- Overline: `★ Tarjeta de item con procedencia`
- Item 1 · contenido: `A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias).`
  *(`~40.000` dentro de `<span class="t-num">`)*
- Item 1 · nivel: `verificado` — botón: `origen ▾`
- Item 1 · fragmento `f1` · `.from`: `texto pegado — 12 jul`
- Item 1 · fragmento `f1` · cuerpo: `«…y terminé a cargo del servicio de conciliación (Go, ~40 mil transacciones diarias).»`
  *(el `<mark>` envuelve exactamente: `a cargo del servicio de conciliación (Go, ~40 mil transacciones diarias)`)*
- Item 2 · contenido: `Reduje el tiempo de conciliación de 4 horas a 20 minutos.`
  *(`20 minutos` dentro de `<span class="t-num">`)*
- Item 2 · nivel: `sin evidencia` — botón: `origen ▾`
- Item 2 · fragmento `f2` · `.from`: `ninguna fuente respalda las cifras`
- Item 2 · fragmento `f2` · cuerpo: `Esas cifras no aparecen en ninguna fuente. Si son reales, cuéntanos de dónde salen — quedará como origen: tú.`
- Item 2 · invitación: `⚠ ¿De dónde salen las 4 horas y los 20 minutos?`
- Item 2 · placeholder del input: `Escríbelo y quedará como origen manual — el más verificable de todos`
- Item 2 · botón: `guardar`
- **Runtime tras guardar:** nivel → `verificado · origen: tú` · acuse → `✓ guardado como origen manual`
- Nota: `Anatomía: contenido · nivel · **origen expandible con el fragmento literal resaltado** · y en los huecos, una invitación con input — nunca un regaño. Al guardar, el item pasa a verificado con origen: tú.`

**Sección `skill-evidencia`**
- Overline: `★ Skill con evidencia — el componente que nadie más tiene`
- Skill 1 · nombre: `Go` · nivel: `verificado` · evidencia:
  `412 KB · 3 repos · citada en 2 viñetas de experiencia` `<br>` `github.com/dgatica/pago-conciliador · +2 más`
- Skill 2 · nombre: `Kubernetes` · nivel: `sin evidencia` · evidencia:
  `No aparece en ninguna viñeta, ni en tus repos, ni en tu portfolio.`
  · ask: `¿Dónde lo usaste?` + botón `responder — quedará como origen: tú`
- Skill 3 · nombre: `Kubernetes (honesta)` · nivel: `parcial` · evidencia:
  `tu texto: «lo usamos pero no lo administraba yo» — nivel declarado: usuario. Defendible en entrevista.`
  *(`usuario` en `<b style="color:var(--text)">`)*
- Skill 4 · nombre: `Inglés B2` · nivel: `verificado` · evidencia:
  `declarado por ti — si tienes certificado (EF SET, IELTS), adjúntalo y sube el respaldo`
- Nota: `La evidencia es **micro-tipografía real, no iconos**: bytes, repos, citas. Nunca un icono donde puedas poner el dato.`

> Ojo con los caracteres: `·` (punto medio), `—` (raya), `…` (puntos suspensivos), `«»`
> (comillas latinas), `▾`/`▴`, `★`, `⚠`, `✓`, `●`, `◐`, `~`. Copiar/pegar, no reescribir.

---

## 6 · A11y

**Lo que la hoja hace bien (y hay que preservar):**
- `<html lang="es">`.
- **Nunca solo color**: cada nivel es glifo + palabra; «sin evidencia» añade además borde punteado
  (`.c-noev`) o anillo + tinte (`.sk[data-ver="none"]`). Funciona en daltonismo y en impresión B/N.
- Contrastes verificados por tokens: `--patina-300` 9.47:1, `--text-muted` 8.83:1,
  `--text-subtle` 4.94:1 (AA al límite) sobre grafito.
- `:focus-visible` global: `outline:2px solid var(--focus-ring); outline-offset:2px`.
- `<mark>` es semántico para el fragmento literal resaltado.
- `<button>` reales para todos los controles (no `<div onclick>`).
- `<hr class="c-divider">` como separador; `prefers-reduced-motion` degrada a estado final.
- El editor es sagrado: al enfocar un campo se pausa la aurora (`focusin` en motion.js).

**Huecos reales que el port a React DEBE cerrar** (no están en el HTML):
1. `button.it-orig` no tiene `aria-expanded` ni `aria-controls`. Debe llevar
   `aria-expanded={open}` y `aria-controls={fragId}`; el `.it-frag` debe llevar `id={fragId}` (ya lo tiene) y `hidden` cuando esté cerrado.
2. `.it-ask input` **no tiene label ni `aria-label`** — solo `placeholder`. Añadir `aria-label`
   (o `<label class="c-label">` visualmente oculta) con el texto de la pregunta.
3. El acuse `✓ guardado como origen manual` **no se anuncia**: envolverlo en una región
   `aria-live="polite"` (o `role="status"`).
4. Si `inp.value.trim()` está vacío, el guardado **falla en silencio**: el botón debe quedar
   `disabled`/`aria-disabled` o emitir un mensaje.
5. Los glifos `●`/`◐`/`⚠` son `content` de `::before` → algunos lectores los verbalizan como ruido.
   La palabra ya está en el texto, así que basta con no añadir más glifos como texto real; el `⚠`
   del copy de `.it-ask` sí es texto y conviene `aria-hidden` sobre él.
6. `▾`/`▴` en el texto del botón son decorativos: el nombre accesible ideal sería
   `origen` + estado vía `aria-expanded` (no confiar en el glifo).
7. El `button` de `.sk .ask` no tiene estado `:hover` propio (solo el foco global): añadir hover
   coherente con `.it-ask button:hover`.

---

## 7 · Traducción a React — **sin cambiar ni una clase CSS**

Reglas del port:
- El CSS de §3 se importa **tal cual** (hoja global / `:global`), **jamás CSS Modules con hash**.
  `it`, `it-h`, `tx`, `it-orig`, `it-frag`, `from`, `miss`, `open`, `it-ask`, `sk-grid`, `sk`, `top`,
  `nm`, `ev`, `ask`, `sp-*` **son literales**.
- `.tx`, `.top`, `.nm`, `.ev`, `.ask`, `.from` son clases **cortas y anidadas** (`.sk .nm`, `.it-h .tx`):
  el componente **debe** renderizar la jerarquía padre correcta o el estilo no aplica.
- Los `style` inline de la tabla de §3 se conservan como `style={{…}}`.
- El estado (`open`, `saved`) es de React; el DOM **no** se manipula con `outerHTML`/`innerHTML`.

| # | Componente React | Renderiza | Props |
|---|---|---|---|
| 1 | `VerBadge` | `<span className={"c-ver c-ver--"+level}>{children ?? LABEL[level]}</span>` | `level: 'ok'\|'partial'\|'none'` · `children?: ReactNode` (para `verificado · origen: tú`) |
| 2 | `ProvenanceItem` | `<div className={cx('c-card','it', noEvidence && 'c-noev')}>` + header + fragmento + ask | `content: ReactNode` · `level` · `fragment: {from, body, missing?}` · `ask?: {question, placeholder, saveLabel}` · `defaultFragmentOpen?: boolean` · `onSave(value): void` · `savedLabel?: string` |
| 2a | `ProvenanceItemHeader` *(interno)* | `<div className="it-h">` con `<span className="tx">`, `<VerBadge/>`, `<OriginToggle/>` | `content`, `level`, `open`, `onToggle`, `fragId` |
| 2b | `OriginToggle` *(interno)* | `<button className="it-orig" aria-expanded={open} aria-controls={fragId}>{open ? 'origen ▴' : 'origen ▾'}</button>` | `open: boolean` · `fragId: string` · `onToggle()` |
| 2c | `ProvenanceFragment` *(interno)* | `<div className={cx('it-frag', missing&&'miss', open&&'open')} id={fragId}>` + `<span className="from">` + cuerpo con `<mark>` | `id` · `from: ReactNode` · `missing?: boolean` · `open: boolean` · `children` |
| 2d | `EvidenceGapAsk` *(interno)* | `<div className="it-ask">` + pregunta + `<input className="c-input">` + `<button>` **o** el acuse | `question` · `placeholder` · `saveLabel='guardar'` · `saved: boolean` · `savedLabel='✓ guardado como origen manual'` · `onSave(v)` |
| 3 | `SkillGrid` | `<div className="sk-grid">{children}</div>` | `children` · `className?` (para componer `sp-demo sk-grid`) |
| 4 | `SkillCard` | `<div className="sk" data-ver={level==='none'?'none':undefined}>` + `.top`/`.nm`/`.ev`/`.ask` | `name: string` · `level: 'ok'\|'partial'\|'none'` · `evidence: ReactNode` · `ask?: {question, buttonLabel, onAnswer}` |
| 5 | `SpecSection` *(shell)* | `<section className="sp-g" data-screen-label={label}>` + `.sp-gh`/`t-overline` + `<hr className="c-divider">` + `.sp-demo` + `.sp-note` | `label` · `overline` · `note?` · `demoClassName?` · `demoStyle?` · `children` |

**El fragmento resaltado (`<mark>`) NO se genera con `dangerouslySetInnerHTML` a partir de un
string.** El backend/pipeline debe devolver el fragmento **troceado** (`[{text, highlight:boolean}]`)
y el componente mapea a `<mark>` — así el resaltado sigue siendo un **hecho** (offsets reales),
que es literalmente la tesis de la pantalla.

**Movimiento en React:** `sp-g` sigue recibiendo `data-reveal="soft"` + `--d`. Reproducir el
`M.stagger(..., {step:70, cap:24})` con un `useEffect` que llame a `window.CorpusMotion.stagger`
(o replique `--d = min(i,24)*70ms`) y `M.boot()` para los `.c-divider`. **No reimplementar el
motion en JS de React**: el sistema ya lo hace con CSS y `data-visible`.

---

## Contradicciones y ambigüedades detectadas

1. **`f2` nace abierto pero el botón dice `origen ▾`** (glifo de «cerrado»). El primer clic lo
   *cierra* y el texto sigue siendo `origen ▾` → el usuario ve un botón que "no hace nada" en la
   etiqueta. En React el label debe derivarse del estado (`open ? '▴' : '▾'`), lo que **corrige**
   la hoja: la referencia visual estática queda con el glifo incorrecto.
2. **Tras guardar, el `.it-frag` sigue abierto y sigue diciendo** «ninguna fuente respalda las
   cifras» / «Esas cifras no aparecen en ninguna fuente…». El JS solo quita `.miss` (el color).
   El copy queda mintiendo. Hay que decidir el copy del fragmento post-guardado
   (probable: `.from` → `origen: tú — <lo que escribió>`).
3. **`id="saveAsk"` está hardcodeado** y el handler compara `e.target.id==='saveAsk'`: con dos o más
   items sin evidencia habría **ids duplicados**. En React: nada de ids globales, handler por item.
4. **La aurora no se monta** en esta hoja, pero `componentes.md` dice «con el movimiento
   funcionando» y el sistema incluye `aurora.js`. Ambigüedad: ¿los componentes se ven sobre `.c-wall`
   opaco (como aquí) o sobre la aurora? En la app real, el sistema dice «donde hay trabajo que leer,
   hay muro» → `.c-wall` es lo correcto para staging/revisión.
5. **La hoja es dark-only**: `data-theme="dark"` fijo, sin panel `.demo` ni toggle. Pero
   `componentes.md` regla 8 exige que «todo componente vive en ambos temas». El CSS propio usa solo
   tokens, salvo `.it-frag mark{background:rgba(95,198,169,.16)}` → **hex/rgba de tema hardcodeado**,
   derivado de `--patina-300`. En porcelana ese verde al 16% sobre `--surface-sunken` está sin
   verificar. **No se ha comprobado el tema claro para esta familia.**
6. `componentes.md` regla 6 exige **skeleton** «si carga» para todo componente. Ni `.it` ni `.sk`
   tienen variante skeleton (`.c-skel` existe en el sistema pero no se usa aquí).
7. `.sk .ask button` no tiene `:hover`; `.it-ask button` sí. Inconsistencia entre dos controles con
   el mismo rol («responder el hueco»).

## Riesgos de implementación (lo que se pierde/rompe si no se cuida)

- **Renombrar clases** (a BEM, camelCase o CSS Modules) rompe el contrato y los selectores
  anidados `.it-h .tx .t-num`, `.sk .top .c-ver`, `.sk[data-ver="none"]`. Es exactamente el fallo
  de las tres implementaciones anteriores.
- **Perder la rejilla hairline** (`.sk-grid{gap:1px;background:var(--border)}` + celdas opacas):
  si alguien pone `border` entre celdas en vez del hueco, el sistema se rompe («el hueco es la línea»).
- **Perder `overflow:hidden` en `.sk-grid`** → las esquinas de la rejilla dejan de redondearse.
- **Perder `.it{padding:0;overflow:hidden}`** → `.c-card` recupera su padding y la anatomía se descuadra.
- **`data-ver="none"` como atributo**, no como clase: un `classNames()` mecánico lo perderá.
- **`c-noev` usa `!important`**: cualquier `border` que React añada al `.c-card` no lo vencerá — y
  esa es la intención (nunca solo color).
- **13.5px, 78ch, 860px, 44px, 34px 0 120px, 70ms** son valores medidos: no redondear.
- **`--ink-on-patina`**: si algún botón se convierte en `c-btn--patina`, el texto es tinta, nunca blanco.
- **`prefers-reduced-motion`**: todo el movimiento está dentro del media query; si se reimplementa
  con JS/Framer Motion se pierde la degradación y la información se puede quedar invisible
  (`opacity:0`) para quien reduce el movimiento.
- **`outerHTML`/`innerHTML` del JS de la hoja no debe portarse**: en React destruiría el árbol.
  Es prototipo, no arquitectura.
- **Los caracteres especiales del copy** (`·—…«»▾▴★⚠✓●◐`) se pierden si alguien "normaliza" a ASCII.
- **Tema claro sin verificar** para esta familia (ver contradicción 5).
