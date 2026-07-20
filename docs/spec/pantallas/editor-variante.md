> ⚠️ **DEROGADO (PROMPT 07) — la gramática «ventana / muro» ya NO rige.**
> Lo que sigue describe la regla vieja: *«donde hay trabajo, el trabajo gana; los muros
> ni montan la aurora»*. Se sacó de una landing con scroll, donde la alternancia produce
> ritmo. Corpus es una app con pestañas: nunca ves la alternancia, solo la inconsistencia.
>
> **Doctrina vigente** (`src/app/globals.css` §3): la aurora está SIEMPRE presente — la
> monta UNA vez el shell de `/app`. Lo que protege la lectura no es su ausencia, sino la
> SUPERFICIE sobre la que vive el contenido: intensidad 0.55 al hojear, 0.22 en trabajo
> denso, y el texto sobre vidrio. **No vuelvas a quitar la aurora de una pantalla.**

# editor-variante — spec literal

> Fuente: `Corpus_ diseño completo/corpus-design/04-pantallas/editor-variante.html` (1273 líneas).
> Bloques `data-corpus-system` (CSS 10–486 · JS 690–961) = copia del sistema canónico, NO se
> transcriben aquí. Todo lo demás es literal.
> **Los nombres de clase NO CAMBIAN.** Son el contrato diseño↔código.

---

## 1 · Ruta y propósito

**Ruta:** `/app/variantes/[id]` ★ (la pantalla más importante del producto, según el comentario del
propio CSS: `/* ── editor-variante.html — la pantalla más importante. MURO. ── */`).

**Qué hace:** editor de tres columnas donde el usuario compone una variante de CV **referenciando**
items del master (nunca copiándolos): a la izquierda la biblioteca del master, en el centro la
composición de esta variante (incluir/ocultar/afinar/reordenar, con overrides), a la derecha el
preview que **ES el PDF** (mismo motor, mismos cortes de página) con su modo rayos-X que muestra el
texto plano que el parser del ATS extrae.

`<title>` = `Corpus — Editor · Backend — Fintech`
`<html lang="es" data-theme="dark">`

---

## 2 · Ventana o muro · Aurora

**MURO. No monta la aurora. Punto.**

- **No hay ninguna llamada a `CorpusAurora.mount(...)`** en el script de pantalla (verificado por
  grep: las únicas apariciones de `CorpusAurora` en el archivo están dentro de
  `data-corpus-system`: la definición del módulo y los hooks `pause('focus')`/`resume('focus')`
  de motion.js). No existe `<div class="c-aurora">` en el DOM.
- Es coherente con la regla del sistema: *"donde hay trabajo, el trabajo gana"* / *"Donde hay
  trabajo que leer, hay muro. Los MUROS ni la montan."* (00-README §4 y handoff §APIs).
- **Estado de aurora: ninguno** — ni `'calm'` ni `'active'`. No aplica.

**Reparto de capas en esta pantalla:**

| Clase | ¿Se usa aquí? | Dónde |
|---|---|---|
| `.c-wall` | **Sí** | `<div class="ed-grid c-wall" id="edGrid">` — el único contenedor que declara capa |
| `.c-window` | No | — |
| `.c-scrim` / `.c-scrim--soft` / `.c-scrim--edge` | No | — |
| `.c-panel` | No | — |
| `.c-aurora` | No | — |

Opacidad real de la pantalla, además del `.c-wall`:
- `.ed-bar` → `background: color-mix(in srgb, var(--bg) 88%, transparent)` + `backdrop-filter: blur(8px)`
  (barra sticky, casi opaca).
- `.ed-col` → `background: var(--bg)`.
- `.ed-col--lib` y `.pv-col` → `background: var(--surface-sunken)`.
- `.ed-tabs` → `background: var(--bg)`.
- El grid usa `gap:1px; background:var(--border)` para dibujar las hairlines entre columnas.

Consecuencia para React: **no montar `<CorpusAurora>` en esta ruta**. Si alguien la monta "para que
se vea bonito", rompe la decisión nº 4 del README.

---

## 3 · Esqueleto DOM

Leyenda: **(S)** clase del sistema (`c-*`, `t-*`, `hd-*`, `demo`) · **(P)** clase propia de la pantalla.

```
body
└── div.c-page (S)
    ├── header.c-header (S)
    │   └── div.c-container (S)
    │       ├── a.c-logo (S)  href="dashboard.html"  → "Corpus"
    │       ├── nav.hd-nav (S)
    │       │   ├── a href="dashboard.html"  → "Panel"
    │       │   ├── a href="master.html"     → "Master"
    │       │   ├── a href="variantes.html" [aria-current="page"] → "Variantes"
    │       │   └── a href="fuentes.html"    → "Fuentes"
    │       └── div.hd-right (S)
    │           ├── a.hd-nav (S) href="ajustes.html" style="display:inline-flex"
    │           │   └── span (inline style: font 500 var(--fs-ui)/1 var(--font-sans);
    │           │            color var(--text-muted); padding 9px 12px) → "Ajustes"
    │           ├── div.hd-lang (S) → span[data-on]"ES" · span"EN"
    │           └── div.hd-av (S) → "DG"
    │
    ├── div.ed-bar (P)  [data-screen-label="editor-toolbar"]
    │   └── div.c-container (S)
    │       ├── a.bk (P) href="variantes.html" → "← Variantes"
    │       ├── span (separador inline: width:1px;height:16px;background:var(--border-strong))
    │       ├── span.nm (P) [contenteditable="true"] [spellcheck="false"] → "Backend — Fintech"
    │       ├── span.st#edState (P) → "al día · guardado"
    │       └── span.acts (P)
    │           ├── a.c-btn.c-btn--quiet (S) href="tailor.html" → "Adaptar a un aviso"
    │           ├── a.c-btn.c-btn--quiet (S) href="salud.html"  → "Salud"
    │           └── button.c-btn.c-btn--patina#btnPdf (S) → "Descargar PDF"
    │
    ├── div.ed-tabs (P) [role="tablist"]     ← display:none; solo ≤1024px
    │   ├── button [data-view="master"]  [aria-pressed="false"] → "Master"
    │   ├── button [data-view="mid"]     [aria-pressed="true"]  → "Esta variante"
    │   └── button [data-view="preview"] [aria-pressed="false"] → "Preview"
    │
    └── div.ed-grid.c-wall#edGrid (P + S)  [data-view="mid"] [data-screen-label="editor-3-paneles"]
        │
        ├── aside.ed-col.ed-col--lib (P)  [data-screen-label="editor-master"]   ← columna 290px
        │   ├── div.ed-colh (P)
        │   │   ├── span.t-overline (S) → "Master"
        │   │   └── span.n (P)          → "52 items — tu biblioteca"   ⚠ hardcodeado (ver §10)
        │   ├── div.lib-search (P)
        │   │   └── input.c-input#libQ (S) placeholder="Buscar en tu master…"
        │   ├── div#lib (P)   ← inyectado por renderLib(), ver estructura abajo
        │   └── p (inline style: font 400 10px/1.7 var(--font-mono); color var(--text-subtle))
        │         → "Aquí vive todo. La variante solo <b>referencia</b> — si editas el master,
        │            las variantes se actualizan solas."
        │
        ├── section.ed-col.ed-col--mid (P)  [data-screen-label="editor-composicion"] ← minmax(380px,1fr)
        │   ├── div.ed-colh (P)
        │   │   ├── span.t-overline (S) → "Esta variante"
        │   │   └── span.n#midN (P)     → "28 referencias · 0 overrides"  (derivado, ver §10)
        │   ├── div.c-card.var-obj (S + P)
        │   │   ├── label → "Título objetivo" + span (inline) "— el campo que más pesa"
        │   │   ├── input.c-input#objInput (S) value="Backend Engineer" spellcheck="false"
        │   │   └── p.hint (P) → "Si coincide con el título del aviso: <b>10,6× más entrevistas</b>
        │   │                     [Jobscan, 2,5M postulaciones]. Honesto y con tu cargo real al lado:
        │   │                     «Backend Engineer (Ingeniero de Software III)»."
        │   ├── div#mid (P)   ← inyectado por renderMid(), ver estructura abajo
        │   ├── div.var-empty#midEmpty (P) [hidden]
        │   │   ├── span.t-overline (S) → "Variante vacía"
        │   │   └── texto → "Elige del master qué cuenta esta variante.<br>Pulsa <b>+</b> en la
        │   │               biblioteca — nada se copia: se referencia."
        │   └── div (spacer: height:40px)
        │
        └── section.ed-col.pv-col (P)  [data-screen-label="editor-preview"]   ← columna 470px
            ├── div.pv-tools (P)
            │   ├── div.pv-seg (P) [role="group"] [aria-label="Vista del documento"]
            │   │   ├── button#segDoc [aria-pressed="true"]  → "Documento"
            │   │   └── button#segRaw [aria-pressed="false"] → "Cómo lo lee el ATS"
            │   └── span.pv-pages#pvPages (P) → "pág 1 / 2"
            ├── div.pv-scroll (P)
            │   └── div.pv-fit.c-xray#xray (P + S) [data-mode="doc"]
            │       ├── div.c-xray__doc.pv-doc#pvDoc (S + P)   ← inyectado por renderPreview()
            │       └── div.c-xray__raw#pvRawWrap (S)
            │           └── div.pv-raw#pvRaw (P)               ← inyectado por renderRaw()
            └── div.pv-foot (P) → "El preview ES el PDF: mismo motor, mismos cortes de página.
                                   Si el preview miente, el producto miente."

div.demo (S) [role="group"] [aria-label="Estados de la pantalla (revisión de diseño)"]
├── span → "demo"
├── button [data-st="normal"]   [aria-pressed="true"]  → "normal"
├── button [data-st="rayosx"]   [aria-pressed="false"] → "rayos-x"
├── button [data-st="override"] [aria-pressed="false"] → "override"
├── button [data-st="p3"]       [aria-pressed="false"] → "3 páginas"
└── button [data-st="vacia"]    [aria-pressed="false"] → "vacía"
```

