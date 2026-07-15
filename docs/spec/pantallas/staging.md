# staging.html — spec de implementación

> Fuente literal: `Corpus_ diseño completo/corpus-design/04-pantallas/staging.html` (1320 líneas).
> Regla madre: **los nombres de clase NO cambian**. Este documento describe lo ESPECÍFICO de la
> pantalla; los bloques `<style data-corpus-system="css">` (líneas 10–486) y
> `<script data-corpus-system="js">` (líneas 704–975) son copia del sistema canónico y **no** se
> transcriben aquí.

---

## 1 · Ruta y propósito

**Ruta:** `/app/staging` ★★★ — la pantalla crítica del producto.

Es el **paso 2 de 2 de la ingesta**: revisar, uno a uno, los 61 items que la extracción dejó en
staging, con la evidencia (el fragmento de origen) a un clic, y decidir qué entra al master y qué
se descarta. Nada entra al master sin confirmación del usuario. Los lotes solo tocan lo verificado;
lo parcial y lo sin-evidencia pasa por los ojos del usuario, uno a uno.

`<title>` literal: `Corpus — Staging · 61 items esperan tu decisión`
`<html lang="es" data-theme="dark">`

---

## 2 · Ventana o muro · Aurora

**NO monta la aurora.** No hay ninguna llamada a `CorpusAurora.mount(...)` en el script de la
pantalla (grep confirmado: las únicas apariciones de `CorpusAurora` están dentro del bloque
`data-corpus-system`, que solo *define* la API y la pausa al enfocar campos). El elemento
`.c-aurora` **nunca se crea**: `mount()` es opt-in y aquí nadie lo llama.

Esto es correcto y deliberado: **"donde hay trabajo, el trabajo gana"**. Staging es el sitio de
mayor densidad de trabajo del producto → es un **muro**, y los muros ni montan la aurora.

Gramática de capas usada en esta pantalla:

| Clase | Dónde | Nota |
|---|---|---|
| `.c-wall` (S) | `<main class="stg-main c-wall">` | **la única** clase de la gramática ventana/muro presente |
| `.c-window` | — | **no se usa** |
| `.c-scrim` | — | **no se usa** |
| `.c-panel` | — | **no se usa** |
| `.c-aurora` | — | **no se crea** |

Refuerzo explícito en el CSS de pantalla:
```css
/* ── staging.html — MURO: aquí se trabaja. Cero scroll-reveal. ── */
body{background:var(--bg)}
```
El `body{background:var(--bg)}` es **opaco a propósito**: sella cualquier posibilidad de humo detrás.

En React: **no renderizar `<Aurora/>` en esta ruta.** Ni "calm" ni nada.

Movimiento permitido aquí: solo `stagger` al poblarse la lista, `counter` en los contadores y
`enter` en cambios de vista. **Cero scroll-reveal, cero `CorpusMotion.io()`, cero shimmer.**

---

## 3 · Esqueleto DOM

Leyenda: **(S)** = clase del sistema (`c-*`, `t-*`, `hd-*`) · **(P)** = propia de la pantalla (`stg-*`, `demo`).

### 3.1 · DOM estático (líneas 630–702)

```
body
└─ div.c-page                                                    (S)
   ├─ header.c-header                                            (S)
   │  └─ div.c-container                                         (S)
   │     ├─ div.hd-crumb                     [style inline: flex, gap 14px]
   │     │  ├─ a.c-logo[href="dashboard.html"]                   (S)   → "Corpus"
   │     │  ├─ span                          [separador 1×18px, --border-strong]
   │     │  └─ span                          [mono, .14em, --text-muted]
   │     │                                          → "INGESTA · PASO 2 DE 2 — REVISIÓN"
   │     └─ div                              [style inline: margin-left:auto]
   │        ├─ div (toggle idioma, replicado inline, NO usa .hd-lang)
   │        │  ├─ span → "ES"   [activo: --text sobre --surface-elevated]
   │        │  └─ span → "EN"   [--text-subtle]
   │        └─ div (avatar, replicado inline, NO usa .hd-av) → "DG"
   │
   ├─ div.stg-sub[data-screen-label="staging-cabecera"]          (P)  ← sticky bajo el header
   │  └─ div.c-container                                         (S)
   │     ├─ span.stg-title                                       (P)  → "Staging"
   │     ├─ div.stg-nums                                         (P)
   │     │  ├─ span > b#nPend → "61" + " pendientes"
   │     │  ├─ span.stg-bar[aria-hidden="true"]                  (P)
   │     │  │  ├─ span.ok#barOk   [style="width:0%"]
   │     │  │  └─ span.out#barOut [style="width:0%"]
   │     │  ├─ span > b#nAcc.t-accent → "0" + " al master"       (t-accent = S)
   │     │  └─ span > b#nDis → "0" + " descartados"
   │     └─ div.stg-filter[role="group"][aria-label="Filtrar por verificación"]   (P)
   │        ├─ button[data-f="all"][aria-pressed="true"]      → "todos"
   │        ├─ button[data-f="ok"][aria-pressed="false"]      → "● verificado " + span#fOk "43"
   │        ├─ button[data-f="partial"][aria-pressed="false"] → "◐ parcial " + span#fPa "8"
   │        └─ button[data-f="none"][aria-pressed="false"]    → "⚠ sin evidencia " + span#fNo "9"
   │
   └─ main.stg-main.c-wall[data-screen-label="staging"]          (P)+(S)
      └─ div.c-container                                         (S)
         ├─ div.stg-lead                                         (P)
         │  ├─ p  (+ 2 × <b> dentro: "ábrelo", "verificado")
         │  └─ button.c-btn.c-btn--patina#btnBatchAll            (S)
         │                              → "Aceptar todo lo verificado (43)"
         ├─ div.c-card.stg-dupq#dupq                             (S)+(P)
         │  ├─ span → "⚡"
         │  ├─ span > b "3 posibles duplicados" + resto del texto
         │  └─ a#dupJump[href="#dup-rayen"][style="margin-left:auto"] → "resolver →"
         ├─ div#groups                     ← VACÍO en el HTML; lo puebla render()
         └─ div.stg-empty#empty                                  (P)   [oculto: sin .show]
            ├─ div.mark → "✓"
            ├─ h2 → "Staging limpio."
            ├─ p → span.t-num#emptyAcc "52" + " items entraron a tu master, …"
            ├─ span.c-forge > a.c-btn.c-btn--forge.c-btn--lg[href="master.html"]   (S)
            │                              → "Ver el master →"
            └─ p.fine → "Siguiente paso razonable: …"

div.stg-kbd[aria-hidden="true"]                                  (P)  ← fixed abajo-izquierda
  └─ 5 × span > b   (j/k · a · d · o · deshacer)

div.demo[role="group"][aria-label="Estados de la pantalla (revisión de diseño)"]   (S)
  ├─ span → "demo"
  └─ 6 × button[data-st][aria-pressed]
       cargando · lleno (pressed) · duplicado · sin-evidencia · avanzado · vacio
```

