# PROMPT 01 — DISEÑO DE PRODUCTO
## Para: Claude (Opus 4.8, esfuerzo máximo) · Modo diseño
## Salida: un sistema de diseño completo, empaquetable en `.zip`, que se entregará a Claude Code

---

> **Cómo usar este prompt:** pégalo completo. Adjunta también `00-INVESTIGACION.md` (el anexo de
> evidencia) y, si los tienes a mano, los archivos del design system `akhan-design-system/`
> (`concept.md`, `foundations/color.md`, `foundations/typography.md`, `foundations/spacing-grid.md`,
> `foundations/motion.md`). Si no los adjuntas, este prompt ya contiene los tokens esenciales
> transcritos literalmente en la §4.

---

# 0 · Tu rol

Eres el **director de diseño de producto** de una aplicación web que aún no existe. No eres un
maquetador: eres quien decide **qué se ve, en qué orden, con qué jerarquía y por qué**, y quien deja
una especificación tan cerrada que un equipo de ingeniería puede construirla sin adivinar nada.

Trabajas con dos restricciones que **no son negociables** y que están en tensión permanente. Todo tu
trabajo consiste en resolver esa tensión con elegancia:

1. **La aplicación debe ser bellísima.** Editorial, luminosa, con carácter. Debe dar la sensación de
   una herramienta cara y bien pensada — algo que da gusto abrir. Un reclutador que la vea de reojo
   debería querer usarla.
2. **El documento que la aplicación produce debe ser deliberadamente sobrio.** Una columna, sin
   iconos, sin fondos de color, sin gráficos. Porque la evidencia (§2) dice que cualquier otra cosa
   lo hace ilegible para los sistemas que lo van a leer.

> **El principio que resuelve la tensión:** *el lujo está en la contención.* La aplicación despliega
> el oro; el documento lo administra en hairlines y jerarquía tipográfica. La app es la joyería; el
> CV es la joya — y una joya de verdad es pequeña, densa y sin adornos. **Diseña el CV con la misma
> disciplina con la que un tipógrafo diseña una página de un libro: la belleza sale del espacio en
> blanco, del ritmo vertical y del peso, no de la decoración.**

Si en algún momento tienes que elegir entre "esto se ve espectacular" y "esto lo parsea bien un ATS",
**en el documento gana el ATS, siempre. En la aplicación gana lo espectacular, siempre.** No mezcles
los dos dominios.

---

# 1 · El producto

## 1.1 El problema

Un profesional no tiene *un* CV. Tiene **una historia de carrera** que necesita contarse distinto
según el rol, la empresa, la seniority, la industria y el idioma. Un desarrollador necesita una
versión frontend, una backend y una de producto. Un científico de datos, una académica y una de
industria.

Hoy la gente resuelve esto **duplicando el documento**. Funciona un mes. Después las fechas se
desincronizan, la redacción se vuelve inconsistente, los proyectos buenos quedan enterrados en la
versión equivocada, y cada actualización hay que repetirla a mano en cinco archivos.

**Todos los productos del mercado —Teal, Rezi, Kickresume, Enhancv, Resume.io— hacen exactamente lo
mismo: "duplicar y divergir".** Ninguno tiene una fuente de verdad.

## 1.2 La tesis

> **Un registro canónico de tu carrera. Todas las versiones son vistas de él, no copias.**

- **Un master profile.** Todo lo que has hecho, en datos estructurados, con la evidencia de dónde
  salió cada dato.
- **N variantes.** Cada variante **no copia** el master: lo **referencia**. Selecciona qué items
  incluir, en qué orden, y opcionalmente reescribe el texto de una viñeta para ese contexto
  concreto. Cambias tu cargo en el master → **todas las variantes se actualizan solas**, salvo donde
  hay un override explícito.
- **Ingesta con IA.** No escribes tu perfil: **lo subes.** Tu CV viejo en PDF, un DOCX, capturas de
  pantalla de tu LinkedIn, la URL de tu portfolio. La IA lo extrae todo y lo deja en una zona de
  revisión donde tú confirmas item por item antes de que entre al master.
- **La IA nunca inventa.** Al adaptar una variante, la IA **solo puede seleccionar, reordenar y
  reformular hechos que ya existen en el master**. Si propone algo sin origen trazable, se marca en
  rojo. Este es el corazón moral y comercial del producto.
- **Lo que ves es lo que el parser lee.** La app te muestra el **texto plano que un ATS realmente
  extrae de tu PDF generado**, lado a lado con el PDF. Nadie más hace esto.

## 1.3 Posicionamiento

> **"El sistema de registro de tu carrera."**
> Un master profile canónico, alimentado por IA desde cualquier fuente, del que se derivan variantes
> **verificables — nunca inventadas** — y se exportan PDFs que el ATS lee **exactamente** como los ves.

## 1.4 Nombre

Nombre de trabajo: **CANON** (del griego *kanṓn*: la regla, la vara de medir; y de "canónico" en el
sentido de fuente de verdad). El repositorio se llama `CV_Controller_IA`.

**Entregable requerido:** propón **3 nombres alternativos** con su racional en una línea cada uno.
Diseña todo con "CANON" como placeholder, pero deja el logotipo/wordmark parametrizado para que
cambiar el nombre no rompa nada.

## 1.5 A quién le hablamos

- **Usuario primario:** profesional técnico (dev, data, diseño, producto) que postula a varios tipos
  de rol a la vez, en español y en inglés. Mercado inicial: **Chile / LatAm**, con soporte de inglés
  desde el día 1.
- **Estado emocional al llegar:** frustración administrativa y ansiedad de fondo. Buscar trabajo es
  humillante y repetitivo. **El tono del producto debe ser sereno, competente y sin drama.** Nada de
  gamificación, nada de "¡Tu CV es un 87%! 🎉", nada de urgencia manufacturada. Esta gente no
  necesita un coach entusiasta: necesita una herramienta que respete su inteligencia.