### 3.1 · Estructura inyectada en `#lib` (renderLib)

```
div.lib-g (P)                          ← un bloque por grupo
├── span.t-overline (S)                → "Resumen" | "Experiencia · viñetas" | "Skills"
│                                        | "Proyectos" | "Educación"
└── div.lib-row[.in] (P) [data-lib="<id>"]
    ├── span.tx (P)                    ← texto del item (con <b style="color:var(--text)"> en
    │                                    cabeceras de experiencia, skills y educación)
    ├── span.c-ver.c-ver--<tag> (S)    ← SOLO si se pasa `tag` (hoy renderLib NUNCA pasa tag →
    │                                    en la práctica no se emite; el CSS `.lib-row .c-ver` existe)
    └── button.add (P) [title="añadir a la variante" | "quitar de la variante"] → "+" | "✓"
```

- `.lib-row.in` = el item ya está en la variante (texto atenuado + botón "✓" en color `--ver-ok`).
- Grupos, en orden: **Resumen** (`sum`, recortado a 80 chars + "…") · **Experiencia · viñetas**
  (cabecera de cada `e*` + sus viñetas `b*`) · **Skills** (`s1–s4`) · **Proyectos** (`p1–p3`) ·
  **Educación** (`ed1–ed2`).

### 3.2 · Estructura inyectada en `#mid` (renderMid)

```
div.var-g (P)                                     ← un grupo por sección
├── div.gh (P)
│   ├── span.t-overline (S)  → "Resumen" | "Experiencia" | "Habilidades" | "Proyectos" | "Educación"
│   └── span.n (P)           → "las fechas vienen del master"   (solo en Experiencia)
│
├── div.var-exp (P) [data-exp="<expId>"]          ← tarjeta de experiencia (o contenedor de resumen/
│   ├── div.var-eh (P)                              proyectos/educación, sin data-exp)
│   │   ├── span.tt (P)  → título del rol
│   │   └── span.org (P) → "<org> · <fechas>"
│   └── div.var-b (P) [data-b="<id>"] [draggable="true"] [.ovr] [.hid] [.dragging]
│       ├── span.grip (P) [title="arrastra para reordenar"] → "⠿"
│       ├── span.tx (P) [data-edit]  (pasa a contenteditable="true" al pulsar "afinar")
│       └── span.bacts (P)
│           ├── button [data-a="hide"] [title="ocultar en esta variante"] → "👁 ocultar" | "mostrar"
│           ├── button [data-a="edit"] [title="afinar solo aquí"]         → "afinar"
│           └── button [data-a="out"]  [title="quitar de la variante"]    → "×"
│
└── div.var-orig (P)          ← SOLO si el item tiene override (selector `.var-b.ovr + .var-orig`)
    ├── span → "original: <texto del master>"
    └── button.rv (P) [data-rv="<id>"] → "revertir"
```

Bloque de **Habilidades** (distinto: chips, no filas):

```
div.var-g > div.var-chips (P)
└── span.c-chip (S)
    ├── b → nombre del grupo ("Lenguajes" | "Backend" | "Plataforma" | "Idiomas")
    ├── texto → "<n> items"          ← n = s.tx.split(',').length
    └── button [data-out="<id>"] [title="quitar"] → "×"
```

Bloque de **Educación** (filas `.var-b` sin `draggable`, sin `.tx[data-edit]`, con una sola acción):

```
div.var-b (P) [data-b="<edId>"]
├── span.grip (P) → "⠿"
├── span.tx (P)   → "<título> — <org> · <fechas>"
└── span.bacts (P) > button [data-a="out"] → "×"
```

### 3.3 · Estructura inyectada en `#pvDoc` (renderPreview) — el documento

```
div.pv-pagewrap (P)  style="transform:scale(<scale>);width:816px"
└── div.pv-page (P) [.pv-p3 si i>=2]              ← 816×1056 px (carta @96dpi), fondo #FFFFFF
    ├── span.pv-pnum (P) → "pág <n>"
    └── div.inner (P)                              ← inset 68px 76px
        ├── div.cvd-name (P)     → "Diego Gatica Morales"
        ├── div.cvd-label (P)    → valor de #objInput
        ├── div.cvd-contact (P)  → "Email: … · Tel: … · Santiago, Chile" <br> "github.com/dgatica · dgatica.cl"
        ├── div.cvd-h (P)        → "Resumen" | "Habilidades" | "Experiencia" | "Proyectos" | "Educación"
        ├── p.cvd-sum (P)
        ├── p.cvd-skline (P) > b
        ├── div.cvd-erow (P) > span.t + span.d
        ├── div.cvd-org (P)
        └── p.cvd-b (P) > span.num (P)   ← todo run numérico se envuelve en .num (tabular-nums)
```

### 3.4 · Estructura inyectada en `#pvRaw` (renderRaw) — rayos-X

