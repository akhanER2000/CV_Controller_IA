import type { Metadata } from "next";
import { TailorScreen } from "@/components/screens/TailorScreen";

export const metadata: Metadata = { title: "Corpus — Adaptar al aviso" };

// Adaptar una variante a un aviso — el alma ética: tres grupos, sin score.
// Pantalla CABLEADA (bloque C): pega/sube/enlaza el aviso → análisis en tres grupos.
// La ruta es dinámica por [id]: el id ES la variante que se adapta (no se ignora).
export default function TailorPage() {
  return <TailorScreen />;
}
