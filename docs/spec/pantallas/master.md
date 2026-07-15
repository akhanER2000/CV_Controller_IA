# Pantalla · master

> Spec literal extraída de `Corpus_ diseño completo/corpus-design/04-pantallas/master.html` (1038 líneas).
> El HTML es la REFERENCIA VISUAL LITERAL. Los nombres de clase son el contrato diseño↔código: **no se cambian**.
> Los bloques `<style data-corpus-system="css">` (líneas 10–486) y `<script data-corpus-system="js">` (líneas 598–869)
> son copia del sistema canónico (`02-sistema/*`) y **no** se transcriben aquí. Todo lo de abajo es lo ESPECÍFICO de la pantalla.

---

## 1 · Ruta y propósito

- **Ruta del producto:** `/app/master` (según `06-handoff/handoff.md`, fila `| /app/master | 04-pantallas/master.html | 3 · 52 · 200 · vacío |`).
- **Propósito:** es el **registro canónico completo** del usuario — su archivo entero, no un formulario. Se edita **inline** (todo texto es `contenteditable`) y **cada item conserva y muestra su origen** (el fragmento del que salió), expandible in situ. Título del documento: `Corpus — Master · el registro canónico`.
- Comentario literal del autor en el `<style>` de pantalla: `/* ── master.html — el archivo completo. Esto es un editor, no un formulario. ── */`
- `<html lang="es" data-theme="dark">`.

---

## 2 · Ventana o muro · Aurora

**NO monta la aurora.** Verificado: en `master.html` **no existe ninguna llamada a `CorpusAurora.mount`** ni ningún elemento `.c-aurora` en el `<body>`. Las únicas apariciones de `CorpusAurora` en el archivo están **dentro** del bloque `data-corpus-system` (la definición de la propia librería, líneas 608+, y el auto-pause/resume por `focusin`/`focusout` en 851/854).

Esto es exactamente la regla: **«donde hay trabajo, el trabajo gana» — los muros ni montan la aurora.** El master es trabajo puro (lectura densa + edición), así que es MURO.

| Clase de la gramática | ¿Se usa en master? | Dónde |
|---|---|---|
| `.c-window` | **No** | — |
| `.c-wall` | **Sí** | `<main class="ms-main c-wall" data-screen-label="master">` (única sección de contenido) |
| `.c-panel` | **No** | — |
| `.c-scrim` / `--soft` / `--edge` | **No** | — |
| `.c-aurora` / `CorpusAurora.mount` | **No** | — |

Consecuencia para React: en `/app/master` **no se renderiza el canvas de aurora**. El fondo es `var(--bg)` opaco (`.c-wall`). Además, el `focusin` global del sistema llamaría a `CorpusAurora.pause('focus')` — como no hay aurora montada, la guarda `window.CorpusAurora && …` es no-op; hay que conservar esa guarda al portar.

La barra `.ms-sub` sí usa vidrio propio (no `.c-panel`): `background: color-mix(in srgb, var(--bg) 86%, transparent)` + `backdrop-filter: blur(8px)`.

---

## 3 · Esqueleto DOM

`(S)` = clase del sistema (`c-*`, `t-*`, `hd-*`, `demo`) · `(P)` = propia de esta pantalla.

### 3.1 · DOM estático (en el HTML)

```
body
└── div.c-page (S)
    ├── header.c-header (S)
    │   └── div.c-container (S)
    │       ├── a.c-logo (S)  href="dashboard.html"  → "Corpus"
    │       ├── nav.hd-nav (S)
    │       │   ├── a href="dashboard.html"                     → "Panel"
    │       │   ├── a href="master.html" aria-current="page"    → "Master"
    │       │   ├── a href="variantes.html"                     → "Variantes"
    │       │   └── a href="fuentes.html"                       → "Fuentes"
    │       └── div.hd-right (S)
    │           ├── a.hd-nav (S) href="ajustes.html" style="display:inline-flex"
    │           │   └── span style="font:500 var(--fs-ui)/1 var(--font-sans);color:var(--text-muted);padding:9px 12px" → "Ajustes"
    │           ├── div.hd-lang (S)
    │           │   ├── span[data-on] → "ES"
    │           │   └── span         → "EN"
    │           └── div.hd-av (S)    → "DG"
    │
    ├── div.ms-sub (P)  [data-screen-label="master-toolbar"]      ← sticky bajo el header (top: var(--header-h), z-index 9)
    │   └── div.c-container (S)
    │       ├── input.c-input (S) #q  placeholder="Buscar en tu registro… (título, viñeta, skill)"
    │       ├── div.ms-f (P)  role="group"  aria-label="Filtros"
    │       │   ├── button[data-f="all"]           aria-pressed="true"   → "todo"
    │       │   ├── button[data-f="sin-cifra"]     aria-pressed="false"  → "sin cifra"
    │       │   ├── button[data-f="sin-evidencia"] aria-pressed="false"  → "⚠ sin evidencia"
    │       │   └── button[data-f="sin-fechas"]    aria-pressed="false"  → "sin fechas"
    │       └── span.n (P) #msN → "52 items · 4 fuentes · editado hace 2 días"
    │
    └── main.ms-main.c-wall (P+S)  [data-screen-label="master"]
        └── div.c-container (S) #body
            ├── div  style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap"
            │   ├── p  style="color:var(--text-muted);font-size:var(--fs-ui);max-width:64ch"
            │   │      → "Tu archivo completo — aquí caben los 14 proyectos aunque cada variante muestre 3.
            │   │         <b style="color:var(--text);font-weight:500">Haz clic en cualquier texto y edítalo ahí mismo</b>;
            │   │         cada item recuerda de dónde salió."
            │   └── button.c-btn (S) #btnAdd → "+ Añadir item manual"
            ├── div #groups                       ← TODO el cuerpo se inyecta aquí por JS (ver 3.2)
            └── div.ms-empty (P) #msEmpty [hidden]        ← estado "vacío"
                ├── span.t-overline (S)  → "Master vacío"
                ├── h2 style="margin-top:14px" → "Aún no hay registro."
                ├── p → "Vuélcalo con IA en 5 minutos, o escríbelo de cero con la IA apagada."
                └── div style="display:flex;gap:10px;justify-content:center;margin-top:24px"
                    ├── a.c-btn.c-btn--patina (S) href="importar.html"  → "Volcar lo que tengo"
                    └── a.c-btn (S)              href="onboarding.html" → "Escribir de cero"

div.demo (S)  role="group"  aria-label="Estados de la pantalla (revisión de diseño)"
├── span → "demo"
├── button[data-st="3"]   aria-pressed="false" → "3 items"
├── button[data-st="52"]  aria-pressed="true"  → "52 items"
├── button[data-st="200"] aria-pressed="false" → "200 items"
└── button[data-st="0"]   aria-pressed="false" → "vacío"
```

