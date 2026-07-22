/* ============================================================================
   corpus/1 · LA PLANTILLA CON UN EJEMPLO DENTRO

   La plantilla vacía enseña DÓNDE va cada cosa. No enseña CÓMO queda bien
   puesta: una fecha que se entiende, una viñeta con cifra, trece grupos de
   habilidades en vez de dos, una referencia completa. Un ejemplo enseña eso en
   diez segundos y sin leer una sola instrucción.

   ★ TODO LO DE AQUÍ ES INVENTADO, Y SE NOTA A PROPÓSITO.
   Ni una persona, empresa, universidad, cifra o dirección de este fichero
   existe. Los correos y las webs usan `.invalid`, que es un dominio de primer
   nivel RESERVADO por el RFC 2606 justamente para esto: no se puede registrar,
   así que no hay forma de que apunten a nadie real. Los perfiles sociales llevan
   «cambia-esto-por-tu-usuario» en la ruta. No es decoración: una plantilla de
   ejemplo que se pareciera a un CV de verdad acabaría importada tal cual por
   alguien con prisa, y ese alguien tendría en su master la carrera de otro.

   ★ POR QUÉ EL FICHERO SE GENERA CON `exportarCorpusMd` Y NO SE ESCRIBE A MANO.
   Porque así es IMPOSIBLE que el ejemplo enseñe algo que el parser no entienda:
   sale del mismo serializador que produce el .md de tu propio master, con el
   mismo orden de secciones y los mismos nombres de campo. Un ejemplo escrito a
   mano se habría desincronizado del formato en el primer campo nuevo — y un
   ejemplo que el propio parser rechaza sería peor que no tener ninguno.
   tests/plantilla-paridad.test.ts lo exige: cero avisos, cero notas, y vuelta
   entera campo por campo.

   ⚠ Los items NO llevan procedencia (origin `manual`, sin evidencia ni fuente):
   así `exportarCorpusMd` no escribe ningún bloque `<!-- corpus:proc -->` y el
   fichero queda como lo escribiría una persona. El bloque de procedencia es
   metadato de máquina; enseñárselo a quien viene a rellenar su primer CV sería
   ruido, y lo verá igualmente el día que exporte su master de verdad.
   ========================================================================== */

import { comentarioCorpus, exportarCorpusMd } from "./exportar";
import { FORMATO_ID, seccionPorKind, type ItemParaExportar } from "./formato";

/** Todo item del ejemplo es «escrito a mano»: sin bloque de procedencia. */
const MANUAL = { origin: "manual", evidenceVerified: true } as const;

/**
 * El perfil inventado, en la forma EXACTA en que vive en el master. Cubre todos
 * los kinds que el master acepta —incluido `publication`, que es el que más se
 * echa en falta en un perfil de investigación— y los tres kinds que solo se ven
 * cuando alguien los usa: viñetas colgando de su rol, grupos de habilidades con
 * contexto, y una referencia completa.
 */
