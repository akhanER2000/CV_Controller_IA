# Spec — `03-componentes/controles.html`

> **REGLA MADRE.** Este documento describe una **referencia visual literal**, no una sugerencia.
> Los nombres de clase (`c-*`, `sp-*`, `tv`, `xr-*`, `hg-*`) son el **contrato diseño↔código** y
> **NO CAMBIAN** al portar a React. Copia literal: CSS verbatim, copy verbatim, cero paráfrasis.
>
> Fuente: `Corpus_ diseño completo/corpus-design/03-componentes/controles.html` (899 líneas)
> Contexto: `Corpus_ diseño completo/corpus-design/03-componentes/componentes.md`
>
> Los bloques `<style data-corpus-system="css">` (líneas 10–486) y
> `<script data-corpus-system="js">` (líneas 614–885) son una **copia del sistema canónico**
> (`02-sistema/{tokens,base,aurora,motion}.css` + `{aurora,motion}.js`). **NO se transcriben aquí**:
> ya los tenemos. Este spec cubre lo **específico de la hoja**: el `<style>` sin atributo
> (líneas 487–508), el `<body>` (510–612) y el `<script>` sin atributo (886–897).

---

## 1 · Qué familia de componentes es y dónde se usa

**Es la hoja de "controles y movimiento"**: la tercera de las tres hojas autocontenidas de
`03-componentes/` (las otras dos son `procedencia.html` y `fuentes-ia.html`). Según
`componentes.md`, contiene:

> `controles.html` — tres voces tipográficas, botones (forge con glow + pátina sólida + neutro +
> quiet), campos, chips, kbd, rejilla hairline, ★ rayos-X aislado, replays de escalonado / hairline /
> contador.

No es una pantalla de producto: **no tiene ruta** (no aparece en la tabla de `06-handoff/handoff.md`)
y **no lleva panel `demo`** (aunque el CSS de `.demo` viaja dentro del bloque de sistema, esta hoja
no lo instancia). Es el **catálogo vivo** de los primitivos que las 12 pantallas de `04-pantallas/`
consumen, con el movimiento funcionando para poder verlo (los "replays").

Es también un **muro** (`<main class="sp-main c-wall">`): **no monta la aurora**. No hay
`<div class="c-aurora">` en el DOM ni llamada a `CorpusAurora.mount()`. Coherente con handoff.md:
«Solo las VENTANAS la montan […] Los MUROS ni la montan.» El módulo `CorpusAurora` se carga igual
(viene en el bloque de sistema) pero queda inerte; `motion.js` sigue llamando a
`CorpusAurora.pause('focus')` al enfocar campos y el módulo hace *no-op* porque `S.ok === false`.

Dónde se usan sus piezas en el producto:

| Pieza | Consumidores (04-pantallas/) |
|---|---|
| `.c-btn` + variantes | todas |
| `.c-forge` / `.c-btn--forge` | el CTA héroe (auth, importar, ingesta) |
| `.c-input`, `.c-textarea`, `.c-label` | auth, importar, editor-variante, tailor, ajustes |
| `.c-chip`, `.c-kbd`, `.c-pulse-dot` | staging (teclas j/k/a/d/o), fuentes, variantes |
| rejilla hairline (`gap:1px` + celdas opacas) | dashboard, master, salud |
| `.c-xray` | editor-variante (estado "rayos-x" del panel demo) |
| `stagger` / `divider` / `counter` | montaje de dashboard, master, fin de ingesta |

---

## 2 · Inventario de componentes — uno por uno

### 2.0 · Shell de la hoja

| Elemento | Clases / atributos exactos | Notas |
|---|---|---|
| `<html>` | `lang="es"` `data-theme="dark"` | el tema vive en `<html>` |
| Página | `.c-page` | flex column, `min-height:100vh` |
| Header | `.c-header` > `.c-container` | sticky 64px, `backdrop-filter:blur(4px) saturate(1.5)` |
| Logo | `a.c-logo` `href="../index.html"` | Playfair 19px + cuadradito de pátina en `::after` |
| Etiqueta de hoja | `<span>` con **estilo inline** (sin clase) | `letter-spacing:.14em` (★ NO es `.t-overline`, que usa `.16em`) |
| Salida | `.hd-right` > `a.c-btn.c-btn--quiet` | link con pinta de botón quiet |
| Main | `main.sp-main.c-wall` | muro: fondo `var(--bg)` opaco |
| Columna | `.c-container.sp-col` | `max-width:860px` (más estrecho que `--container`) |
| Título | `<h2>` | Playfair 28px, del sistema |
| Sección | `section.sp-g[data-screen-label="…"]` | 6 secciones; `data-screen-label` **no lo lee ningún JS** en esta hoja |
| Cabecera de sección | `.sp-gh` > `.t-overline` (+ botones a la derecha) | |
| Hairline | `hr.c-divider` | se dibuja con `scaleX(0)→(1)` en 1s |
| Nota al pie | `p.sp-note` (con `<b>` dentro) | mono 11px, `--text-subtle`, `max-width:78ch` |
| Contenedor de demo | `.sp-demo` (+ `.sp-stack` \| `.tv` \| `.hg-demo`) | |

