# Fuentes · spec de pantalla

> Fuente única de verdad: `Corpus_ diseño completo/corpus-design/04-pantallas/fuentes.html` (948 líneas).
> Este documento describe **solo lo específico de la pantalla**. Los bloques
> `<style data-corpus-system="css">` y `<script data-corpus-system="js">` son copia del sistema canónico
> (`02-sistema/*`) y NO se transcriben aquí.
> Regla madre: los nombres de clase son el contrato diseño↔código. **No se renombran.**

---

## 1 · Ruta y propósito

**Ruta del producto:** `/app/fuentes` (archivo de referencia: `04-pantallas/fuentes.html`).

Inventario de las fuentes conectadas del usuario: cada una declara **qué aportó** al master y **qué hay
de nuevo desde la última lectura**, y ofrece releerla. Nada de lo que se lee entra al master
directamente: pasa por staging.

`<title>` del documento: `Corpus — Fuentes · conexiones vivas`.
`<html lang="es" data-theme="dark">`.

---

## 2 · Ventana o muro · Aurora

**Es un MURO. NO monta la aurora.**

- Búsqueda de `CorpusAurora.mount` en el archivo: **no existe ninguna llamada**. Las únicas apariciones
  de `CorpusAurora` están dentro del bloque `data-corpus-system` (la definición del módulo y los
  listeners `focusin`/`focusout` que lo pausan). El script de pantalla (líneas 888-946) **no lo monta**.
- No hay `<div class="c-aurora">` en el DOM ni se crea ninguno.
- El `<main>` es `class="fu-main c-wall"` → fondo `var(--bg)`, opaco.

Cumple la regla **"donde hay trabajo, el trabajo gana"**: los muros ni montan la aurora.
En React: **no renderizar `<CorpusAurora/>` en esta ruta**, ni con `state="calm"`.

**Uso de la gramática de capas en esta pantalla:**

| Clase | ¿Se usa aquí? |
|---|---|
| `.c-window` | No |
| `.c-wall` | **Sí** — una sola vez, en `<main class="fu-main c-wall">` |
| `.c-panel` | No |
| `.c-scrim` (y `--soft`/`--edge`) | No |
| `.c-aurora` / `.c-aurora-fallback` | No (solo definidos en el CSS del sistema) |

Los `focusin`/`focusout` del sistema seguirán llamando a `CorpusAurora.pause('focus')` si el objeto
existe globalmente; como la aurora no está montada, la llamada es inocua (`S.ok === false` → `return`).

---

## 3 · Esqueleto DOM

Marcado: **(S)** = clase del sistema (`c-*`, `t-*`, `hd-*`, `demo`) · **(P)** = clase propia de la pantalla (`fu-*`).

