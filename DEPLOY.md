# Despliegue — Vercel · Render · Supabase

## Topología recomendada

```
┌─────────────┐     ┌──────────────────────────┐     ┌────────────────────┐
│  Navegador  │────▶│  App Next.js (Vercel)     │────▶│  Supabase          │
│             │     │  · UI + Route Handlers    │     │  · Postgres (RLS)  │
│             │     │  · react-pdf (server)     │     │  · Auth            │
└─────────────┘     │  · Fluid Compute (LLM I/O)│     │  · Storage privado │
                    └──────────────────────────┘     └────────────────────┘
                              │
                              ▼ (opcional, Fase 4)
                    ┌──────────────────────────┐
                    │  Worker de ingesta        │  ← candidato natural para RENDER:
                    │  (jobs LLM 5–40 s)        │     un worker de larga duración,
                    └──────────────────────────┘     fuera de los límites de función
```

- **Supabase** (obligatorio): Postgres + Auth + Storage. Es el backend de datos.
- **Vercel** (recomendado para la web): despliega Next.js nativo. Activa **Fluid Compute**
  (esperar el I/O de un LLM no cuenta como Active CPU → `maxDuration` generoso barato).
- **Render**: dos usos posibles, **hay que decidir cuál** (ver abajo):
  1. **Hospedar la web** (alternativa a Vercel; `render.yaml` ya está listo para esto), o
  2. **Worker de ingesta** de la Fase 4 (jobs LLM largos), con Vercel sirviendo la web.

> Usar Vercel **y** Render para la *misma* web es redundante. Lo típico: Vercel = web,
> Render = worker; o Render = web (y entonces Vercel sobra). Dime cuál para afinar la config.

## 1 · Supabase (primero — desbloquea las Fases 2-6)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **Aplica el esquema:** panel → **SQL Editor** → pega **`supabase/migrations/0002_user_state.sql`** → Run.
   Ese es el esquema ACTIVO de la app (una fila jsonb por usuario, con RLS). El `0001_schema.sql`
   es el modelo completo del producto futuro (variantes por tabla, ingesta) — **no lo corras aún**.
3. **Auth por correo y contraseña:** panel → **Authentication → Providers → Email** → activado.
   - Para uso personal rápido: **Authentication → Sign In / Providers → Confirm email = OFF**
     (entras al instante sin confirmar por correo). Actívalo si luego quieres más seguridad.
   - No necesitas Google/GitHub OAuth (usamos correo+contraseña).
4. Panel → **Project Settings → API**. Copia:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY` **(secreta)**
4. Pon esos valores en **`.env.local`** (local) y en el panel de Vercel/Render (producción).
   La `service_role` va **solo** como variable de entorno del servidor. Nunca en el cliente, nunca en git.
5. **Storage:** crea un bucket **privado** `sources`. La policy y las URLs firmadas se configuran en la Fase 4.

## 2 · Vercel

- Importa el repo de GitHub en Vercel (framework: Next.js, detección automática).
- **Environment Variables:** las 4 de arriba + `NEXT_PUBLIC_SITE_URL` (la URL del deploy).
- **Settings → Functions → Fluid Compute: ON.** (Y `maxDuration = 300` en la ruta de ingesta, Fase 4.)
- Redeploy. La CI de GitHub (`.github/workflows/ci.yml`) corre typecheck + el round-trip ATS en cada push.

## 3 · Render (según la decisión de arriba)

- **Como web:** conecta el repo; Render detecta `render.yaml`. Rellena las env vars (`sync: false`) en el panel.
- **Como worker (Fase 4):** se añadirá un segundo servicio `type: worker` a `render.yaml` cuando exista el pipeline de ingesta.

## Notas

- Los archivos de usuario **nunca** pasan por una Route Handler (límite 4,5 MB de Vercel): subida
  directa a Supabase Storage con URL firmada (prompt 02 §4.1).
- OAuth (Google/GitHub): configura las **Redirect URLs** en Supabase Auth apuntando a
  `${NEXT_PUBLIC_SITE_URL}/auth/callback` para cada entorno.
