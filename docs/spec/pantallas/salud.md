# Salud de la variante — spec de implementación

> Fuente literal: `Corpus_ diseño completo/corpus-design/04-pantallas/salud.html` (919 líneas).
> Referencias: `06-handoff/handoff.md`, `06-handoff/copy.md`, `00-README.md`.
>
> **Regla madre:** el HTML es la referencia visual LITERAL. Los nombres de clase son el contrato
> diseño↔código: `sl-bar`, `sl-main`, `sl-col`, `sl-lead`, `sl-list`, `sl-item`, `sl-h`, `sl-d`,
> `sl-cite`, `sl-built`, `sl-brow`, `sl-ok` **no cambian**. Nada de renombrar a `HealthCard`,
> `FindingRow` o similares en el CSS.
>
> Los bloques `<style data-corpus-system="css">` (líneas 10–486) y `<script data-corpus-system="js">`
> (líneas 623–894) son la copia del sistema canónico (`02-sistema/*`): **ya los tenemos, no se
> transcriben aquí**. Este documento cubre exclusivamente lo específico de la pantalla.

---

## 1 · Ruta y propósito

**Ruta del producto:** `/app/variantes/[id]/salud`
**Archivo de diseño:** `04-pantallas/salud.html`
**`<title>`:** `Corpus — Salud · Backend — Fintech`
**`<html lang="es" data-theme="dark">`**

Lista **solo lo que puede fallar** en una variante concreta del CV: cada hallazgo trae su fuente
citada (`[fuente]` = evidencia externa, `[criterio]` = decisión de diseño propia dicha como tal),
con un enlace directo al sitio donde se arregla. **Sin score, sin barras, sin umbrales, sin
porcentajes.** Lo que está bien no aparece: el silencio es la señal.

Es la contra-tesis explícita de Rezi/Jobscan (`00-README.md` §"¿Por qué esto no es otro Rezi?"):
donde ellos venden un número sin fuente, esta pantalla enseña hechos con procedencia.

---

## 2 · Ventana o muro · Aurora

**NO monta la aurora.** No existe ninguna llamada a `CorpusAurora.mount` en el archivo, ni un
`<div class="c-aurora">` en el `<body>`. La única mención a `CorpusAurora` está dentro del bloque
`data-corpus-system` (definición del módulo + la pausa por `focusin` de motion.js).

Esto es correcto y **deliberado**, según `handoff.md` §APIs: *"Solo las VENTANAS la montan (auth,
onboarding, importar, ingesta, dashboard vacío). Los MUROS ni la montan."* Y `00-README.md` §4:
*"Donde hay trabajo que leer, hay muro."* Salud es trabajo de lectura y decisión → muro.

| Sección | Clase de atmósfera | Nota |
|---|---|---|
| `<main class="sl-main c-wall">` | **`.c-wall` (S)** — `background: var(--bg)`, opaco | La única clase de la gramática ventana/muro presente en toda la pantalla |
| `<div class="sl-bar">` | ninguna del sistema | Barra propia: `color-mix(in srgb, var(--bg) 88%, transparent)` + `backdrop-filter: blur(8px)`. Es un muro casi opaco hecho a mano, **no** un `.c-panel` |
| `<header class="c-header">` | ninguna (el header trae su propio blur del sistema) | — |

**`.c-window` · `.c-panel` · `.c-scrim`: NO aparecen. Cero.**

**Implicación para React:** si el layout de `/app/*` monta la aurora globalmente, esta ruta debe
**desmontarla o dejarla sin montar**. No basta con taparla: el muro es opaco y montar el canvas
WebGL2 debajo sería quemar GPU para nada. La regla es literal: *los muros ni la montan*.

**Pátina en esta vista:** el estado `con hallazgos` es deliberadamente **cero pátina de relleno**.
No hay ningún `.c-btn--patina`, ningún `.c-forge`. La pátina solo aparece en:
- el hover de `.sl-h .src` (`color: var(--accent-text)`, `border-color: var(--border-patina)`),
- el hover de `.sl-built > button`,
- el `aria-current="page"` del nav (`Variantes`),
- el glifo `—` de `.sl-ok .mark` (`color: var(--ver-ok)` = `--patina-300`) → **ese es el único
  elemento de pátina dominante, y solo existe en el estado "todo en orden"**.

Cumple el ≤ 1 dominante por vista. No añadir botones de pátina "para que se vea vivo".

---

## 3 · Esqueleto DOM

Leyenda: **(S)** = clase del sistema (`c-*`, `t-*`, `hd-*`, `demo`) · **(P)** = clase propia de la
pantalla. Los estilos inline van transcritos literales: son parte de la referencia.

