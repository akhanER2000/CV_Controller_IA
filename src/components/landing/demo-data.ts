/* ============================================================================
   LANDING · datos de la demostración.

   Todo lo que hay aquí son DATOS DE EJEMPLO de un perfil FICTICIO (Diego Gatica,
   el mismo que usa el fixture golden del producto, src/lib/cv/fixtures/). No es
   un testimonio, no es un usuario real y no es una métrica: es una maqueta de
   contenido, declarada como tal en la propia página.

   Vive fuera de src/lib/i18n/dict/landing.ts a propósito: el diccionario de la
   landing está bajo el candado anti-invención (tests/landing-claims.test.ts, que
   exige que toda cifra citada esté en prompts/00-INVESTIGACION.md), y mezclar
   ahí las cifras de un CV de ejemplo —"~40.000 transacciones", "mar 2022"—
   volvería inútil ese candado. Copia ≠ datos de demo.

   El CV de ejemplo se declara como `ResumeData`, el MISMO modelo que consume el
   renderer del PDF y `toPlainText()`. Así el panel "tu PDF" y el panel "lo que
   el ATS lee" del split salen del mismo objeto y no pueden mentir el uno sobre
   el otro: es, literalmente, la tesis del producto aplicada a su propia landing.
   ============================================================================ */

import type { ResumeData } from "@/lib/cv/resume";
import type { Lang } from "@/lib/i18n";

/** Un texto en los dos idiomas. El tipo obliga a la paridad en tiempo de compilación. */
export interface Bi {
  es: string;
  en: string;
}

export const bi = (v: Bi, lang: Lang): string => v[lang];

/* ══════════════════════════════════════════════════════════════════════════
   1 · EL CV DE EJEMPLO — fuente única de las dos caras del split.
   Extracto del fixture golden, recortado a lo que cabe en un panel de landing.
   Los `p1: true` marcan la versión de una página, que es la que se muestra.
   ══════════════════════════════════════════════════════════════════════════ */
