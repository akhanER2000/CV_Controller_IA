# dashboard.md — spec literal de `04-pantallas/dashboard.html`

> Fuente: `Corpus_ diseño completo/corpus-design/04-pantallas/dashboard.html` (53.830 bytes, 965 líneas).
> Bloques `data-corpus-system` (CSS 10–486, JS 639–910) = copia del sistema canónico; NO se transcriben aquí.
> Lo específico de la pantalla: `<style>` 487–551 · `<body>` 553–637 · `<script>` 911–962.
> **Los nombres de clase no cambian. Son el contrato diseño↔código.**

---

## 1 · Ruta y propósito

**Ruta:** `/app` (archivo `dashboard.html`, `<title>Corpus — Panel · el estado de tu carrera</title>`).

Muestra **el estado de la carrera del usuario, no un saludo**: variantes (cuáles están desactualizadas),
salud del master (hallazgos concretos, sin score), items en staging esperando decisión, y el estado de las
4 fuentes. En día 1 (registro vacío) el mismo `/app` es una pantalla de dos puertas (con IA / sin IA).

---

## 2 · Ventana o muro · Aurora

**¿Monta CorpusAurora?** Sí — línea 953, **una sola vez y siempre**:

```js
window.CorpusAurora.mount({state:'calm'});
```

**Estado:** `'calm'` **siempre**. Nunca `'active'`. Además, `setState(st)` de la pantalla fuerza
`window.CorpusAurora.setState('calm')` en **cada** cambio de estado del panel demo (línea 946), incluso
al volver a `denso`.

**Reparto ventana/muro:**

| Sección | Clase | Rol |
|---|---|---|
| `<main id="stDense" class="db-main c-wall">` | **`.c-wall`** (S) | MURO — opaco (`background:var(--bg)`). "Donde hay trabajo, el trabajo gana": el bento de datos tapa la aurora. |
| `<main id="stEmpty" class="db-empty c-window">` | **`.c-window`** (S) | VENTANA — `background:transparent`. Día 1: la aurora respira en calma detrás de las dos puertas. |
| `<header class="c-header">` | (S) | Sticky, `background` propio del sistema. |

**`.c-panel` y `.c-scrim`: NO se usan en esta pantalla.** Cero apariciones.

**Regla vs. implementación real (léase con cuidado):** el handoff dice *"Solo las VENTANAS la montan
(auth, onboarding, importar, ingesta, **dashboard vacío**). Los MUROS ni la montan."* El HTML monta la
aurora incondicionalmente porque el panel demo puede saltar a `vacío` en cualquier momento — es un
artefacto de la entrega, no del producto.
→ **En React: montar `CorpusAurora` SOLO cuando el dashboard está vacío (0 items).** En el estado denso
no debe montarse el canvas WebGL (el muro lo tapa igual: sería gastar GPU para nada).

---

## 3 · Esqueleto DOM

Leyenda: **(S)** = clase del sistema (`c-*`, `t-*`, `hd-*`) · **(P)** = clase propia de la pantalla (`db-*`, `demo`).