### 3.2 · DOM generado por JS dentro de `#groups`

Un `<section>` por grupo, producido por `group(id, title, cnt, inner)`:

```
section.ms-g (P)  #<id>            ← id ∈ resumen | experiencia | skills | proyectos | educacion
├── div.ms-gh (P)
│   ├── span.t-overline (S)        → título del grupo
│   ├── span.cnt (P)               → contador derivado ("4 roles · 16 viñetas", "16 items"…)
│   └── button.fold (P) [data-fold] → "plegar" ⇄ "desplegar"   (togglea .folded en .ms-g)
├── hr.c-divider (S)               ← lo dibuja CorpusMotion.boot()
└── div.ms-body (P)                ← se oculta con .ms-g.folded .ms-body{display:none}
    └── <inner>
```

**Grupo `resumen`** (solo en el estado `52`; `cnt` = `"1 item"`):

```
div.c-card.ms-card (S+P)
├── div.ms-b (P) [data-item]
│   ├── span.tx (P) contenteditable="true" spellcheck="false"
│   │     → texto con <span class="t-num"> (S) envolviendo cada cifra
│   └── button.ms-src (P) [data-fr="<n>"] → "origen: escrito por ti ▾"
└── div.ms-frag (P) [data-frag="<n>"]     → "escrito por ti (onboarding) — <mark>el origen manual es el más verificable de todos</mark>."
```

**Grupo `experiencia`** — `expCard(e)` por rol, más el botón de añadir:

```
article.c-card.ms-card (S+P) [data-item]
├── div.ms-eh (P)
│   ├── span.tt (P)   contenteditable="true" spellcheck="false"  → título del rol
│   ├── span.org (P)  → "<org> · <dates>"
│   ├── span.warn (P) [data-warn="fechas"]  → "⚠ <warn>"        ← SOLO si e.warn
│   └── span.meta (P)
│       └── button.ms-src (P) [data-fr="<n>"] → "origen: <SRC[src]> ▾"
├── div.ms-frag (P) [data-frag="<n>"]   → cita literal del fragmento, con <mark>
└── (por cada viñeta)
    ├── div.ms-b (P) [data-item] [data-num="true|false"]
    │   ├── span.tx (P) contenteditable="true" spellcheck="false"
    │   │     → texto con cifras envueltas en <span class="t-num"> (S)
    │   ├── span.ms-nudge (P) [.push si hay pregunta]  → "sin cifra" | "sin cifra — <pregunta>"   ← SOLO si !b.num
    │   └── button.ms-src (P) [data-fr="<n>"]
    └── div.ms-frag (P) [data-frag="<n>"]
button.ms-add (P) → "+ añadir rol"
```

**Grupo `skills`** — `cnt` = `"<n> items"`, título `"Skills — con su evidencia"`:

```
div.ms-skills (P)                      ← grid 2 col (1 col < 768px), hairlines de 1px con background:var(--border)
└── div.ms-sk (P) [data-item] [data-ver="ok|partial|none"]
    ├── div.top (P)
    │   ├── span.nm (P) → nombre de la skill
    │   └── span.c-ver.c-ver--<ver> (S) → "verificado" | "parcial" | "sin evidencia"
    ├── div.ev (P) → evidencia (puede contener <a> y <br>)
    └── (solo si s.ask)
        ├── hr
        └── div.ask (P) → "<pregunta> " + button → "responder — quedará como origen: tú"
button.ms-add (P) → "+ añadir skill (quedará como origen: tú)"
```

**Grupos `proyectos` y `educacion`** — filas densas:

```
div.ms-rows (P)
└── div.ms-row (P) [data-item]
    ├── span contenteditable="true" spellcheck="false" → texto
    └── span.m (P) → metadato ("github · 214 KB · 41 commits", "2014 – 2019"…)
```

---

## 4 · CSS específico de pantalla

Copia VERBATIM del `<style>` **sin** `data-corpus-system` (líneas 487–550). **No define ningún `@keyframes` propio** — todo el movimiento reutiliza el del sistema.