```
body
└── div.c-page (S)
    ├── header.c-header (S)
    │   └── div.c-container (S)
    │       ├── a.c-logo (S)  href="dashboard.html"                       → "Corpus"
    │       ├── nav.hd-nav (S)
    │       │   ├── a href="dashboard.html"                               → "Panel"
    │       │   ├── a href="master.html"                                  → "Master"
    │       │   ├── a href="variantes.html" aria-current="page"           → "Variantes"
    │       │   └── a href="fuentes.html"                                 → "Fuentes"
    │       └── div.hd-right (S)
    │           ├── nav.hd-nav (S) style="display:flex"
    │           │   └── a href="ajustes.html"                             → "Ajustes"
    │           ├── div.hd-lang (S)
    │           │   ├── span[data-on]                                     → "ES"
    │           │   └── span                                              → "EN"
    │           └── div.hd-av (S)                                         → "DG"
    │
    ├── div.sl-bar (P)  data-screen-label="salud-toolbar"
    │   └── div.c-container (S)
    │       ├── a  style="font:500 var(--fs-ui)/1 var(--font-sans);color:var(--text-muted)"
    │       │      href="editor-variante.html"                            → "← Backend — Fintech"
    │       ├── span style="width:1px;height:16px;background:var(--border-strong)"   (separador)
    │       ├── span style="font:500 var(--fs-micro)/1 var(--font-mono);letter-spacing:.14em;color:var(--text-muted)"
    │       │                                                             → "SALUD DE LA VARIANTE"
    │       └── span#slN style="margin-left:auto;font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)"
    │                                                                     → "4 hallazgos · 0 bloqueantes"
    │
    └── main.sl-main (P) .c-wall (S)  data-screen-label="salud"
        └── div.c-container (S) .sl-col (P)
            ├── span.t-overline (S)                          → "Sin score, sin umbrales"
            ├── h2 style="margin-top:12px"                   → "Solo lo que puede fallar."
            ├── p.sl-lead (P)                                → lead con dos <b>: [fuente] · [criterio]
            ├── hr.c-divider (S) style="margin-top:18px"
            │
            ├── div.sl-list#list (P)
            │   └── article.c-card (S) .sl-item (P)          ×4 (hallazgos c1…c4)
            │       ├── div.sl-h (P)
            │       │   ├── span.mark (P)                    → "⚠"   (color: var(--danger))
            │       │   ├── span.tt (P)                      → título del hallazgo
            │       │   ├── button.src (P) data-cite="cN"    → "fuente ▾"
            │       │   └── a.fix (P) .c-btn (S) .c-btn--quiet (S) href="…"  → acción de arreglo
            │       ├── div.sl-d (P)                         → explicación en prosa
            │       └── div.sl-cite#cN (P)                   → cita (display:none; .open la muestra)
            │
            ├── div.sl-ok#ok (P)                             (display:none; .show lo muestra)
            │   ├── div.mark (P)                             → "—"   (color: var(--ver-ok))
            │   └── p                                        → "Nada que señalar…<br>No hay medalla…"
            │
            └── div.sl-built#built (P)  data-screen-label="salud-garantizado"
                ├── button#builtBtn                          → "▸ &nbsp;Lo que no revisamos…"
                └── div.rows (P)                             (display:none; .sl-built.open .rows → block)
                    └── div.sl-brow (P)  ×5                  → cada una con <b>…</b> — texto [Fuente]

div.demo (S)  role="group"  aria-label="Estados de la pantalla (revisión de diseño)"
├── span                                                     → "demo"
├── button data-st="hallazgos" aria-pressed="true"           → "con hallazgos"
└── button data-st="orden"     aria-pressed="false"          → "todo en orden"
```

**Atributos `data-*` de la pantalla:**

| Atributo | Dónde | Para qué |
|---|---|---|
| `data-screen-label="salud-toolbar"` | `div.sl-bar` | etiqueta de revisión de diseño |
| `data-screen-label="salud"` | `main.sl-main` | etiqueta de revisión de diseño |
| `data-screen-label="salud-garantizado"` | `div.sl-built` | etiqueta de revisión de diseño |
| `data-cite="c1".."c4"` | `button.src` | id del `.sl-cite` que abre |
| `data-st="hallazgos" \| "orden"` | `.demo button` | estado del panel demo |
| `data-on` | `.hd-lang span` (ES) | idioma activo |
| `data-reveal` / `data-visible` / `--d` | inyectados por `CorpusMotion.stagger` en los `.sl-item` | no están en el HTML fuente |

**IDs cableados al JS (no renombrar sin tocar el JS):** `#slN`, `#list`, `#ok`, `#built`,
`#builtBtn`, `#c1`…`#c4`.

---

## 4 · CSS específico de pantalla

