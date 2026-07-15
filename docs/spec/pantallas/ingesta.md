# Pantalla · ingesta

> Fuente literal: `Corpus_ diseño completo/corpus-design/04-pantallas/ingesta.html` (903 líneas).
> Referencias: `06-handoff/handoff.md` · `06-handoff/copy.md` · `00-README.md`.
> **Los nombres de clase son el contrato. No se renombran, no se "mejoran", no se simplifican.**

---

## 1 · Ruta y propósito

**Ruta:** `/app/ingesta` (handoff.md, tabla «Qué es cada cosa»).
**`<title>`:** `Corpus — Leyendo tus fuentes`
**`<html lang="es" data-theme="dark">`**

**Qué hace:** convierte **la espera en una ruta propia**: mientras la máquina lee las fuentes que el usuario volcó en `/app/importar`, esta pantalla muestra —línea a línea, con la fuente concreta y lo que se encontró en ella— qué está pasando, sin porcentaje inventado, y termina entregando al usuario al staging (`staging.html`) con un recuento real de items y de items sin evidencia.

Es la única pantalla del producto donde la aurora se pone en `active` («la máquina pensando», 00-README §4) y la única que dispara **EL shimmer** (uno en todo el producto, autolimitado en código: 00-README §5).

---

## 2 · Ventana o muro · Aurora

**Monta la aurora: SÍ.** Línea 837 del HTML, dentro del `<script>` de pantalla:

```js
A.mount({state:'active'});
```

Es decir: se monta **directamente en `active`**, no en `calm`. Es la única pantalla del paquete que lo hace (handoff.md: «Solo las VENTANAS la montan (auth, onboarding, importar, ingesta, dashboard vacío). Los MUROS ni la montan.»).

Ciclo de estado de la aurora en esta pantalla:

| Momento | Llamada | Efecto |
|---|---|---|
| Montaje del script | `A.mount({state:'active'})` | shader arranca ya agitado |
| Inicio / reinicio de la corrida | `A.setState('active')` (dentro de `run()`) | `speedT=1.5`, `actT=1` |
| Al terminar la extracción | `A.setState('calm')` (dentro de `finish()`) | `speedT=.35`, `actT=0` — el humo vuelve a respirar |

No hay `pause()`/`resume()` explícitos en la pantalla: los cablea `motion.js` del sistema (pausa al enfocar cualquier campo — aquí no hay campos — y `visibilitychange`).

**Gramática ventana / muro / velo / panel en esta pantalla:**

- `.c-window` → **`<main class="in-main c-window">`**. La pantalla ENTERA es ventana: el `main` es transparente y el humo se ve a través de él. Coherente con la regla «donde hay trabajo, el trabajo gana»: aquí NO hay trabajo del usuario, hay espera → el fondo puede vivir.
- `.c-wall` → **no se usa.** Ninguna sección de esta pantalla es muro.
- `.c-scrim` → **no se usa.** No hay velos.
- `.c-panel` → **dos**, y solo dos:
  1. `<div class="c-panel in-log" id="log">` — el registro de líneas de la ingesta.
  2. `<div class="c-panel fin-panel" id="finPanel">` — el panel del estado final (y el que recibe el shimmer).

  Ambos son vidrio ahumado sobre la ventana: dejan intuir el humo sin comerse una letra.
- **No existe `<div class="c-aurora">` en el HTML.** Lo crea `aurora.js` (`mount()` hace `document.body.prepend(el)` con `aria-hidden="true"`). En React: **no lo pintes tú**, deja que el módulo del sistema lo cree, o replica exactamente ese contrato.

El header (`.c-header`) es del sistema y ya trae su propio `backdrop-filter` + `background: color-mix(...74%)`; no lleva `c-wall`.

---

## 3 · Esqueleto DOM

(S) = clase del sistema (`c-*`, `t-*`, `hd-*`) · (P) = clase propia de esta pantalla.
Los estilos inline **son parte del literal**: están en el HTML tal cual y hay que reproducirlos.