- **Es multi-usuario desde el diseño.** Hay auth, hay cuentas, hay aislamiento de datos.

## 1.6 Anti-producto — qué NO somos

Escríbelo en el documento de diseño, porque estas tentaciones van a aparecer:

- ❌ **No somos un "ATS score".** Ese número es humo: Workday, Greenhouse y Lever puntúan distinto y
  ninguno publica su fórmula. Un score inventado es una mentira con decimales. Lo que sí podemos
  mostrar es **evidencia verificable**: qué texto extrae el parser, qué keywords del aviso no
  aparecen en tu CV, y qué reglas de formato documentadas estás rompiendo.
- ❌ **Ningún número sin fuente, en ninguna parte de la UI.** Esto incluye los que suenan razonables:
  "tu CV tiene un 62% de match", "el 60% de tus viñetas debería llevar cifra", "confianza: 87%". Si
  no puedes citar de dónde sale, **no se muestra**. Muestra el hecho, no el índice.
- ❌ **No hacemos keyword stuffing.** Está documentado que sube el match con la máquina y **hunde el
  CV con el humano**.
- ❌ **La IA no inventa experiencia. Nunca.**
  > Sé preciso con esta promesa: lo que garantizamos es que **la IA** no fabrica contenido — no que
  > el usuario no pueda escribir a mano lo que quiera en su propio master. **No prometas lo segundo:
  > sería mentira, y este producto se vende sobre no mentir.** El copy correcto es *"cada línea de
  > tu CV apunta a algo que tú escribiste"*, no *"el producto te impide exagerar"*.
- ❌ **No hay dark patterns de pricing.** El sector está podrido (resume.io: trial de $2,95 que
  auto-renueva a $29,95/4 semanas, descarga bloqueada tras paywall). **La descarga del PDF es siempre
  gratis.** Diseña asumiendo eso.
- ❌ **No hay gamificación, ni rachas, ni badges, ni confetti.**

---

# 2 · La evidencia (esto no es opinión — es la restricción de diseño)

Lee `00-INVESTIGACION.md` completo. El resumen que gobierna cada decisión de diseño:

**Sobre el documento:**

- **7,4 segundos** de screening inicial. Los ojos del reclutador **se fijan más en los job titles que
  en cualquier otro elemento** (Ladders, eye-tracking). Escaneo en patrón F, recorriendo el **borde
  izquierdo** hacia abajo.
- **La página 2 se gana en la página 1.** La página 3 no existe.
- **2 páginas se prefieren 2,3x sobre 1** (2,6x mid-level, 2,9x manager). *El dogma de "1 página
  siempre" es falso.* El producto debe soportar 1 y 2 páginas con igual dignidad y **advertir en la
  página 3**.
- **Skills es el filtro #1** (76,4% de reclutadores lo usa); Educación el #2 (59,7%); **job title el
  #3** (55,3%). La sección de Habilidades en texto plano **no es decorativa: es el campo más
  consultado del sistema.**
- **10,6x más entrevistas si el job title del CV coincide con el del aviso.** → El campo "título
  objetivo" de la variante merece prominencia de primera clase en la UI **y debe imprimirse en el
  documento** (ver §6.8: es el subtítulo bajo el nombre). Si no se imprime, el 10,6x no se captura.
- **58,2%** de reclutadores dice que lo que más destaca es un **logro cuantificado**. → La UI debe
  empujar hacia el número.
  > ⚠️ **Pero no existe ningún umbral respaldado** ("el 60% de tus viñetas debe tener cifra" es un
  > número inventado). **Señala las viñetas sin cifra, una por una, y deja que el usuario decida.**
  > No construyas un porcentaje ni un score con esto. Sería exactamente el pecado que condenamos.

**Lo que rompe el parseo (documentación oficial de Greenhouse / Lever / Workday):**

> Columnas · tablas · headers y footers · iconos · fotos · gráficos · texto dentro de imágenes ·
> cuadros de texto · archivo >2,5 MB · letras separadas por espacios · cargos abreviados

**El mito a matar:** *"el ATS rechaza el 75% automáticamente"* es **falso** (se rastrea a un vendor
que quebró en 2013 sin publicar metodología). Greenhouse crea la ficha igual si el parseo falla.
**El riesgo real es quedar mal parseado y por tanto invisible en las búsquedas.** Esto cambia el
producto: no vendemos miedo, vendemos **visibilidad verificable**.

**Sobre la IA:**

- **19,6% de hiring managers rechazaría un CV que parezca escrito por IA.** El 33,5% lo detecta en
  ~20 segundos.
- Señales delatoras a evitar activamente en el copy generado: *potenciar sinergias, impulsar la
  excelencia, gestión integral* (ES) · *delve, leverage, spearheaded, robust, seamless* (EN);
  todas las viñetas con la misma estructura sintáctica; verbos rimbombantes sin cifras.
- **La especificidad verificable es indetectable como IA, porque la IA no la puede inventar.** → El
  producto debe estar diseñado para **extraer especificidad del usuario**, no para generar prosa.

**Chile/LatAm:** sin foto, sin edad, sin estado civil, sin RUT (salvo que lo pidan). Celular con +56.
Ciudad/comuna. LinkedIn. Cronológico inverso.

---

# 3 · Alcance funcional a diseñar

## MVP — todo esto debe estar diseñado, pantalla por pantalla

