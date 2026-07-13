# PROMPT 06 — CERRAR EL DISEÑO. ÚLTIMA ENTREGA.
## Para: la MISMA sesión de Claude Design (Opus 4.8)
## ⚠️ ADJUNTA: `canon-motion.css` · `canon-motion.js` · `canon-aurora.js` · `canon-aurora.css`
##
## Después de esto no hay más rondas de diseño. Se pasa a código.

---

# 0 · Estado y qué falta

**Ya entregado y aprobado:** fundación (tokens, tipografía, densidad), el documento CV con su golden
file, posicionamiento y principios, `componentes.html`, `dashboard.html`, `editor-variante.html`.

**El movimiento ya no lo diseñas tú: está construido y verificado en GPU real.** Los 4 archivos
adjuntos son la implementación. **Cópialos íntegros en cada pantalla. No los reescribas.**

**Falta esto, y es todo lo que falta:**

| # | Entregable | Estado |
|---|---|---|
| 1 | 7 pantallas: `onboarding` · `fuentes` · `staging` · `master` · `tailoring` · `salud` · `ajustes` · `auth` | ❌ |
| 2 | `dashboard.html` **con movimiento** (hoy tiene **0 keyframes**) | ❌ |
| 3 | `03-componentes/`: skill con evidencia ★ · fuente conectada · selector de repos GitHub · toggle de IA · niveles de verificación | ❌ |
| 4 | **`06-handoff/copy.md`** — todo el copy, ES + EN. **Te lo he pedido tres veces.** | ❌ |
| 5 | `06-handoff/handoff.md` + `criterios-aceptacion.md` (solo criterios de **diseño**) | ❌ |
| 6 | `02-sistema/motion.md` reescrito con la escala de ceremonia | ❌ |

---

# 1 · El kit de movimiento (adjunto, verificado, no negociable)

| Archivo | Qué es | Verificación |
|---|---|---|
| `canon-motion.css` | 11 keyframes · escala de ceremonia · hairline dorada de estados · blur-in del toggle ATS · shimmer único · `prefers-reduced-motion` completo | 11 definidos = 11 usados, 0 huérfanos |
| `canon-motion.js` | IntersectionObserver, escalonado con tope, shimmer autolimitado, toggle rayos-X, contador honesto, live regions | Ejecutado sin errores |
| `canon-aurora.js` ★ | **El fondo vivo.** Shader WebGL2 (fBm + domain warping) reactivo al ratón, en oro/cobre/plata sobre obsidiana | **Ejecutado en GPU real**: luminancia máx 73/255, 53% de píxeles visibles |
| `canon-aurora.css` ★ | El sistema **ventana / muro / velo / panel** + el dial `--aurora-strength` | Calibrado con capturas comparativas |

## API que tienes que usar

```js
CANON.stagger(lista)            // ceremonia 3 — los items se pueblan tras la ingesta
CANON.shimmer(el, 'ingesta')    // el ÚNICO shimmer del producto. Se autolimita.
CANON.countTo(el, 12)           // contador honesto
CANON.confirm(el) / .dismiss(el)
CANON.aurora.setActive(true)    // la IA trabaja → el humo se agita
CANON.aurora.pause()            // el usuario escribe → SE DETIENE. El editor es sagrado.
```

## Ventana / muro — la regla que ordena todo

```html
<section class="c-window">   <!-- el humo asoma -->
<section class="c-wall">     <!-- el humo está tapado -->
<div class="c-panel">        <!-- vidrio ahumado: se intuye el humo detrás -->
<div class="c-panel--solid"> <!-- opaco: listas densas y editor -->
```

| ✅ VENTANA | 🧱 MURO |
|---|---|
| login · onboarding · **espera de la ingesta** · dashboard vacío del día 1 | master con 200 items · **editor de variante** · staging · tailoring · el documento |

**Donde hay trabajo, el trabajo gana. Siempre.**

---

# 2 · Valores exactos extraídos de la referencia (verificados en el navegador)

Úsalos. No los reinventes.

## Movimiento

- **Easing real de todo el sitio: `cubic-bezier(0.16, 1, 0.3, 1)`** (easeOutExpo). Es su firma.
  *(Sus variables `--motion-easing-*` están definidas pero **no se usan**. Lastre.)*
- **Reveal** = `opacity:0 · filter:blur(3-6px) · translateY(8-30px)` → estado final limpio.
  Transición de **0.9 s** en tarjetas.
- **Escalonado**: `transition-delay` de **80 / 160 / 240 / 320 / 400 ms**.
- **`dividerDraw`**: `scaleX(0) → scaleX(1)`, **1 s**, en el `::before` de **cada sección**.
- **164 reglas** bajo `prefers-reduced-motion: no-preference` → **toda** su animación está condicionada.

