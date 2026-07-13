# PROMPT 02 — IMPLEMENTACIÓN
## Para: Claude Code (Opus 4.8, esfuerzo máximo)
## Entrada: `canon-design.zip` (salida del prompt 01) + `00-INVESTIGACION.md`
## Salida: aplicación web funcional, desplegada en Vercel

---

> **Antes de escribir una línea de código:** descomprime `canon-design.zip` y lee **completos**
> `00-README.md`, `06-handoff/handoff.md`, `06-handoff/copy.md`, `06-handoff/criterios-aceptacion.md`
> y `05-documento-cv/ESPECIFICACION.md`. El diseño no es una sugerencia: es la especificación.
>
> Si algo del diseño te parece técnicamente inviable, **dilo antes de desviarte**. No improvises una
> alternativa en silencio.

---

# 0 · Qué estás construyendo

**CANON** (nombre de trabajo — revisa `01-producto/posicionamiento.md`, el diseño puede haber
elegido otro; el wordmark está parametrizado). Un sistema de registro de carrera: un master profile
canónico del que se derivan N variantes de CV. Las variantes **no copian** el master: lo
**referencian**.

Repositorio: `CV_Controller_IA` · Despliegue: **Vercel** · Multi-usuario desde el día 1.

Lee `00-INVESTIGACION.md`. Es la base fáctica de todas las decisiones que siguen. **Si quieres
desviarte de una, busca primero su justificación ahí y explica por qué no aplica.**

## Las cinco cosas que hacen que este producto exista

Si alguna se pierde en la implementación, no construiste el producto:

1. **El master es la fuente de verdad.** Las variantes referencian items; no los duplican.
2. **La IA nunca inventa.** Cada dato tiene procedencia (`source_id` + `evidence_snippet`). Toda
   propuesta de la IA es trazable, o se marca como no verificada.
3. **El PDF es texto real, una columna, ATS-parseable.** Sin excepciones.
4. **"Cómo lo lee el ATS":** re-parseamos nuestro propio PDF y mostramos el texto extraído. **En CI,
   si el round-trip no coincide con el golden file del diseño, el build falla.**
5. **Ningún número sin fuente, en ninguna parte de la UI.** Ni score, ni % de match, ni umbrales, ni
   barras de progreso falsas.

> ### ⚠️ Lee esto dos veces
>
> Este producto se vende sobre **no inventar datos**. Eso te obliga a ti, no solo a la IA que
> orquestas. Durante la implementación vas a sentir la tentación de:
>
> - poner un umbral que suena razonable ("60% de las viñetas deberían tener cifra") — **no existe
>   ningún estudio que lo respalde. Prohibido.**
> - mostrar el `confidence` que el LLM se auto-asigna como si fuera una medición — **es un número
>   que el modelo se inventa sobre sí mismo. Ver §4.4.**
> - rellenar un `%` de progreso porque la barra queda fea vacía — **di qué estás haciendo, no cuánto
>   falta.**
>
> **Cada vez que escribas un número que se le muestra al usuario, pregúntate de dónde sale.** Si la
> respuesta no es "de un dato del usuario" o "de una fuente citada en `00-INVESTIGACION.md`",
> bórralo.

---

# 1 · Stack — decidido, con su justificación

| Capa | Elección | Por qué (no lo cambies sin leer esto) |
|---|---|---|
| Framework | **Next.js 15, App Router, TypeScript estricto** | — |
| Deploy | **Vercel**, con **Fluid Compute activado** | Esperar el I/O de un LLM **no cuenta como Active CPU** → timeouts generosos salen baratos |
| Auth + DB + Storage | **Supabase** (`@supabase/ssr`) | Los tres en un servicio. RLS por `auth.uid()` es el modelo multi-tenant que necesitamos. |
| Estilos | **Tailwind v4** + los tokens de `02-sistema/tokens.css` y `tokens.json` | **No inventes colores.** Usa también `densidad.md` y `motion.md`. |
| **PDF** | **`@react-pdf/renderer` v4.x, versión PINEADA** | Ver §5. **No uses Puppeteer.** |
| IA | **Vercel AI SDK** (`generateObject` + Zod) + **AI Gateway** | No te ates a un proveedor |
| · Extracción PDF/imagen | **Gemini Flash** | 258 tok/página, no cobra el texto nativo extraído |
| · Razonamiento fino | **Claude** | Structured outputs en GA. **Ojo con §4.3.** |
| · Web → markdown | **Jina Reader** (`https://r.jina.ai/<url>`) | Apache-2.0, 10M tokens gratis, una línea de código. Firecrawl solo si hay que crawlear varias páginas. **Antes que ambos: intenta el JSON-LD del sitio — es gratis y exacto.** |
| Validación | **Zod** en todo | El schema es el contrato |
| Tests | **Vitest** + **Playwright** + el **round-trip ATS** (§5.3) | |

## Límites de Vercel que van a morderte

| Límite | Valor | Consecuencia |
|---|---|---|
| **Body de request/response** | **4,5 MB** → 413 | **Los archivos NUNCA pasan por una Route Handler.** Subida directa a Supabase Storage con URL firmada. |
| Bundle descomprimido | 250 MB | Por esto no cabe Puppeteer |
| Duración | Hobby 300 s · Pro hasta 800 s | `maxDuration = 300` en la ruta de ingesta (ver §4.6 sobre latencia) |

