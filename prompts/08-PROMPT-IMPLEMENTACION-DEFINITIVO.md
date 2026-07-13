# PROMPT 08 — IMPLEMENTACIÓN DEFINITIVA · de `VFinal` a código
## Para: Claude Code (Opus 4.8, esfuerzo máximo)
## Entrada: la carpeta de diseño **`Sistema de diseño de productoVFinal/canon-design/`** (completa y validada)
## Salida: la aplicación web funcional, desplegada en Vercel
##
## ⚠️ Este prompt es el **brief primario**. El **`prompts/02-PROMPT-IMPLEMENTACION.md`** sigue siendo
##    el **anexo técnico exhaustivo** (modelo de datos SQL, internals de ingesta, trampas de react-pdf,
##    preservación de hechos, RLS/IDOR). **Léelo completo.** Donde 08 y 02 difieran, manda 08.

---

> **Antes de escribir una línea de código, lee COMPLETOS, de `VFinal/canon-design/`:**
> `00-README.md` · `06-handoff/handoff.md` · `06-handoff/copy.md` · `06-handoff/criterios-aceptacion.md`
> · `06-handoff/AUDITORIA-V3.md` · `05-documento-cv/ESPECIFICACION.md` · `05-documento-cv/decision-tipografica.md`
> · `02-sistema/motion.md`. Y **abre las 11 pantallas de `04-pantallas/` en el navegador** y míralas
> moverse: eso es el objetivo, al píxel y al milisegundo.
>
> El diseño **no es una sugerencia: es la especificación.** Si algo te parece técnicamente inviable,
> **dilo antes de desviarte.** No improvises una alternativa en silencio.

---

# 0 · Qué estás construyendo, y la trampa que debes evitar

**Corpus** (marca de cara al usuario; nombre de trabajo interno **CANON**; namespace técnico
`canon-*` / `window.CANON`; repo `CV_Controller_IA`). Un sistema de registro de carrera: un master
profile canónico del que se derivan N variantes de CV. Las variantes **no copian** el master: lo
**referencian**. Multi-usuario desde el día 1. Deploy en **Vercel**.

## Las cinco cosas que hacen que este producto exista (si pierdes una, no lo construiste)

1. **El master es la fuente de verdad.** Las variantes referencian items; no los duplican.
2. **La IA nunca inventa.** Cada dato tiene procedencia (`source_id` + `evidence_snippet` verificado).
3. **El PDF es texto real, una columna, ATS-parseable.** Sin excepciones.
4. **"Cómo lo lee el ATS":** re-parseamos nuestro propio PDF y mostramos el texto extraído. En CI, si
   el round-trip no coincide con el golden file, **el build falla.**
5. **Ningún número sin fuente en toda la UI.** Ni score, ni % de match, ni umbrales, ni `confidence`
   auto-asignado por el LLM.

## ★ La trampa específica de este proyecto — léela dos veces

El diseño anterior (V3) construyó un kit de movimiento excelente **y lo dejó dormido**: 11 keyframes
definidos, cero cableados; la aurora nunca se montaba; las ceremonias nunca se disparaban. Una
auditoría lo destapó (`06-handoff/AUDITORIA-V3.md`) y `VFinal` **lo arregló**: ahora las 11 pantallas
están **vivas** — la aurora se monta en `auth`/`onboarding`/`ingesta`, y `CANON.stagger`/`shimmer`/
`countTo` se **invocan de verdad**.

> **Tu riesgo número uno es repetir ese pecado al portar a React:** dejar `canon-motion.css` importado
> pero sin aplicar sus clases a nodos montados, o registrar `<AuroraCanvas/>` sin montarlo nunca. **En
> React se valida exactamente igual que en el diseño: por USO en el árbol montado, no por presencia de
> una regla.** El §5 y los criterios de aceptación del §9 lo blindan. **No entregues un port dormido.**

---

# 1 · La fuente de verdad: `VFinal`

Todo lo que necesitas para la UI ya existe, validado. Mapa:

