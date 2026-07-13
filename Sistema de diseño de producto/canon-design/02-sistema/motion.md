# Motion

> Corto, con curva, **nunca decorativo.** El sistema original dice *"todo se siente calibrado"*.
> El motion en CANON tiene un trabajo: confirmar acciones, orientar transiciones y **hacer digna la
> espera de la IA**. Nada más. Valores en `tokens.css` (`--dur-*`, `--ease-*`).

---

## Duraciones

| Token | Valor | Uso |
|---|---|---|
| `instant` | 80 ms | Cambios de estado inmediatos (hover, active) |
| `fast` | 140 ms | Micro-transiciones: tooltip, checkbox, foco |
| `base` | 220 ms | Por defecto: aparición de paneles, drawers, tabs |
| `slow` | 360 ms | Transiciones de vista, split-pane, el toggle "Cómo lo lee el ATS" |
| `deliberate` | 600 ms | Estados de IA — la espera se diseña, no se sufre |
| `shimmer` | 1100 ms | **El único shimmer del producto** (fin de extracción) |

## Curvas

| Token | Curva | Uso |
|---|---|---|
| `standard` | `cubic-bezier(0.2,0,0,1)` | Entradas y salidas de UI, por defecto |
| `decelerate` | `cubic-bezier(0,0,0,1)` | Algo que aparece y se queda |
| `accelerate` | `cubic-bezier(0.3,0,1,1)` | Algo que se va |
| `spring` | `cubic-bezier(0.34,1.24,0.64,1)` | Micro-confirmaciones (item aceptado, guardado) |

---

## Qué se anima y qué no

**Sí se anima:**
- **Aparición de contenido nuevo** (fade + 4–8 px de translate). Nunca escala grande, nunca rebote
  ostentoso.
- **Transiciones de foco/hover** en controles (140 ms).
- **El toggle "Cómo lo lee el ATS"** (360 ms): el PDF elegante se "desviste" hacia el texto plano
  mono. Es una transición con significado — se ve qué se conserva y qué se pierde. Diséñala como
  *cross-fade + desaturación*, no como flip 3D.
- **El contador de items durante la extracción** (los números suben; es satisfactorio y verdadero).
- **El shimmer dorado**, una sola vez (abajo).

**No se anima:**
- Nada en bucle infinito salvo un indicador de "IA pensando" (y ese respeta reduce-motion).
- Nada puramente decorativo: sin parallax, sin partículas, sin gradientes que laten.
- El documento CV: cero animación. Es papel.

---

## El shimmer — el único momento mágico

Se **gasta una sola vez**: cuando la IA termina de extraer y el perfil se puebla. Un barrido dorado
(`gold-100` → `gold-500`) recorre las tarjetas recién llegadas, de arriba abajo, `shimmer` 1100 ms,
una pasada. Reservarlo aquí es lo que lo hace significar algo. Si el oro brilla en cada guardado,
deja de ser oro.

- En obsidiana **brilla**; en porcelana es un lavado cálido más tenue (`--shimmer-core` ya ajustado
  por tema).
- Después del shimmer, nunca más en esa sesión.

---

## Estados de IA (el motion que más importa)

La espera de un LLM son **segundos reales** (5–40 s, investigación §6). No es un spinner de
castigo: es una narración.

| Estado | Motion |
|---|---|
| **Pensando** | Pulso lento del hairline dorado (o punto), `deliberate` 600 ms, ease-in-out, en bucle. Reduce-motion: opacidad estática + texto "Pensando…" |
| **Extrayendo** | Progreso **específico y verdadero**: "Leyendo página 2 de 3", "Encontré 4 experiencias". El contador sube con `spring`. Nunca un % falso |
| **Propuesto** | Entra con fade + 6 px, hairline dorado al borde (pendiente de revisión) |
| **Aceptado** | `spring` breve + el hairline dorado se desvanece a neutro |
| **Rechazado** | `accelerate` 140 ms, colapsa hacia arriba y se va |

---

## `prefers-reduced-motion` — obligatorio, sin pérdida de información

Toda animación tiene una versión sin movimiento que **conserva el significado**:
- El shimmer → un tinte dorado estático de 1 frame sobre las tarjetas nuevas (o nada).
- El contador → salta al total final directamente, sigue siendo verdadero.
- El toggle ATS → cross-fade instantáneo; el contraste de contenido sigue ahí.
- "Pensando" → texto + opacidad fija, sin pulso.
- Los estados de aceptar/rechazar → cambian de estado sin transición, pero **con su segunda señal**
  (texto/icono), nunca solo por movimiento.

El reset global ya está en `tokens.css` (`@media (prefers-reduced-motion: reduce)`).
