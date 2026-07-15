import type { Metadata } from "next";
import { ImportarScreen } from "@/components/screens/ImportarScreen";

export const metadata: Metadata = { title: "Corpus — Importar" };

// Puerta B del onboarding: vuélcalo. Ver docs/spec/pantallas/importar.md.
export default function ImportarPage() {
  return <ImportarScreen />;
}