```
div.pv-raw#pvRaw (P)   (white-space:pre-wrap, mono)
├── span.cap (P) → "texto extraído del PDF — esto es lo que indexa el reclutador"
└── texto plano escapado (&, <) con las líneas del CV en el ORDEN del documento
```

---

## 4 · CSS específico de pantalla

Copia **verbatim** del `<style>` sin `data-corpus-system` (líneas 487–607).
**No hay `@keyframes` propios en esta pantalla** — todo el movimiento reutiliza motion.css.

```css
/* ── editor-variante.html — la pantalla más importante. MURO. ── */
.ed-bar{position:sticky;top:var(--header-h);z-index:9;height:52px;background:color-mix(in srgb,var(--bg) 88%,transparent);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.ed-bar .c-container{max-width:none;height:100%;display:flex;align-items:center;gap:14px}
.ed-bar .bk{font:500 var(--fs-ui)/1 var(--font-sans);color:var(--text-muted)}
.ed-bar .nm{font:600 14px/1 var(--font-sans)}
.ed-bar .st{font:400 var(--fs-micro)/1 var(--font-mono);color:var(--text-subtle)}
.ed-bar .acts{margin-left:auto;display:flex;gap:8px;align-items:center}
.ed-grid{display:grid;grid-template-columns:290px minmax(380px,1fr) 470px;gap:1px;background:var(--border);
  height:calc(100vh - var(--header-h) - 52px);min-height:480px}
.ed-col{background:var(--bg);overflow-y:auto;overscroll-behavior:contain}
.ed-col--lib{background:var(--surface-sunken)}
.ed-colh{position:sticky;top:0;z-index:2;display:flex;align-items:baseline;gap:10px;padding:14px 18px 10px;
  background:inherit;border-bottom:1px solid var(--border)}
.ed-colh .t-overline{font-size:10px}
.ed-colh .n{font:400 10px/1 var(--font-mono);color:var(--text-subtle)}
/* ── librería (master) ── */
.lib-search{margin:12px 14px 4px}
.lib-search input{height:34px;font-size:var(--fs-data)}
.lib-g{margin-top:14px}
.lib-g .t-overline{display:block;padding:0 18px 8px;font-size:10px}
.lib-row{display:flex;align-items:baseline;gap:8px;padding:8px 12px 8px 18px;font-size:12.5px;line-height:1.45;color:var(--text-muted)}
.lib-row:hover{background:var(--surface)}
.lib-row .tx{flex:1;min-width:0}
.lib-row.in .tx{color:var(--text-subtle)}
.lib-row .add{flex:none;width:24px;height:24px;border-radius:5px;border:1px solid var(--border-strong);
  font:500 13px/1 var(--font-mono);color:var(--text-muted);display:grid;place-items:center}
.lib-row .add:hover{color:var(--ink-on-patina);background:var(--patina-500);border-color:transparent}
.lib-row.in .add{border-color:transparent;color:var(--ver-ok)}
.lib-row .c-ver{font-size:9px}
/* ── composición (la variante) ── */
.var-obj{margin:16px 18px 6px;padding:16px 18px}
.var-obj label{display:flex;align-items:baseline;gap:10px;font:500 10px/1 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--text-subtle)}
.var-obj input{margin-top:10px;font:600 16px/1.2 var(--font-sans);height:42px;background:var(--surface-sunken)}
.var-obj .hint{margin-top:8px;font:400 var(--fs-micro)/1.6 var(--font-mono);color:var(--text-subtle)}
.var-obj .hint b{color:var(--text-muted);font-weight:500}
.var-g{margin:18px 18px 0}
.var-g>.gh{display:flex;align-items:baseline;gap:10px;padding-bottom:8px}
.var-g>.gh .t-overline{font-size:10px}
.var-g>.gh .n{font:400 10px/1 var(--font-mono);color:var(--text-subtle)}
.var-exp{margin-top:10px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface);overflow:hidden}
.var-eh{display:flex;align-items:baseline;gap:10px;padding:12px 14px 10px}
.var-eh .tt{font:600 13.5px/1.3 var(--font-sans)}
.var-eh .org{font:400 10.5px/1.3 var(--font-mono);color:var(--text-subtle)}
.var-b{position:relative;display:flex;gap:8px;align-items:baseline;padding:8px 14px 8px 10px;border-top:1px solid var(--border);font-size:12.5px;line-height:1.5}
.var-b .grip{flex:none;cursor:grab;color:var(--text-subtle);font-size:11px;padding:2px 2px 0;user-select:none}
.var-b.dragging{opacity:.35}
.var-b .tx{flex:1;min-width:0;color:var(--text-muted)}
.var-b .tx[contenteditable="true"]{outline:none;color:var(--text);background:var(--surface-sunken);border-radius:4px;padding:2px 6px;margin:-2px -6px}
.var-b.hid .tx{opacity:.38;text-decoration:line-through;text-decoration-color:var(--border-strong)}
.var-b.ovr{box-shadow:inset 2px 0 0 var(--patina-500)}
.var-b .bacts{flex:none;display:flex;gap:1px;opacity:0}
.var-b:hover .bacts{opacity:1}
.var-b .bacts button{font:400 11px/1 var(--font-mono);color:var(--text-subtle);padding:4px 6px;border-radius:4px}
.var-b .bacts button:hover{color:var(--text);background:var(--surface-elevated)}
.var-orig{display:none;gap:8px;align-items:baseline;padding:7px 14px 9px 24px;border-top:1px dashed var(--border);
  font:400 11px/1.55 var(--font-mono);color:var(--text-subtle);background:var(--surface-sunken)}
.var-b.ovr+.var-orig{display:flex}
.var-orig .rv{margin-left:auto;flex:none;font:500 10px/1 var(--font-mono);color:var(--accent-text);text-transform:uppercase;letter-spacing:.08em}
.var-orig .rv:hover{text-decoration:underline}
.var-chips{display:flex;flex-wrap:wrap;gap:6px;padding:4px 0 0}
.var-chips .c-chip button{color:var(--text-subtle);font-size:12px;line-height:1;padding:0 0 0 2px}
.var-chips .c-chip button:hover{color:var(--danger)}
.var-empty{margin:60px 24px;text-align:center;color:var(--text-muted);font-size:13px;line-height:1.7}
.var-empty .t-overline{display:block;margin-bottom:12px}
/* ── preview (porcelana dentro de grafito) ── */
.pv-col{display:flex;flex-direction:column;background:var(--surface-sunken)}
.pv-tools{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:12px 16px;
  background:var(--surface-sunken);border-bottom:1px solid var(--border)}
.pv-seg{display:flex;border:1px solid var(--border-strong);border-radius:6px;overflow:hidden}
.pv-seg button{font:500 var(--fs-micro)/1 var(--font-mono);letter-spacing:.04em;padding:8px 11px;color:var(--text-muted)}
.pv-seg button[aria-pressed="true"]{color:var(--text);background:var(--surface-elevated);box-shadow:inset 0 0 0 1px var(--border-patina)}
.pv-pages{margin-left:auto;font:500 var(--fs-micro)/1 var(--font-mono);color:var(--text-muted)}
.pv-pages .warn{color:var(--danger)}
.pv-scroll{flex:1;overflow-y:auto;padding:18px}
.pv-fit{position:relative;margin:0 auto}
.pv-doc{position:relative}
.pv-pagewrap{transform-origin:0 0}
.pv-page{position:relative;width:816px;height:1056px;background:#FFFFFF;color:#14181A;
  box-shadow:0 2px 24px rgba(0,0,0,.5);margin-bottom:30px;overflow:hidden}
.pv-page .inner{position:absolute;inset:68px 76px;font:400 13.3px/1.5 var(--font-sans)}
.pv-pnum{position:absolute;right:-56px;top:8px;font:500 10px/1 var(--font-mono);color:var(--text-subtle)}
.pv-p3{outline:2px dashed color-mix(in srgb,var(--danger) 55%,transparent);outline-offset:4px}
/* tipografía del documento (espejo de 05-documento-cv, 1pt≈1.333px) */
.cvd-name{font:600 29px/1.15 var(--font-display);color:#1F6E5A;letter-spacing:.002em}
.cvd-label{margin-top:3px;font:500 14.7px/1.3 var(--font-sans);color:#14181A}
.cvd-contact{margin-top:8px;font:400 12px/1.5 var(--font-sans);color:#454B49}
.cvd-h{margin:22px 0 6px;font:600 12px/1 var(--font-sans);letter-spacing:.12em;text-transform:uppercase;color:#1F6E5A;
  padding-bottom:5px;border-bottom:1px solid #D9DCD8}
.cvd-sum{color:#14181A}
.cvd-skline{margin-top:3px}
.cvd-skline b{font-weight:600}
.cvd-erow{display:flex;justify-content:space-between;align-items:baseline;margin-top:12px}
.cvd-erow .t{font-weight:600;font-size:14px}
.cvd-erow .d{font:400 12px/1.4 var(--font-sans);color:#454B49;white-space:nowrap;padding-left:16px}
.cvd-org{font-size:12.7px;color:#454B49;margin-top:1px}
.cvd-b{margin-top:5px;padding-left:16px;text-indent:-10px}
.cvd-b .num{font-variant-numeric:tabular-nums}
.cvd-mini{margin-top:4px}
/* rayos-X */
.pv-xray{position:relative}
.pv-raw{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);
  padding:26px 28px;font:400 11.5px/1.75 var(--font-mono);color:var(--text-muted);white-space:pre-wrap;overflow:auto}
.pv-raw .cap{display:block;margin-bottom:16px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-subtle)}
.pv-foot{padding:10px 16px;border-top:1px solid var(--border);font:400 10px/1.6 var(--font-mono);color:var(--text-subtle)}
@media (max-width:1240px){.ed-grid{grid-template-columns:250px 1fr 400px}}
@media (max-width:1024px){
  .ed-grid{grid-template-columns:1fr;height:auto}
  .ed-col{max-height:none}
  .ed-col--lib,.pv-col{display:none}
  .ed-grid[data-view="master"] .ed-col--lib{display:block}
  .ed-grid[data-view="master"] .ed-col--mid{display:none}
  .ed-grid[data-view="preview"] .pv-col{display:flex}
  .ed-grid[data-view="preview"] .ed-col--mid{display:none}
  .ed-tabs{display:flex!important}
}
.ed-tabs{display:none;position:sticky;top:calc(var(--header-h) + 52px);z-index:8;background:var(--bg);border-bottom:1px solid var(--border);padding:8px var(--container-pad);gap:6px}
.ed-tabs button{font:500 var(--fs-micro)/1 var(--font-mono);padding:8px 12px;border:1px solid var(--border);border-radius:6px;color:var(--text-muted)}
.ed-tabs button[aria-pressed="true"]{color:var(--accent-text);border-color:var(--border-patina);background:var(--surface)}
```