`data-screen-label` de las 6 secciones, en orden:
`voces` · `botones` · `campos` · `hairlines` · `rayos-x` · `movimiento`.

---

### 2.1 · Las tres voces tipográficas (`.tv`)

Componente de **muestra tipográfica**: dos columnas por fila (etiqueta mono minúscula + espécimen).

- Contenedor: `<div class="sp-demo tv" style="display:grid">`
  ★ Conflicto de layout: `.sp-demo{display:flex}` (línea 494) vs `.tv{display:grid}` (línea 496).
  Misma especificidad ⇒ gana la **última en el source**, que es `.tv` (grid). El
  `style="display:grid"` inline es **refuerzo redundante** (belt-and-suspenders), no lo que decide.
  Al portar: mantén las dos clases **y** conserva el inline por fidelidad literal, pero sabe que el
  grid ya sale de `.tv`. **No inviertas el orden de las dos reglas CSS al copiarlas.**
- Filas: `.tv > div` → `display:flex; align-items:baseline; gap:16px`
- Etiqueta: `<span class="m">` → mono 10px, `--text-subtle`, `min-width:150px`
- Especímenes (4, en orden):
  1. `.t-display` con `style="font-size:26px"`
  2. `<span style="font-size:15px">` (sin clase — la voz UI es el default)
  3. `.t-data` con `style="font-size:13px"`
  4. `.t-overline`

**Variantes:** ninguna. **Estados:** ninguno (es estático).

---

### 2.2 · Botones

Contenedor: `<div class="sp-demo">` (flex, `gap:14px`, wrap).

| # | Marcado exacto | Rol |
|---|---|---|
| 1 | `<span class="c-forge"><button class="c-btn c-btn--forge c-btn--lg">` | **héroe con glow**. `.c-forge` es el **wrapper obligatorio**: el halo (`::before` con `blur`) vive en el wrapper, no en el botón. |
| 2 | `<button class="c-btn c-btn--patina">` | pátina sólida. Texto = `--ink-on-patina`, **jamás blanco**. |
| 3 | `<button class="c-btn">` | neutro (default). |
| 4 | `<button class="c-btn c-btn--quiet">` | quiet (transparente, sin borde). |
| 5 | `<button class="c-btn" disabled>` | deshabilitado. |

**Variantes de tamaño (del sistema):** base `--control-h` 40px · `.c-btn--lg` 44px ·
`.c-btn--hero` 62px (no demoada aquí, pero existe).

**Estados por variante (todos del sistema `base.css` + `motion.css`):**

| Variante | normal | hover | focus-visible | disabled | reduce-motion |
|---|---|---|---|---|---|
| `.c-btn` | `surface-elevated` + `border-strong` | `border-color:var(--border-patina)` | anillo global `2px solid var(--focus-ring)` + `outline-offset:2px` | `opacity:.42; pointer-events:none` (vía `[disabled]` o `[aria-disabled="true"]`) | idéntico |
| `.c-btn--patina` | fondo `patina-500`, texto `--ink-on-patina` | fondo `patina-300` | ídem | ídem | idéntico |
| `.c-btn--quiet` | transparente, sin borde, `--text-muted` | `color:var(--text)` + `border-color:var(--border)` | ídem | ídem | idéntico |
| `.c-btn--forge` | fondo `var(--bg)`, texto `--accent-text`, borde `patina-700` | color `--text` + borde `patina-500` **+ `translateY(-2px)` + `box-shadow:var(--glow-patina)` + filamento (`::before`) que sube a `top:35%`, `height:2px`, con doble `box-shadow` de glow + halo del wrapper `opacity .12→.3`, `blur 14px→20px`** | ídem | ídem | **sin glow, sin filamento, sin lift** — el `::before` del filamento y del halo **solo existen dentro de `@media (prefers-reduced-motion: no-preference)`** |
| `.c-btn--forge:active` | — | `transform:translateY(0)` | — | — | — |

★ En tema claro hay un override extra: `[data-theme="light"] .c-btn--forge:hover{color:var(--patina-900)}`.

