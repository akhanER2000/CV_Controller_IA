# Documento CV (el PDF) — Especificación de implementación

> **REGLA MADRE.** Este documento se implementó mal tres veces por *interpretar* en vez de *reproducir*.
> Las referencias visuales literales son los HTML de
> `Corpus_ diseño completo/corpus-design/05-documento-cv/`. Los **nombres de clase** (`.name`, `.label`,
> `.contact`, `.h`, `.sum`, `.skline`, `.erow`, `.t`, `.d`, `.org`, `.b`, `.pnum`, `.note`) son el
> **contrato diseño↔código**: no se renombran, no se parafrasean. Los valores CSS y el copy se copian
> literales. Este `.md` traduce esos valores a la tabla exacta y al mapeo react-pdf; **no reemplaza** al
> HTML canónico como referencia visual.

## Respuestas directas del encargo

- **Páginas del canónico (`cv-2pagina-es.html`): 2.** Dos `<section class="page">` (`data-screen-label="pagina-1"`
  y `pagina-2`), folios `Diego Gatica · 1/2` y `Diego Gatica · 2/2`.
- **¿`cv-texto-plano.txt` y `datos-ejemplo.json` son consistentes? SÍ — verificado byte-a-byte.**
  Reconstruí el `.txt` recorriendo el JSON en orden DOM (campos locale `es`, con los conectores fijos
  `"Email: "`, `"Tel: "`, `" · "`, `" — "`, `": "`, `"• "`) y el resultado es **idéntico** al golden file
  (`reconstructed == golden` → `True`). El `.txt` del repo es la versión **de 2 páginas (completa)**: incluye
  las viñetas con `p1:false`. Todo lo que aparece en el `.txt` sale del JSON; nada del `.txt` es texto
  huérfano. Lo único del JSON que NO se renderiza es metadata (`$golden`, `meta`, los flags `p1`, y los
  campos locale `en`). El filtro `p1` reproduce además `cv-1pagina-es.html` exacto (ver §5).

---

## 1 · Geometría exacta (mm / pt)

Fuente: `@page{size:letter;margin:0}` + `.page{width:216mm;height:279.4mm;padding:18mm 20mm}`.
Conversión: **1 mm = 2,834645669 pt** (72/25,4). 1 in = 72 pt = 25,4 mm.

| Elemento | mm | pt | Nota |
|---|---|---|---|
| Página (ancho × alto) | 216 × 279,4 mm | 612,28 × 792,0 pt | Carta. Alto = 11 in exacto. Mercado Chile; A4 en fase 2 mismo layout |
| Página real "LETTER" react-pdf | 215,9 × 279,4 mm | **612 × 792 pt** | Usar `size="LETTER"`; el HTML redondea el ancho a 216 mm (+0,28 pt, despreciable) |
| Margen superior / inferior | 18 mm | 51,02 pt | `padding` vertical de `.page` |
| Margen izquierdo / derecho | 20 mm | 56,69 pt | `padding` horizontal de `.page` |
| Caja de texto (ancho) | 176 mm | 498,90 pt (498,61 pt con página 612 pt) | 216 − 2×20 |
| Caja de texto (alto) | 243,4 mm | 689,96 pt | 279,4 − 2×18 |
| Columnas | 1 | — | **Inviolable (Greenhouse)** |
| Folio `.pnum` (offset) | right 6 mm · bottom 5 mm | 17,01 · 14,17 pt | Solo pantalla; `@media print{.pnum{display:none}}` |

- Corte de página: `@media print{.page{break-after:page}.page:last-child{break-after:auto}}`.
- Fondo pantalla del escritorio `.desk`: `#232626`; en print `body{background:#FFF}` y `.desk{padding:0;gap:0}`.
- `.page{overflow:hidden}` → el contenido que excede el alto se recorta (no fluye a página nueva en el
  HTML de referencia; en react-pdf el paginado sí es automático — ver §7).