```css
/* ── master.html — el archivo completo. Esto es un editor, no un formulario. ── */
.ms-sub{position:sticky;top:var(--header-h);z-index:9;background:color-mix(in srgb,var(--bg) 86%,transparent);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.ms-sub .c-container{display:flex;align-items:center;gap:14px;padding-block:12px;flex-wrap:wrap}
.ms-sub input{max-width:320px;height:36px;font-size:var(--fs-ui)}
.ms-f{display:flex;gap:6px}
.ms-f button{font:500 var(--fs-micro)/1 var(--font-mono);padding:8px 10px;border:1px solid var(--border);border-radius:6px;color:var(--text-muted)}
.ms-f button:hover{color:var(--text);border-color:var(--border-strong)}
.ms-f button[aria-pressed="true"]{color:var(--text);background:var(--surface-elevated);border-color:var(--border-patina)}
.ms-sub .n{margin-left:auto;font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)}
.ms-main{flex:1;padding:26px 0 120px}
.ms-g{margin-top:40px}
.ms-gh{display:flex;align-items:baseline;gap:12px;padding-bottom:10px}
.ms-gh .cnt{font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)}
.ms-gh .fold{margin-left:auto;font:500 var(--fs-micro)/1 var(--font-mono);color:var(--text-muted)}
.ms-gh .fold:hover{color:var(--text)}
.ms-g.folded .ms-body{display:none}
/* item de experiencia */
.ms-card{margin-top:12px}
.ms-eh{display:flex;align-items:baseline;gap:12px;padding:15px 20px 10px;flex-wrap:wrap}
.ms-eh .tt{font:600 15px/1.3 var(--font-sans)}
.ms-eh .org{font:400 var(--fs-data)/1.3 var(--font-mono);color:var(--text-muted)}
.ms-eh .warn{font:400 var(--fs-micro)/1 var(--font-mono);color:var(--danger)}
.ms-eh .meta{margin-left:auto;display:flex;gap:8px;align-items:baseline}
.ms-b{display:flex;gap:12px;align-items:baseline;padding:9px 20px;border-top:1px solid var(--border);font-size:13px;line-height:1.55}
.ms-b .tx{flex:1;min-width:0;border-radius:4px}
.ms-b .tx:hover{background:var(--surface-elevated);box-shadow:0 0 0 6px var(--surface-elevated);cursor:text}
.ms-b .tx:focus{outline:none;background:var(--surface-sunken);box-shadow:0 0 0 6px var(--surface-sunken),0 0 0 7px var(--border-patina)}
.ms-b .tx .t-num{color:var(--text)}
.ms-nudge{flex:none;font:400 10px/1.4 var(--font-mono);color:var(--text-subtle);max-width:150px;text-align:right}
.ms-nudge.push{color:var(--text-muted)}
.ms-src{flex:none;font:400 10px/1 var(--font-mono);color:var(--text-subtle);opacity:0}
.ms-b:hover .ms-src,.ms-eh:hover .ms-src{opacity:1;cursor:pointer}
.ms-src:hover{color:var(--accent-text)}
.ms-frag{display:none;margin:0 20px 10px;padding:10px 14px;background:var(--surface-sunken);border-left:2px solid var(--border-strong);
  font:400 11px/1.7 var(--font-mono);color:var(--text-muted);border-radius:0 6px 6px 0}
.ms-frag.open{display:block}
.ms-frag mark{background:rgba(95,198,169,.16);color:var(--text);padding:0 3px;border-radius:2px}
/* ★ tarjeta de skill con evidencia */
.ms-skills{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;margin-top:12px}
.ms-sk{background:var(--surface);padding:14px 18px}
.ms-sk .top{display:flex;align-items:baseline;gap:10px}
.ms-sk .nm{font:500 14px/1.2 var(--font-sans)}
.ms-sk .top .c-ver{margin-left:auto}
.ms-sk .ev{margin-top:7px;font:400 var(--fs-micro)/1.7 var(--font-mono);color:var(--text-muted)}
.ms-sk .ev a{color:var(--text-muted)}
.ms-sk .ask{margin-top:8px;font:400 var(--fs-data)/1.5 var(--font-sans);color:var(--text-muted)}
.ms-sk .ask button{font:500 var(--fs-micro)/1 var(--font-mono);color:var(--accent-text)}
.ms-sk .ask button:hover{text-decoration:underline}
.ms-sk[data-ver="none"]{background:color-mix(in srgb,var(--danger) 4%,var(--surface));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--danger) 28%,transparent)}
.ms-sk hr{border:0;border-top:1px solid var(--border);margin:10px 0 0}
/* fila densa (proyectos, educación) */
.ms-rows{border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;margin-top:12px}
.ms-row{display:flex;gap:12px;align-items:baseline;padding:11px 18px;background:var(--surface);font-size:13px}
.ms-row+.ms-row{border-top:1px solid var(--border)}
.ms-row .m{font:400 var(--fs-micro)/1.4 var(--font-mono);color:var(--text-subtle);margin-left:auto;white-space:nowrap}
.ms-add{margin-top:10px;width:100%;padding:12px;border:1px dashed var(--border-strong);border-radius:var(--radius-md);
  font:500 var(--fs-data)/1 var(--font-mono);color:var(--text-subtle);text-align:center}
.ms-add:hover{color:var(--accent-text);border-color:var(--border-patina)}
.ms-empty{max-width:520px;margin:80px auto;text-align:center}
.ms-empty p{margin-top:12px;color:var(--text-muted)}
@media (max-width:768px){.ms-skills{grid-template-columns:1fr}.ms-nudge{display:none}}
```

Notas de lectura del CSS (no son opinión, son lo que hace el código):

