import type { Metadata } from "next";
import { TailorScreen } from "@/components/screens/TailorScreen";

export const metadata: Metadata = { title: "Corpus — Ajustar al aviso" };

// Adaptar una variante a un aviso — el alma ética: tres grupos, sin score.
// MURO (no monta aurora). Ver docs/spec/pantallas/tailor.md.
// La ruta es dinámica por [id]; en la maqueta el id se ignora.
export default function TailorPage() {
  return <TailorScreen />;
}