---

## 2 · Tipografía exacta (cada elemento)

Familias (Google Fonts en el HTML; **en el PDF: `.ttf` locales**, ver §7):
`Playfair Display` (600), `Geist` (400/600/700), `Geist Mono` (400).
Interlínea: el HTML usa multiplicador (`/1.15`, `/1.3`…); la columna "interlínea pt" es el valor computado.

| Elemento | Clase | Fuente / peso | Tamaño pt | Interlínea (mult → pt) | Color hex | Extra |
|---|---|---|---|---|---|---|
| Nombre | `.name` | Playfair Display 600 | 22 | 1,15 → 25,3 | `#1F6E5A` (`--acc`) | `margin:0`; fallback `Georgia,'Times New Roman',serif` |
| Título objetivo (label) | `.label` | Geist 600 | 11 | 1,3 → 14,3 | `#14181A` (`--ink`, heredado) | `margin:2pt 0 0`. Es el `target_title` bajo el nombre |
| Contacto (2 líneas) | `.contact` | Geist 400 | 9,5 | 1,5 → 14,25 | `#454B49` (`--mut`) | 1ª línea `margin:5pt 0 0`; 2ª línea `style="margin-top:1pt"` |
| Encabezado de sección | `.h` | Geist 700 | 10,5 | 1,1 → 11,55 (spec: 11,5) | `#1F6E5A` (`--acc`) | `text-transform:uppercase`; `letter-spacing:.1em`; `margin:13pt 0 3pt`; `padding-bottom:3pt`; `border-bottom:1pt solid #D8DAD6` |
| Resumen | `.sum` | Geist 400 | 10 | 1,45 → 14,5 | `#14181A` (heredado) | `margin:3pt 0 0`; `text-wrap:pretty` |
| Línea de skills | `.skline` | Geist 400 | 10 | 1,5 → 15 | `#14181A` (heredado) | `margin:1.5pt 0 0`; `.skline b{font-weight:600}` (etiqueta del grupo en 600) |
| Fila cargo+fecha | `.erow` | (contenedor flex) | — | — | — | `display:flex;justify-content:space-between;align-items:baseline;margin:8pt 0 0` |
| Cargo | `.erow .t` | **Geist 700** | 11 | 1,3 → 14,3 | `#14181A` (heredado) | Educación: override inline `style="font-size:10.5pt"` |
| Fechas | `.erow .d` | Geist 400 | 9,5 | 1,3 → 12,35 | `#454B49` (`--mut`) | `padding-left:12pt`; `white-space:nowrap`; `font-variant-numeric:tabular-nums`; alineadas a la derecha **por flex, jamás tabla** |
| Ubicación (org) | `.org` | Geist 400 | 9,5 | 1,35 → 12,83 (spec: 12,8) | `#454B49` (`--mut`) | `margin:1pt 0 0` |
| Viñeta | `.b` | Geist 400 | 10 | 1,45 → 14,5 | `#14181A` (heredado) | `margin:3pt 0 0`; `padding-left:11pt`; `text-indent:-7.5pt`; `text-wrap:pretty`; `font-variant-numeric:tabular-nums` |
| Folio (pantalla) | `.pnum` | Geist Mono 400 | 8 | 1 → 8 | `#9AA09D` | `position:absolute;right:6mm;bottom:5mm`. No imprime |
| Nota (pantalla) | `.note` | Geist Mono 400 | 10 **px** | 1,7 | `#9BA39F` | Solo pantalla; no imprime; no es parte del PDF |

**Colores canónicos (`:root`):** `--acc:#1F6E5A` · `--ink:#14181A` · `--mut:#454B49` · `--hair:#D8DAD6`.
Un solo acento (`#1F6E5A`, patina-700, 5,74:1 AA sobre blanco) y **solo** en nombre + encabezados.
`cv-bn.html` es **idéntico byte-a-byte** a `cv-2pagina-es.html` salvo `--acc:#1A1A1A` (demuestra que en B/N
no se pierde jerarquía: el peso y las caps hacen el trabajo, el color es cortesía). Verificado con `diff`:
única línea distinta es la 11.

