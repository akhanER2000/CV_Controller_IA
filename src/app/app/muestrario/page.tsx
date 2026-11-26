import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Muestrario } from "./Muestrario";

/* /app/muestrario — SOLO en desarrollo. En producción no existe (404): es el
   banco de pruebas de las piezas de Forja v2, con datos de prueba rotulados
   «ejemplo», y la regla del producto prohíbe cifras sin fuente real en la UI. */

export const metadata: Metadata = { title: "Corpus — Muestrario", robots: { index: false } };

export default function MuestrarioPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Muestrario />;
}
