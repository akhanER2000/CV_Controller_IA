> ⚠️ **DEROGADO (PROMPT 07) — la gramática «ventana / muro» ya NO rige.**
> Lo que sigue describe la regla vieja: *«donde hay trabajo, el trabajo gana; los muros
> ni montan la aurora»*. Se sacó de una landing con scroll, donde la alternancia produce
> ritmo. Corpus es una app con pestañas: nunca ves la alternancia, solo la inconsistencia.
>
> **Doctrina vigente** (`src/app/globals.css` §3): la aurora está SIEMPRE presente — la
> monta UNA vez el shell de `/app`. Lo que protege la lectura no es su ausencia, sino la
> SUPERFICIE sobre la que vive el contenido: intensidad 0.55 al hojear, 0.22 en trabajo
> denso, y el texto sobre vidrio. **No vuelvas a quitar la aurora de una pantalla.**

# Pantalla · Ajustes

> Fuente literal: `Corpus_ diseño completo/corpus-design/04-pantallas/ajustes.html` (917 líneas).
> Referencias: `06-handoff/handoff.md` · `06-handoff/copy.md` (§ Ajustes) · `00-README.md`.
>
> **Contrato:** los nombres de clase, el CSS y el copy de este documento se copian **literal**.
> El HTML es la referencia visual, no una sugerencia. Cero paráfrasis.
>
> Bloques `<style data-corpus-system="css">` (líneas 10–486) y `<script data-corpus-system="js">`
> (líneas 602–873) son la copia del sistema canónico (`02-sistema/*`) — **no se transcriben aquí**.
> Todo lo de abajo es lo ESPECÍFICO de la pantalla.

---

## 1 · Ruta y propósito

| | |
|---|---|
| **Ruta del producto** | `/app/ajustes` |
| **Archivo de diseño** | `04-pantallas/ajustes.html` |
| **`<title>`** | `Corpus — Ajustes` |
| **Estados (panel demo)** | `normal` · `ia apagada` · `porcelana` · `borrar` |

**Qué hace:** la pantalla donde el usuario cambia cuenta, idioma y tema (el tema **se aplica en vivo,
en esta misma página**), enciende o apaga la IA (con la explicación del *modo manual* como legítimo,
no degradado), pone su propia clave (BYOK), y ejerce sus derechos sobre sus datos: exportar todo o
borrar todo, con doble confirmación tipeada.

Comentario literal de cabecera del `<style>` de pantalla:

```
/* ── ajustes.html — MURO. El tema y la IA se cambian AQUÍ y se ve en vivo. ── */
```

---

## 2 · Ventana o muro · Aurora

**Es un MURO. NO monta la aurora.**

- No hay ninguna llamada a `CorpusAurora.mount(...)` en el `<script>` de pantalla (líneas 874–915).
  Las únicas apariciones de `CorpusAurora` en el archivo están **dentro** del bloque
  `data-corpus-system` (la definición del módulo y el `focusin`/`focusout` que la pausa).
- **No existe ningún elemento `.c-aurora` en el `<body>`.** Nadie lo crea: `mount()` es quien lo
  inyectaría, y no se llama.
- El `<script>` de pantalla solo usa `CorpusMotion` (`const … M = window.CorpusMotion;` → `M.boot()`).

Esto cumple la regla del handoff al pie de la letra:

> «Solo las VENTANAS la montan (auth, onboarding, importar, ingesta, dashboard vacío).
> **Los MUROS ni la montan.**» — *donde hay trabajo, el trabajo gana.*

### Gramática de capas en esta pantalla

| Clase | Dónde | Nota |
|---|---|---|
| `.c-wall` | `<main class="aj-main c-wall">` — **el único** | Fondo opaco `var(--bg)`. Cubre toda la zona de trabajo. |
| `.c-window` | **no se usa** | — |
| `.c-panel` | **no se usa** | — |
| `.c-scrim` | **no se usa** | — |
| `.c-aurora` | **no se usa** | No se monta ni se declara. |

El `.c-header` (sticky, `backdrop-filter:blur(4px)`) es del sistema y va sobre el muro; su
`backdrop-filter` aquí no revela humo alguno porque no hay humo detrás.

⚠️ **Riesgo de portado:** si en React la aurora se monta a nivel de layout/app, **esta ruta debe
desmontarla o no renderizarla**. Montarla “porque el layout la trae” rompe la gramática ventana/muro.

---

## 3 · Esqueleto DOM

`(S)` = clase del sistema (`c-*`, `t-*`, `hd-*`, `demo`) · `(P)` = clase propia de la pantalla.