```
body
├── div.c-page                                                       (S)
│   ├── header.c-header                                              (S)
│   │   └── div.c-container                                          (S)
│   │       ├── a.c-logo[href="dashboard.html"]                      (S)   → "Corpus"
│   │       ├── span#hdStep                                                → "INGESTA · LEYENDO FUENTES"
│   │       │     style="margin-left:14px;font:500 var(--fs-micro)/1 var(--font-mono);letter-spacing:.14em;color:var(--text-muted)"
│   │       └── div.hd-right                                         (S)
│   │           └── a.c-btn.c-btn--quiet[href="dashboard.html"]      (S)
│   │                 → "Seguir usando Corpus — esto avisa al terminar"
│   │
│   └── main.in-main.c-window[data-screen-label="ingesta"]           (P)(S)
│       │
│       ├── div.in-col#run                                           (P)   ← estado "leyendo"/"error"
│       │   ├── span.t-overline                                      (S)   → "Leyendo tus fuentes"
│       │   ├── div.in-count#count                                   (P)   → "0" (contador animado)
│       │   ├── div.in-cap                                           (P)   → "items encontrados hasta ahora"
│       │   ├── div.c-panel.in-log#log                               (S)(P) ← VACÍO en el HTML; lo llena el JS
│       │   │   └── div.in-row.is-run | .is-ok | .is-err             (P)   [× N, inyectadas]
│       │   │       ├── span.st                                      (P)   → "<span class='c-spin'>⟳</span>" | "✓" | "✕"
│       │   │       ├── span.src                                     (P)   → nombre de la fuente
│       │   │       ├── span.det                                     (P)   → lo que se está haciendo / lo que se encontró
│       │   │       └── div.in-acts                                  (P)   [solo en .is-err del demo "error"]
│       │   │           ├── button                                         → "Continuar sin la página 2"
│       │   │           └── button                                         → "Reintentar"
│       │   └── p.in-hint                                            (P)   → "Entre 5 y 40 segundos según las fuentes.<br>
│       │                                                                     Sin porcentajes inventados: te decimos qué estamos haciendo."
│       │
│       └── div.in-fin#fin[data-screen-label="ingesta-fin"]          (P)   ← estado "fin" (display:none hasta .show)
│           ├── span.t-overline                                      (S)   → "Extracción completa"
│           ├── h2[style="margin-top:18px"]                                → "Listo. Ahora, tu turno."
│           ├── div.c-panel.fin-panel#finPanel                       (S)(P) ← recibe EL shimmer
│           │   ├── div.fin-head                                     (P)
│           │   │   ├── span.n                                       (P)   → "61"
│           │   │   └── span.l                                       (P)   → "items esperan tu revisión"
│           │   └── div.fin-noev                                     (P)
│           │       ├── span.c-ver.c-ver--none                       (S)   → "9 sin evidencia"   (glifo ⚠ por ::before)
│           │       └── span                                               → "marcados — la revisión te los pondrá delante, no debajo."
│           └── div[style="margin-top:34px;display:flex;flex-direction:column;align-items:center;gap:14px"]
│               ├── span.c-forge                                     (S)
│               │   └── a.c-btn.c-btn--forge.c-btn--hero[href="staging.html"]   (S) → "Revisar en staging →"
│               └── span[style="font:400 var(--fs-data)/1.6 var(--font-mono);color:var(--text-subtle)"]
│                     → "Nada entra al master sin tu confirmación."
│
└── div.demo[role="group"][aria-label="Estados de la pantalla (revisión de diseño)"]   (S: convención de entrega, NO producto)
    ├── span                        → "demo"
    ├── button[data-st="leyendo"][aria-pressed="true"]   → "leyendo"
    ├── button[data-st="error"][aria-pressed="false"]    → "error"
    └── button[data-st="fin"][aria-pressed="false"]      → "fin"
```

**Atributos `data-*` presentes:**

| Atributo | Dónde | Para qué |
|---|---|---|
| `data-theme="dark"` | `<html>` | tema (el sistema soporta `dark`/`light`) |
| `data-screen-label="ingesta"` | `main.in-main` | etiqueta de pantalla (convención del paquete) |
| `data-screen-label="ingesta-fin"` | `div.in-fin` | etiqueta del sub-estado final |
| `data-st="leyendo|error|fin"` | botones del panel demo | selector de estado |
| `data-corpus-system="css|js"` | los bloques `<style>`/`<script>` del sistema | **ya los tenemos: no se transcriben** |
| `data-reveal` / `data-visible` | inyectados por `CorpusMotion` en cada `.in-row` | animación de entrada |
| `data-mode` | (no se usa aquí; es de `.c-xray`) | — |

