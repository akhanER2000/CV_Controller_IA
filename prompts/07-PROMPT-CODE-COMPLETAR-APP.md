# PROMPT 07 — COMPLETAR LA APLICACIÓN
## Para: Claude Code (Opus 4.8, esfuerzo máximo), en el repo `CV_Controller_IA`
## Objetivo: las 6 pantallas que faltan + la ingesta con IA. Todo funcionando, con su movimiento.

---

# 0 · Dónde estamos

El proyecto se llama **Corpus**. Ya existe y funciona:

| Ya construido | Ruta |
|---|---|
| Dashboard | `src/app/app/page.tsx` |
| Master | `src/app/app/master/page.tsx` |
| Editor de variante + CV | `src/app/app/cv/page.tsx` |
| Ajustes | `src/app/app/cuenta/page.tsx` |
| Auth / login / signup | `src/app/auth`, `/login`, `/signup` |
| Runtime de movimiento | `src/components/CanonRuntime.tsx`, `AuroraCanvas.tsx`, `Divider.tsx` |
| PDF + serializador | `src/lib/cv/ResumePDF.tsx`, `serialize.ts` |
| Test ATS round-trip | `tests/ats-roundtrip.test.ts` |
| Supabase | `supabase/migrations/0001_schema.sql`, `0002_user_state.sql` |

**Faltan 6 pantallas — y son justo las que contienen el diferenciador del producto:**

```
❌ /app/onboarding    las dos puertas de entrada
❌ /app/fuentes       GitHub · portfolio · LinkedIn · archivos
❌ /app/ingesta       la espera (aurora activa + progreso honesto)
❌ /app/staging       ★ revisión con procedencia. Sin esto, el producto no existe.
❌ /app/tailoring     adaptar a una oferta, con trazabilidad
❌ /app/salud         chequeo sin score
```

---

# 1 · El diseño ES la especificación

Todo está en **`Sistema de diseño de productoVFinal/canon-design/`**:

```
04-pantallas/     onboarding · fuentes · ingesta · staging · tailoring · salud
                  (+ dashboard · master · editor-variante · ajustes · auth, ya portadas)
03-componentes/   componentes.html — el inventario completo
02-sistema/       tokens.css · canon-motion.css · canon-motion.js
                  canon-aurora.css · canon-aurora.js
06-handoff/       ★ copy.md (21 KB, ES+EN) · handoff.md · criterios-aceptacion.md
05-documento-cv/  ESPECIFICACION.md · datos-ejemplo.json · cv-texto-plano.txt (golden file)
```

**Reglas de porte, en orden de importancia:**

1. **El HTML de cada pantalla es la referencia visual literal.** Ábrelo, míralo, y reprodúcelo en
   React sin deriva. No "interpretes" el diseño: pórtalo.
2. **Los nombres de clase del kit de movimiento NO CAMBIAN.** `c-stagger`, `c-divider`, `c-xray`,
   `c-hairline`, `c-pending`, `c-unverified`, `c-override`, `c-skeleton`, `c-thinking`, `c-window`,
   `c-wall`, `c-panel`, `c-scrim`, `c-aurora-gl`. Son el contrato diseño↔código.
3. **El copy sale de `06-handoff/copy.md`. Literal, ES y EN.** No lo inventes ni lo reescribas: es lo
   que separa este producto de Jobscan.
4. **Reutiliza lo que ya existe.** `CanonRuntime`, `AuroraCanvas`, `Divider` ya están. Extiéndelos si
   hace falta; no los dupliques.

---

# 2 · Las 6 pantallas

## 2.1 `/app/onboarding` — las dos puertas

**Ventana** (`c-window`) + aurora en calma. Dos caminos, **visualmente simétricos, ninguno de
segunda**:

- **A · Desde cero, o desde una plantilla de perfil** (backend, frontend, data/IA, diseño, producto,
  QA, DevOps, investigación). La plantilla precarga **la estructura de secciones esperadas**, nunca
  contenido de ejemplo. La IA está **disponible pero apagada**.
- **B · Con IA, desde tus fuentes** → lleva a `/app/fuentes`.

> ⚠️ El `origin: 'manual'` **no es un ciudadano de segunda: es el más verificable de todos** (lo
> escribió el humano). Que el diseño lo refleje.

## 2.2 `/app/fuentes` — conectar

Cuatro fuentes, **ordenadas por verificabilidad** (esa jerarquía **es** la tesis y debe verse):

| # | Fuente | Cómo | Verificabilidad |
|---|---|---|---|
| 1 | **GitHub** | **OAuth + API oficial.** Repos, lenguajes con bytes reales, descripciones, READMEs, estrellas, topics | ★★★★★ **La IA no interviene. Es una API. No hay nada que alucinar.** |
| 2 | **Portfolio** | Intenta `<script type="application/ld+json">` primero (gratis, exacto). Si no, Jina Reader (`https://r.jina.ai/<url>`) | ★★★★★ |
| 3 | **LinkedIn** | Capturas o el PDF de exportación → **transcripción verbatim** → extracción | ★★★☆☆ |
| 4 | **CV viejo / DOCX** | Igual | ★★★☆☆ |

