# Anexo de investigación — La evidencia detrás del producto

> Este documento es la **base fáctica** de los prompts 01 (diseño) y 02 (implementación).
> Todo lo que se afirma aquí está respaldado por una fuente citada. Donde una cifra popular
> resultó ser falsa o no rastreable, se dice explícitamente.
>
> **Regla para quien lea esto:** no inventes datos nuevos. Si necesitas una cifra que no está
> aquí, no la uses.

---

## 1. El mito que hay que matar primero

> **"Los ATS rechazan automáticamente el 75% de los CVs."**

**Es falso.** La cifra se rastrea hasta **Preptel**, un vendor de software de CVs que la promovió
hacia 2012 y **quebró en 2013 sin publicar jamás una metodología**. De ahí deriva a 70/75/88%
según quién la recicla, porque nunca hubo un número original. Pasó por una mención sin fuente en
Forbes y se reproduce desde entonces en CIO, CNBC y miles de blogs.

**Lo que realmente pasa** (documentación oficial de Greenhouse): si el parseo falla, el sistema
**igual crea la ficha del candidato** con el archivo adjunto, y un reclutador la rellena a mano.

**El riesgo real no es el rechazo automático. Es quedar mal parseado y, por tanto, invisible en
las búsquedas del reclutador.** El reclutador busca sobre la *base de datos* extraída, no sobre
tu PDF. Si tu email quedó en un header que Workday ignoró, existes pero nadie puede contactarte.

**Corolario de producto:** el enemigo es la **extracción defectuosa**, no un filtro maligno. Eso
cambia por completo qué feature es valioso: no un "ATS score" de humo, sino **enseñarle al
usuario el texto que el parser realmente extrae de su PDF.**

### Otros mitos verificados

| Afirmación | Veredicto |
|---|---|
| "El 88% de los buenos candidatos son filtrados" | **Parcialmente cierto, mal citado.** HBS/Accenture *Hidden Workers* (2021): >90% de empleadores usa software para el primer corte, y 88% **reconoce que candidatos calificados quedan fuera por criterios rígidos configurados por humanos** (brechas de empleo, título obligatorio). No es un parser borrando gente. |
| "Existe auto-rechazo real" | **Cierto pero acotado:** las *knockout questions* del formulario (autorización de trabajo, ubicación, años mínimos) sí rechazan automáticamente. Se configuran por aviso. Dejarlas en blanco descalifica más rápido que cualquier error de formato. |
| "Keyword stuffing en texto blanco / prompt injection" | **Contraproducente y detectable.** El ATS extrae texto plano: las palabras ocultas **aparecen en el output que lee el reclutador**. Un `Ctrl+A` las revela. 40% de candidatos US lo admite (Greenhouse 2025) y los empleadores ya reaccionaron. Riesgo asimétrico sin upside. |
| "Los scores de IA te eliminan" | **No: te rankean.** Un score bajo te entierra en el orden de la lista; no borra tu ficha. |
| "Los resúmenes generan 340% más callbacks" | **No rastreable a ningún estudio. No usar.** |
| "82% de reclutadores alemanes exige foto" | **No rastreable. No usar.** |
| "El 43% de CVs con iconos falla el parseo" (atribuido a Jobscan) | **No aparece en ninguna publicación de Jobscan. Marketing.** |

---

## 2. Qué está realmente medido

### Adopción y filtros

- **98,4% de las Fortune 500** usan un ATS detectable (492/500) — Jobscan, *State of the Job Search 2025*.
- Cuota de mercado general: **Greenhouse 19,3% · Lever 16,6% · Workday 15,9% · iCIMS 15,3%**.
- **99,7% de 384 reclutadores** encuestados usan filtros dentro del ATS.

**Qué filtran (% de reclutadores que usa cada filtro — Jobscan 2025, n=384):**

| Filtro | % |
|---|---|
| **Skills** | **76,4%** ← el filtro dominante |
| Educación | 59,7% |
| **Job title** | **55,3%** |
| Certificaciones / licencias | 50,6% |
| Años de experiencia | 44%+ |
| Ubicación | 43,4% |

→ **Una sección de Habilidades explícita, en texto plano, con los términos literales del aviso,
no es opcional. Es el campo más consultado del sistema.**

### Multiplicadores de tasa de entrevista (Jobscan, 2,5M postulaciones)