- `.ms-b .tx:focus` **anula el `outline`** del sistema y lo sustituye por un doble `box-shadow`: colchón de `--surface-sunken` (6px) + hairline de pátina (`--border-patina`) a 7px. Es el "foco de edición" — el hairline de pátina **es** el sistema de estados.
- `.ms-src` está a `opacity:0` y solo se revela con `:hover` del `.ms-b` / `.ms-eh` que lo contiene.
- `.ms-sk[data-ver="none"]` = fondo teñido de `--danger` al 4% + `inset box-shadow` de 1px al 28%. Nunca es solo color: siempre va acompañado del glifo `⚠` y la palabra "sin evidencia" (vía `.c-ver--none` del sistema).
- Único breakpoint propio: `768px` → skills a 1 columna y `.ms-nudge` desaparece.

---

## 5 · Estados del panel demo

Estados declarados en `handoff.md`: **`3 · 52 · 200 · vacío`**. Coinciden 1:1 con los `data-st` del panel.

La variable de estado es `let SCALE='52'` y todo se re-renderiza con `render()`.

| Botón | `data-st` | Qué cambia en el DOM | Cómo se activa |
|---|---|---|---|
| **3 items** | `"3"` | `exp = [{...EXP[0], bullets: EXP[0].bullets.slice(0,2)}]` (1 rol, 2 viñetas). `sk=[]`, `pj=[]`, `ed=[]`, `resumen=false` → **solo existe el grupo `experiencia`**; no se renderizan Resumen, Skills, Proyectos ni Educación. `#msN` → `"3 items · 4 fuentes · editado hace 2 días"` | click en `.demo button[data-st="3"]` |
| **52 items** ★ por defecto | `"52"` | Estado completo: Resumen (1) + Experiencia (4 roles / 16 viñetas) + Skills (16) + Proyectos (4) + Educación (3). `#msN` → `"52 items · 4 fuentes · editado hace 2 días"` | por defecto (`aria-pressed="true"` en el HTML) |
| **200 items** | `"200"` | Sobre el estado 52 concatena: **50 skills extra** con `ver:'partial'` y evidencia `"acumulada de fuentes antiguas — revisa si sigue siendo verdad"` (Terraform…Postman) → 66 skills; **10 proyectos archivo** (`proyecto-archivo-1…10 — experimento personal (año)`, meta `github · archivado`) → 14; **8 ayudantías** (`Ayudantía: Algoritmos/Bases de Datos/… — UNAB`) → 11 educación. `#msN` → `"203 items · 4 fuentes · editado hace 2 días"` | click |
| **vacío** | `"0"` | `#groups` se vacía (`innerHTML=''`), `#msEmpty` deja de estar `hidden`, `#msN` → **`"0 items"`** (sin sufijo de fuentes/fecha). `return` temprano: no hay stagger ni filtro | click |

El panel: `$$('.demo button').forEach(b => b.onclick = () => { … aria-pressed = String(x===b) … SCALE = b.dataset.st; render(); })`.
Los botones **no ocultan/muestran** capas: reconstruyen `#groups` entero. El estado vacío es el único que usa `[hidden]`.

---

## 6 · Comportamiento JS de la pantalla

Todo el `<script>` sin `data-corpus-system` (líneas 870–1036), IIFE con `'use strict'`.

### 6.1 · Helpers y datos

```js
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], M=window.CorpusMotion;
const SRC={tx:'texto pegado',gh:'github',web:'dgatica.cl',cv:'CV_2023.pdf',q:'cuestionario',man:'escrito por ti'};
let SCALE='52';
let frid=0;   // contador global de ids de fragmento (crece entre renders; los ids siguen siendo únicos)
```

Estructuras de datos: `EXP` (4 roles con `tt/org/dates/src/frag/bullets[]`, cada bullet `{tx, src, num:boolean, nudge?}`), `SK` (16 skills `{n, ver:'ok'|'partial'|'none', ev, ask?}`), `PJ` (4 proyectos `{tx, m}`), `ED` (3 items `{tx, m}`). Ver §9.

### 6.2 · Constructores de HTML

- `srcBtn(s,i)` → `'<button class="ms-src" data-fr="'+i+'">origen: '+SRC[s]+' ▾</button>'`
- `nudge(b)` → `''` si `b.num` es true; si no: `<span class="ms-nudge[ push]">` con texto `'sin cifra'` o `'sin cifra — '+b.nudge`. La clase `.push` solo se añade **cuando hay pregunta**.
- `expCard(e)` → `article.c-card.ms-card[data-item]` con cabecera + fragmento + N pares `(.ms-b, .ms-frag)`.
  **Regla de números:** el texto de la viñeta pasa por
  `b.tx.replace(/(\d[\d.,%~]*)/g,'<span class="t-num">$1</span>')` — toda cifra visible queda envuelta en la voz mono `t-num`.
  El fragmento de una viñeta depende del origen:
  - `src === 'gh'` → `'evidencia: repos y archivos de <mark>github.com/dgatica</mark> — hechos de API, sin IA.'`
  - resto → `'fragmento de <mark>'+SRC[b.src]+'</mark> citado en staging (12 jul).'`
- `skCard(s)` → `.ms-sk[data-ver]` con `.c-ver--<ver>` cuyo texto es `'verificado' | 'parcial' | 'sin evidencia'`; si hay `ask`, añade `<hr>` + `.ask` con el botón `responder — quedará como origen: tú`.
- `group(id,title,cnt,inner)` → `section.ms-g#<id>` con `.ms-gh` (overline + `.cnt` + `button.fold[data-fold]`), `<hr class="c-divider">` y `.ms-body`.

