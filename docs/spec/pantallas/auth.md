> ⚠️ **DEROGADO (PROMPT 07) — la gramática «ventana / muro» ya NO rige.**
> Lo que sigue describe la regla vieja: *«donde hay trabajo, el trabajo gana; los muros
> ni montan la aurora»*. Se sacó de una landing con scroll, donde la alternancia produce
> ritmo. Corpus es una app con pestañas: nunca ves la alternancia, solo la inconsistencia.
>
> **Doctrina vigente** (`src/app/globals.css` §3): la aurora está SIEMPRE presente — la
> monta UNA vez el shell de `/app`. Lo que protege la lectura no es su ausencia, sino la
> SUPERFICIE sobre la que vive el contenido: intensidad 0.55 al hojear, 0.22 en trabajo
> denso, y el texto sobre vidrio. **No vuelvas a quitar la aurora de una pantalla.**

# auth — spec de pantalla

> Fuente literal: `Corpus_ diseño completo/corpus-design/04-pantallas/auth.html` (844 líneas).
> El HTML es la REFERENCIA VISUAL LITERAL. Los nombres de clase son el contrato diseño↔código: **no se renombran**.
> Los bloques `<style data-corpus-system="css">` (líneas 10–486) y `<script data-corpus-system="js">` (líneas 547–818)
> son copia del sistema canónico (`02-sistema/*`) y **no** se transcriben aquí: ya los tenemos.
> Lo que sigue es **solo lo específico de esta pantalla**.

---

## 1 · Ruta y propósito

- **Ruta del producto:** `/login` · `/signup` (una sola pantalla con dos modos, no dos páginas).
- **`<title>`:** `Corpus — Entrar`
- **`<html lang="es" data-theme="dark">`**
- **Propósito:** puerta de entrada. Entrar o crear cuenta con email + contraseña (u OAuth Google/GitHub), sobre el claim
  del producto y con la promesa de propiedad de los datos al pie. Serena, sin promesas infladas.
- **Salidas:** `Entrar` → `dashboard.html` (`/app`) · `Crear mi registro` → `onboarding.html` (`/app/onboarding`).

---

## 2 · Ventana o muro · Aurora

**Es VENTANA.** Monta la aurora.

- `window.CorpusAurora.mount({state:'calm'})` — línea 823, primera instrucción del script de pantalla.
  Estado **`'calm'`** (la aurora respira: `speedT=.35`, `actT=0`). Nunca `'active'` — `'active'` es exclusivo de ingesta.
- **No hay `<div class="c-aurora">` en el HTML.** `aurora.js` lo crea y lo antepone al `<body>` con `aria-hidden="true"`
  si no existe. En React: no lo declares tú tampoco, o duplicarás el canvas.
- Sin WebGL2 o con `prefers-reduced-motion` → `.c-aurora-fallback` (gradiente estático). Lo resuelve el sistema.
- La aurora **se pausa sola al enfocar cualquier `input`** (`focusin` cableado en `motion.js`, líneas 798–804).
  En esta pantalla eso ocurre siempre: hay tres campos. Es el comportamiento correcto, no un bug.

**Gramática de capas en esta pantalla:**

| Clase | Dónde | Efecto |
|---|---|---|
| `.c-window` | `<main class="au-main c-window">` | `background:transparent` — el humo se ve a través |
| `.c-panel` | `<div class="c-panel au-panel">` | vidrio ahumado (`blur(14px) saturate(1.15)`, `--shadow-2`) |
| `.c-wall` | **NO SE USA** | correcto: aquí no hay trabajo que leer, hay una puerta |
| `.c-scrim` | **NO SE USA** | ver aviso ⚠ |

⚠ **`.au-claim` y `.au-fine` son texto directamente sobre la ventana, SIN velo.** El sistema dice
«Velo: cuando hay texto directamente sobre una ventana», pero esta pantalla **decide no usarlo** y compensa con
`--text-muted` / `--text-subtle` y una aurora en calma. **Reprodúcelo tal cual: no añadas `.c-scrim`.**