```
body
└── div.c-page (S)
    ├── header.c-header (S)
    │   └── div.c-container (S)
    │       ├── a.c-logo (S)  href="dashboard.html"  → "Corpus"
    │       ├── nav.hd-nav (S)
    │       │   ├── a href="dashboard.html" aria-current="page"  → "Panel"
    │       │   ├── a href="master.html"     → "Master"
    │       │   ├── a href="variantes.html"  → "Variantes"
    │       │   └── a href="fuentes.html"    → "Fuentes"
    │       └── div.hd-right (S)
    │           ├── a.hd-nav href="ajustes.html" style="display:inline-flex"
    │           │   └── span (inline style: font 500 --fs-ui / --font-sans, color --text-muted, padding 9px 12px) → "Ajustes"
    │           ├── div.hd-lang (S) → span[data-on]"ES" · span"EN"
    │           └── div.hd-av  (S) → "DG"
    │
    ├── main#stDense.db-main.c-wall (P+S)   data-screen-label="dashboard-denso"
    │   └── div.c-container (S)
    │       ├── div.db-strip (P)
    │       │   ├── span#dbDate.t-overline (S)  → fecha + "master: 52 items · 4 fuentes"  [reescrito por JS]
    │       │   └── span.acts (P)
    │       │       ├── a.c-btn.c-btn--quiet (S)  href="tailor.html"           → "Adaptar a un aviso"
    │       │       └── a.c-btn.c-btn--patina (S) href="editor-variante.html"  → "Nueva variante"
    │       ├── hr.c-divider (S)  style="margin-bottom:2px"     [se dibuja con CorpusMotion.boot()]
    │       └── div.db-bento (P)                                 [grid 12 col · gap 2px]
    │           ├── section.db-cell.db-v (P)  data-screen-label="dashboard-variantes"   [span 7]
    │           │   ├── div.db-ch (P)
    │           │   │   ├── span.t-overline (S) → "Variantes"
    │           │   │   ├── span.n (P)          → "7 · 2 desactualizadas"
    │           │   │   └── a href="variantes.html" → "ver todas →"
    │           │   └── div#vrows (P, sin clase)   ← RENDER JS: 7 × a.db-vrow
    │           │       └── a.db-vrow (P) href="editor-variante.html"     [grid 1fr auto auto]
    │           │           ├── span.nm (P)   → [span.c-pulse-dot (S) title="desactualizada" si old] + nombre
    │           │           ├── button.pdf (P) onclick="event.preventDefault()" title="Descargar el PDF sin entrar" → "PDF ↓"
    │           │           ├── span.st (P)   → span.old (P) "desactualizada · …"  |  "al día"  + <br> + touch
    │           │           └── span.obj (P)  → "objetivo: …"
    │           ├── div.db-side (P)                              [span 5 · 2 filas · gap 2px · fondo transparente]
    │           │   ├── section.db-cell.db-s (P)  data-screen-label="dashboard-salud"
    │           │   │   ├── div.db-ch (P) → span.t-overline "Salud del master" + span.n "sin score — cosas concretas"
    │           │   │   ├── a.db-srow (P) href="master.html#sin-cifra"     → span.k "3" + texto + span.go "→"
    │           │   │   ├── a.db-srow (P) href="master.html#sin-fechas"    → span.k "1" + texto + span.go "→"
    │           │   │   ├── a.db-srow (P) href="master.html#sin-evidencia" → span.k "2" + texto + span.go "→"
    │           │   │   └── div.db-fine (P) → "Lo que está bien no aparece aquí. Silencio = en orden."
    │           │   └── section.db-cell.db-s (P)  data-screen-label="dashboard-staging"
    │           │       └── a.db-stg (P) href="staging.html"
    │           │           ├── span.k.t-accent (P+S) → "2"
    │           │           ├── span.tx (P) → "items de la última lectura de GitHub esperan tu decisión"
    │           │           └── span.go (P) → "revisar →"
    │           └── section#fcells.db-cell.db-f (P)  data-screen-label="dashboard-fuentes"   [span 12 · 4 col · gap 1px]
    │               ├── div.db-fcell (P) → span.nm "github.com/dgatica"
    │               │                      div.facts (P) "12 repos · 5 seleccionados · aportó 14 items<br>último push: hace 3 días"
    │               │                      a.new (P) href="fuentes.html" → span.c-pulse-dot (S) + "2 repos con actividad nueva — leer"
    │               ├── div.db-fcell (P) → span.nm "dgatica.cl" · div.facts · div.quiet (P) "sin cambios detectados"
    │               ├── div.db-fcell (P) → span.nm "CV_2023.pdf" · div.facts · div.quiet "archivo estático — no cambia solo"
    │               └── div.db-fcell (P) → span.nm "cuestionario-identidad.md" · div.facts · div.quiet "fuente de primera — escrita por ti"
    │
    └── main#stEmpty.db-empty.c-window (P+S)   data-screen-label="dashboard-vacio"
        ├── span.t-overline (S) → "Día 1 · master: 0 items"
        ├── h1 style="margin-top:20px" → "Tu registro está vacío. Bien: <em>partamos de verdad.</em>"
        ├── p.sub (P) → subtítulo
        ├── div.db-doors (P)                                     [grid 1fr 1fr · max-width 720px]
        │   ├── a.c-card.c-lift.db-door (S+S+P) href="importar.html"
        │   │   ├── span.t-overline (S) → "Con IA · 5 minutos"
        │   │   ├── h3 → "Vuelca lo que tengas"
        │   │   ├── p  → cuerpo
        │   │   └── span.go (P) → "Pegar y extraer →"
        │   └── a.c-card.c-lift.db-door (S+S+P) href="onboarding.html"
        │       ├── span.t-overline (S) → "Sin IA · a tu ritmo"
        │       ├── h3 → "Escríbelo de cero"
        │       ├── p  → cuerpo
        │       └── span.go (P) → "Empezar a escribir →"
        └── p.fine (P) → "Ninguna puerta es de segunda. Puedes cambiar de vía cuando quieras."

div.demo (P · convención de entrega, NO producto)  role="group"  aria-label="Estados de la pantalla (revisión de diseño)"
├── span → "demo"
├── button[data-st="vacio"]    aria-pressed="false" → "vacío"
├── button[data-st="cargando"] aria-pressed="false" → "cargando"
└── button[data-st="denso"]    aria-pressed="true"  → "denso"
```