```
<html lang="es" data-theme="dark">                     ← el tema arranca en "dark" (grafito)
└── <body>
    ├── div.c-page (S)
    │   ├── header.c-header (S)
    │   │   └── div.c-container (S)
    │   │       ├── a.c-logo (S)  href="dashboard.html"                       → "Corpus"
    │   │       ├── nav.hd-nav (S)
    │   │       │   ├── a href="dashboard.html"                               → "Panel"
    │   │       │   ├── a href="master.html"                                  → "Master"
    │   │       │   ├── a href="variantes.html"                               → "Variantes"
    │   │       │   └── a href="fuentes.html"                                 → "Fuentes"
    │   │       └── div.hd-right (S)
    │   │           ├── nav.hd-nav (S)  style="display:flex"   ← ⚠ inline: anula el
    │   │           │   │                                        @media(max-width:768px){.hd-nav{display:none}}
    │   │           │   └── a href="ajustes.html" aria-current="page"         → "Ajustes"
    │   │           ├── div.hd-lang (S)
    │   │           │   ├── span[data-on]                                     → "ES"
    │   │           │   └── span                                              → "EN"
    │   │           └── div.hd-av (S)                                         → "DG"
    │   │
    │   └── main.aj-main.c-wall (P)(S)   data-screen-label="ajustes"
    │       └── div.c-container.aj-col (S)(P)         ← max-width:760px, centrada
    │           ├── h2                                                        → "Ajustes"
    │           │
    │           ├── section.aj-g (P)  data-screen-label="ajustes-cuenta"
    │           │   ├── div.aj-gh (P)
    │           │   │   └── span.t-overline (S)                               → "Cuenta"
    │           │   ├── hr.c-divider (S)                       ← lo dibuja M.boot()
    │           │   └── div.aj-rows (P)
    │           │       ├── div.aj-row (P)
    │           │       │   ├── span.k (P) > b                                → "Nombre"
    │           │       │   └── span.v (P)
    │           │       │       └── input.c-input (S)  value="Diego Gatica Morales"
    │           │       │                              style="max-width:300px"
    │           │       └── div.aj-row (P)
    │           │           ├── span.k (P) > b                                → "Email"
    │           │           │              > span                             → "el de la cuenta, no el del CV"
    │           │           └── span.v (P)
    │           │               └── input.c-input (S)  value="diego.gatica@ejemplo.cl"
    │           │                                      style="max-width:300px"
    │           │
    │           ├── section.aj-g (P)  data-screen-label="ajustes-idioma-tema"
    │           │   ├── div.aj-gh (P) > span.t-overline (S)                   → "Idioma y tema"
    │           │   ├── hr.c-divider (S)
    │           │   └── div.aj-rows (P)
    │           │       ├── div.aj-row (P)
    │           │       │   ├── span.k (P) > b                                → "Idioma de la interfaz"
    │           │       │   │              > span                             → "tus CVs pueden ir en otro"
    │           │       │   └── span.v (P)
    │           │       │       └── span.aj-seg#segLang (P)
    │           │       │           ├── button[aria-pressed="true"]           → "Español"
    │           │       │           └── button[aria-pressed="false"]          → "English"
    │           │       └── div.aj-row (P)
    │           │           ├── span.k (P) > b                                → "Tema"
    │           │           │              > span                             → "grafito de noche, porcelana de día"
    │           │           └── span.v (P)
    │           │               ├── span.aj-seg#segTheme (P)
    │           │               │   ├── button[data-t="dark"]  aria-pressed="true"   → "Grafito"
    │           │               │   ├── button[data-t="light"] aria-pressed="false"  → "Porcelana"
    │           │               │   └── button[data-t="auto"]  aria-pressed="false"  → "Sistema"
    │           │               └── span  style="font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)"
    │           │                                                             → "se aplica al instante — mira alrededor"
    │           │
    │           ├── section.aj-g (P)  data-screen-label="ajustes-ia"
    │           │   ├── div.aj-gh (P) > span.t-overline (S)                   → "Inteligencia artificial"
    │           │   ├── hr.c-divider (S)
    │           │   ├── div.aj-rows (P)
    │           │   │   ├── div.aj-row (P)
    │           │   │   │   ├── span.k (P) > b                                → "IA activada"
    │           │   │   │   │              > span                             → "extracción · comparación · reformulación"
    │           │   │   │   └── span.v (P)
    │           │   │   │       ├── button.aj-sw#swIA (P)
    │           │   │   │       │     role="switch" aria-checked="true" aria-label="IA activada"
    │           │   │   │       └── span#iaLabel  style="font:400 var(--fs-data)/1.5 var(--font-sans);color:var(--text-muted)"
    │           │   │   │                                                     → "encendida — nunca inventa; …"
    │           │   │   └── div.aj-row (P)
    │           │   │       ├── span.k (P) > b                                → "Tu propia clave"
    │           │   │       │              > span                             → "BYOK — opcional"
    │           │   │       └── span.v (P)
    │           │   │           ├── span.aj-seg#segProv (P)
    │           │   │           │   ├── button[aria-pressed="true"]           → "Incluida"
    │           │   │           │   ├── button[aria-pressed="false"]          → "Anthropic"
    │           │   │           │   └── button[aria-pressed="false"]          → "Gemini"
    │           │   │           └── input.c-input#byok (S)  disabled
    │           │   │                 placeholder="sk-… (se cifra, solo se usa en tus extracciones)"
    │           │   │                 style="max-width:320px"
    │           │   └── div.aj-note#iaNote (P)                ← oculto por defecto (display:none)
    │           │        contiene <b>Modo manual — legítimo, no degradado.</b> … <b>origen: tú</b> …
    │           │
    │           └── section.aj-g.aj-danger (P)(P)  data-screen-label="ajustes-datos"
    │               ├── div.aj-gh (P)
    │               │   ├── span.t-overline (S)                               → "Tus datos"
    │               │   └── span  style="font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)"
    │               │                                                         → "sin permiso, sin retención hostil"
    │               ├── hr.c-divider (S)
    │               └── div.aj-rows (P)
    │                   ├── div.aj-row (P)
    │                   │   ├── span.k (P) > b                                → "Exportar todo"
    │                   │   │              > span                             → "JSON propio + resume.json estándar"
    │                   │   └── span.v (P)
    │                   │       ├── button.c-btn (S)                          → "Descargar mi registro completo"
    │                   │       └── span  style="font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)"
    │                   │                                                     → "master · variantes · overrides · evidencias"
    │                   └── div.aj-row (P)
    │                       ├── span.k (P) > b                                → "Borrar todo"
    │                       │              > span                             → "irreversible de verdad"
    │                       └── span.v (P)
    │                           ├── button.c-btn#btnDel (S)
    │                           │     style="border-color:color-mix(in srgb,var(--danger) 45%,transparent);color:var(--danger)"
    │                           │                                             → "Borrar mi cuenta y mis datos"
    │                           └── span.aj-confirm#delConfirm (P)            ← oculto por defecto (display:none)
    │                               ├── span  style="font:400 var(--fs-data)/1.5 var(--font-sans);color:var(--text-muted)"
    │                               │     → "Escribe " <b style="font-family:var(--font-mono)">BORRAR</b> " para confirmar:"
    │                               ├── input.c-input#delWord (S)  autocomplete="off"
    │                               ├── button.c-btn#btnDel2 (S)  disabled
    │                               │     style="background:var(--danger);border-color:transparent;color:#FFF"
    │                               │                                         → "Borrar definitivamente"
    │                               └── button.c-btn.c-btn--quiet#btnDelNo (S) → "cancelar"
    │
    └── div.demo (S)  role="group" aria-label="Estados de la pantalla (revisión de diseño)"
        ├── span                                                              → "demo"
        ├── button[data-st="normal"]     aria-pressed="true"                  → "normal"
        ├── button[data-st="ia-off"]     aria-pressed="false"                 → "ia apagada"
        ├── button[data-st="porcelana"]  aria-pressed="false"                 → "porcelana"
        └── button[data-st="borrar"]     aria-pressed="false"                 → "borrar"
```

