# Spec — Índice citable de la investigación

> **Fuente única y autorizada:** `prompts/00-INVESTIGACION.md`.
> **Regla del encargo:** si un dato no está ahí, no se inventa. Este archivo es un *índice de
> consulta* — no añade cifras nuevas, solo ordena las que ya están respaldadas y dice dónde se
> usan en la UI. Cada fila cita el `§` de origen dentro de la investigación.
>
> Convención de la columna *fuente*: se copia la atribución tal como la da la investigación
> (autor / año / n / tamaño de muestra). Si la UI cita una fuente distinta a la de la
> investigación, es una **contradicción** y está en la §5 de este archivo.

---

## 1 · Tabla de HECHOS CITABLES

> Estos son los únicos números que la UI puede mostrar con fuente. Ordenados por relevancia de
> producto. La última columna mapea a la clave de `copy.md` o a la pantalla donde aparece.

### 1.1 · Multiplicadores y comportamiento (el corazón del argumento)

| Dato | Cifra exacta | Fuente (según investigación) | Dónde se usa en la UI |
|---|---|---|---|
| Job title del CV = título del aviso | **10,6×** más entrevistas | Jobscan, 2,5M postulaciones (§2). ⚠️ datos internos → dirección sólida, magnitud probablemente inflada | `ed.targetTitle.why` (Editor variante · título objetivo). Corpus: «Título objetivo — el campo que más pesa» |
| Logros medibles = lo que hace seguir leyendo | **58,2%** de reclutadores | Jobscan 2025, n=384 (§2) | `hlth.nometric.src` (Salud · viñetas sin cifra). **Se cita SIN convertir en umbral** |
| CV adaptado a la descripción del cargo | **55,3%** de reclutadores | Jobscan 2025, n=384 (§2) | Sustenta Tailoring (§7 copy) y coherencia con el aviso |
| Carta de presentación personalizada | **54,0%** de reclutadores | Jobscan 2025, n=384 (§2) | Rationale de tailoring (no se promete resultado) |
| Revisa "siempre/a menudo" el LinkedIn del candidato | **73,3%** de reclutadores | Jobscan 2025, n=384 (§2) | `src.linkedin.warn` (Fuentes · LinkedIn puede estar desactualizado) |
| Screening inicial promedio | **7,4 segundos** | Ladders eye-tracking 2018, n=30, vendor, no peer-reviewed (§2) | Rationale del layout escaneable / F-pattern. **No citado con número en copy** |
| Tiempo dedicado a 1 pág vs 2 pág | **2m24s** vs **4m05s** | ResumeGo 2018, 482 profesionales, ~20.000 CVs simulados (§2) | Rationale de la regla 1–2 páginas |

### 1.2 · Filtros dentro del ATS (Jobscan 2025, n=384 — §2)

| Filtro | Cifra exacta | Dónde se usa en la UI |
|---|---|---|
| **Skills** (filtro dominante) | **76,4%** | Sección Aptitudes del master (`mstr.section.skills`); prioridad de la sección de habilidades en texto plano |
| Educación | 59,7% | — |
| **Job title** | **55,3%** | Refuerza `ed.targetTitle.*` |
| Certificaciones / licencias | 50,6% | — |
| Años de experiencia | 44%+ | — |
| Ubicación | 43,4% | Bloque de contacto (ciudad/comuna) |

### 1.3 · Largo del CV — preferencia por 2 páginas (ResumeGo 2018 — §2)

| Nivel | Cifra exacta | Dónde se usa en la UI |
|---|---|---|
| General | **2,3×** | Sustenta `ed.pages.ok` («{n} páginas» sin alarma en 2) y «una variante es la vista de 2 páginas» |
| Entry-level | 1,4× | — |
| Mid-level | **2,6×** | — |
| Managerial | **2,9×** | — |

> ⚠️ Vendor + escenario simulado, pero es la mejor evidencia cuantitativa disponible y **contradice
> el dogma "1 página siempre"**. La página 3 sí se marca (ver 1.4).

### 1.4 · Página 3 / borde de residualidad (Ladders 2018 — §2)