export const demoCv: ResumeData = {
  meta: { variant: "Backend — Fintech", generatedFrom: "perfil de ejemplo (ficticio)" },
  basics: {
    name: "Diego Gatica Morales",
    label: { es: "Backend Engineer", en: "Backend Engineer" },
    email: "diego.gatica@ejemplo.cl",
    phone: "+56 9 6123 4567",
    location: { es: "Santiago, Chile (RM)", en: "Santiago, Chile" },
    links: ["github.com/dgatica", "dgatica.cl", "linkedin.com/in/diego-gatica"],
    summary: {
      es: "Backend engineer con seis años en servicios de pago y e-commerce, principalmente en Go y Node.js. A cargo del servicio de conciliación de Altiplano Pagos (~40.000 transacciones diarias).",
      en: "Backend engineer with six years building payment and e-commerce services, mainly in Go and Node.js. Owner of the reconciliation service at Altiplano Pagos (~40,000 daily transactions).",
    },
  },
  skills: [
    {
      group: { es: "Lenguajes", en: "Languages" },
      items: { es: "Go, Python, SQL, TypeScript", en: "Go, Python, SQL, TypeScript" },
    },
    {
      group: { es: "Backend", en: "Backend" },
      items: {
        es: "PostgreSQL, Redis, gRPC, OpenAPI, Node.js",
        en: "PostgreSQL, Redis, gRPC, OpenAPI, Node.js",
      },
    },
    {
      group: { es: "Plataforma", en: "Platform" },
      items: { es: "Docker, GitHub Actions, Linux, Bash", en: "Docker, GitHub Actions, Linux, Bash" },
    },
  ],
  work: [
    {
      company: "Altiplano Pagos SpA",
      location: { es: "Santiago, Chile", en: "Santiago, Chile" },
      title: { es: "Backend Developer", en: "Backend Developer" },
      dates: { es: "mar 2022 – hoy", en: "Mar 2022 – Present" },
      p1: true,
      bullets: [
        {
          p1: true,
          es: "A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias).",
          en: "Own the payments reconciliation service in Go (~40,000 daily transactions).",
        },
        {
          p1: true,
          es: "Diseñé la librería interna de idempotencia (Go), adoptada por otros equipos de la empresa.",
          en: "Designed the internal idempotency library (Go), adopted by other teams in the company.",
        },
        {
          p1: true,
          es: "Mantengo los pipelines de CI/CD del equipo (GitHub Actions).",
          en: "Maintain the team's CI/CD pipelines (GitHub Actions).",
        },
      ],
    },
    {
      company: "Rayén Retail S.A.",
      location: { es: "Santiago, Chile", en: "Santiago, Chile" },
      title: { es: "Backend Developer, equipo Checkout", en: "Backend Developer, Checkout team" },
      dates: { es: "ene 2020 – feb 2022", en: "Jan 2020 – Feb 2022" },
      p1: true,
      bullets: [
        {
          p1: true,
          es: "Desarrollé y mantuve APIs del checkout (Node.js, PostgreSQL).",
          en: "Built and maintained checkout APIs (Node.js, PostgreSQL).",
        },
        {
          p1: true,
          es: "Implementé el flujo de cupones y descuentos del checkout.",
          en: "Implemented the checkout coupons and discounts flow.",
        },
      ],
    },
  ],
  projects: [],
  education: [
    {
      title: {
        es: "Ingeniería Civil en Computación e Informática",
        en: "B.Eng. in Computer Science and Informatics",
      },
      org: "Universidad Andrés Bello",
      dates: { es: "2014 – 2019", en: "2014 – 2019" },
      p1: true,
    },
  ],
  headings: {
    summary: { es: "Resumen", en: "Summary" },
    skills: { es: "Habilidades", en: "Skills" },
    work: { es: "Experiencia", en: "Experience" },
    projects: { es: "Proyectos", en: "Projects" },
    education: { es: "Educación", en: "Education" },
  },
};

/**
 * Las secciones del documento, EN ORDEN DE LECTURA. Es el mismo orden en que
 * `toPlainText()` emite sus bloques (separados por línea en blanco), y por eso
 * sirve para emparejar cada sección del PDF con su bloque de texto extraído.
 * Si `projects` estuviera vacío en el modelo, tampoco emite bloque — de ahí que
 * el split compruebe la correspondencia antes de resaltar nada.
 */
export type DemoSection = "basics" | "summary" | "skills" | "work" | "education";
export const demoSections: DemoSection[] = ["basics", "summary", "skills", "work", "education"];

/* ══════════════════════════════════════════════════════════════════════════
   2 · LA DEMO DE INGESTA — texto pegado y lo que la extracción encuentra.
   PREGRABADA: la landing no llama a ningún modelo (una demo pública que invoca
   un LLM es una factura abierta y un imán de bots). Los items de abajo son los
   que un humano obtendría de ese texto; el número de línea es real y se puede
   contar en el propio bloque pegado.
   ══════════════════════════════════════════════════════════════════════════ */

export const demoPaste: Bi = {
  es: `Diego Gatica Morales — Backend Engineer
Santiago, Chile · diego.gatica@ejemplo.cl · +56 9 6123 4567
github.com/dgatica · linkedin.com/in/diego-gatica · dgatica.cl

Altiplano Pagos SpA — Backend Developer (mar 2022 – hoy)
A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias).
Diseñé la librería interna de idempotencia (Go), adoptada por otros equipos.
Stack: Go, PostgreSQL, Redis, gRPC, Docker

idempotency-go — librería open source. github.com/dgatica/idempotency-go`,
  en: `Diego Gatica Morales — Backend Engineer
Santiago, Chile · diego.gatica@ejemplo.cl · +56 9 6123 4567
github.com/dgatica · linkedin.com/in/diego-gatica · dgatica.cl

Altiplano Pagos SpA — Backend Developer (Mar 2022 – Present)
Own the payments reconciliation service in Go (~40,000 daily transactions).
Designed the internal idempotency library (Go), adopted by other teams.
Stack: Go, PostgreSQL, Redis, gRPC, Docker

idempotency-go — open source library. github.com/dgatica/idempotency-go`,
};