**Atributos `data-*` presentes:** `data-theme="dark"` (en `<html>`), `data-screen-label` (6×: `dashboard-denso`,
`dashboard-variantes`, `dashboard-salud`, `dashboard-staging`, `dashboard-fuentes`, `dashboard-vacio`),
`data-st` (3× en el panel demo), `data-on` (en `hd-lang`), `data-html` (creado en runtime por `skeleton()`).

**Auto-placement de `.db-vrow`** (importante, no es obvio): columnas `1fr auto auto`; el orden en el DOM es
`nm → pdf → st → obj`. `.pdf` y `.st` llevan `grid-row:span 2` y `.obj` lleva `grid-column:1`.
Resultado visual: **[ nombre / objetivo ] [ botón PDF ] [ estado + antigüedad, alineado a la derecha ]**.

---

## 4 · CSS específico de pantalla

Verbatim, líneas 487–551. **Sin `@keyframes` propios** — esta pantalla no define ninguno (usa `cPulse`,
`cSkel`, `c-enter` del sistema).

```css
/* ── dashboard.html — el estado de tu carrera, no un saludo ── */
.db-main{flex:1;padding:26px 0 90px}
.db-strip{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:20px}
.db-strip .t-overline{letter-spacing:.14em}
.db-strip .acts{margin-left:auto;display:flex;gap:10px}
.db-bento{display:grid;grid-template-columns:repeat(12,1fr);gap:2px}
.db-cell{background:var(--surface);border-radius:0;padding:0;min-width:0}
.db-bento .db-cell:first-child{border-radius:var(--radius-md) 0 0 0}
.db-ch{display:flex;align-items:baseline;gap:10px;padding:16px 20px 12px}
.db-ch .t-overline{font-size:10px}
.db-ch .n{font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)}
.db-ch a{margin-left:auto;font:500 var(--fs-micro)/1 var(--font-mono)}
/* variantes */
.db-v{grid-column:span 7;display:flex;flex-direction:column}
.db-vrow{display:grid;grid-template-columns:1fr auto auto;gap:2px 16px;align-items:center;
  padding:12px 20px;border-top:1px solid var(--border);text-decoration:none;color:inherit}
.db-vrow:hover{background:var(--surface-elevated);text-decoration:none;color:inherit}
.db-vrow .nm{font:500 14px/1.3 var(--font-sans);display:flex;align-items:center;gap:8px}
.db-vrow .obj{grid-column:1;font:400 var(--fs-micro)/1.4 var(--font-mono);color:var(--text-subtle)}
.db-vrow .st{grid-row:span 2;font:400 var(--fs-micro)/1.5 var(--font-mono);color:var(--text-subtle);text-align:right}
.db-vrow .st .old{color:var(--text-muted);display:flex;align-items:center;gap:6px;justify-content:flex-end}
.db-vrow .pdf{grid-row:span 2;font:500 var(--fs-micro)/1 var(--font-mono);color:var(--text-muted);
  border:1px solid var(--border);border-radius:5px;padding:8px 10px}
.db-vrow .pdf:hover{color:var(--accent-text);border-color:var(--border-patina)}
/* salud + staging */
.db-side{grid-column:span 5;display:grid;grid-template-rows:auto auto;gap:2px;background:transparent}
.db-s{background:var(--surface)}
.db-srow{display:flex;align-items:baseline;gap:12px;padding:11px 20px;border-top:1px solid var(--border);
  font-size:13px;color:var(--text-muted);text-decoration:none}
.db-srow:hover{background:var(--surface-elevated);text-decoration:none;color:var(--text)}
.db-srow .k{font:500 15px/1 var(--font-mono);color:var(--text);min-width:26px}
.db-srow .go{margin-left:auto;color:var(--text-subtle)}
.db-fine{padding:12px 20px 16px;font:400 var(--fs-micro)/1.7 var(--font-mono);color:var(--text-subtle)}
.db-stg{display:flex;align-items:center;gap:14px;padding:16px 20px;text-decoration:none;color:inherit}
.db-stg:hover{background:var(--surface-elevated);text-decoration:none;color:inherit}
.db-stg .k{font:500 26px/1 var(--font-mono)}
.db-stg .tx{font-size:13px;color:var(--text-muted)}
.db-stg .go{margin-left:auto;color:var(--accent-text);font:500 var(--fs-micro)/1 var(--font-mono)}
/* fuentes */
.db-f{grid-column:span 12;background:transparent;display:grid;grid-template-columns:repeat(4,1fr);gap:1px}
.db-fcell{background:var(--surface);padding:14px 20px 16px;min-height:104px}
.db-fcell .nm{font:500 13px/1 var(--font-mono)}
.db-fcell .facts{margin-top:8px;font:400 var(--fs-micro)/1.7 var(--font-mono);color:var(--text-subtle)}
.db-fcell .new{margin-top:8px;display:inline-flex;align-items:center;gap:7px;font:500 var(--fs-micro)/1 var(--font-mono);color:var(--accent-text)}
.db-fcell .new:hover{text-decoration:underline}
.db-fcell .quiet{margin-top:8px;font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)}
/* vacío — día 1: ni deprimente ni fanfarria */
.db-empty{flex:1;display:none;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:80px var(--container-pad) 120px}
.db-empty.show{display:flex}
.db-empty h1{font-size:var(--fs-display);max-width:18ch}
.db-empty .sub{margin-top:16px;color:var(--text-muted);font-size:var(--fs-lead);max-width:46ch}
.db-doors{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:44px;width:100%;max-width:720px;text-align:left}
.db-door{padding:24px 26px 26px;text-decoration:none;color:inherit;display:block}
.db-door:hover{text-decoration:none;color:inherit;border-color:var(--border-patina)}
.db-door .t-overline{font-size:10px}
.db-door h3{margin-top:10px;font-size:17px}
.db-door p{margin-top:8px;font-size:var(--fs-ui);color:var(--text-muted);line-height:1.6}
.db-door .go{display:inline-block;margin-top:14px;font:500 var(--fs-ui)/1 var(--font-sans);color:var(--accent-text)}
.db-empty .fine{margin-top:34px;font:400 var(--fs-micro)/1.7 var(--font-mono);color:var(--text-subtle)}
@media (max-width:1024px){.db-v{grid-column:span 12}.db-side{grid-column:span 12}.db-f{grid-template-columns:repeat(2,1fr)}}
@media (max-width:768px){.db-doors{grid-template-columns:1fr}.db-strip .acts{width:100%}}
@media (max-width:480px){.db-f{grid-template-columns:1fr}.db-vrow{grid-template-columns:1fr auto}.db-vrow .pdf{display:none}}
```