---

## 3 · Espaciado vertical exacto (pt)

Todos son `margin-top` salvo indicación. Orden de aparición:

| Entre | pt | Origen |
|---|---|---|
| Nombre → label | 2 | `.label{margin:2pt 0 0}` |
| Label → 1ª línea contacto | 5 | `.contact{margin:5pt 0 0}` |
| 1ª → 2ª línea contacto | 1 | inline `style="margin-top:1pt"` |
| Antes de encabezado de sección `.h` | 13 | `.h{margin:13pt 0 ...}` |
| `.h` padding inferior (a la hairline) | 3 | `padding-bottom:3pt` |
| Grosor hairline bajo `.h` | 1 | `border-bottom:1pt solid #D8DAD6` |
| `.h` → sumario / primer contenido | 3 | `.h{margin:... 0 3pt}` (margen inferior del encabezado) |
| Encabezado → primera línea de skills / resumen | 3 (sum) / vía margen `.h` | `.sum{margin:3pt 0 0}` |
| Entre líneas de skills | 1,5 | `.skline{margin:1.5pt 0 0}` |
| Antes de cada entrada de trabajo/educación `.erow` | 8 | `.erow{margin:8pt 0 0}` |
| Cargo → ubicación `.org` | 1 | `.org{margin:1pt 0 0}` |
| Antes de cada viñeta `.b` | 3 | `.b{margin:3pt 0 0}` |
| Sangría francesa de viñeta | `padding-left:11pt` + `text-indent:-7.5pt` | glifo `• ` cuelga a la izquierda |
| Fecha: separación del cargo | `padding-left:12pt` | `.erow .d` |

Regla resumida de la ESPECIFICACION §2: *sección `margin-top 13 pt` · entrada de trabajo `8 pt` ·
viñeta `3 pt` · sumario tras encabezado `3 pt`. Viñeta: glifo `• ` con sangría francesa
(`padding-left 11 pt`, `text-indent −7,5 pt`).*

---

## 4 · Estructura del documento — orden EXACTO y DOM de `cv-2pagina-es.html`

Orden de secciones (idéntico en HTML, en el `.txt` golden y en el content-stream de un PDF de 1 columna):

1. **Cabecera** (sin encabezado de sección): `.name` → `.label` → `.contact` (línea 1) → `.contact` (línea 2, links)
2. **Resumen** (`.h` "Resumen") → `.sum`
3. **Habilidades** (`.h` "Habilidades") → N× `.skline`
4. **Experiencia** (`.h` "Experiencia") → por cada empleo: `.erow`(`.t` + `.d`) → `.org` → N× `.b`
5. **Proyectos** (`.h` "Proyectos") → N× `.b`
6. **Educación** (`.h` "Educación") → por cada título: `.erow`(`.t`+`.d`) → `.org`

DOM literal (2 páginas). Cada bloque de contenido lleva `data-line`; cada encabezado lleva además `data-sec`.
El corte de página es puramente visual: **el DOM es un flujo único**; `pagina-2` empieza a media sección
Experiencia (con el empleo *freelance*), no en un límite de sección.