> **Ojo:** el header replica `.hd-lang` y `.hd-av` con estilos inline en vez de usar las clases del
> sistema. En React, usar los componentes del sistema (`hd-lang`, `hd-av`) — el resultado visual es
> idéntico y las clases existen en `base.css`.

### 3.2 · DOM generado por JS dentro de `#groups`

`render()` inyecta 4 `<section class="stg-g">` con esta plantilla:

```
section.stg-g[data-g="exp"|"sk"|"pj"|"ct"]                       (P)
├─ div.stg-gh                                                    (P)
│  ├─ span.t-overline  → título del grupo                        (S)
│  ├─ span.cnt         → "4 items · 25 viñetas" / "23 items" / …
│  ├─ span.accd[data-a="showacc"][hidden]  → aparece tras un lote:
│  │                      "✓ N aceptados — ver"   (+ data-n)
│  └─ button.batch[data-a="batch"][data-g=…] → "aceptar N verificados ✓"
├─ hr.c-divider                                                  (S)
└─ (inner)
```

**Tarjeta de experiencia** — `expCard(e)`:
```
div.c-card.stg-card[data-card="e1"]                              (S)+(P)
├─ div.stg-chead.stg-unit[data-id][data-ver][data-kb]            (P)
│  ├─ span.tt   → cargo
│  ├─ span.org  → "Altiplano Pagos · mar 2022 – hoy"
│  ├─ span.c-ver.c-ver--ok|--partial|--none  → "verificado"|"parcial"|"sin evidencia"   (S)
│  ├─ button.stg-orig[data-a="orig"] → "origen ▾"
│  └─ span.stg-acts                                              (P)
│     ├─ button.ok[data-a="acc"]  → "✓ aceptar"
│     ├─ button[data-a="edit"]    → "editar"
│     └─ button.no[data-a="dis"]  → "× descartar"
├─ div.stg-frag[data-frag="e1"]                                  (P)   [cerrado; .open lo abre]
│  ├─ span.from → nombre de la fuente (SRC[src])
│  └─ …HTML del fragmento con <mark>…</mark>
└─ N × (fila de viñeta)  ← bulletRow(b)
```

**Fila de viñeta** — `bulletRow(b)` (3 nodos hermanos):
```
div.stg-b.stg-unit[data-id="b3"][data-ver="none"][data-kb]       (P)
├─ span.tx     → texto de la viñeta (puede contener <span class="t-num">)   (t-num = S)
├─ span.c-ver.c-ver--none                                        (S)
├─ button.stg-orig[data-a="orig"] → "origen ▾"
└─ span.stg-acts (3 botones: acc / edit / dis)
div.stg-frag.miss[data-frag="b3"]        ← ".miss" SOLO si ver === 'none'
├─ span.from → SRC[src] + " — la cifra no tiene respaldo"   (el sufijo solo si ver==='none')
└─ …fragmento
div.stg-ask[data-ask="b3"]               ← SOLO si el item tiene `ask`
├─ span → "⚠ " + pregunta
├─ input.c-input[placeholder="Escríbelo aquí y quedará como origen: tú (el más verificable de todos)"]  (S)
└─ button[data-a="saveask"] → "guardar como origen manual"
```

**Tarjeta de duplicado** — `dupCard()` (sustituye a la exp `e2`):
```
div.c-card.stg-dup#dup-rayen[data-card="e2"]                     (S)+(P)
├─ div.dh[data-a="dtoggle"]
│  ├─ span.tt  → "Rayén Retail — Backend, equipo Checkout"
│  ├─ span.why → "aparece en texto pegado y en CV_2023.pdf, redactado distinto"
│  └─ span.tog → "resolver campo por campo ▾"  ⇄  "cerrar ▴"
├─ div.stg-merge#merge                       [cerrado; .open lo abre]
│  ├─ div.stg-mhead > div (vacío) + div "CV_2023.pdf" + div "texto pegado"
│  └─ 3 × div.stg-mrow
│       ├─ div.k → "cargo" | "fechas" | "viñetas"
│       ├─ button[data-pick="cargo:a"][aria-pressed="false"] → valor de A
│       └─ button[data-pick="cargo:b"][aria-pressed="false"] → valor de B
│           (el elegido: aria-pressed="true" → ::after content "esta")
├─ div.stg-mfoot#mfoot[hidden]
│  ├─ span.note → "La fusión la decides tú — nunca automática. …"
│  └─ button.c-btn#btnMerge[disabled] → "Crear item fusionado"          (S)
└─ 7 × bulletRow(b9…b15)      ← las viñetas del duplicado, revisables una a una
```
**IMPORTANTE:** la cabecera `.dh` del duplicado **NO es `.stg-unit`** — no se puede aceptar ni
descartar; solo se resuelve fusionando. (Ver §10, tiene consecuencias en los contadores.)

**Fila densa (skills / proyectos / certificaciones)** — `denseRow(x,i,kind)`:
```
div.stg-skills                          ← grid 2 columnas (1 col en certs, vía style inline)
└─ N × div.stg-sk.stg-unit[data-id="sk0"|"pj0"|"ct0"][data-ver][data-kb]     (P)
   ├─ span.nm  → nombre
   ├─ span.c-ver…                                                (S)
   ├─ span.ev  → evidencia + " · " + span.stg-src (sin borde, inline style)
   └─ span.stg-acts (3 botones)
```

**Fila resuelta** — `resolve()` sustituye la unidad (excepto `.stg-sk`) por:
```
div.stg-donerow[data-undo="1"]                                   (P)
├─ span.g "✓" + span "al master · <label truncado a 72 chars>"
│   — o —  span.r "×" + span "descartado · <label>"
└─ button → "deshacer"
```
En `.stg-sk` no se reemplaza el nodo: se le añade `.done` (opacity .45) y su `.ev` se reescribe a
`✓ al master` / `× descartado` + `button[data-a="undo-sk"] "deshacer"`.

**Skeletons** (estado `cargando`):
```
div.stg-g
├─ div.c-skel [style height:14px;width:120px]                    (S)
└─ 6 × div.c-skel.stg-skelrow                                    (S)+(P)
```

**Atributos `data-*` de la pantalla (contrato):**
`data-screen-label` · `data-g` · `data-card` · `data-id` · `data-ver` (`ok|partial|none`) ·
`data-kb` · `data-frag` · `data-ask` · `data-a` (`orig|acc|dis|edit|saveask|dtoggle|batch|showacc|undo-sk`) ·
`data-pick` (`campo:a|b`) · `data-f` (`all|ok|partial|none`) · `data-st` (estados demo) ·
`data-done` (`acc|dis`) · `data-edited` · `data-undo` · `data-batch` · `data-n`.

