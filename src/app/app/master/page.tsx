import type { Metadata } from "next";
import { MasterScreen } from "@/components/screens/MasterScreen";

export const metadata: Metadata = { title: "Corpus — Master" };

// El registro canónico completo — un editor, no un formulario. MURO: sin aurora.
// Ver docs/spec/pantallas/master.md y 04-pantallas/master.html.
export default function MasterPage() {
  return <MasterScreen />;
}
