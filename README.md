# Corpus

**El sistema de registro de tu carrera.** Un master profile canónico del que se derivan N variantes de
CV. Las variantes **no copian** el master: lo **referencian**. La IA nunca inventa; cada dato tiene
procedencia. El PDF es texto real, una columna, ATS-parseable.

> Nombre interno / infraestructura: **CANON** (`canon-*`, `window.CANON`). Marca de cara al usuario:
> **Corpus**.

## Estado

**Fase 0 — Cimientos + sistema de diseño vivo** (en curso). Ver
`prompts/08-PROMPT-IMPLEMENTACION-DEFINITIVO.md` para el plan completo por fases.

- ✅ Next.js 15 (App Router) + TypeScript estricto + Tailwind v4
- ✅ Tokens Oro · Obsidiana · Porcelana (`src/styles/tokens.css`) + temas
- ✅ Port del sistema de movimiento vivo (`window.CANON`, clases `c-*` sin cambios) — contrato en
  `Sistema de diseño de productoVFinal/canon-design/06-handoff/handoff.md`
- ✅ La **aurora WebGL** se **monta** y se mueve en `/auth` (gate de salida de Fase 0)
- ⏳ Supabase auth + migraciones + RLS (SQL en `supabase/migrations/`; requiere proyecto Supabase)
- ⏳ i18n ES/EN desde `copy.md`

## Desarrollo

```bash
npm install
cp .env.local.example .env.local   # rellena las claves de Supabase cuando las tengas
npm run dev                        # http://localhost:3000/auth
```

## La fuente de verdad del diseño

`Sistema de diseño de productoVFinal/canon-design/` — las 11 pantallas, los tokens, el kit de
movimiento, el copy ES+EN, el documento CV con su golden file, y los criterios de aceptación.
**El diseño no es una sugerencia: es la especificación.**

## Regla que gobierna todo

Cuando dudes entre "impresionante" y "verificable", elige **verificable**. Ningún número sin fuente;
ninguna línea de IA sin rastro. Ese es el producto.
