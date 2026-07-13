# criterios-aceptacion.md — criterios de aceptación de DISEÑO · Corpus

> **La lección central de este documento.** Se valida **USO en DOM real**, nunca la mera
> presencia de una definición. Un `@keyframes` en `canon-motion.css` no es ceremonia; una
> clase `.c-aurora-gl` en la hoja de estilo no es aurora; un `CANON.shimmer()` exportado en
> `canon-motion.js` no es el destello. Nada de eso cuenta hasta que un elemento del árbol de
> una pantalla lo **monta y lo dispara**. El estado auditado de V3 lo demuestra: 11 keyframes
> definidos y world-class, y ninguno vivo porque no existe la pantalla anfitriona que los
> hospede. Este documento existe para que esa brecha —definido pero muerto— sea **imposible de
> aprobar**.

Ámbito: **solo diseño** — visual, copy, interacción, accesibilidad. Los criterios técnicos
(CI, RLS, deploy, react-pdf, golden-diff en pipeline) viven en `ESPECIFICACION.md` y no se
evalúan acá, con una sola excepción declarada: la **paridad del golden-file** como contrato
visible del documento sobrio (§2, G11).

---

## 1 · Cómo usar este documento

1. **Cada criterio es verificable.** O es un **gate automático** (§2) —resoluble con `grep`,
   un conteo o una comparación de archivos, sin opinión— o es una **pregunta de rúbrica
   humana** (§3) que se responde `PASA` / `FALLA` mirando la pantalla en un navegador real.
   No hay una tercera categoría. Si algo no encaja en ninguna, no es un criterio: es una
   opinión, y no bloquea.

2. **Un solo veredicto por criterio.** No hay «parcial», no hay «casi». Un gate con
   0 huérfanos definidos-no-usados pasa; con uno solo, falla. Una rúbrica que exige «pausa al
   escribir» falla si la aurora sigue latiendo mientras se teclea, aunque pause «casi
   siempre».

3. **Se prueba lo que el usuario ve, no lo que el sistema declara.** Todo criterio de uso
   (aurora, stagger, shimmer, x-ray) se comprueba **abriendo la pantalla anfitriona y
   observando el comportamiento**, no leyendo el CSS/JS. Un gate por `grep` es solo el piso:
   confirma que el cableado existe en el DOM; la rúbrica confirma que además **se ve**.

4. **Orden de evaluación.** Primero §2 (barato, binario, automatizable). Si un gate falla, se
   arregla antes de convocar la rúbrica humana: no tiene sentido juzgar la ceremonia de una
   pantalla que ni siquiera existe como archivo. La §3 se corre solo sobre lo que ya pasó §2.

5. **Alcance de pantallas.** Las **11 pantallas** del producto son: `auth`, `onboarding`,
   `ingesta`, `staging`, `master`, `fuentes`, `tailoring`, `salud`, `ajustes`, `dashboard`,
   `editor-variante`. Las dos últimas existen hoy; las nueve primeras faltan. Un criterio que
   dice «por pantalla» aplica a las 11, no a las 2 construidas.

6. **Clasificación de pantallas por atmósfera** (define qué nivel de ceremonia se le exige a
   cada una, ver motion.md — ambición por capas):
   - **Atmosféricas** (ceremonia plena): `auth`, `onboarding`, `ingesta` (pantalla de espera).
   - **De trabajo** (movimiento restringido y rápido): `editor-variante`, `master`, `staging`,
     `tailoring`, `fuentes`, `salud`, `ajustes`, `dashboard`.
   - **Documento** (inmóvil por doctrina): el CV exportado. No anima **nunca**.

---

## 2 · Gates automáticos (grep / conteo)

Binarios. Cada uno se resuelve con un comando y una condición numérica. La columna «Verificación»
es orientativa (rutas relativas a `canon-design/`); lo vinculante es la **condición de
aprobación**. Un gate no marcado como `PASA` bloquea el handoff.

