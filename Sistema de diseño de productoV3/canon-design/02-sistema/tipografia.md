# Tipografía

Tres familias, roles fijos. Escala modular **1.25** (major third). Heredada del portfolio y fijada
aquí para producto. Los valores viven en `tokens.css` / `tokens.json`; esto es el manual de uso.

---

## Las tres voces

| Rol | Familia | Pesos | Significa | Dónde |
|---|---|---|---|---|
| **Display / titulares** | **Playfair Display** | 500–800 (+ itálica) | *investigación, criterio, escritura* | Landing, onboarding, encabezados grandes de vista, el nombre del CV |
| **Texto / UI** | **Geist** | 400 / 500 / 600 | *producto moderno que se envía* | Toda la interfaz, cuerpo, formularios, tablas |
| **Mono / datos** | **Geist Mono** | 400 / 500 | *datos, métricas, terminal* | Cifras, IDs, código, la vista "Cómo lo lee el ATS", metadatos |

**Regla de oro tipográfica:** Playfair es escaso, como el oro. No se usa en UI densa ni en cuerpo
largo — se reserva para el gesto editorial. Geist hace el 90% del trabajo. Geist Mono es la firma:
donde hay un dato, hay mono.

> Cargar desde Google Fonts: `Geist:wght@400;500;600;700`, `Geist Mono:wght@400;500;600`,
> `Playfair Display:ital,wght@0,500;0,600;0,700;0,800;1,500`. Para el **PDF** (`react-pdf`)
> registrar los **`.ttf`** (no `.woff2`) a nivel de módulo, nunca dentro del componente
> (investigación §8, race conditions).

---

## Escala (fluida entre 390 px y 1440 px salvo donde se indica px fijo)

| Token | Min → Max | Familia | Uso |
|---|---|---|---|
| `display-xl` | 48 → 96 | Playfair | Hero de landing. Un solo uso por vista |
| `display` | 40 → 76 | Playfair | Aperturas de sección de marketing |
| `h1` | 34 → 49 | Playfair | Título de página/vista |
| `h2` | 28 → 39 | Playfair | Título de sección |
| `h3` | 24 → 31 | Playfair | Subsección |
| `h4` | 25 px | Geist 600 | Cabecera de tarjeta/panel (aquí Geist, no Playfair: es UI) |
| `h5` | 20 px | Geist 600 | — |
| `h6` | 16 px | Geist 600 | — |
| `body-lg` | 18 px | Geist | Introducciones, texto destacado |
| `body` | 16 px | Geist | Cuerpo por defecto |
| `body-sm` | 14 px | Geist | Texto secundario, base de la app densa |
| `caption` | 13 px | Geist | Ayudas, pies |
| `overline` | 12 px | **Geist Mono 500, MAYÚSCULAS, +0.14em** | Etiquetas de sección, kickers |
| `code` | 14 px | Geist Mono | Código, valores literales |

**Interlínea:** `tight` 1.1 · `heading` 1.2 · `snug` 1.35 · `body` 1.55 · `relaxed` 1.7.
**Tracking:** display −0.02em · heading −0.01em · overline +0.14em · mono +0.01em.

---

## Reglas de aplicación

1. **Playfair para lo que se lee una vez; Geist para lo que se usa.** Un titular es Playfair; un
   label de formulario jamás.
2. **El `overline` (Geist Mono mayúsculas) es el conector de marca** entre la app editorial y los
   datos. Úsalo para kickers de sección — es barato y muy reconocible.
3. **Números importantes → Geist Mono.** Una métrica, un contador de items extraídos, un recuento
   de páginas: mono. Hace que el dato salte sin color ni negrita.
4. **Nunca centrar párrafos largos. Nunca justificar** (sin guionado real se abren ríos).
5. **Jerarquía por peso y tamaño, no por color.** El color (oro) está reservado; la tipografía debe
   funcionar en gris.
6. **Máx. dos tamaños de display por vista.** Como el oro: la escasez es el lujo.

---

## En el documento CV

El CV es un caso aparte y disciplinado: Playfair **solo en el nombre**, Geist en encabezados y
cuerpo, Geist Mono en cifras. Todos los tamaños en **pt** (no fluidos). Ver
`05-documento-cv/decision-tipografica.md` y `ESPECIFICACION.md`.