Recuerda la regla: *«donde hay trabajo, el trabajo gana»* — los muros ni montan la aurora. Aquí no hay trabajo: hay ceremonia de entrada.

---

## 3 · Esqueleto DOM

Leyenda: **(S)** = clase del sistema (`c-*`, `t-*`, `hd-*`) · **(P)** = clase propia de la pantalla (`au-*`, `demo`).

```
body
└── div.c-page                                                      (S)
    └── main.au-main.c-window  [data-screen-label="auth"]           (P)(S)
        ├── div.au-brand  [data-reveal]                             (P)
        │     → "Corpus"   (::after = cuadrito de pátina 6×6)
        ├── p.au-claim  [data-reveal] [style="--d:120ms"]           (P)
        │     → claim del producto
        ├── div.c-panel.au-panel  [data-reveal] [style="--d:260ms"] (S)(P)
        │   ├── h2#auTitle                                          (—)
        │   │     → "Entrar"  |  "Crear cuenta"   (lo cambia mode())
        │   ├── div.au-err#auErr                                    (P)
        │   │     → texto de error + a[href="#"][style="white-space:nowrap"] → "Recuperar acceso →"
        │   │       (oculto por defecto: display:none; se muestra con .show)
        │   ├── div.au-f                                            (P)
        │   │   ├── label.c-label[for="em"] → "Email"               (S)
        │   │   └── input.c-input#em[type=email][autocomplete=email][placeholder="tu@correo.cl"]   (S)
        │   ├── div.au-f                                            (P)
        │   │   ├── label.c-label[for="pw"] → "Contraseña"          (S)
        │   │   └── input.c-input#pw[type=password][autocomplete=current-password][placeholder="••••••••••"] (S)
        │   ├── div.au-f#pw2wrap  [hidden]                          (P)
        │   │   ├── label.c-label[for="pw2"] → "Repite la contraseña"   (S)
        │   │   └── input.c-input#pw2[type=password][autocomplete=new-password][placeholder="••••••••••"]  (S)
        │   ├── div.au-cta                                          (P)
        │   │   └── span.c-forge  [style="width:100%"]              (S)
        │   │       └── a.c-btn.c-btn--forge.c-btn--lg#auGo  [href="dashboard.html"] [style="width:100%"]  (S)
        │   │             → "Entrar"  |  "Crear mi registro"
        │   ├── div.au-alt                                          (P)
        │   │   ├── button.c-btn → "Continuar con Google"           (S)
        │   │   └── button.c-btn → "Continuar con GitHub"           (S)
        │   └── div.au-links                                        (P)
        │       ├── a#auSwap[href="#"] → "Crear cuenta" | "Ya tengo cuenta"
        │       └── a[href="#"]        → "Olvidé mi contraseña"
        └── p.au-fine  [data-reveal] [style="--d:380ms"]            (P)
              → pie de propiedad de los datos

div.demo  [role="group"] [aria-label="Estados de la pantalla (revisión de diseño)"]   (P · convención de entrega, NO producto)
├── span → "demo"
├── button[data-st="login"]  [aria-pressed="true"]  → "login"
├── button[data-st="signup"] [aria-pressed="false"] → "signup"
└── button[data-st="error"]  [aria-pressed="false"] → "error"
```

**Ausencias deliberadas (no las inventes):** no hay `.c-header`, ni `.hd-nav`, ni `<form>`, ni `.c-divider`, ni `.c-scrim`, ni `.c-wall`.

**Inventario de `data-*` de la pantalla:**
`data-theme="dark"` (en `<html>`) · `data-screen-label="auth"` · `data-reveal` (×4, sin valor → variante por defecto) ·
`data-st` (×3, en el panel demo) · `--d` inline: `120ms` / `260ms` / `380ms` (el brand va sin delay).

---

## 4 · CSS específico de pantalla

Segundo `<style>` del archivo (líneas 487–505), **fuera** de `data-corpus-system`. Copia verbatim:

