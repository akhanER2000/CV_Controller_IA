# Desarrollo local (Supabase en Docker)

Entrar a Corpus en `http://localhost:3000` sin el proyecto remoto de Supabase ni Google/GitHub.

## Requisitos

- Docker Desktop abierto (el script lo comprueba y avisa si no responde).
- CLI de Supabase: en el PATH o en `J:\DevToolsApps\Supabase\supabase.exe`.
- `.env.local` con las claves de IA (Gemini, cifrado). La URL y las claves de Supabase las
  pone el script en el entorno del proceso; no escribe nada en archivos.

## Comando

```
npm run dev:local
```

Levanta Supabase local (puertos 553xx; migraciones 0001 a 0007), crea la cuenta de prueba
si falta y arranca `next dev`. La primera vez descarga imágenes de Docker (varios minutos).
`npm run dev` no cambia: sigue apuntando al remoto.

## Cuenta de prueba

`supabase/cuenta-prueba.json` (email y contraseña sintéticos, solo válidos en el Supabase
local). Entra por `/login` con email y contraseña.

## Cargar el perfil sin IA

Con la cuenta vacía: **Importar → .md**, y sube el dossier del perfil en Markdown.
Ese camino no llama al modelo.

## Parar

Ctrl+C en la terminal detiene Next. Para apagar Supabase y liberar los contenedores:

```
supabase stop
```

Los datos locales persisten entre arranques; `supabase stop --no-backup` los borra.
Studio local: `http://localhost:55323`. API: `http://localhost:55321`.