/** Clase del item extraído. Las etiquetas visibles salen del diccionario. */
export type DemoKind = "perfil" | "experiencia" | "vineta" | "habilidades" | "proyecto" | "enlace";

export interface DemoItem {
  kind: DemoKind;
  /** Lo extraído. Con `chips`, se pinta como habilidades sueltas. */
  text?: Bi;
  chips?: string[];
  /** Línea del texto pegado de la que sale. Se puede contar a mano en el bloque. */
  line: number;
  /** Nivel de verificación, con la misma gramática que el producto. */
  ver: "ok" | "partial";
  /** Solo en 'partial': por qué no está verificado del todo. */
  note?: Bi;
}

export const demoItems: DemoItem[] = [
  {
    kind: "perfil",
    text: { es: "Diego Gatica Morales · Backend Engineer", en: "Diego Gatica Morales · Backend Engineer" },
    line: 1,
    ver: "ok",
  },
  {
    kind: "experiencia",
    text: {
      es: "Backend Developer — Altiplano Pagos SpA · mar 2022 – hoy",
      en: "Backend Developer — Altiplano Pagos SpA · Mar 2022 – Present",
    },
    line: 5,
    ver: "ok",
  },
  {
    kind: "vineta",
    text: {
      es: "A cargo del servicio de conciliación de pagos en Go (~40.000 transacciones diarias).",
      en: "Own the payments reconciliation service in Go (~40,000 daily transactions).",
    },
    line: 6,
    ver: "ok",
  },
  {
    kind: "habilidades",
    chips: ["Go", "PostgreSQL", "Redis", "gRPC", "Docker"],
    line: 8,
    ver: "ok",
  },
  {
    kind: "proyecto",
    text: {
      es: "idempotency-go — librería open source · github.com/dgatica/idempotency-go",
      en: "idempotency-go — open source library · github.com/dgatica/idempotency-go",
    },
    line: 10,
    ver: "ok",
  },
  {
    kind: "enlace",
    text: { es: "dgatica.cl — portafolio", en: "dgatica.cl — portfolio" },
    line: 3,
    ver: "partial",
    note: {
      es: "la URL está en el texto, pero su contenido no se ha leído todavía.",
      en: "the URL is in the text, but its content hasn't been read yet.",
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   3 · EL EJEMPLO DE PROCEDENCIA (sección anti-alucinación).
   Dos viñetas del master: una con su fragmento de origen y otra sin evidencia.
   ══════════════════════════════════════════════════════════════════════════ */
export interface DemoProvenance {
  text: Bi;
  ver: "ok" | "none";
  origin: Bi;
  fragment?: Bi;
}

export const demoProvenance: DemoProvenance[] = [
  {
    text: {
      es: "Diseñé la librería interna de idempotencia (Go), adoptada por otros equipos de la empresa.",
      en: "Designed the internal idempotency library (Go), adopted by other teams in the company.",
    },
    ver: "ok",
    origin: { es: "origen: texto pegado, línea 7", en: "source: pasted text, line 7" },
    fragment: {
      es: "«Diseñé la librería interna de idempotencia (Go), adoptada por otros equipos.»",
      en: "“Designed the internal idempotency library (Go), adopted by other teams.”",
    },
  },
  {
    text: {
      es: "Lideré la transformación digital del área, impulsando sinergias entre equipos.",
      en: "Led the area's digital transformation, driving synergies across teams.",
    },
    ver: "none",
    origin: { es: "sin fragmento de origen — revísalo", en: "no source fragment — review it" },
  },
];