**Clases del sistema que SÍ se usan aquí:** `c-page`, `c-header`, `c-container`, `c-logo`, `hd-right`, `c-btn`, `c-btn--quiet`, `c-btn--forge`, `c-btn--hero`, `c-forge`, `c-window`, `c-panel`, `c-ver`, `c-ver--none`, `c-spin`, `c-shimmer` (vía JS), `c-enter` (vía JS), `t-overline`, `demo`.

---

## 4 · CSS específico de pantalla

Copia **verbatim** del segundo `<style>` (líneas 487–518 del HTML), el que **no** lleva `data-corpus-system`. Sin `@keyframes` propios: esta pantalla no define ninguno (usa `cSpin`, `cShimmer`, `cEnter`, `cWordIn`… del sistema).

```css
/* ── ingesta.html — la espera como ruta propia. VENTANA + aurora ACTIVA. ── */
.in-main{flex:1;display:flex;flex-direction:column;align-items:center;padding:70px var(--container-pad) 110px;text-align:center}
.in-col{width:100%;max-width:600px;display:flex;flex-direction:column;align-items:center}
.in-count{margin-top:34px;font:500 76px/1 var(--font-mono);letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.in-cap{margin-top:10px;color:var(--text-muted);font-size:var(--fs-ui)}
.in-log{width:100%;margin-top:38px;text-align:left;padding:8px 0}
.in-row{display:grid;grid-template-columns:34px 1fr auto;align-items:baseline;gap:0 10px;
  padding:11px 22px;font:400 var(--fs-data)/1.5 var(--font-mono)}
.in-row+.in-row{border-top:1px solid var(--border)}
.in-row .st{text-align:center;color:var(--text-subtle)}
.in-row.is-run .st{color:var(--accent-text)}
.in-row.is-ok .st{color:var(--ver-ok)}
.in-row.is-err .st{color:var(--ver-none)}
.in-row .src{color:var(--text)}
.in-row .det{color:var(--text-subtle);text-align:right}
.in-row.is-err .det{color:var(--danger)}
.in-acts{grid-column:2/4;display:flex;gap:8px;margin-top:8px}
.in-acts button{font:500 var(--fs-micro)/1 var(--font-mono);padding:7px 10px;border:1px solid var(--border-strong);border-radius:5px;color:var(--text-muted)}
.in-acts button:hover{color:var(--text);border-color:var(--border-patina)}
.in-hint{margin-top:26px;font:400 var(--fs-micro)/1.8 var(--font-mono);color:var(--text-subtle)}
.in-fin{width:100%;max-width:600px;display:none;flex-direction:column;align-items:center}
.in-fin.show{display:flex}
.fin-panel{width:100%;margin-top:36px;text-align:left;overflow:hidden}
.fin-head{display:flex;align-items:baseline;justify-content:space-between;padding:20px 24px 16px}
.fin-head .n{font:500 40px/1 var(--font-mono);letter-spacing:-.03em}
.fin-head .l{color:var(--text-muted);font-size:var(--fs-ui)}
.fin-noev{display:flex;align-items:center;gap:10px;padding:14px 24px;border-top:1px dashed color-mix(in srgb,var(--danger) 45%,transparent);
  font:400 var(--fs-data)/1.5 var(--font-sans);color:var(--text-muted)}
@media (max-width:768px){.in-count{font-size:56px}}
@media (max-width:480px){.in-row{grid-template-columns:24px 1fr;padding:10px 14px}.in-row .det{grid-column:2;text-align:left}}
```

Notas de lectura (no cambian el CSS, lo explican):

- `.in-row` es una **grid de 3 columnas `34px 1fr auto`** con `align-items:baseline`. En ≤480px pasa a 2 columnas y `.det` cae debajo, alineado a la izquierda.
- `.in-acts` ocupa `grid-column:2/4` → los botones de error se alinean bajo `.src`/`.det`, no bajo el glifo.
- El estado final se muestra con `display:none` → `.in-fin.show{display:flex}` (NO con el atributo `hidden`).
- `.fin-panel` lleva `overflow:hidden` — **imprescindible** para que el shimmer (`::after` con `inset:-2px` que barre de `-130%` a `130%`) quede recortado dentro del panel.
- `.fin-noev` usa `border-top: 1px dashed` en `--danger` al 45%: es el «nunca solo color» del sistema (borde punteado + glifo `⚠` de `.c-ver--none::before` + la palabra «sin evidencia»).

---

## 5 · Estados del panel demo