---

## 4 · CSS específico de pantalla

VERBATIM, el bloque `<style>` de las líneas 487–628 (el que **no** lleva `data-corpus-system`).
No define ningún `@keyframes` propio: **cero keyframes fuera del sistema.**

```css
/* ── staging.html — MURO: aquí se trabaja. Cero scroll-reveal. ── */
body{background:var(--bg)}
.stg-sub{position:sticky;top:var(--header-h);z-index:9;background:color-mix(in srgb,var(--bg) 86%,transparent);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.stg-sub .c-container{display:flex;align-items:center;gap:20px;padding-block:12px;flex-wrap:wrap}
.stg-title{font:500 var(--fs-h3)/1 var(--font-display);letter-spacing:0}
.stg-nums{display:flex;align-items:center;gap:14px;font:400 var(--fs-data)/1 var(--font-mono);color:var(--text-muted)}
.stg-nums b{color:var(--text);font-weight:500}
.stg-bar{width:150px;height:2px;display:flex;background:var(--surface-elevated);border-radius:1px;overflow:hidden}
.stg-bar span{height:100%;transition:width .2s var(--ease-standard)}
.stg-bar .ok{background:var(--patina-500)}
.stg-bar .out{background:color-mix(in srgb,var(--danger) 45%,transparent)}
.stg-filter{margin-left:auto;display:flex;gap:6px;align-items:center}
.stg-filter button{font:500 var(--fs-micro)/1 var(--font-mono);letter-spacing:.04em;padding:7px 10px;
  border:1px solid var(--border);border-radius:6px;color:var(--text-muted)}
.stg-filter button:hover{color:var(--text);border-color:var(--border-strong)}
.stg-filter button[aria-pressed="true"]{color:var(--text);background:var(--surface-elevated);border-color:var(--border-patina)}
.stg-main{flex:1;padding:26px 0 140px}
.stg-lead{display:flex;align-items:baseline;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:6px}
.stg-lead p{color:var(--text-muted);font-size:var(--fs-ui);max-width:62ch}
.stg-lead p b{color:var(--text);font-weight:500}
/* grupos */
.stg-g{margin-top:44px}
.stg-gh{display:flex;align-items:baseline;gap:14px;padding-bottom:10px}
.stg-gh .cnt{font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)}
.stg-gh .accd{font:400 var(--fs-micro)/1 var(--font-mono);color:var(--ver-ok);cursor:pointer}
.stg-gh .accd:hover{text-decoration:underline}
.stg-gh .batch{margin-left:auto;font:500 var(--fs-micro)/1 var(--font-mono);color:var(--text-muted);
  padding:7px 10px;border:1px solid var(--border);border-radius:6px}
.stg-gh .batch:hover{color:var(--accent-text);border-color:var(--border-patina)}
/* unidad revisable */
.stg-card{margin-top:12px;padding:0}
.stg-card.c-noev{background:color-mix(in srgb,var(--danger) 3%,var(--surface))}
.stg-chead{display:flex;align-items:baseline;gap:12px;padding:16px 20px 12px;flex-wrap:wrap}
.stg-chead .tt{font:600 15px/1.3 var(--font-sans)}
.stg-chead .org{font:400 var(--fs-data)/1.3 var(--font-mono);color:var(--text-muted)}
.stg-chead .c-ver{margin-left:auto}
.stg-meta{display:flex;align-items:center;gap:10px;padding:0 20px 12px;flex-wrap:wrap}
.stg-b{position:relative;display:flex;align-items:baseline;gap:12px;padding:10px 20px;border-top:1px solid var(--border);
  font-size:13px;line-height:1.55}
.stg-b .tx{flex:1;min-width:0}
.stg-b .tx .t-num{color:var(--text)}
.stg-b[data-ver="none"] .tx{color:var(--text-muted)}
.stg-b .c-ver{flex:none}
.stg-unit.kb-focus,.stg-b.kb-focus{box-shadow:inset 2px 0 0 var(--patina-300);background:color-mix(in srgb,var(--surface-elevated) 60%,transparent)}
/* acciones por unidad */
.stg-acts{display:flex;gap:2px;flex:none;opacity:0;transition:opacity .12s}
.stg-b:hover .stg-acts,.stg-b.kb-focus .stg-acts,.stg-chead:hover .stg-acts,.kb-focus .stg-chead .stg-acts{opacity:1}
.stg-acts button{font:500 var(--fs-micro)/1 var(--font-mono);color:var(--text-muted);padding:5px 8px;border-radius:5px}
.stg-acts button:hover{color:var(--text);background:var(--surface-elevated)}
.stg-acts button.ok:hover{color:var(--ver-ok)}
.stg-acts button.no:hover{color:var(--danger)}
/* origen */
.stg-src{font:400 10px/1 var(--font-mono);color:var(--text-subtle);border:1px solid var(--border);border-radius:4px;padding:4px 7px;white-space:nowrap}
.stg-orig{font:500 10px/1 var(--font-mono);color:var(--text-muted);padding:4px 7px;border-radius:4px;cursor:pointer;white-space:nowrap}
.stg-orig:hover{color:var(--accent-text);background:var(--surface-elevated)}
.stg-frag{display:none;margin:2px 20px 14px;padding:12px 16px;background:var(--surface-sunken);
  border-left:2px solid var(--border-strong);border-radius:0 6px 6px 0;
  font:400 var(--fs-data)/1.7 var(--font-mono);color:var(--text-muted)}
.stg-frag.open{display:block}
.stg-frag .from{display:block;margin-bottom:6px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-subtle)}
.stg-frag mark{background:rgba(95,198,169,.16);color:var(--text);padding:0 3px;border-radius:2px}
.stg-frag.miss{border-left-color:color-mix(in srgb,var(--danger) 50%,transparent)}
.stg-frag.miss .from{color:var(--danger)}
/* invitación (huecos) */
.stg-ask{margin:0 20px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;
  font:400 var(--fs-data)/1.5 var(--font-sans);color:var(--text-muted)}
.stg-ask input{flex:1;min-width:200px;height:32px;padding:0 10px;font-size:var(--fs-data)}
.stg-ask button{font:500 var(--fs-micro)/1 var(--font-mono);padding:8px 10px;border:1px solid var(--border-strong);border-radius:5px;color:var(--text-muted)}
.stg-ask button:hover{color:var(--accent-text);border-color:var(--border-patina)}
/* resuelto */
.stg-donerow{display:flex;align-items:center;gap:10px;padding:8px 20px;border-top:1px solid var(--border);
  font:400 var(--fs-data)/1.4 var(--font-mono);color:var(--text-subtle)}
.stg-donerow .g{color:var(--ver-ok)}
.stg-donerow .r{color:var(--danger)}
.stg-donerow button{color:var(--text-subtle);font:inherit;text-decoration:underline;text-underline-offset:3px}
.stg-donerow button:hover{color:var(--text)}
/* skills — densidad hairline */
.stg-skills{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;margin-top:12px}
.stg-sk{position:relative;background:var(--surface);padding:12px 16px;display:grid;grid-template-columns:1fr auto;gap:2px 10px}
.stg-sk .nm{font:500 13px/1.3 var(--font-sans)}
.stg-sk .ev{grid-column:1/3;font:400 var(--fs-micro)/1.6 var(--font-mono);color:var(--text-subtle)}
.stg-sk .ev a{color:var(--text-subtle);text-decoration:underline;text-underline-offset:2px}
.stg-sk .ev a:hover{color:var(--accent-text)}
.stg-sk[data-ver="none"]{background:color-mix(in srgb,var(--danger) 4%,var(--surface));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--danger) 30%,transparent)}
.stg-sk .stg-acts{position:absolute;top:8px;right:8px;background:var(--surface);border-radius:5px}
.stg-sk:hover .stg-acts,.stg-sk.kb-focus .stg-acts{opacity:1}
.stg-sk.kb-focus{box-shadow:inset 2px 0 0 var(--patina-300)}
.stg-sk.done{opacity:.45}
.stg-sk.done .stg-acts{display:none}
/* duplicados */
.stg-dupq{margin-top:10px;display:flex;align-items:center;gap:12px;padding:12px 20px;
  font:400 var(--fs-data)/1.4 var(--font-mono);color:var(--text-muted)}
.stg-dupq b{color:var(--text);font-weight:500}
.stg-dup{margin-top:12px;overflow:hidden}
.stg-dup .dh{display:flex;align-items:baseline;gap:12px;padding:14px 20px;cursor:pointer}
.stg-dup .dh:hover{background:var(--surface-elevated)}
.stg-dup .dh .tt{font:600 14px/1.3 var(--font-sans)}
.stg-dup .dh .why{font:400 var(--fs-micro)/1.3 var(--font-mono);color:var(--text-subtle)}
.stg-dup .dh .tog{margin-left:auto;font:500 var(--fs-micro)/1 var(--font-mono);color:var(--accent-text)}
.stg-merge{display:none;border-top:1px solid var(--border)}
.stg-merge.open{display:block}
.stg-mhead{display:grid;grid-template-columns:110px 1fr 1fr;gap:1px;background:var(--border)}
.stg-mhead>div{background:var(--surface-elevated);padding:9px 14px;font:500 10px/1 var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--text-subtle)}
.stg-mrow{display:grid;grid-template-columns:110px 1fr 1fr;gap:1px;background:var(--border)}
.stg-mrow>.k{background:var(--surface);padding:12px 14px;font:500 10px/1.5 var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--text-subtle)}
.stg-mrow>button{background:var(--surface);padding:12px 14px;text-align:left;font:400 13px/1.5 var(--font-sans);color:var(--text-muted);cursor:pointer;position:relative}
.stg-mrow>button:hover{background:var(--surface-elevated);color:var(--text)}
.stg-mrow>button[aria-pressed="true"]{color:var(--text);box-shadow:inset 2px 0 0 var(--patina-500);background:color-mix(in srgb,var(--patina-500) 4%,var(--surface))}
.stg-mrow>button[aria-pressed="true"]::after{content:"esta";position:absolute;top:8px;right:10px;
  font:500 9px/1 var(--font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--accent-text)}
.stg-mfoot{display:flex;align-items:center;gap:14px;padding:14px 20px;border-top:1px solid var(--border)}
.stg-mfoot .note{font:400 var(--fs-micro)/1.5 var(--font-mono);color:var(--text-subtle)}
.stg-mfoot .c-btn{margin-left:auto}
/* barra de teclado */
.stg-kbd{position:fixed;left:14px;bottom:14px;z-index:var(--z-overlay);display:flex;gap:12px;padding:8px 12px;
  border:1px solid var(--border);border-radius:8px;background:color-mix(in srgb,var(--surface-elevated) 86%,transparent);
  backdrop-filter:blur(10px);font:400 10px/1 var(--font-mono);color:var(--text-subtle)}
.stg-kbd b{color:var(--text-muted);font-weight:500}
/* vacío / fin */
.stg-empty{max-width:520px;margin:90px auto 0;text-align:center;display:none}
.stg-empty.show{display:block}
.stg-empty .mark{font:400 30px/1 var(--font-mono);color:var(--ver-ok)}
.stg-empty h2{margin-top:18px}
.stg-empty p{margin-top:12px;color:var(--text-muted)}
.stg-empty .c-forge{margin-top:30px}
.stg-empty .fine{margin-top:22px;font:400 var(--fs-micro)/1.7 var(--font-mono);color:var(--text-subtle)}
/* skeleton */
.stg-skelrow{height:64px;margin-top:12px;border-radius:var(--radius-md)}
@media (max-width:768px){
  .stg-skills{grid-template-columns:1fr}
  .stg-kbd{display:none}
  .stg-bar{display:none}
  .stg-mhead,.stg-mrow{grid-template-columns:80px 1fr 1fr}
}
@media (max-width:480px){
  .stg-chead .c-ver{margin-left:0;width:100%}
  .stg-mhead,.stg-mrow{grid-template-columns:1fr;gap:0}
  .stg-mhead>div:first-child,.stg-mrow>.k{border-top:1px solid var(--border)}
}
```

