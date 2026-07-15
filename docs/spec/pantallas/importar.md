# Pantalla · importar.html

> **Fuente literal:** `Corpus_ diseño completo/corpus-design/04-pantallas/importar.html` (1224 líneas).
> El HTML es la REFERENCIA VISUAL LITERAL. Los nombres de clase NO CAMBIAN: son el contrato diseño↔código.
> Los bloques `<style data-corpus-system="css">` (líneas 10–486) y `<script data-corpus-system="js">`
> (líneas 732–1003) son copia del sistema canónico (`02-sistema/*`) y **no** se transcriben aquí.
> Esta spec cubre SOLO lo específico de la pantalla.

---

## 1 · Ruta y propósito

- **Ruta del producto:** `/app/importar` ★★ (handoff.md, tabla "Qué es cada cosa")
- **`<title>`:** `Corpus — Vuélcalo · Importar`
- **`<html lang="es" data-theme="dark">`**

**Qué hace:** es la puerta B del onboarding ("Volcarlo"). El usuario pega texto suelto / arrastra archivos
(CV viejo, cuestionario `.md`, capturas, certificados); la pantalla detecta links en el texto en vivo, avisa
con dignidad de que LinkedIn no es legible desde fuera, y lanza la ingesta con extracción **citando evidencia**.
Termina entregando un recuento real de items que esperan revisión en staging. Nada entra al master sin confirmación.

La pantalla contiene **tres estados-página** (tres `<main>`, uno visible a la vez): volcado → ingesta → fin.

---

## 2 · Ventana o muro · Aurora

**Sí monta la aurora.** Línea 1008, primera instrucción del script de pantalla:

```js
const $=s=>document.querySelector(s), M=window.CorpusMotion, A=window.CorpusAurora;
A.mount({state:'calm'});
```

- **Estado inicial:** `'calm'`.
- **`A.setState('active')`** al arrancar `runIngest()` (línea 1136) — "la máquina está pensando".
- **`A.setState('calm')`** al terminar la ingesta, antes de pasar a `fin` (línea 1184); también en
  `setState(name)` siempre que el estado no sea `stIngest` (línea 1199), y en el botón demo `fin` (1217).
- **No hay `<div class="c-aurora">` en el HTML.** `aurora.js` lo crea y lo hace `document.body.prepend()`
  con `aria-hidden="true"` si no existe. En React: no montar el div a mano, dejar que la API lo cree
  (o crearlo con exactamente esa clase y ese aria-hidden).
- `motion.js` ya cablea la **pausa de la aurora al enfocar cualquier campo** (`focusin`/`focusout`).
  Aquí es crítico: la caja de volcado es un `<textarea>` — al escribir, el fondo se detiene.

**Gramática ventana/muro en esta pantalla:**

| Selector | Clase de capa | Notas |
|---|---|---|
| `<main id="stIdle" class="imp-main c-window">` | **`.c-window`** (S) | ventana: fondo transparente, la aurora asoma |
| `<main id="stIngest" class="imp-main c-window">` | **`.c-window`** (S) | ventana con aurora **activa** |
| `<main id="stDone" class="imp-main c-window">` | **`.c-window`** (S) | ventana; el shimmer vive en el panel |
| `<div id="dropzone" class="c-panel imp-box">` | **`.c-panel`** (S) | vidrio ahumado sobre la ventana |
| `<div id="log" class="c-panel ing-log">` | **`.c-panel`** (S) | log de la ingesta |
| `<div id="finPanel" class="c-panel fin-panel">` | **`.c-panel`** (S) | recibe EL shimmer |
| `<div id="liPanel" class="c-card imp-li">` | **`.c-card`** (S) | opaco: guía de LinkedIn (no es panel de vidrio) |
| `<header class="c-header">` | (S) | sticky 64px, ya en el sistema |

**No hay `.c-wall`, `.c-wall--surface`, `.c-scrim` ni `.c-scrim--*` en esta pantalla.**
Coherente con la regla: *"donde hay trabajo, el trabajo gana"* — pero aquí el trabajo (leer texto) vive dentro
de `.c-panel`, que es el vidrio ahumado; el `<main>` sigue siendo ventana. Los muros ni montan la aurora;
importar sí la monta porque es una de las **ventanas** listadas en handoff.md §APIs
("auth, onboarding, importar, ingesta, dashboard vacío").

---

## 3 · Esqueleto DOM

Leyenda: **(S)** clase del sistema (`c-*`, `t-*`, `hd-*` del bloque canónico) · **(P)** clase propia de la pantalla.
Nota: `hd-crumb`, `hd-sep`, `hd-step` usan prefijo de sistema pero **están definidas en el `<style>` propio** → (P).
`hd-right`, `hd-lang`, `hd-av` se **redefinen** en el `<style>` propio (duplicado idéntico/casi idéntico del sistema).

