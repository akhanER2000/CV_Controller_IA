import type { Metadata } from "next";
import { AjustesScreen } from "@/components/screens/AjustesScreen";

export const metadata: Metadata = { title: "Corpus — Ajustes" };

// MURO. Tema (en vivo) · IA (modo manual) · BYOK · exportar · borrar.
// Ver docs/spec/pantallas/ajustes.md.
export default function AjustesPage() {
  return <AjustesScreen />;
}