Verbatim, el `<style>` sin `data-corpus-system` (líneas 487–527 del HTML). **Copia literal, no
tokenizar de nuevo, no "mejorar" los selectores descendentes.** Sin `@keyframes` propios: los
únicos keyframes del archivo (`cWordIn`, `cCharIn`, `cEnter`, `cShimmer`, `cPulse`, `cSkel`,
`cSpin`) viven en el bloque del sistema.

```css
/* ── salud.html — sin score, sin barras, sin umbrales. Solo lo que puede fallar. ── */
.sl-bar{position:sticky;top:var(--header-h);z-index:9;height:52px;background:color-mix(in srgb,var(--bg) 88%,transparent);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.sl-bar .c-container{height:100%;display:flex;align-items:center;gap:14px}
.sl-main{flex:1;padding:34px 0 120px}
.sl-col{max-width:820px;margin-inline:auto}
.sl-lead{color:var(--text-muted);font-size:var(--fs-ui);max-width:64ch;margin-top:8px}
.sl-lead b{color:var(--text);font-weight:500}
.sl-list{margin-top:22px}
.sl-item{margin-top:12px;overflow:hidden}
.sl-h{display:flex;gap:14px;align-items:baseline;padding:14px 20px}
.sl-h .mark{font:500 13px/1 var(--font-mono);color:var(--danger);flex:none}
.sl-h .tt{font:500 14px/1.45 var(--font-sans);flex:1}
.sl-h .src{flex:none;font:500 9.5px/1 var(--font-mono);letter-spacing:.08em;text-transform:uppercase;
  color:var(--text-subtle);border:1px solid var(--border);border-radius:4px;padding:4px 7px;cursor:pointer}
.sl-h .src:hover{color:var(--accent-text);border-color:var(--border-patina)}
.sl-h .fix{flex:none}
.sl-d{padding:0 20px 14px 47px;color:var(--text-muted);font-size:13px;line-height:1.65;max-width:74ch}
.sl-cite{display:none;margin:0 20px 16px 47px;padding:11px 15px;background:var(--surface-sunken);
  border-left:2px solid var(--border-strong);border-radius:0 6px 6px 0;
  font:400 var(--fs-micro)/1.8 var(--font-mono);color:var(--text-muted)}
.sl-cite.open{display:block}
.sl-cite b{color:var(--text);font-weight:500}
/* lo garantizado: educación plegada, no teatro */
.sl-built{margin-top:36px}
.sl-built>button{width:100%;text-align:left;display:flex;gap:12px;align-items:baseline;padding:13px 20px;
  border:1px dashed var(--border-strong);border-radius:var(--radius-md);color:var(--text-muted);
  font:400 var(--fs-data)/1.5 var(--font-mono)}
.sl-built>button:hover{border-color:var(--border-patina);color:var(--text)}
.sl-built .rows{display:none;margin-top:10px;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden}
.sl-built.open .rows{display:block}
.sl-brow{display:flex;gap:12px;align-items:baseline;padding:10px 18px;background:var(--surface);font:400 var(--fs-data)/1.6 var(--font-mono);color:var(--text-subtle)}
.sl-brow+.sl-brow{border-top:1px solid var(--border)}
.sl-brow b{color:var(--text-muted);font-weight:500}
.sl-ok{display:none;text-align:center;margin-top:70px}
.sl-ok.show{display:block}
.sl-ok .mark{font:400 30px/1 var(--font-mono);color:var(--ver-ok)}
.sl-ok p{margin-top:14px;color:var(--text-muted);line-height:1.7}
@media (max-width:768px){.sl-h{flex-wrap:wrap}.sl-d,.sl-cite{padding-left:20px;margin-left:20px}}
```

**Detalles del CSS que se pierden si se "interpreta":**
- `.sl-bar` es **sticky bajo el header**: `top: var(--header-h)` (64px) y `z-index: 9` (el header es
  10). Cualquier wrapper con `overflow` o `transform` en la cadena de padres rompe el sticky.
- `.sl-d` y `.sl-cite` tienen **`padding-left: 47px` / `margin-left: 47px`** — no es un número
  arbitrario: alinea el texto bajo `.tt`, saltando el glifo `⚠` (13px mono) + el `gap:14px` +
  el `padding:20px` de `.sl-h`. En móvil ese sangrado se anula.
- `.sl-h` usa `align-items: baseline` (no `center`): el `⚠`, el título, el chip `fuente` y el botón
  `.fix` se alinean por la **línea base del texto**.
- `.sl-cite` tiene `border-radius: 0 6px 6px 0` (esquinas izquierdas rectas: es una cita colgada de
  un filete vertical).