**Notas de CSS muerto** (definido pero nunca usado en el DOM/JS de esta pantalla):
`.pv-xray` (el DOM usa `.pv-fit.c-xray`) · `.cvd-mini` · `.lib-row .c-ver` (renderLib nunca pasa
`tag`, así que el `<span class="c-ver …">` no llega a emitirse). Portarlos igual: son contrato.

---

## 5 · Estados del panel demo

Los 5 del handoff: `normal · rayos-x · override · 3 páginas · vacía` → `data-st`:
`normal` · `rayosx` · `override` · `p3` · `vacia`.

**Todos** empiezan con `VAR = freshVar()` y `setMode('doc')`. Los botones alternan `aria-pressed`.

| Estado | `data-st` | Qué cambia en el DOM | Cómo se activa |
|---|---|---|---|
| **normal** | `normal` | Estado base: 28 referencias, 0 overrides, 2 páginas. `#pvPages` = "pág 1 / 2". `#xray[data-mode="doc"]`. | `VAR=freshVar(); setMode('doc'); update()` |
| **rayos-x** | `rayosx` | Igual que normal + a los **350 ms** conmuta a `#xray[data-mode="raw"]`: `.c-xray__doc` se desvanece (opacity 0 + blur 12px + saturate 0) y `.c-xray__raw` aparece. `#segRaw[aria-pressed=true]`. | `update(); setTimeout(()=>setMode('raw'),350)` |
| **override** | `override` | Inyecta 2 overrides: `VAR.ovr.b1` y `VAR.ovr.sum`. Esas filas ganan `.var-b.ovr` (hairline de pátina `inset 2px 0 0 var(--patina-500)` a la izquierda) y aparece el `.var-orig` hermano (`display:flex` vía `.var-b.ovr+.var-orig`) con "original: …" + botón "revertir". `#midN` = "28 referencias · 2 overrides". `flash(...)`. | `VAR.ovr.b1=…; VAR.ovr.sum=…; update(); flash('2 overrides — hairline de pátina a la izquierda; el original sigue a la vista')` |
| **3 páginas** | `p3` | Añade `b19` y `b24` a `VAR.inc`; infla **toda** viñeta y proyecto visible con un `PAD` de relleno (~3 líneas) y alarga el summary → el paginador produce ≥3 páginas. La 3ª+ recibe `.pv-p3` (outline punteado en `--danger`). `#pvPages` = `<span class="warn">⚠ 3 páginas — la página 3 no existe para el reclutador [Ladders]</span>`. | ver JS §6 |
| **vacía** | `vacia` | `VAR.inc=new Set(); VAR.hid=new Set(); VAR.ovr={}` → `#mid` queda vacío, `#midEmpty` deja de estar `hidden`, `#midN` = "0 referencias · 0 overrides". El preview conserva solo la cabecera (nombre + título + contacto) → 1 página. Toda `.lib-row` pierde `.in` y sus botones vuelven a "+". | `VAR.inc=new Set();…; update()` |

> El estado `p3` **muta `MASTER`** (escribe `VAR.ovr[b.id]` desde `b.tx`, pero `b.tx` no se toca;
> lo que persiste entre estados es que `VAR=freshVar()` limpia los overrides, así que es reversible).

---

## 6 · Comportamiento JS de la pantalla

Todo el JS fuera de `data-corpus-system` (líneas 962–1271), IIFE con `'use strict'`.
Alias: `$` = querySelector · `$$` = querySelectorAll (array) · `M = window.CorpusMotion`.

### 6.1 · Modelo de datos

- **`MASTER`** — biblioteca canónica con **ids estables**: `summary{id:'sum'}` · `exp[e1..e4]` (cada
  uno con `bullets[]` de ids `b*`) · `skills[s1..s4]` · `proj[p1..p3]` · `edu[ed1,ed2]`.
