# tailor — spec de pantalla

> Fuente literal: `Corpus_ diseño completo/corpus-design/04-pantallas/tailor.html` (58.553 bytes, 1034 líneas).
> Bloques `data-corpus-system="css"` (líneas 10–486) y `data-corpus-system="js"` (líneas 638–909) son
> copia del sistema canónico (`02-sistema/*`): **no se transcriben aquí**. Todo lo de abajo es lo
> ESPECÍFICO de la pantalla. Los nombres de clase son contrato: no se traducen, no se renombran.

---

## 1 · Ruta y propósito

**Ruta del producto:** `/app/variantes/[id]/tailor`
**`<title>`:** `Corpus — Adaptar a un aviso · Backend — Fintech`
**`<html lang="es" data-theme="dark">`**

Pegas un aviso de trabajo tal cual y Corpus lo contrasta **contra el master (52 items), no contra la
variante**, y devuelve **hechos en tres grupos** (ya está / lo tienes pero no está aquí / no está en
ninguna parte) más reformulaciones una a una con su procedencia — **nunca un score ni un porcentaje
de match**. Es el alma ética del producto: el grupo 3 no tiene botón de añadir.

Entra desde el editor de variante (`← Backend — Fintech` → `editor-variante.html`).

---

## 2 · Ventana o muro · Aurora

**NO monta la aurora.** No hay ninguna llamada a `CorpusAurora.mount` fuera del bloque
`data-corpus-system` (las únicas apariciones de `CorpusAurora` están en las líneas 643/648/891/894,
todas dentro del sistema: la definición del módulo y el auto-pause por `focusin`). **Tampoco existe
un `<div class="c-aurora">` en el `<body>`.** El módulo queda cargado pero nunca montado.

Esto es correcto y deliberado: **«donde hay trabajo, el trabajo gana» — los muros ni montan la
aurora**. Al portar a React: no instanciar el canvas en esta ruta.

| Sección | Clase de gramática |
|---|---|
| `<main class="tl-main c-wall">` | **`.c-wall`** (S) — muro opaco. Es la única declaración de gramática de la pantalla. |
| `.c-window` | **no se usa** |
| `.c-panel` | **no se usa** |
| `.c-scrim` | **no se usa** |
| `.c-aurora` | **no existe en el DOM** |

Superficies reales: `.c-card` (S) para hint, título y cada propuesta; `.tl-rows` (P) con borde propio
para las filas de grupo. El header (`.c-header`, S) y la barra `.tl-bar` (P) llevan su propio
`backdrop-filter` — no dependen de la aurora.

---

## 3 · Esqueleto DOM

Leyenda: **(S)** clase del sistema (`c-*`, `t-*`, `hd-*`) · **(P)** clase propia de la pantalla (`tl-*`).

