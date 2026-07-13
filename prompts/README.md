# CANON — Prompts de construcción

Tres documentos. Léelos en orden.

| Archivo | Para quién | Qué hace |
|---|---|---|
| **`00-INVESTIGACION.md`** | Ambos | La base fáctica. Qué es verdad sobre ATS, reclutadores y el mercado — y qué es mito. **Adjúntalo a los dos prompts.** |
| **`01-PROMPT-DISENO.md`** | Claude Design (Opus 4.8) | Produce el sistema de diseño completo → se empaqueta en `canon-design.zip` |
| **`02-PROMPT-IMPLEMENTACION.md`** | Claude Code (Opus 4.8) | Consume el `.zip` → construye y despliega la app en Vercel |

## El flujo

```
00-INVESTIGACION.md ──┬──> 01-PROMPT-DISENO.md ──> Claude Design ──> canon-design.zip
                      │                                                     │
                      └──> 02-PROMPT-IMPLEMENTACION.md ────────────────────┘
                                          │
                                          v
                                     Claude Code ──> app en Vercel
```

## Paso a paso

**1 · Diseño**
Abre una sesión nueva de Claude (Opus 4.8, esfuerzo máximo). Pega `01-PROMPT-DISENO.md` completo.
Adjunta `00-INVESTIGACION.md` y, si puedes, los archivos de `akhan-design-system/` del portfolio
(`concept.md`, `foundations/color.md`, `foundations/typography.md`, `foundations/motion.md`,
`foundations/spacing-grid.md`).

**2 · Empaquetar**
La salida es una carpeta `canon-design/`. Comprímela como `canon-design.zip`.

**3 · Implementación**
Abre Claude Code en `CV_Controller_IA`. Deja `canon-design.zip` y `00-INVESTIGACION.md` en la raíz.
Pega `02-PROMPT-IMPLEMENTACION.md`.

## Las decisiones que ya están tomadas

- **App bella, documento sobrio.** La aplicación despliega el design system Oro/Obsidiana/Porcelana.
  El CV que genera es una columna, sin iconos, ATS-perfecto. El lujo está en la contención.
- **Ingesta completa desde el MVP:** archivos (PDF/DOCX) + capturas de pantalla + URL de portfolio.
- **App independiente** en `CV_Controller_IA`, deploy propio en Vercel. Hereda los tokens del
  portfolio pero no vive dentro de él.
- **Multi-usuario desde el diseño.** Auth + RLS desde el día 1.

## Lo que hace que esto no sea otro Rezi

1. El master es la **fuente de verdad**; las variantes lo **referencian**, no lo copian.
2. **La IA nunca inventa.** Cada dato tiene procedencia trazable. Lo que no la tiene, se marca.
3. **"Así es como el ATS lee tu CV"** — re-parseamos nuestro propio PDF y se lo mostramos al usuario.
4. **Cero scores inventados.** Solo reglas documentadas, cada una con su fuente.
