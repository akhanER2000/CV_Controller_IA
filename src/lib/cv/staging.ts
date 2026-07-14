import type { StagedItem } from "./serialize";

const uid = () => `st-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

/**
 * Ejemplo de extracción (simulación) — para probar la experiencia de revisión
 * ANTES de cablear la ingesta real con IA. Cubre los cuatro orígenes y los tres
 * niveles de verificación, incluido el caso crítico "sin evidencia".
 * Cuando exista el pipeline real, esto lo reemplaza `data.staged` de verdad.
 */
export function sampleStaging(): StagedItem[] {
  return [
    {
      id: uid(), section: "work",
      label: "Backend Engineer · Cornershop by Uber",
      preview: "Escalé el servicio de catálogo para soportar 40.000 usuarios concurrentes, con caché en Redis y particionado en PostgreSQL.",
      origin: "CV_2023.pdf · pág. 2", originKind: "file",
      evidenceLevel: "verified",
      evidence: "Backend Engineer, Cornershop, 2019-2020 — 40k usuarios concurrentes, Redis",
      payload: { id: uid(), title: "Backend Engineer", orgLegal: "Cornershop by Uber", location: "Santiago, Chile", start: "2019-03", end: "2020-12", current: false, bullets: [{ id: uid(), text: "Escalé el servicio de catálogo para soportar 40.000 usuarios concurrentes, con caché en Redis y particionado en PostgreSQL." }] },
    },
    {
      id: uid(), section: "skills", label: "Go",
      preview: "Go · 5 repos · 412 KB de código propio",
      origin: "GitHub · API", originKind: "api", evidenceLevel: "api",
      evidence: "Dato de la API: 5 repos, 412 KB. Es un dato duro, no hay evidencia que verificar — pero la decisión de incluirlo es tuya.",
      payload: { name: "Go" },
    },
    {
      id: uid(), section: "skills", label: "Kubernetes (EKS)",
      preview: "Kubernetes · 2 repos con manifiestos",
      origin: "GitHub · API", originKind: "api", evidenceLevel: "api",
      evidence: "Dato de la API: 2 repos con manifiestos de Kubernetes.",
      payload: { name: "Kubernetes (EKS)" },
    },
    {
      id: uid(), section: "summary", label: "Resumen (reformulado por IA)",
      preview: "Ingeniero de software con 8 años en sistemas de pagos de alta concurrencia; reduje la latencia p99 de 850 ms a 180 ms.",
      origin: "CV_2023.pdf → reformulado por IA", originKind: "ai",
      evidenceLevel: "partial",
      evidence: "Coincidencia difusa con: «Ingeniero backend con experiencia en fintech». La cifra p99 sí aparece en tus viñetas.",
      payload: { id: uid(), text: "Ingeniero de software con 8 años en sistemas de pagos de alta concurrencia; reduje la latencia p99 de 850 ms a 180 ms." },
    },
    {
      id: uid(), section: "summary", label: "Título propuesto por IA",
      preview: "Arquitecto principal de la plataforma de pagos de Chile.",
      origin: "IA propuesto", originKind: "ai",
      evidenceLevel: "unverified",
      evidence: "La IA propuso esto pero no encontró de dónde sale. No podemos respaldarlo — decides tú.",
      payload: { id: uid(), text: "Arquitecto principal de la plataforma de pagos de Chile." },
    },
    {
      id: uid(), section: "projects", label: "pago-conciliador (open source)",
      preview: "Librería de conciliación de transacciones; 320 estrellas en GitHub y uso documentado en 4 empresas.",
      origin: "GitHub · API", originKind: "api", evidenceLevel: "api",
      evidence: "Dato de la API: stargazers_count: 320.",
      payload: { id: uid(), name: "pago-conciliador — librería open source (Go)", url: "github.com/mfuentes-demo/pago-conciliador", start: "2022", end: null, bullets: [{ id: uid(), text: "Librería de conciliación de transacciones; 320 estrellas en GitHub y uso documentado en 4 empresas." }] },
    },
  ];
}