### 6.3 · `render()`

1. Si `SCALE==='0'`: vacía `#groups`, muestra `#msEmpty`, pone `#msN = '0 items'` y **retorna**.
2. Oculta `#msEmpty`; calcula `exp/sk/pj/ed/resumen` según `SCALE` (ver §5).
3. Compone los grupos en este orden: **Resumen → Experiencia → Skills — con su evidencia → Proyectos → Educación y certificaciones**. Los grupos `skills`, `proyectos` y `educacion` solo se emiten `if (length)`.
   Contadores **derivados de los datos**: `exp.length+' roles · '+exp.reduce((a,e)=>a+e.bullets.length,0)+' viñetas'`, `sk.length+' items'`, `pj.length+' items — cada variante elige los suyos'`, `ed.length+' items'`.
4. `const total = {'3':3,'52':52,'200':203}[SCALE];` → `$('#msN').textContent = total+' items · 4 fuentes · editado hace 2 días'` — **este número es un literal de tabla, no se deriva de los datos** (ver §10).
5. Movimiento:
   ```js
   M.stagger(g,{step:40,cap:24,items:g.querySelectorAll('.ms-card,.ms-sk,.ms-row')});
   M.boot();
   ```
   Es decir: escalonado de 40 ms con tope 24 items sobre **tarjetas, skills y filas** (no sobre los `section`), y `boot()` para dibujar los `.c-divider`. **No hay IntersectionObserver** (`CorpusMotion.io` no se usa: la app no lleva scroll-reveal).
6. `applyFilter()`.

### 6.4 · Listeners (delegación en `document`)

```js
/* origen expandible */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-fr]');
  if(b){const f=document.querySelector('[data-frag="'+b.dataset.fr+'"]');if(f)f.classList.toggle('open');return}
  const fold=e.target.closest('[data-fold]');
  if(fold){const g=fold.closest('.ms-g');g.classList.toggle('folded');fold.textContent=g.classList.contains('folded')?'desplegar':'plegar'}
});
```

```js
/* edición inline: al salir, el item recuerda que lo tocaste */
document.addEventListener('blur',e=>{
  const tx=e.target.closest&&e.target.closest('[contenteditable="true"]');
  if(!tx)return;
  const row=tx.closest('[data-item]');
  if(row&&!row.dataset.touched){row.dataset.touched='1';
    const src=row.querySelector('.ms-src');
    if(src){src.textContent='origen: editado por ti · ahora ▾';src.style.opacity=1;src.style.color='var(--accent-text)'}}
},true);
```

> Se registra en fase de **captura** (`true`) porque `blur` no burbujea. Al primer blur de una edición: marca `data-touched="1"` en el `[data-item]` más cercano, reescribe el botón de origen a **`origen: editado por ti · ahora ▾`**, lo fija visible (`opacity:1`) y lo pinta con `--accent-text` (pátina). Es idempotente: solo la primera vez.

### 6.5 · Búsqueda y filtros

```js
function applyFilter(){
  const q=($('#q').value||'').toLowerCase();
  const f=$$('.ms-f button').find(b=>b.getAttribute('aria-pressed')==='true').dataset.f;
  $$('#groups [data-item]').forEach(it=>{
    let ok=true;
    if(q)ok=it.textContent.toLowerCase().includes(q);
    if(ok&&f==='sin-cifra')ok=it.dataset.num==='false';
    if(ok&&f==='sin-evidencia')ok=it.dataset.ver==='none';
    if(ok&&f==='sin-fechas')ok=!!it.querySelector&&!!it.querySelector('[data-warn="fechas"]');
    it.style.display=ok?'':'none';
  });
  $$('.ms-g').forEach(g=>{
    const any=[...g.querySelectorAll('[data-item]')].some(i=>i.style.display!=='none');
    g.style.display=any?'':'none';
  });
}
$('#q').addEventListener('input',applyFilter);
$$('.ms-f button').forEach(b=>b.onclick=()=>{
  $$('.ms-f button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));applyFilter()});
```

- Los filtros son **excluyentes** (radio implementado con `aria-pressed`), se combinan con la búsqueda por AND.
- Se filtra ocultando `[data-item]`; luego se oculta el `section.ms-g` entero si ninguno de sus items quedó visible.

### 6.6 · Deep-link por hash (los anchors del dashboard llegan aquí)

```js
if(location.hash){const f=$$('.ms-f button').find(b=>b.dataset.f===location.hash.slice(1));
  if(f)setTimeout(()=>f.click(),60)}
```

`/app/master#sin-cifra`, `#sin-evidencia`, `#sin-fechas`, `#all` activan el filtro correspondiente a los 60 ms.

### 6.7 · Añadir manual y arranque

```js
$('#btnAdd').onclick=()=>{alert('En producto: fila nueva editable al foco, origen: manual. (Mock)')};
…
render();   // arranque
```

`.ms-add` (`+ añadir rol`, `+ añadir skill…`) **no tiene listener**: es solo la superficie visual del afford.

### 6.8 · APIs de CorpusMotion / CorpusAurora usadas

| Llamada | Dónde | Nota |
|---|---|---|
| `CorpusMotion.stagger(el,{step:40,cap:24,items})` | final de `render()` | step 40 (denso), no 80 |
| `CorpusMotion.boot()` | final de `render()` | dibuja `.c-divider` de cada grupo |
| `CorpusAurora.*` | **ninguna** | la pantalla es muro |
| `CorpusMotion.io` / `counter` / `shimmer` / `xray` / `words` / `chars` / `enter` | **ninguna** | — |