### Estilos inline presentes en el markup (no perderlos)

- Header: separador `width:1px;height:18px;background:var(--border-strong)`; overline
  `font:500 var(--fs-micro)/1 var(--font-mono);letter-spacing:.14em;color:var(--text-muted)`;
  toggle idioma y avatar replicados inline (equivalentes a `.hd-lang` / `.hd-av`).
- `#dupJump` y `#dupJump2`: `style="margin-left:auto"`.
- Certificaciones: `<div class="stg-skills" style="grid-template-columns:1fr">` → **1 columna**.
- `.stg-src` dentro de `.stg-sk .ev`: `style="border:0;padding:0"` (chip sin caja).
- Badge "editado por ti": `<span class="stg-src" style="color:var(--accent-text);border-color:var(--border-patina)">`.
- Skeleton del título: `<div class="c-skel" style="height:14px;width:120px">`.

> `.stg-meta` está definida en el CSS pero **no se usa** en el DOM. `.c-noev` (S) se aplica en el CSS
> a `.stg-card.c-noev` pero tampoco se aplica en el JS actual — el borde punteado de "sin evidencia"
> se consigue hoy con `.stg-sk[data-ver="none"]` (inset ring) y `.stg-frag.miss`. **Al portar, no
> borres `.c-noev`**: es el contrato de "borde punteado + glifo + palabra" del handoff.