## ★ El truco de layout que hay que robar: **gaps hairline**

Sus rejillas usan **`gap: 1–2 px`** sobre fondo oscuro. **El hueco mismo hace de línea divisoria.**
No hay bordes entre tarjetas contiguas. Es elegante, es barato, y da la densidad de "interfaz real".

| Rejilla | gap |
|---|---|
| Bento de features (12 col) | **2 px** |
| Pasos (3 col) | **1 px** |
| Métricas (4 col) | **1 px** |

## ★ La densidad: micro-tipografía real, NO `transform: scale()`

Dentro de sus mini-UI: fuentes de **5.6–8 px**, filas de **11–18 px**, gaps de **4–6 px**, mono en
IDs y cifras. Eso es lo que hace que parezca una interfaz de verdad metida en una tarjeta.

## Anatomía del botón con glow (reconstruible tal cual)

```css
.forge{ position:relative; display:inline-flex; border-radius:8px; }
.forge::before{                      /* el GLOW */
  content:""; position:absolute; inset:-6px; z-index:0;
  background:var(--gold-500); border-radius:12px;
  opacity:.12; filter:blur(14px);
  transition:opacity .5s cubic-bezier(.16,1,.3,1), filter .5s cubic-bezier(.16,1,.3,1);
}
.forge:hover::before{ opacity:.3; filter:blur(20px); }

.btn{ position:relative; z-index:1; overflow:hidden;
  background:#050508; color:var(--gold-300); border:1px solid var(--gold-700);
  border-radius:6px; transition:.4s cubic-bezier(.16,1,.3,1); }
.btn::before{                        /* filamento luminoso horizontal */
  content:""; position:absolute; top:50%; left:0; right:0; height:1px; opacity:.5;
  background:linear-gradient(90deg, transparent 10%, var(--gold-500) 50%, transparent 90%);
  transition:.6s cubic-bezier(.16,1,.3,1); }
.btn:hover{ color:#F5F5F2; border-color:var(--gold-500); transform:translateY(-2px);
  box-shadow:0 12px 40px rgba(212,175,55,.15); }
.btn:hover::before{ opacity:1; height:2px; top:35%;
  box-shadow:0 0 20px var(--gold-500), 0 0 40px rgba(212,175,55,.3); }
```

## Otros valores

- Ritmo vertical de sección: **`padding: 160px 0`** · contenedor **`max-width: 1200px; padding-inline: 24px`**
- Header **64 px**, sticky, `backdrop-filter: blur(4px) saturate(1.5)`
- Radios: **3 / 6 / 8 / 12 px**. Alturas de control: **40 / 44 / 62 px**
- Spotlight de tarjeta al hover: `radial-gradient(400px, rgba(255,255,255,.04), transparent 60%)`
- Breakpoints reales: **768 px** y **480 px** (mobile-last)

## Lo que NO copiamos

- ❌ Sus 4 acentos (esmeralda + púrpura + carmesí + oro). **Nosotros tenemos uno.**
- ❌ El texto con degradado.
- ❌ **Lenis** (smooth-scroll). Secuestra el scroll nativo: en una lista de 200 items el contenido
  *resbala* y sobrepasa el objetivo. Permitido **solo** en pantallas de lectura.
- ❌ Su metáfora alquímica. La nuestra ya existe y es mejor para nosotros.

---

# 3 · Reglas del movimiento en la app

> **Una animación se gana su lugar si comunica un cambio de estado. Si solo decora, se borra.**
> **Cuanto más frecuente es la acción, más corta debe ser — hasta desaparecer.**

| Ceremonia | Frecuencia | Presupuesto | Ejemplos |
|---|---|---|---|
| **0 · Instantáneo** | decenas/día | **0–80 ms**, solo color/opacidad | editar viñeta, mostrar/ocultar, reordenar |
| **1 · Confirmación** | varias/sesión | **120–200 ms** | aceptar item, añadir a variante, revertir override |
| **2 · Transición** | pocas/sesión | **250–400 ms** | cambiar de variante, **el blur-in del toggle ATS** |
| **3 · Ceremonia** | una vez cada mucho | **600–1200 ms** | terminar una ingesta → escalonado + shimmer |

**Prohibido:** scroll-reveal en la app (con 200 items no puedo trabajar) · animar mientras se
escribe · animar `width`/`height`/`top`/`box-shadow` en listas · un shimmer que salga dos veces.

---

# 4 · Dónde va cada cosa, pantalla por pantalla