```
VFinal/canon-design/
├── 01-producto/        posicionamiento.md · principios.md          → el porqué de cada decisión
├── 02-sistema/
│   ├── tokens.css · tokens.json     → la paleta y todo el sistema. NO inventes colores.
│   ├── tipografia.md · densidad.md   → escala tipográfica y densidad de app
│   ├── motion.md                     → la doctrina de 4 niveles de ceremonia + reduced-motion
│   ├── canon-motion.css · .js        → el kit de movimiento (11 keyframes + API window.CANON)
│   └── canon-aurora.css · .js        → el fondo vivo (shader WebGL2, oro/cobre/plata sobre obsidiana)
├── 03-componentes/     componentes.html/.md   → inventario con estados (incl. skill-con-evidencia,
│                                                niveles verificado/parcial/sin-evidencia)
├── 04-pantallas/       LAS 11 PANTALLAS, VIVAS: auth · onboarding · ingesta · staging · master ·
│                       editor-variante · fuentes · tailoring · salud · ajustes · dashboard
│                       (a 1440/1024/390, con estados vacío/carga/datos/error)
├── 05-documento-cv/    ESPECIFICACION.md (spec al pt) · decision-tipografica.md ·
│                       datos-ejemplo.json ⇄ cv-texto-plano.txt  ← ★ EL GOLDEN FILE (fixture de CI)
└── 06-handoff/
    ├── handoff.md              ← ★ el contrato de integración. La API window.CANON y los nombres de
    │                             clase NO cambian al portar a React. Es normativo.
    ├── copy.md                 ← TODO el copy, ES+EN. No lo improvises: el copy ES el producto.
    ├── criterios-aceptacion.md ← criterios de DISEÑO (visual/copy/interacción/a11y). Obligatorios.
    └── AUDITORIA-V3.md         ← por qué V3 quedó dormido. Léelo para no repetirlo.
```

**Marca:** todo lo visible dice **Corpus**. `CANON` es infraestructura (carpeta, `canon-*`,
`window.CANON`) y el usuario nunca lo ve. Si encuentras "CANON" donde lo lee un usuario, es un bug de
copy → "Corpus". (Detalle en `handoff.md §0`.)

---

# 2 · ProfileStack: **minar, no forkear**

El repo de referencia `PatriciaAlEs/ProfileStack` (Next.js + Tailwind, MIT) es un buen mapa
conceptual, pero **su arquitectura es incompatible con este producto** y forkearlo cuesta más de lo
que ahorra. Es a ProfileStack lo que alkemymarket es al diseño: **inspiración, no plantilla.**

| Qué es ProfileStack | Qué necesita Corpus | Veredicto |
|---|---|---|
| Descubre `*.profile.js` en el filesystem | Perfiles en Postgres/Supabase, multi-usuario con RLS | ❌ No sirve |
| Un solo usuario, sin auth, sin DB | Auth + RLS + aislamiento desde el día 1 | ❌ No sirve |
| PDF por el **diálogo de impresión del navegador** | `@react-pdf/renderer` (paridad cliente/servidor, ver §6) | ❌ No sirve |
| Sin IA | Ingesta y tailoring con IA trazable | ❌ No sirve |
| **Variantes por rol** (frontend/backend/…) | La misma idea, pero como **vistas del master** con overrides | ✅ **Concepto validado** — es nuestra tesis |
| **Estructura de datos ATS de una página** | Ya la tenemos, más rica, en `datos-ejemplo.json` | ✅ Cótejala como sanity check |
| Licencia MIT | — | ✅ Puedes tomar snippets con atribución |

**Decisión: greenfield con la arquitectura del §3 (la del prompt 02), minando ProfileStack solo para
el concepto de variantes y como cotejo de la forma de datos ATS.** Si prefieres forkearlo de todos
modos, **dilo y justifícalo antes** — pero la recomendación firme es no hacerlo.

---

# 3 · Stack (del prompt 02 — no lo cambies sin leer su justificación)