---

## 5 · Estados del panel demo

Panel `.demo` (abajo a la derecha), 6 botones `data-st`. Convención de entrega, **no producto** —
en React va detrás de un flag de dev, nunca en producción.

| Estado | `data-st` | Qué hace (código) | Qué cambia en el DOM |
|---|---|---|---|
| **cargando** | `cargando` | `reset(); skeletons()` | `#groups` se reemplaza por 1 `.stg-g` con un `.c-skel` de título + 6 `.c-skel.stg-skelrow`; `#empty` pierde `.show` |
| **lleno** ✅ *(por defecto, `aria-pressed="true"`)* | `lleno` | `reset()` | Re-renderiza los 4 grupos completos; contadores a 61/0/0; `#btnBatchAll` habilitado y con su texto original; `#dupq` restaurado |
| **duplicado** | `duplicado` | `reset(); setTimeout(()=>$('#dupJump').click(),80)` | Scroll manual calculado hasta `#dup-rayen` (`top - 140px`), `#merge` gana `.open`, `#mfoot` deja de estar `hidden` |
| **sin evidencia** | `sin-evidencia` | `reset()` + click programático en el filtro `[data-f="none"]` | Todas las `.stg-unit` con `data-ver!=="none"` → `display:none`; las tarjetas sin ninguna unidad visible se ocultan; los `.stg-frag` abiertos se cierran |
| **avanzado** | `avanzado` | `reset(); batch('sk'); batch('ct'); S.dis=2; refresh()` | Grupos Skills y Certificaciones con sus verificados aceptados (16 + 1), `.accd` visible con "✓ N aceptados — ver", contadores actualizados, `.stg-sk` aceptadas ocultas (`display:none`), foco de teclado saltado al primer `[data-ver="none"]` |
| **vacío** | `vacio` | `reset(); S.acc=52; S.dis=9; refresh()` | `pend===0` → se ocultan `#groups`, `#dupq` y `.stg-lead`; `#emptyAcc` = 52; `#empty` gana `.show` y entra con `CorpusMotion.enter()` |

`reset()` (línea 1303): `S.acc=0; S.dis=0; render(); refresh();` + restaura el texto y el
`disabled` de `#btnBatchAll` + reconstruye el `innerHTML` de `#dupq`.

> ⚠ **Bug a no replicar:** el `#dupq` reconstruido por `reset()` usa `id="dupJump2"`, no `dupJump`.
> El handler `$('#dupJump').onclick` se enlaza una sola vez al arranque sobre el nodo original, así
> que tras cualquier `reset()` el enlace "resolver →" deja de funcionar. En React esto desaparece
> solo (handler declarativo), pero **no copies el `id` duplicado**.

---

## 6 · Comportamiento JS de la pantalla

Todo dentro de una IIFE `(function(){'use strict'; … })()` (líneas 976–1319).
Helpers: `$` = `querySelector`, `$$` = `[...querySelectorAll]`, `M = window.CorpusMotion`.

### 6.1 · Datos y builders

- `SRC` — diccionario de fuentes: `{tx:'texto pegado', gh:'github.com/dgatica', web:'dgatica.cl', cv:'CV_2023.pdf', q:'cuestionario-identidad.md'}`.
- `DATA` — `{exp[], dup{}, skills[], proj[], cert[]}` (§9).
- `S` — estado: `{acc:0, dis:0, total:61, units:new Map()}` (`units` se declara pero no se usa).
- `VER` — mapa `ver → [clase, palabra]`:
  ```js
  const VER={ok:['c-ver--ok','verificado'],partial:['c-ver--partial','parcial'],none:['c-ver--none','sin evidencia']};
  ```
  **Contrato del brief:** nunca solo color → clase + glifo (vía `::before`) + palabra.
- `verBadge(v)` · `srcChip(s)` (definido, no usado) · `acts()` · `bulletRow(b)` · `expCard(e)` ·
  `dupCard()` · `denseRow(x,i,kind)` · `group(title,cnt,inner,batchN,gid)`.

### 6.2 · `render()`

```js
g.innerHTML =
   group('Experiencia','4 items · 25 viñetas',exps,20,'exp')
  +group('Skills','23 items',sk,16,'sk')
  +group('Proyectos','6 items — un CV no es un volcado de GitHub: elige',pj,6,'pj')
  +group('Certificaciones','3 items',ct,1,'ct');
/* escalonado al poblarse: 40ms entre hermanos, tope 24, el resto de golpe */
M.stagger(g,{step:40,cap:24,items:g.querySelectorAll('.stg-card,.stg-dup,.stg-sk,.stg-g .stg-gh')});
M.boot();
```
`CorpusMotion.stagger` con `step:40` (no el 80 por defecto) y `cap:24`. `boot()` dibuja los
`hr.c-divider` y los `[data-reveal]` estáticos.

### 6.3 · `refresh()` — contadores

```js
const pend=S.total-S.acc-S.dis;
M.counter($('#nPend'),pend,{dur:300});M.counter($('#nAcc'),S.acc,{dur:300});M.counter($('#nDis'),S.dis,{dur:300});
$('#barOk').style.width=(S.acc/S.total*100)+'%';
$('#barOut').style.width=(S.dis/S.total*100)+'%';
```
`counter` anima **hacia un número real** (nunca hacia un destino inventado) y con
`prefers-reduced-motion` escribe el valor directo. Si `pend===0` → oculta `#groups`, `#dupq`,
`.stg-lead`, escribe `#emptyAcc = S.acc` y muestra `#empty` con `M.enter()`.

### 6.4 · `resolve(unit, kind)` — aceptar / descartar, con deshacer

- Guardas: si ya tiene `data-done`, no hace nada. Marca `unit.dataset.done = kind`.
- Incrementa `S.acc` o `S.dis`.
- Toma el label de `.tx, .nm, .tt` y lo **trunca a 72 caracteres**.
- Cierra y oculta el `.stg-frag` y el `.stg-ask` asociados.
- `.stg-sk` → no se reemplaza: gana `.done` y su `.ev` pasa a "✓ al master" / "× descartado" +
  botón `deshacer` (`data-a="undo-sk"`).
- El resto → `unit.replaceWith(row)` con la `.stg-donerow`, cuyo botón `deshacer` restaura la
  unidad (`row.replaceWith(unit)`), borra `data-done`, decrementa el contador y devuelve la
  visibilidad al `.stg-frag` y al `.stg-ask`.
- `renderSkEv(unit)` restaura el `.ev` original de una skill/proyecto/cert tras deshacer,
  leyendo de `DATA` con `kind = id.slice(0,2)` e `i = +id.slice(2)`.

### 6.5 · Delegación de clicks — `document.addEventListener('click', …)` sobre `[data-a]`