---

## 5 · Estados del panel demo

Los tres del handoff (`/app` → **vacío · cargando · denso**). Estado inicial: `denso` (`let cur='denso'`,
botón `denso` con `aria-pressed="true"` en el HTML). El panel `.demo` **no es producto**.

| Estado | Qué cambia en el DOM | Cómo se activa |
|---|---|---|
| **denso** (por defecto) | `#stDense.style.display=''` · `#stEmpty` sin `.show` (→ `display:none`) · `unskeleton()` restaura las 4 `.db-fcell` desde `dataset.html` · `renderDense()` pinta las 7 `a.db-vrow` en `#vrows` · `CorpusMotion.enter($('#stDense'))` (añade `.c-enter`) · aurora → `'calm'` | Clic en `button[data-st="denso"]`; o carga inicial (`renderDense(); M.boot()`); o auto-transición desde `cargando` a los 2200 ms |
| **cargando** | `#stDense` visible · `renderDense()` **y luego** `skeleton()`: `#vrows` se sustituye por **5** `div.c-skel` (`height:56px;margin:8px 20px;border-radius:6px`) y cada `.db-fcell` guarda su HTML en `dataset.html` y se sustituye por 3 `div.c-skel` (13px/130px, 11px/180px mt12, 11px/150px mt6) · aurora → `'calm'` | Clic en `button[data-st="cargando"]`. A los **2200 ms**, si `cur==='cargando'`, hace `unskeleton(); renderDense(); setState('denso')` |
| **vacío** | `#stDense.style.display='none'` · `#stEmpty` recibe `.show` (→ `display:flex`) · `CorpusMotion.enter($('#stEmpty'))` + `CorpusMotion.boot($('#stEmpty'))` · aurora → `'calm'` (visible: `#stEmpty` es `.c-window`) | Clic en `button[data-st="vacio"]` |