| Capa | Elección |
|---|---|
| Framework | **Next.js 15, App Router, TypeScript estricto** |
| Deploy | **Vercel** con **Fluid Compute** (esperar I/O de un LLM no cuenta como Active CPU) |
| Auth + DB + Storage | **Supabase** (`@supabase/ssr`), **RLS por `auth.uid()`** |
| Estilos | **Tailwind v4** + `02-sistema/tokens.css`/`tokens.json`/`densidad.md`. **Cero colores inventados.** |
| **PDF** | **`@react-pdf/renderer` v4.x, versión PINEADA.** No Puppeteer. (§6) |
| IA | **Vercel AI SDK** (`generateObject` + Zod) + **AI Gateway**. Extracción: **Gemini Flash**; razonamiento: **Claude**; web→md: JSON-LD → **Jina Reader**. |
| Validación / Tests | **Zod** en todo · **Vitest** + **Playwright** + el **round-trip ATS** |

**Límites de Vercel que van a morderte:** body de request **4,5 MB** → los archivos **nunca** pasan
por una Route Handler (subida directa a Storage con URL firmada); bundle 250 MB (por eso no cabe
Chromium); duración `maxDuration = 300` en la ruta de ingesta. **Detalle completo en 02 §1.**

---

# 4 · Modelo de datos — la idea central

`variant_items` es una **tabla de unión con overrides por campo**: la variante **referencia** items
del master y opcionalmente los sobreescribe **campo por campo** (`override_data jsonb`). **No copia
datos.** Es lo que resuelve la deriva que ProfileStack/Teal/Rezi dejan sin resolver, y lo que habilita
"3 de tus 7 variantes están desactualizadas".

> **El SQL completo, en orden de dependencias, con RLS, el trigger de pertenencia anti-IDOR, la lógica
> de "variante desactualizada" (OR sobre items, no AND con el master) y el `ON DELETE RESTRICT` de los
> overrides está en el prompt 02 §2. Es correcto y normativo — impleméntalo tal cual.** Reglas que no
> puedes perder: `basics` es un `profile_item` con procedencia (no una columna suelta); `bullet` es un
> `item_kind` hijo por `parent_id`; `translated_from` liga ES↔EN; **nada** entra a `profile_items` sin
> pasar por `staged_items` y una aceptación explícita del usuario.

---

# 5 · ★ Portar el sistema vivo a React sin romperlo (la sección nueva crucial)

`VFinal` demostró el diseño en HTML/CSS/JS vanilla. Portarlo a React/Next es donde el movimiento
suele **morir**. Estas reglas lo impiden. Son un **contrato** (`handoff.md`), no sugerencias.

## 5.1 Preserva el contrato: los nombres de clase y `window.CANON` NO cambian

- **`canon-motion.css` y `canon-aurora.css` se importan como CSS global**, una vez, sin renombrar
  clases. Las clases (`c-window`, `c-wall`, `c-scrim`, `c-panel`, `c-panel--solid`, `c-aurora-gl`,
  `c-stagger`, `c-divider`, `c-xray`, `c-hairline`, `c-pending`, `c-skeleton`, `c-thinking`,
  `c-shimmer`, `c-rise`, `c-glow-in`, `c-panel-in`, `c-override`, `c-unverified`) se usan **literales**
  en el JSX (`className="c-panel c-panel--solid"`). **No las conviertas en CSS Modules ni les cambies
  el nombre:** son el contrato con el diseño y con `criterios-aceptacion.md`.
- **La API `window.CANON` se preserva** como superficie estable: `CANON.stagger(lista)`,
  `CANON.shimmer(el,'ingesta')`, `CANON.countTo(el,n)`, `CANON.confirm(el)`, `CANON.dismiss(el)`,
  `CANON.aurora.setActive(bool)`, `CANON.aurora.pause()`. Envuélvela en hooks
  (`useAurora()`, `useStaggerOnMount()`, `useShimmerOnce()`) que llamen a la **misma** lógica de
  `canon-motion.js`/`canon-aurora.js`. **No reescribas el shader ni los keyframes**; adáptales el
  ciclo de vida a React.

