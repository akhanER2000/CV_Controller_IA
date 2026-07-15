# Variantes — spec de pantalla

> Fuente literal: `Corpus_ diseño completo/corpus-design/04-pantallas/variantes.html` (875 líneas, leído entero).
> **Los nombres de clase NO CAMBIAN.** Este documento es transcripción, no interpretación.
> Los bloques `<style data-corpus-system="css">` (líneas 10–486) y `<script data-corpus-system="js">`
> (líneas 550–821) son copia del sistema canónico (`02-sistema/*`) y **no se transcriben aquí**.

---

## 1 · Ruta y propósito

**Ruta del producto:** `/app/variantes` (handoff.md → `04-pantallas/variantes.html`).

Lista las variantes de CV del usuario —cada una una *vista* del master, no una copia— y señala cuáles
quedaron **desactualizadas** cuando el master cambió, dejando que el usuario decida item por item:
actualizar la variante o mantener su override.

`<title>` del documento: `Corpus — Variantes · vistas de tu master`
`<html lang="es" data-theme="dark">`

---

## 2 · Ventana o muro · Aurora

**NO monta la aurora.** No hay ninguna llamada a `CorpusAurora.mount(...)` en el archivo
(verificado con grep: `CorpusAurora` solo aparece dentro del bloque `data-corpus-system`, en la
definición del módulo y en los listeners `focusin`/`focusout` de `motion.js`). Tampoco existe un
`<div class="c-aurora">` en el `<body>`.

Esto es **correcto y deliberado**: es un **MURO**. Regla del sistema (README §4 y handoff):
> «Donde hay trabajo que leer, hay muro.» · «Solo las VENTANAS la montan (auth, onboarding,
> importar, ingesta, dashboard vacío). Los MUROS ni la montan.»

Al portar a React: **no montes la aurora en esta ruta.** El fondo es `var(--bg)` sólido.

| Clase de la gramática | Uso en esta pantalla |
|---|---|
| `.c-wall` | **Sí** — en `<main class="vr-main c-wall">` (línea 524). Única sección de la gramática presente. |
| `.c-window` | No se usa |
| `.c-panel` | No se usa |
| `.c-scrim` | No se usa |
| `.c-aurora` | No se usa (no hay canvas ni fallback) |

Estado de aurora aplicable: **ninguno** (ni `'calm'` ni `'active'`). Si un layout padre montara la
aurora global, esta pantalla la taparía igualmente con el muro opaco.

---

## 3 · Esqueleto DOM

Leyenda: **(S)** = clase del sistema (`c-*`, `t-*`, `hd-*`, más `.demo`, definida en el bloque
`data-corpus-system`) · **(P)** = clase propia de esta pantalla.