| # | Criterio (pregunta pasa/falla) | Verificación (grep / conteo) | Condición de aprobación |
|---|---|---|---|
| **G1** | ¿Todo `@keyframes` definido está **usado**? ¿Cero huérfanos? | Conjunto A = nombres tras `@keyframes` en `02-sistema/canon-*.css`. Conjunto B = nombres referidos en `animation:` / `animation-name:` en las 11 pantallas + CSS. | **A ⊆ B** y **B ⊆ A**. `A − B = ∅` (0 keyframes definidos sin uso) **y** `B − A = ∅` (0 usos sin definición). No basta con «11 definidos»: se exige **11 usados en al menos una pantalla**. |
| **G2** | ¿Cada pantalla trae su bloque `prefers-reduced-motion`? | Por cada uno de los 11 `.html`, `grep -l "prefers-reduced-motion"`. | Las **11** pantallas contienen al menos un bloque `@media (prefers-reduced-motion: reduce)`. Falta en una sola → falla. |
| **G3** | ¿Existen las 11 pantallas como archivo? | `ls 04-pantallas/` (+ auth/onboarding donde correspondan). Contar los 11 nombres. | Los **11** archivos existen y no están vacíos. Hoy: 2/11 → **FALLA**. |
| **G4** | ¿La aurora **monta en DOM real** en las pantallas atmosféricas? | `grep -c 'class="[^"]*c-aurora-gl'` en cada pantalla de ventana. | `c-aurora-gl` aparece en **≥ 1 elemento del `<body>`** de cada pantalla atmosférica (`auth`, `onboarding`, `ingesta`). Definir la clase en CSS sin montarla en el árbol → **FALLA** (estado actual de V3). |
| **G5** | ¿`stagger` y `shimmer` están **cableados y disparados** en su pantalla anfitriona? | `grep "CANON.stagger\|c-stagger"` y `grep "CANON.shimmer\|shimmer("` en `ingesta`/`staging`. Verificar que la llamada está dentro de un handler/secuencia de carga, no solo importada. | La pantalla anfitriona (`ingesta`→espera; `staging`→revelado de ítems) **invoca** `CANON.stagger()` sobre nodos reales y dispara el **shimmer exactamente una vez**. Exportado-pero-nunca-llamado → **FALLA**. |
| **G6** | ¿El toggle x-ray («Cómo lo lee el ATS») está en el editor y cableado? | `grep "c-xray\|x-ray\|ats"` en `04-pantallas/editor-variante.html` + verificar el listener del toggle. | El control existe, alterna la clase `.c-xray` sobre el nodo objetivo y el efecto se aplica al hacer clic. (Única ceremonia hoy funcional — debe **seguir** pasando en cada revisión.) |
| **G7** | ¿La paleta es **pura**? ¿Ningún hex fuera de oro / obsidiana / porcelana / metal? | Extraer todos los `#RRGGBB`/`#RGB` de pantallas y CSS; restar la lista blanca. | El resto es **∅**. Lista blanca: **oro** `#F6E2A2 #E7C24F #D4AF37 #8A6414 #5C450F`, ink-on-gold `#1A1206`; **obsidiana** `#0B0B0D #141418 #1C1C22 #050508`; **porcelana** `#FAFAF7 #FFFFFF #F1F1EC`; **metal/aurora** cobre `#B87333`, plata `#ADB6C2`; **danger** solo el token `#C4453A`. Cualquier otro hex (p. ej. los colores linguist de GitHub `#79c0ff #3572A5 #844FBA #2b7489 #89e051 #f1e05a` del mock de `componentes`) → **FALLA**. |
| **G8** | ¿Cero deriva del token `danger`? | `grep -R "#C6544B\|#C65"` (y todo hardcode de danger que no sea `var(--danger)`). | El literal `#C6544B` no aparece en **ningún** archivo. El rojo de peligro se referencia como `var(--danger)` = `#C4453A`. Un solo hardcode del fallback → **FALLA**. |
| **G9** | ¿`copy.md` es bilingüe y completo? | Verificar columnas **ES** y **EN** por fila y presencia de las 14 secciones. | Toda clave de copy tiene ES **y** EN; 14 secciones presentes. Una fila con una sola lengua → **FALLA**. |
| **G10** | ¿Existen los dos documentos de handoff? | `ls 06-handoff/` — `copy.md` y este `criterios-aceptacion.md` (más los que el índice de handoff declare). | Los documentos de handoff declarados existen y no están vacíos. |
| **G11** | ¿Hay **paridad** golden-file? ¿El texto plano se reconstruye 1:1 desde los datos? | Comparar `05-documento-cv/datos-ejemplo.json` ↔ `cv-texto-plano.txt` (persona Matías Fuentes Aguilar): mismos ítems, mismo orden, sin campos inventados. | Correspondencia exacta dato↔línea. **Sub-gate de integridad de datos:** ninguna aserción de `masterHealth` puede contradecir los datos que referencia (el defecto `h-nometric` —advierte «3 viñetas sin cifra» sobre bullets que son `hasMetric:true`— debe estar **resuelto**). |
| **G12** | ¿Ningún número sin fuente en el copy? | `grep -nE "[0-9]+ *%|\b[0-9]{1,3}\b"` en `copy.md`; cada cifra debe (a) ser un `{token}` variable o (b) venir con su fuente en el mismo enunciado. | Cero porcentajes/scores inventados. Prohibido el patrón «tu match es 62%». Toda cifra es variable de dato o cita su origen (p. ej. «El aviso pide X»). Un número «decorativo» sin fuente → **FALLA**. |