```
body
└── div.c-page (S)
    ├── header.c-header (S)
    │   └── div.c-container (S)
    │       ├── a.c-logo (S)  href="dashboard.html"  → "Corpus"
    │       ├── nav.hd-nav (S)
    │       │   ├── a href="dashboard.html"   → "Panel"
    │       │   ├── a href="master.html"      → "Master"
    │       │   ├── a href="variantes.html" [aria-current="page"] → "Variantes"
    │       │   └── a href="fuentes.html"     → "Fuentes"
    │       └── div.hd-right (S)
    │           ├── nav.hd-nav (S) [style="display:flex"]
    │           │   └── a href="ajustes.html" → "Ajustes"
    │           ├── div.hd-lang (S) → span[data-on]"ES" · span"EN"
    │           └── div.hd-av (S) → "DG"
    │
    ├── div.tl-bar (P)  [data-screen-label="tailor-toolbar"]     ← sticky bajo el header, 52px
    │   └── div.c-container (S)
    │       ├── a href="editor-variante.html" [style inline] → "← Backend — Fintech"
    │       ├── span [style inline: separador 1×16px var(--border-strong)]
    │       ├── span [style inline: mono micro, letter-spacing .14em] → "ADAPTAR A UN AVISO"
    │       └── span [style inline: margin-left:auto, mono micro, text-subtle]
    │                → "sin score — tres respuestas honestas"
    │
    └── main.tl-main.c-wall (P+S)  [data-screen-label="tailor"]
        └── div.c-container.tl-grid (S+P)                        ← grid 380px | 1fr, gap 26px
            │
            ├── aside.tl-left (P)  [data-screen-label="tailor-aviso"]   ← sticky
            │   ├── label.c-label (S) [for="jd"] → "El aviso, tal cual"
            │   ├── textarea.c-textarea (S) #jd [spellcheck="false"]
            │   │        [placeholder="Pega aquí la descripción del cargo — completa, sin limpiar."]
            │   ├── div.foot (P)
            │   │   ├── span.meta (P) #jdMeta → "0 palabras"
            │   │   └── span [style="display:flex;gap:8px"]
            │   │       ├── button.c-btn.c-btn--quiet (S) #btnSample → "usar aviso de ejemplo"
            │   │       └── button.c-btn.c-btn--patina (S) #btnGo [disabled]
            │   │                → "Comparar con tu master"
            │   └── div.tl-work (P) #work                        ← log de análisis; .show lo muestra
            │
            └── section.tl-res (P) #res
                ├── div.tl-hint.c-card (P+S) #hint               ← estado VACÍO
                │   ├── span.t-overline (S) → "Todavía nada que comparar"
                │   └── (texto) "Pega el aviso y Corpus lo contrasta contra tus <b>52 items</b> …"
                │
                └── div #out [hidden]                            ← estado ANALIZADO
                    │
                    ├── div.c-card.tl-title (S+P) [data-screen-label="tailor-titulo"]
                    │   ├── span.pair (P)
                    │   │     "El aviso pide " b"«Backend Engineer»"
                    │   │     span.arrow (P) "·"
                    │   │     "tu variante dice " b#curTitle "«Backend Developer»"
                    │   └── span.act (P)
                    │       ├── span.why (P) → "título alineado = 10,6× entrevistas [Jobscan]"
                    │       └── button.c-btn (S) #btnTitle → "Usar el del aviso"
                    │
                    ├── div.tl-g.tl-g--have (P)                  ← GRUPO 1
                    │   ├── div.tl-gh (P)
                    │   │   ├── span.g-mark (P) → "✓"
                    │   │   ├── span.t-overline (S) → "Ya está en esta variante"
                    │   │   └── span.n (P) #nHave → "6"
                    │   ├── hr.c-divider (S)
                    │   └── div.tl-rows (P) #gHave               ← inyectado por rowsHave()
                    │       └── div.tl-row (P) ×6
                    │           ├── span.k (P)   ← nombre de la exigencia
                    │           └── span.d (P)   ← la evidencia (mono)
                    │
                    ├── div.tl-g.tl-g--add (P)                   ← GRUPO 2
                    │   ├── div.tl-gh (P)
                    │   │   ├── span.g-mark (P) → "＋"   (U+FF0B fullwidth plus)
                    │   │   ├── span.t-overline (S) → "Lo tienes en el master, no en esta variante"
                    │   │   ├── span.n (P) → "4"
                    │   │   └── span.why (P) → "un clic y entra — es tuyo, es honesto"
                    │   ├── hr.c-divider (S)
                    │   └── div.tl-rows (P) #gAdd                ← inyectado por rowsAdd()
                    │       └── div.tl-row (P) ×4
                    │           ├── span.k (P)
                    │           ├── span.d (P)
                    │           └── span.act (P) > button [data-add="i"] → "añadir a la variante"
                    │
                    ├── div.tl-g.tl-g--gap (P)                   ← GRUPO 3 (el alma ética)
                    │   ├── div.tl-gh (P)
                    │   │   ├── span.g-mark (P) → "○"
                    │   │   ├── span.t-overline (S) → "No está en ninguna parte"
                    │   │   ├── span.n (P) → "3"
                    │   │   └── span.why (P) → "y no vamos a inventarlo"
                    │   ├── hr.c-divider (S)
                    │   └── div.tl-rows (P) #gGap                ← inyectado por rowsGap()
                    │       ├── div.tl-row (P) ×3
                    │       │   ├── span.k (P)
                    │       │   ├── span.d (P) [style="font-family:var(--font-sans)"]  ← ¡sans, no mono!
                    │       │   └── span.act (P) > button [data-re="i"]   ← SOLO en la fila con re:true
                    │       │            → "reencuadrar con lo que sí tienes"
                    │       └── div.tl-gap-note (P)              ← el cierre; SIN botón de añadir
                    │
                    └── div.tl-ref (P) [data-screen-label="tailor-reformulaciones"]
                        ├── div.tl-gh (P)
                        │   ├── span.t-overline (S) → "Reformulaciones propuestas"
                        │   └── span.n (P) → "3 · una a una, nunca en bloque"
                        ├── hr.c-divider (S)
                        └── div #props                           ← inyectado por props()
                            └── div.c-card.tl-prop (S+P) [data-p="i"] ×3
                                ├── div.tl-phead (P)
                                │   ├── span.t-overline (S) → "Propuesta N"
                                │   ├── span.trace (P)  ← la procedencia de la propuesta
                                │   └── span.c-ver.c-ver--ok (S) → "verificado"
                                │       ó span.c-ver.c-ver--none (S) → "no verificado"
                                ├── div.tl-cols (P)
                                │   ├── div > span.lbl (P) "Original (master)"
                                │   │       + span.orig (P)
                                │   └── div > span.lbl (P) "Propuesto para esta variante"
                                │           + span.prop (P)   ← lleva <b> resaltados en pátina
                                └── div.tl-pfoot (P)
                                    ├── span.warn (P)  ← solo si p.warn (⚠ …)
                                    │   ó span [style inline] "si aceptas, queda como override — …"
                                    └── span.sp (P)
                                        ├── button.acc [data-acc] "aceptar"      (si ver==='ok')
                                        │   ó button [data-edit] "editarlo tú"   (si ver==='none')
                                        └── button.rej [data-rej] "rechazar"

div.demo [role="group"] [aria-label="Estados de la pantalla (revisión de diseño)"]   ← NO es producto
├── span → "demo"
├── button [data-st="vacio"]     [aria-pressed="true"]  → "vacío"
└── button [data-st="analizado"] [aria-pressed="false"] → "analizado"
```

Clases del sistema usadas: `c-page` · `c-header` · `c-container` · `c-logo` · `hd-nav` · `hd-right` ·
`hd-lang` · `hd-av` · `c-wall` · `c-card` · `c-label` · `c-textarea` · `c-btn` · `c-btn--quiet` ·
`c-btn--patina` · `c-divider` · `t-overline` · `c-ver` / `c-ver--ok` / `c-ver--none` · `demo`.