```
body
└── div.c-page (S)
    ├── header.c-header (S)
    │   └── div.c-container (S)
    │       ├── a.c-logo (S)                          href="dashboard.html"        → "Corpus"
    │       ├── nav.hd-nav (S)
    │       │   ├── a  href="dashboard.html"          → "Panel"
    │       │   ├── a  href="master.html"             → "Master"
    │       │   ├── a  href="variantes.html" aria-current="page"  → "Variantes"
    │       │   └── a  href="fuentes.html"            → "Fuentes"
    │       └── div.hd-right (S)
    │           ├── nav.hd-nav (S)  style="display:flex"   ← inline: vence al @media(max-width:768px){.hd-nav{display:none}}
    │           │   └── a href="ajustes.html"         → "Ajustes"
    │           ├── div.hd-lang (S)
    │           │   ├── span[data-on] → "ES"
    │           │   └── span          → "EN"
    │           └── div.hd-av (S)                     → "DG"   (Diego Gatica)
    │
    └── main.vr-main.c-wall (P + S)  data-screen-label="variantes"
        └── div.c-container (S)
            ├── div.vr-lead (P)
            │   ├── p  →  <b>7 variantes, un solo master.</b> Cada una referencia tus datos — no los copia.
            │   │          Cuando el master cambia, las variantes lo saben; los overrides tuyos siempre ganan.
            │   └── a.c-btn.c-btn--patina (S)  href="editor-variante.html"  → "Nueva variante"
            │
            ├── hr.c-divider (S)                      ← se dibuja con M.boot() (scaleX 0→1, 1s)
            │
            ├── div.vr-list#list (P)                  ← VACÍO en el HTML; lo rellena render() por innerHTML
            │
            └── div.vr-empty#empty (P)                ← display:none salvo con .show
                ├── span.t-overline (S)               → "Sin variantes todavía"
                ├── h2  style="margin-top:16px"       → "Tu master tiene 52 items.<br>Una variante es la vista de 2 páginas para un rol."
                ├── p                                 → "Elige qué cuenta, ajusta el título al aviso, y el PDF sale igual al preview.
                │                                        Empieza por el rol al que más postulas."
                └── div  style="margin-top:26px"
                    └── span.c-forge (S)
                        └── a.c-btn.c-btn--forge.c-btn--lg (S)  href="editor-variante.html"  → "Crear la primera →"

div.demo (S)   role="group"  aria-label="Estados de la pantalla (revisión de diseño)"
├── span                                              → "demo"
├── button  data-st="lleno"  aria-pressed="true"      → "con variantes"
└── button  data-st="vacio"  aria-pressed="false"     → "vacío"
```

### Plantilla de fila (generada por `row(v,i)` en JS, dentro de `#list`)

```
div.vr-row (P)  data-i="{i}"   [+ .open cuando el detalle está desplegado]
├── div.vr-top (P)   [data-toggle  ← SOLO si v.old]
│   ├── span.nm (P)
│   │   ├── span.c-pulse-dot (S)  title="desactualizada"   ← SOLO si v.old
│   │   └── {v.nm}
│   ├── button.pdf (P)  title="El PDF sale del mismo estado que el preview"  → "PDF ↓"
│   ├── span.meta (P)
│   │   ├── si v.old:  span.old (P) → "desactualizada — cambió: cargo en Altiplano Pagos"  +  <br>
│   │   ├── si !v.old: "al día"  +  <br>
│   │   └── {v.touch} + " · " + {v.pg}
│   ├── a.open (P)  href="editor-variante.html"  → "abrir →"
│   └── span.obj (P)  → "objetivo: " + {v.obj}
│
└── div.vr-diff (P)     ← SOLO si v.old. display:none; visible con .vr-row.open
    ├── span.t-overline (S)  → "Qué cambió en el master"
    ├── div.vr-dline (P)
    │   ├── span.was (P) → "Backend Developer"
    │   ├── span         → "→"
    │   ├── span.now (P) → "Senior Backend Developer"
    │   └── span  style="color:var(--text-subtle)" → "· cargo en Altiplano Pagos SpA · editado por ti, ayer"
    └── div.vr-dacts (P)
        ├── button.prim (P)  data-upd  → "Actualizar esta variante"
        ├── button        data-keep    → "Mantener como está (override)"
        └── a.c-btn.c-btn--quiet (S)  style="height:30px;font-size:10px"  href="editor-variante.html"  → "ver en el editor"
```

### Cómo cae la rejilla de `.vr-top` (crítico — depende del ORDEN DEL DOM)

`grid-template-columns: 1fr auto auto auto`. `.pdf`, `.meta` y `.open` llevan `grid-row: span 2`;
`.obj` lleva `grid-column: 1`. Con auto-placement resulta:

```
┌─────────────────────┬────────┬──────────────┬─────────┐
│ .nm   (fila 1)      │        │              │         │
├─────────────────────┤ .pdf   │   .meta      │  .open  │   ← estas 3 ocupan las 2 filas
│ .obj  (fila 2)      │        │              │         │
└─────────────────────┴────────┴──────────────┴─────────┘
```

**Riesgo:** reordenar los hijos en JSX rompe el layout. El orden DOM es exactamente
`nm → pdf → meta → open → obj`.