### Inventario de atributos `data-*`

| Atributo | Valores en esta pantalla |
|---|---|
| `data-theme` (en `<html>`) | `dark` (inicial) · `light` (al elegir Porcelana) |
| `data-screen-label` | `ajustes` · `ajustes-cuenta` · `ajustes-idioma-tema` · `ajustes-ia` · `ajustes-datos` |
| `data-t` (botones de `#segTheme`) | `dark` · `light` · `auto` |
| `data-st` (botones del panel `demo`) | `normal` · `ia-off` · `porcelana` · `borrar` |
| `data-on` (en `.hd-lang span`) | presente en el `<span>` de `ES` |
| `data-visible` | lo pone `CorpusMotion.show()` sobre los `.c-divider` |

### Inventario de `id`

`segLang` · `segTheme` · `swIA` · `iaLabel` · `segProv` · `byok` · `iaNote` · `btnDel` ·
`delConfirm` · `delWord` · `btnDel2` · `btnDelNo`

---

## 4 · CSS específico de pantalla

Copia **verbatim** del `<style>` sin `data-corpus-system` (líneas 487–519 del archivo).
**No hay `@keyframes` propios en esta pantalla** — todo el movimiento sale de `motion.css` (sistema).

```css
/* ── ajustes.html — MURO. El tema y la IA se cambian AQUÍ y se ve en vivo. ── */
.aj-main{flex:1;padding:34px 0 130px}
.aj-col{max-width:760px;margin-inline:auto}
.aj-g{margin-top:34px}
.aj-gh{display:flex;align-items:baseline;gap:12px;padding-bottom:8px}
.aj-row{display:flex;gap:18px;align-items:center;padding:16px 20px;background:var(--surface);border:1px solid var(--border);border-top:0}
.aj-rows{border-top:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;margin-top:10px}
.aj-rows .aj-row:first-child{border-top:1px solid var(--border)}
.aj-row .k{min-width:170px}
.aj-row .k b{display:block;font:500 14px/1.3 var(--font-sans);color:var(--text)}
.aj-row .k span{display:block;margin-top:3px;font:400 var(--fs-micro)/1.6 var(--font-mono);color:var(--text-subtle)}
.aj-row .v{flex:1;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
/* segmentos */
.aj-seg{display:flex;border:1px solid var(--border-strong);border-radius:6px;overflow:hidden}
.aj-seg button{font:500 var(--fs-micro)/1 var(--font-mono);letter-spacing:.04em;padding:9px 13px;color:var(--text-muted)}
.aj-seg button[aria-pressed="true"]{color:var(--text);background:var(--surface-elevated);box-shadow:inset 0 0 0 1px var(--border-patina)}
/* switch */
.aj-sw{position:relative;width:42px;height:24px;border-radius:12px;background:var(--surface-sunken);border:1px solid var(--border-strong);transition:background .14s,border-color .14s;flex:none}
.aj-sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--text-muted);transition:transform .18s var(--ease-standard),background .14s}
.aj-sw[aria-checked="true"]{background:var(--patina-700);border-color:transparent}
.aj-sw[aria-checked="true"]::after{transform:translateX(18px);background:#EAF5F1}
.aj-note{margin-top:10px;padding:12px 16px;border:1px dashed var(--border-strong);border-radius:var(--radius-sm);
  font:400 var(--fs-data)/1.7 var(--font-sans);color:var(--text-muted);display:none}
.aj-note.show{display:block}
.aj-note b{color:var(--text);font-weight:500}
/* peligro con calma */
.aj-danger .aj-row{background:color-mix(in srgb,var(--danger) 3%,var(--surface))}
.aj-confirm{display:none;gap:8px;align-items:center;flex-wrap:wrap}
.aj-confirm.show{display:flex}
.aj-confirm input{max-width:200px;height:34px;font-size:var(--fs-data)}
@media (max-width:768px){.aj-row{flex-direction:column;align-items:flex-start}.aj-row .k{min-width:0}}
```

### Notas de lectura del CSS (no cambian nada — solo avisan)

- **Regla del borde doble, literal:** `.aj-rows` lleva `border-top:1px` **y** `.aj-rows .aj-row:first-child`
  vuelve a poner `border-top:1px`. El resultado es una línea de 2px arriba de cada grupo.
  **Repródúcelo tal cual.** No es un bug a “arreglar”: es la referencia visual.