---

## 4 · CSS específico de pantalla

Bloque `<style>` sin atributo, líneas 487–552. **Verbatim**:

```css
/* ── tailor.html — evidencia, no score. MURO. ── */
.tl-bar{position:sticky;top:var(--header-h);z-index:9;height:52px;background:color-mix(in srgb,var(--bg) 88%,transparent);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.tl-bar .c-container{height:100%;display:flex;align-items:center;gap:14px}
.tl-main{flex:1;padding:26px 0 120px}
.tl-grid{display:grid;grid-template-columns:380px 1fr;gap:26px;align-items:start}
.tl-left{position:sticky;top:calc(var(--header-h) + 52px + 20px)}
.tl-left .c-textarea{min-height:300px;font-size:13px;line-height:1.65}
.tl-left .foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
.tl-left .meta{font:400 var(--fs-micro)/1.5 var(--font-mono);color:var(--text-subtle)}
.tl-work{margin-top:14px;font:400 var(--fs-data)/1.8 var(--font-mono);color:var(--text-muted);display:none}
.tl-work.show{display:block}
/* resultado */
.tl-res{min-width:0}
.tl-hint{padding:60px 30px;text-align:center;color:var(--text-muted);font-size:13.5px;line-height:1.8}
.tl-hint .t-overline{display:block;margin-bottom:12px}
/* título */
.tl-title{padding:16px 20px;display:flex;gap:14px;align-items:baseline;flex-wrap:wrap}
.tl-title .pair{font:400 13px/1.6 var(--font-sans);color:var(--text-muted)}
.tl-title .pair b{color:var(--text);font-weight:500}
.tl-title .pair .arrow{color:var(--text-subtle);padding:0 4px}
.tl-title .act{margin-left:auto;display:flex;align-items:center;gap:10px}
.tl-title .why{font:400 var(--fs-micro)/1.5 var(--font-mono);color:var(--text-subtle)}
/* grupos */
.tl-g{margin-top:26px}
.tl-gh{display:flex;align-items:baseline;gap:12px;padding-bottom:8px}
.tl-gh .g-mark{font:500 12px/1 var(--font-mono)}
.tl-gh .n{font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)}
.tl-gh .why{margin-left:auto;font:400 var(--fs-micro)/1.4 var(--font-mono);color:var(--text-subtle)}
.tl-rows{border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden}
.tl-row{display:flex;gap:14px;align-items:baseline;padding:11px 18px;background:var(--surface);font-size:13px;line-height:1.55}
.tl-row+.tl-row{border-top:1px solid var(--border)}
.tl-row .k{font:500 13px/1.4 var(--font-sans);min-width:150px}
.tl-row .d{flex:1;color:var(--text-muted);font:400 var(--fs-data)/1.6 var(--font-mono)}
.tl-row .act{flex:none}
.tl-row .act button{font:500 var(--fs-micro)/1 var(--font-mono);padding:8px 11px;border:1px solid var(--border-strong);border-radius:6px;color:var(--text-muted)}
.tl-row .act button:hover{color:var(--accent-text);border-color:var(--border-patina)}
.tl-row .act .done{color:var(--ver-ok);border-color:transparent;font:500 var(--fs-micro)/1 var(--font-mono)}
.tl-g--have .g-mark{color:var(--ver-ok)}
.tl-g--add .g-mark{color:var(--accent-text)}
.tl-g--gap .g-mark{color:var(--text-subtle)}
.tl-gap-note{padding:12px 18px;border-top:1px dashed var(--border);background:var(--surface-sunken);
  font:400 var(--fs-data)/1.7 var(--font-sans);color:var(--text-muted)}
/* reformulaciones: original ⇄ propuesto, una a una */
.tl-ref{margin-top:34px}
.tl-prop{margin-top:12px;overflow:hidden}
.tl-phead{display:flex;gap:10px;align-items:baseline;padding:12px 18px;border-bottom:1px solid var(--border)}
.tl-phead .t-overline{font-size:10px}
.tl-phead .trace{font:400 var(--fs-micro)/1.5 var(--font-mono);color:var(--text-subtle)}
.tl-phead .c-ver{margin-left:auto}
.tl-cols{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border)}
.tl-cols>div{background:var(--surface);padding:14px 18px;font-size:13px;line-height:1.6}
.tl-cols .lbl{display:block;font:500 9px/1 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--text-subtle);margin-bottom:8px}
.tl-cols .orig{color:var(--text-muted)}
.tl-cols .prop b{color:var(--text);font-weight:500;background:rgba(95,198,169,.13);border-radius:2px;padding:0 2px}
.tl-pfoot{display:flex;gap:8px;align-items:center;padding:11px 18px;border-top:1px solid var(--border)}
.tl-pfoot .warn{font:400 var(--fs-micro)/1.5 var(--font-mono);color:var(--danger)}
.tl-pfoot .sp{margin-left:auto;display:flex;gap:8px}
.tl-pfoot button{font:500 var(--fs-micro)/1 var(--font-mono);padding:8px 12px;border:1px solid var(--border-strong);border-radius:6px;color:var(--text-muted)}
.tl-pfoot button:hover{color:var(--text);border-color:var(--border-patina)}
.tl-pfoot .acc:hover{color:var(--ver-ok)}
.tl-pfoot .rej:hover{color:var(--danger)}
@media (max-width:1024px){.tl-grid{grid-template-columns:1fr}.tl-left{position:static}}
@media (max-width:768px){.tl-cols{grid-template-columns:1fr}.tl-row{flex-wrap:wrap}.tl-row .k{min-width:0}}
```