| Factor | Multiplicador |
|---|---|
| **Job title del CV coincide con el del aviso** | **10,6x** |
| Posgrado (máster/doctorado) | 6,7x |
| Licenciatura/título | 6,1x |
| Incluir carta de presentación | 3,4x |
| Perfil de LinkedIn optimizado | 2,2x |

⚠️ Datos internos de usuarios de Jobscan → sesgo de selección. **La dirección es sólida; la
magnitud probablemente está inflada.** Úsalo para priorizar features, no para prometer resultados.

### Comportamiento del reclutador — Ladders eye-tracking (2018)

- **7,4 segundos** de screening inicial promedio.
- **Los reclutadores pasan más tiempo en los job titles que en cualquier otro elemento.**
- Escaneo en **patrón F/E**, recorriendo el **borde izquierdo** hacia abajo.
- Los CVs que ganan: layout simple, headers de sección y de cargo claramente marcados, un
  **resumen arriba de la primera página**, tipografía clara, espacio en blanco real.
- Los CVs que pierden: **múltiples columnas**, frases largas, clutter, poco espacio en blanco,
  **keyword stuffing** (funciona con la máquina, el humano lo detecta y lo castiga).
- **Dato clave y poco citado:** *"Un reclutador enganchado pasa tanto tiempo en la página 2 como
  en la 1. Pero el tiempo en la página 2 está fuertemente predicho por lo convincente que sea la
  página 1. Las páginas siguientes rinden mal sin importar qué."*
  → **La página 2 se gana en la página 1. La página 3 no existe.**

⚠️ **Limitación real: n = 30 reclutadores, estudio de vendor, no peer-reviewed.** Dirección, no ley.

### Largo — ResumeGo (2018), 482 profesionales, ~20.000 CVs simulados

| Nivel | Preferencia por 2 páginas |
|---|---|
| General | **2,3x** |
| Entry-level | 1,4x |
| Mid-level | **2,6x** |
| Managerial | **2,9x** |

Tiempo dedicado: **2m24s** en un CV de 1 página vs **4m05s** en uno de 2.

⚠️ Vendor, escenario simulado — pero es la mejor evidencia cuantitativa disponible y **contradice
frontalmente el dogma de "1 página siempre"**.

### Qué hace que un reclutador siga leyendo (Jobscan 2025, n=384)

- **58,2%** — logros medibles
- **55,3%** — CV adaptado a la descripción del cargo
- **54,0%** — carta de presentación personalizada
- **46,8%** — coherencia entre LinkedIn y el CV
- **73,3%** revisa "siempre" o "a menudo" el LinkedIn del candidato

---

## 3. Qué rompe el parseo (documentación oficial, no folclore)

**Greenhouse documenta explícitamente** estas causas de *"unsuccessful resume parse"*:

- Archivo **> 2,5 MB**
- **Gráficos, fotos, word art**
- CV subido **como imagen**
- **Tablas, headers y footers**
- **Nombre y contacto en header, footer o cuadro de texto**
- **Layout en columnas**
- Letras separadas por espacios (`E X P E R I E N C I A`)
- Nombres de empresa sin identificador legal (`Inc.`, `Ltda.`, `SpA`)
- Cargos abreviados (`Sr. Account Exec` en vez de `Senior Account Executive`)

**Lever** publica el test definitivo: *si no puedes seleccionar el texto con el cursor, el
documento no es parseable.* No parsea imágenes ni PDFs escaneados.

**Workday** ignora con frecuencia el contenido de **headers/footers** → causa #1 de contacto
perdido. Las tablas alteran el orden de lectura.

**PDF vs DOCX:** PDF con texto seleccionable y una columna es seguro en todos los ATS modernos.
DOCX es marginalmente más predecible porque el XML garantiza el orden de lectura; el PDF depende
del orden de dibujo del generador (por eso los PDF multicolumna se "revuelven"). **Nunca** PDF
escaneado o exportado como imagen.

---

## 4. Reglas de contenido

### Fórmula XYZ (Laszlo Bock, ex-SVP People Ops de Google)

> **"Logré [X], medido por [Y], haciendo [Z]."**

- ❌ "Responsable de mejorar las ventas del equipo."
- ✅ "**Aumenté las ventas 25% (USD 1,2M) en Q1** al lanzar una nueva línea de negocio y
  rediseñar el proceso de calificación de leads."

**Reglas duras:**

