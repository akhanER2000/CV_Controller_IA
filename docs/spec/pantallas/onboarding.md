# onboarding — spec de implementación

> Fuente literal: `Corpus_ diseño completo/corpus-design/04-pantallas/onboarding.html` (46.663 bytes).
> Referencias: `06-handoff/handoff.md` · `06-handoff/copy.md` · `00-README.md`.
> **El HTML es la referencia visual literal.** Los nombres de clase son el contrato diseño↔código:
> no se renombran, no se "mejoran", no se simplifican.
> Los bloques `<style data-corpus-system="css">` (líneas 10–486) y `<script data-corpus-system="js">`
> (líneas 576–847) son la **copia del sistema canónico** (`02-sistema/*`) — no se transcriben aquí.
> Este documento cubre **solo lo específico de la pantalla**.

---

## 1 · Ruta y propósito

| | |
|---|---|
| **Ruta del producto** | `/app/onboarding` |
| **Archivo de diseño** | `04-pantallas/onboarding.html` |
| **`<title>`** | `Corpus — Empezar · las dos puertas` |
| **Estados demo (handoff)** | `puertas` · `plantillas` |
| **`<html>`** | `lang="es" data-theme="dark"` |

**Qué hace:** presenta las **dos puertas de entrada al master** — escribirlo tú (sin IA, desde
plantilla de rol o en blanco) o volcarlo (con IA, extracción con evidencia) — y deja claro que las
dos terminan en el mismo staging y el mismo master. La puerta A expande in-situ una parrilla de
plantillas de perfil; la puerta B es un enlace directo a `/app/importar`.

Comentario del propio CSS de la pantalla (línea 488), que es la tesis de la vista:

```
/* ── onboarding.html — VENTANA. Dos puertas, ninguna de segunda. ── */
```

---

## 2 · Ventana o muro · Aurora

**Es una VENTANA. Monta la aurora.**

- `CorpusAurora.mount({state:'calm'})` — línea 852, primera instrucción del script de pantalla.
- Estado: **`'calm'`** (la aurora respira). **Nunca `'active'`** aquí: `active` = "la máquina
  pensando" y está reservado a la ingesta (`00-README.md` §4, `aurora.js` línea 695).
- **No hay `<div class="c-aurora">` en el markup.** `CorpusAurora.mount()` lo crea y lo hace
  `document.body.prepend(...)` con `aria-hidden="true"` si no lo encuentra. En React: el contenedor
  lo inyecta el módulo de aurora, no el JSX de la pantalla.

| Sección | Clase de la gramática | Nota |
|---|---|---|
| `<main class="ob-main c-window">` | **`.c-window`** | Fondo transparente: el humo se ve. Es la única declaración de gramática de la pantalla. |
| `<header class="c-header">` | — | Ni ventana ni muro: usa su propio `backdrop-filter` + `color-mix(bg 74%)`. |
| `.ob-door` (`.c-card`) | — | Superficie opaca `--surface` (viene de `.c-card`), sobre la ventana. |
| `.ob-tpl .rows > a` | — | `background:var(--surface)` opaco. |

**No se usa** `.c-wall`, **ni** `.c-wall--surface`, **ni** `.c-panel`, **ni** `.c-scrim` /
`.c-scrim--soft` / `.c-scrim--edge` en esta pantalla. El texto (`h1`, `.ob-sub`, `.ob-note`) va
**directo sobre la ventana, sin velo** — el contraste lo sostienen los tokens.

Recordatorio de la regla (`00-README.md` §4 y `handoff.md`): *"donde hay trabajo, el trabajo gana"* —
los muros **ni montan la aurora**. Onboarding no es trabajo: es una puerta. Por eso es ventana y por
eso monta. Las ventanas que montan aurora son: auth, **onboarding**, importar, ingesta y dashboard
vacío.

**Pausa automática:** `motion.js` pausa la aurora con `focusin` sobre
`input,textarea,select,[contenteditable]`. En esta pantalla **no hay ningún campo de formulario**, así
que ese cableado no se dispara nunca aquí — pero debe existir igual (es del sistema, no de la
pantalla). También se pausa con `visibilitychange`.