| Dato | Cifra / afirmación exacta | Fuente | Dónde se usa en la UI |
|---|---|---|---|
| Tiempo del reclutador en pág. 3 | "residual" · "La página 3 no existe" | Ladders eye-tracking (§2) | `ed.pages.warn` («Página 3 — el tiempo del reclutador aquí es residual. Recorta»), `ed.pages.src` («Ladders, eye-tracking»), `hlth.pages3`. Corpus editor: «⚠ 3 páginas — la página 3 no existe para el reclutador [Ladders]» |
| La página 2 se gana en la página 1 | tiempo en pág. 2 predicho por lo convincente de la pág. 1 | Ladders (§2) | Rationale del "resumen arriba" y del orden de viñetas |

### 1.5 · IA en selección — anti-alucinación (el diferenciador — §6)

| Dato | Cifra exacta | Fuente | Dónde se usa en la UI |
|---|---|---|---|
| Hiring managers que **rechazarían** un CV que parezca de IA | **19,6%** | (§6) | Sustenta la tesis anti-alucinación; `trust.aiHonest` |
| Identificaron correctamente CVs de IA **en ~20 s** | **33,5%** | (§6) | Sustenta niveles de verificación en Staging (`stg.level.*`) |
| Han detectado/sospechado tergiversación con IA | **91%** de hiring managers US | (§6) | Rationale del modelo "solo seleccionar/reformular, nunca inventar" |
| Ya usan software para detectar IA | **61%** | (§6) | — |
| Dicen que los CVs con IA dificultan verificar competencias | **65%** | (§6) | — |
| **Candidatos que admiten declarar skills de IA que NO tienen** | **32%** | **Greenhouse 2025** (§6) | `hlth.skill.src` (Salud · skill declarado sin evidencia). ⚠️ **el copy lo atribuye a "GitHub 2025" — ver §5** |
| Candidatos US que admiten keyword stuffing | **40%** | Greenhouse 2025 (§1) | Rationale de los rayos-X ATS (`ed.view.ats`) y del "no stuffing" |

### 1.6 · Adopción de ATS e IA (la premisa — §2, §6)

| Dato | Cifra exacta | Fuente | Dónde se usa en la UI |
|---|---|---|---|
| Fortune 500 con ATS detectable | **98,4%** (492/500) | Jobscan, *State of the Job Search 2025* (§2) | Premisa del producto |
| Reclutadores que usan filtros dentro del ATS | **99,7%** de 384 | Jobscan 2025 (§2) | Premisa; justifica la sección Skills en texto plano |
| Cuota de mercado ATS | Greenhouse **19,3%** · Lever **16,6%** · Workday **15,9%** · iCIMS **15,3%** | Jobscan 2025 (§2) | Justifica cubrir esos 3 vendors (ver §2 de este archivo) |
| RRHH que usa IA para reclutar | **69%** (vs 51% año anterior); **44%** para filtrar CVs | SHRM 2025 (§6) | Tesis "la IA rankea, el humano decide — escribe para ambos" |
| Reclutadores US que han delegado la mayor parte del screening a IA/ATS | **53%** | Greenhouse 2025 AI in Hiring, n=4.100+ (§6) | Idem |
| Hiring managers US que **no** usan IA para CVs | 37,5% no usa IA; solo **19,2%** la usa para revisar CVs | TopResume, n=600, may-2025 (§6) | Contrapeso honesto: la IA no es omnipresente |

### 1.7 · Contenido y regional (§4, §5)

| Dato | Afirmación exacta | Fuente | Dónde se usa en la UI |
|---|---|---|---|
| Fórmula XYZ | "Logré [X], medido por [Y], haciendo [Z]" | Laszlo Bock, ex-SVP People Ops Google (§4) | Empujón de viñetas sin cifra (`mstr.noMetric`, `stg.gap.metric`) |
| Ejemplo canónico de título alineado | «Backend Engineer (Ingeniero de Software III)» | (§4) | `tlr.title.suggest`; Corpus editor "título objetivo" |
| Foto en el CV | asimétrica y discriminatoria → **sin foto por defecto** | Ruffle & Shtudiner, *Management Science* 2015, 5.312 CVs / 2.656 vacantes (§5) | Garantizado por construcción (plantilla sin foto); `hlth.structural.note` |
| Sesgo de screeners LLM | nombres asociados a personas blancas preferidos **85,1%**; femeninos solo **11,1%** | Wilson & Caliskan, U. Washington 2024, ~550 CVs / 571 JDs (§6) | Rationale de "usar la terminología literal del aviso" (no es hack, es hablar el idioma del índice) |