- Verbo de acción en pasado al inicio. Nunca "Encargado de", "Responsable de", "Ayudé a".
- **La mayoría de las viñetas debería llevar una cifra.** Si no hay métrica de negocio, usa escala:
  volumen, usuarios, tamaño de equipo, presupuesto, latencia, tickets, uptime, tiempo ahorrado.
  > ⚠️ **No existe ningún estudio que establezca un umbral numérico** (ni 60%, ni 70%, ni ninguno).
  > Lo que está medido es que el **58,2% de reclutadores** dice que lo que más destaca es un logro
  > cuantificado. **Está prohibido convertir eso en un porcentaje de viñetas y mostrárselo al
  > usuario como si fuera una regla respaldada.** Señala las viñetas *sin* cifra, una por una, y deja
  > que el usuario decida. Eso es verificable; un umbral no lo es.
- Frases declarativas cortas. 3–6 viñetas por rol reciente; 1–3 para roles antiguos.
- Prohibido: párrafos de descripción de cargo, listas de responsabilidades, adjetivos sin
  evidencia ("proactivo", "apasionado", "orientado a resultados").
- **STAR es para la entrevista, no para el CV.** En una viñeta consume espacio y rompe el
  escaneo de 7 segundos.

### Resumen (no "objetivo")

- **El objetivo está muerto** — habla de lo que tú quieres; el CV debe hablar de lo que entregas.
- **2–3 líneas / 30–50 palabras.**
- Estructura: `[Rol] con [X años] en [dominio]. [Logro cuantificado insignia]. [2–3 competencias
  clave literales del aviso].`

### Keywords y tailoring

- Los reclutadores buscan con **Boolean** sobre campos parseados:
  `("customer success" OR "client success") AND SaaS AND Zendesk`.
- **Copia la terminología literal del aviso**, incluidas variantes: si dice "Machine Learning (ML)",
  incluye ambas formas al menos una vez.
- **Alinea el job title.** Si tu cargo interno es "Ingeniero III" y el aviso pide "Backend
  Engineer", escribe: `Backend Engineer (Ingeniero de Software III)`. Es honesto y captura el 10,6x.
- Las keywords van **en contexto**, dentro de viñetas de logro — además de en la sección de
  Habilidades. Ladders documenta que el stuffing hunde el CV con humanos.

### Tailoring mínimo viable por postulación (~15 min)

1. Ajustar el título del CV al del aviso.
2. Reescribir el resumen (2–3 líneas) con las 3 exigencias principales del aviso.
3. Reordenar/reescribir Habilidades con los términos exactos.
4. Reordenar las viñetas del rol más reciente para poner arriba las más relevantes.

→ **Estos 4 pasos son literalmente la especificación funcional del motor de variantes.**

---

## 5. Chile / LatAm

- **SIN foto.** Desaconsejado por reclutadores locales (Robert Walters Chile lo dice
  explícitamente) y causa documentada de fallo de parseo en Greenhouse.
- **SIN edad, SIN fecha de nacimiento, SIN estado civil, SIN dirección exacta.**
- **RUT:** no es requisito legal en el CV. Solo si el aviso lo pide.
- **Sí:** nombre completo, celular con **+56**, email profesional, **ciudad/comuna y región**,
  LinkedIn actualizado.
- Cronológico inverso por defecto. El funcional solo para lagunas severas — y los ATS lo parsean
  peor.
- 1–2 páginas. Los ATS globales (Workday, Greenhouse, SAP SuccessFactors) están extendidos en
  corporativos y multinacionales en Chile → **las mismas reglas técnicas aplican.**

**Sobre la foto, evidencia dura** — Ruffle & Shtudiner, *Management Science* (2015), 5.312 CVs
enviados en pares a 2.656 vacantes reales:
- Hombres atractivos: callbacks significativamente mayores que sin foto.
- **Mujeres: las que NO enviaron foto tuvieron una tasa de callback significativamente MAYOR** que
  las mujeres atractivas o comunes con foto.
→ La foto tiene efectos asimétricos y discriminatorios. **Sin foto por defecto.**

**Europa (referencia, no MVP):** UK/Irlanda/NL/Escandinavia sin foto. Alemania/Austria/Suiza aún
la esperan culturalmente (el AGG prohíbe *exigirla*). Europass es rígido, basado en tablas, y
parsea mal: úsalo solo si lo piden explícitamente.

---

## 6. IA en 2025–2026: en ambos lados de la mesa

### Cuánta IA hay realmente

