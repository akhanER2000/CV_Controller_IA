# CANON — Sistema de diseño de producto

> *"El sistema de registro de tu carrera."* Un master profile canónico, alimentado por IA desde
> cualquier fuente, del que se derivan variantes **verificables — nunca inventadas** — y se exportan
> PDFs que el ATS lee **exactamente** como los ves.
>
> Sistema visual heredado: **Oro · Obsidiana · Porcelana.** Nombre de trabajo: **CANON**
> (parametrizable). Repo: `CV_Controller_IA`.

---

## Cómo leer este paquete

```
canon-design/
├── 00-README.md            ← estás aquí. Índice + decisiones clave en 1 página
├── 01-producto/
│   ├── posicionamiento.md  Tesis · anti-producto · 3 nombres · pricing · "por qué no es otro Rezi"
│   └── principios.md       9 principios de diseño, cada uno con su fuente
├── 02-sistema/
│   ├── tokens.css          TODOS los tokens, ambos temas (consumir los semánticos)
│   ├── tokens.json         Los mismos, para ingeniería/herramientas
│   ├── tipografia.md       Las tres voces, la escala 1.25, reglas de uso
│   ├── densidad.md         La escala compacta NUEVA para UI de app
│   └── motion.md           Duraciones, curvas, el único shimmer, reduce-motion
└── 05-documento-cv/        ★ la pieza más difícil — el CV con las manos atadas
    ├── ESPECIFICACION.md   Cada valor en pt/mm. Cero ambigüedad
    ├── decision-tipografica.md   A vs B vs Híbrido: qué elegí y por qué
    ├── cv-1pagina-es.html · cv-2paginas-es.html
    ├── cv-1pagina-en.html · cv-2paginas-en.html
    ├── cv-bn.html          Prueba de impresión en blanco y negro
    ├── datos-ejemplo.json  ★ golden file — el perfil en el modelo interno
    └── cv-texto-plano.txt  ★ golden file — el texto REAL que extrae el parser
```

Los `.html` se abren con doble clic (fuentes desde Google Fonts CDN, sin build). Para verlos a
tamaño físico: **Ctrl/Cmd + P → Guardar como PDF**.

---

## Estado de esta entrega

Esta es la milestone **"Fundación + documento"** (acordada contigo). Incluye el sistema completo y
el documento CV con su golden file, para que lo revises **antes** de que construya las pantallas de
la app.

- ✅ **Fundación:** tokens (css/json), tipografía, densidad, motion.
- ✅ **Documento CV:** decisión tipográfica, plantillas ES/EN × 1/2 páginas, prueba B/N, spec
  exacta en pt/mm, y el **golden file verificado** (`datos-ejemplo.json` ⇄ `cv-texto-plano.txt`).
- ✅ **Producto:** posicionamiento, 3 nombres, estructura de pricing, principios.
- ⏳ **Pendiente (siguiente milestone), a tu OK:** `03-componentes/` (formularios, tarjeta de
  procedencia, niveles de confianza, estados de IA, hairline de estados), `04-pantallas/` (landing,
  onboarding, staging, master, editor de variante, tailoring, salud, settings — a 1440/1024/390 con
  todos los estados), `06-handoff/` (copy ES+EN, criterios de aceptación).

> Sobre el perfil de ejemplo: como el CV real no llegó al proyecto, usé un ingeniero de software
> chileno **verosímil e inventado**, con contacto ficticio evidente. Cuando subas el tuyo, cambio
> estructura/cargos/fechas/logros y **regenero el golden file** en un paso.

---

## Decisiones clave (en una página)

1. **Tipografía del documento: Híbrido "un solo gesto".** Playfair Display *solo en el nombre*;
   Geist en encabezados y cuerpo; Geist Mono en las cifras. Razón corta: la familia no rompe el
   parseo de un PDF con texto (lo verifiqué); la decisión es de legibilidad, seriedad y marca. Un
   gesto editorial, en el lugar de máximo tamaño, es la traducción de "el oro escaso" al tipo.
   → `05-documento-cv/decision-tipografica.md`.

2. **Tema por defecto: Obsidiana (oscuro).** La app es una herramienta cara y editorial; el oro
   brilla sobre obsidiana. Porcelana (claro) disponible. El **documento vive siempre en
   porcelana/tinta** — es impresión.

3. **La cifra en Geist Mono, verificada.** "El mono le da la evidencia": las métricas saltan sin
   color ni negrita. Riesgo de parseo (runs de fuente) **probado y superado** — reglas duras en la
   spec §5. Contrato de CI documentado.

4. **Pricing: se cobra la IA, no el documento.** Descarga siempre gratis. Gratis (todo lo que no
   llama a un LLM) · Pro `[PRECIO]`/mes (ingesta + tailoring) · BYOK. Importes = placeholders.

5. **El golden file es el contrato ejecutable diseño↔ingeniería.** El PDF renderizado desde
   `datos-ejemplo.json`, re-parseado, debe coincidir con `cv-texto-plano.txt`, o **falla el build**.

6. **Auth (para la milestone de pantallas): Email + Google.** LinkedIn descartado a propósito: su
   API ya no entrega el perfil completo, y un botón que insinúa un import que no podemos cumplir
   rompe la promesa justo en el onboarding. (Es, de hecho, la razón por la que ingerimos capturas.)

7. **Nombre:** diseñar con `--brand-name = "CANON"`; alternativas fuertes **Corpus** / **Ledger** /
   **Origen**. Wordmark parametrizado.

---

## Las dos reglas que no se negocian

> **La app debe ser bellísima. El documento debe ser deliberadamente sobrio.**
> El lujo está en la contención: la app es la joyería, el CV es la joya. Y **se diseña para la
> dignidad** — este producto le sirve a gente en un proceso humillante y repetitivo; cada decisión
> puede hacerlo un poco más digno.