**Regla de familia (componentes.md #1):** ≤ 1 elemento de pátina dominante por vista. Esta hoja
muestra forge + pátina sólida juntos **solo porque es un catálogo**; en producto es uno u otro.

---

### 2.3 · Campos y piezas

Contenedor: `<div class="sp-demo sp-stack" style="max-width:420px;width:100%">`
(`.sp-stack` → `display:grid; gap:10px`; el inline limita el ancho — load-bearing).

| Componente | Marcado exacto | Estados |
|---|---|---|
| Input | `<input class="c-input" placeholder="…">` | normal · `:focus` → `border-color:var(--focus-ring)` + `box-shadow:0 0 0 3px color-mix(in srgb,var(--focus-ring) 16%,transparent)` con `outline:none` · placeholder `--text-subtle` |
| Textarea | `<textarea class="c-textarea" placeholder="…"></textarea>` | ídem + `resize:vertical`, `min-height:120px` |
| Chip OK | `<span class="c-chip c-chip--ok"><span class="dot"></span><b>…</b><span>…</span></span>` | `--ok` solo cambia el color del `.dot` a `patina-300` |
| Chip neutro | `<span class="c-chip"><span class="dot"></span><b>…</b><span>…</span></span>` | `.dot` en `--text-subtle` |
| Tecla | `<span class="c-kbd">Ctrl</span>` `<span class="c-kbd">A</span>` | estático; `border-bottom-width:2px` (relieve) |
| Punto de pulso | `<span class="c-pulse-dot" title="desactualizada"></span>` | anima `cPulse` 2.8s infinito (`opacity .35↔1`); con reduce-motion queda estático y opaco |

★ **Comportamiento acoplado:** al enfocar `input`/`textarea`/`select`/`[contenteditable]`,
`motion.js` llama a `CorpusAurora.pause('focus')` — «el editor es sagrado». En esta hoja no se ve
(no hay aurora montada) pero el listener global existe y hay que reproducirlo en React.

**Faltan en esta hoja (pero son obligatorios por `componentes.md` #6):** `.c-label`, estado
`disabled` de campos y `.c-skel` (skeleton) — se demuestran en `fuentes-ia.html`.

---

### 2.4 · Rejilla hairline (`.hg-demo`)

**"El hueco es la línea"**: `grid-template-columns:repeat(4,1fr)` con **`gap:1px`** y celdas
**opacas** (`background:var(--surface)`). **Cero bordes.** La línea que ves es el `--bg` asomando
por el hueco.

```html
<div class="sp-demo hg-demo">
  <div><span class="v">4</span>experiencias</div>
  <div><span class="v">25</span>viñetas</div>
  <div><span class="v">23</span>skills</div>
  <div><span class="v">7</span>variantes</div>
</div>
```

- Celda: mono 11px (`--fs-micro`), `--text-muted`, padding `12px 14px`
- Cifra: `.v` → `display:block`, mono 17px/500, `--text`
- Responsive: `@media (max-width:768px)` → `repeat(2,1fr)`
- Gaps canónicos: **1px** (métricas, pasos) · **2px** (bento, vía `.c-hairgrid--bento`)

El sistema trae el equivalente genérico `.c-hairgrid` / `.c-hairgrid--bento`; `.hg-demo` es la
instancia local de 4 columnas. **Ambos nombres deben sobrevivir.**

---

### 2.5 · ★ Rayos-X (`.c-xray`) — el efecto que define el producto

Aislado aquí; en producto vive en `editor-variante.html`.

```html
<div class="c-xray xr-demo" id="xr" data-mode="doc">
  <div class="c-xray__doc xr-doc"> … PDF en porcelana … </div>
  <div class="c-xray__raw xr-raw"> … texto crudo del parser, mono … </div>
</div>
```

- **Máquina de estados: un solo atributo, `data-mode` ∈ `{"doc","raw"}`** en la raíz `.c-xray`.
- Base (fuera del media query, **siempre legible**):
  - `.c-xray{position:relative}` — el `__doc` está en flujo, el `__raw` en `position:absolute; inset:0`
  - `.c-xray__raw{opacity:0; filter:blur(12px) saturate(0); pointer-events:none}`
  - `[data-mode="raw"] .c-xray__doc` → `opacity:0; filter:blur(12px) saturate(0); pointer-events:none`
  - `[data-mode="raw"] .c-xray__raw` → `opacity:1; filter:blur(0) saturate(1); pointer-events:auto`
- Movimiento (solo `no-preference`): `transition:opacity var(--dur-slow) var(--ease-signature),
  filter var(--dur-slow) var(--ease-signature)` → **C2 · 360 ms**. Con reduce-motion: **corte limpio,
  misma información** (las reglas base ya son los estados finales).
- ★ **Hexes hardcodeados legales:** `.xr-doc` usa `#FFF`, `#14181A`, `#1F6E5A`, `#454B49`, `#D9DCD8`.
  Es la **única excepción** de la regla 8 de `componentes.md` («los únicos hex legales fuera de
  tokens: el documento CV porcelana»). El documento **es papel**: no cambia con el tema.
  **NO los tokenices.**
- Disparador: `<button class="c-btn c-btn--quiet" id="xrBtn" style="margin-left:auto">alternar</button>`
  dentro del `.sp-gh`.

---

### 2.6 · Replays de movimiento

Tres botones quiet en la cabecera de sección, dentro de
`<span style="margin-left:auto;display:flex;gap:8px">`:

| id | Etiqueta | Qué replaya |
|---|---|---|
| `#mvStag` | `escalonado` | `CorpusMotion.stagger($('#stagDemo'),{step:80})` sobre 3 `.c-card` |
| `#mvDiv` | `hairline` | vuelve a dibujar el `hr.c-divider#dvDemo` (scaleX 0→1, 1s) |
| `#mvCnt` | `contador` | `CorpusMotion.counter($('#cnt'), 40000, {dur:900})` |

- Escalonado: `<div class="sp-demo sp-stack" id="stagDemo" style="width:100%;max-width:420px">`
  con 3 `<div class="c-card" style="padding:12px 16px;font-size:13px">`.
- Contador: `<div style="margin-top:14px;font:500 34px/1 var(--font-mono)" id="cnt">0</div>`
  — **sin clase**, todo el estilo va inline. Valor inicial literal `0`.
  Formato: `n => Math.round(n).toLocaleString('es-CL')` → `40.000` (punto de millar).
- El hairline replayable es el **mismo `hr.c-divider`** de la cabecera (`id="dvDemo"`), no uno aparte.

**El shimmer NO está en esta hoja, a propósito.** Es autolimitado (uno por carga de producto, fin de
ingesta) — ver la nota de copy en §5.

---

## 3 · CSS específico VERBATIM (fuera de `data-corpus-system`)

Bloque `<style>` sin atributo, líneas 487–508 del HTML. **Copia literal, íntegra:**

```css
.sp-main{flex:1;padding:34px 0 120px}
.sp-col{max-width:860px;margin-inline:auto}
.sp-g{margin-top:44px}
.sp-gh{display:flex;align-items:baseline;gap:12px;padding-bottom:8px}
.sp-note{margin-top:10px;font:400 var(--fs-micro)/1.8 var(--font-mono);color:var(--text-subtle);max-width:78ch}
.sp-note b{color:var(--text-muted);font-weight:500}
.sp-demo{margin-top:14px;display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.sp-stack{display:grid;gap:10px}
.tv{display:grid;gap:6px}
.tv>div{display:flex;align-items:baseline;gap:16px}
.tv .m{font:400 10px/1 var(--font-mono);color:var(--text-subtle);min-width:150px}
.xr-demo{width:100%;max-width:520px}
.xr-doc{background:#FFF;color:#14181A;border-radius:var(--radius-md);padding:22px 24px;font:400 13px/1.5 var(--font-sans)}
.xr-doc .n{font:600 19px/1.2 var(--font-display);color:#1F6E5A}
.xr-raw{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:22px 24px;
  font:400 11.5px/1.8 var(--font-mono);color:var(--text-muted);white-space:pre-wrap}
.hg-demo{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;width:100%}
.hg-demo>div{background:var(--surface);padding:12px 14px;font:400 var(--fs-micro)/1.5 var(--font-mono);color:var(--text-muted)}
.hg-demo .v{display:block;font:500 17px/1.2 var(--font-mono);color:var(--text)}
@media (max-width:768px){.hg-demo{grid-template-columns:repeat(2,1fr)}}
```

**@keyframes definidos fuera del sistema: NINGUNO.** Todos (`cWordIn`, `cCharIn`, `cEnter`,
`cShimmer`, `cPulse`, `cSkel`, `cSpin`) viven en el bloque `data-corpus-system` (motion.css).

### Estilos inline (también son contrato — cópialos literales)

```html
<!-- header, etiqueta de hoja -->
style="margin-left:14px;font:500 var(--fs-micro)/1 var(--font-mono);letter-spacing:.14em;color:var(--text-muted)"
<!-- voces -->
<div class="sp-demo tv" style="display:grid">
<span class="t-display" style="font-size:26px">
<span style="font-size:15px">
<span class="t-data" style="font-size:13px">
<!-- campos -->
<div class="sp-demo sp-stack" style="max-width:420px;width:100%">
<div style="display:flex;gap:8px;flex-wrap:wrap">
<!-- rayos-x -->
<button … id="xrBtn" style="margin-left:auto">
.xr-doc interno:  style="margin-top:2px;font-weight:500"
                  style="margin-top:6px;color:#454B49;font-size:12px"
                  style="margin-top:12px;border-top:1px solid #D9DCD8;padding-top:8px;font-size:12.5px"
<!-- movimiento -->
<span style="margin-left:auto;display:flex;gap:8px">
<div class="sp-demo sp-stack" id="stagDemo" style="width:100%;max-width:420px">
<div class="c-card" style="padding:12px 16px;font-size:13px">
<div style="margin-top:14px;font:500 34px/1 var(--font-mono)" id="cnt">0</div>
```

---

## 4 · Comportamiento JS

### 4.1 · Script específico de la hoja — VERBATIM (líneas 886–897)

```js
(function(){
'use strict';
const $=s=>document.querySelector(s), M=window.CorpusMotion;
$('#xrBtn').onclick=()=>M.xray($('#xr'));
$('#mvStag').onclick=()=>{[...$('#stagDemo').children].forEach(c=>{c.removeAttribute('data-visible')});M.stagger($('#stagDemo'),{step:80})};
$('#mvDiv').onclick=()=>{const d=$('#dvDemo');d.removeAttribute('data-visible');requestAnimationFrame(()=>requestAnimationFrame(()=>M.show(d)))};
$('#mvCnt').onclick=()=>{$('#cnt').textContent='0';M.counter($('#cnt'),40000,{dur:900})};
M.stagger(document.querySelector('.sp-col'),{step:70,cap:24,items:document.querySelectorAll('.sp-g')});
M.boot();
})();
```

### 4.2 · Qué hace, línea a línea

1. **`xrBtn` → `M.xray($('#xr'))`** sin `mode` ⇒ **toggle**:
   `root.dataset.mode = (root.dataset.mode==='raw' ? 'doc' : 'raw')`. Devuelve el modo nuevo (aquí
   se descarta). El botón **no refleja el estado** (ni texto ni `aria-pressed` cambian).
2. **`mvStag`** → **primero borra `data-visible`** de los 3 hijos (si no, no hay transición que
   replayar), y **luego** `M.stagger(el,{step:80})`. `stagger` pone en cada hijo
   `data-reveal="soft"` (si no lo tenía) y `--d = base + min(i,cap)*step` ms, y en el **doble rAF**
   siguiente les añade `data-visible`. Con `step:80` → delays 0/80/160 ms.
3. **`mvDiv`** → quita `data-visible` del `hr#dvDemo` y lo repone tras **doble `requestAnimationFrame`**
   (un solo frame no basta: el navegador coalescería quitar+poner y no habría transición).
   El divider transiciona `transform:scaleX(0)→scaleX(1)` en **1s** con `--ease-signature`.
4. **`mvCnt`** → resetea el texto a `'0'` y llama a `M.counter($('#cnt'), 40000, {dur:900})`.
   `counter` deriva `from` leyendo el `textContent` y **quitando los puntos** (`replace(/\./g,'')`)
   — por eso el formato `es-CL` y el parseo son solidarios. Easing: `x => 1 - 2^(-10x)`
   (easeOutExpo, coherente con `--ease-signature`). Con reduce-motion: escribe el valor final de golpe.
5. **Montaje de la página:** `M.stagger(document.querySelector('.sp-col'), {step:70, cap:24, items: document.querySelectorAll('.sp-g')})`
   → escalona la **entrada de las 6 secciones** con 70 ms de paso.
   ⚠ El primer argumento (`.sp-col`) **se ignora** cuando se pasa `items` (`stagger` usa
   `o.items || el.children`). Se pasa por firma, no por efecto.
6. **`M.boot()`** → recorre el documento y, en doble rAF, marca `data-visible` en **todos** los
   `.c-divider` y en todo `[data-reveal]:not([data-visible])`. Es lo que dibuja los 6 hairlines de
   cabecera al cargar.

### 4.3 · APIs del sistema que esta hoja consume

`CorpusMotion.{ xray, stagger, counter, show, boot }` y, de rebote, los **listeners globales** que
`motion.js` instala en `document` al cargarse:

- `focusin` sobre `input,textarea,select,[contenteditable]` → `CorpusAurora.pause('focus')`
- `focusout` → `CorpusAurora.resume('focus')`
- `pointermove` → spotlight de `.c-spot` (escribe `--mx`/`--my`; en esta hoja **no hay** `.c-spot`)

`CorpusAurora` **no se monta**: no hay `.c-aurora` en el DOM ni llamada a `mount()`. Sus `pause`/
`resume` salen por el guard `if(!S.ok)return`.

### 4.4 · Degradación con `prefers-reduced-motion: reduce`

| Pieza | Con movimiento | Reduce-motion |
|---|---|---|
| Secciones (`stagger`) | blur + translateY escalonados 70 ms | visibles de inmediato (todo el bloque `@media no-preference` desaparece; `[data-reveal]{opacity:1}` es el estado base) |
| Hairlines | `scaleX(0)→(1)` en 1s | línea completa, sin transición |
| Rayos-X | desenfoque cruzado 360 ms | **corte limpio, misma información** |
| Forge hover | lift + glow + filamento | **solo color y borde** (los `::before` ni existen) |
| `.c-pulse-dot` | `cPulse` 2.8s infinito | punto fijo |
| Contador | 900 ms hacia el número real | número final escrito de golpe (`rm()` en `counter`) |

---

## 5 · Copy verbatim

Todo el texto visible de la hoja, **literal** (ES, `lang="es"`):

**`<title>`**
```
Corpus — Componentes · controles y movimiento
```

**Header**
```
Corpus
COMPONENTES · CONTROLES Y MOVIMIENTO
fuentes e IA →
```

**Título**
```
Controles y movimiento
```

**§ voces**
```
Las tres voces
display · Playfair 500        La marca que el tiempo deja
ui · Geist 400/500            Producto que se envía, sereno y sin drama.
datos · Geist Mono            Go · 412.803 bytes · 3 repos · verificado
overline ritual               Sección del producto
```
Nota: `Mono = hecho. El usuario aprende la gramática sin que se la expliquen.`

**§ botones**
```
Botones — ≤ 1 pátina dominante por vista
Forge — el héroe con glow
Pátina sólida (tinta, nunca blanco)
Neutro
Quiet
Deshabilitado
```
Nota (con `<b>`): `Alturas 40 / 44 / 62 · radios 6–8 · el forge lleva filamento y glow (motion.css).`
**`Texto sobre pátina = --ink-on-patina (7.49:1)`**`; blanco falla (2.56:1).`

**§ campos**
```
Campos y piezas
[placeholder] Input — foco con anillo de pátina
[placeholder] Textarea — el editor es sagrado: la aurora se pausa al enfocar
github.com/dgatica · API pública
linkedin.com/in/… · no legible
Ctrl   A
[title] desactualizada
```

**§ hairlines**
```
Rejilla hairline — el hueco es la línea
4 experiencias · 25 viñetas · 23 skills · 7 variantes
```
Nota: `gap 1px (métricas, pasos) · 2px (bento). Celdas opacas sobre grafito: cero bordes.`

**§ rayos-x**
```
★ Rayos-X — el documento se desviste (C2 · 360 ms)
alternar
```
Documento (`.xr-doc`), literal:
```
Diego Gatica Morales
Backend Engineer
Email: diego.gatica@ejemplo.cl · Tel: +56 9 6123 4567 · Santiago, Chile
• A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias).
```
Crudo (`.xr-raw`, `white-space:pre-wrap` — **los saltos de línea del HTML son el contenido**):
```
Diego Gatica Morales
Backend Engineer
Email: diego.gatica@ejemplo.cl · Tel: +56 9 6123 4567 · Santiago, Chile
• A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias).
```
Nota (con `<b>`): `El PDF se desenfoca y pierde el color; del desenfoque resuelve el texto crudo del parser.`
**`Así te ve la máquina, sin la ropa.`**` Con reduce-motion: corte limpio, misma información.`

**§ movimiento**
```
Movimiento — replays
escalonado
hairline
contador
Los items entran a 40–80 ms…
…con tope de 24…
…y el resto de golpe.
0
```
Nota (con `<b>`): `El shimmer no está aquí: existe `**`una vez`**` en el producto (fin de ingesta) y es autolimitado en código — pedirlo dos veces no hace nada.`

---

## 6 · A11y

**Lo que la hoja ya hace bien:**

- `lang="es"` y `data-theme` en `<html>`; **todo** el color sale de tokens con contraste verificado
  (`--text` 16.50:1 · `--text-muted` 8.83:1 · `--text-subtle` 4.94:1 AA-límite).
- Anillo de foco global: `:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;border-radius:2px}`.
  Campos: `outline:none` **pero** sustituido por `border-color:var(--focus-ring)` +
  `box-shadow:0 0 0 3px color-mix(…16%…)` — el foco nunca desaparece.
- Botón deshabilitado con el atributo real `disabled` (no una clase); el sistema soporta también
  `[aria-disabled="true"]`.
- Alturas de control 40/44/62 → el hit target móvil ≥ 44px se cumple con `--control-h-lg`.
- `hr.c-divider` es un `<hr>` semántico (separador real, no un `<div>` decorativo).
- Todo el movimiento está bajo `@media (prefers-reduced-motion: no-preference)`; **los estados base
  son los finales**: se pierde el movimiento, nunca la información.
- Nunca solo color: la verificación del sistema (`.c-ver`) es glifo + palabra + borde punteado
  (`.c-noev`) — no se demoa aquí pero la regla aplica a toda la familia.

**Agujeros reales de esta hoja (arreglar al portar, sin tocar clases):**

1. **★ `.c-xray__raw` sigue en el árbol de accesibilidad cuando está oculto.** Solo lleva `opacity:0`
   + `pointer-events:none`; **no** `hidden` ni `aria-hidden`. Un lector de pantalla lee **las dos
   capas a la vez** (documento y crudo, duplicados). Igual al revés en `data-mode="raw"`.
   → En React: aplicar `aria-hidden` a la capa inactiva (o `inert`), **sin** usar `display:none`
   (rompería la transición de opacidad/blur).
2. **`#xrBtn` («alternar») no expone estado ni objeto.** Sin `aria-pressed`, sin `aria-controls`,
   sin nombre accesible que diga *qué* alterna. → `aria-pressed={mode==='raw'}` +
   `aria-controls="xr"` + un nombre accesible explícito (copy.md ya tiene las etiquetas canónicas:
   «Documento / Cómo lo lee el ATS»).
3. **`#cnt` sin `aria-live`.** El contador cambia solo; nadie lo anuncia. → `aria-live="polite"` (y,
   si molesta el tartamudeo, anunciar solo el valor final).
4. **`.c-pulse-dot` comunica con `title` sobre un `<span>` vacío** — `title` no es un nombre
   accesible fiable y no hay texto. → `role="img"` + `aria-label="desactualizada"`, o (mejor,
   siguiendo la regla «nunca un icono donde puedas poner el dato») texto visible al lado.
5. **Campos sin `<label>`**: solo `placeholder`. `.c-label` existe en el sistema y **no se usa aquí**.
   → En producto: `<label class="c-label">` asociado, o `aria-label` como mínimo.
6. **Los replays no tienen `aria-live`**: al pulsar «escalonado» las tarjetas se ocultan y reaparecen
   sin aviso. Aceptable en un catálogo; **no** copiar el patrón a producto.
7. Nota menor de contraste: `.sp-note` es mono **11px** en `--text-subtle` (4.94:1). Pasa AA por
   los pelos y es texto pequeño. No bajar de ahí.

---

## 7 · Traducción a React — **sin cambiar ni una clase CSS**

Regla de oro del port: los componentes React **emiten exactamente los mismos `className`**. El CSS
se sirve como el bundle compartido (`tokens + base + aurora + motion` de `02-sistema/`) **más** una
hoja `controles.css` con el §3 verbatim. Nada de CSS-in-JS que renombre nada. Nada de
`styled-components` que genere hashes. Nada de Tailwind traduciendo `.c-btn`.

### 7.1 · Primitivos del sistema (compartidos por todas las pantallas)

| React | Props | Emite |
|---|---|---|
| `<Button>` | `variant?: 'neutral' \| 'patina' \| 'quiet' \| 'forge'` (def. `'neutral'`) · `size?: 'md' \| 'lg' \| 'hero'` (def. `'md'`) · `disabled?` · `as?: 'button' \| 'a'` · `href?` · resto de props nativas | `c-btn` + `c-btn--patina` \| `c-btn--quiet` \| `c-btn--forge` + `c-btn--lg` \| `c-btn--hero`. **Si `variant==='forge'` envuelve en `<span className="c-forge">`** — el wrapper no es opcional: el halo vive ahí. |
| `<Input>` | props nativas de `<input>` | `c-input` |
| `<Textarea>` | props nativas | `c-textarea` |
| `<Label>` | `htmlFor` | `c-label` |
| `<Chip>` | `ok?: boolean` · `label: ReactNode` (va en `<b>`) · `meta?: ReactNode` | `c-chip` (+ `c-chip--ok`) con `<span className="dot"/>` siempre presente |
| `<Kbd>` | `children` | `c-kbd` |
| `<PulseDot>` | `label: string` | `c-pulse-dot` + `role="img"` + `aria-label` |
| `<Divider>` | `patina?: boolean` · `visible?: boolean` | `<hr className="c-divider">` (+ `c-divider--patina`); pone `data-visible` cuando `visible` |
| `<Card>` | `elevated?` | `c-card` (+ `c-card--elevated`) |
| `<HairGrid>` | `bento?: boolean` · `cols?: number` | `c-hairgrid` (+ `c-hairgrid--bento`) |
| `<Panel>` | — | `c-panel` |

### 7.2 · Piezas de esta hoja

| React | Props | Emite / notas |
|---|---|---|
| `<XRay>` | `mode: 'doc' \| 'raw'` · `onToggle?` · `doc: ReactNode` · `raw: string` · `className?` | `<div className={cx('c-xray', className)} data-mode={mode}>` con hijos `c-xray__doc` y `c-xray__raw`. **Controlado por `data-mode`, no por montaje/desmontaje** — si desmontas la capa oculta, matas la transición. Añade `aria-hidden` a la inactiva. `raw` se renderiza tal cual (`white-space:pre-wrap` lo respeta). |
| `<XRayDoc>` / `<XRayRaw>` | `children` | `c-xray__doc xr-doc` / `c-xray__raw xr-raw`. **Los hexes de `.xr-doc` no se tokenizan.** |
| `<Counter>` | `to: number` · `dur?: number` (def. 900) · `from?: number` · `fmt?: (n)=>string` (def. `es-CL`) | Un `<div>`/`<span>` con `ref`; en `useEffect` llama a `CorpusMotion.counter(ref.current, to, {...})`. **Nunca animar hacia un número inventado** (regla de producto). `aria-live="polite"`. |
| `<Stagger>` | `step?: 40 \| 80` · `cap?: number` (def. 24) · `base?: number` · `children` | `useLayoutEffect` → `CorpusMotion.stagger(el, {step, cap, base})`. Envuelve; **no** añade clase propia. |
| `<Reveal>` | `variant?: '' \| 'soft' \| 'far'` · `delay?` | `data-reveal` + `--d`; `data-visible` en el doble rAF. |
| `<SpecSection>` | `label: string` (→ `data-screen-label`) · `overline: ReactNode` · `actions?: ReactNode` · `note?: ReactNode` | `<section className="sp-g" data-screen-label={label}>` + `.sp-gh` (con `.t-overline` y `actions` a la derecha) + `<hr className="c-divider">` + children + `<p className="sp-note">`. Solo para el catálogo, no para producto. |
| `<TypeVoices>` | — | `.sp-demo.tv` con `style={{display:'grid'}}` **literal** y las 4 filas `.tv > div` / `.m`. |
| `<HgDemo>` | `items: {v: string, label: string}[]` | `.sp-demo.hg-demo` con celdas `<div><span className="v">…</span>…</div>`. |

### 7.3 · Hooks / adaptadores

| Hook | Qué envuelve |
|---|---|
| `useCorpusMotion()` | devuelve `window.CorpusMotion` (o un stub SSR-safe: todo el módulo toca `document` en el momento de cargarse → **cargarlo solo en cliente**, `useEffect` / `next/dynamic({ssr:false})`). |
| `useReducedMotion()` | espeja `CorpusMotion.rm()` (`matchMedia('(prefers-reduced-motion: reduce)')`). |
| `useXRay(initial='doc')` | `[mode, toggle]`; `toggle` = `CorpusMotion.xray(ref.current)` o simple `setState` — **pero el DOM debe acabar con `data-mode` correcto**. |
| `useBoot(scope)` | `useEffect(() => CorpusMotion.boot(scope.current))` tras el primer paint. **Imprescindible**: sin él, todos los `.c-divider` se quedan en `scaleX(0)` (invisibles) y todo `[data-reveal]` en `opacity:0`. |
| `useAuroraPauseOnFocus()` | ya lo hace `motion.js` con listeners globales en `document`. **No lo dupliques**; solo asegúrate de importar el módulo una vez. |

### 7.4 · Reglas de port que NO son negociables

1. **`className` literal.** `c-btn`, `c-btn--forge`, `c-forge`, `c-xray`, `c-xray__doc`,
   `c-xray__raw`, `c-chip`, `c-chip--ok`, `dot`, `c-kbd`, `c-pulse-dot`, `c-divider`, `c-card`,
   `sp-*`, `tv`, `m`, `xr-*`, `hg-demo`, `v`. Cero renombres, cero `camelCase`, cero CSS Modules con
   hash (si usas CSS Modules, `:global`).
2. **El wrapper `.c-forge` no se elimina** "porque parece un div de más". Es donde vive el glow.
3. **`data-mode`, `data-reveal`, `data-visible`, `--d`** son API pública del CSS. React debe
   escribirlos, no sustituirlos por estado interno + clases nuevas.
4. **El shimmer sigue siendo uno por carga.** `CorpusMotion.shimmer()` guarda un flag de módulo
   (`shimmerUsed`); en dev con HMR/StrictMode el módulo puede recargarse y "regalar" un shimmer
   extra. No lo arregles inventando otro flag: respeta el del sistema.
5. **`counter` hacia números reales.** Ningún porcentaje, ningún destino inventado (README §6).
6. **Reduce-motion no es un extra.** Si un componente nuevo anima fuera de
   `@media (prefers-reduced-motion: no-preference)`, está mal.