- **`BASICS`** — `{name, email, tel, loc, web, gh}`.
- **`VAR`** = la variante: **referencia + overrides + ocultos + orden**.
  ```js
  function freshVar(){return{
    obj:'Backend Engineer',
    inc:new Set(['sum','e1','b1','b4','b5','b8','b6','b7','e2','b9','b13','b12','b14','e3','b16','b17','e4','b21','b22','s1','s2','s3','s4','p1','p2','p3','ed1','ed2']),
    hid:new Set(),ovr:{}, order:{}
  }}
  ```
- **`byId`** — índice plano; a cada viñeta se le añade `exp` (id de su experiencia padre).
- **`textOf(id)`** → `VAR.ovr[id] ?? byId[id].tx` — **el override gana siempre**.
- **`bulletsOf(e)`** → viñetas incluidas de la experiencia `e`, aplicando `VAR.order[e.id]` si existe
  (ids reordenados primero, los no listados después).

### 6.2 · Funciones de render

| Función | Qué hace |
|---|---|
| `renderLib(q)` | Pinta `#lib`. Filtra por substring lowercase de `q`. Marca `.in` los ids en `VAR.inc`. |
| `renderMid()` | Pinta `#mid`. Grupos: Resumen · Experiencia · Habilidades (chips) · Proyectos · Educación. Actualiza `#midN` y el `hidden` de `#midEmpty`. |
| `bRow(id)` | HTML de una fila `.var-b` (+ `.var-orig` si hay override). |
| `blocks()` | Convierte el estado en un array de bloques HTML del documento (cabecera, Resumen, Habilidades, Experiencia, Proyectos, Educación). Envuelve todo run numérico en `<span class="num">` con `/(\d[\d.,%~½]*)/g`. |
| `renderPreview()` | **La pieza crítica.** Pagina de verdad (ver 6.3). |
| `renderRaw()` | Genera el texto plano del rayos-X **desde el ESTADO, no del DOM** (comentario literal: *"los runs pegados son exactamente el bug que este producto denuncia"*). Escapa `&` y `<`. |
| `setMode(m)` | `M.xray($('#xray'), m)` + sincroniza `aria-pressed` de `#segDoc`/`#segRaw`. |
| `flash(msg)` | Escribe `msg` en `#edState`, lo pinta con `var(--accent-text)` y a los **2600 ms** lo devuelve a `"al día · guardado"` con color por defecto. Reentrante (`clearTimeout(flash.t)`). |
| `update()` | `renderLib($('#libQ').value); renderMid(); renderPreview()` |

### 6.3 · Paginación real (el preview ES el PDF)

```js
const PAGE_H = 1056 - 68*2;   // 920px de caja útil
```
1. Crea un div de medición **fuera de pantalla** (`position:absolute;visibility:hidden;left:-9999px;top:0;width:664px`)
   con un `inner` en `display:flow-root; width:664px; font:400 13.3px/1.5 var(--font-sans)`.
2. Inserta bloque a bloque; si `inner.scrollHeight > PAGE_H` **y** la página actual no está vacía →
   abre página nueva y reinicia `inner.innerHTML = b.html`.
3. Comentario literal del autor: *"El error posible queda del lado honesto: nunca se recorta contenido."*
4. `scale = Math.min(1, (($('.pv-scroll').clientWidth || 470) - 36) / 816)` → el `.pv-pagewrap` se
   escala con `transform:scale(scale)` y `#pvDoc` recibe `height = (pages.length*(1056+30))*scale + 'px'`.
5. `#pvPages`: si `n<=2` → `'pág ' + Math.min(n,1) + ' / ' + n`; si `n>2` →
   `'<span class="warn">⚠ '+n+' páginas — la página 3 no existe para el reclutador [Ladders]</span>'`.
6. Al final llama `renderRaw()`.

> **`Math.min(n,1)` siempre vale 1** — no es un bug de recorte, es literalmente "pág 1 / n".
> Reproducir tal cual o documentar la decisión antes de "arreglarlo".

### 6.4 · Listeners

| Evento | Selector | Qué hace |
|---|---|---|
| `input` | `#libQ` | `renderLib(e.target.value)` |
| `click` | `#lib` (delegado, solo si el target está dentro de `.add`) | Toggle de `VAR.inc`. Al **añadir** una viñeta, añade también su experiencia padre (`VAR.inc.add(it.exp)`). Luego `update()`. |
| `click` | `#mid` (delegado) | `[data-out]` → `VAR.inc.delete(id)`. `[data-rv]` → `delete VAR.ovr[id]` + `flash('override revertido — vuelve a seguir al master')`. `[data-a="hide"]` → toggle `VAR.hid`. `[data-a="out"]` → `VAR.inc.delete(id)`. `[data-a="edit"]` → ver abajo. |
| `dragstart` / `dragend` / `dragover` | `#mid` (delegado) | Reordenar viñetas **solo dentro de su misma experiencia** (`de.exp !== oe.exp || !de.exp` → aborta). Calcula el índice con `e.clientY < r.top + r.height/2` y escribe `VAR.order[de.exp]`. Repinta con `renderMid(); renderPreview()`. |
| `click` | `#segDoc` / `#segRaw` | `setMode('doc')` / `setMode('raw')` |
| `input` | `#objInput` | `renderPreview()` (el título objetivo alimenta `.cvd-label` y la 2ª línea del rayos-X) |
| `click` | `#btnPdf` | `flash('el PDF se genera del mismo estado que ves — sin sorpresas')` — **no descarga nada en el mock**. |
| `click` | `.ed-tabs button` | Sincroniza `aria-pressed`, escribe `#edGrid.dataset.view`, y si es `preview` → `renderPreview()`. |
| `click` | `.demo button` | Ver §5. |
| `resize` | `window` | `renderPreview()` (recalcula `scale` y la paginación) |
| `document.fonts.ready` | — | `renderPreview()` — **imprescindible**: sin fuentes cargadas la medición miente. |

**Edición in situ (`data-a="edit"` → "afinar"):**
```js
const tx=b.querySelector('.tx');tx.contentEditable='true';tx.focus();
document.getSelection().selectAllChildren(tx);document.getSelection().collapseToEnd();
const fin=()=>{tx.contentEditable='false';
  const v=tx.textContent.trim();
  if(v&&v!==byId[id].tx){VAR.ovr[id]=v;flash('override guardado — solo en esta variante')}
  else if(v===byId[id].tx)delete VAR.ovr[id];
  update()};
tx.addEventListener('blur',fin,{once:true});
tx.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();tx.blur()}});
```
→ Si el texto vuelve a ser **idéntico** al del master, el override se **borra** solo.

### 6.5 · Llamadas al sistema

- `M.xray($('#xray'), m)` — única API de motion usada de forma explícita en interacción
  (`CorpusMotion.xray(root, mode)` escribe `root.dataset.mode`; la transición C2/360 ms vive en
  motion.css sobre `.c-xray__doc` / `.c-xray__raw`).
- `M.boot()` — al final del IIFE. Dibuja hairlines `.c-divider` y revela `[data-reveal]`.
  (En esta pantalla **no hay** `.c-divider` ni `[data-reveal]`, así que es un no-op defensivo.)
- `CorpusAurora.*` — **ninguna llamada**. Ver §2.
- **No hay** `CorpusMotion.stagger` · `reveal` · `words/chars` · `counter` · `shimmer` · `enter` ·
  `io` en esta pantalla. Cero scroll-reveal, cero shimmer: es un editor.

### 6.6 · Arranque

```js
window.addEventListener('resize',()=>renderPreview());
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>renderPreview());
update();M.boot();
```