```
body
└── div.c-page                                                            (S)
    ├── header.c-header                                                   (S)
    │   └── div.c-container                                               (S)
    │       ├── div.hd-crumb                                              (P)
    │       │   ├── a.c-logo[href="dashboard.html"]  "Corpus"             (S)
    │       │   ├── span.hd-sep                                           (P)
    │       │   └── span.hd-step#hdStep  "VOLCADO · PASO 1 DE 2"          (P)  ← el JS lo reescribe por estado
    │       └── div.hd-right                                              (S/P, redefinida)
    │           ├── div.hd-lang[aria-label="Idioma"]                      (S/P, redefinida)
    │           │   ├── span[data-on] "ES"
    │           │   └── span "EN"
    │           └── div.hd-av  "DG"                                       (S/P, redefinida)
    │
    ├── main.imp-main.c-window#stIdle[data-screen-label="importar-volcado"]        (P + S)
    │   └── div.imp-col                                                   (P)
    │       ├── span.t-overline#ov  "Nada entra al master sin tu confirmación"     (S)   ← M.chars()
    │       ├── h1.imp-h1#h1  "No escribas tu perfil. <em>Vuélcalo.</em>"          (P)   ← M.words()
    │       ├── p.imp-sub[data-reveal][style="--d:520ms"]                          (P)
    │       │
    │       ├── div.c-panel.imp-box#dropzone[data-reveal][style="--d:640ms"]       (S + P)
    │       │   │   (+ .is-drag durante dragenter/dragover)                        (P)
    │       │   ├── textarea.imp-ta#ta[spellcheck="false"][aria-label="Pega aquí lo que tengas"][placeholder=…] (P)
    │       │   ├── div.imp-detect#detect          (+ .has cuando hay links)       (P)
    │       │   │   ├── span.t-overline  "Fuentes detectadas en tu texto"          (S)
    │       │   │   └── div.imp-chips#chips                                        (P)
    │       │   │       └── span.c-chip[.c-chip--ok]  ×N   (inyectados por JS)     (S)
    │       │   │           ├── span.dot                                           (S)
    │       │   │           ├── b            → host+path (truncado a 32 chars)
    │       │   │           └── span         → "· " + nota
    │       │   ├── div.imp-files#files            (+ .has cuando hay archivos)    (P)
    │       │   │   └── div.imp-file  ×N   (inyectados por JS)                     (P)
    │       │   │       ├── span.nm      → nombre del archivo                      (P)
    │       │   │       ├── span.sz      → tamaño formateado                       (P)
    │       │   │       ├── span.tag     → etiqueta por extensión                  (P)
    │       │   │       └── button.rm[aria-label="Quitar"]  "×"                    (P)
    │       │   ├── div.imp-drop#drop[role="button"][tabindex="0"]                 (P)
    │       │   │   └── <b>arrastra archivos aquí</b> — o haz clic para elegir<br>…
    │       │   ├── input#fileIn[type=file][multiple][hidden]
    │       │   └── div.imp-meta                                                   (P)
    │       │       ├── span#taMeta  "0 palabras"                                  (P)
    │       │       └── span.acts                                                  (P)
    │       │           ├── button#btnSample  "usar texto de ejemplo"
    │       │           └── button#btnClear[hidden]  "limpiar"
    │       │
    │       ├── div.c-card.imp-li#liPanel[hidden][data-screen-label="importar-linkedin"]  (S + P)
    │       │   ├── h3   "LinkedIn no permite que un servicio lea tu perfil desde fuera."
    │       │   ├── p    "Está detrás de tu sesión y bloquea lectores automáticos…"
    │       │   └── ol
    │       │       └── li ×3
    │       │           ├── span.n  "01" / "02" / "03"                             (P)
    │       │           ├── span.h  título de la vía                               (P)
    │       │           └── span.d  detalle (con span.c-kbd para Ctrl/A/C)         (P + S)
    │       │
    │       ├── div.imp-cta[data-reveal][style="--d:760ms"]                        (P)
    │       │   ├── span.c-forge                                                   (S)
    │       │   │   └── button.c-btn.c-btn--forge.c-btn--hero#btnGo[disabled]      (S)
    │       │   │       "Extraer con evidencia"
    │       │   └── a.imp-alt[href="onboarding.html"]  "Prefiero escribirlo de cero →"  (P)
    │       │
    │       └── p.imp-note[data-reveal][style="--d:880ms"]                         (P)
    │           ├── span.c-divider[style="--d:900ms"]                              (S)
    │           └── "La IA no inventa: cada dato citará el fragmento del que salió. …"
    │
    ├── main.imp-main.c-window#stIngest[hidden][data-screen-label="importar-ingesta"]   (P + S)
    │   └── div.ing-col                                                            (P)
    │       ├── span.t-overline  "Leyendo tus fuentes"                             (S)
    │       ├── div.ing-count#count  "0"                                           (P)  ← M.counter()
    │       ├── div.ing-cap  "items encontrados hasta ahora"                       (P)
    │       ├── div.c-panel.ing-log#log                                            (S + P)
    │       │   └── div.ing-row[.is-run|.is-ok|.is-err]  ×N  (inyectadas por JS)   (P)
    │       │       ├── span.st   → <span class="c-spin">⟳</span> | "✓" | "✕"      (P + S)
    │       │       ├── span.src  → nombre de la fuente                            (P)
    │       │       ├── span.det  → detalle del resultado                          (P)
    │       │       └── div.ing-err-acts   (solo en is-err)                        (P)
    │       │           ├── button  "Continuar sin la página 2"
    │       │           └── button  "Reintentar"
    │       └── p.ing-hint  "Esto toma entre 5 y 40 segundos…"                     (P)
    │
    └── main.imp-main.c-window#stDone[hidden][data-screen-label="importar-fin"]    (P + S)
        └── div.fin-col                                                            (P)
            ├── span.t-overline  "Extracción completa"                             (S)
            ├── h2[style="margin-top:18px"]  "Listo. Ahora, tu turno."             (S, h2 base)
            ├── div.c-panel.fin-panel#finPanel                                     (S + P)  ← EL shimmer
            │   ├── div.fin-head                                                   (P)
            │   │   ├── span.n#finCount  "61"                                      (P)
            │   │   └── span.l  "items esperan tu revisión"                        (P)
            │   ├── div.fin-grid                                                   (P)
            │   │   └── div.fin-cell ×6                                            (P)
            │   │       ├── div.v  → cifra
            │   │       └── div.k  → etiqueta
            │   └── div.fin-noev                                                   (P)
            │       ├── span.c-ver.c-ver--none  "9 sin evidencia"                  (S)
            │       └── span  "quedan marcados — la revisión te los pondrá delante, no debajo."
            └── div.fin-cta                                                        (P)
                ├── span.c-forge                                                   (S)
                │   └── a.c-btn.c-btn--forge.c-btn--hero[href="staging.html"]      (S)
                │       "Revisar en staging →"
                └── span.fin-sub  "Nada entra al master sin tu confirmación."      (P)

div.demo[role="group"][aria-label="Estados de la pantalla (revisión de diseño)"]   (S — NO es producto)
├── span  "demo"
└── button[data-st] ×6 : vacio · deteccion · linkedin · ingesta · error · fin
```

