import type { Metadata } from "next";
import { StagingScreen } from "@/components/screens/StagingScreen";

export const metadata: Metadata = { title: "Corpus — Revisión (staging)" };

// Paso 2 de 2 de la ingesta: revisar item por item, con procedencia, y decidir
// qué entra al master. MURO (no aurora). Ver docs/spec/pantallas/staging.md.
export default function StagingPage() {
  return <StagingScreen />;
}