---

# 2 · Modelo de datos

**Esta es la decisión arquitectónica central.** `variant_items` es una **tabla de unión con
overrides**: la variante **referencia** items del master y opcionalmente los sobreescribe **campo por
campo**. **No copia datos.** Es lo que resuelve la deriva que ProfileStack, Teal y todos los demás
dejan sin resolver, y lo que permite el feature "3 de tus 7 variantes están desactualizadas".

**Si en algún momento te ves tentado de guardar el texto de una experiencia dentro de una variante,
para y vuelve aquí.**

> **Orden de las migraciones:** el SQL de abajo está en orden de dependencias. Respétalo — Postgres
> resuelve los FK en tiempo de DDL.

## 2.1 Fuentes y procedencia

```sql
create type source_kind      as enum ('pdf','docx','image','url','manual');
create type ingestion_status as enum ('pending','parsing','extracted','failed','reviewed');

-- Un "lote": el usuario sube 3 fuentes a la vez y son una sola experiencia de onboarding
create table ingestion_batches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table ingestion_sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  batch_id      uuid references ingestion_batches(id) on delete cascade,
  kind          source_kind not null,
  original_name text,
  storage_path  text,          -- Supabase Storage; null si kind='url'|'manual'
  source_url    text,
  status        ingestion_status not null default 'pending',
  page_count    int,

  -- ★ raw_text ES OBLIGATORIO PARA TODA FUENTE, INCLUIDAS LAS IMÁGENES. Ver §4.4.
  --   Para imágenes/PDF escaneado: es la TRANSCRIPCIÓN VERBATIM que produce el modelo de visión,
  --   ANTES de extraer nada. Sin raw_text no hay verificación de evidencia posible.
  raw_text      text,
  raw_text_is_transcription boolean not null default false,  -- true si vino de visión, no del PDF

  error         text,
  created_at    timestamptz not null default now()
);

-- Progreso específico y verdadero (§4.2). El diseño exige "Leyendo página 2 de 3…",
-- no un porcentaje inventado.
create table ingestion_events (
  id         bigserial primary key,
  source_id  uuid not null references ingestion_sources(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  message    text not null,      -- clave de i18n, no texto hardcodeado
  payload    jsonb,              -- { page: 2, total: 3 } | { found: 4, kind: 'work' }
  created_at timestamptz not null default now()
);
```

## 2.2 El master

```sql
create type item_kind as enum
  ('basics','summary','work','education','project','skill',
   'certification','language','publication','link','bullet');

create type item_origin as enum ('extracted','manual','ai_rephrased','ai_translated');

create table master_profiles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null default 'Mi carrera',
  updated_at timestamptz not null default now(),
  unique (user_id)     -- UN registro canónico por usuario. Es la tesis del producto.
);

create table profile_items (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references master_profiles(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,  -- denormalizado, para RLS
  kind        item_kind not null,
  parent_id   uuid references profile_items(id) on delete cascade,  -- un 'bullet' cuelga de un 'work'
  data        jsonb not null,      -- forma según kind; validado con Zod en el borde
  lang        text not null default 'es',
  tags        text[] not null default '{}',

  -- ★★ PROCEDENCIA. Esto es el producto. NADA se salta esto — ni siquiera 'basics'. ★★
  origin            item_origin not null default 'manual',
  source_id         uuid references ingestion_sources(id) on delete set null,
  evidence_snippet  text,     -- el fragmento LITERAL del origen. Se muestra en la UI.
  evidence_page     int,
  evidence_verified boolean not null default false,  -- ¿el snippet aparece literal en raw_text?
  rephrased_from    uuid references profile_items(id) on delete set null,
  translated_from   uuid references profile_items(id) on delete set null,  -- paridad ES/EN

  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index on profile_items (profile_id, kind);
create index on profile_items (parent_id);
create index on profile_items (translated_from);
```

**Notas que importan:**