| # | Capacidad | Nota |
|---|---|---|
| 1 | **Auth** (registro, login, recuperación) | Multi-usuario desde el día 1 |
| 2 | **Ingesta multimodal**: subir PDF/DOCX, subir **capturas de pantalla** (LinkedIn), pegar **URL de portfolio** | El diferenciador. Diséñalo como la experiencia estelar del producto. |
| 3 | **Zona de staging / revisión**: cada item extraído se confirma, edita o descarta antes de entrar al master | La UI que hace creíble el "la IA nunca inventa" |
| 4 | **Master profile**: editor completo de todas las secciones | Debe soportar mucho más contenido del que cabe en un CV — es el archivo, no el documento |
| 5 | **Variantes**: crear, duplicar, renombrar, archivar | Cada una con su título objetivo, idioma y target |
| 6 | **Editor de variante**: seleccionar items del master, reordenar, override de texto, activar/desactivar | El corazón del producto |
| 7 | **Preview del CV en vivo**, A4, paginado | Debe verse *exactamente* como el PDF |
| 8 | **Vista "Cómo lo lee el ATS"**: el texto plano extraído del PDF real, lado a lado | Nadie más lo hace. Diséñalo como un momento de revelación. |
| 9 | **Tailoring contra un aviso**: pegar el texto de la oferta → keywords faltantes, sugerencia de título, sugerencia de reordenamiento | **Con trazabilidad: toda sugerencia apunta a un item del master. Sin origen = marcada en rojo.** |
| 10 | **Chequeo de salud del CV** (no un score): lista de reglas documentadas que estás rompiendo | Evidencia, no números inventados |
| 11 | **Export**: PDF + `resume.json` (JSON Resume) | La descarga es siempre gratis |
| 12 | **Estado de sincronización**: "cambiaste el master; 3 de tus 7 variantes están desactualizadas" | El feature que ningún competidor tiene |
| 13 | **Bilingüe ES/EN** de la app y de las variantes | Paridad real |

## Fase 2 — diseña solo el "hueco" donde encajarán (no la pantalla completa)