## 5.2 Monta la aurora **de verdad** (no la dejes como CSS muerto)

- Un único **`<AuroraCanvas/>`**, **`'use client'`**, que monta el shader de `canon-aurora.js` en un
  `useEffect` (guardando `typeof window`, contexto `webgl2`, y **cleanup** al desmontar). Renderiza el
  `<canvas class="c-aurora-gl">` que hoy falta cuando esto no se cablea.
- **Vive solo en las pantallas atmosféricas** (`auth`, `onboarding`, `ingesta`, dashboard vacío).
  **Nunca** detrás del editor, del master con 200 items, ni del documento.
- **Reactivo al estado real:** `CANON.aurora.setActive(true)` mientras una ingesta está corriendo
  (átalo al estado del job / stream SSE); `setActive(false)` al terminar; **`pause()` cuando el
  usuario escribe en el editor** — el editor es sagrado.
- **Degradación:** `prefers-reduced-motion` o sin WebGL2 → el degradado estático de
  `canon-aurora.css` (misma paleta). Sin pestaña visible → el shader no trabaja.

## 5.3 Cablea las ceremonias a **eventos reales**, no a temporizadores

- **`ingesta`:** el progreso sale de `ingestion_events` reales por SSE (§7 / 02 §4.2) — "Leyendo
  página 2 de 3…", contador con `CANON.countTo()` atado al `found` real. **Jamás un % inventado.**
- **`staging`:** al poblarse los `staged_items`, `CANON.stagger(items)`; al **terminar la ingesta**,
  el **único shimmer del producto** (`CANON.shimmer()`, se autolimita). No lo gastes en otro lado.
- **Movimiento por capas (decisión de VFinal, respétala):** coreografía completa en las atmosféricas;
  **sobrio y rápido** (120–200 ms) en las de trabajo. **Prohibido:** scroll-reveal en pantallas de
  trabajo, animar mientras se escribe, un shimmer que salga dos veces.
- **reduced-motion preserva la información** (confirm/dismiss/hairline/skeleton siguen significando
  algo sin moverse), nunca un `*{animation:none}` que borre la señal.

## 5.4 Notas de Next/SSR

- Todo lo que toca el DOM o WebGL es **cliente** (`'use client'`, montaje en `useEffect`). El shell,
  las rutas y los datos son server components + Route Handlers.
- El **x-ray "Cómo lo lee el ATS"** (`data-xray-toggle`, blur→resuelve) es la metáfora que vende el
  producto: consérvalo idéntico. Su capa `__raw` muestra el **texto plano real** re-parseado del PDF
  real (§6.3), no una maqueta.

---

# 6 · El PDF y el round-trip ATS (del 02 §5 — normativo)

- **`@react-pdf/renderer`, versión pineada sin `^`.** El **mismo** árbol `<ResumePDF/>` sirve el
  preview en cliente (`usePDF`) y el export en servidor (`renderToBuffer`) → **cero deriva** entre lo
  que el usuario ve y lo que descarga. `Font.register()` a nivel de módulo, `.ttf`, **las fuentes que
  diga `decision-tipografica.md`** (no asumas). Reglas del renderer: una columna, cero tablas, cero
  headers/footers (contacto **en el cuerpo**), cero iconos/fotos/gráficos, fechas a la derecha con
  flexbox, el `target_title` **impreso** bajo el nombre (el 10,6x).
- **★ El test round-trip, en la Fase 1, en CI:** renderiza el PDF desde `datos-ejemplo.json`,
  re-parséalo (`unpdf`/`pdf.js`), y **compara contra `cv-texto-plano.txt`**. Verifica también: nombre/
  email/teléfono en el cuerpo, cada cargo/empresa/fecha/skill literal, orden de lectura correcto, texto
  seleccionable, sin basura de embedding, y si el diseño mezcla dos fuentes en una línea (cifras en
  mono) que no se peguen ni se separen. **Si falla → falla el build.** Detalle en 02 §5.3.

---

# 7 · Ingesta · Tailoring · Salud · Seguridad (del 02 — recordatorios no negociables)