**`@keyframes` propios: NINGUNO.** Todo el movimiento sale de `motion.css` del sistema
(`c-divider`, `[data-reveal]`, `.c-enter`/`cEnter`).

Estilos inline en el HTML que también hay que reproducir (no están en ninguna clase):
- separador de la `.tl-bar`: `width:1px;height:16px;background:var(--border-strong)`
- enlace de vuelta: `font:500 var(--fs-ui)/1 var(--font-sans);color:var(--text-muted)`
- rótulo `ADAPTAR A UN AVISO`: `font:500 var(--fs-micro)/1 var(--font-mono);letter-spacing:.14em;color:var(--text-muted)`
- eslogan derecha: `margin-left:auto;font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)`
- grupo de botones del aviso: `display:flex;gap:8px`
- `.tl-row .d` del **grupo 3**: `font-family:var(--font-sans)` (rompe el mono a propósito: ahí hay prosa, no evidencia)
- textos de confirmación inyectados por JS (ver §6).

---

## 5 · Estados del panel demo

Handoff declara para esta ruta: **`vacío · analizado`**. El panel es una convención de entrega, no
producto — no lo portes a React.

### `vacio` (por defecto, `aria-pressed="true"`)
- `textarea#jd.value = ''` → `input` → `#jdMeta` = `"0 palabras"`, `#btnGo` **disabled** (`w < 30`).
- `#out` con atributo `hidden`.
- `#hint` visible (`style.display = ''`).
- `.tl-work` sin `.show` (`display:none`).

### `analizado`
- `textarea#jd.value = JD` (el aviso de ejemplo) → `input` → `#jdMeta` = `"92 palabras"`, `#btnGo` habilitado.
- se llama a `analyze()` (misma función que el botón «Comparar con tu master»):
  1. `#hint.style.display='none'`, `#out.hidden=true`.
  2. `#work` recibe `.show` y se vacía; se añaden 3 líneas de log, una a una:
     cada línea aparece con `⟳ ` + texto → `M.reveal(d)` → espera `850ms` (o `80ms` con
     reduce-motion) → la misma línea pasa a `✓ ` + texto.
  3. `#work` pierde `.show` (el log **desaparece**, no queda en pantalla).
  4. se renderizan `#gHave`, `#gAdd`, `#gGap`, `#props`.
  5. `#out.hidden=false` + `M.enter($('#out'))` (C2, `.c-enter`, 360ms).
  6. `M.stagger($('#out'),{step:60,cap:24,items: .tl-row, .tl-title, .tl-prop})`.
  7. `M.boot($('#out'))` → dibuja los `hr.c-divider` de los tres grupos y las reformulaciones.

Micro-estados **dentro** de `analizado` (no están en el panel demo pero sí en el DOM — ver §6):
título alineado · fila del grupo 2 añadida · reencuadre aceptado · propuesta aceptada / rechazada /
editada-y-guardada.

---

## 6 · Comportamiento JS de la pantalla

Todo dentro de una IIFE (`<script>` líneas 910–1033). Helpers: `$`, `$$`, `M = window.CorpusMotion`.

### Datos hardcodeados (constantes del módulo)
`JD` (template string, el aviso de ejemplo) · `HAVE` (6) · `ADD` (4) · `GAP` (3, uno con `re:true`) ·
`PROPS` (3, con `{ver, trace, o, p, warn}`). Contenido literal en §9.

### Contador de palabras del aviso
```js
const ta=$('#jd');
ta.addEventListener('input',()=>{
  const w=(ta.value.trim().match(/\S+/g)||[]).length;
  $('#jdMeta').textContent=w.toLocaleString('es-CL')+' palabras';
  $('#btnGo').disabled=w<30;
});
```
**Umbral duro: menos de 30 palabras → `#btnGo` deshabilitado.** Formato `es-CL` (miles con punto).

### Aviso de ejemplo
`$('#btnSample').onclick = () => { ta.value = JD; ta.dispatchEvent(new Event('input')) }`

### Renderizadores
- `rowsHave()` → `.tl-row` con `.k` + `.d`. **Sin acción**: ya está, no hay nada que hacer.
- `rowsAdd()` → `.tl-row` con `.k` + `.d` + `<span class="act"><button data-add="i">añadir a la variante</button></span>`.
- `rowsGap()` → `.tl-row` con `.k` + `.d` (forzada a `var(--font-sans)`), y **solo si `x.re`** un
  `<button data-re="i">reencuadrar con lo que sí tienes</button>`. Cierra **siempre** con
  `<div class="tl-gap-note">` (el texto del "no hay botón de añadir"). **Ningún `data-add` aquí. Punto.**
- `props()` → una `.c-card.tl-prop[data-p=i]` por propuesta:
  - `.tl-phead`: `Propuesta N` + `.trace` + `.c-ver--ok "verificado"` **ó** `.c-ver--none "no verificado"`.
  - `.tl-cols`: columna izquierda `Original (master)` / `.orig`, derecha `Propuesto para esta variante` / `.prop` (con `<b>` resaltados).
  - `.tl-pfoot`: si `p.warn` → `<span class="warn">⚠ …</span>`, si no → nota inline «si aceptas, queda como override…».
    Botonera `.sp`: `ver==='ok'` → `.acc[data-acc] "aceptar"`; `ver==='none'` → `[data-edit] "editarlo tú"`.
    Siempre `.rej[data-rej] "rechazar"`.