handoff.md declara para `/app/ingesta`: **`leyendo · error · fin`**. Los tres botones existen con `data-st`.

El panel `demo` es **convención de entrega, no producto**: NO se porta a React como UI de usuario. Se puede portar como herramienta de QA tras un flag, pero jamás debe ser alcanzable en producción.

### `leyendo` (por defecto — `aria-pressed="true"` al cargar)

- Se ejecuta `run(false)` (también en el arranque de la página: `M.boot(); run(false);`).
- DOM: `#run` visible (`style.display=''`), `#fin` sin `.show`, `#log` vaciado (`innerHTML=''`), `#count` a `'0'`, `#hdStep` = `INGESTA · LEYENDO FUENTES`.
- Aurora → `A.setState('active')`.
- Se inyectan las 5 filas `.in-row` una a una: nacen `is-run` (con `⟳` girando y el texto «…»), y al cumplirse su espera pasan a `is-ok` con el detalle y suman al contador.
- Al acabar los 5 pasos: `M.counter($('#count'),61,{dur:500})`, espera 900ms y llama a `finish()` → transición automática al estado `fin`.

### `error`

- Se ejecuta `run(true)`. Idéntico a `leyendo` salvo en el **paso 4 (`CV_2023.pdf`)**, que en vez de resolverse en `is-ok`:
  - `set(r,'err','la página 2 es una imagen escaneada: no hay texto que leer')` → la fila queda `.in-row.is-err` (glifo `✕`, `.det` en `--danger`).
  - Se le **añade** un `<div class="in-acts">` con dos `<button>`: `Continuar sin la página 2` y `Reintentar`.
  - La corrida **se bloquea** en una `Promise` hasta que el usuario pulse uno de los dos (esto es lo importante: el error no se auto-resuelve).
    - **Continuar sin la página 2** → se elimina `.in-acts`, la fila pasa a `is-ok` con detalle `solo página 1 · 6 items`, y `bump(6)`.
    - **Reintentar** → el propio botón se convierte en `⟳ reintentando…`, espera 1300ms, se elimina `.in-acts`, la fila queda `is-err` con detalle `sigue sin texto — continuando con la página 1`, y `bump(6)` igualmente.
  - Después continúa con el paso 5 y termina en `fin` como siempre.

### `fin`

- `tok++` (invalida cualquier corrida en vuelo) y llama a `finish()` **directamente**, sin pasar por el log.
- DOM: `#run` → `display:none`; `#fin` → `.show` + `CorpusMotion.enter()` (clase `c-enter`, 360ms, C2); `#hdStep` = `INGESTA · COMPLETA`.
- Aurora → `A.setState('calm')`.
- Doble `requestAnimationFrame` → `M.shimmer($('#finPanel'))`.
- Ojo: `CorpusMotion.shimmer` es **autolimitado** (`let shimmerUsed=false` a nivel de módulo). Si en la sesión ya se disparó una vez, pulsar `fin` otra vez **no** vuelve a brillar. Es intencional (00-README §5: «Hay UN shimmer en todo el producto»).

Los tres botones sincronizan `aria-pressed` (`String(x===b)`).

---

## 6 · Comportamiento JS de la pantalla

Todo el `<script>` sin `data-corpus-system` (líneas 833–901). IIFE en `'use strict'`.

### Utilidades y arranque

```js
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)],
      M=window.CorpusMotion, A=window.CorpusAurora;
A.mount({state:'active'});
let items=0,tok=0;
const wait=ms=>new Promise(r=>setTimeout(r,M.rm()?Math.min(ms,120):ms));
```

- **`tok`** es un *token de cancelación*: cada `run()` hace `const my=++tok` y comprueba `if(my!==tok)return;` después de cada `await`. Cambiar de estado en el demo mata la corrida anterior sin condiciones de carrera. **En React esto se traduce a un `AbortController` o a un ref de generación; no lo pierdas: si no, dos corridas escriben en el mismo `#log`.**
- **`wait()` respeta `prefers-reduced-motion`**: con `reduce`, cada espera se recorta a `min(ms,120)` — la ingesta sigue existiendo como secuencia, pero no te hace esperar. Pierde el movimiento, nunca la información.

### Construcción de filas