- `.sl-item` lleva `overflow:hidden` para que la cita no se salga del radio de la `.c-card`.
- `.sl-built > button` es `1px **dashed**` — es la misma gramática visual del `.c-noev` del sistema
  ("esto no es una afirmación fuerte"), no un botón normal.

---

## 5 · Estados del panel demo

`handoff.md` declara exactamente dos: **`con hallazgos` · `todo en orden`**. El HTML los implementa
con esos mismos dos botones y ningún otro. El panel `demo` **no es producto** (es convención de
entrega): en React va detrás de un flag / Storybook, nunca en la UI de usuario.

### `hallazgos` — «con hallazgos» (por defecto, `aria-pressed="true"`)

| Elemento | Estado |
|---|---|
| `#list` | `style.display = ''` (visible; sus 4 `.sl-item` entran con `CorpusMotion.stagger`) |
| `#ok` | sin `.show` → `display:none` |
| `#slN` | `"4 hallazgos · 0 bloqueantes"` |
| `#built` | visible siempre, plegado |

### `orden` — «todo en orden»

| Elemento | Estado |
|---|---|
| `#list` | `style.display = 'none'` |
| `#ok` | `.show` añadida → `display:block`, y se dispara `CorpusMotion.enter($('#ok'))` (clase `.c-enter`, animación `cEnter` 360ms, C2) |
| `#slN` | `"0 hallazgos"` (nota: **pierde** el `· 0 bloqueantes`) |
| `#built` | sigue visible y sigue siendo plegable |

**Cómo se activa:** clic en `.demo button[data-st]`. El handler pone `aria-pressed` a `"true"` solo
en el botón pulsado y `"false"` en los demás (`String(x===b)`).

**Sub-estados que NO son del panel demo pero sí del DOM (los tres son toggles independientes):**
1. `.sl-cite.open` — una cita abierta por hallazgo, sin exclusividad (no es un acordeón: se pueden
   abrir las 4 a la vez). El botón `.src` cambia su texto `fuente ▾` ⇄ `fuente ▴`.
2. `.sl-built.open` — despliega `.rows`. El glifo del botón cambia `▸` ⇄ `▾`.
3. Ninguno de los dos se resetea al cambiar de estado demo (el `orden` oculta `#list` con las citas
   que hubiera abiertas dentro; al volver a `hallazgos` siguen abiertas). Reproducirlo tal cual.

---

## 6 · Comportamiento JS de la pantalla

Todo el JS fuera de `data-corpus-system` (líneas 895–917). Es un IIFE en `'use strict'`.

```js
(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], M=window.CorpusMotion;
document.addEventListener('click',e=>{
  const c=e.target.closest('[data-cite]');
  if(c){const el=$('#'+c.dataset.cite);el.classList.toggle('open');
    c.textContent=el.classList.contains('open')?'fuente ▴':'fuente ▾';return}
  if(e.target.id==='builtBtn'){const b=$('#built');b.classList.toggle('open');
    e.target.innerHTML=(b.classList.contains('open')?'▾':'▸')+' &nbsp;Lo que no revisamos porque el motor lo garantiza por construcción — listarlo como logro sería teatro de tranquilidad'}
});
$$('.demo button').forEach(b=>b.onclick=()=>{
  $$('.demo button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  const ok=b.dataset.st==='orden';
  $('#list').style.display=ok?'none':'';
  $('#ok').classList.toggle('show',ok);
  $('#slN').textContent=ok?'0 hallazgos':'4 hallazgos · 0 bloqueantes';
  if(ok)M.enter($('#ok'));
});
M.stagger($('#list'),{step:60,cap:24});
M.boot();
})();
```

**Qué hay que reproducir, punto por punto:**

1. **Delegación de clic en `document`** con `closest('[data-cite]')` → el hit area del toggle de cita
   es todo el `button.src`. En React: handler en el propio botón, mismo efecto.
2. **Toggle de cita:** `classList.toggle('open')` sobre `#c1…#c4` + reescritura del **texto** del
   botón: `'fuente ▴'` (abierta) / `'fuente ▾'` (cerrada). Los glifos son U+25B4 / U+25BE. Literales.
3. **Toggle del bloque garantizado:** `#builtBtn` → `.sl-built` gana/pierde `.open`, y se reescribe
   el `innerHTML` completo del botón cambiando solo el glifo `▾`/`▸`. **Ojo:** el texto se reinyecta
   con `&nbsp;` tras el glifo. En React ese `&nbsp;` es ` ` explícito, no un espacio normal.
4. **Panel demo:** `aria-pressed` como fuente de verdad del estado + los cuatro efectos de la tabla
   del §5.
5. **`CorpusMotion.stagger($('#list'), {step:60, cap:24})`** al arrancar → los 4 `.sl-item` reciben
   `data-reveal="soft"` y `--d` = 0/60/120/180 ms, y se muestran en el siguiente doble rAF.
   ⚠ `handoff.md` §APIs documenta `{step:40|80}`; esta pantalla usa **60**. Es lo que dice el HTML:
   se copia 60.