### `analyze()` (async)
```js
async function analyze(){
  $('#hint').style.display='none';$('#out').hidden=true;
  const w=$('#work');w.classList.add('show');w.innerHTML='';
  const steps=['Leyendo el aviso — 148 palabras, 14 exigencias detectadas','Comparando contra 52 items del master…','Buscando las exigencias en tus viñetas, skills y repos…'];
  for(const s of steps){
    const d=document.createElement('div');d.textContent='⟳ '+s;w.appendChild(d);M.reveal(d);
    await new Promise(r=>setTimeout(r,M.rm()?80:850));
    d.textContent='✓ '+s;
  }
  w.classList.remove('show');
  rowsHave();rowsAdd();rowsGap();props();
  $('#out').hidden=false;M.enter($('#out'));
  M.stagger($('#out'),{step:60,cap:24,items:$('#out').querySelectorAll('.tl-row,.tl-title,.tl-prop')});
  M.boot($('#out'));
}
$('#btnGo').onclick=analyze;
```
Nota: el `⟳` NO lleva `.c-spin` aquí (es solo el glifo, sin la animación de giro).

### Título objetivo
```js
$('#btnTitle').onclick=()=>{
  $('#curTitle').textContent='«Backend Engineer (Ingeniero de Software III)»';
  $('#btnTitle').outerHTML='<span class="done" style="font:500 var(--fs-micro)/1 var(--font-mono);color:var(--ver-ok)">✓ título alineado — honesto: tu cargo real queda al lado</span>';
};
```

### Delegación de eventos en `document` (un solo listener)
| Selector | Efecto |
|---|---|
| `[data-add]` | el botón se sustituye por `<span class="done">✓ en la variante</span>` |
| `[data-re]` | el botón se sustituye por `<span class="done">✓ viñeta honesta añadida: «Operé servicios sobre Kubernetes como usuario (deploys, debugging) — sin administrar el cluster»</span>` |
| `[data-acc]` | `.tl-pfoot` de esa `.tl-prop` → `<span …color:var(--ver-ok)>✓ aplicada como override — el original sigue en el master, revertible en el editor</span>` |
| `[data-rej]` | la `.tl-prop` baja a `opacity:.45` y su `.tl-pfoot` → `<span …color:var(--text-subtle)>rechazada — no se guarda nada</span>` |
| `[data-edit]` | `.prop` pasa a `contentEditable='true'` + `.focus()`; el pie se sustituye por la nota «edítala — al guardar queda como origen: tú» + `<button class="acc" data-saveedit>guardar como mía</button>` |
| `[data-saveedit]` | `.prop` → `contentEditable='false'`; el `.c-ver` se sustituye por `<span class="c-ver c-ver--ok">verificado · origen: tú</span>`; el pie → `<span …color:var(--ver-ok)>✓ guardada con origen manual</span>` |

**Efecto secundario del sistema, no de la pantalla:** al enfocar el `textarea#jd` o el `.prop` en
`contentEditable`, `motion.js` llama a `CorpusAurora.pause('focus')` — aquí es inocuo porque la
aurora nunca se montó, pero el `focusin/focusout` sigue disparándose.

### Panel demo
```js
$$('.demo button').forEach(b=>b.onclick=()=>{
  $$('.demo button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  if(b.dataset.st==='analizado'){ta.value=JD;ta.dispatchEvent(new Event('input'));analyze()}
  else{ta.value='';ta.dispatchEvent(new Event('input'));$('#out').hidden=true;$('#hint').style.display='';}
});
M.boot();
```

### APIs del sistema usadas
`CorpusMotion.rm()` · `.reveal(el)` · `.enter(el)` · `.stagger(el,{step,cap,items})` · `.boot(scope)` y `.boot()`.
**No se usan:** `counter`, `shimmer`, `xray`, `words`, `chars`, `io`, ni `CorpusAurora.*`.

### Atajos de teclado
**Ninguno.** (Los `j/k/a/d/o` del handoff son de `staging.html`, no de aquí.)

---

## 7 · Copy (verbatim, ES)

### Chrome / barra
| Texto | ¿En `06-handoff/copy.md`? |
|---|---|
| `Corpus` (logo) | — (sistema) |
| `Panel` · `Master` · `Variantes` · `Fuentes` · `Ajustes` | no (navegación) |
| `ES` / `EN` · `DG` | no |
| `← Backend — Fintech` | no (nombre de la variante mock) |
| `ADAPTAR A UN AVISO` | no |
| `sin score — tres respuestas honestas` | **no** — nuevo en la pantalla; es la tesis en una línea |

### Columna del aviso
| Texto | copy.md |
|---|---|
| `El aviso, tal cual` | no |
| placeholder: `Pega aquí la descripción del cargo — completa, sin limpiar.` | no |
| `0 palabras` / `N palabras` | no (dinámico) |
| `usar aviso de ejemplo` | no |
| `Comparar con tu master` | no |

### Log de análisis (efímero)
| Texto | copy.md |
|---|---|
| `Leyendo el aviso — 148 palabras, 14 exigencias detectadas` | no |
| `Comparando contra 52 items del master…` | no |
| `Buscando las exigencias en tus viñetas, skills y repos…` | no |