### 6.7 · Atajos de teclado

**Ninguno propio.** El único `keydown` es el `Enter` que cierra la edición in situ de una viñeta
(`ev.preventDefault(); tx.blur()`). Los atajos `j/k/a/d/o` que menciona el handoff son **de staging**,
no de aquí.

---

## 7 · Copy (verbatim, ES)

Marcado: **[copy.md]** = aparece literal en `06-handoff/copy.md` (§"Editor de variante" salvo nota) ·
**[no en copy.md]** = solo existe en el HTML.

### Cabecera y barra
| Cadena | Fuente |
|---|---|
| `Corpus` (logo) | [no en copy.md] — sistema |
| `Panel` · `Master` · `Variantes` · `Fuentes` · `Ajustes` | [no en copy.md] — nav |
| `ES` / `EN` · `DG` | [no en copy.md] |
| `← Variantes` | [no en copy.md] |
| `Backend — Fintech` (nombre de variante, editable) | [no en copy.md] — dato del mock |
| `al día · guardado` | [no en copy.md] |
| `Adaptar a un aviso` | [no en copy.md] |
| `Salud` | [no en copy.md] |
| `Descargar PDF` | [no en copy.md] |

### Tabs móviles
| Cadena | Fuente |
|---|---|
| `Master` · `Esta variante` · `Preview` | [no en copy.md] |

### Columna master (biblioteca)
| Cadena | Fuente |
|---|---|
| `Master` (overline) | [no en copy.md] |
| `52 items — tu biblioteca` | [no en copy.md] — la cifra 52 sí es canónica (copy.md §Variantes/§Staging) |
| `Buscar en tu master…` (placeholder) | [no en copy.md] |
| `Resumen` · `Experiencia · viñetas` · `Skills` · `Proyectos` · `Educación` (overlines de grupo) | [no en copy.md] |
| `añadir a la variante` / `quitar de la variante` (title de `.add`) | [no en copy.md] |
| **`Aquí vive todo. La variante solo referencia — si editas el master, las variantes se actualizan solas.`** | **[copy.md]** — «biblioteca», literal |

### Columna composición
| Cadena | Fuente |
|---|---|
| `Esta variante` (overline) | [no en copy.md] |
| `<n> referencias · <m> overrides` | [no en copy.md] |
| `Título objetivo` | **[copy.md]** (encabezado del bloque) |
| `— el campo que más pesa` | **[copy.md]** |
| **`Si coincide con el título del aviso: 10,6× más entrevistas [Jobscan, 2,5M postulaciones]. Honesto y con tu cargo real al lado: «Backend Engineer (Ingeniero de Software III)».`** | **[copy.md]** — ⚠ copy.md usa comillas curvas `“…”`, el HTML usa guillemets `«…»` (ver §Contradicciones) |
| `Backend Engineer` (valor de `#objInput`) | [no en copy.md] — dato del mock |
| `Resumen` · `Experiencia` · `Habilidades` · `Proyectos` · `Educación` (overlines) | [no en copy.md] |
| `las fechas vienen del master` | [no en copy.md] |
| `⠿` (grip) + title `arrastra para reordenar` | [no en copy.md] |
| `👁 ocultar` / `mostrar` + title `ocultar en esta variante` | [no en copy.md] |
| `afinar` + title `afinar solo aquí` | [no en copy.md] |
| `×` + title `quitar de la variante` / `quitar` | [no en copy.md] |
| **`original: …`** + **`revertir`** | **[copy.md]** — «override · original: … · revertir» |
| `<n> items` (chips de skills) | [no en copy.md] |
| `Variante vacía` | [no en copy.md] |
| `Elige del master qué cuenta esta variante.` | [no en copy.md] |
| `Pulsa + en la biblioteca — nada se copia: se referencia.` | [no en copy.md] |

### Columna preview
| Cadena | Fuente |
|---|---|
| `Vista del documento` (aria-label) | [no en copy.md] |
| **`Documento`** / **`Cómo lo lee el ATS`** | **[copy.md]** — «rayos-X, etiquetas» |
| **`pág 1 / 2`** | **[copy.md]** — «páginas» |
| **`⚠ 3 páginas — la página 3 no existe para el reclutador [Ladders]`** | **[copy.md]** — «páginas» |
| `pág <n>` (numeración lateral `.pv-pnum`) | [no en copy.md] |
| **`texto extraído del PDF — esto es lo que indexa el reclutador`** | **[copy.md]** — «rayos-X, leyenda» |
| **`El preview ES el PDF: mismo motor, mismos cortes de página. Si el preview miente, el producto miente.`** | **[copy.md]** — «pie del preview», literal |
| Encabezados del documento: `Resumen` · `Habilidades` · `Experiencia` · `Proyectos` · `Educación` | [no en copy.md] |
| `Email: ` · ` · Tel: ` (etiquetas de contacto) | [no en copy.md] |
| `RESUMEN` · `HABILIDADES` · `EXPERIENCIA` · `PROYECTOS` · `EDUCACIÓN` (rayos-X, mayúsculas) | [no en copy.md] |

### Mensajes de `flash()` (van a `#edState`)
| Cadena | Fuente |
|---|---|
| **`override guardado — solo en esta variante`** | **[copy.md]** — «override», literal |
| `override revertido — vuelve a seguir al master` | [no en copy.md] |
| `2 overrides — hairline de pátina a la izquierda; el original sigue a la vista` | [no en copy.md] — solo estado demo |
| `el PDF se genera del mismo estado que ves — sin sorpresas` | [no en copy.md] |
| `al día · guardado` (estado en reposo) | [no en copy.md] |

### Panel demo (no es producto)
`demo` · `normal` · `rayos-x` · `override` · `3 páginas` · `vacía` ·
aria-label `Estados de la pantalla (revisión de diseño)`. [no en copy.md — es convención de entrega]

---

## 8 · Accesibilidad

**Lo que el HTML SÍ hace:**
- `<html lang="es" data-theme="dark">`.
- `aria-current="page"` en `Variantes` del `hd-nav`.
- `.pv-seg` → `role="group"` `aria-label="Vista del documento"`; sus botones usan
  `aria-pressed="true|false"` (sincronizado en `setMode`).
- `.demo` → `role="group"` `aria-label="Estados de la pantalla (revisión de diseño)"`;
  botones con `aria-pressed`.
- `.ed-tabs` → `role="tablist"`; botones con `aria-pressed` y `data-view`.
- Botones e inputs son elementos nativos (`<button>`, `<input>`, `<a>`) → focus y Enter/Espacio
  gratis. `:focus-visible` con anillo `--focus-ring` viene de base.css.
- `.var-b .grip` tiene `title="arrastra para reordenar"`; los botones de acción tienen `title`.
- Los niveles de verificación (`.c-ver--ok/partial/none`) **nunca son solo color**: llevan glifo
  (`●` `◐` `⚠`) por `::before` — aquí el CSS está preparado aunque renderLib no emita el span hoy.
- El sistema pausa la aurora al enfocar cualquier campo (`focusin` en motion.js) — aquí es moot
  porque no hay aurora, pero el editor sigue siendo "sagrado".
- `prefers-reduced-motion`: todo el movimiento (incluida la transición de rayos-X) vive bajo
  `@media (prefers-reduced-motion: no-preference)`; el estado base es el final → se pierde el
  movimiento, nunca la información.