> **Nota de método sobre G1, G4, G5.** Estos tres son la encarnación de la lección central y
> por eso se especifican como **conjuntos**, no como presencias. «Definido» va del lado
> izquierdo; «usado en el DOM de una pantalla» va del lado derecho; el gate exige la
> **igualdad**, no la existencia del izquierdo. Contar «11 keyframes» y dar por bueno es
> exactamente el error que V3 cometió.

---

## 3 · Rúbrica humana (pass/fail, no grepeable)

Se responde abriendo la pantalla en un navegador real y mirando. Cada ítem es una **pregunta
binaria**. La evidencia es la observación directa, no el código fuente.

**R1 · Ceremonia visible al cargar.**
¿Al abrir una pantalla atmosférica (auth / onboarding / la espera de ingesta) ocurre una
**secuencia de entrada perceptible** —ringDraw / horizonDraw / particleRise / glowPulse /
letterReveal, o el stagger de ítems— antes de que la pantalla quede en reposo? Si la pantalla
«aparece y ya», sin que nada se revele en el tiempo, **FALLA** aunque los keyframes existan.
(Corolario: si la ceremonia se dispara en una pantalla de trabajo donde debería ser instantánea,
también falla — ver R10.)

**R2 · Aurora viva, metálica y que pausa al escribir.**
Tres condiciones, las tres obligatorias. (a) ¿La aurora **se mueve** de forma continua sobre la
obsidiana? (b) ¿Su color lee como **metal** —oro, cobre `#B87333`, plata `#ADB6C2`— y no como
un degradado genérico de colores? (c) ¿Se **detiene** al enfocar el editor y teclear (el editor
es sagrado) y **retoma** al salir? Un canvas que no monta nada, o una aurora que sigue latiendo
mientras se escribe, **FALLA**.

**R3 · Disciplina un-oro a la vista.**
Mirando la pantalla completa: ¿hay **un solo oro protagonista** por vista, con el resto de la
familia en rol de soporte (borde, texto sobre oro, brillo)? ¿O compiten dos o tres oros por la
atención? Si el ojo no sabe cuál es el acento, **FALLA**.