6. **`CorpusMotion.enter(el)`** en el paso a `orden`: pone `hidden=false`, añade `.c-enter` y la
   quita en `animationend`. Con `prefers-reduced-motion` degrada a mostrar sin animar.
7. **`CorpusMotion.boot()`** al final → dibuja el `hr.c-divider` (scaleX 0→1, 1s) y cualquier
   `[data-reveal]` pendiente.

**Lo que NO hay (y no debe aparecer):**
- **Ninguna llamada a `CorpusAurora.*`.** Ni `mount`, ni `setState`, ni `pause`.
- Ningún `CorpusMotion.counter` — `#slN` es texto plano, no un contador animado. No animar cifras
  aquí: un contador que sube sugiere logro/gamificación, justo lo que la pantalla rechaza.
- Ningún `shimmer` (hay UNO en todo el producto y es el fin de ingesta).
- Ningún `scrollIntoView` (`handoff.md` §Varios: no se usa en el paquete).
- Ningún atajo de teclado (los `j/k/a/d/o` son de staging, no de aquí).

---

## 7 · Copy (verbatim, ES)

Marcado: **[copy.md]** = existe en `06-handoff/copy.md` §Salud · **[solo HTML]** = no está en copy.md
(es contenido de mock/pantalla y hay que tratarlo como copy canónico igualmente).

### Header y barra

| Texto | Origen |
|---|---|
| `Corpus` (logo) | [solo HTML] |
| `Panel` · `Master` · `Variantes` · `Fuentes` · `Ajustes` (nav) | [solo HTML] |
| `ES` / `EN` (selector de idioma) | [solo HTML] |
| `DG` (avatar) | [solo HTML] — iniciales de Diego Gatica |
| `← Backend — Fintech` | [solo HTML] |
| `SALUD DE LA VARIANTE` | [solo HTML] |
| `4 hallazgos · 0 bloqueantes` | [solo HTML] |
| `0 hallazgos` (estado «todo en orden») | [solo HTML] |

### Encabezado de la pantalla

| Texto | Origen |
|---|---|
| `Sin score, sin umbrales` (overline) | [solo HTML] |
| `Solo lo que puede fallar.` (h2) | **[copy.md]** — inicio del «encabezado» de §Salud |
| `Cada hallazgo trae su fuente — [fuente] es evidencia citada, [criterio] es una decisión de diseño nuestra, dicha como tal. Lo que está bien no aparece: el silencio es la señal.` (`p.sl-lead`, con `[fuente]` y `[criterio]` en `<b>`) | **[copy.md]** — resto del «encabezado» |

> copy.md lo da como **un solo párrafo**; el HTML lo parte en `h2` + `p.sl-lead`. El corte del HTML manda.

### Hallazgo 1 — `#c1`

| Ranura | Texto | Origen |
|---|---|---|
| `.mark` | `⚠` | [solo HTML] |
| `.tt` | `2 viñetas de la página 1 no llevan ninguna cifra` | [solo HTML] (parienta de «3 viñetas sin ninguna cifra» del dashboard en copy.md) |
| `.src` | `fuente ▾` / `fuente ▴` | [solo HTML] |
| `.fix` | `verlas en el editor →` → `editor-variante.html` | [solo HTML] |
| `.sl-d` | `«Implementé el flujo de cupones…» y «Desarrollé y mantuve APIs…». ¿Cuánto movían? ¿Cuántos usuarios? ¿En cuánto tiempo? Una por una — tú decides cuáles lo ameritan.` | [solo HTML] |
| `.sl-cite` | `[fuente — Jobscan 2025, n=384]` (en `<b>`) ` el 58,2% de reclutadores dice que lo que más destaca es un logro cuantificado. ` `No existe` (en `<b>`) ` un umbral de «% de viñetas con cifra» en ningún estudio — por eso te las señalamos una a una y no te damos un porcentaje.` | [solo HTML] |

### Hallazgo 2 — `#c2`

| Ranura | Texto | Origen |
|---|---|---|
| `.tt` | `Una viñeta ocupa 4 líneas` | [solo HTML] |
| `.fix` | `recortarla →` → `editor-variante.html` | [solo HTML] |
| `.sl-d` | `La del servicio de conciliación. En el escaneo de 7 segundos, las frases largas pierden: parte en dos o deja solo el resultado.` | [solo HTML] |
| `.sl-cite` | `[fuente — Ladders 2018, eye-tracking]` (en `<b>`) ` screening inicial promedio de 7,4 s; los CVs peor evaluados comparten «frases largas, clutter, poco espacio en blanco». n=30, estudio de vendor: dirección, no ley.` | [solo HTML] |