```
body
└── div.c-page (S)
    ├── header.c-header (S)
    │   └── div.c-container (S)
    │       ├── a.c-logo (S)  href="dashboard.html"  → "Corpus"
    │       ├── nav.hd-nav (S)
    │       │   ├── a  href="dashboard.html"                    → "Panel"
    │       │   ├── a  href="master.html"                       → "Master"
    │       │   ├── a  href="variantes.html"                    → "Variantes"
    │       │   └── a  href="fuentes.html" aria-current="page"  → "Fuentes"
    │       └── div.hd-right (S)
    │           ├── nav.hd-nav (S)  style="display:flex"   ← anula el display:none de @media 768
    │           │   └── a  href="ajustes.html" → "Ajustes"
    │           ├── div.hd-lang (S)
    │           │   ├── span[data-on] → "ES"
    │           │   └── span          → "EN"
    │           └── div.hd-av (S) → "DG"          ← iniciales de Diego Gatica
    │
    └── main.fu-main.c-wall (P)(S)  data-screen-label="fuentes"
        └── div.c-container (S)
            ├── div.fu-lead (P)
            │   ├── p  → texto de entrada (con <b style="color:var(--text);font-weight:500">qué aportó</b> inline)
            │   └── a.c-btn (S)  href="importar.html" → "+ Volcar más material"
            ├── hr.c-divider (S)                      ← único hairline; lo dibuja M.boot()
            │
            ├── article.c-card.fu-card (S)(P)  data-screen-label="fuentes-github"
            │   ├── div.fu-h (P)
            │   │   ├── span.nm  → "github.com/dgatica"
            │   │   ├── span.tag.star (P) → "sin IA — API con esquema"
            │   │   └── span.acts (P)
            │   │       ├── button.c-btn.c-btn--quiet (S)  #btnRepos → "elegir repos (5 de 12)"
            │   │       └── button.c-btn (S)               #btnRead
            │   │           └── span.c-pulse-dot (S) + &nbsp; + "Leer lo nuevo"
            │   ├── div.fu-facts (P)  #ghFacts          ← grid de 4 columnas
            │   │   └── div ×4 → div.v (cifra) + div.k (qué es la cifra)
            │   ├── div.fu-new (P)   #ghNew
            │   │   ├── b → "2 repos con actividad"
            │   │   ├── texto → " desde la última lectura: idempotency-go, scraper-sii"
            │   │   └── span.go (P)
            │   │       └── button.c-btn.c-btn--quiet (S)
            │   │           onclick="document.getElementById('btnRead').click()" → "leerlos →"
            │   ├── div.fu-repos (P)  #repos            ← display:none; .open lo muestra
            │   │   ├── div.fu-rh (P) → "<b>5 de 12 seleccionados.</b> Por defecto quedan fuera…"
            │   │   └── div  #repoRows                  ← inyectado por JS (ver §6)
            │   │       └── label.fu-repo[.off] (P) × 12
            │   │           ├── input[type=checkbox][data-r="i"]
            │   │           ├── span.nm   → nombre del repo
            │   │           ├── span.meta → metadatos
            │   │           └── span.why  → "fuera por defecto: <motivo>"   (solo si r.why)
            │   └── div.fu-note (P) → "GitHub es la única fuente donde la IA no puede alucinar…"
            │
            ├── article.c-card.fu-card (S)(P)  data-screen-label="fuentes-portfolio"
            │   ├── div.fu-h (P)
            │   │   ├── span.nm → "dgatica.cl"
            │   │   ├── span.tag → "portfolio"
            │   │   └── span.acts > button.c-btn.c-btn--quiet #btnWeb → "Releer"
            │   └── div.fu-facts (P)   ← 4 celdas; la 4ª es dinámica:
            │       └── div > div.v#webChg ("—") + div.k#webChgK ("sin cambios detectados")
            │
            ├── article.c-card.fu-card (S)(P)  data-screen-label="fuentes-archivos"
            │   ├── div.fu-h (P)
            │   │   ├── span.nm → "archivos"
            │   │   ├── span.tag → "estáticos — no cambian solos"
            │   │   └── span.acts > a.c-btn.c-btn--quiet href="importar.html" → "+ subir otro"
            │   └── div.fu-facts (P)  style="grid-template-columns:1fr 1fr"   ← override inline: 2 columnas
            │       └── div ×2 → div.v style="font-size:13px" (nombre de archivo) + div.k
            │
            ├── article.c-card.fu-card.fu-li (S)(P)  data-screen-label="fuentes-linkedin"
            │   ├── div.fu-h (P)
            │   │   ├── span.nm → "linkedin"
            │   │   └── span.tag → "no conectable — así funciona LinkedIn"
            │   │       (NO tiene span.acts: no hay acción posible)
            │   ├── p → explicación honesta
            │   └── div.vias (P)      ← grid de 3 columnas
            │       └── a href="importar.html" ×3 → <b>título</b> + descripción
            │
            └── div.fu-add (P)
                ├── input.c-input (S)  placeholder="https:// otra fuente — portfolio, blog, repositorio…"
                └── button.c-btn (S) → "Añadir fuente"

div.demo (S)  role="group"  aria-label="Estados de la pantalla (revisión de diseño)"
├── span → "demo"
├── button[data-st="normal"][aria-pressed="true"]    → "normal"
├── button[data-st="selector"][aria-pressed="false"] → "selector repos"
└── button[data-st="leyendo"][aria-pressed="false"]  → "leyendo"
```

**Atributos `data-*` presentes:** `data-theme` (html) · `data-screen-label` (main y cada `article`) ·
`data-on` (hd-lang) · `data-r` (checkbox de repo, índice) · `data-st` (botones del panel demo).
**No hay ningún `data-reveal` en esta pantalla** — el único movimiento de montaje es el `hr.c-divider`.

**Clases propias (P) completas:** `fu-main` `fu-lead` `fu-card` `fu-h` `fu-facts` `fu-new` `fu-note`
`fu-repos` `fu-rh` `fu-repo` `fu-li` `fu-add`, más las descendientes/modificadoras
`nm` `tag` `star` `acts` `v` `k` `go` `meta` `why` `off` `open` `vias`.