En los tres casos `setState()` recalcula `aria-pressed` de los 3 botones (`String(b.dataset.st===st)`).

---

## 6 · Comportamiento JS de la pantalla

Todo el JS fuera de `data-corpus-system` (líneas 911–962), IIFE con `'use strict'`.

**Helpers locales:** `$ = s => document.querySelector(s)` · `$$ = s => [...document.querySelectorAll(s)]` ·
`M = window.CorpusMotion`.

**Datos (array `V`, 7 variantes)** — ver §9.

**`vrow(v)` — plantilla de fila (literal):**

```js
function vrow(v){
  return '<a class="db-vrow" href="editor-variante.html">'
   +'<span class="nm">'+(v.old?'<span class="c-pulse-dot" title="desactualizada"></span>':'')+v.nm+'</span>'
   +'<button class="pdf" onclick="event.preventDefault()" title="Descargar el PDF sin entrar">PDF ↓</button>'
   +'<span class="st">'+(v.old?'<span class="old">desactualizada · '+v.old+'</span>':'al día')+'<br>'+v.touch+'</span>'
   +'<span class="obj">objetivo: '+v.obj+'</span>'
   +'</a>';
}
```

**`renderDense()`** → `$('#vrows').innerHTML = V.map(vrow).join('')`.

**`skeleton()` / `unskeleton()`** → memoriza el HTML original de cada `.db-fcell` en `c.dataset.html` (solo la
primera vez: `c.dataset.html = c.dataset.html || c.innerHTML`) y lo restaura después. 5 skeletons de fila +
3 skeletons por celda de fuente.

**`setState(st)` (el corazón):**

```js
function setState(st){
  $$('.demo button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.st===st)));
  const dense=st!=='vacio';
  $('#stDense').style.display=dense?'':'none';
  $('#stEmpty').classList.toggle('show',!dense);
  window.CorpusAurora.setState('calm');
  if(st==='cargando'){renderDense();skeleton();setTimeout(()=>{if(cur==='cargando'){unskeleton();renderDense();setState('denso')}},2200)}
  else if(st==='denso'){unskeleton();renderDense();M.enter($('#stDense'))}
  else{M.enter($('#stEmpty'));M.boot($('#stEmpty'))}
  cur=st;
}
```

**Arranque (líneas 952–960):**

```js
let cur='denso';
window.CorpusAurora.mount({state:'calm'});
$$('.demo button').forEach(b=>b.onclick=()=>setState(b.dataset.st));
renderDense();M.boot();
/* fecha real del sistema — un dato con fuente */
try{
  const d=new Date(),f=d.toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'});
  $('#dbDate').textContent=f.charAt(0).toUpperCase()+f.slice(1)+' · master: 52 items · 4 fuentes';
}catch(e){}
```

**Llamadas al sistema usadas aquí:**
- `CorpusAurora.mount({state:'calm'})` · `CorpusAurora.setState('calm')`. **Nunca** `'active'`, `pause`, `resume`, `setStrength`.
- `CorpusMotion.boot()` (sin scope, al cargar → dibuja `hr.c-divider`) · `CorpusMotion.boot($('#stEmpty'))` ·
  `CorpusMotion.enter(el)` (añade `.c-enter`, respeta reduce-motion, se quita en `animationend`).
- **No usa** `stagger`, `reveal`, `io`, `counter`, `shimmer`, `words/chars`, `xray`. El shimmer del producto vive en la ingesta, no aquí.
- `motion.js` (sistema) cablea `focusin/focusout` → `CorpusAurora.pause('focus')/resume('focus')`: aquí no hay campos, así que no se dispara.