**Selector de repos.** Un CV **no es** un volcado de GitHub: la mayoría de los repos de cualquiera
son forks, tutoriales y dotfiles. Propón un default sensato (**no-fork, con descripción, con commits
propios, activo**) y **muéstralo como propuesta revisable, nunca como selección automática**.

Panel de conexiones vivas: *"GitHub · @usuario · sincronizado hace 2 días · 14 repos considerados, 4
en el master · **3 nuevos desde la última vez**"*, con resincronización. **Lo nuevo va a staging,
nunca al master** — ni siquiera lo que viene de una API, porque la decisión de qué va en tu CV es del
humano.

## 2.3 `/app/ingesta` — la espera

**Ventana** + **`CANON.aurora.setActive(true)`** → el humo se agita mientras la IA piensa.

**Progreso específico y verdadero**, vía SSE o polling sobre `ingestion_events`:

```
Leyendo CV_2023.pdf, página 2 de 3…
Transcribiendo linkedin-captura-2.png…
Consultando la API de GitHub…
Encontré 4 experiencias · 23 skills · 2 proyectos
```

**Prohibido inventar un porcentaje.** Si no sabes cuánto falta, di **qué** estás haciendo. La barra
vacía es honesta; el 47% falso no lo es.

Al terminar: **`CANON.shimmer()` — el único del producto** — y a `/app/staging`.

## 2.4 `/app/staging` ★ — la pantalla que hace creíble todo

**Sin esto, Corpus es otro constructor de CV más.**

Cada item extraído se presenta con:
- El **contenido**.
- Su **origen**: qué archivo, qué página, y **el fragmento literal de donde salió**
  (`evidence_snippet`), expandible.
- Su **nivel de verificación** — derivado de un hecho, no auto-reportado por el LLM:
  - `verificado` → el snippet **aparece literal** en el `raw_text`
  - `parcial` → coincidencia difusa
  - **`sin evidencia`** → **la UI lo señala** (`c-unverified`: borde punteado + icono + texto, nunca
    solo color)
- **Acciones:** Aceptar · Editar · Descartar.

**Tres problemas reales que hay que resolver, no esquivar:**

1. **Volumen.** CV + LinkedIn + portfolio = 60–100 items. Revisar 100 tarjetas de una en una es una
   tortura. **Revisión por lotes que siga siendo responsable:** aceptar una sección entera de items
   verificados con un clic, pero **forzando la mirada sobre los que no tienen evidencia**.
2. **Duplicados.** El mismo trabajo aparece en el CV y en LinkedIn, redactado distinto. **UI de
   fusión:** las dos versiones lado a lado, campo por campo. **La fusión la decide el usuario.
   Nunca automática.**
3. **Los huecos.** Diséñalos como invitaciones, no como errores: *"Esta viñeta no tiene ningún número
   — ¿cuánto? ¿cuántos? ¿en cuánto tiempo?"*

Movimiento: `CANON.stagger()` al poblarse · `CANON.countTo()` · `c-confirm` / `c-dismiss`.

**Regla inviolable: nada escribe en `profile_items` sin pasar por `staged_items` y una acción
explícita del usuario. Ni siquiera los datos de contacto.**

## 2.5 `/app/tailoring` — con trazabilidad o no existe

Pegas el texto de la oferta. El producto responde con **evidencia, no con un score**.

**Los tres grupos — y la distinción es la ética del producto:**

```
✅ Ya está en esta variante
🔵 Lo tienes en el master, pero no en esta variante   → un clic y lo añades. HONESTO.
⚪ No lo tienes en ninguna parte                       → ★ NO OFRECER AÑADIRLO ★
```

Para el tercer grupo, el copy exacto está en `copy.md`. Es delicadísimo: útil sin desalentar, honesto
sin ser cruel. **Esto es lo que nos separa de Jobscan.**

**Sugerencias, todas con `item_id` trazable:**
- `target_title` alineado al del aviso (**10,6x más entrevistas** — el mayor ROI del producto)
- reordenamiento de viñetas
- reformulación → **siempre `{item_id, original, propuesto}`, lado a lado, aceptar/rechazar una a una**

### ★★ El control que de verdad importa — no lo omitas

Comprobar que la propuesta trae un `item_id` válido **NO ES SUFICIENTE**. Eso verifica la procedencia
del *hueco*, no la del *contenido*. Una reformulación que inserte *"aumenté un 25%"* donde el
original **no tenía ninguna cifra** trae un `item_id` perfecto y **pasa ese control sin despeinarse**.