| `data-a` | Efecto |
|---|---|
| `orig` | Alterna `.open` en el `.stg-frag` del item y cambia el label del botón: `origen ▾` ⇄ `origen ▴` |
| `acc` | `resolve(unit,'acc')` |
| `dis` | `resolve(unit,'dis')` |
| `undo-sk` | Deshace una skill/proyecto/cert resuelta, decrementa contador y llama a `renderSkEv` |
| `edit` | `contentEditable='true'` sobre `.tx/.nm/.tt` + `focus()`. Al `blur` (once) vuelve a `false` y, la primera vez, inserta tras el badge `<span class="stg-src" …>editado por ti</span>` y marca `data-edited="1"`. `Enter` hace `preventDefault()` + `blur()` |
| `saveask` | Si el input tiene texto: reemplaza el `.stg-ask` por la confirmación, **promueve el item a `ver='ok'`** (`data-ver="ok"`, badge → `c-ver c-ver--ok` / "verificado") y quita `.miss` del fragmento |
| `dtoggle` | Alterna `.open` en `#merge`, quita/pone `hidden` en `#mfoot` y cambia el label `.tog` |
| `batch` | `batch(b.dataset.g)` |
| `showacc` | Alterna la visibilidad de las `.stg-donerow[data-batch]` del grupo |

> El `contentEditable` dispara el `focusin` del sistema → `CorpusAurora.pause('focus')`. Aquí es
> inocuo (no hay aurora), pero el `focusin/focusout` del sistema sigue activo.

### 6.6 · Fusión de duplicados

- Segundo listener delegado sobre `[data-pick]`: `picks[campo] = 'a'|'b'`, actualiza
  `aria-pressed` entre los hermanos del `.stg-mrow`, y habilita `#btnMerge` **solo** cuando
  `picks.cargo && picks.fechas && picks.vin`.
- `#btnMerge` (listener sobre `#groups`, filtrando `e.target.id!=='btnMerge'`):
  construye el item fusionado
  ```js
  const merged={id:'e2',tt:picks.cargo==='a'?d.a.cargo:d.b.cargo,
    org:'Rayén Retail · '+(picks.fechas==='a'?d.a.fechas:'2020 – 2022 (de tu texto)'),
    ver:'ok',src:picks.cargo==='a'?'cv':'tx',
    frag:'Fusionado por ti desde <mark>CV_2023.pdf</mark> y <mark>texto pegado</mark>. Ambos originales quedan citados.',
    bullets:d.bullets};
  ```
  reemplaza `[data-card="e2"]` por `expCard(merged)`, reescribe `#dupq` y anima con `M.enter()`.
  **Las 7 viñetas se conservan íntegras** — ninguna se pierde en la fusión.

### 6.7 · Lotes responsables — `batch(gid)`

```js
const targets=[...g.querySelectorAll('.stg-unit[data-ver="ok"]:not([data-done])')];
```
**SOLO** `data-ver="ok"`. Cada aceptada: las `.stg-sk` se ocultan (`display:none`); las demás dejan
su `.stg-donerow` marcada `data-batch="1"` y oculta (se ven pulsando `.accd`). Al terminar, el
`.accd` del grupo se revela con `✓ N aceptados — ver` y **el foco de teclado salta al primer
`[data-ver="none"]`** (`focusFirst('[data-ver="none"]')`) — el gesto que resume la pantalla: el lote
te deja delante de lo que necesita tus ojos.

`#btnBatchAll.onclick` → `['exp','sk','pj','ct'].forEach(batch)`, luego el botón cambia a
`"Verificados aceptados ✓ — quedan los que piden tu ojo"` y se deshabilita.

### 6.8 · Filtros

Los 4 botones `.stg-filter` alternan `aria-pressed`, muestran/ocultan cada `.stg-unit` según
`u.dataset.ver === f` (o `all`), cierran los `.stg-frag` de lo oculto, y luego ocultan las
`.c-card.stg-card` / `.stg-dup` que se quedaron sin ninguna unidad visible.

### 6.9 · Teclado — j / k / a / d / o

```js
let kbi=-1;
function kbList(){return $$('.stg-unit[data-kb]:not([data-done])').filter(u=>u.offsetParent)}
```
`kbFocus(i)` hace clamp del índice, limpia `.kb-focus` de todos y lo aplica al nuevo. **Scroll
manual calculado — nunca `scrollIntoView`** (regla explícita del handoff):
```js
const r=u.getBoundingClientRect();
if(r.top<150||r.bottom>innerHeight-80)window.scrollTo({top:r.top+window.scrollY-innerHeight/2.6});
```
`keydown` en `document`, con guarda:
```js
if(e.target.matches('input,textarea,[contenteditable="true"]'))return;
```
- `j` → `kbFocus(kbi+1)`
- `k` → `kbFocus(kbi-1)`
- `a` → `resolve(u,'acc')` + `kbFocus(kbi)` (el índice se queda donde estaba → cae en la siguiente)
- `d` → `resolve(u,'dis')` + `kbFocus(kbi)`
- `o` → alterna `.open` del `.stg-frag`

### 6.10 · APIs del sistema usadas

| API | Dónde | Parámetros |
|---|---|---|
| `CorpusMotion.stagger` | `render()` | `{step:40, cap:24, items: NodeList}` |
| `CorpusMotion.boot` | `render()` | — |
| `CorpusMotion.counter` | `refresh()` × 3 | `{dur:300}` — siempre hacia un número real |
| `CorpusMotion.enter` | `#empty` y tarjeta fusionada | C2 · 360 ms |
| `CorpusAurora.*` | **ninguna** | La pantalla no monta ni toca la aurora |

No se usa: `reveal`, `io`, `words`, `chars`, `shimmer`, `xray`.

---

## 7 · Copy (verbatim, ES)

### En `06-handoff/copy.md` § Staging (copiado literal o casi)