**Orden de foco (DOM order):**
1. Logo → nav (Panel, Master, Variantes, Fuentes) → Ajustes → (hd-lang/hd-av no son focusables)
2. `← Variantes` → `.nm` (contenteditable, focusable) → `Adaptar a un aviso` → `Salud` → `Descargar PDF`
3. Tabs (solo ≤1024px)
4. Columna master: `#libQ` → cada `.lib-row .add`
5. Columna composición: `#objInput` → botones de `.bacts` de cada viñeta → `.rv` de cada `.var-orig`
6. Columna preview: `#segDoc` → `#segRaw`
7. Panel `demo`

**Atajos de teclado:** ninguno propio (solo `Enter` para cerrar la edición in situ). Ver §6.7.

**Huecos de a11y que hay que arreglar al portar (no están resueltos en el HTML):**

| Hueco | Detalle |
|---|---|
| `#edState` no es live region | Los `flash()` ("override guardado…", "el PDF se genera…") cambian texto sin `role="status"` / `aria-live="polite"` → un lector de pantalla no los anuncia. **Añadir `role="status"`.** |
| `role="tablist"` sin `role="tab"` | `.ed-tabs` declara tablist pero sus hijos son `<button aria-pressed>`, no `role="tab"` con `aria-selected`/`aria-controls`. O se completa el patrón ARIA, o se quita el `role="tablist"` y se deja como grupo de botones toggle. |
| Reordenar solo con ratón | El drag & drop de `.var-b` no tiene equivalente por teclado (no hay `↑`/`↓`). |
| Hit targets < 44px | `.lib-row .add` = **24×24 px**; los botones de `.bacts` ≈ 19px de alto (11px de fuente + 4px/6px de padding). El handoff exige **≥ 44 px en móvil** y las columnas master/mid **sí se muestran en móvil** (vía tabs). |
| `.bacts` con `opacity:0` hasta hover | Las acciones de viñeta (ocultar/afinar/quitar) son invisibles sin hover → inalcanzables de facto en táctil, y sin `:focus-within` que las revele al tabular. |
| `.pv-page` es contenido, no imagen | El documento renderizado va sin `role`/`aria-label`; el rayos-X (`#pvRaw`) es en realidad la versión accesible del mismo contenido. Conviene marcar el documento como decorativo/complementario del texto plano o exponer ambos coherentemente. |
| Contraste del documento | `.pv-page` fija `#FFFFFF`/`#14181A` y `.cvd-name`/`.cvd-h` en `#1F6E5A` — porcelana dentro de grafito, **a propósito**: es papel. No lo "adaptes" al tema oscuro. |

---

## 9 · Datos del mock

**Persona: Diego Gatica** (ficticia, la misma en todas las pantallas y en `datos-ejemplo.json`).

```js
BASICS = {
  name: 'Diego Gatica Morales',
  email:'diego.gatica@ejemplo.cl',
  tel:  '+56 9 6123 4567',
  loc:  'Santiago, Chile',
  web:  'dgatica.cl',
  gh:   'github.com/dgatica'
}
```
Iniciales del avatar: `DG`. Nombre de la variante: **`Backend — Fintech`**. Título objetivo:
**`Backend Engineer`**.

**Resumen (`sum`):** «Backend developer con 6 años construyendo servicios de pago y e-commerce en Go
y Node.js. A cargo del servicio de conciliación de Altiplano Pagos (~40.000 transacciones diarias).
Busco problemas de plataforma con datos de verdad.»

**Experiencia:**

| id | Rol | Organización | Lugar | Fechas | Viñetas (ids) |
|---|---|---|---|---|---|
| `e1` | Backend Developer | Altiplano Pagos SpA | Santiago, Chile | mar 2022 – hoy | b1, b4, b5, b7, b8, b6 |
| `e2` | Backend Developer — equipo Checkout | Rayén Retail S.A. | Santiago, Chile | ene 2020 – feb 2022 | b9, b13, b12, b14 |
| `e3` | Desarrollador freelance | Independiente | Santiago, Chile | 2019 – 2020 | b16, b17, b19 |
| `e4` | Práctica profesional — Área TI | Universidad Andrés Bello | Santiago, Chile | 2018 – 2019 | b21, b22, b24 |

Viñetas (texto literal):
- `b1` A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias).
- `b4` Escribí la librería interna de idempotencia (Go) adoptada por otros equipos de la empresa.
- `b5` Mantengo los pipelines de CI/CD del equipo (GitHub Actions).
- `b7` Documenté la API pública de conciliación (OpenAPI 3.1).
- `b8` Mentoreo a 2 desarrolladores junior del equipo de pagos.
- `b6` Turno de soporte (on-call) una semana al mes.
- `b9` Desarrollé y mantuve APIs del checkout (Node.js, PostgreSQL).
- `b13` Implementé el flujo de cupones y descuentos del checkout.
- `b12` Atendí incidentes de producción durante cyber days.
- `b14` Automaticé reportes de ventas diarios para operaciones.
- `b16` Construí sitios y APIs para 4 pymes chilenas.
- `b17` Sistema de reservas para un centro deportivo (Django).
- `b19` Administré hosting y dominios de clientes.  *(fuera de la variante base; entra en el estado `p3`)*
- `b21` Soporte a la plataforma de matrícula en periodos peak.
- `b22` Scripts de migración de datos de alumnos (Python).
- `b24` Documenté procesos del área para nuevos practicantes.  *(fuera de la variante base; entra en `p3`)*

**Skills:** `s1` Lenguajes: Go, Python, SQL, TypeScript · `s2` Backend: PostgreSQL, Redis, gRPC,
OpenAPI, Node.js, Django · `s3` Plataforma: Docker, GitHub Actions, Linux, Bash ·
`s4` Idiomas: Español nativo, Inglés B2

**Proyectos:** `p1` idempotency-go — librería open source de idempotencia en Go (github.com/dgatica).
· `p2` reservas-club — sistema de reservas en Django, en producción desde 2020 (dgatica.cl).
· `p3` scraper-sii — CLI en Python para series de tipo de cambio del SII.

**Educación:** `ed1` Ingeniería Civil en Computación e Informática — Universidad Andrés Bello ·
2014 – 2019 · `ed2` Diplomado en Ingeniería de Datos — Pontificia Universidad Católica de Chile · 2022

**Overrides del estado `override`:**
- `b1` → «Lidero el servicio de conciliación de pagos en Go para 3 bancos (~40.000 transacciones diarias).»
- `sum` → «Backend engineer con 6 años en pagos y fintech. A cargo de la conciliación en Altiplano
  Pagos (~40.000 tx/día). Interés directo en infraestructura de pagos regional.»

---

## 10 · Números en la UI

Regla del producto: **ningún número sin fuente**. Nada de score, %, confidence, umbrales inventados.