```css
/* ── auth.html — VENTANA, aurora en calma. Serena, sin promesas infladas. ── */
.au-main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px var(--container-pad) 90px}
.au-brand{font:500 26px/1 var(--font-display)}
.au-brand::after{content:"";display:inline-block;width:6px;height:6px;margin-left:5px;background:var(--patina-500);border-radius:1px;vertical-align:super}
.au-claim{margin-top:14px;color:var(--text-muted);font-size:var(--fs-lead);text-align:center;max-width:40ch}
.au-panel{width:100%;max-width:400px;margin-top:36px;padding:28px 28px 24px}
.au-panel h2{font:600 17px/1.3 var(--font-sans)}
.au-f{margin-top:16px}
.au-err{display:none;margin-top:16px;padding:11px 14px;border:1px solid color-mix(in srgb,var(--danger) 45%,transparent);
  border-radius:var(--radius-sm);background:var(--danger-quiet);font:400 var(--fs-data)/1.6 var(--font-sans);color:var(--text)}
.au-err.show{display:block}
.au-cta{margin-top:20px;width:100%}
.au-cta .c-btn{width:100%}
.au-alt{margin-top:14px;display:grid;gap:8px}
.au-alt .c-btn{width:100%}
.au-links{margin-top:18px;display:flex;justify-content:space-between;font-size:var(--fs-ui)}
.au-fine{margin-top:30px;max-width:44ch;text-align:center;font:400 var(--fs-micro)/1.8 var(--font-mono);color:var(--text-subtle)}
```

**@keyframes propios: NINGUNO.** Esta pantalla no define ni una animación. Todo su movimiento viene del sistema
(`[data-reveal]` + `--d`, `.c-forge` / `.c-btn--forge` hover, `:focus-visible`). No hay media queries propias
(el responsive lo dan `--container-pad` y `max-width:400px`).

**Notas de fidelidad del CSS:**
- El brand NO usa `.c-logo` del sistema: usa `.au-brand` (26px, cuadrito 6×6 en vez de 5×5). Es a propósito.
- `.au-panel` es un `.c-panel` **con padding asimétrico** `28px 28px 24px` y `max-width:400px`.
- `.au-cta .c-btn{width:100%}` + `style="width:100%"` en el `span.c-forge` — **ambos** hacen falta:
  `.c-forge` es `inline-flex` y sin el inline no se estira.
- El error se conmuta por **clase `.show`**, no por el atributo `hidden`. `#pw2wrap` sí usa `hidden`. Dos mecanismos distintos, ambos literales.

---

## 5 · Estados del panel demo

Los tres del handoff: **login · signup · error**. Los activa el panel flotante `.demo` (abajo a la derecha), que
**no es producto**: es convención de entrega. Todo pasa por una única función `mode(m)` (líneas 825–833).

| Estado | `#auTitle` | `#auGo` (texto) | `#auGo` (href) | `#pw2wrap` | `#auSwap` | `#auErr` |
|---|---|---|---|---|---|---|
| **login** (por defecto) | `Entrar` | `Entrar` | `dashboard.html` | `hidden` | `Crear cuenta` | sin `.show` (oculto) |
| **signup** | `Crear cuenta` | `Crear mi registro` | `onboarding.html` | visible | `Ya tengo cuenta` | sin `.show` (oculto) |
| **error** | `Entrar` | `Entrar` | `dashboard.html` | `hidden` | `Crear cuenta` | **`.show`** (visible) |

Puntos que se han roto en implementaciones anteriores:

1. **`error` NO es un estado independiente: es `login` + el bloque de error visible.** En `mode()`,
   `signup = (m==='signup')`, así que con `m==='error'` **todo** el formulario cae al layout de login y solo
   `#auErr` se enciende. No inventes un "modo error" con otro título ni con la caja de repetir contraseña.
2. **`signup` apaga el error** (`classList.toggle('show', m==='error')` se evalúa siempre, en los tres estados).
3. El markup del DOM **no cambia de forma** entre estados: `#pw2wrap` ya existe en el HTML y solo alterna `hidden`.
   No se monta ni desmonta nada. No hay animación de entrada del campo (no se llama a `M.enter`).