---

## 3 · Esqueleto DOM

Leyenda: **(S)** = clase del sistema (`c-*`, `t-*`, `hd-*`, `demo`) · **(P)** = clase propia de la pantalla.

```
body
└── div.c-page                                                    (S)
    ├── header.c-header                                           (S)
    │   └── div.c-container                                       (S)
    │       ├── a.c-logo[href="dashboard.html"]                   (S)   → "Corpus"
    │       ├── span[style="margin-left:14px;font:500 var(--fs-micro)/1 var(--font-mono);
    │       │            letter-spacing:.14em;color:var(--text-muted)"]  → "EMPEZAR"
    │       │        (⚠ estilo INLINE, no hay clase; no es .t-overline)
    │       └── div.hd-right                                      (S)
    │           ├── div.hd-lang                                   (S)
    │           │   ├── span[data-on]  → "ES"
    │           │   └── span           → "EN"
    │           └── div.hd-av          → "DG"                     (S)
    │
    └── main.ob-main.c-window[data-screen-label="onboarding"]     (P)+(S)
        │
        ├── span.t-overline#ov                                    (S)
        │        → "Un master, N variantes — partamos por el master"
        │        (sin data-reveal · lo anima CorpusMotion.chars)
        │
        ├── h1.ob-h1#h1[style="margin-top:20px"]                  (P)
        │        → "¿Cómo prefieres " + <em>empezar?</em>
        │        (sin data-reveal · lo anima CorpusMotion.words)
        │
        ├── p.ob-sub[data-reveal][style="--d:480ms"]              (P)
        │
        ├── div.ob-doors                                          (P)
        │   │   (el contenedor NO lleva data-reveal; lo llevan las dos puertas)
        │   │
        │   ├── div.c-card.c-lift.ob-door#doorA                   (S)(S)(P)
        │   │       [data-reveal][style="--d:600ms"]
        │   │       [data-screen-label="onboarding-puerta-manual"]
        │   │   ├── span.t-overline      (S)  → "Puerta A · sin IA"
        │   │   ├── h3                        → "Escribirlo tú"
        │   │   ├── p                         → cuerpo, con
        │   │   │     └── b[style="color:var(--text);font-weight:500"] → "origen: tú"
        │   │   ├── p.fine               (P)  → "bien para: …"
        │   │   └── span.go#goA          (P)  → "Elegir plantilla ▾"   (texto mutable)
        │   │
        │   └── a.c-card.c-lift.ob-door[href="importar.html"]     (S)(S)(P)
        │           [data-reveal][style="--d:680ms"]
        │           [data-screen-label="onboarding-puerta-ia"]
        │       ├── span.t-overline      (S)  → "Puerta B · con IA"
        │       ├── h3                        → "Volcarlo"
        │       ├── p                         → cuerpo, con
        │       │     └── b[style="color:var(--text);font-weight:500"] → "tú confirmas item por item"
        │       ├── p.fine               (P)  → "bien para: …"
        │       └── span.go              (P)  → "Ir al volcado →"
        │
        ├── div.ob-tpl#tpl[data-screen-label="onboarding-plantillas"]   (P)
        │   │   (visibilidad por clase .open → display:block · NO usa [hidden])
        │   ├── div.gh                   (P)
        │   │   └── span.t-overline      (S)  → "Plantillas de perfil — estructura vacía, cero texto inventado"
        │   ├── hr.c-divider             (S)  (se dibuja con scaleX; lo activa M.boot)
        │   └── div.rows[style="margin-top:12px"]                 (P)
        │       ├── a[href="master.html"]   → b "Backend / plataforma" + span "roles · viñetas XYZ · …"
        │       ├── a[href="master.html"]   → b "Data / IA"            + span
        │       ├── a[href="master.html"]   → b "Diseño"               + span
        │       ├── a[href="master.html"]   → b "Producto"             + span
        │       ├── a[href="master.html"]   → b "En blanco"            + span
        │       └── a[href="importar.html"] → b "Mejor, vuélcalo →"    + span "cambiar a la puerta B"
        │           (6 celdas · grid 3 columnas · b y span son selectores de tipo, sin clase)
        │
        └── p.ob-note[data-reveal][style="--d:760ms"]             (P)

div.demo[role="group"][aria-label="Estados de la pantalla (revisión de diseño)"]   (S)
├── span                                     → "demo"
├── button[data-st="puertas"][aria-pressed="true"]     → "puertas"
└── button[data-st="plantillas"][aria-pressed="false"] → "plantillas"
```