- **`basics` es un `profile_item`, no una columna suelta.** Nombre, email y teléfono son
  **exactamente los datos que la investigación identifica como el riesgo real** (*"si tu email quedó
  en un header que Workday ignoró, existes pero nadie puede contactarte"*). Es impensable que sean
  el único dato **sin** procedencia y **sin** pasar por staging. Van por el mismo camino que todo lo
  demás.
- **`bullet` es un `item_kind` propio**, hijo de un `work`/`project` vía `parent_id`. El diseño
  (§6.3) exige aceptar/editar/descartar viñeta por viñeta: sin esto, es imposible.
- **`translated_from`** vincula el item en EN con su original en ES. Sin esto, el soporte bilingüe
  **reintroduce exactamente la deriva que el producto existe para matar**.
- **No hay columna `has_metric` calculada.** Una regex de dígitos marca "desde 2019" y "Python 3"
  como métricas: **mentiría**. La detección de cifra se hace en la capa de aplicación, sobre el texto
  **efectivo** (que puede ser un override), y **se le muestra al usuario para que él juzgue** — nunca
  como un porcentaje agregado.

## 2.3 Staging — nada entra al master sin que el usuario lo acepte

```sql
create type staged_status as enum ('pending','accepted','rejected','merged');

create table staged_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  source_id    uuid not null references ingestion_sources(id) on delete cascade,
  kind         item_kind not null,
  parent_staged_id uuid references staged_items(id) on delete cascade,  -- viñeta → su rol
  data         jsonb not null,
  lang         text not null default 'es',

  evidence_snippet  text,
  evidence_page     int,
  evidence_verified boolean not null default false,   -- ¿aparece literal en raw_text? ← §4.4

  status       staged_status not null default 'pending',
  duplicate_of uuid references profile_items(id) on delete set null,
  merge_proposal jsonb,          -- fusión propuesta, campo por campo. La decide el USUARIO.
  promoted_to  uuid references profile_items(id) on delete set null,
  created_at   timestamptz not null default now()
);
```

## 2.4 Ofertas y variantes

```sql
-- job_descriptions ANTES que cv_variants: hay un FK.
create table job_descriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text,
  company    text,
  source_url text,
  raw_text   text not null,
  jsonld     jsonb,      -- schema.org/JobPosting si venía embebido
  keywords   jsonb,      -- [{term, kind:'hard'|'soft'}]
  created_at timestamptz not null default now()
);

create table cv_variants (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  profile_id   uuid not null references master_profiles(id) on delete cascade,
  name         text not null,          -- "Backend — Fintech"
  target_title text,                   -- ★ el job title objetivo. 10,6x. SE IMPRIME EN EL PDF.
  lang         text not null default 'es',
  template     text not null default 'ats-default',
  job_id       uuid references job_descriptions(id) on delete set null,
  archived     boolean not null default false,
  master_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ★★★ LA TABLA CLAVE ★★★
create table variant_items (
  id         uuid primary key default gen_random_uuid(),
  variant_id uuid not null references cv_variants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,

  -- ON DELETE RESTRICT, no CASCADE: borrar un item del master NO puede destruir en silencio
  -- el override que el usuario escribió. Se le avisa y él decide. (Ver §2.6)
  item_id    uuid not null references profile_items(id) on delete restrict,

  visible    boolean not null default true,
  sort_order int not null default 0,

  -- ★ OVERRIDE POR CAMPO, no un solo texto.
  --   Un 'work' tiene position/company/dates dentro de data. Necesitas poder sobrescribir
  --   SOLO el position para una variante — que es LITERALMENTE el feature del 10,6x:
  --   "Backend Engineer (Ingeniero de Software III)".
  --   null / '{}' ⇒ hereda del master y se actualiza solo cuando el master cambia.
  override_data jsonb,

  -- ★ PROCEDENCIA DEL OVERRIDE. Esto es lo que se IMPRIME en el PDF:
  --   sin esto, la trazabilidad se rompe justo en la capa que produce el documento.
  override_origin item_origin,                -- null si no hay override
  override_source_item uuid references profile_items(id) on delete set null,
  override_reason text,
  override_verified boolean not null default false,  -- ¿preserva los hechos del original? §6.2

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, item_id)
);

create index on variant_items (variant_id, sort_order);
```

## 2.5 Ajustes de usuario

```sql
create table user_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  ui_lang       text not null default 'es',
  theme         text not null default 'dark',    -- obsidiana | porcelana
  llm_api_key   text,                            -- BYOK. CIFRADO. Nunca se devuelve al cliente.
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

## 2.6 Triggers y sincronización

```sql
-- 1) updated_at automático en TODAS las tablas que lo tengan.
--    Sin esto, el feature de sincronización NO FUNCIONA (los timestamps nunca cambian).
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;
-- ... crear el trigger BEFORE UPDATE en cada tabla con updated_at.

-- 2) Tocar el master cuando cambia CUALQUIER item suyo.
create or replace function touch_master() returns trigger as $$
begin
  update master_profiles set updated_at = now()
   where id = coalesce(new.profile_id, old.profile_id);
  return coalesce(new, old);
end;
$$ language plpgsql;
-- ... trigger AFTER INSERT/UPDATE/DELETE en profile_items.
```

**Una variante está desactualizada si:**

```sql
exists (
  select 1 from variant_items vi
    join profile_items pi on pi.id = vi.item_id
   where vi.variant_id = v.id
     and pi.updated_at > v.master_seen_at
)
```

**Es un OR sobre los items, no un AND con `master_profiles.updated_at`.** El caso común (editas una
viñeta) toca `profile_items`, no el master — con un AND, la variante **nunca** se marcaría
desactualizada y el feature diferencial del producto sería un adorno muerto.

**Al mostrar el diff:** *"Actualizaste tu cargo en Acme. 3 variantes usan ese rol."* Con acción de
**revisar y aceptar**. **Nunca apliques en silencio** — el usuario pudo haber overrideado ese texto
a propósito, y pisarlo sería traicionar la única promesa del producto.

**Al borrar un item del master que alguna variante usa:** el `ON DELETE RESTRICT` hace que la
operación falle. **Cáptalo y pregunta**: *"Este rol lo usan 2 variantes, y en una lo reescribiste.
¿Lo quito de ellas (se pierde tu texto adaptado) o lo dejo?"*

## 2.7 RLS — obligatorio, en todas las tablas

```sql
alter table <cada_tabla> enable row level security;

create policy "own rows" on <cada_tabla>
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- `user_id` está **denormalizado a propósito** en cada tabla: evita joins en las políticas de RLS,
  que son un desastre de rendimiento. Manténlo consistente con triggers.