- `.aj-row` tiene `border-top:0` y borde completo en los otros tres lados; el apilado + `overflow:hidden`
  de `.aj-rows` es lo que produce la tabla con esquinas redondeadas.
- `.k` y `.v` son nombres **genéricos** y solo funcionan por descendencia (`.aj-row .k`). En React con
  CSS global esto colisiona: si se usan CSS Modules, hay que mantener el selector descendiente y el
  nombre de clase emitido debe seguir siendo `k` / `v` bajo `.aj-row` (o encapsular en el módulo).
- `.show` es otro nombre genérico, compartido por `.aj-note.show` y `.aj-confirm.show`.
- `#EAF5F1` en `.aj-sw[aria-checked="true"]::after` es el **único hex crudo** fuera de tokens en toda
  la pantalla. Está en la referencia: cópialo, no lo “tokenices” por tu cuenta.
- `.aj-danger .aj-row` tiñe la fila con `color-mix(… var(--danger) 3% …)`: peligro **con calma**, no rojo.

---

## 5 · Estados del panel demo

El handoff declara para `/app/ajustes`: **`normal · ia apagada · porcelana · borrar`**.
El panel `demo` no es producto: es convención de entrega. Todo estado se activa con **clic** en su
botón, que ejecuta el mismo handler para los cuatro:

```js
$$('.demo button').forEach(b=>b.onclick=()=>{
  $$('.demo button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  const st=b.dataset.st;
  theme(st==='porcelana'?'light':'dark');
  ia(st!=='ia-off');
  if(st==='borrar')$('#btnDel').click();else $('#btnDelNo').click();
});
```

Es decir: **cada estado fija los tres ejes a la vez** (tema, IA, confirmación de borrado).

| Estado (`data-st`) | Etiqueta | Qué cambia en el DOM |
|---|---|---|
| `normal` | `normal` | `<html data-theme="dark">` · `#segTheme` → `Grafito` con `aria-pressed="true"` · `#swIA` `aria-checked="true"` · `#iaLabel` = «encendida — nunca inventa; solo selecciona, reordena y reformula con origen» · `#iaNote` **sin** `.show` · `#delConfirm` **sin** `.show` · `#btnDel` con `style.display=''` · `#delWord` vacío · `#btnDel2` `disabled` |
| `ia-off` | `ia apagada` | Tema `dark`. `#swIA` `aria-checked="false"` · `#iaLabel` = «apagada — modo manual completo» · `#iaNote` **con** `.show` (aparece la nota punteada del *modo manual*). Confirmación de borrado cerrada. |
| `porcelana` | `porcelana` | `<html data-theme="light">` — **cambio de tema en vivo, sin recarga**: toda la paleta pasa a PORCELANA (el acento se vuelve `patina-700`). `#segTheme` → `Porcelana` `aria-pressed="true"`. IA encendida. |
| `borrar` | `borrar` | Tema `dark`, IA encendida, y se dispara `$('#btnDel').click()` → `#delConfirm` recibe `.show` (`display:flex`), `#btnDel` pasa a `style.display='none'`, y el foco salta a `#delWord`. `#btnDel2` sigue `disabled` hasta escribir `BORRAR`. |

**Ojo con el estado `ia-off`:** la función `ia(false)` **no** toca `#segProv` ni el `disabled` de
`#byok`. Con la IA apagada, la fila «Tu propia clave» sigue exactamente igual. Ver §Contradicciones.

---

## 6 · Comportamiento JS de la pantalla

Todo el JS **fuera** de `data-corpus-system` (líneas 874–915). Copia literal:

```js
(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], M=window.CorpusMotion;
/* tema en vivo */
function theme(t){
  document.documentElement.dataset.theme=t==='auto'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;
  $$('#segTheme button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.t===t)));
}
$$('#segTheme button').forEach(b=>b.onclick=()=>theme(b.dataset.t));
/* IA */
function ia(on){
  $('#swIA').setAttribute('aria-checked',String(on));
  $('#iaLabel').textContent=on?'encendida — nunca inventa; solo selecciona, reordena y reformula con origen'
    :'apagada — modo manual completo';
  $('#iaNote').classList.toggle('show',!on);
}
$('#swIA').onclick=()=>ia($('#swIA').getAttribute('aria-checked')!=='true');
/* BYOK */
$$('#segProv button').forEach(b=>b.onclick=()=>{
  $$('#segProv button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  $('#byok').disabled=b.textContent==='Incluida';
  if(!$('#byok').disabled)$('#byok').focus();
});
/* borrar: doble confirmación tipeada */
$('#btnDel').onclick=()=>{$('#delConfirm').classList.add('show');$('#btnDel').style.display='none';$('#delWord').focus()};
$('#btnDelNo').onclick=()=>{$('#delConfirm').classList.remove('show');$('#btnDel').style.display='';$('#delWord').value='';$('#btnDel2').disabled=true};
$('#delWord').addEventListener('input',()=>{$('#btnDel2').disabled=$('#delWord').value.trim()!=='BORRAR'});
$('#btnDel2').onclick=()=>alert('Mock: aquí se borra todo, de verdad, y se confirma por correo.');
/* otros segmentos */
$$('#segLang button').forEach(b=>b.onclick=()=>$$('#segLang button').forEach(x=>x.setAttribute('aria-pressed',String(x===b))));
/* demo */
$$('.demo button').forEach(b=>b.onclick=()=>{
  $$('.demo button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  const st=b.dataset.st;
  theme(st==='porcelana'?'light':'dark');
  ia(st!=='ia-off');
  if(st==='borrar')$('#btnDel').click();else $('#btnDelNo').click();
});
M.boot();
})();
```