- Scraping de la URL de la oferta (extracción de `JobPosting` JSON-LD).
- Gap analysis honesto ("esto NO lo tienes: apréndelo, o reencuadra este proyecto que sí es
  evidencia parcial").
- Tracker de postulaciones.
- Variante "diseño" (2 columnas, con foto) para envío directo a un humano por email, en paralelo a
  la variante ATS.
- Cartas de presentación.

---

# 4 · El sistema de diseño heredado: **Oro · Obsidiana · Porcelana**

Este sistema **ya existe** (es el del portfolio personal del usuario) y hay que **heredarlo y
extenderlo**, no reinventarlo. Es material de primera calidad: úsalo.

## 4.1 El concepto (literal, del documento original)

> El **oro** es *el hilo conductor de valor*: en electrónica, el metal con que se bañan los contactos
> críticos porque conduce sin corroerse; en lo editorial, el acabado que reservan los libros serios
> para el lomo y las iniciales. Señala **solo lo que importa**.
>
> La **obsidiana** —vidrio volcánico, negro profundo con brillo frío— es el tema por defecto.
> La **porcelana** —blanco cálido, denso— es el tema claro.
>
> **Reglas del oro:** *escaso* (≤ 1 elemento dorado dominante por vista) · *intencional* (el oro
> siempre significa "valor o acción": enlace, CTA, foco, métrica destacada, borde activo — nunca
> relleno) · *luminoso* (en oscuro brilla; en claro se vuelve tinta).
>
> Personalidad: **Riguroso · Luminoso · Editorial · Sobrio · Preciso.**

**Y esta frase del concepto original es, literalmente, el brief de este producto:**

> *"Un reclutador escanea en segundos — la jerarquía editorial le da el titular, el mono le da la
> evidencia (stack, métricas, años), y el oro le marca dónde hacer clic."*

## 4.2 Tokens de color (valores exactos — no los alteres)

**Escala de oro (compartida):**

| Token | HEX | Uso |
|---|---|---|
| `gold-100` | `#F6E2A2` | Brillos, shimmer, extremo claro de gradientes. Nunca texto sobre claro. |
| `gold-300` | `#E7C24F` | Oro luminoso. **Enlaces y focus-ring en tema oscuro.** |
| `gold-500` | `#D4AF37` | **Oro de marca.** Acento/CTA. Sobre claro: solo decorativo. |
| `gold-700` | `#8A6414` | Oro profundo. **Texto/enlaces/focus sobre fondos claros.** |
| `gold-900` | `#5C450F` | Bronce. Hover de enlaces en claro. |

- Texto sobre oro: `--ink-on-gold #1A1206` (8.81:1 sobre gold-500).
- **Nunca texto blanco sobre botón dorado** (≈2.0:1 — falla).

**Obsidiana (oscuro, por defecto):**

| Token | Valor |
|---|---|
| `bg` | `#0B0B0D` |
| `surface` | `#141418` |
| `surface-elevated` | `#1C1C22` |
| `text` | `#F5F5F2` |
| `text-muted` | `#B4B4AD` |
| `text-subtle` | `#82827B` |
| `border` / `border-strong` | `rgba(255,255,255,.08)` / `.16` |
| `link` / `link-hover` / `focus-ring` | `gold-300` / `gold-100` / `gold-300` |

**Porcelana (claro):**

| Token | Valor |
|---|---|
| `bg` | `#FAFAF7` |
| `surface` | `#FFFFFF` |
| `surface-sunken` | `#F1F1EC` |
| `text` | `#17171A` |
| `text-muted` | `#45454A` |
| `text-subtle` | `#6E6E72` |
| `border` / `border-strong` | `rgba(23,23,26,.08)` / `.16` |
| `link` / `focus-ring` | `gold-700` |

## 4.3 Tipografía (tres familias, roles fijos)

| Rol | Familia | Pesos | Significado |
|---|---|---|---|
| **Display / titulares** | **Playfair Display** | 500–800 (+ itálica) | *"investigación, criterio, escritura"* |
| **Texto / UI** | **Geist** | 400/500/600 | *"producto moderno que se envía"* |
| **Mono / datos** | **Geist Mono** | 400/500 | *"datos, métricas, terminal"* |

Escala modular ratio **1.25** (major third), fluida:

`display-xl` 48→96 · `display` 40→76 · `h1` 34→49 · `h2` 28→39 · `h3` 24→31 · `h4` 25 (Geist 600) ·
`h5` 20 · `h6` 16 · `body-lg` 18 · `body` 16 · `body-sm` 14 · `caption` 13 ·
`overline` 12 (**Geist Mono 500, uppercase, +0.14em**) · `code` 14 (Geist Mono)

## 4.4 Extensiones que TÚ debes crear (esto es trabajo nuevo)

El design system actual es para un sitio editorial de lectura. Esta es una **aplicación de trabajo
densa**. Necesita piezas que no existen todavía. Diséñalas **derivando** de los tokens, sin romper
el concepto:

1. **Una escala de densidad para UI de aplicación.** El portfolio respira; una app de edición no
   puede. Define una escala compacta (alturas de fila, padding de input, altura de toolbar) que
   siga siendo elegante. Base 4px, como el sistema original.
2. **Componentes de formulario completos** — no existen en el design system actual: input, textarea
   autoexpandible, select, combobox con autocompletado, chips/tags de skills, toggle, checkbox,
   radio, slider, date range picker (mes/año, que es el formato del CV).
3. **Componentes de datos:** tabla densa, lista reordenable por drag, árbol/acordeón de secciones,
   split-pane redimensionable, diff viewer.
4. **El componente estelar: la "tarjeta de item con procedencia".** Cada bullet, cada rol, cada skill
   del master lleva su origen. Diseña cómo se ve un item que viene de *"CV_2023.pdf, página 2"* vs.
   uno *"escrito a mano"* vs. uno *"reformulado por IA (ver original)"*. Debe ser legible de un
   vistazo y **nunca sentirse acusatorio**.
5. **Niveles de confianza:** un item extraído con confianza alta / media / baja debe verse distinto,
   sin usar rojo-amarillo-verde de semáforo (es feo y alarmista). Encuentra una solución con el oro
   y los grises. *Pista: la ausencia de oro también comunica.*
6. **Estados de IA:** pensando, extrayendo, propuesto-pendiente-de-revisión, aceptado, rechazado.
   El motion aquí importa: la espera de un LLM son segundos reales, no milisegundos. **Diseña la
   espera como parte de la experiencia, no como un spinner de castigo.**
7. **El "hairline dorado" como sistema de estados** en vez de fondos de color. Consistente con la
   regla del oro escaso.

## 4.5 Motion

- Corto, con curva, **nunca decorativo**. El sistema original dice *"todo se siente calibrado"*.
- El oro puede *brillar* (shimmer) en oscuro. Reserva el shimmer para **un solo momento**: cuando la
  IA termina de extraer y el perfil se puebla. Ese es el momento mágico del producto — gástalo ahí y
  en ningún otro lado.
- **Respeta `prefers-reduced-motion` en todo.** Toda animación debe tener una versión sin movimiento
  que no pierda información.

---

# 5 · Arquitectura de información

Diseña esta estructura. Puedes proponer una alternativa **si la justificas**, pero el default es:

```
/                        Landing (pública, marketing, para la gente que llega de fuera)
/login  /signup

/app                     ← shell autenticado
  /app/onboarding        Primera vez: "no escribas tu perfil, súbelo"
  /app/master            El registro canónico (el archivo completo)
    ?section=basics|summary|work|education|skills|projects|certs|languages|publications|links
  /app/sources           Las fuentes ingeridas (archivos, capturas, URLs) y qué produjo cada una
  /app/sources/[id]/review   ← STAGING. La pantalla que hace creíble todo el producto (§6.3).
  /app/variants          Todas las variantes (grid/lista, con estado de sincronización)
  /app/variants/[id]     ← EL EDITOR. La pantalla más importante del producto.
    · panel izq: el master (selector de items)
    · panel centro: la variante (orden, overrides, visibilidad)
    · panel der: preview A4 en vivo  ⇄  vista "Cómo lo lee el ATS"
  /app/variants/[id]/tailor   Modo tailoring: pegas el aviso, ves el análisis
  /app/variants/[id]/health   Chequeo de salud (§6.7) — o como panel dentro del editor: decídelo tú
  /app/settings          Cuenta, idioma, tema, API keys propias (BYOK), exportar todo, borrar todo
```

**Decisiones de navegación que debes tomar y justificar:**
- ¿Sidebar persistente o topbar? (Es una app densa con 3 paneles: piénsalo bien.)
- ¿Cómo se ve el **estado de sincronización master↔variantes** en la navegación global? Debe ser
  visible sin ser molesto. Es nuestro feature diferencial: no lo escondas en un settings.
- ¿Cómo se entra a la ingesta? Debe ser accesible desde todas partes, no solo en el onboarding
  (la gente va a subir cosas nuevas para siempre).

---

# 6 · Pantalla por pantalla — lo que debes diseñar

> Para **cada** pantalla entrega: layout a **1440px** (desktop, prioridad), **1024** (tablet) y
> **390** (móvil); estados **vacío / cargando / con datos / error / permiso denegado**; y las
> **interacciones** clave anotadas.

## 6.1 Landing (pública)

El argumento de venta, en este orden narrativo:

1. **El problema, en una frase.** *"No tienes un CV. Tienes una carrera, y cinco versiones
   desincronizadas de ella."*
2. **La demo del momento mágico:** arrastrar un PDF viejo → el perfil se puebla. Sin registro previo
   si es posible (demo con datos de ejemplo).
3. **La prueba de honestidad:** el split "tu PDF" ⇄ "lo que el ATS realmente lee". Este es el
   screenshot que se comparte en Twitter/LinkedIn. Diséñalo para que se comparta.
4. **La promesa anti-alucinación:** *"Cada línea de tu CV apunta a algo que tú escribiste. Si la IA
   no puede rastrearlo, no lo escribe."*
5. Precio honesto. **La descarga del PDF siempre es gratis.**

Tono: sereno, seguro, sin exclamaciones. Playfair en el titular. El oro aparece **una vez** en el
hero y en el CTA. Nada más.

## 6.2 Onboarding — *el momento estelar*

Esta es la pantalla que decide si el producto vive o muere. **Dedícale desproporcionadamente más
esfuerzo que a ninguna otra.**

El copy central: **"No escribas tu perfil. Súbelo."**

Una superficie de drop grande, generosa, casi ceremonial, que acepta simultáneamente:
- 📄 PDF / DOCX (tu CV viejo, aunque esté malo — sobre todo si está malo)
- 🖼️ Capturas de pantalla (tu LinkedIn, un certificado, una carta de recomendación)
- 🔗 Una URL (tu portfolio, tu GitHub, tu sitio personal)

Y **puede recibir varias fuentes a la vez** (el usuario típico tiene un CV viejo + LinkedIn +
portfolio, y las tres se complementan).

**Diseña la espera.** Extraer con un LLM toma entre 5 y 40 segundos. Ese tiempo es una oportunidad,
no un problema:
- Muestra **qué está leyendo, mientras lo lee** ("Leyendo página 2 de 3…", "Encontré 4 experiencias
  laborales…", "Detecté 23 skills…"). El progreso debe ser **específico y verdadero**, no un
  porcentaje falso.
- El contador de items encontrados subiendo es intrínsecamente satisfactorio. Úsalo.
- Cuando termina: **el shimmer dorado.** El único de todo el producto.

Después de la extracción, **nunca** vas directo al master. Vas al **staging**.

## 6.3 Staging / Revisión — *la pantalla que hace creíble todo el producto*

Aquí es donde el usuario **confirma que la IA no inventó nada.**

Cada item extraído se presenta con:
- El **contenido** (el rol, la viñeta, la skill).
- Su **origen**: qué archivo, qué página, y **el fragmento literal de donde salió** (el snippet de
  evidencia). Debe ser expandible y contraíble.
- Su **nivel de confianza**.
- Acciones: **Aceptar · Editar · Descartar.**

**Problemas de diseño reales que tienes que resolver aquí:**

1. **Volumen.** Un CV de 2 páginas + LinkedIn + portfolio produce fácilmente 60–100 items. Revisar
   100 tarjetas de una en una es una tortura. **Necesitas revisión por lotes que siga siendo
   responsable**: aceptar toda una sección de confianza alta con un clic, pero forzando la mirada
   sobre los de confianza baja. Piensa en cómo lo hace un buen code review: no lees línea por línea,
   lees el diff.
2. **Duplicados.** Si sube CV + LinkedIn, el mismo trabajo aparece dos veces, redactado distinto.
   **Diseña la UI de fusión:** dos versiones del mismo rol, lado a lado, y el usuario elige campo por
   campo o acepta una fusión propuesta. Este es un problema de diseño difícil — no lo esquives.
3. **Lo que la IA NO pudo extraer.** Los huecos. Diséñalos como invitaciones concretas, no como
   errores: *"No encontré fechas para este rol"*, *"Esta viñeta no tiene ningún número — ¿cuánto?
   ¿cuántos? ¿en cuánto tiempo?"*

## 6.4 Master profile

El **archivo completo**. Debe poder contener **mucho más de lo que cabe en cualquier CV** — esa es
la idea: aquí guardas los 14 proyectos, y cada variante muestra 3.

- Secciones: Datos básicos · Resumen(es) · Experiencia · Educación · Proyectos · Skills ·
  Certificaciones · Idiomas · Publicaciones · Enlaces.
- **Puede haber varios resúmenes** guardados (uno por ángulo de carrera). Es normal y correcto.
- Cada viñeta muestra: su texto, su origen, y **si tiene o no un número** (indicador discreto — la
  evidencia dice que el 58,2% de reclutadores prioriza logros medibles, así que la ausencia de cifra
  merece un empujón visual suave, **nunca un regaño**).
- **Edición inline.** Nada de modales para editar una viñeta. Esto es un editor, no un formulario.
- Búsqueda y filtrado por tag/skill/fecha (con 100+ items, es obligatorio).

**Diseña la escala:** ¿cómo se ve esto con 3 items? ¿Y con 200? Ambos casos deben verse bien.

## 6.5 El editor de variante — *la pantalla más importante*

Tres paneles. Debe sentirse como un instrumento de precisión.

```
┌────────────────┬──────────────────────┬─────────────────────┐
│  MASTER        │  ESTA VARIANTE       │  PREVIEW A4         │
│  (biblioteca)  │  (composición)       │  ⇄ "CÓMO LO LEE     │
│                │                      │     EL ATS"         │
│  todo lo que   │  lo elegido, en      │                     │
│  has hecho     │  orden, con overrides│  paginado real      │
│                │                      │                     │
│  [+] arrastrar │  ⠿ reordenar         │  pág 1 / 2          │
│      al centro │  👁 ocultar          │  ⚠ pág 3            │
└────────────────┴──────────────────────┴─────────────────────┘
```

**Requisitos duros:**

- **El preview es el PDF.** Píxel por píxel. Si el preview miente, el producto miente.
- El **contador de páginas es un ciudadano de primera clase**. La evidencia: 2 páginas está bien
  (y de hecho se prefiere 2,3x), **3 páginas no existe**. El diseño debe celebrar 1–2 páginas y
  **advertir con firmeza y sin dramatismo** en la 3.
- **Los overrides son visibles.** Si reescribiste una viñeta solo para esta variante, tiene que
  notarse — y debe poder verse el original y revertirse con un clic. El hairline dorado sirve aquí.
- **El toggle "Cómo lo lee el ATS"** es el momento de la verdad. Diseña la transición: el PDF
  elegante se "desviste" y queda el texto plano crudo, monoespaciado, tal como lo extrae un parser.
  **Si algo se pierde o se desordena, se ve inmediatamente.** Con Geist Mono. Este es el screenshot
  que vende el producto.
- Cambiar el **título objetivo** de la variante debe ser trivial y prominente (recuerda: 10,6x).

## 6.6 Modo tailoring

El usuario pega el **texto de una oferta de trabajo**. El producto responde con **evidencia, no con
un score**:

1. **Keywords del aviso que no aparecen en tu CV** — separadas en dos grupos, y esta distinción es
   el alma ética del producto:
   - **"Lo tienes en el master pero no en esta variante"** → un clic y lo añades. *Esto es honesto.*
   - **"No lo tienes en ninguna parte"** → **el producto NO te ofrece añadirlo.** Te dice: *apréndelo,
     o busca en tu master si hay evidencia parcial que reencuadrar, o asume que no calzas con este
     rol.* **Diseñar esto bien es lo que nos separa de Jobscan.** El copy aquí es delicadísimo: debe
     ser útil sin ser desalentador, y honesto sin ser cruel.
2. **Sugerencia de título** alineado al del aviso.
3. **Sugerencia de reordenamiento** de las viñetas del rol más reciente.
4. **Sugerencia de reformulación** de viñetas — **cada una mostrando el original y el propuesto,
   lado a lado**, con el origen trazable. Aceptar/rechazar una por una. Nunca aplicar en bloque sin
   revisión.

**Todo lo que la IA proponga y no tenga un `source_id` trazable al master se muestra con una marca
inequívoca de "no verificado".** Diseña esa marca.

## 6.7 Chequeo de salud (no un score)

Una lista de **reglas documentadas** que el CV está rompiendo, cada una **citando su fuente**:

- ⚠ **3 viñetas sin ninguna cifra** — *el 58,2% de reclutadores dice que el logro medible es lo que
  más destaca.* → y las lista, con enlace a cada una. **No dice "estás en 72%".** No hay umbral.
- ⚠ Tu título ("Ingeniero III") no coincide con el del aviso ("Backend Engineer")
- ⚠ Dos empresas sin identificador legal ("Acme" → ¿"Acme SpA"?) — *Greenhouse*
- ✗ **El CV tiene 3 páginas** — *el tiempo del reclutador en la página 3+ es residual (Ladders)*
- ✓ Texto seleccionable, fuentes embebidas — *el test de Lever*

**Sin porcentajes. Sin barras de progreso. Sin "87/100".** Cada línea es verificable o no la ponemos.

> **Dos advertencias de diseño, y las dos importan:**
>
> 1. **No listes lo que no puede fallar.** El renderer garantiza estructuralmente "una sola columna",
>    "sin foto", "contacto en el cuerpo". Mostrar seis ✓ perpetuos es **teatro de tranquilidad** —
>    exactamente el humo que prometimos no vender. Esas garantías estructurales van en **otro sitio**
>    (una nota discreta: *"esta plantilla cumple por construcción: 1 columna, sin tablas, sin
>    headers, texto real"*). **El chequeo solo muestra lo que depende del contenido del usuario y por
>    tanto puede estar mal.**
> 2. **Diseña el caso "todo bien".** ¿Cómo se ve esta pantalla cuando no hay nada que corregir? No
>    puede ser una lista vacía deprimente ni una fanfarria. Sereno y suficiente.

## 6.8 El documento — la especificación tipográfica del CV

**Esta es la pieza de diseño más difícil del encargo**, porque tienes que hacer algo hermoso con las
manos atadas. Léelo con atención.

### Restricciones (inviolables)

| Regla | Por qué | Fuente |
|---|---|---|
| **Una sola columna** | El parser lee de izquierda a derecha **atravesando ambas columnas** y mezcla tus skills con tus cargos | **Greenhouse**, causa documentada de fallo de parseo |
| **Cero tablas** | Alteran el orden de lectura | **Greenhouse** |
| **Cero headers/footers** — el contacto va **en el cuerpo** | Workday los ignora → tu email nunca se extrae | **Greenhouse / Workday** |
| **Cero iconos** — escribe `Email:` con letras | Los glifos no textuales se parsean como basura | **Greenhouse** (word art / gráficos) |
| **Cero fotos, cero gráficos, cero barras de nivel de skill** | Causa documentada de fallo. Y en Chile la foto está desaconsejada | **Greenhouse + Robert Walters Chile** |
| **Fuente con métricas estándar, texto seleccionable** | *Si no puedes seleccionar el texto con el cursor, el documento no es parseable* | **Lever**, literal |
| **Todo alineado a la izquierda**; fechas a la derecha con tabulación, **no con tabla** | El ojo escanea el borde izquierdo (patrón F) | **Ladders** (eye-tracking) |
| **Peso < 2,5 MB** | Por encima de eso, Greenhouse **no parsea el archivo** | **Greenhouse** |
| **Sin justificar el texto** | *Sin fuente ATS.* Criterio tipográfico: sin guionado real, la justificación abre ríos de espacio | **Criterio de diseño** — decláralo como tal |
| **Márgenes generosos, espacio en blanco real** | *No hay una cifra respaldada.* Lo medido es que "poco espacio en blanco" marca los CVs peor rankeados | **Ladders** (cualitativo) |

> **Regla de honestidad para esta tabla:** si una restricción viene de una fuente, cítala. Si viene
> de tu criterio tipográfico, **dilo explícitamente** ("criterio de diseño, sin respaldo empírico").
> Las dos cosas son legítimas. Disfrazar la segunda de la primera **no lo es** — y sería incoherente
> con un producto que se vende sobre no inventar datos. Aplica el mismo estándar a los márgenes
> exactos, a los tamaños en pt y al peso objetivo del archivo: son **tu criterio**, no evidencia.

### Lo que SÍ puedes usar — y donde vive toda tu creatividad

- **Jerarquía tipográfica.** Es tu único instrumento. Úsalo como un tipógrafo, no como un diseñador
  web.
- **El job title en negrita** — es el elemento que más mira el reclutador, medido. Debe ser el
  segundo elemento más pesado de la página, después del nombre.
- **Espacio en blanco.** Márgenes ≥1,5 cm. Ritmo vertical estricto. Ladders documenta "poco espacio
  en blanco" como marcador de los CVs peor rankeados. **El espacio es el lujo aquí.**
- **Un color de acento como máximo**, y solo en el nombre y los encabezados de sección. El
  `gold-700` (`#8A6414`) sobre blanco cumple AA como texto normal. **Debe seguir funcionando impreso
  en blanco y negro** — pruébalo.
- **Hairlines.** Una regla fina bajo cada encabezado de sección es tipografía, no decoración, y no
  rompe ningún parser.
- **Números en Geist Mono.** La métrica en monoespaciada dentro de una viñeta en Geist regular. Esto
  hace que las cifras **salten** al ojo del reclutador sin usar color ni negrita. *Es exactamente lo
  que dice el concepto original: "el mono le da la evidencia".*
  > ⚠️ **Esto hay que VERIFICARLO, no asumirlo.** Cambiar de fuente a mitad de línea crea runs de
  > texto adyacentes en el PDF, y es la causa clásica de que un parser extraiga `ventas25%` pegado
  > o `ventas 2 5 %` separado. **Genera un PDF de prueba con esta técnica, re-parséalo, y pega el
  > resultado en `cv-texto-plano.txt`.** Si se rompe, cae la idea — por bonita que sea. La evidencia
  > manda sobre el gusto, incluido el tuyo.

- **El título objetivo, bajo el nombre.** El `target_title` de la variante (el cargo al que se
  postula) **debe imprimirse en el documento**, como segunda línea bajo el nombre. Es lo que captura
  el 10,6x. Diséñalo: es el segundo elemento más importante de la página.

### La decisión tipográfica que debes tomar y justificar

Playfair Display es **preciosa** y es la voz de la marca. Pero:
- ¿Sobrevive a 10pt en un ATS?
- ¿La extrae limpiamente un parser?
- ¿Es apropiada para un CV de ingeniería, o parece un menú de restaurante?

**Propón dos tratamientos del documento y argumenta cuál eliges:**

- **A — "Editorial":** Playfair para el nombre y los encabezados de sección, Geist para el cuerpo,
  Geist Mono para las cifras. Máxima continuidad con la marca. Riesgo: la serif de alto contraste
  puede parsear peor, y algunos reclutadores técnicos la leen como "poco seria".
- **B — "Instrumento":** Geist para todo, con Geist Mono para cifras y metadatos, y el peso/tracking
  haciendo todo el trabajo de jerarquía. Máxima seguridad de parseo, y estéticamente más cercano a
  la ingeniería. Riesgo: se pierde el carácter editorial de la marca.

Tienes libertad para proponer un **híbrido** (ej.: Playfair **solo** en el nombre — un único gesto
editorial, coherente con "el oro escaso"). **Pero tienes que elegir uno y defenderlo con argumentos,
no con gusto.**

### Entregable del documento

- La plantilla **completa**, a escala real, con contenido realista (no lorem ipsum: usa un perfil de
  ingeniero de software chileno, con cifras verosímiles).
- **En 1 página y en 2 páginas.**
- **En español y en inglés.**
- **En blanco y negro** (prueba de impresión).
- **El texto plano que un parser extraería de ella**, en un archivo aparte. Este es el artefacto que
  demuestra que el diseño funciona.
- La **especificación tipográfica exacta**: cada tamaño en pt, cada interlineado, cada margen, cada
  espacio entre secciones. Ingeniería tiene que poder reconstruirla sin adivinar un solo valor.

---

# 7 · Accesibilidad

- **WCAG 2.1 AA como piso, no como techo.** El design system original ya trae los contrastes
  verificados con la fórmula WCAG — respétalos y no introduzcas pares nuevos sin calcular el ratio.
- El foco es visible **siempre**, con el `focus-ring` dorado. Nunca `outline: none` sin reemplazo.
- El editor de 3 paneles debe ser **operable enteramente por teclado**, incluido el reordenamiento
  (drag-and-drop con alternativa de teclado — es un requisito, no un extra).
- `prefers-reduced-motion` respetado en todo, incluido el shimmer.
- Los estados de IA deben anunciarse a lectores de pantalla (live regions).
- **Nunca comuniques información solo con color.** El nivel de confianza, el estado de override, el
  "no verificado" — todos necesitan una segunda señal (forma, texto, posición).

---

# 8 · Entregables — esto es lo que se empaqueta en el `.zip`

Produce una estructura de carpetas así, y **todo debe ser autocontenido y abrible sin build**:

```
canon-design/
├── 00-README.md                    Índice, cómo leer esto, decisiones clave en 1 página
├── 01-producto/
│   ├── posicionamiento.md          Tesis, anti-producto, nombres alternativos (3)
│   ├── principios.md               Los principios de diseño, con su justificación en evidencia
│   └── flujos.md                   User flows críticos (ingesta, tailoring, sync) con diagramas
├── 02-sistema/
│   ├── tokens.css                  TODOS los tokens como CSS custom properties, ambos temas
│   ├── tokens.json                 Los mismos, como JSON (para ingeniería)
│   ├── tipografia.md               La escala, con los roles y los casos de uso
│   ├── densidad.md                 La escala compacta nueva, para UI de aplicación
│   └── motion.md                   Duraciones, curvas, y qué se anima y qué no
├── 03-componentes/
│   ├── componentes.md              Inventario completo: variantes, estados, props, a11y
│   └── *.html                      Un archivo HTML autocontenido por familia de componentes,
│                                   abrible en el navegador, con todos los estados visibles
├── 04-pantallas/
│   ├── *.html                      CADA pantalla, en HTML+CSS estático autocontenido,
│                                   a 1440 / 1024 / 390, con todos los estados
│   └── anotaciones.md              Por pantalla: decisiones, interacciones, edge cases
├── 05-documento-cv/
│   ├── ESPECIFICACION.md           La spec tipográfica exacta, en pt/mm. Cero ambigüedad.
│   ├── cv-1pagina-es.html          A escala real, contenido realista
│   ├── cv-2paginas-es.html
│   ├── cv-1pagina-en.html
│   ├── cv-2paginas-en.html
│   ├── cv-bn.html                  Prueba de impresión en B/N
│   ├── cv-texto-plano.txt          ★ EL GOLDEN FILE. Ver abajo.
│   ├── datos-ejemplo.json          ★ El JSON exacto que produce ese texto plano. Ver abajo.
│   └── decision-tipografica.md     A vs B vs híbrido: qué eliges y por qué
├── 06-handoff/
│   ├── handoff.md                  Todo lo que ingeniería necesita y no está en otro sitio
│   ├── copy.md                     TODO el copy de la app, ES + EN, listo para i18n
│   └── criterios-aceptacion.md     Cómo saber si la implementación es correcta
└── assets/
    └── fonts/, logo/, etc.
```

**Formato de las pantallas:** HTML + CSS estático, **un archivo por pantalla, autocontenido** (CSS
inline o en un `<style>`, fuentes desde Google Fonts CDN). Nada de React, nada de build, nada de
dependencias. Tiene que abrirse con doble clic y verse exactamente como debe verse. Ingeniería lo
va a usar como referencia visual literal.

## 8.1 ★ El golden file — el artefacto más importante de tu entrega

`datos-ejemplo.json` + `cv-texto-plano.txt` son un **par**, y no son documentación: son el **contrato
ejecutable** entre diseño e ingeniería.

- `datos-ejemplo.json` — el perfil de ejemplo (el ingeniero chileno), en datos estructurados.
- `cv-texto-plano.txt` — **exactamente** el texto que un parser debe extraer del PDF que se renderice
  desde ese JSON.

**Ingeniería va a usar este par como el fixture del test de CI:** renderizan el PDF desde tu JSON, lo
re-parsean, y **comparan contra tu `.txt`**. Si no coincide, el build falla.

Esto significa dos cosas para ti:
1. **Genera el `.txt` de verdad.** Renderiza tu HTML a PDF, extráele el texto con una herramienta
   real, y pega el resultado. **No lo escribas a mano imaginando lo que saldría** — el valor entero
   está en que sea el output real.
2. Si al extraerlo descubres que algo se rompe (las fechas se pegan al cargo, el mono se separa,
   el orden se desordena), **arregla el diseño**, no el `.txt`. Ese es el punto del ejercicio.

## 8.2 Sobre `criterios-aceptacion.md`

Escribe **los criterios de aceptación del diseño**: cómo se verifica que la implementación respeta
lo que diseñaste (visual, copy, interacción, a11y). **No escribas criterios técnicos** (tests, CI,
RLS, deploy) — esos son de ingeniería y viven en el prompt 02. Los dos sets son complementarios y no
deben solaparse ni contradecirse.

## 8.3 El copy no es opcional

**El copy de este producto *es* el producto.** La diferencia entre:

> ⚠ *"Faltan 7 keywords — tu match es 62%"*

y

> *"El aviso pide Kubernetes. No aparece en tu master. ¿Lo has usado y no lo registraste, o es una
> brecha real?"*

...es la tesis entera. El primero es Jobscan. El segundo somos nosotros.

Escríbelo tú, línea por línea, en ES y EN. **No dejes que ingeniería lo improvise** — si lo hace,
volverá a ser el primero.

---

# 9 · Criterios de aceptación

Tu entrega está lista cuando:

1. Un ingeniero puede construir **cualquier** pantalla sin hacer una sola pregunta de diseño.
2. La especificación del documento CV tiene **cada valor en pt y mm**, sin un solo "aproximadamente".
3. El `cv-texto-plano.txt` demuestra que el CV se parsea limpio: nombre, email, teléfono, cargos y
   fechas salen legibles y **en el orden correcto**.
4. Cada regla de formato del documento está justificada con una **fuente citada**, no con gusto.
5. Todo el copy existe en **ES y EN**, y ninguna línea suena a coach motivacional ni a robot.
6. La app se ve **cara**. El documento se ve **serio**. Y se entiende, viéndolos juntos, **por qué
   son distintos**.
7. Existe una respuesta explícita, escrita, a: *"¿por qué esto no es otro Rezi?"*

---

# 10 · Cómo trabajar

Pregúntame lo que necesites antes de empezar — pero solo lo que **de verdad** cambie el diseño. No
me preguntes cosas que puedes decidir tú con criterio; para eso te contraté.

Cuando tengas dudas de producto, **vuelve a `00-INVESTIGACION.md`**. Casi todas las respuestas están
ahí, respaldadas.

Y una última cosa. Este producto le va a servir a gente que está buscando trabajo — un proceso que
es, casi siempre, **humillante y repetitivo**. Cada decisión de diseño que tomes puede hacerlo un
poco más digno o un poco más miserable.

**Diseña para la dignidad.**