**Página 1** (`<section class="page" data-screen-label="pagina-1">`):
```
h1.name              Diego Gatica Morales
p.label              Backend Engineer
p.contact            Email: diego.gatica@ejemplo.cl · Tel: +56 9 6123 4567 · Santiago, Chile (RM)
p.contact(mt1)       github.com/dgatica · dgatica.cl · linkedin.com/in/diego-gatica
h2.h[data-sec]       Resumen
p.sum                Backend engineer con 6 años … sistemas que no se caen.
h2.h[data-sec]       Habilidades
p.skline             <b>Lenguajes:</b> Go, Python, SQL, TypeScript
p.skline             <b>Backend:</b> PostgreSQL, Redis, gRPC, OpenAPI, Node.js, Django
p.skline             <b>Plataforma:</b> Docker, GitHub Actions, Linux, Bash
p.skline             <b>Idiomas:</b> Español nativo, Inglés B2
h2.h[data-sec]       Experiencia
div.erow  (.t Backend Developer — Altiplano Pagos SpA) (.d mar 2022 – hoy)
p.org                Santiago, Chile
p.b ×6               (las 6 viñetas de Altiplano)
div.erow  (.t Backend Developer, equipo Checkout — Rayén Retail S.A.) (.d ene 2020 – feb 2022)
p.org                Santiago, Chile
p.b ×4               (las 4 viñetas de Rayén)
span.pnum            Diego Gatica · 1/2
```

**Página 2** (`<section class="page" data-screen-label="pagina-2">`):
```
div.erow  (.t Desarrollador freelance — Independiente) (.d 2019 – 2020)
p.org                Santiago, Chile
p.b ×3
div.erow  (.t Práctica profesional, Área TI — Universidad Andrés Bello) (.d 2018 – 2019)
p.org                Santiago, Chile
p.b ×2
h2.h[data-sec]       Proyectos
p.b ×3               (cada proyecto es una viñeta .b, no lleva .erow ni .org)
h2.h[data-sec]       Educación
div.erow  (.t[font-size:10.5pt] Ingeniería Civil en Computación e Informática) (.d 2014 – 2019)
p.org                Universidad Andrés Bello
div.erow  (.t[font-size:10.5pt] Diplomado en Ingeniería de Datos) (.d 2022)
p.org                Pontificia Universidad Católica de Chile
span.pnum            Diego Gatica · 2/2
```
Cierre: `<p class="note">imprime con Ctrl/Cmd+P …</p>` (fuera de `.page`, solo pantalla).

Detalles literales que se pierden si se "interpreta":
- **Cargo `.t` = `title — company`** unidos por `" — "` (guion largo U+2014 con espacios). Los proyectos NO
  usan este patrón: cada proyecto es una única `.b` cuyo texto ya trae el `— ` interno.
- **Educación** usa `.t` con override inline `style="font-size:10.5pt"` (más chico que los 11 pt de trabajo).
- El **folio `.pnum`** imprime el nombre + `p/total` (`Diego Gatica · 1/2`), no solo el número.
- Etiqueta de skills (`<b>`) en peso 600, dos puntos incluidos dentro del `<b>`: `<b>Lenguajes:</b>`.

---

## 5 · Mapa `datos-ejemplo.json` → render (esquema campo por campo)

`datos-ejemplo.json` es el **fixture de entrada** del golden test. Locale renderizado en los `.es`;
`en` es el par para las variantes en inglés (`cv-*-en.html`). Esquema:

