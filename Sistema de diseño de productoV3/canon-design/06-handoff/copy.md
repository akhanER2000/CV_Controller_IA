# copy.md — todo el copy del producto · ES + EN

> **El copy ES el producto.** La diferencia entre *"Faltan 7 keywords — tu match es 62%"* (Jobscan)
> y *"El aviso pide Kubernetes. No aparece en tu master. ¿Lo usaste y no lo registraste, o es una
> brecha real?"* (nosotros) es la tesis entera. Tono: **sereno, competente, sin drama.** Sin
> exclamaciones, sin coach, sin gamificación. Ningún número sin fuente. Nunca decimos que
> verificamos: **enseñamos la verificación.**
>
> Convención: cada entrada trae **ES** y **EN**. Los `{tokens}` son variables. No traducir literal:
> adaptar el registro (el EN es más directo; el ES, más sobrio).

---

## 0 · Marca y global

| Clave | ES | EN |
|---|---|---|
| `brand` | Corpus | Corpus |
| `tagline` | El sistema de registro de tu carrera. | The system of record for your career. |
| `brand.sub` | Un registro. Todas las versiones son vistas de él. | One record. Every version is a view of it. |
| `nav.dashboard` | Panel | Dashboard |
| `nav.master` | Master | Master |
| `nav.sources` | Fuentes | Sources |
| `nav.variants` | Variantes | Variants |
| `nav.settings` | Ajustes | Settings |
| `action.save` | Guardar | Save |
| `state.saved` | Guardado | Saved |
| `action.cancel` | Cancelar | Cancel |
| `action.undo` | Deshacer | Undo |
| `ai.toggle` | Asistencia de IA | AI assistance |
| `ai.on` / `ai.off` | Activada / Desactivada | On / Off |

---

## 1 · Auth (login / signup) — la primera impresión

| Clave | ES | EN |
|---|---|---|
| `auth.title` | Tu carrera, en un solo registro. | Your career, in one record. |
| `auth.sub` | Entra para retomar tu master y tus variantes. | Sign in to pick up your master and variants. |
| `auth.email` | Email | Email |
| `auth.password` | Contraseña | Password |
| `auth.signin` | Entrar | Sign in |
| `auth.google` | Continuar con Google | Continue with Google |
| `auth.github` | Continuar con GitHub | Continue with GitHub |
| `auth.github.why` | GitHub también conecta tus repos como evidencia. | GitHub also connects your repos as evidence. |
| `auth.forgot` | ¿Olvidaste tu contraseña? | Forgot your password? |
| `auth.toSignup` | ¿Primera vez? Crea tu registro. | New here? Create your record. |
| `auth.err.creds` | Email o contraseña incorrectos. | Incorrect email or password. |
| `auth.err.network` | No pudimos conectar. Reintenta. | Couldn't connect. Try again. |
| `auth.legal` | La descarga de tu PDF es siempre gratis. Cancelas en un clic. | Downloading your PDF is always free. Cancel in one click. |

> Nota: **nada de LinkedIn OAuth.** Su API ya no entrega el perfil; un botón que lo insinúa rompe la
> promesa en el onboarding. (Por eso ingerimos capturas.)

---

## 2 · Onboarding — las dos puertas (simétricas, ninguna de segunda)