**Listeners de la pantalla:** solo `onclick` en los 3 botones `.demo` y el `onclick="event.preventDefault()"`
inline del botón `.pdf` (evita que el clic navegue al editor).
**Atajos de teclado: ninguno** en esta pantalla (j/k/a/d/o son de staging).

---

## 7 · Copy (verbatim, ES)

### Sale de `06-handoff/copy.md` § Dashboard

| En pantalla (verbatim del HTML) | Estado en copy.md |
|---|---|
| `Tu registro está vacío. Bien: <em>partamos de verdad.</em>` | ✔ idéntico (el `<em>` es del HTML) |
| `Corpus guarda tu carrera una sola vez, con la evidencia de cada dato. Las variantes de tu CV salen de ahí — no al revés.` | ✔ idéntico |
| `Salud del master` + `sin score — cosas concretas` | ≈ copy.md dice «Salud del master — sin score, cosas concretas»; el HTML lo parte en dos y usa raya en vez de coma. **Usar la del HTML.** |
| `Lo que está bien no aparece aquí. Silencio = en orden.` | ✔ idéntico |
| `3` `viñetas sin ninguna cifra — ¿cuánto? ¿cuántos? ¿en cuánto tiempo?` | ✔ idéntico |
| `1` `rol sin fechas: Freelance (2019 – …)` | ✔ idéntico |
| `2` `skills siguen sin evidencia: Kafka, AWS` | ✔ idéntico |
| `desactualizada · cambió: cargo en Altiplano Pagos` | ✔ idéntico (compuesto en `vrow()`) |
| `2 repos con actividad nueva — leer` | ✔ idéntico |

### NO está en copy.md (solo en el HTML — copiar de aquí)

**Cabecera:** `Corpus` · `Panel` · `Master` · `Variantes` · `Fuentes` · `Ajustes` · `ES` · `EN` · `DG`

**Tira superior (denso):**
- `Martes 14 de julio · master: 52 items · 4 fuentes` (el JS reescribe el día con la fecha real; el sufijo ` · master: 52 items · 4 fuentes` es fijo)
- `Adaptar a un aviso`
- `Nueva variante`

**Bento — variantes:** `Variantes` · `7 · 2 desactualizadas` · `ver todas →` · `al día` · `objetivo: ` (prefijo) ·
`PDF ↓` · `title="Descargar el PDF sin entrar"` · `title="desactualizada"`

**Bento — staging:** `2` · `items de la última lectura de GitHub esperan tu decisión` · `revisar →`

**Bento — fuentes:**
- `github.com/dgatica` / `12 repos · 5 seleccionados · aportó 14 items` / `último push: hace 3 días`
- `dgatica.cl` / `6 proyectos · aportó 12 items` / `leída: hace 12 días` / `sin cambios detectados`
- `CV_2023.pdf` / `2 páginas · aportó 15 items` / `archivo estático — no cambia solo`
- `cuestionario-identidad.md` / `16 bloques · aportó 6 items` / `fuente de primera — escrita por ti`

**Vacío (día 1):**
- `Día 1 · master: 0 items`
- Puerta 1: `Con IA · 5 minutos` / `Vuelca lo que tengas` / `Texto suelto, tu CV viejo, tu GitHub, tu portfolio. La IA extrae; tú confirmas item por item. Nada entra sin tu ojo.` / `Pegar y extraer →`
- Puerta 2: `Sin IA · a tu ritmo` / `Escríbelo de cero` / `Desde una plantilla de rol o en blanco, con la IA apagada. El origen manual es el más verificable de todos: lo escribiste tú.` / `Empezar a escribir →`
- `Ninguna puerta es de segunda. Puedes cambiar de vía cuando quieras.`

> Ojo: las dos puertas del dashboard vacío **NO** reusan el copy de «Onboarding — las dos puertas» de
> copy.md. Es copy propio, más corto. No lo sustituyas por el del onboarding.

**Nombres de las 7 variantes y sus objetivos:** ver §9.

**Panel demo (no producto):** `demo` · `vacío` · `cargando` · `denso` · `aria-label="Estados de la pantalla (revisión de diseño)"`

**`<title>`:** `Corpus — Panel · el estado de tu carrera`

---

## 8 · Accesibilidad