Efectos que llegan "gratis" del sistema y hay que preservar: el `focusin`/`focusout` global (pausa/reanuda aurora — no-op aquí), y el `pointermove` de `.c-spot` (no se usa en master).

---

## 7 · Copy (verbatim, ES)

### 7.1 · Chrome / navegación

| Cadena | Fuente |
|---|---|
| `Corpus — Master · el registro canónico` (`<title>`) | no está en copy.md |
| `Corpus` (logo) | no está en copy.md |
| `Panel` · `Master` · `Variantes` · `Fuentes` · `Ajustes` | no están en copy.md |
| `ES` / `EN` · `DG` | no están en copy.md |

### 7.2 · Barra `.ms-sub`

| Cadena | Fuente |
|---|---|
| `Buscar en tu registro… (título, viñeta, skill)` (placeholder) | no está en copy.md |
| `todo` · `sin cifra` · `⚠ sin evidencia` · `sin fechas` | no están en copy.md |
| `52 items · 4 fuentes · editado hace 2 días` (y `3 …` / `203 …` / `0 items`) | no está en copy.md |

### 7.3 · Encabezado del master

| Cadena | Fuente |
|---|---|
| `Tu archivo completo — aquí caben los 14 proyectos aunque cada variante muestre 3. Haz clic en cualquier texto y edítalo ahí mismo; cada item recuerda de dónde salió.` | **copy.md § Master · encabezado — VERBATIM** |
| `+ Añadir item manual` | no está en copy.md |

### 7.4 · Grupos

`Resumen` · `Experiencia` · `Skills — con su evidencia` · `Proyectos` · `Educación y certificaciones` · `plegar` / `desplegar` — **ninguno está en copy.md**.

Contadores: `1 item` · `4 roles · 16 viñetas` · `16 items` · `4 items — cada variante elige los suyos` · `3 items` (derivados; el sufijo "— cada variante elige los suyos" es copy no listado en copy.md).

### 7.5 · Procedencia (botones y fragmentos)

| Cadena | Fuente |
|---|---|
| `origen: texto pegado ▾` · `origen: github ▾` · `origen: dgatica.cl ▾` · `origen: CV_2023.pdf ▾` · `origen: cuestionario ▾` · `origen: escrito por ti ▾` | no están en copy.md (el patrón "origen: …" sí es doctrina de copy.md) |
| `origen: editado por ti · ahora ▾` | **copy.md § Master · item editado** (allí sin el `▾`) |
| `escrito por ti (onboarding) — el origen manual es el más verificable de todos.` | eco de copy.md (Onboarding/Staging: «el más verificable de todos») |
| `evidencia: repos y archivos de github.com/dgatica — hechos de API, sin IA.` | no está en copy.md |
| `fragmento de <fuente> citado en staging (12 jul).` | no está en copy.md |
| `«Los últimos tres años trabajé en Altiplano Pagos como backend developer…»` | no está en copy.md |
| `Fusionado por ti desde CV_2023.pdf y texto pegado (staging, 12 jul).` | no está en copy.md |
| `«Antes de Rayén trabajé por mi cuenta un año…» — el año de término no quedó registrado.` | no está en copy.md |
| `«Práctica profesional, Dirección de TI UNAB, soporte a sistemas académicos.»` | no está en copy.md |

### 7.6 · Empujones "sin cifra"

| Cadena | Fuente |
|---|---|
| `sin cifra` | no está en copy.md |
| `sin cifra — ¿cuántos equipos?` | patrón de copy.md § Master |
| `sin cifra — ¿cuántos deploys/semana?` | **copy.md § Master · empujón suave — VERBATIM** |
| `sin cifra — ¿qué volumen movían?` | patrón |
| `sin cifra — ¿cuántos peaks? ¿qué tráfico?` | patrón |

### 7.7 · Skills / verificación

| Cadena | Fuente |
|---|---|
| `verificado` · `parcial` · `sin evidencia` | **copy.md § Staging · niveles — VERBATIM** |
| `No aparece en ninguna viñeta, ni en tus repos, ni en tu portfolio.` (Kafka) | copy.md § Master lo da atribuido a **Kubernetes** (ver §7.10) |
| `¿Dónde lo usaste?` (Kafka) / `¿Dónde la usaste?` (AWS) | copy.md § Master (`¿Dónde lo usaste?`) |
| `responder — quedará como origen: tú` | no está en copy.md (doctrina sí) |
| `Un README la menciona; ninguna viñeta ni proyecto la usa.` (AWS) | no está en copy.md |
| `tu texto: «lo usamos pero no lo administraba yo» — nivel declarado: usuario` (Kubernetes) | **coincide con copy.md § Tailoring · reencuadre honesto** |
| `acumulada de fuentes antiguas — revisa si sigue siendo verdad` (estado 200) | no está en copy.md |
| `+ añadir rol` · `+ añadir skill (quedará como origen: tú)` | no están en copy.md |

### 7.8 · Estado vacío

| Cadena | Fuente |
|---|---|
| `Master vacío` (overline) | no está en copy.md |
| `Aún no hay registro.` | no está en copy.md |
| `Vuélcalo con IA en 5 minutos, o escríbelo de cero con la IA apagada.` | no está en copy.md |
| `Volcar lo que tengo` | no está en copy.md (cf. importar: «No escribas tu perfil. Vuélcalo.») |
| `Escribir de cero` | eco de copy.md § Importar («Prefiero escribirlo de cero →») |