### Hallazgo 3 — `#c3`

| Ranura | Texto | Origen |
|---|---|---|
| `.tt` | `El título no coincide con el último aviso que adaptaste` | [solo HTML] |
| `.fix` | `alinearlo →` → `tailor.html` |[solo HTML] |
| `.sl-d` | `El aviso pedía «Backend Engineer»; la variante dice «Backend Developer». Honesto y efectivo: «Backend Engineer (Ingeniero de Software III)».` | [solo HTML] — eco del «título objetivo» del editor en copy.md |
| `.sl-cite` | `[fuente — Jobscan, 2,5M postulaciones]` (en `<b>`) ` título del CV = título del aviso → 10,6× más entrevistas. Datos internos del vendor: úsalo para priorizar, no como promesa.` | [solo HTML] — la cifra `10,6×` y la fuente sí están en copy.md §Editor de variante |

### Hallazgo 4 — `#c4`

| Ranura | Texto | Origen |
|---|---|---|
| `.tt` | `La sección «Proyectos» queda huérfana al final de la página 2` | [solo HTML] |
| `.fix` | `reordenar →` → `editor-variante.html` | [solo HTML] |
| `.sl-d` | `El encabezado entra pero solo cabe una línea de contenido. Sube un proyecto a la página 1 u oculta uno: un final limpio se lee mejor.` | [solo HTML] |
| `.sl-cite` | `[criterio]` (en `<b>`) ` decisión tipográfica nuestra, sin estudio detrás — y lo decimos. Disfrazar criterio de evidencia es exactamente lo que este producto no hace.` | [solo HTML] |

### Estado «todo en orden» — `#ok`

| Texto | Origen |
|---|---|
| `—` (glifo `.mark`) | [solo HTML] |
| `Nada que señalar en esta variante.` `<br>` `No hay medalla: el silencio es la señal.` | **[copy.md]** §Salud «todo en orden» (copy.md lo escribe en una línea; el HTML mete un `<br>`) |

### Bloque «garantizado por construcción» — `#built`

| Texto | Origen |
|---|---|
| `▸ &nbsp;Lo que no revisamos porque el motor lo garantiza por construcción — listarlo como logro sería teatro de tranquilidad` (glifo `▾` cuando está abierto) | **[copy.md]** §Salud «garantizado por construcción» — ⚠ copy.md cierra con **punto final**; el HTML **no lo lleva**. Copiar el HTML (sin punto). |
| `Una sola columna` (b) ` — el parser lee de izquierda a derecha atravesando columnas [Greenhouse]` | [solo HTML] |
| `Cero tablas, headers o footers` (b) ` — Workday los ignora: contacto siempre en el cuerpo [Greenhouse · Workday]` | [solo HTML] |
| `Cero iconos ni fotos` (b) ` — «Email:» con letras; glifos no textuales se parsean como basura [Greenhouse · Robert Walters Chile]` | [solo HTML] |
| `Texto seleccionable` (b) ` — «si no puedes seleccionar el texto, el documento no es parseable» [Lever, literal]` | [solo HTML] |
| `< 2,5 MB` (b, en el HTML escrito `&lt; 2,5 MB`) ` — sobre eso Greenhouse no parsea el archivo [Greenhouse]` | [solo HTML] |

### Panel demo (no producto)

`demo` · `con hallazgos` · `todo en orden` · `aria-label="Estados de la pantalla (revisión de diseño)"` — [solo HTML].

**Notas de voz (copy.md §cabecera):** sereno, competente, sin drama; ningún número sin fuente; no
regaña ni celebra. Prohibido: *potenciar, sinergia, impulsar la excelencia, journey, unlock, 🎉*.
Las comillas son **angulares (« »)** en el copy del producto y los guiones son **em dash (—)**.
Los `→` de los enlaces `.fix` son parte del texto, no un icono.

---

## 8 · Accesibilidad

**Lo que el HTML sí trae:**

| Punto | Detalle |
|---|---|
| Landmarks | `<header class="c-header">` + `<main class="sl-main c-wall">`. La `.sl-bar` es un `div` **fuera** del `main` (queda entre header y main, sin rol). |
| Nav actual | `a[aria-current="page"]` en `Variantes` (la subruta salud marca su padre) |
| Cada hallazgo | `<article class="c-card sl-item">` — landmark de artículo por hallazgo |
| Panel demo | `role="group"` + `aria-label="Estados de la pantalla (revisión de diseño)"` + `aria-pressed` en cada botón (patrón toggle correcto) |
| Nunca solo color | Los hallazgos llevan glifo `⚠` **+** texto **+** color `--danger`. El «todo en orden» lleva glifo `—` + frase. El bloque garantizado lleva borde `dashed` + glifo `▸`. Cumple la regla del sistema. |
| Foco | Anillo global del sistema: `:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}`. Todos los interactivos son `<button>` o `<a>` nativos → foco y Enter/Space gratis. |
| Reduce-motion | Todo el movimiento del sistema vive bajo `@media (prefers-reduced-motion: no-preference)`; `stagger`/`enter` degradan a estado final visible. |