- **SHRM 2025:** 69% de RRHH usa IA para reclutar (vs 51% el año anterior). **44% para filtrar CVs.**
- **Greenhouse 2025 AI in Hiring Report** (n=4.100+, US/UK/IE/DE): **53% de reclutadores US han
  delegado la mayor parte del screening a IA/ATS**; 25% admite no confiar mucho en el sistema;
  **8% no sabe qué prioriza su IA.**
- **TopResume (n=600 hiring managers US, may-2025):** el **37,5% no usa ninguna herramienta de IA**;
  solo el **19,2% usa IA para revisar CVs**.

→ **La IA rankea y prioriza; el humano sigue decidiendo. Escribe para ambos.**

### CVs escritos por IA: sí importa

- **19,6% de hiring managers rechazaría** un CV que parezca generado por IA.
- **33,5% los identificó correctamente — en ~20 segundos.**
- **91% de hiring managers US** ha detectado o sospechado tergiversación con IA; **61% ya usa
  software para detectarla.**
- **32% de candidatos admite haber declarado skills de IA que no tiene** (Greenhouse 2025) — y los
  reclutadores están cazando exactamente eso.
- **65% de hiring managers** dice que los CVs con IA hacen más difícil verificar competencias.

**Señales que delatan un CV "de IA" (y que hay que eliminar activamente):**

- Vocabulario delator: EN — *delve, tapestry, leverage, spearheaded, robust, seamless*.
  ES — *potenciar sinergias, impulsar la excelencia, gestión integral, liderar la transformación*.
- **Todas las viñetas con la misma estructura sintáctica.**
- Verbos rimbombantes **sin cifras**.
- Cifras impresionantes **sin contexto** (¿25% sobre qué base? ¿en cuánto tiempo?).
- Inflación de skills que no calza con la seniority.

→ **Regla de producto:** la IA sirve para **estructurar, comprimir y adaptar**, nunca para inventar.
La especificidad verificable (nombres de sistemas, magnitudes reales, restricciones concretas) es
indetectable como IA **porque la IA no la puede inventar**. Ese es el eje del producto.

### Los screeners LLM tienen sesgo y son más superficiales de lo que parecen

- **Wilson & Caliskan (U. of Washington, 2024):** 3 modelos, ~550 CVs, 571 JDs, 9 ocupaciones.
  CVs con **nombres asociados a personas blancas preferidos en el 85,1%** de los casos; nombres
  femeninos preferidos en solo el **11,1%**.
- **Webster (arXiv:2507.11548, 2025):** auditoría de 8 plataformas. Algunos modelos que parecían
  "sin sesgo" eran simplemente **incapaces de evaluar sustantivamente y se limitaban a hacer
  matching superficial de keywords** — *"Illusion of Neutrality"*.

→ **Implicación práctica:** buena parte del "AI screening" es matching léxico disfrazado. Eso
**refuerza** la regla de usar la terminología literal del aviso. No es hackear el sistema: es
hablar el idioma del índice.

### Regulación (contexto)

- **EU AI Act:** reclutamiento y filtrado de CVs son **alto riesgo** (Anexo III). Obligaciones de
  testeo de sesgo, supervisión humana y transparencia. Aplicación del Anexo III postergada del
  2-ago-2026 al **2-dic-2027**. Alcance extraterritorial.
- **NYC Local Law 144:** auditoría de sesgo anual + notificación al candidato. Multas USD 500–1.500/día.
- **Efecto neto:** más "human in the loop" declarado, menos auto-rechazo puro, más ranking asistido.

---

## 7. El mercado: 11 productos revisados y el hueco que dejan