En ≤768px: `grid-template-columns: 1fr auto` y `.pdf`, `.meta` pasan a `display:none` → queda
`[.nm / .obj] [.open]`.

---

## 4 · CSS específico de pantalla

Copia **verbatim** del segundo `<style>` (líneas 488–518), el que **no** lleva `data-corpus-system`.
**No define ningún `@keyframes` propio** — todo el movimiento viene del sistema.

```css
.vr-main{flex:1;padding:30px 0 110px}
.vr-lead{display:flex;align-items:baseline;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:18px}
.vr-lead p{color:var(--text-muted);font-size:var(--fs-ui);max-width:60ch}
.vr-lead p b{color:var(--text);font-weight:500}
.vr-list{border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;margin-top:8px}
.vr-row{background:var(--surface);border-top:1px solid var(--border);padding:0}
.vr-row:first-child{border-top:0}
.vr-top{display:grid;grid-template-columns:1fr auto auto auto;gap:4px 18px;align-items:center;padding:14px 20px;cursor:pointer}
.vr-top:hover{background:var(--surface-elevated)}
.vr-top .nm{font:500 14.5px/1.3 var(--font-sans);display:flex;align-items:center;gap:9px}
.vr-top .obj{grid-column:1;font:400 var(--fs-micro)/1.4 var(--font-mono);color:var(--text-subtle)}
.vr-top .meta{grid-row:span 2;font:400 var(--fs-micro)/1.6 var(--font-mono);color:var(--text-subtle);text-align:right}
.vr-top .meta .old{color:var(--text-muted)}
.vr-top .pdf{grid-row:span 2;font:500 var(--fs-micro)/1 var(--font-mono);color:var(--text-muted);border:1px solid var(--border);border-radius:5px;padding:9px 11px}
.vr-top .pdf:hover{color:var(--accent-text);border-color:var(--border-patina)}
.vr-top .open{grid-row:span 2;font:500 var(--fs-ui)/1 var(--font-sans);color:var(--accent-text)}
/* detalle de desactualización: qué cambió, decides tú */
.vr-diff{display:none;border-top:1px dashed var(--border);background:var(--surface-sunken);padding:14px 20px 16px}
.vr-row.open .vr-diff{display:block}
.vr-diff .t-overline{font-size:10px}
.vr-dline{display:flex;gap:14px;align-items:baseline;margin-top:10px;font:400 var(--fs-data)/1.6 var(--font-mono)}
.vr-dline .was{color:var(--text-subtle);text-decoration:line-through;text-decoration-color:var(--border-strong)}
.vr-dline .now{color:var(--text)}
.vr-dacts{display:flex;gap:8px;margin-top:12px}
.vr-dacts button{font:500 var(--fs-micro)/1 var(--font-mono);padding:8px 11px;border:1px solid var(--border-strong);border-radius:6px;color:var(--text-muted)}
.vr-dacts button:hover{color:var(--text);border-color:var(--border-patina)}
.vr-dacts .prim{color:var(--accent-text);border-color:var(--border-patina)}
.vr-empty{max-width:560px;margin:90px auto 0;text-align:center;display:none}
.vr-empty.show{display:block}
.vr-empty p{margin-top:14px;color:var(--text-muted);line-height:1.7}
@media (max-width:768px){.vr-top{grid-template-columns:1fr auto}.vr-top .pdf,.vr-top .meta{display:none}}
```

Inline styles literales que hay que conservar (no están en el `<style>`):
- `<nav class="hd-nav" style="display:flex">` (el de Ajustes, en `.hd-right`)
- `<h2 style="margin-top:16px">` en `.vr-empty`
- `<div style="margin-top:26px">` (contenedor del `.c-forge` en `.vr-empty`)
- `<span style="color:var(--text-subtle)">` en `.vr-dline`
- `<a class="c-btn c-btn--quiet" style="height:30px;font-size:10px">` en `.vr-dacts`

---

## 5 · Estados del panel demo