**Atributos `data-*` presentes:**
`data-theme="dark"` (html) · `data-screen-label` (los 3 `<main>` + `#liPanel`) · `data-reveal` (imp-sub,
dropzone, imp-cta, imp-note; `motion.js` lo añade a las `.ing-row` y a los hijos de `stagger`) ·
`data-on` (idioma activo) · `data-st` (botones del demo) · `data-visible` (lo pone `CorpusMotion.show`) ·
`data-mode` (solo lo usa `xray`, **no** en esta pantalla) · `data-corpus-system` (los dos bloques del sistema).
Variable inline `--d` para el escalonado de los reveals.

---

## 4 · CSS específico de pantalla

VERBATIM, el `<style>` sin `data-corpus-system` (líneas 487–596). **No define ningún `@keyframes` propio**:
todo el movimiento reutiliza los del sistema (`cWordIn`, `cCharIn`, `cEnter`, `cShimmer`, `cSpin`, `cPulse`, `cSkel`).

```css
/* ── importar.html — estilos propios de la pantalla ── */
.imp-main{flex:1;display:flex;flex-direction:column;align-items:center;padding:64px var(--container-pad) 96px}
.imp-col{width:100%;max-width:760px;display:flex;flex-direction:column;align-items:center;text-align:center}
.imp-col>.t-overline{margin-bottom:22px}
.imp-h1{font-size:var(--fs-hero);max-width:15ch}
.imp-h1 em{font-style:italic}
.imp-sub{max-width:52ch;margin-top:18px;color:var(--text-muted);font-size:var(--fs-lead);line-height:1.65}
.imp-box{width:100%;margin-top:40px;text-align:left;overflow:hidden}
.imp-box.is-drag{border-color:var(--border-patina);box-shadow:0 0 0 3px color-mix(in srgb,var(--patina-300) 14%,transparent),var(--shadow-2)}
.imp-ta{display:block;width:100%;background:transparent;border:0;resize:none;color:var(--text);
  font:400 15px/1.7 var(--font-sans);padding:26px 28px 14px;min-height:240px;max-height:50vh;overflow:auto}
.imp-ta:focus{outline:none}
.imp-ta::placeholder{color:var(--text-subtle);opacity:.85}
.imp-meta{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 28px 14px;
  font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)}
.imp-meta .acts{display:flex;gap:4px}
.imp-meta button{font:500 var(--fs-micro)/1 var(--font-mono);color:var(--text-muted);padding:6px 8px;border-radius:5px}
.imp-meta button:hover{color:var(--accent-text);background:var(--surface)}
.imp-detect{padding:0 28px 6px;display:none}
.imp-detect.has{display:block}
.imp-detect .t-overline{display:block;margin-bottom:10px;font-size:10px}
.imp-chips{display:flex;flex-wrap:wrap;gap:8px}
.imp-files{padding:0 28px 8px;display:none}
.imp-files.has{display:block}
.imp-file{display:flex;align-items:center;gap:12px;padding:9px 12px;margin-bottom:6px;
  background:var(--surface-sunken);border:1px solid var(--border);border-radius:var(--radius-sm);
  font:400 var(--fs-data)/1 var(--font-mono);color:var(--text)}
.imp-file .sz{color:var(--text-subtle)}
.imp-file .tag{margin-left:auto;color:var(--text-subtle);font-size:10px;letter-spacing:.08em;text-transform:uppercase}
.imp-file .rm{color:var(--text-subtle);padding:2px 6px;border-radius:4px;line-height:1}
.imp-file .rm:hover{color:var(--danger);background:var(--danger-quiet)}
.imp-drop{margin:0 28px 24px;padding:16px;border:1px dashed var(--border-strong);border-radius:var(--radius-sm);
  text-align:center;font:400 var(--fs-data)/1.6 var(--font-mono);color:var(--text-subtle);cursor:pointer;transition:border-color .14s,color .14s}
.imp-drop:hover{border-color:var(--border-patina);color:var(--text-muted)}
.imp-drop b{color:var(--text-muted);font-weight:500}
/* LinkedIn: el momento de honestidad. Guía, no error. */
.imp-li{width:100%;margin-top:14px;text-align:left;padding:22px 26px}
.imp-li h3{font-size:15px;margin-bottom:4px}
.imp-li>p{color:var(--text-muted);font-size:var(--fs-ui);max-width:58ch}
.imp-li ol{list-style:none;padding:0;margin:16px 0 0;display:flex;flex-direction:column}
.imp-li li{display:grid;grid-template-columns:28px 1fr;gap:2px 14px;padding:13px 0;border-top:1px solid var(--border)}
.imp-li li .n{grid-row:span 2;font:500 13px/1.4 var(--font-mono);color:var(--accent-text)}
.imp-li li .h{font:500 var(--fs-ui)/1.4 var(--font-sans);color:var(--text)}
.imp-li li .d{font:400 var(--fs-data)/1.6 var(--font-sans);color:var(--text-muted)}
.imp-li li .d .c-kbd{margin:0 1px}
.imp-cta{margin-top:40px;display:flex;flex-direction:column;align-items:center;gap:18px}
.imp-alt{font-size:var(--fs-ui)}
.imp-note{margin-top:46px;max-width:52ch;font:400 var(--fs-micro)/1.8 var(--font-mono);color:var(--text-subtle)}
.imp-note .c-divider{margin-bottom:18px}
/* ── Ingesta: la espera ── */
.ing-col{width:100%;max-width:600px;display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:34px}
.ing-count{margin-top:34px;font:500 76px/1 var(--font-mono);letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.ing-cap{margin-top:10px;color:var(--text-muted);font-size:var(--fs-ui)}
.ing-log{width:100%;margin-top:38px;text-align:left;padding:8px 0}
.ing-row{display:grid;grid-template-columns:34px 1fr auto;align-items:baseline;gap:0 10px;
  padding:11px 22px;font:400 var(--fs-data)/1.5 var(--font-mono)}
.ing-row+.ing-row{border-top:1px solid var(--border)}
.ing-row .st{text-align:center;color:var(--text-subtle)}
.ing-row.is-run .st{color:var(--accent-text)}
.ing-row.is-ok .st{color:var(--ver-ok)}
.ing-row.is-err .st{color:var(--ver-none)}
.ing-row .src{color:var(--text)}
.ing-row .det{color:var(--text-subtle);text-align:right}
.ing-row.is-err .det{color:var(--danger)}
.ing-err-acts{grid-column:2/4;display:flex;gap:8px;margin-top:8px}
.ing-err-acts button{font:500 var(--fs-micro)/1 var(--font-mono);padding:7px 10px;border:1px solid var(--border-strong);border-radius:5px;color:var(--text-muted)}
.ing-err-acts button:hover{color:var(--text);border-color:var(--border-patina)}
.ing-hint{margin-top:26px;font:400 var(--fs-micro)/1.7 var(--font-mono);color:var(--text-subtle)}
/* ── Fin: el único shimmer del producto ── */
.fin-col{width:100%;max-width:600px;display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:24px}
.fin-panel{width:100%;margin-top:36px;text-align:left;overflow:hidden}
.fin-head{display:flex;align-items:baseline;justify-content:space-between;padding:20px 24px 16px}
.fin-head .n{font:500 40px/1 var(--font-mono);letter-spacing:-.03em}
.fin-head .l{color:var(--text-muted);font-size:var(--fs-ui)}
.fin-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border-top:1px solid var(--border)}
.fin-cell{background:var(--surface);padding:14px 16px 16px}
.fin-cell .v{font:500 22px/1 var(--font-mono)}
.fin-cell .k{margin-top:6px;font:400 var(--fs-micro)/1.4 var(--font-sans);color:var(--text-muted)}
.fin-noev{display:flex;align-items:center;gap:10px;padding:14px 24px;border-top:1px dashed color-mix(in srgb,var(--danger) 45%,transparent);
  font:400 var(--fs-data)/1.5 var(--font-sans);color:var(--text-muted)}
.fin-cta{margin-top:36px;display:flex;flex-direction:column;align-items:center;gap:14px}
.fin-sub{font:400 var(--fs-data)/1.6 var(--font-mono);color:var(--text-subtle)}
/* header */
.hd-crumb{display:flex;align-items:center;gap:14px}
.hd-sep{width:1px;height:18px;background:var(--border-strong)}
.hd-step{font:500 var(--fs-micro)/1 var(--font-mono);letter-spacing:.14em;color:var(--text-muted)}
.hd-right{margin-left:auto;display:flex;align-items:center;gap:16px}
.hd-lang{display:flex;font:500 var(--fs-micro)/1 var(--font-mono);border:1px solid var(--border-strong);border-radius:5px;overflow:hidden}
.hd-lang span{padding:6px 8px;color:var(--text-subtle)}
.hd-lang span[data-on]{color:var(--text);background:var(--surface-elevated)}
.hd-av{width:28px;height:28px;border-radius:50%;background:var(--surface-elevated);border:1px solid var(--border-strong);
  display:grid;place-items:center;font:500 10px/1 var(--font-mono);color:var(--text-muted)}
@media (max-width:768px){
  .imp-h1{font-size:40px}
  .imp-main{padding-top:40px}
  .imp-ta{min-height:190px;padding:20px 20px 10px}
  .imp-meta,.imp-detect,.imp-files{padding-inline:20px}
  .imp-drop{margin-inline:20px}
  .fin-grid{grid-template-columns:repeat(2,1fr)}
  .ing-count{font-size:56px}
  .hd-step{display:none}
}
@media (max-width:480px){
  .imp-h1{font-size:32px}
  .imp-sub{font-size:var(--fs-body)}
  .ing-row{grid-template-columns:24px 1fr;padding:10px 14px}
  .ing-row .det{grid-column:2;text-align:left;margin-top:2px}
}
```

