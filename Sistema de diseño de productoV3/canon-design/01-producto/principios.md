# Principios de diseño

Nueve principios. Cada uno tiene una **consecuencia de diseño concreta** y, donde existe, una
**fuente**. No son eslóganes: son criterios para resolver discusiones.

---

### 1 · El lujo está en la contención
La app despliega el oro; el documento lo administra. La aplicación es la **joyería**; el CV es la
**joya** — pequeña, densa, sin adornos. Cuando "se ve espectacular" choca con "lo parsea bien un
ATS": **en el documento gana el ATS, siempre; en la app gana lo espectacular, siempre.** No se
mezclan los dominios.
> *Consecuencia:* dos lenguajes visuales deliberadamente distintos, y una explicación de por qué
> (criterio de aceptación §6).

### 2 · Ningún número sin fuente
Si no podemos citar de dónde sale, no se muestra. Ni score, ni "62% de match", ni "confianza 87%",
ni "el 60% de tus viñetas debería llevar cifra". Mostramos el **hecho**, no el índice.
> *Fuente:* los "ATS score" son humo — cada ATS puntúa distinto y ninguno publica su fórmula
> (investigación §1). *Consecuencia:* el chequeo de salud lista reglas citadas, no porcentajes; el
> tailoring muestra keywords faltantes, no un %.

### 3 · El oro es escaso, intencional y luminoso
≤ 1 elemento dorado dominante por vista. El oro **siempre** significa valor o acción (enlace, CTA,
foco, métrica, borde activo) — **nunca relleno**. En el documento, un solo uso: el nombre.
> *Consecuencia:* el "hairline dorado" reemplaza a los fondos de color como sistema de estados.

### 4 · Diseña para la dignidad
Buscar trabajo es humillante y repetitivo. El tono es **sereno, competente y sin drama.** Nada de
gamificación, urgencia manufacturada ni "¡tu CV es un 87%! 🎉". Cada decisión puede hacer el proceso
un poco más digno o un poco más miserable.
> *Fuente:* estado emocional del usuario (brief §1.5). *Consecuencia:* copy sin exclamaciones, sin
> coach; los huecos se plantean como invitaciones, no como errores.

### 5 · Lo que ves es lo que el parser lee
La honestidad es el feature. Mostramos el texto plano que un ATS realmente extrae del PDF, lado a
lado con el PDF. Si algo se pierde o se desordena, se ve.
> *Fuente:* el riesgo real no es el rechazo automático (mito, §1), es quedar **mal parseado e
> invisible** en las búsquedas. *Consecuencia:* la vista "Cómo lo lee el ATS" y el golden file de CI.

### 6 · La procedencia es visible, nunca acusatoria
Cada item lleva su origen (archivo, página, snippet) y su nivel de confianza. Se lee de un vistazo
y **jamás se siente como un juicio**. La confianza se comunica con oro y grises, no con semáforo.
> *Fuente:* la especificidad verificable es indetectable como IA porque la IA no la inventa (§6).
> *Consecuencia:* la "tarjeta de item con procedencia" y los tres niveles de confianza sin
> rojo-amarillo-verde. *Pista:* la ausencia de oro también comunica.

### 7 · La espera de la IA se diseña, no se sufre
Extraer toma 5–40 s reales. Ese tiempo es narración: "Leyendo página 2 de 3", "Encontré 4
experiencias". Progreso **específico y verdadero**, nunca un % falso. Al terminar: el único shimmer.
> *Fuente:* latencia de LLM (§6, §8). *Consecuencia:* estados de IA con motion propio (ver
> `motion.md`).

### 8 · La densidad es respeto por el tiempo
La app es un instrumento denso, no una landing que respira. Compactamos para dar más contexto, no
para amontonar. El aire se gana con jerarquía (hairline + peso), no con padding.
> *Consecuencia:* la escala de densidad (`densidad.md`) y el editor de 3 paneles.

### 9 · Nunca información solo por color
Confianza, override, "no verificado", estado de IA: **todos** llevan una segunda señal (forma,
texto, posición). El foco es visible siempre, con el `focus-ring` dorado.
> *Fuente:* WCAG 2.1 AA como piso (brief §7). *Consecuencia:* el sistema de estados combina oro +
> forma + etiqueta; nada depende de distinguir un color.

---

### Y un principio que gobierna el documento: **la página 2 se gana en la página 1**
2 páginas se prefieren 2,3× sobre 1 (2,6× mid, 2,9× manager); pero el tiempo en la página 2 lo
predice lo convincente que sea la 1, y **la página 3 no existe.**
> *Fuente:* ResumeGo (n=482) + Ladders. *Consecuencia:* el diseño celebra 1–2 páginas con igual
> dignidad y advierte —con firmeza, sin drama— en la 3.