Handoff declara para `/app/variantes`: **`con variantes · vacío`**. Coinciden con los dos botones.

| Botón | `data-st` | Estado inicial | Qué cambia en el DOM |
|---|---|---|---|
| **con variantes** | `lleno` | `aria-pressed="true"` (activo al cargar) | `#list.style.display = ''` · `.vr-lead.style.display = ''` · `#empty` pierde `.show` (→ `display:none`) · se llama `render()` (re-pinta las 7 filas + `M.stagger` + `M.boot`) |
| **vacío** | `vacio` | `aria-pressed="false"` | `#list.style.display = 'none'` · `.vr-lead.style.display = 'none'` · `#empty` gana `.show` (→ `display:block`) · se llama `M.enter($('#empty'))` (anima `.c-enter`, 360ms) |

Activación (líneas 863–870):
```js
$$('.demo button').forEach(b=>b.onclick=()=>{
  $$('.demo button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  const empty=b.dataset.st==='vacio';
  $('#list').style.display=empty?'none':'';
  $('.vr-lead').style.display=empty?'none':'';
  $('#empty').classList.toggle('show',empty);
  if(empty){M.enter($('#empty'))}else render();
});
```

Notas literales (no las "arregles"):
- El `<hr class="c-divider">` **sigue visible** en el estado vacío (no se oculta).
- `M.enter()` hace `el.hidden=false`, pero `#empty` no usa `[hidden]` sino la clase `.show`. La
  visibilidad la gobierna `.show`; `enter()` solo aporta la animación `.c-enter`.

### Estados internos (no son del panel demo)

- **Fila desactualizada** (`v.old === true`): `.c-pulse-dot` + `.meta > .old` + `[data-toggle]` en
  `.vr-top` + bloque `.vr-diff`. 2 de las 7 filas del mock.
- **Fila al día**: sin dot, `.meta` dice "al día", sin `[data-toggle]`, sin `.vr-diff`.
- **Detalle desplegado**: `.vr-row.open` → `.vr-diff{display:block}`.

---

## 6 · Comportamiento JS de la pantalla

Todo lo que sigue es el `<script>` **sin** `data-corpus-system` (líneas 822–873). IIFE en modo estricto.

### Helpers y datos

```js
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], M=window.CorpusMotion;
const V=[
 {nm:'Backend — Fintech',obj:'Backend Engineer',pg:'2 págs',touch:'tocada hace 2 días',old:true},
 {nm:'Backend — General',obj:'Backend Developer',pg:'2 págs',touch:'hace 5 días',old:true},
 {nm:'Data Engineering',obj:'Data Engineer',pg:'2 págs',touch:'hace 1 semana'},
 {nm:'Plataforma / DevOps',obj:'Platform Engineer',pg:'2 págs',touch:'hace 2 semanas'},
 {nm:'Full-stack — startup temprana',obj:'Software Engineer',pg:'1 pág',touch:'hace 3 semanas'},
 {nm:'Backend — EN · remoto',obj:'Backend Engineer (EN)',pg:'2 págs',touch:'hace 1 mes'},
 {nm:'Académica — ayudantías',obj:'Ingeniero de Software',pg:'1 pág',touch:'hace 2 meses'}
];
```

### `render()`

```js
function render(){
  $('#list').innerHTML=V.map(row).join('');
  M.stagger($('#list'),{step:40,cap:24});M.boot();
}
```
- Reconstruye la lista entera por `innerHTML`.
- **`M.stagger` con `step:40, cap:24`** (no el 80ms por defecto): escalona la entrada de las filas
  poniendo `data-reveal="soft"` y `--d` en cada hijo, y las muestra en doble `requestAnimationFrame`.
- **`M.boot()`**: dibuja los `.c-divider` y muestra los `[data-reveal]` pendientes del scope.
- Se invoca **al final del IIFE** (línea 871) → el estado de arranque es "con variantes".

### Delegación de clics (un solo listener en `document`) — el orden de las guardas IMPORTA