---

## 5 · Estados del panel demo

Los 6 del handoff: **vacío · detección · linkedin · ingesta · error · fin**.
Mapa `<main>` ↔ estado (línea 1189):

```js
const stEls={vacio:'stIdle',deteccion:'stIdle',linkedin:'stIdle',ingesta:'stIngest',error:'stIngest',fin:'stDone'};
```

| Estado | `<main>` visible | Qué cambia en el DOM | Cómo se activa |
|---|---|---|---|
| **vacío** | `#stIdle` | `ta.value=''`, `files=[]`, `#files` sin `.has`, `#detect` sin `.has`, `#btnClear[hidden]`, `#btnGo[disabled]`, `#liPanel[hidden]`, `#taMeta`="0 palabras", `#hdStep`="VOLCADO · PASO 1 DE 2" | demo `vacio` → llama `btnClear.onclick()` y `setState('vacio')`. Es el estado de carga inicial. |
| **detección** | `#stIdle` | `ta.value` = SAMPLE **sin la línea de LinkedIn**; `files` = `[cuestionario-identidad.md · 18 KB · "cuestionario · fuente de primera"]` y `[CV_2023.pdf · 412 KB · "pdf"]`; `#detect.has` con 2 chips (`github.com/dgatica` ok, `dgatica.cl` ok); `#files.has` con 2 `.imp-file`; `#btnClear` visible; `#btnGo` habilitado; `#liPanel` sigue oculto | demo `deteccion` |
| **linkedin** | `#stIdle` | `ta.value` = SAMPLE completo (incluye `linkedin.com/in/diego-gatica`); `files=[]`; 3 chips, el de LinkedIn **sin** `.c-chip--ok` (nota "· no legible desde fuera"); `#liPanel` se muestra con `M.enter()` (`.c-enter`, 360 ms) | demo `linkedin`, o **automáticamente** al escribir/pegar cualquier URL de linkedin.com en el textarea |
| **ingesta** | `#stIngest` | `#count`→0 y sube con `M.counter`; `#log` se llena de `.ing-row` (`.is-run` → `.is-ok`); aurora `active`; `#hdStep`="INGESTA · LEYENDO FUENTES" | demo `ingesta` (si el textarea está vacío dispara antes `#btnSample`), o el CTA **#btnGo** → `runIngest()` |
| **error** | `#stIngest` | Igual que ingesta pero `runIngest({fail:true})`: la fila del `.pdf` queda `.is-err` con detalle «la página 2 es una imagen escaneada: no hay texto que leer» y aparece `div.ing-err-acts` con dos botones. La promesa **se bloquea** hasta que el usuario elige uno | demo `error` (fuerza `files=[CV_2023.pdf · 412 KB · pdf]` si no hay archivos) |
| **fin** | `#stDone` | `#finCount`=61, la grilla de 6 celdas, la franja `.fin-noev`; **EL shimmer** sobre `#finPanel` vía `M.shimmer()` (doble rAF); aurora vuelta a `calm`; `#hdStep`="INGESTA · COMPLETA" | demo `fin` (directo) o al terminar `runIngest()` |