**Orden de foco (DOM = visual, no hay `tabindex` en toda la pantalla):**
1. logo `Corpus` → 2. `Panel` → 3. `Master` → 4. `Variantes` → 5. `Fuentes` → 6. `Ajustes`
7. `← Backend — Fintech` (barra)
8..N. por cada hallazgo, en orden: `button.src` (fuente) → `a.fix` (arreglar)  ×4
9. `#builtBtn`
10. los dos botones del panel `demo` (están al final del `<body>`, fuera de `.c-page`).

**Atajos de teclado:** ninguno. (Los `j/k/a/d/o` de `handoff.md` son exclusivos de staging.)

**Live regions:** **ninguna.** `#slN` cambia su texto al cambiar de estado y **no** es `aria-live`;
`#ok` aparece y **no** se anuncia. En producto real, `#slN` debería ser `aria-live="polite"` para que
el conteo de hallazgos se anuncie tras un arreglo — pero eso es una **mejora, no está en el HTML**;
decidirlo con diseño antes de añadirlo.

**Huecos de a11y detectados en el HTML de referencia (documentar, no "arreglar" en silencio):**

1. `button.src` **no tiene `aria-expanded`** ni `aria-controls="cN"`, y la cita `.sl-cite` se
   oculta con `display:none` (bien: sale del árbol de accesibilidad). Un lector de pantalla no sabe
   que el botón es un disclosure. Lo mismo con `#builtBtn` (sin `aria-expanded`, sin `aria-controls="rows"`).
2. **Hit targets por debajo de 44px:** `handoff.md` §Varios exige ≥ 44px en móvil.
   - `button.src`: `9.5px/1` + `padding:4px 7px` + borde → **≈ 19–20px de alto**.
   - `.demo button`: `10px/1` + `padding:5px 8px` → ≈ 20px (es panel de revisión, no producto).
   - Los `.c-btn.c-btn--quiet` de `.fix` sí miden `--control-h` = 40px (aún < 44).
   → En móvil hay que ampliar el área táctil de `.src` (pseudo-elemento o padding) **sin cambiar la
   métrica visual**. Marcarlo como decisión pendiente con diseño.
3. `.sl-bar` no tiene rol ni `aria-label`; el `span` separador de 1×16px es decorativo pero no lleva
   `aria-hidden="true"`.
4. `.mark` (`⚠` y `—`) son texto real leído por el lector: "⚠" se anuncia como "advertencia" en
   varios lectores. Aceptable (refuerza), pero conviene `aria-hidden="true"` en el `—` de `.sl-ok`,
   que se leería como "guion".
5. El texto del botón `.src` cambia entre `fuente ▾` y `fuente ▴`: el cambio de glifo es la única
   señal de estado. Con `aria-expanded` sería redundante y correcto.

---

## 9 · Datos del mock

Persona canónica del paquete (`handoff.md` §Datos del mock): **Diego Gatica** (ficticio), misma
historia en todas las pantallas y en `05-documento-cv/datos-ejemplo.json`.

| Dato | Valor en esta pantalla |
|---|---|
| Iniciales del avatar | `DG` |
| Variante abierta | **Backend — Fintech** (título de la pestaña y enlace de vuelta) |
| Ruta de vuelta | `editor-variante.html` (= `/app/variantes/[id]`) |
| Longitud del CV | **2 páginas** (los hallazgos hablan de «página 1» y «final de la página 2») |
| Secciones citadas | `Proyectos` (huérfana al final de la pág. 2) |
| Viñetas citadas | «Implementé el flujo de cupones…» · «Desarrollé y mantuve APIs…» · la del **servicio de conciliación** |
| Cargo real vs. aviso | La variante dice **Backend Developer**; el aviso pedía **Backend Engineer**. Propuesta honesta: `Backend Engineer (Ingeniero de Software III)` |
| Idioma activo | `ES` |
| Tema | `dark` (grafito) |

**Coherencia entre pantallas (verificar al implementar):**
- `variantes.html` / copy.md §Variantes hablan de `Backend Developer → Senior Backend Developer ·
  cargo en Altiplano Pagos`. Aquí el conflicto es `Backend Developer` vs `Backend Engineer` **del
  aviso**, que es otro eje (variante vs aviso, no variante vs master). No son el mismo hallazgo:
  no fundirlos.