| Producto | Núcleo | Debilidad |
|---|---|---|
| **Teal** | Tracker + builder + Job Match | Skills **alucinadas** tomadas de la JD; plantillas 2-columnas que **rompen el ATS**; cobros tras cancelar |
| **Rezi** | Builder AI-first, "ATS score" en vivo | **Soporte inexistente** (emails que rebotan); IA irregular; 3 descargas en free |
| **Kickresume** | Tailoring completo contra JD | **Poca profundidad ATS**; plantillas multi-columna |
| **Enhancv** | Diseño + score de parseabilidad en vivo | **Sin free tier real**; de los más caros |
| **Resume.io** | Builder clásico, alto volumen | **Trial trap** ($2.95/7d → $29.95/4sem); descarga tras paywall; cancelación difícil |
| **Careerflow** | LinkedIn profile reviewer | Builder mediocre |
| **Huntr** | **Mejor matching semántico** contra JD | Free tier limitado |
| **Jobscan** | Gap analysis más maduro | El match rate **no es un veredicto de ATS real**; perseguir el 95% produce **keyword stuffing** que espanta al humano; $49,95/mes |
| **Reactive Resume** (OSS, MIT) | Self-host, privacy-first | Sin tailoring, sin ingesta. **Migró a `@react-pdf/renderer` client-side y eliminó Chromium** ← precedente técnico clave |
| **OpenResume** (OSS, MIT) | Builder + **resume parser** ("así lee el ATS tu PDF") | Una plantilla, sin persistencia, sin IA |
| **ProfileStack** (OSS, MIT) | **"One career story, many role-ready CVs"** — fork de ATSResume | Ver abajo |

### ProfileStack en detalle (nuestra inspiración, y por qué la superamos)

- 20 stars, 9 forks, **5 commits**, 96% JavaScript. Next.js + Tailwind.
- **No hay master profile real.** Son N archivos `frontend.profile.js` / `backend.profile.js` en
  paralelo. **Reintroduce exactamente la deriva de datos que su propio README critica**: cambias tu
  cargo y editas 5 archivos.
- **No hay UI de edición ni persistencia.** Editas objetos JS a mano.
- **Export = diálogo de impresión del navegador.** Frágil: márgenes/headers del browser, y todas
  las guías ATS advierten *"usa Save As PDF, no Print to PDF"* porque el segundo degrada la capa
  de texto.
- **Cero IA, cero ingesta, cero JD matching.**
- Su roadmap pendiente (*custom layouts, themes, JSON schema validation, import from LinkedIn,
  export presets*) **es el producto que vamos a construir.**

### El hueco real (7 vacíos verificados)

1. **Ingesta multimodal.** Nadie deja subir *"lo que tengas"* — PDF viejo, DOCX, capturas de
   LinkedIn, la URL de tu portfolio — y construir el perfil solo. Con LLMs multimodales es hoy
   trivial y **nadie lo ha hecho bien**.
2. **Anti-alucinación con trazabilidad.** Nadie ofrece un modelo donde la IA **solo pueda
   seleccionar, reordenar y reformular hechos del master**, con cada viñeta trazable a su evidencia
   de origen, y **nunca inventar**. ← *El diferenciador defendible.*
3. **Gap analysis honesto** en vez de empujar al keyword stuffing.
4. **"Lo que ves es lo que el parser lee".** El ATS de dos columnas sigue roto en 2026. Mostrar el
   texto realmente extraído del PDF generado es un argumento de venta inmediato (solo OpenResume
   se acerca).
5. **Sincronización master↔variantes.** Nadie te dice *"actualizaste tu cargo; 4 de tus 7 variantes
   están obsoletas"*.
6. **Pricing hostil generalizado.** Descarga siempre gratis / lifetime honesto = ventaja reputacional.
7. **Multi-idioma con paridad ES/EN.** El mercado es US-céntrico.

---

## 8. Decisiones técnicas que la evidencia ya resuelve

### PDF: `@react-pdf/renderer`, no Puppeteer

| Opción | Veredicto |
|---|---|
| **`@react-pdf/renderer` v4.x** | ✅ **ELEGIDA.** ~2 MB de bundle. Motor PDFKit → **capa de texto real, fuentes embebidas con subsetting**. Corre igual en servidor (`renderToBuffer`) y en navegador (`usePDF`) → **el mismo componente da preview y export, cero deriva.** Precedente: **Reactive Resume migró a esto y eliminó Chromium por completo.** |
| Puppeteer + `@sparticuz/chromium-min` | ❌ ~50 MB, cold starts de segundos, hay que alojar el pack brotli remoto. Su única ventaja (CSS avanzado, columnas) **es justo lo que rompe el ATS**. |
| Print-to-PDF del navegador (ProfileStack) | ❌ No determinista; el usuario controla márgenes y headers; degrada la capa de texto. |
| Typst WASM | ⏭ Mejor tipografía de las 4, pero ~13 MB de WASM y un lenguaje de plantillas nuevo. **Fase 2**, "modo tipografía premium". |

**Trampas conocidas de react-pdf v4 (pinear versión y testear):**
- `Font.register()` **a nivel de módulo, NUNCA dentro del componente ni del handler** → hay race
  conditions documentadas en renders concurrentes.