export const PERFIL_EJEMPLO: ItemParaExportar[] = [
  {
    id: "ej-basics", kind: "basics", sortOrder: 0, ...MANUAL,
    data: {
      name: "Valentina Ríos Mendoza",
      label: "Ingeniera de Software · Backend y Datos",
      email: "valentina.rios@ejemplo.invalid",
      phone: "+56 9 0000 0000",
      location: "Santiago, Chile",
      // Las dos formas de enlace conviven a propósito: con etiqueta y pelado.
      links: [
        { label: "LinkedIn", url: "https://www.linkedin.com/in/cambia-esto-por-tu-usuario" },
        { label: "GitHub", url: "https://github.com/cambia-esto-por-tu-usuario" },
        "https://valentina-rios.ejemplo.invalid",
      ],
    },
  },
  {
    id: "ej-summary", kind: "summary", sortOrder: 1, ...MANUAL,
    data: {
      text: "Ingeniera de software con 7 años en sistemas de pago y datos. Llevo servicios de checkout que mueven 40.000 transacciones al día y me gusta el trabajo aburrido: medir antes de tocar, dejar el despliegue reproducible y escribir por qué se decidió cada cosa.",
    },
  },

  /* ── EXPERIENCIA · el rol en curso y el anterior ─────────────────────────
     El primero lleva «actualidad» en las fechas y modalidad en la ubicación;
     el segundo, un rango cerrado. Las viñetas TODAS con cifra: es lo que
     separa un logro comprobable de un adjetivo. */
  {
    id: "ej-work-1", kind: "work", sortOrder: 2, ...MANUAL,
    data: {
      title: "Ingeniera de Software Senior",
      company: "Nubelar SpA",
      location: "Santiago, Chile · híbrido",
      url: "https://nubelar.ejemplo.invalid",
      dates: "mar 2022 – actualidad",
    },
  },
  { id: "ej-work-1-v1", kind: "bullet", parentId: "ej-work-1", sortOrder: 3, ...MANUAL, data: { text: "Bajé la latencia p95 del checkout de 1,4 s a 380 ms rediseñando el catálogo en PostgreSQL con índices parciales." } },
  { id: "ej-work-1-v2", kind: "bullet", parentId: "ej-work-1", sortOrder: 4, ...MANUAL, data: { text: "Pasamos de 2 despliegues al mes a 14 semanales, con reversión en menos de 3 minutos, moviendo el pipeline a GitHub Actions y Terraform." } },
  { id: "ej-work-1-v3", kind: "bullet", parentId: "ej-work-1", sortOrder: 5, ...MANUAL, data: { text: "Formé a 4 personas del equipo en revisión de código: el tiempo medio de revisión bajó de 3 días a 1." } },
  {
    id: "ej-work-2", kind: "work", sortOrder: 6, ...MANUAL,
    data: {
      title: "Desarrolladora Backend",
      company: "Andes Logística Digital",
      location: "Remoto (equipo en Valdivia)",
      dates: "ene 2019 – feb 2022",
    },
  },
  { id: "ej-work-2-v1", kind: "bullet", parentId: "ej-work-2", sortOrder: 7, ...MANUAL, data: { text: "Construí la API de facturación que hoy emite 12.000 documentos al mes sin intervención manual." } },
  { id: "ej-work-2-v2", kind: "bullet", parentId: "ej-work-2", sortOrder: 8, ...MANUAL, data: { text: "Reduje el coste de infraestructura un 31 % (de 4.200 a 2.900 USD/mes) apagando entornos que nadie usaba de noche." } },

  /* ── HABILIDADES · TRECE grupos ──────────────────────────────────────────
     No es exceso: un master real de una persona con 7 años de oficio tiene
     entre diez y quince, y una plantilla que enseña dos consigue que quien la
     rellena a mano escriba dos. El ejemplo tiene que enseñar el techo, no el
     suelo. Uno de ellos lleva `contexto` para enseñar ese campo. */
  { id: "ej-skill-1", kind: "skill", sortOrder: 10, ...MANUAL, data: { group: "Lenguajes", items: "Python, TypeScript, SQL, Go" } },
  { id: "ej-skill-2", kind: "skill", sortOrder: 11, ...MANUAL, data: { group: "Backend", items: "FastAPI, Node.js, gRPC, colas con RabbitMQ" } },
  { id: "ej-skill-3", kind: "skill", sortOrder: 12, ...MANUAL, data: { group: "Frontend", items: "React, Next.js, accesibilidad WCAG 2.2" } },
  { id: "ej-skill-4", kind: "skill", sortOrder: 13, ...MANUAL, data: { group: "Datos", items: "PostgreSQL, Redis, dbt, pandas" } },
  { id: "ej-skill-5", kind: "skill", sortOrder: 14, ...MANUAL, data: { group: "Nube", items: "AWS (ECS, RDS, S3), Cloudflare" } },
  { id: "ej-skill-6", kind: "skill", sortOrder: 15, ...MANUAL, data: { group: "Infraestructura", items: "Docker, Terraform, GitHub Actions" } },
  { id: "ej-skill-7", kind: "skill", sortOrder: 16, ...MANUAL, data: { group: "Observabilidad", items: "Grafana, Prometheus, OpenTelemetry" } },
  { id: "ej-skill-8", kind: "skill", sortOrder: 17, ...MANUAL, data: { group: "Pruebas", items: "pytest, Playwright, pruebas de contrato" } },
  { id: "ej-skill-9", kind: "skill", sortOrder: 18, ...MANUAL, data: { group: "IA aplicada", items: "RAG, embeddings, evaluación con jueces humanos", sourceContext: "Nubelar SpA" } },
  { id: "ej-skill-10", kind: "skill", sortOrder: 19, ...MANUAL, data: { group: "Arquitectura", items: "eventos, CQRS, diseño de APIs, ADRs" } },
  { id: "ej-skill-11", kind: "skill", sortOrder: 20, ...MANUAL, data: { group: "Seguridad", items: "OWASP Top 10, OAuth2, gestión de secretos" } },
  { id: "ej-skill-12", kind: "skill", sortOrder: 21, ...MANUAL, data: { group: "Métodos de trabajo", items: "Scrum, revisión de código, programación en pareja" } },
  { id: "ej-skill-13", kind: "skill", sortOrder: 22, ...MANUAL, data: { group: "Comunicación", items: "documentación técnica, mentoría, charlas internas" } },

  {
    id: "ej-edu-1", kind: "education", sortOrder: 30, ...MANUAL,
    data: {
      degree: "Ingeniería Civil en Informática",
      institution: "Universidad Nacional de Ejemplo",
      location: "Valparaíso, Chile",
      url: "https://une.ejemplo.invalid/informatica",
      dates: "2013 – 2018",
    },
  },

  {
    id: "ej-proj-1", kind: "project", sortOrder: 40, ...MANUAL,
    data: {
      name: "Semáforo de deuda técnica",
      description: "Panel que mide la deuda de un repositorio y la ordena por lo que cuesta arreglarla, no por lo que molesta.",
      url: "https://github.com/cambia-esto-por-tu-usuario/semaforo",
      dates: "2024",
    },
  },
  { id: "ej-proj-1-v1", kind: "bullet", parentId: "ej-proj-1", sortOrder: 41, ...MANUAL, data: { text: "Lo usan 3 equipos internos; la primera medición encontró 214 funciones sin ninguna prueba." } },

  { id: "ej-cert-1", kind: "certification", sortOrder: 50, ...MANUAL, data: { name: "AWS Certified Solutions Architect – Associate", issuer: "Amazon Web Services", url: "https://ejemplo.invalid/credencial/0000-0000", dates: "jun 2024" } },
  { id: "ej-cert-2", kind: "certification", sortOrder: 51, ...MANUAL, data: { name: "Professional Scrum Master I", issuer: "Scrum.org", url: "https://ejemplo.invalid/credencial/1111-1111", dates: "2021" } },

  { id: "ej-lang-1", kind: "language", sortOrder: 60, ...MANUAL, data: { language: "Español", level: "nativo" } },
  { id: "ej-lang-2", kind: "language", sortOrder: 61, ...MANUAL, data: { language: "Inglés", level: "profesional (B2)" } },
  { id: "ej-lang-3", kind: "language", sortOrder: 62, ...MANUAL, data: { language: "Portugués", level: "básico (A2)" } },

  /* ── PUBLICACIONES · el diferenciador ────────────────────────────────────
     La sección que la plantilla no ofrecía. Quien tiene un paper y no encuentra
     dónde ponerlo, no lo pone: y ese es justo el dato que le distingue. */
  {
    id: "ej-pub-1", kind: "publication", sortOrder: 70, ...MANUAL,
    data: {
      name: "Detección temprana de fugas en redes de agua potable con series temporales",
      description: "Ponencia en un congreso inventado de ingeniería de datos, revisada por pares.",
      url: "https://ejemplo.invalid/actas/2023/fugas.pdf",
      dates: "2023",
    },
  },
  { id: "ej-pub-1-v1", kind: "bullet", parentId: "ej-pub-1", sortOrder: 71, ...MANUAL, data: { text: "El conjunto de datos quedó público: 18 meses de telemetría de 240 sensores." } },

  { id: "ej-link-1", kind: "link", sortOrder: 80, ...MANUAL, data: { label: "Charla: cómo medimos la deuda técnica", url: "https://ejemplo.invalid/charlas/deuda-tecnica" } },
  { id: "ej-link-2", kind: "link", sortOrder: 81, ...MANUAL, data: { label: "Plantillas de ADR que usamos en el equipo", url: "https://ejemplo.invalid/adr" } },

  {
    id: "ej-ref-1", kind: "reference", sortOrder: 90, ...MANUAL,
    data: {
      name: "Camila Fuentes Aravena",
      role: "Jefa de Ingeniería",
      org: "Nubelar SpA",
      relation: "jefa directa",
      email: "camila.fuentes@ejemplo.invalid",
      phone: "+56 9 0000 0000",
    },
  },
];

