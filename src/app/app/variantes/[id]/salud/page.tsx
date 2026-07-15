import type { Metadata } from "next";
import { SaludScreen } from "@/components/screens/SaludScreen";

export const metadata: Metadata = { title: "Corpus — Salud" };

// Salud de una variante. MURO (sin aurora). Ver docs/spec/pantallas/salud.md.
// El [id] del route se ignora en la maqueta (spec §12).
export default function SaludVariantePage() {
  return <SaludScreen />;
}
