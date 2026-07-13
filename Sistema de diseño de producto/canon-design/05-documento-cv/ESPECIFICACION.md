# ESPECIFICACIÓN DEL DOCUMENTO CV

> Cada valor en **pt** (fuentes) y **mm** (geometría). Cero "aproximadamente".
> Fuente de verdad para reconstruir el documento en `@react-pdf/renderer`.
> Los valores de esta spec son **criterio de diseño**, no evidencia ATS, salvo donde se cite
> una fuente. La distinción es deliberada (ver §"Reglas y su origen").

---

## 0 · Resumen para ingeniería

- Papel **A4** (210 × 297 mm). Una sola columna. Todo alineado a la izquierda; fechas a la derecha
  por *flex*, **no por tabla**.
- Tres fuentes: **Playfair Display** (solo el nombre), **Geist** (encabezados + cuerpo), **Geist
  Mono** (cifras, fechas, contacto). Registrar los `.ttf` (no `.woff2`) en `react-pdf`.
- Un solo color de acento: **`gold-700` #8A6414**, **solo en el nombre**. Todo lo demás es tinta.
- Sin iconos, sin fotos, sin gráficos, sin barras de nivel, sin headers/footers. Contacto en el
  cuerpo, con etiquetas de texto (`Email:`, `Teléfono:`…).

---

## 1 · Página y márgenes

| Propiedad | Valor | Origen |
|---|---|---|
| Tamaño | **210 × 297 mm** (A4) | Estándar CL/LatAm/EU |
| Margen superior / inferior | **16 mm** | Criterio de diseño |
| Margen izquierdo / derecho | **18 mm** | Criterio de diseño |
| Ancho de columna de contenido | **174 mm** (210 − 18 − 18) | Derivado |
| Alto de contenido útil | **265 mm** (297 − 16 − 16) | Derivado |

> **Márgenes ≥ 15 mm** es el piso. Elegí 16/18 mm por ritmo, no por evidencia. Ladders documenta
> *cualitativamente* que "poco espacio en blanco" marca los CVs peor rankeados — pero **no hay
> cifra de margen respaldada**. Esto es criterio.

Interlínea base del documento: **1.42** (multiplicador). Color de tinta base: **#17171A**; tinta
de párrafo: **#24242A** (un punto más suave para bloques de texto largo).

---

## 2 · Escala tipográfica exacta (todos los valores reales del documento)

| Elemento | Familia | Peso | Tamaño | Interlínea | Tracking | Color | Notas |
|---|---|---|---|---|---|---|---|
| **Nombre** | Playfair Display | 600 | **25 pt** | 1.05 | −0.01em | **#8A6414** | El único oro y la única serif |
| **Título objetivo** (target_title) | Geist | 600 | **13 pt** | 1.2 | +0.005em | #17171A | 2º elemento más pesado. Margen sup. **2.5 mm** |
| **Contacto** | Geist Mono | 400 | **8.5 pt** | 1.5 | +0.005em | #45454A | Margen sup. **3.5 mm**. Separador `·` en #B7B7B2 |
| **Encabezado de sección** | Geist | 600 | **10.5 pt** | 1.2 | +0.11em | #17171A | MAYÚSCULAS. Hairline inferior (ver §3). Margen sup. de sección **6.5 mm** |
| **Resumen** | Geist | 400 | **10.5 pt** | 1.5 | 0 | #24242A | — |
| **Cargo / título de entrada** | Geist | 600 | **11 pt** | 1.2 | 0 | #17171A | 2º elemento más pesado tras el nombre (Ladders: es lo que más se mira) |
| **Fechas** | Geist Mono | 400 | **9 pt** | 1.2 | 0 | #6E6E72 | Alineadas a la derecha por flex, `white-space: nowrap` |
| **Empresa / meta de entrada** | Geist | 400 | **9.5 pt** | 1.3 | 0 | #45454A | Margen sup. **0.6 mm** |
| **Viñeta (bullet)** | Geist | 400 | **10 pt** | 1.4 | 0 | #24242A | Margen inf. **1.1 mm** |
| **Cifra (`.num`)** | Geist Mono | 500 | **9.5 pt** | hereda | **0** | #17171A | Ver §5. Nunca color, nunca negrita |
| **Etiqueta de skill (`.k`)** | Geist | 600 | 10 pt | 1.4 | 0 | #17171A | `Lenguajes:` etc. |
| **Nº de página (pantalla)** | Geist Mono | 500 | 8 pt | — | 0 | #B7B7B2 | **No se imprime** (`display:none` en `@media print`). No es footer del documento |