| Pantalla | Obligatorio |
|---|---|
| **Dashboard** *(hoy: 0 keyframes)* | `c-divider` en cada encabezado · `c-hairline` en tarjetas · `c-pending` en variantes desactualizadas · `c-skeleton` al cargar fuentes · **muro** · **cero scroll-reveal** · **vacío Y denso (200 items, 7 variantes)** |
| **Auth / login** | **ventana** + aurora en calma. Primera impresión del producto. |
| **Onboarding** | **ventana** + aurora · **las dos puertas simétricas**: (A) desde cero o desde plantilla de perfil, sin IA · (B) con IA desde tus fuentes. **Ninguna es de segunda.** |
| **Espera de la ingesta** ★ | **ventana** + `CANON.aurora.setActive(true)` — el humo se agita mientras la IA piensa · `c-thinking` · progreso **específico y verdadero** ("Leyendo página 2 de 3…", "Encontré 4 experiencias") · **jamás un porcentaje inventado** |
| **Staging** ★ | `CANON.stagger()` · `CANON.countTo()` · `CANON.shimmer()` **una vez** · `c-confirm`/`c-dismiss` · **`c-unverified`** en lo que la IA no puede demostrar · fusión de duplicados · **muro** |
| **Master** | `c-divider` por sección · **la skill con evidencia** · edición inline · **muro** |
| **Editor de variante** | ya está bien: **mantén el blur-in**. Añade `c-override` y `c-panel-in`. **muro** |
| **Fuentes** | GitHub OAuth · **selector de repos** (default revisable: no-fork, con descripción, activo) · portfolio · LinkedIn (capturas/PDF) · estado de sync · **lo nuevo va a staging, nunca al master** |
| **Tailoring** | los **tres grupos**: ya está / lo tienes en el master (1 clic) / **no lo tienes en ninguna parte → NO ofrecer añadirlo** · original ⇄ propuesto lado a lado |
| **Salud** | **sin score, sin barras, sin umbrales.** Solo lo que **puede fallar** (no listes los ✓ que el renderer garantiza por construcción: eso es teatro) |
| **Ajustes** | idioma · tema · **toggle global de IA** (y cómo se ve todo con la IA apagada) · BYOK · exportar todo · borrar todo · `.c-doc` (único sitio con scroll-reveal permitido) |

---

# 5 · El componente estelar

**La skill con evidencia.** Ninguna herramienta del mercado lo tiene:

```
Go                                                    ● verificado
412 KB · 3 repos · citada en 2 viñetas de experiencia
github.com/usuario/pago-conciliador  ·  +2 más
─────────────────────────────────────────────────────────────
Kubernetes                                        ⚠ sin evidencia
No aparece en ninguna viñeta, ni en tus repos, ni en tu portfolio.
¿Dónde lo usaste?
```

**Y la regla que lo hace posible: nunca un icono donde puedas poner el dato.**
En vez de un icono de GitHub → `Go · 412 KB · 3 repos`, en mono. **No decimos que verificamos:
enseñamos la verificación.**

---

# 6 · `copy.md` — tercera y última vez que lo pido

El copy **es** el producto. La diferencia entre:

> ❌ *"Faltan 7 keywords — tu match es 62%"*
> ✅ *"El aviso pide Kubernetes. No aparece en tu master. ¿Lo has usado y no lo registraste, o es una brecha real?"*

...es la tesis entera. El primero es Jobscan. El segundo somos nosotros.

**Escríbelo línea por línea, ES + EN:** los tres grupos del tailoring · los estados vacíos · los
errores · el "sin evidencia" · el dashboard del día 1 · los mensajes de progreso de la ingesta · las
dos puertas del onboarding · el selector de repos.

**Si no lo entregas, ingeniería lo improvisa y va a sonar a Jobscan.**

---

# 7 · La prueba que voy a correr sobre tu entrega

```bash
for f in 03-componentes/*.html 04-pantallas/*.html; do
  grep -c "@keyframes"            "$f"   # ≥ 11 en TODAS
  grep -c "prefers-reduced-motion" "$f"  # ≥ 1
done
grep -l "CANON.stagger\|CANON.shimmer" 04-pantallas/staging.html
grep -l "data-xray-toggle"              04-pantallas/editor-variante.html
grep -l "c-aurora-gl"                   04-pantallas/{onboarding,auth,ingesta}.html
test -f 06-handoff/copy.md
```

**Si el dashboard vuelve a salir con 0 keyframes, o falta `copy.md`, la entrega se rechaza.**
No es una amenaza: ya pasó, y no puedo verificar prosa.

---

# 8 · Lo que no cambia

- El documento CV: **como está**. **No se mueve: es papel.**
- **La app es bellísima. El documento es sobrio.**
- **Un** acento en la UI. Los tres metales viven **solo en la atmósfera** del shader.
  **Atmósfera ≠ señal.**
- **La IA nunca inventa. Ningún número sin fuente.**
- **Diseña para la dignidad.**

---

> Cierra el diseño. Con esta entrega pasamos a construir.