### Estado vacío
> `Todavía nada que comparar`
> `Pega el aviso y Corpus lo contrasta contra tus **52 items** — los del master, no los de esta variante.`
> `La respuesta son hechos en tres grupos, no un porcentaje.`

→ **no** está en copy.md (es propio de la pantalla).

### Título objetivo
| Texto | copy.md |
|---|---|
| `El aviso pide «Backend Engineer» · tu variante dice «Backend Developer»` | no |
| `título alineado = 10,6× entrevistas [Jobscan]` | **sí, adaptado** — copy.md §Editor de variante: «Si coincide con el título del aviso: 10,6× más entrevistas [Jobscan, 2,5M postulaciones]» |
| `Usar el del aviso` | no |
| tras pulsar: `«Backend Engineer (Ingeniero de Software III)»` | **sí** — copy.md §Editor de variante trae la forma «Backend Engineer (Ingeniero de Software III)» |
| tras pulsar: `✓ título alineado — honesto: tu cargo real queda al lado` | no |

### Encabezados de los tres grupos
| Texto | copy.md |
|---|---|
| `✓` · `Ya está en esta variante` · `6` | **sí** — copy.md §Tailoring: «✓ Ya está en esta variante» |
| `＋` · `Lo tienes en el master, no en esta variante` · `4` · `un clic y entra — es tuyo, es honesto` | **sí** — copy.md: «＋ Lo tienes en el master, no en esta variante — un clic y entra: es tuyo, es honesto» (aquí partido en dos: encabezado + `.why`, y el `:` se vuelve `—`) |
| `○` · `No está en ninguna parte` · `3` · `y no vamos a inventarlo` | **sí** — copy.md: «○ No está en ninguna parte — y no vamos a inventarlo» (partido igual) |
| `añadir a la variante` | no |
| `✓ en la variante` | no |

### Cierre del grupo 3 (`.tl-gap-note`)
> `Aquí no hay botón de «añadir». Tres salidas reales: apréndelo, busca en tu master evidencia parcial que reencuadrar, o asume que este aviso no calza contigo — también está bien.`

→ **sí, verbatim** de copy.md §Tailoring «grupo 3, cierre» (copy.md usa comillas tipográficas `“añadir”`; el HTML usa `«añadir»` — usa el del HTML).

### Grupo 3, filas
- Kubernetes: `Tienes evidencia parcial: «lo usamos pero no lo administraba yo». Puedes contarlo como usuario — no como operador. Eso sí es defendible en entrevista.` → **sí**, copy.md «reencuadre honesto (Kubernetes)».
- Kafka: `No aparece en tu master, tus repos ni tu portfolio. Si lo has usado y no lo registraste, regístralo con su contexto. Si no: es una brecha real de este aviso, no un defecto de tu CV.` → **sí**, copy.md «brecha real (Kafka)».
- AWS: `Solo un README la menciona. Sin proyectos ni viñetas que la sostengan, ponerla te expone en la entrevista de 20 segundos.` → **no** está en copy.md (propio de la pantalla).
- botón: `reencuadrar con lo que sí tienes` → no.
- tras pulsar: `✓ viñeta honesta añadida: «Operé servicios sobre Kubernetes como usuario (deploys, debugging) — sin administrar el cluster»` → la viñeta **sí** es de copy.md («Operé servicios sobre Kubernetes como usuario (deploys, debugging) — sin administrar el cluster.»); el prefijo `✓ viñeta honesta añadida:` no.

### Reformulaciones
| Texto | copy.md |
|---|---|
| `Reformulaciones propuestas` · `3 · una a una, nunca en bloque` | no |
| `Propuesta 1` / `Propuesta 2` / `Propuesta 3` | no |
| `Original (master)` / `Propuesto para esta variante` | no |
| `verificado` / `no verificado` | **sí** (niveles de copy.md §Staging: «verificado / parcial / sin evidencia»; aquí «no verificado») |
| `si aceptas, queda como override — reversible, con el original a la vista` | no |
| warn: `⚠ No verificado: nada en tu master sostiene «arquitectura event-driven» ni «Kafka». Si es verdad, escríbelo tú y quedará como origen manual. Si no lo es, recházalo — así de simple.` | **sí, verbatim** — copy.md «propuesta no verificada» |
| `aceptar` · `rechazar` · `editarlo tú` · `guardar como mía` | no |
| `✓ aplicada como override — el original sigue en el master, revertible en el editor` | **sí, verbatim** — copy.md «aceptar propuesta» |
| `rechazada — no se guarda nada` | no |
| `edítala — al guardar queda como origen: tú` | no |
| `verificado · origen: tú` | no (idea de copy.md: «origen: tú — el más verificable de todos») |
| `✓ guardada con origen manual` | no (cercano a copy.md §Staging «✓ guardado como origen manual…») |

### Trazas (`.trace`) de cada propuesta
1. `tu viñeta b1 + término literal del aviso («reconciliación»)`
2. `tu resumen del master, reordenado — mismo contenido, dominio primero`
3. `la IA lo propuso — SIN origen en tu master`

### Panel demo
`demo` · `vacío` · `analizado` · aria-label `Estados de la pantalla (revisión de diseño)`.

---

## 8 · Accesibilidad

