# Duplicados · el segundo eje

> Doctrina escrita para que no se vuelva a perder. Si vas a tocar la aceptación en
> lote, la ingesta o la limpieza del master, esto manda.

## El hallazgo que la motiva

Un usuario volcó un dossier de 104 KB y aceptó **todo lo verificado**. Entraron 105
items: **10 roles donde hay 5** y **33 grupos de habilidades donde hay ~10**.

El sistema funcionó exactamente como estaba diseñado. Ahí está el problema:

> **Un duplicado está perfectamente verificado.** Su `evidence_snippet` sí aparece
> literal en el `raw_text` — aparece **dos veces**. La verificación de evidencia
> detecta **invención**, no **repetición**. Son propiedades **independientes**.

Por lo tanto «aceptar todo lo verificado» no es el filtro que deja fuera los
duplicados: **es el camino por el que pasan todos**.

## La regla

El estado de un item tiene **dos ejes, no uno**:

|  | único | posible duplicado |
|---|---|---|
| **verificado** | entra en el lote | ⚠ **fuera del lote**, lo revisa el usuario |
| **parcial** | lo revisa el usuario | lo revisa el usuario |
| **sin evidencia** | lo revisa el usuario | lo revisa el usuario |

El lote respeta **los dos** y **dice cuántos deja fuera y por qué**.

## Por qué falló la detección que ya existía

La clave era *«empresa normalizada + solapamiento de fechas»*. Está pensada para el
caso **CV contra LinkedIn**: dos fuentes estructuradas y fechadas.

Un dossier narrativo no es eso. Describe el mismo trabajo desde varias fuentes, y
esas versiones:

- **no traen fecha** → la pata del solapamiento no se puede evaluar;
- **traen la empresa malformada o ausente** → `TesseractSoftwares` sin espacio, `—`
  vacío, y `Químico farmacéutico`, que no es una empresa: es **la profesión del
  cliente**.

**Las dos patas de la clave estaban rotas. Por eso no dedujo nada.** Y la marca que
sí llegaba a calcularse (`duplicateOfKey`) se perdía antes de la base: ningún writer
escribía `duplicate_of` ni `merge_proposal`.

## Detección en tres niveles

1. **Determinista**, cuando hay datos: empresa normalizada + solapamiento de fechas
   **reales** (`normalizeDateRange`, no `end: null`). Ojo: el containment mutuo por sí
   solo no basta — una promoción interna (`Dev` → `Tech Lead` en la misma empresa) son
   **dos roles**, no un duplicado.
2. **Semántico**, cuando no hay fecha ni empresa fiable: compara **contenido** —
   título, entidades nombradas, tecnologías, cifras. Dos roles que comparten
   *«laboratorio virtual, realidad virtual, Unity, 3DLab»* son el mismo aunque uno no
   tenga fecha y se llamen distinto.
3. **Señal de origen**: si dos items vienen del **mismo `source_id`** y describen lo
   mismo, la sospecha sube. Es un documento que menciona el mismo hecho dos veces, no
   dos hechos.

## Dónde vive la sospecha

- **En staging**: en `staged_items.merge_proposal` (jsonb, ya existía en 0001 con el
  comentario *«la decide el USUARIO»*). **No** en `duplicate_of`: esa columna
  referencia `profile_items(id)` y el duplicado que detectamos es entre dos *staged*,
  así que la FK no encaja.
- **En el master**: **no se persiste**. Se calcula al vuelo (`GET /api/master/duplicados`)
  porque resolver un par muta el master, y una marca guardada quedaría rancia al
  instante.

## Lo que el sistema NUNCA hace

**Ninguna fusión ni ningún descarte automático.** El sistema **marca y explica**; el
usuario decide, siempre, con las dos versiones delante campo por campo y tres
acciones: *quedarme con esta* · *quedarme con la otra* · *fusionar*. Fusionar eligiendo
campo a campo es lo que de verdad se quiere: **la fecha de LinkedIn con el detalle
narrativo del cuestionario**.

## Proyecto ≠ grupo de habilidades

Doce grupos de habilidades se colaron como **proyectos** en el volcado real:
`Desarrollo 3D y Videojuegos: Unity 6`, `Computación Cuántica: computación cuántica`,
`DevOps y Despliegue: contenedores y despliegue reproducible`…

La forma delatora: **`Etiqueta: item, item, item`** — lista de tecnologías separadas por
comas, **sin verbo, sin resultado, sin nombre propio**. Un proyecto tiene nombre propio
y casi siempre repo, demo, fecha o una cifra.

Se comprueba **antes de escribir en staging**, se **marca** (no se reclasifica solo) y
se ofrece la acción de un clic *«esto parece un grupo de habilidades → moverlo a
Skills»*, en lote. Es el mismo fallo que ya se corrigió en sentido contrario —las
aptitudes de LinkedIn colándose como viñetas de experiencia— ahora en la otra
dirección.

## Y por qué esto va antes que las dos páginas

Con 105 items, la mitad repetidos, **ningún CV cabe en dos páginas**. Deduplicar no es
una tarea paralela al ajuste: **es su condición previa**.