### Desglose de la lógica

1. **`theme(t)`** — el corazón de la pantalla. Escribe `document.documentElement.dataset.theme`.
   - `'dark'` / `'light'` → se escriben tal cual.
   - `'auto'` → **se resuelve inmediatamente** consultando `matchMedia('(prefers-color-scheme: light)')`
     y se escribe `light` o `dark`. **`data-theme="auto"` nunca llega al DOM.**
   - `aria-pressed` de los tres botones se recalcula comparando `b.dataset.t === t` (con `'auto'`, el
     botón *Sistema* queda presionado aunque el `data-theme` diga `dark`/`light`).
   - **No se persiste** (ni `localStorage` ni cookie) y **no se suscribe** a cambios del sistema
     operativo (no hay `addEventListener('change')` sobre el `matchMedia`).

2. **`ia(on)`** — tres efectos:
   - `#swIA` → `aria-checked = String(on)` (el CSS del switch reacciona solo a este atributo).
   - `#iaLabel` → `textContent` conmuta entre las dos frases (§7).
   - `#iaNote` → `classList.toggle('show', !on)` — la nota del *modo manual* solo existe con la IA apagada.
   - El toggle del switch lee el atributo, no un estado JS: `ia($('#swIA').getAttribute('aria-checked')!=='true')`.

3. **BYOK (`#segProv`)** — al elegir proveedor:
   - `aria-pressed` exclusivo sobre los tres botones.
   - `#byok.disabled = (b.textContent === 'Incluida')` ← **la comparación es por TEXTO del botón**.
     ⚠️ Esto se rompe en cuanto se traduce la UI a inglés. En React, usar un `value`/`data-*`, pero
     manteniendo los rótulos literales.
   - Si queda habilitado, se le da **foco automático** al input.
   - `focusin` sobre el input (handler del sistema) llamaría a `CorpusAurora.pause('focus')` — aquí es
     inocuo porque la aurora no está montada (`S.ok === false` → `pause()` retorna sin hacer nada).

4. **Borrado con doble confirmación tipeada:**
   - `#btnDel` (clic) → `.aj-confirm#delConfirm` recibe `.show`, `#btnDel` se oculta con
     `style.display='none'`, y el foco va a `#delWord`.
   - `#delWord` (`input`) → `#btnDel2.disabled = value.trim() !== 'BORRAR'`. **Comparación literal,
     sensible a mayúsculas, con `trim()`.**
   - `#btnDel2` (clic) → `alert('Mock: aquí se borra todo, de verdad, y se confirma por correo.')`.
   - `#btnDelNo` (clic) → cierra: quita `.show`, restaura `#btnDel` (`style.display=''`), **vacía**
     `#delWord` y vuelve a `disabled` el `#btnDel2`.

5. **`#segLang`** — solo mueve `aria-pressed`. **No cambia el idioma de nada** (es maqueta).

6. **Panel `demo`** — ver §5.

7. **`M.boot()`** — última línea. `CorpusMotion.boot()`:
   - `document.querySelectorAll('.c-divider')` → `raf2(() => show(d))` sobre los **4 hairlines**
     (Cuenta, Idioma y tema, Inteligencia artificial, Tus datos) → cada uno recibe `data-visible` y
     se dibuja con `transform:scaleX(0→1)` en `1s var(--ease-signature)`. **Sin escalonado**
     (`--d` no se fija): los cuatro se dibujan a la vez.
   - `document.querySelectorAll('[data-reveal]:not([data-visible])')` → **no hay ninguno** en esta
     pantalla; ese barrido no hace nada.

### Llamadas a APIs del sistema

| API | ¿Se usa? | Dónde |
|---|---|---|
| `CorpusAurora.mount()` | **NO** | — (es un MURO) |
| `CorpusAurora.setState/pause/resume/setStrength` | **NO** (directamente) | El sistema pausa en `focusin`; sin efecto aquí. |
| `CorpusMotion.boot()` | **SÍ** | última línea del script de pantalla |
| `CorpusMotion.stagger / reveal / words / chars / counter / shimmer / xray / enter / io` | **NO** | — |

**No hay atajos de teclado propios en esta pantalla.** (Los `j/k/a/d/o` del handoff son de staging.)

---

## 7 · Copy (verbatim, ES)

`[copy.md]` = está literal en `06-handoff/copy.md` § Ajustes · `[—]` = solo existe en el HTML.

### Cabecera (sistema, compartida)

| Cadena | Origen |
|---|---|
| `Corpus` (logo) | `[—]` |
| `Panel` · `Master` · `Variantes` · `Fuentes` · `Ajustes` (nav) | `[—]` |
| `ES` · `EN` (selector de idioma del header) | `[—]` |
| `DG` (avatar) | `[—]` |

### Título

| Cadena | Origen |
|---|---|
| `Ajustes` | `[—]` |

### Grupo · Cuenta

| Cadena | Origen |
|---|---|
| `Cuenta` (overline) | `[—]` |
| `Nombre` | `[—]` |
| `Diego Gatica Morales` (valor del campo) | `[—]` (persona canónica del handoff) |
| `Email` | `[—]` |
| `el de la cuenta, no el del CV` | `[—]` |
| `diego.gatica@ejemplo.cl` (valor del campo) | `[—]` |

### Grupo · Idioma y tema

| Cadena | Origen |
|---|---|
| `Idioma y tema` (overline) | `[—]` |
| `Idioma de la interfaz` | `[—]` |
| `tus CVs pueden ir en otro` | `[—]` |
| `Español` · `English` | `[—]` |
| `Tema` | `[—]` |
| `grafito de noche, porcelana de día` | `[—]` |
| `Grafito` · `Porcelana` · `Sistema` | `[—]` |
| `se aplica al instante — mira alrededor` | `[—]` |

