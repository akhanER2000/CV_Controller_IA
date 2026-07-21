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
2. **Aplica el esquema**, panel → **SQL Editor**, **en este orden y un fichero por ejecución**:
   1. `supabase/migrations/0001_schema.sql` — **el esquema ACTIVO**. Master, items,
      variantes, staging, fuentes y RLS. Sin él, `/api/master`, `/api/variants`,
      `/api/staging`, `/api/sources` y `/api/health/status` fallan enteras.
   2. `0002_user_state.sql` — la fila jsonb por usuario. Convive con 0001; hoy solo la
      usa el store de cliente.
   3. `0003_avatars.sql` — foto y nombre visible del menú (nunca entran al CV).
   4. `0004_item_kind_reference.sql` — añade `'reference'` al enum `item_kind`.
      **Ejecútalo SOLO, sin nada más pegado**: `alter type … add value` no admite
      compañía en la misma transacción.
   5. `0005_reference_links.sql` — la tabla que vincula una referencia con el rol o el
      proyecto que la respalda, con su RLS y su guarda anti-IDOR.

   Todas son idempotentes: re-ejecutarlas no da error. Si `/app/master` responde pero
   sale vacío o con error de tabla, es que falta alguna.

   > Esto reemplaza a la instrucción anterior, que decía que el esquema activo era el
   > `0002` y que el `0001` «no lo corras aún». Era falso desde que las rutas `/api/*`
   > pasaron a leer el modelo relacional, y seguirla dejaba la app a medio funcionar.
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
- **Environment Variables:** las 4 de arriba + `NEXT_PUBLIC_SITE_URL` (la URL del deploy)
  + las de IA y cifrado de la tabla siguiente. La lista completa, con comentarios, está
  en [`.env.local.example`](.env.local.example).

| Variable | ¿Obligatoria? | Sin ella |
| --- | --- | --- |
| `GEMINI_API_KEY` | sí, para la IA | La extracción no funciona salvo que el usuario ponga su propia clave (BYOK). |
| `CORPUS_ENCRYPTION_KEY` | sí, para BYOK | **No se guarda ninguna clave BYOK** y el campo de Ajustes sale cerrado con el motivo. |
| `ANTHROPIC_API_KEY` | no | Nada: hoy ningún código la usa (el panel de salud lo dice tal cual). |
| `AI_GATEWAY_API_KEY` | no | Nada: solo si usas el AI Gateway en vez de las claves directas. |

- **`CORPUS_ENCRYPTION_KEY` — el candado de las claves BYOK.** Son 32 bytes en **base64**
  (AES-256-GCM). Genérala con **uno** de estos dos comandos, que producen exactamente ese
  formato (44 caracteres acabados en `=`):

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  openssl rand -base64 32
  ```

  Pégala en `.env.local` (local) y en Vercel → *Environment Variables* (Production y
  Preview), y **redespliega**. `openssl rand -hex 32` **no vale**: 64 caracteres hex leídos
  como base64 dan 48 bytes y `src/lib/crypto.ts` los rechaza — te quedarías sin cifrado
  creyendo que lo configuraste. Si la pierdes o la cambias, las claves BYOK ya guardadas
  quedan ilegibles: se muestran como *aparcadas* y hay que volver a pegarlas.
- **Clave de Groq (proveedor barato):** no es una variable de entorno. Se guarda por
  usuario y cifrada desde *Ajustes → «Segunda clave»*, y necesita aplicada la migración
  `supabase/migrations/0006_byok_segundo_proveedor.sql` (columna `llm_api_key_2`). Sin
  ella todo va a Gemini: degrada, no rompe — y el panel de salud dice cuál de las dos falta.
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