| Ruta JSON | Tipo | Render / uso | Notas |
|---|---|---|---|
| `$golden` | string | — (no renderiza) | Contrato en prosa: par JSON↔txt |
| `meta.variant` | string | — | "Backend — Fintech" (metadata de la variante) |
| `meta.pageSize` | string | tamaño de página | `"letter"` |
| `meta.generatedFrom` | string | — | Procedencia |
| `basics.name` | string | `.name` | |
| `basics.label{es,en}` | i18n | `.label` (target_title bajo el nombre) | |
| `basics.email` | string | `.contact` línea 1, tras `"Email: "` | prefijo literal, sin icono (regla ATS) |
| `basics.phone` | string | `.contact` línea 1, tras `"Tel: "` | |
| `basics.location{es,en}` | i18n | `.contact` línea 1, final | `es`="Santiago, Chile (RM)" |
| `basics.links[]` | string[] | `.contact` línea 2, unidos por `" · "` | 3 links |
| `basics.summary{es,en}` | i18n | `.sum` (bajo `.h` "Resumen") | |
| `skills[].group{es,en}` | i18n | `.skline` → `<b>{group}:</b>` | dos puntos incluidos |
| `skills[].items{es,en}` | i18n | `.skline` → texto tras `": "` | |
| `work[].company` | string | `.erow .t`, tras `" — "` | no i18n (nombre propio) |
| `work[].location{es,en}` | i18n | `.org` | |
| `work[].title{es,en}` | i18n | `.erow .t`, antes de `" — "` | |
| `work[].dates{es,en}` | i18n | `.erow .d` | `es`="mar 2022 – hoy" (guion U+2013) |
| `work[].p1` | bool | **filtro 1-página** de la entrada completa | true = aparece en 1 pág |
| `work[].bullets[].p1` | bool | **filtro 1-página** de la viñeta | |
| `work[].bullets[].{es,en}` | i18n | `.b`, con prefijo `"• "` | |
| `projects[].p1` | bool | filtro 1-página (todos false → sin sección en 1 pág) | |
| `projects[].{es,en}` | i18n | `.b` bajo `.h` "Proyectos", prefijo `"• "` | sin `.erow`/`.org` |
| `education[].title{es,en}` | i18n | `.erow .t` (`font-size:10.5pt`) | |
| `education[].org` | string | `.org` | no i18n |
| `education[].dates{es,en}` | i18n | `.erow .d` | |
| `education[].p1` | bool | filtro 1-página (ambos true) | |
| `headings.{summary,skills,work,projects,education}{es,en}` | i18n | texto de cada `.h` | |

### El flag `p1` (versión de 1 página) — semántica exacta

`p1: true` ⇒ el elemento **aparece** en la versión de 1 página. `p1: false` (o ausente) ⇒ **se omite**.
Es **jerárquico y con encabezado condicional**:

1. **Entrada `work[]`**: si `work.p1 === false`, la entrada entera desaparece (no se evalúan sus viñetas).
2. **Viñeta `work[].bullets[]`**: dentro de una entrada visible, solo se muestran las viñetas con `p1:true`.
3. **`projects[]` / `education[]`**: cada ítem se filtra por su propio `p1`.
4. **Encabezado `.h`**: se dibuja **solo si la sección conserva ≥1 hijo visible**. En 1 página todos los
   `projects` son `p1:false` ⇒ **no hay sección Proyectos** (ni encabezado).

Resultado del filtro (verificado programáticamente, coincide con `cv-1pagina-es.html`):

| Sección | 2 páginas (canónico / `.txt`) | 1 página (`p1:true`) |
|---|---|---|
| Altiplano Pagos | 6 viñetas | **4** (fuera: "Documenté la API…", "Turno de soporte…") |
| Rayén Retail | 4 viñetas | **3** (fuera: "Automaticé reportes…") |
| Freelance (Independiente) | presente | **ausente** (`work.p1:false`) |
| Práctica UNAB | presente | **ausente** (`work.p1:false`) |
| Proyectos | 3 | **ausente** (sección completa) |
| Educación | 2 | **2** |

Coincide literal con ESPECIFICACION §7: *"freelance y práctica salen, Altiplano queda en 4 viñetas,
Rayén en 3, sin Proyectos"*. **1 y 2 páginas son igual de válidas** (ResumeGo: preferencia 2,3× por 2
páginas). La página 3 no se especifica porque **no existe** para el reclutador [Ladders]: el motor
advierte, no la produce.

---

## 6 · El golden file — cómo se ve, normalización y contrato del round-trip

`cv-texto-plano.txt` es el **GOLDEN FILE de salida**. Es el par de `datos-ejemplo.json`.