---

## 4 · CSS específico de pantalla

Copia **verbatim** del segundo `<style>` (líneas 487-527), el que NO lleva `data-corpus-system`.
**No define ningún `@keyframes` propio.**

```css
.fu-main{flex:1;padding:30px 0 120px}
.fu-lead{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.fu-lead p{color:var(--text-muted);font-size:var(--fs-ui);max-width:62ch}
.fu-card{margin-top:14px;overflow:hidden}
.fu-h{display:flex;align-items:baseline;gap:12px;padding:16px 22px 12px;flex-wrap:wrap}
.fu-h .nm{font:500 15px/1 var(--font-mono)}
.fu-h .tag{font:500 9px/1 var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--text-subtle);border:1px solid var(--border);border-radius:4px;padding:4px 7px}
.fu-h .tag.star{color:var(--accent-text);border-color:var(--border-patina)}
.fu-h .acts{margin-left:auto;display:flex;gap:8px}
.fu-facts{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border);border-top:1px solid var(--border)}
.fu-facts>div{background:var(--surface);padding:12px 22px 14px}
.fu-facts .v{font:500 17px/1.1 var(--font-mono)}
.fu-facts .k{margin-top:4px;font:400 var(--fs-micro)/1.4 var(--font-sans);color:var(--text-muted)}
.fu-new{display:flex;align-items:center;gap:10px;padding:12px 22px;border-top:1px solid var(--border);
  font:400 var(--fs-data)/1.5 var(--font-mono);color:var(--text-muted)}
.fu-new b{color:var(--accent-text);font-weight:500}
.fu-new .go{margin-left:auto}
.fu-note{padding:11px 22px 15px;border-top:1px dashed var(--border);font:400 var(--fs-micro)/1.7 var(--font-mono);color:var(--text-subtle)}
/* selector de repos */
.fu-repos{display:none;border-top:1px solid var(--border);background:var(--surface-sunken)}
.fu-repos.open{display:block}
.fu-rh{display:flex;align-items:baseline;gap:12px;padding:12px 22px;font:400 var(--fs-micro)/1.5 var(--font-mono);color:var(--text-muted)}
.fu-rh b{color:var(--text);font-weight:500}
.fu-repo{display:flex;align-items:baseline;gap:12px;padding:9px 22px;border-top:1px solid var(--border);font:400 var(--fs-data)/1.5 var(--font-mono)}
.fu-repo:hover{background:var(--surface)}
.fu-repo input{accent-color:var(--patina-500);transform:translateY(1px)}
.fu-repo .nm{color:var(--text);min-width:170px}
.fu-repo .meta{color:var(--text-subtle);flex:1}
.fu-repo .why{color:var(--text-subtle);font-size:10px;letter-spacing:.06em;text-transform:uppercase}
.fu-repo.off .nm,.fu-repo.off .meta{color:var(--text-subtle)}
/* linkedin */
.fu-li p{padding:2px 22px 14px;color:var(--text-muted);font-size:13px;line-height:1.65;max-width:70ch}
.fu-li .vias{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border-top:1px solid var(--border)}
.fu-li .vias>a{background:var(--surface);padding:13px 18px;font:400 var(--fs-data)/1.6 var(--font-sans);color:var(--text-muted);text-decoration:none}
.fu-li .vias>a:hover{background:var(--surface-elevated);color:var(--text)}
.fu-li .vias b{display:block;color:var(--text);font-weight:500;margin-bottom:3px}
.fu-add{margin-top:22px;display:flex;gap:10px;flex-wrap:wrap}
.fu-add input{max-width:420px}
@media (max-width:768px){.fu-facts{grid-template-columns:repeat(2,1fr)}.fu-li .vias{grid-template-columns:1fr}}
```

**Detalles que se pierden si se "interpreta" en vez de copiar:**

- `.fu-card{overflow:hidden}` es lo que recorta las esquinas de `.fu-facts` y `.fu-repos` contra el
  `border-radius` de `.c-card`. Sin él, las rejillas se salen de la tarjeta.
- Las rejillas (`.fu-facts`, `.fu-li .vias`) son **hairgrids**: `gap:1px` + `background:var(--border)`
  en el contenedor y `background:var(--surface)` en los hijos. La línea es el hueco, no un `border`.
- `.fu-h` usa `align-items:baseline` (no `center`): el nombre mono, el tag y los botones se alinean por
  la línea base.
