# Densidad — la escala nueva para UI de aplicación

El portfolio respira. **Una app de edición no puede.** CANON es un instrumento denso: tres paneles,
tablas de 100+ items, formularios largos. Esta es la escala compacta que mantiene la elegancia sin
desperdiciar píxeles. Base **4 px**, como el sistema original. Valores en `tokens.css` (`--row-*`,
`--control-*`, etc.).

---

## Filosofía

- **La densidad es respeto por el tiempo del usuario**, no tacañería. Buscar trabajo es repetitivo;
  cada scroll de más es fricción. Compactamos para que quepa más contexto en pantalla, no para
  amontonar.
- **El aire se gana con jerarquía, no con padding.** Un hairline y un cambio de peso separan mejor
  que 24 px de vacío, y a un tercio del costo vertical.
- **Tres densidades, no una.** El usuario elige comodidad; los datos crudos van compactos.

---

## Escala de densidad

### Filas (listas, tablas, resultados)
| Token | Alto | Uso |
|---|---|---|
| `row-compact` | **32 px** | Tablas de datos densas, la biblioteca del master con 100+ items |
| `row-default` | **40 px** | Listas estándar, filas de variantes |
| `row-comfortable` | **48 px** | Listas táctiles, primer nivel de navegación |

### Controles (input, select, botón)
| Token | Alto | Uso |
|---|---|---|
| `control-h-sm` | **28 px** | Toolbars densas, chips, filtros inline |
| `control-h` | **36 px** | Por defecto en escritorio |
| `control-h-lg` | **44 px** | **Mínimo táctil** — obligatorio en móvil (a11y §7) |

Padding de control: **8 px** vertical × **12 px** horizontal (`--control-pad-y/x`). En `sm`, 8 px
horizontal.

### Estructura
| Token | Valor | Uso |
|---|---|---|
| `toolbar-h` | 48 px | Barras de herramientas de panel |
| `topbar-h` | 56 px | Barra superior global |
| `sidebar-w` | 248 px | Navegación lateral expandida |
| `sidebar-w-collapsed` | 60 px | Navegación colapsada (solo iconos + tooltip) |
| `field-gap` | 6 px | Label ↔ control |
| `group-gap` | 16 px | Entre campos de un formulario |
| `panel-pad` | 20 px | Padding interior de un panel |

### Tipografía de UI densa (px fijos, no fluida)
| Token | Valor |
|---|---|
| `ui-fs` | 14 px (base de la app) |
| `ui-fs-sm` | 13 px |
| `ui-fs-xs` | 12 px |
| `ui-lh` | 1.45 |

### Radios (modestos, precisos)
`xs` 3 · `sm` 4 · **`md` 6 (controles por defecto)** · `lg` 8 (tarjetas/paneles) · `xl` 12
(modales) · `pill` 999.

---

## Reglas de aplicación

1. **El editor de 3 paneles usa `row-compact` + `control-h-sm`.** Es el lugar más denso del
   producto; cada píxel vertical es preview de CV que no se ve.
2. **Los formularios de onboarding/settings usan `control-h` (36 px)** y `group-gap` 16 px. No hay
   prisa ahí; respira un poco más.
3. **En móvil, todo control sube a `control-h-lg` (44 px).** Sin excepción — es el mínimo táctil.
4. **La densidad es una propiedad de la vista, no del componente.** Un mismo `<Row>` se renderiza
   compacto en la biblioteca del master y cómodo en la lista de variantes. Expón la densidad como
   prop/contexto, no la hard-codees.
5. **Nunca bajes de 12 px** en texto de UI, ni de 28 px en alto de control clickeable (salvo chips
   no interactivos).

---

## Cómo se relaciona con el espaciado base

El espaciado (`--space-1..32`, base 4) es compartido con el lado editorial. La densidad **no
inventa una segunda escala**: elige valores más bajos de la misma rejilla de 4 px. `row-compact`
(32) = `space-8`; `panel-pad` (20) = `space-5`. Todo cae en la grilla. Eso mantiene la coherencia
entre la landing que respira y el editor que no.