### Detalles que se pierden si se "interpretan"

- Los `<b>` dentro de los `<p>` de las puertas llevan **estilo inline**
  `style="color:var(--text);font-weight:500"`. No hay clase. Reprodúcelo tal cual.
- El `<em>` dentro del `h1` es **parte del copy** (`¿Cómo prefieres <em>empezar?</em>`): la itálica
  de Playfair Display es intencional (la familia se carga con `ital,wght@…;1,500`).
- `.ob-tpl b` y `.ob-tpl span` son **selectores de tipo**: en React hay que emitir `<b>` y `<span>`
  reales dentro de cada `<a>`, no `<div className="…">`.
- `hd-av` = `DG` (Diego Gatica). No es un placeholder cualquiera.
- `data-screen-label` está en 4 nodos (`main`, `#doorA`, puerta B, `#tpl`). Consérvalos: son la
  telemetría/QA del paquete.

### Escalonado de entrada (`--d`)

| Nodo | `--d` |
|---|---|
| `#ov` | — (charReveal, 24 ms/char) |
| `#h1` | — (wordReveal, 70 ms/palabra) |
| `.ob-sub` | `480ms` |
| `#doorA` | `600ms` |
| puerta B | `680ms` |
| `.ob-note` | `760ms` |

---

## 4 · CSS específico de pantalla

Copia **verbatim** del segundo `<style>` (líneas 487–511), el que **no** lleva `data-corpus-system`.
**No define ningún `@keyframes` propio** — todo el movimiento sale del sistema.

```css
/* ── onboarding.html — VENTANA. Dos puertas, ninguna de segunda. ── */
.ob-main{flex:1;display:flex;flex-direction:column;align-items:center;padding:70px var(--container-pad) 110px;text-align:center}
.ob-h1{font-size:var(--fs-display);max-width:20ch}
.ob-sub{margin-top:16px;color:var(--text-muted);font-size:var(--fs-lead);max-width:52ch}
.ob-doors{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:48px;width:100%;max-width:860px;text-align:left}
.ob-door{padding:28px 30px 30px;cursor:pointer;position:relative}
.ob-door:hover{border-color:var(--border-patina)}
.ob-door .t-overline{font-size:10px}
.ob-door h3{margin-top:12px;font-size:19px}
.ob-door p{margin-top:10px;font-size:var(--fs-ui);color:var(--text-muted);line-height:1.65}
.ob-door .fine{margin-top:14px;font:400 var(--fs-micro)/1.7 var(--font-mono);color:var(--text-subtle)}
.ob-door .go{display:inline-block;margin-top:18px;font:500 var(--fs-ui)/1 var(--font-sans);color:var(--accent-text)}
/* plantillas (puerta A expandida) */
.ob-tpl{margin-top:26px;width:100%;max-width:860px;text-align:left;display:none}
.ob-tpl.open{display:block}
.ob-tpl .gh{display:flex;align-items:baseline;gap:12px;padding-bottom:10px}
.ob-tpl .rows{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden}
.ob-tpl a{background:var(--surface);padding:16px 18px;text-decoration:none;color:inherit}
.ob-tpl a:hover{background:var(--surface-elevated)}
.ob-tpl b{display:block;font:500 14px/1.3 var(--font-sans);color:var(--text)}
.ob-tpl span{display:block;margin-top:5px;font:400 var(--fs-micro)/1.6 var(--font-mono);color:var(--text-subtle)}
.ob-note{margin-top:44px;max-width:56ch;font:400 var(--fs-micro)/1.8 var(--font-mono);color:var(--text-subtle)}
@media (max-width:768px){.ob-doors{grid-template-columns:1fr}.ob-tpl .rows{grid-template-columns:1fr}.ob-h1{font-size:34px}}
```