**Cómo se ve:** una línea por bloque `[data-line]`, en orden DOM (= orden del content stream de un PDF
de una columna). **Líneas en blanco** separan bloques de sección: hay blanco tras la cabecera (links) y
antes de cada encabezado de sección (Resumen, Habilidades, Experiencia, Proyectos, Educación) — 5 líneas
en blanco en total. Termina con `\n` final. Es la versión **de 2 páginas** (todas las viñetas presentes).
El folio `.pnum` y la `.note` **no aparecen** (no imprimen). Las etiquetas `<b>` de skills se aplanan a
texto (`Lenguajes: …`).

**Conectores fijos (constantes de plantilla, no vienen del JSON):**
`"Email: "`, `"Tel: "`, `" · "` (contacto y links), `" — "` (cargo — empresa), `": "` (grupo skills),
`"• "` (viñeta), `" "` (espacio entre cargo/título y fechas, y entre título educación y fechas).

**Normalización (pipeline CI, ESPECIFICACION §6):**
1. Renderizar el PDF desde `datos-ejemplo.json` con `@react-pdf/renderer`.
2. Re-parsear el PDF con `unpdf`/`pdf.js` → texto plano.
3. **Normalizar: colapsar espacios múltiples, `trim` por línea.**
4. `diff` contra `cv-texto-plano.txt`. **Si no coincide, FALLA EL BUILD.**

**Procedencia (sin maquillaje):** el `.txt` del repo fue **extraído a máquina** del render HTML de
referencia (recorrido del DOM en orden de documento, una línea por `[data-line]`). **No fue escrito a
mano.** En el primer build real se **regenera desde el PDF verdadero** y desde ahí ese output es la
verdad del contrato.

**Contrato del round-trip verificado (este análisis):** reconstruí el `.txt` desde el JSON (locale `es`,
orden DOM, conectores de arriba) y el resultado es **byte-idéntico** al golden (`reconstructed == golden`
→ `True`). Es decir: `render(json).extract().normalize() === golden.txt`. Lo que el golden ya demuestra:
nombre → título → email/tel → links → secciones → cargos con fechas **en la misma línea** → viñetas, en
el orden correcto y **sin runs pegados** (`ventas25%`, `2 5 %`).

**Sobre la mezcla mono-en-viñeta (ESPECIFICACION §5):** queda **fuera de v1**. En su lugar
`font-variant-numeric:tabular-nums` (misma fuente, cifras que saltan igual, cero riesgo de *runs*). La
variante Geist Mono solo se activa **si el golden test pasa con ella** (se genera el PDF, se extrae, se
compara; si rompe, cae la idea).

---

## 7 · Traducción a `@react-pdf/renderer` v4

Componentes: `Document` → `Page` (uno por página lógica, o uno con paginado automático) → `View`
(contenedores/filas) → `Text` (todo texto). No hay `<div>`/`<p>`/`<span>`: `.erow` es un `View`
`flexDirection:row`; `.name`, `.label`, `.contact`, `.sum`, `.skline`, `.b`, `.t`, `.d`, `.org` son `Text`.

