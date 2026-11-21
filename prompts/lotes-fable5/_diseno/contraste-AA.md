# Contraste AA · tema Forja (rediseno, cierre C1)

Ratios medidos por `rediseno` (commit 62a75fc) y blindados por `tests/contrast.test.ts`.
Mínimo AA: 4.5 texto normal. Fondos en orden bg / surface / elevated / sunken.

## Grafito (oscuro)
| Texto | Ratios |
|---|---|
| texto #F5F1EB | 17.34 / 16.30 / 14.87 / 17.79 |
| muted | 9.55 – 8.18 |
| subtle | 5.40 / 5.08 / 4.63 / 5.54 |
| brasa-300 | 9.30 – 7.97 |
| oro-300 | 11.01 – 9.44 |
| peligro #F2606E | 6.20 – 5.32 |

## Porcelana (claro)
| Texto | Ratios |
|---|---|
| texto | 16.66 – 14.87 |
| muted | 8.59 – 7.66 |
| subtle | 5.29 / 5.71 / 4.98 / 4.72 |
| brasa-700 | 5.41 / 5.84 / 5.09 / 4.83 |
| oro-700 | 5.71 / 6.16 / 5.37 / 5.09 |
| peligro | 6.15 – 5.49 |

## Sobre relleno
- Tinta #160A03 sobre brasa-500: 6.95 · sobre oro-300: 10.99
- Blanco sobre peligro (claro): 6.64

Todo ≥ 4.5 (el mínimo es subtle sobre elevated en grafito, 4.63).

## Capturas del humo cálido (en esta carpeta)
`captura-00-humo-solo` · `captura-01-panel` · `captura-02-variantes` · `captura-03-master` ·
`captura-04-carril-1000` · `captura-05-movil-390` · `captura-06-porcelana`.
El calor visible lo da la capa estática `.c-aurora::before`; el shader es tenue de origen (DA-R2).