- **Ingesta (02 §4):** subida directa a Storage; router por tipo donde **todo camino produce
  `raw_text` antes de extraer** — para imágenes/PDF escaneado, **transcripción verbatim primero**, y
  extracción después sobre esa transcripción (sin esto la verificación de evidencia queda desactivada
  justo en las fuentes de mayor riesgo). Extracción **troceada por sección** (Claude revienta con
  >24 opcionales por schema). **Verificación de evidencia binaria y honesta:** ¿el `evidence_snippet`
  aparece literal en `raw_text`? Sí→verificado, No→sin verificar (UI distinta). **No pidas un
  `confidence` numérico al LLM.**
- **Tailoring (02 §6):** los tres grupos (ya está / en el master → añadir 1 clic / **no lo tienes →
  NO ofrecer añadirlo**). **★ Verificación de preservación de hechos (02 §6.2):** todo número o entidad
  en una reformulación propuesta debe existir en el original o en la evidencia — una cifra nueva es
  invención, aunque traiga un `item_id` válido. **Escribe el test que intenta colar una cifra nueva y
  verifica que el servidor la rechaza. Es el test más importante del producto.**
- **Salud (02 §7):** lista de reglas **con su fuente**, sin score, sin barras, sin umbrales. Solo lo
  que **depende del contenido del usuario y puede fallar** (no listes lo que el renderer garantiza por
  construcción: es teatro).
- **Seguridad (02 §9):** RLS en todas las tablas + **el trigger de pertenencia anti-IDOR de
  `variant_items`** (los FK no pasan por RLS). Storage privado con URLs firmadas. Ninguna clave de IA
  en el cliente. "Exportar todo"/"Borrar todo". Nunca loguees contenido de CV ni de ofertas.

---

# 8 · Orden de implementación

Cada fase funciona y está testeada antes de la siguiente.

- **Fase 0 — Cimientos + sistema de diseño vivo.** Next.js 15 + TS estricto + Tailwind v4 con los
  tokens. Supabase: auth, migraciones en el orden del 02 §2, **RLS con su test (incl. IDOR)**. Shell,
  navegación, temas Obsidiana/Porcelana, i18n ES/EN desde `copy.md`. **★ Y el port del kit de
  movimiento (§5): `<AuroraCanvas/>` montando de verdad en una pantalla `auth` real, la API
  `window.CANON` en hooks, las clases `c-*` literales.** Puerta de salida: la aurora **se ve moverse**
  en `/auth` en el navegador, y `prefers-reduced-motion` la degrada.
- **Fase 1 — El PDF, primero.** `<ResumePDF/>` + fuentes embebidas + **el round-trip contra el golden
  file, en CI.** Puerta de salida: renderizas `datos-ejemplo.json`, re-parseas, y coincide con
  `cv-texto-plano.txt`. **Si no pasa, no sigas.**
- **Fase 2 — El master.** CRUD de `profile_items`, edición inline, procedencia visible, búsqueda,
  serializador a JSON Resume.
- **Fase 3 — Las variantes.** `variant_items` + editor de 3 paneles + **override por campo** + drag
  con alternativa de teclado + el toggle x-ray + contador de páginas (advertencia en la 3).
- **Fase 4 — La ingesta.** Subida directa + transcripción verbatim + extracción troceada +
  verificación de evidencia + staging jerárquico + dedup + progreso real por `ingestion_events` +
  **la ceremonia viva del §5.3 (stagger + el shimmer único al terminar).**
- **Fase 5 — Tailoring + salud.** Los tres grupos + **la preservación de hechos (§7)** + salud.
- **Fase 6 — Sincronización.** El diff master↔variantes + "N de M desactualizadas" + revisar y aceptar
  + el borrado con `ON DELETE RESTRICT`.
- **Fase 7 — Landing, pulido, deploy.** Landing con **demo pregrabada** (no llama al LLM) + estados
  vacío/error/carga (**están en el diseño — úsalos**) + **auditoría WCAG 2.1 AA real** + e2e Playwright
  (incl. los gates de motion del §9) + Vercel con Fluid Compute.

