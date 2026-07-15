import type { Metadata } from "next";
import { VariantesScreen } from "@/components/screens/VariantesScreen";

export const metadata: Metadata = { title: "Corpus — Variantes" };

// Vistas de tu master; los overrides tuyos ganan. Ver docs/spec/pantallas/variantes.md.
export default function VariantesPage() {
  return <VariantesScreen />;
}