### Grupo · Inteligencia artificial

| Cadena | Origen |
|---|---|
| `Inteligencia artificial` (overline) | `[—]` |
| `IA activada` | `[—]` |
| `extracción · comparación · reformulación` | `[—]` |
| `encendida — nunca inventa; solo selecciona, reordena y reformula con origen` (`#iaLabel`, estado ON) | `[—]` (JS) |
| `apagada — modo manual completo` (`#iaLabel`, estado OFF) | `[—]` (JS) |
| `Tu propia clave` | `[—]` |
| `BYOK — opcional` | `[—]` |
| `Incluida` · `Anthropic` · `Gemini` | `[—]` |
| `sk-… (se cifra, solo se usa en tus extracciones)` (placeholder de `#byok`) | **`[copy.md]`** · «BYOK» |

**Nota `#iaNote` (visible solo con la IA apagada) — `[copy.md]` § Ajustes · «IA apagada», verbatim:**

> **Modo manual — legítimo, no degradado.** Se apagan: el volcado con extracción, el análisis de avisos
> y las reformulaciones. Sigue todo lo demás: master, variantes, overrides, preview-igual-al-PDF,
> rayos-X del ATS y salud. Los items que escribas quedan con **origen: tú** — el más verificable de todos.

*(En el HTML, los `<b>` envuelven exactamente `Modo manual — legítimo, no degradado.` y `origen: tú`.)*

### Grupo · Tus datos

| Cadena | Origen |
|---|---|
| `Tus datos` (overline) | `[—]` |
| `sin permiso, sin retención hostil` | `[—]` |
| `Exportar todo` | `[—]` |
| `JSON propio + resume.json estándar` | **`[copy.md]`** · «exportar» (fragmento entre paréntesis) |
| `Descargar mi registro completo` | **`[copy.md]`** · «exportar» |
| `master · variantes · overrides · evidencias` | **`[copy.md]`** · «exportar» |
| `Borrar todo` | `[—]` |
| `irreversible de verdad` | **`[copy.md]`** · «borrar» |
| `Borrar mi cuenta y mis datos` | **`[copy.md]`** · «borrar» |
| `Escribe ` **`BORRAR`** ` para confirmar:` | **`[copy.md]`** · «borrar» (el HTML añade los dos puntos finales) |
| `Borrar definitivamente` | `[—]` |
| `cancelar` (minúscula, literal) | `[—]` |
| `Mock: aquí se borra todo, de verdad, y se confirma por correo.` (`alert()`) | `[—]` — **texto de maqueta, NO va a producción** |

### Panel demo (no es producto)

| Cadena | Origen |
|---|---|
| `demo` · `normal` · `ia apagada` · `porcelana` · `borrar` | `[—]` (los cuatro estados coinciden con `handoff.md`) |
| `Estados de la pantalla (revisión de diseño)` (`aria-label`) | `[—]` |

**Copy de `copy.md` § Ajustes que NO aparece en esta pantalla:** ninguno. Las cuatro entradas
(IA apagada · BYOK · exportar · borrar) están las cuatro presentes.

---

## 8 · Accesibilidad

### Roles y `aria-*` que EXISTEN en el HTML (reprodúcelos tal cual)

| Elemento | Atributos |
|---|---|
| `a[href="ajustes.html"]` (nav derecha) | `aria-current="page"` |
| `#swIA` (`<button class="aj-sw">`) | `role="switch"` · `aria-checked="true|false"` · `aria-label="IA activada"` |
| `#segLang button` ×2 | `aria-pressed="true|false"` |
| `#segTheme button` ×3 | `aria-pressed="true|false"` + `data-t` |
| `#segProv button` ×3 | `aria-pressed="true|false"` |
| `#byok` | `disabled` (inicial) · `placeholder` |
| `#delWord` | `autocomplete="off"` |
| `#btnDel2` | `disabled` (hasta escribir `BORRAR`) |
| `.demo` | `role="group"` · `aria-label="Estados de la pantalla (revisión de diseño)"` |
| `.demo button` | `aria-pressed` |

### Foco

- Anillo del sistema: `:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px;border-radius:2px}`
  (`--focus-ring` = `patina-300` en grafito, `patina-700` en porcelana).
- **Orden de tabulación** (natural, sin `tabindex`):
  `Corpus` → `Panel` → `Master` → `Variantes` → `Fuentes` → `Ajustes` →
  *(los `<span>` de `ES`/`EN` y el `div.hd-av` NO son focusables)* →
  `input Nombre` → `input Email` →
  `Español` → `English` →
  `Grafito` → `Porcelana` → `Sistema` →
  `#swIA` →
  `Incluida` → `Anthropic` → `Gemini` → *(`#byok` está `disabled`: se salta)* →
  `Descargar mi registro completo` → `#btnDel` → *(`#delConfirm` oculto: se salta)* →
  botones del panel `demo`.
- **Movimientos de foco programáticos:**
  - Elegir `Anthropic`/`Gemini` → `#byok.focus()`.
  - Clic en `#btnDel` → `#delWord.focus()`.
  - Clic en `#btnDelNo` → **el foco NO vuelve a `#btnDel`** (que se acaba de re-mostrar). Queda huérfano
    en `<body>`. **Gap real** — al portar, devolver el foco a `#btnDel`.

### Atajos de teclado

**Ninguno propio.** Los segmentos y el switch responden solo a `click` (que el navegador dispara con
`Enter`/`Space` sobre `<button>`, así que el teclado sí funciona — pero **sin navegación con flechas**
dentro de los segmentos).