```js
function row(src,det,st){
  const r=document.createElement('div');r.className='in-row is-'+st;
  r.innerHTML='<span class="st"></span><span class="src"></span><span class="det"></span>';
  set(r,st,det);r.querySelector('.src').textContent=src;
  $('#log').appendChild(r);M.reveal(r);return r;
}
function set(r,st,det){r.className='in-row is-'+st;
  r.querySelector('.st').innerHTML=st==='run'?'<span class="c-spin">⟳</span>':st==='ok'?'✓':'✕';
  if(det!=null)r.querySelector('.det').textContent=det}
function bump(n){items+=n;M.counter($('#count'),items,{dur:700})}
```

- Cada fila nueva entra con `CorpusMotion.reveal(r)` (opacity + blur + translateY, 900ms `--ease-signature`).
- El glifo de estado es **texto**: `⟳` (envuelto en `.c-spin`, que gira 1.2s lineal infinito), `✓`, `✕`. No son iconos SVG. Reprodúcelos como caracteres.
- `bump()` anima el contador **hacia un número real** con `CorpusMotion.counter` (700ms, formato `toLocaleString('es-CL')` → separador de miles con punto).

### La secuencia (los 5 pasos, literal)

```js
const steps=[
  ['Texto pegado','leyendo…',1300,'2.147 palabras · 3 experiencias, 12 skills',19],
  ['github.com/dgatica','consultando la API…',1700,'12 repos públicos · 3 con actividad sostenida',9],
  ['dgatica.cl','leyendo el portfolio…',1500,'6 proyectos, 2 con métricas',12],
  ['CV_2023.pdf','extrayendo texto…',1400,'2 páginas de texto · 15 items',15],
  ['Comparando versiones','buscando duplicados…',1200,'3 posibles duplicados — los resolverás tú',6]];
```

Formato de cada tupla: `[fuente, texto-mientras-corre, ms de espera, detalle-al-terminar, items que suma]`.

### `run(fail)` · `finish()`

```js
async function run(fail){
  const my=++tok;
  items=0;$('#count').textContent='0';$('#log').innerHTML='';
  $('#run').style.display='';$('#fin').classList.remove('show');
  $('#hdStep').textContent='INGESTA · LEYENDO FUENTES';
  A.setState('active');
  for(const [src,doing,ms,done,n] of steps){
    if(my!==tok)return;
    const r=row(src,doing,'run');await wait(ms);
    if(my!==tok)return;
    if(fail&&src==='CV_2023.pdf'){
      set(r,'err','la página 2 es una imagen escaneada: no hay texto que leer');
      const acts=document.createElement('div');acts.className='in-acts';
      acts.innerHTML='<button>Continuar sin la página 2</button><button>Reintentar</button>';
      r.appendChild(acts);
      await new Promise(res=>{
        acts.children[0].onclick=()=>{acts.remove();set(r,'ok','solo página 1 · 6 items');res()};
        acts.children[1].onclick=async()=>{acts.children[1].innerHTML='<span class="c-spin">⟳</span> reintentando…';
          await wait(1300);acts.remove();set(r,'err','sigue sin texto — continuando con la página 1');res()};
      });
      if(my!==tok)return;
      bump(6);
    }else{set(r,'ok',done);bump(n)}
  }
  if(my!==tok)return;
  M.counter($('#count'),61,{dur:500});
  await wait(900);
  if(my!==tok)return;
  finish();
}
function finish(){
  A.setState('calm');
  $('#run').style.display='none';
  $('#fin').classList.add('show');M.enter($('#fin'));
  $('#hdStep').textContent='INGESTA · COMPLETA';
  requestAnimationFrame(()=>requestAnimationFrame(()=>M.shimmer($('#finPanel'))));
}
```

### Panel demo + arranque

```js
$$('.demo button').forEach(b=>b.onclick=()=>{
  $$('.demo button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  const st=b.dataset.st;
  if(st==='fin'){tok++;finish()}
  else run(st==='error');
});
M.boot();run(false);
```

### Llamadas al sistema usadas por esta pantalla

| API | Dónde | Nota |
|---|---|---|
| `CorpusAurora.mount({state:'active'})` | arranque | única pantalla que monta ya en `active` |
| `CorpusAurora.setState('active')` | `run()` | `speedT=1.5`, `actT=1` |
| `CorpusAurora.setState('calm')` | `finish()` | vuelve a respirar |
| `CorpusMotion.rm()` | `wait()` | recorta esperas a ≤120ms con reduce-motion |
| `CorpusMotion.reveal(el)` | `row()` | entrada de cada fila del log |
| `CorpusMotion.counter(el,to,{dur})` | `bump()` (700ms) y cierre (500ms) | siempre hacia un número REAL |
| `CorpusMotion.enter(el)` | `finish()` | C2, 360ms — cambio de vista dentro de la pantalla |
| `CorpusMotion.shimmer(el)` | `finish()` | **EL** shimmer del producto, autolimitado |
| `CorpusMotion.boot()` | arranque | dibuja hairlines y reveals estáticos |

