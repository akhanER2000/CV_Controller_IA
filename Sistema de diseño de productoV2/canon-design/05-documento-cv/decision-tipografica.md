# Decisión tipográfica del documento CV

> Qué fuente usa el CV, y por qué. El resumen: **Híbrido "un solo gesto"** — Playfair
> Display *solo* en el nombre, Geist en todo lo demás, Geist Mono en las cifras.

---

## Primero, la verdad incómoda sobre "fuentes y ATS"

El brief pregunta: *"¿Playfair sobrevive a 10pt en un ATS? ¿La extrae limpiamente un parser?"*

**La familia tipográfica no rompe el parseo de un PDF con capa de texto.** Un parser lee los
*caracteres* del content stream, no los trazos. Da igual si la "M" es Playfair o Geist: el texto
extraído es "M". Lo confirmamos empíricamente — ver `cv-texto-plano.txt`, extraído del documento
real: nombre, email, cargos y cifras salen intactos.

Lo que **sí** rompe el parseo está documentado (investigación §3) y es **estructural**, no
tipográfico: columnas, tablas, headers/footers, imágenes, letras espaciadas. Nuestro documento no
hace nada de eso, en ninguno de los tres tratamientos.

Entonces, si la fuente no afecta el parseo, **¿de qué depende realmente la decisión?** De tres
cosas honestas, todas criterio de diseño (lo declaro como tal, no como evidencia):

1. **Legibilidad humana** a tamaños pequeños (el cuerpo va a 10pt).
2. **Percepción de seriedad** ante un reclutador técnico (el brief lo plantea: ¿"menú de
   restaurante"?).
3. **Continuidad de marca** — que el documento se sienta parte de Corpus sin gritar.

Hay **una sola excepción tipográfica que sí toca el parseo**, y es nuestra: mezclar dos fuentes en
la misma línea (Geist + Geist Mono para las cifras) crea *runs* de texto adyacentes en el PDF. Es
la causa clásica de `ventas25%` pegado o `ventas 2 5 %` separado. **Eso hubo que verificarlo, no
asumirlo** — y se verificó (ver más abajo).

---

## Las tres opciones

### A — "Editorial"
Playfair en el nombre **y** en los encabezados de sección; Geist cuerpo; Geist Mono cifras.
- ✅ Máxima continuidad con la marca.
- ❌ Seis encabezados de sección en serif de alto contraste = seis focos tipográficos repetidos.
  Compite con el nombre y **rompe la regla del oro escaso** trasladada al tipo ("≤1 gesto
  dominante por vista"). Añade ruido editorial a un documento que debe escanearse en 7,4 s.
- ❌ Playfair a ~10,5pt en un encabezado condensado se afina y pierde definición en impresión láser.

### B — "Instrumento"
Geist para todo; Geist Mono cifras y metadatos; peso y tracking hacen toda la jerarquía.
- ✅ Máxima seguridad y neutralidad; estéticamente "ingeniería".
- ❌ Pierde **todo** el carácter de marca. El documento podría ser de cualquier producto. Nos
  cuesta gratis un punto de diferenciación que no tiene ningún costo de parseo.

### ★ Híbrido "un solo gesto" — **ELEGIDO**
Playfair Display **solo en el nombre**. Geist en encabezados (mayúsculas + tracking + hairline) y
cuerpo. Geist Mono en cifras, fechas y línea de contacto. Oro (`gold-700`) **solo en el nombre**.

- ✅ **Un** gesto editorial, en el lugar de máximo tamaño (25pt) donde una serif de alto contraste
  es *legible y hermosa* — no a 10pt. Es la traducción literal de "el oro escaso" al tipo: un
  acento, intencional, en lo que más importa (el nombre es, con el cargo, lo que más mira el
  reclutador — Ladders).
- ✅ Los encabezados en Geist mayúsculas + hairline se leen como **instrumento**, calmados, y dejan
  que el nombre sea el único protagonista.
- ✅ Geist Mono en las cifras hace que las métricas **salten** sin usar color ni negrita — es
  exactamente "el mono le da la evidencia" del concepto original, y libera al oro para un solo uso.
- ✅ Continuidad de marca **a costo cero de parseo**: el nombre en Playfair ata el documento a la
  app; el resto es máximamente seguro.

**Por qué no A:** la repetición mata la escasez. **Por qué no B:** regalar carácter que no cuesta
nada es mal negocio.

---

## La verificación que TODAVÍA hay que hacer (mono en las cifras)

**Riesgo:** cambiar Geist → Geist Mono a mitad de línea crea *runs* de fuente adyacentes en el
content stream del PDF, que un parser puede pegar (`ventas25%`) o separar (`ventas 2 5 %`).

**Lo que sí se comprobó — y lo que NO.** Se renderizó el documento **en HTML** y se extrajo su
texto en orden de lectura (`cv-texto-plano.txt`):

```
Reduje la latencia p99 de 850 ms a 180 ms, migrando un monolito Django a 6 servicios...
Sostuve 99,95% de uptime procesando CLP 12.000M en transacciones mensuales...
Reduje el costo de infraestructura 30% (USD 8.000/mes)...
```

Eso confirma el **orden de lectura** y el **espaciado a nivel de marcado** (los espacios normales
alrededor de cada cifra están donde deben). Pero **no prueba el modo de fallo que nos preocupa:**
en HTML **no existen los runs de fuente** — son un fenómeno del content stream de un PDF. El método
usado **no puede detectar** el pegado/separado de runs. Decirlo claro importa, en un producto cuya
tesis es no afirmar nada que no se pueda demostrar:

> **Estado: pendiente de verificación real.** Solo se puede probar contra el PDF de
> `@react-pdf/renderer`, re-parseándolo en CI (Fase 1 de ingeniería). Hasta entonces, el mono en
> las cifras es una **apuesta mitigada, no un hecho verificado.**

Las 4 reglas duras son la **mitigación** (obligatorias, van en `ESPECIFICACION.md §5`):

1. **Siempre un espacio normal** (de Geist) antes y después del run mono. Nunca pegar la cifra a la
   palabra.
2. **`letter-spacing: 0`** en el run mono. El tracking es la otra causa de separación espuria.
3. **Nunca partir una palabra** a través del límite de fuente (no `ventas` en Geist + `25%` sin
   espacio).
4. **El bullet es marcador CSS, no carácter de texto** — no entra al stream extraído.

> ⚠️ **Contrato con ingeniería + plan B.** El re-parseo del PDF real contra `cv-texto-plano.txt`
> **debe correr en CI**. **Si el run mono se rompe:** la cifra vuelve a Geist con `font-weight: 600`
> en el documento (se pierde el mono en el papel; se conserva en la app). El plan B está escrito en
> `ESPECIFICACION.md §5` para que ingeniería no lo improvise a las 2 AM. La evidencia manda sobre el
> gusto: si el mono no sobrevive al PDF real, cae — sin drama.

---

## Consecuencias para el resto del producto

- En la **app** (obsidiana/porcelana) Playfair vive con más libertad: titulares de landing, de
  onboarding, de secciones grandes. Ahí no hay parser que respetar.
- El **documento** es el único lugar con esta disciplina extrema. Es deliberado: la app es la
  joyería, el CV es la joya.
- El tratamiento es **parametrizable**: `ESPECIFICACION.md` deja los encabezados de sección con un
  *toggle* opcional a `gold-700` para un futuro "modo editorial premium", desactivado por defecto.