```js
document.addEventListener('click',e=>{
  if(e.target.closest('.pdf')){e.stopPropagation();return}   // 1. el botón PDF NO despliega la fila
  if(e.target.closest('a'))return;                            // 2. los enlaces navegan, no togglean
  const t=e.target.closest('[data-toggle]');
  if(t){t.closest('.vr-row').classList.toggle('open');return} // 3. desplegar/plegar el diff
  const upd=e.target.closest('[data-upd]');
  if(upd){const r=upd.closest('.vr-row');const v=V[+r.dataset.i];v.old=false;render()}
  const keep=e.target.closest('[data-keep]');
  if(keep){const r=keep.closest('.vr-row');const v=V[+r.dataset.i];v.old=false;v.kept=true;render()}
});
```

Consecuencias literales:
- **"Actualizar esta variante"** → `v.old=false` → `render()` → la fila pierde el dot, el diff y el
  `data-toggle`; pasa a "al día". Como se re-pinta toda la lista, **cualquier otra fila abierta se
  cierra** y el stagger vuelve a correr. Es el comportamiento de la referencia.
- **"Mantener como está (override)"** → `v.old=false; v.kept=true` → `render()`. **`v.kept` se escribe
  pero NUNCA se lee en `row()`**: visualmente el resultado es idéntico a "Actualizar". El sistema
  tiene `.c-override` (borde izq. de pátina) pero esta pantalla **no lo usa**. No inventes un marcador.
- **`button.pdf`** solo hace `stopPropagation()`. No descarga nada, no tiene handler propio.
- El `.vr-top` es un `<div>` con `cursor:pointer` **en todas las filas**, pero solo las `old` llevan
  `[data-toggle]`: en las filas al día el cursor miente. Es literal; documentado, no corregido.

### CorpusMotion / CorpusAurora usados

| API | Dónde |
|---|---|
| `CorpusMotion.stagger(el,{step:40,cap:24})` | `render()` |
| `CorpusMotion.boot()` | `render()` |
| `CorpusMotion.enter(el)` | botón demo "vacío" |
| `CorpusAurora.*` | **ninguna llamada** |

No se usan: `counter`, `shimmer`, `xray`, `words`/`chars`, `io`, `reveal`.

### Atajos de teclado

**Ninguno.** (Los `j/k/a/d/o` del handoff son exclusivos de staging.)

---

## 7 · Copy (verbatim, ES)

| # | Cadena literal | ¿En `06-handoff/copy.md`? |
|---|---|---|
| 1 | `Corpus — Variantes · vistas de tu master` (`<title>`) | No |
| 2 | `Corpus` (logo) | No (marca) |
| 3 | `Panel` · `Master` · `Variantes` · `Fuentes` · `Ajustes` (nav) | No |
| 4 | `ES` · `EN` (`.hd-lang`) | No |
| 5 | `DG` (`.hd-av`) | No (iniciales de Diego Gatica) |
| 6 | **`7 variantes, un solo master.`** `Cada una referencia tus datos — no los copia. Cuando el master cambia, las variantes lo saben; los overrides tuyos siempre ganan.` | **Sí** — §Variantes → "encabezado" (literal) |
| 7 | `Nueva variante` | No |
| 8 | `PDF ↓` | No |
| 9 | `El PDF sale del mismo estado que el preview` (title del botón PDF) | No (eco de §Editor → pie del preview) |
| 10 | `desactualizada — cambió: cargo en Altiplano Pagos` | **Casi** — copy.md §Dashboard dice `desactualizada · cambió: cargo en Altiplano Pagos` (**`·`**, no **`—`**) |
| 11 | `al día` | No |
| 12 | `tocada hace 2 días` · `hace 5 días` · `hace 1 semana` · `hace 2 semanas` · `hace 3 semanas` · `hace 1 mes` · `hace 2 meses` | No |
| 13 | `2 págs` · `1 pág` | No |
| 14 | `abrir →` | No |
| 15 | `objetivo: Backend Engineer` (y los otros 6 objetivos) | No |
| 16 | `desactualizada` (title del `.c-pulse-dot`) | No |
| 17 | `Qué cambió en el master` | **Sí** — §Variantes → "desactualizada, detalle" (allí con `:` final) |
| 18 | `Backend Developer` → `Senior Backend Developer` | **Sí** — §Variantes, literal |
| 19 | `· cargo en Altiplano Pagos SpA · editado por ti, ayer` | **Casi** — copy.md dice `cargo en Altiplano Pagos` (**sin `SpA`**) |
| 20 | `Actualizar esta variante` | **Sí** — §Variantes, literal |
| 21 | `Mantener como está (override)` | **Sí** — §Variantes, literal |
| 22 | `ver en el editor` | No |
| 23 | `Sin variantes todavía` (overline del vacío) | No |
| 24 | `Tu master tiene 52 items.` / `Una variante es la vista de 2 páginas para un rol.` | **Sí** — §Variantes → "vacío", literal |
| 25 | `Elige qué cuenta, ajusta el título al aviso, y el PDF sale igual al preview. Empieza por el rol al que más postulas.` | **Sí** — §Variantes → "vacío", literal |
| 26 | `Crear la primera →` | No |
| 27 | `demo` · `con variantes` · `vacío` (panel demo) | No (convención de entrega, no producto) |
| 28 | `Estados de la pantalla (revisión de diseño)` (aria-label del panel demo) | No |