**Lo que hay:**
- `<label class="c-label" for="jd">` correctamente asociado al `<textarea id="jd">`.
- `#btnGo` con atributo `disabled` real (no solo visual) mientras `w < 30`.
- `#out` se oculta con el atributo `hidden` (fuera del árbol de accesibilidad), no con CSS.
- `hd-nav a[aria-current="page"]` en `Variantes`.
- Panel demo: `role="group"` + `aria-label` + `aria-pressed` sincronizado en cada botón.
- Foco: `:focus-visible{outline:2px solid var(--focus-ring)}` del sistema.
- Verificación **nunca solo por color**: `.c-ver--ok::before{content:"●"}` / `.c-ver--none::before{content:"⚠"}` + la palabra («verificado» / «no verificado»).
- Los tres grupos se distinguen por **glifo** (`✓` / `＋` / `○`) + palabra + color — no solo color.
- `prefers-reduced-motion`: todo el movimiento vive bajo el media query del sistema; `analyze()` acorta la espera del log a `80ms` con `M.rm()`.

**Orden de foco (DOM):** logo → nav (Panel, Master, Variantes, Fuentes) → Ajustes → `← Backend — Fintech`
→ `textarea#jd` → `usar aviso de ejemplo` → `Comparar con tu master` → (tras analizar) `Usar el del aviso`
→ botones `añadir a la variante` ×4 → `reencuadrar con lo que sí tienes` → por cada propuesta:
`aceptar`/`editarlo tú` → `rechazar` → panel demo.

**Atajos de teclado:** ninguno.

**Hit targets:** los botones de fila (`.tl-row .act button`, `padding:8px 11px`, ~13px de fuente) y los
del pie (`.tl-pfoot button`, `padding:8px 12px`) quedan en **~28–30 px de alto**: **por debajo de los
44 px que exige el handoff en móvil**. Los `.c-btn` sí cumplen (`--control-h:40px`). **Al implementar,
subir el alto de estos botones en el breakpoint móvil.**

**Huecos a corregir al portar (no están en el HTML):**
1. `#work` (el log de análisis) **no es una live region** — no hay `aria-live`. El usuario de lector de
   pantalla no se entera del progreso. Añadir `aria-live="polite"` (y `role="status"`).
2. La aparición de `#out` no se anuncia. Debería moverse el foco o anunciarse por live region.
3. `[data-edit]` pone `contentEditable` sin `role="textbox"` ni `aria-label`.
4. Las sustituciones por `outerHTML` destruyen el elemento con foco (p. ej. `#btnTitle` tras el clic):
   el foco cae al `<body>`. En React hay que gestionar el foco explícitamente.

---

## 9 · Datos del mock

Persona: **Diego Gatica** (iniciales `DG` en el avatar). Variante activa: **Backend — Fintech**.
Empresas: **Altiplano Pagos** (fintech, conciliación y liquidación) y **Rayén** (checkout, 2 años).

### El aviso de ejemplo (`JD`, verbatim)
```
Backend Engineer — Pagos (Santiago, híbrido)

Buscamos Backend Engineer para el equipo de infraestructura de pagos. Vas a diseñar y operar servicios de reconciliación y liquidación de alto volumen.

Requisitos:
• 4+ años construyendo servicios backend en Go
• PostgreSQL y modelado de datos transaccionales
• gRPC y diseño de APIs
• Experiencia operando Kubernetes en producción
• Kafka o streaming de eventos
• AWS (ECS/EKS, RDS)
• Inglés para documentación y equipos globales
• Disponibilidad de turnos on-call

Deseable: experiencia en fintech o medios de pago, CI/CD, mentoría a ingenieros junior.
```

### Grupo 1 — `HAVE` (6)
| `.k` | `.d` |
|---|---|
| `Go · 4+ años` | `viñeta «servicio de conciliación en Go (~40.000 tx diarias)» · skill verificada: 412 KB, 3 repos` |
| `PostgreSQL` | `skill verificada · APIs del checkout (Rayén, 2 años)` |
| `gRPC y APIs` | `skill verificada · conciliador-api con protos versionados` |
| `Pagos / fintech` | `Altiplano Pagos: conciliación y liquidación — es literalmente el dominio del aviso` |
| `On-call` | `viñeta «turno de soporte una semana al mes»` |
| `Inglés` | `B2 declarado — el aviso pide inglés de documentación: alcanza, dilo así` |

### Grupo 2 — `ADD` (4)
| `.k` | `.d` |
|---|---|
| `CI/CD` | `viñeta en tu master: «mantengo los pipelines de CI/CD (GitHub Actions)»` |
| `Mentoría` | `viñeta en tu master: «mentoreo a 2 desarrolladores junior»` |
| `Redis` | `skill verificada en tu master (locks de idempotency-go)` |
| `Documentación de APIs` | `viñeta en tu master: «documenté la API pública (OpenAPI 3.1)»` |

### Grupo 3 — `GAP` (3)
| `.k` | `re` |
|---|---|
| `Kubernetes en producción` | **`true`** → único con botón de reencuadre |
| `Kafka / streaming` | — |
| `AWS (ECS/EKS, RDS)` | — |

### Reformulaciones — `PROPS` (3)
1. **`ver:'ok'`** · trace: `tu viñeta b1 + término literal del aviso («reconciliación»)`
   - original: `A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias).`
   - propuesto: `A cargo del servicio de <b>conciliación (reconciliación) de pagos</b> en Go (~40.000 transacciones diarias), incluyendo <b>liquidación</b>.`