---

## 2 · Reglas de parseo ATS por vendor — qué rompe qué

> Fuente: §3 (documentación oficial) + §8 de la investigación. Estas reglas son lo que la
> **plantilla garantiza por construcción** — por eso `hlth.structural.note` dice que listarlas
> como "logro" sería teatro.

### Greenhouse — causas documentadas de *"unsuccessful resume parse"* (§3)

- Archivo **> 2,5 MB** ← **único umbral de peso con fuente** (usado en `err.fileTooBig`).
- Gráficos, fotos, word art.
- CV subido **como imagen** / PDF escaneado.
- **Tablas, headers y footers.**
- **Nombre y contacto en header, footer o cuadro de texto** ← causa de "existes pero nadie te contacta".
- **Layout en columnas.**
- Letras espaciadas (`E X P E R I E N C I A`).
- Empresas sin identificador legal (`Inc.`, `Ltda.`, `SpA`) → `hlth.company.legal` cita Greenhouse.
- Cargos abreviados (`Sr. Account Exec` en vez de `Senior Account Executive`).
- **Nota clave (§1):** si el parseo falla, Greenhouse **igual crea la ficha** y un reclutador la
  rellena a mano. El riesgo no es el auto-rechazo: es quedar **mal parseado e invisible en la
  búsqueda** del reclutador. Esto redefine el feature valioso → los rayos-X `ed.view.ats`.

### Lever (§3)

- **Test definitivo:** *si no puedes seleccionar el texto con el cursor, no es parseable.*
- No parsea imágenes ni PDFs escaneados → `ingest.err.scanned`.

### Workday (§3)

- **Ignora con frecuencia headers/footers** → causa #1 de contacto perdido.
- Las **tablas alteran el orden de lectura**.

### PDF vs DOCX (§3)

- PDF **con texto seleccionable y una sola columna** es seguro en todos los ATS modernos.
- DOCX es marginalmente más predecible (el XML garantiza el orden de lectura); el PDF depende del
  orden de dibujo del generador → los PDF multicolumna se "revuelven".
- **Nunca** PDF escaneado ni exportado como imagen.
- → Justifica la tesis de `ed.view.pdf.hint` / `ed.view.ats.hint`: "el preview ES el PDF".

---

## 3 · Trampas técnicas documentadas (§8)

> Estas no son cifras de ATS: son restricciones de ingeniería que la investigación **ya resolvió**.
> Se listan para que la implementación no las redescubra en producción.

### 3.1 · PDF — `@react-pdf/renderer` v4.x (ELEGIDA, no Puppeteer)

- Motor PDFKit → **capa de texto real, fuentes embebidas con subsetting**; ~2 MB de bundle.
- Corre igual en servidor (`renderToBuffer`) y navegador (`usePDF`) → **mismo componente da preview
  y export, cero deriva** (base de "el preview ES el PDF").
