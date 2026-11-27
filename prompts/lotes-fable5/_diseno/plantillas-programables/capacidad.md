# Capacidad de los modos de densidad

Generado por `scripts/plantillas/capacidad.audit.ts` (2026-11-27). Capacidad = roles extra (copias de los del fixture, con sus viñetas) que caben en **2 páginas reales** sobre `datos-ejemplo.json`, medido renderizando el PDF. En las dos últimas columnas, además, «pág.» = lo que ocupa un documento FIJO (fixture + 8 roles) y la capacidad ganada = ocupación antes ÷ ocupación ahora − 1.

| Base | Base tal cual | sangriaReducida | espacioCompacto | habilidadesEnLinea | fechaLugarDerecha | cabeceraCompacta | Todos los modos | A medida en su límite, antes | A medida en su límite, ahora |
|---|---|---|---|---|---|---|---|---|---|
| `ats-clasica` | 3 | 3 (+0) | 4 (+1) | 4 (+1) | 4 (+1) | 4 (+1) | **5 (+2)** | 7 · 2.08 pág. | **9 (+2) · 1.78 pág. (+17 % de capacidad)** |
| `ats-expediente` | 2 | 2 (+0) | 3 (+1) | 2 (+0) | 4 (+2) | 2 (+0) | **5 (+3)** | 5 · 2.39 pág. | **9 (+4) · 1.77 pág. (+35 % de capacidad)** |
| `ats-veterana` | 4 | 4 (+0) | 5 (+1) | 4 (+0) | — | 5 (+1) | **5 (+1)** | 9 · 1.77 pág. | **9 (+0) · 1.76 pág. (+1 % de capacidad)** |

«—» = el modo no cambia nada en esa base (en la columna colgante la fecha y el lugar ya comparten columna).
«En su límite» = cuerpo 10 pt, interlineado 1,15, márgenes ≥ 12 mm, aire × 0,5, títulos × 0,85 y la caja ensanchada hasta p90 ≈ 86; «ahora» = eso mismo + todos los modos útiles.