- `.fu-note` lleva `border-top:1px dashed` (punteado, no sólido).
- La tarjeta de archivos sobreescribe la rejilla **inline**: `style="grid-template-columns:1fr 1fr"`.
- El `<nav class="hd-nav" style="display:flex">` del header lleva un `style` inline **a propósito**:
  neutraliza el `@media (max-width:768px){.hd-nav{display:none}}` para que "Ajustes" siga visible en móvil.

---

## 5 · Estados del panel demo

⚠️ **`06-handoff/handoff.md` NO tiene fila para `/app/fuentes`** (ver §"Contradicciones"). Los estados
son por tanto los que declara el propio HTML.

| Botón | `data-st` | Qué cambia en el DOM | Cómo se activa |
|---|---|---|---|
| **normal** | `normal` | Cierra el selector: `#repos.classList.remove('open')`. **No revierte** el contenido de `#ghNew` ni `#btnRead` si ya se leyó. | Estado inicial (`aria-pressed="true"`). Clic en el botón. |
| **selector repos** | `selector` | `#repos.classList.add('open')` → `.fu-repos.open{display:block}` revela la cabecera `.fu-rh` y las 12 filas `.fu-repo`. | Clic en el botón demo, o clic en `#btnRepos` ("elegir repos (n de 12)"), que hace `toggle`. |
| **leyendo** | `leyendo` | Cierra el selector y dispara `$('#btnRead').click()` → ejecuta la secuencia completa de lectura de la API (ver §6). | Clic en el botón demo, o clic directo en `#btnRead`, o en "leerlos →". |

Todos los botones del panel hacen `aria-pressed = String(x === b)` sobre los tres.

**Estados internos de la pantalla que NO están en el panel demo pero existen en el JS:**

- *GitHub leyendo* → `#btnRead[disabled]`, spinner `⟳` en el botón y en `#ghNew`.
- *GitHub leído* → `#ghNew` = "✓ leído — **2 items nuevos** esperan en staging…" + enlace "revisar →" a `staging.html`.
- *Portfolio releyendo* → `#btnWeb[disabled]`, `#webChg` = "⟳", `#webChgK` = "comparando contra la lectura anterior…".
- *Portfolio releído* → `#webChg` = "—", `#webChgK` = "sin cambios — misma versión que el 2 jul".
- *Repo on/off* → `label.fu-repo` gana/pierde `.off` y los contadores se recalculan.

---

## 6 · Comportamiento JS de la pantalla

Todo el `<script>` sin `data-corpus-system` (líneas 888-946). IIFE en `'use strict'`.

**Helpers y datos**

```js
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], M=window.CorpusMotion;
const REPOS=[
 {n:'pago-conciliador',m:'Go · 412 KB · hace 3 días',on:true},
 {n:'idempotency-go',m:'Go · 214 KB · 41 commits',on:true},
 {n:'conciliador-api',m:'Go · protos + OpenAPI',on:true},
 {n:'reservas-club',m:'Python/Django · en producción',on:true},
 {n:'scraper-sii',m:'Python · 67 KB',on:true},
 {n:'dotfiles',m:'config personal',on:false,why:'config'},
 {n:'algoritmos-unab',m:'ejercicios de curso 2016',on:false,why:'tutorial'},
 {n:'linux-notes',m:'apuntes',on:false,why:'apuntes'},
 {n:'awesome-go (fork)',m:'fork sin commits propios',on:false,why:'fork'},
 {n:'react-tutorial (fork)',m:'fork sin commits propios',on:false,why:'fork'},
 {n:'prueba-hackathon-2019',m:'2 commits',on:false,why:'experimento'},
 {n:'tarea-redes',m:'curso 2017',on:false,why:'tutorial'}];
```

**`renderRepos()`** — pinta `#repoRows` con un `<label class="fu-repo">` por repo. La clase `off` se
añade cuando `!r.on`. El `<span class="why">` solo se emite si `r.why` existe, con el prefijo literal
`"fuera por defecto: "`.

**`updateCount()`** — recalcula `n = REPOS.filter(r=>r.on).length` y reescribe DOS textos:
`#btnRepos.textContent = 'elegir repos ('+n+' de 12)'` y `$('.fu-rh b').textContent = n+' de 12 seleccionados.'`
El total **12 está hardcodeado** (no es `REPOS.length`) — en React usar la longitud real.

**Listeners**