> Escala derivada de la modular 1.25 del sistema, pero **fijada en pt** para el documento: el CV no
> es fluido, es impresión. El cuerpo a 10 pt y la meta a 9–9.5 pt es el mínimo cómodo en A4; por
> debajo de 9 pt el reclutador sufre. (Criterio; el estándar de imprenta suele citar 10–12 pt para
> cuerpo, pero un CV denso a 10 pt es normal.)

---

## 3 · El hairline de sección

- Regla inferior del encabezado: **0.4 mm** (≈1.1 pt) sólida, color **rgba(23,23,26,0.30)**.
- `padding-bottom` del encabezado antes de la regla: **1.6 mm**.
- Margen inferior del encabezado (regla → primer contenido): **3 mm**.
- Es **tipografía, no decoración**: no rompe ningún parser (no es tabla ni imagen) y ordena el
  escaneo del borde izquierdo (patrón F, Ladders).
- **Toggle opcional** `--cv-rule-gold`: cambiar el color de la regla a `gold-700` para un "modo
  editorial premium". **Desactivado por defecto** — el default mantiene el oro solo en el nombre.

---

## 4 · Bloque de entrada (rol, formación, proyecto — mismo patrón)

```
[entry]                         margin-bottom: 4 mm
  [entry-head]  display:flex; justify-content:space-between; align-items:baseline; gap:6mm
    [entry-title]  Geist 600 11pt                      ← IZQUIERDA
    [entry-dates]  Geist Mono 400 9pt, nowrap          ← DERECHA (último en el DOM)
  [entry-org]    Geist 400 9.5pt #45454A; margin-top:0.6mm
  [ul]           margin-top:1.8mm; padding-left:4.6mm; list-style:disc
    [li]         Geist 400 10pt; line-height:1.4; margin-bottom:1.1mm
```

**Orden de lectura garantizado:** título → fecha → empresa → viñetas. La fecha va a la derecha
*visualmente* pero es el **último nodo del DOM** de su línea, así que el parser la lee después del
cargo, en orden correcto. **Nunca** usar `position:absolute` ni `table` para las fechas.

---

## 5 · La cifra en monoespaciada — reglas duras

Para que "el mono da la evidencia" no rompa la extracción (ver `decision-tipografica.md`):

1. Cada `.num` va **rodeado de espacios normales de Geist**. Marcado: `de <span class="num">850 ms</span> a`.
2. `letter-spacing: 0` en `.num`. Sin excepción.
3. Nunca partir una palabra a través del límite de fuente.
4. Los bullets son `list-style` (marcador CSS), **no** caracteres `•` de texto.
5. Tamaño 9.5 pt (0.5 pt menor que el cuerpo) para igualar la altura-x de Geist Mono con Geist.

**Verificado:** ver `cv-texto-plano.txt`. **Contrato CI:** el re-parseo del PDF real debe seguir
coincidiendo (§7).

---

## 6 · Orden de secciones y paginación

Orden por defecto (cronológico inverso, CL/LatAm):
`Nombre + Título + Contacto → Resumen → Aptitudes técnicas → Experiencia → Educación →
[Proyectos] → [Certificaciones] → Idiomas`.

- **Aptitudes arriba** (tras el resumen): Skills es el filtro #1 (76,4%, investigación §2). Va alto
  a propósito.
- **1 página:** Resumen + Aptitudes + Experiencia (2 roles) + Educación + Idiomas, con un ritmo
  vertical **ligeramente más compacto** (sección 4 mm, `<h2>` 2 mm, entrada 2.4 mm, interlínea de
  viñeta 1.3) para caber sin sacrificar los márgenes. Cabe en una hoja — verificado por medición:
  el `.page` mide 297 mm exactos (contenido ≤ 297 mm) en `cv-1pagina-es.html` / `-en.html`.