`#hdStep` es la única pieza del header que cambia por estado (línea 1195).

---

## 6 · Comportamiento JS de la pantalla

Todo dentro de una IIFE `(function(){ 'use strict'; … })()` (líneas 1004–1222). `M = CorpusMotion`, `A = CorpusAurora`.

### 6.1 Arranque (ceremonia de entrada)

```js
A.mount({state:'calm'});
M.chars($('#ov'));   // charReveal del overline
M.words($('#h1'));   // wordReveal del H1
M.boot();            // dibuja hairlines (.c-divider) y dispara los [data-reveal]
…
detect();            // última línea: primer cálculo de estado (deja btnGo disabled)
```

### 6.2 Estado local

```js
let files=[];      // {name,size,tag}
let liShown=false; // el panel de LinkedIn ya se mostró
```

### 6.3 Detección de links en vivo — `detect()`

- Regex: `const URL_RE=/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(\/[^\s,;)»"']*)?/gi;`
- Descarta hosts cuyo TLD no sea alfabético (`if(!/[a-z]{2,}$/.test(host.split('.').pop()))continue;`).
- Limpia puntuación final del path: `.replace(/[.,;)»"']+$/,'')`. Deduplica por `host+path` en un `Map`.
- `classify(host,path)`:
  - `github.com` → `{kind:'github', note:'API pública — se leerá sin IA', ok:true}`
  - `linkedin.com` → `{kind:'linkedin', note:'no legible desde fuera', ok:false}`
  - resto → `{kind:'web', note:'se leerá como portfolio', ok:true}`
- Renderiza chips: `class="c-chip"` + `" c-chip--ok"` si `ok`. Etiqueta truncada a **32 caracteres**
  (`>32 → slice(0,31)+'…'`). Estructura: `<span class="dot"></span><b>{label}</b><span>· {note}</span>`.
- `detectEl.classList.toggle('has', found.size>0)`.
- **Momento LinkedIn:** si hay un link linkedin y `!liShown` → `liShown=true; M.enter(liPanel)`. Si desaparece
  el link y estaba mostrado → `liShown=false; liPanel.hidden=true`.
- Actualiza `#taMeta`: `N.toLocaleString('es-CL')+' palabras'` + `' · N link(s) detectado(s)'` (plurales en el sufijo).
- `btnClear.hidden = !txt.length && !files.length`. Llama a `gate()`. Devuelve el `Map` de fuentes.

### 6.4 Puerta del CTA — `gate()`

```js
const ready=(ta.value.trim().length>=40)||files.length>0;
btnGo.disabled=!ready;
```
**≥ 40 caracteres** de texto o al menos un archivo. Sin eso, `Extraer con evidencia` está deshabilitado.

### 6.5 Archivos

- `tagFor(name)` por extensión: `.md` → `"cuestionario · fuente de primera"` · `.pdf` → `"pdf"` ·
  `.docx`/`.doc` → `"docx"` · `png|jpg|jpeg|webp` → `"captura · se transcribe literal"` · resto → la extensión.
- `fmtSize(b)`: `> 1.048.576` → `(b/1048576).toFixed(1)` con **coma decimal** (`.replace('.',',')`) + `" MB"`;
  si no `Math.max(1,Math.round(b/1024)) + " KB"`.
- `renderFiles()` reconstruye `#files` entero; cada `.rm` hace `files.splice(i,1); renderFiles(); gate()`.
- `addFiles(list)` empuja y re-renderiza.

### 6.6 Listeners

| Elemento | Evento | Efecto |
|---|---|---|
| `#ta` | `input` | `detect(); autosize()` |
| `#drop` | `click` | `fileIn.click()` |
| `#drop` | `keydown` | `Enter` o `Espacio` → `preventDefault()` + `fileIn.click()` |
| `#fileIn` | `change` | `addFiles(fileIn.files); fileIn.value=''` |
| `#dropzone` | `dragenter`, `dragover` | `preventDefault()` + `.is-drag` |
| `#dropzone` | `dragleave`, `drop` | `preventDefault()`; en `drop` → `addFiles(e.dataTransfer.files)`; quita `.is-drag` |
| `#btnSample` | `click` | `ta.value=SAMPLE; detect(); autosize();` + `ta.dispatchEvent(new Event('change'))` |
| `#btnClear` | `click` | vacía todo y oculta `#liPanel` (`liShown=false`) |
| `#btnGo` | `click` | `runIngest()` |
| `.demo button` | `click` | máquina de estados (§5) |

`autosize()`: `ta.style.height='auto'` y luego `Math.min(innerHeight*.5, Math.max(240, ta.scrollHeight))+'px'`
(el CSS ya limita `min-height:240px; max-height:50vh`).

### 6.7 La espera — `runIngest(opts)` (async)

```js
function logRow(src,det,st){ … r.className='ing-row is-'+st;
  r.querySelector('.st').innerHTML = st==='run' ? '<span class="c-spin">⟳</span>' : st==='ok' ? '✓' : '✕';
  … logEl.appendChild(r); M.reveal(r); return r; }
function setRow(r,st,det){ … }                        // reemplaza className y glifo
function bump(n){ itemCount+=n; M.counter(countEl,itemCount,{dur:700}) }
const wait=ms=>new Promise(r=>setTimeout(r, M.rm()?Math.min(ms,120):ms));   // reduce-motion: todo a ≤120ms
```

Secuencia (con `A.setState('active')` al empezar):