| Clave | ES | EN |
|---|---|---|
| `onb.eyebrow` | Tu registro canónico | Your canonical record |
| `onb.title` | Empieza por una de dos puertas. | Start through one of two doors. |
| `onb.sub` | Corpus guarda tu carrera una sola vez; cada CV es una vista de ella. Las dos puertas son de primera clase. | Corpus stores your career once; every résumé is a view of it. Both doors are first-class. |
| `onb.A.tag` | Puerta A | Door A |
| `onb.A.title` | Desde cero, o desde una plantilla de estructura | From scratch, or from a structure template |
| `onb.A.body` | Empiezas con un master vacío, o partiendo de un andamio de secciones según tu rol. **Escribes tú.** La IA está disponible, pero apagada. Lo que escribes a mano es el origen más verificable de todos. | Start with an empty master, or from a role-based section scaffold. **You write it.** AI is available, but off. What you write by hand is the most verifiable origin of all. |
| `onb.A.tpl` | Plantilla: {rol} · o empezar vacío | Template: {role} · or start empty |
| `onb.A.cta` | Empezar a escribir | Start writing |
| `onb.A.tplNote` | Las plantillas precargan qué secciones esperar, nunca contenido de ejemplo. | Templates preload which sections to expect — never sample content. |
| `onb.B.tag` | Puerta B | Door B |
| `onb.B.title` | Con IA, desde tus fuentes | With AI, from your sources |
| `onb.B.body` | Conecta GitHub y tu portfolio (dato duro, sin IA, gratis), sube tu LinkedIn y tu CV viejo. La IA extrae; **tú confirmas cada item** antes de que entre al master. | Connect GitHub and your portfolio (hard data, no AI, free), upload your LinkedIn and old résumé. AI extracts; **you confirm each item** before it enters the master. |
| `onb.B.cta` | Conectar fuentes | Connect sources |
| `onb.foot` | Ninguna puerta es el camino de segunda. La IA acelera la entrada de datos; no es requisito. | Neither door is the lesser path. AI speeds data entry; it isn't required. |

---

## 3 · Espera de la ingesta — progreso específico y verdadero (jamás un % inventado)