- El empleador del mock (Altiplano Pagos, fintech) encaja con la variante «Backend — Fintech».
- El dashboard (copy.md) tiene su propia salud de **master** con hallazgos distintos («3 viñetas sin
  ninguna cifra», «1 rol sin fechas: Freelance (2019 – …)», «2 skills siguen sin evidencia: Kafka,
  AWS»). Esta pantalla es la salud de **una variante**: hallazgos distintos, misma gramática.

---

## 10 · Números en la UI

Regla del producto (`00-README.md` §6, `handoff.md` §4): **ningún número sin fuente**. Sin ATS score,
sin % de match, sin umbrales, sin confidence. La pantalla lo declara en su propio overline
(`Sin score, sin umbrales`) y en su comentario CSS (`sin score, sin barras, sin umbrales`).

| Número visible | Dónde | De dónde sale | ¿Legítimo? |
|---|---|---|---|
| `4` (hallazgos) | `#slN` | **Recuento de `article.sl-item` en `#list`.** En el HTML está hardcodeado en el JS. En producto debe ser `findings.length`. | ✅ es un conteo de hechos listados, verificable en pantalla |
| `0` (bloqueantes) | `#slN` | **Sin fuente en el DOM.** No hay ningún hallazgo marcado como bloqueante, ni severidad visible, ni leyenda. | ⚠️ **sospechoso** — ver abajo |
| `0 hallazgos` | `#slN` (estado orden) | conteo = 0 | ✅ |
| `2` (viñetas sin cifra) | `.tt` de c1 | conteo de viñetas del documento; las dos se citan literalmente en `.sl-d` | ✅ hecho verificable |
| `1` (página) | `.tt` de c1, `.sl-d` de c4 | paginación real del preview/PDF (mismo motor) | ✅ |
| `4` (líneas) | `.tt` de c2 | medición del layout real del documento | ✅ hecho medido |
| `7 segundos` | `.sl-d` de c2 | redondeo del `7,4 s` de la cita [Ladders 2018] | ✅ **con fuente en la cita adyacente** |
| `58,2%` | `.sl-cite` c1 | `[fuente — Jobscan 2025, n=384]` | ✅ cifra externa, atribuida, con n |
| `n=384` | `.sl-cite` c1 | idem | ✅ |
| `7,4 s` | `.sl-cite` c2 | `[fuente — Ladders 2018, eye-tracking]` | ✅ |
| `n=30` | `.sl-cite` c2 | idem, y el propio texto avisa: «estudio de vendor: dirección, no ley» | ✅ ejemplar |
| `10,6×` | `.sl-cite` c3 | `[fuente — Jobscan, 2,5M postulaciones]` + «úsalo para priorizar, no como promesa» | ✅ |
| `2,5M` (postulaciones) | `.sl-cite` c3 | tamaño de muestra del vendor | ✅ |
| `2` (página 2, huérfana) | `.tt`/`.sl-d` de c4 | paginación real | ✅ |
| `< 2,5 MB` | `.sl-brow` | `[Greenhouse]` | ✅ |
| `ES` / `EN` | header | — | n/a |

**Lo que la pantalla NO muestra (y no debe mostrar nunca):** score, porcentaje de match, barra de
progreso, semáforo, umbral de «% de viñetas con cifra» (la cita c1 dice explícitamente que **no
existe** tal umbral y por eso se señalan una a una), confianza del modelo, «87%».

### ⚠ Número sospechoso: `0 bloqueantes`

`#slN` = `"4 hallazgos · 0 bloqueantes"`. **«Bloqueante» es una categoría de severidad que no existe
en ningún otro sitio de la pantalla:**
- los 4 hallazgos comparten el mismo glifo `⚠` y el mismo color `--danger`;
- no hay leyenda, ni chip, ni orden por severidad, ni forma de que un hallazgo *sea* bloqueante;
- el estado «todo en orden» abandona la palabra (`"0 hallazgos"` a secas).

Es un número **sin fuente en el propio DOM**: el usuario no puede verificar de dónde sale el 0
porque no hay nada que pueda hacerlo 1. Dos salidas al implementar (decidir **con diseño**, no por
cuenta propia):
- **A (recomendada):** definir «bloqueante» como propiedad real del hallazgo (`finding.blocking`),
  darle representación visual distinta del `⚠` de aviso, y derivar el conteo de los datos.
- **B:** eliminar `· 0 bloqueantes` y dejar `"4 hallazgos"` — simétrico con el estado en orden.

Hasta que se decida: **copiar el literal del HTML** (`4 hallazgos · 0 bloqueantes`), porque el HTML
es la referencia; y registrar la deuda. No inventar una tercera redacción.