/** El aviso que va arriba del todo. Va en comentario `corpus:`: no se importa. */
const BANNER = [
  "★ ESTO ES UN EJEMPLO. EL PERFIL ES INVENTADO.",
  "Valentina Ríos Mendoza no existe, ni sus empresas, ni sus cifras. Los",
  "correos y las webs usan el dominio reservado «.invalid», que no puede",
  "registrarse: no apuntan a nadie.",
  "",
  "Está aquí para que veas cómo queda cada campo bien puesto: una fecha que",
  "se entiende, una viñeta CON CIFRA, trece grupos de habilidades, una",
  "publicación, una referencia completa.",
  "",
  "BÓRRALO TODO Y ESCRIBE LO TUYO. Si lo subes tal cual, entrará este perfil",
  "inventado en tu master (en staging, y tendrías que confirmarlo item a",
  "item, pero no tiene ningún sentido).",
];

const NOTA_REFERENCIAS = [
  "Pídele permiso a la persona antes de incluirla. Son datos suyos, no tuyos.",
];

/**
 * Los grupos salen en la forma LARGA porque así es como los escribe el
 * exportador —y así los verá quien descargue su propio master—, pero a mano se
 * escriben en una línea. Decirlo aquí evita que alguien crea que la plantilla
 * vacía y esta enseñan dos formatos distintos: es el mismo, con dos atajos.
 */