1. `setState('ingesta',false)` · `A.setState('active')` · reset de `itemCount`, `#count`, `#log`.
2. `sources = detect()` → `hasGh`, `hasWeb`; `words` = palabras del textarea.
3. Fila **«Texto pegado» / «leyendo…»** → wait **1400 ms** → ok: `` `${words||'2.147'} palabras · 3 experiencias, 12 skills` `` · `bump(19)`.
4. Si `hasGh`: **«github.com/dgatica» / «consultando la API…»** → wait **1700 ms** → ok: «12 repos públicos · 3 con actividad sostenida» · `bump(9)`.
5. Si `hasWeb`: **«dgatica.cl» / «leyendo el portfolio…»** → wait **1600 ms** → ok: «6 proyectos, 2 con métricas» · `bump(12)`.
6. Por cada archivo (o `CV_2023.pdf` por defecto si no hay ninguno): **«{nombre}» / «extrayendo texto…»** → wait **1300 ms**:
   - camino normal → ok: «2 páginas de texto · 15 items» · `bump(15)`.
   - `opts.fail` **y** extensión `.pdf` → err: «la página 2 es una imagen escaneada: no hay texto que leer»;
     se inyecta `.ing-err-acts` y **la promesa espera la decisión del usuario**:
     - *Continuar sin la página 2* → quita las acciones, `setRow(r,'ok','solo página 1 · 6 items')`.
     - *Reintentar* → el botón se convierte en `⟳ reintentando…` (spinner), wait **1400 ms**, y termina en
       err: «sigue sin texto — continuando con la página 1».
     - En ambos caminos: `bump(6)`.
7. Fila **«Comparando versiones» / «buscando duplicados…»** → wait **1300 ms** → ok: «3 posibles duplicados — los resolverás tú».
8. `const target=61; if(itemCount!==target){M.counter(countEl,target,{dur:500}); itemCount=target}` ← **cuadre del mock**, ver §10.
9. wait **900 ms** · `A.setState('calm')` · `setState('fin',false)`.

### 6.8 Máquina de estados — `setState(name, viaDemo)`

```js
function setState(name,viaDemo){
  document.querySelectorAll('.demo button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.st===name)));
  ['stIdle','stIngest','stDone'].forEach(id=>{$('#'+id).hidden=id!==stEls[name]});
  const shown=$('#'+stEls[name]);
  if(viaDemo!==false)M.enter(shown);else M.enter(shown);      // ambas ramas hacen lo mismo (ver §Contradicciones)
  $('#hdStep').textContent = stEls[name]==='stIngest' ? 'INGESTA · LEYENDO FUENTES'
                           : stEls[name]==='stDone'   ? 'INGESTA · COMPLETA'
                           : 'VOLCADO · PASO 1 DE 2';
  if(stEls[name]==='stDone'){
    requestAnimationFrame(()=>requestAnimationFrame(()=>M.shimmer($('#finPanel'))));   // EL shimmer
  }
  if(stEls[name]!=='stIngest')A.setState('calm');
}
```

### 6.9 APIs del sistema usadas

`CorpusAurora.mount({state:'calm'})` · `CorpusAurora.setState('active'|'calm')` — (la pausa por foco de campo
la cablea `motion.js` sola).
`CorpusMotion.chars` · `.words` · `.boot` · `.reveal` · `.enter` · `.counter(el,to,{dur})` · `.shimmer` · `.rm()`.
**No** se usan `stagger`, `io`, `xray`, `show`.

### 6.10 Atajos de teclado

Solo `Enter` / `Espacio` sobre `#drop` (que es `role="button"`). No hay atajos globales en esta pantalla
(los `j/k/a/d/o` viven en staging).

---

## 7 · Copy (verbatim, ES)

**En copy.md (§ Importar / § El momento LinkedIn / § Ingesta) — reproducir sin tocar una coma:**

| Cadena en el HTML | ¿Está en copy.md? |
|---|---|
| `Nada entra al master sin tu confirmación` (overline) | ✔ idéntico |
| `No escribas tu perfil. Vuélcalo.` (H1, `Vuélcalo.` en `<em>` itálica) | ✔ idéntico |
| `Pega lo que tengas: párrafos sueltos, tu CV viejo, notas, links. El orden no importa — ordenarlo es trabajo nuestro.` | ✔ idéntico |
| placeholder: `Pega lo que tengas. Sin formato. Sin orden.` + línea en blanco + `Por ejemplo:  «Soy ingeniero civil en computación, titulado en la UNAB. Trabajé tres años en una fintech haciendo APIs de pago… mi portfolio es https://misitio.cl y mi github es github.com/usuario. Adjunto también mi CV viejo.»` | ✔ (copy.md lo da en una línea; el HTML lo parte en 3 con salto real — respetar el salto y el **doble espacio** tras «Por ejemplo:») |
| `arrastra archivos aquí` (en `<b>`) ` — o haz clic para elegir` `<br>` `CV en PDF o DOCX · el cuestionario respondido (.md) · capturas de LinkedIn · certificados` | ✔ idéntico |
| chips: `· API pública — se leerá sin IA` · `· se leerá como portfolio` · `· no legible desde fuera` | ✔ (el JS antepone `'· '`; en `classify` la nota va **sin** el punto medio) |
| `Extraer con evidencia` (CTA) | ✔ |
| `Prefiero escribirlo de cero →` | ✔ |
| `La IA no inventa: cada dato citará el fragmento del que salió. Tú confirmas item por item antes de que entre al master.` | ✔ |
| `LinkedIn no permite que un servicio lea tu perfil desde fuera.` | ✔ |
| `Está detrás de tu sesión y bloquea lectores automáticos — a nosotros y a cualquiera que diga lo contrario. Tres vías que sí funcionan:` | ✔ |
| `01` `Copia el texto de tu perfil` `En tu perfil: Ctrl+A y Ctrl+C, y pégalo aquí encima. Es la vía más completa.` | ✔ (el HTML añade «En tu perfil:» y envuelve las teclas en `.c-kbd`) |
| `02` `Sube el PDF que exporta LinkedIn` `En tu perfil: Más… → Guardar como PDF. Arrástralo a esta caja.` | ✔ (`Más…` y `Guardar como PDF` en `<b>`) |
| `03` `Capturas de pantalla` `Las transcribimos literal, sin interpretar. Lo que no se lea, no se inventa.` | ✔ |
| `Leyendo tus fuentes` (overline ingesta) | ✔ |
| `items encontrados hasta ahora` | ✔ |
| filas del log: `Texto pegado` / `leyendo…` · `consultando la API…` · `leyendo el portfolio…` · `Comparando versiones` / `buscando duplicados…` / `3 posibles duplicados — los resolverás tú` | ✔ (copy.md usa `github.com/usuario` y `misitio.cl`; el HTML usa la persona real del mock: `github.com/dgatica` y `dgatica.cl`) |
| `12 repos públicos · 3 con actividad sostenida` · `6 proyectos, 2 con métricas` | ✔ |
| `la página 2 es una imagen escaneada: no hay texto que leer` · `Continuar sin la página 2` · `Reintentar` | ✔ |
| `Listo. Ahora, tu turno.` · `items esperan tu revisión` · `Revisar en staging →` · `Nada entra al master sin tu confirmación.` | ✔ |
| `9 sin evidencia` + `quedan marcados — la revisión te los pondrá delante, no debajo.` | ✔ (copy.md: «9 sin evidencia — marcados; la revisión te los pondrá delante, no debajo.» — el HTML lo **parte en dos nodos** para que el primero sea un `.c-ver--none`. Manda el HTML.) |