| Clave | ES | EN |
|---|---|---|
| `ingest.title` | Leyendo tus fuentes… | Reading your sources… |
| `ingest.sub` | Esto tarda unos segundos. No inventamos nada: solo estructuramos lo que ya está ahí. | This takes a few seconds. We invent nothing — we just structure what's already there. |
| `ingest.step.file` | Leyendo página {n} de {total} de {archivo}… | Reading page {n} of {total} of {file}… |
| `ingest.step.found.work` | Encontré {n} experiencias | Found {n} roles |
| `ingest.step.found.skill` | Detecté {n} skills | Detected {n} skills |
| `ingest.step.github` | GitHub: {n} repos, {kb} de código (sin IA — es la API) | GitHub: {n} repos, {kb} of code (no AI — it's the API) |
| `ingest.step.portfolio` | Portfolio: leí tu estructura, {n} proyectos | Portfolio: read your structure, {n} projects |
| `ingest.done` | Listo. {n} items para que revises. | Done. {n} items for you to review. |
| `ingest.cta` | Revisar {n} items | Review {n} items |
| `ingest.err` | No pude leer {archivo}. Puedes reintentar o seguir sin él. | Couldn't read {file}. Retry, or continue without it. |
| `ingest.err.scanned` | Ese PDF parece escaneado (imagen). Necesito texto seleccionable. | That PDF looks scanned (image). I need selectable text. |

---

## 4 · Staging / revisión — la pantalla que hace creíble el producto

| Clave | ES | EN |
|---|---|---|
| `stg.title` | Nada entra a tu master sin que lo confirmes. | Nothing enters your master until you confirm it. |
| `stg.sub` | Revisa lo que extraje. Cada item muestra de dónde salió. | Review what I extracted. Each item shows where it came from. |
| `stg.count` | {n} por revisar · {ok} aceptados | {n} to review · {ok} accepted |
| `stg.origin.file` | {archivo} · pág. {p} | {file} · p. {p} |
| `stg.origin.manual` | escrito a mano | written by hand |
| `stg.origin.ai` | reformulado por IA | rephrased by AI |
| `stg.origin.api` | {fuente} · API | {source} · API |
| `stg.evidence.show` | ver evidencia | show evidence |
| `stg.evidence.label` | Fragmento en la fuente | Snippet in the source |
| `stg.ai.original` | ver original | show original |
| `stg.level.verified` | Verificado | Verified |
| `stg.level.partial` | Parcial | Partial |
| `stg.level.unverified` | Sin verificar | Unverified |
| `stg.unverified.body` | La IA propuso esto pero no encontró de dónde sale. No podemos respaldarlo — decides tú. | AI proposed this but couldn't trace its source. We can't back it — you decide. |
| `stg.accept` | Aceptar | Accept |
| `stg.edit` | Editar | Edit |
| `stg.discard` | Descartar | Discard |
| `stg.batch.high` | Aceptar toda la sección verificada ({n}) | Accept the whole verified section ({n}) |
| `stg.batch.low.note` | Los de "sin verificar" y "parcial" se revisan uno a uno. | The "unverified" and "partial" ones are reviewed one by one. |
| `stg.gap.dates` | No encontré fechas para este rol. ¿Cuándo fue? | I couldn't find dates for this role. When was it? |
| `stg.gap.metric` | Esta viñeta no tiene ningún número. ¿Cuánto? ¿cuántos? ¿en cuánto tiempo? | This bullet has no number. How much? how many? in how long? |
| `stg.dup.title` | El mismo rol aparece en dos fuentes | The same role appears in two sources |
| `stg.dup.body` | {a} y {b} describen lo mismo. Elige campo por campo, o acepta la fusión propuesta. | {a} and {b} describe the same thing. Pick field by field, or accept the proposed merge. |
| `stg.dup.merge` | Aceptar fusión | Accept merge |
| `stg.dup.keepBoth` | Mantener ambos | Keep both |
| `stg.api.note` | Esto viene de una API: el dato es duro, no hay evidencia que verificar. Pero la decisión de si va en tu CV es tuya. | This comes from an API: the data is hard, there's no evidence to check. But whether it goes in your résumé is your call. |
| `stg.empty` | Nada pendiente. Tu master está al día. | Nothing pending. Your master is up to date. |

---

## 5 · Master profile

| Clave | ES | EN |
|---|---|---|
| `mstr.title` | Tu registro completo | Your complete record |
| `mstr.sub` | Todo lo que has hecho. Cada variante muestra una parte. | Everything you've done. Each variant shows a slice. |
| `mstr.search` | Filtrar por skill, empresa, fecha… | Filter by skill, company, date… |
| `mstr.section.work` | Experiencia | Experience |
| `mstr.section.skills` | Aptitudes | Skills |
| `mstr.section.edu` | Educación | Education |
| `mstr.section.projects` | Proyectos | Projects |
| `mstr.section.summaries` | Resúmenes | Summaries |
| `mstr.summaries.note` | Puedes guardar varios resúmenes, uno por ángulo de carrera. Es normal. | You can keep several summaries, one per career angle. That's normal. |
| `mstr.addBullet` | Añadir viñeta | Add bullet |
| `mstr.noMetric` | sin cifra | no number |
| `mstr.inline.hint` | Clic para editar. Se guarda solo. | Click to edit. Saves itself. |

### La skill con evidencia (★ el componente estelar)

| Clave | ES | EN |
|---|---|---|
| `skill.verified` | verificado | verified |
| `skill.evidence` | {kb} · {repos} repos · citada en {n} viñetas de experiencia | {kb} · {repos} repos · cited in {n} experience bullets |
| `skill.more` | +{n} más | +{n} more |
| `skill.unverified.badge` | sin evidencia | no evidence |
| `skill.unverified.body` | No aparece en ninguna viñeta, ni en tus repos, ni en tu portfolio. ¿Dónde lo usaste? | It doesn't appear in any bullet, your repos, or your portfolio. Where did you use it? |
| `skill.unverified.cta` | Enlazar a una viñeta · o quitar | Link to a bullet · or remove |

---

## 6 · Editor de variante

| Clave | ES | EN |
|---|---|---|
| `ed.master` | Master · biblioteca | Master · library |
| `ed.variant` | Esta variante · composición | This variant · composition |
| `ed.targetTitle` | Título objetivo | Target title |
| `ed.targetTitle.why` | 10,6× entrevistas si coincide con el aviso | 10.6× interviews when it matches the posting |
| `ed.pages.ok` | {n} páginas | {n} pages |
| `ed.pages.warn` | Página 3 — el tiempo del reclutador aquí es residual. Recorta. | Page 3 — recruiter time here is residual. Trim. |
| `ed.pages.src` | Ladders, eye-tracking | Ladders, eye-tracking |
| `ed.override.badge` | override en esta variante | override in this variant |
| `ed.override.orig` | ver original | show original |
| `ed.override.revert` | revertir | revert |
| `ed.hide` | ocultar en esta variante | hide in this variant |
| `ed.add` | añadir a la variante | add to variant |
| `ed.view.pdf` | Vista PDF | PDF view |
| `ed.view.ats` | Cómo lo lee el ATS | How the ATS reads it |
| `ed.view.pdf.hint` | píxel por píxel = el PDF | pixel for pixel = the PDF |
| `ed.view.ats.hint` | texto plano · así te ve la máquina | plain text · this is how the machine sees you |
| `ed.export` | Exportar PDF | Export PDF |
| `ed.tailor` | Adaptar a un aviso | Tailor to a posting |

---

## 7 · Tailoring — los tres grupos (el alma ética)

| Clave | ES | EN |
|---|---|---|
| `tlr.title` | Pega el aviso. Te muestro evidencia, no un puntaje. | Paste the posting. I'll show you evidence, not a score. |
| `tlr.paste` | Pega aquí el texto de la oferta | Paste the job description here |
| `tlr.g1.title` | Ya está en esta variante | Already in this variant |
| `tlr.g1.body` | El aviso lo pide y tú ya lo tienes aquí. Nada que hacer. | The posting asks for it and you already have it here. Nothing to do. |
| `tlr.g2.title` | Lo tienes en el master, no en esta variante | In your master, not in this variant |
| `tlr.g2.body` | Un clic y lo añades. Esto es honesto: ya era tuyo. | One click to add it. This is honest — it was already yours. |
| `tlr.g2.cta` | Añadir a la variante | Add to variant |
| `tlr.g3.title` | No lo tienes en ninguna parte | You don't have it anywhere |
| `tlr.g3.body` | El aviso pide **{keyword}**. No aparece en tu master. No te lo vamos a poner: **apréndelo, busca en tu experiencia si hay algo parcial que reencuadrar, o asume que este rol no calza.** | The posting asks for **{keyword}**. It's not in your master. We won't add it for you: **learn it, look for partial experience to reframe, or accept this role isn't a fit.** |
| `tlr.g3.note` | Inventarlo aquí es exactamente lo que no hacemos. | Inventing it here is exactly what we don't do. |
| `tlr.title.suggest` | El aviso dice "{aviso}". Tu título es "{tuyo}". ¿Alinearlo? | The posting says "{posting}". Your title is "{yours}". Align it? |
| `tlr.reorder` | Sugerencia: sube estas viñetas del rol más reciente. | Suggestion: move these bullets up in your most recent role. |
| `tlr.rephrase.title` | Reformulación sugerida | Suggested rephrasing |
| `tlr.rephrase.orig` | Tu original | Your original |
| `tlr.rephrase.new` | Propuesto | Proposed |
| `tlr.rephrase.accept` | Usar el propuesto | Use the proposed |
| `tlr.rephrase.keep` | Quedarme con el mío | Keep mine |
| `tlr.unverified` | no verificado | unverified |
| `tlr.unverified.body` | Esta sugerencia no apunta a nada de tu master. No la apliques sin revisar. | This suggestion points to nothing in your master. Don't apply it unchecked. |

---

## 8 · Chequeo de salud — sin score, sin barras, sin umbrales

| Clave | ES | EN |
|---|---|---|
| `hlth.title` | Lo que depende de ti y puede fallar | What depends on you and can go wrong |
| `hlth.sub` | No hay puntaje. Cada línea es verificable o no la ponemos. | No score. Every line is verifiable, or we don't show it. |
| `hlth.nometric` | {n} viñetas sin ninguna cifra | {n} bullets with no number |
| `hlth.nometric.src` | Jobscan 2025: 58,2% de reclutadores prioriza el logro medible. Sin umbral. | Jobscan 2025: 58.2% of recruiters prioritize measurable results. No threshold. |
| `hlth.nometric.cta` | ver las {n} → | show the {n} → |
| `hlth.skill.noEvidence` | {skill}: declarado, sin evidencia en repos, portfolio ni viñetas | {skill}: declared, no evidence in repos, portfolio, or bullets |
| `hlth.skill.src` | GitHub 2025: 32% declara skills que no tiene; los reclutadores lo cazan. | GitHub 2025: 32% declare skills they don't have; recruiters are hunting for it. |
| `hlth.title.generic` | Tu título por defecto es genérico; alinéalo al aviso en cada variante. | Your default title is generic; align it to the posting in each variant. |
| `hlth.company.legal` | {empresa} sin identificador legal (¿"{empresa} SpA"?) | {company} without a legal identifier ("{company} Inc."?) |
| `hlth.company.src` | Greenhouse | Greenhouse |
| `hlth.pages3` | El CV tiene 3 páginas. | The résumé is 3 pages. |
| `hlth.structural.note` | Lo estructural (1 columna, sin foto, contacto en el cuerpo, texto real) lo cumple la plantilla por construcción. No lo listamos: sería teatro. | The structural stuff (1 column, no photo, contact in the body, real text) is met by the template by construction. We don't list it — that would be theater. |
| `hlth.allGood.title` | No hay nada que corregir por ahora. | Nothing to fix right now. |
| `hlth.allGood.body` | Tu contenido pasa las reglas que dependen de ti. Cuando cambie, te aviso. | Your content passes the rules that depend on you. When that changes, I'll tell you. |

---

## 9 · Fuentes

| Clave | ES | EN |
|---|---|---|
| `src.title` | Tus fuentes | Your sources |
| `src.sub` | Conexiones vivas, ordenadas por verificabilidad. Lo nuevo va a revisión, nunca directo al master. | Live connections, ordered by verifiability. New material goes to review, never straight to the master. |
| `src.github` | GitHub | GitHub |
| `src.github.connect` | Conectar GitHub | Connect GitHub |
| `src.github.hard` | Dato duro · sin IA · no hay nada que alucinar | Hard data · no AI · nothing to hallucinate |
| `src.status.connected` | conectado | connected |
| `src.status.stale` | desactualizada | stale |
| `src.sync` | Resincronizar | Re-sync |
| `src.new` | ↑ {n} nuevos desde la última vez | ↑ {n} new since last time |
| `src.linkedin.warn` | Tu LinkedIn puede estar desactualizado. | Your LinkedIn may be out of date. |
| `src.toStaging` | {n} novedades → revisar | {n} updates → review |

### Selector de repos de GitHub

| Clave | ES | EN |
|---|---|---|
| `repo.title` | ¿Cuáles son proyectos reales? | Which ones are real projects? |
| `repo.sub` | Propuse un default (sin forks, con descripción, con actividad). Revísalo — tú decides. | I proposed a default (no forks, with a description, active). Review it — you decide. |
| `repo.count` | {sel} de {total} marcados | {sel} of {total} selected |
| `repo.reason.fork` | fork | fork |
| `repo.reason.noDesc` | sin descripción | no description |
| `repo.reason.exercises` | ejercicios, no proyecto | exercises, not a project |
| `repo.reason.config` | configuración personal | personal config |
| `repo.note` | Un CV no es un volcado de GitHub. Los repos de un estudiante son señal frágil: sin inflar. | A résumé isn't a GitHub dump. A student's repos are a fragile signal — no inflating. |

---

## 10 · Ajustes

| Clave | ES | EN |
|---|---|---|
| `set.language` | Idioma de la app | App language |
| `set.theme` | Tema | Theme |
| `set.theme.obsidian` | Obsidiana (oscuro) | Obsidian (dark) |
| `set.theme.porcelain` | Porcelana (claro) | Porcelain (light) |
| `set.ai` | Asistencia de IA | AI assistance |
| `set.ai.body` | Con la IA apagada: crear el master, editar, componer variantes, exportar y "cómo lo lee el ATS" siguen funcionando. No es un modo degradado. | With AI off: building the master, editing, composing variants, exporting, and "how the ATS reads it" all still work. It's not a degraded mode. |
| `set.byok.title` | Tu propia API key (BYOK) | Your own API key (BYOK) |
| `set.byok.body` | Trae tu key y usa la IA sin plan. Tú pagas el modelo, directo. | Bring your key and use AI without a plan. You pay the model, directly. |
| `set.export` | Exportar todo | Export everything |
| `set.export.body` | Tu master y tus variantes en JSON Resume + PDF. Es tuyo, siempre. | Your master and variants as JSON Resume + PDF. It's yours, always. |
| `set.delete` | Borrar todo | Delete everything |
| `set.delete.confirm` | Esto borra tu registro y no se puede deshacer. Escribe BORRAR para confirmar. | This deletes your record and can't be undone. Type DELETE to confirm. |

---

## 11 · Dashboard

| Clave | ES | EN |
|---|---|---|
| `dash.sync` | Editaste el master hace {t}. {n} de {total} variantes están desactualizadas. | You edited the master {t} ago. {n} of {total} variants are out of date. |
| `dash.sync.reason` | {variante} · desactualizada · cambió: {qué} | {variant} · out of date · changed: {what} |
| `dash.sync.cta` | Revisar las {n} | Review the {n} |
| `dash.variants` | Mis variantes | My variants |
| `dash.variant.ok` | Al día | Up to date |
| `dash.variant.outdated` | Desactualizada | Out of date |
| `dash.newVariant` | Nueva variante | New variant |
| `dash.download` | PDF | PDF |
| `dash.open` | Abrir | Open |
| `dash.health` | Salud del master | Master health |
| `dash.sources` | Fuentes conectadas | Connected sources |
| `dash.empty.title` | Aún no hay nada que registrar. | Nothing to record yet. |
| `dash.empty.body` | Empieza por una de dos puertas. Las dos son de primera clase. | Start through one of two doors. Both are first-class. |

---

## 12 · Errores y estados vacíos (transversales)

| Clave | ES | EN |
|---|---|---|
| `err.generic` | Algo salió mal. No perdiste nada — reintenta. | Something went wrong. You lost nothing — try again. |
| `err.offline` | Sin conexión. Tus cambios se guardan al volver. | Offline. Your changes save when you're back. |
| `err.fileTooBig` | Ese archivo pesa más de 2,5 MB. Comprímelo o divídelo. | That file is over 2.5 MB. Compress or split it. |
| `err.perm` | No tienes acceso a esto. | You don't have access to this. |
| `empty.variants` | Todavía no tienes variantes. Crea una desde tu master. | No variants yet. Create one from your master. |
| `empty.search` | Nada coincide con "{q}". | Nothing matches "{q}". |
| `loading.sources` | Cargando tus fuentes… | Loading your sources… |

---

## 13 · Micro-copy de confianza (usar con moderación, nunca como coach)

| Clave | ES | EN |
|---|---|---|
| `trust.freePdf` | La descarga es gratis. Siempre. | The download is free. Always. |
| `trust.noInvent` | Cada línea de tu CV apunta a algo que tú escribiste. | Every line of your résumé points to something you wrote. |
| `trust.aiHonest` | Si la IA no puede rastrearlo, no lo escribe. | If AI can't trace it, it doesn't write it. |

> **Prohibido en todo el copy:** "¡{n}%!", "tu CV es un {n}%", "confianza {n}%", rachas, badges,
> "potenciar sinergias / impulsar la excelencia" (ES), "leverage / spearheaded / seamless / delve"
> (EN). Si suena a coach motivacional o a robot, reescríbelo.