4. El estado inicial de la página **es `login` por markup** (título `Entrar`, `#pw2wrap[hidden]`, `#auErr` sin `.show`,
   `button[data-st="login"][aria-pressed="true"]`); `mode()` **no** se llama al cargar.

---

## 6 · Comportamiento JS de la pantalla

Segundo `<script>` (líneas 819–841), **fuera** de `data-corpus-system`. Es todo. Copia verbatim:

```js
(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], M=window.CorpusMotion;
window.CorpusAurora.mount({state:'calm'});
M.boot();
function mode(m){
  const signup=m==='signup';
  $('#auTitle').textContent=signup?'Crear cuenta':'Entrar';
  $('#auGo').textContent=signup?'Crear mi registro':'Entrar';
  $('#auGo').href=signup?'onboarding.html':'dashboard.html';
  $('#pw2wrap').hidden=!signup;
  $('#auSwap').textContent=signup?'Ya tengo cuenta':'Crear cuenta';
  $('#auErr').classList.toggle('show',m==='error');
}
$('#auSwap').addEventListener('click',e=>{e.preventDefault();
  mode($('#pw2wrap').hidden?'signup':'login')});
$$('.demo button').forEach(b=>b.onclick=()=>{
  $$('.demo button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  mode(b.dataset.st);
});
})();
```

**Desglose:**

- **`CorpusAurora.mount({state:'calm'})`** — única llamada a la aurora. No hay `setState`, ni `pause/resume`,
  ni `setStrength` explícitos en esta pantalla (el pause por foco lo hace `motion.js`, no este script).
- **`CorpusMotion.boot()`** — **crítico.** Busca `[data-reveal]:not([data-visible])` y `.c-divider` y los marca
  `data-visible` en el siguiente doble-rAF. **Sin `boot()` la pantalla se queda invisible**
  (`[data-reveal]{opacity:0;filter:blur(5px);transform:translateY(14px)}` bajo `prefers-reduced-motion: no-preference`).
  El escalonado es de **CSS inline** (`--d`: 0 / 120 / 260 / 380 ms), no del helper `stagger()`.
- **Ninguna otra API de CorpusMotion se usa**: no hay `stagger`, `reveal`, `words/chars`, `counter`, `shimmer`,
  `xray`, `io`, ni `enter`. (Coherente: el shimmer es único en el producto y vive en el fin de ingesta.)
- **`#auSwap`** alterna login⇄signup **derivando el modo de `#pw2wrap.hidden`** (no de una variable de estado).
  Hace `preventDefault()`. Nota: si estabas en `error` y pulsas «Crear cuenta», pasa a `signup` y el error desaparece.
- **Panel demo:** usa `b.onclick=` (asignación, no `addEventListener`), sincroniza `aria-pressed` en los tres botones
  (`String(x===b)`) y llama a `mode(b.dataset.st)`.
- **Atajos de teclado: NINGUNO.** Esta pantalla no registra `keydown`/`keyup`. (Los atajos `j/k/a/d/o` son de staging.)
- **No hay `<form>`, ni `submit`, ni validación, ni estado de "enviando".** El CTA es un `<a href>` de navegación.
  Los botones OAuth **no tienen ningún handler**: son maqueta.

---

## 7 · Copy (verbatim, ES)

Todas las cadenas visibles del archivo. ✅ = existe en `06-handoff/copy.md` §Auth · ❌ = **solo** está en el HTML
(el HTML manda: cópialas de aquí).