- **`<html lang="es" data-theme="dark">`** — el tema se conmuta con `data-theme` (lo cambia `ajustes.html`).
- **Landmarks:** `header.c-header` · `nav.hd-nav` · **dos `<main>`** (`#stDense`, `#stEmpty`) — solo uno visible a la vez,
  pero **ambos están en el DOM**. ⚠ Dos `<main>` simultáneos es un fallo de landmarks: el oculto está con
  `display:none` (fuera del árbol de accesibilidad), así que en la práctica no se anuncian dos — pero en React,
  **renderiza condicionalmente uno solo**.
- **Navegación:** `a[aria-current="page"]` en «Panel».
- **Panel demo:** `role="group"` + `aria-label="Estados de la pantalla (revisión de diseño)"`; los 3 botones llevan
  `aria-pressed` (`true`/`false`) y se recalculan en cada `setState`. Es un toggle group correcto.
- **Live regions: ninguna.** No hay `aria-live`, `role="status"` ni `role="alert"` en esta pantalla. La transición
  cargando→denso (2200 ms) es **silenciosa para un lector de pantalla**. Candidato a mejora, pero no está en el diseño.
- **Orden de foco (denso):** logo → Panel → Master → Variantes → Fuentes → Ajustes → [hd-lang y hd-av no son focusables] →
  «Adaptar a un aviso» → «Nueva variante» → por cada variante: `a.db-vrow` → `button.pdf` → (siguiente fila) →
  3 × `a.db-srow` → `a.db-stg` → `a.new` (github) → 3 botones del panel demo.
- ⚠ **`<button class="pdf">` va DENTRO de `<a class="db-vrow">`**: HTML inválido (interactivo dentro de interactivo).
  Funciona por el `event.preventDefault()`, pero es un bug de accesibilidad heredado. **En React hay que
  desanidarlo** (fila como `<div>` con un enlace-stretched y el botón fuera del enlace) manteniendo intactos los
  nombres de clase `db-vrow / nm / obj / st / pdf`.
- **Semántica no-cromática:** «desactualizada» se marca con **punto (`.c-pulse-dot`) + palabra**, nunca solo color;
  el punto además lleva `title="desactualizada"`.
- **Hit targets:** `.db-srow` ≈ 11+13+11 ≈ 40 px de alto; `.db-stg` ≈ 16+26+16 ≈ 58 px; `.db-vrow` ≈ 56 px;
  `.c-btn` = `--control-h` (40 px) del sistema. El `button.pdf` (≈ 27 px) **se oculta bajo 480 px**
  (`@media (max-width:480px){.db-vrow .pdf{display:none}}`), que es justo la regla que evita el target chico en móvil.
- **Focus visible:** anillo `--focus-ring` del sistema (`--patina-300` en oscuro), no se sobrescribe aquí.
- **Reduce-motion:** todo el movimiento viene del sistema (`.c-lift`, `.c-pulse-dot`, `.c-skel`, `.c-enter`,
  `.c-divider`), y el sistema los apaga bajo `prefers-reduced-motion`. La pantalla no añade animación propia.
- **Atajos de teclado: ninguno.**

---

## 9 · Datos del mock

**Persona:** Diego Gatica (iniciales **DG** en `.hd-av`).

**Master:** 52 items · 4 fuentes · 7 variantes (2 desactualizadas) · 2 items en staging.

**Las 7 variantes (array `V`, orden literal):**

| # | `nm` | `obj` | `touch` | `old` |
|---|---|---|---|---|
| 1 | Backend — Fintech | Backend Engineer | tocada hace 2 días · 2 págs | cambió: cargo en Altiplano Pagos |
| 2 | Backend — General | Backend Developer | hace 5 días · 2 págs | cambió: cargo en Altiplano Pagos |
| 3 | Data Engineering | Data Engineer | hace 1 semana · 2 págs | — |
| 4 | Plataforma / DevOps | Platform Engineer | hace 2 semanas · 2 págs | — |
| 5 | Full-stack — startup temprana | Software Engineer | hace 3 semanas · 1 pág | — |
| 6 | Backend — EN · remoto | Backend Engineer (EN) | hace 1 mes · 2 págs | — |
| 7 | Académica — ayudantías | Ingeniero de Software | hace 2 meses · 1 pág | — |

**Las 4 fuentes:**