### 7.9 · Panel demo (no es producto)

`demo` · `3 items` · `52 items` · `200 items` · `vacío` — convención de entrega.

### 7.10 · Alerta de copy

`alert('En producto: fila nueva editable al foco, origen: manual. (Mock)')` — texto de mock, **no va a producción**.

---

## 8 · Accesibilidad

**Lo que el HTML ya trae:**

- `aria-current="page"` en el enlace `Master` de `.hd-nav`.
- `.ms-f` es `role="group"` con `aria-label="Filtros"`; los 4 botones usan `aria-pressed` como grupo excluyente (radio de facto).
- `.demo` es `role="group"` con `aria-label="Estados de la pantalla (revisión de diseño)"`; sus botones usan `aria-pressed`.
- Todo texto editable es `contenteditable="true" spellcheck="false"` — enfocable con Tab por defecto.
- Foco de edición visible y con contraste: `.ms-b .tx:focus` sustituye el outline por colchón + hairline de pátina (`--border-patina`).
- El sistema aporta `:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}` y `prefers-reduced-motion` sobre todo el movimiento (el stagger degrada a "todo visible", nunca se pierde información).
- «Sin evidencia» **nunca es solo color**: `.c-ver--none` = glifo `⚠` + palabra `sin evidencia` + tinte y borde inset de `--danger` en `.ms-sk[data-ver="none"]` (decisión no negociable nº5 del handoff).
- El `<mark>` de los fragmentos aporta énfasis semántico, no solo color.

**Orden de foco (visual = DOM):** logo → nav (Panel, Master, Variantes, Fuentes) → Ajustes → buscador `#q` → 4 botones de filtro → `#btnAdd` → por cada grupo: `button.fold` → contenido del grupo (títulos `contenteditable`, viñetas `contenteditable`, botones `.ms-src`, botones de `.ask`, `.ms-add`) → panel `.demo`.

**Atajos de teclado:** **ninguno**. (El handoff solo declara `j/k/a/d/o` para staging.) El deep-link por `#hash` es lo más cercano a un atajo.

**Huecos reales que hay que arreglar al portar (no están resueltos en el HTML):**

1. `#q` **no tiene `<label>`** — solo `placeholder`. Añadir `aria-label="Buscar en tu registro"`.
2. `.ms-src` está a `opacity:0` y solo se revela con `:hover` del contenedor. **Un usuario de teclado que le da Tab no lo ve.** Falta un `.ms-b:focus-within .ms-src` / `.ms-src:focus{opacity:1}`.
3. Los botones `.ms-src` togglean `.ms-frag` sin `aria-expanded` ni `aria-controls`, y el `.ms-frag` no está asociado al botón.
4. `#msN` cambia de valor (52 → 3 → 203 → 0) y las listas se filtran en vivo, pero **no hay `aria-live`**. Los grupos ocultos por filtro se ocultan con `style.display='none'` (bien: salen del árbol de accesibilidad), pero el usuario de lector de pantalla no recibe el recuento.
5. `button.fold` no tiene `aria-expanded`.
6. **Hit targets:** `.ms-f button` ≈ 27px de alto (`padding:8px 10px` + `font 11px/1`) y `.demo button` ≈ 21px — por **debajo de los 44px** que el handoff exige en móvil («hit targets móviles ≥ 44 px»).
7. `contenteditable` sin `role="textbox"` ni `aria-label`: el lector de pantalla lo anuncia como región editable anónima.

---

## 9 · Datos del mock

Persona: **Diego Gatica** (ficticio; iniciales `DG` en `.hd-av`). Portfolio `dgatica.cl`, GitHub `github.com/dgatica`.

**Fuentes (`SRC`)** — 6 claves: `tx: texto pegado` · `gh: github` · `web: dgatica.cl` · `cv: CV_2023.pdf` · `q: cuestionario` · `man: escrito por ti`.

**Resumen (origen `man`):** «Backend developer con 6 años construyendo servicios de pago y e-commerce en Go y Node.js. A cargo del servicio de conciliación de Altiplano Pagos (~40.000 transacciones diarias).»

**Experiencia (`EXP`, 4 roles / 16 viñetas):**

| Rol | Organización | Fechas | src | Viñetas (num / nudge) |
|---|---|---|---|---|
| Backend Developer | Altiplano Pagos SpA · Santiago | mar 2022 – hoy | `tx` | 6 · conciliación en Go (~40.000 tx/día, num) · librería de idempotencia (gh, «¿cuántos equipos?») · pipelines CI/CD GitHub Actions (gh, «¿cuántos deploys/semana?») · OpenAPI 3.1 (gh, sin nudge) · mentoreo a 2 juniors (q, num) · on-call 1 semana al mes (q, num) |
| Backend Developer — equipo Checkout | Rayén Retail S.A. · Santiago | ene 2020 – feb 2022 | `cv` | 4 · APIs de checkout Node.js/PostgreSQL (cv, «¿qué volumen movían?») · cupones y descuentos (cv) · incidentes en cyber days (q, «¿cuántos peaks? ¿qué tráfico?») · reportes de ventas (cv) |
| Desarrollador freelance | Independiente · Santiago | **2019 – …** `warn: falta fecha de término` | `q` | 3 · sitios/APIs para 4 pymes (num) · reservas Django en producción desde 2020 (web, num) · hosting y dominios (cv) |
| Práctica profesional — Área TI | Universidad Andrés Bello · Santiago | 2018 – 2019 | `cv` | 3 · plataforma de matrícula · scripts de migración (Python) · documentación de procesos |

