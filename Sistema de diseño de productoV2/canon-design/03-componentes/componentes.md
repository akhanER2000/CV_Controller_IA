# Componentes — inventario

Referencia visual viva: `componentes.html` (tema obsidiana, todos los estados). Este documento es el
contrato: variantes, estados, props y a11y de cada familia. Todo consume los tokens de
`02-sistema/tokens.css`. Densidad de app en `02-sistema/densidad.md`.

> **Regla transversal (a11y §7):** ningún estado se comunica **solo con color**. Evidencia,
> override, "sin verificar", estado de IA → todos con **segunda señal** (forma + texto + posición).
> Foco siempre visible con el anillo dorado; nunca `outline:none` sin reemplazo.

---

## ★ Niveles de evidencia — `<EvidenceLevel>`
El componente que encarna la tesis. **No es un confidence auto-reportado por el LLM** (eso sería el
"ATS score" que condenamos). Deriva de evidencia real.

| Valor | Significado | Señal visual | Segunda señal |
|---|---|---|---|
| `verified` | El `evidenceSnippet` aparece **literal** en la fuente, o es dato de API, o lo escribió el humano | Píldora con oro + rombo lleno ◆ | Texto "Verificado" |
| `partial` | Coincidencia **difusa** (el snippet no calza exacto) | Oro tenue + rombo medio ◈ | Texto "Parcial" |
| `unverified` | **Sin evidencia** rastreable | **Sin oro**, borde punteado, círculo hueco ○ | Texto "Sin verificar" + la UI lo señala |

Props: `level`, `size` (sm/md). **La ausencia de oro comunica** — no se inventa un rojo para "sin
verificar". Nunca semáforo.

## ★ Tarjeta de item con procedencia — `<ProvenanceItem>`
Cada bullet/rol/skill lleva su origen. **Legible de un vistazo, nunca acusatorio.**
- Contenido (con `.num` en Geist Mono para cifras).
- `origin`: `extracted` (PDF · pág.) · `manual` (✎ escrito a mano) · `ai_rephrased` (IA · ver
  original) · `ai_translated` · `api` (GitHub).
- `<EvidenceLevel>` asociado.
- **Evidencia expandible/contraíble:** el fragmento literal de la fuente (o el texto original en el
  caso `ai_rephrased`).
- Estados: colapsado / expandido / en edición.
- Props: `item`, `provenance`, `expanded`, `onAccept/onEdit/onDiscard`.

## ★★ Tarjeta de skill con evidencia — `<SkillEvidence>`
El componente nuevo más importante (§C1). Una skill muestra **de dónde sale**.
- `Go` → `5 repos · 412 KB · usada en 1 viñeta` + `verified`.
- Caso incómodo visible: `Elasticsearch` → `declarado · sin repos, portfolio ni viñetas` +
  `unverified` (borde neutro, sin oro).
- **Nunca infla:** "412 KB de Go" es un hecho contable, no "senior en Go".
- Props: `skill{name, evidenceLevel, method, evidence{github{repos,bytes}, usedIn[]}}`.

## Tarjeta de fuente conectada — `<SourceCard>`
Conexión viva, no historial (§C2). Ordenadas por verificabilidad.
- `type`: github · portfolio · linkedin · file. Badge textual (GH/PF/in/PDF), sin logos de marca.
- Estado: `connected` / `stale` / `processed` (punto oro / gris).
- Stats + **novedades** ("↑ 3 repos nuevos desde la última vez", en oro).
- `verifiability` como ★ (1–5) + etiqueta ("dato duro · sin IA" / "IA · requiere revisión").
- Acción: Resincronizar / Subir nuevas / Ver items.
- **Lo nuevo va a staging, no al master** — incluso lo de una API.

## Selector de repos de GitHub — `<RepoSelector>`
- Lista de repos: checkbox, punto de lenguaje, nombre, `lang · KB · ★`.
- **Default propuesto** (no-fork · con descripción · commits propios · actividad reciente),
  marcado pero **revisable**. Los excluidos muestran el motivo ("fork", "sin descripción",
  "ejercicios, no proyecto") en cursiva tenue.
- Encabezado honesto: "Propuesta revisable — 4 de 14 · tú decides".
- Props: `repos[]`, `selected[]`, `onToggle`. Nunca selección automática silenciosa.

## Estados de IA — `<AIState>`
La espera se diseña (§motion). Progreso **específico y verdadero**, nunca % falso.
- `thinking` (pulso del punto dorado) · `extracting` (contador real: "página 2 de 3 · 4
  experiencias") · `proposed` (hairline dorado) · `accepted` (spring + hairline se desvanece) ·
  `rejected` (colapsa) · `done` → **el único shimmer** del producto.
- Reduce-motion: versión estática sin perder información (contador salta al total, etc.).

## Toggle global de IA — `<AIToggle>`
- On/Off global. **Con IA apagada:** ingesta manual, editor, export, "cómo lo lee el ATS" y chequeo
  **siguen funcionando**. No es modo degradado: es legítimo. Ninguna función core exige un LLM.

## Formularios — familia
`<Input>` · `<Textarea>` (autoexpandible) · `<Select>` · `<Combobox>` (autocompletado) ·
`<SkillChips>` (tags) · `<Toggle>` · `<Checkbox>` · `<Radio>` · `<DateRange>` (mes/año, formato CV).
- Control 36 px (28 sm / 44 táctil móvil). Anillo de foco dorado. Estado de error sobrio (`danger`,
  no rojo chillón) con mensaje textual.

## Datos / estructura (para el editor y el master)
`<DenseTable>` · `<ReorderList>` (drag **+ alternativa de teclado**, requisito a11y) ·
`<SectionTree>` (acordeón) · `<SplitPane>` (redimensionable) · `<DiffViewer>` (original ⇄ propuesto,
lado a lado). — Se detallan al construir el editor de variante.

## Hairline dorado como sistema de estados
En vez de fondos de color: `override` (hairline sólido oro + "ver original/revertir") · `pending`
(hairline oro punteado + "pendiente") · `active/focus` (borde oro) · neutro (sin hairline). Siempre
con segunda señal textual.

## Densidad
Tres alturas de fila: `compact 32` (biblioteca 100+ items) · `default 40` · `comfortable 48`. Móvil
sube a 44. Ver `densidad.md`.