- Registrar `.ttf`, **no `.woff2`** (react-pdf no lo maneja bien).
- Bugs por minor: `renderToStream` roto en algunas 4.x (#2940), `unitsPerEm undefined` al registrar
  fuentes (#3111), `lineHeight` en `<Page>` rompiendo layout en 4.1.3+ (#2988).
- **No genera Tagged PDF / PDF-UA** (issue #3179 abierto). Los ATS **no dependen del tagging** —
  dependen del orden del content stream. No es bloqueante.

### El test que nadie hace

**Re-parsear nuestro propio PDF generado con `pdf.js`/`unpdf` y hacer diff contra el JSON de origen.**
- En CI: si no coincide, **falla el build**.
- En la UI: **"Así es como el ATS lee tu CV"** — el texto plano extraído, lado a lado.

Esto es a la vez un test de regresión y el feature más vendible del producto.

### Structured outputs: la trampa del schema

**Claude structured outputs (ya en GA)** tiene límites duros:
- **24 parámetros opcionales totales** por schema.
- 16 parámetros con union types.
- Error 400 *"Schema is too complex for compilation"* si el grammar compilado se pasa.

→ **Un schema de CV completo REVIENTA este límite.** Hay que **trocear la extracción por sección**
(`basics` | `work[]` | `education`+`skills` | `projects`) desde el día 1. No lo descubras en producción.
- No soporta `minimum`/`maxLength` (usa el SDK, que los mueve a la `description` y valida después).
- La gramática se cachea 24 h: la primera petición con un schema nuevo tiene latencia extra.
- Prefiere **campos `required` con `null` explícito** a campos opcionales (cada opcional casi
  duplica parte del espacio de estados).

**Gemini:** PDF nativo hasta 1.000 páginas / 50 MB. **258 tokens por página**, y **no cobra los
tokens del texto nativo extraído**. Para CVs de 1–3 páginas es baratísimo. No soporta `$ref`,
`oneOf`, `allOf` ni recursión; ≤2 niveles de anidamiento.

### Web → markdown (para ingerir un portfolio)

- **Jina Reader** (`https://r.jina.ai/<url>`): Apache-2.0, 10M tokens gratis, luego ~$0,05/M.
  Una sola página, pero **cero setup**: `fetch('https://r.jina.ai/' + url)` devuelve markdown
  listo para el LLM. → **Empezar aquí.**
- **Firecrawl**: AGPL-3.0. 1 página = 1 crédito; free 1.000 créditos. Crawlea un sitio completo en
  una llamada y tiene endpoint `extract` con schema. → Solo si hace falta recorrer varias páginas
  de proyectos.
- **Antes que cualquiera de los dos:** intenta leer el `<script type="application/ld+json">`
  (`schema.org/Person`, `CreativeWork`). Muchos portfolios Next.js modernos ya lo emiten. Es
  gratis, exacto, y no gasta tokens.

### Peso del PDF: lo que está documentado y lo que no

- **Documentado:** Greenhouse **no parsea archivos > 2,5 MB**. Ese es el único umbral con fuente.
- **No documentado (y por tanto prohibido presentárselo al usuario como regla con fuente):**
  cualquier objetivo más fino (1 MB, 100 KB, 30–80 KB). Son **objetivos internos de ingeniería**
  razonables — un CV sin imágenes con fuentes subsetadas pesa decenas de KB — pero **no son reglas
  de ATS**. Úsalos en los tests; no los cites como evidencia en la UI.

### JSON Resume: adoptar como *export*, no como modelo interno

- ✅ Estándar de facto en el mundo dev, MIT, 400+ temas npm, y tiene un **Job Description schema**
  hermano (`jsonresume.org/job-description-schema`) útil para el matching.
- ❌ **Ningún campo es obligatorio** → validación débil. Y **no modela nada de lo que necesitamos**:
  ni variantes, ni provenance/evidencia, ni métricas, ni `visible: false`, ni orden por rol.
- → **Modelo interno propio (superset) + serializador a `resume.json`.** Ganamos portabilidad y
  marketing anti-lock-in sin atarnos a un schema que no cubre nuestro caso.
- **schema.org `JobPosting`**: útil en el lado de la oferta — muchos portales lo publican como
  JSON-LD embebido. Extraerlo **antes** de gastar tokens de LLM.
- **HR Open Standards / JDX**: el estándar "de verdad" para intercambio ATS↔empleador, pero
  sobredimensionado para B2C. Mencionar como future-proof, no implementar.

### Límites de Vercel (docs oficiales)

| Límite | Valor |
|---|---|
| Bundle descomprimido | **250 MB** |
| **Body request/response** | **4,5 MB** → error 413 `FUNCTION_PAYLOAD_TOO_LARGE` |
| Duración | Hobby 300 s · Pro hasta 800 s |
| Memoria | Hobby 2 GB/1 vCPU · Pro hasta 4 GB/2 vCPU |
| Coste | Active CPU — **esperar el I/O de un LLM NO cuenta como CPU activa** → timeouts generosos salen baratos |

→ **La subida de archivos va directa del cliente a Supabase Storage**, nunca a través de una
Route Handler (revienta los 4,5 MB).

### Storage/Auth: Supabase

Ya está en el portfolio del usuario. Resuelve **auth + DB + storage de archivos** en un solo
servicio (con Neon habría que ensamblar 3). RLS por `auth.uid()` es exactamente el modelo
multi-tenant que necesitamos. pgvector disponible si algún día queremos búsqueda semántica sobre
los propios logros.

---

## Fuentes

**ATS — documentación oficial**
- https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse
- https://support.greenhouse.io/hc/en-us/articles/200721684-Why-didn-t-the-candidate-s-resume-import-correctly
- https://help.lever.co/hc/en-us/articles/20087345054749-Understanding-Resume-Parsing
- https://www.workday.com/en-us/products/talent-management/ai-recruiting.html

**Datos de filtros y tasas de entrevista**
- https://www.jobscan.co/state-of-the-job-search
- https://www.jobscan.co/blog/ats-formatting-mistakes/
- https://www.jobscan.co/blog/fortune-500-use-applicant-tracking-systems/
- https://www.jobscan.co/blog/resume-tables-columns-ats/

**El mito del 75% / evidencia de screening**
- https://unchartedcareer.com/blog/the-75-of-resumes-are-auto-rejected-myth-traced-to-its-source
- https://www.hbs.edu/managing-the-future-of-work/research/hidden-workers-untapped-talent

**Comportamiento del reclutador / largo**
- https://www.theladders.com/static/images/basicSite/pdfs/TheLadders-EyeTracking-StudyC2.pdf
- https://www.hrdive.com/news/eye-tracking-study-shows-recruiters-look-at-resumes-for-7-seconds/541582/
- https://www.resumego.net/research/one-or-two-page-resumes/

**Contenido / fórmula XYZ**
- https://www.inc.com/bill-murphy-jr/google-recruiters-say-these-5-resume-tips-including-x-y-z-formula-will-improve-your-odds-of-getting-hired-at-google.html

**Chile / regional / foto**
- https://www.robertwalters.cl/insights/consejos-de-carrera/e-guide/como-hacer-un-gran-cv.html
- https://pubsonline.informs.org/doi/10.1287/mnsc.2014.1927 (Ruffle & Shtudiner, *Management Science*)

**IA en selección 2025–2026**
- https://www.greenhouse.com/blog/greenhouse-2025-workforce-hiring-report
- https://topresume.com/career-advice/ai-in-hiring-survey
- https://www.shrm.org/topics-tools/research/2025-talent-trends/ai-in-hr
- https://www.washington.edu/news/2024/10/31/ai-bias-resume-screening-race-gender/
- https://arxiv.org/abs/2507.11548 (Webster, *Fairness Is Not Enough*)

**Regulación**
- https://artificialintelligenceact.eu/annex/3/
- https://www.nyc.gov/site/dca/about/automated-employment-decision-tools.page

**Competencia / open source**
- https://github.com/PatriciaAlEs/ProfileStack
- https://github.com/sauravhathi/atsresume
- https://github.com/AmruthPillai/Reactive-Resume
- https://github.com/xitanggg/open-resume
- https://www.trustpilot.com/review/resume.io
- https://resumegenius.com/reviews/rezi-ai-review

**Técnico**
- https://jsonresume.org/schema
- https://docs.claude.com/en/docs/build-with-claude/structured-outputs
- https://ai.google.dev/gemini-api/docs/document-processing
- https://vercel.com/docs/functions/limitations
- https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions
- https://react-pdf.org/fonts
- https://github.com/diegomura/react-pdf/issues/3179