| UI | Texto | Estado vs copy.md |
|---|---|---|
| `.stg-lead p` | «Nada de esto está en tu master todavía. Cada item cita su origen — **ábrelo** antes de aceptar lo que no te suene. Los lotes solo tocan lo **verificado**: lo demás pasa por tus ojos, uno a uno.» | **literal** |
| `#btnBatchAll` | «Aceptar todo lo verificado (43)» | **literal** |
| `#btnBatchAll` tras el lote | «Verificados aceptados ✓ — quedan los que piden tu ojo» | **literal** |
| badges `.c-ver` | «verificado» / «parcial» / «sin evidencia» | **literal** |
| `#dupq` | «**3 posibles duplicados** — el mismo hecho, redactado distinto en dos fuentes. La fusión la decides tú, campo por campo.» | **literal** |
| `.stg-mfoot .note` | «La fusión la decides tú — nunca automática. Las viñetas no elegidas no se pierden: quedan abajo, cada una con su revisión.» | **literal** |
| `#empty` | «Staging limpio.» / «52 items entraron a tu master, cada uno con su origen. Lo descartado no se borra: queda en la papelera de la ingesta por 30 días.» | **literal** (partido en `h2` + `p`) |
| frag de b10 | «El CV dice «mejoré el rendimiento del checkout» — **el 15% no aparece en ninguna fuente**. Una cifra sin origen es exactamente lo que este producto no hace.» | **literal** (el ejemplo canónico) |
| `.stg-ask` de b3 | «¿De dónde salen las 4 horas y los 20 minutos?» | **literal** |
| placeholder de `.stg-ask input` | «Escríbelo aquí y quedará como origen: tú (el más verificable de todos)» | **literal** (copy.md lo trae en una sola frase junto a la pregunta) |
| confirmación `saveask` | «✓ guardado como origen manual» + «— lo escribiste tú: el origen más verificable de todos.» | ⚠ **variante**: copy.md dice «— lo escribiste tú: **el más verificable de todos.**» (sin la palabra "origen"). Elegir uno y unificar. |

### NO están en copy.md (nacen en el HTML — hay que respetarlos igual)

- Header: «Corpus» · «INGESTA · PASO 2 DE 2 — REVISIÓN» · «ES» / «EN» · «DG»
- `<title>`: «Corpus — Staging · 61 items esperan tu decisión»
- `.stg-title`: «Staging»
- `.stg-nums`: «pendientes» · «al master» · «descartados»
- Filtros: «todos» · «● verificado» · «◐ parcial» · «⚠ sin evidencia»
- `#dupq` enlace: «resolver →»
- Títulos de grupo (`t-overline`): «Experiencia» · «Skills» · «Proyectos» · «Certificaciones»
- Contadores de grupo: «4 items · 25 viñetas» · «23 items» · «6 items — un CV no es un volcado de GitHub: elige» · «3 items»
- Botones de lote por grupo: «aceptar 20 verificados ✓» · «aceptar 16 verificados ✓» · «aceptar 6 verificados ✓» · «aceptar 1 verificados ✓»
- `.accd`: «✓ N aceptados — ver»
- Acciones por item: «✓ aceptar» · «editar» · «× descartar» · «origen ▾» / «origen ▴»
- Badge de edición: «editado por ti»
- Sufijo del fragmento sin respaldo: «— la cifra no tiene respaldo»
- Duplicado: «Rayén Retail — Backend, equipo Checkout» · «aparece en texto pegado y en CV_2023.pdf, redactado distinto» · «resolver campo por campo ▾» / «cerrar ▴» · cabeceras «cargo» / «fechas» / «viñetas» · marca `::after` «esta» · «Crear item fusionado»
- Tras fusionar: «**1 duplicado resuelto por ti.** Quedan 2 menores (PostgreSQL/Postgres · reservas-club en dos fuentes) — están marcados en sus grupos.»
- `.stg-donerow`: «al master · …» · «descartado · …» · «deshacer»
- `.stg-sk` resuelta: «✓ al master» · «× descartado» · «deshacer»
- `.stg-kbd`: «**j/k** moverse» · «**a** aceptar» · «**d** descartar» · «**o** origen» · «**deshacer** con clic»
- `#empty`: «Ver el master →» · «Siguiente paso razonable: crear tu primera variante para un aviso concreto.»
- Panel demo: «demo» · «cargando» · «lleno» · «duplicado» · «sin evidencia» · «avanzado» · «vacío»
- Todos los textos de items y fragmentos de `DATA` (§9) — no están en copy.md; son el mock canónico.

---

## 8 · Accesibilidad

**Roles y aria explícitos en el markup:**
- `.stg-filter` → `role="group"` + `aria-label="Filtrar por verificación"`; cada botón con
  `aria-pressed="true|false"` (uno solo en `true`).
- `.demo` → `role="group"` + `aria-label="Estados de la pantalla (revisión de diseño)"`;
  botones con `aria-pressed`.
- `.stg-bar` → `aria-hidden="true"` (barra puramente decorativa: la información está en las cifras).
- `.stg-kbd` → `aria-hidden="true"` (recordatorio visual; los atajos siguen funcionando).
- `.stg-mrow > button` → `aria-pressed` para la elección de campo en la fusión; el estado también se
  comunica con texto (`::after content:"esta"`) y con el hairline de pátina — **nunca solo color**.
- `#btnMerge` → `disabled` hasta que los 3 campos están elegidos.
- `#mfoot` → `hidden` hasta abrir el merge.
- `.accd` → `hidden` hasta que hay un lote aceptado.