Notas de lectura (no cambian el CSS, lo explican):

- `.ob-tpl .rows` es un **grid de 3 columnas con `gap:1px` sobre `background:var(--border)`**: el
  hairline entre celdas es el fondo asomando, no un `border`. Con `overflow:hidden` para que el
  radio recorte. En móvil (≤768px) pasa a 1 columna.
- `.ob-door` **no declara fondo ni borde**: los hereda de `.c-card`. El `:hover` solo sube el borde a
  `--border-patina`. El *lift* (`translateY(-2px)`) lo aporta `.c-lift` del sistema.
- `.ob-tpl` se muestra/oculta con `display:none` ⇄ `.open{display:block}`. **No usa `[hidden]`.**
- Ningún `@keyframes` propio.

---

## 5 · Estados del panel demo

`handoff.md` declara exactamente dos: **`puertas` · `plantillas`**. Coinciden con el HTML.

| Estado | `data-st` | `aria-pressed` inicial | Qué cambia en el DOM |
|---|---|---|---|
| **puertas** (por defecto) | `puertas` | `true` | `#tpl` **sin** `.open` → `display:none`. `#goA` dice **`Elegir plantilla ▾`**. |
| **plantillas** | `plantillas` | `false` | `#tpl` **con** `.open` → `display:block`, entra con `.c-enter` (C2, 360 ms) y `M.boot('#tpl')` dibuja el `hr.c-divider` interno. `#goA` dice **`Elegir plantilla ▴`** (triángulo invertido). |

**Cómo se activa cada uno (dos caminos, misma función `openTpl(open)`):**

1. **Panel demo:** click en un botón → todos los `.demo button` reciben
   `aria-pressed = String(x === b)` y se llama `openTpl(b.dataset.st === 'plantillas')`.
2. **Producto:** click en `#doorA` (toda la tarjeta, no solo el `.go`) →
   `openTpl(!$('#tpl').classList.contains('open'))` — **toggle**.

Lo único que cambia entre estados es: la clase `.open` de `#tpl` y el `textContent` de `#goA`.
Nada más se muestra/oculta.

⚠ **Asimetría real del HTML (no la "arregles" sin decidirlo):** abrir/cerrar desde `#doorA` **no**
actualiza el `aria-pressed` de los botones del demo. El demo puede quedar desincronizado del DOM.
Es un panel de revisión, no producto — pero si en React se unifica el estado, el `aria-pressed` sí
quedará sincronizado y eso es un cambio de comportamiento (benigno) respecto al HTML.

---

## 6 · Comportamiento JS de la pantalla

Todo el JS **fuera** de `data-corpus-system` (líneas 848–865), verbatim:

```js
(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], M=window.CorpusMotion;
window.CorpusAurora.mount({state:'calm'});
M.chars($('#ov'));M.words($('#h1'));M.boot();
function openTpl(open){
  $('#tpl').classList.toggle('open',open);
  $('#goA').textContent=open?'Elegir plantilla ▴':'Elegir plantilla ▾';
  if(open){M.enter($('#tpl'));M.boot($('#tpl'))}
}
$('#doorA').addEventListener('click',()=>openTpl(!$('#tpl').classList.contains('open')));
$$('.demo button').forEach(b=>b.onclick=()=>{
  $$('.demo button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  openTpl(b.dataset.st==='plantillas');
});
})();
```

### Qué hace cada línea, y qué API del sistema toca

