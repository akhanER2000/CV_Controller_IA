# Flujo del CV · de la lista de revisión al documento que se decide solo donde hace falta

Lote `flujo-cv-organico` · trabajador `flujo-cv` · 2026-11-21

## 1 · Recorrido del flujo anterior (capturas `flujo-cv-antes-0*.png`)

Recorrido real con Playwright sobre un Supabase local (el remoto no resuelve), persona inventada,
master con huecos conocidos.

| Paso | Qué obliga a hacer | Por qué cansa |
|---|---|---|
| Variantes → «Con IA» / «Desde un aviso» | Crear, leer la tarjeta «creada — revísala», pulsar «abrir» | Una parada intermedia que solo lleva a otra pantalla. |
| Editor, columna central | Título → contacto → diseño → orden de secciones → presentación → **y por fin** el contenido | Lo que se decide (el contenido) queda debajo de cinco tarjetas de configuración. |
| «Ajustar páginas» | Abrir panel → «Analizar» → cuatro listas: quitar, reordenar, acortar, qué falta | Cada propuesta es una tarjeta separada de su viñeta: hay que leer el texto citado y buscar a ojo dónde está en el documento para juzgarla (captura 02). |
| Aceptar / Rechazar | Fila por fila; la fila decidida se queda como «aceptado ✓» | La lista no adelgaza: decidir 4 cosas deja 4 tarjetas muertas que siguen ocupando la columna. |
| «Qué falta» | Una quinta lista, solo visible después de analizar (gasta una llamada al modelo) | Es un hecho comprobable en código, pero se esconde tras la IA y lejos del item (captura 03). |
| Autofit | El cuerpo se ajusta solo, pero el estado es un texto gris junto al selector de páginas | El «sobran ~9 líneas» y el tamaño del cuerpo viven en sitios distintos. |
| Lo verificado | Un acortado aceptado se ve igual que un override manual | Nada distingue «ya pasó el candado» de «esto lo tocó alguien»: invita a revisarlo otra vez. |

Master y Panel no son el cuello: el master es la biblioteca y el panel enlaza. No se tocan.

## 2 · El flujo nuevo: el documento manda

```
Variantes ── crear (IA / aviso) ──► editor directo (las notas de la IA viajan con él)
                                        │
   ┌────────────────── columna central ─┴────────────────────────────────┐
   │ Título objetivo                                                      │
   │ ┌ GUÍA (fija arriba) ────────────────────────────────────────────┐  │
   │ │ ● cabe en 2 págs · cuerpo 10,5 pt   3 huecos · 2 por decidir    │  │
   │ │ [Proponer recortes]  [Siguiente ↓]  [Detalle ▾]                 │  │
   │ └─────────────────────────────────────────────────────────────────┘  │
   │ EXPERIENCIA                                                          │
   │  Backend Engineer · Fintech Andina · 2021–2024                       │
   │   ⠿ Reduje la latencia p95…                                          │
   │   ⠿ Lideré la migración… (largo)               SIN CIFRA             │
   │     ┊ más corto, mismos hechos (−48 car.): «Lideré … plataforma.»    │
   │     ┊                                    [No]  [Usar]                │
   │   ⠿ Mantuve la documentación…                  SIN CIFRA             │
   │     ┊ quitar: es la menos ligada al rol         [Mantener] [Quitar]  │
   │  Desarrolladora · Agencia Sur                  SIN FECHA             │
   │ APTITUDES  Backend 4 ✕   sin respaldo: Go, PostgreSQL, Kafka         │
   │ … contacto · diseño · orden · presentación (configuración, debajo)   │
   └──────────────────────────────────────────────────────────────────────┘
```

**Estados de la guía**

| Estado | Qué dice | Qué ofrece |
|---|---|---|
| midiendo | «midiendo el PDF…» | nada (no hay dato) |
| cabe | «cabe en N págs» (+ «cuerpo X pt» si el autofit encogió) | Proponer recortes queda discreto |
| no cabe | «no cabe en N ni a 10 pt» en brasa | Proponer recortes pasa a botón principal |
| con propuestas | «M por decidir» | Siguiente ↓ salta a la próxima decisión del documento |
| todo decidido | «nada por decidir» | Volver a proponer |

**Qué se decide y cuándo**

1. **Páginas y fuente: nunca.** El autofit corre en cada render del PDF y el resultado se ve en el
   documento y en la guía. Medidas (páginas reales, cuerpo frente al de la plantilla, líneas que
   sobran, propuestas descartadas por el candado, notas) quedan a un clic en «Detalle».
2. **Qué falta: se ve, no se decide.** Sin cifra / sin fecha / sin respaldo se calculan en el
   cliente con la MISMA `calcularFaltas` del servidor, sin IA, y se pintan sobre la viñeta, el rol
   o la aptitud. No llevan botón: lo arregla quien sabe el dato.
3. **Quitar, reordenar, acortar: una a una, en su sitio.** «Proponer recortes» pide la propuesta
   (manual: cuesta una llamada al modelo con la clave del usuario). Cada propuesta aparece bajo su
   item con dos botones. Decidir la hace desaparecer: el cambio se ve en el item y en el PDF.
   No existe «aceptar todo».
4. **Acortar sigue pasando el candado en el servidor** (`accion: 'acortar'` → `verificarAcortado`).
   El texto solo cambia en pantalla cuando el servidor dice que sí.
5. **Lo verificado no exige revisión.** Un override que pasó el candado lleva el sello de oro
   «hechos verificados» y no recibe propuestas nuevas de acortado; sigue pudiendo revertirse.

## 3 · Garantías que no cambian

- Mismos manejadores (`removeItem`, `reorder`, POST `/ajustar` acortar, revertir): mismos
  variant_items y mismo PDF. Lo compara de verdad `tests/e2e/flujo-cv.spec.ts`
  (resultado en `flujo-cv-equivalencia.json`).
- Ningún candado relajado; `src/lib/cv/*` intacto.

## 4 · Capturas

- Antes: `flujo-cv-antes-00-editor.png` … `flujo-cv-antes-03-que-falta.png`.
- Después: `flujo-cv-despues-01-documento.png` … `flujo-cv-despues-05-detalle.png`.