- **Trampas a pinear y testear:**
  - `Font.register()` **a nivel de módulo, NUNCA dentro del componente ni del handler** (race
    conditions en renders concurrentes).
  - Registrar **`.ttf`, NO `.woff2`**.
  - Bugs por minor: `renderToStream` roto en algunas 4.x (#2940); `unitsPerEm undefined` al
    registrar fuentes (#3111); `lineHeight` en `<Page>` rompe layout en 4.1.3+ (#2988).
  - **No genera Tagged PDF / PDF-UA** (#3179 abierto). **No es bloqueante:** los ATS dependen del
    orden del content stream, no del tagging.
- Descartados: Puppeteer + `@sparticuz/chromium-min` (~50 MB, cold starts, y su única ventaja —CSS
  de columnas— es justo lo que rompe el ATS); print-to-PDF del navegador (no determinista); Typst
  WASM (~13 MB, Fase 2).

### 3.2 · El test que nadie hace (§8)

- **Re-parsear el PDF generado** con `pdf.js` / `unpdf` y hacer **diff contra el JSON de origen**.
- En CI: si no coincide, **falla el build**. En la UI: es el feature `ed.view.ats` ("Así lee el
  ATS tu CV"). Es a la vez test de regresión y argumento de venta.

### 3.3 · Claude structured outputs — la trampa del schema (§8)

- **Límite duro: 24 parámetros opcionales totales** por schema · 16 con union types.
- Error 400 *"Schema is too complex for compilation"* si el grammar compilado se pasa.
- → **Un schema de CV completo REVIENTA el límite.** Hay que **trocear la extracción por sección**
  (`basics` | `work[]` | `education`+`skills` | `projects`) **desde el día 1**.
- No soporta `minimum`/`maxLength` (el SDK los mueve a `description` y valida después).
- La gramática se cachea 24 h → la 1ª petición con schema nuevo tiene latencia extra.
- Preferir **campos `required` con `null` explícito** a opcionales.

### 3.4 · Gemini (§8)

- PDF nativo hasta **1.000 páginas / 50 MB**; **258 tokens por página**; **no cobra los tokens del
  texto nativo extraído** → baratísimo para CVs de 1–3 páginas.
- No soporta `$ref`, `oneOf`, `allOf` ni recursión; **≤2 niveles de anidamiento**.

### 3.5 · Web → markdown (ingerir portfolio) (§8)

- **Antes de gastar tokens:** leer `<script type="application/ld+json">` (`schema.org/Person`,
  `CreativeWork`). Gratis y exacto; muchos portfolios Next.js ya lo emiten.
- **Jina Reader** (`https://r.jina.ai/<url>`): Apache-2.0, 10M tokens gratis, cero setup →
  **empezar aquí**. Una sola página.
- **Firecrawl** (AGPL-3.0): solo si hay que recorrer varias páginas de proyectos.

### 3.6 · Vercel — límites oficiales (§8)

| Límite | Valor |
|---|---|
| Bundle descomprimido | 250 MB |
| **Body request/response** | **4,5 MB** → error 413 `FUNCTION_PAYLOAD_TOO_LARGE` |
| Duración | Hobby 300 s · Pro hasta 800 s |
| Memoria | Hobby 2 GB/1 vCPU · Pro hasta 4 GB/2 vCPU |
| Coste | esperar el I/O de un LLM **no** cuenta como CPU activa → timeouts generosos salen baratos |

- → **La subida de archivos va directa del cliente a Supabase Storage**, nunca por una Route
  Handler (revienta los 4,5 MB).

### 3.7 · Modelos de datos (§8)

- **JSON Resume:** adoptar como **export** (`resume.json`), no como modelo interno (ningún campo
  obligatorio; no modela variantes, provenance, métricas, `visible:false`, ni orden por rol).
  Modelo interno propio (superset) + serializador. → `set.export.body`.
- **Peso del PDF:** el **único umbral con fuente es 2,5 MB (Greenhouse)**. Cualquier objetivo más
  fino (1 MB, 100 KB, 30–80 KB) es **objetivo interno de ingeniería**, no regla de ATS → usar en
  tests, **prohibido presentarlo como regla con fuente en la UI**.
- **Supabase:** auth + DB + storage + RLS por `auth.uid()` (multi-tenant) en un solo servicio.

---

## 4 · Lo que la investigación PROHÍBE afirmar

> §1 (mitos) y §4/§8 (advertencias explícitas). Si aparece cualquiera de estos en el copy o la UI,
> es un bug de producto.

### 4.1 · Cifras falsas o no rastreables — **NO USAR**

| Afirmación | Por qué está prohibida |
|---|---|
| "Los ATS rechazan el **75%** (o 70/88%) de los CVs automáticamente" | Falso. Rastreable a **Preptel**, vendor que quebró en 2013 sin publicar metodología. Nunca hubo número original (§1) |
| "Los resúmenes generan **340%** más callbacks" | No rastreable a ningún estudio (§1) |
| "**82%** de reclutadores alemanes exige foto" | No rastreable (§1) |
| "El **43%** de CVs con iconos falla el parseo (Jobscan)" | No aparece en ninguna publicación de Jobscan — marketing (§1) |
| "El keyword stuffing en texto blanco funciona" | Contraproducente y detectable: el ATS extrae el texto oculto y el reclutador lo ve (`Ctrl+A`). 40% ya lo admite (§1) |

### 4.2 · Prohibiciones de diseño (§4, §8)

- **PROHIBIDO convertir el 58,2% en un umbral de viñetas** ("el 60/70% de tus viñetas debe llevar
  cifra") y mostrárselo al usuario como regla respaldada. **No existe ningún estudio con umbral
  numérico.** Lo verificable es señalar **una por una** las viñetas sin cifra y dejar decidir al
  usuario. → esto es exactamente lo que hace `hlth.nometric` / `stg.gap.metric` ("sin umbral").
- **PROHIBIDO cualquier "ATS score" / match-rate como veredicto.** El score de IA **rankea, no
  elimina**; perseguir el 95% produce keyword stuffing que espanta al humano (§1, §7 Jobscan). El
  producto muestra **evidencia, no puntaje** (`tlr.title`, `hlth.title`).
- **PROHIBIDO presentar umbrales de peso finos (1 MB, 100 KB…) como regla de ATS.** Solo 2,5 MB
  tiene fuente (§8).
- **PROHIBIDO que la IA invente:** solo puede **seleccionar, reordenar y reformular** hechos del
  master, con cada viñeta trazable a su evidencia (§6). Base de `tlr.g3.*` y `trust.noInvent`.
- **STAR es para la entrevista, no para el CV** (§4).
- **Multiplicadores de Jobscan (10,6× etc.): usar para priorizar features, NUNCA para prometer
  resultados** — son datos internos con sesgo de selección; la magnitud está probablemente inflada
  (§2).

---

## 5 · Contradicciones detectadas entre copy.md y la investigación

> Revisado contra `Sistema de diseño de productoVFinal/canon-design/06-handoff/copy.md` y
> `Corpus_ diseño completo/corpus-design/06-handoff/copy.md`.

1. **`hlth.skill.src` atribuye el 32% a la fuente equivocada.**
   El copy (ES y EN) dice **"GitHub 2025: 32% declara skills que no tiene"** /
   *"GitHub 2025: 32% declare skills they don't have"*. La investigación (§6) atribuye ese 32% a
   **Greenhouse 2025**, y además lo acota a **skills *de IA* que no se tienen** ("32% de candidatos
   admite haber declarado skills de IA que no tiene"). Doble desviación: (a) fuente citada
   incorrecta (GitHub vs Greenhouse) — **no existe ninguna encuesta "GitHub 2025" en la
   investigación**; (b) se elimina el calificador "de IA", que es material. **Corregir la
   atribución a Greenhouse 2025** y decidir si se mantiene el alcance "de IA".

2. **"Entre 5 y 40 segundos" (Corpus `Ingesta — nota de la espera`) no tiene respaldo en la
   investigación.** No es un dato de ATS ni una cifra citada: es una estimación de latencia de
   ingesta. No se presenta con fuente, así que **no viola la regla** (no dice "[fuente]"), pero
   conviene marcarlo como **estimación interna de producto**, no como hecho investigado. Sin
   acción obligatoria; solo trazabilidad.

> El resto de cifras citadas en ambos copys — **10,6×** [Jobscan, 2,5M postulaciones], **58,2%**
> [Jobscan 2025], **2,5 MB** [Greenhouse], página 3 residual [Ladders], identificador legal de
> empresa [Greenhouse] — **están correctamente respaldadas** por la investigación. El copy
> **evita** correctamente todas las cifras prohibidas de la §4.1 (nada de 75%, 340%, 82%, 43%).