---

# 9 · Criterios de aceptación

> Deben pasar **los tres**: estos técnicos, los de **diseño** de `06-handoff/criterios-aceptacion.md`,
> y los **gates de motion vivo** de abajo. Ninguno es opcional.

**Técnicos (del 02 §11, resumidos):**
1. El **round-trip ATS pasa en CI** contra el golden file; romper el renderer **rompe el build**.
2. Subir PDF + captura + URL produce un **staging poblado**, cada item con su origen y su evidencia
   verificada (**staging**, no master).
3. **Ningún item llega al master sin aceptación del usuario. Ni los `basics`.** Con test.
4. Cambiar un dato del master se refleja en **todas** las variantes salvo overrides, y la app dice
   **cuáles** cambiaron. Con test sobre los triggers.
5. El toggle "Cómo lo lee el ATS" muestra el texto **real** re-parseado del PDF **real**.
6. **Test:** una reformulación con una **cifra que no está en el original ni en la evidencia** es
   **rechazada por el servidor.** ← el test más importante.
7. **RLS testeado, incluido el IDOR de `variant_items`.**
8. **No existe ningún número sin fuente en toda la UI** (búscalo con grep y elimínalo).
9. WCAG 2.1 AA: el editor de 3 paneles **operable enteramente por teclado**, incl. el reordenamiento.
10. El PDF abre con texto **seleccionable** y el `target_title` **impreso** bajo el nombre.

**★ Gates de motion vivo (el port no puede quedar dormido — análogo React de los gates de diseño):**
11. **La aurora MONTA en la app corriendo.** e2e: en `/auth` (y `/onboarding`, `/ingesta`) existe un
    `<canvas class="c-aurora-gl">` en el DOM **montado** con contexto WebGL2 activo (o el degradado si
    reduced-motion). No basta la clase en el CSS.
12. **Las ceremonias se DISPARAN por eventos reales.** e2e: al completar una ingesta, el shimmer cae
    **exactamente una vez** y los items del staging entran con stagger; el contador usa el `found` real.
13. **El editor es sagrado:** e2e/observación — al escribir en el editor, la aurora está en `pause()` y
    nada de la lista se anima.
14. **reduced-motion preserva la información:** con la preferencia activa, cada estado sigue siendo
    legible sin movimiento (no hay un `*{animation:none}` que borre la señal).
15. **Pureza de paleta en el código:** ningún hex fuera del set oro/obsidiana/porcelana/metal en los
    componentes (mismo criterio que `criterios-aceptacion.md`; los colores externos —p. ej. dots de
    lenguaje de GitHub— van en gris/oro monocromo).

---

# 10 · Cómo trabajar

- **Lee el diseño y míralo moverse antes de codear.** El copy está escrito, ES+EN; **no lo
  improvises.** Las 11 pantallas ya existen: **igualalas**, no las reinterpretes.
- **Preserva el contrato del §5.** Los nombres de clase y `window.CANON` no cambian. Si algo del port
  te obliga a desviarte, **dilo y propón la alternativa antes de implementarla.**
- Si te falta un dato de ATS/reclutadores/formato → está en `00-INVESTIGACION.md`. Si no está,
  **no lo inventes** → anótalo en `PREGUNTAS-DISENO.md` en la raíz, implementa lo más conservador,
  deja un `TODO` visible. Vacío o resuelto antes del deploy.
- **Commits pequeños, en español, descriptivos.**
- **Cuando dudes entre "impresionante" y "verificable", elige verificable.** Ese es todo el producto.

---

> ### Recordatorio final
>
> Ya tienes el diseño más difícil resuelto y **vivo**. Tu único trabajo real es **no matarlo al
> portarlo** — ni el movimiento (que no vuelva a quedar dormido), ni la promesa (que ningún número
> sin fuente ni ninguna línea de IA sin rastro se cuele en el código).
>
> **Una herramienta que solo dice cosas que puede demostrar. Todo lo demás es implementación.**