**R4 · Split app-bella / documento-sobrio.**
¿La **app** es atmosférica (aurora, oro, profundidad, movimiento) y el **CV exportado** es
deliberadamente sobrio (una columna, sin color de marca, sin movimiento, ATS-parseable)? Si el
documento «se contagia» de la belleza de la app —degradados, dos columnas, íconos decorativos—
**FALLA**. Si la app se contagia de la sobriedad del documento y se ve como un formulario gris,
también **FALLA**.

**R5 · Reduced-motion preserva la información.**
Con `prefers-reduced-motion: reduce` activo: ¿la pantalla **sigue comunicando todo** —los ítems
del stagger están presentes y legibles, el x-ray revela su estado, la ceremonia se sustituye por
transiciones sobrias— **sin** recurrir al martillo `* { animation: none }`? Apagar todo
indiscriminadamente (y con ello ocultar información que solo aparecía animada) **FALLA**. La
pregunta es: ¿un usuario con reduced-motion recibe la misma información que uno sin él?

**R6 · Tono del copy.**
Leyendo el copy en pantalla: ¿es **sereno, competente, sin drama** —sin exclamaciones, sin
coach, sin gamificación— y **enseña la verificación** en vez de anunciarla? El listón es el de
la tesis: «El aviso pide Kubernetes. No aparece en tu master. ¿Lo usaste y no lo registraste, o
es una brecha real?» **PASA**; «¡Faltan 7 keywords, tu match es 62%!» **FALLA**.

**R7 · Referencia emulada, no copiada.**
Comparando con alkemymarket.com: ¿el resultado **captura el espíritu** (atmósfera, oficio,
densidad, sobriedad del lujo) sin **replicar** layout, componentes ni copy literal? Si una
pantalla es reconocible como «la de Alkemy con otros textos», **FALLA**. Si nadie que conozca la
referencia la señalaría como copia pero sí percibe el mismo nivel de oficio, **PASA**.

**R8 · Faltante-por-diseño vs. faltante-por-negligencia.**
Ante cada ausencia (un estado, una sección, un dato): ¿está **ausente porque el diseño lo
decidió** (y eso se lee como intención — vacío con copy propio, «aún no hay fuentes») o **ausente
por olvido** (un hueco, un placeholder crudo, un `undefined`)? La misma casilla vacía puede pasar
o fallar según se lea. **FALLA** todo vacío que parezca un bug.

**R9 · Matriz de estados.**
Para cada pantalla con datos: ¿están diseñados **los cuatro estados canónicos** —vacío, cargando
(skeleton/`c-skeleton`/`c-thinking`), con datos, error— y no solo el estado feliz? Una pantalla
que solo existe «llena y perfecta» **FALLA**. La pregunta se hace pantalla por pantalla; basta un
estado sin diseñar para reprobar esa pantalla.

**R10 · El movimiento escala con la frecuencia de uso.**
¿La cantidad de ceremonia es **inversamente proporcional a cuántas veces por día se visita la
pantalla**? Las atmosféricas (se ven una vez por sesión) pueden desplegar la coreografía plena;
las de trabajo (se viven durante horas: editor, master, staging) usan movimiento **restringido y
rápido** (niveles 0–1 de motion.md, 0–200 ms); el documento no se mueve. Si el editor celebra
cada guardado con una ceremonia de 1200 ms, **FALLA** aunque la animación sea preciosa.

---

## 4 · Criterio de salida (definition of done, diseño)

El handoff de diseño está **aprobado** cuando, y solo cuando:

- **§2:** los 12 gates automáticos marcan `PASA`. En particular G1/G4/G5 con **igualdad de
  conjuntos** (definido == usado), no con presencias sueltas.
- **§3:** las 10 preguntas de rúbrica responden `PASA`, evaluadas **pantalla por pantalla**
  donde el criterio lo indica (R5, R8, R9, R10).
- No queda **ninguna** definición de motion/aurora/ceremonia que esté presente en CSS/JS pero
  muerta en el DOM. Repetido porque es lo único que de verdad hay que recordar de este
  documento: **se valida el uso en DOM real, nunca la mera presencia de una definición.**