Nombres de variante (mock, no copy.md): `Backend — Fintech` · `Backend — General` ·
`Data Engineering` · `Plataforma / DevOps` · `Full-stack — startup temprana` ·
`Backend — EN · remoto` · `Académica — ayudantías`.

---

## 8 · Accesibilidad

### Lo que la pantalla SÍ hace
- `<html lang="es">`.
- `aria-current="page"` en el enlace `Variantes` del header.
- Landmarks: `<header class="c-header">` + `<main class="vr-main c-wall">`.
- `data-screen-label="variantes"` en el `<main>` (etiqueta de entrega, no ARIA).
- Panel demo: `role="group"` + `aria-label="Estados de la pantalla (revisión de diseño)"`, con
  `aria-pressed` en los dos botones (toggle correcto).
- Anillo de foco `:focus-visible{outline:2px solid var(--focus-ring)}` heredado del sistema.
- Todo el movimiento bajo `@media (prefers-reduced-motion: no-preference)`; el estado base es el final.
- La desactualización **nunca es solo color**: punto que pulsa + la palabra "desactualizada" en `.meta`.

### Orden de foco (tabulación real)
1. `a.c-logo` → 2–5. nav (Panel, Master, Variantes, Fuentes) → 6. Ajustes →
7. `a.c-btn--patina` "Nueva variante" → por cada fila: 8. `button.pdf` → 9. `a.open` "abrir →" →
(si la fila está `.open`) 10. `button[data-upd]` → 11. `button[data-keep]` → 12. `a` "ver en el editor"
→ al final: botones del panel `demo`.

`.hd-lang span` no son focusables (no es un control real). El `.vr-top` **no entra en el orden de foco**.

### Huecos reales (documentar, no maquillar)
- **No hay `<h1>`** en la pantalla. En el estado "con variantes" el único texto de nivel es un `<p>`;
  el único `<h2>` vive dentro de `.vr-empty`. Salto de jerarquía.
- **El desplegable no es accesible por teclado.** `.vr-top[data-toggle]` es un `<div>` con `click`:
  sin `tabindex`, sin `role="button"`, sin `aria-expanded`, sin handler de `Enter`/`Space`. Un usuario
  de teclado o lector de pantalla **no puede abrir el diff**.
- **Sin live region.** Al pulsar "Actualizar esta variante" la fila cambia de estado sin anuncio
  (`aria-live` no existe en el archivo).