```ts
function preservesFacts(original: string, proposed: string, evidence: string): boolean {
  // 1. Todo NÚMERO en `proposed` debe existir en `original` o en `evidence`.
  //    Cifras nuevas = invención. Sin excepciones.
  // 2. Toda ENTIDAD NOMBRADA (empresas, tecnologías) debe existir en el origen.
  // 3. Las unidades no pueden cambiar (25% ≠ 25x ≠ 250).
}
// Si no preserva → no se muestra como sugerencia aceptable.
//                  Se marca override_verified=false y la UI lo señala en rojo.
```

**Escribe el test que intenta colar una reformulación con una cifra nueva y verifica que el servidor
la rechaza.** Es el test más importante del producto: **es la promesa entera, en código.**

**Filtro anti-"suena a IA":** rechaza *potenciar sinergias, impulsar la excelencia, gestión integral*
(ES) · *delve, leverage, spearheaded, robust, seamless* (EN). Y detecta cuando **todas** las viñetas
quedan con la misma estructura sintáctica — es la señal delatora #1, y el 33,5% de los hiring
managers la caza en 20 segundos.

## 2.6 `/app/salud` — sin score

Una lista de reglas, **cada una con su fuente**. Sin porcentajes, sin barras, sin "87/100", **sin
umbrales inventados**.

> ⚠️ **Solo comprueba lo que puede fallar.** El renderer ya garantiza por construcción: una columna,
> sin tablas, sin headers, sin foto, texto seleccionable. **Listar seis ✓ perpetuos es teatro.** Esas
> garantías van en **una nota discreta**, una sola vez.

| Regla | Fuente |
|---|---|
| Viñetas **sin ninguna cifra** → se listan una por una. **Sin umbral ni porcentaje.** | 58,2% de reclutadores prioriza el logro medible |
| `target_title` ausente o distinto del aviso | 10,6x |
| Empresas sin identificador legal ("Acme" → "Acme SpA") | Greenhouse |
| Cargos abreviados ("Sr. Eng." → "Senior Engineer") | Greenhouse |
| Viñetas que empiezan con "Responsable de" | Fórmula XYZ (Bock) |
| **3+ páginas** | El tiempo del reclutador en la pág. 3+ es residual (Ladders) |
| Skills declaradas sin evidencia en ninguna fuente | 32% admite declarar skills que no tiene |
| Contacto incompleto | Es el riesgo real: existir y ser inalcanzable |

---

# 3 · El backend de la ingesta

## Pipeline

```
1. Cliente pide URL firmada        → POST /api/sources/upload-url
2. Cliente sube DIRECTO a Supabase Storage   ← NUNCA por una Route Handler (límite 4,5 MB de Vercel)
3. POST /api/batches/:id/ingest    (maxDuration = 300)
4. Router por tipo — TODOS producen raw_text ANTES de extraer:
     · PDF con texto  → unpdf → raw_text
     · PDF escaneado  → páginas a imagen → LLM visión:
                          ★ PASO 1: TRANSCRIPCIÓN VERBATIM → raw_text
                          ★ PASO 2: extracción estructurada SOBRE ese raw_text
     · DOCX           → mammoth → raw_text
     · Imagen         → los mismos dos pasos
     · URL            → JSON-LD si existe; si no, Jina Reader
     · GitHub         → API oficial. Sin LLM. Dato duro.
5. Extracción TROCEADA por sección
6. Verificación de evidencia → evidence_verified
7. staged_items (con parent_staged_id para las viñetas)
8. Dedup contra el master → duplicate_of + merge_proposal
9. El usuario revisa → SOLO al aceptar entra en profile_items
```

## ★ El paso de transcripción verbatim no es negociable

Es tentador mandarle la captura al modelo multimodal y pedirle el JSON directamente. **No lo hagas.**
Sin `raw_text`, **la verificación de evidencia no puede correr** — y quedaría desactivada
precisamente en las fuentes con **mayor** riesgo de alucinación, que son las imágenes, que son la
capacidad estrella. Dos llamadas. Cuesta unos céntimos más y es lo que hace verdadera la promesa.

## ⚠️ La trampa que te va a explotar

**Claude structured outputs: límite duro de 24 parámetros opcionales por schema.** Un schema de CV
completo **lo revienta** → `400 — Schema is too complex for compilation`.

**Trocea desde el día 1:** `basics` · `work` (con sus bullets) · `education` · `skills` · `projects`
= 5 llamadas pequeñas en paralelo. **No lo descubras en producción.**

Prefiere campos `required` con `null` explícito a opcionales. Usa el SDK (no HTTP crudo): `minimum` /
`maxLength` no están soportados y el SDK los mueve a la `description`.

## Verificación de evidencia — el detector de alucinación