**NO se usan:** `stagger`, `words/chars`, `xray`, `io`, `pause/resume` explícitos, `setStrength`, `scrollIntoView` (handoff: «no se usa — mantenerlo así»).

### Atajos de teclado

**Ninguno.** Esta pantalla no registra `keydown`. (Los atajos `j/k/a/d/o` son de staging, según handoff.md.)

---

## 7 · Copy (verbatim, ES)

Marcado: **[copy.md]** = está literal en `06-handoff/copy.md` §Ingesta · **[solo-HTML]** = solo existe en la pantalla.

### Chrome / header

| Texto | Fuente |
|---|---|
| `Corpus — Leyendo tus fuentes` (`<title>`) | [solo-HTML] |
| `Corpus` (logo) | [solo-HTML] |
| `INGESTA · LEYENDO FUENTES` (`#hdStep`) | [solo-HTML] |
| `INGESTA · COMPLETA` (`#hdStep` tras `finish()`) | [solo-HTML] |
| `Seguir usando Corpus — esto avisa al terminar` | [solo-HTML] — **es una promesa de producto: la ingesta corre en segundo plano y notifica.** |

### Estado «leyendo»

| Texto | Fuente |
|---|---|
| `Leyendo tus fuentes` (overline) | **[copy.md]** «overline · ES: Leyendo tus fuentes» |
| `0` → contador | — |
| `items encontrados hasta ahora` | **[copy.md]** «contador» |
| `Entre 5 y 40 segundos según las fuentes.` + `<br>` + `Sin porcentajes inventados: te decimos qué estamos haciendo.` | **[copy.md]** «nota de la espera» (idéntico; en copy.md va en una sola línea) |

### Las 5 líneas del log

| `src` | `det` mientras corre | `det` al terminar | Fuente |
|---|---|---|---|
| `Texto pegado` | `leyendo…` | `2.147 palabras · 3 experiencias, 12 skills` | **[copy.md]** (idéntico) |
| `github.com/dgatica` | `consultando la API…` | `12 repos públicos · 3 con actividad sostenida` | **[copy.md]** con la fuente particularizada (copy.md dice `github.com/usuario`) |
| `dgatica.cl` | `leyendo el portfolio…` | `6 proyectos, 2 con métricas` | **[copy.md]** con la fuente particularizada (copy.md dice `misitio.cl`) |
| `CV_2023.pdf` | `extrayendo texto…` | `2 páginas de texto · 15 items` | **[solo-HTML]** — copy.md no lista este paso en «progreso» (solo lo menciona en «error de archivo») |
| `Comparando versiones` | `buscando duplicados…` | `3 posibles duplicados — los resolverás tú` | **[copy.md]** (idéntico) |

### Estado «error»

| Texto | Fuente |
|---|---|
| `la página 2 es una imagen escaneada: no hay texto que leer` | **[copy.md]** «error de archivo» (allí va precedido de `CV_2023.pdf — `; aquí el nombre del archivo ya es la columna `.src`) |
| `Continuar sin la página 2` (botón) | **[copy.md]** |
| `Reintentar` (botón) | **[copy.md]** |
| `⟳ reintentando…` (el propio botón mientras espera) | [solo-HTML] |
| `solo página 1 · 6 items` (tras «Continuar sin la página 2») | [solo-HTML] |
| `sigue sin texto — continuando con la página 1` (tras «Reintentar») | [solo-HTML] |

### Estado «fin»

| Texto | Fuente |
|---|---|
| `Extracción completa` (overline) | [solo-HTML] |
| `Listo. Ahora, tu turno.` (`<h2>`, Playfair Display) | **[copy.md]** «fin» |
| `61` (`.fin-head .n`) | **[copy.md]** «61 items esperan tu revisión» |
| `items esperan tu revisión` (`.fin-head .l`) | **[copy.md]** |
| `9 sin evidencia` (`.c-ver--none`) | **[copy.md]** |
| `marcados — la revisión te los pondrá delante, no debajo.` | **[copy.md]** con puntuación distinta: copy.md dice `«9 sin evidencia — marcados; la revisión te los pondrá delante, no debajo.»` (punto y coma). El HTML parte la frase en dos `<span>` y usa raya. **El HTML manda: es la referencia visual literal.** |
| `Revisar en staging →` (CTA forge) | **[copy.md]** |
| `Nada entra al master sin tu confirmación.` | **[copy.md]** |