### Hit targets (contra el handoff: «hit targets móviles ≥ 44 px»)

| Control | Alto real | ¿≥44px? |
|---|---|---|
| `.aj-seg button` | `9px + 11px(line-height 1) + 9px` ≈ **29px** | ❌ |
| `.aj-sw` | **24px** (42×24) | ❌ |
| `.aj-confirm input` (`#delWord`) | **34px** | ❌ |
| `.c-btn` (Descargar, Borrar, cancelar) | `var(--control-h)` = **40px** | ❌ (por 4px) |
| `.c-input` (Nombre, Email, BYOK) | `10+~22+10` ≈ **42px** | ❌ (por 2px) |
| `.demo button` | ≈ **20px** | ❌ (pero el panel demo **no es producto**) |

**Contradicción documentada.** Ver §Contradicciones: el HTML de referencia incumple su propio handoff.

### Gaps de accesibilidad presentes en la referencia (documentados, no “arreglados” aquí)

- **Inputs sin nombre accesible:** `Nombre`, `Email` y `#delWord` no tienen `<label for>`, ni
  `aria-label`, ni `aria-labelledby`. El `<b>` dentro de `.k` es solo visual. `#byok` solo tiene
  `placeholder` (que no es un nombre accesible fiable).
- **Sin live region:** `#iaLabel` cambia de texto y `#iaNote` aparece/desaparece **sin** `aria-live`.
  Un lector de pantalla no anuncia el cambio de modo. Tampoco hay `aria-describedby` que ate `#iaNote`
  al `#swIA`.
- **`aria-label="IA activada"` es fijo:** no se actualiza a “IA desactivada” al apagarla. El estado sí
  lo comunica `aria-checked`, así que es aceptable, pero el rótulo suena a afirmación.
- **Segmentos con `aria-pressed`** en vez de `role="radiogroup"`/`role="radio"` + `aria-checked`.
  Es lo que dice la referencia — **respétalo**; si el equipo quiere mejorarlo, es una decisión de
  producto a consultar, no una licencia del implementador.
- **`alert()`** como confirmación final: modal nativo del navegador, sin control de foco propio.
- **Contraste de `#btnDel2`:** texto `#FFF` sobre `background:var(--danger)`. En grafito
  (`--danger:#E06055`) el ratio es **≈3.5:1 → falla AA (4.5:1)** para 13px/500. En porcelana
  (`--danger:#B23B31`) es ≈5.9:1 ✓. Ver §Contradicciones.

---

## 9 · Datos del mock

Persona canónica del paquete (handoff §Datos del mock): **Diego Gatica** — ficticio, la misma historia
en todas las pantallas y en `datos-ejemplo.json`.

| Dato | Valor literal en esta pantalla |
|---|---|
| Nombre completo (campo `Nombre`) | `Diego Gatica Morales` |
| Email de la cuenta | `diego.gatica@ejemplo.cl` |
| Iniciales del avatar (`.hd-av`) | `DG` |
| Idioma de la interfaz | `Español` (activo) · `English` (inactivo) |
| Idioma del header (`.hd-lang`) | `ES` con `data-on` · `EN` |
| Tema | `Grafito` (activo) · `Porcelana` · `Sistema` |
| `<html data-theme>` inicial | `dark` |
| IA | **encendida** (`aria-checked="true"`) |
| Proveedor de IA | `Incluida` (activo) · `Anthropic` · `Gemini` |
| Clave BYOK | **vacía y `disabled`** — solo el placeholder `sk-…` |
| Palabra de confirmación de borrado | `BORRAR` |

⚠️ **Coherencia entre pantallas:** aquí el nombre lleva apellido materno (`Diego Gatica Morales`) y el
handoff lo llama solo `Diego Gatica`. Verifica contra `05-documento-cv/datos-ejemplo.json` y contra
`master.html` / los CVs antes de fijar el nombre en el mock de React: **si tocas uno, persigue el resto.**

---

## 10 · Números en la UI

**Recuento: CERO. Esta pantalla no muestra ni un solo número al usuario.**

Se verificó carácter a carácter sobre el `<body>` (líneas 521–600): todos los dígitos del archivo
viven en **atributos y estilos inline** (`max-width:300px`, `color-mix(… 45% …)`, `font:400 …`,
`h2`), **nunca en un nodo de texto visible**.

| Número visible | Fuente |
|---|---|
| — | — |

### Por qué importa

- Cumple sin fisuras la regla 4 del handoff («Ningún número sin fuente en la UI; el progreso jamás
  muestra %») y la 6 del README («Sin *ATS score*, sin porcentajes de match, sin umbrales inventados»).
- **No hay score, ni %, ni confidence, ni contadores.** Nada sospechoso que reportar.
- Los *únicos* “datos” de la pantalla son cadenas del usuario (`Diego Gatica Morales`,
  `diego.gatica@ejemplo.cl`) y rótulos.

### Al implementar en React — no introduzcas números aquí

Es tentador “enriquecer” Ajustes con cifras de uso: *“52 items en tu master”*, *“7 variantes”*,
*“84% de tu cuota de IA”*, *“última exportación hace 3 días”*. **La referencia dice que no.**
Si el producto quiere un número, tendrá que traer su fuente y pasar por diseño. Cualquier cifra
añadida en esta ruta es una regresión contra el posicionamiento (§«¿Por qué esto no es otro Rezi?»).

---

## Contradicciones y ambigüedades detectadas