const NOTA_HABILIDADES = [
  "Así los escribe Corpus al exportar. A mano vale también la forma corta,",
  "una línea por grupo: «Lenguajes: Python, TypeScript, SQL».",
];

/**
 * Inserta un comentario JUSTO DEBAJO de una línea exacta del fichero generado.
 * Se busca la línea completa (no un `includes`) para que un texto que casualmente
 * contenga «## REFERENCIAS» dentro de un valor no reciba el comentario.
 */
function insertarBajo(lineas: string[], ancla: string, bloque: string[]): string[] {
  const i = lineas.indexOf(ancla);
  if (i < 0) return lineas; // el ancla no está (esa sección no se generó): sin nota.
  return [...lineas.slice(0, i + 1), ...bloque, ...lineas.slice(i + 1)];
}

/**
 * La plantilla RELLENA: el mismo formato, con datos dentro. Es el serializador
 * de verdad más dos comentarios; nada de esto es un literal paralelo que pueda
 * desincronizarse del formato.
 */
export function plantillaEjemplo(): string {
  let lineas = exportarCorpusMd(PERFIL_EJEMPLO).split("\n");
  // El banner va tras la declaración de formato: lo primero que se lee.
  lineas = insertarBajo(lineas, `formato: ${FORMATO_ID}`, ["", ...comentarioCorpus(BANNER)]);
  // Los títulos salen del vocabulario, no de un literal: si mañana una sección
  // se llamara distinto, su nota la seguiría en vez de quedarse huérfana.
  for (const [kind, nota] of [["skill", NOTA_HABILIDADES], ["reference", NOTA_REFERENCIAS]] as const) {
    const titulo = seccionPorKind(kind)?.titulo;
    if (titulo) lineas = insertarBajo(lineas, `## ${titulo}`, comentarioCorpus(nota));
  }
  return lineas.join("\n");
}