### Panel demo (no producto)

`demo` · `leyendo` · `error` · `fin` — [solo-HTML], convención de entrega.

---

## 8 · Accesibilidad

### Lo que la pantalla YA hace

- `<html lang="es">`.
- El contenedor de la aurora se crea con `aria-hidden="true"` (lo hace `aurora.js`); el humo nunca lleva contenido.
- Panel demo: `role="group"` + `aria-label="Estados de la pantalla (revisión de diseño)"`, y los tres botones mantienen `aria-pressed` sincronizado.
- Los botones de error son `<button>` reales → foco y `Enter`/`Espacio` gratis.
- `:focus-visible` del sistema: `outline:2px solid var(--focus-ring); outline-offset:2px`.
- «Sin evidencia» **nunca es solo color**: borde punteado (`.fin-noev` `border-top: 1px dashed`) + glifo `⚠` (`.c-ver--none::before`) + la palabra («sin evidencia»).
- `prefers-reduced-motion`: todo el movimiento del sistema vive bajo `no-preference`; además `wait()` recorta las esperas a ≤120ms y `CorpusMotion.counter` escribe el número final de golpe. Se pierde el movimiento, nunca la información.
- Orden de foco natural (DOM): logo → «Seguir usando Corpus…» → [botones de error, si existen] → «Revisar en staging →» → panel demo.
- Los CTA cumplen tamaño: `.c-btn--hero` = 62px de alto; `.c-btn` = 40px.

### Huecos reales (arréglalos al implementar, sin cambiar el diseño)

1. **`#log` no tiene región viva.** Es un feed que se actualiza solo, y un lector de pantalla no se entera de nada. Falta `role="log"` + `aria-live="polite"` (o `role="status"`) en `#log`. **Añádelo; no cambia un pixel.**
2. **`#count` tampoco es región viva** y cambia de valor 5 veces. Como el contador se anima a 60fps, `aria-live` en el `#count` sería ruido: lo correcto es anunciar el hito, no cada frame — p. ej. exponer el total final en el `role="status"` del log, o un `aria-live` que solo se actualice al terminar cada paso.
3. **Los glifos de estado (`⟳ ✓ ✕`) son texto sin etiqueta.** Un lector dirá literalmente los caracteres. Añade `aria-hidden="true"` al glifo y un texto accesible («leyendo», «listo», «error») en la fila, o `aria-label` en `.in-row`.
4. **Hit targets de `.in-acts button`:** `font:11px` + `padding:7px 10px` → ~26px de alto. handoff.md exige **≥ 44px en móvil**. En móvil hay que crecerlos (o darles un `min-height:44px`) — es la única violación de hit target de la pantalla.
5. `.in-fin` se oculta con `display:none` (no con `[hidden]`), lo cual sí lo saca del árbol de accesibilidad → correcto funcionalmente; solo que `CorpusMotion.enter()` empieza haciendo `el.hidden=false`, que aquí es un no-op. Mantén ambas cosas o unifica, pero **no dejes `#fin` visible en el DOM antes de tiempo.**
6. El `<h2>` («Listo. Ahora, tu turno.») aparece sin que haya un `<h1>` en la página. Si se quiere jerarquía correcta, el `<h1>` es responsabilidad del layout; no toques el `<h2>`.

---

## 9 · Datos del mock

Persona canónica: **Diego Gatica** (ficticio). handoff.md: «misma historia en todas las pantallas y en `datos-ejemplo.json`. Las cifras del demo (61 items, 43/8/9, 412.803 bytes…) son coherentes entre pantallas; si tocas una, persigue el resto.»

| Dato | Valor en esta pantalla |
|---|---|
| Fuente 1 | `Texto pegado` — 2.147 palabras · 3 experiencias · 12 skills |
| Fuente 2 | `github.com/dgatica` — 12 repos públicos · 3 con actividad sostenida |
| Fuente 3 | `dgatica.cl` — 6 proyectos · 2 con métricas |
| Fuente 4 | `CV_2023.pdf` — 2 páginas de texto · 15 items (en el estado error: solo página 1 · 6 items) |
| Paso 5 | `Comparando versiones` — 3 posibles duplicados |
| Total de items extraídos | **61** |
| Items sin evidencia | **9** |
| Destino | `staging.html` |