| Llamada | Efecto | Contrato |
|---|---|---|
| `CorpusAurora.mount({state:'calm'})` | Crea `.c-aurora` + canvas WebGL2, arranca el loop en `calm` (`speedT=.35`, `actT=0`). Con `prefers-reduced-motion` o sin WebGL2 → `.c-aurora-fallback` estático. | Solo las **ventanas** montan. |
| `CorpusMotion.chars($('#ov'))` | **charReveal** del overline: parte el texto en `<span class="c-ch" style="--i:n">`, 24 ms por carácter, animación `cCharIn` 0.4 s. Con reduce-motion **no fragmenta**: el texto queda intacto y visible. | Ceremonia C3. |
| `CorpusMotion.words($('#h1'))` | **wordReveal** del H1: `<span class="c-w" style="--i:n">` por palabra, 70 ms por palabra, `cWordIn` 0.8 s. `split()` **camina recursivamente**, así que el `<em>empezar?</em>` sobrevive y su texto también se parte. Con reduce-motion, sin fragmentar. | Ceremonia C3. |
| `CorpusMotion.boot()` | Dibuja todos los `.c-divider` y muestra todos los `[data-reveal]:not([data-visible])` del documento en `raf2`. Es lo que dispara la entrada escalonada (`--d` 480/600/680/760 ms). | — |
| `CorpusMotion.enter($('#tpl'))` | Pone `el.hidden=false` y añade `.c-enter` (`cEnter`, 360 ms, C2), que se quita en `animationend`. **Ojo:** `#tpl` nunca usa `hidden`, así que aquí `enter()` es *solo* la animación de entrada. | Transición C2. |
| `CorpusMotion.boot($('#tpl'))` | Vuelve a dibujar el `hr.c-divider` que hay dentro del panel de plantillas. | — |

### Listeners

- `#doorA` → `click` (toggle de plantillas). **Toda la tarjeta es el hit area**, no el `.go`.
- `.demo button` → `onclick` (asignación directa, no `addEventListener`).
- **No hay listeners en la puerta B**: es un `<a href="importar.html">` puro. Navegación nativa.
- **No hay atajos de teclado en esta pantalla.** (Los `j/k/a/d/o` del handoff son de *staging*.)
- Listeners del sistema que sí operan aquí: `pointermove` global de `.c-spot` (ningún nodo la usa),
  `focusin`/`focusout` de pausa de aurora (no hay campos), `visibilitychange`, `resize`, `pointermove`
  del parallax del shader.

### Traducción a React (avisos)

- `M.chars` / `M.words` **mutan el DOM** (reemplazan nodos de texto por spans). Si React re-renderiza
  `#ov` o `#h1` después, borra la fragmentación. Ejecutar una sola vez en un efecto de montaje y no
  volver a renderizar esos nodos, o portar el split a JSX.
- `shimmer()` es **autolimitado a uno por carga de producto** y esta pantalla **no lo usa**. No lo
  añadas aquí: el único shimmer del producto es el fin de ingesta.

---

## 7 · Copy (verbatim, ES)

Marcado: **[copy.md]** = está literalmente en `06-handoff/copy.md` §"Onboarding — las dos puertas" ·
**[solo HTML]** = no aparece en copy.md, sale únicamente del HTML.

### Header

| Texto | Fuente |
|---|---|
| `Corpus` | [solo HTML] — logo del sistema |
| `EMPEZAR` | [solo HTML] |
| `ES` / `EN` | [solo HTML] — conmutador de idioma (`ES` con `data-on`) |
| `DG` | [solo HTML] — iniciales de Diego Gatica |

### Cabecera de la pantalla

| Texto | Fuente |
|---|---|
| `Un master, N variantes — partamos por el master` | **[solo HTML]** — copy.md no trae overline para onboarding |
| `¿Cómo prefieres empezar?` (con `empezar?` en `<em>`) | **[copy.md]** — «¿Cómo prefieres empezar?» |
| `Dos puertas al mismo lugar. Puedes cruzar la otra cuando quieras — el registro es uno solo.` | **[copy.md]** — literal |

### Puerta A