2. **`ver:'ok'`** · trace: `tu resumen del master, reordenado — mismo contenido, dominio primero`
   - original: `Backend developer con 6 años construyendo servicios de pago y e-commerce en Go y Node.js…`
   - propuesto: `<b>Backend engineer de pagos</b> con 6 años en Go y Node.js. A cargo de la <b>reconciliación</b> de Altiplano Pagos (~40.000 tx/día)…`
3. **`ver:'none'`** · trace: `la IA lo propuso — SIN origen en tu master`
   - original: `(no existe una viñeta de origen)`
   - propuesto: `Diseñé la arquitectura event-driven del pipeline de pagos con Kafka.`
   - warn: el texto de copy.md «propuesta no verificada».

### Coherencia entre pantallas
`52 items` en el master (= staging vacío de copy.md) · `~40.000 tx diarias` · `412 KB, 3 repos` ·
`6 años` de experiencia · `B2` de inglés · `2 desarrolladores junior` · Kubernetes y Kafka como las
brechas canónicas (mismas que master.html / salud).

---

## 10 · Números en la UI

| Número visible | Origen | ¿Legítimo? |
|---|---|---|
| `0 palabras` / `92 palabras` (`#jdMeta`) | calculado en vivo: `(ta.value.trim().match(/\S+/g)||[]).length`, formato `es-CL` | **Sí** — hecho medido del propio input |
| `52 items` (hint + log) | el master (coherente con copy.md §Staging: «52 items entraron a tu master») | **Sí** — cifra de dato real |
| `6` (`#nHave`) | `HAVE.length === 6` | **Sí** — cuenta de filas |
| `4` (grupo 2) | `ADD.length === 4` | **Sí** |
| `3` (grupo 3) | `GAP.length === 3` | **Sí** |
| `3 · una a una, nunca en bloque` | `PROPS.length === 3` | **Sí** |
| `10,6× entrevistas [Jobscan]` | **fuente citada en el propio texto**: Jobscan (copy.md: «Jobscan, 2,5M postulaciones») | **Sí** — es el patrón correcto: cifra + corchete con la fuente |
| `~40.000 tx diarias` / `~40.000 transacciones diarias` / `~40.000 tx/día` | viñeta del master de Diego Gatica | **Sí** — citada como viñeta |
| `412 KB, 3 repos` | evidencia de la skill (fuentes) | **Sí** |
| `Rayén, 2 años` · `6 años` · `4+ años` (Go) · `2 desarrolladores junior` · `B2` · `OpenAPI 3.1` | viñetas / skills del master, o el propio aviso | **Sí** |
| `Propuesta 1/2/3` | índice | **Sí** |
| **`148 palabras`** (log de `analyze()`) | **hardcodeado** en `steps[0]` | **⚠ SOSPECHOSO — y además CONTRADICTORIO.** El propio contador de la pantalla dice **92 palabras** para ese mismo `JD` (verificado ejecutando su regex). La app se contradice a sí misma en la misma pantalla. **Al implementar: derivar esta cifra del conteo real del aviso, no escribirla.** |
| **`14 exigencias detectadas`** (log de `analyze()`) | **hardcodeado** | **⚠ SOSPECHOSO.** El aviso tiene 8 viñetas de «Requisitos» + 3 deseables = 11 elementos enumerables; los grupos que la pantalla luego muestra suman **6 + 4 + 3 = 13**, no 14. **Ningún camino da 14.** Debe salir del extractor, y ser igual a `HAVE.length + ADD.length + GAP.length`. |

**Lo que la pantalla hace bien y no se puede perder:** no hay **score**, no hay **%**, no hay
**confidence**, no hay barra de progreso porcentual. El rótulo de la barra lo dice en voz alta:
`sin score — tres respuestas honestas`. Cualquier «match: 78 %» que aparezca en la implementación es
una violación del producto (`00-README.md §6`, `handoff.md §4`).

---

## Contradicciones y riesgos detectados

1. **`148 palabras` vs. `92 palabras`** — el log de análisis miente respecto al contador de la misma
   pantalla. Es la única cifra sin fuente del archivo, y precisamente en un producto cuya tesis es
   «ningún número sin fuente».
2. **`14 exigencias detectadas`** no es derivable de nada visible (ni de las 11 líneas del aviso ni de
   los 13 items de los tres grupos).
3. **Hit targets de `.tl-row .act button` y `.tl-pfoot button` (~28–30 px)** incumplen el mínimo de
   44 px en móvil que fija `handoff.md`.
4. **El log `#work` no es live region** — el progreso es invisible para lectores de pantalla.
5. **Copy partido:** los encabezados de los grupos 2 y 3 de `copy.md` están **divididos** entre el
   `.t-overline` y el `.why`; el HTML cambia `:` por `—` en el grupo 2. Manda el HTML.
6. **`＋` es U+FF0B (fullwidth plus)**, no un `+` ASCII. Copiarlo literal.
7. **Todo el estado es DOM crudo (`outerHTML`, `innerHTML`, `contentEditable`)**: en React hay que
   modelarlo como estado (`added`, `reframed`, `accepted`/`rejected`/`edited` por propuesta, `titleAligned`)
   y no reproducir la mutación de nodos. Y hay que devolver el foco a mano tras cada sustitución.