```ts
const verified = normalize(rawText).includes(normalize(item.evidence));
```

Binario, gratis y **honesto**. **No le pidas al modelo un `confidence` numérico**: un número que el
LLM se auto-asigna, mostrado al usuario como si fuera una medición, es **el mismo pecado que el "ATS
score"** que este producto condena.

---

# 4 · El movimiento tiene que sobrevivir al porte a React

Es donde se pierde siempre. Reglas:

- `canon-motion.js` usa `IntersectionObserver` y guardas de "una sola vez por sesión". **Pórtalo a
  hooks conservando el comportamiento**, no solo el aspecto. `CanonRuntime.tsx` ya hace parte de esto
  — extiéndelo.
- **`CANON.shimmer()` se autolimita: UNO en todo el producto.** Si sale dos veces, deja de ser un
  momento y pasa a ser un tic.
- **`CANON.aurora.pause()` en el `focus` de cada input.** **El editor es sagrado: nada se mueve
  mientras el usuario escribe.**
- **Cero scroll-reveal en la app.** Si mis 200 items del master hacen fade-in al entrar en viewport,
  **no puedo trabajar**. Permitido solo en `.c-doc` (ajustes, documentación).
- `prefers-reduced-motion` en **todo**, con la equivalencia documentada: el blur-in se vuelve un
  corte, el stagger una aparición, el shimmer no existe. **Pierde el movimiento, nunca la
  información.**
- **Ventana / muro:** login, onboarding e ingesta son **ventana** (aurora visible). Master, editor,
  staging y tailoring son **muro**. **Donde hay trabajo, el trabajo gana.**

---

# 5 · Criterios de aceptación

1. **Las 6 rutas existen, funcionan y se ven como su HTML de diseño.** Sin deriva visual.
2. `grep -c "@keyframes"` en el CSS de cada pantalla ≥ 11. El movimiento sobrevivió al porte.
3. Subes un PDF + una captura + conectas GitHub → **staging poblado**, con **cada item mostrando de
   dónde salió** y si su evidencia está verificada.
4. **Test:** ningún item llega a `profile_items` sin aceptación explícita. Ni los datos de contacto.
5. **Test:** una reformulación de la IA con una **cifra que no está en el original ni en la
   evidencia** es **rechazada por el servidor**. ← *El test más importante del producto.*
6. **Test:** una sugerencia sin `item_id` válido y del usuario es rechazada.
7. **`grep -rn "score\|match.*%\|[0-9]\+/100" src/`** → **cero resultados en la UI.** Ni score, ni %
   de match, ni umbral de viñetas, ni `confidence` auto-asignado.
8. **RLS testeado**: el usuario A no puede leer **ni referenciar** nada del B (ojo al IDOR de
   `variant_items`: los FK no pasan por RLS — hace falta un trigger de pertenencia).
9. `tests/ats-roundtrip.test.ts` **sigue pasando**. Si alguien rompe el renderer, falla el build.
10. **El copy sale de `copy.md`, literal.** Nada improvisado.
11. Teclado: el editor de 3 paneles es operable **enteramente por teclado**, incluido el
    reordenamiento.

---

# 6 · Orden

```
1. /app/onboarding      (simple, desbloquea el flujo)
2. /app/fuentes         + GitHub OAuth + la API (dato duro, sin LLM — empieza por lo fácil y verificable)
3. Pipeline de ingesta  (Storage, router por tipo, transcripción verbatim, extracción troceada)
4. /app/ingesta         (aurora activa + progreso honesto vía SSE)
5. /app/staging   ★     (procedencia, verificación, dedup, lotes)
6. /app/tailoring       + preservesFacts() + su test
7. /app/salud
8. Pulido: a11y, reduced-motion, e2e, deploy en Vercel (Fluid Compute)
```

---

# 7 · Cómo trabajar

- **Commits pequeños, en español, descriptivos** (como los que ya hay).
- Si algo del diseño es inviable, **dilo y propón la alternativa antes de implementarla.** No te
  desvíes en silencio.
- Si te falta un dato sobre ATS, reclutadores o formato: **está en `prompts/00-INVESTIGACION.md`**.
  Si no está ahí, **no lo inventes** → anótalo en `PREGUNTAS-DISENO.md`.

---

> **Cuando dudes entre "impresionante" y "verificable", elige verificable.**
>
> El mercado está lleno de herramientas que le mienten al usuario con un score de humo y le inventan
> skills que no tiene. Corpus es lo contrario: **una herramienta que solo dice cosas que puede
> demostrar.**
>
> Si estás a punto de escribir un número que no puedes justificar, o de dejar que la IA escriba una
> línea que el usuario no puede rastrear hasta algo que él mismo dijo — **no lo hagas.**
>
> Ese es el producto entero. Todo lo demás es implementación.
