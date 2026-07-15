import type { Metadata } from "next";
import { FuentesScreen } from "@/components/screens/FuentesScreen";

export const metadata: Metadata = { title: "Corpus — Fuentes · conexiones vivas" };

// MURO: inventario de las fuentes conectadas. Ver docs/spec/pantallas/fuentes.md.
export default function FuentesPage() {
  return <FuentesScreen />;
}