Fragmento de fusión (Rayén): «Fusionado por ti desde CV_2023.pdf y texto pegado (staging, 12 jul).»

**Skills (`SK`, 16):**

- **verificado (12):** Go (`412 KB · 3 repos · citada en 2 viñetas`, link `github.com/dgatica/pago-conciliador · +2 más`) · Python (`188 KB · 2 repos`) · PostgreSQL · Node.js (`CV_2023 · checkout de Rayén, 2 años`) · SQL (`consultas en 3 repos`) · TypeScript (`96 KB · 2 repos`) · Docker (`Dockerfile en 5 repos`) · GitHub Actions (`workflows en 4 repos`) · Django (`en producción desde 2020`) · gRPC · Redis · Inglés B2 (`declarado en tu texto — sin certificado adjunto`)
- **parcial (2):** Kubernetes («lo usamos pero no lo administraba yo» — nivel declarado: usuario) · Grafana (coincidencia difusa)
- **sin evidencia (2):** **Kafka** (`ask: ¿Dónde lo usaste?`) · **AWS** (`ask: ¿Dónde la usaste?`) — coincide con el dashboard: «2 skills siguen sin evidencia: Kafka, AWS»

**Proyectos (`PJ`, 4):** `idempotency-go` (github · 214 KB · 41 commits) · `reservas-club` (dgatica.cl · en producción) · `scraper-sii` (github · Python · 67 KB) · `dgatica.cl — portfolio con 6 casos documentados` (Next.js).

**Educación (`ED`, 3):** Ingeniería Civil en Computación e Informática — UNAB (2014 – 2019) · Diplomado en Ingeniería de Datos — PUC (2022) · Inglés B2 — autoevaluación (sin certificado).

**Fecha de referencia transversal:** el staging fue el **12 jul**.

---

## 10 · Números en la UI

Regla del producto (README §6 y handoff nº4): **ningún número sin fuente; el progreso jamás muestra %.** Auditoría completa de lo que ve el usuario:

### 10.1 · Números con fuente clara (OK)

| Número | Dónde | De dónde sale |
|---|---|---|
| `4 roles · 16 viñetas`, `16 items`, `4 items`, `3 items`, `1 item` | `.ms-gh .cnt` | **derivados en JS**: `exp.length`, `reduce(bullets)`, `sk.length`, `pj.length`, `ed.length` |
| `~40.000` transacciones, `2` juniors, `4` pymes, `6` años, `2020`, `2` desarrolladores | `.ms-b .tx` (envueltos en `.t-num`) | texto del propio usuario; cada viñeta lleva su `origen:` y su fragmento |
| `412 KB · 3 repos`, `188 KB · 2 repos`, `96 KB · 2 repos`, `Dockerfile en 5 repos`, `workflows en 4 repos`, `consultas en 3 repos`, `citada en 2 viñetas` | `.ms-sk .ev` | **hechos de API de GitHub** — el propio fragmento lo declara: «hechos de API, sin IA» |
| `214 KB · 41 commits`, `67 KB`, `6 casos documentados` | `.ms-row .m` | github / portfolio |
| Fechas: `mar 2022 – hoy`, `ene 2020 – feb 2022`, `2019 – …`, `2018 – 2019`, `2014 – 2019`, `2022`, `12 jul` | `.ms-eh .org`, `.ms-row .m`, `.ms-frag` | datos del CV / staging |
| `14 proyectos` / `3` en el encabezado | `p` de intro | copy.md verbatim |
| `2016+i%6`, `2016+floor(i/2)` (estado 200) | filas de archivo | generados por el mock |

### 10.2 · Números SOSPECHOSOS — sin fuente en el código

| Número | Dónde | Problema |
|---|---|---|
| **`52 items` / `3 items` / `203 items`** | `#msN` | Es un **literal de tabla**: `const total={'3':3,'52':52,'200':203}[SCALE]`. **No se deriva de los datos.** Contando de verdad el estado 52: 1 resumen + 4 roles + 16 viñetas + 16 skills + 4 proyectos + 3 educación = **44**, no 52. El estado 200 renderiza ~112 items, no 203. **En React el recuento DEBE derivarse de los datos** o el producto se contradice a sí mismo (es exactamente el pecado que denuncia: un número sin fuente). |
| **`4 fuentes`** | `#msN` | Hardcodeado en la plantilla de string. `SRC` tiene **6** claves (`texto pegado`, `github`, `dgatica.cl`, `CV_2023.pdf`, `cuestionario`, `escrito por ti`) y los datos usan las 6. Debe derivarse del set real de orígenes (y decidir si «escrito por ti» cuenta como fuente). |
| **`editado hace 2 días`** | `#msN` | Literal. En producto debe salir de un timestamp real. |
| **`14 proyectos`** (encabezado) vs **`4 items`** (grupo Proyectos) | intro / `.ms-gh .cnt` | El copy canónico dice 14; el mock trae 4. Uno de los dos miente en pantalla. Hay que alinear los datos de ejemplo con `datos-ejemplo.json`. |

### 10.3 · Lo que NO aparece (bien)

**Cero porcentajes. Cero score. Cero "confidence". Cero barra de progreso.** La única señal de calidad es cualitativa y con evidencia citada (`verificado / parcial / sin evidencia`) y el empujón `sin cifra`, que **pregunta** en vez de puntuar. Esto respeta la doctrina íntegra.
