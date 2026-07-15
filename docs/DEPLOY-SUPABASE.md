# Puesta en marcha: Supabase + variables + GitHub OAuth + Vercel

Todo lo que TÚ ejecutas (yo no tengo acceso a tu base ni a tu panel). Orden recomendado.

---

## 1 · Aplicar el esquema en Supabase

1. Panel de Supabase → **SQL Editor** → **New query**.
2. Abre `supabase/migrations/0001_schema.sql` en el repo y **pega su contenido completo**. Ejecuta (**Run**).
   - Es idempotente en RLS/policies/trigger de alta, pero los `create type`/`create table` NO: **pégalo una sola vez sobre un proyecto limpio.** Si ya lo corriste y quieres repetir, primero borra el esquema o crea un proyecto nuevo.
3. **NO ejecutes `0002_user_state.sql`.** Es el modelo viejo (una fila jsonb por usuario) del diseño anterior; el modelo real es `0001`. Ignóralo.

Lo que crea `0001`, y que conviene verificar:
- Tablas: `master_profiles`, `profile_items`, `staged_items`, `cv_variants`, `variant_items`, `ingestion_sources`, `ingestion_events`, `ingestion_batches`, `job_descriptions`, `user_settings`.
- **RLS activada en todas** con la política `own rows` (`user_id = auth.uid()`).
- **Trigger anti-IDOR** en `variant_items` (`check_variant_item_ownership`): impide referenciar un item de otro usuario (un FK no pasa por RLS).
- **Trigger de alta** `on_auth_user_created`: cada usuario nuevo nace con su `master_profiles` + `user_settings`.
- **Bucket privado `sources`** (Storage) con policy por carpeta = `auth.uid()`.

Verificación rápida (pégalo en el SQL Editor y corre):
```sql
select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;
-- rowsecurity debe ser true en todas.
select tgname from pg_trigger where tgname in ('on_auth_user_created','t_variant_item_ownership');
select id from storage.buckets where id='sources';
```

---

## 2 · Variables de entorno

`.env.local` en local (copia de `.env.local.example`). En Vercel, las mismas en **Project Settings → Environment Variables**. Correspondencia (tu lista, confirmada — **no falta ninguna**):

| Variable | De dónde | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings → API** → Project URL | pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | misma página → `anon` `public` | pública |
| `SUPABASE_SERVICE_ROLE_KEY` | misma página → `service_role` | **SECRETO.** Solo servidor. No lo pegues en el chat: pégalo directo en `.env.local` y en Vercel. |
| `NEXT_PUBLIC_SITE_URL` | tú | `http://localhost:3000` en local · la URL de Vercel en producción |
| `GEMINI_API_KEY` | **Google AI Studio → API keys** | necesaria para la extracción (Fase 2). Modelo `gemini-flash-latest`. |
| `ANTHROPIC_API_KEY` | **console.anthropic.com → API keys** | para el tailoring (Fase 6). El flujo prioritario paste→PDF usa Gemini; puedes dejarla vacía hasta el tailoring. |
| `AI_GATEWAY_API_KEY` | opcional | solo si usas el AI Gateway de Vercel en vez de las keys directas. |

Para el **primer extremo-a-extremo (pegar → staging → aceptar → PDF)** basta con: las 3 de Supabase + `NEXT_PUBLIC_SITE_URL` + `GEMINI_API_KEY`.

> La app tiene modo dual: sin `NEXT_PUBLIC_SUPABASE_*` corre en local (localStorage, sin login). Con ellas, exige sesión para `/app`. Al pasar a Supabase se empieza con una cuenta nueva (los datos de localStorage no migran solos).

---

## 3 · GitHub OAuth (pantalla "Fuentes", Fase 5)

Es un **proveedor de Supabase**, no una integración aparte en la app. Pasos:

1. **GitHub** → Settings → Developer settings → **OAuth Apps** → *New OAuth App*:
   - *Homepage URL*: tu `NEXT_PUBLIC_SITE_URL`.
   - *Authorization callback URL*: **`https://<TU-PROJECT-REF>.supabase.co/auth/v1/callback`** (lo da Supabase → Authentication → Providers → GitHub).
   - Guarda y copia **Client ID** y genera un **Client Secret**.
2. **Supabase** → Authentication → **Providers → GitHub** → pega Client ID + Secret → **Enable**.
   - Scopes: para leer repos en "Fuentes", añade `read:user public_repo` (usa `repo` solo si necesitas privados).
3. **No añade variables de entorno a la app.** El login se hace con `supabase.auth.signInWithOAuth({ provider: 'github' })` y Supabase gestiona el token.

> El flujo prioritario (pegar un link `github.com/usuario`) usa la **API pública** de GitHub y **no necesita OAuth**. OAuth es solo para conectar tu cuenta y leer tus repos desde "Fuentes".

Además, en Supabase → Authentication → **URL Configuration**: añade tu URL de Vercel a *Site URL* y a *Redirect URLs* (para los redirects de email/OAuth en producción).

---

## 4 · Despliegue en Vercel

1. **Importa el repo** de GitHub en Vercel (framework: Next.js, se detecta solo).
2. **Fluid Compute:** Project Settings → **Functions** → activa *Fluid Compute*. La ruta de ingesta declara `maxDuration = 300` (esperar el I/O del LLM no cuenta como Active CPU → timeouts generosos salen baratos).
3. **Variables de entorno** (Project Settings → Environment Variables) — pega estas, mismos nombres que `.env.local`:
   - [ ] `NEXT_PUBLIC_SUPABASE_URL`
   - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - [ ] `SUPABASE_SERVICE_ROLE_KEY`  ← secreto
   - [ ] `NEXT_PUBLIC_SITE_URL` = la URL de producción de Vercel
   - [ ] `GEMINI_API_KEY`
   - [ ] `ANTHROPIC_API_KEY` (cuando llegues al tailoring)
   - marca las tres claves secretas como *Sensitive*.
4. **Deploy.**

### Qué verificar en el primer deploy (que la app levanta con auth real)

1. Abrir la URL → redirige a **`/login`** (la raíz `/` y `/auth` redirigen a `/login`).
2. **Crear cuenta** → en Supabase → Table editor: aparece una fila en `auth.users` **y** una en `master_profiles` **y** una en `user_settings` (lo hace el trigger de alta). Si no aparecen las de `public`, el trigger `on_auth_user_created` no se aplicó → re-corre esa parte de `0001`.
3. **Entrar** → te lleva a **`/app`** (dashboard). Cerrar sesión y visitar `/app` directo → te devuelve a `/login` (middleware).
4. **PDF:** abre el editor de una variante → *Descargar PDF*. Si el PDF sale vacío o falla, mira **Vercel → Deployment → Functions → Logs** de `/api/cv`: un error "font not found" significaría que las `.ttf` no se trazaron (ya cubierto por `outputFileTracingIncludes` en `next.config.mjs`).
5. **Pegar → staging** (cuando esté cableado): pega un texto con un link de GitHub → revisa que `/api/import/context` responde y que se puebla `staged_items` en Supabase. Necesita `GEMINI_API_KEY`.

> Si algo de esto no calza con lo que ves, dímelo antes de tocar nada: lo reviso.