| # | Dónde | Texto literal | ¿copy.md? |
|---|---|---|---|
| 1 | `<title>` | `Corpus — Entrar` | ❌ |
| 2 | `.au-brand` | `Corpus` | ❌ |
| 3 | `.au-claim` | `Un registro canónico de tu carrera. Cada CV, una vista de él — no una copia.` | ✅ *claim* |
| 4 | `#auTitle` (login/error) | `Entrar` | ❌ |
| 5 | `#auTitle` (signup) | `Crear cuenta` | ❌ |
| 6 | `#auErr` | `Ese correo y esa contraseña no calzan. No sabemos cuál de los dos falla — así funciona la seguridad. ` | ✅ *error de credenciales* |
| 7 | `#auErr > a` | `Recuperar acceso →` | ✅ (misma línea de copy.md) |
| 8 | `label[for=em]` | `Email` | ❌ |
| 9 | `#em` placeholder | `tu@correo.cl` | ❌ |
| 10 | `label[for=pw]` | `Contraseña` | ❌ |
| 11 | `#pw` placeholder | `••••••••••` (10 × U+2022) | ❌ |
| 12 | `label[for=pw2]` | `Repite la contraseña` | ❌ |
| 13 | `#pw2` placeholder | `••••••••••` (10 × U+2022) | ❌ |
| 14 | `#auGo` (login/error) | `Entrar` | ❌ |
| 15 | `#auGo` (signup) | `Crear mi registro` | ❌ |
| 16 | `.au-alt button` 1 | `Continuar con Google` | ❌ |
| 17 | `.au-alt button` 2 | `Continuar con GitHub` | ❌ |
| 18 | `#auSwap` (login/error) | `Crear cuenta` | ❌ |
| 19 | `#auSwap` (signup) | `Ya tengo cuenta` | ❌ |
| 20 | `.au-links a` 2 | `Olvidé mi contraseña` | ❌ |
| 21 | `.au-fine` | `Tus datos son tuyos: exportas todo o borras todo desde Ajustes, sin pedir permiso. La descarga de tu CV nunca queda detrás de un pago.` | ✅ *pie* |
| 22 | `.demo span` | `demo` | ❌ (convención de entrega) |
| 23 | `.demo button`s | `login` · `signup` · `error` | ❌ (convención de entrega) |
| 24 | `.demo` aria-label | `Estados de la pantalla (revisión de diseño)` | ❌ (convención de entrega) |

**Cuidado con los espacios:** #3, #6 y #21 están partidos en varias líneas del HTML; el navegador colapsa el salto
de línea en **un espacio**. Al portarlos a JSX escríbelos como **una sola cadena** con un espacio simple.
Los guiones son **em-dash `—` (U+2014)**, no `-`. La flecha es `→` (U+2192).

---

## 8 · Accesibilidad

**Lo que el archivo SÍ hace:**

- `<html lang="es">`.
- Los tres campos tienen `<label class="c-label" for="...">` correcto (`em`, `pw`, `pw2`), no placeholders-como-label.
- `autocomplete` correcto y distinto por modo: `email` · `current-password` · `new-password` (pw2).
- `#pw2wrap` usa el atributo **`hidden`** → sale del árbol de accesibilidad **y del orden de foco** cuando es login.
- El panel demo es `role="group"` con `aria-label="Estados de la pantalla (revisión de diseño)"` y `aria-pressed`
  sincronizado en sus tres botones (patrón toggle).
- La aurora se inserta con `aria-hidden="true"` (lo hace `aurora.js`): el lector de pantalla nunca la ve.
- Anillo de foco del sistema: `:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}`.
- Todo el movimiento vive bajo `@media (prefers-reduced-motion: no-preference)`; el estado base es el final
  (se pierde el movimiento, nunca la información).

**Orden de foco** (login): `#em` → `#pw` → `#auGo` → botón Google → botón GitHub → `#auSwap` → «Olvidé mi contraseña»
→ botones del panel demo.
(signup): se inserta `#pw2` entre `#pw` y `#auGo`.
(error): igual que login, pero el enlace `Recuperar acceso →` de `#auErr` entra **antes** que `#em`
(está antes en el DOM). ⚠ En login/signup ese enlace está dentro de un `display:none`, así que no es focusable — correcto.

**Hit targets:** `#auGo` es `.c-btn--lg` → **44px** (cumple el mínimo móvil del handoff).
Los OAuth son `.c-btn` → **40px** (por debajo de 44 en móvil; el handoff pide ≥44 en móvil — ver §Contradicciones).
Los enlaces de `.au-links` son texto plano de 13px, sin padding: hit target pequeño.