- ⚠️ **`with check (user_id = auth.uid())` NO impide insertar un `item_id` ajeno** en `variant_items`
  (los FK no pasan por RLS). Añade un **trigger de pertenencia** que verifique que el
  `profile_items.user_id` del `item_id` coincide con `auth.uid()`. Si no lo haces, tienes un
  IDOR silencioso.
- **Storage:** bucket privado, path `{user_id}/{source_id}/{filename}`, policy comparando el primer
  segmento contra `auth.uid()`. URLs firmadas con expiración corta.

---

# 3 · Serialización a JSON Resume

El modelo interno es un **superset**. JSON Resume es solo el **formato de exportación**:

```
profile_items + variant_items → serializer → resume.json (JSON Resume v1.0.0)
                                           → <ResumePDF/> (react-pdf)
```

`GET /api/variants/:id/jsonresume`. **No lo uses como modelo interno**: no tiene ningún campo
obligatorio (validación nula) y no modela variantes, ni procedencia, ni visibilidad. Es un formato
de intercambio y como tal vale (portabilidad + anti-lock-in). Nada más.

---

# 4 · Ingesta con IA

## 4.1 El pipeline

```
1. Cliente pide URL firmada  →  POST /api/sources/upload-url
2. Cliente sube DIRECTO a Supabase Storage         ← NO pasa por Route Handler (límite 4,5 MB)
3. Cliente notifica          →  POST /api/batches/:id/ingest   (maxDuration = 300)
4. Router por tipo — TODOS los caminos producen raw_text ANTES de extraer:
     · PDF con capa de texto → unpdf/pdf.js → raw_text
     · PDF sin capa de texto → páginas a imagen → LLM visión:
                                 ★ PASO 1: TRANSCRIPCIÓN VERBATIM → raw_text
                                 ★ PASO 2: extracción estructurada SOBRE ese raw_text
     · DOCX  → mammoth.js → raw_text
     · Imagen (captura LinkedIn) → mismos dos pasos que el PDF escaneado
     · URL   → JSON-LD si existe; si no, Jina Reader → markdown → raw_text
5. Extracción TROCEADA por sección (§4.3), sobre raw_text
6. Verificación de evidencia (§4.4) → evidence_verified
7. staged_items (con parent_staged_id para las viñetas)
8. Detección de duplicados contra el master → duplicate_of + merge_proposal
9. Usuario revisa en /app/sources/:id/review → acepta / edita / descarta / fusiona
10. SOLO al aceptar → INSERT en profile_items
```

> ### ★ El paso de transcripción verbatim no es negociable
>
> Es tentador mandarle la captura de LinkedIn al modelo multimodal y pedirle el JSON directamente.
> **No lo hagas.** Sin `raw_text`, **la verificación de evidencia (§4.4) no puede correr** — y quedaría
> desactivada precisamente en las fuentes con **mayor** riesgo de alucinación, que son las imágenes,
> que son la capacidad estrella del producto.
>
> Dos llamadas: primero *"transcribe literalmente todo el texto visible"*, después extrae sobre esa
> transcripción. Cuesta unos céntimos más y es lo que hace verdadera la promesa entera.

**Regla inviolable: nada escribe en `profile_items` sin pasar por `staged_items` y una acción
explícita del usuario. Ni siquiera los `basics`.**

## 4.2 Progreso en vivo