**Verificación sin depender del color** (regla no negociable #5 del handoff):
`.c-ver--ok::before "●"` · `.c-ver--partial::before "◐"` · `.c-ver--none::before "⚠"` + la palabra
(«verificado» / «parcial» / «sin evidencia») + el borde punteado/anillo rojo en los "sin evidencia".

**Foco:** `:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}` del sistema.
Orden natural del DOM: header → subcabecera (contadores, filtros) → lead + botón de lote → aviso de
duplicados → grupos (cabecera del grupo, luego item por item: badge, `origen`, acciones) → `#empty`
→ barra de teclado → panel demo. **El foco de teclado propio (`.kb-focus`) es un canal paralelo al
`:focus-visible` del navegador** — no mueve el foco real del DOM (riesgo, ver §Riesgos).

**Atajos de teclado** (`document.keydown`, ignorados dentro de `input`, `textarea` y
`[contenteditable="true"]`):

| Tecla | Acción |
|---|---|
| `j` | siguiente unidad |
| `k` | unidad anterior |
| `a` | aceptar la unidad enfocada |
| `d` | descartar la unidad enfocada |
| `o` | abrir/cerrar el origen (fragmento) |

**Hit targets:** los botones de `.stg-acts` son de 5–8 px de padding con texto micro (≈ 24–26 px de
alto): **por debajo de los 44 px que exige el handoff en móvil**. Además `.stg-acts{opacity:0}` hasta
`:hover`/`.kb-focus` — en táctil no hay hover, así que **las acciones son prácticamente inalcanzables
en móvil**. `.stg-kbd` sí se oculta a ≤768px. **Esto hay que resolverlo al implementar** (ver Riesgos).

**Sin live region:** los contadores (`#nPend`, `#nAcc`, `#nDis`) cambian sin `aria-live`; el
lector de pantalla no anuncia "aceptado / descartado". Añadir un `aria-live="polite"` en la zona de
`.stg-nums` o un status oculto es una mejora obligada, no opcional.

---

## 9 · Datos del mock

Persona: **Diego Gatica** (ficticio; avatar «DG»). Coherente con `datos-ejemplo.json` y el resto de
pantallas.

**Fuentes (`SRC`):**
`tx` → `texto pegado` · `gh` → `github.com/dgatica` · `web` → `dgatica.cl` ·
`cv` → `CV_2023.pdf` · `q` → `cuestionario-identidad.md`

**Experiencia (4 items · 25 viñetas):**

| id | Cargo | Organización | ver |
|---|---|---|---|
| `e1` | Backend Developer | Altiplano Pagos · mar 2022 – hoy | ok (`tx`) |
| `e2` | *(duplicado)* Rayén Retail — Backend, equipo Checkout | CV: 2020-01 – 2022-02 / texto: «dos años, hasta 2022» | — |
| `e3` | Desarrollador freelance | Independiente · 2019 – 2020 | ok (`q`) |
| `e4` | Práctica profesional — Área TI | Universidad Andrés Bello · 2018 – 2019 | ok (`cv`) |

- `e1` · b1–b8: conciliación de pagos en Go (~40.000 tx/día), 3 procesadores (parcial),
  4 h → 20 min (**sin evidencia**), `idempotency-go`, GitHub Actions, on-call 1 sem/mes,
  OpenAPI, mentoría a 2 juniors.
- `e2` (dup) · b9–b15: APIs del checkout (Node.js, PostgreSQL), **15 %** (**sin evidencia** — el
  ejemplo canónico), migración a microservicios (parcial), cyber days, cupones, reportes de venta,
  coordinación con fraude (parcial).
- `e3` · b16–b20: 4 pymes, Reservas Club (Django), e-commerce de **1.200 productos**
  (**sin evidencia**), hosting/dominios, facturación.
- `e4` · b21–b25: matrícula peak, scripts de migración (Python), dashboard de tickets (parcial),
  documentación, **≈30 tickets/semana** (**sin evidencia**).

**Duplicado (`DATA.dup`):** ancla `#dup-rayen`. Lado A = `CV_2023.pdf`
(«Desarrollador de Software», «enero 2020 – febrero 2022»), lado B = `texto pegado`
(«Backend developer, equipo de checkout», «"dos años, hasta 2022"»).

**Skills (23):** Go · Python · SQL · PostgreSQL · Node.js · TypeScript · Docker · GitHub Actions ·
Django · gRPC · Redis · OpenAPI · Git · Linux · Bash · Inglés B2 *(16 ok)* — Kubernetes · AWS ·
Grafana · Scrum *(4 parciales)* — Kafka · Microservicios · Liderazgo técnico *(3 sin evidencia)*.
Kafka y Kubernetes son los canónicos del brief (reaparecen en tailor.html y master.html).

**Proyectos (6, todos ok):** `pago-conciliador` (Go, 412 KB) · `idempotency-go` (Go, 214 KB, 41
commits) · `reservas-club` (Django) · `dgatica.cl` (Next.js, 6 proyectos) · `scraper-sii` (Python,
67 KB) · `dotfiles`.

**Certificaciones (3):** Diplomado en Ingeniería de Datos — PUC (2022) *(ok)* · Inglés B2
*(parcial)* · AWS Certified Cloud Practitioner *(sin evidencia)*.

**Totales del estado:** `S.total = 61` · lote total = 43 verificados · estado "vacío" = 52 al master
+ 9 descartados (= 61 ✓, coherente con copy.md e ingesta.html).

---

## 10 · Números en la UI

| Número | Dónde | Origen |
|---|---|---|
| **61** | `<title>`, `#nPend` | `S.total` (constante) — 4 exp + 25 viñetas + 23 skills + 6 proyectos + 3 certs |
| **0 / 0** | `#nAcc`, `#nDis` | Estado real, animado con `M.counter` hacia el valor real |
| **43** | chip `#fOk`, `#btnBatchAll` | **Hardcodeado en el HTML.** El recuento real de `data-ver="ok"` en `DATA` también da 43 ✓ |
| **8** | chip `#fPa` («parcial») | **Hardcodeado. NO cuadra con los datos: hay 9 parciales.** Ver contradicción abajo |
| **9** | chip `#fNo` («sin evidencia») | **Hardcodeado. NO cuadra: hay 8 sin evidencia.** Ver contradicción abajo |
| **3** | `#dupq` («3 posibles duplicados») | Solo **1** duplicado está modelado (`e2`); los otros 2 se nombran en el texto post-fusión pero no existen en el DOM |
| **20 / 16 / 6 / 1** | botones `.batch` de cada grupo | Literales en `render()`; coinciden con el recuento real de `ok` por grupo ✓ (20+16+6+1 = 43 ✓) |
| **4 items · 25 viñetas / 23 / 6 / 3** | `.stg-gh .cnt` | Literales; coinciden con `DATA` ✓ |
| **52** | `#emptyAcc` y estado demo `vacio` | Literal del copy («52 items entraron a tu master») |
| **30 días** | `#empty` | Literal del copy (papelera de la ingesta) |
| **2** | demo `avanzado`: `S.dis=2` | **Inventado para la demo** — no corresponde a ningún descarte real. Es panel demo, no producto |
| **1 duplicado / 2 menores** | `#dupq` tras fusionar | Literal, no derivado |
| Cifras dentro de los items | `.stg-b .tx`, `.stg-sk .ev` | Cada una **cita su fragmento**: ~40.000 tx/día, 412/214/188/96/67 KB, 41 commits, 3–5 repos, 6 años… y las 4 sin respaldo (15 %, 4 h→20 min, 1.200, ≈30) marcadas explícitamente como **sin evidencia** con su explicación |

**Lo que el producto prohíbe y aquí NO aparece (correcto):** ningún score, ningún % de match,
ninguna "confianza" del LLM, ningún umbral inventado. El único `%` visible en todo el archivo es el
**15 % de b10 — y está ahí precisamente como el ejemplo de lo que este producto no hace** (badge
`sin evidencia` + fragmento que lo explica).

**Zona gris — la `.stg-bar`:** `width` en `%` calculado sobre `S.acc/S.total` y `S.dis/S.total`. Es
una proporción de progreso real (aceptados/descartados sobre el total), **nunca se rotula con un
número**, y está `aria-hidden="true"`. No viola la regla («el progreso jamás muestra %») porque no
hay % visible, pero es el único elemento que se le parece: mantenerlo mudo y aria-hidden.

**Contradicción que hay que resolver antes de implementar:**
El recuento real de `DATA` es **43 ok / 9 parcial / 8 sin evidencia** (total 60 unidades
resolvables). Los chips del filtro dicen **43 / 8 / 9**, y `handoff.md` + `copy.md` (ingesta) también
fijan «43/8/9» y «9 sin evidencia». O bien los chips están mal, o bien están mal los `ver` de dos
items del mock. **Al portar, derivar los tres contadores de los datos (`useMemo` sobre el array), no
hardcodearlos** — un número sin fuente en la UI es exactamente lo que este producto prohíbe.