- **2 páginas:** la sección Experiencia **fluye** entre páginas sin repetir su encabezado. La
  página 1 cierra convincente (Resumen + Aptitudes + el rol más reciente y fuerte, Fintual); los
  roles anteriores y las secciones de cierre fluyen a la página 2 (la página 2 se gana en la 1 —
  Ladders). **Verificado por medición:** cada `.page` mide ≤ 297 mm en `cv-2paginas-es.html` /
  `-en.html`. El reequilibrio del corte de página **no altera el orden de contenido**, así que el
  golden file no cambia.
- **Página 3:** el renderer debe **advertir** (no bloquear). "El tiempo del reclutador en la página
  3+ es residual" (Ladders). Esta advertencia vive en el chequeo de salud (§6.7 del prompt), no en
  el documento.

---

## 7 · Peso del archivo y el golden file

- **Único umbral con fuente:** Greenhouse **no parsea > 2,5 MB** (investigación §8). Ese es el
  límite duro.
- Objetivos más finos (p. ej. < 200 KB) son **criterio de ingeniería** razonables (un CV sin
  imágenes con fuentes subsetadas pesa decenas de KB) — **no citarlos como regla de ATS en la UI**.

### El golden file (`datos-ejemplo.json` ⇄ `cv-texto-plano.txt`)

- `datos-ejemplo.json`: el perfil de ejemplo en el **modelo interno** (superset con variantes,
  procedencia, confianza, `visible`, orden). Contacto anonimizado (ficticio); estructura, cargos,
  fechas y logros son el perfil de ejemplo.
- `cv-texto-plano.txt`: el texto **realmente extraído** del documento en orden de lectura.
- **Cómo se generó:** extracción del DOM del documento en orden de documento (los encabezados salen
  en MAYÚSCULAS porque `text-transform` dibuja glifos en mayúscula en el PDF; los bullets CSS no
  entran al texto). Para una sola columna semántica, el orden del DOM = el orden del content stream
  del PDF.
- **Contrato de CI (investigación §8, "el test que nadie hace"):** ingeniería renderiza el PDF desde
  `datos-ejemplo.json` con `react-pdf`, lo re-parsea (`pdf.js`/`unpdf`) y **diffea contra
  `cv-texto-plano.txt`**. Si no coincide, **falla el build**. Si `react-pdf` difiere (p. ej. emite
  el bullet como glifo), se ajusta la técnica o se regenera el fixture — documentando el porqué.

---

## 8 · Reglas del documento y su origen (honestidad de fuentes)

| Regla | Origen |
|---|---|
| Una sola columna | **Greenhouse** (falla de parseo documentada) |
| Sin tablas | **Greenhouse** |
| Sin headers/footers; contacto en el cuerpo | **Greenhouse / Workday** |
| Sin iconos (`Email:` con letras) | **Greenhouse** |
| Sin fotos / gráficos / barras de nivel | **Greenhouse** + **Robert Walters Chile** (foto) |
| Texto seleccionable, fuentes con métricas estándar | **Lever** |
| Alineación izquierda; fechas a la derecha por flex (no tabla) | **Ladders** (patrón F) |
| Peso < 2,5 MB | **Greenhouse** |
| Sin justificar el texto | **Criterio de diseño** (sin guionado, la justificación abre ríos) |
| Márgenes 16/18 mm, tamaños en pt, peso objetivo fino | **Criterio de diseño** (sin respaldo empírico) |
| Cifras en Geist Mono | **Concepto de marca** + verificado contra parseo |

---

## 9 · Colores del documento (todos sobre blanco #FFFFFF)

| Uso | Color | Contraste sobre #FFF |
|---|---|---|
| Nombre | #8A6414 (`gold-700`) | 5.3:1 (AA normal) · en B/N ≈ gris cálido a ~5.7:1 |
| Tinta principal | #17171A | 17.9:1 |
| Tinta de párrafo | #24242A | 15.3:1 |
| Meta / empresa | #45454A | 8.9:1 |
| Fechas / subtle | #6E6E72 | 5.2:1 |
| Hairline de sección | rgba(23,23,26,0.30) | decorativo estructural, no texto |

**Todo el documento supera AA como texto normal.** Y funciona en B/N: ver `cv-bn.html` — el nombre
en oro cae a un gris cálido oscuro perfectamente legible; el CV **no depende del color**.