El diseño (§6.2) exige progreso **específico y verdadero** ("Leyendo página 2 de 3…", "Encontré 4
experiencias…"). Emite filas en `ingestion_events` y transmítelas al cliente por **SSE** (o polling).

**Prohibido inventar un porcentaje.** Si no sabes cuánto falta, **di qué estás haciendo.** La barra
vacía es honesta; el 47% falso no lo es.

## 4.3 ⚠️ La trampa que te va a explotar en producción

**Claude structured outputs: límite duro de 24 parámetros opcionales por schema.** Un schema de CV
completo **lo revienta** → `400 — Schema is too complex for compilation`.

**Trocea desde el día 1. No lo descubras en producción.**

```ts
// ❌ MAL — un schema gigante. Se rompe.
const ResumeSchema = z.object({ basics, work, education, skills, projects, ... })

// ✅ BIEN — una llamada por sección, schemas pequeños, en paralelo
const BasicsSchema    = z.object({ /* ... */ })
const WorkSchema      = z.object({ items: z.array(WorkItem) })   // WorkItem incluye bullets[]
const EducationSchema = z.object({ items: z.array(EduItem) })
const SkillsSchema    = z.object({ items: z.array(SkillItem) })
const ProjectsSchema  = z.object({ items: z.array(ProjectItem) })
```

- **Prefiere `required` con `null` explícito a campos opcionales.** Cada opcional casi duplica parte
  del espacio de estados de la gramática compilada.
- `minimum` / `maxLength` **no están soportados**. **Usa el SDK** (los mueve a la `description` y
  valida después). No llames por HTTP crudo.
- La gramática se **cachea 24 h**: la primera llamada con un schema nuevo tiene latencia extra. **No
  lo confundas con un bug.**
- **Gemini:** sin `$ref`, `oneOf`, `allOf` ni recursión. Máximo 2 niveles de anidamiento.

## 4.4 Evidencia y confianza

Cada item extraído **debe** traer su `evidence_snippet`. Pídeselo al modelo en el schema:

```ts
evidence: z.string().describe(
  "El texto EXACTO del documento fuente del que extrajiste esto. Copia literal, sin parafrasear."
)
```

**Y verifícalo en el servidor:**

```ts
// ★ El detector de alucinación. Es binario, es gratis, y es HONESTO.
const verified = normalize(rawText).includes(normalize(item.evidence))
// normalize: colapsa espacios, minúsculas, quita puntuación de borde
```

> ### ★ NO le pidas al modelo un `confidence` numérico
>
> Un número que el LLM se auto-asigna, mostrado al usuario como si fuera una medición, es
> **estructuralmente el mismo pecado que el "ATS score"** que este producto condena. *"Confianza:
> 87%"* es una mentira con decimales.
>
> **La señal honesta ya la tienes, y es binaria:** ¿el `evidence_snippet` aparece literalmente en el
> `raw_text`? Sí → verificado. No → **no verificado, y la UI lo muestra distinto** (el diseño tiene
> el lenguaje visual para esto en `03-componentes/`).
>
> Si el diseño pide tres niveles (alta/media/baja), **derívalos de hechos verificables**, no del
> modelo: `verificado` / `verificado parcialmente (coincidencia difusa)` / `sin evidencia`.

## 4.5 Deduplicación

Si el usuario sube CV + LinkedIn, el mismo trabajo aparece dos veces, redactado distinto. **Este es
el problema que va a consumir más tiempo del que esperas.** Planifícalo.

1. **Match determinista primero:** normaliza el nombre de la empresa (quita `S.A.`/`SpA`/`Ltda.`/`Inc.`)
   + solapamiento de rango de fechas. Barato.
   ⚠️ **Normaliza solo para COMPARAR. Persiste la forma con identificador legal** — Greenhouse la
   necesita, y el chequeo de salud (§7) la exige. Sería absurdo que el producto se marcara a sí mismo
   en falta.
2. **LLM solo para candidatos ambiguos**, y solo para **proponer** una fusión campo por campo.
3. **La fusión la decide el usuario, siempre.** Nunca fusiones en automático.

## 4.6 Latencia — sé honesto con el presupuesto

Una fuente = 1 transcripción (si es imagen) + 5 llamadas de extracción troceada + verificación. Tres
fuentes en paralelo, con la gramática fría la primera vez. **Eso no cabe en 60 segundos de forma
fiable.**

**No prometas un SLA que no puedes cumplir.** `maxDuration = 300`, procesa las fuentes **en paralelo**,
emite eventos de progreso, y **diseña la espera** (el diseño ya lo hizo: §6.2). El criterio de
aceptación correcto está en §10, y habla del **staging** poblado, no del master.

---

# 5 · El PDF

## 5.1 `@react-pdf/renderer` — no Puppeteer

**Justificación completa en `00-INVESTIGACION.md` §8.** Resumen: ~2 MB de bundle (vs ~50 MB y cold
starts de segundos de Chromium), capa de texto real con fuentes embebidas, y **el mismo árbol de
componentes sirve para el preview en el cliente (`usePDF`) y para el export en el servidor
(`renderToBuffer`) → cero deriva entre lo que el usuario ve y lo que descarga.** Reactive Resume
migró exactamente a esto y eliminó Chromium por completo.

Lo único que pierdes es CSS avanzado y multicolumna — **que es precisamente lo que rompe el ATS**.

## 5.2 Las trampas de react-pdf v4 (documentadas — no las redescubras)

```ts
// ✅ Font.register() A NIVEL DE MÓDULO. NUNCA dentro del componente ni del handler.
//    Hay race conditions documentadas en renders concurrentes.
//
// ⚠️ QUÉ FUENTES REGISTRAR: lo decide 05-documento-cv/decision-tipografica.md.
//    El diseño elige entre Playfair+Geist+GeistMono ("Editorial"), solo Geist ("Instrumento")
//    o un híbrido. NO ASUMAS. Lee el archivo y registra lo que diga.
Font.register({ family: '<según decision-tipografica.md>', fonts: [
  { src: path.join(process.cwd(), 'assets/fonts/<...>.ttf'), fontWeight: 400 },
]})
// Registra .ttf — NO .woff2 (react-pdf no lo maneja bien).
```

- **Pinea la versión exacta**, sin `^`. Hay regresiones entre minors: `renderToStream` roto en
  algunas 4.x (#2940), `unitsPerEm undefined` al registrar fuentes (#3111), `lineHeight` en `<Page>`
  rompiendo el layout en 4.1.3+ (#2988). **Elige la última 4.x estable, verifica que el round-trip
  pasa, y pínea ESA.**
- **No hay `position: absolute`.** Todo es flexbox anidado. Para un CV de una columna, irrelevante.
- **No genera Tagged PDF / PDF-UA** (issue #3179). **No es bloqueante**: los ATS no dependen del
  tagging, dependen del orden del content stream. Anótalo como deuda técnica.
- Pon `Title` y `Author` en los metadatos. Algunos parsers los usan como fallback del nombre.
- **El `target_title` de la variante se imprime** como segunda línea bajo el nombre. Ver
  `ESPECIFICACION.md`. Si no se imprime, el 10,6x no se captura y el feature es decorativo.

## 5.3 ★ El test ATS round-trip — el corazón de la calidad

**Impleméntalo en la Fase 1, no al final.** Es a la vez el test de CI y el feature más vendible.

**El fixture ya existe y te lo da el diseño:**
- `05-documento-cv/datos-ejemplo.json` — el perfil de entrada
- `05-documento-cv/cv-texto-plano.txt` — **el golden file**: exactamente el texto que un parser debe
  extraer del PDF renderizado desde ese JSON

```ts
// tests/ats-roundtrip.test.ts
// 1. Renderiza el PDF desde datos-ejemplo.json
// 2. Re-parséalo con unpdf/pdf.js → texto plano
// 3. Compara contra cv-texto-plano.txt (el golden file del diseño)
// 4. Y asegura además:
//    · nombre, email y teléfono presentes, EN EL CUERPO (no en header/footer)
//    · cada job title, empresa, fecha y skill aparece LITERAL
//    · el ORDEN de lectura es el orden lógico (nada de columnas revueltas)
//    · el texto es seleccionable (no es una imagen)
//    · no hay basura de embedding ("M a n a g e m e n t", "Nbobhfnfou")
//    · si el diseño usa dos fuentes en la misma línea (cifras en mono),
//      VERIFICA que no se peguen ("ventas25%") ni se separen ("2 5 %")
// 5. Si algo falla → FALLA EL BUILD.
```

**Y expón exactamente esto en la UI** (`/app/variants/[id]`, toggle "Cómo lo lee el ATS"): generas el
PDF, lo re-parseas, y muestras **el texto plano real**. No una simulación. Nadie más hace esto: es tu
foso.

## 5.4 Reglas del renderer

Una columna · cero tablas · cero headers/footers (**el contacto va en el cuerpo**) · cero iconos
(`Email:` con letras) · cero fotos · cero gráficos · alineado a la izquierda · fechas a la derecha
**con flexbox, no con tabla** · sin justificar · **< 2,5 MB** (el único umbral con fuente:
Greenhouse; en la práctica pesará decenas de KB, pero **no conviertas eso en una regla de ATS**).

**Advertencia de página 3.** 1 y 2 páginas son igual de válidas (la evidencia prefiere 2 páginas
2,3x). La 3 se advierte con firmeza y sin dramatismo.

**Sigue `ESPECIFICACION.md` al pt.** Si un valor no está ahí, **no inventes**: para, anótalo en un
`PREGUNTAS-DISENO.md` en la raíz del repo, implementa el valor más conservador, y **deja un `TODO`
visible**. No lo entierres.

---

# 6 · Tailoring — con trazabilidad o no existe

```
POST /api/variants/:id/tailor   { jobText: string }

1. Parsear la oferta → job_descriptions (intenta JSON-LD JobPosting primero: gratis y exacto)
2. Extraer keywords → [{term, kind:'hard'|'soft'}]
3. Cruzar contra: (a) los items de ESTA variante  (b) TODOS los items del master
4. Devolver tres grupos — y la distinción es la ética del producto:

   ✅ "Ya está en esta variante"
   🔵 "Lo tienes en el master, pero no en esta variante"  → acción: añadir (un clic). HONESTO.
   ⚪ "No lo tienes en ninguna parte"                      → ★ NO OFRECER AÑADIRLO ★
                                                             Copy honesto: 06-handoff/copy.md

5. Sugerencias, todas con item_id trazable:
     · target_title alineado al del aviso   (10,6x — el mayor ROI del producto)
     · reordenamiento de viñetas del rol más reciente
     · reformulación → SIEMPRE {item_id, original, propuesto}
```

## 6.1 Reglas duras

- **La IA solo puede seleccionar, reordenar y reformular items que EXISTEN en el master.** Impón esto
  en el prompt **y verifícalo en el servidor**.
- **Nunca apliques en bloque.** Cada reformulación se acepta o rechaza una a una, con el original a
  la vista.
- **Prohibido el keyword stuffing.** Documentado: sube el match con la máquina y **hunde el CV con el
  humano**.
- **Filtro anti-"suena a IA"**: rechaza *potenciar sinergias, impulsar la excelencia, gestión
  integral* (ES) · *delve, tapestry, leverage, spearheaded, robust, seamless* (EN). Detecta también
  cuando **todas** las viñetas quedan con la misma estructura sintáctica: es la señal delatora #1, y
  el 33,5% de los hiring managers la caza en 20 segundos.

## 6.2 ★★ Verificación de preservación de hechos — el control que de verdad importa

**Comprobar que la propuesta trae un `item_id` válido NO ES SUFICIENTE, y es un error fácil de
cometer.** Verifica la procedencia del *hueco*, no la del *contenido*: una reformulación que inserte
*"aumenté un 25%"* donde el original **no tenía ninguna cifra** trae un `item_id` perfectamente
válido y **pasa ese control sin despeinarse**. La lista negra léxica tampoco la detecta: bloquear
*spearheaded* no hace nada contra una métrica inventada.

**Este es el agujero por donde se cuela la alucinación en un producto que promete que no habrá
ninguna. Ciérralo:**

```ts
// Antes de mostrar CUALQUIER reformulación al usuario:
function preservesFacts(original: string, proposed: string, evidence: string): boolean {
  // 1. Todo NÚMERO en `proposed` debe existir en `original` o en `evidence`.
  //    Cifras nuevas = invención. Sin excepciones.
  // 2. Toda ENTIDAD NOMBRADA en `proposed` (empresas, tecnologías, productos)
  //    debe existir en `original` o en `evidence`.
  // 3. Las unidades y magnitudes no pueden cambiar (25% ≠ 25x ≠ 250).
}
// Si no preserva → NO se muestra como sugerencia aceptable.
//                  Se marca override_verified = false y la UI lo señala en rojo.
```

**Escribe un test que intente colar una reformulación con una cifra nueva y verifique que el servidor
la rechaza.** Es el test más importante del producto: **es la promesa entera, en código.**

---

# 7 · Chequeo de salud (no un score)

`GET /api/variants/:id/health` → una lista de reglas, **cada una con su fuente**. Sin porcentajes,
sin barras, sin "87/100", **sin umbrales inventados**.

```ts
type HealthCheck = {
  rule: string
  status: 'warn' | 'fail'      // ← nota: NO hay 'pass'. Ver abajo.
  message: string              // de 06-handoff/copy.md, ES/EN
  source: string               // "Greenhouse — Unsuccessful resume parse"
  itemIds?: string[]           // a qué items apunta, para poder navegar allí
}
```

> ### ★ Solo comprueba lo que puede fallar
>
> El renderer **garantiza por construcción**: una columna, sin tablas, sin headers/footers, sin foto,
> texto seleccionable, sección Skills presente. **Listar seis ✓ perpetuos es teatro de tranquilidad**
> — exactamente el humo que este producto promete no vender.
>
> Esas garantías estructurales van en **una nota discreta**, una sola vez: *"Esta plantilla cumple
> por construcción: 1 columna, sin tablas, sin headers, texto real, fuentes embebidas."*
>
> **El chequeo solo evalúa lo que depende del contenido del usuario** — y por tanto puede estar mal:

| Regla | Fuente |
|---|---|
| Viñetas **sin ninguna cifra** → se listan una por una | 58,2% de reclutadores prioriza el logro medible. **Sin umbral ni porcentaje.** |
| `target_title` ausente o distinto del título del aviso | 10,6x |
| Empresas sin identificador legal ("Acme" → "Acme SpA") | Greenhouse |
| Cargos abreviados ("Sr. Eng." → "Senior Engineer") | Greenhouse |
| Viñetas que empiezan con "Responsable de" / "Encargado de" | Fórmula XYZ (Bock) |
| **3+ páginas** | El tiempo del reclutador en la página 3+ es residual (Ladders) |
| Foto / edad / estado civil presentes (perfil CL) | Robert Walters Chile + Greenhouse |
| Skills declaradas que no aparecen en ninguna viñeta ni tienen evidencia | Anti-inflación (32% admite declarar skills que no tiene) |
| Contacto incompleto (sin email o sin teléfono) | Es el riesgo real: existir y ser inalcanzable |

---

# 8 · Landing, pricing y quién paga la IA

`01` §6.1 diseña una landing pública con **demo del momento mágico sin registro** y **precio
honesto**. Resuélvelo así:

- **La demo pública NO llama al LLM.** Es una reproducción **pregrabada** de la extracción, con datos
  de ejemplo. Misma coreografía visual, cero coste, cero superficie de abuso. Una demo pública que
  invoca un LLM es una factura abierta y un imán de bots.
- **La descarga del PDF es siempre gratis.** Es la promesa anti-dark-pattern (§1.6 del diseño). No la
  rompas.
- **Lo que se cobra es la IA** (ingesta y tailoring), porque es lo que cuesta dinero real.
- **BYOK** (`user_settings.llm_api_key`): cifrado en reposo, **nunca devuelto al cliente**, usado solo
  server-side. Es un feature de confianza y encaja con la tesis del producto.
- **Rate limiting** en todas las rutas de IA. Son caras y las va a abusar un bot.

---

# 9 · Seguridad y privacidad

- **RLS en todas las tablas.** Con un test: crea dos usuarios, intenta leer los datos del otro,
  espera que falle. **Incluye el caso IDOR de `variant_items` (§2.7).**
- **Storage privado**, URLs firmadas de expiración corta.
- **Ninguna clave de IA en el cliente.** Todas las llamadas pasan por Route Handlers.
- **"Exportar todo" y "Borrar todo"** en settings. Es un CV: son datos personales, y el producto se
  vende sobre la honestidad. **No caigas en el pecado que criticas.**
- **Nunca loguees** el contenido de un CV ni el texto de una oferta. Loguea IDs.

---

# 10 · Orden de implementación

**No construyas todo a la vez.** Cada fase funciona y está testeada antes de la siguiente.

### Fase 0 — Cimientos
Next.js 15 + TS estricto + Tailwind v4 con `tokens.css`/`tokens.json`/`densidad.md`. Supabase: auth,
migraciones **en el orden del §2**, **RLS con su test (incluido el IDOR)**. Shell y navegación. Temas
Obsidiana/Porcelana. i18n ES/EN desde `06-handoff/copy.md`.

### Fase 1 — El PDF, primero que nada
**Contraintuitivo pero correcto: el renderer va antes que el editor.** Define si el producto tiene
sentido, y el round-trip te atrapa errores de diseño cuando aún son baratos.

`<ResumePDF/>` según `ESPECIFICACION.md` y `decision-tipografica.md` · fuentes embebidas · **el test
round-trip contra el golden file, en CI** · preview cliente + export servidor desde el mismo
componente.

> **Puerta de salida:** renderizas `datos-ejemplo.json`, re-parseas el PDF, y coincide con
> `cv-texto-plano.txt`. **Si esto no pasa, no sigas.** Vuelve a diseño.

### Fase 2 — El master
CRUD de `profile_items` con edición inline · procedencia visible en cada item · búsqueda y filtrado ·
serializador a JSON Resume.

### Fase 3 — Las variantes
`cv_variants` + `variant_items` · el editor de 3 paneles · **override por campo** (§2.4) · drag &
drop **con alternativa de teclado** (a11y: requisito, no extra) · overrides visibles y revertibles ·
el toggle "Cómo lo lee el ATS" · contador de páginas con advertencia en la 3.

### Fase 4 — La ingesta (el diferenciador)
Subida directa a Storage · router por tipo **con transcripción verbatim para imágenes** · extracción
troceada · **verificación de evidencia** · staging con jerarquía (`parent_staged_id`) · dedup ·
progreso real vía `ingestion_events` · **y el shimmer dorado al terminar** (el único momento de
celebración del producto — no lo gastes en otro lado).

### Fase 5 — Tailoring + salud
Parseo de la oferta · los tres grupos · **la verificación de preservación de hechos (§6.2)** ·
sugerencias trazables · chequeo de salud.

### Fase 6 — Sincronización
El diff master↔variantes · "3 de tus 7 variantes están desactualizadas" · revisar y aceptar · el
caso de borrado con `ON DELETE RESTRICT`.

### Fase 7 — Landing, pulido, deploy
Landing con demo pregrabada · estados vacíos/error/carga (**están todos en el diseño — úsalos, no los
improvises**) · **auditoría WCAG 2.1 AA real, no declarada** · e2e con Playwright · Vercel con Fluid
Compute.

---

# 11 · Criterios de aceptación

> Estos son los criterios **técnicos**. Los criterios de **diseño** están en
> `06-handoff/criterios-aceptacion.md` y son igual de obligatorios. **Ambos deben pasar.**

1. **El round-trip ATS pasa en CI** contra el golden file del diseño, y si alguien rompe el renderer,
   **el build falla**.
2. Un usuario sube un PDF + una captura + una URL, y obtiene un **staging poblado**, con **cada item
   mostrando de dónde salió** y si su evidencia está verificada.
   *(Nota: **staging**, no master. El master requiere que el humano acepte — y revisar 60–100 items
   no es cosa de 60 segundos. Un criterio de velocidad sobre el master te empujaría a auto-poblarlo,
   que es romper el producto.)*
3. **Ningún item llegó al master sin que el usuario lo aceptara. Ni siquiera los `basics`.** Con test.
4. Cambias un dato en el master → **todas las variantes lo reflejan**, salvo donde hay override. Y la
   app te dice **qué** variantes cambiaron. Con test sobre los triggers de `updated_at`.
5. El toggle "Cómo lo lee el ATS" muestra el texto **real** extraído del PDF **real**.
6. **Test:** una reformulación de la IA que introduce una **cifra que no está en el original ni en la
   evidencia** es **rechazada por el servidor** (§6.2). ← *El test más importante del producto.*
7. **Test:** una sugerencia sin `item_id` válido y perteneciente al usuario es rechazada.
8. **No existe ningún número sin fuente en toda la UI.** Ni score, ni % de match, ni umbral de
   viñetas, ni `confidence` auto-asignado por el LLM. **Búscalos con grep y elimínalos.**
9. **RLS testeado**, incluido el IDOR de `variant_items`: el usuario A no puede leer **ni referenciar**
   nada del usuario B.
10. **WCAG 2.1 AA:** el editor de 3 paneles es **operable enteramente por teclado**, incluido el
    reordenamiento.
11. El PDF se abre en Acrobat, Preview y Chrome con el **texto seleccionable**, y el `target_title` de
    la variante **aparece impreso** bajo el nombre.
12. `PREGUNTAS-DISENO.md` está **vacío o resuelto** antes del deploy final.

---

# 12 · Cómo trabajar

- **Lee el diseño antes de codear.** El copy está escrito, en ES y EN. **No lo improvises**: el copy
  de este producto *es* el producto. Si lo improvisas, va a sonar a Jobscan.
- **Commits pequeños, en español, descriptivos.**
- Si algo del diseño es inviable, **dilo y propón la alternativa antes de implementarla.** No te
  desvíes en silencio.
- Si te falta un dato sobre ATS, reclutadores o formato: **está en `00-INVESTIGACION.md`**. Si no
  está ahí, **no lo inventes** → `PREGUNTAS-DISENO.md`.
- **Cuando dudes entre "impresionante" y "verificable", elige verificable.** Ese es todo el producto.

---

> ### Recordatorio final
>
> El mercado está lleno de herramientas que le mienten al usuario con un score de humo y le inventan
> skills que no tiene. Nosotros construimos lo contrario: **una herramienta que solo dice cosas que
> puede demostrar.**
>
> Si estás a punto de escribir un número que no puedes justificar, o de dejar que la IA escriba una
> línea que el usuario no puede rastrear hasta algo que él mismo dijo — **no lo hagas.**
>
> Ese es el producto entero. Todo lo demás es implementación.