| Evento | Selector | Efecto |
|---|---|---|
| `change` (delegado en `document`) | `[data-r]` | `REPOS[+c.dataset.r].on = c.checked` · `c.closest('.fu-repo').classList.toggle('off', !c.checked)` · `updateCount()` |
| `click` | `#btnRepos` | `$('#repos').classList.toggle('open')` |
| `click` | `#btnRead` | secuencia asíncrona de lectura (abajo) |
| `click` | `#btnWeb` | secuencia asíncrona de relectura del portfolio (abajo) |
| `click` inline | botón "leerlos →" | `document.getElementById('btnRead').click()` — atributo `onclick` en el HTML |
| `click` | `.demo button` | fija `aria-pressed`, abre/cierra `#repos`, y si `st==='leyendo'` dispara `#btnRead.click()` |

**Secuencia "Leer lo nuevo" (`#btnRead`)**

```js
$('#btnRead').onclick=async()=>{
  const btn=$('#btnRead');btn.disabled=true;btn.innerHTML='<span class="c-spin">⟳</span>&nbsp;leyendo la API…';
  const nw=$('#ghNew');nw.innerHTML='<span class="c-spin">⟳</span> idempotency-go: 3 commits nuevos · scraper-sii: README actualizado';
  await new Promise(r=>setTimeout(r,M.rm()?150:1900));
  nw.innerHTML='✓ leído — <b>2 items nuevos</b> esperan en staging (nada entra solo al master) <span class="go"><a class="c-btn c-btn--quiet" href="staging.html">revisar →</a></span>';
  btn.disabled=false;btn.textContent='Leer lo nuevo';
};
```

- Espera **1900 ms**, o **150 ms** con `prefers-reduced-motion` (`M.rm()`). El tiempo simulado también se
  acorta: el reduce-motion no solo quita animación, acorta la ceremonia.
- ⚠️ El `btn.textContent='Leer lo nuevo'` final **elimina el `<span class="c-pulse-dot">`** y el `&nbsp;`.
  Es coherente con el producto (ya no hay novedades que anunciar), pero debe ser una **decisión explícita**
  en React (`hasNews` gobierna el punto), no un efecto colateral del `textContent`.
- No hay barra de progreso ni %: el texto dice *qué* está pasando (`idempotency-go: 3 commits nuevos`).

**Secuencia "Releer" portfolio (`#btnWeb`)**

```js
$('#btnWeb').onclick=async()=>{
  const b=$('#btnWeb');b.disabled=true;b.innerHTML='<span class="c-spin">⟳</span> leyendo…';
  $('#webChg').textContent='⟳';$('#webChgK').textContent='comparando contra la lectura anterior…';
  await new Promise(r=>setTimeout(r,M.rm()?150:1700));
  $('#webChg').textContent='—';$('#webChgK').textContent='sin cambios — misma versión que el 2 jul';
  b.disabled=false;b.textContent='Releer';
};
```

Espera **1700 ms** (150 ms con reduce-motion). El resultado es **"sin cambios"**: el diseño enseña
deliberadamente el caso en que releer no aporta nada.

**Llamadas al sistema**

- `M.rm()` → `CorpusMotion.rm()` (¿`prefers-reduced-motion: reduce`?). Usado 2 veces, para acortar esperas.
- `M.boot()` → **última línea del script**. En esta pantalla solo dibuja el único `hr.c-divider`
  (`transform:scaleX(0)→scaleX(1)`, 1 s, `--ease-signature`). No hay `[data-reveal]` que revelar.
- **`CorpusAurora.*` — cero llamadas.** No se monta, no se pausa, no se activa.
- No se usan `CorpusMotion.stagger/reveal/counter/shimmer/xray/enter/io/words/chars` en esta pantalla.
- Clases de motion del sistema que sí aparecen en el markup/JS: `c-pulse-dot` (el punto que late en
  "Leer lo nuevo") y `c-spin` (el `⟳` de los spinners inyectados por JS).
- **No hay atajos de teclado** en esta pantalla (los `j/k/a/d/o` son de staging).
- No se usa `scrollIntoView` (regla del handoff: mantenerlo así).

---

## 7 · Copy (verbatim, ES)

**Origen:** `06-handoff/copy.md` **NO tiene sección para la pantalla Fuentes**. Salvo una coincidencia
parcial, todo el copy de esta pantalla vive **solo en el HTML** y este archivo es su única fuente.