| Fuente | Hechos | Estado |
|---|---|---|
| `github.com/dgatica` | 12 repos · 5 seleccionados · aportó 14 items · último push: hace 3 días | 2 repos con actividad nueva — leer |
| `dgatica.cl` | 6 proyectos · aportó 12 items · leída: hace 12 días | sin cambios detectados |
| `CV_2023.pdf` | 2 páginas · aportó 15 items | archivo estático — no cambia solo |
| `cuestionario-identidad.md` | 16 bloques · aportó 6 items | fuente de primera — escrita por ti |

**Salud del master:** 3 viñetas sin cifra · 1 rol sin fechas (**Freelance (2019 – …)**) · 2 skills sin evidencia
(**Kafka, AWS**).

**Empresa citada:** **Altiplano Pagos** (el cargo que cambió: Backend Developer → Senior Backend Developer, según
`copy.md` § Variantes). Coherente con `variantes.html` y `editor-variante.html`.

**Anclas cruzadas:** `master.html#sin-cifra`, `master.html#sin-fechas`, `master.html#sin-evidencia` —
el master **debe** tener esos tres ids.

---

## 10 · Números en la UI

**Regla del producto:** ningún número sin fuente. Sin score, sin %, sin "confidence", sin umbrales inventados.

| Número | Dónde | De dónde sale |
|---|---|---|
| fecha (`Martes 14 de julio`) | `#dbDate` | **Reloj del sistema** — `new Date().toLocaleDateString('es-CL',…)`. Dato con fuente real. |
| `52 items` | `#dbDate` | Conteo de items del master (hardcode en el mock; en producción: `count(master.items)`) |
| `4 fuentes` | `#dbDate` | Conteo de fuentes conectadas (= las 4 `.db-fcell`) |
| `7 · 2 desactualizadas` | `.db-ch .n` de Variantes | `V.length` = 7 y `V.filter(v=>v.old)` = 2. **Coherente con el array.** |
| `3` / `1` / `2` | `.db-srow .k` (salud) | Conteos de hallazgos concretos: 3 viñetas sin cifra · 1 rol sin fechas · 2 skills sin evidencia. Cada uno enlaza a su ancla en el master. |
| `2` | `.db-stg .k` (staging) | Items pendientes de la última lectura de GitHub |
| `12 repos` / `5 seleccionados` / `14 items` / `hace 3 días` | fuente GitHub | API pública de GitHub + selección del usuario + conteo de procedencia |
| `2 repos con actividad nueva` | fuente GitHub | Diff contra la última lectura |
| `6 proyectos` / `12 items` / `hace 12 días` | fuente dgatica.cl | Lectura del portfolio |
| `2 páginas` / `15 items` | fuente CV_2023.pdf | Parseo del PDF |
| `16 bloques` / `6 items` | fuente cuestionario | Conteo de bloques del `.md` |
| `2 días / 5 días / 1 semana / 2 semanas / 3 semanas / 1 mes / 2 meses` | `.db-vrow .st` | `touch` de cada variante (timestamp de última edición) |
| `2 págs` / `1 pág` | `.db-vrow .st` | Paginación real del PDF (el preview ES el PDF) |
| `0 items` | `.db-empty .t-overline` | Estado vacío |
| `Con IA · 5 minutos` | puerta A | **Estimación de tiempo, no una métrica**. Es promesa de UX, no un número de datos. Aceptable, pero es el único número "blando" de la pantalla. |
| `5` skeletons / `2200 ms` | interno | No visibles como cifra |

**Veredicto: cero violaciones.** No hay ningún `%`, ningún score, ningún "confidence", ninguna barra de progreso
porcentual. Todos los números son **conteos con origen** o **fechas**. La única cifra sin fuente estricta es
`5 minutos` en la puerta A del estado vacío, y es una estimación de duración, no una medida sobre los datos del
usuario — se queda como está.

**Aviso de coherencia (no es violación, pero persíguelo):** las cuatro fuentes suman
`14 + 12 + 15 + 6 = 47` items aportados, y el master declara **52**. Faltan 5. Si es intencional (items escritos a
mano, de origen manual, o items del staging ya promovidos), déjalo; si no, **una de las dos cifras miente** —
y esta pantalla no puede permitirse eso. El handoff obliga: *"si tocas una, persigue el resto"*.