| Número visible | Dónde | De dónde sale | ¿Con fuente? |
|---|---|---|---|
| `52 items — tu biblioteca` | `.ed-colh .n` de la columna master | **Hardcodeado en el HTML.** Es la cifra canónica del mock (copy.md §Variantes: «Tu master tiene 52 items»; §Staging: «52 items entraron a tu master»). | ✔ Coherente entre pantallas, **✗ NO derivado del `MASTER` de esta pantalla** (ver aviso abajo). |
| `<n> referencias · <m> overrides` (`#midN`) | `.ed-colh .n` de la composición | Derivado: `VAR.inc.size` y `Object.keys(VAR.ovr).length`. Base = **28 referencias · 0 overrides**. | ✔ Derivado del estado |
| `10,6× más entrevistas` | `.var-obj .hint` | Copy fijo | ✔ **[Jobscan, 2,5M postulaciones]** — la fuente va impresa al lado |
| `2,5M postulaciones` | `.var-obj .hint` | Copy fijo (es el tamaño de la muestra de la fuente) | ✔ Es la propia cita |
| `<n> items` en los chips de skills | `.var-chips .c-chip` | Derivado: `s.tx.split(',').length` → Lenguajes **4**, Backend **6**, Plataforma **4**, Idiomas **2** | ✔ Derivado del dato |
| `pág 1 / 2` (`#pvPages`) | `.pv-pages` | Derivado de la paginación real (`pages.length`) | ✔ Derivado del motor de paginado |
| `pág <n>` (`.pv-pnum`) | Lateral de cada página | Índice de página real | ✔ |
| `⚠ 3 páginas — la página 3 no existe para el reclutador` | `.pv-pages .warn` | `n` de la paginación real | ✔ **[Ladders]** — la fuente va impresa |
| Cifras del CV (`~40.000 transacciones diarias`, `6 años`, `2 desarrolladores junior`, `4 pymes`, `3 bancos`, `~40.000 tx/día`, `OpenAPI 3.1`, fechas `2014 – 2019`…) | `.cvd-b .num`, `.cvd-erow .d`, rayos-X | Datos del master del usuario (`MASTER` / `VAR.ovr`) — el usuario los afirmó | ✔ Origen = el propio registro |
| `816` / `1056` / `68` / `76` / `664` / `920` | No visibles | Geometría del documento (carta @96dpi, márgenes) | n/a — no son UI |

**Veredicto: no hay ningún score, ni %, ni "confidence", ni umbral inventado en esta pantalla.**
Cumple la decisión nº 6 del README y la nº 4 del handoff. El único `%` que aparece en el código está
en la regex de `blocks()` (`/(\d[\d.,%~½]*)/g`) y sirve para **envolver** cifras del usuario en
`.num`, no para inventar ninguna.

**⚠ Aviso (el único sospechoso):** `52 items — tu biblioteca` es una cadena estática mientras que el
`MASTER` de este mock contiene **30 ids direccionables** (1 resumen + 4 experiencias + 16 viñetas +
4 skills + 3 proyectos + 2 educación) y `#midN` muestra `28 referencias`. En pantalla conviven un
"52" hardcodeado, una lista de 30 filas y un contador de 28. En React **el 52 debe derivarse del
master real** (`master.items.length`), nunca escribirse a mano — si no, es exactamente el "número sin
fuente" que este producto denuncia.

---

## Anexo · Contradicciones y riesgos de implementación

**Contradicciones detectadas** (HTML vs handoff/copy/README):

1. **`52 items` hardcodeado** vs 30 items reales en el `MASTER` del mock y `28 referencias` en `#midN`.
   La cifra 52 es canónica entre pantallas (copy.md), pero aquí no está derivada. Ver §10.
2. **Comillas del hint del título objetivo:** copy.md escribe `“Backend Engineer (Ingeniero de
   Software III)”` (comillas curvas) y el HTML `«Backend Engineer (Ingeniero de Software III)»`
   (guillemets). Decidir cuál es la canónica y aplicarla en los dos sitios.
3. **Hit targets:** handoff exige `hit targets móviles ≥ 44 px`; `.lib-row .add` mide 24×24 px y los
   botones de `.bacts` ~19 px de alto, y **ambas columnas se muestran en móvil** vía `.ed-tabs`.
4. **`role="tablist"` sin `role="tab"`**: patrón ARIA a medias (§8).
5. `renderLib` acepta un parámetro `tag` para emitir `<span class="c-ver c-ver--…">` pero **nunca lo
   pasa** → los niveles de verificación (verificado/parcial/sin evidencia) **no se ven en la
   biblioteca del editor**, aunque el CSS `.lib-row .c-ver{font-size:9px}` los prevé. Contradice el
   espíritu de "cada item recuerda de dónde salió" (copy.md §Master), pero es lo que el HTML hace:
   **reproducirlo tal cual** salvo decisión explícita en contrario.
6. `.pv-xray` y `.cvd-mini` están definidos en el CSS y **no se usan**. Portarlos igual (son contrato)
   o borrarlos con acuerdo explícito.
7. `renderMid()` calcula `const nb = [...VAR.inc].filter(...).length` y **nunca lo usa** (código
   muerto). No lo "recuperes" inventándole un uso.

**Riesgos al portar a React (se rompen si no se cuidan):**

- **La paginación es medición real del DOM**, no una estimación. Si React la sustituye por un cálculo
  aproximado, se rompe la promesa nº 6 del handoff ("el preview del editor ES el PDF") y el golden
  test de CI (`05-documento-cv/ESPECIFICACION.md §6`). Hay que conservar: el div de medición fuera de
  pantalla, `width:664px`, `display:flow-root`, `PAGE_H = 1056-68*2 = 920`, y la regla "si se pasa,
  página nueva y el bloque arranca la siguiente" — **nunca se recorta contenido**.
- **`document.fonts.ready` → `renderPreview()`**: sin esto, la primera paginación se mide con la
  fuente fallback y sale mal. En React va en un `useEffect` con `document.fonts.ready.then(...)`.
- **`resize` → `renderPreview()`**: el `scale` depende de `.pv-scroll .clientWidth`. Usar
  `ResizeObserver` sobre `.pv-scroll` es aceptable; eliminar el recálculo no lo es.
- **El rayos-X se genera del ESTADO, no del DOM** (comentario explícito en el código). Si alguien lo
  implementa con `innerText` del preview, reintroduce exactamente el bug de "runs pegados" que el
  producto denuncia. Es la línea roja de esta pantalla.
- **`textOf()` = el override gana siempre**, y si el texto editado vuelve a igualar al del master, el
  override se **elimina** solo. Reproducir esa autolimpieza.
- **Añadir una viñeta arrastra su experiencia padre** (`VAR.inc.add(it.exp)`). Sin eso, aparecen
  viñetas huérfanas.
- **El drag & drop solo reordena dentro de la misma experiencia** (`de.exp !== oe.exp` aborta). Una
  librería de DnD genérica permitirá cruzar experiencias: hay que bloquearlo.
- **`.var-b.ovr + .var-orig`** es un selector de hermano adyacente: en React, `.var-orig` debe seguir
  siendo el **hermano inmediato** de `.var-b`, no un hijo. Si se anida, el override deja de verse.
- **`.ed-grid` usa `gap:1px` + `background:var(--border)`** para pintar las hairlines. Un
  `border-right` por columna NO es equivalente (se rompe en el layout de 1 columna a ≤1024px).
- **`.pv-page` es porcelana fija (#FFFFFF/#14181A/#1F6E5A) dentro del tema oscuro.** No tokenizar: es
  papel, no UI.
- **`contenteditable` en `.nm` y en `.tx`**: React y `contenteditable` se llevan mal. O se usa un
  componente no controlado (`suppressContentEditableWarning` + refs, leyendo en `blur`), o se
  sustituye por un `<input>`/`<textarea>` — pero el estilo visual (sin caja, inline, `.tx[contenteditable="true"]`
  con fondo `--surface-sunken`) es contrato y debe conservarse.
- **`flash()` debe convertirse en live region** (`role="status"`) al portar, o los overrides se guardan
  en silencio para quien usa lector de pantalla.
- **No montar la aurora.** Es un muro. (§2)