### Header
| Cadena | Fuente |
|---|---|
| `Corpus` (logo) | sistema |
| `Panel` · `Master` · `Variantes` · `Fuentes` · `Ajustes` | sistema (nav) |
| `ES` / `EN` · `DG` | sistema |

### Entrada
| Cadena | Fuente |
|---|---|
| `Cada fuente dice **qué aportó** y qué hay de nuevo desde la última lectura. Nada se relee ni entra al master sin pasar por staging.` | **solo HTML** |
| `+ Volcar más material` | **solo HTML** (emparenta con el verbo "volcar" de copy.md §Importar) |

### GitHub
| Cadena | Fuente |
|---|---|
| `github.com/dgatica` | **solo HTML** |
| `sin IA — API con esquema` | **solo HTML** (eco de copy.md L71: «· API pública — se leerá sin IA») |
| `elegir repos (5 de 12)` | **solo HTML** (dinámica) |
| `Leer lo nuevo` | **solo HTML** |
| `repos públicos` | **solo HTML** (copy.md L96 dice «12 repos públicos» en el progreso de ingesta) |
| `bytes de Go — un hecho, no una estimación` | **solo HTML** |
| `items aportados al master` | **solo HTML** |
| `último push detectado` | **solo HTML** |
| `2 repos con actividad` + ` desde la última lectura: idempotency-go, scraper-sii` | **parcial**: copy.md L54-55 (sección Dashboard) dice «2 repos con actividad nueva — leer». **No es la misma cadena.** |
| `leerlos →` | **solo HTML** |
| `5 de 12 seleccionados.` | **solo HTML** (dinámica) |
| `Por defecto quedan fuera forks, tutoriales y configuración — **un CV no es un volcado de GitHub.** Revisa la decisión, no la delegues.` | **solo HTML** |
| `fuera por defecto: config` / `: tutorial` / `: apuntes` / `: fork` / `: experimento` | **solo HTML** |
| `GitHub es la única fuente donde la IA no puede alucinar: no hay IA. Lo que ves es la API.` | **solo HTML** (deriva de `01-producto/principios.md` §14) |
| `leyendo la API…` | **solo HTML** |
| `idempotency-go: 3 commits nuevos · scraper-sii: README actualizado` | **solo HTML** |
| `✓ leído — **2 items nuevos** esperan en staging (nada entra solo al master)` · `revisar →` | **solo HTML** |

### Portfolio
| Cadena | Fuente |
|---|---|
| `dgatica.cl` · `portfolio` · `Releer` | **solo HTML** |
| `proyectos documentados` · `items aportados` · `última lectura` | **solo HTML** |
| `sin cambios detectados` (estado inicial) | **solo HTML** |
| `leyendo…` · `comparando contra la lectura anterior…` | **solo HTML** |
| `sin cambios — misma versión que el 2 jul` | **solo HTML** |

### Archivos
| Cadena | Fuente |
|---|---|
| `archivos` · `estáticos — no cambian solos` · `+ subir otro` | **solo HTML** |
| `CV_2023.pdf` → `2 páginas · aportó 15 items · leído 12 jul` | **solo HTML** |
| `cuestionario-identidad.md` → `16 bloques · aportó 6 items · fuente de primera: lo escribiste tú` | **solo HTML** (eco del «origen: tú» de copy.md §Onboarding) |

### LinkedIn
| Cadena | Fuente |
|---|---|
| `linkedin` · `no conectable — así funciona LinkedIn` | **solo HTML** |
| `LinkedIn bloquea la lectura externa de perfiles: ningún servicio serio puede conectarse, y los que lo prometen, scrapean contra sus términos. Tres vías que sí funcionan:` | **variante propia**. copy.md L82-86 dice: «LinkedIn no permite que un servicio lea tu perfil desde fuera.» / «Está detrás de tu sesión y bloquea lectores automáticos — a nosotros y a cualquiera que diga lo contrario. Tres vías que sí funcionan:». **Solo coincide el cierre "Tres vías que sí funcionan:".** |
| `Pegar el texto` → `Ctrl+A y Ctrl+C sobre tu perfil → a la caja de volcado. La más completa.` | **variante propia** de copy.md L88 vía 01 |
| `El PDF oficial` → `En tu perfil: Más… → Guardar como PDF → súbelo.` | **variante propia** de copy.md L88 vía 02 |
| `Capturas` → `Se transcriben literal. Lo que no se lee, no se inventa.` | **variante propia** de copy.md L88 vía 03 |