**NO están en copy.md (nacen en el HTML — copiarlas igual):**

- `Corpus` (logo) · `ES` / `EN` · `DG` (avatar)
- `VOLCADO · PASO 1 DE 2` · `INGESTA · LEYENDO FUENTES` · `INGESTA · COMPLETA` (`#hdStep`)
- `Pega aquí lo que tengas` (aria-label del textarea)
- `Fuentes detectadas en tu texto` (overline del bloque de chips)
- `0 palabras` / `{n} palabras · {n} link(s) detectado(s)` (`#taMeta`)
- `usar texto de ejemplo` · `limpiar` (botones de `.imp-meta`)
- `Quitar` (aria-label de la `×` de cada archivo)
- Etiquetas de archivo: `cuestionario · fuente de primera` · `pdf` · `docx` · `captura · se transcribe literal`
- `Esto toma entre 5 y 40 segundos según las fuentes.` `<br>` `Sin porcentajes inventados: te decimos qué estamos haciendo.`
  (copy.md dice «Entre 5 y 40 segundos según las fuentes. Sin porcentajes inventados: …» — el HTML añade «Esto toma»)
- `extrayendo texto…` · `2 páginas de texto · 15 items` · `solo página 1 · 6 items` · `sigue sin texto — continuando con la página 1` · `reintentando…`
- `{n} palabras · 3 experiencias, 12 skills` (detalle de «Texto pegado»)
- `Extracción completa` (overline del fin)
- Etiquetas de la grilla: `experiencias` · `viñetas de logro` · `skills` · `proyectos` · `certificaciones` · `posibles duplicados`
- `demo` · `vacío` · `detección` · `linkedin` · `ingesta` · `error` · `fin` (panel de revisión — **no es producto**)
- `Estados de la pantalla (revisión de diseño)` (aria-label del panel demo)
- `Idioma` (aria-label del selector)
- El SAMPLE (texto de ejemplo, §9)

---

## 8 · Accesibilidad

**Roles y aria presentes:**

- `<div class="imp-drop" id="drop" role="button" tabindex="0">` — dropzone operable por teclado (`Enter`/`Espacio`, con `preventDefault`).
- `<textarea aria-label="Pega aquí lo que tengas">` (no hay `<label>` visible; la etiqueta la da el placeholder + aria-label).
- `<button class="rm" aria-label="Quitar">×</button>` en cada archivo.
- `<div class="hd-lang" aria-label="Idioma">` (solo decorativo/estado: los `<span>` no son botones).
- `<div class="demo" role="group" aria-label="Estados de la pantalla (revisión de diseño)">` con
  `aria-pressed="true|false"` en los 6 botones. **No es producto: no portar.**
- `<button id="btnGo" disabled>` — deshabilitado nativo hasta pasar `gate()`.
- `#btnClear` con atributo `hidden` (no `aria-hidden`).
- `.c-aurora` se crea con `aria-hidden="true"` (lo hace aurora.js).
- Verificación **nunca solo color**: `.c-ver--none` = glifo `⚠` (::before) + palabra + borde punteado
  (`.fin-noev` tiene `border-top:1px dashed`). Los chips llevan `.dot` + texto de la nota, no solo color.
  Las filas del log llevan glifo (`⟳`/`✓`/`✕`) además del color.

**Orden de foco (estado volcado):** `a.c-logo` → `textarea#ta` → `div#drop` (tabindex 0) →
`button#btnSample` → (`button#btnClear` si visible) → `button#btnGo` (si habilitado) → `a.imp-alt` →
botones del panel demo. `#fileIn` está `hidden` (fuera del orden). El `#liPanel` no tiene controles focusables.

**Focus visible:** el sistema define `:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}`.
`.imp-ta:focus{outline:none}` — el textarea **anula el outline propio** porque el foco lo comunica el panel
contenedor; no hay `box-shadow` de foco sobre `.imp-box` cuando el textarea está enfocado (**revisar**: el
`.c-panel` no cambia al enfocar; solo cambia en `.is-drag`). Riesgo de foco invisible en el campo principal.

**Huecos a corregir al implementar (no están en el HTML):**

- **No hay live region.** El contador `#count` y las filas nuevas del `#log` no se anuncian. Lo natural sería
  `aria-live="polite"` en `.ing-log` (o en un contenedor de estado) y `aria-live="polite"` / `role="status"`
  en `.ing-count`. También `#taMeta` (palabras/links detectados) cambia sin anuncio.
- **No hay `aria-busy`** durante la ingesta.
- El cambio de `<main>` (volcado → ingesta → fin) no mueve el foco ni lo anuncia.

**Hit targets (handoff exige ≥ 44 px en móvil):**

- `.imp-meta button` → `padding:6px 8px` con `font-size:11px` ⇒ ~23 px de alto. **Por debajo de 44.**
- `.imp-file .rm` → `padding:2px 6px` ⇒ ~16 px. **Muy por debajo de 44.**
- `.ing-err-acts button` → `padding:7px 10px` ⇒ ~25 px.
- Botones OK: `.c-btn--hero` (62 px), `.imp-drop` (bloque grande), `.demo button` (no es producto).

---

## 9 · Datos del mock

Persona: **Diego Gatica** (ficticio), la misma de todas las pantallas y de `datos-ejemplo.json`.
Avatar del header: **`DG`**.