| Texto | Fuente |
|---|---|
| `Puerta A · sin IA` | [solo HTML] (copy.md dice "puerta A (sin IA)" como *etiqueta de la ficha*, no como overline visible) |
| `Escribirlo tú` | **[copy.md]** |
| `Desde una plantilla de rol o en blanco, con la IA apagada. Escribes, Corpus estructura. Cada item queda con origen: tú — el más verificable de todos: no hay nada que rastrear, lo afirmaste tú.` | **[copy.md]** — literal (en el HTML, `origen: tú` va en `<b>`) |
| `bien para: perfeccionistas, perfiles simples, desconfiados con razón` | **[solo HTML]** |
| `Elegir plantilla ▾` / `Elegir plantilla ▴` | **[solo HTML]** |

### Puerta B

| Texto | Fuente |
|---|---|
| `Puerta B · con IA` | [solo HTML] |
| `Volcarlo` | **[copy.md]** |
| `Pega texto suelto, tu CV viejo, links a tu GitHub y portfolio. La IA extrae y cita el fragmento de origen de cada dato; tú confirmas item por item antes de que nada entre al master.` | **[copy.md]** — literal (en el HTML, `tú confirmas item por item` va en `<b>`) |
| `bien para: 10 años de historia desordenada, poco tiempo, arranque rápido` | **[solo HTML]** |
| `Ir al volcado →` | **[solo HTML]** |

### Panel de plantillas (`#tpl`)

Todo **[solo HTML]** — copy.md no documenta este bloque.

| Texto |
|---|
| `Plantillas de perfil — estructura vacía, cero texto inventado` |
| `Backend / plataforma` — `roles · viñetas XYZ · skills por grupo · proyectos` |
| `Data / IA` — `igual + secciones de investigación y datasets` |
| `Diseño` — `igual + casos con problema → decisión → resultado` |
| `Producto` — `igual + métricas de negocio por rol` |
| `En blanco` — `solo la estructura del registro` |
| `Mejor, vuélcalo →` — `cambiar a la puerta B` |

### Nota al pie

| Texto | Fuente |
|---|---|
| `La puerta A no es la puerta «difícil» ni la B la «tramposa»: las dos terminan en el mismo staging, con la misma revisión, y el mismo master.` | **[copy.md]** — mismo texto, **pero el HTML usa comillas angulares `«…»` y copy.md usa comillas tipográficas `“…”`**. Ver §Contradicciones. |

### Panel demo (no es producto)

`demo` · `puertas` · `plantillas` · aria-label `Estados de la pantalla (revisión de diseño)`.

### Reglas de voz que aplican (copy.md, encabezado)

Sereno, competente, sin drama. Ningún número sin fuente. Vocabulario **prohibido**: *potenciar,
sinergia, impulsar la excelencia, journey, unlock, 🎉*. Ninguno aparece en esta pantalla.

---

## 8 · Accesibilidad

### Lo que el HTML ya trae

- `<html lang="es">`, `data-theme="dark"`.
- `.demo` → `role="group"` + `aria-label="Estados de la pantalla (revisión de diseño)"`; sus botones
  son `<button>` con `aria-pressed="true|false"` mantenido en JS.
- `.c-aurora` recibe `aria-hidden="true"` al montarse (lo pone `aurora.js`).
- `:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}` del sistema.
- Contrastes verificados en tokens (`--text` 16.50:1, `--text-muted` 8.83:1, `--text-subtle` 4.94:1
  límite AA). `.ob-door .go` usa `--accent-text` = `patina-300` sobre grafito → 9.47:1 ✓.
- Todo el movimiento vive bajo `@media (prefers-reduced-motion: no-preference)`; los estados base son
  los finales. `chars`/`words` **no fragmentan** con reduce-motion.
- Hit targets: `.ob-door` ≈ 28–30 px de padding sobre una tarjeta de ~430 px de ancho → muy por
  encima de 44 px. Filas de `.ob-tpl` con `padding:16px 18px` → ≥44 px de alto. Botones del demo:
  `padding:5px 8px` → **por debajo de 44 px**, pero el demo no es producto.

### Huecos reales que hay que cerrar al implementar (el HTML es la referencia *visual*, no el techo de a11y)