### Pie
| Cadena | Fuente |
|---|---|
| `https:// otra fuente — portfolio, blog, repositorio…` (placeholder) | **solo HTML** |
| `Añadir fuente` | **solo HTML** |

### Panel demo (no es producto)
`demo` · `normal` · `selector repos` · `leyendo` · aria-label `Estados de la pantalla (revisión de diseño)`.

---

## 8 · Accesibilidad

**Lo que el HTML ya hace bien — replicarlo:**

- `aria-current="page"` en el enlace `Fuentes` del `hd-nav`.
- Panel demo: `role="group"` + `aria-label="Estados de la pantalla (revisión de diseño)"`; los tres
  botones mantienen `aria-pressed` mutuamente excluyente.
- Las filas de repo son `<label class="fu-repo">` con el `<input type="checkbox">` **dentro**: asociación
  implícita, toda la fila es zona de clic. `accent-color:var(--patina-500)` para el check nativo.
- Cada motivo de exclusión es **palabra**, no color: `fuera por defecto: fork`. La atenuación
  (`.fu-repo.off`) es refuerzo, nunca el único canal.
- El `⟳` del spinner es texto real dentro de `.c-spin` (rota por CSS); con `prefers-reduced-motion` el
  keyframe `cSpin` no aplica pero el glifo sigue ahí.
- Botones deshabilitados durante la lectura: `.c-btn[disabled]{opacity:.42;pointer-events:none}`.
- `:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}` del sistema.
- El `<b>` dentro de `.fu-new` va en `--accent-text` (pátina) sobre superficie oscura: contraste verificado.

**Orden de foco (secuencial, sin `tabindex` en ninguna parte):**

1. `a.c-logo` → 2-5. `hd-nav` (Panel, Master, Variantes, Fuentes) → 6. Ajustes
7. `a.c-btn` "+ Volcar más material"
8. `#btnRepos` → 9. `#btnRead`
10. "leerlos →" (`.fu-new .go button`)
11. *(si `#repos` está abierto)* los 12 checkboxes en orden de `REPOS`
12. `#btnWeb` "Releer"
13. "+ subir otro" (archivos)
14-16. las 3 `<a>` de `.fu-li .vias`
17. `input.c-input` de `.fu-add` → 18. "Añadir fuente"
19-21. los 3 botones del panel `demo` (están al final del `<body>`, fuera de `.c-page`)

**Atajos de teclado:** ninguno en esta pantalla.

**Hit targets:** `.c-btn` = 40 px de alto (`--control-h`). El handoff exige **≥ 44 px en móvil** →
en la implementación, subir a `--control-h-lg` (44 px) bajo el breakpoint de 768. Las filas
`.fu-repo` tienen `padding:9px 22px` sobre texto de 12 px ≈ 36 px de alto: **por debajo de 44 px en
móvil**; el `<label>` completo mitiga pero no basta.

**Huecos a corregir al implementar (el HTML de referencia no los resuelve):**

1. `#ghNew` y `#webChgK` cambian de texto de forma asíncrona **sin `aria-live`**. Un lector de pantalla
   no anuncia "✓ leído — 2 items nuevos esperan en staging". → añadir `role="status"` / `aria-live="polite"`
   en `#ghNew` y en la 4ª celda del portfolio.
2. `#btnRepos` abre/cierra `#repos` **sin `aria-expanded`** ni `aria-controls`. → añadirlos.
3. `#repos` se oculta con `display:none` vía clase `.open`, no con el atributo `hidden`. Funciona para AT,
   pero conviene sincronizar con `aria-expanded`.
4. El estado *leyendo* deshabilita el botón que tiene el foco → el foco se pierde al `<body>`.
   Preferible `aria-busy` + `aria-disabled` a `disabled` a secas.
5. El `⟳` y el `✓` son glifos sin `aria-hidden`: el lector los pronunciará. Marcarlos `aria-hidden="true"`.

---

## 9 · Datos del mock

Persona: **Diego Gatica** (ficticio). Iniciales `DG` en el avatar del header.