1. **Hit targets < 44px vs. `handoff.md`.** El handoff exige «hit targets móviles ≥ 44 px», y la
   pantalla entrega segmentos de ≈29px, un switch de 24px, un `#delWord` de 34px y `.c-btn` de 40px.
   El `@media (max-width:768px)` solo apila las filas: **no agranda ningún control.**
   → *Decidir con diseño:* ¿se reproduce literal (y se incumple el handoff), o se aumenta el alto solo
   en el breakpoint móvil? **No lo decidas tú.**

2. **Contraste de `#btnDel2` en grafito.** `color:#FFF` sobre `--danger:#E06055` ≈ **3.5:1**, por debajo
   de AA. El sistema presume «contrastes verificados uno a uno» — este botón no pasó por esa verificación
   (la regla escrita solo cubre *pátina*, no *danger*). En porcelana sí pasa (≈5.9:1).

3. **`ia(false)` no desactiva el bloque BYOK.** Con la IA apagada, «Tu propia clave» sigue operativa:
   se puede elegir `Anthropic` y escribir una `sk-…` que, por definición, no se usará. Incoherencia de
   producto, no de CSS. La nota dice «Se apagan: el volcado con extracción, el análisis de avisos y las
   reformulaciones» — es decir, **todo** lo que consumiría esa clave.

4. **`'auto'` (Sistema) no persiste ni reacciona.** `theme('auto')` resuelve una vez y escribe
   `dark`/`light`. No hay `localStorage`, ni listener de `prefers-color-scheme`, ni `data-theme="auto"`.
   Además, **el panel demo pisa la elección** (`theme(st==='porcelana'?'light':'dark')`), así que al
   pulsar cualquier estado demo se pierde el `Sistema`.

5. **`BORRAR` está hardcodeado y no se traduce.** `copy.md` da la versión EN: «Type **DELETE**».
   El `#segLang` de esta misma pantalla ofrece `English` pero no cambia nada — y aunque lo cambiara,
   `value.trim() !== 'BORRAR'` seguiría exigiendo la palabra española. En React, la palabra de
   confirmación debe salir del i18n **y** el `<b>` visible debe mostrar la misma palabra que se valida.

6. **`#byok.disabled = (b.textContent === 'Incluida')`: la lógica depende del texto del botón.**
   Es un acoplamiento entre copy y comportamiento que se rompe al traducir. Usa un `value`/`data-*`
   en la implementación, **sin cambiar el rótulo visible**.

7. **Borde superior doble en `.aj-rows`.** `.aj-rows{border-top:1px}` + `.aj-rows .aj-row:first-child{border-top:1px}`
   = 2px. Parece un descuido, pero **es la referencia visual**: repródúcelo. Si diseño quiere 1px, que
   lo diga diseño.

8. **`.c-page` es `display:flex; flex-direction:column`, y `.aj-main` es `flex:1`.** Fácil de perder al
   portar si el layout de React mete un wrapper entre medio: el muro dejaría de llenar el alto de la
   ventana y aparecería `var(--bg)` sin `min-height:100vh` por debajo.

9. **Presupuesto de pátina.** Hay **cuatro** superficies con pátina: los tres `.aj-seg` con
   `box-shadow:inset 0 0 0 1px var(--border-patina)` (hairlines, aceptables) y el `.aj-sw` con relleno
   `var(--patina-700)` (**el único “dominante”**). Está en el límite de «≤ 1 elemento de pátina dominante
   por vista». No añadas más acento verde a esta pantalla.

---

## Riesgos de implementación en React (lo que se rompe si no lo cuidas)

- **Montar la aurora aquí.** Si el layout la trae, esta ruta debe **no renderizarla**. Es un MURO.
- **Renombrar clases.** `aj-main`, `aj-col`, `aj-g`, `aj-gh`, `aj-rows`, `aj-row`, `k`, `v`, `aj-seg`,
  `aj-sw`, `aj-note`, `aj-danger`, `aj-confirm`, `show`. **El contrato son los nombres.**
- **Perder los estilos inline.** `max-width:300px` / `320px`, los `font:400 var(--fs-micro)…`, el
  `style="display:flex"` del segundo `.hd-nav`, y los tres `style` de los botones de borrado. **No son
  ruido: son la referencia visual.** Si los mueves a clases, el resultado renderizado debe ser idéntico.
- **Sustituir `display:none/flex` por desmontaje.** `#iaNote` y `#delConfirm` se muestran con clase
  `.show`, no se crean ni se destruyen. Con `hidden`/desmontaje se pierde nada visual, pero el
  `transition` del switch y el `focus()` sobre `#delWord` dependen de que el nodo exista al hacer clic.
- **Reimplementar `.aj-sw` como `<input type="checkbox">`.** El CSS ataca `[aria-checked="true"]` en un
  `<button role="switch">`. Cambiar el elemento mata el switch entero (`::after`, `translateX(18px)`,
  el relleno `patina-700`).
- **Los 4 `<hr class="c-divider">` y `M.boot()`.** En React hay que llamar al equivalente de `boot()`
  tras el montaje (efecto), o los hairlines se quedan en `scaleX(0)` — **invisibles**. Es la única
  animación propia de la pantalla.
- **`document.documentElement.dataset.theme`.** El cambio de tema es global (en `<html>`), no de un
  contexto React. Debe escribirse en el elemento raíz del documento, no en un `<div>` de la app, o los
  tokens no cascadean.
- **Contraste en porcelana.** Al cambiar a `light`, `--accent` pasa a `patina-700`. Comprueba en vivo:
  la pantalla es literalmente el sitio donde se prueba el tema.
- **`alert()` es maqueta.** Sustitúyelo por el flujo real de borrado; el texto
  «Mock: aquí se borra todo…» **no debe llegar a producción**.
- **Foco tras cancelar el borrado.** Devuélvelo a `#btnDel`; la referencia lo pierde.