Esqueleto:
```js
import { Document, Page, View, Text, Font, StyleSheet } from '@react-pdf/renderer';

// TRAMPA 1 — Font.register a NIVEL DE MÓDULO (fuera del componente), una sola vez.
// TRAMPA 2 — .ttf, NO .woff2 (react-pdf no parsea woff2).
Font.register({ family: 'Geist', fonts: [
  { src: 'fonts/Geist-Regular.ttf', fontWeight: 400 },
  { src: 'fonts/Geist-SemiBold.ttf', fontWeight: 600 },
  { src: 'fonts/Geist-Bold.ttf', fontWeight: 700 },
]});
Font.register({ family: 'Playfair Display', fonts: [{ src: 'fonts/PlayfairDisplay-SemiBold.ttf', fontWeight: 600 }]});
Font.register({ family: 'Geist Mono', fonts: [{ src: 'fonts/GeistMono-Regular.ttf', fontWeight: 400 }]});

const s = StyleSheet.create({
  page:    { paddingVertical: '18mm', paddingHorizontal: '20mm', fontFamily: 'Geist', color: '#14181A' },
  name:    { fontFamily: 'Playfair Display', fontWeight: 600, fontSize: 22, lineHeight: 1.15, color: '#1F6E5A' },
  label:   { fontWeight: 600, fontSize: 11, lineHeight: 1.3, marginTop: 2 },
  contact: { fontSize: 9.5, lineHeight: 1.5, color: '#454B49', marginTop: 5 },
  contact2:{ fontSize: 9.5, lineHeight: 1.5, color: '#454B49', marginTop: 1 },
  h:       { fontWeight: 700, fontSize: 10.5, lineHeight: 1.1, letterSpacing: 1.05, // .1em de 10.5pt ≈ 1.05pt
             textTransform: 'uppercase', color: '#1F6E5A',
             marginTop: 13, marginBottom: 3, paddingBottom: 3,
             borderBottomWidth: 1, borderBottomColor: '#D8DAD6' },
  sum:     { fontSize: 10, lineHeight: 1.45, marginTop: 3 },
  skline:  { fontSize: 10, lineHeight: 1.5, marginTop: 1.5 },
  erow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 },
  t:       { fontWeight: 700, fontSize: 11, lineHeight: 1.3, flexShrink: 1 },
  tEdu:    { fontWeight: 700, fontSize: 10.5, lineHeight: 1.3, flexShrink: 1 }, // override educación
  d:       { fontWeight: 400, fontSize: 9.5, lineHeight: 1.3, color: '#454B49', paddingLeft: 12 }, // nowrap
  org:     { fontSize: 9.5, lineHeight: 1.35, color: '#454B49', marginTop: 1 },
  b:       { fontSize: 10, lineHeight: 1.45, marginTop: 3, paddingLeft: 11, textIndent: -7.5 },
});
```

**Trampas documentadas (obligatorias):**

1. **`Font.register` a nivel de módulo**, una vez, antes de renderizar. Dentro del componente → registra
   en cada render y rompe/duplica.
2. **`.ttf`, no `.woff2`.** react-pdf no soporta woff2. Empaquetar los `.ttf` de Geist, Playfair Display
   SemiBold y Geist Mono localmente (no depender de Google Fonts en runtime).
3. **Sin `position:absolute`.** El folio `.pnum` es pantalla-only y no va en el PDF; si se quisiera número
   de página, usar `render={({pageNumber,totalPages}) => …}` con `fixed`, no un `View` absoluto que rompa
   el flujo. Todo el layout es flujo normal + flex.
4. **Versión pineada.** Fijar `@react-pdf/renderer` a una versión exacta (v4.x sin `^`): cambios menores
   alteran métricas de línea y rompen el golden diff.
5. **Metadatos `Title`/`Author`** en `<Document title="CV — Diego Gatica Morales" author="Diego Gatica Morales">`.
   Greenhouse/algunos ATS leen metadata; además da un PDF con título correcto en el visor.
6. **`target_title` impreso bajo el nombre** = `basics.label` en `.label` (el `.label` del HTML).
7. **Fechas a la derecha por flex** (`.erow` con `justifyContent:'space-between'`), **jamás tabla**. `.d`
   con `white-space:nowrap` → en react-pdf, `Text` sin permitir wrap; darle el `paddingLeft:12` y dejar
   que `.t` haga `flexShrink:1`.
8. **`text-indent:-7.5pt` + `padding-left:11pt`** para la sangría francesa del glifo `• `. react-pdf
   soporta `textIndent`; validar en el render que la viñeta cuelga y no parte el número (tabular-nums).
9. **`font-variant-numeric: tabular-nums`**: react-pdf lo aplica vía la fuente; verificar en el golden
   que no aparecen runs pegados. Nada de Geist Mono en línea con Geist en v1 (§5).
