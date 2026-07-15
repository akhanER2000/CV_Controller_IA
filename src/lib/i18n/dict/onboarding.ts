/* i18n · namespace "onboarding". Claves planas con prefijo "onboarding.". ES = referencia; EN = copy.md.
   Este archivo lo llena el barrido i18n de la pantalla "onboarding". */
export const onboarding = {
  es: {
    "onboarding.header": "EMPEZAR",

    "onboarding.overline": "Un master, N variantes — partamos por el master",

    "onboarding.h1.pre": "¿Cómo prefieres ",
    "onboarding.h1.em": "empezar?",

    "onboarding.sub":
      "Dos puertas al mismo lugar. Puedes cruzar la otra cuando quieras — el registro es uno solo.",

    "onboarding.doorA.overline": "Puerta A · sin IA",
    "onboarding.doorA.title": "Escribirlo tú",
    "onboarding.doorA.body.pre":
      "Desde una plantilla de rol o en blanco, con la IA apagada. Escribes, Corpus estructura. Cada item queda con ",
    "onboarding.doorA.body.bold": "origen: tú",
    "onboarding.doorA.body.post":
      " — el más verificable de todos: no hay nada que rastrear, lo afirmaste tú.",
    "onboarding.doorA.fine": "bien para: perfeccionistas, perfiles simples, desconfiados con razón",
    "onboarding.doorA.cta": "Elegir plantilla",

    "onboarding.doorB.overline": "Puerta B · con IA",
    "onboarding.doorB.title": "Volcarlo",
    "onboarding.doorB.body.pre":
      "Pega texto suelto, tu CV viejo, links a tu GitHub y portfolio. La IA extrae y cita el fragmento de origen de cada dato; ",
    "onboarding.doorB.body.bold": "tú confirmas item por item",
    "onboarding.doorB.body.post": " antes de que nada entre al master.",
    "onboarding.doorB.fine": "bien para: 10 años de historia desordenada, poco tiempo, arranque rápido",
    "onboarding.doorB.cta": "Ir al volcado →",

    "onboarding.tpl.overline": "Plantillas de perfil — estructura vacía, cero texto inventado",
    "onboarding.tpl.backend.title": "Backend / plataforma",
    "onboarding.tpl.backend.desc": "roles · viñetas XYZ · skills por grupo · proyectos",
    "onboarding.tpl.data.title": "Data / IA",
    "onboarding.tpl.data.desc": "igual + secciones de investigación y datasets",
    "onboarding.tpl.design.title": "Diseño",
    "onboarding.tpl.design.desc": "igual + casos con problema → decisión → resultado",
    "onboarding.tpl.product.title": "Producto",
    "onboarding.tpl.product.desc": "igual + métricas de negocio por rol",
    "onboarding.tpl.blank.title": "En blanco",
    "onboarding.tpl.blank.desc": "solo la estructura del registro",
    "onboarding.tpl.dump.title": "Mejor, vuélcalo →",
    "onboarding.tpl.dump.desc": "cambiar a la puerta B",

    "onboarding.note":
      "La puerta A no es la puerta «difícil» ni la B la «tramposa»: las dos terminan en el mismo staging, con la misma revisión, y el mismo master.",
  } as Record<string, string>,
  en: {
    "onboarding.header": "START",

    "onboarding.overline": "One master, N variants — let's start with the master",

    "onboarding.h1.pre": "How do you want to ",
    "onboarding.h1.em": "start?",

    "onboarding.sub":
      "Two doors into the same place. You can cross the other one anytime — there is only one record.",

    "onboarding.doorA.overline": "Door A · no AI",
    "onboarding.doorA.title": "Write it yourself",
    "onboarding.doorA.body.pre":
      "From a role template or a blank page, AI off. You write, Corpus structures. Every item is marked ",
    "onboarding.doorA.body.bold": "origin: you",
    "onboarding.doorA.body.post":
      " — the most verifiable origin there is: nothing to trace, you stated it.",
    "onboarding.doorA.fine": "good for: perfectionists, simple profiles, rightly distrustful",
    "onboarding.doorA.cta": "Choose a template",

    "onboarding.doorB.overline": "Door B · with AI",
    "onboarding.doorB.title": "Dump it",
    "onboarding.doorB.body.pre":
      "Paste loose text, your old resume, links to your GitHub and portfolio. AI extracts and cites the source fragment for every fact; ",
    "onboarding.doorB.body.bold": "you confirm item by item",
    "onboarding.doorB.body.post": " before anything enters your master.",
    "onboarding.doorB.fine": "good for: 10 years of messy history, little time, a fast start",
    "onboarding.doorB.cta": "Go to the dump →",

    "onboarding.tpl.overline": "Profile templates — empty structure, zero invented text",
    "onboarding.tpl.backend.title": "Backend / platform",
    "onboarding.tpl.backend.desc": "roles · XYZ bullets · skills by group · projects",
    "onboarding.tpl.data.title": "Data / AI",
    "onboarding.tpl.data.desc": "same + research and dataset sections",
    "onboarding.tpl.design.title": "Design",
    "onboarding.tpl.design.desc": "same + cases with problem → decision → outcome",
    "onboarding.tpl.product.title": "Product",
    "onboarding.tpl.product.desc": "same + business metrics per role",
    "onboarding.tpl.blank.title": "Blank",
    "onboarding.tpl.blank.desc": "just the record's structure",
    "onboarding.tpl.dump.title": "Better, dump it →",
    "onboarding.tpl.dump.desc": "switch to door B",

    "onboarding.note":
      "Door A isn't the 'hard way' and door B isn't the 'cheat': both end at the same staging, the same review, the same master.",
  } as Record<string, string>,
} as const;
