import type { Metadata } from "next";
import { IngestaScreen } from "@/components/screens/IngestaScreen";

export const metadata: Metadata = { title: "Corpus — Leyendo tus fuentes" };

// La espera como ruta propia. Ver docs/spec/pantallas/ingesta.md.
export default function IngestaPage() {
  return <IngestaScreen />;
}