| Dato | Valor |
|---|---|
| GitHub | `github.com/dgatica` |
| Portfolio | `dgatica.cl` |
| Repos públicos | 12 (5 seleccionados por defecto) |
| Repos seleccionados | `pago-conciliador` · `idempotency-go` · `conciliador-api` · `reservas-club` · `scraper-sii` |
| Repos excluidos (y motivo) | `dotfiles` (config) · `algoritmos-unab` (tutorial) · `linux-notes` (apuntes) · `awesome-go (fork)` (fork) · `react-tutorial (fork)` (fork) · `prueba-hackathon-2019` (experimento) · `tarea-redes` (tutorial) |
| Repos con actividad nueva | `idempotency-go` (3 commits nuevos) · `scraper-sii` (README actualizado) |
| Bytes de Go | **412.803** (coherente con `principios.md` §14, `master.html`, `staging.html`, `tailor.html`) |
| Archivos subidos | `CV_2023.pdf` (2 páginas, 15 items, leído 12 jul) · `cuestionario-identidad.md` (16 bloques, 6 items) |
| Aportes al master | GitHub 14 · portfolio 12 · CV_2023.pdf 15 · cuestionario 6 |
| Última lectura del portfolio | hace 12 días · versión del **2 jul** |
| Último push de GitHub | hace 3 días |
| Items nuevos tras leer | 2 (esperan en staging) |

Alineación con otras pantallas: `pago-conciliador` (Go · 412 KB) es el repo protagonista en
`master.html`, `staging.html`, `procedencia.html` y `tailor.html`. `CV_2023.pdf` (412 KB) aparece en
`importar.html`.

---

## 10 · Números en la UI

Todo número visible, con su origen declarado. **No hay ni un score, ni un %, ni un "confidence".**
La pantalla cumple la regla 4 del handoff y la 6 del README.

| Número | Dónde | Fuente declarada en la propia UI |
|---|---|---|
| `12` | `repos públicos` | API pública de GitHub |
| `412.803` | `bytes de Go` | La etiqueta lo dice: **"un hecho, no una estimación"** — API de GitHub (`languages`) |
| `14` | `items aportados al master` | Recuento del master (procedencia = GitHub) |
| `hace 3 días` | `último push detectado` | API de GitHub (`pushed_at`) |
| `5 de 12` | botón `#btnRepos` y `.fu-rh b` | Selección del usuario · **el `12` está hardcodeado en el JS** |
| `2` | `2 repos con actividad` | Diff contra la última lectura |
| `3 commits nuevos` | línea de lectura de `idempotency-go` | API de GitHub |
| `2 items nuevos` | resultado de la lectura | Extracción → staging |
| `6` | `proyectos documentados` (portfolio) | Lectura del portfolio |
| `12` | `items aportados` (portfolio) | Recuento del master |
| `hace 12 días` | `última lectura` (portfolio) | Timestamp de la última lectura |
| `2 jul` | `misma versión que el 2 jul` | Timestamp de la lectura anterior |
| `—` | 4ª celda del portfolio | Ausencia de cambio: guion, **no un 0 % ni un "100 % igual"** |
| `2 páginas · 15 items · 12 jul` | `CV_2023.pdf` | Parser del PDF |
| `16 bloques · 6 items` | `cuestionario-identidad.md` | Parser del `.md` |
| `412 KB`, `214 KB`, `67 KB`, `41 commits`, `2 commits`, `2016`, `2017`, `2019` | filas de `.fu-repo` | API de GitHub |

**Números sospechosos / a vigilar:**

- **Ninguno prohibido.** No hay porcentajes, scores, ni umbrales inventados. El único "medidor" posible
  (¿cambió el portfolio?) se resuelve con `—` + una frase, exactamente como manda el producto.
- ⚠️ El total **`12`** de "n de 12" está **escrito a mano** en dos plantillas de string
  (`'elegir repos ('+n+' de 12)'` y `n+' de 12 seleccionados.'`). En React debe salir de
  `repos.length`; si no, un usuario con 30 repos verá "5 de 12" y el producto habrá mentido con un
  número. Es el único número de la pantalla sin fuente real.
- ⚠️ La suma de "items aportados" (14 + 12 + 15 + 6 = **47**) no cuadra con los **61 items** del master
  que declara `handoff.md` §Datos del mock. Puede ser legítimo (items de origen "tú", escritos a mano),
  pero si la implementación deriva estos contadores de datos reales hay que confirmar que la diferencia
  tenga explicación y no sea un descuadre visible entre pantallas.
- ⚠️ `412.803 bytes de Go` (todo Go) convive con `pago-conciliador · Go · 412 KB` (un solo repo) en la
  misma tarjeta. Es la misma cifra en dos unidades para dos ámbitos distintos: coincidencia confusa. Se
  copia tal cual, pero conviene comprobarlo con datos reales (`master.html` también dice «412 KB · 3 repos»).