1. **`#doorA` es un `<div>` con `onclick` y sin `tabindex`, sin `role`, sin `aria-expanded`.**
   Es **inalcanzable por teclado**. La puerta B sí lo es (`<a href>`). Consecuencia: la mitad
   principal de la pantalla no es operable sin ratón.
   → En React: `<button type="button">` (o `role="button" tabIndex={0}` + Enter/Espacio) con
   `aria-expanded={open}` y `aria-controls="tpl"`.
2. **`#goA` (`Elegir plantilla ▾`) es un `<span>`, no un control.** Es solo la *etiqueta* del
   affordance; el click real está en toda la tarjeta. No lo conviertas en un botón anidado dentro de
   otro botón.
3. **No hay live region.** Al abrir/cerrar plantillas no se anuncia nada. Con `aria-expanded` bien
   puesto en la puerta A basta; no hace falta un `aria-live`.
4. **`.hd-lang` ES/EN son `<span>`, no controles.** En esta pantalla el conmutador de idioma es
   decorativo. No inventes un selector funcional aquí.
5. `#tpl` se oculta con `display:none` (no con `[hidden]`), lo cual **sí** lo saca del árbol de
   accesibilidad — correcto. Si en React se cambia a `hidden`, mantener el mismo efecto.

### Orden de foco actual (tal como está el HTML)

`a.c-logo` → `a.ob-door` (puerta B) → [si `#tpl` está abierto] los 6 `<a>` de plantillas →
`button[data-st="puertas"]` → `button[data-st="plantillas"]`.
**`#doorA` no aparece en el orden de foco.** Ese es el bug a corregir.

### Atajos de teclado

**Ninguno en esta pantalla.** No inventes ninguno.

---

## 9 · Datos del mock

Persona canónica del paquete: **Diego Gatica** (ficticio), la misma en las 12 pantallas y en
`05-documento-cv/datos-ejemplo.json`.

| Dato | Dónde aparece | Valor |
|---|---|---|
| Iniciales del avatar | `.hd-av` | **`DG`** |
| Nombre completo | *no aparece en esta pantalla* | Diego Gatica |

**Esta pantalla no muestra ninguna cifra del mock.** Las cifras coherentes del paquete
(61 items, 43/8/9 verificados/parciales/sin evidencia, 412.803 bytes, 52 items en el master,
7 variantes, 14 proyectos, empresa *Altiplano Pagos*) viven en ingesta/staging/master/variantes —
**aquí no**, y no deben colarse. Onboarding es día 0: el registro aún está vacío.

Destinos de navegación mockeados: `dashboard.html` (logo), `importar.html` (puerta B y la fila
"Mejor, vuélcalo →"), `master.html` (las 5 plantillas). En React:
`/app`, `/app/importar`, `/app/master`.

---

## 10 · Números en la UI

**Regla del producto** (`00-README.md` §6, `handoff.md` §4): *"Ningún número sin fuente en la UI.
Sin ATS score, sin porcentajes de match, sin umbrales inventados."*

Inventario **completo** de números visibles al usuario en esta pantalla:

| Número | Dónde | Origen | ¿Legítimo? |
|---|---|---|---|
| `10` (en `10 años de historia desordenada`) | `.fine` de la puerta B | Literal del HTML. Es una **frase ilustrativa del perfil-tipo** ("para quién es esta puerta"), no una medición ni una promesa sobre los datos del usuario. | ✅ Sí. No es una métrica: no afirma nada sobre el registro de nadie. |

**Y eso es todo.** No hay ningún otro dígito visible.

Comprobaciones explícitas:

- ❌ **Sin score.** No existe.
- ❌ **Sin porcentajes.** Ninguno.
- ❌ **Sin "confidence" / "match" / umbrales.** Ninguno.
- ❌ **Sin contadores.** `CorpusMotion.counter()` **no se llama** en esta pantalla.
- ✅ `Un master, N variantes` usa la **letra `N`**, no un número. Es deliberado: en el día 0 no hay
  variantes que contar, y poner un `0` o un `7` sería inventar. **No la sustituyas por una cifra.**