- **Hit targets < 44px:** `button.pdf` (≈30px de alto) y los `.vr-dacts button` (≈28px), más el
  `a.c-btn--quiet` con `style="height:30px"`. El handoff exige **≥44px en móvil**. Mitigación parcial:
  `.pdf` se oculta en ≤768px; los `.vr-dacts` **no**.
- El `.c-pulse-dot` transmite significado solo por `title` (no lo lee bien un lector); la palabra
  "desactualizada" en `.meta` lo cubre — pero en ≤768px `.meta` está en `display:none`, y entonces
  **el dot queda solo con su `title`**.

---

## 9 · Datos del mock

Persona: **Diego Gatica** (ficticia, compartida por todas las pantallas y por
`05-documento-cv/datos-ejemplo.json`). Iniciales **DG** en `.hd-av`.

**7 variantes** (array `V`, en orden):

| # | `nm` | `obj` | `pg` | `touch` | `old` |
|---|---|---|---|---|---|
| 0 | Backend — Fintech | Backend Engineer | 2 págs | tocada hace 2 días | **sí** |
| 1 | Backend — General | Backend Developer | 2 págs | hace 5 días | **sí** |
| 2 | Data Engineering | Data Engineer | 2 págs | hace 1 semana | no |
| 3 | Plataforma / DevOps | Platform Engineer | 2 págs | hace 2 semanas | no |
| 4 | Full-stack — startup temprana | Software Engineer | 1 pág | hace 3 semanas | no |
| 5 | Backend — EN · remoto | Backend Engineer (EN) | 2 págs | hace 1 mes | no |
| 6 | Académica — ayudantías | Ingeniero de Software | 1 pág | hace 2 meses | no |

Otros hechos del mock (coherencia entre pantallas):
- Empresa: **Altiplano Pagos SpA** (el diff dice "SpA"; el resto del paquete dice "Altiplano Pagos").
- Cambio en el master: **Backend Developer → Senior Backend Developer**, "editado por ti, ayer".
- Master: **52 items** (coincide con staging vacío: «52 items entraron a tu master»).
- Idioma activo: **ES**; existe variante EN ("Backend — EN · remoto").

---

## 10 · Números en la UI

Regla del producto (README §6, handoff §4): **ningún número sin fuente.** Sin ATS score, sin % de
match, sin confidence, sin umbrales inventados.

| Número visible | Dónde | De dónde sale | ¿Legítimo? |
|---|---|---|---|
| **7** ("7 variantes, un solo master") | `.vr-lead p b` | **Hardcodeado en el HTML.** Coincide con `V.length === 7` por casualidad del mock. | Sí, pero **debe derivarse de la colección** en React. Si el usuario tiene 3 variantes y el texto sigue diciendo 7, es exactamente el pecado que el producto persigue. |
| **52** ("Tu master tiene 52 items") | `.vr-empty h2` | Copy.md §Variantes vacío + mock del master | Sí — cuenta real de items. Debe venir del master. |
| **2** ("la vista de 2 páginas para un rol") | `.vr-empty h2` | Copy.md, literal | Sí — hecho del formato, no una métrica. |
| **2 págs / 1 pág** | `.meta` de cada fila | `V[i].pg` | Sí — páginas reales del documento. |
| **2 días, 5 días, 1 semana, 2 semanas, 3 semanas, 1 mes, 2 meses** | `.meta` de cada fila | `V[i].touch` | Sí — marca de tiempo real ("última vez tocada"). En producción debe salir de `updatedAt`, no de un string. |
| **10px / 30px / 14.5px…** | inline styles y CSS | geometría | N/A |

**Auditoría: no hay ningún número prohibido en esta pantalla.** Cero porcentajes, cero score, cero
"confianza", cero barras de progreso. El estado de una variante se expresa con **palabras**
("al día", "desactualizada") y con un **hecho citado** ("cambió: cargo en Altiplano Pagos"), no con
una cifra. Esto es exactamente lo que pide el posicionamiento — **no lo cambies**.

Único punto a vigilar: el **7** hardcodeado. Es el único número de la pantalla que hoy no está
enlazado a su fuente.