**Coherencia con staging.html (verificada leyendo el archivo):** staging abre con `61 pendientes`, filtros `● verificado 43` / `◐ parcial 8` / `⚠ sin evidencia 9`, «Aceptar todo lo verificado (43)», «3 posibles duplicados» y vacío final con `52 items entraron a tu master`. El `9` y el `61` de ingesta casan. El `3 posibles duplicados` casa. (Ver §10 para el desajuste 43+8+9.)

---

## 10 · Números en la UI

El producto **prohíbe números sin fuente** (00-README §6, handoff §4: «Ningún número sin fuente en la UI; el progreso jamás muestra %»).

### Auditoría completa

| Número mostrado | Dónde | De dónde sale | ¿Legítimo? |
|---|---|---|---|
| `0` → …→ `61` | `#count` (76px mono) | suma de los `bump(n)` de cada fuente, animado con `CorpusMotion.counter` hacia un número **real** | Sí — es un recuento, no una estimación |
| `2.147` palabras · `3` experiencias · `12` skills | fila «Texto pegado» | hecho constatado de la fuente | Sí |
| `12` repos públicos · `3` con actividad sostenida | fila github | API pública de GitHub (handoff/importar: «API pública — se leerá sin IA») | Sí |
| `6` proyectos · `2` con métricas | fila dgatica.cl | lectura del portfolio | Sí |
| `2` páginas de texto · `15` items | fila CV_2023.pdf | extracción del PDF | Sí |
| `3` posibles duplicados | fila «Comparando versiones» | comparación entre fuentes | Sí |
| `6` items / `página 1` / `página 2` | estado error | extracción parcial | Sí |
| `61` | `.fin-head .n` | total de items extraídos | Sí |
| `9` sin evidencia | `.c-ver--none` | recuento de items sin fragmento de origen | Sí |
| `5` y `40` segundos | `.in-hint` | rango declarado de la espera («entre 5 y 40 segundos según las fuentes») | Sí — es un rango honesto, no una barra de progreso |

**No hay ni un `%`, ni un score, ni un «confidence», ni un «match». La pantalla cumple.** El `.in-hint` es explícito al respecto: «Sin porcentajes inventados: te decimos qué estamos haciendo.»

### Sospechas / cosas que hay que resolver con datos reales al implementar

1. **⚠ Los incrementos del contador no cuadran con el detalle que se muestra.** Los `bump(n)` son `19, 9, 12, 15, 6`. Pero la fila que suma `19` dice «3 experiencias, 12 skills» (= 15); la que suma `9` dice «12 repos · 3 con actividad»; la que suma `12` dice «6 proyectos, 2 con métricas». **El usuario ve un total que crece con saltos cuya fuente no está en pantalla.** En el mock es irrelevante; en producción el `n` de cada fuente **tiene que ser el número real de items extraídos de esa fuente**, y lo ideal es que el detalle lo justifique (como sí hace `CV_2023.pdf`: «15 items» → `bump(15)`).
2. **⚠ En el estado `error`, el contador miente.** La suma real de la corrida con fallo es `19+9+12+6+6 = 52`, pero al terminar el código fuerza `M.counter($('#count'),61,{dur:500})` y el panel final sigue diciendo `61`. El contador **salta de 52 a 61 sin explicación**. Es exactamente el pecado que el producto dice no cometer. Al implementar: **el total final es la suma de lo extraído, no una constante.** (En la corrida feliz sí cuadra: `19+9+12+15+6 = 61`.)
3. **Desajuste de mock entre pantallas:** ingesta entrega `61` items y `9 sin evidencia`; staging muestra `61 pendientes` pero desglosa `43 verificado + 8 parcial + 9 sin evidencia = 60`. Falta 1. handoff.md declara la tripleta «43/8/9» como canónica, así que el desajuste está en el paquete de diseño, no en esta pantalla. **Decidir el número correcto una vez y propagarlo** (handoff: «si tocas una, persigue el resto»).
4. `61 → 52`: el `52` de staging («52 items entraron a tu master») es el resultado tras descartar 9; es coherente con `61 − 9`. No es un número inventado.
