#!/usr/bin/env node
// Genera el CV SINTÉTICO de «Partir de mi CV anterior» (DA-V7) en PDF (2 páginas)
// y en DOCX, con el MISMO contenido. Persona inventada.
//   node tests/fixtures/generar-cv-anterior.mjs
// Orden de secciones a propósito distinto del de por defecto (Experiencia antes
// que Aptitudes, sin resumen) para probar que la variante conserva el del CV.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";

const aqui = dirname(fileURLToPath(import.meta.url));

/** Cada bloque: [tipo, texto]. "salto" parte la página del PDF. */
export const CV = [
  ["h1", "Tomás Ibarra Lagos"],
  ["p", "Ingeniero de Datos"],
  ["p", "tomas.ibarra@ejemplo.cl · +56 9 5555 0101 · Valparaíso, Chile"],
  ["h2", "Experiencia"],
  ["h3", "Ingeniero de Datos — Puerto Digital SpA (mar 2022 – hoy)"],
  ["li", "Diseñé el lago de datos portuario en BigQuery para 14 terminales."],
  ["li", "Reduje el costo mensual de consultas en un 38 % con particionado por fecha."],
  ["li", "Automaticé la conciliación diaria de contenedores con Airflow."],
  ["h3", "Analista de Datos — Naviera Costa Brava (2019 – 2022)"],
  ["li", "Construí el tablero de puntualidad de recaladas usado por gerencia."],
  ["li", "Migré 120 reportes de Excel a SQL con pruebas automáticas."],
  ["salto"],
  ["h3", "Practicante de Analítica — Frutícola Valle Hondo (2018 – 2019)"],
  ["li", "Limpié la base histórica de exportaciones de cerezas de 2010 a 2018."],
  ["h2", "Formación"],
  ["h3", "Ingeniería Civil Informática — Universidad Técnica del Pacífico (2013 – 2018)"],
  ["h2", "Aptitudes"],
  ["p", "Datos: Python, SQL, BigQuery, Airflow, dbt"],
  ["p", "Idiomas: Español nativo, Inglés avanzado"],
  ["h2", "Certificaciones"],
  ["p", "Google Cloud Professional Data Engineer (2023)"],
];

const h = React.createElement;
const estilos = {
  h1: { fontSize: 20, marginBottom: 4 },
  h2: { fontSize: 14, marginTop: 14, marginBottom: 6 },
  h3: { fontSize: 11, marginTop: 8, marginBottom: 3 },
  li: { fontSize: 10, marginLeft: 12, marginBottom: 2 },
  p: { fontSize: 10, marginBottom: 2 },
};

async function pdf() {
  const paginas = [[]];
  for (const b of CV) {
    if (b[0] === "salto") paginas.push([]);
    else paginas[paginas.length - 1].push(b);
  }
  const doc = h(
    Document,
    { title: "CV Tomás Ibarra Lagos" },
    ...paginas.map((bloques, i) =>
      h(
        Page,
        { key: i, size: "A4", style: { padding: 48, fontFamily: "Helvetica" } },
        h(View, null, ...bloques.map(([t, txt], k) => h(Text, { key: k, style: estilos[t] }, t === "li" ? `• ${txt}` : txt))),
      ),
    ),
  );
  return renderToBuffer(doc);
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function docx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  const parrafos = CV.filter((b) => b[0] !== "salto")
    .map(([t, txt]) => {
      const negrita = t.startsWith("h") ? "<w:rPr><w:b/></w:rPr>" : "";
      return `<w:p><w:r>${negrita}<w:t xml:space="preserve">${esc(t === "li" ? `• ${txt}` : txt)}</w:t></w:r></w:p>`;
    })
    .join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parrafos}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

writeFileSync(join(aqui, "cv-anterior.pdf"), await pdf());
writeFileSync(join(aqui, "cv-anterior.docx"), await docx());
console.log("cv-anterior.pdf y cv-anterior.docx escritos en", aqui);