**Atajos de teclado: ninguno.**

**Huecos reales de accesibilidad (los hereda quien implemente; decide con el diseñador, pero NO los "arregles"
cambiando clases):**

1. **`#auErr` no tiene `role="alert"` ni `aria-live`.** Aparece/desaparece por CSS y **no se anuncia**.
   Tampoco está referenciado por `aria-describedby` desde `#em`/`#pw`, ni hay `aria-invalid` en los campos.
2. **No hay `<form>`**: no se puede enviar con Enter desde un campo. El CTA es un `<a href>`, no un `<button type=submit>`.
   Si en producción lo conviertes en formulario real, **mantén las clases** `c-btn c-btn--forge c-btn--lg` y el
   wrapper `span.c-forge` intactos, o pierdes el glow/filamento.
3. **El cambio de modo (login⇄signup) no se anuncia**: el `<h2>` cambia su `textContent` sin región viva y el panel
   no tiene `aria-labelledby="auTitle"`.
4. Los enlaces `href="#"` (`#auSwap`, «Olvidé mi contraseña», «Recuperar acceso →») son placeholders de maqueta.

---

## 9 · Datos del mock

**Esta pantalla no contiene datos de la persona del mock.** No aparece **Diego Gatica**, ni ninguna cifra de la
historia compartida (61 items, 43/8/9, 52, 7 variantes, 412.803 bytes, Altiplano Pagos…). Es correcto: antes de
entrar no hay registro que mostrar.

Lo único "de datos" es el placeholder del email: **`tu@correo.cl`** — genérico, chileno, sin nombre propio.
Coherente con la persona (Diego Gatica, Chile; el resto de pantallas usan `.cl`, `es-CL` en `counter()` y
«Altiplano Pagos»), pero **no lo sustituyas por el correo de Diego**: el HTML dice `tu@correo.cl` y punto.

Navegación que sí compromete a otras pantallas (mantén el destino, cambia solo la ruta):
`dashboard.html` → `/app` · `onboarding.html` → `/app/onboarding`.

---

## 10 · Números en la UI

Auditoría completa de todo número visible para el usuario:

| Número visible | Dónde | Fuente | ¿Sospechoso? |
|---|---|---|---|
| *(ninguno)* | — | — | — |

**Resultado: CERO números en la UI de esta pantalla.** Ni score, ni %, ni contadores, ni «10,6×», ni umbrales.
Cumple sin excepciones la regla 4 del handoff («Ningún número sin fuente en la UI») y la 6 del README.

Aclaraciones para que nadie lo cuente mal:

- Los `••••••••••` (10 puntos) del placeholder de contraseña **no son un número** ni una longitud mínima anunciada:
  son un adorno tipográfico. **No los conviertas en una regla de validación de 10 caracteres**, y no muestres
  «mínimo N caracteres» — no existe en el diseño.
- `--d:120ms / 260ms / 380ms`, `max-width:400px`, `26px`, `40ch`, `44ch`… son **CSS**, no UI. No se muestran.
- El `01/02/03` de las vías de LinkedIn, el `61`, el `43` — pertenecen a otras pantallas. **No los traigas aquí.**

**Ningún número sospechoso que reportar.** Si en la implementación aparece un contador de intentos, una barra de
fuerza de contraseña con %, o cualquier cifra: **es una invención y viola el producto.**

---

## Riesgos de implementación (léelos antes de escribir React)

1. **`CorpusMotion.boot()` es obligatorio tras el montaje.** Los cuatro `[data-reveal]` arrancan en `opacity:0`.
   Si el efecto no corre (o corre antes de que existan los nodos), **la pantalla se ve en blanco**. Este es el fallo
   nº1 de los ports anteriores.
2. **`CorpusAurora.mount()` no es idempotente frente a un desmontaje de React.** `mount()` se protege con
   `if(S.el)return api`, pero el módulo es un singleton global sin `destroy()`: en StrictMode / navegación SPA
   puedes acabar con dos canvas o con el `raf` cancelado. Monta una sola vez, a nivel de app, y **no declares
   `<div class="c-aurora">` en el JSX** (aurora.js lo crea).