- ✅ `Puerta A` / `Puerta B` son etiquetas, no cantidades.
- ✅ Los "3 minerales", "80ms", "1200ms" etc. viven en comentarios de CSS: **no son UI**.

**Nada sospechoso que reportar.** Onboarding es la pantalla más limpia del paquete en este eje —
y debe seguir siéndolo.

---

## Anexo · Contradicciones y riesgos detectados

### Contradicciones entre HTML / copy.md / handoff.md

1. **Comillas de la nota al pie.** HTML: `la puerta «difícil» ni la B la «tramposa»` (angulares).
   copy.md: `la puerta “difícil” ni la B la “tramposa”` (tipográficas). Mismo texto, distinta
   puntuación. **Decisión: manda el HTML** (es la referencia literal), pero hay que unificarlo.
2. **El overline `Un master, N variantes — partamos por el master` no existe en copy.md.**
   La sección "Onboarding" de copy.md solo documenta título, subtítulo, puerta A, puerta B y nota al
   pie. Todo el resto del texto visible (overline, `Puerta A · sin IA`, `Puerta B · con IA`, las
   líneas `bien para: …`, `Elegir plantilla ▾`, `Ir al volcado →`, y **el bloque entero de
   plantillas**) es exclusivo del HTML. copy.md está **incompleto** para esta pantalla; no es que el
   HTML se haya salido del guion.
3. **`copy.md` no tiene traducción EN** para nada de ese texto exclusivo del HTML. Si se implementa
   i18n, faltan ~12 cadenas en inglés.
4. **Estados demo vs. sincronía:** `handoff.md` lista `puertas · plantillas`, y el HTML los tiene —
   pero abrir plantillas desde `#doorA` no actualiza `aria-pressed` en el panel demo.

### Riesgos de implementación (lo que se rompe si no se cuida)

1. **`.c-window` sin aurora = pantalla muerta.** Si React no llama a
   `CorpusAurora.mount({state:'calm'})`, el `main` transparente se ve sobre `--bg` plano. Es el
   error clásico de las tres implementaciones anteriores.
2. **`chars()`/`words()` vs. re-render de React.** Mutan el DOM. Un re-render de `#ov`/`#h1` borra la
   animación. Montar una sola vez; no meter estado que los re-renderice.
3. **`#tpl` con `display:none`/`.open`, no con `[hidden]`.** `M.enter()` toca `el.hidden`; si en React
   se usa render condicional (`{open && <div/>}`), la animación `.c-enter` sigue funcionando pero el
   `hr.c-divider` interno necesita `M.boot()` **después** de montarse, o se queda con `scaleX(0)` —
   invisible.
4. **`--d` inline (`480/600/680/760 ms`).** Son custom properties inline, no clases. Si se sustituyen
   por `.c-stagger-css`, los tiempos cambian (80/160/240/320) y la coreografía se rompe.
5. **Estilos inline en `<b>`, en el `span` "EMPEZAR" y en `.rows`.** Sin clase que los respalde. Si se
   omiten, el `<b>` pierde `color:var(--text)` y queda en `--text-muted`; "EMPEZAR" pierde el
   mono/tracking.
6. **`.ob-tpl b` / `.ob-tpl span` son selectores de tipo.** Emitir `<div>`s los deja sin estilo.
7. **La puerta A no es accesible por teclado.** Hay que arreglarlo (ver §8) — pero **sin cambiar
   nombres de clase ni el aspecto**: `<button class="c-card c-lift ob-door" id="doorA">`.
8. **No introducir el shimmer.** Es autolimitado y pertenece al fin de ingesta.
9. **Aurora en `'calm'`, jamás `'active'`.** `active` = ingesta.
10. **Los 6 enlaces del panel de plantillas apuntan a `master.html`/`importar.html`.** En React son
    rutas, pero **la fila 6 ("Mejor, vuélcalo →") va a `/app/importar`, no a `/app/master`** — es la
    salida a la puerta B. Fácil de copiar mal en un `.map()`.