10. **`letter-spacing:.1em`** de `.h`: en react-pdf `letterSpacing` es en pt, no em → `10.5 * 0.1 ≈ 1.05`.
11. **Paginado:** react-pdf pagina solo. Para clavar el corte 1/2 del canónico (freelance abre página 2),
    controlar con `wrap`/`break` o dos `Page`; el `.txt` golden **no** depende del corte (es flujo único),
    así el diff de texto pasa aunque el corte visual varíe un poco — pero el objetivo visual es reproducir
    el canónico.

---

## 8 · Reglas ATS y su fuente citada — §4 de la ESPECIFICACION (verbatim)

> ## 4 · Reglas y su estatus (fuente citada o criterio declarado)
>
> | Regla | Estatus |
> |---|---|
> | Una sola columna | **[Greenhouse]** el parser cruza columnas y mezcla campos |
> | Cero tablas | **[Greenhouse]** alteran el orden de lectura |
> | Cero headers/footers; contacto en el cuerpo | **[Greenhouse · Workday]** los ignoran → email invisible |
> | Cero iconos (`Email:` con letras) | **[Greenhouse]** glifos no textuales = basura parseada |
> | Cero fotos | **[Greenhouse + Robert Walters Chile + Ruffle & Shtudiner 2015]** |
> | Texto seleccionable | **[Lever, literal]** |
> | < 2,5 MB | **[Greenhouse]** único umbral de peso documentado; objetivos más finos = ingeniería interna, prohibido citarlos al usuario |
> | Fechas a la derecha vía flex/tab-stop | **[Ladders]** patrón F: el ojo escanea el borde izquierdo |
> | Cargo en negrita | **[Ladders eye-tracking]** |
> | `• ` como glifo de viñeta | **[criterio]** U+2022 es texto plano y parsea limpio |
> | Playfair solo en el nombre | **[criterio]** una palabra de voz editorial, cero riesgo de parseo |
> | Interlínea ≥ 1,45 y `text-wrap: pretty` | **[criterio]** el espacio en blanco es el lujo |

Implicaciones vinculantes para el render:
- **1 columna** e **inserción de contacto en el cuerpo** (no en `@page`-margin ni header/footer).
- **Cero tablas**: las fechas se alinean con flex (`.erow`), no con `<table>`/columnas.
- **Prefijos de texto** `Email:` / `Tel:` en vez de iconos.
- **Sin fotos.** **Texto seleccionable** (PDF con texto real, no imagen). **Peso < 2,5 MB** (usar `.ttf`
  subsetados ayuda; no citar umbrales más finos al usuario).
- **Cargo (`.t`) en negrita 700**; **fechas a la derecha**; glifo de viñeta `• ` (U+2022).

---

### Anexo · Archivos de referencia (rutas absolutas)

- `J:/Code/CV_Controller_IA/Corpus_ diseño completo/corpus-design/05-documento-cv/ESPECIFICACION.md`
- `J:/Code/CV_Controller_IA/Corpus_ diseño completo/corpus-design/05-documento-cv/cv-2pagina-es.html` (canónico, 2 págs)
- `J:/Code/CV_Controller_IA/Corpus_ diseño completo/corpus-design/05-documento-cv/cv-1pagina-es.html`
- `J:/Code/CV_Controller_IA/Corpus_ diseño completo/corpus-design/05-documento-cv/cv-2pagina-en.html`
- `J:/Code/CV_Controller_IA/Corpus_ diseño completo/corpus-design/05-documento-cv/cv-1pagina-en.html`
- `J:/Code/CV_Controller_IA/Corpus_ diseño completo/corpus-design/05-documento-cv/cv-bn.html` (= 2pág-es salvo `--acc:#1A1A1A`)
- `J:/Code/CV_Controller_IA/Corpus_ diseño completo/corpus-design/05-documento-cv/datos-ejemplo.json` (fixture de entrada)
- `J:/Code/CV_Controller_IA/Corpus_ diseño completo/corpus-design/05-documento-cv/cv-texto-plano.txt` (GOLDEN de salida, 2 págs)