3. **`span.c-forge` + `style="width:100%"` inline.** Si React lo pierde (o alguien "limpia" el inline style),
   el CTA deja de ocupar el ancho del panel. Hacen falta los dos: la regla `.au-cta .c-btn{width:100%}` **y** el inline del span.
4. **El error se conmuta con la clase `.show`, no con `hidden`.** `.au-err` es `display:none` por defecto.
   Si lo renderizas condicionalmente (`{error && <div>}`) pierdes nada visual, **pero** cambias el orden de foco
   y el contrato de la clase: reproduce `className={`au-err ${error ? 'show' : ''}`}` con el nodo siempre presente.
5. **`#pw2wrap` se conmuta con el atributo `hidden`**, y el sistema tiene `[hidden]{display:none!important}`.
   Renderízalo siempre y pasa `hidden={!signup}`.
6. **El estado `error` es `login` + error.** No lo modeles como un tercer layout.
7. **`#auSwap` deriva el modo del DOM (`#pw2wrap.hidden`).** Al portarlo a estado de React, la lógica equivalente es
   `setMode(m => m === 'signup' ? 'login' : 'signup')` — ojo: desde `error` debe ir a **`signup`** (porque en error
   `pw2wrap` está `hidden`), no a `login`.
8. **`.au-claim` / `.au-fine` van sin velo sobre la aurora.** No añadas `.c-scrim` "para mejorar el contraste":
   romperías la referencia.
9. **La aurora se pausa al enfocar un campo** — en esta pantalla eso es casi siempre. Si la ves congelada mientras
   escribes, **está bien**. No lo "arregles".
10. **Los OAuth no hacen nada** en la maqueta y son `.c-btn` de 40px. Al cablearlos, no cambies las clases ni el copy.
11. **`prefers-reduced-motion`**: la aurora cae al fallback CSS y los reveals aparecen sin transición. Verifica los dos caminos.
12. **El panel `.demo` no es producto.** No lo lleves a producción; sí replica sus tres estados en Storybook/tests.

---

## Contradicciones y ambigüedades detectadas

1. **Hit target de los OAuth (40px) vs el handoff (≥44px en móvil).** `handoff.md` dice «hit targets móviles ≥ 44 px»,
   pero `Continuar con Google` / `Continuar con GitHub` son `.c-btn` = `--control-h` = **40px**. El único de 44px es el
   CTA (`.c-btn--lg`). **El HTML es la referencia literal → deja 40px** y escala la decisión al diseñador; no cambies
   la clase por tu cuenta.
2. **`copy.md` §Auth solo cubre 3 cadenas** (claim, error, pie). Los labels, los CTAs («Entrar», «Crear mi registro»,
   «Crear cuenta», «Ya tengo cuenta», «Olvidé mi contraseña»), los botones OAuth y los placeholders **no están en
   copy.md** y solo existen en el HTML. No los reescribas ni los "mejores": son el contrato.
3. **`copy.md` da EN para las 3 cadenas del claim/error/pie, pero el HTML no tiene ningún mecanismo de i18n**
   (ni `hd-lang`, ni `data-i18n`). Falta decidir cómo se localizan las ~18 cadenas que solo existen en ES en el HTML.
4. **El sistema pide velo (`.c-scrim`) para texto sobre ventana; auth no lo usa.** La pantalla es la excepción
   declarada («Serena, sin promesas infladas»). Reprodúcela como está; anota la excepción.
5. **`handoff.md` dice que todas las pantallas «se abren con doble clic y se mueven»** y la persona es Diego Gatica;
   auth no muestra ningún dato de la persona. No es un error — es que la pantalla es previa al registro. Nada que perseguir.
6. **`#auErr` sin `role="alert"`** contradice el espíritu del apartado de accesibilidad del handoff
   («contrastes verificados… focus-visible… `prefers-reduced-motion` en todo»), que no menciona live regions.
   Es un hueco real, no una decisión: al implementar, propón `role="alert"` **sin tocar la clase `.au-err`**.