**SAMPLE (texto de ejemplo, verbatim — es la fuente de la que sale todo lo demás):**

```
Soy ingeniero civil en computación, titulado en la UNAB (2019). Los últimos tres años trabajé en Altiplano Pagos como backend developer — partí haciendo integraciones de pago y terminé a cargo del servicio de conciliación (Go, ~40 mil transacciones diarias). Antes estuve dos años en el e-commerce de Rayén Retail, en el equipo de checkout.

Mi portfolio es https://dgatica.cl y mi github es github.com/dgatica. También dejo el LinkedIn: linkedin.com/in/diego-gatica

Sé Go, Python, SQL, algo de Kubernetes (lo usamos pero no lo administraba yo). Inglés B2. Diplomado en ingeniería de datos en la UC (2022).
```

| Dato | Valor |
|---|---|
| Formación | Ingeniero civil en computación, **UNAB**, **2019** · Diplomado en ingeniería de datos, **UC**, **2022** |
| Empleo actual | **Altiplano Pagos** — backend developer · integraciones de pago → servicio de conciliación (**Go**, **~40 mil transacciones diarias**) · 3 años |
| Empleo anterior | **Rayén Retail** — e-commerce, equipo de checkout · 2 años |
| Portfolio | **https://dgatica.cl** |
| GitHub | **github.com/dgatica** |
| LinkedIn | **linkedin.com/in/diego-gatica** (no legible desde fuera) |
| Skills | Go, Python, SQL, algo de **Kubernetes** («lo usamos pero no lo administraba yo» ← el gancho del tailoring) · Inglés **B2** |
| Archivos del mock | **`cuestionario-identidad.md` · 18 KB** · **`CV_2023.pdf` · 412 KB** |
| Error canónico | `CV_2023.pdf` → «la página 2 es una imagen escaneada» |

Coherencia con handoff.md §Datos del mock: «61 items, 43/8/9, 412.803 bytes…» → aquí aparecen **61** y **412 KB**;
los **9 sin evidencia** cuadran con el 43/8/9 de staging.

---

## 10 · Números en la UI

Regla del producto: **ningún número sin fuente**; **cero % de progreso**, cero score, cero confidence.
La pantalla **cumple**: no hay ni un porcentaje, ni un score, ni una barra de progreso.

| Número visible | Dónde | De dónde sale |
|---|---|---|
| `PASO 1 DE 2` | `#hdStep` | literal del HTML (flujo volcado → staging) |
| `0 palabras` / `{n} palabras` | `#taMeta` | **calculado real**: `(txt.trim().match(/\S+/g)||[]).length`, formato `es-CL` |
| `· {n} link(s) detectado(s)` | `#taMeta` | **calculado real**: `found.size` del regex |
| `18 KB` / `412 KB` | `.imp-file .sz` | mock del demo; en real → `fmtSize(file.size)` |
| `01` `02` `03` | `.imp-li li .n` | numeración de las tres vías (literal) |
| `0` → N | `.ing-count` | `M.counter()` sobre `itemCount`, que sube con `bump(n)` |
| `{n} palabras · 3 experiencias, 12 skills` | fila «Texto pegado» | **palabras = real**; **`3 experiencias, 12 skills` = literal hardcodeado** |
| `2.147` (fallback de palabras) | fila «Texto pegado» si el textarea está vacío | literal del mock (viene de copy.md) |
| `12 repos públicos · 3 con actividad sostenida` | fila GitHub | literal hardcodeado (en real: API pública de GitHub) |
| `6 proyectos, 2 con métricas` | fila portfolio | literal hardcodeado |
| `2 páginas de texto · 15 items` | fila de archivo (ok) | literal hardcodeado |
| `solo página 1 · 6 items` | fila de archivo (recuperada) | literal hardcodeado |
| `la página 2` | fila de archivo (error) | literal |
| `3 posibles duplicados` | fila «Comparando versiones» | literal |
| `5 y 40 segundos` | `.ing-hint` | rango declarado (no es una estimación calculada — está bien: es un rango honesto, no un %) |
| `61` | `#finCount` (`.fin-head .n`) | **hardcodeado en el HTML** y **forzado** por el JS (paso 8 de `runIngest`) |
| `4` experiencias · `25` viñetas de logro · `23` skills · `6` proyectos · `3` certificaciones · `3` posibles duplicados | `.fin-grid` | hardcodeados. Suman `4+25+23+6+3 = 61` (los duplicados no suman) ✔ coherente con `#finCount` |
| `9 sin evidencia` | `.fin-noev` | hardcodeado; cuadra con el 43/8/9 del handoff |
| `19` `9` `12` `15` `6` | incrementos de `bump()` | mock: sumas parciales del contador |

**Lo sospechoso (marcar en la implementación):**

1. **El cuadre forzado a 61** (líneas 1181–1182):
   ```js
   const target=61;
   if(itemCount!==target){M.counter(countEl,target,{dur:500});itemCount=target}
   ```
   Con el SAMPLE los `bump()` suman `19+9+12+15 = 55`, y el JS **empuja el contador a 61** para cuadrar con la
   grilla del fin. Es aceptable como maqueta, pero **en producción es exactamente el pecado que el producto
   denuncia**: un número que no sale de la evidencia. El contador debe reflejar el conteo real de la extracción
   y la grilla del fin debe derivarse de ese mismo conteo. `CorpusMotion.counter` está documentado como
   «Contador honesto: anima hacia un número REAL. Jamás inventes el destino» — aquí se le está mintiendo.
2. **`3 experiencias, 12 skills`** en la fila «Texto pegado» es constante para cualquier texto que pegues.
   En producción tiene que venir del extractor.
3. `12 repos públicos · 3 con actividad sostenida` y `6 proyectos, 2 con métricas` son igualmente constantes:
   deben venir de la API de GitHub y del crawl del portfolio.
4. El fallback `'2.147'` palabras cuando el textarea está vacío es un número inventado en pantalla: en producción
   no debe existir (si no hay texto pegado, no hay fila «Texto pegado»).

**Nada de esto invalida el diseño**: son puntos donde el mock rellena lo que el backend debe entregar. Lo que
**no** se puede hacer al portar es dejar los literales.
